// Small pure helpers the page views and post modules share: the intro text of a post, its tags, a page of a list in the
// `?start=N` form the source's pagination uses. No words are printed here; every label comes from the CMS.
import { getEmDashCollection, getTaxonomyTerms } from 'emdash'
import { loadPosts, type PostRow } from '@/lib/posts'
import type { Locale } from '@/lib/i18n'

/** The text of Portable Text blocks (text blocks only), one paragraph per block. */
export function paragraphs(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return []
  return blocks
    .filter((b: any) => b && b._type === 'block' && !b.listItem && /^normal$/.test(b.style ?? 'normal'))
    .map((b: any) => (b.children ?? []).map((c: any) => c?.text ?? '').join('').trim())
    .filter(Boolean)
}

/** The intro of a post: its excerpt, or the first paragraph of the body (the source's introtext). */
export function introOf(post: Pick<PostRow, 'excerpt' | 'body'>): string {
  return paragraphs(post.excerpt)[0] ?? paragraphs(post.body)[0] ?? ''
}

/** The source's `substr($text, 0, n) . " ..."` of the related-items and latest-news modules. */
export const cut = (text: string, n: number): string => (text.length > n ? text.slice(0, n) : text) + ' ...'

/** The source's category-list truncation: at most n characters, ending on a whole word, then an ellipsis. */
export function clip(text: string, n: number): string {
  if (text.length <= n) return text
  const head = text.slice(0, n)
  const at = head.lastIndexOf(' ')
  return `${(at > 0 ? head.slice(0, at) : head).trim()}...`
}

/** The tags of a post: its `tags` field holds one per line. */
export const tagsOf = (post: Pick<PostRow, 'tags'>): string[] =>
  String(post.tags ?? '')
    .split(/\r?\n|,/)
    .map((t) => t.trim())
    .filter(Boolean)

/** Heading text split at its line breaks (`first\nsecond`). */
export const lines = (text: unknown): string[] =>
  String(text ?? '')
    .split(/\r?\n|<br\s*\/?>/i)
    .map((l) => l.trim())
    .filter(Boolean)

/** `?start=` offset of a request, clamped to a multiple of the page size inside the list. */
export function startOf(url: URL, size: number, total: number): number {
  const n = Math.floor(Number(url.searchParams.get('start')) || 0)
  const last = Math.max(0, Math.ceil(total / size) - 1) * size
  return Math.min(Math.max(0, n - (n % size)), last)
}

/** A path with the page offset in the `?start=N` form (no query for the first page). */
export function startHref(path: string, start: number, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  if (start > 0) q.set('start', String(start))
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

/** A post's category slug for the project routes (`/project/<slug>`), or null for a blog article. */
export const projectCategory = (post: Pick<PostRow, 'kind' | 'category'>): string | null =>
  post.kind === 'project' && post.category ? post.category.slug : null

/**
 * Every published post in the source's list orders: the articles of the blog newest first (ties: the Joomla `sort` ordering),
 * then the projects by category (the order the categories were created in, which is the order the source's tabs and its
 * "All project" list use) and by the Joomla `sort` ordering inside a category. A caller takes the kind it needs.
 */
export async function loadPostsInOrder(locale: Locale): Promise<PostRow[]> {
  const [rows, { entries }] = await Promise.all([
    loadPosts(locale),
    getEmDashCollection('posts', { locale, status: 'published' })
  ])
  const rank = new Map<string, number>()
  const sortOf = new Map<string, string>()
  ;(entries as any[]).forEach((e, i) => {
    rank.set(e.id as string, i)
    sortOf.set(e.id as string, String(e.data.sort ?? ''))
  })
  let terms: string[] = []
  try {
    terms = ((await getTaxonomyTerms('category', { locale })) as any[]).map((t) => t.slug as string)
  } catch {
    terms = []
  }
  const catRank = (p: PostRow) => {
    const i = terms.indexOf(p.category?.slug ?? '')
    return i < 0 ? 999 : i
  }
  const bySort = (a: PostRow, b: PostRow) => {
    const x = sortOf.get(a.slug) ?? ''
    const y = sortOf.get(b.slug) ?? ''
    return x < y ? -1 : x > y ? 1 : (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0)
  }
  const articles = rows.filter((p) => p.kind !== 'project').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : bySort(a, b)))
  const projects = rows.filter((p) => p.kind === 'project').sort((a, b) => catRank(a) - catRank(b) || bySort(a, b))
  return [...articles, ...projects]
}

/** The home news band's order (`mod_articles_category` ordered by title, ascending, case-insensitive). */
export const byTitle = (list: PostRow[]): PostRow[] =>
  [...list].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))
