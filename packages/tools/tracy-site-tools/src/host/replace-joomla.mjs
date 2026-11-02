/**
 * THE REPLACE JOB ON A SEALED JOOMLA SITE (PLAN v2.1 P9, F3 §4): one inspect snapshot, the page the
 * visitor reads, and ONE contract apply. The core (`replace.mjs`, P8) decides where words are; this
 * file says what a Joomla contract holds: which slot a page's words come from, which of them the
 * `[Tracy] Site identity` block fills through a token, the language copies of one block, the links
 * that follow a number, the component's own value rules (`contract-check.mjs`), the evidence a slot
 * asks for, and the apply with its ids.
 *
 * 🔒 EVERY WRITE IS THE ORDINARY CONTRACT APPLY. `deps.apply` is the door's `content.contract` relay
 * (IX2 passes `door('content.contract', …)` through `relayRaw`), so the seat, the toolset gate, the
 * write lease, the audit and every refusal apply to it unchanged; a door refusal (`SITE_BUSY`, a
 * lease, `NOT_SIGNED_IN`) comes back with its own code and gains only `planned`. Nothing here reads a
 * page but through `deps.pageHtml` (F2's pinned GET) and nothing reads the contract but through
 * `deps.snapshot` (call-memory's per-turn snapshot or one flight-guarded inspect — no warm-up, D7).
 *
 * 🔒 A TOKEN IS NEVER WRITTEN AS ITS VALUE. On tracy-business 1.2.0 the topbar says "Hotline:
 * {contact.phone}" and the plugin prints the number from ONE slot, `[Tracy] Site identity / phone`,
 * on every page and in every language. Writing "Hotline: 0909 123 456" into the topbar would leave
 * the footer, the contact page and every other language on the old number while the receipt said
 * done. So the page's words are matched with each token read as the value it prints, and a change
 * that lands inside a token is written to the identity slot. A line whose words change around a
 * token keeps the token when the new words still show its value — the old one, or the new one this
 * same call writes to Site identity ("Why Northgate Industrial" → "Why Acme Works" beside a rename
 * to "Acme Works" stays "Why {site.name}"). A change that drops a contact token from a line is
 * refused with the two changes it needs; one that drops a site name, slogan or monogram follows
 * {@link NAME_IN_QUOTE}.
 *
 * 🔒 LANGUAGES ARE KNOWN FOR MODULES AND FOR THE PAGES `pages[]` LISTS, NOTHING ELSE (measured on
 * both fixtures, 25/09/2026): a module's label says "(en)" and its row its language; a page's
 * language is the one its own blocks (`assignmentMode: include`) share, and a menu item that IS such a
 * page, or an article such a page shows (`view=article&id=N`), takes it. The inspect gives no
 * language for any other article or menu item — 176 of 180 article text slots and 70 (1.1.0) / 72
 * (1.2.0) of 78 menu-item slots; their rows carry no language, catid or route, and `pages[]` routes
 * no prefix — so those count on a page by their presence alone. David's rule (words change only in
 * the page's language) therefore holds for them only where Joomla itself keeps another language's
 * copy off the page: an article in another language whose words the page also shows is one more
 * AMBIGUOUS candidate, and `all:"page"` would write it too.
 */
import { CONTACT_NOTE, contactChanges, readContacts, writeContacts } from './replace-joomla-contacts.mjs'
import {
  IDENTITY_FIELDS,
  IDENTITY_TOKENS,
  INVENTED_EVIDENCE,
  checkSlotValue,
  contractPrecheckOn,
  isIdentitySlot,
  phpTrim
} from './contract-check.mjs'
import { fragmentGroups, quoteInFragments, spreadOverFragments } from './fragment-groups.mjs'
import { foldForMatch, renderedUnits, views } from './html-units.mjs'
import { requestIdOf } from './normalize.mjs'
import {
  RECEIPT_MAX_BYTES,
  REPLACE_NEXT,
  REPLACE_WHY,
  clip,
  countRefusal,
  dryRunAnswer,
  followHref,
  isEmail,
  isFact,
  isPhone,
  leadLeftovers,
  locate,
  matchUnits,
  planReplace,
  rawSpan,
  receipt,
  replaceText,
  spliceRaw,
  undoOf,
  wouldOf
} from './replace.mjs'
import { outcomeUnknown, withNext } from './site.mjs'

/** @typedef {import('./replace.mjs').StoredUnit} StoredUnit */
/** @typedef {import('./replace.mjs').Located} Located */
/** @typedef {import('./replace.mjs').ReplacePlan} ReplacePlan */
/** @typedef {import('./replace.mjs').RestorePlan} RestorePlan */
/** @typedef {import('./replace.mjs').Refusal} Refusal */
/** @typedef {import('./replace.mjs').Target} Target */
/** @typedef {import('./replace.mjs').LocateHooks} LocateHooks */
/** @typedef {import('./html-units.mjs').RenderedUnit} RenderedUnit */
/** @typedef {import('./html-units.mjs').UnitElement} UnitElement */
/** @typedef {import('./html-units.mjs').Region} Region */

// ── Sentences (T10: error ≤ 160 characters, next ≤ 200; `test/replace-joomla.test.mjs` holds both) ──

/**
 * What only the Joomla engine says. The shared sentences (AMBIGUOUS, NOT_FOUND, the receipt, the
 * length and two-line rules) are the core's `REPLACE_NEXT`, word for word.
 */
export const JOOMLA_REPLACE_NEXT = Object.freeze({
  notSealedError:
    'this Joomla site has no content contract: the replace job places words only on a quickstart site with one',
  notSealedNext: 'content.list {kind} finds the record, then content.update {kind, id, fields} changes it',
  restoreError: 'restore is the undo of an EmDash receipt; a Joomla site undoes an apply with apply.revert',
  restoreNext:
    'apply.revert {apply_id:"<the apply_id the receipt gave>"} restores the site as it was before that apply',
  pageMissingError: 'path "{path}" answered {status}: no such page on this site; nothing was written',
  pageMissingNext:
    'the same call with the path of the page the words are on, or without path for the home page',
  textOnlyError:
    '"{find}" is only part of a stored text, and the page could not be read; nothing was written',
  // 🔒 `at` IS WHAT LETS PART OF A TEXT BE WRITTEN, and the sentence has to say so (round 7): read as "…or
  // with all the words of that place", it sent a model that had only the sentence to remove to read the
  // whole paragraph twice (`content.get`, `page.text`) and send it all back — two steps for a call that
  // was one word short.
  textOnlyNext:
    'the same call with at:["{at}"] added: it names the place, and only the words of find change inside it',
  // 🔒 WITH SEVERAL PLACES THE SENTENCE NAMES NONE (adversarial review of round 7, RL-4). A refusal reaches
  // here with more than one place only when `all` or a `where` already chose to write more than one (without
  // them `locate` answers AMBIGUOUS first, with its own next), and then `at:["<the first>"]` — the first
  // loose target, not the one meant — read as an instruction and narrowed a call that wanted them all to
  // one place. The candidates are listed beside it: the model picks the place its customer's words mean.
  // ONE place, and one call for each other: measured on the fixture, `at:[a, b]` still answers AMBIGUOUS
  // ("places > 1 and no all", replace.mjs) and `at` beside `all` is BAD_PARAMS ("at goes alone"), so a list
  // of every candidate's `at` — the obvious next — would send the model round the same refusal.
  textOnlyManyNext:
    'the same call with at:["<the at of the place meant, from candidates>"] added: it names the one place, and only the words of find change inside it; another place is another call',
  identityTokenError: '"{find}" runs across the site\'s {field} and the words beside it; nothing was written',
  identityTokenNext:
    'two changes in one call: changes:[{find:"<the other words>", replace:"<their new words>"}, {find:"{value}", replace:"<the new {field}>"}]',
  nameTokenNext:
    'for a new {field} on every page: the same call with find:"{value}", replace:"<the new {field}>"; else change only the words beside it',
  evidenceError: '{at} needs the customer\'s own words, and "{words}" is not in their messages',
  // 🔒 BOTH ROADS, AS `refusalNext` GIVES THEM (site.mjs, "Customer evidence required"): the words
  // may be the customer's from an earlier message — claiming them invented would be false.
  evidenceNext: `send apply, adding evidence: the customer's words from the message that gave them, or if you wrote them "${INVENTED_EVIDENCE}"`,
  otherLanguageError:
    '"{find}" is not on this page: it is on {page}, in another language; nothing was written',
  otherLanguageNext: 'words change in the language of their own page: the same call with path:"{page}"',
  otherLanguageAtNext:
    'words change in the language of their own page: the same call with at:["{at}"] if that copy is meant',
  factWordsError: '"{find}" changes the {field} and other words; nothing was written',
  factWordsNext:
    'two changes in one call, so the {field} reaches its copies and links: changes:[{find:"{wf}", replace:"{wr}"}, {find:"{lf}", replace:"{lr}"}]',
  factWordsNextLong:
    'two changes in one call, so the {field} reaches its copies and links: the words beside it in one, the whole line with only the {field} new in the other',
  linkAddressError: '"{find}" is the words of a link, and the new value is an address; nothing was written',
  linkAddressNext:
    'an address goes in the link, not in its words: send apply, which sets {label}; the words stay as they are',
  linkFactError:
    'the new value is a link address, and "{find}" is words a visitor reads; nothing was written',
  linkFactNext:
    'the same call with replace:"{value}", as the customer wrote it: the words change, and their link follows them',
  linkFixedError: '"{find}" is the words of a link whose address cannot change on this site',
  linkFixedNext:
    "tell the customer this link's address cannot change here, only its words: that is an answer",
  // 🔒 THE SITE NAME HAS A RECORDED DOOR, SO "CANNOT CHANGE" IS FALSE (ladder DL14/DL15, 14/10/2026): with
  // the core's next ("do not look for another way in"), a contract with no Site identity block left the
  // agent the shell's `config:set`, whose change no receipt lists for the customer's later undo.
  siteNameNext:
    'site.identity {operation:"set", fields:{sitename:"<the new name>"}} changes it on every page; apply.revert undoes it',
  cannotEmptyError: '{at} holds words in this design and cannot be left empty; nothing was written',
  cannotEmptyNext:
    'tell the customer this text can be changed but not removed, and ask what it should say: that is an answer',
  cannotFillError: '{at} is empty in this design, so the content door cannot fill it; nothing was written',
  cannotFillNext:
    "this place is not part of the quickstart's layout: adding it is a layout change through Joomla itself (its CLI or template files), never SQL",
  noMarkupError:
    '{at} takes plain text, and its new value has < > or a control character; nothing was written',
  noMarkupNext: 'the same call with replace in plain words: no tags, no < or >',
  noDirectiveError:
    '{at} takes no {…} directive but the site tokens ({site.name}, {contact.*}); nothing was written',
  noDirectiveNext: 'the same call with replace in plain words, without the braces',
  urlError: 'the link {at} would become "{value}", which this site does not take; nothing was written',
  urlNext:
    'a link takes https://…, mailto:…, tel:+digits, /path or #anchor: send a number or address that fits, or tell the customer',
  overlapError: 'two changes of this call change the same words in {at}',
  storeChangedError: 'the site changed twice while this change was being written; nothing was written',
  storeChangedNext: 'someone else is editing this site: tell the customer and offer to try again in a minute',
  // 🔒 "IN ABOUT 30 s", AS `refusalNext`'s OUTCOME_UNKNOWN SAYS: a lost apply may still be running in
  // PHP under the component's lock, and a dryRun sent at once meets that lock (writer_busy).
  outcomeUnknownNext:
    'the answer was lost and the change may still land: in about 30 s the same call with dryRun:true and the NEW words as find shows it; do not repeat',
  identityNote: 'Site identity / {field}: every page and every language shows the new value',
  tokenLineNote:
    '{at} showed Site identity / {field} through a token; it now holds its own words and no longer follows it',
  notReached:
    '{n} language editions of this site are outside its content contract: their copies are unchanged',
  fragmentsError: '"{find}" is one line of {n} styled parts, each needing a word; nothing was written',
  fragmentsNext:
    'the same call with at least {n} new words, or tell the customer the line needs {n} words so its accent part keeps one',
  already: 'already so: nothing needed writing',
  shown: 'shown on {path}',
  notShown: 'not yet shown on {path}: the page may still come from a cache',
  unread: 'not checked: the page could not be read'
})

/** The facts a sentence quotes from the call (the customer's words, a path): cut at 60 characters. */
const QUOTED = new Set(['find', 'replace', 'words', 'value', 'path'])

/**
 * Fill one {@link JOOMLA_REPLACE_NEXT} sentence. Tracy's own facts (a slot key, a field) are never cut:
 * a cut key would be a call that fails.
 * @param {keyof typeof JOOMLA_REPLACE_NEXT} key
 * @param {Record<string, unknown>} [facts]
 */
export function joomlaText(key, facts = {}) {
  return JOOMLA_REPLACE_NEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in facts)) return whole
    const v = String(facts[name])
    return QUOTED.has(name) && v.length > 60 ? `${v.slice(0, 59)}…` : v
  })
}

/**
 * @param {string} code
 * @param {string} error
 * @param {string} next
 * @param {Record<string, unknown>} [extra]
 * @returns {Refusal}
 */
const refuse = (code, error, next, extra = {}) => ({ ok: false, code, verdict: code, error, next, ...extra })

// ── Tables, keyed by (contract template, version) — unknown → generic rules (D16, F3 §4.1) ─────────

/** The navigation-file marker: a mega-menu caption the template's `etc/navigation/*.json` prints. */
const NAV_FILE = 'file:navigation'

/**
 * @typedef {{ name: string, positionRegion: (position: string) => Region | null,
 *   switcher: RegExp, moduleTitle: RegExp, category: RegExp, switcherItem: RegExp | null }} JoomlaTable
 */

/** @type {JoomlaTable} */
const TRACY_BUSINESS = Object.freeze({
  name: 'tracy-business',
  /**
   * The module positions of tracy_business (1.0.0–1.2.0 declare the same 46 in `pages[]`). Measured on
   * the saved pages: `topbar-l/r` inside `div.tb-topbar`, `header-cta` and the search panel inside
   * `header.tb-header`, `footer-a…d` and `copyright` inside `footer.tb-footer`, `breadcrumbs` in the
   * crumb band; every band of a page (`top-a`, `contact-page`, `about-page`, …) prints in the page
   * body. `off-canvas` and `mega-N` render as the drawer's and the mega menu's copies.
   * @param {string} p
   * @returns {Region}
   */
  positionRegion(p) {
    if (p.startsWith('topbar-')) return 'topbar'
    if (/^(header-cta|off-canvas|mega-\d+|search|language-switcher)$/.test(p)) return 'header'
    if (/^(footer-[a-d]|copyright)$/.test(p)) return 'footer'
    if (p === 'breadcrumbs') return 'title'
    return 'main'
  },
  switcher: /(^|[\s_-])tb-lang|mod-languages/,
  moduleTitle: /footcol__title|module-title|mod-title/,
  category: /chip|filter|__cat|category/,
  switcherItem: /\btb-lang__item\b/g
})

/** @type {JoomlaTable} */
const GENERIC = Object.freeze({
  name: 'generic',
  /**
   * A position read by its name alone, for a template no table knows: fewer places anchor, so more
   * answers are AMBIGUOUS or NOT_EDITABLE — never a write the page did not show.
   * @param {string} p
   * @returns {Region | null}
   */
  positionRegion(p) {
    if (p === '') return null
    if (/(^|[-_])(topbar|top-bar)([-_]|$)/.test(p)) return 'topbar'
    if (/(^|[-_])(header|navbar|menu|logo|search|language)([-_\d]|$)/.test(p)) return 'header'
    if (/(^|[-_])(footer|copyright)([-_\d]|$)/.test(p)) return 'footer'
    if (/breadcrumb/.test(p)) return 'title'
    return 'main'
  },
  switcher: /mod-languages/,
  moduleTitle: /module-title|mod-title/,
  category: /category/,
  switcherItem: null
})

/**
 * The templates a table was measured on, per version. A version not listed reads with the generic
 * rules until someone measures it (D16: tables keyed by (template, version)).
 */
export const JOOMLA_TEMPLATES = Object.freeze({
  'tracy-business/j6': Object.freeze({
    versions: Object.freeze(['1.0.0', '1.1.0', '1.2.0']),
    table: TRACY_BUSINESS
  })
})

/**
 * The contract marker an inspect answers (`contract: "tracy-business/j6/1.2.0"`) and the table for it.
 * @param {Record<string, any>} snap
 * @returns {{ id: string, template: string, version: string | null, table: JoomlaTable, known: boolean }}
 */
export function contractOf(snap) {
  const id = typeof snap?.contract === 'string' ? snap.contract : ''
  const m = /^(.+)\/(\d+\.\d+\.\d+)$/.exec(id)
  const template = m ? m[1] : id
  const version = m ? m[2] : null
  const entry = /** @type {Record<string, { versions: readonly string[], table: JoomlaTable }>} */ (
    JOOMLA_TEMPLATES
  )[template]
  const table = entry && version !== null && entry.versions.includes(version) ? entry.table : GENERIC
  return { id, template, version, table, known: table !== GENERIC }
}

/** Why the words the page shows have no door (noun phrases: they follow `"<words>" is`). */
const WHY = Object.freeze({
  navFile: "a mega-menu caption in the template's locked navigation file",
  brand: "the site identity in the template's locked settings file",
  // Not "locked" since Claude Cowork for Joomla 0.22.0: `site.identity` writes it, with a receipt
  // (`siteNameNext`, said by `planOn`). Here only the slot door cannot.
  siteName: "the site name, kept in Joomla's global configuration, not a slot",
  switcher: 'the language switcher, which the template prints',
  moduleTitle: 'a module title, which has no content slot',
  menuHeading: "a page heading from the menu item's settings, which has no slot",
  category: 'a category title, which has no content slot',
  date: 'a date the site prints',
  outside: 'a block outside the content contract (another language or structure)'
})

/**
 * What a change does to a line when its new words drop a site name, slogan or monogram the line
 * showed through a token ("© 2026 Northgate Industrial." → "© 2026 Tracy Demo Co.").
 *
 * 🔒 `'line'` — CHOSEN 27/09/2026 ("pick the best option"; PLAN v2.1 §9 had it
 * pending since the review of P9, 25/09). The line gets the words the customer asked for, and the
 * receipt says it no longer follows Site identity (`tokenLineNote`), so the agent can tell them; its
 * undo is the apply's own. `'refuse'` (the P9 spec, T3′) answered with a question instead — a second
 * round trip for a request that was already clear — and held-out C23 ("© 2026 Tracy Demo Co.") never
 * landed. The cost of `'line'` is named, not hidden: a later rename of the site misses that one line.
 * A rename in the SAME call still keeps the token (`joomlaWrites`' two passes). `deps.nameInQuote`
 * overrides it (tests).
 * @type {'refuse' | 'line'}
 */
export const NAME_IN_QUOTE = 'line'

// ── The contract as stored units ─────────────────────────────────────────────────────────────────

/** A language job's copy of a source slot: `vi-VN::module-441.8`. */
const DERIVED = /^([a-z]{2,3}-[A-Za-z]{2,4})::(.+)$/
/** The tokens that name the site; every other token is a contact fact or a social link. */
const NAME_TOKENS = new Set(['site.name', 'site.legalName', 'site.slogan', 'site.monogram'])
/** The tokens the header lockup prints (the T4 `logo` element Tracy patches, `div.navbar-brand`). */
const BRAND_TOKENS = new Set(['site.name', 'site.slogan', 'site.monogram'])
const BRAND = /(^|\s)navbar-brand(\s|$)/
/** A field the template names as a fact — a phone, e-mail, address or hours (David's rule, P8 `isFact`). */
const FACT_FIELD = /^(phone|email|e-mail|address|addr\d*|hours|tel)$/
/** Token → the identity field that fills it (`Identity::FIELDS` reversed; `contact.tel` is the phone's). */
const TOKEN_FIELD = Object.freeze({
  ...Object.fromEntries(Object.entries(IDENTITY_FIELDS).map(([field, name]) => [name, field])),
  'contact.tel': 'phone'
})

/**
 * @typedef {{ name: string, rs: number, re: number, xs: number, xe: number }} TokenSpan
 *   One identity token in a slot: `[rs, re)` in the stored value, `[xs, xe)` in the text the page
 *   shows, where the token reads as its Site identity value.
 * @typedef {StoredUnit & { slot: Record<string, any>, entity: string, source: string, kind: string,
 *   derived: boolean, tokens: TokenSpan[], identity: string | null, field: string | null,
 *   twinGroup: string | null }} JoomlaUnit
 *   One text slot as the matcher reads it. `raw` is the text the page shows (tokens read as their
 *   values) and `slot.current` the stored value; `source` the base entity (a language job's copy
 *   names its source); `identity` the token a Site identity slot fills.
 * @typedef {{ units: JoomlaUnit[], byKey: Map<string, Record<string, any>>,
 *   identity: Map<string, JoomlaUnit>, tokenUnits: Map<string, JoomlaUnit[]>,
 *   groups: Map<string, JoomlaUnit[]>, pairs: [JoomlaUnit, JoomlaUnit][], fragments: JoomlaUnit[][],
 *   urls: Record<string, any>[],
 *   entities: Set<string>, modules: Map<string, { position: string, language: string }>,
 *   pages: Record<string, any>[], languages: string[], hasIdentity: boolean,
 *   values: Map<string, string>, identitySlots: Map<string, Record<string, any>>,
 *   pageIndex: PageIndex }} JoomlaStore
 *   `values`: what each identity token prints now; `identitySlots`: the Site identity slot each token
 *   is filled from, its links (`social.*`, a url slot) included.
 * @typedef {{ lang: Map<string, string>, path: Map<string, string>, homes: Map<string, string>,
 *   includedIn: Map<string, string>, articlePage: Map<string, string>, multilingual: boolean }} PageIndex
 *   The pages the inspect lists (`menuItem-N`): each one's language and public path, the home page
 *   of each language, the page a module is assigned to alone, the page that shows an article.
 */

/**
 * The pages of one inspect answer, with what they say about language and address.
 *
 * 🔒 A PAGE'S LANGUAGE IS ITS OWN BLOCKS' LANGUAGE. `pages[]` carries no language and its routes no
 * prefix ("home" twice on the stand: `menuItem-599` and `menuItem-632`), but every page lists the
 * modules assigned to it alone (`assignmentMode: include`), and on both fixtures those share one
 * language per page (en-GB 7 on the English home, ru-RU 7 on the Russian one); the `all` modules of
 * every language are listed on every page, so they say nothing. Two languages there → no language.
 * @param {Record<string, any>[]} pages
 * @returns {PageIndex}
 */
function indexPages(pages) {
  /** @type {PageIndex} */
  const out = {
    lang: new Map(),
    path: new Map(),
    homes: new Map(),
    includedIn: new Map(),
    articlePage: new Map(),
    multilingual: false
  }
  for (const p of pages) {
    const entity = String(p.entity)
    const mods = Array.isArray(p.assignedModules) ? p.assignedModules : []
    const own = new Set(
      mods
        .filter((m) => m.assignmentMode === 'include')
        .map((m) => langOf(m.language))
        .filter((l) => l !== null)
    )
    if (own.size === 1) out.lang.set(entity, /** @type {string} */ ([...own][0]))
    for (const m of mods)
      if (m.assignmentMode === 'include' && !out.includedIn.has(String(m.entity)))
        out.includedIn.set(String(m.entity), entity)
    const link = String(p.link ?? '')
    const query = new URLSearchParams(link.includes('?') ? link.slice(link.indexOf('?') + 1) : '')
    if (query.get('view') === 'article' && /^\d+$/.test(query.get('id') ?? ''))
      out.articlePage.set(`article-${query.get('id')}`, entity)
  }
  out.multilingual = new Set(out.lang.values()).size > 1
  for (const p of pages) {
    const entity = String(p.entity)
    const lang = out.lang.get(entity) ?? null
    const route = String(p.route ?? '').replace(/^\/+|\/+$/g, '')
    const base = out.multilingual && lang ? `/${lang}/` : '/'
    // Joomla serves its home menu item at the language's root: `/en/`, never `/en/home`
    const home = route === 'home'
    out.path.set(entity, home ? base : `${base}${route}`)
    if (home && lang && !out.homes.has(lang)) out.homes.set(lang, base)
  }
  return out
}

/**
 * The page a unit's words are on, as a path the replace job takes (`/ru/`, `/en/contact`), or null
 * when the inspect does not say. A block every page of its language prints is on that language's
 * home; a language job's copy (`vi-VN::…`) too.
 * @param {JoomlaStore} store
 * @param {JoomlaUnit} u
 * @returns {string | null}
 */
export function unitPath(store, u) {
  const ix = store.pageIndex
  const home = () => (u.lang ? (ix.homes.get(u.lang) ?? (ix.multilingual ? `/${u.lang}/` : null)) : null)
  if (u.identity || u.derived) return u.identity ? null : home()
  if (u.kind === 'menuItem') return ix.path.get(u.source) ?? null
  if (u.kind === 'article') {
    const page = ix.articlePage.get(u.source)
    return page ? (ix.path.get(page) ?? null) : null
  }
  if (u.kind === 'module') {
    const page = ix.includedIn.get(u.source)
    if (page) return ix.path.get(page) ?? null
  }
  return home()
}

/** @param {string | null | undefined} tag - `en-GB`, `en`, `*` → `en`, `en`, null */
const langOf = (tag) => {
  const t = String(tag ?? '').trim()
  return t === '' || t === '*' ? null : t.toLowerCase().split(/[-_]/)[0]
}

/** A label without its source prefix: `[Tracy Business] Home - Hero (en) / title` → `Home - Hero (en) / title`. */
const cleanLabel = (/** @type {unknown} */ label) => String(label ?? '').replace(/^\[[^\]]*\]\s*/, '')

/**
 * The field a slot fills: the end of its label (`… / title-accent`, `[Tracy] Site identity / phone`),
 * else the ACM field its JSON path names (`["tb-hero", "tb-hero[title]", 0]` → `title`).
 * @param {Record<string, any>} slot
 * @returns {string | null}
 */
function fieldOf(slot) {
  const label = String(slot.label ?? '')
  if (label.includes(' / ')) return label.slice(label.lastIndexOf(' / ') + 3).trim()
  if (!Array.isArray(slot.jsonPath)) return null
  for (let k = slot.jsonPath.length - 1; k >= 0; k -= 1) {
    const step = slot.jsonPath[k]
    if (typeof step !== 'string') continue
    return /\[([^\]]+)\]$/.exec(step)?.[1] ?? step
  }
  return null
}

/**
 * The key one field of a block shares with the same field of the block's copies in other
 * languages: the position the block sits in and the place of the field inside it.
 *
 * 🔒 NOT THE LABEL. A block's title is translated with it — the footer contacts are "Contact /
 * phone" in English and `Контакты / phone` in Russian on the stand's 1.1.0 site — so a label pairs
 * nothing there, and the Russian phone stood as a place of its own (measured: the hotline `all`
 * answered five places for four). The position and the JSON path or XPath are what a language copy
 * keeps (`multilingual-map.json` `derive.module.carry` lists `position`; the slots of a copy are the
 * source's, "values land on the SAME xpaths and JSON leaves", QC.php `patch`).
 * @param {Record<string, any>} slot
 * @param {string | undefined} position
 */
function twinKey(slot, position) {
  const where = Array.isArray(slot.jsonPath) ? slot.jsonPath.join('.') : String(slot.xpath ?? '')
  return where === '' || !position ? null : `${position}|${String(slot.column ?? '')}|${where}`
}

/** The element an HTML slot fills (`…/li[1]/a` → `a`), for cannot-empty when no page was read. */
function tagOf(/** @type {Record<string, any>} */ slot) {
  const steps = String(slot.xpath ?? '').split('/')
  const last = steps[steps.length - 1] ?? ''
  if (last === '' || last.startsWith('@')) return null
  return last.replace(/\[\d+\]$/, '').toLowerCase() || null
}

/**
 * The text a slot shows: each identity token read as the value it prints, with where every token
 * sits in both texts. A token the identity block does not fill prints nothing (`Identity::render`).
 * @param {string} current
 * @param {Map<string, string>} values
 * @returns {{ text: string, tokens: TokenSpan[] }}
 */
function expand(current, values) {
  /** @type {TokenSpan[]} */
  const tokens = []
  let text = ''
  let i = 0
  for (const m of current.matchAll(/\{([a-zA-Z.]+)\}/g)) {
    const name = m[1]
    if (!values.has(name)) continue
    const at = /** @type {number} */ (m.index)
    text += current.slice(i, at)
    const xs = text.length
    text += values.get(name) ?? ''
    tokens.push({ name, rs: at, re: at + m[0].length, xs, xe: text.length })
    i = at + m[0].length
  }
  return { text: text + current.slice(i), tokens }
}

/**
 * An offset of the shown text, outside every token, as an offset of the stored value.
 * @param {JoomlaUnit} u
 * @param {number} x
 */
function toStored(u, x) {
  let shift = 0
  for (const t of u.tokens) if (t.xe <= x) shift += t.re - t.rs - (t.xe - t.xs)
  return x + shift
}

/**
 * The contract of one inspect answer as the units the matcher reads, with the facts the hooks need.
 * @param {Record<string, any>} snap
 * @param {JoomlaTable} table
 * @returns {JoomlaStore}
 */
export function joomlaStore(snap, table) {
  /** @type {Record<string, any>[]} */
  const slots = Array.isArray(snap.slots) ? snap.slots : []
  /** @type {Record<string, any>[]} */
  const pages = Array.isArray(snap.pages) ? snap.pages : []
  /** @type {Map<string, { position: string, language: string }>} */
  const modules = new Map()
  for (const p of pages)
    for (const m of Array.isArray(p.assignedModules) ? p.assignedModules : [])
      if (!modules.has(String(m.entity)))
        modules.set(String(m.entity), {
          position: String(m.position ?? ''),
          language: String(m.language ?? '*')
        })
  const byKey = new Map(slots.map((s) => [String(s.key), s]))
  const entities = new Set(slots.map((s) => String(s.entity)))
  const pageIndex = indexPages(pages)

  // Site identity: the value each token prints (`Identity::fromModuleParams`, `withDerived`).
  /** @type {Map<string, string>} */
  const values = new Map()
  /** @type {Map<string, Record<string, any>>} token → the Site identity slot that fills it (links too) */
  const identitySlots = new Map()
  const idSlots = slots.filter(isIdentitySlot)
  if (idSlots.length > 0) {
    for (const name of IDENTITY_TOKENS) values.set(name, '')
    for (const s of idSlots) {
      const name = IDENTITY_FIELDS[/** @type {keyof typeof IDENTITY_FIELDS} */ (fieldOf(s) ?? '')]
      if (!name) continue
      values.set(name, typeof s.current === 'string' ? s.current : '')
      identitySlots.set(name, s)
    }
    values.set('contact.tel', (values.get('contact.phone') ?? '').replace(/[^0-9+]/g, ''))
  }

  /** @type {JoomlaUnit[]} */
  const units = []
  for (const s of slots) {
    if (s.type !== 'text') continue
    const key = String(s.key)
    const current = typeof s.current === 'string' ? s.current : ''
    if (phpTrim(current) === '') continue // nothing shows, and an empty slot cannot be filled
    const derived = DERIVED.exec(key)
    const sourceKey = derived ? derived[2] : key
    const source = sourceKey.replace(/\.\d+$/, '')
    const kind = source.split('-')[0]
    const isId = isIdentitySlot(s)
    const field = fieldOf(s)
    const identity = isId
      ? (IDENTITY_FIELDS[/** @type {keyof typeof IDENTITY_FIELDS} */ (field ?? '')] ?? null)
      : null
    const shown = isId || values.size === 0 ? { text: current, tokens: [] } : expand(current, values)
    // A module's language is its row's; the "(en)" in its label only stands in for a row that names
    // none ("*"). Apply's written-source-language step moves the source rows to the site's tag but
    // leaves "(en)" in the titles nobody sees, and reading the label first tied every module of a
    // Dutch site to English: content.replace then refused its words as words the template prints.
    // An article's or a menu item's label is its title.
    const labelLang = kind === 'module' ? /\(([a-z]{2})\)/i.exec(String(s.label ?? ''))?.[1] : undefined
    const rowLang = kind === 'module' ? langOf(modules.get(source)?.language) : null
    const pageOfArticle = pageIndex.articlePage.get(source)
    const lang = derived
      ? langOf(derived[1])
      : isId
        ? null
        : rowLang
          ? rowLang
          : labelLang
            ? labelLang.toLowerCase()
            : kind === 'menuItem'
              ? (pageIndex.lang.get(source) ?? null)
              : kind === 'article' && pageOfArticle
                ? (pageIndex.lang.get(pageOfArticle) ?? null)
                : null
    const position = modules.get(source)?.position
    /** @type {JoomlaUnit} */
    const u = {
      ...views(shown.text, { decode: false }),
      at: key,
      raw: shown.text,
      record: String(s.entity),
      label: cleanLabel(s.label),
      region: isId ? null : kind === 'article' ? 'main' : position ? table.positionRegion(position) : null,
      lang,
      writable: true,
      slot: s,
      entity: String(s.entity),
      source,
      kind,
      derived: derived !== null,
      tokens: shown.tokens,
      identity,
      field,
      twinGroup: null
    }
    // the length rule of a slot that prints a token is on its stored value: contract-check reads it
    if (shown.tokens.length === 0 && Number.isFinite(s.maxCharacters)) u.max = Number(s.maxCharacters)
    const tag = tagOf(s)
    if (tag) u.tag = tag
    if (FACT_FIELD.test(field ?? '') && (!isId || !NAME_TOKENS.has(identity ?? ''))) u.fact = true
    if (lang !== null && !isId && kind === 'module')
      u.twinGroup = twinKey(byKey.get(sourceKey) ?? s, position)
    units.push(u)
  }

  /** @type {Map<string, JoomlaUnit>} */
  const identityUnits = new Map()
  /** @type {Map<string, JoomlaUnit[]>} */
  const tokenUnits = new Map()
  /** @type {Map<string, JoomlaUnit[]>} */
  const groups = new Map()
  for (const u of units) {
    if (u.identity) identityUnits.set(u.identity, u)
    for (const t of u.tokens) {
      const list = tokenUnits.get(t.name) ?? []
      if (!list.includes(u)) list.push(u)
      tokenUnits.set(t.name, list)
    }
    if (u.twinGroup) groups.set(u.twinGroup, [...(groups.get(u.twinGroup) ?? []), u])
  }

  // A heading on two lines: `…/title` + `…/title-accent`, consecutive slots of one block (D13).
  /** @type {[JoomlaUnit, JoomlaUnit][]} */
  const pairs = []
  const byEntity = new Map()
  for (const u of units) byEntity.set(u.entity, [...(byEntity.get(u.entity) ?? []), u])
  for (const list of byEntity.values())
    for (const a of list) {
      const b = list.find(
        (/** @type {JoomlaUnit} */ x) =>
          Number(x.at.slice(x.at.lastIndexOf('.') + 1)) === Number(a.at.slice(a.at.lastIndexOf('.') + 1)) + 1
      )
      if (b && a.field && b.field === `${a.field}-accent` && a.tokens.length === 0 && b.tokens.length === 0)
        pairs.push([a, b])
    }

  return {
    units,
    byKey,
    identity: identityUnits,
    tokenUnits,
    groups,
    pairs,
    // one line printed from several text-node slots (an accent span): `fragment-groups.mjs`
    fragments: fragmentGroups(units.filter((u) => u.tokens.length === 0 && u.identity === null)),
    urls: slots.filter((s) => s.type === 'url'),
    entities,
    modules,
    pages,
    languages: Array.isArray(snap.languages) ? snap.languages.map(String) : [],
    hasIdentity: values.size > 0,
    values,
    identitySlots,
    pageIndex
  }
}

// ── The page and the hooks ────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ units: RenderedUnit[], lang: string | null, body: string, html: string }} JoomlaPage
 * @typedef {{ lang: string | null, pageItem: string | null, onPage: Set<string> | null, category: boolean,
 *   article: string | null, listed: Set<string> | null }} PageFacts
 */

/**
 * What the page says about itself: its language (`<html lang>`, else the path's first segment),
 * its own menu item (`<body class … item-N>`), the modules the contract assigns to it, and on a
 * single article's page (`view-article`) that article: its menu item's `view=article&id=N`, else the
 * `N-alias` segment Joomla's router ends the path with.
 *
 * 🔒 THE ARTICLE A PAGE IS (lrsweep rig, JA Spa j6, 25/10/2026): thirteen blog articles end on the same
 * quote, and on one article's page every copy anchored the one it shows, so the call answered
 * COUNT_MISMATCH (13 for 1) on every round. Null when the page names none: presence decides, as before.
 *
 * 🔒 THE ARTICLES A CATEGORY PAGE LISTS (lrsweep rig, JA Spa j6, 25/10/2026): a services list showed four
 * of twelve articles that open with the same words, and every copy anchored, so the call answered
 * COUNT_MISMATCH (13 for 4). On a `view-category` page the listed articles are the ones its links name
 * by their `N-alias` segment (or `view=article&id=N`); a page linking none names none (`listed` null), and presence decides.
 * @param {JoomlaStore} store
 * @param {JoomlaPage | null} page
 * @param {string} path
 * @returns {PageFacts}
 */
export function pageFacts(store, page, path) {
  let lang = page ? langOf(page.lang) : null
  if (lang === null) {
    const seg = /^\/([a-z]{2})(?:[/-]|$)/i.exec(path)?.[1]?.toLowerCase() ?? null
    const known = store.units.map((u) => u.lang).filter((l) => l !== null)
    lang = seg !== null && known.includes(seg) ? seg : (known[0] ?? null)
  }
  const item = page ? (/(^|\s)item-(\d+)(\s|$)/.exec(page.body)?.[2] ?? null) : null
  const pageItem = item ? `menuItem-${item}` : null
  const entry = pageItem ? store.pages.find((p) => String(p.entity) === pageItem) : null
  // 🔒 A TRASHED OR UNPUBLISHED MODULE IS ON NO PAGE (lrsweep rig, JA Spa j6, 25/10/2026): the contract lists
  // every module assigned to a menu item whatever its state, and a trashed one (`published` -2) holding a
  // list's opening words was counted on the services page that never printed it (COUNT_MISMATCH 5 for 4).
  const onPage = entry
    ? new Set(
        (Array.isArray(entry.assignedModules) ? entry.assignedModules : [])
          .filter((m) => m.published === undefined || m.published === null || String(m.published) === '1')
          .map((m) => String(m.entity))
      )
    : null
  let article = null
  if (page && /(^|\s)view-article(\s|$)/.test(page.body)) {
    const link = String(entry?.link ?? '')
    const query = new URLSearchParams(link.includes('?') ? link.slice(link.indexOf('?') + 1) : '')
    const id =
      query.get('view') === 'article' && /^\d+$/.test(query.get('id') ?? '')
        ? query.get('id')
        : (/\/(\d+)-[^/]*\/?$/.exec(path)?.[1] ?? null)
    article = id ? `article-${id}` : null
  }
  const category = page ? /(^|\s)view-category(\s|$)/.test(page.body) : false
  /** @type {Set<string> | null} */
  let listed = null
  if (page && category) {
    const html = page.html ?? ''
    const ids = [
      ...[...html.matchAll(/\shref=["'][^"'#?]*\/(\d+)-[^"'/#?]*\/?["'#?]/g)].map((m) => m[1]),
      ...[...html.matchAll(/\shref=["'][^"']*[?&](?:amp;)?view=article&(?:amp;)?id=(\d+)/g)].map((m) => m[1])
    ]
    listed = ids.length > 0 ? new Set(ids.map((id) => `article-${id}`)) : null
  }
  return {
    lang,
    pageItem,
    onPage,
    category,
    article,
    listed
  }
}

/**
 * The contract entities an occurrence's elements name, innermost first: `Mod<id>` / `tb-<block>-<id>`
 * → `module-<id>`; a menu `li` (`item-N`, or the T4 mega menu's `data-id`) → `menuItem-N`; a mega-menu
 * caption → the navigation file.
 * @param {readonly UnitElement[]} chain
 */
export function markersOf(chain) {
  /** @type {string[]} */
  const out = []
  for (const el of chain) {
    const mod = /^Mod(\d+)$/.exec(el.id) ?? /^tb-[a-z][a-z-]*?-(\d+)$/.exec(el.id)
    if (mod) out.push(`module-${mod[1]}`)
    if (el.tag === 'li') {
      const id = /(^|\s)item-(\d+)(\s|$)/.exec(el.cls)?.[2] ?? (/^\d+$/.test(el.data) ? el.data : null)
      if (id) out.push(`menuItem-${id}`)
    }
    if (/(^|\s)(mega-caption|menu-item-caption|mega-col-title)(\s|$)/.test(el.cls)) out.push(NAV_FILE)
  }
  return out
}

/**
 * Does a `<title>` hold this menu item's title the way Joomla builds it ("Site - Title")?
 * @param {string} title
 * @param {string} v
 */
const titleHolds = (title, v) => title === v || title.endsWith(` - ${v}`) || title.startsWith(`${v} - `)

/**
 * The hooks that tell the core what a Joomla page and contract know (F3 §4.1 step 3).
 * @param {JoomlaStore} store
 * @param {JoomlaTable} table
 * @param {PageFacts} pf
 * @returns {Required<Pick<LocateHooks, 'anchor' | 'why' | 'pairs' | 'twins'>> & { base: (u: JoomlaUnit, occ: import('./replace.mjs').Hit<RenderedUnit>) => boolean }}
 */
export function joomlaHooks(store, table, pf) {
  /**
   * A slot of a module, menu item or article shows at this occurrence.
   * @param {JoomlaUnit} u
   * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
   */
  const base = (u, occ) => {
    const chain = occ.unit.chainAt(occ.a)
    const ms = markersOf(chain)
    if (ms[0] === NAV_FILE) return false
    if (u.lang !== null && pf.lang !== null && u.lang !== pf.lang) return false
    if (u.kind === 'module') {
      const mod = ms.find((m) => m.startsWith('module-'))
      const info = store.modules.get(u.source)
      const regionOk = info !== undefined && table.positionRegion(info.position) === occ.unit.region
      // a language job's copy is a module of its own, whose id this contract does not list
      if (mod) return u.derived ? !store.entities.has(mod) && regionOk : mod === u.source
      if (!u.derived && pf.onPage !== null && !pf.onPage.has(u.source)) return false
      return regionOk
    }
    if (u.kind === 'menuItem') {
      const li = ms.find((m) => m.startsWith('menuItem-'))
      if (li) return u.derived ? !store.entities.has(li) : li === u.source
      // no item marker: only the page's own menu item, as its <title>, its H1 or its breadcrumb
      if (u.source !== pf.pageItem) return false
      if (chain.some((el) => el.tag === 'title')) return titleHolds(occ.unit.lower, u.lower)
      if (chain.some((el) => el.tag === 'h1') || occ.unit.region === 'title')
        return occ.unit.lower === u.lower
      return false
    }
    // an article is listed by modules, menus and components alike: presence decides, except on an
    // article's own page, where another article shows only in a module listing it
    if (u.kind !== 'article') return false
    if (ms.some((m) => m.startsWith('module-'))) return true
    if (pf.article !== null) return u.source === pf.article
    return pf.listed === null || pf.listed.has(String(u.source))
  }
  /**
   * A Site identity slot shows here when the header lockup, the `<title>` or a slot's token prints it.
   * @param {JoomlaUnit} u
   * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
   */
  const identity = (u, occ) => {
    const name = /** @type {string} */ (u.identity)
    const chain = occ.unit.chainAt(occ.a)
    if (BRAND_TOKENS.has(name) && chain.some((el) => BRAND.test(el.cls))) return true
    // 1.2.0's `onAfterInitialise` sets the runtime sitename: the page title's name is Site identity's
    if (name === 'site.name' && chain.some((el) => el.tag === 'title')) return true
    for (const t of store.tokenUnits.get(name) ?? [])
      if (occ.unit.lower.includes(t.lower) && base(t, occ)) return true
    return false
  }
  return {
    base,
    anchor: (hit, occ) => {
      const u = /** @type {JoomlaUnit} */ (hit.unit)
      return u.identity ? identity(u, occ) : base(u, occ)
    },
    why: (occ) => {
      const chain = occ.unit.chainAt(occ.a)
      const ms = markersOf(chain)
      const idc = chain
        .map((el) => `${el.id} ${el.cls}`)
        .join(' ')
        .toLowerCase()
      if (ms[0] === NAV_FILE) return WHY.navFile
      if (!store.hasIdentity && chain.some((el) => BRAND.test(el.cls) || /tb-brand|tb-logo/.test(el.cls)))
        return WHY.brand
      if (table.switcher.test(idc)) return WHY.switcher
      if (chain.some((el) => el.tag === 'title')) return store.hasIdentity ? REPLACE_WHY.title : WHY.siteName
      if (occ.unit.region === 'title') return REPLACE_WHY.title
      if (table.moduleTitle.test(idc)) return WHY.moduleTitle
      if (pf.category && chain.some((el) => el.tag === 'h1')) return WHY.menuHeading
      if (table.category.test(idc)) return WHY.category
      if (chain.some((el) => el.tag === 'time') || /(^|[\s_-])date([\s_-]|$)/.test(idc)) return WHY.date
      if (occ.unit.inForm) return REPLACE_WHY.form
      const mod = ms.find((m) => m.startsWith('module-'))
      if (mod && !store.entities.has(mod)) return WHY.outside
      return REPLACE_WHY.template
    },
    pairs: (stored) => {
      const have = new Set(stored)
      return store.pairs.filter(([a, b]) => have.has(a) && have.has(b))
    },
    twins: (unit) => {
      const u = /** @type {JoomlaUnit} */ (unit)
      const group = u.twinGroup ? (store.groups.get(u.twinGroup) ?? []) : []
      return group.filter((x) => x !== u && x.lang !== u.lang)
    }
  }
}

/**
 * The units one change is located among.
 *
 * 🔒 ONE PLACE PER STORED VALUE. (1) A block's copy in another language stays out when the page's
 * language has its own copy HOLDING THE SAME WORDS: a fact reaches it as a twin of the page's copy
 * (David's rule), and a word change must not see it at all — without this the hotline on 1.1.0 was
 * eight places, two per block, and needed a confirmation it did not deserve. A copy whose words the
 * page's own copy does not hold stays in: on 1.2.0 "Наши компетенции" is the Russian hero button
 * alone, and leaving it out (until 25/09/2026) answered NOT_FOUND for words the contract holds, and
 * wrote "Горячая линия" into an English contact label while the Russian topbar that says it stayed
 * unseen. (2) A slot whose every hit lies inside a token stays out: the words are Site identity's,
 * which is itself a unit, so "8 800 550-67-90" on 1.2.0 is ONE place (`module-4369.5`), not the
 * identity slot plus the topbar and footer slots that print it.
 * @param {JoomlaStore} store
 * @param {PageFacts} pf
 * @param {string} find
 * @returns {JoomlaUnit[]}
 */
export function storedFor(store, pf, find) {
  const pageLang = pf.lang
  /** @type {Map<string, boolean>} */
  const holds = new Map()
  const pageCopyHolds = (/** @type {string} */ group) => {
    let v = holds.get(group)
    if (v === undefined) {
      const own = (store.groups.get(group) ?? []).filter((x) => x.lang === pageLang)
      v = own.length > 0 && matchUnits(own, find).hits.length > 0
      holds.set(group, v)
    }
    return v
  }
  const list = store.units.filter(
    (u) =>
      u.lang === null ||
      pageLang === null ||
      u.lang === pageLang ||
      !u.twinGroup ||
      !pageCopyHolds(u.twinGroup)
  )
  /** @type {Map<JoomlaUnit, boolean>} */
  const insideOnly = new Map()
  for (const h of matchUnits(list, find).hits) {
    const u = h.unit
    if (u.tokens.length === 0) continue
    const [s, e] = rawSpan(u, h)
    const inside = u.tokens.some((t) => t.xs <= s && e <= t.xe)
    insideOnly.set(u, (insideOnly.get(u) ?? true) && inside)
  }
  return list.filter((u) => insideOnly.get(u) !== true)
}

// ── Locate every change ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ store: JoomlaStore, table: JoomlaTable, pf: PageFacts, page: JoomlaPage | null,
 *   hooks: ReturnType<typeof joomlaHooks>, confirmed: boolean }} JoomlaContext
 */

/**
 * The core's `locate` per change on this change's units, then the checks over the whole call:
 * two changes on the same words, and the count rules (`countRefusal`).
 * @param {JoomlaContext} ctx
 * @param {ReplacePlan} plan
 * @returns {{ ok: true, results: Located[] } | Refusal}
 */
export function locateJoomla(ctx, plan) {
  /** @type {Located[]} */
  const results = []
  for (let i = 0; i < plan.changes.length; i += 1) {
    const change = plan.changes[i]
    const stored = storedFor(ctx.store, ctx.pf, change.find)
    let r = locate({
      page: ctx.page ? { units: ctx.page.units, lang: ctx.page.lang } : null,
      stored,
      change,
      path: plan.path,
      pathGiven: plan.pathGiven,
      where: plan.where,
      at: plan.at,
      all: plan.all,
      countRules: false,
      mustKeepTwo: true,
      hooks: ctx.hooks
    })
    if (!r.ok) r = emptiedIdentity(ctx, plan, change, stored, r)
    if (!r.ok)
      r =
        acrossLines(ctx, plan, change, stored, r) ??
        acrossFragments(ctx, plan, change, stored, r) ??
        copiesOnly(ctx, r, change.find)
    if (r.ok) r = asFact(ctx, plan, change, stored, r)
    r = elsewhere(ctx, plan, change, stored, r)
    if (!r.ok) return plan1(withPages(ctx, r, stored), plan.changes.length, i)
    // F3 §4.3: with no page to confirm a place, only a whole value spelled as asked (or a phone found
    // by its digits) is written; a part of a longer text is a candidate, never a write.
    if (ctx.page === null && plan.at === null) {
      const loose = r.targets.find(
        (t) =>
          t.kind === 'unit' &&
          !t.hits.every((h) => h.mode === 'phone' || (h.whole && h.caseExact)) &&
          !(isEmail(change.find) && t.hits.every((h) => h.caseExact))
      )
      if (loose)
        return refuse(
          'AMBIGUOUS',
          joomlaText('textOnlyError', { find: change.find }),
          joomlaText(r.targets.length > 1 ? 'textOnlyManyNext' : 'textOnlyNext', { at: loose.at }),
          {
            find: change.find,
            // The candidate's text around the words asked for, so the model can see that this place holds them.
            candidates: r.targets.slice(0, 8).map((t) => ({
              at: t.at,
              where: t.where,
              text: t.kind === 'unit' ? clip(t.unit.cased, t.hits[0].a, t.hits[0].b, 90) : ''
            })),
            ...(plan.changes.length > 1 ? { change: i } : {})
          }
        )
    }
    results.push(r)
  }
  /** @type {Map<string, { i: number, s: number, e: number }[]>} */
  const spans = new Map()
  for (let i = 0; i < results.length; i += 1)
    for (const t of results[i].targets) {
      const list =
        t.kind === 'split'
          ? [
              [t.a.at, 0, Number.POSITIVE_INFINITY],
              [t.b.at, 0, Number.POSITIVE_INFINITY]
            ]
          : [{ unit: t.unit, hits: t.hits }, ...t.twins].flatMap(({ unit, hits }) =>
              hits.map((h) => [unit.at, ...rawSpan(unit, h)])
            )
      for (const [key, s, e] of /** @type {[string, number, number][]} */ (list)) {
        const got = spans.get(key) ?? []
        const clash = got.find((x) => x.i !== i && x.s < e && s < x.e)
        if (clash)
          return refuse(
            'BAD_PARAMS',
            replaceText('overlapError', { i: clash.i, j: i, at: key }),
            replaceText('overlapNext'),
            { change: i, param: `changes[${i}].find` }
          )
        got.push({ i, s, e })
        spans.set(key, got)
      }
    }
  const refusal = countRefusal(results, {
    all: plan.all,
    expect: plan.expect,
    confirmed: ctx.confirmed,
    dryRun: plan.dryRun
  })
  return refusal ?? { ok: true, results }
}

/**
 * A NOT_FOUND whose words ARE on the page, only in a copy the core does not count (the mega menu's
 * dropdown, the drawer, a hidden label): NOT_EDITABLE, with why.
 *
 * 🔒 "NOT ON THIS PAGE" WOULD BE FALSE THERE. The mega menu's "Transactional emails" is in the page's
 * HTML, inside `ul.dropdown-menu` — a drawer to the region rules — and comes from the template's
 * locked navigation file. NOT_FOUND's next sends the agent to `page.text {match}`, which finds the
 * words, and then to a hunt for their store; the answer that ends the hunt is the store's name.
 * @param {JoomlaContext} ctx
 * @param {Refusal} r
 * @param {string} find
 * @returns {Refusal}
 */
function copiesOnly(ctx, r, find) {
  if (ctx.page === null || r.code !== 'NOT_FOUND' || r.error !== replaceText('notFoundError', { find }))
    return r
  const occ = matchUnits(ctx.page.units, find).hits
  if (occ.length === 0) return r
  const why = ctx.hooks.why(occ[0])
  return refuse(
    'NOT_EDITABLE',
    replaceText('notEditableError', { find, why }),
    replaceText('notEditableNext', { why }),
    {
      find,
      unchanged: [
        { text: clip(occ[0].unit.shown || occ[0].unit.cased, 0, 0, 80), where: occ[0].unit.region, why }
      ]
    }
  )
}

/**
 * A Site identity value the customer wants gone: emptied, never refused as an empty list item.
 *
 * 🔒 T3′ AND THE COMPONENT BOTH SAY IT MAY BE EMPTIED. The core refuses to empty a whole heading,
 * link, button or list item (`cannot-empty`), and on 1.2.0 the footer prints the hours, the e-mail and
 * the address of Site identity as whole `<li>`s — so "remove our opening hours" was answered "an
 * empty list item cannot stay … that is an answer" (measured, review of P9, 25/09/2026: `module-
 * 4369.7`, `.4`, `.6`), while the phone, inside a longer `<li>`, was emptied. The component exempts
 * the identity block from occupancy (QC.php:547, "a fact the customer does not have must be emptied,
 * or the demo's value is shown instead"), and the template drops the `<li>` of a blank token
 * (`tb-footer-contact/tmpl/style-1.php`: `$blank` → no `<li>`). So when the place refused is an
 * identity slot, the change is located again past the core's element rule — with a stand-in word, then
 * the customer's empty value back — and every other place it has still meets that rule (and, before
 * the apply, the component's occupancy: `all:true` on the hours also empties the contact page's row,
 * `module-810.8`, which the component keeps).
 * @param {JoomlaContext} ctx
 * @param {ReplacePlan} plan
 * @param {import('./replace.mjs').ReplaceChange} change
 * @param {JoomlaUnit[]} stored
 * @param {Refusal} r - the core's answer
 * @returns {Located | Refusal}
 */
function emptiedIdentity(ctx, plan, change, stored, r) {
  if (r.rule !== 'cannot-empty' || change.replace !== '') return r
  if (!ctx.store.units.some((u) => u.at === r.at && u.identity !== null)) return r
  const input = {
    page: ctx.page ? { units: ctx.page.units, lang: ctx.page.lang } : null,
    stored,
    path: plan.path,
    where: plan.where,
    all: plan.all,
    countRules: false,
    mustKeepTwo: true,
    hooks: ctx.hooks
  }
  // any non-empty word: only the value rules read `replace`, and the change kept is the customer's
  const again = locate({ ...input, change: { find: change.find, replace: 'x' }, at: plan.at })
  if (!again.ok) return r
  const others = again.targets
    .filter((t) => t.kind !== 'unit' || /** @type {JoomlaUnit} */ (t.unit).identity === null)
    .map((t) => t.at)
  if (others.length > 0) {
    const rest = locate({ ...input, change, at: others })
    if (!rest.ok) return rest
  }
  return { ...again, change }
}

/**
 * The raw offset in `u` where its visible character `i` starts; past the last one, where that one ends.
 * @param {StoredUnit} u
 * @param {number} i
 */
const startIn = (u, i) =>
  i < u.cased.length ? u.map[i][0] : u.cased.length > 0 ? u.map[u.cased.length - 1][1] : 0

/**
 * The raw offset in `u` where its visible character `i - 1` ends (0 for none).
 * @param {StoredUnit} u
 * @param {number} i
 */
const endIn = (u, i) => (i > 0 ? u.map[Math.min(i, u.cased.length) - 1][1] : 0)

/** A stored line's own line break is a space on the page: only the customer's break splits. */
const oneLine = (/** @type {string} */ s) => s.replace(/\s*\n\s*/g, ' ')

/**
 * The heading one change makes of a heading on two lines when its words cross the line break, as
 * the core's `splitTwoLines` reads it: `"<line 1>\n<line 2>"` when the words that differ sit in one line
 * (the other keeps its stored bytes), else the whole new heading, split again by D13's rule. Null
 * when the words are not there across the break.
 *
 * The words that differ are what is left once the old and new words drop what they share at either
 * end, compared as the matcher folds them ("—" is "-", case aside); the words kept are the stored
 * bytes, the new ones the customer's. A line break the customer typed is where they want the break:
 * nothing is narrowed then.
 * @param {StoredUnit} a - line 1
 * @param {StoredUnit} b - line 2
 * @param {import('./replace.mjs').ReplaceChange} change
 * @returns {string | null}
 */
function newHeading(a, b, change) {
  const la = a.cased.length
  const joined = `${a.cased} ${b.cased}`
  const hit = matchUnits([views(joined, { decode: false })], change.find).hits.find(
    (h) => h.mode === 'text' && !h.whole && h.a < la && h.b > la + 1
  )
  if (!hit) return null
  const replace = change.replace
  const theirBreak = replace.includes('\n')
  const old = joined.slice(hit.a, hit.b)
  const rv = views(replace, { decode: false })
  const n = rv.cased
  const same = (/** @type {string} */ x, /** @type {string} */ y) =>
    x === y || x.toLowerCase() === y.toLowerCase()
  let p = 0
  let q = 0
  if (!theirBreak) {
    while (p < old.length && p < n.length && same(old[p], n[p])) p += 1
    while (q < old.length - p && q < n.length - p && same(old[old.length - 1 - q], n[n.length - 1 - q]))
      q += 1
  }
  const S = hit.a + p
  const E = hit.b - q
  const mid = theirBreak
    ? replace
    : n.length - q > p
      ? replace.slice(rv.map[p][0], rv.map[n.length - q - 1][1])
      : ''
  if (!theirBreak && (E <= la || S >= la + 1)) {
    const inA = E <= la
    const u = inA ? a : b
    const off = inA ? 0 : la + 1
    const s = startIn(u, S - off)
    const e = E > S ? endIn(u, E - off) : s
    const line = oneLine(u.raw.slice(0, s) + mid + u.raw.slice(e))
    // a line left without words is a heading on one line: split again below
    if (phpTrim(line) !== '') return inA ? `${line}\n${oneLine(b.raw)}` : `${oneLine(a.raw)}\n${line}`
  }
  // Across the break, it stays beside the word it followed or came before, when the new words still
  // have that word once: "groundwork for next-generation plants" → "base for modern plants" is
  // "Building the base for" / "modern plants", where D13's ratio alone moved "for" to line 2.
  const cut = theirBreak ? null : keptBreak(joined.slice(hit.a, la), joined.slice(la + 1, hit.b), n)
  if (cut !== null) {
    const line1 =
      oneLine(a.raw.slice(0, startIn(a, hit.a))) + replace.slice(0, rv.map[cut - 1][1]).trimStart()
    const line2 =
      replace.slice(rv.map[cut + 1][0]).trimEnd() + oneLine(b.raw.slice(startIn(b, hit.b - la - 1)))
    if (phpTrim(line1) !== '' && phpTrim(line2) !== '') return `${line1}\n${line2}`
  }
  const before =
    S <= la ? a.raw.slice(0, startIn(a, S)) : `${a.raw} ${b.raw.slice(0, startIn(b, S - la - 1))}`
  const after = E >= la + 1 ? b.raw.slice(startIn(b, E - la - 1)) : `${a.raw.slice(endIn(a, E))} ${b.raw}`
  return oneLine(before) + mid + oneLine(after)
}

/**
 * Where the break goes in new words that cross it: after the old line 1's last word, else before the
 * old line 2's first, when the new words hold that word exactly once with words on both sides of the
 * cut. The index of that space in `n`, or null.
 * @param {string} left - the old words before the break, folded
 * @param {string} right - the old words after it, folded
 * @param {string} n - the new words, folded
 * @returns {number | null}
 */
function keptBreak(left, right, n) {
  /** @param {string} w */
  const at = (w) => {
    /** @type {number[]} */
    const out = []
    const lw = w.toLowerCase()
    for (let k = 0; w !== '' && k + w.length <= n.length; k += 1)
      if (
        (k === 0 || n[k - 1] === ' ') &&
        (k + w.length === n.length || n[k + w.length] === ' ') &&
        n.slice(k, k + w.length).toLowerCase() === lw
      )
        out.push(k)
    return out
  }
  const w1 = left.slice(left.lastIndexOf(' ') + 1)
  const ends = at(w1)
  if (ends.length === 1 && ends[0] + w1.length < n.length) return ends[0] + w1.length
  const w2 = right.split(' ')[0]
  const starts = at(w2)
  if (starts.length === 1 && starts[0] > 0) return starts[0] - 1
  return null
}

/**
 * Words that run across the line break of a heading on two lines ("for next-generation plants" of
 * "Building the groundwork for" / "next-generation plants"): ONE place, the heading, changed where
 * its words are ({@link newHeading}), both lines kept non-empty.
 *
 * 🔒 NEVER "WORDS THE TEMPLATE PRINTS" FOR WORDS TWO SLOTS HOLD. The core pairs a heading's two slots
 * only when the words are both lines whole (D13), so a quote covering part of each matched no stored
 * value, and the page's heading was answered NOT_EDITABLE with the template's why — "do not look for
 * another way in: that is an answer" — for the main headline of the page. Measured on the fixtures
 * (review of P9, 25/09/2026): "for next-generation plants" and "groundwork for next-generation" on
 * 1.2.0 `/en/`, "для заводов нового поколения" on `/ru/`, "Motors — your authorised" on 1.1.0. The
 * heading is located by the core itself, as the whole heading with its new words and `at` naming it,
 * so the page, the anchor, `where` and every value rule are the core's; the answer is the customer's
 * change. Without a page to confirm it, the heading is a candidate (F3 §4.3), never a write.
 * @param {JoomlaContext} ctx
 * @param {ReplacePlan} plan
 * @param {import('./replace.mjs').ReplaceChange} change
 * @param {JoomlaUnit[]} stored
 * @param {Refusal} r - the core's answer
 * @returns {Located | Refusal | null} null: no heading holds the words across its break
 */
function acrossLines(ctx, plan, change, stored, r) {
  const named = plan.at !== null
  if (r.code !== 'NOT_FOUND' && r.code !== 'NOT_EDITABLE' && !(named && r.code === 'STORE_CHANGED'))
    return null
  const occs = ctx.page
    ? matchUnits(ctx.page.units, change.find).hits.filter(
        (o) =>
          !o.unit.hidden &&
          o.unit.region !== 'drawer' &&
          (plan.where === null || o.unit.region === plan.where)
      )
    : []
  /** @type {{ key: string, a: JoomlaUnit, b: JoomlaUnit, heading: string }[]} */
  const found = []
  for (const [pa, pb] of ctx.hooks.pairs(stored)) {
    const a = /** @type {JoomlaUnit} */ (pa)
    const b = /** @type {JoomlaUnit} */ (pb)
    const key = `${a.at}+${b.at}`
    if (a.writable === false || b.writable === false) continue
    if (named && !(plan.at ?? []).some((x) => x === key || x === a.at)) continue
    const heading = newHeading(a, b, change)
    if (heading === null) continue
    /** @type {import('./replace.mjs').Hit<StoredUnit>} */
    const probe = { unit: a, a: 0, b: a.cased.length, mode: 'text', whole: true, caseExact: true }
    const lower = `${a.lower} ${b.lower}`
    const shown = occs.some((o) => o.unit.lower.includes(lower) && ctx.hooks.anchor(probe, o))
    if (ctx.page !== null && !named && !shown) continue
    found.push({ key, a, b, heading })
  }
  if (found.length === 0) return null
  const candidates = found.slice(0, 8).map((f) => ({
    at: f.key,
    where: typeof f.a.region === 'string' ? f.a.region : null,
    label: f.a.label,
    text: clip(`${f.a.cased} / ${f.b.cased}`, 0, 0, 90)
  }))
  if (ctx.page === null && !named)
    return refuse(
      'AMBIGUOUS',
      joomlaText('textOnlyError', { find: change.find }),
      joomlaText(found.length > 1 ? 'textOnlyManyNext' : 'textOnlyNext', { at: found[0].key }),
      { find: change.find, candidates }
    )
  if (found.length > 1 && plan.all === false && !named)
    return refuse(
      'AMBIGUOUS',
      replaceText('ambiguousError', {
        find: change.find,
        n: found.length,
        list: [...new Set(candidates.map((c) => c.where ?? 'unknown'))].join(', ')
      }),
      replaceText('ambiguousNext', { at: found[0].key, allForm: '"page"' }),
      { find: change.find, candidates }
    )
  /** @type {Target[]} */
  const targets = []
  /** @type {string[]} */
  const notes = []
  for (const f of found) {
    const got = locate({
      page: ctx.page ? { units: ctx.page.units, lang: ctx.page.lang } : null,
      stored,
      change: { find: `${f.a.cased} ${f.b.cased}`, replace: f.heading },
      path: plan.path,
      where: plan.where,
      at: [f.key],
      all: false,
      countRules: false,
      mustKeepTwo: true,
      hooks: ctx.hooks
    })
    if (!got.ok) return got
    targets.push(...got.targets)
    for (const note of got.notes) if (!notes.includes(note)) notes.push(note)
  }
  return {
    ok: true,
    verdict: targets.length === 1 ? 'WRITE_SPLIT' : 'WRITE',
    change,
    targets,
    places: targets.length,
    unchanged: [],
    alsoIn: [],
    notes,
    scope: 'page',
    languagesKept: 0,
    glyph: null
  }
}

/**
 * Words one line prints from several slots (`<h4>Sign up for the <span>Boxing</span> newsletter</h4>`,
 * three text-node slots of one field): the line located as the customer quoted it, every fragment
 * written with a non-empty share of the new words ({@link spreadOverFragments}).
 *
 * 🔒 NEVER "A FORM LABEL" OR "WORDS THE TEMPLATE PRINTS" FOR WORDS SLOTS HOLD. No single slot holds a
 * quote that crosses an accent span, so the core answered NOT_EDITABLE with the why of the element
 * around it — on JA Boxing 1.0.4 "a form label, which no door here changes; do not look for another
 * way in" for the newsletter heading the content map declares (accept-boxing-104, 25/10/2026). The
 * agent told the customer it could not, and wrote it on the second ask through another road.
 * @param {JoomlaContext} ctx
 * @param {ReplacePlan} plan
 * @param {import('./replace.mjs').ReplaceChange} change
 * @param {JoomlaUnit[]} stored
 * @param {Refusal} r - the core's answer
 * @returns {Located | Refusal | null} null: no fragment group holds the words across its parts
 */
function acrossFragments(ctx, plan, change, stored, r) {
  const named = plan.at !== null
  if (r.code !== 'NOT_FOUND' && r.code !== 'NOT_EDITABLE' && !(named && r.code === 'STORE_CHANGED'))
    return null
  const have = new Set(stored)
  const occs = ctx.page
    ? matchUnits(ctx.page.units, change.find).hits.filter(
        (o) =>
          !o.unit.hidden &&
          o.unit.region !== 'drawer' &&
          (plan.where === null || o.unit.region === plan.where)
      )
    : []
  /** @type {{ group: JoomlaUnit[], values: string[] | null, occ: import('./replace.mjs').Hit<RenderedUnit> | null }[]} */
  const found = []
  for (const group of ctx.store.fragments) {
    if (!group.every((u) => have.has(u) && u.writable !== false)) continue
    if (named && !group.some((u) => (plan.at ?? []).includes(u.at))) continue
    const raws = group.map((u) => u.raw)
    if (quoteInFragments(raws, change.find) === null) continue
    /** @type {import('./replace.mjs').Hit<StoredUnit>} */
    const probe = {
      unit: group[0],
      a: 0,
      b: group[0].cased.length,
      mode: 'text',
      whole: true,
      caseExact: true
    }
    const occ = occs.find((o) => ctx.hooks.anchor(probe, o)) ?? null
    if (ctx.page !== null && !named && occ === null) continue
    found.push({ group, values: spreadOverFragments(raws, change.find, change.replace), occ })
  }
  if (found.length === 0) return null
  const candidates = found.slice(0, 8).map((f) => ({
    at: f.group[0].at,
    where: typeof f.group[0].region === 'string' ? f.group[0].region : null,
    label: f.group[0].label,
    text: clip(f.group.map((u) => u.raw).join(''), 0, 0, 90)
  }))
  if (ctx.page === null && !named)
    return refuse(
      'AMBIGUOUS',
      joomlaText('textOnlyError', { find: change.find }),
      joomlaText(found.length > 1 ? 'textOnlyManyNext' : 'textOnlyNext', { at: found[0].group[0].at }),
      { find: change.find, candidates }
    )
  if (found.length > 1 && plan.all === false && !named)
    return refuse(
      'AMBIGUOUS',
      replaceText('ambiguousError', {
        find: change.find,
        n: found.length,
        list: [...new Set(candidates.map((c) => c.where ?? 'unknown'))].join(', ')
      }),
      replaceText('ambiguousNext', { at: found[0].group[0].at, allForm: '"page"' }),
      { find: change.find, candidates }
    )
  /** @type {import('./replace.mjs').Target[]} */
  const targets = []
  for (const f of found) {
    if (f.values === null)
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('fragmentsError', { find: change.find, n: f.group.length }),
        joomlaText('fragmentsNext', { n: f.group.length }),
        { rule: 'cannot-empty', find: change.find, at: f.group.map((u) => u.at).join('+') }
      )
    f.group.forEach((u, k) => {
      const value = /** @type {string[]} */ (f.values)[k]
      if (value === u.raw) return
      targets.push({
        kind: 'unit',
        at: u.at,
        place: u.at,
        unit: u,
        hits: [{ unit: u, a: 0, b: u.cased.length, mode: 'text', whole: true, caseExact: true }],
        where: f.occ ? f.occ.unit.region : typeof u.region === 'string' ? u.region : null,
        rendered: ctx.page ? f.occ !== null : null,
        occ: f.occ,
        rank: 0,
        exact: true,
        twins: [],
        whole: value
      })
    })
  }
  return {
    ok: true,
    verdict: 'WRITE',
    change,
    targets,
    places: found.length,
    unchanged: [],
    alsoIn: [],
    notes: [],
    scope: 'page',
    languagesKept: 0,
    glyph: null
  }
}

/**
 * The fact a quoted line's change is about: the words `find` and `replace` share at either end
 * dropped, what is left widened to the whole number or address, a phone for a phone or an e-mail for
 * an e-mail ("Hotline: 8 800 550-67-90" → "Hotline: 0909 123 456" is "8 800 550-67-90" →
 * "0909 123 456"). Null for a bare fact (the core's own road) and for a change of other words too.
 * @param {import('./replace.mjs').ReplaceChange} change
 * @returns {{ find: string, replace: string } | null}
 */
export function factOf({ find, replace }) {
  let p = 0
  while (p < find.length && p < replace.length && find[p] === replace[p]) p += 1
  let q = 0
  while (
    q < find.length - p &&
    q < replace.length - p &&
    find[find.length - 1 - q] === replace[replace.length - 1 - q]
  )
    q += 1
  /**
   * The fact, the characters it is written with, and its shape: the punctuation it never begins or
   * ends with (a space, the sentence's full stop) around it — the same on both sides, or the change
   * is not the fact alone.
   * @type {[(s: string) => boolean, RegExp, RegExp][]}
   */
  const kinds = [
    [isPhone, /[\d\s().+\-\u2010-\u2015]/, /^([\s.)\-\u2010-\u2015]*)([\s\S]*?)([\s.()+\-\u2010-\u2015]*)$/],
    [isEmail, /[\w.+@-]/, /^([.+@-]*)([\s\S]*?)([.+@-]*)$/]
  ]
  for (const [is, char, shape] of kinds) {
    let a = p
    let b = q
    // the shared ends are the same characters in both, so both widen alike
    while (a > 0 && char.test(find[a - 1])) a -= 1
    while (b > 0 && char.test(find[find.length - b])) b -= 1
    const was = shape.exec(find.slice(a, find.length - b))
    const now = shape.exec(replace.slice(a, replace.length - b))
    if (!was || !now || was[1] !== now[1] || was[3] !== now[3]) continue
    if (was[2] !== find.trim() && is(was[2]) && is(now[2])) return { find: was[2], replace: now[2] }
  }
  return null
}

/**
 * The phones and e-mails a text writes, as the kinds a fact is: `[field, pattern, test]`.
 * @type {readonly [string, RegExp, (s: string) => boolean][]}
 */
const FACT_TOKENS = Object.freeze([
  ['phone', /[+(]?\d[\d\s().\-\u2010-\u2015]{5,}\d/g, isPhone],
  ['e-mail', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, isEmail]
])

/**
 * A quoted line that changes its number or address AND other words, where the number is the line's
 * own words and has copies to follow it — refused with the two changes that do each.
 *
 * 🔒 NEVER THE LINE ALONE WHILE ITS FACT HAS COPIES. On 1.1.0 `{find:"Hotline: 8 800 550-67-90",
 * replace:"Call: 0909 123 456"}` wrote the English topbar's words and left its `tel:` link and the
 * Russian topbar on the old number (measured, 25/09/2026, the review of P9's fix): the fact road
 * ({@link asFact}) takes a change whose only difference is the fact, and 1.2.0 refuses the same
 * change as `identity-token`. The two changes named — the words beside the fact, and the whole line
 * with only its fact new — land together in one apply: the line gets both, the fact its language
 * copies and links. A line whose fact has no copy and no link is written as asked.
 * @param {JoomlaContext} ctx
 * @param {import('./replace.mjs').ReplaceChange} change
 * @param {Located} r
 * @returns {Refusal | null}
 */
function factWithWords(ctx, change, r) {
  const { find, replace } = change
  for (const [field, pattern, is] of FACT_TOKENS) {
    const olds = [...find.matchAll(pattern)].filter((m) => is(m[0]))
    const news = [...replace.matchAll(pattern)].filter((m) => is(m[0]))
    if (olds.length !== 1 || news.length !== 1 || olds[0][0] === news[0][0]) continue
    const was = olds[0][0]
    const now = news[0][0]
    const i = /** @type {number} */ (olds[0].index)
    const j = /** @type {number} */ (news[0].index)
    const pre = [find.slice(0, i).trim(), replace.slice(0, j).trim()]
    const post = [find.slice(i + was.length).trim(), replace.slice(j + now.length).trim()]
    // the fact alone changes (a bare number, or the same words around it): the core's road or asFact's
    if (pre[0] === pre[1] && post[0] === post[1]) return null
    // the fact has somewhere to go: a language copy of the line that holds it, or a link that dials it
    const follows = r.targets.some((t) => {
      if (t.kind !== 'unit') return false
      const u = /** @type {JoomlaUnit} */ (t.unit)
      if (ctx.hooks.twins(u).some((x) => matchUnits([x], was).hits.length > 0)) return true
      return ctx.store.urls.some((s) => {
        const href = typeof s.current === 'string' ? s.current : ''
        if (String(s.entity) !== u.entity || /\{[a-zA-Z.]+\}/.test(readBraces(href))) return false
        const moved = followHref(href, was, now)
        return moved !== null && moved !== href
      })
    })
    if (!follows) return null
    const line = { find, replace: find.slice(0, i) + now + find.slice(i + was.length) }
    const words =
      pre[0] !== pre[1] && post[0] === post[1] && pre[0] !== '' && pre[1] !== ''
        ? { find: pre[0], replace: pre[1] }
        : post[0] !== post[1] && pre[0] === pre[1] && post[0] !== '' && post[1] !== ''
          ? { find: post[0], replace: post[1] }
          : null
    const next = words
      ? joomlaText('factWordsNext', {
          field,
          wf: words.find,
          wr: words.replace,
          lf: line.find,
          lr: line.replace
        })
      : ''
    return refuse(
      'VALUE_NOT_ALLOWED',
      joomlaText('factWordsError', { find, field }),
      // a next is a call to send whole: one that would not fit is said in words instead
      next !== '' && next.length <= 200 ? next : joomlaText('factWordsNextLong', { field }),
      { rule: 'fact-in-words', at: r.targets[0].at }
    )
  }
  return null
}

/**
 * A quoted line whose only change is a number or an address changes that fact: the language copies of
 * the line and the links that dial or mail it follow, as a bare-fact change does, and `all` reaches
 * every stored copy of it.
 *
 * 🔒 THE FACT, NOT THE LINE, WHOEVER QUOTED IT. On 1.1.0 (no Site identity) `{find:"Hotline: 8 800
 * 550-67-90", replace:"Hotline: 0909 123 456"}` wrote the English topbar's text alone, with or without
 * `all:true` — the `tel:88005506790` visitors tap, the Russian topbar (the same number), the footer
 * and the contact page stayed on the old number, and the receipt said done (review of P9,
 * 25/09/2026). The fact rule and the link rule key on a find that IS a phone or an e-mail, and a
 * quoted line is neither; on 1.2.0 the same quote already goes to Site identity (a token), so the two
 * versions disagreed and T11 (a fact in every language) broke on 1.1.0. The change is located again
 * as the fact: in the places the line was found (`at`), or everywhere `all` says, and the answer
 * names the fact's other places it did not write (`alsoIn`). A line that prints the fact through a
 * token is left to Site identity.
 * @param {JoomlaContext} ctx
 * @param {ReplacePlan} plan
 * @param {import('./replace.mjs').ReplaceChange} change
 * @param {JoomlaUnit[]} stored
 * @param {Located} r
 * @returns {Located | Refusal}
 */
function asFact(ctx, plan, change, stored, r) {
  if (r.targets.some((t) => t.kind !== 'unit' || /** @type {JoomlaUnit} */ (t.unit).tokens.length > 0))
    return r
  const fact = factOf(change)
  if (fact === null) return factWithWords(ctx, change, r) ?? r
  const base = {
    page: ctx.page ? { units: ctx.page.units, lang: ctx.page.lang } : null,
    change: fact,
    path: plan.path,
    pathGiven: plan.pathGiven,
    where: plan.where,
    countRules: false,
    mustKeepTwo: true,
    hooks: ctx.hooks
  }
  if (plan.all !== false)
    return locate({ ...base, stored: storedFor(ctx.store, ctx.pf, fact.find), at: null, all: plan.all })
  const f = locate({ ...base, stored, at: plan.at ?? r.targets.map((t) => t.at), all: false })
  if (!f.ok) return r
  /** @type {Set<string>} */
  const written = new Set()
  for (const t of f.targets)
    if (t.kind === 'unit') for (const at of [t.at, ...t.twins.map((x) => x.unit.at)]) written.add(at)
  /** @type {Map<string, { at: string, where: string | null, text: string }>} */
  const more = new Map()
  for (const h of matchUnits(stored, fact.find).hits) {
    const u = /** @type {JoomlaUnit} */ (h.unit)
    if (written.has(u.at) || more.has(u.at) || u.writable === false || u.identity || h.mode === 'bare')
      continue
    if (u.lang !== null && ctx.pf.lang !== null && u.lang !== ctx.pf.lang) continue
    more.set(u.at, {
      at: u.at,
      where: typeof u.region === 'string' ? u.region : null,
      text: clip(u.cased, h.a, h.b, 80)
    })
  }
  // the line's own words are what the customer quoted: its `unchanged` stays theirs
  return { ...f, unchanged: r.unchanged, alsoIn: [...r.alsoIn, ...more.values()] }
}

/**
 * A candidate the page does not show names the page it is on (`page: "/ru/"`): the path is the call
 * that reaches it, and "onPage: false" alone left the agent to guess which page that was.
 * @param {JoomlaContext} ctx
 * @param {Refusal} r
 * @param {JoomlaUnit[]} stored
 * @returns {Refusal}
 */
function withPages(ctx, r, stored) {
  if (!Array.isArray(r.candidates)) return r
  const candidates = r.candidates.map((/** @type {Record<string, any>} */ c) => {
    if (c.onPage !== false || c.page) return c
    const u = stored.find((x) => x.at === String(c.at).split('+')[0])
    const page = u ? unitPath(ctx.store, u) : null
    return page ? { ...c, page } : c
  })
  return { ...r, candidates }
}

/**
 * Words this page does not show, held by a copy in another language: that copy is a place too, and
 * the answer says which page it is on — never a silent write of the page language's copy alone.
 *
 * 🔒 THE CORE READS ONLY THE PAGE'S LANGUAGE OFF THE PAGE (David's rule: words change in the page's
 * own language unless the customer names another). Measured on 1.2.0 from the English home:
 * "Наши компетенции" is the Russian hero button only, and was answered "not on this page or in its
 * content" — false, with a next (`page.text` on "/") that cannot find it; `Горячая линия` is an English
 * contact label AND the Russian topbar, and only the label was written. Quoting another language's
 * words is how a customer names that language, so the copy is offered with its page: a NOT_FOUND whose
 * next is the path, or an AMBIGUOUS whose candidates carry theirs. `all:true` reaches every language
 * already (the core's site scope), and `at` names a copy outright.
 * @param {JoomlaContext} ctx
 * @param {ReplacePlan} plan
 * @param {import('./replace.mjs').ReplaceChange} change
 * @param {JoomlaUnit[]} stored
 * @param {Located | Refusal} r
 * @returns {Located | Refusal}
 */
function elsewhere(ctx, plan, change, stored, r) {
  const pageLang = ctx.pf.lang
  if (plan.at !== null || plan.all === true || pageLang === null) return r
  const notFound =
    !r.ok && r.code === 'NOT_FOUND' && r.error === replaceText('notFoundError', { find: change.find })
  const offPage = r.ok && r.scope === 'page' && r.targets.every((t) => t.rendered !== true)
  if (!notFound && !offPage) return r
  const where = plan.where ?? null
  /** @type {Set<string>} */
  const have = new Set()
  if (r.ok)
    for (const t of r.targets)
      for (const at of t.kind === 'split' ? [t.a.at, t.b.at] : [t.at, ...t.twins.map((x) => x.unit.at)])
        have.add(at)
  const pool = stored.filter(
    (u) =>
      u.lang !== null &&
      u.lang !== pageLang &&
      !u.identity &&
      u.writable !== false &&
      !have.has(u.at) &&
      (where === null || u.region === where)
  )
  /** @type {Map<string, JoomlaUnit>} */
  const others = new Map()
  for (const h of matchUnits(pool, change.find).hits)
    if (h.mode !== 'bare' && (h.whole || h.caseExact)) others.set(h.unit.at, h.unit)
  if (others.size === 0) return r
  /**
   * @param {JoomlaUnit} u
   * @param {string | readonly string[] | null | undefined} whereShown - a region, or a stored
   *   unit's regions (the first is the one named)
   */
  const candidate = (u, whereShown) => {
    const page = unitPath(ctx.store, u)
    return {
      at: u.at,
      where: Array.isArray(whereShown) ? (whereShown[0] ?? null) : (whereShown ?? null),
      label: u.label,
      text: clip(u.cased, 0, 0, 90),
      onPage: false,
      ...(page ? { page } : {})
    }
  }
  const list = [...others.values()]
  if (notFound && list.length === 1) {
    const u = list[0]
    const page = unitPath(ctx.store, u)
    return refuse(
      'NOT_FOUND',
      joomlaText('otherLanguageError', { find: change.find, page: page ?? 'another page' }),
      page ? joomlaText('otherLanguageNext', { page }) : joomlaText('otherLanguageAtNext', { at: u.at }),
      { find: change.find, candidates: [candidate(u, u.region)] }
    )
  }
  /** @type {Record<string, any>[]} */
  const candidates = []
  if (r.ok)
    for (const t of r.targets) {
      const u = /** @type {JoomlaUnit} */ (t.kind === 'split' ? t.a : t.unit)
      candidates.push({
        ...candidate(u, t.where),
        at: t.at,
        text: t.kind === 'split' ? clip(`${t.a.cased} / ${t.b.cased}`, 0, 0, 90) : clip(u.cased, 0, 0, 90)
      })
    }
  for (const u of list) candidates.push(candidate(u, u.region))
  return refuse(
    'AMBIGUOUS',
    replaceText('ambiguousError', {
      find: change.find,
      n: candidates.length,
      // pages, not regions: which page is the question here (three at most, inside T10's 160)
      list: [...new Set(candidates.map((c) => c.page ?? c.where ?? 'unknown'))].slice(0, 3).join(', ')
    }),
    replaceText('ambiguousNext', { at: candidates[0].at, allForm: 'true' }),
    { find: change.find, candidates: candidates.slice(0, 8) }
  )
}

// ── The values one apply writes ───────────────────────────────────────────────────────────────────

/**
 * @typedef {{ at: string, unit: JoomlaUnit, slot: Record<string, any>, before: string, value: string,
 *   changes: Set<number>, edits: { s: number, e: number, text: string }[], whole: string | null }} JoomlaWrite
 *   One slot one apply changes: `edits` in the STORED value's offsets, or `whole` (a split heading).
 * @typedef {{ at: string, slot: Record<string, any>, before: string, value: string, changes: Set<number>,
 *   why: string }} Companion
 */

/**
 * `replace` as written where the template prints an arrow the store does not hold (glyph mode).
 * @param {string} replace
 * @param {{ lead: string, trail: string } | null} glyph
 */
function plainReplace(replace, glyph) {
  let r = replace
  if (glyph?.trail && r.endsWith(glyph.trail)) r = r.slice(0, -glyph.trail.length).trimEnd()
  if (glyph?.lead && r.startsWith(glyph.lead)) r = r.slice(glyph.lead.length).trimStart()
  return r
}

/**
 * @typedef {{ newIdentity?: Map<string, string>, nameInQuote?: 'refuse' | 'line', probe?: boolean }} PlaceOptions
 *   `newIdentity`: token → the value this same call writes to Site identity. `probe`: the first pass
 *   that only learns those values — nothing it cannot place is refused there, it is skipped.
 */

/**
 * Where one hit in a slot that prints tokens is written: the words around the tokens (the slot), a
 * token's value (the identity slot), or — when the new words drop a token — nowhere.
 * @param {JoomlaStore} store
 * @param {JoomlaUnit} u
 * @param {number} s - start in the shown text
 * @param {number} e - end in the shown text
 * @param {string} text - the new words
 * @param {string} find
 * @param {PlaceOptions} [opts]
 * @returns {{ ok: true, skip?: boolean, identity: JoomlaUnit | null, s: number, e: number, text: string, detached: string | null }
 *   | { ok: false, refusal: Refusal }}
 */
function placeInTokens(store, u, s, e, text, find, opts = {}) {
  const shown = u.raw
  const field = (/** @type {TokenSpan} */ t) => TOKEN_FIELD[/** @type {keyof typeof TOKEN_FIELD} */ (t.name)]
  const skip = { ok: /** @type {const} */ (true), skip: true, identity: null, s, e, text, detached: null }
  /** @param {TokenSpan} t - read as words in a sentence: "the site's site name", not "site-name" */
  const named = (t) => String(field(t)).replace(/-/g, ' ')
  /** @param {TokenSpan} t */
  const tokenRefusal = (t) =>
    opts.probe
      ? skip
      : {
          ok: /** @type {const} */ (false),
          refusal: refuse(
            'VALUE_NOT_ALLOWED',
            joomlaText('identityTokenError', { find, field: named(t) }),
            joomlaText(NAME_TOKENS.has(t.name) ? 'nameTokenNext' : 'identityTokenNext', {
              value: shown.slice(t.xs, t.xe),
              field: named(t)
            }),
            { rule: 'identity-token', at: u.at }
          )
        }
  const inside = u.tokens.find((t) => t.xs <= s && e <= t.xe && e > s)
  if (inside) {
    const id = store.identity.get(inside.name)
    if (!id) return tokenRefusal(inside)
    return { ok: true, identity: id, s: s - inside.xs, e: e - inside.xs, text, detached: null }
  }
  // The smallest span that changes: the customer quoted a line, and only part of it is new.
  const was = shown.slice(s, e)
  let p = 0
  while (p < was.length && p < text.length && was[p] === text[p]) p += 1
  let q = 0
  while (q < was.length - p && q < text.length - p && was[was.length - 1 - q] === text[text.length - 1 - q])
    q += 1
  const a = s + p
  const b = e - q
  const mid = text.slice(p, text.length - q)
  // an insertion at a token's edge is beside it, not in it: the token stays
  const crossed = u.tokens.filter((t) => (a < b ? a < t.xe && t.xs < b : t.xs < a && a < t.xe))
  if (crossed.length === 0)
    return { ok: true, identity: null, s: toStored(u, a), e: toStored(u, b), text: mid, detached: null }
  const contact = crossed.find((t) => !NAME_TOKENS.has(t.name))
  if (contact && crossed.length === 1 && a >= contact.xs && b <= contact.xe) {
    const id = store.identity.get(contact.name)
    if (!id) return tokenRefusal(contact)
    // a fact inside the line the customer quoted: the fact itself changes, everywhere (David's rule)
    return { ok: true, identity: id, s: a - contact.xs, e: b - contact.xs, text: mid, detached: null }
  }
  // The line's words change around its tokens: each token whose value the new words still show — the
  // value this call gives it first, then the old one — stays a token, never a copy of the value.
  const A = Math.min(a, ...crossed.map((t) => t.xs))
  const B = Math.max(b, ...crossed.map((t) => t.xe))
  let fresh = shown.slice(A, a) + mid + shown.slice(b, B)
  /** @type {TokenSpan[]} */
  const lost = []
  for (const t of crossed) {
    const now = opts.newIdentity?.get(t.name) ?? ''
    const was = shown.slice(t.xs, t.xe)
    const value = now !== '' && fresh.includes(now) ? now : was !== '' && fresh.includes(was) ? was : null
    if (value !== null) fresh = fresh.replace(value, () => `{${t.name}}`)
    else lost.push(t)
  }
  const plain = { ok: /** @type {const} */ (true), identity: null, s: toStored(u, A), e: toStored(u, B) }
  if (lost.length === 0) return { ...plain, text: fresh, detached: null }
  // a contact fact dropped from its line: two changes, the words and the fact (the fact is everywhere)
  const fact = lost.find((t) => !NAME_TOKENS.has(t.name))
  if (fact) return tokenRefusal(fact)
  if (opts.probe) return skip
  if ((opts.nameInQuote ?? NAME_IN_QUOTE) === 'refuse') return tokenRefusal(lost[0])
  return { ...plain, text: fresh, detached: field(lost[0]) }
}

/**
 * Every slot one call writes, each once, with every change of the call in it (F3 §4.1 step 6): a
 * whole-value hit becomes the new words, a part is spliced in place ("Hotline: " stays), a split
 * heading fills both lines, a token's words go to Site identity.
 *
 * 🔒 TWO PASSES, SO A LINE KNOWS THE NAME THIS SAME CALL GIVES THE SITE. `changes:[{find:"Northgate
 * Industrial", replace:"Acme Works"}, {find:"Why Northgate Industrial", replace:"Why Acme Works"}]`
 * renames the site AND keeps "Why {site.name}" — one pass wrote the line as the literal "Why Acme
 * Works", cut loose from the name the same call had just set. The first pass (`probe`) only learns
 * the values Site identity gets; the second places every change with them.
 * @param {JoomlaStore} store
 * @param {Located[]} results
 * @param {{ nameInQuote?: 'refuse' | 'line' }} [options]
 * @returns {{ ok: true, writes: JoomlaWrite[], redirect: Map<string, string>, notes: string[] } | Refusal}
 */
export function joomlaWrites(store, results, options = {}) {
  const probe = writesOnce(store, results, { probe: true })
  /** @type {Map<string, string>} */
  const newIdentity = new Map()
  if (probe.ok) for (const w of probe.writes) if (w.unit.identity) newIdentity.set(w.unit.identity, w.value)
  return writesOnce(store, results, { ...options, newIdentity })
}

/**
 * One pass of {@link joomlaWrites}.
 * @param {JoomlaStore} store
 * @param {Located[]} results
 * @param {PlaceOptions} opts
 * @returns {{ ok: true, writes: JoomlaWrite[], redirect: Map<string, string>, notes: string[] } | Refusal}
 */
function writesOnce(store, results, opts) {
  /** @type {Map<string, JoomlaWrite>} */
  const byAt = new Map()
  /** @type {Map<string, string>} target place → the identity slot written for it */
  const redirect = new Map()
  /** @type {string[]} */
  const notes = []
  /** @param {JoomlaUnit} u */
  const writeOf = (u) => {
    let w = byAt.get(u.at)
    if (!w) {
      const before = typeof u.slot.current === 'string' ? u.slot.current : ''
      w = {
        at: u.at,
        unit: u,
        slot: u.slot,
        before,
        value: before,
        changes: new Set(),
        edits: [],
        whole: null
      }
      byAt.set(u.at, w)
    }
    return w
  }
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]
    // a slot holds one line: a line break the customer typed is a space here, except in a split
    const text = plainReplace(r.change.replace, r.glyph).replace(/\s*\n\s*/g, ' ')
    for (const t of r.targets) {
      // a fragment of a line printed from several slots: its whole new value (`acrossFragments`)
      if (t.kind === 'unit' && typeof t.whole === 'string') {
        const w = writeOf(/** @type {JoomlaUnit} */ (t.unit))
        w.whole = t.whole
        w.changes.add(i)
        continue
      }
      if (t.kind === 'split') {
        const parts = t.parts ?? { a: text, b: '' }
        for (const [u, v] of /** @type {[JoomlaUnit, string][]} */ ([
          [t.a, parts.a],
          [t.b, parts.b]
        ])) {
          const w = writeOf(u)
          w.whole = v
          w.changes.add(i)
        }
        continue
      }
      for (const { unit, hits } of [{ unit: t.unit, hits: t.hits }, ...t.twins]) {
        const u = /** @type {JoomlaUnit} */ (unit)
        for (const h of hits) {
          const [s, e] = rawSpan(u, h)
          let place = {
            identity: /** @type {JoomlaUnit | null} */ (null),
            s,
            e,
            text,
            detached: /** @type {string | null} */ (null)
          }
          if (u.tokens.length > 0) {
            const got = placeInTokens(store, u, s, e, text, r.change.find, opts)
            if (!got.ok) return plan1(got.refusal, results.length, i)
            if (got.skip) continue
            place = got
          }
          const w = writeOf(place.identity ?? u)
          if (!w.edits.some((x) => x.s === place.s && x.e === place.e && x.text === place.text))
            w.edits.push({ s: place.s, e: place.e, text: place.text })
          w.changes.add(i)
          if (place.identity && u === t.unit) redirect.set(t.at, place.identity.at)
          if (place.detached) {
            const note = joomlaText('tokenLineNote', { at: u.at, field: place.detached })
            if (!notes.includes(note)) notes.push(note)
          }
        }
      }
    }
  }
  /** @type {JoomlaWrite[]} */
  const writes = []
  for (const w of byAt.values()) {
    if (w.whole !== null && w.edits.length > 0)
      return refuse('BAD_PARAMS', joomlaText('overlapError', { at: w.at }), replaceText('overlapNext'), {
        at: w.at
      })
    try {
      w.value = w.whole ?? spliceRaw(w.before, w.edits)
    } catch {
      return refuse('BAD_PARAMS', joomlaText('overlapError', { at: w.at }), replaceText('overlapNext'), {
        at: w.at
      })
    }
    if (w.value !== w.before) writes.push(w)
  }
  return { ok: true, writes, redirect, notes }
}

/**
 * A refusal of one change in a several-change call says which one (the core's `change` index).
 * @param {Refusal} r
 * @param {number} n
 * @param {number} i
 */
const plan1 = (r, n, i) => (n > 1 ? { ...r, change: i } : r)

/**
 * The links that carry a changed fact in the same block: a `tel:` whose digits are the old number, a
 * `mailto:` of the old address (F3 §4.1 step 6). A link built from a token (`tel:{contact.tel}`)
 * follows Site identity by itself and is never rewritten.
 * @param {JoomlaStore} store
 * @param {Located[]} results
 * @param {JoomlaWrite[]} writes
 * @returns {Companion[]}
 */
export function companionsOf(store, results, writes) {
  /** @type {Companion[]} */
  const out = []
  for (let i = 0; i < results.length; i += 1) {
    const { find, replace } = results[i].change
    const phone = isPhone(find) && isPhone(replace)
    if (!phone && !(isEmail(find) && isEmail(replace))) continue
    const blocks = new Set(
      writes.filter((w) => w.changes.has(i) && !w.unit.identity).map((w) => w.unit.entity)
    )
    for (const s of store.urls) {
      if (!blocks.has(String(s.entity))) continue
      const before = typeof s.current === 'string' ? s.current : ''
      if (/\{[a-zA-Z.]+\}/.test(readBraces(before))) continue
      const value = followHref(before, find, replace)
      if (value === null || value === before) continue
      const got = out.find((c) => c.at === String(s.key))
      if (got) got.changes.add(i)
      else
        out.push({
          at: String(s.key),
          slot: s,
          before,
          value,
          changes: new Set([i]),
          why: phone ? 'the link follows the number' : 'the link follows the e-mail'
        })
    }
  }
  return out
}

// ── A link's words are not its address ────────────────────────────────────────────────────────────

/** A value that is a whole address: a scheme, `www.`, or a host with a path — never a brand name. */
export const isAddress = (/** @type {string} */ s) =>
  /^(https?:\/\/|mailto:|tel:)\S+$/i.test(s.trim()) ||
  /^(www\.[^\s/]+\.[a-z]{2,}|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\/)\S*$/i.test(s.trim())

/** The ACM field a JSON path names: `["g", "g[social-label]", 0]` → `social-label`. */
const acmField = (/** @type {unknown} */ path) =>
  Array.isArray(path) && typeof path[1] === 'string' ? (/\[([^\]]+)\]$/.exec(path[1])?.[1] ?? null) : null

/** `social-label` → `social`, `btn-1-text` → `btn-1`, `text` → `text`. */
const stem = (/** @type {string} */ f) => (f.includes('-') ? f.slice(0, f.lastIndexOf('-')) : f)

/**
 * A link's address with every percent-encoded brace (`%7B`, `%7d`) read back as the brace it is. A row the Claude Cowork
 * plugin wrote into is saved through PHP `saveHTML`, and libxml2 2.9 (the Joomla site image's) percent-encodes the braces of
 * every link it serialises: the vi-VN top bar a language derivation made stores `tel:%7Bcontact.tel%7D` (L32, 05/10/2026),
 * which `plg_system_tracyidentity` 1.0.1 fills like `tel:{contact.tel}`. Only a url slot's value is read this way: a text
 * node is never encoded.
 * @param {unknown} v
 */
const readBraces = (v) =>
  String(v ?? '')
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}')

/** A `{social.*}` token that is a whole value (`{social.facebook}`, or its braces percent-encoded). */
const socialToken = (/** @type {unknown} */ v) =>
  /^\{(social\.[a-z]+)\}$/.exec(readBraces(v).trim())?.[1] ?? null

/**
 * The url slot that carries a text slot's link: the same element's `@href` (`…/li[1]/a/text()` →
 * `…/li[1]/a/@href`), or the same row of the same ACM group whose field shares the text's stem
 * (`social-label` ↔ `social-url`, `btn-1-text` ↔ `btn-1-link`, `text` ↔ `link`) or holds a social
 * token (`name` ↔ `url` = `{social.facebook}` in the social-profiles block).
 * @param {JoomlaStore} store
 * @param {Record<string, any>} slot
 * @returns {Record<string, any> | null}
 */
function linkSlotOf(store, slot) {
  const xpath = typeof slot.xpath === 'string' ? slot.xpath : ''
  for (const url of store.urls) {
    if (String(url.entity) !== String(slot.entity)) continue
    if (xpath.endsWith('/text()') && url.xpath === `${xpath.slice(0, -7)}/@href`) return url
    const tf = acmField(slot.jsonPath)
    const uf = acmField(url.jsonPath)
    if (!tf || !uf || slot.jsonPath[0] !== url.jsonPath[0] || slot.jsonPath[2] !== url.jsonPath[2]) continue
    if (stem(tf) === stem(uf) && tf !== uf) return url
    if (/^(text|label)$/.test(tf) && /^(link|url|href)$/.test(uf)) return url
    if (socialToken(url.current)) return url
  }
  return null
}

/**
 * An address sent as a link's new words: refused, with the call that sets the link itself.
 *
 * 🔒 THE WORDS OF A LINK ARE NOT ITS ADDRESS. Measured on 1.2.0 (25/09/2026): `{find:"Facebook",
 * replace:"https://facebook.com/acme", all:true}` wrote the address as the LABEL of four blocks in
 * two languages, and the link itself — `{social.facebook}`, printed from Site identity / facebook —
 * stayed empty: no url slot is a place the matcher reads. A hit is a link's words when its slot's
 * row carries a url slot or a social token, when its element is an `<a>`, or when the page shows it
 * inside one; the answer then names the slot that holds the address — Site identity's when the link
 * prints a token, so every page follows — with a ready apply, and what is not a slot is closed.
 * @param {JoomlaContext} ctx
 * @param {Located[]} results
 * @param {string} revision
 * @param {boolean} precheck
 * @returns {Refusal | null}
 */
function linkAddressRefusal(ctx, results, revision, precheck) {
  const { store } = ctx
  for (let i = 0; i < results.length; i += 1) {
    const { find, replace } = results[i].change
    if (!isAddress(replace) || isAddress(find)) continue
    // 🔒 A NUMBER OR AN E-MAIL SENT AS ITS OWN LINK IS THE NEW FACT, NOT A LINK TO SET. Measured on
    // both fixtures (25/09/2026): `{find:"8 800 550-67-90", replace:"tel:0909123456"}` answered "the
    // address of this link cannot change" on 1.2.0 (the number is Site identity's, its link a token),
    // and on 1.1.0 an e-mail sent as `mailto:` offered an apply of the English topbar link alone, the
    // words and the Russian copy left on the old address. The words are the fact: the same call with
    // the bare value writes them, and every link that carries them follows (companions, tokens).
    const bare =
      isPhone(find) && /^tel:/i.test(replace.trim())
        ? replace.trim().slice(4)
        : isEmail(find) && /^mailto:/i.test(replace.trim())
          ? replace.trim().slice(7).split('?')[0]
          : null
    if (bare !== null && results[i].targets.length > 0)
      return plan1(
        refuse(
          'VALUE_NOT_ALLOWED',
          joomlaText('linkFactError', { find }),
          joomlaText('linkFactNext', { value: bare }),
          { rule: 'link-address', at: results[i].targets[0].at }
        ),
        results.length,
        i
      )
    for (const t of results[i].targets) {
      if (t.kind !== 'unit') continue
      const u = /** @type {JoomlaUnit} */ (t.unit)
      const printed = u.tokens.find((x) => x.name.startsWith('social.'))
      const link = linkSlotOf(store, u.slot)
      const onPage = t.occ ? t.occ.unit.chainAt(t.occ.a).some((el) => el.tag === 'a' && el.href) : false
      if (!printed && !link && tagOf(u.slot) !== 'a' && !onPage) continue
      // the slot that holds the address: Site identity's for a token, else the row's own url slot
      const token =
        printed?.name ??
        socialToken(link?.current) ??
        /\{(contact\.(?:tel|email))\}/.exec(readBraces(link?.current))?.[1] ??
        null
      const idSlot = token
        ? (store.identitySlots.get(token === 'contact.tel' ? 'contact.phone' : token) ?? null)
        : null
      const slot = idSlot ?? (token ? null : link)
      if (!slot)
        return plan1(
          refuse('NOT_EDITABLE', joomlaText('linkFixedError', { find }), joomlaText('linkFixedNext'), {
            find,
            at: u.at
          }),
          results.length,
          i
        )
      // a phone or an e-mail in Site identity is the number or the address, not its link; a social
      // slot holds the whole address, so a `mailto:` sent for it is kept as sent
      const value =
        idSlot && /^contact\.(tel|email)$/.test(String(token)) && /^(tel|mailto):/i.test(replace.trim())
          ? replace.trim().replace(/^(tel|mailto):/i, '')
          : replace.trim()
      const bad = precheck ? checkSlotValue(/** @type {any} */ (slot), value) : null
      if (bad) return plan1(valueRefusal(bad, value, value), results.length, i)
      return plan1(
        refuse(
          'VALUE_NOT_ALLOWED',
          joomlaText('linkAddressError', { find, replace }),
          joomlaText('linkAddressNext', { label: cleanLabel(slot.label) || String(slot.key) }),
          {
            rule: 'link-address',
            at: u.at,
            apply: {
              action: 'content.contract',
              params: {
                operation: 'apply',
                expected_revision: revision,
                changes: { [String(slot.key)]: value }
              }
            }
          }
        ),
        results.length,
        i
      )
    }
  }
  return null
}

// ── Evidence (F3 §4.1 step 8; PLAN v2 P9) ──────────────────────────────────────────────────────────

/**
 * The words one change brings that were not there: `replace` less what it shares with `find` at
 * either end, widened to whole words. Empty when the change only removes words.
 * @param {{ find: string, replace: string }} change
 */
export function newWords({ find, replace }) {
  let p = 0
  while (p < find.length && p < replace.length && find[p] === replace[p]) p += 1
  let q = 0
  while (
    q < find.length - p &&
    q < replace.length - p &&
    find[find.length - 1 - q] === replace[replace.length - 1 - q]
  )
    q += 1
  let a = p
  let b = replace.length - q
  if (a >= b) return '' // only removed words: nothing new to find in the customer's message
  const word = (/** @type {string} */ c) => /[\p{L}\p{N}]/u.test(c)
  while (a > 0 && word(replace[a - 1])) a -= 1
  while (b < replace.length && word(replace[b])) b += 1
  const mid = replace.slice(a, b).trim()
  return /[\p{L}\p{N}]/u.test(mid) ? mid : ''
}

/**
 * `s` cut to at most `max` UTF-8 bytes, on a code point.
 * @param {string} s
 * @param {number} [max]
 */
function cutBytes(s, max = 8000) {
  if (Buffer.byteLength(s, 'utf8') <= max) return s
  let out = ''
  let n = 0
  for (const ch of s) {
    const len = Buffer.byteLength(ch, 'utf8')
    if (n + len > max) break
    out += ch
    n += len
  }
  return out
}

/**
 * The customer's sentence that carries `words` — the evidence a slot asks for: their own words, not
 * the agent's. Digits only for a `tel:` link (the customer writes "0909 123 456", the link holds
 * "0909123456"). Null when their message does not carry them.
 *
 * 🔒 EVERY MESSAGE OF THE CUSTOMER'S, LATEST FIRST, WHEN THE CALLER HAS THEM. A customer who gave the
 * words and then answered a question in a new message ("the second one") gave them all the same; a
 * search of the latest message alone called their own words missing and offered only the
 * "Invented by Tracy" road — a false record of where the words came from.
 * @param {string | readonly string[] | null | undefined} message - one message, or the customer's
 *   messages of this conversation, latest first
 * @param {string} words
 * @param {{ digits?: boolean }} [options]
 * @returns {string | null}
 */
export function customerSentence(message, words, { digits = false } = {}) {
  if (Array.isArray(message)) {
    for (const m of message) {
      const got = customerSentence(m, words, { digits })
      if (got !== null) return got
    }
    return null
  }
  if (typeof message !== 'string' || phpTrim(message) === '') return null
  if (words === '') return cutBytes(message.trim())
  const fold = digits ? (/** @type {string} */ s) => s.replace(/\D/g, '') : foldForMatch
  const want = fold(words)
  if (want === '') return null
  for (const s of message.split(/(?<=[.!?…])\s+|\n+/)) if (fold(s).includes(want)) return cutBytes(s.trim())
  return fold(message).includes(want) ? cutBytes(message.trim()) : null
}

// ── The value rules, as answers ───────────────────────────────────────────────────────────────────

/**
 * A contract-check refusal as the replace job answers it: VALUE_NOT_ALLOWED with the rule, the slot
 * and the value, and a next that fixes THIS call.
 * @param {import('./contract-check.mjs').ContractRefusal} r
 * @param {string} value
 * @param {string} replace - the change's new words, for the length a next asks of them
 * @returns {Refusal}
 */
function valueRefusal(r, value, replace) {
  const extra = { rule: r.rule, at: r.key, value: clip(value, 0, 0, 80) }
  switch (r.rule) {
    case 'max-characters': {
      const len = Number(r.length)
      const limit = Number(r.limit)
      const room = limit - (len - [...replace].length)
      return refuse(
        'VALUE_NOT_ALLOWED',
        replaceText('maxCharactersError', { what: 'the new text', len, at: r.key, limit }),
        replaceText('maxCharactersNext', { limit: room > 0 ? room : limit }),
        { ...extra, limit }
      )
    }
    case 'cannot-empty':
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('cannotEmptyError', { at: r.key }),
        joomlaText('cannotEmptyNext'),
        extra
      )
    case 'cannot-fill':
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('cannotFillError', { at: r.key }),
        joomlaText('cannotFillNext'),
        extra
      )
    case 'no-markup':
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('noMarkupError', { at: r.key }),
        joomlaText('noMarkupNext'),
        extra
      )
    case 'no-directive':
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('noDirectiveError', { at: r.key }),
        joomlaText('noDirectiveNext'),
        extra
      )
    case 'evidence':
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('evidenceError', { at: r.key, words: replace }),
        joomlaText('evidenceNext'),
        extra
      )
    default:
      return refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('urlError', { at: r.key, value }),
        joomlaText('urlNext'),
        extra
      )
  }
}

// ── The answer rows ───────────────────────────────────────────────────────────────────────────────

/**
 * The regions of this page where a target's value shows (the header and the footer both print the
 * Site identity phone): the places the customer will look.
 * @param {JoomlaContext} ctx
 * @param {Target} t
 * @param {string} find
 * @returns {string[]}
 */
function shownIn(ctx, t, find) {
  if (ctx.page === null) return []
  const u = /** @type {JoomlaUnit} */ (t.kind === 'split' ? t.a : t.unit)
  const lower = t.kind === 'split' ? `${t.a.lower} ${t.b.lower}` : t.unit.lower
  /** @type {import('./replace.mjs').Hit<StoredUnit>} */
  const probe = { unit: u, a: 0, b: u.cased.length, mode: 'text', whole: true, caseExact: true }
  /** @type {string[]} */
  const out = []
  for (const o of matchUnits(ctx.page.units, find).hits) {
    if (o.unit.hidden || o.unit.region === 'drawer' || !o.unit.lower.includes(lower)) continue
    if (ctx.hooks.anchor(probe, o) && !out.includes(o.unit.region)) out.push(o.unit.region)
  }
  return out
}

/**
 * One row per stored value the call changes (before → after, where, what), as the receipt and a
 * dryRun print them: a place whose words are Site identity's names the identity slot, and a place
 * this page does not show names the page it is on.
 *
 * 🔒 A VALUE SEVERAL CHANGES WRITE READS AS WRITTEN. One row per value, so the second change on it
 * was folded into the first's row, whose `after` showed that change alone: `changes:[{find:
 * "Hotline:", replace:"Call:"}, {find:"Hotline: 8 800 550-67-90", replace:"Hotline: 0909 123 456"}]`
 * (the next `fact-in-words` gives) wrote "Call: 0909 123 456" and answered "after": "Call: 8 800
 * 550-67-90". The row then says the whole value before and after, as the page will print it.
 * @param {JoomlaContext} ctx
 * @param {Located[]} results
 * @param {Map<string, string>} redirect
 * @param {string} path - the page the call was about
 * @param {JoomlaWrite[]} writes
 */
function rowsOf(ctx, results, redirect, path, writes) {
  const values = valuesAfter(ctx.store, writes)
  /** @type {Record<string, any>[]} */
  const rows = []
  /** @type {Map<Record<string, any>, Located>} the change each row was made for */
  const madeFor = new Map()
  for (const r of results)
    for (const t of r.targets) {
      /** @type {Record<string, any>} */
      const row = wouldOf(t, r.change)
      const to = redirect.get(t.at)
      if (to) {
        row.at = to
        row.label = cleanLabel(ctx.store.byKey.get(to)?.label)
      } else if (row.onPage === false) {
        const page = unitPath(ctx.store, /** @type {JoomlaUnit} */ (t.kind === 'split' ? t.a : t.unit))
        if (page && page !== path) row.page = page
      }
      const where = shownIn(ctx, t, r.change.find)
      if (where.length > 1) row.where = where.join(', ')
      const same = rows.find((x) => x.at === row.at)
      if (same) {
        const all = [
          ...new Set([...String(same.where ?? '').split(', '), ...String(row.where ?? '').split(', ')])
        ]
        same.where = all.filter(Boolean).join(', ') || null
        const w = writes.find((x) => x.at === same.at)
        if (w && t.kind === 'unit' && madeFor.get(same) !== r) {
          const shown = (/** @type {string} */ v) => views(expand(v, values).text, { decode: false }).cased
          same.before = clip(shown(w.before), 0, 0)
          same.after = clip(shown(w.value), 0, 0)
        }
        continue
      }
      rows.push(row)
      madeFor.set(row, r)
    }
  return rows
}

/**
 * The language editions a fact written to a block's own slots does not reach (F3 §4.1 step 10): the
 * languages the page's switcher offers less the ones the contract holds. Null when none, when no fact
 * was written that way, or when the page was not read. A Site identity value reaches every edition,
 * so it never counts.
 * @param {JoomlaContext} ctx
 * @param {Located[]} results
 * @param {JoomlaWrite[]} writes
 */
function notReachedOf(ctx, results, writes) {
  if (ctx.page === null) return null
  const fact = writes.some(
    (w) =>
      !w.unit.identity && [...w.changes].some((i) => w.unit.fact === true || isFact(results[i].change.find))
  )
  if (!fact) return null
  const hreflang = new Set(
    [...ctx.page.html.matchAll(/hreflang="([^"]+)"/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((l) => l !== 'x-default')
  )
  const served =
    hreflang.size > 0
      ? hreflang.size
      : ctx.table.switcherItem
        ? (ctx.page.html.match(ctx.table.switcherItem) ?? []).length
        : 0
  const governed = new Set(ctx.store.units.map((u) => u.lang).filter((l) => l !== null))
  for (const l of ctx.store.languages) governed.add(/** @type {string} */ (langOf(l)))
  const n = served - governed.size
  return n > 0 ? joomlaText('notReached', { n }) : null
}

// ── The job ───────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ ok: true, html: string, status?: number } | { ok: false, [key: string]: unknown }} PageRead
 * @typedef {{
 *   plan?: ReplacePlan | RestorePlan | Refusal, params?: unknown,
 *   snapshot: (fresh?: boolean) => Promise<unknown>,
 *   apply: (params: Record<string, unknown>) => Promise<unknown>,
 *   pageHtml: (path: string) => Promise<PageRead | Record<string, unknown>>,
 *   mint: (prefix: string) => string,
 *   read?: (action: string, params: Record<string, unknown>) => Promise<unknown>,
 *   write?: (action: string, params: Record<string, unknown>) => Promise<unknown>,
 *   evidenceText?: string | readonly string[] | null, confirmed?: boolean,
 *   verify?: boolean, env?: Record<string, string | undefined>, nameInQuote?: 'refuse' | 'line'
 * }} JoomlaDeps
 *   `plan`: `planReplace`'s answer (IX2 runs it after the aliases), or `params` to plan here.
 *   `snapshot(fresh)`: this turn's full inspect from call-memory, or one flight-guarded relay;
 *   `fresh` after "Content changed". `apply`: the door's `content.contract` relay. `pageHtml`: F2's
 *   `fetchPageHtml`. `mint`: call-memory's id minter — REQUIRED (D7: one minter). `evidenceText`: the
 *   customer's messages of this conversation, latest first (or the latest alone). `confirmed`: a dryRun
 *   of this same call earlier in the conversation (`confirmKey`). `nameInQuote`: {@link NAME_IN_QUOTE}.
 */

/**
 * A page read as units, the words a visitor sees first.
 *
 * 🔒 THE DRAWER'S COPIES GO LAST. Joomla prints the off-canvas menu before the header, and the core
 * files a place under the first occurrence it counted: "News" answered AMBIGUOUS "in 2 places:
 * drawer, footer", and a `where:"drawer"` is not a call that works. Units are independent, so their
 * order changes nothing else.
 * @param {string} html
 * @returns {JoomlaPage}
 */
export function pageOf(html) {
  const r = renderedUnits(html)
  const copy = (/** @type {RenderedUnit} */ u) => u.hidden || u.region === 'drawer'
  return { ...r, units: [...r.units.filter((u) => !copy(u)), ...r.units.filter(copy)], html }
}

/** @param {unknown} x - an inspect answer, or call-memory's `{answer, revision, …}` around it */
function answerOf(x) {
  const o = /** @type {Record<string, any>} */ (x && typeof x === 'object' ? x : {})
  return o.answer && typeof o.answer === 'object' && Array.isArray(o.answer.slots) ? o.answer : o
}

/**
 * Everything one snapshot decides, up to the apply: located changes, the values, their companions,
 * the evidence, and the value rules.
 * @param {JoomlaDeps} deps
 * @param {ReplacePlan} plan
 * @param {Record<string, any>} snap
 * @param {JoomlaPage | null} page
 */
function planOn(deps, plan, snap, page) {
  const { table } = contractOf(snap)
  const store = joomlaStore(snap, table)
  const pf = pageFacts(store, page, plan.path)
  /** @type {JoomlaContext} */
  const ctx = {
    store,
    table,
    pf,
    page,
    hooks: joomlaHooks(store, table, pf),
    confirmed: deps.confirmed === true
  }
  const located = locateJoomla(ctx, plan)
  if (!located.ok) {
    // The site name no slot holds is still the customer's to change: through its recorded door.
    const first =
      located.code === 'NOT_EDITABLE' && Array.isArray(located.unchanged) ? located.unchanged[0] : null
    return first?.why === WHY.siteName ? { ...located, next: joomlaText('siteNameNext') } : located
  }
  const { results } = located
  const revision = String(snap.revision ?? '')
  const precheck = contractPrecheckOn(deps.env ?? process.env)
  const linkRefusal = linkAddressRefusal(ctx, results, revision, precheck)
  if (linkRefusal) return linkRefusal
  const built = joomlaWrites(store, results, { nameInQuote: deps.nameInQuote })
  if (!built.ok) return built
  const { writes, redirect } = built
  const companions = companionsOf(store, results, writes)
  const rows = rowsOf(ctx, results, redirect, plan.path, writes)

  // 🔒 EVIDENCE IS THE CUSTOMER'S OWN SENTENCE, NEVER A LINE THE AGENT WROTE ABOUT THEM (Lee's rule,
  // `refusalNext`): a slot that asks where its words come from gets the sentence of the customer's
  // messages (latest first) that carries the new words, cut to the component's 8,000 bytes.
  /** @type {Record<string, string>} */
  const evidence = {}
  /** @type {string[]} */
  const needsEvidence = []
  /** @type {{ at: string, i: number, words: string } | null} */
  let missing = null
  for (const w of [...writes, ...companions]) {
    if (!w.slot.requiresEvidence || w.slot.requiresEvidence === '0' || w.value === w.slot.sample) continue
    /** @type {string[]} */
    const sentences = []
    let lacking = false
    for (const i of w.changes) {
      const words = newWords(results[i].change)
      const got = customerSentence(deps.evidenceText, words, { digits: /^tel:/i.test(w.value) })
      if (got === null) {
        lacking = true
        if (precheck) missing ??= { at: w.at, i, words }
      } else if (!sentences.includes(got)) sentences.push(got)
    }
    // the kill switch leaves the rule to the component: whatever was found is sent
    if (lacking && precheck) needsEvidence.push(w.at)
    else if (sentences.length > 0) evidence[w.at] = cutBytes(sentences.join(' '))
  }
  /** @type {Record<string, string>} */
  const changes = {}
  for (const w of [...writes, ...companions]) changes[w.at] = w.value
  // the apply as the agent sends it itself (T6: Tracy mints the ids), for the evidence it must add
  const apply = {
    action: 'content.contract',
    params: {
      operation: 'apply',
      expected_revision: revision,
      changes,
      ...(Object.keys(evidence).length > 0 ? { evidence } : {})
    }
  }
  // 🔒 A dryRun is never refused for evidence (D15′: it is the road that says where words are, and the
  // confirmation `countRefusal` prescribes): it answers `needsEvidence` and the apply instead.
  if (missing && !plan.dryRun)
    return plan1(
      refuse(
        'VALUE_NOT_ALLOWED',
        joomlaText('evidenceError', { at: missing.at, words: missing.words }),
        joomlaText('evidenceNext'),
        {
          rule: 'evidence',
          at: missing.at,
          value: clip(changes[missing.at] ?? '', 0, 0, 80),
          needsEvidence,
          apply
        }
      ),
      results.length,
      missing.i
    )
  if (precheck)
    for (const w of [...writes, ...companions]) {
      // a dryRun's missing evidence is answered above as needsEvidence; every other rule still holds
      const given = needsEvidence.includes(w.at) ? { ...evidence, [w.at]: 'dryRun' } : evidence
      const r = checkSlotValue(/** @type {import('./contract-check.mjs').ContractSlot} */ (w.slot), w.value, {
        evidence: given
      })
      if (r) {
        const i = [...w.changes][0] ?? 0
        return plan1(valueRefusal(r, w.value, results[i]?.change.replace ?? ''), results.length, i)
      }
    }

  /** @type {string[]} */
  const notes = [...new Set(results.flatMap((r) => r.notes))]
  for (const w of writes)
    if (w.unit.identity) {
      const note = joomlaText('identityNote', { field: w.unit.field ?? w.unit.identity })
      if (!notes.includes(note)) notes.push(note)
    }
  for (const note of built.notes) if (!notes.includes(note)) notes.push(note)
  return {
    ok: /** @type {const} */ (true),
    ctx,
    results,
    writes,
    companions,
    rows,
    changes,
    evidence,
    needsEvidence,
    apply,
    notes,
    notReached: notReachedOf(ctx, results, writes),
    revision
  }
}

/**
 * A dryRun answer cut back to {@link RECEIPT_MAX_BYTES} once this engine has added its own fields.
 *
 * 🔒 THE CORE CUTS BEFORE THE ENGINE ADDS. `dryRunAnswer` fits its answer, then the rows gain the
 * regions a value shows in, the companions, the notes, and — for a slot that asks for evidence — the
 * apply to send: measured on 1.2.0 (25/09/2026), `{find:"Vorsino", all:true, dryRun:true}` came to
 * 3,103 bytes. The same order as the core — `alsoIn`, `unchanged`, `companions`, `notes`, the labels,
 * then rows beyond the first six counted in `more` — and never the apply or the next: they are the
 * call to send, and every `after` of a cut row is in the apply's changes.
 * @param {Record<string, any>} out
 */
function fitDryRun(out) {
  const size = () => Buffer.byteLength(JSON.stringify(out), 'utf8')
  if (size() <= RECEIPT_MAX_BYTES) return out
  for (const key of ['alsoIn', 'unchanged', 'companions', 'notes']) {
    if (!(key in out)) continue
    delete out[key]
    if (size() <= RECEIPT_MAX_BYTES) return out
  }
  /** @type {Record<string, unknown>[]} */
  const rows = (Array.isArray(out.would) ? out.would : []).map((/** @type {Record<string, unknown>} */ row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'label'))
  )
  out.would = rows
  if (size() <= RECEIPT_MAX_BYTES) return out
  const before = Number(out.more ?? 0)
  for (let keep = Math.min(rows.length, 6); keep >= 1; keep -= 1) {
    out.would = rows.slice(0, keep)
    out.more = before + rows.length - keep
    if (size() <= RECEIPT_MAX_BYTES) return out
  }
  return out
}

/** @param {Record<string, any>} a */
const conflicted = (a) =>
  a.ok === false &&
  /Content changed; inspect again|conflict at operation/.test(String(a.message ?? a.error ?? ''))

/**
 * The replace job on a sealed Joomla site (F3 §4.1): the snapshot and the page read together, the
 * change located and checked, ONE apply under a new `contract-replace-…` id — and on "Content changed"
 * one fresh snapshot and a new plan with a new id; a second one is STORE_CHANGED. The answer is the
 * receipt.
 * @param {JoomlaDeps} deps
 * @returns {Promise<Record<string, unknown>>}
 */
export async function replaceOnJoomla(deps) {
  // 🔒 ONE MINTER (D7): call-memory's. A second one here (until 25/09/2026) minted ids nobody else
  // knew of whenever the wiring forgot to pass it — so a missing minter is the wiring's bug, loud.
  if (typeof deps.mint !== 'function')
    throw new TypeError("replaceOnJoomla: deps.mint is required — call-memory's minter (D7)")
  const mint = deps.mint
  const plan = deps.plan ?? planReplace(deps.params)
  if (!plan.ok) return plan
  if (plan.mode === 'restore')
    return refuse('BAD_PARAMS', joomlaText('restoreError'), joomlaText('restoreNext'), { param: 'restore' })
  const [first, read] = await Promise.all([deps.snapshot(false), deps.pageHtml(plan.path)])
  /** @type {JoomlaPage | null} */
  let page = null
  const r0 = /** @type {Record<string, any>} */ (read ?? {})
  if (r0.ok === true && typeof r0.html === 'string') {
    const status = Number(r0.status ?? 200)
    if (status === 404 || status === 410)
      return refuse(
        'NOT_FOUND',
        joomlaText('pageMissingError', { path: plan.path, status }),
        joomlaText('pageMissingNext'),
        { path: plan.path }
      )
    if (status < 400) page = pageOf(r0.html)
  }
  let snap = answerOf(first)
  // Site wide, the contact records too: a contact is not a contract slot, and "change our phone
  // everywhere" left the Contact page on the old number (#204, `replace-joomla-contacts.mjs`).
  const listDoor = deps.read
  const contactRead = plan.all === true && listDoor ? await readContacts(listDoor) : { rows: [], whole: true }
  const contacts = contactChanges(contactRead.rows, plan.changes)
  const contactPlaces = contacts.flatMap((c) => c.places)
  /** The contacts' part of an answer: listed on a dry run, written (with their own undo) otherwise. */
  const withContacts = async (/** @type {Record<string, any>} */ out) => {
    if (!contactRead.whole) out.notes = [...(out.notes ?? []), CONTACT_NOTE.cut]
    if (contacts.length === 0) return out
    if (plan.dryRun) {
      out.contacts = contactPlaces.slice(0, 10)
      out.notes = [...(out.notes ?? []), CONTACT_NOTE.dryRun(contactPlaces.length)]
      return out
    }
    const write = deps.write
    if (!write) return out
    const done = await writeContacts(write, () => mint('replace'), contacts)
    if (done.written.length) {
      out.contacts = done.written.slice(0, 10)
      out.contactsUndo = { action: 'apply.revert', params: { apply_id: done.applyId } }
      out.notes = [...(out.notes ?? []), CONTACT_NOTE.written(done.written.length)]
    }
    if (done.failed.length) {
      out.contactsFailed = done.failed
      out.notes = [...(out.notes ?? []), CONTACT_NOTE.partial]
    }
    return out
  }
  for (let attempt = 0; ; attempt += 1) {
    if (snap.ok === false) return snap
    if (!Array.isArray(snap.slots) || typeof snap.contract !== 'string' || snap.contract === '')
      return refuse('NOT_SUPPORTED_HERE', joomlaText('notSealedError'), joomlaText('notSealedNext'))
    const planned = planOn(deps, plan, snap, page)
    // No slot holds the words, a contact does: the contacts alone.
    if (!planned.ok && planned.code === 'NOT_FOUND' && contacts.length > 0)
      return await withContacts(
        plan.dryRun
          ? { ok: true, dryRun: true, platform: 'joomla', path: plan.path, count: 0, would: [] }
          : { ok: true, platform: 'joomla', path: plan.path, changed: [], next: REPLACE_NEXT.receipt }
      )
    if (!planned.ok) return planned
    const { rows, companions, writes, notes } = planned
    const companionRows = companions.map((c) => ({ at: c.at, before: c.before, after: c.value, why: c.why }))
    if (plan.dryRun) {
      const out = /** @type {Record<string, any>} */ (
        dryRunAnswer({ platform: 'joomla', path: plan.path, results: planned.results, all: plan.all })
      )
      out.would = rows.slice(0, Array.isArray(out.would) ? out.would.length : rows.length)
      if (companionRows.length > 0) out.companions = companionRows
      if (notes.length > 0) out.notes = notes
      if (plan.normalized.length > 0) out.normalized = plan.normalized
      // the same call without dryRun would be refused for these: the next is the road that is not
      if (planned.needsEvidence.length > 0) {
        out.needsEvidence = planned.needsEvidence
        out.apply = planned.apply
        out.next = joomlaText('evidenceNext')
      }
      return fitDryRun(await withContacts(out))
    }
    if (writes.length === 0)
      return await withContacts({
        ok: true,
        platform: 'joomla',
        path: plan.path,
        changed: [],
        notes: [joomlaText('already')],
        next: REPLACE_NEXT.receipt
      })
    const applyId = mint('contract-replace')
    const { changes } = planned
    const evidence = Object.keys(planned.evidence).length > 0 ? planned.evidence : undefined
    /** @type {Record<string, unknown>} */
    const params = {
      operation: 'apply',
      expected_revision: planned.revision,
      apply_id: applyId,
      request_id: requestIdOf(changes, evidence, planned.revision),
      changes,
      ...(evidence ? { evidence } : {})
    }
    // 🔒 A THROW IS A LOST ANSWER, NOT A LOST RECEIPT (as site-call's `send`: "anything that still
    // throws is read the same way"): the apply may have landed, so the answer keeps its apply_id, what
    // was planned and the outcome-unknown next — never an exception the model answers with a resend
    // under a new id.
    /** @type {Record<string, any>} */
    let answer
    try {
      answer = /** @type {Record<string, any>} */ ((await deps.apply(params)) ?? {})
    } catch (error) {
      answer = {
        ok: false,
        code: 'COWORK_WEB_UNREACHABLE',
        error: (error instanceof Error ? error.message : String(error)).slice(0, 160)
      }
    }
    if (answer.ok === true) {
      if (answer.unchanged === true)
        return {
          ok: true,
          platform: 'joomla',
          path: plan.path,
          apply_id: applyId,
          changed: [],
          notes: [joomlaText('already')],
          next: REPLACE_NEXT.receipt
        }
      /** @type {string | null} */
      let verified = null
      if (planned.ctx.page === null) verified = joomlaText('unread')
      else if (
        deps.verify !== false &&
        planned.results.some((r) => r.targets.some((t) => t.rendered === true))
      ) {
        // the write landed: a second read that throws costs the check, never the receipt
        /** @type {unknown} */
        let read = null
        try {
          read = await deps.pageHtml(plan.path)
        } catch {
          read = null
        }
        verified = verifyOn(
          read,
          planned.results,
          plan.path,
          planned.ctx.page,
          valuesAfter(planned.ctx.store, writes)
        )
      }
      const out = receipt({
        platform: 'joomla',
        path: plan.path,
        applyId,
        changed: /** @type {any} */ (rows),
        removal: plan.changes.every((c) => c.replace === ''),
        companions: companionRows,
        stillHolds: leadLeftovers(
          plan.changes,
          planned.ctx.store.units.filter((u) => u.lang === null || u.lang === planned.ctx.pf.lang),
          rows.map((x) => String(/** @type {any} */ (x).at))
        ),
        unchanged: planned.results.flatMap((r) => r.unchanged).slice(0, 4),
        alsoIn: planned.results.flatMap((r) => r.alsoIn).slice(0, 5),
        notes,
        notReached: planned.notReached,
        undo: undoOf({ platform: 'joomla', applyId })
      })
      if (verified) out.verified = verified
      if (plan.normalized.length > 0) out.normalized = plan.normalized
      return await withContacts(out)
    }
    const planRows = rows.slice(0, 6).map((row) => ({ at: row.at, before: row.before, after: row.after }))
    if (conflicted(answer)) {
      if (attempt === 0) {
        snap = answerOf(await deps.snapshot(true))
        continue
      }
      return refuse('STORE_CHANGED', joomlaText('storeChangedError'), joomlaText('storeChangedNext'), {
        planned: planRows
      })
    }
    if (outcomeUnknown(answer))
      return { ...answer, apply_id: applyId, planned: planRows, next: joomlaText('outcomeUnknownNext') }
    return {
      .../** @type {Record<string, unknown>} */ (
        withNext(answer, { platform: 'joomla', sealed: true, action: 'content.contract' })
      ),
      planned: planRows
    }
  }
}

/**
 * What each identity token prints once this apply is in: the store's values, with the ones the apply
 * writes to Site identity.
 * @param {JoomlaStore} store
 * @param {JoomlaWrite[]} writes
 */
function valuesAfter(store, writes) {
  const values = new Map(store.values)
  for (const w of writes) if (w.unit.identity) values.set(w.unit.identity, w.value)
  if (values.has('contact.phone'))
    values.set('contact.tel', (values.get('contact.phone') ?? '').replace(/[^0-9+]/g, ''))
  return values
}

/**
 * How many times `needle` occurs in the lines, without overlap.
 * @param {readonly string[]} lines
 * @param {string} needle - never empty
 */
function countIn(lines, needle) {
  let n = 0
  for (const line of lines)
    for (let i = line.indexOf(needle); i !== -1; i = line.indexOf(needle, i + needle.length)) n += 1
  return n
}

/**
 * The harness's own check after a write (F3 §4.1 step 9) — never the model's: the page read again
 * against the page read before, for every change with a place on it. Null when no change was checked:
 * no `verified` field at all.
 *
 * 🔒 THE NEW WORDS AS THE PAGE PRINTS THEM: a token in them reads as its value. "Work of {site.name}"
 * shows "Work of Northgate Industrial", and looking for the braces answered "not yet shown … may still
 * come from a cache" for a write that had landed (review, 25/09/2026).
 *
 * 🔒 "SHOWN" ONLY FOR WHAT THIS WRITE CHANGED ON THE PAGE. The check skipped an emptied value and still
 * answered "shown", so emptying the phone read back an unchanged page as `verified: "shown on /"`, and
 * new words already elsewhere on the page passed as well (review of P9, 25/09/2026): the harness's own
 * check invented a confirmation. Now each change counts on both reads: its new words appear more
 * often than before, or — an emptied value, or new words inside the old — its old words appear less
 * often, the new ones no less.
 * @param {unknown} read - the page after the write
 * @param {Located[]} results
 * @param {string} path
 * @param {JoomlaPage} before - the page read before the write
 * @param {Map<string, string>} [values] - {@link valuesAfter}
 * @returns {string | null}
 */
function verifyOn(read, results, path, before, values = new Map()) {
  const r = /** @type {Record<string, any>} */ (read ?? {})
  if (r.ok !== true || typeof r.html !== 'string') return joomlaText('unread', { path })
  const visible = (/** @type {readonly RenderedUnit[]} */ units) =>
    units.filter((u) => !u.hidden).map((u) => u.lower)
  const now = visible(renderedUnits(r.html).units)
  const was = visible(before.units)
  let checked = 0
  for (const res of results) {
    if (!res.targets.some((t) => t.rendered === true)) continue
    const words = plainReplace(res.change.replace, res.glyph).replace(/\s*\n\s*/g, ' ')
    const want = words.trim() === '' ? '' : views(values.size > 0 ? expand(words, values).text : words).lower
    const old = views(res.change.find).lower
    checked += 1
    const grew = want !== '' && countIn(now, want) > countIn(was, want)
    const kept = want === '' || countIn(now, want) >= countIn(was, want)
    const gone = old !== '' && countIn(now, old) < countIn(was, old)
    if (!grew && !(gone && kept)) return joomlaText('notShown', { path })
  }
  return checked > 0 ? joomlaText('shown', { path }) : null
}
