// The Website Opportunities Build press hands a template that is on the step chain to the chain (#479): the site is
// created with the chain workflow and the frozen research revision, and no chat turn is sent for it.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { acceptDemoActions, demoActionOf } from '../src/opportunities-build/demo-actions.js'
import { createDemoRunner } from '../src/opportunities-build/demo-runner.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { fileDb } from './_db.mjs'
import { LOST_PLACING, restartBrief } from '../src/sites/brief-store.js'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const READY = { version: 'brief-readiness/1', verdict: 'pass', next: 'build', checks: [], ownerQuestions: [] }
const CHAIN = { design: 'ja-boxing', quickstart: 'ja-boxing/j6', cms: 'joomla' }
const OTHER = { design: 'ja-restaurant', quickstart: 'ja-restaurant/j6', cms: 'joomla' }
let savedSwitch
beforeEach(() => {
  savedSwitch = process.env.STEP_CHAIN_ENABLED
  process.env.STEP_CHAIN_ENABLED = '1'
})
afterEach(() => {
  if (savedSwitch === undefined) delete process.env.STEP_CHAIN_ENABLED
  else process.env.STEP_CHAIN_ENABLED = savedSwitch
})

/** A fictional account, place and create door: the door records what it was asked and makes a site. */
async function world(template, { chainMeasurement = true } = {}) {
  const pool = db.pool
  const account = (
    await pool.query("insert into account(email) values ('builder@test.example') returning id")
  ).rows[0].id
  const opportunity = (
    await pool.query(
      `insert into wo_opportunity(account_id,name,provider,provider_id,candidate)
       values ($1,'Harbor Gym','url','https://harbor-gym.example','{}') returning id`,
      [account]
    )
  ).rows[0].id
  let at = Date.now()
  const created = []
  const messages = []
  const cards = [
    {
      id: template.design,
      label: template.design,
      platforms: [{ platform: template.cms, tag: template.quickstart, version: '1.0.10' }]
    }
  ]
  const measured = await websiteOpportunitiesDomain()
  const domain = { ...measured, briefReadinessOf: () => structuredClone(READY) }
  const request = async (path, init = {}) => {
    if (path === '/api/templates') return Response.json({ templates: cards })
    if (path === '/api/sites') {
      const body = JSON.parse(init.body)
      created.push(body)
      await pool.query(
        `insert into site(site_key,label,platform,host,address)
         values ('harbor-gym.localhost','harbor-gym',$1,'local','https://harbor-gym.localhost')
         on conflict do nothing`,
        [template.cms]
      )
      await pool.query(
        `insert into site_creation(account_id,build_id,payload_hash,state,site_key,job_id)
         values ($1,$2,'hash','done','harbor-gym.localhost','job-test') on conflict do nothing`,
        [account, body.buildId]
      )
      if (body.workflow === STEP_CHAIN_WORKFLOW && chainMeasurement)
        await pool.query(
          `insert into site_brief(site_key,account_id,platform,quickstart,brief,state,timings)
           values ('harbor-gym.localhost',$1,$2,$3,'{}','applied',$4::jsonb)`,
          [
            account,
            template.cms,
            template.quickstart,
            JSON.stringify({ chain: { ending: 'complete', steps: [{ step: 'write', outcome: 'done' }] } })
          ]
        )
      return Response.json({ siteKey: 'harbor-gym.localhost', jobId: 'job-test' }, { status: 201 })
    }
    if (path.includes('/jobs/')) return Response.json({ state: 'done' })
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  }
  const deps = {
    pool,
    config: { origin: 'http://localhost', siteDomain: 'localhost', sessionSecret: 's'.repeat(32) },
    request,
    loadDomain: async () => domain,
    revisionForAction: (p, args) => revisionForAction(p, { ...args, historical: false }),
    runtime: async () => ({ settings: DEFAULT_WO_OPS_SETTINGS }),
    switchOn: async () => true,
    objects: { get: async () => null },
    now: () => at,
    prepareDemoContact: async () => ({ ok: true }),
    checkDemoGrant: async () => true,
    sessionAhead: async (_site, _email, id) => id,
    demoQa: async () => ({ ok: true, status: 200, body: { baseline: {}, checks: [], pages: ['/'] } }),
    prompt: async (_site, _email, session, id, text) => {
      messages.push({ session, id, text })
      return true
    },
    log: { warn() {}, error() {} }
  }
  // What the browser sends for a Build press: the agent-demo workflow in chat-send mode.
  const press = (extra = {}) =>
    acceptDemoActions(pool, {
      accountId: account,
      entries: [
        {
          opportunityId: opportunity,
          requestId: 'press-once',
          ...extra,
          workflow: 'agent-demo/1',
          chatMode: 'client-send/1',
          selection: { cms: template.cms, design: template.design, quickstart: template.quickstart }
        }
      ],
      requireSelection: true,
      templates: { cards },
      now: () => at
    })
  const run = async () => {
    await createDemoRunner(deps).drain()
    at += 11000
    await pool.query("update wo_demo_action set next_at=$1 where status='queued'", [new Date(at - 1)])
    await createDemoRunner(deps).drain()
  }
  return { pool, press, run, created, messages, deps, account, opportunity }
}

async function historicalChain() {
  const w = await world(CHAIN)
  await w.press()
  await w.run()
  const parent = (await w.pool.query('select * from wo_demo_action')).rows[0]
  const build = (await w.pool.query('select * from wo_build')).rows[0]
  await w.pool.query(
    `insert into seat(site_key,account_id,role,granted_by,accepted_at) values($1,$2,'owner',$2,now())`,
    [build.site_key, w.account]
  )
  await w.pool.query(
    `update site_brief set state='failed',error='worker restarted',
     brief=jsonb_build_object('workflow',$1::text,'researchRevisionId',$2::text),
     timings='{"lostFrom":"preparing","chain":{"ending":"running","running":["copy"]}}',updated_at=now()`,
    [STEP_CHAIN_WORKFLOW, parent.revision_id]
  )
  const resumed = []
  w.deps.resumeFill = async (currentBuild, _email, actionId, authority) => {
    const row = (await w.pool.query('select * from site_brief where site_key=$1', [currentBuild.site_key]))
      .rows[0]
    const started = await restartBrief(w.pool, currentBuild.site_key, row.brief, actionId, authority)
    if (started) resumed.push(actionId)
    return started
  }
  const retry = (requestId = 'explicit-chain-retry') =>
    acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [{ opportunityId: w.opportunity, requestId, retryOf: parent.id }]
    })
  return { ...w, parent, build, resumed, retry }
}

async function revokeBuilder(w) {
  await w.pool.query(
    `with other as (insert into account(email) values('other-owner@test.example') returning id)
    insert into seat(site_key,account_id,role,granted_by,accepted_at)
    select $1,id,'owner',id,now() from other`,
    [w.build.site_key]
  )
  await w.pool.query('update seat set revoked_at=now() where account_id=$1', [w.account])
}

test(
  'an explicit historical chain Retry preserves the old verdict and resumes the same failed generation once',
  opts,
  async () => {
    const w = await historicalChain()
    const accepted = await w.retry()
    assert.equal(accepted.status, 202, JSON.stringify(accepted.body))
    const replay = await w.retry()
    assert.equal(replay.body.actions[0].id, accepted.body.actions[0].id)
    const action = (await w.pool.query('select * from wo_demo_action where retry_of=$1', [w.parent.id]))
      .rows[0]
    assert.equal(action.build_request_id, w.parent.build_request_id)
    assert.equal(action.revision_id, w.parent.revision_id)
    const marker = action.selection.acceptedChainRetry
    assert.equal(marker.acceptedActionId, action.id)
    assert.equal(marker.buildId, w.build.id)
    assert.match(marker.failedBriefHash, /^[a-f0-9]{32}$/)
    assert.deepEqual((await w.pool.query('select qa from wo_build')).rows[0].qa, w.build.qa)
    await w.run()
    assert.deepEqual(w.resumed, [action.id])
    assert.equal((await w.pool.query('select state from site_brief')).rows[0].state, 'queued')
    assert.deepEqual((await w.pool.query('select qa from wo_build')).rows[0].qa, w.build.qa)
    await w.pool.query(`update site_brief set state='applied', timings=timings||$1::jsonb`, [
      JSON.stringify({ chain: { ending: 'complete', steps: [{ step: 'write', outcome: 'done' }] } })
    ])
    await w.run()
    assert.deepEqual(w.resumed, [action.id])
    assert.equal(w.created.length, 1)
    assert.equal(
      (await w.pool.query('select status from wo_demo_action where id=$1', [action.id])).rows[0].status,
      'completed'
    )
    assert.deepEqual(
      (await w.pool.query('select * from wo_demo_action where id=$1', [w.parent.id])).rows[0],
      w.parent
    )
  }
)

test('a failed child Retry receives fresh authority for its own failed chain generation', opts, async () => {
  const w = await historicalChain()
  const first = await w.retry()
  const firstId = first.body.actions[0].id
  await w.run()
  await w.pool.query("update site_brief set state='failed',error='second attempt stopped',updated_at=now()")
  await w.run()
  assert.equal(
    (await w.pool.query('select status from wo_demo_action where id=$1', [firstId])).rows[0].status,
    'failed'
  )
  const second = await acceptDemoActions(w.pool, {
    accountId: w.account,
    entries: [{ opportunityId: w.opportunity, requestId: 'retry-the-failed-child', retryOf: firstId }]
  })
  assert.equal(second.status, 202, JSON.stringify(second.body))
  const secondId = second.body.actions[0].id
  const child = (await w.pool.query('select selection from wo_demo_action where id=$1', [secondId])).rows[0]
  assert.equal(child.selection.acceptedChainRetry.acceptedActionId, secondId)
  assert.equal(child.selection.acceptedChainRetry.parentActionId, firstId)
  await w.run()
  assert.deepEqual(w.resumed, [firstId, secondId])
  assert.equal(w.created.length, 1)
})

test(
  'an applied soft failure with a failed write explicitly restarts the same chain with a new generation',
  opts,
  async () => {
    const w = await historicalChain()
    const measured = {
      chain: {
        ending: 'soft-failure',
        failedStep: 'plan',
        steps: [
          { step: 'plan', outcome: 'failed' },
          { step: 'write', outcome: 'failed', error: 'SITE_RECOVERY_POINT_UNAVAILABLE' }
        ]
      }
    }
    await w.pool.query(
      `update site_brief set state='applied',error=null,normalized='{"old":"normalized"}',timings=$1::jsonb,updated_at=now()`,
      [JSON.stringify(measured)]
    )
    await w.pool.query("update wo_demo_action set status='failed',error='QA_NEEDS_REVIEW' where id=$1", [
      w.parent.id
    ])
    await w.pool.query("update wo_build set qa=jsonb_set(qa,'{state}','\"failed\"')")
    const parent = (await w.pool.query('select * from wo_demo_action where id=$1', [w.parent.id])).rows[0]
    const old = (await w.pool.query('select * from site_brief')).rows[0]
    assert.equal(
      await restartBrief(w.pool, w.build.site_key, old.brief),
      false,
      'ordinary retry cannot restart applied without authority'
    )
    const accepted = await w.retry('retry-terminal-write-failure')
    assert.equal(accepted.status, 202, JSON.stringify(accepted.body))
    const id = accepted.body.actions[0].id
    const action = (await w.pool.query('select * from wo_demo_action where id=$1', [id])).rows[0]
    assert.ok(action.selection.acceptedChainRetry)
    assert.equal(action.selection.acceptedRetry, undefined)
    assert.deepEqual(
      (await w.pool.query('select * from site_brief')).rows[0],
      old,
      'acceptance preserves prior outputs'
    )
    await w.run()
    const restarted = (await w.pool.query('select * from site_brief')).rows[0]
    assert.equal(restarted.state, 'queued')
    assert.equal(
      restarted.normalized,
      null,
      'a new chain prepares fresh inputs instead of resuming frozen checker outputs'
    )
    assert.equal(restarted.timings.woRetryActionId, id)
    assert.ok(Number(restarted.timings.attemptStartedAt) > 0)
    assert.equal(restarted.timings.chain, undefined)
    assert.equal(restarted.created_at.getTime(), old.created_at.getTime())
    assert.deepEqual(restarted.brief, old.brief)
    assert.deepEqual(w.resumed, [id])
    await w.run()
    assert.deepEqual(w.resumed, [id], 'polling the open new generation cannot restart it again')
    assert.equal(w.created.length, 1)
    assert.deepEqual(
      (await w.pool.query('select * from wo_demo_action where id=$1', [w.parent.id])).rows[0],
      parent
    )
  }
)

for (const scenario of [
  'healthy',
  'successful-write',
  'missing-write',
  'running',
  'running-object',
  'malformed-steps',
  'latest-success',
  'foreign-revision',
  'open-turn',
  'replaced',
  'unowned',
  'live-writer',
  'qa-lease'
])
  test(`an applied chain does not grant retry authority for ${scenario}`, opts, async () => {
    const w = await historicalChain()
    const chain = { ending: 'soft-failure', steps: [{ step: 'write', outcome: 'failed' }] }
    if (scenario === 'healthy') chain.ending = 'complete'
    if (scenario === 'successful-write') chain.steps[0].outcome = 'done'
    if (scenario === 'missing-write') chain.steps = [{ step: 'plan', outcome: 'failed' }]
    if (scenario === 'running') chain.running = ['copy']
    if (scenario === 'running-object') chain.running = { copy: true }
    if (scenario === 'malformed-steps') chain.steps = { write: 'failed' }
    if (scenario === 'latest-success') chain.steps.push({ step: 'write', outcome: 'done' })
    await w.pool.query(`update site_brief set state='applied',timings=$1::jsonb,updated_at=now()`, [
      JSON.stringify({ chain })
    ])
    if (scenario === 'foreign-revision')
      await w.pool.query(
        "update site_brief set brief=jsonb_set(brief,'{researchRevisionId}',to_jsonb(gen_random_uuid()::text))"
      )
    if (scenario === 'open-turn')
      await w.pool.query(
        "insert into site_turn(turn_id,site_key,session_id,turn,actor,title,rpc_id,state) values('open-turn',$1,'other-session',1,'builder@test.example','Other write','open-write','open')",
        [w.build.site_key]
      )
    if (scenario === 'replaced') await w.pool.query("update site set created_at=now()+interval '1 second'")
    if (scenario === 'unowned') await revokeBuilder(w)
    if (scenario === 'live-writer')
      await w.pool.query(
        "insert into site_write_lease(site_key,holder_session,wrote_at) values($1,'other-session',now())",
        [w.build.site_key]
      )
    if (scenario === 'qa-lease')
      await w.pool.query("update wo_build set qa_lease_until=now()+interval '1 minute'")
    const accepted = await w.retry(`refused-terminal-${scenario}`)
    assert.equal(accepted.status, 409, JSON.stringify(accepted.body))
    assert.equal(accepted.body.code, 'ACTION_NOT_FAILED')
    assert.equal((await w.pool.query('select count(*)::int n from wo_demo_action')).rows[0].n, 1)
  })

test(
  'accepted applied chain Retry refuses a changed terminal write measurement before restarting',
  opts,
  async () => {
    const w = await historicalChain()
    await w.pool.query(
      `update site_brief set state='applied',timings='{"chain":{"ending":"soft-failure","steps":[{"step":"write","outcome":"failed"}]} }',updated_at=now()`
    )
    const accepted = await w.retry('changed-applied-terminal')
    assert.equal(accepted.status, 202)
    const id = accepted.body.actions[0].id
    const action = (await w.pool.query('select * from wo_demo_action where id=$1', [id])).rows[0]
    await w.pool.query(
      "update site_brief set timings=jsonb_set(timings,'{chain,steps,0,outcome}','\"done\"'),updated_at=now()"
    )
    const current = (await w.pool.query('select * from site_brief')).rows[0]
    assert.equal(
      await restartBrief(w.pool, w.build.site_key, current.brief, id, action.selection.acceptedChainRetry),
      false
    )
    await w.run()
    assert.deepEqual(w.resumed, [])
    assert.equal(
      (await w.pool.query('select error from wo_demo_action where id=$1', [id])).rows[0].error,
      'CHAIN_RETRY_AUTHORITY_CHANGED'
    )
  }
)

for (const scenario of [
  'applied',
  'ready',
  'replaced',
  'unowned',
  'wrong-revision',
  'live-writer',
  'lost-applying',
  'lost-placement'
])
  test(`historical chain Retry refuses ${scenario} before accepting authority`, opts, async () => {
    const w = await historicalChain()
    if (scenario === 'applied' || scenario === 'ready')
      await w.pool.query('update site_brief set state=$1', [scenario])
    if (scenario === 'replaced') await w.pool.query("update site set created_at=now()+interval '1 second'")
    if (scenario === 'unowned') await revokeBuilder(w)
    if (scenario === 'wrong-revision')
      await w.pool.query(
        "update site_brief set brief=jsonb_set(brief,'{researchRevisionId}',to_jsonb(gen_random_uuid()::text))"
      )
    if (scenario === 'lost-applying')
      await w.pool.query('update site_brief set timings=timings||\'{"lostFrom":"applying"}\'::jsonb')
    if (scenario === 'live-writer')
      await w.pool.query(
        "insert into site_write_lease(site_key,holder_session,wrote_at) values($1,'another-writer',now())",
        [w.build.site_key]
      )
    if (scenario === 'lost-placement')
      await w.pool.query("update site_brief set error=$1,timings='{}'", [LOST_PLACING])
    const refused = await w.retry()
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'ACTION_NOT_FAILED')
    assert.equal((await w.pool.query('select count(*)::int as n from wo_demo_action')).rows[0].n, 1)
    assert.deepEqual((await w.pool.query('select qa from wo_build')).rows[0].qa, w.build.qa)
  })

for (const scenario of ['changed-brief', 'replaced', 'unowned', 'live-writer', 'forged-marker'])
  test(`accepted chain Retry cannot restart after ${scenario}`, opts, async () => {
    const w = await historicalChain()
    const accepted = await w.retry()
    assert.equal(accepted.status, 202)
    const action = (await w.pool.query('select * from wo_demo_action where retry_of=$1', [w.parent.id]))
      .rows[0]
    const marker = action.selection.acceptedChainRetry
    if (scenario === 'changed-brief')
      await w.pool.query('update site_brief set brief=brief||\'{"about":"changed after acceptance"}\'::jsonb')
    if (scenario === 'replaced') await w.pool.query("update site set created_at=now()+interval '1 second'")
    if (scenario === 'unowned') await revokeBuilder(w)
    if (scenario === 'live-writer')
      await w.pool.query(
        "insert into site_write_lease(site_key,holder_session,wrote_at) values($1,'another-writer',now())",
        [w.build.site_key]
      )
    const current = (await w.pool.query('select * from site_brief')).rows[0]
    const authority = scenario === 'forged-marker' ? { ...marker, failedBriefHash: '0'.repeat(32) } : marker
    assert.equal(await restartBrief(w.pool, w.build.site_key, current.brief, action.id, authority), false)
    if (scenario !== 'forged-marker') {
      await w.run()
      assert.deepEqual(w.resumed, [])
      const ended = (await w.pool.query('select status,error from wo_demo_action where id=$1', [action.id]))
        .rows[0]
      assert.equal(ended.status, 'failed')
      assert.equal(ended.error, 'CHAIN_RETRY_AUTHORITY_CHANGED')
    }
    assert.deepEqual((await w.pool.query('select qa from wo_build')).rows[0].qa, w.build.qa)
  })

test(
  'a Build press on a chain template asks for the chain workflow with the research revision and sends no chat',
  opts,
  async () => {
    const w = await world(CHAIN)
    const accepted = await w.press()
    assert.equal(accepted.status, 202)
    // The press is no chat action: the browser has no chat to open for it.
    const action = (await w.pool.query('select * from wo_demo_action')).rows[0]
    assert.equal(action.selection.chatMode, undefined)
    assert.equal(accepted.body.actions[0].chatMode, undefined)
    await w.run()
    assert.equal(w.created.length, 1)
    const revision = (await w.pool.query('select * from wo_revision')).rows[0]
    assert.equal(w.created[0].workflow, STEP_CHAIN_WORKFLOW)
    assert.equal(w.created[0].researchRevisionId, revision.id)
    assert.equal(Object.hasOwn(w.created[0], 'brief'), false)
    assert.equal(w.messages.length, 0, 'no brief is sent as the customer’s message')
    const done = (await w.pool.query('select * from wo_demo_action')).rows[0]
    assert.equal(done.status, 'completed', JSON.stringify(done))
    assert.equal(done.error, null)
    // The owner-link step and the retention sweep read these: the row reaches Outreach and the demo has a clock.
    const build = (await w.pool.query('select qa, demo_expires_at from wo_build')).rows[0]
    assert.equal(build.qa.state, 'passed')
    assert.ok(build.demo_expires_at)
  }
)

test('a done host build without the chain measurement cannot hand over as QA passed', opts, async () => {
  const w = await world(CHAIN, { chainMeasurement: false })
  await w.press()
  await w.run()
  const action = (await w.pool.query('select * from wo_demo_action')).rows[0]
  assert.equal(action.status, 'failed')
  assert.equal(action.error, 'QA_NEEDS_REVIEW')
  const build = (await w.pool.query('select qa from wo_build')).rows[0]
  assert.equal(build.qa.state, 'failed')
  assert.equal(w.messages.length, 0)
})

test('a template that is not on the chain keeps the agent-demo build and its chat', opts, async () => {
  const w = await world(OTHER)
  await w.press()
  const action = (await w.pool.query('select * from wo_demo_action')).rows[0]
  assert.equal(action.selection.chatMode, 'client-send/1')
  assert.equal(action.selection.workflow, 'agent-demo/1')
})

test('with the master switch off a chain template keeps the agent-demo build', opts, async () => {
  delete process.env.STEP_CHAIN_ENABLED
  const w = await world(CHAIN)
  await w.press()
  const action = (await w.pool.query('select * from wo_demo_action')).rows[0]
  assert.equal(action.selection.chatMode, 'client-send/1')
})

test(
  'a non-chat press on a template that is not on the chain still creates an agent-demo site',
  opts,
  async () => {
    const w = await world(OTHER)
    await acceptDemoActions(w.pool, {
      accountId: (await w.pool.query('select id from account')).rows[0].id,
      entries: [
        {
          opportunityId: (await w.pool.query('select id from wo_opportunity')).rows[0].id,
          requestId: 'press-agent',
          workflow: 'agent-demo/1',
          selection: { cms: OTHER.cms, design: OTHER.design, quickstart: OTHER.quickstart }
        }
      ],
      requireSelection: true,
      templates: {
        cards: [
          { id: OTHER.design, platforms: [{ platform: OTHER.cms, tag: OTHER.quickstart, version: '1.0.10' }] }
        ]
      }
    })
    await w.run()
    assert.equal(w.created.length, 1)
    assert.equal(w.created[0].workflow, 'agent-demo/1')
    assert.equal(Object.hasOwn(w.created[0], 'researchRevisionId'), false)
  }
)

test(
  'an own-site Build press also selects the chain without a second chat writer or retention clock',
  opts,
  async () => {
    const w = await world(CHAIN)
    await w.pool.query(
      `update wo_opportunity set candidate = '{"ownSite":{"requestId":"own-test-press"},"trade":"fitness"}'`
    )
    const answer = await w.press({ ownSite: true })
    assert.equal(answer.status, 202, JSON.stringify(answer.body))
    assert.equal(answer.body.actions[0].chatMode, undefined)
    await w.run()
    assert.equal(w.created.length, 1)
    assert.equal(w.created[0].workflow, STEP_CHAIN_WORKFLOW)
    assert.equal(w.messages.length, 0)
    const build = (await w.pool.query('select demo_expires_at from wo_build')).rows[0]
    assert.equal(build.demo_expires_at, null)
    const account = (await w.pool.query('select id from account')).rows[0].id
    const actionId = answer.body.actions[0].id
    assert.equal((await demoActionOf(w.pool, account, actionId)).siteKey, 'harbor-gym.localhost')
    await w.pool.query('update wo_build set demo_deleted_at=now()')
    assert.equal((await demoActionOf(w.pool, account, actionId)).siteKey, undefined)
  }
)

test(
  'a public chain Retry with no full recovery point ends with its exact refusal without restarting the writer',
  opts,
  async () => {
    const w = await historicalChain()
    let preflights = 0
    w.deps.resumeFill = async () => {
      preflights++
      throw Object.assign(new Error('No full recovery point'), { code: 'SITE_RECOVERY_POINT_UNAVAILABLE' })
    }
    const accepted = await w.retry()
    assert.equal(accepted.status, 202)
    await w.run()
    const action = (
      await w.pool.query('select status,error from wo_demo_action where retry_of=$1', [w.parent.id])
    ).rows[0]
    assert.equal(action.status, 'failed')
    assert.equal(action.error, 'SITE_RECOVERY_POINT_UNAVAILABLE')
    assert.equal(preflights, 1, 'an unavailable recovery point is a terminal preflight refusal')
    assert.deepEqual(w.resumed, [])
    assert.equal((await w.pool.query('select state from site_brief')).rows[0].state, 'failed')
  }
)
