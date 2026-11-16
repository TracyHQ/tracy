// A whole draft run through the real frame and the real steps (#597), its write step on the REAL wiring
// (`step-chain-draft-site.js`) and transport (`step-chain-draft-send.js`) over the Apply door the engine hands it,
// the door client a stand-in behind the same factory seam (`draft-site-doors-memory.mjs`: the invented JA Boxing
// florist on a blank site in memory). The build ends `complete`, every call is the setup run's, every apply id is kept
// on the run's row, the site ends as a run on the memory doors leaves it, and no held text reaches any payload.
// Without a door factory the step still stops typed.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-site.test.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { heldFormsOf, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import { HELD_PERSON, revisedBy } from './draft-revision-edits.mjs'
import {
  ACCOUNT,
  blankSite,
  DRAFT,
  depsOf,
  draftOf,
  revisionModel,
  site
} from './draft-revision-fixtures.mjs'
import { applyOverMemory, memorySiteDoors } from './draft-site-doors-memory.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'
import { pool, records } from './step-chain-draft-harness.mjs'

const EMAIL = 'owner@larkspur-florist.example'
const SITE = 'site-larkspur-1'

/** The engine over the real steps; the draft deps of the revision fixtures without their injected doors. */
function engineOf({ draft, memory, site: siteWiring }) {
  const over = applyOverMemory(memory)
  const { draftWrite, ...deps } = depsOf({ draft, model: revisionModel(), memory })
  // The fixtures' fixed clock: created articles are dated from it, so two runs compare equal.
  const wired = { ...deps, site: { now: draftWrite.now, ...siteWiring(over, draftWrite, memory) } }
  const steps = createStepChainSteps({
    pool,
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: records,
    draft: wired
  })
  return { over, engine: createStepChainEngine({ steps, applyFor: over.applyFor }) }
}
/** The test pictures of the fixtures (every frame and icon stored), as a picture source of the site wiring. */
const fixturePictures = (over, draftWrite, memory) => ({
  siteDoors: memorySiteDoors(memory),
  publicFile: over.publicFile,
  filePresence: over.filePresence,
  blankContract: () => site.kit.blankContract,
  pictures: { stored: (order) => draftWrite.stored(order), openStored: (id) => draftWrite.openStored(id) }
})

// Each build its own run id: the frame keeps a run's step values in its record folder by run id, and a second build
// under one id resumes the first one's values.
async function build({ draft = draftOf(), memory = blankSite(), site: siteWiring = fixturePictures } = {}) {
  const RUN = randomUUID()
  const { over, engine } = engineOf({ draft, memory, site: siteWiring })
  const applied = []
  const plan = draft.approved.plan
  const ctx = {
    runId: RUN,
    accountId: ACCOUNT,
    email: EMAIL,
    siteKey: SITE,
    brief: { draftId: DRAFT, plan: { id: plan.id, revision: plan.revision } },
    signal: new AbortController().signal,
    progress: async () => {},
    applied: (id) => applied.push(id)
  }
  let prepared = null
  const outcome = await (async () =>
    (prepared = await engine.prepare(ctx)) && engine.apply(ctx, prepared))().then(
    (value) => ({ value }),
    (error) => ({ error })
  )
  return { run: RUN, over, memory, applied, prepared, outcome }
}

test('a draft run ends complete through the real wiring and transport, every call the setup run', async () => {
  const run = await build()
  assert.equal(run.outcome.error?.stop?.code, undefined, JSON.stringify(run.outcome.error?.stop ?? null))
  assert.equal(run.outcome.value.chain.ending, 'complete')
  const write = run.prepared.record.filter((line) => line.step === 'write')
  assert.deepEqual(
    write.map((l) => l.outcome),
    ['done']
  )
  assert.ok(run.over.calls.length > 0)
  for (const call of run.over.calls) {
    assert.equal(call.setupRun, run.run)
    assert.equal(call.email, EMAIL)
    assert.equal(call.siteKey, SITE)
  }
  // Every apply id a write named is on the run's row (`recordedDoor`), so the whole build can be undone.
  const named = run.over.calls.map((c) => c.params?.apply_id).filter(Boolean)
  assert.deepEqual([...new Set(run.applied)].sort(), [...new Set(named)].sort())
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
  const ctx = {
    runId: randomUUID(),
    accountId: ACCOUNT,
    email: EMAIL,
    brief: {
      draftId: DRAFT,
      plan: { id: draftOf().approved.plan.id, revision: draftOf().approved.plan.revision }
    },
    signal: new AbortController().signal,
    progress: async () => {}
  }
  await direct.apply(ctx, await direct.prepare(ctx))
  assert.deepEqual(snapshotOf(run.memory), snapshotOf(reference))
})

for (const hold of ['hold a reviewer', 'hold the business name'])
  test(`${hold}: no held text reaches any payload of the Apply door`, async () => {
    const name = site.build.approval.plan.facts.find((f) => f.id === 'business-name')?.value
    const held = revisedBy(hold)
    const run = await build({ draft: draftOf({ plan: held.plan, profile: held.profile }) })
    assert.equal(run.outcome.value?.chain?.ending, 'complete', run.outcome.error?.stop?.code)
    assert.ok(run.over.calls.length > 0)
    const forms = heldFormsOf(hold === 'hold a reviewer' ? { people: [HELD_PERSON] } : { names: [name] })
    assert.ok(forms.length > 0 && typeof name === 'string')
    const leaked = run.over.calls.filter((c) => namesAnyIn(c.params, forms))
    assert.deepEqual(
      leaked.map((c) => c.action),
      []
    )
  })

test('without a door factory the write step still stops typed, one attempt, nothing written', async () => {
  const run = await build({ site: (over) => ({ publicFile: over.publicFile }) })
  assert.equal(run.outcome.error?.stop?.code, 'write_not_ready_for_draft')
  assert.equal(run.over.calls.length, 0)
})

test('with the real stored pictures a frame with no stored bytes stops the build at the guard, before any door', async () => {
  const run = await build({
    site: (over, _, memory) => ({
      siteDoors: memorySiteDoors(memory),
      publicFile: over.publicFile,
      blankContract: () => site.kit.blankContract
    })
  })
  // The fixture's generated frames have no stored bytes (no generator stores them yet): typed, nothing called.
  assert.equal(run.outcome.error?.stop?.code, 'picture_not_stored')
  assert.equal(run.over.calls.length, 0)
})
