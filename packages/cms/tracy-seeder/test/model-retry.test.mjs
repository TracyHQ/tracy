// A model call that fails for a reason that passes is asked again, and one that does not says why.
//
// Measured 23/09/2026 on j-se6mii (ja-voyara, local stand): OpenRouter's deepseek-chat-v3.1 took
// ~110 s per 35-slot batch; the eighth took longer than the 120 s timeout, which aborted it while
// the body was being read. `res.json()` swallowed the abort, so the seed stage died 13 minutes in
// with "model call failed: HTTP 200" — a status that says success — and every batch before it lost.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chat } from '../src/model.mjs'

const door = { url: 'https://model.test/v1/chat', key: 'k' }
const req = { model: 'm', messages: [{ role: 'user', content: 'hi' }] }
const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }], model: 'm' }), { status: 200 })

test('an aborted read, a 5xx and a 429 are asked again; the answer that comes back is used', async () => {
  for (const first of [
    () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('aborted', 'TimeoutError')
      }
    }),
    () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }),
    () => new Response('{"error":{"message":"rate"}}', { status: 429 }),
    () => {
      throw new TypeError('fetch failed')
    }
  ]) {
    let calls = 0
    const doFetch = async () => (++calls === 1 ? first() : ok())
    const answer = await chat(door, req, doFetch, { retryDelayMs: 0 })
    assert.equal(answer.text, 'hello')
    assert.equal(calls, 2)
  }
})

test('a call that keeps failing stops after three tries and names what happened, not "HTTP 200"', async () => {
  let calls = 0
  const doFetch = async () => {
    calls++
    return {
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('aborted', 'TimeoutError')
      }
    }
  }
  await assert.rejects(
    () => chat(door, req, doFetch, { retryDelayMs: 0 }),
    (e) => {
      assert.match(e.message, /timed out/)
      assert.doesNotMatch(e.message, /HTTP 200/)
      return true
    }
  )
  assert.equal(calls, 3)
})

test('a refusal the model means is not asked again', async () => {
  let calls = 0
  const doFetch = async () => {
    calls++
    return new Response('{"error":{"message":"invalid api key"}}', { status: 401 })
  }
  await assert.rejects(() => chat(door, req, doFetch, { retryDelayMs: 0 }), /invalid api key/)
  assert.equal(calls, 1)
})
