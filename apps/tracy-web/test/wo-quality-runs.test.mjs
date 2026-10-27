import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { acceptQualityIntent } from '../src/opportunities-build/quality-intents.js'
import { qualityRunStore, runQualityAttempt } from '../src/opportunities-build/quality-runs.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const A = '00000000-0000-4000-8000-000000000001',
  B = '00000000-0000-4000-8000-000000000002'
const P = '00000000-0000-4000-8000-000000000003',
  R = '00000000-0000-4000-8000-000000000004'
const config = { providerId: 'configured', model: 'configured-model', hash: 'model-hash' }
const input = { data: 'frozen private input' }
const policy = { maxAttempts: 5, accountDailyCapCents: 50, maxRunMs: 172_800_000 }
function setup() {
  const clock = { now: Date.parse('2026-10-20T12:00:00Z') }
  const store = qualityRunStore({ pool: db.pool, now: () => clock.now, leaseMs: 1000 })
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => clock.now,
    caps: async () => ({ dailyCapCents: 200, jobCapCents: 100 })
  })
  const prepare = async (extra = {}) => {
    const intent = await acceptQualityIntent(db.pool, {
      accountId: A,
      opportunityId: P,
      semanticInput: input,
      policy,
      now: () => clock.now
    })
    return store.prepare({
      accountId: A,
      opportunityId: P,
      revisionId: R,
      input,
      policy,
      intentId: intent.id,
      ...extra
    })
  }
  return { clock, store, ledger, prepare }
}
const answer = () => ({
  result: { valid: true },
  receipt: { requestId: 'provider-receipt', usage: { prompt_tokens: 100, completion_tokens: 20 } }
})

test(
  'initial C has one schema repair for the whole intent, including after model rotation',
  opts,
  async () => {
    const { store, prepare } = setup(),
      run = await prepare()
    await store.claim({
      runId: run.id,
      accountId: A,
      stage: 'c-schema-repair',
      input: { invalid: 'outline' },
      modelConfig: config
    })
    await assert.rejects(
      store.claim({
        runId: run.id,
        accountId: A,
        stage: 'c-schema-repair',
        input: { invalid: 'another batch' },
        modelConfig: config
      }),
      /SCHEMA_REPAIR_LIMIT/
    )
    await assert.rejects(
      store.claim({
        runId: run.id,
        accountId: A,
        stage: 'c-schema-repair',
        input: { invalid: 'outline' },
        modelConfig: { ...config, hash: 'rotated' }
      }),
      /SCHEMA_REPAIR_LIMIT/
    )
    assert.equal(
      (await db.pool.query("select count(*)::int n from wo_quality_attempt where stage='c-schema-repair'"))
        .rows[0].n,
      1
    )
  }
)

test(
  'a frozen input survives a new store instance; changed account/input cannot adopt it',
  opts,
  async () => {
    const { prepare } = setup(),
      run = await prepare()
    assert.equal((await prepare()).id, run.id)
    await assert.rejects(prepare({ input: { data: 'changed' } }), /QUALITY_INPUT_CHANGED/)
    const other = qualityRunStore({ pool: db.pool })
    await assert.rejects(
      other.claim({ runId: run.id, accountId: B, stage: 'plan', input, modelConfig: config }),
      /QUALITY_RUN_NOT_FOUND/
    )
    await assert.rejects(
      db.pool.query('update wo_quality_run set input=$2::jsonb where id=$1', [
        run.id,
        JSON.stringify({ changed: true })
      ]),
      /immutable/
    )
  }
)
test('two workers cannot dispatch the same paid attempt', opts, async () => {
  const { store, prepare } = setup(),
    run = await prepare()
  const results = await Promise.all(
    [1, 2].map(() => store.claim({ runId: run.id, accountId: A, stage: 'plan', input, modelConfig: config }))
  )
  assert.equal(results.filter((r) => !r.blocked).length, 1)
  assert.equal(results.filter((r) => r.blocked === 'QUALITY_ATTEMPT_BUSY').length, 1)
})
test(
  'crash after dispatch retains money and refuses automatic duplicate call after restart/day rollover',
  opts,
  async () => {
    const { store, ledger, prepare, clock } = setup(),
      run = await prepare()
    const { attempt } = await store.claim({
      runId: run.id,
      accountId: A,
      stage: 'plan',
      input,
      modelConfig: config
    })
    const reserve = await ledger.reserve({
      provider: config.providerId,
      operation: 'quality:plan',
      maxCents: 20,
      accountId: A,
      accountDailyCapCents: 50,
      jobId: run.intent_id,
      requestKey: 'crashed'
    })
    await store.dispatch(attempt, reserve.reservation)
    clock.now += 86400_000
    const restarted = qualityRunStore({ pool: db.pool, now: () => clock.now })
    const claimed = await restarted.claim({
      runId: run.id,
      accountId: A,
      stage: 'plan',
      input,
      modelConfig: config
    })
    assert.equal(claimed.blocked, 'QUALITY_ATTEMPT_UNCERTAIN')
    const money = (
      await db.pool.query('select state,reserved_cents from wo_cost_ledger where id=$1', [
        reserve.reservation.id
      ])
    ).rows[0]
    assert.equal(money.state, 'unreconciled')
    assert.equal(money.reserved_cents, 20)
  }
)
test('crash before dispatch permits a new fence; the old worker cannot send', opts, async () => {
  const { store, prepare, clock } = setup(),
    run = await prepare()
  const old = await store.claim({ runId: run.id, accountId: A, stage: 'plan', input, modelConfig: config })
  clock.now += 1001
  const fresh = await store.claim({ runId: run.id, accountId: A, stage: 'plan', input, modelConfig: config })
  assert.ok(Number(fresh.attempt.lease_token) > Number(old.attempt.lease_token))
  await assert.rejects(store.dispatch(old.attempt, { id: null }), /QUALITY_ATTEMPT_LEASE_LOST/)
})
test(
  'receipt persisted before settlement is reconciled on replay without a provider call',
  opts,
  async () => {
    const { store, ledger, prepare } = setup(),
      run = await prepare()
    let calls = 0
    const args = {
      store,
      ledger,
      run,
      stage: 'plan',
      input,
      modelConfig: config,
      maxCents: 20,
      checkAllowed: async () => {},
      call: async () => {
        calls++
        return answer()
      },
      actualCents: () => 3
    }
    const settling = {
      ...ledger,
      settle: async () => {
        throw new Error('database disconnected')
      }
    }
    await assert.rejects(runQualityAttempt({ ...args, ledger: settling }), /database disconnected/)
    assert.equal((await runQualityAttempt(args)).reused, true)
    assert.equal(calls, 1)
    assert.equal((await db.pool.query('select state from wo_cost_ledger')).rows[0].state, 'settled')
  }
)
test('missing usage or invalid JSON never makes the paid call free or retryable', opts, async () => {
  const { store, ledger, prepare } = setup(),
    run = await prepare()
  let calls = 0
  const args = {
    store,
    ledger,
    run,
    stage: 'plan',
    input,
    modelConfig: config,
    maxCents: 20,
    checkAllowed: async () => {},
    call: async () => {
      calls++
      return { error: 'QUALITY_MODEL_JSON_INVALID', receipt: { requestId: 'bad' } }
    },
    actualCents: () => null
  }
  await assert.rejects(runQualityAttempt(args), /QUALITY_USAGE_UNKNOWN/)
  await assert.rejects(runQualityAttempt(args), /QUALITY_ATTEMPT_UNCERTAIN/)
  assert.equal(calls, 1)
  assert.equal((await db.pool.query('select state from wo_cost_ledger')).rows[0].state, 'unreconciled')
})
test('one shared repair counter is atomic, replayable and not reset by a new store', opts, async () => {
  const { store, prepare, clock } = setup(),
    run = await prepare()
  const repairs = await Promise.all(
    ['mechanical', 'semantic'].map((hash) => store.takeRepair(run.id, A, hash))
  )
  assert.deepEqual(repairs.map((r) => r.n).sort(), [1, 2])
  const restarted = qualityRunStore({ pool: db.pool, now: () => clock.now })
  assert.equal((await restarted.takeRepair(run.id, A, 'mechanical')).id, repairs[0].id)
  await assert.rejects(restarted.takeRepair(run.id, A, 'manual-prompt'), /QUALITY_REPAIR_LIMIT/)
})
test(
  'role/switch/Stop recheck happens after reserve and before dispatch; cancellation closes the run',
  opts,
  async () => {
    const { store, ledger, prepare } = setup(),
      run = await prepare()
    let checks = 0,
      calls = 0
    await assert.rejects(
      runQualityAttempt({
        store,
        ledger,
        run,
        stage: 'plan',
        input,
        modelConfig: config,
        maxCents: 20,
        checkAllowed: async () => {
          if (++checks === 2) throw new Error('STOPPED')
        },
        call: async () => {
          calls++
          return answer()
        },
        actualCents: () => 2
      }),
      /STOPPED/
    )
    assert.equal(calls, 0)
    assert.equal((await db.pool.query('select state from wo_cost_ledger')).rows[0].state, 'released')
    await store.cancel(run.id, A)
    await assert.rejects(store.takeRepair(run.id, A, 'new'), /QUALITY_RUN_CLOSED/)
  }
)
test('account cap counts different runs; another account has its own cap', opts, async () => {
  const { ledger } = setup()
  const spec = {
    provider: 'configured',
    operation: 'quality:plan',
    maxCents: 30,
    accountId: A,
    accountDailyCapCents: 50
  }
  assert.equal((await ledger.reserve({ ...spec, jobId: R })).ok, true)
  const refused = await ledger.reserve({ ...spec, jobId: P })
  assert.equal(refused.ok, false)
  assert.equal(refused.scope, 'account')
  assert.equal((await ledger.reserve({ ...spec, accountId: B, jobId: P })).ok, true)
})

test(
  'resuming after a pre-dispatch Stop reserves on the new day instead of spending a released hold',
  opts,
  async () => {
    const { store, ledger, prepare, clock } = setup(),
      run = await prepare()
    let checks = 0,
      calls = 0
    const args = {
      store,
      ledger,
      run,
      stage: 'plan',
      input,
      modelConfig: config,
      maxCents: 20,
      checkAllowed: async () => {
        if (++checks === 2) throw new Error('STOPPED')
      },
      call: async () => {
        calls++
        return answer()
      },
      actualCents: () => 3
    }
    await assert.rejects(runQualityAttempt(args), /STOPPED/)
    clock.now += 86400_000
    await runQualityAttempt({ ...args, checkAllowed: async () => {} })
    const rows = (await db.pool.query('select budget_day,state from wo_cost_ledger order by created_at')).rows
    assert.deepEqual(
      rows.map((r) => r.state),
      ['released', 'settled']
    )
    assert.notEqual(String(rows[0].budget_day), String(rows[1].budget_day))
    assert.equal(calls, 1)
  }
)

test(
  'a known paid failure settles after a crash and replays the error without another call',
  opts,
  async () => {
    const { store, ledger, prepare } = setup(),
      run = await prepare()
    let calls = 0
    const args = {
      store,
      ledger,
      run,
      stage: 'plan',
      input,
      modelConfig: config,
      maxCents: 20,
      checkAllowed: async () => {},
      call: async () => {
        calls++
        return { ...answer(), error: 'QUALITY_MODEL_JSON_INVALID' }
      },
      actualCents: () => 3
    }
    await assert.rejects(
      runQualityAttempt({
        ...args,
        ledger: {
          ...ledger,
          settle: async () => {
            throw new Error('settlement disconnected')
          }
        }
      }),
      /settlement disconnected/
    )
    await assert.rejects(runQualityAttempt(args), /QUALITY_MODEL_JSON_INVALID/)
    assert.equal(calls, 1)
    assert.equal(
      (await db.pool.query('select state,actual_cents from wo_cost_ledger')).rows[0].state,
      'settled'
    )
  }
)

test('an unexpected provider overrun records the real spend and blocks the result', opts, async () => {
  const { store, ledger, prepare } = setup(),
    run = await prepare()
  let calls = 0
  const args = {
    store,
    ledger,
    run,
    stage: 'plan',
    input,
    modelConfig: config,
    maxCents: 20,
    checkAllowed: async () => {},
    call: async () => {
      calls++
      return answer()
    },
    actualCents: () => 21
  }
  await assert.rejects(runQualityAttempt(args), /QUALITY_COST_CEILING_EXCEEDED/)
  await assert.rejects(runQualityAttempt(args), /QUALITY_COST_CEILING_EXCEEDED/)
  const row = (await db.pool.query('select state,actual_cents from wo_cost_ledger')).rows[0]
  assert.equal(row.state, 'settled')
  assert.equal(row.actual_cents, 21)
  assert.equal(calls, 1)
})

test('rebuild and model/key rotation share repair, attempts and the job budget', opts, async () => {
  const { store, prepare, ledger } = setup()
  const first = await prepare()
  const second = await prepare({ revisionId: B, input: { ...input, modelConfig: { revision: 2 } } })
  assert.notEqual(first.id, second.id)
  assert.equal(first.intent_id, second.intent_id)
  await store.takeRepair(first.id, A, 'mechanical-first')
  const repair = await store.takeRepair(second.id, A, 'semantic-second')
  assert.equal(repair.n, 2)
  await assert.rejects(store.takeRepair(first.id, A, 'rebuild-third'), /QUALITY_REPAIR_LIMIT/)
  let calls = 0
  const run = (r, cfg = config) =>
    runQualityAttempt({
      store,
      ledger,
      run: r,
      stage: 'plan',
      input,
      modelConfig: cfg,
      maxCents: 20,
      checkAllowed: async () => {},
      call: async () => {
        calls++
        return answer()
      },
      actualCents: () => 3
    })
  await run(first)
  assert.equal((await run(second)).reused, true)
  await run(second, { ...config, keyRevision: 2 })
  assert.equal(calls, 2)
  const jobs = (await db.pool.query('select distinct job_id from wo_cost_ledger')).rows
  assert.deepEqual(
    jobs.map((j) => j.job_id),
    [first.intent_id]
  )
  const ledgerUsage = await ledger.reserve({
    provider: 'configured',
    operation: 'other',
    maxCents: 95,
    accountId: A,
    accountDailyCapCents: 1000,
    jobId: first.intent_id
  })
  assert.equal(ledgerUsage.ok, false)
  assert.equal(ledgerUsage.scope, 'job')
  for (let n = 0; n < 3; n++)
    await store.claim({ runId: second.id, accountId: A, stage: `other-${n}`, input, modelConfig: config })
  await assert.rejects(
    store.claim({
      runId: first.id,
      accountId: A,
      stage: 'one-too-many',
      input,
      modelConfig: { ...config, providerRevision: 3 }
    }),
    /QUALITY_ATTEMPT_LIMIT/
  )
})

test(
  'accepted A to B to A has three generations; stale acceptance cannot replace current input',
  opts,
  async () => {
    const { clock } = setup()
    const accept = (semanticInput, expectedIntentId = null, selectedPolicy = policy) =>
      acceptQualityIntent(db.pool, {
        accountId: A,
        opportunityId: P,
        semanticInput,
        policy: selectedPolicy,
        expectedIntentId,
        now: () => clock.now
      })
    const first = await accept({ at: '2026-10-20', phone: 'one' })
    const same = await accept({ at: '2026-10-20', phone: 'one' }, null, { ...policy, maxAttempts: 30 })
    assert.equal(first.id, same.id)
    assert.equal(same.policy.maxAttempts, 5)
    const second = await accept({ at: '2026-10-20', phone: 'two' }, first.id)
    await assert.rejects(accept({ phone: 'stale' }, first.id), /QUALITY_INTENT_CHANGED/)
    const third = await accept({ at: '2026-10-20', phone: 'one' }, second.id)
    assert.deepEqual([first.generation, second.generation, third.generation], [1, 2, 3])
    assert.notEqual(first.id, third.id)
    const observedLater = await accept({ at: '2026-10-21', phone: 'one' }, third.id)
    assert.equal(observedLater.generation, 4)
    await assert.rejects(
      db.pool.query('update wo_quality_intent set policy=$2 where id=$1', [
        first.id,
        { ...policy, maxAttempts: 30 }
      ]),
      /immutable/
    )
  }
)

test(
  'cancel and deadline apply across revision bindings; a foreign root cannot be adopted',
  opts,
  async () => {
    const { store, prepare, clock } = setup()
    const first = await prepare(),
      second = await prepare({ revisionId: B })
    await assert.rejects(
      store.prepare({
        accountId: B,
        opportunityId: P,
        revisionId: R,
        intentId: first.intent_id,
        input,
        policy
      }),
      /QUALITY_INTENT_NOT_FOUND/
    )
    await assert.rejects(
      db.pool.query('update wo_quality_run set intent_id=$2 where id=$1', [first.id, B]),
      /immutable/
    )
    await store.cancel(first.id, A)
    await assert.rejects(
      store.claim({ runId: second.id, accountId: A, stage: 'plan', input, modelConfig: config }),
      /QUALITY_RUN_CLOSED/
    )
    const other = await acceptQualityIntent(db.pool, {
      accountId: A,
      opportunityId: P,
      semanticInput: { userChanged: true },
      expectedIntentId: first.intent_id,
      policy,
      now: () => clock.now
    })
    const next = await store.prepare({
      accountId: A,
      opportunityId: P,
      revisionId: P,
      intentId: other.id,
      input,
      policy
    })
    clock.now += policy.maxRunMs + 1
    await assert.rejects(
      store.claim({ runId: next.id, accountId: A, stage: 'plan', input, modelConfig: config }),
      /QUALITY_RUN_DEADLINE/
    )
    await assert.rejects(store.takeRepair(next.id, A, 'late'), /QUALITY_RUN_DEADLINE/)
  }
)

test(
  'trusted Retry window preserves root deadline, attempt ceiling, repair count and cancellation',
  opts,
  async () => {
    const h = setup(),
      run = await h.prepare()
    const frozen = (await db.pool.query('select * from wo_quality_intent where id=$1', [run.intent_id]))
      .rows[0]
    h.clock.now += policy.maxRunMs + 1
    await assert.rejects(
      h.store.claim({ runId: run.id, accountId: A, stage: 'late', input, modelConfig: config }),
      /QUALITY_RUN_DEADLINE/
    )
    let enabled = true
    const store = qualityRunStore({
      pool: db.pool,
      now: () => h.clock.now,
      retryWindow: async () => (enabled ? { deadline: new Date(h.clock.now + 1000).toISOString() } : null)
    })
    await store.takeRepair(run.id, A, 'first')
    await store.takeRepair(run.id, A, 'second')
    await assert.rejects(store.takeRepair(run.id, A, 'third'), /QUALITY_REPAIR_LIMIT/)
    for (let n = 0; n < policy.maxAttempts; n++)
      await store.claim({ runId: run.id, accountId: A, stage: `retry-${n}`, input, modelConfig: config })
    await assert.rejects(
      store.claim({ runId: run.id, accountId: A, stage: 'over-limit', input, modelConfig: config }),
      /QUALITY_ATTEMPT_LIMIT/
    )
    const current = (await db.pool.query('select * from wo_quality_intent where id=$1', [run.intent_id]))
      .rows[0]
    assert.equal(current.deadline.toISOString(), frozen.deadline.toISOString())
    assert.deepEqual(current.policy, frozen.policy)
    enabled = false
    await assert.rejects(store.takeRepair(run.id, A, 'first'), /QUALITY_RUN_DEADLINE/)
    await store.cancel(run.id, A)
    enabled = true
    await assert.rejects(
      store.claim({ runId: run.id, accountId: A, stage: 'cancelled', input, modelConfig: config }),
      /QUALITY_RUN_CLOSED/
    )
  }
)

test(
  'Retry resolver permits parallel current-action attempts but fences old, expired and uncertain work',
  opts,
  async () => {
    const { quickstartRetryWindow } = await import('../src/opportunities-build/quickstart-retry-window.js')
    const h = setup(),
      run = await h.prepare()
    await db.pool.query("insert into account(id,email) values($1,'retry@tracy.test')", [A])
    await db.pool.query(
      "insert into wo_opportunity(id,account_id,name,provider,provider_id,candidate) values($1,$2,'Retry','osm','retry','{}')",
      [P, A]
    )
    const insertAction = async (status, parent = null) =>
      (
        await db.pool.query(
          `insert into wo_demo_action(account_id,opportunity_id,request_id,fingerprint,accepted_at,revision_id,build_request_id,session_id,queued_at,status,retry_of)
     values($1,$2,$3,'fingerprint',$4,$5,'request','session',$4,$6,$7) returning *`,
          [A, P, `request-${status}`, new Date(h.clock.now), R, status, parent]
        )
      ).rows[0]
    const parent = await insertAction('failed')
    h.clock.now += policy.maxRunMs + 1
    const action = await insertAction('queued', parent.id)
    const root = (await db.pool.query('select * from wo_quality_intent where id=$1', [run.intent_id])).rows[0]
    // The QS window is narrower than the generic quality fixture's two-day limit.
    const scopedRoot = { ...root, policy: { ...root.policy, maxRunMs: 25 * 60_000 } }
    const resolver = await quickstartRetryWindow({
      pool: db.pool,
      source: { id: 'build', account_id: A, opportunity_id: P, revision_id: R, request_id: 'request' },
      actionId: action.id,
      run,
      now: () => h.clock.now
    })
    assert.ok(await resolver({ root: scopedRoot }))
    const attempt = (
      await db.pool.query(
        `insert into wo_quality_attempt(run_id,intent_id,stage,input_hash,input,model_config,state,action_id,lease_until)
     values($1,$2,'parallel','parallel','{}','{}','running',$3,$4) returning *`,
        [run.id, run.intent_id, action.id, new Date(h.clock.now + 1000)]
      )
    ).rows[0]
    await assert.rejects(resolver({ root: scopedRoot }), /QUALITY_ATTEMPT_UNCERTAIN/)
    resolver.activate()
    assert.ok(await resolver({ root: scopedRoot }), 'live sibling from current action is allowed')
    h.clock.now += 1001
    await assert.rejects(resolver({ root: scopedRoot }), /QUALITY_ATTEMPT_UNCERTAIN/)
    h.clock.now -= 1001
    await db.pool.query("update wo_quality_attempt set state='uncertain' where id=$1", [attempt.id])
    await assert.rejects(resolver({ root: scopedRoot }), /QUALITY_ATTEMPT_UNCERTAIN/)
    await db.pool.query("update wo_quality_attempt set state='running',action_id=$2 where id=$1", [
      attempt.id,
      parent.id
    ])
    await assert.rejects(resolver({ root: scopedRoot }), /QUALITY_ATTEMPT_UNCERTAIN/)
  }
)
