// The language of the build chat's cards (#609, decided rule: the build chat asks in the language the person is
// chatting in): the tool names it on every answer (`chatLanguage`), and the fold carries it on the templates, the plan
// and the stop it publishes, so each card is drawn in it. Invented data only.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-tool-language.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BUILD_TOOL, buildToolFoldOf } from '../src/build-chat/index.mjs'

let seq = 0
const call = (turn, callId, args) => ({
  type: 'tool/call',
  seq: ++seq,
  data: { turn, name: BUILD_TOOL, callId, arguments: JSON.stringify(args) }
})
const result = (turn, callId, value) => ({
  type: 'tool/result',
  seq: ++seq,
  surfaceOp: 'append',
  data: {
    turn,
    message: { source: { callId }, isError: false, content: [{ type: 'text', text: JSON.stringify(value) }] }
  }
})
const fold = (events) => events.reduce((state, event) => buildToolFoldOf(state, event), undefined)
const TEMPLATES = { options: [{ slug: 'ja_sample', name: 'JA Sample', version: '1.0.0', reason: 'Fits.' }] }

test('the templates and the plan carry the language the answer named', () => {
  const state = fold([
    call(1, 'c1', { action: 'templates', language: 'vi' }),
    result(1, 'c1', { ...TEMPLATES, chatLanguage: 'vi' }),
    call(2, 'c2', { action: 'plan', language: 'vi' }),
    result(2, 'c2', { plan: { id: 'plan-1', revision: 1 }, chatLanguage: 'vi' })
  ])
  assert.equal(state.language, 'vi')
  assert.equal(state.templates.language, 'vi')
  assert.equal(state.plan.language, 'vi')
})

test('a stop carries the language too, and an answer that names none keeps the last one', () => {
  const state = fold([
    call(1, 'c1', { action: 'templates', language: 'fr' }),
    result(1, 'c1', { ...TEMPLATES, chatLanguage: 'fr' }),
    call(2, 'c2', { action: 'plan' }),
    result(2, 'c2', { stopped: true, step: 'plan', rerun: true })
  ])
  assert.equal(state.stop.language, 'fr')
})

test('an answer that names no language, or not a language tag, adds no language', () => {
  const state = fold([
    call(1, 'c1', { action: 'templates' }),
    result(1, 'c1', { ...TEMPLATES, chatLanguage: 'Vietnamese' })
  ])
  assert.equal(state.language, undefined)
  assert.equal(Object.hasOwn(state.templates, 'language'), false)
})
