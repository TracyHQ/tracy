// Shared queries for the news family: published posts of a locale, newest first, with their
// category, plus the pagination arithmetic the list pages share.
import { getEmDashCollection, getTermsForEntries, type TaxonomyTerm } from 'emdash'
import type { Locale } from './i18n'

export interface PostCard {
  id: string
  slug: string
  data: Record<string, any>
  category: TaxonomyTerm | undefined
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
  const cats = await getTermsForEntries(
    'posts',
    entries.map((e: any) => e.data.id),
    'category',
    { locale }
  )
  return entries.map((e: any) => ({
    id: e.data.id,
    slug: e.slug,
    data: e.data,
    category: (cats.get(e.data.id) ?? [])[0]
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
