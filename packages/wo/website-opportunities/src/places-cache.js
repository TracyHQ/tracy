/**
 * Google Places answers kept in `wo_places_cache`, for every Find that asks Google: the signed-in
 * doors (`opportunities/route.js`) and the sign-in-free ones (`public/wo-find-page.js`) hand their
 * domain calls this `fetch`, so one cache serves both (decided 23/10/2026: Google bills per call and lets
 * results be kept; a place's profile barely moves in six months — `placesCacheDays`, 0 = off).
 *
 * The key is the request itself — method, path, query, field mask and body — without the API key and
 * without the Autocomplete/Details session token, so two visitors asking the same thing share one
 * answer. A search asks around the centre of its cache cell (`snapToCell`), which is what makes two
 * nearby searches the same request; the callers measure distances from the visitor again.
 * Only 2xx answers are kept; a read that fails is a miss.
 */
import { createHash } from 'node:crypto'

const HOST = 'places.googleapis.com'
const DAY_MS = 86_400_000
const SWEEP_BATCH = 100

/**
 * The centre of the cache cell holding `center`: a square of `cellM` metres, or a fifth of the radius
 * when `cellM` is 0 — then a kept answer was asked at most a tenth of the radius from the visitor.
 */
export function snapToCell(center, radiusM, cellM = 0) {
  const size = cellM > 0 ? cellM : radiusM / 5
  const dLat = size / 111_320
  const lat = Math.round(center.lat / dLat) * dLat
  const dLon = size / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  const round = (v) => Math.round(v * 1e6) / 1e6
  return { lat: round(lat), lon: round(Math.round(center.lon / dLon) * dLon) }
}

function headerOf(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(name) ?? ''
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())
  return hit ? String(hit[1]) : ''
}

/** The request without its key or session token, hashed. */
function keyOf(url, init) {
  const u = new URL(url.href)
  u.searchParams.delete('sessionToken')
  u.searchParams.delete('key')
  let body = ''
  if (typeof init.body === 'string' && init.body) {
    try {
      const { sessionToken: _s, ...rest } = JSON.parse(init.body)
      body = JSON.stringify(rest)
    } catch {
      body = init.body
    }
  }
  const raw = `${init.method ?? 'GET'} ${u.pathname}${u.search}\n${headerOf(init.headers, 'x-goog-fieldmask')}\n${body}`
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * A `fetch` that answers Google Places requests from the cache when it can.
 * @param {object} deps
 * @param {typeof fetch} deps.fetchImpl - the real fetch, for misses and for every other host.
 * @param {import('pg').Pool | null} deps.pool
 * @param {() => number} [deps.now]
 * @param {() => Promise<number> | number} deps.days - how long an answer is kept; read per request.
 * @param {() => Promise<void>} [deps.onMiss] - called right before a real Google request (the public
 *   door reserves its deployment budget there and throws to stop the call).
 */
export function placesCacheFetch({ fetchImpl, pool, now = Date.now, days, onMiss }) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    if (url.hostname !== HOST) return fetchImpl(input, init)
    const keepDays = pool ? Number(await days()) : 0
    const key = keepDays > 0 ? keyOf(url, init) : null
    if (key) {
      try {
        const { rows } = await pool.query(
          'select answer from wo_places_cache where key = $1 and expires_at > $2',
          [key, new Date(now())]
        )
        if (rows[0])
          return new Response(rows[0].answer.body, {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
      } catch {
        // A cache that cannot be read is a miss.
      }
    }
    if (onMiss) await onMiss()
    const res = await fetchImpl(input, init)
    if (!key || !res.ok) return res
    const text = await res.text()
    const at = now()
    try {
      await pool.query(
        `insert into wo_places_cache (key, answer, created_at, expires_at) values ($1, $2, $3, $4)
         on conflict (key) do update set answer = excluded.answer, created_at = excluded.created_at, expires_at = excluded.expires_at`,
        [key, JSON.stringify({ body: text }), new Date(at), new Date(at + keepDays * DAY_MS)]
      )
      await pool.query(
        `delete from wo_places_cache where key in (select key from wo_places_cache where expires_at <= $1 limit ${SWEEP_BATCH})`,
        [new Date(at)]
      )
    } catch {
      // Not kept: the next visitor pays one call.
    }
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } })
  }
}
