/**
 * THE REPLACE JOB ON WORDPRESS (PLAN v2 P10, F3 §5): read the page the visitor sees and the records
 * that render into it, let the core (`replace.mjs`) decide which stored value shows the words, rewrite
 * only those words inside each record, prove the record still parses, and write it back through the
 * ordinary door — one `content.update` per record under ONE apply id this call mints, so the receipt's
 * `apply.revert` undoes exactly this change.
 *
 * 🔒 WHY THE HARNESS REWRITES THE BODY, NOT THE MODEL. A WordPress `post_content` (and a template
 * part's `content`) is written WHOLE: the component has no string-level write. In r2 the model sent
 * the whole 26,884-char home body back to change three words (≈ 9k output tokens, ≈ 25 s), and 6 of
 * 33 WordPress cases CUT a live page with their first write (C02, C07, C10, C28, C32, C33 — D6′).
 * Here the model sends `{find, replace}`, ~40 tokens; the body is spliced host-side at the exact raw
 * bytes of the words (entities, NBSP, `<br><em>` splits: 28.8 % of the visible strings on the three
 * ja-business pages are not byte-identical in storage, `structure/wordpress.md` §4), and every other
 * byte of the record is sent back unchanged.
 *
 * 🔒 EVERY WRITE PASSES THE BODY GUARD (D6′), FOR THE SAME REASON THE MODEL'S DO. Each record is read
 * with `content.get` IMMEDIATELY before it is written (the WordPress component has no expected
 * revision), through the same door: a template part only as `content.get {kind:"templatePart", key}`
 * — the one read the guard remembers a part by, and the one that names the ACTIVE theme's row
 * (`find_template_part`, claude-cowork 2aa7840 `class-claude-cowork-writers.php:861`); the part list
 * is only the index of slugs, so a row another theme left in the table is never a source. A body the
 * change would leave under `SHRINK_RATIO` of that read is refused here before anything is written,
 * unless the caller passes the customer's own request to remove (`removes`), and a body whose block
 * comments WordPress cannot read is never sent (`blockMarkupProblem`, the guard's own check).
 *
 * 🔒 THE DOOR MUST ANSWER WHOLE RECORDS. Every value read here is written back with only the words
 * changed, so a read cut to an arrival budget (D26: 8,000 chars for a list with bodies; IX2's 16,000
 * for a WordPress `content.get` of a post) is refused (`READ_FAILED`), never written back — IX2 wires
 * the job's reads past those budgets, and its writes through the guard. Pure except for the injected I/O
 * (`read`, `write`, `pageHtml`, `mintApplyId`), so `test/replace-wordpress.test.mjs` drives every road
 * with a fake component.
 */

import { IDENTITY_TOKENS } from './contract-check.mjs'
import { LEGACY_BOUND_MESSAGE, LEGACY_STRUCTURE_CODE } from './legacy-refusal.mjs'
import { decodeEntities, foldForMatch, markupAt, renderedUnits, views } from './html-units.mjs'
import {
  RECEIPT_MAX_BYTES,
  REPLACE_CALL,
  REPLACE_WHY,
  clip,
  dialDigits,
  dryRunAnswer,
  followHref,
  isEmail,
  isPhone,
  leadLeftovers,
  locateAll,
  matchUnits,
  rawSpan,
  receipt,
  replaceText,
  splitTwoLines,
  undoOf,
  wouldOf
} from './replace.mjs'
import {
  SHRINK_RATIO,
  VERIFY_RATIO,
  blockMarkupProblem,
  outcomeUnknownAnswer,
  quotesCustomer
} from './site-call.mjs'
import { isLoremSample, withSampleShrink } from './sample-text.mjs'
import { outcomeUnknown, withNext } from './site.mjs'
import {
  RENDERED_TEXT,
  closedAnswer,
  renderedSupport,
  renderedText,
  replaceRendered,
  storeHoldingLink
} from './rendered-words.mjs'

/** @typedef {import('./replace.mjs').StoredUnit} StoredUnit */
/** @typedef {import('./replace.mjs').ReplacePlan} ReplacePlan */
/** @typedef {import('./replace.mjs').RestorePlan} RestorePlan */
/** @typedef {import('./replace.mjs').Located} Located */
/** @typedef {import('./replace.mjs').Target} Target */
/** @typedef {import('./html-units.mjs').RenderedUnit} RenderedUnit */
/** @typedef {import('./html-units.mjs').UnitElement} UnitElement */
/** @typedef {(action: string, params: Record<string, unknown>) => Promise<any>} Door */

/**
 * Whether every edit of a record's write that leaves it shorter removes the template's lorem, read off the record
 * itself (`x.before`): the one shrink a demo's replace may make without the customer's words (`sample-text.mjs`).
 * @param {{ before: string, edits?: { s: number, e: number, text: string }[] }} x
 */
const loremOnly = (x) => {
  const cuts = (x.edits ?? []).filter((edit) => edit.text.length < edit.e - edit.s)
  return cuts.length > 0 && cuts.every((edit) => isLoremSample(x.before.slice(edit.s, edit.e)))
}

// ── Limits ───────────────────────────────────────────────────────────────────────────────────────

/** Reads in flight at once: all read-class relays, no lease (F3 §5.2). */
const READ_PARALLEL = 6
/** `post-N` containers (query loops), `cat-item-N` links and CF7 forms read per page, at most. */
const PAGE_RECORDS_MAX = 12
/** wp_navigation posts read per page, at most (ja-business renders four). */
const NAV_REFS_MAX = 12
/** Synced patterns (`core/block` refs of the page body and the parts) read per page, at most. */
const BLOCK_REFS_MAX = 12
/** Theme patterns (`core/pattern` refs of the page body, the parts and the templates) read per page, at most. */
const PATTERN_REFS_MAX = 12
/** Templates the wider read reads by slug, at most (a block theme ships ~10–20). */
const TEMPLATE_READ_MAX = 30
/**
 * The wp_navigation index a navigation block with no menu of its own is resolved from: rows per list
 * page (no bodies) and list pages at most. A site past 400 menus leaves that navigation unresolved,
 * never guessed.
 */
const NAV_INDEX_ROWS = 100
const NAV_INDEX_PAGES = 4
/**
 * The blocks that print one menu item's label (`label` attribute). Their words show only inside a
 * rendered `<nav class="wp-block-navigation">`, never beside it.
 */
const NAV_ITEM_BLOCKS = new Set(['core/navigation-link', 'core/navigation-submenu', 'core/home-link'])
/**
 * Styling a change of words may drop when it runs across it (said in a note): a line break and the
 * inline emphasis tags (`b`/`i` are `strong`/`em` by another name). Anything else — a link above all,
 * an image, `sup`, `code` — is function, not styling: a change across it is refused (`marksError`).
 */
const DROPPABLE_TAGS = new Set(['br', 'em', 'strong', 'span', 'b', 'i'])
/** The lease refusal: a revert refused with it too is answered with the same code, not `PARTIAL`. */
const LEASE_CODES = new Set(['SITE_BUSY'])
/** The component's own ceiling for a list with bodies (claude-cowork 2aa7840 `Engine.php:872`). */
const SITE_PAGE_ROWS = 25
/**
 * Site scope reads at most this many list pages (100 posts and pages). ja-business holds 21 in its
 * default language (≈ 335 KB of bodies, measured on the wp-dmlj6g baseline); a site past the cap is
 * searched in part and the receipt says so (`notReached`).
 */
const SITE_PAGES_MAX = 4
/** Template parts listed as the slug index. */
const PART_INDEX_LIMIT = 100
/**
 * The longest identity value an answer types into the call that sets it; a longer one is left as a
 * placeholder for the model to fill, since a value cut to fit the sentence is a call that writes the
 * wrong words ({@link identityAnswer}).
 */
const IDENTITY_VALUE_IN_CALL = 40

/**
 * The block attributes that hold words a visitor reads: a menu label (`core/navigation-link`, the
 * theme's mega-menu trigger), a search box's label, placeholder and button, a read-more link. Surveyed
 * over every string attribute of the 21 default-language posts, the two parts and the 165 menus of the
 * ja-business baseline: `label` 402×, `placeholder`/`buttonText` 2×, `moreText` 2× — the rest are
 * slugs, classes and URLs. `title` is left out on purpose: a menu link's `title` is its tooltip, and
 * matching it beside the label would make every menu item two places.
 */
const TEXT_ATTRS = Object.freeze([
  'label',
  'placeholder',
  'buttonText',
  'moreText',
  'prefix',
  'suffix',
  'content',
  'text',
  'caption'
])

/**
 * Stores the theme itself prints from, keyed by `<theme slug>@<version>` (F3 §5.2 theme table). An
 * unknown theme or version gets none: its words stay `unchanged` (NOT_EDITABLE), never a guess.
 *
 * `wp-tracy-business@1.1.0` — the posts page's H1 is the post meta `tracy_page_heading` of the page
 * `page_for_posts` names, printed over the template's own "News" (`wp_tracy_business_home_head`),
 * measured on `/news/` ("News & engineering notes", post 51). The same meta on the other 11 pages
 * renders nowhere (the r2 decoy: post 42's holds the home H1 verbatim), so it is read for the posts
 * page only.
 */
export const WP_THEME_STORES = Object.freeze({
  'wp-tracy-business@1.1.0': Object.freeze({
    blog: Object.freeze([Object.freeze({ key: 'tracy_page_heading', tag: 'h1' })])
  })
})

/**
 * Every sentence this engine adds to the core's (`REPLACE_NEXT`), in the refusal template (T10: an
 * error ≤ 160 characters — the rule and the value; a next ≤ 200 — one call or one instruction), filled
 * by {@link wpText}. `test/replace-wordpress.test.mjs` holds each on its worst case.
 */
export const WP_REPLACE_NEXT = Object.freeze({
  restoreError: 'restore undoes an EmDash change; this site runs WordPress',
  restoreNext: 'undo a WordPress change with apply.revert {apply_id:"<the apply_id of its receipt>"}',
  markupError: 'the new words would leave {what} with markup WordPress cannot read; nothing was written',
  markupNext:
    'send the new words as plain text, without < > or block comments: the same call with that replace',
  bracketError: '"{replace}" holds [ or ], which a contact form reads as a field; nothing was written',
  bracketNext: 'the same call with the new words written without [ and ]',
  shrinkError: 'this change leaves {what} at {after} of {before} characters; nothing was written',
  // 🔒 A ROAD, NOT A DEAD LOOP: the job has no `removes` parameter; the caller passes the customer's
  // LATEST MESSAGE as `removes` on every call (`replaceOnWordPress`), so their reply asking for the
  // removal is what lets the same call through — and the body guard checks that very message again
  // (`quotesCustomer`: three words or more, one of them the removal verb).
  shrinkNext:
    'ask the customer to confirm in a sentence of their own that says remove ("yes, remove it"); after that reply, the same call goes through',
  cutError: 'the site sent {what} cut short; a cut record is never written back',
  cutNext: 'tell the customer this change cannot be made here right now; that is an answer',
  changedError: '{what} changed on the site while this call ran; nothing was written',
  changedNext:
    'someone else is editing this site: tell the customer, and make the same call once when they are done',
  changedUndoneError:
    '{what} changed on the site while this call ran; the {n} records written first were undone',
  keptError: 'WordPress kept {stored} of {sent} characters of {what}; the change was undone',
  keptMarkupError: 'WordPress stored {what} with block markup it cannot read; the change was undone',
  keptNext:
    'tell the customer this change cannot be made here: WordPress would not keep the record whole; that is an answer',
  uncheckedError: 'WordPress could not be read back after writing {what}, so the change was undone',
  uncheckedNext:
    'make the same call once; if the site cannot be read again, tell the customer it is not answering',
  outcomeError:
    'the answer to writing {what} was lost: {n} or {n1} of {m} records may now hold the new words',
  outcomeNext:
    '{call} {find:"{new}", replace:"{old}", dryRun:true} in about 30 s shows where the new words stand; do not repeat the call',
  outcomeGoneNext:
    '{call} {find:"{old}", replace:"", dryRun:true} in about 30 s answers NOT_FOUND if the removal landed; do not repeat the call',
  boundError:
    "this site's content door takes words only through its quickstart contract; nothing was written",
  boundNext:
    'change these words with content.contract (inspect, then apply), or through WordPress itself (wp-cli in the shell); never SQL',
  partialError: '{n} of {m} records were written and undoing them failed: {failed}',
  partialNext:
    'tell the customer in plain words what stands; apply.revert {apply_id:"{applyId}"} undoes the rest, once',
  busyPartialNext:
    'tell the customer in plain words that {n} places changed and stand; when the site is free, apply.revert {apply_id:"{applyId}"} undoes them, once. Do not retry in a loop',
  marksError: '"{find}" crosses a link or other markup ({tags}); nothing was written',
  marksNext:
    'change each part on its own: changes:[{find:"{a}", replace:"<new words>"}, {find:"{b}", replace:"<new words>"}]',
  sameError: '"{replace}" is what the site already holds there; nothing was written',
  sameNext:
    'tell the customer the page already reads so; if other words were meant, the same call with those in replace',
  menuNext:
    'menus are wp_navigation posts: content.list {kind:"post", post_type:"wp_navigation"} lists them; content.get the one with this label, then content.update it',
  unreadNext: 'the same call with path:"{path}" reads that record; or all:true to search every page',
  // 🔒 NEVER THE THEME'S FILES OR THE SITE EDITOR: the wide pass has read every template row already,
  // and words a theme prints at render time are in neither (the `content.renderedWords` road).
  untracedNext: RENDERED_TEXT.stayNext,
  markupDropped: 'the words spanned styling ({tags}); the new words were written without it',
  partShared: 'the header and footer are one record for every language: the change shows in all of them',
  partEveryPage: 'the header and footer show on every page: the change shows on all of them',
  blockShared: '{what} shows on every page that uses it: the change shows on all of them',
  patternExpanded:
    'the theme pattern "{what}" goes into this page as its own words, as the block editor does on save; undoing the change puts the pattern back',
  themeFileCopied:
    '{what} came from the theme file: the site now keeps its own copy, as the Site Editor does; undoing the change removes it',
  templateShared: '{what} frames every page that uses it: the change shows on all of them, in every language',
  optionShared:
    'the site title and tagline are one value for every language: the change shows in all of them',
  pageLanguages: 'their other language versions are separate records and were not changed',
  factLanguages:
    'pages in other languages are separate records the content door does not list; any copy there was not changed',
  siteCapped: 'searched the first {n} posts and pages of the site; the rest were not searched',
  shownOn: 'shown on {path}',
  notShownYet: 'not shown on {path} yet: a page cache may still hold the old words',
  notChecked: 'not checked: the page could not be read again',
  linkPhone: 'the link follows the number',
  linkEmail: 'the link follows the address',
  toggleTwin: 'the theme toggle shows these words too',
  // 🔒 IDENTITY TOKENS (tracy-business 1.2.0+): a part or a body prints `{site.legalName}`, the theme
  // fills it from ONE option on every page. Words that ARE such a value change there, once — never
  // typed into the line, which would leave every other page on the old value while the receipt said
  // done (the Joomla engine's rule, `replace-joomla.mjs`).
  identityError:
    '"{find}" is the site identity\'s {field}, one setting every page prints; nothing was written',
  identityAcrossError:
    '"{find}" changes the site identity\'s {field} and the words beside it; nothing was written',
  identityContractNext:
    'set it once for every page: content.contract {operation:"apply", changes:{"{slot}":"{value}"}}',
  identityOptionNext:
    'set it once for every page: content.update {kind:"option", key:"tracy_site_identity", fields:{value:<identity, with {key}:"{value}">}}',
  identityContractAcrossNext:
    'content.contract {operation:"apply", changes:{"{slot}":"<the new {field}>"}} sets it on every page; then this call changes the words beside it',
  identityOptionAcrossNext:
    'content.update {kind:"option", key:"tracy_site_identity", fields:{value:<identity, with {key}:"…">}} sets it on every page; then this call for the words beside it',
  tokenLine:
    "{what} showed the site identity's {field} through a token; it now holds its own words and no longer follows it"
})

/**
 * Fill one {@link WP_REPLACE_NEXT} sentence. A quoted fact (the customer's words, a label) is cut to
 * 60 characters, as the core does — the two parts `marksNext` names to 40, since it quotes two — so a
 * long quote cannot push a sentence past its budget.
 * @param {keyof typeof WP_REPLACE_NEXT} key
 * @param {Record<string, unknown>} [facts]
 */
export function wpText(key, facts = {}) {
  return WP_REPLACE_NEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (name === 'call') return REPLACE_CALL
    if (!(name in facts)) return whole
    const v = String(facts[name])
    const width = QUOTED_WIDTH[/** @type {keyof typeof QUOTED_WIDTH} */ (name)] ?? Infinity
    return v.length > width ? `${v.slice(0, width - 1)}…` : v
  })
}

/**
 * The facts {@link wpText} quotes from the call or the site, and how long each may be. `new`/`old`
 * (the lost-answer next's dryRun) are passed only when they fit whole — a cut find is a call that
 * fails — so their width holds the budget test's worst case, never a live quote.
 */
const QUOTED_WIDTH = Object.freeze({
  // an identity value is sent whole or not at all (`identityAnswer`): this width only holds the budget
  value: IDENTITY_VALUE_IN_CALL,
  find: 60,
  replace: 60,
  what: 60,
  failed: 60,
  tags: 40,
  theme: 40,
  a: 40,
  b: 40,
  new: 32,
  old: 32
})

/** Why words the page shows have no door here (F3 §5.5), on top of the core's generic reasons. */
const WHY = Object.freeze({
  date: 'a post date, which changes on the post itself',
  computed: 'a count or page number WordPress computes',
  author: "the author's name, which no door here changes",
  languages: 'the language switcher, which the translation plugin prints',
  themeFile: "the theme's template file, which changes through the theme's files or wp-cli, not this call",
  theme: 'words the theme prints, which no door here changes',
  unreadable: 'a record whose block markup WordPress cannot read',
  patternTwice: 'a pattern this page inserts twice, so which copy was meant is unclear',
  // 🔒 THE FOUR BELOW ARE NOT "CANNOT": each names a record this call did not reach, and its next
  // (`whyNext`) names the road that does — never the core's "do not look for another way in".
  menu: 'a menu label this call could not trace to its menu',
  unread: 'words of a record this call did not read',
  term: 'a category or tag name whose record this page does not name',
  /**
   * Words an identity token prints (`{site.legalName}` in a part or a body): a road, not a "cannot" —
   * the next names the one call that sets the value ({@link identityAnswer}).
   * @param {string} label - the field as a reader names it (`legal name`, `phone`)
   */
  identity: (label) => `the site identity's ${label}, one setting every page prints`,
  /**
   * A theme (or version) with no row in {@link WP_THEME_STORES}: its own stores are not known here,
   * so "the theme prints them" would be a guess. ≤ 69 characters, so the core's `notEditableError`
   * stays in its 160 with a 60-character find.
   * @param {string} theme - `<slug>@<version>`
   */
  untraced: (theme) =>
    `words in no record this call reads for theme ${theme.length > 24 ? `${theme.slice(0, 23)}…` : theme}`
})

/**
 * @param {string} code
 * @param {string} error
 * @param {string} next
 * @param {Record<string, unknown>} [extra]
 */
const refuse = (code, error, next, extra = {}) => ({ ok: false, code, verdict: code, error, next, ...extra })

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/**
 * A refusal's code, as the relay spells it (`code`) or the component does (`error`).
 * @param {unknown} a
 */
const codeOf = (a) => (isRecord(a) ? String(a.code || a.error || '') : '')
/** @param {unknown} v */
const positive = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : 0
  return Number.isInteger(n) && n > 0 ? n : 0
}

// ── Block grammar (WordPress `WP_Block_Parser`) ──────────────────────────────────────────────────

/**
 * @typedef {{ name: string, closer: boolean, isVoid: boolean, start: number, end: number,
 *   attrs: Record<string, any> | null, attrsAt: [number, number] | null, attrsOk: boolean }} Delimiter
 *   One block comment: `<!-- wp:name {attrs} -->`, `<!-- /wp:name -->` or `<!-- wp:name /-->`.
 *   `attrsAt` is the raw `{…}`; `attrsOk` whether it is one JSON object.
 */

const OPENER = /<!--\s+(\/)?wp:((?:[a-z][a-z0-9_-]*\/)?[a-z][a-z0-9_-]*)\s+/y

/**
 * The block delimiters of a body, as `WP_Block_Parser` reads them
 * (`wp-includes/class-wp-block-parser.php`, `next_token`): a namespace optional (`core/` implied),
 * the attributes one `{…}` that ends at the first `}` followed by spaces and `-->` or `/-->`.
 *
 * 🔒 LINEAR: each opener looks no further than the next `-->`. WordPress writes attributes with every
 * `--` as `--` (`serialize_block_attributes`), so a real delimiter never holds one; a
 * comment that does is not a delimiter, and the proof (`blockMarkupProblem`) says so.
 * @param {string} raw
 * @returns {Delimiter[]}
 */
export function parseBlocks(raw) {
  /** @type {Delimiter[]} */
  const out = []
  let i = raw.indexOf('<!--')
  while (i !== -1) {
    const close = raw.indexOf('-->', i + 4)
    if (close === -1) break
    OPENER.lastIndex = i
    const m = OPENER.exec(raw)
    if (m && OPENER.lastIndex <= close) {
      const j = OPENER.lastIndex
      const inner = raw.slice(j, close)
      /** @type {Delimiter | null} */
      let d = null
      const name = m[2].includes('/') ? m[2] : `core/${m[2]}`
      if (inner === '' || inner === '/') {
        d = {
          name,
          closer: m[1] === '/',
          isVoid: inner === '/',
          start: i,
          end: close + 3,
          attrs: null,
          attrsAt: null,
          attrsOk: true
        }
      } else if (m[1] !== '/' && inner.startsWith('{')) {
        const tail = /\}\s+(\/?)$/.exec(inner)
        if (tail) {
          const attrsAt = /** @type {[number, number]} */ ([j, j + tail.index + 1])
          /** @type {Record<string, any> | null} */
          let attrs = null
          try {
            const v = JSON.parse(raw.slice(attrsAt[0], attrsAt[1]))
            attrs = isRecord(v) ? v : null
          } catch {
            attrs = null
          }
          d = {
            name,
            closer: false,
            isVoid: tail[1] === '/',
            start: i,
            end: close + 3,
            attrs,
            attrsAt,
            attrsOk: attrs !== null
          }
        }
      }
      if (d) out.push(d)
    }
    i = raw.indexOf('<!--', close + 3)
  }
  return out
}

// ── Stored units ─────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {'html' | 'attr' | 'json' | 'cf7-label' | 'cf7-option' | 'plain'} UnitKind
 *   How a unit's words sit in its record, and so how new words are written into it: HTML text,
 *   an HTML attribute (`alt`, `placeholder`), a block attribute (JSON of HTML-escaped text), a
 *   contact form's label text or quoted option, or a plain value.
 * @typedef {{ cased: string, lower: string, map: [number, number][], bare: string,
 *   bmap: [number, number][], unitKind: UnitKind, tag: string, block: string | null,
 *   slot: string | null, jsonKey?: string, attrName?: string, breaks?: number }} Draft
 */

/** @param {RenderedUnit} u */
const blockTagOf = (u) => u.chain.find((el) => !el.inline)?.tag ?? 'div'

/**
 * HTML text units of `raw[lo, hi)` — the rendered-page parser run on the slice, its offsets moved
 * back into `raw` — and the `alt`/`placeholder` attribute values of its tags.
 * @param {string} raw
 * @param {number} lo
 * @param {number} hi
 * @param {Delimiter | null} block
 * @param {UnitKind} [kind]
 * @returns {Draft[]}
 */
function htmlUnits(raw, lo, hi, block, kind = 'html') {
  const slice = raw.slice(lo, hi)
  if (!/[\p{L}\p{N}]/u.test(slice)) return []
  const shift = lo - 5 // '<div>'
  const { units } = renderedUnits(`<div>${slice}</div>`)
  const base = { block: block?.name ?? null, slot: slotOf(block) }
  /** @type {Draft[]} */
  const out = []
  for (const u of units) {
    if (u.attr) continue
    out.push({
      cased: u.cased,
      lower: u.lower,
      bare: u.bare,
      map: u.map.map(([a, b]) => [a + shift, b + shift]),
      bmap: u.bmap.map(([a, b]) => [a + shift, b + shift]),
      unitKind: kind,
      tag: blockTagOf(u),
      breaks: u.breaks,
      ...base
    })
  }
  if (kind === 'html') out.push(...attrUnits(raw, lo, hi, base))
  return out
}

/**
 * `alt` and `placeholder` values of the tags in `raw[lo, hi)`, each mapped to its raw bytes.
 * @param {string} raw
 * @param {number} lo
 * @param {number} hi
 * @param {{ block: string | null, slot: string | null }} base
 * @returns {Draft[]}
 */
function attrUnits(raw, lo, hi, base) {
  /** @type {Draft[]} */
  const out = []
  let i = raw.indexOf('<', lo)
  while (i !== -1 && i < hi) {
    const t = markupAt(raw, i)
    if (t.kind !== 'tag') {
      i = raw.indexOf('<', t.kind === 'skip' ? t.end : i + 1)
      continue
    }
    if (!t.close && (t.attrs.alt || t.attrs.placeholder)) {
      const tagText = raw.slice(i, Math.min(t.end, hi))
      for (const m of tagText.matchAll(/\s(alt|placeholder)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
        const value = m[3] ?? m[4] ?? ''
        if (!/[\p{L}\p{N}]/u.test(value)) continue
        const vs = i + /** @type {number} */ (m.index) + m[0].length - value.length - 1
        const v = views(raw, { lo: vs, hi: vs + value.length })
        out.push({ ...v, unitKind: 'attr', tag: t.name, attrName: m[1].toLowerCase(), ...base })
      }
    }
    i = raw.indexOf('<', t.end)
  }
  return out
}

/** @param {Delimiter | null} d */
const slotOf = (d) =>
  d?.attrs && isRecord(d.attrs.metadata) && typeof d.attrs.metadata.name === 'string'
    ? d.attrs.metadata.name
    : null

/**
 * The top-level string members of the JSON object at `raw[s, e)`: `{key, q}` with `q` the index of
 * the value's opening quote. Nested objects and arrays are skipped whole. Exported for the open
 * Joomla engine, whose `params` columns are the same JSON (`replace-joomla-open.mjs`).
 * @param {string} raw
 * @param {number} s
 * @param {number} e
 */
export function topLevelStrings(raw, s, e) {
  /** @type {{ key: string, q: number }[]} */
  const out = []
  /** @param {number} k - at a `"`; returns the index after the closing quote */
  const skipString = (k) => {
    let j = k + 1
    while (j < e && raw[j] !== '"') j += raw[j] === '\\' ? 2 : 1
    return j + 1
  }
  let depth = 0
  /** @type {string | null} */
  let key = null
  let expectKey = false
  for (let k = s; k < e; ) {
    const c = raw[k]
    if (c === '"') {
      const end = skipString(k)
      if (depth === 1 && expectKey) {
        key = JSON.parse(raw.slice(k, end))
        expectKey = false
      } else if (depth === 1 && key !== null) {
        out.push({ key, q: k })
        key = null
      }
      k = end
      continue
    }
    if (c === '{' || c === '[') {
      depth += 1
      if (depth === 1) expectKey = true
      else if (depth === 2) key = null
    } else if (c === '}' || c === ']') depth -= 1
    else if (c === ',' && depth === 1) {
      expectKey = true
      key = null
    }
    k += 1
  }
  return out
}

/**
 * A JSON string at `raw[q]` (its opening quote) as atoms, each with its raw span — `&` is one
 * character over six bytes. Exported with {@link topLevelStrings}.
 * @param {string} raw
 * @param {number} q
 */
export function jsonAtoms(raw, q) {
  /** @type {{ c: string, s: number, e: number }[]} */
  const atoms = []
  let i = q + 1
  while (i < raw.length && raw[i] !== '"') {
    if (raw[i] === '\\') {
      const x = raw[i + 1]
      if (x === 'u') {
        let cp = parseInt(raw.slice(i + 2, i + 6), 16)
        let j = i + 6
        if (cp >= 0xd800 && cp < 0xdc00 && raw.startsWith('\\u', j)) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (parseInt(raw.slice(j + 2, j + 6), 16) - 0xdc00)
          j += 6
        }
        atoms.push({ c: String.fromCodePoint(cp), s: i, e: j })
        i = j
      } else {
        const map = /** @type {Record<string, string>} */ ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })
        atoms.push({ c: map[x] ?? x, s: i, e: i + 2 })
        i += 2
      }
    } else {
      const cp = /** @type {number} */ (raw.codePointAt(i))
      const len = cp > 0xffff ? 2 : 1
      atoms.push({ c: raw.slice(i, i + len), s: i, e: i + len })
      i += len
    }
  }
  return atoms
}

/**
 * A block attribute's text is HTML-escaped rich text (a menu label `News &amp; updates` reads
 * "News & updates"): its entities are decoded across the JSON atoms, each keeping its raw span.
 * Measured: without this `Investors & press` failed its own proof in the F3 prototype.
 * @param {{ c: string, s: number, e: number }[]} atoms
 */
function decodeAtoms(atoms) {
  /** @type {{ c: string, s: number, e: number }[]} */
  const out = []
  for (let k = 0; k < atoms.length; k += 1) {
    if (atoms[k].c === '&') {
      let j = k + 1
      let body = ''
      while (j < atoms.length && j - k < 12 && /[#a-zA-Z0-9]/.test(atoms[j].c)) body += atoms[j++].c
      if (j < atoms.length && atoms[j].c === ';' && body) {
        const text = decodeEntities(`&${body};`)
        if (text !== `&${body};`) {
          out.push({ c: text, s: atoms[k].s, e: atoms[j].e })
          k = j
          continue
        }
      }
    }
    out.push(atoms[k])
  }
  return out
}

/**
 * The text-bearing attributes of one block delimiter as units.
 * @param {string} raw
 * @param {Delimiter} d
 * @returns {Draft[]}
 */
function jsonUnits(raw, d) {
  if (!d.attrsAt || !d.attrsOk) return []
  /** @type {Draft[]} */
  const out = []
  for (const { key, q } of topLevelStrings(raw, d.attrsAt[0], d.attrsAt[1])) {
    if (!TEXT_ATTRS.includes(key)) continue
    const v = views(raw, { atoms: decodeAtoms(jsonAtoms(raw, q)) })
    if (!/[\p{L}\p{N}]/u.test(v.cased)) continue
    out.push({
      ...v,
      unitKind: 'json',
      jsonKey: key,
      tag: jsonTag(d.name, key),
      block: d.name,
      slot: slotOf(d)
    })
  }
  return out
}

/**
 * The element a block attribute fills on the page (cannot-empty when no page was read).
 * @param {string} block
 * @param {string} key
 */
function jsonTag(block, key) {
  if (key === 'placeholder') return 'input'
  if (key === 'buttonText') return 'button'
  if (block === 'core/navigation-link' || block === 'core/navigation-submenu') return 'li'
  return block.endsWith('mega-menu') ? 'button' : 'a'
}

/**
 * The units of a block body: the HTML between delimiters, each tagged with its innermost open block
 * and that block's `metadata.name` (ja-business's slot address, `hero.heading`), and the text-bearing
 * attributes of each block.
 * @param {string} raw
 * @param {Delimiter[]} delims
 * @returns {Draft[]}
 */
function blockUnits(raw, delims) {
  /** @type {Draft[]} */
  const out = []
  /** @type {Delimiter[]} */
  const stack = []
  let prev = 0
  for (const d of delims) {
    if (d.start > prev) out.push(...htmlUnits(raw, prev, d.start, stack[stack.length - 1] ?? null))
    if (!d.closer) {
      out.push(...jsonUnits(raw, d))
      if (!d.isVoid) stack.push(d)
    } else {
      for (let k = stack.length - 1; k >= 0; k -= 1)
        if (stack[k].name === d.name) {
          stack.length = k
          break
        }
    }
    prev = d.end
  }
  if (prev < raw.length) out.push(...htmlUnits(raw, prev, raw.length, stack[stack.length - 1] ?? null))
  return out
}

const CF7_TAG = /\[[^\]]*\]/g

/**
 * A Contact Form 7 template (`_form`): its label text (HTML outside the `[…]` field tags) and each
 * quoted option inside a tag (a placeholder, a radio choice, the submit label). The field tags are
 * blanked to spaces of the same length, so every offset still points into the stored value.
 * @param {string} raw
 * @returns {Draft[]}
 */
function cf7Units(raw) {
  const blanked = raw.replace(CF7_TAG, (t) => ' '.repeat(t.length))
  const out = htmlUnits(blanked, 0, blanked.length, null, 'cf7-label')
  for (const m of raw.matchAll(CF7_TAG)) {
    for (const q of m[0].matchAll(/"([^"]*)"/g)) {
      const lo = /** @type {number} */ (m.index) + /** @type {number} */ (q.index) + 1
      const v = views(raw, { lo, hi: lo + q[1].length })
      if (/[\p{L}\p{N}]/u.test(v.cased))
        out.push({
          ...v,
          unitKind: 'cf7-option',
          tag: 'input',
          block: null,
          slot: m[0].slice(1).split(/[\s\]]/)[0] || null
        })
    }
  }
  return out
}

/**
 * The units of one stored value in its shape.
 * @param {'blocks' | 'cf7' | 'plain'} shape
 * @param {string} raw
 * @returns {Draft[]}
 */
export function storeUnits(shape, raw) {
  if (shape === 'blocks') return blockUnits(raw, parseBlocks(raw))
  if (shape === 'cf7') return cf7Units(raw)
  const v = views(raw)
  return /[\p{L}\p{N}]/u.test(v.cased) ? [{ ...v, unitKind: 'plain', tag: 'p', block: null, slot: null }] : []
}

// ── Stores: the records that render into the page ───────────────────────────────────────────────

/**
 * @typedef {{ id: string, kind: 'post' | 'templatePart' | 'template' | 'pattern' | 'option' | 'postmeta' | 'term',
 *   field: 'post_content' | 'post_title' | 'post_excerpt' | 'content' | 'value' | 'name',
 *   shape: 'blocks' | 'cf7' | 'plain', raw: string, region: string | string[], label: string,
 *   group: string, toolset: 'site' | 'content', address: Record<string, unknown>,
 *   read: Record<string, unknown>, lang: string | null, title?: string, partId?: number,
 *   area?: string, body: boolean, tag?: string, writable: boolean, why?: string, stored?: boolean,
 *   host?: string, refSpan?: [number, number] }} Store
 *   One value a door writes. `group`: the record it belongs to (one `content.update` per group, its
 *   fields merged). `address`: that write's `kind`/`id`/`key`. `read`: the `content.get` that reads it
 *   again. `body`: a whole-body field (the D6′ guard measures it). `stored:false`: a part or template
 *   served from the theme's file — its write creates the override. A `pattern` is never written
 *   itself: `host` is the store whose body inserts it and `refSpan` its `<!-- wp:pattern -->` there;
 *   the write expands it into the host ({@link expandPatterns}).
 */

/**
 * @param {Record<string, any>} item - a `content.get {kind:"post"}` item or a `content.list` row.
 * @param {{ id: number, family: 'page' | 'post' | 'nav' | 'site' | 'block', lang: string | null }} how
 *   `block`: a synced pattern (`wp_block`) — only its body renders, wherever a `core/block` names it.
 * @returns {Store[]}
 */
function postStores(item, { id, family, lang }) {
  const title = String(item.post_title ?? item.title ?? '')
  const body = item.post_content ?? item.content
  const excerpt = item.post_excerpt ?? item.excerpt
  const name = title ? `"${title.slice(0, 40)}"` : `post ${id}`
  const group = `post:${id}`
  const base = {
    kind: /** @type {const} */ ('post'),
    group,
    toolset: /** @type {const} */ ('content'),
    address: { kind: 'post', id },
    read: { kind: 'post', id },
    lang,
    writable: true
  }
  /** @type {Store[]} */
  const out = []
  if (family === 'nav') {
    if (typeof body === 'string')
      out.push({
        ...base,
        id: `nav:${id}`,
        field: 'post_content',
        shape: 'blocks',
        raw: body,
        region: 'main',
        label: `menu ${name}`,
        body: true
      })
    return out
  }
  if (family === 'block') {
    if (typeof body === 'string' && body !== '')
      out.push({
        ...base,
        id: `block:${id}`,
        field: 'post_content',
        shape: 'blocks',
        raw: body,
        region: 'main',
        label: `the synced pattern ${name}`,
        body: true
      })
    return out
  }
  if (typeof body === 'string' && body !== '')
    out.push({
      ...base,
      id: `post:${id}`,
      field: 'post_content',
      shape: 'blocks',
      raw: body,
      region: 'main',
      label: `${name}, its content`,
      body: true
    })
  if (title !== '')
    out.push({
      ...base,
      id: `post:${id}.title`,
      field: 'post_title',
      shape: 'plain',
      raw: title,
      region: ['title', 'main'],
      label: `${name}, its title`,
      body: false,
      tag: 'h1'
    })
  if (typeof excerpt === 'string' && excerpt !== '')
    out.push({
      ...base,
      id: `post:${id}.excerpt`,
      field: 'post_excerpt',
      shape: 'plain',
      raw: excerpt,
      region: 'main',
      label: `${name}, its excerpt`,
      body: false
    })
  return out
}

/**
 * The stored units of every store, each with its `at`: `<store>#<slot or block>[.<n>][:<attribute>]`
 * for a body — `post:42#hero.heading`, `part:header#paragraph.3`, `nav:68#navigation-link.4:label` —
 * and the store id itself for a one-value store (`option:blogdescription`). Stable while the record
 * is unchanged: an AMBIGUOUS answer's `at` names the same value on the next call. With `identity`,
 * a unit that prints identity tokens reads each as its value, as the page shows it ({@link expandTokens}).
 * @param {readonly Store[]} stores
 * @param {Identity | null} [identity]
 * @returns {(StoredUnit & { store: string, unitKind: UnitKind, jsonKey?: string, attrName?: string,
 *   block: string | null, breaks?: number })[]}
 */
function unitsOfStores(stores, identity = null) {
  /** @type {any[]} */
  const out = []
  for (const s of stores) {
    const drafts = storeUnits(s.shape, s.raw)
    /** @type {Map<string, number>} */
    const seen = new Map()
    for (const d of drafts) {
      let at = s.id
      if (s.shape !== 'plain') {
        const base =
          d.slot ?? (d.block ? d.block.replace(/^core\//, '') : s.shape === 'cf7' ? 'form' : 'text')
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        at = `${s.id}#${base}${n > 1 ? `.${n}` : ''}`
        if (d.unitKind === 'json') at += `:${d.jsonKey}`
        else if (d.unitKind === 'attr') at += `@${d.attrName}`
        else if (d.unitKind === 'cf7-option') at += ':option'
      }
      const unit = {
        ...d,
        at,
        raw: s.raw,
        store: s.id,
        label: s.label,
        region: s.region,
        lang: s.lang,
        tag: s.tag ?? d.tag,
        writable: s.writable,
        ...(s.why ? { why: s.why } : {})
      }
      out.push(identity !== null && hasIdentityToken(unit.cased) ? expandTokens(unit, identity.values) : unit)
    }
  }
  return out
}

// ── Identity tokens (tracy-business 1.2.0+) ───────────────────────────────────────────────────────

/**
 * @typedef {{ values: Map<string, string>, option: Record<string, unknown> }} Identity
 *   What each identity token prints (`values`, empty fields absent) and the option as the site holds it.
 * @typedef {{ name: string, xs: number, xe: number, rs: number, re: number, value: string }} TokenSpan
 *   One identity token in a stored unit: `[xs, xe)` its value in the unit's `cased` view, `[rs, re)`
 *   the token's bytes in the record.
 */

/** The option a Tracy WordPress theme fills its identity tokens from (`inc/identity.php`). */
const IDENTITY_OPTION = 'tracy_site_identity'
/** One identity token of the closed list (`IdentityTokens::NAMES`, `contract-check.mjs`). */
const IDENTITY_TOKEN_SOURCE = `\\{(${IDENTITY_TOKENS.map((n) => n.replace('.', '\\.')).join('|')})\\}`
/** @param {string} text */
const hasIdentityToken = (text) => new RegExp(IDENTITY_TOKEN_SOURCE).test(text)
/** The tokens that name the site; every other one is a contact fact or a social link. */
const NAME_TOKENS = new Set(['site.name', 'site.legalName', 'site.slogan', 'site.monogram'])
/** Each token's field as a reader names it, for the answers. */
const TOKEN_LABEL = Object.freeze({
  'site.name': 'name',
  'site.legalName': 'legal name',
  'site.slogan': 'slogan',
  'site.monogram': 'monogram',
  'contact.email': 'e-mail',
  'contact.phone': 'phone',
  'contact.tel': 'phone',
  'contact.address': 'address',
  'contact.hours': 'opening hours',
  'social.facebook': 'Facebook link',
  'social.instagram': 'Instagram link',
  'social.linkedin': 'LinkedIn link',
  'social.tiktok': 'TikTok link',
  'social.youtube': 'YouTube link'
})
/** @param {string} name */
const labelOf = (name) => TOKEN_LABEL[/** @type {keyof typeof TOKEN_LABEL} */ (name)] ?? name
/**
 * The option field a token is set through, and so its contract slot `identity.<field>`: the `site`
 * group's own key (`legalName`), the dotted name for the others (`contact.phone`) — the content map's
 * `option-tracy_site_identity` slots. The dial form `contact.tel` follows the phone.
 * @param {string} name
 */
const fieldOfToken = (name) =>
  name === 'contact.tel' ? 'contact.phone' : name.startsWith('site.') ? name.slice(5) : name

/**
 * What each identity token prints, as the theme reads the option (`wp_tracy_business_identity_vars_of`):
 * nested groups or dotted keys, the `site` group by its own keys (`legalName` → `site.legalName`), each
 * value trimmed, an empty one absent — the theme prints nothing there and drops the element that
 * carries it — and `contact.tel` derived from the phone when the option holds none.
 * @param {unknown} option
 * @returns {Map<string, string> | null}
 */
export function identityValues(option) {
  let o = option
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o)
    } catch {
      return null
    }
  }
  if (!isRecord(o)) return null
  /** @param {unknown} v */
  const text = (v) =>
    typeof v === 'string' || typeof v === 'number' ? String(v).trim() : v === true ? '1' : null
  /** @type {Map<string, string>} */
  const flat = new Map()
  for (const [key, value] of Object.entries(o)) {
    if (isRecord(value)) {
      for (const [sub, leaf] of Object.entries(value)) {
        const t = text(leaf)
        if (t !== null) flat.set(`${key}.${sub}`, t)
      }
    } else {
      const t = text(value)
      if (t !== null) flat.set(key, t)
    }
  }
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const name of IDENTITY_TOKENS) {
    const own = name.startsWith('site.') ? flat.get(name.slice(5)) : undefined
    const value = flat.get(name) ?? own ?? ''
    if (value !== '') out.set(name, value)
  }
  const phone = out.get('contact.phone')
  const dial = (out.get('contact.tel') ?? phone ?? '').replace(/[^0-9+]/g, '')
  const tel = dial === '' ? '' : `${dial[0] === '+' ? '+' : ''}${dial.replace(/\+/g, '')}`
  if (tel === '') out.delete('contact.tel')
  else out.set('contact.tel', tel)
  return out
}

/**
 * The site identity, read once: null when the site keeps none, or it is not an object.
 * @param {Door} read
 * @returns {Promise<Identity | null>}
 */
async function readIdentity(read) {
  const got = await read('content.get', { kind: 'option', key: IDENTITY_OPTION })
  if (!isRecord(got) || got.ok !== true || !isRecord(got.item)) return null
  const values = identityValues(got.item.value)
  if (values === null) return null
  const option = typeof got.item.value === 'string' ? JSON.parse(got.item.value) : got.item.value
  return { values, option }
}

/**
 * A stored unit with each identity token read as the value the theme prints for it, so the page's
 * words match it; every character of a value maps to the whole token's bytes, so a splice over any
 * part of a value lands on the token, never inside it ({@link tokenSpan} decides what may). A token
 * whose field is empty is left as it is stored (the theme prints nothing there), and a unit whose
 * value would not fold in place is left as stored too — never a guess.
 * @template {StoredUnit} U
 * @param {U} u
 * @param {Map<string, string>} values
 * @returns {U & { tokens?: TokenSpan[] }}
 */
function expandTokens(u, values) {
  /** @type {TokenSpan[]} */
  const tokens = []
  /** @type {string[]} */
  const parts = []
  /** @type {[number, number][]} */
  const map = []
  let at = 0
  let length = 0
  for (const m of u.cased.matchAll(new RegExp(IDENTITY_TOKEN_SOURCE, 'g'))) {
    const raw = values.get(m[1])
    if (raw === undefined) continue
    const ci = /** @type {number} */ (m.index)
    const cj = ci + m[0].length
    const rs = u.map[ci]?.[0]
    const re = u.map[cj - 1]?.[1]
    if (rs === undefined || re === undefined || u.raw.slice(rs, re) !== m[0]) continue
    const value = views(raw, { decode: false }).cased
    if (value === '') continue
    parts.push(u.cased.slice(at, ci))
    map.push(...u.map.slice(at, ci))
    length += ci - at
    parts.push(value)
    for (let k = 0; k < value.length; k += 1) map.push([rs, re])
    tokens.push({ name: m[1], xs: length, xe: length + value.length, rs, re, value })
    length += value.length
    at = cj
  }
  if (tokens.length === 0) return u
  parts.push(u.cased.slice(at))
  map.push(...u.map.slice(at))
  const cased = parts.join('')
  const v = views(cased, { decode: false })
  if (v.cased !== cased || map.length !== cased.length) return u
  return {
    ...u,
    cased,
    lower: v.lower,
    map,
    bare: v.bare,
    bmap: v.bmap.map(([a, b]) => /** @type {[number, number]} */ ([map[a][0], map[b - 1][1]])),
    tokens
  }
}

/**
 * The units one change is located among, and what its words are inside identity tokens: a unit whose
 * every hit lies inside a token's value stays out — the words are the identity's, which no record
 * here holds as words (the Joomla engine's `storedFor`) — and the first such hit names the token.
 * @template {StoredUnit & { tokens?: TokenSpan[] }} U
 * @param {readonly U[]} units
 * @param {string} find
 * @returns {{ only: Map<U, TokenSpan>, first: { unit: U, a: number, b: number, token: TokenSpan } | null }}
 */
function tokenHits(units, find) {
  /** @type {Map<U, TokenSpan | null>} */
  const seen = new Map()
  /** @type {{ unit: U, a: number, b: number, token: TokenSpan } | null} */
  let first = null
  for (const h of matchUnits(units, find).hits) {
    const tokens = h.unit.tokens
    if (!tokens || tokens.length === 0) continue
    const token = h.mode === 'bare' ? undefined : tokens.find((t) => t.xs <= h.a && h.b <= t.xe)
    if (token && first === null) first = { unit: h.unit, a: h.a, b: h.b, token }
    const was = seen.get(h.unit)
    seen.set(h.unit, was === undefined ? (token ?? null) : was === null ? null : (token ?? null))
  }
  /** @type {Map<U, TokenSpan>} */
  const only = new Map()
  for (const [u, t] of seen) if (t) only.set(u, t)
  return { only, first }
}

/**
 * The span a change writes inside a unit that prints identity tokens. A change that touches no token's
 * value is written as asked; one that touches a value reaches the whole token, and then the token
 * stays wherever the new words still show its value ("© Golden Crust" → "Copyright Golden Crust");
 * a site name, slogan or monogram they no longer show is written as the words asked for, and the
 * receipt says that line no longer follows the identity (`tokenLine`, the Joomla engine's
 * `NAME_IN_QUOTE = 'line'`); a contact fact or a social link is never typed into a line — the answer
 * is the identity's own door ({@link identityAnswer}).
 * @param {{ cased: string, tokens: TokenSpan[] }} u
 * @param {number} ra - start of the narrowed change in `u.cased`
 * @param {number} rb - its end (`ra === rb`: an insertion)
 * @param {string} mid - the new words for `[ra, rb)`
 * @returns {{ ok: true, ra: number, rb: number, mid: string, dropped: string[] }
 *   | { ok: false, token: string, value: string | null }}
 */
export function tokenSpan(u, ra, rb, mid) {
  const touched = u.tokens.filter((t) => (ra === rb ? t.xs < ra && ra < t.xe : t.xs < rb && ra < t.xe))
  if (touched.length === 0) return { ok: true, ra, rb, mid, dropped: [] }
  const xa = Math.min(ra, ...touched.map((t) => t.xs))
  const xb = Math.max(rb, ...touched.map((t) => t.xe))
  const whole = u.cased.slice(xa, ra) + mid + u.cased.slice(rb, xb)
  let text = whole
  /** @type {TokenSpan[]} */
  const dropped = []
  for (const t of touched) {
    const k = text.indexOf(t.value)
    if (k >= 0) text = `${text.slice(0, k)}{${t.name}}${text.slice(k + t.value.length)}`
    else dropped.push(t)
  }
  const fact = dropped.find((t) => !NAME_TOKENS.has(t.name))
  if (fact)
    return {
      ok: false,
      token: fact.name,
      value: touched.length === 1 && xa === fact.xs && xb === fact.xe ? whole.trim() : null
    }
  return { ok: true, ra: xa, rb: xb, mid: text, dropped: dropped.map((t) => t.name) }
}

/**
 * The answer for words a site identity token prints: nothing written, and the one call that sets the
 * value for every page — the content contract's identity slot where the site has that door (the
 * quickstart's own road, theme `AGENTS.md`), else the option itself, whole, with the identity as it
 * stands so the model changes one field and sends the rest back unchanged. `value`: the new value
 * when the change says it (typed into the call only whole, {@link IDENTITY_VALUE_IN_CALL}); null when
 * the change also rewrites the words beside the token (`across`).
 * @param {{ find: string, token: string, current: string, value: string | null,
 *   contractDoor: boolean, identity: Identity, change?: number | null, where?: string | null }} input
 */
function identityAnswer({
  find,
  token,
  current,
  value,
  contractDoor,
  identity,
  change = null,
  where = null
}) {
  const field = labelOf(token)
  const key = fieldOfToken(token)
  const slot = `identity.${key}`
  const across = value === null
  const typed =
    value !== null && value !== '' && value.length <= IDENTITY_VALUE_IN_CALL && !/["\\\n]/.test(value)
      ? value
      : `<the new ${field}>`
  const next = across
    ? wpText(contractDoor ? 'identityContractAcrossNext' : 'identityOptionAcrossNext', { slot, field, key })
    : wpText(contractDoor ? 'identityContractNext' : 'identityOptionNext', { slot, key, value: typed })
  return refuse(
    'SITE_IDENTITY',
    wpText(across ? 'identityAcrossError' : 'identityError', { find, field }),
    next,
    {
      find,
      token,
      field: key,
      value: current,
      ...(value !== null && value !== '' ? { new: value } : {}),
      ...(where ? { where } : {}),
      ...(contractDoor ? { slot } : { identity: identity.option }),
      ...(change !== null ? { change } : {})
    }
  )
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ units: RenderedUnit[], lang: string | null, pageId: number | null, blog: boolean,
 *   theme: string | null, themeVersion: string | null, posts: number[], forms: number[],
 *   cats: number[], alternates: number, alternatePaths: { code: string, path: string }[],
 *   defaultLang: string | null, status: number,
 *   buttons: import('./replace.mjs').TextView[],
 *   archive: { taxonomy: 'category' | 'post_tag', id: number } | null }} PageFacts
 *   `buttons`: the labels of `<input type="submit|button|reset" value="…">` — a contact form's
 *   submit button prints its label there, which the page's text units do not carry. `archive`: the
 *   term a category or tag archive lists (`<body class="archive category … category-45">`).
 */

/**
 * The labels of the page's input buttons, each as a matcher view.
 * @param {string} html
 */
function buttonLabels(html) {
  /** @type {import('./replace.mjs').TextView[]} */
  const out = []
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    if (!/\btype\s*=\s*["']?(?:submit|button|reset)\b/i.test(m[0])) continue
    const v = /\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[0])
    const label = decodeEntities(v?.[1] ?? v?.[2] ?? '')
    if (/[\p{L}\p{N}]/u.test(label)) out.push(views(label, { decode: false }))
  }
  return out
}

/**
 * What the rendered page says about its own records (F3 §5.1): `page-id-N`/`postid-N` on `<body>`
 * (the page's record), `blog` (the posts page), `wp-theme-<slug>` and the theme's `?ver=` on its own
 * assets (the theme table's key), `post-N` query items, `cat-item-N` links, `wpcf7-f<ID>-` forms, and
 * the `hreflang` alternates a translation plugin prints (the language rule).
 * @param {string} html
 * @param {number} status
 * @returns {PageFacts}
 */
export function pageFactsOf(html, status = 200) {
  const r = renderedUnits(html)
  const body = r.body.split(/\s+/).filter(Boolean)
  const idTok = body.map((t) => /^(?:page-id|postid)-(\d+)$/.exec(t)).find(Boolean)
  const theme = body.find((t) => t.startsWith('wp-theme-'))?.slice(9) ?? null
  /** @type {Set<number>} */
  const posts = new Set()
  /** @type {Set<number>} */
  const cats = new Set()
  for (const m of html.matchAll(/\bclass=(["'])([^"']*)\1/g)) {
    for (const t of m[2].split(/\s+/)) {
      const p = /^post-(\d+)$/.exec(t)
      if (p && posts.size < PAGE_RECORDS_MAX) posts.add(Number(p[1]))
      const c = /^cat-item-(\d+)$/.exec(t)
      if (c && cats.size < PAGE_RECORDS_MAX) cats.add(Number(c[1]))
    }
  }
  /** @type {Set<number>} */
  const forms = new Set()
  for (const m of html.matchAll(/\bid=["']wpcf7-f(\d+)-/g))
    if (forms.size < PAGE_RECORDS_MAX) forms.add(Number(m[1]))
  let themeVersion = null
  if (theme)
    for (const m of html.matchAll(
      /\/wp-content\/themes\/([a-z0-9._-]+)\/[^"'?\s]*\?ver=([0-9][0-9a-z.+-]*)/gi
    ))
      if (m[1] === theme) {
        themeVersion = m[2]
        break
      }
  const head = html.slice(0, Math.max(0, html.search(/<body\b/i)))
  /** @type {{ code: string, href: string }[]} */
  const alts = []
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']?alternate\b/i.test(m[0])) continue
    const code = /\bhreflang=["']?([a-z]{2,3}(?:-[a-z0-9]+)?)\b/i.exec(m[0])?.[1]?.toLowerCase()
    const href = /\bhref=["']([^"']*)["']/i.exec(m[0])?.[1]
    if (code && href) alts.push({ code, href })
  }
  // Polylang hides the default language's prefix: the one alternate whose path does not start with
  // its own code is the default (measured: en → "/", ru → "/ru/…", de → "/de/news-de/").
  const unprefixed = alts.filter((a) => {
    try {
      const first = (new URL(a.href, 'http://site.invalid/').pathname.split('/')[1] ?? '').toLowerCase()
      return first !== a.code && first !== a.code.split('-')[0]
    } catch {
      return false
    }
  })
  return {
    units: r.units,
    lang: r.lang,
    pageId: idTok ? Number(idTok[1]) : null,
    blog: body.includes('blog'),
    theme,
    themeVersion,
    posts: [...posts],
    forms: [...forms],
    cats: [...cats],
    alternates: alts.length,
    alternatePaths: alts.flatMap((a) => {
      try {
        return [{ code: a.code, path: new URL(a.href, 'http://site.invalid/').pathname }]
      } catch {
        return []
      }
    }),
    defaultLang: unprefixed.length === 1 ? unprefixed[0].code.split('-')[0] : null,
    status,
    buttons: buttonLabels(html),
    archive: archiveOf(body)
  }
}

/**
 * The term a category or tag archive lists, from `<body>`: WordPress's `body_class` prints
 * `archive category category-<slug> category-<id>` (tags: `tag tag-<slug> tag-<id>`). A term is read
 * only by its id (`content.get {kind:"term", key:<taxonomy>, id}`), and the archive is the one page
 * that prints it; a slug that is itself a number is taken for the id only when no other token is.
 * @param {string[]} body
 * @returns {{ taxonomy: 'category' | 'post_tag', id: number } | null}
 */
function archiveOf(body) {
  if (!body.includes('archive')) return null
  for (const [token, taxonomy] of /** @type {const} */ ([
    ['category', 'category'],
    ['tag', 'post_tag']
  ])) {
    if (!body.includes(token)) continue
    const ids = body.map((t) => new RegExp(`^${token}-(\\d+)$`).exec(t)?.[1]).filter(Boolean)
    if (ids.length > 0) return { taxonomy, id: Number(ids[ids.length - 1]) }
  }
  return null
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The door, never a throw: a transport failure reads as the relay's own refusal.
 * @param {Door} door
 * @returns {Door}
 */
const safe = (door) => async (action, params) => {
  try {
    return await door(action, params)
  } catch (error) {
    return {
      ok: false,
      code: 'COWORK_WEB_UNREACHABLE',
      error: (error instanceof Error ? error.message : String(error)).slice(0, 160)
    }
  }
}

/**
 * The door for writes, never a throw. 🔒 A THROWN WRITE MAY HAVE LANDED: the request left Tracy and
 * its answer did not come back, so it reads as `OUTCOME_UNKNOWN` carrying the call's own apply id —
 * never as the read road's "unreachable, ask once more", which would send the same write twice.
 * @param {Door} door
 * @returns {Door}
 */
const safeWrite = (door) => async (action, params) => {
  try {
    return await door(action, params)
  } catch (error) {
    return outcomeUnknownAnswer(action, params, {
      error: (error instanceof Error ? error.message : String(error)).slice(0, 40)
    })
  }
}

/**
 * A record that is simply not there (the component's `not_found`): that store is left out. Anything
 * else that is not `ok` — a seat, a role, the lease, the network — stops the call.
 * @param {unknown} answer
 */
const isMissing = (answer) =>
  isRecord(answer) && answer.ok === false && (answer.code ?? answer.error) === 'not_found'

/**
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => Promise<any>} fn
 * @returns {Promise<any[]>}
 */
async function inPool(items, fn) {
  const out = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const k = next
      next += 1
      out[k] = await fn(items[k])
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_PARALLEL, items.length) }, worker))
  return out
}

/**
 * @typedef {{ kind: 'ref' | 'inner' | 'fallback', ref: number, classes: string[],
 *   span: [number, number] | null }} NavBlock
 *   One `core/navigation` block of a body and where its labels are stored: `ref` — the wp_navigation
 *   post it names; `inner` — its own inner blocks, `span` the block's raw bytes in the body that
 *   holds it; `fallback` — neither, so WordPress renders its fallback menu. `classes`: the
 *   `className` tokens its `<nav>` renders with.
 * @typedef {{ area: string, store: string, blocks: NavBlock[] }} NavUse
 *   The navigation blocks of one part or page body, and the area it renders in.
 * @typedef {{ stores: Store[], navRefs: NavUse[], fallback: number[], navUnresolved: boolean,
 *   blockRefs: Map<string, string[]>, partAreas: Set<string>, scanned: number, capped: boolean,
 *   postsPage: number | null, identity: Identity | null }} ReadSet
 *   `fallback`: the wp_navigation posts WordPress's fallback menu renders from (one, or several
 *   published at the same second), empty when there is none or it could not be resolved;
 *   `navUnresolved`: the page needed that fallback and it could not be resolved. `blockRefs`: per
 *   part or page body, the synced patterns (`block:<id>` stores) it renders. `identity`: what the
 *   site identity tokens of the records read print ({@link readIdentity}), null when none carries one.
 */

/**
 * The area an occurrence at this region renders in, as the navigation blocks name theirs.
 * @param {string} region
 */
const areaOfRegion = (region) => (region === 'footer' ? 'footer' : region === 'main' ? 'main' : 'header')

/**
 * A navigation block's area against the area an occurrence renders in (`main`: any part but these two).
 * @param {string} navArea
 * @param {string} area
 */
const areaIs = (navArea, area) =>
  area === 'main' ? navArea !== 'header' && navArea !== 'footer' : navArea === area

/** @param {UnitElement} el */
const isNavEl = (el) => el.cls.split(/\s+/).includes('wp-block-navigation')

/**
 * The areas in which the page renders a navigation (`<nav class="wp-block-navigation">`).
 * @param {PageFacts} page
 */
const navAreasOf = (page) => [
  ...new Set(page.units.filter((u) => u.chain.some(isNavEl)).map((u) => areaOfRegion(u.region)))
]

/**
 * The navigation blocks of a body, each as `render_block_core_navigation` reads it (block-library
 * `navigation/index.php`): a `ref` (or its legacy name `navigationMenuId`) renders that wp_navigation
 * post; otherwise the block's own inner blocks render; with neither, WordPress's fallback does.
 *
 * 🔒 MEASURED ON TRACY'S OWN THEMES: `tracy/parts/header.html` and the three `tracy-base` parts ship
 * `<!-- wp:navigation {"className":"tracy-nav",…} /-->` — no ref, no inner blocks — and the seeder
 * creates the wp_navigation "Main" without setting one (`tracy-seeder/src/apply-wordpress.mjs:180`).
 * Keeping only blocks with a ref made every menu label on those sites a false NOT_EDITABLE. The
 * seeder writes no template part either, so on those sites the header is still the THEME'S FILE:
 * there is no stored body to find the block in, and `readStores` resolves the fallback from the
 * rendered page instead (a navigation in an area no stored record covers).
 * @param {string} raw
 * @returns {NavBlock[]}
 */
function navBlocks(raw) {
  const delims = parseBlocks(raw)
  /** @type {NavBlock[]} */
  const out = []
  for (let k = 0; k < delims.length; k += 1) {
    const d = delims[k]
    if (d.name !== 'core/navigation' || d.closer) continue
    const classes = String(d.attrs?.className ?? '')
      .split(/\s+/)
      .filter(Boolean)
    const ref = positive(d.attrs?.ref) || positive(d.attrs?.navigationMenuId)
    if (ref > 0) {
      out.push({ kind: 'ref', ref, classes, span: null })
      continue
    }
    // The block's own closer, and whether any block opens before it (its inner blocks).
    let depth = 0
    let inner = false
    let end = -1
    if (!d.isVoid)
      for (let j = k + 1; j < delims.length; j += 1) {
        const x = delims[j]
        if (x.name === 'core/navigation' && x.closer) {
          if (depth === 0) {
            end = x.end
            break
          }
          depth -= 1
        } else if (!x.closer) {
          inner = true
          if (x.name === 'core/navigation' && !x.isVoid) depth += 1
        }
      }
    if (inner && end !== -1) out.push({ kind: 'inner', ref: 0, classes, span: [d.start, end] })
    else out.push({ kind: 'fallback', ref: 0, classes, span: null })
  }
  return out
}

/**
 * The wp_navigation posts a navigation with no menu of its own renders: WordPress's fallback is the
 * most recently published one (`WP_Navigation_Fallback::get_most_recently_published_navigation`:
 * `post_status` publish, `orderby` date DESC, one row). The component lists by id with each row's
 * `created` (`post_date_gmt`, `class-claude-cowork-writers.php` `describe_post`), so the newest is
 * picked here; rows published in the same second are all returned (WordPress's order among them is
 * MySQL's), and the words decide — two holding them are AMBIGUOUS, never a guess. Empty when the
 * index cannot be read whole, lists none, or a row carries no date to order by.
 * @param {Door} read
 * @returns {Promise<number[]>}
 */
async function fallbackNavs(read) {
  /** @type {{ id: number, created: string }[]} */
  const rows = []
  for (let n = 0; n < NAV_INDEX_PAGES; n += 1) {
    const got = await read('content.list', {
      kind: 'post',
      post_type: 'wp_navigation',
      limit: NAV_INDEX_ROWS,
      offset: n * NAV_INDEX_ROWS
    })
    if (!isRecord(got) || got.ok !== true || isRecord(got.truncated) || !Array.isArray(got.items)) return []
    for (const r of got.items) {
      const id = isRecord(r) && r.status === 'publish' ? positive(r.id) : 0
      if (id > 0) rows.push({ id, created: typeof r.created === 'string' ? r.created : '' })
    }
    if (got.items.length < NAV_INDEX_ROWS) {
      if (rows.length === 1) return [rows[0].id]
      if (rows.length === 0 || rows.some((r) => r.created === '')) return []
      const newest = rows.reduce((m, r) => (r.created > m ? r.created : m), '')
      return rows
        .filter((r) => r.created === newest)
        .map((r) => r.id)
        .slice(0, NAV_REFS_MAX)
    }
  }
  return []
}

/**
 * Every record that renders into the page, read in three waves through the door (F3 §5.2): the part
 * index, the options, the page's record, its query items, forms and categories; then each listed part
 * by its slug; then the menus the parts and the body reference. `site` adds the default language's
 * published posts and pages, read in list pages of 25 with their bodies. `posts`/`cats`: records the
 * words' own occurrences name, read past the page-wide cap.
 * @param {Door} read
 * @param {PageFacts | null} page
 * @param {{ site: boolean, lang: string | null, theme?: boolean, posts?: number[], cats?: number[] }} options
 *   `theme`: also read the theme's templates (the wider read, {@link locateOnWordPress}).
 * @returns {Promise<{ ok: true, set: ReadSet } | { ok: false, answer: unknown }>}
 */
async function readStores(
  read,
  page,
  { site, lang, theme = false, posts: extraPosts = [], cats: extraCats = [] }
) {
  /** @type {Store[]} */
  const stores = []
  /** @type {unknown} */
  let stop = null
  /** @param {unknown} a */
  const ok = (a) => {
    if (isRecord(a) && a.ok === true) return true
    if (!isMissing(a) && stop === null) stop = a
    return false
  }
  /** @param {unknown} a */
  const cut = (a) => isRecord(a) && isRecord(a.truncated)
  /** @type {string[]} */
  const cutWhat = []

  // Wave 1.
  /** @type {(() => Promise<void>)[]} */
  const wave1 = []
  /** @type {string[]} */
  let slugs = []
  wave1.push(async () => {
    // The component that lists the theme's parts names the ones still served from their file too;
    // a `wp_template_part` post list names only the overrides, so a theme-file footer was never read.
    const listed = await read('content.list', { kind: 'templatePart' })
    if (isRecord(listed) && listed.ok === true && Array.isArray(listed.items)) {
      slugs = listed.items
        .filter((r) => isRecord(r) && typeof r.key === 'string' && r.key !== '')
        .map((r) => /** @type {string} */ (r.key))
        .slice(0, PART_INDEX_LIMIT)
      return
    }
    const got = await read('content.list', {
      kind: 'post',
      post_type: 'wp_template_part',
      limit: PART_INDEX_LIMIT
    })
    if (isRecord(got) && got.ok === true && Array.isArray(got.items))
      slugs = [
        ...new Set(
          got.items
            .filter((r) => isRecord(r) && typeof r.slug === 'string' && r.slug !== '')
            .map((r) => /** @type {string} */ (r.slug))
        )
      ]
    // No index (an older component): the two parts every block theme has.
    else slugs = ['header', 'footer']
  })
  for (const key of ['blogname', 'blogdescription'])
    wave1.push(async () => {
      const got = await read('content.get', { kind: 'option', key })
      if (ok(got) && isRecord(got.item) && typeof got.item.value === 'string')
        stores.push({
          id: `option:${key}`,
          kind: 'option',
          field: 'value',
          shape: 'plain',
          raw: got.item.value,
          region: key === 'blogname' ? ['header', 'footer', 'title'] : ['header', 'title'],
          label: key === 'blogname' ? 'the site title' : 'the tagline',
          group: `option:${key}`,
          toolset: 'site',
          address: { kind: 'option', key },
          read: { kind: 'option', key },
          lang: null,
          body: false,
          writable: true
        })
    })
  /** @type {Set<number>} */
  const postIds = new Set([...(page?.pageId ? [page.pageId] : []), ...(page?.posts ?? []), ...extraPosts])
  /** @type {number | null} */
  let postsPage = null
  if (page?.blog)
    wave1.push(async () => {
      const got = await read('content.get', { kind: 'option', key: 'page_for_posts' })
      if (ok(got) && isRecord(got.item)) postsPage = positive(got.item.value) || null
    })
  for (const id of postIds)
    wave1.push(async () => {
      const got = await read('content.get', { kind: 'post', id })
      if (cut(got)) cutWhat.push(`post ${id}`)
      else if (ok(got) && isRecord(got.item))
        stores.push(
          ...postStores(got.item, { id, family: id === page?.pageId ? 'page' : 'post', lang: null })
        )
    })
  for (const id of page?.forms ?? [])
    wave1.push(async () => {
      const got = await read('content.get', { kind: 'postmeta', id, key: '_form' })
      if (ok(got) && isRecord(got.item) && typeof got.item.value === 'string')
        stores.push({
          id: `form:${id}`,
          kind: 'postmeta',
          field: 'value',
          shape: 'cf7',
          raw: got.item.value,
          region: 'main',
          label: `contact form ${id}`,
          group: `meta:${id}/_form`,
          toolset: 'content',
          address: { kind: 'postmeta', id, key: '_form' },
          read: { kind: 'postmeta', id, key: '_form' },
          lang: null,
          body: false,
          writable: true
        })
    })
  /** @type {Map<string, { taxonomy: string, id: number }>} */
  const terms = new Map()
  for (const id of [...(page?.cats ?? []), ...extraCats])
    terms.set(`category:${id}`, { taxonomy: 'category', id })
  if (page?.archive) terms.set(`${page.archive.taxonomy}:${page.archive.id}`, page.archive)
  for (const { taxonomy, id } of terms.values())
    wave1.push(async () => {
      const got = await read('content.get', { kind: 'term', key: taxonomy, id })
      if (ok(got) && isRecord(got.item) && typeof got.item.name === 'string')
        stores.push({
          id: `term:${taxonomy}:${id}`,
          kind: 'term',
          field: 'name',
          shape: 'plain',
          raw: got.item.name,
          region: 'main',
          label: `${taxonomy === 'category' ? 'category' : 'tag'} "${got.item.name.slice(0, 40)}"`,
          group: `term:${taxonomy}:${id}`,
          toolset: 'site',
          address: { kind: 'term', key: taxonomy, id },
          read: { kind: 'term', key: taxonomy, id },
          lang: null,
          body: false,
          writable: true,
          tag: 'a'
        })
    })
  let scanned = 0
  let capped = false
  if (site)
    wave1.push(async () => {
      for (let n = 0; n < SITE_PAGES_MAX; n += 1) {
        const got = await read('content.list', {
          kind: 'post',
          include_body: true,
          limit: SITE_PAGE_ROWS,
          offset: n * SITE_PAGE_ROWS
        })
        if (cut(got)) {
          cutWhat.push('the list of pages')
          return
        }
        if (!ok(got) || !Array.isArray(got.items)) return
        scanned += got.items.length
        for (const row of got.items) {
          if (!isRecord(row) || row.status !== 'publish' || typeof row.content !== 'string') continue
          const id = positive(row.id)
          if (id === 0 || postIds.has(id)) continue
          stores.push(...postStores(row, { id, family: 'site', lang }))
        }
        if (got.items.length < SITE_PAGE_ROWS) return
        if (n === SITE_PAGES_MAX - 1) capped = true
      }
    })
  await inPool(wave1, (task) => task())
  if (cutWhat.length > 0)
    return {
      ok: false,
      answer: refuse('READ_FAILED', wpText('cutError', { what: cutWhat[0] }), wpText('cutNext'))
    }
  if (stop !== null) return { ok: false, answer: stop }

  // Wave 2: each part by its slug — the ACTIVE theme's row, or none; the posts page's own record.
  /** @type {Set<string>} */
  const partAreas = new Set()
  /** @type {(() => Promise<void>)[]} */
  const wave2 = []
  for (const slug of slugs)
    wave2.push(async () => {
      const got = await read('content.get', { kind: 'templatePart', key: slug })
      if (cut(got)) cutWhat.push(`the ${slug} part`)
      else if (ok(got) && isRecord(got.item) && typeof got.item.content === 'string') {
        const area =
          typeof got.item.area === 'string' && got.item.area !== '' ? got.item.area : 'uncategorized'
        partAreas.add(area)
        const region = area === 'header' ? ['header', 'topbar'] : area === 'footer' ? 'footer' : 'main'
        stores.push({
          id: `part:${slug}`,
          kind: 'templatePart',
          field: 'content',
          shape: 'blocks',
          raw: got.item.content,
          region,
          label: `the ${String(got.item.title || slug).slice(0, 40)} part`,
          group: `part:${slug}`,
          toolset: 'site',
          address: { kind: 'templatePart', key: slug },
          read: { kind: 'templatePart', key: slug },
          lang: null,
          title: typeof got.item.title === 'string' && got.item.title !== '' ? got.item.title : slug,
          partId: positive(got.item.id),
          area,
          stored: got.stored !== false,
          body: true,
          writable: true
        })
      }
    })
  // The theme's templates, only when the narrower read left words untraced (`theme`): each is read by
  // its slug — the site's override, or the theme's file. Which one renders this page is WordPress's
  // hierarchy; the page's own words decide it here, as they decide every other place.
  if (theme)
    wave2.push(async () => {
      const listed = await read('content.list', { kind: 'template' })
      if (!isRecord(listed) || listed.ok !== true || !Array.isArray(listed.items)) return
      const keys = listed.items
        .filter((r) => isRecord(r) && typeof r.key === 'string' && r.key !== '')
        .map((r) => /** @type {string} */ (r.key))
        .slice(0, TEMPLATE_READ_MAX)
      await inPool(keys, async (key) => {
        const got = await read('content.get', { kind: 'template', key })
        if (cut(got)) cutWhat.push(`the ${key} template`)
        else if (ok(got) && isRecord(got.item) && typeof got.item.content === 'string')
          stores.push({
            id: `template:${key}`,
            kind: 'template',
            field: 'content',
            shape: 'blocks',
            raw: got.item.content,
            region: ['main', 'header', 'topbar', 'footer'],
            label: `the ${key} template`,
            group: `template:${key}`,
            toolset: 'site',
            address: { kind: 'template', key },
            read: { kind: 'template', key },
            lang: null,
            title: typeof got.item.title === 'string' && got.item.title !== '' ? got.item.title : key,
            partId: positive(got.item.id),
            stored: got.stored !== false,
            body: true,
            writable: true
          })
      })
    })
  const table = page?.theme
    ? WP_THEME_STORES[/** @type {keyof typeof WP_THEME_STORES} */ (`${page.theme}@${page.themeVersion}`)]
    : undefined
  if (postsPage !== null) {
    const id = postsPage
    if (!postIds.has(id))
      wave2.push(async () => {
        const got = await read('content.get', { kind: 'post', id })
        if (ok(got) && isRecord(got.item))
          stores.push(
            ...postStores(got.item, { id, family: 'page', lang: null }).filter(
              (s) => s.field !== 'post_content'
            )
          )
      })
    for (const meta of table?.blog ?? [])
      wave2.push(async () => {
        const got = await read('content.get', { kind: 'postmeta', id, key: meta.key })
        if (ok(got) && isRecord(got.item) && typeof got.item.value === 'string' && got.item.value !== '')
          stores.push({
            id: `meta:${id}.${meta.key}`,
            kind: 'postmeta',
            field: 'value',
            shape: 'plain',
            raw: got.item.value,
            region: 'main',
            label: 'the heading of the posts page',
            group: `meta:${id}/${meta.key}`,
            toolset: 'content',
            address: { kind: 'postmeta', id, key: meta.key },
            read: { kind: 'postmeta', id, key: meta.key },
            lang: null,
            body: false,
            writable: true,
            tag: meta.tag
          })
      })
  }
  await inPool(wave2, (task) => task())
  if (cutWhat.length > 0)
    return {
      ok: false,
      answer: refuse('READ_FAILED', wpText('cutError', { what: cutWhat[0] }), wpText('cutNext'))
    }
  if (stop !== null) return { ok: false, answer: stop }

  // Wave 3: the menus the parts and the page's body render — each one a block names by `ref`, and
  // WordPress's fallback menu when a block names none and holds no links of its own, or when the
  // page renders a navigation in an area no stored record covers (that part is still the theme's
  // file) — and the synced patterns (`core/block` refs) the same bodies render.
  /** @type {NavUse[]} */
  const navRefs = []
  /** @type {Map<string, number[]>} */
  const blockUses = new Map()
  for (const s of stores)
    if (s.kind === 'templatePart' || (s.id === `post:${page?.pageId}` && s.field === 'post_content')) {
      navRefs.push({
        area: s.kind === 'templatePart' ? /** @type {string} */ (s.area) : 'main',
        store: s.id,
        blocks: navBlocks(s.raw)
      })
      const used = parseBlocks(s.raw)
        .filter((d) => d.name === 'core/block' && !d.closer)
        .map((d) => positive(d.attrs?.ref))
        .filter((id) => id > 0)
      if (used.length > 0) blockUses.set(s.id, [...new Set(used)])
    }
  // 🔒 A NAVIGATION NO STORED RECORD COVERS IS STILL A MENU. On a Tracy theme whose header is the
  // theme's own file (the seeder stores no part), the rendered `<nav>` has no block here to name its
  // menu, and every label answered "the theme's template file" — while WordPress printed it from the
  // fallback wp_navigation post, which `content.update` changes (review of P10, 25/09).
  const uncovered = page
    ? navAreasOf(page).filter((area) => !navRefs.some((n) => n.blocks.length > 0 && areaIs(n.area, area)))
    : []
  const fallbackWanted =
    uncovered.length > 0 || navRefs.some((n) => n.blocks.some((b) => b.kind === 'fallback'))
  const fallback = fallbackWanted ? await fallbackNavs(read) : []
  const refs = [
    ...new Set([
      ...navRefs.flatMap((n) => n.blocks.filter((b) => b.kind === 'ref').map((b) => b.ref)),
      ...fallback
    ])
  ].slice(0, NAV_REFS_MAX)
  const navRegion = (/** @type {number} */ ref) => {
    const areas = navRefs
      .filter((n) =>
        n.blocks.some(
          (b) => (b.kind === 'ref' && b.ref === ref) || (b.kind === 'fallback' && fallback.includes(ref))
        )
      )
      .map((n) => n.area)
    if (fallback.includes(ref)) areas.push(...uncovered)
    return areas.includes('header') ? ['header', 'topbar'] : areas.includes('footer') ? 'footer' : 'main'
  }
  // 🔒 A SYNCED PATTERN IS CORE WORDPRESS, NOT A THEME QUIRK: `<!-- wp:block {"ref":N} /-->` renders the
  // body of wp_block N, a post `content.update {kind:"post", id:N}` writes. Tracy's own tracy-base
  // contract maps the home hero and the contact details to two of them (content-map.json, entities
  // 5–6); unread, their words answered "the theme prints them … that is an answer". One level: a
  // pattern inside a pattern is not followed.
  const regionOf = new Map(stores.map((s) => [s.id, s.region]))
  const blockIds = [...new Set([...blockUses.values()].flat())].slice(0, BLOCK_REFS_MAX)
  const blockRegion = (/** @type {number} */ id) => {
    /** @type {Set<string>} */
    const regions = new Set()
    for (const [user, ids] of blockUses)
      if (ids.includes(id)) for (const r of [regionOf.get(user) ?? 'main'].flat()) regions.add(r)
    const list = [...regions]
    return list.length === 1 ? list[0] : list
  }
  /** @type {({ nav: number } | { block: number })[]} */
  const jobs = [...refs.map((nav) => ({ nav })), ...blockIds.map((block) => ({ block }))]
  await inPool(jobs, async (job) => {
    const id = 'nav' in job ? job.nav : job.block
    const got = await read('content.get', { kind: 'post', id })
    if (cut(got)) cutWhat.push('nav' in job ? `menu ${id}` : `synced pattern ${id}`)
    else if (ok(got) && isRecord(got.item))
      for (const s of postStores(got.item, { id, family: 'nav' in job ? 'nav' : 'block', lang: null }))
        stores.push({ ...s, region: 'nav' in job ? navRegion(id) : blockRegion(id) })
  })
  if (cutWhat.length > 0)
    return {
      ok: false,
      answer: refuse('READ_FAILED', wpText('cutError', { what: cutWhat[0] }), wpText('cutNext'))
    }
  if (stop !== null) return { ok: false, answer: stop }

  // 🔒 A THEME PATTERN IS CORE WORDPRESS TOO: `<!-- wp:pattern {"slug":"x/y"} /-->` renders the
  // registered pattern x/y, which lives in the theme's PHP and has no record of its own. The block
  // editor changes one by expanding it into the body that inserts it; so does this job
  // (`expandPatterns`). Measured 30/09/2026 on the Tracy stand: /pricing/ was one such line and every
  // word of it answered "words the theme prints". One level: a pattern inside a pattern is not
  // followed. An older component refuses the kind (`bad_params`) and the words stay unread.
  /** @type {Map<string, { host: Store, slug: string, spans: [number, number][] }>} */
  const patternUses = new Map()
  for (const host of stores) {
    if (host.shape !== 'blocks' || !host.body) continue
    if (!(host.kind === 'templatePart' || host.kind === 'template' || host.field === 'post_content')) continue
    if (host.kind === 'post' && host.id !== `post:${page?.pageId}` && !host.id.startsWith('block:')) continue
    for (const d of parseBlocks(host.raw)) {
      if (d.name !== 'core/pattern' || d.closer || typeof d.attrs?.slug !== 'string') continue
      const key = `${d.attrs.slug}@${host.id}`
      const use = patternUses.get(key) ?? { host, slug: d.attrs.slug, spans: [] }
      use.spans.push([d.start, d.end])
      patternUses.set(key, use)
    }
  }
  const patternSlugs = [...new Set([...patternUses.values()].map((u) => u.slug))].slice(0, PATTERN_REFS_MAX)
  /** @type {Map<string, { title: string, content: string }>} */
  const patterns = new Map()
  await inPool(patternSlugs, async (slug) => {
    const got = await read('content.get', { kind: 'pattern', key: slug })
    if (cut(got)) cutWhat.push(`the pattern ${slug}`)
    else if (isRecord(got) && got.ok === true && isRecord(got.item) && typeof got.item.content === 'string')
      patterns.set(slug, {
        title: typeof got.item.title === 'string' && got.item.title !== '' ? got.item.title : slug,
        content: got.item.content
      })
  })
  if (cutWhat.length > 0)
    return {
      ok: false,
      answer: refuse('READ_FAILED', wpText('cutError', { what: cutWhat[0] }), wpText('cutNext'))
    }
  /** @type {Map<string, string[]>} */
  const patternRefs = new Map()
  for (const [key, { host, slug, spans }] of patternUses) {
    const pattern = patterns.get(slug)
    if (!pattern) continue
    const once = spans.length === 1
    stores.push({
      id: `pattern:${key}`,
      kind: 'pattern',
      field: host.field,
      shape: 'blocks',
      raw: pattern.content,
      region: host.region,
      label: `the "${pattern.title.slice(0, 40)}" pattern`,
      group: host.group,
      toolset: host.toolset,
      address: host.address,
      read: host.read,
      lang: host.lang,
      title: pattern.title,
      host: host.id,
      refSpan: spans[0],
      body: true,
      // Inserted twice in one body, the words show twice: which copy was meant is not this call's to guess.
      writable: host.writable && once,
      ...(once ? {} : { why: WHY.patternTwice })
    })
    patternRefs.set(host.id, [...(patternRefs.get(host.id) ?? []), `pattern:${key}`])
  }

  // The site identity, once, only when a record read prints one of its tokens (tracy-business 1.2.0+).
  const identity = stores.some((s) => hasIdentityToken(s.raw)) ? await readIdentity(read) : null

  // A body WordPress already cannot parse is shown, never rewritten: the guard would refuse it.
  for (const s of stores)
    if (s.shape === 'blocks' && blockMarkupProblem(s.raw) !== null) {
      s.writable = false
      s.why = WHY.unreadable
    }
  // One store per id, in a stable order (the waves finish in any order).
  const byId = new Map(stores.map((s) => [s.id, s]))
  const resolved = fallback.filter((id) => byId.has(`nav:${id}`))
  /** @type {Map<string, string[]>} */
  const blockRefs = new Map()
  for (const [user, ids] of blockUses) {
    const held = ids.map((id) => `block:${id}`).filter((id) => byId.has(id))
    if (held.length > 0) blockRefs.set(user, held)
  }
  // A theme pattern shows wherever the body that inserts it shows — the same rule as a synced one.
  for (const [user, ids] of patternRefs) blockRefs.set(user, [...(blockRefs.get(user) ?? []), ...ids])
  return {
    ok: true,
    set: {
      stores: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
      navRefs,
      fallback: resolved,
      navUnresolved: fallbackWanted && resolved.length === 0,
      blockRefs,
      partAreas,
      scanned,
      capped,
      postsPage,
      identity
    }
  }
}

// ── Anchoring: which records render where (F3 §5.5) ─────────────────────────────────────────────

/**
 * @param {PageFacts} page
 * @param {ReadSet} set
 * @param {Map<string, string>} whyNext - filled by {@link whyOf}: the next for a reason that names a
 *   road (a record this call did not reach), keyed by the reason.
 */
function anchorHooks(page, set, whyNext) {
  const storeById = new Map(set.stores.map((s) => [s.id, s]))
  const termIds = set.stores.filter((s) => s.kind === 'term').map((s) => s.id)
  const templateIds = set.stores.filter((s) => s.kind === 'template').map((s) => s.id)
  const ownPage = page.pageId ?? set.postsPage
  /** @type {WeakMap<object, Set<string>>} */
  const cache = new WeakMap()
  /**
   * Per occurrence, the stores whose units count there only inside given raw spans: a menu whose
   * links are the inner blocks of a navigation in a part or a page body — the rest of that record
   * is not the menu.
   * @type {WeakMap<object, Map<string, [number, number][]>>}
   */
  const within = new WeakMap()
  /**
   * The stores that print the menu at a rendered `<nav>`: the wp_navigation post a block names, the
   * part or body whose inner blocks it renders (with that block's span), or WordPress's fallback —
   * also where no stored record holds a navigation block for that area (the theme's own part file).
   * @param {string} area
   * @param {string[]} navClasses
   * @returns {{ id: string, span: [number, number] | null }[]}
   */
  const navsOf = (area, navClasses) => {
    const blocks = set.navRefs
      .filter((n) => areaIs(n.area, area))
      .flatMap((n) => n.blocks.map((b) => ({ ...b, store: n.store })))
    if (blocks.length === 0) return set.fallback.map((id) => ({ id: `nav:${id}`, span: null }))
    // The <nav> renders its block's className: it names which menu of the part this is.
    const named = blocks.filter((b) => b.classes.length > 0 && b.classes.every((c) => navClasses.includes(c)))
    /** @type {{ id: string, span: [number, number] | null }[]} */
    const out = []
    for (const b of named.length > 0 ? named : blocks) {
      if (b.kind === 'ref') out.push({ id: `nav:${b.ref}`, span: null })
      else if (b.kind === 'inner') out.push({ id: b.store, span: b.span })
      else for (const id of set.fallback) out.push({ id: `nav:${id}`, span: null })
    }
    return out
  }
  /** @param {string} area */
  const partsOf = (area) =>
    set.stores.filter((s) => s.kind === 'templatePart' && s.area === area).map((s) => s.id)
  /** @param {number | null} id */
  const recordOf = (id) => (id === null ? [] : [`post:${id}`, `post:${id}.title`, `post:${id}.excerpt`])
  /**
   * The template-part stores that may hold words printed inside `part`. The part's own landmark names its
   * area; a wrapper that names none leaves the region of the words as the hint, beside every part never filed
   * under header or footer (`uncategorized` stands anywhere). An area the landmark or the region NAMES but no
   * part read belongs to is the theme file's, as it was before the wrapper rule: no candidate, never another
   * area's part that happens to print the same words (an older component lists only the parts a site stored,
   * so its header can be a file while the footer is a row, and the footer would take the header's occurrence,
   * label it "topbar" and drop the "template file" note). Only when nothing names an area (no landmark, and a
   * region that is neither header nor footer: words below a `<main>` with no `<footer>` around them) every part
   * read is a candidate and the words themselves decide which one holds them. A function of its own, not a
   * block in the `candidates` chain: the where-maps quote that chain's one-line branches
   * (`content-where.test.mjs`), and a block branch makes the formatter break them.
   * @param {readonly UnitElement[]} chain @param {UnitElement} part @param {string} region
   */
  const partStores = (chain, part, region) => {
    const own = partAreaOf(chain, part)
    const area = partAreaAt(chain, part, region)
    const other = set.stores
      .filter((s) => s.kind === 'templatePart' && s.area !== 'header' && s.area !== 'footer')
      .map((s) => s.id)
    const named = area === 'other' ? other : [...partsOf(area), ...(own === 'other' ? other : [])]
    return named.length > 0 || area !== 'other'
      ? named
      : set.stores.filter((s) => s.kind === 'templatePart').map((s) => s.id)
  }

  /**
   * The stores that may show words at this occurrence, narrowest marker first.
   * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
   * @returns {Set<string>}
   */
  const candidates = (occ) => {
    const got = cache.get(occ)
    if (got) return got
    const chain = occ.unit.chainAt(occ.a)
    /** @type {'title' | 'excerpt' | 'content' | null} */
    let field = null
    /** @type {number | null} */
    let postId = null
    /** @type {string | null} */
    let site = null
    let form = 0
    let cat = 0
    let terms = false
    let archiveTitle = false
    /** @type {UnitElement | null} */
    let nav = null
    /** @type {UnitElement | null} */
    let part = null
    for (const el of chain) {
      const tokens = el.cls.split(/\s+/)
      if (site === null && tokens.includes('wp-block-site-title')) site = 'blogname'
      if (site === null && tokens.includes('wp-block-site-tagline')) site = 'blogdescription'
      if (field === null)
        field = tokens.includes('wp-block-post-title')
          ? 'title'
          : tokens.includes('wp-block-post-excerpt')
            ? 'excerpt'
            : tokens.includes('wp-block-post-content')
              ? 'content'
              : null
      if (tokens.includes('wp-block-post-terms') || tokens.includes('taxonomy-category')) terms = true
      if (tokens.includes('wp-block-query-title') || tokens.includes('wp-block-term-name'))
        archiveTitle = true
      if (postId === null) {
        const p = tokens.map((t) => /^post-(\d+)$/.exec(t)).find(Boolean)
        if (p) postId = Number(p[1])
      }
      if (form === 0) form = Number(/^wpcf7-f(\d+)-/.exec(el.id)?.[1] ?? 0)
      if (cat === 0) cat = Number(tokens.map((t) => /^cat-item-(\d+)$/.exec(t)?.[1]).find(Boolean) ?? 0)
      if (nav === null && tokens.includes('wp-block-navigation')) nav = el
      if (part === null && tokens.includes('wp-block-template-part')) part = el
    }
    const region = occ.unit.region
    /** @type {string[]} */
    let ids
    if (site) ids = [`option:${site}`]
    else if (form) ids = [`form:${form}`]
    else if (cat) ids = [`term:category:${cat}`]
    else if (terms) ids = termIds
    // The title a category or tag archive prints ("Category: <span>Engineering</span>") is its term.
    else if (archiveTitle && page.archive) ids = [`term:${page.archive.taxonomy}:${page.archive.id}`]
    else if (postId !== null)
      ids =
        field === 'title'
          ? [`post:${postId}.title`]
          : field === 'excerpt'
            ? // an empty excerpt is WordPress's own cut of the content (`wp_trim_excerpt`)
              storeById.has(`post:${postId}.excerpt`)
              ? [`post:${postId}.excerpt`]
              : [`post:${postId}`]
            : field === 'content'
              ? [`post:${postId}`]
              : recordOf(postId)
    else if (nav) {
      const navs = navsOf(areaOfRegion(region), nav.cls.split(/\s+/))
      ids = navs.map((n) => n.id)
      /** @type {Map<string, [number, number][]>} */
      const spans = new Map()
      for (const n of navs) if (n.span) spans.set(n.id, [...(spans.get(n.id) ?? []), n.span])
      if (spans.size > 0) within.set(occ, spans)
    } else if (field === 'title') ids = [`post:${ownPage}.title`]
    else if (field === 'excerpt') ids = [`post:${ownPage}.excerpt`]
    else if (field === 'content') ids = [`post:${ownPage}`]
    else if (part) ids = partStores(chain, part, region)
    else if (region === 'title') ids = [`post:${ownPage}.title`, 'option:blogname', 'option:blogdescription']
    else if (region === 'header' || region === 'topbar' || region === 'drawer') ids = partsOf('header')
    else if (region === 'footer') ids = partsOf('footer')
    else
      ids = [
        ...recordOf(ownPage),
        ...set.stores.filter((s) => s.kind === 'postmeta' && s.shape === 'plain').map((s) => s.id)
      ]
    // A template frames every region of the page it renders, outside the parts and the body (read
    // only by the wider read; the page's words decide which template is this page's).
    if (!nav && region !== 'title') ids = [...ids, ...templateIds]
    // A synced pattern shows wherever the body or part that names it shows (a menu is not one).
    if (!nav) ids = ids.flatMap((id) => [id, ...(set.blockRefs.get(id) ?? [])])
    const out = new Set(ids.filter((id) => storeById.has(id)))
    cache.set(occ, out)
    return out
  }

  /** @type {import('./replace.mjs').LocateHooks} */
  const hooks = {
    anchor: (hit, occ) => {
      const u = /** @type {any} */ (hit.unit)
      if (!candidates(occ).has(u.store)) return false
      // A menu held as a navigation's inner blocks: only the units inside that block are the menu.
      const spans = within.get(occ)?.get(u.store)
      const at = u.map?.[0]?.[0] ?? -1
      if (spans && !spans.some(([s, e]) => at >= s && at < e)) return false
      const attr = occ.unit.attr
      // An attribute on the page is written from an attribute in the store, and text from text.
      if (u.unitKind === 'attr') return attr === u.attrName
      if (u.unitKind === 'cf7-option') return true
      if (u.unitKind === 'json') {
        if (u.jsonKey === 'placeholder') return attr === 'placeholder'
        if (attr) return false
        const chain = occ.unit.chainAt(occ.a)
        // A menu item's label prints inside a <nav>, never beside it (a part holds both).
        if (
          NAV_ITEM_BLOCKS.has(u.block) &&
          !chain.some((el) => el.cls.split(/\s+/).includes('wp-block-navigation'))
        )
          return false
        if (u.jsonKey === 'buttonText') return chain.some((el) => el.tag === 'button')
        if (u.block === 'core/search' && u.jsonKey === 'label') return chain.some((el) => el.tag === 'label')
        return true
      }
      return !attr
    },
    why: (occ) => whyOf(occ, page, set, whyNext),
    // A heading on two lines is one unit here (`A <br><em>B</em>`), never two stored values.
    pairs: () => [],
    twinFollows: (occ, counted) => {
      // An unmarked menu copy whose words a counted value holds (the core's own rule).
      if (occ.unit.inNav && counted.some((u) => u.lower === occ.unit.lower)) return true
      // 🔒 A LINKED FEATURED IMAGE'S `alt` IS ITS POST'S TITLE, printed by WordPress itself
      // (`core/post-featured-image`): measured on `/news/`, where each card's image repeats the post
      // title. It changes with the title, so it is not a place left unchanged.
      if (occ.unit.attr !== 'alt') return false
      const chain = occ.unit.chainAt(occ.a)
      if (!chain.some((el) => el.cls.split(/\s+/).includes('wp-block-post-featured-image'))) return false
      const post = chain
        .map((el) =>
          el.cls
            .split(/\s+/)
            .map((t) => /^post-(\d+)$/.exec(t)?.[1])
            .find(Boolean)
        )
        .find(Boolean)
      return post !== undefined && counted.some((u) => /** @type {any} */ (u).store === `post:${post}.title`)
    }
  }
  return hooks
}

/**
 * The area a rendered template part stands for: its own tag (`tagName` header/footer, or the
 * landmark role), else the landmark just inside it. A part may render as a div around its own
 * `<footer>` (`wp:template-part {"tagName":"div","area":"footer"}` — measured 30/09/2026 on the Tracy
 * stand), and read by the wrapper alone its words answered "the theme's template file".
 * @param {readonly UnitElement[]} chain - innermost first
 * @param {UnitElement} part
 * @returns {'header' | 'footer' | 'other'}
 */
function partAreaOf(chain, part) {
  /** @param {UnitElement} el */
  const areaOf = (el) =>
    el.tag === 'header' || el.role === 'banner'
      ? 'header'
      : el.tag === 'footer' || el.role === 'contentinfo'
        ? 'footer'
        : null
  const own = areaOf(part)
  if (own) return own
  const inside = chain.slice(0, chain.indexOf(part)).reverse()
  for (const el of inside) {
    const a = areaOf(el)
    if (a) return a
  }
  return 'other'
}

/**
 * The area a template part's words belong to: the part's own landmark ({@link partAreaOf}) or, when
 * its wrapper names none, the region the page reader placed the words in. A part rendered as a plain
 * wrapper (`wp:template-part {"tagName":"div"}`) around a `<nav>` or a `<div>` has no landmark at all,
 * and read by the wrapper alone its header's words were traced to no part — measured 02/10/2026 on an
 * imported block-theme copy, where every menu label answered "the theme's template file" while the
 * header part had been read.
 * @param {readonly UnitElement[]} chain - innermost first
 * @param {UnitElement} part
 * @param {string} region - the occurrence's region (`topbar`, `header`, `drawer`, `main`, `footer`…)
 * @returns {'header' | 'footer' | 'other'}
 */
function partAreaAt(chain, part, region) {
  const own = partAreaOf(chain, part)
  if (own !== 'other') return own
  if (region === 'header' || region === 'topbar' || region === 'drawer') return 'header'
  return region === 'footer' ? 'footer' : 'other'
}

/**
 * Why the words at this occurrence have no door (F3 §5.5).
 *
 * 🔒 "NOT READ" IS NEVER "CANNOT". A record the page names that this call did not read — a `post-N`
 * item, a term linked from a post card, a menu this call could not trace — is a road not taken, not a
 * theme's words: its reason goes to `whyNext` with the call that does reach it, so the refusal never
 * carries the core's "do not look for another way in: that is an answer" (review of P10, 25/09).
 * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
 * @param {PageFacts} page
 * @param {ReadSet} set
 * @param {Map<string, string>} whyNext
 */
function whyOf(occ, page, set, whyNext) {
  /** @param {string} why @param {string} next */
  const road = (why, next) => {
    if (!whyNext.has(why)) whyNext.set(why, next)
    return why
  }
  const chain = occ.unit.chainAt(occ.a)
  const text = chain.map((el) => ` ${el.cls} ${el.id} `).join(' ')
  if (chain.some((el) => el.tag === 'time') || /\swp-block-post-date\s/.test(text)) return WHY.date
  if (/\s(wp-block-query-total|wp-block-query-pagination[\w-]*|page-numbers)\s/.test(text))
    return WHY.computed
  if (/\swp-block-post-author[\w-]*\s/.test(text)) return WHY.author
  if (/(\s|-)(lang|language|lang-item|pll-[\w-]+)(\s|_|-)/.test(text)) return WHY.languages
  const part = chain.find((el) => /(^|\s)wp-block-template-part(\s|$)/.test(el.cls))
  if (part) {
    const area = partAreaAt(chain, part, occ.unit.region)
    const stored =
      area === 'other'
        ? [...set.partAreas].some((a) => a !== 'header' && a !== 'footer')
        : set.partAreas.has(area)
    // A menu in the theme's own part prints the fallback wp_navigation post: read and not holding
    // these words, they are the theme file's; not resolved (several menus, no dates), a road.
    if (!stored)
      return occ.unit.inNav && set.navUnresolved ? road(WHY.menu, wpText('menuNext')) : WHY.themeFile
  }
  // A term linked from a post card or a category list: read by its id, which only its archive prints.
  if (/\s(wp-block-post-terms|wp-block-categories[\w-]*|cat-item|tag-cloud-link)\s/.test(text)) {
    const href = chain.find((el) => el.tag === 'a' && el.href)?.href ?? null
    return road(WHY.term, wpText('unreadNext', { path: pathOf(href) ?? "<the category's own page>" }))
  }
  const post = chain.map((el) => /(?:^|\s)post-(\d+)(?:\s|$)/.exec(el.cls)?.[1]).find(Boolean)
  if (post && !set.stores.some((s) => s.group === `post:${post}`))
    return road(WHY.unread, wpText('unreadNext', { path: "<that post's own page>" }))
  if (occ.unit.region === 'main' && page.pageId === null && set.postsPage === null) return WHY.themeFile
  if (occ.unit.inForm) return REPLACE_WHY.form
  if (occ.unit.region === 'title') return REPLACE_WHY.title
  if (occ.unit.inNav) return road(WHY.menu, wpText('menuNext'))
  // 🔒 "THE THEME PRINTS THEM" IS MEASURED, THEME BY THEME. On a theme (or version) with no row in
  // the table its own stores are unknown, and a Site Editor template holds words too: the reason
  // says what this call did not trace and names that road, never the core's "that is an answer".
  const theme = page.theme ? `${page.theme}@${page.themeVersion ?? '?'}` : 'unknown'
  if (!(theme in WP_THEME_STORES)) return road(WHY.untraced(theme), wpText('untracedNext'))
  return WHY.theme
}

/**
 * A link's path, when it is short and plain enough to be a `path` the model sends back whole
 * (a cut path is a call that fails): `/category/engineering/`.
 * @param {string | null} href
 */
function pathOf(href) {
  if (!href) return null
  try {
    const p = new URL(href, 'http://site.invalid/').pathname
    return p.length <= 60 && /^\/[\w\-./%]*$/.test(p) ? p : null
  } catch {
    return null
  }
}

// ── Rewriting a record (F3 §5.7) ─────────────────────────────────────────────────────────────────

/** Text for HTML: `& < >` escaped. @param {string} t */
export const escapeHtmlText = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Words written into a block attribute, the way WordPress serialises one
 * (`serialize_block_attributes`): HTML-escaped rich text, JSON-encoded, then `--` `<` `>` `&` and `\"`
 * spelled as `\u` escapes. The three values the structure map round-tripped through WordPress's own
 * `WP_Block_Parser` (`Investors & <press> "quoted" -- x`, `R&D "hub"`, `A & B <c>`) come back whole.
 * @param {string} t
 */
export function encodeJsonText(t) {
  return JSON.stringify(escapeHtmlText(t))
    .slice(1, -1)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\\"/g, '\\u0022')
}

/**
 * New words for one unit kind. `plain` values (an option, a title, a term, a heading meta) are stored
 * as the site stores them — WordPress escapes on output — with only `<` and `>` escaped, so new words
 * never become markup.
 * @param {UnitKind} kind
 * @param {string} text
 */
function encodeFor(kind, text) {
  const t = text.replace(/\s*\n\s*/g, ' ')
  if (kind === 'json') return encodeJsonText(t)
  if (kind === 'cf7-option') return t.replace(/"/g, '”')
  if (kind === 'attr') return escapeHtmlText(t).replace(/"/g, '&quot;')
  if (kind === 'plain') return t.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escapeHtmlText(t)
}

/** A word boundary in a folded view: its start or end, or beside a space. @param {string} s @param {number} i */
const boundary = (s, i) => i === 0 || i === s.length || s[i] === ' ' || s[i - 1] === ' '

/**
 * The smallest change at word boundaries: the words both texts start and end with are kept, so only
 * the differing middle is written. "Hotline: 8 800 550-67-89" → "Hotline: 0909 123 456" rewrites the
 * number inside its `<a href="tel:…">` and keeps the link (a whole-unit splice would cross the link
 * and drop it); appending a sentence inserts it after the last word and touches nothing else.
 * @param {string} oldText - folded, as the unit's `cased` view reads.
 * @param {string} newText - the new words, raw.
 * @returns {{ p: number, q: number, mid: string }} `p`/`q`: characters kept at the start/end of
 *   `oldText`; `mid`: the raw new words that replace the rest.
 */
export function narrowChange(oldText, newText) {
  const nv = views(newText, { decode: false })
  const n = nv.cased
  let p = 0
  const lim = Math.min(oldText.length, n.length)
  while (p < lim && oldText[p] === n[p]) p += 1
  while (p > 0 && !(boundary(oldText, p) && boundary(n, p))) p -= 1
  let q = 0
  const qlim = Math.min(oldText.length, n.length) - p
  while (q < qlim && oldText[oldText.length - 1 - q] === n[n.length - 1 - q]) q += 1
  while (q > 0 && !(boundary(oldText, oldText.length - q) && boundary(n, n.length - q))) q -= 1
  const a = p
  const b = n.length - q
  const mid = a >= b ? '' : newText.slice(nv.map[a][0], nv.map[b - 1][1])
  return { p, q, mid }
}

/** Visible text of raw markup, tags removed (entities kept: the bytes are already encoded). @param {string} s */
const stripTags = (s) => s.replace(/<[^>]*>/g, '')

/**
 * Grow `[s, e)` until every tag opened inside it closes inside it and every tag closed inside it
 * opened inside it (F3 §5.7 `balanceSpan`). Void elements do not count.
 * @param {string} raw
 * @param {number} s
 * @param {number} e
 * @returns {[number, number]}
 */
function balanceSpan(raw, s, e) {
  const VOIDS = new Set(['br', 'img', 'hr', 'input', 'wbr', 'source', 'meta', 'link'])
  for (let round = 0; round < 8; round += 1) {
    /** @type {string[]} */
    const open = []
    /** @type {string[]} */
    const stray = []
    const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g
    TAG.lastIndex = s
    for (let m = TAG.exec(raw); m !== null && m.index < e; m = TAG.exec(raw)) {
      const name = m[2].toLowerCase()
      if (VOIDS.has(name) || m[3]) continue
      if (m[1]) {
        if (open.length && open[open.length - 1] === name) open.pop()
        else stray.push(name)
      } else open.push(name)
    }
    if (!open.length && !stray.length) return [s, e]
    for (const name of open) {
      const c = raw.toLowerCase().indexOf(`</${name}`, e)
      if (c >= 0) e = raw.indexOf('>', c) + 1
    }
    for (const name of stray) {
      const o = raw.toLowerCase().lastIndexOf(`<${name}`, s)
      if (o >= 0) s = o
    }
  }
  return [s, e]
}

/**
 * The link whose whole visible text is `raw[s, e)`, if it is one: `{hrefAt, href}` of its
 * `<a href="…">`. Only spaces and tags may stand between the link's edges and the words.
 * @param {string} raw
 * @param {number} s
 * @param {number} e
 */
function wholeLink(raw, s, e) {
  const lt = raw.toLowerCase().lastIndexOf('<a', s)
  if (lt === -1) return null
  const t = markupAt(raw, lt)
  if (t.kind !== 'tag' || t.name !== 'a' || t.close || t.end > s) return null
  const close = raw.toLowerCase().indexOf('</a>', e)
  if (
    close === -1 ||
    (raw.toLowerCase().indexOf('<a', t.end) < e &&
      raw.toLowerCase().indexOf('<a', t.end) !== -1 &&
      raw.toLowerCase().indexOf('<a', t.end) < close)
  )
    return null
  if (stripTags(raw.slice(t.end, s)).trim() !== '' || stripTags(raw.slice(e, close)).trim() !== '')
    return null
  const m = /\shref\s*=\s*"([^"]*)"/i.exec(raw.slice(lt, t.end))
  if (!m) return null
  const at = lt + m.index + m[0].length - m[1].length - 1
  return { hrefAt: /** @type {[number, number]} */ ([at, at + m[1].length]), href: decodeEntities(m[1]) }
}

/**
 * Is `raw[s]` inside an `<a>` element?
 * @param {string} raw
 * @param {number} s
 */
function insideLink(raw, s) {
  const lower = raw.toLowerCase()
  let lt = lower.lastIndexOf('<a', s)
  while (lt !== -1) {
    const t = markupAt(raw, lt)
    if (t.kind === 'tag' && t.name === 'a' && !t.close) {
      const close = lower.indexOf('</a', t.end)
      return close === -1 || close >= s
    }
    lt = lt === 0 ? -1 : lower.lastIndexOf('<a', lt - 1)
  }
  return false
}

/**
 * The runs of words of view span `[x, y)` of a unit, cut at every tag between them (an inline edge's
 * soft space maps to no bytes, and cuts too): each with its view span, raw span and text.
 * @param {string} raw
 * @param {{ cased: string, map: [number, number][] }} u
 * @param {number} x
 * @param {number} y
 */
function runsOf(raw, u, x, y) {
  /** @type {{ x0: number, x1: number, rs: number, re: number }[]} */
  const runs = []
  /** @type {{ x0: number, x1: number, rs: number, re: number } | null} */
  let cur = null
  for (let i = x; i < y; i += 1) {
    const [s, e] = u.map[i]
    if (s === e || (cur && raw.slice(cur.re, s).includes('<'))) {
      if (cur) runs.push(cur)
      cur = null
      if (s === e) continue
    }
    if (cur) {
      cur.x1 = i + 1
      cur.re = e
    } else cur = { x0: i, x1: i + 1, rs: s, re: e }
  }
  if (cur) runs.push(cur)
  return runs
    .map((r) => ({ ...r, text: u.cased.slice(r.x0, r.x1) }))
    .filter((r) => /[\p{L}\p{N}]/u.test(r.text))
}

/**
 * A phone number or an e-mail address inside new words (each match is checked with the core's own
 * test, whose dashes — `‑` U+2011 included — these take too).
 */
const PHONE_IN = /\+?\d[\d\s().\-\u2010-\u2015]{5,}\d/g
const EMAIL_IN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

/**
 * A change that runs across a link whose words are a phone number or an e-mail address, with words
 * beside it: `Hotline: <a href="tel:…">8 800 550-67-89</a>` → "Call us: 0909 123 456". The new
 * words hold exactly one fact of the link's kind, on the link's side: the fact is written inside the
 * link (its href follows, `followLink`) and the rest beside it, so the link stays a link. Anything
 * else answers the runs of old words, for the refusal that names them.
 * @param {string} raw
 * @param {any} u - the stored unit
 * @param {number} x - the view span that changes
 * @param {number} y
 * @param {string} mid - its new words, raw
 * @param {UnitKind} kind
 * @returns {{ edits: Edit[], companion: Record<string, unknown> | null } | { runs: string[] }}
 */
function factIntoLink(raw, u, x, y, mid, kind) {
  const runs = runsOf(raw, u, x, y)
  const refused = { runs: runs.map((r) => r.text.trim()) }
  if (runs.length !== 2) return refused
  const links = runs.map((r) => wholeLink(raw, r.rs, r.re))
  const k = links.findIndex(Boolean)
  const link = links[k]
  if (!link || links[1 - k] || insideLink(raw, runs[1 - k].rs)) return refused
  const old = runs[k].text.trim()
  const kindOf = isPhone(old) ? 'phone' : isEmail(old) ? 'email' : null
  if (kindOf === null) return refused
  const facts = [...mid.matchAll(kindOf === 'phone' ? PHONE_IN : EMAIL_IN)].filter((m) =>
    kindOf === 'phone' ? isPhone(m[0]) : isEmail(m[0])
  )
  if (facts.length !== 1) return refused
  const fact = facts[0][0]
  const fs = /** @type {number} */ (facts[0].index)
  const fe = fs + fact.length
  // The fact stands where the link stood: last when the link came last, first when it came first.
  if (k === 1 ? mid.slice(fe).trim() !== '' : mid.slice(0, fs).trim() !== '') return refused
  let beside = k === 1 ? mid.slice(0, fs) : mid.slice(fe)
  // After a link the space before the words is the markup's own (`</a> ok`): not written twice.
  if (k === 0 && /\s/.test(raw[runs[1].rs - 1] ?? '')) beside = beside.trimStart()
  const other = runs[1 - k]
  /** @type {Edit[]} */
  const edits = [
    { s: other.rs, e: other.re, text: encodeFor(kind, beside), role: 'text' },
    { s: runs[k].rs, e: runs[k].re, text: encodeFor(kind, fact), role: 'text' }
  ]
  const href = followLink(link.href, old, fact)
  if (!href) return { edits, companion: null }
  edits.push({ s: link.hrefAt[0], e: link.hrefAt[1], text: encodeHref(href), role: 'link' })
  return {
    edits,
    companion: {
      before: link.href,
      after: href,
      why: wpText(/^tel:/i.test(href) ? 'linkPhone' : 'linkEmail')
    }
  }
}

/**
 * The stored value's own characters, decoded the way its unit reads them.
 * @param {string} bytes
 * @param {UnitKind} kind
 */
function storedChars(bytes, kind) {
  if (kind === 'json')
    try {
      return decodeEntities(JSON.parse(`"${bytes}"`))
    } catch {
      return bytes
    }
  return decodeEntities(bytes)
}

/**
 * The edits of a change whose words fold to the same text (the typography alone differs): each
 * stored character (or entity) that differs from the new one is rewritten in place, nothing else —
 * the new words' own spelling, never a whole-body echo. Characters one side folds into several
 * (`…` → `...`) are compared as one group. Whitespace against whitespace is left as stored.
 * @param {string} raw
 * @param {any} u - the stored unit
 * @param {number} a - the view span of the hit
 * @param {number} b
 * @param {string} text - the new words, raw
 * @param {UnitKind} kind
 * @returns {Edit[]}
 */
function typographyEdits(raw, u, a, b, text, kind) {
  const nv = views(text, { decode: false })
  const n = b - a
  if (nv.map.length !== n) return []
  /** @param {[number, number][]} m @param {number} i @param {number} j */
  const same = (m, i, j) => m[i][0] === m[j][0] && m[i][1] === m[j][1]
  /** @type {Edit[]} */
  const out = []
  for (let i = 0; i < n; ) {
    let j = i + 1
    while (j < n && (same(u.map, a + j - 1, a + j) || same(nv.map, j - 1, j))) j += 1
    const s = u.map[a + i][0]
    const e = u.map[a + j - 1][1]
    const was = storedChars(raw.slice(s, e), kind)
    const now = text.slice(nv.map[i][0], nv.map[j - 1][1])
    if (s < e && was !== now && !(/^\s*$/.test(was) && /^\s*$/.test(now)))
      out.push({ s, e, text: encodeFor(kind, now) })
    i = j
  }
  return out
}

/**
 * @typedef {{ s: number, e: number, text: string, role?: 'text' | 'link' | 'twin' | 'expand', at?: string,
 *   html?: boolean }} Edit
 *   One splice of a record. `role`: new words (`text`), a link's href that follows them (`link`), a
 *   toggle's twin attribute (`twin`), or a `<!-- wp:pattern -->` replaced by the pattern it renders
 *   (`expand`); `at`: the place the words were found at; `html`: the words sit in HTML text, so the
 *   element around them may carry a link or twins that must follow.
 * @typedef {{ store: Store, before: string, after: string, edits: Edit[], expect: string[],
 *   carries?: string[] }} StoreWrite
 *   `carries`: the pattern stores whose words this write expands into its record ({@link expandPatterns}).
 */

/** A link's new href, written into its double-quoted attribute. @param {string} href */
const encodeHref = (href) => href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** What a visitor reads of raw markup: tags removed, entities decoded, spaces collapsed. @param {string} s */
const visibleOf = (s) => decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim()

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
 * @typedef {{ name: string, lt: number, open: number, close: number,
 *   href: { at: [number, number], value: string } | null,
 *   twins: { at: [number, number], name: string, value: string }[] }} Carrier
 *   An element that carries its own text a second time: a `tel:`/`mailto:` link (its href) or an
 *   element with `data-text-*` attributes (the theme toggle's `data-text-dark="Dark"`, which its
 *   script writes back on every switch). `open`/`close`: the raw span of its content.
 */

/**
 * Every {@link Carrier} of a stored body, its content span found by pairing tags the way the body
 * nests them (a void or self-closed tag never opens; a block comment is skipped whole).
 * @param {string} raw
 * @returns {Carrier[]}
 */
function carriersOf(raw) {
  /** @type {{ name: string, lt: number, open: number, tag: string }[]} */
  const stack = []
  /** @type {Carrier[]} */
  const out = []
  let i = raw.indexOf('<')
  while (i !== -1) {
    const t = markupAt(raw, i)
    if (t.kind !== 'tag') {
      i = raw.indexOf('<', t.kind === 'skip' ? t.end : i + 1)
      continue
    }
    if (!t.close) {
      if (!VOID_TAGS.has(t.name) && !t.selfClosed)
        stack.push({ name: t.name, lt: i, open: t.end, tag: raw.slice(i, t.end) })
    } else {
      let k = stack.length - 1
      while (k >= 0 && stack[k].name !== t.name) k -= 1
      if (k >= 0) {
        const el = stack[k]
        stack.length = k
        const href = el.name === 'a' ? /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(el.tag) : null
        const value = href ? (href[1] ?? href[2] ?? '') : ''
        const twins = [...el.tag.matchAll(/\s(data-text-[a-z0-9-]+)\s*=\s*"([^"]*)"/gi)].map((m) => {
          const vs = el.lt + /** @type {number} */ (m.index) + m[0].length - m[2].length - 1
          return { at: /** @type {[number, number]} */ ([vs, vs + m[2].length]), name: m[1], value: m[2] }
        })
        const follows = href !== null && /^\s*(tel|mailto):/i.test(decodeEntities(value))
        if (follows || twins.length > 0) {
          const vs = href ? el.lt + /** @type {number} */ (href.index) + href[0].length - value.length - 1 : 0
          out.push({
            name: el.name,
            lt: el.lt,
            open: el.open,
            close: i,
            href: follows ? { at: [vs, vs + value.length], value: decodeEntities(value) } : null,
            twins
          })
        }
      }
    }
    i = raw.indexOf('<', t.end)
  }
  return out
}

/**
 * The links and toggle twins that follow the new words of one record (F3 §5.7 companions).
 *
 * 🔒 DECIDED ON THE ELEMENT'S WHOLE TEXT, BEFORE AND AFTER — NEVER ON THE NARROWED WORDS. The change is
 * narrowed to the words that differ ("8 800 550-67-89" → "8 800 550-67-00" writes only "550-67-00"),
 * so the narrowed words are not the link's text, and the link kept dialling the old number: measured
 * with `{find:"8 800 550-67-89", replace:"8 800 550-67-00", all:true}` — both parts written as
 * `<a href="tel:+78005506789">8 800 550-67-00</a>`, answered ok with no companion (review of P10,
 * 25/09). The same held a two-word toggle label ("Dark mode" → "Night mode"): its `data-text-*` kept
 * the old words, and the theme script wrote them back on the next switch.
 * @param {string} raw
 * @param {readonly Edit[]} edits - this record's edits.
 * @returns {{ edits: Edit[], companions: Record<string, unknown>[] }}
 */
function followMarkup(raw, edits) {
  const words = edits.filter((x) => x.role === 'text' && x.html === true)
  /** @type {Edit[]} */
  const out = []
  /** @type {Record<string, unknown>[]} */
  const companions = []
  if (words.length === 0) return { edits: out, companions }
  for (const el of carriersOf(raw)) {
    const inside = words.filter((x) => x.s >= el.open && x.e <= el.close)
    if (inside.length === 0) continue
    const content = raw.slice(el.open, el.close)
    /** @type {string} */
    let changed
    try {
      changed = spliceEdits(
        content,
        inside.map((x) => ({ s: x.s - el.open, e: x.e - el.open, text: x.text }))
      )
    } catch {
      continue // overlapping edits: the record's own splice refuses the call
    }
    const before = visibleOf(content)
    const after = visibleOf(changed)
    if (before === after) continue
    const at = inside[0].at ?? ''
    const hrefAt = el.href?.at
    if (el.href && hrefAt && !edits.some((x) => x.role === 'link' && x.s < hrefAt[1] && x.e > hrefAt[0])) {
      const tel = /^\s*tel:/i.test(el.href.value)
      const was = factIn(before, tel) ?? before
      const now = factIn(after, tel) ?? after
      // Only the typography changed (a hyphen for a non-breaking one): the link dials the same number
      // and is left byte for byte — `followLink` would respell `tel:+7…` in the local form.
      const same = tel
        ? was.replace(/\D/g, '') === now.replace(/\D/g, '')
        : foldForMatch(was) === foldForMatch(now)
      const href = same ? null : followLink(el.href.value, was, now)
      if (href !== null && href !== el.href.value.trim()) {
        out.push({ s: hrefAt[0], e: hrefAt[1], text: encodeHref(href), role: 'link' })
        companions.push({
          at,
          before: el.href.value,
          after: href,
          why: wpText(/^tel:/i.test(href) ? 'linkPhone' : 'linkEmail')
        })
      }
    }
    if (after === '') continue
    for (const twin of el.twins) {
      if (foldForMatch(decodeEntities(twin.value)) !== foldForMatch(before)) continue
      out.push({ s: twin.at[0], e: twin.at[1], text: encodeFor('attr', after), role: 'twin' })
      companions.push({
        at: `${at}@${twin.name}`,
        before: decodeEntities(twin.value),
        after,
        why: wpText('toggleTwin')
      })
    }
  }
  return { edits: out, companions }
}

/**
 * The one phone number (or e-mail address) a link's text holds beside other words ("Call 8 800
 * 550-67-89"), each checked with the core's own test; null when there is none or more than one.
 * @param {string} text
 * @param {boolean} tel
 */
function factIn(text, tel) {
  if (tel ? isPhone(text) : isEmail(text)) return text.trim()
  const found = [...text.matchAll(tel ? PHONE_IN : EMAIL_IN)]
    .map((m) => m[0])
    .filter((f) => (tel ? isPhone(f) : isEmail(f)))
  return found.length === 1 ? found[0] : null
}

/**
 * Do two digit runs dial the same number? Equal, or equal once a national trunk prefix (`0`, `8`) on
 * one side meets a country code (1–3 digits) or nothing on the other, with at least seven digits in
 * common: `8 800 550-67-89` is `tel:+78005506789`, `0909 123 456` is `tel:+84909123456`. Two area
 * codes (`495…` against `812…`) never pass.
 * @param {string} a
 * @param {string} b
 */
function sameNumber(a, b) {
  if (a === b) return a.length >= 7
  let k = 0
  while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k += 1
  if (k < 7) return false
  const ha = a.slice(0, a.length - k)
  const hb = b.slice(0, b.length - k)
  const trunk = (/** @type {string} */ h) => h === '' || h === '0' || h === '8'
  const country = (/** @type {string} */ h) => /^[1-9]\d{0,2}$/.test(h)
  return (trunk(ha) && (trunk(hb) || country(hb))) || (trunk(hb) && country(ha))
}

/**
 * The href a changed phone number or e-mail address carries with it, or null (`followHref` in the
 * core, which compares digits exactly).
 *
 * 🔒 THE LINK DIALS THE NUMBER IN ITS INTERNATIONAL FORM, THE PAGE SHOWS THE LOCAL ONE. Measured on
 * ja-business WordPress (header and footer parts): `<a href="tel:+78005506789">8 800 550-67-89</a>` —
 * `7` is the country code, `8` the trunk prefix, so the exact-digits rule left both links dialling the
 * old number after the hotline changed (the F3 prototype had followed them).
 *
 * 🔒 A NEW NUMBER WRITTEN THE WAY THE OLD ONE WAS KEEPS THE LINK'S INTERNATIONAL FORM. The hotline's
 * last digits changing (`8 800 550-67-89` → `8 800 550-67-00`) dials `tel:+78005506700`, as the link
 * did before; only a number of another shape (`0909 123 456`, another length or trunk) is linked as
 * written, since its country cannot be read off the old link.
 * @param {string} href
 * @param {string} find
 * @param {string} replace
 */
export function followLink(href, find, replace) {
  const exact = followHref(href, find, replace)
  if (exact !== null) return exact
  const h = href.trim()
  if (!/^tel:/i.test(h) || !isPhone(find) || !isPhone(replace)) return null
  const hd = dialDigits(h)
  const fd = dialDigits(find)
  const rd = dialDigits(replace)
  if (!sameNumber(hd, fd)) return null
  let k = 0
  while (k < hd.length && k < fd.length && hd[hd.length - 1 - k] === fd[fd.length - 1 - k]) k += 1
  const country = hd.slice(0, hd.length - k)
  const trunk = fd.slice(0, fd.length - k)
  if (
    /^\s*tel:\s*\+/i.test(h) &&
    /^[1-9]\d{0,2}$/.test(country) &&
    (trunk === '0' || trunk === '8') &&
    !replace.trim().startsWith('+') &&
    rd.length === fd.length &&
    rd.startsWith(trunk)
  )
    return `tel:+${country}${rd.slice(trunk.length)}`
  return `tel:${replace.trim().startsWith('+') ? '+' : ''}${rd}`
}

/**
 * `glyph` arrows the template prints beside the words are not stored, so the same arrows on the new
 * words are left out (`plainReplace` in the core, which is not exported).
 * @param {string} replace
 * @param {{ lead: string, trail: string } | null} glyph
 */
function withoutGlyph(replace, glyph) {
  if (!glyph) return replace
  let r = replace
  if (glyph.trail && r.endsWith(glyph.trail)) r = r.slice(0, -glyph.trail.length).trimEnd()
  if (glyph.lead && r.startsWith(glyph.lead)) r = r.slice(glyph.lead.length).trimStart()
  return r
}

/** The core's split phrasing (`splitBy` is not exported). @param {string} by */
const splitPhrase = (by) =>
  ({
    'line-break': 'at the line break',
    dash: 'at the dash',
    comma: 'at the comma',
    colon: 'at the colon',
    words: 'between words',
    'one-line': 'onto line 1'
  })[by] ?? by

/**
 * Every record one call writes: each located place turned into a raw edit of its record, the links and
 * toggle twins that follow, then the proof. Nothing is written here.
 *
 * `stored`: per place whose change is typography alone, its stored characters and the new ones — the
 * folded view reads the same on both sides, so the receipt shows these instead ({@link typographyWould}).
 *
 * A unit that prints identity tokens (`ctx.identity`) is written by {@link tokenSpan}'s rule: never a
 * splice into a token, a token kept where the new words still show its value, a name the line drops
 * said in the notes (`tokenLine`), and a contact fact or a value itself answered with the identity's
 * door ({@link identityAnswer}).
 * @param {readonly Located[]} results
 * @param {Map<string, Store>} storeById
 * @param {{ identity?: Identity | null, contractDoor?: boolean }} [ctx]
 * @returns {{ ok: true, writes: StoreWrite[], companions: Record<string, unknown>[], notes: string[],
 *   stored: Map<string, { before: string, after: string }> } | ReturnType<typeof refuse>}
 */
export function rewriteRecords(results, storeById, ctx = {}) {
  /** @type {Map<string, { store: Store, edits: Edit[], expect: string[] }>} */
  const byStore = new Map()
  /** @type {Record<string, unknown>[]} */
  const companions = []
  /** @type {string[]} */
  const notes = []
  /** @type {Set<string>} */
  const dropped = new Set()
  /** @type {Map<string, { before: string, after: string }>} */
  const stored = new Map()
  for (const r of results) {
    const text = withoutGlyph(r.change.replace, r.glyph)
    for (const t of r.targets) {
      if (t.kind !== 'unit') continue
      const u = /** @type {any} */ (t.unit)
      const store = storeById.get(u.store)
      if (!store) continue
      let slot = byStore.get(store.id)
      if (!slot) byStore.set(store.id, (slot = { store, edits: [], expect: [] }))
      const kind = /** @type {UnitKind} */ (u.unitKind)
      if ((kind === 'cf7-label' || kind === 'cf7-option') && /[[\]]/.test(text))
        return refuse(
          'VALUE_NOT_ALLOWED',
          wpText('bracketError', { replace: r.change.replace }),
          wpText('bracketNext'),
          { rule: 'cf7-bracket', at: t.at }
        )
      /**
       * This place's new words, marked so {@link followMarkup} can find the link or toggle around
       * them: only HTML text carries either.
       * @param {Edit} x
       * @returns {Edit}
       */
      const words = (x) => ({ ...x, role: 'text', html: kind === 'html', at: t.at })
      for (const h of t.hits) {
        // An accent-blind hit is written only as the whole unit (the core's rule).
        const [a, b] = h.mode === 'bare' ? [0, u.cased.length] : [h.a, h.b]
        const oldText = u.cased.slice(a, b)
        /** @type {TokenSpan[] | null} */
        const tokens = ctx.identity && Array.isArray(u.tokens) && u.tokens.length > 0 ? u.tokens : null
        // Words inside one token's value (a place the model named with `at`): the identity's own door.
        const inner = tokens && h.mode !== 'bare' ? tokens.find((x) => x.xs <= a && b <= x.xe) : undefined
        if (inner && ctx.identity)
          return identityAnswer({
            find: r.change.find,
            token: inner.name,
            current: inner.value,
            value: `${inner.value.slice(0, a - inner.xs)}${text}${inner.value.slice(b - inner.xs)}`.trim(),
            contractDoor: ctx.contractDoor === true,
            identity: ctx.identity,
            where: store.label
          })
        const touchesToken = tokens !== null && tokens.some((x) => x.xs < b && a < x.xe)
        // 🔒 ONLY THE TYPOGRAPHY DIFFERS (a hyphen for an en dash, straight quotes for curly ones):
        // the folded views are equal, so the word diff below would find nothing and send the record
        // back byte for byte, claiming a change. Measured on footer part 81 ("Mon–Fri, 9:00–18:00").
        if (h.mode !== 'bare' && !touchesToken && oldText === views(text, { decode: false }).cased) {
          slot.edits.push(...typographyEdits(store.raw, u, a, b, text, kind).map(words))
          // The receipt's `before` is the folded view, equal to `after` here: it shows the stored
          // characters instead, so "before → after" reads as the change it is.
          stored.set(t.at, {
            before: storedText(store.raw, u, a, b, kind),
            after: text.replace(/\s*\n\s*/g, ' ')
          })
          continue
        }
        // 🔒 A HEADING ON TWO LINES (`A <br><em>B</em>`) REPLACED WHOLE KEEPS ITS TWO LINES (D13),
        // whatever words the old and new headings share: the split is made on the WHOLE unit, before
        // any narrowing, as Joomla and EmDash split theirs. Narrowing first made the result depend on
        // the first word — measured on post 42's hero H1: "Built for the way you work" was split, while
        // "Building the future of Vietnamese industry" (sharing "Building") was written on one line
        // with `<br><em>` dropped. A line the split leaves as it was keeps its stored bytes.
        if (kind === 'html' && h.whole && u.breaks === 1 && tokens === null) {
          const split = splitEdit(store.raw, rawSpan(u, { ...h, mode: 'text', a, b }), text, u)
          if (split) {
            slot.edits.push(...split.edits.map(words))
            slot.expect.push(
              ...[split.a, split.b].filter(Boolean).map((x) => views(x, { decode: false }).cased)
            )
            notes.push(replaceText('splitNote', { by: splitPhrase(split.by), a: split.a, b: split.b }))
            continue
          }
        }
        const narrowed = narrowChange(oldText, text)
        let ra = a + narrowed.p
        let rb = b - narrowed.q
        let mid = narrowed.mid
        if (tokens !== null && ctx.identity) {
          const ts = tokenSpan({ cased: u.cased, tokens }, ra, rb, mid)
          if (!ts.ok)
            return identityAnswer({
              find: r.change.find,
              token: ts.token,
              current: tokens.find((x) => x.name === ts.token)?.value ?? '',
              value: ts.value,
              contractDoor: ctx.contractDoor === true,
              identity: ctx.identity,
              where: store.label
            })
          ra = ts.ra
          rb = ts.rb
          mid = ts.mid
          for (const name of ts.dropped)
            notes.push(wpText('tokenLine', { what: store.label, field: labelOf(name) }))
        }
        const oldMid = u.cased.slice(ra, rb)
        const newFlat = views(mid, { decode: false }).cased
        if (newFlat !== '') slot.expect.push(newFlat)
        /** @type {[number, number]} */
        let span
        if (oldMid === '') {
          // Only new words: inserted after the kept start (or before the kept end).
          const at = ra > a ? u.map[ra - 1][1] : u.map[a][0]
          span = [at, at]
        } else span = rawSpan(u, { ...h, mode: 'text', a: ra, b: rb })
        const inside = store.raw.slice(span[0], span[1])
        if (kind === 'html' || kind === 'cf7-label') {
          if (/[<>]/.test(inside)) {
            const [S, E] = balanceSpan(store.raw, span[0], span[1])
            const crossed = [...store.raw.slice(S, E).matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) =>
              m[1].toLowerCase()
            )
            // 🔒 A LINK IS FUNCTION, NOT STYLING. "Hotline: 8 800 550-67-89" → "Call us: 0909 123 456"
            // crossed the `<a href="tel:…">` and dropped it: the new number stood as plain text. Only
            // styling is dropped with a note; across anything else the fact goes into its link, or the
            // call is refused with the two finds that change each part in place.
            const kept = [...new Set(crossed.filter((tag) => !DROPPABLE_TAGS.has(tag)))]
            if (kept.length > 0) {
              const seg = factIntoLink(store.raw, u, ra, rb, mid, kind)
              if (seg && !('runs' in seg)) {
                slot.edits.push(...seg.edits)
                if (seg.companion) companions.push({ at: t.at, ...seg.companion })
                continue
              }
              const runs = seg && 'runs' in seg ? seg.runs : [oldMid, '']
              return refuse(
                'VALUE_NOT_ALLOWED',
                wpText('marksError', { find: r.change.find, tags: kept.join(' ') }),
                wpText('marksNext', { a: runs[0] ?? '', b: runs[1] ?? '' }),
                { rule: 'split-across-marks', at: t.at }
              )
            }
            for (const tag of crossed) dropped.add(tag)
            slot.edits.push(
              words({
                s: S,
                e: E,
                text:
                  stripTags(store.raw.slice(S, span[0])) +
                  encodeFor(kind, mid) +
                  stripTags(store.raw.slice(span[1], E))
              })
            )
            continue
          }
        }
        // The link that dials the number and the toggle's twins follow once the record's edits are
        // all known (`followMarkup`): decided on the whole element's text, never on `mid`.
        slot.edits.push(words({ s: span[0], e: span[1], text: encodeFor(kind, mid) }))
      }
    }
  }
  if (dropped.size > 0) notes.push(wpText('markupDropped', { tags: [...dropped].join(' ') }))

  /** @type {StoreWrite[]} */
  const writes = []
  for (const { store, edits: own, expect } of byStore.values()) {
    const placed = own.filter(
      (x, k) => own.findIndex((y) => y.s === x.s && y.e === x.e && y.text === x.text) === k
    )
    const follow = followMarkup(store.raw, placed)
    companions.push(...follow.companions)
    const unique = [...placed, ...follow.edits]
    /** @type {string} */
    let after
    try {
      after = spliceEdits(store.raw, unique)
    } catch {
      return refuse('VALUE_NOT_ALLOWED', wpText('markupError', { what: store.label }), wpText('markupNext'), {
        rule: 'would-break-markup'
      })
    }
    const proof = proveRewrite(store, after, expect, unique)
    if (proof !== null)
      return refuse('VALUE_NOT_ALLOWED', wpText('markupError', { what: store.label }), wpText('markupNext'), {
        rule: 'would-break-markup',
        ...proof
      })
    writes.push({ store, before: store.raw, after, edits: unique, expect })
  }
  const expanded = /** @type {any} */ (expandPatterns(writes, storeById))
  if (!expanded.ok) return expanded
  for (const x of expanded.writes)
    if ((x.store.kind === 'templatePart' || x.store.kind === 'template') && x.store.stored === false)
      notes.push(wpText('themeFileCopied', { what: x.store.label }))
  // 🔒 A SYNCED PATTERN IS EVERY PAGE THAT USES IT (20/10/2026), on any site, one language or many: staff
  // on real customer sites, "when Tracy fixes one place it often breaks another place". Its body renders
  // wherever a `core/block` names it, and the receipt said nothing of the other pages.
  for (const x of expanded.writes)
    if (x.store.kind === 'template') notes.push(wpText('templateShared', { what: x.store.label }))
    else if (typeof x.store.id === 'string' && x.store.id.startsWith('block:'))
      notes.push(wpText('blockShared', { what: x.store.label }))
  notes.push(...expanded.notes)
  return { ok: true, writes: expanded.writes, companions, notes, stored }
}

/**
 * 🔒 A THEME PATTERN IS CHANGED WHERE IT IS INSERTED, AS THE BLOCK EDITOR CHANGES IT. A pattern has
 * no record: `<!-- wp:pattern {"slug"} /-->` renders the theme's PHP, and the editor, on save,
 * replaces that line with the pattern's blocks — from then on the words are the page's own. Each
 * pattern write (its words already spliced and proven against the pattern's content) becomes one
 * `expand` edit of its host: the reference's exact bytes replaced by the edited pattern. The host is
 * proven again — every byte outside its edits unchanged, its block count grown by exactly what the
 * pattern brought, WordPress's grammar still reading every comment — and the pattern write is dropped:
 * the host's `content.update` carries it, and that write's undo puts the one line back.
 * @param {StoreWrite[]} writes
 * @param {Map<string, Store>} storeById
 * @returns {{ ok: true, writes: StoreWrite[], notes: string[] } | ReturnType<typeof refuse>}
 */
export function expandPatterns(writes, storeById) {
  const patterns = writes.filter((x) => x.store.kind === 'pattern')
  if (patterns.length === 0) return { ok: true, writes, notes: [] }
  /** @type {StoreWrite[]} */
  const out = writes.filter((x) => x.store.kind !== 'pattern')
  /** @type {Map<string, number>} */
  const grown = new Map()
  /** @type {Set<string>} */
  const titles = new Set()
  for (const w of patterns) {
    const host = w.store.host ? storeById.get(w.store.host) : undefined
    const span = w.store.refSpan
    if (!host || !span)
      return refuse(
        'VALUE_NOT_ALLOWED',
        wpText('markupError', { what: w.store.label }),
        wpText('markupNext'),
        {
          rule: 'pattern-without-host'
        }
      )
    let hw = out.find((x) => x.store.id === host.id)
    if (!hw) {
      hw = { store: host, before: host.raw, after: host.raw, edits: [], expect: [] }
      out.push(hw)
    }
    hw.edits = [...hw.edits, { s: span[0], e: span[1], text: w.after, role: 'expand' }]
    hw.expect = [...hw.expect, ...w.expect]
    hw.carries = [...(hw.carries ?? []), w.store.id]
    grown.set(host.id, (grown.get(host.id) ?? 0) + parseBlocks(w.after).length - 1)
    titles.add(String(w.store.title ?? w.store.label))
  }
  for (const hw of out) {
    if (!grown.has(hw.store.id)) continue
    try {
      hw.after = spliceEdits(hw.store.raw, hw.edits)
    } catch {
      return refuse(
        'VALUE_NOT_ALLOWED',
        wpText('markupError', { what: hw.store.label }),
        wpText('markupNext'),
        {
          rule: 'would-break-markup'
        }
      )
    }
    const proof = proveRewrite(hw.store, hw.after, hw.expect, hw.edits, grown.get(hw.store.id) ?? 0)
    if (proof !== null)
      return refuse(
        'VALUE_NOT_ALLOWED',
        wpText('markupError', { what: hw.store.label }),
        wpText('markupNext'),
        {
          rule: 'would-break-markup',
          ...proof
        }
      )
  }
  return {
    ok: true,
    writes: out,
    notes: [...titles].map((title) => wpText('patternExpanded', { what: title.slice(0, 40) }))
  }
}

/**
 * The words of view span `[a, b)` of a unit as the record stores them — its own dashes, quotes and
 * spaces, not the folded view the matcher reads.
 * @param {string} raw
 * @param {any} u - the stored unit
 * @param {number} a
 * @param {number} b
 * @param {UnitKind} kind
 */
function storedText(raw, u, a, b, kind) {
  const bytes = raw.slice(u.map[a][0], u.map[b - 1][1])
  return kind === 'json' ? storedChars(bytes, kind) : decodeEntities(stripTags(bytes))
}

/**
 * The two-line heading split (D13) inside one WordPress unit: `A <br><TAG …>B</TAG>` (the hero H1,
 * `Building the groundwork for <br><em>next-generation plants</em>`) replaced whole is written as
 * `a <br><TAG …>b</TAG>` with `splitTwoLines`; a one-word or one-line result drops the second line.
 * Null when the span is not that shape.
 * @param {string} raw
 * @param {[number, number]} span
 * @param {string} replace
 * @param {any} unit
 * @returns {{ edits: Edit[], by: string, a: string, b: string } | null}
 */
function splitEdit(raw, span, replace, unit) {
  if (unit.breaks !== 1) return null
  const [S, E] = balanceSpan(raw, span[0], span[1])
  const inner = raw.slice(S, E)
  const m = /^([^<>]*?)(\s*<br\s*\/?>\s*(?:<([a-z][a-z0-9]*)\b[^>]*>)?)([^<>]*?)((?:<\/\3>)?)$/i.exec(inner)
  if (!m || (m[3] && !m[5])) return null
  const oldA = decodeEntities(m[1]).trim()
  const oldB = decodeEntities(m[4]).trim()
  if (!oldA || !oldB) return null
  const split = splitTwoLines(replace, oldA, oldB, { mustKeepTwo: false })
  if (!split.ok) return null
  if (split.b === '')
    return { edits: [{ s: S, e: E, text: escapeHtmlText(split.a) }], by: split.by, a: split.a, b: '' }
  return {
    edits: [{ s: S, e: E, text: `${escapeHtmlText(split.a)}${m[2]}${escapeHtmlText(split.b)}${m[5]}` }],
    by: split.by,
    a: split.a,
    b: split.b
  }
}

/**
 * `raw` with every edit applied right to left. Overlapping edits throw: never half-applied.
 * @param {string} raw
 * @param {readonly Edit[]} edits
 */
function spliceEdits(raw, edits) {
  const sorted = [...edits].sort((x, y) => y.s - x.s || y.e - x.e)
  for (let k = 1; k < sorted.length; k += 1)
    if (sorted[k].e > sorted[k - 1].s) throw new Error('overlapping edits')
  let out = raw
  for (const { s, e, text } of sorted) out = out.slice(0, s) + text + out.slice(e)
  return out
}

/**
 * The proof a rewritten record must pass before it is sent (F3 §5.7): every byte outside the edits is
 * the byte that was read; its block delimiters are as many as before and each one's attributes still
 * parse (no worse than before); WordPress's grammar reads every block comment (`blockMarkupProblem`,
 * the body guard's own check); and each change's new words are inside a unit of the re-parsed record.
 * Null when it passes, else what failed.
 * @param {Pick<Store, 'shape' | 'raw'>} store
 * @param {string} after
 * @param {readonly string[]} expect - the new words, folded.
 * @param {readonly Edit[] | null} [edits] - the edits `after` was made with.
 * @param {number} [grown] - block delimiters an expanded pattern adds ({@link expandPatterns}).
 * @returns {Record<string, unknown> | null}
 */
export function proveRewrite(store, after, expect, edits = null, grown = 0) {
  if (edits !== null && !outsideSame(store.raw, after, edits)) return { found: 'bytes outside the change' }
  if (store.shape === 'blocks') {
    const before = parseBlocks(store.raw)
    const now = parseBlocks(after)
    if (now.length !== before.length + grown)
      return { found: 'block count', was: before.length + grown, now: now.length }
    if (now.filter((d) => !d.attrsOk).length > before.filter((d) => !d.attrsOk).length)
      return { found: 'block attributes' }
    if (blockMarkupProblem(store.raw) === null) {
      const problem = blockMarkupProblem(after)
      if (problem !== null) return { found: 'block comment', near: problem.found.slice(0, 60) }
    }
  }
  if (expect.length > 0) {
    const text = storeUnits(store.shape, after)
      .map((u) => u.lower)
      .join('\n')
    for (const w of expect)
      if (!text.includes(foldForMatch(w)))
        return { found: 'new words not readable', words: clip(w, 0, 0, 60) }
  }
  return null
}

/**
 * Is `after` exactly `raw` with `edits` applied — every byte outside the edits unchanged?
 * @param {string} raw
 * @param {string} after
 * @param {readonly Edit[]} edits
 */
function outsideSame(raw, after, edits) {
  let r = 0
  let a = 0
  for (const { s, e, text } of [...edits].sort((x, y) => x.s - y.s)) {
    if (s < r) return false
    const keep = raw.slice(r, s)
    if (
      after.slice(a, a + keep.length) !== keep ||
      after.slice(a + keep.length, a + keep.length + text.length) !== text
    )
      return false
    a += keep.length + text.length
    r = e
  }
  return after.slice(a) === raw.slice(r)
}

// ── Locate ───────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ ok: true, plan: ReplacePlan, page: PageFacts | null, set: ReadSet, results: Located[],
 *   storeById: Map<string, Store>, contractDoor: boolean }} WordPressPlan
 */

/**
 * How far a site-wide search reached, said only when it stopped at its cap (F3 critique: "note only
 * when true"): the component counts no total (`no_found_rows`), so the answer names what was read.
 * @param {ReadSet} set
 * @returns {{ scanned?: number, notReached?: string }}
 */
const scannedOf = (set) =>
  set.capped ? { scanned: set.scanned, notReached: wpText('siteCapped', { n: set.scanned }) } : {}

/**
 * @param {Record<string, unknown>} answer
 * @param {ReadSet} set
 */
const withScanned = (answer, set) => (set.capped ? { ...answer, ...scannedOf(set) } : answer)

/**
 * The query items (`post-N`) and category links (`cat-item-N`) the words' own occurrences sit in.
 *
 * 🔒 READ PAST THE PAGE-WIDE CAP. `pageFactsOf` keeps the first {@link PAGE_RECORDS_MAX} of each in
 * page order (header menus, sidebars and cards before the item meant), so the 13th post card of a
 * blog page was never read and its title answered "words the theme prints" — a false NOT_EDITABLE.
 * The records an occurrence of the words names are read whatever their place, up to the same cap.
 * @param {PageFacts} page
 * @param {ReplacePlan} plan
 * @returns {{ posts: number[], cats: number[] }}
 */
function namedBy(page, plan) {
  /** @type {Set<number>} */
  const posts = new Set()
  /** @type {Set<number>} */
  const cats = new Set()
  for (const c of plan.changes)
    for (const occ of matchUnits(page.units, c.find).hits)
      for (const el of occ.unit.chainAt(occ.a))
        for (const t of el.cls.split(/\s+/)) {
          const p = /^post-(\d+)$/.exec(t)?.[1]
          if (p && !page.posts.includes(Number(p)) && posts.size < PAGE_RECORDS_MAX) posts.add(Number(p))
          const k = /^cat-item-(\d+)$/.exec(t)?.[1]
          if (k && !page.cats.includes(Number(k)) && cats.size < PAGE_RECORDS_MAX) cats.add(Number(k))
        }
  return { posts: [...posts], cats: [...cats] }
}

/** Language pages read to answer one NOT_FOUND, at most (a site can serve 40); eight at a time. */
const LANGUAGE_PAGES_MAX = 45
const LANGUAGE_PAGES_BATCH = 8

/**
 * 🔒 A NOT_FOUND whose words sit on another language's page names that page (Joomla's `elsewhere`,
 * ported). Measured on the v6 bench (WP L1-02, 63 s against Joomla's 28): Russian words quoted
 * from the English home were answered "not on this page or in its content". The component lists only
 * the default language's records, so the other languages are read the way visitors are served them:
 * the page's `hreflang` alternates, once, only on a NOT_FOUND. The answer names the page (`path`);
 * nothing is written, and the choice of language stays with the customer's words.
 * @param {ReplacePlan} plan
 * @param {PageFacts} page
 * @param {Record<string, unknown>} refusal
 * @param {(path: string) => Promise<any>} pageHtml
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function inAnotherLanguage(plan, page, refusal, pageHtml) {
  if (refusal.code !== 'NOT_FOUND' || plan.at !== null || plan.all === true) return null
  const change = plan.changes[typeof refusal.change === 'number' ? refusal.change : 0]
  if (!change || refusal.error !== replaceText('notFoundError', { find: change.find })) return null
  const own = plan.path.replace(/[?#].*$/, '')
  const list = page.alternatePaths
    .filter((a) => a.path !== own && a.code.split('-')[0] !== page.lang?.split('-')[0])
    .slice(0, LANGUAGE_PAGES_MAX)
  /** @type {string[]} */
  const found = []
  for (let i = 0; i < list.length && found.length === 0; i += LANGUAGE_PAGES_BATCH) {
    const batch = await Promise.all(
      list.slice(i, i + LANGUAGE_PAGES_BATCH).map(async (a) => {
        try {
          const got = await pageHtml(a.path)
          if (!isRecord(got) || got.ok !== true || typeof got.html !== 'string') return null
          const hits = matchUnits(renderedUnits(got.html).units, change.find).hits
          return hits.some((h) => h.mode !== 'bare' && (h.whole || h.caseExact)) ? a.path : null
        } catch {
          return null
        }
      })
    )
    found.push(...batch.filter((x) => x !== null))
  }
  if (found.length === 0) return null
  const pages = found.slice(0, 2)
  return refuse(
    'NOT_FOUND',
    replaceText('otherLanguageError', { page: pages.join(', ') }),
    replaceText(pages.length === 1 ? 'otherLanguageNext' : 'notHereNext', {
      page: pages.length === 1 ? pages[0] : '<the page meant>'
    }),
    { find: change.find, pages }
  )
}

/**
 * The key a located refusal carries its rendered-words road under: never serialised, so an answer
 * that is not taken down the road reads as it always did.
 */
const RENDERED = Symbol('renderedWords')

/**
 * A call whose words are partly in records and partly printed by the theme at render time.
 * @param {readonly import('./replace.mjs').ReplaceChange[]} rendered - the theme-printed ones
 */
function mixedRefusal(rendered) {
  const finds = rendered.map((c) => `"${c.find.length > 40 ? `${c.find.slice(0, 39)}…` : c.find}"`)
  return refuse(
    'BAD_PARAMS',
    RENDERED_TEXT.mixedError,
    renderedText('mixedNext', { find: finds.slice(0, 3).join(', ') }),
    {
      rule: 'mixed-stores'
    }
  )
}

/**
 * A NOT_EDITABLE whose every reason is words left on the theme (its file, its words, or words no
 * record read here traced) — the one answer a read of the theme's templates can change.
 * @param {Record<string, unknown>} refusal
 */
function isThemeWords(refusal) {
  const unchanged = Array.isArray(refusal.unchanged) ? refusal.unchanged : []
  return (
    refusal.code === 'NOT_EDITABLE' &&
    unchanged.length > 0 &&
    unchanged.every(
      (u) =>
        isRecord(u) &&
        typeof u.why === 'string' &&
        (u.why === WHY.themeFile || u.why === WHY.theme || u.why.startsWith(WHY.untraced('')))
    )
  )
}

/**
 * A refusal whose every reason is the generic "the theme prints these words" — {@link WHY} `theme` on
 * a theme {@link WP_THEME_STORES} knows, its untraced twin on one it does not — and no reason with a
 * road of its own (the theme's file, a form, a title, a menu, a record not read).
 * @param {Record<string, unknown>} refusal
 */
function isGenericThemeWords(refusal) {
  const unchanged = Array.isArray(refusal.unchanged) ? refusal.unchanged : []
  return (
    unchanged.length > 0 &&
    unchanged.every(
      (u) =>
        isRecord(u) &&
        typeof u.why === 'string' &&
        (u.why === WHY.theme || u.why.startsWith(WHY.untraced('')))
    )
  )
}

/**
 * Read the page and its records and locate every change of the call — nothing written.
 *
 * 🔒 WORDS AN IDENTITY TOKEN PRINTS ARE THE IDENTITY'S (tracy-business 1.2.0+). The footer part says
 * `©&nbsp;{site.legalName}` and the theme prints the option's value there; read as stored, the page's
 * "© Golden Crust Bakery" matched no record and the answer was "words the theme prints … that is an
 * answer" — measured on the D bench (05/10/2026), where the agent then spent six greps and 15k
 * characters of PHP to find the token (17 calls; Joomla's engine, which reads tokens, took 2). Units
 * now read each token as its value; words inside one value answer `SITE_IDENTITY` with the call that
 * sets it, and a line whose words run around a token is written by {@link tokenSpan}'s rule.
 * `contractDoor`: the site's surface has `content.contract` (`wordpress-contract`), the identity's door.
 * @param {{ plan: ReplacePlan, read: Door, pageHtml: (path: string) => Promise<any>,
 *   confirmed?: boolean, contractDoor?: boolean }} deps
 * @returns {Promise<WordPressPlan | Record<string, unknown>>}
 */
export async function locateOnWordPress(deps) {
  const whole = deps.plan
  // Link targets (`href:true`) are never in a text unit: the words are located alone, the links
  // checked against the records read, and both go down the rendered-words road or neither does.
  const hrefs = whole.changes.filter((c) => c.href === true)
  const plan = hrefs.length > 0 ? { ...whole, changes: whole.changes.filter((c) => c.href !== true) } : whole
  const contractDoor = deps.contractDoor === true
  const read = safe(deps.read)
  /** @type {PageFacts | null} */
  let page = null
  const got = await deps.pageHtml(plan.path)
  if (isRecord(got) && got.ok === true && typeof got.html === 'string')
    page = pageFactsOf(got.html, typeof got.status === 'number' ? got.status : 200)
  // Site scope: every page of the site, or the words are not on this one (or it could not be read).
  const shown = page ? page.units : []
  /** @param {string} find */
  const onThisPage = (find) =>
    matchUnits(shown, find).hits.length > 0 || matchUnits(page?.buttons ?? [], find).hits.length > 0
  const site =
    page === null ||
    plan.all === true ||
    (plan.all !== 'page' && plan.changes.some((c) => !onThisPage(c.find))) ||
    (plan.at ?? []).some((a) => {
      const id = Number(/^post:(\d+)/.exec(a)?.[1] ?? 0)
      return id > 0 && id !== page?.pageId && !page?.posts.includes(id)
    })
  // The site's own language, for words: a list row is in the default language (the component lists
  // only it), and words change in the page's language only (David's rule, 25/09).
  const lang = page?.defaultLang ?? null
  // A page that shows a token as typed is not rendered by a theme that fills them: read as stored.
  const tokensShown = page !== null && page.units.some((u) => hasIdentityToken(u.cased))
  /** @param {boolean} theme */
  const attempt = async (theme) => {
    const r = await readStores(read, page, { site, lang, theme, ...(page ? namedBy(page, plan) : {}) })
    if (!r.ok) return { answer: /** @type {Record<string, unknown>} */ (r.answer) }
    const { set } = r
    if (tokensShown) set.identity = null
    return { set, ...locateIn(set, plan) }
  }
  /**
   * Locate the changes of `plan` in a read set, nothing read again.
   * @param {ReadSet} set
   * @param {ReplacePlan} plan
   */
  const locateIn = (set, plan) => {
    /** @type {Map<string, string>} */
    const whyNext = new Map()
    const units = unitsOfStores(set.stores, set.identity)
    // Per change, the units whose every hit is inside a token's value stay out (`tokenHits`); with `at`
    // the model named its place, and the write's own rule answers it (`tokenSpan`).
    const inside = plan.changes.map((c) => tokenHits(units, c.find))
    /** @type {Map<any, TokenSpan>} */
    const left = new Map(inside.flatMap((x) => [...x.only]))
    const base = page ? anchorHooks(page, set, whyNext) : { pairs: () => [] }
    /** @type {import('./replace.mjs').LocateHooks} */
    const hooks =
      page && left.size > 0
        ? {
            ...base,
            why: (occ) => {
              for (const [u, t] of left)
                if (occ.unit.lower.includes(u.lower)) return WHY.identity(labelOf(t.name))
              return /** @type {any} */ (base).why(occ)
            }
          }
        : base
    const located = locateAll({
      plan,
      page: page ? { units: page.units, lang: page.lang } : null,
      stored:
        (plan.at !== null && plan.at !== undefined) || left.size === 0
          ? units
          : (_c, i) => units.filter((u) => !inside[i].only.has(u)),
      confirmed: deps.confirmed === true,
      mustKeepTwo: false,
      hooks
    })
    return { whyNext, located, inside }
  }
  const html = isRecord(got) && typeof got.html === 'string' ? got.html : ''
  // 🔒 THE RENDERED-WORDS ROAD ONLY ON A WHOLE, PLAIN SEARCH: one page with its record, nothing cut,
  // every menu traced, no site-wide or named-place call (`rendered-words.mjs`). The plugin keeps its
  // rules per page, so `all:true` (every page of the site) cannot be one of them: a rule for this page
  // would leave every other page that prints the words as it was while the receipt said "all".
  /** The first gate that closes the road for this read, or null when it is open. @param {ReadSet} set */
  const closedBy = (set) =>
    page === null || page.pageId === null
      ? 'record'
      : whole.all === true
        ? 'all'
        : whole.at !== null
          ? 'at'
          : set.navUnresolved
            ? 'menu'
            : set.capped
              ? 'capped'
              : null
  const roadOpen = (/** @type {ReadSet} */ set) => closedBy(set) === null
  /** Whether this page prints the words at all, as words (not a bare fragment). @param {string} find */
  const printedHere = (find) => {
    const m = matchUnits(page?.units ?? [], find)
    return m.mode !== 'bare' && m.hits.length > 0
  }
  /** Every place the page prints these words: the main region, outside forms, menus and hidden copies. @param {string} find */
  const inMain = (find) =>
    printedHere(find) &&
    matchUnits(page?.units ?? [], find).hits.every(
      (h) => h.unit.region === 'main' && !h.unit.inForm && !h.unit.inNav && !h.unit.hidden
    )
  /** The words of one find as the page prints them, each spelling once. @param {string} find */
  const spellings = (find) => [
    ...new Set(matchUnits(page?.units ?? [], find).hits.map((h) => h.unit.cased.slice(h.a, h.b)))
  ]
  /** @param {Record<string, unknown>} fallback @param {ReadSet} set */
  const rendered = (fallback, set) =>
    Object.assign(fallback, {
      [RENDERED]: { path: whole.path, changes: whole.changes, html, spellings, stores: set.stores }
    })
  /** A link target a record read here holds: that record's road, not this one. @param {ReadSet} set */
  const heldLink = (set) => {
    for (const c of hrefs) {
      const what = storeHoldingLink(set.stores, c.find)
      if (what !== null)
        return refuse(
          'NOT_EDITABLE',
          renderedText('hrefStoredError', { find: c.find, what }),
          renderedText('hrefStoredNext'),
          {
            find: c.find
          }
        )
    }
    return null
  }
  if (plan.changes.length === 0) {
    const missing = refuse(
      'NOT_FOUND',
      renderedText('hrefMissingError', { find: hrefs[0]?.find ?? '', path: whole.path }),
      renderedText('hrefMissingNext', { path: whole.path }),
      { find: hrefs[0]?.find ?? '' }
    )
    if (page === null) return missing
    const r = await readStores(read, page, { site: false, lang, theme: true })
    if (!r.ok) return withNext(/** @type {Record<string, unknown>} */ (r.answer))
    const held = heldLink(r.set)
    if (held) return held
    if (r.set.navUnresolved)
      return refuse(
        'NOT_EDITABLE',
        renderedText('hrefStoredError', { find: hrefs[0].find, what: 'a menu this call could not trace' }),
        wpText('menuNext')
      )
    return roadOpen(r.set) ? rendered(missing, r.set) : missing
  }
  let tried = await attempt(false)
  // 🔒 "THE THEME PRINTS THEM" ONLY AFTER THE THEME'S OWN TEMPLATES WERE READ. A block theme keeps
  // words in `templates/*.html` too, which the Site Editor overrides like a part; the narrow read
  // skips them (a dozen reads no ordinary edit needs), so words it leaves on the theme are read for
  // once more, with the templates, before that answer stands.
  if (page && 'located' in tried && !tried.located.ok && isThemeWords(tried.located)) {
    const wide = await attempt(true)
    if ('answer' in wide || wide.set.stores.some((st) => st.kind === 'template')) tried = wide
  }
  if ('answer' in tried)
    return /** @type {Record<string, unknown>} */ (
      withNext(/** @type {Record<string, unknown>} */ (tried.answer))
    )
  const { set, whyNext, located, inside } = tried
  if (!located.ok) {
    // Words inside an identity token's value: the identity's door, whatever the page around them.
    const ci = typeof located.change === 'number' ? located.change : 0
    const hit = inside[ci]?.first
    const why0 =
      located.code === 'NOT_EDITABLE' && Array.isArray(located.unchanged) ? located.unchanged[0]?.why : null
    if (
      hit &&
      set.identity !== null &&
      (located.code === 'NOT_FOUND' ||
        (typeof why0 === 'string' && why0 === WHY.identity(labelOf(hit.token.name))))
    ) {
      const change = plan.changes[ci]
      const t = hit.token
      return identityAnswer({
        find: change.find,
        token: t.name,
        current: t.value,
        value: `${t.value.slice(0, hit.a - t.xs)}${change.replace}${t.value.slice(hit.b - t.xs)}`.trim(),
        contractDoor,
        identity: set.identity,
        change: plan.changes.length > 1 ? ci : null,
        where: String(hit.unit.label ?? '')
      })
    }
    // A reason that names a record this call did not reach carries the road there, never the
    // core's "that is an answer" (`whyOf`).
    const first =
      located.code === 'NOT_EDITABLE' && Array.isArray(located.unchanged) ? located.unchanged[0] : null
    const next = isRecord(first) && typeof first.why === 'string' ? whyNext.get(first.why) : undefined
    const there = page ? await inAnotherLanguage(plan, page, located, deps.pageHtml) : null
    if (there) return there
    const fallback = withScanned(next ? { ...located, next } : located, set)
    if (page === null) return fallback
    // Each change on its own: in a record (the record's road), printed by the theme in the main region
    // (this road), printed by the theme elsewhere on the page, or neither (the answer above stands).
    // A call mixing record words and theme-printed words is refused whole, never halved.
    const verdicts = plan.changes.map((c) => {
      const one = plan.changes.length === 1 ? located : locateIn(set, { ...plan, changes: [c] }).located
      if (one.ok) return 'stored'
      if (!isThemeWords(one) || 'held' in one || !printedHere(c.find)) return 'neither'
      return inMain(c.find) ? 'rendered' : 'outside'
    })
    if (verdicts.includes('neither')) return fallback
    // Every change in a record on its own, refused together (a count to confirm, an overlap): the
    // search's answer is the whole answer, never a "mixed" refusal that names no words.
    if (verdicts.every((v) => v === 'stored')) return fallback
    // 🔒 THE ANSWER NAMES THE GATE THAT CLOSED THE ROAD (24/10/2026). Every closed road used to answer
    // with the store search's own "cannot replace them through a door yet", the very sentence a road
    // tried and failed gives: on wp-ja-restaurant's `/blog/` the sidebar banner's words came back so
    // under `all:true` when `all:"page"` would have changed them. A gate no other call opens keeps the
    // search's own answer, and only its generic reason ("words the theme prints", on a theme the
    // table knows or not) gives way to the gate's: a reason with a road of its own (the theme's file,
    // a form, a title, a menu, a record not read) keeps its next. A menu left untraced or a site list
    // cut short keeps the search's answer whole: no other call shape opens the road there.
    /** @param {'outsideNext' | 'noRecordNext'} key */
    const stays = (key) =>
      isGenericThemeWords(fallback)
        ? { ...fallback, next: renderedText(key, { path: whole.path }) }
        : fallback
    if (verdicts.includes('outside')) return stays('outsideNext')
    const closed = closedBy(set)
    if (closed === 'all') {
      const firstRendered = plan.changes[verdicts.indexOf('rendered')]?.find ?? ''
      if (verdicts.includes('stored'))
        return mixedRefusal(plan.changes.filter((_c, i) => verdicts[i] === 'rendered').concat(hrefs))
      // `all:"page"` is the road only when the site's plugin has one: an older plugin is said as such,
      // never sent round once more.
      if (renderedSupport(await read('info', {})) === null)
        return closedAnswer(fallback, firstRendered, 'olderNext')
      return closedAnswer(fallback, firstRendered, 'allNext', { path: whole.path })
    }
    if (closed === 'record') return stays('noRecordNext')
    if (closed !== null) return fallback
    const held = heldLink(set)
    if (held) return held
    if (verdicts.includes('stored'))
      return mixedRefusal(plan.changes.filter((_c, i) => verdicts[i] === 'rendered').concat(hrefs))
    return rendered(fallback, set)
  }
  if (hrefs.length > 0) {
    const held = heldLink(set)
    if (held) return held
    return mixedRefusal(hrefs)
  }
  // A form's submit label is on the page as an input's value, not as text: shown, not "elsewhere".
  if (page)
    for (const res of located.results)
      for (const t of res.targets) {
        const u = /** @type {any} */ (t.kind === 'unit' ? t.unit : null)
        if (
          u?.unitKind === 'cf7-option' &&
          t.rendered === false &&
          matchUnits(page.buttons, u.cased).hits.some((h) => h.whole)
        )
          t.rendered = true
      }
  return {
    ok: true,
    plan,
    page,
    set,
    results: located.results,
    storeById: new Map(set.stores.map((s) => [s.id, s])),
    contractDoor
  }
}

// ── Writing (F3 §5.8) ────────────────────────────────────────────────────────────────────────────

/** The toolset order: `site` records first, so a role without it is refused before anything is written. */
const WRITE_ORDER = ['templatePart', 'template', 'option', 'term', 'post', 'postmeta']

/**
 * The value a `content.get` answer holds for one store.
 * @param {unknown} answer
 * @param {Store} store
 */
function valueIn(answer, store) {
  if (!isRecord(answer) || answer.ok !== true || !isRecord(answer.item)) return null
  const v = answer.item[store.field]
  if (
    (store.kind === 'templatePart' || store.kind === 'template') &&
    positive(answer.item.id) !== store.partId
  )
    return null
  return typeof v === 'string' ? v : null
}

/**
 * Change the words on a WordPress site in one call: locate, rewrite, prove, then write each record
 * under one minted apply id and answer with the receipt (F3 §5, PLAN v2 P10).
 *
 * `plan` is `planReplace`'s answer (IX2 aliases first). `read` and `write` are the door
 * (`(action, params) → answer`); they must answer whole records — a read cut to a budget is refused
 * here, never written back. `mintApplyId` makes this call's own id (`replace-…`): Joomla's receipts
 * are one per apply, and a WordPress id shared with other writes would make the self-revert undo them
 * too. `confirmed`: a dryRun of the same call was answered earlier in this conversation
 * (`confirmKey`). `verify:false` skips the page read after writing.
 *
 * `removes` — THE SIGNAL THAT A RECORD MAY SHRINK (D6′ (a)): the customer's LATEST MESSAGE, passed by
 * the caller on every call (IX2: `latestCustomerWords(events)`, the very words `runSiteCall`'s body
 * guard reads). The job has no `removes` parameter of its own (`REPLACE_KEYS`), so a model cannot
 * type one. A body left under `SHRINK_RATIO` of itself is written only when that message asks for a
 * removal — `quotesCustomer(removes, removes)`, the guard's own test: three words or more, one of
 * them the removal verb — and the message then travels with that write, so the guard checks it
 * again. Anything else is refused here, before a record is written, with the next that asks the
 * customer; their reply is the next latest message, and the same call goes through.
 *
 * `bound` — the site's component is known to refuse record writes: bound to its quickstart
 * contract (`LEGACY_STRUCTURE_CODE`, `Engine.php` structural-write block list; IX2: `facts.contractBound
 * || memory.learned(label).contractBound`). Answered `NOT_SUPPORTED_HERE` before any read.
 *
 * `contractDoor` — the site's surface has `content.contract` (`wordpress-contract`): words an identity
 * token prints are answered with its identity slot, else with the option write ({@link identityAnswer}).
 * @param {{ plan: ReplacePlan | RestorePlan | Record<string, unknown>, read: Door, write?: Door,
 *   pageHtml: (path: string) => Promise<any>, mintApplyId?: () => string, confirmed?: boolean,
 *   removes?: string | null, bound?: boolean, verify?: boolean, contractDoor?: boolean }} deps
 * @returns {Promise<Record<string, unknown>>}
 */
export async function replaceOnWordPress(deps) {
  const plan = /** @type {any} */ (deps.plan)
  if (!isRecord(plan) || plan.ok !== true) return /** @type {Record<string, unknown>} */ (plan)
  if (plan.mode === 'restore')
    return refuse('BAD_PARAMS', wpText('restoreError'), wpText('restoreNext'), { param: 'restore' })
  const replacePlan = /** @type {ReplacePlan} */ (plan)
  // 🔒 NO FALLBACK TO `read`: the job's reads go past the arrival budgets (a raw relay), its writes
  // through `runSiteCall` — the body guard and the in-tool check. A write sent down the read road
  // would skip both, so a missing `write` is a wiring bug, said at once.
  if (typeof deps.write !== 'function')
    throw new TypeError('replaceOnWordPress: `write` is required (the relay with the body guard)')
  // 🔒 A BOUND SITE IS ANSWERED BEFORE ITS FIRST READ. Its component refuses every `content.update`
  // (`LEGACY_STRUCTURE_CODE`), and the job learned so only at its first write — after reading the page, the
  // parts, the menus and, site-wide, every body (review of P10, 25/09).
  if (deps.bound === true)
    return refuse('NOT_SUPPORTED_HERE', wpText('boundError'), wpText('boundNext'), { door: 'bound' })
  const read = safe(deps.read)
  const write = safeWrite(deps.write)
  const mint = deps.mintApplyId ?? mintReplaceId
  /** @type {string | null} */
  let applyId = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const located = await locateOnWordPress({
      plan: replacePlan,
      read,
      pageHtml: deps.pageHtml,
      confirmed: deps.confirmed,
      contractDoor: deps.contractDoor === true
    })
    if (located.ok !== true) {
      const road = /** @type {any} */ (located)[RENDERED]
      if (!road) return /** @type {Record<string, unknown>} */ (located)
      return replaceRendered({
        ...road,
        plan: replacePlan,
        read,
        write,
        mintApplyId: mint,
        confirmed: deps.confirmed === true,
        fallback: /** @type {Record<string, unknown>} */ (located)
      })
    }
    const located0 = /** @type {WordPressPlan} */ (located)
    const rewrite = rewriteRecords(located0.results, located0.storeById, {
      identity: located0.set.identity,
      contractDoor: located0.contractDoor
    })
    if (rewrite.ok !== true) return rewrite
    const {
      writes: every,
      companions,
      notes: rewriteNotes,
      stored
    } = /** @type {Exclude<typeof rewrite, ReturnType<typeof refuse>>} */ (rewrite)
    // 🔒 NEVER A NO-OP WRITE, NEVER A CHANGE CLAIMED THAT DID NOT HAPPEN: a record the change leaves
    // byte for byte as it was (the site already holds these very characters) is not sent, and its
    // place is not in the receipt. Before, such a record was sent whole — a write, a revision and an
    // apply-log entry — and the answer said "before → after" for words the customer never got.
    const writes = every.filter((x) => x.after !== x.before)
    if (writes.length === 0)
      return refuse(
        'BAD_PARAMS',
        wpText('sameError', { replace: replacePlan.changes[0]?.replace ?? '' }),
        wpText('sameNext'),
        {
          param: 'replace',
          rule: 'unchanged'
        }
      )
    const live = new Set(writes.flatMap((x) => [x.store.id, ...(x.carries ?? [])]))
    const w = {
      ...located0,
      results: located0.results.map((r) => ({
        ...r,
        targets: r.targets.filter((t) => t.kind !== 'unit' || live.has(/** @type {any} */ (t.unit).store))
      }))
    }
    const notes = [
      ...new Set([...w.results.flatMap((r) => r.notes), ...rewriteNotes, ...languageNotes(w, writes)])
    ]
    // The body guard's share, before anything is sent (D6′ (a)), on the guard's own test.
    const removal = typeof deps.removes === 'string' && quotesCustomer(deps.removes, deps.removes)
    for (const x of writes) {
      if (!x.store.body || x.after.length >= SHRINK_RATIO * x.before.length) continue
      if (removal || loremOnly(x)) continue
      return refuse(
        'VALUE_NOT_ALLOWED',
        wpText('shrinkError', {
          what: x.store.label,
          after: x.after.length.toLocaleString('en-US'),
          before: x.before.length.toLocaleString('en-US')
        }),
        wpText('shrinkNext'),
        { rule: 'body-shrink', at: x.store.id }
      )
    }
    const would = w.results.flatMap((r) =>
      r.targets.map((t) => typographyWould(wouldOf(t, r.change), stored))
    )
    const reach = notReachedOf(w, writes)
    if (replacePlan.dryRun) {
      const out = dryRunAnswer({
        platform: 'wordpress',
        path: replacePlan.path,
        results: w.results,
        all: replacePlan.all
      })
      if (Array.isArray(out.would))
        out.would = out.would.map((/** @type {Record<string, unknown>} */ x) => typographyWould(x, stored))
      return withNormalized(
        fitted(out, {
          ...(companions.length > 0 ? { companions } : {}),
          ...(notes.length > 0 ? { notes } : {}),
          ...(w.set.capped ? { scanned: w.set.scanned } : {}),
          ...(reach ? { notReached: reach } : {})
        }),
        replacePlan
      )
    }
    applyId ??= mint()
    /** @type {Map<string, { find: string, replace: string }>} */
    const changes = new Map()
    for (const r of w.results)
      for (const t of r.targets)
        if (t.kind === 'unit' && !changes.has(/** @type {any} */ (t.unit).store))
          changes.set(/** @type {any} */ (t.unit).store, r.change)
    const run = await writeRecords({
      read,
      write,
      writes,
      applyId,
      removes: removal ? /** @type {string} */ (deps.removes) : null,
      would,
      changeOf: (store) =>
        changes.get(store.id) ??
        writes
          .filter((x) => x.store.group === store.group)
          .flatMap((x) => [x.store.id, ...(x.carries ?? [])])
          .map((id) => changes.get(id))
          .find(Boolean) ??
        null
    })
    if (!run.ok) {
      if (run.retry && attempt === 0) continue
      return run.answer
    }
    const out = receipt({
      platform: 'wordpress',
      path: replacePlan.path,
      applyId,
      changed: would,
      removal: replacePlan.changes.every((c) => c.replace === ''),
      companions,
      stillHolds: leadLeftovers(
        replacePlan.changes,
        unitsOfStores(w.set.stores, w.set.identity),
        would.map((x) => x.at)
      ),
      unchanged: w.results.flatMap((r) => r.unchanged).slice(0, 4),
      alsoIn: w.results.flatMap((r) => r.alsoIn).slice(0, 5),
      notes,
      notReached: reach,
      undo: undoOf({ platform: 'wordpress', applyId })
    })
    if (w.set.capped) out.scanned = w.set.scanned
    if (deps.verify !== false && w.page !== null)
      out.verified = await verifyShown(deps.pageHtml, replacePlan.path, w.results)
    return withNormalized(out, replacePlan)
  }
  return refuse('STORE_CHANGED', wpText('changedError', { what: 'a record' }), wpText('changedNext'))
}

/**
 * A new apply id when the caller injected none: `replace-<clock in base 36>-<6 hex>`, the shape
 * `call-memory.mjs` mints (D7) — IX2 passes `() => memory.mint('replace')`.
 */
const mintReplaceId = () =>
  `replace-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, '0')}`

/** @param {unknown} v */
const bytesOf = (v) => new TextEncoder().encode(JSON.stringify(v)).length

/**
 * A dryRun answer with this engine's own fields added, still inside the core's budget
 * ({@link RECEIPT_MAX_BYTES}): what does not fit is left out, the least useful first — the notes,
 * then the links that follow, then the rest — and `next` stays last.
 * @param {Record<string, unknown>} out
 * @param {Record<string, unknown>} extra
 */
function fitted(out, extra) {
  const { next, ...head } = out
  /** @type {Record<string, unknown>} */
  let got = { ...head, ...extra, next }
  for (const key of ['notes', 'companions', 'scanned']) {
    if (bytesOf(got) <= RECEIPT_MAX_BYTES) break
    if (!(key in extra)) continue
    const { [key]: _dropped, ...rest } = got
    got = rest
  }
  if (bytesOf(got) > RECEIPT_MAX_BYTES && 'notReached' in extra && !('notReached' in out)) {
    const { notReached: _dropped, ...rest } = got
    got = rest
  }
  return got
}

/**
 * A place whose change is typography alone ("Mon–Fri" stored, "Mon-Fri" sent), as the receipt shows
 * it: the stored characters → the new ones. The folded view the matcher reads is the same on both
 * sides, so without this the receipt said "Mon-Fri → Mon-Fri" for a change that did happen.
 * @template {{ at?: unknown, before?: unknown, after?: unknown }} T
 * @param {T} would - one row of `changed` / `would`.
 * @param {Map<string, { before: string, after: string }>} stored - from {@link rewriteRecords}.
 * @returns {T}
 */
function typographyWould(would, stored) {
  const x = stored.get(String(would.at))
  return x ? { ...would, before: clip(x.before, 0, 0), after: clip(x.after, 0, 0) } : would
}

/** @param {Record<string, unknown>} out @param {ReplacePlan} plan */
const withNormalized = (out, plan) =>
  plan.normalized?.length ? { ...out, normalized: plan.normalized } : out

/**
 * The component's answer when the site is bound to its quickstart contract: it refuses
 * every record write (`LEGACY_STRUCTURE_CODE`, claude-cowork `wordpress/cowork/lib/Engine.php`
 * structural-write block list), word for word the Joomla component's (`LEGACY_BOUND_MESSAGE`, `legacy-refusal.mjs`).
 * @param {unknown} a
 */
const isBound = (a) =>
  isRecord(a) &&
  a.ok === false &&
  codeOf(a) === LEGACY_STRUCTURE_CODE &&
  String(a.message ?? '').trim() === LEGACY_BOUND_MESSAGE

/**
 * @param {{ read: Door, write: Door, writes: StoreWrite[], applyId: string, removes: string | null,
 *   would: Record<string, unknown>[], changeOf: (store: Store) => { find: string, replace: string } | null }} input
 * @returns {Promise<{ ok: true } | { ok: false, retry?: boolean, answer: Record<string, unknown> }>}
 */
async function writeRecords({ read, write, writes, applyId, removes, would, changeOf }) {
  /** @type {Map<string, StoreWrite[]>} */
  const groups = new Map()
  for (const x of writes) {
    const list = groups.get(x.store.group) ?? []
    list.push(x)
    groups.set(x.store.group, list)
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      WRITE_ORDER.indexOf(a[0].store.kind) - WRITE_ORDER.indexOf(b[0].store.kind) ||
      a[0].store.group.localeCompare(b[0].store.group)
  )
  let written = 0
  /**
   * Stop, undoing this call's own apply when anything of it stands (its own id undoes only this
   * call's writes). A write whose answer was lost never comes here: see `lost` below.
   * @param {Record<string, unknown>} answer
   */
  const undone = async (answer) => {
    if (written === 0) return { ok: /** @type {const} */ (false), answer: { ...answer, planned: would } }
    const back = await write('apply.revert', { apply_id: applyId })
    const failed = isRecord(back) && Array.isArray(back.failed) ? back.failed : []
    if (isRecord(back) && back.ok === true && failed.length === 0)
      return {
        ok: /** @type {const} */ (false),
        answer: { ...answer, planned: would, written, reverted: true }
      }
    // 🔒 THE LEASE REFUSES THE UNDO TOO. A write refused with SITE_BUSY after N records landed meets
    // the same lease on its `apply.revert`: the door's code is passed through unchanged (D21's sealed
    // condition), with what stands and the one call that undoes it once the site is free.
    if (isRecord(back) && LEASE_CODES.has(codeOf(back)) && codeOf(back) === codeOf(answer)) {
      const { next: _doorNext, ...door } = answer
      return {
        ok: /** @type {const} */ (false),
        answer: {
          ...door,
          apply_id: applyId,
          written,
          partial: true,
          reverted: false,
          planned: would,
          next: wpText('busyPartialNext', { n: written, applyId })
        }
      }
    }
    const what =
      failed.length > 0
        ? failed.map((f) => (isRecord(f) ? String(f.error ?? f.op) : String(f))).join('; ')
        : String(isRecord(back) ? (back.error ?? back.code ?? 'no answer') : 'no answer')
    return {
      ok: /** @type {const} */ (false),
      answer: refuse(
        'PARTIAL',
        wpText('partialError', { n: written, m: ordered.length, failed: what }),
        wpText('partialNext', { applyId }),
        { apply_id: applyId, written, reverted: false, planned: would }
      )
    }
  }
  /**
   * 🔒 A LOST ANSWER IS NEVER UNDONE HERE. The write left Tracy and its answer did not come back (a
   * thrown relay, the relay's own OUTCOME_UNKNOWN, a gateway status, a `writer_busy` that is not the
   * lock miss, no object at all — `outcomeUnknown`'s one reading): PHP may still be running it — the door gives up at 170 s, PHP does not (D10′) — so an
   * `apply.revert` sent now can land BEFORE it, and the record ends changed under an answer that says
   * reverted (review of P10, 25/09: both the thrown and the relayed road answered `reverted:true`
   * beside "do not repeat the call"). Nothing is reverted: the answer says how many records may hold
   * the new words, carries this call's apply id, and names the one read that shows where they stand
   * once PHP is done — the replace job's own dryRun with the NEW words (P11 answers EmDash the same).
   * @param {Record<string, unknown>} answer
   * @param {Store} store
   */
  const lost = (answer, store) => {
    const change = changeOf(store)
    const fresh = change ? change.replace.replace(/\s*\n\s*/g, ' ').trim() : ''
    const old = change ? change.find : ''
    // A quote cut to fit is a find that fails: only words that fit whole are quoted.
    const fits = (/** @type {string} */ t) => t.length <= QUOTED_WIDTH.new && !t.includes('"')
    const next =
      fresh === ''
        ? wpText('outcomeGoneNext', { old: fits(old) ? old : '<the old words>' })
        : wpText('outcomeNext', {
            new: fits(fresh) ? fresh : '<the new words>',
            old: fits(old) ? old : '<the old words>'
          })
    const { next: _doorNext, error: _doorError, ...door } = answer
    return {
      ok: /** @type {const} */ (false),
      answer: {
        ...door,
        ok: false,
        code: 'OUTCOME_UNKNOWN',
        error: wpText('outcomeError', { what: store.label, n: written, n1: written + 1, m: ordered.length }),
        apply_id: applyId,
        written,
        reverted: false,
        planned: would,
        next
      }
    }
  }
  for (const group of ordered) {
    const store = group[0].store
    // Re-read immediately before the write: WordPress takes no expected revision (F3 §5.8).
    const again = await read('content.get', store.read)
    if (!isRecord(again) || again.ok !== true)
      return undone(
        /** @type {Record<string, unknown>} */ (withNext(/** @type {Record<string, unknown>} */ (again)))
      )
    if (group.some((x) => valueIn(again, x.store) !== x.before)) {
      if (written === 0)
        return {
          ok: false,
          retry: true,
          answer: refuse(
            'STORE_CHANGED',
            wpText('changedError', { what: store.label }),
            wpText('changedNext')
          )
        }
      return undone(
        refuse(
          'STORE_CHANGED',
          wpText('changedUndoneError', { what: store.label, n: written }),
          wpText('changedNext')
        )
      )
    }
    /** @type {Record<string, unknown>} */
    const fields = {}
    for (const x of group) fields[x.store.field] = x.after
    if (store.kind === 'templatePart' || store.kind === 'template') fields.title = store.title
    const shrinks = group.some((x) => x.store.body && x.after.length < SHRINK_RATIO * x.before.length)
    const params = { ...store.address, fields, apply_id: applyId, ...(shrinks && removes ? { removes } : {}) }
    // The template's lorem, re-read just above, may go shorter (`sample-text.mjs`); any other shrink keeps the guard.
    // 🔒 HOWEVER SMALL THE CUT (build 12, 25/10/2026): a lorem write under a fifth of the body went out unscoped and
    // left the read baseline as it was, so the third find in a row was judged against the first read and refused.
    // Every write whose cuts are all lorem runs in the scope, which resets the baseline to the body it leaves.
    const got = await (group.every(loremOnly)
      ? withSampleShrink(() => write('content.update', params))
      : write('content.update', params))
    // An answer that is not one (no object came back) is as lost as a thrown one: the relay's own
    // name for it, `COWORK_WEB_BAD_RESPONSE`, is one of the codes after which a write may have run.
    if (!isRecord(got)) return lost({ ok: false, code: 'COWORK_WEB_BAD_RESPONSE' }, store)
    if (outcomeUnknown(got)) return lost(got, store)
    // A bound site refuses its first record write, after every read: the same answer as before them.
    if (written === 0 && isBound(got))
      return undone(
        refuse('NOT_SUPPORTED_HERE', wpText('boundError'), wpText('boundNext'), { door: 'bound' })
      )
    if (got.ok !== true) return undone(/** @type {Record<string, unknown>} */ (withNext(got)))
    written += 1
    if (got.verified === false) return undone(notVerified(got, store))
  }
  return { ok: true }
}

/**
 * The refusal for a write the in-tool check (D6′ (b), `site-call.mjs` `verifyBody`) did not find
 * whole, by what it found — each answer is undone by the caller.
 *
 * 🔒 THREE ANSWERS, NOT ONE. `verified:false` came back in three shapes and was read as one — "kept
 * ? of ? characters … that is an answer" — so a transient read-back failure undid the customer's
 * change and told them it was impossible (review of P10, 25/09):
 * - no `chars`: the record could not be READ BACK. It may be whole, or cut: the component drops
 *   markup it will not store (KSES; measured 08/09: 66,557 chars sent, 61,126 kept) and a write's own
 *   answer does not say so. A body that cannot be checked is not left standing — the policy is to
 *   undo it, and the error says so — and the next is the state class: the same call once, which
 *   re-plans from what the site then holds;
 * - fewer than `VERIFY_RATIO` of the characters sent were stored: WordPress would not keep it whole;
 * - the counts are whole but the stored blocks do not parse (`blockMarkupProblem`).
 * @param {Record<string, any>} got
 * @param {Store} store
 */
function notVerified(got, store) {
  const counts = isRecord(got.chars) ? got.chars : null
  const sent = Number(counts?.chars_sent)
  const stored = Number(counts?.chars_stored)
  if (counts === null || !Number.isFinite(sent) || !Number.isFinite(stored))
    return refuse('READ_FAILED', wpText('uncheckedError', { what: store.label }), wpText('uncheckedNext'), {
      rule: 'not-checked'
    })
  if (stored < VERIFY_RATIO * sent)
    return refuse(
      'VALUE_NOT_ALLOWED',
      wpText('keptError', { stored, sent, what: store.label }),
      wpText('keptNext'),
      { rule: 'not-kept' }
    )
  return refuse('VALUE_NOT_ALLOWED', wpText('keptMarkupError', { what: store.label }), wpText('keptNext'), {
    rule: 'not-kept',
    markup: true
  })
}

/**
 * The receipt's language notes (Polylang: `hreflang` alternates in the page's head; on one language only
 * the header and footer's every-page note). The header and footer parts and the two options are one
 * record for every language; everything else is per
 * language (measured on ja-business: the theme swaps menu `tracy` for `tracy-ru`, forms and
 * categories have their own copies).
 * @param {WordPressPlan} w
 * @param {readonly StoreWrite[]} writes
 */
function languageNotes(w, writes) {
  // 🔒 ONE LANGUAGE TOO (20/10/2026): a header or footer write shows on every page whatever the site's
  // languages, and a single-language site's receipt said nothing of it — so the agent reported "changed
  // on the contact page" for words every page now shows.
  if (!w.page || w.page.alternates < 2)
    return writes.some((x) => x.store.kind === 'templatePart') ? [wpText('partEveryPage')] : []
  return [
    ...(writes.some((x) => x.store.kind === 'templatePart') ? [wpText('partShared')] : []),
    ...(writes.some((x) => x.store.kind === 'option') ? [wpText('optionShared')] : [])
  ]
}

/**
 * What this call could not reach, said only when true: a site search stopped at its cap, and on a
 * Polylang site the other languages' own records, which the component does not list.
 * @param {WordPressPlan} w
 * @param {readonly StoreWrite[]} writes
 */
function notReachedOf(w, writes) {
  /** @type {string[]} */
  const out = []
  if (w.set.capped) out.push(wpText('siteCapped', { n: w.set.scanned }))
  if (w.page && w.page.alternates >= 2) {
    if (w.results.some((r) => r.scope === 'every')) out.push(wpText('factLanguages'))
    else if (writes.some((x) => !['templatePart', 'template', 'option'].includes(x.store.kind)))
      out.push(wpText('pageLanguages'))
  }
  return out.length > 0 ? out.join('; ') : null
}

/**
 * After the writes, the page read again (≈ 0.1–0.6 s): are the new words shown in each changed
 * place's region?
 * @param {(path: string) => Promise<any>} pageHtml
 * @param {string} path
 * @param {readonly Located[]} results
 */
async function verifyShown(pageHtml, path, results) {
  /** @type {any} */
  let got
  try {
    got = await pageHtml(path)
  } catch {
    got = null
  }
  if (!isRecord(got) || got.ok !== true || typeof got.html !== 'string') return wpText('notChecked')
  const units = renderedUnits(got.html).units
  const buttons = buttonLabels(got.html)
  for (const r of results) {
    const want = foldForMatch(withoutGlyph(r.change.replace, r.glyph).replace(/\s*\n\s*/g, ' '))
    if (want === '') continue
    for (const t of r.targets) {
      if (t.rendered !== true) continue
      const shown =
        units.some((u) => (t.where === null || u.region === t.where) && u.lower.includes(want)) ||
        buttons.some((b) => b.lower.includes(want))
      if (!shown) return wpText('notShownYet', { path })
    }
  }
  return wpText('shownOn', { path })
}
