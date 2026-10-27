/**
 * Kimi as a broker provider connected with a pasted API key: the key is proven against Kimi Code's
 * `/models` before anything is kept, the three failure kinds stay apart, and a turn streams through
 * the OpenAI-compatible chat door. Every request goes to a fake fetch.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import * as kimi from '../src/seat-plan/wire/vendors/kimi.js'
import { PNG, JPG, pictureTurn, sentBody } from './_seat-plan-pictures.mjs'

function fakeFetch(answers) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const next = answers.shift()
    if (!next) throw new Error(`unexpected request to ${url}`)
    return typeof next === 'function' ? next(url, init) : next
  }
  return { impl, calls }
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const KEY = 'sk-kimi-test-0123456789abcd'
const header = (init, name) => {
  const h = init.headers || {}
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase())
  return k ? h[k] : undefined
}

test('kimi signs in by pasted key and names itself plainly', () => {
  assert.equal(kimi.id, 'kimi')
  assert.equal(kimi.signIn, 'key')
  assert.equal(kimi.providerInfo().name, 'Kimi')
  assert.equal(kimi.defaults().baseUrl, 'https://api.kimi.com/coding/v1')
  assert.equal(kimi.defaults().models[0].id, 'kimi-for-coding')
})

test('a good key is proven on /models and kept as a key blob with a hashed identity', async () => {
  const f = fakeFetch([json({ object: 'list', data: [{ id: 'kimi-for-coding' }] })])
  const { blob, identity } = await kimi.fromKey(KEY, kimi.defaults(), f.impl)
  assert.deepEqual(blob, { kind: 'key', v: 1, apiKey: KEY })
  assert.equal(identity.subject, createHash('sha256').update(KEY).digest('hex'))
  assert.equal(identity.subject.length, 64)
  assert.equal(identity.label, 'API key …abcd')
  assert.equal(f.calls[0].url, 'https://api.kimi.com/coding/v1/models')
  assert.equal(f.calls[0].init.method ?? 'GET', 'GET')
  assert.equal(header(f.calls[0].init, 'authorization'), `Bearer ${KEY}`)
})

test('a rejected key is a key error', async () => {
  const f = fakeFetch([
    json(
      { error: { message: 'The API Key appears to be invalid', type: 'invalid_authentication_error' } },
      401
    )
  ])
  await assert.rejects(kimi.fromKey(KEY, kimi.defaults(), f.impl), { code: 'key' })
})

test('a key without a membership is a plan error, not a bad key', async () => {
  const f = fakeFetch([json({ error: { message: 'Your membership plan does not include Kimi Code' } }, 403)])
  await assert.rejects(kimi.fromKey(KEY, kimi.defaults(), f.impl), { code: 'plan' })
})

test('any 403 is an access refusal (plan), never a wrong key', async () => {
  // Kimi refuses a tool it does not accept as a coding agent with a 403, whatever the key.
  const f = fakeFetch([json({ error: { message: 'Forbidden', type: 'permission_denied_error' } }, 403)])
  await assert.rejects(kimi.fromKey(KEY, kimi.defaults(), f.impl), { code: 'plan' })
  const paid = fakeFetch([json({}, 402)])
  await assert.rejects(kimi.fromKey(KEY, kimi.defaults(), paid.impl), { code: 'plan' })
})

test('kimi down or slow is a vendor error', async () => {
  const down = fakeFetch([json({ error: 'upstream' }, 503)])
  await assert.rejects(kimi.fromKey(KEY, kimi.defaults(), down.impl), { code: 'vendor' })
  const slow = fakeFetch([
    () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  ])
  await assert.rejects(kimi.fromKey(KEY, kimi.defaults(), slow.impl), { code: 'vendor' })
})

test('a turn streams through the OpenAI-compatible chat door with the key', async () => {
  const sse =
    'data: {"choices":[{"index":0,"delta":{"content":"hello"}}]}\n\n' +
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
  const f = fakeFetch([new Response(sse, { headers: { 'content-type': 'text/event-stream' } })])
  const chunks = await Array.fromAsync(
    kimi.streamOnce({
      blob: { kind: 'key', v: 1, apiKey: KEY },
      config: kimi.defaults(),
      options: { model: 'kimi-for-coding', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl: f.impl
    })
  )
  assert.equal(f.calls[0].url, 'https://api.kimi.com/coding/v1/chat/completions')
  assert.equal(header(f.calls[0].init, 'authorization'), `Bearer ${KEY}`)
  const body = JSON.parse(f.calls[0].init.body)
  assert.equal(body.model, 'kimi-for-coding')
  assert.equal(body.stream, true)
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'hello'))
  assert.ok(chunks.some((c) => c.type === 'finish'))
})

test('a stream refused for the key is an HTTP error the broker can read', async () => {
  const f = fakeFetch([json({ error: { message: 'invalid key' } }, 401)])
  await assert.rejects(
    Array.fromAsync(
      kimi.streamOnce({
        blob: { kind: 'key', v: 1, apiKey: KEY },
        config: kimi.defaults(),
        options: { messages: [] },
        fetchImpl: f.impl
      })
    ),
    { status: 401 }
  )
})

test('pictures: kimi carries them where its wire allows', async () => {
  assert.deepEqual(kimi.inputModalities('kimi-for-coding'), ['text', 'image'])
  const options = pictureTurn('kimi', 'kimi-for-coding')
  const body = await sentBody(kimi, { kind: 'key', v: 1, apiKey: 'sk-kimi-0123456789abcdef' }, options)
  const [, , tool, pictures] = body.messages.filter((m) => m.role !== 'system')
  assert.equal(
    body.messages.find((m) => m.role === 'user').content[1].image_url.url,
    `data:image/png;base64,${PNG}`
  )
  assert.equal(tool.role, 'tool')
  assert.ok(!tool.content.includes(JPG), 'chat completions carries no picture in a tool message')
  assert.match(pictures.content[0].text, /^\[image from tool result c1\]/)
  assert.equal(pictures.content.at(-1).image_url.url, `data:image/jpeg;base64,${JPG}`)
})
