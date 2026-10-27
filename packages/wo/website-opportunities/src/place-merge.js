/**
 * Merging and splitting shared places (shared research plan P3.5, migrations 136–137). Two
 * callers: the URL ↔ Google merge the server makes by itself (`autoMergeFor`, after a place got a snapshot)
 * and the operator's tools on `/ops/wo` › Places (`mergePlaces`, `splitPlace`).
 *
 * A MERGE makes the loser a TOMBSTONE: `merged_into` names the survivor, and its identities stay on it, so
 * every lookup that follows `merged_into` (`resolvePlace`, `rootOf`) lands on the survivor, and a split can
 * restore the loser exactly. The survivor takes the loser's opportunities (`place_id`) and the requests
 * waiting on a stopped run of the loser. Nothing is lost: the loser's snapshots and media stay readable
 * (an account reads a tombstone's picture through its moved opportunity, `store.js placeMediaOf`); the
 * survivor's current snapshot wins, and only a survivor with none adopts the loser's.
 *
 * 🔒 NEVER UNDER A RUN. A merge or split needs both places idle (no queued or running place job), checked
 * under the place row locks a request takes too (`joinPlace`), so a running worker never sees its place
 * change under it. The operator is told `PLACE_BUSY`; an automatic merge is approved in
 * `wo_place_merge_candidate` and applied by the maintenance sweep once both are idle (`applyApprovedMerges`).
 * 🔒 AN AUTOMATIC MERGE COPIES NO LINK. A pasted-URL place's links come from a page a client chose, so they
 * never become a Google place's sources; it merges only when its URL (or where that URL ends after redirects)
 * already IS one of the Google place's links the server vouches for (not one found by web search). A URL two Google places name is not
 * certain: each pair waits for an operator (`pending`). An operator's merge copies the loser's links, marked
 * `verified_by = 'operator'` with where they came from, and a split takes them back.
 */
import { answerOne, joinPlace } from './place-jobs.js'
import { addLink, identityOf } from './places.js'
import { sourceOfUrl } from './sources.js'

/** `actor` of what the server merged by itself. */
export const AUTO_ACTOR = 'auto'
const NAMESPACES = new Set(['google', 'osm', 'url'])
// A link found by web search (`search`, migration 158) is a source, never proof two places are one.
const mergeEvidence = (column) => `${column} not in ('identity', 'search')`

export class PlaceMergeError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** The place a (possibly merged) place id stands for now: its tombstone chain followed to the end. */
export async function rootOf(db, placeId) {
  let id = placeId
  for (let hop = 0; id && hop < 5; hop += 1) {
    const next = (await db.query('select merged_into from wo_place where id = $1', [id])).rows[0]
    if (!next?.merged_into) return next ? id : null
    id = next.merged_into
  }
  return id
}

/**
 * Merge `loserId` into `survivorId` (operator). Copies the loser's links to the survivor.
 * @param {import('pg').Pool} pool
 * @param {string} survivorId
 * @param {string} loserId
 * @param {{ actor: string }} who
 * @returns {Promise<{survivor: string, loser: string, opportunities: number, requests: number}>}
 * @throws {PlaceMergeError} 400 SAME_PLACE · 404 PLACE_NOT_FOUND · 409 PLACE_MERGED · 409 PLACE_BUSY
 */
export async function mergePlaces(pool, survivorId, loserId, { actor }) {
  return inTx(pool, (client) => mergeIn(client, survivorId, loserId, { actor, copyLinks: true }))
}

/**
 * Take `identities` off place `placeId`. When they are exactly the identities of a place merged into it,
 * that merge is undone (the tombstone is a place again, with its opportunities and the links the merge
 * copied); otherwise they become a new place with the opportunities that name them. The place keeps at
 * least one identity of its own.
 * @param {{namespace: string, externalId: string}[]} identities
 * @param {{ actor: string }} who
 * @returns {Promise<{place: string, from: string, restored: boolean, opportunities: number}>}
 * @throws {PlaceMergeError} 400 BAD_IDENTITIES · 404 IDENTITY_NOT_FOUND · 409 IDENTITY_NOT_HERE ·
 *   409 PLACE_MERGED · 409 PLACE_BUSY · 409 LAST_IDENTITY
 */
export async function splitPlace(pool, placeId, identities, { actor }) {
  const wanted = Array.isArray(identities)
    ? identities.filter((i) => NAMESPACES.has(i?.namespace) && typeof i?.externalId === 'string')
    : []
  if (wanted.length === 0 || wanted.length !== identities.length)
    throw new PlaceMergeError(400, 'BAD_IDENTITIES', 'Name the identities to split off.')
  return inTx(pool, async (client) => {
    const place = await lockPlaces(client, [placeId])
    if (place[placeId].merged_into)
      throw new PlaceMergeError(
        409,
        'PLACE_MERGED',
        'This place was merged; split the place it was merged into.'
      )
    await refuseBusy(client, [placeId])
    const owners = []
    for (const i of wanted) {
      const row = (
        await client.query(
          `select i.namespace, i.external_id, i.place_id, p.merged_into from wo_place_identity i
           join wo_place p on p.id = i.place_id where i.namespace = $1 and i.external_id = $2`,
          [i.namespace, i.externalId]
        )
      ).rows[0]
      if (!row) throw new PlaceMergeError(404, 'IDENTITY_NOT_FOUND', 'No place has this identity.')
      if (row.place_id !== placeId && row.merged_into !== placeId)
        throw new PlaceMergeError(409, 'IDENTITY_NOT_HERE', 'This identity belongs to another place.')
      owners.push(row)
    }
    const tombstones = [...new Set(owners.map((o) => o.place_id))].filter((id) => id !== placeId)
    if (tombstones.length === 1 && owners.every((o) => o.place_id === tombstones[0])) {
      const all = await identitiesOf(client, tombstones[0])
      if (all.length === owners.length) return restore(client, placeId, tombstones[0], all, actor)
    }
    const own = await identitiesOf(client, placeId)
    const leaving = new Set(owners.filter((o) => o.place_id === placeId).map(keyOf))
    if (own.filter((i) => !leaving.has(keyOf(i))).length === 0)
      throw new PlaceMergeError(
        409,
        'LAST_IDENTITY',
        'A place keeps at least one identity; merge it instead.'
      )
    const created = (
      await client.query('insert into wo_place (display_name) values ($1) returning id', [
        place[placeId].display_name
      ])
    ).rows[0].id
    for (const o of owners) {
      await client.query(
        'update wo_place_identity set place_id = $3 where namespace = $1 and external_id = $2',
        [o.namespace, o.external_id, created]
      )
      if (o.namespace === 'url')
        await addLink(client, created, sourceOfUrl(o.external_id), o.external_id, 'identity', {
          from: 'identity'
        })
    }
    const moved = await moveNaming(client, placeId, created, owners)
    await recordEvent(client, created, 'split', actor, {
      from: placeId,
      identities: wanted,
      restored: false,
      opportunities: moved
    })
    return { place: created, from: placeId, restored: false, opportunities: moved.length }
  })
}

/**
 * After `placeId` got a snapshot: record where a pasted URL ends after redirects as one more identity of
 * its place, then merge each pasted-URL place that is certainly a Google place (now, or once both are idle)
 * and queue the uncertain pairs for an operator.
 * @returns {Promise<{merged: number, waiting: number, queued: number}>}
 */
export async function autoMergeFor(pool, placeId) {
  const root = await rootOf(pool, placeId)
  const out = { merged: 0, waiting: 0, queued: 0 }
  if (!root) return out
  const ids = await identitiesOf(pool, root)
  const urlPlaces = []
  if (ids.some((i) => i.namespace === 'google')) {
    const links = (
      await pool.query(
        `select url from wo_place_link where place_id = $1 and ${mergeEvidence('verified_by')}`,
        [root]
      )
    ).rows.map((r) => r.url)
    const { rows } = await pool.query(
      `select distinct i.place_id from wo_place_identity i join wo_place p on p.id = i.place_id
       where i.namespace = 'url' and i.external_id = any($1) and p.merged_into is null and i.place_id <> $2
         and not exists (select 1 from wo_place_identity g where g.place_id = i.place_id and g.namespace = 'google')`,
      [links, root]
    )
    urlPlaces.push(...rows.map((r) => r.place_id))
  } else if (ids.some((i) => i.namespace === 'url')) {
    await recordFinalUrl(pool, root)
    urlPlaces.push(root)
  }
  for (const urlPlace of urlPlaces) {
    const r = await evaluateUrlPlace(pool, urlPlace)
    out.merged += r.merged
    out.waiting += r.waiting
    out.queued += r.queued
  }
  return out
}

/**
 * `autoMergeFor` over every pasted-URL place (after a backfill pass: judged once every place it moved has its
 * links, so a site two Google places name is never taken for one).
 * @returns {Promise<{merged: number, waiting: number, queued: number}>}
 */
export async function autoMergeAll(pool) {
  const { rows } = await pool.query(
    `select distinct i.place_id from wo_place_identity i join wo_place p on p.id = i.place_id
     where i.namespace = 'url' and p.merged_into is null and p.current_snapshot_id is not null
       and not exists (select 1 from wo_place_identity g where g.place_id = i.place_id and g.namespace = 'google')
     order by i.place_id`
  )
  const out = { merged: 0, waiting: 0, queued: 0 }
  for (const { place_id: id } of rows) await recordFinalUrl(pool, id)
  for (const { place_id: id } of rows) {
    const r = await evaluateUrlPlace(pool, id)
    out.merged += r.merged
    out.waiting += r.waiting
    out.queued += r.queued
  }
  return out
}

/**
 * Apply the approved merges that waited for their places to be idle (the maintenance sweep).
 * @returns {Promise<{applied: number, waiting: number, failed: number}>}
 */
export async function applyApprovedMerges(pool, { limit = 20 } = {}) {
  const { rows } = await pool.query(
    `select * from wo_place_merge_candidate where state = 'approved' and applied_at is null and apply_error is null
     order by decided_at limit $1`,
    [limit]
  )
  const out = { applied: 0, waiting: 0, failed: 0 }
  for (const row of rows) out[await applyCandidate(pool, row)] += 1
  return out
}

/** Where the website of a pasted-URL place ended after redirects, as one more `url` identity of it. */
export async function recordFinalUrl(db, placeId) {
  const row = (
    await db.query(
      `select s.collected->'pages'->0->>'url' as final from wo_place p
       join wo_place_snapshot_source s on s.snapshot_id = p.current_snapshot_id and s.source = 'website'
       where p.id = $1 and s.status in ('complete', 'partial')`,
      [placeId]
    )
  ).rows[0]
  const identity = identityOf('url', row?.final)
  if (!identity) return
  await db.query(
    `insert into wo_place_identity (namespace, external_id, place_id, source, confidence)
     values ('url', $1, $2, 'redirect', 1) on conflict (namespace, external_id) do nothing`,
    [identity.externalId, placeId]
  )
}

/** The Google places a pasted-URL place's URLs are links of: one → merge, several → ask an operator. */
async function evaluateUrlPlace(pool, urlPlace) {
  const out = { merged: 0, waiting: 0, queued: 0 }
  const { rows: matches } = await pool.query(
    `select l.place_id, min(l.url) as url, min(l.kind) as kind, min(l.verified_by) as verified_by
     from wo_place_identity i
     join wo_place_link l on l.url = i.external_id and ${mergeEvidence('l.verified_by')}
     join wo_place p on p.id = l.place_id
     where i.place_id = $1 and i.namespace = 'url' and l.place_id <> $1 and p.merged_into is null
       and exists (select 1 from wo_place_identity g where g.place_id = l.place_id and g.namespace = 'google')
     group by l.place_id order by l.place_id`,
    [urlPlace]
  )
  const certain = matches.length === 1
  for (const m of matches) {
    const evidence = {
      website: { url: m.url, kind: m.kind, verifiedBy: m.verified_by },
      matches: matches.length
    }
    const { rows } = await pool.query(
      `insert into wo_place_merge_candidate (url_place_id, google_place_id, evidence, score, state, decided_by, decided_at)
       values ($1, $2, $3::jsonb, $4, $5, $6, case when $5 = 'approved' then now() end)
       on conflict (url_place_id, google_place_id) do nothing returning id`,
      [
        urlPlace,
        m.place_id,
        JSON.stringify(evidence),
        certain ? 1 : 0.5,
        certain ? 'approved' : 'pending',
        certain ? AUTO_ACTOR : null
      ]
    )
    if (rows[0] && !certain) out.queued += 1
  }
  if (!certain) return out
  const row = (
    await pool.query(
      'select * from wo_place_merge_candidate where url_place_id = $1 and google_place_id = $2',
      [urlPlace, matches[0].place_id]
    )
  ).rows[0]
  // A pair an operator rejected, or left pending, is the operator's call.
  if (row.state !== 'approved' || row.applied_at || row.apply_error) return out
  const result = await applyCandidate(pool, row)
  if (result === 'applied') out.merged += 1
  else if (result === 'waiting') out.waiting += 1
  return out
}

/** @returns {Promise<'applied' | 'waiting' | 'failed'>} */
async function applyCandidate(pool, row) {
  try {
    await inTx(pool, async (client) => {
      await mergeIn(client, row.google_place_id, row.url_place_id, {
        actor: row.decided_by ?? AUTO_ACTOR,
        copyLinks: false,
        candidateId: row.id
      })
      await client.query('update wo_place_merge_candidate set applied_at = now() where id = $1', [row.id])
    })
    return 'applied'
  } catch (error) {
    if (!(error instanceof PlaceMergeError)) throw error
    if (error.code === 'PLACE_BUSY') return 'waiting'
    const loser = (await pool.query('select merged_into from wo_place where id = $1', [row.url_place_id]))
      .rows[0]
    if (loser?.merged_into === row.google_place_id) {
      await pool.query(
        'update wo_place_merge_candidate set applied_at = coalesce(applied_at, now()) where id = $1',
        [row.id]
      )
      return 'applied'
    }
    await pool.query('update wo_place_merge_candidate set apply_error = $2 where id = $1', [
      row.id,
      error.code
    ])
    return 'failed'
  }
}

/**
 * The merge itself, in the caller's transaction (`client`): `copyLinks` for an operator's merge of two places,
 * never for a URL ↔ Google pair. @throws {PlaceMergeError} as `mergePlaces`
 */
export async function mergeIn(client, survivorId, loserId, { actor, copyLinks, candidateId = null }) {
  if (survivorId === loserId)
    throw new PlaceMergeError(400, 'SAME_PLACE', 'A place cannot be merged into itself.')
  const locked = await lockPlaces(client, [survivorId, loserId])
  if (locked[survivorId].merged_into || locked[loserId].merged_into)
    throw new PlaceMergeError(409, 'PLACE_MERGED', 'One of these places is already merged into another.')
  await refuseBusy(client, [survivorId, loserId])
  await client.query('update wo_place set merged_into = $2, updated_at = now() where id = $1', [
    loserId,
    survivorId
  ])
  // Tombstones of the loser follow it, so a chain is never more than one hop.
  await client.query('update wo_place set merged_into = $2, updated_at = now() where merged_into = $1', [
    loserId,
    survivorId
  ])
  await client.query(
    `insert into wo_place_identity (namespace, external_id, place_id, source) values ('merge', $1, $2, $3)
     on conflict (namespace, external_id) do update set place_id = excluded.place_id, created_at = now()`,
    [loserId, survivorId, actor === AUTO_ACTOR ? 'auto' : 'operator']
  )
  let links = 0
  if (copyLinks)
    links = (
      await client.query(
        `insert into wo_place_link (place_id, kind, url, verified_by, evidence)
         select $2, kind, url, 'operator', jsonb_build_object('mergedFrom', $4::text, 'verifiedBy', verified_by, 'by', $3::text)
         from wo_place_link where place_id = $1
         on conflict (place_id, kind, url) do nothing`,
        [loserId, survivorId, actor, loserId]
      )
    ).rowCount
  if (!locked[survivorId].current_snapshot_id && locked[loserId].current_snapshot_id)
    await client.query('update wo_place set current_snapshot_id = $2 where id = $1', [
      survivorId,
      locked[loserId].current_snapshot_id
    ])
  const requests = await moveStoppedRequests(client, loserId, survivorId)
  const moved = (
    await client.query(
      'update wo_opportunity set place_id = $2, updated_at = now() where place_id = $1 returning id',
      [loserId, survivorId]
    )
  ).rows.map((r) => r.id)
  await client.query(
    `update wo_place_merge_candidate set state = 'rejected', decided_by = 'merge', decided_at = now()
     where state = 'pending' and (url_place_id = $1 or google_place_id = $1)`,
    [loserId]
  )
  await client.query('update wo_place set updated_at = now() where id = $1', [survivorId])
  await recordEvent(client, loserId, 'merge', actor, {
    from: loserId,
    into: survivorId,
    opportunities: moved,
    requests,
    links,
    ...(candidateId ? { candidateId } : {})
  })
  return { survivor: survivorId, loser: loserId, opportunities: moved.length, requests: requests.length }
}

/**
 * A run of the loser stopped on a quota or the switch (paused/blocked) is cancelled, and the requests waiting
 * on it join the survivor instead: answered at once by a fresh snapshot, or by the survivor's next run.
 * @returns {Promise<string[]>} the requests moved
 */
async function moveStoppedRequests(client, loserId, survivorId) {
  const stopped = (
    await client.query(
      `update wo_place_job set state = 'cancelled', lease_token = lease_token + 1, lease_owner = null, lease_until = null,
         updated_at = now() where place_id = $1 and state in ('paused', 'blocked')
       returning id, snapshot_id, started_by, started_by_account_id`,
      [loserId]
    )
  ).rows
  if (stopped.length === 0) return []
  await client.query(
    `update wo_place_snapshot set state = 'failed' where id = any($1::uuid[]) and state = 'preparing'`,
    [stopped.map((j) => j.snapshot_id).filter(Boolean)]
  )
  const { rows: requests } = await client.query(
    `select r.id, o.id as opportunity_id, o.candidate from wo_job r join wo_opportunity o on o.id = r.opportunity_id
     where r.place_job_id = any($1::uuid[]) and r.result_snapshot_id is null and r.state in ('paused', 'blocked')
     for update of r`,
    [stopped.map((j) => j.id)]
  )
  if (requests.length === 0) return []
  // The moved requests' run keeps the payer of the run it replaces (who started it); unknown stays unknown.
  const was = stopped.find((j) => j.started_by)
  const joined = await joinPlace(client, survivorId, {
    starter: was ? { kind: was.started_by, accountId: was.started_by_account_id } : null
  })
  for (const r of requests) {
    if (joined.current)
      await answerOne(client, r, { snapshotId: joined.current.id, placeId: survivorId, now: Date.now() })
    else
      await client.query(
        `update wo_job set place_job_id = $2, state = $3, last_error = null, updated_at = now() where id = $1`,
        [r.id, joined.job.id, joined.job.state === 'running' ? 'running' : 'queued']
      )
  }
  return requests.map((r) => r.id)
}

/** Undo the merge of `tombstone` into `placeId`. */
async function restore(client, placeId, tombstone, identities, actor) {
  await lockPlaces(client, [placeId, tombstone])
  await client.query('update wo_place set merged_into = null, updated_at = now() where id = $1', [tombstone])
  await client.query(`delete from wo_place_identity where namespace = 'merge' and external_id = $1`, [
    tombstone
  ])
  await client.query(`delete from wo_place_link where place_id = $1 and evidence->>'mergedFrom' = $2::text`, [
    placeId,
    tombstone
  ])
  // A survivor that had adopted the tombstone's snapshot gives it back.
  await client.query(
    `update wo_place p set current_snapshot_id = null from wo_place_snapshot s
     where p.id = $1 and s.id = p.current_snapshot_id and s.place_id = $2`,
    [placeId, tombstone]
  )
  // The opportunities the merge moved, and any saved since under one of the tombstone's identities.
  const merge = (
    await client.query(
      `select detail from wo_place_ops_event where place_id = $1 and action = 'merge' and detail->>'into' = $2::text
       order by created_at desc, id desc limit 1`,
      [tombstone, placeId]
    )
  ).rows[0]
  const recorded = Array.isArray(merge?.detail?.opportunities) ? merge.detail.opportunities : []
  const back = (
    await client.query(
      `update wo_opportunity set place_id = $2, updated_at = now() where place_id = $1 and id = any($3::uuid[])
       returning id`,
      [placeId, tombstone, recorded]
    )
  ).rows.map((r) => r.id)
  const moved = [...back, ...(await moveNaming(client, placeId, tombstone, identities))]
  await recordEvent(client, tombstone, 'split', actor, {
    from: placeId,
    identities: identities.map((i) => ({ namespace: i.namespace, externalId: i.external_id })),
    restored: true,
    opportunities: moved
  })
  return { place: tombstone, from: placeId, restored: true, opportunities: moved.length }
}

/** Move the opportunities of `fromId` whose provider id names one of `identities` to `toId`. */
async function moveNaming(client, fromId, toId, identities) {
  const keys = new Set(identities.map(keyOf))
  const opps = (
    await client.query('select id, provider, provider_id from wo_opportunity where place_id = $1', [fromId])
  ).rows.filter((o) => {
    const i = identityOf(o.provider, o.provider_id)
    return i && keys.has(`${i.namespace}\n${i.externalId}`)
  })
  const ids = opps.map((o) => o.id)
  if (ids.length)
    await client.query(
      'update wo_opportunity set place_id = $2, updated_at = now() where id = any($1::uuid[])',
      [ids, toId]
    )
  return ids
}

const keyOf = (i) => `${i.namespace}\n${i.external_id ?? i.externalId}`

async function identitiesOf(db, placeId) {
  return (
    await db.query(
      `select namespace, external_id from wo_place_identity where place_id = $1 and namespace <> 'merge'
       order by namespace, external_id`,
      [placeId]
    )
  ).rows
}

/** Lock places in id order (two opposite merges cannot deadlock). @returns {Promise<Record<string, object>>} */
async function lockPlaces(client, ids) {
  const out = {}
  for (const id of [...new Set(ids)].sort()) {
    const row = (await client.query('select * from wo_place where id = $1 for update', [id])).rows[0]
    if (!row) throw new PlaceMergeError(404, 'PLACE_NOT_FOUND', 'Place not found.')
    out[id] = row
  }
  return out
}

async function refuseBusy(client, ids) {
  const busy = (
    await client.query(
      `select 1 from wo_place_job where place_id = any($1::uuid[]) and state in ('queued', 'running') limit 1`,
      [ids]
    )
  ).rows[0]
  if (busy)
    throw new PlaceMergeError(
      409,
      'PLACE_BUSY',
      'A place is being researched; try again when its run has ended.'
    )
}

async function recordEvent(client, placeId, action, actor, detail) {
  await client.query(
    'insert into wo_place_ops_event (place_id, action, actor, detail) values ($1, $2, $3, $4::jsonb)',
    [placeId, action, actor, JSON.stringify(detail)]
  )
}

async function inTx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
