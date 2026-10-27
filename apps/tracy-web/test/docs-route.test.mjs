/**
 * The documentation site (`src/docs/route.js`): a static directory served at the root of the docs
 * host (tasks/todo-desktop-update-policy.md H2), and every `/docs…` address of the old layout sent
 * there with a 302 from the hostnames that reach Tracy's own app (H3) — never from a customer site.
 * The static directory is a throwaway shaped like an Astro build for `base: '/'` (`index.html`,
 * `<page>/index.html`, hashed `_astro/`, `404.html`).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { docsLocation, docsRoutes, docsSiteBuilt, relPathFor } from '../src/docs/route.js'

function siteDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-docs-'))
  const w = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  w('index.html', '<!doctype html><title>Tracy API</title><link href="/_astro/a.css">')
  w('quickstart/index.html', '<!doctype html><title>Quickstart</title>')
  w('reference/errors/index.html', '<!doctype html><title>Errors</title>')
  w('_astro/a.css', 'body{}')
  w('pagefind/pagefind.js', 'export {}')
  w('favicon.svg', '<svg/>')
  w('404.html', '<!doctype html><title>Not found</title>')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const get = (app, url) => app.request(url)

test('relPathFor: root, pages, files — and no way out of the directory', () => {
  assert.equal(relPathFor('/'), '')
  assert.equal(relPathFor('/quickstart/'), 'quickstart/')
  assert.equal(relPathFor('/_astro/a.css'), '_astro/a.css')
  assert.equal(relPathFor('/../../etc/passwd'), 'etc/passwd')
  assert.equal(relPathFor('/%2e%2e/%2e%2e/etc/passwd'), 'etc/passwd')
  assert.equal(relPathFor('/..'), '')
  assert.equal(relPathFor('/%ZZ'), null)
})

test('serves the site root, a page with and without its trailing slash, and hashed assets', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const app = docsRoutes({ staticDir: site.root })

  const root = await get(app, '/')
  assert.equal(root.status, 200)
  assert.match(root.headers.get('content-type'), /text\/html/)
  assert.equal(root.headers.get('cache-control'), 'no-cache')
  assert.match(await root.text(), /Tracy API/)
  for (const url of ['/quickstart/', '/quickstart']) {
    const res = await get(app, url)
    assert.equal(res.status, 200, url)
    assert.match(await res.text(), /Quickstart/)
  }
  const nested = await get(app, '/reference/errors/')
  assert.match(await nested.text(), /Errors/)

  const css = await get(app, '/_astro/a.css')
  assert.equal(css.status, 200)
  assert.match(css.headers.get('content-type'), /text\/css/)
  assert.equal(css.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(css.headers.get('x-content-type-options'), 'nosniff')

  const pagefind = await get(app, '/pagefind/pagefind.js')
  assert.equal(pagefind.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const favicon = await get(app, '/favicon.svg')
  assert.equal(favicon.headers.get('content-type'), 'image/svg+xml')
  assert.equal(favicon.headers.get('cache-control'), 'no-cache')
})

test('an unknown page is the site’s own 404 page, with status 404 and no long cache', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  const app = docsRoutes({ staticDir: site.root })
  const res = await get(app, '/nothing-here/')
  assert.equal(res.status, 404)
  assert.match(await res.text(), /Not found/)
  assert.equal(res.headers.get('cache-control'), 'no-cache')
  const asset = await get(app, '/_astro/missing.css')
  assert.equal(asset.status, 404)
})

test('a path that tries to leave the directory never reads outside it', async (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  writeFileSync(path.join(site.root, '..', 'tracy-docs-outside.txt'), 'secret')
  t.after(() => rmSync(path.join(site.root, '..', 'tracy-docs-outside.txt'), { force: true }))
  const app = docsRoutes({ staticDir: site.root })
  for (const url of ['/../tracy-docs-outside.txt', '/%2e%2e/tracy-docs-outside.txt']) {
    const res = await get(app, url)
    assert.equal(res.status, 404, url)
    assert.doesNotMatch(await res.text(), /secret/)
  }
})

test('without a built site every page is a 404 that says the site was not built', async () => {
  const app = docsRoutes({ staticDir: path.join(tmpdir(), 'tracy-docs-does-not-exist') })
  const res = await get(app, '/')
  assert.equal(res.status, 404)
  const body = await res.text()
  assert.match(body, /Documentation not built/)
  assert.match(body, /pnpm --filter @tracy\/docs build/)
})

test('docsSiteBuilt: true only when the directory holds the built site’s index.html', (t) => {
  const site = siteDir()
  t.after(site.cleanup)
  assert.equal(docsSiteBuilt(site.root), true)
  assert.equal(docsSiteBuilt(path.join(site.root, 'quickstart', 'nothing-here')), false)
})

// ── H3: the old `/docs…` addresses ─────────────────────────────────────────────────────────────

test('docsLocation: the site loses its /docs prefix; the reference moved to /api/reference/', () => {
  assert.equal(docsLocation('/docs'), '/')
  assert.equal(docsLocation('/docs/'), '/')
  assert.equal(docsLocation('/docs/quickstart/'), '/quickstart/')
  assert.equal(docsLocation('/docs/vi/guides/joomla/'), '/vi/guides/joomla/')
  assert.equal(docsLocation('/docs/api'), '/api/reference/')
  assert.equal(docsLocation('/docs/api/'), '/api/reference/')
  assert.equal(docsLocation('/docs/api/openapi.json'), '/api/openapi.json')
  assert.equal(docsLocation('/docs/api/claude-cowork.json'), '/api/claude-cowork.json')
  assert.equal(docsLocation('/docs/api/llms.txt'), '/api/llms.txt')
  assert.equal(docsLocation('/docs/api/scalar.js'), '/api/reference/scalar.js')
  assert.equal(docsLocation('/docs/api/anything-else'), '/api/reference/')
  assert.equal(docsLocation('/docsx'), null)
  assert.equal(docsLocation('/'), null)
})

const redirectConfig = (overrides = {}) => ({
  origin: 'http://tracy.test:8080',
  secure: false,
  siteDomain: 'tracy.test',
  sessionSecret: 's'.repeat(32),
  apiOrigin: 'https://api.tracy.test',
  docsOrigin: 'https://docs.tracy.test',
  ...overrides
})
const at = (app, host, pathname) => app.request(`http://${host}${pathname}`, { headers: { host } })

test('Tracy’s own hostname: every /docs… address is a 302 to the docs host, query kept, uncacheable', async () => {
  const app = buildApp({ config: redirectConfig(), mail: { send: async () => {} } })
  for (const [pathname, location] of [
    ['/docs', 'https://docs.tracy.test/'],
    ['/docs/', 'https://docs.tracy.test/'],
    ['/docs/quickstart/?x=1', 'https://docs.tracy.test/quickstart/?x=1'],
    ['/docs/changelog/desktop/0.5.md', 'https://docs.tracy.test/changelog/desktop/0.5.md'],
    ['/docs/api', 'https://docs.tracy.test/api/reference/'],
    // Not kept on Tracy's own hostname: only the API host keeps the published documents.
    ['/docs/api/openapi.json', 'https://docs.tracy.test/api/openapi.json']
  ]) {
    const res = await at(app, 'tracy.test:8080', pathname)
    assert.equal(res.status, 302, pathname)
    assert.equal(res.headers.get('location'), location, pathname)
    assert.equal(res.headers.get('cache-control'), 'no-store', pathname)
  }
})

test('API host: pages go to the docs host; the three published documents stay where they were', async () => {
  const app = buildApp({ config: redirectConfig(), mail: { send: async () => {} } })
  const root = await at(app, 'api.tracy.test', '/')
  assert.equal(root.status, 302)
  // The docs home page is for people who use Tracy; the API host's root opens the API's own page.
  assert.equal(root.headers.get('location'), 'https://docs.tracy.test/api/')
  assert.equal(root.headers.get('cache-control'), 'no-store')
  for (const [pathname, location] of [
    ['/docs/', 'https://docs.tracy.test/'],
    ['/docs/quickstart/', 'https://docs.tracy.test/quickstart/'],
    ['/docs/changelog/desktop/0.5.md', 'https://docs.tracy.test/changelog/desktop/0.5.md'],
    ['/docs/api', 'https://docs.tracy.test/api/reference/']
  ]) {
    const res = await at(app, 'api.tracy.test', pathname)
    assert.equal(res.status, 302, pathname)
    assert.equal(res.headers.get('location'), location, pathname)
  }
  const doc = await at(app, 'api.tracy.test', '/docs/api/openapi.json')
  assert.equal(doc.status, 200)
  assert.equal((await doc.json()).openapi, '3.1.0')
  const cowork = await at(app, 'api.tracy.test', '/docs/api/claude-cowork.json')
  assert.equal(cowork.status, 200)
  const llms = await at(app, 'api.tracy.test', '/docs/api/llms.txt')
  assert.equal(llms.status, 200)
  assert.match(llms.headers.get('content-type'), /text\/plain/)
})

test('a customer site’s own /docs is never redirected', async () => {
  // A site book that knows no site: the site router answers its own refusal, not a 302 to docs.
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) }
  const app = buildApp({ config: redirectConfig(), pool, mail: { send: async () => {} } })
  for (const host of ['lantern.tracy.test', 'www.example.com']) {
    const res = await at(app, host, '/docs/')
    const location = res.headers.get('location') ?? ''
    assert.ok(!location.includes('docs.tracy.test'), `${host}: ${res.status} ${location}`)
  }
})

test('without a docs host: /docs… says so, and the documents are still served where they were', async () => {
  const app = buildApp({ config: redirectConfig({ docsOrigin: null }), mail: { send: async () => {} } })
  const page = await at(app, 'tracy.test:8080', '/docs/')
  assert.equal(page.status, 404)
  assert.match(await page.text(), /DOCS_ORIGIN/)
  const doc = await at(app, 'tracy.test:8080', '/docs/api/openapi.json')
  assert.equal(doc.status, 200)
  const api = await at(app, 'api.tracy.test', '/')
  assert.equal(api.status, 404)
  assert.deepEqual(await api.json(), { code: 'NOT_ON_THIS_HOST' })
})
