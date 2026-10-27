/**
 * The API host (`API_ORIGIN`, tasks/todo-api-public.md S2): one more hostname tracy-web answers on,
 * and what it refuses there. Two layers are tested — `lib/api-host.js` (pure: is this Host header
 * the API host) and the gate `app.js` mounts after host routing (allowlist, 404 elsewhere, and no
 * session cookie reaching any route). Without `apiOrigin` nothing here changes anything: the last
 * test pins that.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiHostname, isApiHost } from '../src/lib/api-host.js'
import { buildApp } from '../src/app.js'
import { mintSession } from '../src/lib/session.js'

const sessionSecret = 's'.repeat(32)

const config = (overrides = {}) => ({
  origin: 'http://tracy.test:8080',
  secure: false,
  siteDomain: 'tracy.test',
  siteDomainAliases: ['localhost'],
  sessionSecret,
  sessionDomain: null,
  apiOrigin: 'https://api.tracy.test',
  ...overrides
})

const appWith = (overrides = {}) => buildApp({ config: config(overrides), mail: { send: async () => {} } })

/** A request as the API host sees it: `Host` names the API origin's hostname. */
const onApi = (app, path, init = {}) =>
  app.request(`http://api.tracy.test${path}`, {
    ...init,
    headers: { host: 'api.tracy.test', ...init.headers }
  })

// ── lib/api-host.js ───────────────────────────────────────────────────────────────────────────

test('apiHostname: the hostname of apiOrigin, lowercase, or null when there is no API host', () => {
  assert.equal(apiHostname(config()), 'api.tracy.test')
  assert.equal(apiHostname(config({ apiOrigin: 'https://API.Tracy.AI:8443' })), 'api.tracy.ai')
  assert.equal(apiHostname(config({ apiOrigin: null })), null)
  assert.equal(apiHostname({}), null)
})

test('isApiHost: compares hostnames only — port and case do not matter; no apiOrigin is never the API host', () => {
  assert.equal(isApiHost('api.tracy.test', config()), true)
  assert.equal(isApiHost('API.tracy.test:8080', config()), true)
  assert.equal(isApiHost('tracy.test:8080', config()), false)
  assert.equal(isApiHost('lantern.tracy.test', config()), false)
  assert.equal(isApiHost('', config()), false)
  assert.equal(isApiHost(null, config()), false)
  assert.equal(isApiHost('api.tracy.test', config({ apiOrigin: null })), false)
})

// ── the gate in app.js ────────────────────────────────────────────────────────────────────────

test('API host: /health answers as on every other hostname', async () => {
  const res = await onApi(appWith(), '/health')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})

test('API host: / redirects to the API overview on the documentation host, uncacheable', async () => {
  const res = await onApi(appWith({ docsOrigin: 'https://docs.tracy.test' }), '/')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://docs.tracy.test/api/')
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('API host: the reference page moved to the docs host; its document is still served here', async () => {
  const app = appWith({ docsOrigin: 'https://docs.tracy.test' })
  const page = await onApi(app, '/docs/api')
  assert.equal(page.status, 302)
  assert.equal(page.headers.get('location'), 'https://docs.tracy.test/api/reference/')
  const doc = await onApi(app, '/docs/api/openapi.json')
  assert.equal(doc.status, 200)
  assert.equal((await doc.json()).openapi, '3.1.0')
})

test('API host: everything outside the allowlist is 404 NOT_ON_THIS_HOST, uncacheable', async () => {
  const app = appWith()
  for (const path of ['/login', '/api/sites', '/api/config', '/ops', '/agent', '/badge.js', '/docs-api']) {
    const res = await onApi(app, path)
    assert.equal(res.status, 404, path)
    assert.deepEqual(await res.json(), { code: 'NOT_ON_THIS_HOST' }, path)
    assert.equal(res.headers.get('cache-control'), 'private, no-store', path)
  }
  // Not only GET.
  const post = await onApi(app, '/api/sites', { method: 'POST', body: '{}' })
  assert.equal(post.status, 404)
  assert.deepEqual(await post.json(), { code: 'NOT_ON_THIS_HOST' })
})

test('API host: /v1, /docs/* and /.well-known/* pass the gate (nothing serves them yet — not the gate’s 404)', async () => {
  const app = appWith()
  for (const path of ['/v1', '/v1/me', '/docs/anything', '/.well-known/security.txt']) {
    const res = await onApi(app, path)
    const body = await res.text()
    assert.ok(!body.includes('NOT_ON_THIS_HOST'), `${path} was refused by the host gate: ${body}`)
  }
})

test('API host: an unpublished /.well-known/* file is a plain 404, never a redirect to sign-in (DT-3)', async () => {
  // Measured 11/10/2026 on api.tracy.site: `/.well-known/<x>` answered 302 `Location: /login`, and
  // `/login` is itself NOT_ON_THIS_HOST here. The docs host answers the same path 404 (`docs/route.js`).
  for (const app of [appWith(), appWith({ docsOrigin: 'https://docs.tracy.test' })]) {
    // A stand-in for the workspace door (`workspace/route.js`, the dsh catch-all mounted with a
    // pool): a stranger at the root scope is sent to `/login`. Registered after the gate, so it
    // answers whatever nothing earlier answered — which is how the 302 reached the API host.
    app.all('*', (c) => c.redirect('/login', 302))
    for (const path of [
      '/.well-known/security.txt',
      '/.well-known/x',
      '/.well-known/apple-app-site-association'
    ]) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        const res = await onApi(app, path, { method })
        assert.equal(res.status, 404, `${method} ${path}`)
        assert.equal(res.headers.get('location'), null, `${method} ${path}`)
        assert.equal(res.headers.get('cache-control'), 'private, no-store', `${method} ${path}`)
      }
    }
  }
})

test('API host: no route sees the session cookie — the header is dropped before routing', async () => {
  const app = appWith()
  // A stand-in for the `/v1` routes S3 adds: registered after the gate, so it runs behind it.
  app.get('/v1/__cookie-probe', (c) => c.json({ cookie: c.req.header('cookie') ?? null }))
  const cookie = `tracy_sess=${await mintSession('someone@example.test', sessionSecret)}`

  const onApiHost = await onApi(app, '/v1/__cookie-probe', { headers: { cookie } })
  assert.equal(onApiHost.status, 200)
  assert.deepEqual(await onApiHost.json(), { cookie: null })

  // Control: the same route on Tracy's own hostname still sees it.
  const onTracy = await app.request('http://tracy.test:8080/v1/__cookie-probe', {
    headers: { host: 'tracy.test:8080', cookie }
  })
  assert.deepEqual(await onTracy.json(), { cookie })
})

test('API host: a POST body survives the cookie strip', async () => {
  const app = appWith()
  app.post('/v1/__echo', async (c) =>
    c.json({ body: await c.req.text(), cookie: c.req.header('cookie') ?? null })
  )
  const res = await onApi(app, '/v1/__echo', {
    method: 'POST',
    body: '{"a":1}',
    headers: { cookie: 'tracy_sess=x', 'content-type': 'application/json' }
  })
  assert.deepEqual(await res.json(), { body: '{"a":1}', cookie: null })
})

test('API host: a signed-in cookie on a door outside the allowlist is still 404, never a signed-in answer', async () => {
  const cookie = `tracy_sess=${await mintSession('someone@example.test', sessionSecret)}`
  const res = await onApi(appWith(), '/auth/me', { headers: { cookie } })
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { code: 'NOT_ON_THIS_HOST' })
})

test('without apiOrigin nothing changes: api.<siteDomain> is not the API host and /login answers as today', async () => {
  const app = appWith({ apiOrigin: null })
  const probe = await onApi(app, '/login')
  assert.notEqual(probe.status, 404)
  const res = await onApi(app, '/api/config')
  assert.equal(res.status, 200)
})

// ── CORS for the docs host's "Test request" (tasks/todo-desktop-update-policy.md H4) ─────────────

const DOCS = 'https://docs.tracy.test'

test('API host: a preflight from the docs origin to /v1 is allowed — a key in Authorization, no credentials', async () => {
  const app = appWith({ docsOrigin: DOCS })
  const res = await onApi(app, '/v1/me', {
    method: 'OPTIONS',
    headers: {
      origin: DOCS,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization'
    }
  })
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('access-control-allow-origin'), DOCS)
  assert.match(res.headers.get('access-control-allow-headers') ?? '', /authorization/i)
  assert.match(res.headers.get('access-control-allow-methods') ?? '', /PATCH/)
  assert.equal(res.headers.get('access-control-allow-credentials'), null)
  assert.match(res.headers.get('vary') ?? '', /origin/i)
})

test('API host: the answer to the docs origin carries its CORS headers; any other origin gets none', async () => {
  const app = appWith({ docsOrigin: DOCS })
  app.get('/v1/__cors-probe', (c) => c.json({ ok: true }))
  const fromDocs = await onApi(app, '/v1/__cors-probe', { headers: { origin: DOCS } })
  assert.equal(fromDocs.status, 200)
  assert.equal(fromDocs.headers.get('access-control-allow-origin'), DOCS)
  assert.match(fromDocs.headers.get('access-control-expose-headers') ?? '', /etag/i)
  assert.equal(fromDocs.headers.get('access-control-allow-credentials'), null)

  for (const origin of ['https://evil.example', 'http://tracy.test:8080', 'https://lantern.tracy.test']) {
    const preflight = await onApi(app, '/v1/me', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization'
      }
    })
    assert.equal(preflight.headers.get('access-control-allow-origin'), null, origin)
    const res = await onApi(app, '/v1/__cors-probe', { headers: { origin } })
    assert.equal(res.headers.get('access-control-allow-origin'), null, origin)
  }
})

test('API host: CORS is opened for /v1 alone, and only where a docs host is configured', async () => {
  const app = appWith({ docsOrigin: DOCS })
  const docs = await onApi(app, '/.well-known/x', { headers: { origin: DOCS } })
  assert.equal(docs.headers.get('access-control-allow-origin'), null)
  const none = await onApi(appWith({ docsOrigin: null }), '/v1/me', {
    method: 'OPTIONS',
    headers: { origin: DOCS, 'access-control-request-method': 'GET' }
  })
  assert.equal(none.headers.get('access-control-allow-origin'), null)
})
