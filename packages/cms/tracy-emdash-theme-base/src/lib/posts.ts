// Shared queries for the news family: published posts of a locale, newest first, with their
// category, plus the pagination arithmetic the list pages share.
import { getEmDashCollection, getTermsForEntries, type TaxonomyTerm } from 'emdash'
import type { Locale } from './i18n'

export interface PostCard {
  id: string
  slug: string
  data: Record<string, any>
  category: TaxonomyTerm | undefined
  tags: TaxonomyTerm[]
}

export async function loadPosts(
  locale: Locale,
  where?: Record<string, string | string[]>
): Promise<PostCard[]> {
  const { entries } = await getEmDashCollection('posts', {
    locale,
    status: 'published',
    orderBy: { date: 'desc' },
    limit: 500,
    ...(where ? { where } : {})
  } as any)
  // `entry.id` of a live-collection entry is the SLUG; the row id is `entry.data.id` (measured on 0.37).
  const ids = entries.map((e: any) => e.data.id)
  const [cats, tags] = await Promise.all([
    getTermsForEntries('posts', ids, 'category', { locale }),
    getTermsForEntries('posts', ids, 'tag', { locale })
  ])
  // Same-day posts keep the order the source listed them in (`sort`); the API's date order alone
  // is not stable for the demo, whose posts all carry one publish date.
  entries.sort(
    (a: any, b: any) =>
      (Date.parse(b.data.date) || 0) - (Date.parse(a.data.date) || 0) ||
      (a.data.sort ?? 0) - (b.data.sort ?? 0)
  )
  return entries.map((e: any) => ({
    id: e.data.id,
    slug: e.slug,
    data: e.data,
    category: (cats.get(e.data.id) ?? [])[0],
    tags: tags.get(e.data.id) ?? []
  }))
}

export function paginate<T>(items: T[], page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(Math.max(1, page), pages)
  return {
    pages,
    page: current,
    slice: items.slice((current - 1) * perPage, current * perPage),
    outOfRange: page > pages
  }
}
