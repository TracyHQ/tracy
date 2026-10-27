/**
 * Hub revocations. Each one is a single transaction that blocks reads at once (place state or snapshot `revoked_at`)
 * and appends its tombstone to the feed in the same commit; nothing waits for a rebuild.
 *
 *   revokePlace       an operator takes a place off the hub (state `revoked`)
 *   suppressBusiness  the business asked to be removed: state `deleted`, every known identity in the suppression
 *                     registry so it never comes back, its media revoked
 *   excludeObservation an observation linked to the wrong business, or revoked by an operator
 *   revokeMedia       one picture
 *   mergePlace        two records were one business: readers of the old id are sent to the surviving one
 *
 * A withdrawn observation (intake sets status `withdrawn`) is handled by the database trigger
 * `wo_hub_observation_changed`, the same way as `excludeObservation`.
 *
 * Workers that publish read `revocationRevisionOf` before they start and hand it to `materialize`, which refuses
 * when the place was revoked meanwhile.
 */
import { appendChange } from './feed.js'

export class HubRevokedError extends Error {
  constructor(placeId, state) {
    super(`wo hub: place ${placeId} is ${state}`)
    this.code = 'revoked'
    this.state = state
  }
}

async function inTransaction(pool, work) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await work(client)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function lockPlace(client, placeId) {
  await client.query('insert into wo_hub_place (place_id) values ($1) on conflict (place_id) do nothing', [
    placeId
  ])
  return (await client.query('select * from wo_hub_place where place_id = $1 for update', [placeId])).rows[0]
}

/** The revocation revision a worker reads before it starts research on a place. */
export async function revocationRevisionOf(db, placeId) {
  const { rows } = await db.query('select revocation_revision from wo_hub_place where place_id = $1', [
    placeId
  ])
  return rows[0] ? Number(rows[0].revocation_revision) : 0
}

/** Throws `HubRevokedError` when the place is not live, or was revoked after `seenRevision` (when given). */
export async function assertPublishable(client, place, seenRevision) {
  if (place.state !== 'live') throw new HubRevokedError(place.place_id, place.state)
  if (
    seenRevision !== undefined &&
    seenRevision !== null &&
    Number(place.revocation_revision) !== Number(seenRevision)
  ) {
    throw new HubRevokedError(place.place_id, 'revoked since the work started')
  }
  if (await identitiesSuppressed(client, place.place_id)) throw new HubRevokedError(place.place_id, 'deleted')
}

async function identitiesSuppressed(db, placeId) {
  const { rows } = await db.query(
    `select 1 from wo_place_identity i join wo_hub_suppressed_identity s
        on s.namespace = i.namespace and s.external_id = i.external_id
      where i.place_id = $1 limit 1`,
    [placeId]
  )
  return rows.length > 0
}

/** Which of `identities` ({namespace, externalId}) were removed at a business's request. */
export async function suppressedIdentities(db, identities) {
  if (!identities.length) return []
  const { rows } = await db.query(
    `select namespace, external_id from wo_hub_suppressed_identity
      where (namespace, external_id) in (select * from unnest($1::text[], $2::text[]))`,
    [identities.map((i) => i.namespace), identities.map((i) => i.externalId)]
  )
  return rows.map((r) => ({ namespace: r.namespace, externalId: r.external_id }))
}

async function endPlace(client, placeId, state, kind, reason, extra = {}) {
  const place = await lockPlace(client, placeId)
  if (place.state === state) return { already: true, revision: Number(place.revision) }
  await client.query(
    `update wo_hub_place set state = $2, revocation_revision = revocation_revision + 1, updated_at = now()
      where place_id = $1`,
    [placeId, state]
  )
  await client.query(
    `update wo_hub_snapshot set revoked_at = now(), revoke_reason = $2 where place_id = $1 and revoked_at is null`,
    [placeId, reason]
  )
  await extra.before?.(client)
  const revision = Number(place.revision)
  // The reason stays in the database; the public feed carries no operator text.
  await appendChange(client, { kind, placeId, revision, detail: extra.detail ?? { scope: 'place' } })
  return { already: false, revision }
}

/** Takes a place off the hub: reads answer 410 and a `revoke` tombstone goes out in the same commit. */
export function revokePlace(pool, { placeId, reason, actor }) {
  if (!reason || !actor) throw new Error('wo hub: a revocation needs a reason and an actor')
  return inTransaction(pool, (client) => endPlace(client, placeId, 'revoked', 'revoke', reason))
}

/**
 * Removal at the business's request: every identity the place (and any place merged into it) is known by goes into
 * the suppression registry, its snapshots and media are revoked, and a `delete` tombstone goes out.
 */
export function suppressBusiness(pool, { placeId, reason, actor }) {
  if (!reason || !actor) throw new Error('wo hub: a removal needs a reason and an actor')
  return inTransaction(pool, (client) =>
    endPlace(client, placeId, 'deleted', 'delete', reason, {
      async before(db) {
        const { rows } = await db.query(
          'insert into wo_hub_suppression (place_id, reason, actor) values ($1, $2, $3) returning id',
          [placeId, reason, actor]
        )
        await db.query(
          `insert into wo_hub_suppressed_identity (namespace, external_id, suppression_id)
           select i.namespace, i.external_id, $2 from wo_place_identity i
            where i.place_id = $1 or i.place_id in (select id from wo_place where merged_into = $1)
           on conflict (namespace, external_id) do nothing`,
          [placeId, rows[0].id]
        )
        await db.query(
          `update wo_place_media set revoked_at = now(), revoke_reason = $2
            where place_id = $1 and revoked_at is null`,
          [placeId, 'removal requested']
        )
      }
    })
  )
}

/** An observation the hub stops trusting: every snapshot showing it is revoked and a tombstone goes out. */
export function excludeObservation(pool, { observationId, reason, actor }) {
  if (!['mis_linked', 'revoked'].includes(reason))
    throw new Error(`wo hub: unknown exclusion reason ${reason}`)
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `select i.place_id from wo_hub_observation o
         join wo_place_identity i on i.namespace = o.subject_namespace and i.external_id = o.subject_external_id
        where o.id = $1`,
      [observationId]
    )
    await client.query(
      `insert into wo_hub_observation_exclusion (observation_id, reason, actor) values ($1, $2, $3)
       on conflict (observation_id) do nothing`,
      [observationId, reason, actor]
    )
    if (rows[0]) {
      await lockPlace(client, rows[0].place_id)
      await client.query('select wo_hub_drop_observation($1, $2, $3)', [
        observationId,
        rows[0].place_id,
        reason
      ])
    }
    return { placeId: rows[0]?.place_id ?? null }
  })
}

/** One picture off the hub: the media door refuses it from this commit on. */
export function revokeMedia(pool, { mediaId, reason }) {
  if (!reason) throw new Error('wo hub: a revocation needs a reason')
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query('select place_id from wo_place_media where id = $1', [mediaId])
    if (!rows[0]) return { revoked: false }
    const place = await lockPlace(client, rows[0].place_id)
    const hit = await client.query(
      `update wo_place_media set revoked_at = now(), revoke_reason = $2 where id = $1 and revoked_at is null`,
      [mediaId, reason]
    )
    if (hit.rowCount) {
      await appendChange(client, {
        kind: 'revoke',
        placeId: place.place_id,
        revision: Number(place.revision),
        detail: { scope: 'media', mediaId }
      })
    }
    return { revoked: hit.rowCount > 0 }
  })
}

/** Two place records were one business: the old id answers 301 to `intoPlaceId` and a `merge` event goes out. */
export function mergePlace(pool, { placeId, intoPlaceId, actor }) {
  if (!actor || placeId === intoPlaceId) throw new Error('wo hub: a merge needs two places and an actor')
  return inTransaction(pool, (client) =>
    endPlace(client, placeId, 'merged', 'merge', 'merged', {
      detail: { into: intoPlaceId },
      async before(db) {
        await db.query('update wo_hub_place set merged_into = $2 where place_id = $1', [placeId, intoPlaceId])
      }
    })
  )
}
