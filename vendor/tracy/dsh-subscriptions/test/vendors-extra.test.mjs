import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'
import * as copilot from '../lib/vendors/copilot.js'
import * as ernie from '../lib/vendors/ernie.js'

function sse(lines) {
  return lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
}

// The audit block (issue #263) found eight built-in vendors without any
// dedicated coverage. These suites pin the registry wiring, the vendor
// catalogs and the request shapes so future refactors cannot silently
// detach them from lib/vendors/index.js.

const VENDORS = [
  ['copilot', 'GitHub Copilot', 'https://github.com/login/device'],
  ['qwen', 'Alibaba Qwen', 'https://bailian.console.aliyun.com/'],
  ['ernie', 'Baidu ERNIE', 'https://console.bce.baidu.com/qianfan'],
  ['spark', 'iFlytek Spark', 'https://xinghuo.xfyun.cn/'],
  ['jetbrains', 'JetBrains AI', 'https://account.jetbrains.com/'],
  ['perplexity', 'Perplexity Pro', 'https://www.perplexity.ai/'],
  ['replit', 'Replit Core', 'https://replit.com/'],
  ['cody', 'Sourcegraph Cody', 'https://sourcegraph.com/'],
]

test('BUILTIN_PROVIDERS matches the builtins registry', async () => {
  const { BUILTIN_PROVIDERS } = await import('../lib/refs.js')
  const registry = await import('../lib/vendors/index.js')
  // registry exposes a Proxy of vendor namespaces; enumerate via getVendor probes
  const expected = ['codex','claude','grok','antigravity','kimi','glm','cursor','kiro','copilot','qwen','ernie','spark','jetbrains','perplexity','replit','cody']
  for (const id of expected) assert.ok(registry.isProvider(id), id + ' must be registered')
  assert.deepEqual([...BUILTIN_PROVIDERS].sort(), [...expected].sort())
})

for (const [id, name, authHost] of VENDORS) {
  test(`${id} is registered with catalog and defaults`, async () => {
    const vendor = getVendor(id)
    assert.equal(vendor.providerInfo().id, id)
    assert.equal(vendor.providerInfo().name, name)
    const defaults = vendor.defaults()
    assert.ok(defaults.apiBase && defaults.apiBase.startsWith('https://'), 'apiBase must be https')
    assert.ok(Array.isArray(defaults.models) && defaults.models.length > 0, 'non-empty model list')
    assert.match(vendor.authorizeUrl(), /^https:/)
    assert.ok(vendor.authorizeUrl().includes(authHost), 'authorizeUrl host mismatch')
    const models = await vendor.listModels()
    assert.ok(models.length > 0)
    for (const m of models) {
      assert.ok(m.id, 'model id required')
      assert.ok(m.contextWindow > 0, 'contextWindow required')
    }
  })
}

test('qwen streamOnce posts OpenAI-compatible body with Bearer key', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return new Response(sse([
      JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }),
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
  const chunks = []
  for await (const chunk of getVendor('qwen').streamOnce({
    blob: { apiKey: 'sk-test' },
    options: { model: 'qwen-max-latest', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] },
    fetchImpl,
    headers: {},
    config: {},
  })) chunks.push(chunk)
  assert.equal(calls[0].url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-test')
  assert.equal(calls[0].body.model, 'qwen-max-latest')
  assert.equal(calls[0].body.stream, true)
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'hi'))
})

test('qwen streamOnce requires credentials', async () => {
  await assert.rejects(async () => {
    for await (const chunk of getVendor('qwen').streamOnce({
      blob: {},
      options: { messages: [] },
      fetchImpl: async () => { throw new Error('must not fetch') },
      config: {},
    })) chunk
  }, /API Key or Token/)
})

test('copilot device flow requests code with public client id', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    if (String(url) === copilot.COPILOT_DEVICE_CODE_URL) {
      return Response.json({ device_code: 'dc1', user_code: 'ABCD-1234', interval: 5 })
    }
    return Response.json({ access_token: 'gho_test', token_type: 'bearer' })
  }
  const started = await copilot.requestDeviceCode(fetchImpl)
  assert.equal(started.user_code, 'ABCD-1234')
  assert.equal(calls[0].url, copilot.COPILOT_DEVICE_CODE_URL)
  assert.equal(calls[0].body.client_id, copilot.COPILOT_CLIENT_ID)
  assert.equal(calls[0].body.scope, 'read:user')

  const polled = await copilot.pollDeviceToken('dc1', fetchImpl)
  assert.equal(polled.access_token, 'gho_test')
  assert.equal(calls[1].url, copilot.COPILOT_DEVICE_TOKEN_URL)
  assert.equal(calls[1].body.device_code, 'dc1')
  assert.equal(calls[1].body.grant_type, 'urn:ietf:params:oauth:grant-type:device_code')
})

test('copilot telemetry headers impersonate the vscode integration', () => {
  const headers = copilot.getTelemetryHeaders('session-abcdef')
  assert.equal(headers['Openai-Organization'], 'github-copilot')
  assert.equal(headers['Copilot-Integration-Id'], 'vscode-chat')
  assert.match(headers['editor-version'], /^vscode\//)
})

test('ernie refreshes token from api key + secret and appends access_token', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : undefined })
    if (String(url).includes('grant_type=client_credentials')) {
      return Response.json({ access_token: 'tok-1', expires_in: 2592000 })
    }
    return new Response(sse([
      JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }),
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
  const blob = { apiKey: 'key', secretKey: 'secret' }
  const chunks = []
  for await (const chunk of getVendor('ernie').streamOnce({
    blob,
    options: { model: 'ernie-4.0-turbo-8k', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
    fetchImpl,
    headers: {},
    config: {},
  })) chunks.push(chunk)
  assert.equal(calls[0].url, ernie.ERNIE_OAUTH_URL + '?grant_type=client_credentials&client_id=key&client_secret=secret')
  assert.match(calls[1].url, /completions_pro\?access_token=tok-1$/)
  assert.equal(calls[1].body.stream, true)
  assert.equal(blob.accessToken, 'tok-1', 'refreshed token must be persisted back to the blob')
  assert.ok(chunks.some((c) => c.type === 'text-delta'))
})

test('ernie streamOnce rejects when no credentials are available', async () => {
  await assert.rejects(async () => {
    for await (const chunk of getVendor('ernie').streamOnce({
      blob: {},
      options: { messages: [] },
      fetchImpl: async () => { throw new Error('must not fetch') },
      config: {},
    })) chunk
  }, /access token or API Key/i)
})
