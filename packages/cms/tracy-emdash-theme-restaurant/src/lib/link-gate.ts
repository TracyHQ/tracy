/**
 * The link gate of this theme (TCH #1013): which page record each path is served by (the records
 * `src/pages/[...path].astro` routes to), wired to EmDash. A view calls `await liveLinks(Astro.request, locale, [urls…])`
 * and draws a link only while `live(url)`; the router answers 404 for a path whose record is off (`childLive`). The pure
 * half is `page-records.ts`. A child of an unticked page goes with it, whatever page lists it (`listed-children.ts`).
 */
import { getEmDashEntry } from 'emdash'
import { LOCALES } from './i18n'
import { linkChecker, type PageRecord, type RecordTable } from './page-records'
import { gateBlocks, linkHrefs } from './data-links.ts'
import { withParents } from './parent-gate.ts'
import { BLOG_CATEGORIES, postPath, type PostRow } from './posts'

const page = (slug: string): PageRecord => ({ collection: 'pages', slug })

/**
 * Path without its leading slash → the page record that serves it and every path below it (the longest key wins):
 * the 13 pages of the main menu at their menu paths, plus what hangs under them without a path of its own: the blog
 * categories (`/<category>`, `/<category>/<article>`) go with Blog, and an album (`/gallery/<slug>`) with Gallery.
 */
const RECORDS: RecordTable = {
  'about-us': page('about-us'),
  'about-us/our-history': page('our-history'),
  menu: page('menu'),
  'menu/simple-menu': page('simple-menu'),
  'menu/menu-with-image': page('menu-with-image'),
  'menu/2-column-menu': page('2-column-menu'),
  offers: page('offers'),
  blog: page('blog'),
  gallery: page('gallery'),
  'explore/j-pages/all-categories': page('all-categories'),
  'explore/j-pages/featured-articles': page('featured-articles'),
  'contact/phone-reservation': page('phone-reservation'),
  'contact/contact-us': page('contact-us'),
  ...Object.fromEntries(BLOG_CATEGORIES.map((c) => [c, page('blog')]))
}

/** One checker per request and locale, so each record is read once however many components ask. */
const perRequest = new WeakMap<Request, Map<string, ReturnType<typeof withParents>>>()

/**
 * Read the page records `urls` land on, and those of their parents (`parent-gate.ts`); returns `live(url)`, false for a URL
 * whose page is off or that hangs under a page that is off: a child of an unticked page is unreachable and never linked.
 */
export function liveLinks(request: Request, locale: string, urls: readonly unknown[]) {
  let byLocale = perRequest.get(request)
  if (!byLocale) perRequest.set(request, (byLocale = new Map()))
  let check = byLocale.get(locale)
  if (!check) {
    check = withParents(
      linkChecker(
        async ({ collection, slug }) => Boolean((await getEmDashEntry(collection, slug, { locale })).entry),
        RECORDS,
        LOCALES
      ),
      RECORDS,
      LOCALES
    )
    byLocale.set(locale, check)
  }
  return check(urls)
}

/** Whether a path is reachable: the page record it lands on is published (a path no record owns always is). */
export async function childLive(request: Request, locale: string, path: string): Promise<boolean> {
  return (await liveLinks(request, locale, [path]))(path)
}

/** A Portable Text value without the links to pages that are off (`data-links.ts`): the words stay, plain. */
export async function liveBlocks<T>(request: Request, locale: string, blocks: T): Promise<T> {
  const live = await liveLinks(request, locale, linkHrefs(blocks))
  return gateBlocks(blocks, live)
}

/** The posts whose own page is reachable: with Blog (or Gallery) unticked a list draws no card that leads to a 404. */
export async function livePosts<T extends Pick<PostRow, 'slug' | 'category'>>(
  request: Request,
  locale: string,
  posts: readonly T[]
): Promise<T[]> {
  const live = await liveLinks(request, locale, posts.map(postPath))
  return posts.filter((p) => live(postPath(p)))
}
