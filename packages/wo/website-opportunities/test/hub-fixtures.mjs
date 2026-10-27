// Fixture rows for the hub publish tests: a place with identities, accepted observations with hub evidence.
import { createHash, randomUUID } from 'node:crypto'
import { migrate } from '../src/schema/index.js'
import { createHubTokens } from '../src/hub/tokens.js'
import { scratchDatabase } from './scratch-database.mjs'

export async function hubDatabase() {
  const scratch = await scratchDatabase()
  await migrate(scratch.pool)
  return scratch
}

const hex = (text) => createHash('sha256').update(text).digest('hex')

/** A principal with an issued hub token: `{ accountId, token }`. */
export async function makeTokenHolder(pool) {
  const { rows } = await pool.query(`insert into wo_principal (kind) values ('test') returning id`)
  const issued = await createHubTokens({ pool }).issue(rows[0].id)
  return { accountId: issued.accountId, token: issued.token }
}

let n = 0
export async function makePlace(pool, { name = 'Cafe', identities = [] } = {}) {
  const { rows } = await pool.query('insert into wo_place (display_name) values ($1) returning id', [name])
  const placeId = rows[0].id
  const ids = identities.length ? identities : [{ namespace: 'google', externalId: `ChIJ-fixture-${++n}` }]
  for (const id of ids) {
    await pool.query(
      `insert into wo_place_identity (namespace, external_id, place_id, source) values ($1, $2, $3, 'fixture')`,
      [id.namespace, id.externalId, placeId]
    )
  }
  return { placeId, identities: ids }
}

export async function makeAccount(pool) {
  const p = await pool.query(`insert into wo_principal (kind) values ('test') returning id`)
  const { rows } = await pool.query('insert into wo_hub_account (principal_id) values ($1) returning id', [
    p.rows[0].id
  ])
  return rows[0].id
}

/**
 * One accepted observation with one evidence row. `family`/`objectId` are what the hub's evidence says;
 * `subject` is the place identity it is about.
 */
export async function observe(
  pool,
  {
    subject,
    field,
    value,
    family = 'google_maps',
    objectId = subject.externalId,
    fetchedAt = '2026-10-20T10:00:00Z',
    account,
    status = 'accepted'
  }
) {
  const accountId = account ?? (await makeAccount(pool))
  const key = `k-${++n}`
  const c = await pool.query(
    `insert into wo_hub_contribution (account_id, idempotency_key, payload_hash, schema_version, payload_bytes, status)
     values ($1, $2, $3, 'wo-contribution/v1', 100, 'decided') returning id`,
    [accountId, key, hex(key)]
  )
  const o = await pool.query(
    `insert into wo_hub_observation (contribution_id, ordinal, subject_namespace, subject_external_id, field, value,
       claimed_source_family, claimed_source_object_id, observed_at_claimed, status, decided_at, policy_version)
     values ($1, 0, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, now(), 'intake/1') returning id`,
    [
      c.rows[0].id,
      subject.namespace,
      subject.externalId,
      field,
      JSON.stringify(value),
      family,
      objectId,
      fetchedAt,
      status
    ]
  )
  await pool.query(
    `insert into wo_hub_evidence (observation_id, source_family, source_object_id, source_group, fetch_id, fetched_at,
       content_hash, collector_version, result) values ($1, $2, $3, $4, $5, $6, $7, 'fixture/1', '{}')`,
    [
      o.rows[0].id,
      family,
      objectId,
      `${family}:${objectId}`,
      randomUUID(),
      fetchedAt,
      hex(`${family}${objectId}${fetchedAt}`)
    ]
  )
  return o.rows[0].id
}

export async function evidenceRevisionOf(pool, placeId) {
  const { rows } = await pool.query('select evidence_revision from wo_hub_place where place_id = $1', [
    placeId
  ])
  return rows[0] ? Number(rows[0].evidence_revision) : 0
}
