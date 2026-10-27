import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSwitchableError } from '../lib/rotate.js'
import { streamWithRotation } from '../lib/stream-rotate.js'
import { createAccountStore } from '../lib/accounts.js'
import { iterateSse } from '../lib/sse.js'
import { fetchWithTimeout } from '../lib/http.js'
import { googleLicenseMessage, noticeFromLoadCodeAssist } from '../lib/google-validation.js'
import { throwHttpError } from '../lib/wire.js'

test('isSwitchableError correctly handles 401, 403, 429, 5xx', () => {
  assert.equal(isSwitchableError({ status: 401 }), true)
  assert.equal(isSwitchableError({ status: 403 }), true)
  assert.equal(isSwitchableError({ status: 429 }), true)
  assert.equal(isSwitchableError({ status: 500 }), true)
  assert.equal(isSwitchableError({ status: 503 }), true)
  assert.equal(isSwitchableError({ code: 'RATE_LIMIT' }), true)
  assert.equal(isSwitchableError({ code: 'LICENSE_REQUIRED' }), true)
  assert.equal(isSwitchableError({ code: 'AUTH' }), false)
})

test('streamWithRotation does not rotate mid-stream after first chunk is delivered', async () => {
  const accounts = [
    { ref: 'ACC_1', hasToken: true, cooldownUntil: 0 },
    { ref: 'ACC_2', hasToken: true, cooldownUntil: 0 },
  ]
  let streamedFrom = []

  async function* streamOnce(account) {
    streamedFrom.push(account.ref)
    yield { text: 'chunk-1' }
    // Simulate connection drop after first chunk
    const err = new Error('connection dropped mid-stream')
    err.status = 502
    throw err
  }

  const chunks = []
  let caughtError = null
  try {
    for await (const chunk of streamWithRotation({
      accounts,
      nowMs: () => 1000,
      cooldownMs: 5000,
      switchAtRemaining: 0,
      streamOnce,
      options: { provider: 'test', model: 'test' },
    })) {
      chunks.push(chunk)
    }
  } catch (err) {
    caughtError = err
  }

  assert.ok(caughtError, 'Should throw error instead of silently switching')
  assert.equal(chunks.length, 1, 'Should have received exactly 1 chunk')
  assert.deepEqual(streamedFrom, ['ACC_1'], 'Should not have attempted ACC_2 after emitting chunks')
})

test('streamWithRotation switches to next account when first fails with 401 or 403 before emitting chunks', async () => {
  const accounts = [
    { ref: 'ACC_1', hasToken: true, cooldownUntil: 0 },
    { ref: 'ACC_2', hasToken: true, cooldownUntil: 0 },
  ]
  const tried = []

  async function* streamOnce(account) {
    tried.push(account.ref)
    if (account.ref === 'ACC_1') {
      const err = new Error('vendor http 403: permission denied')
      err.status = 403
      throw err
    }
    yield { text: 'hello from ACC_2' }
  }

  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts,
    nowMs: () => 1000,
    cooldownMs: 5000,
    switchAtRemaining: 0,
    streamOnce,
    options: { provider: 'test', model: 'test' },
  })) {
    chunks.push(chunk)
  }

  assert.deepEqual(tried, ['ACC_1', 'ACC_2'])
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].text, 'hello from ACC_2')
})

test('quarantine is remembered in account store across listAccounts and cleared on recordSuccess', async () => {
  const memCreds = new Map()
  const store = createAccountStore({
    credentials: {
      describe: async (_r) => ({ configured: true }),
      resolve: async (_r) => JSON.stringify({ accessToken: 'tok' }),
      set: async (r, val) => memCreds.set(r.ref, val),
      unset: async (r) => memCreds.delete(r.ref),
    },
    getConfig: () => ({ slots: [{ provider: 'codex', index: 1 }] }),
  })

  // Initially active
  let list = await store.listAccounts('codex')
  assert.equal(list.length, 1)
  assert.equal(list[0].quarantineUntil, 0)

  // Put in quarantine
  store.rememberQuarantine('CODEX_OAUTH_1', 'HARD_LIMIT', Date.now() + 100000)
  list = await store.listAccounts('codex')
  assert.ok(list[0].quarantineUntil > Date.now())
  assert.equal(list[0].quarantineReason, 'HARD_LIMIT')

  // Cleared on recordSuccess
  store.recordSuccess('CODEX_OAUTH_1')
  list = await store.listAccounts('codex')
  assert.equal(list[0].quarantineUntil, 0)
  assert.equal(list[0].quarantineReason, null)
})

test('googleLicenseMessage detects #3501 and throwHttpError includes clear Russian instructions', () => {
  const error3501 = JSON.stringify({
    error: {
      code: 403,
      message: 'You do not have a valid license of this product. Please contact your administrator to request a license. (#3501)',
      status: 'PERMISSION_DENIED',
    },
  })

  const msg = googleLicenseMessage(403, error3501)
  assert.ok(msg.includes('3501'))
  assert.ok(msg.includes('Gemini Code Assist'))

  assert.throws(() => {
    throwHttpError(403, error3501)
  }, (err) => {
    return err.code === 'LICENSE_REQUIRED' && err.message.includes('3501') && err.message.includes('one.google.com')
  })
})

test('noticeFromLoadCodeAssist returns friendly message for GOOGLE_TOS_NOT_SUPPORTED_BY_CLIENT', () => {
  const load = {
    currentTier: null,
    ineligibleTiers: [
      {
        reasonCode: 'GOOGLE_TOS_NOT_SUPPORTED_BY_CLIENT',
        reasonMessage: 'Client does not support Google TOS.',
      },
    ],
  }
  const notice = noticeFromLoadCodeAssist(load)
  assert.ok(notice)
  assert.ok(notice.message.includes('Google TOS'))
})

test('iterateSse times out if stream goes idle', async () => {
  // Mock a readable stream that never yields any chunk and hangs
  const hangingStream = {
    getReader: () => ({
      read: () => new Promise(() => {}), // never resolves
    }),
  }

  await assert.rejects(async () => {
    for await (const _chunk of iterateSse(hangingStream, { idleTimeoutMs: 50 })) {
      // should never get here
    }
  }, (err) => {
    return err.code === 'TIMEOUT' || err.message.includes('stream idle timeout')
  })
})

test('fetchWithTimeout aborts if server does not respond in time', async () => {
  const hangingFetch = (url, init) => new Promise((resolve, reject) => {
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    }
  })

  await assert.rejects(async () => {
    await fetchWithTimeout(hangingFetch, 'https://example.com', {}, { timeoutMs: 50 })
  }, (err) => {
    return err.name === 'TimeoutError' || err.name === 'AbortError'
  })
})

import { isRegionError } from '../lib/rotate.js'

test('isRegionError and isSwitchableError classify transient Google 400 region errors (#391 / GH #9)', () => {
  const regionErr1 = {
    status: 400,
    message: 'vendor http 400: { "error": { "code": 400, "message": "User location is not supported for the API use.", "status": "FAILED_PRECONDITION" } }',
  }
  const regionErr2 = {
    statusCode: 400,
    message: 'FAILED_PRECONDITION: Location unsupported',
  }
  const generic400 = {
    status: 400,
    message: 'vendor http 400: invalid argument',
  }

  assert.equal(isRegionError(regionErr1), true)
  assert.equal(isRegionError(regionErr2), true)
  assert.equal(isRegionError(generic400), false)
  assert.equal(isRegionError({ status: 500, message: 'FAILED_PRECONDITION' }), false)

  assert.equal(isSwitchableError(regionErr1), true)
  assert.equal(isSwitchableError(regionErr2), true)
  assert.equal(isSwitchableError(generic400), false)
})

test('streamWithRotation retries in-place on transient region 400 before switching (#391 / GH #9)', async () => {
  const accounts = [
    { ref: 'ACC_1', hasToken: true, cooldownUntil: 0 },
    { ref: 'ACC_2', hasToken: true, cooldownUntil: 0 },
  ]
  let attempts = 0
  const triedAccounts = []

  async function* streamOnce(account) {
    triedAccounts.push(account.ref)
    attempts++
    if (attempts === 1) {
      const err = new Error('vendor http 400: User location is not supported for the API use. (FAILED_PRECONDITION)')
      err.status = 400
      throw err
    }
    yield { text: 'recovered after region retry' }
  }

  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts,
    nowMs: () => 1000,
    cooldownMs: 5000,
    switchAtRemaining: 0,
    streamOnce,
    options: { provider: 'antigravity', model: 'gemini-3.8-flash-tiered' },
  })) {
    chunks.push(chunk)
  }

  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].text, 'recovered after region retry')
  assert.deepEqual(triedAccounts, ['ACC_1', 'ACC_1'], 'Should have retried the same account without rotating')
})

import { isTimeoutError } from '../lib/http.js'
import { jsonTokenRequest, formTokenRequest } from '../lib/wire.js'

test('#322: isTimeoutError correctly identifies timeout errors', () => {
  assert.equal(isTimeoutError(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), true)
  assert.equal(isTimeoutError({ code: 'ETIMEDOUT', message: 'connection timed out' }), true)
  assert.equal(isTimeoutError({ name: 'AbortError', message: 'operation aborted due to timeout' }), true)
  assert.equal(isTimeoutError(new Error('Network error: ECONNREFUSED')), false)
  assert.equal(isTimeoutError(null), false)
})

test('#322: fetchWithTimeout aborts body reading if server hangs after sending headers', async () => {
  const hangingBodyFetch = async () => {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => new Promise((_resolve, _reject) => {
        // hangs forever unless aborted
      }),
      text: () => new Promise((_resolve, _reject) => {
        // hangs forever unless aborted
      }),
    }
  }

  await assert.rejects(async () => {
    const res = await fetchWithTimeout(hangingBodyFetch, 'https://example.com/api', {}, { timeoutMs: 50 })
    await res.json()
  }, (err) => {
    return isTimeoutError(err)
  })
})

test('#322: fetchWithTimeout with stream: true does not abort stream consumption on connect timeout', async () => {
  const immediateHeadersFetch = async () => {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: 'stream-content',
    }
  }

  const res = await fetchWithTimeout(immediateHeadersFetch, 'https://example.com/stream', {}, { timeoutMs: 50, stream: true })
  assert.equal(res.ok, true)
  // Wait longer than timeoutMs
  await new Promise((r) => setTimeout(r, 70))
  // Response body is untouched and not aborted
  assert.equal(res.body, 'stream-content')
})

test('#322: jsonTokenRequest and formTokenRequest abort if hanging', async () => {
  const hangingFetch = (url, init) => new Promise((resolve, reject) => {
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => reject(init.signal.reason || new Error('aborted')))
    }
  })

  await assert.rejects(async () => {
    await jsonTokenRequest('https://example.com/token', { grant_type: 'code' }, hangingFetch, {}, { timeoutMs: 50 })
  }, (err) => isTimeoutError(err))

  await assert.rejects(async () => {
    await formTokenRequest('https://example.com/token', { grant_type: 'code' }, hangingFetch, {}, { timeoutMs: 50 })
  }, (err) => isTimeoutError(err))
})

test('#322: accountsStore.refreshUsage marks isTimeout on hanging usage fetch', async () => {
  const hangingFetch = (url, init) => new Promise((resolve, reject) => {
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')))
    }
  })

  const mockCreds = {
    resolve: async () => ({ value: JSON.stringify({ accessToken: 'valid-tok' }) }),
    describe: async () => ({ configured: true }),
    set: async () => {},
    unset: async () => {},
  }

  const store = createAccountStore({
    credentials: mockCreds,
    getConfig: () => ({
      slots: [{ provider: 'codex', index: 1, label: 'Test Slot' }],
      usageTimeoutMs: 50,
    }),
    fetchImpl: hangingFetch,
  })

  // refreshUsage should complete without crashing and record the timeout
  await store.refreshUsage('codex')
  const accounts = await store.listAccounts('codex')
  assert.equal(accounts.length, 1)
  const desc = await store.describeRef('CODEX_OAUTH_1')
  assert.equal(desc.isTimeout, true)
  assert.match(desc.refreshError, /timeout/i)
})
