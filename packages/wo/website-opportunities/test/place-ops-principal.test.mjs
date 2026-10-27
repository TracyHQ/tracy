// The /ops place actions record who pressed them as a principal the host names (`host.principalOf`): the open layer
// never reads a host's own user table, so they work on a database that has none.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { placeDetail, refreshPlace, researchAgainPlace } from '../src/wo-places-store.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const NOW = Date.parse('2026-10-24T12:00:00Z')

let db
let operator
const asked = []
const principalOf = async (pool, email) => {
  asked.push(email)
  const { rows } = await pool.query('select id from wo_principal where external_ref = $1', [email])
  return rows[0]?.id ?? null
}

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool, { lockId: createHash('sha256').update(db.url).digest().readUInt32BE(0) })
  operator = (
    await db.pool.query(
      `insert into wo_principal (kind, external_ref) values ('operator', 'ops@example.com') returning id`
    )
  ).rows[0].id
})
after(async () => {
  await db?.close()
})

/** A place whose website was read 60 days ago, so Research again has a part to run. */
async function researchedPlace() {
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    const place = (
      await client.query('insert into wo_place (display_name) values ($1) returning id', ['Cafe'])
    ).rows[0].id
    const old = new Date(NOW - 60 * 24 * 3_600_000)
    const snapshot = (
      await client.query(
        `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'published', $2) returning id`,
        [place, old]
      )
    ).rows[0].id
    await client.query(
      `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected_at, attempted_at)
       values ($1, 'website', 'https://cafe.example.com/', 'complete', $2, $2)`,
      [snapshot, old]
    )
    await client.query('update wo_place set current_snapshot_id = $2 where id = $1', [place, snapshot])
    await client.query('commit')
    return place
  } finally {
    client.release()
  }
}

const startedBy = async (jobId) =>
  (await db.pool.query('select started_by, started_by_account_id from wo_place_job where id = $1', [jobId]))
    .rows[0]

test('Refresh pressed on /ops is paid by the operator the host names', opts, async () => {
  const place = await researchedPlace()
  const out = await refreshPlace(db.pool, place, {
    actor: 'ops@example.com',
    caps: null,
    nowMs: NOW,
    principalOf
  })
  assert.deepEqual(await startedBy(out.job.id), { started_by: 'operator', started_by_account_id: operator })
  assert.ok(asked.includes('ops@example.com'))
})

test('Research again pressed on /ops is paid by the operator the host names', opts, async () => {
  const place = await researchedPlace()
  const out = await researchAgainPlace(db.pool, place, {
    actor: 'ops@example.com',
    caps: null,
    nowMs: NOW,
    keys: {},
    settings: {},
    domain: null,
    principalOf
  })
  assert.ok(out.plan.run.some((r) => r.part === 'website'))
  assert.deepEqual(await startedBy(out.job.id), { started_by: 'operator', started_by_account_id: operator })
})

test('an operator the host does not know is recorded without a principal', opts, async () => {
  const place = await researchedPlace()
  const out = await refreshPlace(db.pool, place, {
    actor: 'new@example.com',
    caps: null,
    nowMs: NOW,
    principalOf
  })
  assert.deepEqual(await startedBy(out.job.id), { started_by: 'operator', started_by_account_id: null })
})

test(
  'the place detail names its accounts through the host, on a database with no user table',
  opts,
  async () => {
    const place = await researchedPlace()
    const seller = (
      await db.pool.query(
        `insert into wo_principal (kind, external_ref) values ('test', 'seller@example.com') returning id`
      )
    ).rows[0].id
    for (const id of ['ChIJ-a', 'ChIJ-b'])
      await db.pool.query(
        `insert into wo_opportunity (account_id, name, provider, provider_id, place_id) values ($1, 'Cafe', 'google-places', $2, $3)`,
        [seller, id, place]
      )
    const named = await placeDetail(db.pool, place, NOW, {
      emailOf: async (_pool, id) => (id === seller ? 'seller@example.com' : null),
      displayNameOf: async (_pool, id) => (id === seller ? 'Mai' : '')
    })
    assert.deepEqual(
      named.accounts.map((a) => [a.accountId, a.email, a.name, a.opportunities]),
      [[seller, 'seller@example.com', 'Mai', 2]]
    )
    // A host that names nobody: the rows stay, without an email or a name.
    const plain = await placeDetail(db.pool, place, NOW)
    assert.deepEqual(
      plain.accounts.map((a) => [a.accountId, a.email, a.name, a.opportunities]),
      [[seller, null, null, 2]]
    )
  }
)
