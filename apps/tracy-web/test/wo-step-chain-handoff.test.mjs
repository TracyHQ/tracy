// The Website Opportunities Build press hands a template that is on the step chain to the chain (#479): the site is
// created with the chain workflow and the frozen research revision, and no chat turn is sent for it.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { acceptDemoActions } from '../src/opportunities-build/demo-actions.js'
import { createDemoRunner } from '../src/opportunities-build/demo-runner.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { fileDb } from './_db.mjs'

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
async function world(template) {
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
  const press = () =>
    acceptDemoActions(pool, {
      accountId: account,
      entries: [
        {
          opportunityId: opportunity,
          requestId: 'press-once',
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
    await pool.query('update wo_demo_action set next_at=$1', [new Date(at - 1)])
    await createDemoRunner(deps).drain()
  }
  return { pool, press, run, created, messages }
}

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
  }
)

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
