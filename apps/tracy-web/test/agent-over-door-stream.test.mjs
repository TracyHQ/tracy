// Streamed model calls of agent-over-door.js (the deepseek-native wire): the answer put back together equals the
// unstreamed one, keep-alives are skipped, a provider error mid-stream and a silent connection are retried, and the
// call in flight reports its progress. The model is the scripted fake of _agent-over-door-fake.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runAgent } from '../src/lib/agent-over-door.js'
import { sseData } from '../src/lib/agent-over-door-stream.js'
import {
  DOOR,
  deepseekStreamOf,
  finalReply,
  scriptedModel,
  sseEvent,
  toolCallReply
} from './_agent-over-door-fake.mjs'

const SYSTEM = 'You answer questions about a small invented catalogue.'
const FIRST = 'Which part is called beta?'
const PRICE = { inputCacheHit: 0.03, inputCacheMiss: 0.3, output: 1.2 }
const NATIVE = {
  door: { ...DOOR, baseUrl: 'https://api.deepseek.example.test', model: 'deepseek-flash' },
  system: SYSTEM,
  firstUser: FIRST,
  wire: 'deepseek-native',
  toolImages: 'user-message',
  cacheMarkers: false,
  price: PRICE,
  sleep: async () => {}
}
const tools = () => [
  {
    name: 'read_part',
    description: 'Read one catalogue part by id.',
    parameters: { type: 'object', properties: { id: { type: 'string' } } },
    run: async ({ id }) => JSON.stringify({ id, name: 'beta' })
  }
]

const usage = (hit, miss, completion) => ({
  prompt_tokens: hit + miss,
  completion_tokens: completion,
  total_tokens: hit + miss + completion,
  prompt_tokens_details: { cached_tokens: hit },
  completion_tokens_details: { reasoning_tokens: 40 },
  prompt_cache_hit_tokens: hit,
  prompt_cache_miss_tokens: miss
})
// An unstreamed DeepSeek reply: thinking in reasoning_content, no OpenRouter reasoning field.
const native = (reply, thinking, u) => {
  const { reasoning: _openRouterField, ...message } = reply.body.choices[0].message
  return {
    body: {
      ...reply.body,
      choices: [{ ...reply.body.choices[0], message: { ...message, reasoning_content: thinking } }],
      usage: u
    }
  }
}
const script = () => [
  native(
    toolCallReply({
      calls: [['read_part', { id: 'p1', note: 'a longer argument to cut' }]],
      content: 'Reading.'
    }),
    'I should read part p1 before I answer.',
    usage(0, 1200, 300)
  ),
  native(
    finalReply({ content: '{"answer":"beta","why":"part p1 is beta"}' }),
    'Now I know.',
    usage(1100, 200, 90)
  )
]
const streamed = (replies) => replies.map((r) => ({ sse: deepseekStreamOf(r) }))
const kept = (t) => ({
  message: t.message,
  finishReason: t.finishReason,
  generationId: t.generationId,
  providerModel: t.providerModel,
  usage: t.usage,
  cost: t.cost
})

test('a streamed deepseek-native answer is saved exactly as the same answer unstreamed', async () => {
  const replies = script()
  const plain = await runAgent({ ...NATIVE, tools: tools(), fetchImpl: scriptedModel(replies).fetchImpl })
  const model = scriptedModel(streamed(replies))
  const result = await runAgent({ ...NATIVE, tools: tools(), fetchImpl: model.fetchImpl })
  assert.equal(result.answer, plain.answer)
  assert.deepEqual(result.turns.map(kept), plain.turns.map(kept))
  assert.deepEqual(result.totals, plain.totals)
  // The pieces were really put back together: content, reasoning, the tool call and the price-table cost.
  const first = result.turns[0]
  assert.equal(first.message.content, 'Reading.')
  assert.equal(first.message.reasoning_content, 'I should read part p1 before I answer.')
  assert.deepEqual(JSON.parse(first.message.tool_calls[0].function.arguments), {
    id: 'p1',
    note: 'a longer argument to cut'
  })
  assert.equal(first.message.tool_calls[0].function.name, 'read_part')
  assert.equal(first.usage.promptTokens, 1200)
  assert.equal(first.cost, 0.00072)
  // The second request sends the first answer back with its reasoning_content.
  const back = model.requests[1].body.messages.find((m) => m.role === 'assistant')
  assert.equal(back.reasoning_content, 'I should read part p1 before I answer.')
  for (const { body } of model.requests) assert.deepEqual(body.stream_options, { include_usage: true })
})

test('SSE: comments, keep-alives, CRLF and events cut across reads are read as the provider meant', async () => {
  const raw = [
    ': OPENROUTER PROCESSING\r\n\r\n',
    'data: {"a"',
    ':1}\r\n',
    '\r\n: keep-alive\n\nevent: x\ndata: [DO',
    'NE]\n\n'
  ]
  const seen = []
  let bytes = 0
  async function* body() {
    for (const r of raw) yield new TextEncoder().encode(r)
  }
  for await (const d of sseData(body(), (n) => (bytes += n))) seen.push(d)
  assert.deepEqual(seen, ['{"a":1}', '[DONE]'])
  assert.ok(bytes > 0)
})

test('an answer without the usage chunk is still an answer, with no cost guessed', async () => {
  const [, final] = script()
  const sse = deepseekStreamOf(final).filter((e) => !e.includes('"usage"'))
  const result = await runAgent({ ...NATIVE, fetchImpl: scriptedModel([{ sse }]).fetchImpl })
  assert.equal(result.answer, '{"answer":"beta","why":"part p1 is beta"}')
  assert.equal(result.turns[0].usage.completionTokens, 0)
  assert.equal(result.turns[0].cost, null)
})

test('a provider error mid-stream is the provider error; an overloaded one is retried in the same turn', async () => {
  const [, final] = script()
  const cut = deepseekStreamOf(final).slice(0, 4)
  const overloaded = [...cut, sseEvent({ error: { code: 503, message: 'Service is too busy' } })]
  const model = scriptedModel([{ sse: overloaded }, { sse: deepseekStreamOf(final) }])
  const result = await runAgent({ ...NATIVE, fetchImpl: model.fetchImpl })
  assert.equal(result.turns.length, 1)
  assert.equal(result.turns[0].retries[0].code, 'AGENT_PROVIDER_ERROR')
  assert.match(result.turns[0].retries[0].reason, /too busy/)

  const refused = [...cut, sseEvent({ error: { code: 400, message: 'bad request' } })]
  const saved = []
  await assert.rejects(
    runAgent({
      ...NATIVE,
      fetchImpl: scriptedModel([{ sse: refused }]).fetchImpl,
      onTurn: async (t) => saved.push(t)
    }),
    (e) => e.code === 'AGENT_PROVIDER_ERROR' && /bad request/.test(e.reason)
  )
  assert.equal(saved.at(-1).state, 'failed')
  assert.equal(saved.at(-1).error.attempts, 1)
})

test('a stream that stops without its end is a dropped connection, retried', async () => {
  const [, final] = script()
  const dropped = deepseekStreamOf(final).slice(0, 5)
  const model = scriptedModel([{ sse: dropped }, { sse: deepseekStreamOf(final) }])
  const result = await runAgent({ ...NATIVE, fetchImpl: model.fetchImpl })
  assert.equal(result.turns[0].retries[0].code, 'AGENT_NETWORK')
  assert.match(result.turns[0].retries[0].reason, /ended before the answer/)
})

test('a connection silent for idleMs is cut and retried', async () => {
  const [, final] = script()
  const hung = { sse: deepseekStreamOf(final).slice(0, 3), hang: true }
  const model = scriptedModel([hung, { sse: deepseekStreamOf(final) }])
  const started = Date.now()
  const result = await runAgent({ ...NATIVE, idleMs: 60, fetchImpl: model.fetchImpl })
  assert.ok(Date.now() - started < 5000)
  assert.equal(model.requests.length, 2)
  assert.equal(result.turns[0].retries[0].code, 'AGENT_TIMEOUT')
  assert.match(result.turns[0].retries[0].reason, /idle timeout/)
  assert.equal(result.turns[0].request.idleMs, 60)

  // Silent on every attempt: the turn fails as a timeout whose outcome is uncertain.
  const saved = []
  await assert.rejects(
    runAgent({
      ...NATIVE,
      idleMs: 40,
      retry: { attempts: 2 },
      fetchImpl: scriptedModel([hung, hung]).fetchImpl,
      onTurn: async (t) => saved.push(t)
    }),
    (e) => e.code === 'AGENT_TIMEOUT'
  )
  assert.equal(saved.at(-1).error.uncertain, true)
  assert.equal(saved.at(-1).error.attempts, 2)
})

test('keep-alive comments alone keep a slow call alive past idleMs', async () => {
  const [, final] = script()
  // Six keep-alives 30 ms apart: the first data arrives well after idleMs, yet no gap is as long as idleMs.
  const sse = [...Array(6).fill(': keep-alive\n\n'), ...deepseekStreamOf(final)]
  const model = scriptedModel([{ sse, gapMs: 30 }])
  const result = await runAgent({ ...NATIVE, idleMs: 120, fetchImpl: model.fetchImpl })
  assert.deepEqual(result.turns[0].retries, [])

  // Keep-alives forever still end at the total call timeout, which is not the idle one.
  const forever = { sse: Array(40).fill(': keep-alive\n\n'), gapMs: 20, hang: true }
  await assert.rejects(
    runAgent({
      ...NATIVE,
      idleMs: 5000,
      callTimeoutMs: 150,
      retry: { attempts: 1 },
      fetchImpl: scriptedModel([forever]).fetchImpl
    }),
    (e) => e.code === 'AGENT_TIMEOUT' && !/idle/.test(e.reason)
  )
})

test('the call in flight reports what it has received, and the last report lands before the answer', async () => {
  const [, final] = script()
  const events = []
  const result = await runAgent({
    ...NATIVE,
    progressMs: 20,
    fetchImpl: scriptedModel([{ sse: deepseekStreamOf(final, { size: 2 }), gapMs: 8 }]).fetchImpl,
    onProgress: async (p) => events.push({ kind: 'progress', ...p }),
    onTurn: async (t) => events.push({ kind: t.state })
  })
  assert.ok(result.answer)
  const reports = events.filter((e) => e.kind === 'progress')
  assert.ok(reports.length >= 2, `${reports.length} reports`)
  assert.ok(reports.every((r) => r.n === 0 && Date.parse(r.lastByteAt) && Date.parse(r.at)))
  assert.ok(reports.at(-1).reasoningChars + reports.at(-1).contentChars > reports[0].reasoningChars)
  assert.equal(events.at(-1).kind, 'answered')
  assert.equal(events[0].kind, 'dispatched')
})

test('an unstreamed wire reports no progress and keeps its JSON reading', async () => {
  const events = []
  const result = await runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    progressMs: 1,
    fetchImpl: scriptedModel([finalReply({ content: 'ok' })]).fetchImpl,
    onProgress: async (p) => events.push(p)
  })
  assert.equal(result.answer, 'ok')
  assert.deepEqual(events, [])
  assert.equal(result.turns[0].request.stream, undefined)
})
