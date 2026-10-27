/**
 * `POST /api/internal/wo-places/v1/ingest` — another deployment pushes one place's published research
 * here (shared places plan §6). Machine to machine; no session is read.
 *
 * 🔒 WHO MAY CALL. Whoever holds `WO_PLACES_INGEST_SECRET`, sent as `x-tracy-wo-places-secret` and
 * compared in constant time BEFORE the body is read — the Discord door's pattern (`discord/route.js`).
 * No secret configured, or a shard: 404, the door does not admit it exists. One secret per receiving
 * deployment, shared by every sender: trust is light by decision (decided 23/10/2026), so the `origin` a
 * sender writes into the audit row is self-declared. Per-machine tokens later change only `allowed`.
 *
 * Answers `{outcome}`: 200 imported | skipped_existing | retry_later, 409 conflict, 422 media_missing,
 * 400 invalid, 413 when the body passes `MAX_BODY_BYTES`.
 */
import { Hono } from 'hono'
import { requireHost } from './host.js'
import { INGEST_PATH } from './place-export.js'
import { importPlaceBundle } from './place-import.js'

/** A place bundle is ~30 KB on average and ~130 KB at most on the stand measured (plan §6). */
export const MAX_BODY_BYTES = 4 * 1024 * 1024
const STATUS = {
  imported: 200,
  skipped_existing: 200,
  retry_later: 200,
  conflict: 409,
  media_missing: 422,
  invalid: 400
}

/** The body as text, or null when it passes `max` bytes (declared or streamed). */
async function boundedText(req, max) {
  const declared = Number(req.header('content-length'))
  if (Number.isFinite(declared) && declared > max) return null
  const reader = req.raw.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @param {object} deps
 * @param {object} deps.config - reads `woPlacesIngest.secret` and `deploymentRole`.
 * @param {import('pg').Pool} deps.pool
 * @param {import('./host.js').WoHost} deps.host - `sameSecret`.
 * @param {object|null} deps.objects - the routed place media objects (`opportunities/place-media-store.js`); only `head` is read.
 */
export function placeIngestRoutes({ config, pool, objects, host }) {
  const { sameSecret } = requireHost(host, ['sameSecret'])
  const app = new Hono()
  const secret = config.deploymentRole === 'shard' ? null : (config.woPlacesIngest?.secret ?? null)
  const allowed = (c) => Boolean(secret) && sameSecret(c.req.header('x-tracy-wo-places-secret'), secret)

  app.post(INGEST_PATH, async (c) => {
    c.header('cache-control', 'no-store')
    if (!allowed(c)) return c.text('Not found', 404)
    const text = await boundedText(c.req, MAX_BODY_BYTES)
    if (text === null) return c.json({ outcome: 'too_large', maxBytes: MAX_BODY_BYTES }, 413)
    let bundle
    try {
      bundle = JSON.parse(text)
    } catch {
      bundle = null
    }
    const result = await importPlaceBundle({ pool, objects }, bundle)
    return c.json(result, STATUS[result.outcome] ?? 500)
  })
  return app
}
