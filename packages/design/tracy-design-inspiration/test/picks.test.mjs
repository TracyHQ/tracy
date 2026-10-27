/**
 * The picks row reads a turn's `tracy_design_propose` call and settles it on the call's RESULT.
 *
 * dsh 0.1.7 writes session format V4: a tool result is a first-class tool-role message, its error
 * flag on the MESSAGE (`message.isError`), not on a `tool-result` block. The fixtures follow dsh
 * `dsh-v0.1.7-rc.2` `packages/session/session-format-v3-to-v4/tests/tool-role.spec.ts:30-39`
 * (`firstClassMessage`) inside the event envelope of its README "Native V4 admission" (every
 * surface event carries `surfaceOp`). No V3 fixture: persistence migrates a V3 log before a
 * Session exposes it (`session-persistence-jsonl` README :82), so a plugin never sees one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { picksDefinition, selectPicks, TOOL } from '../src/client/picks.ts'

const PICKS = [
  { id: 'apple', why: 'calm' },
  { id: 'airbnb', why: 'warm' },
  { id: 'stripe', why: 'crisp' }
]

const turnStart = { type: 'turn/start', seq: 0, data: { turn: 1 } }
const call = (seq, callId, name = TOOL) => ({
  type: 'tool/call',
  seq,
  data: { turn: 1, step: 1, callId, name, arguments: JSON.stringify({ picks: PICKS }) }
})
/** A V4 `tool/result` event: role `tool`, `toolCallId` = `source.callId`, flag on the message. */
const result = (seq, callId, isError, surfaceOp = 'append') => ({
  type: 'tool/result',
  seq,
  surfaceOp,
  data: {
    turn: 1,
    step: 1,
    message: {
      id: `tool-result-${callId}`,
      role: 'tool',
      source: { kind: 'tool', callId },
      toolCallId: callId,
      content: [{ type: 'text', text: '{"ok":true}' }],
      ...(isError === undefined ? {} : { isError })
    },
    ...(isError === true ? { error: { name: 'Error', code: 'TOOL_FAILED', reason: 'x' } } : {})
  }
})

/** Fold events the way ui-conversation does: `start` on the turn, `update` on each matched event. */
function fold(events) {
  let state
  for (const event of events) {
    const m = picksDefinition.match(event)
    if (m === null) continue
    state =
      m.role === 'start'
        ? picksDefinition.start(undefined, { event })
        : picksDefinition.update({ state }, { event })
  }
  return state
}

test('a settled propose call publishes its picks against the turn', () => {
  for (const isError of [false, undefined]) {
    const state = fold([turnStart, call(1, 'c1'), result(2, 'c1', isError)])
    assert.deepEqual(state.picks, PICKS, `isError ${isError}`)
    assert.equal(state.seq, 2)
  }
})

test('🔒 V4: a failed propose call (message.isError) publishes nothing', () => {
  const state = fold([turnStart, call(1, 'c1'), result(2, 'c1', true)])
  assert.deepEqual(state.picks, [])
  assert.equal(selectPicks({ turn: { data: { get: () => undefined } }, seq: 9 }), null)
})

test('a result for another tool, or a replacement of history, is not a settlement', () => {
  assert.deepEqual(fold([turnStart, call(1, 'c1', 'bash'), result(2, 'c1', false)]).picks, [])
  assert.equal(picksDefinition.match(result(2, 'c1', false, 'replace')), null)
})
