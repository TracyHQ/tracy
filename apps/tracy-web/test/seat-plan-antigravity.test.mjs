/**
 * Antigravity (Google Gemini subscription) through the account-subscription broker: Google OAuth with
 * PKCE, the Cloud Code Assist project pre-flight, Gemini SSE mapped to broker chunks. Fake fetch only.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as antigravity from '../src/seat-plan/wire/vendors/antigravity.js'
import { PNG, JPG, pictureTurn, sentBody } from './_seat-plan-pictures.mjs'
import { PICTURE_NOT_SHOWN } from '../src/seat-plan/wire/messages.js'

const pkce = { challenge: 'challenge-1', state: 'state-1', verifier: 'verifier-1' }

test('the authorize URL is Google OAuth with PKCE, offline access and the Antigravity scopes', () => {
  const url = new URL(antigravity.authorizeUrl(antigravity.defaults(), pkce))
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  const q = url.searchParams
  assert.match(q.get('client_id'), /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/)
  assert.equal(q.get('code_challenge'), 'challenge-1')
  assert.equal(q.get('code_challenge_method'), 'S256')
  assert.equal(q.get('state'), 'state-1')
  assert.equal(q.get('access_type'), 'offline')
  assert.equal(q.get('prompt'), 'consent')
  assert.match(q.get('redirect_uri'), /^http:\/\/localhost:\d+\//)
  assert.match(q.get('scope'), /auth\/cloud-platform/)
  assert.match(q.get('scope'), /userinfo\.email/)
})

/** A fetch that answers by URL and records every call. */
function fakeFetch(routes) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    for (const [match, answer] of routes) {
      if (String(url).includes(match)) return typeof answer === 'function' ? answer(url, init) : answer
    }
    return new Response('not found', { status: 404 })
  }
  return Object.assign(impl, { calls })
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
const form = (init) => Object.fromEntries(new URLSearchParams(String(init.body)))

test('the code exchange sends the PKCE verifier and records the account project and tier', async () => {
  const fetch = fakeFetch([
    [
      'oauth2.googleapis.com/token',
      json({
        access_token: 'ya29.access',
        refresh_token: '1//refresh',
        expires_in: 3599,
        id_token: jwt({ sub: '1234567890', email: 'person@example.com' })
      })
    ],
    [
      ':loadCodeAssist',
      json({
        cloudaicompanionProject: 'proj-42',
        currentTier: { id: 'standard-tier' },
        paidTier: { id: 'g1-pro-tier', name: 'Google AI Pro' }
      })
    ]
  ])
  const blob = await antigravity.exchangeCode(antigravity.defaults(), pkce, 'code-1', fetch)
  const sent = form(fetch.calls[0].init)
  assert.equal(sent.grant_type, 'authorization_code')
  assert.equal(sent.code, 'code-1')
  assert.equal(sent.code_verifier, 'verifier-1')
  assert.equal(sent.redirect_uri, antigravity.defaults().redirectUri)
  assert.equal(blob.accessToken, 'ya29.access')
  assert.equal(blob.refreshToken, '1//refresh')
  assert.equal(blob.email, 'person@example.com')
  assert.equal(blob.projectId, 'proj-42')
  assert.equal(blob.paidTierId, 'g1-pro-tier')
  assert.ok(blob.expiresAt > Date.now())
})

test('a refresh keeps the project and tier the exchange found', async () => {
  const fetch = fakeFetch([
    ['oauth2.googleapis.com/token', json({ access_token: 'ya29.fresh', expires_in: 3600 })]
  ])
  const old = {
    accessToken: 'old',
    refreshToken: '1//refresh',
    projectId: 'proj-42',
    paidTierId: 'g1-pro-tier',
    email: 'person@example.com'
  }
  const next = await antigravity.refresh(antigravity.defaults(), old, fetch)
  const sent = form(fetch.calls[0].init)
  assert.equal(sent.grant_type, 'refresh_token')
  assert.equal(sent.refresh_token, '1//refresh')
  assert.equal(next.accessToken, 'ya29.fresh')
  assert.equal(next.projectId, 'proj-42')
  assert.equal(next.paidTierId, 'g1-pro-tier')
})

test('the connection identity is the Google account subject, from the id_token or else userinfo', async () => {
  const { identityOf, providers, models, names } = await import('../src/seat-plan/providers.js')
  assert.equal(providers.antigravity, antigravity)
  assert.equal(models.antigravity, 'gemini-3.8-flash-medium')
  assert.equal(names.antigravity, 'Antigravity (Gemini)')
  const fromToken = await identityOf(
    'antigravity',
    { accessToken: 'a', idToken: jwt({ sub: '111', email: 'one@example.com' }) },
    fakeFetch([])
  )
  assert.deepEqual(fromToken, { subject: '111', label: 'one@example.com' })
  const fetch = fakeFetch([['oauth2/v3/userinfo', json({ sub: '222', email: 'two@example.com' })]])
  const fromUserinfo = await identityOf('antigravity', { accessToken: 'ya29.x' }, fetch)
  assert.deepEqual(fromUserinfo, { subject: '222', label: 'two@example.com' })
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer ya29.x')
  await assert.rejects(
    identityOf('antigravity', { accessToken: 'ya29.x' }, fakeFetch([['userinfo', json({})]])),
    /SUBSCRIPTION_IDENTITY_UNAVAILABLE/
  )
})

const sse = (events) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  })

test('one stream turn sends a Code Assist envelope and maps Gemini text and a function call to chunks', async () => {
  const fetch = fakeFetch([
    [
      ':streamGenerateContent',
      sse([
        { response: { candidates: [{ content: { role: 'model', parts: [{ text: 'Checking ' }] } }] } },
        {
          response: {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ functionCall: { name: 'read_page', args: { slug: 'home' } } }]
                },
                finishReason: 'STOP'
              }
            ],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, totalTokenCount: 17 }
          }
        }
      ])
    ]
  ])
  const blob = {
    accessToken: 'ya29.access',
    projectId: 'proj-42',
    paidTierId: 'g1-pro-tier',
    sessionId: 's-1'
  }
  const options = {
    model: 'gemini-3.8-flash-medium',
    system: 'You are Tracy.',
    messages: [{ role: 'user', content: 'Open the home page' }],
    tools: [
      {
        name: 'read_page',
        description: 'Read a page',
        parameters: {
          type: 'object',
          properties: { slug: { type: ['string', 'null'] } },
          required: ['slug'],
          additionalProperties: false
        }
      }
    ]
  }
  const chunks = []
  for await (const chunk of antigravity.streamOnce({
    blob,
    options,
    fetchImpl: fetch,
    config: antigravity.defaults()
  }))
    chunks.push(chunk)

  assert.equal(fetch.calls.length, 1, 'a known project and tier need no pre-flight')
  const call = fetch.calls[0]
  assert.equal(call.url, 'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse')
  assert.equal(call.init.headers.Authorization, 'Bearer ya29.access')
  const envelope = JSON.parse(call.init.body)
  assert.equal(envelope.project, 'proj-42')
  assert.equal(envelope.model, 'gemini-3.8-flash-medium')
  assert.deepEqual(envelope.enabled_credit_types, ['GOOGLE_ONE_AI'])
  assert.equal(envelope.request.session_id, 's-1')
  assert.deepEqual(envelope.request.contents, [{ role: 'user', parts: [{ text: 'Open the home page' }] }])
  assert.equal(envelope.request.systemInstruction.parts[0].text, 'You are Tracy.')
  const [declaration] = envelope.request.tools[0].functionDeclarations
  assert.equal(declaration.name, 'read_page')
  assert.equal(declaration.parameters.properties.slug.type, 'string')
  assert.equal(declaration.parameters.additionalProperties, undefined, 'Gemini rejects additionalProperties')

  assert.deepEqual(
    chunks.filter((c) => c.type !== 'usage'),
    [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Checking ' },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 1,
        id: 'gemini_call_1',
        name: 'read_page',
        argumentsDelta: '{"slug":"home"}'
      },
      { type: 'finish', reason: { kind: 'tool-calls' } }
    ]
  )
  const usage = chunks.find((c) => c.type === 'usage').usage
  assert.equal(usage.input, 12)
  assert.equal(usage.output, 5)
})

test('a stream without a known project asks Code Assist for it first', async () => {
  const fetch = fakeFetch([
    [':loadCodeAssist', json({ cloudaicompanionProject: { id: 'proj-7' }, paidTier: { id: 'g1-pro-tier' } })],
    [
      ':streamGenerateContent',
      sse([{ response: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] } }])
    ]
  ])
  const chunks = []
  for await (const chunk of antigravity.streamOnce({
    blob: { accessToken: 'ya29.access' },
    options: { model: 'gemini-3.8-flash-medium', messages: [{ role: 'user', content: 'hi' }] },
    fetchImpl: fetch
  }))
    chunks.push(chunk)
  assert.deepEqual(
    fetch.calls.map((c) => c.url.split(':').at(-1).split('?')[0]),
    ['loadCodeAssist', 'streamGenerateContent']
  )
  assert.equal(JSON.parse(fetch.calls[1].init.body).project, 'proj-7')
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('a refused stream surfaces the HTTP status the broker routes on', async () => {
  const body = JSON.stringify({
    error: {
      code: 429,
      message: 'Resource has been exhausted (e.g. check quota).',
      status: 'RESOURCE_EXHAUSTED'
    }
  })
  const fetch = fakeFetch([[':streamGenerateContent', new Response(body, { status: 429 })]])
  const run = async () => {
    for await (const _ of antigravity.streamOnce({
      blob: { accessToken: 'a', projectId: 'p', paidTierId: 't' },
      options: { model: 'gemini-3.8-flash-medium', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl: fetch
    }));
  }
  await assert.rejects(run, (error) => error.status === 429 && /quota or rate limit/.test(error.message))
})

test('the runtime model context names Google, not another vendor', async () => {
  const { withModelContext } = await import('../src/seat-plan/model-context.js')
  const out = withModelContext({ messages: [] }, 'antigravity', 'gemini-3.8-flash-medium')
  const context = out.messages.at(-1).content
  assert.match(context, /Provider: Google \(Antigravity \/ Gemini\)\./)
  assert.doesNotMatch(context, /OpenAI|Anthropic/)
})

test('usage reads the Code Assist quota buckets as used percent', async () => {
  const reset = '2026-10-11T00:00:00Z'
  const fetch = fakeFetch([
    [
      ':retrieveUserQuota',
      json({
        buckets: [
          { modelId: 'gemini-3.8-flash-medium', remainingFraction: 0.25, resetTime: reset },
          { modelId: 'gemini-3.1-pro-low', remainingFraction: 1 }
        ]
      })
    ]
  ])
  const snap = await antigravity.usage(
    { accessToken: 'ya29.access', projectId: 'p' },
    antigravity.defaults(),
    fetch
  )
  assert.equal(fetch.calls[0].url, 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota')
  assert.equal(snap.windows.length, 1, 'an untouched model bucket is not shown')
  assert.equal(snap.windows[0].id, 'gemini-3.8-flash-medium')
  assert.equal(snap.windows[0].usedPercent, 75)
  assert.equal(snap.windows[0].resetAt, Date.parse(reset))
  assert.equal(
    await antigravity.usage({ accessToken: 'x' }, {}, fakeFetch([[':retrieveUserQuota', json({}, 500)]])),
    null
  )
})

test('a Google rate limit is not exhaustion; a quota-exceeded answer is', async () => {
  const { exhausted } = await import('../src/seat-plan/providers.js')
  const perMinute = Object.assign(
    new Error(
      'Google Antigravity quota or rate limit reached. (vendor http 429: Resource has been exhausted (e.g. check quota).)'
    ),
    { status: 429 }
  )
  assert.equal(exhausted(perMinute), false)
  const daily = Object.assign(
    new Error('vendor http 429: Quota exceeded for quota metric generate_content_requests'),
    { status: 429 }
  )
  assert.equal(exhausted(daily), true)
})

test('the model list comes from Code Assist, with the built-in list when it does not answer', async () => {
  const fetch = fakeFetch([
    [
      ':fetchAvailableModels',
      json({
        models: {
          'gemini-3.8-flash-medium': { displayName: 'Gemini 3.8 Flash', recommended: true },
          chat_internal: {},
          hidden: { isInternal: true }
        }
      })
    ]
  ])
  assert.deepEqual(await antigravity.listModels({ accessToken: 'a' }, antigravity.defaults(), fetch), [
    {
      provider: 'antigravity',
      id: 'gemini-3.8-flash-medium',
      name: 'Gemini 3.8 Flash',
      description: 'Recommended'
    }
  ])
  const fallback = await antigravity.listModels({ accessToken: 'a' }, antigravity.defaults(), fakeFetch([]))
  assert.equal(fallback[0].id, 'gemini-3.8-flash-medium')
})

test('pictures: antigravity is text-only and gets a placeholder per picture', async () => {
  assert.deepEqual(antigravity.inputModalities('gemini-3.8-flash-medium'), ['text'])
  const options = pictureTurn('antigravity', 'gemini-3.8-flash-medium')
  const body = await sentBody(
    antigravity,
    { accessToken: 'ya29.access', projectId: 'proj-42', paidTierId: 'g1-pro-tier', sessionId: 's-1' },
    options
  )
  const said = JSON.stringify(body)
  assert.ok(!said.includes(PNG) && !said.includes(JPG), 'a text-only model never gets the bytes')
  assert.equal(said.split(PICTURE_NOT_SHOWN).length - 1, 2, 'one placeholder per picture')
})
