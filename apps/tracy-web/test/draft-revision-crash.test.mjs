// The crash sweep of a revision run and of its restore (#599): the process dies at every door call of the revision
// (after the call acted, and before it did), and a new process resumes the run from its record; the site is then the
// site of an uncrashed revision. The same for the restore. The record is durable: only what `save` stored survives the
// crash, as a real store keeps it (a place this very run half wrote is never taken for an edit made outside Tracy).
// Three revisions: a rename (records written again in place), a changed phone (slots) and an added service (records
// made, found again by their mark when the crash fell between the call and its save; its restore stops typed). After a
// crashed and resumed rename or phone change, the restore still gives the site before the revision.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-crash.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { journaledDoors, wroteDoors } from '../src/step-chain-draft-journal.js'
import { canonicalOf, revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { blankFormSite } from './draft-revision-site-forms.mjs'
import { durable, FIRST } from './draft-revision-sweep.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const SITES = { plain: (script) => blankSite(script), formed: (script) => blankFormSite('all', script) }

for (const [kind, blank] of Object.entries(SITES))
  for (const name of ['rename a service', 'change the phone', 'add a service']) {
    test(`${kind} site, ${name}: a crash at any door call of the revision, then a resume from the saved record, gives the uncrashed site`, async () => {
      const clean = await firstBuild({ memory: blank() })
      const done = await revisionRun(clean, revisedBy(name))
      assert.equal(done.error, undefined, done.error?.code)
      const want = JSON.stringify(canonicalOf(clean.memory))
      let swept = 0
      for (let n = 1; n <= done.writes; n++)
        for (const before of [false, true]) {
          const first = await firstBuild({ memory: blank({ crash: { at: FIRST + n, before } }) })
          assert.equal(first.memory.calls, FIRST)
          const store = durable()
          const crashed = await revisionRun(first, revisedBy(name), { record: store.record })
          assert.equal(crashed.error?.code, 'crash', `call ${n}`)
          const resumed = await revisionRun(first, revisedBy(name), { record: store.revive() })
          const at = `call ${n} ${before ? 'before' : 'after'}`
          assert.equal(resumed.run?.write.report.status, 'done', `${at}: ${resumed.error?.code}`)
          assert.equal(JSON.stringify(canonicalOf(first.memory)), want, at)
          // The undo journal keeps the value before the revision, even when a resumed call writes a place again.
          if (name !== 'add a service') {
            await restoreOf(first, first.builds.get(resumed.run.write.build.ref), {
              runId: 'restore-after-crash'
            })
            assert.deepEqual(snapshotOf(first.memory), first.snapshot, `restore after ${at}`)
          }
          swept += 1
        }
      assert.equal(swept, done.writes * 2)
      console.log(`${kind} ${name}: ${swept} crashes swept over ${done.writes} door calls`)
    })
  }

for (const [kind, blank] of Object.entries(SITES))
  for (const name of ['rename a service', 'change the phone'])
    test(`${kind} site, ${name}: a crash at any door call of the restore, then a resume from the saved record, gives the site before the revision`, async () => {
      const probe = await firstBuild({ memory: blank() })
      const rev = await revisionRun(probe, revisedBy(name))
      const writes = rev.writes
      const before0 = probe.memory.calls
      await restoreOf(probe, probe.builds.get(rev.run.write.build.ref))
      const places = probe.memory.calls - before0
      assert.ok(places > 0)
      let swept = 0
      for (let n = 1; n <= places; n++)
        for (const before of [false, true]) {
          const first = await firstBuild({ memory: blank({ crash: { at: FIRST + writes + n, before } }) })
          const partial = await revisionRun(first, revisedBy(name))
          const build = first.builds.get(partial.run.write.build.ref)
          const store = durable()
          const crashed = await restoreOf(first, build, { record: store.record }).catch((e) => e)
          assert.equal(crashed?.code, 'crash', `restore call ${n}`)
          const done = await restoreOf(first, build, { record: store.revive() })
          assert.equal(done.status, 'done')
          assert.deepEqual(
            snapshotOf(first.memory),
            first.snapshot,
            `restore call ${n} ${before ? 'before' : 'after'}`
          )
          assert.equal(first.builds.currentRef, first.ref)
          swept += 1
        }
      assert.equal(swept, places * 2)
      console.log(`${kind} ${name}: restore, ${swept} crashes swept over ${places} door calls`)
    })

test('a place touched again in the same run (a resume) keeps its first value in the journal and holds what this run wrote', async () => {
  const site = { menuids: '[101]', introtext: '<p>Before</p>' }
  const doors = {
    get: async ({ kind }) =>
      kind === 'moduleAssignment' ? { menuids: site.menuids } : { introtext: site.introtext },
    update: async ({ kind, fields }) => {
      if (kind === 'moduleAssignment') site.menuids = fields.menuids
      else Object.assign(site, fields)
      return { id: 3000 }
    }
  }
  const record = { state: {} }
  const previousWrote = {}
  const journaled = journaledDoors(wroteDoors(doors, record), record, { previousWrote })
  for (const menuids of ['[102]', '[103]'])
    await journaled.update({ kind: 'moduleAssignment', id: 90, fields: { menuids } })
  for (const introtext of ['<p>One</p>', '<p>Two</p>'])
    await journaled.update({ kind: 'article', id: 3000, fields: { introtext } })
  assert.deepEqual(record.state.undo.assignments['90'], [101])
  assert.equal(record.state.undo.records['article:3000'].fields.introtext, '<p>Before</p>')
  // An owner edit between two touches of a place (a crash and a resume) is neither value Tracy left there: a stop.
  site.introtext = '<p>Owner words</p>'
  await assert.rejects(
    journaled.update({ kind: 'article', id: 3000, fields: { introtext: '<p>Three</p>' } }),
    (error) =>
      error.code === 'site_changed_outside' && error.details.place === 'record:article:3000:introtext'
  )
  assert.equal(site.introtext, '<p>Owner words</p>')
})
