// Which build a site holds, and who may write on it (#599): a full build on a site that already holds a build stops
// before any model call (`site_already_built`), a first build and a build on a site reset to blank (no current build)
// run; two revisions racing from the same build never both end done (the second to reach the site stops before any
// door, `previous_run_unfinished`), and a build is kept as the site's build only over the build it started from
// (compare and set, `previous_build_not_current`, the build not recorded as current).
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-site-build.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite, draftOf, revisionModel, runBuild, site, stepsOf } from './draft-revision-fixtures.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'

const approved = () => ({
  plan: structuredClone(site.build.approval.plan),
  profile: structuredClone(site.build.approval.profile)
})

/** A full build (no `rebuildFrom`) of `draft` on `memory` with the build store `builds`. */
async function fullBuild(draft, memory, builds, runId = 'run-full') {
  const model = revisionModel()
  const before = memory.calls
  try {
    const run = await runBuild({
      steps: stepsOf({ draft: draftOf(draft), model, memory, builds }),
      plan: draft.plan,
      runId
    })
    return { run, model, writes: memory.calls - before }
  } catch (error) {
    return { error, model, writes: memory.calls - before }
  }
}

test('a full build on a site that holds a build stops before any model call; a blank site builds', async () => {
  const first = await firstBuild()
  const again = await fullBuild(revisedBy('change the phone'), first.memory, first.builds)
  assert.equal(again.error?.code, 'site_already_built')
  assert.equal(again.error?.details?.current, first.ref)
  assert.deepEqual([again.model.calls.length, again.writes], [0, 0])
  // A site reset to blank: the caller's store holds no current build for it.
  const fresh = await fullBuild(revisedBy('change the phone'), blankSite(), new Map())
  assert.equal(fresh.error, undefined, fresh.error?.code)
})

test('two revisions racing from the same build: one ends done, the other stops before any door', async () => {
  const first = await firstBuild()
  const before = first.memory.calls
  const [a, b] = await Promise.all([
    revisionRun(first, revisedBy('change the phone'), { runId: 'run-a' }),
    revisionRun(first, revisedBy('rename a service'), { runId: 'run-b' })
  ])
  const done = [a, b].filter((r) => !r.error)
  const stopped = [a, b].filter((r) => r.error)
  assert.equal(done.length, 1)
  assert.equal(stopped[0].error.code, 'previous_run_unfinished')
  assert.equal(first.builds.currentRef, done[0].run.write.build.ref)
  assert.equal(first.memory.calls - before, done[0].writes)
})

test('a run re-checks the site build right before its first door call', async () => {
  const first = await firstBuild()
  const other = await revisionRun(first, revisedBy('change the phone'), { runId: 'run-a' })
  const builds = first.builds
  const real = builds.currentRef
  builds.currentRef = first.ref
  const steps = stepsOf({
    draft: draftOf(revisedBy('rename a service')),
    model: revisionModel(),
    memory: first.memory,
    builds
  })
  const write = steps.write
  // The store moves on after the plan step: another run kept its build.
  steps.write = async (ctx, inputs) => {
    builds.currentRef = real
    return write(ctx, inputs)
  }
  const before = first.memory.calls
  const late = await runBuild({
    steps,
    plan: revisedBy('rename a service').plan,
    runId: 'run-b',
    rebuildFrom: first.ref
  }).catch((e) => e)
  assert.equal(late.code, 'previous_build_not_current')
  assert.equal(first.memory.calls, before)
  assert.equal(builds.currentRef, other.run.write.build.ref)
})

test('a build is kept as the site build only over the build it started from (compare and set)', async () => {
  const first = await firstBuild()
  const other = await revisionRun(first, revisedBy('change the phone'), { runId: 'run-a' })
  const builds = first.builds
  const real = builds.currentRef
  builds.currentRef = first.ref
  // The store moves on while the run writes: right after the run marked itself unfinished.
  let mark = null
  Object.defineProperty(builds, 'unfinishedRun', {
    get: () => mark,
    set: (run) => {
      mark = run
      if (run?.runId === 'run-b') builds.currentRef = real
    }
  })
  const late = await revisionRun(first, revisedBy('rename a service'), { runId: 'run-b' })
  assert.equal(late.error?.code, 'previous_build_not_current')
  assert.ok(late.writes > 0)
  assert.equal(builds.currentRef, other.run.write.build.ref)
  assert.ok(![...builds.keys()].some((ref) => ref.startsWith('run-b')))
})

test('the first build of a site and a revision of it run as before', async () => {
  const first = await firstBuild({ approved: approved() })
  assert.equal(first.builds.currentRef, first.ref)
  const rev = await revisionRun(first, revisedBy('change the phone'))
  assert.equal(rev.error, undefined, rev.error?.code)
  assert.equal(first.builds.currentRef, rev.run.write.build.ref)
  assert.equal(first.builds.unfinishedRun, null)
})
