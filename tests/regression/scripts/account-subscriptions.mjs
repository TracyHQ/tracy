/** Account routing API checks; use only designated test-account cookies. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const origin = process.env.TRACY_STAND
const cookies = ['REG_COOKIE_A', 'REG_COOKIE_B'].map((key) =>
  process.env[key] ? readFileSync(process.env[key], 'utf8').trim() : ''
)
async function call(seat, path, method = 'GET', body, requestOrigin = origin) {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: 'manual',
    headers: {
      cookie: seat === null ? '' : `tracy_sess=${cookies[seat]}`,
      origin: requestOrigin,
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 TracyRegression'
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000)
  })
  return { status: response.status, data: await response.json().catch(() => null) }
}
test('live account routing is authenticated, isolated, versioned and restored after the probe', async () => {
  assert.ok(origin && cookies.every(Boolean), 'TRACY_STAND and both designated test cookies are required')
  assert.equal((await call(null, '/api/seat-plan/status')).status, 401)
  const a = await call(0, '/api/seat-plan/status')
  const b = await call(1, '/api/seat-plan/status')
  assert.equal(a.status, 200)
  assert.equal(b.status, 200)
  assert.equal(a.data.enabled, true, 'the deployed broker must have its encryption key and operator switch')
  assert.equal(typeof a.data.routing.tracyFallback, 'boolean')
  for (const doc of [a.data, b.data]) {
    for (const row of doc.connections) {
      for (const key of ['secret', 'accessToken', 'refreshToken']) assert.equal(key in row, false)
    }
  }
  const saved = a.data.routing
  const input = {
    enabled: saved.enabled,
    connectionOrder: saved.connectionOrder,
    tracyFallback: !saved.tracyFallback,
    expectedVersion: saved.version
  }
  assert.equal(
    (await call(0, '/api/seat-plan/routing', 'PUT', input, 'https://untrusted.example')).status,
    403
  )
  let changed
  try {
    changed = await call(0, '/api/seat-plan/routing', 'PUT', input)
    assert.equal(changed.status, 200)
    assert.equal(changed.data.routing.tracyFallback, !saved.tracyFallback)
    assert.deepEqual((await call(1, '/api/seat-plan/status')).data.routing, b.data.routing)
    assert.equal((await call(0, '/api/seat-plan/routing', 'PUT', input)).status, 409)
  } finally {
    if (changed?.status === 200) {
      const restored = await call(0, '/api/seat-plan/routing', 'PUT', {
        ...saved,
        expectedVersion: changed.data.routing.version
      })
      assert.equal(
        restored.status,
        200,
        'restore uses CAS; never overwrite another concurrent account change'
      )
      assert.equal(restored.data.routing.tracyFallback, saved.tracyFallback)
    }
  }
})
