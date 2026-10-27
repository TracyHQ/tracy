/**
 * WHICH RECORD PRINTED THIS ELEMENT: `content.locate` (comment → edit, P5 of
 * `tasks/todo-comment-to-edit.md`).
 *
 * A person picks an element on their live site (the picker in the Browser tab) and asks for a
 * change. The agent then needs the CMS record and field that printed it — before this door it
 * searched: the "account menu label" case took 150 steps and 13.5M tokens. The page cannot answer
 * (it is the customer's origin and holds no index); this relay can, because it reads the site's
 * Content API with its own authority.
 *
 * TWO SOURCES, AND THE ANSWER IS THEIR INTERSECTION (plan decision 3, measured in
 * `tasks/evidence/provenance-spike/REPORT.md`):
 * - the VALUE index, built here from `content.read` details: the element's own text (or picture)
 *   matched against every field of every record. Alone it names exactly one record for ~60% of the
 *   visible elements on three CMSs, and it is sometimes wrong (a short word, an author box that is
 *   not in the Content API);
 * - the render MARKS the page printed (`data-tracy-src`, a `<template data-tracy-owner>`, a menu
 *   item id), innermost first, as the picker reports them. Alone they are coarse (a Joomla module
 *   that lists articles it does not own).
 * The innermost mark whose owner holds a value candidate decides. When the two disagree the answer
 * says so (`conflict`, `unconfirmed`) instead of choosing: an edit to the wrong record is worse than
 * a question.
 *
 * THE ANSWER CARRIES A MAP AND THE PICKED FIELD'S WRITE TARGET — never a body. Ids, kinds, a short
 * label and whether this seat can write the level; and on a field level, the one field the person
 * pointed at: its stored words (`value`, at most `LEVEL_VALUE_CHARS`), its contract slot and
 * content revision, the replace job's own address for it (`at`, only where it is exact) and the call
 * that writes it (`next`). Before 28/09/2026 the answer was a map only, because `content.read`
 * needed `code` and an editor was not to gain a read through this door; every content read is
 * `content` since 27/09 (`route.js` APPLY_RULES), and one field is no bulk read. What the map alone
 * cost: a pick whose words were cut at 300 characters, or shown in two places (a label in the
 * header and the footer), took a `content.read` before any write, or answered AMBIGUOUS.
 *
 * THE SECOND VALUE SOURCE (stage 2): language strings and template files. Words no record holds —
 * a Joomla language key, a label typed into a template layout, a WordPress block attribute or core
 * block string — are indexed from the site's own files (`content-strings.js`, read by the host that
 * holds the webroot) and answered by the same rules; see `locateElement` for how the two sources
 * are ordered. Block cursors of a `partial` detail are not followed: such a record is indexed as far
 * as it was read and the answer says `incomplete`.
 *
 * Pure functions plus one in-memory store; the Apply door (`route.js`) does the I/O.
 */

import { versionOf, changesBetween } from './content-versions.js'
import { ALTERNATES_MAX, linkShowsPage, walkListing } from './content-pages.js'

/** How much of the picked element a call may carry (the picker's own `LIMITS`, protocol.mjs). */
export const LOCATE_LIMITS = Object.freeze({ text: 300, marks: 12, mark: 200, url: 2048 })
/**
 * How many characters of a field's stored words a field level carries (`value`; `valueCut` when the
 * field holds more). Past the picker's 300, so a paragraph it cut reaches the agent whole; and past
 * `content.replace`'s 500-character `find`, so the words to quote are always there.
 */
export const LEVEL_VALUE_CHARS = 1_000
/** How long a complete snapshot answers before it is built again from nothing. */
export const LOCATE_MAX_AGE_MS = 10 * 60 * 1000
/** How long one call waits for a snapshot being built before it answers `incomplete`. */
export const LOCATE_BUDGET_MS = 8_000
/** How long a build may run on after the call that started it has answered. */
export const LOCATE_BUILD_LIMIT_MS = 120_000
/** Records one snapshot reads in detail; a larger site is answered `incomplete`. */
export const LOCATE_MAX_RECORDS = 1_500
/**
 * Records one `content.read {ids}` call asks for, where the site reads batches (Joomla, WordPress).
 * The answer holds what fits the plugin's 256 KB detail ceiling and names the rest pending: 40
 * Northgate records came back in 158 KB and 0.49 s on the stand (27/09/2026); 40 WordPress records of
 * capiwl1643 in 0.11 s, 14 of them fitting (WordPress records are larger, ~19 KB each).
 */
export const LOCATE_BATCH = 40

/**
 * How a snapshot build reads a site's details, by platform. Both Claude Cowork plugins rebuild the
 * whole projection per read (Joomla ~0.5 s, WordPress ~0.1 s on the stand, 27/09/2026) and answer
 * `{ids}` since Joomla 0.18.3 / WordPress 0.14.3, so both read `LOCATE_BATCH` ids per call; an older
 * plugin refuses `ids` and the build falls back to one id per call (`readDetails`). Joomla's reader
 * refused overlapping reads on one site before 0.18.3 (see `contentProbe`): one call at a time
 * there. EmDash answers no `{ids}`: one id per call, four at a time.
 * @param {string|undefined} platform
 * @returns {{ concurrency: number, batch: number }}
 */
export function locateReads(platform) {
  if (platform === 'joomla') return { concurrency: 1, batch: LOCATE_BATCH }
  if (platform === 'wordpress') return { concurrency: 4, batch: LOCATE_BATCH }
  return { concurrency: 4, batch: 0 }
}
/** Candidates an answer lists. */
const MAX_CANDIDATES = 5
/** A label is a name, not a quote. */
const LABEL_CHARS = 80

// ── Text, as both sides see it ──────────────────────────────────────────────────────────────────

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  rarr: '→',
  larr: '←',
  bull: '•',
  deg: '°',
  shy: '­'
}

/** HTML character references decoded; an unknown named one is kept as written. */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()]
    return named ?? whole
  })
}

/**
 * The comparable form of a value: references decoded, NFKC, whitespace collapsed, lower case. The
 * page side (`PickTarget.text`: own text plus inline descendants) and the store side meet here.
 * @param {unknown} text
 */
export function normalizeText(text) {
  return decodeEntities(text).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr'
])

/**
 * Tags whose words read as part of the element around them. The page side's list —
 * `INLINE_TAGS` in `packages/cms/tracy-cms-preview/protocol.mjs` — is the contract; this copy exists
 * because this app does not import that package, and `test/content-locate.test.mjs` holds the two
 * equal. A tag on one list only makes the page send words the index never built: `content.locate`
 * answers `none`, with no error.
 */
export const INLINE_TAGS = Object.freeze([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var'
])
const INLINE = new Set(INLINE_TAGS)

/**
 * Split HTML the way the picker reads a page (`PickTarget.text`, `protocol.mjs`): one segment per
 * element, holding its own text plus the words of its inline descendants (`<h2><a>Hello</a></h2>`
 * → "Hello" for both; `<p>Some <b>bold</b> words</p>` → "bold" and "Some bold words"), while any
 * other descendant stands in for one space and keeps its words (a card's heading and body never
 * join). `<br>` is one space, `<wbr>` nothing. Pictures come out as their `src`. Script and style
 * bodies are not text a visitor reads.
 * @param {unknown} html
 * @returns {{ segments: string[], images: string[] }}
 */
export function ownTextOf(html) {
  const source = typeof html === 'string' ? html : ''
  /** @type {{ name: string | null, parts: string[] }[]} */
  const stack = [{ name: null, parts: [] }]
  const segments = []
  const images = []
  const top = () => stack[stack.length - 1].parts
  const close = () => {
    const frame = stack.pop()
    const words = frame.parts.join('')
    const own = words.trim()
    if (own) segments.push(decodeEntities(own))
    if (stack.length > 0) top().push(frame.name !== null && INLINE.has(frame.name) ? words : ' ')
  }
  const token = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)|</g
  let skipUntil = null
  for (const match of source.matchAll(token)) {
    const [whole, slash, rawName, attrs, text] = match
    if (skipUntil) {
      if (slash && rawName?.toLowerCase() === skipUntil) skipUntil = null
      continue
    }
    if (text !== undefined) {
      top().push(text)
      continue
    }
    if (!rawName) {
      if (whole === '<') top().push('<')
      continue
    }
    const name = rawName.toLowerCase()
    if (slash) {
      if (!VOID_TAGS.has(name) && stack.length > 1) close()
      continue
    }
    if (name === 'img') {
      const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs ?? '')
      if (src) images.push(decodeEntities(src[1] ?? src[2] ?? src[3] ?? ''))
    }
    if (name === 'script' || name === 'style') {
      top().push(' ')
      skipUntil = name
      continue
    }
    if (VOID_TAGS.has(name) || /\/\s*$/.test(attrs ?? '')) {
      if (name !== 'wbr') top().push(' ')
      continue
    }
    stack.push({ name, parts: [] })
  }
  while (stack.length > 0) close()
  return { segments, images }
}

/**
 * A picture's name as it survives resizing: the file name without its extension and without the
 * size suffixes CMSs add (`-1024x683`, `-scaled`, `@2x`, `_800w`).
 * @param {unknown} src
 * @returns {string | null}
 */
export function imageKey(src) {
  if (typeof src !== 'string' || src.trim() === '') return null
  let path = src.split('#')[0]
  try {
    path = new URL(path, 'https://site.invalid').pathname
  } catch {
    path = path.split('?')[0]
  }
  try {
    path = decodeURIComponent(path)
  } catch {
    // a broken escape keeps its bytes
  }
  const base = path.split('/').pop() ?? ''
  const stem = base
    .replace(/\.(jpe?g|png|webp|avif|gif|svg)$/i, '')
    .replace(/(-\d+x\d+|-scaled|@\dx|_\d+w)$/, '')
    .toLowerCase()
  return stem || null
}

// ── The value index ─────────────────────────────────────────────────────────────────────────────

/** A render-time placeholder a stored value may hold (`{site.name}`, `%s`, `%1$d`). */
const PLACEHOLDER = /\{[a-z0-9_.]+\}|%(?:\d\$)?[sd]/gi
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @typedef {{ field: string, blockId?: string, blockKey?: string, blockRole?: string,
 *   itemId?: string, position?: number, slotKey?: string, semanticKey?: string,
 *   type?: string }} Where
 *   `type`: the field's Content API type (`text`, `html`, `image`); `position`: a repeater row's place
 *   in its block, as the Claude Cowork plugin or the EmDash reader counts it (the stored order).
 * @typedef {{ contentId: string, where: Where, value?: string, valueCut?: true, picture?: true }} Hit
 *   `picture`: indexed from a picture's address (an image field, an `<img>` in HTML, the record's
 *   `images` list), not from words.
 *   `value`: the stored words this hit was indexed from — a text field's value, the element's own
 *   words inside an HTML value, a picture's address — at most `LEVEL_VALUE_CHARS` characters
 *   (`valueCut` when there were more). Record hits only: the string index keeps none.
 * @typedef {{ id: string, type: string, title: string|null, slug: string|null, url: string|null,
 *   revision: string|null, native: unknown[]|null, locale: string|null, twins: string[],
 *   keys: Map<string, number>, blockKeys: Set<string>, shares: Set<string>,
 *   pictures: Map<string, Picture[]> }} RecordMeta
 *   `twins`: the record's translations as the CMS groups them (`relations` of type `translation`);
 *   `keys`: how many fields of the record carry each field key; `pictures`: the record's `images`
 *   list (the media record behind each picture, with its stored alt), by `imageKey`.
 * @typedef {{ id: string, alt: string, usages: { blockId: string|null, itemId: string|null }[] }} Picture
 * @typedef {{ meta: Map<string, RecordMeta>, text: Map<string, Hit[]>,
 *   segments: { text: string, hit: Hit }[], patterns: { rx: RegExp, hit: Hit }[],
 *   images: Map<string, Hit[]>, sharedBy: Map<string, Set<string>>,
 *   referencedBy: Map<string, Set<string>>, siteUrl: string|null }} ValueIndex
 */

/**
 * An index with nothing in it yet.
 * @param {string|null} siteUrl
 * @returns {ValueIndex}
 */
export function emptyIndex(siteUrl) {
  return {
    meta: new Map(),
    text: new Map(),
    segments: [],
    patterns: [],
    images: new Map(),
    sharedBy: new Map(),
    referencedBy: new Map(),
    siteUrl
  }
}

/**
 * The three ways a value enters an index — shared by the record index here and the string index
 * (`content-strings.js`), so both are matched by the same rules (`matchValue`).
 * @param {ValueIndex} index
 */
export function indexAdders(index) {
  const push = (map, key, hit) => {
    const list = map.get(key)
    if (list) list.push(hit)
    else map.set(key, [hit])
  }
  /** @param {unknown} value @param {Hit} hit */
  const addText = (value, hit) => {
    const n = normalizeText(value)
    if (n.length < 2) return
    push(index.text, n, hit)
    index.segments.push({ text: n, hit })
    const fixed = n.split(PLACEHOLDER)
    if (fixed.length > 1 && fixed.reduce((sum, part) => sum + part.trim().length, 0) >= 6) {
      // A bare `{site.name}` would match any text at all: only a value with six fixed characters or
      // more becomes a pattern (measured and blocked in the spike, REPORT.md point 5). A number
      // placeholder (`%d`, `%1$d` — gettext and Joomla strings) stands for digits only.
      const holes = n.match(PLACEHOLDER) ?? []
      const source = fixed
        .map((part, at) => {
          const hole = holes[at]
          if (hole === undefined) return escapeRegExp(part)
          return (
            escapeRegExp(part) +
            (hole.endsWith('d') && hole.startsWith('%') ? '\\d[\\d.,\\s]{0,14}' : '.{1,60}?')
          )
        })
        .join('')
      index.patterns.push({ rx: new RegExp(`^${source}$`), hit })
    }
  }
  /** @param {unknown} src @param {Hit} hit */
  const addImage = (src, hit) => {
    const key = imageKey(src)
    if (key) push(index.images, key, hit)
  }
  /** @param {unknown} value @param {Hit} hit */
  const addHtml = (value, hit) => {
    const { segments, images } = ownTextOf(value)
    for (const segment of segments) addText(segment, hit)
    for (const src of images) addImage(src, hit)
  }
  return { addText, addImage, addHtml }
}

/**
 * A record's media, by picture name: each entry of its `images` list (tracy-content/v1 — the media
 * record behind a picture, its stored alt, and where the record uses it), so a picked image's field
 * level can say which media record it is and whether the page prints that alt.
 * @param {any} content
 * @returns {Map<string, Picture[]>}
 */
function picturesOf(content) {
  /** @type {Map<string, Picture[]>} */
  const out = new Map()
  for (const image of Array.isArray(content?.images) ? content.images : []) {
    const key = imageKey(image?.src)
    if (key === null || typeof image?.id !== 'string') continue
    const usages = (Array.isArray(image.usages) ? image.usages : [])
      .filter((use) => use?.contentId === content.id)
      .map((use) => ({
        blockId: typeof use.blockId === 'string' ? use.blockId : null,
        itemId: typeof use.itemId === 'string' ? use.itemId : null
      }))
    const one = { id: image.id, alt: typeof image.alt === 'string' ? image.alt : '', usages }
    out.set(key, [...(out.get(key) ?? []), one])
  }
  return out
}

/**
 * The value index of a set of `content.read` details (tracy-content/v1 contents). Deterministic and
 * cheap (the Northgate WordPress site, 190 records: a few milliseconds), so a snapshot keeps the
 * details and builds this again after any change rather than patching it.
 * @param {any[]} contents
 * @param {{ siteUrl?: string | null }} [options]
 * @returns {ValueIndex}
 */
export function indexContents(contents, { siteUrl = null } = {}) {
  const index = emptyIndex(siteUrl)
  const { addText, addImage } = indexAdders(index)
  /**
   * Each hit keeps the stored words it came from: what a field level hands the agent as `value`.
   * @param {Hit} hit @param {string} raw @returns {Hit}
   */
  const keeping = (hit, raw) => {
    if (raw.length <= LEVEL_VALUE_CHARS) return { ...hit, value: raw }
    const chars = Array.from(raw)
    if (chars.length <= LEVEL_VALUE_CHARS) return { ...hit, value: raw }
    return { ...hit, value: chars.slice(0, LEVEL_VALUE_CHARS).join(''), valueCut: true }
  }
  /** @param {unknown} value @param {Hit} hit */
  const text = (value, hit) => {
    if (typeof value === 'string') addText(value, keeping(hit, value))
  }
  /** @param {unknown} src @param {Hit} hit */
  const picture = (src, hit) => {
    if (typeof src === 'string') addImage(src, { ...keeping(hit, src), picture: true })
  }
  /** An HTML value: one hit per element's own words (`ownTextOf`), each keeping those words. */
  const html = (/** @type {unknown} */ value, /** @type {Hit} */ hit) => {
    const { segments, images } = ownTextOf(value)
    for (const segment of segments) addText(segment, keeping(hit, segment))
    for (const src of images) addImage(src, { ...keeping(hit, src), picture: true })
  }
  const addField = (field, contentId, where) => {
    const value = field?.value
    if (typeof value !== 'string' || typeof field?.key !== 'string') return
    const hit = {
      contentId,
      where: {
        ...where,
        field: field.key,
        ...(typeof field.type === 'string' ? { type: field.type } : {}),
        ...(typeof field.slotKey === 'string' && field.slotKey !== '' ? { slotKey: field.slotKey } : {}),
        ...(typeof field.semanticKey === 'string' && field.semanticKey !== ''
          ? { semanticKey: field.semanticKey }
          : {})
      }
    }
    if (field.type === 'image') picture(value, hit)
    else if (field.type === 'url') return
    else if (field.type === 'html' || value.includes('<')) html(value, hit)
    else text(value, hit)
  }

  for (const content of Array.isArray(contents) ? contents : []) {
    if (typeof content?.id !== 'string') continue
    const id = content.id
    const blocks = Array.isArray(content.blocks) ? content.blocks : []
    const blockKeys = new Set()
    const shares = new Set()
    /** @type {Map<string, number>} */
    const keys = new Map()
    const count = (/** @type {any} */ field) => {
      if (typeof field?.key === 'string') keys.set(field.key, (keys.get(field.key) ?? 0) + 1)
    }
    for (const field of Array.isArray(content.fields) ? content.fields : []) count(field)
    for (const block of blocks) {
      for (const field of Array.isArray(block?.fields) ? block.fields : []) count(field)
      for (const item of Array.isArray(block?.items) ? block.items : [])
        for (const field of Array.isArray(item?.fields) ? item.fields : []) count(field)
    }
    for (const block of blocks) {
      if (typeof block?.key === 'string') blockKeys.add(block.key.split('.')[0])
      if (typeof block?.sharedContentId === 'string') {
        shares.add(block.sharedContentId)
        if (typeof block.key === 'string') {
          const key = block.key.split('.')[0]
          if (!index.sharedBy.has(key)) index.sharedBy.set(key, new Set())
          index.sharedBy.get(key).add(block.sharedContentId)
        }
        if (!index.referencedBy.has(block.sharedContentId))
          index.referencedBy.set(block.sharedContentId, new Set())
        index.referencedBy.get(block.sharedContentId).add(id)
      }
    }
    // The CMS's own translation group (Joomla associations, Polylang, an EmDash translation group),
    // as the Claude Cowork plugin or the EmDash reader names it on a detail.
    const twins = [
      ...new Set(
        (Array.isArray(content.relations) ? content.relations : [])
          .filter(
            (one) => one?.type === 'translation' && typeof one.contentId === 'string' && one.contentId !== id
          )
          .map((one) => one.contentId)
      )
    ]
    index.meta.set(id, {
      id,
      type: typeof content.type === 'string' ? content.type : 'unknown',
      title: typeof content.title === 'string' ? content.title : null,
      slug: typeof content.slug === 'string' && content.slug !== '' ? content.slug : null,
      url: typeof content.url === 'string' && content.url !== '' ? content.url : null,
      revision: typeof content.revision === 'string' ? content.revision : null,
      native: Array.isArray(content.native) ? content.native : null,
      locale: typeof content.locale === 'string' && content.locale !== '' ? content.locale : null,
      twins,
      keys,
      blockKeys,
      shares,
      pictures: picturesOf(content)
    })
    text(content.title, { contentId: id, where: { field: 'title', type: 'text' } })
    text(content.summary, { contentId: id, where: { field: 'summary', type: 'text' } })
    html(content.bodyHtml, { contentId: id, where: { field: 'bodyHtml', type: 'html' } })
    for (const field of Array.isArray(content.fields) ? content.fields : []) addField(field, id, {})
    for (const image of Array.isArray(content.images) ? content.images : [])
      picture(typeof image === 'string' ? image : image?.src, {
        contentId: id,
        where: { field: 'images', type: 'image' }
      })
    for (const block of blocks) {
      if (typeof block?.id !== 'string') continue
      const where = {
        blockId: block.id,
        ...(typeof block.key === 'string' ? { blockKey: block.key } : {}),
        ...(typeof block.role === 'string' && block.role !== '' ? { blockRole: block.role } : {})
      }
      for (const field of Array.isArray(block.fields) ? block.fields : []) addField(field, id, where)
      for (const item of Array.isArray(block.items) ? block.items : [])
        for (const field of Array.isArray(item?.fields) ? item.fields : [])
          addField(
            field,
            id,
            typeof item?.id === 'string'
              ? {
                  ...where,
                  itemId: item.id,
                  ...(Number.isInteger(item.position) ? { position: item.position } : {})
                }
              : where
          )
    }
  }
  return index
}

/**
 * Did the picker cut this text? A text longer than the picker's limit arrives as its first
 * `LOCATE_LIMITS.text - 1` characters and a closing `…` (`packages/cms/tracy-cms-preview/src/pick.mjs`
 * `capText`), so the mark sits exactly at the limit. A shorter text ending in `…` ("Read more…") is
 * words the page really shows, and is matched as they stand.
 * @param {unknown} text
 */
export function isCutText(text) {
  if (typeof text !== 'string' || !text.endsWith('…')) return false
  // 🔒 AT THE LIMIT, NOT EXACTLY ON IT (28/09/2026). `capText` cuts on CODE POINTS and the mark is
  // appended after, so a text holding an astral character (an emoji, `𝐀`, a CJK extension) arrives
  // SHORTER in `String.length` terms than `LOCATE_LIMITS.text`, and one cut at a word boundary shorter
  // still. Demanding the exact length read those as words the page really shows, looked the whole
  // value up, and matched the record that merely ends at the same character instead of the one that
  // printed it. A cut is now anything within a word's reach of the limit — and a short "Read more…" is
  // still words, because it is nowhere near it.
  return text.length >= LOCATE_LIMITS.text - CUT_SLACK && text.length <= LOCATE_LIMITS.text
}

/**
 * How far below the limit a `…` still reads as the picker's cut: enough for a word boundary and for the
 * surrogate pairs a code-point cut does not count (`capText`), and far below any real "Read more…".
 */
const CUT_SLACK = 24

/**
 * THE CONTENT VALUE SOURCE: which records hold the picked text or picture, and how sure the match
 * is. `value` is `exact` (the whole own text is one stored value), `part` (a truncated element,
 * `…`, inside a longer value; 12 characters or more), `placeholder` (a stored value with a
 * render-time token), or `none`.
 *
 * A text the picker cut (`isCutText`) is the START of a longer value, never a value of its own: it
 * is not looked up whole, and its words match a stored value they begin before one they only
 * appear in. Looked up whole, a stored value that happens to end at the same character (an excerpt
 * of the same paragraph) would stand alone as the record that printed it, when every record whose
 * value begins with those words could have.
 * @param {ValueIndex} index
 * @param {{ text?: string, image?: { src: string } | null }} query
 * @returns {{ value: 'exact'|'part'|'placeholder'|'none', hits: Hit[], normalized: string,
 *   picture?: true }} `picture`: matched by the picture's file name, not by words.
 */
export function matchValue(index, query) {
  if (query.image?.src) {
    const key = imageKey(query.image.src)
    const hits = key ? (index.images.get(key) ?? []) : []
    if (hits.length > 0) return { value: 'exact', hits, normalized: key ?? '', picture: true }
    if (!query.text) return { value: 'none', hits: [], normalized: key ?? '' }
  }
  const n = normalizeText(query.text)
  if (n.length < 2) return { value: 'none', hits: [], normalized: n }
  const cut = isCutText(query.text)
  const exact = cut ? undefined : index.text.get(n)
  if (exact?.length) return { value: 'exact', hits: exact, normalized: n }
  if (n.length >= 12) {
    const core = n.replace(/[….\s]+$/u, '').trim()
    const starts = cut ? index.segments.filter((one) => one.text.startsWith(core)) : []
    const part = (starts.length > 0 ? starts : index.segments.filter((one) => one.text.includes(core))).map(
      (one) => one.hit
    )
    if (part.length > 0) return { value: 'part', hits: part, normalized: n }
  }
  // A pattern matches a whole value; a cut text is never one.
  const placeholder = cut ? [] : index.patterns.filter((one) => one.rx.test(n)).map((one) => one.hit)
  if (placeholder.length > 0) return { value: 'placeholder', hits: placeholder, normalized: n }
  return { value: 'none', hits: [], normalized: n }
}

/**
 * No letter in any script: digits, punctuation, symbols ("01", "→", "· 2025"). Not `\W`: in a
 * JavaScript pattern `\W` is ASCII-only even with the `u` flag, so every Cyrillic, Vietnamese,
 * Chinese or Thai value counted as "no word" and answered `unknown` (the Russian EmDash site
 * r1e1734: 4.6 % resolved, 34.9 % once letters of every script counted, 27/09/2026).
 */
const NO_LETTER = /^[\p{N}\P{L}]+$/u
/** Characters as a reader counts them (code points, not UTF-16 units). */
const charCount = (text) => [...text].length

/**
 * A value match that proves nothing: two or three characters, digits and punctuation only ("01",
 * "→"), or one short word that only one non-shared record holds — the spike's hand check found its
 * wrong single-source matches were all of this kind (Joomla "01", "Infrastructure").
 * @param {ValueIndex} index
 * @param {string} normalized
 * @param {string[]} contentIds
 */
export function isWeakValue(index, normalized, contentIds) {
  if (charCount(normalized) <= 3) return true
  if (NO_LETTER.test(normalized)) return true
  return (
    !normalized.includes(' ') &&
    charCount(normalized) <= 14 &&
    contentIds.length === 1 &&
    index.meta.get(contentIds[0])?.type !== 'shared'
  )
}

/** Scripts written without spaces between words: each character counts as a word. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu

/**
 * Words distinctive enough to stand behind WITHOUT a mark: two words or more AND twelve characters
 * or more. An element no mark speaks for may be printed by something the index does not hold (a
 * menu the Content API does not carry, a template word, a language table), and a short value it
 * happens to equal proves nothing — "Services", "Contact", "News" in an EmDash drawer menu and the
 * language button's "English" all equal a site chrome field that does not print them (plan
 * decision 9, `p6-acceptance.md` §5e). The thresholds are measured, not chosen: every element the
 * value alone resolved on the spike pages and on the stand's WordPress and Joomla sites (27/09/2026)
 * was asked again with its marks (`coverage/after-resolver-guard/`). Of 18 answers a mark
 * contradicted, 16 were one short word ("Services", "Careers", "Next →", "Breadcrumbs") and 2 were
 * long headlines the page narrowing picked (a teaser on the home page — hence the one-holder rule
 * in `locateElement`); none was distinctive words held by one record. What the marks left
 * unconfirmed under two words or twelve characters was the dates and reading times a template
 * prints ("12 Aug 2026", "1 min read") that equal a stored value by chance; one long word was an
 * e-mail or the spike's wrong "Infrastructure". Short words are often right (a menu item a record
 * holds); the machine cannot tell which without a mark, and the EmDash menu shows what a wrong one
 * costs. A marked element is not
 * judged by this: its mark decides.
 * @param {string} normalized - `normalizeText` of the element's words.
 */
export function isDistinctive(normalized) {
  if (charCount(normalized) < 12) return false
  const unspaced = normalized.match(UNSPACED)?.length ?? 0
  const words = normalized.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length
  return words + unspaced >= 2
}

// ── Marks ───────────────────────────────────────────────────────────────────────────────────────

/**
 * What one render mark names, or null. The owner is the mark's first word (`part:header
 * block:core/paragraph` → the template part `header`):
 * - WordPress: `part:<slug>`, `ref:<id>:<slug>` (a menu or a synced pattern), `post:<id>:<slug>`,
 *   `site:identity`; the Content API names shared parts by that slug; an imported site's plugin
 *   also stamps `menuItem:<id>` (a classic menu entry) and `widget:<widget_id>` (a sidebar widget,
 *   `text-3`), read as the block key `menuItem-<id>` / `widget-<widget_id>` like Joomla's;
 * - Joomla: `module:<id>`, `menuItem:<id>`, `article:<id>[:<alias>]`, `category:<id>[:<alias>]`,
 *   `tag:<id>[:<alias>]` (a link to a tag page; the category and tag records are their own) — its
 *   Content API block keys carry the same CMS id (`module-425`, `article-734.0`, `menuItem-599.0`).
 *   The Claude Cowork plugin adds the alias to article and category marks for people reading the
 *   page; the id alone names the owner (an alias changes when the title does, the id never).
 * - EmDash (Tracy's EmDash template, no plugin): `emdash:<collection>:<entry id>:<slug>`, then
 *   optionally `field:<key>` (`field:<repeater>.<subfield>` inside a repeater row,
 *   `field:<field>.<_key>` on one text block of a Portable Text field) or
 *   `block:<repeater>`. The Content API ids are keyed by the site's seed, which a template never
 *   sees, but each content carries the entry's slug; the snapshot is one language, so the slug
 *   names the entry. Two collections holding the same slug make the mark own both — candidates,
 *   never a pick. The field or repeater narrows which of the entry's hits the mark confirms.
 * @param {unknown} mark
 * @returns {{ kind: 'slug', slug: string, field?: string, block?: string } | { kind: 'block', key: string }
 *   | { kind: 'identity' } | null}
 */
export function markOwner(mark) {
  if (typeof mark !== 'string') return null
  const [owner = '', ...rest] = mark.trim().split(/\s+/)
  if (owner === 'site:identity') return { kind: 'identity' }
  const entry = /^emdash:[a-z][a-z0-9_]*:[^:]+:([^:]+)$/.exec(owner)
  if (entry) {
    const part = /^(field|block):([A-Za-z0-9_.-]+)$/.exec(rest[0] ?? '')
    return { kind: 'slug', slug: entry[1], ...(part ? { [part[1]]: part[2] } : {}) }
  }
  let match = /^(?:post|ref):[^:]+:(.+)$/.exec(owner)
  if (match) return { kind: 'slug', slug: match[1] }
  match = /^part:(.+)$/.exec(owner)
  if (match) return { kind: 'slug', slug: match[1] }
  match =
    /^(module|menuItem|widget):([A-Za-z0-9_-]+)$/.exec(owner) ??
    /^(article|category|tag):([A-Za-z0-9_-]+)(?::\S+)?$/.exec(owner)
  if (match) return { kind: 'block', key: `${match[1]}-${match[2]}` }
  return null
}

/**
 * Does this value hit sit under what `owner` names? A slug or the site identity owns whole records.
 * A Joomla module, article or menu item owns the hits in ITS block of a page (`module-425`,
 * `menuItem-599.0`), the module's own shared record, and a record-level field (title, body) of a
 * record carrying that block — not every other block of the same page: a page lists all its modules,
 * and a mark on one of them says nothing about the words in another.
 * @param {ValueIndex} index
 * @param {Hit} hit
 * @param {NonNullable<ReturnType<typeof markOwner>>} owner
 */
export function ownsHit(index, hit, owner) {
  const meta = index.meta.get(hit.contentId)
  if (!meta) return false
  if (owner.kind === 'identity') return meta.type === 'shared' && meta.slug === null
  if (owner.kind === 'slug') return meta.slug === owner.slug
  // Joomla: a module shown on many pages is its own shared record, which the page's block names.
  if (index.sharedBy.get(owner.key)?.has(hit.contentId)) return true
  const blockKey = hit.where.blockKey?.split('.')[0]
  return blockKey ? blockKey === owner.key : meta.blockKeys.has(owner.key)
}

/**
 * Is this hit in the field or repeater an EmDash mark names? A top-level field is `field:<key>`
 * (the hit carries no block); a repeater row's subfield is `field:<repeater>.<subfield>` and the
 * row itself `block:<repeater>` — the Content API names a repeater's block by the field's key.
 * One text block of a Portable Text field is `field:<field>.<_key>`: the Content API gives it a
 * top-level field of that very key, so a dotted mark also names a block-less hit of the whole key
 * (a repeater hit always carries its block, so the two never meet).
 * A mark naming neither holds nothing here: the caller keeps every hit the owner holds.
 * @param {Where} where
 * @param {{ field?: string, block?: string }} owner
 */
function inMarkedPart(where, owner) {
  const blockKey = where.blockKey?.split('.')[0]
  if (owner.block) return blockKey === owner.block
  if (!owner.field) return false
  if (blockKey === undefined) return where.field === owner.field
  const dot = owner.field.indexOf('.')
  return dot > 0 && blockKey === owner.field.slice(0, dot) && where.field === owner.field.slice(dot + 1)
}

/**
 * Every value hit one record holds: its words and its pictures.
 * @param {ValueIndex} index
 * @param {string} contentId
 * @returns {Hit[]}
 */
function hitsOf(index, contentId) {
  const hits = index.segments.filter((one) => one.hit.contentId === contentId).map((one) => one.hit)
  for (const list of index.images.values())
    for (const hit of list) if (hit.contentId === contentId) hits.push(hit)
  return hits
}

/**
 * The records a mark's owner names by itself — what answers a pick that carries no words and no
 * picture (a section, a card, a button's padding), where no value can say which record printed it:
 * - a Joomla module: its own shared record, which the block the page carries for it names — never
 *   the pages that merely list the module; any other Joomla key (a menu item, an article, a
 *   category, a tag): the records holding a block of that key;
 * - a WordPress or EmDash slug: the records of that slug; the site identity: the shared record
 *   that has no slug.
 * Each comes with the value hits the mark's part narrows it to — the Joomla block the key names
 * inside its record, the field or repeater an EmDash mark names — so the levels start where the
 * mark does. A mark naming a whole record narrows nothing: the record is its one level.
 * @param {ValueIndex} index
 * @param {NonNullable<ReturnType<typeof markOwner>>} owner
 * @returns {{ id: string, hits: Hit[] }[]}
 */
export function recordsOfMark(index, owner) {
  if (owner.kind === 'block') {
    const shared = index.sharedBy.get(owner.key)
    if (shared) return [...shared].filter((id) => index.meta.has(id)).map((id) => ({ id, hits: [] }))
    return [...index.meta.values()]
      .filter((meta) => meta.blockKeys.has(owner.key))
      .map((meta) => ({
        id: meta.id,
        hits: hitsOf(index, meta.id).filter((hit) => hit.where.blockKey?.split('.')[0] === owner.key)
      }))
  }
  const narrows = owner.kind === 'slug' && (owner.field !== undefined || owner.block !== undefined)
  return [...index.meta.values()]
    .filter((meta) =>
      owner.kind === 'identity' ? meta.type === 'shared' && meta.slug === null : meta.slug === owner.slug
    )
    .map((meta) => ({
      id: meta.id,
      hits:
        narrows && owner.kind === 'slug'
          ? hitsOf(index, meta.id).filter((hit) => inMarkedPart(hit.where, owner))
          : []
    }))
}

// ── Levels ──────────────────────────────────────────────────────────────────────────────────────

const clip = (text) => {
  const one = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return one.length > LABEL_CHARS ? `${one.slice(0, LABEL_CHARS - 1)}…` : one
}

/** A CMS kind a Joomla block key names (`module-425` → `module`). */
const blockKind = (blockKey) => /^(module|article|menuItem|category|tag)-/.exec(blockKey ?? '')?.[1] ?? null

/**
 * @typedef {{ tool: 'tracy_site', action: 'content.replace', at: string[] }
 *   | { tool: 'tracy_site', action: 'content.contract', operation: 'apply', changes: Record<string, null>,
 *       expected_content_revisions?: Record<string, string> }
 *   | { edit: string, line?: number, key?: string, write?: string, through?: 'shell', after?: string }} Next
 *   The one call that writes a level, as far as the level can say it: `content.replace` at the replace
 *   job's own address (the agent adds `find`, `replace`, `path`), a contract apply of the slot (the
 *   agent fills its value), or a file write — `edit` the file, at `line` or `key`, putting `write`
 *   there (a Joomla override line), through the site's shell when file tools cannot reach it, `after`
 *   the step that makes it show.
 * @typedef {{ kind: 'record'|'field'|'block'|'string'|'file'|'style', id: string, contentId?: string,
 *   blockId?: string, itemId?: string, fieldKey?: string, slotKey?: string, revision?: string,
 *   value?: string, valueCut?: true, at?: string, next?: Next, native?: unknown[],
 *   alternates?: { locale: string, id: string }[], file?: string, line?: number, key?: string,
 *   domain?: string, locale?: string, override?: string, label: string, writable: boolean,
 *   why?: string, image?: ImageFacts }} Level
 * @typedef {(road: { platform: string|null,
 *   level: 'record'|'block'|'field'|'string'|'file'|'slot'|'replace', record?: RecordMeta,
 *   where?: Where, origin?: { editable: boolean }, store?: string }) => boolean} MayWrite
 *   `slot`: the contract apply of `where.slotKey`; `replace`: the replace job's write of that field,
 *   through `store` (the CMS kind the job writes: `post`, `option`) where the platform has several.
 */

/**
 * What an EmDash render mark names: the entry's collection and slug (`emdash:<collection>:<entry
 * id>:<slug>`, Tracy's EmDash template, `src/lib/stamps.ts`) — the same shape `markOwner` reads.
 * @param {unknown} mark
 * @returns {{ collection: string, slug: string } | null}
 */
export function emdashEntryOf(mark) {
  if (typeof mark !== 'string') return null
  const owner = mark.trim().split(/\s+/)[0] ?? ''
  const entry = /^emdash:([a-z][a-z0-9_]*):[^:]+:([^:]+)$/.exec(owner)
  return entry ? { collection: entry[1], slug: entry[2] } : null
}

/**
 * The collection of an EmDash record, read off the marks the page printed around the element: the
 * Content API keeps collections out of its ids and types (`page`, `shared` — several collections may
 * map to one), but the template stamps each entry with its own. Exactly one collection among the
 * marks naming this slug, or null.
 * @param {readonly string[]} marks
 * @param {string|null} slug
 */
function markedCollection(marks, slug) {
  if (slug === null) return null
  const found = new Set(
    marks
      .map(emdashEntryOf)
      .filter((entry) => entry?.slug === slug)
      .map((entry) => /** @type {{ collection: string }} */ (entry).collection)
  )
  return found.size === 1 ? /** @type {string} */ ([...found][0]) : null
}

/**
 * Keys and values the EmDash replace job never treats as words, so it builds no unit for them —
 * `HIDDEN_KEY` and `HIDDEN_VALUE` of `packages/tools/tracy-site-tools/src/host/replace-emdash.mjs`
 * (tracy-web does not import site-tools; `replace-emdash.test.mjs` holds the two equal on the
 * engine's own units). A template's own hidden list is not known here: a field it hides is one the
 * page does not print, and the element's words came from the page.
 */
const EMDASH_HIDDEN_KEY =
  /^(id|url|href|slug|src|provider|filename|mimeType|blurhash|dominantColor|storageKey|width|height)$|_url$|_id$/
const EMDASH_HIDDEN_VALUE = [
  /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^(https?:\/\/|mailto:|tel:|\/)\S*$/
]
/** A name the EmDash engine's paths are made of (`replace-emdash.mjs` `parsePath`). */
const EMDASH_NAME = /^[A-Za-z_]\w*$/

/**
 * THE REPLACE JOB'S OWN ADDRESS FOR ONE FIELD — the `at` its units carry, so `content.replace {at}`
 * writes exactly the field the person picked: no AMBIGUOUS when the same words show twice on the page,
 * no read first. Only where the address is EXACT; everything else is null, and the agent quotes the
 * words as before (an `at` naming no unit is refused STORE_CHANGED: a wasted call, and a wrong unit
 * would be a wrong write). Words only: a picture or a link is the contract's (`nextOf`).
 * - Joomla (a sealed site — the only one with a Content API — takes the contract engine,
 *   `replace-joomla.mjs` `joomlaStore`): a text slot's unit is `at: slot.key`, the key the inspect and
 *   the Content API both take from the contract (`slotsOf`), language copies (`ru-RU::…`) included.
 * - WordPress (`replace-wordpress.mjs` `postStores`, `unitsOfStores`): a page or post by its native id
 *   — its title `post:<id>.title`, its excerpt `post:<id>.excerpt`, and a block field
 *   `post:<id>#<metadata.name>`, which is the first unit of that name in the body, so only when no
 *   other field of the record carries the name (a second one is `.2`, by position the Content API
 *   does not give); the site title and tagline `option:blogname` / `option:blogdescription`. Not a
 *   menu label (links and submenus share one item list, while the engine counts each kind apart),
 *   nor a template part (the engine reads only the parts the site lists as rows).
 * - EmDash (`replace-emdash.mjs` `storeOf`): `<collection>/<slug>@<locale>#<path>` for a top-level
 *   field or a repeater row's subfield (`<repeater>[<position>].<field>`), the collection from the
 *   page's mark (`markedCollection`). Not a Portable Text block (its path is an index the Content API
 *   does not give), nor a locale the reader may have re-cased (only a short lower-case tag is surely
 *   stored as the reader prints it).
 * @param {{ platform: string|null, record: RecordMeta, where: Where, value?: string,
 *   marks?: readonly string[] }} input
 * @returns {{ at: string, store: string } | null} `store`: what the job writes it through
 *   (`slot`, `post`, `option`, `entry`).
 */
export function replaceAtOf({ platform, record, where, value = '', marks = [] }) {
  if (where.type !== 'text') return null
  // 🔒 A DERIVED SLOT (an imported copy, 01/10/2026) IS NO UNIT OF THE JOOMLA REPLACE JOB. A quickstart's
  // slot key is the contract engine's own address; an imported copy runs the open engine, whose units are
  // records (`article:<id>.<field>`, `module:<id>.params:<key>`), so a pinned derived key matched none and
  // the job answered STORE_CHANGED. The derived slot's write is the contract apply (`nextOf`), which the
  // imported copy's surface carries.
  if (platform === 'joomla')
    return typeof where.slotKey === 'string' && where.slotKey !== '' && !DERIVED_SLOT_KEY.test(where.slotKey)
      ? { at: where.slotKey, store: 'slot' }
      : null
  if (platform === 'wordpress') {
    if (
      where.blockId === undefined &&
      record.type === 'shared' &&
      (where.field === 'blogname' || where.field === 'blogdescription')
    )
      return { at: `option:${where.field}`, store: 'option' }
    // A derived slot's own block (an imported site, `mergeDerived`): its one field is keyed by the
    // slot, which is no block name the replace job knows — the contract apply writes it.
    if (typeof where.slotKey === 'string' && where.slotKey !== '' && where.field === where.slotKey)
      return null
    if (record.type !== 'page' && record.type !== 'article') return null
    const post = record.native?.find(
      (one) =>
        one !== null &&
        typeof one === 'object' &&
        /** @type {any} */ (one).kind === 'post' &&
        Number.isInteger(/** @type {any} */ (one).id) &&
        /** @type {any} */ (one).id > 0
    )
    if (!post) return null
    const store = `post:${/** @type {any} */ (post).id}`
    if (where.blockId === undefined) {
      if (where.field === 'title') return { at: `${store}.title`, store: 'post' }
      if (where.field === 'summary') return { at: `${store}.excerpt`, store: 'post' }
      return null
    }
    return record.keys.get(where.field) === 1 ? { at: `${store}#${where.field}`, store: 'post' } : null
  }
  if (platform === 'emdash') {
    const collection = markedCollection(marks, record.slug)
    const locale = record.locale ?? ''
    if (collection === null || record.slug === null || (locale !== '' && !/^[a-z]{2,3}$/.test(locale)))
      return null
    if (!EMDASH_NAME.test(where.field) || EMDASH_HIDDEN_KEY.test(where.field)) return null
    if (EMDASH_HIDDEN_VALUE.some((rx) => rx.test(value.trim()))) return null
    let path = where.field
    if (where.blockId !== undefined) {
      if (where.itemId === undefined || !Number.isInteger(where.position)) return null
      if (typeof where.blockKey !== 'string' || !EMDASH_NAME.test(where.blockKey)) return null
      path = `${where.blockKey}[${where.position}].${where.field}`
    }
    return { at: `${collection}/${record.slug}@${locale}#${path}`, store: 'entry' }
  }
  return null
}

/**
 * The one call that writes the field a level names, when this seat may make it:
 * - the words, where the replace job has the field's exact address → `content.replace {at}`, the road
 *   the harness keeps for words (identity tokens, a heading on two lines, a fact's language copies);
 * - otherwise a contract slot (a picture, a link, words without an address) → one `content.contract`
 *   apply, carrying the content revision this answer read. A pick has no `content.read` in the
 *   conversation, and without a revision Tracy inspects first (CC-12, `normalize.mjs`: 10–80 s and an
 *   INSPECT_FIRST answer); `expected_content_revisions` is what `content.read` would give it.
 * @param {{ platform: string|null, record: RecordMeta, where: Where, contentId: string,
 *   replace: { at: string, store: string } | null, mayWrite: MayWrite }} input
 * @returns {Next | null}
 */
function nextOf({ platform, record, where, contentId, replace, mayWrite }) {
  if (replace !== null && mayWrite({ platform, level: 'replace', record, where, store: replace.store }))
    return { tool: 'tracy_site', action: 'content.replace', at: [replace.at] }
  if (typeof where.slotKey === 'string' && mayWrite({ platform, level: 'slot', record, where }))
    return {
      tool: 'tracy_site',
      action: 'content.contract',
      operation: 'apply',
      changes: { [where.slotKey]: null },
      ...(typeof record.revision === 'string' && record.revision !== ''
        ? { expected_content_revisions: { [contentId]: record.revision } }
        : {})
    }
  return null
}

/**
 * A record's language twins, each in its language — only where that language is known, never guessed:
 * the twin is in this index (a snapshot of every language), or the site has two languages and the
 * record one twin (a translation lives in a language other than its own — the Claude Cowork plugins
 * group only distinct languages, and `@tracy/content-api` refuses anything else). One twin whose
 * language cannot be said leaves the whole list out, as does a group past {@link ALTERNATES_MAX}.
 * @param {ValueIndex} index
 * @param {RecordMeta} record
 * @param {readonly string[]} siteLocales
 * @returns {{ alternates?: { locale: string, id: string }[] }}
 */
function alternatesOf(index, record, siteLocales) {
  const twins = record.twins
  if (twins.length === 0 || twins.length > ALTERNATES_MAX) return {}
  const other =
    twins.length === 1 &&
    record.locale !== null &&
    siteLocales.length === 2 &&
    siteLocales.includes(record.locale)
      ? siteLocales.find((one) => one !== record.locale)
      : undefined
  const alternates = []
  for (const id of twins) {
    const held = index.meta.get(id)
    const locale = held ? held.locale : (other ?? null)
    if (locale === null || locale === record.locale) return {}
    alternates.push({ locale, id })
  }
  return { alternates }
}

/**
 * A WordPress page's hits without its `bodyHtml` ones, when a named block field accounts for every one
 * of them. The WordPress Claude Cowork plugin projects a page's body twice: as `bodyHtml`, the static
 * HTML of every block (`BlockProjection::staticHtml`), and as the named blocks' own fields
 * (`metadata.name`, `hero.item.1.title`). So a named block's words always hit two fields, and the
 * levels stopped at the record — never the field the person pointed at, nor its write. When the words
 * sit in exactly one named field, as many times as in the body, the body holds no other copy of them:
 * both name the same stored bytes, and the field is the finer name. Any other copy (an unnamed block,
 * the excerpt, a second named field) keeps every hit, and the record stays the answer.
 * @param {Hit[]} own - the hits in one record.
 * @param {string|null} platform
 * @returns {Hit[]}
 */
function withoutWholeBody(own, platform) {
  if (platform !== 'wordpress') return own
  const body = own.filter((hit) => hit.where.field === 'bodyHtml' && hit.where.blockId === undefined)
  if (body.length === 0) return own
  const rest = own.filter((hit) => !body.includes(hit))
  const named = new Set(
    rest.map((hit) => JSON.stringify([hit.where.blockId, hit.where.itemId, hit.where.field]))
  )
  const inBlock = rest.every((hit) => hit.where.blockId !== undefined && hit.where.type !== 'image')
  return named.size === 1 && inBlock && rest.length === body.length ? rest : own
}

/**
 * A derived contract's slot key (`<kind>-<source id>.<column>.<sha1 of the leaf, 10 hex>`, the
 * plugin's `DerivedMap`): `post-12.post_content.0a1b2c3d4e`, `option-12.widget_text.…`. A quickstart's keys
 * (`home.hero.eyebrow`, `module-430.0`) never end in ten hex digits after a column.
 */
const DERIVED_SLOT_KEY = /^[A-Za-z]+-[^.\s]+\.[^\s]+\.[0-9a-f]{10}$/

/**
 * One record holding the same words twice — once in a field with a contract slot, once in a field
 * without — is written through the slot (29/09/2026). An imported WordPress site's reader lists its
 * derived slots beside the blocks its markup projects (`mergeDerived`): a builder's words sit in a
 * block field AND in the derived slot of the meta that stores them, or the title in a heading and in
 * its slot. Without this the two fields leave only the record level, and the agent has no call to
 * make. Only on WordPress, only for a DERIVED slot (`DERIVED_SLOT_KEY`), and only when every
 * unslotted hit's words are words a slotted hit holds: different words in two fields stay a
 * question, and a quickstart page keeps its own rule (`withoutWholeBody`) exactly as before.
 * @param {Hit[]} own
 * @returns {Hit[]}
 */
function preferSlotted(own, platform) {
  if (platform !== 'wordpress') return own
  const slotted = own.filter(
    (hit) => typeof hit.where.slotKey === 'string' && DERIVED_SLOT_KEY.test(hit.where.slotKey)
  )
  if (slotted.length === 0 || slotted.length === own.length) return own
  const words = new Set(slotted.map((hit) => normalizeText(hit.value)))
  const rest = own.filter((hit) => !slotted.includes(hit))
  return rest.every((hit) => typeof hit.value === 'string' && words.has(normalizeText(hit.value)))
    ? slotted
    : own
}

/**
 * A picture's hits narrowed to the fields that ARE images — when those fields account for every other
 * hit. One picture is indexed up to three times in a record: the image field that holds it, the `<img>`
 * in the record's HTML (WordPress projects a page's body whole as `bodyHtml` beside its named blocks,
 * one `<img>` for each block that prints the picture), and the record's `images` list. Only the first
 * names what the page printed, so when every hit is a picture and image fields are among them, those
 * are the hits — and one such field is the level. Before (stand E2E 29/09, V3-H2 / M3) the three
 * counted as three fields, the answer stopped at the record, and the agent chose an image itself: the
 * hero's alt instead of the pinned card's.
 *
 * Every other hit is a second place that prints the file, and the picker cannot say which of the two
 * it picked: it sends one address for both, and neither `domPath` nor a WordPress mark names a block.
 * A field level would then carry the slot, the revision and the write of the OTHER picture, so the
 * record stays the answer. Only two hits are copies of an image field:
 * - the record's `images` list (the media it uses, not a place the page prints);
 * - WordPress only, as for `withoutWholeBody`: the body's `<img>`, no more of them than the fields hold
 *   different files. A page that prints the file once more — an unnamed image block, a raw-HTML card —
 *   has more copies than that. (A Joomla article's or an EmDash entry's text is the record's own text,
 *   not a projection of its fields; the mark of an article already scopes a pick to its own blocks.)
 * An `<img>` in any other field — another block's HTML, a text field — is one of those second places.
 * @param {Hit[]} own - the hits in one record.
 * @param {string|null} platform
 * @returns {Hit[]}
 */
function finestPictures(own, platform) {
  if (own.length === 0 || !own.every((hit) => hit.picture === true)) return own
  const fields = own.filter((hit) => hit.where.type === 'image' && hit.where.field !== 'images')
  if (fields.length === 0) return own
  const isList = (hit) => hit.where.field === 'images' && hit.where.blockId === undefined
  const isBody = (hit) =>
    platform === 'wordpress' && hit.where.field === 'bodyHtml' && hit.where.blockId === undefined
  const copies = own.filter((hit) => !fields.includes(hit) && !isList(hit))
  if (!copies.every(isBody)) return own
  return copies.length <= new Set(fields.map((hit) => hit.value)).size ? fields : own
}

/**
 * The first WordPress post a record's native ids name (a page or a post), or null.
 * @param {RecordMeta} record
 * @returns {number | null}
 */
function wordpressPostOf(record) {
  const post = record.native?.find(
    (one) =>
      one !== null &&
      typeof one === 'object' &&
      /** @type {any} */ (one).kind === 'post' &&
      Number.isInteger(/** @type {any} */ (one).id) &&
      /** @type {any} */ (one).id > 0
  )
  return post ? /** @type {any} */ (post).id : null
}

/**
 * @typedef {{ media: string, alt: string, printed?: 'same'|'none'|'other', from?: string,
 *   next?: { tool: 'tracy_site', action: 'content.replace', at: string[] } }} ImageFacts
 *   What a picked image's field level says about the picture: its media record (`media`) and stored
 *   alt (`alt`); whether the page prints that alt (`printed`: `same`; `none` — the page prints no alt
 *   although one is stored; `other` — it prints other words, `from` the record's field that holds
 *   them, as a card printing its project's title); and the replace job's own write of that alt where
 *   its address is exact (`next`, WordPress).
 */

/**
 * The media record behind one image field and what the page prints as its alt (`ImageFacts`), or
 * nothing when the record lists no media for it, or more than one could be it.
 * - The media entry is the one the record uses at this field's block and item; with no usage naming
 *   them, the only entry of that picture name.
 * - `printed` compares the alt the picker read on the page (`printedAlt`, absent when it sent none)
 *   with the stored one; with both empty it is left out — nothing says whether the page would print
 *   one.
 * - WordPress: a named image block's alt is the replace job's unit `post:<id>#<name>@alt`
 *   (`replace-wordpress.mjs` `unitsOfStores`), exact when no other field of the record carries the
 *   name (as for words, `replaceAtOf`) — and not for a derived slot, which no unit is named after.
 *   An `at` naming no unit is refused, never written elsewhere.
 * @param {{ index: ValueIndex, record: RecordMeta, where: Where, src: string|undefined,
 *   printedAlt: string|undefined, platform: string|null, mayWrite: MayWrite }} input
 * @returns {{ image?: ImageFacts }}
 */
function imageFactsOf({ index, record, where, src, printedAlt, platform, mayWrite }) {
  const key = imageKey(src)
  const entries = key === null ? [] : (record.pictures.get(key) ?? [])
  const used = entries.filter((one) =>
    one.usages.some((use) => use.blockId === (where.blockId ?? null) && use.itemId === (where.itemId ?? null))
  )
  const media = used.length === 1 ? used[0] : used.length === 0 && entries.length === 1 ? entries[0] : null
  if (media === null) return {}
  /** @type {ImageFacts} */
  const image = { media: media.id, alt: media.alt }
  if (typeof printedAlt === 'string') {
    const printed = normalizeText(printedAlt)
    const stored = normalizeText(media.alt)
    if (printed !== '' && printed === stored) image.printed = 'same'
    else if (printed === '' && stored !== '') image.printed = 'none'
    else if (printed !== '') {
      image.printed = 'other'
      const holder = (index.text.get(printed) ?? []).find((hit) => hit.contentId === record.id)
      if (holder) image.from = holder.where.semanticKey ?? holder.where.field
    }
  }
  const post = platform === 'wordpress' ? wordpressPostOf(record) : null
  // A derived slot's own block (an imported site, `mergeDerived`) holds one field keyed by the slot, which
  // is no block name the replace job knows: `replaceAtOf` gives its words no address, and neither does this.
  const derived = typeof where.slotKey === 'string' && where.slotKey !== '' && where.field === where.slotKey
  if (
    post !== null &&
    !derived &&
    where.blockId !== undefined &&
    (record.type === 'page' || record.type === 'article') &&
    record.keys.get(where.field) === 1 &&
    image.printed !== 'none' &&
    image.printed !== 'other' &&
    mayWrite({ platform, level: 'replace', record, where, store: 'post' })
  )
    image.next = { tool: 'tracy_site', action: 'content.replace', at: [`post:${post}#${where.field}@alt`] }
  return { image }
}

/**
 * The stored words a field's hits agree on, or nothing when they disagree (two paragraphs that begin
 * alike, matched by a cut text).
 * @param {Hit[]} held
 * @returns {{ value?: string, valueCut?: true }}
 */
function valueOf(held) {
  const seen = new Map(
    held
      .filter((hit) => typeof hit.value === 'string')
      .map((hit) => [`${hit.valueCut === true}|${hit.value}`, hit])
  )
  if (seen.size !== 1) return {}
  const [hit] = seen.values()
  return { value: /** @type {string} */ (hit.value), ...(hit.valueCut ? { valueCut: hit.valueCut } : {}) }
}

/**
 * The levels of one record, innermost first (the picker walks them with ↑/↓): the field when the
 * hits name exactly one, its block when they share one, then the record. The field carries what
 * writes it — its stored words, slot, revision, the replace job's address and the call (`nextOf`) —
 * and the record its language twins (`alternatesOf`).
 * @param {ValueIndex} index
 * @param {string} contentId
 * @param {Hit[]} hits - the value hits inside this record (may be empty: a mark-only record).
 * @param {MayWrite} mayWrite
 * @param {string|null} platform
 * @param {{ marks?: readonly string[], siteLocales?: readonly string[], printedAlt?: string }} [context] -
 *   the marks the page printed around the element (an EmDash entry's collection), the site's
 *   languages, and the alt the picker read on a picked image (`imageFactsOf`).
 * @returns {Level[]}
 */
export function levelsOf(index, contentId, hits, mayWrite, platform, context = {}) {
  const record = index.meta.get(contentId)
  if (!record) return []
  const { marks = [], siteLocales = [], printedAlt } = context
  const own = preferSlotted(
    withoutWholeBody(
      finestPictures(
        hits.filter((hit) => hit.contentId === contentId),
        platform
      ),
      platform
    ),
    platform
  )
  /** @type {Map<string, Hit[]>} */
  const fields = new Map()
  for (const hit of own) {
    const key = JSON.stringify([hit.where.blockId, hit.where.itemId, hit.where.field])
    fields.set(key, [...(fields.get(key) ?? []), hit])
  }
  const blocks = new Set(own.map((hit) => hit.where.blockId ?? null))
  const levels = []
  const recordName = record.title ?? record.slug ?? record.id
  if (fields.size === 1) {
    const held = /** @type {Hit[]} */ ([...fields.values()][0])
    const where = /** @type {Hit} */ (held[held.length - 1]).where
    const stored = valueOf(held)
    const replace = replaceAtOf({ platform, record, where, value: stored.value, marks })
    const next = nextOf({ platform, record, where, contentId, replace, mayWrite })
    levels.push({
      kind: 'field',
      id: `${contentId}#${[where.blockId, where.itemId, where.field].filter(Boolean).join('/')}`,
      contentId,
      ...(where.blockId ? { blockId: where.blockId } : {}),
      ...(where.itemId ? { itemId: where.itemId } : {}),
      fieldKey: where.field,
      ...(where.slotKey ? { slotKey: where.slotKey } : {}),
      ...(record.revision ? { revision: record.revision } : {}),
      ...stored,
      ...(replace ? { at: replace.at } : {}),
      ...(next ? { next } : {}),
      ...(where.type === 'image'
        ? imageFactsOf({ index, record, where, src: stored.value, printedAlt, platform, mayWrite })
        : {}),
      label: clip(`${recordName} › ${where.semanticKey ?? where.field}`),
      writable: mayWrite({ platform, level: 'field', record, where })
    })
  }
  const [onlyBlock] = blocks
  if (blocks.size === 1 && typeof onlyBlock === 'string') {
    const where = own.find((hit) => hit.where.blockId === onlyBlock)?.where
    levels.push({
      kind: 'block',
      id: onlyBlock,
      contentId,
      blockId: onlyBlock,
      label: clip(`${recordName} › ${where?.blockRole ?? where?.blockKey ?? 'block'}`),
      writable: mayWrite({ platform, level: 'block', record, where })
    })
  }
  levels.push({
    kind: 'record',
    id: contentId,
    contentId,
    ...(record.native ? { native: record.native } : {}),
    ...alternatesOf(index, record, siteLocales),
    label: clip(`${record.type} "${recordName}"`),
    writable: mayWrite({ platform, level: 'record', record })
  })
  return levels
}

/**
 * The one level of a language string or template file unit (`content-strings.js`): which file,
 * which key or line — the id the agent acts on — and whether this seat may write it.
 * - a Joomla string: `<file>#<KEY>`, plus the override file of that language (the road: Joomla
 *   reads `language/overrides/<tag>.override.ini` before any extension's file);
 * - a WordPress gettext string: `<file>:<line>#<msgid>`, with its text domain;
 * - words or a picture a template file carries: `<file>:<line>` (a picture: `<file>`);
 * - an EmDash dictionary word: `<file>#<locale>.<key>` (the language rides in `locale`, as Joomla's).
 * A unit the site cannot change through a file tool carries `why` when not writable, and one it can
 * carries the write that changes it (`next`, `recipeOf`) — the account-label case, a label in a Joomla
 * language string, took 13 steps and 26 calls (9 in the shell) finding that write on dev (28/09).
 * @param {{ origins: Map<string, any> }} strings
 * @param {string} unit
 * @param {MayWrite} mayWrite
 * @param {string|null} platform
 * @param {Hit[]} [hits] - the value hits in this unit; the first names the line of a template file.
 * @returns {Level[]}
 */
export function unitLevels(strings, unit, mayWrite, platform, hits = []) {
  const found = strings.origins.get(unit)
  if (!found) return []
  const line = /** @type {any} */ (hits.find((hit) => hit.contentId === unit)?.where)?.line ?? found.line
  const origin = { ...found, ...(line ? { line } : {}) }
  const where = origin.line ? `${origin.file}:${origin.line}` : origin.file
  const writable = mayWrite({ platform, level: origin.kind, origin })
  // Why a unit the site cannot change through a file tool is not writable: the unit's own reason (an
  // EmDash template), else the file's (WordPress core, a plugin, a downloaded translation).
  const reason = typeof origin.why === 'string' ? origin.why : origin.editable ? null : fileWhy(origin.file)
  const why = !writable && reason !== null ? { why: reason } : {}
  const recipe = recipeOf(origin, writable, platform)
  const next = recipe ? { next: recipe } : {}
  if (origin.kind === 'file')
    return [
      {
        kind: 'file',
        id: where,
        file: origin.file,
        ...(origin.line ? { line: origin.line } : {}),
        ...next,
        label: clip(where),
        writable,
        ...why
      }
    ]
  const joomla = typeof origin.locale === 'string'
  return [
    {
      kind: 'string',
      id: joomla ? `${origin.file}#${origin.key}` : `${where}#${origin.key}`,
      file: origin.file,
      ...(origin.line ? { line: origin.line } : {}),
      key: origin.key,
      ...(origin.domain ? { domain: origin.domain } : {}),
      ...(joomla ? { locale: origin.locale } : {}),
      ...(origin.override ? { override: origin.override } : {}),
      ...next,
      label: clip(
        joomla
          ? origin.override
            ? `${origin.key} — override in ${origin.override}`
            : `${origin.key} in ${origin.file}`
          : `"${origin.key}" (${origin.domain ?? 'default'}) in ${origin.file}`
      ),
      writable,
      ...why
    }
  ]
}

/** The call that makes an EmDash template edit show: the site serves a build of `/app` (ADR 0022). */
export const EMDASH_REBUILD = 'tracy_site_build_emdash request site.rebuild'

/**
 * Why a file the site does not own cannot be written through its file tools, from where it sits —
 * the three kinds `content-strings.js` `ownersOfFile` marks not editable on WordPress — or null.
 * @param {unknown} file
 * @returns {string | null}
 */
export function fileWhy(file) {
  if (typeof file !== 'string') return null
  if (file.startsWith('wp-includes/'))
    return 'WordPress core prints it: the next WordPress update overwrites an edit to its file.'
  if (file.startsWith('wp-content/plugins/'))
    return "A plugin prints it: the plugin's next update overwrites an edit to its file."
  if (file.startsWith('wp-content/languages/'))
    return 'A translation WordPress downloads: its next update overwrites an edit to the file.'
  return null
}

/**
 * The file write that changes a language string or a template's words — or null.
 * - a Joomla string: the key's line in its language's override file (`KEY="…"`), which Joomla reads
 *   before any extension's own file — on the line the key already holds there, else a line to add;
 * - words a template file carries, or a theme's own gettext string: that file, at that line;
 * - EmDash template source: the same, through the site's shell — file tools stop at the site folder,
 *   `/app` is the container's — then {@link EMDASH_REBUILD}, since the site serves a build of it.
 * Only for a unit this seat may write, except EmDash's, which no file tool writes by design: its road
 * is the shell. Never a picture file, and never a file the site does not own (`fileWhy`).
 * @param {any} origin - the unit's `Origin` (`content-strings.js`), its line settled.
 * @param {boolean} writable
 * @param {string|null} platform
 * @returns {Next | null}
 */
function recipeOf(origin, writable, platform) {
  if (typeof origin?.file !== 'string') return null
  if (platform === 'emdash') {
    const at = origin.line
      ? { line: origin.line }
      : typeof origin.key === 'string'
        ? { key: origin.key }
        : null
    return at ? { edit: origin.file, ...at, through: 'shell', after: EMDASH_REBUILD } : null
  }
  if (!writable) return null
  // A Joomla string is written in its override file only: an extension's own language file is
  // replaced by that extension's next update.
  if (origin.kind === 'string' && (platform === 'joomla' || typeof origin.locale === 'string')) {
    if (typeof origin.override !== 'string' || typeof origin.key !== 'string') return null
    return {
      edit: origin.override,
      ...(origin.file === origin.override && origin.line ? { line: origin.line } : {}),
      write: `${origin.key}="<new words>"`
    }
  }
  return origin.line ? { edit: origin.file, line: origin.line } : null
}

/**
 * The toolset each road to a level needs; the level is writable when the seat holds any of them.
 * - a contract slot (`slotKey`): `content.contract` apply → the slot's own toolset, `slotToolset`
 *   (`content` for a text, image or link slot of the site's contract, `code` for anything else — the
 *   Apply door's rule for that action, `contractToolset`);
 * - the record road: the CMS kind's toolset by the Apply door's own `KIND_TOOLSET`, the kind taken
 *   from `native` when the Claude Cowork plugin named it, else from a Joomla block key, else from
 *   the content type (a page or article is `content`; a shared part — module, template part — is
 *   `code`, as `module` and `templatePart` are);
 * - EmDash: `tracy_emdash` writes entries → `content`.
 * - a language string or template file: `code` when the file is the site's own, else no road.
 * Two roads are asked one at a time, for the call a level's `next` names (`nextOf`):
 * - `slot`: the contract apply of `where.slotKey` alone;
 * - `replace`: the doors the replace job writes that field through — the contract apply on Joomla,
 *   the `store` kind's (`post`, `option`) on WordPress, `content` on EmDash.
 * @param {{ platform: string|null, level: 'record'|'block'|'field'|'string'|'file'|'slot'|'replace',
 *   record?: RecordMeta, where?: Where, origin?: { editable: boolean }, store?: string }} road
 * @param {(kind: string) => string} toolsetOfKind
 * @param {(slotKey: string) => string} [slotToolset] - no contract to ask: every slot is `code`.
 * @returns {string[]}
 */
export function roadToolsets(
  { platform, level, record, where, origin, store },
  toolsetOfKind,
  slotToolset = () => 'code'
) {
  // A language string or a template file (`content-strings.js`): a file write, which is `code` —
  // and no road at all when the file is not the site's to change (WordPress core, a plugin's own
  // code, a compiled translation: the next update overwrites an edit).
  if (level === 'string' || level === 'file') return origin?.editable ? ['code'] : []
  if (level === 'slot') return where?.slotKey ? [slotToolset(where.slotKey)] : []
  if (level === 'replace') {
    if (platform === 'emdash') return ['content']
    if (platform === 'joomla') return where?.slotKey ? [slotToolset(where.slotKey)] : []
    return platform === 'wordpress' && typeof store === 'string' ? [toolsetOfKind(store)] : []
  }
  if (platform === 'emdash') return ['content']
  const sets = []
  if (level === 'field' && where?.slotKey) sets.push(slotToolset(where.slotKey))
  const nativeKind = record.native?.find((one) => typeof one?.kind === 'string')?.kind
  const kind =
    (level !== 'record' ? blockKind(where?.blockKey) : null) ??
    nativeKind ??
    (record.type === 'shared' ? null : record.type === 'page' || record.type === 'article' ? 'article' : null)
  // A shared part with no kind of its own is the CMS's shared part: a Joomla module, a WordPress
  // template part — named, so the kind's own toolset answers (`code`: an editor or owner writes it,
  // a viewer does not, ADR 0028).
  const sharedKind =
    record.type === 'shared' && (platform === 'joomla' || platform === 'wordpress')
      ? platform === 'joomla'
        ? 'module'
        : 'templatePart'
      : null
  sets.push(kind ? toolsetOfKind(kind) : sharedKind ? toolsetOfKind(sharedKind) : 'code')
  return [...new Set(sets)]
}

// ── The resolver ────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ url: string, text?: string, image?: { src: string, alt?: string } | null,
 *   marks?: string[], locale?: string, warm?: true }} LocateQuery
 * @typedef {{ status: 'resolved'|'candidates'|'conflict'|'unconfirmed'|'unknown', levels: Level[],
 *   candidates?: Level[], sources: { value: 'exact'|'part'|'placeholder'|'weak'|'none',
 *   mark: 'confirmed'|'coarser'|'only'|'none', from?: 'strings' }, impact: { pages: number },
 *   incomplete?: true, hint?: 'not-in-content', next?: string }} LocateAnswer
 *
 * `sources.mark`: `confirmed` — a mark names the record the value found; `coarser` — marks came,
 * none named a record holding the value; `only` — the element had no words and no picture, and its
 * mark alone named the record (`locateByMarks`); `none` — no marks came.
 *
 * `hint: 'not-in-content'` (with `next`, the sentence for the agent): the element's words or picture
 * are in no record of a snapshot read whole, and in no language string or template file the host
 * read — so not in the site's database. Only an `unknown` whose value source found nothing
 * (`sources.value: 'none'`) and whose snapshot is complete says so; a partial read might hold them.
 * `next` names `content.replace` for words a theme holds and never a theme file (`notInContentNext`).
 */

/**
 * What to do with words the site's database does not hold (`hint: 'not-in-content'`).
 *
 * 🔒 NEVER "EDIT THE THEME'S FILES" (30/09/2026). The first form of this sentence (#629) sent the
 * agent to grep the active theme or template files and change them there. An edit to a theme file
 * changes every page that uses it, sits outside the Apply door's receipts (nothing can undo it) and
 * is lost on the theme's next update. On WordPress the words a block theme holds are
 * `content.replace`'s since #644: a pattern the page inserts (`<!-- wp:pattern {"slug"} /-->`) is
 * copied into the page as its own words, like the block editor's Detach; a template part or template
 * still served from its file gets the override the Site Editor would make, which every page using it
 * shows. Each is revertible. The language-string road (a Joomla override, WordPress's contract
 * `string` operation) and the runtime case stay. Words or a link a WordPress theme prints only at render
 * time (JA Diner's `/contact-us/` phone, injected by a `the_content` filter) are the same call's too
 * (23/10/2026): it writes revertible rules for that one page through the plugin's `content.renderedWords`
 * (`tracy-site-tools` `rendered-words.mjs`), and an older plugin answers that the words stay.
 *
 * WHY NO PATTERN SLUG HERE. The answer could name the page's `wp:pattern` slug(s) so the agent goes
 * straight to them, but the snapshot does not hold it: the WordPress plugin's `content.read` detail
 * projects a body as its static HTML and its named or shared blocks (`BlockProjection::project`), and a
 * `core/pattern` reference is neither, so a pattern-only page reads as an empty body. Naming the slug
 * would cost a raw read of the page per pick. `content.replace` {path} reads that body itself and
 * finds the pattern, so the call below already goes straight to it.
 * @param {string|null} platform
 * @param {string|null} [url] - the picked element's page (the locate query's `url`): its path goes
 *   into the call, ready to send.
 */
export function notInContentNext(platform, url = null) {
  let path = '<the page path>'
  try {
    if (typeof url === 'string' && url !== '') path = new URL(url).pathname || '/'
  } catch {
    // A relative or broken address: the placeholder stands, the agent fills it from the url line.
  }
  const replace = `tracy_site content.replace {find:"<its words>", replace, path:${JSON.stringify(path)}}`
  const road =
    platform === 'wordpress'
      ? `Words the block theme holds (a pattern this page inserts, a template part, a template): ${replace}; a pattern becomes this page's own copy, a part or template gets an override that every page using it shows, and either can be undone. Words or a link the theme prints only as this page renders: the same call replaces them on this page, through the plugin's rendered-words rules (a link: changes:[{find:"<old href>", replace, href:true}]); when the plugin cannot, its answer says they stay. A translatable string: tracy_site content.contract {operation:"string", domain, msgid, context?, locale, value}.`
      : platform === 'joomla'
        ? `Try ${replace} first: it writes the words where Tracy can and otherwise names the road. A language string changes with a Joomla language override.`
        : `Try ${replace} first: it writes the words where Tracy can and otherwise names the road.`
  return `What was picked is not in this site's stored content. ${road} If nothing holds it, the site makes it as it runs: tell the customer where it comes from. Never edit theme or template files for it: that changes every page using them, cannot be undone here, and the next theme update erases it.`
}

/**
 * How many pages of the site render a record, as far as the snapshot knows: the record's own page
 * when it has an address, plus every record whose blocks name it as a shared part.
 * @param {ValueIndex} index
 * @param {string} contentId
 */
export function pagesShowing(index, contentId) {
  const pages = new Set()
  if (index.meta.get(contentId)?.url) pages.add(contentId)
  for (const holder of index.referencedBy.get(contentId) ?? [])
    if (index.meta.get(holder)?.url) pages.add(holder)
  return pages.size
}

/**
 * The pages a change to `pick` shows on: its own count, or — when the element sits inside a shared
 * part the page marked (a menu inside the header template part, which the Content API does not link
 * to the header) — the widest such part's count. Best effort, never more than the snapshot knows.
 * @param {ValueIndex} index
 * @param {string} pick
 * @param {string[]} marks
 */
function impactOf(index, pick, marks) {
  let pages = pagesShowing(index, pick)
  for (const mark of marks) {
    const owner = markOwner(mark)
    if (!owner || owner.kind === 'identity') continue
    for (const [id, meta] of index.meta) {
      const holds =
        owner.kind === 'slug' ? meta.slug === owner.slug : index.sharedBy.get(owner.key)?.has(id) === true
      if (holds) pages = Math.max(pages, pagesShowing(index, id))
    }
  }
  return pages
}

/**
 * The answer for a pick that carries no words and no picture — a section, a card, a button's
 * padding. No value can say who printed it, but the marks the page printed around it can: the
 * innermost mark whose owner the index holds names the record (`recordsOfMark`). One record is
 * `resolved`, several are `candidates` (this page's own record first); either way `sources.mark` is
 * `only`, because nothing but the page's own mark stands behind it. No mark naming a record the
 * index holds → `unknown`, as for any element no source knows.
 * @param {ValueIndex} index
 * @param {LocateQuery} query
 * @param {string[]} marks
 * @param {{ mayWrite: MayWrite, platform: string|null, tail: { incomplete?: true },
 *   siteLocales?: readonly string[] }} options
 * @returns {LocateAnswer}
 */
function locateByMarks(index, query, marks, { mayWrite, platform, tail, siteLocales = [] }) {
  const onPage = (/** @type {string} */ id) => {
    const url = index.meta.get(id)?.url
    return typeof url === 'string' && linkShowsPage(query.url, url, index.siteUrl)
  }
  for (const mark of marks) {
    const owner = markOwner(mark)
    const owned = owner ? recordsOfMark(index, owner) : []
    if (owned.length === 0) continue
    const levels = (/** @type {{ id: string, hits: Hit[] }} */ one) =>
      levelsOf(index, one.id, one.hits, mayWrite, platform, { marks, siteLocales })
    /** @type {LocateAnswer['sources']} */
    const sources = { value: 'none', mark: 'only' }
    if (owned.length === 1)
      return {
        status: 'resolved',
        levels: levels(owned[0]),
        sources,
        impact: { pages: impactOf(index, owned[0].id, marks) },
        ...tail
      }
    const ranked = [...owned]
      .sort((a, b) => Number(onPage(b.id)) - Number(onPage(a.id)) || a.id.localeCompare(b.id))
      .slice(0, MAX_CANDIDATES)
    return {
      status: 'candidates',
      levels: [],
      candidates: ranked.map((one) => levels(one)[0]),
      sources,
      impact: { pages: 0 },
      ...tail
    }
  }
  return {
    status: 'unknown',
    levels: [],
    sources: { value: 'none', mark: marks.length > 0 ? 'coarser' : 'none' },
    impact: { pages: 0 },
    ...tail
  }
}

/**
 * A string value that proves nothing: two or three characters, or digits and punctuation only.
 * Unlike a record value, one short word held by exactly one language key is not weak — a label is
 * short by nature (`Dark`, `Breadcrumbs`) — so a mark on it can confirm it; with no mark it is
 * `unconfirmed`, like a record value (`isDistinctive`).
 * @param {string} normalized
 */
export function isWeakString(normalized) {
  return charCount(normalized) <= 3 || NO_LETTER.test(normalized)
}

/**
 * Which record printed the element — the intersection of the value source and the marks.
 *
 * - value ∩ mark → `resolved` (mark `confirmed`);
 * - value gives more than one and the innermost mark holding one of them picks it → `resolved`;
 * - value gives more than one, no mark decides → `candidates` (ranked, at most five);
 * - value gives one, but a mark names a DIFFERENT record that also holds the value → `conflict`
 *   (both, the mark's first);
 * - value gives one and marks exist but none names a candidate → `unconfirmed` (the machine cannot
 *   tell a coarse mark from a wrong value: the spike's "Sergey Trofimov");
 * - nothing, or only a weak value no mark confirms → `unknown`;
 * - NO mark at all: one record holding distinctive words (`isDistinctive`) or the picture →
 *   `resolved`; one record holding shorter words → `unconfirmed`; several → `candidates`, with no
 *   narrowing by the page (plan decision 9: a value with no mark saying anything about it is never
 *   a guess).
 * "Value gives one" (with marks) includes narrowing by the page: of several records holding the
 * words, the one whose address is this page, when it is the only such record once shared parts are
 * counted.
 *
 * THE SECOND SOURCE, `strings` (`content-strings.js`: language strings and template files), follows
 * the same rules with two orders fixed:
 * - a mark decides across both sources, innermost first; at one mark a record it owns comes before
 *   a string it owns. A mark owning only a string while the value alone stands on one record is a
 *   `conflict` (string first), exactly as between two records;
 * - with no mark deciding, the records answer when they hold the words at all; the strings answer
 *   only words no record holds. A record is what a customer edits, and an edit of the wrong one of
 *   two is worse than a question — but a template word no record holds has no other reader. With
 *   no mark at all the same distinctiveness rule applies to a string as to a record.
 * Answers from strings say `sources.from: 'strings'`.
 *
 * A pick with no words and no picture is answered by its marks alone (`locateByMarks`).
 *
 * @param {ValueIndex} index
 * @param {LocateQuery} query
 * @param {{ mayWrite?: MayWrite, platform?: string|null, incomplete?: boolean,
 *   strings?: (ValueIndex & { origins: Map<string, any>, markOwns: (hit: Hit, mark: string) => boolean }) | null,
 *   siteLocales?: readonly string[] }} [options] - `siteLocales`: the site's languages, as its
 *   Content API head lists them (a record's twins are named in them, `alternatesOf`).
 * @returns {LocateAnswer}
 */
export function locateElement(index, query, options = {}) {
  const {
    mayWrite = () => false,
    platform = null,
    incomplete = false,
    strings = null,
    siteLocales = []
  } = options
  const marks = (Array.isArray(query.marks) ? query.marks : []).filter((one) => typeof one === 'string')
  const tail = incomplete ? { incomplete: /** @type {true} */ (true) } : {}
  // No words and no picture (a section, a card, a button's padding): only the marks can answer.
  if (!query.image?.src && normalizeText(query.text).length < 2)
    return locateByMarks(index, query, marks, { mayWrite, platform, tail, siteLocales })
  const markState = marks.length > 0 ? 'coarser' : 'none'
  const found = matchValue(index, query)
  const ids = [...new Set(found.hits.map((hit) => hit.contentId))].filter((id) => index.meta.has(id))
  const said = strings
    ? matchValue(strings, query)
    : { value: /** @type {'none'} */ ('none'), hits: [], normalized: '' }
  const units = strings
    ? [...new Set(said.hits.map((hit) => hit.contentId))].filter((id) => strings.origins.has(id))
    : []

  const weak = ids.length > 0 && isWeakValue(index, found.normalized, ids)
  const value = weak ? 'weak' : found.value
  const onPage = (id) => {
    const meta = index.meta.get(id)
    return (
      meta?.type === 'shared' ||
      (typeof meta?.url === 'string' && linkShowsPage(query.url, meta.url, index.siteUrl))
    )
  }
  const scoped = ids.filter(onPage)
  const valuePick = ids.length === 1 ? ids[0] : scoped.length === 1 ? scoped[0] : null

  // What the value alone would stand behind against a mark: one record, or the one record whose
  // address is this page when no shared part (header, menu, module) holds the words too. Narrowing by
  // "shared parts are on every page" is only a tiebreak — it must not outvote a mark.
  const shared = ids.filter((id) => index.meta.get(id)?.type === 'shared')
  const ownPage = ids.filter((id) => !shared.includes(id) && onPage(id))
  const valueStands =
    ids.length === 1 ? ids[0] : shared.length === 0 && ownPage.length === 1 ? ownPage[0] : null

  // Innermost mark first: the nearest owner holding a candidate decides — a record, else a string.
  /** @type {string[]} */
  let marked = []
  /** @type {string[]} */
  let markedUnits = []
  /** @type {Hit[]} */
  let unitHits = said.hits
  /** The hits the deciding mark owns: the levels of a mark-picked record are drawn from these. */
  let markedHits = found.hits
  for (const mark of marks) {
    const owner = markOwner(mark)
    const owned = owner ? found.hits.filter((hit) => ownsHit(index, hit, owner)) : []
    if (owned.length > 0) {
      marked = [...new Set(owned.map((hit) => hit.contentId))]
      // A block the mark names exactly (`menuItem-601.0`) is finer than its record's title, and so
      // is the field or repeater an EmDash mark names. Only a narrowing that keeps a hit counts: a
      // field the Content API leaves unresolved (a portable-text body) leaves the entry's own hits.
      const inBlock =
        owner.kind === 'block'
          ? owned.filter((hit) => hit.where.blockKey?.split('.')[0] === owner.key)
          : owned.filter((hit) => inMarkedPart(hit.where, owner))
      markedHits = inBlock.length > 0 ? inBlock : owned
      break
    }
    const ownedHits = strings
      ? said.hits.filter((hit) => strings.origins.has(hit.contentId) && strings.markOwns(hit, mark))
      : []
    if (ownedHits.length > 0) {
      markedUnits = [...new Set(ownedHits.map((hit) => hit.contentId))]
      unitHits = ownedHits
      break
    }
  }

  const levels = (id) =>
    levelsOf(index, id, marked.includes(id) ? markedHits : found.hits, mayWrite, platform, {
      marks,
      siteLocales,
      ...(typeof query.image?.alt === 'string' ? { printedAlt: query.image.alt } : {})
    })
  const innermost = (id) => levels(id)[0]
  const rank = (list) =>
    [...list]
      .sort(
        (a, b) =>
          Number(marked.includes(b)) - Number(marked.includes(a)) ||
          Number(onPage(b)) - Number(onPage(a)) ||
          a.localeCompare(b)
      )
      .slice(0, MAX_CANDIDATES)
  const answer = (status, pick, markSeen, candidates = null) => ({
    status,
    levels: pick ? levels(pick) : [],
    ...(candidates ? { candidates: candidates.map(innermost) } : {}),
    sources: { value, mark: markSeen },
    impact: { pages: pick ? impactOf(index, pick, marks) : 0 },
    ...tail
  })
  // An answer from the strings. `impact` stays 0: which pages print a language string or a template
  // file is not something any index here knows, and a number would be invented.
  const unitLevel = (unit) => unitLevels(/** @type {any} */ (strings), unit, mayWrite, platform, unitHits)
  const fromStrings = (status, unit, markSeen, candidates = null, sourceValue = said.value) => ({
    status,
    levels: unit ? unitLevel(unit) : [],
    ...(candidates ? { candidates } : {}),
    sources: { value: sourceValue, mark: markSeen, from: 'strings' },
    impact: { pages: 0 },
    ...tail
  })

  /**
   * A value match no mark speaks for: `resolved` for a picture (a file name is not a word two
   * sources share by chance) or distinctive words, else `unconfirmed` — the one holder is named,
   * and the answer says the machine could not confirm it.
   * @param {{ normalized: string, picture?: true }} match
   */
  const unmarkedStatus = (match) =>
    match.picture || isDistinctive(match.normalized) ? 'resolved' : 'unconfirmed'

  if (marked.length === 1) {
    const pick = marked[0]
    if (!weak && valueStands !== null && valueStands !== pick)
      return answer('conflict', null, 'confirmed', [pick, valueStands])
    return answer('resolved', pick, 'confirmed')
  }
  if (marked.length > 1) return answer('candidates', null, 'coarser', rank(marked))
  if (markedUnits.length === 1) {
    const unit = markedUnits[0]
    if (!weak && valueStands !== null)
      return fromStrings('conflict', null, 'confirmed', [unitLevel(unit)[0], innermost(valueStands)])
    return fromStrings('resolved', unit, 'confirmed')
  }
  if (markedUnits.length > 1)
    return fromStrings(
      'candidates',
      null,
      'coarser',
      markedUnits
        .sort()
        .slice(0, MAX_CANDIDATES)
        .map((unit) => unitLevel(unit)[0])
    )
  if (ids.length > 0) {
    if (weak) return answer('unknown', null, markState)
    if (marks.length === 0) {
      // No mark speaks for the element: the words alone resolve only when one record holds them
      // and they are distinctive. The page is no tiebreak here — a teaser on a page is the words of
      // another record, which is what the page's own copy of them looks like (`isDistinctive`).
      if (ids.length > 1) return answer('candidates', null, markState, rank(ids))
      return answer(unmarkedStatus(found), ids[0], markState)
    }
    if (valuePick !== null) return answer('unconfirmed', valuePick, markState)
    return answer('candidates', null, markState, rank(ids))
  }
  if (units.length > 0) {
    if (isWeakString(said.normalized)) return fromStrings('unknown', null, markState, null, 'weak')
    if (units.length === 1)
      return fromStrings(marks.length > 0 ? 'unconfirmed' : unmarkedStatus(said), units[0], markState)
    return fromStrings(
      'candidates',
      null,
      markState,
      units
        .sort()
        .slice(0, MAX_CANDIDATES)
        .map((unit) => unitLevel(unit)[0])
    )
  }
  return {
    status: 'unknown',
    levels: [],
    sources: { value: 'none', mark: markState },
    impact: { pages: 0 },
    ...tail,
    ...(incomplete
      ? {}
      : {
          hint: /** @type {'not-in-content'} */ ('not-in-content'),
          next: notInContentNext(platform, query.url)
        })
  }
}

// ── The query ───────────────────────────────────────────────────────────────────────────────────

const LOCATE_KEYS = ['url', 'text', 'image', 'marks', 'domPath', 'selector', 'locale', 'warm']

/**
 * Why a `content.locate` request cannot be answered, or null. Over-long text and too many marks are
 * cut to the picker's own limits by `locateQuery`, not refused: the page already cuts them, and a
 * refusal would only lose the pick.
 * @param {Record<string, unknown>} params
 * @returns {string | null}
 */
export function locateQueryProblem(params) {
  const unknown = Object.keys(params).find((key) => !LOCATE_KEYS.includes(key))
  if (unknown !== undefined)
    return `unknown parameter ${JSON.stringify(unknown)}; accepted: ${LOCATE_KEYS.join(', ')}`
  if (typeof params.url !== 'string' || params.url.trim() === '' || params.url.length > LOCATE_LIMITS.url)
    return 'url must be the address of the page the element is on, as text'
  if (params.warm !== undefined && typeof params.warm !== 'boolean')
    return 'warm must be true (build the index for this page, answer nothing) or left out'
  // A warm names only the page: the snapshot it builds is the site's, not one element's.
  if (params.warm === true) {
    if (params.locale !== undefined && typeof params.locale !== 'string') return 'locale must be text'
    return null
  }
  if (params.text !== undefined && typeof params.text !== 'string')
    return "text must be the element's own words, as text"
  if (params.image !== undefined && params.image !== null) {
    const image = /** @type {Record<string, unknown>} */ (params.image)
    if (typeof image !== 'object' || typeof image.src !== 'string' || image.src.trim() === '')
      return 'image must be {src, alt?}: the picture the element shows'
    if (image.alt !== undefined && typeof image.alt !== 'string') return 'image.alt must be text'
  }
  if (
    params.marks !== undefined &&
    !(Array.isArray(params.marks) && params.marks.every((m) => typeof m === 'string'))
  )
    return 'marks must be the list of data-tracy-src marks, innermost first, as text'
  // A pick with no words and no picture (a section, a card, a button's padding) still carries the
  // marks the page printed around it, and they name its owner (`locateByMarks`).
  const text = typeof params.text === 'string' ? params.text.trim() : ''
  const src = /** @type {any} */ (params.image)?.src
  const marked = Array.isArray(params.marks) && params.marks.some((m) => m.trim() !== '')
  if (text === '' && typeof src !== 'string' && !marked)
    return 'send text (the element\'s own words), image {src} or marks (its "marks:" values split at " | "): the <mentioned-element> block carries them'
  for (const key of ['domPath', 'selector', 'locale'])
    if (params[key] !== undefined && typeof params[key] !== 'string') return `${key} must be text`
  return null
}

/**
 * The request as the resolver reads it: cut to the limits, marks innermost first.
 * @param {Record<string, any>} params - already passed `locateQueryProblem`.
 * @returns {LocateQuery}
 */
export function locateQuery(params) {
  return {
    url: params.url.trim(),
    ...(typeof params.text === 'string' && params.text.trim() !== ''
      ? { text: params.text.slice(0, LOCATE_LIMITS.text) }
      : {}),
    ...(params.image && typeof params.image.src === 'string'
      ? {
          image: {
            src: params.image.src.slice(0, LOCATE_LIMITS.url),
            ...(typeof params.image.alt === 'string'
              ? { alt: params.image.alt.slice(0, LOCATE_LIMITS.text) }
              : {})
          }
        }
      : {}),
    marks: (Array.isArray(params.marks) ? params.marks : [])
      .slice(0, LOCATE_LIMITS.marks)
      .map((mark) => mark.slice(0, LOCATE_LIMITS.mark)),
    ...(typeof params.locale === 'string' && params.locale !== '' ? { locale: params.locale } : {}),
    ...(params.warm === true ? { warm: true } : {})
  }
}

// ── The snapshot ────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ at: number, version: string, revisions: Map<string, string|null>,
 *   details: Map<string, any>, siteUrl: string|null, index: ValueIndex }} Snapshot
 * @typedef {(params: Record<string, unknown>) => Promise<any>} Ask
 */

/** Resolves after `ms`, or never when `ms` is not finite. */
const after = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.())

/**
 * ONE TASK AT A TIME PER KEY, IN THE ORDER ASKED. Joomla's Content API reader refuses a read that
 * overlaps another on the same site (`CONTENT_SOURCE_UNAVAILABLE`, measured on r1j1734: 5 of 7
 * parallel reads failed, 7 of 7 in series passed), and one site's locates read from several places
 * at once: the site head, a warm's build, a pick's revalidation, another language's snapshot. Each
 * of those is single-flight on its own; this puts all of them in one line per site. A task that
 * fails does not stop the ones behind it.
 * @returns {{ run: <T>(key: string, task: () => Promise<T>) => Promise<T> }}
 */
export function createSerialGate() {
  /** @type {Map<string, Promise<void>>} */
  const tails = new Map()
  return {
    run(key, task) {
      const result = (tails.get(key) ?? Promise.resolve()).then(() => task())
      const tail = result.then(
        () => {},
        () => {}
      )
      tails.set(key, tail)
      tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key)
      })
      return result
    }
  }
}

/** How long a site's head answers before it is asked again: the describe probe's five minutes. */
export const LOCATE_HEAD_MAX_AGE_MS = 5 * 60 * 1000
/** How long a head that failed for a moment waits before it is asked the second and last time. */
export const LOCATE_HEAD_RETRY_MS = 250

/**
 * A read that failed for a moment rather than for good: no answer at all (the relay's `ask` turns
 * a network error or a body that is not JSON into null), or the reader's own "busy" — Joomla's
 * answer to a read that overlapped another one.
 * @param {any} answer
 */
const failedForAMoment = (answer) =>
  answer === null || answer === undefined || answer?.error?.code === 'CONTENT_SOURCE_UNAVAILABLE'

/**
 * The site's head — `content.read {limit: 1}`: its address, languages and default language, which
 * say what language a page is in. Asked at most twice: a head that failed for a moment is asked once
 * more after `retryMs`.
 * @param {Ask} ask
 * @param {{ retryMs?: number }} [options]
 * @returns {Promise<{ head: any } | { refusal: any } | { failed: true }>} `refusal`: the reader said
 *   no for good (no Content API on the site, a forbidden read) — the answer to hand back; `failed`:
 *   no head after two tries.
 */
export async function askHead(ask, { retryMs = LOCATE_HEAD_RETRY_MS } = {}) {
  const once = () => Promise.resolve(ask({ limit: 1 })).catch(() => null)
  let answer = await once()
  if (failedForAMoment(answer)) {
    await new Promise((resolve) => setTimeout(resolve, retryMs))
    answer = await once()
  }
  if (answer?.schemaVersion === 'tracy-content/v1') return { head: answer }
  if (failedForAMoment(answer)) return { failed: true }
  return { refusal: answer }
}

/** A `{ids}` answer (tracy-content/v1 batch): the contents that fit, and what it left out. */
const isBatchAnswer = (answer) =>
  answer?.schemaVersion === 'tracy-content/v1' &&
  Array.isArray(answer.contents) &&
  Array.isArray(answer.pagination?.pending) &&
  Array.isArray(answer.pagination?.missing)

/**
 * Read the detail of each row, `concurrency` calls at a time. A detail that is not a complete v1
 * content leaves the walk `incomplete`; what was read is still kept.
 *
 * `batch` > 0 reads up to that many ids per call (`content.read {ids}`): a Joomla read rebuilds the
 * site's whole projection whatever it answers (~0.5 s on the stand's Northgate site), so one call per
 * record put a 101-123-record snapshot past `LOCATE_BUILD_LIMIT_MS` (27/09/2026). What an answer left
 * `pending` is asked again; a call that brought nothing back reads its first pending id alone
 * (`{id}` pages a record too large for any batch); a `missing` id — gone since the listing — leaves
 * the walk incomplete. A plugin that does not answer `{ids}` (an older one refuses the key) costs
 * one call, then every row is read alone as before.
 * @param {Ask} ask
 * @param {any[]} rows
 * @param {Map<string, any>} into
 * @param {{ concurrency: number, batch?: number, deadline: number, now: () => number }} options
 * @returns {Promise<boolean>} whether every row was read in full
 */
async function readDetails(ask, rows, into, { concurrency, batch = 0, deadline, now }) {
  let whole = true
  /** @param {any} answer @param {string} id */
  const keep = (answer, id) => {
    const content = answer?.schemaVersion === 'tracy-content/v1' ? answer.contents?.[0] : null
    if (!content || content.id !== id) return false
    into.set(id, content)
    return content.detailState === 'complete'
  }
  const one = async (id) => {
    if (!keep(await ask({ id }).catch(() => null), id)) whole = false
  }
  let queue = rows.map((row) => row.id)
  if (batch > 0 && queue.length > 0) {
    const asked = queue.slice(0, batch)
    const first = await ask({ ids: asked }).catch(() => null)
    if (isBatchAnswer(first)) {
      /** @param {string[]} ids @param {any} answer @returns {string[]} what to ask again */
      const settle = (ids, answer) => {
        if (!isBatchAnswer(answer)) {
          whole = false
          return []
        }
        const wanted = new Set(ids)
        const got = new Set()
        for (const content of answer.contents) {
          if (!wanted.has(content?.id) || got.has(content.id)) continue
          got.add(content.id)
          into.set(content.id, content)
          if (content.detailState !== 'complete') whole = false
        }
        const pending = [...new Set(answer.pagination.pending)].filter((id) => wanted.has(id) && !got.has(id))
        const missing = answer.pagination.missing.filter((id) => wanted.has(id))
        // An id named neither answered, pending nor missing: a plugin answering something else.
        if (missing.length > 0 || got.size + pending.length < ids.length) whole = false
        return pending
      }
      queue = [...settle(asked, first), ...queue.slice(batch)]
      const worker = async () => {
        while (queue.length > 0) {
          if (now() > deadline) {
            whole = false
            return
          }
          const ids = queue.splice(0, batch)
          const pending = settle(ids, await ask({ ids }).catch(() => null))
          if (pending.length === 0) continue
          // Nothing of this batch came back: its first pending record is read alone.
          if (pending.length === ids.length) {
            await one(pending[0])
            queue.push(...pending.slice(1))
          } else queue.push(...pending)
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
      return whole
    }
  }
  const worker = async () => {
    while (queue.length > 0) {
      if (now() > deadline) {
        whole = false
        return
      }
      await one(/** @type {string} */ (queue.shift()))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  return whole
}

/**
 * The listing rows one language's snapshot indexes: the records in `locale`, plus every shared
 * record that has no locale of its own. A Claude Cowork plugin's `locale` filter leaves out records
 * whose locale is null, and those are exactly the parts every language shows — WordPress template
 * parts, menus and site identity, Joomla modules assigned to all languages (171 of 950 rows on the
 * stand's WordPress site, 27/09/2026). Without them the header, footer and menus of every page could
 * not answer. They come from a second walk filtered by `type: 'shared'`, which is cheap (only shared
 * rows) and adds each id once. With no locale the one unfiltered walk already lists everything.
 * @param {Ask} ask
 * @param {string|null} locale
 * @returns {Promise<{ rows: any[], listed: boolean, siteUrl: string|null, refusal: any,
 *   truncated: boolean }>}
 */
async function listRows(ask, locale) {
  const rowsOf = (walk) =>
    walk.listings.flatMap((listing) => (Array.isArray(listing?.contents) ? listing.contents : []))
  const main = await walkListing(ask, locale ? { locale } : {})
  const rows = rowsOf(main)
  const result = {
    rows,
    listed: main.listings.length > 0,
    siteUrl: typeof main.listings[0]?.site?.url === 'string' ? main.listings[0].site.url : null,
    refusal: main.refusal,
    truncated: main.truncated
  }
  if (!locale || !result.listed) return result
  const shared = await walkListing(ask, { type: 'shared' })
  const seen = new Set(rows.map((row) => row?.id))
  for (const row of rowsOf(shared)) {
    if (row?.type !== 'shared' || (row.locale ?? null) !== null || seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }
  // A shared walk that was refused or cut short leaves the snapshot incomplete, like the main walk.
  return {
    ...result,
    refusal: result.refusal ?? shared.refusal,
    truncated: result.truncated || shared.truncated
  }
}

/**
 * The rows to read first: this page, then shared parts (headers, menus, footers — on every page),
 * then the rest. An answer cut by the budget then still holds the likeliest records.
 */
function readingOrder(rows, pageUrl, siteUrl) {
  const weight = (row) =>
    typeof row?.url === 'string' && linkShowsPage(pageUrl, row.url, siteUrl)
      ? 0
      : row?.type === 'shared'
        ? 1
        : 2
  return [...rows].sort((a, b) => weight(a) - weight(b))
}

/**
 * SNAPSHOTS OF THE VALUE INDEX, IN MEMORY, PER PROCESS (stage 1; a second tracy-web process builds
 * its own). One snapshot per site + locale + principal class (the published projection this relay
 * reads with its own authority is the same for every seat, so one class today); it is valid while
 * the hash of every indexed record's `revision` (`version`) matches the site's listing now.
 *
 * - Every call walks the listing (the same walk `content.read {view:"pages", changedSince}`
 *   answers) and re-reads only the records whose revision moved; removed ones leave.
 * - After `LOCATE_MAX_AGE_MS` the snapshot is built again from nothing.
 * - A walk or build that did not finish — a listing cut at `PAGES_MAX_CALLS`, a refused or failed
 *   read, the record cap, a partial detail — is NEVER kept: its answer says `incomplete`.
 * - No snapshot: the build starts within the call; the call waits `LOCATE_BUDGET_MS` at most and
 *   then answers from what was read so far, `incomplete`. The build runs on (up to
 *   `LOCATE_BUILD_LIMIT_MS`) and is kept when it finishes whole, so the next pick is answered from it.
 * - Single-flight per key: calls that arrive while a build or a revalidation runs join it rather
 *   than start their own, so a warm (`warm: true`, sent when the picker turns on) and the first pick
 *   behind it cost one build.
 * - The site head a page's language is read against (`headFor`) is kept `headMaxAgeMs`, asked once
 *   per site at a time, and never waited on longer than the call's budget.
 * @param {{ now?: () => number, maxAgeMs?: number, budgetMs?: number, buildLimitMs?: number,
 *   maxRecords?: number, headMaxAgeMs?: number, headRetryMs?: number,
 *   onBuilt?: (built: { siteKey: string, locale: string|null, records: number,
 *   kept: boolean, ms: number }) => void }} [options] - `onBuilt` hears each build from nothing as
 *   it ends (the door logs it: one line per build is how a stand shows a warm and a pick shared one).
 */
export function createLocateStore(options = {}) {
  const {
    onBuilt = () => {},
    now = Date.now,
    maxAgeMs = LOCATE_MAX_AGE_MS,
    budgetMs = LOCATE_BUDGET_MS,
    buildLimitMs = LOCATE_BUILD_LIMIT_MS,
    maxRecords = LOCATE_MAX_RECORDS,
    headMaxAgeMs = LOCATE_HEAD_MAX_AGE_MS,
    headRetryMs = LOCATE_HEAD_RETRY_MS
  } = options
  /** @type {Map<string, Snapshot>} */
  const kept = new Map()
  /** @type {Map<string, { progress: Map<string, any>, siteUrl: string|null, done: Promise<void> }>} */
  const building = new Map()

  /** @type {Map<string, Promise<{ index: ValueIndex, incomplete: boolean, cached: boolean }>>} */
  const checking = new Map()

  /**
   * Walk the listing and bring a kept snapshot up to date. `cached` = nothing moved, nothing re-read.
   * @param {string} key
   * @param {Snapshot} held
   * @param {Record<string, unknown>} scope
   * @param {{ locale: string|null, ask: Ask, concurrency: number, batch: number }} input
   */
  async function revalidate(key, held, scope, { locale, ask, concurrency, batch }) {
    // One deadline for the whole recheck, taken before the listing: measured from after it, a slow
    // listing bought the detail reads a FULL budget of their own on top of the time it had already
    // spent (28/09).
    const deadline = now() + budgetMs
    const walk = await listRows(ask, locale)
    const rows = walk.rows
    if (walk.refusal !== null || walk.truncated) return { index: held.index, incomplete: true, cached: false }
    const version = versionOf(scope, rows)
    if (version === held.version) return { index: held.index, incomplete: false, cached: true }
    // The listing alone spent the budget: the snapshot as it stands, rather than reading on past it.
    if (now() >= deadline) return { index: held.index, incomplete: true, cached: false }
    const { changed, removed } = changesBetween(held.revisions, rows)
    const details = new Map(held.details)
    for (const id of removed) details.delete(id)
    const whole = await readDetails(ask, changed, details, { concurrency, batch, deadline, now })
    const index = indexContents([...details.values()], { siteUrl: held.siteUrl })
    if (!whole) return { index, incomplete: true, cached: false }
    kept.set(key, {
      at: held.at,
      version,
      revisions: new Map(rows.map((row) => [row.id, row.revision ?? null])),
      details,
      siteUrl: held.siteUrl,
      index
    })
    return { index, incomplete: false, cached: false }
  }

  const keyOf = ({ siteKey, locale, principalClass }) =>
    JSON.stringify([siteKey, locale ?? null, principalClass])

  /**
   * The index to answer one call from.
   * @param {{ siteKey: string, locale: string|null, principalClass: string, pageUrl: string,
   *   ask: Ask, concurrency?: number, batch?: number }} input - `batch`: ids per detail read
   *   (`content.read {ids}`), 0 for one read per record (`readDetails`)
   * @returns {Promise<{ index: ValueIndex, incomplete: boolean, cached: boolean, refusal?: any }>}
   *   `cached`: answered from a kept snapshot that the listing showed unchanged (nothing re-read).
   */
  async function snapshotFor({ siteKey, locale, principalClass, pageUrl, ask, concurrency = 1, batch = 0 }) {
    const key = keyOf({ siteKey, locale, principalClass })
    const scope = {
      site: siteKey,
      principal: principalClass,
      walk: locale ? { locale, plus: 'shared without locale' } : {}
    }
    const held = kept.get(key)
    if (held && now() - held.at <= maxAgeMs) {
      // One revalidation per key at a time: a warm and the first pick that follows it, or two seats
      // picking at once, share one listing walk and one re-read of what moved.
      let check = checking.get(key)
      if (!check) {
        check = revalidate(key, held, scope, { locale, ask, concurrency, batch }).finally(() =>
          checking.delete(key)
        )
        checking.set(key, check)
        // The shared copy keeps running after the race below gives up, and its failure is nobody's to
        // read by then: handled here so it cannot surface as an unhandled rejection.
        check.catch(() => {})
      }
      // 🔒 A PICK WAITS ITS OWN BUDGET, NEVER THE SITE'S READ (28/09/2026). A BUILD was raced against
      // `budgetMs`; the recheck of a kept snapshot was awaited outright, and every pick shares that one
      // promise (`checking`). One slow read on the component — the door allows 170 s — therefore held
      // every pick queued behind it for as long as the site took: measured 3,000 ms against a 100 ms
      // budget. Past the budget the pick is answered from the snapshot it has, marked `incomplete`;
      // the recheck runs on in the background and the NEXT pick gets what it found.
      return await Promise.race([
        check,
        after(budgetMs).then(() => ({ index: held.index, incomplete: true, cached: false }))
      ])
    }
    if (held) kept.delete(key)

    let run = building.get(key)
    let refusal = null
    if (!run) {
      const progress = new Map()
      const state = { progress, siteUrl: null, refusal: null, done: Promise.resolve() }
      const started = now()
      state.done = (async () => {
        const walk = await listRows(ask, locale)
        const rows = walk.rows
        state.siteUrl = walk.siteUrl
        if (walk.refusal !== null && !walk.listed) {
          state.refusal = walk.refusal
          return
        }
        const ordered = readingOrder(rows, pageUrl, state.siteUrl).slice(0, maxRecords)
        const whole = await readDetails(ask, ordered, progress, {
          concurrency,
          batch,
          deadline: started + buildLimitMs,
          now
        })
        if (!whole || walk.refusal !== null || walk.truncated || rows.length > maxRecords) return
        kept.set(key, {
          at: now(),
          version: versionOf(scope, rows),
          revisions: new Map(rows.map((row) => [row.id, row.revision ?? null])),
          details: progress,
          siteUrl: state.siteUrl,
          index: indexContents([...progress.values()], { siteUrl: state.siteUrl })
        })
      })()
        .catch(() => {})
        .finally(() => {
          building.delete(key)
          try {
            onBuilt({ siteKey, locale, records: progress.size, kept: kept.has(key), ms: now() - started })
          } catch {}
        })
      building.set(key, state)
      run = state
    }
    const finished = await Promise.race([run.done.then(() => true), after(budgetMs).then(() => false)])
    refusal = /** @type {any} */ (run).refusal
    if (refusal) return { index: indexContents([]), incomplete: true, cached: false, refusal }
    const done = finished ? kept.get(key) : undefined
    if (done) return { index: done.index, incomplete: false, cached: false }
    return {
      index: indexContents([...run.progress.values()], { siteUrl: run.siteUrl }),
      incomplete: true,
      cached: false
    }
  }

  /** @type {Map<string, { at: number, head: any }>} */
  const heads = new Map()
  /** @type {Map<string, Promise<{ head: any } | { refusal: any } | { failed: true }>>} */
  const asking = new Map()

  /**
   * The site head a page's language is read against (`askHead`): kept `headMaxAgeMs` once it came,
   * asked once per site at a time (a warm and the pick behind it share one read), and waited on no
   * longer than `budgetMs` — a head still unanswered by then is `failed` for this call, and is kept
   * for the next one when it lands.
   *
   * 🔒 NO HEAD IS NO LANGUAGE, NOT "EVERY LANGUAGE". A caller that read a failed head as "the page's
   * language is unknown" would build an all-language snapshot: past `LOCATE_MAX_RECORDS` on a
   * many-language site, never kept, so every pick after it answered `incomplete` from a build that
   * could not finish (the Joomla stand, whose reader refuses overlapping reads). `failed` is its own
   * answer so the caller can say `incomplete` at once instead.
   * @param {{ siteKey: string, ask: Ask }} input
   * @returns {Promise<{ head: any } | { refusal: any } | { failed: true }>}
   */
  async function headFor({ siteKey, ask }) {
    const held = heads.get(siteKey)
    if (held && now() - held.at < headMaxAgeMs) return { head: held.head }
    let run = asking.get(siteKey)
    if (!run) {
      run = askHead(ask, { retryMs: headRetryMs })
        .then((got) => {
          if ('head' in got) heads.set(siteKey, { at: now(), head: got.head })
          return got
        })
        .finally(() => asking.delete(siteKey))
      asking.set(siteKey, run)
    }
    return Promise.race([run, after(budgetMs).then(() => /** @type {{ failed: true }} */ ({ failed: true }))])
  }

  return {
    snapshotFor,
    headFor,
    /** Forget every snapshot and head (tests; a deploy restarts the process anyway). */
    clear() {
      kept.clear()
      heads.clear()
    }
  }
}
