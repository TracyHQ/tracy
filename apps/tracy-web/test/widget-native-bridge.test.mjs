import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeBridge, nativeTarget } from '../src/widget/native-bridge.js'

const origin = 'https://tracy.test:8443'
const visitor = () => ({
  id: 'visitor-a',
  ownerId: 'owner-a',
  expires: Date.now() + 60000,
  nativeHandoff: {
    state: 'ready',
    scope: 'onboarding',
    visitorId: 'visitor-a',
    ownerAccountId: 'owner-a',
    sessionId: 'session-widget-00000000-0000-4000-8000-000000000001'
  }
})

test('native bridge keeps seat cookies on the server and forwards the existing onboarding mount', async () => {
  const calls = []
  const v = visitor()
  const bridge = nativeBridge({
    origin,
    request: async (path, init) => {
      calls.push({ path, init })
      return new Response('<html><head><base href="/new/"></head></html>', {
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'tracy_tok_native=private-seat; HttpOnly; SameSite=Lax'
        }
      })
    }
  })
  const res = await bridge.forward(
    new Request(origin + '/widget/native/s/session-widget-00000000-0000-4000-8000-000000000001'),
    v,
    'tracy_sess=private-auth'
  )
  assert.equal(calls[0].path, '/new/s/session-widget-00000000-0000-4000-8000-000000000001')
  assert.equal(calls[0].init.headers.get('cookie'), 'tracy_sess=private-auth')
  assert.equal(res.headers.get('set-cookie'), null)
  const body = await res.text()
  assert.match(body, /base href="\/widget\/native\/"/)
  assert.match(body, /name="tracy-widget-native"/)
  assert.doesNotMatch(body, /private-seat|private-auth/)
  const ws = bridge.upgrade(
    { url: '/widget/native/api/remote.mux?x=1', headers: { origin } },
    v,
    'tracy_sess=private-auth'
  )
  assert.equal(ws.url, '/new/api/remote.mux?x=1')
  assert.match(ws.cookie, /tracy_tok_native=private-seat/)
  const other = visitor()
  assert.doesNotMatch(
    bridge.upgrade({ url: '/widget/native/api/remote.mux', headers: { origin } }, other, 'tracy_sess=other')
      .cookie,
    /private-seat/
  )
})

test('native bridge fails closed for unverified, expired, other-owner and cross-origin requests', async () => {
  let calls = 0
  const bridge = nativeBridge({
    origin,
    request: async () => {
      calls++
      return new Response('ok')
    }
  })
  for (const v of [
    null,
    { ...visitor(), locked: true },
    { ...visitor(), expires: 0 },
    { ...visitor(), ownerId: 'other' },
    { ...visitor(), nativeHandoff: { ...visitor().nativeHandoff, state: 'preparing' } }
  ]) {
    await assert.rejects(
      bridge.forward(new Request(origin + '/widget/native/'), v, 'auth'),
      /WIDGET_NATIVE_NOT_READY/
    )
  }
  await assert.rejects(
    bridge.forward(new Request(origin + '/widget/native/api/test'), visitor(), ''),
    /SIGN_IN_REQUIRED/
  )
  await assert.rejects(
    bridge.forward(
      new Request(origin + '/widget/native/api/session/prompt', {
        method: 'POST',
        headers: { origin: 'https://outside.test' },
        body: '{}'
      }),
      visitor(),
      'auth'
    ),
    /ORIGIN_REFUSED/
  )
  assert.throws(
    () =>
      bridge.upgrade(
        { url: '/widget/native/api/remote.mux', headers: { origin: 'https://outside.test' } },
        visitor(),
        'auth'
      ),
    /ORIGIN_REFUSED/
  )
  assert.equal(calls, 0)
})

test('explicit mount cannot become a root API or site proxy and redirects retain the native mount', async () => {
  for (const path of [
    '/api/team',
    '/some-site/',
    '/widget/native-other/',
    '/widget/native/%2e%2e/api',
    '/widget/native/%2fapi'
  ])
    assert.throws(() => nativeTarget(path), /PATH_INVALID/)
  const bridge = nativeBridge({
    origin,
    request: async () =>
      new Response(null, {
        status: 302,
        headers: { location: '/new/s/session-widget-00000000-0000-4000-8000-000000000001' }
      })
  })
  const res = await bridge.forward(new Request(origin + '/widget/native/api/test'), visitor(), 'auth')
  assert.equal(
    res.headers.get('location'),
    '/widget/native/s/session-widget-00000000-0000-4000-8000-000000000001'
  )
})

test('native entry redirects only to the adopted session and rejects a different conversation before forwarding', async () => {
  let calls = 0
  const bridge = nativeBridge({
    origin,
    request: async () => {
      calls++
      return new Response('ok')
    }
  })
  const v = visitor()
  const entry = await bridge.forward(new Request(origin + '/widget/native/'), v, 'auth')
  assert.equal(entry.status, 302)
  assert.equal(entry.headers.get('location'), origin + '/widget/native/s/' + v.nativeHandoff.sessionId)
  await assert.rejects(
    bridge.forward(
      new Request(origin + '/widget/native/s/session-widget-00000000-0000-4000-8000-000000000002'),
      v,
      'auth'
    ),
    /SESSION_MISMATCH/
  )
  for (const expires of [NaN, Infinity, undefined]) {
    await assert.rejects(
      bridge.forward(new Request(origin + '/widget/native/'), { ...v, expires }, 'auth'),
      /NOT_READY/
    )
  }
  assert.equal(calls, 0)
})

test('authentication redirects require recovery and resetting the visitor drops transient seat credentials', async () => {
  let response = new Response('ok', { headers: { 'set-cookie': 'tracy_tok_native=old-seat; HttpOnly' } })
  const bridge = nativeBridge({ origin, request: async () => response })
  const v = visitor()
  await bridge.forward(new Request(origin + '/widget/native/api/test'), v, 'old-auth')
  bridge.reset(v)
  const upgraded = bridge.upgrade(
    { url: '/widget/native/api/remote.mux', headers: { origin } },
    v,
    'fresh-auth'
  )
  assert.equal(upgraded.cookie, 'fresh-auth')
  for (const location of ['/login?return=%2Fnew', 'https://other.test/new/']) {
    response = new Response(null, { status: 302, headers: { location } })
    await assert.rejects(
      bridge.forward(new Request(origin + '/widget/native/api/test'), v, 'fresh-auth'),
      /SIGN_IN_REQUIRED/
    )
  }
})

test('embedded document preserves script restrictions and does not expose credentials or stale body metadata', async () => {
  const bridge = nativeBridge({
    origin,
    request: async () =>
      new Response('<html><head></head></html>', {
        headers: {
          'content-type': 'text/html',
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'; script-src 'self'",
          'x-frame-options': 'DENY',
          'content-length': '31',
          'set-cookie': 'tracy_sess=never-forward; HttpOnly'
        }
      })
  })
  const v = visitor()
  const res = await bridge.forward(
    new Request(origin + '/widget/native/s/' + v.nativeHandoff.sessionId),
    v,
    'auth'
  )
  assert.equal(res.headers.get('x-frame-options'), null)
  assert.equal(res.headers.get('content-length'), null)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/)
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/)
  assert.doesNotMatch(res.headers.get('content-security-policy'), /frame-ancestors/)
  assert.doesNotMatch(await res.text(), /never-forward/)
  assert.equal(
    bridge.upgrade({ url: '/widget/native/api/remote.mux', headers: { origin } }, v, 'auth').cookie,
    'auth'
  )
})

test('HTTPS termination accepts the same public host over internal HTTP without trusting forwarded headers', async () => {
  let calls = 0
  const bridge = nativeBridge({
    origin,
    request: async () => {
      calls++
      return new Response('ok')
    }
  })
  const v = visitor()
  const response = await bridge.forward(
    new Request('http://tracy.test:8443/widget/native/api/test'),
    v,
    'auth'
  )
  assert.equal(response.status, 200)
  for (const address of [
    'http://tracy.test:8080/widget/native/api/test',
    'http://foreign.test:8443/widget/native/api/test'
  ]) {
    await assert.rejects(
      bridge.forward(
        new Request(address, {
          headers: { 'x-forwarded-host': 'tracy.test:8443', 'x-forwarded-proto': 'https' }
        }),
        v,
        'auth'
      ),
      /ORIGIN_REFUSED/
    )
  }
  await assert.rejects(
    bridge.forward(
      new Request('http://tracy.test:8443/widget/native/api/test', {
        method: 'POST',
        headers: { origin: 'http://tracy.test:8443' },
        body: '{}'
      }),
      v,
      'auth'
    ),
    /ORIGIN_REFUSED/
  )
  assert.equal(calls, 1)
})
