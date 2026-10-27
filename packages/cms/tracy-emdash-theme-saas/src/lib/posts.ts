// The blog family's data layer: every published post of a locale with its terms, the values the
// source prints but the CMS does not store (reading time, author slug), pagination, the date shapes
// the design uses, and one resolver per view. Lists filter one in-memory read, so every count on a
// page agrees with the list beside it; views and the router share the resolvers, so "is there
// anything at this URL" has one answer.
import {
  getEmDashCollection,
  getTaxonomyTerms,
  getTerm,
  getTermsForEntries,
  search,
  type TaxonomyTerm
} from 'emdash'
import type { Locale } from './i18n'
import { isEnglish, uiDate } from './ui-words'
import { mediaUrl } from './media'
import { loadPageByPath, type Style } from './sections'

import { BLOG_PATH, parseFilter, slugify } from './listed-children'

// The blog family's paths, the filter grammar and the byline slug live in the pure `listed-children.ts` (node tests
// load it); this module re-exports them so views keep one import.
export {
  AUTHORS_PATH,
  authorPath,
  BLOG_PATH,
  categoryPath,
  parseFilter,
  postPath,
  slugify,
  TAGS_PATH,
  tagPath
} from './listed-children'

export interface Post {
  id: string
  slug: string
  title: string
  excerpt: string
  body: unknown[]
  date: Date | null
  cover: string | null
  coverAlt: string
  author: string
  authorSlug: string
  authorRole: string
  featured: boolean
  minutes: number
  category: TaxonomyTerm | undefined
  tags: TaxonomyTerm[]
}

export interface Author {
  name: string
  slug: string
  /** Login name used by page filters (`author:priya.raman`); empty for bylines without a writers entry. */
  username: string
  role: string
  /** Line under the name on the writer's own page. */
  tagline: string
  /** Shorter line for the profile aside and cards. */
  bio: string
  count: number
  avatar: string | null
  /** Position in the writers collection; null for a byline with no writers entry. */
  order: number | null
  /** The writers entry behind this author (ULID + slug), for provenance stamps; null for a bare byline. */
  entry: { id: string; slug: string } | null
}

const WORDS_PER_MINUTE = 200

/**
 * Minutes to read a Portable Text body at 200 words a minute, code words included — the rule that
 * reproduces the source's figure on every post measured (12 of 12; prose-only misses one).
 */
export function readingMinutes(body: unknown): number {
  if (!Array.isArray(body)) return 1
  let words = 0
  for (const block of body as any[]) {
    const text =
      block?._type === 'block'
        ? (block.children ?? []).map((c: any) => c?.text ?? '').join('')
        : block?._type === 'code'
          ? String(block.code ?? '')
          : ''
    words += text.split(/\s+/).filter(Boolean).length
  }
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function loadPosts(locale: Locale): Promise<Post[]> {
  const entries: any[] = []
  let cursor: string | undefined
  // Follow the cursor so a capped page size can never silently shorten the counts.
  for (let round = 0; round < 50; round++) {
    const res: any = await getEmDashCollection('posts', {
      locale,
      status: 'published',
      orderBy: { date: 'desc' },
      limit: 500,
      ...(cursor ? { cursor } : {})
    } as any)
    entries.push(...(res.entries ?? []))
    cursor = res.nextCursor ?? undefined
    if (!cursor) break
  }
  // `entry.id` of a live-collection entry is the slug; the row id is `entry.data.id`.
  const ids = entries.map((e) => e.data.id)
  const [cats, tags] = await Promise.all([
    getTermsForEntries('posts', ids, 'category', { locale }),
    getTermsForEntries('posts', ids, 'tag', { locale })
  ])
  const posts: Post[] = entries.map((e) => {
    const d = e.data as Record<string, any>
    const author = String(d.author ?? '').trim()
    return {
      id: d.id,
      slug: e.slug ?? e.id,
      title: d.title ?? '',
      excerpt: d.excerpt ?? '',
      body: Array.isArray(d.body) ? d.body : [],
      date: toDate(d.date),
      cover: mediaUrl(d.cover),
      coverAlt: d.cover?.alt ?? '',
      author,
      authorSlug: slugify(author),
      authorRole: String(d.author_role ?? '').trim(),
      featured: Boolean(d.featured),
      minutes: readingMinutes(d.body),
      category: (cats.get(d.id) ?? [])[0],
      tags: tags.get(d.id) ?? []
    }
  })
  // Many posts share a timestamp; ties go by title so the order is stable (and matches the source's
  // order on the ties measured).
  return posts.sort(
    (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || a.title.localeCompare(b.title)
  )
}

/**
 * Every byline with its post count, plus every writers entry. A writers entry supplies name, role,
 * bio and photo; a byline without one keeps only what its posts say (most frequent `author_role`),
 * and renders initials — nothing is invented for it. Matched by slugified name, so an accent in one
 * spelling does not break the match.
 */
export async function loadAuthors(locale: Locale, posts: Post[]): Promise<Author[]> {
  const tally = new Map<string, { name: string; count: number; roles: Map<string, number> }>()
  for (const p of posts) {
    if (!p.authorSlug) continue
    const a = tally.get(p.authorSlug) ?? { name: p.author, count: 0, roles: new Map() }
    a.count++
    if (p.authorRole) a.roles.set(p.authorRole, (a.roles.get(p.authorRole) ?? 0) + 1)
    tally.set(p.authorSlug, a)
  }
  // Writers entries keep the order editors give them (`sort`); bylines without an entry follow, by post count.
  const ordered = (await loadWriters(locale)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const writers = new Map(ordered.map((w, i) => [w.slug, { ...w, order: i }]))
  return [...new Set([...tally.keys(), ...writers.keys()])]
    .map((slug) => {
      const t = tally.get(slug)
      const w = writers.get(slug)
      return {
        name: w?.name || t?.name || '',
        slug,
        username: w?.username ?? '',
        role: w?.role || ([...(t?.roles.entries() ?? [])].sort((x, y) => y[1] - x[1])[0]?.[0] ?? ''),
        tagline: w?.tagline ?? '',
        bio: w?.bio ?? '',
        count: t?.count ?? 0,
        avatar: w?.avatar ?? null,
        order: w ? w.order : null,
        entry: w?.entry ?? null
      }
    })
    .sort(
      (x, y) =>
        (x.order ?? Number.POSITIVE_INFINITY) - (y.order ?? Number.POSITIVE_INFINITY) ||
        y.count - x.count ||
        x.name.localeCompare(y.name)
    )
}

async function loadWriters(locale: Locale) {
  const { entries } = await getEmDashCollection('writers', { locale, status: 'published', limit: 100 } as any)
  return (entries as any[])
    .map((e) => {
      const d = e.data as Record<string, any>
      const name = String(d.name ?? '').trim()
      return {
        name,
        slug: slugify(name),
        username: String(d.username ?? '').trim(),
        role: String(d.role ?? '').trim(),
        tagline: String(d.tagline ?? '').trim(),
        bio: String(d.bio ?? '').trim(),
        sort: Number(d.sort) || 0,
        avatar: mediaUrl(d.avatar),
        // `entry.id` of a live-collection entry is the slug; the row id is `data.id`.
        entry: typeof d.id === 'string' ? { id: d.id, slug: String(e.slug ?? e.id) } : null
      }
    })
    .filter((w) => w.name)
}

/** Terms of a taxonomy in admin order, flattened (categories are hierarchical). */
export async function loadTerms(locale: Locale, taxonomy: 'category' | 'tag'): Promise<TaxonomyTerm[]> {
  const out: TaxonomyTerm[] = []
  const walk = (terms: TaxonomyTerm[]) => {
    for (const t of terms) {
      out.push(t)
      if (t.children?.length) walk(t.children)
    }
  }
  walk(await getTaxonomyTerms(taxonomy, { locale, includeCounts: false } as any))
  return out
}

export function countBy(posts: Post[], keys: (p: Post) => string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of posts) for (const k of keys(p)) map.set(k, (map.get(k) ?? 0) + 1)
  return map
}

/** Raw fields of a pages entry — for a field a ComposedPage does not carry. */
export async function loadPageFields(locale: Locale, path: string): Promise<Record<string, any> | null> {
  const { entries } = await getEmDashCollection('pages', { locale, status: 'published', limit: 200 } as any)
  const hit = (entries as any[]).find((e) => (e.data.path ?? '') === path)
  return hit ? (hit.data as Record<string, any>) : null
}

type PageRef = { path: string; filter?: string }

export async function pageFilter(locale: Locale, page: PageRef | undefined) {
  if (!page) return null
  return parseFilter(page.filter ?? (await loadPageFields(locale, page.path))?.filter)
}

/** The blog page's CTA sections, shown under articles and plain pages as the source does. */
export async function loadBlogCta(locale: Locale): Promise<{
  style: Style
  sections: Array<{ collection: string; entry: string; data: Record<string, any> }>
} | null> {
  const page = await loadPageByPath(locale, BLOG_PATH)
  if (!page) return null
  return { style: page.style, sections: page.sections.filter((s) => s.collection === 'cta') }
}

/**
 * The slice for `?page=N`. Null when the parameter is not a page that exists — the caller answers
 * 404 rather than quietly showing page 1 under a URL that claims otherwise.
 */
export function paginate<T>(items: T[], perPage: number, raw: string | null) {
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  let page = 1
  if (raw !== null) {
    if (!/^\d+$/.test(raw)) return null
    page = Number(raw)
    if (page < 1 || page > pages) return null
  }
  return { page, pages, slice: items.slice((page - 1) * perPage, page * perPage) }
}

/** The current URL at page N, keeping its other parameters. */
export function pageHref(url: URL, n: number): string {
  const u = new URL(url)
  if (n > 1) u.searchParams.set('page', String(n))
  else u.searchParams.delete('page')
  return u.pathname + u.search
}

// ---------------------------------------------------------------------------------------------------
// Resolvers: what each view shows at a URL. `pg === null` (or no post) means nothing — a 404.

export interface ListingProps {
  page?: PageRef
  category?: string
  tag?: string
  author?: string
}

/**
 * A post list. Layout follows the data: the blog home is the stream; an author filter is the
 * author layout; every other category or tag list is the catalog.
 */
export async function resolveListing(locale: Locale, props: ListingProps, url: URL) {
  const posts = await loadPosts(locale)
  const filter = await pageFilter(locale, props.page)
  const authorSlug = props.author ?? (filter?.kind === 'author' ? filter.value : undefined)
  const categorySlug = authorSlug
    ? undefined
    : (props.category ?? (filter?.kind === 'category' ? filter.value : undefined))
  const tagSlug =
    authorSlug || categorySlug
      ? undefined
      : (props.tag ?? (filter?.kind === 'tag' ? filter.value : undefined))

  type ListTerm = { label: string; slug: string; description?: string }
  let found = true
  let term: ListTerm | null = null
  let writer: Author | null = null
  let list = posts
  if (authorSlug) {
    // A page filter names a username; resolve it through the writers entry before guessing a slug.
    const username = !props.author && filter?.kind === 'author' ? filter.raw : ''
    const authors = await loadAuthors(locale, posts)
    writer =
      (username && authors.find((a) => a.username === username)) ||
      authors.find((a) => a.slug === authorSlug) ||
      null
    list = writer ? posts.filter((p) => p.authorSlug === writer?.slug) : []
    found = Boolean(writer)
  } else if (categorySlug || tagSlug) {
    const slug = (categorySlug ?? tagSlug) as string
    term = (await getTerm(categorySlug ? 'category' : 'tag', slug, {
      locale,
      includeCounts: false
    } as any)) as ListTerm | null
    list = categorySlug
      ? posts.filter((p) => p.category?.slug === slug)
      : posts.filter((p) => p.tags.some((t) => t.slug === slug))
    found = Boolean(term)
  }
  const mode: 'stream' | 'catalog' | 'author' = authorSlug
    ? 'author'
    : props.page?.path === BLOG_PATH
      ? 'stream'
      : 'catalog'
  const pg = found ? paginate(list, mode === 'author' ? 4 : 6, url.searchParams.get('page')) : null
  return { posts, list, pg, term, writer, mode, categorySlug, tagSlug }
}

/** The archive, optionally narrowed to `?month=YYYY-MM`. */
export async function resolveArchive(locale: Locale, url: URL) {
  const posts = await loadPosts(locale)
  // Posts arrive newest first, so the months map is in reverse chronological order too.
  const months = countBy(posts, (p) => (p.date ? [monthKey(p.date)] : []))
  const month = url.searchParams.get('month')
  const list = month ? posts.filter((p) => p.date && monthKey(p.date) === month) : posts
  const pg = month !== null && !months.has(month) ? null : paginate(list, 10, url.searchParams.get('page'))
  return { posts, months, month, list, pg }
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e as 'amp']
    )

/** Search over published posts. A malformed full-text query reads as "no results", not an error. */
export async function resolveSearch(locale: Locale, url: URL) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200)
  let hits: Array<{ slug: string | null; title?: string; snippet?: string }> = []
  if (q) {
    try {
      hits = (await search(q, { collections: ['posts'], locale, status: 'published', limit: 1000 })).items
    } catch {
      hits = []
    }
  }
  const bySlug = new Map(q ? (await loadPosts(locale)).map((p) => [p.slug, p]) : [])
  const results = hits.flatMap((h) => {
    const post = h.slug ? bySlug.get(h.slug) : undefined
    if (!post) return []
    // When the match is in the title, the engine's snippet is the title again; show the excerpt instead.
    const plain = h.snippet
      ? decode(h.snippet)
          .replace(/[.…]+$/, '')
          .trim()
      : ''
    const snippet = plain && !post.title.includes(plain) ? (h.snippet as string) : null
    return [{ post, title: h.title || post.title, snippet }]
  })
  return { q, results, pg: paginate(results, 10, url.searchParams.get('page')) }
}

export async function findPost(locale: Locale, slug: string | undefined) {
  const posts = await loadPosts(locale)
  return { posts, post: slug ? posts.find((p) => p.slug === slug) : undefined }
}

export type BlogView = 'Blog' | 'Article' | 'Archive' | 'Search' | 'Authors'

/**
 * Whether a blog-family view has anything to show at this URL. The router calls this before it
 * renders: a status set inside a view component arrives after the response has started streaming
 * and is ignored (measured: 200), so the 404 decision has to be made at page level.
 */
export async function viewFound(
  locale: Locale,
  view: BlogView,
  props: Record<string, any>,
  url: URL
): Promise<boolean> {
  switch (view) {
    case 'Blog':
      return (await resolveListing(locale, props, url)).pg !== null
    case 'Authors': {
      const filter = await pageFilter(locale, props.page)
      return filter?.kind === 'author'
        ? (await resolveListing(locale, { page: props.page, author: filter.value }, url)).pg !== null
        : true
    }
    case 'Article':
      return props.page ? true : Boolean((await findPost(locale, props.slug)).post)
    case 'Archive':
      return (await resolveArchive(locale, url)).pg !== null
    case 'Search':
      return (await resolveSearch(locale, url)).pg !== null
  }
}

// ---------------------------------------------------------------------------------------------------

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

// The shapes below are the source's English ones; another language (`tag`, the display tag of `src/lib/ui.ts`) gets
// ICU's own date of the same length, so a German site prints "8. Juli 2026", never an English month.

/** `Jul 8 2026` — list rows. */
export const dateShort = (d: Date | null, tag = 'en') =>
  !d
    ? ''
    : isEnglish(tag)
      ? `${SHORT[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`
      : uiDate(tag, d, { day: 'numeric', month: 'short', year: 'numeric' })
/** `Jul 8, 2026` — featured card, search and archive rows. */
export const dateMedium = (d: Date | null, tag = 'en') =>
  !d
    ? ''
    : isEnglish(tag)
      ? `${SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
      : uiDate(tag, d, { day: 'numeric', month: 'short', year: 'numeric' })
/** `Jul 8` — cards on a writer's page and in the catalog. */
export const dayMonth = (d: Date | null, tag = 'en') =>
  !d
    ? ''
    : isEnglish(tag)
      ? `${SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
      : uiDate(tag, d, { day: 'numeric', month: 'short' })
/** `12 July 2026`, or `08 July 2026` with `pad` — bylines and related cards. */
export const dateLong = (d: Date | null, pad = false, tag = 'en') =>
  !d
    ? ''
    : isEnglish(tag)
      ? `${pad ? String(d.getUTCDate()).padStart(2, '0') : d.getUTCDate()} ${LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`
      : uiDate(tag, d, { day: pad ? '2-digit' : 'numeric', month: 'long', year: 'numeric' })
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
export const monthLabel = (key: string, tag = 'en') => {
  const [y, m] = key.split('-').map(Number)
  if (!isEnglish(tag)) return uiDate(tag, new Date(Date.UTC(y, m - 1, 1)), { month: 'long', year: 'numeric' })
  return `${LONG[m - 1] ?? ''} ${y}`
}
