/**
 * THE REPLACE JOB'S CORE (PLAN v2 P8, F3 §3): find the words a visitor reads, decide which stored
 * value shows them, and plan the change — pure, no I/O. The three engines (Joomla contract,
 * WordPress, EmDash) build the stored units from their own door and write through it; everything
 * that must read the same on all three lives here, once: the parameters, the matcher, the verdicts,
 * the two-line split, the receipt and every sentence the model reads back.
 *
 * 🔒 WHY A JOB, NOT A RECORD ROAD. In r2 (suite v2, 99 cases) locating the record that holds a
 * visible string was 73 of the 113 extra steps of the historical edit turns and 132 of the 172
 * shape refusals: the model read records, guessed a field, was refused, read again. Here the page
 * the visitor sees is the arbiter of WHERE text is shown, a stored value counts for it only when the
 * rendered text holds the stored text whole (the presence rule that kept WordPress postmeta
 * `tracy_page_heading` and the Joomla tagline decoy out), and the answer is the receipt.
 *
 * 🔒 NEVER A GUESS BETWEEN PLACES. Two places and no `where`, `at` or `all` → AMBIGUOUS: nothing
 * written, every place listed with its `at`. Accent-blind and case-blind substring hits are never
 * written under `all`; accent-blind hits only for one whole-unit target, and the receipt says so.
 * `all` writing more than {@link REPLACE_CONFIRM_OVER} places, or any hit that is not the exact
 * spelling, needs `expect` or a prior `dryRun` (principle 19: confirm destructive work).
 *
 * The action form ships (D21: `tracy_site content.replace`); {@link REPLACE_CALL} is the one place a
 * sentence names the call, so the tool form changes one constant.
 */

import { WHERE_REGIONS, foldForMatch, views } from './html-units.mjs'
import { CANNOT_EMPTY } from './empty-rules.mjs'

export { views }

/** @typedef {import('./html-units.mjs').RenderedUnit} RenderedUnit */
/** @typedef {import('./html-units.mjs').Region} Region */

/**
 * @typedef {{ cased: string, lower: string, map: [number, number][], bare: string,
 *   bmap: [number, number][] }} TextView
 *   A text as the matcher reads it (`views` in `html-units.mjs`), each index mapped to raw bytes.
 */

/**
 * @typedef {TextView & { at: string, raw: string, record?: string, label?: string, kind?: string,
 *   region?: string | readonly string[] | null, lang?: string | null, place?: string,
 *   writable?: boolean, why?: string, tag?: string, fact?: boolean, max?: number }} StoredUnit
 *   One value a door can write, built by an engine as `{...views(value, {decode}), at, raw: value, …}`.
 *   `at`: the stable address the answers print (`module-441.4`, `post:42#blocks[3]`, `site#hotline`).
 *   `raw`: the stored value exactly — the undo restores it byte for byte (D14).
 *   `record`: values of one record (a two-line heading pairs two of them). `region`: where the
 *   template prints it, for text-only mode and for places not on the page read. `lang`: its language
 *   (null = every language). `place`: one key for the same field in every language, when the engine
 *   lists them side by side. `writable:false` + `why`: shown, but no door here writes it. `tag`: the
 *   element it fills (cannot-empty when no page was read). `fact`: a phone, e-mail, address, hours,
 *   legal line or social link by the template's own naming. `max`: the door's length limit.
 */

/**
 * @template {TextView} U
 * @typedef {{ unit: U, a: number, b: number, mode: 'phone' | 'text' | 'glyph' | 'bare',
 *   whole: boolean, caseExact: boolean }} Hit
 *   One occurrence in `unit`: `[a, b)` indexes the `cased`/`lower` view (the `bare` view in mode
 *   `bare`). `whole`: the words are all of the unit. `caseExact`: letter for letter as asked (for a
 *   phone: the same grouping).
 */

// ── Limits ───────────────────────────────────────────────────────────────────────────────────────

/** The parameter names, and nothing else (D21: the closed schema's `additionalProperties:false`). */
export const REPLACE_KEYS = Object.freeze([
  'find',
  'replace',
  'path',
  'where',
  'at',
  'all',
  'changes',
  'dryRun',
  'restore',
  'expect',
  'href'
])
/**
 * The keys of one `changes[]` item. `href:true` says `find` and `replace` are the whole target of a
 * link (`<a href>`), not words: only WordPress's rendered-words road writes one (`replace-wordpress.mjs`).
 */
export const REPLACE_CHANGE_KEYS = Object.freeze(['find', 'replace', 'href'])
/** The longest link target an `href:true` change carries (the plugin's own `MAX_URL`). */
export const REPLACE_HREF_MAX = 2048
/**
 * The keys of one `restore[]` item (EmDash's exact undo, D14): `{at, value}` puts the whole prior
 * value back; `now` (optional) is the whole value the job wrote, so an undo never overwrites words
 * someone changed since; `{at, was, now}` puts the words `was` back where the job wrote `now` — the
 * engine emits it only when that gives the exact prior value back, so one item can serve a place in
 * every language served (a fact written in 40 languages: 80 whole values, 5.8 KB, measured 25/09).
 */
export const REPLACE_RESTORE_KEYS = Object.freeze(['at', 'value', 'was', 'now'])
/**
 * How many `restore[]` items one undo may carry. 🔒 NOT {@link REPLACE_MAX_TARGETS}: a place counts
 * once there, but its copies in every language served are written too (a hotline on the 40-language
 * bench site = 80 values), and an undo refused for its size is an undo that cannot be sent (D14).
 * 40 places × 50 languages.
 */
export const REPLACE_MAX_RESTORE = 2000
/** The longest `at` of a restore item: one place in many languages (`site/site@af,be,…#hotline`). */
export const RESTORE_AT_MAX = 1000
/** The places a customer names, as `page.text {outline:true}` prints them (D3). */
export const REPLACE_WHERE = WHERE_REGIONS
export const REPLACE_MAX_CHANGES = 20
/** `all` stops here with TOO_MANY: one call, one receipt a person can read. */
export const REPLACE_MAX_TARGETS = 40
/** `all` writing more places than this needs `expect` or a prior dryRun (confirm-count). */
export const REPLACE_CONFIRM_OVER = 5
export const REPLACE_FIND_MAX = 500
export const REPLACE_VALUE_MAX = 2000
/** The receipt's budget (P8); the undo is never cut to meet it — see {@link receipt}. */
export const RECEIPT_MAX_BYTES = 2048
/** A prior value longer than this is not carried in the undo: `revision_restore` is named instead (D14). */
export const RESTORE_LEAF_MAX = 2000
/** How many AMBIGUOUS candidates an answer lists. */
const CANDIDATES_SHOWN = 8
/** How many lower-rank places `alsoIn` names. */
const ALSO_IN_SHOWN = 5
/** before/after in answers: the unit's text cut to this many characters around the change. */
const CLIP_WIDTH = 160

/**
 * How a sentence names the call. 🔒 ONE CONSTANT: the action form ships now (Lee has not added
 * `tracy_site_replace` to `DOOR_TOOLS`, D21); the tool form is this line and nothing else.
 */
export const REPLACE_CALL = 'tracy_site content.replace'

// ── Sentences (T10: error ≤ 160 chars — the rule and the value; next ≤ 200 — one call or one instruction) ──

/**
 * Every sentence the replace job answers with, `{name}` filled by {@link replaceText}. Classes (T10):
 * shape → the corrected call; place → where the words are; state → the same call once; policy →
 * "tell the customer … that is an answer", and only there.
 */
export const REPLACE_NEXT = Object.freeze({
  receipt:
    'This is the receipt: tell the customer in plain words what changed and where, and what it says now. Keep the undo for yourself until they ask. Read nothing back.',
  receiptRemoved:
    'This is the receipt: tell the customer in plain words what changed and where. A space left where words were removed is harmless: leave it. Keep the undo for yourself until they ask. Read nothing back.',
  receiptAlsoIn:
    'Other places still show these words (alsoIn). Asked for every place? The same call with all:true changes them; if not, this is the receipt: tell the customer in plain words what changed and where.',
  receiptStillHolds:
    'stillHolds: places that still open with the same words and were not in this call. Named by the customer? Add them. Left out on purpose? This is the receipt: tell them in plain words what changed.',
  restored: 'The old words are back: tell the customer. Read nothing back.',
  dryRun: 'Nothing was written. To make exactly these changes: the same call without dryRun{expectHint}.',
  dryRunExpect: ', with expect:{n}',
  ambiguousError: '"{find}" is in {n} places: {list}; nothing was written',
  ambiguousNext:
    'Choose from the customer\'s words: the same call with at:["{at}"] (one or more from candidates), or all:{allForm} for every place listed. Ask only if their words do not decide.',
  notFoundError: '"{find}" is not on this page or in its content; nothing was written',
  // Local round 20, 25/10/2026: a WordPress build swapped a template photo by its file path and read this answer as
  // "read the page again", five checks in a row; a picture changes with its block, never as words.
  pictureNotFoundNext:
    'A picture is not words: change its image slot, or on WordPress its block by position — content.get {kind:"post", id, outline:true}, then content.update {kind:"post", id, blocks:{"<n>":<block>}}.',
  notFoundNext:
    'page.text {path:"{page}", match:"{word}"}, then this replace quoting those words exactly; only a NOT_FOUND needs a read.',
  // Local round 31, 25/10/2026: a build's call with no path read the home page, this answer then sent it to read the
  // home page again, and the agent gave up and edited the theme's PHP; words a theme prints are found only where shown.
  notFoundNoPathNext:
    'No path was given, so only the home page was read: the same call with path:"<the page that shows them>" (a check names it). Words a theme prints are found only on their page.',
  notHereError: 'those words are on {page}, not on this page; nothing was written',
  notHereNext: 'the same call with path:"{page}"',
  otherLanguageError: 'those words are on {page}, in another language; nothing was written',
  otherLanguageNext: 'words change in the language of their own page: the same call with path:"{page}"',
  notInWhereError: '"{find}" is not in {where} on this page; it is in {seen}',
  notInWhereNext: 'the same call with where:"{region}" if that is the place meant, or without where',
  accentsError: '"{find}" matches only with other accents or letters; nothing was written',
  accentsNext: 'quote the words exactly as the page shows them: the same call with find:"{exact}"',
  notEditableError: '"{find}" is {why}; nothing was written',
  notEditableNext:
    'tell the customer this text cannot change here ({why}); do not look for another way in: that is an answer',
  notEditableHeldNext:
    'held stores these words but this spot did not match it: if it is meant, the same call with at:[{at}]; if not, tell the customer this text cannot change here',
  storeChangedError: 'the places in at no longer hold "{find}": {at}',
  storeChangedNext:
    'they changed since that answer: the same call once without at finds the words where they are now',
  countMismatchError: 'expect is {expect}, but {n} places hold "{find}"; nothing was written',
  countMismatchNext:
    'check would: if every place listed is meant, the same call with expect:{n}; if not, narrow it with where or at',
  tooManyError: '"{find}" is in {n} places; one call changes at most {max}',
  tooManyNext:
    'narrow it: the same call with where:"<region>" or path:"<page>", or at:[…] naming places from would',
  confirmCountError: 'all would change {n} places{how}; nothing was written',
  confirmCountNext: 'check would: if every place listed is meant, the same call with expect:{n}',
  confirmCountHow: ', some not spelled exactly as asked',
  confirmCountInexactNext:
    'read the would list first: expect:{n} writes exactly those words, so a stored + or ( in front must be in find too; if every place listed reads right, the same call with expect:{n}',
  cannotEmptyError: 'replace is empty and "{find}" is the whole {thing}: it cannot be left without words',
  cannotEmptyNext:
    'tell the customer an empty {thing} cannot stay; removing the {thing} itself is not a change of words: that is an answer',
  twoLinesError: 'this heading keeps two lines, and "{replace}" is one word',
  twoLinesNext:
    'send replace as two lines from the customer\'s words, "<line 1>\\n<line 2>"; ask them for a second line only if nothing fits',
  maxCharactersError: '{what} is {len} characters; {at} holds at most {limit}',
  maxCharactersNext: 'shorten it to {limit} characters or fewer, then the same call',
  overlapError: 'changes[{i}] and changes[{j}] change the same words in {at}',
  overlapNext:
    'send one change for those words: changes:[{find:"<the whole old words>", replace:"<the new words>"}]',
  mergeClashError: 'find "{find}" is also changes[{i}].find, with other new words',
  badUnknownError: '{param} is not a parameter; allowed: {allowed}',
  badUnknownNextNear: 'send {near} instead of {key}',
  badUnknownNext: 'drop {key}: {call} {find:"<old words>", replace:"<new words>"}',
  badTypeError: '{param} must be {want}, got {got}',
  badTypeNext: '{call} {example}',
  badMissingError: '{param} is missing: {want}',
  badMissingNext: '{call} {find:"<the old words, as the page shows them>", replace:"<the new words>"}',
  badSameError: 'replace equals find in {param}: nothing would change',
  badSameNext: 'send the NEW words in replace: {call} {find:"<old words>", replace:"<new words>"}',
  badSpacesError:
    'find and replace differ only in spaces at their ends, which are not compared: nothing would change',
  badSpacesNext:
    'a space left where words were removed is harmless: leave it, and tell the customer what changed',
  badBothError: '{param} goes alone: {with} was sent with it',
  badWhereNext: 'where is one of {regions}; a menu item is in "header" or "topbar". Or leave where out',
  badAllNext: 'all:true for every page of the site, all:"page" for this page only; or leave all out',
  badRestoreNext: 'send the undo exactly as the receipt gave it: {call} {restore:[{at, value}]}',
  badChangesNext:
    'send every pair inside changes: {call} {changes:[{find:"<old words>", replace:"<new words>"}, …]}',
  badAtAllNext: 'at names the places to change and all changes every place: send one of them',
  undoJoomla:
    'apply.revert restores the site as it was before its LATEST apply: undo before any other change.',
  undoRevision: 'Values too long to carry: tracy_emdash revision_restore then content_publish for {at}.',
  accentsNote: 'accents ignored: the words were found with other accents',
  glyphNote: 'the template prints "{glyph}" beside these words; it was left out of what was written',
  languagesNote: '{n} other language versions were changed too',
  languagesKeptNote: '{n} other language versions hold their own words there and were left as they are',
  textOnlyNote: 'the page could not be read: places were decided from the stored content alone',
  splitNote: 'a heading on two lines: split {by} into "{a}" / "{b}"'
})

/**
 * The facts a sentence quotes from the call itself — the customer's words, a path, a key the model
 * sent: cut to 60 characters with `…`, so a long quote cannot push a sentence past its budget. Every
 * other fact (a place to copy into `at`, the list of allowed keys) is Tracy's own and is never cut:
 * a cut `at` would be a call that fails.
 */
const QUOTED = new Set(['find', 'replace', 'near', 'word', 'got', 'key', 'path', 'a', 'b', 'glyph'])

/** A `find` that is a picture's file (`/wp-content/uploads/…/intro-3-1.jpg`), which no word unit ever holds. */
const PICTURE_PATH = /\.(?:jpe?g|png|webp|avif|gif|svg)(?:[?#]\S*)?$/i

/**
 * Fill one {@link REPLACE_NEXT} sentence. Its budget (160 characters for an error, 200 for a next)
 * is held by `test/replace-core.test.mjs` on the worst case of every sentence.
 * @param {keyof typeof REPLACE_NEXT} key
 * @param {Record<string, unknown>} [facts]
 * @returns {string}
 */
export function replaceText(key, facts = {}) {
  return REPLACE_NEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (name === 'call') return REPLACE_CALL
    if (!(name in facts)) return whole
    const v = String(facts[name])
    return QUOTED.has(name) && v.length > 60 ? `${v.slice(0, 59)}…` : v
  })
}

/**
 * A refusal in T10 shape. Nothing that carries it was written.
 * @param {string} code
 * @param {string} error
 * @param {string} next
 * @param {Record<string, unknown>} [extra]
 * @returns {Refusal}
 */
function refuse(code, error, next, extra = {}) {
  return { ok: false, code, verdict: code, error, next, ...extra }
}

/**
 * @typedef {{ ok: false, code: string, verdict: string, error: string, next: string,
 *   [key: string]: unknown }} Refusal
 */

// ── Parameters (D21: the closed check, after IX2's aliasing) ─────────────────────────────────────

/** @typedef {{ find: string, replace: string, href?: true }} ReplaceChange */
/** @typedef {{ at: string, value: string }} RestoreValue */
/**
 * @typedef {{ at: string, value: string, now?: string } | { at: string, was: string, now: string }} RestoreItem
 *   One undo item as the call carries it: see {@link REPLACE_RESTORE_KEYS}.
 */
/**
 * @typedef {{ ok: true, mode: 'replace', changes: ReplaceChange[], path: string, pathGiven: boolean,
 *   where: Region | null, at: string[] | null, all: false | true | 'page', dryRun: boolean,
 *   expect: number | null, normalized: string[] }} ReplacePlan
 *   `pathGiven`: the call named its page; without one `path` is the home page.
 * @typedef {{ ok: true, mode: 'restore', restore: RestoreItem[], path: string, dryRun: boolean,
 *   normalized: string[] }} RestorePlan
 */

/** A path as `page.text` takes it: one leading `/`, no space, no backslash, not `//`. */
const PATH = /^\/(?!\/)[^\s\\]*$/
/**
 * Does `s` carry a control character a customer's words never carry? A line break does not count:
 * it is the two-line hint. (A loop, not a regex: a control range in a pattern is what oxlint's
 * `no-control-regex` exists to flag.)
 * @param {string} s
 */
const hasControl = (s) => {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if ((c < 32 && c !== 10) || c === 127) return true
  }
  return false
}

/** @param {unknown} v */
function typeName(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'a list'
  if (typeof v === 'string') return v.length > 30 ? `"${v.slice(0, 29)}…"` : JSON.stringify(v)
  return typeof v === 'object' ? 'an object' : `${typeof v} ${String(v)}`
}

/**
 * The name nearest `key` among `allowed`: same letters ignoring case and `_`/`-`, or one edit away.
 * @param {string} key
 * @param {readonly string[]} allowed
 */
function nearestKey(key, allowed) {
  const flat = (/** @type {string} */ s) => s.toLowerCase().replace(/[_-]/g, '')
  const k = flat(key)
  for (const a of allowed) if (flat(a) === k) return a
  for (const a of allowed) if (editDistance(flat(a), k) === 1) return a
  return null
}

/** @param {string} a @param {string} b */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2
  /** @type {number[]} */
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= b.length; j += 1)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/**
 * @param {string} path - where the key sits (`changes[2].where`).
 * @param {string} key
 * @param {readonly string[]} allowed
 */
function unknownKey(path, key, allowed) {
  const near = nearestKey(key, allowed)
  return refuse(
    'BAD_PARAMS',
    replaceText('badUnknownError', { param: path, allowed: allowed.join(', ') }),
    near ? replaceText('badUnknownNextNear', { near, key }) : replaceText('badUnknownNext', { key }),
    { param: path }
  )
}

/**
 * @param {string} path
 * @param {string} want
 * @param {unknown} got
 * @param {string} example
 */
function badType(path, want, got, example) {
  return refuse(
    'BAD_PARAMS',
    replaceText('badTypeError', { param: path, want, got: typeName(got) }),
    replaceText('badTypeNext', { example }),
    { param: path }
  )
}

/**
 * One change's words, checked. `find` must carry a letter or digit; `replace` may be empty (the
 * cannot-empty rule is decided against the page, not here).
 * @param {Record<string, unknown>} item
 * @param {string} prefix - `''` or `changes[i].`
 * @returns {ReplaceChange | Refusal}
 */
function checkChange(item, prefix) {
  if (item.href !== undefined && item.href !== false) return checkHrefChange(item, prefix)
  const example = '{find:"<old words>", replace:"<new words>"}'
  if (item.find === undefined)
    return refuse(
      'BAD_PARAMS',
      replaceText('badMissingError', { param: `${prefix}find`, want: 'the words as the page shows them' }),
      replaceText('badMissingNext'),
      { param: `${prefix}find` }
    )
  if (typeof item.find !== 'string') return badType(`${prefix}find`, 'a string', item.find, example)
  if (item.replace === undefined)
    return refuse(
      'BAD_PARAMS',
      replaceText('badMissingError', { param: `${prefix}replace`, want: 'the new words ("" removes them)' }),
      replaceText('badMissingNext'),
      { param: `${prefix}replace` }
    )
  if (typeof item.replace !== 'string') return badType(`${prefix}replace`, 'a string', item.replace, example)
  const find = item.find.trim()
  if (!/[\p{L}\p{N}]/u.test(find))
    return badType(`${prefix}find`, 'the words as the page shows them', item.find, example)
  if (find.length > REPLACE_FIND_MAX)
    return badType(
      `${prefix}find`,
      `at most ${REPLACE_FIND_MAX} characters`,
      `${find.length} characters`,
      example
    )
  const replace = item.replace.replace(/\r\n?/g, '\n').trim()
  if (hasControl(replace))
    return badType(`${prefix}replace`, 'words without control characters', 'a control character', example)
  if (replace.length > REPLACE_VALUE_MAX)
    return badType(
      `${prefix}replace`,
      `at most ${REPLACE_VALUE_MAX} characters`,
      `${replace.length} characters`,
      example
    )
  if (replace === find) {
    // 🔒 Only the ENDS differ (`"… equipment. "` → `"… equipment."`): the model that just deleted words and saw
    // a space left at the join tried to trim it and was told "replace equals find". Both are compared
    // trimmed — the space is not in what the page shows — so the refusal says that, and that the space is
    // harmless (round 7, 1 run, 1 wasted call).
    const spaces = item.find.trim() === item.replace.trim() && item.find !== item.replace
    return refuse(
      'BAD_PARAMS',
      replaceText(spaces ? 'badSpacesError' : 'badSameError', { param: `${prefix || ''}replace` }),
      replaceText(spaces ? 'badSpacesNext' : 'badSameNext'),
      { param: `${prefix}replace` }
    )
  }
  return { find, replace }
}

/**
 * One link change (`href:true`): `find` is the whole old target as the page links it, `replace` the
 * new one. A link is never emptied, and a target holds no spaces.
 * @param {Record<string, unknown>} item
 * @param {string} prefix - `''` or `changes[i].`
 * @returns {ReplaceChange | Refusal}
 */
function checkHrefChange(item, prefix) {
  // 🔒 A CONCRETE EXAMPLE, NOT PLACEHOLDERS (24/10/2026): `href:"/contact/contact-us/"`, then
  // `{find:"BOOK A TABLE", href:true}`, came back BAD_PARAMS twice before the model read that with
  // `href:true` the `find` is the link's OLD target, never the words it wraps.
  const example = '{find:"/old-target/", replace:"/new-target/", href:true}'
  if (item.href !== true) return badType(`${prefix}href`, 'true or left out', item.href, example)
  for (const key of /** @type {const} */ (['find', 'replace'])) {
    const v = item[key]
    if (typeof v !== 'string' || v.trim() === '' || /\s/.test(v.trim()) || v.trim().length > REPLACE_HREF_MAX)
      return badType(
        `${prefix}${key}`,
        `the link's ${key === 'find' ? 'old' : 'new'} target, not its words: no spaces, at most ${REPLACE_HREF_MAX} characters`,
        v,
        example
      )
  }
  const find = /** @type {string} */ (item.find).trim()
  const replace = /** @type {string} */ (item.replace).trim()
  if (find === replace)
    return refuse(
      'BAD_PARAMS',
      replaceText('badSameError', { param: `${prefix}replace` }),
      replaceText('badSameNext'),
      { param: `${prefix}replace` }
    )
  return { find, replace, href: true }
}

/**
 * The call, checked against the closed key set BEFORE any read: `{find, replace}` or
 * `changes:[{find, replace}]`, with `path`, `where`, `at`, `all`, `expect`, `dryRun`; or
 * `{restore:[{at, value}]}` (EmDash's undo, D14), alone.
 *
 * 🔒 UNKNOWN KEYS ARE REFUSED HERE, NOT IGNORED. dsh validates no raw tool (`$H/core/tools/src/
 * index.ts:1552-1557`), so this is the `additionalProperties:false` of the schema, in code: a key
 * the job would not read is a key the model believes it set — r2 had 8 accepted calls that silently
 * dropped a filter and read 120,108 chars instead (V1). IX2 maps the aliases (`from` → `find`,
 * `dry_run` → `dryRun`) before this runs; what is left is a mistake, answered with the key list.
 * @param {unknown} params
 * @returns {ReplacePlan | RestorePlan | Refusal}
 */
export function planReplace(params) {
  const example = '{find:"<old words>", replace:"<new words>"}'
  if (params === null || typeof params !== 'object' || Array.isArray(params))
    return badType('params', 'an object', params, example)
  const p = /** @type {Record<string, unknown>} */ (params)
  for (const key of Object.keys(p)) if (!REPLACE_KEYS.includes(key)) return unknownKey(key, key, REPLACE_KEYS)
  /** @type {string[]} */
  const normalized = []
  const path = p.path === undefined || p.path === null ? '/' : p.path
  if (typeof path !== 'string' || path.length > 512 || !PATH.test(path))
    return badType('path', 'a page path starting with one "/"', path, '{find, replace, path:"/about"}')
  const dryRun = p.dryRun === undefined || p.dryRun === null ? false : p.dryRun
  if (typeof dryRun !== 'boolean')
    return badType('dryRun', 'true or false', dryRun, '{find, replace, dryRun:true}')

  if (p.restore !== undefined) {
    for (const key of ['find', 'replace', 'changes', 'where', 'at', 'all', 'expect', 'href'])
      if (p[key] !== undefined)
        return refuse(
          'BAD_PARAMS',
          replaceText('badBothError', { param: 'restore', with: key }),
          replaceText('badRestoreNext'),
          {
            param: 'restore'
          }
        )
    if (!Array.isArray(p.restore) || p.restore.length === 0 || p.restore.length > REPLACE_MAX_RESTORE)
      return badType(
        'restore',
        `a list of 1 to ${REPLACE_MAX_RESTORE} {at, value}`,
        p.restore,
        '{restore:[{at, value}]}'
      )
    /** @type {RestoreItem[]} */
    const restore = []
    for (let i = 0; i < p.restore.length; i += 1) {
      const item = p.restore[i]
      if (item === null || typeof item !== 'object' || Array.isArray(item))
        return badType(`restore[${i}]`, 'an object {at, value}', item, '{restore:[{at, value}]}')
      const r = /** @type {Record<string, unknown>} */ (item)
      for (const key of Object.keys(r))
        if (!REPLACE_RESTORE_KEYS.includes(key))
          return unknownKey(`restore[${i}].${key}`, key, REPLACE_RESTORE_KEYS)
      if (typeof r.at !== 'string' || r.at === '' || r.at.length > RESTORE_AT_MAX)
        return badType(`restore[${i}].at`, 'a place from the receipt', r.at, '{restore:[{at, value}]}')
      const words = r.was !== undefined
      if (words === (r.value !== undefined))
        return badType(
          `restore[${i}]`,
          'the item the receipt gave: {at, value} or {at, was, now}',
          r,
          '{restore:[{at, value}]}'
        )
      for (const key of /** @type {const} */ (['value', 'was', 'now']))
        if (r[key] !== undefined && (typeof r[key] !== 'string' || r[key].length > RESTORE_LEAF_MAX))
          return badType(
            `restore[${i}].${key}`,
            'the value the receipt gave',
            r[key],
            '{restore:[{at, value}]}'
          )
      if (words) {
        if (typeof r.now !== 'string' || r.now === '')
          return badType(
            `restore[${i}].now`,
            'the words the receipt gave',
            r.now,
            '{restore:[{at, was, now}]}'
          )
        restore.push({ at: r.at, was: /** @type {string} */ (r.was), now: r.now })
      } else
        restore.push({
          at: r.at,
          value: /** @type {string} */ (r.value),
          ...(typeof r.now === 'string' ? { now: r.now } : {})
        })
    }
    return { ok: true, mode: 'restore', restore, path, dryRun, normalized }
  }

  /** @type {ReplaceChange[]} */
  const changes = []
  if (p.changes !== undefined) {
    /**
     * 🔒 W3 — `find`+`replace` BESIDE `changes` IS ONE MORE PAIR, MERGED, NOT REFUSED. The
     * after-final bench C10 (benchwp01, 25/09) sent that shape once and paid a BAD_PARAMS and a step
     * for a call whose intent is plain. The pair joins the list after the model's own items (their
     * indexes stay the ones it sent), once: the same words already in `changes` with the same new
     * words are sent once, with other new words refused as an overlap. A lone `find` or `replace` is
     * no pair, and is refused.
     */
    const pair = p.find !== undefined && p.replace !== undefined
    if (!pair)
      for (const key of ['find', 'replace', 'href'])
        if (p[key] !== undefined)
          return refuse(
            'BAD_PARAMS',
            replaceText('badBothError', { param: 'changes', with: key }),
            replaceText('badChangesNext'),
            { param: 'changes' }
          )
    if (!Array.isArray(p.changes) || p.changes.length === 0 || p.changes.length > REPLACE_MAX_CHANGES)
      return badType(
        'changes',
        `a list of 1 to ${REPLACE_MAX_CHANGES} {find, replace}`,
        p.changes,
        '{changes:[{find, replace}]}'
      )
    const seen = new Map()
    for (let i = 0; i < p.changes.length; i += 1) {
      const item = p.changes[i]
      if (item === null || typeof item !== 'object' || Array.isArray(item))
        return badType(`changes[${i}]`, 'an object {find, replace}', item, '{changes:[{find, replace}]}')
      const c = /** @type {Record<string, unknown>} */ (item)
      for (const key of Object.keys(c))
        if (!REPLACE_CHANGE_KEYS.includes(key))
          return unknownKey(`changes[${i}].${key}`, key, REPLACE_CHANGE_KEYS)
      const change = checkChange(c, `changes[${i}].`)
      if ('ok' in change) return change
      const key = foldForMatch(change.find)
      if (seen.has(key))
        return refuse(
          'BAD_PARAMS',
          replaceText('overlapError', { i: seen.get(key), j: i, at: 'find' }),
          replaceText('overlapNext'),
          { param: `changes[${i}].find` }
        )
      seen.set(key, i)
      changes.push(change)
    }
    if (pair) {
      const change = checkChange(p, '')
      if ('ok' in change) return change
      const i = seen.get(foldForMatch(change.find))
      if (i !== undefined && changes[i].replace !== change.replace)
        return refuse(
          'BAD_PARAMS',
          replaceText('mergeClashError', { find: change.find, i }),
          replaceText('overlapNext'),
          { param: 'find' }
        )
      if (i !== undefined) normalized.push(`find/replace is changes[${i}]: sent once`)
      else if (changes.length >= REPLACE_MAX_CHANGES)
        return badType(
          'changes',
          `a list of 1 to ${REPLACE_MAX_CHANGES} {find, replace}`,
          `${changes.length + 1} pairs with find`,
          '{changes:[{find, replace}]}'
        )
      else {
        changes.push(change)
        normalized.push(`find/replace merged into changes as changes[${changes.length - 1}]`)
      }
    }
  } else {
    const change = checkChange(p, '')
    if ('ok' in change) return change
    changes.push(change)
  }

  /** @type {Region | null} */
  let where = null
  if (p.where !== undefined && p.where !== null) {
    const w = typeof p.where === 'string' ? p.where.trim().toLowerCase() : null
    if (w === null || !REPLACE_WHERE.includes(/** @type {Region} */ (w)))
      return refuse(
        'BAD_PARAMS',
        replaceText('badTypeError', {
          param: 'where',
          want: REPLACE_WHERE.join('|'),
          got: typeName(p.where)
        }),
        replaceText('badWhereNext', { regions: REPLACE_WHERE.map((r) => `"${r}"`).join(', ') }),
        { param: 'where' }
      )
    where = /** @type {Region} */ (w)
  }

  /** @type {string[] | null} */
  let at = null
  if (p.at !== undefined && p.at !== null) {
    // 🔒 A LONE STRING IS ONE PLACE, corrected rather than refused: a refusal here costs a step and
    // teaches nothing the next line of `normalized` does not.
    const list = typeof p.at === 'string' ? [p.at] : p.at
    if (typeof p.at === 'string') normalized.push('at: one place given as a string, read as a list')
    if (
      !Array.isArray(list) ||
      list.length === 0 ||
      list.length > REPLACE_MAX_CHANGES ||
      list.some((x) => typeof x !== 'string' || x === '' || x.length > 200)
    )
      return badType('at', 'a list of places from an earlier answer', p.at, '{find, replace, at:["<place>"]}')
    at = [...new Set(/** @type {string[]} */ (list))]
  }

  /** @type {false | true | 'page'} */
  let all = false
  if (p.all !== undefined && p.all !== null && p.all !== false) {
    if (p.all !== true && p.all !== 'page')
      return refuse(
        'BAD_PARAMS',
        replaceText('badTypeError', { param: 'all', want: 'true or "page"', got: typeName(p.all) }),
        replaceText('badAllNext'),
        { param: 'all' }
      )
    all = p.all
  }
  if (at && all)
    return refuse(
      'BAD_PARAMS',
      replaceText('badBothError', { param: 'at', with: 'all' }),
      replaceText('badAtAllNext'),
      { param: 'at' }
    )

  /** @type {number | null} */
  let expect = null
  if (p.expect !== undefined && p.expect !== null) {
    if (
      !Number.isInteger(p.expect) ||
      /** @type {number} */ (p.expect) < 1 ||
      /** @type {number} */ (p.expect) > REPLACE_MAX_TARGETS
    )
      return badType(
        'expect',
        `a whole number 1 to ${REPLACE_MAX_TARGETS}`,
        p.expect,
        '{find, replace, all:true, expect:3}'
      )
    expect = /** @type {number} */ (p.expect)
  }

  const pathGiven = p.path !== undefined && p.path !== null
  return { ok: true, mode: 'replace', changes, path, pathGiven, where, at, all, dryRun, expect, normalized }
}

// ── Matching (F3 §3.3) ───────────────────────────────────────────────────────────────────────────

const WORD = /[\p{L}\p{N}]/u
const ADDRESS_SOURCE = String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[a-z][\w+.-]*:\/\/\S+|\b[\w-]+(?:\.[a-z]{2,})+(?:\/\S*)?`
const ADDRESS = new RegExp(ADDRESS_SOURCE, 'giu')
const WHOLE_ADDRESS = new RegExp(`^(?:${ADDRESS_SOURCE})$`, 'iu')

/**
 * Where `q` occurs in `t` on word boundaries — never inside an e-mail, URL or domain token that `q`
 * is not itself: "northgate" does not hit `info@northgate-ind.ru`.
 * @param {string} t - the unit's `lower` (or `bare`) view.
 * @param {string} q - the asked words in the same view.
 * @param {string} [cased] - the unit's `cased` view, same length as `t`, where addresses are read.
 * @returns {[number, number][]}
 */
export function occurrences(t, q, cased = t) {
  /** @type {[number, number][]} */
  const out = []
  if (q === '') return out
  let i = t.indexOf(q)
  if (i === -1) return out
  /** @type {[number, number][]} */
  const tokens = WHOLE_ADDRESS.test(q)
    ? []
    : [...cased.matchAll(ADDRESS)].map((m) => [
        /** @type {number} */ (m.index),
        /** @type {number} */ (m.index) + m[0].length
      ])
  while (i !== -1) {
    const a = i
    const b = i + q.length
    const leftOk = a === 0 || !(WORD.test(t[a - 1]) && WORD.test(q[0]))
    const rightOk = b === t.length || !(WORD.test(t[b]) && WORD.test(q[q.length - 1]))
    const inAddress = tokens.some(([s, e]) => s <= a && b <= e && !(s === a && e === b))
    if (leftOk && rightOk && !inAddress) out.push([a, b])
    i = t.indexOf(q, i + 1)
  }
  return out
}

/** A phone number: ≥ 7 digits, written only with digits, spaces, `()`, `.`, `-`, dashes and `+`. */
export const isPhone = (/** @type {string} */ s) =>
  /^[+(]?\d[\d\s().\-\u2010-\u2015]{5,}\d$/.test(s.trim()) && s.replace(/\D/g, '').length >= 7
export const isEmail = (/** @type {string} */ s) => /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(s.trim())
/** Opening hours: a day name and a time, or a time range. */
export const isHours = (/** @type {string} */ s) =>
  /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[\s\S]*\d{1,2}[:.]\d{2}/i.test(s) ||
  /\d{1,2}[:.]\d{2}\s*[-\u2010-\u2015]\s*\d{1,2}[:.]\d{2}/.test(s)
/** A copyright or legal line. */
export const isCopyright = (/** @type {string} */ s) => /^\s*(©|\(c\)|copyright\b)/i.test(s)

/**
 * A FACT, printed alike in every language: a phone, an e-mail, opening hours, the copyright line, a
 * link. David's rule (25/09, the split of Joomla's T11 and `EMDASH_LANGUAGE_RULE`): a fact changes
 * in every language the site serves; words change in the page's own. An address is not recognisable
 * from its words — the engine marks the stored value `fact:true`, or the customer says "everywhere".
 * @param {string} s
 */
export const isFact = (s) =>
  isPhone(s) || isEmail(s) || isHours(s) || isCopyright(s) || /^\s*https?:\/\/\S+\s*$/i.test(s)

/**
 * A phone number found by its digits: every digit of `find`, in order, bounded by non-digits —
 * "8 800 550-67-90" in "Hotline: 8 800 550-67-90" and in "8 (800) 550 67 90", never inside a longer
 * number.
 * @param {TextView} v
 * @param {string} find
 * @returns {[number, number][]}
 */
export function phoneOccurrences(v, find) {
  const want = find.replace(/\D/g, '')
  // a `+` or `(` that `find` opens with is part of the number: the span takes the stored one, or
  // `replace` (which carries its own) would print it twice ("++7 …")
  const opener = /^[+(]/.exec(find.trim())?.[0] ?? ''
  /** @type {number[]} */
  const digits = []
  for (let k = 0; k < v.cased.length; k += 1) if (/\d/.test(v.cased[k])) digits.push(k)
  const s = digits.map((k) => v.cased[k]).join('')
  /** @type {[number, number][]} */
  const out = []
  let i = s.indexOf(want)
  while (i !== -1) {
    let a = digits[i]
    const b = digits[i + want.length - 1] + 1
    const before = a > 0 && /\d/.test(v.cased[a - 1])
    const after = b < v.cased.length && /\d/.test(v.cased[b])
    // one number only when its digits sit close together, with no letter between them
    const gap = digits[i + want.length - 1] - digits[i] < want.length * 3
    if (!before && !after && gap && !/\p{L}/u.test(v.cased.slice(a, b))) {
      if (opener !== '' && a > 0 && v.cased[a - 1] === opener) a -= 1
      out.push([a, b])
    }
    i = s.indexOf(want, i + 1)
  }
  return out
}

/** A money amount with its sign: `$56`, `€9.50`, `56 €`, `£4–6`. */
const MONEY_FIND = /^(?:[$€£¥₫]\s?\d[\d.,]*(?:\s?[-–]\s?\d[\d.,]*)?|\d[\d.,]*\s?[$€£¥₫])$/u

/** Arrows and chevrons a template prints beside a label ("All projects →"). */
const GLYPH_LEAD = /^[\s←‹«◂◀]+/
const GLYPH_TRAIL = /[\s→›»▸▶↗]+$/

/**
 * `find` without the arrows a template prints around a label, or null when it has none.
 * @param {string} find
 * @returns {{ text: string, lead: string, trail: string } | null}
 */
export function glyphTrim(find) {
  const lead = GLYPH_LEAD.exec(find)?.[0] ?? ''
  const trail = GLYPH_TRAIL.exec(find)?.[0] ?? ''
  if (!lead.trim() && !trail.trim()) return null
  const text = find.slice(lead.length, find.length - trail.length).trim()
  return /[\p{L}\p{N}]/u.test(text) ? { text, lead: lead.trim(), trail: trail.trim() } : null
}

/**
 * Find `find` in a list of viewed units, in tiers, and return the FIRST tier with hits: phone
 * digits (when `find` is a phone) → the folded text → the text without a template's arrows →
 * accent-blind (`bare`, ≥ 4 letters). A hit that is not the whole unit needs ≥ `minPartial` letters
 * or digits in `find`: "NG" and "01" match only a unit that is exactly them.
 * @template {TextView} U
 * @param {readonly U[]} list
 * @param {string} find
 * @param {{ minPartial?: number }} [options]
 * @returns {{ mode: 'phone' | 'text' | 'glyph' | 'bare' | 'none', hits: Hit<U>[], q: TextView,
 *   glyph: { lead: string, trail: string } | null }}
 */
export function matchUnits(list, find, { minPartial = 3 } = {}) {
  const q = views(find)
  // 🔒 A PRICE IS A WHOLE AMOUNT, NOT TWO DIGITS (lrsweep rig, 24/10/2026): "$56" inside a dish heading
  // "Baked Squid $56" is the price a visitor reads, and its sign makes it as distinct as three letters; on word
  // boundaries it never hits "$560". Every price of two digits was NOT_FOUND before.
  const letters = MONEY_FIND.test(q.lower) ? minPartial : q.lower.replace(/[^\p{L}\p{N}]/gu, '').length
  const trimmed = glyphTrim(find)
  const g = trimmed ? views(trimmed.text) : null
  /** @type {['phone' | 'text' | 'glyph' | 'bare', (u: U) => [number, number][], TextView][]} */
  const modes = []
  if (isPhone(find)) modes.push(['phone', (u) => phoneOccurrences(u, find), q])
  modes.push(['text', (u) => occurrences(u.lower, q.lower, u.cased), q])
  if (g) modes.push(['glyph', (u) => occurrences(u.lower, g.lower, u.cased), g])
  if (q.bare.length >= 4) modes.push(['bare', (u) => occurrences(u.bare, q.bare), q])
  for (const [mode, fn, qq] of modes) {
    /** @type {Hit<U>[]} */
    const hits = []
    for (const unit of list) {
      for (const [a, b] of fn(unit)) {
        const len = mode === 'bare' ? unit.bare.length : unit.cased.length
        const whole = a === 0 && b === len
        if (!whole && letters < minPartial) continue
        const caseExact = mode !== 'bare' && unit.cased.slice(a, b) === qq.cased
        hits.push({ unit, a, b, mode, whole, caseExact })
      }
    }
    if (hits.length > 0)
      return {
        mode,
        hits,
        q,
        glyph: mode === 'glyph' && trimmed ? { lead: trimmed.lead, trail: trimmed.trail } : null
      }
  }
  return { mode: 'none', hits: [], q, glyph: null }
}

/**
 * A hit's rank, best first (F3 decision 5): 0 the whole unit letter for letter, 1 the whole unit in
 * another case, 2 inside a unit letter for letter, 3 inside a unit in another case, 4 accent-blind.
 * @param {Hit<TextView>} h
 */
export function hitRank(h) {
  if (h.mode === 'bare') return 4
  return h.whole && h.caseExact ? 0 : h.whole ? 1 : h.caseExact ? 2 : 3
}

/** Spelled exactly as asked (a phone: the same grouping). @param {Hit<TextView>} h */
export const hitIsExact = (h) => h.caseExact && (h.mode === 'text' || h.mode === 'phone')

/**
 * May `all` write it? 🔒 NEVER an accent-blind hit, never a case-blind hit inside a longer text: a
 * site-wide sweep would rewrite "northgate" in the middle of a legal name the customer never quoted.
 * A phone found by its digits is exact enough — its digits are the fact.
 * @param {Hit<TextView>} h
 */
const allowedUnderAll = (h) => h.mode === 'phone' || (h.mode !== 'bare' && (h.whole || h.caseExact))

// ── Two-line headings (D13) ──────────────────────────────────────────────────────────────────────

/**
 * Split a new heading across the two stored values that print one heading on two lines (Joomla
 * `…/title` + `…/title-accent`, EmDash `hero_title_a` + `_b`, WordPress `…<br><em>…</em>`).
 *
 * 🔒 ONE RULE ON ALL THREE (D13), quoted by the site context and the EmDash row: the customer's line
 * break → ` — ` / ` – ` → `, ` / `: ` → the word boundary nearest the old parts' length ratio. A dash
 * stays at the head of line 2 when the old line 2 began with one. A one-word heading leaves line 2
 * empty where the store allows it; on a sealed Joomla (`mustKeepTwo`, the occupancy rule) it is
 * `two-lines`. Each candidate is tried in that order until both parts fit `maxA`/`maxB`.
 * @param {string} replace
 * @param {string} oldA
 * @param {string} oldB
 * @param {{ mustKeepTwo?: boolean, maxA?: number, maxB?: number }} [options]
 * @returns {{ ok: true, a: string, b: string, by: 'line-break' | 'dash' | 'comma' | 'colon' | 'words' | 'one-line' }
 *   | { ok: false, rule: 'two-lines' | 'max-characters', limit?: number, part?: 'a' | 'b' }}
 */
export function splitTwoLines(
  replace,
  oldA,
  oldB,
  { mustKeepTwo = false, maxA = Infinity, maxB = Infinity } = {}
) {
  const text = replace.replace(/\r\n?/g, '\n').trim()
  const flat = text.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ')
  const a0 = oldA.trim().length
  const b0 = oldB.trim().length
  const ratio = a0 + b0 > 0 ? a0 / (a0 + b0 + 1) : 0.5
  const dashHead = /^[-\u2010-\u2015]/.test(oldB.trim())
  /** @type {{ a: string, b: string, by: 'line-break' | 'dash' | 'comma' | 'colon' | 'words' | 'one-line' }[]} */
  const tries = []
  const nl = text.indexOf('\n')
  if (nl !== -1) {
    const a = text.slice(0, nl).trim()
    const b = text
      .slice(nl + 1)
      .replace(/\s*\n\s*/g, ' ')
      .trim()
    if (a && b) tries.push({ a, b, by: 'line-break' })
  }
  if (b0 === 0 && !mustKeepTwo) tries.push({ a: flat, b: '', by: 'one-line' })
  /**
   * Every cut of `flat` at a separator, nearest the old ratio first.
   * @param {RegExp} sep
   * @param {'dash' | 'comma' | 'colon'} by
   * @param {boolean} keepHead - keep the separator at the head of line 2
   */
  const cuts = (sep, by, keepHead) => {
    const found = []
    for (const m of flat.matchAll(sep)) {
      const i = /** @type {number} */ (m.index)
      const a = (keepHead ? flat.slice(0, i) : flat.slice(0, i + m[0].trimEnd().length)).trim()
      const b = (keepHead ? flat.slice(i) : flat.slice(i + m[0].length)).trim()
      if (/[\p{L}\p{N}]/u.test(a) && /[\p{L}\p{N}]/u.test(b))
        found.push({ a, b, by, d: Math.abs(i / flat.length - ratio) })
    }
    return found.sort((x, y) => x.d - y.d).map(({ a, b }) => ({ a, b, by }))
  }
  tries.push(...cuts(/ [\u2013\u2014] /g, 'dash', dashHead))
  tries.push(...cuts(/, /g, 'comma', false))
  tries.push(...cuts(/: /g, 'colon', false))
  const words = flat.split(' ')
  if (words.length > 1) {
    const target = ratio * flat.length
    /** @type {{ a: string, b: string, d: number }[]} */
    const bounds = []
    let pos = 0
    for (let k = 0; k < words.length - 1; k += 1) {
      pos += words[k].length
      bounds.push({
        a: words.slice(0, k + 1).join(' '),
        b: words.slice(k + 1).join(' '),
        d: Math.abs(pos - target)
      })
      pos += 1
    }
    bounds.sort((x, y) => x.d - y.d)
    for (const { a, b } of bounds) tries.push({ a, b, by: 'words' })
  } else if (mustKeepTwo) {
    return { ok: false, rule: 'two-lines' }
  }
  if (!mustKeepTwo) tries.push({ a: flat, b: '', by: 'one-line' })
  for (const t of tries) if (t.a.length <= maxA && t.b.length <= maxB) return { ok: true, ...t }
  const first = tries[0]
  const part = first && first.a.length > maxA ? 'a' : 'b'
  return { ok: false, rule: 'max-characters', limit: part === 'a' ? maxA : maxB, part }
}

// ── Locate and decide (F3 §3.5) ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   anchor?: (hit: Hit<StoredUnit>, occ: Hit<RenderedUnit>) => boolean,
 *   why?: (occ: Hit<RenderedUnit>) => string,
 *   pairs?: (stored: readonly StoredUnit[]) => [StoredUnit, StoredUnit][],
 *   twinFollows?: (occ: Hit<RenderedUnit>, counted: readonly StoredUnit[]) => boolean,
 *   twins?: (unit: StoredUnit) => readonly StoredUnit[]
 * }} LocateHooks
 *   What an engine knows and the core does not. `anchor`: does this stored hit show at this
 *   rendered occurrence (Joomla `Mod<id>`, WordPress `post-N`; default: the stored `region`).
 *   `why`: why words the page shows have no door. `pairs`: the stored values that print one heading
 *   on two lines (default: neighbours of one `record`). `twinFollows`: an unmarked copy (an
 *   off-canvas menu) that follows a counted value. `twins`: the same field in the site's other
 *   languages — a fact reaches them in the same call.
 */

/**
 * @typedef {{ kind: 'unit', at: string, place: string, unit: StoredUnit, hits: Hit<StoredUnit>[],
 *   where: string | null, rendered: boolean | null, occ: Hit<RenderedUnit> | null, rank: number,
 *   exact: boolean, twins: { unit: StoredUnit, hits: Hit<StoredUnit>[] }[], whole?: string }
 * | { kind: 'split', at: string, place: string, a: StoredUnit, b: StoredUnit, where: string | null,
 *   rendered: boolean | null, occ: Hit<RenderedUnit> | null, rank: number, exact: boolean,
 *   parts: { a: string, b: string, by: string } | null, twins: [] }} Target
 */

/**
 * @typedef {{ ok: true, verdict: 'WRITE' | 'WRITE_SPLIT', change: ReplaceChange, targets: Target[],
 *   places: number, unchanged: { text: string, where: string, why: string }[],
 *   alsoIn: { at: string, where: string | null, text: string }[], notes: string[],
 *   scope: 'every' | 'page', languagesKept: number, glyph: { lead: string, trail: string } | null }} Located
 */

/** @param {string | null | undefined} lang */
const langOf = (lang) => (lang ? lang.toLowerCase().split(/[-_]/)[0] : null)

/** @param {Hit<RenderedUnit>} o */
const isCopy = (o) => o.unit.hidden || o.unit.region === 'drawer'

/** @param {StoredUnit} u @param {string} r */
const storedIn = (u, r) => (Array.isArray(u.region) ? u.region.includes(r) : u.region === r)

/**
 * Does the rendered unit hold the stored value WHOLE (F3 decision 3)? A stored hit inside a longer
 * stored text never stands for a shorter rendered line: the Joomla tagline "Industrial
 * infrastructure" is also a substring of article-555's title, which no page prints there.
 * @param {Hit<RenderedUnit>} occ
 * @param {Hit<StoredUnit>} hit
 */
const present = (occ, hit) =>
  hit.mode === 'bare' ? occ.unit.bare.includes(hit.unit.bare) : occ.unit.lower.includes(hit.unit.lower)

/** @type {Required<LocateHooks>['anchor']} */
const defaultAnchor = (hit, occ) => hit.unit.region == null || storedIn(hit.unit, occ.unit.region)

/** Generic reasons, for an engine with no table of its own. */
export const REPLACE_WHY = Object.freeze({
  form: 'a form label, which no door here changes',
  title: 'the browser title or a breadcrumb, which the template builds',
  nav: 'a menu label with no record behind it here',
  template: 'words the template prints, which no door here changes'
})

/** @type {Required<LocateHooks>['why']} */
const defaultWhy = (occ) =>
  occ.unit.inForm
    ? REPLACE_WHY.form
    : occ.unit.region === 'title'
      ? REPLACE_WHY.title
      : occ.unit.inNav
        ? REPLACE_WHY.nav
        : REPLACE_WHY.template

/** @type {Required<LocateHooks>['pairs']} */
const defaultPairs = (stored) => {
  /** @type {[StoredUnit, StoredUnit][]} */
  const out = []
  for (let k = 0; k + 1 < stored.length; k += 1) {
    const a = stored[k]
    const b = stored[k + 1]
    if (a.record !== undefined && a.record === b.record) out.push([a, b])
  }
  return out
}

/** @type {Required<LocateHooks>['twinFollows']} */
const defaultTwinFollows = (occ, counted) =>
  (occ.unit.inNav || isCopy(occ)) && counted.some((u) => u.lower === occ.unit.lower)

/**
 * The element a replacement would leave empty, or null: the words are all of a heading, list item or
 * button (the unit's own block), or all of the visible words of the link they sit in — the two hero
 * buttons of Joomla and EmDash are two links in ONE block, so the block alone cannot decide.
 * @param {Hit<RenderedUnit>} occ
 * @returns {string | null}
 */
function emptiedElement(occ) {
  const block = occ.unit.chain.find((el) => !el.inline)
  if (occ.whole && block && CANNOT_EMPTY.has(block.tag)) return block.tag
  const start = (occ.mode === 'bare' ? occ.unit.bmap : occ.unit.map)[occ.a]?.[0]
  const atom = occ.unit.atoms.find((x) => x.s === start && x.e > x.s)
  const link = atom?.a ?? null
  if (!link) return occ.whole && occ.unit.chain.some((el) => el.tag === 'a') ? 'a' : null
  let text = ''
  for (const x of occ.unit.atoms) if (x.a === link && !x.h) text += x.c
  return foldForMatch(text) === foldForMatch(occ.unit.cased.slice(occ.a, occ.b)) ? 'a' : null
}

/** @param {string} tag */
const thingOf = (tag) =>
  tag === 'a'
    ? 'link'
    : tag === 'button'
      ? 'button'
      : tag === 'li'
        ? 'list item'
        : /^h\d$/.test(tag)
          ? 'heading'
          : tag

/**
 * `text` cut to `width` characters around `[a, b)`, with `…` where it was cut.
 * @param {string} text
 * @param {number} a
 * @param {number} b
 * @param {number} [width]
 */
export function clip(text, a, b, width = CLIP_WIDTH) {
  if (text.length <= width) return text
  const span = b - a
  if (span >= width - 2) return `${text.slice(a, a + width - 1)}…`
  const room = width - span - 2
  let s = Math.max(0, a - Math.floor(room / 2))
  let e = Math.min(text.length, s + span + room)
  s = Math.max(0, e - span - room)
  return `${s > 0 ? '…' : ''}${text.slice(s, e)}${e < text.length ? '…' : ''}`
}

/**
 * The stored units that share at least 60 % of `find`'s words — "did you mean" for NOT_FOUND.
 * @param {readonly TextView[]} list
 * @param {string} find
 * @returns {string[]}
 */
export function nearWords(list, find) {
  const tokens = [
    ...new Set(
      views(find)
        .bare.split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2)
    )
  ]
  if (tokens.length === 0) return []
  /** @type {{ text: string, share: number }[]} */
  const scored = []
  for (const u of list) {
    const have = new Set(u.bare.split(/[^\p{L}\p{N}]+/u))
    const share = tokens.filter((w) => have.has(w)).length / tokens.length
    if (share >= 0.6) scored.push({ text: clip(u.cased, 0, 0, 80), share })
  }
  scored.sort((x, y) => y.share - x.share || x.text.length - y.text.length)
  return [...new Set(scored.map((s) => s.text))].slice(0, 3)
}

/**
 * The longest word of `find`, for a `page.text {match}` next.
 * @param {string} find
 */
const matchWord = (find) =>
  find
    .split(/[^\p{L}\p{N}@.+-]+/u)
    .filter(Boolean)
    .sort((x, y) => y.length - x.length)[0] ?? find

/**
 * Where one change's words are and what may be written — the verdict, per F3 §3.5 with PLAN v2 P8:
 *
 * 1. occurrences on the page; `where` keeps those in that region (never the drawer copies);
 * 2. stored hits; `at` keeps the named places only (none left → STORE_CHANGED);
 * 3. a stored hit counts for an occurrence when the engine anchors it there, the rendered unit holds
 *    it whole (presence) and a door writes it; an occurrence nothing counts for is `unchanged`;
 * 4. no occurrence on the page → the stored hits themselves (site scope, `rendered:false`), in the
 *    page's language for words; `all:true` adds the stored hits the page does not show;
 * 5. unless `all`, the best rank only; the rest become `alsoIn`;
 * 6. a heading split over two stored values is one place (`WRITE_SPLIT`, D13);
 * 7. 0 places → NOT_EDITABLE / NOT_FOUND; > 1 and no `all` → AMBIGUOUS; `all` over
 *    {@link REPLACE_MAX_TARGETS} → TOO_MANY; `expect` ≠ count → COUNT_MISMATCH; `all` over
 *    {@link REPLACE_CONFIRM_OVER} places or not exact, with no `expect`, no prior dryRun and not a
 *    dryRun → confirm-count; emptying a heading, link, button or list item → cannot-empty.
 *
 * A fact (phone, e-mail, hours, copyright line, or a value the engine marks `fact`) and any `all:true`
 * change reach the same field in the site's other languages through `hooks.twins` — one place, one
 * change, as David's language rule says.
 *
 * @param {{ page: { units: RenderedUnit[], lang: string | null } | null, stored: readonly StoredUnit[],
 *   change: ReplaceChange, path?: string, pathGiven?: boolean, where?: Region | null, at?: string[] | null,
 *   all?: false | true | 'page', expect?: number | null, confirmed?: boolean, dryRun?: boolean,
 *   mustKeepTwo?: boolean, countRules?: boolean, hooks?: LocateHooks }} input
 *   `pathGiven: false`: the call named no page, so `path` is the home page it was read as.
 * @returns {Located | Refusal}
 */
export function locate(input) {
  const { page, stored, change } = input
  const path = input.path ?? '/'
  const where = input.where ?? null
  const at = input.at ?? null
  const all = input.all ?? false
  const hooks = input.hooks ?? {}
  const anchor = hooks.anchor ?? defaultAnchor
  const why = hooks.why ?? defaultWhy
  const pairs = hooks.pairs ?? defaultPairs
  const twinFollows = hooks.twinFollows ?? defaultTwinFollows
  const pageLang = langOf(page?.lang)
  const find = change.find
  const q = views(find)
  /** @type {string[]} */
  const notes = []
  if (!page) notes.push(replaceText('textOnlyNote'))

  // 1. The page.
  const occRes = page ? matchUnits(page.units, find) : null
  const occAll = occRes ? occRes.hits : []
  const shown = occAll.filter((o) => !isCopy(o))
  // the region of the best match first: `where:"<it>"` is the next the answer offers
  const seen = [...new Set([...shown].sort((x, y) => hitRank(x) - hitRank(y)).map((o) => o.unit.region))]
  const occs = where ? shown.filter((o) => o.unit.region === where) : occAll
  if (page && where && occs.length === 0 && shown.length > 0)
    return refuse(
      'NOT_FOUND',
      replaceText('notInWhereError', { find, where, path, seen: seen.join(', ') }),
      replaceText('notInWhereNext', { region: seen[0] }),
      { find, seenIn: seen }
    )

  // 2. The stores.
  const res = matchUnits(stored, find)
  const fact = isFact(find) || res.hits.some((h) => h.unit.fact === true)
  const scope = all === true || fact ? 'every' : 'page'
  /** @type {Hit<StoredUnit>[]} */
  let hits = res.hits
  // 🔒 A HEADING ON TWO LINES IS ALWAYS LOOKED FOR, not only when nothing else matched: a title
  // tag or an SEO field holding the same words must not hide the heading the customer quoted.
  /** @type {[StoredUnit, StoredUnit][]} */
  let splitPairs = pairs(stored).filter(
    ([a, b]) => `${a.lower} ${b.lower}` === q.lower && a.writable !== false && b.writable !== false
  )
  if (at) {
    const want = new Set(at)
    hits = hits.filter((h) => want.has(h.unit.at))
    splitPairs = splitPairs.filter(([a, b]) => want.has(`${a.at}+${b.at}`) || want.has(a.at))
    if (hits.length === 0 && splitPairs.length === 0)
      return refuse(
        'STORE_CHANGED',
        replaceText('storeChangedError', {
          find,
          // Tracy's own earlier answer: two places, shortened, say which within the 160-char budget
          at: `${at
            .slice(0, 2)
            .map((x) => (x.length > 28 ? `${x.slice(0, 27)}…` : x))
            .join(', ')}${at.length > 2 ? ', …' : ''}`
        }),
        replaceText('storeChangedNext'),
        { find }
      )
  }

  // 3. Anchor every kept occurrence.
  /** @type {Map<string, { unit: StoredUnit, hits: Hit<StoredUnit>[], occ: Hit<RenderedUnit> | null }>} */
  const counted = new Map()
  /** @type {{ text: string, where: string, why: string }[]} */
  const unchanged = []
  /** @type {Map<string, Hit<RenderedUnit>>} split place → the occurrence it covers */
  const splitShown = new Map()
  /** @param {Hit<StoredUnit>} h @param {Hit<RenderedUnit> | null} o */
  const count = (h, o) => {
    const key = h.unit.at
    const got = counted.get(key)
    if (got) {
      if (!got.hits.some((x) => x.a === h.a && x.b === h.b)) got.hits.push(h)
      if (!got.occ && o) got.occ = o
    } else counted.set(key, { unit: h.unit, hits: [h], occ: o })
  }
  /** @type {{ o: Hit<RenderedUnit>, blocked: Hit<StoredUnit>[] }[]} */
  const loose = []
  for (const o of occs) {
    const c = hits.filter((h) => present(o, h) && anchor(h, o))
    const writable = c.filter((h) => h.unit.writable !== false)
    for (const h of writable) count(h, o)
    // a split heading shows here when the rendered unit holds both lines
    let split = false
    for (const [a, b] of splitPairs) {
      const joined = `${a.lower} ${b.lower}`
      /** @type {Hit<StoredUnit>} */
      const probe = { unit: a, a: 0, b: a.cased.length, mode: 'text', whole: true, caseExact: true }
      if (o.unit.lower.includes(joined) && anchor(probe, o)) {
        const key = `${a.at}+${b.at}`
        if (!splitShown.has(key)) splitShown.set(key, o)
        split = true
      }
    }
    if (writable.length === 0 && !split) loose.push({ o, blocked: c })
  }
  const countedUnits = [...counted.values()].map((c) => c.unit)
  for (const { o, blocked } of loose) {
    if (isCopy(o) || twinFollows(o, countedUnits)) continue
    unchanged.push({
      text: clip(o.unit.shown || o.unit.cased, 0, 0, 80),
      where: o.unit.region,
      why: blocked[0]?.unit.why ?? why(o)
    })
  }

  // 4. Candidates.
  const onPage = page !== null && occs.length > 0
  /** @type {Target[]} */
  let targets = []
  /** @param {{ unit: StoredUnit, hits: Hit<StoredUnit>[], occ: Hit<RenderedUnit> | null }} c @param {boolean | null} rendered */
  const unitTarget = (c, rendered) => {
    const rank = Math.min(...c.hits.map(hitRank))
    /** @type {Target} */
    const t = {
      kind: 'unit',
      at: c.unit.at,
      place: c.unit.place ?? c.unit.at,
      unit: c.unit,
      hits: c.hits.sort((x, y) => x.a - y.a),
      where: c.occ ? c.occ.unit.region : regionName(c.unit),
      rendered,
      occ: c.occ,
      rank,
      exact: c.hits.every(hitIsExact),
      twins: []
    }
    return t
  }
  /** @param {Hit<StoredUnit>} h */
  const sameLanguage = (h) =>
    scope === 'every' || !pageLang || !h.unit.lang || langOf(h.unit.lang) === pageLang
  if (at) {
    const byAt = new Map()
    for (const h of hits) {
      if (h.unit.writable === false) continue
      const got = counted.get(h.unit.at)
      if (!byAt.has(h.unit.at)) byAt.set(h.unit.at, { unit: h.unit, hits: [], occ: got?.occ ?? null })
      byAt.get(h.unit.at).hits.push(h)
    }
    targets = [...byAt.values()].map((c) => unitTarget(c, page ? c.occ !== null : null))
  } else if (onPage) {
    targets = [...counted.values()].map((c) => unitTarget(c, true))
    if (all === true) {
      const shownAt = new Set(counted.keys())
      const anchoredAnywhere = new Set(
        hits.filter((h) => occAll.some((o) => present(o, h) && anchor(h, o))).map((h) => h.unit.at)
      )
      const extra = new Map()
      for (const h of hits) {
        if (shownAt.has(h.unit.at) || anchoredAnywhere.has(h.unit.at) || h.unit.writable === false) continue
        if (where && !storedIn(h.unit, where)) continue
        if (!extra.has(h.unit.at)) extra.set(h.unit.at, { unit: h.unit, hits: [], occ: null })
        extra.get(h.unit.at).hits.push(h)
      }
      for (const c of extra.values()) targets.push(unitTarget(c, false))
    }
  } else if (!(page && all === 'page')) {
    // Site scope: the words are not on this page (or the page was not read).
    const byAt = new Map()
    for (const h of hits) {
      if (where && h.unit.region != null && !storedIn(h.unit, where)) continue
      if (where && h.unit.region == null && page) continue
      if (!sameLanguage(h)) continue
      if (h.unit.writable === false) {
        if (!unchanged.some((u) => u.text === h.unit.cased))
          unchanged.push({
            text: clip(h.unit.cased, 0, 0, 80),
            where: regionName(h.unit) ?? 'main',
            why: h.unit.why ?? REPLACE_WHY.template
          })
        continue
      }
      if (!byAt.has(h.unit.at)) byAt.set(h.unit.at, { unit: h.unit, hits: [], occ: null })
      byAt.get(h.unit.at).hits.push(h)
    }
    targets = [...byAt.values()].map((c) => unitTarget(c, page ? false : null))
  }

  // Split headings: one place each.
  for (const [a, b] of splitPairs) {
    const key = `${a.at}+${b.at}`
    const o = splitShown.get(key) ?? null
    if (page && onPage && !o && !at) continue
    if (where && !o && a.region != null && !storedIn(a, where)) continue
    targets.push({
      kind: 'split',
      at: key,
      place: a.place ?? key,
      a,
      b,
      where: o ? o.unit.region : regionName(a),
      rendered: page ? o !== null : null,
      occ: o,
      rank: 0,
      exact: true,
      parts: null,
      twins: []
    })
  }

  // Accent-blind: one whole-unit target, never under all (principle 19) — else the exact spelling.
  const bare = targets.some((t) => t.kind === 'unit' && t.hits.some((h) => h.mode === 'bare'))
  if (bare) {
    const t = targets[0]
    const single = targets.length === 1 && !all && t.kind === 'unit' && t.hits.every((h) => h.whole)
    if (!single) {
      const exact = t.kind === 'unit' ? t.unit.cased.slice(t.hits[0].a, t.hits[0].b) : find
      return refuse(
        'NOT_FOUND',
        replaceText('accentsError', { find }),
        // the spelling is part of a call here: whole, or the page.text road — never cut
        exact.length <= 120
          ? replaceText('accentsNext', { exact })
          : replaceText('notFoundNext', {
              page: path.length <= 60 ? path : '<the page>',
              word: matchWord(exact).slice(0, 30)
            }),
        {
          find,
          near: [
            ...new Set(targets.map((x) => (x.kind === 'unit' ? clip(x.unit.cased, 0, 0, 80) : '')))
          ].slice(0, 3)
        }
      )
    }
    notes.push(replaceText('accentsNote'))
  }

  // 5. Rank.
  /** @type {{ at: string, where: string | null, text: string }[]} */
  let alsoIn = []
  /** @param {Target} t */
  const aside = (t) => ({
    at: t.at,
    where: t.where,
    text: t.kind === 'unit' ? clip(t.unit.cased, t.hits[0].a, t.hits[0].b, 80) : ''
  })
  if (!at) {
    if (all) {
      const drop = targets.filter((t) => t.kind === 'unit' && !t.hits.every(allowedUnderAll))
      targets = targets.filter((t) => !drop.includes(t))
      alsoIn = drop.map(aside)
    } else if (targets.length > 1) {
      const best = Math.min(...targets.map((t) => t.rank))
      alsoIn = targets.filter((t) => t.rank !== best).map(aside)
      targets = targets.filter((t) => t.rank === best)
    }
  }
  alsoIn = alsoIn.slice(0, ALSO_IN_SHOWN)
  if (res.glyph && targets.some((t) => t.kind === 'unit' && t.hits.some((h) => h.mode === 'glyph')))
    notes.push(
      replaceText('glyphNote', { glyph: [res.glyph.lead, res.glyph.trail].filter(Boolean).join(' ') })
    )

  // 6–7. Verdicts.
  const places = new Set(targets.map((t) => t.place)).size
  if (places === 0) {
    // 🔒 A stored place that holds these very words and can be written, kept from this spot of the
    // page only by the anchor (a language or region the engine read differently), is never answered
    // "do not look for another way in": on 16/10/2026 that answer told a model the words of a Joomla
    // module on a Dutch Apply site could not change, because the module's title still said "(en)".
    // The refusal stays (nothing is written on a guess); its next names the place to check.
    const held = [
      ...new Map(
        hits
          .filter((h) => h.unit.writable !== false && occs.some((o) => present(o, h)))
          .map((h) => [h.unit.at, h.unit])
      ).values()
    ].slice(0, CANDIDATES_SHOWN)
    if (unchanged.length > 0 && held.length > 0)
      return refuse(
        'NOT_EDITABLE',
        replaceText('notEditableError', { find, why: unchanged[0].why }),
        replaceText('notEditableHeldNext', { at: JSON.stringify(held[0].at) }),
        {
          find,
          unchanged: unchanged.slice(0, 4),
          held: held.map((u) => ({ at: u.at, ...(u.label ? { label: u.label } : {}) }))
        }
      )
    if (unchanged.length > 0)
      return refuse(
        'NOT_EDITABLE',
        replaceText('notEditableError', { find, why: unchanged[0].why }),
        replaceText('notEditableNext', { why: unchanged[0].why }),
        { find, unchanged: unchanged.slice(0, 4) }
      )
    const pool = page ? page.units.filter((u) => !u.hidden && u.region !== 'drawer') : stored
    return refuse(
      'NOT_FOUND',
      replaceText('notFoundError', { find }),
      // a path is part of a call here: whole, or a placeholder — never cut into a call that fails
      PICTURE_PATH.test(find.trim())
        ? replaceText('pictureNotFoundNext')
        : input.pathGiven === false
          ? replaceText('notFoundNoPathNext')
          : replaceText('notFoundNext', {
              page: path.length <= 60 ? path : '<the page>',
              word: matchWord(find).slice(0, 30)
            }),
      { find, near: nearWords(pool, find) }
    )
  }
  // Places the call named in `at` are chosen, not ambiguous: the answer's own next offers "one or more"
  // (pilot 23/10/2026: two named places were refused as AMBIGUOUS four times in a row).
  if (places > 1 && !all && !at) {
    const list = targets.slice(0, CANDIDATES_SHOWN).map(candidateOf)
    const allForm = targets.every((t) => t.rendered === true) ? '"page"' : 'true'
    return refuse(
      'AMBIGUOUS',
      replaceText('ambiguousError', {
        find,
        n: places,
        list: [...new Set(targets.map((t) => t.where ?? 'unknown'))].join(', ')
      }),
      replaceText('ambiguousNext', { at: targets[0].at, allForm }),
      { find, candidates: list, alsoIn }
    )
  }

  // Language copies of a fact, or of an `all:true` change: the same place, one change.
  let languagesKept = 0
  if (scope === 'every' && hooks.twins) {
    // a copy the engine also listed as a place of its own is written there, once
    const own = new Set(targets.map((t) => t.at))
    for (const t of targets) {
      if (t.kind !== 'unit') continue
      for (const twin of hooks.twins(t.unit)) {
        if (own.has(twin.at) || twin.writable === false) continue
        own.add(twin.at)
        const m = matchUnits([twin], find)
        const ok = m.hits.filter((h) => hitIsExact(h) || h.mode === 'phone')
        if (ok.length > 0) t.twins.push({ unit: twin, hits: ok })
        else languagesKept += 1
      }
    }
    const reached = targets.reduce((n, t) => n + t.twins.length, 0)
    if (reached > 0) notes.push(replaceText('languagesNote', { n: reached }))
    if (languagesKept > 0) notes.push(replaceText('languagesKeptNote', { n: languagesKept }))
  }

  /** @type {Located} */
  const located = {
    ok: true,
    verdict: targets.length === 1 && targets[0].kind === 'split' ? 'WRITE_SPLIT' : 'WRITE',
    change,
    targets,
    places,
    unchanged: unchanged.slice(0, 4),
    alsoIn,
    notes,
    scope,
    languagesKept,
    glyph: res.glyph
  }
  if (input.countRules !== false) {
    const refusal = countRefusal([located], {
      all,
      expect: input.expect ?? null,
      confirmed: input.confirmed === true,
      dryRun: input.dryRun === true
    })
    if (refusal) return refusal
  }
  return valueRules(located, { mustKeepTwo: input.mustKeepTwo === true })
}

/** @param {StoredUnit} u */
function regionName(u) {
  if (u.region == null) return null
  return Array.isArray(u.region) ? (u.region[0] ?? null) : /** @type {string} */ (u.region)
}

/** @param {Target} t */
function candidateOf(t) {
  if (t.kind === 'split')
    return {
      at: t.at,
      where: t.where,
      label: t.a.label ?? null,
      text: clip(`${t.a.cased} / ${t.b.cased}`, 0, 0, 90)
    }
  const h = t.hits[0]
  return {
    at: t.at,
    where: t.where,
    label: t.unit.label ?? null,
    text: clip(t.unit.cased, Math.max(0, h.a - 40), Math.min(t.unit.cased.length, h.b + 40), 90),
    ...(t.rendered === false ? { onPage: false } : {})
  }
}

/**
 * The count rules, over every change of one call (one receipt): TOO_MANY, COUNT_MISMATCH, and
 * confirm-count — `all` writing more than {@link REPLACE_CONFIRM_OVER} places, or any place not spelled
 * exactly as asked, needs `expect` or a dryRun of the same call earlier in this conversation
 * (`confirmed`, which IX2 reads from call memory by {@link confirmKey}). A dryRun is itself the
 * confirmation road, so it is never refused for it.
 * @param {Located[]} results
 * @param {{ all: false | true | 'page', expect: number | null, confirmed: boolean, dryRun: boolean }} options
 * @returns {Refusal | null}
 */
export function countRefusal(results, { all, expect, confirmed, dryRun }) {
  const places = results.reduce((n, r) => n + r.places, 0)
  const find = results.map((r) => r.change.find).join('", "')
  const would = results.flatMap((r) => r.targets.map((t) => wouldOf(t, r.change)))
  if (all && places > REPLACE_MAX_TARGETS)
    return refuse(
      'TOO_MANY',
      replaceText('tooManyError', { find, n: places, max: REPLACE_MAX_TARGETS }),
      replaceText('tooManyNext'),
      { would: would.slice(0, REPLACE_MAX_TARGETS), count: places }
    )
  if (expect !== null && places !== expect)
    return refuse(
      'COUNT_MISMATCH',
      replaceText('countMismatchError', { expect, n: places, find }),
      replaceText('countMismatchNext', { n: places }),
      { would, count: places }
    )
  const exact = results.every((r) => r.targets.every((t) => t.exact))
  if (all && expect === null && !confirmed && !dryRun && (places > REPLACE_CONFIRM_OVER || !exact))
    return refuse(
      'VALUE_NOT_ALLOWED',
      replaceText('confirmCountError', { n: places, how: exact ? '' : REPLACE_NEXT.confirmCountHow }),
      replaceText(exact ? 'confirmCountNext' : 'confirmCountInexactNext', { n: places }),
      { rule: 'confirm-count', would, count: places }
    )
  return null
}

/**
 * The value rules a page can decide for every CMS: cannot-empty, the two-line split and the door's
 * length limit (`max`). An engine adds its own (Joomla's markup, directives and occupancy).
 * @param {Located} located
 * @param {{ mustKeepTwo: boolean }} options
 * @returns {Located | Refusal}
 */
function valueRules(located, { mustKeepTwo }) {
  const { change } = located
  const replace = change.replace
  for (const t of located.targets) {
    if (t.kind === 'split') {
      if (replace === '')
        return refuse(
          'VALUE_NOT_ALLOWED',
          replaceText('cannotEmptyError', { find: change.find, thing: 'heading' }),
          replaceText('cannotEmptyNext', { thing: 'heading' }),
          { rule: 'cannot-empty', at: t.at }
        )
      const split = splitTwoLines(replace, t.a.cased, t.b.cased, {
        mustKeepTwo,
        maxA: t.a.max ?? Infinity,
        maxB: t.b.max ?? Infinity
      })
      if (!split.ok) {
        if (split.rule === 'two-lines')
          return refuse(
            'VALUE_NOT_ALLOWED',
            replaceText('twoLinesError', { replace }),
            replaceText('twoLinesNext'),
            {
              rule: 'two-lines',
              at: t.at
            }
          )
        const part = split.part === 'a' ? t.a : t.b
        return refuse(
          'VALUE_NOT_ALLOWED',
          replaceText('maxCharactersError', {
            what: 'a line of that heading',
            len: replace.length,
            at: part.at,
            limit: split.limit
          }),
          replaceText('maxCharactersNext', { limit: split.limit }),
          { rule: 'max-characters', at: part.at, limit: split.limit }
        )
      }
      t.parts = { a: split.a, b: split.b, by: split.by }
      located.notes.push(replaceText('splitNote', { by: splitBy(split.by), a: split.a, b: split.b }))
      continue
    }
    if (replace === '') {
      const thing = t.occ
        ? emptiedElement(t.occ)
        : t.hits.some((h) => h.whole) && t.unit.tag && CANNOT_EMPTY.has(t.unit.tag)
          ? t.unit.tag
          : null
      if (thing)
        return refuse(
          'VALUE_NOT_ALLOWED',
          replaceText('cannotEmptyError', { find: change.find, thing: thingOf(thing) }),
          replaceText('cannotEmptyNext', { thing: thingOf(thing) }),
          { rule: 'cannot-empty', at: t.at }
        )
    }
    if (t.unit.max !== undefined) {
      const after = afterText(t.unit.cased, t.hits, plainReplace(replace, located.glyph))
      if (after.length > t.unit.max)
        return refuse(
          'VALUE_NOT_ALLOWED',
          replaceText('maxCharactersError', {
            what: 'the new text',
            len: after.length,
            at: t.at,
            limit: t.unit.max
          }),
          replaceText('maxCharactersNext', { limit: t.unit.max - (after.length - replace.length) }),
          { rule: 'max-characters', at: t.at, limit: t.unit.max }
        )
    }
  }
  return located
}

/** @param {string} by */
const splitBy = (by) =>
  ({
    'line-break': 'at the line break',
    dash: 'at the dash',
    comma: 'at the comma',
    colon: 'at the colon',
    words: 'between words',
    'one-line': 'onto line 1'
  })[by] ?? by

/**
 * Every change of one call located, with the count rules over the whole call and no two changes on
 * the same words. The first refusal wins (`change` says which), and nothing is written.
 *
 * `stored` may be a function of the change: an engine whose units depend on the words looked for
 * (WordPress leaves out a value whose every hit lies inside an identity token, as the Joomla engine's
 * `storedFor` does) gives the list per change, and the count rules still run over the whole call.
 * @param {{ plan: ReplacePlan, page: { units: RenderedUnit[], lang: string | null } | null,
 *   stored: readonly StoredUnit[] | ((change: ReplaceChange, i: number) => readonly StoredUnit[]),
 *   confirmed?: boolean, mustKeepTwo?: boolean, hooks?: LocateHooks }} input
 * @returns {{ ok: true, results: Located[] } | Refusal}
 */
export function locateAll({ plan, page, stored, confirmed = false, mustKeepTwo = false, hooks }) {
  /** @type {Located[]} */
  const results = []
  for (let i = 0; i < plan.changes.length; i += 1) {
    const r = locate({
      page,
      stored: typeof stored === 'function' ? stored(plan.changes[i], i) : stored,
      change: plan.changes[i],
      path: plan.path,
      pathGiven: plan.pathGiven,
      where: plan.where,
      at: plan.at,
      all: plan.all,
      countRules: false,
      mustKeepTwo,
      hooks
    })
    if (!r.ok) return plan.changes.length > 1 ? { ...r, change: i } : r
    results.push(r)
  }
  // Two changes on the same characters of one value cannot both be written.
  /** @type {Map<string, { i: number, s: number, e: number }[]>} */
  const spans = new Map()
  for (let i = 0; i < results.length; i += 1)
    for (const t of results[i].targets) {
      const list =
        t.kind === 'split'
          ? [
              [t.a.at, 0, Infinity],
              [t.b.at, 0, Infinity]
            ]
          : [{ unit: t.unit, hits: t.hits }, ...t.twins].flatMap(({ unit, hits }) =>
              hits.map((h) => [unit.at, h.a, h.b])
            )
      for (const [key, s, e] of /** @type {[string, number, number][]} */ (list)) {
        const got = spans.get(key) ?? []
        const clash = got.find((x) => x.i !== i && x.s < e && s < x.e)
        if (clash)
          return refuse(
            'BAD_PARAMS',
            replaceText('overlapError', { i: clash.i, j: i, at: key }),
            replaceText('overlapNext'),
            {
              change: i,
              param: `changes[${i}].find`
            }
          )
        got.push({ i, s, e })
        spans.set(key, got)
      }
    }
  const refusal = countRefusal(results, {
    all: plan.all,
    expect: plan.expect,
    confirmed,
    dryRun: plan.dryRun
  })
  if (refusal) return refusal
  return { ok: true, results }
}

/**
 * The key a dryRun of this call is remembered under, so a later `all` call with the same words may
 * write without `expect` (confirm-count). IX2 stores it in call memory for the conversation.
 * @param {ReplacePlan} plan
 */
export function confirmKey(plan) {
  return JSON.stringify([
    plan.path,
    plan.where,
    plan.all,
    plan.changes.map((c) => [foldForMatch(c.find), c.replace, ...(c.href ? ['href'] : [])])
  ])
}

// ── Values, receipts, undo (F3 §3.7, D14) ────────────────────────────────────────────────────────

/**
 * `replace` as it is written into a value found in glyph mode: the arrow the template prints is not
 * stored, so the same arrow on the new words is dropped too.
 * @param {string} replace
 * @param {{ lead: string, trail: string } | null} glyph
 */
function plainReplace(replace, glyph) {
  if (!glyph) return replace
  let r = replace
  if (glyph.trail && r.endsWith(glyph.trail)) r = r.slice(0, -glyph.trail.length).trimEnd()
  if (glyph.lead && r.startsWith(glyph.lead)) r = r.slice(glyph.lead.length).trimStart()
  return r
}

/**
 * The raw `[start, end)` of view span `[a, b)` of a unit.
 * @param {TextView} unit
 * @param {Hit<TextView>} hit
 * @returns {[number, number]}
 */
export function rawSpan(unit, hit) {
  const map = hit.mode === 'bare' ? unit.bmap : unit.map
  return [map[hit.a][0], map[hit.b - 1][1]]
}

/**
 * `raw` with each edit applied, right to left, so earlier offsets stay true. Overlapping edits are a
 * bug in the caller: thrown, never half-applied.
 * @param {string} raw
 * @param {{ s: number, e: number, text: string }[]} edits
 */
export function spliceRaw(raw, edits) {
  const sorted = [...edits].sort((x, y) => y.s - x.s)
  for (let k = 1; k < sorted.length; k += 1)
    if (sorted[k].e > sorted[k - 1].s) throw new Error('spliceRaw: overlapping edits')
  let out = raw
  for (const { s, e, text } of sorted) out = out.slice(0, s) + text + out.slice(e)
  return out
}

/**
 * The unit's visible text after the change, for before/after and length checks.
 * @param {string} cased
 * @param {readonly Hit<TextView>[]} hits
 * @param {string} replace
 */
function afterText(cased, hits, replace) {
  const text = replace.replace(/\s*\n\s*/g, ' ')
  // an accent-blind hit indexes the `bare` view; it is written only as the whole unit
  if (hits.some((h) => h.mode === 'bare')) return hits.some((h) => h.whole) ? text : cased
  let out = cased
  for (const h of [...hits].sort((x, y) => y.a - x.a)) out = out.slice(0, h.a) + text + out.slice(h.b)
  return out
}

/**
 * @typedef {(text: string, unit: StoredUnit) => string} Encode
 *   How new words are written into a stored value: HTML-escaped for a WordPress body, as is for a
 *   Joomla slot or an EmDash field. A line break in `text` is the two-line hint; the default writes a
 *   space.
 */

/** @type {Encode} */
const plainEncode = (text) => text.replace(/\s*\n\s*/g, ' ')

/**
 * Every value one call writes: each stored value once, with every change of the call spliced into
 * it (a two-line heading: both values whole), plus the language copies. `before` is the value as
 * read — the exact undo (D14).
 * @param {readonly Located[]} results
 * @param {{ encode?: Encode }} [options]
 * @returns {{ at: string, unit: StoredUnit, before: string, value: string }[]}
 */
export function plannedWrites(results, { encode = plainEncode } = {}) {
  /** @type {Map<string, { unit: StoredUnit, edits: { s: number, e: number, text: string }[], whole: string | null }>} */
  const byAt = new Map()
  /** @param {StoredUnit} unit */
  const slot = (unit) => {
    let got = byAt.get(unit.at)
    if (!got) byAt.set(unit.at, (got = { unit, edits: [], whole: null }))
    return got
  }
  for (const r of results) {
    const text = plainReplace(r.change.replace, r.glyph)
    for (const t of r.targets) {
      if (t.kind === 'split') {
        const parts = t.parts ?? { a: text, b: '' }
        slot(t.a).whole = encode(parts.a, t.a)
        slot(t.b).whole = encode(parts.b, t.b)
        continue
      }
      for (const { unit, hits } of [{ unit: t.unit, hits: t.hits }, ...t.twins])
        for (const h of hits) {
          const [s, e] = rawSpan(unit, h)
          const edits = slot(unit).edits
          if (!edits.some((x) => x.s === s && x.e === e)) edits.push({ s, e, text: encode(text, unit) })
        }
    }
  }
  return [...byAt.values()].map(({ unit, edits, whole }) => ({
    at: unit.at,
    unit,
    before: unit.raw,
    value: whole ?? spliceRaw(unit.raw, edits)
  }))
}

/**
 * before/after of every place one call changes, as the receipt and a dryRun print them: the unit's
 * text cut to 160 characters around the change.
 * @param {Target} t
 * @param {ReplaceChange} change
 * @returns {{ at: string, where: string | null, label?: string, before: string, after: string,
 *   languages?: number, onPage?: boolean }}
 */
export function wouldOf(t, change) {
  if (t.kind === 'split') {
    const parts = t.parts ?? { a: change.replace, b: '' }
    return {
      at: t.at,
      where: t.where,
      ...(t.a.label ? { label: t.a.label } : {}),
      before: clip(`${t.a.cased} / ${t.b.cased}`, 0, 0),
      after: clip(parts.b ? `${parts.a} / ${parts.b}` : parts.a, 0, 0)
    }
  }
  // one fragment of a line printed from several slots: its whole new value (an engine sets `whole`)
  if (typeof t.whole === 'string')
    return {
      at: t.at,
      where: t.where,
      ...(t.unit.label ? { label: t.unit.label } : {}),
      before: clip(t.unit.cased, 0, 0),
      after: clip(t.whole, 0, 0),
      ...(t.rendered === false ? { onPage: false } : {})
    }
  const bare = t.hits[0].mode === 'bare'
  const h = bare ? { a: 0, b: t.unit.cased.length } : t.hits[0]
  const replace = change.replace.replace(/\s*\n\s*/g, ' ')
  const after = afterText(t.unit.cased, t.hits, replace)
  return {
    at: t.at,
    where: t.where,
    ...(t.unit.label ? { label: t.unit.label } : {}),
    before: clip(t.unit.cased, h.a, h.b),
    after: clip(after, h.a, h.a + replace.length),
    ...(t.twins.length > 0 ? { languages: t.twins.length + 1 } : {}),
    ...(t.rendered === false ? { onPage: false } : {})
  }
}

/**
 * The exact prior values of every value one call writes, for EmDash's undo (D14): never the clipped
 * receipt text.
 * @param {readonly { at: string, before: string }[]} writes - from {@link plannedWrites}.
 * @returns {RestoreValue[]}
 */
export const restoreOf = (writes) => writes.map((w) => ({ at: w.at, value: w.before }))

/**
 * The undo a receipt carries (D14): `apply.revert` on Joomla and WordPress (Joomla's reverts the
 * site's LATEST apply — said so); on EmDash the same call with `restore` and the exact prior values,
 * except a value over {@link RESTORE_LEAF_MAX} characters, which names `revision_restore` instead.
 * @param {{ platform: string, applyId?: string | null, restore?: readonly RestoreValue[] }} input
 * @returns {Record<string, unknown>}
 */
export function undoOf({ platform, applyId = null, restore = [] }) {
  if (platform !== 'emdash') {
    return {
      action: 'apply.revert',
      params: { apply_id: applyId },
      ...(platform === 'joomla' ? { note: REPLACE_NEXT.undoJoomla } : {})
    }
  }
  const small = restore.filter((r) => r.value.length <= RESTORE_LEAF_MAX)
  const big = restore.filter((r) => r.value.length > RESTORE_LEAF_MAX)
  return {
    action: 'content.replace',
    params: { restore: small.map((r) => ({ at: r.at, value: r.value })) },
    ...(big.length > 0 ? { note: replaceText('undoRevision', { at: big.map((r) => r.at).join(', ') }) } : {})
  }
}

/** @param {unknown} v */
const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length

/**
 * The answer IS the receipt (F3 decision 12): what changed where, before → after, and the undo.
 *
 * 🔒 ≤ {@link RECEIPT_MAX_BYTES}, CUT FROM THE LEAST USEFUL END — `alsoIn`, then `unchanged`, then
 * the labels, then places beyond the first six (counted in `more`) — and NEVER the undo: an undo
 * that no longer restores the exact value is worse than a long answer (D14). A receipt over budget
 * with its undo whole is possible only for EmDash values near {@link RESTORE_LEAF_MAX}.
 *
 * `removal`: every change of the call had an empty `replace` — words taken out. A space is left where
 * they stood (`"… equipment. "`), invisible in the page, and the receipt says it is harmless: the model
 * that read it in `after` sent a second call to trim it, refused as "replace equals find" (round 7).
 * Not stored tidier on purpose: the join is bytes the customer did not name, and three engines' undo
 * restores the value as it was read.
 * @param {{ platform: string, path: string, applyId?: string | null,
 *   changed: ReturnType<typeof wouldOf>[], companions?: unknown[],
 *   unchanged?: { text: string, where: string, why: string }[], stillHolds?: StillHolds | null,
 *   alsoIn?: { at: string, where: string | null, text: string }[], notes?: string[],
 *   notReached?: string | null, removal?: boolean, undo: Record<string, unknown> }} input
 * @returns {Record<string, unknown>}
 */
export function receipt(input) {
  const { platform, path, applyId = null, companions = [], notReached = null, undo } = input
  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    platform,
    path,
    ...(applyId ? { apply_id: applyId } : {}),
    changed: input.changed,
    ...(companions.length > 0 ? { companions } : {}),
    ...(input.stillHolds ? { stillHolds: input.stillHolds } : {}),
    ...(input.unchanged?.length ? { unchanged: input.unchanged } : {}),
    ...(input.alsoIn?.length ? { alsoIn: input.alsoIn } : {}),
    ...(input.notes?.length ? { notes: input.notes } : {}),
    ...(notReached ? { notReached } : {}),
    undo,
    // 🔒 A place left out is said in `next`, not only listed: 27/09 A1 EmDash V4-words-01 ("the hotline,
    // everywhere") changed the footer, got the top bar back in `alsoIn`, read "this is the receipt …
    // read nothing back" and stopped — the top bar kept the old number on every page.
    next: input.alsoIn?.length
      ? REPLACE_NEXT.receiptAlsoIn
      : input.stillHolds
        ? REPLACE_NEXT.receiptStillHolds
        : input.removal === true
          ? REPLACE_NEXT.receiptRemoved
          : REPLACE_NEXT.receipt
  }
  return fit(out, 'changed')
}

/** Words the finds of one `changes` call must share to be read as one bulk change, at least. */
const LEAD_MIN_CHARS = 4
/** Places a receipt lists as still holding the shared lead words, at most. */
const LEAD_LEFT_MAX = 6

/**
 * @typedef {{ opening: string, places: { at: string, text: string }[] }} StillHolds
 */

/**
 * 🔒 A BULK CHANGE SAYS WHAT STAYED. Measured on the v6 bench (WP L5-01): six "Timeline: …" lines,
 * four sent in `changes`, and the receipt listed only what it wrote — the dropped line was visible
 * to nobody, and the customer was told it was meant to stay. When two or more finds open with the
 * same words, the places that still open with them and were not written come back as `stillHolds`,
 * so a dropped line shows in the receipt. A list, not an instruction: leaving one on purpose is
 * the customer's choice. Null when the finds share no opening or nothing is left.
 * @param {readonly ReplaceChange[]} changes
 * @param {readonly StoredUnit[]} units - the stored units the call read
 * @param {Iterable<string>} written - the `at` of every place written
 * @returns {StillHolds | null}
 */
export function leadLeftovers(changes, units, written) {
  if (changes.length < 2) return null
  const words = changes.map((c) => views(c.find).lower.split(/\s+/).filter(Boolean))
  const first = words[0] ?? []
  let n = 0
  while (n < first.length && words.every((w) => w[n] === first[n])) n += 1
  // never the whole of a find: the shared part must leave each find something of its own
  n = Math.min(n, ...words.map((w) => w.length - 1))
  const lead = first.slice(0, Math.max(n, 0)).join(' ')
  if (lead.replace(/[^\p{L}\p{N}]/gu, '').length < LEAD_MIN_CHARS) return null
  const done = new Set(written)
  const startsWith = new RegExp(`(^|\\n)${lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  const places = units
    .filter((u) => u.writable !== false && !done.has(u.at) && startsWith.test(u.lower))
    .slice(0, LEAD_LEFT_MAX)
    .map((u) => ({ at: u.at, text: clip(u.cased, 0, 0, 60) }))
  return places.length > 0 ? { opening: lead, places } : null
}

/**
 * A dryRun's answer: where the words are and what would change, nothing written.
 * @param {{ platform: string, path: string, results: readonly Located[], all?: false | true | 'page' }} input
 * @returns {Record<string, unknown>}
 */
export function dryRunAnswer({ platform, path, results, all = false }) {
  const would = results.flatMap((r) => r.targets.map((t) => wouldOf(t, r.change)))
  const count = results.reduce((n, r) => n + r.places, 0)
  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    dryRun: true,
    platform,
    path,
    count,
    would,
    ...(results.some((r) => r.unchanged.length)
      ? { unchanged: results.flatMap((r) => r.unchanged).slice(0, 4) }
      : {}),
    ...(results.some((r) => r.alsoIn.length)
      ? { alsoIn: results.flatMap((r) => r.alsoIn).slice(0, ALSO_IN_SHOWN) }
      : {}),
    ...(results.some((r) => r.notes.length) ? { notes: [...new Set(results.flatMap((r) => r.notes))] } : {}),
    next: replaceText('dryRun', { expectHint: all ? replaceText('dryRunExpect', { n: count }) : '' })
  }
  return fit(out, 'would')
}

/**
 * Cut an answer to {@link RECEIPT_MAX_BYTES}, least useful first; `undo` and `next` are never cut.
 * @param {Record<string, unknown>} out
 * @param {'changed' | 'would'} listKey
 */
function fit(out, listKey) {
  if (bytes(out) <= RECEIPT_MAX_BYTES) return out
  for (const key of ['alsoIn', 'unchanged', 'companions', 'notes']) {
    if (!(key in out)) continue
    delete out[key]
    if (bytes(out) <= RECEIPT_MAX_BYTES) return out
  }
  const list = /** @type {Record<string, unknown>[]} */ (out[listKey])
  out[listKey] = list.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'label')))
  if (bytes(out) <= RECEIPT_MAX_BYTES) return out
  let keep = Math.min(list.length, 6)
  while (keep >= 1) {
    out[listKey] = /** @type {Record<string, unknown>[]} */ (out[listKey]).slice(0, keep)
    out.more = list.length - keep
    if (bytes(out) <= RECEIPT_MAX_BYTES) return out
    keep -= 1
  }
  return out
}

// ── Companions: links that carry the same fact ──────────────────────────────────────────────────

/**
 * The digits a phone number dials. A national trunk prefix written in brackets after a country code is
 * not dialled from abroad — `+61 (0)7 5550 6697` dials `+61755506697`, `+44 (0)20 7946 0018` dials
 * `+442079460018` (ITU-T E.123) — so it is left out of the comparison and of the link. Measured
 * 02/10/2026 on an imported Joomla copy: the footer's `tel:+61755506697` kept dialling the old number
 * after "+61 (0)7 5550 6697" changed, because its digits never equalled the page's.
 * @param {string} text - the number as written, or a `tel:` href
 * @returns {string}
 */
export function dialDigits(text) {
  const t = String(text)
  return (/^\s*(?:tel:\s*)?\+/i.test(t) ? t.replace(/\(\s*0\s*\)/g, '') : t).replace(/\D/g, '')
}

/**
 * The link that must follow a changed fact: `tel:` when a phone number changes, `mailto:` when an
 * e-mail does — or null when `href` carries something else. One rule for the three engines.
 * @param {string} href
 * @param {string} find
 * @param {string} replace
 * @returns {string | null}
 */
export function followHref(href, find, replace) {
  const h = href.trim()
  if (/^tel:/i.test(h) && isPhone(find) && isPhone(replace)) {
    if (dialDigits(h) !== dialDigits(find)) return null
    const plus = replace.trim().startsWith('+') ? '+' : ''
    return `tel:${plus}${dialDigits(replace)}`
  }
  if (/^mailto:/i.test(h) && isEmail(find) && isEmail(replace)) {
    const [addr, query = ''] = h.slice(7).split('?')
    if (addr.toLowerCase() !== find.trim().toLowerCase()) return null
    return `mailto:${replace.trim()}${query ? `?${query}` : ''}`
  }
  return null
}
