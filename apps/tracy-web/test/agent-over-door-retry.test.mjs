import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { AgentError, runAgent } from '../src/lib/agent-over-door.js'
import { DOOR, finalReply, scriptedModel, usageOf } from './_agent-over-door-fake.mjs'

const SYSTEM = 'You answer one question.'
const FIRST = 'Say done.'

const httpError = (status, message = `upstream said ${status}`, headers) => ({
  status,
  body: { error: { code: status, message } },
  ...(headers ? { headers } : {})
})

async function run(replies, extra = {}) {
  const model = scriptedModel(replies)
  const saved = []
  const waits = []
  const promise = runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    fetchImpl: model.fetchImpl,
    sleep: async (ms) => {
      waits.push(ms)
    },
    random: () => 0.5,
    onTurn: async (turn) => {
      saved.push(turn)
    },
    ...extra
  })
  return { model, saved, waits, promise }
}

test('a 429 then an answer: one turn, answered, the retry recorded on it and the cost counted once', async () => {
  const { model, saved, waits, promise } = await run([
    httpError(429, 'Rate limit exceeded'),
    finalReply({ content: 'done', usage: usageOf({ cost: 0.02 }) })
  ])
  const result = await promise
  assert.equal(result.answer, 'done')
  assert.equal(model.requests.length, 2)
  assert.deepEqual(model.requests[0].body, model.requests[1].body)
  assert.deepEqual(
    saved.map((t) => `${t.n}:${t.state}`),
    ['0:dispatched', '0:answered']
  )
  const turn = saved.at(-1)
  assert.equal(turn.retries.length, 1)
  assert.equal(turn.retries[0].attempt, 1)
  assert.equal(turn.retries[0].status, 429)
  assert.match(turn.retries[0].reason, /Rate limit exceeded/)
  assert.equal(turn.retries[0].waitMs, waits[0])
  assert.equal(turn.cost, 0.02)
  assert.equal(result.totals.cost, 0.02)
})

test('Stop during retry backoff dispatches no second call and keeps the failed attempt', async () => {
  const stop = new AbortController()
  let waiting
  const backoff = new Promise((resolve) => {
    waiting = resolve
  })
  const saved = []
  const model = scriptedModel([httpError(429, 'slow down'), finalReply({ content: 'unexpected' })])
  const run = runAgent({
    door: DOOR,
    system: SYSTEM,
    firstUser: FIRST,
    fetchImpl: model.fetchImpl,
    signal: stop.signal,
    sleep: () => {
      waiting()
      return new Promise(() => {})
    },
    onTurn: (turn) => saved.push(turn)
  })
  await backoff
  stop.abort()
  await assert.rejects(run, (error) => error instanceof AgentError && error.code === 'AGENT_ABORTED')
  assert.equal(model.requests.length, 1)
  assert.equal(saved.at(-1).state, 'failed')
  assert.equal(saved.at(-1).error.uncertain, true)
  assert.equal(saved.at(-1).retries.length, 1)
})

test('503 five times: five attempts, then the run fails with the last reason and four retries recorded', async () => {
  const replies = [1, 2, 3, 4, 5].map((i) => httpError(503, `unavailable ${i}`))
  const { model, saved, waits, promise } = await run(replies)
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AgentError)
    assert.equal(error.code, 'AGENT_PROVIDER_HTTP')
    assert.equal(error.status, 503)
    assert.match(error.reason, /unavailable 5/)
    return true
  })
  assert.equal(model.requests.length, 5)
  assert.equal(waits.length, 4)
  assert.ok(waits.every((w, i) => w <= 60_000 && (i === 0 || w >= waits[i - 1])))
  const turn = saved.at(-1)
  assert.equal(turn.state, 'failed')
  assert.deepEqual(
    turn.retries.map((r) => r.attempt),
    [1, 2, 3, 4]
  )
  assert.equal(turn.error.attempts, 5)
  assert.match(turn.error.reason, /unavailable 5/)
})

test('400, 401, 403 and 404 are never retried', async () => {
  for (const status of [400, 401, 403, 404]) {
    const { model, saved, waits, promise } = await run([httpError(status)])
    await assert.rejects(promise, (error) => error.status === status)
    assert.equal(model.requests.length, 1)
    assert.equal(waits.length, 0)
    assert.deepEqual(saved.at(-1).retries, [])
  }
})

test('a network error before any response is retried', async () => {
  const { model, saved, promise } = await run([
    { throw: new TypeError('fetch failed') },
    finalReply({ content: 'done' })
  ])
  assert.equal((await promise).answer, 'done')
  assert.equal(model.requests.length, 2)
  assert.equal(saved.at(-1).retries[0].code, 'AGENT_NETWORK')
})

test('an overloaded error object in a 200 body is retried, its reported usage counted with the answer', async () => {
  const { model, saved, promise } = await run([
    {
      body: {
        error: { code: 529, message: 'Overloaded' },
        usage: usageOf({ prompt: 10, completion: 0, reasoning: 0, cost: 0.001 })
      }
    },
    finalReply({ content: 'done', usage: usageOf({ cost: 0.02 }) })
  ])
  const result = await promise
  assert.equal(model.requests.length, 2)
  const turn = saved.at(-1)
  assert.equal(turn.retries[0].code, 'AGENT_PROVIDER_ERROR')
  assert.equal(turn.retries[0].cost, 0.001)
  assert.equal(turn.cost, 0.021)
  assert.equal(turn.usage.promptTokens, 1010)
  assert.equal(result.totals.cost, 0.021)
})

test("DeepSeek's overload answers are retried: a 503 service_unavailable_error and a 200 cut before its JSON ends", async () => {
  const cut = `{"id":"gen-cut","choices":[{"message":{"role":"assistant","content":"${'x'.repeat(400)}`
  const { model, saved, waits, promise } = await run([
    {
      status: 503,
      body: {
        error: {
          message: 'Service is too busy.',
          type: 'service_unavailable_error',
          code: 'service_unavailable_error'
        }
      }
    },
    { body: cut },
    { body: { error: { code: 'service_unavailable_error', message: 'Service is too busy.' } } },
    finalReply({ content: 'done' })
  ])
  assert.equal((await promise).answer, 'done')
  assert.equal(model.requests.length, 4)
  assert.equal(waits.length, 3)
  const [busy, notJson, inBody] = saved.at(-1).retries
  assert.deepEqual([busy.code, busy.status], ['AGENT_PROVIDER_HTTP', 503])
  assert.match(busy.reason, /too busy/)
  assert.equal(notJson.code, 'AGENT_PROVIDER_JSON')
  // The head of the raw body is kept, so the cause can be read; the rest is cut at 300 characters.
  assert.match(notJson.reason, /^not JSON: \{"id":"gen-cut"/)
  assert.ok(notJson.reason.length <= 300 + 'not JSON: '.length)
  assert.equal(inBody.code, 'AGENT_PROVIDER_ERROR')
})

test('a 200 that is never JSON fails after the attempts with the head of its body', async () => {
  const replies = [1, 2, 3, 4, 5].map(() => ({ body: '<html>upstream overloaded</html>' }))
  const { model, promise } = await run(replies)
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'AGENT_PROVIDER_JSON')
    assert.match(error.reason, /<html>upstream overloaded<\/html>/)
    return true
  })
  assert.equal(model.requests.length, 5)
})

test('an error object in a 200 body with a 400 code, or a content filter answer, is not retried', async () => {
  const bad = await run([{ body: { error: { code: 400, message: 'rate limit field is malformed' } } }])
  await assert.rejects(bad.promise, (error) => error.code === 'AGENT_PROVIDER_ERROR')
  assert.equal(bad.model.requests.length, 1)

  const filtered = await run([finalReply({ content: null, finishReason: 'content_filter' })])
  await assert.rejects(filtered.promise, (error) => error.code === 'AGENT_REFUSED')
  assert.equal(filtered.model.requests.length, 1)
})

test('Retry-After is honoured: the next attempt goes when it says, not before (fake timers)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const model = scriptedModel([
      httpError(429, 'slow down', { 'retry-after': '7' }),
      finalReply({ content: 'done' })
    ])
    const saved = []
    const promise = runAgent({
      door: DOOR,
      system: SYSTEM,
      firstUser: FIRST,
      fetchImpl: model.fetchImpl,
      onTurn: async (turn) => {
        saved.push(turn)
      }
    })
    const settle = async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
    }
    await settle()
    assert.equal(model.requests.length, 1)
    mock.timers.tick(6_999)
    await settle()
    assert.equal(model.requests.length, 1)
    mock.timers.tick(1)
    await settle()
    assert.equal(model.requests.length, 2)
    assert.equal((await promise).answer, 'done')
    assert.equal(saved.at(-1).retries[0].waitMs, 7_000)
  } finally {
    mock.timers.reset()
  }
})

test('a Retry-After longer than the longest wait is capped at 60 s', async () => {
  const { waits, promise } = await run([
    httpError(503, 'later', { 'retry-after': '600' }),
    finalReply({ content: 'done' })
  ])
  await promise
  assert.deepEqual(waits, [60_000])
})
