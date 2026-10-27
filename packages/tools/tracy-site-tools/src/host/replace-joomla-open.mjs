/**
 * THE REPLACE JOB ON AN OPEN JOOMLA SITE (a Joomla site with no bound contract, `REPLACE_PLATFORMS`
 * key `joomla`): read the page the visitor sees and the records that render into it through the door
 * — `content.list` for the indexes, `content.get` for whole rows — let the core (`replace.mjs`) decide
 * which stored value shows the words, rewrite only those words inside each record, and write each
 * record back with ONE `content.update` under ONE apply id this call mints, so the receipt's
 * `apply.revert` undoes exactly this change: the component's undo log groups every write by its
 * apply_id and puts each row's prior columns back (claude-cowork `joomla/cowork/lib/Engine.php`
 * `applyRevert` → `rollbackContent`).
 *
 * 🔒 MODELLED ON THE WORDPRESS ENGINE, NOT ON THE CONTRACT ONE. An open site has no slot map: its
 * words live in records — an article's `title`/`introtext`/`fulltext`, a custom module's
 * `title`/`content`, a menu item's `title`, a category's `title`/`description` — and in the few
 * `params` that print words (`JOOMLA_WORD_PARAMS`, each one read from the template or module that
 * prints it). An HTML field is spliced at its raw stored bytes by the WordPress engine's own rewrite
 * (`rewriteRecords`: entities, `<br>`, NBSP, a `tel:`/`mailto:` link that follows its number, a
 * heading on two lines); a plain field or a param is spliced here (`rewriteValues`), a param as JSON.
 * Every other byte of the record goes back as it was read.
 *
 * 🔒 WHICH RECORD RENDERS WHERE IS READ OFF THE PAGE, NEVER GUESSED. Joomla prints `mod-custom<id>`
 * around a custom module's words and the T4 framework `Mod<id>` around every module; `mod_menu` prints
 * `item-<id>` on each `<li>` (Cassiopeia, T4; T4's mega menu `data-id`); the body names the active
 * menu item (`itemid-<id>`, T4 `item-<id>`); the component's article index answers each article's
 * routed `url` (`JoomlaSiteWriter::list` → `articleUrl`, Joomla's own router). A template that prints
 * none of these (Tracy's own `tpl_tracy` numbers no menu item) is read by the link a menu label sits
 * in. And a stored value counts only where the rendered text holds it WHOLE (the core's presence
 * rule): two records that both could show the words are AMBIGUOUS, never one of them picked.
 *
 * 🔒 THE COMPONENT HAS NO EXPECTED REVISION, so each record is read again (`content.get`) right before
 * it is written, and a record that moved under the call is never written over (STORE_CHANGED, one
 * fresh plan when nothing was written yet). Reads go through `read` (production: the raw relay for a
 * list, which must arrive whole, and `runSiteCall` for a get), writes through `write` (production:
 * `runSiteCall` — the flight, the lock retry, the write memory). Pure except for that injected I/O
 * (`read`, `write`, `pageHtml`, `mintApplyId`), so `test/replace-joomla-open.test.mjs` drives every
 * road with a fake component.
 */

import { foldForMatch, renderedUnits, views } from './html-units.mjs'
import {
  RECEIPT_MAX_BYTES,
  REPLACE_CALL,
  REPLACE_WHY,
  clip,
  dryRunAnswer,
  locateAll,
  matchUnits,
  receipt,
  spliceRaw,
  undoOf,
  wouldOf
} from './replace.mjs'
import { jsonAtoms, rewriteRecords, storeUnits, topLevelStrings } from './replace-wordpress.mjs'
import { outcomeUnknownAnswer } from './site-call.mjs'
import { outcomeUnknown, withNext } from './site.mjs'

/** @typedef {import('./replace.mjs').StoredUnit} StoredUnit */
/** @typedef {import('./replace.mjs').ReplacePlan} ReplacePlan */
/** @typedef {import('./replace.mjs').RestorePlan} RestorePlan */
/** @typedef {import('./replace.mjs').Located} Located */
/** @typedef {import('./replace.mjs').Target} Target */
/** @typedef {import('./replace.mjs').LocateHooks} LocateHooks */
/** @typedef {import('./html-units.mjs').RenderedUnit} RenderedUnit */
/** @typedef {import('./html-units.mjs').UnitElement} UnitElement */
/** @typedef {import('./html-units.mjs').Region} Region */
/** @typedef {(action: string, params: Record<string, unknown>) => Promise<any>} Door */

// ── Limits ───────────────────────────────────────────────────────────────────────────────────────

/** Reads in flight at once: all read-class relays, the WordPress engine's number. */
const READ_PARALLEL = 6
/** Summary rows per index page: the component's ceiling for a list without bodies (`contentList`). */
const INDEX_ROWS = 200
/** Index pages read per kind: 400 articles, modules or menu items. */
const INDEX_PAGES = 2
/** Rows per list page with bodies: the component's own ceiling (`$withBody ? 25 : 200`). */
const BODY_ROWS = 25
/**
 * Site scope reads at most this many body pages of contacts: 50. A site keeps a handful (the company's
 * own, a department or two), and each is a fact the footer modules repeat.
 */
const CONTACT_PAGES_MAX = 2
/**
 * Site scope (the words are not on this page, or `all:true`) reads at most this many body pages per
 * kind: 100 articles and 100 modules. A site past the cap is searched in part and the receipt says so
 * (`notReached`) — never a silent "not found".
 */
const SITE_PAGES_MAX = 4
/** Records one page reads whole, per kind: the page's own articles, its modules, its categories. */
const PAGE_ARTICLES_MAX = 12
const PAGE_MODULES_MAX = 16
const PAGE_CATEGORIES_MAX = 8
/**
 * Modules no marker names, read whole besides the page's own: a breadcrumb module (its words are
 * params) or a module whose title the change quotes. Their own allowance, so a page full of marked
 * modules cannot crowd them out.
 */
const UNMARKED_MODULES_MAX = 8
/**
 * Custom modules printed in a region of their own (topbar, header, footer), read whole besides the page's own:
 * only when the change's words stand in that region of the page, and with an allowance of their own. A footer
 * built of a dozen custom modules can then neither starve a breadcrumb's params (`UNMARKED_MODULES_MAX`; found
 * in review on 02/10/2026: eight of them left "Start" answering NOT_EDITABLE) nor be starved by them, and a
 * request about the main content reads none of them.
 */
const REGIONAL_MODULES_MAX = PAGE_MODULES_MAX
/** The lease refusal: a revert refused with it too is answered with the same code, not `PARTIAL`. */
const LEASE_CODES = new Set(['SITE_BUSY'])
/**
 * The toolset order: tracy-web's `KIND_TOOLSET` gives `module` and `templateStyle` to the `code`
 * toolset and the rest (`contact` too) to `content`, so the `code` records go first and a role without
 * that toolset is refused before anything is written. A kind missing here sorts first (`indexOf` is -1):
 * the contact record did until 02/10/2026, and was written, then undone, before a module was refused.
 */
const WRITE_ORDER = ['templateStyle', 'module', 'menuItem', 'category', 'contact', 'article']
/** A letter or a digit: a value without one prints no words. */
const LETTER = /[\p{L}\p{N}]/u

/**
 * The params that print words a visitor reads, per record — each read from what prints it, never a
 * guess: a param not listed here is words this call does not change, and a refusal names the record's
 * own `content.update` instead (`moduleNext`, `menuNext`).
 * - `templateStyle.cassiopeia`: Joomla 4–6's default template prints `siteTitle` in the logo link and
 *   `siteDescription` under it (`templates/cassiopeia/index.php`, the `brand` branch);
 * - `module.mod_breadcrumbs`: the first crumb, `homeText` (shown with `showHome`; left empty, the
 *   crumb is the language string `MOD_BREADCRUMBS_HOME` — a phrase, not a param);
 * - `module.mod_ja_acm`: a JoomlArt ACM block (the hero of every JA quickstart) keeps all its words in
 *   `jatools-config`, a JSON text inside the JSON — `{":type":"ja_mood:hero","hero":{"hero-style[hero-heading]":
 *   ["…"], …}}`. That key is opened ({@link nestedParamStrings}) and its fields that print words
 *   ({@link ACM_NOT_WORDS}) are units of their own (03/10/2026, leemood module 93: unread, the hero's heading
 *   answered NOT_EDITABLE, the agent re-typed the whole config through content.update, and the hero vanished);
 * - `menuItem`: the page's own heading `page_heading` (shown with `show_page_heading`) and its browser
 *   title `page_title` (the `<title>`).
 */
export const JOOMLA_WORD_PARAMS = Object.freeze({
  templateStyle: Object.freeze(
    /** @type {Record<string, readonly string[]>} */ ({
      cassiopeia: Object.freeze(['siteTitle', 'siteDescription'])
    })
  ),
  module: Object.freeze(
    /** @type {Record<string, readonly string[]>} */ ({
      mod_breadcrumbs: Object.freeze(['homeText']),
      mod_ja_acm: Object.freeze(['jatools-config'])
    })
  ),
  menuItem: Object.freeze(['page_heading', 'page_title'])
})

/**
 * The ACM fields that are NOT words a visitor reads, by the field's own name (`hero-style[hero-link]` →
 * `hero-link`): the rule Tracy's quickstart seeder applies to the same blocks (docs/references/
 * quickstart-content-seeding.md §4 — presentation names, plus links and pictures), and the ACM's own
 * `jatools-layout-*` and `:type` keys. Read on leemood's hero: heading, intro and button text are words;
 * style, position, align, screen, link, icon, class and action are not.
 */
export const ACM_NOT_WORDS =
  /color|class|style|layout|icon|width|height|column|align|animation|position|screen|action|link|url|image|media|video|target|selected|category|^:|^jatools-/i

// ── Sentences (T10: error ≤ 160 characters, next ≤ 200; the test holds each on its worst case) ──

/**
 * Every sentence this engine adds to the core's (`REPLACE_NEXT`), filled by {@link joText}. The
 * WordPress engine's texts name WordPress; these are the same roads said for Joomla, plus the roads a
 * NOT_EDITABLE names on this door — a record's own `content.update`, a language override for the
 * phrases Joomla ships (the site context's Joomla WORDS/PHRASES row), the global configuration for the
 * site name.
 */
export const JOOMLA_OPEN_NEXT = Object.freeze({
  restoreError: 'restore undoes an EmDash change; this site runs Joomla',
  restoreNext: 'undo a Joomla change with apply.revert {apply_id:"<the apply_id of its receipt>"}',
  markupError: 'the new words would leave {what} with markup that does not read back; nothing was written',
  markupNext: 'send the new words as plain text, without < or >: the same call with that replace',
  cutError: 'the site sent {what} cut short; a cut record is never written back',
  cutNext: 'tell the customer this change cannot be made here right now; that is an answer',
  changedError: '{what} changed on the site while this call ran; nothing was written',
  changedNext:
    'someone else is editing this site: tell the customer, and make the same call once when they are done',
  changedUndoneError:
    '{what} changed on the site while this call ran; the {n} records written first were undone',
  outcomeError:
    'the answer to writing {what} was lost: {n} or {n1} of {m} records may now hold the new words',
  outcomeNext:
    '{call} {find:"{new}", replace:"{old}", dryRun:true} in about 30 s shows where the new words stand; do not repeat the call',
  outcomeGoneNext:
    '{call} {find:"{old}", replace:"", dryRun:true} in about 30 s answers NOT_FOUND if the removal landed; do not repeat the call',
  partialError: '{n} of {m} records were written and undoing them failed: {failed}',
  partialNext:
    'tell the customer in plain words what stands; apply.revert {apply_id:"{applyId}"} undoes the rest, once',
  busyPartialNext:
    'tell the customer in plain words that {n} places changed and stand; when the site is free, apply.revert {apply_id:"{applyId}"} undoes them, once. Do not retry in a loop',
  sameError: '"{replace}" is what the site already holds there; nothing was written',
  sameNext:
    'tell the customer the page already reads so; if other words were meant, the same call with those in replace',
  // The roads a NOT_EDITABLE names (`whyOf`): never the core's "do not look for another way in".
  menuNext:
    'content.get {kind:"menuItem", id:{id}} shows its title and params; content.update {kind:"menuItem", id:{id}, fields:{…}, apply_id} writes them',
  menuListNext:
    'content.list {kind:"menuItem"} names each menu item; content.update {kind:"menuItem", id, fields:{title:"<new>"}, apply_id} renames the one meant',
  // 03/10/2026 (leemood module 93): "params:<all of them>" had the agent re-type a nested `jatools-config`
  // whole, drop a key, and blank the hero. The road is the one key as a patch object (`merge-patch.mjs`).
  moduleNext:
    'content.get {kind:"module", id:{id}} shows its params; content.update {…, fields:{params:{patch:{"<key>":<value>}}}} sends only the change; a key held as JSON text takes an object, not re-typed',
  crumbNext:
    'a breadcrumb repeats a menu item or article title: the same call on that page changes the title, and the crumb follows it',
  // 🔒 THE RECORDED DOOR, NEVER THE SHELL (ladder DL14/DL15, 14/10/2026): this named `php cli/joomla.php
  // config:set sitename=…`, a write no receipt lists, so the customer's undo in the next conversation found
  // no site-name change and two articles were undone instead. `site.identity` keeps an apply_id and its undo.
  siteNameNext:
    'site.identity {operation:"set", fields:{sitename:"<the new name>"}} changes it everywhere Joomla prints it; apply.revert undoes it',
  shippedNext:
    'content.find {text:"<the words>"} names the language key; one line in language/overrides/<tag>.override.ini changes it',
  switcherNext:
    'content.list {kind:"language"} names each language; content.update {kind:"language", id, fields:{title_native:"<new>"}, apply_id} renames one',
  unreadNext:
    'the same call with all:true, dryRun:true searches every article and module; if it finds none, content.find {text:"<the words>"}',
  // Notes and the receipt's `notReached`.
  sharedLanguages: '{what} shows in every language: the change shows in all of them',
  pageLanguages: 'their other language versions are separate records and were not changed',
  factLanguages:
    'copies in other languages are separate records: the same call with all:true changes them too',
  siteCapped: 'searched the first {n} articles and modules; the rest were not searched',
  shownOn: 'shown on {path}',
  notShownYet: 'not shown on {path} yet: a page cache may still hold the old words',
  notChecked: 'not checked: the page could not be read again'
})

/**
 * The facts {@link joText} quotes from the call or the site, and how long each may be. `new`/`old`
 * (the lost answer's dryRun) are passed only when they fit whole — a cut find is a call that fails —
 * so their width holds the budget test's worst case, never a live quote.
 */
const QUOTED_WIDTH = Object.freeze({
  find: 60,
  replace: 60,
  what: 60,
  failed: 60,
  new: 32,
  old: 32,
  path: 60
})

/**
 * Fill one {@link JOOMLA_OPEN_NEXT} sentence; a quoted fact is cut to its width, as the core does.
 * @param {keyof typeof JOOMLA_OPEN_NEXT} key
 * @param {Record<string, unknown>} [facts]
 */
export function joText(key, facts = {}) {
  return JOOMLA_OPEN_NEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (name === 'call') return REPLACE_CALL
    if (!(name in facts)) return whole
    const v = String(facts[name])
    const width = QUOTED_WIDTH[/** @type {keyof typeof QUOTED_WIDTH} */ (name)] ?? Infinity
    return v.length > width ? `${v.slice(0, width - 1)}…` : v
  })
}

/**
 * Why words the page shows are not changed here (noun phrases: the core quotes them after
 * `"<words>" is`, so each stays ≤ 73 characters and `notEditableError` in its 160 with a 60-character
 * find). 🔒 "NOT READ" IS NEVER "CANNOT": a reason that names a record or a file this call does not
 * change gets its road in `whyNext` ({@link whyOf}); only a date is a plain answer. The test holds
 * each to its 73 characters.
 */
export const JOOMLA_OPEN_WHY = Object.freeze({
  date: 'a date Joomla prints from the record',
  switcher: 'the language switcher, which Joomla prints from its languages',
  crumb: 'a breadcrumb, which Joomla builds from menu item and article titles',
  siteName: "the site name, kept in Joomla's global configuration, not a record",
  shipped: 'words Joomla or the template print from a language file',
  unread: 'words of a record this call did not read for this page',
  menuUntraced: 'a menu label this call could not trace to its menu item',
  /** @param {number} id */
  menuItem: (id) => `words of menu item ${id} that are not its title (its settings)`,
  /** @param {number} id */
  module: (id) => `words of module ${id} this call does not read (its settings)`
})
const WHY = JOOMLA_OPEN_WHY

/**
 * @param {string} code
 * @param {string} error
 * @param {string} next
 * @param {Record<string, unknown>} [extra]
 */
const refuse = (code, error, next, extra = {}) => ({ ok: false, code, verdict: code, error, next, ...extra })

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** A refusal's code, as the relay spells it (`code`) or the component does (`error`). @param {unknown} a */
const codeOf = (a) => (isRecord(a) ? String(a.code || a.error || '') : '')
/** @param {unknown} v */
const positive = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : 0
  return Number.isInteger(n) && n > 0 ? n : 0
}
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
/** A row's column as Joomla holds it: `'1'` or `1` (the driver decides). @param {unknown} v */
const flag = (v) => Number(v) === 1
/** A record's language; `*` (every language) and none are null. @param {Record<string, any>} row */
const langOfRow = (row) => {
  const l = str(row.language)
  return l === '' || l === '*' ? null : l
}
/** A name for a label: the record's words, cut to 40. @param {string} s */
const named = (s) => (s.length > 40 ? `${s.slice(0, 39)}…` : s)

// ── What the page names ──────────────────────────────────────────────────────────────────────────

/**
 * The module an element names: T4's chrome `Mod<id>`, core `mod_custom`'s `mod-custom<id>`, a core
 * chrome title's `mod-<id>` (`layouts/chromes/card.php` when the module tag is not a div). 0 when none.
 * @param {UnitElement} el
 */
export function moduleIdOf(el) {
  const m = /^(?:Mod|mod-custom|mod-)(\d+)$/.exec(el.id)
  return m ? Number(m[1]) : 0
}

/**
 * The menu item a `<li>` names: `item-<id>` (core `mod_menu`, Cassiopeia and T4) or T4's mega menu
 * `data-id`. 0 when none.
 * @param {UnitElement} el
 */
export function menuItemIdOf(el) {
  if (el.tag !== 'li') return 0
  const m = /(^|\s)item-(\d+)(\s|$)/.exec(el.cls)
  if (m) return Number(m[2])
  return /^\d+$/.test(el.data) ? Number(el.data) : 0
}

/**
 * A link's route as a menu item's `path` and an article's `url` compare: no origin, no
 * `/index.php`, no query, no slash at either end, lowercase. Null for what is not a page of the site
 * (`#`, `tel:`, `javascript:`).
 * @param {unknown} href
 * @returns {string | null}
 */
export function routeOf(href) {
  if (typeof href !== 'string' || href === '' || href.startsWith('#')) return null
  try {
    const url = new URL(href, 'http://site.invalid/')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    let p = url.pathname
    try {
      p = decodeURIComponent(p)
    } catch {
      // a malformed escape: the route as written
    }
    return p
      .replace(/^\/index\.php(?=\/|$)/i, '')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase()
  } catch {
    return null
  }
}

/**
 * A route without its language prefix, when its first segment is one of the site's language `sef`s
 * (`en/about` → `about`): a menu item's `path` carries none.
 * @param {string | null} route
 * @param {ReadonlySet<string>} sefs
 */
function withoutSef(route, sefs) {
  if (route === null) return null
  const [first, ...rest] = route.split('/')
  return sefs.has(first) ? rest.join('/') : route
}

/**
 * The region a module position prints in, read by its name — Cassiopeia's `below-top`, `menu` and
 * `search` sit inside its `<header>`; any template's `footer*`/`copyright` in its footer; the
 * breadcrumbs in the crumb band (`title`, as the page outline names it). Everything else is the page
 * body, where unlabelled words live.
 * @param {string} p
 * @returns {Region}
 */
export function positionRegion(p) {
  if (/(^|[-_])(topbar|top-bar)([-_]|$)/.test(p)) return 'topbar'
  if (/(^|[-_])(header|navbar|menu|logo|search|language|brand|below-top)([-_\d]|$)/.test(p)) return 'header'
  if (/(^|[-_])(footer|copyright)([-_\d]|$)/.test(p)) return 'footer'
  if (/breadcrumb/.test(p)) return 'title'
  return 'main'
}

/**
 * @typedef {{ units: RenderedUnit[], lang: string | null, itemId: number, view: string | null,
 *   template: string | null, modules: number[], alternates: number, status: number }} PageFacts
 *   `itemId`: the active menu item (`itemid-N` / T4 `item-N` on `<body>`, else the `current` `<li>`).
 *   `view`: `view-<name>` on `<body>`. `template`: the folder the page's own assets come from.
 *   `modules`: every module the page's elements name. `alternates`: the `hreflang` links in its head.
 */

/**
 * What the rendered page says about the records behind it.
 * @param {string} html
 * @param {number} [status]
 * @returns {PageFacts}
 */
export function pageFactsOf(html, status = 200) {
  const r = renderedUnits(html)
  const body = r.body.split(/\s+/).filter(Boolean)
  const itemTok = body.map((t) => /^(?:itemid|item)-(\d+)$/.exec(t)).find(Boolean)
  let itemId = itemTok ? Number(itemTok[1]) : 0
  /** @type {Set<number>} */
  const modules = new Set()
  for (const u of r.units)
    for (const el of u.chain) {
      const mod = moduleIdOf(el)
      if (mod > 0) modules.add(mod)
      if (itemId === 0 && /(^|\s)current(\s|$)/.test(el.cls)) itemId = menuItemIdOf(el)
    }
  const head = html.slice(0, Math.max(0, html.search(/<body\b/i)))
  return {
    units: r.units,
    lang: r.lang,
    itemId,
    view: body.find((t) => /^view-[a-z]+$/.test(t))?.slice(5) ?? null,
    template:
      /\/(?:media\/templates\/site|templates)\/([a-z0-9_-]+)\//i.exec(html)?.[1]?.toLowerCase() ?? null,
    modules: [...modules],
    alternates: [...head.matchAll(/<link\b[^>]*\bhreflang=/gi)].length,
    status
  }
}

// ── Stores: the records that render into the page ───────────────────────────────────────────────

/**
 * @typedef {'article' | 'module' | 'menuItem' | 'category' | 'templateStyle' | 'contact'} Kind
 * @typedef {{ id: string, kind: Kind, recordId: number, field: string, shape: 'blocks' | 'plain' | 'params',
 *   raw: string, keys: readonly string[], region: Region | Region[], label: string, group: string,
 *   lang: string | null, tag: string, route: string | null, position: string, module: string,
 *   writable: boolean }} Store
 *   One value `content.update` writes. `group`: the record (one `content.update` per group, its fields
 *   merged). `shape`: HTML (`blocks`, the WordPress engine's name for a body it parses), a plain value,
 *   or a `params` JSON of which `keys` print words. `route`: a menu item's path, for a label no `<li>`
 *   numbers. `position`/`module`: a module's.
 */

/** @param {Omit<Store, 'keys' | 'route' | 'position' | 'module' | 'writable'> & Partial<Store>} s @returns {Store} */
const store = (s) => ({ keys: [], route: null, position: '', module: '', writable: true, ...s })

/**
 * An article's words: its title, its intro text and its full text (an empty one prints nothing).
 * @param {number} id
 * @param {Record<string, any>} row
 * @returns {Store[]}
 */
function articleStores(id, row) {
  const title = typeof row.title === 'string' ? row.title : ''
  const name = title ? `article "${named(title)}"` : `article ${id}`
  const base = {
    kind: /** @type {const} */ ('article'),
    recordId: id,
    group: `article:${id}`,
    lang: langOfRow(row)
  }
  /** @type {Store[]} */
  const out = []
  if (title !== '')
    out.push(
      store({
        ...base,
        id: `article:${id}.title`,
        field: 'title',
        shape: 'plain',
        raw: title,
        region: ['title', 'main'],
        label: `${name}, its title`,
        tag: 'h1'
      })
    )
  for (const [field, what] of /** @type {const} */ ([
    ['introtext', 'its intro text'],
    ['fulltext', 'its full text']
  ]))
    if (typeof row[field] === 'string' && row[field] !== '')
      out.push(
        store({
          ...base,
          id: `article:${id}.${field}`,
          field,
          shape: 'blocks',
          raw: row[field],
          region: 'main',
          label: `${name}, ${what}`,
          tag: 'div'
        })
      )
  return out
}

/**
 * A module's words, from its whole row: its title when its chrome prints it (`showtitle`), its own
 * text (a custom module's `content`), and the params its type prints (`JOOMLA_WORD_PARAMS`). An
 * administrator module (`client_id` 1) prints nothing on a page.
 * @param {number} id
 * @param {Record<string, any>} row
 * @returns {Store[]}
 */
function moduleStores(id, row) {
  if (flag(row.client_id)) return []
  const title = typeof row.title === 'string' ? row.title : ''
  const type = str(row.module)
  const position = str(row.position)
  const region = positionRegion(position)
  const name = `module "${named(title || String(id))}"`
  const base = {
    kind: /** @type {const} */ ('module'),
    recordId: id,
    group: `module:${id}`,
    lang: langOfRow(row),
    region,
    position,
    module: type
  }
  /** @type {Store[]} */
  const out = []
  if (title !== '' && flag(row.showtitle))
    out.push(
      store({
        ...base,
        id: `module:${id}.title`,
        field: 'title',
        shape: 'plain',
        raw: title,
        label: `${name}, its title`,
        tag: 'h3'
      })
    )
  if (typeof row.content === 'string' && row.content !== '')
    out.push(
      store({
        ...base,
        id: `module:${id}.content`,
        field: 'content',
        shape: 'blocks',
        raw: row.content,
        label: `${name}, its text`,
        tag: 'div'
      })
    )
  const keys = JOOMLA_WORD_PARAMS.module[type] ?? []
  if (keys.length > 0 && typeof row.params === 'string')
    out.push(
      store({
        ...base,
        id: `module:${id}.params`,
        field: 'params',
        shape: 'params',
        raw: row.params,
        keys,
        label: `${name}, its settings`,
        tag: 'li'
      })
    )
  return out
}

/**
 * A menu item's label, from the index row (its title is the whole row's).
 * @param {Record<string, any>} row
 * @param {ReadonlySet<string>} sefs
 * @returns {Store | null}
 */
function menuTitleStore(row, sefs) {
  const id = positive(row.id)
  const title = typeof row.title === 'string' ? row.title : ''
  if (id === 0 || title === '') return null
  return store({
    id: `menuItem:${id}.title`,
    kind: 'menuItem',
    recordId: id,
    field: 'title',
    shape: 'plain',
    raw: title,
    region: ['header', 'footer', 'topbar', 'main', 'title'],
    label: `menu item "${named(title)}"`,
    group: `menuItem:${id}`,
    lang: langOfRow(row),
    tag: 'li',
    route: withoutSef(str(row.path).toLowerCase(), sefs)
  })
}

/**
 * The page's own menu item's heading and browser title (`JOOMLA_WORD_PARAMS.menuItem`).
 * @param {number} id
 * @param {Record<string, any>} row
 * @returns {Store[]}
 */
function menuParamStores(id, row) {
  if (typeof row.params !== 'string') return []
  return [
    store({
      id: `menuItem:${id}.params`,
      kind: 'menuItem',
      recordId: id,
      field: 'params',
      shape: 'params',
      raw: row.params,
      keys: JOOMLA_WORD_PARAMS.menuItem,
      region: ['main', 'title'],
      label: `menu item "${named(str(row.title) || String(id))}", its page settings`,
      group: `menuItem:${id}`,
      lang: langOfRow(row),
      tag: 'h1'
    })
  ]
}

/**
 * A category's title and description (the description only from a whole row).
 * @param {number} id
 * @param {Record<string, any>} row
 * @returns {Store[]}
 */
function categoryStores(id, row) {
  const title = typeof row.title === 'string' ? row.title : ''
  const name = `category "${named(title || String(id))}"`
  const base = {
    kind: /** @type {const} */ ('category'),
    recordId: id,
    group: `category:${id}`,
    lang: langOfRow(row)
  }
  /** @type {Store[]} */
  const out = []
  if (title !== '')
    out.push(
      store({
        ...base,
        id: `category:${id}.title`,
        field: 'title',
        shape: 'plain',
        raw: title,
        region: ['main', 'title'],
        label: name,
        tag: 'h1'
      })
    )
  if (typeof row.description === 'string' && row.description !== '')
    out.push(
      store({
        ...base,
        id: `category:${id}.description`,
        field: 'description',
        shape: 'blocks',
        raw: row.description,
        region: 'main',
        label: `${name}, its description`,
        tag: 'div'
      })
    )
  return out
}

/**
 * A contact's columns that print words on its page (`com_contact`) and that the component writes
 * (`JoomlaSiteWriter::MAP` — `state` is not among them): plain values, and `misc` as HTML.
 */
const CONTACT_WORDS = /** @type {const} */ ([
  ['name', 'its name'],
  ['con_position', 'its position'],
  ['address', 'its address'],
  ['suburb', 'its town'],
  ['postcode', 'its postcode'],
  ['country', 'its country'],
  ['telephone', 'its telephone'],
  ['mobile', 'its mobile'],
  ['fax', 'its fax'],
  ['email_to', 'its e-mail'],
  ['webpage', 'its web address']
])

/**
 * A contact's words: the details its page prints, and its free text. The phone, e-mail and address a
 * footer module repeats are a contact's own columns too — read only by articles and modules until
 * 02/10/2026, "change our phone number everywhere" left the contact page on the old number (measured on
 * an imported Joomla 5 copy, where the agent then reported every place changed).
 * @param {number} id
 * @param {Record<string, any>} row
 * @returns {Store[]}
 */
function contactStores(id, row) {
  const title = typeof row.name === 'string' ? row.name : ''
  const name = title ? `contact "${named(title)}"` : `contact ${id}`
  const base = {
    kind: /** @type {const} */ ('contact'),
    recordId: id,
    group: `contact:${id}`,
    lang: langOfRow(row)
  }
  /** @type {Store[]} */
  const out = []
  for (const [field, what] of CONTACT_WORDS)
    if (typeof row[field] === 'string' && row[field].trim() !== '')
      out.push(
        store({
          ...base,
          id: `contact:${id}.${field}`,
          field,
          shape: 'plain',
          raw: row[field],
          region: field === 'name' ? ['title', 'main'] : 'main',
          label: `${name}, ${what}`,
          tag: field === 'name' ? 'h1' : 'span'
        })
      )
  if (typeof row.misc === 'string' && row.misc !== '')
    out.push(
      store({
        ...base,
        id: `contact:${id}.misc`,
        field: 'misc',
        shape: 'blocks',
        raw: row.misc,
        region: 'main',
        label: `${name}, its other information`,
        tag: 'div'
      })
    )
  return out
}

/**
 * The template style's brand words, for a template `JOOMLA_WORD_PARAMS` has measured.
 * @param {number} id
 * @param {Record<string, any>} row
 * @returns {Store[]}
 */
function styleStores(id, row) {
  const keys = JOOMLA_WORD_PARAMS.templateStyle[str(row.template).toLowerCase()] ?? []
  if (keys.length === 0 || typeof row.params !== 'string') return []
  return [
    store({
      id: `templateStyle:${id}.params`,
      kind: 'templateStyle',
      recordId: id,
      field: 'params',
      shape: 'params',
      raw: row.params,
      keys,
      region: ['header', 'topbar'],
      label: `the template style "${named(str(row.title) || String(id))}"`,
      group: `templateStyle:${id}`,
      lang: null,
      tag: 'a'
    })
  ]
}

/**
 * The string members of a `params` JSON object that print words, each as its atoms with their raw
 * spans (an en dash that `json_encode` escaped is one character over six bytes). When a key is written
 * twice, JSON reads the last.
 * @param {string} raw
 * @param {readonly string[]} keys
 */
function paramStrings(raw, keys) {
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const open = raw.indexOf('{')
  if (!isRecord(parsed) || open === -1) return []
  /** @type {Map<string, number>} */
  const last = new Map()
  for (const { key, q } of topLevelStrings(raw, open, raw.length)) last.set(key, q)
  /** @type {{ key: string, atoms: { c: string, s: number, e: number }[], layers: number }[]} */
  const out = []
  for (const [key, q] of last) {
    if (!keys.includes(key) || typeof parsed[key] !== 'string') continue
    const atoms = jsonAtoms(raw, q)
    if (isRecord(jsonOf(parsed[key]))) out.push(...nestedParamStrings(key, atoms))
    else out.push({ key, atoms, layers: 1 })
  }
  return out
}

/**
 * The words inside a param that holds JSON text (an ACM's `jatools-config`): every string the inner JSON
 * keeps under a field {@link ACM_NOT_WORDS} does not exclude, each as its atoms with their spans in the
 * OUTER raw column — an inner atom covers the outer atoms its characters were escaped into, so the splice
 * writes the column's own bytes and nothing else. `key` is the path, `jatools-config.hero.<field>[i]`.
 * The caller has checked that the text is one JSON object; any other value stays one plain param.
 * @param {string} key - the outer param.
 * @param {{ c: string, s: number, e: number }[]} outer - its string's atoms in the raw column.
 */
function nestedParamStrings(key, outer) {
  /** @type {number[]} */
  const at = []
  outer.forEach((a, i) => {
    for (let k = 0; k < a.c.length; k += 1) at.push(i)
  })
  const inner = outer.map((a) => a.c).join('')
  /** @type {{ key: string, atoms: { c: string, s: number, e: number }[], layers: number }[]} */
  const out = []
  for (const v of jsonStringValues(inner)) {
    const field = /\[([^\]]+)\]$/.exec(v.member)?.[1] ?? v.member
    if (ACM_NOT_WORDS.test(field)) continue
    const atoms = jsonAtoms(inner, v.q).map((a) => ({
      c: a.c,
      s: outer[at[a.s]].s,
      e: outer[at[a.e - 1]].e
    }))
    out.push({ key: `${key}.${v.path}`, atoms, layers: 2 })
  }
  return out
}

/** A text's JSON value, or undefined when it is not JSON. @param {string} text */
function jsonOf(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Every string VALUE of the JSON text `text` (member names are not values), with the index of its
 * opening quote, the member it stands under (a list's items stand under the list's member) and its path
 * (`hero.hero-style[hero-heading][0]`). `text` must be JSON.
 * @param {string} text
 * @returns {{ q: number, member: string, path: string }[]}
 */
function jsonStringValues(text) {
  /** @type {{ q: number, member: string, path: string }[]} */
  const out = []
  /** @type {{ list: boolean, member: string, path: string, index: number, key: string | null }[]} */
  const stack = []
  /** @param {number} k - at a `"`; the index after the closing quote */
  const end = (k) => {
    let j = k + 1
    while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
    return j + 1
  }
  /** Where a value starting now stands: its member and path. */
  const place = () => {
    const top = stack[stack.length - 1]
    if (!top) return { member: '', path: '' }
    if (top.list) return { member: top.member, path: `${top.path}[${top.index}]` }
    const name = top.key ?? ''
    return { member: name, path: top.path === '' ? name : `${top.path}.${name}` }
  }
  for (let k = 0; k < text.length; ) {
    const c = text[k]
    const top = stack[stack.length - 1]
    if (c === '"') {
      const e = end(k)
      if (top && !top.list && top.key === null) top.key = JSON.parse(text.slice(k, e))
      else out.push({ q: k, ...place() })
      k = e
      continue
    }
    if (c === '{' || c === '[') {
      const p = place()
      stack.push({ list: c === '[', member: p.member, path: p.path, index: 0, key: null })
    } else if (c === '}' || c === ']') stack.pop()
    else if (c === ',' && top) {
      if (top.list) top.index += 1
      else top.key = null
    }
    k += 1
  }
  return out
}

/**
 * The words a `params` column prints, for the after-write check: each listed key's string, and for a key
 * that holds JSON text (an ACM's `jatools-config`) every string inside it, decoded.
 * @param {Record<string, unknown>} parsed
 * @param {readonly string[]} keys
 */
function paramWords(parsed, keys) {
  /** @param {unknown} v @returns {string[]} */
  const leaves = (v) =>
    typeof v === 'string' ? [v] : v !== null && typeof v === 'object' ? Object.values(v).flatMap(leaves) : []
  return keys
    .map((k) => {
      const v = parsed[k]
      if (typeof v !== 'string') return ''
      const inner = jsonOf(v)
      return isRecord(inner) ? leaves(inner).join('\n') : v
    })
    .join('\n')
}

/**
 * @typedef {StoredUnit & { store: string, unitKind: 'html' | 'attr' | 'plain' | 'param',
 *   paramKey?: string, paramLayers?: number, attrName?: string, breaks?: number }} JoomlaUnit
 */

/**
 * The stored units of every store, each with its `at`: `<store>#<tag>[.<n>][@<attribute>]` in an
 * HTML field (`article:5.introtext#p.2`), `<store>:<key>` in params (`templateStyle:11.params:siteTitle`),
 * the store id itself for a plain value (`menuItem:101.title`). Stable while the record is unchanged,
 * so an AMBIGUOUS answer's `at` names the same value on the next call.
 * @param {readonly Store[]} stores
 * @returns {JoomlaUnit[]}
 */
function unitsOfStores(stores) {
  /** @type {any[]} */
  const out = []
  for (const s of stores) {
    const common = {
      raw: s.raw,
      store: s.id,
      label: s.label,
      region: s.region,
      lang: s.lang,
      writable: s.writable
    }
    if (s.shape === 'blocks') {
      /** @type {Map<string, number>} */
      const seen = new Map()
      for (const d of storeUnits('blocks', s.raw)) {
        const n = (seen.get(d.tag) ?? 0) + 1
        seen.set(d.tag, n)
        const at = `${s.id}#${d.tag}${n > 1 ? `.${n}` : ''}${d.unitKind === 'attr' ? `@${d.attrName}` : ''}`
        out.push({ ...d, ...common, at })
      }
    } else if (s.shape === 'plain') {
      const v = views(s.raw, { decode: false })
      if (LETTER.test(v.cased)) out.push({ ...v, ...common, at: s.id, unitKind: 'plain', tag: s.tag })
    } else
      for (const p of paramStrings(s.raw, s.keys)) {
        const v = views(s.raw, { atoms: p.atoms })
        if (LETTER.test(v.cased))
          out.push({
            ...v,
            ...common,
            at: `${s.id}:${p.key}`,
            unitKind: 'param',
            paramKey: p.key,
            paramLayers: p.layers,
            tag: s.tag
          })
      }
  }
  return out
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
 * its answer did not come back, so it reads as `OUTCOME_UNKNOWN` — never as "unreachable, ask once
 * more", which would send the same write twice.
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
 * A record that is simply not there (the component's `not_found`): it is left out. Anything else that
 * is not `ok` — a seat, a role, the lease, the network — stops the call.
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
 * A menu item's `link` read as the page it opens: `index.php?option=com_content&view=article&id=5`.
 * @param {string} link
 */
function linkOf(link) {
  const i = link.indexOf('?')
  const q = new URLSearchParams(i === -1 ? '' : link.slice(i + 1))
  return { option: q.get('option') ?? '', view: q.get('view') ?? '', id: positive(q.get('id') ?? '') }
}

/**
 * @typedef {{ stores: Store[], pageItem: number, pageHeading: boolean, ownHeading: boolean,
 *   itemArticle: number, pageArticles: Set<number>, pageCategories: Set<number>,
 *   moduleTypes: Map<number, string>, sefs: Set<string>, languages: number, scanned: number,
 *   capped: boolean }} ReadSet
 *   `pageItem`: the active menu item (0 when the page names none); `pageHeading`: its page heading is
 *   shown, `ownHeading`: in words of its own (`page_heading`), not its title; `itemArticle`: the
 *   article it links to (its `<title>` and last crumb are then the menu
 *   item's, not the article's). `pageArticles` / `pageCategories`: the records this page shows (by its menu item's link, an
 *   article's routed url, a title the page prints, the listing the page is). `languages`: the
 *   published content languages. `scanned` / `capped`: how far a site-wide search reached.
 */

/**
 * Every record that renders into the page, read through the door in waves (the indexes and, site
 * wide, the bodies; then this page's own records whole; then the style its menu item names), each
 * wave at most {@link READ_PARALLEL} reads at once. `site`: the words are not on this page, or `all`.
 * @param {Door} read
 * @param {PageFacts | null} page
 * @param {{ site: boolean, plan: ReplacePlan }} options
 * @returns {Promise<{ ok: true, set: ReadSet } | { ok: false, answer: Record<string, unknown> }>}
 */
async function readStores(read, page, { site, plan }) {
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
  const failed = () =>
    cutWhat.length > 0
      ? {
          ok: /** @type {const} */ (false),
          answer: refuse('READ_FAILED', joText('cutError', { what: cutWhat[0] }), joText('cutNext'))
        }
      : stop !== null
        ? { ok: /** @type {const} */ (false), answer: /** @type {Record<string, unknown>} */ (stop) }
        : null
  let scanned = 0
  let capped = false
  /**
   * Every row of one kind, one list page at a time, at most `pages` pages.
   * @param {string} kind
   * @param {number} pages
   * @param {boolean} body
   * @returns {Promise<Record<string, any>[]>}
   */
  const listAll = async (kind, pages, body) => {
    /** @type {Record<string, any>[]} */
    const rows = []
    const limit = body ? BODY_ROWS : INDEX_ROWS
    for (let n = 0; n < pages; n += 1) {
      const got = await read('content.list', {
        kind,
        limit,
        offset: n * limit,
        ...(body ? { include_body: true } : {})
      })
      if (cut(got)) {
        cutWhat.push(`the list of ${kind} records`)
        return rows
      }
      if (!ok(got) || !Array.isArray(got.items)) return rows
      for (const row of got.items) if (isRecord(row)) rows.push(row)
      if (body) scanned += got.items.length
      if (got.items.length < limit) return rows
      if (body && n === pages - 1) capped = true
    }
    return rows
  }

  // Wave 1: the indexes, and, site wide, every article and module body.
  /** @type {Record<'article' | 'module' | 'menuItem' | 'templateStyle' | 'language' | 'category', Record<string, any>[]>} */
  const index = { article: [], module: [], menuItem: [], templateStyle: [], language: [], category: [] }
  /** @type {Record<'article' | 'module' | 'contact', Record<string, any>[]>} */
  const bodies = { article: [], module: [], contact: [] }
  /** @type {(() => Promise<void>)[]} */
  const wave1 = [
    async () => {
      index.article = await listAll('article', INDEX_PAGES, false)
    },
    async () => {
      index.module = await listAll('module', INDEX_PAGES, false)
    },
    async () => {
      index.menuItem = await listAll('menuItem', INDEX_PAGES, false)
    },
    async () => {
      index.templateStyle = await listAll('templateStyle', 1, false)
    },
    async () => {
      index.language = await listAll('language', 1, false)
    }
  ]
  if (site)
    wave1.push(
      async () => {
        bodies.article = await listAll('article', SITE_PAGES_MAX, true)
      },
      async () => {
        bodies.module = await listAll('module', SITE_PAGES_MAX, true)
      },
      async () => {
        bodies.contact = await listAll('contact', CONTACT_PAGES_MAX, true)
      },
      async () => {
        index.category = await listAll('category', INDEX_PAGES, false)
      }
    )
  await inPool(wave1, (task) => task())
  const first = failed()
  if (first) return first

  const sefs = new Set(index.language.map((r) => str(r.sef).toLowerCase()).filter(Boolean))
  const languages = index.language.filter((r) => flag(r.published)).length
  const pageLang = page?.lang ? page.lang.toLowerCase() : null
  /** A record the page's language shows: its own, every language's, or any when the page names none. @param {Record<string, any>} row */
  const langOk = (row) => {
    const l = str(row.language).toLowerCase()
    return (
      pageLang === null ||
      l === '' ||
      l === '*' ||
      l === pageLang ||
      l.split('-')[0] === pageLang.split('-')[0]
    )
  }
  const pageRoute = page ? routeOf(plan.path) : null
  const pageBare = withoutSef(pageRoute, sefs)
  const moduleTypes = new Map(index.module.map((r) => [positive(r.id), str(r.module)]))

  // The page's own menu item: the body names it (or its `current` <li>), else the one routed here.
  let pageItem = page?.itemId ?? 0
  if (pageItem === 0 && page && pageBare !== null) {
    const same = index.menuItem.filter(
      (r) => flag(r.published) && langOk(r) && withoutSef(str(r.path).toLowerCase(), sefs) === pageBare
    )
    if (same.length === 1) pageItem = positive(same[0].id)
  }
  const itemRow = index.menuItem.find((r) => positive(r.id) === pageItem) ?? null
  const link = linkOf(str(itemRow?.link))

  // Wave 2: this page's own records, whole.
  /** @type {Record<Kind, Set<number>>} */
  const want = {
    article: new Set(),
    module: new Set(),
    menuItem: new Set(),
    category: new Set(),
    templateStyle: new Set(),
    contact: new Set()
  }
  /** @type {Set<number>} */
  const pageArticles = new Set()
  /** @type {Set<number>} */
  const pageCategories = new Set()
  if (page) {
    if (pageItem > 0) want.menuItem.add(pageItem)
    const content = link.option === 'com_content'
    if (content && link.view === 'category' && link.id > 0) pageCategories.add(link.id)
    // A contact's page prints that contact's own columns.
    if (link.option === 'com_contact' && link.view === 'contact' && link.id > 0) want.contact.add(link.id)
    // Nearest first, so the cap keeps the page's own article: its menu item's, then its routed url,
    // then an article whose title the page prints, then the listing the page is.
    /** @type {number[][]} */
    const ranked = [[], [], [], []]
    if (content && link.view === 'article' && link.id > 0) ranked[0].push(link.id)
    // A title the page prints as its own words — not a menu label or the <title>, which name a menu
    // item as often as an article ("About us" in the menu is not the article "About us" shown).
    const shown = new Set(page.units.filter((u) => !u.hidden && !u.inNav && !u.inTitle).map((u) => u.lower))
    const featured = link.view === 'featured' || page.view === 'featured'
    for (const r of index.article) {
      const id = positive(r.id)
      if (id === 0 || !langOk(r)) continue
      const route = routeOf(str(r.url))
      const live = flag(r.state)
      if (route !== null && (route === pageRoute || withoutSef(route, sefs) === pageBare)) ranked[1].push(id)
      else if (live && shown.has(foldForMatch(r.title))) ranked[2].push(id)
      else if (live && ((featured && flag(r.featured)) || pageCategories.has(positive(r.catid))))
        ranked[3].push(id)
    }
    for (const id of ranked.flat()) if (pageArticles.size < PAGE_ARTICLES_MAX) pageArticles.add(id)
    const catOf = new Map(index.article.map((r) => [positive(r.id), positive(r.catid)]))
    for (const id of pageArticles) {
      want.article.add(id)
      const cat = catOf.get(id) ?? 0
      if (cat > 0 && pageCategories.size < PAGE_CATEGORIES_MAX) pageCategories.add(cat)
    }
    for (const id of pageCategories) want.category.add(id)
    // 🔒 THE MODULES THE WORDS' OWN OCCURRENCES SIT IN FIRST, then the rest of the page's, up to the
    // cap: a T4 page names twenty modules and more, and the one holding the words must not be the one
    // the cap leaves out (the WordPress engine's `namedBy`, for the same reason).
    const named = plan.changes.flatMap((c) =>
      matchUnits(page.units, c.find).hits.flatMap((h) => h.unit.chainAt(h.a).map(moduleIdOf))
    )
    for (const id of [...named, ...page.modules])
      if (id > 0 && want.module.size < PAGE_MODULES_MAX) want.module.add(id)
    // The style the page's template reads its brand from: the home style for the page's language, else
    // the site's; the menu item's own style, when it names one, comes in the third wave.
    const styles = index.templateStyle.filter(
      (r) => page.template === null || str(r.template).toLowerCase() === page.template
    )
    const home =
      styles.find((r) => pageLang !== null && str(r.home).toLowerCase() === pageLang) ??
      styles.find((r) => str(r.home) === '1')
    if (home && JOOMLA_WORD_PARAMS.templateStyle[str(home.template).toLowerCase()])
      want.templateStyle.add(positive(home.id))
  }
  // 🔒 A MODULE NO MARKER NAMES IS READ WHOLE ONLY WHEN THE CHANGE QUOTES ITS TITLE, OR WHEN ITS TYPE
  // PRINTS WORDS FROM ITS PARAMS (`mod_breadcrumbs` prints no id around its crumbs): the index does not
  // say whether its chrome prints the title (`showtitle`) or whether it is an administrator's module
  // (`client_id`), and a title that is not printed is not a place.
  // The regions the change's words stand in on this page: the only places a custom module no marker names can
  // hold them (empty on a site-scope call, which has no page).
  const wordRegions = new Set(
    page === null
      ? []
      : plan.changes.flatMap((c) => matchUnits(page.units, c.find).hits.map((h) => h.unit.region))
  )
  let unmarked = 0
  let regionalRead = 0
  for (const r of index.module) {
    const id = positive(r.id)
    if (id === 0 || want.module.has(id)) continue
    if (!flag(r.published) || !langOk(r)) continue
    const params = page !== null && JOOMLA_WORD_PARAMS.module[str(r.module)] !== undefined
    // A custom module in a region of its own (topbar, header, footer) prints its `content` with no id around
    // it on JoomlArt's T4: read it whole when the words stand in that region, so its words can be told from
    // every other module's (the anchor rule for such content is in `openHooks`). Its own allowance.
    const region = positionRegion(str(r.position))
    const regional = str(r.module) === 'mod_custom' && region !== 'main' && wordRegions.has(region)
    const title = views(str(r.title), { decode: false })
    if (params || plan.changes.some((c) => matchUnits([title], c.find).hits.length > 0)) {
      if (unmarked >= UNMARKED_MODULES_MAX) continue
      want.module.add(id)
      unmarked += 1
    } else if (regional && regionalRead < REGIONAL_MODULES_MAX) {
      want.module.add(id)
      regionalRead += 1
    }
  }
  // The places an earlier answer named (`at`), wherever they are.
  for (const a of plan.at ?? []) {
    const m = /^(article|module|menuItem|category|templateStyle|contact):(\d+)/.exec(a)
    if (m) want[/** @type {Kind} */ (m[1])].add(Number(m[2]))
  }
  /** @type {Record<'article' | 'module' | 'contact', Map<number, Record<string, any>>>} */
  const listed = {
    article: new Map(bodies.article.map((r) => [positive(r.id), r])),
    module: new Map(bodies.module.map((r) => [positive(r.id), r])),
    contact: new Map(bodies.contact.map((r) => [positive(r.id), r]))
  }
  /** @type {Map<string, Record<string, any>>} */
  const rows = new Map()
  /** @type {{ kind: Kind, id: number }[]} */
  const reads = []
  for (const kind of /** @type {Kind[]} */ (Object.keys(want)))
    for (const id of want[kind]) {
      if (id === 0) continue
      const got =
        kind === 'article' || kind === 'module' || kind === 'contact' ? listed[kind].get(id) : undefined
      if (got) rows.set(`${kind}:${id}`, got)
      else reads.push({ kind, id })
    }
  /** @param {{ kind: Kind, id: number }[]} list */
  const readWhole = (list) =>
    inPool(list, async ({ kind, id }) => {
      const got = await read('content.get', { kind, id })
      if (cut(got)) cutWhat.push(`${kind} ${id}`)
      else if (ok(got) && isRecord(got.item)) rows.set(`${kind}:${id}`, got.item)
    })
  await readWhole(reads)
  const second = failed()
  if (second) return second

  // Wave 3: the style the page's menu item names, when it is not the one read.
  const itemWhole = pageItem > 0 ? (rows.get(`menuItem:${pageItem}`) ?? null) : null
  const styleId = positive(itemWhole?.template_style_id)
  if (styleId > 0 && !rows.has(`templateStyle:${styleId}`)) {
    const row = index.templateStyle.find((r) => positive(r.id) === styleId)
    if (row && JOOMLA_WORD_PARAMS.templateStyle[str(row.template).toLowerCase()]) {
      await readWhole([{ kind: 'templateStyle', id: styleId }])
      const third = failed()
      if (third) return third
    }
  }
  /** @type {Record<string, any>} */
  let itemParams = {}
  try {
    const parsed = JSON.parse(str(itemWhole?.params) || '{}')
    if (isRecord(parsed)) itemParams = parsed
  } catch {
    // a params column that is not JSON prints no heading this call can read
  }

  // The stores, in a stable order (the waves finish in any order).
  /** @type {Store[]} */
  const stores = []
  const whole = (/** @type {string} */ kind) =>
    [...rows]
      .filter(([key]) => key.startsWith(`${kind}:`))
      .map(([key, row]) => /** @type {const} */ ([Number(key.slice(kind.length + 1)), row]))
  /** @type {Map<number, Record<string, any>>} */
  const articles = new Map()
  // site wide: the published articles; this page's own and those `at` names, whatever their state
  for (const [id, row] of listed.article) if (id > 0 && flag(row.state)) articles.set(id, row)
  for (const [id, row] of whole('article')) articles.set(id, row)
  for (const [id, row] of articles) stores.push(...articleStores(id, row))
  /** @type {Map<number, Record<string, any>>} */
  const modules = new Map()
  for (const [id, row] of listed.module) if (id > 0 && flag(row.published)) modules.set(id, row)
  for (const [id, row] of whole('module')) modules.set(id, row)
  for (const [id, row] of modules) stores.push(...moduleStores(id, row))
  for (const r of index.menuItem)
    if (flag(r.published) || positive(r.id) === pageItem) {
      const s = menuTitleStore(r, sefs)
      if (s) stores.push(s)
    }
  if (itemWhole) stores.push(...menuParamStores(pageItem, itemWhole))
  /** @type {Map<number, Record<string, any>>} */
  const categories = new Map()
  for (const r of index.category)
    if (positive(r.id) > 0 && flag(r.published))
      categories.set(positive(r.id), { title: r.title, language: r.language })
  for (const [id, row] of whole('category')) categories.set(id, row)
  for (const [id, row] of categories) stores.push(...categoryStores(id, row))
  for (const [id, row] of whole('templateStyle')) stores.push(...styleStores(id, row))
  /** @type {Map<number, Record<string, any>>} */
  const contacts = new Map()
  for (const [id, row] of listed.contact) if (id > 0 && flag(row.published)) contacts.set(id, row)
  for (const [id, row] of whole('contact')) contacts.set(id, row)
  for (const [id, row] of contacts) stores.push(...contactStores(id, row))
  const byId = new Map(stores.map((s) => [s.id, s]))
  return {
    ok: true,
    set: {
      stores: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
      pageItem,
      pageHeading: flag(itemParams.show_page_heading),
      ownHeading: typeof itemParams.page_heading === 'string' && itemParams.page_heading.trim() !== '',
      itemArticle: link.option === 'com_content' && link.view === 'article' ? link.id : 0,
      pageArticles,
      pageCategories,
      moduleTypes,
      sefs,
      languages,
      scanned,
      capped
    }
  }
}

// ── Anchoring: which records render where ────────────────────────────────────────────────────────

/**
 * Does a `<title>` hold this value the way Joomla builds it ("Site - Title", "Title - Site")?
 * @param {string} title
 * @param {string} v
 */
const titleHolds = (title, v) => title === v || title.endsWith(` - ${v}`) || title.startsWith(`${v} - `)

/** Classes Joomla and its templates put around a brand, a switcher and the phrases they print. */
const BRAND = /(^|\s)(navbar-brand|brand-logo|site-title|tracy-brand|logo)(\s|$)/
const SWITCHER = /(^|\s)(mod-languages|lang-inline|lang-block|lang-active)(\s|$)/
const SHIPPED = /(^|\s)(readmore|pagination|counter|mod-breadcrumbs__here|article-info-term|icons)(\s|$)/

/**
 * What the elements around one occurrence say, innermost first: the module and the menu item they
 * name, the link the words sit in, whether they are a heading, a brand, a menu.
 * @typedef {{ chain: UnitElement[], mod: number, item: number, href: string | null, heading: boolean,
 *   brand: boolean, nav: boolean, cls: string, tokens: Set<string> }} OccFacts
 *   `cls`: every id and class around the words, space-padded; `tokens`: the same, one by one.
 */

/**
 * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
 * @returns {OccFacts}
 */
function occFacts(occ) {
  const chain = occ.unit.chainAt(occ.a)
  let mod = 0
  let item = 0
  /** @type {string | null} */
  let href = null
  let heading = false
  let brand = false
  for (const el of chain) {
    if (mod === 0) mod = moduleIdOf(el)
    if (item === 0) item = menuItemIdOf(el)
    if (href === null && el.tag === 'a' && el.href) href = el.href
    if (/^h[1-6]$/.test(el.tag)) heading = true
    if (BRAND.test(el.cls)) brand = true
  }
  const cls = chain.map((el) => ` ${el.id} ${el.cls} `).join(' ')
  return {
    chain,
    mod,
    item,
    href,
    heading,
    brand,
    nav: occ.unit.inNav || chain.some((el) => el.tag === 'nav'),
    cls,
    tokens: new Set(cls.split(/\s+/).filter(Boolean))
  }
}

/** A language tag's primary subtag: `en-GB` → `en`. @param {string} tag */
const primary = (tag) => tag.toLowerCase().split(/[-_]/)[0]

/**
 * The hooks that tell the core what an open Joomla page knows.
 * @param {ReadSet} set
 * @param {Map<string, string>} whyNext - filled by {@link whyOf}: the next for a reason that names a
 *   road, keyed by the reason.
 * @param {string | null} lang - the page's `<html lang>`.
 * @returns {LocateHooks}
 */
function openHooks(set, whyNext, lang) {
  const pageLang = lang ? primary(lang) : null
  const storeById = new Map(set.stores.map((s) => [s.id, s]))
  /** @type {WeakMap<object, OccFacts>} */
  const cache = new WeakMap()
  /** @param {import('./replace.mjs').Hit<RenderedUnit>} occ */
  const factsOf = (occ) => {
    let f = cache.get(occ)
    if (!f) cache.set(occ, (f = occFacts(occ)))
    return f
  }
  /** A custom module prints its own words and nothing else. @param {number} mod */
  const custom = (mod) => set.moduleTypes.get(mod) === 'mod_custom'
  /** @type {LocateHooks} */
  const hooks = {
    anchor: (hit, occ) => {
      const u = /** @type {JoomlaUnit} */ (hit.unit)
      const s = storeById.get(u.store)
      if (!s) return false
      // 🔒 A RECORD IN ANOTHER LANGUAGE NEVER SHOWS ON THIS PAGE (Joomla's language filter serves each
      // edition its own records, and `*` ones to all): a label no `<li>` numbers is matched by its
      // route, which two editions may share (`/en/contact`, `/fr/contact`).
      if (pageLang !== null && s.lang !== null && primary(s.lang) !== pageLang) return false
      const f = factsOf(occ)
      // An attribute on the page is written from an attribute in the store, and text from text.
      if (u.unitKind === 'attr') {
        if (occ.unit.attr !== u.attrName) return false
      } else if (occ.unit.attr) return false
      const inTitle = occ.unit.inTitle
      const region = occ.unit.region
      if (s.kind === 'menuItem') {
        if (s.field === 'title') {
          // A menu `<li>` names its item; a template that numbers none is read by the link's route.
          if (f.item > 0) return f.item === s.recordId
          if (f.nav && f.href !== null && !inTitle) {
            const route = withoutSef(routeOf(f.href), set.sefs)
            if (route !== null && (route === s.route || route === '')) return true
          }
          // Otherwise only the page's own item: its <title>, its breadcrumb, its shown page heading.
          if (s.recordId !== set.pageItem) return false
          if (inTitle) return titleHolds(occ.unit.lower, u.lower)
          if (region === 'title') return occ.unit.lower === u.lower
          // The page heading is the menu title only when no `page_heading` of its own is set.
          return (
            set.pageHeading && !set.ownHeading && f.heading && region === 'main' && occ.unit.lower === u.lower
          )
        }
        if (f.item > 0 || f.mod > 0) return false
        if (u.paramKey === 'page_title') return inTitle && titleHolds(occ.unit.lower, u.lower)
        return set.pageHeading && f.heading && region === 'main'
      }
      if (s.kind === 'module') {
        if (f.item > 0) return false
        if (f.mod > 0) return f.mod === s.recordId
        // No marker: a title its chrome prints as a heading, or a param, in its position's region —
        // or inside the chrome that names its position (Cassiopeia's card: `sidebar-right card`, whose
        // `h3.card-header` the region reader files under `header` by its token).
        // 🔒 A CUSTOM MODULE'S OWN WORDS, NO MARKER AROUND THEM (02/10/2026). JoomlArt's T4 prints no
        // `mod-custom<id>` around a module in its topbar, so "Discover a huge range of great value Fiji
        // packages…" (module 111, position `topbar`) answered "words Joomla or the template print from a
        // language file" — wrong — and the agent spent nine calls finding the module by hand. Taken when the
        // module is a custom one and its position names a REGION (topbar, header, footer): the words stand
        // in that region and in no other module's content. A position that maps to no region (`sidebar-right`,
        // `section-3`) is the default `main`, where article text lives too, so it stays unclaimed.
        if (s.field === 'content')
          return s.module === 'mod_custom' && region !== 'main' && region === positionRegion(s.position)
        const where =
          region === positionRegion(s.position) ||
          (s.position !== '' && f.tokens.has(s.position)) ||
          (s.module === 'mod_breadcrumbs' && region === 'title')
        return where && (s.field !== 'title' || f.heading)
      }
      if (s.kind === 'article') {
        if (f.item > 0 || (f.mod > 0 && custom(f.mod))) return false
        const own = set.pageArticles.size === 0 || set.pageArticles.has(s.recordId)
        // The browser title and the crumbs of a page its menu item opens are that item's words; an
        // article's title stands there only on a page a listing opens (`view=category` → the article).
        if (inTitle || region === 'title')
          return (
            s.field === 'title' &&
            own &&
            s.recordId !== set.itemArticle &&
            (inTitle ? titleHolds(occ.unit.lower, u.lower) : occ.unit.lower === u.lower)
          )
        return own
      }
      if (s.kind === 'category') {
        if (f.item > 0 || inTitle || (f.mod > 0 && custom(f.mod))) return false
        return set.pageCategories.size === 0 || set.pageCategories.has(s.recordId)
      }
      // A contact's page prints its own columns in its body; the same phone in a module is the module's.
      if (s.kind === 'contact') {
        if (f.item > 0 || f.mod > 0 || inTitle) return false
        return region === 'main' || (region === 'title' && s.field === 'name')
      }
      // templateStyle: the brand the header prints
      return f.item === 0 && f.mod === 0 && !inTitle && (region === 'header' || region === 'topbar')
    },
    why: (occ) => whyOf(factsOf(occ), occ, set, whyNext),
    // A heading on two lines is one unit here (`A <br><em>B</em>`), never two stored values.
    pairs: () => []
  }
  return hooks
}

/**
 * Why the words at this occurrence have no door here — and, for every reason but a date, the road
 * that does reach them (`whyNext`), so the refusal never carries the core's "that is an answer" for a
 * record or a file this call simply does not change.
 * @param {OccFacts} f
 * @param {import('./replace.mjs').Hit<RenderedUnit>} occ
 * @param {ReadSet} set
 * @param {Map<string, string>} whyNext
 */
function whyOf(f, occ, set, whyNext) {
  /** @param {string} why @param {string} next */
  const road = (why, next) => {
    if (!whyNext.has(why)) whyNext.set(why, next)
    return why
  }
  if (f.chain.some((el) => el.tag === 'time')) return WHY.date
  if (SHIPPED.test(f.cls)) return road(WHY.shipped, joText('shippedNext'))
  if (SWITCHER.test(f.cls)) return road(WHY.switcher, joText('switcherNext'))
  if (f.item > 0) return road(WHY.menuItem(f.item), joText('menuNext', { id: f.item }))
  if (f.mod > 0) return road(WHY.module(f.mod), joText('moduleNext', { id: f.mod }))
  if (occ.unit.inTitle)
    return set.pageItem > 0
      ? road(REPLACE_WHY.title, joText('menuNext', { id: set.pageItem }))
      : REPLACE_WHY.title
  if (occ.unit.region === 'title') return road(WHY.crumb, joText('crumbNext'))
  if (f.brand) return road(WHY.siteName, joText('siteNameNext'))
  if (occ.unit.inForm) return road(REPLACE_WHY.form, joText('shippedNext'))
  if (f.nav) return road(WHY.menuUntraced, joText('menuListNext'))
  if (occ.unit.region === 'main') return road(WHY.unread, joText('unreadNext'))
  return road(WHY.shipped, joText('shippedNext'))
}

// ── Rewriting ────────────────────────────────────────────────────────────────────────────────────

/** @param {JoomlaUnit} u */
const isHtmlUnit = (u) => u.unitKind === 'html' || u.unitKind === 'attr'

/** New words as a JSON string's inside: `"` `\` and control characters escaped. @param {string} t */
const jsonText = (t) => JSON.stringify(t).slice(1, -1)

/**
 * `glyph` arrows the template prints beside the words are not stored, so the same arrows on the new
 * words are left out (the core's `plainReplace`, which is not exported).
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

/**
 * @typedef {{ store: Store, before: string, after: string }} StoreWrite
 */

/**
 * The plain values and params one call writes: each hit's raw span replaced by the new words — as
 * they are in a plain field (Joomla escapes it where it prints it), JSON-escaped in params — then
 * proved: the value still reads (params still parse as one object) and the new words are in it.
 * `stored`: per place whose change is typography alone, the stored characters and the new ones.
 * @param {readonly Located[]} results
 * @param {Map<string, Store>} storeById
 * @returns {{ ok: true, writes: StoreWrite[], stored: Map<string, { before: string, after: string }> } | ReturnType<typeof refuse>}
 */
function rewriteValues(results, storeById) {
  /** @type {Map<string, { store: Store, edits: { s: number, e: number, text: string }[], expect: string[] }>} */
  const byStore = new Map()
  /** @type {Map<string, { before: string, after: string }>} */
  const stored = new Map()
  for (const r of results) {
    const text = withoutGlyph(r.change.replace, r.glyph).replace(/\s*\n\s*/g, ' ')
    const flat = views(text, { decode: false }).cased
    for (const t of r.targets) {
      if (t.kind !== 'unit') continue
      const u = /** @type {JoomlaUnit} */ (t.unit)
      if (isHtmlUnit(u)) continue
      const s = storeById.get(u.store)
      if (!s) continue
      let slot = byStore.get(s.id)
      if (!slot) byStore.set(s.id, (slot = { store: s, edits: [], expect: [] }))
      for (const h of t.hits) {
        // An accent-blind hit is written only as the whole unit (the core's rule).
        const [a, b] = h.mode === 'bare' ? [0, u.cased.length] : [h.a, h.b]
        const start = u.map[a][0]
        const end = u.map[b - 1][1]
        // A param's words are JSON-escaped once per level of JSON text they sit in (an ACM's twice).
        let written = text
        if (u.unitKind === 'param')
          for (let l = 0; l < (u.paramLayers ?? 1); l += 1) written = jsonText(written)
        if (!slot.edits.some((x) => x.s === start && x.e === end))
          slot.edits.push({ s: start, e: end, text: written })
        if (flat !== '') slot.expect.push(flat)
        // Only the typography differs ("Mon–Fri" stored, "Mon-Fri" sent): the receipt shows the
        // stored characters, or it would read "Mon-Fri → Mon-Fri" for a change that happened.
        if (h.mode !== 'bare' && u.cased.slice(a, b) === flat) {
          const bytes = s.raw.slice(start, end)
          let before = bytes
          if (u.unitKind === 'param')
            try {
              for (let l = 0; l < (u.paramLayers ?? 1); l += 1) before = JSON.parse(`"${before}"`)
            } catch {
              before = bytes
            }
          stored.set(t.at, { before, after: text })
        }
      }
    }
  }
  /** @type {StoreWrite[]} */
  const writes = []
  for (const { store: s, edits, expect } of byStore.values()) {
    /** @type {string} */
    let after
    try {
      after = spliceRaw(s.raw, edits)
    } catch {
      return refuse('VALUE_NOT_ALLOWED', joText('markupError', { what: s.label }), joText('markupNext'), {
        rule: 'would-break-markup'
      })
    }
    /** @type {string} */
    let words = after
    if (s.shape === 'params') {
      /** @type {unknown} */
      let parsed = null
      try {
        parsed = JSON.parse(after)
      } catch {
        parsed = null
      }
      if (!isRecord(parsed))
        return refuse('VALUE_NOT_ALLOWED', joText('markupError', { what: s.label }), joText('markupNext'), {
          rule: 'would-break-markup',
          found: 'params not JSON'
        })
      words = paramWords(parsed, s.keys)
    }
    const text = foldForMatch(words)
    const lost = expect.find((w) => !text.includes(foldForMatch(w)))
    if (lost !== undefined)
      return refuse('VALUE_NOT_ALLOWED', joText('markupError', { what: s.label }), joText('markupNext'), {
        rule: 'would-break-markup',
        found: 'new words not readable',
        words: clip(lost, 0, 0, 60)
      })
    writes.push({ store: s, before: s.raw, after })
  }
  return { ok: true, writes, stored }
}

/**
 * Every record one call writes: the HTML fields through the WordPress engine's rewrite (the same
 * splice, links that follow a number, two-line headings, the proof), the plain values and params
 * here. Nothing is written.
 * @param {readonly Located[]} results
 * @param {Map<string, Store>} storeById
 * @returns {{ ok: true, writes: StoreWrite[], companions: Record<string, unknown>[], notes: string[],
 *   stored: Map<string, { before: string, after: string }> } | Record<string, unknown>}
 */
function rewriteJoomla(results, storeById) {
  const html = /** @type {any} */ (
    rewriteRecords(
      results.map((r) => ({
        ...r,
        targets: r.targets.filter((t) => t.kind === 'unit' && isHtmlUnit(/** @type {JoomlaUnit} */ (t.unit)))
      })),
      /** @type {any} */ (storeById)
    )
  )
  if (html.ok !== true) {
    // Its proof names WordPress; the same refusal is said for Joomla, with what it found.
    if (html.rule !== 'would-break-markup') return html
    const s = [...storeById.values()].find((x) => html.error.includes(x.label))
    return {
      ...html,
      error: joText('markupError', { what: s ? s.label : 'a record' }),
      next: joText('markupNext')
    }
  }
  const values = rewriteValues(results, storeById)
  if (values.ok !== true) return values
  const v = /** @type {{ writes: StoreWrite[], stored: Map<string, { before: string, after: string }> }} */ (
    values
  )
  return {
    ok: true,
    writes: [
      ...html.writes.map((/** @type {any} */ w) => ({ store: w.store, before: w.before, after: w.after })),
      ...v.writes
    ],
    companions: html.companions,
    notes: html.notes,
    stored: new Map([...html.stored, ...v.stored])
  }
}

// ── Locate ───────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ ok: true, plan: ReplacePlan, page: PageFacts | null, set: ReadSet, results: Located[],
 *   storeById: Map<string, Store> }} JoomlaPlan
 */

/** The facts a refusal's `next` is chosen with, on this door. */
const DOOR_FACTS = Object.freeze({ platform: 'joomla', sealed: false })

/**
 * How far a site-wide search reached, said only when it stopped at its cap.
 * @param {Record<string, unknown>} answer
 * @param {ReadSet} set
 */
const withScanned = (answer, set) =>
  set.capped
    ? { ...answer, scanned: set.scanned, notReached: joText('siteCapped', { n: set.scanned }) }
    : answer

/**
 * Read the page and its records and locate every change of the call — nothing written.
 * @param {{ plan: ReplacePlan, read: Door, pageHtml: (path: string) => Promise<any>, confirmed?: boolean }} deps
 * @returns {Promise<JoomlaPlan | Record<string, unknown>>}
 */
export async function locateOnJoomlaOpen(deps) {
  const { plan } = deps
  const read = safe(deps.read)
  /** @type {PageFacts | null} */
  let page = null
  /** @type {any} */
  let got = null
  try {
    got = await deps.pageHtml(plan.path)
  } catch {
    got = null
  }
  if (isRecord(got) && got.ok === true && typeof got.html === 'string')
    page = pageFactsOf(got.html, typeof got.status === 'number' ? got.status : 200)
  // Site scope: every page of the site, or the words are not on this one (or it could not be read).
  const shown = page ? page.units : []
  const site =
    page === null ||
    plan.all === true ||
    (plan.all !== 'page' && plan.changes.some((c) => matchUnits(shown, c.find).hits.length === 0))
  const r = await readStores(read, page, { site, plan })
  if (!r.ok) return /** @type {Record<string, unknown>} */ (withNext(r.answer, DOOR_FACTS))
  const { set } = r
  /** @type {Map<string, string>} */
  const whyNext = new Map()
  const located = locateAll({
    plan,
    page: page ? { units: page.units, lang: page.lang } : null,
    stored: unitsOfStores(set.stores),
    confirmed: deps.confirmed === true,
    mustKeepTwo: false,
    hooks: page ? openHooks(set, whyNext, page.lang) : { pairs: () => [] }
  })
  if (!located.ok) {
    const first =
      located.code === 'NOT_EDITABLE' && Array.isArray(located.unchanged) ? located.unchanged[0] : null
    const next = isRecord(first) && typeof first.why === 'string' ? whyNext.get(first.why) : undefined
    return withScanned(next ? { ...located, next } : located, set)
  }
  return {
    ok: true,
    plan,
    page,
    set,
    results: located.results,
    storeById: new Map(set.stores.map((s) => [s.id, s]))
  }
}

// ── Writing ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The value a `content.get` answer holds for one store.
 * @param {unknown} answer
 * @param {Store} s
 */
function valueIn(answer, s) {
  if (!isRecord(answer) || answer.ok !== true || !isRecord(answer.item)) return null
  const v = answer.item[s.field]
  return typeof v === 'string' ? v : null
}

/**
 * Change the words on an open Joomla site in one call: locate, rewrite, prove, then write each record
 * under one minted apply id and answer with the receipt.
 *
 * `plan` is `planReplace`'s answer (IX2 aliases first). `read` and `write` are the door
 * (`(action, params) → answer`); a list must arrive whole — a read cut to a budget is refused here,
 * never written back. `mintApplyId` makes this call's own id (`replace-…`): the component groups its
 * undo log by it, so the receipt's `apply.revert` undoes this change and nothing else. `confirmed`: a
 * dryRun of the same call was answered earlier in this conversation (`confirmKey`). `verify:false`
 * skips the page read after writing.
 * @param {{ plan: ReplacePlan | RestorePlan | Record<string, unknown>, read: Door, write?: Door,
 *   pageHtml: (path: string) => Promise<any>, mintApplyId?: () => string, confirmed?: boolean,
 *   verify?: boolean }} deps
 * @returns {Promise<Record<string, unknown>>}
 */
export async function replaceOnJoomlaOpen(deps) {
  const plan = /** @type {any} */ (deps.plan)
  if (!isRecord(plan) || plan.ok !== true) return /** @type {Record<string, unknown>} */ (plan)
  if (plan.mode === 'restore')
    return refuse('BAD_PARAMS', joText('restoreError'), joText('restoreNext'), { param: 'restore' })
  const replacePlan = /** @type {ReplacePlan} */ (plan)
  // 🔒 NO FALLBACK TO `read`: a write sent down the read road would skip the site's flight and the
  // lock retry, so a missing `write` is a wiring bug, said at once.
  if (typeof deps.write !== 'function')
    throw new TypeError('replaceOnJoomlaOpen: `write` is required (the relay that orders writes)')
  const read = safe(deps.read)
  const write = safeWrite(deps.write)
  const mint = deps.mintApplyId ?? mintReplaceId
  /** @type {string | null} */
  let applyId = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const located = await locateOnJoomlaOpen({
      plan: replacePlan,
      read,
      pageHtml: deps.pageHtml,
      confirmed: deps.confirmed
    })
    if (located.ok !== true) return /** @type {Record<string, unknown>} */ (located)
    const w0 = /** @type {JoomlaPlan} */ (located)
    const rewrite = rewriteJoomla(w0.results, w0.storeById)
    if (rewrite.ok !== true) return /** @type {Record<string, unknown>} */ (rewrite)
    const { writes: every, companions, notes: rewriteNotes, stored } = /** @type {any} */ (rewrite)
    // 🔒 NEVER A NO-OP WRITE, NEVER A CHANGE CLAIMED THAT DID NOT HAPPEN: a record the change leaves
    // byte for byte as it was is not sent, and its place is not in the receipt.
    /** @type {StoreWrite[]} */
    const writes = every.filter((/** @type {StoreWrite} */ x) => x.after !== x.before)
    if (writes.length === 0)
      return refuse(
        'BAD_PARAMS',
        joText('sameError', { replace: replacePlan.changes[0]?.replace ?? '' }),
        joText('sameNext'),
        { param: 'replace', rule: 'unchanged' }
      )
    const live = new Set(writes.map((x) => x.store.id))
    const w = {
      ...w0,
      results: w0.results.map((r) => ({
        ...r,
        targets: r.targets.filter(
          (t) => t.kind !== 'unit' || live.has(/** @type {JoomlaUnit} */ (t.unit).store)
        )
      }))
    }
    const notes = [
      ...new Set([...w.results.flatMap((r) => r.notes), ...rewriteNotes, ...languageNotes(w, writes)])
    ]
    const would = w.results.flatMap((r) =>
      r.targets.map((t) => typographyWould(wouldOf(t, r.change), stored))
    )
    const reach = notReachedOf(w, writes, replacePlan)
    if (replacePlan.dryRun) {
      const out = dryRunAnswer({
        platform: 'joomla',
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
        if (t.kind === 'unit' && !changes.has(/** @type {JoomlaUnit} */ (t.unit).store))
          changes.set(/** @type {JoomlaUnit} */ (t.unit).store, r.change)
    const run = await writeRecords({
      read,
      write,
      writes,
      applyId,
      would,
      changeOf: (s) =>
        changes.get(s.id) ??
        writes
          .filter((x) => x.store.group === s.group)
          .map((x) => changes.get(x.store.id))
          .find(Boolean) ??
        null
    })
    if (!run.ok) {
      if (run.retry && attempt === 0) continue
      return run.answer
    }
    const out = receipt({
      platform: 'joomla',
      path: replacePlan.path,
      applyId,
      changed: would,
      removal: replacePlan.changes.every((c) => c.replace === ''),
      companions,
      unchanged: w.results.flatMap((r) => r.unchanged).slice(0, 4),
      alsoIn: w.results.flatMap((r) => r.alsoIn).slice(0, 5),
      notes,
      notReached: reach,
      // 🔒 NOT the sealed site's undo: on an open site `apply.revert` undoes the rows this apply id
      // wrote, not "the site's latest apply" (the contract's receipts, `undoOf`'s Joomla note).
      undo: undoOf({ platform: 'joomla-open', applyId })
    })
    if (w.set.capped) out.scanned = w.set.scanned
    if (deps.verify !== false && w.page !== null)
      out.verified = await verifyShown(deps.pageHtml, replacePlan.path, w.results)
    return withNormalized(out, replacePlan)
  }
  return refuse('STORE_CHANGED', joText('changedError', { what: 'a record' }), joText('changedNext'))
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
 * ({@link RECEIPT_MAX_BYTES}): the least useful first out, `next` stays last.
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
 * A place whose change is typography alone, as the receipt shows it: the stored characters → the new
 * ones.
 * @template {{ at?: unknown, before?: unknown, after?: unknown }} T
 * @param {T} would
 * @param {Map<string, { before: string, after: string }>} stored
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
 * @param {{ read: Door, write: Door, writes: StoreWrite[], applyId: string,
 *   would: Record<string, unknown>[], changeOf: (s: Store) => { find: string, replace: string } | null }} input
 * @returns {Promise<{ ok: true } | { ok: false, retry?: boolean, answer: Record<string, unknown> }>}
 */
async function writeRecords({ read, write, writes, applyId, would, changeOf }) {
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
      a[0].store.recordId - b[0].store.recordId
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
    // 🔒 THE LEASE REFUSES THE UNDO TOO: the door's code passes through unchanged, with what stands
    // and the one call that undoes it once the site is free.
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
          next: joText('busyPartialNext', { n: written, applyId })
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
        joText('partialError', { n: written, m: ordered.length, failed: what }),
        joText('partialNext', { applyId }),
        { apply_id: applyId, written, reverted: false, planned: would }
      )
    }
  }
  /**
   * 🔒 A LOST ANSWER IS NEVER UNDONE HERE. The write left Tracy and its answer did not come back:
   * PHP may still be running it, so an `apply.revert` sent now can land BEFORE it, and the record ends
   * changed under an answer that says reverted. Nothing is reverted: the answer says how many records
   * may hold the new words, carries this call's apply id, and names the one read that shows where they
   * stand once PHP is done — this job's own dryRun with the NEW words.
   * @param {Record<string, unknown>} answer
   * @param {Store} s
   */
  const lost = (answer, s) => {
    const change = changeOf(s)
    const fresh = change ? change.replace.replace(/\s*\n\s*/g, ' ').trim() : ''
    const old = change ? change.find : ''
    // A quote cut to fit is a find that fails: only words that fit whole are quoted.
    const fits = (/** @type {string} */ t) => t.length <= QUOTED_WIDTH.new && !t.includes('"')
    const next =
      fresh === ''
        ? joText('outcomeGoneNext', { old: fits(old) ? old : '<the old words>' })
        : joText('outcomeNext', {
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
        error: joText('outcomeError', { what: s.label, n: written, n1: written + 1, m: ordered.length }),
        apply_id: applyId,
        written,
        reverted: false,
        planned: would,
        next
      }
    }
  }
  for (const group of ordered) {
    const s = group[0].store
    // Read again right before the write: the component takes no expected revision.
    const again = await read('content.get', { kind: s.kind, id: s.recordId })
    if (!isRecord(again) || again.ok !== true)
      return undone(
        /** @type {Record<string, unknown>} */ (
          withNext(/** @type {Record<string, unknown>} */ (again), { ...DOOR_FACTS, action: 'content.get' })
        )
      )
    if (group.some((x) => valueIn(again, x.store) !== x.before)) {
      if (written === 0)
        return {
          ok: false,
          retry: true,
          answer: refuse('STORE_CHANGED', joText('changedError', { what: s.label }), joText('changedNext'))
        }
      return undone(
        refuse(
          'STORE_CHANGED',
          joText('changedUndoneError', { what: s.label, n: written }),
          joText('changedNext')
        )
      )
    }
    /** @type {Record<string, unknown>} */
    const fields = {}
    for (const x of group) fields[x.store.field] = x.after
    const got = await write('content.update', { kind: s.kind, id: s.recordId, fields, apply_id: applyId })
    // An answer that is not one (no object came back) is as lost as a thrown one.
    if (!isRecord(got)) return lost({ ok: false, code: 'COWORK_WEB_BAD_RESPONSE' }, s)
    if (outcomeUnknown(got)) return lost(got, s)
    if (got.ok !== true)
      return undone(
        /** @type {Record<string, unknown>} */ (withNext(got, { ...DOOR_FACTS, action: 'content.update' }))
      )
    written += 1
  }
  return { ok: true }
}

/**
 * The receipt's language notes: a record every language shows (language `*`) on a site that serves
 * several.
 * @param {JoomlaPlan} w
 * @param {readonly StoreWrite[]} writes
 */
function languageNotes(w, writes) {
  if (w.set.languages < 2) return []
  const shared = writes.find((x) => x.store.lang === null)
  return shared ? [joText('sharedLanguages', { what: shared.store.label })] : []
}

/**
 * What this call did not reach, said only when true: a site-wide search stopped at its cap; on a site
 * that serves several languages, the other languages' copies (their own records) — for a fact, with
 * the call that reaches them.
 * @param {JoomlaPlan} w
 * @param {readonly StoreWrite[]} writes
 * @param {ReplacePlan} plan
 */
function notReachedOf(w, writes, plan) {
  /** @type {string[]} */
  const out = []
  if (w.set.capped) out.push(joText('siteCapped', { n: w.set.scanned }))
  if (w.set.languages >= 2 && plan.all !== true) {
    if (w.results.some((r) => r.scope === 'every')) out.push(joText('factLanguages'))
    else if (writes.some((x) => x.store.lang !== null)) out.push(joText('pageLanguages'))
  }
  return out.length > 0 ? out.join('; ') : null
}

/**
 * After the writes, the page read again: are the new words shown in each changed place's region?
 * Joomla clears its own cache on a write through the door (`purgeCache`), so a stale page is a proxy's.
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
  if (!isRecord(got) || got.ok !== true || typeof got.html !== 'string') return joText('notChecked')
  const units = renderedUnits(got.html).units
  for (const r of results) {
    const want = foldForMatch(withoutGlyph(r.change.replace, r.glyph).replace(/\s*\n\s*/g, ' '))
    if (want === '') continue
    for (const t of r.targets) {
      if (t.rendered !== true) continue
      if (!units.some((u) => (t.where === null || u.region === t.where) && u.lower.includes(want)))
        return joText('notShownYet', { path })
    }
  }
  return joText('shownOn', { path })
}
