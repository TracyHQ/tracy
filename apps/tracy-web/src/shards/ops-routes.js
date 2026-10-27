/**
 * `/api/ops/shards` (docs/sre/2026-10-15-shard-beta-design.md §5; review amendment 8;
 * docs/sre/hop-dong-cua-shard.md §8): what /ops › Shards reads, the things it may change on one
 * shard — whether it takes new people, a pin that holds its updater at the tags it runs, its site
 * limit, and the target tags that replace this master's own for that shard alone — and **Add**, a new
 * shard without a deploy. Behind the /ops door (`admit`/`denied`, handed in by `app.js`): any
 * tracy_admin seat reads, owner and admin write. A shard's secret comes in once through Add and is
 * sealed at once; no answer of this file ever carries one. Rotating it goes through SHARDS (env wins).
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import {
  IMAGE_TAG,
  MASTER_SHARD,
  SHARD_NAME,
  SHARD_REGIONS,
  SHARD_SECRET,
  TUNNEL_ID,
  shardOriginOf
} from '../lib/shard-shapes.js'
import { SILENT_AFTER_MS } from './pick.js'
import { addShard, updateShard } from './store.js'

const WRITERS = new Set(['owner', 'admin'])
const iso = (value) => (value ? new Date(value).toISOString() : null)
const ADD_FIELDS = new Set(['name', 'origin', 'secret', 'tunnelId', 'provider', 'region'])

/**
 * The shard an Add form describes, or null when anything is missing, of the wrong shape, or not a
 * field of the form (contract §8: name, origin, secret, tunnel id, provider, region).
 */
export function shardFrom(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (Object.keys(body).some((key) => !ADD_FIELDS.has(key))) return null
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const origin = shardOriginOf(body.origin)
  const secret = typeof body.secret === 'string' ? body.secret.trim() : ''
  const tunnelId = typeof body.tunnelId === 'string' ? body.tunnelId.trim().toLowerCase() : ''
  const provider =
    typeof body.provider === 'string' && body.provider.trim() !== '' ? body.provider.trim() : null
  const region = body.region === undefined || body.region === '' ? 'unknown' : body.region
  if (!SHARD_NAME.test(name) || name === MASTER_SHARD || !origin) return null
  if (!SHARD_SECRET.test(secret) || !TUNNEL_ID.test(tunnelId) || !SHARD_REGIONS.includes(region)) return null
  if (provider !== null && !/^[A-Za-z0-9 ._-]{1,40}$/.test(provider)) return null
  return { name, origin, secret, tunnelId, provider, region }
}

/** The changes a PATCH body names, or null when it names nothing or anything this screen may not set. */
export function changesFrom(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const out = {}
  for (const [key, value] of Object.entries(body)) {
    if ((key === 'accepting' || key === 'pinned') && typeof value === 'boolean') out[key] = value
    else if (key === 'maxSites' && Number.isSafeInteger(value) && value > 0 && value <= 10_000)
      out.maxSites = value
    else if (
      (key === 'targetAppTag' || key === 'targetDshTag') &&
      (value === null || (typeof value === 'string' && IMAGE_TAG.test(value)))
    )
      out[key] = value
    else return null
  }
  return Object.keys(out).length > 0 ? out : null
}

async function countsBy(pool, table) {
  const { rows } = await pool.query(`select shard, count(*)::int as n from ${table} group by shard`)
  return new Map(rows.map((row) => [row.shard, row.n]))
}

export function shardOpsRoutes({
  pool,
  config,
  book,
  admit,
  denied,
  tags,
  masterHead,
  dnsOn,
  now = Date.now
}) {
  const app = new Hono()

  app.get('/api/ops/shards', async (c) => {
    const who = await admit(c)
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    book.invalidate()
    const shards = await book.all()
    const sites = await countsBy(pool, 'directory_site')
    const people = await countsBy(pool, 'directory_email')
    const at = now()
    const allow = config.shardAdoptAllow
    return json(c, {
      shards: [...shards.values()].map((shard) => ({
        name: shard.name,
        origin: shard.origin,
        provider: shard.provider,
        region: shard.region,
        accepting: shard.accepting,
        pinned: shard.pinned,
        pinnedAppTag: shard.pinnedAppTag,
        pinnedDshTag: shard.pinnedDshTag,
        maxSites: shard.maxSites,
        targetAppTag: shard.targetAppTag,
        targetDshTag: shard.targetDshTag,
        degradedUntil: iso(shard.degradedUntil),
        heartbeatAt: iso(shard.heartbeatAt),
        silent: !shard.heartbeatAt || at - new Date(shard.heartbeatAt).getTime() >= SILENT_AFTER_MS,
        lowMemBeats: shard.lowMemBeats,
        updateGrantedAt: iso(shard.updateGrantedAt),
        migrationHead: shard.migrationHead,
        heartbeat: shard.heartbeat,
        sites: sites.get(shard.name) ?? 0,
        people: people.get(shard.name) ?? 0
      })),
      master: {
        ...(await tags.read()),
        migrationHead: await masterHead(),
        people: people.get(MASTER_SHARD) ?? 0
      },
      adopt: allow.everyone ? 'everyone' : allow.emails.length + allow.domains.length > 0 ? 'some' : 'off',
      dns: dnsOn,
      writable: WRITERS.has(who.role)
    })
  })

  app.patch('/api/ops/shards/:name', async (c) => {
    const who = await admit(c)
    if (who === 'sign-in' || who === null) return denied(c, who)
    if (!WRITERS.has(who.role)) return json(c, { code: 'FORBIDDEN' }, 403)
    const changes = changesFrom(await c.req.json().catch(() => null))
    if (!changes) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const name = c.req.param('name')
    const { pinned, ...rest } = changes
    let columns = rest
    // A pin holds the shard at the tags it runs now (contract §8 `pinned_app_tag`, `pinned_dsh_tag`).
    if (pinned === true) {
      book.invalidate()
      const shard = await book.get(name)
      if (!shard) return json(c, { code: 'SHARD_UNKNOWN' }, 404)
      const running = shard.heartbeat ?? {}
      if (!IMAGE_TAG.test(running.app_tag ?? '') || !IMAGE_TAG.test(running.dsh_tag ?? ''))
        return json(c, { code: 'NOTHING_TO_PIN' }, 409)
      columns = { ...rest, pinnedAppTag: running.app_tag, pinnedDshTag: running.dsh_tag }
    } else if (pinned === false) columns = { ...rest, pinnedAppTag: null, pinnedDshTag: null }
    const row = await updateShard(pool, name, columns)
    if (!row) return json(c, { code: 'SHARD_UNKNOWN' }, 404)
    book.invalidate()
    return json(c, {
      name: row.name,
      accepting: row.accepting,
      pinned: Boolean(row.pinned_app_tag || row.pinned_dsh_tag),
      pinnedAppTag: row.pinned_app_tag,
      pinnedDshTag: row.pinned_dsh_tag,
      maxSites: row.max_sites,
      targetAppTag: row.target_app_tag,
      targetDshTag: row.target_dsh_tag
    })
  })

  // Add (contract §8 (b)): a new row without a deploy, closed until /ops opens it.
  app.post('/api/ops/shards', async (c) => {
    const who = await admit(c)
    if (who === 'sign-in' || who === null) return denied(c, who)
    if (!WRITERS.has(who.role)) return json(c, { code: 'FORBIDDEN' }, 403)
    c.header('cache-control', 'no-store')
    const shard = shardFrom(await c.req.json().catch(() => null))
    if (!shard) return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (!(await addShard(pool, shard, config.sessionSecret))) return json(c, { code: 'SHARD_EXISTS' }, 409)
    book.invalidate()
    return json(
      c,
      {
        name: shard.name,
        origin: shard.origin,
        provider: shard.provider,
        region: shard.region,
        accepting: false
      },
      201
    )
  })

  return app
}
