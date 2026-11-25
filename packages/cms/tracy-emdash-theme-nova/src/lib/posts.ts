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
  banner: any
  hits: string
  kind: string
  project: {
    client: string
    budget: string
    clientName: string
    services: string
    date: string
    link: string
  }
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
      banner: e.data.banner ?? null,
      hits: (e.data.hits as string) ?? '',
      kind: (e.data.kind as string) ?? 'article',
      project: {
        client: (e.data.project_client as string) ?? '',
        budget: (e.data.project_budget as string) ?? '',
        clientName: (e.data.project_client_name as string) ?? '',
        services: (e.data.project_services as string) ?? '',
        date: (e.data.project_date as string) ?? '',
        link: (e.data.project_link as string) ?? ''
      },
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

/** The address of a post: `/blog/<slug>` for an article of the blog, `/project/<category>/<slug>` for a project (the model's routes). */
export const postPath = (p: Pick<PostRow, 'slug' | 'category'>) =>
  p.category && p.category.slug !== 'blog' ? `/project/${p.category.slug}/${p.slug}` : `/blog/${p.slug}`
