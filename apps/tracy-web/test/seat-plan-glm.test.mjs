/**
 * GLM (Z.ai Coding Plan) as a broker provider connected with a pasted API key. The key is proven on
 * the plan's quota door, which answers HTTP 200 with `{ success: false, code }` for a bad key
 * (measured 11/10/2026), so the body decides as much as the status. Every request goes to a fake fetch.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import * as glm from '../src/seat-plan/wire/vendors/glm.js'
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
const KEY = 'zai.0123456789abcdefWXYZ'
const header = (init, name) => {
  const h = init.headers || {}
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase())
  return k ? h[k] : undefined
}

test('glm signs in by pasted key and names itself plainly', () => {
  assert.equal(glm.id, 'glm')
  assert.equal(glm.signIn, 'key')
  assert.equal(glm.providerInfo().name, 'GLM')
  assert.equal(glm.defaults().baseUrl, 'https://api.z.ai/api/coding/paas/v4')
  assert.equal(glm.defaults().quotaUrl, 'https://api.z.ai/api/monitor/usage/quota/limit')
})

test('a good key is proven on the quota door and kept as a key blob with a hashed identity', async () => {
  const f = fakeFetch([json({ code: 200, msg: 'Operation successful', success: true, data: { limits: [] } })])
  const { blob, identity } = await glm.fromKey(KEY, glm.defaults(), f.impl)
  assert.deepEqual(blob, { kind: 'key', v: 1, apiKey: KEY })
  assert.equal(identity.subject, createHash('sha256').update(KEY).digest('hex'))
  assert.equal(identity.label, 'API key …WXYZ')
  assert.equal(f.calls[0].url, 'https://api.z.ai/api/monitor/usage/quota/limit')
  assert.equal(header(f.calls[0].init, 'authorization'), `Bearer ${KEY}`)
})

test('a rejected key is a key error, whether Z.ai says so in the status or only in the body', async () => {
  const inBody = fakeFetch([json({ code: 401, msg: 'token expired or incorrect', success: false })])
  await assert.rejects(glm.fromKey(KEY, glm.defaults(), inBody.impl), { code: 'key' })
  const inStatus = fakeFetch([json({ error: { code: '401', message: 'token expired or incorrect' } }, 401)])
  await assert.rejects(glm.fromKey(KEY, glm.defaults(), inStatus.impl), { code: 'key' })
  for (const code of [1000, 1001, 1002, 1003, 1004, 1005]) {
    const authCode = fakeFetch([json({ code, msg: 'Authentication Failed', success: false })])
    await assert.rejects(glm.fromKey(KEY, glm.defaults(), authCode.impl), { code: 'key' }, String(code))
  }
})

test('a key with no coding plan or balance is a plan error', async () => {
  const expired = fakeFetch([
    json({
      code: 1309,
      msg: 'Your GLM Coding Plan package has expired and is temporarily unavailable.',
      success: false
    })
  ])
  await assert.rejects(glm.fromKey(KEY, glm.defaults(), expired.impl), { code: 'plan' })
  const forbidden = fakeFetch([json({ error: { message: 'No coding plan subscription' } }, 403)])
  await assert.rejects(glm.fromKey(KEY, glm.defaults(), forbidden.impl), { code: 'plan' })
})

test('Z.ai down or slow is a vendor error', async () => {
  const down = fakeFetch([json({ error: 'Internal Error' }, 500)])
  await assert.rejects(glm.fromKey(KEY, glm.defaults(), down.impl), { code: 'vendor' })
  const slow = fakeFetch([() => Promise.reject(new DOMException('timed out', 'TimeoutError'))])
  await assert.rejects(glm.fromKey(KEY, glm.defaults(), slow.impl), { code: 'vendor' })
})

test('a turn streams through the coding plan chat door with the key', async () => {
  const sse =
    'data: {"choices":[{"index":0,"delta":{"content":"xin chao"}}]}\n\n' +
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
  const f = fakeFetch([new Response(sse, { headers: { 'content-type': 'text/event-stream' } })])
  const chunks = await Array.fromAsync(
    glm.streamOnce({
      blob: { kind: 'key', v: 1, apiKey: KEY },
      config: glm.defaults(),
      options: { messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl: f.impl
    })
  )
  assert.equal(f.calls[0].url, 'https://api.z.ai/api/coding/paas/v4/chat/completions')
  assert.equal(header(f.calls[0].init, 'authorization'), `Bearer ${KEY}`)
  assert.equal(JSON.parse(f.calls[0].init.body).model, glm.defaults().models[0].id)
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'xin chao'))
})

test('usage reads the quota door and is null when it does not answer', async () => {
  const f = fakeFetch([json({ code: 200, success: true, data: { percentage: 42 } })])
  assert.deepEqual(await glm.usage({ kind: 'key', v: 1, apiKey: KEY }, glm.defaults(), f.impl), {
    usedPercent: 42
  })
  const down = fakeFetch([json({}, 500)])
  assert.equal(await glm.usage({ kind: 'key', v: 1, apiKey: KEY }, glm.defaults(), down.impl), null)
})

test('pictures: glm is text-only and gets a placeholder per picture', async () => {
  assert.deepEqual(glm.inputModalities('glm-5.2'), ['text'])
  const options = pictureTurn('glm', 'glm-5.2')
  const body = await sentBody(glm, { kind: 'key', v: 1, apiKey: KEY }, options)
  const said = JSON.stringify(body)
  assert.ok(!said.includes(PNG) && !said.includes(JPG), 'a text-only model never gets the bytes')
  assert.equal(said.split(PICTURE_NOT_SHOWN).length - 1, 2, 'one placeholder per picture')
})
