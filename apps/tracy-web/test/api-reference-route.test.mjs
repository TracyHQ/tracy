// The public API reference on the docs host (`/api/reference/`, Scalar, self-hosted; tasks/
// todo-desktop-update-policy.md H4), its bundle and the documents it draws — and what stays on the
// API host (the three published documents at `/docs/api/<file>`) and on Tracy's own (`/ops/api`).
// The routes take the document builder as a parameter, so these tests hand them a fake one; the
// last tests go through `buildApp` to prove the composition root mounts them where they belong.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiReferenceRoutes, docsReferenceRoutes, ownsDocsReferencePath } from '../src/api-reference/route.js'
import { buildApp } from '../src/app.js'

const FAKE_SPEC = { openapi: '3.1.0', info: { title: 'Fake', version: '0' }, paths: {} }
const API_ORIGIN = 'https://api.example.test'

function docs(over = {}) {
  const calls = []
  const app = docsReferenceRoutes({
    buildSpec: (args) => {
      calls.push(args)
      return FAKE_SPEC
    },
    apiOrigin: API_ORIGIN,
    ...over
  })
  return { app, calls }
}

function routes(over = {}) {
  const calls = []
  const app = apiReferenceRoutes({
    buildSpec: (args) => {
      calls.push(args)
      return FAKE_SPEC
    },
    ...over
  })
  return { app, calls }
}

const configurationOf = (html) => {
  const raw = /data-configuration="([^"]*)"/.exec(html)?.[1]
  assert.ok(raw, 'data-configuration attribute present')
  return JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&'))
}

test('ownsDocsReferencePath: the reference page, its bundle and the three documents — nothing else', () => {
  for (const path of [
    '/api/reference',
    '/api/reference/',
    '/api/reference/scalar.js',
    '/api/openapi.json',
    '/api/claude-cowork.json',
    '/api/llms.txt'
  ])
    assert.equal(ownsDocsReferencePath(path), true, path)
  for (const path of ['/api/sites', '/api/config', '/api/', '/docs/api', '/ops/api'])
    assert.equal(ownsDocsReferencePath(path), false, path)
})

test('GET /api/reference/ is an HTML page that loads the self-hosted bundle and the document', async () => {
  const { app } = docs()
  for (const url of ['/api/reference/', '/api/reference']) {
    const res = await app.request(`http://docs.example.test${url}`)
    assert.equal(res.status, 200, url)
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
    const html = await res.text()
    assert.match(html, /<title>Tracy API reference<\/title>/)
    assert.match(html, /<script src="\/api\/reference\/scalar\.js\?v=[0-9a-f]{16}"><\/script>/)
    assert.match(html, /data-url="\/api\/openapi\.json"/)
    // No CDN, and no inline script for the CSP to allow.
    assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|cdn\.scalar/)
    assert.doesNotMatch(html, /<script>/)
  }
})

/** One CSP directive's sources, by name (`script-src` → `["'self'", …]`). */
const directive = (csp, name) =>
  csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([head]) => head === name)
    ?.slice(1)

test('the page may call the API host and nothing else: connect-src names it, scripts stay self', async () => {
  const { app } = docs()
  const csp = (await app.request('/api/reference/')).headers.get('content-security-policy') ?? ''
  assert.deepEqual(directive(csp, 'script-src'), ["'self'", 'static.cloudflareinsights.com'])
  assert.deepEqual(directive(csp, 'connect-src'), [
    "'self'",
    'https://api.example.test',
    'cloudflareinsights.com'
  ])
  // Without an API host there is no other origin to name.
  const bare = docs({ apiOrigin: null }).app
  const bareCsp = (await bare.request('/api/reference/')).headers.get('content-security-policy') ?? ''
  assert.deepEqual(directive(bareCsp, 'connect-src'), ["'self'", 'cloudflareinsights.com'])
})

test('the edge analytics beacon Cloudflare injects may load and report — exactly its two hosts (DT-2)', async () => {
  // Measured 11/10/2026 on docs.tracy.site/api/reference/: the beacon the edge injects into every
  // HTML answer was refused twice per visit (script + report) by this page's CSP.
  const { app } = docs()
  const csp = (await app.request('/api/reference/')).headers.get('content-security-policy') ?? ''
  assert.ok(directive(csp, 'script-src')?.includes('static.cloudflareinsights.com'), csp)
  assert.ok(directive(csp, 'connect-src')?.includes('cloudflareinsights.com'), csp)
  // Nothing wider: no wildcard, no scheme-only source, no other Cloudflare host.
  assert.doesNotMatch(csp, /\*|https:(\s|;|$)|cloudflare\.com/)
})

test('the page configuration keeps readers off Scalar services', async () => {
  const { app } = docs()
  const configuration = configurationOf(await (await app.request('/api/reference/')).text())
  // Two documents: Tracy's own API first, then the Claude Cowork plugin.
  assert.deepEqual(
    configuration.sources.map((source) => source.url),
    ['/api/openapi.json', '/api/claude-cowork.json']
  )
  assert.equal(configuration.sources[0].default, true)
  assert.equal(configuration.withDefaultFonts, false)
  assert.equal(configuration.telemetry, false)
  assert.equal(configuration.agent?.disabled, true)
  assert.equal(configuration.proxyUrl, undefined)
})

test('GET /api/reference/scalar.js serves the installed bundle, immutable only under its own hash', async () => {
  const { app } = docs()
  const page = await (await app.request('/api/reference/')).text()
  const src = /<script src="([^"]+)"/.exec(page)[1]
  const res = await app.request(src)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^text\/javascript/)
  assert.match(res.headers.get('cache-control') ?? '', /immutable/)
  const body = await res.text()
  assert.ok(body.length > 100_000, `bundle is ${body.length} bytes`)
  const bare = await app.request('/api/reference/scalar.js')
  assert.equal(bare.status, 200)
  assert.doesNotMatch(bare.headers.get('cache-control') ?? '', /immutable/)
})

test('a missing bundle answers 503 in English instead of throwing', async () => {
  const { app } = docs({ bundlePath: new URL('./does-not-exist.js', import.meta.url) })
  const res = await app.request('/api/reference/scalar.js')
  assert.equal(res.status, 503)
  assert.match(await res.text(), /not installed/)
  const page = await app.request('/api/reference/')
  assert.equal(page.status, 200)
})

test('GET /api/openapi.json is the /v1 document with the API host as its server', async () => {
  const { app, calls } = docs()
  const res = await app.request('http://docs.example.test/api/openapi.json', {
    headers: { host: 'docs.example.test' }
  })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  assert.deepEqual(await res.json(), FAKE_SPEC)
  assert.deepEqual(calls, [{ origin: API_ORIGIN, publicApi: true }])
})

test('GET /api/llms.txt and /api/claude-cowork.json are served beside it', async () => {
  const { app, calls } = docs()
  const llms = await app.request('/api/llms.txt')
  assert.equal(llms.status, 200)
  assert.match(llms.headers.get('content-type') ?? '', /^text\/plain/)
  assert.deepEqual(calls, [{ origin: API_ORIGIN, publicApi: true }])
  const cowork = await app.request('/api/claude-cowork.json')
  assert.equal(cowork.status, 200)
  assert.equal(cowork.headers.get('access-control-allow-origin'), '*')
  assert.match(String((await cowork.json()).openapi), /^3\.1/)
})

test('API host: GET /docs/api/openapi.json returns what buildSpec builds, for the origin the reader is on', async () => {
  const { app, calls } = routes({ isApiHost: () => true })
  const res = await app.request('http://api.example.test/docs/api/openapi.json', {
    headers: { host: 'api.example.test', 'x-forwarded-proto': 'https' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await res.json(), FAKE_SPEC)
  assert.deepEqual(calls, [{ origin: 'https://api.example.test', publicApi: true }])
})

test('an unknown forwarded scheme is ignored, not echoed into the document', async () => {
  const { app, calls } = routes()
  await app.request('http://tracy.example.test:8080/docs/api/openapi.json', {
    headers: { host: 'tracy.example.test:8080', 'x-forwarded-proto': 'javascript' }
  })
  assert.deepEqual(calls, [{ origin: 'http://tracy.example.test:8080' }])
})

test('the main router no longer draws a page under /docs/api: that page is the docs host’s', async () => {
  const { app } = routes()
  assert.equal((await app.request('/docs/api')).status, 404)
  assert.equal((await app.request('/docs/api/scalar.js')).status, 404)
})

test('the staff page loads its bundle and the plugin document from /ops/api, its own origin', async () => {
  const { app } = routes({ admitInternal: async () => null })
  const html = await (await app.request('/ops/api')).text()
  assert.match(html, /<script src="\/ops\/api\/scalar\.js\?v=[0-9a-f]{16}"><\/script>/)
  const sources = configurationOf(html).sources.map((source) => source.url)
  assert.ok(
    sources.every((url) => url.startsWith('/ops/api/')),
    sources.join(', ')
  )
  assert.equal((await app.request('/ops/api/scalar.js')).status, 200)
  assert.equal((await app.request('/ops/api/claude-cowork.json')).status, 200)
})

test('buildApp: the docs host draws the reference; its document serves the API host', async () => {
  const config = {
    origin: 'http://tracy.test:8080',
    secure: false,
    siteDomain: 'tracy.test',
    sessionSecret: 's'.repeat(32),
    apiOrigin: 'http://api.tracy.test:8080',
    docsOrigin: 'http://docs.tracy.test:8080'
  }
  const app = buildApp({ config, mail: { send: async () => {} } })
  const on = (pathname) =>
    app.request(`http://docs.tracy.test:8080${pathname}`, { headers: { host: 'docs.tracy.test:8080' } })
  const page = await on('/api/reference/')
  assert.equal(page.status, 200)
  assert.match(
    page.headers.get('content-security-policy') ?? '',
    /connect-src 'self' http:\/\/api\.tracy\.test:8080/
  )
  const spec = await (await on('/api/openapi.json')).json()
  assert.match(String(spec.openapi), /^3\.1/)
  assert.deepEqual(spec.servers, [{ url: 'http://api.tracy.test:8080' }])
  assert.ok(Object.keys(spec.paths).every((p) => p.startsWith('/v1')))
  assert.equal((await on('/api/reference/scalar.js')).status, 200)
  // On Tracy's own hostname `/api/openapi.json` is not the reference: no Tracy door answers it as one.
  const own = await app.request('http://tracy.test:8080/api/openapi.json', {
    headers: { host: 'tracy.test:8080' }
  })
  assert.notEqual(own.headers.get('content-type')?.startsWith('application/json') && own.status === 200, true)
})
