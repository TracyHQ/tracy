/**
 * The badge is an advertisement, so the only things worth pinning are the ones a wrong value would
 * make dishonest or dangerous: where the button goes, that the script holds no door of its own,
 * and that both files answer without a session.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { SEAT_BADGE_OFF } from '../src/lib/seat-badge.js'
import { BADGE_SCRIPT, badgeHref, badgeSnippet } from '../src/lib/tracy-badge.js'
import { badgeRoutes } from '../src/badge/route.js'

const app = badgeRoutes({ config: { origin: 'https://cowork.tracy.site' } })

/** A pool that answers `badge_setting` with the rows given, or throws. */
const poolWith = (rows) => ({ query: async () => ({ rows }) })
const brokenPool = {
  query: async () => {
    throw new Error('connection refused')
  }
}
const leftAdvert = {
  doors: { customize: { on: true, label: 'Make it yours' }, close: { on: false, label: 'Close' } },
  style: { bg: '#123456', fg: '#ffffff', accent: '#00ff00', position: 'left', mark: false }
}

test('the button opens the template on the provider shelf', () => {
  assert.equal(
    badgeHref({ template: 'tracy-business' }),
    'https://cowork.tracy.ai/design-inspiration?open=tracy-business&provider=JoomlArt'
  )
})

test('a template id that could not be a gallery id opens the gallery instead of a wrong dialog', () => {
  const href = badgeHref({ template: '../../admin' })
  assert.equal(href, 'https://cowork.tracy.ai/design-inspiration?provider=JoomlArt')
  assert.ok(!href.includes('open='))
})

test('the snippet escapes what it quotes', () => {
  const tag = badgeSnippet({ scriptUrl: 'https://x/tracy-badge.js', template: 'a" onload="x' })
  assert.ok(!tag.includes('onload="x"'))
  assert.ok(tag.includes('data-provider="JoomlArt"'))
})

test('the script carries no sign-in, no cookie and no API call', () => {
  // 'sign-in' is not in the list: `design-inspiration` contains it as a substring, and a test that
  // fails on the destination's own name teaches nothing.
  for (const forbidden of [
    'document.cookie',
    'fetch(',
    'XMLHttpRequest',
    '/__tracy/',
    'localStorage',
    'password'
  ])
    assert.ok(!BADGE_SCRIPT.includes(forbidden), `badge script must not mention ${forbidden}`)
})

test('both doors answer with no session at all', async () => {
  const js = await app.fetch(new Request('https://cowork.tracy.site/tracy-badge.js'))
  assert.equal(js.status, 200)
  assert.match(js.headers.get('content-type') ?? '', /javascript/)
  assert.equal(js.headers.get('set-cookie'), null)

  const page = await app.fetch(new Request('https://cowork.tracy.site/tracy-badge?template=tracy-base'))
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes('open=tracy-base'.replace('=', '=')) || html.includes('open=tracy-base'))
  assert.ok(html.includes('/tracy-badge.js'))
  assert.equal(page.headers.get('set-cookie'), null)
})

test('the badge domain imports nothing but its own two files', () => {
  for (const file of [
    'src/lib/tracy-badge.js',
    'src/lib/build-with-tracy-demo.js',
    'src/lib/seat-badge.js',
    'src/lib/badge-setting.js',
    'src/badge/route.js'
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
      const own = spec.startsWith('./') || spec.startsWith('../lib/') || !spec.startsWith('.')
      assert.ok(own, `${file} reaches outside its domain: ${spec}`)
    }
  }
})

test('a demo proxied without a badge is passed through untouched, with one included', async () => {
  const { proxySite } = await import('../src/bar/site-proxy.js')
  const page = '<!doctype html><html><body><h1>Demo</h1></body></html>'
  const upstream = () =>
    Promise.resolve(new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  const ask = (variant) =>
    proxySite(new Request('https://demo.example/'), new URL('https://origin.internal/'), {
      variant,
      badgeScriptUrl: 'https://cowork.tracy.site/tracy-badge.js',
      badgeTemplate: 'tracy-base',
      badgeOrigin: 'https://cowork.tracy.site',
      viewerHost: 'demo.example',
      viewerProto: 'https',
      publish: 'published',
      badgeUrl: 'https://cowork.tracy.site/badge.js',
      fetchImpl: upstream
    }).then((r) => r.text())

  const without = await ask('none')
  assert.equal(without, page)

  const withBadge = await ask('advert')
  assert.ok(withBadge.includes('/tracy-badge.js'))
  assert.ok(withBadge.includes('data-template="tracy-base"'))
  assert.ok(!withBadge.includes('/badge.js"'), 'a demo never carries the seat pill')
  assert.ok(!withBadge.includes('data-variant='), 'a demo never carries the seat pill')
})

test('the three scripts are functions of the saved setting, and the seat pill has its own door', async () => {
  const saved = badgeRoutes({
    config: { origin: 'https://cowork.tracy.site' },
    pool: poolWith([{ id: 'advert', setting: leftAdvert, revision: 2, updated_by: 'a', updated_at: 'T' }])
  })
  for (const path of ['/tracy-badge.js', '/build-with-tracy-demo.js']) {
    const res = await saved.fetch(new Request(`https://cowork.tracy.site${path}`))
    assert.equal(res.status, 200)
    const js = await res.text()
    assert.ok(js.includes('Make it yours'), `${path} carries the saved label`)
    assert.ok(js.includes('"position":"left"'), `${path} carries the saved corner`)
    assert.ok(!js.includes('prefers-color-scheme'), `${path}: one palette, chosen by a person`)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300')
  }
  const seat = await saved.fetch(new Request('https://cowork.tracy.site/badge.js'))
  assert.equal(seat.status, 200)
  assert.match(seat.headers.get('content-type') ?? '', /javascript/)
  assert.equal(seat.headers.get('set-cookie'), null)
  // The seat pill's default is OFF (01/10/2026): its door answers, and the answer draws nothing.
  const seatJs = await seat.text()
  assert.equal(seatJs, SEAT_BADGE_OFF, 'the seat pill keeps its default, which is off')
  assert.ok(!seatJs.includes('Managed with Tracy'))
})

test('a database that is down, or absent, still serves a badge — the default one', async () => {
  for (const pool of [brokenPool, null, undefined]) {
    const routes = badgeRoutes({ config: { origin: 'https://cowork.tracy.site' }, pool })
    const res = await routes.fetch(new Request('https://cowork.tracy.site/tracy-badge.js'))
    assert.equal(res.status, 200)
    assert.ok((await res.text()).includes('Customize with Tracy'))
  }
})

test('through the real node-server, content-length follows each body — a save must not leave the old length behind', async () => {
  // Measured 19/09: one shared headers object, and node-server wrote the first response's
  // `content-length` into it; every later script — different setting, different length — went out
  // with that number, and the browser's fetch failed right after a save.
  const { serve } = await import('@hono/node-server')
  const short = { ...leftAdvert, doors: { ...leftAdvert.doors, customize: { on: true, label: 'Go' } } }
  const long = {
    ...leftAdvert,
    doors: { ...leftAdvert.doors, customize: { on: true, label: 'A much longer label here' } }
  }
  let current = short
  const pool = {
    query: async () => ({
      rows: [{ id: 'advert', setting: current, revision: 1, updated_by: 'a', updated_at: 'T' }]
    })
  }
  const app = badgeRoutes({ config: { origin: 'https://cowork.tracy.site' }, pool })
  const { server, port } = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) =>
      resolve({ server: s, port: info.port })
    )
  })
  try {
    for (const setting of [short, long, short]) {
      current = setting
      const res = await fetch(`http://127.0.0.1:${port}/tracy-badge.js`, { headers: { connection: 'close' } })
      const body = Buffer.from(await res.arrayBuffer())
      assert.equal(res.status, 200)
      assert.equal(
        Number(res.headers.get('content-length')),
        body.length,
        `label ${setting.doors.customize.label}`
      )
      assert.ok(body.toString().includes(setting.doors.customize.label))
    }
  } finally {
    await new Promise((r) => server.close(r))
  }
})

/**
 * 🔒 TRACY CAN FRAME EVERY SITE IT PROXIES, WHATEVER THE PLATFORM PUT ON THE RESPONSE.
 *
 * WordPress and Joomla sit behind Apache, which writes `frame-ancestors` into every site it
 * configures; EmDash runs Astro and sends `X-Frame-Options: SAMEORIGIN` instead. So Tracy's preview
 * showed a WordPress site and an empty pane for an EmDash site of the same age. Measured 19/09/2026 on
 * `demoemdash.tracy.test`: HTTP 200, empty pane, `x-frame-options: SAMEORIGIN` the only header
 * about framing. Nor can provisioning fix it for EVERY template — `tracy-saas/emdash-0.x`
 * hardcodes `frame-ancestors 'none'` and ignores `TRACY_FRAME_ANCESTORS` entirely (measured the same
 * day: setting that variable changed no header). This process is the only party all three pass through.
 */
test('the proxy lets Tracy frame a site that refused, and never overrides one that answered', async () => {
  const { proxySite } = await import('../src/bar/site-proxy.js')
  const ask = (upstreamHeaders) =>
    proxySite(new Request('https://site.example/'), new URL('https://origin.internal/'), {
      viewerHost: 'site.example',
      viewerProto: 'https',
      publish: 'published',
      badgeOrigin: 'https://cowork.tracy.site',
      badgeUrl: 'https://tracy.ai/dashboard/badge.js',
      variant: 'none',
      fetchImpl: () =>
        Promise.resolve(
          new Response('<!doctype html><html><body>x</body></html>', {
            headers: { 'content-type': 'text/html; charset=utf-8', ...upstreamHeaders }
          })
        )
    })

  // EmDash: an XFO that cannot name an origin, and no CSP at all.
  const emdash = await ask({ 'x-frame-options': 'SAMEORIGIN' })
  assert.equal(emdash.headers.get('x-frame-options'), null, 'XFO must go — it cannot name Tracy')
  assert.match(
    emdash.headers.get('content-security-policy') ?? '',
    /frame-ancestors 'self' https:\/\/cowork\.tracy\.site/
  )

  // WordPress/Joomla: Apache already answered, and its policy is wider on purpose. Untouched.
  const apache = "frame-ancestors 'self' https://*.tracy.ai http://localhost:*"
  const wordpress = await ask({ 'content-security-policy': apache })
  assert.equal(
    wordpress.headers.get('content-security-policy'),
    apache,
    'the site’s own answer was overwritten'
  )

  // A CSP that says other things but not this one gets the directive appended, not replaced.
  const partial = await ask({ 'content-security-policy': "default-src 'self'" })
  const got = partial.headers.get('content-security-policy') ?? ''
  assert.ok(got.startsWith("default-src 'self'"), 'the existing policy was dropped')
  assert.match(got, /frame-ancestors 'self' https:\/\/cowork\.tracy\.site/)
})

test('a HEAD and a non-HTML response carry the same framing answer', async () => {
  // ⚠ THIS IS HOW THE FIX WAS FIRST MIS-MEASURED. `curl -sI` sends HEAD, which takes the
  // pass-through branch; the first reading showed the old `x-frame-options` and looked like the
  // change had not worked at all. A header that only appears on GET is a header nobody can check.
  const { proxySite } = await import('../src/bar/site-proxy.js')
  const ask = (method, contentType) =>
    proxySite(new Request('https://site.example/', { method }), new URL('https://origin.internal/'), {
      viewerHost: 'site.example',
      viewerProto: 'https',
      publish: 'published',
      badgeOrigin: 'https://cowork.tracy.site',
      badgeUrl: 'https://tracy.ai/dashboard/badge.js',
      variant: 'none',
      fetchImpl: () =>
        Promise.resolve(
          new Response(null, { headers: { 'content-type': contentType, 'x-frame-options': 'DENY' } })
        )
    })

  for (const [method, type] of [
    ['HEAD', 'text/html'],
    ['GET', 'application/pdf']
  ]) {
    const res = await ask(method, type)
    assert.equal(res.headers.get('x-frame-options'), null, `${method} ${type} kept the refusal`)
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'self'/)
  }
})

test('with no Tracy origin to name, the proxy claims nothing', async () => {
  // ⚠ Never widen to a bare `frame-ancestors *` when the origin is missing or malformed: that is
  // "anyone may frame this site", which is the one answer this must never produce by accident.
  const { proxySite } = await import('../src/bar/site-proxy.js')
  for (const badgeOrigin of [undefined, '', 'not-a-url', 'javascript:alert(1)']) {
    const res = await proxySite(new Request('https://site.example/'), new URL('https://origin.internal/'), {
      viewerHost: 'site.example',
      viewerProto: 'https',
      publish: 'published',
      badgeOrigin,
      badgeUrl: 'https://tracy.ai/dashboard/badge.js',
      variant: 'none',
      fetchImpl: () =>
        Promise.resolve(
          new Response('<html><body>x</body></html>', {
            headers: { 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN' }
          })
        )
    })
    assert.equal(
      res.headers.get('content-security-policy'),
      null,
      `claimed a policy for ${String(badgeOrigin)}`
    )
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', 'the site’s own refusal must stand')
  }
})

test('a permanent redirect is never kept by the browser; a temporary one is left alone', async () => {
  // Measured 28/09/2026: a copy of tracy.ai had answered `/` with a 301 to tracy.ai while it still
  // carried the source site's address. Chrome kept that 301, and the Browser tab stayed broken long
  // after the site answered 200. Both branches are asked: WordPress sends its 301 as text/html.
  const { proxySite } = await import('../src/bar/site-proxy.js')
  const ask = (method, status, contentType) =>
    proxySite(new Request('https://site.example/', { method }), new URL('https://origin.internal/'), {
      viewerHost: 'site.example',
      viewerProto: 'https',
      publish: 'draft',
      badgeOrigin: 'https://cowork.tracy.site',
      badgeUrl: 'https://tracy.ai/dashboard/badge.js',
      variant: 'none',
      fetchImpl: () =>
        Promise.resolve(
          new Response(null, {
            status,
            headers: {
              'content-type': contentType,
              location: 'https://elsewhere.example/',
              'cache-control': 'max-age=31536000'
            }
          })
        )
    })

  for (const [method, status, type] of [
    ['GET', 301, 'text/html; charset=UTF-8'],
    ['GET', 308, 'text/plain'],
    ['HEAD', 301, 'text/html']
  ]) {
    const res = await ask(method, status, type)
    assert.equal(res.status, status)
    assert.equal(res.headers.get('location'), 'https://elsewhere.example/')
    assert.equal(res.headers.get('cache-control'), 'no-store', `${method} ${status} ${type} may be kept`)
  }
  for (const status of [302, 307]) {
    const res = await ask('GET', status, 'text/html')
    assert.equal(res.headers.get('cache-control'), 'max-age=31536000', `${status} was rewritten`)
  }
})
