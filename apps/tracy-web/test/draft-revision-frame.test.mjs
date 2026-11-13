// The apply ids and the frame of a revision run (#599): every apply id of a revision names its revision and its
// write, so neither the old build nor the same revision before a restore is mistaken for it; the frame runs a revision
// as a run kind, and the write keeps the new build as the one the site holds.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-frame.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { ACCOUNT, blankSite, DRAFT, depsOf, draftOf, revisionModel } from './draft-revision-fixtures.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

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
  await restoreOf(first, first.builds.get(rev.run.write.build.ref), {
    doors: memory.doors,
    runId: 'run-larkspur'
  })
  assert.deepEqual(snapshotOf(memory), first.snapshot)
  // The restore kept the previous build again (its write count past the revision's) as the one the site holds: the
  // same revision again from it is renamed again, for real.
  assert.equal(first.builds.currentRef, first.ref)
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
  assert.equal(first.builds.currentRef, 'run-larkspur-frame:r2:w2')
  assert.deepEqual(Object.keys(model.pages).sort(), ['class', 'classes', 'home'])
})
