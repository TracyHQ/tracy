import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as mod from '../lib/index.js'
import { serializeBlob } from '../lib/blob.js'

function fakeCtx(slots = [], credStore = new Map()) {
  const state = {
    provided: {},
    cleanups: [],
    effects: [],
  }
  const ctx = {
    log: { warn() {}, error() {}, info() {} },
    logger: () => ({ warn() {}, error() {}, info() {} }),
    emit() {},
    provide(name, value) {
      state.provided[name] = value
      return () => { delete state.provided[name] }
    },
    effect(fn) {
      const c = fn()
      if (typeof c === 'function') state.cleanups.push(c)
      return c
    },
    inject(names, fn) {
      fn(ctx)
      return () => {}
    },
    llm: {
      registerAdapter() { return { dispose() {} } },
      listProviders() { return [] },
    },
    credentials: {
      resolve: async (ref) => credStore.has(ref) ? { value: credStore.get(ref) } : null,
      get: async (ref) => credStore.get(ref) || null,
      set: async (ref, val) => { credStore.set(ref, val) },
      unset: async (ref) => { credStore.delete(ref) },
      describe: async (ref) => ({ configured: credStore.has(ref), writable: true }),
      list: async () => [],
      clearRef: async () => {},
    },
    webServer: {
      register() { return () => {} },
      tapIndex(h) { return h },
    },
    settings: {
      register() {
        return { get: () => ({ slots }), set: async () => {}, watch: () => () => {} }
      },
    },
  }
  return { ctx, state }
}

test('subscriptionImages.available returns configured image providers (#447)', async () => {
  const creds = new Map()
  creds.set('CODEX_OAUTH_1', serializeBlob({
    provider: 'codex',
    accessToken: 'test-token',
    accountId: 'acc-1',
  }))

  const slots = [
    { provider: 'codex', index: 1 },
    { provider: 'grok', index: 1 },
  ]

  const { ctx, state } = fakeCtx(slots, creds)
  const cfg = mod.plainConfig(mod.Config({ slots }))
  mod.apply(ctx, cfg)

  try {
    const service = state.provided.subscriptionImages
    assert.ok(service, 'subscriptionImages is provided')
    const avail = await service.available()
    assert.deepEqual(avail, ['codex'], 'codex is available because it is logged in, grok is not')
  } finally {
    for (const c of state.cleanups) c()
  }
})

test('subscriptionImages.generate selects eligible account (#447)', async () => {
  const creds = new Map()
  creds.set('CODEX_OAUTH_1', serializeBlob({
    provider: 'codex',
    accessToken: 'test-access-token',
    accountId: 'account-123',
  }))

  const slots = [
    { provider: 'codex', index: 1 },
  ]

  const { ctx, state } = fakeCtx(slots, creds)
  const cfg = mod.plainConfig(mod.Config({ slots }))
  mod.apply(ctx, cfg)

  try {
    const service = state.provided.subscriptionImages
    assert.ok(service)
    let fetchedUrl = null
    let fetchedHeaders = null
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      fetchedUrl = url
      fetchedHeaders = init.headers
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: 'aW1hZ2VkYXRh', revised_prompt: 'a scenic view' }]
        }),
      }
    }

    try {
      const res = await service.generate({
        provider: 'codex',
        prompt: 'a scenic view',
        size: '1024x1024',
      })
      assert.equal(res.length, 1)
      assert.equal(res[0].b64_json, 'aW1hZ2VkYXRh')
      assert.equal(res[0].revisedPrompt, 'a scenic view')
      assert.ok(fetchedUrl.includes('images/generations'))
      assert.equal(fetchedHeaders.authorization, 'Bearer test-access-token')
      assert.equal(fetchedHeaders['chatgpt-account-id'], 'account-123')
    } finally {
      globalThis.fetch = origFetch
    }
  } finally {
    for (const c of state.cleanups) c()
  }
})
