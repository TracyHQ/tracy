/**
 * WHAT A PAGE THE CUSTOMER NAMES LISTS, AND THE CALL THAT ADDS TO IT (30/09/2026).
 *
 * 🔒 WHY. "Add a news post to the News page" needs one fact the map does not carry: which category (Joomla)
 * or which query (WordPress) that page lists, because a record outside it never shows there. In the
 * round-7 add-by-chat runs on WordPress and Joomla the first call was never named (14 of 16 runs), the
 * Joomla row sent the model to `content.list {kind:"category"}` — a door that lists every category and
 * cannot say which one a page lists (8 of 8 runs listed them, then read the page's menu item anyway) — and
 * the runs took 9.8 steps against 4.4 for the EmDash runs that follow a named procedure. The site already
 * says it: a Joomla page's menu item `link` is `view=category&id=N`, a WordPress listing page holds one
 * `wp:query` block. `content.read {view:"pages", url}` finds the page; here the host reads that one record
 * more and adds `lists` to the page's row, with `lists.create`: the `content.update` to fill.
 *
 * 🔒 IT NEVER CLAIMS WHAT IT CANNOT READ. Everything is derived from what the site answered, and every
 * doubt leaves the answer exactly as the relay gave it: a read that fails or is refused, a menu item that is
 * not a category list (featured, one article, another component) or one that lists only some of its articles
 * (a tag in its link, featured ones only, some authors), a page with two menu items, no query or a query
 * nested in another, two queries that list different things, a filter a new record may not match (an author,
 * a search, sticky posts, a tag, a taxonomy of the theme, a category left out, any attribute this was not
 * taught), a query that follows the address, a post type the door has no word for. Two queries that agree —
 * a category blog prints its cards and then a list of titles over the same category (`tracyMore`, wp-ja-vega)
 * — are one listing. A page that lists nothing it can name has no `lists`, and the row falls back to what it
 * always said.
 *
 * 🔒 ONE ADDITION ON A DOUBT, WORDPRESS ONLY. A page that HOLDS a query this could not reduce to one call (two
 * that differ, a filtered one, one nested in another — the seeder's category page with child pages is one)
 * carries `lists.note` alone: where to read the query, and that a post outside what it lists shows nowhere. The
 * row's fallback names no category (the row before it did: PP-3), and a `create` with none is what a model
 * would fill in and send, so none goes with the note. A page with no query, and any read that failed, stay as
 * the relay gave them: nothing says the page lists anything.
 *
 * The public `tracy-content-pages/v1` document is the relay's (`apps/tracy-web`, held by gate `api-spec`);
 * this is the host's own addition to the answer the model reads, made where the relay's answer arrives. The
 * only I/O is `read`, injected: the host's raw relay, which never throws (a throw is read as no answer).
 */
import { queryAttrs } from './wp-blocks.mjs'

/** The Content API's pages document (`site-call.mjs` `CONTENT_PAGES`, which this module cannot import). */
export const PAGE_LISTS_PAGES = 'tracy-content-pages/v1'
/** Pages of one answer that are read for their lists: an address names one page, a page and its twins a few. */
export const PAGE_LISTS_MAX = 3
/**
 * How long all the reads of one answer may take, together. The relay gives a call minutes before it gives up
 * (`APPLY_TIMEOUT_MS`, 180 s) and the model waits for this answer, which these reads only add to: a read still
 * out at the deadline is no answer, and the page is left as the relay gave it. Not a guess at a slow site — over
 * the round-7 bench a `content.get` of a post took 0.35 s at the median and 7.4 s at the 99th percentile.
 */
export const PAGE_LISTS_DEADLINE_MS = 10_000

/** What the model fills in: a value that opens with `<` is a place, never data. */
const TITLE = '<title>'
const HTML = '<p>…</p>'
const BLOCKS = '<!-- wp:paragraph --><p>…</p><!-- /wp:paragraph -->'
/** A midnight, the only time of day the host can vouch for: the Today notice is a UTC date and nothing more. */
const DAY = '<YYYY-MM-DD 00:00:00>'
const APPLY_ID = '<a short name for this change>'
/**
 * Said with a category the call carries, because the row also says "only what the customer gave" and a model
 * that reads the two together would take the category out — the very post that then shows nowhere (PP-3).
 */
const CATEGORY_NOTE =
  'This page lists by category: a post outside it does not show here, so the call keeps it.'
/**
 * 🔒 SAID WITH EVERY `create`: THE FILLED CALL IS THE WHOLE ADD (09/10/2026). Given the create and nothing about
 * whether it was enough, the add-by-chat runs went on to check that a post made by it would show and look like
 * its neighbours — the theme's templates and functions.php, the listing's query block, a sibling post, its
 * postmeta, the template's docs (bench hb: 3 of 7 WordPress runs took 7–14 calls where the best took 2; one
 * Joomla run 24). The create is built from what the page lists, so a record it makes shows there; the sentence
 * says so, beside the CATEGORY_NOTE where the page lists by category.
 */
const WHOLE_ADD =
  'This create, filled in with what the customer gave, is the whole add: nothing else to read first.'

/**
 * Said of a WordPress page that HOLDS a listing this could not reduce to one call (two that differ, a filtered
 * one, one inside another, a taxonomy of a theme, a category left out…). The row's words for a page with no
 * `lists` name no category, and a post outside what the page lists shows nowhere on it (PP-3), so the answer
 * says where to look: the page's own post, whose `wp:query` blocks say what it lists. No `create` goes with
 * it: a call with no category is the very thing this warns of.
 * @param {number} id - the page's own post.
 */
const readTheQuery = (id) =>
  `This page holds a listing this tool could not reduce to one call: read it (content.get {kind:"post", id:${id}}), then put the new record where its wp:query lists it (post_category for a taxQuery category, post_parent for parents); elsewhere it does not show here.`
/** A query block's opening comment, in any of the forms `queryAttrs` reads (`wp:query`, `wp:core/query`). */
const HOLDS_QUERY = /<!--\s+wp:(?:core\/)?query\s/

/** @typedef {(action: string, params: Record<string, unknown>) => Promise<unknown>} PageRead */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : '')
/** A positive integer, from a number or a string of digits; 0 for anything else. @param {unknown} v */
const positive = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

/**
 * Whether a filter holds anything: themes and menu items write every filter with its empty default
 * (`author:""`, `search:""`, `exclude:[]`, `sticky:""`, `filter_tag:[]`), and an empty one narrows nothing.
 * @param {unknown} v
 */
const holds = (v) =>
  typeof v === 'string'
    ? v.trim() !== ''
    : Array.isArray(v)
      ? v.length > 0
      : v === true || (typeof v === 'number' && v !== 0)

/**
 * {@link holds}, an object with anything in it included: `holds` reads every object as empty, which is how a
 * filter written as `{ include: [6] }` slipped through as "no filter".
 * @param {unknown} v
 */
const narrows = (v) => holds(v) || (isRecord(v) && Object.keys(v).length > 0)

/**
 * A record, `{}` for an absent or empty one (PHP writes an empty object as `[]`), null for anything else.
 * @param {unknown} v
 * @returns {Record<string, any> | null}
 */
const recordOrEmpty = (v) =>
  v === undefined || v === null || (Array.isArray(v) && v.length === 0) ? {} : isRecord(v) ? v : null

/**
 * The id of the ONE native record of `kind` a page row names, or 0: a page with none, or two, is not one
 * this can read a listing from.
 * @param {Record<string, any>} page
 * @param {string} kind
 */
function nativeId(page, kind) {
  const held = (Array.isArray(page.native) ? page.native : []).filter(
    (/** @type {unknown} */ one) => isRecord(one) && one.kind === kind
  )
  return held.length === 1 ? positive(held[0].id) : 0
}

/** The record a `content.get` answered, or null for anything but an answer that has one. @param {unknown} got */
const itemOf = (got) => (isRecord(got) && got.ok === true && isRecord(got.item) ? got.item : null)

/**
 * A language as Joomla writes one: a locale tag (`en-GB`, `zh-CN`, `sr-RS`), a bare language (`ru`) or `*`
 * (every language). What the site says is a language only when it looks like one; anything else is nothing.
 * @param {unknown} v
 */
const localeOf = (v) => {
  const tag = str(v)
  return tag === '*' || /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(tag) ? tag : ''
}
/** The most levels of subcategories a menu item can show; `-1` is all of them. */
const MAX_LEVELS = 20
/** The most categories one WordPress query may name and still be aimed at: past it the page lists nearly everything. */
const MAX_CATEGORIES = 50

// ── Joomla: the menu item of a page is a category list ───────────────────────────────────────────────────

/**
 * What a Joomla page lists, and the article call that adds to it: the columns are the ones the component
 * writes for an article, `state:1` is published, `publish_up` a UTC `Y-m-d H:i:s` (the row's midnight), and
 * nothing mints an `apply_id` for a Joomla write, so the call has a place for the one the model names. A
 * language nobody could read — one that is neither a locale tag nor `*` — is left out of the call, and the
 * component stamps its own.
 * @param {{ catid: unknown, language: unknown, subcategories: unknown }} target
 *   `subcategories`: the menu item's "include subcategories" (levels, -1 for all, 0 for none); a value that is
 *   no whole number of levels says nothing.
 */
export function joomlaListsOf({ catid, language, subcategories }) {
  const id = positive(catid)
  if (id === 0) return null
  const lang = localeOf(language)
  const levels = Number(subcategories)
  return {
    catid: id,
    ...(lang !== '' ? { language: lang } : {}),
    ...(Number.isInteger(levels) && levels !== 0 && levels >= -1 && levels <= MAX_LEVELS
      ? { subcategories: levels }
      : {}),
    note: WHOLE_ADD,
    create: {
      action: 'content.update',
      params: {
        kind: 'article',
        fields: {
          title: TITLE,
          catid: id,
          state: 1,
          ...(lang !== '' ? { language: lang } : {}),
          publish_up: DAY,
          introtext: HTML
        },
        apply_id: APPLY_ID
      }
    }
  }
}

/**
 * Whether the params of a blog menu item hold a filter that hides a new article: featured articles only, or
 * the articles of some authors (`CategoryModel::populateState` reads them as `filter.featured` and
 * `filter.author_id`). Hiding the featured ones (`hide`) is fine — a new article is not featured — and the
 * defaults a form leaves behind (`show_featured:""`, `list_author:[""]`) filter nothing. An author list is a
 * doubt whichever way it filters, because nobody here knows who a new article will be written by.
 * @param {Record<string, unknown>} params
 */
function hidesNewArticle(params) {
  if (holds(params.filter_tag) || str(params.show_featured) === 'only') return true
  // 0 excludes the authors listed, 1 (the default) includes only them, 2 keeps only the viewer's own.
  if (Number(params.list_author_filtering_type) === 2) return true
  // A multi-select nobody used is stored as `[""]`: a member names an author unless it is blank or the zero of no id.
  const authors = Array.isArray(params.list_author) ? params.list_author : [params.list_author]
  return authors.some((one) => Boolean(typeof one === 'string' ? one.trim() : one) && Number(one) !== 0)
}

/**
 * The category a menu item lists, from its `link` (`index.php?option=com_content&view=category&id=N`), and
 * how deep its subcategories go; null when the item is not a category list, or one that lists only some
 * articles of it.
 *
 * 🔒 WHERE THE FILTERS ARE. A tag filter is a REQUEST field of the menu type (`<fields name="request">` in
 * `blog.xml`, beside `id`), and com_menus merges request fields into the link when it saves the item
 * (`ItemController::save`): a blog filtered by tag is `…&id=259&filter_tag[0]=5` with nothing about the tag in
 * its `params`. Featured-only and the author filters are PARAMS. Both places are read; the one this used to read
 * alone (`params.filter_tag`) is a shape Joomla never writes, kept only for a plugin that might send it.
 * @param {Record<string, any>} menu
 */
function categoryOf(menu) {
  const link = str(menu.link)
  const at = link.indexOf('?')
  if (at < 0) return null
  const query = new URLSearchParams(link.slice(at + 1))
  if (query.get('option') !== 'com_content' || query.get('view') !== 'category') return null
  const catid = positive(query.get('id'))
  if (catid === 0) return null
  // `filter_tag[0]=5`, `filter_tag[]=5`, `filter_tag=5`: a blog of the articles that carry a tag, which a new one does not.
  for (const [key, value] of query) if (/^filter_tag(\[|$)/.test(key) && /[1-9]/.test(value)) return null
  /** @type {unknown} */
  let params = menu.params
  if (typeof params === 'string') {
    try {
      params = JSON.parse(params)
    } catch {
      params = null
    }
  }
  if (isRecord(params) && hidesNewArticle(params)) return null
  const levels = isRecord(params) ? Number(params.show_subcategory_content) : 0
  return { catid, subcategories: Number.isFinite(levels) ? levels : 0 }
}

/**
 * @param {Record<string, any>} page
 * @param {PageRead} read
 */
async function joomlaLists(page, read) {
  const id = nativeId(page, 'menuItem')
  if (id === 0) return null
  const menu = itemOf(await read('content.get', { kind: 'menuItem', id }))
  const target = menu === null ? null : categoryOf(menu)
  if (menu === null || target === null) return null
  // A menu item for every language says nothing of the language the article takes: the category's does.
  let language = localeOf(menu.language)
  if (language === '' || language === '*') {
    const category = itemOf(await read('content.get', { kind: 'category', id: target.catid }))
    language = category === null ? '' : localeOf(category.language)
  }
  return joomlaListsOf({ ...target, language })
}

// ── WordPress: the page's own markup holds a query block ────────────────────────────────────────────────

/**
 * The query attributes that decide nothing about WHICH posts a page lists, or that are read apart: the post
 * type, how many and in what order, the posts left out by id (a new post is none of them), the sticky ones
 * (`only` is read apart), the address (`inherit`, read apart), the taxonomies (`taxQuery`, read apart), and the
 * two keys a Tracy theme writes, the category by its slug and the "more" list under a listing's cards.
 *
 * EVERY OTHER attribute narrows or reshapes the listing, and one that holds a value is a listing a create
 * cannot be aimed at: an author (a new post has none the page chose), a search, a parent, a format, the
 * `wpJaVega…` ones that follow the page being viewed, and whatever core or a theme adds later — an attribute
 * this has never seen is a doubt, not a "no filter".
 */
const KEEPS_LISTING = new Set([
  'perPage',
  'pages',
  'offset',
  'postType',
  'order',
  'orderBy',
  'exclude',
  'sticky',
  'inherit',
  'taxQuery',
  'wpJaVegaCategory',
  'tracyMore'
])
/** The post types the door writes by a plain `kind` (`kind:"page"` fills the type itself). */
const POST_TYPES = new Set(['post', 'page'])

/**
 * The taxonomies a query lists by, as `{ <taxonomy>: ids }`. Two shapes are read: the flat one core wrote up to
 * WordPress 6.7 (`{ category: [6, 7] }`) and the one it writes from 6.8 on, `{ include: {…}, exclude: {…} }`,
 * which the Tracy seeder writes on a category page whose source site had archived articles (the archive tag is
 * left out: `{ include: { category: [6, 7] }, exclude: { post_tag: [9] } }`).
 *
 * Null for a shape a new post is not certain to meet: a category or a taxonomy of a theme left out (it may be
 * the very one the post lands in), a filter beside `include`/`exclude`, an object where ids go, anything else
 * nobody taught. Tags left out are fine: a new post carries none, so leaving them out narrows nothing it has.
 * @param {unknown} tax
 * @returns {Record<string, unknown> | null}
 */
function taxonomiesOf(tax) {
  const whole = recordOrEmpty(tax)
  if (whole === null) return null
  if (!Object.hasOwn(whole, 'include') && !Object.hasOwn(whole, 'exclude')) return whole
  const { include, exclude, ...rest } = whole
  if (Object.values(rest).some(narrows)) return null
  const kept = recordOrEmpty(include)
  const left = recordOrEmpty(exclude)
  if (kept === null || left === null) return null
  const catches = Object.entries(left).some(([taxonomy, ids]) =>
    taxonomy === 'post_tag' ? isRecord(ids) : narrows(ids)
  )
  return catches ? null : kept
}

/**
 * What one query block lists, as the identity two blocks are compared by: the post type, the category ids
 * it names and, when it names none, the slug a Tracy theme writes (`wpJaVegaCategory`). Null when it lists
 * something a create cannot be aimed at (see the head of this file).
 * @param {unknown} attrs - the block's attributes (`{queryId, query, …}`).
 * @returns {{ postType: string, ids: number[], slug: string } | null}
 */
function listingOf(attrs) {
  const query = isRecord(attrs) ? attrs.query : undefined
  // A block with no `query` attribute takes core's default, which follows the address.
  if (!isRecord(query) || query.inherit === true) return null
  const postType = query.postType === undefined || query.postType === '' ? 'post' : query.postType
  if (typeof postType !== 'string' || !POST_TYPES.has(postType)) return null
  if (query.sticky === 'only') return null
  if (Object.entries(query).some(([name, value]) => !KEEPS_LISTING.has(name) && narrows(value))) return null
  const filters = taxonomiesOf(query.taxQuery)
  if (filters === null) return null
  if (Object.entries(filters).some(([taxonomy, ids]) => taxonomy !== 'category' && narrows(ids))) return null
  /** @type {number[]} */
  const ids = []
  const wanted = filters.category
  if (narrows(wanted)) {
    if (!Array.isArray(wanted) || wanted.length > MAX_CATEGORIES) return null
    for (const one of wanted) {
      if (positive(one) === 0) return null
      ids.push(positive(one))
    }
  }
  const slug = str(query.wpJaVegaCategory)
  if (slug !== '' && !/^[^\s"'<>`\\]{1,100}$/.test(slug)) return null
  return { postType, ids, slug: ids.length === 0 ? slug : '' }
}

/**
 * What a WordPress page lists and the post call that adds to it: the fields are the ones the component
 * writes, a body is block markup, `post_status:"publish"` because a create with none is a draft on purpose
 * (`write_post`) and the customer asked for the item to be there. The category ids the page names go on the
 * call as the post's first one — enough for the page to list it — and a slug as `categories`.
 * @param {Record<string, unknown>[] | null} queries - `queryAttrs` of the page's body.
 */
export function wordpressListsOf(queries) {
  if (!Array.isArray(queries) || queries.length === 0) return null
  const listings = queries.map(listingOf)
  const [first] = listings
  if (first === null || first === undefined) return null
  // Two queries are one listing when they agree on what they list; different lists have no one answer.
  const same = JSON.stringify(first)
  if (listings.some((one) => one === null || JSON.stringify(one) !== same)) return null
  const { postType, ids, slug } = first
  return {
    postType,
    ...(ids.length > 0 ? { taxQuery: { category: ids } } : {}),
    ...(slug !== '' ? { categorySlug: slug } : {}),
    note: ids.length > 0 || slug !== '' ? `${CATEGORY_NOTE} ${WHOLE_ADD}` : WHOLE_ADD,
    create: {
      action: 'content.update',
      params: {
        kind: postType === 'page' ? 'page' : 'post',
        fields: {
          post_title: TITLE,
          post_content: BLOCKS,
          post_status: 'publish',
          ...(ids.length > 0 ? { post_category: [ids[0]] } : slug !== '' ? { categories: [slug] } : {})
        }
      }
    }
  }
}

/**
 * @param {Record<string, any>} page
 * @param {PageRead} read
 */
async function wordpressLists(page, read) {
  const id = nativeId(page, 'post')
  if (id === 0) return null
  const post = itemOf(await read('content.get', { kind: 'post', id }))
  if (post === null) return null
  const lists = wordpressListsOf(queryAttrs(post.post_content))
  if (lists !== null) return lists
  // No query in the body is a page that lists nothing; a query this could not reduce is one the model must read.
  const body = post.post_content
  return typeof body === 'string' && HOLDS_QUERY.test(body) ? { note: readTheQuery(id) } : null
}

// ── the answer ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * A `content.read {view:"pages", url}` answer with each of its one to three pages carrying what it lists.
 * The answer as the relay gave it — the very same object — when there is nothing to add: another kind of
 * answer, no address asked, a list cut short, no page or more than {@link PAGE_LISTS_MAX}, another
 * platform, a page that lists nothing it can name (a WordPress page that holds a query it cannot reduce
 * is the exception: it gets a note), any read that failed. Costs one read a page (two on
 * Joomla when the menu item is for every language), all pages side by side, and none on an answer that is
 * not a page by address. A row is only a page's when its type says so: an article lists nothing.
 * @param {unknown} answer
 * @param {{ platform: string, read: PageRead, deadlineMs?: number }} how
 *   `deadlineMs`: how long all the reads together may take ({@link PAGE_LISTS_DEADLINE_MS}).
 * @returns {Promise<unknown>}
 */
export async function withPageLists(answer, { platform, read, deadlineMs = PAGE_LISTS_DEADLINE_MS }) {
  if (platform !== 'joomla' && platform !== 'wordpress') return answer
  if (!isRecord(answer) || answer.schemaVersion !== PAGE_LISTS_PAGES) return answer
  if (typeof answer.link !== 'string' || answer.truncated === true) return answer
  const pages = answer.pages
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > PAGE_LISTS_MAX) return answer
  const listsOf = platform === 'joomla' ? joomlaLists : wordpressLists
  // One deadline for every read: past it a read that is still out answers nothing, and the ones that came back stand.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const expired = new Promise((resolve) => {
    timer = setTimeout(resolve, deadlineMs, null)
  })
  /** @type {PageRead} */
  const withinDeadline = (action, params) => Promise.race([read(action, params), expired])
  /** @type {unknown[]} */
  let lists
  try {
    lists = await Promise.all(
      pages.map(async (/** @type {unknown} */ page) => {
        try {
          return isRecord(page) && page.type === 'page' ? await listsOf(page, withinDeadline) : null
        } catch {
          return null
        }
      })
    )
  } finally {
    clearTimeout(timer)
  }
  if (lists.every((one) => one === null)) return answer
  return { ...answer, pages: pages.map((page, i) => (lists[i] ? { ...page, lists: lists[i] } : page)) }
}
