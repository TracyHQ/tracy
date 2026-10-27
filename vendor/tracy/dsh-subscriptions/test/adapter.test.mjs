import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamWithRotation } from '../lib/stream-rotate.js'
import { SubscriptionAdapter } from '../lib/adapter.js'

test('retries the next account after 429', async () => {
  const accounts = [
    { ref: 'CODEX_OAUTH_1', hasToken: true, usagePercent: 10, cooldownUntil: 0 },
    { ref: 'CODEX_OAUTH_2', hasToken: true, usagePercent: 10, cooldownUntil: 0 },
  ]
  const seen = []
  async function* streamOnce(account) {
    seen.push(account.ref)
    if (account.ref === 'CODEX_OAUTH_1') {
      const err = new Error('limited')
      err.status = 429
      throw err
    }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts,
    nowMs: () => 1,
    cooldownMs: 1000,
    streamOnce,
    options: { provider: 'codex', model: 'x', messages: [] },
    onCooldown: () => {},
  })) chunks.push(chunk)
  assert.deepEqual(seen, ['CODEX_OAUTH_1', 'CODEX_OAUTH_2'])
  assert.equal(chunks[0].text, 'ok')
})

test('SubscriptionAdapter.prepareCall returns model and stream callable', async () => {
  const { SubscriptionAdapter } = await import('../lib/adapter.js')
  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1' }],
    vendorConfig: () => ({ models: ['gpt-5.4-mini'] }),
    ensureFresh: async (p, b) => b,
    loadBlob: async () => ({ access_token: 'tok' }),
    cooldownMs: () => 1000,
    rememberCooldown: () => {},
    saveBlob: () => {},
  })
  const prepared = await adapter.prepareCall('codex', 'gpt-5.4-mini')
  assert.ok(prepared)
  assert.equal(prepared.model.id, 'gpt-5.4-mini')
  assert.equal(typeof prepared.stream, 'function')
})

test("SubscriptionAdapter.stream does not await refreshUsage before yielding chunks", async () => {
  const { SubscriptionAdapter } = await import("../lib/adapter.js")
  let refreshStarted = false
  let refreshFinished = false
  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: "CODEX_OAUTH_1" }],
    vendorConfig: () => ({ models: ["gpt-5.4-mini"] }),
    ensureFresh: async (p, b) => b,
    loadBlob: async () => ({ access_token: "tok" }),
    cooldownMs: () => 1000,
    fetchImpl: async () => {
      const sseData = "data: " + JSON.stringify({ type: "response.output_text.delta", delta: "hi" }) + "\n\ndata: [DONE]\n\n";
      return new Response(sseData, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    },
    refreshUsage: async () => {
      refreshStarted = true
      await new Promise((r) => setTimeout(r, 500))
      refreshFinished = true
    },
  })
  async function* dummyStream() {
    yield { type: "text-delta", text: "fast" }
  }
  const it = adapter.stream({
    provider: "codex",
    model: "gpt-5.4-mini",
    messages: [],
    streamOnce: dummyStream,
  })
  const first = await it.next()
  assert.equal(first.value.type, "block-start")
  assert.equal(refreshStarted, true)
  assert.equal(refreshFinished, false, "first chunk was yielded before refreshUsage completed")
})

test("SubscriptionAdapter.listModels uses account proxy via fetchForRef", async () => {
  const { SubscriptionAdapter } = await import("../lib/adapter.js")
  let passedRef = null
  const customFetch = async () => Response.json({
    models: [{ slug: "custom-live-model", display_name: "Custom Live Model" }],
  })
  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: "PROXY_ACCOUNT_1" }],
    vendorConfig: () => ({}),
    ensureFresh: async (p, b) => b,
    loadBlob: async () => ({ accessToken: "tok" }),
    fetchForRef: (ref) => {
      passedRef = ref
      return customFetch
    },
  })
  const models = await adapter.listModels("codex")
  assert.equal(passedRef, "PROXY_ACCOUNT_1")
  assert.ok(models.some((m) => m.id === "custom-live-model"))
})

test("#349: createAdapterManager wires ollama and cascading fallback to native adapter deps", async () => {
  const { createAdapterManager } = await import("../lib/adapter-manager.js")
  let captured = null
  const manager = createAdapterManager({
    ctx: {
      llm: {
        listProviders: () => [],
        registerAdapter: (_p, a) => {
          captured = a
          return { dispose() {} }
        },
      },
    },
    live: () => ({ slots: [], ollamaFallback: true, cascadingFallback: true }),
    store: { loggedInProviders: async () => ["codex"] },
    logger: {},
    fetch: globalThis.fetch,
  })
  await manager.syncAdapter()
  assert.ok(captured)
  assert.equal(typeof captured.deps.ollamaFallback, "function")
  assert.equal(typeof captured.deps.cascadingFallback, "function")
})

test("SubscriptionAdapter treats stream finish error as error outcome and does not call recordSuccess (#456)", async () => {
  const { registerCustomProviderIds } = await import('../lib/refs.js')
  const { registerCustomVendor, clearCustomVendors } = await import('../lib/vendors/index.js')
  registerCustomProviderIds(['auditerror'])
  registerCustomVendor({
    id: 'auditerror',
    defaults: () => ({}),
    streamOnce: async function* () {
      yield { type: 'text-delta', index: 0, text: 'partial' }
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'INCOMPLETE', message: 'broken' } } }
    },
  })
  const rows = []
  let successes = 0
  try {
    const adapter = new SubscriptionAdapter({
      listAccounts: async () => [{ ref: 'AUDITERROR_OAUTH_1', hasToken: true }],
      loadBlob: async () => ({ accessToken: 'FAKE' }),
      ensureFresh: async (_p, b) => b,
      vendorConfig: () => ({}),
      cooldownMs: () => 1,
      recordSuccess: () => successes++,
      recordHistory: (r) => rows.push(r),
    })
    for await (const c of adapter.stream({ provider: 'auditerror', model: 'fake' })) {
      void c
    }
    assert.equal(successes, 0)
    assert.equal(rows[0]?.outcome, 'error')
    assert.equal(rows[0]?.status, 500)
  } finally {
    clearCustomVendors()
  }
})
