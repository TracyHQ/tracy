/**
 * This server as a CLIENT of a shared research hub (`HUB_URL`, `HUB_TOKEN`; ADR 0036 Phase 3).
 *
 *   placeFacts(identity)     before paying Google for a place's details: the hub's fresh snapshot of it as research
 *                            facts, or null (no hub copy, too old, quota spent, hub down: the run pays as before)
 *   recordUse(db, ...)       a local snapshot took those facts: remembered, so a revocation can reach its briefs
 *   offer(placeId, snapId)   after a local research: its Google facts queued as a contribution (`HUB_CONTRIBUTE=1`)
 *   tick()                   sends queued contributions, then follows `/revocations` and `/changes` from stored cursors
 *
 * What leaves this server is the closed field list of `wo-contribution/v1` (identity, name, website, phone, address, location),
 * read from Google's own record of the place. Opportunities, notes, briefs, demos and outreach never do.
 *
 * A revocation empties the cached copy, takes away the website link it gave, marks the snapshot sources that used it
 * due again, and marks those snapshots, so a brief made afterwards leaves the facts out. Feeds cost no read quota, so
 * revocations arrive even when it is spent. A `410 cursor_expired` re-checks every cached place before reading on.
 */
import { SOURCE_MAX_AGE_MS } from '../places.js'
import { CONTRIBUTION_SCHEMA } from './observations.js'

export const HUB_COLLECTOR_VERSION = 'wo-hub-client/1'
const FEEDS = ['revocations', 'changes']
const OUTBOX_BATCH = 20
const RETRY_MS = 5 * 60_000

const usable = (f) => f && f.status === 'chosen' && !f.blocksBrief && f.value != null
const first = (v) => (Array.isArray(v) ? v[0] : v)

/** A hub place (its public DTO) as the facts a Place Details read gives, holding only what the hub chose. */
export function factsFromHubPlace(dto, identity) {
  const f = dto.fields ?? {}
  const name = usable(f.name) ? first(f.name.value) : null
  const website = usable(f.website) ? first(f.website.value) : null
  const address = usable(f.address) ? first(f.address.value) : null
  const phone = usable(f.phone) ? first(f.phone.value) : null
  return {
    placeId: identity.externalId,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof website === 'string' && /^https?:\/\//i.test(website) ? { website } : {}),
    ...(typeof address === 'string' ? { formattedAddress: address } : {}),
    ...(typeof phone === 'string'
      ? { [phone.startsWith('+') ? 'internationalPhoneNumber' : 'nationalPhoneNumber']: phone }
      : {}),
    amenities: {},
    summaries: {},
    reviews: [],
    photos: [],
    attribution: 'Google',
    via: 'hub',
    hubPlaceId: dto.id,
    hubRevision: dto.revision,
    fetchedAt: dto.freshness?.observedAt ?? dto.freshness?.materializedAt ?? null
  }
}

/** The contribution a local Place Details read makes: Google's record only, the closed field list only. */
export function contributionFromFacts(facts, { observedAt } = {}) {
  const source = { family: 'google_maps', objectId: facts.placeId }
  const at = observedAt ?? facts.fetchedAt
  const obs = (field, value) => ({ field, value, source, ...(at ? { observedAtClaimed: at } : {}) })
  const phone = facts.internationalPhoneNumber ?? facts.nationalPhoneNumber
  return {
    schema: CONTRIBUTION_SCHEMA,
    subject: { identity: { namespace: 'google', externalId: facts.placeId } },
    observations: [
      obs('identity', { namespace: 'google', externalId: facts.placeId }),
      ...(facts.name ? [obs('name', facts.name)] : []),
      ...(facts.website ? [obs('website', facts.website)] : []),
      ...(phone ? [obs('phone', phone)] : []),
      ...(facts.formattedAddress ? [obs('address', facts.formattedAddress)] : []),
      ...(Number.isFinite(facts.location?.latitude) && Number.isFinite(facts.location?.longitude)
        ? [obs('location', { latitude: facts.location.latitude, longitude: facts.location.longitude })]
        : [])
    ]
  }
}

/**
 * The hub place a per-account copy of Google facts came from, when this server has since dropped it (revoked or
 * removed): `{hubPlaceId, revokedAt}`, else null. Per-account facts have no snapshot to mark, so they are checked
 * when read. Null where no hub was ever read (the table is absent on such a host).
 */
export async function revokedHubCopy(db, facts) {
  if (facts?.via !== 'hub' || typeof facts.hubPlaceId !== 'string') return null
  const { rows } = await db.query(`select to_regclass('wo_hub_client_place') is not null as present`)
  if (!rows[0].present) return null
  const hit = (
    await db.query(
      'select revoked_at from wo_hub_client_place where hub_place_id = $1 and revoked_at is not null',
      [facts.hubPlaceId]
    )
  ).rows[0]
  return hit ? { hubPlaceId: facts.hubPlaceId, revokedAt: hit.revoked_at.toISOString() } : null
}

async function inTransaction(pool, work) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await work(client)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * @param {{ pool: import('pg').Pool, client: ReturnType<typeof import('./client.js').createHubClient>,
 *   contribute?: boolean, freshMs?: number, now?: () => number, log?: Console }} deps
 */
export function createHubLink({
  pool,
  client,
  contribute = false,
  freshMs = SOURCE_MAX_AGE_MS,
  now = Date.now,
  log = console
}) {
  /** Feeds start at the hub's head before the first place is cached, so nothing revoked after that is missed. */
  async function ensureCursors() {
    const { rows } = await pool.query('select feed from wo_hub_client_cursor')
    const have = new Set(rows.map((r) => r.feed))
    for (const feed of FEEDS) {
      if (have.has(feed)) continue
      const head = await client.feed(feed, null)
      await saveCursor(feed, head.cursor)
    }
  }
  const saveCursor = (feed, cursor) =>
    pool.query(
      `insert into wo_hub_client_cursor (feed, cursor) values ($1, $2)
       on conflict (feed) do update set cursor = excluded.cursor, updated_at = now()`,
      [feed, cursor]
    )

  async function cache(dto, etag, identity) {
    await inTransaction(pool, async (db) => {
      await db.query(
        `insert into wo_hub_client_place (hub_place_id, revision, etag, dto, fetched_at) values ($1, $2, $3, $4::jsonb, $5)
         on conflict (hub_place_id) do update set revision = excluded.revision, etag = excluded.etag, dto = excluded.dto,
           fetched_at = excluded.fetched_at, revoked_at = null, revoke_kind = null`,
        [dto.id, dto.revision, etag, JSON.stringify(dto), new Date(now())]
      )
      await db.query(
        `insert into wo_hub_client_identity (namespace, external_id, hub_place_id) values ($1, $2, $3)
         on conflict (namespace, external_id) do update set hub_place_id = excluded.hub_place_id`,
        [identity.namespace, identity.externalId, dto.id]
      )
    })
  }

  /** @returns {Promise<{ facts: object, hubPlaceId: string, revision: number } | null>} */
  async function placeFacts(identity) {
    try {
      await ensureCursors()
      const found = await client.lookup([identity])
      if (found?.status !== 'found') return null
      const held = (
        await pool.query('select revision, etag, dto from wo_hub_client_place where hub_place_id = $1', [
          found.id
        ])
      ).rows[0]
      let dto = held?.dto && Number(held.revision) === found.revision ? held.dto : null
      if (!dto) {
        const answer = await client.place(found.id, { etag: held?.dto ? held.etag : undefined })
        if (answer.status === 'not_modified') dto = held.dto
        else if (answer.status === 'gone') {
          await revoke(found.id, 'gone')
          return null
        } else if (answer.status !== 'ok') return null
        else {
          dto = answer.dto
          await cache(dto, answer.etag, identity)
        }
      }
      const facts = factsFromHubPlace(dto, identity)
      if (!facts.fetchedAt || now() - Date.parse(facts.fetchedAt) > freshMs || !facts.name) return null
      return { facts, hubPlaceId: dto.id, revision: dto.revision }
    } catch (error) {
      log.warn?.(
        `[wo hub] lookup of ${identity.namespace}:${identity.externalId} failed: ${error?.code ?? error?.message}`
      )
      return null
    }
  }

  async function recordUse(db, snapshotId, { hubPlaceId, revision }, source) {
    await db.query(
      `insert into wo_hub_client_use (snapshot_id, hub_place_id, hub_revision, source) values ($1, $2, $3, $4)
       on conflict (snapshot_id, hub_place_id) do update set hub_revision = excluded.hub_revision, revoked_at = null`,
      [snapshotId, hubPlaceId, revision, source]
    )
  }

  /** Queues the Google facts a finished local run read itself; facts that came from the hub are not sent back. */
  async function offer(placeId, snapshotId) {
    if (!contribute) return false
    const row = (
      await pool.query(
        `select collected, collected_at from wo_place_snapshot_source
          where snapshot_id = $1 and source = 'google-places' and status = 'complete'
            and coalesce(coverage->>'provenance', '') <> 'hub'`,
        [snapshotId]
      )
    ).rows[0]
    const facts = row?.collected
    if (!facts?.placeId || facts.via === 'hub') return false
    const body = contributionFromFacts(facts, { observedAt: row.collected_at?.toISOString() })
    await pool.query('insert into wo_hub_client_outbox (place_id, body) values ($1, $2::jsonb)', [
      placeId,
      JSON.stringify(body)
    ])
    return true
  }

  async function sendOutbox() {
    const { rows } = await pool.query(
      `select id, body from wo_hub_client_outbox where sent_at is null and next_at <= $1 order by created_at limit $2`,
      [new Date(now()), OUTBOX_BATCH]
    )
    let sent = 0
    for (const r of rows) {
      let answer
      try {
        answer = await client.contribute(r.body, r.id)
      } catch (error) {
        answer = { status: 'refused', code: error?.code ?? 'HUB_ERROR', retry: true }
      }
      if (answer.status === 'accepted') {
        sent++
        await pool.query(
          'update wo_hub_client_outbox set sent_at = $2, receipt_id = $3, last_error = null where id = $1',
          [r.id, new Date(now()), answer.receipt.id]
        )
        continue
      }
      // A refusal of the payload itself (4xx but quota and rate) will not get better: stop retrying it.
      const final =
        !answer.retry && answer.httpStatus !== 429 && answer.httpStatus >= 400 && answer.httpStatus < 500
      await pool.query(
        `update wo_hub_client_outbox set attempts = attempts + 1, last_error = $2,
           next_at = case when $3 then 'infinity'::timestamptz else $4 end where id = $1`,
        [r.id, answer.code ?? String(answer.httpStatus), final, new Date(now() + RETRY_MS)]
      )
    }
    return sent
  }

  /** Drops a hub place from this server: cache, links it gave, and every snapshot that used it is marked. */
  async function revoke(hubPlaceId, kind) {
    return inTransaction(pool, async (db) => {
      const hit = await db.query(
        `update wo_hub_client_place set dto = null, etag = null, revoked_at = $2, revoke_kind = $3
          where hub_place_id = $1 and (dto is not null or revoked_at is null)`,
        [hubPlaceId, new Date(now()), kind]
      )
      const uses = await db.query(
        `update wo_hub_client_use set revoked_at = $2 where hub_place_id = $1 and revoked_at is null
         returning snapshot_id, source`,
        [hubPlaceId, new Date(now())]
      )
      for (const u of uses.rows) {
        // Scheduling facts only (a published snapshot keeps what it showed): the source is due again.
        await db.query(
          `update wo_place_snapshot_source set collected_at = null,
             coverage = coalesce(coverage, '{}'::jsonb) || jsonb_build_object('hubRevoked', true)
           where snapshot_id = $1 and source = $2`,
          [u.snapshot_id, u.source]
        )
      }
      await db.query(`delete from wo_place_link where verified_by = 'hub' and evidence->>'hubPlaceId' = $1`, [
        hubPlaceId
      ])
      return hit.rowCount > 0 || uses.rowCount > 0
    })
  }

  async function cachedIds() {
    return new Set(
      (await pool.query('select hub_place_id from wo_hub_client_place where dto is not null')).rows.map(
        (r) => r.hub_place_id
      )
    )
  }

  /** After an expired cursor: every cached place is checked again; one the hub no longer serves is dropped. */
  async function revalidate() {
    const { rows } = await pool.query(
      'select hub_place_id, etag from wo_hub_client_place where dto is not null'
    )
    let dropped = 0
    for (const r of rows) {
      const answer = await client.place(r.hub_place_id, { etag: r.etag })
      if (answer.status === 'gone' || answer.status === 'not_found') {
        if (await revoke(r.hub_place_id, 'gone')) dropped++
      } else if (answer.status === 'ok') {
        await pool.query(
          'update wo_hub_client_place set revision = $2, etag = $3, dto = $4::jsonb, fetched_at = $5 where hub_place_id = $1',
          [r.hub_place_id, answer.dto.revision, answer.etag, JSON.stringify(answer.dto), new Date(now())]
        )
      } else if (answer.status === 'quota') {
        // Not checkable now: not used either, until a lookup reads it again.
        await pool.query('update wo_hub_client_place set dto = null, etag = null where hub_place_id = $1', [
          r.hub_place_id
        ])
      }
    }
    return dropped
  }

  async function follow(feed, tally) {
    const stored = (await pool.query('select cursor from wo_hub_client_cursor where feed = $1', [feed]))
      .rows[0]?.cursor
    if (!stored) return
    let cursor = stored
    for (let page = 0; page < 50; page++) {
      const answer = await client.feed(feed, cursor)
      if (answer.status === 'cursor_expired') {
        const head = (await client.feed(feed, null)).cursor
        tally.revoked += await revalidate()
        tally.revalidated++
        await saveCursor(feed, head)
        return
      }
      const cached = await cachedIds()
      for (const e of answer.events) {
        const ends = e.kind === 'delete' || e.kind === 'merge' || (e.kind === 'revoke' && e.scope !== 'media')
        if (ends && (cached.has(e.placeId) || feed === 'revocations')) {
          if (await revoke(e.placeId, e.kind)) tally.revoked++
        } else if (e.kind === 'upsert') tally.changed++
      }
      cursor = answer.cursor
      await saveCursor(feed, cursor)
      if (!answer.more) return
    }
  }

  /** @returns {Promise<{ contributed: number, revoked: number, changed: number, revalidated: number }>} */
  async function tick() {
    const tally = { contributed: 0, revoked: 0, changed: 0, revalidated: 0 }
    tally.contributed = await sendOutbox()
    // Revocations first: they must land even when everything else the hub answers is refused.
    for (const feed of FEEDS) await follow(feed, tally)
    return tally
  }

  return { placeFacts, recordUse, offer, tick, revoke }
}
