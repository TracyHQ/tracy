// A whole draft run with the REAL door client (#597 over #585): the stored draft through the real frame and steps to the
// write step, whose doors are `siteDoors` (website-opportunities/domain/site-doors.mjs) over the real wiring
// (`step-chain-draft-site.js`, `step-chain-draft-doors.js`) and transport (`step-chain-draft-send.js`), the plugin an
// invented one over the blank site in memory (`draft-plugin-over-memory.mjs`, the invented florist). The stop
// `write_not_ready_for_draft` is gone; a door the site does not have stops typed naming it; the run's signal stops
// every call; and the next blocker of a real run is reproduced, not fixed.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-real-doors.test.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { siteDoors } from 'website-opportunities/domain/site-doors.mjs'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import {
  ACCOUNT,
  blankSite,
  DRAFT,
  depsOf,
  draftOf,
  revisionModel,
  site
} from './draft-revision-fixtures.mjs'
import { pluginOverMemory } from './draft-plugin-over-memory.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'
import { pool, records } from './step-chain-draft-harness.mjs'

const EMAIL = 'owner@larkspur-florist.example'
const SITE = 'site-larkspur-real-1'
/** Every operation the door client may send for a first build. */
const PLUGIN_OPERATIONS = new Set([
  'content.get',
  'content.update',
  'content.list',
  'content.contract',
  'media.upload',
  'site.identity'
])

/** The fixtures' test pictures (every frame and icon stored), the real door client, and `publicFile` unless `noFile`. */
const realWiring =
  ({ noFile = false, realPictures = false } = {}) =>
  (over, draftWrite) => ({
    siteDoors,
    ...(noFile ? {} : { publicFile: over.publicFile }),
    blankContract: () => site.kit.blankContract,
    ...(realPictures
      ? {}
      : {
          pictures: {
            stored: (order) => draftWrite.stored(order),
            openStored: (id) => draftWrite.openStored(id)
          }
        })
  })

async function build({ wiring = realWiring(), onCall, controller = new AbortController() } = {}) {
  const memory = blankSite()
  const over = pluginOverMemory(memory, { onCall: onCall && ((call, n) => onCall(call, n, controller)) })
  const draft = draftOf()
  const { draftWrite, ...deps } = depsOf({ draft, model: revisionModel(), memory })
  const steps = createStepChainSteps({
    pool,
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: records,
    draft: { ...deps, site: wiring(over, draftWrite) }
  })
  const engine = createStepChainEngine({ steps, applyFor: over.applyFor })
  const run = randomUUID()
  const plan = draft.approved.plan
  const ctx = {
    runId: run,
    accountId: ACCOUNT,
    email: EMAIL,
    siteKey: SITE,
    brief: { draftId: DRAFT, plan: { id: plan.id, revision: plan.revision } },
    signal: controller.signal,
    progress: async () => {},
    applied: () => {}
  }
  let prepared = null
  const outcome = await (async () =>
    (prepared = await engine.prepare(ctx)) && engine.apply(ctx, prepared))().then(
    (value) => ({ value }),
    (error) => ({ error })
  )
  const writes = prepared?.record?.filter((line) => line.step === 'write') ?? []
  return { run, over, memory, outcome, writes, stop: outcome.error?.stop ?? null }
}

test('a stored draft ends complete through the real door client: plugin operations only, the setup run', async () => {
  const r = await build()
  assert.equal(r.stop?.code, undefined, JSON.stringify(r.stop))
  assert.equal(r.outcome.value.chain.ending, 'complete')
  assert.deepEqual(
    r.writes.map((l) => l.outcome),
    ['done']
  )
  assert.ok(r.over.calls.length > 0)
  for (const call of r.over.calls) {
    assert.ok(PLUGIN_OPERATIONS.has(call.action), call.action)
    assert.equal(call.setupRun, r.run)
    assert.equal(call.email, EMAIL)
    assert.equal(call.siteKey, SITE)
  }
  // Every write is one the door client makes: a contract apply id starts `contract-`, others are the step's own.
  const applies = r.over.calls.filter(
    (c) => c.action === 'content.contract' && c.params.operation === 'apply'
  )
  for (const c of applies) assert.match(c.params.apply_id, /^contract-/)
  assert.ok(r.over.calls.some((c) => c.action === 'media.upload'))
  // The same site as the run on the memory doors of the fixtures leaves.
  const reference = blankSite()
  const steps = createStepChainSteps({
    pool,
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: records,
    draft: depsOf({ draft: draftOf(), model: revisionModel(), memory: reference })
  })
  const direct = createStepChainEngine({ steps, applyFor: () => async () => ({ ok: false }) })
  const plan = draftOf().approved.plan
  const ctx = {
    runId: randomUUID(),
    accountId: ACCOUNT,
    email: EMAIL,
    brief: { draftId: DRAFT, plan: { id: plan.id, revision: plan.revision } },
    signal: new AbortController().signal,
    progress: async () => {}
  }
  await direct.apply(ctx, await direct.prepare(ctx))
  assert.deepEqual(snapshotOf(r.memory), snapshotOf(reference))
})

test('no public file reader: the upload read back stops typed, naming the media door, one attempt', async () => {
  const r = await build({ wiring: realWiring({ noFile: true }) })
  assert.equal(r.stop?.code, 'door_not_available')
  assert.equal(r.stop?.details?.door, 'media')
  assert.match(String(r.stop?.details?.reason), /publicFile/)
  assert.equal(r.writes.length, 1)
  // The upload went out before its read back; nothing after the stop.
  assert.equal(r.over.calls.at(-1).action, 'media.upload')
})

test('the run stopped mid write: no plugin call goes out after the signal, the build ends stopped', async () => {
  const STOP_AT = 6
  const r = await build({
    onCall: (_call, n, controller) => n === STOP_AT && controller.abort(new Error('stopped'))
  })
  assert.equal(r.stop?.code, 'ABORTED')
  assert.equal(r.over.calls.length, STOP_AT)
  assert.notEqual(r.outcome.value?.chain?.ending, 'complete')
})

// THE NEXT BLOCKER of a real run, reproduced and NOT fixed here: with the doors wired, a draft whose plan has generated
// pictures stops at the write plan's guard, before any door, because no generator stores their bytes yet.
test('next blocker: with the real stored pictures the build stops picture_not_stored, before any door', async () => {
  const r = await build({ wiring: realWiring({ realPictures: true }) })
  assert.equal(r.stop?.step, 'write')
  assert.equal(r.stop?.code, 'picture_not_stored')
  assert.equal(r.over.calls.length, 0)
})
