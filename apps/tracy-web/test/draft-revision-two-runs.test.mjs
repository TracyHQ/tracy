// Two revision runs of one site at once (#599): `builds.begin` is a compare and set on the site's build and the mark,
// so the run that begins second, from a build the first one has since replaced, stops before any write
// (`previous_build_not_current`) and marks nothing; and an abandon frees a site whose unfinished mark belongs to a run
// started from a build the site no longer holds, whether or not a door can undo that run. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-two-runs.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { memoryBuildStore } from '../src/step-chain-draft-builds.js'
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { revisedBy } from './draft-revision-edits.mjs'
import {
  blankSite,
  buildStoreOf,
  depsOf,
  draftOf,
  revisionModel,
  runBuild
} from './draft-revision-fixtures.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'
import { durable, FIRST, uploadsLeft } from './draft-revision-sweep.mjs'

const SITE = { siteKey: 'larkspur-blooms.example' }

test('the memory store begins a run only from the build the site holds, and one run at a time', async () => {
  const s = memoryBuildStore()
  assert.equal(await s.begin({ runId: 'run-2', from: 'run-1' }, SITE), false)
  assert.equal(await s.unfinished(SITE), null)
  await s.keep({ ref: 'run-1' }, SITE, { expected: null })
  assert.equal(await s.begin({ runId: 'run-2', from: 'run-1' }, SITE), true)
  assert.equal(await s.begin({ runId: 'run-3', from: 'run-1' }, SITE), false)
  assert.equal(await s.begin({ runId: 'run-2', from: 'run-1' }, SITE), true)
  await s.keep({ ref: 'run-0', previous: 'run-1' }, SITE, { expected: 'run-1' })
  // The build moved on: the marked run cannot be resumed from the build it started from.
  assert.equal(await s.begin({ runId: 'run-2', from: 'run-1' }, SITE), false)
})

test('two runs that read the same build: the one that begins second stops before any write', async () => {
  const first = await firstBuild()
  const store = buildStoreOf(first.builds)
  const stepsFor = (name, record, wait) => {
    const deps = depsOf({
      draft: draftOf(revisedBy(name)),
      model: revisionModel(),
      memory: first.memory,
      builds: first.builds,
      record
    })
    deps.builds = { ...store, begin: async (run, ctx) => (await wait?.(), store.begin(run, ctx)) }
    return createDraftSteps(deps)
  }
  const go = (name, runId, record, wait) =>
    runBuild({
      steps: stepsFor(name, record, wait),
      plan: revisedBy(name).plan,
      runId,
      rebuildFrom: first.ref
    })
  const a = go('rename a service', 'run-a', {})
  // B read the first build as the site's build, and reaches its begin only once A is done.
  const lateRecord = {}
  const calls = { at: 0 }
  const b = go('change the phone', 'run-b', lateRecord, async () => {
    await a.catch(() => {})
    calls.at = first.memory.calls
  })
  const [won, lost] = await Promise.allSettled([a, b])
  assert.equal(won.value?.write.report.status, 'done')
  assert.equal(lost.reason?.code, 'previous_build_not_current')
  assert.equal(first.memory.calls, calls.at, 'the losing run wrote nothing')
  assert.equal(Object.keys(lateRecord.state?.undo?.records ?? {}).length, 0)
  assert.equal(first.builds.unfinishedRun ?? null, null)
  assert.equal(first.builds.currentRef, won.value.write.build.ref)
  // The site is free: the next revision runs from the winner's build.
  const next = await revisionRun(first, revisedBy('change the phone'), {
    runId: 'run-c',
    from: won.value.write.build.ref
  })
  assert.notEqual(next.error?.code, 'previous_run_unfinished')
})

/** A revision crashed at its `n`-th door call, then the site's build moved on under its mark. */
async function staleCrash(name, n) {
  const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + n } }) })
  const store = durable()
  const crashed = await revisionRun(first, revisedBy(name), { record: store.record })
  assert.equal(crashed.error?.code, 'crash')
  first.builds.currentRef = 'run-elsewhere:r2:w2'
  const out = await abandonRun({
    run: 'run-larkspur-2',
    runRecord: { state: store.saved() },
    doors: first.memory.doors,
    record: {},
    runId: 'abandon-1',
    builds: buildStoreOf(first.builds)
  })
  return { first, out }
}

test('an abandon frees a site whose unfinished run started from a build it no longer holds', async () => {
  const { first, out } = await staleCrash('change the phone', 2)
  assert.deepEqual([out.status, out.stale], ['done', true])
  assert.equal(first.builds.unfinishedRun ?? null, null)
  // What the run wrote is written back.
  assert.deepEqual(uploadsLeft(first.memory, first.snapshot, out.left.uploads), first.snapshot)
})

test('a stale run no door can undo is still freed, what stays reported', async () => {
  for (let n = 1; n < 30; n++) {
    const { first, out } = await staleCrash('add a service', n)
    assert.deepEqual([out.status, out.stale], ['done', true])
    assert.equal(first.builds.unfinishedRun ?? null, null)
    if (out.left.unrestored?.code !== 'restore_needs_removal') continue
    assert.ok(out.left.unrestored.made.length > 0)
    return
  }
  assert.fail('no crash point made a record')
})
