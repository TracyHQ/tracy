/**
 * A design system apply, undone from the site browser's Undo and from its Site changes row
 * (`turn-undo/index.mjs`: `newestUndoOf`, `undoDesignSystemApply`, the design-system-changed event).
 * The doors are fakes; no server, no DOM.
 *
 *   node --test packages/core/tracy-core/test/design-system-undo.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DESIGN_SYSTEM_CHANGED_EVENT,
  newestUndoOf,
  onDesignSystemChanged,
  readTurnsAnswer,
  undoDesignSystemApply
} from '../src/turn-undo/index.mjs'

const APPLY = {
  applyId: 'abcdefabcdef',
  id: 'stripe',
  name: 'Stripe',
  previous: null,
  at: '2026-10-11T10:00:00.000Z',
  by: 'a@x.test',
  undone: false,
  canUndo: true
}
const turn = (closedAt) => ({
  turnId: 's:1',
  turn: 1,
  title: 'x',
  openedAt: '2026-10-11T08:00:00.000Z',
  closedAt,
  changed: true,
  files: { count: 1 },
  undo: { state: 'available', latest: true, reasons: [] }
})

test('the turns answer reads the site’s newest apply, and drops one it cannot undo by', () => {
  assert.deepEqual(readTurnsAnswer(200, { turns: [], designSystem: APPLY }).designSystem, APPLY)
  assert.equal(readTurnsAnswer(200, { turns: [] }).designSystem, null, 'an older server')
  assert.equal(
    readTurnsAnswer(200, { turns: [], designSystem: { ...APPLY, applyId: '../x' } }).designSystem,
    null
  )
  assert.equal(
    readTurnsAnswer(200, { turns: [], designSystem: { ...APPLY, at: 'never' } }).designSystem,
    null
  )
})

test('newest first: the apply when it came after the chat’s newest change, else the turn', () => {
  const before = readTurnsAnswer(200, { turns: [turn('2026-10-11T09:00:00.000Z')], designSystem: APPLY })
  assert.equal(newestUndoOf(before).kind, 'design-system')
  const after = readTurnsAnswer(200, { turns: [turn('2026-10-11T11:00:00.000Z')], designSystem: APPLY })
  assert.equal(newestUndoOf(after).kind, 'turn')
  const undone = readTurnsAnswer(200, {
    turns: [turn('2026-10-11T09:00:00.000Z')],
    designSystem: { ...APPLY, undone: true }
  })
  assert.equal(newestUndoOf(undone).kind, 'turn')
  assert.equal(newestUndoOf(readTurnsAnswer(200, { turns: [] })), null)
})

test('undoDesignSystemApply presses the Design system door and says the change on the page', async () => {
  const calls = []
  const target = new EventTarget()
  const heard = []
  onDesignSystemChanged((d) => heard.push(d), target)
  const ok = await undoDesignSystemApply({
    siteKey: 'a.localhost',
    applyId: 'abcdefabcdef',
    target,
    fetchImpl: async (url, init) => {
      calls.push([url, init.method, init.body])
      return new Response(JSON.stringify({ ok: true, worn: { name: 'Apple' } }), { status: 200 })
    }
  })
  assert.deepEqual(ok, { kind: 'done', worn: { name: 'Apple' } })
  assert.deepEqual(calls, [
    ['/api/sites/a.localhost/design-system/undo', 'POST', '{"applyId":"abcdefabcdef"}']
  ])
  assert.deepEqual(heard, [{ siteKey: 'a.localhost', applyId: 'abcdefabcdef', undone: true }])
  assert.equal(DESIGN_SYSTEM_CHANGED_EVENT, 'tracy:design-system-changed')

  const answer = (status, body) => async () => new Response(JSON.stringify(body), { status })
  const refused = await undoDesignSystemApply({
    siteKey: 'a',
    applyId: 'abcdefabcdef',
    target,
    fetchImpl: answer(409, { code: 'DS_CHANGED_SINCE' })
  })
  assert.deepEqual(refused, { kind: 'refused', code: 'DS_CHANGED_SINCE' })
  const lost = await undoDesignSystemApply({
    siteKey: 'a',
    applyId: 'abcdefabcdef',
    target,
    fetchImpl: answer(502, { code: 'DS_WRITE_FAILED' })
  })
  assert.deepEqual(lost, { kind: 'unsure', code: 'DS_WRITE_FAILED' })
  const down = await undoDesignSystemApply({
    siteKey: 'a',
    applyId: 'abcdefabcdef',
    target,
    fetchImpl: async () => {
      throw new Error('x')
    }
  })
  assert.deepEqual(down, { kind: 'unsure', code: 'UNREACHABLE' })
  assert.equal(heard.length, 1, 'only a done undo is said')
})
