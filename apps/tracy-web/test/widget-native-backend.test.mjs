import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { mintSession } from '../src/lib/session.js'
import { WIDGET_COOKIE } from '../src/lib/cookies.js'
import { nativeBackendPath } from '../src/widget/native-backend.js'
import { widgetRoutes } from '../src/widget/route.js'

const origin = 'https://widget.example.test'
const secret = 'native-backend-test-secret'
const owner = '00000000-0000-4000-8000-000000000001'
const otherOwner = '00000000-0000-4000-8000-000000000002'
const visitorId = '00000000-0000-4000-8000-000000000003'

async function stand() {
  const calls = []
  const pool = {
    async query(sql, args) {
      if (sql.includes('ui_setting')) return { rows: [{ on: true }] }
      if (sql.includes('select id from account'))
        return { rows: [{ id: args[0] === 'owner@example.test' ? owner : otherOwner }] }
      throw Error('Unexpected query')
    }
  }
  const contextStore = {
    async read(id, accountId) {
      if (id !== visitorId) return null
      const expires = Date.now() + 60000
      if (accountId !== owner) return { locked: true, ownerAccountId: owner, expires }
      return {
        ownerAccountId: owner,
        expires,
        revision: 3,
        data: {
          history: [],
          brief: { name: '', about: '' },
          nativeHandoff: {
            state: 'ready',
            ownerAccountId: owner,
            visitorId,
            scope: 'onboarding',
            sessionId: 'session-widget-00000000-0000-4000-8000-000000000004'
          }
        }
      }
    }
  }
  const app = new Hono()
  app.route(
    '/widget',
    widgetRoutes({
      config: { origin, sessionSecret: secret },
      pool,
      contextStore,
      request: async (path, init) => {
        calls.push({ path, init })
        return Response.json(
          { ok: true },
          { headers: { 'set-cookie': 'tracy_sess=private-renewal; HttpOnly' } }
        )
      }
    })
  )
  const cookie = async (email) =>
    `${WIDGET_COOKIE}=${visitorId}` + (email ? `; tracy_sess=${await mintSession(email, secret)}` : '')
  const send = async (path, { email = 'owner@example.test', method = 'GET', requestOrigin = origin } = {}) =>
    app.request(origin + '/widget/native/backend' + path, {
      method,
      headers: {
        cookie: await cookie(email),
        origin: requestOrigin,
        'content-type': 'application/json',
        'x-tracy-actor': 'spoofed-actor',
        'x-tracy-session': 'spoofed-session'
      },
      ...(['GET', 'HEAD'].includes(method) ? {} : { body: '{"name":"New site"}' })
    })
  const nativeHello = async ({
    email = 'owner@example.test',
    requestOrigin = origin,
    path = '/api/tracy-site-tabs/hello',
    body
  } = {}) =>
    app.request(origin + '/widget/native' + path, {
      method: 'POST',
      headers: { cookie: await cookie(email), origin: requestOrigin },
      ...(body ? { body } : {})
    })
  const upload = async (ids, body) =>
    app.request(
      new Request(
        origin +
          '/widget/native/api/session/uploadFileBinary?' +
          ids.map((id) => 'sessionId=' + id).join('&'),
        {
          method: 'POST',
          headers: {
            cookie: await cookie('owner@example.test'),
            origin,
            'content-type': 'application/octet-stream'
          },
          body,
          duplex: 'half'
        }
      )
    )
  return { calls, send, nativeHello, upload }
}

test('native backend permits the creation flow and preserves its query without granting administrative methods', () => {
  assert.equal(nativeBackendPath('GET', '/auth/me'), '/auth/me')
  assert.equal(
    nativeBackendPath('GET', '/api/templates?platform=wordpress'),
    '/api/templates?platform=wordpress'
  )
  assert.equal(nativeBackendPath('POST', '/api/sites'), '/api/sites')
  assert.equal(nativeBackendPath('GET', '/api/sites/demo.test/jobs/job-1'), '/api/sites/demo.test/jobs/job-1')
  assert.equal(nativeBackendPath('POST', '/api/sites/demo.test/agent'), '/api/sites/demo.test/agent')
  // A quickstart tag in the query is written with %2F (URLSearchParams); it is a value, not a path segment.
  const support = '/api/design-system/support?quickstart=quickstart%2Fja-kinetic%2Fj6&platform=joomla'
  assert.equal(nativeBackendPath('GET', support), support)
  for (const [method, path] of [
    ['GET', '/api/%2e%2e/auth/me?x=1'],
    ['GET', '/api/design-system/support?x=1#y'],
    ['GET', '/api/ops/voice'],
    ['POST', '/api/team'],
    ['DELETE', '/api/sites/demo'],
    ['PUT', '/api/sites'],
    ['GET', '/api/sites/demo/secrets'],
    ['POST', '/api/sites/demo/provision'],
    ['GET', '//other.test/auth/me'],
    ['GET', '/api/../auth/me'],
    ['GET', '/api/%2e%2e/auth/me'],
    ['GET', '/auth%2fme'],
    ['GET', '/auth\\me'],
    ['GET', '/auth/me#fragment']
  ])
    assert.equal(nativeBackendPath(method, path), null, `${method} ${path}`)
})

test('mounted native backend forwards an adopted owner with clean auth headers and hides renewal cookies', async () => {
  const s = await stand()
  const response = await s.send('/api/sites', { method: 'POST' })
  assert.equal(response.status, 200)
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].path, '/api/sites')
  assert.equal(s.calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(s.calls[0].init.body), { name: 'New site' })
  const headers = new Headers(s.calls[0].init.headers)
  assert.equal(headers.get('origin'), origin)
  assert.equal(headers.get('x-tracy-actor'), null)
  assert.equal(headers.get('x-tracy-session'), null)
  assert.match(headers.get('cookie'), /tracy_sess=/)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('unknown paths, foreign origins, anonymous visitors and another account never reach the native backend', async () => {
  const s = await stand()
  assert.equal((await s.send('/api/ops/voice')).status, 404)
  assert.equal(
    (await s.send('/api/sites', { method: 'POST', requestOrigin: 'https://foreign.test' })).status,
    403
  )
  assert.equal((await s.send('/api/sites', { email: null })).status, 401)
  assert.equal((await s.send('/api/sites', { email: 'other@example.test' })).status, 401)
  assert.equal(s.calls.length, 0)
})

test('changing the authenticated account cannot reuse a cached adopted visitor', async () => {
  const s = await stand()
  assert.equal((await s.send('/auth/me')).status, 200)
  assert.equal((await s.send('/api/sites', { email: 'other@example.test', method: 'POST' })).status, 401)
  assert.equal(s.calls.length, 1)
})

test('the exact native bodyless tabs handshake keeps origin and authenticated visitor fences', async () => {
  const s = await stand()
  assert.equal((await s.nativeHello()).status, 200)
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].path, '/new/api/tracy-site-tabs/hello')
  assert.equal((await s.nativeHello({ requestOrigin: 'https://foreign.test' })).status, 403)
  assert.equal((await s.nativeHello({ path: '/api/arbitrary-bodyless-write' })).status, 403)
  assert.equal((await s.nativeHello({ body: new Uint8Array([1]) })).status, 400)
  assert.notEqual((await s.nativeHello({ email: null })).status, 200)
  assert.equal(s.calls.length, 1)
})

test('native binary uploads fence exact session and bound chunked bytes before forwarding', async () => {
  const f = await stand()
  const id = 'session-widget-00000000-0000-4000-8000-000000000004'
  assert.equal((await f.upload(['foreign-session'], new Uint8Array([1]))).status, 403)
  assert.equal((await f.upload([id, id], new Uint8Array([1]))).status, 403)
  let sent = 0
  const oversized = new ReadableStream({
    pull(controller) {
      if (sent++ < 17) controller.enqueue(new Uint8Array(1024 * 1024))
      else controller.close()
    }
  })
  const result = await f.upload([id], oversized)
  assert.equal(result.status, 413)
  assert.equal((await result.json()).code, 'REQUEST_TOO_LARGE')
  assert.equal(f.calls.length, 0)
})
