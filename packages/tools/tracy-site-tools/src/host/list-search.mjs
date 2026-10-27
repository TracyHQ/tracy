/**
 * `content.list {search}` — what the Claude Cowork plugin's title search covers, and from which release
 * (30/09/2026). One leaf module, so the description (`surface.mjs`), the refusal roads (`site.mjs`) and the
 * cut list's next (`site-call.mjs`) name the same numbers and the same kinds.
 *
 * 🔒 THE NUMBERS ARE WORDS, NEVER A GATE. This host stores no plugin version per site, and a plugin
 * updates itself about every 15 minutes, so any version it kept would only be a lower bound. What decides
 * whether a plugin read `search` is the answer's own `search` key — judged by the relay (`route.js`,
 * `LIST_SEARCH_UNSUPPORTED`) and again by `site-call.mjs` `searchReadOrRefused` — and what the host
 * learned from it for 15 minutes (`call-memory.mjs` `noListSearch`). Nothing below raises a plugin floor
 * (`COWORK_FLOOR`, a quickstart's `coworkMinVersion`) or says "this site has the plugin": `search` is an
 * optimisation, and the road when it is refused is `content.read`.
 */

/**
 * The plugin releases that read `search` on `content.list`: Joomla `joomla-v0.20.0` and WordPress
 * `wordpress-v0.16.0`, both published 30/09/2026 (claude-cowork PRs #83 and #84). An older plugin ignores
 * the key and answers the whole list as `ok`.
 */
export const LIST_SEARCH_SINCE = Object.freeze({ joomla: '0.20.0', wordpress: '0.16.0' })

/**
 * The Joomla kinds whose rows the plugin searches by title (or name) and, where the kind has one, alias:
 * `SEARCH_COLUMNS` of `JoomlaSiteWriter.php` at `joomla-v0.20.0`. Every other kind (`user`, `redirect`,
 * `extensionParams`, `languageFilter`, the three association kinds, `fieldValue`) the plugin refuses
 * `bad_params`, naming the kinds that work — a person, a URL pair, an extension's settings or a relation
 * between two rows is not a record a caller finds by its title. `test/site-call.test.mjs` holds this list
 * row for row.
 */
export const JOOMLA_SEARCH_KINDS = Object.freeze([
  'article',
  'category',
  'tag',
  'menuItem',
  'module',
  'templateStyle',
  'language',
  'menutype',
  'banner',
  'contact',
  'newsfeed',
  'bannerClient',
  'field'
])

/**
 * The Joomla kinds whose records `content.read` lists, and the `type` it lists them under:
 * `ContentProjection::build` of `joomla-v0.20.0` projects an article as `article`, a menu item as `page` and a
 * module as `shared`. Every other kind has no listing there. `content.read` lists the Content API's types
 * (`page`, `article`, `service`, `project`, `shared`, `generic`: `CONTENT_TYPES` of `tracy-content-api`), not
 * the plugin's kinds, and `content.read {type:"banner"}` is refused `CONTENT_BAD_QUERY` by the relay and by
 * the plugin. A category and a tag show only as `shared` records attached to a readable article or page,
 * never as the whole list, and a template style only in a derived contract — so they are not listed here:
 * the road to one of them is `content.list` itself, paged. `test/consistency.test.mjs` holds the types to the
 * Content API's own list.
 */
export const JOOMLA_READ_TYPES = Object.freeze({ article: 'article', menuItem: 'page', module: 'shared' })

/**
 * The WordPress post types `content.read` lists (`class-claude-cowork-content-source.php` of
 * `wordpress-v0.16.0`): pages and posts (`page`, `article`), and template parts, reusable blocks and menus
 * (`shared`). A post type of another plugin — a product, an order — is not in it.
 */
const WORDPRESS_READ_POST_TYPES = Object.freeze([
  'page',
  'post',
  'wp_template_part',
  'wp_block',
  'wp_navigation'
])

/**
 * Whether `content.read` lists what this `content.list` call lists — the only lists a refusal may send a
 * model to `content.read` for (`content.read {type, locale, fields:"title,slug"}` lists one language's
 * records by title, and its rows carry the CMS id). It is the road that is left when a plugin does not read
 * `search`, and for a kind it does not list it is no road: the relay refuses the type. No kind is the
 * platform's default (an article on Joomla; posts and pages on WordPress). On WordPress the kind is `post` of
 * some post type — `post_type` says which — and the one kind this host lists itself is `option`. What the
 * call named is not known when `asked` is missing, and then the road stays (it is the one a refusal has always
 * named).
 * @param {unknown} platform
 * @param {unknown} asked - the params the call was sent with (`kind`, and on WordPress `post_type`).
 * @returns {boolean}
 */
export function contentReadLists(platform, asked) {
  const params =
    asked !== null && typeof asked === 'object' ? /** @type {Record<string, unknown>} */ (asked) : {}
  const kind = typeof params.kind === 'string' ? params.kind.trim() : ''
  if (platform === 'joomla') return kind === '' || Object.hasOwn(JOOMLA_READ_TYPES, kind)
  if (/^options?$/i.test(kind)) return false
  const postType = typeof params.post_type === 'string' ? params.post_type.trim() : ''
  return postType === '' || WORDPRESS_READ_POST_TYPES.includes(postType)
}

/**
 * The `type` under which `content.read` lists what this `content.list` call lists, or null when it lists none
 * of it (`contentReadLists`) or the platform has no such map. A refusal names the call with this value in it,
 * never a bare `{type}`: given only the placeholder, the model filled in its CMS's own word (`type:"post"` on
 * WordPress, refused `CONTENT_BAD_QUERY`; bench hb 09/10/2026, 4 of 4 such reads). On Joomla the kind's type
 * ({@link JOOMLA_READ_TYPES}; no kind is an article); on WordPress a page is `page`, a template part, a reusable
 * block or a menu `shared`, and a post — the list's default — `article`.
 * @param {unknown} platform
 * @param {unknown} asked - the params the call was sent with.
 * @returns {'article' | 'page' | 'shared' | null}
 */
export function contentReadType(platform, asked) {
  if (!contentReadLists(platform, asked)) return null
  const params =
    asked !== null && typeof asked === 'object' ? /** @type {Record<string, unknown>} */ (asked) : {}
  const kind = typeof params.kind === 'string' ? params.kind.trim() : ''
  if (platform === 'joomla')
    return kind === '' ? 'article' : JOOMLA_READ_TYPES[/** @type {keyof typeof JOOMLA_READ_TYPES} */ (kind)]
  if (platform !== 'wordpress') return null
  const postType = typeof params.post_type === 'string' ? params.post_type.trim() : ''
  if (postType === 'page' || (postType === '' && /^pages?$/.test(kind))) return 'page'
  if (postType !== '' && postType !== 'post') return 'shared'
  return 'article'
}

/**
 * Whether a `content.list` of `kind` on `platform` is one the plugin's `search` covers — the only lists
 * worth pointing a model at `search` for. No kind is the platform's default (an article on Joomla, a post
 * on WordPress). On WordPress every list the door serves is posts, of any post type; the one kind the
 * host lists itself, whole, is `option` (a `search` there is dropped and said, `normalize.mjs` `wpList`).
 * @param {unknown} platform
 * @param {unknown} kind
 * @returns {boolean}
 */
export function listSearchCovers(platform, kind) {
  const asked = typeof kind === 'string' ? kind.trim() : ''
  if (platform === 'joomla') return asked === '' || JOOMLA_SEARCH_KINDS.includes(asked)
  if (platform === 'wordpress') return !/^options?$/i.test(asked)
  return false
}

/**
 * Whether the call carries a `search` that filters: a text that is not blank. A blank one filters
 * nothing and the host drops it (`normalize.mjs` `listSearch`).
 * @param {unknown} params
 * @returns {boolean}
 */
export function carriesListSearch(params) {
  if (params === null || typeof params !== 'object') return false
  const search = /** @type {Record<string, unknown>} */ (params).search
  return typeof search === 'string' && search.trim() !== ''
}
