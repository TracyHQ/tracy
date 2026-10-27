// Only builds whose input, identity and cost were piloted may start from the shared stats queue.
import { parseSocialUrl } from './handles.mjs'
import { postsCadence, SocialStatsError } from './providers.mjs'
import { FACEBOOK_APIFY, facebookApifyInput, facebookApifyStats } from './facebook-apify.mjs'

export const SOCIAL_APIFY = Object.freeze({
  facebook: Object.freeze({
    ...FACEBOOK_APIFY,
    input: facebookApifyInput,
    map: facebookApifyStats,
    datasetLimit: 21
  }),
  instagram: Object.freeze({
    actor: 'apify~instagram-profile-scraper',
    actorId: 'dSCLg0C3YEZ83HzYX',
    build: '0.0.649',
    buildId: 'V3jjPd4R2P3tJePX3',
    maxChargeUsd: 0.01,
    runSecs: 120,
    datasetLimit: 2,
    input: (url) => ({ usernames: [target(url, 'instagram').handle], includeAboutSection: false }),
    map: instagramApifyStats
  }),
  tiktok: Object.freeze({
    actor: 'mu0i~tiktok-profile-scraper',
    actorId: 'fEY2g3CPbexqbQcev',
    build: '0.1.16',
    buildId: 'QCOZiq0j7nt6mr9H7',
    maxChargeUsd: 0.03,
    runSecs: 120,
    datasetLimit: 2,
    input: (url) => ({
      profiles: [`@${target(url, 'tiktok').handle}`],
      includeRecentVideos: true,
      maxRecentVideos: 10
    }),
    map: tiktokApifyStats
  })
})
const bad = (code = 'schema_error') =>
  new SocialStatsError(code, 'apify: unreadable social profile', { provider: 'apify' })
function target(url, network) {
  const p = parseSocialUrl(url, { network })
  if (!p) throw bad()
  return p
}
function numeric(v) {
  if (v === null || v === undefined) return null
  if (!Number.isSafeInteger(v) || v < 0) throw bad()
  return v
}
function identity(v) {
  const s = typeof v === 'string' ? v : Number.isSafeInteger(v) ? String(v) : ''
  if (!/^\d{5,25}$/.test(s)) throw bad()
  return s
}
function one(items) {
  if (!Array.isArray(items) || items.length !== 1 || !items[0] || typeof items[0] !== 'object') throw bad()
  const r = items[0]
  if (r.error || r.errorCode || r._sample || r._diagnostic) throw bad()
  return r
}
function dated(posts, now, limit, fields) {
  if (!Array.isArray(posts) || posts.length > limit) throw bad()
  const seen = new Map()
  for (const p of posts) {
    const id = identity(p?.[fields.id])
    const raw = p?.[fields.at]
    const at = typeof raw === 'number' ? raw * 1000 : Date.parse(raw)
    if (!Number.isFinite(at) || at <= 0 || at > now) throw bad()
    if (seen.has(id) && seen.get(id).at !== at) throw bad()
    seen.set(id, { at, pinned: p.isPinned === true || p.isTop === 1 })
  }
  return [...seen.values()]
}
function result(network, t, r, page, now) {
  const cadence = postsCadence(page, { now, reachedEnd: false })
  return {
    network,
    provider: 'apify',
    platformId: r.id,
    handle: t.handle,
    url: t.url,
    followers: r.followers,
    posts: r.posts,
    lastPostAt: cadence.lastPostAt,
    postsPerMonth: cadence.postsPerMonth,
    coverage: 'partial',
    fetchedAt: new Date(now).toISOString()
  }
}
export function instagramApifyStats(items, url, { now = Date.now() } = {}) {
  const t = target(url, 'instagram'),
    r = one(items)
  const id = identity(r.id)
  if (
    r.username?.toLowerCase() !== t.handle ||
    target(r.url ?? '', 'instagram').handle !== t.handle ||
    target(r.inputUrl ?? '', 'instagram').handle !== t.handle
  )
    throw bad()
  const followers = numeric(r.followersCount),
    posts = numeric(r.postsCount)
  // A private profile's empty list is not evidence of no posts. Sparse public output is partial too.
  const page =
    r.private === true || !Array.isArray(r.latestPosts) || (r.latestPosts.length === 0 && posts !== 0)
      ? null
      : dated(r.latestPosts, now, 12, { id: 'id', at: 'timestamp' })
  return result('instagram', t, { id, followers, posts }, page, now)
}
export function tiktokApifyStats(items, url, { now = Date.now() } = {}) {
  const t = target(url, 'tiktok'),
    r = one(items)
  const id = identity(r.userId)
  if (
    r.username?.toLowerCase() !== t.handle ||
    target(r.profileUrl ?? '', 'tiktok').handle !== t.handle ||
    r.input?.replace(/^@/, '').toLowerCase() !== t.handle
  )
    throw bad()
  const followers = numeric(r.followerCount),
    posts = numeric(r.videoCount)
  const page =
    r.isPrivate === true || !Array.isArray(r.recentVideos) || (r.recentVideos.length === 0 && posts !== 0)
      ? null
      : dated(r.recentVideos, now, 10, { id: 'videoId', at: 'createdAt' })
  if (followers === 0 && posts === 0 && page?.length === 0) throw bad()
  return result('tiktok', t, { id, followers, posts }, page, now)
}
