/**
 * How a vendor signs in on Settings › AI accounts (`src/client/plan-doors.ts` `signInOf`, `signInFor`)
 * and the API-key door (`connectKey`, `POST /api/seat-plan/connect/key`), through a stand-in `fetch`
 * that answers like tracy-web.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectKey, signInFor, signInOf } from '../src/client/plan-doors.ts'

test('only Claude, ChatGPT Codex and Grok sign in in the browser, GitHub Copilot by device code; token vendors not here', () => {
  assert.equal(signInOf('claude'), 'browser')
  assert.equal(signInOf('codex'), 'browser')
  assert.equal(signInOf('grok'), 'browser')
  assert.equal(signInOf('copilot'), 'device')
  for (const id of ['kimi', 'antigravity', 'glm', 'toString']) assert.equal(signInOf(id), undefined, id)
})

test('the server says how a vendor signs in: its `signIn` wins over the built-in table', () => {
  assert.equal(signInFor({ id: 'glm', signIn: 'key' }), 'key')
  assert.equal(signInFor({ id: 'kimi', signIn: 'key' }), 'key')
  assert.equal(signInFor({ id: 'claude', signIn: 'key' }), 'key', 'the server, not the table')
  assert.equal(signInFor({ id: 'antigravity', signIn: 'browser' }), 'browser')
  assert.equal(signInFor({ id: 'copilot', signIn: 'device' }), 'device')
})

test('an unknown or null `signIn` means no sign-in here at all, never a browser fallback', () => {
  for (const signIn of [null, 'oauth', '', 42, 'toString']) {
    assert.equal(signInFor({ id: 'claude', signIn }), undefined, String(signIn))
  }
})

test('an older server that sends no `signIn`: the built-in table, which never names the key vendors', () => {
  assert.equal(signInFor({ id: 'claude', name: 'Claude' }), 'browser')
  assert.equal(signInFor({ id: 'copilot' }), 'device')
  for (const id of ['kimi', 'glm', 'qwen']) assert.equal(signInFor({ id }), undefined, id)
})

/** A fetch for `POST /api/seat-plan/connect/key` that answers `status` with `body`. */
function keyDoor(status, body) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method,
      credentials: init.credentials,
      body: JSON.parse(init.body)
    })
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  return { fetch, calls }
}

const STATUS = {
  next: null,
  enabled: true,
  providers: [{ id: 'glm', name: 'GLM', signIn: 'key' }],
  connections: [
    { connectionId: 'c1', provider: 'glm', name: 'GLM', account: 'API key …1234', connected: true }
  ],
  routing: { enabled: true, connectionOrder: ['c1', 'tracy'], version: 1 }
}

test('connectKey posts the provider and the key once, same origin, and answers the status', async () => {
  const { fetch, calls } = keyDoor(200, STATUS)
  const result = await connectKey('glm', 'sk-secret-1234', fetch)
  assert.deepEqual(calls, [
    {
      url: '/api/seat-plan/connect/key',
      method: 'POST',
      credentials: 'same-origin',
      body: { provider: 'glm', key: 'sk-secret-1234' }
    }
  ])
  assert.deepEqual(result, { kind: 'connected', status: STATUS })
})

test('each refusal of connectKey is one typed failure, and the key is in none of them', async () => {
  const cases = [
    // tracy-web's management doors answer `{code, message}` (`apps/tracy-web/src/seat-plan/route.js`).
    [400, { code: 'invalid', message: 'x' }, 'invalid'],
    [401, { code: 'key', message: 'x' }, 'key'],
    [403, { code: 'plan', message: 'x' }, 'plan'],
    [502, { code: 'vendor', message: 'x' }, 'vendor'],
    // A Disconnect or another paste landed while the vendor was asked.
    [409, { code: 'conflict', message: 'x' }, 'conflict'],
    // The operator turned the vendor, or connecting, off; or the deployment's key store is missing.
    [403, { code: 'disabled', message: 'x' }, 'disabled'],
    [503, { code: 'disabled', message: 'x' }, 'disabled'],
    // The person is not signed in to Tracy: the viewer guard, or no account for the cookie.
    [401, { code: 'NOT_SIGNED_IN' }, 'signedOut'],
    [401, { code: 'notSignedIn', message: 'x' }, 'signedOut'],
    // Refusals with no sentence of their own: the section's generic one.
    [403, { code: 'CSRF_ORIGIN' }, 'failed'],
    [403, { code: 'noAccess', message: 'x' }, 'failed'],
    [503, { code: 'unavailable', message: 'x' }, 'failed'],
    // The `{error}` shape of the contract means the same.
    [401, { error: 'key' }, 'key'],
    // No code at all: the status alone decides, and never claims the vendor is down.
    [400, {}, 'invalid'],
    [401, {}, 'key'],
    [403, {}, 'plan'],
    [409, {}, 'conflict'],
    [502, null, 'vendor'],
    [500, null, 'failed']
  ]
  for (const [status, body, kind] of cases) {
    const { fetch } = keyDoor(status, body)
    const result = await connectKey('qwen', 'sk-secret-1234', fetch)
    assert.deepEqual(result, { kind }, `${status} ${JSON.stringify(body)}`)
  }
  const down = await connectKey('qwen', 'sk-secret-1234', async () => {
    throw new Error('network sk-secret-1234')
  })
  assert.deepEqual(down, { kind: 'failed' }, 'tracy-web not reached: not the vendor’s fault')
  assert.doesNotMatch(JSON.stringify(down), /sk-secret/)
})

test('a 200 that is not a status (not JSON, or no providers/connections) is a failure, never a blank status', async () => {
  const notJson = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token <')
    }
  })
  assert.deepEqual(await connectKey('glm', 'sk-secret-1234', notJson), { kind: 'failed' })
  for (const body of [{}, null, [], { connections: [] }, { providers: [], connections: 'x' }]) {
    const { fetch } = keyDoor(200, body)
    assert.deepEqual(
      await connectKey('glm', 'sk-secret-1234', fetch),
      { kind: 'failed' },
      JSON.stringify(body)
    )
  }
})

test('connectKey writes nothing to the console, so the key never lands in a log', async () => {
  const seen = []
  const saved = {}
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[m] = console[m]
    console[m] = (...args) => seen.push(args.join(' '))
  }
  try {
    await connectKey('glm', 'sk-secret-1234', keyDoor(401, { error: 'key' }).fetch)
    await connectKey('glm', 'sk-secret-1234', async () => {
      throw new Error('down')
    })
  } finally {
    Object.assign(console, saved)
  }
  assert.deepEqual(seen, [])
})
