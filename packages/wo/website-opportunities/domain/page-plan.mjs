import { dishWordsIn } from './content-pool.mjs'

// Which of a template's pages a demo keeps, and what fills each one — decided at build time, from the release's own
// page list, deterministically.
//
// 🔒 A PAGE IS KEPT UNLESS THERE IS A REASON TO TAKE IT OFF, and the reason is written (product owner, 19/10/2026: a demo
// shows the template's menu, not three pages of it). Reasons: a variant of a page already kept (three menu layouts, two
// contact pages), a sample page the template ships to show its features, a blog without one post or a sub-page of another
// trade's demo (`services/cloud-services`). Home and a locked page always stay. A kept page with nothing to show is kept
// empty and says so (`state`); nothing is made up.
// 🔒 A page of a kind the research holds little true for (prices, a team, questions, jobs, donations) KEEPS THE TEMPLATE'S
// LAYOUT (product owner, 26/10/2026): pricing shows the collected prices, every other slot stays empty or neutral.

/** A page's kind, read from the words of its id and label; first match wins. */
const ROLES = [
  ['home', /^(home|homepage|start|trang chu)$/],
  [
    'sample',
    /\b(j[- ]?pages|j[- ]?content|joomla[- ]content|featured[- ]articles|all[- ]categories|blog[- ]detail|typography|elements|shortcodes|components|style[- ]guide|design[- ]system|spacing|grid|samples?|colou?rs?|login|registration|sign[- ]in|your[- ]profile|user[- ]profile|offline[- ]page|erro?r?[- ]page|404|reminder|reset[- ]password|tagged[- ]items)\b/
  ],
  ['history', /\b(history|our[- ]story|story)\b/],
  ['menu', /\b(menus?|food|dishes|drinks|product|products)\b/],
  ['offers', /\b(offers?|promotions?|deals?|specials?)\b/],
  ['events', /\b(events?|whats[- ]on)\b/],
  ['blog', /\b(blog|news|resources|journal|articles?|category[- ]blog)\b/],
  ['gallery', /\b(gallery|photos|portfolio)\b/],
  ['contact', /\b(contact|reservations?|booking|find[- ]us|location)\b/],
  ['services', /\b(services?|amenities)\b/],
  ['about', /\b(about|company|who[- ]we[- ]are)\b/],
  ['pricing', /\b(pricing|prices|plans)\b/],
  ['team', /\b(team|chefs?|staff|people)\b/],
  ['donations', /\b(donations?|donate|causes?)\b/],
  ['careers', /\b(careers?|jobs?|vacanc(y|ies)|hiring)\b/],
  ['faq', /\b(faqs?|help[- ]cent(re|er)|questions)\b/]
]
/** Kinds kept with their layout and neutral slots: no person, question, job or cause of the demo, none made up. */
const NEUTRAL = new Set(['team', 'donations', 'careers', 'faq'])
/** Kinds one page of each is enough for. */
const ONE_OF = new Set([
  'pricing',
  ...NEUTRAL,
  'menu',
  'offers',
  'events',
  'blog',
  'gallery',
  'contact',
  'services',
  'about',
  'history'
])

const BLOG_MAX = 3
const BLOG_MIN = 2
const MENU_MAX = 6
const LIST_MAX = 6

/**
 * The page's own name (last path segment and label) decides, never its section: `resources/contact` is the contact
 * page, not a page of the resources (blog) section.
 */
export function pageRole(page) {
  const own = page.id.toLowerCase().split('/').at(-1)
  if (page.home || ROLES[0][1].test(own)) return 'home'
  const words = (text) => text.toLowerCase().replace(/[_/›>]+/g, ' ')
  // A sample marker anywhere in the path (`pages/j-content/…`) makes the whole branch a sample.
  if (ROLES[1][1].test(words(page.id))) return 'sample'
  return ROLES.slice(2).find(([, re]) => re.test(words(`${own} ${page.label ?? ''}`)))?.[0] ?? 'other'
}

/** A sub-page (`services/cloud-services`) of a parent that is a page of the list itself. */
function parentOf(page, ids) {
  const at = page.id.lastIndexOf('/')
  return at > 0 && ids.has(page.id.slice(0, at)) ? page.id.slice(0, at) : null
}

/** How much a page would want to show an item: long own words, a heading, recent. */
function worth(item, now) {
  const days = item.posts?.[0]?.publishedAt
    ? (Date.parse(now) - Date.parse(item.posts[0].publishedAt)) / 864e5
    : 999
  return (
    Math.min(item.body.length, 600) / 100 +
    (item.title && item.title.length > 8 ? 1 : 0) -
    Math.min(days, 730) / 365
  )
}

/**
 * @param {{pages: Array<{id: string, label?: string, home?: boolean}>, locked?: string[], content?: object[],
 *   facts?: {images?: number, prices?: number, services?: number, menuLinks?: string[], socials?: object}, now: string, cms?: string|null}} args - `content`: `contentPool` items;
 *   `facts.menuLinks` no longer changes a page's fill: the menu page shows its dishes on the site
 * @returns {{pages: Array<{id: string, path?: string, role: string, keep: boolean, why: string, fill?: string, items?: string[],
 *   state?: string}>, keep: string[]}}
 */
export function pagePlan({ pages = [], locked = [], content = [], facts = {}, now, cms = null } = {}) {
  const ids = new Set(pages.map((p) => p.id))
  const own = content.filter((it) => it.authorship === 'page')
  const ranked = [...own].sort((a, b) => worth(b, now) - worth(a, now))
  const of = (kind) => ranked.filter((it) => it.kinds.includes(kind))
  // A past event or offer is history of the feed, never a dish, a story or a post of the blog.
  const current = ranked.filter((it) => it.temporal?.status !== 'past')
  const stories = current.filter((it) => it.kinds.includes('story'))
  // A post of the blog stays true after its night is over: nothing dated or recurring.
  const posts = current.filter((it) => !it.temporal)
  // Posts about food first: a match night that mentions wings is an event, not a dish.
  const dishes = current
    .filter((it) => it.kinds[0] === 'dish' && !it.kinds.includes('event'))
    .map((it) => ({ it, food: dishWordsIn(it.title) * 3 + dishWordsIn(it.body) }))
    .sort((a, b) => b.food - a.food)
    .map(({ it }) => it)
  const taken = new Set()
  const take = (list, max) => {
    const out = list.filter((it) => !taken.has(it.id)).slice(0, max)
    for (const it of out) taken.add(it.id)
    return out.map((it) => it.id)
  }

  const roles = pages.map((p) => ({ page: p, role: pageRole(p) }))
  const aboutPage = roles.some((r) => r.role === 'about')
  // Of two contact pages, the one called Contact is kept: it is where every "Contact us" of the template leads, and a
  // reservations page is a variant of it (JA Restaurant: Phone Reservation before Contact Us in the list).
  const contactPage = roles.find(
    (r) => r.role === 'contact' && /\bcontact\b/.test(r.page.id.toLowerCase().split('/').at(-1))
  )?.page.id
  const seen = new Set()
  const rows = roles.map(({ page, role }) => {
    const parent = parentOf(page, ids)
    // A WordPress or Joomla release names a page by its path (WordPress page path, Joomla mainmenu path); an EmDash id is
    // not always its route (Tracy Base's `services_page` is served at /services, stand wobrief 19/10/2026), so it has none.
    const at = cms === 'emdash' ? {} : { path: role === 'home' ? '/' : `/${page.id}` }
    const off = (why) => ({ id: page.id, ...at, role, keep: false, why })
    if (page.home || locked.includes(page.id))
      return {
        id: page.id,
        ...at,
        role,
        keep: true,
        why: page.home ? 'the home page' : 'locked by the template'
      }
    if (role === 'sample') return off('a sample page the template ships to show its features')
    if (parent && role !== 'history') return off(`a sub-page of ${parent} from the template's own demo trade`)
    // A page of a section (`resources/mag-world`) that names no kind a restaurant has is the demo's own trade.
    if (role === 'other' && page.id.includes('/'))
      return off(`a page of the template's demo ${page.id.split('/')[0]} section, about another trade`)
    if (role === 'history' && stories.length < (aboutPage ? 2 : 1))
      return off('the posts tell no story beyond what the about page says')
    if (role === 'gallery' && !facts.images) return off('no photograph of the restaurant was collected')
    // A blog with no post of the restaurant to show would keep the demo's posts (Hill, dev, 22/10/2026).
    if (role === 'blog' && !posts.length) return off('no post of the restaurant was collected')
    if (role === 'contact' && contactPage && page.id !== contactPage)
      return off('the Contact page is kept; this one is a variant of it')
    if (ONE_OF.has(role) && seen.has(role))
      return off(`another ${role} page is kept; this one is a variant of it`)
    seen.add(role)
    if (role === 'pricing' || NEUTRAL.has(role))
      return { id: page.id, ...at, role, keep: true, why: 'a page of the template, kept with its layout' }
    return { id: page.id, ...at, role, keep: true, why: 'a page of the template' }
  })

  const keptRows = rows.filter((r) => r.keep)
  // Events and offers first: a post that is both a dish and an offer belongs on the offers page.
  for (const row of keptRows.filter((r) => r.role === 'events' || r.role === 'offers')) {
    const list = of(row.role === 'events' ? 'event' : 'offer')
    const live = take(
      list.filter((it) => it.temporal?.status !== 'past'),
      LIST_MAX
    )
    const past = take(
      list.filter((it) => it.temporal?.status === 'past'),
      LIST_MAX - live.length
    )
    row.items = [...live, ...past]
    row.fill = row.items.length ? 'sourced' : 'none'
    row.state = live.length ? 'current' : past.length ? 'past_only' : 'no_eligible_items'
  }
  // About before history: the best story opens the about page, the next ones the history page.
  const order = (r) => (r.role === 'about' ? 0 : r.role === 'history' ? 1 : 2)
  for (const row of keptRows
    .filter((r) => r.role !== 'events' && r.role !== 'offers' && r.role !== 'blog')
    .sort((a, b) => order(a) - order(b))) {
    if (row.role === 'menu') {
      // 🔒 THE MENU PAGE SHOWS THE DISHES ON THE SITE (product owner, 22/10/2026): never a button to the restaurant's live
      // menu, which took the visitor off the demo. The sourced dishes first, every other dish item of the template kept with
      // a neutral name, its description and price empty (`section-fills.mjs`; plan §7: no filler).
      row.items = take(dishes, MENU_MAX)
      row.fill = 'dishes'
    } else if (row.role === 'history') fillFrom(row, take(stories, 3), 1)
    else if (row.role === 'about') fillFrom(row, take(stories, 1), 1)
    else if (row.role === 'gallery') row.fill = 'pictures'
    else if (row.role === 'home' || row.role === 'contact') row.fill = 'facts'
    // Collected prices only (`facts.prices`: how many priced items the research holds); none, and the rows stay neutral.
    else if (row.role === 'pricing') row.fill = facts.prices > 0 ? 'prices' : 'neutral'
    else if (NEUTRAL.has(row.role)) row.fill = 'neutral'
    // The services the reading quoted (#1780, `facts.services`: how many the brief lists) fill a services page.
    else if (row.role === 'services' && facts.services > 0) row.fill = 'services'
    else row.fill = 'written'
  }
  // The blog last: it takes the best posts no other page used.
  for (const row of rows.filter((r) => r.keep && r.role === 'blog')) {
    const items = take(posts, BLOG_MAX)
    // Every post went to another page: a blog written by the agent kept the demo's posts instead (Hill, dev, 22/10/2026).
    if (!items.length)
      Object.assign(row, { keep: false, why: 'no post of the restaurant is left for the blog' })
    else fillFrom(row, items, BLOG_MIN)
  }
  return { pages: rows, keep: rows.filter((r) => r.keep).map((r) => r.id) }
}

/** Sourced when the research gave enough; written (by the agent, from the brief's facts) otherwise. */
function fillFrom(row, items, enough) {
  row.items = items
  row.fill = items.length >= enough ? 'sourced' : 'written'
}
