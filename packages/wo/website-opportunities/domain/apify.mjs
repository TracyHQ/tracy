import { fetchLimited } from './fetch-limited.mjs'
import { normaliseSocial } from './discovery-osm.mjs'
import { facebookPictureSize, upgradeFacebookPhotos } from './facebook-photos.mjs'

export const APIFY_ACTORS = Object.freeze({
  instagram: 'apify~instagram-scraper',
  facebook: 'apify~facebook-posts-scraper',
  tiktok: 'clockworks~tiktok-scraper',
  youtube: 'streamers~youtube-scraper'
})
const API = 'https://api.apify.com/v2/acts'
// A brief needs the recent voice and pictures, not the archive: 20 posts of the last 12 months.
// Measured 18/10: 200 Facebook posts cost $1.00 a run, 200 Instagram posts $0.54.
const DEFAULT_LIMIT = 20
export const RECENT_DAYS = 365
/** Hard ceiling Apify itself enforces per run (`maxTotalChargeUsd`); the default for every actor here. */
export const DEFAULT_MAX_CHARGE_USD = 0.25
// Measured 18/10: the YouTube actor needs ~80 s for 5 items.
const DEFAULT_RUN_SECS = 240
const MAX_BYTES = 25 * 1024 * 1024

export function redactToken(text, token) {
  let s = String(text ?? '')
  if (token) s = s.split(token).join('***')
  return s.replace(/token=[^&\s"']+/gi, 'token=***').replace(/bearer\s+[^\s"']+/gi, 'Bearer ***')
}

/**
 * The synchronous run URL with the provider-side caps: `maxItems` bounds a pay-per-result actor,
 * `maxTotalChargeUsd` a pay-per-event one; Apify stops the run there whatever the input asked.
 */
export function apifyRunUrl(actor, { runSecs, maxItems, maxChargeUsd = DEFAULT_MAX_CHARGE_USD } = {}) {
  const q = new URLSearchParams({ timeout: String(runSecs ?? DEFAULT_RUN_SECS) })
  if (Number.isFinite(maxItems) && maxItems > 0) q.set('maxItems', String(Math.ceil(maxItems)))
  if (Number.isFinite(maxChargeUsd) && maxChargeUsd > 0) q.set('maxTotalChargeUsd', String(maxChargeUsd))
  return `${API}/${actor}/run-sync-get-dataset-items?${q}`
}

function handleOf(handleOrUrl) {
  const v = String(handleOrUrl ?? '').trim()
  try {
    const seg = new URL(v).pathname.split('/').filter(Boolean)[0] ?? ''
    return seg.replace(/^@/, '')
  } catch {
    return v.replace(/^@/, '')
  }
}

const urlOf = (net, handleOrUrl) => normaliseSocial(net, handleOrUrl) ?? String(handleOrUrl)

function actorInput(source, handleOrUrl, count, since) {
  switch (source) {
    case 'instagram':
      return {
        directUrls: [urlOf('instagram', handleOrUrl)],
        resultsType: 'posts',
        resultsLimit: count,
        onlyPostsNewerThan: since
      }
    case 'facebook':
      return {
        startUrls: [{ url: urlOf('facebook', handleOrUrl) }],
        resultsLimit: count,
        onlyPostsNewerThan: since
      }
    case 'tiktok':
      return { profiles: [handleOf(handleOrUrl)], resultsPerPage: count }
    case 'youtube':
      return { startUrls: [{ url: urlOf('youtube', handleOrUrl) }], maxResults: count }
    default:
      throw new Error(`unknown source ${source}`)
  }
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const list = (v) => (Array.isArray(v) ? v : [])
function isoDate(v) {
  if (typeof v === 'number') return new Date(v * (v < 1e12 ? 1000 : 1)).toISOString()
  const s = str(v)
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

const dim = (v) => (Number.isInteger(v) && v > 0 ? v : undefined)

// Of the URLs the actor gives for one picture, the one served at the biggest box; a reel's `image` is a 296x100 crop.
function facebookPicture(m) {
  let best
  let bestArea = -1
  for (const c of [m.photo_image, m.image, { uri: m.thumbnail }]) {
    const uri = c && typeof c === 'object' ? str(c.uri) : undefined
    if (!uri) continue
    const s = facebookPictureSize(uri).served
    const area = s ? s.width * s.height : 0
    if (area > bestArea) {
      best = { url: uri, width: dim(c.width), height: dim(c.height) }
      bestArea = area
    }
  }
  return best && { ...best, photoId: m.__typename === 'Photo' ? str(m.id) : undefined }
}

// Each mapper returns { post, images[], videos[], profile } for one dataset item; shapes vary, so read defensively.
const MAPPERS = {
  instagram(it) {
    const images = [it.displayUrl, ...list(it.images)]
    const videos = [it.videoUrl]
    for (const c of list(it.childPosts)) {
      images.push(c?.displayUrl)
      videos.push(c?.videoUrl)
    }
    return {
      post: {
        id: str(it.id) ?? str(it.shortCode),
        url: str(it.url),
        caption: str(it.caption),
        postedAt: isoDate(it.timestamp)
      },
      images,
      videos,
      profile: { name: str(it.ownerFullName) ?? str(it.ownerUsername) }
    }
  },
  facebook(it) {
    const images = []
    const videos = []
    for (const m of list(it.media)) {
      if (!m || typeof m !== 'object') continue
      // `m.url` is a photo or post page, never the picture itself.
      images.push(facebookPicture(m))
      videos.push(m.videoUrl ?? m.playable_url ?? m.video?.url)
    }
    return {
      post: {
        id: str(it.postId) ?? str(it.id),
        url: str(it.url) ?? str(it.topLevelUrl),
        caption: str(it.text),
        postedAt: isoDate(it.timestamp ?? it.time)
      },
      images,
      videos,
      profile: { name: str(it.pageName) ?? str(it.user?.name) }
    }
  },
  tiktok(it) {
    return {
      post: {
        id: str(it.id),
        url: str(it.webVideoUrl) ?? str(it.url),
        caption: str(it.text),
        postedAt: isoDate(it.createTimeISO ?? it.createTime)
      },
      images: [it.videoMeta?.coverUrl ?? it.covers?.default],
      videos: [list(it.mediaUrls)[0] ?? it.videoMeta?.downloadAddr],
      profile: {
        name: str(it.authorMeta?.nickName) ?? str(it.authorMeta?.name),
        bio: str(it.authorMeta?.signature)
      }
    }
  },
  youtube(it) {
    const url = str(it.url) ?? (str(it.id) ? `https://www.youtube.com/watch?v=${it.id}` : undefined)
    return {
      post: { id: str(it.id), url, caption: str(it.title), postedAt: isoDate(it.date) },
      images: [it.thumbnailUrl],
      videos: [url],
      profile: { name: str(it.channelName), bio: str(it.channelDescription) }
    }
  }
}

function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

function stop(source, status, reason, cursor, error) {
  return compact({
    source,
    status,
    reason,
    cursor,
    error,
    posts: [],
    media: [],
    coverage: { fetched: cursor?.offset ?? 0 }
  })
}

/** The asynchronous start of a run, with the same provider-side caps as `apifyRunUrl`. */
export function apifyStartUrl(actor, { runSecs, maxItems, maxChargeUsd = DEFAULT_MAX_CHARGE_USD } = {}) {
  const sync = new URL(apifyRunUrl(actor, { runSecs, maxItems, maxChargeUsd }))
  return `${API}/${actor}/runs${sync.search}`
}

const V2 = 'https://api.apify.com/v2'
const START_TIMEOUT_MS = 30_000
const SMALL_BYTES = 1024 * 1024
/** Apify's own longest server-side wait for one `waitForFinish` call. */
const WAIT_STEP_SECS = 60
const RUN_FAILED = new Set(['FAILED', 'ABORTED', 'TIMED-OUT'])

function httpStop(source, status, keep) {
  if (status === 401 || status === 403)
    return stop(source, 'blocked', 'credential_invalid', null, `HTTP ${status}`)
  if (status === 402) return stop(source, 'partial', 'quota', keep, 'HTTP 402')
  if (status === 429) return stop(source, 'partial', 'rate_limited', keep, 'HTTP 429')
  if (status === 408) return stop(source, 'partial', 'timeout', keep, 'HTTP 408')
  if (status === 404) return stop(source, 'failed', 'not_found', null, 'HTTP 404')
  if (status < 200 || status >= 300) return stop(source, 'failed', 'provider_error', null, `HTTP ${status}`)
  return null
}

function fetchStop(source, err, keep, token) {
  const error = redactToken(err?.message, token)
  return stop(source, 'partial', err?.code === 'TIMEOUT' ? 'timeout' : 'network', keep, error)
}

function jsonOf(res) {
  try {
    return { value: JSON.parse(new TextDecoder().decode(res.bytes)) }
  } catch {
    return null
  }
}

function itemsOf(source, res) {
  const parsed = jsonOf(res)
  if (!parsed) return { stop: stop(source, 'failed', 'provider_error', null, 'invalid JSON from provider') }
  if (!Array.isArray(parsed.value))
    return { stop: stop(source, 'failed', 'provider_error', null, 'unexpected provider payload') }
  return { items: parsed.value }
}

// Token travels in a header, never in the URL, so it cannot land in logs or error messages.
function apifyCall(url, deps, { method = 'GET', body, maxBytes = SMALL_BYTES, timeoutMs }) {
  return fetchLimited(url, {
    fetch: deps.fetch,
    resolve: deps.resolve,
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      authorization: `Bearer ${deps.token}`
    },
    ...(body === undefined ? {} : { body }),
    maxBytes,
    timeoutMs
  })
}

/** One synchronous call: the run and its dataset in one answer, no run id until it ends. */
async function itemsSync(ask, deps) {
  const { source, keep } = ask
  let res
  try {
    res = await apifyCall(
      apifyRunUrl(ask.actor, { runSecs: ask.runSecs, maxItems: ask.count, maxChargeUsd: deps.maxChargeUsd }),
      deps,
      {
        method: 'POST',
        body: JSON.stringify(ask.input),
        maxBytes: MAX_BYTES,
        timeoutMs: deps.timeoutMs ?? (ask.runSecs + 30) * 1000
      }
    )
  } catch (err) {
    return { stop: fetchStop(source, err, keep, deps.token) }
  }
  const refused = httpStop(source, res.status, keep)
  return refused ? { stop: refused } : itemsOf(source, res)
}

/**
 * Wait for one run to end. `gone`: the run will never give this ask its items (missing, failed, aborted
 * or timed out), so a run held from an earlier holder is replaced by a new one.
 */
async function waitForRun(ask, run, deps) {
  const { source, keep } = ask
  const deadline = Date.now() + (deps.timeoutMs ?? (ask.runSecs + 30) * 1000)
  for (;;) {
    const left = deadline - Date.now()
    const secs = Math.min(WAIT_STEP_SECS, Math.floor(left / 1000))
    let res
    try {
      res = await apifyCall(
        `${V2}/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=${Math.max(0, secs)}`,
        deps,
        {
          timeoutMs: Math.max(1, Math.min(left, Math.max(0, secs) * 1000 + 15_000))
        }
      )
    } catch (err) {
      return { stop: fetchStop(source, err, keep, deps.token) }
    }
    if (res.status === 404)
      return { gone: true, stop: stop(source, 'failed', 'provider_error', null, 'the Apify run is missing') }
    const refused = httpStop(source, res.status, keep)
    if (refused) return { stop: refused }
    const status = jsonOf(res)?.value?.data?.status
    if (status === 'SUCCEEDED') return {}
    if (status === 'TIMED-OUT')
      return { gone: true, stop: stop(source, 'partial', 'timeout', keep, 'the Apify run timed out') }
    if (RUN_FAILED.has(status))
      return {
        gone: true,
        stop: stop(source, 'failed', 'provider_error', null, `the Apify run ended ${status}`)
      }
    // READY, RUNNING, TIMING-OUT, ABORTING: still going. Past the deadline it is left running; its id stays
    // recorded, so a resume reads it instead of paying for another.
    if (secs < 1 || Date.now() >= deadline)
      return { stop: stop(source, 'partial', 'timeout', keep, 'the Apify run is still running') }
  }
}

/**
 * An asynchronous run whose id is handed to `deps.onRun` BEFORE the wait, so a holder that dies during it
 * (a restart) leaves the run for the next one: given back as `run`, it is read, never paid for again.
 */
async function itemsOfRun(ask, held, deps) {
  const { source, keep } = ask
  let known =
    held &&
    held.source === source &&
    held.offset === ask.offset &&
    typeof held.id === 'string' &&
    typeof held.datasetId === 'string'
      ? held
      : null
  for (let pass = 0; pass < 2; pass += 1) {
    let current = known
    if (!current) {
      let res
      try {
        res = await apifyCall(
          apifyStartUrl(ask.actor, {
            runSecs: ask.runSecs,
            maxItems: ask.count,
            maxChargeUsd: deps.maxChargeUsd
          }),
          deps,
          {
            method: 'POST',
            body: JSON.stringify(ask.input),
            timeoutMs: Math.min(START_TIMEOUT_MS, deps.timeoutMs ?? START_TIMEOUT_MS)
          }
        )
      } catch (err) {
        return { stop: fetchStop(source, err, keep, deps.token) }
      }
      const refused = httpStop(source, res.status, keep)
      if (refused) return { stop: refused }
      const data = jsonOf(res)?.value?.data
      if (typeof data?.id !== 'string' || typeof data?.defaultDatasetId !== 'string')
        return { stop: stop(source, 'failed', 'provider_error', null, 'unexpected provider payload') }
      current = { source, offset: ask.offset, id: data.id, datasetId: data.defaultDatasetId }
      // A record that could not be written costs only the reuse; the run is read here all the same.
      await Promise.resolve()
        .then(() => deps.onRun(current))
        .catch(() => {})
    }
    const waited = await waitForRun(ask, current, deps)
    if (waited.gone && known) {
      known = null
      continue
    }
    if (waited.stop) return waited
    let res
    try {
      res = await apifyCall(
        `${V2}/datasets/${encodeURIComponent(current.datasetId)}/items?format=json`,
        deps,
        {
          maxBytes: MAX_BYTES,
          timeoutMs: deps.timeoutMs ?? (ask.runSecs + 30) * 1000
        }
      )
    } catch (err) {
      return { stop: fetchStop(source, err, keep, deps.token) }
    }
    // A held run's dataset past Apify's retention: run it again.
    if (res.status === 404 && known) {
      known = null
      continue
    }
    const refused = httpStop(source, res.status, keep)
    return refused ? { stop: refused } : itemsOf(source, res)
  }
  return { stop: stop(source, 'failed', 'provider_error', null, 'the Apify run could not be read') }
}

/**
 * Runs an Apify actor and maps its dataset to a CollectResult.
 * With `deps.onRun` (the research executors) the run is started asynchronously and its id recorded before the
 * wait (`itemsOfRun`); `run` is a record an earlier holder of the job left, read instead of a new run when it
 * is for the same source and offset. Without it, one synchronous call (`run-sync-get-dataset-items`).
 * Coverage limit: actors have no server-side cursor, so page N re-runs the actor asking for
 * offset+limit items and keeps the tail. Cost grows with depth, and items posted between runs can shift
 * the window (a few repeats or skips are possible; media sha256 dedupe absorbs repeats).
 */
export async function apifyCollect(
  source,
  handleOrUrl,
  { cursor = null, limit = DEFAULT_LIMIT, run = null } = {},
  deps = {}
) {
  const { token } = deps
  if (!token) return stop(source, 'blocked', 'credential_missing', null)
  const offset = Math.max(0, Number(cursor?.offset) || 0)
  const count = offset + limit
  const runSecs = deps.runSecs ?? DEFAULT_RUN_SECS
  const since = new Date((deps.now?.() ?? Date.now()) - (deps.recentDays ?? RECENT_DAYS) * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const ask = {
    source,
    actor: APIFY_ACTORS[source],
    offset,
    count,
    runSecs,
    keep: { offset },
    input: actorInput(source, handleOrUrl, count, since)
  }
  const got = typeof deps.onRun === 'function' ? await itemsOfRun(ask, run, deps) : await itemsSync(ask, deps)
  if (got.stop) return got.stop
  const { items } = got
  // Actors report a bad handle or a private profile as a single error item, not an HTTP error.
  const errorItem =
    items.length && items.every((it) => it && typeof it === 'object' && typeof it.error === 'string')
      ? items[0]
      : null
  if (errorItem) {
    const detail = redactToken(errorItem.errorDescription ?? errorItem.error, token)
    if (errorItem.error === 'not_found') return stop(source, 'failed', 'not_found', null, detail)
    if (errorItem.error === 'no_items') return stop(source, 'blocked', 'private_or_empty', null, detail)
    return stop(source, 'failed', 'provider_error', null, detail)
  }

  const fresh = items.slice(offset)
  const posts = []
  const media = []
  const seen = new Set()
  const profile = {}
  let until
  for (const it of fresh) {
    if (!it || typeof it !== 'object' || typeof it.error === 'string') continue
    const m = MAPPERS[source](it)
    const post = compact(m.post)
    posts.push(post)
    for (const [k, v] of Object.entries(compact(m.profile))) profile[k] ??= v
    if (post.postedAt && (!until || post.postedAt < until)) until = post.postedAt
    // An image is a URL, or { url, width, height, photoId } when the source knows more about it.
    const add = (u, kind) => {
      const pic = u && typeof u === 'object' ? u : { url: u }
      const url = str(pic.url)
      if (!url || seen.has(url)) return
      seen.add(url)
      media.push(
        compact({
          url,
          kind,
          width: pic.width,
          height: pic.height,
          photoId: pic.photoId,
          sourceUrl: post.url ?? str(handleOrUrl),
          postId: post.id,
          postedAt: post.postedAt,
          caption: post.caption
        })
      )
    }
    m.images.forEach((u) => add(u, 'image'))
    m.videos.forEach((u) => add(u, 'video'))
  }
  const more = items.length >= count && fresh.length > 0
  const photoPages = source === 'facebook' ? await upgradeFacebookPhotos(media, deps) : undefined
  return compact({
    source,
    status: more ? 'partial' : 'complete',
    cursor: more ? { offset: offset + fresh.length } : null,
    profile,
    posts,
    media,
    coverage: compact({ fetched: offset + fresh.length, until, photoPages })
  })
}
