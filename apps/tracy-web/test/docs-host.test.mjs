/**
 * The documentation host (`DOCS_ORIGIN`, e.g. `docs.tracy.ai`; tasks/todo-desktop-update-policy.md H2):
 * one more hostname tracy-web answers on, serving the documentation site at its root and nothing of
 * Tracy's own surface. Three layers: `lib/docs-host.js` (pure: is this Host header the docs host),
 * `hostKind` (the docs host is not the reserved site label `docs`), and the gate `app.js` mounts
 * before customer-site routing (allowlist, 404 elsewhere, no cookie in, no cookie out).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { hostKind } from '../src/bar/route.js'
import { docsHostname, isDocsHost } from '../src/lib/docs-host.js'
import { mintSession } from '../src/lib/session.js'

const sessionSecret = 's'.repeat(32)

const config = (overrides = {}) => ({
  origin: 'http://tracy.test:8080',
  secure: false,
  siteDomain: 'tracy.test',
  siteDomainAliases: ['localhost'],
  sessionSecret,
  sessionDomain: null,
  apiOrigin: 'http://api.tracy.test:8080',
  docsOrigin: 'http://docs.tracy.test:8080',
  ...overrides
})

/** A throwaway shaped like the Astro build for `base: '/'`. */
function siteDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-docs-host-'))
  const w = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  w('index.html', '<!doctype html><title>Tracy Docs</title><link href="/_astro/a.css">')
  w('quickstart/index.html', '<!doctype html><title>Quickstart</title>')
  w('vi/index.html', '<!doctype html><title>Tài liệu</title>')
  w('_astro/a.css', 'body{}')
  w('pagefind/pagefind.js', 'export {}')
  w('favicon.svg', '<svg/>')
  w('changelog/desktop/0.5/index.html', '<!doctype html><title>Tracy Cowork 0.5</title>')
  w('changelog/desktop/0.5.md', '\n## Highlights\n- A line. _(Desktop only)_\n')
  w('404.html', '<!doctype html><title>Not found</title>')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const appWith = (overrides = {}, deps = {}) =>
  buildApp({ config: config(overrides), mail: { send: async () => {} }, ...deps })

/** A request as the docs host sees it. */
const onDocs = (app, pathname, init = {}) =>
  app.request(`http://docs.tracy.test:8080${pathname}`, {
    ...init,
    headers: { host: 'docs.tracy.test:8080', ...init.headers }
  })

// ── lib/docs-host.js ──────────────────────────────────────────────────────────────────────────

test('docsHostname: the hostname of docsOrigin, lowercase, or null when there is no docs host', () => {
  assert.equal(docsHostname(config()), 'docs.tracy.test')
  assert.equal(docsHostname(config({ docsOrigin: 'https://DOCS.Tracy.AI:8443' })), 'docs.tracy.ai')
  assert.equal(docsHostname(config({ docsOrigin: null })), null)
  assert.equal(docsHostname(config({ docsOrigin: 'not a url' })), null)
  assert.equal(docsHostname({}), null)
})

test('isDocsHost: compares hostnames only — port and case do not matter', () => {
  assert.equal(isDocsHost('docs.tracy.test', config()), true)
  assert.equal(isDocsHost('DOCS.tracy.test:51710', config()), true)
  assert.equal(isDocsHost('api.tracy.test:8080', config()), false)
  assert.equal(isDocsHost('tracy.test:8080', config()), false)
  assert.equal(isDocsHost('', config()), false)
  assert.equal(isDocsHost(null, config()), false)
  assert.equal(isDocsHost('docs.tracy.test', config({ docsOrigin: null })), false)
})

// ── hostKind ──────────────────────────────────────────────────────────────────────────────────

test('hostKind: the docs host is its own kind, before the site-domain loop', () => {
  assert.deepEqual(hostKind('docs.tracy.test:8080', config()), { kind: 'docs' })
  // Also under an alias suffix it is not `docs.localhost`'s business.
  assert.deepEqual(hostKind('docs.localhost', config()), { kind: 'site', label: 'docs' })
  // Without a docs host the label stays the (reserved) site label it was.
  assert.deepEqual(hostKind('docs.tracy.test', config({ docsOrigin: null })), { kind: 'site', label: 'docs' })
  // The other kinds are untouched.
  assert.deepEqual(hostKind('api.tracy.test', config()), { kind: 'api' })
  assert.deepEqual(hostKind('tracy.test', config()), { kind: 'tracy' })
})

// ── the gate in app.js ────────────────────────────────────────────────────────────────────────

test('docs host: the site is served at the root, with its pages and assets', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const app = appWith({}, { docsStaticDir: site.root })
  for (const [url, title] of [
    ['/', 'Tracy Docs'],
    ['/quickstart/', 'Quickstart'],
    ['/quickstart', 'Quickstart'],
    ['/vi/', 'Tài liệu']
  ]) {
    const res = await onDocs(app, url)
    assert.equal(res.status, 200, url)
    assert.match(await res.text(), new RegExp(title), url)
  }
  const css = await onDocs(app, '/_astro/a.css')
  assert.equal(css.status, 200)
  assert.equal(css.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  // A missing page inside the site is the site's own 404 page.
  const missing = await onDocs(app, '/quickstart/nothing/')
  assert.equal(missing.status, 404)
  assert.match(await missing.text(), /Not found/)
})

test('docs host: a changelog page is also served as raw markdown, never cached for long (E3)', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const app = appWith({}, { docsStaticDir: site.root })
  const res = await onDocs(app, '/changelog/desktop/0.5.md')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(res.headers.get('cache-control'), 'no-cache')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await res.text(), '\n## Highlights\n- A line. _(Desktop only)_\n')
  const page = await onDocs(app, '/changelog/desktop/0.5/')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Tracy Cowork 0\.5/)
})

test('docs host: Tracy’s own doors are 404 NOT_ON_THIS_HOST, uncacheable, whatever the method', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const app = appWith({}, { docsStaticDir: site.root })
  for (const pathname of ['/login', '/api/sites', '/api/config', '/ops', '/v1/me', '/auth/me', '/badge.js']) {
    const res = await onDocs(app, pathname)
    assert.equal(res.status, 404, pathname)
    assert.deepEqual(await res.json(), { code: 'NOT_ON_THIS_HOST' }, pathname)
    assert.equal(res.headers.get('cache-control'), 'private, no-store', pathname)
  }
  const post = await onDocs(app, '/', { method: 'POST', body: '{}' })
  assert.equal(post.status, 404)
  assert.deepEqual(await post.json(), { code: 'NOT_ON_THIS_HOST' })
})

test('docs host: a signed-in cookie changes nothing and no answer sets one', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const app = appWith({}, { docsStaticDir: site.root })
  const cookie = `tracy_sess=${await mintSession('someone@example.test', sessionSecret)}`
  const login = await onDocs(app, '/login', { headers: { cookie } })
  assert.equal(login.status, 404)
  assert.deepEqual(await login.json(), { code: 'NOT_ON_THIS_HOST' })
  for (const pathname of ['/', '/quickstart/', '/nothing-here']) {
    const res = await onDocs(app, pathname, { headers: { cookie } })
    assert.equal(res.headers.get('set-cookie'), null, pathname)
  }
})

test('docs host: /.well-known/* passes the gate', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const res = await onDocs(appWith({}, { docsStaticDir: site.root }), '/.well-known/security.txt')
  assert.ok(!(await res.text()).includes('NOT_ON_THIS_HOST'))
})

test('docs host: /health answers as on every other hostname', async () => {
  const res = await onDocs(appWith(), '/health')
  assert.equal(res.status, 200)
})

test('without docsOrigin, docs.<siteDomain> stays the site router’s', async () => {
  const res = await onDocs(appWith({ docsOrigin: null }), '/login')
  const body = await res.text()
  assert.ok(!body.includes('NOT_ON_THIS_HOST'), body)
})
