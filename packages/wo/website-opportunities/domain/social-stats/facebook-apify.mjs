// Pinned to the build piloted on 20 October 2026. The operator cannot supply another actor or URL.
import { parseSocialUrl } from './handles.mjs'
import { SocialStatsError, postsCadence } from './providers.mjs'

export const FACEBOOK_APIFY = Object.freeze({
  actor: 'topapi~facebook-page-posts-scraper',
  actorId: 'kiZdaJePboSkd43aZ',
  build: '0.1.9',
  buildId: '9bk7YOGQwABySkXsL',
  limit: 20,
  maxChargeUsd: 0.03,
  runSecs: 120
})

const bad = () =>
  new SocialStatsError('schema_error', 'apify: unreadable Facebook stats', { provider: 'apify' })
const profileKey = (url) => {
  const p = parseSocialUrl(url ?? '', { network: 'facebook' })
  return p?.pageId ? `id:${p.pageId}` : (p?.pageSlug?.toLowerCase() ?? null)
}

export function facebookApifyInput(url) {
  const p = parseSocialUrl(url ?? '', { network: 'facebook' })
  if (!p) throw bad()
  // No date filter: an inactive page still has a latest post, possibly older than 90 days.
  return { startUrls: [p.url], maxPosts: FACEBOOK_APIFY.limit, includePostDetails: false }
}

/** Only observed post rows count. Empty/diagnostic output says nothing about page existence. */
export function facebookApifyStats(items, url, { now = Date.now() } = {}) {
  if (!Array.isArray(items) || items.length === 0 || items.length > FACEBOOK_APIFY.limit) throw bad()
  const target = parseSocialUrl(url, { network: 'facebook' })
  const expected = profileKey(url)
  const posts = new Map()
  let pageId = null
  let followers = null
  for (const row of items) {
    if (!row || typeof row !== 'object' || row.error || row._sample || row._diagnostic || row.errorCode)
      throw bad()
    if (profileKey(row.input_url) !== expected || !/^\d+$/.test(String(row.source_id ?? ''))) throw bad()
    if (target?.pageId && String(row.source_id) !== target.pageId) throw bad()
    if (!parseSocialUrl(row.source_url ?? '', { network: 'facebook' })) throw bad()
    if (!target?.pageId && profileKey(row.source_url) !== expected) throw bad()
    if (pageId !== null && pageId !== String(row.source_id)) throw bad()
    pageId = String(row.source_id)
    const count = row.page_followers
    if (count !== null && count !== undefined) {
      if (!Number.isSafeInteger(count) || count < 0 || (followers !== null && followers !== count))
        throw bad()
      followers = count
    }
    const id = String(row.post_id ?? '')
    const at = Date.parse(row.published_at)
    if (!/^\d+$/.test(id) || !Number.isFinite(at) || at > now || at <= 0) throw bad()
    if (
      row.timestamp !== undefined &&
      (!Number.isFinite(row.timestamp) || Math.abs(row.timestamp * 1000 - at) > 1000)
    )
      throw bad()
    if (posts.has(id) && posts.get(id).at !== at) throw bad()
    posts.set(id, { at })
  }
  const cadence = postsCadence([...posts.values()], { now, reachedEnd: false })
  return {
    network: 'facebook',
    provider: 'apify',
    platformId: pageId,
    handle: target?.pageSlug ?? null,
    url: target.url,
    followers,
    posts: null,
    lastPostAt: cadence.lastPostAt,
    postsPerMonth: cadence.postsPerMonth,
    // The dataset has no verified exhaustion/pinned marker; even an old row cannot prove depth.
    coverage: 'partial',
    fetchedAt: new Date(now).toISOString()
  }
}
