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
  HANDOFF_SOURCE,
  handoffFoldOf,
  handoffOfText,
  withoutHandoff
} from '../src/build-chat/index.mjs'

let seq = 0
const user = (text, kind = 'user', rpcId = undefined) => ({
  type: 'user/message',
  seq: ++seq,
  surfaceOp: 'append',
  data: {
    role: 'user',
    source: { kind, ...(rpcId ? { rpcId } : {}) },
    content: [{ type: 'text', text }]
  }
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

/** The conversation as the server writes it in the block: each line under its speaker. */
const SPOKEN = [
  { speaker: 'owner', text: CONVERSATION[0].text },
  { speaker: 'build-agent', text: CONVERSATION[1].text }
]
const REQUEST_ID = 'build-handoff:0d1c2b3a-4958-4776-8695-a4b3c2d1e0f9'

test('a hand off block reads back its conversation and plan; anything else is not a hand off', () => {
  const text = block({
    schema: HANDOFF_SCHEMA,
    source: HANDOFF_SOURCE,
    requestId: REQUEST_ID,
    site: { siteKey: 'larkfen.localhost' },
    conversation: SPOKEN,
    plan: PLAN
  })
  assert.deepEqual(handoffOfText(text), {
    conversation: CONVERSATION,
    plan: PLAN,
    site: { siteKey: 'larkfen.localhost' },
    requestId: REQUEST_ID
  })
  assert.equal(handoffOfText('Hello'), null)
  assert.equal(handoffOfText(block({ schema: 'other/v1', conversation: [] })), null)
  assert.equal(handoffOfText(`\`\`\`${HANDOFF_FENCE}\nnot json\n\`\`\``), null)
  // A message with no text, an unknown speaker or an unknown role is dropped, not drawn.
  const read = handoffOfText(
    block({
      schema: HANDOFF_SCHEMA,
      conversation: [
        ...SPOKEN,
        { speaker: 'system', text: 'x' },
        { role: 'system', text: 'x' },
        { speaker: 'owner', role: 'assistant', text: 'the speaker wins' },
        { speaker: 'owner', text: '' }
      ]
    })
  )
  assert.deepEqual(read.conversation, [...CONVERSATION, { role: 'user', text: 'the speaker wins' }])
  // A block written before speakers were named still reads its roles; a block naming no request id names none.
  const older = handoffOfText(block({ schema: HANDOFF_SCHEMA, conversation: CONVERSATION }))
  assert.deepEqual(older.conversation, CONVERSATION)
  assert.equal(older.requestId, null)
  const otherSource = handoffOfText(
    block({ schema: HANDOFF_SCHEMA, source: 'owner', requestId: REQUEST_ID, conversation: SPOKEN })
  )
  assert.equal(otherSource.requestId, null)
})

test('withoutHandoff cuts every hand off block whole, closed or not, and keeps the rest', () => {
  const held = 'Coach Morven Tull'
  const one = block({ schema: HANDOFF_SCHEMA, conversation: SPOKEN, keepOffSite: [held] })
  assert.equal(withoutHandoff(one), '')
  assert.equal(withoutHandoff(`Before\n${one}\nAfter`), 'Before\n\nAfter')
  assert.equal(withoutHandoff(`A\n${one}\nB\n${one}`), 'A\n\nB\n')
  // An unclosed block is cut to the end: nothing after its fence can be the person's words.
  assert.equal(withoutHandoff(`Hi\n\`\`\`${HANDOFF_FENCE}\n{"keepOffSite":["${held}"]}`), 'Hi\n')
  assert.equal(withoutHandoff('Plain words'), 'Plain words')
  assert.equal(withoutHandoff(undefined), '')
})

test('a hand off block in the server order, with what the owner keeps off the site last, reads back without it', () => {
  // The order tracy-web writes: schema, note, site, plan, conversation, keepOffSite. The held names are for the site
  // agent only: the reader never hands them to anything that draws.
  const text = block({
    schema: HANDOFF_SCHEMA,
    source: HANDOFF_SOURCE,
    requestId: REQUEST_ID,
    note: 'Only the plan is approved.',
    site: { siteKey: 'larkfen.localhost', name: 'Larkfen Rowing' },
    plan: PLAN,
    conversation: SPOKEN,
    keepOffSite: ['Coach Morven Tull']
  })
  const read = handoffOfText(text)
  assert.deepEqual(read, {
    conversation: CONVERSATION,
    plan: PLAN,
    site: { siteKey: 'larkfen.localhost', name: 'Larkfen Rowing' },
    requestId: REQUEST_ID
  })
  assert.doesNotMatch(JSON.stringify(read), /Morven/)
})

test('the site session publishes the hand off on the turn its message entered, whichever event comes first', () => {
  const text = block({
    schema: HANDOFF_SCHEMA,
    source: HANDOFF_SOURCE,
    requestId: REQUEST_ID,
    conversation: SPOKEN,
    plan: PLAN
  })
  const queued = () => user(text, 'user', REQUEST_ID)
  const opened = fold(handoffFoldOf, [
    turnStart(0),
    queued(),
    assistant('Your site is ready.'),
    turnStart(1),
    user('Make the header blue.')
  ])
  assert.equal(opened.found.turn, 0)
  assert.deepEqual(opened.found.handoff.conversation, CONVERSATION)
  const waited = fold(handoffFoldOf, [queued(), turnStart(2)])
  assert.equal(waited.found.turn, 2)
  // A session with no hand off block publishes nothing.
  assert.equal(fold(handoffFoldOf, [turnStart(0), user('Hello')]).found, null)
})

test('m12: a block pasted by hand, or one naming another request id, is not drawn as the earlier conversation', () => {
  const text = block({
    schema: HANDOFF_SCHEMA,
    source: HANDOFF_SOURCE,
    requestId: REQUEST_ID,
    conversation: SPOKEN,
    plan: PLAN
  })
  // Pasted by a seat member: the message's own request id is the browser's, not the build's.
  assert.equal(fold(handoffFoldOf, [turnStart(0), user(text, 'user', 'rpc-browser-1')]).found, null)
  assert.equal(fold(handoffFoldOf, [turnStart(0), user(text)]).found, null)
  // A block that names no request id is never the queued hand off, whatever the message's id says.
  const bare = block({ schema: HANDOFF_SCHEMA, conversation: SPOKEN, plan: PLAN })
  assert.equal(fold(handoffFoldOf, [turnStart(0), user(bare, 'user', REQUEST_ID)]).found, null)
  // A pasted block first, then the real queued one: the real one is drawn.
  const later = fold(handoffFoldOf, [
    turnStart(0),
    user(text, 'user', 'rpc-browser-1'),
    turnStart(1),
    user(text, 'user', REQUEST_ID)
  ])
  assert.equal(later.found.turn, 1)
})
