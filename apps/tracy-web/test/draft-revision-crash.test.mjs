// The crash sweep of a revision run and of its restore (#599): the process dies at every door call of the revision
// (after the call acted, and before it did), and a new process resumes the run from its record; the site is then the
// site of an uncrashed revision. The same for the restore. Two revisions: a rename (records written again in place)
// and an added service (records made, found again by their mark when the crash fell between the call and its save).
// After a crashed and resumed rename, the restore still gives the site before the revision.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-crash.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restoreBuild } from '../src/step-chain-draft-restore.js'
import { canonicalOf, revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const FIRST = 62

for (const name of ['rename a service', 'add a service']) {
  test(`${name}: a crash at any door call of the revision, then a resume, gives the uncrashed site`, async () => {
    const clean = await firstBuild()
    const done = await revisionRun(clean, revisedBy(name))
    const want = JSON.stringify(canonicalOf(clean.memory))
    let swept = 0
    for (let n = 1; n <= done.writes; n++)
      for (const before of [false, true]) {
        const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + n, before } }) })
        assert.equal(first.memory.calls, FIRST)
        const record = {}
        const crashed = await revisionRun(first, revisedBy(name), { record })
        assert.equal(crashed.error?.code, 'crash', `call ${n}`)
        const resumed = await revisionRun(first, revisedBy(name), { record })
        assert.equal(resumed.run?.write.report.status, 'done', `call ${n}: ${resumed.error?.code}`)
        assert.equal(
          JSON.stringify(canonicalOf(first.memory)),
          want,
          `call ${n} ${before ? 'before' : 'after'}`
        )
        // The undo journal keeps the value before the revision, even when a resumed call writes a place again.
        if (name === 'rename a service') {
          const build = first.builds.get(resumed.run.write.build.ref)
          const previous = first.builds.get(first.ref)
          const doors = first.memory.doors
          await restoreBuild({ build, previous, doors, record: {}, runId: 'restore-after-crash' })
          assert.deepEqual(snapshotOf(first.memory), first.snapshot, `restore after call ${n}`)
        }
        swept += 1
      }
    assert.equal(swept, done.writes * 2)
    console.log(`${name}: ${swept} crashes swept over ${done.writes} door calls`)
  })
}

test('a crash at any door call of the restore, then a resume, gives the site before the revision', async () => {
  const probe = await firstBuild()
  const rev = await revisionRun(probe, revisedBy('rename a service'))
  const places = rev.writes
  let swept = 0
  for (let n = 1; n <= 4; n++)
    for (const before of [false, true]) {
      const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + places + n, before } }) })
      const partial = await revisionRun(first, revisedBy('rename a service'))
      const build = first.builds.get(partial.run.write.build.ref)
      const record = {}
      const input = {
        build,
        previous: first.builds.get(first.ref),
        doors: first.memory.doors,
        record,
        runId: 'restore-1'
      }
      assert.equal((await restoreBuild(input).catch((e) => e))?.code, 'crash', `restore call ${n}`)
      await restoreBuild(input)
      assert.deepEqual(
        snapshotOf(first.memory),
        first.snapshot,
        `restore call ${n} ${before ? 'before' : 'after'}`
      )
      swept += 1
    }
  assert.equal(swept, 8)
})
