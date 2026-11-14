// The hand off of a finished build chat to the new site's chat (#611) as data: the build session's conversation as it
// was said, and, in the site session, the turn whose first message carries the hand off block. Events are recorded
// dsh shapes with invented data.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-handoff.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildHistoryFoldOf,
  HANDOFF_FENCE,
  HANDOFF_SCHEMA,
  handoffFoldOf,
  handoffOfText
} from '../src/build-chat/index.mjs'

let seq = 0
const user = (text, kind = 'user') => ({
  type: 'user/message',
  seq: ++seq,
  surfaceOp: 'append',
  data: { role: 'user', source: { kind }, content: [{ type: 'text', text }] }
})
const assistant = (text) => ({
  type: 'assistant/message',
  seq: ++seq,
  surfaceOp: 'append',
  data: { turn: 0, step: 0, message: { role: 'assistant', content: [{ type: 'text', text }] } }
})
const turnStart = (turn) => ({ type: 'turn/start', seq: ++seq, data: { turn } })
const fold = (f, events) => events.reduce((state, e) => f(state, e), undefined)

const block = (value) => `\`\`\`${HANDOFF_FENCE}\n${JSON.stringify(value)}\n\`\`\``
const CONVERSATION = [
  { role: 'user', text: 'Build a website for my tennis club. https://sunrise-tennis.example' },
  { role: 'assistant', text: 'I found 4 services and 6 reviews.' }
]
const PLAN = { id: 'plan-1', revision: 3, pages: [{ id: 'home' }] }

test('the build history keeps the owner prompts and the agent answers, in order, text only', () => {
  const history = fold(buildHistoryFoldOf, [
    turnStart(0),
    user(CONVERSATION[0].text),
    user('A file changed on disk.', 'file-change'),
    assistant(CONVERSATION[1].text),
    assistant('   '),
    { type: 'tool/call', seq: ++seq, data: { turn: 0, name: 'tracy_build', callId: 'c1', arguments: '{}' } }
  ])
  assert.deepEqual(history, CONVERSATION)
})

test('a hand off block reads back its conversation and plan; anything else is not a hand off', () => {
  const text = block({
    schema: HANDOFF_SCHEMA,
    site: { siteKey: 'larkfen.localhost' },
    conversation: CONVERSATION,
    plan: PLAN
  })
  assert.deepEqual(handoffOfText(text), {
    conversation: CONVERSATION,
    plan: PLAN,
    site: { siteKey: 'larkfen.localhost' }
  })
  assert.equal(handoffOfText('Hello'), null)
  assert.equal(handoffOfText(block({ schema: 'other/v1', conversation: [] })), null)
  assert.equal(handoffOfText(`\`\`\`${HANDOFF_FENCE}\nnot json\n\`\`\``), null)
  // A message with no text or an unknown role is dropped, not drawn.
  const read = handoffOfText(
    block({
      schema: HANDOFF_SCHEMA,
      conversation: [...CONVERSATION, { role: 'system', text: 'x' }, { role: 'user', text: '' }]
    })
  )
  assert.deepEqual(read.conversation, CONVERSATION)
})

test('the site session publishes the hand off on the turn its message entered, whichever event comes first', () => {
  const text = block({ schema: HANDOFF_SCHEMA, conversation: CONVERSATION, plan: PLAN })
  const opened = fold(handoffFoldOf, [
    turnStart(0),
    user(text),
    assistant('Your site is ready.'),
    turnStart(1),
    user('Make the header blue.')
  ])
  assert.equal(opened.found.turn, 0)
  assert.deepEqual(opened.found.handoff.conversation, CONVERSATION)
  const waited = fold(handoffFoldOf, [user(text), turnStart(2)])
  assert.equal(waited.found.turn, 2)
  // A session with no hand off block publishes nothing.
  assert.equal(fold(handoffFoldOf, [turnStart(0), user('Hello')]).found, null)
})
