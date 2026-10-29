/**
 * THE REPLACE JOB ON EMDASH (PLAN v2 P11, F3 §6 under D16): read this site's published content in ONE
 * in-container exec, let the core (`replace.mjs`) decide which stored value shows the words the
 * visitor reads, and write only the fields that change in ONE more exec — each entry with ONE
 * `content_update … status:"published"` (update and publish in one MCP call), a menu label with
 * `menu_set_items`, the site title with `settings_update`. The answer is the receipt, and its undo
 * is this same job with `restore`: the exact prior values, byte for byte (D14).
 *
 * 🔒 WHY ONE ENGINE, AND WHY THE MATCHING IS HOST CODE. r2 (suite v2, 33 EmDash cases) spent 4–6
 * `tracy_emdash` reads and ~130k chars per edit finding which entry, field and language held a
 * string (C04 hotline 24 calls, C10 e-mail 28), and C05 wrote `settings.tagline`, a value the
 * template never prints. Here the page decides WHERE words are shown and a stored value counts only
 * where the page holds it whole (the core's presence rule); every rule is pure, tested code on the
 * host — the two scripts in `exec.mjs` only read and only write what they are handed (D16), each
 * with its tools hard-coded and checked before the first call, under a 45 s deadline of their own.
 *
 * 🔒 NO GET INSIDE A TOKEN-BEARING SCRIPT (D2). The page is read through `fetchPageHtml`, the one
 * road into a page (injected here as `pageHtml`), before the locate and again as the proof after the
 * write. A script that carries the agent token dials exactly one address: EmDash's MCP on loopback.
 *
 * 🔒 THE TABLES ARE THE TEMPLATE'S, KEYED BY (templateId, version) FROM `template/artifact.json`.
 * Which collections a path renders, where each Site chrome field prints and which fields no visitor
 * reads are facts of Tracy Business 1.0.0 (its README diagrams 2 and 3, the maps in
 * `structure/emdash.md`), not of EmDash. A template this module has no table for gets the generic
 * rules — every collection, presence alone, no hidden list beyond media, ids, URLs and dates — so it
 * answers AMBIGUOUS more often, never writes a place it cannot see (F3 decision 4).
 *
 * Pure except for the injected I/O (`index`, `write`, `pageHtml`), so `test/replace-emdash.test.mjs`
 * drives every road — the real scripts included — against an in-memory EmDash.
 */

import { createHash } from 'node:crypto'

import { emdashCodeOf, entryState, menuItemsForSet, revOf } from './emdash.mjs'
import {
  EMDASH_EXEC_MAX_BUFFER,
  EMDASH_INDEX_MS,
  EMDASH_WRITE_MS,
  EMDASH_WRITE_ROUNDS,
  emdashIndexArgv,
  emdashWriteArgv,
  parseEmdashIndex,
  parseEmdashWrite
} from './exec.mjs'
import { foldForMatch, renderedUnits, views } from './html-units.mjs'
import {
  REPLACE_CALL,
  REPLACE_NEXT,
  REPLACE_WHY,
  RESTORE_AT_MAX,
  RESTORE_LEAF_MAX,
  clip,
  dryRunAnswer,
  followHref,
  hitRank,
  leadLeftovers,
  locateAll,
  matchUnits,
  plannedWrites,
  receipt,
  replaceText,
  wouldOf
} from './replace.mjs'
import { withNext } from './site.mjs'
import { stoppableSleep, stoppedAnswer } from './turn-stop.mjs'

/** @typedef {import('./replace.mjs').StoredUnit} StoredUnit */
/** @typedef {import('./replace.mjs').ReplacePlan} ReplacePlan */
/** @typedef {import('./replace.mjs').RestorePlan} RestorePlan */
/** @typedef {import('./replace.mjs').RestoreItem} RestoreItem */
/** @typedef {import('./replace.mjs').Located} Located */
/** @typedef {import('./replace.mjs').LocateHooks} LocateHooks */
/** @typedef {import('./html-units.mjs').RenderedUnit} RenderedUnit */
/** @typedef {import('./html-units.mjs').UnitElement} UnitElement */
/** @typedef {import('./exec.mjs').EmdashScriptResult} EmdashScriptResult */

/**
 * @typedef {{ collection: string, id: string, slug: string, locale: string | null, status: string,
 *   version: number | null, updatedAt: string | null, liveRevisionId: string | null,
 *   draftRevisionId: string | null, translationGroup: string | null,
 *   data: Record<string, unknown> }} IndexRow
 *   One published entry as the INDEX script answers it: `content_list`'s LIVE columns (no draft
 *   merged in) plus the revision pointers `entryState` reads (D12).
 * @typedef {{ name: string, locale: string | null, items: Record<string, unknown>[] }} IndexMenu
 * @typedef {{ taxonomy: string, slug: string, locale: string | null, label: string }} IndexTerm
 * @typedef {{ served: string[] | null, locales: string[], rows: IndexRow[], menus: IndexMenu[],
 *   terms: IndexTerm[], settings: { title: string | null, tagline: string | null } | null,
 *   patterns?: Record<string, string | null>, missing?: string[] }} EmdashIndex
 *   The INDEX script's answer (`exec.mjs` `EMDASH_INDEX_SCRIPT`).
 */

/**
 * Where one stored value is written — and read again when EmDash says it moved.
 * @typedef {{ kind: 'content', collection: string, id: string, slug: string, locale: string | null,
 *   path: (string | number)[], row: IndexRow }
 *   | { kind: 'menu', name: string, locale: string | null, pos: number, item: number, menu: IndexMenu }
 *   | { kind: 'settings', key: 'title' | 'tagline' }
 *   | { kind: 'term' }} Address
 */

/**
 * @typedef {(request: Record<string, unknown>) => Promise<EmdashScriptResult>} ScriptRun
 *   One exec of a script with its request on stdin: {@link emdashScriptRoad} builds the two the host
 *   runs; tests hand in the real scripts run against an in-memory EmDash.
 */

// ── The template's own tables (D16: keyed by templateId and version) ─────────────────────────────

/**
 * @typedef {{ hidden: readonly RegExp[], regions: readonly [RegExp, readonly string[]][],
 *   menus: Readonly<Record<string, readonly string[]>>, routes: readonly [RegExp, readonly string[]][],
 *   chrome: readonly string[], crumbOnly: RegExp, entries: Readonly<Record<string, string>>,
 *   ownOnly: RegExp, facts: RegExp }} TemplateTable
 *   `hidden`: `collection#path` keys no visitor reads (matched against every stored leaf). `regions`:
 *   where a key prints (first match wins; unlisted keys print in `main`). `menus`: where each menu
 *   prints. `routes`: which collections a path renders besides the `chrome` ones (a path matching
 *   none renders any). `crumbOnly`: keys of region `title` printed in the breadcrumb but never in
 *   `<title>`. `entries`: the URL prefix of each list collection's own page, so a card is
 *   tied to the entry it links to. `ownOnly`: keys of a list entry printed on its own page and never
 *   in a card. `facts`: keys that hold a fact printed alike in every language —
 *   an address cannot be told from its words (`isFact`), so the template names it.
 */

/**
 * 🔒 TRACY BUSINESS 1.0.0 — the template of the ja-business EmDash quickstart (1.3.0 on the fleet,
 * `benchemdash01` on the bench). Read from its README (diagram 2 names every Site chrome field by
 * region; diagram 3 which collections each path reads) and checked against the rendered home,
 * about and contact pages of the bench baseline (`test/fixtures/replace/pages/emdash-*.html`):
 * - hidden: `site.title` is admin-only ("Site chrome (EN)"); `language_name` is an aria label (the
 *   switcher prints the CLDR name — r2's "English" false positive); `settings.tagline` is printed
 *   nowhere (r2 C05 wrote it and FAILED — the header prints `site.brand_sub`); the image slot
 *   texts show only while a picture is missing; the reference and form ids, the `01`–`04` numbers
 *   and the kit pages' sample data are values, not words;
 * - a post's `short_title` prints in the header's Resources panel and the article breadcrumb
 *   (`lib/chrome.ts:61`, `views/Article.astro:61`), never in a card: the home card holding the same
 *   words is the post's `title`;
 * - the brand (mark, name, slogan) is a FACT here, like Joomla's Site identity (T3′): one name in
 *   every language served;
 * - `brand_sub` is the header only (the footer prints mark and name, measured on the baseline);
 *   the contact values `hotline`, `sales_email`, `hours` and each social link's `name` print in the
 *   footer AND on the contact page's main column; a social link's `handle` and `text` only there
 *   (`components/site/Footer.astro:33-38`, `views/Contact.astro:46-63`);
 * - a page's `title`/`breadcrumb` also fills `<title>` and the breadcrumb (region `title`);
 * - a card prints a post's `title`, `excerpt`, date and a project's `title`, `summary`, `card_tag`,
 *   `cta_label` (`views/Home.astro`, `News.astro`, `Projects.astro`); the article body and lede,
 *   and a project's lede, facts, scope, gallery and quote, only its own page (`views/Article.astro`,
 *   `Project.astro`). Measured: a home card's excerpt was AMBIGUOUS with the first paragraph of the
 *   same post's body, which holds the same words and is printed only on `/news/<slug>`.
 */
/** @type {TemplateTable} */
const TRACY_BUSINESS_1 = Object.freeze({
  hidden: Object.freeze([
    /^site#(title|language_name)$/,
    /^site#slots\b/,
    /^home#(project_big|project_small_\d|client_logos\b.*)$/,
    /^contact#form$/,
    /\.number$/,
    /^pages#(template|sample\b.*)$/,
    /^settings#tagline$/
  ]),
  regions: /** @type {TemplateTable['regions']} */ (
    Object.freeze([
      [/^site#(topbar_\w+|theme_dark_label|theme_light_label)$/, ['topbar']],
      [/^site#(brand_mark|brand_name)$/, ['header', 'footer']],
      [
        /^site#(brand_sub|quote_label|resources_label|kit_title|recent_projects_title|news_column_title|resources_all_label)$/,
        ['header']
      ],
      [/^site#(hotline|sales_email|hours)$/, ['footer', 'main']],
      [/^site#social\[\d+\]\.name$/, ['footer', 'main']],
      [/^site#social\[/, ['main']],
      [/^site#(footer_\w+|copyright)$/, ['footer']],
      [/^site#home_label$/, ['title']],
      [/^posts#short_title$/, ['header', 'title']],
      [/^settings#title$/, ['title']],
      [/^[a-z_]+#(title|breadcrumb)$/, ['main', 'title']]
    ])
  ),
  menus: Object.freeze({
    topbar: ['topbar'],
    primary: ['header'],
    resources_kit: ['header'],
    footer_services: ['footer'],
    footer_company: ['footer'],
    footer_legal: ['footer']
  }),
  routes: /** @type {TemplateTable['routes']} */ (
    Object.freeze([
      [/^\/$/, ['home', 'projects', 'posts']],
      [/^\/about$/, ['about']],
      [/^\/services$/, ['services_page', 'services']],
      [/^\/services\/[^/]+$/, ['services', 'services_page']],
      [/^\/projects$/, ['projects_page', 'projects']],
      [/^\/projects\/sector\/[^/]+$/, ['projects_page', 'projects']],
      [/^\/projects\/[^/]+$/, ['projects', 'projects_page']],
      [/^\/news$/, ['news_page', 'posts']],
      [/^\/news\/(category|tag)\/[^/]+$/, ['news_page', 'posts']],
      [/^\/news\/[^/]+$/, ['posts', 'news_page']],
      [/^\/careers$/, ['careers', 'vacancies']],
      [/^\/investors$/, ['investors', 'news_page', 'posts']],
      [/^\/contact$/, ['contact']],
      [/^\/kit\/[^/]+$/, ['pages', 'news_page']],
      [/^\/search$/, ['posts', 'projects', 'services', 'pages']],
      [/^\/[^/]+$/, ['pages']]
    ])
  ),
  chrome: Object.freeze(['site']),
  crumbOnly: /^(site#home_label|posts#short_title)$/,
  entries: Object.freeze({ projects: '/projects/', posts: '/news/', services: '/services/' }),
  ownOnly:
    /^(posts#(content|lede|caption|downloads|toc|author|author_role)|projects#(lede|facts|scope|scope_title|gallery|gallery_title|quote|quote_by|next_title))\b/,
  facts:
    /^(site#(brand_(mark|name|sub)|topbar_(phone|email|address)|hotline|sales_email|hours|copyright|footer_legal_\d|social\[\d+\]\.handle)|contact#hq_address_\d|investors#contact_(mail|phone)|careers#cta_mail)$/
})

/**
 * The tables this module knows, by `<templateId>@<version>`. A version not listed gets the generic
 * rules: a later release may move a field, and a stale table would anchor it in the wrong region.
 * @type {Readonly<Record<string, TemplateTable>>}
 */
export const EMDASH_TEMPLATES = Object.freeze({
  'tracy-business@1.0.0': TRACY_BUSINESS_1,
  // 🔒 VERIFIED, NOT ASSUMED (27/09/2026): new Business sites are pinned to 1.4.x, and until this they
  // got the generic rules — no facts table, no regions, no hidden list — with nothing saying so.
  // Between 1.0.0 (ffa1ef05a) and 1.4.4 (a9917a49b) `components/site/Footer.astro`, every file of
  // `views/` and `pages/` are unchanged; Header.astro adds the narrow-screen drawer over the same
  // primary and kit menus; Topbar.astro prints the same three `topbar_*` fields in a list; Base.astro
  // changes only hreflang. Each field keeps its region, so the 1.0.0 table is these releases' table.
  // A release is listed when its views were diffed like this — never by a version pattern.
  'tracy-business@1.4.0': TRACY_BUSINESS_1,
  'tracy-business@1.4.1': TRACY_BUSINESS_1,
  'tracy-business@1.4.2': TRACY_BUSINESS_1,
  'tracy-business@1.4.3': TRACY_BUSINESS_1,
  'tracy-business@1.4.4': TRACY_BUSINESS_1,
  // 1.4.5 (27/09): views/, pages/ and components/ unchanged since 1.4.4; the seed only respells
  // "EmDash" in site#copyright (same field, same region).
  'tracy-business@1.4.5': TRACY_BUSINESS_1,
  // 1.4.6 (28/09): views/, components/ and lib/chrome.ts DID change (provenance stamps for Tracy's
  // picker), but only as `data-tracy-src` spreads, island `marks` and Portable Text renderers that
  // apply on a request carrying `X-Tracy-Preview: pick`, which this module never sends. Measured on
  // one database under both builds: 330 public pages (en, ru, zh, vi, de; every route) byte-identical
  // once the port, asset hashes and island uids are masked. Seed, pages/ and layouts/ unchanged.
  'tracy-business@1.4.6': TRACY_BUSINESS_1,
  // 1.5.0 (29/09): EmDash 1.0.1. Home and Projects read their project cards from `entry.references`
  // (the four reference fields are relation-bound since 0.41), and the 38 locales without forms got
  // theirs. Measured on the two RELEASED zips, each on its own released state (one database cannot
  // serve both: 1.0.1 migrates one way): 295 public pages (en, ru, zh, vi, de; every route), 253
  // byte-identical once port, asset hashes, island uids, ULIDs, scripts and styles are masked; the
  // other 42 are exactly the new forms (36), the Projects grid no longer repeating its featured
  // project (3) and a home card printing the project in the page's own language instead of the
  // English one (3). Every field keeps its region.
  'tracy-business@1.5.0': TRACY_BUSINESS_1,
  // 1.5.1 (29/09): only tools/forms.json (form labels of 17 locales corrected); forms are the Forms
  // plugin's, not entry fields, so no field or view moved. Diffed against 1.5.0: that one file,
  // plus the version lines and generated inventory.
  'tracy-business@1.5.1': TRACY_BUSINESS_1,
  // 1.6.0 (04/10): EmDash 1.1.0 bump only. Diffed against 1.5.1 (81e0a5473..HEAD): src/, seed/ and
  // pages/ have no change; what moved is the EmDash version pins, lockfile, artifact.json, Dockerfile,
  // tools/release.mjs and the generated inventory. Every field keeps its region. (Base 0.4.0 and
  // SaaS 1.3.0 have no table in this module, so they have nothing to extend.)
  'tracy-business@1.6.0': TRACY_BUSINESS_1,
  // 1.7.0 (07/10, TCH #1013): the customer's logo and favicon. Diffed against 1.6.0: Header.astro and
  // Footer.astro wrap the same brand_mark / brand_name / brand_sub spans in BrandLogo (shown when
  // there is no customer logo for that theme, in the same header and footer regions); Base.astro
  // prints the template icon only without a customer favicon; views/ and Topbar.astro only pass the
  // interface locale to formatDate / wordsOf; pages/ unchanged; the seed adds the brand note in
  // seed/personalize.json (the site#logo_dark image field is made by the tool, no text field). Every
  // text field keeps its region.
  'tracy-business@1.7.0': TRACY_BUSINESS_1
})

/**
 * The table for this site's template, or null (generic rules).
 * @param {unknown} artifact - the site's `template/artifact.json`.
 * @returns {TemplateTable | null}
 */
export function templateTableOf(artifact) {
  const a = isRecord(artifact) ? artifact : {}
  const key = `${String(a.templateId ?? '')}@${String(a.version ?? '')}`
  return Object.hasOwn(EMDASH_TEMPLATES, key) ? EMDASH_TEMPLATES[key] : null
}

// ── Sentences (T10: error ≤ 160 chars, next ≤ 200 — one call or one instruction) ────────────────

/**
 * The sentences only the EmDash engine answers with; the shared ones are the core's
 * `REPLACE_NEXT`. `{call}` is `REPLACE_CALL`, so the tool form (D21) changes one constant.
 */
export const EMDASH_REPLACE_NEXT = Object.freeze({
  readFailedError: 'the site did not answer the read of its content ({why}); nothing was written',
  // 🔒 THE FIRST READ FAILURE ALREADY NAMES THE ROAD THAT WORKED (round 7, 29/09/2026). The index read
  // ran to its 45 s deadline 19 times in 10 pick/chat runs (~55 s a call with the page read before it),
  // and this next said only "the same call once more": the model paid a second wait, probed `page.text`
  // (8 s, READ_FAILED), and only then used `tracy_emdash` — whose one-entry reads answered in 0.9–7 s on
  // the same sites. Three runs never left the retry and told the customer the site was silent, with
  // nothing written. A picked element's mark carries both arguments (`emdash:<collection>:<id>:<slug>`);
  // a model that had to parse it spent ~1,200 tokens of reasoning on which segment was what.
  readFailedNext:
    'once more if this site was just started; else tracy_emdash content_get {collection, id:"<slug>"} (a picked mark is emdash:<collection>:<id>:<slug>), then content_update with status:"published"',
  // The same read failed again on the same site (`replace-road.mjs` counts it): only the other road,
  // and no `page.text` probe — that page is served by the same slow site.
  readFailedAgainNext:
    'do not send it again or probe with page.text: tracy_emdash content_get {collection, id:"<slug>"} (a picked mark is emdash:<collection>:<id>:<slug>), then content_update with status:"published"',
  // The write's own pre-read of a menu: that op was never sent and the store read fine, so the road
  // around is not `content_update` (a menu is written whole, against the hash it read).
  menuReadFailedNext:
    'the same call once more; if the site stays silent, tell the customer it is not answering',
  readRefusedError: 'EmDash refused the read of its content: {why}; nothing was written',
  readRefusedNext:
    'tracy_emdash content_get {collection, id:"<slug>"} reads the entry; then one content_update changes the words',
  readBusyNext:
    'the same call once more in a moment; if EmDash refuses again, tell the customer the site is not answering',
  pendingDraftError:
    'an unpublished change waits on {what}; publishing these words would put it live too; nothing was written',
  pendingDraftNext:
    'Ask the customer whether that waiting change should go live too; if yes, tracy_emdash content_update with confirm:true. This job never publishes it.',
  marksError: '"{find}" runs across two styles of one paragraph (a link or bold words); nothing was written',
  marksNext:
    "change the words of each style run on its own: the same call once per run, find set to that run's words",
  writeRefusedError: 'EmDash refused {what}: {why}; nothing was written',
  writeRefusedNext:
    'tracy_emdash content_get {collection:"{collection}", id:"{id}"} shows that entry; one content_update changes it field by field',
  notSentError: 'the change was refused before anything was sent: {why}',
  notSentNext:
    'tracy_emdash content_get {collection, id:"<slug>"} reads the entry; then one content_update changes the words',
  storeChangedError: 'the entries moved again while this call wrote them; {n} of {m} were written',
  storeChangedNext:
    'someone else is editing this site: tell the customer what was written, and try once more later',
  movedError: 'the words in {at} changed after they were read; {n} of {m} were written',
  movedNext:
    'the same call once more finds the words where they are now; if they are gone, tell the customer',
  partialError: 'refused at {what}, {n} of {m} written: {why}',
  partialNext:
    'tell the customer in plain words what was written and what was not; the undo puts the written ones back',
  outcomeError:
    'the site did not answer the write of {what}; it may have landed ({n} of {m} written before it)',
  outcomeNext:
    '{call} {find:"{new}", replace:"{old}", dryRun:true} shows whether the new words stand; do not repeat the call',
  stoppedError: 'the site was slow: {n} of {m} entries were written, the rest never sent',
  stoppedNext:
    'send the undo exactly as given to put back what was written, then the same call once more; if it is slow again, tell the customer',
  restoreForeignError: '{at} is not a place this job writes',
  restoreGoneError: '{at} is not on this site any more; nothing was written',
  restoreGoneNext: 'tell the customer that place is gone, so the undo cannot put it back: that is an answer',
  restoreMovedError: '{at} was changed after this job wrote it; nothing was written',
  restoreMovedNext:
    'tell the customer those words were changed since, so the undo keeps them; undoRest puts back the other places: send it only if they want that',
  restoreMovedOnlyNext:
    'tell the customer those words were changed since this job wrote them, so the undo keeps them: that is an answer',
  restoredSameNote: 'already as the undo leaves it: {at}',
  menuIdsNote: 'a menu was saved again: its items keep their labels and links, their ids changed',
  missingNote: 'not read (not on this site): {what}',
  manyPlacesNote:
    '{what} prints in more than one place (where lists each): tell the customer the change shows in each',
  revNote: 'EmDash encoded a revision another way; tracy_emdash content_get gives the real one',
  shownOn: 'shown on {path}',
  notShownYet: 'written; {path} does not show the new words yet',
  notChecked: 'written; the page could not be read again to check',
  // 🔒 A PAGE THAT COULD NOT BE READ PROVES NOTHING, AND THE RECEIPT SAYS SO (round 7). With no page
  // read before the write (`page` null) the receipt only carried a note, and the plain receipt's "what
  // it says now" was answered as "the heading now reads …" for a page the door never saw: the words
  // are stored and live in EmDash, the page was never checked. The same next stands when the read
  // AFTER the write failed (`notChecked`).
  receiptUnreadNext:
    'This is the receipt: tell the customer in plain words what changed and where, and that the page could not be read to check it. Keep the undo for yourself until they ask. Read nothing back.'
})

/** Facts a sentence quotes from the call or the customer: cut to 60 characters. */
const QUOTED = new Set(['find', 'new', 'old', 'why', 'what', 'at'])

/**
 * Fill one {@link EMDASH_REPLACE_NEXT} sentence.
 * @param {keyof typeof EMDASH_REPLACE_NEXT} key
 * @param {Record<string, unknown>} [facts]
 */
export function emdashReplaceText(key, facts = {}) {
  return EMDASH_REPLACE_NEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (name === 'call') return REPLACE_CALL
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
 */
function refuse(code, error, next, extra = {}) {
  return { ok: false, code, error, next, ...extra }
}

/** The road `EMDASH_ELSEWHERE_NEXT` names for a reason, or undefined. @param {string} why @returns {string | undefined} */
const elsewhereNext = (why) =>
  Object.hasOwn(EMDASH_ELSEWHERE_NEXT, why)
    ? /** @type {Record<string, string>} */ (/** @type {unknown} */ (EMDASH_ELSEWHERE_NEXT))[why]
    : undefined

/** Why a value no door here writes is shown anyway. */
export const EMDASH_WHY = Object.freeze({
  form: 'a form label, which the Forms plugin keeps',
  term: 'a category or tag label, which its taxonomy keeps',
  template: REPLACE_WHY.template
})

/**
 * Where those two change instead: their own doors on `tracy_emdash`. Local round 23, 25/10/2026: an EmDash build was
 * told a template category "cannot change here; do not look for another way in" and kept three of them through seven
 * checks, while `taxonomy_update_term` renames one (the round before had done it).
 */
export const EMDASH_ELSEWHERE_NEXT = Object.freeze({
  [EMDASH_WHY.term]:
    'tracy_emdash taxonomy_list_terms {taxonomy}, then taxonomy_update_term {taxonomy, termSlug, label}: one language’s label, the first unless locale names another.',
  [EMDASH_WHY.form]: 'tracy_emdash form_list {id}, then form_words {id, fields:{…}}: the form stays a form.'
})

// ── Small helpers ──────────────────────────────────────────────────────────────────────────────

/** @param {unknown} v @returns {v is Record<string, any>} */
function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** @param {unknown} v */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/**
 * EmDash's class of a refusal the scripts carried: its own text (`[CONFLICT] …`), or the JSON-RPC
 * message the script prefixed with the tool's name (`content_update: …`).
 * @param {string} error
 */
const codeOfError = (error) => emdashCodeOf(error) ?? emdashCodeOf(error.replace(/^[a-z_]+:\s*/, ''))

/** EmDash's classes of a refusal that may pass on its own (a locked database, a busy door). */
const TRANSIENT = /^(INTERNAL|INTERNAL_ERROR|UNAVAILABLE|RATE_LIMITED|TIMEOUT|BUSY)$/

/** @param {unknown} v */
const sha256 = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

/** @param {(string | number)[]} path */
const pathText = (path) =>
  path.map((s, k) => (typeof s === 'number' ? `[${s}]` : k === 0 ? s : `.${s}`)).join('')

/**
 * A path as the receipt writes it (`services_items[1].text`), read back into segments; null when
 * it is not one.
 * @param {string} text
 * @returns {(string | number)[] | null}
 */
export function parsePath(text) {
  if (!/^[A-Za-z_]\w*(\[\d+\]|\.[A-Za-z_]\w*)*$/.test(text)) return null
  /** @type {(string | number)[]} */
  const out = []
  for (const m of text.matchAll(/([A-Za-z_]\w*)|\[(\d+)\]/g))
    out.push(m[2] !== undefined ? Number(m[2]) : m[1])
  return out
}

/**
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {unknown}
 */
function getIn(value, path) {
  let v = value
  for (const s of path) {
    if (typeof s === 'number') {
      if (!Array.isArray(v) || s >= v.length) return undefined
      v = v[s]
    } else {
      if (!isRecord(v) || !Object.hasOwn(v, s)) return undefined
      v = v[s]
    }
  }
  return v
}

/**
 * `container` with the leaf at `path` set to `leaf`, cloned along the way (the original is kept).
 * @param {unknown} container
 * @param {readonly (string | number)[]} path
 * @param {unknown} leaf
 * @returns {unknown}
 */
function setIn(container, path, leaf) {
  if (path.length === 0) return leaf
  const [head, ...rest] = path
  if (typeof head === 'number') {
    const list = Array.isArray(container) ? [...container] : []
    list[head] = setIn(list[head], rest, leaf)
    return list
  }
  const obj = isRecord(container) ? { ...container } : {}
  obj[head] = setIn(obj[head], rest, leaf)
  return obj
}

/**
 * A path starting with one `/`, without its query, fragment, trailing slash and served-locale prefix
 * — the key the route table reads.
 * @param {string} path
 * @param {readonly string[]} served
 */
export function routeOf(path, served) {
  let p = String(path ?? '/')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  if (p === '') p = '/'
  const seg = /^\/([^/]+)(\/.*)?$/.exec(p)
  if (seg && served.includes(seg[1])) p = seg[2] ?? '/'
  return p
}

/**
 * The collections a path renders besides the chrome, by the template's table — or null: every
 * collection (no table, a path the table does not know, or a site-wide change).
 * @param {TemplateTable | null} table
 * @param {string} route
 * @returns {string[] | null}
 */
export function routeCollections(table, route) {
  if (!table) return null
  for (const [re, list] of table.routes) if (re.test(route)) return [...new Set([...table.chrome, ...list])]
  return null
}

// ── Stored units (what EmDash holds, as the core reads it) ───────────────────────────────────────

/** Portable Text's own keys: structure, never words. */
const PT_META = new Set(['_type', '_key', 'style', 'listItem', 'marks', 'markDefs', 'level'])
/** Keys whose value is never words a visitor reads, whatever the template. */
const HIDDEN_KEY =
  /^(id|url|href|slug|src|provider|filename|mimeType|blurhash|dominantColor|storageKey|width|height)$|_url$|_id$/
/** Values that are never words: a ULID, a date, an address. */
const HIDDEN_VALUE = [
  /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^(https?:\/\/|mailto:|tel:|\/)\S*$/
]

/** A media object (image, file): its alt, caption and metadata are not the entry's words. @param {unknown} v */
const isMedia = (v) =>
  isRecord(v) && ((typeof v.provider === 'string' && typeof v.filename === 'string') || 'storageKey' in v)

/** A Portable Text block with spans. @param {unknown} v */
const isBlock = (v) => isRecord(v) && v._type === 'block' && Array.isArray(v.children)

/**
 * Every string leaf of an entry's data, with its path — Portable Text spans as `children[k].text`,
 * media objects and Portable Text structure skipped; each block's joined text handed to `onBlock`.
 * @param {unknown} v
 * @param {(string | number)[]} path
 * @param {(path: (string | number)[], value: string) => void} onLeaf
 * @param {(path: (string | number)[], text: string, spans: number) => void} onBlock
 */
function walk(v, path, onLeaf, onBlock) {
  if (typeof v === 'string') {
    onLeaf(path, v)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (isBlock(x)) {
        const spans = /** @type {unknown[]} */ (x.children).filter(
          (c) => isRecord(c) && typeof c.text === 'string'
        )
        onBlock([...path, i], spans.map((c) => /** @type {any} */ (c).text).join(''), spans.length)
      }
      walk(x, [...path, i], onLeaf, onBlock)
    })
    return
  }
  if (!isRecord(v) || isMedia(v)) return
  for (const [k, x] of Object.entries(v)) if (!PT_META.has(k)) walk(x, [...path, k], onLeaf, onBlock)
}

/**
 * @param {TemplateTable | null} table
 * @param {string} key - `collection#path`
 * @param {string} last - the path's last key
 * @param {string} value
 */
function hiddenLeaf(table, key, last, value) {
  if (value.trim() === '' || HIDDEN_KEY.test(last)) return true
  if (HIDDEN_VALUE.some((re) => re.test(value.trim()))) return true
  return table ? table.hidden.some((re) => re.test(key)) : false
}

/**
 * @param {TemplateTable | null} table
 * @param {string} key
 * @returns {string[] | null}
 */
function regionOfKey(table, key) {
  if (!table) return null
  for (const [re, regions] of table.regions) if (re.test(key)) return [...regions]
  return ['main']
}

/**
 * 🔒 F7 (27/09/2026): ONE FIELD, EVERY PLACE IT PRINTS. A receipt row's `where` used to be the one
 * region the words were found in (the core's `t.where`), or the first of the template table's list —
 * so `site#sales_email` (`['footer', 'main']`: every page's footer AND the contact page's main column)
 * changed from the home page answered `where:"footer"`, and the agent told the customer only the
 * footer changed while the Contact page changed too (measured on the stand). A field the table lists
 * in several regions is written ONCE and shows in all of them: its row names every region, joined by
 * {@link PLACES_JOIN}, and a note tells the agent to say so ({@link manyPlacesNotes}).
 */
const PLACES_JOIN = ' + '

/**
 * Every region of a table entry, as one `where`; null when the table knows none.
 * @param {readonly string[] | null | undefined} regions
 * @returns {string | null}
 */
const placesOf = (regions) => (regions && regions.length > 0 ? regions.join(PLACES_JOIN) : null)

/**
 * A receipt row with every region its stored value prints in, when there is more than one.
 * @template {{ where: string | null }} R
 * @param {R} row
 * @param {import('./replace.mjs').Target} t
 * @returns {R}
 */
function everyPlace(row, t) {
  const region = (t.kind === 'split' ? t.a : t.unit).region
  return Array.isArray(region) && region.length > 1 ? { ...row, where: region.join(PLACES_JOIN) } : row
}

/**
 * One note per row whose value prints in more than one place.
 * @param {readonly { at: string, where: string | null, label?: string }[]} rows
 * @returns {string[]}
 */
function manyPlacesNotes(rows) {
  return rows
    .filter((r) => typeof r.where === 'string' && r.where.includes(PLACES_JOIN))
    .map((r) => emdashReplaceText('manyPlacesNote', { what: r.label ?? r.at }))
}

/**
 * The order `menuItemsForSet` writes a menu in (parents before children), as indexes into its
 * `items`: the stored position of an item is its place in that order, so a label written at
 * position k is read back at k — the undo's `at` stays true after the menu is saved again.
 * @param {readonly Record<string, unknown>[]} items
 */
function menuOrder(items) {
  return menuItemsForSet(items.map((it, k) => ({ ...it, label: String(k) }))).map((o) => Number(o.label))
}

/**
 * @typedef {{ units: StoredUnit[], addr: Map<string, Address>, blocks: (import('./replace.mjs').TextView & { at: string, spans: number })[] }} Store
 */

/**
 * The stored units of an index: one per non-empty string leaf of every published entry (hidden
 * keys left out), one per menu label, the site title, and the taxonomy terms as NOT writable.
 * `at` is the stable place the answers print — `<collection>/<slug>@<locale>#<path>`,
 * `menu:<name>@<locale>[<k>]`, `settings#title`; `place` is the same field in every language (the
 * core's `twins` reach it); `record` is one entry in one language (a two-line heading pairs two
 * fields of it).
 * @param {EmdashIndex} index
 * @param {TemplateTable | null} table
 * @returns {Store}
 */
export function storeOf(index, table) {
  /** @type {StoredUnit[]} */
  const units = []
  /** @type {Map<string, Address>} */
  const addr = new Map()
  /** @type {Store['blocks']} */
  const blocks = []
  for (const row of index.rows ?? []) {
    if (!isRecord(row) || row.status !== 'published' || !isRecord(row.data)) continue
    const loc = row.locale ?? ''
    const group = row.translationGroup ?? row.id
    walk(
      row.data,
      [],
      (path, value) => {
        const p = pathText(path)
        const key = `${row.collection}#${p}`
        if (hiddenLeaf(table, key, String(path[path.length - 1]), value)) return
        const at = `${row.collection}/${row.slug}@${loc}#${p}`
        units.push({
          ...views(value, { decode: false }),
          at,
          raw: value,
          record: `${row.collection}:${row.id}`,
          label: `${row.collection} · ${p}`,
          region: regionOfKey(table, key),
          lang: row.locale,
          place: `${row.collection}:${group}#${p}`,
          writable: true,
          fact: table ? table.facts.test(key) : false
        })
        addr.set(at, {
          kind: 'content',
          collection: row.collection,
          id: row.id,
          slug: row.slug,
          locale: row.locale,
          path,
          row
        })
      },
      (path, text, spans) => {
        if (spans > 1)
          blocks.push({
            ...views(text, { decode: false }),
            at: `${row.collection}/${row.slug}@${loc}#${pathText(path)}`,
            spans
          })
      }
    )
  }
  for (const menu of index.menus ?? []) {
    if (!isRecord(menu) || !Array.isArray(menu.items)) continue
    const items = menu.items.filter(isRecord)
    const order = menuOrder(items)
    order.forEach((k, pos) => {
      const label = items[k]?.label
      if (typeof label !== 'string' || label.trim() === '') return
      const at = `menu:${menu.name}@${menu.locale ?? ''}[${pos}]`
      units.push({
        ...views(label, { decode: false }),
        at,
        raw: label,
        record: `menu:${menu.name}@${menu.locale ?? ''}`,
        label: `menu ${menu.name} · item ${pos + 1}`,
        region: table ? [...(table.menus[menu.name] ?? ['main'])] : null,
        lang: menu.locale,
        place: `menu:${menu.name}[${pos}]`,
        writable: true
      })
      addr.set(at, { kind: 'menu', name: menu.name, locale: menu.locale, pos, item: k, menu })
    })
  }
  const settings = isRecord(index.settings) ? index.settings : null
  for (const key of /** @type {const} */ (['title', 'tagline'])) {
    const value = settings?.[key]
    if (typeof value !== 'string' || hiddenLeaf(table, `settings#${key}`, key, value)) continue
    const at = `settings#${key}`
    units.push({
      ...views(value, { decode: false }),
      at,
      raw: value,
      record: 'settings',
      label: `site ${key} (settings)`,
      region: table ? regionOfKey(table, at) : null,
      lang: null,
      place: at,
      writable: true
    })
    addr.set(at, { kind: 'settings', key })
  }
  for (const term of index.terms ?? []) {
    if (!isRecord(term) || typeof term.label !== 'string' || term.label.trim() === '') continue
    const at = `term:${term.taxonomy}/${term.slug}@${term.locale ?? ''}`
    units.push({
      ...views(term.label, { decode: false }),
      at,
      raw: term.label,
      record: at,
      label: `${term.taxonomy} term`,
      region: table ? ['main'] : null,
      lang: term.locale,
      place: at,
      writable: false,
      why: EMDASH_WHY.term
    })
    addr.set(at, { kind: 'term' })
  }
  return { units, addr, blocks }
}

// ── The page (where words are shown) ─────────────────────────────────────────────────────────────

/** @param {string} href */
function hrefPath(href) {
  try {
    return new URL(href, 'http://page.invalid').pathname.replace(/\/+$/, '') || '/'
  } catch {
    return null
  }
}

/**
 * The links of every card (`<article>`) on the page: a card ties the words in it to the entry it
 * links to — ten projects share "Discuss a similar project →", and only the card's own link says
 * which one this is.
 * @param {readonly RenderedUnit[]} units
 * @returns {Map<UnitElement, Set<string>>}
 */
function cardLinks(units) {
  /** @type {Map<UnitElement, Set<string>>} */
  const out = new Map()
  for (const u of units) {
    const card = u.chain.find((el) => el.tag === 'article')
    if (!card) continue
    let set = out.get(card)
    if (!set) out.set(card, (set = new Set()))
    for (const a of u.atoms) if (a.a?.href) set.add(/** @type {string} */ (hrefPath(a.a.href)))
    for (const el of u.chain) if (el.href) set.add(/** @type {string} */ (hrefPath(el.href)))
  }
  return out
}

/**
 * An address's path, without its origin, query or trailing slash: `/` stays `/`.
 * @param {unknown} address
 */
function pathOnly(address) {
  let path = String(address)
  try {
    path = new URL(path, 'http://site.invalid').pathname
  } catch {
    path = path.split(/[?#]/)[0]
  }
  return path.replace(/(.)\/+$/, '$1')
}

/**
 * What the template knows the core does not: where a stored value may show (its region, and for a
 * list entry, its own card or its own page), why words have no door, and each field's copies in the
 * other languages served.
 * @param {{ table: TemplateTable | null, addr: Map<string, Address>, page: RenderedUnit[] | null,
 *   route: string, twins?: Map<string, StoredUnit[]>, patterns?: Record<string, string | null> | null }} input
 * @returns {LocateHooks}
 */
function hooksOf({ table, addr, page, route, twins, patterns = null }) {
  const cards = page ? cardLinks(page) : new Map()
  /** The list entry this path is the page of, if any. */
  const own = table
    ? Object.entries(table.entries).find(
        ([, prefix]) => route.startsWith(prefix) && /^[^/]+$/.test(route.slice(prefix.length))
      )
    : undefined
  // 🔒 WITH NO TABLE, AN ENTRY'S PAGE IS NAMED BY ITS SLUG (lrsweep rig, Tracy Base 0.5.6, 25/10/2026): every service
  // entry's body opened with the same heading, and on one service's page all 52 entries anchored it, so the call
  // answered TOO_MANY on every round. On a path whose last segment is the slug of an entry, the other entries of
  // that collection show only in a card that links their page.
  // The same holds across collections, in the main column (a person's and a post's body opened with the same
  // heading; /pricing and the home page each an entry of its own collection holding the same tiers): there another
  // collection's entry shows only in a card linking a page that ends with its slug. Outside the main column what
  // every page prints (a footer's entry) is still found by presence.
  const last = /\/([^/]+)\/?$/.exec(route)?.[1] ?? null
  const base = last === null ? null : route.slice(0, route.lastIndexOf(last))
  const slugged = new Set()
  if (!table && last !== null)
    for (const a of addr.values()) if (a.kind === 'content' && a.slug === last) slugged.add(a.collection)
  // 🔒 FIRST BY THE COLLECTION'S OWN `urlPattern` (lrsweep rig, Tracy Base 0.5.6, 25/10/2026): `/` has no slug, so
  // the home page counted every page collection's pricing tiers ($24, $96, $0 counted 2 for 1). An entry whose
  // pattern, its slug filled, is this route is the page's own; in the main column any other entry with a page of
  // its own shows only in a card linking that page, and one with no page (the site's chrome) is found by presence.
  // The same reading as the inventory's routes (`agent-demo-inventory.js`).
  const urlOf = (/** @type {Address} */ a) => {
    const pattern = a.kind === 'content' ? patterns?.[a.collection] : null
    return typeof pattern === 'string'
      ? pathOnly(pattern.replace('{slug}', /** @type {any} */ (a).slug))
      : null
  }
  const here = pathOnly(route)
  const routed = new Set()
  if (!table && patterns)
    for (const a of addr.values())
      if (a.kind === 'content' && urlOf(a) === here) routed.add(`${a.collection}/${a.slug}`)
  return {
    anchor(hit, occ) {
      const r = hit.unit.region
      const o = occ.unit.region
      // 🔒 THE HIT'S OWN REGION, STRICTLY, WHEN THE TABLE NAMES IT. F3 §6.2.4 let a main-column
      // value anchor in the header and footer too (for the Resources panel, which Tracy Business
      // renders in the browser, not in the page read) and any value anchor in `<title>`. Measured
      // on the bench home, both made false second places: the hh.ru handle "Northgate Industrial"
      // (printed on /contact only) inside the header logo and inside `<title>`, beside
      // `settings.title`. The table names every key the header, footer and `<title>` print.
      if (Array.isArray(r) && !r.includes(o)) return false
      const a = addr.get(hit.unit.at)
      if (!table && routed.size > 0 && a?.kind === 'content' && o === 'main') {
        const url = urlOf(a)
        if (url === null || routed.has(`${a.collection}/${a.slug}`)) return true
        const card = occ.unit.chain.find((el) => el.tag === 'article')
        const links = card ? cards.get(card) : undefined
        return links !== undefined && [...links].some((h) => pathOnly(h) === url)
      }
      if (
        !table &&
        routed.size === 0 &&
        a?.kind === 'content' &&
        slugged.size > 0 &&
        !slugged.has(a.collection) &&
        o === 'main'
      ) {
        const card = occ.unit.chain.find((el) => el.tag === 'article')
        const links = card ? cards.get(card) : undefined
        return links !== undefined && [...links].some((h) => h.replace(/\/$/, '').endsWith(`/${a.slug}`))
      }
      if (
        !table &&
        routed.size === 0 &&
        a?.kind === 'content' &&
        slugged.has(a.collection) &&
        a.slug !== last
      ) {
        const card = occ.unit.chain.find((el) => el.tag === 'article')
        return cards.get(card)?.has(`${base}${a.slug}`) ?? false
      }
      if (!table || !a || a.kind !== 'content') return true
      // the breadcrumb, not `<title>`: both are region `title`
      if (o === 'title' && occ.unit.inTitle && table.crumbOnly.test(`${a.collection}#${pathText(a.path)}`))
        return false
      const prefix = table.entries[a.collection]
      if (!prefix) return true
      const url = `${prefix}${a.slug}`
      // an article's body is on its own page only, even inside the card that links there
      if (table.ownOnly.test(`${a.collection}#${pathText(a.path)}`)) return route === url
      const card = occ.unit.chain.find((el) => el.tag === 'article')
      const links = card ? cards.get(card) : undefined
      if (links && [...links].some((h) => h.startsWith(prefix))) return links.has(url)
      if (own && own[1] === prefix) return route === url
      return true
    },
    why(occ) {
      if (occ.unit.inForm) return EMDASH_WHY.form
      return EMDASH_WHY.template
    },
    ...(twins
      ? {
          twins: (unit) => (twins.get(unit.place ?? unit.at) ?? []).filter((u) => u.at !== unit.at)
        }
      : {})
  }
}

// ── The two execs (the host hands in `run`) ──────────────────────────────────────────────────────

/** The pause before an index read that failed at once is asked again. */
export const EMDASH_INDEX_RETRY_PAUSE_MS = 3_000
/** An index read is asked again only when it failed within this long; a slower failure is a slow site. */
export const EMDASH_INDEX_RETRY_WITHIN_MS = 10_000

/**
 * The replace job's two execs as the host runs them: the container's own node AS ROOT with the
 * request on stdin (`emdashIndexArgv` / `emdashWriteArgv`), bounded by the docker client's timeout
 * AND the script's own 45 s deadline, parsed into one {@link EmdashScriptResult}. Docker's own words
 * never reach the answer (T10): a failure is named by its kind.
 *
 * 🔒 THE INDEX READ FAILING AT ONCE IS ASKED ONCE MORE; A SLOW FAILURE IS NOT, AND THE WRITE NEVER IS.
 * A site that is starting or restarting refuses the loopback call in a moment (`fetch failed`,
 * `HTTP 502`, a container that is not up yet), and a second read a few seconds later finds it ready:
 * the model then never sees a refusal. A read that ran to the script's 45 s deadline is another
 * kind of failure — the site is overloaded, and a second wait would double a 55 s call (measured in
 * round 7: 19 such refusals, each 45.7–49.3 s in the index phase, while `tracy_emdash`'s one-entry
 * reads answered in under 8 s on the same sites). The read is safe to repeat (the script only reads: its
 * tools are checked against a list of read-only ones); the WRITE exec is never repeated here — an
 * answer lost after the send may have landed. Worst case for one index read: 10 s + 3 s + 60 s.
 *
 * 🔒 STOP (review C2, `turn-stop.mjs`): with the turn's `signal` aborted no exec starts — `stopped`, nothing
 * sent — and the index retry's pause ends at once. An exec already running is never killed: a write in it
 * may be landing, and its answer is read as it comes.
 * @param {{ run: import('./page.mjs').Run, container: string,
 *   sleep?: (ms: number) => Promise<unknown>, now?: () => number, signal?: AbortSignal | null }} input
 * @returns {{ index: ScriptRun, write: ScriptRun }}
 */
export function emdashScriptRoad({ run, container, sleep: givenSleep, now = Date.now, signal = null }) {
  const sleep = stoppableSleep(givenSleep, signal)
  /**
   * @param {() => string[]} argv
   * @param {Record<string, unknown>} request
   * @param {number} timeoutMs
   * @param {(stdout: unknown) => EmdashScriptResult} parse
   * @returns {Promise<EmdashScriptResult>}
   */
  const exec = async (argv, request, timeoutMs, parse) => {
    if (signal?.aborted) return { ok: false, kind: 'stopped', error: 'the customer stopped the turn' }
    /** @type {import('./page.mjs').ExecResult} */
    let res
    try {
      res = await run({
        argv: argv(),
        stdin: JSON.stringify(request),
        timeoutMs,
        maxBuffer: EMDASH_EXEC_MAX_BUFFER
      })
    } catch {
      return { ok: false, kind: 'transport', error: 'the site container could not be reached' }
    }
    const got = parse(res?.stdout ?? '')
    if (got.ok) return got
    if (got.kind === 'transport' || got.kind === 'cut')
      return res?.timedOut
        ? { ok: false, kind: 'transport', error: `no answer in ${Math.round(timeoutMs / 1000)} s` }
        : { ok: false, kind: got.kind, error: 'the site container sent no answer this job can read' }
    return got
  }
  /** @param {Record<string, unknown>} request */
  const indexOnce = (request) =>
    exec(() => emdashIndexArgv({ container }), request, EMDASH_INDEX_MS, parseEmdashIndex)
  return {
    index: async (request) => {
      const started = now()
      const first = await indexOnce(request)
      if (first.ok || !failedAtOnce(first) || now() - started > EMDASH_INDEX_RETRY_WITHIN_MS) return first
      await sleep(EMDASH_INDEX_RETRY_PAUSE_MS)
      return indexOnce(request)
    },
    write: (request) => exec(() => emdashWriteArgv({ container }), request, EMDASH_WRITE_MS, parseEmdashWrite)
  }
}

/**
 * Whether a failed index read may be a passing one: the call to the site failed (`site`: no
 * connection, a 5xx, an answer that was not JSON-RPC) or the exec did not run (`transport`), and the
 * site did not answer no with a 4xx (a token or a right it lacks is the same on the second try).
 * `deadline`, `cut`, `no-token`, `tool` and `refused` are never asked again.
 * @param {EmdashScriptResult} got
 */
function failedAtOnce(got) {
  if (got.ok || (got.kind !== 'site' && got.kind !== 'transport')) return false
  return !/\bHTTP 4\d\d\b/.test(got.error)
}

/**
 * NO_TOKEN with the custody next `refusalNext` writes (the one sentence for it, D1): the script
 * stopped at its prelude, so nothing was read or sent.
 * @param {string} error
 * @param {string | null} label
 * @returns {Record<string, unknown>}
 */
function noToken(error, label) {
  return /** @type {Record<string, unknown>} */ (
    withNext({ ok: false, code: 'NO_TOKEN', error, ...(label ? { label } : {}) })
  )
}

/**
 * The refusal an INDEX failure answers with; nothing was written.
 * @param {EmdashScriptResult} got
 * @param {string | null} label
 * @returns {Record<string, unknown>}
 */
function readRefusal(got, label) {
  const g = /** @type {{ kind: string, error: string }} */ (got)
  if (g.kind === 'no-token') return noToken(g.error, label)
  if (g.kind === 'stopped') return stoppedAnswer()
  if (g.kind === 'tool' || g.kind === 'refused') {
    const code = codeOfError(g.error)
    // 🔒 A PASSING FAULT IS NOT A PERMANENT ANSWER: `[INTERNAL_ERROR] database is locked` on one
    // `content_list` fails the whole read (the INDEX script skips only `[NOT_FOUND]`), and its next
    // is the same call again, never a road around the job.
    return refuse(
      'TOOL_FAILED',
      emdashReplaceText('readRefusedError', { why: g.error }),
      emdashReplaceText(code !== null && TRANSIENT.test(code) ? 'readBusyNext' : 'readRefusedNext'),
      { emdash: code }
    )
  }
  const why = g.kind === 'deadline' ? 'it ran past its deadline' : g.error
  return refuse(
    'SITE_UNREACHABLE',
    emdashReplaceText('readFailedError', { why }),
    emdashReplaceText('readFailedNext')
  )
}

// ── Languages ──────────────────────────────────────────────────────────────────────────────────

/**
 * The language of the page, before the served list is known: its `<html lang>`, else a locale prefix
 * the template serves under (`/vi/…`), else the template's default.
 * @param {{ lang: string | null } | null} page
 * @param {string} path
 * @param {unknown} artifact
 * @returns {string | null}
 */
function pageLocaleGuess(page, path, artifact) {
  const locales = isRecord(artifact) && isRecord(artifact.locales) ? artifact.locales : {}
  if (page?.lang) return String(page.lang).trim().replace('_', '-')
  const seg = /^\/([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)(?:\/|$)/.exec(path)?.[1]
  if (seg && Array.isArray(locales.prefixed) && locales.prefixed.includes(seg)) return seg
  return typeof locales.default === 'string' ? locales.default : null
}

/**
 * `guess` as one of the served locales: itself, its primary tag (`en-US` → `en`), the template's
 * default, or the only one served. Null when this site serves no list of locales.
 * @param {string | null} guess
 * @param {readonly string[] | null} served
 * @param {unknown} artifact
 */
function servedLocale(guess, served, artifact) {
  if (!served || served.length === 0) return guess
  if (guess && served.includes(guess)) return guess
  const primary = guess ? guess.toLowerCase().split('-')[0] : null
  const hit = primary
    ? served.find((l) => l.toLowerCase() === primary || l.toLowerCase().split(/[-_]/)[0] === primary)
    : undefined
  if (hit) return hit
  const locales = isRecord(artifact) && isRecord(artifact.locales) ? artifact.locales : {}
  if (typeof locales.default === 'string' && served.includes(locales.default)) return locales.default
  return served[0]
}

// ── Writing ────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ at: string, before: string, value: string }} Write
 * @typedef {{ tool: string, args: Record<string, unknown>, menuHash?: string }} Op
 * @typedef {{ op: Op, writes: Write[], what: string, pending: boolean, noRev: boolean }} PlannedOp
 */

/**
 * The ops that write `writes`: ONE `content_update` per entry — by its ULID (a slug with no locale
 * names the `af` entry, measured 24/09), its locale, `_rev` = base64 of `<version>:<updatedAt>`
 * (EmDash's own `encodeRev`, P4's `revOf`), only the TOP-LEVEL fields touched, each sent whole (a
 * repeater or Portable Text array with one leaf changed — EmDash merges at the top level), and
 * `status:"published"`; one `menu_set_items` per menu with every item, each label as indexed but
 * the changed ones, plus the sha256 of the items the plan was built on (menus carry no `_rev`); one
 * `settings_update` for the site title.
 * @param {readonly Write[]} writes
 * @param {Map<string, Address>} addr
 * @returns {PlannedOp[]}
 */
export function buildOps(writes, addr) {
  /** @type {Map<string, { a: Address, writes: Write[] }>} */
  const groups = new Map()
  for (const w of writes) {
    const a = addr.get(w.at)
    if (!a || a.kind === 'term') continue
    const key =
      a.kind === 'content'
        ? `content:${a.collection}:${a.id}`
        : a.kind === 'menu'
          ? `menu:${a.name}@${a.locale ?? ''}`
          : `settings:${a.key}`
    const g = groups.get(key) ?? { a, writes: [] }
    g.writes.push(w)
    groups.set(key, g)
  }
  /** @type {PlannedOp[]} */
  const out = []
  for (const { a, writes: ws } of groups.values()) {
    if (a.kind === 'content') {
      /** @type {Record<string, unknown>} */
      const data = {}
      for (const w of ws) {
        const wa = /** @type {Extract<Address, { kind: 'content' }>} */ (addr.get(w.at))
        const top = String(wa.path[0])
        const base = Object.hasOwn(data, top) ? data[top] : clone(a.row.data[top])
        data[top] = setIn(base, wa.path.slice(1), w.value)
      }
      const rev = revOf(a.row)
      out.push({
        op: {
          tool: 'content_update',
          args: {
            collection: a.collection,
            id: a.id,
            ...(a.locale ? { locale: a.locale } : {}),
            _rev: rev ?? '',
            data,
            status: 'published'
          }
        },
        writes: ws,
        what: `${a.collection}/${a.slug}@${a.locale ?? ''}`,
        pending: entryState(a.row) === 'pendingDraft',
        noRev: rev === null
      })
    } else if (a.kind === 'menu') {
      const items = a.menu.items.filter(isRecord).map((it) => ({ ...it }))
      for (const w of ws) {
        const wa = /** @type {Extract<Address, { kind: 'menu' }>} */ (addr.get(w.at))
        items[wa.item] = { ...items[wa.item], label: w.value }
      }
      out.push({
        op: {
          tool: 'menu_set_items',
          args: { name: a.name, locale: a.locale ?? '', items: menuItemsForSet(items) },
          menuHash: sha256(a.menu.items)
        },
        writes: ws,
        what: `menu ${a.name}@${a.locale ?? ''}`,
        pending: false,
        noRev: false
      })
    } else if (a.kind === 'settings') {
      out.push({
        op: { tool: 'settings_update', args: { [a.key]: ws[ws.length - 1].value } },
        writes: ws,
        what: `the site ${a.key}`,
        pending: false,
        noRev: false
      })
    }
  }
  return out
}

/**
 * The address of `a` in a fresh index, and the value it holds there — for the one re-read after
 * EmDash said an entry or a menu moved. Null when the place is gone.
 * @param {Address} a
 * @param {EmdashIndex} index
 * @returns {{ addr: Address, value: unknown } | null}
 */
function refresh(a, index) {
  if (a.kind === 'content') {
    const row = (index.rows ?? []).find(
      (r) => r.collection === a.collection && r.id === a.id && r.status === 'published'
    )
    return row ? { addr: { ...a, row }, value: getIn(row.data, a.path) } : null
  }
  if (a.kind === 'menu') {
    const menu = (index.menus ?? []).find(
      (m) => m.name === a.name && (m.locale ?? null) === (a.locale ?? null)
    )
    if (!menu) return null
    const items = menu.items.filter(isRecord)
    const item = menuOrder(items)[a.pos]
    return item === undefined ? null : { addr: { ...a, menu, item }, value: items[item]?.label }
  }
  if (a.kind === 'settings') {
    /** @type {Record<string, unknown>} */
    const s = isRecord(index.settings) ? index.settings : {}
    return { addr: a, value: s[a.key] }
  }
  return null
}

/**
 * The index request that reads again every place of `writes`.
 * @param {readonly Write[]} writes
 * @param {Map<string, Address>} addr
 */
function rereadRequest(writes, addr) {
  const locales = new Set()
  const collections = new Set()
  const menus = new Set()
  let settings = false
  for (const w of writes) {
    const a = addr.get(w.at)
    if (!a) continue
    if (a.kind === 'content') {
      collections.add(a.collection)
      if (a.locale) locales.add(a.locale)
    } else if (a.kind === 'menu') {
      menus.add(a.name)
      if (a.locale) locales.add(a.locale)
    } else if (a.kind === 'settings') settings = true
  }
  return {
    ...(locales.size > 0 ? { locales: [...locales] } : {}),
    collections: [...collections],
    menus: menus.size > 0 ? [...menus] : false,
    terms: false,
    settings
  }
}

/**
 * @typedef {{ ok: true, landed: Write[], notes: string[] }
 *   | { ok: false, answer: Record<string, unknown> }} WriteOutcome
 */

/**
 * Send the ops, in order, and say what stands. A `[CONFLICT]` (an entry's revision moved) or a
 * changed menu at op i → ONE re-read of the places not yet written: each must still hold the value
 * the plan was built on (else `STORE_CHANGED` naming it — someone changed those very words), and
 * the rebuilt ops are sent once; a second move → `STORE_CHANGED` with what was written.
 *
 * 🔒 A SLOW SITE IS WAITED ON, NOT UNDONE. A run the script's deadline stopped between two ops
 * (the rest never sent) goes on with the rest, each run under a deadline of its own, as long as the
 * last one wrote something ({@link EMDASH_WRITE_ROUNDS} runs in all). Measured 27/09 on a loaded
 * host: 40 languages of one phone number stopped at 25 and then 29 of 40, and the agent sent the undo
 * both times and asked the customer to wait; every landed op was already right.
 *
 * 🔒 AN ANSWER THAT NEVER CAME IS "MAY HAVE LANDED", NEVER "NOTHING WAS WRITTEN". An op sent whose
 * answer was lost (the script's `inFlight`, or no line at all from the exec) is `OUTCOME_UNKNOWN`,
 * and its next is the replace job's own dryRun with the NEW words — it answers where they stand now
 * — never the same call again: a repeat would find the old words gone and report NOT_FOUND, or
 * worse, write twice where the new words contain the old ones.
 * @param {{ write: ScriptRun, index: ScriptRun, label: string | null, planned: PlannedOp[],
 *   addr: Map<string, Address>, change: { find: string, replace: string } | null,
 *   onRevFormula?: (ok: boolean) => void }} input
 * @returns {Promise<WriteOutcome>}
 */
async function writeAll({ write, index, label, planned, addr, change, onRevFormula }) {
  /** @type {Write[]} */
  const landed = []
  /** @type {string[]} */
  const notes = []
  const total = planned.length
  let doneOps = 0
  let todo = planned
  /** @param {Write[]} ws */
  const ats = (ws) => ws.map((w) => w.at).slice(0, 8)
  const undo = () => emdashUndo(landed)
  let rereads = 0
  let runs = 1
  for (;;) {
    const got = await write({ ops: todo.map((p) => p.op) })
    if (!got.ok) {
      const g = /** @type {{ kind: string, error: string }} */ (got)
      // No token: the script stopped at its prelude, so nothing of THIS run was sent.
      if (g.kind === 'no-token')
        return {
          ok: false,
          answer:
            landed.length === 0
              ? noToken(g.error, label)
              : refuse(
                  'PARTIAL',
                  emdashReplaceText('partialError', {
                    what: todo[0].what,
                    n: doneOps,
                    m: total,
                    why: 'no agent token'
                  }),
                  emdashReplaceText('partialNext'),
                  {
                    written: ats(landed),
                    notWritten: ats(todo.flatMap((p) => p.writes)),
                    undo: undo()
                  }
                )
        }
      // The customer's Stop between two runs: nothing of this run was sent; what landed before it stays
      // named, so the receipt (and the site's changed stamp) still says what was written.
      if (g.kind === 'stopped')
        return {
          ok: false,
          answer:
            landed.length === 0
              ? stoppedAnswer()
              : stoppedAnswer({
                  written: ats(landed),
                  notWritten: ats(todo.flatMap((p) => p.writes)),
                  undo: undo()
                })
        }
      // Another conversation holds the site's write lease and the wait ran out (review Q1): this run
      // was not sent; the lease refusal goes back as the door gave it, with what landed before it.
      if (g.kind === 'busy') {
        const busy = /** @type {{ answer: Record<string, unknown> }} */ (/** @type {unknown} */ (got)).answer
        return {
          ok: false,
          answer:
            landed.length === 0
              ? busy
              : {
                  ...busy,
                  written: ats(landed),
                  notWritten: ats(todo.flatMap((p) => p.writes)),
                  undo: undo()
                }
        }
      }
      if (g.kind === 'refused')
        return {
          ok: false,
          answer: refuse(
            'TOOL_FAILED',
            emdashReplaceText('notSentError', { why: g.error }),
            emdashReplaceText('notSentNext'),
            landed.length > 0 ? { written: ats(landed), undo: undo() } : {}
          )
        }
      // No line: the exec died or timed out — any op may have been sent.
      return {
        ok: false,
        answer: unknownAnswer({ landed, unknown: todo, notSent: [], total, doneOps, change })
      }
    }
    const v = got.value
    const results = Array.isArray(v.results) ? v.results.filter(isRecord) : []
    for (const r of results)
      if (r.ok === true && typeof r.i === 'number' && todo[r.i]) {
        landed.push(...todo[r.i].writes)
        if (r.revFormula === false) {
          onRevFormula?.(false)
          if (!notes.includes(EMDASH_REPLACE_NEXT.revNote)) notes.push(EMDASH_REPLACE_NEXT.revNote)
        }
      }
    const okCount = results.filter((r) => r.ok === true).length
    const inFlight = typeof v.inFlight === 'number' ? v.inFlight : null
    if (inFlight !== null)
      return {
        ok: false,
        answer: unknownAnswer({
          landed,
          unknown: [todo[inFlight]].filter(Boolean),
          notSent: todo.slice(inFlight + 1),
          total,
          doneOps: doneOps + okCount,
          change
        })
      }
    const failed = results.find((r) => r.ok !== true)
    if (!failed) {
      if (okCount === todo.length) return { ok: true, landed, notes }
      if (okCount > 0 && runs < EMDASH_WRITE_ROUNDS) {
        // the ops left were planned on the same read and never sent: a `[CONFLICT]` among them
        // still takes the re-read below
        doneOps += okCount
        todo = todo.slice(okCount)
        runs += 1
        continue
      }
      // 🔒 Stopped between two ops: the rest were never sent. NOT "the same call once more": the
      // page's language goes first, so its old words are already gone and a repeat answers NOT_FOUND
      // while the languages left stay unchanged. The undo (exact, `now`-checked) then the call again
      // reaches every place; ordering the page's language last instead would make the
      // OUTCOME_UNKNOWN dryRun (the NEW words, read in the page's language) miss a landed copy.
      return {
        ok: false,
        answer: refuse(
          'PARTIAL',
          emdashReplaceText('stoppedError', { n: doneOps + okCount, m: total }),
          emdashReplaceText('stoppedNext'),
          {
            written: ats(landed),
            notWritten: ats(todo.slice(okCount).flatMap((p) => p.writes)),
            undo: undo()
          }
        )
      }
    }
    const i = /** @type {number} */ (failed.i)
    const error = String(failed.error ?? '')
    const rest = todo.slice(i)
    const moved = /^MENU_CHANGED\b/.test(error) || codeOfError(error) === 'CONFLICT'
    doneOps += okCount
    if (moved && rereads === 0) {
      rereads += 1
      const again = await index(
        rereadRequest(
          rest.flatMap((p) => p.writes),
          addr
        )
      )
      if (!again.ok) {
        const refusal = readRefusal(again, label)
        return {
          ok: false,
          answer: landed.length > 0 ? { ...refusal, written: ats(landed), undo: undo() } : refusal
        }
      }
      const fresh = /** @type {EmdashIndex} */ (/** @type {unknown} */ (again.value))
      /** @type {Map<string, Address>} */
      const next = new Map(addr)
      for (const p of rest)
        for (const w of p.writes) {
          const a = addr.get(w.at)
          const r = a ? refresh(a, fresh) : null
          if (!r || r.value !== w.before)
            return {
              ok: false,
              answer: refuse(
                'STORE_CHANGED',
                emdashReplaceText('movedError', { at: w.at, n: doneOps, m: total }),
                emdashReplaceText('movedNext'),
                { written: ats(landed), ...(landed.length > 0 ? { undo: undo() } : {}) }
              )
            }
          next.set(w.at, r.addr)
        }
      todo = buildOps(
        rest.flatMap((p) => p.writes),
        next
      )
      if (todo.some((p) => p.pending || p.noRev))
        return {
          ok: false,
          answer: refuse(
            'STORE_CHANGED',
            emdashReplaceText('movedError', { at: rest[0].what, n: doneOps, m: total }),
            emdashReplaceText('movedNext'),
            {
              written: ats(landed),
              ...(landed.length > 0 ? { undo: undo() } : {})
            }
          )
        }
      continue
    }
    if (moved)
      return {
        ok: false,
        answer: refuse(
          'STORE_CHANGED',
          emdashReplaceText('storeChangedError', { n: doneOps, m: total }),
          emdashReplaceText('storeChangedNext'),
          { written: ats(landed), ...(landed.length > 0 ? { undo: undo() } : {}) }
        )
      }
    if (/^SITE\b/.test(error)) {
      // the menu's own pre-read failed: that op was never sent
      const refusal = refuse(
        'SITE_UNREACHABLE',
        emdashReplaceText('readFailedError', { why: error.replace(/^SITE\s*/, '') }),
        emdashReplaceText('menuReadFailedNext')
      )
      return {
        ok: false,
        answer:
          landed.length > 0 ? { ...refusal, code: 'PARTIAL', written: ats(landed), undo: undo() } : refusal
      }
    }
    const code = codeOfError(error)
    if (landed.length === 0) {
      const a = addr.get(rest[0].writes[0]?.at ?? '')
      return {
        ok: false,
        answer: refuse(
          'TOOL_FAILED',
          emdashReplaceText('writeRefusedError', { what: rest[0].what, why: error }),
          a?.kind === 'content'
            ? emdashReplaceText('writeRefusedNext', { collection: a.collection, id: a.id })
            : emdashReplaceText('notSentNext'),
          { emdash: code }
        )
      }
    }
    return {
      ok: false,
      answer: refuse(
        'PARTIAL',
        emdashReplaceText('partialError', { what: rest[0].what, n: doneOps, m: total, why: error }),
        emdashReplaceText('partialNext'),
        {
          emdash: code,
          written: ats(landed),
          notWritten: ats(rest.flatMap((p) => p.writes)),
          undo: undo()
        }
      )
    }
  }
}

/**
 * @param {{ landed: Write[], unknown: PlannedOp[], notSent: PlannedOp[], total: number, doneOps: number,
 *   change: { find: string, replace: string } | null }} input
 */
function unknownAnswer({ landed, unknown, notSent, total, doneOps, change }) {
  const fresh = change ? change.replace.replace(/\s*\n\s*/g, ' ') : ''
  const old = change ? change.find : ''
  const short = fresh !== '' && fresh.length <= 40 && old.length <= 40
  return refuse(
    'OUTCOME_UNKNOWN',
    emdashReplaceText('outcomeError', { what: unknown[0]?.what ?? 'the entries', n: doneOps, m: total }),
    emdashReplaceText('outcomeNext', {
      new: short ? fresh : '<the new words>',
      old: short ? old : '<the old words>'
    }),
    {
      written: landed.map((w) => w.at).slice(0, 8),
      unknown: unknown.flatMap((p) => p.writes.map((w) => w.at)).slice(0, 8),
      ...(notSent.length > 0
        ? { notSent: notSent.flatMap((p) => p.writes.map((w) => w.at)).slice(0, 8) }
        : {}),
      // the places that may have changed are put back by the same undo: a value already as it was
      // is simply written again
      undo: emdashUndo([...landed, ...unknown.flatMap((p) => p.writes)]),
      recheck: 'replace'
    }
  )
}

/**
 * After the writes, the page read again: are the new words shown in each changed place's region?
 * EmDash has no page cache (a publish shows on the next request), so "not yet" is worth saying.
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
  if (!isRecord(got) || got.ok !== true || typeof got.html !== 'string')
    return emdashReplaceText('notChecked')
  const units = renderedUnits(got.html).units
  for (const r of results) {
    let want = r.change.replace.replace(/\s*\n\s*/g, ' ')
    if (r.glyph) want = want.replace(/^[\s←‹«◂◀]+|[\s→›»▸▶↗]+$/g, '')
    const w = foldForMatch(want)
    if (w === '') continue
    for (const t of r.targets) {
      if (t.rendered !== true) continue
      if (!units.some((u) => (t.where === null || u.region === t.where) && u.lower.includes(w)))
        return emdashReplaceText('notShownYet', { path })
    }
  }
  return emdashReplaceText('shownOn', { path })
}

// ── The job ────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ plan: ReplacePlan | RestorePlan | Record<string, unknown>, index: ScriptRun,
 *   write: ScriptRun, pageHtml: (path: string) => Promise<any>, artifact?: unknown,
 *   label?: string | null, confirmed?: boolean, verify?: boolean,
 *   onRevFormula?: (ok: boolean) => void }} EmdashReplaceDeps
 *   `plan`: `planReplace`'s answer (IX2 aliases first). `index`/`write`: {@link emdashScriptRoad}.
 *   `pageHtml`: `fetchPageHtml` for this site. `artifact`: its `template/artifact.json` (the table
 *   key and the default language). `confirmed`: a dryRun of the same call was answered earlier in
 *   this conversation (`confirmKey`). `verify:false` skips the page read after writing.
 *   `onRevFormula(false)`: EmDash answered a `_rev` that is not `revOf`'s — the host turns computed
 *   revisions off for `tracy_emdash` too (`createEmdashState().revsOff`).
 */

/**
 * Change words on an EmDash site in one call (F3 §6, PLAN v2 P11): read the page, index the
 * published content of its language, locate every change with the core, reach the same field in
 * every other language served when the words are a fact or the change is site-wide (David's rule),
 * refuse before anything is sent when an entry holds an unpublished change (D12) or the words run
 * across two styles of a paragraph, then write and answer with the receipt and its exact undo.
 * @param {EmdashReplaceDeps} deps
 * @returns {Promise<Record<string, unknown>>}
 */
export async function replaceOnEmdash(deps) {
  const plan = /** @type {any} */ (deps.plan)
  if (!isRecord(plan) || plan.ok !== true) return /** @type {Record<string, unknown>} */ (plan)
  const table = templateTableOf(deps.artifact)
  if (plan.mode === 'restore') return restoreOnEmdash(deps, /** @type {RestorePlan} */ (plan), table)
  const p = /** @type {ReplacePlan} */ (plan)
  const label = deps.label ?? null

  // 1. The page, as visitors are served it now.
  /** @type {{ units: RenderedUnit[], lang: string | null } | null} */
  let page = null
  try {
    const got = await deps.pageHtml(p.path)
    if (isRecord(got) && got.ok === true && typeof got.html === 'string' && (got.status ?? 200) < 400) {
      const r = renderedUnits(got.html)
      page = { units: r.units, lang: r.lang }
    }
  } catch {
    page = null
  }

  // 2. The content of the page's language (route-scoped unless the change is site-wide).
  let locale = pageLocaleGuess(page, p.path, deps.artifact)
  /** @param {string | null} loc @param {string[] | null} collections */
  const request = (loc, collections) => ({
    ...(loc ? { locales: [loc] } : {}),
    ...(collections ? { collections } : {}),
    menus: true,
    terms: true,
    settings: true
  })
  const scopeOf = (/** @type {readonly string[]} */ served) =>
    page && p.all !== true ? routeCollections(table, routeOf(p.path, served)) : null
  const artifactLocales =
    isRecord(deps.artifact) && isRecord(deps.artifact.locales) && Array.isArray(deps.artifact.locales.all)
      ? /** @type {string[]} */ (deps.artifact.locales.all)
      : []
  let got = await deps.index(request(locale, scopeOf(artifactLocales)))
  if (!got.ok) return readRefusal(got, label)
  let index = /** @type {EmdashIndex} */ (/** @type {unknown} */ (got.value))
  const served = Array.isArray(index.served) ? index.served : null
  const resolved = servedLocale(locale, served, deps.artifact)
  if (resolved !== locale) {
    locale = resolved
    got = await deps.index(request(locale, scopeOf(served ?? [])))
    if (!got.ok) return readRefusal(got, label)
    index = /** @type {EmdashIndex} */ (/** @type {unknown} */ (got.value))
  }
  const route = routeOf(p.path, served ?? artifactLocales)
  const scoped = scopeOf(served ?? artifactLocales) !== null
  let store = storeOf(index, table)
  const pageForCore = page ? { units: page.units, lang: locale ?? page.lang } : null

  // 3. Locate. A fact, or a change said to apply everywhere, is written in every language served:
  // those copies are read once the places are known (one more exec, only then).
  const locateWith = (/** @type {Map<string, StoredUnit[]> | undefined} */ twins) =>
    locateAll({
      plan: p,
      page: pageForCore,
      stored: store.units,
      confirmed: deps.confirmed === true,
      mustKeepTwo: false,
      hooks: hooksOf({
        table,
        addr: store.addr,
        page: page?.units ?? null,
        route,
        twins,
        patterns: index.patterns ?? null
      })
    })
  let located = locateWith(undefined)
  // 🔒 THE ROUTE TABLE ONLY NARROWS THE READ; IT NEVER DECIDES THAT WORDS HAVE NO RECORD. The
  // table is the template's addresses as shipped, and a site can move a page in its own code:
  // r1e1734 (30/09/2026) moved Services to /industrial-services, the table read that path as a
  // `pages` entry, and its heading — services_page.title — was answered "words the template
  // prints", which the agent is told never to question. So words the page prints with no stored
  // value behind them in the narrowed read are looked for once more in every collection (the same
  // language), and only then called the template's.
  if (!located.ok && scoped && isTemplateWords(located)) {
    const wide = await deps.index(request(locale, null))
    if (!wide.ok) return readRefusal(wide, label)
    index = /** @type {EmdashIndex} */ (/** @type {unknown} */ (wide.value))
    store = storeOf(index, table)
    located = locateWith(undefined)
  }
  /** @type {string[]} */
  const notes = []
  if (Array.isArray(index.missing) && index.missing.length > 0)
    notes.push(emdashReplaceText('missingNote', { what: index.missing.join(', ') }))
  if (!located.ok) {
    const there = await whereItIs({
      deps,
      plan: p,
      table,
      refusal: located,
      locale,
      served: served ?? artifactLocales,
      scoped
    })
    return there ?? marksOr(located, p, store, index)
  }
  const others = (served ?? []).filter((l) => l !== locale)
  if (others.length > 0 && located.results.some((r) => r.scope === 'every')) {
    const collections = new Set()
    const menus = new Set()
    for (const r of located.results)
      for (const t of r.targets) {
        const a = store.addr.get(t.kind === 'split' ? t.a.at : t.at)
        if (a?.kind === 'content') collections.add(a.collection)
        if (a?.kind === 'menu') menus.add(a.name)
      }
    if (collections.size > 0 || menus.size > 0) {
      const more = await deps.index({
        locales: others,
        collections: [...collections],
        menus: menus.size > 0 ? [...menus] : false,
        terms: false,
        settings: false
      })
      if (!more.ok) return readRefusal(more, label)
      const extra = storeOf(/** @type {EmdashIndex} */ (/** @type {unknown} */ (more.value)), table)
      /** @type {Map<string, StoredUnit[]>} */
      const twins = new Map()
      for (const u of extra.units) {
        if (u.writable === false) continue
        const list = twins.get(u.place ?? u.at) ?? []
        list.push(u)
        twins.set(u.place ?? u.at, list)
      }
      for (const [at, a] of extra.addr) store.addr.set(at, a)
      located = locateWith(twins)
      if (!located.ok) return marksOr(located, p, store, index)
    }
  }
  const { results } = located
  const quoted = quotedElsewhere({
    plan: p,
    results,
    page: page?.units ?? null,
    store,
    hooks: hooksOf({
      table,
      addr: store.addr,
      page: page?.units ?? null,
      route,
      patterns: index.patterns ?? null
    })
  })
  if (quoted) return withNormalized(withMissing(quoted, index), p)

  // 4. What would be written, and the guards that refuse before anything is sent.
  const words = plannedWrites(results).map((w) => ({ at: w.at, before: w.before, value: w.value }))
  const companions = companionWrites({ writes: words, addr: store.addr, changes: p.changes })
  const writes = [...words, ...companions]
  const planned = buildOps(writes, store.addr)
  const pending = planned.filter((x) => x.pending)
  if (pending.length > 0)
    return withNormalized(
      refuse(
        'PENDING_DRAFT',
        emdashReplaceText('pendingDraftError', { what: pending.map((x) => x.what).join(', ') }),
        emdashReplaceText('pendingDraftNext'),
        { pending: pending.map((x) => x.what).slice(0, 8) }
      ),
      p
    )
  const noRev = planned.find((x) => x.noRev)
  if (noRev)
    return refuse(
      'TOOL_FAILED',
      emdashReplaceText('notSentError', { why: `EmDash sent no revision for ${noRev.what}` }),
      emdashReplaceText('notSentNext')
    )
  if (planned.some((x) => x.op.tool === 'menu_set_items')) notes.push(EMDASH_REPLACE_NEXT.menuIdsNote)
  const followed = companions.map((w) => ({ at: w.at, before: w.before, after: w.value }))

  if (p.dryRun) {
    const out = dryRunAnswer({ platform: 'emdash', path: p.path, results, all: p.all })
    const extra = notes.filter((n) => !(/** @type {string[]} */ (out.notes ?? []).includes(n)))
    if (extra.length > 0) out.notes = [.../** @type {string[]} */ (out.notes ?? []), ...extra]
    if (followed.length > 0) out.companions = followed.slice(0, 8)
    return withNormalized(out, p)
  }

  // 5. Write, then the receipt.
  const change = p.changes.length === 1 ? p.changes[0] : null
  const sent = await writeAll({
    write: deps.write,
    index: deps.index,
    label,
    planned,
    addr: store.addr,
    change,
    onRevFormula: deps.onRevFormula
  })
  if (!sent.ok) return withNormalized({ ...sent.answer, platform: 'emdash', path: p.path }, p)
  // F7: a field printed in several places names them all (`everyPlace`).
  const changed = results.flatMap((r) => r.targets.map((t) => everyPlace(wouldOf(t, r.change), t)))
  const out = receipt({
    platform: 'emdash',
    path: p.path,
    changed,
    removal: p.changes.every((c) => c.replace === ''),
    companions: followed.slice(0, 8),
    stillHolds: leadLeftovers(
      p.changes,
      store.units.filter((u) => u.lang == null || u.lang === locale),
      changed.map((x) => x.at)
    ),
    unchanged: results.flatMap((r) => r.unchanged).slice(0, 4),
    alsoIn: results.flatMap((r) => r.alsoIn).slice(0, 5),
    notes: [
      ...new Set([...results.flatMap((r) => r.notes), ...notes, ...sent.notes, ...manyPlacesNotes(changed)])
    ],
    undo: emdashUndo(writes)
  })
  if (page !== null && deps.verify !== false) out.verified = await verifyShown(deps.pageHtml, p.path, results)
  // A page that was never checked is not a page that "now reads" the new words: the plain receipt's
  // next says what the words are, this one also says the page could not be read. Only the plain
  // receipt: the ones that name a place left out must keep saying that.
  if (
    (page === null || out.verified === emdashReplaceText('notChecked')) &&
    out.next === REPLACE_NEXT.receipt
  )
    out.next = emdashReplaceText('receiptUnreadNext')
  return withNormalized(out, p)
}

/**
 * The page a stored unit is printed on, or null when the template's route table cannot say: a list
 * entry under its collection's URL, a singleton on the route whose collections hold it, the chrome
 * (`site`, menus) on the language's home. Another served language is under its own prefix.
 * @param {TemplateTable | null} table
 * @param {unknown} artifact
 * @param {string} at - a stored unit's `at`
 * @returns {string | null}
 */
export function pathOfUnit(table, artifact, at) {
  const a = parseAt(at)
  if (!a) return null
  const locales = isRecord(artifact) && isRecord(artifact.locales) ? artifact.locales : {}
  const loc = a.kind === 'settings' ? null : a.locale
  const prefix = loc && Array.isArray(locales.prefixed) && locales.prefixed.includes(loc) ? `/${loc}` : ''
  /** @type {string | null} */
  let path = null
  if (a.kind !== 'content') path = '/'
  else if (table) {
    const { collection: c, slug } = a
    if (table.chrome.includes(c)) path = '/'
    else {
      const entry = table.entries[c]
      const cands = [
        entry ? `${entry}${slug}` : null,
        `/${slug}`,
        `/${c}`,
        `/${c.replace(/_page$/, '')}`,
        '/'
      ]
      path = cands.find((x) => x !== null && routeCollections(table, x)?.includes(c)) ?? null
    }
  }
  return path === null ? null : path === '/' ? prefix || '/' : `${prefix}${path}`
}

/**
 * 🔒 A NOT_FOUND names where the words ARE. Measured on the v6 bench: with no `path` the search
 * covered the home route's collections only (WP and Joomla search the whole site for the same
 * call), so "Timeline: 8–14 weeks…" on a service card answered "not on this page", then a false
 * "replace cannot reach it"; and words quoted in Russian from the English page were answered the
 * same. One index read (every collection, every served language), only on a NOT_FOUND, then the
 * page is named: `path:` for the same call. Nothing is written here — quoting another language's
 * words is how a customer names that language, but the choice of page stays with the agent.
 * @param {{ deps: EmdashReplaceDeps, plan: ReplacePlan, table: TemplateTable | null,
 *   refusal: Record<string, unknown>, locale: string | null, served: readonly string[],
 *   scoped: boolean }} input
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function whereItIs({ deps, plan, table, refusal, locale, served, scoped }) {
  if (refusal.code !== 'NOT_FOUND' || plan.at !== null || plan.all === true) return null
  const change = plan.changes[typeof refusal.change === 'number' ? refusal.change : 0]
  if (!change || refusal.error !== replaceText('notFoundError', { find: change.find })) return null
  if (!scoped && served.length <= 1) return null
  const got = await deps.index({
    ...(served.length > 0 ? { locales: [...served] } : {}),
    menus: true,
    terms: false,
    settings: false
  })
  if (!got.ok) return null
  const wide = storeOf(/** @type {EmdashIndex} */ (/** @type {unknown} */ (got.value)), table)
  const units = wide.units.filter((u) => u.writable !== false && !u.at.startsWith('settings#'))
  const own = (/** @type {StoredUnit} */ u) => u.lang === null || u.lang === undefined || u.lang === locale
  /** @type {Set<string>} */
  const pages = new Set()
  let sameLanguage = true
  for (const pool of [units.filter(own), units.filter((u) => !own(u))]) {
    if (pool.length === 0) continue
    for (const h of matchUnits(pool, change.find).hits) {
      if (h.mode === 'bare' || !(h.whole || h.caseExact)) continue
      if (plan.where && h.unit.region !== plan.where && !h.unit.region?.includes(plan.where)) continue
      const page = pathOfUnit(table, deps.artifact, h.unit.at)
      if (page !== null && page !== routeOf(plan.path, served) && page !== plan.path) pages.add(page)
    }
    if (pages.size > 0) break
    sameLanguage = false
  }
  if (pages.size === 0) return null
  const list = [...pages].slice(0, 2)
  const first = list[0]
  const error = sameLanguage
    ? replaceText('notHereError', { page: list.join(', ') })
    : replaceText('otherLanguageError', { page: list.join(', ') })
  return withNormalized(
    refuse(
      'NOT_FOUND',
      error,
      list.length === 1
        ? replaceText(sameLanguage ? 'notHereNext' : 'otherLanguageNext', { page: first })
        : replaceText('notHereNext', { page: '<the page meant>' }),
      { find: change.find, pages: list }
    ),
    plan
  )
}

/**
 * A NOT_EDITABLE whose only reason is words the page prints with no stored value found behind
 * them — the one verdict a narrower read can get wrong (a form label or a term label is a value
 * the read did find).
 * @param {Record<string, unknown>} refusal
 */
function isTemplateWords(refusal) {
  const unchanged = Array.isArray(refusal.unchanged) ? refusal.unchanged : []
  return (
    refusal.code === 'NOT_EDITABLE' &&
    unchanged.length > 0 &&
    unchanged.every((u) => isRecord(u) && u.why === EMDASH_WHY.template)
  )
}

/**
 * The index was partial (a collection or menu EmDash answered `[NOT_FOUND]` for): a NOT_FOUND or
 * NOT_EDITABLE built from it says what was not read, as a receipt and a dryRun do.
 * @param {Record<string, unknown>} refusal
 * @param {EmdashIndex} index
 */
function withMissing(refusal, index) {
  if (refusal.code !== 'NOT_FOUND' && refusal.code !== 'NOT_EDITABLE') return refusal
  if (!Array.isArray(index.missing) || index.missing.length === 0) return refusal
  return { ...refusal, notes: [emdashReplaceText('missingNote', { what: index.missing.join(', ') })] }
}

/**
 * Does the rendered unit hold the stored value whole (the core's presence rule, restated: the core
 * keeps it private)?
 * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
 * @param {import('./replace.mjs').Hit<StoredUnit>} hit
 */
const presentIn = (occ, hit) =>
  hit.mode === 'bare' ? occ.unit.bare.includes(hit.unit.bare) : occ.unit.lower.includes(hit.unit.lower)

/**
 * 🔒 THE WORDS AS QUOTED WIN OVER A LOOSER MATCH ELSEWHERE. Measured on the bench home:
 * `{find:"Disclosures", replace:"Filings"}` planned a write of the heading "News & disclosures"
 * (inside a longer text, in another case) while the words quoted letter for letter are the category
 * label of the news cards — a term no door here renames, listed only under `unchanged`. EmDash is
 * the engine whose index holds unwritable stored values (terms), so it is where this shows. When an
 * occurrence on the page is backed by an unwritable stored value that IS the words (whole, same
 * case), or is the words whole with no stored value behind it (template words), and every place the
 * core would write matches worse, the answer is that occurrence's NOT_EDITABLE with the looser
 * places named in `looser` — never a silent write of another place. `at` and `all` are the model
 * choosing, so they are left alone.
 * @param {{ plan: ReplacePlan, results: readonly Located[], page: RenderedUnit[] | null, store: Store,
 *   hooks: LocateHooks }} input
 * @returns {Record<string, unknown> | null}
 */
export function quotedElsewhere({ plan, results, page, store, hooks }) {
  if (!page || plan.at || plan.all) return null
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]
    const best = Math.min(...r.targets.map((t) => (t.occ ? t.rank : 0)))
    if (!(best > 0)) continue
    const find = r.change.find
    const stored = matchUnits(store.units, find).hits
    const occs = matchUnits(page, find).hits.filter(
      (o) => !o.unit.hidden && o.unit.region !== 'drawer' && (!plan.where || o.unit.region === plan.where)
    )
    for (const o of occs) {
      const behind = stored.filter((h) => presentIn(o, h) && (hooks.anchor ? hooks.anchor(h, o) : true))
      if (behind.some((h) => h.unit.writable !== false)) continue
      const blocked = behind.find((h) => hitRank(h) === 0)
      if (behind.length > 0 ? !blocked : hitRank(o) !== 0) continue
      const why = blocked
        ? (blocked.unit.why ?? REPLACE_WHY.template)
        : hooks.why
          ? hooks.why(o)
          : REPLACE_WHY.template
      // 🔒 As the core's (`locate`, 16/10/2026): a writable stored value that IS these words here, kept
      // off this spot only by the anchor (EmDash's strict region check), is named — never "do not look
      // for another way in".
      const held = [
        ...new Map(
          stored
            .filter(
              (h) => h.unit.writable !== false && presentIn(o, h) && hooks.anchor && !hooks.anchor(h, o)
            )
            .map((h) => [h.unit.at, h.unit])
        ).values()
      ]
      return refuse(
        'NOT_EDITABLE',
        replaceText('notEditableError', { find, why }),
        held.length > 0
          ? replaceText('notEditableHeldNext', { at: JSON.stringify(held[0].at) })
          : (elsewhereNext(why) ?? replaceText('notEditableNext', { why })),
        {
          verdict: 'NOT_EDITABLE',
          find,
          unchanged: [{ text: clip(o.unit.shown || o.unit.cased, 0, 0, 80), where: o.unit.region, why }],
          ...(held.length > 0
            ? { held: held.slice(0, 8).map((u) => ({ at: u.at, ...(u.label ? { label: u.label } : {}) })) }
            : {}),
          looser: r.targets.slice(0, 4).map((t) => ({
            at: t.at,
            where: t.where,
            text: t.kind === 'unit' ? clip(t.unit.cased, t.hits[0].a, t.hits[0].b, 80) : ''
          })),
          ...(results.length > 1 ? { change: i } : {})
        }
      )
    }
  }
  return null
}

/** A leaf that holds a link, not words: `url`, `href`, `cta_url`. */
const LINK_KEY = /^(url|href)$|_url$/

/**
 * 🔒 A LINK FOLLOWS ITS FACT. A phone number or an e-mail address changed in an entry is also the
 * `tel:` / `mailto:` link of the same entry: `views/Careers.astro:107` renders
 * `c.cta_url || mailto:<cta_mail>`, so changing `careers#cta_mail` alone left the button mailing
 * the old address while the receipt said success (measured on the bench baseline). Every link leaf
 * of an entry this call writes whose address the core's `followHref` rewrites (the one rule for the
 * three engines) is written in the same op, named under `companions`, and put back by the undo.
 * @param {{ writes: readonly Write[], addr: Map<string, Address>, changes: readonly { find: string, replace: string }[] }} input
 * @returns {Write[]}
 */
function companionWrites({ writes, addr, changes }) {
  /** @type {Write[]} */
  const out = []
  const seen = new Set(writes.map((w) => w.at))
  /** @type {Map<string, Extract<Address, { kind: 'content' }>>} */
  const records = new Map()
  for (const w of writes) {
    const a = addr.get(w.at)
    if (a?.kind === 'content') records.set(`${a.collection}:${a.id}`, a)
  }
  for (const a of records.values())
    walk(
      a.row.data,
      [],
      (path, value) => {
        if (!LINK_KEY.test(String(path[path.length - 1]))) return
        let next = value
        for (const c of changes) next = followHref(next, c.find, c.replace) ?? next
        const at = `${a.collection}/${a.slug}@${a.locale ?? ''}#${pathText(path)}`
        if (next === value || seen.has(at)) return
        seen.add(at)
        addr.set(at, { ...a, path })
        out.push({ at, before: value, value: next })
      },
      () => {}
    )
  return out
}

/**
 * A NOT_FOUND / NOT_EDITABLE that is really words running across two style runs of one Portable
 * Text paragraph (bold, a link): no single stored value holds them, so no place was found — but
 * the paragraph does, and the answer should say so instead of "not on this page".
 * @param {Record<string, unknown>} refusal
 * @param {ReplacePlan} plan
 * @param {Store} store
 * @param {EmdashIndex} index
 */
function marksOr(refusal, plan, store, index) {
  if (refusal.code !== 'NOT_FOUND' && refusal.code !== 'NOT_EDITABLE') return withNormalized(refusal, plan)
  const change = plan.changes[typeof refusal.change === 'number' ? refusal.change : 0]
  const hit = change ? matchUnits(store.blocks, change.find).hits.find((h) => h.mode !== 'bare') : undefined
  if (!hit) return withNormalized(withMissing(refusal, index), plan)
  return withNormalized(
    refuse(
      'VALUE_NOT_ALLOWED',
      emdashReplaceText('marksError', { find: change.find, at: hit.unit.at }),
      emdashReplaceText('marksNext'),
      {
        rule: 'split-across-marks',
        at: hit.unit.at,
        ...(typeof refusal.change === 'number' ? { change: refusal.change } : {})
      }
    ),
    plan
  )
}

/** @param {Record<string, unknown>} out @param {{ normalized?: string[] }} plan */
const withNormalized = (out, plan) =>
  plan.normalized?.length ? { ...out, normalized: plan.normalized } : out

// ── The undo (D14): exact prior values, back where the receipt said ──────────────────────────────

/**
 * A place as the receipt names it, read back: `<collection>/<slug>@<locale>#<path>`,
 * `menu:<name>@<locale>[<k>]`, `settings#title|tagline`. Null when it is none of them.
 * @param {string} at
 * @returns {{ kind: 'content', collection: string, slug: string, locale: string | null, path: (string | number)[] }
 *   | { kind: 'menu', name: string, locale: string | null, pos: number }
 *   | { kind: 'settings', key: 'title' | 'tagline' } | null}
 */
export function parseAt(at) {
  const c = /^([a-z][a-z0-9_]*)\/([^@#\s]+)@([A-Za-z0-9_-]*)#(.+)$/.exec(at)
  if (c) {
    const path = parsePath(c[4])
    return path ? { kind: 'content', collection: c[1], slug: c[2], locale: c[3] || null, path } : null
  }
  const m = /^menu:([a-z0-9][a-z0-9_-]*)@([A-Za-z0-9_-]*)\[(\d+)\]$/.exec(at)
  if (m) return { kind: 'menu', name: m[1], locale: m[2] || null, pos: Number(m[3]) }
  const s = /^settings#(title|tagline)$/.exec(at)
  return s ? { kind: 'settings', key: /** @type {'title' | 'tagline'} */ (s[1]) } : null
}

/**
 * One place in several languages, as the undo writes it: `home/home@en,ru,vi#hero_text`,
 * `menu:primary@en,ru[4]` — every language's `at` with the same collection, slug and path. Null when
 * `at` is none of the shapes {@link parseAt} reads, or its language list is broken.
 * @param {string} at
 * @returns {string[] | null}
 */
export function expandAt(at) {
  const many =
    /^([a-z][a-z0-9_]*\/[^@#\s]+@)([A-Za-z0-9_,-]*)(#.+)$/.exec(at) ??
    /^(menu:[a-z0-9][a-z0-9_-]*@)([A-Za-z0-9_,-]*)(\[\d+\])$/.exec(at)
  if (!many) return parseAt(at) ? [at] : null
  const locales = many[2].split(',')
  if (locales.length > 1 && locales.some((l) => l === '')) return null
  const out = [...new Set(locales)].map((l) => `${many[1]}${l}${many[3]}`)
  return out.every((x) => parseAt(x) !== null) ? out : null
}

/**
 * The `at`s that name one place in `locales`: as few as keep each within `RESTORE_AT_MAX`.
 * @param {string} at - one language's `at` of the place
 * @param {readonly string[]} locales
 * @returns {string[]}
 */
function manyAt(at, locales) {
  const m =
    /^([a-z][a-z0-9_]*\/[^@#\s]+@)[A-Za-z0-9_-]*(#.+)$/.exec(at) ??
    /^(menu:[a-z0-9][a-z0-9_-]*@)[A-Za-z0-9_-]*(\[\d+\])$/.exec(at)
  if (!m || locales.length <= 1) return [at]
  /** @type {string[]} */
  const out = []
  /** @type {string[]} */
  let chunk = []
  const text = (/** @type {string[]} */ list) => `${m[1]}${list.join(',')}${m[2]}`
  for (const l of locales) {
    if (chunk.length > 0 && text([...chunk, l]).length > RESTORE_AT_MAX) {
      out.push(text(chunk))
      chunk = []
    }
    chunk.push(l)
  }
  if (chunk.length > 0) out.push(text(chunk))
  return out
}

/**
 * The same field in every language: the key an undo groups by, and the language apart.
 * @param {string} at
 */
function placeKeyOf(at) {
  const p = parseAt(at)
  if (!p) return { key: at, locale: '' }
  if (p.kind === 'content')
    return { key: `c|${p.collection}|${p.slug}|${pathText(p.path)}`, locale: p.locale ?? '' }
  if (p.kind === 'menu') return { key: `m|${p.name}|${p.pos}`, locale: p.locale ?? '' }
  return { key: at, locale: '' }
}

/**
 * The words one write changed: what is left of `before` and `after` once their common start and end
 * are taken off.
 * @param {string} before
 * @param {string} after
 */
function wordsOf(before, after) {
  const n = Math.min(before.length, after.length)
  let a = 0
  while (a < n && before[a] === after[a]) a += 1
  let z = 0
  while (z < n - a && before[before.length - 1 - z] === after[after.length - 1 - z]) z += 1
  return { was: before.slice(a, before.length - z), now: after.slice(a, after.length - z) }
}

/**
 * The undo of `writes` (D14): the same call with `restore`, exact, in as few items as stay exact.
 *
 * 🔒 ONE ITEM PER PLACE, NOT PER LANGUAGE, AND NEVER LESS THAN EXACT. A hotline changed on the
 * 40-language bench site writes 80 values (`topbar_phone` and `hotline` × 40); one `{at, value}` each
 * made a 5,793-byte undo that `planReplace` could not even take back (measured 25/09). So the copies
 * of one place are grouped: the same prior value → one `{at:"…@af,be,…#hotline", value, now}`;
 * different prior values that differ from what was written by the SAME words (30 translations of
 * "Hotline: 8 800 550-67-89") → one `{at, was, now}`, emitted only when putting `was` back where `now`
 * stands gives each prior value back byte for byte (checked here, per language); anything else →
 * `{at, value, now}` per language. `now` is what this call wrote: the undo refuses a place that
 * holds neither it nor the value it would put back (someone wrote there since). A prior value over
 * `RESTORE_LEAF_MAX` characters is not carried: the note names `revision_restore` for it.
 * @param {readonly { at: string, before: string, value: string }[]} writes
 * @returns {Record<string, unknown>}
 */
export function emdashUndo(writes) {
  /** @typedef {{ at: string, locale: string, before: string, value: string }} UndoMember */
  /** @type {Map<string, UndoMember[]>} */
  const groups = new Map()
  /** @type {string[]} */
  const big = []
  for (const w of writes) {
    if (w.before.length > RESTORE_LEAF_MAX) {
      big.push(w.at)
      continue
    }
    const { key, locale } = placeKeyOf(w.at)
    const list = groups.get(key) ?? []
    if (!list.some((x) => x.at === w.at)) list.push({ at: w.at, locale, before: w.before, value: w.value })
    groups.set(key, list)
  }
  /** @type {RestoreItem[]} */
  const items = []
  /** @param {UndoMember[]} members */
  const byValue = (members) => {
    /** @type {Map<string, UndoMember[]>} */
    const pairs = new Map()
    for (const m of members) {
      const k = JSON.stringify([m.before, m.value])
      pairs.set(k, [...(pairs.get(k) ?? []), m])
    }
    for (const list of pairs.values())
      for (const at of manyAt(
        list[0].at,
        list.map((x) => x.locale)
      ))
        items.push({
          at,
          value: list[0].before,
          ...(list[0].value.length <= RESTORE_LEAF_MAX ? { now: list[0].value } : {})
        })
  }
  for (const members of groups.values()) {
    if (members.length === 1 || new Set(members.map((m) => JSON.stringify([m.before, m.value]))).size === 1) {
      byValue(members)
      continue
    }
    /** @type {Map<string, UndoMember[]>} */
    const byWords = new Map()
    for (const m of members) {
      const { was, now } = wordsOf(m.before, m.value)
      if (now === '' || m.value.split(now).join(was) !== m.before) continue
      const k = JSON.stringify([was, now])
      byWords.set(k, [...(byWords.get(k) ?? []), m])
    }
    const best = [...byWords.entries()].sort((x, y) => y[1].length - x[1].length)[0]
    if (!best || best[1].length < 2) {
      byValue(members)
      continue
    }
    const [was, now] = /** @type {[string, string]} */ (JSON.parse(best[0]))
    for (const at of manyAt(
      best[1][0].at,
      best[1].map((x) => x.locale)
    ))
      items.push({ at, was, now })
    const rest = members.filter((m) => !best[1].includes(m))
    if (rest.length > 0) byValue(rest)
  }
  return {
    action: 'content.replace',
    params: { restore: items },
    ...(big.length > 0 ? { note: replaceText('undoRevision', { at: big.join(', ') }) } : {})
  }
}

/** Both a `tel:` / `mailto:` link: the one kind of link an undo may put back (a companion). */
const isContactLink = (/** @type {string} */ s) => /^(tel|mailto):/i.test(s.trim())

/**
 * Where one `at` of an undo writes, in a fresh index — decided by its KEY, never by the value it
 * holds now.
 *
 * 🔒 THE KEY DECIDES, NOT THE VALUE. The store the job locates in leaves out empty values and values
 * that look like a URL, a path, a date or a ULID (they are never words to find). Deciding the undo
 * from that store refused the undo of any place this job had just emptied or filled with such words
 * — `replace:""` on the hero lead (bench C40), a one-word heading's emptied second line, new words
 * "/projects": `BAD_PARAMS … is not a place this job writes`, and the entry stayed blank (measured on
 * the fake door with the real scripts). Here a place is foreign only by what it IS: a key the
 * template hides, an id or address key (a `tel:`/`mailto:` link excepted: a companion the job
 * wrote), media, or Portable Text structure.
 * @param {EmdashIndex} index
 * @param {TemplateTable | null} table
 * @param {string} at - one language's `at`
 * @param {string | null} put - the value the undo would write (a link must stay a contact link)
 * @returns {{ ok: true, addr: Address, value: string, where: string | null } | { ok: false, why: 'foreign' | 'gone' }}
 */
function placeForRestore(index, table, at, put) {
  const p = parseAt(at)
  if (!p) return { ok: false, why: 'foreign' }
  if (p.kind === 'content') {
    const row = (index.rows ?? []).find(
      (r) =>
        isRecord(r) &&
        r.collection === p.collection &&
        r.slug === p.slug &&
        (r.locale ?? null) === p.locale &&
        r.status === 'published' &&
        isRecord(r.data)
    )
    if (!row) return { ok: false, why: 'gone' }
    /** @type {unknown} */
    let v = row.data
    for (const seg of p.path) {
      if (isMedia(v) || (typeof seg === 'string' && PT_META.has(seg))) return { ok: false, why: 'foreign' }
      v = getIn(v, [seg])
      if (v === undefined) return { ok: false, why: 'gone' }
    }
    if (typeof v !== 'string') return { ok: false, why: 'foreign' }
    const last = String(p.path[p.path.length - 1])
    const key = `${p.collection}#${pathText(p.path)}`
    const link = LINK_KEY.test(last)
    if (link ? !(isContactLink(v) && (put === null || isContactLink(put))) : HIDDEN_KEY.test(last))
      return { ok: false, why: 'foreign' }
    if (table?.hidden.some((re) => re.test(key))) return { ok: false, why: 'foreign' }
    return {
      ok: true,
      addr: {
        kind: 'content',
        collection: row.collection,
        id: row.id,
        slug: row.slug,
        locale: row.locale,
        path: p.path,
        row
      },
      value: v,
      where: placesOf(regionOfKey(table, key))
    }
  }
  if (p.kind === 'menu') {
    const menu = (index.menus ?? []).find(
      (m) => isRecord(m) && m.name === p.name && (m.locale ?? null) === p.locale && Array.isArray(m.items)
    )
    if (!menu) return { ok: false, why: 'gone' }
    const items = menu.items.filter(isRecord)
    const item = menuOrder(items)[p.pos]
    const label = item === undefined ? undefined : items[item]?.label
    if (typeof label !== 'string') return { ok: false, why: 'gone' }
    return {
      ok: true,
      addr: { kind: 'menu', name: menu.name, locale: menu.locale, pos: p.pos, item, menu },
      value: label,
      where: table ? placesOf(table.menus[menu.name] ?? ['main']) : null
    }
  }
  if (table?.hidden.some((re) => re.test(`settings#${p.key}`))) return { ok: false, why: 'foreign' }
  const value = isRecord(index.settings) ? index.settings[p.key] : undefined
  if (typeof value !== 'string') return { ok: false, why: 'gone' }
  return {
    ok: true,
    addr: { kind: 'settings', key: p.key },
    value,
    where: placesOf(regionOfKey(table, `settings#${p.key}`))
  }
}

/**
 * Put back what a receipt's undo carries (D14) — no matching: each `at` is read again BY ITS KEY,
 * its current value becomes the undo of the undo, and the value is written byte for byte. Only a
 * place this job itself writes may be named (a visible string of an entry, a menu label, the site
 * title, a contact link it followed): the undo is not a road to an entry's other links or its ids.
 *
 * 🔒 A PLACE CHANGED SINCE IS KEPT, AND SAID. The undo once wrote by position alone: rename "News" →
 * "Insights" (`menu:primary@en[4]`), add one item at the top of that menu, send the undo — it
 * answered ok and wrote "News" over "Projects" (measured). Each item carries `now`, what the job
 * wrote there; a place holding neither `now` nor the value to put back is STORE_CHANGED, nothing is
 * written, and `undoRest` is the same undo without those places, for the customer to choose.
 * @param {EmdashReplaceDeps} deps
 * @param {RestorePlan} plan
 * @param {TemplateTable | null} table
 * @returns {Promise<Record<string, unknown>>}
 */
async function restoreOnEmdash(deps, plan, table) {
  const label = deps.label ?? null
  /** @type {{ k: number, at: string, locale: string, item: RestoreItem }[]} */
  const places = []
  const seen = new Set()
  for (let k = 0; k < plan.restore.length; k += 1) {
    const item = plan.restore[k]
    const ats = expandAt(item.at)
    if (!ats)
      return refuse(
        'BAD_PARAMS',
        emdashReplaceText('restoreForeignError', { at: item.at }),
        replaceText('badRestoreNext'),
        { param: `restore[${k}].at` }
      )
    for (const at of ats) {
      if (seen.has(at)) continue
      seen.add(at)
      places.push({ k, at, locale: placeKeyOf(at).locale, item })
    }
  }
  const locales = new Set()
  const collections = new Set()
  const menus = new Set()
  let settings = false
  for (const { at } of places) {
    const pl = /** @type {NonNullable<ReturnType<typeof parseAt>>} */ (parseAt(at))
    if (pl.kind === 'content') {
      collections.add(pl.collection)
      if (pl.locale) locales.add(pl.locale)
    } else if (pl.kind === 'menu') {
      menus.add(pl.name)
      if (pl.locale) locales.add(pl.locale)
    } else settings = true
  }
  const got = await deps.index({
    ...(locales.size > 0 ? { locales: [...locales] } : {}),
    collections: [...collections],
    menus: menus.size > 0 ? [...menus] : false,
    terms: false,
    settings
  })
  if (!got.ok) return readRefusal(got, label)
  const index = /** @type {EmdashIndex} */ (/** @type {unknown} */ (got.value))
  /** @type {Map<string, Address>} */
  const addr = new Map()
  /** @type {Write[]} */
  const writes = []
  /** @type {(Write & { where: string | null })[]} */
  const shown = []
  /** @type {string[]} */
  const already = []
  /** @type {Set<string>} */
  const moved = new Set()
  for (const { at, item } of places) {
    const words = 'was' in item
    const put = words ? null : item.value
    const place = placeForRestore(index, table, at, put)
    if (!place.ok)
      return place.why === 'foreign'
        ? refuse(
            'BAD_PARAMS',
            emdashReplaceText('restoreForeignError', { at }),
            replaceText('badRestoreNext'),
            { param: 'restore' }
          )
        : refuse(
            'STORE_CHANGED',
            emdashReplaceText('restoreGoneError', { at }),
            emdashReplaceText('restoreGoneNext')
          )
    const cur = place.value
    /** @type {string | null} */
    let value = null
    if ('was' in item) {
      if (cur.includes(item.now)) value = cur.split(item.now).join(item.was)
      else if (!cur.includes(item.was)) moved.add(at)
    } else if (cur !== item.value) {
      if (item.now !== undefined && cur !== item.now) moved.add(at)
      else value = item.value
    }
    if (moved.has(at)) continue
    if (value === null || value === cur) {
      already.push(at)
      continue
    }
    addr.set(at, place.addr)
    writes.push({ at, before: cur, value })
    shown.push({ at, before: cur, value, where: place.where })
  }
  if (moved.size > 0) {
    const first = [...moved][0]
    /** @type {RestoreItem[]} */
    const rest = []
    for (let k = 0; k < plan.restore.length; k += 1) {
      const left = places.filter((x) => x.k === k && !moved.has(x.at))
      if (left.length === 0) continue
      for (const at of manyAt(
        left[0].at,
        left.map((x) => x.locale)
      ))
        rest.push({ ...plan.restore[k], at })
    }
    return refuse(
      'STORE_CHANGED',
      emdashReplaceText('restoreMovedError', { at: first }),
      emdashReplaceText(rest.length > 0 ? 'restoreMovedNext' : 'restoreMovedOnlyNext'),
      {
        changedSince: [...moved].slice(0, 8),
        ...(rest.length > 0 ? { undoRest: { action: 'content.replace', params: { restore: rest } } } : {})
      }
    )
  }
  /** @type {string[]} */
  const notes =
    already.length > 0 ? [emdashReplaceText('restoredSameNote', { at: already.slice(0, 4).join(', ') })] : []
  const planned = buildOps(writes, addr)
  const pending = planned.filter((x) => x.pending)
  if (pending.length > 0)
    return refuse(
      'PENDING_DRAFT',
      emdashReplaceText('pendingDraftError', { what: pending.map((x) => x.what).join(', ') }),
      emdashReplaceText('pendingDraftNext'),
      { pending: pending.map((x) => x.what).slice(0, 8) }
    )
  // one row per place, its language copies counted (the receipt of a 40-language undo stays small)
  /** @type {Map<string, { at: string, where: string | null, before: string, after: string, languages?: number }>} */
  const rows = new Map()
  for (const w of shown) {
    const key = placeKeyOf(w.at).key
    const got = rows.get(key)
    if (got) got.languages = (got.languages ?? 1) + 1
    else rows.set(key, { at: w.at, where: w.where, before: clip(w.before, 0, 0), after: clip(w.value, 0, 0) })
  }
  const changed = [...rows.values()]
  if (planned.some((x) => x.op.tool === 'menu_set_items')) notes.push(EMDASH_REPLACE_NEXT.menuIdsNote)
  // F7: an undo of a field printed in several places puts it back in all of them.
  notes.push(...manyPlacesNotes(changed))
  if (plan.dryRun)
    return {
      ok: true,
      dryRun: true,
      platform: 'emdash',
      path: plan.path,
      count: writes.length,
      would: changed,
      ...(notes.length > 0 ? { notes } : {}),
      next: replaceText('dryRun', { expectHint: '' })
    }
  if (writes.length === 0)
    return {
      ok: true,
      platform: 'emdash',
      path: plan.path,
      changed: [],
      notes,
      next: REPLACE_NEXT.restored
    }
  const sent = await writeAll({
    write: deps.write,
    index: deps.index,
    label,
    planned,
    addr,
    change: null,
    onRevFormula: deps.onRevFormula
  })
  if (!sent.ok) return { ...sent.answer, platform: 'emdash', path: plan.path }
  const out = receipt({
    platform: 'emdash',
    path: plan.path,
    changed,
    notes: [...notes, ...sent.notes],
    undo: emdashUndo(writes)
  })
  return { ...out, next: REPLACE_NEXT.restored }
}
