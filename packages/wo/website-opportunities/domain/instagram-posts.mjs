// An Instagram page's recent posts through ScrapeCreators' paged posts door (`GET /v2/instagram/user/posts`), beyond
// the 12 the profile answer embeds. Measured 17/11/2026 on a large public account: 12 posts a page, `more_available`
// and a string `next_max_id` cursor, one credit a page (`credits_charged: 1`). Each item: `id` ("<pk>_<owner>"),
// `code` (the shortcode of `/p/<code>/`), `taken_at` (seconds), `caption.text`, `media_type` (1 image, 2 video,
// 8 carousel), `image_versions2.candidates[{url, width, height}]`, `display_uri`, and `video_url` on a video.
import { SocialStatsError } from './social-stats/providers.mjs'

/** The most posts one profile read keeps (three pages of 12). */
export const INSTAGRAM_POSTS_MAX = 36
/** The most pages of the posts door one profile read asks for, whatever the answers say: each page is one request. */
export const INSTAGRAM_POST_PAGES_MAX = 3
/** Requests one Instagram profile read can make: the profile itself plus every posts page. */
export const INSTAGRAM_PROFILE_REQUESTS_MAX = 1 + INSTAGRAM_POST_PAGES_MAX
/** The posts the profile answer embeds: a read asking for no more (a search checking a page, `limit: 1`) never pages. */
export const INSTAGRAM_EMBEDDED_POSTS = 12
/** Whether a read asking for `limit` posts goes on to the posts door, and is charged as such (`cost-prices.js`). */
export const pagesInstagramPosts = (limit) => !(Number.isFinite(limit) && limit <= INSTAGRAM_EMBEDDED_POSTS)

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const list = (v) => (Array.isArray(v) ? v : [])
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))
const isoOfSeconds = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
    ? new Date(v < 1e12 ? v * 1000 : v).toISOString()
    : undefined

/** The media id the profile answer uses for the same post: the door's `id` without its `_<owner>` part. */
const postIdOf = (it) => str(String(it?.id ?? it?.pk ?? '').split('_')[0])

/** One item of the posts door in the shape the profile reader gives (`{post, image, video}`), or null. */
export function instagramPostOf(it) {
  if (!it || typeof it !== 'object') return null
  const id = postIdOf(it)
  const code = str(it.code)
  if (!id && !code) return null
  const post = compact({
    id,
    url: code ? `https://www.instagram.com/p/${code}/` : str(it.url),
    caption: str(it.caption?.text),
    postedAt: isoOfSeconds(it.taken_at)
  })
  const image = str(list(it.image_versions2?.candidates)[0]?.url) ?? str(it.display_uri)
  const video = it.media_type === 2 || it.video_versions ? str(it.video_url) : undefined
  return { post, image, video }
}

/**
 * Pages through the posts door, newest first, until `max` posts, `pages` pages, `more_available: false` or a
 * missing cursor. `call(path, params)` is the ScrapeCreators request. A page that fails ends the paging and the
 * pages already read stand; a failure of the first page is thrown, so the caller keeps the profile's own posts.
 * @returns {Promise<{items: Array<{post: object, image?: string, video?: string}>, pages: number}>}
 */
export async function pageInstagramPosts(
  call,
  handle,
  { max = INSTAGRAM_POSTS_MAX, pages = INSTAGRAM_POST_PAGES_MAX } = {}
) {
  const items = []
  const seen = new Set()
  let cursor = null
  let read = 0
  while (read < pages && items.length < max) {
    let answer
    try {
      answer = await call('/v2/instagram/user/posts', {
        handle,
        trim: 'true',
        ...(cursor ? { next_max_id: cursor } : {})
      })
    } catch (e) {
      if (!(e instanceof SocialStatsError) || read === 0) throw e
      break
    }
    read += 1
    for (const it of list(answer?.items)) {
      const one = instagramPostOf(it)
      const key = one?.post.id ?? one?.post.url
      if (!one || seen.has(key)) continue
      seen.add(key)
      items.push(one)
      if (items.length >= max) break
    }
    cursor = str(answer?.next_max_id)
    if (answer?.more_available !== true || !cursor) break
  }
  return { items, pages: read }
}
