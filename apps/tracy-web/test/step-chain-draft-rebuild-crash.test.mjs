// The crash sweep of a revision on a built site with its run record kept outside the process (#612): the process dies
// at every door call of the revision (after the call acted, and before it did), then a NEW process (new draft steps,
// nothing of the old one's memory) either resumes the run under its own id from the record the store kept, or the
// owner abandons it through the record the rebuild wiring reads back (`runRecordOf`). Only the stores outlive the
// crash: the build store and the run record store. Resumed, the site is the site of an uncrashed revision; abandoned,
// it is the site before the revision (but for the files it uploaded) or a typed stop for what no door undoes.
// Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-rebuild-crash.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { memoryRunRecords, runRecordReader } from '../src/step-chain-draft-run-records.js'
import { canonicalOf, revisedBy } from './draft-revision-edits.mjs'
import { blankSite, buildStoreOf } from './draft-revision-fixtures.mjs'
import { firstBuild } from './draft-revision-run.mjs'
import { FIRST, uploadsLeft } from './draft-revision-sweep.mjs'
import { siteRevision, SITE_KEY } from './step-chain-draft-rebuild-run.mjs'

const RUN = 'run-larkspur-2'
const CTX = { siteKey: SITE_KEY }
const EDITS = ['rename a service', 'change the phone', 'change the site name', 'add a service']

for (const name of EDITS)
  test(`${name}: a crash at any door call, a restart, then a resume from the kept record gives the uncrashed site`, async () => {
    const clean = await firstBuild()
    const done = await siteRevision(clean, revisedBy(name), { runId: RUN, runRecords: memoryRunRecords() })
    assert.equal(done.error, undefined, done.error?.code)
    const want = JSON.stringify(canonicalOf(clean.memory))
    const problems = []
    for (let n = 1; n <= done.writes; n++)
      for (const before of [false, true]) {
        const at = `call ${n} ${before ? 'before' : 'after'}`
        const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + n, before } }) })
        const runRecords = memoryRunRecords()
        const crashed = await siteRevision(first, revisedBy(name), { runId: RUN, runRecords })
        if (crashed.error?.code !== 'crash') problems.push(`${at}: no crash (${crashed.error?.code})`)
        const resumed = await siteRevision(first, revisedBy(name), { runId: RUN, runRecords })
        if (resumed.run?.write.report.status !== 'done') problems.push(`${at}: ${resumed.error?.code}`)
        else if (JSON.stringify(canonicalOf(first.memory)) !== want) problems.push(`${at}: another site`)
        else if (!(await runRecords.read(RUN, CTX))?.closed) problems.push(`${at}: record left open`)
      }
    assert.deepEqual(problems, [])
    console.log(`${name}: resume, ${done.writes * 2} crashes swept, 0 problems`)
  })

for (const name of EDITS)
  test(`${name}: a crash at any door call, a restart, then the abandon from the kept record gives the site before`, async () => {
    const probe = await firstBuild()
    const writes = (
      await siteRevision(probe, revisedBy(name), { runId: RUN, runRecords: memoryRunRecords() })
    ).writes
    const problems = []
    const seen = { done: 0, stop: 0 }
    for (let n = 1; n <= writes; n++)
      for (const before of [false, true]) {
        const at = `call ${n} ${before ? 'before' : 'after'}`
        const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + n, before } }) })
        const runRecords = memoryRunRecords()
        await siteRevision(first, revisedBy(name), { runId: RUN, runRecords })
        const builds = buildStoreOf(first.builds)
        const unfinished = await builds.unfinished(CTX)
        // The run marks itself before its first door call, so every crash leaves it unfinished.
        if (unfinished?.runId !== RUN) problems.push(`${at}: not unfinished`)
        const runRecord = await runRecordReader(runRecords)(RUN, CTX)
        const out = await abandonRun({
          run: RUN,
          runRecord: runRecord ?? {},
          doors: first.memory.doors,
          record: {},
          runId: 'abandon-1',
          builds,
          ctx: CTX
        }).catch((e) => e)
        if (out.status === 'done') {
          seen.done += 1
          const left = uploadsLeft(first.memory, first.snapshot, out.left.uploads)
          if (JSON.stringify(left) !== JSON.stringify(first.snapshot))
            problems.push(`${at}: not the site before`)
          if (first.builds.unfinishedRun) problems.push(`${at}: still unfinished`)
          continue
        }
        // Only a run that sent a make stops: no door removes a record. It can be resumed instead.
        if (out.code !== 'restore_needs_removal' || name !== 'add a service')
          problems.push(`${at}: ${out.code}`)
        seen.stop += 1
      }
    assert.deepEqual(problems, [])
    console.log(`${name}: abandon, ${JSON.stringify(seen)} over ${writes} door calls, 0 problems`)
  })
