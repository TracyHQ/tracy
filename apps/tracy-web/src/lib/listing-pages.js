/**
 * The pages Create listing drafts for a Design inspiration listing, read off the release's own
 * `tracy_site_pages.json` (12/10/2026).
 *
 * 🔒 TOP-LEVEL PAGES, AT MOST SIX, IN FILE ORDER. The pages file lists every content page of the
 * main menu at ANY depth (Tracy Base Joomla: 23), while a listing shows the handful of pages its
 * preview dialog has tabs for, and every page costs two pictures (`DRAFT_MAX_LAYOUTS` in
 * card-draft.js). So a draft carries the top row of the menu:
 *   - WordPress and Joomla: a page id is its path (`get_page_uri`, a `mainmenu` path), so a
 *     top-level page is an id with no "/" (`about`, not `company/about`);
 *   - EmDash: a page id is a record slug of the `primary` menu, which has no depth in the file, so
 *     every page counts.
 * The home page is always one of them, and always first.
 *
 * Create listing drafts this set (`ops/quickstarts.js` generate door).
 */
import { DRAFT_MAX_LAYOUTS, layoutsFrom } from './card-draft.js'
import { pagesOf } from './site-pages-schema.mjs'
import { utilityName } from './template-customization-question-readiness/site-pages/page-rule.js'

/** A language's own root (`/ru`, `/pt-br`): a menu's language switch, not a page. */
const LANGUAGE_ROOT = /^\/[a-z]{2}(-[a-z]{2})?$/i
/**
 * Words of a page a listing never shows beyond `utilityName`'s (the pages file's own rule, left as
 * the writer has it): a legal page and a "not found" page that is no 404 by its path.
 */
const NOT_A_LISTING_PAGE =
  /(^|[^a-z0-9])(terms|privacy|cookies?|legal|imprint|disclaimer|not[ -]found)([^a-z0-9]|$)/i

/**
 * Whether a page may not be on a listing: a system page (login, registration, typography, a 404,
 * search…), a language switch, a legal page. The home page never is.
 * @param {unknown} label @param {unknown} path
 */
export function forbiddenOnListing(label, path) {
  const p = normal(typeof path === 'string' ? path : '')
  if (p === '/') return false
  return Boolean(
    utilityName(label, p) ||
      LANGUAGE_ROOT.test(p) ||
      NOT_A_LISTING_PAGE.test(String(label ?? '')) ||
      NOT_A_LISTING_PAGE.test(p)
  )
}

/** A path as it is compared: trimmed, no trailing slash except the root's own, no query. */
const normal = (/** @type {string} */ path) => {
  const p = String(path ?? '')
    .trim()
    .replace(/[?#].*$/, '')
  return p.length > 1 ? p.replace(/\/+$/, '') || '/' : p
}

/**
 * Every path a page answers at on its demo, the first one being where a listing points.
 *
 * EmDash: the inverse of how a menu path opens a page record (`recordsAtPath` in
 * site-pages/emdash-menu.js, the map readiness rules PAGE-4 and PAGE-7 use since PR #1239): a path
 * segment opens the record of that slug, or the one with `_page` appended. So `services_page`
 * answers at `/services` first, `/services_page` second.
 * @param {string} platform @param {{ id: string, home?: true }} page
 * @returns {string[]}
 */
function pathsOfPage(platform, page) {
  if (page.home === true) return ['/']
  const id = page.id.replace(/^\/+|\/+$/g, '')
  if (platform === 'emdash' && id.endsWith('_page') && id.length > '_page'.length)
    return [`/${id.slice(0, -'_page'.length)}`, `/${id}`]
  return [`/${id}`]
}

/**
 * The pages a listing of this release must carry, or null when the release ships no pages file
 * (the listing is then judged on its own, as before).
 * @param {{ platform?: string, pages?: unknown } | null | undefined} release a row of `readReleases`
 * @returns {{ id: string, label: string, path: string, paths: string[], home: boolean }[] | null}
 */
export function listingPagesOf(release) {
  const pages = pagesOf(release)
  if (!pages) return null
  const platform = String(release?.platform ?? '')
  const top = pages.filter((p) => p.home === true || platform === 'emdash' || !p.id.includes('/'))
  const ordered = [...top.filter((p) => p.home === true), ...top.filter((p) => p.home !== true)]
  return ordered.slice(0, DRAFT_MAX_LAYOUTS).map((p) => {
    const paths = pathsOfPage(platform, p)
    return { id: p.id, label: p.label, path: paths[0], paths, home: p.home === true }
  })
}

/**
 * The pages Create listing drafts: the release's pages (`listingPagesOf`) first, each at the path
 * the demo answers it at, then the demo's own top-level menu (the outline's `links`) in the slots
 * left, capped by `layoutsFrom` as before. Without a pages file it is the menu alone, as before.
 *
 * A page the menu read keeps what the menu measured (its `address`, its dropdown `count`). A
 * Joomla page the menu did not read takes the menu's `/index.php` prefix: every demo Tracy
 * provisions runs SEF with rewriting off, where `/contact` alone is a 404 (see `layoutsFrom`).
 * @param {{ platform?: string, pages?: unknown } | null | undefined} release
 * @param {unknown} links the outline's links, `{ label, path, address?, count? }[]`
 */
export function draftListingLayouts(release, links) {
  const menu = /** @type {any[]} */ (Array.isArray(links) ? links : []).filter(
    (l) => typeof l?.path === 'string' && l.path.startsWith('/')
  )
  const want = listingPagesOf(release) ?? []
  const prefixed = menu.some(
    (l) => typeof l.address === 'string' && /^\/index\.php(\/|$)/.test(l.address) && l.address !== l.path
  )
  const fromPages = want.map((page) => {
    const read = menu.find((l) => page.paths.some((p) => normal(p) === normal(l.path)))
    const address = read?.address ?? (prefixed && page.path !== '/' ? `/index.php${page.path}` : undefined)
    return {
      label: page.label,
      path: read ? read.path : page.path,
      ...(address === undefined ? {} : { address }),
      ...(read?.count === undefined ? {} : { count: read.count })
    }
  })
  // The menu fills the slots left with pages a listing may show (`forbiddenOnListing`): listings
  // drafted from the menu alone used to carry Login, Typography, "Not found" and `/ru`.
  const fill = menu.filter((l) => !forbiddenOnListing(l.label, l.path))
  return layoutsFrom([...fromPages, ...fill])
}

/**
 * What a saved listing breaks of the rule: the pages of `listingPagesOf` it has no tab for, in that
 * order (a tab covers a page when its path is one the page answers at; a trailing slash or a query
 * does not matter), and its tabs that may not be on a listing (`forbiddenOnListing`), in tab order.
 * Nothing is required when the release ships no pages file.
 * @param {{ platform?: string, pages?: unknown } | null | undefined} release
 * @param {{ layouts?: unknown } | null | undefined} card the saved listing
 * @returns {{ missing: { id: string, label: string, path: string }[], forbidden: { label: string, path: string }[] }}
 */
export function listingProblems(release, card) {
  const layouts = /** @type {any[]} */ (Array.isArray(card?.layouts) ? card.layouts : [])
  const pathOf = (/** @type {any} */ l) => (typeof l?.path === 'string' ? l.path : '')
  const have = new Set(layouts.map((l) => normal(pathOf(l))))
  const missing = (listingPagesOf(release) ?? [])
    .filter((p) => !p.paths.some((path) => have.has(normal(path))))
    .map(({ id, label, path }) => ({ id, label, path }))
  const forbidden = layouts
    .filter((l) => forbiddenOnListing(l?.label, pathOf(l)))
    .map((l) => ({ label: String(l?.label ?? ''), path: pathOf(l) }))
  return { missing, forbidden }
}
