// The guards of agent-over-door.js (#301): a price chosen by the dispatch time (peak or off-peak), a budget that stops
// a conversation before its next call, the write step that ends the reading with tool_choice "none", and a request
// with no tools. The model is the scripted fake of _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runAgent } from '../src/lib/agent-over-door.js'
import { priceAt } from '../src/lib/agent-over-door-wire.js'
import { DOOR, finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'

const SYSTEM = 'You answer questions about a small invented catalogue.'
const FIRST = 'Which part is called beta?'
const WRITE = 'Write the answer now; no tool calls.'

const PEAK = { inputCacheHit: 0.044, inputCacheMiss: 1.32, output: 3.96 }
const OFF_PEAK = { inputCacheHit: 0.022, inputCacheMiss: 0.66, output: 1.98 }
const TIMED = {
  peak: PEAK,
  offPeak: OFF_PEAK,
  peakUtc: {
    weekdays: [1, 2, 3, 4, 5],
    hours: [
      [1, 4],
      [6, 10]
    ]
  }
}

/**
 * A read tool that records the call number each run was given; an id read again in a later call is answered as a
 * repeat (`repeated: true`), as the kit's read_kit_part does.
 */
function readTool({ calls = [] } = {}) {
  const sentAt = new Map()
  return {
    name: 'read_part',
    description: 'Read one catalogue part by id.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async ({ id }, context) => {
      calls.push([id, context?.call])
      if (sentAt.has(id) && sentAt.get(id) < context.call)
        return { text: JSON.stringify({ alreadySent: id }), repeated: true }
      sentAt.set(id, context.call)
      return JSON.stringify({ id, name: id === 'p2' ? 'beta' : 'alpha' })
    }
  }
}

const native = (reply, usage) => {
  const { reasoning: _openRouterField, ...message } = reply.body.choices[0].message
  return {
    body: {
      ...reply.body,
      choices: [{ ...reply.body.choices[0], message: { ...message, reasoning_content: 'thought' } }],
      usage
    }
  }
}

test('a timed price is chosen by the UTC dispatch time: peak hours on weekdays, off-peak otherwise', () => {
  const at = (iso) => priceAt(TIMED, new Date(iso))
  // 2026-11-02 is a Monday, 2026-11-07 a Saturday.
  assert.deepEqual(at('2026-11-02T01:00:00Z'), { table: PEAK, rate: 'peak' })
  assert.deepEqual(at('2026-11-02T03:59:59Z'), { table: PEAK, rate: 'peak' })
  assert.deepEqual(at('2026-11-02T04:00:00Z'), { table: OFF_PEAK, rate: 'off-peak' })
  assert.deepEqual(at('2026-11-02T05:30:00Z'), { table: OFF_PEAK, rate: 'off-peak' })
  assert.deepEqual(at('2026-11-06T09:59:00Z'), { table: PEAK, rate: 'peak' })
  assert.deepEqual(at('2026-11-06T10:00:00Z'), { table: OFF_PEAK, rate: 'off-peak' })
  assert.deepEqual(at('2026-11-07T02:00:00Z'), { table: OFF_PEAK, rate: 'off-peak' })
  assert.deepEqual(at('2026-11-08T07:00:00Z'), { table: OFF_PEAK, rate: 'off-peak' })
  // A single table has no rate.
  assert.deepEqual(priceAt(PEAK, new Date('2026-11-02T02:00:00Z')), { table: PEAK })
})

test('each turn is costed at the rate of its own dispatch time, and records which rate it used', async () => {
  const model = scriptedModel([
    native(toolCallReply({ calls: [['read_part', { id: 'p1' }]] }), {
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 1000
    }),
    native(finalReply({ content: 'p2' }), {
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 1000
    })
  ])
  const times = [new Date('2026-11-02T03:59:00Z'), new Date('2026-11-02T04:01:00Z')]
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    fetchImpl: model.fetchImpl,
    wire: 'deepseek-native',
    cacheMarkers: false,
    price: TIMED,
    clock: () => times.shift()
  })
  assert.deepEqual(
    result.turns.map((t) => [t.request.priceRate, t.request.price, t.cost, t.costSource]),
    [
      // (1000 x 1.32 + 100 x 3.96) / 1e6 and (1000 x 0.66 + 100 x 1.98) / 1e6.
      ['peak', PEAK, 0.001716, 'price-table'],
      ['off-peak', OFF_PEAK, 0.000858, 'price-table']
    ]
  )
  assert.equal(result.turns[0].dispatchedAt, '2026-11-02T03:59:00.000Z')
  await assert.rejects(
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      price: { ...TIMED, peakUtc: { weekdays: [8] } }
    }),
    (e) => e.code === 'AGENT_SETTINGS_INVALID'
  )
})

test('a conversation past its budget stops before the next call with AGENT_BUDGET', async () => {
  const model = scriptedModel([
    toolCallReply({ calls: [['read_part', { id: 'p1' }]], usage: usageOf({ cost: 0.6 }) }),
    toolCallReply({ calls: [['read_part', { id: 'p2' }]], usage: usageOf({ cost: 0.6 }) }),
    finalReply({ content: 'p2', usage: usageOf({ cost: 0.1 }) })
  ])
  const saved = []
  const turns = new Map()
  const error = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    fetchImpl: model.fetchImpl,
    budgetUsd: 1,
    onTurn: async (t) => {
      saved.push(t.state)
      turns.set(t.n, t)
    }
  }).catch((e) => e)
  assert.equal(error.code, 'AGENT_BUDGET')
  assert.equal(error.turn, 2)
  assert.match(error.reason, /\$1\.2000, at or past its budget of \$1\.00/)
  assert.equal(model.requests.length, 2, 'the third call went out')
  assert.deepEqual(saved, ['dispatched', 'answered', 'dispatched', 'answered'])
  // A resume over the saved turns stops the same way, before any call.
  const resumed = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    history: [...turns.values()],
    fetchImpl: model.fetchImpl,
    budgetUsd: 1
  }).catch((e) => e)
  assert.equal(resumed.code, 'AGENT_BUDGET')
  assert.equal(model.requests.length, 2)
  await assert.rejects(
    runAgent({ door: DOOR, system: SYSTEM, firstUser: FIRST, budgetUsd: 0 }),
    (e) => e.code === 'AGENT_SETTINGS_INVALID'
  )
})

test('a conversation exactly at its budget dispatches no additional model call', async () => {
  const model = scriptedModel([
    toolCallReply({ calls: [['read_part', { id: 'p1' }]], usage: usageOf({ cost: 1 }) }),
    finalReply({ content: 'must not be requested', usage: usageOf({ cost: 0.01 }) })
  ])
  const error = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    fetchImpl: model.fetchImpl,
    budgetUsd: 1
  }).catch((e) => e)
  assert.equal(error.code, 'AGENT_BUDGET')
  assert.equal(error.turn, 1)
  assert.equal(model.requests.length, 1)
})

test('a budgeted conversation stops after a call whose cost is unknown, including on resume', async () => {
  const model = scriptedModel([
    toolCallReply({ calls: [['read_part', { id: 'p1' }]] }),
    finalReply({ content: 'must not be requested', usage: usageOf({ cost: 0.01 }) })
  ])
  const answered = []
  const run = (history = []) =>
    runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      tools: [readTool()],
      history,
      fetchImpl: model.fetchImpl,
      budgetUsd: 1,
      onTurn: async (turn) => {
        if (turn.state === 'answered') answered.push(turn)
      }
    }).catch((error) => error)
  const first = await run()
  assert.equal(first.code, 'AGENT_BUDGET_UNKNOWN')
  assert.equal(first.turn, 1)
  assert.match(first.reason, /1 answered model call\(s\) have no known cost/)
  assert.equal(model.requests.length, 1)
  assert.equal(answered[0].cost, null)

  const resumed = await run(answered)
  assert.equal(resumed.code, 'AGENT_BUDGET_UNKNOWN')
  assert.equal(model.requests.length, 1, 'resume did not dispatch another model call')
})

test('an unbudgeted conversation can continue after a call whose cost is unknown', async () => {
  const model = scriptedModel([
    toolCallReply({ calls: [['read_part', { id: 'p1' }]] }),
    finalReply({ content: 'p1', usage: usageOf({ cost: 0.01 }) })
  ])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    fetchImpl: model.fetchImpl
  })
  assert.equal(result.answer, 'p1')
  assert.equal(result.totals.turnsWithoutCost, 1)
  assert.equal(model.requests.length, 2)
})

test('the write step: after N answers that called tools, the message goes out and every later request carries tool_choice none', async () => {
  const calls = []
  const script = () => [
    toolCallReply({ calls: [['read_part', { id: 'p1' }]] }),
    toolCallReply({ calls: [['read_part', { id: 'p2' }]] }),
    finalReply({ content: 'p2' })
  ]
  const model = scriptedModel(script())
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool({ calls })],
    fetchImpl: model.fetchImpl,
    writeStep: { afterToolTurns: 2, message: WRITE }
  })
  assert.equal(result.answer, 'p2')
  assert.deepEqual(
    model.requests.map((r) => r.body.tool_choice),
    [undefined, undefined, 'none']
  )
  const last = model.requests[2].body.messages
  assert.deepEqual(
    last.slice(-2).map((m) => m.role),
    ['tool', 'user']
  )
  assert.equal(last.at(-1).content.at(-1).text, WRITE)
  assert.equal(result.turns[2].request.toolChoice, 'none')
  // The tool heard which call asked: the turn number of the answer that made the call.
  assert.deepEqual(calls, [
    ['p1', 0],
    ['p2', 1]
  ])

  // A fix round on the same conversation still carries tool_choice none: the message is in the conversation.
  const again = scriptedModel([finalReply({ content: 'p2 again' })])
  await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    history: result.turns,
    followUp: 'Check it again.',
    fetchImpl: again.fetchImpl,
    writeStep: { afterToolTurns: 2, message: WRITE }
  })
  assert.equal(again.requests[0].body.tool_choice, 'none')
})

test('the write step: an answer whose every tool call was a repeat ends the reading at once', async () => {
  const model = scriptedModel([
    toolCallReply({ calls: [['read_part', { id: 'p1' }]] }),
    toolCallReply({ calls: [['read_part', { id: 'p1' }]] }),
    finalReply({ content: 'p2' })
  ])
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    tools: [readTool()],
    fetchImpl: model.fetchImpl,
    writeStep: { afterToolTurns: 50, message: WRITE }
  })
  assert.equal(result.answer, 'p2')
  assert.deepEqual(
    model.requests.map((r) => r.body.tool_choice),
    [undefined, undefined, 'none']
  )
  const sent = model.requests[2].body.messages
  assert.match(sent.at(-2).content, /alreadySent/)
  // A user message of its own (cache markers turn it into text parts).
  assert.equal(sent.at(-1).role, 'user')
  assert.equal(sent.at(-1).content.at(-1).text, WRITE)
})

test('a request with no tools sends no tools, no tool_choice, and on the DeepSeek wire no earlier reasoning_content', async () => {
  const usage = {
    prompt_tokens: 10,
    completion_tokens: 5,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 10
  }
  const model = scriptedModel([
    native(finalReply({ content: 'plan' }), usage),
    native(finalReply({ content: 'fixed' }), usage)
  ])
  const first = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    fetchImpl: model.fetchImpl,
    wire: 'deepseek-native',
    cacheMarkers: false,
    writeStep: { afterToolTurns: 1, message: WRITE }
  })
  assert.equal(first.turns[0].message.reasoning_content, 'thought', 'the reasoning is still saved')
  await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    history: first.turns,
    followUp: 'Fix it.',
    fetchImpl: model.fetchImpl,
    wire: 'deepseek-native',
    cacheMarkers: false
  })
  for (const { body } of model.requests) {
    assert.equal(body.tools, undefined)
    assert.equal(body.tool_choice, undefined)
  }
  const assistant = model.requests[1].body.messages.find((m) => m.role === 'assistant')
  assert.equal(assistant.content, 'plan')
  assert.equal(assistant.reasoning_content, undefined)
  assert.equal(first.turns[0].request.toolChoice, undefined)
  assert.deepEqual(first.turns[0].request.tools, [])
})
