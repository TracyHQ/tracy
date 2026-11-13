// The engine rules a revision run keeps (#599): the run record of one plan is never resumed by another
// (`write_record_stale`); a build that cannot be revised stops typed before any model call; a failing door is redone
// once, then the run stops typed with its report and resumes to the same site; a held name is gone from every place
// of the site after the revision; every apply id of a revision names its revision and its write, so neither the old
// build nor the same revision before a restore is mistaken for it; the frame runs a revision as a run kind.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-guards.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { namesHeldInAnyForm } from 'website-opportunities/domain/plan-withheld.mjs'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { restoreBuild } from '../src/step-chain-draft-restore.js'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { runRevisionWrite } from '../src/step-chain-draft-write-revision.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import { HELD_PERSON, revisedBy, SITE_NAME } from './draft-revision-edits.mjs'
import { ACCOUNT, blankSite, DRAFT, depsOf, draftOf, revisionModel } from './draft-revision-fixtures.mjs'
import { firstBuild, freshBuild, leakOf, revisionRun, sameSite } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const storedOf = (order) =>
  Object.fromEntries(
    [...order.pictures.map((p) => p.frame), ...order.icons.map((i) => i.id)].map((id) => [
      id,
      { id: `stored-${id}` }
    ])
  )

test('the previous build record never runs another plan; a revision record never runs another revision', async () => {
  const first = await firstBuild()
  const partial = await revisionRun(first, revisedBy('rename a service'))
  const order = partial.run.order.order
  const plan = writePlanOf(order, partial.run.kit.aiq, { stored: storedOf(order) })
  const calls = first.memory.calls
  const old = { state: structuredClone(first.builds.get(first.ref).write.state) }
  const run = (record) =>
    runDraftWrite({ plan, doors: first.memory.doors, record, openStored: async () => ({}) })
  const stale = await run(old).catch((e) => e)
  assert.equal(stale.code, 'write_record_stale')
  assert.deepEqual(stale.report.stale.revision, 1)
  // The revision run's own record, given to a run of revision 3: refused, nothing written.
  const third = revisedBy('rename a page')
  third.plan.revision = 3
  const again = await revisionRun(first, third, {
    record: structuredClone(partial.record),
    runId: 'run-larkspur-3'
  })
  assert.equal(again.error.code, 'write_record_stale')
  assert.equal(first.memory.calls, calls)
})

test('a write plan that drops an operation of the previous build stops typed before any door', async () => {
  const first = await firstBuild()
  const partial = await revisionRun(first, revisedBy('rename a service'))
  const order = partial.run.order.order
  const plan = writePlanOf(order, partial.run.kit.aiq, { stored: storedOf(order) })
  const gone = plan.ops.find((op) => op.kind === 'article.create')
  const cut = { ...plan, ops: plan.ops.filter((op) => op !== gone) }
  const calls = first.memory.calls
  const out = await runRevisionWrite({
    plan: cut,
    previous: first.builds.get(first.ref).write,
    doors: first.memory.doors,
    record: {},
    runId: 'run-larkspur-cut',
    openStored: async () => ({})
  }).catch((e) => e)
  assert.equal(out.code, 'revision_needs_removal')
  assert.equal(out.noRerun, true)
  assert.equal(first.memory.calls, calls)
})

test('a build that cannot be revised stops typed, noRerun, before any model call or door', async () => {
  const first = await firstBuild()
  const cases = [
    ['previous_build_missing', (b) => b.delete(first.ref)],
    ['previous_build_other_kit', (b) => Object.assign(b.get(first.ref), { kit: 'ja-boxing@1.0.12' })],
    ['previous_build_unfinished', (b) => Object.assign(b.get(first.ref), { status: 'failed' })]
  ]
  for (const [code, spoil] of cases) {
    const builds = new Map([...first.builds].map(([k, v]) => [k, structuredClone(v)]))
    spoil(builds)
    const out = await revisionRun({ ...first, builds }, revisedBy('rename a service'))
    assert.equal(out.error?.code, code)
    assert.equal(out.error.noRerun, true)
    assert.deepEqual([out.model.calls.length, out.writes], [0, 0], code)
  }
})

test('a failing door is redone once; twice stops typed with the report, and the same record resumes to the same site', async () => {
  const first = await firstBuild({ memory: blankSite({ fail: [63, 64] }) })
  const revised = revisedBy('rename a service')
  const record = {}
  const failed = await revisionRun(first, revised, { record })
  assert.equal(failed.error.code, 'redo_failed')
  assert.equal(failed.error.noRerun, true)
  assert.equal(failed.error.report.failed.code, 'door_failed')
  const resumed = await revisionRun(first, revised, { record })
  assert.equal(resumed.run.write.report.status, 'done')
  const fresh = await freshBuild(revised)
  assert.ok(sameSite(first.memory, fresh.memory))
  const once = await firstBuild({ memory: blankSite({ fail: [63] }) })
  assert.equal((await revisionRun(once, revised)).run.write.report.status, 'done')
})

test('a name held after the build is gone from every record, slot and identity value of the site', async () => {
  const site1 = await firstBuild({ leak: leakOf(HELD_PERSON) })
  assert.ok(namesHeldInAnyForm([JSON.stringify(site1.snapshot)], [HELD_PERSON]))
  const out = await revisionRun(site1, revisedBy('hold a reviewer'))
  assert.equal(out.run.write.report.status, 'done')
  const shown = snapshotOf(site1.memory)
  assert.ok(!JSON.stringify(shown).includes('Wenna'))
  assert.ok(
    out.run.plan.revision.impact.write.find((w) => w.page === 'contact').reasons.includes('held_text_in_copy')
  )
  const name = await firstBuild()
  const held = await revisionRun(name, revisedBy('hold the business name'))
  assert.equal(held.run.write.report.status, 'done')
  const text = JSON.stringify(snapshotOf(name.memory))
  assert.ok(!namesHeldInAnyForm([text], ['Larkspur Blooms']))
  assert.ok(text.includes(SITE_NAME))
})

/** The memory site's doors, with every apply id they were sent. */
function spied(memory) {
  const ids = []
  const doors = { ...memory.doors }
  for (const name of ['update', 'contract', 'upload', 'identity'])
    doors[name] = (call) => (ids.push(call.applyId), memory.doors[name](call))
  return {
    ...memory,
    doors,
    ids,
    get calls() {
      return memory.calls
    },
    site: memory.site
  }
}

test('apply ids name the revision and the write: the old build, or the revision before a restore, is never replayed', async () => {
  const memory = spied(blankSite())
  // One run id for every run on this site: the apply ids still differ by revision and by write.
  const first = await firstBuild({ memory, runId: 'run-larkspur' })
  const built = new Set(memory.ids)
  const revised = revisedBy('rename a service')
  const rev = await revisionRun(first, revised, { runId: 'run-larkspur' })
  const sent = memory.ids.slice(built.size)
  assert.ok(sent.length > 0)
  for (const id of sent) assert.ok(id.startsWith('run-larkspur:r2:w2:') && !built.has(id), id)
  const renamed = snapshotOf(memory)
  const restored = await restoreBuild({
    build: first.builds.get(rev.run.write.build.ref),
    previous: first.builds.get(first.ref),
    doors: memory.doors,
    record: {},
    runId: 'run-larkspur'
  })
  assert.deepEqual(snapshotOf(memory), first.snapshot)
  // The same revision again from the restored build (its write count past the revision's): renamed again, for real.
  first.builds.set(first.ref, restored.current)
  const count = memory.ids.length
  const again = await revisionRun(first, revised, { runId: 'run-larkspur' })
  assert.equal(again.run.write.report.status, 'done')
  for (const id of memory.ids.slice(count)) assert.ok(id.startsWith('run-larkspur:r2:w4:'), id)
  assert.deepEqual(snapshotOf(memory), renamed)
})

const records = mkdtempSync(path.join(tmpdir(), 'draft-revision-'))
after(() => rmSync(records, { recursive: true, force: true }))

test('the frame runs a revision as a run kind: brief.rebuildFrom names the build, the write keeps the new one', async () => {
  const first = await firstBuild()
  const revised = revisedBy('rename a service')
  const model = revisionModel()
  const deps = depsOf({ draft: draftOf(revised), model, memory: first.memory, builds: first.builds })
  const steps = createStepChainSteps({
    pool: {},
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: records,
    draft: deps
  })
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({}) })
  const ctx = {
    runId: 'run-larkspur-frame',
    accountId: ACCOUNT,
    email: 'owner@larkspur.example',
    brief: { draftId: DRAFT, plan: { id: revised.plan.id, revision: 2 }, rebuildFrom: first.ref },
    signal: new AbortController().signal,
    progress: async () => {}
  }
  const run = await engine.prepare(ctx)
  const done = await engine.apply(ctx, run)
  assert.ok(done.wrote > 0)
  assert.equal(first.builds.get('run-larkspur-frame:r2:w2').previous, first.ref)
  assert.deepEqual(Object.keys(model.pages).sort(), ['class', 'classes', 'home'])
})
