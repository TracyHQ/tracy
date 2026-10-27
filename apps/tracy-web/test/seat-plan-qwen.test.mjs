/**
 * Qwen (Alibaba Cloud Model Studio) as a broker provider connected with a pasted DashScope API key.
 * The key is proven on the OpenAI-compatible `/models` of the region it belongs to; the international
 * (Singapore) endpoint is the default and an operator may point the adapter at another region.
 * Every request goes to a fake fetch.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import * as qwen from '../src/seat-plan/wire/vendors/qwen.js'
import { PNG, JPG, pictureTurn, sentBody } from './_seat-plan-pictures.mjs'
import { PICTURE_NOT_SHOWN } from '../src/seat-plan/wire/messages.js'

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
const KEY = 'sk-0123456789abcdef9876'
const header = (init, name) => {
  const h = init.headers || {}
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase())
  return k ? h[k] : undefined
}

test('qwen signs in by pasted key, on the international endpoint unless told otherwise', () => {
  assert.equal(qwen.id, 'qwen')
  assert.equal(qwen.signIn, 'key')
  assert.equal(qwen.providerInfo().name, 'Qwen')
  assert.equal(qwen.defaults().baseUrl, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1')
})

test('a good international key is proven on /models and kept with its endpoint', async () => {
  const f = fakeFetch([json({ object: 'list', data: [{ id: 'qwen-plus' }] })])
  const { blob, identity } = await qwen.fromKey(KEY, qwen.defaults(), f.impl)
  assert.deepEqual(blob, {
    kind: 'key',
    v: 1,
    apiKey: KEY,
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  })
  assert.equal(identity.subject, createHash('sha256').update(KEY).digest('hex'))
  assert.equal(identity.label, 'API key …9876')
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models')
  assert.equal(header(f.calls[0].init, 'authorization'), `Bearer ${KEY}`)
})

// The answer DashScope gives a wrong key (measured 11/10/2026).
const wrongKey = () =>
  json(
    {
      error: {
        message: 'Incorrect API key provided.',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    },
    401
  )

test('another region is a second probe away: a Beijing key refused abroad is kept with the endpoint that took it', async () => {
  const f = fakeFetch([wrongKey(), json({ data: [] })])
  const { blob } = await qwen.fromKey(KEY, qwen.defaults(), f.impl)
  assert.deepEqual(
    f.calls.map((c) => c.url),
    [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/models'
    ]
  )
  assert.equal(blob.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  // Its turns and checks go where its key works, whatever the adapter's default.
  const sse = 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
  const turn = fakeFetch([new Response(sse, { headers: { 'content-type': 'text/event-stream' } })])
  await Array.fromAsync(
    qwen.streamOnce({ blob, config: qwen.defaults(), options: { messages: [] }, fetchImpl: turn.impl })
  )
  assert.equal(turn.calls[0].url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  const checked = fakeFetch([json({ data: [] })])
  await qwen.check(blob, qwen.defaults(), checked.impl)
  assert.equal(checked.calls[0].url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/models')
})

test('a key refused by both regions is a key error; any other answer is not', async () => {
  const both = fakeFetch([wrongKey(), wrongKey()])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), both.impl), { code: 'key' })
  const homeDown = fakeFetch([wrongKey(), json({}, 503)])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), homeDown.impl), { code: 'vendor' })
  // A refusal abroad that is not a 401 is final: no second probe.
  const denied = fakeFetch([json({ error: { message: 'Model not activated' } }, 403)])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), denied.impl), { code: 'plan' })
  assert.equal(denied.calls.length, 1)
})

test('a key whose account is out of quota or in arrears is a plan error', async () => {
  const f = fakeFetch([
    json(
      { error: { message: 'You exceeded your current quota, please check your plan and billing details' } },
      429
    )
  ])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), f.impl), { code: 'plan' })
  const denied = fakeFetch([json({ error: { message: 'Access denied, your account is in arrears' } }, 403)])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), denied.impl), { code: 'plan' })
})

test('DashScope down or slow is a vendor error', async () => {
  const down = fakeFetch([json({}, 502)])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), down.impl), { code: 'vendor' })
  const slow = fakeFetch([() => Promise.reject(new TypeError('fetch failed'))])
  await assert.rejects(qwen.fromKey(KEY, qwen.defaults(), slow.impl), { code: 'vendor' })
})

test('a turn streams through the OpenAI-compatible chat door with the key', async () => {
  const sse =
    'data: {"choices":[{"index":0,"delta":{"content":"ni hao"}}]}\n\n' +
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
  const f = fakeFetch([new Response(sse, { headers: { 'content-type': 'text/event-stream' } })])
  const chunks = await Array.fromAsync(
    qwen.streamOnce({
      blob: { kind: 'key', v: 1, apiKey: KEY },
      config: qwen.defaults(),
      options: { messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl: f.impl
    })
  )
  assert.equal(f.calls[0].url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions')
  assert.equal(header(f.calls[0].init, 'authorization'), `Bearer ${KEY}`)
  assert.equal(JSON.parse(f.calls[0].init.body).model, 'qwen-plus')
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'ni hao'))
  assert.equal(await qwen.usage(), null)
})

test('pictures: qwen is text-only and gets a placeholder per picture', async () => {
  assert.deepEqual(qwen.inputModalities('qwen-plus'), ['text'])
  const options = pictureTurn('qwen', 'qwen-plus')
  const body = await sentBody(qwen, { kind: 'key', v: 1, apiKey: 'sk-qwen-0123456789abcdef' }, options)
  const said = JSON.stringify(body)
  assert.ok(!said.includes(PNG) && !said.includes(JPG), 'a text-only model never gets the bytes')
  assert.equal(said.split(PICTURE_NOT_SHOWN).length - 1, 2, 'one placeholder per picture')
})
