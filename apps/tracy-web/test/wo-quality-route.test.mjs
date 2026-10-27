import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { mintSession } from '../src/lib/session.js'
import { acceptQualityIntent } from '../src/opportunities-build/quality-intents.js'
import { qualityEvidenceOf, qualityEvidenceRoutes } from '../src/opportunities-build/quality-route.js'
import { qualityRunStore } from '../src/opportunities-build/quality-runs.js'
import { fileDb } from './_db.mjs'

const db = fileDb(),
  opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
test(
  'external evidence and Stop stay owner-scoped and acknowledge authority before reporting cancellation',
  opts,
  async () => {
    const { run, account, cookie, store } = await world()
    let resolveStop, reachedStop
    const gate = new Promise((resolve) => {
      resolveStop = resolve
    })
    const reached = new Promise((resolve) => {
      reachedStop = resolve
    })
    let acknowledged = false
    const app = qualityEvidenceRoutes({
      pool: db.pool,
      config,
      readEvidence: async (identity) => {
        assert.equal(identity.accountId, account.id)
        return qualityEvidenceOf(db.pool, identity)
      },
      cancelRun: async (id, accountId) => {
        assert.equal(id, run.id)
        assert.equal(accountId, account.id)
        reachedStop()
        await gate
        acknowledged = true
        await store.cancel(id, accountId)
      }
    })
    const pending = app.request(`/api/website-opportunities/quality/runs/${run.id}/cancel`, {
      method: 'POST',
      headers: { cookie, origin: config.origin }
    })
    await reached
    assert.equal(acknowledged, false)
    assert.notEqual(
      (await db.pool.query('select state from wo_quality_run where id=$1', [run.id])).rows[0].state,
      'cancelled'
    )
    resolveStop()
    const response = await pending
    assert.equal(response.status, 200)
    assert.equal((await response.json()).state, 'cancelled')
    assert.equal(acknowledged, true)
  }
)
const config = { origin: 'https://quality.localhost', sessionSecret: 's'.repeat(32) }
async function world() {
  const account = (
    await db.pool.query("insert into account(email)values('quality-owner@example.test')returning *")
  ).rows[0]
  const opportunityId = randomUUID(),
    revisionId = randomUUID()
  const policy = { maxAttempts: 64, maxRunMs: 7200000, accountDailyCapCents: 400, jobCapCents: 200 }
  const root = await acceptQualityIntent(db.pool, {
    accountId: account.id,
    opportunityId,
    semanticInput: { snapshot: 'synthetic' },
    policy
  })
  const store = qualityRunStore({ pool: db.pool })
  const run = await store.prepare({
    accountId: account.id,
    opportunityId,
    revisionId,
    intentId: root.id,
    policy,
    input: {
      schemaVersion: 'tracy-wo-input/v1',
      models: {
        plan: {
          role: 'plan',
          model: 'synthetic-model',
          apiKey: 'never-public',
          reasoning: { effort: 'high' }
        }
      }
    }
  })
  const cookie = `tracy_sess=${await mintSession(account.email, config.sessionSecret)}`
  return { run, store, root, account, cookie, app: qualityEvidenceRoutes({ pool: db.pool, config }) }
}
test(
  'quality evidence requires the actual owner and exposes safe model metadata with private no-store caching',
  opts,
  async () => {
    const { run, app, cookie } = await world(),
      url = `/api/website-opportunities/quality/runs/${run.id}`
    assert.equal((await app.request(url)).status, 401)
    const other = `tracy_sess=${await mintSession('other@example.test', config.sessionSecret)}`
    assert.equal((await app.request(url, { headers: { cookie: other } })).status, 404)
    const response = await app.request(url, { headers: { cookie } }),
      body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(body.run.modelConfigs.plan.reasoning.effort, 'high')
    assert.equal(JSON.stringify(body).includes('never-public'), false)
    assert.equal(body.cost.spentCents, 0)
    const html = await app.request(body.links.page + '?lang=vi', { headers: { cookie } })
    assert.equal(html.status, 200)
    assert.match(await html.text(), /<html[^>]+lang="vi"/)
  }
)
test(
  'Stop checks origin, closes every revision under the shared intent and retains held money',
  opts,
  async () => {
    const { run, root, app, cookie, store, account } = await world()
    const sibling = await store.prepare({
      accountId: account.id,
      opportunityId: run.opportunity_id,
      revisionId: randomUUID(),
      intentId: root.id,
      policy: run.policy,
      input: { retry: 'same-root' }
    })
    await db.pool.query(
      `insert into wo_cost_ledger(budget_day,provider,operation,reserved_cents,state,job_id,account_id)
    values(current_date,'synthetic','unknown',7,'unreconciled',$1,$2)`,
      [root.id, account.id]
    )
    const path = `/api/website-opportunities/quality/runs/${run.id}/cancel`
    assert.equal(
      (await app.request(path, { method: 'POST', headers: { cookie, origin: 'https://elsewhere.invalid' } }))
        .status,
      403
    )
    const response = await app.request(path, {
      method: 'POST',
      headers: { cookie, origin: config.origin, accept: 'text/html' }
    })
    assert.equal(response.status, 303)
    assert.equal(
      (await db.pool.query('select state from wo_quality_run where id=$1', [sibling.id])).rows[0].state,
      'cancelled'
    )
    assert.equal(
      (await db.pool.query('select reserved_cents,state from wo_cost_ledger where job_id=$1', [root.id]))
        .rows[0].state,
      'unreconciled'
    )
  }
)
