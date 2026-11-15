// Taking things off a built site, the hard cases (#599): the restore of a revision that made records hides them and
// deletes the files it uploaded only when nothing else names them (a file the owner used stays, said why); a revision
// that dies half way, is resumed and dies again, then is abandoned, leaves the site exactly as before (a record it hid
// is published again); a door that refuses twice stops typed with nothing hidden, and the same record resumes; a site
// whose door client has no hide stops `door_not_available` before any door. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-removal-undo.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite, buildStoreOf } from './draft-revision-fixtures.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { crashingDoors, durable, FIRST, uploadsLeft } from './draft-revision-sweep.mjs'

const POSY = 'article:service-seasonal-posy'
/** The memory site seen through other doors: the writes still count on the site. */
const through = (memory, doors) => ({
  doors,
  get calls() {
    return memory.calls
  }
})

test('a restore hides what the revision made and keeps a file the owner used, deleting the others', async () => {
  const first = await firstBuild()
  const out = await revisionRun(first, revisedBy('add a service'))
  assert.equal(out.error, undefined, out.error?.code)
  const build = first.builds.get(out.run.write.build.ref)
  const uploads = build.write.state.undo.uploads
  assert.ok(uploads.length >= 2, `the revision uploaded ${uploads.length} file(s)`)
  const [used, ...unused] = uploads
  await first.memory.doors.update({
    applyId: 'owner-article-1',
    kind: 'article',
    id: 0,
    fields: { title: 'Our fern corner', state: 1, introtext: `<img src="${used}">` }
  })
  const owner = [...first.memory.site.records.article.values()].at(-1)
  const restored = await restoreOf(first, build)
  assert.equal(restored.status, 'done')
  assert.deepEqual(restored.left.uploads, [used])
  assert.deepEqual(restored.left.kept[0].usedIn, [{ kind: 'article', id: owner.id }])
  assert.ok(first.memory.site.uploads.has(used))
  for (const path of unused) assert.equal(first.memory.site.uploads.has(path), false, path)
  assert.ok(restored.left.hidden.length > 0)
  first.memory.site.records.article.delete(owner.id)
  assert.deepEqual(uploadsLeft(first.memory, first.snapshot, [used]), first.snapshot)
})

test('crash, resume, crash again, then abandon: the site is the site before, a hidden record published again', async () => {
  const seen = { hidden: 0 }
  for (let n = 1; n <= 4; n++) {
    const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + 1 } }) })
    const store = durable()
    const revised = revisedBy('remove a service')
    assert.equal((await revisionRun(first, revised, { record: store.record })).error?.code, 'crash')
    const crashing = crashingDoors(first.memory.doors, n)
    const again = await revisionRun(first, revised, {
      record: store.revive(),
      memory: through(first.memory, crashing)
    })
    if (!again.error) continue
    assert.equal(again.error.code, 'crash', `resume ${n}`)
    const id = first.builds.get(first.ref).write.state.ids[POSY]
    if (first.memory.site.records.article.get(id).state === 0) seen.hidden += 1
    const out = await abandonRun({
      run: 'run-larkspur-2',
      runRecord: { state: store.saved() },
      doors: first.memory.doors,
      record: {},
      runId: 'abandon-1',
      builds: buildStoreOf(first.builds)
    })
    assert.equal(out.status, 'done', `resume ${n}`)
    assert.deepEqual(
      uploadsLeft(first.memory, first.snapshot, out.left.uploads),
      first.snapshot,
      `resume ${n}`
    )
    assert.equal(first.memory.site.records.article.get(id).state, 1)
  }
  assert.ok(seen.hidden > 0, 'no crash point came after the hide')
})

test('a hide refused twice stops typed with nothing hidden; the same record then resumes to the end', async () => {
  const probe = await firstBuild()
  const writes = (await revisionRun(probe, revisedBy('remove a service'))).writes
  const first = await firstBuild({ memory: blankSite({ fail: [FIRST + writes, FIRST + writes + 1] }) })
  const record = {}
  const out = await revisionRun(first, revisedBy('remove a service'), { record })
  assert.equal(out.error?.code, 'redo_failed')
  assert.equal(out.error.noRerun, true)
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  assert.equal(out.error.details.op, `hide:article:${id}`)
  assert.equal(first.memory.site.records.article.get(id).state, 1)
  const resumed = await revisionRun(first, revisedBy('remove a service'), { record })
  assert.equal(resumed.error, undefined, resumed.error?.code)
  assert.equal(first.memory.site.records.article.get(id).state, 0)
})

test('a site whose door client has no hide stops door_not_available before any door', async () => {
  const first = await firstBuild()
  const { hide: _hide, ...doors } = first.memory.doors
  const out = await revisionRun(first, revisedBy('remove a service'), {
    memory: through(first.memory, doors)
  })
  assert.equal(out.error?.code, 'door_not_available')
  assert.equal(out.error.details.door, 'hide')
  assert.equal(out.writes, 0)
})
