// The posts of the blog and everything computed from them (docs/content-model.md): lists, the Home strips, the sidebar blocks.
import { getEmDashCollection, getTermsForEntries } from 'emdash'
import type { Locale } from './i18n'

export interface TermRef {
  slug: string
  label: string
}
export interface PostRow {
  id: string
  slug: string
  title: string
  excerpt: unknown
  body: unknown
  date: string
  cover: any
  hero: any
  author: string
  hits: number
  featured: boolean
  featuredOrder: number
  homeLead: boolean
  kind: 'standard' | 'video' | 'gallery'
  layout: 'default' | 'type-1' | 'type-2'
  videoSource: string
  videoId: string
  gallery: { image: any }[]
  category: TermRef | null
  tags: TermRef[]
}
export interface AuthorRow {
  id: string
  slug: string
  name: string
  avatar: any
  jobTitle: string
  bio: string
}
export interface CategoryInfo {
  slug: string
  title: string
  description: string
  image: any
  listStyle: 'grid' | 'stack' | 'sidebar'
}

/** The address of a post. */
export const postPath = (p: Pick<PostRow, 'slug'>) => `/blog/${p.slug}`
export const categoryPath = (slug: string) => `/category/${slug}`
export const tagPath = (slug: string) => `/tag/${slug}`
export const authorPath = (slug: string) => `/author/${slug}`

/** Every published post, newest first (ties: slug). */
export async function loadPosts(locale: Locale): Promise<PostRow[]> {
  const { entries } = await getEmDashCollection('posts', { locale, status: 'published' })
  const ids = entries.map((e: any) => e.data.id)
  const [cats, tags] = await Promise.all([
    getTermsForEntries('posts', ids, 'category', { locale }),
    getTermsForEntries('posts', ids, 'tag', { locale })
  ])
  const ref = (t: any): TermRef => ({ slug: t.slug as string, label: t.label as string })
  const rows = entries.map((e: any) => {
    const d = e.data
    return {
      id: d.id as string,
      slug: e.id as string,
      title: d.title as string,
      excerpt: d.excerpt ?? [],
      body: d.body ?? [],
      date: (d.date as string) ?? '',
      cover: d.cover ?? null,
      hero: d.hero ?? d.cover ?? null,
      author: (d.author as string) ?? '',
      hits: Number(d.hits ?? 0),
      featured: Boolean(d.featured),
      featuredOrder: Number(d.featured_order ?? 0),
      homeLead: Boolean(d.home_lead),
      kind: (d.kind as PostRow['kind']) || 'standard',
      layout: (d.layout as PostRow['layout']) || 'default',
      videoSource: (d.video_source as string) ?? '',
      videoId: (d.video_id as string) ?? '',
      gallery: Array.isArray(d.gallery) ? d.gallery : [],
      category: cats.get(d.id)?.[0] ? ref(cats.get(d.id)![0]) : null,
      tags: (tags.get(d.id) ?? []).map(ref)
    } satisfies PostRow
  })
  return rows.sort((a: PostRow, b: PostRow) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1))
}

export async function loadAuthors(locale: Locale): Promise<AuthorRow[]> {
  const { entries } = await getEmDashCollection('authors', { locale, status: 'published' })
  return entries.map((e: any) => ({
    id: e.data.id as string,
    slug: e.id as string,
    name: (e.data.name as string) ?? '',
    avatar: e.data.avatar ?? null,
    jobTitle: (e.data.job_title as string) ?? '',
    bio: (e.data.bio as string) ?? ''
  }))
}

export async function loadCategoryInfo(locale: Locale): Promise<CategoryInfo[]> {
  const { entries } = await getEmDashCollection('category_info', { locale, status: 'published' })
  return entries.map((e: any) => ({
    slug: e.id as string,
    title: (e.data.title as string) ?? '',
    description: (e.data.description as string) ?? '',
    image: e.data.image ?? null,
    listStyle: ((e.data.list_style as string) || 'grid') as CategoryInfo['listStyle']
  }))
}

// ── blocks computed from the posts (the source's modules, DECISIONS D16) ────────────────────────────────

/** The Home blog: the featured posts of the three main categories, those of the first category first, then by `featured_order`
 *  (the source's menu sorts by category, then by the frontpage order; measured: the six Health posts open the page). */
const MAIN_ORDER = ['blog-health', 'blog-design', 'blog-fashion']
export const homeBlog = (all: PostRow[]) =>
  all
    .filter((p) => p.featured)
    .sort(
      (a, b) =>
        MAIN_ORDER.indexOf(a.category?.slug ?? '') - MAIN_ORDER.indexOf(b.category?.slug ?? '') ||
        a.featuredOrder - b.featuredOrder
    )
/** The top strip of the Home: posts marked `home_lead`, by title. */
export const homeLead = (all: PostRow[]) =>
  all.filter((p) => p.homeLead).sort((a, b) => a.title.localeCompare(b.title))
/** "Articles - Latest": the newest posts of the main categories. */
export const latestPosts = (all: PostRow[], n = 4) => all.slice(0, n)
/** "Features post": the first titles A-Z (the source's module sorts by title). */
export const featuresPosts = (all: PostRow[], n = 4) => [...all].sort((a, b) => a.title.localeCompare(b.title)).slice(0, n)
/** "Trending": the least-hit posts first, as the source's module orders them (`a.hits ASC`). */
export const trendingPosts = (all: PostRow[], n = 3) => [...all].sort((a, b) => a.hits - b.hits).slice(0, n)
/** Tags by use, most used first. */
export function tagCloud(all: PostRow[], n = 6): (TermRef & { count: number })[] {
  const m = new Map<string, TermRef & { count: number }>()
  for (const p of all) for (const t of p.tags) m.set(t.slug, { ...t, count: (m.get(t.slug)?.count ?? 0) + 1 })
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, n)
}
/** "More read": posts that share a tag with this one, newest first. */
export function relatedPosts(all: PostRow[], post: PostRow, n = 4): PostRow[] {
  const mine = new Set(post.tags.map((t) => t.slug))
  return all.filter((p) => p.id !== post.id && p.tags.some((t) => mine.has(t.slug))).slice(0, n)
}
