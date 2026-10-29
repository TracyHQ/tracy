import { handOffToAgent } from '../src/opportunities-build/handoff-service.js'
import { promptHandoff } from '../src/opportunities-build/handoff.js'
import { createClientDemoService, LOGO_RESEARCH_PENDING } from '../src/opportunities-build/client-demo.js'
import { LOGO_RESEARCH_WAIT_MS, logoResearchNote } from '../src/opportunities-build/logo-research.js'
import { LOOK_PROMPT_VERSION } from '../src/opportunities-build/demo-look.js'
import { compareAgentInventory } from '../src/sites/agent-demo-inventory.js'
import { createHash } from 'node:crypto'
import {
  agentDemoCapabilities,
  agentDemoCreateContext,
  bindClientDemoContinuation
} from '../src/opportunities-build/agent-demo.js'
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { acceptDemoActions, demoProgress, readDemoUsage } from '../src/opportunities-build/demo-actions.js'
import {
  claimAndRunQa,
  failedQaHash,
  resumeDemoQa,
  takeDueBaselines,
  wakeStuckRepairs
} from '../src/opportunities-build/demo-qa.js'
import { createDemoRunner } from '../src/opportunities-build/demo-runner.js'
import { createWebsiteBuilder } from '../src/opportunities-build/route.js'
import { demoView } from '../../../packages/ui/tracy-wo-views/src/demo.ts'
import { demoJourneySql } from '../src/opportunities-build/journey-sql.js'
import { listOpportunities } from 'website-opportunities/src/store.js'
import { quickstartActionOpen } from '../src/opportunities-build/site-content.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { fileFollowUp, followThrough } from '../src/sites/door-follow-up.js'
import { openTurn } from '../src/sites/turns.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const READY = { version: 'brief-readiness/1', verdict: 'pass', next: 'build', checks: [], ownerQuestions: [] }

/** The domain with every brief's readiness decreed (`READY` unless a test names another). */
function readyByDecree(domain, readiness = READY) {
  return { ...domain, briefReadinessOf: () => structuredClone(readiness) }
}

async function world({
  lostCreateReceipt = false,
  lostPromptReceipt = false,
  fillState = 'applied',
  provisionState = 'done',
  historical = true,
  agentWorkflow = false,
  chatMode = undefined,
  automatic = true,
  // `'measured'`: the brief's own readiness; an object: that readiness; none: ready by decree.
  readiness = READY
} = {}) {
  const pool = db.pool
  const account = (
    await pool.query("insert into account(email) values ('builder@test.example') returning id")
  ).rows[0].id
  const opportunity = (
    await pool.query(
      `insert into wo_opportunity(account_id,name,provider,provider_id,candidate)
     values ($1,'Pho Ba','url','https://phoba.example','{}') returning id`,
      [account]
    )
  ).rows[0].id
  let at = Date.now()
  let creates = 0
  const provisionCalls = []
  const sessions = new Set()
  const allocations = []
  const messages = new Map()
  // These worlds test provisioning, hand-off and QA, not brief readiness: their fictional restaurant has no photos, so
  // its brief is ready by decree here (readiness has its own tests, `wo-brief-readiness-build.test.mjs`).
  const measured = await websiteOpportunitiesDomain()
  const domain = readiness === 'measured' ? measured : readyByDecree(measured, readiness)
  const request = async (path, init = {}) => {
    if (path === '/api/templates')
      return Response.json({
        templates: [
          {
            id: 'tracy-base',
            label: 'Tracy Base',
            platforms: [{ platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '1.2.0' }]
          }
        ]
      })
    if (path === '/api/sites/claim' && chatMode) {
      const b = JSON.parse(init.body)
      const action = (
        await pool.query(
          `select a.* from wo_demo_action a join wo_build b on b.request_id=a.build_request_id and b.account_id=a.account_id where b.build_id=$1 order by a.accepted_at desc limit 1`,
          [b.buildId]
        )
      ).rows[0]
      await pool.query(
        "insert into site(site_key,label,platform,host,address) values ('pho-ba.localhost','pho-ba','emdash','local','https://pho-ba.localhost') on conflict do nothing"
      )
      await pool.query(
        `insert into site_creation(account_id,build_id,payload_hash,state,site_key,session_id) values($1,$2,'hash','claimed','pho-ba.localhost',$3) on conflict do nothing`,
        [account, b.buildId, action.session_id]
      )
      sessions.add(action.session_id)
      return Response.json({ siteKey: 'pho-ba.localhost', next: `/pho-ba.localhost/s/${action.session_id}` })
    }
    if (path === '/api/sites') {
      const b = JSON.parse(init.body)
      provisionCalls.push(b)
      const made = (
        await pool.query('select * from site_creation where account_id=$1 and build_id=$2', [
          account,
          b.buildId
        ])
      ).rows[0]
      if (chatMode && made && !made.job_id) {
        creates++
        await pool.query(
          "update site_creation set state=$3,job_id='job-test' where account_id=$1 and build_id=$2",
          [account, b.buildId, provisionState]
        )
      }
      if (!made) {
        creates++
        await pool.query(
          "insert into site(site_key,label,platform,host,address) values ('pho-ba.localhost','pho-ba','emdash','local','https://pho-ba.localhost')"
        )
        await pool.query(
          `insert into site_creation(account_id,build_id,payload_hash,state,site_key,job_id)
           values ($1,$2,'hash',$3,'pho-ba.localhost','job-test')`,
          [account, b.buildId, provisionState]
        )
        if (!agentWorkflow)
          await pool.query(
            // Like `putBrief`: a new site's brief replaces a deleted site's row under the same address.
            `insert into site_brief(site_key,account_id,platform,brief,state)
           values ('pho-ba.localhost',$1,'emdash','{}',$2)
           on conflict (site_key) do update set state=excluded.state, error=null, timings='{}'::jsonb,
             created_at=now(), updated_at=now()`,
            [account, fillState]
          )
      }
      if (lostCreateReceipt) {
        lostCreateReceipt = false
        throw new Error('process ended before create receipt')
      }
      return Response.json({ siteKey: 'pho-ba.localhost', jobId: 'job-test' }, { status: 201 })
    }
    if (path.includes('/jobs/'))
      // An EmDash site has no component to pair: the real job answers `skipped` (`pair-component.js`).
      return Response.json({ state: provisionState, ...(agentWorkflow ? { custody: 'skipped' } : {}) })
    if (agentWorkflow && path.endsWith('/apply'))
      return Response.json({ schemaVersion: 'tracy-content-describe/v1', kinds: [] })
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  }
  const demoQa = async () => ({
    ok: true,
    status: 200,
    body: {
      // A host that read home (`read`): an empty legacy baseline is a home that never opened (`baselineTrust`).
      baseline: { cssRules: {}, pictures: {}, texts: [], read: ['/'], unread: [] },
      checks: [{ id: 'pages-load', pass: true, measured: '1/1' }],
      pages: ['/']
    }
  })
  const prompt = async (_site, _email, session, id, text) => {
    messages.set(id, { session, text })
    if (lostPromptReceipt) {
      lostPromptReceipt = false
      throw new Error('process ended before prompt receipt')
    }
    return true
  }
  const deps = {
    pool,
    config: { origin: 'http://localhost', siteDomain: 'localhost', sessionSecret: 's'.repeat(32) },
    request,
    loadDomain: async () => domain,
    // These cases exercise builds made before the finite quickstart workflow existed.
    revisionForAction: (pool, args) => revisionForAction(pool, { ...args, historical }),
    runtime: async () => ({ settings: DEFAULT_WO_OPS_SETTINGS }),
    switchOn: async () => true,
    objects: { get: async () => null },
    now: () => at,
    prepareDemoContact: async () => ({ ok: true }),
    checkDemoGrant: async () => true,
    sessionAhead: async (_site, _email, id) => {
      allocations.push(id)
      sessions.add(id)
      return id
    },
    ...(agentWorkflow
      ? {
          readNativeInventory: async () => ({
            version: 'agent-demo-native/1',
            complete: true,
            hash: 'fixture',
            counts: { pages: 1 },
            coverage: [],
            records: [
              {
                key: 'pages/home',
                identity: { collection: 'pages', id: 'home', slug: 'home', locale: 'en' },
                publication: { status: 'published' },
                routes: ['/'],
                relations: {},
                data: { body: '', hero: { image: 'photo.jpg' } },
                editorialFields: ['body', 'hero']
              }
            ]
          }),
          compareNativeInventory: compareAgentInventory
        }
      : {}),
    demoQa,
    prompt,
    log: { warn() {}, error() {} }
  }
  if (chatMode) deps.clientDemo = createClientDemoService(deps)
  const runner = () => createDemoRunner(deps)
  const advance = async () => {
    at += 11000
    await pool.query('update wo_demo_action set next_at=$1', [new Date(at - 1)])
  }
  const accept = () =>
    acceptDemoActions(pool, {
      accountId: account,
      entries: [
        {
          opportunityId: opportunity,
          requestId: 'press-once',
          ...(automatic ? {} : { automatic: false }),
          ...(agentWorkflow
            ? {
                workflow: 'agent-demo/1',
                ...(chatMode ? { chatMode } : {}),
                selection: { cms: 'emdash', design: 'tracy-base', quickstart: 'tracy-base/emdash-0.x' }
              }
            : {})
        }
      ],
      ...(agentWorkflow
        ? {
            requireSelection: true,
            templates: {
              cards: [
                {
                  id: 'tracy-base',
                  platforms: [{ platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '1.2.0' }]
                }
              ]
            }
          }
        : {}),
      now: () => at
    })
  return {
    pool,
    account,
    opportunity,
    deps,
    runner,
    advance,
    accept,
    messages,
    sessions,
    allocations,
    provisionCalls,
    creates: () => creates
  }
}

test(
  'acceptance is durable before any effect; two replicas build/fill/handoff once and only QA PASS reaches Outreach',
  opts,
  async () => {
    const w = await world()
    const accepted = await w.accept()
    assert.equal(accepted.status, 202)
    assert.equal((await w.pool.query('select id from wo_revision')).rowCount, 0)
    assert.equal(w.creates(), 0)
    await Promise.all([w.runner().drain(), w.runner().drain()])
    assert.equal(w.creates(), 1)
    assert.equal(w.sessions.size, 1)
    assert.equal(w.messages.size, 1)
    let row = (await listOpportunities(w.pool, w.account, { demoJourney: demoJourneySql })).rows[0]
    assert.equal(row.stage, 'demo', 'a provisioned URL alone is not Outreach')
    const build = (await w.pool.query('select * from wo_build')).rows[0]
    const [rpcId] = w.messages.keys()
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at)
     values ('demo-turn-1','pho-ba.localhost',$1,1,'builder@test.example','Build demo','closed',$2,$3,$3)`,
      [build.qa.sessionId, rpcId, new Date(w.deps.now())]
    )
    const judged = await claimAndRunQa(w.pool, w.deps)
    assert.equal(judged.ran, 1)
    assert.equal(judged.results[0].state, 'passed')
    await w.advance()
    await w.runner().drain()
    row = (await listOpportunities(w.pool, w.account, { demoJourney: demoJourneySql })).rows[0]
    assert.equal(row.stage, 'outreach')
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'completed')
    assert.equal((await readDemoUsage(w.pool, w.account, 20)).used, 1)
  }
)

test(
  'a receipted provision failure stops its action; a new Retry alone asks the same build again',
  opts,
  async () => {
    const w = await world({ provisionState: 'failed' })
    const first = await w.accept()
    await w.runner().drain()
    await w.advance()
    await w.runner().drain()
    assert.equal(w.provisionCalls.length, 1)
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'failed')
    const firstBuild = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(firstBuild.receipt.demoActionId, first.body.actions[0].id)
    await acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [
        { opportunityId: w.opportunity, requestId: 'retry-provision', retryOf: first.body.actions[0].id }
      ],
      now: w.deps.now
    })
    await w.runner().drain()
    const retried = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(w.provisionCalls.length, 2)
    assert.equal(new Set(w.provisionCalls.map((call) => call.buildId)).size, 1)
    assert.equal(w.creates(), 1)
    assert.equal(retried.id, firstBuild.id)
    assert.notEqual(retried.receipt.demoActionId, firstBuild.receipt.demoActionId)
    assert.equal(w.messages.size, 0)
    assert.equal((await readDemoUsage(w.pool, w.account, 20, w.deps.now())).used, 2)
  }
)

test(
  'a crash before the failed provision receipt replays the same build without another charge',
  opts,
  async () => {
    const w = await world({ provisionState: 'failed' })
    let loseReceipt = true
    w.deps.pool = {
      query: (...args) => w.pool.query(...args),
      async connect() {
        const client = await w.pool.connect()
        return {
          query(sql, ...args) {
            if (loseReceipt && sql.includes('receipt = $3::jsonb')) {
              loseReceipt = false
              throw new Error('process ended before the provision receipt')
            }
            return client.query(sql, ...args)
          },
          release: () => client.release()
        }
      }
    }
    const accepted = await w.accept()
    await w.runner().drain()
    assert.equal(w.provisionCalls.length, 1)
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'queued')
    await w.advance()
    await w.runner().drain()
    await w.advance()
    await w.runner().drain()
    assert.equal(w.provisionCalls.length, 2, 'a lost receipt may replay the provision attempt')
    assert.equal(new Set(w.provisionCalls.map((call) => call.buildId)).size, 1)
    assert.equal(w.creates(), 1)
    const action = (await w.pool.query('select status,attempts from wo_demo_action')).rows[0]
    assert.equal(action.status, 'failed')
    assert.equal(action.attempts, 2)
    assert.equal(
      (await w.pool.query('select receipt from wo_build')).rows[0].receipt.demoActionId,
      accepted.body.actions[0].id
    )
    assert.equal((await readDemoUsage(w.pool, w.account, 20, w.deps.now())).used, 1)
  }
)

test(
  'restart after site creation but before its receipt reconciles one site and one revision without another charge',
  opts,
  async () => {
    const w = await world({ lostCreateReceipt: true })
    await w.accept()
    await w.runner().drain()
    await w.advance()
    await w.runner().drain()
    assert.equal(w.creates(), 1)
    assert.equal((await w.pool.query('select id from wo_revision')).rowCount, 1)
    assert.equal((await w.pool.query('select id from wo_build')).rowCount, 1)
    assert.equal(w.messages.size, 1)
    assert.equal((await readDemoUsage(w.pool, w.account, 20)).used, 1)
  }
)

test(
  'restart after a chat accepted the prompt but before its receipt repeats the same session and prompt id',
  opts,
  async () => {
    const w = await world({ lostPromptReceipt: true })
    await w.accept()
    await w.runner().drain()
    assert.equal(w.messages.size, 1)
    assert.equal(
      (await w.pool.query('select error from wo_demo_action')).rows[0].error,
      'HANDOFF_PROMPT_FAILED'
    )
    const initial = [...w.messages.keys()]
    await w.advance()
    await w.runner().drain()
    assert.equal(w.sessions.size, 1)
    assert.equal(w.allocations.length, 2, 'a persisted chat is reconciled after restart')
    assert.equal(new Set(w.allocations).size, 1)
    assert.deepEqual([...w.messages.keys()], initial)
    const build = (await w.pool.query('select handoff from wo_build')).rows[0]
    assert.equal(build.handoff.promptSent.requestId, initial[0])
    assert.equal((await w.pool.query('select error from wo_demo_action')).rows[0].error, null)
    assert.equal(w.creates(), 1)
  }
)

test('a failed fill never starts the agent; Retry resumes that fill on the same site', opts, async () => {
  const w = await world({ fillState: 'failed' })
  const first = await w.accept()
  await w.runner().drain()
  assert.equal(w.messages.size, 0)
  const failed = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
  assert.deepEqual(failed, { status: 'failed', error: 'SITE_FILL_FAILED' })
  w.deps.resumeFill = async () => {
    await w.pool.query("update site_brief set state='applied' where site_key='pho-ba.localhost'")
    return true
  }
  await w.advance()
  await acceptDemoActions(w.pool, {
    accountId: w.account,
    entries: [{ opportunityId: w.opportunity, requestId: 'press-retry', retryOf: first.body.actions[0].id }],
    now: w.deps.now
  })
  await w.runner().drain()
  await w.advance()
  await w.runner().drain()
  assert.equal(w.creates(), 1)
  assert.equal(w.messages.size, 1)
  assert.equal((await readDemoUsage(w.pool, w.account, 20, w.deps.now())).used, 2)
})

test('a Retry whose fill fails again stops instead of resuming its own failure', opts, async () => {
  const w = await world({ fillState: 'failed' })
  const first = await w.accept()
  await w.runner().drain()
  let resumes = 0
  w.deps.resumeFill = async (_build, _email, actionId) => {
    resumes++
    await w.pool.query(
      `update site_brief set timings=jsonb_build_object('woRetryActionId',$1::text), updated_at=now()
       where site_key='pho-ba.localhost'`,
      [actionId]
    )
    return true
  }
  await acceptDemoActions(w.pool, {
    accountId: w.account,
    entries: [
      { opportunityId: w.opportunity, requestId: 'retry-fill-once', retryOf: first.body.actions[0].id }
    ],
    now: w.deps.now
  })
  await w.runner().drain()
  await w.advance()
  await w.runner().drain()
  assert.equal(resumes, 1)
  const retried = (
    await w.pool.query('select status,error from wo_demo_action where retry_of=$1', [
      first.body.actions[0].id
    ])
  ).rows[0]
  assert.deepEqual(retried, { status: 'failed', error: 'SITE_FILL_FAILED' })
  assert.equal(w.creates(), 1)
  assert.equal(w.messages.size, 0)
  assert.equal((await readDemoUsage(w.pool, w.account, 20, w.deps.now())).used, 2)
})

test(
  'a later Retry cannot resume writes or mint an agent seat after the creator loses site access',
  opts,
  async () => {
    const w = await world({ fillState: 'failed' })
    const accepted = await w.accept()
    await w.runner().drain()
    const retried = await acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [
        {
          opportunityId: w.opportunity,
          requestId: 'retry-revoked-seat',
          retryOf: accepted.body.actions[0].id
        }
      ],
      now: () => Date.now() + 1000
    })
    const original = w.deps.request
    w.deps.request = (path, init) =>
      path.includes('/jobs/')
        ? Promise.resolve(Response.json({ code: 'FORBIDDEN' }, { status: 403 }))
        : original(path, init)
    await w.runner().drain()
    const row = (await w.pool.query('select * from wo_demo_action where id=$1', [retried.body.actions[0].id]))
      .rows[0]
    assert.equal(row.status, 'failed')
    assert.equal(row.error, 'SITE_ACCESS_DENIED')
    assert.equal(w.messages.size, 0)
    assert.equal(w.sessions.size, 0)
    assert.equal(w.creates(), 1)
  }
)

/** An in-memory queue/build book: these worker lifecycle tests never open a database or site. */
function qaRetryWorld({
  owned = false,
  losePromptReceipt = false,
  authorized = true,
  conflict = null,
  retryMode = undefined
} = {}) {
  let at = Date.parse('2030-04-01T12:00:00Z')
  const action = {
    id: 'eb6c85d2-4af6-48db-b17a-757151bd5642',
    account_id: '1588e817-ea8d-4577-97fb-a15ab84cf65e',
    opportunity_id: 'ca793fb2-e504-4ba5-9641-1ec96f8bce1a',
    revision_id: 'e4fa8733-553a-4f50-b9fd-5dbf528f2301',
    retry_of: '8c5f48c6-5d36-4615-b47f-f669020ff092',
    build_request_id: 'same-build',
    automatic: true,
    accepted_at: new Date(at),
    status: 'queued',
    step: 'check',
    lease_token: 0,
    lease_until: null,
    next_at: null,
    attempts: 0
  }
  const baseline = { cssRules: { '.hero': 3 }, pictures: { hero: '/original.jpg' }, texts: ['Original'] }
  const rounds = [1, 2, 3].map((n) => ({ n, failed: [{ id: 'content-written', expected: 'real copy' }] }))
  const build = {
    id: '4f22f777-3f75-483e-a51f-1ab6a96d5b31',
    state: 'done',
    site_key: 'qa-fixture.localhost',
    site_job_id: 'job-fixture',
    qa_lease_token: '9',
    handoff: { state: 'needs-review', promptSent: { requestId: 'initial-prompt' } },
    qa: {
      state: 'failed',
      ...(retryMode ? { retryMode } : {}),
      baseline,
      rounds,
      repairs: 2,
      sessionId: 'same-chat',
      by: 'fixture@test.example',
      ...(owned ? { retryActionId: action.id, retryPromptSent: true } : {})
    }
  }
  if (authorized)
    build.qa.acceptedRetry = {
      schemaVersion: 'tracy-wo-qa-retry/v1',
      acceptedActionId: action.id,
      buildId: build.id,
      failedQaGeneration: '9',
      failedQaHash: failedQaHash(build.qa)
    }
  const prompts = []
  let qaResets = 0
  const result = (rows = []) => ({ rows: structuredClone(rows), rowCount: rows.length })
  const query = async (sql, args = []) => {
    const q = sql.replace(/\s+/g, ' ').trim()
    if (['begin', 'commit', 'rollback'].includes(q) || q.startsWith('select pg_advisory_xact_lock'))
      return result()
    if (q.startsWith('select count(*) filter'))
      return result([{ busy: action.lease_until >= args[0] ? 1 : 0, hour: 0 }])
    if (q.startsWith('update wo_demo_action set lease_until = $1, attempts')) {
      if (
        action.status !== 'queued' ||
        action.attempts >= args[2] ||
        (action.next_at && action.next_at > args[1]) ||
        (action.lease_until && action.lease_until >= args[1])
      )
        return result()
      action.lease_until = args[0]
      action.attempts++
      action.lease_token++
      return result([action])
    }
    if (q.startsWith('update wo_demo_action set status =') && q.includes("error = 'attempts'"))
      return result()
    if (q.startsWith('select id from wo_demo_action where id = $1 and lease_token'))
      return result(
        action.status === 'queued' && String(action.lease_token) === args[1] && action.lease_until > args[2]
          ? [{ id: action.id }]
          : []
      )
    if (q.startsWith('update wo_demo_action set step = $2')) {
      action.step = args[1]
      return result([action])
    }
    if (q.startsWith('update wo_demo_action set ') && q.includes('where id = $1 and lease_token = $2')) {
      for (const [, name, index] of q.split(' where ')[0].matchAll(/(\w+) = \$(\d+)/g))
        action[name] = args[Number(index) - 1]
      action.lease_until = null
      return result([action])
    }
    if (q.startsWith('select email from account')) return result([{ email: 'fixture@test.example' }])
    if (q.startsWith('select * from wo_revision')) return result([{ id: action.revision_id }])
    // The build row holds what it was built with (`build-choice.js`).
    if (q.startsWith('select choice from wo_build'))
      return result([{ choice: build.choice ?? { cms: 'joomla', template: {} } }])
    if (q.startsWith('select * from wo_build')) return result([build])
    if (q.startsWith('select b.id, sc.state as ending')) return result()
    if (q.startsWith('select handoff from wo_build')) return result([{ handoff: build.handoff }])
    if (q.startsWith('update wo_build set demo_expires_at')) return result()
    if (q.startsWith('select b.* from site_brief b')) return result([{ state: 'applied' }])
    if (q.startsWith('select * from site where site_key')) return result([{ site_key: build.site_key }])
    if (q.startsWith('update wo_build set qa = $2::jsonb, qa_lease_token')) {
      if (conflict === 'generation') build.qa_lease_token = '10'
      if (conflict === 'content') build.qa.rounds.push({ n: 4, failed: [{ id: 'new-finding' }] })
      if (conflict === 'marker') build.qa.acceptedRetry.acceptedActionId = 'another-action'
      if (
        build.qa.state !== 'failed' ||
        String(build.qa_lease_token) !== args[3] ||
        JSON.stringify(build.qa) !== args[4] ||
        JSON.stringify(build.qa.acceptedRetry) !== args[5]
      )
        return result()
      qaResets++
      build.qa = JSON.parse(args[1])
      build.qa_lease_token = String(BigInt(build.qa_lease_token) + 1n)
      build.handoff.state = 'ready'
      return result([{ qa: build.qa, qa_lease_token: build.qa_lease_token }])
    }
    if (q.startsWith('select qa,qa_lease_token from wo_build'))
      return result(
        JSON.stringify(build.qa) === args[1] &&
          String(build.qa_lease_token) === String(args[2]) &&
          ['pending', 'retry'].includes(build.qa.state) &&
          build.qa.retryActionId === args[3]
          ? [{ qa: build.qa, qa_lease_token: build.qa_lease_token }]
          : []
      )
    if (q.startsWith('update wo_build set qa = qa || jsonb_build_object')) {
      if (losePromptReceipt) {
        losePromptReceipt = false
        throw Object.assign(new Error('Prompt receipt lost'), { code: 'RECEIPT_LOST' })
      }
      if (
        JSON.stringify(build.qa) !== args[3] ||
        String(build.qa_lease_token) !== String(args[4]) ||
        !['pending', 'retry'].includes(build.qa.state)
      )
        return result()
      build.qa.retryPromptSent = true
      build.qa.promptedAt = args[1]
      return result([build])
    }
    throw new Error(`Unexpected fixture query: ${q}`)
  }
  const pool = { query, connect: async () => ({ query, release() {} }) }
  const deps = {
    pool,
    now: () => at,
    config: { origin: 'http://localhost', sessionSecret: 's'.repeat(32) },
    request: async (path) => {
      assert.match(path, /\/jobs\/job-fixture\?inspect=1$/)
      return Response.json({ state: 'done' })
    },
    loadDomain: async () => ({}),
    runtime: async () => ({ settings: DEFAULT_WO_OPS_SETTINGS }),
    switchOn: async () => true,
    prompt: async (_site, _by, sessionId, requestId, text) => {
      prompts.push({ sessionId, requestId, text })
      return true
    },
    log: { error() {}, warn() {} }
  }
  return {
    action,
    build,
    pool,
    deps,
    baseline: structuredClone(baseline),
    rounds: structuredClone(rounds),
    prompts,
    qaResets: () => qaResets,
    runner: () => createDemoRunner(deps),
    advance: () => {
      at += 11_000
    }
  }
}

test('the same QA action terminates after its retry fails instead of polling or resetting repairs', async () => {
  const w = qaRetryWorld({ owned: true })
  for (let tick = 0; tick < 4; tick++) {
    await w.runner().drain()
    w.advance()
  }
  assert.equal(w.action.status, 'failed')
  assert.equal(w.action.error, 'QA_NEEDS_REVIEW')
  assert.equal(w.action.attempts, 1)
  assert.equal(w.action.lease_until, null)
  assert.equal(w.prompts.length, 0)
  assert.equal(w.qaResets(), 0)
  assert.equal(w.build.qa.repairs, 2)
  assert.deepEqual(w.build.qa.baseline, w.baseline)
  assert.deepEqual(w.build.qa.rounds, w.rounds)
})

test('an explicit QA retry gets one attempt; its own later failure needs a new accepted action', async () => {
  const w = qaRetryWorld()
  await w.runner().drain()
  assert.equal(w.action.status, 'queued')
  assert.equal(w.qaResets(), 1)
  assert.equal(w.build.qa.state, 'pending')
  assert.equal(w.build.qa.repairs, 0)
  assert.equal(w.build.qa.retryActionId, w.action.id)
  assert.equal(w.build.qa.retryPromptSent, true)
  assert.equal(w.prompts.length, 1)
  assert.equal(w.prompts[0].requestId, `wo-qa-retry:${w.action.id}`)
  assert.equal(w.prompts[0].sessionId, 'same-chat')
  w.advance()
  await w.runner().drain()
  assert.equal(w.prompts.length, 1)
  w.build.qa.state = 'failed'
  w.build.qa.repairs = 2
  w.advance()
  await w.runner().drain()
  assert.equal(w.action.status, 'failed')
  assert.equal(w.action.error, 'QA_NEEDS_REVIEW')
  assert.equal(w.qaResets(), 1)
  assert.equal(w.prompts.length, 1)
  assert.deepEqual(w.build.qa.baseline, w.baseline)
  assert.deepEqual(w.build.qa.rounds, w.rounds)
})

for (const retryMode of [undefined, 'initial-baseline'])
  test(`a lost explicit QA retry prompt receipt recovers after mode ${retryMode ?? 'legacy'} without resetting its finite attempt`, async () => {
    const w = qaRetryWorld({ losePromptReceipt: true, retryMode })
    await w.runner().drain()
    assert.equal(w.action.error, 'RECEIPT_LOST')
    assert.equal(w.build.qa.retryMode, 'repair')
    assert.equal(w.build.qa.retryPromptSent, false)
    const since = w.build.qa.since
    const repairs = w.build.qa.repairs
    w.advance()
    await w.runner().drain()
    assert.equal(w.action.status, 'queued')
    assert.equal(w.action.error, null)
    assert.equal(w.build.qa.retryPromptSent, true)
    assert.equal(w.qaResets(), 1)
    assert.equal(w.build.qa.since, since)
    assert.equal(w.build.qa.repairs, repairs)
    assert.equal(w.prompts.length, 2)
    assert.deepEqual(w.prompts[0], w.prompts[1])
    assert.deepEqual(w.build.qa.baseline, w.baseline)
  })

test('a fill Retry cannot acquire a later QA failure without an accepted QA marker', async () => {
  const w = qaRetryWorld({ authorized: false })
  await w.runner().drain()
  assert.equal(w.action.status, 'failed')
  assert.equal(w.action.error, 'QA_NEEDS_REVIEW')
  assert.equal(w.prompts.length, 0)
  assert.equal(w.qaResets(), 0)
  assert.equal(w.build.qa.repairs, 2)
})

test('historical retry ids without acceptance proof never authorize an undelivered prompt', async () => {
  const w = qaRetryWorld({ authorized: false, owned: true })
  w.build.qa.state = 'pending'
  w.build.qa.retryPromptSent = false
  w.build.qa.lastPrompt = 'Old worker prompt'
  w.build.qa.expectedRequestIds = [`wo-qa-retry:${w.action.id}`]
  await w.runner().drain()
  assert.equal(w.action.status, 'failed')
  assert.equal(w.action.error, 'QA_NEEDS_REVIEW')
  assert.equal(w.prompts.length, 0)
  assert.equal(w.qaResets(), 0)
})

test('QA retry CAS refuses a changed generation, measured content or acceptance marker before sending', async () => {
  for (const conflict of ['generation', 'content', 'marker']) {
    const w = qaRetryWorld({ conflict })
    const captured = structuredClone(w.build)
    assert.equal(await resumeDemoQa(w.pool, w.deps, captured, w.action.id), false)
    assert.equal(w.qaResets(), 0)
    assert.equal(w.prompts.length, 0)
    assert.equal(w.build.qa.state, 'failed')
    assert.equal(w.build.qa.repairs, 2)
  }
})

test('an accepted retry with a lost prompt receipt cannot rebase recovery onto another QA generation', async () => {
  const w = qaRetryWorld({ losePromptReceipt: true })
  await w.runner().drain()
  const since = w.build.qa.since
  w.build.qa_lease_token = '11'
  assert.equal(await resumeDemoQa(w.pool, w.deps, structuredClone(w.build), w.action.id), false)
  assert.equal(w.prompts.length, 1)
  assert.equal(w.qaResets(), 1)
  assert.equal(w.build.qa.since, since)
  assert.equal(w.build.qa.retryPromptSent, false)
})

test('a historical receipted QA prompt can finish without granting another prompt or repair budget', async () => {
  const w = qaRetryWorld({ authorized: false, owned: true })
  w.build.qa.state = 'pending'
  await w.runner().drain()
  assert.equal(w.action.status, 'queued')
  assert.equal(w.action.error, null)
  assert.equal(w.prompts.length, 0)
  assert.equal(w.qaResets(), 0)
  w.build.qa.state = 'failed'
  w.advance()
  await w.runner().drain()
  assert.equal(w.action.status, 'failed')
  assert.equal(w.action.error, 'QA_NEEDS_REVIEW')
  assert.equal(w.prompts.length, 0)
  assert.equal(w.build.qa.repairs, 2)
})

async function postgresAcceptedQaRetry() {
  const w = await world()
  const first = await w.accept()
  await w.runner().drain()
  const build = (await w.pool.query('select * from wo_build')).rows[0]
  const qa = {
    ...build.qa,
    state: 'failed',
    repairs: 2,
    rounds: [{ n: 3, failed: [{ id: 'content-written', expected: 'real copy' }] }]
  }
  await w.pool.query(
    `update wo_build set qa=$2::jsonb,qa_lease_token=20,qa_lease_until=null,
       handoff=jsonb_set(handoff,'{state}','"needs-review"'::jsonb) where id=$1`,
    [build.id, JSON.stringify(qa)]
  )
  await w.pool.query("update wo_demo_action set status='failed',error='QA_NEEDS_REVIEW' where id=$1", [
    first.body.actions[0].id
  ])
  const accepted = await acceptDemoActions(w.pool, {
    accountId: w.account,
    entries: [{ opportunityId: w.opportunity, requestId: 'pg-qa-retry', retryOf: first.body.actions[0].id }],
    now: w.deps.now
  })
  assert.equal(accepted.status, 202)
  const current = (await w.pool.query('select * from wo_build where id=$1', [build.id])).rows[0]
  return { ...w, build: current, actionId: accepted.body.actions[0].id }
}

for (const conflict of ['generation', 'content', 'marker'])
  test(`PostgreSQL QA resume refuses a concurrent ${conflict} change with actual CAS`, opts, async () => {
    const w = await postgresAcceptedQaRetry()
    let raced = false
    const racingPool = {
      async query(sql, args) {
        if (!raced && sql.startsWith('update wo_build set qa = $2::jsonb, qa_lease_token')) {
          raced = true
          if (conflict === 'generation')
            await w.pool.query('update wo_build set qa_lease_token=21 where id=$1', [w.build.id])
          else {
            const changed = structuredClone(w.build.qa)
            if (conflict === 'content') changed.rounds.push({ n: 4, failed: [{ id: 'new-finding' }] })
            else changed.acceptedRetry.acceptedActionId = 'different-action'
            await w.pool.query('update wo_build set qa=$2::jsonb where id=$1', [
              w.build.id,
              JSON.stringify(changed)
            ])
          }
        }
        return w.pool.query(sql, args)
      }
    }
    const promptsBefore = w.messages.size
    assert.equal(await resumeDemoQa(racingPool, w.deps, w.build, w.actionId), false)
    assert.equal(raced, true)
    const held = (await w.pool.query('select qa from wo_build where id=$1', [w.build.id])).rows[0].qa
    assert.equal(held.state, 'failed')
    assert.equal(held.repairs, 2)
    assert.notEqual(held.retryActionId, w.actionId)
    assert.equal(w.messages.size, promptsBefore)
  })

test(
  'PostgreSQL QA prompt receipt recovery uses one CAS generation and the same request and prompt',
  opts,
  async () => {
    const w = await postgresAcceptedQaRetry()
    const calls = []
    const prompt = w.deps.prompt
    w.deps.prompt = (...args) => {
      calls.push(args)
      return prompt(...args)
    }
    let loseReceipt = true
    const losingPool = {
      query(sql, args) {
        if (loseReceipt && sql.includes("jsonb_build_object('retryPromptSent', true")) {
          loseReceipt = false
          throw new Error('Lost prompt receipt')
        }
        return w.pool.query(sql, args)
      }
    }
    await assert.rejects(resumeDemoQa(losingPool, w.deps, w.build, w.actionId), /Lost prompt receipt/)
    const pending = (await w.pool.query('select * from wo_build where id=$1', [w.build.id])).rows[0]
    assert.equal(pending.qa.retryPromptSent, false)
    assert.equal(pending.qa_lease_token, '21')
    assert.equal(pending.qa.repairs, 0)
    assert.equal(await resumeDemoQa(w.pool, w.deps, pending, w.actionId), true)
    const held = (await w.pool.query('select * from wo_build where id=$1', [w.build.id])).rows[0]
    assert.equal(held.qa.retryPromptSent, true)
    assert.equal(held.qa_lease_token, '21')
    assert.equal(held.qa.since, pending.qa.since)
    assert.equal(held.qa.repairs, pending.qa.repairs)
    assert.deepEqual(held.qa.baseline, w.build.qa.baseline)
    assert.deepEqual(held.qa.rounds, w.build.qa.rounds)
    assert.deepEqual(held.qa.acceptedRetry, w.build.qa.acceptedRetry)
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[0], calls[1])
    assert.equal(calls[0][3], `wo-qa-retry:${w.actionId}`)
  }
)

test('new quickstart builds require finite QA receipts and never hand off to an agent', opts, async () => {
  const w = await world({ historical: false })
  await w.accept()
  await w.runner().drain()
  assert.equal(w.creates(), 1)
  assert.equal(w.sessions.size, 0)
  assert.equal(w.messages.size, 0)
  const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
  assert.equal(action.status, 'failed')
  assert.equal(action.error, 'QUICKSTART_QA_INCOMPLETE')
})

/** The fence the site's fill reads before each write (`assertActive` in `app.js`). */
async function fillFenceOpen(w) {
  const action = (await w.pool.query('select * from wo_demo_action order by accepted_at desc limit 1'))
    .rows[0]
  return quickstartActionOpen(w.pool, {
    accountId: w.account,
    requestId: action.build_request_id,
    revisionId: action.revision_id
  })
}

test(
  'a manual quickstart-first build keeps its action open until the fill applies, then stops without QA or hand-off',
  opts,
  async () => {
    const w = await world({ historical: false, fillState: 'applying', automatic: false })
    await w.accept()
    await w.runner().drain()
    let action = (await w.pool.query('select status,error,step from wo_demo_action')).rows[0]
    assert.deepEqual(action, { status: 'queued', error: null, step: 'fill' })
    assert.equal(await fillFenceOpen(w), true, 'the running fill may still write')
    await w.advance()
    await w.runner().drain()
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'queued')
    await w.pool.query("update site_brief set state='applied'")
    await w.advance()
    await w.runner().drain()
    action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
    assert.deepEqual(action, { status: 'completed', error: null })
    assert.equal(await fillFenceOpen(w), false, 'a finished action never grants write access')
    assert.equal(w.sessions.size, 0)
    assert.equal(w.messages.size, 0)
    assert.equal((await w.pool.query('select qa from wo_build')).rows[0].qa, null)
    assert.equal(w.creates(), 1)
  }
)

test('a manual quickstart-first build whose fill fails ends SITE_FILL_FAILED', opts, async () => {
  const w = await world({ historical: false, fillState: 'applying', automatic: false })
  await w.accept()
  await w.runner().drain()
  await w.pool.query("update site_brief set state='failed', error='QUICKSTART_FILL_FAILED'")
  await w.advance()
  await w.runner().drain()
  const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
  assert.deepEqual(action, { status: 'failed', error: 'SITE_FILL_FAILED' })
  assert.equal(await fillFenceOpen(w), false)
  assert.equal(w.messages.size, 0)
})

test(
  'a manual Retry resumes the failed fill once, waits for it and completes without hand-off',
  opts,
  async () => {
    const w = await world({ historical: false, fillState: 'failed', automatic: false })
    const first = await w.accept()
    await w.runner().drain()
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'failed')
    let resumes = 0
    w.deps.resumeFill = async (_build, _email, actionId) => {
      resumes++
      await w.pool.query(
        `update site_brief set state='applying', timings=jsonb_build_object('woRetryActionId',$1::text)
         where site_key='pho-ba.localhost'`,
        [actionId]
      )
      return true
    }
    await w.advance()
    const retry = await acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [
        { opportunityId: w.opportunity, requestId: 'manual-retry', retryOf: first.body.actions[0].id }
      ],
      now: w.deps.now
    })
    const retryId = retry.body.actions[0].id
    const row = () => w.pool.query('select status,error,automatic from wo_demo_action where id=$1', [retryId])
    assert.equal((await row()).rows[0].automatic, false, 'a Retry inherits the manual mode')
    await w.runner().drain()
    await w.advance()
    await w.runner().drain()
    assert.equal(resumes, 1)
    assert.equal((await row()).rows[0].status, 'queued')
    assert.equal(await fillFenceOpen(w), true)
    await w.pool.query("update site_brief set state='applied'")
    await w.advance()
    await w.runner().drain()
    assert.deepEqual((await row()).rows[0], { status: 'completed', error: null, automatic: false })
    assert.equal(w.creates(), 1)
    assert.equal(w.sessions.size, 0)
    assert.equal(w.messages.size, 0)
  }
)

test('a manual Retry that lost site access stops before resuming the fill', opts, async () => {
  const w = await world({ historical: false, fillState: 'failed', automatic: false })
  const first = await w.accept()
  await w.runner().drain()
  let resumes = 0
  w.deps.resumeFill = async () => {
    resumes++
    return true
  }
  const original = w.deps.request
  w.deps.request = (path, init) =>
    path.includes('/jobs/') && path.includes('inspect=1')
      ? Promise.resolve(Response.json({ code: 'FORBIDDEN' }, { status: 403 }))
      : original(path, init)
  const retry = await acceptDemoActions(w.pool, {
    accountId: w.account,
    entries: [
      { opportunityId: w.opportunity, requestId: 'manual-retry-revoked', retryOf: first.body.actions[0].id }
    ],
    now: () => w.deps.now() + 1000
  })
  await w.runner().drain()
  const row = (
    await w.pool.query('select status,error from wo_demo_action where id=$1', [retry.body.actions[0].id])
  ).rows[0]
  assert.deepEqual(row, { status: 'failed', error: 'SITE_ACCESS_DENIED' })
  assert.equal(resumes, 0)
  assert.equal(await fillFenceOpen(w), false)
})

test('a manual quickstart-first build whose site is deleted while its fill runs stops', opts, async () => {
  const w = await world({ historical: false, fillState: 'applying', automatic: false })
  await w.accept()
  await w.runner().drain()
  assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'queued')
  await w.pool.query("delete from site where site_key='pho-ba.localhost'")
  // The job door's own answer for a site that no longer exists (`inspectOwnJob`).
  const original = w.deps.request
  w.deps.request = (path, init) =>
    path.includes('inspect=1')
      ? Promise.resolve(Response.json({ code: 'SITE_UNKNOWN' }, { status: 404 }))
      : original(path, init)
  await w.advance()
  await w.runner().drain()
  const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
  assert.deepEqual(action, { status: 'failed', error: 'SITE_ACCESS_DENIED' })
  assert.equal(await fillFenceOpen(w), false)
})

test(
  'a manual quickstart-first build whose create door started no fill completes at once',
  opts,
  async () => {
    const w = await world({ historical: false, automatic: false })
    const original = w.deps.request
    // The create door answered without a brief, so it started no fill (`briefOfPress` gave none).
    w.deps.request = async (path, init) => {
      const res = await original(path, init)
      if (path === '/api/sites') await w.pool.query('delete from site_brief')
      return res
    }
    await w.accept()
    await w.runner().drain()
    const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
    assert.deepEqual(action, { status: 'completed', error: null })
    assert.equal(await fillFenceOpen(w), false)
    assert.equal(w.messages.size, 0)
  }
)

/** A deleted site's failed brief left under the address the next build reuses. */
const staleBrief = (w) =>
  w.pool.query(
    `insert into site_brief(site_key,account_id,platform,brief,state,error,created_at,updated_at)
     values ('pho-ba.localhost',$1,'emdash','{}','failed','QUICKSTART_PICTURE_COVERAGE_INCOMPLETE',
       now()-interval '4 hours', now()-interval '4 hours')`,
    [w.account]
  )

/** The create door answers without starting a fill, so no brief of the new site's own exists. */
function startsNoFill(w) {
  const original = w.deps.request
  w.deps.request = async (path, init) => {
    if (path !== '/api/sites') return original(path, init)
    const kept = await w.pool.query('select site_key from site_brief')
    const res = await original(path, init)
    if (!kept.rowCount) await w.pool.query('delete from site_brief')
    else await w.pool.query("update site_brief set state='failed', created_at=now()-interval '4 hours'")
    return res
  }
}

for (const automatic of [false, true])
  test(
    `${automatic ? 'an automatic' : 'a manual'} build at a reused address never inherits the deleted site's failed brief`,
    opts,
    async () => {
      const w = await world({ historical: false, automatic })
      await staleBrief(w)
      startsNoFill(w)
      await w.accept()
      await w.runner().drain()
      const action = (await w.pool.query('select status,error,step from wo_demo_action')).rows[0]
      assert.notEqual(action.error, 'SITE_FILL_FAILED')
      // A manual action has no fill to hold open; an automatic one keeps waiting for its own fill.
      assert.deepEqual(
        action,
        automatic
          ? { status: 'queued', error: null, step: 'fill' }
          : { status: 'completed', error: null, step: 'fill' }
      )
      assert.equal(w.messages.size, 0)
    }
  )

test('a build at a reused address follows the brief its own create door started', opts, async () => {
  const w = await world({ historical: false, fillState: 'applying', automatic: false })
  await staleBrief(w)
  await w.accept()
  await w.runner().drain()
  assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'queued')
  await w.pool.query("update site_brief set state='applied'")
  await w.advance()
  await w.runner().drain()
  const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
  assert.deepEqual(action, { status: 'completed', error: null })
})

test(
  'an automatic legacy build at a reused address follows its own applied brief to hand-off',
  opts,
  async () => {
    const w = await world()
    await staleBrief(w)
    await w.accept()
    await w.runner().drain()
    assert.equal(w.messages.size, 1)
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'queued')
  }
)

test('a manual legacy build still completes as soon as its site is built', opts, async () => {
  const w = await world({ fillState: 'applying', automatic: false })
  await w.accept()
  await w.runner().drain()
  const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
  assert.deepEqual(action, { status: 'completed', error: null })
  assert.equal(w.messages.size, 0)
})

/** The photos report of a fill whose one gap holds a verified placeholder. */
function placeholderPhotos() {
  return {
    variantPolicy: 'quickstart-source-variants/1',
    placeholderPolicy: 'quickstart-picture-placeholders/1',
    requiresReview: true,
    placeholders: 1,
    gaps: [{ groupId: 'gap-1' }],
    receipts: [
      { key: 'photo', kind: 'photo' },
      { key: 'gap-1', kind: 'placeholder' }
    ]
  }
}
const reviewModes = {
  strict: { photos: null, qa: null, status: 'completed' },
  'source variants': {
    photos: { variantPolicy: 'quickstart-source-variants/1', requiresReview: true },
    qa: 'quickstart-source-variants/1',
    status: 'completed'
  },
  placeholders: {
    photos: placeholderPhotos(),
    qa: 'quickstart-picture-placeholders/1',
    status: 'completed'
  },
  'placeholder reason without placeholders': {
    photos: { variantPolicy: 'quickstart-source-variants/1', requiresReview: true, placeholders: 0 },
    qa: 'quickstart-picture-placeholders/1',
    status: 'failed'
  },
  'passed QA over a placeholder fill': { photos: placeholderPhotos(), qa: null, status: 'failed' },
  'source variants reason over a placeholder fill': {
    photos: placeholderPhotos(),
    qa: 'quickstart-source-variants/1',
    status: 'failed'
  },
  'placeholder count without a placeholder receipt': {
    photos: { ...placeholderPhotos(), receipts: [{ key: 'photo', kind: 'photo' }] },
    qa: 'quickstart-picture-placeholders/1',
    status: 'failed'
  },
  'a gap without its placeholder receipt': {
    photos: { ...placeholderPhotos(), gaps: [{ groupId: 'gap-1' }, { groupId: 'gap-2' }] },
    qa: 'quickstart-picture-placeholders/1',
    status: 'failed'
  }
}
for (const [mode, expected] of Object.entries(reviewModes))
  test(
    `finite quickstart ${mode} receipts ${expected.status === 'completed' ? 'finish as needs-review without a chat session or Outreach' : 'fail closed'}`,
    opts,
    async () => {
      const w = await world({ historical: false, fillState: 'applying' })
      await w.accept()
      await w.runner().drain()
      const workflow = 'quickstart-first/1'
      const name = (await w.pool.query('select brief from wo_revision')).rows[0].brief.business.name
      await w.pool.query("update site_brief set state='applied'")
      await w.pool.query('update wo_build set content=$1', [
        {
          writes: {
            'quickstart:fill': {
              workflow,
              state: 'filled',
              ...(expected.photos ? { photos: expected.photos } : {})
            },
            'quickstart:qa': {
              workflow,
              state: expected.qa ? 'needs-review' : 'passed',
              ...(expected.qa ? { reviewReason: expected.qa } : {}),
              humanAccepted: false,
              machineChecks: {
                version: 1,
                identity: { state: 'verified', actual: name },
                structure: true,
                coverage: true,
                pictures: true,
                links: true,
                demoResidue: true
              }
            }
          }
        }
      ])
      await w.advance()
      await w.runner().drain()
      const action = (await w.pool.query('select status,error from wo_demo_action')).rows[0]
      assert.equal(action.status, expected.status)
      assert.equal(w.sessions.size, 0)
      assert.equal(w.messages.size, 0)
      if (expected.status === 'failed') {
        assert.equal(action.error, 'QUICKSTART_QA_INCOMPLETE')
        return
      }
      assert.equal((await w.pool.query('select qa from wo_build')).rows[0].qa.state, 'needs-review')
      assert.equal(
        (await listOpportunities(w.pool, w.account, { demoJourney: demoJourneySql })).rows[0].stage,
        'demo'
      )
    }
  )

test(
  'the asynchronous demo worker provisions the explicit choice even with a different CMS default',
  opts,
  async () => {
    const w = await world()
    const release = { version: '1.2.0', files: { source: { file: 'source.zip', sha256: 'a'.repeat(64) } } }
    const cards = [
      {
        id: 'tracy-base',
        platforms: [{ platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '1.2.0', release }]
      }
    ]
    const originalRequest = w.deps.request
    w.deps.request = (path, init) =>
      path === '/api/templates'
        ? Promise.resolve(Response.json({ templates: cards }))
        : originalRequest(path, init)
    w.deps.runtime = async () => ({ settings: { ...DEFAULT_WO_OPS_SETTINGS, defaultCms: 'wordpress' } })
    const accepted = await acceptDemoActions(w.pool, {
      accountId: w.account,
      requireSelection: true,
      templates: { cards },
      entries: [
        {
          opportunityId: w.opportunity,
          requestId: 'explicit-worker-choice',
          selection: { cms: 'emdash', design: 'tracy-base', quickstart: 'tracy-base/emdash-0.x' }
        }
      ]
    })
    assert.equal(accepted.status, 202)
    await w.runner().drain()
    assert.equal(w.provisionCalls.length, 1)
    assert.equal(w.provisionCalls[0].platform, 'emdash')
    assert.equal(w.provisionCalls[0].quickstart, 'tracy-base/emdash-0.x')
    assert.deepEqual(w.provisionCalls[0].expectedQuickstartRelease, release)
  }
)

test(
  'agent demo provisions intact quickstart without old brief fill and replays one frozen site/chat/prompt',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true })
    const accepted = await w.accept()
    assert.equal(accepted.status, 202)
    await w.runner().drain()
    assert.equal(
      w.provisionCalls.length,
      1,
      JSON.stringify((await w.pool.query('select status,error,step from wo_demo_action')).rows)
    )
    assert.equal(w.provisionCalls[0].workflow, 'agent-demo/1')
    assert.equal(Object.hasOwn(w.provisionCalls[0], 'brief'), false)
    assert.equal((await w.pool.query('select * from site_brief')).rows.length, 0)
    assert.equal(w.sessions.size, 1)
    assert.equal(w.messages.size, 1)
    const revision = (await w.pool.query('select * from wo_revision')).rows[0]
    // The workflow is the build's; the brief holds only the frozen research.
    assert.equal(
      (await w.pool.query('select choice from wo_build')).rows[0].choice.quickstartWorkflow,
      'agent-demo/1'
    )
    assert.equal('quickstartWorkflow' in revision.brief, false)
    // A new revision's brief references its frozen research (#1791) rather than embedding a copy.
    assert.equal(revision.brief.agentDemoResearch.revisionId, revision.id)
    assert.equal('agentDemoSnapshot' in revision.brief, false)
    const snapshotHash = revision.brief.agentDemoResearch.hash
    await w.advance()
    await w.runner().drain()
    assert.equal(w.creates(), 1)
    assert.equal(w.sessions.size, 1)
    assert.equal(w.messages.size, 1)
    assert.equal(
      (await w.pool.query('select brief from wo_revision')).rows[0].brief.agentDemoResearch.hash,
      snapshotHash
    )
    let build = (await w.pool.query('select * from wo_build')).rows[0]
    const capability = agentDemoCapabilities({ pool: w.pool, objects: null, now: w.deps.now })
    const auth = { siteKey: build.site_key, accountId: w.account, sessionId: build.handoff.sessionId }
    await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: snapshotHash,
        structureHash: build.content.agentDemo.structureHash,
        structure: build.content.agentDemo.structure,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read live page'
          }
        ]
      }
    })
    const [rpcId] = w.messages.keys()
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at)
    values('agent-demo-turn', 'pho-ba.localhost',$1,1,'builder@test.example','Build demo','closed',$2,$3,$3)`,
      [build.handoff.sessionId, rpcId, new Date(w.deps.now())]
    )
    await claimAndRunQa(w.pool, w.deps)
    build = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(build.qa.state, 'needs-review', JSON.stringify(build.qa))
    assert.equal(build.qa.machinePassed, true)
    assert.equal(build.qa.humanAccepted, false)
    await w.advance()
    await w.runner().drain()
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'completed')
  }
)

test(
  'Stop in the ordinary agent handoff blocks QA wakes and Retry keeps the same snapshot, site and chat',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true })
    const accepted = await w.accept()
    await w.runner().drain()
    const before = (await w.pool.query('select * from wo_build')).rows[0]
    const [rpcId] = w.messages.keys()
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at,end_reason)
    values('stopped-demo-turn','pho-ba.localhost',$1,1,'builder@test.example','Build demo','closed',$2,$3,$3,'aborted')`,
      [before.handoff.sessionId, rpcId, new Date(w.deps.now())]
    )
    await w.advance()
    await claimAndRunQa(w.pool, w.deps)
    assert.equal(w.messages.size, 1)
    await w.runner().drain()
    let action = (await w.pool.query('select * from wo_demo_action')).rows[0]
    assert.equal(action.status, 'failed')
    assert.equal(action.error, 'AGENT_DEMO_TURN_STOPPED')
    await wakeStuckRepairs(w.pool, w.deps)
    assert.equal(w.messages.size, 1)
    const retry = await acceptDemoActions(w.pool, {
      accountId: w.account,
      now: w.deps.now,
      entries: [
        {
          opportunityId: w.opportunity,
          requestId: 'retry-stopped-agent',
          retryOf: accepted.body.actions[0].id
        }
      ]
    })
    assert.equal(retry.status, 202)
    await w.runner().drain()
    const after = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(after.id, before.id)
    assert.deepEqual(after.qa.baseline, before.qa.baseline)
    assert.equal(after.handoff.sessionId, before.handoff.sessionId)
    assert.equal(after.handoff.researchHash, before.handoff.researchHash)
    assert.equal(w.creates(), 1)
    assert.equal(w.sessions.size, 1)
    assert.equal(w.messages.size, 2)
  }
)

test(
  'agent media import persists real PostgreSQL claim/receipt and never reuploads a confirmed or revoked asset',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true })
    const bytes = Buffer.from('real SQL import claim test bytes')
    const sha = createHash('sha256').update(bytes).digest('hex')
    const media = (
      await w.pool.query(
        `insert into wo_media(account_id,opportunity_id,sha256,object_key,status,mime,bytes,width,height,kind,source,source_url)
    values($1,$2,$3,'private/test-import','stored','image/jpeg',$4,800,600,'image','facebook','https://example.test/photo') returning id`,
        [w.account, w.opportunity, sha, bytes.length]
      )
    ).rows[0]
    await w.accept()
    await w.runner().drain()
    const build = (await w.pool.query('select * from wo_build')).rows[0]
    const revision = (await w.pool.query('select * from wo_revision')).rows[0]
    const service = agentDemoCapabilities({
      pool: w.pool,
      objects: { get: async () => new Response(bytes) },
      now: w.deps.now
    })
    const auth = { accountId: w.account, siteKey: build.site_key, sessionId: build.handoff.sessionId }
    await service.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: revision.brief.agentDemoResearch.hash,
        structure: build.content.agentDemo.structure,
        structureHash: build.content.agentDemo.structureHash,
        rows: [
          {
            page: '/',
            section: 'hero',
            goal: 'Use source photo',
            sourceIds: [],
            assetIds: [media.id],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'hero.image' },
            operation: 'replace-image',
            verify: 'Read image back'
          }
        ]
      }
    })
    let uploads = 0
    const upload = async () => {
      uploads++
      return { status: 200, body: { ok: true, url: 'https://site.test/media/photo.jpg' } }
    }
    const result = await service.call(auth, { operation: 'media.import', assetId: media.id }, { upload })
    assert.equal(result.state, 'written')
    await service.call(auth, { operation: 'media.import', assetId: media.id }, { upload })
    assert.equal(uploads, 1)
    const saved = (await w.pool.query('select content,handoff from wo_build')).rows[0]
    assert.equal(saved.content.agentDemo.imports[media.id].state, 'written')
    assert.equal(saved.content.agentDemo.imports[media.id].sha256, sha)
    assert.equal(saved.handoff.placed[media.id], 'https://site.test/media/photo.jpg')
    await w.pool.query("update wo_media set status='reference' where id=$1", [media.id])
    await assert.rejects(
      service.call(auth, { operation: 'media.import', assetId: media.id }, { upload }),
      /ASSET_REVOKED/
    )
    assert.equal(uploads, 1)
  }
)

test(
  'accepted pre-baseline Retry resumes the original frozen prompt once, without provisioning or changing chat',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true })
    const goodQa = w.deps.demoQa
    w.deps.demoQa = async () => ({
      ok: true,
      body: { baseline: { cssRules: {}, pictures: {}, texts: [] }, checks: [] }
    })
    const first = await w.accept()
    await w.runner().drain()
    const original = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(w.messages.size, 0)
    assert.equal(original.handoff.promptSent ?? null, null)
    for (let i = 0; i < 3; i++) {
      await w.pool.query('update wo_build set qa=qa||\'{"retryAt":null}\'::jsonb')
      await takeDueBaselines(w.pool, w.deps)
    }
    await w.advance()
    await w.runner().drain()
    assert.equal((await w.pool.query('select * from wo_demo_action')).rows[0].status, 'failed')
    const retry = await acceptDemoActions(w.pool, {
      accountId: w.account,
      now: w.deps.now,
      entries: [
        {
          opportunityId: w.opportunity,
          requestId: 'retry-unread-baseline',
          retryOf: first.body.actions[0].id
        }
      ]
    })
    assert.equal(retry.status, 202)
    const accepted = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(accepted.qa.state, 'failed')
    for (const mutate of [
      (b) => {
        b.qa.acceptedRetry.acceptedActionId = 'wrong'
      },
      (b) => {
        b.qa_lease_token = String(BigInt(b.qa_lease_token) + 1n)
      },
      (b) => {
        b.qa.baselineError = 'changed'
      },
      (b) => {
        b.handoff.promptSent = { sessionId: b.qa.sessionId }
      },
      (b) => {
        b.qa.endReason = 'aborted'
      }
    ]) {
      const wrong = structuredClone(accepted)
      mutate(wrong)
      assert.equal(await resumeDemoQa(w.pool, w.deps, wrong, retry.body.actions[0].id), false)
    }
    await w.pool.query("update wo_demo_action set status='failed' where id=$1", [retry.body.actions[0].id])
    assert.equal(await resumeDemoQa(w.pool, w.deps, accepted, retry.body.actions[0].id), false)
    await w.pool.query("update wo_demo_action set status='queued' where id=$1", [retry.body.actions[0].id])
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at,end_reason)
      values('prebaseline-stopped', $1,$2,1,'builder@test.example','Stopped','closed','unrelated-rpc',now(),now(),'aborted')`,
      [accepted.site_key, accepted.qa.sessionId]
    )
    assert.equal(await resumeDemoQa(w.pool, w.deps, accepted, retry.body.actions[0].id), false)
    await w.pool.query("delete from site_turn where turn_id='prebaseline-stopped'")
    w.deps.demoQa = goodQa
    await w.runner().drain()
    let current = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(current.qa.state, 'baseline')
    assert.equal(current.qa.retryMode, 'initial-baseline')
    assert.equal(current.handoff.prompt, original.handoff.prompt)
    await w.advance()
    await w.runner().drain()
    assert.equal(
      (await w.pool.query('select status from wo_demo_action where id=$1', [retry.body.actions[0].id]))
        .rows[0].status,
      'queued'
    )
    await takeDueBaselines(w.pool, w.deps)
    await takeDueBaselines(w.pool, w.deps)
    await w.advance()
    await w.runner().drain()
    current = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(w.creates(), 1)
    assert.equal(w.sessions.size, 1)
    assert.equal(current.qa.sessionId, original.qa.sessionId)
    assert.equal(current.handoff.researchHash, original.handoff.researchHash)
    assert.equal(w.messages.size, 1)
    assert.equal([...w.messages.values()][0].text, original.handoff.prompt)
    assert.equal([...w.messages.keys()][0], `wo-handoff:${original.id}:${original.qa.sessionId}`)
    assert.equal(current.qa.state, 'pending')
  }
)

test(
  'client-send reserves real chat and one native user request before provision; agent tools own install/check and server prompt stays zero',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const accepted = await w.accept(),
      actionId = accepted.body.actions[0].id
    assert.equal(accepted.body.actions[0].chatMode, 'client-send/1')
    await w.runner().drain()
    assert.equal(w.creates(), 0)
    assert.equal(w.messages.size, 0)
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    // The message a person sees as theirs is one sentence; the steps are the catalogue's `instructions`.
    assert.match(
      prepared.brief.text,
      /^Build a complete demo website for .+ from what Tracy found about it: its real photos, facts and reviews on every page\.$/
    )
    assert.doesNotMatch(prepared.brief.text, /Business:|Frozen research counts:|SHA256|tracy_demo|operation/)
    assert.ok(prepared.brief.text.length < 400, prepared.brief.text)
    assert.equal(createHash('sha256').update(prepared.brief.text, 'utf8').digest('hex'), prepared.brief.hash)
    assert.equal(w.creates(), 0)
    assert.equal(w.sessions.size, 1)
    const claimedBuild = (await w.pool.query('select * from wo_build')).rows[0]
    const claimed = claimedBuild.choice
    const createArgs = {
      accountId: w.account,
      buildId: claimedBuild.build_id,
      body: {
        workflow: 'agent-demo/1',
        platform: claimed.cms,
        design: claimed.template.design,
        quickstart: claimed.template.quickstart,
        label: claimedBuild.label
      }
    }
    assert.equal(
      (await agentDemoCreateContext(w.pool, { ...createArgs, claim: true })).sessionId,
      prepared.chat.sessionId
    )
    await assert.rejects(agentDemoCreateContext(w.pool, createArgs), /AGENT_START_REQUIRED/)
    w.deps.checkDemoGrant = async () => false
    await assert.rejects(w.deps.clientDemo.prepare({ accountId: w.account, actionId }), /NOT_GRANTED/)
    w.deps.checkDemoGrant = async () => true

    const preparedAgain = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    assert.deepEqual(preparedAgain.chat, prepared.chat)
    const reserve = (nativeRequestId) =>
      w.deps.clientDemo.send({
        accountId: w.account,
        actionId,
        body: { sessionId: prepared.chat.sessionId, briefHash: prepared.brief.hash, nativeRequestId }
      })
    const sent = await reserve('native-user-request')
    assert.equal((await reserve('loser-tab-request')).submission.nativeRequestId, 'native-user-request')
    assert.equal(
      (await w.deps.clientDemo.prepare({ accountId: w.account, actionId })).submission.nativeRequestId,
      'native-user-request'
    )
    assert.equal(w.messages.size, 0)
    await assert.rejects(
      w.deps.clientDemo.send({
        accountId: w.account,
        actionId,
        body: { sessionId: 'other', briefHash: prepared.brief.hash, nativeRequestId: 'x' }
      }),
      /SUBMISSION_INVALID/
    )
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'real-user-turn'
    }
    await assert.rejects(capability.call(auth, { operation: 'read' }), /TURN_NOT_BOUND/)
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('real-user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    const research = await capability.call(auth, { operation: 'read', part: 'catalogue' })
    assert.equal(research.hash.length, 64)
    await assert.rejects(
      capability.call({ ...auth, sessionId: 'other-chat' }, { operation: 'guard' }),
      /DIFFERENT_CHAT/
    )
    assert.equal(w.creates(), 0)
    await assert.rejects(capability.call(auth, { operation: 'guard' }), /NOT_READY/)
    await w.advance()
    await w.runner().drain()
    assert.equal(w.creates(), 0)
    const started = await capability.call(auth, { operation: 'provision.start' })
    assert.equal(w.creates(), 1)
    assert.equal(started.jobId, 'job-test')
    assert.equal((await agentDemoCreateContext(w.pool, createArgs)).sessionId, prepared.chat.sessionId)
    await capability.call(auth, { operation: 'provision.start' })
    assert.equal(w.creates(), 1)
    const status = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(status.ready, true, JSON.stringify(status))
    const plan = await capability.call(auth, { operation: 'plan.read' })
    await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: research.hash,
        structureHash: plan.structureHash,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read page'
          }
        ]
      }
    })
    // A saved plan grows (rows appended) and is never rewritten (pilot 24/10/2026).
    const saved = await capability.call(auth, { operation: 'plan.read' })
    const keep = {
      page: '/',
      section: 'body',
      goal: 'Keep layout',
      sourceIds: [],
      assetIds: [],
      target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
      operation: 'retain',
      verify: 'Read page'
    }
    const base = {
      version: 'agent-demo/1',
      researchHash: research.hash,
      structureHash: saved.structureHash ?? plan.structureHash
    }
    const grown = await capability.call(auth, {
      operation: 'plan.save',
      plan: { ...base, rows: [keep, { ...keep, section: 'footer', goal: 'Keep footer' }] }
    })
    assert.equal(grown.ok, true, JSON.stringify(grown))
    assert.equal(grown.rows, 2)
    await assert.rejects(
      capability.call(auth, {
        operation: 'plan.save',
        plan: { ...base, rows: [{ ...keep, goal: 'Another goal' }] }
      }),
      { code: 'AGENT_DEMO_PLAN_FROZEN' }
    )
    // A visible fault the vision look names fails the check and travels back with the others.
    const looked = []
    w.deps.demoLook = async (_site, args) => {
      looked.push(args)
      return {
        id: 'looks-finished',
        pass: false,
        looked: true,
        detail: [{ page: '/', viewport: 'phone', kind: 'text', where: 'hero title over the photo' }]
      }
    }
    // A check whose caller left before its answer (the agent's call timed out) is not counted (pilot 24/10/2026).
    const attempts = async () =>
      (await w.pool.query('select qa from wo_build')).rows[0].qa.clientCheckAttempts ?? 0
    const before = await attempts()
    const gone = new AbortController()
    gone.abort()
    await assert.rejects(capability.call(auth, { operation: 'check' }, { signal: gone.signal }), {
      code: 'AGENT_DEMO_CHECK_UNHEARD'
    })
    assert.equal(await attempts(), before)
    const faulty = await capability.call(auth, { operation: 'check' })
    assert.equal(faulty.pass, false)
    assert.equal(await attempts(), before + 1)
    assert.equal(faulty.checks.at(-1).id, 'looks-finished')
    assert.deepEqual(looked[0].pages, ['/'])
    assert.equal(looked[0].accountId, w.account)
    // 29/10/2026: the look is told the words a card with no source keeps, so it never asks them replaced.
    assert.ok(looked[0].neutral.includes('Menu item'), JSON.stringify(looked[0].neutral))
    // 🔒 A started check answers at once and runs on; its status carries the counted result (dev 24/10/2026:
    // every long check call was cut at Cloudflare's ~100 s and its result dropped as unheard).
    let finishLook
    let finished = false
    // A NUL in what the check read (local 25/10/2026): jsonb refuses `\u0000`, the save threw unheard and
    // every later status read the running check as lost, so the demo never finished.
    const nulLook = () => ({
      id: 'looks-finished',
      pass: false,
      looked: true,
      detail: [{ page: '/', viewport: 'phone', kind: 'text', where: 'menu\u0000tab' }]
    })
    const looking = new Promise((entered) => {
      // The first look waits to be let go; a later one in the same check (the full read that confirms a failing
      // incremental one, `measure`) answers at once.
      w.deps.demoLook = () =>
        finished
          ? Promise.resolve(nulLook())
          : new Promise((resolve) => {
              finishLook = () => {
                finished = true
                resolve(nulLook())
              }
              entered()
            })
    })
    const checking = await capability.call(auth, { operation: 'check.start' })
    assert.equal(checking.running, true, JSON.stringify(checking))
    assert.equal((await capability.call(auth, { operation: 'check.start' })).checkId, checking.checkId)
    assert.equal((await capability.call(auth, { operation: 'check.status' })).running, true)
    assert.equal(await attempts(), before + 1)
    await looking
    finishLook()
    let heard = { running: true }
    for (let n = 0; n < 200 && heard.running; n++) {
      await new Promise((r) => setTimeout(r, 10))
      heard = await capability.call(auth, { operation: 'check.status' })
    }
    assert.equal(heard.pass, false, JSON.stringify(heard))
    assert.equal(heard.checkId, checking.checkId)
    assert.equal(heard.checks.at(-1).id, 'looks-finished')
    // dsh reads the answer exactly: the sweep's `shown` keys are `<page>\u0000<words>` (`demo-lifecycle.mjs`).
    assert.equal(heard.checks.at(-1).detail[0].where, 'menu\u0000tab')
    const stored = (await w.pool.query('select qa from wo_build')).rows[0].qa.clientCheck.result
    assert.equal(stored.checks.at(-1).detail[0].where, 'menu\uFFFDtab')
    assert.equal(await attempts(), before + 2)
    // The result stays readable once the runner closed the action on it (a third failure, a pass).
    await w.pool.query(`update wo_demo_action set status='failed' where id=$1`, [actionId])
    assert.equal((await capability.call(auth, { operation: 'check.status' })).checkId, checking.checkId)
    await assert.rejects(capability.call(auth, { operation: 'check.start' }), {
      code: 'AGENT_DEMO_ACTION_CLOSED'
    })
    await w.pool.query(`update wo_demo_action set status='queued' where id=$1`, [actionId])
    // A running check no process runs any more (tracy-web restarted under it) is lost, uncounted.
    await w.pool.query(`update wo_build set qa=qa||$1::jsonb`, [
      JSON.stringify({
        clientCheck: {
          id: 'gone',
          state: 'running',
          runner: 'old-process',
          startedAt: '2026-01-01T00:00:00Z'
        }
      })
    ])
    await assert.rejects(capability.call(auth, { operation: 'check.status' }), { code: 'DEMO_CHECK_LOST' })
    assert.equal(await attempts(), before + 2)
    w.deps.demoLook = async () => ({ id: 'looks-finished', pass: true, looked: true, detail: [] })
    assert.equal((await capability.call(auth, { operation: 'check' })).pass, true)
    // e2e dev 24/10/2026: /ops/wo and Details read `qa.rounds`/`qa.repairs`, which the agent's checks never
    // wrote ("Site check rounds: 0", "0 repairs" after three checks). Three counted checks, two after a failure.
    const counted = (await w.pool.query('select qa from wo_build')).rows[0].qa
    assert.deepEqual(
      {
        rounds: counted.rounds?.length ?? 0,
        repairs: counted.repairs ?? 0,
        failed: counted.rounds?.map((r) => r.failed.length)
      },
      { rounds: 3, repairs: 2, failed: [1, 1, 0] }
    )
    assert.deepEqual(demoProgress({ qa: counted }).qa, { state: 'needs-review', rounds: 3, issues: 0 })
    await takeDueBaselines(w.pool, w.deps)
    await claimAndRunQa(w.pool, w.deps)
    await wakeStuckRepairs(w.pool, w.deps)
    assert.equal(w.messages.size, 0)
    const build = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(build.handoff.promptSent ?? null, null)
    assert.equal(
      await promptHandoff({
        pool: w.pool,
        prompt: w.deps.prompt,
        site: { site_key: auth.siteKey },
        email: 'builder@test.example',
        buildId: build.id,
        sessionId: auth.sessionId,
        text: 'Forbidden server initial prompt'
      }),
      null
    )
    assert.equal(
      (
        await handOffToAgent({
          ...w.deps,
          build,
          revision: (await w.pool.query('select * from wo_revision')).rows[0]
        })
      ).body.code,
      'DEMO_CLIENT_SEND_ONLY'
    )
    assert.equal(w.messages.size, 0)

    assert.equal(build.qa.machinePassed, true)
    await w.pool.query(
      "update site_turn set state='closed',closed_at=now(),end_reason='aborted' where turn_id='real-user-turn'"
    )
    await assert.rejects(capability.call(auth, { operation: 'provision.start' }), /TURN_STOPPED/)
    await w.advance()
    await w.runner().drain()
    assert.equal(w.messages.size, 0)
    assert.equal(w.creates(), 1)

    const retried = await acceptDemoActions(w.pool, {
      accountId: w.account,
      now: w.deps.now,
      entries: [{ opportunityId: w.opportunity, requestId: 'retry-client-turn', retryOf: actionId }]
    })
    assert.equal(retried.status, 202)
    assert.equal(retried.body.actions[0].chatMode, 'client-send/1')
    const retryId = retried.body.actions[0].id
    // A scheduler can poll a Retry before prepare or while the browser has not submitted its brief yet.
    // The previous action's failed QA must not close the newly accepted action in either window.
    await w.pool.query(`update wo_build set qa=qa||$1::jsonb`, [
      JSON.stringify({
        state: 'failed',
        machinePassed: false,
        humanAccepted: true,
        clientCheckAttempts: 8
      })
    ])
    const assertRetryWaiting = async () => {
      await w.advance()
      await w.runner().drain()
      assert.equal(
        (await w.pool.query('select status from wo_demo_action where id=$1', [retryId])).rows[0].status,
        'queued'
      )
      assert.equal(w.messages.size, 0)
      assert.equal(w.creates(), 1)
    }
    await assertRetryWaiting()
    const retryPrepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId: retryId })
    await assertRetryWaiting()
    assert.deepEqual(retryPrepared.chat, prepared.chat)
    assert.equal(retryPrepared.submission, null)
    assert.equal(w.creates(), 1)
    assert.equal(w.messages.size, 0)
    await w.deps.clientDemo.send({
      accountId: w.account,
      actionId: retryId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: retryPrepared.brief.hash,
        nativeRequestId: 'retry-native-user'
      }
    })
    assert.equal(w.messages.size, 0)
    const retryBuild = (await w.pool.query('select * from wo_build')).rows[0]
    assert.deepEqual(retryBuild.qa.baseline, build.qa.baseline)
    assert.equal(retryBuild.qa.expectedRequestIds[0], 'retry-native-user')
    assert.equal(retryBuild.qa.clientCheckAttempts, 0)
    assert.equal(retryBuild.qa.clientCheck, undefined)
    assert.equal(retryBuild.qa.clientChecks, undefined)
    assert.equal(retryBuild.qa.humanAccepted, false)
    // A failed provision belongs to the action whose create receipt recorded it. The new
    // agent has submitted its brief but has not asked provision.start yet.
    await w.pool.query(`update wo_build set state='failed',receipt=receipt||$1::jsonb`, [
      JSON.stringify({ demoActionId: actionId, failure: { code: 'PROVISION_FAILED' } })
    ])
    await assertRetryWaiting()
    // A new create receipt for THIS action is authoritative, including its failure.
    await w.pool.query(`update wo_build set receipt=receipt||$1::jsonb`, [
      JSON.stringify({ demoActionId: retryId })
    ])
    await w.advance()
    await w.runner().drain()
    assert.equal(
      (await w.pool.query('select status from wo_demo_action where id=$1', [retryId])).rows[0].status,
      'failed'
    )
  }
)

test(
  'only a signed real owner follow-up after normally completed accepted turns can extend client demo authority by CAS',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'initial-user'
      }
    })
    await w.pool.query(
      "insert into seat(site_key,account_id,role,granted_by,accepted_at) values($1,$2,'owner',$2,now())",
      [prepared.chat.siteKey, w.account]
    )
    const at = new Date(w.deps.now())
    for (const [id, rpc, turn, state] of [
      ['initial-proof', 'initial-user', 1, 'closed'],
      ['follow-two', 'follow-user-two', 2, 'open'],
      ['follow-three', 'follow-user-three', 3, 'open']
    ])
      await w.pool.query(
        `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at,end_reason,source,prompt_message_id)
   values($1,$2,$3,$4,'builder@test.example','Real owner message',$5,$6,$7::timestamptz,case when $5='closed' then $7::timestamptz else null end,case when $5='closed' then 'completed' else null end,'panel',$8)`,
        [id, prepared.chat.siteKey, prepared.chat.sessionId, turn, state, rpc, at, `native-message-${turn}`]
      )
    const service = agentDemoCapabilities({ pool: w.pool, objects: null, now: w.deps.now })
    const auth = {
      accountId: w.account,
      siteKey: prepared.chat.siteKey,
      sessionId: prepared.chat.sessionId,
      turnId: 'follow-two',
      actorKind: 'actor',
      actorEmail: 'builder@test.example'
    }
    for (const patch of [
      { actorKind: 'cookie' },
      { actorEmail: 'other@test.example' },
      { sessionId: 'other-chat' }
    ])
      await assert.rejects(service.call({ ...auth, ...patch }, { operation: 'read' }), /NOT_GRANTED/)
    await w.pool.query("update site_turn set prompt_message_id=null where turn_id='follow-two'")
    await assert.rejects(service.call(auth, { operation: 'read' }), /CONTINUATION_NOT_GRANTED/)
    await w.pool.query("update site_turn set prompt_message_id='native-message-2' where turn_id='follow-two'")
    await w.pool.query(
      "with added as (insert into account(email) values('second-owner@test.example') returning id) insert into seat(site_key,account_id,role,granted_by,accepted_at) select $1,id,'owner',id,now() from added",
      [auth.siteKey]
    )
    await w.pool.query("update seat set role='editor' where site_key=$1 and account_id=$2", [
      auth.siteKey,
      w.account
    ])
    await assert.rejects(service.call(auth, { operation: 'read' }), /CONTINUATION_NOT_GRANTED/)
    await w.pool.query("update seat set role='owner' where site_key=$1 and account_id=$2", [
      auth.siteKey,
      w.account
    ])
    for (const reason of ['aborted', 'error', 'interrupted', 'max-tokens', 'blocked']) {
      await w.pool.query("update site_turn set end_reason=$1 where turn_id='initial-proof'", [reason])
      await assert.rejects(service.call(auth, { operation: 'read' }), /TURN_STOPPED/)
    }
    await w.pool.query(
      "update site_turn set state='stale',end_reason='completed' where turn_id='initial-proof'"
    )
    await assert.rejects(service.call(auth, { operation: 'read' }), /CONTINUATION_NOT_GRANTED/)
    await w.pool.query("update site_turn set state='closed' where turn_id='initial-proof'")
    await w.pool.query("update site_turn set source='comment' where turn_id='follow-two'")
    await assert.rejects(service.call(auth, { operation: 'read' }), /CONTINUATION_NOT_GRANTED/)
    await w.pool.query("update site_turn set source='panel' where turn_id='follow-two'")
    const before = (await w.pool.query('select * from wo_build')).rows[0]
    const results = await Promise.allSettled([
      service.call(auth, { operation: 'read' }),
      service.call({ ...auth, turnId: 'follow-three' }, { operation: 'read' })
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const after = (await w.pool.query('select * from wo_build')).rows[0]
    assert.equal(after.qa.expectedRequestIds.length, 2)
    assert.equal(after.qa.expectedRequestIds[0], 'initial-user')
    assert.equal(after.qa.since, before.qa.since)
    assert.equal(after.qa.clientCheckAttempts, before.qa.clientCheckAttempts)
    assert.deepEqual(after.content, before.content)
    assert.equal(after.qa.clientTurnBindings[after.qa.expectedRequestIds[1]].source, 'owner-user-turn')
    const winningTurn = after.qa.expectedRequestIds[1] === 'follow-user-two' ? 'follow-two' : 'follow-three'
    await service.call({ ...auth, turnId: winningTurn }, { operation: 'read' })
    assert.equal((await w.pool.query('select qa from wo_build')).rows[0].qa.expectedRequestIds.length, 2)
    assert.equal(w.creates(), 0)
    await w.pool.query('update wo_build set qa=$2::jsonb where id=$1', [before.id, JSON.stringify(before.qa)])
    const captured = {
      ...before,
      action_id: actionId,
      owner_email: 'builder@test.example',
      action_accepted_at: at,
      current_rpc_id: 'follow-user-two',
      current_turn: {
        turnId: 'follow-two',
        rpcId: 'follow-user-two',
        actor: 'builder@test.example',
        source: 'panel',
        promptMessageId: 'native-message-2',
        state: 'open',
        endReason: null
      }
    }
    const same = await Promise.all([
      bindClientDemoContinuation(w.pool, captured, auth),
      bindClientDemoContinuation(w.pool, captured, auth)
    ])
    assert.deepEqual(same[0].expectedRequestIds, same[1].expectedRequestIds)
    assert.equal(same[0].expectedRequestIds.length, 2)
    assert.equal(w.messages.size, 0)
  }
)

test(
  'a client-send turn that ends completed without a passing check fails the action instead of filling forever',
  opts,
  async () => {
    // QuillHaus build 41cfe7d9 (24/10/2026): one failed check, the agent ended its turn, the job sat at "fill".
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    const sent = await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'user-turn'
    }
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    const research = await capability.call(auth, { operation: 'read', part: 'catalogue' })
    await capability.call(auth, { operation: 'provision.start' })
    assert.equal((await capability.call(auth, { operation: 'provision.status' })).ready, true)
    const plan = await capability.call(auth, { operation: 'plan.read' })
    await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: research.hash,
        structureHash: plan.structureHash,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read page'
          }
        ]
      }
    })
    w.deps.demoLook = async () => ({ id: 'looks-finished', pass: false, looked: true, detail: [] })
    assert.equal((await capability.call(auth, { operation: 'check' })).pass, false)
    const status = async () => (await w.pool.query('select status,error from wo_demo_action')).rows[0]
    // While the turn still runs, the build waits for it.
    await w.advance()
    await w.runner().drain()
    assert.equal((await status()).status, 'queued')
    await w.pool.query(
      "update site_turn set state='closed',closed_at=now(),end_reason='completed' where turn_id='user-turn'"
    )
    // Just closed: a turn-stopping steer may still send the agent on and reopen the record (round 18, 25/10/2026).
    await w.advance()
    await w.runner().drain()
    assert.equal((await status()).status, 'queued')
    await w.pool.query(
      "update site_turn set closed_at=now() - interval '3 minutes' where turn_id='user-turn'"
    )
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await status(), { status: 'failed', error: 'AGENT_DEMO_ENDED_UNCHECKED' })
    const qa = (await w.pool.query('select qa from wo_build')).rows[0].qa
    assert.equal(qa.state, 'failed')
    assert.equal(qa.reason, 'AGENT_DEMO_ENDED_UNCHECKED')
    // 🔒 The earlier action's verdict is not its Retry's (The Willow Nook local, 25/10/2026): the Retry closed at once
    // with QA_NEEDS_REVIEW before its chat could be prepared, so a demo that ended unchecked could never go again.
    await w.advance()
    const retry = await acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [{ opportunityId: w.opportunity, requestId: 'retry-unchecked', retryOf: actionId }],
      now: w.deps.now
    })
    const retryId = retry.body.actions[0].id
    await w.advance()
    await w.runner().drain()
    const retried = (await w.pool.query('select status,error from wo_demo_action where id=$1', [retryId]))
      .rows[0]
    assert.deepEqual(retried, { status: 'queued', error: null })
    const again = await w.deps.clientDemo.prepare({ accountId: w.account, actionId: retryId })
    assert.equal(again.chat.sessionId, prepared.chat.sessionId)
  }
)

test(
  'a client-send turn that ends completed while its check still runs waits for that check',
  opts,
  async () => {
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const build = (await w.pool.query('select id,site_key from wo_build')).rows[0]
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at,end_reason)
       values('user-turn','pho-ba.localhost',$1,1,'builder@test.example','User brief','closed','native-user',now(),now(),'completed')`,
      [prepared.chat.sessionId]
    )
    await w.pool.query(`update wo_build set qa=qa||$2::jsonb where id=$1`, [
      build.id,
      JSON.stringify({
        clientCheck: {
          id: 'c1',
          state: 'running',
          runner: 'other',
          startedAt: new Date(w.deps.now()).toISOString(),
          beatAt: new Date(w.deps.now()).toISOString()
        }
      })
    ])
    await w.advance()
    await w.runner().drain()
    assert.equal((await w.pool.query('select status from wo_demo_action')).rows[0].status, 'queued')
  }
)

test(
  'a native inventory that keeps failing counts as a baseline try and ends DEMO_BASELINE_UNAVAILABLE',
  opts,
  async () => {
    // Reverb build 4d53fccd (24/10/2026): the 90 s inventory cap failed every read, baselineTries stayed 0 and
    // the agent told the person to create a new site.
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    w.deps.readNativeInventory = async () => {
      throw Object.assign(new Error('AGENT_DEMO_INVENTORY_LIMIT'), { code: 'AGENT_DEMO_INVENTORY_LIMIT' })
    }
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    const sent = await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'user-turn'
    }
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    await capability.call(auth, { operation: 'provision.start' })
    const first = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(first.ready, false)
    assert.equal(first.code, 'AGENT_DEMO_INVENTORY_LIMIT')
    assert.match(first.message, /too large to read in time/)
    assert.match(first.message, /try again later/)
    const tries = async () => (await w.pool.query('select qa from wo_build')).rows[0].qa
    assert.equal((await tries()).baselineTries, 1)
    await capability.call(auth, { operation: 'provision.status' })
    const last = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(last.code, 'DEMO_BASELINE_UNAVAILABLE')
    const qa = await tries()
    assert.equal(qa.baselineTries, 3)
    assert.equal(qa.state, 'failed')
    assert.equal(qa.baselineError, 'AGENT_DEMO_INVENTORY_LIMIT')
    const again = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(again.code, 'DEMO_BASELINE_UNAVAILABLE')
    await w.advance()
    await w.runner().drain()
    assert.deepEqual((await w.pool.query('select status,error from wo_demo_action')).rows[0], {
      status: 'failed',
      error: 'DEMO_BASELINE_UNAVAILABLE'
    })
  }
)

test(
  'a template post no plan row writes is swept from the build structure, not from the saved plan',
  opts,
  async () => {
    // The Willow Nook local build (25/10/2026): `plan.save` keeps the structure beside the plan, never in it, so the
    // check read no template post and eight posts on the blog's second page kept their 2021 dates.
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const home = await w.deps.readNativeInventory()
    const post = {
      key: 'posts/spring-menu',
      identity: { collection: 'posts', id: 'spring-menu', slug: 'spring-menu', locale: 'en' },
      publication: { status: 'published' },
      routes: ['/posts/spring-menu'],
      relations: {},
      dateField: 'date',
      data: { title: 'Spring menu', date: '2021-09-10' },
      editorialFields: ['title', 'date']
    }
    w.deps.readNativeInventory = async () => ({ ...home, records: [...home.records, post] })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    const sent = await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'user-turn'
    }
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    const research = await capability.call(auth, { operation: 'read', part: 'catalogue' })
    await capability.call(auth, { operation: 'provision.start' })
    const status = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(status.ready, true, JSON.stringify(status))
    const plan = await capability.call(auth, { operation: 'plan.read' })
    const saved = await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: research.hash,
        structureHash: plan.structureHash,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read page'
          }
        ]
      }
    })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    const build = (await w.pool.query('select created_at, content from wo_build')).rows[0]
    assert.equal(build.content.agentDemo.plan.structure, undefined, 'the saved plan holds no structure')
    const looked = []
    const qa = w.deps.demoQa
    w.deps.demoQa = async (site, args) => {
      looked.push(args)
      return qa(site, args)
    }
    const visions = []
    w.deps.demoLook = async (_site, args) => {
      visions.push(args.pages)
      return { id: 'looks-finished', pass: true, looked: true, version: LOOK_PROMPT_VERSION, detail: [] }
    }
    const checked = await capability.call(auth, { operation: 'check' })
    assert.deepEqual(looked[0].templateTitles, ['Spring menu'])
    const day = new Date(build.created_at).toISOString().slice(0, 10)
    assert.ok(
      (checked.sweep?.calls ?? []).some(
        (call) =>
          call.action === 'content_update' &&
          call.params.id === 'spring-menu' &&
          call.params.data?.date === day
      ),
      JSON.stringify(checked.sweep ?? checked)
    )
    // 28/10/2026: a round that sweeps is not counted and is not looked at; the check after the sweep looks.
    assert.deepEqual(visions, [])
    const notLooked = checked.checks.find((c) => c.id === 'looks-finished')
    assert.deepEqual([notLooked?.pass, notLooked?.looked], [false, false])
    // The read after a sweep round is incremental: only what the sweep wrote is read anew.
    const again = await capability.call(auth, { operation: 'check' })
    assert.equal(looked[1].incremental, true)
    assert.equal(
      again.sweep?.calls?.length ?? 0,
      0,
      'the same calls planned again stop the sweep: this check counts'
    )
    // Looked at once, pass or fail (29/10/2026): the incremental read leaves its look to the whole read after it.
    assert.equal(visions.length, 1)
    assert.equal(again.checks.find((c) => c.id === 'looks-finished')?.looked, true)
  }
)

test(
  'dev 27/10/2026: the check after a sweep round asks the host to read again only the pages whose document changed',
  opts,
  async () => {
    // ja-diner (dev 27/10/2026): each of six sweep rounds' checks read and looked at the whole site, ~60 min in one call.
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const home = await w.deps.readNativeInventory()
    const post = {
      key: 'posts/spring-menu',
      identity: { collection: 'posts', id: 'spring-menu', slug: 'spring-menu', locale: 'en' },
      publication: { status: 'published' },
      routes: ['/posts/spring-menu'],
      relations: {},
      dateField: 'date',
      data: { title: 'Spring menu', date: '2021-09-10' },
      editorialFields: ['title', 'date']
    }
    w.deps.readNativeInventory = async () => ({ ...home, records: [...home.records, post] })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    const sent = await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'user-turn'
    }
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    const research = await capability.call(auth, { operation: 'read', part: 'catalogue' })
    await capability.call(auth, { operation: 'provision.start' })
    const status = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(status.ready, true, JSON.stringify(status))
    const plan = await capability.call(auth, { operation: 'plan.read' })
    const saved = await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: research.hash,
        structureHash: plan.structureHash,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read page'
          }
        ]
      }
    })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    const build = (await w.pool.query('select created_at, content from wo_build')).rows[0]
    assert.equal(build.content.agentDemo.plan.structure, undefined, 'the saved plan holds no structure')
    const looked = []
    const qa = w.deps.demoQa
    w.deps.demoQa = async (site, args) => {
      looked.push(args)
      return qa(site, args)
    }
    // The first check reads every page; it answers with the sweep's calls, uncounted.
    const swept = await capability.call(auth, { operation: 'check' })
    assert.ok((swept.sweep?.calls ?? []).length > 0, JSON.stringify(swept.sweep ?? swept))
    assert.equal(looked[0].incremental, false)
    assert.equal((await w.pool.query('select qa from wo_build')).rows[0].qa.clientCheckAttempts ?? 0, 0)
    // The check after the round keeps each page whose document the sweep did not change (`checkIsIncremental`).
    // Review 27/10/2026: a kept read is the page as it loaded, before lazy content scrolled in, so it can still show
    // a label the sweep renamed. Here the incremental read fails on such a label; the full read does not see it.
    w.deps.demoQa = async (site, args) => {
      looked.push(args)
      const answer = await qa(site, args)
      if (!args.incremental) return answer
      const stale = { id: 'no-demo-words', pass: false, measured: 'kept read', detail: [{ page: '/' }] }
      return { ...answer, body: { ...answer.body, checks: [...answer.body.checks, stale] } }
    }
    const counted = await capability.call(auth, { operation: 'check' })
    assert.equal(looked[1].incremental, true)
    // The same sweep planned again: no round follows, the check is counted, so the failure is read again in full first.
    assert.equal(looked[2]?.incremental, false, 'a failing incremental check is confirmed by a full read')
    assert.equal(looked.length, 3)
    const qaRow = (await w.pool.query('select qa from wo_build')).rows[0].qa
    assert.equal(qaRow.clientCheckAttempts, 1)
    assert.ok(
      !counted.checks.some((c) => c.measured === 'kept read'),
      'the counted answer is the full read, never the kept one'
    )
  }
)

test(
  "the sweep's neutral wording is in the language the build wrote the site's slot fills in (Vietnamese)",
  opts,
  async () => {
    // 🔒 Product owner, 27/10/2026: the sweep writes the neutral wording of the site's language, read where the build
    // recorded it for its slot fills (`content.writes['slot-fill'].locale`), never English on every site.
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const home = await w.deps.readNativeInventory()
    const post = {
      key: 'posts/spring-menu',
      identity: { collection: 'posts', id: 'spring-menu', slug: 'spring-menu', locale: 'en' },
      publication: { status: 'published' },
      routes: ['/posts/spring-menu'],
      relations: {},
      dateField: 'date',
      data: { title: 'Spring menu', date: '2021-09-10' },
      editorialFields: ['title', 'date']
    }
    w.deps.readNativeInventory = async () => ({ ...home, records: [...home.records, post] })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    const sent = await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'user-turn'
    }
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    const research = await capability.call(auth, { operation: 'read', part: 'catalogue' })
    await capability.call(auth, { operation: 'provision.start' })
    const status = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(status.ready, true, JSON.stringify(status))
    const plan = await capability.call(auth, { operation: 'plan.read' })
    const saved = await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: research.hash,
        structureHash: plan.structureHash,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read page'
          }
        ]
      }
    })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    await w.pool.query(
      `update wo_build set content = jsonb_set(content, '{writes}', '{"slot-fill": {"locale": "vi"}}'::jsonb)`
    )
    const qa = w.deps.demoQa
    w.deps.demoQa = async (site, args) => {
      const measured = await qa(site, args)
      const dish = {
        field: 'dish-name',
        page: '/',
        text: 'Smoked Venison',
        n: 0,
        selector: 'div.dish-info > h4.dish-name'
      }
      return {
        ...measured,
        body: { ...measured.body, residue: { items: [dish, { ...dish, text: 'Grilled Salmon Fillet' }] } }
      }
    }
    // A dsh that sends a page's pairs as one call says so (`sweepBatches`): the page's words are one call.
    const checked = await capability.call(auth, { operation: 'check', sweepBatches: true })
    const words = (checked.sweep?.calls ?? []).filter((call) => call.action === 'content.replace')
    // The Vietnamese for "service", escaped so the source stays ASCII.
    const service = 'D\u1ecbch v\u1ee5'
    assert.deepEqual(
      words.map((call) => [call.params.path, call.params.changes?.map((c) => [c.find, c.replace, c.expect])]),
      // This fixture's trade sells services, so the item's neutral name is the Vietnamese one for a service.
      [
        [
          '/',
          [
            ['Grilled Salmon Fillet', service, 1],
            ['Smoked Venison', service, 1]
          ]
        ]
      ],
      JSON.stringify(checked.sweep ?? checked)
    )
  }
)

test(
  'a slot the replace job refuses to empty, with no wording for it, is no call: the check still names it unresolved',
  opts,
  async () => {
    // Review 26/10/2026: a list item the sweep would empty is refused by the replace job, so the sweep plans no call
    // for it; with nothing else to run, its sweep still reaches the check's answer, so the QA lists the residue.
    const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
    const actionId = (await w.accept()).body.actions[0].id
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
    const sent = await w.deps.clientDemo.send({
      accountId: w.account,
      actionId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-user'
      }
    })
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: prepared.chat.siteKey,
      accountId: w.account,
      sessionId: prepared.chat.sessionId,
      turnId: 'user-turn'
    }
    await w.pool.query(
      `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at) values('user-turn',$1,$2,1,'builder@test.example','User brief','open',$3,$4)`,
      [auth.siteKey, auth.sessionId, sent.submission.nativeRequestId, new Date(w.deps.now())]
    )
    const research = await capability.call(auth, { operation: 'read', part: 'catalogue' })
    await capability.call(auth, { operation: 'provision.start' })
    const status = await capability.call(auth, { operation: 'provision.status' })
    assert.equal(status.ready, true, JSON.stringify(status))
    const plan = await capability.call(auth, { operation: 'plan.read' })
    const saved = await capability.call(auth, {
      operation: 'plan.save',
      plan: {
        version: 'agent-demo/1',
        researchHash: research.hash,
        structureHash: plan.structureHash,
        rows: [
          {
            page: '/',
            section: 'body',
            goal: 'Keep layout',
            sourceIds: [],
            assetIds: [],
            target: { kind: 'emdash', collection: 'pages', id: 'home', path: 'body' },
            operation: 'retain',
            verify: 'Read page'
          }
        ]
      }
    })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    const qa = w.deps.demoQa
    w.deps.demoQa = async (site, args) => {
      const measured = await qa(site, args)
      const item = {
        field: 'text',
        page: '/',
        text: 'Donec quam felis ultricies',
        block: 'Donec quam felis ultricies',
        selector: 'ul.features > li'
      }
      return { ...measured, body: { ...measured.body, residue: { items: [item] } } }
    }
    const checked = await capability.call(auth, { operation: 'check' })
    assert.deepEqual(checked.sweep?.calls, [], JSON.stringify(checked.sweep ?? checked))
    assert.deepEqual(
      checked.sweep.unresolved.map((u) => [u.text, u.refused]),
      [['Donec quam felis ultricies', 'li']]
    )
    assert.match(checked.sweep.unresolved[0].why, /refuses to empty a li/)
  }
)

test(
  'an action with no selection builds on the account CMS, else the /ops default, with that CMS pinned template',
  opts,
  async () => {
    const w = await world()
    await w.accept()
    const action = (await w.pool.query('select * from wo_demo_action')).rows[0]
    assert.equal(action.selection?.cms, undefined, 'the press named no CMS')
    const domain = await websiteOpportunitiesDomain()
    // The pinned card is listed second, so the first offered card cannot pass for the pin.
    const cards = [
      { id: 'ja-other', platforms: [{ platform: 'wordpress', tag: 'ja-other/wp7', version: '2.0.0' }] },
      {
        id: 'tracy-base',
        platforms: [
          { platform: 'wordpress', tag: 'tracy-base/wp7', version: '1.0.0' },
          { platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '1.2.0' }
        ]
      }
    ]
    const choose = () =>
      revisionForAction(w.pool, {
        action,
        domain,
        templates: async () => cards,
        ops: DEFAULT_WO_OPS_SETTINGS,
        now: w.deps.now,
        historical: true
      })

    const fallback = await choose()
    assert.equal(fallback.error, undefined, JSON.stringify(fallback))
    assert.equal(fallback.revision.cms, DEFAULT_WO_OPS_SETTINGS.defaultCms)
    assert.equal(fallback.revision.cms_source, 'default')
    assert.equal(fallback.revision.template.quickstart, DEFAULT_WO_OPS_SETTINGS.pinnedTemplates.emdash)

    await w.pool.query("insert into wo_preference (account_id, cms) values ($1, 'wordpress')", [w.account])
    const chosen = await choose()
    assert.equal(chosen.error, undefined, JSON.stringify(chosen))
    assert.equal(chosen.revision.cms, 'wordpress')
    assert.equal(chosen.revision.cms_source, 'account')
    assert.equal(chosen.revision.template.quickstart, DEFAULT_WO_OPS_SETTINGS.pinnedTemplates.wordpress)
    assert.equal(chosen.revision.template.reason, 'pinned')
  }
)

/**
 * A client demo whose researched place never looked for its logo: the research door is the fake `research`, and the
 * place read again is `fresh` (null: still without a logo), both handed to the real `withLogoResearch`.
 */
async function logoWorld({ fresh = () => null } = {}) {
  const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
  const actionId = (await w.accept()).body.actions[0].id
  // A researched place: the brief records its snapshot, so the row is real.
  const place = (await w.pool.query("insert into wo_place(display_name) values ('Pho Ba') returning id"))
    .rows[0].id
  const snapshot = (
    await w.pool.query("insert into wo_place_snapshot(place_id,state) values ($1,'published') returning id", [
      place
    ])
  ).rows[0].id
  await w.pool.query(
    `update wo_demo_action set selection = jsonb_set(selection, '{researchInput,placeSnapshotId}', to_jsonb($2::text)) where id=$1`,
    [actionId, snapshot]
  )
  const asked = []
  w.deps.revisionForAction = (pool, args) => {
    assert.equal(typeof args.logoResearch?.research, 'function', 'prepare hands the research door down')
    return revisionForAction(pool, {
      ...args,
      historical: false,
      logoResearch: {
        ...args.logoResearch,
        research: async (action) => {
          asked.push(action.id)
          return { ok: true }
        },
        freeze: async () => {
          const input = (await pool.query('select selection from wo_demo_action where id=$1', [actionId]))
            .rows[0].selection.researchInput
          const logo = fresh()
          return logo ? { ...input, brand: { ...input.brand, logoResearch: logo } } : input
        }
      }
    })
  }
  const counts = async () =>
    (
      await w.pool.query(
        'select (select count(*)::int from wo_revision) as revisions, (select count(*)::int from wo_build) as builds'
      )
    ).rows[0]
  const selection = async () =>
    (await w.pool.query('select selection from wo_demo_action where id=$1', [actionId])).rows[0].selection
  return { ...w, actionId, asked, counts, selection }
}

test(
  'a client demo waiting for its logo research is never prepared inside a request, and the runner builds it after the deadline with the wordmark',
  opts,
  async () => {
    const w = await logoWorld()
    const started = Date.now()
    await assert.rejects(
      w.deps.clientDemo.prepare({ accountId: w.account, actionId: w.actionId }),
      (failure) => {
        assert.equal(failure.code, LOGO_RESEARCH_PENDING)
        assert.equal(failure.status, 409)
        assert.equal(Date.parse(failure.retryAt), w.deps.now() + LOGO_RESEARCH_WAIT_MS)
        return true
      }
    )
    assert.ok(Date.now() - started < 2_000, 'prepare never waits for the research')
    assert.deepEqual(await w.counts(), { revisions: 0, builds: 0 }, 'no brief while the research may answer')
    assert.equal((await w.selection()).logoResearch.state, 'requested')
    // Inside the minute the runner's reconcile asks again and still makes nothing.
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.counts(), { revisions: 0, builds: 0 })
    assert.deepEqual(w.asked, [w.actionId], 'asked once')
    // Nobody reads the demo again: the runner alone prepares it once the minute is over.
    for (let i = 0; i < Math.ceil(LOGO_RESEARCH_WAIT_MS / 11_000); i++) await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.counts(), { revisions: 1, builds: 1 })
    const held = (await w.selection()).logoResearch
    assert.equal(held.state, 'timeout')
    assert.equal((await w.selection()).researchInput.brand?.logoResearch, undefined, 'the wordmark is drawn')
    assert.equal(logoResearchNote(held).id, 'logo-research')
    assert.deepEqual(w.asked, [w.actionId])
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId: w.actionId })
    assert.ok(prepared.brief.hash)
  }
)

test(
  'a client demo whose logo research answers in time is briefed from the place read again',
  opts,
  async () => {
    const found = { status: 'found', chosen: { url: 'https://phoba.example/logo.png' } }
    let done = false
    const w = await logoWorld({ fresh: () => (done ? found : null) })
    await assert.rejects(
      w.deps.clientDemo.prepare({ accountId: w.account, actionId: w.actionId }),
      /LOGO_RESEARCH_PENDING/
    )
    done = true
    await w.advance()
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId: w.actionId })
    assert.ok(prepared.brief.hash)
    assert.deepEqual(await w.counts(), { revisions: 1, builds: 1 })
    const selection = await w.selection()
    assert.equal(selection.logoResearch.state, 'done')
    assert.deepEqual(selection.researchInput.brand.logoResearch, found)
    assert.equal(logoResearchNote(selection.logoResearch), null)
    const revision = (await w.pool.query('select brief from wo_revision')).rows[0]
    assert.match(
      JSON.stringify(revision.brief),
      /phoba\.example\/logo\.png/,
      'the brief carries the logo found'
    )
    assert.deepEqual(w.asked, [w.actionId])
  }
)

// A demo stayed on "Building…" for hours with no Retry (27/10/2026): its agent ended with an error, the moment job
// failed because the site had no webroot yet, and nothing ever ended the action.
async function clientSendWorld() {
  const w = await world({ historical: false, agentWorkflow: true, chatMode: 'client-send/1' })
  const actionId = (await w.accept()).body.actions[0].id
  const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId })
  await w.deps.clientDemo.send({
    accountId: w.account,
    actionId,
    body: {
      sessionId: prepared.chat.sessionId,
      briefHash: prepared.brief.hash,
      nativeRequestId: 'native-user'
    }
  })
  await w.pool.query(
    `insert into site (site_key, label, host) values ($1, 'pho-ba', 'local') on conflict (site_key) do nothing`,
    [prepared.chat.siteKey]
  )
  await openTurn(w.pool, {
    turnId: 'wo-turn:1',
    siteKey: prepared.chat.siteKey,
    actor: 'builder@test.example',
    title: 'User brief',
    source: 'panel',
    rpcId: 'native-user'
  })
  await w.pool.query("update site_turn set session_id=$1 where turn_id='wo-turn:1'", [
    prepared.chat.sessionId
  ])
  const status = async (id = actionId) =>
    (await w.pool.query('select status,error from wo_demo_action where id=$1', [id])).rows[0]
  return { ...w, actionId, prepared, status }
}

test(
  'an agent that ended in error before any provision fails the action through its failed moment, and Retry is taken',
  opts,
  async () => {
    const w = await clientSendWorld()
    await w.advance()
    await w.runner().drain()
    assert.equal((await w.status()).status, 'queued', 'the agent still runs')
    await fileFollowUp(w.pool, {
      jobId: 'moment-no-webroot',
      siteKey: w.prepared.chat.siteKey,
      host: 'local',
      kind: 'webroot-moment',
      door: 'moment',
      turnId: 'wo-turn:1',
      payload: { title: 'User brief', actor: 'builder@test.example', reply: null, endReason: 'error' },
      waitMs: 10_000
    })
    await followThrough(w.pool, 'moment-no-webroot', 'moment', {
      state: 'failed',
      output: 'webroot-git: no webroot yet'
    })
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'AGENT_DEMO_TURN_STOPPED' })
    const retry = await acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [{ opportunityId: w.opportunity, requestId: 'retry-after-error', retryOf: w.actionId }],
      now: w.deps.now
    })
    assert.equal(retry.status, 202, JSON.stringify(retry.body))
  }
)

test(
  'a turn that went stale with no end reason fails the action as lost, saying no more than that',
  opts,
  async () => {
    const w = await clientSendWorld()
    await w.pool.query("update site_turn set state='stale' where turn_id='wo-turn:1'")
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'AGENT_DEMO_TURN_LOST' })
    assert.equal(
      (await w.pool.query('select end_reason from site_turn')).rows[0].end_reason,
      null,
      'no cause invented'
    )
  }
)

test(
  'a failed QA verdict with no provision job yet ends the action instead of awaiting the agent',
  opts,
  async () => {
    const w = await clientSendWorld()
    await w.pool.query(
      `update wo_build set qa=qa||'{"state":"failed","reason":"AGENT_DEMO_ENDED_UNCHECKED"}'::jsonb, site_job_id=null`
    )
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'AGENT_DEMO_ENDED_UNCHECKED' })
  }
)

test(
  'the 2 h deadline ends an action whose run hangs with its heartbeat alive, and its late result changes nothing after Retry',
  opts,
  async () => {
    const w = await clientSendWorld()
    let release
    const hung = new Promise((resolve) => {
      release = resolve
    })
    const real = w.deps.clientDemo
    w.deps.clientDemo = { ...real, reconcile: () => hung }
    const runner = w.runner()
    await w.advance()
    await runner.tick()
    const leased = (await w.pool.query('select lease_until,lease_token from wo_demo_action')).rows[0]
    assert.ok(leased.lease_until, 'the hung run holds its lease')
    await w.pool.query("update wo_demo_action set accepted_at = accepted_at - interval '3 hours'")
    await runner.tick()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'DEMO_STEP_TIMEOUT' })
    w.deps.clientDemo = real
    const retry = await acceptDemoActions(w.pool, {
      accountId: w.account,
      entries: [{ opportunityId: w.opportunity, requestId: 'retry-after-timeout', retryOf: w.actionId }],
      now: w.deps.now
    })
    assert.equal(retry.status, 202, JSON.stringify(retry.body))
    const retryId = retry.body.actions[0].id
    // The old worker comes back with a verdict: its lease is gone, so neither action moves.
    release({ terminal: true, state: 'completed' })
    await runner.drain()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'DEMO_STEP_TIMEOUT' })
    assert.equal((await w.status(retryId)).status, 'queued')
  }
)

test(
  'the 2 h deadline ends a queued action while the queue switch is off and claims nothing',
  opts,
  async () => {
    const w = await clientSendWorld()
    w.deps.switchOn = async () => false
    await w.pool.query("update wo_demo_action set accepted_at = accepted_at - interval '3 hours'")
    await w.advance()
    await w.runner().tick()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'DEMO_STEP_TIMEOUT' })
  }
)

test(
  'a provision that succeeded stays done when the agent fails afterwards; only the action fails',
  opts,
  async () => {
    const w = await clientSendWorld()
    const capability = agentDemoCapabilities({
      pool: w.pool,
      objects: null,
      now: w.deps.now,
      lifecycle: (auth, params, held) => w.deps.clientDemo.operation(auth, params, held)
    })
    const auth = {
      siteKey: w.prepared.chat.siteKey,
      accountId: w.account,
      sessionId: w.prepared.chat.sessionId,
      turnId: 'wo-turn:1'
    }
    await capability.call(auth, { operation: 'provision.start' })
    assert.equal((await capability.call(auth, { operation: 'provision.status' })).ready, true)
    await w.pool.query(
      "update site_turn set state='closed', closed_at=now(), end_reason='error' where turn_id='wo-turn:1'"
    )
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.status(), { status: 'failed', error: 'AGENT_DEMO_TURN_STOPPED' })
    assert.equal((await w.pool.query('select state from wo_build')).rows[0].state, 'done')
  }
)

// Review of the turn recovery (27/10/2026): a Retry reuses the build, so the old attempt's verdict is still on it
// between Retry's prepare and its send. None of it may end the new attempt.
async function retriedAfter(w, setup) {
  await setup()
  await w.pool.query("update wo_demo_action set status='failed', error='X' where id=$1", [w.actionId])
  const retry = await acceptDemoActions(w.pool, {
    accountId: w.account,
    entries: [{ opportunityId: w.opportunity, requestId: `retry-${Math.random()}`, retryOf: w.actionId }],
    now: w.deps.now
  })
  assert.equal(retry.status, 202, JSON.stringify(retry.body))
  const retryId = retry.body.actions[0].id
  await w.deps.clientDemo.prepare({ accountId: w.account, actionId: retryId })
  await w.advance()
  await w.runner().drain()
  return retryId
}

const PREVIOUS_ATTEMPT = {
  'failed check': (w) =>
    w.pool.query(`update wo_build set qa=qa||'{"state":"failed","reason":"QA_NEEDS_REVIEW"}'::jsonb`),
  'passed machine check': (w) =>
    w.pool.query(
      `update wo_build set state='done', site_job_id='old-job', qa=qa||'{"state":"needs-review","machinePassed":true}'::jsonb`
    ),
  'turn that ended unchecked': (w) =>
    w.pool.query(
      "update site_turn set state='closed', end_reason='completed', closed_at=now()-interval '10 minutes' where turn_id='wo-turn:1'"
    ),
  'failed provision': (w) =>
    w.pool.query(
      `update wo_build set state='failed', site_job_id='old-job', receipt=jsonb_build_object('demoActionId',$1::text,'failure',jsonb_build_object('code','PROVISION_FAILED'))`,
      [w.actionId]
    )
}
for (const [name, setup] of Object.entries(PREVIOUS_ATTEMPT)) {
  test(
    `a Retry is not ended by the previous attempt’s ${name} before its own brief is sent`,
    opts,
    async () => {
      const w = await clientSendWorld()
      const retryId = await retriedAfter(w, () => setup(w))
      assert.deepEqual(await w.status(retryId), { status: 'queued', error: null })
    }
  )
}

test(
  'after a Retry’s brief is sent, a provision failure only ends it when this attempt started that provision',
  opts,
  async () => {
    const w = await clientSendWorld()
    const retryId = await retriedAfter(w, () => PREVIOUS_ATTEMPT['failed provision'](w))
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId: retryId })
    await w.deps.clientDemo.send({
      accountId: w.account,
      actionId: retryId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-retry'
      }
    })
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(await w.status(retryId), { status: 'queued', error: null }, 'the old attempt’s failure')
    await w.pool.query(`update wo_build set receipt=jsonb_set(receipt,'{demoActionId}',to_jsonb($1::text))`, [
      retryId
    ])
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(
      await w.status(retryId),
      { status: 'failed', error: 'PROVISION_FAILED' },
      'its own failure'
    )
  }
)

test(
  'after a Retry’s brief is sent, a failed check before any provision ends it only when the verdict is its own',
  opts,
  async () => {
    // The two rules agree: a failed check ends the action before a provision job exists (#1789), and an earlier
    // action's verdict is not its Retry's (#1714). `send` stamps `qa.since` with the sending action's `accepted_at`.
    const w = await clientSendWorld()
    const first = (await w.pool.query('select accepted_at from wo_demo_action where id=$1', [w.actionId]))
      .rows[0]
    const retryId = await retriedAfter(w, () => w.advance())
    const prepared = await w.deps.clientDemo.prepare({ accountId: w.account, actionId: retryId })
    await w.deps.clientDemo.send({
      accountId: w.account,
      actionId: retryId,
      body: {
        sessionId: prepared.chat.sessionId,
        briefHash: prepared.brief.hash,
        nativeRequestId: 'native-retry'
      }
    })
    const failedSince = (since) =>
      w.pool.query(
        `update wo_build set site_job_id=null, qa=qa||jsonb_build_object('state','failed','reason','QA_NEEDS_REVIEW','since',$1::text)`,
        [new Date(since).toISOString()]
      )
    await failedSince(first.accepted_at)
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(
      await w.status(retryId),
      { status: 'queued', error: null },
      'the earlier action’s verdict'
    )
    const own = (await w.pool.query('select accepted_at from wo_demo_action where id=$1', [retryId])).rows[0]
    await failedSince(own.accepted_at)
    await w.advance()
    await w.runner().drain()
    assert.deepEqual(
      await w.status(retryId),
      { status: 'failed', error: 'QA_NEEDS_REVIEW' },
      'its own verdict'
    )
  }
)

/** The Demo column of a client-send world's one opportunity, as the list answers it, and what the cell draws. */
async function demoColumn(w, now) {
  const builder = createWebsiteBuilder({ config: { origin: 'http://tracy.test:8080' }, pool: w.pool })
  const id = (await w.pool.query('select opportunity_id from wo_demo_action limit 1')).rows[0].opportunity_id
  const demo = (await builder.listedDemoOf(w.account, [id])).get(id).demo
  return { demo, view: demoView(demo, now) }
}

test(
  'a failed latest action leaves the Demo column failed, never Building, while its build still provisions',
  opts,
  async () => {
    const w = await clientSendWorld()
    await w.pool.query("update wo_build set state='provisioning', created_at=now() - interval '42 hours'")
    for (const error of ['AGENT_DEMO_TURN_STOPPED', 'DEMO_STEP_TIMEOUT']) {
      await w.pool.query("update wo_demo_action set status='failed', error=$1", [error])
      const { demo, view } = await demoColumn(w, Date.now())
      assert.equal(demo.build.status, 'failed', error)
      assert.deepEqual(view, { kind: 'failed' }, error)
    }
  }
)

test(
  'a queued Retry over a build still provisioning reads Building, timed from the Retry, not the first build',
  opts,
  async () => {
    const w = await clientSendWorld()
    await w.pool.query("update wo_build set state='provisioning', created_at=now() - interval '42 hours'")
    await w.pool.query(
      "update wo_demo_action set status='failed', error='AGENT_DEMO_TURN_STOPPED', accepted_at=now() - interval '42 hours'"
    )
    const accepted = new Date(Date.now() - 3 * 60_000)
    await w.pool.query(
      `insert into wo_demo_action select (jsonb_populate_record(null::wo_demo_action, to_jsonb(a) ||
       jsonb_build_object('id', gen_random_uuid(), 'request_id', a.request_id || '-retry', 'retry_of', a.id,
         'status', 'queued', 'error', null, 'accepted_at', $1::timestamptz))).*
     from wo_demo_action a`,
      [accepted]
    )
    const { demo, view } = await demoColumn(w, accepted.getTime() + 3 * 60_000 + 5_000)
    assert.equal(demo.build.status, 'building')
    assert.equal(Date.parse(demo.build.startedAt), accepted.getTime())
    assert.deepEqual(view, { kind: 'building', minutes: 3 })
  }
)

// Every status `wo_demo_action` can hold (migrations 143/151; the runners' `finish`), over a build whose older
// check passed: only a finished action lets the row reach Outreach; one still running or failed keeps it in Demo.
const LATEST_ACTION = [
  ['queued', 'legacy', { stage: 'demo', attention: false }],
  ['quality-queued-v1', 'quality-v1', { stage: 'demo', attention: false }],
  ['failed', 'legacy', { stage: 'demo', attention: true }],
  ['quality-failed-v1', 'quality-v1', { stage: 'demo', attention: true }],
  ['completed', 'legacy', { stage: 'outreach', attention: false }],
  ['quality-completed-v1', 'quality-v1', { stage: 'outreach', attention: false }]
]
for (const [status, protocol, expected] of LATEST_ACTION)
  test(
    `a latest action that is ${status} over an older passed check puts its opportunity in ${expected.stage}`,
    opts,
    async () => {
      const w = await clientSendWorld()
      await w.pool.query(`update wo_build set state='done', qa=qa||'{"state":"passed"}'::jsonb`)
      // The protocol is frozen per row, so the latest action is a Retry accepted after the first one.
      await w.pool.query("update wo_demo_action set status='failed', error='DEMO_STEP_TIMEOUT'")
      await w.pool.query(
        `insert into wo_demo_action select (jsonb_populate_record(null::wo_demo_action, to_jsonb(a) ||
         jsonb_build_object('id', gen_random_uuid(), 'request_id', a.request_id || '-retry', 'retry_of', a.id,
           'protocol', $1::text, 'status', $2::text, 'error', null, 'accepted_at', a.accepted_at + interval '1 minute'))).*
       from wo_demo_action a`,
        [protocol, status]
      )
      const row = (await listOpportunities(w.pool, w.account, { demoJourney: demoJourneySql })).rows[0]
      assert.deepEqual({ stage: row.stage, attention: row.attention }, expected)
    }
  )
test(
  'a failed latest action keeps its opportunity in Demo with attention, whatever an older check passed',
  opts,
  async () => {
    const w = await clientSendWorld()
    await w.pool.query(`update wo_build set state='done', qa=qa||'{"state":"passed"}'::jsonb`)
    await w.pool.query("update wo_demo_action set status='failed', error='DEMO_STEP_TIMEOUT'")
    const row = (await listOpportunities(w.pool, w.account, { demoJourney: demoJourneySql })).rows[0]
    assert.deepEqual({ stage: row.stage, attention: row.attention }, { stage: 'demo', attention: true })
  }
)

test(
  'a blocked brief starts no build: the action stops BRIEF_NOT_READY and the revision keeps its owner questions',
  opts,
  async () => {
    // The fictional restaurant of these worlds has no photo at all: measured, its brief blocks.
    const w = await world({ readiness: 'measured' })
    await w.accept()
    await w.runner().drain()
    const action = (await w.pool.query('select status, error from wo_demo_action')).rows[0]
    assert.deepEqual([action.status, action.error], ['failed', 'BRIEF_NOT_READY'])
    assert.equal(w.creates(), 0, 'the create door was never asked')
    assert.equal((await w.pool.query('select id from wo_build')).rowCount, 0)
    const { readiness } = (await w.pool.query('select brief from wo_revision')).rows[0].brief
    assert.equal(readiness.verdict, 'block')
    const blocked = readiness.checks.filter((c) => c.verdict === 'block').map((c) => c.id)
    assert.ok(blocked.includes('own-usable-photos'), blocked.join(', '))
    assert.ok(readiness.ownerQuestions.some((q) => q.id === 'owner.photos'))
  }
)

test('a warned brief builds and its build carries the owner questions', opts, async () => {
  const warned = {
    version: 'brief-readiness/1',
    verdict: 'warn',
    next: 'build-and-ask',
    checks: [{ id: 'people-with-portrait', verdict: 'warn', measured: { people: 1, portrayed: 0 } }],
    ownerQuestions: [
      { id: 'owner.portraits', field: 'portraits', question: 'Can you send a portrait photo of Ines Marlow?' }
    ]
  }
  const w = await world({ readiness: warned })
  await w.accept()
  await w.runner().drain()
  assert.equal(w.creates(), 1, 'the build went ahead')
  const build = (await w.pool.query('select receipt from wo_build')).rows[0]
  assert.deepEqual(build.receipt.readiness, {
    verdict: 'warn',
    next: 'build-and-ask',
    checks: ['people-with-portrait'],
    ownerQuestions: warned.ownerQuestions
  })
  // After the build, each QA round says what the live site shows of the brief; this host judged neither site check.
  const { qa } = (await w.pool.query('select qa from wo_build')).rows[0]
  const [rpcId] = w.messages.keys()
  await w.pool.query(
    `insert into site_turn(turn_id,site_key,session_id,turn,actor,title,state,rpc_id,opened_at,closed_at)
     values ('demo-turn-1','pho-ba.localhost',$1,1,'builder@test.example','Build demo','closed',$2,$3,$3)`,
    [qa.sessionId, rpcId, new Date(w.deps.now())]
  )
  assert.equal((await claimAndRunQa(w.pool, w.deps)).ran, 1)
  const round = (await w.pool.query('select qa from wo_build')).rows[0].qa.rounds.at(-1)
  assert.equal(round.readiness.verdict, 'unknown')
  assert.deepEqual(round.readiness.brief, {
    verdict: 'warn',
    checks: [{ id: 'people-with-portrait', verdict: 'warn', on: 'brief' }]
  })
})
