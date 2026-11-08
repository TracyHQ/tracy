// Posts of the blog family: the 22 articles of the `posts` collection, one `category` term each (docs/content-model.md).
import { getEmDashCollection, getTermsForEntries } from 'emdash'
import type { Locale } from './i18n'

export interface PostRow {
  id: string
  slug: string
  title: string
  excerpt: unknown
  body: unknown
  date: string
  created: string
  cover: any
  category: { slug: string; label: string } | null
}

/** The four categories the blog lists and the home news row draws from (the source's module 103 filters on the same four). */
export const BLOG_CATEGORIES = [
  'restaurant-business',
  'restaurant-marketing',
  'restaurant-news',
  'restaurant-guide'
]

/** Every published post with its first category, newest first (ties: the order the seed gave). */
export async function loadPosts(locale: Locale): Promise<PostRow[]> {
  const { entries } = await getEmDashCollection('posts', { locale, status: 'published' })
  const ids = entries.map((e: any) => e.data.id)
  const terms = await getTermsForEntries('posts', ids, 'category', { locale })
  const rows = entries.map((e: any) => {
    const t = terms.get(e.data.id)?.[0] ?? null
    return {
      id: e.data.id as string,
      slug: e.id as string,
      title: e.data.title as string,
      excerpt: e.data.excerpt ?? [],
      body: e.data.body ?? [],
      date: (e.data.date as string) ?? '',
      created: (e.data.created as string) ?? '',
      cover: e.data.cover ?? null,
      category: t ? { slug: t.slug as string, label: t.label as string } : null
    }
  })
  return rows.sort((a: PostRow, b: PostRow) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1
  )
}

/** The posts of the blog categories (the `other` category holds the Lorem ipsum sample only). */
export const blogPosts = (all: PostRow[]) =>
  all.filter((p) => p.category && BLOG_CATEGORIES.includes(p.category.slug))
/** The address of a post: `/<category>/<slug>` (the model's route; DECISIONS D6). */
export const postPath = (p: Pick<PostRow, 'slug' | 'category'>) => `/${p.category?.slug ?? 'blog'}/${p.slug}`
