/**
 * Hub read doors (`/hub/v1`). Every answer is built from an explicit allowlist (`placeDto`): snapshot fields of the
 * policy's closed list, website verdict, score, freshness and public provenance (source families, source objects,
 * times). Never an account, a contribution, an observation id, a pipeline, a brief or build data.
 *
 * A cache miss never calls a provider: an unknown place is `not_found`; finding more is a separate, budgeted request.
 *
 *   GET  /hub/v1/places/:id                       current snapshot, revision, ETag, freshness   (1 read_places)
 *   GET  /hub/v1/places/:id/snapshots/:snapshotId an older snapshot, only while it is not revoked (1 read_places)
 *   POST /hub/v1/places/lookup                    identities → canonical id | ambiguous | not_found (1 per found)
 *   GET  /hub/v1/places?cell=&cursor=             known places of one cell, bounded pages        (1 per place)
 *   GET  /hub/v1/changes?cursor=                  upsert | merge | revoke | delete events         (not charged)
 *   GET  /hub/v1/revocations?cursor=              revoke | delete only; never charged, own rate limit
 *   GET  /hub/v1/media/:mediaId                   a picture, through the same revocation checks (its bytes as image_bytes)
 *
 * Callers send `Authorization: Bearer <token>` (the intake's tokens). Data reads are charged to the account's
 * `read_places` quota; feeds are not, and have their own per-minute rate buckets (`host.overLimitOrClosed`).
 */
import { Hono } from 'hono'
import { CursorError, readFeed } from './feed.js'
import { fieldNamesOf } from './materialize.js'
import { createHubQuota } from './quota.js'
import { createHubTokens } from './tokens.js'

const BASE = '/hub/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CELL = /^-?\d{1,5}:-?\d{1,5}$/
const LOOKUP_MAX = 100
const LOOKUP_IDENTITIES_MAX = 10
const CELL_PAGE = 50
const MERGE_HOPS = 5
// Requests per minute per account and bucket; revocations get more room so catching up after a long offline spell works.
const RATE = Object.freeze({ hub_read: 60, hub_changes: 60, hub_revocations: 120 })

const refusal = (c, status, code, extra = {}) => c.json({ code, ...extra }, status)

function publicField(f) {
  return {
    status: f.status,
    value: f.value,
    blocksBrief: f.blocks_brief,
    alternatives: (f.alternatives ?? []).map((a) => ({ value: a.value, sources: a.sources })),
    provenance: {
      sources: f.provenance.sources,
      sourceObjects: f.provenance.sourceObjects,
      observedAt: f.provenance.observedAt
    }
  }
}

/** The public form of one hub snapshot, built from named members only. */
export function placeDto(row, fieldRows) {
  const allowed = new Set(fieldNamesOf(row.policy_version))
  const hub = row.profile?.hub ?? {}
  const verdict = hub.websiteVerdict ?? {}
  return {
    id: row.place_id,
    revision: Number(row.snap_revision),
    contentHash: row.content_hash,
    policyVersion: row.policy_version,
    fields: Object.fromEntries(
      fieldRows.filter((f) => allowed.has(f.field)).map((f) => [f.field, publicField(f)])
    ),
    websiteVerdict: {
      state: verdict.state,
      ...(verdict.url !== undefined ? { url: verdict.url } : {}),
      ...(verdict.sources ? { sources: verdict.sources } : {}),
      ...(verdict.checkedSources
        ? { checkedSources: verdict.checkedSources, checkedAt: iso(row.observed_at) }
        : {})
    },
    score: hub.score
      ? {
          score: hub.score.score,
          grade: hub.score.grade,
          pending: hub.score.pending,
          reasons: hub.score.reasons
        }
      : null,
    freshness: { observedAt: iso(row.observed_at), materializedAt: iso(row.created_at) }
  }
}

const iso = (d) => (d ? new Date(d).toISOString() : null)
const etagOf = (row) =>
  `"r${row.snap_revision}-${String(row.content_hash)
    .replace(/^sha256:/, '')
    .slice(0, 16)}"`

const SNAPSHOT_ROW = `
  select p.place_id, p.state, p.merged_into, s.snapshot_id, s.revision as snap_revision, s.content_hash,
         s.policy_version, s.observed_at, s.created_at, s.revoked_at, pr.profile,
         exists (select 1 from wo_place_identity i join wo_hub_suppressed_identity x
                   on x.namespace = i.namespace and x.external_id = i.external_id
                  where i.place_id = p.place_id) as suppressed
    from wo_hub_place p
    left join wo_hub_snapshot s on s.place_id = p.place_id and s.snapshot_id = coalesce($2::uuid, p.current_snapshot_id)
    left join wo_place_snapshot_profile pr on pr.snapshot_id = s.snapshot_id`

async function fieldsOf(db, snapshotIds) {
  if (!snapshotIds.length) return new Map()
  const { rows } = await db.query(
    `select snapshot_id, field, status, value, blocks_brief, provenance, alternatives
       from wo_hub_snapshot_field where snapshot_id = any($1::uuid[]) order by field`,
    [snapshotIds]
  )
  const out = new Map()
  for (const r of rows) {
    if (!out.has(r.snapshot_id)) out.set(r.snapshot_id, [])
    out.get(r.snapshot_id).push(r)
  }
  return out
}

/** Why a row may not be served, or null when it may. */
function blockOf(row) {
  if (!row) return [404, 'not_found']
  if (row.state === 'deleted' || row.suppressed) return [410, 'deleted']
  if (row.state === 'revoked') return [410, 'revoked']
  if (row.state === 'merged') return [301, 'merged', { mergedInto: row.merged_into }]
  if (!row.snapshot_id) return [404, 'not_found']
  if (row.revoked_at) return [410, 'withdrawn']
  return null
}

/**
 * @param {{ pool: import('pg').Pool, host?: Partial<import('../host.js').WoHost>,
 *   tokens?: ReturnType<typeof createHubTokens>, quota?: ReturnType<typeof createHubQuota>,
 *   objects?: { get: (key: string) => Promise<Response | null> }, now?: () => number }} deps
 */
export function hubReadRoutes({
  pool,
  host = {},
  tokens = createHubTokens({ pool }),
  quota = createHubQuota({ pool }),
  objects,
  now = Date.now
}) {
  const app = new Hono()

  // The caller's account, or a refusal Response; every bucket is rate limited, none of them is charged here.
  async function caller(c, bucket) {
    const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')
    const who = match ? await tokens.authenticate(match[1]) : null
    if (!who) {
      c.header('WWW-Authenticate', 'Bearer realm="hub"')
      return refusal(c, 401, 'invalid_token')
    }
    if (
      host.overLimitOrClosed &&
      (await host.overLimitOrClosed(pool, `${bucket}:${who.accountId}`, RATE[bucket], now(), 60_000))
    ) {
      return refusal(c, 429, 'rate_limited')
    }
    return who
  }
  async function charge(c, who, category, amount) {
    if (amount <= 0) return null
    const answer = await quota.charge(who.accountId, category, amount)
    if (answer?.ok === true) return null
    return refusal(c, 429, 'quota_exceeded', { category, period: answer?.period, limit: answer?.limit })
  }

  async function servePlace(c, placeId, snapshotId) {
    const account = await caller(c, 'hub_read')
    if (account instanceof Response) return account
    if (!UUID.test(placeId) || (snapshotId !== null && !UUID.test(snapshotId)))
      return refusal(c, 404, 'not_found')
    const row = (await pool.query(`${SNAPSHOT_ROW} where p.place_id = $1`, [placeId, snapshotId])).rows[0]
    const blocked = blockOf(row)
    if (blocked) {
      const [status, code, extra] = blocked
      if (status === 301) c.header('Location', `${BASE}/places/${extra.mergedInto}`)
      return refusal(c, status, code, extra)
    }
    const etag = etagOf(row)
    c.header('ETag', etag)
    c.header('Cache-Control', 'private, no-cache')
    if (c.req.header('if-none-match') === etag) return c.body(null, 304)
    const denied = await charge(c, account, 'read_places', 1)
    if (denied) return denied
    const fields = (await fieldsOf(pool, [row.snapshot_id])).get(row.snapshot_id) ?? []
    return c.json(placeDto(row, fields))
  }

  app.get(`${BASE}/places/:id`, (c) => servePlace(c, c.req.param('id'), null))
  app.get(`${BASE}/places/:id/snapshots/:snapshotId`, (c) =>
    servePlace(c, c.req.param('id'), c.req.param('snapshotId'))
  )

  app.post(`${BASE}/places/lookup`, async (c) => {
    const account = await caller(c, 'hub_read')
    if (account instanceof Response) return account
    const body = await c.req.json().catch(() => null)
    const items = Array.isArray(body?.items) ? body.items : null
    if (!items || items.length === 0 || items.length > LOOKUP_MAX) {
      return refusal(c, 400, 'bad_request', { message: `items: 1 to ${LOOKUP_MAX} lookups` })
    }
    const lists = items.map((item) => (Array.isArray(item?.identities) ? item.identities : [item]))
    const valid = (i) =>
      i && typeof i.namespace === 'string' && typeof i.externalId === 'string' && i.externalId.length <= 500
    if (lists.some((l) => l.length === 0 || l.length > LOOKUP_IDENTITIES_MAX || !l.every(valid))) {
      return refusal(c, 400, 'bad_request', {
        message: `each lookup: 1 to ${LOOKUP_IDENTITIES_MAX} {namespace, externalId}`
      })
    }
    const all = lists.flat()
    const { rows } = await pool.query(
      `select i.namespace, i.external_id, i.place_id,
              exists (select 1 from wo_hub_suppressed_identity x
                       where x.namespace = i.namespace and x.external_id = i.external_id) as suppressed
         from wo_place_identity i
        where (i.namespace, i.external_id) in (select * from unnest($1::text[], $2::text[]))`,
      [all.map((i) => i.namespace), all.map((i) => i.externalId)]
    )
    const placeOf = new Map(
      rows.filter((r) => !r.suppressed).map((r) => [`${r.namespace}\u0000${r.external_id}`, r.place_id])
    )
    const canonical = await canonicalPlaces(pool, [...new Set(placeOf.values())])
    const results = lists.map((list) => {
      const ids = [
        ...new Set(
          list.map((i) => canonical.get(placeOf.get(`${i.namespace}\u0000${i.externalId}`))).filter(Boolean)
        )
      ]
      if (ids.length === 0) return { status: 'not_found' }
      if (ids.length > 1) return { status: 'ambiguous', candidates: ids.map((id) => id.id).sort() }
      return { status: 'found', id: ids[0].id, revision: ids[0].revision }
    })
    const denied = await charge(c, account, 'read_places', results.filter((r) => r.status === 'found').length)
    if (denied) return denied
    return c.json({ results })
  })

  app.get(`${BASE}/places`, async (c) => {
    const account = await caller(c, 'hub_read')
    if (account instanceof Response) return account
    const cell = c.req.query('cell') ?? ''
    if (!CELL.test(cell)) return refusal(c, 400, 'bad_request', { message: 'cell: "<lat*100>:<lon*100>"' })
    let afterId = '00000000-0000-0000-0000-000000000000'
    const cursor = c.req.query('cursor')
    if (cursor) {
      const parsed = decodeCellCursor(cursor, cell)
      if (!parsed) return refusal(c, 400, 'bad_cursor')
      afterId = parsed
    }
    const { rows } = await pool.query(
      `${SNAPSHOT_ROW} where p.cell = $1 and p.state = 'live' and p.current_snapshot_id is not null
          and p.place_id > $3::uuid order by p.place_id limit $4`,
      [cell, null, afterId, CELL_PAGE + 1]
    )
    const page = rows.slice(0, CELL_PAGE)
    const servable = page.filter((r) => !blockOf(r))
    const denied = await charge(c, account, 'read_places', servable.length)
    if (denied) return denied
    const fields = await fieldsOf(
      pool,
      servable.map((r) => r.snapshot_id)
    )
    return c.json({
      places: servable.map((r) => placeDto(r, fields.get(r.snapshot_id) ?? [])),
      cursor: rows.length > CELL_PAGE ? encodeCellCursor(cell, page.at(-1).place_id) : null
    })
  })

  for (const feed of ['changes', 'revocations']) {
    app.get(`${BASE}/${feed}`, async (c) => {
      // Never charged against data quota: a client out of quota must still learn what to delete.
      const account = await caller(c, `hub_${feed}`)
      if (account instanceof Response) return account
      try {
        return c.json(
          await readFeed(pool, feed, { cursor: c.req.query('cursor'), limit: c.req.query('limit') })
        )
      } catch (error) {
        if (error instanceof CursorError)
          return refusal(c, error.code === 'cursor_expired' ? 410 : 400, error.code)
        throw error
      }
    })
  }

  app.get(`${BASE}/media/:mediaId`, async (c) => {
    const account = await caller(c, 'hub_read')
    if (account instanceof Response) return account
    const mediaId = c.req.param('mediaId')
    if (!UUID.test(mediaId) || !objects) return refusal(c, 404, 'not_found')
    const { rows } = await pool.query(
      `select m.object_key, m.mime, m.status, m.bytes, m.revoked_at as media_revoked, row.*
         from wo_place_media m
         join lateral (${SNAPSHOT_ROW} where p.place_id = m.place_id) row on true
        where m.id = $1`.replace('$2::uuid', 'null::uuid'),
      [mediaId]
    )
    const row = rows[0]
    const blocked = blockOf(row)
    if (blocked)
      return refusal(c, blocked[0] === 301 ? 404 : blocked[0], blocked[0] === 301 ? 'not_found' : blocked[1])
    if (row.media_revoked) return refusal(c, 410, 'revoked')
    if (row.status !== 'stored' || !row.object_key) return refusal(c, 404, 'not_found')
    const denied = await charge(c, account, 'image_bytes', Math.max(1, Number(row.bytes) || 1))
    if (denied) return denied
    const object = await objects.get(row.object_key)
    if (!object) return refusal(c, 404, 'not_found')
    // Short-lived and private: a copied URL must come back through these checks, never bypass a revocation.
    return new Response(object.body, {
      headers: {
        'Content-Type': row.mime ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=300'
      }
    })
  })

  return app
}

/** Place id → { id, revision } of the live, published place it resolves to (following merges). */
async function canonicalPlaces(db, placeIds) {
  const out = new Map()
  if (!placeIds.length) return out
  const { rows } = await db.query(
    `with recursive hop(start, id, n) as (
        select p.id, p.id, 0 from wo_place p where p.id = any($1::uuid[])
        union all
        select hop.start, coalesce(hp.merged_into, wp.merged_into), hop.n + 1
          from hop join wo_place wp on wp.id = hop.id left join wo_hub_place hp on hp.place_id = hop.id
         where coalesce(hp.merged_into, wp.merged_into) is not null and hop.n < $2)
     select distinct on (hop.start) hop.start, hp.place_id, hp.revision
       from hop join wo_hub_place hp on hp.place_id = hop.id
       join wo_hub_snapshot s on s.snapshot_id = hp.current_snapshot_id
      where hp.state = 'live' and s.revoked_at is null
        and not exists (select 1 from wo_place_identity i join wo_hub_suppressed_identity x
                          on x.namespace = i.namespace and x.external_id = i.external_id where i.place_id = hp.place_id)
      order by hop.start, hop.n desc`,
    [placeIds, MERGE_HOPS]
  )
  for (const r of rows) out.set(r.start, { id: r.place_id, revision: Number(r.revision) })
  return out
}

const CELL_CURSOR = 'p1'
function encodeCellCursor(cell, lastId) {
  return `${CELL_CURSOR}.${Buffer.from(JSON.stringify({ c: cell, a: lastId })).toString('base64url')}`
}
function decodeCellCursor(text, cell) {
  const [version, body] = String(text).split('.')
  if (version !== CELL_CURSOR || !body) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return parsed?.c === cell && UUID.test(parsed.a) ? parsed.a : null
  } catch {
    return null
  }
}
