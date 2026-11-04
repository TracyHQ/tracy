// Posts of the blog family. Gallery albums and the Chefs page are posts too (category `gallery` / `pages`); the blog
// shows only the restaurant categories (docs/content-model.md).
import { getEmDashCollection, getTermsForEntries } from 'emdash'
import type { Locale } from './i18n'

export interface PostRow {
  id: string
  slug: string
  title: string
  excerpt: string
  body: unknown
  date: string
  cover: any
  featured: boolean
  featuredOrder: number
  listOrder: number
  photos: any[]
  tags: Array<{ slug: string; label: string }>
  category: { slug: string; label: string } | null
}

export const BLOG_CATEGORIES = [
  'restaurant-business',
  'restaurant-marketing',
  'restaurant-news',
  'restaurant-guide',
  'restaurant'
]

/** Every published post with its first category, in the order the source's blog lists them (`list_order`: category order, then article order), then newest first. */
export async function loadPosts(locale: Locale): Promise<PostRow[]> {
  const { entries } = await getEmDashCollection('posts', { locale, status: 'published' })
  const ids = entries.map((e: any) => e.data.id)
  const terms = await getTermsForEntries('posts', ids, 'category', { locale })
  const tagTerms = await getTermsForEntries('posts', ids, 'tag', { locale })
  const rows = entries.map((e: any) => {
    const t = terms.get(e.data.id)?.[0] ?? null
    return {
      id: e.data.id as string,
      slug: e.id as string,
      title: e.data.title as string,
      excerpt: (e.data.excerpt as string) ?? '',
      body: e.data.body ?? [],
      date: (e.data.date as string) ?? '',
      cover: e.data.cover ?? null,
      featured: e.data.featured === true,
      featuredOrder: Number(e.data.featured_order ?? 0),
      listOrder: Number(e.data.list_order ?? 1e6),
      photos: (e.data.photos as any[]) ?? [],
      tags: ((tagTerms.get(e.data.id) ?? []) as any[]).map((x) => ({
        slug: x.slug as string,
        label: x.label as string
      })),
      category: t ? { slug: t.slug as string, label: t.label as string } : null
    }
  })
  return rows.sort(
    (a: PostRow, b: PostRow) =>
      a.listOrder - b.listOrder || (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1)
  )
}

/** The four restaurant categories the blog and its sidebar list (the `restaurant` parent holds no article of its own). */
export const BLOG_SIDEBAR = [
  'restaurant-business',
  'restaurant-marketing',
  'restaurant-news',
  'restaurant-guide'
]
export const blogPosts = (all: PostRow[]) =>
  all.filter((p) => p.category && BLOG_CATEGORIES.includes(p.category.slug))
/** The address of a post: `/<category>/<slug>` (the model's route; DECISIONS D6). */
export const postPath = (p: Pick<PostRow, 'slug' | 'category'>) => `/${p.category?.slug ?? 'blog'}/${p.slug}`
