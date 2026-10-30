/**
 * The text model "Apply" writes with: thinking off per provider, calls bounded, retries bounded, the key
 * never in an error. The provider is a double; what the real one answers is measured, not asserted.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createLimiter,
  createSeedModel,
  FALLBACK_MAX_OUTPUT,
  isCutFinish,
  maxOutputOf,
  noReasoningBody
} from '../src/lib/seed-model.js'

const KEY = 'sk-secret-key'
const reply = (content, extra = {}) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      ...extra
    }),
    {
      status: 200
    }
  )
const instant = () => Promise.resolve()

test('each provider is asked, in its own words, not to think', () => {
  assert.deepEqual(noReasoningBody('https://api.deepseek.com'), { thinking: { type: 'disabled' } })
  assert.deepEqual(noReasoningBody('https://openrouter.ai/api/v1'), { reasoning: { enabled: false } })
  assert.deepEqual(noReasoningBody('https://api.openai.com/v1'), {})
  assert.deepEqual(noReasoningBody('not a url'), {})
})

test('the request carries the no-reasoning field, the bearer key and the model', async () => {
  const seen = []
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'deepseek-flash' },
    fetchImpl: async (url, init) => {
      seen.push({ url, init, body: JSON.parse(init.body) })
      return reply('{"values":{}}')
    },
    sleep: instant
  })
  assert.equal(await m.generate({ system: 'S', input: { a: 1 } }), '{"values":{}}')
  assert.equal(seen[0].url, 'https://api.deepseek.com/chat/completions')
  assert.equal(seen[0].init.headers.authorization, `Bearer ${KEY}`)
  assert.equal(seen[0].body.model, 'deepseek-flash')
  assert.deepEqual(seen[0].body.thinking, { type: 'disabled' })
  assert.deepEqual(seen[0].body.messages, [
    { role: 'system', content: 'S' },
    { role: 'user', content: '{"a":1}' }
  ])
})

test('a provider that does not know the field is asked again without it, and then remembered', async () => {
  const bodies = []
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://openrouter.ai/api/v1', words: 'm' },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body)
      bodies.push(body)
      return body.reasoning
        ? new Response(JSON.stringify({ error: { message: 'unknown field reasoning' } }), { status: 400 })
        : reply('ok')
    },
    sleep: instant
  })
  assert.equal(await m.generate({ system: 's', input: 'x' }), 'ok')
  assert.equal(bodies.length, 2)
  assert.ok(bodies[0].reasoning)
  assert.equal(bodies[1].reasoning, undefined)
  await m.generate({ system: 's', input: 'y' })
  assert.equal(bodies[2].reasoning, undefined, 'not sent again once refused')
})

test('calls in flight never exceed the limit, and every one is answered', async () => {
  let active = 0
  let peak = 0
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    concurrency: 3,
    fetchImpl: async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      return reply('{}')
    },
    sleep: instant
  })
  const answers = await Promise.all(
    Array.from({ length: 12 }, (_, i) => m.generate({ system: 's', input: i }))
  )
  assert.equal(answers.length, 12)
  assert.equal(peak, 3)
  assert.equal(m.usage().calls, 12)
})

test('runs that share a bound never exceed it together, though each is allowed more alone', async () => {
  let active = 0
  let peak = 0
  const shared = createLimiter(3)
  const door = { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' }
  const fetchImpl = async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 5))
    active -= 1
    return reply('{}')
  }
  const a = createSeedModel({ model: door, concurrency: 8, shared, fetchImpl, sleep: instant })
  const b = createSeedModel({ model: door, concurrency: 8, shared, fetchImpl, sleep: instant })
  const answers = await Promise.all([
    ...Array.from({ length: 10 }, (_, i) => a.generate({ system: 's', input: i })),
    ...Array.from({ length: 10 }, (_, i) => b.generate({ system: 's', input: i }))
  ])
  assert.equal(answers.length, 20)
  assert.equal(peak, 3, 'the two runs together stayed under the shared bound')
  assert.equal(a.usage().calls, 10, 'and each still counts only its own calls')
  assert.equal(b.usage().calls, 10)
})

test('a rate limit or a server error is tried again, a refusal is not', async () => {
  let n = 0
  const flaky = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () => (++n < 3 ? new Response('{}', { status: n === 1 ? 429 : 503 }) : reply('fine')),
    sleep: instant
  })
  assert.equal(await flaky.generate({ system: 's', input: 'x' }), 'fine')
  assert.equal(n, 3)

  let calls = 0
  const refused = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () => {
      calls += 1
      return new Response(JSON.stringify({ error: { message: 'Authentication Fails' } }), { status: 401 })
    },
    sleep: instant
  })
  await assert.rejects(refused.generate({ system: 's', input: 'x' }), /Authentication Fails/)
  assert.equal(calls, 1, 'a bad key is not asked three times')
})

test('the key is never in an error, even when the provider or the network echoes it', async () => {
  const echo = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () => {
      throw new Error(`connect failed for ${KEY}`)
    },
    sleep: instant
  })
  await assert.rejects(
    echo.generate({ system: 's', input: 'x' }),
    (e) => !e.message.includes(KEY) && /redacted/.test(e.message)
  )
})

test('usage counts calls, tokens and the reasoning tokens the model spent', async () => {
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'x' } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 40,
            completion_tokens_details: { reasoning_tokens: 7 }
          }
        }),
        { status: 200 }
      ),
    sleep: instant
  })
  await m.generate({ system: 's', input: 'x' })
  await m.generate({ system: 's', input: 'y' })
  assert.deepEqual(
    { ...m.usage(), ms: 0 },
    {
      calls: 2,
      retries: 0,
      budgetWaits: 0,
      empty: 0,
      truncated: 0,
      promptTokens: 200,
      completionTokens: 80,
      reasoningTokens: 14,
      ms: 0,
      stages: { other: { calls: 2, promptTokens: 200, completionTokens: 80, reasoningTokens: 14 } }
    }
  )
})

test('a build counts its words per stage on one model: the planner, the judge asked urgently, the rest', async () => {
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'w' },
    fetchImpl: async () => reply('ok'),
    sleep: instant
  })
  await m.stage('planner').generate({ system: 's', input: 'a' })
  await m.stage('planner').generate({ system: 's', input: 'b' })
  await m
    .urgent()
    .stage('judge')
    .chat({ messages: [{ role: 'user', content: 'c' }] })
  await m
    .stage('judge')
    .urgent()
    .chat({ messages: [{ role: 'user', content: 'd' }] })
  await m.chat({ messages: [{ role: 'user', content: 'e' }] })
  const spent = m.urgent().usage()
  assert.equal(spent.calls, 5)
  assert.equal(spent.promptTokens, 50)
  assert.deepEqual(spent.stages, {
    planner: { calls: 2, promptTokens: 20, completionTokens: 10, reasoningTokens: 0 },
    judge: { calls: 2, promptTokens: 20, completionTokens: 10, reasoningTokens: 0 },
    other: { calls: 1, promptTokens: 10, completionTokens: 5, reasoningTokens: 0 }
  })
})

test('a job that asks to go first is served before the ones already waiting, in its own order', async () => {
  const limit = createLimiter(1)
  const order = []
  const slow = (name) => async () => {
    order.push(`${name}:start`)
    await new Promise((r) => setTimeout(r, 5))
    return name
  }
  const all = [
    limit(slow('running')),
    limit(slow('late-a')),
    limit(slow('late-b')),
    limit(slow('urgent-a'), { first: true }),
    limit(slow('urgent-b'), { first: true })
  ]
  await Promise.all(all)
  assert.deepEqual(
    order.map((o) => o.split(':')[0]),
    ['running', 'urgent-a', 'urgent-b', 'late-a', 'late-b']
  )
})

test('the calls of `urgent()` go ahead of the others across runs that share a bound', async () => {
  const shared = createLimiter(1)
  const door = { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' }
  const served = []
  const fetchImpl = async (_url, init) => {
    served.push(JSON.parse(init.body).messages[1].content)
    await new Promise((r) => setTimeout(r, 5))
    return reply('{}')
  }
  const other = createSeedModel({ model: door, shared, fetchImpl, sleep: instant })
  const mine = createSeedModel({ model: door, shared, fetchImpl, sleep: instant })
  await Promise.all([
    other.generate({ system: 's', input: 'other-1' }),
    other.generate({ system: 's', input: 'other-2' }),
    other.generate({ system: 's', input: 'other-3' }),
    mine.urgent().generate({ system: 's', input: 'mine-urgent' }),
    mine.urgent().chat({
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'mine-chat' }
      ]
    })
  ])
  assert.deepEqual(served, ['other-1', 'mine-urgent', 'mine-chat', 'other-2', 'other-3'])
})

test('an answer with nothing in it is asked for again, and only an empty answer every time stays empty', async () => {
  let n = 0
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () => (++n < 3 ? reply('') : reply('fine')),
    sleep: instant
  })
  assert.equal(await m.generate({ system: 's', input: 1 }), 'fine')
  assert.equal(n, 3)
  assert.equal(m.usage().empty, 2)

  let calls = 0
  const hollow = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () => (calls++, reply('  ')),
    sleep: instant
  })
  assert.equal(
    await hollow.generate({ system: 's', input: 1 }),
    '',
    'the empty answer the planners read as pending'
  )
  assert.equal(calls, 3, 'tried the bounded number of times, no more')

  const failing = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://api.deepseek.com', words: 'm' },
    fetchImpl: async () => new Response('{}', { status: 503 }),
    sleep: instant
  })
  await assert.rejects(
    failing.generate({ system: 's', input: 1 }),
    /HTTP 503/,
    'a failure is still a failure'
  )
})

test('a 400 that is not about the thinking field does not turn it off for the rest of the run', async () => {
  const bodies = []
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://openrouter.ai/api/v1', words: 'm' },
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ error: { message: 'prompt is too long' } }), { status: 400 })
    },
    sleep: instant
  })
  await assert.rejects(m.generate({ system: 's', input: 'x' }))
  await assert.rejects(m.generate({ system: 's', input: 'y' }))
  assert.ok(
    bodies.every((b) => b.reasoning),
    'the field stays on every request'
  )
})

// OpenRouter's in-flight budget refusal (openrouter.ai/docs/api-reference/limits): transient, sent with Retry-After.
const IN_FLIGHT_MESSAGE =
  'This request would exceed your available credits given your current in-flight requests'
const inFlight = (
  retryAfter = '3',
  metadata = { reason: 'in_flight_budget_exhausted', limit_source: 'openrouter_in_flight_budget' }
) =>
  new Response(JSON.stringify({ error: { code: 402, message: IN_FLIGHT_MESSAGE, metadata } }), {
    status: 402,
    headers: retryAfter === null ? {} : { 'retry-after': retryAfter }
  })
const openrouter = { apiKey: KEY, baseUrl: 'https://openrouter.ai/api/v1', words: 'm' }

test('an in-flight budget 402 is waited out for Retry-After, with jitter, then asked again', async () => {
  let n = 0
  const waits = []
  const m = createSeedModel({
    model: openrouter,
    fetchImpl: async () => (++n < 3 ? inFlight('3') : reply('fine')),
    sleep: async (ms) => {
      waits.push(ms)
    },
    random: () => 0.5
  })
  assert.equal(await m.generate({ system: 's', input: 'x' }), 'fine')
  assert.equal(n, 3)
  assert.equal(waits.length, 2)
  for (const ms of waits) assert.ok(ms > 3000 && ms <= 4000, `waited ${ms} ms: Retry-After 3 s plus jitter`)
  assert.equal(m.usage().budgetWaits, 2, 'the waits are counted for the report')
})

test('the in-flight 402 is known by its message alone when the body has no reason', async () => {
  let n = 0
  const m = createSeedModel({
    model: openrouter,
    fetchImpl: async () => (++n < 2 ? inFlight(null, undefined) : reply('fine')),
    sleep: instant
  })
  assert.equal(await m.generate({ system: 's', input: 'x' }), 'fine')
  assert.equal(n, 2)
})

test('a 402 for a call too big for the whole budget, or for no credit at all, is not asked again', async () => {
  for (const response of [
    () =>
      new Response(
        JSON.stringify({
          error: {
            code: 402,
            message: 'This request alone exceeds your budget',
            metadata: { reason: 'weight_exceeds_budget', limit_source: 'openrouter_credits' }
          }
        }),
        { status: 402 }
      ),
    () =>
      new Response(JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } }), { status: 402 })
  ]) {
    let calls = 0
    const m = createSeedModel({
      model: openrouter,
      fetchImpl: async () => {
        calls += 1
        return response()
      },
      sleep: instant
    })
    await assert.rejects(m.generate({ system: 's', input: 'x' }))
    assert.equal(calls, 1)
  }
})

test('an in-flight 402 that never clears is given up after a bounded number of waits, each wait capped', async () => {
  let calls = 0
  const waits = []
  const m = createSeedModel({
    model: openrouter,
    fetchImpl: async () => {
      calls += 1
      return inFlight('3600')
    },
    sleep: async (ms) => {
      waits.push(ms)
    }
  })
  await assert.rejects(m.generate({ system: 's', input: 'x' }), /in-flight requests/)
  assert.ok(calls > 1 && calls <= 6, `${calls} calls`)
  assert.ok(
    waits.every((ms) => ms <= 31_000),
    `waits ${waits}`
  )
  assert.ok(waits.reduce((a, b) => a + b, 0) <= 60_000, 'all the waits stay inside one call time limit')
})

test('an answer cut at the reply cap throws TRUNCATED at once: never returned, never asked again at the same size', async () => {
  let asked = 0
  const m = createSeedModel({
    model: { apiKey: KEY, baseUrl: 'https://gateway.example/v1', words: 'm' },
    fetchImpl: async () => {
      asked += 1
      return reply('{"values":{"a":"half', {
        choices: [{ finish_reason: 'length', message: { content: '{"values":{"a":"half' } }]
      })
    },
    sleep: instant
  })
  await assert.rejects(m.generate({ system: 's', input: 'x' }), { code: 'TRUNCATED' })
  assert.equal(asked, 1)
  assert.equal(m.usage().truncated, 1)
  for (const finish of ['length', 'max_tokens', 'MAX_TOKENS']) assert.ok(isCutFinish(finish), finish)
  for (const finish of ['stop', 'tool_calls', null, undefined]) assert.equal(isCutFinish(finish), false)
})

test("maxTokens 'max' asks for the model's own maximum output, read once from its listing; none stated is the fallback", async () => {
  const listing = { data: [{ id: 'gw/claude-x', root: 'claude-x', max_output_tokens: 128000 }] }
  assert.equal(maxOutputOf(listing, 'claude-x'), 128000)
  assert.equal(
    maxOutputOf({ data: [{ id: 'or/m', top_provider: { max_completion_tokens: 16000 } }] }, 'm'),
    16000
  )
  assert.equal(maxOutputOf({ data: [{ id: 'deepseek-chat' }] }, 'deepseek-chat'), null)
  for (const [answer, want] of [
    [listing, 128000],
    [{ data: [] }, FALLBACK_MAX_OUTPUT]
  ]) {
    const caps = []
    let listed = 0
    const m = createSeedModel({
      model: { apiKey: KEY, baseUrl: 'https://gateway.example/v1', words: 'claude-x' },
      fetchImpl: async (url, init) => {
        if (String(url).endsWith('/models')) {
          listed += 1
          return Response.json(answer)
        }
        caps.push(JSON.parse(init.body).max_tokens)
        return reply('{}')
      },
      sleep: instant
    })
    await m.chat({ messages: [{ role: 'user', content: 'a' }], maxTokens: 'max' })
    await m.chat({ messages: [{ role: 'user', content: 'b' }], maxTokens: 'max' })
    await m.chat({ messages: [{ role: 'user', content: 'c' }], maxTokens: 500 })
    assert.deepEqual(caps, [want, want, 500])
    assert.equal(listed, 1, 'the listing is read once')
  }
})
