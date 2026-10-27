import { fetchLimited } from './fetch-limited.mjs'

const ORIGIN = 'https://www.youtube.com'
const PAGE_BYTES = 6 * 1024 * 1024
// Skips the EU consent interstitial for anonymous reads.
const CONSENT_COOKIE = 'SOCS=CAI'

export function channelVideosUrl(handleOrUrl) {
  const v = String(handleOrUrl ?? '').trim()
  let path
  try {
    path = new URL(v).pathname
  } catch {
    return `${ORIGIN}/@${v.replace(/^@/, '')}/videos`
  }
  const [first, second] = path.split('/').filter(Boolean)
  if (first?.startsWith('@')) return `${ORIGIN}/${first}/videos`
  if (['channel', 'c', 'user'].includes(first) && second) return `${ORIGIN}/${first}/${second}/videos`
  return `${ORIGIN}${path.replace(/\/$/, '')}/videos`
}

/** Extracts the JSON object literal assigned to `name` in inline script, scanning braces string-aware. */
function jsonAfter(html, name) {
  const m = new RegExp(`${name}\\s*=\\s*\\{`).exec(html)
  if (!m) return null
  const start = m.index + m[0].length - 1
  let depth = 0
  let inStr = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

const text = (t) =>
  t?.simpleText ?? t?.content ?? (Array.isArray(t?.runs) ? t.runs.map((r) => r.text).join('') : undefined)

function lastThumb(list) {
  if (!Array.isArray(list) || !list.length) return undefined
  return [...list].sort((a, b) => (a.width ?? 0) - (b.width ?? 0)).at(-1)?.url
}

/** Walks YouTube's JSON for videos (old and new renderers) and the next continuation token. */
function harvest(root) {
  const videos = []
  let continuation = null
  const seen = new Set()
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const vr = n.videoRenderer ?? n.gridVideoRenderer
    if (vr?.videoId && !seen.has(vr.videoId)) {
      seen.add(vr.videoId)
      videos.push({ id: vr.videoId, title: text(vr.title), thumb: lastThumb(vr.thumbnail?.thumbnails) })
    }
    const lv = n.lockupViewModel
    if (lv?.contentId && /VIDEO/.test(lv.contentType ?? '') && !seen.has(lv.contentId)) {
      seen.add(lv.contentId)
      videos.push({
        id: lv.contentId,
        title: text(lv.metadata?.lockupMetadataViewModel?.title),
        thumb: lastThumb(lv.contentImage?.thumbnailViewModel?.image?.sources)
      })
    }
    const token = n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
    if (token) continuation = token
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v)
  }
  walk(root)
  return { videos, continuation }
}

function toResult(videos, { continuation, cursorBase, fetchedBefore, profile }) {
  const posts = []
  const media = []
  for (const v of videos) {
    const url = `${ORIGIN}/watch?v=${v.id}`
    const caption = v.title ? { caption: v.title } : {}
    posts.push({ id: v.id, url, ...caption })
    media.push({ url, kind: 'video', sourceUrl: url, postId: v.id, ...caption })
    if (v.thumb) media.push({ url: v.thumb, kind: 'image', sourceUrl: url, postId: v.id, ...caption })
  }
  const fetched = fetchedBefore + videos.length
  return {
    source: 'youtube',
    status: continuation ? 'partial' : 'complete',
    cursor: continuation ? { ...cursorBase, continuation, fetched } : null,
    ...(profile ? { profile } : {}),
    posts,
    media,
    coverage: { fetched }
  }
}

const fail = (status, reason, cursor = null, fetched = 0) => ({
  source: 'youtube',
  status,
  reason,
  cursor,
  posts: [],
  media: [],
  coverage: { fetched }
})

function reasonFor(err, status, fallback) {
  if (err?.code === 'TIMEOUT') return 'timeout'
  if (err?.code === 'URL_BLOCKED') return 'url_blocked'
  if (err) return 'network'
  if (status === 429) return 'rate_limited'
  if (status === 404) return 'not_found'
  return fallback
}

/**
 * Keyless YouTube channel reader: one page of videos per call (~30), continuation token as cursor.
 * Coverage is partial by nature (no upload dates, no Shorts/Live tabs); full coverage needs the Data API.
 */
export async function collectYoutubePublic(handleOrUrl, { cursor = null } = {}, deps = {}) {
  const base = {
    fetch: deps.fetch,
    resolve: deps.resolve,
    timeoutMs: deps.timeoutMs ?? 20_000,
    maxBytes: PAGE_BYTES
  }
  if (cursor?.continuation) {
    const fetchedBefore = Number(cursor.fetched) || 0
    let res
    try {
      res = await fetchLimited(
        `${ORIGIN}/youtubei/v1/browse?key=${encodeURIComponent(cursor.apiKey ?? '')}&prettyPrint=false`,
        {
          ...base,
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: CONSENT_COOKIE },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: cursor.clientVersion } },
            continuation: cursor.continuation
          })
        }
      )
    } catch (err) {
      return fail('partial', reasonFor(err, 0, 'continuation_failed'), cursor, fetchedBefore)
    }
    if (res.status !== 200)
      return fail(
        'partial',
        res.status === 429 ? 'rate_limited' : 'continuation_failed',
        cursor,
        fetchedBefore
      )
    let data
    try {
      data = JSON.parse(new TextDecoder().decode(res.bytes))
    } catch {
      return fail('partial', 'continuation_failed', cursor, fetchedBefore)
    }
    const { videos, continuation } = harvest(data.onResponseReceivedActions ?? data)
    const { continuation: _old, fetched: _f, ...cursorBase } = cursor
    return toResult(videos, { continuation, cursorBase, fetchedBefore })
  }

  let res
  try {
    res = await fetchLimited(channelVideosUrl(handleOrUrl), {
      ...base,
      headers: { cookie: CONSENT_COOKIE, 'accept-language': 'en' }
    })
  } catch (err) {
    return fail('failed', reasonFor(err, 0, 'network'))
  }
  if (res.status !== 200)
    return fail(res.status === 429 ? 'partial' : 'failed', reasonFor(null, res.status, 'provider_error'))
  const html = new TextDecoder().decode(res.bytes)
  const data = jsonAfter(html, 'ytInitialData')
  if (!data) return fail('failed', 'unparseable_page')
  const meta = data.metadata?.channelMetadataRenderer ?? {}
  const channelId =
    meta.externalId ??
    html.match(/"externalId":"(UC[\w-]+)"/)?.[1] ??
    html.match(/"browseId":"(UC[\w-]+)"/)?.[1]
  const profile = Object.fromEntries(
    Object.entries({ name: meta.title, bio: meta.description || undefined, channelId }).filter(([, v]) => v)
  )
  const { videos, continuation } = harvest(data.contents ?? data)
  const cursorBase = {
    apiKey: html.match(/"INNERTUBE_API_KEY":"([\w-]+)"/)?.[1],
    clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION":"([\w.-]+)"/)?.[1] ?? '2.20240101.00.00',
    ...(channelId ? { channelId } : {})
  }
  return toResult(videos, {
    continuation,
    cursorBase,
    fetchedBefore: 0,
    profile: Object.keys(profile).length ? profile : undefined
  })
}
