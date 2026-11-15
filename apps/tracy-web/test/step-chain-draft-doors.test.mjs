// The write step's side of the real door client (#597 over #585, `step-chain-draft-doors.js`): every door that answers
// `DOOR_NOT_AVAILABLE` becomes the typed stop `door_not_available` naming the door, sending nothing; a door the run's
// signal stopped is `fatal`; a `get` of a missing record is `NOT_FOUND`; and `app.js` wires the real `siteDoors`.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-doors.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { siteDoors } from 'website-opportunities/domain/site-doors.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { DOOR_NOT_AVAILABLE_STOP, typedDoors } from '../src/step-chain-draft-doors.js'
import { siteDoorsFor } from '../src/step-chain-draft-site.js'

const SITE = 'site-quillmoor-1'

/** An invented plugin: `answers` by operation, every call kept. */
function fakeSend(answers = {}) {
  const calls = []
  const send = async (operation, payload) => {
    calls.push({ operation, payload })
    const out = answers[operation] ?? { ok: true }
    if (out.ok !== true) throw Object.assign(new Error(out.code), { code: out.code })
    return out
  }
  return { send, calls }
}
const doorsOver = (send, extra = {}) =>
  typedDoors(siteDoors({ send, siteKey: SITE, ...extra }), { siteKey: SITE })

const isStop = (door) => (error) =>
  error.code === DOOR_NOT_AVAILABLE_STOP &&
  error.details.door === door &&
  error.details.siteKey === SITE &&
  typeof error.details.reason === 'string' &&
  error.noRerun === true &&
  error.fatal === true

test('every unavailable door stops typed, naming the door, and sends nothing', async () => {
  const { send, calls } = fakeSend()
  const doors = doorsOver(send)
  await assert.rejects(
    doors.contract({
      applyId: 'run-1:copy:a:apply',
      expectedRevision: 'r1',
      changes: {},
      removes: ['module-7.0']
    }),
    isStop('contract.removes')
  )
  await assert.rejects(doors.media({ path: 'images/quillmoor/a.jpg' }), isStop('media'))
  await assert.rejects(
    doors.deleteRecord({ applyId: 'run-1:x:delete', kind: 'article', id: 3 }),
    isStop('deleteRecord')
  )
  await assert.rejects(doors.revertDelete({ applyId: 'run-1:x:revert' }), isStop('revertDelete'))
  assert.equal(calls.length, 0)
})

test('with a public file reader the media door answers the sha256 of the bytes, or null', async () => {
  const { send } = fakeSend()
  const files = { 'images/quillmoor/a.jpg': Buffer.from('invented picture') }
  const doors = doorsOver(send, { publicFile: async (path) => files[path] ?? null })
  assert.match((await doors.media({ path: 'images/quillmoor/a.jpg' })).sha256, /^[0-9a-f]{64}$/)
  assert.equal(await doors.media({ path: 'images/quillmoor/none.jpg' }), null)
})

test('an aborted run sends nothing and its door error is fatal', async () => {
  const { send, calls } = fakeSend()
  const controller = new AbortController()
  controller.abort()
  const doors = doorsOver(send, { signal: controller.signal })
  await assert.rejects(doors.get({ kind: 'module', id: 7 }), (e) => e.code === 'ABORTED' && e.fatal === true)
  await assert.rejects(
    doors.update({ applyId: 'run-1:m:set', kind: 'module', id: 7, fields: { title: 'Quillmoor' } }),
    (e) => e.code === 'ABORTED' && e.fatal === true
  )
  assert.equal(calls.length, 0)
})

test('a get of a record the site does not hold is NOT_FOUND, never a null', async () => {
  const { send } = fakeSend({ 'content.get': { ok: true } })
  await assert.rejects(
    doorsOver(send).get({ kind: 'article', id: 41 }),
    (e) => e.code === 'NOT_FOUND' && e.details.kind === 'article' && e.details.id === 41 && !e.fatal
  )
})

test("a plugin refusal is passed on unchanged, and the client's html is kept", async () => {
  const { send } = fakeSend({ 'content.update': { ok: false, code: 'SLOT_NOT_WRITABLE' } })
  const raw = siteDoors({ send })
  const doors = typedDoors(raw, { siteKey: SITE })
  await assert.rejects(
    doors.update({ applyId: 'run-1:m:set', kind: 'module', id: 7, fields: { title: 'Quillmoor' } }),
    (e) => e.code === 'SLOT_NOT_WRITABLE' && !e.fatal && !e.noRerun
  )
  assert.equal(doors.html, raw.html)
  assert.equal(typedDoors(null), null)
})

test('siteDoorsFor wraps the factory: a restore without a public file reader stops typed on media', async () => {
  const doors = await siteDoorsFor({ site: { siteDoors }, applyFor: () => async () => ({ ok: true }) })({
    siteKey: SITE,
    email: 'owner@quillmoor.example',
    runId: 'restore-1'
  })
  await assert.rejects(doors.media({ path: 'images/a.jpg' }), isStop('media'))
})

test('app.js wires the real door client for a restore or an abandon of a built site', async () => {
  const env = {
    TRACY_ORIGIN: 'http://tracy.test',
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  }
  const app = buildApp({
    config: readConfig(env),
    pool: { query: async () => ({ rows: [] }) },
    host: {},
    mail: { send: async () => {} }
  })
  const doors = await app.draftSiteDoorsFor({ siteKey: SITE, email: 'owner@quillmoor.example', runId: 'r-1' })
  // The undo doors exist only on the real client; `deleteRecord` answers its typed stop without a call.
  for (const door of ['hide', 'unassign', 'deleteMedia', 'deleteRecord', 'revertDelete'])
    assert.equal(typeof doors?.[door], 'function', door)
  await assert.rejects(
    doors.deleteRecord({ applyId: 'r-1:x', kind: 'article', id: 1 }),
    isStop('deleteRecord')
  )
})
