// Posts of the blog family: the articles of the `posts` collection, one `category` term each (docs/content-model.md).
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
  author: string
  authorAvatar: any
  tags: string
  category: { slug: string; label: string } | null
}

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
      author: (e.data.author as string) ?? '',
      authorAvatar: e.data.author_avatar ?? null,
      tags: (e.data.tags as string) ?? '',
      category: t ? { slug: t.slug as string, label: t.label as string } : null
    }
  })
  return rows.sort((a: PostRow, b: PostRow) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1
  )
}

/** The address of a post: `/blog/<slug>` (the model's route; DECISIONS D10). */
export const postPath = (p: Pick<PostRow, 'slug'>) => `/blog/${p.slug}`
