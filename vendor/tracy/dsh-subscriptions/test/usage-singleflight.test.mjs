import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAccountStore } from '../lib/accounts.js'

function fakeCredentials() {
  const store = new Map()
  return {
    store,
    async resolve(ref) {
      return store.has(ref) ? { value: store.get(ref) } : null
    },
    async set(ref, value) { store.set(ref, value) },
    async unset(ref) { store.delete(ref) },
    async describe(ref) { return { configured: store.has(ref), writable: true } },
  }
}

test('refreshUsage: concurrent calls are deduplicated via single-flight lock (#455)', async () => {
  const creds = fakeCredentials()
  creds.store.set('COPILOT_OAUTH_1', JSON.stringify({ accessToken: 'ghu_fake_copilot_token' }))

  let fetchCount = 0
  const customFetch = async (_url, _opts) => {
    fetchCount++
    await new Promise((r) => setTimeout(r, 50))
    return {
      ok: true,
      status: 200,
      json: async () => ({ plan: { name: 'Individual' }, used_percent: 15 }),
    }
  }

  const store = createAccountStore({
    credentials: creds,
    getConfig: () => ({
      slots: [{ provider: 'copilot', index: 1 }],
    }),
    fetchImpl: customFetch,
    fetchForRef: () => customFetch,
    onLimitNotice: () => {},
  })

  // Fire 5 concurrent refreshUsage calls for the same provider
  const promises = [
    store.refreshUsage('copilot'),
    store.refreshUsage('copilot'),
    store.refreshUsage('copilot'),
    store.refreshUsage('copilot'),
    store.refreshUsage('copilot'),
  ]

  await Promise.all(promises)

  // Exactly 1 fetch should have been performed due to single-flight lock
  assert.equal(fetchCount, 1, 'concurrent refreshUsage calls must deduplicate into 1 fetch')
})

test('refreshUsage: subsequent call within TTL is skipped', async () => {
  const creds = fakeCredentials()
  creds.store.set('COPILOT_OAUTH_1', JSON.stringify({ accessToken: 'ghu_fake_copilot_token' }))

  let fetchCount = 0
  const customFetch = async () => {
    fetchCount++
    return {
      ok: true,
      status: 200,
      json: async () => ({ plan: { name: 'Individual' }, used_percent: 15 }),
    }
  }

  const store = createAccountStore({
    credentials: creds,
    getConfig: () => ({
      slots: [{ provider: 'copilot', index: 1 }],
    }),
    fetchImpl: customFetch,
    fetchForRef: () => customFetch,
    onLimitNotice: () => {},
  })

  await store.refreshUsage('copilot')
  assert.equal(fetchCount, 1)

  // Immediate sequential call should be skipped due to USAGE_TTL_MS
  await store.refreshUsage('copilot')
  assert.equal(fetchCount, 1)
})
