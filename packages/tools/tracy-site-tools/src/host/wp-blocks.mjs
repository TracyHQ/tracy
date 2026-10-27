/**
 * W2 — A WORDPRESS BODY BY ITS BLOCKS: read one block, change one block, never the whole page.
 *
 * 🔒 WHY. A post's `post_content` (and a template part's `content`) is written WHOLE: to change one
 * section the model read the page and sent every block back. Measured on the 26/09 WordPress traces:
 * four steps of one turn generated 64,000 tokens and took 189 s re-sending bodies of 15–27k characters
 * to change a few blocks — and six r2 cases cut a live page doing it (D6′). Here the model names the
 * top-level blocks it changes, by their position in the body as read (`outlineOf`), and sends only
 * their markup; the host splices them into the body it reads itself, and the write goes through the
 * same body guard every whole-body write does (`site-call.mjs`: BLOCK_MARKUP, BODY_SHRINK).
 *
 * 🔒 A BLOCK IS CHANGED BY A PATCH, NOT RE-TYPED (v6, 29/09/2026). One element of a 12.4k-character
 * `core/html` block cost 26.8 s and 8.1k output tokens to re-send (WordPress L2-02; L3-02 44 s), while a
 * `content.replace` of 139 characters took 2 s. A key may be the block's own `metadata.name`, and its
 * value `{find, replace}` (find stands once in that block) or `{attrs:{…}}` (merged into the block's
 * attributes): the host applies it to the markup it read, and the whole body goes through the same guard.
 *
 * The positions are WordPress's own top-level blocks, as `parse_blocks` sees them
 * (`wp-includes/class-wp-block-parser.php`): a block comment and everything to its closer, a void
 * block, and any non-blank HTML between blocks (a freeform block). Nested blocks are part of their
 * parent. Pure: no I/O.
 *
 * 🔒 A POSITION IS A POSITION IN ONE BODY, SO IT TRAVELS WITH THAT BODY'S `rev` (01/10/2026). The model
 * reads an outline, and the host reads the body again when it writes. A page that changed in between —
 * a block added on top in WordPress admin, another conversation's write — moved every position, and the
 * old numbers were applied to the new body: the wrong block replaced, no error anywhere. An outline and a
 * block read carry `rev` ({@link revOf}), and a write by position must send it back: the host compares it
 * with the body it reads at write time and refuses `REVISION_STALE` when they differ (`site-call.mjs`).
 */

import { createHash } from 'node:crypto'

import { decodeEntities } from './html-units.mjs'
import { isPlainObject, mergePatch } from './merge-patch.mjs'

/** One WordPress block delimiter anywhere in a body, the same grammar `blockMarkupProblem` holds. */
const DELIMITER =
  /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(?:(\{(?:(?!-->|<!--)[\s\S])*?\})\s+)?(\/)?-->/g

/** How much of a block's words an outline row shows. */
const TEXT_CHARS = 60

/**
 * The query keys that decide WHICH posts a query block lists: an outline row shows them first, and whole,
 * whatever else it has to leave out.
 */
const QUERY_FIRST = Object.freeze(['postType', 'taxQuery', 'inherit'])

/** How many characters of a query block's `query` attribute an outline row adds keys up to. */
const QUERY_CHARS = 400

/**
 * @typedef {{ start: number, end: number, name: string | null }} Span
 *   one top-level block: `[start, end)` in the body, its name (`core/paragraph`, `tracy/hero`), null
 *   for freeform HTML between blocks.
 */

/**
 * The revision of a body: the first 12 hex characters of the sha256 of the string exactly as the plugin
 * answered it (UTF-8, nothing trimmed or normalised). Twelve characters are 48 bits: enough to tell two
 * states of one record apart, short enough to send back on every block write.
 * @param {string} body
 * @returns {string}
 */
export function revOf(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 12)
}

/** A `rev` as {@link revOf} makes it. */
export const REV = /^[0-9a-f]{12}$/

/** A key of `blocks` that names a position: `"<i>"` changes block i, `"+<i>"` inserts before it. */
const POSITION_KEY = /^(\+)?(\d{1,4})$/

/**
 * Whether `edits` names any block by its position — the edits that mean nothing without the body they
 * were counted in, and so need its `rev`. A key that is a block's own `metadata.name` finds its block by
 * what it holds, wherever the block now stands.
 * @param {unknown} edits
 * @returns {boolean}
 */
export function byPosition(edits) {
  return isPlainObject(edits) && Object.keys(edits).some((key) => POSITION_KEY.test(key))
}

/**
 * A registered block pattern's name as the plugin reads one (`themePattern`, claude-cowork
 * `class-claude-cowork-writers.php`): `theme/hero`, or a bare `hero`.
 */
const PATTERN_NAME = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/i

/** How many patterns one write may insert by name: each is one read when the write is made. */
export const PATTERNS_PER_WRITE = 8

/**
 * The registered patterns `edits` inserts by name, in the order first named, or why the edit cannot name
 * one. An insert's value — `"+<i>"` — may be `{pattern:"<name>"}`, or a list mixing markup strings and
 * such objects; the host reads each pattern's markup when it writes (`site-call.mjs`) and inserts it as
 * it inserts markup (01/10/2026). A pattern on any other key is refused: a pattern adds a section, and
 * the block it would replace is dropped by `"<i>": null`.
 *
 * 🔒 THE INSERT IS A COPY. A registered pattern lives in the theme's (or a plugin's) PHP and is read-only;
 * what goes into the page is its markup as the site holds it now, an independent copy the page then owns.
 * @param {unknown} edits
 * @returns {{ ok: true, names: string[] } | { ok: false, code: 'BAD_PARAMS', param: string, error: string }}
 */
export function patternsOf(edits) {
  /** @type {string[]} */
  const names = []
  if (!isPlainObject(edits)) return { ok: true, names }
  for (const [key, value] of Object.entries(edits)) {
    const insert = POSITION_KEY.exec(key)?.[1] === '+'
    for (const piece of insert && Array.isArray(value) ? value : [value]) {
      if (!isPlainObject(piece) || !Object.hasOwn(piece, 'pattern')) continue
      const param = `blocks.${key}`
      if (!insert)
        return {
          ok: false,
          code: 'BAD_PARAMS',
          param,
          error:
            'a pattern is inserted: put {pattern} on "+<i>"; "<i>":null drops the block it takes the place of'
        }
      const name = typeof piece.pattern === 'string' ? piece.pattern.trim() : ''
      if (Object.keys(piece).length !== 1 || !PATTERN_NAME.test(name))
        return {
          ok: false,
          code: 'BAD_PARAMS',
          param,
          error:
            'a pattern is {pattern:"<name>"}, the name as content.list {kind:"pattern"} lists it, and nothing else'
        }
      if (!names.includes(name)) names.push(name)
    }
  }
  if (names.length > PATTERNS_PER_WRITE)
    return {
      ok: false,
      code: 'BAD_PARAMS',
      param: 'blocks',
      error: `one write inserts at most ${PATTERNS_PER_WRITE} patterns by name; this one names ${names.length}`
    }
  return { ok: true, names }
}

/**
 * The top-level blocks of `body`, in order, or null when its block comments do not nest (an opener
 * with no closer, a closer with no opener): such a body has no positions to name.
 * @param {string} body
 * @returns {Span[] | null}
 */
export function topBlocks(body) {
  /** @type {Span[]} */
  const out = []
  /** @type {string[]} */
  const open = []
  let start = -1
  let last = 0
  /** @param {number} to */
  const freeform = (to) => {
    const chunk = body.slice(last, to)
    if (chunk.trim() !== '') {
      const lead = chunk.length - chunk.trimStart().length
      const tail = chunk.length - chunk.trimEnd().length
      out.push({ start: last + lead, end: to - tail, name: null })
    }
  }
  DELIMITER.lastIndex = 0
  for (let m = DELIMITER.exec(body); m !== null; m = DELIMITER.exec(body)) {
    const closer = m[1] === '/'
    const name = m[2].includes('/') ? m[2] : `core/${m[2]}`
    const self = m[4] === '/'
    const end = m.index + m[0].length
    if (closer) {
      if (open.length === 0 || open.at(-1) !== name) return null
      open.pop()
      if (open.length === 0) {
        out.push({ start, end, name })
        last = end
      }
      continue
    }
    if (open.length === 0) {
      freeform(m.index)
      if (self) {
        out.push({ start: m.index, end, name })
        last = end
        continue
      }
      start = m.index
    }
    if (!self) open.push(name)
  }
  if (open.length > 0) return null
  freeform(body.length)
  return out
}

/**
 * Which top-level blocks of `before` a whole-body write to `after` changes or takes out: the blocks
 * between the longest run both bodies open with and the longest run they end with, compared as text
 * (whitespace between blocks ignored). New blocks put in at one place touch none. Null when either body
 * has no positions ({@link topBlocks}).
 *
 * 🔒 WHY (20/10/2026). A `post_content` write replaces the WHOLE body, and the body guard measured only
 * its length. Staff on real customer sites: "when Tracy fixes one place it often breaks another place" —
 * a page re-typed to change one section came back with another section's words or attributes moved, and
 * nothing said so. `site-call.mjs` refuses the model's own whole-body write that touches two or more
 * existing blocks and sends it to `blocks`, the road that names each one.
 * @param {string} before
 * @param {string} after
 * @returns {{ touched: number[], of: number } | null}
 */
export function blocksTouched(before, after) {
  const was = topBlocks(before)
  const now = topBlocks(after)
  if (was === null || now === null) return null
  const a = was.map((x) => before.slice(x.start, x.end))
  const b = now.map((x) => after.slice(x.start, x.end))
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail += 1
  const touched = []
  for (let i = head; i < a.length - tail; i += 1) touched.push(i)
  return { touched, of: a.length }
}

/**
 * The attributes of every `wp:query` block of `body`, in order (`{}` for a block that carries none), or
 * null when the body has no listing that can be read: a query inside another query (a per-post list, not
 * the page's own), an attribute string that is not one JSON object, comments that do not nest.
 *
 * 🔒 WHY. A listing page says what it lists in this block, and `content.read {view:"pages", url}` on such a
 * page is where the customer's add starts: the first call is answered with the call that adds to it
 * (`page-lists.mjs`). An empty list means the page has no query — a page that lists nothing it can name — and
 * is told apart from null, a body that has one nobody can read. Pure: no I/O.
 * @param {unknown} body
 * @returns {Record<string, unknown>[] | null}
 */
export function queryAttrs(body) {
  if (typeof body !== 'string') return null
  /** @type {Record<string, unknown>[]} */
  const found = []
  /** @type {string[]} */
  const open = []
  DELIMITER.lastIndex = 0
  for (let m = DELIMITER.exec(body); m !== null; m = DELIMITER.exec(body)) {
    const name = m[2].includes('/') ? m[2] : `core/${m[2]}`
    if (m[1] === '/') {
      if (open.length === 0 || open.at(-1) !== name) return null
      open.pop()
      continue
    }
    if (name === 'core/query') {
      if (open.includes('core/query')) return null
      /** @type {Record<string, unknown>} */
      let attrs = {}
      if (m[3] !== undefined) {
        try {
          const parsed = JSON.parse(m[3])
          if (!isPlainObject(parsed)) return null
          attrs = parsed
        } catch {
          return null
        }
      }
      found.push(attrs)
    }
    if (m[4] !== '/') open.push(name)
  }
  return open.length > 0 ? null : found
}

/**
 * The words a block shows, as one line.
 * @param {string} markup
 */
function wordsOf(markup) {
  return decodeEntities(markup.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One row per top-level block: its position, its name, its length and the start of its words — what
 * the model needs to name a block, never its markup (`content.get {…, block:<i>}` gives that).
 *
 * 🔒 F6 (round 7 follow-up, 30/09/2026): A QUERY BLOCK'S ROW SAYS WHAT IT LISTS. The row of a
 * `core/query` block was `{i, block, chars, text:"Nothing here yet."}` — the words of its empty state — and
 * the model read the whole block (`block:<i>`, 2.5k characters with the record's own columns) to learn the
 * one thing it came for: which posts the page shows (`postType`, a category filter, `inherit`), and so where
 * a new one must go to appear there. `query` is the block's own `query` attribute; {@link QUERY_FIRST}
 * come first and whole, the other keys while they fit {@link QUERY_CHARS}, and `queryMore` counts the keys
 * left out. Only a top-level `core/query` has it: the outline is the top level, and another block's attribute
 * named `query` (`core/search`) is not a listing.
 * @param {string} body
 * @returns {{ i: number, block: string, chars: number, text: string, query?: Record<string, unknown>, queryMore?: number }[] | null}
 */
export function outlineOf(body) {
  const spans = topBlocks(body)
  if (spans === null) return null
  return spans.map((s, i) => {
    const words = wordsOf(body.slice(s.start, s.end))
    return {
      i,
      block: s.name ?? 'freeform',
      chars: s.end - s.start,
      text: words.length > TEXT_CHARS ? `${words.slice(0, TEXT_CHARS - 1)}…` : words,
      ...(s.name === 'core/query' ? queryRow(body, s) : {})
    }
  })
}

/**
 * The `query` and `queryMore` an outline row carries for the query block at `span`, or nothing when the
 * block has no `query` attribute that is a non-empty object (or its attributes are not JSON).
 * @param {string} body
 * @param {Span} span
 * @returns {{ query?: Record<string, unknown>, queryMore?: number }}
 */
function queryRow(body, span) {
  const query = openerAt(body, span)?.attrs.query
  if (!isPlainObject(query)) return {}
  const keys = Object.keys(query)
  if (keys.length === 0) return {}
  const ordered = [
    ...QUERY_FIRST.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !QUERY_FIRST.includes(k))
  ]
  /** @type {Record<string, unknown>} */
  const shown = {}
  let size = 2
  for (const key of ordered) {
    const add = JSON.stringify(key).length + JSON.stringify(query[key]).length + 2
    if (!QUERY_FIRST.includes(key) && size + add > QUERY_CHARS) continue
    shown[key] = query[key]
    size += add
  }
  const left = keys.length - Object.keys(shown).length
  return { query: shown, ...(left > 0 ? { queryMore: left } : {}) }
}

/**
 * The markup of the blocks at `positions`, as `{i, markup}`, or an error naming the first position
 * the body does not have.
 * @param {string} body
 * @param {readonly number[]} positions
 * @returns {{ ok: true, blocks: { i: number, block: string, markup: string }[] } | { ok: false, error: string, count: number }}
 */
export function blocksAt(body, positions) {
  const spans = topBlocks(body)
  if (spans === null) return { ok: false, error: 'its block comments do not nest', count: 0 }
  /** @type {{ i: number, block: string, markup: string }[]} */
  const blocks = []
  for (const i of positions) {
    const s = Number.isInteger(i) ? spans[i] : undefined
    if (s === undefined)
      return { ok: false, error: `there is no block ${i}: the body has ${spans.length}`, count: spans.length }
    blocks.push({ i, block: s.name ?? 'freeform', markup: body.slice(s.start, s.end) })
  }
  return { ok: true, blocks }
}

/** One block's own opening comment, sticky at the block's start (the grammar of `DELIMITER`). */
const OPENER =
  /<!--\s+wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(?:(\{(?:(?!-->|<!--)[\s\S])*?\})\s+)?(\/)?-->/y

/**
 * The opening comment of the block at `span`: its name as written, its attributes (`{}` when it has
 * none), whether it is a void block, and where the comment ends. Null for freeform HTML, or when the
 * attributes are not one JSON object.
 * @param {string} body
 * @param {Span} span
 * @returns {{ rawName: string, attrs: Record<string, unknown>, isVoid: boolean, end: number } | null}
 */
function openerAt(body, span) {
  if (span.name === null) return null
  OPENER.lastIndex = span.start
  const m = OPENER.exec(body)
  if (m === null || m.index !== span.start) return null
  /** @type {Record<string, unknown>} */
  let attrs = {}
  if (m[2] !== undefined) {
    try {
      const parsed = JSON.parse(m[2])
      if (!isPlainObject(parsed)) return null
      attrs = parsed
    } catch {
      return null
    }
  }
  return { rawName: m[1], attrs, isVoid: m[3] === '/', end: m.index + m[0].length }
}

/**
 * A key of `blocks` as a block: a position `"<i>"`, an insert `"+<i>"`, or a block's own
 * `metadata.name` (the one block of the body that carries it).
 * @param {Span[]} spans
 * @param {string} body
 * @param {string} key
 * @returns {{ ok: true, i: number, insert: boolean } | { ok: false, error: string, count?: number }}
 */
function resolveKey(spans, body, key) {
  const count = spans.length
  const m = POSITION_KEY.exec(key)
  if (m !== null) {
    const i = Number(m[2])
    const insert = m[1] === '+'
    if (i > count || (!insert && i === count))
      return {
        ok: false,
        count,
        error: `there is no block ${i}: the body has ${count} (0–${count - 1}); "+${count}" adds at the end`
      }
    return { ok: true, i, insert }
  }
  /** @type {number[]} */
  const named = []
  spans.forEach((s, i) => {
    const o = openerAt(body, s)
    if (o !== null && isPlainObject(o.attrs.metadata) && o.attrs.metadata.name === key) named.push(i)
  })
  if (named.length === 1) return { ok: true, i: named[0], insert: false }
  const shown = key.slice(0, 60)
  return {
    ok: false,
    error:
      named.length === 0
        ? `"${shown}" is not a block position or a block's metadata.name here: "<i>" changes block i, "+<i>" inserts before it`
        : `${named.length} blocks are named "${shown}": change the one you mean by its position "<i>"`
  }
}

/**
 * The top-level attributes `{attrs}` may change on a block with saved HTML (one that closes with its own
 * `<!-- /wp:name -->`), by block: the keys WordPress keeps in the comment alone. `metadata` (the block's
 * name, its bindings) and `lock` on every block; `query` on `core/query`, whose saved HTML is only the
 * wrapper of what it lists.
 */
const COMMENT_ONLY_ATTRS = Object.freeze(['metadata', 'lock'])
/** @param {string | null} name */
const commentOnlyAttrs = (name) =>
  name === 'core/query' ? [...COMMENT_ONLY_ATTRS, 'query'] : COMMENT_ONLY_ATTRS

/** A picture's file name as a page or a check shows it, its size or `-scaled` WordPress cut and its type left out. */
const pictureName = (/** @type {string} */ file) =>
  String(file)
    .split(/[?#]/)[0]
    .split('/')
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, '')
    .replace(/-(?:\d+x\d+|scaled)$/i, '') ?? ''

/**
 * 🔒 A PICTURE IN A BLOCK IS SWAPPED, NOT THE BLOCK RE-TYPED (local round 36, 26/10/2026). A WordPress build put its
 * photos into the template's sections by sending each section back whole: 19 writes, 124,000 characters typed to change
 * a few `src`, and each retyped section was one more chance to lose a wrapper or a class (native-structure). `pictures`
 * maps a picture the block shows — its file, or the file name a check names — to the new one, `"<path>"` or
 * `{path, attachmentId}` (what `tracy_demo media.import` answers). In every `<img>` and `url()` showing it, the
 * address becomes the new path (its origin and leading slash kept), the `<img>`'s `srcset` and `sizes` go (they list
 * the old picture's sizes), and its attachment — the `wp-image-<id>` class and the image block's `"id"` — becomes the
 * new one, or is taken out when none is given: WordPress rebuilds `srcset` from that id, so an old one would bring the
 * template's picture back on wide screens.
 * @param {string} markup @param {unknown} pictures
 * @returns {{ ok: true, markup: string } | { ok: false, code: 'BAD_PARAMS' | 'NOT_FOUND', error: string }}
 */
function swapPictures(markup, pictures) {
  if (!isPlainObject(pictures) || Object.keys(pictures).length === 0)
    return {
      ok: false,
      code: 'BAD_PARAMS',
      error:
        'pictures is {"<the picture the block shows>": "<new path>" | {path, attachmentId}}, at least one'
    }
  let out = markup
  for (const [from, to] of Object.entries(pictures)) {
    const path = typeof to === 'string' ? to : isPlainObject(to) && typeof to.path === 'string' ? to.path : ''
    const id =
      isPlainObject(to) &&
      typeof to.attachmentId === 'number' &&
      Number.isInteger(to.attachmentId) &&
      to.attachmentId > 0
        ? to.attachmentId
        : null
    const name = pictureName(from)
    if (name.length < 3 || !/\.(?:jpe?g|png|webp|gif|avif|svg)(?:[?#]|$)/i.test(path))
      return {
        ok: false,
        code: 'BAD_PARAMS',
        error: `pictures: "${String(from).slice(0, 60)}" goes to a picture's path (media.import answers it), not "${path.slice(0, 60)}"`
      }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const address = new RegExp(
      `((?:https?:)?//[^\\s"'()<>/]+/|/)?((?:[^\\s"'()<>,]*/)?${escaped}(?:-\\d+x\\d+|-scaled)?\\.(?:jpe?g|png|webp|gif|avif|svg)(?:\\?[^\\s"'()<>]*)?)`,
      'gi'
    )
    const target = path.replace(/^\/+/, '')
    const at = (/** @type {string | undefined} */ origin) => `${origin ?? ''}${target}`
    let found = 0
    // Each <img> showing it: its address, no srcset or sizes, its attachment.
    out = out.replace(/<img\b[^>]*>/gi, (tag) => {
      address.lastIndex = 0
      if (!address.test(tag)) return tag
      found += 1
      let changed = tag
        .replace(/\s(?:srcset|sizes)\s*=\s*("[^"]*"|'[^']*')/gi, '')
        .replace(address, (_m, origin) => at(origin))
      changed =
        id === null
          ? changed.replace(/\s*\bwp-image-\d+\b/g, '')
          : changed.replace(/\bwp-image-\d+\b/g, `wp-image-${id}`)
      return changed.replace(/\sclass=(["'])\s*\1/g, '')
    })
    // Each CSS url() and each other address of it (a cover block's `url` attribute, a background in a style).
    out = out.replace(address, (_whole, origin) => {
      found += 1
      return at(origin)
    })
    if (found === 0)
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: `"${String(from).slice(0, 60)}" is not a picture this block shows: content.get {…, block:<i>} shows its markup as stored`
      }
    // The image or cover block that holds it names the same attachment in its comment.
    out = out.replace(
      /<!--\s+wp:(image|cover)\s+(\{[\s\S]*?\})\s+-->(\s*<(?:figure|div)\b[\s\S]*?<\/(?:figure|div)>)/g,
      (whole, block, attrs, figure) => {
        if (!figure.includes(target) && !String(attrs).includes(target)) return whole
        let parsed
        try {
          parsed = JSON.parse(attrs)
        } catch {
          return whole
        }
        if (id === null) delete parsed.id
        else parsed.id = id
        const json = Object.keys(parsed).length ? ` ${JSON.stringify(parsed)}` : ''
        return `<!-- wp:${block}${json} -->${figure}`
      }
    )
  }
  return { ok: true, markup: out }
}

/**
 * One block changed by a patch instead of its whole markup: `{find, replace}` (find stands exactly
 * once in the block's markup) or `{attrs:{…}}` (merged into the block's own attributes, RFC 7386: a
 * key set to null is removed). The result must still be whole blocks, like any replacement.
 *
 * 🔒 `{attrs}` CHANGES ONLY WHAT LIVES IN THE COMMENT ALONE (E2E before pass, 01/10/2026, Twenty
 * Twenty-Five on WordPress 7.1.2). A block with saved HTML holds most attributes twice — in its comment
 * and in its HTML — and a merge into the comment alone was measured two ways, both silent: `level` on
 * `core/heading` and `verticalAlignment` on `core/columns` made the block INVALID in the editor ("unexpected
 * or invalid content"); `url` on `core/button`, `sizeSlug` on `core/image` and `tagName` on `core/group`
 * stayed valid and changed nothing the visitor sees, while the write answered ok. So on such a block only
 * {@link commentOnlyAttrs} are merged, and any other key is refused `ATTRS_IN_HTML` by name — the way on is
 * the block's markup with the change made in both places. A void block (`<!-- wp:name {…} /-->`, a dynamic
 * block rendered by PHP) keeps every attribute in its comment and takes any key.
 * @param {string} body
 * @param {Span} span
 * @param {Record<string, unknown>} value
 * @returns {{ ok: true, markup: string } | { ok: false, code: 'BAD_PARAMS' | 'BLOCK_MARKUP' | 'NOT_FOUND' | 'AMBIGUOUS' | 'ATTRS_IN_HTML', error: string, keys?: string[] }}
 */
function applyBlockPatch(body, span, value) {
  if (Object.hasOwn(value, 'pictures')) {
    if (Object.keys(value).length !== 1)
      return {
        ok: false,
        code: 'BAD_PARAMS',
        error:
          'a block is its markup, null, {find, replace}, {attrs:{…}} or {pictures:{…}} — one of them, nothing else in it'
      }
    const swapped = swapPictures(body.slice(span.start, span.end), value.pictures)
    if (!swapped.ok) return swapped
    const problem = wholeBlocksProblem(swapped.markup)
    if (problem !== null) return { ok: false, code: problem.code, error: problem.error }
    return { ok: true, markup: swapped.markup }
  }
  const hasFind = Object.hasOwn(value, 'find')
  const hasAttrs = Object.hasOwn(value, 'attrs')
  const allowed = hasFind ? ['find', 'replace'] : ['attrs']
  if (hasFind === hasAttrs || Object.keys(value).some((k) => !allowed.includes(k)))
    return {
      ok: false,
      code: 'BAD_PARAMS',
      error: 'a block is its markup, null, {find, replace} or {attrs:{…}} — one of them, nothing else in it'
    }
  const markup = body.slice(span.start, span.end)
  /** @type {string} */
  let patched
  if (hasFind) {
    const { find, replace } = value
    if (typeof find !== 'string' || find === '' || typeof replace !== 'string')
      return {
        ok: false,
        code: 'BAD_PARAMS',
        error: 'find is the text to change (not empty), replace what it becomes'
      }
    const times = markup.split(find).length - 1
    if (times === 0)
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: `"${find.slice(0, 60)}" is not in this block: content.get {…, block:<i>} shows its markup as stored`
      }
    if (times > 1)
      return {
        ok: false,
        code: 'AMBIGUOUS',
        error: `"${find.slice(0, 60)}" is in this block ${times} times: find a longer piece that stands once`
      }
    patched = markup.replace(find, () => replace)
  } else {
    const { attrs } = value
    if (!isPlainObject(attrs) || Object.keys(attrs).length === 0)
      return {
        ok: false,
        code: 'BAD_PARAMS',
        error: 'attrs is an object of the attributes to change (null removes one)'
      }
    const opener = openerAt(body, span)
    if (opener === null)
      return {
        ok: false,
        code: 'BLOCK_MARKUP',
        error:
          'this block has no attributes to merge into (freeform HTML, or unreadable): send its markup instead'
      }
    if (!opener.isVoid) {
      const allowed = commentOnlyAttrs(span.name)
      const keys = Object.keys(attrs).filter((key) => !allowed.includes(key))
      if (keys.length > 0) {
        // Two names of at most 20 characters keep the sentence within T10's 160; `keys` holds them all.
        const named = keys
          .slice(0, 2)
          .map((key) => key.slice(0, 20))
          .join(', ')
        return {
          ok: false,
          code: 'ATTRS_IN_HTML',
          keys,
          error: `${named}${keys.length > 2 ? ', …' : ''} ${keys.length === 1 ? 'is' : 'are'} in this block's HTML too: changed in its comment alone, the block breaks or the page does not change`
        }
      }
    }
    const merged = /** @type {Record<string, unknown>} */ (mergePatch(opener.attrs, attrs))
    const json = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : ''
    patched = `<!-- wp:${opener.rawName}${json} ${opener.isVoid ? '/-->' : '-->'}${body.slice(opener.end, span.end)}`
  }
  const problem = wholeBlocksProblem(patched)
  if (problem !== null) return { ok: false, code: problem.code, error: problem.error }
  return { ok: true, markup: patched }
}

/**
 * @typedef {{ ok: true, body: string, replaced: number[], dropped: number[], inserted: number[] }
 *   | { ok: false, code: 'BAD_PARAMS' | 'BLOCK_MARKUP' | 'NOT_FOUND' | 'AMBIGUOUS' | 'ATTRS_IN_HTML', error: string, param?: string, count?: number, keys?: string[], block?: number }} EditResult
 *   `keys` and `block` (an `ATTRS_IN_HTML` refusal): the attributes refused, and the position of the block.
 */

/**
 * Apply `edits` to `body`: `"<i>": "<markup>"` replaces block i, `"<i>": null` drops it, and
 * `"+<i>": "<markup>"` (or a list of markups) inserts before block i — `"+<count>"` at the end. Every
 * position is block i of the body AS READ, so the edits of one call never shift one another. An insert's
 * piece may be `{pattern:"<name>"}`: its markup is `patterns.get(name)`, as the caller read it
 * ({@link patternsOf} names them).
 *
 * 🔒 THE NEW MARKUP MUST BE WHOLE BLOCKS. A replacement or an insert that is not one or more complete
 * top-level blocks (a closer missing, a stray `-->`) would leave the page parsing differently from
 * what the model meant; it is refused here, naming the key, before anything is read back or sent. A
 * pattern's own markup is held to the same rule.
 * @param {string} body
 * @param {unknown} edits
 * @param {ReadonlyMap<string, string>} [patterns] - each pattern's markup, by its name.
 * @returns {EditResult}
 */
export function applyBlockEdits(body, edits, patterns = new Map()) {
  if (edits === null || typeof edits !== 'object' || Array.isArray(edits) || Object.keys(edits).length === 0)
    return {
      ok: false,
      code: 'BAD_PARAMS',
      param: 'blocks',
      error: 'blocks is {"<i>":"<markup>"|null, "+<i>":"<markup>"}: at least one block to change'
    }
  const spans = topBlocks(body)
  if (spans === null)
    return {
      ok: false,
      code: 'BLOCK_MARKUP',
      error: 'the stored body has block comments that do not nest: send the whole body instead'
    }
  const count = spans.length
  /** @type {{ at: number, end: number, put: string, order: number, i: number, kind: 'replace' | 'drop' | 'insert' }[]} */
  const ops = []
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (edits))) {
    const at = resolveKey(spans, body, key)
    if (!at.ok)
      return {
        ok: false,
        code: 'BAD_PARAMS',
        param: `blocks.${key}`,
        ...(at.count !== undefined ? { count: at.count } : {}),
        error: at.error
      }
    const { i, insert } = at
    if (!insert && value === null) {
      ops.push({ at: spans[i].start, end: spans[i].end, put: '', order: 0, i, kind: 'drop' })
      continue
    }
    if (!insert && isPlainObject(value)) {
      const patched = applyBlockPatch(body, spans[i], value)
      if (!patched.ok)
        return {
          ok: false,
          code: patched.code,
          param: `blocks.${key}`,
          error: patched.error,
          ...(patched.keys ? { keys: patched.keys, block: i } : {})
        }
      ops.push({ at: spans[i].start, end: spans[i].end, put: patched.markup, order: 0, i, kind: 'replace' })
      continue
    }
    /** @type {string[]} */
    const markups = []
    for (const piece of insert && Array.isArray(value) ? value : [value]) {
      const named =
        insert && isPlainObject(piece) && typeof piece.pattern === 'string' ? piece.pattern.trim() : null
      const markup = named === null ? piece : patterns.get(named)
      if (named !== null && markup === undefined)
        return {
          ok: false,
          code: 'BAD_PARAMS',
          param: `blocks.${key}`,
          error: `the pattern "${named.slice(0, 60)}" was not read`
        }
      const problem = wholeBlocksProblem(markup)
      if (problem !== null)
        return {
          ok: false,
          code: problem.code,
          param: `blocks.${key}`,
          error:
            named === null
              ? problem.error
              : `the pattern "${named.slice(0, 60)}" is not whole blocks as this site holds it`
        }
      markups.push(/** @type {string} */ (markup))
    }
    const markup = markups.map((p) => p.trim()).join('\n\n')
    if (insert) {
      const at = i === count ? body.trimEnd().length : spans[i].start
      ops.push({
        at,
        end: at,
        put: i === count ? `\n\n${markup}` : `${markup}\n\n`,
        order: 1,
        i,
        kind: 'insert'
      })
    } else ops.push({ at: spans[i].start, end: spans[i].end, put: markup, order: 0, i, kind: 'replace' })
  }
  // From the end of the body back, a replacement before an insert at the same place, so no offset moves.
  ops.sort((a, b) => b.at - a.at || a.order - b.order)
  let out = body
  for (const op of ops) {
    let end = op.end
    // A dropped block takes the blank run after it, so no double gap is left where it stood.
    if (op.kind === 'drop') while (end < out.length && /\s/.test(out[end])) end += 1
    out = out.slice(0, op.at) + op.put + out.slice(end)
  }
  /** @param {'replace' | 'drop' | 'insert'} kind */
  const which = (kind) =>
    ops
      .filter((o) => o.kind === kind)
      .map((o) => o.i)
      .sort((a, b) => a - b)
  return {
    ok: true,
    body: out,
    replaced: which('replace'),
    dropped: which('drop'),
    inserted: which('insert')
  }
}

/**
 * Why `markup` is not one or more whole top-level blocks, or null.
 * @param {unknown} markup
 * @returns {{ code: 'BAD_PARAMS' | 'BLOCK_MARKUP', error: string } | null}
 */
function wholeBlocksProblem(markup) {
  if (typeof markup !== 'string' || markup.trim() === '')
    return { code: 'BAD_PARAMS', error: 'a block is its markup as one string (null drops it)' }
  const spans = topBlocks(markup)
  if (spans === null || spans.length === 0)
    return {
      code: 'BLOCK_MARKUP',
      error: 'this markup is not whole blocks: every <!-- wp:name --> needs its <!-- /wp:name -->'
    }
  return null
}
