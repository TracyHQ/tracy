import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { widgetRoutes } from '../src/widget/route.js'

const origin = 'https://startup-errors.example.test'
function stand(error, onDiagnostic) {
  const widget = widgetRoutes({
    config: { origin, sessionSecret: 'private-secret' },
    contextStore: null,
    pool: {
      query: async () => {
        throw error
      }
    },
    request: async () => {
      throw Error('No backend calls expected')
    },
    onDiagnostic
  })
  return new Hono().route('/widget', widget)
}
test('startup DNS and connection failures report temporary unavailability without leaking driver data', async () => {
  for (const code of [
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENETUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
    '57P01',
    '57P02',
    '57P03',
    '53300'
  ]) {
    const events = []
    const error = Object.assign(Error('private-email private-database-url private-secret'), { code })
    const app = stand(error, (e) => events.push(e))
    const r = await app.request(origin + '/widget/api/state')
    assert.equal(r.status, 503)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await r.json(), { code: 'WIDGET_UNAVAILABLE', retryable: true })
    assert.deepEqual(events, [
      {
        operation: 'state',
        category: code === 'EAI_AGAIN' ? 'dns_unavailable' : 'connection_unavailable',
        retryable: true
      }
    ])
    assert.doesNotMatch(JSON.stringify(events), /private-|postgres|startup-errors/)
  }
})
test('saved context corruption and unknown failures do not advertise automatic retry or erase context', async () => {
  for (const message of ['WIDGET_STATE_UNREADABLE', 'private-unexpected-driver-error']) {
    const events = []
    const r = await stand(Error(message), (e) => events.push(e)).request(origin + '/widget/api/catalogue')
    assert.equal(r.status, 500)
    assert.deepEqual(await r.json(), { code: 'WIDGET_UNAVAILABLE', retryable: false })
    assert.equal(events[0].operation, 'catalogue')
    assert.equal(
      events[0].category,
      message === 'WIDGET_STATE_UNREADABLE' ? 'saved_context_unreadable' : 'unexpected'
    )
    assert.doesNotMatch(JSON.stringify(events), /private-/)
  }
})
test('wrapped connection errors remain classified and diagnostic failures cannot break the refusal', async () => {
  const error = new TypeError('private transport details', {
    cause: Object.assign(Error('private'), { code: 'ECONNRESET' })
  })
  const r = await stand(error, () => {
    throw Error('diagnostic failed')
  }).request(origin + '/widget/api/state')
  assert.equal(r.status, 503)
  assert.deepEqual(await r.json(), { code: 'WIDGET_UNAVAILABLE', retryable: true })
})
test('an unreadable saved visitor is refused without replacing its cookie or overwriting its context', async () => {
  let reads = 0,
    writes = 0
  const events = []
  const app = new Hono().route(
    '/widget',
    widgetRoutes({
      config: { origin, sessionSecret: 'private-secret' },
      pool: { query: async () => ({ rows: [{ on: true }] }) },
      contextStore: {
        async read() {
          reads++
          throw Error('WIDGET_STATE_UNREADABLE')
        },
        async write() {
          writes++
        }
      },
      request: async () => {
        throw Error('No backend calls expected')
      },
      onDiagnostic: (entry) => events.push(entry)
    })
  )
  const response = await app.request(origin + '/widget/api/state', {
    headers: { cookie: 'tracy_widget=private-saved-visitor' }
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { code: 'WIDGET_UNAVAILABLE', retryable: false })
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(reads, 1)
  assert.equal(writes, 0)
  assert.deepEqual(events, [{ operation: 'state', category: 'saved_context_unreadable', retryable: false }])
})
test('a refused new visitor is its own answer, never an unexpected 500: the address limit is 429', async () => {
  const events = []
  const app = new Hono().route(
    '/widget',
    widgetRoutes({
      config: { origin, sessionSecret: 'private-secret' },
      contextStore: null,
      pool: {
        query: async (sql) => ({ rows: [sql.includes('rate_bucket') ? { count: 99 } : { on: true }] })
      },
      request: async () => {
        throw Error('No backend calls expected')
      },
      onDiagnostic: (entry) => events.push(entry)
    })
  )
  const response = await app.request(origin + '/widget/api/auth/google', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{}'
  })
  assert.equal(response.status, 429)
  assert.deepEqual(await response.json(), { code: 'WIDGET_VISITOR_LIMIT' })
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(events, [])
  // A read still answers, without a visitor or a count.
  assert.equal((await app.request(origin + '/widget/api/auth/status')).status, 200)
})
