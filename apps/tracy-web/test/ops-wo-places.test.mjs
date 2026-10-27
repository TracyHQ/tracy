// /ops/wo › Places (`src/ops/wo-places.js` + `website-opportunities/src/wo-places-store.js`): the operator's view of the
// shared place store (tasks/todo-wo-shared-research.md P4). Staff read; owner/admin from this
// deployment's origin act; every action leaves a `wo_place_ops_event`. Real PostgreSQL, real migrations.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { woPlacesOpsRoutes } from '../src/ops/wo-places.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const pg = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const SECRET = 'ops-wo-places-secret-32-chars!!!'
const ORIGIN = 'https://cowork.tracy.test'
const DAY = 24 * 3600 * 1000
const NOW = Date.parse('2026-10-19T09:00:00.000Z')
const TODAY = '2026-10-19'
const ago = (days) => new Date(NOW - days * DAY)
const quiet = { log() {} }

async function staff() {
  const w = (
    await db.pool.query("insert into workspace(display_name, kind) values('Ops', 'tracy_admin') returning id")
  ).rows[0].id
  for (const [email, role] of [
    ['owner@tracy.test', 'owner'],
    ['dev@tracy.test', 'developer']
  ]) {
    const id = (await db.pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
    await db.pool.query(
      'insert into seat_workspace(workspace_id, account_id, role, granted_by, accepted_at) values($1, $2, $3, $2, now())',
      [w, id, role]
    )
  }
}

async function account(email) {
  return (await db.pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

async function place(name, identity = { namespace: 'google', externalId: `g-${name}` }) {
  const id = (await db.pool.query('insert into wo_place (display_name) values ($1) returning id', [name]))
    .rows[0].id
  await db.pool.query(
    'insert into wo_place_identity (namespace, external_id, place_id, source) values ($1, $2, $3, $4)',
    [identity.namespace, identity.externalId, id, identity.namespace === 'url' ? 'url' : 'google-places']
  )
  return id
}

/** `open`: left `preparing` so pictures can still be attached; `seal` publishes it (the snapshot guard, schema 0004). */
async function publish(placeId, sources, { open = false } = {}) {
  const snap = (
    await db.pool.query(
      `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'preparing', $2) returning id`,
      [placeId, ago(1)]
    )
  ).rows[0].id
  for (const s of sources)
    await db.pool.query(
      `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected_at, attempted_at, last_error)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        snap,
        s.source,
        s.ref ?? null,
        s.status ?? 'done',
        s.collectedAt ?? null,
        s.attemptedAt ?? s.collectedAt ?? null,
        s.lastError ? JSON.stringify(s.lastError) : null
      ]
    )
  if (!open) await seal(snap)
  await db.pool.query('update wo_place set current_snapshot_id = $2 where id = $1', [placeId, snap])
  return snap
}

const seal = (snap) => db.pool.query(`update wo_place_snapshot set state = 'published' where id = $1`, [snap])

async function media(placeId, snapshotId, sha, { revoked = false } = {}) {
  const id = (
    await db.pool.query(
      `insert into wo_place_media (place_id, sha256, object_key, kind, mime, source, source_url, provider, revoked_at, revoke_reason)
       values ($1, $2, $3, 'image', 'image/png', 'website', $4, 'website', $5, $6) returning id`,
      [
        placeId,
        sha,
        `places/${placeId}/${sha}.png`,
        `https://pho.example/${sha}.png`,
        revoked ? ago(2) : null,
        revoked ? 'takedown request' : null
      ]
    )
  ).rows[0].id
  await db.pool.query('insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2)', [
    snapshotId,
    id
  ])
  return id
}

async function opportunity(accountId, placeId, name = 'Pho Ba') {
  return (
    await db.pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, place_id) values ($1, $2, 'google-places', $3, $4) returning id`,
      [accountId, name, `pid-${accountId}-${name}`, placeId]
    )
  ).rows[0].id
}

async function cost(
  placeId,
  day,
  state,
  cents,
  { actual = null, provider = 'apify', operation = 'apify~instagram-scraper' } = {}
) {
  await db.pool.query(
    `insert into wo_cost_ledger (budget_day, place_id, provider, operation, reserved_cents, actual_cents, state)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [day, placeId, provider, operation, cents, actual, state]
  )
}

function door() {
  const app = woPlacesOpsRoutes({
    pool: db.pool,
    config: { origin: ORIGIN, sessionSecret: SECRET },
    log: quiet,
    now: () => NOW,
    resolve: async () => [{ address: '157.240.1.35', family: 4 }]
  })
  return async (path, { method = 'GET', body, as = 'owner@tracy.test', origin = ORIGIN } = {}) => {
    const headers = { 'content-type': 'application/json', origin }
    if (as) headers.cookie = `${SESSION_COOKIE}=${await mintSession(as, SECRET)}`
    const res = await app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
}

/** A Google place two accounts saved: one stale source, a failed last run, one revoked picture, costs. */
async function seedPho() {
  await staff()
  const a = await account('a@customer.test')
  const b = await account('b@customer.test')
  const pho = await place('Pho Ba')
  const snap = await publish(
    pho,
    [
      { source: 'website', ref: 'https://pho.example/', collectedAt: ago(3) },
      {
        source: 'instagram',
        ref: 'https://instagram.com/pho',
        collectedAt: ago(40),
        attemptedAt: ago(2),
        lastError: { code: 'APIFY_TIMEOUT' }
      }
    ],
    { open: true }
  )
  const m1 = await media(pho, snap, 'a'.repeat(64))
  const m2 = await media(pho, snap, 'b'.repeat(64), { revoked: true })
  await seal(snap)
  await opportunity(a, pho)
  await opportunity(a, pho, 'Pho Ba (2)')
  await opportunity(b, pho)
  await db.pool.query(
    `insert into wo_place_job (place_id, state, last_error, updated_at) values ($1, 'failed', $2::jsonb, $3)`,
    [pho, JSON.stringify({ code: 'APIFY_TIMEOUT', message: 'Instagram run timed out' }), ago(2)]
  )
  await cost(pho, TODAY, 'settled', 30, { actual: 12 })
  await cost(pho, TODAY, 'settled', 5) // no known cost: counts its ceiling
  await cost(pho, TODAY, 'reserved', 40)
  await cost(pho, TODAY, 'unreconciled', 7)
  await cost(pho, TODAY, 'released', 99) // never went out
  await cost(pho, '2026-10-09', 'settled', 20, { actual: 20 })
  await cost(pho, '2026-09-01', 'settled', 500, { actual: 500 }) // older than 30 days
  const fresh = await place('Com Tam')
  await publish(fresh, [{ source: 'website', ref: 'https://comtam.example/', collectedAt: ago(1) }])
  return { a, b, pho, snap, m1, m2, fresh }
}

test(
  'staff read the places list; a signed-out caller is sent to sign in, a customer gets nothing',
  pg,
  async () => {
    await seedPho()
    const call = door()
    assert.equal((await call('/api/ops/wo/places', { as: 'dev@tracy.test' })).status, 200)
    assert.equal((await call('/api/ops/wo/places', { as: 'a@customer.test' })).status, 403)
    assert.notEqual((await call('/api/ops/wo/places', { as: null })).status, 200)
  }
)

test(
  'a place row counts its accounts, opportunities, costs, freshness, last run and revoked media',
  pg,
  async () => {
    const { pho } = await seedPho()
    const { status, body } = await door()('/api/ops/wo/places')
    assert.equal(status, 200)
    const row = body.places.find((p) => p.id === pho)
    assert.equal(row.name, 'Pho Ba')
    assert.equal(row.accounts, 2)
    assert.equal(row.opportunities, 3)
    assert.deepEqual(row.cost.today, { spentCents: 17, reservedCents: 40, unreconciledCents: 7 })
    assert.deepEqual(row.cost.last30, { spentCents: 37, reservedCents: 40, unreconciledCents: 7 })
    assert.equal(row.freshness, 'stale')
    const insta = row.sources.find((s) => s.source === 'instagram')
    assert.equal(insta.stale, true)
    assert.equal(insta.lastError.code, 'APIFY_TIMEOUT')
    assert.equal(row.sources.find((s) => s.source === 'website').stale, false)
    assert.equal(row.lastJob.state, 'failed')
    assert.equal(row.lastJob.lastError.message, 'Instagram run timed out')
    assert.deepEqual(row.media, { total: 2, revoked: 1 })
    assert.equal(body.places.length, 2)
  }
)

test('filters: stale, failing, revoked and a name search', pg, async () => {
  const { pho, fresh } = await seedPho()
  const call = door()
  const ids = async (qs) => (await call(`/api/ops/wo/places${qs}`)).body.places.map((p) => p.id)
  assert.deepEqual(await ids('?state=stale'), [pho])
  assert.deepEqual(await ids('?state=failing'), [pho])
  assert.deepEqual(await ids('?state=revoked'), [pho])
  assert.deepEqual(await ids('?q=com'), [fresh])
  const counts = (await call('/api/ops/wo/places')).body.counts
  assert.deepEqual(counts, { all: 2, stale: 1, failing: 1, revoked: 1, merge: 0 })
})

test('the list pages by cursor', pg, async () => {
  const { pho, fresh } = await seedPho()
  const call = door()
  const first = await call('/api/ops/wo/places?limit=1')
  assert.equal(first.body.places.length, 1)
  assert.ok(first.body.nextCursor)
  const second = await call(`/api/ops/wo/places?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
  assert.equal(second.body.places.length, 1)
  assert.equal(second.body.nextCursor, null)
  assert.deepEqual(new Set([first.body.places[0].id, second.body.places[0].id]), new Set([pho, fresh]))
})

test(
  'the detail names every account by email, every picture with its provenance, and the costs by operation',
  pg,
  async () => {
    const { pho, m2 } = await seedPho()
    const { status, body } = await door()(`/api/ops/wo/places/${pho}`)
    assert.equal(status, 200)
    assert.deepEqual(body.accounts.map((a) => [a.email, a.opportunities]).sort(), [
      ['a@customer.test', 2],
      ['b@customer.test', 1]
    ])
    const revoked = body.media.find((m) => m.id === m2)
    assert.equal(revoked.revokeReason, 'takedown request')
    assert.equal(revoked.sourceUrl, `https://pho.example/${'b'.repeat(64)}.png`)
    assert.equal(revoked.inCurrentSnapshot, true)
    assert.equal(body.snapshots.length, 1)
    assert.equal(body.snapshots[0].sources, 2)
    assert.deepEqual(
      body.costByOperation.map((c) => [c.provider, c.spentCents, c.reservedCents, c.unreconciledCents]),
      [['apify', 37, 40, 7]]
    )
    assert.equal((await door()('/api/ops/wo/places/7d1c0a52-0000-4000-8000-000000000000')).status, 404)
  }
)

test('only an owner or admin from this origin may act; a refused call changes nothing', pg, async () => {
  const { pho } = await seedPho()
  const call = door()
  const path = `/api/ops/wo/places/${pho}/refresh`
  assert.equal((await call(path, { method: 'POST', as: 'dev@tracy.test' })).status, 403)
  assert.equal((await call(path, { method: 'POST', origin: 'https://evil.test' })).status, 403)
  const jobs = await db.pool.query(`select 1 from wo_place_job where place_id = $1 and state = 'queued'`, [
    pho
  ])
  assert.equal(jobs.rowCount, 0)
})

test('force refresh queues at most one next run and is recorded with the operator', pg, async () => {
  const { pho } = await seedPho()
  const call = door()
  const running = (
    await db.pool.query(`insert into wo_place_job (place_id, state) values ($1, 'running') returning id`, [
      pho
    ])
  ).rows[0].id
  const first = await call(`/api/ops/wo/places/${pho}/refresh`, { method: 'POST' })
  assert.equal(first.status, 200)
  assert.equal(first.body.outcome, 'after-running')
  assert.notEqual(first.body.job.id, running)
  const again = await call(`/api/ops/wo/places/${pho}/refresh`, { method: 'POST' })
  assert.equal(again.body.outcome, 'joined')
  assert.equal(again.body.job.id, first.body.job.id)
  const queued = await db.pool.query(
    `select force from wo_place_job where place_id = $1 and state = 'queued'`,
    [pho]
  )
  assert.deepEqual(queued.rows, [{ force: true }])
  const history = (await call(`/api/ops/wo/places/${pho}`)).body.history
  assert.deepEqual(
    history.map((e) => [e.action, e.actor]),
    [
      ['refresh', 'owner@tracy.test'],
      ['refresh', 'owner@tracy.test']
    ]
  )
})

const capsLand = normalizeWoOpsSettings({ researchDailyCapCents: 64 }).researchDailyCapCents === 64
test('force refresh is refused once today’s research budget is spent', {
  skip: !url ? 'set TEST_DATABASE_URL' : capsLand ? false : 'P2 settings fields not on this branch yet'
}, async () => {
  const { pho } = await seedPho()
  // Today: 17 spent + 40 held + 7 unreconciled = 64.
  await db.pool.query(
    `insert into wo_ops_setting (id, settings, updated_by) values (true, $1::jsonb, 'test')`,
    [JSON.stringify({ researchDailyCapCents: 64 })]
  )
  const res = await door()(`/api/ops/wo/places/${pho}/refresh`, { method: 'POST' })
  assert.equal(res.status, 409)
  assert.equal(res.body.error, 'DAILY_CAP_REACHED')
  await db.pool.query(`update wo_ops_setting set settings = $1::jsonb`, [
    JSON.stringify({ researchDailyCapCents: 65 })
  ])
  assert.equal((await door()(`/api/ops/wo/places/${pho}/refresh`, { method: 'POST' })).status, 200)
})

test('revoke needs a reason, keeps the row, and unrevoke restores it; both are recorded', pg, async () => {
  const { pho, m1 } = await seedPho()
  const call = door()
  const path = (verb) => `/api/ops/wo/places/${pho}/media/${m1}/${verb}`
  assert.equal((await call(path('revoke'), { method: 'POST', body: {} })).status, 400)
  const revoked = await call(path('revoke'), { method: 'POST', body: { reason: 'legal: owner asked' } })
  assert.equal(revoked.status, 200)
  assert.equal(revoked.body.media.revokeReason, 'legal: owner asked')
  assert.ok(revoked.body.media.revokedAt)
  let row = (await call(`/api/ops/wo/places/${pho}`)).body
  assert.equal(row.place.media.revoked, 2)
  const restored = await call(path('unrevoke'), { method: 'POST' })
  assert.equal(restored.body.media.revokedAt, null)
  row = (await call(`/api/ops/wo/places/${pho}`)).body
  assert.equal(row.place.media.revoked, 1)
  assert.deepEqual(
    row.history.map((e) => e.action),
    ['unrevoke', 'revoke']
  )
  const other = await place('Elsewhere')
  assert.equal(
    (await call(`/api/ops/wo/places/${other}/media/${m1}/revoke`, { method: 'POST', body: { reason: 'x' } }))
      .status,
    404
  )
})

test('merge moves the opportunities and resolves through merged_into; split puts them back', pg, async () => {
  const { a, pho } = await seedPho()
  const call = door()
  const pasted = await place('pho.example', { namespace: 'url', externalId: 'https://pho.example' })
  const urlOpp = (
    await db.pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, place_id)
       values ($1, 'pho.example', 'url', 'https://pho.example/', $2) returning id`,
      [a, pasted]
    )
  ).rows[0].id
  const merged = await call(`/api/ops/wo/places/${pasted}/merge`, { method: 'POST', body: { into: pho } })
  assert.equal(merged.status, 200)
  assert.equal(merged.body.opportunities, 1)
  const placeOf = async (id) =>
    (await db.pool.query('select place_id from wo_opportunity where id = $1', [id])).rows[0].place_id
  assert.equal(await placeOf(urlOpp), pho)
  const list = (await call('/api/ops/wo/places')).body.places.map((p) => p.id)
  assert.equal(list.includes(pasted), false)
  const detail = (await call(`/api/ops/wo/places/${pho}`)).body
  assert.deepEqual(
    detail.mergedPlaces.map((p) => p.id),
    [pasted]
  )
  assert.equal(detail.place.accounts, 2)

  assert.equal(
    (await call(`/api/ops/wo/places/${pho}/merge`, { method: 'POST', body: { into: pho } })).status,
    400
  )
  const split = await call(`/api/ops/wo/places/${pho}/split`, {
    method: 'POST',
    body: { identity: { namespace: 'url', externalId: 'https://pho.example' } }
  })
  assert.equal(split.status, 200)
  assert.equal(split.body.place, pasted)
  assert.equal(split.body.restored, true)
  assert.equal(await placeOf(urlOpp), pasted)
  const history = (await call(`/api/ops/wo/places/${pasted}`)).body.history.map((e) => e.action)
  assert.deepEqual(history, ['split', 'merge'])
})

test(
  'split of a place’s own identity makes a new place with the opportunities that name it',
  pg,
  async () => {
    const { a, pho } = await seedPho()
    await db.pool.query(
      `insert into wo_place_identity (namespace, external_id, place_id, source) values ('google', 'g-second', $1, 'google-maps')`,
      [pho]
    )
    const second = (
      await db.pool.query(
        `insert into wo_opportunity (account_id, name, provider, provider_id, place_id)
       values ($1, 'Pho Ba 2', 'google-maps', 'g-second', $2) returning id`,
        [a, pho]
      )
    ).rows[0].id
    const call = door()
    const res = await call(`/api/ops/wo/places/${pho}/split`, {
      method: 'POST',
      body: { identity: { namespace: 'google', externalId: 'g-second' } }
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.restored, false)
    assert.equal(res.body.opportunities, 1)
    const moved = (await db.pool.query('select place_id from wo_opportunity where id = $1', [second])).rows[0]
    assert.equal(moved.place_id, res.body.place)
    const last = await call(`/api/ops/wo/places/${pho}/split`, {
      method: 'POST',
      body: { identity: { namespace: 'google', externalId: 'g-Pho Ba' } }
    })
    assert.equal(last.status, 409)
    assert.equal(last.body.error, 'LAST_IDENTITY')
  }
)

test('merge and split are refused while the place is being researched', pg, async () => {
  const { pho, fresh } = await seedPho()
  await db.pool.query(`insert into wo_place_job (place_id, state) values ($1, 'running')`, [pho])
  const res = await door()(`/api/ops/wo/places/${pho}/merge`, { method: 'POST', body: { into: fresh } })
  assert.equal(res.status, 409)
  assert.equal(res.body.error, 'PLACE_BUSY')
})

test(
  'the merge queue lists pending pairs; approve merges the URL place, reject leaves both',
  pg,
  async () => {
    const { pho, fresh } = await seedPho()
    const pasted = await place('pho.example', { namespace: 'url', externalId: 'https://pho.example' })
    const other = await place('comtam.example', { namespace: 'url', externalId: 'https://comtam.example' })
    const insert = async (u, g, score) =>
      (
        await db.pool.query(
          `insert into wo_place_merge_candidate (url_place_id, google_place_id, score, evidence)
         values ($1, $2, $3, $4::jsonb) returning id`,
          [u, g, score, JSON.stringify({ website: { url: 'https://pho.example' } })]
        )
      ).rows[0].id
    const yes = await insert(pasted, pho, 0.8)
    const no = await insert(other, fresh, 0.4)
    const call = door()
    const queue = (await call('/api/ops/wo/places/merge-queue')).body.candidates
    assert.deepEqual(
      queue.map((c) => c.id),
      [yes, no]
    )
    assert.deepEqual(queue[0].googlePlace.identities, ['g-Pho Ba'])
    assert.equal((await call('/api/ops/wo/places?state=merge')).body.places.length, 4)
    assert.equal(
      (await call(`/api/ops/wo/places/merge-queue/${yes}/approve`, { method: 'POST', as: 'dev@tracy.test' }))
        .status,
      403
    )
    assert.equal(
      (await call(`/api/ops/wo/places/merge-queue/${yes}/approve`, { method: 'POST' })).status,
      200
    )
    assert.equal((await call(`/api/ops/wo/places/merge-queue/${no}/reject`, { method: 'POST' })).status, 200)
    assert.equal((await call(`/api/ops/wo/places/merge-queue/${no}/approve`, { method: 'POST' })).status, 409)
    const merged = (
      await db.pool.query('select id, merged_into from wo_place where id = any($1::uuid[])', [
        [pasted, other]
      ])
    ).rows
    assert.deepEqual(Object.fromEntries(merged.map((r) => [r.id, r.merged_into])), {
      [pasted]: pho,
      [other]: null
    })
    assert.deepEqual((await call('/api/ops/wo/places/merge-queue')).body.candidates, [])
    const decided = (await call('/api/ops/wo/places/merge-queue?state=approved')).body.candidates
    assert.equal(decided[0].decidedBy, 'owner@tracy.test')
  }
)

test(
  'an approval on a busy place waits; the waiting list shows it until applied, and a failed apply says why',
  pg,
  async () => {
    const { pho } = await seedPho()
    const pasted = await place('pho.example', { namespace: 'url', externalId: 'https://pho.example' })
    const id = (
      await db.pool.query(
        `insert into wo_place_merge_candidate (url_place_id, google_place_id, score) values ($1, $2, 0.8) returning id`,
        [pasted, pho]
      )
    ).rows[0].id
    await db.pool.query(`insert into wo_place_job (place_id, state) values ($1, 'running')`, [pho])
    const call = door()
    const res = await call(`/api/ops/wo/places/merge-queue/${id}/approve`, { method: 'POST' })
    assert.equal(res.status, 200)
    assert.equal(res.body.candidate.applied, false)
    const waiting = (await call('/api/ops/wo/places/merge-queue?state=waiting')).body.candidates
    assert.deepEqual(
      waiting.map((c) => [c.id, c.appliedAt, c.applyError]),
      [[id, null, null]]
    )
    await db.pool.query(`update wo_place_merge_candidate set apply_error = 'boom' where id = $1`, [id])
    assert.equal(
      (await call('/api/ops/wo/places/merge-queue?state=waiting')).body.candidates[0].applyError,
      'boom'
    )
    await db.pool.query(`update wo_place_merge_candidate set applied_at = now() where id = $1`, [id])
    assert.deepEqual((await call('/api/ops/wo/places/merge-queue?state=waiting')).body.candidates, [])
    assert.equal((await call('/api/ops/wo/places/merge-queue?state=nope')).status, 400)
  }
)

test(
  'an owner adds a social page the search did not find; it is linked, named for the next run and recorded',
  pg,
  async () => {
    const { pho, snap } = await seedPho()
    const call = door()
    const path = `/api/ops/wo/places/${pho}/social-pages/add`
    const FB = 'https://www.facebook.com/phoba'
    assert.equal((await call(path, { method: 'POST', body: { url: FB }, as: 'dev@tracy.test' })).status, 403)
    assert.equal(
      (await call(path, { method: 'POST', body: { url: FB }, origin: 'https://evil.test' })).status,
      403
    )
    for (const url of [undefined, 42, 'https://pho.example/', `https://x.facebook.com/${'a'.repeat(2000)}`]) {
      const res = await call(path, { method: 'POST', body: { url } })
      assert.equal(res.status, 400, String(url).slice(0, 40))
      assert.equal(res.body.error, 'INVALID_URL')
    }
    const blocked = await call(path, { method: 'POST', body: { url: 'https://u:p@www.facebook.com/phoba' } })
    assert.equal(blocked.status, 422)
    assert.equal(blocked.body.error, 'URL_BLOCKED')
    const added = await call(path, { method: 'POST', body: { url: `${FB}/` } })
    assert.equal(added.status, 200)
    assert.deepEqual(added.body, { ok: true, link: { kind: 'facebook', url: FB }, added: true })
    const links = await db.pool.query(
      'select kind, url, verified_by, evidence from wo_place_link where place_id = $1',
      [pho]
    )
    assert.deepEqual(links.rows, [
      {
        kind: 'facebook',
        url: FB,
        verified_by: 'operator',
        evidence: { from: 'operator', addedBy: 'owner@tracy.test' }
      }
    ])
    const named = await db.pool.query(
      'select ref, status from wo_place_snapshot_source where snapshot_id = $1 and source = $2',
      [snap, 'facebook']
    )
    assert.deepEqual(named.rows, [{ ref: FB, status: 'pending' }])
    const history = (await call(`/api/ops/wo/places/${pho}`)).body.history
    assert.deepEqual(
      history.map((e) => [e.action, e.actor]),
      [['social-page', 'owner@tracy.test']]
    )
  }
)
