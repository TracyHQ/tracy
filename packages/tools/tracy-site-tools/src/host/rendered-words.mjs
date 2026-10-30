/**
 * WORDS A WORDPRESS THEME PRINTS WHEN THE PAGE RENDERS — the `content.renderedWords` road of
 * `content.replace` (claude-cowork, `info.rendered_words`).
 *
 * Some themes put a pattern's words into a page at render time (a `the_content` filter): no post,
 * part, template or option holds them, so every store search ends in "words in no record". The plugin
 * keeps a per-page list of replacement rules instead — one setting, revertible with `apply.revert` —
 * and proves each rule against the page it renders before and after writing.
 *
 * 🔒 THIS ROAD IS THE LAST ONE, NEVER A SHORTCUT. `replace-wordpress.mjs` takes it only when every
 * store search finished without a writable match (no read error, no cut list, no guarded record, no
 * ambiguity), the words sit in the page's main region, the plugin advertises the action, and
 * `inspect` finds the words on the page it renders. Anything short of that answers as before.
 */

import { createHash } from 'node:crypto'

import { decodeEntities } from './html-units.mjs'
import {
  clip,
  followHref,
  isEmail,
  isPhone,
  REPLACE_CONFIRM_OVER,
  REPLACE_HREF_MAX,
  receipt,
  replaceText,
  undoOf
} from './replace.mjs'

/** @typedef {import('./replace.mjs').ReplaceChange} ReplaceChange */
/** @typedef {import('./replace.mjs').ReplacePlan} ReplacePlan */
/** @typedef {(action: string, params: Record<string, unknown>) => Promise<any>} Door */

export const RENDERED_WORDS_ACTION = 'content.renderedWords'

/** Rules one apply carries, at most, when the plugin does not say (`info.rendered_words`). */
const RULES_MAX = 16

/**
 * The sentences of this road (T10: an error ≤ 160 characters, a next ≤ 200), held on their worst case
 * by `test/replace-wordpress-rendered-words.test.mjs`. None of them sends the agent to the theme's
 * files or the Site Editor: neither holds these words.
 */
export const RENDERED_TEXT = Object.freeze({
  olderError:
    'the theme prints "{find}" when the page renders; this site\'s plugin cannot replace such words',
  olderNext:
    "tell the customer these words come from the theme and cannot change here until the site's Claude Cowork plugin is updated; that is an answer",
  notOneError:
    'the theme prints "{find}" when the page renders, but not as one piece of text; nothing was written',
  notOneNext:
    'change a shorter part that sits in one line of the page, or tell the customer this text cannot change here',
  hrefStoredError: '"{find}" is a link kept in {what}; nothing was written',
  hrefStoredNext:
    'href:true changes only links the theme prints: content.get that record and change the link with content.update',
  hrefMissingError: 'no link to "{find}" is on {path}; nothing was written',
  hrefMissingNext:
    'page.text {path:"{path}"} shows the page; send the link target exactly as the page has it',
  hrefValueError: '"{replace}" is not a link a page can carry; nothing was written',
  hrefValueNext: 'send a full https:// address, a tel: or mailto: link, a /path or a #fragment',
  mixedError:
    'some of these words are in records and some the theme prints when the page renders; nothing was written',
  mixedNext: 'send the theme-printed words in a call of their own: {find}',
  emptyError: 'the theme prints "{find}" when the page renders; such words can be replaced, not removed',
  emptyNext:
    'the same call with the new words in replace, or tell the customer this text cannot be taken out here',
  tooManyError: 'this change needs {n} rules on {path}; one call carries {max} at most; nothing was written',
  tooManyNext: 'send fewer changes per call: one or two finds at a time',
  ambiguousError: '"{find}" is printed {n} times on {path}; nothing was written',
  ambiguousNext: 'the same call with all:"page" changes every one of them on this page',
  readError: 'this site could not show what its theme prints on {path}; nothing was written',
  readNext: 'make the same call once; if it fails again, tell the customer the page cannot be read right now',
  rebaseError: 'the theme changed after earlier edits on {path}; nothing was written',
  rebaseNext:
    'send all earlier theme-printed edits of this page together, or undo them newest first; this call cannot restore edits it did not name',
  rebaseNote:
    'this call covers every earlier theme-printed rule; applying it will bind only these requested edits to the current theme',
  changedError: '{path} changed while this call ran; nothing was written',
  changedNext:
    'someone else is editing this site: tell the customer, and make the same call once when they are done',
  writeError: 'the site refused to keep the new words for {path}: {why}',
  writeNext: 'tell the customer this change cannot be made here right now; that is an answer',
  themeNote:
    'the theme prints these words on {path}: the site now keeps the new words for this page in one setting',
  shownNote: 'shown on {path}',
  cacheNote: 'not shown on {path} yet: a page cache may still hold the old words',
  notCheckedNote: 'not checked: the page could not be read again',
  placeError:
    'the page this call read shows "{find}" elsewhere than where the theme now prints it; nothing was written',
  placeNext:
    'page.text {path:"{path}", match:"<the words>"} shows where they are now; make the same call once more, or tell the customer the words stay',
  // Why the road was not taken, one sentence per gate, so a closed road never reads as one tried and
  // failed (`closedAnswer`).
  allNext:
    'these words are printed on {path} by the theme, and such words change one page at a time: the same call with all:"page" instead of all:true',
  outsideNext:
    'printed by the theme outside the main part: content.find {text:"<words>"} names its translation call; content.contract {operation:"string", domain, msgid, locale, value} changes it; else they stay',
  noRecordNext:
    'printed by the theme on a list page: content.find {text:"<words>"} names its translation call; content.contract {operation:"string", domain, msgid, locale, value} changes it; else they stay',
  unscannedNext:
    "the site's plugin could not read {path} as it reads a page, so the words the theme prints there stay: tell the customer which words stay and why",
  unsupportedNext:
    'printed by the theme here: content.find {text:"<words>"} names its translation call; content.contract {operation:"string", domain, msgid, locale, value} changes it; else they stay',
  viewerNext:
    "words the theme prints change only through the agent's own call, and this one went out as a viewer: tell the customer which words stay and why",
  stayError: 'the theme prints "{find}" when the page renders; nothing was written',
  // The same sentence as `replace-wordpress.mjs` `untracedNext`, which reads it from here.
  stayNext:
    'printed by the theme: content.find {text:"<words>"} names its translation call; content.contract {operation:"string", domain, msgid, locale, value} changes it; else tell the customer they stay',
  renderedWhy: 'words the theme prints when the page renders',
  linkHeldNote:
    'the {href} link stays: it is kept in {what}; content.get that record and change it with content.update',
  linkAwayNote: 'the {href} link stays: the page prints it away from these words',
  linkPhone: 'the link follows the number',
  linkEmail: 'the link follows the address'
})

/** Quoted facts cut so a long one cannot push a sentence past its budget. */
const WIDTH = Object.freeze({ find: 60, replace: 60, what: 50, path: 40, why: 60, href: 60 })

/**
 * @param {keyof typeof RENDERED_TEXT} key
 * @param {Record<string, unknown>} [facts]
 */
export function renderedText(key, facts = {}) {
  return RENDERED_TEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in facts)) return whole
    const v = String(facts[name])
    const width = WIDTH[/** @type {keyof typeof WIDTH} */ (name)] ?? Infinity
    return v.length > width ? `${v.slice(0, width - 1)}…` : v
  })
}

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * @param {string} code
 * @param {string} error
 * @param {string} next
 * @param {Record<string, unknown>} [extra]
 */
const refuse = (code, error, next, extra = {}) => ({ ok: false, code, verdict: code, error, next, ...extra })

/**
 * What the site's plugin says it can do with rendered words, or null when it says nothing (an older
 * plugin) or cannot inspect and apply text.
 * @param {unknown} info - the `info` answer
 * @returns {{ href: boolean, maxRules: number, composition?: boolean } | null}
 */
export function renderedSupport(info) {
  if (!isRecord(info) || info.ok === false) return null
  const rw = isRecord(info.rendered_words)
    ? info.rendered_words
    : isRecord(info.info) && isRecord(info.info.rendered_words)
      ? info.info.rendered_words
      : null
  if (!rw) return null
  const ops = Array.isArray(rw.operations) ? rw.operations : []
  const targets = Array.isArray(rw.targets) ? rw.targets : []
  if (!ops.includes('inspect') || !ops.includes('apply') || !targets.includes('text')) return null
  const max =
    Number.isInteger(rw.max_rules_request) && rw.max_rules_request > 0 ? rw.max_rules_request : RULES_MAX
  return {
    href: targets.includes('attribute:href'),
    maxRules: Math.min(max, RULES_MAX),
    ...(Array.isArray(rw.composition) && rw.composition.includes('whole-output') ? { composition: true } : {})
  }
}

/**
 * A link target the plugin keeps: an http(s) address with a host, `tel:`, `mailto:`, a `/path` or a
 * `#fragment`.
 * @param {string} href
 */
export function linkTargetOk(href) {
  if (href.length > REPLACE_HREF_MAX || /\s/.test(href)) return false
  if (/^(tel|mailto):\S+$/i.test(href)) return true
  if (/^\/(?!\/)/.test(href) || /^#\S/.test(href)) return true
  try {
    const u = new URL(href)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== ''
  } catch {
    return false
  }
}

/** The plugin scanner's element lists (`RenderedWords.php` `EXCLUDED`, `RAW_TEXT`, `VOID`). */
const SCAN_EXCLUDED = new Set([
  'head',
  'title',
  'form',
  'script',
  'style',
  'textarea',
  'select',
  'option',
  'optgroup',
  'datalist',
  'button',
  'template',
  'noscript',
  'iframe',
  'object',
  'svg',
  'math'
])
const SCAN_RAW_TEXT = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript'
])
const SCAN_VOID = new Set([
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
  'param',
  'source',
  'track',
  'wbr',
  'keygen'
])
const SPACE = ' \t\n\r\f'
/**
 * Elements that flow inside a line of text. Opening or closing any other element — a block, a table
 * part, `<hr>`, `<br>`, one this list does not know — ends the run of text a link may sit beside.
 */
const SCAN_INLINE = new Set([
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
  'font',
  'i',
  'img',
  'ins',
  'kbd',
  'label',
  'mark',
  'math',
  'nobr',
  'picture',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'svg',
  'time',
  'u',
  'var',
  'wbr'
])

/**
 * One tag at `<`: its name, its `href` values and where it ends — `RenderedWords::tag`, line for line.
 * @param {string} html
 * @param {number} lt
 * @returns {{ name: string, hrefs: (string | null)[], end: number, selfClosing: boolean } | null}
 */
function scanTag(html, lt) {
  const m = /^<([^\s/>]+)/.exec(html.slice(lt, lt + 256))
  if (!m) return null
  const name = m[1].toLowerCase()
  let i = lt + m[0].length
  /** @type {(string | null)[]} */
  const hrefs = []
  const skip = (/** @type {number} */ k) => {
    while (k < html.length && SPACE.includes(html[k])) k += 1
    return k
  }
  for (;;) {
    i = skip(i)
    if (i >= html.length) return null
    const c = html[i]
    if (c === '>') return { name, hrefs, end: i + 1, selfClosing: false }
    if (c === '/') {
      if (html[i + 1] === '>') return { name, hrefs, end: i + 2, selfClosing: true }
      i += 1
      continue
    }
    const an = /^=?[^\s/>=]*/.exec(html.slice(i, i + 256))?.[0] ?? ''
    const attr = an.toLowerCase()
    i += an.length
    let j = skip(i)
    if (html[j] !== '=') {
      if (attr === 'href') hrefs.push(null)
      continue
    }
    j = skip(j + 1)
    if (j >= html.length) return null
    const q = html[j]
    if (q === '"' || q === "'") {
      const close = html.indexOf(q, j + 1)
      if (close === -1) return null
      if (attr === 'href') hrefs.push(html.slice(j + 1, close))
      i = close + 1
      continue
    }
    let run = j
    while (run < html.length && !`${SPACE}>`.includes(html[run])) run += 1
    if (attr === 'href') hrefs.push(html.slice(j, run))
    i = run
  }
}

/**
 * @typedef {{ kind: 'text' | 'attribute', path: string, value: string, ids: number[], run: number }} ScannedPlace
 *   A place the plugin may replace words in: a text node (`value` decoded) or an `<a href>` value.
 *   `ids`: the open elements above it, numbered in page order (an `<a>`'s own last), so two places
 *   with the same tag path are told apart. `run`: the line of text it is in — two places share it
 *   when only inline elements open or close between them, so they share their nearest block too.
 *   Neither is part of the plugin's anchor.
 */

/** Whether an element under `stack` is inside an `<svg>` or `<math>`: its tags draw, they break no line. */
const inForeign = (/** @type {readonly string[]} */ stack) => stack.includes('svg') || stack.includes('math')

/**
 * The places the plugin's scanner sees on a page, each with its element path — a port of
 * `RenderedWords::scan` (claude-cowork), so an inspect's anchors can be checked against the page
 * this call read. Null where the plugin's scanner gives up too.
 *
 * 🔒 WHY A PORT. The plugin answers each candidate by an opaque anchor, a hash of the tag-name path
 * above the words; nothing else in its answer says where they are. Only the same path, hashed the
 * same way, ties a candidate to a place this call saw — so a rule is never written over words the
 * page read showed nowhere, or in another region (review 23/10/2026).
 * @param {string} html
 * @returns {ScannedPlace[] | null}
 */
export function scanPlaces(html) {
  if (typeof html !== 'string' || html.length > 2 * 1024 * 1024) return null
  /** @type {string[]} */
  let stack = []
  /** @type {number[]} */
  let ids = []
  let opened = 0
  let run = 0
  let excluded = 0
  /** @type {ScannedPlace[]} */
  const out = []
  let textStart = 0
  let pos = 0
  const flush = (/** @type {number} */ from, /** @type {number} */ to) => {
    if (to <= from || excluded !== 0) return
    const raw = html.slice(from, to)
    if ([...raw].every((ch) => SPACE.includes(ch))) return
    out.push({ kind: 'text', path: stack.join('/'), value: decodeEntities(raw), ids: [...ids], run })
  }
  while (pos < html.length) {
    const lt = html.indexOf('<', pos)
    if (lt === -1) break
    const next = html[lt + 1] ?? ''
    if (html.startsWith('<!--', lt)) {
      flush(textStart, lt)
      const dash = html[lt + 4] === '-' ? 1 : 0
      let end
      if (html[lt + 4 + dash] === '>') end = lt + 4 + dash
      else {
        end = html.indexOf('-->', lt + 4)
        if (end === -1) return null
        end += 2
      }
      pos = textStart = end + 1
      continue
    }
    if (next === '!' || next === '?') {
      flush(textStart, lt)
      const cdata = html.startsWith('<![CDATA[', lt)
      const end = cdata ? html.indexOf(']]>', lt + 9) : html.indexOf('>', lt + 2)
      if (end === -1) return null
      pos = textStart = end + (cdata ? 3 : 1)
      continue
    }
    if (next === '/') {
      flush(textStart, lt)
      const gt = html.indexOf('>', lt + 2)
      if (gt === -1) return null
      const m = /^<\/([A-Za-z][^\s/>]*)/.exec(html.slice(lt, lt + 256))
      if (m) {
        const at = stack.lastIndexOf(m[1].toLowerCase())
        if (at !== -1) {
          for (let k = stack.length - 1; k > at; k -= 1) if (SCAN_EXCLUDED.has(stack[k])) return null
          if (stack.slice(at).some((x, k) => !SCAN_INLINE.has(x) && !inForeign(stack.slice(0, at + k))))
            run += 1
          stack = stack.slice(0, at)
          ids = ids.slice(0, at)
          excluded = stack.filter((x) => SCAN_EXCLUDED.has(x)).length
        }
      }
      pos = textStart = gt + 1
      continue
    }
    if (!/[A-Za-z]/.test(next)) {
      pos = lt + 1
      continue
    }
    flush(textStart, lt)
    const tag = scanTag(html, lt)
    if (tag === null) return null
    const { name, end, selfClosing } = tag
    const id = (opened += 1)
    if (!SCAN_INLINE.has(name) && !inForeign(stack)) run += 1
    if (name === 'a' && excluded === 0 && tag.hrefs.length === 1 && tag.hrefs[0] !== null)
      out.push({
        kind: 'attribute',
        path: [...stack, 'a'].join('/'),
        value: decodeEntities(tag.hrefs[0]),
        ids: [...ids, id],
        run
      })
    if (name === 'plaintext') return null
    if (SCAN_RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])`, 'i').exec(
        html.slice(end)
      )
      if (!close) return null
      const gt = html.indexOf('>', end + close.index)
      if (gt === -1) return null
      pos = textStart = gt + 1
      continue
    }
    const foreign = stack.includes('svg') || stack.includes('math') || name === 'svg' || name === 'math'
    if (!SCAN_VOID.has(name) && !(selfClosing && foreign)) {
      stack.push(name)
      ids.push(id)
      if (SCAN_EXCLUDED.has(name)) excluded += 1
    }
    pos = textStart = end
  }
  flush(textStart, html.length)
  return out
}

/**
 * The plugin's anchor for an element path (`RenderedWords::anchor`).
 * @param {'text' | 'attribute'} kind
 * @param {string} path
 */
export function anchorOf(kind, path) {
  return createHash('sha256').update(`rw1|${kind}|${path}`).digest('hex').slice(0, 16)
}

/**
 * The region an element path is in, by its landmark tags as `html-units.mjs` `regionOf` reads them:
 * the outermost `<main>`, or `<header>`/`<footer>` outside any section, article or aside; with no
 * landmark, `main`.
 * @param {string} path
 */
export function regionOfPath(path) {
  let sectioned = false
  for (const tag of path.split('/')) {
    if (tag === 'main') return 'main'
    if ((tag === 'header' || tag === 'footer') && !sectioned) return tag
    if (tag === 'section' || tag === 'article' || tag === 'aside') sectioned = true
  }
  return 'main'
}

/**
 * Where this call's page read puts one target, as the plugin would anchor it: anchor → how often the
 * target's old words (or link) sit there, and the region of that place.
 * @param {ScannedPlace[]} places
 * @param {{ kind: 'text' | 'attribute', old: string }} t
 * @returns {Map<string, { count: number, region: string }>}
 */
export function placesOfTarget(places, t) {
  /** @type {Map<string, { count: number, region: string }>} */
  const out = new Map()
  for (const p of places) {
    if (p.kind !== t.kind) continue
    const n = t.kind === 'text' ? p.value.split(t.old).length - 1 : p.value === t.old ? 1 : 0
    if (n === 0) continue
    const key = anchorOf(t.kind, p.path)
    const had = out.get(key)
    out.set(key, { count: (had?.count ?? 0) + n, region: regionOfPath(p.path) })
  }
  return out
}

/**
 * Whether a link sits beside the words it follows at every place the page prints it: it wraps them,
 * or nothing but whitespace and inline elements lies between the words and the link — the text place
 * right before the link ends with the words, or the one right after its contents starts with them,
 * in the same run of text (no block, `<hr>` or `<br>` between, one nearest block). A `tel:` link with
 * the same number in another paragraph, or past a separator, is not the one the changed words carry.
 * @param {ScannedPlace[]} places
 * @param {string} href
 * @param {readonly string[]} words - the changed words as the page spells them
 */
export function linkBesideWords(places, href, words) {
  const spelled = words.filter((w) => w !== '')
  const text = (/** @type {ScannedPlace | undefined} */ q, /** @type {number} */ run) =>
    q?.kind === 'text' && q.run === run ? q.value : null
  let seen = false
  for (const [i, p] of places.entries()) {
    if (p.kind !== 'attribute' || p.value !== href) continue
    seen = true
    const own = p.ids[p.ids.length - 1]
    let k = i + 1
    let wraps = false
    while (k < places.length && places[k].kind === 'text' && places[k].ids.includes(own)) {
      if (spelled.some((w) => places[k].value.includes(w))) wraps = true
      k += 1
    }
    // The same run as the link's own start: a block opened or closed inside the link breaks it too.
    const before = text(places[i - 1], p.run)?.trimEnd()
    const after = text(places[k], p.run)?.trimStart()
    const beside =
      (before != null && spelled.some((w) => before.endsWith(w))) ||
      (after != null && spelled.some((w) => after.startsWith(w)))
    if (!wraps && !beside) return false
  }
  return seen
}

/**
 * Every `<a href>` value of a page, decoded, in page order and once each.
 * @param {string} html
 */
export function linkTargetsOf(html) {
  /** @type {Set<string>} */
  const out = new Set()
  for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi))
    out.add(decodeEntities(m[1] ?? m[2] ?? '').trim())
  out.delete('')
  return [...out]
}

/**
 * A link target as a stored record may spell it: as is, entity-escaped, or JSON-escaped.
 * @param {string} href
 */
export function storedSpellings(href) {
  const amp = href.replace(/&/g, '&amp;')
  return [...new Set([href, amp, href.replace(/\//g, '\\/'), amp.replace(/\//g, '\\/')])]
}

/**
 * @typedef {{ kind: 'text' | 'attribute', name?: 'href', old: string, new: string, change: number,
 *   follows?: 'phone' | 'email' }} Target
 *   One thing the plugin is asked to find: the change's words, or a link target. `follows`: a `tel:`
 *   or `mailto:` link that follows a changed number or address, not a change the call named.
 */

/**
 * The targets of a call: each change's words as the page spells them, its following links, and each
 * `href:true` change as a link target.
 * @param {readonly ReplaceChange[]} changes
 * @param {{ html: string, spellings: (find: string) => string[], href: boolean,
 *   linkLeft?: (href: string, words: string[]) => string | null, left?: string[] }} page - `linkLeft`:
 *   why a following link stays as it is (a record holds it, or it is printed away from `words`, the
 *   change's words as the page spells them), or null; each such reason goes into `left`.
 * @returns {{ ok: true, targets: Target[] } | Record<string, unknown>}
 */
export function renderedTargets(changes, page) {
  /** @type {Target[]} */
  const targets = []
  const links = linkTargetsOf(page.html)
  for (const [i, c] of changes.entries()) {
    if (c.href === true) {
      if (!page.href) return { ok: false, older: true }
      if (!linkTargetOk(c.replace))
        return refuse(
          'VALUE_NOT_ALLOWED',
          renderedText('hrefValueError', { replace: c.replace }),
          renderedText('hrefValueNext'),
          {
            param: 'replace',
            rule: 'link-target'
          }
        )
      targets.push({ kind: 'attribute', name: 'href', old: c.find, new: c.replace, change: i })
      continue
    }
    if (c.replace.trim() === '')
      return refuse(
        'VALUE_NOT_ALLOWED',
        renderedText('emptyError', { find: c.find }),
        renderedText('emptyNext'),
        {
          rule: 'cannot-empty'
        }
      )
    const words = page.spellings(c.find)
    for (const old of words) targets.push({ kind: 'text', old, new: c.replace, change: i })
    if (!page.href || !(isPhone(c.find) || isEmail(c.find))) continue
    for (const href of links) {
      const to = followHref(href, c.find, c.replace)
      if (to === null || to === href) continue
      // 🔒 A FOLLOWING LINK ONLY WHERE NO RECORD HOLDS IT AND THE PAGE PRINTS IT BESIDE THE WORDS: a
      // `tel:` link a header part keeps is that part's, never a rule over the page (review 23/10/2026).
      const why = page.linkLeft?.(href, words) ?? null
      if (why !== null) {
        page.left?.push(why)
        continue
      }
      targets.push({
        kind: 'attribute',
        name: 'href',
        old: href,
        new: to,
        change: i,
        follows: isPhone(c.find) ? 'phone' : 'email'
      })
    }
  }
  // One target per thing the page holds: the same link followed by two changes is asked once.
  /** @type {Map<string, Target>} */
  const once = new Map()
  for (const t of targets) once.set(`${t.kind}\u0000${t.old}`, once.get(`${t.kind}\u0000${t.old}`) ?? t)
  return { ok: true, targets: [...once.values()] }
}

/**
 * The inspect answer's own row for one target.
 * @param {Record<string, any>} inspected
 * @param {Target} t
 */
const rowOf = (inspected, t) =>
  (Array.isArray(inspected.targets) ? inspected.targets : []).find(
    (/** @type {any} */ r) =>
      isRecord(r) && r.kind === t.kind && r.old === t.old && (t.kind === 'text' || r.name === t.name)
  )

/**
 * The text a receipt shows for one candidate: its excerpt with the words changed, or the words alone.
 * @param {Record<string, any>} candidate
 * @param {Target} t
 */
function beforeAfter(candidate, t) {
  const excerpt =
    typeof candidate.excerpt === 'string' && candidate.excerpt.includes(t.old) ? candidate.excerpt : null
  if (!excerpt) return { before: clip(t.old, 0, 0), after: clip(t.new, 0, 0) }
  const at = excerpt.indexOf(t.old)
  return {
    before: clip(excerpt, at, at + t.old.length),
    after: clip(`${excerpt.slice(0, at)}${t.new}${excerpt.slice(at + t.old.length)}`, at, at + t.new.length)
  }
}

/**
 * @typedef {{ plan: ReplacePlan, path: string, changes: readonly ReplaceChange[], html: string,
 *   spellings: (find: string) => string[], read: Door, write: Door, mintApplyId: () => string,
 *   confirmed?: boolean, fallback: Record<string, unknown>,
 *   stores?: readonly { raw?: string, label?: string }[] }} RenderedInput
 *   `changes`: every change of the call, words and links; `spellings`: the words of one find as the
 *   page prints them; `fallback`: the store search's refusal, answered in render-time words when the
 *   plugin cannot take this road (`stayAnswer`); `stores`: every record the search read, so no rule
 *   is written over a link one of them holds.
 */

/**
 * Change words the theme prints at render time through `content.renderedWords`: inspect, count,
 * then one apply under this call's own apply id, answered with the receipt.
 * @param {RenderedInput} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function replaceRendered(input) {
  const { plan, path, changes, read, write } = input
  const findOf = (/** @type {number} */ i) => changes[i]?.find ?? ''
  // An `info` that fails or says nothing of rendered words is an older plugin: the search's answer.
  const support = renderedSupport(await read('info', {}))
  const older = () =>
    changes.every((c) => c.href !== true)
      ? stayAnswer(input, 'olderNext')
      : refuse(
          'NOT_SUPPORTED_HERE',
          renderedText('olderError', { find: findOf(0) }),
          renderedText('olderNext'),
          {
            door: RENDERED_WORDS_ACTION
          }
        )
  if (!support) return older()
  // The page this call read, as the plugin's scanner sees it: every candidate must be one of its places.
  const scanned = scanPlaces(input.html)
  if (scanned === null) return stayAnswer(input, 'unscannedNext')
  const stores = input.stores ?? []
  /** @type {string[]} */
  const left = []
  const linkLeft = (/** @type {string} */ href, /** @type {string[]} */ words) => {
    const what = storeHoldingLink(stores, href)
    if (what !== null) return renderedText('linkHeldNote', { href, what })
    const at = [...placesOfTarget(scanned, { kind: 'attribute', old: href }).values()]
    return at.length > 0 && at.every((p) => p.region === 'main') && linkBesideWords(scanned, href, words)
      ? null
      : renderedText('linkAwayNote', { href })
  }
  const built = renderedTargets(changes, {
    html: input.html,
    spellings: input.spellings,
    href: support.href,
    linkLeft,
    left
  })
  if (built.ok !== true)
    return built.older === true ? older() : /** @type {Record<string, unknown>} */ (built)
  const targets = /** @type {Target[]} */ (built.targets)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let inspected = await read(RENDERED_WORDS_ACTION, {
      operation: 'inspect',
      path,
      ...(support.composition ? { composition: 'whole-output' } : {}),
      targets: targets.map((t) => ({ kind: t.kind, ...(t.name ? { name: t.name } : {}), old: t.old }))
    })
    // An old theme's rules are inactive. Rebinding them is safe only if this call supersedes
    // every rule, including href companions, after the normal DOM/candidate selection below.
    const rebase =
      isRecord(inspected) &&
      String(inspected.code ?? inspected.error ?? '').toLowerCase() === 'conflict' &&
      messageOf(inspected) === 'The active theme changed since the rules were written'
    if (rebase)
      inspected = await read(RENDERED_WORDS_ACTION, {
        operation: 'inspect',
        path,
        targets: targets.map((t) => ({ kind: t.kind, ...(t.name ? { name: t.name } : {}), old: t.old }))
      })
    if (!isRecord(inspected) || inspected.ok !== true) return inspectRefusal(inspected, input)
    /** @type {{ t: Target, c: Record<string, any>, region: string }[]} */
    const found = []
    /** @type {string[]} */
    const away = []
    for (const t of targets) {
      const row = rowOf(inspected, t)
      const candidates = Array.isArray(row?.candidates) ? row.candidates.filter(isRecord) : []
      const usable = candidates.filter(
        (c) => typeof c.anchor === 'string' && Number.isInteger(c.count) && c.count > 0
      )
      if (
        usable.some(
          (c) =>
            c.replaces_rule !== undefined &&
            (!support.composition ||
              typeof c.replaces_rule !== 'string' ||
              !/^[a-f0-9]{16}$/.test(c.replaces_rule))
        )
      )
        return refuse('READ_FAILED', renderedText('readError', { path }), renderedText('readNext'))
      // 🔒 A CANDIDATE IS APPLIED ONLY WHERE THE PAGE READ SAW IT (review 23/10/2026). The plugin
      // reads the page again on its own, so its answer must be the same places this call's page holds:
      // each anchor, as often, and nothing more. Words and a following link must also sit in the main
      // region the store search proved them in; a link the call named sits where the call's `where`
      // says, every place of it, or anywhere when the call names no region.
      const seen = placesOfTarget(scanned, t)
      const named = t.kind === 'attribute' && !t.follows
      const regions = [...new Set([...seen.values()].map((p) => p.region))]
      if (named && plan.where !== null && regions.some((r) => r !== plan.where))
        return refuse(
          'NOT_FOUND',
          replaceText('notInWhereError', { find: t.old, where: plan.where, seen: regions.join(', ') }),
          replaceText('notInWhereNext', { region: regions.find((r) => r !== plan.where) }),
          { find: t.old, seenIn: regions }
        )
      const whole =
        usable.length === seen.size &&
        usable.every((c) => seen.get(c.anchor)?.count === c.count) &&
        (named || regions.every((r) => r === 'main'))
      if (!whole) {
        if (t.follows) {
          if (usable.length > 0) away.push(renderedText('linkAwayNote', { href: t.old }))
          continue
        }
        if (usable.length > 0 || seen.size > 0)
          return refuse(
            'NOT_EDITABLE',
            renderedText('placeError', { find: findOf(t.change) }),
            renderedText('placeNext', { path }),
            { find: findOf(t.change) }
          )
        continue
      }
      for (const c of usable) found.push({ t, c, region: /** @type {string} */ (seen.get(c.anchor)?.region) })
    }
    // Every change the call named must be on the page as one piece; a following link may be absent.
    for (const [i, c] of changes.entries()) {
      if (found.some((f) => f.t.change === i && !f.t.follows)) continue
      return c.href === true
        ? refuse(
            'NOT_FOUND',
            renderedText('hrefMissingError', { find: c.find, path }),
            renderedText('hrefMissingNext', { path }),
            {
              find: c.find
            }
          )
        : refuse('NOT_EDITABLE', renderedText('notOneError', { find: c.find }), renderedText('notOneNext'), {
            find: c.find
          })
    }
    if (found.length > support.maxRules)
      return refuse(
        'TOO_MANY',
        renderedText('tooManyError', { n: found.length, max: support.maxRules, path }),
        renderedText('tooManyNext'),
        { count: found.length }
      )
    const placesOf = (/** @type {number} */ i) =>
      found.filter((f) => f.t.change === i && !f.t.follows).reduce((n, f) => n + f.c.count, 0)
    const places = changes.reduce((n, _c, i) => n + placesOf(i), 0)
    const would = found.map(({ t, c, region }) => ({
      at: `rendered:${c.anchor}`,
      where: region,
      ...beforeAfter(c, t),
      ...(c.count > 1 ? { places: c.count } : {})
    }))
    const shown = would.filter((_w, k) => !found[k].t.follows)
    const companions = found
      .filter((f) => f.t.follows)
      .map((f) => ({
        href: { before: f.t.old, after: f.t.new },
        note: RENDERED_TEXT[f.t.follows === 'phone' ? 'linkPhone' : 'linkEmail']
      }))
    if (plan.all === false && plan.expect === null)
      for (const [i, c] of changes.entries())
        if (c.expect === undefined && placesOf(i) > 1)
          return refuse(
            'AMBIGUOUS',
            renderedText('ambiguousError', { find: c.find, n: placesOf(i), path }),
            renderedText('ambiguousNext'),
            { find: c.find, candidates: shown.slice(0, 4) }
          )
    // A change that carries its own `expect` is counted on its own, as the store search counts it (`countRefusal`).
    for (const [i, c] of changes.entries())
      if (c.expect !== undefined && placesOf(i) !== c.expect)
        return refuse(
          'COUNT_MISMATCH',
          replaceText('countMismatchError', { expect: c.expect, n: placesOf(i), find: c.find }),
          replaceText('countMismatchNext', { n: placesOf(i) }),
          { would: shown, count: placesOf(i), ...(changes.length > 1 ? { change: i } : {}) }
        )
    const unconfirmed = changes.reduce((n, c, i) => n + (c.expect === undefined ? placesOf(i) : 0), 0)
    if (plan.expect !== null && places !== plan.expect)
      return refuse(
        'COUNT_MISMATCH',
        replaceText('countMismatchError', {
          expect: plan.expect,
          n: places,
          find: changes.map((c) => c.find).join('", "')
        }),
        replaceText('countMismatchNext', { n: places }),
        { would: shown, count: places }
      )
    if (
      plan.all &&
      plan.expect === null &&
      input.confirmed !== true &&
      !plan.dryRun &&
      unconfirmed > REPLACE_CONFIRM_OVER
    )
      return refuse(
        'VALUE_NOT_ALLOWED',
        replaceText('confirmCountError', { n: unconfirmed, how: '' }),
        replaceText('confirmCountNext', { n: unconfirmed }),
        { rule: 'confirm-count', would: shown, count: unconfirmed }
      )
    if (rebase) {
      const identity = (/** @type {Record<string, any>} */ r) =>
        [r.kind, r.name ?? '', r.anchor, r.old].join('\0')
      const ruleId = (/** @type {Record<string, any>} */ r) =>
        createHash('sha256').update(identity(r)).digest('hex').slice(0, 16)
      const incoming = new Set(found.map(({ t, c }) => ruleId({ ...t, anchor: c.anchor })))
      const seenIds = new Set()
      if (
        !Array.isArray(inspected.rules) ||
        inspected.rules.some((r) => {
          if (
            !isRecord(r) ||
            !['text', 'attribute'].includes(r.kind) ||
            (r.kind === 'attribute' ? r.name !== 'href' : r.name !== undefined) ||
            typeof r.anchor !== 'string' ||
            !/^[a-f0-9]{16}$/.test(r.anchor) ||
            typeof r.old !== 'string' ||
            !r.old ||
            typeof r.new !== 'string' ||
            !Number.isInteger(r.expected_matches) ||
            r.expected_matches < 1 ||
            r.id !== ruleId(r) ||
            seenIds.has(r.id) ||
            !incoming.has(r.id)
          )
            return true
          seenIds.add(r.id)
          return false
        })
      )
        return refuse('STORE_CHANGED', renderedText('rebaseError', { path }), renderedText('rebaseNext'))
    }
    const notes = [
      renderedText('themeNote', { path }),
      ...(rebase ? [RENDERED_TEXT.rebaseNote] : []),
      ...new Set([...left, ...away])
    ]
    if (plan.dryRun)
      return {
        ok: true,
        dryRun: true,
        platform: 'wordpress',
        path,
        count: places,
        would: shown,
        ...(companions.length > 0 ? { companions } : {}),
        notes,
        next: replaceText('dryRun', {
          expectHint: plan.all ? replaceText('dryRunExpect', { n: places }) : ''
        })
      }
    const applyId = input.mintApplyId()
    const applied = await write(RENDERED_WORDS_ACTION, {
      operation: 'apply',
      apply_id: applyId,
      request_id: applyId,
      expected_revision: inspected.revision,
      proof: inspected.proof,
      rules: found.map(({ t, c }) => ({
        kind: t.kind,
        ...(t.name ? { name: t.name } : {}),
        anchor: c.anchor,
        old: t.old,
        new: t.new,
        expected_matches: c.count,
        ...(c.replaces_rule ? { replaces_rule: c.replaces_rule } : {})
      }))
    })
    if (isRecord(applied) && applied.ok === true) {
      const render = applied.render
      notes.push(
        renderedText(
          render === 'verified'
            ? 'shownNote'
            : render === 'cache_verification_failed'
              ? 'cacheNote'
              : 'notCheckedNote',
          {
            path
          }
        )
      )
      return receipt({
        platform: 'wordpress',
        path,
        applyId: typeof applied.apply_id === 'string' ? applied.apply_id : applyId,
        changed: shown,
        companions,
        notes,
        undo: undoOf({
          platform: 'wordpress',
          applyId: typeof applied.apply_id === 'string' ? applied.apply_id : applyId
        })
      })
    }
    const code = isRecord(applied) ? String(applied.code ?? applied.error ?? '') : ''
    // The page or its rules moved between inspect and apply: read it once more, then say so.
    if (code === 'stale_proof' || code === 'drift' || code === 'conflict' || code === 'CONFLICT') {
      if (attempt === 0) continue
      return refuse('STORE_CHANGED', renderedText('changedError', { path }), renderedText('changedNext'))
    }
    if (code === 'too_large' || code === 'write_failed' || code === 'bad_params')
      return refuse(
        'WRITE_FAILED',
        renderedText('writeError', { path, why: messageOf(applied) || code }),
        renderedText('writeNext')
      )
    // Anything else — a seat, a role, the lease, an answer lost — is the relay's own answer, whole.
    return /** @type {Record<string, unknown>} */ (applied)
  }
  return refuse('STORE_CHANGED', renderedText('changedError', { path }), renderedText('changedNext'))
}

/**
 * The store search's refusal when this road cannot be taken (an older plugin, a page it does not
 * take, a page it cannot scan), told as what it is: words the theme prints when the page renders.
 *
 * 🔒 NEVER THE THEME'S FILES, WP-CLI OR THE SITE EDITOR (review 23/10/2026). The search's own reason
 * for such words may be "the theme's template file, which changes through the theme's files or
 * wp-cli" (`replace-wordpress.mjs` `WHY.themeFile`): every reason and the sentences built on it are
 * replaced, so no answer of this road sends the agent there.
 * @param {RenderedInput} input
 * @param {ClosedKey} key - the gate, as {@link closedAnswer} says it
 */
function stayAnswer(input, key) {
  return closedAnswer(input.fallback, input.changes[0]?.find ?? '', key, { path: input.path })
}

/**
 * @typedef {'olderNext' | 'allNext' | 'outsideNext' | 'noRecordNext' | 'unscannedNext' |
 *   'unsupportedNext' | 'viewerNext'} ClosedKey
 *   The gate a road was not taken at, by the sentence that names it.
 */

/**
 * The store search's refusal for words the theme prints, told as what they are and with the gate that
 * kept this road shut — never the generic {@link RENDERED_TEXT} `stayNext`, which reads the same
 * whether the road was never tried or tried and failed.
 * @param {Record<string, unknown>} fallback - the store search's refusal
 * @param {string} find - the words the error quotes
 * @param {ClosedKey} key
 * @param {Record<string, unknown>} [facts]
 */
export function closedAnswer(fallback, find, key, facts = {}) {
  const f = fallback
  return {
    ...f,
    error: renderedText('stayError', { find }),
    next: renderedText(key, facts),
    ...(Array.isArray(f.unchanged)
      ? { unchanged: f.unchanged.map((u) => (isRecord(u) ? { ...u, why: RENDERED_TEXT.renderedWhy } : u)) }
      : {})
  }
}

/** @param {unknown} a */
const messageOf = (a) => (isRecord(a) && typeof a.message === 'string' ? a.message.slice(0, 60) : '')

/**
 * A refused inspect: the page is not one this road takes (`unsupported`) — the store search's own
 * answer stands; it could not be read — say so; anything else is the relay's answer.
 * @param {unknown} answer
 * @param {RenderedInput} input
 */
function inspectRefusal(answer, input) {
  const code = isRecord(answer) ? String(answer.code ?? answer.error ?? '') : ''
  // `ACTION_AGENT_ONLY`: the Apply door takes this action from the agent host's signed actor alone,
  // and this call went out under a viewer's cookie — the road is closed here, as on an older plugin.
  if (code === 'unsupported' || code === 'unavailable' || code === 'ACTION_AGENT_ONLY')
    return input.changes.every((c) => c.href !== true)
      ? stayAnswer(input, code === 'ACTION_AGENT_ONLY' ? 'viewerNext' : 'unsupportedNext')
      : refuse(
          'NOT_SUPPORTED_HERE',
          renderedText('olderError', { find: input.changes[0]?.find ?? '' }),
          renderedText('olderNext')
        )
  if (code === 'conflict' || code === 'CONFLICT')
    return refuse(
      'STORE_CHANGED',
      renderedText('changedError', { path: input.path }),
      renderedText('changedNext')
    )
  if (code === 'read_failed')
    return refuse('READ_FAILED', renderedText('readError', { path: input.path }), renderedText('readNext'))
  return /** @type {Record<string, unknown>} */ (answer)
}

/**
 * Whether a record the call read holds a link target, in any spelling a record keeps it.
 * @param {readonly { raw?: string, label?: string }[]} stores
 * @param {string} href
 * @returns {string | null} the record's label
 */
export function storeHoldingLink(stores, href) {
  const spellings = storedSpellings(href)
  for (const s of stores)
    if (typeof s.raw === 'string' && spellings.some((x) => s.raw?.includes(x))) return s.label ?? 'a record'
  return null
}
