// The memory site behind the draft write's doors (ticket #597, `write-order-memory-doors.mjs` and
// `write-order-memory-rules.mjs`): each refusal measured on a real blank site, or stated by the plugin's reference,
// enforced; an apply id on every write, replayed only by content.contract within one apply id (content.update writes
// again on every call); the revision moving on every write; an unclosed list row read as an HTML parser reads it.
// Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-doors.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryDoors, memoryHtml } from '../domain/write-order-memory-doors.mjs'
import { site } from './fixtures/draft-write/guarded.mjs'

const fresh = () => memoryDoors({ lock: site.kit.lock, contentMap: site.kit.blankContract })
const refused = (code) => (error) => error.code === code
let n = 0
const apply = async (memory, changes, removes = [], revision) =>
  memory.doors.contract({
    applyId: `t:${++n}`,
    expectedRevision: revision ?? (await memory.doors.inspect()).revision,
    changes,
    removes
  })

test('every write needs an apply id; content.update keeps no replay: the same apply id writes again (measured)', async () => {
  const memory = fresh()
  await assert.rejects(
    memory.doors.update({ kind: 'article', id: 0, fields: { title: 'A' } }),
    refused('APPLY_ID_REQUIRED')
  )
  const call = { applyId: 'same', kind: 'article', id: 0, fields: { title: 'Roses' } }
  const first = await memory.doors.update(structuredClone(call))
  const again = await memory.doors.update(structuredClone(call))
  assert.notEqual(again.id, first.id)
  assert.equal(memory.site.records.article.size, 2)
  await memory.doors.update({ ...call, id: first.id, fields: { title: 'Tulips' } })
  assert.equal(memory.site.records.article.get(first.id).title, 'Tulips')
  assert.equal(memory.steps('same'), 3)
})

test('content.contract replays within one apply id only: the same request answers again, other content is refused', async () => {
  const memory = fresh()
  const { revision } = await memory.doors.inspect()
  const call = {
    applyId: 'c1',
    requestId: 'q1',
    expectedRevision: revision,
    changes: { 'module-156.0': 'Open' }
  }
  const first = await memory.doors.contract(structuredClone(call))
  // The revision read before the first apply, or the current one: the first answer again, nothing written.
  assert.deepEqual(await memory.doors.contract(structuredClone(call)), first)
  const now = (await memory.doors.inspect()).revision
  assert.deepEqual(await memory.doors.contract({ ...call, expectedRevision: now }), first)
  assert.equal((await memory.doors.inspect()).revision, now)
  await assert.rejects(
    memory.doors.contract({ ...call, expectedRevision: now, changes: { 'module-156.0': 'Shut' } }),
    refused('contract_failed')
  )
  await assert.rejects(
    memory.doors.contract({ ...call, requestId: 'q2', expectedRevision: now }),
    refused('contract_failed')
  )
  await memory.doors.contract({
    ...call,
    applyId: 'c2',
    expectedRevision: now,
    changes: { 'module-156.0': 'Shut' }
  })
  assert.deepEqual(await memory.doors.read({ slots: ['module-156.0'] }), { 'module-156.0': 'Shut' })
})

test('content.contract: REVISION_REQUIRED, REVISION_STALE; the revision moves on every write', async () => {
  const memory = fresh()
  const { revision } = await memory.doors.inspect()
  await assert.rejects(
    memory.doors.contract({ applyId: 'r1', changes: { 'module-156.0': 'Open' } }),
    refused('REVISION_REQUIRED')
  )
  await apply(memory, { 'module-156.0': 'Open daily' }, [], revision)
  assert.equal((await memory.doors.inspect()).revision, revision + 1)
  await assert.rejects(apply(memory, { 'module-156.0': 'Late' }, [], revision), refused('REVISION_STALE'))
})

test('content.contract: SLOT_UNKNOWN, SLOT_NOT_CONTENT, SLOT_TOO_LONG, HTML_SLOT_MISSING', async () => {
  const memory = fresh()
  await assert.rejects(apply(memory, { 'module-0.0': 'x' }), refused('SLOT_UNKNOWN'))
  await assert.rejects(apply(memory, { 'module-156.0': 'a <b>tag</b>' }), refused('SLOT_NOT_CONTENT'))
  await assert.rejects(apply(memory, { 'module-156.0': 'a "quote"' }), refused('SLOT_NOT_CONTENT'))
  await assert.rejects(apply(memory, { 'category-2.0': 'x'.repeat(47) }), refused('SLOT_TOO_LONG'))
  await assert.rejects(apply(memory, { 'module-157.21': '' }), refused('HTML_SLOT_MISSING'))
})

test('content.contract: SLOT_EMPTY_STATE, filling a slot that does not open empty or emptying an occupied one', async () => {
  const memory = fresh()
  await assert.rejects(apply(memory, { 'module-156.7': 'Fresh' }), refused('SLOT_EMPTY_STATE'))
  await assert.rejects(apply(memory, { 'category-2.0': '' }), refused('SLOT_EMPTY_STATE'))
})

test('content.contract: MARKERS_PRINTED_AS_WORDS at an HTML slot; SLOT_NOT_REMOVABLE for no element', async () => {
  const memory = fresh()
  await assert.rejects(
    apply(memory, { 'module-157.21': 'Row((br/))two' }),
    refused('MARKERS_PRINTED_AS_WORDS')
  )
  await assert.rejects(apply(memory, {}, ['module-157.21']), refused('SLOT_NOT_REMOVABLE'))
  await assert.rejects(apply(memory, {}, ['category-2.0']), refused('SLOT_NOT_REMOVABLE'))
})

test('content.update: NOT_FOUND, KIND_UNKNOWN; write_failed as measured, and a contact with an empty name written', async () => {
  const memory = fresh()
  const update = (input) => memory.doors.update({ applyId: `u:${++n}`, ...input })
  await assert.rejects(update({ kind: 'article', id: 999999, fields: { title: 'x' } }), refused('NOT_FOUND'))
  await assert.rejects(
    update({ kind: 'moduleAssignment', id: 999999, fields: { menuids: '[]' } }),
    refused('NOT_FOUND')
  )
  await assert.rejects(update({ kind: 'userProfile', id: 0, fields: {} }), refused('KIND_UNKNOWN'))
  const contact = { params: '{}', metadata: '{}', metadesc: '' }
  for (const [kind, fields] of [
    ['article', { title: ' ' }],
    ['article', {}],
    ['category', { title: '' }],
    ['module', { title: '' }],
    ['contact', { ...contact }],
    ['contact', { name: 'Larkspur' }]
  ])
    await assert.rejects(
      update({ kind, id: 0, fields }),
      refused('write_failed'),
      `${kind} ${JSON.stringify(fields)}`
    )
  for (const name of ['', ' ']) {
    const { id } = await update({ kind: 'contact', id: 0, fields: { name, ...contact } })
    assert.equal(memory.site.records.contact.get(id).name, name)
  }
  const [module] = memory.site.records.module.keys()
  for (const menuids of ['', 'null'])
    await assert.rejects(
      update({ kind: 'moduleAssignment', id: module, fields: { menuids } }),
      refused('write_failed')
    )
  await assert.rejects(update({ kind: 'moduleAssignment', id: module, fields: {} }), refused('bad_params'))
})

test('the reads: a module assignment, an upload by its bytes, the identity fields the door keeps', async () => {
  const memory = fresh()
  const [id] = memory.site.records.module.keys()
  await memory.doors.update({ applyId: 'a', kind: 'moduleAssignment', id, fields: { menuids: '[3]' } })
  assert.deepEqual(JSON.parse((await memory.doors.get({ kind: 'moduleAssignment', id })).menuids), [3])
  await memory.doors.upload({ applyId: 'b', path: 'images/a.jpg', bytes: Buffer.from('abc') })
  assert.equal((await memory.doors.media({ path: 'images/a.jpg' })).sha256.length, 64)
  assert.equal(await memory.doors.media({ path: 'images/none.jpg' }), null)
  await memory.doors.identity({ applyId: 'c', fields: { sitename: 'Larkspur', fromname: 'Larkspur' } })
  assert.deepEqual(await memory.doors.readIdentity(), { sitename: 'Larkspur' })
})

test('an unclosed list row ends where the next opens, as an HTML parser reads it', () => {
  const value = '((ul))\n\t((li))\n\t((li))\n((li))\n((/ul))'
  assert.equal(
    memoryHtml.remove(memoryHtml.remove(value, '/html/body/div/ul/li[3]'), '/html/body/div/ul/li[2]'),
    '((ul))\n\t((li))\n\t((/li))((/ul))'
  )
  assert.throws(() => memoryHtml.get(value, '/html/body/div/ul/li[4]'), refused('HTML_SLOT_MISSING'))
})
