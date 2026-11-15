// The restore and the abandon of a revision that took a key out of a record's settings (#599): when the owner set that
// key to their own value since, the key the revision took out is not written back over it: the restore stops
// `restore_site_changed` and the abandon `site_changed_outside`, with no write, as for an owned key the owner edited.
// Left as the revision left it (absent, or a blank holder), the key comes back as before. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-restore-owner-key.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { buildStoreOf } from './draft-revision-fixtures.mjs'
import { firstBuild, restoreOf, restoredTo, revisionRun } from './draft-revision-run.mjs'
import { crashingDoors, durable } from './draft-revision-sweep.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const KEY = 'ft-title'
const OWNER = 'A heading of the owner'
const drop = () => revisedBy('drop a block from an article page', MORE_EDITS)
const through = (memory, doors) => ({
  doors,
  get calls() {
    return memory.calls
  }
})
/** The article whose settings hold the key the revision takes out, read again each time (an update replaces it). */
function articleOf(memory) {
  const table = memory.site.records.article
  const id = [...table.values()].find((r) => Object.hasOwn(JSON.parse(r.attribs ?? '{}'), KEY)).id
  return {
    get attribs() {
      return table.get(id).attribs
    },
    set attribs(value) {
      table.get(id).attribs = value
    }
  }
}
const setKey = (row, value) => {
  const a = JSON.parse(row.attribs)
  a[KEY] = value
  row.attribs = JSON.stringify(a)
}

test('a restore stops, writing nothing, over an owner value at a key the revision took out', async () => {
  const first = await firstBuild()
  const row = articleOf(first.memory)
  const out = await revisionRun(first, drop())
  assert.equal(out.error, undefined, out.error?.code)
  assert.equal(Object.hasOwn(JSON.parse(row.attribs), KEY), false, 'the revision took the key out')
  setKey(row, OWNER)
  const before = first.memory.calls
  const restored = await restoreOf(first, first.builds.get(out.run.write.build.ref)).catch((e) => e)
  assert.equal(restored.code, 'restore_site_changed')
  assert.equal(first.memory.calls, before)
  assert.equal(JSON.parse(row.attribs)[KEY], OWNER)
})

test('a restore puts the key back when the site holds a blank holder there', async () => {
  const first = await firstBuild()
  const row = articleOf(first.memory)
  const out = await revisionRun(first, drop())
  const snapshot = first.snapshot
  setKey(row, '')
  const build = first.builds.get(out.run.write.build.ref)
  const restored = await restoreOf(first, build)
  assert.equal(restored.status, 'done')
  assert.ok(restoredTo(first.memory, snapshot, build))
})

test('the abandon of a crashed revision stops over an owner value at a key it took out', async () => {
  const probe = await firstBuild()
  const writes = (await revisionRun(probe, drop())).writes
  const first = await firstBuild()
  const row = articleOf(first.memory)
  const store = durable()
  const out = await revisionRun(first, drop(), {
    record: store.record,
    memory: through(first.memory, crashingDoors(first.memory.doors, writes))
  })
  assert.equal(out.error?.code, 'crash')
  setKey(row, OWNER)
  const before = first.memory.calls
  const snap = snapshotOf(first.memory)
  const abandoned = await abandonRun({
    run: 'run-larkspur-2',
    runRecord: { state: store.saved() },
    doors: first.memory.doors,
    record: {},
    runId: 'abandon-1',
    builds: buildStoreOf(first.builds)
  }).catch((e) => e)
  assert.equal(abandoned.code, 'site_changed_outside')
  assert.equal(first.memory.calls, before)
  assert.equal(JSON.stringify(snapshotOf(first.memory)), JSON.stringify(snap))
})
