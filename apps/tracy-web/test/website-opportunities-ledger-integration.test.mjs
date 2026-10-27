// Scratch Postgres only. Provider callbacks are counters; no external requests or credentials.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { createPool } from '../src/db/index.js'
import { createCostLedger, withCharge } from 'website-opportunities/src/cost-ledger.js'
import { claimPlaceJob, joinPlace } from 'website-opportunities/src/place-jobs.js'
import { resolvePlace } from 'website-opportunities/src/places.js'
import { fileDb } from './_db.mjs'

const db = fileDb(),
  opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const ledger = (extra = {}) =>
  createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 }),
    ...extra
  })
const spec = (extra = {}) => ({ provider: 'synthetic', operation: 'fixture-call', maxCents: 10, ...extra })
const row = async (id) => (await db.pool.query('select * from wo_cost_ledger where id=$1', [id])).rows[0]
async function campaign(budget = 1000) {
  await db.pool.query(
    `insert into wo_prefetch_campaign(id,seed_source,selection_rule,enabled,budget_cents)
    values('dubai','{"id":"synthetic","fetchedAt":"2026-10-20T00:00:00Z"}','Synthetic integration fixture',true,$1)`,
    [budget]
  )
}
async function receipt(client, reservation) {
  await client.query(
    `insert into wo_prefetch_source_batch(source_key) values('dubai-google-v1') on conflict do nothing`
  )
  await client.query(
    `insert into wo_prefetch_source_page(source_key,page,request_hash,state,reservation_id)
    values('dubai-google-v1',0,'synthetic','starting',$1)`,
    [reservation.id]
  )
}

test(
  'quality accounting works after standalone Research and editorial-column upgrades without campaign schema',
  opts,
  async () => {
    const schema = `ledger_quality_${randomUUID().replaceAll('-', '')}`
    const research = readFileSync(
      new URL('../src/db/migrations/135-website-opportunities-cost-ledger.sql', import.meta.url),
      'utf8'
    )
    const migration = readFileSync(
      new URL('../src/db/migrations/152-website-opportunities-ledger-integration.sql', import.meta.url),
      'utf8'
    )
    await db.pool.query(`create schema ${schema}`)
    const url = new URL(db.url)
    url.searchParams.set('options', `-c search_path=${schema}`)
    const isolated = createPool(url.toString())
    try {
      await isolated.query(research)
      await isolated.query(
        'alter table wo_cost_ledger add column account_id uuid,add column action_id uuid,add column build_id uuid'
      )
      await isolated.query(migration)
      assert.equal(
        (
          await isolated.query(
            "select count(*)::int as n from information_schema.columns where table_schema=$1 and table_name='wo_cost_ledger' and column_name='prefetch_campaign_id'",
            [schema]
          )
        ).rows[0].n,
        0
      )
      const accountId = randomUUID(),
        jobId = randomUUID(),
        actionId = randomUUID(),
        buildId = randomUUID()
      const quality = ledger({ pool: isolated })
      let checkpointId
      const answer = await quality.reserve(
        spec({
          accountId,
          jobId,
          actionId,
          buildId,
          accountDailyCapCents: 100,
          requestKey: 'standalone-quality-receipt'
        }),
        {
          onAdmitted: async (client, reservation) => {
            checkpointId = reservation.id
            assert.equal(
              (await client.query('select account_id from wo_cost_ledger where id=$1', [reservation.id]))
                .rows[0].account_id,
              accountId
            )
          }
        }
      )
      assert.equal(answer.ok, true)
      assert.equal(checkpointId, answer.reservation.id)
      assert.equal(await quality.settle(answer.reservation, 7, 'synthetic-quality-provider-receipt'), true)
      const persisted = (
        await isolated.query('select * from wo_cost_ledger where id=$1', [answer.reservation.id])
      ).rows[0]
      assert.deepEqual(
        [persisted.account_id, persisted.job_id, persisted.action_id, persisted.build_id],
        [accountId, jobId, actionId, buildId]
      )
      assert.equal(persisted.state, 'settled')
      assert.equal(persisted.actual_cents, 7)
      assert.equal(persisted.provider_run_id, 'synthetic-quality-provider-receipt')
    } finally {
      await isolated.end()
      await db.pool.query(`drop schema if exists ${schema} cascade`)
    }
  }
)

test('mandatory remaining work also fits the campaign ceiling before any checkpoint', opts, async () => {
  await campaign(24)
  let hooks = 0
  const answer = await ledger().reserve(
    spec({
      accountId: randomUUID(),
      accountDailyCapCents: 100,
      jobId: randomUUID(),
      jobCapCents: 100,
      prefetchCampaignId: 'dubai',
      requestKey: 'campaign-headroom',
      minRemainingCents: 15
    }),
    {
      onAdmitted: async () => {
        hooks++
      }
    }
  )
  assert.equal(answer.ok, false)
  assert.equal(answer.scope, 'campaign')
  assert.equal(hooks, 0)
  assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 0)
})

test(
  'replayed checkpoint rollback preserves the prior receipt and an expired replay lease never enters its hook',
  opts,
  async () => {
    const placeId = await resolvePlace(db.pool, {
      provider: 'url',
      providerId: 'https://ledger-replay.example.test/',
      name: 'Synthetic replay fixture'
    })
    const tx = await db.pool.connect()
    try {
      await tx.query('begin')
      await joinPlace(tx, placeId)
      await tx.query('commit')
    } finally {
      tx.release()
    }
    const job = await claimPlaceJob(db.pool, 'ledger-replay-fixture', 60000, { kind: 'user' })
    const l = ledger(),
      charge = spec({
        placeId,
        jobId: job.id,
        expectedLeaseToken: job.lease_token,
        requestKey: 'replay-receipt'
      })
    const original = await l.reserve(charge, { onAdmitted: receipt })
    const before = (await db.pool.query('select * from wo_prefetch_source_page')).rows
    await assert.rejects(
      l.reserve(charge, {
        onAdmitted: async (client, replay) => {
          assert.equal(replay.id, original.reservation.id)
          assert.equal(replay.replayed, true)
          await client.query('update wo_prefetch_source_page set response=\'{"synthetic":true}\'')
          throw Object.assign(new Error('Synthetic replay rejection'), { code: 'FIXTURE_REPLAY_REJECTED' })
        }
      }),
      { code: 'FIXTURE_REPLAY_REJECTED' }
    )
    assert.deepEqual((await db.pool.query('select * from wo_prefetch_source_page')).rows, before)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 1)
    await db.pool.query(
      "update wo_place_job set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [job.id]
    )
    let entered = false
    await assert.rejects(
      l.reserve(charge, {
        onAdmitted: async () => {
          entered = true
        }
      }),
      { code: 'STALE_LEASE' }
    )
    assert.equal(entered, false)
    assert.deepEqual((await db.pool.query('select * from wo_prefetch_source_page')).rows, before)
  }
)

test(
  'scoped headroom includes foreign Research spending and midnight resets days without resetting the workflow cap',
  opts,
  async () => {
    let clock = Date.parse('2026-10-20T23:59:00Z')
    const caps = async () => ({ dailyCapCents: 60, jobCapCents: 100 })
    const all = ledger({ caps, now: () => clock }),
      accountId = randomUUID(),
      jobId = randomUUID()
    const foreign = (await all.reserve(spec({ maxCents: 40 }))).reservation
    await all.reserve(spec({ accountId, jobId, accountDailyCapCents: 100 }))
    const scoped = ledger({ caps, now: () => clock, scope: { accountIds: [accountId], jobIds: [jobId] } })
    const before = await row(foreign.id)
    const room = await scoped.headroom({ accountId, jobId, accountDailyCapCents: 100, jobCapCents: 15 })
    assert.deepEqual(room.committedCents, { day: 50, job: 10, account: 10 })
    assert.equal(room.availableCents, 5)
    assert.deepEqual(await row(foreign.id), before)
    clock = Date.parse('2026-10-21T00:01:00Z')
    const tomorrow = await scoped.headroom({ accountId, jobId, accountDailyCapCents: 100, jobCapCents: 15 })
    assert.deepEqual(tomorrow.committedCents, { day: 0, job: 10, account: 0 })
    assert.equal(tomorrow.availableCents, 5)
    const refused = await scoped.reserve(
      spec({ maxCents: 6, accountId, jobId, accountDailyCapCents: 100, jobCapCents: 15 })
    )
    assert.equal(refused.ok, false)
    assert.equal(refused.scope, 'job')
  }
)

test(
  'migration 152 supports fresh installs and preserves Research or existing editorial attribution on repeated upgrades',
  opts,
  async () => {
    const migration = readFileSync(
      new URL('../src/db/migrations/152-website-opportunities-ledger-integration.sql', import.meta.url),
      'utf8'
    )
    const research = readFileSync(
      new URL('../src/db/migrations/135-website-opportunities-cost-ledger.sql', import.meta.url),
      'utf8'
    )
    assert.equal(
      (
        await db.pool.query(
          "select count(*)::int as n from schema_migration where name='152-website-opportunities-ledger-integration.sql'"
        )
      ).rows[0].n,
      1
    )
    for (const editorial of [false, true]) {
      const schema = `ledger_upgrade_${randomUUID().replaceAll('-', '')}`
      const client = await db.pool.connect()
      try {
        await client.query(`create schema ${schema}`)
        await client.query(`set search_path to ${schema},public`)
        await client.query(research)
        const accountId = randomUUID(),
          actionId = randomUUID(),
          buildId = randomUUID()
        if (editorial)
          await client.query(
            'alter table wo_cost_ledger add column account_id uuid,add column action_id uuid,add column build_id uuid'
          )
        const old = (
          await client.query(
            `insert into wo_cost_ledger(budget_day,provider,operation,reserved_cents,request_key${editorial ? ',account_id,action_id,build_id' : ''})
        values(current_date,'synthetic','upgrade-fixture',17,'upgrade-receipt'${editorial ? ',$1,$2,$3' : ''}) returning *`,
            editorial ? [accountId, actionId, buildId] : []
          )
        ).rows[0]
        await client.query(migration)
        await client.query(migration)
        const preserved = (await client.query('select * from wo_cost_ledger where id=$1', [old.id])).rows[0]
        assert.deepEqual(preserved, {
          ...old,
          account_id: editorial ? accountId : null,
          action_id: editorial ? actionId : null,
          build_id: editorial ? buildId : null
        })
        assert.equal(
          (
            await client.query(
              "select count(*)::int as n from pg_indexes where schemaname=$1 and indexname='wo_cost_ledger_account_day'",
              [schema]
            )
          ).rows[0].n,
          1
        )
      } finally {
        await client.query('reset search_path')
        await client.query(`drop schema if exists ${schema} cascade`)
        client.release()
      }
    }
  }
)

test(
  'campaign, account, frozen job cap and mandatory remaining work jointly refuse before hooks or provider calls',
  opts,
  async () => {
    await campaign(25)
    const l = ledger(),
      accountId = randomUUID(),
      jobId = randomUUID()
    let checkpoints = 0,
      providers = 0
    const attempted = spec({
      accountId,
      jobId,
      requestKey: 'combined-admission',
      prefetchCampaignId: 'dubai',
      accountDailyCapCents: 100,
      jobCapCents: 20,
      minRemainingCents: async (client) => {
        assert.equal((await client.query('select 1 as n')).rows[0].n, 1)
        return 15
      }
    })
    const refused = await l.reserve(attempted, {
      onAdmitted: async () => {
        checkpoints++
      }
    })
    assert.equal(refused.ok, false)
    assert.equal(refused.scope, 'job')
    await assert.rejects(
      withCharge(l, attempted, async () => {
        providers++
      }),
      { code: 'BUDGET_EXCEEDED' }
    )
    assert.equal(checkpoints, 0)
    assert.equal(providers, 0)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 0)
    await db.pool.query("update wo_prefetch_campaign set enabled=false where id='dubai'")
    await assert.rejects(l.reserve({ ...attempted, minRemainingCents: 0 }), { code: 'PREFETCH_STOPPED' })
  }
)

test('request-key payload conflicts reject without executing an admission checkpoint', opts, async () => {
  const l = ledger(),
    accountId = randomUUID(),
    jobId = randomUUID()
  const original = spec({ accountId, jobId, accountDailyCapCents: 100, requestKey: 'same-charge' })
  assert.equal((await l.reserve(original)).ok, true)
  let hooks = 0
  for (const mutation of [
    { accountId: randomUUID() },
    { jobId: randomUUID() },
    { maxCents: 11 },
    { provider: 'other' },
    { operation: 'other-operation' },
    { actionId: randomUUID() },
    { buildId: randomUUID() },
    { prefetchCampaignId: 'dubai' },
    { placeId: randomUUID() },
    { opportunityId: randomUUID() }
  ]) {
    await assert.rejects(
      l.reserve(
        { ...original, ...mutation },
        {
          onAdmitted: async () => {
            hooks++
          }
        }
      ),
      { code: 'CHARGE_SCOPE_CONFLICT' }
    )
  }
  assert.equal(hooks, 0)
  assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 1)
})

test(
  'a rejected atomic checkpoint rolls back both the reservation and its provider receipt',
  opts,
  async () => {
    const l = ledger()
    await assert.rejects(
      l.reserve(spec({ requestKey: 'rejected-checkpoint' }), {
        onAdmitted: async (client, reservation) => {
          await receipt(client, reservation)
          throw Object.assign(new Error('Synthetic rejection after receipt'), { code: 'FIXTURE_REJECTED' })
        }
      }),
      { code: 'FIXTURE_REJECTED' }
    )
    assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 0)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_prefetch_source_page')).rows[0].n, 0)
  }
)

test('a lease expiring inside the admission checkpoint cannot commit a charge or receipt', opts, async () => {
  const placeId = await resolvePlace(db.pool, {
    provider: 'url',
    providerId: 'https://ledger-lease.example.test/',
    name: 'Synthetic lease fixture'
  })
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    await joinPlace(client, placeId)
    await client.query('commit')
  } finally {
    client.release()
  }
  const job = await claimPlaceJob(db.pool, 'ledger-integration', 500, { kind: 'user' })
  let checkpoint = false
  await assert.rejects(
    ledger().reserve(
      spec({
        placeId,
        jobId: job.id,
        expectedLeaseToken: job.lease_token,
        requestKey: 'expired-inside-checkpoint'
      }),
      {
        onAdmitted: async (tx, reservation) => {
          checkpoint = true
          await receipt(tx, reservation)
          await tx.query('select pg_sleep(0.6)')
        }
      }
    ),
    { code: 'STALE_LEASE' }
  )
  assert.equal(checkpoint, true)
  assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 0)
  assert.equal((await db.pool.query('select count(*)::int as n from wo_prefetch_source_page')).rows[0].n, 0)
})

test(
  'concurrent accounts share the deployment ceiling while each account also stays within its own ceiling',
  opts,
  async () => {
    const l = ledger({ caps: async () => ({ dailyCapCents: 15, jobCapCents: 100 }) })
    const a = randomUUID(),
      b = randomUUID()
    const answers = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        l.reserve(
          spec({
            maxCents: 4,
            accountId: i % 2 ? a : b,
            accountDailyCapCents: 7,
            jobId: randomUUID(),
            requestKey: `parallel-account-${i}`
          })
        )
      )
    )
    assert.equal(answers.filter((r) => r.ok).length, 2)
    const totals = (
      await db.pool.query(
        'select account_id,sum(reserved_cents)::int as cents from wo_cost_ledger group by account_id'
      )
    ).rows
    assert.equal(totals.length, 2)
    assert.ok(totals.every((r) => r.cents === 4))
    const other = await l.reserve(
      spec({ accountId: randomUUID(), accountDailyCapCents: 100, maxCents: 8, jobId: randomUUID() })
    )
    assert.equal(other.ok, false)
    assert.equal(other.scope, 'day')
  }
)

test('scoped mutation and stale sweeps cannot alter another account or another job', opts, async () => {
  let clock = Date.now()
  const a = randomUUID(),
    b = randomUUID(),
    ownJob = randomUUID(),
    otherJob = randomUUID()
  const all = ledger({ now: () => clock, staleAfterMs: 1000 })
  const own = (await all.reserve(spec({ accountId: a, accountDailyCapCents: 1000, jobId: ownJob })))
    .reservation
  const foreignAccount = (
    await all.reserve(spec({ accountId: b, accountDailyCapCents: 1000, jobId: ownJob }))
  ).reservation
  const foreignJob = (await all.reserve(spec({ accountId: a, accountDailyCapCents: 1000, jobId: otherJob })))
    .reservation
  const scoped = ledger({
    now: () => clock,
    staleAfterMs: 1000,
    scope: { accountIds: [a], jobIds: [ownJob] }
  })
  for (const foreign of [foreignAccount, foreignJob]) {
    assert.equal(await scoped.settle(foreign, 1), false)
    assert.equal(await scoped.release(foreign), false)
    assert.equal(await scoped.unreconcile(foreign), false)
    assert.equal((await row(foreign.id)).state, 'reserved')
  }
  await assert.rejects(scoped.reserve(spec({ accountId: b, accountDailyCapCents: 1000, jobId: ownJob })), {
    code: 'CHARGE_SCOPE_CONFLICT'
  })
  clock += 2000
  assert.equal(await scoped.markStale(), 1)
  assert.equal((await row(own.id)).state, 'unreconciled')
  assert.equal((await row(foreignAccount.id)).state, 'reserved')
  assert.equal((await row(foreignJob.id)).state, 'reserved')
})

test(
  'headroom is a bounded read-only forecast and counts stale holds without mutating them',
  opts,
  async () => {
    let clock = Date.now()
    const l = ledger({ now: () => clock, staleAfterMs: 1000 }),
      accountId = randomUUID(),
      jobId = randomUUID()
    const held = (await l.reserve(spec({ accountId, jobId, accountDailyCapCents: 100 }))).reservation
    clock += 2000
    const before = await row(held.id)
    const room = await l.headroom({ accountId, jobId, accountDailyCapCents: 30, jobCapCents: 25 })
    assert.equal(room.availableCents, 15)
    assert.deepEqual(room.committedCents, { day: 10, job: 10, account: 10 })
    assert.deepEqual(await row(held.id), before)
    const none = await l.headroom({ accountId, jobId, accountDailyCapCents: 5, jobCapCents: 25 })
    assert.equal(none.availableCents, 0)
  }
)

test(
  'existing unscoped Research charges keep their reserve, replay, settle and release behavior',
  opts,
  async () => {
    const l = ledger()
    const first = await l.reserve(spec({ requestKey: 'legacy-research' }))
    const replay = await l.reserve(spec({ requestKey: 'legacy-research' }))
    assert.equal(replay.reservation.id, first.reservation.id)
    assert.equal(replay.reservation.replayed, true)
    assert.equal(await l.settle(first.reservation, 3, 'synthetic-run'), true)
    assert.equal((await row(first.reservation.id)).actual_cents, 3)
    const unused = (await l.reserve(spec())).reservation
    assert.equal(await l.release(unused), true)
    assert.equal((await row(unused.id)).state, 'released')
  }
)
