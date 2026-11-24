// Small pure helpers the page views and post modules share: the intro text of a post, its tags, a page of a list in the
// `?start=N` form the source's pagination uses. No words are printed here; every label comes from the CMS.
import { getEmDashCollection } from 'emdash'
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
 * Every published post, newest first; posts of the same moment keep the order the collection holds them in (the order the
 * source lists them in), where `loadPosts` breaks that tie by slug.
 */
export async function loadPostsInOrder(locale: Locale): Promise<PostRow[]> {
  const [rows, { entries }] = await Promise.all([
    loadPosts(locale),
    getEmDashCollection('posts', { locale, status: 'published' })
  ])
  const rank = new Map<string, number>((entries as any[]).map((e, i) => [e.id as string, i]))
  return [...rows].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0)
  )
}
