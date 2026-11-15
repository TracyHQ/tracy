// The door client of the draft write (ticket #585) over an invented transport: each door is one plugin operation, a
// replayed apply id answers its first answer without a second call, a door with no plugin operation answers a typed
// error, and nothing but `send` touches the plugin.
import assert from 'node:assert/strict'
import test from 'node:test'
import { DOOR_NOT_AVAILABLE, siteDoors } from '../domain/site-doors.mjs'

/** An invented plugin: answers by operation, keeps every call. */
function fakeSend(answers = {}) {
  const calls = []
  const send = async (operation, payload) => {
    calls.push({ operation, payload })
    const answer = answers[operation]
    const out = typeof answer === 'function' ? answer(payload) : (answer ?? { ok: true })
    if (out.ok !== true) throw Object.assign(new Error(out.error), { code: out.error })
    return out
  }
  return { send, calls }
}

test('an update is sent once per apply id; a replay answers the first answer, another payload is refused', async () => {
  let made = 40
  const { send, calls } = fakeSend({ 'content.update': () => ({ ok: true, id: ++made }) })
  const doors = siteDoors({ send })
  const call = { applyId: 'run-1:article:a:create', kind: 'article', id: 0, fields: { title: 'Example' } }
  assert.deepEqual(await doors.update(call), { id: 41 })
  assert.deepEqual(await doors.update(call), { id: 41 })
  assert.equal(calls.length, 1)
  await assert.rejects(doors.update({ ...call, fields: { title: 'Other' } }), { code: 'APPLY_ID_REUSED' })
})

test('a contract apply carries a contract apply id, its request id and the revision read', async () => {
  const { send, calls } = fakeSend()
  const doors = siteDoors({ send })
  await doors.contract({
    applyId: 'run-1:copy:x:apply',
    expectedRevision: 'r7',
    changes: { 'module-1.0': 'Hi' }
  })
  const { payload } = calls[0]
  assert.equal(payload.apply_id, 'contract-run-1:copy:x:apply')
  assert.equal(payload.request_id, payload.apply_id)
  assert.equal(payload.expected_revision, 'r7')
})

test('a door the plugin has no operation for answers a typed error and sends nothing', async () => {
  const { send, calls } = fakeSend()
  const doors = siteDoors({ send })
  for (const attempt of [
    () => doors.contract({ applyId: 'a', expectedRevision: 'r', changes: {}, removes: ['module-1.0'] }),
    () => doors.media({ path: 'images/x.png' }),
    () => doors.deleteRecord({ applyId: 'b', kind: 'article', id: 3 }),
    () => doors.revertDelete({ applyId: 'c' })
  ])
    await assert.rejects(
      attempt(),
      (error) => error.code === DOOR_NOT_AVAILABLE && Boolean(error.details.door)
    )
  assert.equal(calls.length, 0)
})

test('find pages the list for the mark; read gives a removed slot as null', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, alias: `page-${i + 1}`, note: '' }))
  const { send } = fakeSend({
    'content.list': ({ offset, limit }) => ({ ok: true, items: rows.slice(offset, offset + limit) }),
    'content.contract': () => ({
      ok: true,
      revision: 'r1',
      slots: [
        { key: 'module-1.0', current: 'Hi' },
        { key: 'module-1.1', current: 'old' }
      ],
      removedSlots: { 'module-1.1': 'removed' }
    })
  })
  const doors = siteDoors({ send })
  assert.equal(await doors.find({ kind: 'article', mark: 'page-28' }), 28)
  assert.equal(await doors.find({ kind: 'article', mark: 'page-99' }), null)
  assert.deepEqual(await doors.read({ slots: ['module-1.0', 'module-1.1', 'module-9.0'] }), {
    'module-1.0': 'Hi',
    'module-1.1': null,
    'module-9.0': null
  })
  assert.deepEqual(await doors.inspect(), { revision: 'r1' })
})

test('the undo doors are the measured operations: a hide, no page, a media delete under images', async () => {
  const { send, calls } = fakeSend({ 'content.update': (p) => ({ ok: true, id: p.id }) })
  const doors = siteDoors({ send })
  await doors.hide({ applyId: 'h1', kind: 'article', id: 5 })
  await doors.hide({ applyId: 'h2', kind: 'module', id: 6 })
  await doors.unassign({ applyId: 'u1', id: 6 })
  await doors.deleteMedia({ applyId: 'm1', path: 'images/tracy/a.png', dryRun: true })
  assert.deepEqual(
    calls.map((c) => [c.operation, c.payload.fields ?? c.payload.dry_run]),
    [
      ['content.update', { state: 0 }],
      ['content.update', { published: 0 }],
      ['content.update', { menuids: '[]' }],
      ['media.delete', true]
    ]
  )
})

test('a stopped run sends nothing more', async () => {
  const { send, calls } = fakeSend()
  const stop = new AbortController()
  const doors = siteDoors({ send, siteKey: 'example-site', signal: stop.signal })
  await doors.readIdentity()
  stop.abort()
  await assert.rejects(
    doors.readIdentity(),
    (error) => error.code === 'ABORTED' && error.details.siteKey === 'example-site'
  )
  assert.equal(calls.length, 1)
})
