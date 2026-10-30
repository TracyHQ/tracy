import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  acceptDemoActions,
  demoActionOf,
  demoActionsOf,
  readDemoUsage
} from '../src/opportunities-build/demo-actions.js'
import { failedQaHash } from '../src/opportunities-build/demo-qa.js'
import { demoLeasePool } from '../src/opportunities-build/demo-runner.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function fixture(n = 3) {
  const account = (
    await db.pool.query("insert into account(email) values ('demo-actions@test.example') returning id")
  ).rows[0].id
  const ids = []
  for (let i = 0; i < n; i++)
    ids.push(
      (
        await db.pool.query(
          `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
     values ($1, $2, 'url', $2, '{}'::jsonb) returning id`,
          [account, `Place ${i}`]
        )
      ).rows[0].id
    )
  return { account, ids }
}
const entry = (id, requestId) => ({ opportunityId: id, requestId })

test(
  'demo chat appears only after its session receipt, is private, and Retry keeps the same destination',
  opts,
  async () => {
    const { account, ids } = await fixture(2)
    const accepted = await acceptDemoActions(db.pool, {
      accountId: account,
      requireSelection: true,
      templates: offeredTemplates,
      entries: [{ ...entry(ids[0], 'chat-initial'), selection: chosenTemplate, workflow: 'agent-demo/1' }]
    })
    const action = accepted.body.actions[0]
    assert.equal(action.workflow, 'agent-demo/1')
    assert.equal(action.chat, null)
    assert.equal((await demoActionOf(db.pool, account, action.id)).chat, null)
    const other = (
      await db.pool.query("insert into account(email) values('other-chat@test.example') returning id")
    ).rows[0].id
    assert.equal(await demoActionOf(db.pool, other, action.id), null)
    const held = (await db.pool.query('select * from wo_demo_action where id=$1', [action.id])).rows[0]
    const separate = await acceptDemoActions(db.pool, {
      accountId: account,
      requireSelection: true,
      templates: offeredTemplates,
      entries: [
        { ...entry(ids[1], 'chat-another-demo'), selection: chosenTemplate, workflow: 'agent-demo/1' }
      ]
    })
    const second = (
      await db.pool.query('select session_id from wo_demo_action where id=$1', [separate.body.actions[0].id])
    ).rows[0]
    assert.notEqual(second.session_id, held.session_id, 'each demo reserves its own new conversation')
    await db.pool.query(
      `insert into wo_revision (id, opportunity_id, account_id, n, brief, brief_md)
     values ($1,$2,$3,1,'{}','')`,
      [held.revision_id, ids[0], account]
    )
    await db.pool.query(
      `insert into wo_build (account_id,revision_id,request_id,build_id,site_key,state, choice, choice_key)
     values ($1,$2,$3,$4,'demo-chat.tracy.test','done', '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture')`,
      [account, held.revision_id, held.build_request_id, held.id]
    )
    assert.equal(
      (await demoActionOf(db.pool, account, action.id)).chat,
      null,
      'a reserved session is not an existing chat'
    )
    await db.pool.query('update wo_build set handoff=$1::jsonb where account_id=$2', [
      JSON.stringify({ sessionId: held.session_id }),
      account
    ])
    const chat = {
      siteKey: 'demo-chat.tracy.test',
      sessionId: held.session_id,
      href: `/demo-chat.tracy.test/s/${held.session_id}`
    }
    assert.deepEqual((await demoActionOf(db.pool, account, action.id)).chat, chat)
    assert.deepEqual((await demoActionsOf(db.pool, account, ids))[ids[0]].chat, chat)
    await db.pool.query("update wo_demo_action set status='failed' where id=$1", [held.id])
    const retry = await acceptDemoActions(db.pool, {
      accountId: account,
      entries: [{ ...entry(ids[0], 'chat-retry'), retryOf: held.id }]
    })
    assert.equal(retry.status, 202)
    assert.deepEqual((await demoActionOf(db.pool, account, retry.body.actions[0].id)).chat, chat)
    await db.pool.query('update wo_build set demo_deleted_at=now() where account_id=$1', [account])
    assert.equal((await demoActionOf(db.pool, account, action.id)).chat, null)
  }
)

test('Retry refuses a deleted build before accepting or charging another action', opts, async () => {
  const { account, ids } = await fixture(1)
  const first = await acceptDemoActions(db.pool, {
    accountId: account,
    entries: [entry(ids[0], 'deleted-initial')]
  })
  const id = first.body.actions[0].id
  const held = (await db.pool.query('select * from wo_demo_action where id=$1', [id])).rows[0]
  await db.pool.query(
    `insert into wo_revision (id, opportunity_id, account_id, n, brief, brief_md)
     values ($1,$2,$3,1,'{}','')`,
    [held.revision_id, ids[0], account]
  )
  await db.pool.query(
    `insert into wo_build (account_id,revision_id,request_id,build_id,site_key,state,choice,choice_key)
     values ($1,$2,$3,$4,'deleted-demo.tracy.test','deleted','{}'::jsonb,'fixture')`,
    [account, held.revision_id, held.build_request_id, id]
  )
  await db.pool.query("update wo_demo_action set status='failed' where id=$1", [id])
  for (const [state, deletedAt] of [
    ['deleted', null],
    ['done', new Date()]
  ]) {
    await db.pool.query('update wo_build set state=$1,demo_deleted_at=$2 where account_id=$3', [
      state,
      deletedAt,
      account
    ])
    const retry = await acceptDemoActions(db.pool, {
      accountId: account,
      entries: [{ ...entry(ids[0], `deleted-retry-${state}`), retryOf: id }]
    })
    assert.equal(retry.status, 409)
    assert.equal(retry.body.code, 'DEMO_DELETED')
    assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 1)
    assert.equal((await readDemoUsage(db.pool, account, 20)).used, 1)
  }
})

// These tests use different connections/transactions on the real database: counting before an
// insert, or charging an idempotent replay, changes their observable accepted actions/usage.
test('two replicas compete for the last daily slot: exactly one action is accepted', opts, async () => {
  const { account, ids } = await fixture()
  const results = await Promise.all(
    ids.map((id, i) =>
      acceptDemoActions(db.pool, { accountId: account, entries: [entry(id, `compete-${i}`)], limit: 1 })
    )
  )
  assert.deepEqual(results.map((r) => r.status).sort(), [202, 429, 429])
  assert.equal((await readDemoUsage(db.pool, account, 1)).used, 1)
  assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 1)
})

test(
  'bulk reserves all its actions atomically; insufficient budget leaves no partial batch',
  opts,
  async () => {
    const { account, ids } = await fixture()
    const result = await acceptDemoActions(db.pool, {
      accountId: account,
      limit: 2,
      entries: ids.map((id, i) => entry(id, `bulk-${i}`))
    })
    assert.equal(result.status, 429)
    assert.equal(result.body.remaining, 2)
    assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 0)
    assert.equal((await readDemoUsage(db.pool, account, 2)).used, 0)
  }
)

test(
  'a timeout replay across UTC midnight adopts the same revision/session without charging the new day',
  opts,
  async () => {
    const { account, ids } = await fixture()
    let at = Date.parse('2030-04-01T23:59:59Z')
    const args = { accountId: account, entries: [entry(ids[0], 'midnight-press')], limit: 1, now: () => at }
    const first = await acceptDemoActions(db.pool, args)
    at += 2000
    const again = await acceptDemoActions(db.pool, args)
    assert.deepEqual(again.body.actions, first.body.actions)
    assert.equal(again.body.usage.used, 0)
    assert.equal((await readDemoUsage(db.pool, account, 1, at - 2000)).used, 1)
    const fresh = await acceptDemoActions(db.pool, { ...args, entries: [entry(ids[1], 'next-day-press')] })
    assert.equal(fresh.status, 202)
    assert.equal(fresh.body.usage.resetsAt, '2030-04-03T00:00:00.000Z')
  }
)

test(
  'a failed build still counts; explicit retry counts once more and retains its work identities',
  opts,
  async () => {
    const { account, ids } = await fixture()
    const args = { accountId: account, limit: 20, entries: [entry(ids[0], 'failed-press')] }
    const first = await acceptDemoActions(db.pool, args)
    const actionId = first.body.actions[0].id
    await db.pool.query(
      "update wo_demo_action set status = 'failed', step = 'handoff', error = 'HANDOFF_PROMPT_FAILED' where id = $1",
      [actionId]
    )
    const retry = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...entry(ids[0], 'retry-press'), retryOf: actionId }]
    })
    assert.equal(retry.status, 202)
    assert.equal(retry.body.usage.used, 2)
    assert.equal(retry.body.actions[0].revisionId, first.body.actions[0].revisionId)
    const rows = (await db.pool.query('select session_id, build_request_id from wo_demo_action')).rows
    assert.deepEqual(rows[0], rows[1])
    const replay = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...entry(ids[0], 'retry-press'), retryOf: actionId }]
    })
    assert.equal(replay.body.usage.used, 2)
  }
)

test(
  '0 removes the limit but keeps usage; a foreign opportunity rolls back the entire batch',
  opts,
  async () => {
    const { account, ids } = await fixture(22)
    const all = await acceptDemoActions(db.pool, {
      accountId: account,
      limit: 0,
      entries: ids.map((id, i) => entry(id, `uncapped-${i}`))
    })
    assert.equal(all.status, 202)
    assert.equal(all.body.usage.used, 22)
    const foreign = (
      await db.pool.query("insert into account(email) values ('other@test.example') returning id")
    ).rows[0].id
    const denied = await acceptDemoActions(db.pool, {
      accountId: foreign,
      limit: 0,
      entries: [entry(ids[0], 'foreign-press')]
    })
    assert.equal(denied.status, 404)
    assert.equal((await readDemoUsage(db.pool, foreign, 0)).used, 0)
  }
)

test(
  'a stale or expired worker cannot write a receipt, even before another replica claims it',
  opts,
  async () => {
    const { account, ids } = await fixture()
    const result = await acceptDemoActions(db.pool, {
      accountId: account,
      entries: [entry(ids[0], 'fence-press')]
    })
    const id = result.body.actions[0].id
    const at = Date.now()
    await db.pool.query('update wo_demo_action set lease_token = 1, lease_until = $2 where id = $1', [
      id,
      new Date(at + 1000)
    ])
    const fenced = demoLeasePool(db.pool, { key: id, token: '1' }, () => at)
    await fenced.query("update wo_demo_action set step = 'build' where id = $1", [id])
    const expired = demoLeasePool(db.pool, { key: id, token: '1' }, () => at + 1001)
    await assert.rejects(expired.query("update wo_demo_action set step = 'check' where id = $1", [id]), {
      code: 'DEMO_LEASE_LOST'
    })
    await db.pool.query('update wo_demo_action set lease_token = 2, lease_until = $2 where id = $1', [
      id,
      new Date(at + 10000)
    ])
    await assert.rejects(fenced.query("update wo_demo_action set step = 'check' where id = $1", [id]), {
      code: 'DEMO_LEASE_LOST'
    })
    assert.equal(
      (await db.pool.query('select step from wo_demo_action where id = $1', [id])).rows[0].step,
      'build'
    )
  }
)

test('Steps never count failed content or unverified photos as completed work', async () => {
  const { demoProgress } = await import('../src/opportunities-build/demo-actions.js')
  assert.equal(demoProgress(null), null)
  assert.equal(demoProgress({}).writes, null)
  const facts = demoProgress({
    content: { writes: { a: { state: 'written' }, b: { state: 'failed' }, c: { state: 'hidden' } } },
    pictures: { receipts: { a: { state: 'verified' }, b: { state: 'uploaded' }, c: { state: 'failed' } } },
    qa: { state: 'failed', rounds: [{ failed: [{}, {}] }] }
  })
  assert.equal(facts.writes, 1)
  assert.equal(facts.photos, 1)
  assert.equal(facts.qa.issues, 2)
})

test(
  'Retry after a manual build’s QA failure is charged and resumes QA on its existing work identities',
  opts,
  async () => {
    const { account, ids } = await fixture(1)
    const revision = (
      await db.pool.query(
        `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
  values ($1,$2,1,'{}','') returning id`,
        [ids[0], account]
      )
    ).rows[0].id
    const first = await acceptDemoActions(db.pool, {
      accountId: account,
      entries: [
        { opportunityId: ids[0], revisionId: revision, requestId: 'manual-initial', automatic: false }
      ]
    })
    const action = (
      await db.pool.query('select * from wo_demo_action where id=$1', [first.body.actions[0].id])
    ).rows[0]
    await db.pool.query("update wo_demo_action set status='completed' where id=$1", [action.id])
    await builtByRunner(account, revision, 'manual-initial')
    await db.pool.query(
      `update wo_build set state='done',qa='{"state":"failed","sessionId":"held-chat"}' where request_id='manual-initial'`
    )
    const retry = await acceptDemoActions(db.pool, {
      accountId: account,
      entries: [{ opportunityId: ids[0], requestId: 'manual-qa-retry', retryOf: action.id }]
    })
    assert.equal(retry.status, 202)
    assert.equal(retry.body.usage.used, 2)
    const held = (await db.pool.query('select * from wo_demo_action where id=$1', [retry.body.actions[0].id]))
      .rows[0]
    assert.equal(
      held.automatic,
      true,
      'the accepted retry continues through QA instead of stopping at provision'
    )
    assert.equal(held.build_request_id, action.build_request_id)
    assert.equal(held.revision_id, action.revision_id)
    assert.equal((await db.pool.query('select id from wo_build')).rowCount, 1)
  }
)

/** The acceptance transaction runs against this isolated memory book, without a live database. */
function qaAcceptanceWorld({ rejectMarker = false, beforeBuildLock = null } = {}) {
  const accountId = 'f1b82167-87c0-40af-968c-bc70390856db'
  const opportunityId = '3e437780-b8a9-49ee-808b-cb2f687c5c6f'
  const parent = {
    id: 'e912dbbe-00df-479e-8df2-89238337c663',
    account_id: accountId,
    opportunity_id: opportunityId,
    revision_id: '20c27c07-9772-4d4a-8b7b-c58e1063cc21',
    request_id: 'old-request',
    build_request_id: 'same-site-build',
    session_id: 'same-site-chat',
    protocol: 'legacy',
    status: 'failed',
    step: 'check',
    automatic: true,
    label: 'qa-fixture'
  }
  let state = {
    used: 1,
    actions: [parent],
    build: {
      id: '2ac9f5bc-9e07-44d6-a629-7b268539149b',
      account_id: accountId,
      request_id: parent.build_request_id,
      qa_lease_token: '17',
      qa_lease_until: null,
      qa: {
        state: 'failed',
        repairs: 2,
        rounds: [{ n: 3, failed: [{ id: 'real-finding' }] }],
        baseline: { texts: ['Frozen baseline'] },
        acceptedRetry: { acceptedActionId: parent.id, failedQaHash: 'old-parent-proof' }
      }
    }
  }
  let backup
  let locked = false
  const calls = []
  const result = (rows = []) => ({ rows: structuredClone(rows), rowCount: rows.length })
  const query = async (sql, args = []) => {
    const q = sql.replace(/\s+/g, ' ').trim()
    calls.push({ q, args: structuredClone(args) })
    if (q === 'begin') {
      backup = structuredClone(state)
      return result()
    }
    if (q === 'commit') return result()
    if (q === 'rollback') {
      state = backup
      return result()
    }
    if (q.startsWith('select pg_advisory_xact_lock')) return result()
    if (q.startsWith('select * from wo_demo_action where account_id'))
      return result(state.actions.filter((a) => a.account_id === args[0] && a.request_id === args[1]))
    if (q.startsWith('select id from wo_opportunity')) return result([{ id: opportunityId }])
    if (q.startsWith('select a.* from wo_demo_action')) return result([parent])
    if (q.startsWith('select * from wo_build where account_id=$1 and request_id=$2 for update')) {
      assert.deepEqual(args, [accountId, parent.build_request_id])
      beforeBuildLock?.(state.build)
      locked = true
      return result([state.build])
    }
    if (q.startsWith('select * from wo_demo_action where opportunity_id'))
      return result(
        state.actions.filter(
          (a) =>
            a.opportunity_id === args[0] &&
            a.account_id === args[1] &&
            ['queued', 'quality-queued-v1'].includes(a.status)
        )
      )
    if (q.startsWith('insert into wo_demo_usage')) return result()
    if (q.startsWith('select used from wo_demo_usage')) return result([{ used: state.used }])
    if (q.startsWith("update wo_build set qa=jsonb_set(qa,'{acceptedRetry}'")) {
      assert.equal(locked, true, 'the failed generation must be locked before the marker is written')
      assert.equal(args[0], state.build.id)
      assert.equal(args[2], state.build.qa_lease_token)
      assert.deepEqual(JSON.parse(args[3]), state.build.qa)
      assert.equal(args[5], accountId)
      assert.equal(args[6], opportunityId)
      if (rejectMarker || state.build.qa_lease_until) return result()
      state.build.qa.acceptedRetry = JSON.parse(args[1])
      return result([{ id: state.build.id }])
    }
    if (q.startsWith('insert into wo_demo_action')) {
      const row = Object.fromEntries(
        [
          'id',
          'account_id',
          'opportunity_id',
          'request_id',
          'fingerprint',
          'accepted_at',
          'revision_id',
          'build_request_id',
          'session_id',
          'automatic',
          'label',
          'step',
          'retry_of',
          'protocol',
          'status'
        ].map((key, i) => [key, args[i]])
      )
      state.actions.push(row)
      return result([row])
    }
    if (q.startsWith('update wo_demo_usage set used = used +')) {
      state.used += args[2]
      return result()
    }
    throw new Error(`Unexpected acceptance fixture query: ${q}`)
  }
  return {
    parent,
    calls,
    get state() {
      return state
    },
    accept: (extra = {}) =>
      acceptDemoActions(
        { connect: async () => ({ query, release() {} }) },
        {
          accountId,
          entries: [
            {
              opportunityId,
              requestId: 'new-qa-retry',
              retryOf: parent.id,
              acceptedRetry: { acceptedActionId: 'caller-forgery' },
              ...extra
            }
          ],
          now: () => Date.parse('2030-04-01T12:00:00Z')
        }
      )
  }
}

test('QA Retry acceptance binds the new action to the exact locked failed generation and replays once', async () => {
  const w = qaAcceptanceWorld({
    beforeBuildLock: (build) => {
      build.qa_lease_token = '18'
      build.qa.rounds.push({ n: 4, failed: [{ id: 'latest-finding' }] })
    }
  })
  const answer = await w.accept()
  assert.equal(answer.status, 202)
  const actionId = answer.body.actions[0].id
  const marker = w.state.build.qa.acceptedRetry
  assert.equal(marker.acceptedActionId, actionId)
  assert.notEqual(marker.acceptedActionId, w.parent.id)
  assert.equal(marker.buildId, w.state.build.id)
  assert.equal(marker.failedQaGeneration, '18')
  assert.equal(marker.failedQaHash, failedQaHash(w.state.build.qa))
  assert.equal(w.state.used, 2)
  assert.equal(w.state.actions.length, 2)
  assert.equal(w.calls[0].q, 'begin')
  assert.equal(w.calls.at(-1).q, 'commit')
  const locks = w.calls.filter((c) => c.q.endsWith('for update') && c.q.startsWith('select * from wo_build'))
  assert.equal(locks.length, 1)
  const firstMarker = structuredClone(marker)
  const replay = await w.accept()
  assert.deepEqual(replay.body.actions, answer.body.actions)
  assert.deepEqual(w.state.build.qa.acceptedRetry, firstMarker)
  assert.equal(w.state.used, 2)
  assert.equal(w.state.actions.length, 2)
  assert.equal(
    w.calls.filter((c) => c.q.endsWith('for update') && c.q.startsWith('select * from wo_build')).length,
    1
  )
})

test('QA Retry marker CAS refusal rolls back the new action and its budget atomically', async () => {
  const w = qaAcceptanceWorld({ rejectMarker: true })
  const before = structuredClone(w.state)
  const answer = await w.accept()
  assert.equal(answer.status, 409)
  assert.equal(answer.body.code, 'ACTION_NOT_FAILED')
  assert.deepEqual(w.state, before)
  assert.equal(w.calls.at(-1).q, 'rollback')
  assert.equal(
    w.calls.some((c) => c.q.startsWith('insert into wo_demo_action')),
    false
  )
})

test('a completed action cannot grant QA Retry when its locked build already changed to passed', async () => {
  const w = qaAcceptanceWorld({ beforeBuildLock: (build) => (build.qa.state = 'passed') })
  w.parent.status = 'completed'
  const answer = await w.accept()
  assert.equal(answer.status, 409)
  assert.equal(answer.body.code, 'ACTION_NOT_FAILED')
  assert.equal(w.state.actions.length, 1)
  assert.equal(w.state.used, 1)
  assert.equal(
    w.calls.some((c) => c.q.startsWith('update wo_build')),
    false
  )
})

test('a live QA lease rejects Retry; a fill Retry accepted before QA failure receives no QA authority', async () => {
  const busy = qaAcceptanceWorld({
    beforeBuildLock: (build) => (build.qa_lease_until = new Date('2030-04-01T12:05:00Z'))
  })
  assert.equal((await busy.accept()).status, 409)
  assert.equal(busy.state.used, 1)
  assert.equal(busy.state.actions.length, 1)
  const fill = qaAcceptanceWorld({ beforeBuildLock: (build) => (build.qa.state = 'pending') })
  const answer = await fill.accept()
  assert.equal(answer.status, 202)
  assert.notEqual(fill.state.build.qa.acceptedRetry.acceptedActionId, answer.body.actions[0].id)
  assert.equal(
    fill.calls.some((c) => c.q.startsWith('update wo_build')),
    false
  )
})

/** The build row the runner writes with its choice once the action runs (`build-choice.js`). */
async function builtByRunner(account, revision, requestId) {
  await db.pool.query(
    `insert into wo_build (account_id, revision_id, request_id, build_id, choice, choice_key)
     values ($1, $2, $3, gen_random_uuid(), '{"cms":"joomla","template":{}}'::jsonb, 'joomla||||')`,
    [account, revision, requestId]
  )
}

async function postgresQaRetry() {
  const { account, ids } = await fixture(1)
  const revision = (
    await db.pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1,$2,1,'{}','') returning id`,
      [ids[0], account]
    )
  ).rows[0].id
  const first = await acceptDemoActions(db.pool, {
    accountId: account,
    entries: [{ opportunityId: ids[0], revisionId: revision, requestId: 'pg-first', automatic: false }]
  })
  const parentId = first.body.actions[0].id
  await db.pool.query("update wo_demo_action set status='completed' where id=$1", [parentId])
  const qa = { state: 'failed', repairs: 2, rounds: [{ n: 3, failed: [{ id: 'old-finding' }] }] }
  await builtByRunner(account, revision, 'pg-first')
  const build = (
    await db.pool.query(
      `update wo_build set state='done',qa=$1::jsonb,qa_lease_token=20 where request_id='pg-first' returning *`,
      [JSON.stringify(qa)]
    )
  ).rows[0]
  return {
    account,
    parentId,
    build,
    accept: (requestId) =>
      acceptDemoActions(db.pool, {
        accountId: account,
        entries: [{ opportunityId: ids[0], requestId, retryOf: parentId }]
      })
  }
}

test(
  'PostgreSQL QA Retry acceptance replays the same marker and charges the new action once',
  opts,
  async () => {
    const f = await postgresQaRetry()
    const first = await f.accept('pg-qa-retry')
    const held = (await db.pool.query('select qa from wo_build where id=$1', [f.build.id])).rows[0].qa
    assert.equal(first.status, 202)
    assert.equal(held.acceptedRetry.acceptedActionId, first.body.actions[0].id)
    assert.equal(held.acceptedRetry.buildId, f.build.id)
    assert.equal(held.acceptedRetry.failedQaGeneration, '20')
    assert.equal(held.acceptedRetry.failedQaHash, failedQaHash(f.build.qa))
    const replay = await f.accept('pg-qa-retry')
    assert.deepEqual(replay.body.actions, first.body.actions)
    assert.equal((await readDemoUsage(db.pool, f.account, 20)).used, 2)
    assert.deepEqual(
      (await db.pool.query('select qa from wo_build where id=$1', [f.build.id])).rows[0].qa,
      held
    )
    assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 2)
  }
)

test('PostgreSQL rolls the QA marker back when inserting its new action fails', opts, async () => {
  const f = await postgresQaRetry()
  await db.pool.query(`create function reject_test_qa_action() returns trigger language plpgsql as $$
    begin if new.request_id='pg-rejected-retry' then raise exception 'rejected test QA action'; end if;
    return new; end $$`)
  await db.pool.query(
    `create trigger reject_test_qa_action before insert on wo_demo_action
     for each row execute function reject_test_qa_action()`
  )
  try {
    await assert.rejects(f.accept('pg-rejected-retry'), /rejected test QA action/)
    assert.deepEqual(
      (await db.pool.query('select qa from wo_build where id=$1', [f.build.id])).rows[0].qa,
      f.build.qa
    )
    assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 1)
    assert.equal((await readDemoUsage(db.pool, f.account, 20)).used, 1)
  } finally {
    await db.pool.query('drop trigger reject_test_qa_action on wo_demo_action')
    await db.pool.query('drop function reject_test_qa_action()')
  }
})

test(
  'PostgreSQL QA acceptance waits for the worker lock and binds its committed failed generation',
  opts,
  async () => {
    const f = await postgresQaRetry()
    const worker = await db.pool.connect()
    let pending
    try {
      await worker.query('begin')
      const pid = (await worker.query('select pg_backend_pid() as pid')).rows[0].pid
      const changed = { ...f.build.qa, rounds: [{ n: 4, failed: [{ id: 'new-worker-finding' }] }] }
      await worker.query('update wo_build set qa=$2::jsonb,qa_lease_token=21 where id=$1', [
        f.build.id,
        JSON.stringify(changed)
      ])
      pending = f.accept('pg-after-worker')
      let blocked = false
      const deadline = Date.now() + 2000
      while (!blocked && Date.now() < deadline) {
        blocked = (
          await db.pool.query(
            `select exists(select 1 from pg_stat_activity where datname=current_database()
           and $1::int=any(pg_blocking_pids(pid))) as blocked`,
            [pid]
          )
        ).rows[0].blocked
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 5))
      }
      assert.equal(blocked, true, 'acceptance must wait for the exact build row held by the QA worker')
      await worker.query('commit')
      const answer = await pending
      assert.equal(answer.status, 202)
      const held = (await db.pool.query('select qa from wo_build where id=$1', [f.build.id])).rows[0].qa
      assert.equal(held.acceptedRetry.failedQaGeneration, '21')
      assert.equal(held.acceptedRetry.failedQaHash, failedQaHash(changed))
      assert.notEqual(held.acceptedRetry.failedQaHash, failedQaHash(f.build.qa))
    } finally {
      await worker.query('rollback')
      worker.release()
      await pending?.catch(() => {})
    }
  }
)

const chosenTemplate = { cms: 'wordpress', design: 'chosen-place-template', quickstart: 'chosen/wp' }
const chosenRelease = { version: '2.3.4', files: { source: { file: 'source.zip', sha256: 'a'.repeat(64) } } }
const offeredTemplates = {
  cards: [
    {
      id: 'chosen-place-template',
      platforms: [
        { platform: 'wordpress', tag: 'chosen/wp', version: '2.3.4', release: chosenRelease },
        { platform: 'joomla', tag: 'chosen/jo', version: '5.6.7' }
      ]
    }
  ]
}

test(
  'new demo selection is required before accepting work or charging, including a whole bulk',
  opts,
  async () => {
    const { account, ids } = await fixture(2)
    const args = { accountId: account, requireSelection: true, templates: offeredTemplates }
    for (const selection of [
      undefined,
      { ...chosenTemplate, cms: 'emdash' },
      { ...chosenTemplate, quickstart: 'wrong/wp' }
    ]) {
      const result = await acceptDemoActions(db.pool, {
        ...args,
        entries: [
          { ...entry(ids[0], 'good-first'), selection: chosenTemplate },
          { ...entry(ids[1], 'bad-second'), selection }
        ]
      })
      assert.equal(result.status, 400)
      assert.equal((await readDemoUsage(db.pool, account, 20)).used, 0)
      assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 0)
    }
  }
)

test(
  'explicit CMS and exact release survive replay, catalogue drift, and a retry before a revision exists',
  opts,
  async () => {
    const { account, ids } = await fixture(1)
    const args = {
      accountId: account,
      requireSelection: true,
      templates: offeredTemplates,
      entries: [{ ...entry(ids[0], 'chosen-press'), selection: chosenTemplate }]
    }
    const first = await acceptDemoActions(db.pool, args)
    assert.equal(first.status, 202)
    const action = (await db.pool.query('select * from wo_demo_action')).rows[0]
    // `reason`: why this template — kept for the build's choice (24/10/2026).
    assert.deepEqual(action.selection, {
      ...chosenTemplate,
      version: '2.3.4',
      release: chosenRelease,
      reason: 'requested'
    })
    const replay = await acceptDemoActions(db.pool, { ...args, templates: { error: 'offline' } })
    assert.equal(replay.status, 202)
    assert.equal(replay.body.actions[0].id, action.id)
    const changed = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...args.entries[0], selection: { ...chosenTemplate, cms: 'joomla' } }]
    })
    assert.equal(changed.body.code, 'REQUEST_ID_REUSED')
    await db.pool.query("update wo_demo_action set status='failed' where id=$1", [action.id])
    const retryEntry = { ...entry(ids[0], 'chosen-retry'), retryOf: action.id }
    const rejected = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...retryEntry, selection: chosenTemplate }]
    })
    assert.equal(rejected.body.code, 'RETRY_TEMPLATE_FROZEN')
    const retry = await acceptDemoActions(db.pool, {
      ...args,
      templates: { error: 'offline' },
      entries: [retryEntry]
    })
    assert.equal(retry.status, 202)
    const resumed = (
      await db.pool.query('select * from wo_demo_action where id=$1', [retry.body.actions[0].id])
    ).rows[0]
    assert.deepEqual(resumed.selection, action.selection)
    assert.equal(resumed.revision_id, action.revision_id)
    assert.equal((await readDemoUsage(db.pool, account, 20)).used, 2)
  }
)

test(
  'agent demo freezes research at acceptance, rejects workflow drift, and Retry inherits original research/session',
  opts,
  async () => {
    const { account, ids } = await fixture(1)
    await db.pool.query(
      `insert into wo_source(opportunity_id,source,ref,status,collected)
    values($1,'facebook','https://example.test/place','complete',$2::jsonb)`,
      [ids[0], JSON.stringify({ posts: [{ text: 'Original post' }] })]
    )
    const args = {
      accountId: account,
      requireSelection: true,
      templates: offeredTemplates,
      entries: [{ ...entry(ids[0], 'agent-press'), selection: chosenTemplate, workflow: 'agent-demo/1' }]
    }
    assert.equal((await acceptDemoActions(db.pool, args)).status, 202)
    const held = (await db.pool.query('select * from wo_demo_action')).rows[0]
    assert.equal(held.selection.workflow, 'agent-demo/1')
    assert.equal(held.selection.researchInput.rawSources[0].collected.posts[0].text, 'Original post')
    await db.pool.query(`update wo_source set collected='{"posts":[{"text":"New post after acceptance"}]}'`)
    assert.equal((await acceptDemoActions(db.pool, args)).status, 202)
    const drift = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...args.entries[0], workflow: undefined }]
    })
    assert.equal(drift.body.code, 'REQUEST_ID_REUSED')
    await db.pool.query("update wo_demo_action set status='failed' where id=$1", [held.id])
    const bad = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...entry(ids[0], 'bad-retry'), retryOf: held.id, workflow: 'agent-demo/1' }]
    })
    assert.equal(bad.body.code, 'RETRY_WORKFLOW_FROZEN')
    const retry = await acceptDemoActions(db.pool, {
      ...args,
      entries: [{ ...entry(ids[0], 'agent-retry'), retryOf: held.id }]
    })
    assert.equal(retry.status, 202)
    const resumed = (
      await db.pool.query('select * from wo_demo_action where id=$1', [retry.body.actions[0].id])
    ).rows[0]
    assert.deepEqual(resumed.selection, held.selection)
    assert.equal(resumed.session_id, held.session_id)
    assert.equal(resumed.revision_id, held.revision_id)
  }
)

test(
  'auto selection (Build from my business only): Tracy picks per place from its kind, freezes the pick, and replays it unchanged',
  opts,
  async () => {
    const { account, ids } = await fixture(2)
    await db.pool.query(
      `update wo_opportunity set candidate='{"kind":"bars","ownSite":{}}'::jsonb where id=$1`,
      [ids[0]]
    )
    await db.pool.query(`update wo_opportunity set candidate='{"ownSite":{}}'::jsonb where id=$1`, [ids[1]])
    await db.pool.query(`insert into wo_preference (account_id, cms) values ($1, 'emdash')`, [account])
    const templates = {
      cards: [
        {
          id: 'agency',
          label: 'Agency',
          card: { blurb: 'A web design agency site.' },
          platforms: [{ platform: 'emdash', tag: 'agency/emdash', version: '1.0.0' }]
        },
        {
          id: 'plain-restaurant',
          label: 'Plain Restaurant',
          card: { blurb: 'A restaurant site with menu and gallery.' },
          platforms: [{ platform: 'wordpress', tag: 'plain/wp', version: '2.0.0' }]
        },
        {
          id: 'bar-restaurant',
          label: 'Bar Restaurant',
          card: { blurb: 'A restaurant and bar website with drink menus.' },
          platforms: [{ platform: 'joomla', tag: 'bar/j6', version: '3.0.0' }]
        }
      ]
    }
    const args = {
      accountId: account,
      requireSelection: true,
      templates,
      entries: ids.map((id, i) => ({
        ...entry(id, `auto-${i}`),
        selection: { auto: true },
        ownSite: true,
        workflow: 'agent-demo/1',
        chatMode: 'client-send/1'
      }))
    }
    const first = await acceptDemoActions(db.pool, args)
    assert.equal(first.status, 202)
    const rows = (await db.pool.query('select opportunity_id, selection from wo_demo_action')).rows
    const of = (id) => rows.find((r) => r.opportunity_id === id).selection
    assert.equal(of(ids[0]).design, 'bar-restaurant')
    assert.equal(of(ids[0]).cms, 'joomla')
    assert.equal(of(ids[0]).version, '3.0.0')
    assert.match(of(ids[0]).auto.reason, /^auto:restaurant-match;kind:bars$/)
    // The Default CMS has no restaurant template, so it does not decide.
    assert.ok(['plain-restaurant', 'bar-restaurant'].includes(of(ids[1]).design))
    assert.equal(of(ids[1]).workflow, 'agent-demo/1')
    const replay = await acceptDemoActions(db.pool, args)
    assert.equal(replay.status, 202)
    assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 2)
    // a customer's own sites count on their own cap, not on the demos'
    assert.equal((await readDemoUsage(db.pool, account, 20, Date.now(), 'own-site')).used, 2)
    assert.equal((await readDemoUsage(db.pool, account, 20)).used, 0)
    const none = await acceptDemoActions(db.pool, {
      ...args,
      templates: { cards: [] },
      entries: [{ ...args.entries[0], requestId: 'auto-none' }]
    })
    assert.equal(none.status, 503)
    assert.equal(none.body.code, 'NO_TEMPLATE_OFFERED')
  }
)

// Pilot 24/10/2026: an account that had built six demos was refused its own site, "used 6, limit 3".
test('demo builds and own-site builds each have their own daily cap', opts, async () => {
  const { account, ids } = await fixture(3)
  await db.pool.query(`update wo_opportunity set candidate='{"ownSite":{}}'::jsonb where id=$1`, [ids[2]])
  const demo = (id, requestId) => ({
    accountId: account,
    requireSelection: true,
    templates: offeredTemplates,
    limit: 1,
    entries: [{ ...entry(id, requestId), selection: chosenTemplate, workflow: 'agent-demo/1' }]
  })
  assert.equal((await acceptDemoActions(db.pool, demo(ids[0], 'cap-demo'))).status, 202)
  const over = await acceptDemoActions(db.pool, demo(ids[1], 'cap-demo-2'))
  assert.equal(over.status, 429)
  assert.equal(over.body.code, 'DEMO_BUILD_DAILY_LIMIT')
  const own = await acceptDemoActions(db.pool, {
    ...demo(ids[2], 'cap-own'),
    entries: [
      { ...entry(ids[2], 'cap-own'), selection: chosenTemplate, workflow: 'agent-demo/1', ownSite: true }
    ]
  })
  assert.equal(own.status, 202, JSON.stringify(own.body))
  assert.equal((await readDemoUsage(db.pool, account, 1)).used, 1)
  assert.equal((await readDemoUsage(db.pool, account, 1, Date.now(), 'own-site')).used, 1)
})

const twoCms = {
  cards: [
    {
      id: 'tracy-base',
      label: 'Tracy Base',
      card: { blurb: 'A small business site.' },
      platforms: [
        { platform: 'wordpress', tag: 'tracy-base/wp7', version: '1.0.0' },
        { platform: 'joomla', tag: 'tracy-base/j6', version: '1.0.0' }
      ]
    },
    {
      id: 'plain-restaurant',
      label: 'Plain Restaurant',
      card: { blurb: 'A restaurant site.' },
      platforms: [{ platform: 'wordpress', tag: 'plain/wp', version: '2.0.0' }]
    }
  ]
}
const pins = {
  wordpress: { tag: 'tracy-base/wp7', policy: 'strict' },
  joomla: { tag: 'tracy-base/j6', policy: 'strict' }
}
const human = (selection, requestId) => ({
  accountId: null,
  requireSelection: true,
  templates: twoCms,
  pins,
  entries: [{ requestId, selection, workflow: 'agent-demo/1', chatMode: 'client-send/1' }]
})
const run = async (account, id, selection, requestId) => {
  const args = human(selection, requestId)
  args.accountId = account
  args.entries[0].opportunityId = id
  return acceptDemoActions(db.pool, args)
}

test('a build names its CMS and template: the human choice is what is frozen', opts, async () => {
  const { account, ids } = await fixture(1)
  const done = await run(
    account,
    ids[0],
    { cms: 'wordpress', design: 'plain-restaurant', quickstart: 'plain/wp' },
    'human-1'
  )
  assert.equal(done.status, 202)
  const frozen = (await db.pool.query('select selection from wo_demo_action')).rows[0].selection
  assert.deepEqual(
    [frozen.cms, frozen.design, frozen.quickstart],
    ['wordpress', 'plain-restaurant', 'plain/wp']
  )
  assert.equal(frozen.auto, undefined)
})

test('a CMS named without a template takes the template /ops/wo pins for it', opts, async () => {
  const { account, ids } = await fixture(2)
  const wp = await run(account, ids[0], { cms: 'wordpress' }, 'pin-wp')
  const jo = await run(account, ids[1], { cms: 'joomla' }, 'pin-jo')
  assert.equal(wp.status, 202)
  assert.equal(jo.status, 202)
  const rows = (await db.pool.query('select selection from wo_demo_action order by queued_at')).rows
  assert.deepEqual(rows.map((r) => r.selection.quickstart).sort(), ['tracy-base/j6', 'tracy-base/wp7'])
})

test(
  'an auto selection is refused on a plain build; no template and no CMS is refused too',
  opts,
  async () => {
    const { account, ids } = await fixture(1)
    for (const [i, selection] of [{ auto: true }, undefined, {}].entries()) {
      const refused = await run(account, ids[0], selection, `no-auto-${i}`)
      assert.equal(refused.status, 400, JSON.stringify(selection))
      assert.equal(refused.body.code, 'DEMO_TEMPLATE_REQUIRED')
    }
    assert.equal((await db.pool.query('select id from wo_demo_action')).rowCount, 0)
  }
)
