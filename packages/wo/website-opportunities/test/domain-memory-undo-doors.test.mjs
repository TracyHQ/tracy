// The undo doors of the memory site (#599, `write-order-memory-undo.mjs`) behave as measured on plugin 0.24.85
// (docs/references/ai-quickstart-contract.md, "Door measurements"): a hide writes `published: 0` (an article
// `state: 0`) and publishing again brings the record back as it was; "no page" is `menuids: "[]"`; a media delete is
// refused outside `images/`, its dry run names the records that use the file and deletes nothing, and the delete takes
// the file off. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-memory-undo-doors.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryDoors } from '../domain/write-order-memory-doors.mjs'
import { site } from './fixtures/draft-write/guarded.mjs'

const fresh = () => memoryDoors({ lock: site.kit.lock, contentMap: site.kit.blankContract })
const PATH = 'images/tracy/fernhollow-posy.jpg'

test('a hide writes the published column (an article: state) to 0; publishing again brings the record back', async () => {
  const memory = fresh()
  const { id } = await memory.doors.update({
    applyId: 'a:1',
    kind: 'article',
    id: 0,
    fields: { title: 'Fern posy', state: 1 }
  })
  const before = await memory.doors.get({ kind: 'article', id })
  await memory.doors.hide({ applyId: 'a:2', kind: 'article', id })
  assert.equal((await memory.doors.get({ kind: 'article', id })).state, 0)
  await memory.doors.update({ applyId: 'a:3', kind: 'article', id, fields: { state: 1 } })
  assert.deepEqual(await memory.doors.get({ kind: 'article', id }), before)
  const item = await memory.doors.update({
    applyId: 'm:1',
    kind: 'menuItem',
    id: 0,
    fields: { title: 'Posies', link: 'index.php?option=com_content&view=article&id=1', published: 1 }
  })
  await memory.doors.hide({ applyId: 'm:2', kind: 'menuItem', id: item.id })
  assert.equal((await memory.doors.get({ kind: 'menuItem', id: item.id })).published, 0)
})

test('an unassign leaves the module on no page: "[]"', async () => {
  const memory = fresh()
  const { id } = await memory.doors.update({
    applyId: 'c:1',
    kind: 'module',
    id: 0,
    fields: { title: 'Fern' }
  })
  await memory.doors.update({ applyId: 'c:2', kind: 'moduleAssignment', id, fields: { menuids: '[0]' } })
  await memory.doors.unassign({ applyId: 'c:3', id })
  assert.equal((await memory.doors.get({ kind: 'moduleAssignment', id })).menuids, '[]')
})

test('a media delete as measured: refused outside images/, a dry run in the measured shape, then the file goes', async () => {
  const memory = fresh()
  await memory.doors.upload({ applyId: 'u:1', path: PATH, bytes: Buffer.from('fern bytes') })
  await assert.rejects(
    memory.doors.deleteMedia({ applyId: 'd:0', path: 'templates/fern.jpg' }),
    (e) => e.code === 'bad_params'
  )
  const { id } = await memory.doors.update({
    applyId: 'a:1',
    kind: 'article',
    id: 0,
    fields: { title: 'Fern posy', state: 0, images: JSON.stringify({ image_intro: PATH }) }
  })
  const dry = await memory.doors.deleteMedia({ applyId: 'd:1', path: PATH, dryRun: true })
  assert.deepEqual(Object.keys(dry).sort(), [
    'deleted',
    'ok',
    'totalBytes',
    'undoCopyUnderCap',
    'usedIn',
    'usedInScope'
  ])
  // An unpublished record is counted: one row per record, a plural type.
  assert.deepEqual(dry.usedIn, [{ type: 'articles', id, title: 'Fern posy' }])
  assert.equal(dry.deleted.files[0].size, 10)
  assert.ok(memory.site.uploads.has(PATH))
  const calls = memory.calls
  // The real delete succeeds although a record uses the file: the door refuses nothing.
  const done = await memory.doors.deleteMedia({ applyId: 'd:2', path: PATH })
  assert.equal(done.ok, true)
  assert.equal(memory.calls, calls + 1)
  assert.equal(memory.site.uploads.has(PATH), false)
})

test('a path with no file answers write_failed, dry run or not, and again for the same apply id', async () => {
  const memory = fresh()
  const noFile = (e) => e.code === 'write_failed' && /nothing was deleted/.test(e.message)
  await assert.rejects(memory.doors.deleteMedia({ applyId: 'd:1', path: PATH, dryRun: true }), noFile)
  await assert.rejects(memory.doors.deleteMedia({ applyId: 'd:2', path: 'images/none/fern.jpg' }), noFile)
  await memory.doors.upload({ applyId: 'u:1', path: PATH, bytes: Buffer.from('fern bytes') })
  await memory.doors.deleteMedia({ applyId: 'd:3', path: PATH })
  await assert.rejects(memory.doors.deleteMedia({ applyId: 'd:3', path: PATH }), noFile)
})
