#!/usr/bin/env node
/**
 * `loginToAdmin` (WordPress) against a local fake WordPress over real HTTP (#556).
 *
 * WHY A REAL SERVER. The bug lives in the hop sequence a real `fetch` walks: `<site>/wp-admin` 301s
 * to `/wp-admin/`, which 302s a signed-out visitor to `wp-login.php?redirect_to=…&reauth=1`.
 * POSTing the password to that URL makes WordPress sign in and then expire the auth cookies in the
 * same 200 answer. A mocked `fetch` would only replay what the test author believed; this server
 * reproduces what WordPress was measured doing on 28/09/2026, and `loginToAdmin` is the real module
 * bundled in memory with esbuild (this plugin's own devDependency).
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let wordpress

before(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/wordpress.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    packages: 'external',
    write: false
  })
  const source = Buffer.from(built.outputFiles[0].text).toString('base64')
  wordpress = await import(`data:text/javascript;base64,${source}`)
})

const realNow = Date.now
after(() => {
  Date.now = realNow
})

const USER = 'admin'
const PASSWORD = 'correct horse'
const TEST_COOKIE = 'wordpress_test_cookie=WP%20Cookie%20check; path=/'
const LOGGED_IN_NAME = 'wordpress_logged_in_abc'
const LOGGED_IN_VALUE = 'admin%7C1790000000%7Ctoken%7Chash'
const PAST = 'Thu, 01-Jan-1970 00:00:01 GMT'
const FUTURE = new Date(realNow() + 3600_000).toUTCString()
const LOGIN_PAGE = '<html><form id="loginform"><input name="log"><input name="pwd"></form></html>'
const UPLOAD_FORM =
  '<html><form><input type="hidden" name="_wpnonce" value="abc123def"><input type="file" name="pluginzip"></form></html>'

for (const at of ['login_page', 'login_post']) {
  test(`network errors on ${at} keep a closed diagnostic code without the message`, async (t) => {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => {
      if (at === 'login_post' && calls++ === 0) return new Response(LOGIN_PAGE)
      throw Object.assign(new Error('secret customer address or password'), { cause: { code: 'ETIMEDOUT' } })
    })
    const result = await wordpress.loginToAdmin('https://example.com/wp-login.php', USER, PASSWORD)
    assert.equal(result.reason, 'unreachable')
    assert.deepEqual(result.detail, { at, check: 'network', error: 'ETIMEDOUT' })
    assert.equal(JSON.stringify(result).includes('secret customer'), false)
  })
}

/** What `wp_clear_auth_cookie()` sends: a space value, a past Expires and Max-Age=0, per path. */
function clearAuthCookies(p) {
  return [
    `wordpress_abc=+; expires=${PAST}; Max-Age=0; path=${p}/wp-admin`,
    `wordpress_abc=+; expires=${PAST}; Max-Age=0; path=${p}/wp-content/plugins`,
    `${LOGGED_IN_NAME}=+; expires=${PAST}; Max-Age=0; path=${p}/`
  ]
}

/** `adminPath` is ADMIN_COOKIE_PATH, `<webroot>/wp-admin` unless a site defines its own. */
function signInCookies(p, adminPath = `${p}/wp-admin`) {
  return [
    `wordpress_abc=admin%7Cauth; expires=${FUTURE}; path=${adminPath}; HttpOnly`,
    `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; expires=${FUTURE}; path=${p}/; HttpOnly`
  ]
}

function cookiesOf(req) {
  const jar = new Map()
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }
  return jar
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * A fake WordPress. `prefix` is the install's subpath, `loginPath` its login page (relocated when not
 * `/wp-login.php`), `loginQuery` extra query the admin redirect adds, `loginRawQuery` a raw query
 * string it prepends verbatim, `movedFromRoot` a root `/wp-admin` that 301s into `prefix`. `onLogin(req, res, ctx)` may
 * override the POST answer to model a specific response; `reauthParams` how many `reauth=1` the
 * admin redirect appends. `loginPage(base)` replaces the login page's HTML, `onLoginGet(req, res)`
 * its whole answer, and `onProbe(req, res)` the install-access probe's answer. `authCookiePath`
 * overrides the auth cookie's Path (a site with its own ADMIN_COOKIE_PATH). Every request is
 * recorded with its path, query, cookie header and user agent.
 */
async function fakeWordPress(opts = {}) {
  const prefix = opts.prefix ?? ''
  const loginPath = opts.loginPath ?? `${prefix}/wp-login.php`
  const reauthParams = opts.reauthParams ?? 1
  const requests = []
  const sockets = new Set()
  let base = ''

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base)
    const cookies = cookiesOf(req)
    const body = req.method === 'POST' ? await readBody(req) : ''
    requests.push({
      method: req.method,
      path: url.pathname,
      search: url.search,
      raw: req.url,
      url: url.href,
      cookies,
      body,
      userAgent: req.headers['user-agent']
    })
    const signedIn = cookies.get(LOGGED_IN_NAME) === LOGGED_IN_VALUE

    if (opts.movedFromRoot && req.method === 'GET' && url.pathname === '/wp-admin') {
      res.writeHead(301, { location: `${base}${prefix}/wp-admin/` }).end()
      return
    }
    if (req.method === 'GET' && url.pathname === `${prefix}/wp-admin`) {
      res.writeHead(301, { location: `${base}${prefix}/wp-admin/` }).end()
      return
    }
    if (req.method === 'GET' && url.pathname === `${prefix}/wp-admin/`) {
      if (signedIn) return void res.writeHead(200).end('<html>Dashboard</html>')
      const target = new URL(loginPath, base)
      for (const [k, v] of opts.loginQuery ?? []) target.searchParams.append(k, v)
      target.searchParams.append('redirect_to', `${base}${prefix}/wp-admin/`)
      for (let i = 0; i < reauthParams; i++) target.searchParams.append('reauth', '1')
      // Raw pairs go in last and verbatim: `searchParams` would re-serialise them.
      if (opts.loginRawQuery) target.search = `?${opts.loginRawQuery}&${target.search.slice(1)}`
      res.writeHead(302, { location: target.href }).end()
      return
    }
    if (req.method === 'GET' && url.pathname === `${prefix}/wp-admin/plugin-install.php`) {
      if (opts.onProbe) return void opts.onProbe(req, res)
      if (!signedIn) {
        res.writeHead(302, { location: `${base}${loginPath}?reauth=1` }).end()
        return
      }
      res.writeHead(200).end(UPLOAD_FORM)
      return
    }
    if (url.pathname === loginPath) {
      const reauth = url.searchParams.has('reauth')
      if (req.method === 'GET') {
        if (opts.onLoginGet) return void opts.onLoginGet(req, res)
        // WordPress clears any auth cookie on a reauth page view, then seeds the test cookie.
        const setCookie = [...(reauth ? clearAuthCookies(prefix) : []), TEST_COOKIE]
        const page = opts.loginPage ? opts.loginPage(base) : LOGIN_PAGE
        res.writeHead(200, { 'set-cookie': setCookie, 'content-type': 'text/html' }).end(page)
        return
      }
      const form = new URLSearchParams(body)
      const ctx = { form, reauth, prefix, base }
      if (opts.onLogin) return void opts.onLogin(req, res, ctx)
      const good =
        form.get('log') === USER &&
        form.get('pwd') === PASSWORD &&
        form.get('testcookie') === '1' &&
        cookies.has('wordpress_test_cookie')
      if (!good) return void res.writeHead(200, { 'content-type': 'text/html' }).end(LOGIN_PAGE)
      if (reauth) {
        // Measured: signed in, then the auth cookies expired in the same 200 answer.
        res
          .writeHead(200, { 'set-cookie': [...signInCookies(prefix), ...clearAuthCookies(prefix)] })
          .end(LOGIN_PAGE)
        return
      }
      res
        .writeHead(302, {
          'set-cookie': signInCookies(prefix, opts.authCookiePath),
          location: form.get('redirect_to')
        })
        .end()
      return
    }
    res.writeHead(404).end('not found')
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    requests,
    posts: () => requests.filter((r) => r.method === 'POST'),
    probes: () => requests.filter((r) => r.path.endsWith('/wp-admin/plugin-install.php')),
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

async function withServer(opts, run) {
  const wp = await fakeWordPress(opts)
  try {
    await run(wp)
  } finally {
    await wp.close()
  }
}

test('<site>/wp-admin: 301 → 302 to reauth=1, the POST drops reauth and the install probe gets a nonce', async () => {
  await withServer({}, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
    assert.deepEqual(
      wp.requests.map((r) => `${r.method} ${r.path}`),
      [
        'GET /wp-admin',
        'GET /wp-admin/',
        'GET /wp-login.php',
        'POST /wp-login.php',
        'GET /wp-admin/plugin-install.php'
      ]
    )
    const loginGet = wp.requests[2]
    assert.equal(loginGet.search.includes('reauth=1'), true, 'the admin redirect carried reauth=1')
    assert.equal(new URL(loginGet.url).searchParams.get('redirect_to'), `${wp.base}/wp-admin/`)

    const [post] = wp.posts()
    const postUrl = new URL(post.url)
    assert.equal(postUrl.searchParams.has('reauth'), false, 'the POST never carries reauth')
    assert.equal(postUrl.pathname, '/wp-login.php')
    assert.equal(postUrl.searchParams.get('redirect_to'), `${wp.base}/wp-admin/`, 'other parameters kept')
    assert.ok(post.cookies.has('wordpress_test_cookie'), 'the POST carried the test cookie')

    assert.equal(session.ok, true)
    assert.equal(session.webRootUrl, wp.base)
    assert.equal(session.adminUrl, `${wp.base}/wp-admin`)
    const [probe] = wp.probes()
    assert.equal(probe.cookies.get(LOGGED_IN_NAME), LOGGED_IN_VALUE, 'the probe carried the live session')
  })
})

test('<site>/wp-login.php typed directly is unchanged: POST to the same URL, signed in', async () => {
  await withServer({}, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
    assert.equal(session.ok, true)
    assert.deepEqual(
      wp.posts().map((r) => r.url),
      [`${wp.base}/wp-login.php`]
    )
    assert.equal(wp.probes().length, 1)
  })
})

test('a subpath install keeps its subpath and signs in through /wp-admin', async () => {
  await withServer({ prefix: '/office' }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/office/wp-admin`, USER, PASSWORD)
    const [post] = wp.posts()
    assert.equal(new URL(post.url).pathname, '/office/wp-login.php')
    assert.equal(new URL(post.url).searchParams.has('reauth'), false)
    assert.equal(session.ok, true)
    assert.equal(session.webRootUrl, `${wp.base}/office`)
  })
})

for (const [typed, loginPath] of [
  ['/wp-admin', '/secret-door'],
  ['/wp-admin/', '/secret-door'],
  ['/wp-admin', '/secret-door/wp-login.php'],
  ['/wp-admin/', '/secret-door/wp-login.php'],
  // A login page whose own path holds a `wp-admin` segment is still the login page, not the admin.
  ['/wp-admin', '/secret-door/wp-admin/login'],
  ['/wp-admin/', '/secret-door/wp-admin/login'],
  ['/wp-admin', '/secret-door/wp-admin/'],
  ['/wp-admin', '/secret-door/wp-admin']
]) {
  test(`a relocated login page ${loginPath} reached from ${typed} keeps its path and parameters, and signs in`, async () => {
    await withServer(
      {
        loginPath,
        loginQuery: [
          ['lang', 'vi'],
          ['next', 'a=b&c']
        ],
        reauthParams: 2
      },
      async (wp) => {
        const session = await wordpress.loginToAdmin(`${wp.base}${typed}`, USER, PASSWORD)
        const loginGet = wp.requests.find((r) => r.method === 'GET' && r.path === loginPath)
        assert.deepEqual(new URL(loginGet.url).searchParams.getAll('reauth'), ['1', '1'])
        const [post] = wp.posts()
        const postUrl = new URL(post.url)
        assert.equal(postUrl.pathname, loginPath, 'posted to the login page exactly as resolved')
        assert.equal(postUrl.searchParams.has('reauth'), false)
        assert.equal(postUrl.searchParams.get('lang'), 'vi')
        assert.equal(postUrl.searchParams.get('next'), 'a=b&c')
        assert.equal(postUrl.searchParams.get('redirect_to'), `${wp.base}/wp-admin/`)
        assert.equal(post.cookies.has('wordpress_test_cookie'), true)

        // The webroot is the one the typed admin address names, not the relocated login page.
        assert.equal(session.ok, true)
        assert.equal(session.webRootUrl, wp.base)
        assert.equal(session.adminUrl, `${wp.base}/wp-admin`)
        assert.deepEqual(
          wp.probes().map((r) => r.path),
          ['/wp-admin/plugin-install.php']
        )
      }
    )
  })
}

test('an install moved under /blog: /wp-admin → /blog/wp-admin/ → /blog/wp-login.php probes /blog', async () => {
  await withServer({ prefix: '/blog', movedFromRoot: true }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
    assert.equal(new URL(wp.posts()[0].url).pathname, '/blog/wp-login.php')
    assert.equal(session.ok, true)
    assert.equal(session.webRootUrl, `${wp.base}/blog`)
    assert.deepEqual(
      wp.probes().map((r) => r.path),
      ['/blog/wp-admin/plugin-install.php']
    )
  })
})

test('a subpath install with a relocated login page keeps the subpath webroot', async () => {
  await withServer({ prefix: '/office', loginPath: '/office/secret-door' }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/office/wp-admin`, USER, PASSWORD)
    assert.equal(new URL(wp.posts()[0].url).pathname, '/office/secret-door')
    assert.equal(session.ok, true)
    assert.equal(session.webRootUrl, `${wp.base}/office`)
    assert.deepEqual(
      wp.probes().map((r) => r.path),
      ['/office/wp-admin/plugin-install.php']
    )
  })
})

test('dropping reauth keeps every other query byte verbatim', async () => {
  const raw = 'token=a%20b&sig=x%2By+z&flag&re%61uth=1'
  await withServer({ loginPath: '/secret-door', loginRawQuery: raw, reauthParams: 1 }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
    const loginGet = wp.requests.find((r) => r.method === 'GET' && r.path === '/secret-door')
    const redirectTo = encodeURIComponent(`${wp.base}/wp-admin/`)
    assert.equal(loginGet.raw, `/secret-door?${raw}&redirect_to=${redirectTo}&reauth=1`)
    const [post] = wp.posts()
    // An encoded name (`re%61uth`) is still `reauth` and goes too; nothing else is re-encoded.
    assert.equal(post.raw, `/secret-door?token=a%20b&sig=x%2By+z&flag&redirect_to=${redirectTo}`)
    assert.equal(session.ok, true)
  })
})

test('a URL without reauth is posted exactly as resolved', async () => {
  await withServer(
    { loginPath: '/secret-door', loginRawQuery: 'token=a%20b', reauthParams: 0 },
    async (wp) => {
      await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
      const loginGet = wp.requests.find((r) => r.method === 'GET' && r.path === '/secret-door')
      assert.equal(wp.posts()[0].raw, loginGet.raw)
    }
  )
})

/** A login answer that sets the logged-in cookie, then expires it in the same response. */
const EXPIRED_IN_SAME_RESPONSE = {
  'Max-Age=0': `${LOGGED_IN_NAME}=x; Max-Age=0; path=/`,
  'negative Max-Age': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; Max-Age=-1; path=/`,
  'Expires in the past': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; expires=${PAST}; path=/`,
  'value deleted': `${LOGGED_IN_NAME}=deleted; path=/`,
  'value + (a URL-encoded space)': `${LOGGED_IN_NAME}=+; path=/`,
  'value %20': `${LOGGED_IN_NAME}=%20; path=/`,
  'empty value': `${LOGGED_IN_NAME}=; path=/`,
  'a different Path': `${LOGGED_IN_NAME}=+; expires=${PAST}; Max-Age=0; path=/wp-admin`
}

for (const [label, expiring] of Object.entries(EXPIRED_IN_SAME_RESPONSE)) {
  test(`sign-in whose logged-in cookie is expired in the same response (${label}) → invalid_credential`, async () => {
    const onLogin = (_req, res, ctx) =>
      res
        .writeHead(302, {
          'set-cookie': [...signInCookies(ctx.prefix), expiring],
          location: `${ctx.base}/wp-admin/`
        })
        .end()
    await withServer({ onLogin }, async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.equal(session.ok, false)
      assert.equal(session.reason, 'invalid_credential')
      assert.equal(wp.probes().length, 0, 'the install probe never ran')
    })
  })
}

test('the measured reauth answer (sign in, then clear) is a sign-in failure, never installs_disabled', async () => {
  // POST forced onto the reauth path: signed in and cleared in one 200, exactly as measured.
  const onLogin = (_req, res, ctx) =>
    res
      .writeHead(200, { 'set-cookie': [...signInCookies(ctx.prefix), ...clearAuthCookies(ctx.prefix)] })
      .end(LOGIN_PAGE)
  await withServer({ onLogin }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
    assert.equal(session.ok, false)
    assert.notEqual(session.reason, 'installs_disabled')
    assert.equal(session.reason, 'invalid_credential')
    assert.equal(wp.probes().length, 0)
  })
})

/** Live cookies that must survive: a session cookie, a future Expires or Max-Age, `=` in the value. */
const LIVE = {
  'session cookie': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; path=/; HttpOnly`,
  'future Expires': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; expires=${FUTURE}; path=/`,
  'positive Max-Age beats a past Expires': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; expires=${PAST}; Max-Age=600; path=/`
}

for (const [label, cookie] of Object.entries(LIVE)) {
  test(`a live logged-in cookie (${label}) signs in and rides the probe`, async () => {
    const onLogin = (_req, res, ctx) =>
      res
        .writeHead(302, {
          'set-cookie': ['wordpress_sec_x=a=b=c; path=/', cookie],
          location: `${ctx.base}/wp-admin/`
        })
        .end()
    await withServer({ onLogin }, async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.equal(session.ok, true)
      const [probe] = wp.probes()
      assert.equal(probe.cookies.get(LOGGED_IN_NAME), LOGGED_IN_VALUE)
      assert.equal(probe.cookies.get('wordpress_sec_x'), 'a=b=c', 'a value containing = is kept whole')
      assert.ok(probe.cookies.has('wordpress_test_cookie'))
    })
  })
}

/** Set-Cookie shapes that are not evidence of a live session. */
const NOT_LIVE = {
  'no name=value pair': `${LOGGED_IN_NAME}; path=/`,
  'an invalid cookie name': `wordpress_logged_in_ abc=${LOGGED_IN_VALUE}; path=/`,
  'an unreadable Max-Age': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; Max-Age=soon; path=/`,
  'an unreadable Expires': `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; expires=someday; path=/`,
  'an empty header': ''
}

for (const [label, cookie] of Object.entries(NOT_LIVE)) {
  test(`a logged-in Set-Cookie with ${label} is not a sign-in`, async () => {
    const onLogin = (_req, res, ctx) =>
      res.writeHead(302, { 'set-cookie': [cookie], location: `${ctx.base}/wp-admin/` }).end()
    await withServer({ onLogin }, async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.equal(session.ok, false)
      assert.equal(session.reason, 'invalid_credential')
      assert.equal(wp.probes().length, 0)
    })
  })
}

test('a logged-in cookie that expires after it was absorbed no longer counts', async () => {
  // The login page hands out a short-lived logged-in cookie; the clock then passes its Max-Age
  // while the wrong password is posted. Only a read-time expiry check reports this as signed out.
  let offset = 0
  Date.now = () => realNow() + offset
  try {
    const server = createServer(async (req, res) => {
      if (req.method === 'GET') {
        res
          .writeHead(200, {
            'set-cookie': [TEST_COOKIE, `${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}; Max-Age=60; path=/`]
          })
          .end(LOGIN_PAGE)
        return
      }
      await readBody(req)
      offset = 120_000
      res.writeHead(200).end(LOGIN_PAGE)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const base = `http://127.0.0.1:${server.address().port}`
      const session = await wordpress.loginToAdmin(`${base}/wp-login.php`, USER, 'wrong')
      assert.equal(session.ok, false)
      assert.equal(session.reason, 'invalid_credential')
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  } finally {
    Date.now = realNow
  }
})

test('a wrong password is invalid_credential, not installs_disabled', async () => {
  await withServer({}, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, 'wrong')
    assert.equal(session.ok, false)
    assert.equal(session.reason, 'invalid_credential')
    assert.equal(wp.probes().length, 0)
  })
})

test('a login POST whose connection drops reports unreachable, never a late success', async () => {
  const onLogin = (req) => req.socket.destroy()
  await withServer({ onLogin }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
    assert.equal(session.ok, false)
    assert.equal(session.reason, 'unreachable')
    assert.equal(wp.probes().length, 0)
  })
})

test('a Basic-auth challenge on the login page keeps its own refusal', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(401, { 'www-authenticate': 'Basic realm="staging"' }).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const session = await wordpress.loginToAdmin(`${base}/wp-admin`, USER, PASSWORD)
    assert.deepEqual(session, { ok: false, reason: 'basic_auth_required' })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('two concurrent logins keep separate cookie jars', async () => {
  const OTHER_VALUE = 'editor%7C1790000000%7Cother%7Chash'
  const onLogin = (_req, res, ctx) => {
    const value = ctx.form.get('log') === USER ? LOGGED_IN_VALUE : OTHER_VALUE
    res
      .writeHead(302, {
        'set-cookie': [`${LOGGED_IN_NAME}=${value}; path=/`],
        location: `${ctx.base}/wp-admin/`
      })
      .end()
  }
  await withServer({ onLogin }, async (wp) => {
    const [first, second] = await Promise.all([
      wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD),
      wordpress.loginToAdmin(`${wp.base}/wp-login.php`, 'editor', PASSWORD)
    ])
    assert.equal(first.ok, true)
    // The fake's probe only accepts the admin value, so the editor's session is refused there.
    assert.equal(second.ok, false)
    assert.match(first.cookie, new RegExp(`${LOGGED_IN_NAME}=${LOGGED_IN_VALUE}`))
    assert.doesNotMatch(first.cookie, /editor/)
    const probed = wp
      .probes()
      .map((probe) => probe.cookies.get(LOGGED_IN_NAME))
      .sort()
    assert.deepEqual(probed, [LOGGED_IN_VALUE, OTHER_VALUE].sort(), 'each probe carried only its own session')
  })
})

// ── Gates in front of the sign-in (#import-wordpress-gates) ──────────────────────────────────────
//
// Each answer below is the page the real gate drew, cut to the markers the code reads: Two Factor
// and Limit Login Attempts Reloaded were measured on WordPress 7.1 (2026-10-19); the others follow
// each product's own markup.

/** The login form a site draws again after the POST, with `extra` inside it. */
const loginPageWith = (extra) =>
  `<html><div id="login">${extra}<form id="loginform"><input name="log"><input name="pwd"></form></div></html>`

for (const [name, posted, reason] of [
  [
    'Two Factor / WP 2FA',
    '<form name="validate_2fa_form" action="/wp-login.php?action=validate_2fa" method="post"><input type="hidden" name="wp-auth-id" value="1"><input type="hidden" name="wp-auth-nonce" value="n"></form>',
    'mfa_required'
  ],
  [
    'Wordfence Login Security',
    loginPageWith('<input type="text" name="wfls-token" id="wfls-token">'),
    'mfa_required'
  ],
  [
    'Limit Login Attempts Reloaded',
    loginPageWith(
      '<div id="login_error"><strong>ERROR</strong>: Too many failed login attempts. Please try again in 18 minutes.</div>'
    ),
    'login_locked_out'
  ],
  [
    'Wordfence lockout',
    loginPageWith('<div id="login_error">You have been locked out due to too many attempts.</div>'),
    'login_locked_out'
  ]
]) {
  test(`a correct password answered by ${name} is ${reason}, not invalid_credential`, async () => {
    await withServer(
      { onLogin: (_req, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end(posted) },
      async (wp) => {
        const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
        assert.deepEqual(session, { ok: false, reason })
        assert.equal(wp.probes().length, 0, 'no install probe without a session')
      }
    )
  })
}

/** WordPress's own wrong-password error, as `wp_authenticate_username_password` words it. */
const WRONG_PASSWORD = `<div id="login_error"><strong>Error:</strong> The password you entered for the username <strong>${USER}</strong> is incorrect. <a href="/wp-login.php?action=lostpassword">Lost your password?</a></div>`

for (const [name, widget, error] of [
  [
    'Cloudflare Turnstile',
    '<div class="cf-turnstile" data-sitekey="x"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>',
    '<div id="login_error"><strong>Error</strong>: Please verify that you are human.</div>'
  ],
  [
    'reCAPTCHA',
    '<div class="g-recaptcha" data-sitekey="x"></div>',
    '<div id="login_error"><strong>ERROR</strong>: Please solve the reCAPTCHA correctly.</div>'
  ],
  [
    'hCaptcha',
    '<div class="h-captcha" data-sitekey="x"></div>',
    '<div id="login_error"><strong>Error</strong>: Please complete the hCaptcha.</div>'
  ]
]) {
  test(`a ${name} error in the answer to the POST is captcha_required`, async () => {
    await withServer(
      {
        loginPage: () => loginPageWith(widget),
        onLogin: (_req, res) =>
          void res.writeHead(200, { 'content-type': 'text/html' }).end(loginPageWith(error + widget))
      },
      async (wp) => {
        const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
        assert.deepEqual(session, { ok: false, reason: 'captcha_required' })
      }
    )
  })

  test(`a wrong password on a login page that loads ${name} is invalid_credential`, async () => {
    await withServer(
      {
        loginPage: () => loginPageWith(widget),
        onLogin: (_req, res) =>
          void res.writeHead(200, { 'content-type': 'text/html' }).end(loginPageWith(WRONG_PASSWORD + widget))
      },
      async (wp) => {
        const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, 'wrong')
        assert.deepEqual(session, { ok: false, reason: 'invalid_credential' })
      }
    )
  })
}

test('a captcha widget that only loads, with no error naming it, is an unread refusal', async () => {
  const widget = '<script src="https://www.google.com/recaptcha/api.js"></script>'
  await withServer(
    {
      loginPage: () => loginPageWith(widget),
      onLogin: (_req, res) => void res.writeHead(200).end(loginPageWith(widget))
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, 'wrong')
      assert.deepEqual(session, {
        ok: false,
        reason: 'invalid_credential',
        detail: { at: 'login_post', check: 'message_unread' }
      })
    }
  )
})

test('a login page with a captcha that still signs in is a session, not a refusal', async () => {
  await withServer({ loginPage: () => loginPageWith('<div class="g-recaptcha"></div>') }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
    assert.equal(session.ok, true)
  })
})

test('a ModSecurity 406 on the login page is blocked_by_firewall naming it, not unreachable', async () => {
  await withServer(
    {
      onLoginGet: (_req, res) =>
        void res
          .writeHead(406, { 'content-type': 'text/html' })
          .end(
            '<html><head><title>Not Acceptable!</title></head><body>This error was generated by Mod_Security.</body></html>'
          )
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.deepEqual(session, { ok: false, reason: 'blocked_by_firewall', firewall: 'modsecurity' })
    }
  )
})

test('a Cloudflare challenge (cf-mitigated) on the login page is blocked_by_firewall', async () => {
  await withServer(
    {
      onLoginGet: (_req, res) =>
        void res
          .writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge', server: 'cloudflare' })
          .end('<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>')
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.deepEqual(session, { ok: false, reason: 'blocked_by_firewall', firewall: 'cloudflare' })
    }
  )
})

test("a bare 403 on WordPress's own capability check stays no_backend_access", async () => {
  await withServer(
    {
      onProbe: (_req, res) =>
        void res
          .writeHead(403, { 'content-type': 'text/html' })
          .end(
            '<html><body id="error-page">Sorry, you are not allowed to install plugins on this site.</body></html>'
          )
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.deepEqual(session, { ok: false, reason: 'no_backend_access' })
    }
  )
})

test("WordPress's own 403 on the install probe of a site behind Cloudflare stays no_backend_access", async () => {
  await withServer(
    {
      onProbe: (_req, res) =>
        void res
          .writeHead(403, { 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': '8f-SIN' })
          .end(
            '<html><body id="error-page">Sorry, you are not allowed to install plugins on this site.</body></html>'
          )
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.deepEqual(session, { ok: false, reason: 'no_backend_access' })
    }
  )
})

test('a Wordfence block page on the install probe is blocked_by_firewall', async () => {
  await withServer(
    {
      onProbe: (_req, res) =>
        void res
          .writeHead(403, { 'content-type': 'text/html' })
          .end(
            '<html><body>Your access to this site has been limited by the site owner. Generated by Wordfence at …</body></html>'
          )
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, PASSWORD)
      assert.deepEqual(session, { ok: false, reason: 'blocked_by_firewall', firewall: 'wordfence' })
    }
  )
})

test('every request of the sign-in carries the Tracy user agent', async () => {
  await withServer({}, async (wp) => {
    await wordpress.loginToAdmin(`${wp.base}/wp-admin`, USER, PASSWORD)
    assert.ok(wp.requests.length >= 4)
    for (const r of wp.requests) assert.match(r.userAgent ?? '', /^Tracy\//, `${r.method} ${r.path}`)
  })
})

/** WPS Hide Login: the login page lives at a slug, and its stylesheet links name the webroot. */
const hiddenLoginPage = (root) => (base) =>
  `<html><head><link rel='stylesheet' href='${base}${root}/wp-admin/load-styles.php?c=0&amp;dir=ltr&amp;load%5Bchunk_0%5D=dashicons,buttons,forms,l10n,login&amp;ver=7.1.3' media='all' /></head><body>${LOGIN_PAGE}</body></html>`

test('a login page at a custom slug (WPS Hide Login) takes the webroot from its stylesheets', async () => {
  await withServer({ loginPath: '/secret-door', loginPage: hiddenLoginPage('') }, async (wp) => {
    const session = await wordpress.loginToAdmin(`${wp.base}/secret-door`, USER, PASSWORD)
    assert.equal(session.ok, true)
    assert.equal(session.webRootUrl, wp.base, 'not the slug')
    assert.equal(session.adminUrl, `${wp.base}/wp-admin`)
    assert.deepEqual(
      wp.probes().map((r) => r.path),
      ['/wp-admin/plugin-install.php']
    )
  })
})

test('a slug login page of a subpath install keeps the subpath webroot', async () => {
  await withServer(
    { prefix: '/office', loginPath: '/office/secret-door', loginPage: hiddenLoginPage('/office') },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/office/secret-door`, USER, PASSWORD)
      assert.equal(session.ok, true)
      assert.equal(session.webRootUrl, `${wp.base}/office`)
    }
  )
})

/** A login page linking `roots` in order, each as `<root>/wp-includes/…` (absolute when given a host). */
const pageLinking =
  (...roots) =>
  (base) =>
    `<html><head>${roots
      .map(
        (root) =>
          `<script src='${root.startsWith('http') ? root : base + root}/wp-includes/js/jquery/jquery.min.js'></script>`
      )
      .join('')}</head><body>${LOGIN_PAGE}</body></html>`

test('the auth cookie Path names the webroot over a stylesheet of another folder', async () => {
  await withServer(
    { prefix: '/blog', loginPath: '/blog/secret-door', loginPage: pageLinking('/other') },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/blog/secret-door`, USER, PASSWORD)
      assert.equal(session.ok, true)
      assert.equal(session.webRootUrl, `${wp.base}/blog`)
      assert.deepEqual(
        wp.probes().map((r) => r.path),
        ['/blog/wp-admin/plugin-install.php']
      )
    }
  )
})

test('without a cookie naming it, an asset under the login path beats one of another folder', async () => {
  await withServer(
    {
      prefix: '/blog',
      loginPath: '/blog/secret-door',
      loginPage: pageLinking('/other', '/blog'),
      authCookiePath: '/'
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/blog/secret-door`, USER, PASSWORD)
      assert.equal(session.ok, true)
      assert.equal(session.webRootUrl, `${wp.base}/blog`)
    }
  )
})

test('a slug login page whose assets are all on a CDN takes the origin, never the slug', async () => {
  await withServer(
    { loginPath: '/secret-door', loginPage: pageLinking('https://cdn.example'), authCookiePath: '/' },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/secret-door`, USER, PASSWORD)
      assert.equal(session.ok, true)
      assert.equal(session.webRootUrl, wp.base, 'not the slug')
      assert.equal(
        wp.requests.some((r) => r.path.startsWith('/secret-door/wp-admin')),
        false,
        'nothing asked under the slug'
      )
    }
  )
})

test('a subfolder install with a slug login page and every asset on a CDN finds the subfolder', async () => {
  await withServer(
    {
      prefix: '/blog',
      loginPath: '/blog/secret-door',
      loginPage: pageLinking('https://cdn.example'),
      authCookiePath: '/'
    },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/blog/secret-door`, USER, PASSWORD)
      assert.equal(session.ok, true)
      assert.equal(session.webRootUrl, `${wp.base}/blog`)
      assert.equal(
        wp.requests.some((r) => r.path.startsWith('/blog/secret-door/wp-admin')),
        false,
        'nothing asked under the slug'
      )
    }
  )
})

test('a guessed webroot with no wp-admin behind it is dropped for the next candidate', async () => {
  await withServer(
    { loginPath: '/secret-door', loginPage: pageLinking('/old'), authCookiePath: '/' },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/secret-door`, USER, PASSWORD)
      assert.equal(session.ok, true)
      assert.equal(session.webRootUrl, wp.base)
      assert.deepEqual(
        wp.probes().map((r) => r.path),
        ['/old/wp-admin/plugin-install.php', '/wp-admin/plugin-install.php']
      )
    }
  )
})

test('webRootCandidates: the login form, assets under the login path, others, parent folders, the origin', () => {
  const page = 'https://shop.example/blog/secret-door'
  const cdn = `<link href="https://cdn.example/wp-includes/css/x.css">`
  // Assets all on a CDN: the slug's parent folders, deepest first, never the slug itself.
  assert.deepEqual(wordpress.webRootCandidates(cdn, page), [
    'https://shop.example/blog',
    'https://shop.example'
  ])
  assert.deepEqual(wordpress.webRootCandidates(LOGIN_PAGE, page), [
    'https://shop.example/blog',
    'https://shop.example'
  ])
  assert.deepEqual(wordpress.webRootCandidates(cdn, 'https://shop.example/a/b/secret-door/'), [
    'https://shop.example/a/b',
    'https://shop.example/a',
    'https://shop.example'
  ])
  assert.deepEqual(wordpress.webRootCandidates(cdn, 'https://shop.example/secret-door'), [
    'https://shop.example'
  ])
  assert.deepEqual(
    wordpress.webRootCandidates(
      `<script src="/other/wp-includes/a.js"></script><script src="/blog/wp-includes/a.js"></script>`,
      page
    ),
    ['https://shop.example/blog', 'https://shop.example/other', 'https://shop.example']
  )
  // WordPress's own login form posts to `<webroot>/wp-login.php`; that names the root first.
  assert.deepEqual(
    wordpress.webRootCandidates(
      `<form name="loginform" id="loginform" action="https://shop.example/wp/wp-login.php" method="post">`,
      page
    ),
    ['https://shop.example/wp', 'https://shop.example/blog', 'https://shop.example']
  )
  // A login page typed at its standard address names its folder.
  assert.deepEqual(wordpress.webRootCandidates(LOGIN_PAGE, 'https://shop.example/office/wp-login.php'), [
    'https://shop.example/office',
    'https://shop.example'
  ])
})

test('loginRefusalOf: second factor, lockout, an explicit wrong password, then a captcha error', () => {
  const mfa = '<input name="wp-auth-id">'
  const lock = 'Too many failed login attempts.'
  const widget = '<div class="g-recaptcha"></div>'
  const captchaError = '<div id="login_error">Please complete the CAPTCHA.</div>'
  assert.equal(wordpress.loginRefusalOf(widget, mfa + lock), 'mfa_required')
  assert.equal(wordpress.loginRefusalOf(widget, lock), 'login_locked_out')
  assert.equal(wordpress.loginRefusalOf(widget, widget + captchaError), 'captcha_required')
  assert.equal(wordpress.loginRefusalOf(widget, WRONG_PASSWORD + captchaError), 'invalid_credential')
  // A widget on either page, with no error naming the captcha, says nothing about it — nor about
  // the password: no error WordPress is known to draw for one, so the refusal is not read.
  assert.equal(wordpress.loginRefusalOf(widget, widget + LOGIN_PAGE), 'message_unread')
  // The word "captcha" outside the error block (a script URL, a plugin's markup) is not an error.
  assert.equal(
    wordpress.loginRefusalOf(widget, `<script src="/captcha.js"></script>${WRONG_PASSWORD}`),
    'invalid_credential'
  )
  assert.equal(wordpress.loginRefusalOf(LOGIN_PAGE, LOGIN_PAGE), 'message_unread')
})

test('loginRefusalOf: a translated core error is not read, whatever link it carries', () => {
  const error = (html) => `<div id="login_error" class="notice notice-error">${html}</div>`
  const coreLink = '<a href="https://shop.example/wp-login.php?action=lostpassword">Passwort vergessen?</a>'
  // incorrect_password in German, with core's link: the link also rides on a translated lockout or
  // security check, so it proves nothing and the refusal is not read.
  const deIncorrect = `<strong>Fehler:</strong> Das Passwort für den Benutzernamen <strong>${USER}</strong> ist nicht korrekt. ${coreLink}`
  assert.equal(wordpress.loginRefusalOf(LOGIN_PAGE, error(`<p>${deIncorrect}</p>`)), 'message_unread')
  assert.equal(wordpress.loginRefusalOf(LOGIN_PAGE, error(`\t${deIncorrect}<br />\n`)), 'message_unread')
  assert.equal(
    wordpress.loginRefusalOf(
      LOGIN_PAGE,
      error(`<p>Falsch. <a href="/wp-login.php?action=lostpassword&redirect_to=%2Fwp-admin%2F">?</a></p>`)
    ),
    'message_unread'
  )
  // A captcha widget beside a translated refusal does not make it a captcha refusal either.
  assert.equal(
    wordpress.loginRefusalOf(
      LOGIN_PAGE,
      `<div class="cf-turnstile"></div>${error(`<p>Bitte bestätigen Sie die Prüfung. ${coreLink}</p>`)}`
    ),
    'message_unread'
  )
  // A captcha refusal linking to a lost-password page is the captcha.
  assert.equal(
    wordpress.loginRefusalOf(
      LOGIN_PAGE,
      error(
        '<p>Bitte lösen Sie das CAPTCHA. <a href="https://shop.example/my-account/lost-password/">Passwort vergessen?</a></p>'
      )
    ),
    'captcha_required'
  )
  // A translated wrong password with WooCommerce's link: not read either.
  assert.equal(
    wordpress.loginRefusalOf(
      LOGIN_PAGE,
      error(
        '<p>Mot de passe incorrect. <a href="https://shop.example/my-account/lost-password/">Mot de passe oublié ?</a></p>'
      )
    ),
    'message_unread'
  )
  // A translated lockout that names the account is not a wrong password.
  assert.equal(
    wordpress.loginRefusalOf(
      LOGIN_PAGE,
      error('<p>Das Konto <strong>alice</strong> ist für 20 Minuten gesperrt.</p>')
    ),
    'message_unread'
  )
  // invalid_username since 5.6 echoes the username, as a lockout may: not proof either.
  assert.equal(
    wordpress.loginRefusalOf(
      LOGIN_PAGE,
      error(
        `<p><strong>Fehler:</strong> Der Benutzername <strong>${USER}</strong> ist nicht registriert.</p>`
      )
    ),
    'message_unread'
  )
  // A translated error with no signal (invalid_email since 5.3, a plugin's own) is not read.
  assert.equal(
    wordpress.loginRefusalOf(LOGIN_PAGE, error('<p>Unbekannte E-Mail-Adresse.</p>')),
    'message_unread'
  )
})

test('loginRefusalOf: a translated lockout whose only link is core lost-password link is not read', () => {
  const lockout =
    '<div id="login_error"><p>Ihr Konto wurde nach zu vielen Versuchen vorübergehend gesperrt. <a href="https://shop.example/wp-login.php?action=lostpassword">Passwort vergessen?</a></p></div>'
  assert.equal(wordpress.loginRefusalOf(LOGIN_PAGE, lockout), 'message_unread')
})

test('a refusal Tracy cannot read keeps invalid_credential and says the message was not read', async () => {
  await withServer(
    { onLogin: (_req, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end(LOGIN_PAGE) },
    async (wp) => {
      const session = await wordpress.loginToAdmin(`${wp.base}/wp-login.php`, USER, 'wrong')
      assert.deepEqual(session, {
        ok: false,
        reason: 'invalid_credential',
        detail: { at: 'login_post', check: 'message_unread' }
      })
    }
  )
})
