// A silent failure of a site build is visible on the receipt and the hand-off report (spec TracyHQ/tracy#189): the engine's
// notes and every refused door call with its reason. Two made-up businesses of different trades.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refusalOf } from '../src/sites/brief-build.js'
import { recordedDoor } from '../src/sites/brief-engines/shared.js'
import { engineReportOf, handoffEngine, keepEngineReport } from '../src/opportunities-build/engine-report.js'

test('recordedDoor tells the run each refused answer and each thrown call, and still returns or throws as before', async () => {
  const told = []
  const door = recordedDoor(
    { refused: (call, answer) => told.push(refusalOf(call, answer)) },
    async (call) =>
      call.action === 'boom'
        ? Promise.reject(new Error('socket closed'))
        : call.params.kind === 'module'
          ? { ok: false, code: 'NOT_ALLOWED', message: 'modules are locked' }
          : { ok: true }
  )
  assert.deepEqual(await door({ action: 'content.update', params: { kind: 'article', id: 1 } }), { ok: true })
  assert.equal((await door({ action: 'content.update', params: { kind: 'module', id: 7 } })).ok, false)
  await assert.rejects(door({ action: 'boom', params: {} }), /socket closed/)
  assert.deepEqual(told, [
    { action: 'content.update', kind: 'module', id: 7, code: 'NOT_ALLOWED', reason: 'modules are locked' },
    { action: 'boom', reason: 'socket closed' }
  ])
})

test('the engine report reads the row of a bakery and of a dental clinic, old rows included', () => {
  const bakery = engineReportOf({
    state: 'applied',
    error: 'one · two',
    timings: { notes: ['one', 'two'], refused: [{ action: 'content.update', reason: 'locked' }] }
  })
  assert.deepEqual(bakery.notes, ['one', 'two'])
  assert.equal(bakery.refused[0].reason, 'locked')
  // A row from before the notes were kept whole: the joined error is split back.
  const clinic = engineReportOf({ state: 'applied', error: 'no email · 3 cards taken off', timings: {} })
  assert.deepEqual(clinic.notes, ['no email', '3 cards taken off'])
  assert.deepEqual(clinic.refused, [])
  assert.equal(engineReportOf(null), null)
  assert.deepEqual(handoffEngine(undefined), { state: null, notes: [], refused: [] })
})

test('keepEngineReport puts the report on the receipt, and never fails the check', async () => {
  const queries = []
  const db = {
    query: async (sql, args) => {
      queries.push(sql)
      if (/from site_brief/.test(sql)) return { rows: [{ state: 'applied', error: 'a note', timings: {} }] }
      return { rows: [{ id: args[0], receipt: { engine: JSON.parse(args[1]) } }] }
    }
  }
  const out = await keepEngineReport(db, { id: 'b1', site_key: 's.test', receipt: {} })
  assert.deepEqual(out.receipt.engine.notes, ['a note'])
  const broken = await keepEngineReport(
    { query: async () => Promise.reject(new Error('down')) },
    { id: 'b2' }
  )
  assert.deepEqual(broken, { id: 'b2' })
})
