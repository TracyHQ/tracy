/**
 * The link gate of this theme (TCH #1013). Pages here carry their own nested `path` (`/product/blog`),
 * so the table maps each path a customer can untick (the release's tracy_site_pages.json: every content
 * page of the main menu, any depth) to its `pages` row; the blog family below `/product/blog` goes with
 * the blog page. A section calls `await liveLinks(Astro.request, locale, [urls…])` and draws a link only
 * while `live(url)`. The pure half is `page-records.ts`. A post or category view under the unticked blog stays live
 * while a page the customer kept still lists it (Engineering, All categories): `listed-children.ts`.
 */
import { getEmDashCollection, getEmDashEntry, getTaxonomyTerms, type TaxonomyTerm } from 'emdash'
import { LOCALES, type Locale } from './i18n'
import { linkChecker, pageRecordFor, type RecordTable } from './page-records'
import { listedChildren, type ListedTerm } from './listed-children'
import { loadPosts } from './posts'

const page = (slug: string) => ({ collection: 'pages', slug })

/** Page path (no leading slash) → its `pages` row; a longer path below one goes with it. */
export const RECORDS: RecordTable = {
  'product/features': page('features'),
  'product/integrations': page('integrations'),
  'product/changelog': page('changelog'),
  'product/blog': page('blog'),
  'product/all-categories': page('all-categories'),
  'product/faq': page('faq'),
  pricing: page('pricing'),
  'company/about': page('about'),
  'company/team': page('team'),
  'company/contact': page('contact'),
  'pages/engineering': page('engineering'),
  'pages/helixql': page('helixql'),
  'pages/landing': page('landing'),
  // The blog's own system pages list nothing but its posts, and are not offered in the Pages question: with the blog
  // page off, every link on them would be a 404, so they go with it.
  'product/authors': page('blog'),
  'product/article-archive': page('blog'),
  'pages/tags': page('blog'),
  'pages/search': page('blog'),
  'pages/author': page('blog')
}

/**
 * The children the kept pages still list, in one locale: a published `pages` row is kept when the row its own
 * path lands on is published too (the blog's archive row stays published when Blog is unticked, yet goes with it).
 */
async function listedByKeptPages(locale: string): Promise<Set<string>> {
  const [{ entries }, posts, tree] = await Promise.all([
    getEmDashCollection('pages', { locale, status: 'published', limit: 200 } as any),
    loadPosts(locale as Locale),
    getTaxonomyTerms('category', { locale, includeCounts: false } as any)
  ])
  const rows = (entries as any[]).map((e) => ({
    slug: String(e.slug ?? e.id),
    data: e.data as Record<string, any>
  }))
  const published = new Set(rows.map((r) => r.slug))
  const kept = rows
    .filter((r) => {
      const record = pageRecordFor(r.data.path, RECORDS)
      return !record || published.has(record.slug)
    })
    .map((r) => ({ path: String(r.data.path ?? ''), view: r.data.view, filter: r.data.filter }))
  const categories: ListedTerm[] = []
  const walk = (terms: TaxonomyTerm[], parent?: string) => {
    for (const t of terms) {
      categories.push({ slug: t.slug, parent })
      if (t.children?.length) walk(t.children, t.slug)
    }
  }
  walk(tree as TaxonomyTerm[])
  return listedChildren(
    kept,
    posts.map((p) => ({
      slug: p.slug,
      category: p.category?.slug,
      tags: p.tags.map((t) => t.slug),
      authorSlug: p.authorSlug
    })),
    categories
  )
}

/** A checker for one locale, outside a request (the chrome loader runs once per page). */
export function pageChecker(locale: string) {
  const listed = () => listedByKeptPages(locale)
  return linkChecker(
    async ({ collection, slug }) =>
      Boolean((await getEmDashEntry(collection as any, slug, { locale })).entry),
    RECORDS,
    LOCALES,
    listed
  )
}

/** One checker per request and locale, so each record is read once however many sections ask. */
const perRequest = new WeakMap<Request, Map<string, ReturnType<typeof linkChecker>>>()

/** Read the page records `urls` land on; returns `live(url)`, false only for a URL whose page is off. */
export function liveLinks(request: Request, locale: string, urls: readonly unknown[]) {
  let byLocale = perRequest.get(request)
  if (!byLocale) perRequest.set(request, (byLocale = new Map()))
  let check = byLocale.get(locale)
  if (!check) {
    check = pageChecker(locale)
    byLocale.set(locale, check)
  }
  return check(urls)
}
