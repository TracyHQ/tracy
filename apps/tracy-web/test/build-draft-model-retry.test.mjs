// The build model retries a transient provider error the way the step chain's door does (`lib/agent-over-door-retry.js`):
// five attempts with backoff, the provider's Retry-After first, a non transient error at once. No real model, no wait.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-model-retry.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { modelCallOf } from '../src/build-draft/build-model.js'

const DOOR = { apiKey: 'k', baseUrl: 'https://model.invalid/v1', words: 'invented-model' }
const answer = (content) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

/** A model whose fetch answers `replies` in turn, and the waits it was asked to make. */
function scripted(replies) {
  const waits = []
  let calls = 0
  const model = modelCallOf(DOOR, {
    fetchImpl: async () => {
      const next = replies[Math.min(calls++, replies.length - 1)]
      return typeof next === 'function' ? next() : next.clone()
    },
    retry: { sleep: async (ms) => void waits.push(ms), random: () => 0 }
  })
  return { model, waits, calls: () => calls }
}

test('a busy provider is asked again with backoff until it answers', async () => {
  const busy = new Response('{}', { status: 503 })
  const s = scripted([busy, busy, answer('{"ok":true}')])
  assert.equal(await s.model({ system: 'S', user: 'U' }), '{"ok":true}')
  assert.equal(s.calls(), 3)
  assert.deepEqual(s.waits, [2000, 4000])
})

test('the provider Retry-After is the wait; a cut body and a network error are transient too', async () => {
  const later = new Response('{}', { status: 429, headers: { 'retry-after': '3' } })
  const cut = new Response('{"choices":[', { status: 200 })
  const s = scripted([later, cut, () => Promise.reject(new TypeError('fetch failed')), answer('done')])
  assert.equal(await s.model({ system: 'S', user: 'U' }), 'done')
  assert.deepEqual(s.waits, [3000, 4000, 8000])
})

test('five attempts at most, then the call fails with its own code and the failed attempts', async () => {
  const s = scripted([new Response('{}', { status: 502 })])
  await assert.rejects(s.model({ system: 'S', user: 'U' }), (error) => {
    assert.equal(error.code, 'model_call_failed')
    assert.equal(error.retries.length, 4)
    return true
  })
  assert.equal(s.calls(), 5)
})

test('a refusal that is not transient is never asked again', async () => {
  const s = scripted([new Response('{}', { status: 401 }), answer('never')])
  await assert.rejects(s.model({ system: 'S', user: 'U' }), { code: 'model_call_failed' })
  assert.equal(s.calls(), 1)
  const empty = scripted([answer(null), answer('never')])
  await assert.rejects(empty.model({ system: 'S', user: 'U' }), {
    message: 'the build model answered no text'
  })
  assert.equal(empty.calls(), 1)
})

test('a provider error object that says busy is asked again', async () => {
  const overloaded = new Response(JSON.stringify({ error: { code: 529, message: 'Overloaded' } }), {
    status: 200
  })
  const s = scripted([overloaded, answer('fine')])
  assert.equal(await s.model({ system: 'S', user: 'U' }), 'fine')
  assert.equal(s.calls(), 2)
})

test('a step spends what its calls reported: usd only when every call has a cost', async () => {
  const { spendOf, usageCollector } = await import('../src/build-draft/model-usage.js')
  const usage = usageCollector()
  usage.onUsage({ provider: 'model.invalid', model: 'm', inputTokens: 10, outputTokens: 5, costCents: 2 })
  usage.onUsage({ provider: 'model.invalid', model: 'm', inputTokens: 12, outputTokens: 6, costCents: 3 })
  assert.deepEqual(
    { usd: spendOf(usage).usd, knownUsd: spendOf(usage).knownUsd },
    { usd: 0.05, knownUsd: 0.05 }
  )
  usage.onUsage({
    provider: 'model.invalid',
    model: 'm',
    inputTokens: null,
    outputTokens: null,
    costCents: null,
    failed: true
  })
  const spent = spendOf(usage)
  assert.equal(spent.usd, null)
  assert.equal(spent.knownUsd, 0.05)
  assert.equal(spent.calls.length, 3)
  assert.equal(spent.calls[2].failed, true)
})
