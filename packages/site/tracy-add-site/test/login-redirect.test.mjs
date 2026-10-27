#!/usr/bin/env node
/**
 * `loginToAdmin` driven end to end against a mocked `fetch` (#172).
 *
 * WHY BUNDLE. `joomla.ts` is TypeScript that imports `url-policy.mjs`; the redirect handling only
 * means anything as the whole flow — GET login page, POST credentials, follow the landing — so a
 * test of a helper in isolation would miss the case that matters: a post-login `Location` to another
 * host that resets the trust boundary and forwards the session cookie and Basic auth to that host.
 * So this bundles the real module with esbuild (this plugin's own devDependency) and exercises it
 * with `globalThis.fetch` replaced by a table-driven mock that records every request.
 *
 * The mock's Response carries a `.url` of the address fetched, the same as a real `redirect: 'manual'`
 * fetch, so the code derives the webroot from the resolved address exactly as it would in production.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let joomla
let wordpress
const realFetch = globalThis.fetch

/**
 * Bundle one host module's TypeScript to ESM and import it from memory, same reasoning as the
 * header. A `data:` URL leaves no temporary file behind.
 */
async function bundle(entry) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    packages: 'external',
    write: false
  })
  const source = Buffer.from(built.outputFiles[0].text).toString('base64')
  return import(`data:text/javascript;base64,${source}`)
}

before(async () => {
  joomla = await bundle('src/host/joomla.ts')
  wordpress = await bundle('src/host/wordpress.ts')
})

after(() => {
  globalThis.fetch = realFetch
})

/**
 * A fetch mocked from a table keyed by `"<METHOD> <url>"`. Every call is recorded with the host it
 * reached and whether it carried a cookie or a Basic `Authorization` header, so a test can assert
 * that no credential — and no request at all — ever reached an untrusted host.
 */
function mockFetch(routes) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const headers = init.headers ?? {}
    calls.push({
      url,
      host: new URL(url).host,
      scheme: new URL(url).protocol,
      method,
      hasCookie: 'cookie' in headers && Boolean(headers.cookie),
      hasAuth: 'authorization' in headers && Boolean(headers.authorization)
    })
    const route = routes[`${method} ${url}`]
    if (!route) throw new TypeError(`fetch failed: no route for ${method} ${url}`)
    if (route.throw) throw new TypeError('fetch failed')
    const h = new Headers()
    if (route.location) h.set('location', route.location)
    for (const cookie of route.setCookie ?? []) h.append('set-cookie', cookie)
    const isRedirect = route.status >= 300 && route.status < 400
    const response = new Response(isRedirect ? '' : (route.body ?? ''), {
      status: route.status ?? 200,
      headers: h
    })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }
  return calls
}

const CSRF = '0123456789abcdef0123456789abcdef'
const LOGIN_PAGE = `<html><form><input type="hidden" name="${CSRF}" value="1"></form></html>`
const DASHBOARD = `<html><a href="index.php?option=com_login&task=logout">Log out</a></html>`
const SESSION_COOKIE = 'joomla_session=abc123; Path=/; HttpOnly'

test('initial same-host downgrade: the flow stays https and derives an https webroot', async () => {
  const calls = mockFetch({
    'GET https://example.test/administrator': { status: 301, location: 'http://example.test/administrator/' },
    'GET https://example.test/administrator/': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/administrator/index.php': {
      status: 303,
      location: 'https://example.test/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    'GET https://example.test/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('https://example.test/administrator', 'admin', 'pw')
  assert.equal(session.ok, true)
  assert.equal(session.webRootUrl, 'https://example.test')
  // Nothing was ever fetched over http.
  assert.ok(
    calls.every((c) => c.scheme === 'https:'),
    'no http request'
  )
})

test('post-login same-host downgrade is not followed down to http', async () => {
  mockFetch({
    'GET https://example.test/administrator': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/administrator/index.php': {
      status: 303,
      location: 'http://example.test/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    'GET https://example.test/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('https://example.test/administrator', 'admin', 'pw')
  assert.equal(session.ok, true)
  assert.equal(session.webRootUrl, 'https://example.test')
})

test('non-root installation keeps its subpath in the webroot', async () => {
  mockFetch({
    'GET https://example.test/office/administrator': {
      status: 301,
      location: 'http://example.test/office/administrator/'
    },
    'GET https://example.test/office/administrator/': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/office/administrator/index.php': {
      status: 303,
      location: 'https://example.test/office/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    'GET https://example.test/office/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('https://example.test/office/administrator', 'admin', 'pw')
  assert.equal(session.ok, true)
  assert.equal(session.webRootUrl, 'https://example.test/office')
})

test('an ordinary http→https upgrade is followed and yields an https webroot', async () => {
  mockFetch({
    'GET http://example.test/administrator': { status: 301, location: 'https://example.test/administrator' },
    'GET https://example.test/administrator': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/administrator/index.php': {
      status: 303,
      location: 'https://example.test/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    'GET https://example.test/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('http://example.test/administrator', 'admin', 'pw')
  assert.equal(session.ok, true)
  assert.equal(session.webRootUrl, 'https://example.test')
})

test('a genuine all-http local site still logs in over http', async () => {
  const calls = mockFetch({
    'GET http://localhost:8080/administrator': { status: 200, body: LOGIN_PAGE },
    'POST http://localhost:8080/administrator/index.php': {
      status: 303,
      location: 'http://localhost:8080/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    'GET http://localhost:8080/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('http://localhost:8080/administrator', 'admin', 'pw', {
    username: 'basic',
    password: 'secret'
  })
  assert.equal(session.ok, true)
  assert.equal(session.webRootUrl, 'http://localhost:8080')
  // Basic auth rode the all-http flow (it never had https to lose).
  assert.ok(
    calls.some((c) => c.hasAuth),
    'basic auth was sent to the local host'
  )
})

test('an https failure does not fall back to http; it reports unreachable', async () => {
  mockFetch({
    'GET https://example.test/administrator': { throw: true }
  })
  const session = await joomla.loginToAdmin('https://example.test/administrator', 'admin', 'pw')
  assert.equal(session.ok, false)
  assert.equal(session.reason, 'unreachable')
})

test('a redirect loop stops rather than looping forever', async () => {
  mockFetch({
    'GET https://example.test/administrator': {
      status: 301,
      location: 'https://example.test/administrator?a=1'
    },
    'GET https://example.test/administrator?a=1': {
      status: 301,
      location: 'https://example.test/administrator?a=2'
    },
    'GET https://example.test/administrator?a=2': {
      status: 301,
      location: 'https://example.test/administrator?a=3'
    },
    'GET https://example.test/administrator?a=3': {
      status: 301,
      location: 'https://example.test/administrator?a=4'
    },
    'GET https://example.test/administrator?a=4': {
      status: 301,
      location: 'https://example.test/administrator?a=5'
    },
    'GET https://example.test/administrator?a=5': {
      status: 301,
      location: 'https://example.test/administrator?a=6'
    }
  })
  const session = await joomla.loginToAdmin('https://example.test/administrator', 'admin', 'pw', {
    username: 'basic',
    password: 'secret'
  })
  assert.equal(session.ok, false)
  assert.equal(session.reason, 'unreachable')
})

test('a post-login cross-host Location never receives the cookie or Basic auth', async () => {
  // After a valid https login on example.test, the POST 303s to untrusted.test. Passing that as a
  // new startUrl would send the session cookie and Basic auth there, so the untrusted host must
  // NEVER be fetched at all.
  const calls = mockFetch({
    'GET https://example.test/administrator': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/administrator/index.php': {
      status: 303,
      location: 'https://untrusted.test/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    // Present in the table but must never be reached:
    'GET https://untrusted.test/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('https://example.test/administrator', 'admin', 'pw', {
    username: 'basic',
    password: 'secret'
  })
  assert.equal(session.ok, false)
  assert.equal(session.reason, 'unreachable')

  const untrusted = calls.filter((c) => c.host === 'untrusted.test')
  assert.equal(untrusted.length, 0, 'no request was made to the untrusted host')
  // And, defensively: no request anywhere carried a credential to a non-example host.
  for (const call of calls) {
    if (call.host !== 'example.test') {
      assert.equal(call.hasCookie, false, `no cookie to ${call.host}`)
      assert.equal(call.hasAuth, false, `no auth to ${call.host}`)
    }
  }
})

test('an http admin that upgrades to https keeps the https floor across the login POST', async () => {
  // The GET upgrades http→https, the login POSTs over https, then the 303 lands on http at the
  // trusted www alias. The flow reached https, so the http landing must be refused before the
  // session cookie or Basic auth is sent, even though the original anchor is http.
  const calls = mockFetch({
    'GET http://example.test/administrator': { status: 301, location: 'https://example.test/administrator' },
    'GET https://example.test/administrator': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/administrator/index.php': {
      status: 303,
      location: 'http://www.example.test/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    // Present in the table but must never be reached over http:
    'GET http://www.example.test/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('http://example.test/administrator', 'admin', 'pw', {
    username: 'basic',
    password: 'secret'
  })
  assert.equal(session.ok, false)
  assert.equal(session.reason, 'unreachable')
  // No request reached the http www landing at all — no cookie, no Basic auth rode down to it. (The
  // one initial http request is to the anchor the operator typed; the floor rises once it upgrades.)
  const httpWww = calls.filter((c) => c.host === 'www.example.test')
  assert.equal(httpWww.length, 0, 'the http www landing was never fetched')
  for (const call of calls) {
    if (call.host !== 'example.test') {
      assert.equal(call.hasCookie, false, `no cookie to ${call.host}`)
      assert.equal(call.hasAuth, false, `no auth to ${call.host}`)
    }
  }
})

test('a post-login apex→www landing is still followed, with credentials', async () => {
  const calls = mockFetch({
    'GET https://example.test/administrator': { status: 200, body: LOGIN_PAGE },
    'POST https://example.test/administrator/index.php': {
      status: 303,
      location: 'https://www.example.test/administrator/index.php',
      setCookie: [SESSION_COOKIE]
    },
    'GET https://www.example.test/administrator/index.php': { status: 200, body: DASHBOARD }
  })
  const session = await joomla.loginToAdmin('https://example.test/administrator', 'admin', 'pw')
  assert.equal(session.ok, true)
  // The apex/www landing did receive the session cookie — it is the trusted variant.
  const landing = calls.find((c) => c.host === 'www.example.test')
  assert.ok(landing?.hasCookie, 'the trusted www landing carried the session cookie')
})

// WordPress fixtures. The GET login page seeds `wordpress_test_cookie`; a successful POST adds a
// `wordpress_logged_in_*` cookie (both are needed for a live session), and the post-login install
// probe (`plugin-install.php?tab=upload`) reads `_wpnonce` to confirm real install access.
const WP_TEST_COOKIE = 'wordpress_test_cookie=WP+Cookie+check; Path=/'
const WP_LOGGED_IN_COOKIE = 'wordpress_logged_in_abc=user%7C123; Path=/; HttpOnly'
const WP_LOGIN_PAGE = '<html><form id="loginform"><input name="log"><input name="pwd"></form></html>'
const WP_UPLOAD_FORM =
  '<html><form><input name="_wpnonce" value="abc123def"><input type="file" name="pluginzip"></form></html>'

test('wp: an https same-host downgrade stays https through the login and admin probe', async () => {
  // The admin probe 301s https→http on the same host (to a distinct canonical URL); url-policy
  // rewrites the scheme back to https, so the whole flow — login GET, credential POST, plugin-install
  // probe — stays https end to end and the rewritten https probe serves the upload form.
  const calls = mockFetch({
    'GET https://example.test/wp-login.php': {
      status: 200,
      body: WP_LOGIN_PAGE,
      setCookie: [WP_TEST_COOKIE]
    },
    'POST https://example.test/wp-login.php': {
      status: 303,
      location: 'https://example.test/wp-admin/',
      setCookie: [WP_LOGGED_IN_COOKIE]
    },
    'GET https://example.test/wp-admin/plugin-install.php?tab=upload': {
      status: 301,
      location: 'http://example.test/wp-admin/plugin-install.php?tab=upload&r=1'
    },
    'GET https://example.test/wp-admin/plugin-install.php?tab=upload&r=1': {
      status: 200,
      body: WP_UPLOAD_FORM
    }
  })
  const session = await wordpress.loginToAdmin('https://example.test/wp-login.php', 'admin', 'pw')
  assert.equal(session.ok, true)
  assert.equal(session.webRootUrl, 'https://example.test')
  assert.ok(
    calls.every((c) => c.scheme === 'https:'),
    'no http request was ever made'
  )
  // The rewritten https probe carried the session cookie — it is the same trusted origin.
  const probe = calls.find((c) => c.url === 'https://example.test/wp-admin/plugin-install.php?tab=upload&r=1')
  assert.ok(probe?.hasCookie, 'the rewritten https probe carried the session cookie')
})

test('wp: a cross-host initial redirect refuses before any credential is sent', async () => {
  // The login GET 301s to another host. url-policy passes the cross-host Location through, but the
  // next hop is not a trusted target, so followRedirects throws before the password POST — the
  // stranger host is never fetched and no cookie or Basic auth leaves the anchor origin.
  const calls = mockFetch({
    'GET https://example.test/wp-login.php': { status: 301, location: 'https://evil.test/wp-login.php' },
    // Present in the table but must never be reached:
    'GET https://evil.test/wp-login.php': { status: 200, body: WP_LOGIN_PAGE }
  })
  const session = await wordpress.loginToAdmin('https://example.test/wp-login.php', 'admin', 'pw', {
    username: 'basic',
    password: 'secret'
  })
  assert.equal(session.ok, false)
  assert.equal(session.reason, 'unreachable')
  assert.equal(
    calls.filter((c) => c.host === 'evil.test').length,
    0,
    'the cross-host target was never fetched'
  )
  // No POST happened at all — credentials were never sent.
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'the password was never posted')
})

test('wp: the post-login admin probe refuses an http www downgrade after https', async () => {
  // Login succeeds over https, then the install probe 301s https→http at the www alias. A different
  // host cannot be rewritten back up, and the https floor forbids the http landing, so the probe is
  // refused before the session cookie or Basic auth rides down to it.
  const calls = mockFetch({
    'GET https://example.test/wp-login.php': {
      status: 200,
      body: WP_LOGIN_PAGE,
      setCookie: [WP_TEST_COOKIE]
    },
    'POST https://example.test/wp-login.php': {
      status: 303,
      location: 'https://example.test/wp-admin/',
      setCookie: [WP_LOGGED_IN_COOKIE]
    },
    'GET https://example.test/wp-admin/plugin-install.php?tab=upload': {
      status: 301,
      location: 'http://www.example.test/wp-admin/plugin-install.php?tab=upload'
    },
    // Present in the table but must never be reached over http:
    'GET http://www.example.test/wp-admin/plugin-install.php?tab=upload': {
      status: 200,
      body: WP_UPLOAD_FORM
    }
  })
  const session = await wordpress.loginToAdmin('https://example.test/wp-login.php', 'admin', 'pw', {
    username: 'basic',
    password: 'secret'
  })
  assert.equal(session.ok, false)
  assert.equal(session.reason, 'unreachable')
  const httpWww = calls.filter((c) => c.host === 'www.example.test')
  assert.equal(httpWww.length, 0, 'the http www probe was never fetched')
  for (const call of calls) {
    if (call.host !== 'example.test') {
      assert.equal(call.hasCookie, false, `no cookie to ${call.host}`)
      assert.equal(call.hasAuth, false, `no auth to ${call.host}`)
    }
  }
})
