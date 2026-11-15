// A run on a site that is already built, through the run frame (#612, `sites/brief-build.js rerun`,
// `step-chain-draft-rerun-row.js`): the row of a built step chain site goes back to `queued` once, keeps its up mark
// so the frame does not wait for an install, the engine runs under the update's run id with the revision brief and
// the setup hold opened and closed around its writes, and the row ends as a first build's does. A row still going is
// refused. Real Postgres; the steps are scripted doubles. Invented data only.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-rerun-row.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { briefOf } from '../src/sites/brief-store.js'
import { builtSiteOf, rerunBrief } from '../src/step-chain-draft-rerun-row.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SITE = 'larkspur.tracy.test'
const FIRST = {
  workflow: STEP_CHAIN_WORKFLOW,
  draftId: 'draft-larkspur-1',
  plan: { id: 'plan-larkspur', revision: 1 }
}
const REVISION = {
  ...FIRST,
  plan: { id: 'plan-larkspur', revision: 2 },
  rebuildFrom: 'run-1',
  buildRun: 'run-larkspur-2'
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function builtSite(state = 'applied') {
  await db.pool.query(
    "insert into site (site_key, label, host, platform) values ($1, 'larkspur', 'local', 'joomla')",
    [SITE]
  )
  await db.pool.query(
    `insert into site_brief (site_key, account_id, platform, quickstart, brief, state, timings)
     values ($1, null, 'joomla', 'quickstart/ja-boxing/j6', $2::jsonb, $3, '{"provisionedAt": 1000, "chain": {"ending": "complete"}}'::jsonb)`,
    [SITE, JSON.stringify(FIRST), state]
  )
}

function frameWith(seen) {
  const ok = (value) => async () => ({ value, usd: 0 })
  const steps = {
    kit: ok({ ref: 'ja-boxing/j6/1.0.11' }),
    brand: ok({ file: 'brand-file.json' }),
    plan: async (ctx) => ((seen.ctx = ctx), { value: { file: 'plan.json' }, usd: 0 }),
    copy: ok({ file: 'site-copy.json' }),
    pictures: ok({ file: 'mapping.json' }),
    write: async () => ({ value: { report: { status: 'done' } }, usd: 0 }),
    dispose: async () => {}
  }
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: true }) })
  return createBriefBuilds({
    pool: db.pool,
    engines: { [STEP_CHAIN_WORKFLOW]: engine },
    normalize: async () => ({ name: 'Larkspur Florist', languages: [] }),
    log: { info() {}, warn() {}, error() {} },
    sleep: () => wait(1),
    pollMs: 1,
    recoverOnStart: false,
    rerunRow: rerunBrief,
    webroot: {
      open: async (ctx) => (seen.holds.push(['open', ctx.runId]), { held: true }),
      close: async (ctx) => (seen.holds.push(['close', ctx.runId]), { held: true })
    }
  })
}

const input = {
  siteKey: SITE,
  accountId: null,
  email: 'owner@larkspur-florist.example',
  label: 'larkspur',
  platform: 'joomla',
  quickstart: 'quickstart/ja-boxing/j6',
  contract: { id: 'ja-boxing/j6/1.0.11', dir: 'unused' },
  brief: REVISION,
  runId: 'run-larkspur-2'
}

test(
  'a built site runs again through the frame, under the update run id, without waiting for an install',
  opts,
  async () => {
    await builtSite()
    const seen = { holds: [] }
    const frame = frameWith(seen)
    assert.deepEqual(await frame.rerun(input), { started: true })
    assert.deepEqual(await frame.rerun(input), { started: false, code: 'RUN_IN_PROGRESS' })
    await frame.idle()
    const row = await briefOf(db.pool, SITE)
    assert.equal(row.state, 'applied')
    assert.equal(row.brief.buildRun, 'run-larkspur-2')
    assert.equal(row.timings.provisionedAt, 1000)
    assert.equal(row.timings.chain.ending, 'complete')
    assert.equal(seen.ctx.runId, 'run-larkspur-2')
    assert.equal(seen.ctx.brief.rebuildFrom, 'run-1')
    assert.deepEqual(seen.holds[0], ['open', 'run-larkspur-2'])
    assert.deepEqual(seen.holds.at(-1), ['close', 'run-larkspur-2'])
  }
)

test('a row still going, or a site with no step chain row, is not put back', opts, async () => {
  await builtSite('applying')
  assert.equal(await rerunBrief(db.pool, SITE, REVISION), false)
  await db.pool.query("update site_brief set state = 'failed' where site_key = $1", [SITE])
  assert.equal(await rerunBrief(db.pool, SITE, REVISION), true)
  assert.equal(await rerunBrief(db.pool, SITE, REVISION), false, 'once')
  assert.equal(await rerunBrief(db.pool, 'other.tracy.test', REVISION), false)
  assert.equal((await builtSiteOf(db.pool, SITE)).label, 'larkspur')
})
