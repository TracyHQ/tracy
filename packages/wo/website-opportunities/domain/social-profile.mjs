// A place's social page for its profile (name, about, contact, rating, pictures, recent posts), through the
// same providers and order as social stats. "Enough" differs: stats need follower and posting figures, a
// profile needs the page itself (shared research contract §4).
import { apifyCollect, APIFY_ACTORS } from './apify.mjs'
import { collectYoutubePublic } from './youtube-public.mjs'
import { providerAnswer, runInOrder } from './capabilities.mjs'
import { parseSocialUrl } from './social-stats/handles.mjs'
import { scrapeCreators, SocialStatsError } from './social-stats/providers.mjs'

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const list = (v) => (Array.isArray(v) ? v : [])
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))

function count(v) {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined
}

function isoDate(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0)
    return new Date(v < 1e12 ? v * 1000 : v).toISOString()
  const s = str(v)
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/** A rating as the page shows it: a number when it is one, else the provider's own words ("95% recommend"). */
function rating(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = str(v)
  if (!s) return undefined
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : s
}

/** A SocialStatsError code → the contract's reason. A key that was sent and refused is `credential_invalid`. */
function reasonOf(code) {
  if (code === 'credential_missing' || code === 'subscription_missing') return 'credential_invalid'
  if (code === 'quota_exhausted' || code === 'rate_limited') return 'quota'
  if (code === 'timeout') return 'timeout'
  return 'provider_error'
}

/** An Apify collect result's failure → the contract's reason, or null when it is not one. */
function apifyReason(r) {
  if (['complete', 'partial'].includes(r.status) && !r.reason) return null
  if (r.reason === 'credential_missing' || r.reason === 'credential_invalid') return r.reason
  if (r.reason === 'quota' || r.reason === 'rate_limited') return 'quota'
  if (r.reason === 'timeout' || r.reason === 'network') return 'timeout'
  return 'provider_error'
}

// ── ScrapeCreators ────────────────────────────────────────────────────────────────────────────────

function picture(media, url, extra) {
  const u = str(url)
  if (u && !media.some((m) => m.url === u)) media.push(compact({ url: u, kind: 'image', ...extra }))
}

async function scFacebook(ctx, t, { limit }) {
  const page = await scrapeCreators(ctx, '/v1/facebook/profile', { url: t.url, cache_max_age: '7d' })
  const media = []
  // `profilePhoto.url` is the photo's PAGE (facebook.com/photo/?fbid=…), not an image: the files are profilePic*.
  const profilePic =
    str(page.profilePicLarge) ??
    str(page.profilePicMedium) ??
    str(page.profilePicSmall) ??
    str(page.profilePicture)
  const cover = str(page.coverPhoto?.photo?.image?.uri) ?? str(page.coverPhoto?.url)
  const photos = [profilePic, cover].filter(Boolean)
  // `role` says which of the page's own pictures this is: the profile photo is the logo candidate.
  const roles = new Map([
    [profilePic, 'profile'],
    [cover, 'cover']
  ])
  for (const url of photos) picture(media, url, { sourceUrl: t.url, role: roles.get(url) })
  const posts = []
  // The page is the profile; its posts are a second call whose failure leaves the page standing.
  try {
    const answer = await scrapeCreators(ctx, '/v1/facebook/profile/posts', {
      url: t.url,
      cache_max_age: '7d'
    })
    for (const it of list(answer.posts ?? answer.data ?? answer.results).slice(0, limit)) {
      const post = compact({
        id: str(it.id) ?? str(it.post_id),
        url: str(it.url) ?? str(it.permalink),
        caption: str(it.text) ?? str(it.message),
        postedAt: isoDate(it.publishTime ?? it.created_at ?? it.timestamp)
      })
      posts.push(post)
      for (const img of [it.image, it.imageUrl, ...list(it.images)])
        picture(media, typeof img === 'object' ? (img?.url ?? img?.uri) : img, {
          sourceUrl: post.url,
          postId: post.id,
          postedAt: post.postedAt,
          caption: post.caption
        })
      const video = str(it.videoUrl) ?? str(it.video?.url)
      if (video)
        media.push(
          compact({
            url: video,
            kind: 'video',
            sourceUrl: post.url,
            postId: post.id,
            postedAt: post.postedAt
          })
        )
    }
  } catch (e) {
    if (!(e instanceof SocialStatsError)) throw e
  }
  return {
    profile: compact({
      name: str(page.name),
      bio: str(page.pageIntro) ?? str(page.intro) ?? str(page.about) ?? str(page.description),
      category:
        str(page.category) ?? (list(page.categories).map(str).filter(Boolean).join(', ') || undefined),
      phone: str(page.phone),
      email: str(page.email),
      address: str(page.address),
      website: str(page.website),
      rating: rating(page.rating),
      ratingCount: count(page.ratingCount ?? page.reviewCount),
      likes: count(page.likeCount ?? page.likes),
      followers: count(page.followerCount ?? page.followers ?? page.followersCount),
      priceRange: str(page.priceRange),
      platformId: str(String(page.id ?? '')),
      handle: t.pageSlug ?? undefined,
      url: t.url,
      photos: photos.length ? photos : undefined
    }),
    posts,
    media
  }
}

async function scInstagram(ctx, t, { limit }) {
  const answer = await scrapeCreators(ctx, '/v1/instagram/profile', {
    handle: t.handle,
    trim: 'true',
    cache_max_age: '7d'
  })
  const user = answer.data?.user
  if (!user || user.id == null)
    throw new SocialStatsError('not_found', 'scrapecreators: profile is unavailable or private', {
      provider: ctx.provider
    })
  const timeline = user.edge_owner_to_timeline_media ?? {}
  const media = []
  picture(media, user.profile_pic_url_hd ?? user.profile_pic_url, { sourceUrl: t.url, role: 'profile' })
  const posts = []
  for (const { node } of list(timeline.edges)
    .slice(0, limit)
    .filter((e) => e?.node)) {
    const post = compact({
      id: str(String(node.id ?? '')),
      url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : undefined,
      caption: str(node.edge_media_to_caption?.edges?.[0]?.node?.text),
      postedAt: isoDate(node.taken_at_timestamp ?? node.taken_at)
    })
    posts.push(post)
    picture(media, node.display_url, {
      sourceUrl: post.url,
      postId: post.id,
      postedAt: post.postedAt,
      caption: post.caption
    })
    if (node.is_video && str(node.video_url))
      media.push(
        compact({
          url: node.video_url,
          kind: 'video',
          sourceUrl: post.url,
          postId: post.id,
          postedAt: post.postedAt
        })
      )
  }
  return {
    profile: compact({
      name: str(user.full_name) ?? str(user.username),
      bio: str(user.biography),
      category: str(user.category_name),
      phone: str(user.business_phone_number),
      email: str(user.business_email),
      website: str(user.external_url),
      followers: count(user.edge_followed_by?.count),
      posts: count(timeline.count),
      handle: str(user.username) ?? t.handle,
      platformId: str(String(user.id)),
      url: t.url
    }),
    posts,
    media
  }
}

async function scTiktok(ctx, t, { limit }) {
  const answer = await scrapeCreators(ctx, '/v1/tiktok/profile', { handle: t.handle, cache_max_age: '7d' })
  const user = answer.user ?? answer.data?.user ?? {}
  const stats = answer.stats ?? user.stats ?? {}
  if (!user.id && !user.secUid && !user.uniqueId)
    throw new SocialStatsError('not_found', 'scrapecreators: TikTok user missing', { provider: ctx.provider })
  const handle = str(user.uniqueId) ?? t.handle
  const media = []
  picture(media, user.avatarLarger ?? user.avatarMedium, { sourceUrl: t.url, role: 'profile' })
  const posts = []
  try {
    const videos = await scrapeCreators(ctx, '/v3/tiktok/profile/videos', {
      handle: t.handle,
      sort_by: 'latest',
      trim: 'true',
      cache_max_age: '7d'
    })
    for (const v of list(videos.aweme_list ?? videos.videos ?? videos.items).slice(0, limit)) {
      const id = str(String(v.aweme_id ?? v.id ?? ''))
      const post = compact({
        id,
        url: id ? `https://www.tiktok.com/@${handle}/video/${id}` : undefined,
        caption: str(v.desc),
        postedAt: isoDate(v.create_time ?? v.createTime)
      })
      posts.push(post)
      picture(media, v.video?.cover?.url_list?.[0] ?? v.video?.cover, {
        sourceUrl: post.url,
        postId: post.id,
        postedAt: post.postedAt,
        caption: post.caption
      })
    }
  } catch (e) {
    if (!(e instanceof SocialStatsError)) throw e
  }
  return {
    profile: compact({
      name: str(user.nickname) ?? handle,
      bio: str(user.signature),
      website: str(user.bioLink?.link),
      followers: count(stats.followerCount),
      posts: count(stats.videoCount),
      likes: count(stats.heartCount ?? stats.heart),
      handle,
      platformId: str(String(user.id ?? '')),
      url: `https://www.tiktok.com/@${handle}`
    }),
    posts,
    media
  }
}

const SC_OPERATIONS = Object.freeze({
  facebook: 'facebook-profile',
  instagram: 'instagram-profile',
  tiktok: 'tiktok-profile'
})
const SC_READERS = Object.freeze({ facebook: scFacebook, instagram: scInstagram, tiktok: scTiktok })

function scrapeCreatorsTier(network) {
  return Object.freeze({
    credential: 'scrapecreators',
    async run(url, opts, deps) {
      const t = parseSocialUrl(url, { network })
      if (!t) return providerAnswer('scrapecreators', 'not_found')
      const ctx = {
        provider: 'scrapecreators',
        key: deps.keys.scrapecreators,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs
      }
      try {
        const data = await deps.charge(
          { provider: 'scrapecreators', operation: SC_OPERATIONS[network], source: network },
          () => SC_READERS[network](ctx, t, opts)
        )
        return answered('scrapecreators', { status: 'complete', cursor: null, ...data })
      } catch (e) {
        if (!(e instanceof SocialStatsError)) throw e
        return e.code === 'not_found'
          ? providerAnswer('scrapecreators', 'not_found')
          : providerAnswer('scrapecreators', 'skipped', { reason: reasonOf(e.code) })
      }
    }
  })
}

// ── Apify and the free YouTube page ───────────────────────────────────────────────────────────────

/** A collect result as a provider answer; a failure keeps the raw result so the source records it as before. */
function fromCollect(provider, r) {
  const reason = apifyReason(r)
  if (reason) return { ...providerAnswer(provider, 'skipped', { reason, data: null }), raw: r }
  if (r.status === 'failed' && r.reason === 'not_found')
    return { ...providerAnswer(provider, 'not_found'), raw: r }
  if (r.reason === 'private_or_empty' || r.reason === 'not_found')
    return { ...providerAnswer(provider, 'not_found'), raw: r }
  return answered(provider, r)
}

const apifyTier = (network) =>
  Object.freeze({
    credential: 'apify',
    async run(url, opts, deps) {
      const actor = APIFY_ACTORS[network]
      const collect = () => apifyCollect(network, url, opts, { ...deps, token: deps.keys.apify })
      const r = await deps.charge(
        {
          provider: 'apify',
          operation: actor,
          source: network,
          cursor: opts.cursor ?? null,
          limit: opts.limit ?? null
        },
        collect
      )
      return fromCollect('apify', r)
    }
  })

const youtubePublicTier = Object.freeze({
  credential: null,
  async run(url, opts, deps) {
    return fromCollect('youtube-public', await collectYoutubePublic(url, opts, deps))
  }
})

/** Per network, the providers that can read a profile. Others in the order (stats-only listings) are passed over. */
export const PROFILE_TIERS = Object.freeze({
  facebook: Object.freeze({ scrapecreators: scrapeCreatorsTier('facebook'), apify: apifyTier('facebook') }),
  instagram: Object.freeze({
    scrapecreators: scrapeCreatorsTier('instagram'),
    apify: apifyTier('instagram')
  }),
  tiktok: Object.freeze({ scrapecreators: scrapeCreatorsTier('tiktok'), apify: apifyTier('tiktok') }),
  youtube: Object.freeze({ apify: apifyTier('youtube'), 'youtube-public': youtubePublicTier })
})

/** Enough for a profile: the page's name, some fact about the place, and at least one recent post. */
function profileEnough({ profile = {}, posts = [] }) {
  const facts = ['bio', 'phone', 'address', 'website', 'rating', 'followers', 'email'].some(
    (k) => profile[k] !== undefined && profile[k] !== null
  )
  return Boolean(profile.name) && facts && posts.length > 0
}

function answered(provider, data) {
  return providerAnswer(provider, profileEnough(data) ? 'complete' : 'partial', { data })
}

const tag = (provider) => (item) => ({ ...item, provider })

function merge(source, answers) {
  const profile = {}
  const posts = []
  const media = []
  const seenPost = new Set()
  const seenMedia = new Set()
  let paging = null
  for (const a of answers) {
    for (const [k, v] of Object.entries(a.data.profile ?? {})) if (profile[k] === undefined) profile[k] = v
    for (const p of a.data.posts ?? []) {
      const key = p.url ?? p.id
      if (key && seenPost.has(key)) continue
      if (key) seenPost.add(key)
      posts.push(tag(a.provider)(p))
    }
    for (const m of a.data.media ?? [])
      if (!seenMedia.has(m.url)) {
        seenMedia.add(m.url)
        media.push(tag(a.provider)(m))
      }
    if (a.data.cursor) paging = { provider: a.provider, data: a.data }
  }
  const fetched = answers.reduce((n, a) => n + (a.data.coverage?.fetched ?? a.data.posts?.length ?? 0), 0)
  return compact({
    source,
    status: paging ? 'partial' : 'complete',
    cursor: paging ? { ...paging.data.cursor, provider: paging.provider } : null,
    profile,
    posts,
    media,
    coverage: compact({
      fetched,
      until: answers
        .map((a) => a.data.coverage?.until)
        .filter(Boolean)
        .sort()[0],
      photoPages: answers.find((a) => a.data.coverage?.photoPages)?.data.coverage.photoPages
    })
  })
}

function failure(source, decisive) {
  if (decisive?.raw) return decisive.raw
  if (decisive?.status === 'not_found')
    return {
      source,
      status: 'failed',
      reason: 'not_found',
      cursor: null,
      posts: [],
      media: [],
      coverage: { fetched: 0 }
    }
  const reason = decisive?.reason ?? 'credential_missing'
  const status = reason.startsWith('credential_') ? 'blocked' : 'failed'
  return { source, status, reason, cursor: null, posts: [], media: [], coverage: { fetched: 0 } }
}

/**
 * Collects one social page of a place. `deps`: `{order, keys: {scrapecreators, apify}, charge, fetch, resolve,
 * now, …}` (the Apify and YouTube collectors' deps pass through). `order` is the capability group's provider
 * order (`resolveOrder`); `charge({provider, operation, source, …}, call)` reserves each paid call in the
 * caller's cost ledger and returns `call()`'s value — no paid provider runs without it.
 * Returns a CollectResult (`apify.mjs`) plus `provider` (the first that answered), `providers` and `attempts`.
 * A `cursor` names the provider that left it: a resume asks that provider only.
 */
export async function collectSocialProfile(
  network,
  url,
  { cursor = null, limit = 20, run = null } = {},
  deps = {}
) {
  const tiers = PROFILE_TIERS[network]
  if (!tiers) throw new RangeError(`no profile providers for network ${network}`)
  const keys = deps.keys ?? {}
  const resumeWith = cursor ? (cursor.provider ?? 'apify') : null
  const order = resumeWith ? [resumeWith] : (deps.order ?? Object.keys(tiers)).filter((id) => tiers[id])
  if (!order.length)
    return {
      source: network,
      status: 'skipped',
      reason: 'switched_off',
      cursor: null,
      posts: [],
      media: [],
      coverage: { fetched: 0 },
      attempts: []
    }
  const opts = { cursor: cursor ? { ...cursor, provider: undefined } : null, limit, ...(run ? { run } : {}) }
  const { answers, attempts, decisive } = await runInOrder(
    order,
    async (id) => {
      const tier = tiers[id]
      if (tier.credential && !keys[tier.credential])
        return providerAnswer(id, 'skipped', { reason: 'credential_missing' })
      if (tier.credential && typeof deps.charge !== 'function')
        throw new TypeError(`${network}/${id}: a paid provider needs deps.charge`)
      return tier.run(url, opts, { ...deps, keys })
    },
    { continueOnPartial: true }
  )
  // The attempts ride in `coverage` too: it is what the source row keeps, and what /ops/wo reads them from.
  if (!answers.length) {
    const failed = failure(network, decisive)
    return { ...failed, coverage: { ...(failed.coverage ?? { fetched: 0 }), attempts }, attempts }
  }
  const merged = merge(network, answers)
  return {
    ...merged,
    coverage: { ...merged.coverage, attempts },
    provider: answers[0].provider,
    providers: answers.map((a) => a.provider),
    attempts
  }
}
