/**
 * 🔒 A REWRITTEN TEMPLATE POST TAKES A SLUG FROM ITS NEW TITLE (product owner, 26/10/2026). Whoever writes a post's
 * title owns its slug: the agent for a post it rewrote, the residue sweep for one whose title it writes itself
 * (`residue-sweep.js`). Once a slug moves, the frozen inventory's route for that post is the old one, so the QA reads
 * the route the site has now (`currentPostRoutes`) and the sweep sends every stored link to the old route to the new
 * one (`oldRouteLinks`).
 *
 * Each CMS's own slug rule is followed: lowercase, ASCII, hyphens, unique in its scope. WordPress makes a post's slug
 * unique itself (`wp_unique_post_slug`), so the sweep sends the title's slug and reads back what was stored; Joomla
 * refuses an alias another article of its category holds, and EmDash a slug another entry of its collection and
 * locale holds (trashed ones included), so those are made unique here.
 */

/** The longest slug written: EmDash's own `slugify` cuts at 80 characters, the others take as many. */
const SLUG_MAX = 80

/**
 * A title as a slug: diacritics taken off (`Phở` → `pho`), lowercase, every run of other characters one hyphen,
 * none at either end, at most {@link SLUG_MAX} characters. Null for a title with no letter or digit left.
 * @param {unknown} text
 * @returns {string | null}
 */
export function slugOf(text) {
  if (typeof text !== 'string') return null
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'o')
    .replace(/&amp;|&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
  return slug === '' ? null : slug
}

/** The field a post's slug is written in: WordPress `post_name`, Joomla `alias`, EmDash the entry's own `slug`. */
export function slugFieldOf(platform) {
  if (platform === 'wordpress') return 'post_name'
  if (platform === 'joomla') return 'alias'
  if (platform === 'emdash') return 'slug'
  return null
}

/** The slug a record holds: WordPress `post_name`, Joomla `alias`, an EmDash entry's `identity.slug`. */
export function storedSlugOf(record, platform) {
  const slug =
    platform === 'emdash'
      ? record?.identity?.slug
      : platform === 'wordpress'
        ? record?.data?.post_name
        : platform === 'joomla'
          ? record?.data?.alias
          : null
  return typeof slug === 'string' ? slug : null
}

/** Whether two inventory records are the same post: its id, and its collection and locale on EmDash. */
export function sameRecord(a, b) {
  const x = a?.identity
  const y = b?.identity
  if (!x || !y || x.id === undefined || String(x.id) !== String(y.id)) return false
  if ((x.collection ?? null) !== (y.collection ?? null)) return false
  if (x.collection && x.locale && y.locale && x.locale !== y.locale) return false
  return (x.kind ?? null) === (y.kind ?? null)
}

/**
 * The slugs other records already hold in a post's scope: WordPress the same post type, Joomla the same category,
 * EmDash the same collection and locale, trashed entries included.
 * @param {Record<string, any>} record @param {string} platform @param {Array<Record<string, any>>} inventory
 * @returns {Set<string>}
 */
export function takenSlugsOf(record, platform, inventory) {
  const inScope = (r) => {
    if (sameRecord(r, record)) return false
    if (platform === 'wordpress')
      return r.identity?.kind === 'post' && r.data?.post_type === record.data?.post_type
    if (platform === 'joomla')
      return r.identity?.kind === 'article' && String(r.data?.catid) === String(record.data?.catid)
    if (platform === 'emdash')
      return (
        r.identity?.collection === record.identity?.collection &&
        (r.identity?.locale ?? null) === (record.identity?.locale ?? null)
      )
    return false
  }
  return new Set(
    inventory
      .filter(inScope)
      .map((r) => storedSlugOf(r, platform))
      .filter(Boolean)
  )
}

/** `base` when no other record holds it, else `base-2`, `base-3`… kept within {@link SLUG_MAX}. */
export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const tail = `-${n}`
    const slug = `${base.slice(0, SLUG_MAX - tail.length).replace(/-+$/, '')}${tail}`
    if (!taken.has(slug)) return slug
  }
}

/** A record's route as a path: WordPress and Joomla keep the path, EmDash a `{pattern}` with the slug filled. */
const pathOf = (r) => (typeof r === 'string' ? r : typeof r?.pattern === 'string' ? r.pattern : null)

/** A concrete route: a path of this site, no pattern (`/blog/[slug]`) and no mask. */
const concrete = (p) => typeof p === 'string' && /^\/(?![/\\])[^\s\\[\]{}*:]*$/.test(p) && p.length <= 400

/** One key for a route, whatever its trailing slash, its case or Joomla's `/index.php` before it. */
export const routeKey = (p) =>
  String(p ?? '/')
    .split(/[?#]/)[0]
    .replace(/^\/index\.php(?=\/|$)/i, '')
    .replace(/(.)\/+$/, '$1')
    .toLowerCase() || '/'

/**
 * The route a post answers at now, by its frozen route and the live record: the live record's own route; with none,
 * the frozen route with its old slug swapped for the slug the post holds now (a Joomla `12-alias` segment, an EmDash
 * encoded slug), which the QA then reads like any other. `tried` says what was looked at, so a route that cannot be
 * found is named with it, never skipped.
 * @returns {{route: string | null, tried: string[]}}
 */
export function currentRouteOf(frozen, frozenRoute, live, platform) {
  const tried = []
  if (!live) {
    tried.push('the live inventory has no record of this post')
    return { route: null, tried }
  }
  const own = (live.routes ?? []).map(pathOf).filter(concrete)
  if (own.length > 0) return { route: own[0], tried }
  tried.push('the live record carries no route')
  const was = storedSlugOf(frozen, platform)
  const now = storedSlugOf(live, platform)
  if (!was || !now) {
    tried.push('the post holds no slug to put in its old route')
    return { route: null, tried }
  }
  if (was === now) return { route: frozenRoute, tried }
  const segments = frozenRoute.split('/')
  const at = segments.findLastIndex((s) => s !== '')
  const encoded = (s) => encodeURIComponent(s)
  const last = segments[at] ?? ''
  const swapped =
    last === was || last === encoded(was)
      ? encoded(now)
      : last.endsWith(`-${was}`) && /^\d+-/.test(last)
        ? `${last.slice(0, last.length - was.length)}${now}`
        : null
  if (swapped === null) {
    tried.push(`the old route's last segment does not hold the old slug "${was}"`)
    return { route: null, tried }
  }
  segments[at] = swapped
  tried.push(`the old route with the post's slug "${now}"`)
  return { route: segments.join('/'), tried }
}

/**
 * Every frozen template post route and the route that post answers at now. `isPost` says which frozen records are
 * template posts. A post route that did not move is listed too, `route` equal to `was`.
 * @param {Array<Record<string, any>>} frozenRecords @param {Array<Record<string, any>>} liveRecords
 * @param {string} platform @param {(record: Record<string, any>) => boolean} isPost
 * @returns {Array<{was: string, route: string | null, post: {kind?: string, collection?: string, id: any, locale?: string | null}, title: string | null, tried: string[]}>}
 */
export function postMoves(frozenRecords, liveRecords, platform, isPost) {
  const out = []
  for (const frozen of frozenRecords ?? []) {
    if (!isPost(frozen)) continue
    const live = (liveRecords ?? []).find((r) => sameRecord(r, frozen)) ?? null
    const title =
      frozen.data?.post_title ??
      (typeof frozen.titleField === 'string' ? frozen.data?.[frozen.titleField] : undefined) ??
      frozen.data?.title ??
      null
    const post = frozen.identity.collection
      ? {
          collection: frozen.identity.collection,
          id: frozen.identity.id,
          locale: frozen.identity.locale ?? null
        }
      : { kind: frozen.identity.kind, id: frozen.identity.id }
    for (const was of (frozen.routes ?? []).map(pathOf).filter(concrete)) {
      const { route, tried } = currentRouteOf(frozen, was, live, platform)
      out.push({ was, route, post, title: typeof title === 'string' ? title : null, tried })
    }
  }
  return out
}

/**
 * The routes one QA run reads: the frozen routes in their order, each template post's in the form it answers at now.
 * `postRoutes` names each template post route the host checks as a post's: where it was, where it is now (null when
 * it cannot be found) and what was tried.
 * @param {string[]} frozenRoutes @param {ReturnType<typeof postMoves>} moves
 */
export function currentPostRoutes(frozenRoutes, moves) {
  const byWas = new Map(moves.map((m) => [m.was, m]))
  const routes = []
  for (const r of frozenRoutes) {
    const move = byWas.get(r)
    const now = move ? move.route : r
    if (now && !routes.includes(now)) routes.push(now)
  }
  return {
    routes,
    postRoutes: moves.map((m) => ({
      was: m.was,
      route: m.route,
      post: m.post,
      ...(m.title ? { title: m.title } : {}),
      ...(m.tried.length > 0 ? { tried: m.tried } : {})
    }))
  }
}

/** Entities an address carries inside an attribute, read back to the address (`sweep-resolve.mjs` `unescape`). */
const unescape = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")

/** Every anchor's address in markup, as the resolver's `relink` reads it. */
export function anchorHrefsOf(html) {
  if (typeof html !== 'string') return []
  const out = []
  for (const m of html.matchAll(/<a\b([^>]*)>[\s\S]*?<\/a>/gi)) {
    const href = /\shref\s*=\s*(["'])(.*?)\1/i.exec(m[1])
    if (href) out.push(unescape(href[2]))
  }
  return out
}

/**
 * Every `"url"` of a WordPress block comment a visitor sees as a link of its own, as the resolver's `relinkBlocks`
 * counts them: a button's `url` is the same link as the `<a>` its own saved markup shows (counted by
 * `anchorHrefsOf`), so only a block whose own markup (not a block inside it) shows no anchor to it (a navigation
 * link, a submenu) is listed.
 */
export function blockUrlsOf(html) {
  if (typeof html !== 'string') return []
  const blocks = []
  const open = []
  for (const m of html.matchAll(/<!--\s+(\/)?wp:([a-z0-9/-]+)(?:\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g)) {
    const end = m.index + m[0].length
    if (m[1]) {
      const i = open.findLastIndex((b) => b.name === m[2])
      if (i >= 0) {
        open[i].to = m.index
        open.length = i
      }
      continue
    }
    let attrs = null
    try {
      attrs = m[3] ? JSON.parse(m[3]) : {}
    } catch {
      // an unreadable block holds no address the resolver would change
    }
    const block = { name: m[2], attrs, from: end, to: end, shows: new Set() }
    blocks.push(block)
    if (!m[4]) open.push(block)
  }
  for (const m of html.matchAll(/<a\b([^>]*)>[\s\S]*?<\/a>/gi)) {
    const href = /\shref\s*=\s*(["'])(.*?)\1/i.exec(m[1])
    if (!href) continue
    const owner = blocks.reduce(
      (best, b) => (b.from <= m.index && m.index < b.to && (!best || b.from >= best.from) ? b : best),
      null
    )
    owner?.shows.add(unescape(href[2]))
  }
  return blocks
    .filter((b) => typeof b.attrs?.url === 'string' && !b.shows.has(b.attrs.url))
    .map((b) => b.attrs.url)
}

/** The keys of EmDash data whose string is an address (`sweep-resolve.mjs` `relinkData`). */
const LINK_KEYS = new Set(['href', 'url', 'link', 'cta_url', 'button_url'])

/** Every address EmDash data holds, as the resolver's `relinkData` reads them: link keys and anchors in strings. */
export function dataHrefsOf(value) {
  const out = []
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (LINK_KEYS.has(String(key))) out.push(v)
      if (v.includes('<a')) out.push(...anchorHrefsOf(v))
      return
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, i))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(value, null)
  return out
}

/**
 * The address `href` sent to `route`, in the form `href` was written: with the site's origin when it named one,
 * Joomla's `/index.php` when it had it, its trailing slash, query and fragment kept. Null when `href` does not lead
 * to `was` on this site.
 * @param {string} href @param {string} was @param {string} route @param {string} origin
 */
export function movedHref(href, was, route, origin) {
  let url
  let home
  try {
    url = new URL(href, origin)
    home = new URL(origin)
  } catch {
    return null
  }
  if (url.origin !== home.origin || routeKey(url.pathname) !== routeKey(was)) return null
  const bare = route.split(/[?#]/)[0].replace(/^\/index\.php(?=\/|$)/i, '') || '/'
  let path = /^\/index\.php(?=\/|$)/i.test(url.pathname) && bare !== '/' ? `/index.php${bare}` : bare
  path = url.pathname.endsWith('/') ? path.replace(/\/?$/, '/') : path.replace(/(.)\/+$/, '$1')
  const tail = `${url.search}${url.hash}`
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')
    ? `${home.origin}${path}${tail}`
    : `${path}${tail}`
}
