#!/usr/bin/env node
/**
 * The Joomla import says WHY it stopped, and gets through what it can.
 *
 * Five ways customer imports failed with the wrong reason or a generic one:
 *   1. An extra gate on /administrator (RSFirewall's "Protected Area", Admin Tools' secret word)
 *      read as `unreachable`, and the secret word was dropped from the login POST.
 *   2. A host that cannot reach GitHub hung the site-side install, and the upload road never ran
 *      (and could not have: the package is ~59 MB, the cap was 8 MB).
 *   3. HTTP Basic on /administrator was never sent to the API doors, and "no door answered" read
 *      as `call_failed`.
 *   4. A PHP too old for the engine (Joomla 3.10 on PHP 7.x) read as `install_failed`.
 *   5. A broken certificate on https read as `unreachable`.
 *   6. An account that may not install extensions (Joomla 6.2 Administrator or Manager: Joomla's own
 *      403 on the installer) read as `unreachable` two seconds in; and every other stop said nothing
 *      about where it happened.
 *
 * Same harness as `install-language.test.mjs`: the real modules bundled with esbuild,
 * `globalThis.fetch` replaced by a fake Joomla.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { entriesOf, makePackage, makeSlimPackage } from './fixtures/cowork-package.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let joomla
let exporter
let refusal
const realFetch = globalThis.fetch

async function bundle(entry, { inlinePackages = false } = {}) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    // A data: URL module cannot resolve bare specifiers, so the client half carries React inline.
    ...(inlinePackages ? {} : { packages: 'external' }),
    jsx: 'automatic',
    // `refusal.tsx` draws with `@tracy/ui`, whose entry imports its stylesheet.
    loader: { '.css': 'empty' },
    write: false
  })
  const source = Buffer.from(built.outputFiles[0].text).toString('base64')
  return import(`data:text/javascript;base64,${source}`)
}

before(async () => {
  joomla = await bundle('src/host/joomla.ts')
  exporter = await bundle('src/host/export.ts')
  refusal = await bundle('src/client/refusal.tsx', { inlinePackages: true })
})

after(() => {
  globalThis.fetch = realFetch
})

const ROOT = 'https://example.test'
const ADMIN = `${ROOT}/administrator/index.php`
const CSRF = '0123456789abcdef0123456789abcdef'
const TOKEN = 'ab'.repeat(24)
const PACKAGE_URL = 'https://downloads.example.test/pkg_claudecowork-0.9.0.zip'
const LATEST = '0.9.0'
const BASIC = { authorization: `Basic ${Buffer.from('gate:gate-pass').toString('base64')}` }
const FRONT_DOOR = `${ROOT}/index.php?option=com_claudecowork&task=api.exec&format=json`
const ADMIN_DOOR = `${ADMIN}?option=com_claudecowork&task=api.exec&format=json`
const PARSE_ERROR = "<title>Error: 0 syntax error, unexpected '-&gt;' (T_OBJECT_OPERATOR)</title>"

function withUrl(response, url) {
  Object.defineProperty(response, 'url', { value: url })
  return response
}

const headerOf = (init, name) => {
  const headers = init.headers ?? {}
  return headers instanceof Headers ? headers.get(name) : headers[name]
}

/** A fetch that answers from a table of `url → (init) => Response`, and throws for anything else. */
function routes(table, seen = []) {
  globalThis.fetch = async (url, init = {}) => {
    const key = String(url)
    seen.push({ url: key, method: init.method ?? 'GET', init })
    const route = table[key]
    if (!route) throw new TypeError(`fetch failed: no route for ${init.method ?? 'GET'} ${key}`)
    return withUrl(await route(init), key)
  }
  return seen
}

const JOOMLA_LOGIN = `<form action="index.php" method="post"><input name="username"><input type="password" name="passwd"><input type="hidden" name="${CSRF}" value="1"></form>`
const RSF_GATE =
  '<html><body><h1>Protected Area</h1><form method="post"><input type="password" name="rsf_backend_password"></form></body></html>'

// ── 1. Gates on /administrator ───────────────────────────────────────────────────────────────

test('the RSFirewall Protected Area is admin_gate, not unreachable', async () => {
  routes({ [`${ROOT}/administrator/`]: () => new Response(RSF_GATE) })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'admin_gate',
    detail: { at: 'login_page', check: 'admin_gate', status: 200, path: '/administrator/' }
  })
})

test('a 403 on /administrator is admin_gate', async () => {
  routes({ [`${ROOT}/administrator/`]: () => new Response('Forbidden', { status: 403 }) })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.equal(session.reason, 'admin_gate')
  assert.equal(session.detail.status, 403)
})

// Measured on a customer's Joomla site (prod, 20/10/2026): Cloudflare's managed challenge answered
// both `/administrator/` and `/`, and the import told the customer to turn off a security extension.
const cloudflareChallenge = (status = 403) =>
  new Response(
    '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=0"></script></body></html>',
    { status, headers: { 'cf-mitigated': 'challenge', server: 'cloudflare', 'content-type': 'text/html' } }
  )

test("Cloudflare's challenge on /administrator is blocked_by_firewall, not admin_gate", async () => {
  routes({ [`${ROOT}/administrator/`]: () => cloudflareChallenge() })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'login_page', check: 'forbidden', status: 403, path: '/administrator/' }
  })
})

test('a challenge Cloudflare marks on a 200 is blocked_by_firewall too, not admin_form_not_found', async () => {
  routes({ [`${ROOT}/administrator/`]: () => cloudflareChallenge(200) })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'login_page', check: 'firewall', status: 200, path: '/administrator/' }
  })
})

test("a plain 403 relayed by Cloudflare is still admin_gate: the CDN's header alone names no firewall", async () => {
  routes({
    [`${ROOT}/administrator/`]: () =>
      new Response(SERVER_403, { status: 403, headers: { server: 'cloudflare', 'cf-ray': '0-AMS' } })
  })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.equal(session.reason, 'admin_gate')
  assert.equal(session.firewall, undefined)
})

test('an admin address that lands on the home page is admin_form_not_found', async () => {
  // Admin Tools sends a guest without the secret word to the home page.
  routes({
    [`${ROOT}/administrator/`]: () => new Response('', { status: 303, headers: { location: `${ROOT}/` } }),
    [`${ROOT}/`]: () => new Response('<html><body>Welcome to our shop</body></html>')
  })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.equal(session.reason, 'admin_form_not_found')
})

test('a home page with the front-end login module gets no password and is admin_form_not_found', async () => {
  // Measured on Joomla 6: the home page carries a CSRF field and a password input of its own.
  const frontLogin = `<form action="/" method="post"><input name="username"><input type="password" name="password"><input type="hidden" name="option" value="com_users"><input type="hidden" name="${CSRF}" value="1"></form>`
  const seen = routes({
    [`${ROOT}/administrator/`]: () => new Response('', { status: 303, headers: { location: `${ROOT}/` } }),
    [`${ROOT}/`]: () => new Response(frontLogin)
  })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.equal(session.reason, 'admin_form_not_found')
  assert.equal(seen.filter((call) => call.method === 'POST').length, 0)
})

test('adminGateOf tells a password gate from a page that is simply not Joomla', () => {
  assert.equal(joomla.adminGateOf(RSF_GATE), 'admin_gate')
  assert.equal(joomla.adminGateOf('<form><input type="password" name="pin"></form>'), 'admin_gate')
  assert.equal(joomla.adminGateOf('<html>Shop</html>'), 'admin_form_not_found')
  // A WordPress login is a sign-in form, but not this platform's: the address is wrong.
  assert.equal(
    joomla.adminGateOf(
      '<form action="https://x.test/wp-login.php"><input name="log"><input type="password" name="pwd"></form>'
    ),
    'admin_form_not_found'
  )
  assert.equal(joomla.adminGateOf('', 403), 'admin_gate')
})

test('the secret word in the admin address rides on the login POST', async () => {
  const typed = `${ROOT}/administrator/?secret`
  const seen = routes({
    [typed]: () => new Response(JOOMLA_LOGIN, { headers: { 'set-cookie': 'sid=1; path=/' } }),
    [`${ADMIN}?secret`]: () =>
      new Response('', {
        status: 303,
        headers: { location: `${ADMIN}?secret`, 'set-cookie': 'sid=2; path=/' }
      })
  })
  // The landing GET re-uses the POST's URL; answer it as a logged-in dashboard.
  const original = globalThis.fetch
  let posted = false
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') posted = true
    if (posted && init.method !== 'POST' && String(url) === `${ADMIN}?secret`)
      return withUrl(
        new Response('<a href="index.php?option=com_login&task=logout">Log out</a>'),
        String(url)
      )
    return original(url, init)
  }
  const session = await joomla.loginToAdmin(typed, 'admin', 'pw')
  const post = seen.find((one) => one.method === 'POST')
  assert.equal(post.url, `${ADMIN}?secret`)
  assert.equal(session.ok, true)
})

test('loginPostUrl keeps the query string and drops the fragment', () => {
  assert.equal(
    joomla.loginPostUrl('https://x.test/administrator/?secret'),
    'https://x.test/administrator/index.php?secret'
  )
  assert.equal(joomla.loginPostUrl('https://x.test/administrator'), 'https://x.test/administrator/index.php')
  assert.equal(
    joomla.loginPostUrl('https://x.test/administrator/index.php?key=v#top'),
    'https://x.test/administrator/index.php?key=v'
  )
})

// ── 5. A broken certificate ───────────────────────────────────────────────────────────────────

test('a certificate refused by TLS is tls_invalid, not unreachable', async () => {
  globalThis.fetch = async () => {
    const cause = Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })
    throw new TypeError('fetch failed', { cause })
  }
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'tls_invalid',
    detail: { at: 'login_page', check: 'tls', error: 'DEPTH_ZERO_SELF_SIGNED_CERT' }
  })
})

test('a refused connection stays unreachable', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed', {
      cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
    })
  }
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'unreachable',
    detail: { at: 'login_page', check: 'network', error: 'ECONNREFUSED' }
  })
})

test('a front-end form naming com_users in its action gets no password either', async () => {
  // Some templates post the login module to `index.php?option=com_users&task=user.login` with no
  // hidden `option` field; it still is the front end's form, not the administrator's.
  const frontLogin = `<form action="/index.php?option=com_users&amp;task=user.login" method="post"><input name="username"><input type="password" name="password"><input type="hidden" name="${CSRF}" value="1"></form>`
  const seen = routes({
    [`${ROOT}/administrator/`]: () => new Response('', { status: 303, headers: { location: `${ROOT}/` } }),
    [`${ROOT}/`]: () => new Response(frontLogin)
  })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.equal(session.reason, 'admin_form_not_found')
  assert.equal(seen.filter((call) => call.method === 'POST').length, 0)
})

test("the administrator's own form, with its link to the front end's password reset, still signs in", () => {
  const adminPage = `<form action="/administrator/index.php" method="post"><input name="username"><input type="password" name="passwd"><input type="hidden" name="option" value="com_login"><input type="hidden" name="task" value="login"><input type="hidden" name="${CSRF}" value="1"></form><a href="/index.php?option=com_users&amp;view=reset">Forgot your password?</a>`
  assert.equal(joomla.isFrontLoginPage(adminPage), false)
  assert.equal(
    joomla.isFrontLoginPage(
      '<form method="post"><input type="hidden" name="task" value="user.login"></form>'
    ),
    true
  )
})

/** `/administrator/` redirects to the home page, which answers `html`; every POST is recorded. */
async function homePageLogin(html) {
  const seen = routes({
    [`${ROOT}/administrator/`]: () => new Response('', { status: 303, headers: { location: `${ROOT}/` } }),
    [`${ROOT}/`]: () => new Response(html)
  })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  return { session, posts: seen.filter((call) => call.method === 'POST') }
}

const passwordForm = (action) =>
  `<form ${action} method="post"><input name="username"><input type="password" name="password"><input type="hidden" name="${CSRF}" value="1"></form>`

test('a front-end form naming only task=user.login in its action gets no password', async () => {
  for (const action of ['action="?task=user.login"', 'action="/index.php?task=user.login"']) {
    const { session, posts } = await homePageLogin(passwordForm(action))
    assert.equal(session.reason, 'admin_form_not_found', action)
    assert.equal(posts.length, 0, action)
  }
  // The marker alone, even on a form that resolves inside the administrator folder.
  const inside = { pageUrl: ADMIN, adminBase: '/administrator/' }
  assert.equal(joomla.isFrontLoginPage(passwordForm('action="?task=user.login"'), inside), true)
  assert.equal(joomla.isFrontLoginPage(passwordForm('action="/index.php?task=user.login"')), true)
})

test('a password form posting outside the administrator folder gets no password, whatever it names', async () => {
  for (const action of [
    'action="/login"',
    'action="index.php"',
    '',
    'action="https://example.test/members/"'
  ]) {
    const { session, posts } = await homePageLogin(passwordForm(action))
    assert.equal(session.reason, 'admin_form_not_found', action || 'no action')
    assert.equal(posts.length, 0, action || 'no action')
  }
})

test('an administrator-looking form on a page outside the administrator folder gets no password', async () => {
  // The POST goes to the page's own index.php, so a home page carrying the admin form's markup
  // would receive it on the front end.
  const { session, posts } = await homePageLogin(
    JOOMLA_LOGIN.replace('action="index.php"', 'action="/administrator/index.php"')
  )
  assert.equal(session.reason, 'admin_form_not_found')
  assert.equal(posts.length, 0)
})

test('the administrator folder is the one typed: a site under a subfolder still signs in', () => {
  assert.equal(joomla.adminBasePath(`${ROOT}/office/administrator`), '/office/administrator/')
  assert.equal(joomla.adminBasePath(`${ROOT}/administrator/index.php?secret`), '/administrator/')
  const where = { pageUrl: `${ROOT}/office/administrator/`, adminBase: '/office/administrator/' }
  assert.equal(joomla.isFrontLoginPage(JOOMLA_LOGIN, where), false)
  assert.equal(joomla.isFrontLoginPage(passwordForm('action="/office/index.php"'), where), true)
})

/** The admin login page answers; the POST and the landing answer as `post` and `landing` say. */
function loginRoutes({ post, landing }) {
  const landingUrl = `${ADMIN}?option=com_cpanel`
  return routes({
    [ADMIN]: (init) =>
      init.method === 'POST'
        ? post()
        : new Response(JOOMLA_LOGIN, { headers: { 'set-cookie': 'sid=1; path=/' } }),
    [landingUrl]: () => landing?.() ?? new Response('<html>dashboard</html>')
  })
}

test('a firewall refusing the login POST is admin_gate, not unreachable', async () => {
  const seen = loginRoutes({ post: () => new Response(SERVER_403, { status: 403 }) })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'admin_gate',
    detail: { at: 'login_post', check: 'forbidden', status: 403, path: '/administrator/index.php' }
  })
  assert.equal(seen.filter((call) => call.method === 'POST').length, 1)
})

test('a firewall named on the login POST or the landing is blocked_by_firewall', async () => {
  loginRoutes({ post: () => cloudflareChallenge() })
  const posted = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.deepEqual(posted, {
    ok: false,
    reason: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'login_post', check: 'forbidden', status: 403, path: '/administrator/index.php' }
  })
  const redirect = () =>
    new Response('', { status: 303, headers: { location: `${ADMIN}?option=com_cpanel` } })
  const MODSECURITY_403 =
    '<html><head><title>403 Forbidden</title></head><body>This error was generated by Mod_Security.</body></html>'
  loginRoutes({ post: redirect, landing: () => new Response(MODSECURITY_403, { status: 403 }) })
  const landed = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(landed.reason, 'blocked_by_firewall')
  assert.equal(landed.firewall, 'modsecurity')
  assert.equal(landed.detail.check, 'server_denied')
})

test('a challenge on a non-403 answer of the sign-in is blocked_by_firewall, not a generic failure', async () => {
  // The login POST answered by Cloudflare with a 200 challenge, not Joomla's redirect.
  loginRoutes({ post: () => cloudflareChallenge(200) })
  const posted = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.deepEqual(posted, {
    ok: false,
    reason: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'login_post', check: 'firewall', status: 200, path: '/administrator/index.php' }
  })
  // The login page answered with a 429 challenge.
  routes({ [ADMIN]: () => cloudflareChallenge(429) })
  const page = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(page.reason, 'blocked_by_firewall')
  assert.equal(page.firewall, 'cloudflare')
  assert.deepEqual(page.detail, {
    at: 'login_page',
    check: 'firewall',
    status: 429,
    path: '/administrator/index.php'
  })
  // The landing after the redirect answered with a 200 challenge.
  const redirect = () =>
    new Response('', { status: 303, headers: { location: `${ADMIN}?option=com_cpanel` } })
  loginRoutes({ post: redirect, landing: () => cloudflareChallenge(200) })
  const landed = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(landed.reason, 'blocked_by_firewall')
  assert.equal(landed.firewall, 'cloudflare')
  assert.equal(landed.detail.at, 'login_landing')
  assert.equal(landed.detail.check, 'firewall')
  // Plain answers keep their reasons: a 200 with no redirect, a 503 on the login page.
  loginRoutes({ post: () => new Response('<html>ok</html>') })
  assert.equal((await joomla.loginToAdmin(ADMIN, 'admin', 'pw')).detail.check, 'no_redirect')
  routes({ [ADMIN]: () => new Response('down', { status: 503 }) })
  assert.equal((await joomla.loginToAdmin(ADMIN, 'admin', 'pw')).reason, 'unreachable')
})

test("Joomla's own 403 on the login POST is not a firewall: unreachable, joomla_denied", async () => {
  // Joomla renders "The most recent request was denied because it had an invalid security token".
  const INVALID_TOKEN =
    '<!DOCTYPE html><html><head><title>Error: 403</title><link href="/media/templates/administrator/atum/css/template.min.css" rel="stylesheet"></head><body>Invalid Token</body></html>'
  loginRoutes({ post: () => new Response(INVALID_TOKEN, { status: 403 }) })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.deepEqual(session, {
    ok: false,
    reason: 'unreachable',
    detail: { at: 'login_post', check: 'joomla_denied', status: 403, path: '/administrator/index.php' }
  })
  // The same split on the login page itself.
  routes({ [ADMIN]: () => new Response(INVALID_TOKEN, { status: 403 }) })
  const page = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(page.reason, 'unreachable')
  assert.equal(page.detail.check, 'joomla_denied')
  routes({ [ADMIN]: () => new Response(SERVER_403, { status: 403 }) })
  assert.equal((await joomla.loginToAdmin(ADMIN, 'admin', 'pw')).reason, 'admin_gate')
})

test('a 403 on the dashboard after signing in: Joomla refusing the account, or a server rule', async () => {
  const redirect = () =>
    new Response('', { status: 303, headers: { location: `${ADMIN}?option=com_cpanel` } })
  loginRoutes({ post: redirect, landing: () => new Response(JOOMLA_403, { status: 403 }) })
  const denied = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(denied.reason, 'no_backend_access')
  assert.deepEqual(denied.detail, {
    at: 'login_landing',
    check: 'joomla_denied',
    status: 403,
    path: '/administrator/index.php'
  })
  loginRoutes({ post: redirect, landing: () => new Response(SERVER_403, { status: 403 }) })
  const gated = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(gated.reason, 'admin_gate')
  assert.equal(gated.detail.check, 'server_denied')
})

// ── 2 and 4. Installing ─────────────────────────────────────────────────────────────────────

/**
 * A fake Joomla admin for `installCowork`. `urlInstall`: what the site-side download does
 * ('hangs' = the POST is aborted by the timeout, 'installs', 'fails'). `php`: what phpinfo says.
 * `engine`: how the component answers once installed ('ok' or 'parse_error').
 * `installPage`: how the installer page answers ('form', 'joomla_403' = Joomla's own permission
 * refusal, 'server_403' = the web server's, 'login' = the session is gone). `installPost`: how the
 * install POST answers ('ok', or a 403 like the page's). `afterPost`: how the installer page answers
 * once a POST has been made (the page the upload road reads again). `urlInstall: 'error_500'` answers
 * the URL POST with a 500 carrying `urlBody`. `uploadInstall`: what the upload POST does ('installs';
 * 'dropped' = PHP emptied `$_FILES`, a redirect and nothing installed; 'memory' = a 500 with PHP's
 * memory error; 'server_403' = a web server rule refusing the upload). `limits`: the phpinfo rows
 * shown, `name → Local Value`. `packageDownload: 'fails'` = the package cannot be fetched.
 * `assets`: a slim release's contract assets beside the package, file name → bytes (one missing
 * answers 404); each one asked lands in `state.assetsAsked`. Each upload body's encoded size lands
 * in `state.uploadBodyBytes`.
 */
function fakeInstaller({
  urlInstall = 'installs',
  urlBody = '',
  uploadInstall = 'installs',
  limits = {},
  php,
  engine = 'ok',
  packageBytes = 4,
  installPage = 'form',
  installPost = 'ok',
  afterPost = 'form',
  packageDownload = 'ok',
  configPage = 'ok',
  // The site's Template Styles list, and the quickstart contract its params name (a JA quickstart).
  templates = [],
  namesContract,
  publicFiles = {},
  assets = {}
} = {}) {
  const state = {
    installed: false,
    posts: [],
    phpinfoAsked: false,
    uploadBodyBytes: [],
    uploadFiles: [],
    assetsAsked: []
  }
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const method = init.method ?? 'GET'
    if (url === `${ADMIN}?option=com_installer&view=install`) {
      if (method === 'POST') {
        const kind = init.body instanceof FormData ? 'upload' : 'url'
        state.posts.push(kind)
        if (kind === 'upload') {
          state.uploadBodyBytes.push((await new Response(init.body).arrayBuffer()).byteLength)
          const file = init.body.get('install_package')
          if (file) state.uploadFiles.push(Buffer.from(await file.arrayBuffer()))
        }
        if (installPost === 'joomla_403') return withUrl(new Response(JOOMLA_403, { status: 403 }), url)
        if (installPost === 'server_403') return withUrl(new Response(SERVER_403, { status: 403 }), url)
        if (installPost === 'cloudflare') return withUrl(cloudflareChallenge(), url)
        if (kind === 'url' && urlInstall === 'hangs')
          throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
        if (kind === 'url' && urlInstall === 'error_500')
          return withUrl(new Response(urlBody, { status: 500 }), url)
        if (kind === 'upload' && uploadInstall === 'memory')
          return withUrl(new Response(MEMORY_FATAL, { status: 500 }), url)
        if (kind === 'upload' && uploadInstall === 'server_403')
          return withUrl(new Response(SERVER_403, { status: 403 }), url)
        if (kind === 'upload' && uploadInstall === 'dropped')
          return withUrl(new Response('', { status: 303, headers: { location: url } }), url)
        if (kind === 'upload' || urlInstall === 'installs') state.installed = true
        return withUrl(new Response('', { status: 303, headers: { location: url } }), url)
      }
      if (state.posts.length && afterPost === 'joomla_403')
        return withUrl(new Response(JOOMLA_403, { status: 403 }), url)
      if (state.posts.length && afterPost === 'server_403')
        return withUrl(new Response(SERVER_403, { status: 403 }), url)
      if (state.posts.length && afterPost === 'cloudflare') return withUrl(cloudflareChallenge(), url)
      if (installPage === 'joomla_403') return withUrl(new Response(JOOMLA_403, { status: 403 }), url)
      if (installPage === 'server_403') return withUrl(new Response(SERVER_403, { status: 403 }), url)
      if (installPage === 'cloudflare') return withUrl(cloudflareChallenge(), url)
      if (installPage === 'cloudflare_200') return withUrl(cloudflareChallenge(200), url)
      if (installPage === 'login') return withUrl(new Response(JOOMLA_LOGIN), `${ADMIN}`)
      return withUrl(new Response(`<form><input type="hidden" name="${CSRF}" value="1"></form>`), url)
    }
    if (url === `${ADMIN}?option=com_admin&view=sysinfo&layout=phpinfo`) {
      state.phpinfoAsked = true
      const rows = Object.entries(limits)
        .map(
          ([name, value]) =>
            `<tr><td class="e">${name} </td><td class="v">${value} </td><td class="v">512M </td></tr>`
        )
        .join('')
      const page = `${php ? `<h1 class="p">PHP Version ${php}</h1>` : ''}${rows ? `<table>${rows}</table>` : ''}`
      return withUrl(new Response(page || '<p>disabled</p>'), url)
    }
    if (url.startsWith(`${ADMIN}?option=com_config`)) {
      if (state.installed && configPage === 'cloudflare') return withUrl(cloudflareChallenge(), url)
      if (state.installed && configPage === 'server_403')
        return withUrl(new Response(SERVER_403, { status: 403 }), url)
      return withUrl(
        new Response(state.installed ? `<input id="jform_token" name="jform[token]" value="${TOKEN}">` : ''),
        url
      )
    }
    if (url.startsWith(`${ROOT}/templates/`)) {
      const body = publicFiles[url.slice(ROOT.length + 1)]
      return withUrl(new Response(body ?? 'Not found', { status: body ? 200 : 404 }), url)
    }
    if (url === `${ADMIN}?option=com_templates&view=styles&client_id=0`) {
      const rows = templates.map(
        (t) => `<img src="/media/templates/site/${t}/images/template_thumbnail.png">`
      )
      return withUrl(new Response(`<table>${rows.join('')}</table>`), url)
    }
    if (url.includes('option=com_claudecowork&task=api.exec')) {
      if (!state.installed) return withUrl(new Response('<html>Not found</html>', { status: 404 }), url)
      // The engine reads the folder the params name on every request (EngineFactory::buildContract).
      const carried = state.uploadFiles.at(-1)
      if (namesContract && !(carried && contractsOf(carried).includes(namesContract)))
        return withUrl(
          new Response(
            JSON.stringify({
              ok: false,
              error: 'contract_unavailable',
              message: 'This site names a content contract this receiver does not carry' // vocabulary-allow: the engine's own words
            })
          ),
          url
        )
      if (engine === 'parse_error') return withUrl(new Response(PARSE_ERROR, { status: 500 }), url)
      if (engine === 'cloudflare') return withUrl(cloudflareChallenge(), url)
      if (engine === 'php_too_old') return withUrl(new Response(PHP_TOO_OLD), url)
      return withUrl(new Response(JSON.stringify({ ok: true, info: { component: LATEST } })), url)
    }
    if (url === PACKAGE_URL && packageDownload === 'fails')
      return withUrl(new Response('Not found', { status: 404 }), url)
    if (url === PACKAGE_URL) return withUrl(new Response(new Uint8Array(packageBytes)), url)
    if (url.startsWith(new URL('.', PACKAGE_URL).toString()) && url.endsWith('.zip')) {
      const name = url.slice(url.lastIndexOf('/') + 1)
      state.assetsAsked.push(name)
      const body = assets[name]
      return withUrl(
        new Response(body ? new Uint8Array(body) : 'Not found', { status: body ? 200 : 404 }),
        url
      )
    }
    throw new TypeError(`fetch failed: no route for ${method} ${url}`)
  }
  return state
}

// Measured on Joomla 6.2.0 (admin in de-DE): what an Administrator gets on the installer.
const JOOMLA_403 =
  '<!DOCTYPE html><html lang="de-de"><head><title>Fehler: 403</title><link href="/media/templates/administrator/atum/css/template.min.css" rel="stylesheet"></head><body>Sie haben keine Berechtigung</body></html>'
const SERVER_403 =
  '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"><html><head><title>403 Forbidden</title></head><body><h1>Forbidden</h1></body></html>'

// PHP's own fatal error, as Apache logged it on Joomla 6.1.3 with `memory_limit` 128M.
const MEMORY_FATAL =
  '<br />\n<b>Fatal error</b>:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 62914592 bytes) in <b>/var/www/html/libraries/vendor/joomla/filesystem/src/File.php</b> on line <b>349</b><br />'

// The last road asked names where the install stopped: the URL road, the fallback (#1568).
const PARSE_DETAIL = {
  at: 'url_install',
  check: 'parse_error',
  status: 500,
  path: '/administrator/index.php'
}

// What both roads leave in a diagnostic when each POST redirects and nothing is installed.
const BOTH_ROADS_REDIRECTED = {
  roads: {
    url_install: { post_status: 303, result_status: 200 },
    upload_install: { post_status: 303, result_status: 200 }
  },
  package_bytes: 4
}

const SESSION = { ok: true, cookie: 'joomla_session=abc', authHeader: {}, webRootUrl: ROOT }

test('a site-side download that hangs is not waited on: the package was carried over first', async () => {
  const state = fakeInstaller({ urlInstall: 'hangs' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.posts, ['upload'])
})

test('a download that hung but landed anyway is not installed twice', async () => {
  // The upload road went first and installed nothing; the URL road is the fallback.
  const state = fakeInstaller({ urlInstall: 'hangs', uploadInstall: 'dropped' })
  // The POST is aborted on this side, but the site finished installing it.
  const original = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    if (
      init.method === 'POST' &&
      init.body instanceof URLSearchParams &&
      String(url).includes('com_installer')
    ) {
      state.installed = true
      state.posts.push('url')
      throw new DOMException('timeout', 'TimeoutError')
    }
    return original(url, init)
  }
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.ok, true)
  assert.deepEqual(state.posts, ['upload', 'url'])
})

test('a package the size of the real one (~59 MB) still goes over the upload road', async () => {
  const state = fakeInstaller({ urlInstall: 'fails', packageBytes: 59 * 1024 * 1024 })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.ok, true)
  assert.deepEqual(state.posts, ['upload'])
})

// ── 6b. The release's own package on a host that takes 2 MB (David, 21/10/2026) ────────────────

test('a real-shaped package over a 2 MB upload limit goes over the upload road without its contracts', async () => {
  const { makePackage, entriesOf } = await import('./fixtures/cowork-package.mjs')
  const pkg = makePackage({ contractBytes: 3 * MB })
  assert.ok(pkg.length > 3 * MB, 'the fixture is over the limit as released')
  const state = fakeInstaller({
    urlInstall: 'fails',
    limits: { memory_limit: '128M', upload_max_filesize: '2M', post_max_size: '8M' },
    packageBytes: pkg
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.posts, ['upload'])
  const sent = state.uploadFiles[0]
  assert.ok(sent.length < 2 * MB, `sent ${sent.length} bytes`)
  const inner = entriesOf(sent, 'packages/com_claudecowork.zip')
  assert.ok(inner.includes('administrator/lib/Engine.php'))
  assert.ok(inner.includes('administrator/lib/language-packs.json'))
  assert.equal(inner.filter((n) => n.startsWith('administrator/lib/contracts/')).length, 0)
})

// #1568 (QA, 21/10/2026): a site that fetched the release itself (`installtype=url`) received every
// template's contracts — 483 MB in its webroot — and the import packed them back.
test('a site that could fetch the release itself still gets the slim package, carried over', async () => {
  const pkg = makePackage({ contractBytes: 3 * MB })
  const state = fakeInstaller({ urlInstall: 'installs', packageBytes: pkg })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.posts, ['upload'], 'the URL road, which installs the full release, is not taken')
  assert.equal(contractsOf(state.uploadFiles[0]).length, 0)
})

test('the URL road is the fallback when the upload road does not install', async () => {
  const state = fakeInstaller({
    uploadInstall: 'dropped',
    packageBytes: makePackage({ contractBytes: 64 * 1024 })
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.posts, ['upload', 'url'])
})

test('a package this side cannot download goes over the URL road, as before', async () => {
  const state = fakeInstaller({ packageDownload: 'fails' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.posts, ['url'])
})

/** The contract ids a package's component carries (`ja-resume/j6/1.0.6`). */
function contractsOf(pkg) {
  return entriesOf(pkg, 'packages/com_claudecowork.zip')
    .filter((n) => n.startsWith('administrator/lib/contracts/') && n.endsWith('/manifest.json'))
    .map((n) => n.slice('administrator/lib/contracts/'.length, -'/manifest.json'.length))
}

// Measured 21/10/2026 on a live site built from the Tracy Business quickstart: the slim package
// installed, then every door answered `contract_unavailable` — its params name
// `tracy-business/j6/1.2.2`. Keeping every Tracy Business version (3.9 MB) is past its 2 MB limit,
// so the version is told by the files the site serves.
test('a quickstart site keeps the one contract its served files match, under a 2 MB limit', async () => {
  const css = (v) => `/* tracy business ${v} */`
  const sha = (text) => createHash('sha256').update(text).digest('hex')
  const cssPath = 'templates/tracy_business/css/template.css'
  const versions = ['1.2.1', '1.2.2', '1.2.5', '1.2.6']
  const pkg = makePackage({
    contractBytes: 2 * MB,
    contracts: versions.map((version) => ({
      slug: 'tracy-business',
      version,
      files: { [cssPath]: sha(css(version)) }
    }))
  })
  assert.ok(pkg.length > 3 * MB, `the four versions are ${pkg.length} bytes`)
  const state = fakeInstaller({
    urlInstall: 'fails',
    limits: { memory_limit: '128M', upload_max_filesize: '2M', post_max_size: '8M' },
    packageBytes: pkg,
    templates: ['tracy_business', 'cassiopeia'],
    namesContract: 'tracy-business/j6/1.2.2',
    publicFiles: { [cssPath]: css('1.2.2') }
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  const sent = state.uploadFiles[0]
  assert.ok(sent.length < 2 * MB, `sent ${sent.length} bytes`)
  assert.deepEqual(contractsOf(sent), ['tracy-business/j6/1.2.2'])
})

// From the Joomla release after 0.24.53 the package carries no contract, only an index, and each
// contract is a release asset beside it. A host that cannot reach GitHub cannot fetch its own, so
// this side puts the one the site serves into the component it uploads (#1568).
test('a slim release: the contract the site serves is fetched beside the package and put in', async () => {
  const css = (v) => `/* tracy business ${v} */`
  const sha = (text) => createHash('sha256').update(text).digest('hex')
  const cssPath = 'templates/tracy_business/css/template.css'
  const { pkg, assets } = makeSlimPackage({
    contracts: ['1.2.1', '1.2.2', '1.2.5'].map((version) => ({
      slug: 'tracy-business',
      version,
      files: { [cssPath]: sha(css(version)) }
    }))
  })
  const state = fakeInstaller({
    urlInstall: 'fails',
    packageBytes: pkg,
    assets,
    templates: ['tracy_business'],
    namesContract: 'tracy-business/j6/1.2.2',
    publicFiles: { [cssPath]: css('1.2.2') }
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.assetsAsked.sort(), Object.keys(assets).sort())
  assert.deepEqual(contractsOf(state.uploadFiles[0]), ['tracy-business/j6/1.2.2'])
})

test('a slim release whose asset cannot be fetched still installs, the package as released', async () => {
  const { pkg } = makeSlimPackage({ contracts: [{ slug: 'ja-resume', version: '1.0.6' }] })
  const state = fakeInstaller({ urlInstall: 'fails', packageBytes: pkg, templates: ['ja_resume'] })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.assetsAsked, ['ja-resume--j6--1.0.6.zip'])
  assert.deepEqual(state.posts, ['upload'])
  assert.ok(state.uploadFiles[0].equals(pkg), 'the release, unchanged')
})

test('a contract the package still does not carry is named, not "the site did not say why"', async () => {
  fakeInstaller({
    urlInstall: 'fails',
    packageBytes: makePackage({ contractBytes: 64 * 1024 }),
    namesContract: 'ja-impact/j6/1.0.1'
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'install_failed')
  assert.equal(result.detail.at, 'proof')
  assert.equal(result.detail.check, 'contract_unavailable')
  assert.equal(refusal.importErrorKey(result.reason, result.detail), 'import_error_install_contract')
})

// ── 7. A host limit that stops both roads: the cause, not "install it yourself" ─────────────

// Measured on Joomla 6.1.3 (19/10/2026): `memory_limit` 128M, upload and POST limits 8M, a ~60 MB
// package. The URL POST died with a 500, and the upload of a body past `post_max_size` came back 200
// with nothing installed — and only that 200 reached the operator.
const SMALL_HOST = { memory_limit: '128M', upload_max_filesize: '8M', post_max_size: '8M' }
const MB = 1024 * 1024

test('a URL 500 then a package over the known upload limits is upload_too_large, the 500 kept', async () => {
  const state = fakeInstaller({ urlInstall: 'error_500', limits: SMALL_HOST, packageBytes: 60 * MB })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, {
    ok: false,
    reason: 'upload_too_large',
    uploadMb: { package: '60', limit: '8' },
    detail: {
      at: 'upload_install',
      check: 'over_limit',
      roads: {
        url_install: { post_status: 500, result_status: 200 },
        upload_install: { cause: 'over_limit' }
      },
      php_limits: { memory_limit: 128 * MB, upload_max_filesize: 8 * MB, post_max_size: 8 * MB },
      package_bytes: 60 * MB
    }
  })
  // The package is not sent: PHP would drop it and Joomla would answer 200 with nothing installed.
  assert.deepEqual(state.posts, ['url'])
})

test('a POST whose answer carries PHP memory exhaustion is site_resource_limit', async () => {
  fakeInstaller({ urlInstall: 'error_500', urlBody: MEMORY_FATAL, limits: SMALL_HOST, packageBytes: 60 * MB })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'site_resource_limit')
  assert.deepEqual(result.detail.roads.url_install, {
    post_status: 500,
    cause: 'memory_exhausted',
    result_status: 200
  })
  assert.equal(result.detail.at, 'url_install')
  assert.equal(result.detail.check, 'memory_exhausted')
  assert.equal(result.detail.status, 500)
  // A fixed classification only: nothing of PHP's page rides along.
  assert.equal(/Fatal|libraries|134217728 bytes/.test(JSON.stringify(result)), false)
  // The upload road's own memory error says the same, with limits unknown.
  const state = fakeInstaller({ urlInstall: 'fails', uploadInstall: 'memory' })
  const upload = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(upload.reason, 'site_resource_limit')
  assert.equal(upload.detail.at, 'upload_install')
  assert.deepEqual(state.posts, ['upload', 'url'])
})

test('limits phpinfo does not show change nothing: the upload is sent and its failure is install_failed', async () => {
  const state = fakeInstaller({ urlInstall: 'error_500', uploadInstall: 'dropped', packageBytes: 60 * MB })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, {
    ok: false,
    reason: 'install_failed',
    detail: {
      at: 'url_install',
      check: 'not_installed',
      status: 200,
      path: '/administrator/index.php',
      roads: {
        url_install: { post_status: 500, result_status: 200 },
        upload_install: { post_status: 303, result_status: 200 }
      },
      package_bytes: 60 * MB
    }
  })
  assert.deepEqual(state.posts, ['upload', 'url'])
})

test('an upload that lands is a success, and the URL road that would die is never asked', async () => {
  const state = fakeInstaller({ urlInstall: 'error_500', urlBody: MEMORY_FATAL })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  assert.deepEqual(state.posts, ['upload'])
})

test('a package under the known limits still goes over the upload road', async () => {
  const state = fakeInstaller({
    urlInstall: 'fails',
    limits: { upload_max_filesize: '64M', post_max_size: '-1' },
    packageBytes: 60 * MB
  })
  assert.equal((await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)).ok, true)
  assert.deepEqual(state.posts, ['upload'])
})

test('phpinfo limits are read as PHP reads them: K, M, G, -1, and unknown when missing', () => {
  assert.equal(joomla.phpSizeBytes('8M'), 8 * MB)
  assert.equal(joomla.phpSizeBytes('512k'), 512 * 1024)
  assert.equal(joomla.phpSizeBytes('2G'), 2 * 1024 * MB)
  assert.equal(joomla.phpSizeBytes('1048576'), MB)
  assert.equal(joomla.phpSizeBytes(' 128M '), 128 * MB)
  assert.equal(joomla.phpSizeBytes('-1'), -1)
  assert.equal(joomla.phpSizeBytes('no value'), undefined)
  assert.equal(joomla.phpSizeBytes('1.5M'), undefined)
  assert.equal(joomla.phpSizeBytes(undefined), undefined)
  // The Local Value (first `v` column), not the Master Value; a row not shown is not guessed.
  const page =
    '<tr><td class="e">memory_limit </td><td class="v">-1 </td><td class="v">128M </td></tr>' +
    '<tr><td class="e">post_max_size</td><td class="v">8M</td><td class="v">8M</td></tr>' +
    '<tr><td class="e">upload_max_filesize</td><td class="v"><i>no value</i></td><td class="v">2M</td></tr>'
  assert.deepEqual(joomla.phpLimits(page), { memory_limit: -1, post_max_size: 8 * MB })
  assert.deepEqual(joomla.phpLimits('<p>disabled</p>'), {})
  // Either limit stops the upload; the envelope counts against post_max_size only.
  assert.equal(
    joomla.uploadBlockedBy(60 * MB, { upload_max_filesize: 8 * MB, post_max_size: 16 * MB }),
    8 * MB
  )
  // post_max_size holds the whole request: a file that fits, in a request one byte over, stops.
  assert.equal(joomla.uploadBlockedBy(8 * MB, { post_max_size: 8 * MB }), undefined)
  assert.equal(joomla.uploadBlockedBy(8 * MB, { post_max_size: 8 * MB }, 8 * MB + 1), 8 * MB)
  assert.equal(joomla.uploadBlockedBy(8 * MB, { upload_max_filesize: 8 * MB }), undefined)
  assert.equal(joomla.uploadBlockedBy(60 * MB, { upload_max_filesize: -1, post_max_size: 0 }), undefined)
  assert.equal(joomla.uploadBlockedBy(60 * MB, {}), undefined)
  assert.equal(joomla.megabytes(60 * MB), '60')
  assert.equal(joomla.megabytes(2.5 * MB), '2.5')
})

test('a package just under post_max_size is still sent: the envelope counted is the real one', async () => {
  // 8 KB under an 8M post_max_size: a fixed allowance of kilobytes would have skipped it.
  const bytes = 8 * MB - 8 * 1024
  const state = fakeInstaller({
    urlInstall: 'fails',
    limits: { upload_max_filesize: '8M', post_max_size: '8M' },
    packageBytes: bytes
  })
  assert.equal((await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)).ok, true)
  assert.deepEqual(state.posts, ['upload'])
  // What the check counts is what went over the wire, and the envelope is a few hundred bytes.
  const counted = await joomla.uploadRequestBytes(bytes, 'pkg_claudecowork-0.9.0.zip')
  assert.deepEqual(state.uploadBodyBytes, [counted])
  assert.ok(counted - bytes > 0 && counted - bytes < 1024, `envelope ${counted - bytes} bytes`)
  // The same package in a request over the limit is not sent.
  const over = fakeInstaller({
    urlInstall: 'fails',
    limits: { post_max_size: String(counted - 1) },
    packageBytes: bytes
  })
  const refused = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(refused.reason, 'upload_too_large')
  assert.deepEqual(over.posts, ['url'])
})

test("PHP's memory error at the head of a large first chunk is still read", async () => {
  // One 100 KB chunk, past the 64 KB read cap: its head is kept, not the whole chunk dropped.
  fakeInstaller({
    urlInstall: 'error_500',
    urlBody: MEMORY_FATAL + 'x'.repeat(100 * 1024),
    uploadInstall: 'dropped'
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'site_resource_limit')
  assert.equal(result.detail.roads.url_install.cause, 'memory_exhausted')
})

test('a package that cannot be downloaded after a URL memory error is site_resource_limit', async () => {
  const state = fakeInstaller({
    urlInstall: 'error_500',
    urlBody: MEMORY_FATAL,
    limits: SMALL_HOST,
    packageDownload: 'fails'
  })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'site_resource_limit')
  assert.equal(result.detail.at, 'url_install')
  assert.deepEqual(result.detail.roads, {
    url_install: { post_status: 500, cause: 'memory_exhausted', result_status: 200 }
  })
  assert.deepEqual(result.detail.php_limits, {
    memory_limit: 128 * MB,
    upload_max_filesize: 8 * MB,
    post_max_size: 8 * MB
  })
  assert.deepEqual(state.posts, ['url'])
  // With no cause recorded it stays the download's own failure, evidence kept.
  fakeInstaller({ urlInstall: 'error_500', packageDownload: 'fails' })
  const plain = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(plain.reason, 'install_failed')
  assert.equal(plain.detail.at, 'package_download')
  assert.deepEqual(plain.detail.roads, { url_install: { post_status: 500, result_status: 200 } })
})

test('a 403 on the upload then a URL 500 keeps both roads, the PHP limits and the 403', async () => {
  fakeInstaller({ urlInstall: 'error_500', uploadInstall: 'server_403', limits: { memory_limit: '128M' } })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'admin_gate')
  assert.equal(result.detail.at, 'upload_install')
  assert.equal(result.detail.check, 'server_denied')
  assert.deepEqual(result.detail.roads, {
    url_install: { post_status: 500, result_status: 200 },
    upload_install: { post_status: 403 }
  })
  assert.deepEqual(result.detail.php_limits, { memory_limit: 128 * MB })
  assert.equal(result.detail.package_bytes, 4)
})

test('PHP older than the manifest asks for is refused before anything is installed', async () => {
  const state = fakeInstaller({ php: '7.2.34' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '7.4' })
  assert.deepEqual(result, {
    ok: false,
    reason: 'php_too_old',
    php: '7.2.34',
    minimumPhp: '7.4',
    detail: { at: 'php_check', check: 'below_minimum' }
  })
  assert.deepEqual(state.posts, [])
})

test('the manifest minimum is the only minimum: PHP 7.4 goes ahead when it says 7.4', async () => {
  // claude-cowork 0.24.39 runs on PHP 7.4; no floor of Tracy's own sits above the manifest.
  const state = fakeInstaller({ php: '7.4.33' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '7.4' })
  assert.equal(result.ok, true)
  assert.deepEqual(state.posts, ['upload'])
  fakeInstaller({ php: '8.0.30' })
  const higher = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '8.1' })
  assert.deepEqual(higher, {
    ok: false,
    reason: 'php_too_old',
    php: '8.0.30',
    minimumPhp: '8.1',
    detail: { at: 'php_check', check: 'below_minimum' }
  })
})

test('no declared minimum refuses nothing, and an unknown version is not refused', async () => {
  fakeInstaller({ php: '5.6.40' })
  assert.equal((await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)).ok, true)
  fakeInstaller({})
  assert.equal(
    (await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '7.4' })).ok,
    true
  )
})

test('an install whose engine then dies on a parse error is php_too_old', async () => {
  // phpinfo is disabled, so the version is only learnt from the engine failing.
  const state = fakeInstaller({ engine: 'parse_error' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '7.4' })
  assert.deepEqual(result, {
    ok: false,
    reason: 'php_too_old',
    minimumPhp: '7.4',
    detail: { ...PARSE_DETAIL, ...BOTH_ROADS_REDIRECTED }
  })
  assert.deepEqual(state.posts, ['upload', 'url'])
})

/** claude-cowork 0.24.73 on PHP below 7.4: HTTP 200 and this answer, on both doors. */
const PHP_TOO_OLD = JSON.stringify({
  ok: false,
  error: 'php_too_old',
  code: 'php_too_old',
  php: '7.3.33',
  min: '7.4.0'
})

test('an engine that says its PHP is too old is php_too_old with its own versions, at install and at the door', async () => {
  // phpinfo is disabled, so only the engine names the site's PHP.
  fakeInstaller({ engine: 'php_too_old' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '7.4' })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'php_too_old')
  assert.equal(result.php, '7.3.33')
  assert.equal(result.minimumPhp, '7.4.0')
  assert.equal(result.detail.check, 'below_minimum')
  routes({ [FRONT_DOOR]: () => new Response(PHP_TOO_OLD), [ADMIN_DOOR]: () => new Response(PHP_TOO_OLD) })
  const door = await joomla.resolveDoor(ROOT, TOKEN, { secondLookMs: 0 })
  assert.equal(door.refusal, 'php_too_old')
  assert.equal(door.php, '7.3.33')
  assert.equal(door.minimumPhp, '7.4.0')
  assert.equal(door.detail.check, 'below_minimum')
  assert.equal(refusal.importErrorKey('php_too_old'), 'import_error_php_too_old')
})

test('a parse error on a PHP the manifest accepts names no versions', async () => {
  // An older installed engine, or a package that claims less than it needs: saying "needs 7.4" to a
  // site on 7.4 would be wrong, so the reason stands alone.
  fakeInstaller({ engine: 'parse_error', php: '7.4.33' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST, undefined, { requiresPhp: '7.4' })
  assert.deepEqual(result, {
    ok: false,
    reason: 'php_too_old',
    detail: { ...PARSE_DETAIL, ...BOTH_ROADS_REDIRECTED }
  })
})

test('minimumPhp takes the manifest as it is; versionBelow compares numbers', () => {
  assert.equal(joomla.minimumPhp('7.4'), '7.4')
  assert.equal(joomla.minimumPhp(undefined), undefined)
  assert.equal(joomla.minimumPhp('8.2'), '8.2')
  assert.equal(joomla.minimumPhp('nonsense'), undefined)
  assert.deepEqual(joomla.phpDetail('7.2.34', '7.4'), { php: '7.2.34', minimumPhp: '7.4' })
  assert.deepEqual(joomla.phpDetail(undefined, '7.4'), { minimumPhp: '7.4' })
  assert.deepEqual(joomla.phpDetail('8.3.1', '7.4'), {})
  assert.deepEqual(joomla.phpDetail('8.3.1', undefined), {})
  assert.equal(joomla.versionBelow('7.4.33', '8.0'), true)
  assert.equal(joomla.versionBelow('8.0.30', '8.0'), false)
  assert.equal(joomla.versionBelow('8.10', '8.9'), false)
})

// ── 6. An account that may not install, and where every stop happened ─────────────────────

test("Joomla's own 403 on the installer is install_forbidden, not unreachable", async () => {
  const state = fakeInstaller({ installPage: 'joomla_403' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, {
    ok: false,
    reason: 'install_forbidden',
    detail: { at: 'install_page', check: 'joomla_denied', status: 403, path: '/administrator/index.php' }
  })
  assert.deepEqual(state.posts, [])
})

test("a web server's 403 on the installer is admin_gate", async () => {
  fakeInstaller({ installPage: 'server_403' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'admin_gate')
  assert.equal(result.detail.check, 'server_denied')
})

test('a 403 on the install POST itself is told apart the same way, not install_failed', async () => {
  // mod_security refusing the upload is the usual one; both roads are tried before giving up.
  const server = fakeInstaller({ installPost: 'server_403' })
  const gated = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(gated, {
    ok: false,
    reason: 'admin_gate',
    detail: {
      at: 'url_install',
      check: 'server_denied',
      status: 403,
      path: '/administrator/index.php',
      roads: { url_install: { post_status: 403 }, upload_install: { post_status: 403 } },
      package_bytes: 4
    }
  })
  assert.deepEqual(server.posts, ['upload', 'url'])
  fakeInstaller({ installPost: 'joomla_403' })
  const denied = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(denied.reason, 'install_forbidden')
  assert.equal(denied.detail.check, 'joomla_denied')
})

test('a 403 on the installer page the URL road reads again is told apart too', async () => {
  fakeInstaller({ uploadInstall: 'dropped', afterPost: 'joomla_403' })
  const denied = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(denied, {
    ok: false,
    reason: 'install_forbidden',
    detail: {
      at: 'install_page',
      check: 'joomla_denied',
      status: 403,
      path: '/administrator/index.php',
      roads: { upload_install: { post_status: 303, result_status: 403 } },
      package_bytes: 4
    }
  })
  fakeInstaller({ uploadInstall: 'dropped', afterPost: 'server_403' })
  const gated = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(gated.reason, 'admin_gate')
  assert.equal(gated.detail.check, 'server_denied')
})

test('a firewall named on the installer, its POST or the page read again is blocked_by_firewall', async () => {
  fakeInstaller({ installPage: 'cloudflare' })
  const page = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(page, {
    ok: false,
    reason: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'install_page', check: 'server_denied', status: 403, path: '/administrator/index.php' }
  })
  const posted = fakeInstaller({ installPost: 'cloudflare' })
  const post = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(post.reason, 'blocked_by_firewall')
  assert.equal(post.firewall, 'cloudflare')
  assert.equal(post.detail.at, 'url_install')
  assert.equal(post.detail.check, 'server_denied')
  assert.deepEqual(posted.posts, ['upload', 'url'])
  fakeInstaller({ uploadInstall: 'dropped', afterPost: 'cloudflare' })
  const again = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(again.reason, 'blocked_by_firewall')
  assert.equal(again.firewall, 'cloudflare')
  assert.equal(again.detail.at, 'install_page')
})

test('a challenge on the configure page after the install is blocked_by_firewall, not no_token', async () => {
  fakeInstaller({ configPage: 'cloudflare' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'blocked_by_firewall')
  assert.equal(result.firewall, 'cloudflare')
  assert.equal(result.detail.check, 'firewall')
  assert.equal(result.detail.status, 403)
  assert.equal(result.detail.path, '/administrator/index.php')
  // A plain 403 there names no firewall: the generic reason stays.
  fakeInstaller({ configPage: 'server_403' })
  const plain = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.notEqual(plain.reason, 'blocked_by_firewall')
  assert.equal(plain.firewall, undefined)
})

test('a challenge Cloudflare marks on a 200 installer page is blocked_by_firewall, not unreachable', async () => {
  fakeInstaller({ installPage: 'cloudflare_200' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, {
    ok: false,
    reason: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'install_page', check: 'firewall', status: 200, path: '/administrator/index.php' }
  })
})

test('engine doors that answer a challenge are blocked_by_firewall, at install and when the run asks', async () => {
  fakeInstaller({ engine: 'cloudflare' })
  const installed = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(installed.reason, 'blocked_by_firewall')
  assert.equal(installed.firewall, 'cloudflare')
  assert.equal(installed.detail.check, 'firewall')
  routes({ [FRONT_DOOR]: () => cloudflareChallenge(), [ADMIN_DOOR]: () => cloudflareChallenge() })
  const door = await joomla.resolveDoor(ROOT, TOKEN, { secondLookMs: 0 })
  assert.deepEqual(door, {
    refusal: 'blocked_by_firewall',
    firewall: 'cloudflare',
    detail: { at: 'api_door', check: 'firewall', status: 403, path: '/administrator/index.php' }
  })
  // Doors that answer a plain 404 stay cowork_not_answering.
  routes({
    [FRONT_DOOR]: () => new Response('<html>Not found</html>', { status: 404 }),
    [ADMIN_DOOR]: () => new Response('<html>Not found</html>', { status: 404 })
  })
  assert.equal((await joomla.resolveDoor(ROOT, TOKEN, { secondLookMs: 0 })).refusal, 'cowork_not_answering')
})

test('blocked_by_firewall has its own sentence on the Joomla path too', () => {
  assert.equal(refusal.importErrorKey('blocked_by_firewall'), 'import_error_blocked_by_firewall')
})

// Cloudflare's challenge covers the engine's door too, so "install Claude Cowork yourself" cannot get
// past it (measured on production: the door answered 403 `cf-mitigated: challenge` after a manual
// install). Its sentence says what to switch off; every other firewall keeps the shared sentence.
test('a Cloudflare block has its own sentence on both platforms; every other firewall keeps the shared one', () => {
  for (const platform of [undefined, 'wordpress', 'joomla']) {
    assert.equal(
      refusal.importErrorKey('blocked_by_firewall', { firewall: 'cloudflare', platform }),
      'import_error_blocked_by_cloudflare',
      String(platform)
    )
    for (const firewall of ['wordfence', 'sucuri', 'imunify360', 'modsecurity', 'firewall', undefined])
      assert.equal(
        refusal.importErrorKey('blocked_by_firewall', { firewall, platform }),
        'import_error_blocked_by_firewall',
        `${firewall} on ${platform}`
      )
  }
  // The firewall changes the sentence of a firewall block only.
  assert.equal(
    refusal.importErrorKey('install_failed', { firewall: 'cloudflare' }),
    'import_error_install_failed'
  )
})

test('isJoomlaPage reads the template assets, not the language', () => {
  assert.equal(joomla.isJoomlaPage(JOOMLA_403), true)
  assert.equal(
    joomla.isJoomlaPage('<link href="/administrator/templates/isis/css/template.css" rel="stylesheet">'),
    true
  )
  assert.equal(joomla.isJoomlaPage(SERVER_403), false)
})

test('an installer that answers with the login form says the session is gone', async () => {
  fakeInstaller({ installPage: 'login' })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'unreachable')
  assert.equal(result.detail.at, 'install_page')
  assert.equal(result.detail.check, 'left_installer')
})

test('a diagnostic carries no query value, cookie, token or password', async () => {
  const typed = `${ROOT}/administrator/index.php?secret=word`
  // The login page and the POST share one address; the POST answers 200 instead of redirecting.
  routes({
    [typed]: (init) =>
      init.method === 'POST'
        ? new Response('<html>no redirect</html>', { status: 200 })
        : new Response(JOOMLA_LOGIN, { headers: { 'set-cookie': 'sid=1; path=/' } })
  })
  const session = await joomla.loginToAdmin(typed, 'admin', 'pw-s3cret')
  assert.equal(session.reason, 'unreachable')
  assert.deepEqual(session.detail, {
    at: 'login_post',
    check: 'no_redirect',
    status: 200,
    path: '/administrator/index.php'
  })
  const text = JSON.stringify(session.detail)
  for (const secret of ['word', 'pw-s3cret', 'sid', CSRF]) assert.equal(text.includes(secret), false)
})

test('errorCode keeps a code and drops a message', () => {
  const cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.test'), { code: 'ENOTFOUND' })
  assert.equal(joomla.errorCode(new TypeError('fetch failed', { cause })), 'ENOTFOUND')
  assert.equal(joomla.errorCode(new DOMException('timeout', 'TimeoutError')), 'TimeoutError')
  assert.equal(joomla.errorCode(new Error('password=hunter2')), 'other')
  // A code of the right shape that is not a known network code is not passed through either.
  assert.equal(joomla.errorCode(Object.assign(new Error('x'), { code: 'hunter2' })), 'other')
  assert.equal(joomla.errorCode(Object.assign(new Error('x'), { name: 'hunter2' })), 'other')
})

test('a diagnostic path is one the importer asks for, after the site base path; anything else is dropped', async () => {
  const { diagnosticPath, diagnosticError } = await import('../src/host/diagnostic.mjs')
  assert.equal(
    diagnosticPath(`${ROOT}/administrator/index.php?secret=word`, ROOT),
    '/administrator/index.php'
  )
  assert.equal(
    diagnosticPath(`${ROOT}/office/administrator/index.php`, `${ROOT}/office`),
    '/administrator/index.php'
  )
  assert.equal(diagnosticPath(`${ROOT}/office/index.php`, '/office/'), '/index.php')
  // A renamed administrator folder or a gate's own page can be the secret itself.
  assert.equal(diagnosticPath(`${ROOT}/administrator/secret123`, ROOT), undefined)
  assert.equal(diagnosticPath(`${ROOT}/hunter2/index.php`, ROOT), undefined)
  assert.equal(diagnosticPath('not a url', ROOT), undefined)
  assert.equal(diagnosticError('hunter2'), 'other')
  assert.equal(diagnosticError(new Error('untrusted redirect target')), 'untrusted_redirect')
  const tls = Object.assign(new Error('x'), { code: 'CERT_HAS_EXPIRED' })
  assert.equal(diagnosticError(new TypeError('fetch failed', { cause: tls })), 'CERT_HAS_EXPIRED')
})

test('a gate that redirects to a page of its own names no path', async () => {
  routes({
    [`${ROOT}/administrator/`]: () =>
      new Response('', { status: 302, headers: { location: `${ROOT}/administrator/secret123` } }),
    [`${ROOT}/administrator/secret123`]: () => new Response(RSF_GATE)
  })
  const session = await joomla.loginToAdmin(`${ROOT}/administrator/`, 'admin', 'pw')
  assert.equal(session.reason, 'admin_gate')
  assert.deepEqual(session.detail, { at: 'login_page', check: 'admin_gate', status: 200 })
})

test('an installed component that refuses its own token says so in the diagnostic', async () => {
  fakeInstaller({})
  const original = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('option=com_claudecowork&task=api.exec'))
      return withUrl(new Response('{"ok":false}', { status: 401 }), String(url))
    return original(url, init)
  }
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  // Landed (it has a token) but answers neither door: not "the site refused the install".
  assert.deepEqual(result, {
    ok: false,
    reason: 'install_failed',
    detail: {
      at: 'url_install',
      check: 'not_answering',
      status: 200,
      path: '/administrator/index.php',
      roads: {
        url_install: { post_status: 303, result_status: 200 },
        upload_install: { post_status: 303, result_status: 200 }
      },
      package_bytes: 4
    }
  })
})

// ── 3. HTTP Basic, and no door at all ───────────────────────────────────────────────────────

/** Front door gated (HTML), admin door behind Basic. */
function gatedDoors(seen) {
  return routes(
    {
      [FRONT_DOOR]: () => new Response('<html>Coming soon</html>'),
      [ADMIN_DOOR]: (init) =>
        headerOf(init, 'authorization') === BASIC.authorization
          ? new Response(JSON.stringify({ ok: true, info: { component: LATEST } }))
          : new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Basic' } })
    },
    seen
  )
}

test('the Basic credential reaches the administrator door', async () => {
  const seen = gatedDoors([])
  const door = await joomla.resolveDoor(ROOT, TOKEN, { headers: BASIC })
  assert.deepEqual(door, { endpoint: ADMIN_DOOR, inline: false })
  assert.ok(seen.every((one) => headerOf(one.init, 'authorization') === BASIC.authorization))
})

test('without it, a Basic challenge asks for the extra password', async () => {
  const seen = gatedDoors([])
  // Both doors failing, asked twice, is a stop the operator is told about: which door, what it answered.
  assert.deepEqual(await joomla.resolveDoor(ROOT, TOKEN, { secondLookMs: 0 }), {
    refusal: 'basic_auth_required',
    detail: { at: 'api_door', check: 'basic_challenge', status: 401, path: '/administrator/index.php' }
  })
  assert.equal(seen.length, 4)
})

test('a door dying on a parse error is php_too_old', async () => {
  routes({
    [FRONT_DOOR]: () => new Response(PARSE_ERROR, { status: 500 }),
    [ADMIN_DOOR]: () => new Response('{"error":true,"code":403}', { status: 403 })
  })
  assert.deepEqual(await joomla.resolveDoor(ROOT, TOKEN, { secondLookMs: 0 }), {
    refusal: 'php_too_old',
    detail: { at: 'api_door', check: 'parse_error', status: 500, path: '/index.php' }
  })
})

test('a site with an open front door still goes through it, Basic or not', async () => {
  routes({ [FRONT_DOOR]: () => new Response(JSON.stringify({ ok: true, info: { component: LATEST } })) })
  assert.deepEqual(await joomla.resolveDoor(ROOT, TOKEN, { headers: BASIC }), {
    endpoint: FRONT_DOOR,
    inline: false
  })
})

test('no answer at all, asked twice, is cowork_not_answering with check network', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('fetch failed')
  }
  assert.deepEqual(await joomla.resolveDoor(ROOT, TOKEN, { secondLookMs: 0 }), {
    refusal: 'cowork_not_answering',
    detail: { at: 'api_door', check: 'network', path: '/administrator/index.php' }
  })
  assert.equal(calls, 4)
})

test('every export call carries the Basic credential', async () => {
  const seen = []
  globalThis.fetch = async (url, init = {}) => {
    seen.push(headerOf(init, 'authorization'))
    const sent = JSON.parse(init.body)
    if (sent.action === 'db.tables') return new Response(JSON.stringify({ ok: true, tables: ['t'] }))
    if (sent.action === 'db.dump')
      return new Response(
        JSON.stringify({ ok: true, sql_b64: '', next_cursor: null, done: true, rows: 0, total: 0 })
      )
    throw new TypeError(`unexpected ${sent.action}`)
  }
  const artifacts = { signPut: async () => ({ key: 'db-1', url: 'https://store.test/db-1' }) }
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) =>
    String(url).startsWith('https://store.test/') ? new Response('', { status: 200 }) : original(url, init)
  await exporter.exportDatabase(ADMIN_DOOR, TOKEN, artifacts, undefined, { headers: BASIC })
  assert.deepEqual(seen, [BASIC.authorization, BASIC.authorization])
})

test('an export call that dies on a parse error is php_too_old, asked once', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(PARSE_ERROR, { status: 500 })
  }
  await assert.rejects(
    exporter.exportDatabase(FRONT_DOOR, TOKEN, {}),
    (error) => error.name === 'ExportFailed' && error.reason === 'php_too_old'
  )
  assert.equal(calls, 1)
})

// ── The sentences ───────────────────────────────────────────────────────────────────────────

test('each new reason has its own sentence, never the generic one', () => {
  for (const code of [
    'admin_gate',
    'admin_form_not_found',
    'tls_invalid',
    'cowork_not_answering',
    'php_too_old'
  ])
    assert.equal(refusal.importErrorKey(code), `import_error_${code}`)
})

test('an install stopped by a host limit names the limit, not "install it yourself"', () => {
  assert.equal(
    refusal.importErrorKey('site_resource_limit', { check: 'memory_exhausted' }),
    'import_error_install_memory'
  )
  // Reading the site out of resources keeps its own sentence.
  assert.equal(refusal.importErrorKey('site_resource_limit'), 'import_error_site_resource_limit')
  // A site that stopped answering mid-read has its own sentence (#1616).
  assert.equal(refusal.importErrorKey('site_offline'), 'import_error_site_offline')
  assert.equal(
    refusal.importErrorKey('install_failed', { check: 'not_installed' }),
    'import_error_install_unexplained'
  )
  assert.equal(
    refusal.importErrorKey('install_failed', { check: 'not_answering' }),
    'import_error_install_unexplained'
  )
  // WordPress and a package Tracy could not fetch keep the sentence they had.
  assert.equal(refusal.importErrorKey('install_failed'), 'import_error_install_failed')
  assert.equal(
    refusal.importErrorKey('install_failed', { check: 'not_downloaded' }),
    'import_error_install_failed'
  )
  assert.equal(
    refusal.importErrorKey('upload_too_large', { check: 'over_limit' }),
    'import_error_upload_too_large'
  )
  const t = (key, params) => `${key}${params ? JSON.stringify(params) : ''}`
  assert.equal(
    refusal.uploadSizesText({ packageMb: '60', limitMb: '8' }, t),
    'import_error_upload_sizes{"package":"60","limit":"8"}'
  )
  assert.equal(refusal.uploadSizesText({ check: 'too_large' }, t), '')
})

test('php_too_old names the versions it learnt', () => {
  const t = (key, params) => `${key}${params ? JSON.stringify(params) : ''}`
  assert.equal(
    refusal.phpVersionsText({ php: '7.2.34', minimumPhp: '7.4' }, t),
    'import_error_php_versions{"php":"7.2.34","minimum":"7.4"}'
  )
  assert.equal(refusal.phpVersionsText({ minimumPhp: '7.4' }, t), 'import_error_php_minimum{"minimum":"7.4"}')
  assert.equal(refusal.phpVersionsText(null, t), '')
})
