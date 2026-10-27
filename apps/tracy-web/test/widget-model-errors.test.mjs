import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { widgetRoutes } from '../src/widget/route.js'

const origin = 'https://widget-errors.example.test'
function stand(
  model = { apiKey: 'private-test-key', baseUrl: 'https://model.invalid', words: 'test-model' }
) {
  const pool = {
    async query(sql) {
      if (sql.includes('ui_setting')) return { rows: [{ on: true }] }
      if (sql.includes('llm_assignment')) return { rows: [] }
      return { rows: [{ count: 1 }] }
    }
  }
  const widget = widgetRoutes({
    contextStore: null,
    config: { origin, sessionSecret: 'test-only', model },
    pool,
    request: async (path) => Response.json(path === '/api/templates' ? { templates: [] } : { systems: [] })
  })
  const app = new Hono()
  app.route('/widget', widget)
  let cookie = ''
  return {
    async state() {
      return app.request(origin + '/widget/api/state', { headers: { cookie } })
    },
    async turn() {
      const response = await app.request(origin + '/widget/api/turn', {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' })
      })
      cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie
      return response
    }
  }
}

test('mounted Hono boundary preserves upstream statuses and sanitizes model errors without replay', async (t) => {
  for (const [status, reason] of [
    [401, 'authentication'],
    [403, 'authentication'],
    [400, 'configuration'],
    [404, 'configuration'],
    [422, 'configuration'],
    [429, 'upstream'],
    [500, 'upstream'],
    [503, 'upstream']
  ]) {
    let calls = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      calls++
      return new Response('secret-upstream-body private-test-key', { status })
    })
    const s = stand(),
      response = await s.turn()
    assert.equal(response.status, status)
    assert.match(response.headers.get('content-type'), /application\/json/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { code: 'MODEL_UNAVAILABLE', reason })
    assert.equal(calls, 1)
    fetchMock.mock.restore()
  }
})

test('missing model configuration refuses before any upstream request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => {
    throw Error('must not fetch')
  })
  const response = await stand(null).turn()
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { code: 'MODEL_UNAVAILABLE', reason: 'configuration' })
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('network, timeout and malformed model responses are safe structured upstream errors', async (t) => {
  for (const [result, status] of [
    [
      () => {
        throw new TypeError('secret network details')
      },
      502
    ],
    [
      () => {
        throw new DOMException('secret timeout details', 'TimeoutError')
      },
      504
    ],
    [() => new Response('not-json private-test-key'), 502],
    [() => Response.json(null), 502],
    [() => Response.json({ choices: [{ message: { content: 'not-json secret' } }] }), 502]
  ]) {
    const fetchMock = t.mock.method(globalThis, 'fetch', result)
    const response = await stand().turn()
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { code: 'MODEL_UNAVAILABLE', reason: 'upstream' })
    assert.equal(fetchMock.mock.callCount(), 1)
    fetchMock.mock.restore()
  }
})

test('a refused turn releases busy state but does not retry until a new explicit request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => new Response('private', { status: 401 }))
  const s = stand()
  assert.equal((await s.turn()).status, 401)
  assert.equal(fetchMock.mock.callCount(), 1)
  const after = await (await s.state()).json()
  assert.deepEqual(after.history, [])
  assert.equal((await s.turn()).status, 401)
  assert.equal(fetchMock.mock.callCount(), 2)
})
