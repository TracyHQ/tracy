import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as root from '../lib/index.js'
import { createResetCreditService } from '../lib/reset-credits.js'
import { registerStatusRoutes } from '../lib/routes/status.js'

test('#345: index.js exports forecast and relative-time utilities', () => {
  assert.equal(typeof root.observeForecast, 'function')
  assert.equal(typeof root.estimateForecast, 'function')
  assert.equal(typeof root.formatRelativeReset, 'function')
})

test('#347: reset-credits prunes expired challenges on prepare', async () => {
  let currentTime = 1000
  const service = createResetCreditService({
    loadBlob: async () => ({ accessToken: 'tok', accountId: 'acc' }),
    fetchImpl: async (url) => {
      if (url.endsWith('/rate-limit-reset-credits')) {
        return {
          ok: true,
          json: async () => ({
            available_count: 1,
            credits: [{ id: 'c1', status: 'available', expires_at: 100000 }],
          }),
        }
      }
      return { ok: true, json: async () => ({ code: 'reset', windows_reset: 1 }) }
    },
    now: () => currentTime,
  })

  // Prepare a challenge at time 1000
  const ch1 = await service.prepare('CODEX_OAUTH_1')
  assert.ok(ch1.challengeId)

  // Fast forward time past challenge expiration (1000 + 15 * 60 * 1000)
  currentTime = 1000 + 20 * 60 * 1000

  // Prepare second challenge, which triggers pruneChallenges
  const ch2 = await service.prepare('CODEX_OAUTH_1')
  assert.ok(ch2.challengeId)

  // Old challenge is gone
  await assert.rejects(
    () => service.consume({ challengeId: ch1.challengeId, acknowledged: true }),
    /no longer valid/
  )
})

test('#343: registerStatusRoutes passes fetchForRef to probeFetch in /check', async () => {
  const customFetchCalls = []
  const customFetch = async (url) => {
    customFetchCalls.push(url)
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ ok: true }),
      json: async () => ({ ok: true, login: 'octocat' }),
    }
  }

  const routes = []
  const fakeCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => routes.push(route),
    },
  }

  const fakeState = {
    accountsView: async () => [],
    live: () => ({ slots: [{ provider: 'codex', index: 1, ref: 'CODEX_OAUTH_1' }] }),
    getSettingsApi: () => null,
    syncCustomVendors: () => {},
    syncAdapter: () => {},
    stripLegacySlots: () => {},
    store: {
      describeRef: async () => ({ configured: true }),
      loadBlob: async () => ({ accessToken: 'tok', refreshToken: 'tok', expiresAt: Date.now() + 100000 }),
      ensureFresh: async (p, b) => b,
      rememberQuota: () => {},
    },
    history: { add: () => {} },
    diagnosticsReport: async () => ({}),
    fetchForRef: (ref) => (ref === 'CODEX_OAUTH_1' ? customFetch : fetch),
  }

  registerStatusRoutes(fakeCtx, fakeState)

  const checkRoute = routes.find((r) => r.path === '/dsh-subscriptions/check')
  assert.ok(checkRoute, 'check route registered')

  let responseData = null
  let responseStatus = null
  const fakeRes = {
    writeHead: (st) => { responseStatus = st },
    end: (body) => { responseData = JSON.parse(body) },
  }

  const { Readable } = await import('node:stream')
  const reqStream = new Readable({
    read() {
      this.push(JSON.stringify({ provider: 'codex', index: 1 }))
      this.push(null)
    },
  })
  reqStream.method = 'POST'
  reqStream.headers = { 'sec-fetch-site': 'same-origin' }

  await checkRoute.handler(reqStream, fakeRes)
  assert.equal(responseStatus, 200)
  assert.equal(responseData.ok, true)
  assert.ok(customFetchCalls.length > 0, 'probeFetch called through custom fetchForRef')
})
