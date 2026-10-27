/**
 * The picture card reads a turn's Build call and settles it on the call's RESULT text.
 *
 * dsh 0.1.7 writes session format V4: a tool result is a first-class tool-role message — the
 * answer's blocks directly in `content`, the error flag on the MESSAGE. The fixtures follow dsh
 * `dsh-v0.1.7-rc.2` `packages/session/session-format-v3-to-v4/tests/tool-role.spec.ts:30-39`
 * (`firstClassMessage`) inside the event envelope of its README "Native V4 admission". No V3
 * fixture: persistence migrates a V3 log before a Session exposes it (`session-persistence-jsonl`
 * README :82), so a plugin never sees one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeBuiltDefinition, selectBuilt } from '../src/client/built.ts'

const TOOL = 'tracy_site_build_wordpress'
const def = makeBuiltDefinition(TOOL)
const DONE = JSON.stringify({ job: 'j1', status: 'done', stages: ['seed:done', 'shot:done ok'] })

const turnStart = { type: 'turn/start', seq: 0, data: { turn: 1 } }
const call = (seq, callId, args = { action: 'start' }, name = TOOL) => ({
  type: 'tool/call',
  seq,
  data: { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) }
})
/** A V4 `tool/result` event: role `tool`, `toolCallId` = `source.callId`, flag on the message. */
const result = (seq, callId, text, isError, surfaceOp = 'append') => ({
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
      content: [{ type: 'text', text }],
      ...(isError === undefined ? {} : { isError })
    },
    ...(isError === true ? { error: { name: 'Error', code: 'TOOL_FAILED', reason: 'x' } } : {})
  }
})

function fold(events) {
  let state
  for (const event of events) {
    const m = def.match(event)
    if (m === null) continue
    state = m.role === 'start' ? def.start(undefined, { event }) : def.update({ state }, { event })
  }
  return state
}

const owner = (state) => ({
  turn: {
    data: { get: (key) => (key === `${TOOL}:built` ? { built: state.built, seq: state.seq } : undefined) }
  },
  seq: 99
})

test('🔒 V4: a settled Build call is read from the text block of the tool-role message', () => {
  for (const isError of [false, undefined]) {
    const state = fold([turnStart, call(1, 'c1'), result(2, 'c1', DONE, isError)])
    assert.deepEqual(
      state.built,
      { job: 'j1', status: 'done', rerun: false, picture: true },
      `isError ${isError}`
    )
    assert.equal(state.seq, 2)
    assert.deepEqual(selectBuilt(owner(state), TOOL), state.built)
  }
})

test('a rerun is told as one', () => {
  const state = fold([turnStart, call(1, 'c1', { action: 'rerun' }), result(2, 'c1', DONE, false)])
  assert.equal(state.built.rerun, true)
})

test('🔒 V4: a failed Build call (message.isError) shows no card, whatever its text says', () => {
  assert.equal(fold([turnStart, call(1, 'c1'), result(2, 'c1', DONE, true)]).built, null)
})

test("another tool's result, a replacement, or a non-JSON answer shows no card", () => {
  assert.equal(fold([turnStart, call(1, 'c1', {}, 'bash'), result(2, 'c1', DONE, false)]).built, null)
  assert.equal(def.match(result(2, 'c1', DONE, false, 'replace')), null)
  assert.equal(fold([turnStart, call(1, 'c1'), result(2, 'c1', 'not json', false)]).built, null)
})
