// The three seams of a built site's update, restore and abandon (#612, `build-draft-rebuild-wiring.js`): `startRun`
// (`step-chain-draft-rerun.js`) hands the run frame a run on the built site, or refuses typed; `siteDoorsFor`
// (`step-chain-draft-site.js`) is the door client over the run's Apply door, null without one; `runRecordOf`
// (`step-chain-draft-run-records.js`) reads an unfinished run's saved record back, so an abandon works after a
// restart. The frame and the rows are doubles here (the row statements need Postgres:
// `step-chain-draft-rerun-row.test.mjs`). Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-rerun.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftRebuild } from '../src/build-draft-rebuild-wiring.js'
import { memoryBuildStore } from '../src/step-chain-draft-builds.js'
import { draftRunStarter } from '../src/step-chain-draft-rerun.js'
import { memoryRunRecords, runRecordReader } from '../src/step-chain-draft-run-records.js'
import { siteDoorsFor } from '../src/step-chain-draft-site.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { firstBuild } from './draft-revision-run.mjs'
import { FIRST, uploadsLeft } from './draft-revision-sweep.mjs'
import { applyOverMemory, memorySiteDoors } from './draft-site-doors-memory.mjs'
import { EMAIL, siteRevision, SITE_KEY } from './step-chain-draft-rebuild-run.mjs'
import { buildStoreOf } from './draft-revision-fixtures.mjs'

const ACCOUNT = 'account-larkspur'
const brief = (over = {}) => ({
  workflow: 'step-chain/1',
  draftId: 'draft-larkspur-1',
  plan: { id: 'plan-larkspur', revision: 3 },
  rebuildFrom: 'run-1',
  buildRun: 'run-larkspur-2',
  ...over
})
const SITE_ROW = {
  platform: 'joomla',
  quickstart: 'quickstart/ja-boxing/j6',
  account_id: ACCOUNT,
  label: 'larkspur',
  quickstart_version: '1.0.11'
}

function starter({ frame, builds = memoryBuildStore(), row = SITE_ROW } = {}) {
  const asked = []
  const rerun = frame ?? (async (input) => (asked.push(input), { started: true }))
  const start = draftRunStarter({
    pool: null,
    briefs: () => ({ rerun }),
    builds,
    contractOf: (quickstart, version) => ({ id: `${quickstart}@${version}` }),
    siteOf: async (_pool, siteKey) => (siteKey === SITE_KEY ? row : null)
  })
  const run = (over = {}) =>
    start({
      accountId: ACCOUNT,
      email: EMAIL,
      siteKey: SITE_KEY,
      draftId: 'draft-larkspur-1',
      build: {},
      brief: brief(),
      ...over
    })
  return { run, asked, builds }
}

test('startRun hands the frame the run on the built site, under the update run id, with the site it was built for', async () => {
  const { run, asked } = starter()
  assert.deepEqual(await run(), { started: true })
  assert.equal(asked.length, 1)
  const [input] = asked
  assert.equal(input.runId, 'run-larkspur-2')
  assert.deepEqual(input.brief, brief())
  assert.deepEqual(
    [input.siteKey, input.accountId, input.email, input.platform, input.quickstart, input.label],
    [SITE_KEY, ACCOUNT, EMAIL, 'joomla', 'quickstart/ja-boxing/j6', 'larkspur']
  )
  assert.deepEqual(input.contract, { id: 'quickstart/ja-boxing/j6@1.0.11' })
})

test('startRun refuses while another run is unfinished on the site, and lets the same run resume', async () => {
  const builds = memoryBuildStore()
  const ctx = { siteKey: SITE_KEY }
  assert.equal(await builds.begin({ runId: 'run-other', from: 'run-1' }, ctx), true)
  const { run, asked } = starter({ builds })
  assert.deepEqual(await run(), { refusal: { code: 'previous_run_unfinished', status: 409 } })
  assert.equal(asked.length, 0)
  assert.deepEqual(await run({ brief: brief({ buildRun: 'run-other' }) }), { started: true })
})

test('startRun refuses typed: no frame, a brief with no build, a site not built, another account, a run going', async () => {
  const none = draftRunStarter({ pool: null, briefs: () => null, builds: memoryBuildStore() })
  assert.equal((await none({ siteKey: SITE_KEY, brief: brief() })).refusal.code, 'REVISION_RUN_UNAVAILABLE')
  const { run } = starter()
  assert.equal((await run({ brief: brief({ rebuildFrom: null }) })).refusal.code, 'REVISION_BRIEF_INVALID')
  assert.equal((await run({ brief: brief({ buildRun: '' }) })).refusal.code, 'REVISION_BRIEF_INVALID')
  assert.deepEqual((await run({ siteKey: 'site-unknown' })).refusal, { code: 'NOT_BUILT', status: 409 })
  assert.deepEqual((await run({ accountId: 'account-other' })).refusal, {
    code: 'NOT_THIS_ACCOUNT',
    status: 403
  })
  const busy = starter({ frame: async () => ({ started: false, code: 'RUN_IN_PROGRESS' }) })
  assert.deepEqual((await busy.run()).refusal, { code: 'RUN_IN_PROGRESS', status: 409 })
  const noStore = draftRunStarter({
    pool: null,
    briefs: () => ({ rerun: async () => ({ started: true }) }),
    builds: {}
  })
  assert.equal(
    (await noStore({ siteKey: SITE_KEY, brief: brief() })).refusal.code,
    'previous_build_doors_missing'
  )
})

test('siteDoorsFor: null with no door client; with one, every call goes out as the owner under the run id', async () => {
  const memory = blankSite()
  const over = applyOverMemory(memory)
  assert.equal(
    await siteDoorsFor({ site: {}, applyFor: over.applyFor })({
      siteKey: SITE_KEY,
      email: EMAIL,
      runId: 'r'
    }),
    null
  )
  assert.equal(
    await siteDoorsFor({ site: { siteDoors: memorySiteDoors(memory) } })({
      siteKey: SITE_KEY,
      email: EMAIL,
      runId: 'r'
    }),
    null
  )
  const doors = await siteDoorsFor({ site: { siteDoors: memorySiteDoors(memory) }, applyFor: over.applyFor })(
    {
      siteKey: SITE_KEY,
      email: EMAIL,
      runId: 'restore-1'
    }
  )
  assert.equal(typeof doors.update, 'function')
  await doors.readIdentity()
  assert.deepEqual(
    over.calls.map((c) => [c.email, c.setupRun, c.siteKey]),
    [[EMAIL, 'restore-1', SITE_KEY]]
  )
})

test('the wiring abandons a crashed revision after a restart: runRecordOf reads the kept record, the doors write it back', async () => {
  const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + 2 } }) })
  const runRecords = memoryRunRecords()
  const crashed = await siteRevision(first, revisedBy('rename a service'), {
    runId: 'run-larkspur-2',
    runRecords
  })
  assert.equal(crashed.error?.code, 'crash')
  const over = applyOverMemory(first.memory)
  const builds = buildStoreOf(first.builds)
  const wired = draftRebuild({
    builds,
    runRecordOf: runRecordReader(runRecords),
    siteDoorsFor: siteDoorsFor({
      site: { siteDoors: memorySiteDoors(first.memory) },
      applyFor: over.applyFor
    })
  })
  const out = await wired.abandonSite({
    siteKey: SITE_KEY,
    email: EMAIL,
    run: 'run-larkspur-2',
    runId: 'abandon-1',
    ctx: { siteKey: SITE_KEY }
  })
  assert.equal(out.status, 'done')
  assert.deepEqual(uploadsLeft(first.memory, first.snapshot, out.left.uploads), first.snapshot)
  assert.equal(first.builds.unfinishedRun, null)
  assert.ok(over.calls.length > 0 && over.calls.every((c) => c.setupRun === 'abandon-1' && c.email === EMAIL))
})
