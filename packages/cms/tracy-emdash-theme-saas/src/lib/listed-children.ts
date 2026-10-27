/**
 * Which children of the blog a page the customer KEPT still lists (TCH #1013, decided 08/10/2026): a post or a
 * category view stays reachable while a kept page lists it, and answers 404 only when none does. Tracy SaaS case:
 * Blog unticked, Engineering and All categories kept: Engineering's posts and the category views All categories
 * links to (with the posts each of them lists) keep answering 200. Pure, so node tests run it on the seed;
 * `link-gate.ts` feeds it the published pages, posts and category terms.
 *
 * Only a page's own list counts as listing: its side rails (other categories, popular tags, "All posts") are
 * navigation, drawn only while their target is reachable, so they never keep a child alive on their own.
 */

export const BLOG_PATH = '/product/blog'
export const AUTHORS_PATH = '/product/authors'
export const TAGS_PATH = '/pages/tags'
export const ALL_CATEGORIES_PATH = '/product/all-categories'
export const postPath = (slug: string) => `${BLOG_PATH}/${slug}`
export const categoryPath = (slug: string) => `${BLOG_PATH}/category/${slug}`
export const tagPath = (slug: string) => `${BLOG_PATH}/tag/${slug}`
export const authorPath = (slug: string) => `${AUTHORS_PATH}/${slug}`

/** URL slug of a display name: "Tomás Rivera" → "tomas-rivera". */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A list page's `filter` field: `category:<slug>`, `tag:<slug>` or `author:<username>`. */
export function parseFilter(
  value: unknown
): { kind: 'category' | 'tag' | 'author'; value: string; raw: string } | null {
  const m = /^(category|tag|author):(.+)$/.exec(String(value ?? '').trim())
  if (!m) return null
  const kind = m[1] as 'category' | 'tag' | 'author'
  // Usernames use dots ("priya.raman"); `value` is the URL-slug guess, `raw` the username itself.
  return { kind, value: kind === 'author' ? slugify(m[2].replace(/\./g, '-')) : m[2], raw: m[2] }
}

/** A published page whose own page record is published too: a page the customer kept. */
export interface KeptPage {
  path: string
  view?: string
  filter?: string
}

/** What the lists need of a post: its slug, category, tag slugs and byline slug. */
export interface ListedPost {
  slug: string
  category?: string
  tags: readonly string[]
  authorSlug?: string
}

/** A category term and its parent's slug (categories are hierarchical). */
export interface ListedTerm {
  slug: string
  parent?: string
}

/**
 * The child paths (`/product/blog/<post>`, `/product/blog/category/<c>`) that the kept pages list: a post-list page
 * (`view: category`, as the router draws it with `Blog.astro`) lists the posts its filter matches; the All categories
 * page lists the category views of its cards (`Terms.astro`), and each of those views lists its posts.
 */
export function listedChildren(
  kept: readonly KeptPage[],
  posts: readonly ListedPost[],
  categories: readonly ListedTerm[]
): Set<string> {
  const out = new Set<string>()
  const listPosts = (match: (p: ListedPost) => boolean) => {
    for (const p of posts) if (match(p)) out.add(postPath(p.slug))
  }
  for (const page of kept) {
    const filter = parseFilter(page.filter)
    if (page.view === 'category') {
      if (!filter) listPosts(() => true)
      else if (filter.kind === 'category') listPosts((p) => p.category === filter.value)
      else if (filter.kind === 'tag') listPosts((p) => p.tags.includes(filter.value))
      else listPosts((p) => p.authorSlug === filter.value)
    } else if (page.path === ALL_CATEGORIES_PATH) {
      // Terms.astro: a `category:<parent>` filter lists that term's children; none lists every category with posts.
      const cards =
        filter?.kind === 'category'
          ? categories.filter((c) => c.parent === filter.value).map((c) => c.slug)
          : [...new Set(posts.flatMap((p) => (p.category ? [p.category] : [])))]
      for (const slug of cards) {
        out.add(categoryPath(slug))
        listPosts((p) => p.category === slug)
      }
    }
  }
  return out
}
