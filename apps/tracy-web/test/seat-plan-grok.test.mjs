/**
 * Grok (xAI) as a subscription vendor of the account broker: the OAuth door, the token blob, the
 * identity a connection is keyed on, one streamed turn and the usage read — all on a fake fetch.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as grok from '../src/seat-plan/wire/vendors/grok.js'
import { PNG, JPG, pictureTurn, sentBody } from './_seat-plan-pictures.mjs'
import { providers, models, names, identityOf, exhausted } from '../src/seat-plan/providers.js'

const jwt = (payload) => ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

/** A fetch that answers from a list of `[match, response]` rows and records every call. */
function fakeFetch(rows) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const row = rows.find(([match]) => String(url).includes(match))
    if (!row) return new Response('not found', { status: 404 })
    const answer = typeof row[1] === 'function' ? row[1](url, init) : row[1]
    return answer instanceof Response ? answer : Response.json(answer)
  }
  return { impl, calls }
}

const sse = (events) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' }
  })

test('grok is registered with its default chat model and name', () => {
  assert.equal(providers.grok, grok)
  assert.equal(models.grok, 'grok-4')
  assert.equal(names.grok, 'Grok')
  assert.deepEqual(grok.providerInfo(), { id: 'grok', name: 'Grok' })
  assert.ok(grok.defaults().models.some((m) => m.id === models.grok))
})

test('the authorize url carries PKCE S256, the state and the loopback redirect', () => {
  const url = new URL(grok.authorizeUrl(grok.defaults(), { challenge: 'chal', state: 'st8', verifier: 'v' }))
  assert.equal(url.origin + url.pathname, 'https://auth.x.ai/oauth2/authorize')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('code_challenge'), 'chal')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), 'st8')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:56121/callback')
  assert.match(url.searchParams.get('scope'), /offline_access/)
})

test('a code exchange posts a form with the verifier and answers a blob that expires', async () => {
  const idToken = jwt({ sub: 'xai-user-1', email: 'lee@x.example' })
  const { impl, calls } = fakeFetch([
    [
      'auth.x.ai/oauth2/token',
      { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 7200, id_token: idToken }
    ]
  ])
  const before = Date.now()
  const blob = await grok.exchangeCode(grok.defaults(), { verifier: 'ver' }, 'the-code', impl)
  const sent = new URLSearchParams(String(calls[0].init.body))
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(sent.get('grant_type'), 'authorization_code')
  assert.equal(sent.get('code'), 'the-code')
  assert.equal(sent.get('code_verifier'), 'ver')
  assert.equal(sent.get('redirect_uri'), 'http://127.0.0.1:56121/callback')
  assert.equal(blob.accessToken, 'at-1')
  assert.equal(blob.refreshToken, 'rt-1')
  assert.ok(blob.expiresAt >= before + 7200 * 1000 && blob.expiresAt <= Date.now() + 7200 * 1000)
  assert.equal(blob.email, 'lee@x.example')
})

test('a refresh trades the refresh token and keeps the label and email', async () => {
  const { impl, calls } = fakeFetch([['auth.x.ai/oauth2/token', { access_token: 'at-2', expires_in: 60 }]])
  const blob = await grok.refresh(
    grok.defaults(),
    { accessToken: 'at-1', refreshToken: 'rt-1', label: 'Grok', email: 'lee@x.example' },
    impl
  )
  const sent = new URLSearchParams(String(calls[0].init.body))
  assert.equal(sent.get('grant_type'), 'refresh_token')
  assert.equal(sent.get('refresh_token'), 'rt-1')
  assert.equal(blob.accessToken, 'at-2')
  assert.equal(blob.email, 'lee@x.example')
})

test('the identity is the JWT subject, from the id token or else the access token', async () => {
  const fromId = await identityOf('grok', {
    accessToken: 'opaque',
    idToken: jwt({ sub: 'xai-user-1', email: 'lee@x.example' })
  })
  assert.deepEqual(fromId, { subject: 'xai-user-1', label: 'lee@x.example' })
  const fromAccess = await identityOf('grok', { accessToken: jwt({ sub: 'xai-user-2' }) })
  assert.deepEqual(fromAccess, { subject: 'xai-user-2', label: 'Grok' })
  await assert.rejects(identityOf('grok', { accessToken: 'opaque' }), /SUBSCRIPTION_IDENTITY_UNAVAILABLE/)
})

test('one streamed turn answers text chunks and a finish', async () => {
  const { impl, calls } = fakeFetch([
    ['cli-chat-proxy.grok.com/v1/models', { data: [] }],
    [
      '/responses',
      sse([
        {
          type: 'response.output_text.delta',
          item_id: 'm1',
          output_index: 0,
          content_index: 0,
          delta: 'Hel'
        },
        { type: 'response.output_text.delta', item_id: 'm1', output_index: 0, content_index: 0, delta: 'lo' },
        { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 2 } } }
      ])
    ]
  ])
  const chunks = await Array.fromAsync(
    grok.streamOnce({
      blob: { accessToken: 'at-1' },
      config: grok.defaults(),
      options: { model: 'grok-4', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl: impl,
      headers: {}
    })
  )
  const post = calls.find((c) => c.url.endsWith('/responses'))
  assert.equal(post.url, 'https://api.x.ai/v1/responses')
  assert.equal(post.init.headers.Authorization, 'Bearer at-1')
  assert.equal(JSON.parse(post.init.body).model, 'grok-4')
  const text = chunks
    .filter((c) => c.type === 'text-delta')
    .map((c) => c.text)
    .join('')
  assert.equal(text, 'Hello')
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('a refused turn throws with the vendor status', async () => {
  const { impl } = fakeFetch([
    ['cli-chat-proxy.grok.com/v1/models', { data: [] }],
    ['/responses', new Response('unauthorized', { status: 401 })]
  ])
  const turn = Array.fromAsync(
    grok.streamOnce({
      blob: { accessToken: 'bad' },
      config: grok.defaults(),
      options: { model: 'grok-4', messages: [] },
      fetchImpl: impl,
      headers: {}
    })
  )
  await assert.rejects(turn, { status: 401 })
})

test('usage reads the billing percent, and a broken answer is no usage', async () => {
  const { impl } = fakeFetch([['v1/billing', { config: { creditUsagePercent: 42 } }]])
  assert.equal((await grok.usage({ accessToken: 'at' }, grok.defaults(), impl)).usedPercent, 42)
  const used = fakeFetch([['v1/billing', { config: { monthlyLimit: 200, used: 50 } }]])
  assert.equal((await grok.usage({ accessToken: 'at' }, grok.defaults(), used.impl)).usedPercent, 25)
  const down = fakeFetch([['v1/billing', new Response('down', { status: 500 })]])
  assert.equal(await grok.usage({ accessToken: 'at' }, grok.defaults(), down.impl), null)
})

test('the gRPC credits frame decodes to a percent', () => {
  // grpc-web frame header (5 bytes) + field 1 (message) { field 1 (fixed32 float) = 0.75 }
  const float = Buffer.alloc(4)
  float.writeFloatLE(0.75)
  const inner = Buffer.concat([Buffer.from([0x0d]), float])
  const frame = Buffer.concat([Buffer.from([0, 0, 0, 0, inner.length + 2, 0x0a, inner.length]), inner])
  assert.equal(grok.decodeGrokCreditsFrame(frame), 75)
  assert.equal(grok.decodeGrokCreditsFrame(Buffer.alloc(0)), undefined)
})

test('the model list falls back to the defaults when the catalogue is unreachable', async () => {
  const { impl } = fakeFetch([])
  const catalog = await grok.listModels({ accessToken: 'at' }, grok.defaults(), impl)
  assert.ok(JSON.stringify(catalog).includes('grok-4'))
})

test('check reads the models door and throws on a refusal', async () => {
  const ok = fakeFetch([['api.x.ai/v1/models', { data: [{ id: 'grok-4' }] }]])
  assert.equal((await grok.check({ accessToken: 'at' }, grok.defaults(), ok.impl)).ok, true)
  const no = fakeFetch([['api.x.ai/v1/models', new Response('no', { status: 403 })]])
  await assert.rejects(grok.check({ accessToken: 'at' }, grok.defaults(), no.impl), { status: 403 })
})

test('a bare 429 from grok is not exhaustion; a credit message is', () => {
  assert.equal(exhausted({ status: 429, message: 'vendor http 429: slow down' }), false)
  assert.equal(exhausted({ status: 429, message: 'vendor http 429: usage limit reached' }), true)
})

test("grok's 402 on an account without credits counts as an exhausted plan", async () => {
  const { exhausted } = await import('../src/seat-plan/providers.js')
  const error = Object.assign(
    new Error(
      'personal-team-blocked:spending-limit You have run out of credits or need a Grok subscription.'
    ),
    { status: 402 }
  )
  assert.equal(exhausted(error), true)
  assert.equal(exhausted(Object.assign(new Error('rate limited'), { status: 429 })), false)
})

test('pictures: grok carries them where its wire allows', async () => {
  assert.deepEqual(grok.inputModalities('grok-4'), ['text', 'image'])
  const options = pictureTurn('grok', 'grok-4')
  const body = await sentBody(
    grok,
    { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: Date.now() + 3600000 },
    options
  )
  const output = body.input.find((i) => i.type === 'function_call_output')
  assert.equal(typeof output.output, 'string', 'Grok gets a tool picture after the outputs, not inside one')
  const after = body.input.slice(body.input.indexOf(output) + 1).find((i) => i.role === 'user')
  assert.match(after.content[0].text, /^\[image from tool result c1\]/)
  assert.equal(after.content.at(-1).image_url, `data:image/jpeg;base64,${JPG}`)
  assert.equal(body.input[0].content.at(-1).image_url, `data:image/png;base64,${PNG}`)
})
