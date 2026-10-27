/**
 * The pages the customer picked in the questionnaire's `pages` question (feed `seed.pages`, the options `SEED_PAGES`), and the
 * template pages "Apply" therefore takes off.
 *
 * 🔒 A PAGE GOES ONLY WHEN ITS OWN ADDRESS SAYS, UNAMBIGUOUSLY, THAT IT IS A KIND THE CUSTOMER DID NOT PICK (product owner,
 * 05/10/2026, ledger L04: a customer who picked Home, Product, About and Contact still got Services and News). Its slug or menu
 * alias is read word by word: every word must name the same kind (`our-services`, `about-us`, `pricing-plans`), so
 * `company-news`, `products-and-services` or a slug in another language name none, and a page that names none is left as it is
 * — never guessed from a title or from the template's name. Words a kind shares with other trades are not read at all (a
 * restaurant's `menu`, an architect's floor `plans`). Home and contact are never taken off, picked or not.
 *
 * Products and services stand in for each other: a customer who picked one on a template that has only a page of the other
 * keeps that page, and is told nothing is missing. Any other kind picked that the template has no page for is said in a note —
 * but only when every page of the site could be read as a kind: a page called `our-story` may well be the about page, and a
 * note that guesses is worse than none. No page is ever made for it.
 *
 * The engines take the pages off the way they take off the template's other pages: WordPress drafts them in its sweep
 * (`wp-residue.js`), Joomla unpublishes their menu entries in its tidy-up (`joomla-tidy.js`), each under its own apply id.
 *
 * 🔒 THE STANDARD SET'S PAGES QUESTION NAMES PAGES, NOT KINDS (feed `site.pages`, plan D6). Its options are the release's own
 * pages (`tracy_site_pages.json`), and the server hands the brief `brief.pages = { all: [{ id, label, home? }], picked: [ids] }`.
 * A page whose id is not picked goes, by that id and nothing else (`unpickedById`): a WordPress page path (its slug for a
 * top-level page), a Joomla menu entry's path in the page menu (its alias at level 1). The home page never goes, picked or not. No `brief.pages`
 * (no pages file, or the question not served) keeps every page.
 */
import { SKIPPED_MENUS } from './joomla-tidy.js'
import { pool } from './shared.js'

/** How many menu entries are read whole at once. */
const READERS = 4

/** The words a page's own address calls each kind of the `pages` question by. */
const WORDS = Object.freeze({
  home: ['home', 'homepage'],
  product: ['product', 'products', 'shop'],
  service: ['service', 'services'],
  blog: ['blog', 'news'],
  about: ['about'],
  pricing: ['pricing', 'prices'],
  contact: ['contact', 'contacts']
})
/** @type {Map<string, string>} word → kind */
const KIND_OF = new Map(Object.entries(WORDS).flatMap(([kind, words]) => words.map((w) => [w, kind])))
/** Words an address carries around its kind that say nothing about it: `about-us`, `our-services`. Numbers too (`services-2`). */
const FILLER = new Set(['our', 'us', 'the', 'my', 'page', 'and'])
/** The kinds a site keeps whatever the customer picked. */
const KEPT = new Set(['home', 'contact'])
/** Kinds one page stands in for when the template has none of the other. */
const SIBLING = Object.freeze({ product: 'service', service: 'product' })
/** How each kind is named in a note. */
const SAID = Object.freeze({
  product: 'product',
  service: 'services',
  blog: 'blog',
  about: 'about',
  pricing: 'pricing',
  contact: 'contact'
})

/**
 * The kind of page an address names (`services` → `service`, `about-us` → `about`), or null when it names none or more than one.
 * @param {unknown} name - a slug or a menu alias
 * @returns {string | null}
 */
export function pageKind(name) {
  const words = String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && !FILLER.has(w) && !/^\d+$/.test(w))
  if (words.length === 0) return null
  const kinds = new Set(words.map((w) => KIND_OF.get(w) ?? null))
  if (kinds.size !== 1) return null
  return [...kinds][0]
}

/**
 * The kinds the customer picked, or null when the brief carries no `pages` answer with a kind in it (an old brief, a
 * questionnaire without the question, an answer left empty): then no page goes for it.
 * @param {unknown} answers - `brief.answers` (`lib/site-brief.js` `briefFromAnswers`)
 * @returns {Set<string> | null}
 */
export function pickedPages(answers) {
  const answer = (Array.isArray(answers) ? answers : []).find(
    (a) => Array.isArray(a?.feeds) && a.feeds.includes('seed.pages') && Array.isArray(a.value)
  )
  const picked = new Set(
    (answer?.value ?? []).filter((v) => typeof v === 'string' && Object.hasOwn(WORDS, v))
  )
  return picked.size > 0 ? picked : null
}

/**
 * Which of a template's pages go because the customer did not pick their kind, and which picked kinds it has no page for.
 * @template T
 * @param {unknown} answers - `brief.answers`
 * @param {T[]} pages - the template's pages a visitor can reach
 * @param {(page: T) => unknown} [nameOf] - the page's own address word (its slug, by default)
 * @returns {{ hide: T[], missing: string[], note: string | null, keeps: (kind: string | null) => boolean }}
 *   `keeps`: whether a page of that kind stays (a page no kind names does)
 */
export function unpickedPages(answers, pages, nameOf = (page) => /** @type {any} */ (page)?.slug) {
  const picked = pickedPages(answers)
  if (picked === null) return { hide: [], missing: [], note: null, keeps: () => true }
  const kinds = pages.map((page) => pageKind(nameOf(page)))
  const present = new Set(kinds.filter((kind) => kind !== null))
  /** Kinds kept because they stand in for a picked kind the template has no page of. */
  const standIns = new Set(
    [...picked]
      .map((kind) => /** @type {Record<string, string>} */ (SIBLING)[kind])
      .filter((sibling) => sibling && present.has(sibling) && !picked.has(sibling))
      .filter((sibling) => !present.has(/** @type {Record<string, string>} */ (SIBLING)[sibling]))
  )
  const keeps = (/** @type {string | null} */ kind) =>
    kind === null || KEPT.has(kind) || picked.has(kind) || standIns.has(kind)
  const hide = pages.filter((_, i) => !keeps(kinds[i]))
  // Every site has a front page, whatever its address is called; a kind a sibling stands in for is not missing.
  const missing = [...picked].filter(
    (kind) =>
      kind !== 'home' &&
      !present.has(kind) &&
      !standIns.has(/** @type {Record<string, string>} */ (SIBLING)[kind])
  )
  // Said only when every page could be read: a page whose address names no kind may be the one picked.
  const note =
    missing.length > 0 && kinds.every((kind) => kind !== null)
      ? `this template has no ${missing.map((kind) => SAID[kind] ?? kind).join(' or ')} page, so none was made`
      : null
  return { hide, missing, note, keeps }
}

/**
 * The ids of the release's pages the customer unticked (`brief.pages`), never the home page's. Nothing when the brief carries
 * no page list or no list of picked ids: then every page stays, as before the question existed.
 * @param {unknown} pages - `brief.pages`: `{ all: [{ id, label, home? }], picked: string[] }` or null
 * @returns {string[]}
 */
export function unpickedById(pages) {
  const all = /** @type {any} */ (pages)?.all
  const picked = /** @type {any} */ (pages)?.picked
  if (!Array.isArray(all) || !Array.isArray(picked)) return []
  const kept = new Set(picked.filter((id) => typeof id === 'string'))
  return all
    .filter((page) => page && typeof page.id === 'string' && page.id !== '' && page.home !== true)
    .map((page) => String(page.id))
    .filter((id) => !kept.has(id))
}

/**
 * The ids of the release's pages the customer kept (`brief.pages`): the ticked ones and the home page, in the release's
 * order, only ids the release lists. Empty when the pages were not asked (no `all`/`picked`), so a template's own rule
 * for a page stands only where the customer was never asked about it.
 * @param {unknown} pages
 * @returns {string[]}
 */
export function keptById(pages) {
  const all = /** @type {any} */ (pages)?.all
  const picked = /** @type {any} */ (pages)?.picked
  if (!Array.isArray(all) || !Array.isArray(picked)) return []
  const kept = new Set(picked.filter((id) => typeof id === 'string'))
  return all
    .filter((page) => page && typeof page.id === 'string' && page.id !== '')
    .filter((page) => page.home === true || kept.has(page.id))
    .map((page) => String(page.id))
}

/** The id of the release's home page in `brief.pages`, or null. */
function homeId(/** @type {unknown} */ pages) {
  const all = /** @type {any} */ (pages)?.all
  const home = Array.isArray(all) ? all.find((page) => page?.home === true) : null
  return typeof home?.id === 'string' ? home.id : null
}

/**
 * The slugs of the site's pages that WordPress ids name. An id is the page's path (`get_page_uri`: the parent slugs joined by
 * `/`), so its last part is the slug the site lists; a page the site lists with its address is matched by the whole path, so
 * a child page and a top-level one that share a slug are told apart wherever the listing says where each lives.
 * ⚠ The sweep hides by slug: when two pages share a slug and only one is named, both go. No release ships that today (the
 * page list generator refuses it, JA Impact WP).
 * @param {string[]} ids
 * @param {Array<{ slug: string, url?: string }>} pages - the source edition's pages, as the site lists them
 * @returns {Set<string>}
 */
export function slugsForIds(ids, pages) {
  const pathOf = (/** @type {string} */ url) => {
    try {
      return new URL(url, 'https://site.invalid').pathname.replace(/^\/+|\/+$/g, '')
    } catch {
      return null
    }
  }
  /** @type {Set<string>} */
  const out = new Set()
  for (const id of ids) {
    const slug = id.split('/').filter(Boolean).at(-1) ?? ''
    const same = pages.filter((page) => page.slug === slug)
    const placed = same.filter((page) => page.url !== undefined && pathOf(page.url) === id)
    if (placed.length > 0 || same.length > 0) out.add(slug)
  }
  return out
}

/**
 * Whether a Joomla menu row is one the page list can name: not the root, in a language a visitor reaches, not the system
 * menu (`tb-system` holds home and search).
 * @param {any} row
 * @param {Set<string>} visible
 */
const inPageMenus = (row, visible) => {
  const language = String(row.language ?? '*')
  return (
    Number(row.id) > 1 &&
    (language === '*' || visible.has(language)) &&
    !/^tb-system$/.test(String(row.menutype ?? ''))
  )
}

/**
 * The entries of the menus the page list can name, and the page menu among them: `mainmenu`, else the menu holding the home
 * page's entry (a JoomlArt template's pages live there; Tracy Business j6 names it `tb-main-en`). A page id is its entry's
 * PATH (`product/features`; a level-1 entry's path is its alias), so a page under a heading is named as surely as one at
 * level 1 (TCH #1013).
 * @param {any[]} rows
 * @param {Set<string>} visible
 * @param {unknown} sitePages - `brief.pages`
 * @param {(row: any) => boolean} counted - which rows count
 */
function pageMenu(rows, visible, sitePages, counted) {
  const entries = rows.filter((row) => counted(row) && String(row.path ?? '') !== '')
  const levelOne = entries.filter((row) => String(row.path) === String(row.alias ?? ''))
  const home = homeId(sitePages)
  const menuType = levelOne.some((row) => row.menutype === 'mainmenu')
    ? 'mainmenu'
    : (levelOne.find((row) => home !== null && row.alias === home)?.menutype ?? null)
  const inPageMenu = entries.filter((row) => menuType === null || row.menutype === menuType)
  return { entries: inPageMenu, menuType }
}

/** Whether an entry only groups others (a heading, a separator, a placeholder link): no page of its own. */
const groupsOnly = (/** @type {any} */ row) =>
  row.type === 'heading' ||
  row.type === 'separator' ||
  (row.type === 'url' && /^(#.*)?$/.test(String(row.link ?? '').trim()))

/**
 * The Joomla menu entries of the pages the customer KEPT (`brief.pages`): each ticked page's entry of the page menu (by its path),
 * and, in `off`, those of them that are unpublished now, to be published again.
 *
 * 🔒 THE PAGES ANSWER DECIDES WHICH PAGES STAY, THE DEMO TRIM DOES NOT (TCH #1013, U9). Tracy Business j6 ships a demo-trim
 * map that unpublishes its Projects (602) and News (603) entries on every site, because every article they list is a demo
 * one; the Pages answer is read after that, so a ticked Projects answered 404 (measured 08/10/2026 on dev, tamq-7q-tbusj).
 * A ticked page's entry is published again, as an empty list the customer fills: its demo articles stay hidden (another
 * company's projects are worse than none), the way an unticked-or-not WordPress posts page shows no demo posts. A ticked
 * page under a heading the trim took off routes through it (`offIn`), so that heading comes back too.
 * No page list, or no list of picked ids, names nothing: the trim stands as before the question existed.
 * @param {any[]} rows - the menu, as `readMenu` read it
 * @param {Set<string>} visible - the language tags a visitor can reach
 * @param {unknown} sitePages - `brief.pages`
 * @returns {{ ids: number[], off: number[] }}
 */
export function tickedMenuItems(rows, visible, sitePages) {
  const kept = keptById(sitePages)
  if (kept.length === 0) return { ids: [], off: [] }
  // Unpublished (0), never trashed (-2) or archived: those were taken off on purpose, not by a trim.
  const counted = (/** @type {any} */ row) =>
    [0, 1].includes(Number(row.published)) && inPageMenus(row, visible)
  const { entries } = pageMenu(rows, visible, sitePages, counted)
  const wanted = new Set(kept)
  const ticked = entries.filter((row) => wanted.has(String(row.path)) && Number(row.home ?? 0) !== 1)
  // A page under a heading routes through it: a heading the trim took off comes back with the ticked page under it.
  const above = entries.filter(
    (row) =>
      Number(row.published) === 0 &&
      ticked.some((t) => t.menutype === row.menutype && String(t.path).startsWith(`${String(row.path)}/`))
  )
  return {
    ids: ticked.map((row) => Number(row.id)),
    off: [
      ...new Set(
        [...ticked, ...above].filter((row) => Number(row.published) === 0).map((row) => Number(row.id))
      )
    ]
  }
}

/**
 * The Joomla menu entries that must stay published for the showcase's pages to keep answering: each entry of `showcase` and
 * every entry above one, at any depth. Joomla routes an entry through its parents, so an unpublished parent leaves its
 * child's address a 404 although the child itself is published. A parent is read by `parent_id`, and by its path in the
 * same menu.
 * @param {any[]} rows - the menu
 * @param {Set<number>} showcase - the entries the showcase-navigation map put away (`navHiddenMenuIds`)
 * @returns {Map<number, string>} each entry that stays → the path of the showcase entry it holds (its own, for one of them)
 */
export function showcaseHolders(rows, showcase) {
  /** @type {Map<number, string>} */
  const out = new Map()
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  for (const id of showcase) {
    const row = byId.get(id)
    const path = String(row?.path ?? id)
    out.set(id, path)
    if (!row) continue
    const seen = new Set([id])
    for (
      let up = byId.get(Number(row.parent_id));
      up && !seen.has(Number(up.id));
      up = byId.get(Number(up.parent_id))
    ) {
      seen.add(Number(up.id))
      if (!out.has(Number(up.id))) out.set(Number(up.id), path)
    }
    for (const r of rows)
      if (
        r.menutype === row.menutype &&
        r.path &&
        path.startsWith(`${String(r.path)}/`) &&
        !out.has(Number(r.id))
      )
        out.set(Number(r.id), path)
  }
  return out
}

/**
 * `ids` without the entries the showcase needs (`showcaseHolders`), and a line naming each parent left for it. 🔒 A PAGE'S
 * ADDRESS WINS (product owner): a parent the customer unticked stays published while it holds a showcase page.
 * @param {number[]} ids
 * @param {any[]} rows - the menu
 * @param {Map<number, string>} holders - `showcaseHolders`
 * @returns {{ ids: number[], note: string | null }}
 */
export function leaveShowcase(ids, rows, holders) {
  const pathOf = (/** @type {number} */ id) => String(rows.find((r) => Number(r.id) === id)?.path ?? id)
  const parents = [...new Set(ids.map(Number))].filter(
    (id) => holders.has(id) && holders.get(id) !== pathOf(id)
  )
  return {
    ids: ids.filter((id) => !holders.has(Number(id))),
    note:
      parents.length > 0
        ? `${parents.length} menu entry(ies) of pages you did not pick hold the template's showcase pages, whose addresses must keep working, so they were left (${parents.map((id) => `${pathOf(id)} → ${holders.get(id)}`).join(', ')})`
        : null
  }
}

/**
 * The Joomla menu entries that take the unpicked pages off: each component entry a visitor can reach whose alias names a kind
 * the customer did not pick, with the entries under it (its section). A section that holds a page the customer picked is left
 * whole and said. An alias or a link entry is not judged here: one that only leads to an entry going goes with it in the
 * tidy-up's own check (`strandedMenuItems`).
 *
 * 🔒 NEVER THE HOME ENTRY, NEVER A MENU NO VISITOR NAVIGATES BY. The menus the judge skips (`SKIPPED_MENUS`: the system menu
 * holds home and search) are skipped here too. `content.list` gives no `home` column (the plugin's summary of a menu entry), so
 * every entry about to go is read whole first (`content.get`): one that says `home: 1`, or cannot be read, stays — and when
 * the first entry of a section stays, its section does.
 * @param {unknown} answers - `brief.answers`
 * @param {any[]} rows - the menu, as `content.list` lists it (`alias`, `path`, `menutype`, `type`, `published`, `language`; no `home`)
 * @param {Set<string>} visible - the language tags a visitor can reach
 * @param {(id: number) => Promise<any>} read - one entry read whole (`content.get`), null or a throw when it cannot be
 * @param {unknown} [sitePages] - `brief.pages`: each unticked page's entry of the page menu goes too, by its path
 *   (`unpickedById`), with the entries under it; the page menu is `mainmenu`, else the menu that holds the home page's entry
 * @param {Set<number>} [showcase] - the entries the contract's showcase-navigation map put away (`navHiddenMenuIds`): they
 *   stay published whatever the answers say, so their pages keep answering; an unticked business entry goes as before
 * @returns {Promise<{ ids: number[], note: string | null }>}
 */
export async function unpickedMenuItems(
  answers,
  rows,
  visible,
  read,
  sitePages = null,
  showcase = new Set()
) {
  const picked = pickedPages(answers)
  const byId = unpickedById(sitePages)
  if (picked === null && byId.length === 0) return { ids: [], note: null }
  const live = (/** @type {any} */ row) => {
    const language = String(row.language ?? '*')
    return (
      Number(row.published) === 1 &&
      Number(row.id) > 1 &&
      (language === '*' || visible.has(language)) &&
      !SKIPPED_MENUS.test(String(row.menutype ?? ''))
    )
  }
  const pages = rows.filter(
    (row) =>
      live(row) &&
      row.type === 'component' &&
      Number(row.home ?? 0) !== 1 &&
      !/[?&]view=featured\b/.test(String(row.link ?? ''))
  )
  const { hide, note, keeps } = unpickedPages(answers, pages, (row) => row.alias)
  const underOf = (/** @type {any} */ row, shown = live) => {
    const path = String(row.path ?? '')
    return path
      ? rows.filter(
          (r) => shown(r) && r.menutype === row.menutype && String(r.path ?? '').startsWith(`${path}/`)
        )
      : []
  }
  /** @type {Array<{ row: any, under: any[] }>} */
  const sections = []
  let held = 0
  for (const row of hide) {
    const under = underOf(row)
    if (under.some((r) => r.type === 'component' && pageKind(r.alias) !== null && keeps(pageKind(r.alias)))) {
      held += 1
      continue
    }
    sections.push({ row, under })
  }
  // The unticked pages of the release's own list, by the path of their entry in the page menu. The system menu
  // (`tb-system`) is never one; `mainmenu` is, whatever the judge skips, because a JoomlArt template's pages live there.
  if (byId.length > 0) {
    const reached = (/** @type {any} */ row) => Number(row.published) === 1 && inPageMenus(row, visible)
    const { entries } = pageMenu(rows, visible, sitePages, reached)
    const wanted = new Set(byId)
    for (const row of entries) {
      if (!wanted.has(String(row.path))) continue
      if (sections.some((s) => s.row.id === row.id)) continue
      sections.push({ row, under: underOf(row, reached) })
    }
    // A heading every entry under it leaves goes too: an empty dropdown is a dead end (JA Kinetic's Product, all unticked).
    // One that still holds an entry (a page the list does not name, the home entry) stays.
    const going = () =>
      new Set(
        sections
          .flatMap(({ row, under }) => [row, ...under])
          .map((r) => Number(r.id))
          .filter((id) => !showcase.has(id))
      )
    for (let more = true; more; ) {
      more = false
      const gone = going()
      for (const row of entries) {
        if (!groupsOnly(row) || gone.has(Number(row.id))) continue
        const under = underOf(row, reached)
        if (under.length === 0 || !under.every((r) => gone.has(Number(r.id)))) continue
        sections.push({ row, under })
        more = true
      }
    }
  }
  // Each entry about to go, read whole: the listing cannot say which one is the site's home.
  const candidates = [
    ...new Set(sections.flatMap(({ row, under }) => [row, ...under]).map((r) => Number(r.id)))
  ]
  const reads = await pool(
    candidates.map((id) => async () => read(id)),
    READERS
  )
  /** @type {Set<number>} */
  const safe = new Set()
  candidates.forEach((id, i) => {
    const answer = reads[i]
    if (answer.ok && answer.value && Number(answer.value.home ?? 0) !== 1) safe.add(id)
  })
  /** @type {Set<number>} */
  const ids = new Set()
  let unsure = 0
  for (const { row, under } of sections) {
    if (!safe.has(Number(row.id))) {
      unsure += 1
      continue
    }
    for (const r of [row, ...under]) if (safe.has(Number(r.id))) ids.add(Number(r.id))
  }
  // 🔒 THE SHOWCASE IS NEVER UNPUBLISHED (product owner): its entries are already off the menus, and they and every entry
  // above them stay published so their pages keep answering (`showcaseHolders`).
  const kept = leaveShowcase([...ids], rows, showcaseHolders(rows, showcase))
  const said = [
    ...(held > 0
      ? [`${held} menu entry(ies) of pages you did not pick hold pages you picked, so they were left`]
      : []),
    ...(unsure > 0
      ? [
          `${unsure} menu entry(ies) of pages you did not pick could not be read or are the home page, so they were left`
        ]
      : []),
    ...(kept.note ? [kept.note] : []),
    ...(note ? [note] : [])
  ]
  return { ids: kept.ids, note: said.length > 0 ? said.join('; ') : null }
}
