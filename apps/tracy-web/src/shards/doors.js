/**
 * The doors a shard calls on its master (docs/sre/2026-10-15-shard-beta-design.md §4.4, §5; review
 * amendment 7; docs/sre/hop-dong-cua-shard.md §2, §5, §7), all under `/api/shards/:name/…`, all
 * signed with that shard's own `SHARD_<name>_SECRET` through the shard half's channel module
 * (`lib/shard-channel.js`). No session is read (`lib/csrf.js` `SESSION_FREE_DOORS`): the signature
 * names the caller, and every answer is scoped to it.
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { verifyShardRequest } from '../lib/shard-channel.js'
import { MASTER_SHARD } from '../lib/shard-shapes.js'
import { DNS_LABEL, holdLabel } from './labels.js'

const SITE_KEY = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/

export function shardDoors({
  pool,
  config,
  book,
  zone,
  reservedLabels,
  events = null,
  customHostnames = null,
  check = null,
  now = Date.now
}) {
  const app = new Hono()
  // Spent nonces, this process only: a restart opens a 120-second replay window (spec §8, accepted).
  const seen = new Map()

  app.use('/api/shards/:name/*', async (c, next) => {
    // A signed door takes no query (contract §2): refused before anything is verified.
    if (new URL(c.req.url).search !== '') return json(c, { code: 'INVALID_REQUEST' }, 400)
    // The signature covers the RAW bytes of the body: hashed as they came, decoded only afterwards.
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    const raw = new TextDecoder().decode(bytes)
    const shard = await book.get(c.req.param('name'))
    // The real method and the path without its query (contract §2). A secret that no longer opens
    // (SESSION_SECRET rotated) reads as null, which the verifier answers as unknown_shard too.
    const verdict = shard
      ? await verifyShardRequest({
          secret: shard.secret,
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          body: bytes,
          headers: {
            'x-shard-timestamp': c.req.header('x-shard-timestamp'),
            'x-shard-nonce': c.req.header('x-shard-nonce'),
            'x-shard-signature': c.req.header('x-shard-signature')
          },
          now: now(),
          seen
        })
      : { ok: false, why: 'unknown_shard' }
    if (!verdict.ok) return json(c, { code: 'SIGNATURE_INVALID', why: verdict.why }, 403)
    let body = null
    try {
      body = JSON.parse(raw)
    } catch {
      /* not JSON: refused below */
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      // The events door names its refusal as contract §5 does; the others as every API door here.
      const code = c.req.path.endsWith('/events') ? 'BAD_EVENT' : 'INVALID_REQUEST'
      return json(c, { code }, 400)
    }
    c.set('shard', shard)
    c.set('body', body)
    await next()
  })

  app.post('/api/shards/:name/labels/reserve', async (c) => {
    const body = c.get('body')
    const label = typeof body.label === 'string' ? body.label.trim().toLowerCase() : ''
    if (!DNS_LABEL.test(label)) return json(c, { code: 'INVALID_LABEL' }, 400)
    const asked = typeof body.siteKey === 'string' ? body.siteKey.trim().toLowerCase() : ''
    const siteKey = SITE_KEY.test(asked) ? asked : null
    // A shard's own name and this master's are records of the zone too, read here so a missing
    // DNS token does not open them.
    const names = new Set([...reservedLabels, MASTER_SHARD, ...(await book.all()).keys()])
    const held = await holdLabel({
      pool,
      config,
      zone,
      reservedLabels: names,
      holder: c.get('shard').name,
      label,
      siteKey,
      now
    })
    if (!held.ok)
      return json(
        c,
        { code: 'LABEL_TAKEN', reason: held.reason, ...(held.shard ? { shard: held.shard } : {}) },
        409
      )
    return json(c, { label, expiresAt: held.expiresAt.toISOString() })
  })

  app.post('/api/shards/:name/events', async (c) => {
    const out = await events.handle(c.get('shard'), c.get('body'))
    return json(c, out.body, out.status)
  })

  app.post('/api/shards/:name/custom-hostname', async (c) => {
    const out = await customHostnames.handle(c.get('shard'), c.get('body'))
    return json(c, out.body, out.status)
  })

  app.post('/api/shards/:name/check', async (c) => {
    const out = await check.handle(c.get('shard'), c.get('body'))
    return json(c, out.body, out.status)
  })

  return app
}
