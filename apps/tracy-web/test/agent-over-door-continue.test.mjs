// runAgent past a final answer and past a lost call (#303): a follow-up user message continues the same
// conversation after a final answer, and a saved turn the caller marked abandoned is sent again once.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AgentError, runAgent } from '../src/lib/agent-over-door.js'
import { DOOR, finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'

const SYSTEM = 'You answer questions about a small invented catalogue.'
const FIRST = 'Which part is called beta?'
const DETAILS = [{ type: 'reasoning.encrypted', data: 'opaque-signature-1', format: 'anthropic-claude-v1' }]
const tools = [{ name: 'read_part', parameters: { type: 'object' }, run: () => '{"id":"p1"}' }]
const run = (over) => runAgent({ door: DOOR, system: SYSTEM, firstUser: FIRST, tools, ...over })

async function firstAnswer() {
  return run({
    fetchImpl: scriptedModel([
      toolCallReply({ calls: [['read_part', { id: 'p1' }]], reasoningDetails: DETAILS }),
      finalReply({ content: '{"answer":"p1"}', reasoningDetails: DETAILS, usage: usageOf({ cost: 0.01 }) })
    ]).fetchImpl
  })
}

test('a follow-up after a final answer goes out as the next user turn, the conversation kept whole', async () => {
  const done = await firstAnswer()
  const model = scriptedModel([
    toolCallReply({ calls: [['read_part', { id: 'p2' }]] }),
    finalReply({ content: '{"answer":"p2"}' })
  ])
  const saved = []
  const result = await run({
    history: done.turns,
    followUp: 'R01 | wrong part | answer | p1 is alpha',
    fetchImpl: model.fetchImpl,
    onTurn: (t) => saved.push(t)
  })
  assert.equal(result.answer, '{"answer":"p2"}')
  assert.equal(model.requests.length, 2)
  const sent = model.requests[0].body.messages
  assert.deepEqual(
    sent.map((m) => m.role),
    ['system', 'user', 'assistant', 'tool', 'assistant', 'user']
  )
  // Reasoning details of every earlier assistant turn go back unchanged, the tool turn too.
  assert.deepEqual(sent[2].reasoning_details, DETAILS)
  assert.deepEqual(sent[4].reasoning_details, DETAILS)
  assert.match(JSON.stringify(sent[5].content), /R01 \| wrong part/)
  assert.deepEqual(saved[0].sent, [{ role: 'user', content: 'R01 | wrong part | answer | p1 is alpha' }])
  assert.equal(saved[0].n, 2)
})

test('a follow-up is ignored when the history does not end in a final answer', async () => {
  const done = await firstAnswer()
  const model = scriptedModel([finalReply({ content: 'again' })])
  const result = await run({
    history: done.turns.slice(0, 1),
    followUp: 'never sent',
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, 'again')
  assert.doesNotMatch(JSON.stringify(model.requests[0].body), /never sent/)
})

test('an abandoned last turn is sent again as a new turn that names it', async () => {
  const done = await firstAnswer()
  const lost = { ...structuredClone(done.turns[1]), state: 'abandoned' }
  for (const k of ['message', 'finishReason', 'generationId', 'providerModel', 'usage', 'cost', 'answeredAt'])
    delete lost[k]
  const model = scriptedModel([finalReply({ content: 'resent' })])
  const saved = []
  const result = await run({
    history: [done.turns[0], lost],
    fetchImpl: model.fetchImpl,
    onTurn: (t) => saved.push(t)
  })
  assert.equal(result.answer, 'resent')
  assert.equal(model.requests.length, 1)
  assert.deepEqual(
    model.requests[0].body.messages.map((m) => m.role),
    ['system', 'user', 'assistant', 'tool']
  )
  assert.deepEqual(saved[0].sent, lost.sent)
  assert.equal(saved[0].n, 2)
  assert.equal(saved[0].resendOf, 1)
  assert.deepEqual(
    result.turns.map((t) => [t.n, t.state]),
    [
      [0, 'answered'],
      [1, 'abandoned'],
      [2, 'answered']
    ]
  )
})

test('an abandoned turn before the last one is skipped, and a dispatched one is still refused', async () => {
  const done = await firstAnswer()
  const lost = { n: 1, state: 'abandoned', sent: done.turns[1].sent, request: {}, dispatchedAt: 'x' }
  const resent = { ...structuredClone(done.turns[1]), n: 2, resendOf: 1 }
  const model = scriptedModel([])
  const result = await run({ history: [done.turns[0], lost, resent], fetchImpl: model.fetchImpl })
  assert.equal(result.answer, '{"answer":"p1"}')
  const pending = { ...resent, state: 'dispatched' }
  await assert.rejects(
    run({ history: [done.turns[0], lost, pending], fetchImpl: model.fetchImpl }),
    (e) => e instanceof AgentError && e.code === 'AGENT_TURN_UNANSWERED' && e.turn === 2
  )
  assert.equal(model.requests.length, 0)
})
