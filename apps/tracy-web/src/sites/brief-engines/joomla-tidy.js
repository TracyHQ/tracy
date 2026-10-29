/**
 * What is left of the template's own company on a Joomla site once the contract has written the words, taken off through the
 * open surface (`content.list` / `content.update`) as the person who pressed Apply, under one apply id.
 *
 * 🔒 THE CONTRACT WRITES THE SLOTS, AND THE MENU AND THE FORM ARE NOT SLOTS. Measured 03/10/2026 on a bakery's `tracy-business/j6`
 * (every line the model could honestly write was written): the top bar still offered "Careers" and "Investors" on every page,
 * "Investor relations" opened a page headed with a stock-exchange ticker, a "Resources" menu led to the template's marketing kit
 * (an email layout, a form library, a slide kit, a style guide, an error-page demo), and the contact form mailed a Russian
 * contractor's sales address (`sales@northgate-ind.ru`), not the one the owner had typed.
 *
 * - 🔒 A PAGE GOES ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013). The model used to be asked
 *   which entries only a company like the template's could use, and the entries it named were unpublished; it named pages
 *   customers had kept. It is now asked about labels only (`judgeMenus`): an entry that names the template company's own
 *   services gets a label for what this business offers. The pages the customer unticked are unpublished by their entries
 *   (`unpickedMenuItems`, `picked-pages.js`); an unpublished entry takes its page out of reach and out of every menu, and
 *   `apply.revert` brings it back. The template's showcase (the marketing kit) keeps its content and its URLs;
 *   provisioning put its navigation away (`menu_show` 0, the contract's `showcase-nav-map.json`), and nothing here shows it again.
 * - An entry that only leads to a page that is off (an alias, a link item) is unpublished with it (`strandedMenuItems`).
 * - A link entry into a path of the site that no entry answers is unpublished (`deadLinkMenuItems`), and so is every page
 *   under an entry that is off (`orphanedMenuItems`).
 * - A page title and description the release ships in a menu entry give way to the owner's name and words (`pageMetaSteps`).
 * - The contact record mails the address the owner gave, else nobody (the form is off, and said), and shows the phone they
 *   gave, else none of the template's (`contactSteps`).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FACT_RULES, factsOf, ungrounded } from './guard.js'
import { jsonObjectIn, pool } from './shared.js'
import { renameDemoCompany, statesFact } from './joomla-demo-names.js'

/** A listing page; the door's own ceiling. */
const PAGE = 100
/** Titles every business site has: the judge is not asked about them, whatever the template calls their pages. */
const ORDINARY = new Set([
  'home',
  'about',
  'about us',
  'services',
  'products',
  'projects',
  'news',
  'contact',
  'contact us',
  'privacy',
  'terms',
  'sitemap',
  'search'
])
/** Menus no visitor navigates by: the system menu holds the home and search entries. */
export const SKIPPED_MENUS = /^tb-system$|^mainmenu$/

const JUDGE_SYSTEM =
  'You are tidying a website that a small business has just made from a template. The template was written for another ' +
  'company, so some of its menu entries name that company\u2019s own services or products. You are given a description of ' +
  'the business and the entries of the site\u2019s menus: each title and the menu it sits in.\n' +
  '"relabel": an entry that names the template company\u2019s own services or products (a list of services in a footer) ' +
  'gets a short label of one to three words for what THIS business offers, taken from the description, in the same ' +
  'language as the entry.\n' +
  'An entry whose title already says what this business sells is its own: leave it out. Leave every ordinary entry of a ' +
  'business site (home, about, services, products, projects, news, contact, privacy, terms, sitemap) and every entry you ' +
  'are unsure of out.\n' +
  'Answer with JSON only: {"relabel": {"<title>": "<new title>", ...}}, using only the titles you were given.' +
  FACT_RULES

/** The longest label that stays a label. */
const MAX_LABEL = 40
/** How many menu entries are read whole at once. */
const READERS = 4

/** A listing page that carries whole rows (`include_body`); the door's own ceiling for one. */
const WHOLE_PAGE = 25

/**
 * Every row of one kind, a page at a time.
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} call
 * @param {string} kind
 * @param {boolean} [whole] - whole rows (`params` included), 25 a page, instead of their summary
 * @returns {Promise<any[]>}
 */
async function listAll(call, kind, whole = false) {
  const size = whole ? WHOLE_PAGE : PAGE
  /** @type {any[]} */
  const rows = []
  for (let offset = 0; offset < 5000; offset += size) {
    const answer = await call('content.list', {
      kind,
      limit: size,
      offset,
      ...(whole ? { include_body: true } : {})
    })
    const items = Array.isArray(answer?.items) ? answer.items : []
    rows.push(...items)
    if (items.length < size) break
  }
  return rows
}

/**
 * The site's menu, every entry's whole row (`params` included), 25 a call. The judge's titles, where an alias leads and the
 * page titles are all read from this one pass, never an entry again. Throws the site's own words.
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} apply
 * @param {string} siteKey
 * @returns {Promise<any[]>}
 */
export const readMenu = (apply, siteKey) => listAll(checkedCall(apply, siteKey), 'menuItem', true)
/** Every module with its body (`content`), for writes that rewrite a module's HTML. */
export const readModules = (apply, siteKey) => listAll(checkedCall(apply, siteKey), 'module', true)

/** The menu a row sits in, without its language suffix (`tb-kit-en` → `tb-kit`). */
const menuOf = (/** @type {string} */ menutype) => menutype.replace(/-[a-z]{2}(?:-[a-z]{2})?$/i, '')

/**
 * The menu entries a visitor can reach, grouped by title (the same entry sits in the top bar and in the footer).
 * @param {any[]} rows
 * @param {Set<string>} visible - the language tags a visitor can reach
 * @returns {Array<{ title: string, menu: string, ids: number[] }>}
 */
export function menuTitles(rows, visible) {
  /** @type {Map<string, { title: string, menu: string, ids: number[] }>} */
  const byTitle = new Map()
  for (const row of rows) {
    const title = String(row.title ?? '').trim()
    const language = String(row.language ?? '*')
    if (title === '' || Number(row.published) !== 1 || Number(row.id) <= 1) continue
    if (language !== '*' && !visible.has(language)) continue
    if (SKIPPED_MENUS.test(String(row.menutype ?? ''))) continue
    if (ORDINARY.has(title.toLowerCase())) continue
    const entry = byTitle.get(title) ?? { title, menu: menuOf(String(row.menutype ?? '')), ids: [] }
    entry.ids.push(Number(row.id))
    byTitle.set(title, entry)
  }
  return [...byTitle.values()]
}

/**
 * What the model would do to the menus: titles to relabel for what this business offers. It is never asked which entries to
 * take off, and a "hide" in its answer is ignored (TCH #1013, 08/10/2026).
 * @param {{ chat: Function }} model
 * @param {{ name: string, about: string, sector: string | null }} business
 * @param {Array<{ title: string, menu: string }>} titles
 * @param {AbortSignal} [signal]
 * @param {string} [given] - what the owner wrote, for the fact check of a new label
 * @returns {Promise<{ relabel: Map<string, string> }>} only ever titles of `titles`
 */
export async function judgeMenus(model, business, titles, signal, given = '') {
  const none = { relabel: new Map() }
  if (titles.length === 0) return none
  const known = new Set(titles.map((t) => t.title))
  const facts = factsOf(given, business.about)
  /** @type {string | null} what the last round got wrong, said to the next one */
  let said = null
  for (let round = 1; round <= 3; round += 1) {
    const answer = await model.chat({
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            business,
            entries: titles.map((t) => ({ title: t.title, menu: t.menu })),
            ...(said ? { note: said } : {})
          })
        }
      ],
      maxTokens: 800,
      temperature: 0,
      signal
    })
    const found = jsonObjectIn(answer)
    if (!found || !('relabel' in found)) {
      said = 'Your last answer was not the JSON object asked for.'
      continue
    }
    /** @type {Map<string, string>} */
    const relabel = new Map()
    if (found.relabel && typeof found.relabel === 'object' && !Array.isArray(found.relabel))
      for (const [from, to] of Object.entries(found.relabel)) {
        const next =
          typeof to === 'string'
            ? to
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            : ''
        if (!known.has(from) || next === '' || next === from || next.length > MAX_LABEL) continue
        if (ungrounded(next, from, facts)) continue
        relabel.set(from, next)
      }
    return { relabel }
  }
  throw new Error('the model did not say which menu entries to relabel')
}

/**
 * Read the menu and ask the model which of its entries to relabel; never rejects (a site is never held up by its tidying).
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ chat: Function } | null} input.model
 * @param {{ name: string, about: string, sector: string | null }} input.business
 * @param {Set<string>} input.visible
 * @param {string} [input.given] - what the owner wrote
 * @param {AbortSignal} [input.signal]
 * @param {any[]} [input.rows] - the menu as `readMenu` read it; read here when not given
 * @returns {Promise<{ relabels: Array<{ kind: string, id: number, fields: Record<string, string> }>, rows?: any[], note: string | null }>}
 *   `rows`: the menu as it was read, for the next step to read no second time
 */
export async function judgeMenuItems({
  apply,
  siteKey,
  model,
  business,
  visible,
  given = '',
  signal,
  rows: read
}) {
  /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */
  const noRelabels = []
  if (!model) return { relabels: noRelabels, note: null }
  try {
    const rows = Array.isArray(read) ? read : await listAll(checkedCall(apply, siteKey), 'menuItem')
    const titles = menuTitles(rows, visible)
    const { relabel } = await judgeMenus(model, business, titles, signal, given)
    return {
      rows,
      relabels: titles
        .filter((t) => relabel.has(t.title))
        .flatMap((t) =>
          t.ids.map((id) => ({ kind: 'menuItem', id, fields: { title: String(relabel.get(t.title)) } }))
        ),
      note: null
    }
  } catch (error) {
    return {
      relabels: noRelabels,
      note: `the template's own menu entries could not be judged: ${error instanceof Error ? error.message : error}`
    }
  }
}

/**
 * The door as a function of an action and its parameters, a refusal thrown as the site's own words.
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} apply
 * @param {string} siteKey
 */
const checkedCall =
  (apply, siteKey) => async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    const answer = await apply({ siteKey, action, params })
    if (answer?.ok === false)
      throw new Error(String(answer.message ?? answer.error ?? `${action} was refused`))
    return answer
  }

/**
 * The menu id a link names when that is ALL it names (`index.php?Itemid=613`), or null. A link that also names a component,
 * an article or a query (`index.php?option=com_content&view=article&id=566&Itemid=613`) may still render without the entry,
 * so the entry alone does not decide it.
 */
const itemIdIn = (/** @type {unknown} */ link) => {
  const found = /^index\.php\?Itemid=(\d+)$/.exec(String(link ?? ''))
  return found ? Number(found[1]) : null
}

/**
 * Whether a menu entry answers nothing once the tidy-up is done: it is unpublished, about to go (`going`, read as it is now),
 * or sits under an entry that is. Joomla routes a path from the top of the menu down through published entries only
 * (`SiteRouter::parseSefRoute`), so a published page under an unpublished heading is a 404. A home entry is served at the
 * language's root (`/en/`) whatever sits above it. An entry the menu does not list is not judged.
 * @param {Map<number, any>} byId
 * @param {Set<number>} going
 */
const offIn = (byId, going) => (/** @type {number} */ id) => {
  // A menu is a few levels deep: the bound only keeps a broken tree from looping.
  for (
    let row = byId.get(id), depth = 0;
    row && depth < 50;
    row = byId.get(Number(row.parent_id)), depth += 1
  ) {
    if (going.has(Number(row.id)) || Number(row.published) !== 1) return true
    if (Number(row.home) === 1) return false
  }
  return false
}

/**
 * The menu entries a visitor can still click that lead only to a page that is off: an alias (`type: 'alias'`, its target in
 * `params.aliasoptions`) or a link item (`type: 'url'`, `index.php?Itemid=N`) whose destination the demo trim unpublished, or
 * the tidy-up is about to (`hiding`: the pages the customer unticked), or sits under such an entry, or that leads to such an
 * entry in turn. Never rejects.
 *
 * 🔒 AN ENTRY THAT ONLY LEADS TO A PAGE THAT IS OFF GOES WITH IT. Measured 05/10/2026 on a Tracy Business j6 site made with
 * Apply (en-GB + vi-VN): the trim unpublished Projects (602) and News (603), but the footer's "Company" column is ALIASES of
 * them (625, 626), which nothing named. The planner retitled 625 "Our bakes", so the judge's titles could not tie it to
 * Projects either, and every page, the home and the About page included, offered "Our bakes" and "News" leading to
 * `/en/?Itemid=602` and `?Itemid=603`: 404. The derived Vietnamese edition copied both (2257, 2258). An alias has no page
 * of its own to send anywhere else and its label names the page that is gone, so it is unpublished like its target, in the
 * tidy-up's own transaction: before any edition is derived from the source (a copy keeps its source's state), and undone
 * by the same `apply.revert`. Nothing is deleted.
 *
 * An entry with a live entry under it is a branch of the menu, not only a link: unpublishing it would take the live entry out
 * of the menu too, so it is left and said. An entry under one that is off is not live (`offIn`), and holds nothing back.
 *
 * Where an alias leads is in its `params`, which the whole rows of `readMenu` carry; a summary row (no `params`) is read
 * whole (`content.get`), a few at once.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any[] | null | undefined} input.rows - the menu as the judge read it; read here when it was not
 * @param {number[]} input.hiding - the entries the tidy-up is about to unpublish
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @returns {Promise<{ ids: number[], note: string | null }>} entries to unpublish beyond `hiding`
 */
export async function strandedMenuItems({ apply, siteKey, rows, hiding, visible }) {
  try {
    const call = checkedCall(apply, siteKey)
    const menu = Array.isArray(rows) ? rows : await listAll(call, 'menuItem')
    const going = new Set(hiding)
    const known = new Map(menu.map((row) => [Number(row.id), row]))
    // A link that names no entry the site lists is not judged: nothing here knows where it goes.
    const off = offIn(known, going)
    const reachable = menu.filter((row) => {
      const language = String(row.language ?? '*')
      return (
        Number(row.published) === 1 &&
        Number(row.id) > 1 &&
        !going.has(Number(row.id)) &&
        (language === '*' || visible.has(language)) &&
        (row.type === 'alias' || row.type === 'url')
      )
    })
    const read = await pool(
      reachable.map((row) => async () => {
        if (row.type === 'url') return itemIdIn(row.link)
        // A whole row (`readMenu`) carries where the alias leads; a summary does not, and the entry is read for it.
        const held =
          row.params !== undefined
            ? row.params
            : (await call('content.get', { kind: 'menuItem', id: Number(row.id) }))?.item?.params
        const params = paramsOf(held)
        if (!params) throw new Error('its parameters cannot be read')
        const to = Number(params.aliasoptions)
        return Number.isInteger(to) && to > 0 ? to : null
      }),
      READERS
    )
    const unread = read.filter((r) => !r.ok).length
    const targets = reachable.map((row, i) => {
      const answer = read[i]
      return /** @type {const} */ ([Number(row.id), answer.ok ? answer.value : null])
    })
    /** @type {Map<number, any[]>} */
    const childrenOf = new Map()
    for (const row of menu) {
      const parent = Number(row.parent_id)
      if (Number.isInteger(parent) && parent > 1)
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), row])
    }
    // A child under an entry that is off is a 404 whatever this alias does: it holds nothing that stays.
    const holdsLive = (/** @type {number} */ id) =>
      (childrenOf.get(id) ?? []).some((child) => !off(Number(child.id)))
    /** @type {number[]} */
    const ids = []
    /** @type {Set<number>} */
    const held = new Set()
    // An alias of an alias that goes, goes too: round after round until a round takes nothing more. A branch whose last
    // live entry went in an earlier round goes in the next one.
    for (let more = true; more; ) {
      more = false
      for (const [id, to] of targets) {
        if (to === null || going.has(id) || !off(to)) continue
        if (holdsLive(id)) {
          held.add(id)
          continue
        }
        held.delete(id)
        going.add(id)
        ids.push(id)
        more = true
      }
    }
    const said = [
      ...(unread > 0
        ? [`${unread} menu entry(ies) could not be read, so where they lead was not checked`]
        : []),
      ...(held.size > 0
        ? [
            `${held.size} menu entry(ies) lead to pages taken off but hold entries that stay, so they were left`
          ]
        : [])
    ]
    return { ids, note: said.length > 0 ? said.join('; ') : null }
  } catch (error) {
    return {
      ids: [],
      note: `the menu entries that lead to pages taken off could not be checked: ${error instanceof Error ? error.message : error}`
    }
  }
}

/** The entries a visitor can reach: published, in a language they can reach, in a menu they navigate by. */
const reachableIn = (/** @type {Set<string>} */ visible) => (/** @type {any} */ row) => {
  const language = String(row.language ?? '*')
  return (
    Number(row.published) === 1 &&
    Number(row.id) > 1 &&
    (language === '*' || visible.has(language)) &&
    !SKIPPED_MENUS.test(String(row.menutype ?? ''))
  )
}

/**
 * The segments of a link that names a page of this site by its address (`/en/about` → `['en', 'about']`), or null for any
 * other: another host (`https://…`, `//…`) or scheme (`mailto:`), an anchor, Joomla's own routes (`index.php?…`,
 * `/component/…`) and a file (`/images/menu.pdf`). A link written with the site's own origin is left too: the origin is not
 * known here.
 * @param {unknown} link
 * @returns {string[] | null}
 */
function sitePath(link) {
  const text = String(link ?? '').trim()
  if (!text.startsWith('/') || text.startsWith('//')) return null
  try {
    const segments = text
      .split(/[?#]/)[0]
      .split('/')
      .filter((s) => s !== '')
      .map((s) => decodeURIComponent(s).toLowerCase())
    if (segments.length === 0 || segments.includes('index.php') || segments.includes('component')) return null
    return /\.[a-z0-9]+$/i.test(segments[segments.length - 1]) ? null : segments
  } catch {
    return null
  }
}

/** A com_redirect address as the path it answers (`http://host/en/old?x` → `en/old`): the redirect plugin matches either form. */
const redirectPath = (/** @type {unknown} */ url) => {
  try {
    return String(url ?? '')
      .trim()
      .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
      .split(/[?#]/)[0]
      .split('/')
      .filter((s) => s !== '')
      .map((s) => decodeURIComponent(s).toLowerCase())
      .join('/')
  } catch {
    return ''
  }
}

/** Whether an entry's component routes nothing below it: a com_content front page or article. */
const routesNothingBelow = (/** @type {any} */ row) => {
  if (row.type !== 'component') return false
  const query = new URLSearchParams(String(row.link ?? '').split('?')[1] ?? '')
  return query.get('option') === 'com_content' && ['featured', 'article'].includes(String(query.get('view')))
}

/**
 * The link entries (`type: 'url'`) a visitor can click that lead to a path of this site no entry answers once the tidy-up
 * is done. Never rejects.
 *
 * 🔒 A LINK ENTRY INTO A PATH NOTHING ANSWERS GOES. Measured 05/10/2026 on a two-language Tracy Business j6 site made with
 * Apply (ledger L30): the template's demo of its own error page is a link entry to `/en/this-page-does-not-exist`, which the
 * planner retitled "About", so the main menu offered an "About" that opened a 404, in /en and in the /vi copy. Whether a
 * path answers is read the way Joomla routes it (`SiteRouter::parseSefRoute`): after the prefix of a language a visitor can
 * reach, segment by segment by alias from the top of the menu, through published entries that stay, in that language or in
 * every one; what is left over goes to the component of the entry reached, else of the language's home entry. A link goes
 * only when that must fail: segments left over for a com_content front page or article, which route nothing below them.
 *
 * Whatever this cannot tell is left: a path with no prefix of a language the site serves (the site may route without one), a
 * path a published redirect of the site answers (com_redirect turns that 404 into a redirect), a site whose languages or
 * redirects cannot be read (said), a path left to any other component, a link to another host or to a file.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any[]} input.rows - the menu's whole rows (`readMenu`)
 * @param {number[]} input.going - the entries the tidy-up is about to unpublish
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @returns {Promise<{ ids: number[], note: string | null }>} entries to unpublish beyond `going`
 */
export async function deadLinkMenuItems({ apply, siteKey, rows, going, visible }) {
  const away = new Set(going)
  const reachable = reachableIn(visible)
  /** @type {Array<{ id: number, path: string[] }>} */
  const links = []
  for (const row of rows) {
    const path = row.type === 'url' && !away.has(Number(row.id)) && reachable(row) ? sitePath(row.link) : null
    if (path) links.push({ id: Number(row.id), path })
  }
  if (links.length === 0) return { ids: [], note: null }
  try {
    const call = checkedCall(apply, siteKey)
    const [languages, redirects] = await Promise.all([listAll(call, 'language'), listAll(call, 'redirect')])
    /** @type {Map<string, string>} the prefix each language a visitor can reach is routed on → its tag */
    const prefixes = new Map(
      languages
        .filter((l) => Number(l.published) === 1 && visible.has(String(l.lang_code)))
        .map((l) => [String(l.sef ?? '').toLowerCase(), String(l.lang_code)])
    )
    const redirected = new Set(
      redirects.filter((r) => Number(r.published) === 1).map((r) => redirectPath(r.old_url))
    )
    const live = rows.filter(
      (row) => Number(row.published) === 1 && Number(row.id) > 1 && !away.has(Number(row.id))
    )
    const speaks = (/** @type {any} */ row, /** @type {string} */ tag) =>
      [tag, '*'].includes(String(row.language ?? '*'))
    /** Whether Joomla can answer `segments` in `tag`: anything this cannot tell answers. */
    const answers = (/** @type {string[]} */ segments, /** @type {string} */ tag) => {
      /** @type {any} */
      let reached = null
      let at = 0
      for (; at < segments.length; at += 1) {
        const parent = reached ? Number(reached.id) : 1
        const next = live.find(
          (row) =>
            Number(row.parent_id) === parent &&
            speaks(row, tag) &&
            String(row.alias ?? '').toLowerCase() === segments[at]
        )
        if (!next) break
        reached = next
      }
      if (at === segments.length) return true
      const parser =
        reached ??
        live.find((row) => Number(row.home) === 1 && row.language === tag) ??
        live.find((row) => Number(row.home) === 1 && String(row.language ?? '*') === '*')
      return !(parser && routesNothingBelow(parser))
    }
    const ids = links
      .filter(({ path }) => {
        // `/en/` alone is the language's home, which always answers.
        const tag = prefixes.get(path[0])
        return (
          tag !== undefined &&
          path.length > 1 &&
          !redirected.has(path.join('/')) &&
          !answers(path.slice(1), tag)
        )
      })
      .map((link) => link.id)
    return { ids, note: null }
  } catch (error) {
    return {
      ids: [],
      note: `${links.length} menu link(s) into this site could not be checked: ${error instanceof Error ? error.message : error}`
    }
  }
}

/**
 * The pages a visitor can reach that sit under an entry the tidy-up takes off (`going`), or under one that is off already
 * (the demo trim unpublishes before Apply): they go with it. Never rejects.
 *
 * 🔒 WHAT SITS UNDER AN ENTRY TAKEN OFF GOES WITH IT. Measured 05/10/2026 on a two-language Tracy Business j6 site made with
 * Apply (ledger L30): the judge took the marketing kit's heading off (606), but the pages under it (613, 615) stayed
 * published and the mega menu still offered them, in /en and in the /vi copy: `/en/marketing-kit/slide` and
 * `/en/marketing-kit/styleguide`, both 404, since Joomla routes a path through published entries only (`offIn`). The planner
 * had retitled them in the customer's words ("Slide" became "Home"), so the judge could not tell them for the kit's own, and
 * whether they went depended on the model. They go by the menu's own tree (`parent_id`), in the tidy-up's transaction, never
 * by a title.
 *
 * Only an entry whose own address is its path goes so. An alias links to its target's address and a link entry to its own
 * (`index.php?Itemid=…`, `/en/…`), not through the entry above them: whether they lead anywhere is `strandedMenuItems`'s and
 * `deadLinkMenuItems`'s to say.
 *
 * Never the home entry (a row that does not say is read whole; one that cannot be read stays, said), never a menu no
 * visitor navigates by (`SKIPPED_MENUS`).
 * @param {object} input
 * @param {any[]} input.rows - the menu's whole rows (`readMenu`)
 * @param {number[]} input.going - the entries the tidy-up is about to unpublish
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @param {(id: number) => Promise<any>} input.read - one entry read whole (`content.get`), null or a throw when it cannot be
 * @returns {Promise<{ ids: number[], note: string | null }>} entries to unpublish beyond `going`
 */
export async function orphanedMenuItems({ rows, going, visible, read }) {
  try {
    const away = new Set(going)
    const off = offIn(new Map(rows.map((row) => [Number(row.id), row])), away)
    const reachable = reachableIn(visible)
    const under = rows.filter(
      (row) =>
        row.type !== 'alias' &&
        row.type !== 'url' &&
        !away.has(Number(row.id)) &&
        reachable(row) &&
        off(Number(row.parent_id))
    )
    const whole = await pool(
      under.map((row) => async () => ('home' in row ? row : read(Number(row.id)))),
      READERS
    )
    /** @type {number[]} */
    const ids = []
    let unread = 0
    under.forEach((row, i) => {
      const answer = whole[i]
      if (!answer.ok || !answer.value) unread += 1
      else if (Number(answer.value.home ?? 0) !== 1) ids.push(Number(row.id))
    })
    return {
      ids,
      note:
        unread > 0
          ? `${unread} menu entry(ies) under entries taken off could not be read, so they were left`
          : null
    }
  } catch (error) {
    return {
      ids: [],
      note: `the menu entries under entries taken off could not be checked: ${error instanceof Error ? error.message : error}`
    }
  }
}

/** The writes that take the menu entries `ids` off the site. @param {number[]} ids */
export const menuSteps = (ids) => ids.map((id) => ({ kind: 'menuItem', id, fields: { published: 0 } }))

/** Words that do not tell one page from another when a footer entry is matched to a page. */
const MATCH_STOPWORDS = new Set(['us', 'our', 'the', 'a', 'an', 'page', 'pages', 'my'])

/** One word without its plural: `classes` and `class` are the same word, `plans` and `plan` too. @param {string} word */
const singular = (word) => {
  if (/(?:ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2)
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1)
  return word
}

/** A label as a sorted set of words (lowercase, letters and digits, no stopwords, singular), joined; '' when nothing is left. @param {unknown} text */
const wordsKey = (text) =>
  [
    ...new Set(
      String(text ?? '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w !== '' && !MATCH_STOPWORDS.has(w))
        .map(singular)
    )
  ]
    .sort()
    .join(' ')

/**
 * The menu entries a visitor can click that lead nowhere: a link item (`type: 'url'`) whose link is empty or a bare `#`, in a
 * menu the visitor navigates by (not `SKIPPED_MENUS`). Never rejects.
 *
 * 🔒 A `#` ENTRY GOES TO THE PAGE OF ITS NAME, OR GOES. Measured on accept-boxing-104.tracy.site (JA Boxing): the two footer
 * menus are nine link items whose link is `#` ("Pound it", "Boxing Circuit"; "About", "Class", "Schedule", "Price"), each a
 * click to nowhere. One whose alias or title names a page the site has (same words after lowercasing, dropping us/our/the/a/an/
 * page/pages/my and the plural: "Class" is "Classes") is relinked to it (`index.php?Itemid=<id>`, which Joomla routes to the
 * page's own address); one that names nothing is unpublished. A menu left with no entries renders nothing.
 *
 * Targets: published entries that are not going and not under an entry that is off, of type component or alias, in the entry's
 * language or `*`, in any menu. Several match: the main menu first, then a page over an alias, then the shallowest, then the
 * lowest id. An entry that holds a live child is a dropdown heading and stays.
 * @param {object} input
 * @param {any[]} input.rows - the menu's rows (`readMenu`)
 * @param {number[]} input.going - the entries the tidy-up is about to unpublish
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @returns {{ relink: Array<{ id: number, link: string }>, hide: number[] }}
 */
export function anchorOnlyMenuItems({ rows, going, visible }) {
  /** @type {Array<{ id: number, link: string }>} */
  const relink = []
  /** @type {number[]} */
  const hide = []
  try {
    if (!Array.isArray(rows)) return { relink, hide }
    const away = new Set(going)
    const reachable = reachableIn(visible)
    const off = offIn(new Map(rows.map((row) => [Number(row.id), row])), away)
    const parents = new Set(
      rows
        .filter((row) => Number(row.published) === 1 && !away.has(Number(row.id)))
        .map((row) => Number(row.parent_id))
    )
    const targets = rows.filter(
      (row) =>
        Number(row.published) === 1 &&
        Number(row.id) > 1 &&
        (row.type === 'component' || row.type === 'alias') &&
        !away.has(Number(row.id)) &&
        !off(Number(row.id))
    )
    const rank = (/** @type {any} */ row) => [
      row.menutype === 'mainmenu' ? 0 : 1,
      row.type === 'component' ? 0 : 1,
      Number(row.level ?? 1),
      Number(row.id)
    ]
    const before = (/** @type {any} */ a, /** @type {any} */ b) => {
      const [x, y] = [rank(a), rank(b)]
      for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] - y[i]
      return 0
    }
    for (const row of rows) {
      if (row.type !== 'url' || away.has(Number(row.id)) || !reachable(row)) continue
      if (!/^\s*#?\s*$/.test(String(row.link ?? ''))) continue
      if (parents.has(Number(row.id))) continue
      const language = String(row.language ?? '*')
      const keys = new Set([wordsKey(row.alias), wordsKey(row.title)])
      keys.delete('')
      const found = targets
        .filter((t) => [language, '*'].includes(String(t.language ?? '*')))
        .filter((t) => [wordsKey(t.alias), wordsKey(t.title)].some((k) => keys.has(k)))
        .sort(before)[0]
      if (found) relink.push({ id: Number(row.id), link: `index.php?Itemid=${Number(found.id)}` })
      else hide.push(Number(row.id))
    }
  } catch {
    return { relink: [], hide: [] }
  }
  return { relink, hide }
}

/** The writes that point the entries `relink` at their pages. @param {Array<{ id: number, link: string }>} relink */
export const anchorSteps = (relink) =>
  relink.map(({ id, link }) => ({ kind: 'menuItem', id, fields: { link } }))

/** The longest meta description a search result shows whole. */
const MAX_DESCRIPTION = 160
/**
 * The menu entry parameters that name a page to a visitor: the two Joomla puts in its `<title>` and `<meta name="description">`,
 * and the two a T4 template prints as its share preview (`og:title`, `og:description`). JA Phio 1.0.2/1.0.3 ships the
 * template's own in its home entry's `og_title`/`og_desc` ("Portfolio and creative showcase Joomla template - JA Phio"), so the
 * share preview advertised the template under the customer's words.
 */
const PAGE_FIELDS = /** @type {const} */ (['page_title', 'menu-meta_description', 'og_title', 'og_desc'])
/** @typedef {typeof PAGE_FIELDS[number]} PageField */
/** A field that holds a title (the name goes there), as against one that holds a description. */
const TITLE_FIELDS = new Set(['page_title', 'og_title'])
/** The share-preview fields: a blank answer keeps the template's, never empties it (it would print nothing in its place). */
const SHARE_FIELDS = new Set(['og_title', 'og_desc'])
/** @typedef {Record<PageField, string[]>} ShippedMeta */

/** Text as one line, without markup. */
const flat = (/** @type {unknown} */ text) =>
  String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The shortest run of sentences that stands as a description: a stop before it closes an abbreviation ("Visit Dr."). */
const MIN_SENTENCE = 40

/**
 * Whether the character at `i` of `chars` (code points) closes a sentence: an ideographic full stop, or `.`, `!` or `?`
 * followed by a space and a capital or a letter of a script with no case. A `.` after a short capitalised word ("Dr.",
 * "St.", "Co.") is an abbreviation's, not a sentence's.
 * @param {string[]} chars
 * @param {number} i
 */
function closesSentence(chars, i) {
  if (/[。！？]/u.test(chars[i])) return true
  if (!/[.!?]/.test(chars[i]) || chars[i + 1] !== ' ' || i + 2 >= chars.length) return false
  const next = chars[i + 2]
  if (!/\p{Lu}/u.test(next) && !(/\p{L}/u.test(next) && !/\p{Script=Latin}/u.test(next))) return false
  if (chars[i] !== '.') return true
  let start = i
  while (start > 0 && chars[start - 1] !== ' ') start -= 1
  return !/^\p{Lu}\p{Ll}{0,2}$/u.test(chars.slice(start, i).join(''))
}

/**
 * The owner's own description cut to a meta description, counted in code points so no character is ever split: the
 * longest run of whole sentences from the start that fits (40 characters at least), else the words that fit and an
 * ellipsis. Nothing in it is anyone else's.
 * @param {string} text
 * @param {number} [max]
 */
export function ownExcerpt(text, max = MAX_DESCRIPTION) {
  const chars = Array.from(flat(text))
  if (chars.length <= max) return chars.join('')
  let end = 0
  for (let i = MIN_SENTENCE - 1; i < max; i += 1) if (closesSentence(chars, i)) end = i + 1
  if (end > 0) return chars.slice(0, end).join('')
  const cut = chars.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).join('').replace(/[\s,;:-]+$/u, '')}…`
}

/** A row's `params`, whichever way the door hands it (a JSON string, as stored, or an object); null when it is neither. */
export const paramsOf = (/** @type {unknown} */ params) => {
  try {
    const read = typeof params === 'string' ? JSON.parse(params) : params
    return read && typeof read === 'object' && !Array.isArray(read) ? read : null
  } catch {
    return null
  }
}

/** A string as a literal in a regular expression. */
const escaped = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Entry types that open no page of their own, so no `<title>` reads their parameters. */
const NO_PAGE = new Set(['heading', 'alias', 'url', 'separator'])

/** @type {Map<string, ShippedMeta | null>} a release's lock, read once */
const shippedByDir = new Map()

/**
 * The page titles and descriptions a release ships in its menu entries, from its presentation lock (the archive as it was
 * captured): null when the release carries no lock, or one that cannot be read.
 * @param {string} dir - the release's contract directory
 * @returns {ShippedMeta | null}
 */
export function shippedPageMeta(dir) {
  if (shippedByDir.has(dir)) return shippedByDir.get(dir) ?? null
  /** @type {ShippedMeta | null} */
  let shipped = null
  try {
    const entities =
      JSON.parse(readFileSync(path.join(dir, 'presentation-lock.json'), 'utf8'))?.entities ?? {}
    /** @type {Record<PageField, Set<string>>} */
    const found = Object.fromEntries(PAGE_FIELDS.map((field) => [field, new Set()]))
    for (const [key, row] of Object.entries(entities)) {
      if (!key.startsWith('menuItem-')) continue
      const params = paramsOf(/** @type {any} */ (row)?.params)
      for (const field of PAGE_FIELDS)
        if (typeof params?.[field] === 'string' && flat(params[field]) !== '')
          found[field].add(flat(params[field]))
    }
    shipped = /** @type {ShippedMeta} */ (
      Object.fromEntries(PAGE_FIELDS.map((field) => [field, [...found[field]]]))
    )
  } catch {
    shipped = null
  }
  shippedByDir.set(dir, shipped)
  return shipped
}

/**
 * The writes that take the template's own page titles and descriptions out of the menu entries a visitor can reach.
 *
 * 🔒 A PAGE'S TITLE AND DESCRIPTION LIVE IN ITS MENU ENTRY, WHICH NO CONTRACT SLOT COVERS. Measured 05/10/2026 on a JoomlArt
 * template's site made with Apply (one language): every word on the page was the customer's, but the home page's `<title>`
 * and `<meta name="description">` still advertised the template ("<Template> - Modern Joomla Template for…", "Discover
 * <Template>, the ultimate Joomla template…"). The template keeps both in the home entry's params (`page_title`,
 * `menu-meta_description`), and every contract maps a menu entry's title only. 33 of the 42 Joomla releases in the
 * checkout set one or both on a published entry, 27 on the home one; Tracy Business sets neither on its home and names the
 * site through its own identity module, so it read right.
 *
 * - A value is the template's when the release ships it: it equals a value of that parameter in the release's lock
 *   (`shippedPageMeta`). A name inside the template's words does not make it the owner's ("Kinetic — Signal home" for a
 *   business called Signal), and a value the release never shipped is somebody's own and is left. A release with no lock
 *   falls back to the owner's words: their name as a word, or a piece of what they wrote, is theirs; anything else goes.
 * - A home entry (one per language) takes the owner's name as its title, or keeps the template's when Name was left blank
 *   (`owner.name` empty: a name made from the site address is no answer). Its description is the start of the owner's own
 *   description (`brief.about`, never the "Label: answer" lines of the questions; whole sentences, 160 characters at
 *   most), on the home entry every language shares (`*`) and on the one of the language that description is written in;
 *   another edition's home, and every home when the owner wrote no description, has the template's emptied, never made.
 * - A home entry whose `page_title` is present but empty (JA Voyara, JA Tour, JA Social II, which also ship the site name
 *   off in titles) takes the owner's name too, so the tab names the site rather than "Home". A home with no
 *   `page_title` key at all is left (Tracy Business adds the site name to every title itself).
 * - Any other entry is emptied of both: Joomla then shows the entry's own title (`SiteApplication::getParams()` defaults an
 *   empty `page_title` to it), which the contract wrote.
 * - An entry that opens no page (a heading, an alias, a link, a separator) is not written; nor is one whose parameters
 *   cannot be read.
 *
 * An emptied description falls back to Global Configuration's `MetaDesc`, which on a JoomlArt template is often the
 * template's own text, and is left (ledger L24). The global `sitename`, the template's id as shipped, is not this step's:
 * the brand step writes the owner's name there through the plugin's `site.identity` (0.22.0+, `brand-joomla.js`).
 *
 * `params` is one JSON column, written whole, so every other setting of the entry is kept as read; the writes go in the
 * tidy-up's own transaction, and `apply.revert` undoes them.
 * @param {object} input
 * @param {any[]} input.rows - the menu's whole rows (`readMenu`)
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @param {{ name: string, said: string, about: string }} input.owner - the business name, everything the owner wrote (for
 *   telling their words), and their own description (the only words a description is cut from)
 * @param {string} input.wroteIn - the language tag that description is written in
 * @param {Partial<ShippedMeta> | null} input.shipped - what the release ships
 * @param {string[]} [input.demoNames] - the template's `demoCompanyNames`: with no description given, a description the
 *   release ships stays, these names swapped for the owner's (BLANK = the demo but the name, TCH #1013 D9)
 * @returns {{ steps: Array<{ kind: string, id: number, fields: Record<string, string> }> }}
 */
export function pageMetaSteps({ rows, visible, owner, wroteIn, shipped, demoNames = [] }) {
  const name = flat(owner.name)
  const said = flat(owner.said).toLowerCase()
  const asWord =
    name === '' ? null : new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, 'iu')
  const ships = shipped
    ? Object.fromEntries(PAGE_FIELDS.map((field) => [field, new Set((shipped[field] ?? []).map(flat))]))
    : null
  /** Whether a value held in `field` is the template's, by the release when it says, else by the owner's words. */
  const template = (/** @type {PageField} */ field, /** @type {string} */ value) => {
    const words = flat(value)
    if (ships) return ships[field].has(words)
    return !(asWord?.test(words) || (said !== '' && said.includes(words.toLowerCase())))
  }
  const description = ownExcerpt(owner.about)
  const primary = (/** @type {string} */ tag) => tag.toLowerCase().split('-')[0]
  /** The home entry's own words in `field`: the name everywhere, the description where it is in that language. */
  const ownFor = (/** @type {PageField} */ field, /** @type {string} */ language) =>
    TITLE_FIELDS.has(field)
      ? name
      : language === '*' || primary(language) === primary(String(wroteIn ?? ''))
        ? description
        : ''
  /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */
  const steps = []
  for (const row of rows) {
    const language = String(row.language ?? '*')
    if (Number(row.published) !== 1 || Number(row.id) <= 1 || NO_PAGE.has(String(row.type ?? ''))) continue
    if (language !== '*' && !visible.has(language)) continue
    const params = paramsOf(row.params)
    if (!params) continue
    const next = { ...params }
    for (const field of PAGE_FIELDS) {
      const held = params[field]
      if (typeof held !== 'string' || flat(held) === '' || !template(field, held)) continue
      // 🔒 NO DESCRIPTION GIVEN: THE TEMPLATE'S DESCRIPTION STAYS, ONLY ITS DEMO NAME SWAPPED (D9). Measured 10/10/2026 on dev
      // g58-ess-j-blank (JA Essence j6 1.0.4): the home's "Minimal Blogging Joomla Template - JA Essence" was emptied, so the
      // page carried no description at all, where the demo with the owner's name was the rule.
      if (!TITLE_FIELDS.has(field) && description === '') {
        // A demo description stating a fact (a year, a founding, a count) is emptied, never renamed onto the owner (#189).
        next[field] =
          name === '' ? held : statesFact(held, demoNames) ? '' : renameDemoCompany(held, demoNames, name)
        continue
      }
      // A share preview the customer gave nothing for keeps the template's: a blank answer is no answer.
      if (SHARE_FIELDS.has(field) && (TITLE_FIELDS.has(field) ? name : description) === '') continue
      // 🔒 A NAME LEFT BLANK: THE HOME KEEPS THE TITLE THE TEMPLATE SHIPS (TCH #1013, 14/10/2026). No name was given, so there
      // is none to put there, and an emptied home title reads "Home" on the tab.
      if (TITLE_FIELDS.has(field) && name === '' && Number(row.home) === 1) continue
      next[field] = Number(row.home) === 1 ? ownFor(field, language) : ''
    }
    // A home title the release ships EMPTY (JA Voyara, JA Tour, JA Social II): Joomla shows the entry's own title
    // ("Home") on the tab, so it takes the owner's name. An absent key is left: a site that names its titles itself
    // (Tracy Business, `sitename_pagetitles` on) would read "Name - Name".
    if (
      Number(row.home) === 1 &&
      name !== '' &&
      typeof params.page_title === 'string' &&
      flat(params.page_title) === ''
    )
      next.page_title = name
    if (PAGE_FIELDS.some((field) => next[field] !== params[field]))
      steps.push({ kind: 'menuItem', id: Number(row.id), fields: { params: JSON.stringify(next) } })
  }
  return { steps }
}

/** A value the site fills in itself (`{site.phone}`, resolved by a plugin at render): the site's own wiring, not a fact. */
const PLACEHOLDER = /\{[\w.-]+\}/
/** A value the template set: something, and not a placeholder. */
const setByTemplate = (/** @type {unknown} */ value) =>
  typeof value === 'string' && value.trim() !== '' && !PLACEHOLDER.test(value)
/** What the Apply report says when the template's mailbox was taken off a form: no address, and what turns it back on. */
export const FORM_OFF_NOTE =
  "No email was given, so the template's address was taken off the contact record and the contact form is off until you add your email."

/**
 * The writes that make the contact records of the languages a visitor can reach stop reaching the template's company.
 *
 * 🔒 A FORM WITH NO MAILBOX OF THE OWNER'S MAILED THE TEMPLATE'S COMPANY, AND NO OTHER MAILBOX MAY STAND IN. Measured 05/10/2026
 * (ledger L05, L11): an owner who typed no email got a contact form whose visitors' messages went to the demo company's sales
 * address, beside its telephone. The account email of the person who pressed Apply is NOT a stand-in, whatever the page
 * shows: Joomla 5's vCard view (`view=contact&id=N&format=vcf`) writes `email_to` for any public contact regardless of
 * `show_email`, and the contacts finder plugin indexes it when the record's `show_email` is empty, so a private address
 * written there is published. Decided 05/10/2026:
 * - The address the owner typed is the form's recipient. With none, the template's address is emptied (Joomla 5 then shows
 *   no form: `show_email_form && (email_to || user_id)`), and the report says the form is off until they add one
 *   (`FORM_OFF_NOTE`). Nothing else is written there.
 * - The phone they typed is the telephone, and the template's mobile and fax numbers go, since they are no number of the
 *   owner's. With none, the template's numbers go too (15/10/2026, TCH #1367; it replaces D12 of 11/10/2026, which
 *   kept them as placeholders): a visitor who calls the demo company's number reaches nobody of the owner's.
 * - A street address given is the record's address, and the business name replaces a demo name the template set
 *   (WO builds send both from collected facts); with none, both are left as they are.
 * - A placeholder the site fills in itself (`{site.phone}`) is left; a record already as wanted gets no write.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ email?: string, phone?: string, address?: string, name?: string }} input.given
 * @param {Set<string>} input.visible
 * @returns {Promise<{ steps: Array<{ kind: string, id: number, fields: Record<string, string> }>, note: string | null }>}
 */
export async function contactSteps({ apply, siteKey, given, visible }) {
  const email = String(given.email ?? '').trim()
  const phone = String(given.phone ?? '').trim()
  const address = String(given.address ?? '').trim()
  const name = String(given.name ?? '').trim()
  try {
    const contacts = (await listAll(checkedCall(apply, siteKey), 'contact', true)).filter((row) => {
      const language = String(row.language ?? '*')
      return Number(row.published) === 1 && (language === '*' || visible.has(language))
    })
    /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */
    const steps = []
    let silenced = 0
    for (const row of contacts) {
      /** @type {Record<string, string>} */
      const fields = {}
      if (email !== '' && row.email_to !== email) fields.email_to = email
      else if (email === '' && setByTemplate(row.email_to)) {
        fields.email_to = ''
        silenced += 1
      }
      // A phone given is the telephone; the template's other numbers go, and with none given every one of them goes (#1367).
      if (phone !== '' && row.telephone !== phone) fields.telephone = phone
      for (const field of phone !== '' ? ['mobile', 'fax'] : ['telephone', 'mobile', 'fax'])
        if (setByTemplate(row[field]) && row[field] !== phone) fields[field] = ''
      if (address !== '' && row.address !== address) fields.address = address
      if (name !== '' && setByTemplate(row.name) && row.name !== name) fields.name = name
      if (Object.keys(fields).length > 0) steps.push({ kind: 'contact', id: Number(row.id), fields })
    }
    return { steps, note: silenced > 0 ? FORM_OFF_NOTE : null }
  } catch (error) {
    return {
      steps: [],
      note: `the contact records could not be read: ${error instanceof Error ? error.message : error}`
    }
  }
}

/** The most operations one `content.batch` takes (the component's own ceiling). */
const BATCH_MAX = 100

/**
 * Write records in transactions where the component has `content.batch` (a few hundred milliseconds however many), at most
 * `BATCH_MAX` operations each and all under one apply id, and one by one where it has not (an older component) or refuses a
 * batch, so a refusal costs the records of that batch one request each and no other record.
 *
 * A step may only make sense with an earlier one (an entry under a heading goes because the heading goes). A transaction is
 * all or nothing, but one record at a time, or the next transaction, could write the one without the other: once the site
 * refuses a record, `still` is told every record refused so far and says which of the steps still to write stand, and the
 * others are not sent (`skipped`). The caller puts the steps others depend on first.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} input.steps
 * @param {string} input.applyId
 * @param {(refused: Array<{ kind: string, id: number }>) => Promise<(step: { kind: string, id: number }) => boolean>} [input.still]
 * @returns {Promise<{ written: number, notes: string[], refused: Array<{ kind: string, id: number }>, skipped: Array<{ kind: string, id: number }> }>}
 */
export async function writeSteps({ apply, siteKey, steps, applyId, still }) {
  /** @type {string[]} */
  const notes = []
  let written = 0
  /** @type {Array<{ kind: string, id: number }>} */
  const refused = []
  /** @type {Array<{ kind: string, id: number }>} */
  const skipped = []
  /** @type {(step: { kind: string, id: number }) => boolean} */
  let stands = () => true
  /** The steps of `list` that still stand; the others are set aside as skipped. */
  const standing = (/** @type {typeof steps} */ list) => {
    const kept = []
    for (const step of list) (stands(step) ? kept : skipped).push(step)
    return kept
  }
  for (let at = 0; at < steps.length; at += BATCH_MAX) {
    const part = standing(steps.slice(at, at + BATCH_MAX))
    if (part.length === 0) continue
    try {
      const answer = await apply({
        siteKey,
        action: 'content.batch',
        params: {
          apply_id: applyId,
          request_id: at === 0 ? `${applyId}-batch` : `${applyId}-batch-${at / BATCH_MAX}`,
          operations: part
        }
      })
      if (answer?.ok !== false) {
        written += part.length
        continue
      }
    } catch {
      // one by one, below
    }
    for (const step of part) {
      if (!stands(step)) {
        skipped.push(step)
        continue
      }
      try {
        const answer = await apply({
          siteKey,
          action: 'content.update',
          params: { kind: step.kind, id: step.id, apply_id: applyId, fields: step.fields }
        })
        if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
        written += 1
      } catch (error) {
        notes.push(
          `${step.kind} ${step.id} could not be changed: ${error instanceof Error ? error.message : error}`
        )
        refused.push({ kind: step.kind, id: step.id })
        if (still) stands = await still([...refused])
      }
    }
  }
  return { written, notes, refused, skipped }
}

/** What the contact form's consent box says when nothing of the owner's is set: a sentence that names no law. */
export const CONSENT_NOTE = 'I agree to my details being used to reply to this message.'

/**
 * The "Content - Confirm Consent" plugin of the site, when it exists and nobody has written its consent text. A template may
 * ship the box's text as a language string (`tracy-business/j6`: "I consent to the processing of personal data under Federal
 * Law 152-FZ", in the site's language overrides, which no door reaches); the plugin's own parameter `consentbox_text` takes
 * precedence over that string, and parameters are reached through the door.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @returns {Promise<{ id: number, params: Record<string, unknown> } | null>} null when there is nothing to set (or it could not be read)
 */
export async function findConsentPlugin({ apply, siteKey }) {
  try {
    const listed = await apply({
      siteKey,
      action: 'content.list',
      params: { kind: 'extensionParams', limit: 500 }
    })
    if (listed?.ok === false) return null
    const row = (Array.isArray(listed?.items) ? listed.items : []).find(
      (/** @type {any} */ r) =>
        r.element === 'confirmconsent' && r.folder === 'content' && Number(r.enabled) === 1
    )
    if (!row) return null
    const got = await apply({
      siteKey,
      action: 'content.get',
      params: { kind: 'extensionParams', id: Number(row.id) }
    })
    if (got?.ok === false) return null
    const params = JSON.parse(String(got?.item?.params ?? '{}'))
    if (!params || typeof params !== 'object' || Array.isArray(params)) return null
    if (typeof params.consentbox_text === 'string' && params.consentbox_text.trim() !== '') return null
    return { id: Number(row.id), params }
  } catch {
    return null
  }
}

/**
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ id: number, params: Record<string, unknown> }} input.plugin
 * @param {string} input.applyId
 * @returns {Promise<string | null>} a sentence for the report when it could not be written
 */
export async function setConsentNote({ apply, siteKey, plugin, applyId }) {
  try {
    const answer = await apply({
      siteKey,
      action: 'content.update',
      params: {
        kind: 'extensionParams',
        id: plugin.id,
        apply_id: applyId,
        fields: { params: JSON.stringify({ ...plugin.params, consentbox_text: CONSENT_NOTE }) }
      }
    })
    if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
    return null
  } catch (error) {
    return `the contact form's consent text could not be changed: ${error instanceof Error ? error.message : error}`
  }
}
