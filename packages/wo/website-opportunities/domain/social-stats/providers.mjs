// One adapter per (network, provider): a profile URL or handle → normalised follower and posting figures.
// Endpoints, shapes and quirks were surveyed with real keys on 19/10/2026.
import { parseSocialUrl } from './handles.mjs'

export const SOCIAL_STATS_ERROR_CODES = Object.freeze([
  'credential_missing',
  'subscription_missing',
  'rate_limited',
  'quota_exhausted',
  'blocked',
  'schema_error',
  'not_found',
  'timeout',
  'provider_error'
])

export class SocialStatsError extends Error {
  constructor(code, message, { provider, status } = {}) {
    super(message)
    this.name = 'SocialStatsError'
    this.code = code
    if (provider) this.provider = provider
    if (status) this.status = status
  }
}

export const RAPIDAPI_HOSTS = Object.freeze({
  scraper3: 'facebook-scraper3.p.rapidapi.com',
  looter2: 'instagram-looter2.p.rapidapi.com',
  stable: 'instagram-scraper-stable-api.p.rapidapi.com',
  api23: 'tiktok-api23.p.rapidapi.com',
  'yt-api': 'yt-api.p.rapidapi.com'
})
const YT_API = 'https://www.googleapis.com/youtube/v3'
const DAY_MS = 86_400_000
const WINDOW_DAYS = 90
// Measured 19/10: Stable answered in 14.8 s, Facebook in 7.5 s.
const DEFAULT_TIMEOUT_MS = 20_000

// ── transport ─────────────────────────────────────────────────────────────────────────────────────

function scrub(text, key) {
  let s = String(text ?? '')
  if (key && key.length >= 4) s = s.split(key).join('[redacted]')
  return s.slice(0, 300)
}

function rapidCode(status, msg) {
  if (status === 401) return 'credential_missing'
  if (status === 403) return /not subscribed/i.test(msg) ? 'subscription_missing' : 'blocked'
  if (status === 429) return /quota/i.test(msg) ? 'quota_exhausted' : 'rate_limited'
  return 'provider_error'
}

function googleCode(status, json) {
  const e = json?.error ?? {}
  const reasons = [
    ...(Array.isArray(e.errors) ? e.errors : []),
    ...(Array.isArray(e.details) ? e.details : [])
  ].map((x) => String(x?.reason ?? ''))
  const has = (re) => reasons.some((r) => re.test(r))
  if (status === 401 || has(/^(API_KEY_INVALID|keyInvalid)$/)) return 'credential_missing'
  if (has(/^(quotaExceeded|dailyLimitExceeded)$/)) return 'quota_exhausted'
  if (status === 429 || has(/^(rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED)$/))
    return 'rate_limited'
  if (status === 403) return 'blocked'
  if (status === 404) return 'not_found'
  return 'provider_error'
}

async function request(url, init, ctx) {
  const { provider, key } = ctx
  const signal = AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let text
  let res
  try {
    res = await (ctx.fetch ?? globalThis.fetch)(url, { ...init, signal })
    text = await res.text()
  } catch (e) {
    if (signal.aborted || e?.name === 'TimeoutError' || e?.name === 'AbortError')
      throw new SocialStatsError(
        'timeout',
        `${provider}: no answer within ${ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms`,
        { provider }
      )
    throw new SocialStatsError('provider_error', `${provider}: ${scrub(e?.message, key)}`, { provider })
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  if (!res.ok) {
    const msg = scrub(json?.message ?? json?.error?.message ?? text, key)
    const code = ctx.google ? googleCode(res.status, json) : rapidCode(res.status, msg)
    throw new SocialStatsError(code, `${provider}: HTTP ${res.status} ${msg}`, {
      provider,
      status: res.status
    })
  }
  if (json === undefined)
    throw new SocialStatsError('schema_error', `${provider}: answer is not JSON`, { provider })
  return json
}

function rapid(ctx, path, params, { form } = {}) {
  const host = RAPIDAPI_HOSTS[ctx.provider]
  const headers = { 'X-RapidAPI-Key': ctx.key, 'X-RapidAPI-Host': host }
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  if (form) {
    return request(
      `https://${host}${path}${qs}`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString()
      },
      ctx
    )
  }
  return request(`https://${host}${path}${qs}`, { method: 'GET', headers }, ctx)
}

const google = (ctx, path, params) =>
  request(
    `${YT_API}/${path}?${new URLSearchParams(params)}`,
    { method: 'GET', headers: { 'X-goog-api-key': ctx.key } },
    { ...ctx, google: true }
  )

// ── normalising ───────────────────────────────────────────────────────────────────────────────────

function count(v) {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v
  return Number.isFinite(n) && n >= 0 ? n : null
}

function epochMs(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
  }
  return null
}

const text = (v) =>
  typeof v === 'string' && v.trim() ? v.trim() : v === undefined || v === null ? null : String(v)

/**
 * Posting cadence from one page of posts (`[{at: epochMs, pinned?}]`, or null when the profile's posts were not
 * readable). `postsPerMonth` = posts in the last 90 days ÷ 3; `windowCovered` is false when the page stops short
 * of 90 days and more posts exist (the figure is then a lower bound). A pinned post proves nothing about depth.
 */
export function postsCadence(posts, { now, reachedEnd }) {
  if (!Array.isArray(posts)) return { lastPostAt: null, postsPerMonth: null, windowCovered: false }
  const dated = posts.filter((p) => Number.isFinite(p?.at))
  const since = now - WINDOW_DAYS * DAY_MS
  const last = dated.length ? Math.max(...dated.map((p) => p.at)) : null
  const unpinned = dated.filter((p) => !p.pinned).map((p) => p.at)
  const oldest = unpinned.length ? Math.min(...unpinned) : null
  const inWindow = dated.filter((p) => p.at >= since).length
  return {
    lastPostAt: last === null ? null : new Date(last).toISOString(),
    postsPerMonth: Math.round((inWindow / (WINDOW_DAYS / 30)) * 10) / 10,
    windowCovered: Boolean(reachedEnd) || (oldest !== null && oldest < since)
  }
}

function result(ctx, { platformId, handle, url, followers, posts, page, reachedEnd }) {
  const cadence = postsCadence(page, { now: ctx.now, reachedEnd })
  return {
    network: ctx.network,
    provider: ctx.provider,
    platformId: text(platformId),
    handle: text(handle),
    url,
    followers,
    posts,
    lastPostAt: cadence.lastPostAt,
    postsPerMonth: cadence.postsPerMonth,
    coverage: followers !== null && cadence.windowCovered ? 'complete' : 'partial',
    fetchedAt: new Date(ctx.now).toISOString()
  }
}

function need(value, ctx, what) {
  if (value === null || value === undefined)
    throw new SocialStatsError('schema_error', `${ctx.provider}: answer has no ${what}`, {
      provider: ctx.provider
    })
  return value
}

const notFound = (ctx, why) =>
  new SocialStatsError('not_found', `${ctx.provider}: ${why}`, { provider: ctx.provider })

// ── adapters ──────────────────────────────────────────────────────────────────────────────────────

async function facebookScraper3(ctx, t) {
  const d = await rapid(ctx, '/page/details', { url: t.url })
  const r = d?.results
  // A missing page and a private one answer the same 200 {type:"private_page"}.
  if (r?.type === 'private_page') throw notFound(ctx, 'page missing or private')
  // A renamed or deleted page answers 200 with an empty results object (7bridgeshoian, 19/10/2026).
  if (r && typeof r === 'object' && Object.keys(r).length === 0) throw notFound(ctx, 'page gone')
  const pageId = need(text(r?.page_id), ctx, 'page_id')
  const p = await rapid(ctx, '/page/posts', { page_id: pageId })
  const list = need(Array.isArray(p?.results) ? p.results : null, ctx, 'posts')
  return result(ctx, {
    platformId: pageId,
    handle: t.pageSlug ?? null,
    url: t.url,
    followers: count(r.followers),
    posts: null,
    page: list.map((x) => ({ at: epochMs(x?.timestamp) })),
    reachedEnd: !p.cursor
  })
}

async function instagramLooter2(ctx, t) {
  const d = await rapid(ctx, '/profile', { username: t.handle })
  if (d?.status === false) {
    if (/does not exist/i.test(String(d.errorMessage))) throw notFound(ctx, 'account does not exist')
    throw new SocialStatsError('provider_error', `${ctx.provider}: ${scrub(d.errorMessage, ctx.key)}`, {
      provider: ctx.provider
    })
  }
  const followers = need(count(d?.edge_followed_by?.count), ctx, 'follower count')
  const media = d.edge_owner_to_timeline_media ?? {}
  const edges = Array.isArray(media.edges) ? media.edges : []
  // Media count 0 with no posts for an account people follow: Looter2 did not read the media (dev, 19/10/2026), so unknown.
  const unread = count(media.count) === 0 && edges.length === 0 && followers > 0
  const posts = unread ? null : count(media.count)
  return result(ctx, {
    platformId: d.id,
    handle: d.username ?? t.handle,
    url: t.url,
    followers,
    posts,
    page:
      d.is_private || unread
        ? null
        : edges.map((e) => ({
            at: epochMs(e?.node?.taken_at_timestamp),
            pinned: Array.isArray(e?.node?.pinned_for_users) && e.node.pinned_for_users.length > 0
          })),
    reachedEnd: posts !== null && edges.length >= posts
  })
}

async function instagramStable(ctx, t) {
  const d = await rapid(ctx, '/ig_get_fb_profile_hover.php', { username_or_url: t.handle })
  // Its only error shape: HTTP 200 with ["Some error occurred. Please try again later."], also for a missing handle.
  if (Array.isArray(d))
    throw new SocialStatsError('provider_error', `${ctx.provider}: ${scrub(d.join(' '), ctx.key)}`, {
      provider: ctx.provider
    })
  const u = need(d?.user_data, ctx, 'user_data')
  const followers = need(count(u.follower_count), ctx, 'follower count')
  const posts = count(u.media_count)
  let page = null
  let reachedEnd = false
  if (posts === 0) {
    page = []
    reachedEnd = true
  } else if (!u.is_private) {
    const p = await rapid(ctx, '/get_ig_user_posts.php', null, {
      form: { username_or_url: t.handle, amount: '12' }
    })
    const list = need(Array.isArray(p?.posts) ? p.posts : null, ctx, 'posts')
    page = list.map((x) => ({ at: epochMs(x?.node?.taken_at) }))
    reachedEnd = !p.pagination_token || (posts !== null && list.length >= posts)
  }
  return result(ctx, {
    platformId: u.pk ?? u.id,
    handle: u.username ?? t.handle,
    url: t.url,
    followers,
    posts,
    page,
    reachedEnd
  })
}

async function tiktokApi23(ctx, t) {
  const d = await rapid(ctx, '/api/user/info', { uniqueId: t.handle })
  const user = d?.userInfo?.user ?? {}
  // 10221: "user does not exist" (measured with a made-up handle; the user object comes back empty).
  if (d?.statusCode === 10221 || (!user.id && !user.secUid)) throw notFound(ctx, 'user does not exist')
  if (d?.statusCode)
    throw new SocialStatsError('provider_error', `${ctx.provider}: statusCode ${d.statusCode}`, {
      provider: ctx.provider
    })
  const stats = d.userInfo.stats ?? {}
  const followers = need(count(stats.followerCount), ctx, 'follower count')
  const posts = count(stats.videoCount)
  if (followers === 0 && posts === 0)
    throw new SocialStatsError('schema_error', 'api23: unverified all-zero profile', {
      provider: ctx.provider
    })
  let page = null
  let reachedEnd = false
  if (posts === 0) {
    page = []
    reachedEnd = true
  } else if (!user.privateAccount) {
    const p = await rapid(ctx, '/api/user/posts', {
      secUid: need(text(user.secUid), ctx, 'secUid'),
      count: '35',
      cursor: '0'
    })
    const list = need(Array.isArray(p?.data?.itemList) ? p.data.itemList : null, ctx, 'itemList')
    page = list.map((x) => ({ at: epochMs(x?.createTime), pinned: Boolean(x?.isPinnedItem) }))
    reachedEnd = p.data.hasMore === false
  }
  return result(ctx, {
    platformId: user.id,
    handle: user.uniqueId ?? t.handle,
    url: `https://www.tiktok.com/@${user.uniqueId ?? t.handle}`,
    followers,
    posts,
    page,
    reachedEnd
  })
}

function scrapeCreatorsCode(status, body) {
  if (status === 401) return 'credential_missing'
  if (status === 402) return 'quota_exhausted'
  if (status === 403) return 'blocked'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  if (/credit|payment/i.test(String(body?.message ?? body?.error ?? ''))) return 'quota_exhausted'
  return 'provider_error'
}

/** One ScrapeCreators GET; `ctx` = `{provider, key, fetch, timeoutMs}`. Throws a SocialStatsError. */
export async function scrapeCreators(ctx, path, params) {
  const url = new URL(`https://api.scrapecreators.com${path}`)
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, String(value))
  const signal = AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let res
  try {
    res = await (ctx.fetch ?? globalThis.fetch)(url, {
      headers: { 'x-api-key': ctx.key, accept: 'application/json' },
      redirect: 'error',
      signal
    })
  } catch (e) {
    if (signal.aborted || e?.name === 'TimeoutError' || e?.name === 'AbortError')
      throw new SocialStatsError('timeout', 'scrapecreators: request timed out', { provider: ctx.provider })
    throw new SocialStatsError('provider_error', 'scrapecreators: request failed', { provider: ctx.provider })
  }
  const body = await res.json().catch(() => undefined)
  if (!res.ok)
    throw new SocialStatsError(scrapeCreatorsCode(res.status, body), `scrapecreators: HTTP ${res.status}`, {
      provider: ctx.provider,
      status: res.status
    })
  if (!body || body.success !== true)
    throw new SocialStatsError('schema_error', 'scrapecreators: unsuccessful response', {
      provider: ctx.provider
    })
  return body
}

function scResult(ctx, t, { platformId, handle, followers, posts, dates, reachedEnd }) {
  const page = Array.isArray(dates) ? dates.map((at) => ({ at: epochMs(at) })) : null
  return result(ctx, {
    platformId,
    handle,
    url: t.url,
    followers: count(followers),
    posts: count(posts),
    page,
    reachedEnd: Boolean(reachedEnd)
  })
}

async function facebookScrapeCreators(ctx, t) {
  const profile = await scrapeCreators(ctx, '/v1/facebook/profile', { url: t.url, cache_max_age: '7d' })
  const followers =
    profile.followers ?? profile.followerCount ?? profile.followersCount ?? profile.followers_count
  const pageId = profile.id ?? profile.pageId ?? profile.page_id ?? profile.profile?.id
  if (!pageId)
    throw new SocialStatsError('schema_error', 'scrapecreators: Facebook profile has no page id', {
      provider: ctx.provider
    })
  const postsResponse = await scrapeCreators(ctx, '/v1/facebook/profile/posts', {
    url: t.url,
    cache_max_age: '7d'
  })
  const posts = postsResponse.posts ?? postsResponse.data ?? postsResponse.results
  if (!Array.isArray(posts))
    throw new SocialStatsError('schema_error', 'scrapecreators: Facebook profile posts missing', {
      provider: ctx.provider
    })
  return scResult(ctx, t, {
    platformId: pageId,
    handle: t.pageSlug ?? null,
    followers,
    posts: profile.postCount ?? profile.postsCount ?? profile.posts_count ?? null,
    dates: posts.map(
      (post) => post.publishTime ?? post.created_at ?? post.createdAt ?? post.timestamp ?? post.creation_time
    ),
    reachedEnd: Boolean(postsResponse.next_page_id === null && postsResponse.cursor === null)
  })
}

async function instagramScrapeCreators(ctx, t) {
  const d = await scrapeCreators(ctx, '/v1/instagram/profile', {
    handle: t.handle,
    trim: 'true',
    cache_max_age: '7d'
  })
  const user = d.data?.user
  if (!user || user.id == null) {
    if (
      d.error === 'not_found' ||
      d.message === 'Profile is private' ||
      d.message === "Account doesn't exist"
    )
      throw notFound(ctx, 'profile is unavailable or private')
    throw new SocialStatsError('schema_error', 'scrapecreators: Instagram profile data missing', {
      provider: ctx.provider
    })
  }
  const media = user.edge_owner_to_timeline_media ?? {}
  const edges = Array.isArray(media.edges) ? media.edges : []
  const followers = media.owner?.edge_followed_by?.count ?? user.edge_followed_by?.count
  return scResult(ctx, t, {
    platformId: user.id,
    handle: user.username ?? t.handle,
    followers,
    posts: media.count,
    dates: user.is_private ? null : edges.map((edge) => edge.node?.taken_at_timestamp ?? edge.node?.taken_at),
    reachedEnd: media.page_info?.has_next_page === false || edges.length >= Number(media.count ?? Infinity)
  })
}

async function tiktokScrapeCreators(ctx, t) {
  const profile = await scrapeCreators(ctx, '/v1/tiktok/profile', { handle: t.handle, cache_max_age: '7d' })
  const author = profile.author ?? profile.user ?? profile.data?.user ?? profile
  const platformId = author.id ?? author.secUid ?? author.user_id ?? author.userId
  if (!platformId)
    throw new SocialStatsError('schema_error', 'scrapecreators: TikTok profile id missing', {
      provider: ctx.provider
    })
  const videosResponse = await scrapeCreators(ctx, '/v3/tiktok/profile/videos', {
    handle: t.handle,
    region: 'US',
    sort_by: 'latest',
    trim: 'true',
    cache_max_age: '7d'
  })
  const videos =
    videosResponse.aweme_list ??
    videosResponse.videos ??
    videosResponse.data?.videos ??
    videosResponse.data ??
    videosResponse.items
  if (!Array.isArray(videos))
    throw new SocialStatsError('schema_error', 'scrapecreators: TikTok videos missing', {
      provider: ctx.provider
    })
  const normalized = scResult(ctx, t, {
    platformId,
    handle: author.uniqueId ?? author.username ?? author.handle ?? t.handle,
    followers:
      profile.stats?.followerCount ??
      author.followers ??
      author.follower_count ??
      author.followerCount ??
      author.stats?.followerCount,
    posts: profile.stats?.videoCount ?? author.video_count ?? author.videoCount ?? author.stats?.videoCount,
    dates: videos.map(
      (video) =>
        video.create_time_utc ??
        video.createTime ??
        video.create_time ??
        video.created_at ??
        video.create_time_iso
    ),
    reachedEnd:
      videosResponse.hasMore === false || videosResponse.has_more === false || videosResponse.has_more === 0
  })
  return { ...normalized, coverage: 'partial' }
}

const YT_CHANNEL_PARTS = 'snippet,statistics,contentDetails'

async function youtubeOfficial(ctx, t) {
  const lookups = t.channelId
    ? [{ id: t.channelId }]
    : t.handle
      ? [{ forHandle: `@${t.handle}` }]
      : t.legacy === 'user'
        ? [{ forUsername: t.name }]
        : // A /c/ slug need not belong to the same channel as the current handle or legacy username.
          []
  if (t.legacy === 'c')
    throw new SocialStatsError('schema_error', 'official: custom URL requires verified resolution', {
      provider: ctx.provider
    })
  let ch
  for (const q of lookups) {
    const d = await google(ctx, 'channels', { part: YT_CHANNEL_PARTS, ...q })
    ch = Array.isArray(d?.items) ? d.items[0] : undefined
    if (ch) break
  }
  if (!ch) throw notFound(ctx, 'no such channel')
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(ch.id ?? '') || (t.channelId && ch.id !== t.channelId))
    throw new SocialStatsError('schema_error', 'official: channel identity mismatch', {
      provider: ctx.provider
    })
  const s = ch.statistics ?? {}
  const followers = s.hiddenSubscriberCount ? null : count(s.subscriberCount)
  const posts = count(s.videoCount)
  const uploads = text(ch.contentDetails?.relatedPlaylists?.uploads)
  let page = null
  let reachedEnd = false
  if (posts === 0) {
    page = []
    reachedEnd = true
  } else if (uploads) {
    const p = await google(ctx, 'playlistItems', {
      part: 'contentDetails',
      playlistId: uploads,
      maxResults: '50'
    })
    const items = need(Array.isArray(p?.items) ? p.items : null, ctx, 'playlist items')
    const dated = items.map((i) => ({
      at: epochMs(i?.contentDetails?.videoPublishedAt ?? i?.snippet?.publishedAt)
    }))
    page = items.length && dated.every((p) => p.at !== null && p.at <= ctx.now) ? dated : null
    reachedEnd = page !== null && !p.nextPageToken
  }
  const handle = t.handle ?? (text(ch.snippet?.customUrl)?.replace(/^@/, '') || null)
  return result(ctx, {
    platformId: ch.id,
    handle,
    url: `https://www.youtube.com/channel/${ch.id}`,
    followers,
    posts,
    page,
    reachedEnd
  })
}

function ytApiError(ctx, d) {
  if (!d?.error) return
  const msg = scrub(d.msg ?? d.error, ctx.key)
  // yt-api reports errors inside an HTTP 200: {"error":"ERROR","code":"403","msg":"This channel does not exist."}.
  if (/does not exist|not found/i.test(msg)) throw notFound(ctx, msg)
  throw new SocialStatsError('provider_error', `${ctx.provider}: ${msg}`, { provider: ctx.provider })
}

async function youtubeYtApi(ctx, t) {
  let id = t.channelId
  if (!id) {
    const r = await rapid(ctx, '/resolve', { url: t.url })
    ytApiError(ctx, r)
    id = text(r?.browseId)
    if (!id?.startsWith('UC')) throw notFound(ctx, 'URL does not resolve to a channel')
  }
  const d = await rapid(ctx, '/channel/videos', { id })
  ytApiError(ctx, d)
  const m = need(d?.meta, ctx, 'meta')
  if (m.channelId && m.channelId !== id)
    throw new SocialStatsError('schema_error', 'yt-api: channel identity mismatch', {
      provider: ctx.provider
    })
  const list = Array.isArray(d.data) ? d.data.filter((v) => v?.type === 'video') : []
  const stat = result(ctx, {
    platformId: m.channelId ?? id,
    handle: text(m.channelHandle)?.replace(/^@/, '') ?? t.handle ?? null,
    url: `https://www.youtube.com/channel/${m.channelId ?? id}`,
    followers: count(m.subscriberCount),
    posts: count(m.videosCount),
    // `publishedAt` is derived from "3 weeks ago" text: day-accurate at best, coarser for older videos.
    page: list.map((v) => ({ at: epochMs(v.publishedAt ?? v.publishDate) })),
    reachedEnd: false
  })
  return { ...stat, coverage: 'partial' }
}

// ── registry ──────────────────────────────────────────────────────────────────────────────────────

function adapter(network, provider, credential, run) {
  return Object.freeze({
    network,
    provider,
    credential,
    /** `{url}` or `{handle}` → a normalised stat, or throws a SocialStatsError whose `code` is in SOCIAL_STATS_ERROR_CODES. */
    async fetchProfile({ url, handle } = {}, deps = {}) {
      if (!deps.key)
        throw new SocialStatsError('credential_missing', `${provider}: no ${credential} key`, { provider })
      const t = parseSocialUrl(url ?? handle ?? '', { network })
      if (!t) throw new SocialStatsError('not_found', `${provider}: not a ${network} profile`, { provider })
      const ctx = {
        network,
        provider,
        key: deps.key,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs,
        now: deps.now?.() ?? Date.now()
      }
      return run(ctx, t)
    }
  })
}

export const PROVIDERS = Object.freeze({
  'facebook/scrapecreators': adapter('facebook', 'scrapecreators', 'scrapecreators', facebookScrapeCreators),
  'instagram/scrapecreators': adapter(
    'instagram',
    'scrapecreators',
    'scrapecreators',
    instagramScrapeCreators
  ),
  'tiktok/scrapecreators': adapter('tiktok', 'scrapecreators', 'scrapecreators', tiktokScrapeCreators),
  'facebook/scraper3': adapter('facebook', 'scraper3', 'rapidapi', facebookScraper3),
  'instagram/looter2': adapter('instagram', 'looter2', 'rapidapi', instagramLooter2),
  'instagram/stable': adapter('instagram', 'stable', 'rapidapi', instagramStable),
  'tiktok/api23': adapter('tiktok', 'api23', 'rapidapi', tiktokApi23),
  'youtube/official': adapter('youtube', 'official', 'google', youtubeOfficial),
  'youtube/yt-api': adapter('youtube', 'yt-api', 'rapidapi', youtubeYtApi)
})
