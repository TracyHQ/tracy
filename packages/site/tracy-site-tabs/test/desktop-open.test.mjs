/**
 * Where a link the desktop app's window was asked to open goes (`desktop-open.mjs`): the table of
 * tasks/todo-desktop-window-shell.md, one test per row, plus the address shapes that trip it.
 *
 *   node --test packages/site/tracy-site-tabs/test/desktop-open.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { routeDesktopOpen } from '../src/client/desktop-open.mjs'

const ORIGIN = 'http://tracy.test:8080'
const SITES = [
  { siteKey: 'r1w1734.tracy.test', copyUrl: 'http://r1w1734.tracy.test:8080/', aliases: [] },
  { siteKey: 'shop.tracy.site', copyUrl: 'http://shop.localhost:8080/', aliases: ['shop.example.com'] }
]
const onSite = (siteKey) => ({ origin: ORIGIN, currentSite: siteKey, sites: SITES })

test('a third-party page opens in the browser', () => {
  assert.deepEqual(routeDesktopOpen('https://discord.gg/abc', onSite('r1w1734.tracy.test')), {
    kind: 'external'
  })
})

test('an address that is not http(s), or no address at all, opens in the browser', () => {
  for (const url of ['mailto:help@tracy.ai', 'blob:http://tracy.test:8080/1234', 'not a url', '', undefined])
    assert.deepEqual(routeDesktopOpen(url, onSite('r1w1734.tracy.test')), { kind: 'external' }, String(url))
})

test("a front page of the site on screen opens in the side card's Browser tab, address untouched", () => {
  assert.deepEqual(
    routeDesktopOpen('http://r1w1734.tracy.test:8080/about/?x=1#team', onSite('r1w1734.tracy.test')),
    {
      kind: 'tab',
      url: 'http://r1w1734.tracy.test:8080/about/?x=1#team',
      siteKey: 'r1w1734.tracy.test'
    }
  )
})

test('the site on screen is matched at its served address and at each alias, and on no other port', () => {
  const ctx = onSite('shop.tracy.site')
  assert.equal(routeDesktopOpen('http://shop.localhost:8080/', ctx).kind, 'tab')
  assert.equal(routeDesktopOpen('https://shop.example.com/cart', ctx).kind, 'tab')
  assert.equal(routeDesktopOpen('https://SHOP.example.com/', ctx).kind, 'tab')
  assert.deepEqual(routeDesktopOpen('http://shop.localhost:9999/', ctx), { kind: 'external' })
  assert.deepEqual(routeDesktopOpen('https://shop.example.com:8443/', ctx), { kind: 'external' })
})

test("a site's admin (WordPress, Joomla, EmDash) opens in the browser, on the site on screen too", () => {
  const ctx = onSite('r1w1734.tracy.test')
  for (const path of [
    '/wp-admin/',
    '/wp-admin/post.php?post=4',
    '/wp-login.php',
    '/administrator/',
    '/administrator',
    '/_emdash/admin/settings/general'
  ])
    assert.deepEqual(
      routeDesktopOpen(`http://r1w1734.tracy.test:8080${path}`, ctx),
      { kind: 'external' },
      path
    )
  assert.deepEqual(routeDesktopOpen('https://shop.example.com/wp-admin/', ctx), { kind: 'external' })
  // A front page whose path only starts with the same letters is a front page.
  assert.equal(routeDesktopOpen('http://r1w1734.tracy.test:8080/administrators-blog/', ctx).kind, 'tab')
})

test("another of the viewer's sites: the window moves to that site, the page riding along whole", () => {
  assert.deepEqual(
    routeDesktopOpen('http://shop.localhost:8080/cart/?step=2#pay', onSite('r1w1734.tracy.test')),
    {
      kind: 'navigate',
      url: 'http://tracy.test:8080/shop.tracy.site/?open=browser&page=%2Fcart%2F%3Fstep%3D2%23pay'
    }
  )
})

test('another site reached at an alias keeps that alias for its Browser tab', () => {
  const decision = routeDesktopOpen('https://shop.example.com/cart', onSite('r1w1734.tracy.test'))
  assert.equal(decision.kind, 'navigate')
  const url = new URL(decision.url)
  assert.equal(url.pathname, '/shop.tracy.site/')
  assert.equal(url.searchParams.get('page'), '/cart')
  assert.equal(url.searchParams.get('host'), 'shop.example.com')
})

test('off a site page (the creation workspace), a site link moves the window to that site', () => {
  const decision = routeDesktopOpen('http://r1w1734.tracy.test:8080/', {
    origin: ORIGIN,
    currentSite: null,
    sites: SITES
  })
  assert.deepEqual(decision, {
    kind: 'navigate',
    url: 'http://tracy.test:8080/r1w1734.tracy.test/?open=browser&page=%2F'
  })
})

test("Tracy's own screens open in this window", () => {
  const ctx = onSite('r1w1734.tracy.test')
  for (const path of [
    '/shop.tracy.site/',
    '/shop.tracy.site/s/abc123',
    '/r1w1734.tracy.test/?tab=tracy:team',
    '/new/',
    '/new',
    '/ops',
    '/ops/ui',
    '/ops?x=1'
  ])
    assert.deepEqual(
      routeDesktopOpen(`${ORIGIN}${path}`, ctx),
      { kind: 'navigate', url: `${ORIGIN}${path}` },
      path
    )
})

test("anything else on Tracy's origin keeps the old road to the browser: downloads, sign-in, doors", () => {
  const ctx = onSite('r1w1734.tracy.test')
  for (const path of [
    '/',
    '/login',
    '/signin/google',
    '/auth/callback?code=1',
    '/api/sites/x/backup.zip',
    '/docs/api',
    '/newsletter',
    '/opsx'
  ])
    assert.deepEqual(routeDesktopOpen(`${ORIGIN}${path}`, ctx), { kind: 'external' }, path)
})

test("Tracy's screens on another port or scheme are not Tracy's", () => {
  assert.deepEqual(routeDesktopOpen('http://tracy.test:9999/new/', onSite(null)), { kind: 'external' })
  assert.deepEqual(routeDesktopOpen('https://tracy.test:8080/new/', onSite(null)), { kind: 'external' })
})

test("an alias also counts on the served address's port: one server answers every name of the site", () => {
  const sites = [
    {
      siteKey: 'e2e3js.tracy.test',
      copyUrl: 'http://e2e3js.tracy.test:8080/',
      aliases: ['r96-e2e3js.tracy.test', 'e2e3js.tracy.test']
    }
  ]
  const decision = routeDesktopOpen('http://r96-e2e3js.tracy.test:8080/about/', {
    origin: ORIGIN,
    currentSite: 'e2e3js.tracy.test',
    sites
  })
  assert.deepEqual(decision, {
    kind: 'tab',
    url: 'http://r96-e2e3js.tracy.test:8080/about/',
    siteKey: 'e2e3js.tracy.test'
  })
})

// ── "Somewhere else" (Cmd+click, middle click, Shift+click): a second app window, or the browser ──

const elsewhere = { disposition: 'background-tab' }

test("Cmd+click on another of the viewer's sites opens it in a second window, the page riding along", () => {
  assert.deepEqual(
    routeDesktopOpen('http://shop.localhost:8080/cart?x=1', onSite('r1w1734.tracy.test'), elsewhere),
    {
      kind: 'window',
      url: `${ORIGIN}/shop.tracy.site/?open=browser&page=%2Fcart%3Fx%3D1`
    }
  )
})

test("Cmd+click on one of Tracy's screens opens it in a second window", () => {
  for (const path of ['/r1w1734.tracy.test/', '/shop.tracy.site/s/session-1', '/new/', '/ops/ui'])
    assert.deepEqual(routeDesktopOpen(`${ORIGIN}${path}`, onSite('r1w1734.tracy.test'), elsewhere), {
      kind: 'window',
      url: `${ORIGIN}${path}`
    })
})

test('Shift+click and middle click count as Cmd+click', () => {
  for (const disposition of ['new-window', 'background-tab', 'new-background-tab'])
    assert.equal(
      routeDesktopOpen(`${ORIGIN}/new/`, onSite('r1w1734.tracy.test'), { disposition }).kind,
      'window'
    )
})

test('Cmd+click keeps the browser for a third party, an admin, a page of the site on screen and a non-screen of Tracy', () => {
  const ctx = onSite('r1w1734.tracy.test')
  for (const url of [
    'https://discord.gg/abc',
    'http://shop.localhost:8080/wp-admin/',
    'http://r1w1734.tracy.test:8080/about/',
    `${ORIGIN}/login`,
    `${ORIGIN}/api/sites`,
    'mailto:help@tracy.ai'
  ])
    assert.deepEqual(routeDesktopOpen(url, ctx, elsewhere), { kind: 'external' }, url)
})

test('a plain click is routed as before, never into a second window', () => {
  const ctx = onSite('r1w1734.tracy.test')
  assert.equal(routeDesktopOpen(`${ORIGIN}/new/`, ctx, { disposition: 'foreground-tab' }).kind, 'navigate')
  assert.equal(routeDesktopOpen(`${ORIGIN}/new/`, ctx, {}).kind, 'navigate')
  assert.equal(routeDesktopOpen(`${ORIGIN}/new/`, ctx).kind, 'navigate')
})
