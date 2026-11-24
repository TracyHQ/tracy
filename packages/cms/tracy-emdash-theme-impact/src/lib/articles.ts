// The three article lists the source keeps in one Joomla table: blog posts (`posts`), donations and events (docs/content-model.md).
// Each is its own collection; this reads them in the order the pages draw them. Posts keep the `category` term of the kit's blog shape.
import { getEmDashCollection, getTermsForEntries } from 'emdash'
import type { Locale } from './i18n'

export type Article = Record<string, any> & { slug: string; id: string }

/** Every published entry of a collection with its slug as `slug`, in the order the seed gave them (donations, events) or newest first (posts). */
export async function loadArticles(collection: 'posts' | 'donations' | 'events', locale: Locale): Promise<Article[]> {
  const { entries } = await getEmDashCollection(collection, { locale, status: 'published' })
  const rows: Article[] = entries.map((e: any) => ({ ...(e.data as Record<string, any>), slug: e.id as string, id: e.data.id as string }))
  if (collection === 'posts') {
    const terms = await getTermsForEntries('posts', rows.map((r) => r.id), 'category', { locale })
    for (const r of rows) {
      const t = terms.get(r.id)?.[0]
      r.category = t ? { slug: t.slug as string, label: t.label as string } : null
    }
  }
  // events and donations keep the order the source gives them (Joomla `ordering`, then id); the store does not promise insertion order
  if (collection !== 'posts') return rows.sort((a, b) => Number(a.ordering ?? 0) - Number(b.ordering ?? 0) || (a.slug < b.slug ? -1 : 1))
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1))
}

/** The address of one article: `/blog/<slug>`, `/donations/<slug>`, `/events/<slug>` (the model's routes). */
export const articlePath = (collection: 'posts' | 'donations' | 'events', slug: string) =>
  `/${collection === 'posts' ? 'blog' : collection}/${slug}`

/** `4,500` → 4500; anything that is not a number → 0. */
export const amount = (v: unknown): number => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0
/** The share raised, in whole percent, capped at 100 (the source prints one decimal: 76.7%). */
export function percent(raise: unknown, goal: unknown): number {
  const g = amount(goal)
  return g > 0 ? Math.min(100, Math.round((amount(raise) / g) * 1000) / 10) : 0
}

/** The posts of the blog list and the Home: the source's Animals category (the Children stories have no list page of their own). */
export const blogPosts = (rows: Article[]) => rows.filter((r) => r.category?.slug === 'animals')
