// Durable provider receipts on isolated Postgres, without provider traffic.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createPlacePaidReceipts } from 'website-opportunities/src/place-paid-receipts.js'
import { fileDb } from './_db.mjs'

const db = fileDb(),
  opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const one = async (sql, args) => (await db.pool.query(sql, args)).rows[0]
async function fixture() {
  const place = await one('insert into wo_place default values returning id')
  const job = await one('insert into wo_place_job(place_id) values($1) returning id', [place.id])
  let clock = Date.parse('2026-10-20T12:00:00Z')
  const ledger = createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: 1000, jobCapCents: 200 })
  })
  const collect = createPlacePaidReceipts({ pool: db.pool, ledger, now: () => clock })
  const args = {
    placeId: place.id,
    jobId: job.id,
    source: 'instagram',
    input: { ref: 'https://instagram.com/synthetic' },
    spec: { provider: 'apify', operation: 'synthetic', maxCents: 25 }
  }
  return {
    collect,
    args,
    advance: (ms) => {
      clock += ms
    }
  }
}
test(
  'receipt survives job replacement and preserves original fetchedAt; due refresh creates a new generation',
  opts,
  async () => {
    const f = await fixture()
    let calls = 0
    const call = async () => {
      calls++
      return { status: 'complete', profile: { name: 'Synthetic profile' } }
    }
    const first = await f.collect(f.args, call)
    const next = await one("insert into wo_place_job(place_id,state) values($1,'failed') returning id", [
      f.args.placeId
    ])
    f.advance(86400000)
    const replay = await f.collect({ ...f.args, jobId: next.id }, call)
    assert.equal(calls, 1)
    assert.equal(replay.fetchedAt.toISOString(), first.fetchedAt.toISOString())
    f.advance(30 * 86400000)
    const fresh = await f.collect({ ...f.args, jobId: next.id }, call)
    assert.equal(calls, 2)
    assert.notEqual(fresh.fetchedAt.toISOString(), first.fetchedAt.toISOString())
    assert.equal((await one('select count(*)::int as n from wo_place_paid_receipt')).n, 2)
  }
)
test(
  'failed and timeout results never become reusable empty success, including force from another job',
  opts,
  async () => {
    const f = await fixture()
    let calls = 0
    const call = async () => {
      calls++
      return { status: 'partial', reason: 'timeout', media: [] }
    }
    await assert.rejects(f.collect(f.args, call), { code: 'SOURCE_START_UNKNOWN' })
    await assert.rejects(f.collect({ ...f.args, force: true }, call), { code: 'SOURCE_START_UNKNOWN' })
    assert.equal(calls, 1)
    assert.equal((await one('select state from wo_place_paid_receipt')).state, 'starting')
    assert.equal((await one('select state from wo_cost_ledger')).state, 'unreconciled')
  }
)

test(
  'a terminal not-found provider receipt is retained and settled without another paid start',
  opts,
  async () => {
    const f = await fixture()
    let calls = 0
    const result = {
      status: 'failed',
      reason: 'not_found',
      source: 'instagram',
      error: 'Profile does not exist'
    }
    const call = async () => {
      calls++
      return result
    }
    const first = await f.collect(f.args, call)
    assert.deepEqual(first.result, result)
    assert.equal(first.replayed, false)
    const saved = await one('select state,response,fetched_at from wo_place_paid_receipt')
    assert.equal(saved.state, 'received')
    assert.deepEqual(saved.response, result)
    assert.equal(saved.fetched_at.toISOString(), first.fetchedAt.toISOString())
    assert.equal((await one('select state from wo_cost_ledger')).state, 'settled')
    const sameJob = await f.collect({ ...f.args, force: true }, call)
    assert.equal(sameJob.replayed, true)
    assert.deepEqual(sameJob.result, result)
    const replacement = await one(
      "insert into wo_place_job(place_id,state) values($1,'failed') returning id",
      [f.args.placeId]
    )
    f.advance(60000)
    const replayed = await f.collect({ ...f.args, jobId: replacement.id }, call)
    assert.deepEqual(replayed.result, result)
    assert.equal(replayed.replayed, true)
    assert.equal(replayed.fetchedAt.toISOString(), first.fetchedAt.toISOString())
    assert.equal(calls, 1)
    assert.equal((await one('select count(*)::int as n from wo_cost_ledger')).n, 1)
    assert.equal((await one('select count(*)::int as n from wo_place_paid_receipt')).n, 1)
  }
)

test('provider errors and network failures retain an unknown receipt and its money hold', opts, async () => {
  for (const reason of ['provider_error', 'network', 'timeout']) {
    const f = await fixture()
    let calls = 0
    const call = async () => {
      calls++
      return { source: 'instagram', status: 'failed', reason }
    }
    await assert.rejects(f.collect(f.args, call), { code: 'SOURCE_START_UNKNOWN' })
    await assert.rejects(f.collect({ ...f.args, force: true }, call), { code: 'SOURCE_START_UNKNOWN' })
    assert.equal(calls, 1)
    assert.equal(
      (await one('select state from wo_place_paid_receipt where place_id=$1', [f.args.placeId])).state,
      'starting'
    )
    assert.equal(
      (await one('select state from wo_cost_ledger where place_id=$1', [f.args.placeId])).state,
      'unreconciled'
    )
  }
})

test(
  'a pinned terminal receipt survives its negative-cache TTL while a later job may refresh it',
  opts,
  async () => {
    const f = await fixture()
    let calls = 0
    const call = async () => {
      calls++
      return { source: 'instagram', status: 'failed', reason: 'not_found', error: 'Profile does not exist' }
    }
    const original = await f.collect(f.args, call)
    f.advance(60 * 60000 + 1)
    const pinned = await f.collect({ ...f.args, force: true }, call)
    assert.equal(pinned.replayed, true)
    assert.equal(pinned.fetchedAt.toISOString(), original.fetchedAt.toISOString())
    assert.deepEqual(pinned.result, original.result)
    assert.equal(calls, 1)
    const replacement = await one(
      "insert into wo_place_job(place_id,state) values($1,'failed') returning id",
      [f.args.placeId]
    )
    const refreshed = await f.collect({ ...f.args, jobId: replacement.id }, call)
    assert.equal(refreshed.replayed, false)
    assert.notEqual(refreshed.fetchedAt.toISOString(), original.fetchedAt.toISOString())
    assert.equal(calls, 2)
    const receipts = (
      await db.pool.query('select job_id,state,fetched_at from wo_place_paid_receipt order by created_at,id')
    ).rows
    assert.equal(receipts.length, 2)
    assert.ok(receipts.every((row) => row.state === 'received'))
    assert.equal(
      receipts.find((row) => row.job_id === f.args.jobId).fetched_at.toISOString(),
      original.fetchedAt.toISOString()
    )
    assert.equal((await one("select count(*)::int as n from wo_cost_ledger where state='settled'")).n, 2)
  }
)
test(
  'campaign lifetime cap and stop fence prevent a new paid start; joined user keeps attribution',
  opts,
  async () => {
    const f = await fixture()
    await db.pool.query(`insert into wo_prefetch_campaign(id,seed_source,selection_rule,enabled,budget_cents)
    values('dubai','{}','Synthetic source',true,30)`)
    await db.pool.query("update wo_place_job set prefetch_campaign_id='dubai',work_priority=1 where id=$1", [
      f.args.jobId
    ])
    const args = { ...f.args, spec: { ...f.args.spec, prefetchCampaignId: 'dubai' } }
    let calls = 0
    const call = async () => {
      calls++
      return { status: 'complete' }
    }
    await f.collect(args, call)
    await assert.rejects(f.collect({ ...args, input: { ref: 'different' } }, call), {
      code: 'BUDGET_EXCEEDED',
      scope: 'campaign'
    })
    await db.pool.query("update wo_prefetch_campaign set enabled=false,budget_cents=100 where id='dubai'")
    await assert.rejects(f.collect({ ...args, input: { ref: 'different' } }, call), {
      code: 'PREFETCH_STOPPED'
    })
    await db.pool.query('update wo_place_job set work_priority=0 where id=$1', [f.args.jobId])
    const account = await one("insert into account(email) values('joined@fixture.example.test') returning id")
    const opportunity = await one(
      `insert into wo_opportunity(account_id,name,provider,provider_id,candidate,place_id)
    values($1,'Synthetic','osm','node/1','{}',$2) returning id`,
      [account.id, f.args.placeId]
    )
    await db.pool.query(
      `insert into wo_job(account_id,opportunity_id,request_id,kind,state,place_job_id)
    values($1,$2,'synthetic-joined','research','queued',$3)`,
      [account.id, opportunity.id, f.args.jobId]
    )
    await f.collect({ ...args, input: { ref: 'different' } }, call)
    assert.equal(calls, 2)
    assert.equal(
      (await one("select count(*)::int as n from wo_cost_ledger where prefetch_campaign_id='dubai'")).n,
      2
    )
  }
)

test('a cancelled or expired place lease cannot admit a provider start', opts, async () => {
  const f = await fixture()
  await db.pool.query(
    "update wo_place_job set state='running',lease_token=1,lease_until=now()+interval '1 minute' where id=$1",
    [f.args.jobId]
  )
  let calls = 0
  const call = async () => {
    calls++
    return { status: 'complete' }
  }
  await assert.rejects(f.collect({ ...f.args, spec: { ...f.args.spec, expectedLeaseToken: 0 } }, call), {
    code: 'STALE_LEASE'
  })
  await db.pool.query("update wo_place_job set lease_until=now()-interval '1 second' where id=$1", [
    f.args.jobId
  ])
  await assert.rejects(f.collect({ ...f.args, spec: { ...f.args.spec, expectedLeaseToken: 1 } }, call), {
    code: 'STALE_LEASE'
  })
  assert.equal(calls, 0)
  assert.equal((await one('select count(*)::int as n from wo_cost_ledger')).n, 0)
})

test(
  'merging a place or changing collection options cannot bypass its unknown paid receipt',
  opts,
  async () => {
    const f = await fixture()
    let calls = 0
    const call = async () => {
      calls++
      throw new Error('Response lost')
    }
    await assert.rejects(f.collect(f.args, call), { code: 'SOURCE_START_UNKNOWN' })
    const target = await one('insert into wo_place default values returning id')
    await db.pool.query('update wo_place set merged_into=$1 where id=$2', [target.id, f.args.placeId])
    const job = await one('insert into wo_place_job(place_id) values($1) returning id', [target.id])
    await assert.rejects(
      f.collect(
        { ...f.args, placeId: target.id, jobId: job.id, input: { ...f.args.input, limit: 40 }, force: true },
        call
      ),
      { code: 'SOURCE_START_UNKNOWN' }
    )
    assert.equal(calls, 1)
  }
)

test(
  'a known rate limit receipt survives restart but admits a new generation after cooldown',
  opts,
  async () => {
    const f = await fixture()
    let calls = 0
    const call = async () => {
      calls++
      return { status: 'partial', reason: 'rate_limited', cursor: { offset: 0 } }
    }
    await f.collect(f.args, call)
    await f.collect(f.args, call)
    assert.equal(calls, 1)
    f.advance(61 * 60000)
    await f.collect(f.args, call)
    assert.equal(calls, 2)
  }
)
