// The abandon of a revision run that stopped half way (#599, `abandonRun`), on a plain site and on a site that stores
// JSON its own way: the process dies at every door call of the revision (after the call acted, and before), the
// customer abandons it, and the site is the site before the revision (but for the files it uploaded, which no door
// deletes) or the abandon stops typed for what no door undoes; then another revision runs. The abandon itself dies at
// every door call and resumes from its saved record. Until then another revision stops at the plan step, before any
// model call (`previous_run_unfinished`), and an owner edit is never written over.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-abandon.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite, buildStoreOf } from './draft-revision-fixtures.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'
import { blankFormSite } from './draft-revision-site-forms.mjs'
import { crashingDoors, durable, FIRST, uploadsLeft } from './draft-revision-sweep.mjs'

const SITES = { plain: (script) => blankSite(script), formed: (script) => blankFormSite('all', script) }
const RUN = 'run-larkspur-2'

const abandonOf = (first, saved, { doors = first.memory.doors, record = {} } = {}) =>
  abandonRun({
    run: RUN,
    runRecord: { state: saved },
    doors,
    record,
    runId: 'abandon-1',
    builds: buildStoreOf(first.builds)
  })

for (const [kind, blank] of Object.entries(SITES))
  for (const name of ['rename a service', 'change the phone', 'change the site name', 'add a service'])
    test(`${kind} site, ${name}: a crash at any door call, then the abandon, gives the site before or a typed stop`, async () => {
      const probe = await firstBuild({ memory: blank() })
      const writes = (await revisionRun(probe, revisedBy(name))).writes
      const seen = {}
      for (let n = 1; n <= writes; n++)
        for (const before of [false, true]) {
          const at = `call ${n} ${before ? 'before' : 'after'}`
          const first = await firstBuild({ memory: blank({ crash: { at: FIRST + n, before } }) })
          const store = durable()
          assert.equal(
            (await revisionRun(first, revisedBy(name), { record: store.record })).error?.code,
            'crash'
          )
          const blocked = await revisionRun(first, revisedBy('change the phone'), { runId: 'run-other' })
          assert.equal(blocked.error?.code, 'previous_run_unfinished', at)
          assert.equal(blocked.model.calls.length, 0, at)
          const out = await abandonOf(first, store.saved()).catch((e) => e)
          if (out.status !== 'done') {
            // Only a run that sent a make stops: no door removes a record. It is resumed instead.
            assert.equal(out.code, 'restore_needs_removal', `${at}: ${out.code}`)
            assert.equal(name, 'add a service', at)
            seen.stop = (seen.stop ?? 0) + 1
            continue
          }
          assert.deepEqual(uploadsLeft(first.memory, first.snapshot, out.left.uploads), first.snapshot, at)
          assert.equal(first.builds.unfinishedRun, null, at)
          const next = await revisionRun(first, revisedBy('change the phone'), { runId: 'run-3' })
          assert.equal(next.error, undefined, `${at}: ${next.error?.code}`)
          seen.done = (seen.done ?? 0) + 1
        }
      console.log(`${kind} ${name}: ${JSON.stringify(seen)} over ${writes} door calls`)
    })

for (const [kind, blank] of Object.entries(SITES))
  test(`${kind} site: a crash at any door call of the abandon, then a resume from its record, gives the site before`, async () => {
    const name = 'change the site name'
    const probe = await firstBuild({ memory: blank() })
    const writes = (await revisionRun(probe, revisedBy(name))).writes
    const cut = FIRST + writes - 2
    const sizing = await firstBuild({ memory: blank({ crash: { at: cut } }) })
    const s0 = durable()
    await revisionRun(sizing, revisedBy(name), { record: s0.record })
    const counted = crashingDoors(sizing.memory.doors, Number.POSITIVE_INFINITY)
    await abandonOf(sizing, s0.saved(), { doors: counted })
    assert.ok(counted.count() > 0)
    for (let m = 1; m <= counted.count(); m++)
      for (const before of [false, true]) {
        const first = await firstBuild({ memory: blank({ crash: { at: cut } }) })
        const store = durable()
        await revisionRun(first, revisedBy(name), { record: store.record })
        const own = durable()
        const crashed = await abandonOf(first, store.saved(), {
          doors: crashingDoors(first.memory.doors, m, before),
          record: own.record
        }).catch((e) => e)
        assert.equal(crashed.code, 'crash', `abandon call ${m}`)
        const done = await abandonOf(first, store.saved(), { record: own.revive() })
        assert.equal(done.status, 'done')
        assert.deepEqual(uploadsLeft(first.memory, first.snapshot, done.left.uploads), first.snapshot)
      }
  })

test('an owner edit made after the crash is never written over by the abandon', async () => {
  const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + 6 } }) })
  const store = durable()
  await revisionRun(first, revisedBy('change the site name'), { record: store.record })
  const saved = store.saved()
  const [key, kept] = Object.entries(saved.undo.records)[0]
  const column = Object.keys(kept.fields)[0]
  const row = first.memory.site.records[kept.kind].get(kept.id)
  first.memory.site.records[kept.kind].set(kept.id, { ...row, [column]: 'Owner words' })
  const out = await abandonOf(first, saved).catch((e) => e)
  assert.equal(out.code, 'site_changed_outside', key)
  assert.equal(first.memory.site.records[kept.kind].get(kept.id)[column], 'Owner words')
})
