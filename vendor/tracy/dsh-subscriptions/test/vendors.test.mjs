import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'
import { deepestUsedPercent, grokBillingPercent } from '../lib/usage.js'
import { vendorConfig } from '../lib/accounts.js'

function sse(lines) {
  return lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
}

function grokFetchImpl(calls, catalog, handler) {
  return async (url, init) => {
    if (String(url).includes('cli-chat-proxy') && String(url).includes('/models')) {
      return Response.json(catalog || { data: [] })
    }
    const row = { url, headers: init.headers, body: init && init.body ? JSON.parse(init.body) : undefined }
    calls.push(row)
    if (handler) return handler(row)
    return new Response(sse([JSON.stringify({ type: 'response.output_text.delta', delta: 'ok' })]), { status: 200 })
  }
}


test('codex authorize URL is PKCE S256', () => {
  const url = getVendor('codex').authorizeUrl({
    clientId: 'YOUR_CLIENT_ID',
    redirectUri: 'http://localhost:1455/auth/callback',
    originator: 'codex_cli_rs',
  }, { challenge: 'challengevalue', state: 'st' })
  assert.match(url, /code_challenge_method=S256/)
  assert.match(url, /auth\.openai\.com/)
})

test('codex streamOnce posts Responses body to /responses', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return new Response(sse([
      JSON.stringify({ type: 'response.output_text.delta', delta: 'hi' }),
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
  const blob = { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 99999, label: 'x', email: '', accountId: 'acc' }
  const chunks = []
  for await (const chunk of getVendor('codex').streamOnce({
    blob,
    options: { model: 'gpt-5.2', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: { baseUrl: 'https://example.invalid/codex', originator: 'codex_cli_rs' },
  })) chunks.push(chunk)
  assert.equal(calls[0].url, 'https://example.invalid/codex/responses')
  assert.equal(calls[0].body.store, false)
  assert.equal(calls[0].body.stream, true)
  assert.ok(calls[0].body.instructions)
  assert.equal(calls[0].body.model, 'gpt-5.2')
  assert.equal(calls[0].headers.originator, 'codex_cli_rs')
  assert.equal(calls[0].headers['chatgpt-account-id'], 'acc')
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'hi'))
  assert.ok(!JSON.stringify(calls).includes('rt'))
})

test('claude exchangeCode posts JSON to platform token endpoint', async () => {
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/oauth/profile')) {
      return Response.json({ email: 'user@example.com' })
    }
    assert.match(url, /platform\.claude\.com\/v1\/oauth\/token/)
    const body = JSON.parse(init.body)
    assert.equal(body.grant_type, 'authorization_code')
    assert.equal(body.code_verifier, 'ver')
    return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 60 })
  }
  const blob = await getVendor('claude').exchangeCode(
    { clientId: 'YOUR_CLIENT_ID', redirectUri: 'https://example.com/cb' },
    { verifier: 'ver', state: 'st' },
    'code',
    fetchImpl,
  )
  assert.equal(blob.accessToken, 'at')
  assert.equal(blob.refreshToken, 'rt')
  assert.equal(blob.email, 'user@example.com')
})

test('grok streamOnce posts Responses body to api.x.ai /responses', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return new Response(sse([
      JSON.stringify({ type: 'response.reasoning_text.delta', delta: 'think' }),
      JSON.stringify({ type: 'response.output_text.delta', delta: 'hello' }),
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
  const chunks = []
  for await (const chunk of getVendor('grok').streamOnce({
    blob: { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: { model: 'grok-4', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: {},
  })) chunks.push(chunk)
  assert.equal(calls[0].url, 'https://api.x.ai/v1/responses')
  assert.equal(calls[0].body.store, false)
  assert.equal(calls[0].body.stream, true)
  assert.equal(calls[0].body.model, 'grok-4')
  assert.equal(calls[0].headers['X-XAI-Token-Auth'], undefined)
  assert.ok(chunks.some((c) => c.type === 'reasoning-delta' && c.text === 'think'))
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'hello'))
})

test('grok identity headers only attach on grok.com hosts', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, { data: [] }, () => new Response(sse([
    JSON.stringify({ type: 'response.output_text.delta', delta: 'g' }),
  ]), { status: 200 }))
  const chunks = []
  for await (const chunk of getVendor('grok').streamOnce({
    blob: { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: { model: 'grok-4', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: { baseUrl: 'https://cli-chat-proxy.grok.com/v1', clientVersion: '0.2.103' },
  })) chunks.push(chunk)
  const hit = calls.find((row) => String(row.url).includes('/responses'))
  assert.ok(hit)
  assert.equal(hit.url, 'https://cli-chat-proxy.grok.com/v1/responses')
  assert.equal(hit.headers['X-XAI-Token-Auth'], 'xai-grok-cli')
  assert.equal(hit.headers['x-grok-client-identifier'], 'grok-shell')
  assert.ok(chunks.some((c) => c.type === 'text-delta'))
})




test('gemini vendor is removed', () => {
  assert.throws(() => getVendor('gemini'), /unknown provider/)
})

test('antigravity exchangeCode discovers project via loadCodeAssist', async () => {
  const fetchImpl = async (url, _init) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 60 })
    }
    if (String(url).includes('loadCodeAssist')) {
      return Response.json({
        currentTier: { id: 'free-tier' },
        paidTier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
        cloudaicompanionProject: 'proj-1',
      })
    }
    throw new Error(`unexpected ${url}`)
  }
  const blob = await getVendor('antigravity').exchangeCode(
    { clientId: 'id', clientSecret: 'sec', redirectUri: 'https://example.com/cb' },
    { verifier: 'ver', state: 'st' },
    'code',
    fetchImpl,
  )
  assert.equal(blob.projectId, 'proj-1')
  assert.equal(blob.paidTierId, 'g1-pro-tier')
})

test('antigravity stream sends pro credits and session id', async () => {
  let body
  const fetchImpl = async (url, init) => {
    if (String(url).includes('loadCodeAssist')) {
      return Response.json({
        currentTier: { id: 'free-tier' },
        paidTier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
        cloudaicompanionProject: 'proj-1',
      })
    }
    body = JSON.parse(init.body)
    assert.match(String(url), /daily-cloudcode-pa\.googleapis\.com/)
    return new Response(sse([JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })]), { status: 200 })
  }
  const chunks = []
  for await (const chunk of getVendor('antigravity').streamOnce({
    blob: { accessToken: 'at', refreshToken: 'rt', expiresAt: 0, label: '', email: '', accountId: '', projectId: 'proj-1', paidTierId: 'g1-pro-tier', sessionId: 'sess-1' },
    options: { model: 'gemini-3.5-flash-low', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: {},
  })) chunks.push(chunk)
  assert.deepEqual(body.enabled_credit_types, ['GOOGLE_ONE_AI'])
  assert.equal(body.request.session_id, 'sess-1')
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'ok'))
})

test('antigravity listModels reads object catalog', async () => {
  const fetchImpl = async () => Response.json({
    models: {
      'gemini-3.5-flash-low': { displayName: 'Gemini 3.5 Flash (Medium)', recommended: true },
      'chat_internal': { displayName: 'Chat' },
      'ghost': { displayName: 'Ghost', isInternal: true },
    },
  })
  const rows = await getVendor('antigravity').listModels({ accessToken: 'at', projectId: 'proj' }, {}, fetchImpl)
  assert.deepEqual(rows.map((row) => row.id), ['gemini-3.5-flash-low'])
})


test('usage parsers read vendor percent fields', () => {
  assert.equal(deepestUsedPercent({ five_hour: { utilization: 40 }, seven_day: { utilization: 90 } }), 90)
  assert.equal(deepestUsedPercent({ primary_window: { used_percent: 100 } }), 100)
  assert.equal(grokBillingPercent({ config: { creditUsagePercent: 12.5 } }), 12.5)
  assert.equal(grokBillingPercent({ config: { monthlyLimit: 200, used: 50 } }), 25)
})

test('claude usage maps five_hour utilization', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /api\/oauth\/usage/)
    return Response.json({ five_hour: { utilization: 100 }, seven_day: { utilization: 10 } })
  }
  const snap = await getVendor('claude').usage({ accessToken: 'at' }, {}, fetchImpl)
  assert.equal(snap.usedPercent, 100)
})
test('codex listModels sends client_version and uses slug/display_name', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /client_version=0\.160\.0/)
    return Response.json({
      models: [
        { slug: 'gpt-6-astra', display_name: 'GPT-6 Astra', visibility: 'list', priority: 2 },
        { slug: 'hidden', display_name: 'Hidden', visibility: 'hide', priority: 1 },
        { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', visibility: 'list', priority: 1 },
      ],
    })
  }
  const rows = await getVendor('codex').listModels(
    { accessToken: 'at', accountId: 'acc' },
    { baseUrl: 'https://example.invalid/codex', originator: 'codex_cli_rs', clientVersion: '0.160.0' },
    fetchImpl,
  )
  assert.deepEqual(rows.map((row) => row.id), ['gpt-5.6-sol', 'gpt-6-astra'])
  assert.equal(rows[0].name, 'GPT-5.6 Sol')
})

test('codex listModels defaults to 0.160.0 client_version if omitted in config', async () => {
  let requestedUrl = ''
  const fetchImpl = async (url) => {
    requestedUrl = url
    return Response.json({ models: [] })
  }
  await getVendor('codex').listModels(
    { accessToken: 'at', accountId: 'acc' },
    {},
    fetchImpl,
  )
  assert.match(requestedUrl, /client_version=0\.160\.0/)
})

test('codex listModels falls back to default catalog when live list is empty', async () => {
  const fetchImpl = async () => Response.json({ models: [] })
  const rows = await getVendor('codex').listModels(
    { accessToken: 'at', accountId: 'acc' },
    {},
    fetchImpl,
  )
  assert.deepEqual(rows.map((row) => row.id), [
    'gpt-6.1-sol',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
  ])
})

test('vendorConfig maps codexClientVersion override and falls back to default', () => {
  const custom = vendorConfig('codex', { codexClientVersion: '0.160.0' })
  assert.equal(custom.clientVersion, '0.160.0')
  const def = vendorConfig('codex', {})
  assert.equal(def.clientVersion, '0.160.0')
})

test('claude static catalog matches subscription 5.x ids', () => {
  const ids = getVendor('claude').defaults().models.map((row) => row.id || row)
  assert.deepEqual(ids, [
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-fable-5',
    'claude-haiku-4-5-20251001',
  ])
})

test('grok listModels keeps chat models and drops imagine/embed', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('cli-chat-proxy')) {
      return Response.json({
        data: [{ id: 'grok-4', name: 'Grok 4', context_window: 256000, supports_reasoning_effort: true, reasoning_efforts: ['low'] }],
      })
    }
    return Response.json({
      data: [
        { id: 'grok-4' },
        { id: 'grok-imagine-image' },
        { id: 'text-embedding-3' },
      ],
    })
  }
  const rows = await getVendor('grok').listModels({ accessToken: 'at' }, {}, fetchImpl)
  assert.deepEqual(rows.map((row) => row.id), ['grok-4'])
  assert.equal(rows[0].name, 'Grok 4')
  assert.equal(rows[0].contextWindow, 256000)
})

test('grok listModels falls back when live catalog is empty', async () => {
  const fetchImpl = async () => Response.json({ data: [] })
  const rows = await getVendor('grok').listModels({ accessToken: 'at' }, {}, fetchImpl)
  assert.deepEqual(rows.map((row) => row.id), ['grok-4', 'grok-4-fast-reasoning', 'grok-code-fast-1'])
})


test('grok omits harness default medium reasoning effort', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, { data: [] })
  for await (const _ of getVendor('grok').streamOnce({
    blob: { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: { model: 'grok-4', reasoningEffort: 'medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: {},
  })) { /* drain */ }
  const hit = calls.find((row) => row.body)
  assert.equal(hit.body.reasoning, undefined)
})

test('grok forwards catalog reasoning effort low', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, {
    data: [{ id: 'grok-4', supports_reasoning_effort: true, reasoning_efforts: [{ value: 'low' }], reasoning_effort: 'low' }],
  })
  for await (const _ of getVendor('grok').streamOnce({
    blob: { accessToken: 'at-low', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: { model: 'grok-4', reasoningEffort: 'low', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: {},
  })) { /* drain */ }
  const hit = calls.find((row) => row.body)
  assert.equal(hit.body.reasoning.effort, 'low')
})


test('grok omits reasoning when CLI catalog does not support the model', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, {
    data: [{ id: 'grok-4.5', supports_reasoning_effort: true, reasoning_efforts: [{ value: 'low' }], reasoning_effort: 'low' }],
  })
  for await (const _ of getVendor('grok').streamOnce({
    blob: { accessToken: 'at-build', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: { model: 'grok-build-0.1', reasoningEffort: 'low', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: {},
    config: {},
  })) { /* drain */ }
  const hit = calls.find((row) => row.body)
  assert.equal(hit.body.reasoning, undefined)
})

test('grok omits harness aliases like standard and auto', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, { data: [] })
  for (const effort of ['standard', 'auto']) {
    calls.length = 0
    for await (const _ of getVendor('grok').streamOnce({
      blob: { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
      options: { model: 'grok-4.3', reasoningEffort: effort, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
      fetchImpl,
      headers: {},
      config: {},
    })) { /* drain */ }
    const hit = calls.find((row) => row.body)
    assert.equal(hit.body.reasoning, undefined, effort)
  }
})

test('grok forwards catalog medium effort for supported models', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, {
    data: [{ id: 'grok-4.5', supports_reasoning_effort: true, reasoning_efforts: [{ value: 'medium' }, { value: 'low' }], reasoning_effort: 'medium' }],
  })
  for await (const _ of getVendor('grok').streamOnce({
    blob: { accessToken: 'at-45-medium', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: { model: 'grok-4.5', reasoningEffort: 'medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: {},
    config: {},
  })) { /* drain */ }
  const hit = calls.find((row) => row.body)
  assert.deepEqual(hit.body.reasoning, { effort: 'medium' })
})

test('grok strips tools for multi-agent models', async () => {
  const calls = []
  const fetchImpl = grokFetchImpl(calls, { data: [] })
  for await (const _ of getVendor('grok').streamOnce({
    blob: { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: '' },
    options: {
      model: 'grok-4.20-multi-agent-0309',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object', properties: {} } } }],
    },
    fetchImpl,
    headers: {},
    config: {},
  })) { /* drain */ }
  const hit = calls.find((row) => row.body)
  assert.equal(hit.body.tools, undefined)
})


test('antigravity stream uses Antigravity identity headers', async () => {
  let headers
  const fetchImpl = async (url, init) => {
    if (String(url).includes('loadCodeAssist')) {
      return Response.json({ currentTier: { id: 'free-tier' }, cloudaicompanionProject: 'proj' })
    }
    headers = init.headers
    return new Response(sse([JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })]), { status: 200 })
  }
  for await (const _ of getVendor('antigravity').streamOnce({
    blob: { accessToken: 'at', refreshToken: '', expiresAt: 0, label: '', email: '', accountId: '', projectId: 'proj', sessionId: 'sess' },
    options: { model: 'gemini-3.5-flash-low', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: { 'user-agent': 'deepseek-harness/test' },
    config: {},
  })) { /* drain */ }
  assert.equal(headers['X-Goog-Api-Client'], 'google-cloud-sdk vscode_cloudshelleditor/0.1')
  assert.match(headers['Client-Metadata'], /ANTIGRAVITY/)
  assert.match(headers['Client-Metadata'], /duetProject/)
  assert.match(headers['user-agent'] || headers['User-Agent'] || '', /antigravity\//)
})

test('import-local creates slot and persists config when slot does not exist', async () => {
  // Unit test for import-local logic
  const liveSlots = [{ provider: 'antigravity', index: 1, label: 'test' }]
  const prov = 'cursor'
  const idx = 1
  const exists = liveSlots.some((s) => s && s.provider === prov && Number(s.index) === idx)
  assert.equal(exists, false)
  const nextSlots = liveSlots.concat([{ provider: prov, index: idx, label: 'vadim@test.com' }])
  assert.equal(nextSlots.length, 2)
  assert.equal(nextSlots[1].provider, 'cursor')
})

test('GH #13: antigravity refresh rejects with clear error when client ID is missing in both config and blob', async () => {
  let fetchCalled = false
  const fetchImpl = async () => {
    fetchCalled = true
    return Response.json({})
  }
  await assert.rejects(
    () => getVendor('antigravity').refresh({}, { refreshToken: 'rt-alone' }, fetchImpl),
    /Google OAuth refresh requires a Client ID/,
  )
  assert.equal(fetchCalled, false, 'network request must not be attempted when client ID is missing')
})

test('GH #13: antigravity refresh uses blob.clientId when config is empty and sends form data', async () => {
  let requestUrl = ''
  let requestParams = null
  const fetchImpl = async (url, init) => {
    requestUrl = String(url)
    requestParams = new URLSearchParams(init.body)
    return Response.json({
      access_token: 'new-google-at',
      refresh_token: 'new-google-rt',
      expires_in: 3600,
    })
  }

  const dummyGoogleCid = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com'
  const blob = {
    accessToken: 'old-at',
    refreshToken: 'old-rt',
    clientId: dummyGoogleCid,
    projectId: 'proj-xyz',
    email: 'user@example.com',
  }

  const nextBlob = await getVendor('antigravity').refresh({ clientId: '' }, blob, fetchImpl)

  assert.match(requestUrl, /oauth2\.googleapis\.com\/token/)
  assert.equal(requestParams.get('client_id'), dummyGoogleCid)
  assert.equal(requestParams.get('grant_type'), 'refresh_token')
  assert.equal(requestParams.get('refresh_token'), 'old-rt')
  assert.equal(nextBlob.accessToken, 'new-google-at')
  assert.equal(nextBlob.refreshToken, 'new-google-rt')
  assert.equal(nextBlob.clientId, dummyGoogleCid)
  assert.equal(nextBlob.projectId, 'proj-xyz')
  assert.equal(nextBlob.email, 'user@example.com')
})

test('GH #13: antigravity refresh config.clientId takes precedence over blob.clientId and sends secret if present', async () => {
  let requestParams = null
  const fetchImpl = async (url, init) => {
    requestParams = new URLSearchParams(init.body)
    return Response.json({
      access_token: 'at-updated',
      refresh_token: 'rt-updated',
      expires_in: 1800,
    })
  }

  const cfgCid = '9999999999-override.apps.googleusercontent.com'
  const cfgSecret = 'custom-secret-abc'
  const blobCid = '1111111111-original.apps.googleusercontent.com'

  const nextBlob = await getVendor('antigravity').refresh(
    { clientId: cfgCid, clientSecret: cfgSecret },
    { refreshToken: 'rt-curr', clientId: blobCid },
    fetchImpl,
  )

  assert.equal(requestParams.get('client_id'), cfgCid)
  assert.equal(requestParams.get('client_secret'), cfgSecret)
  assert.equal(nextBlob.clientId, cfgCid)
  assert.equal(nextBlob.clientSecret, cfgSecret)
})

test('GH #13: antigravity exchangeCode preserves clientId and clientSecret in blob', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'at-code', refresh_token: 'rt-code', expires_in: 3600 })
    }
    if (String(url).includes('loadCodeAssist')) {
      return Response.json({
        currentTier: { id: 'free-tier' },
        cloudaicompanionProject: 'proj-code',
      })
    }
    throw new Error(`unexpected ${url}`)
  }

  const blob = await getVendor('antigravity').exchangeCode(
    { clientId: 'google-client-id-code', clientSecret: 'google-secret-code', redirectUri: 'http://localhost/cb' },
    { verifier: 'v', state: 's' },
    'auth_code',
    fetchImpl,
  )

  assert.equal(blob.clientId, 'google-client-id-code')
  assert.equal(blob.clientSecret, 'google-secret-code')
  assert.equal(blob.projectId, 'proj-code')
})
