#!/usr/bin/env node
/**
 * The Joomla import names the real reason when signing in or carrying data fails.
 *
 *   1. A second factor: Joomla 3's `secretkey` field left empty, and Joomla 4+'s captive MFA page,
 *      are `mfa_required`, never a wrong password, and the password is posted once.
 *   2. An account without administrator access is `no_backend_access` in any backend language:
 *      Joomla's message is read in the site's own words (its language file), not in English only.
 *   3. Cookies are kept per site and path across the sign-in and the installer: a cookie set on
 *      one page is not dropped by the next, and none reaches another site.
 *   4. The database dump keeps its bytes: a binary column is not decoded as UTF-8 on the way.
 *   5. An upload refused with HTTP 413 is `upload_too_large`, not a generic install failure.
 *
 * Same harness as `import-gates.test.mjs`: the real modules bundled with esbuild,
 * `globalThis.fetch` replaced by a fake Joomla.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let joomla
let exporter
let jarModule
let refusal
let diagnostic
let webDiagnostic
let run
const realFetch = globalThis.fetch

async function bundle(entry, { inlinePackages = false } = {}) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
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
  jarModule = await bundle('src/host/cookie-jar.ts')
  refusal = await bundle('src/client/refusal.tsx', { inlinePackages: true })
  run = await bundle('src/host/run.ts', { inlinePackages: true })
  diagnostic = await import(path.join(pkgRoot, 'src/host/diagnostic.mjs'))
  webDiagnostic = await import(path.join(pkgRoot, '../../../apps/tracy-web/src/lib/import-diagnostic.js'))
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

function withUrl(response, url) {
  Object.defineProperty(response, 'url', { value: url })
  return response
}

const headerOf = (init, name) => {
  const headers = init.headers ?? {}
  return headers instanceof Headers ? headers.get(name) : headers[name]
}

/** A Response with several Set-Cookie headers. */
function withCookies(body, cookies, init = {}) {
  const headers = new Headers(init.headers ?? {})
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(body, { ...init, headers })
}

/** A fetch that answers from a table of `url → (init) => Response`, and throws for anything else. */
function routes(table, seen = []) {
  globalThis.fetch = async (url, init = {}) => {
    const key = String(url)
    seen.push({ url: key, method: init.method ?? 'GET', cookie: headerOf(init, 'cookie') ?? '' })
    const route = table[key]
    if (!route) throw new TypeError(`fetch failed: no route for ${init.method ?? 'GET'} ${key}`)
    return withUrl(await route(init), key)
  }
  return seen
}

/** Joomla 3's administrator login page (Isis), with the two-factor field when `secretkey`. */
function j3Login({ lang = 'en-gb', secretkey = false, message = '' } = {}) {
  const alert = message
    ? `<div id="system-message-container"><div class="alert alert-warning"><h4 class="alert-heading">!</h4><div><div class="alert-message">${message}</div></div></div></div>`
    : ''
  return `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}" dir="ltr"><head><title>Administration</title><link href="/administrator/templates/isis/css/template.css" rel="stylesheet"></head><body>${alert}<form action="/administrator/index.php" method="post" id="form-login"><input name="username"><input name="passwd" type="password">${secretkey ? '<input name="secretkey" autocomplete="one-time-code" type="text">' : ''}<input type="hidden" name="option" value="com_login"><input type="hidden" name="task" value="login"><input type="hidden" name="${CSRF}" value="1"></form></body></html>`
}

/** Joomla 4+'s administrator login page (Atum): its messages ride in the script options, as JSON. */
function j4Login({ lang = 'en-gb', warning } = {}) {
  const options = warning
    ? `<script type="application/json" class="joomla-script-options new">${JSON.stringify({ 'joomla.messages': [{ warning: [warning] }] }).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}</script>`
    : ''
  return `<!DOCTYPE html><html lang="${lang}" dir="ltr"><head><title>Administration</title><link href="/media/templates/administrator/atum/css/template.min.css" rel="stylesheet">${options}</head><body><form action="/administrator/index.php" method="post" id="form-login"><input name="username"><input name="passwd" type="password"><input type="hidden" name="option" value="com_login"><input type="hidden" name="task" value="login"><input type="hidden" name="${CSRF}" value="1"></form></body></html>`
}

/**
 * A Joomla that serves `loginPage` on GET, 303s the POST back to the administrator, and serves
 * `landing` there. `languageFiles`: `url → ini text` the site serves.
 */
function signIn({ loginPage, landing, location = ADMIN, languageFiles = {} }) {
  let posted = false
  const table = {
    [ADMIN]: (init) => {
      if (init.method === 'POST') {
        posted = true
        return new Response('', { status: 303, headers: { location } })
      }
      return posted
        ? new Response(landing, { headers: { 'set-cookie': 'sid=2; path=/' } })
        : new Response(loginPage, { headers: { 'set-cookie': 'sid=1; path=/' } })
    }
  }
  for (const [url, ini] of Object.entries(languageFiles)) table[url] = () => new Response(ini)
  if (location !== ADMIN) table[location] = () => new Response(landing)
  return routes(table)
}

const posts = (seen) => seen.filter((call) => call.method === 'POST').length

// ── 1. A second factor ──────────────────────────────────────────────────────────────────────

test('Joomla 3 with two-factor on: an empty Secret Key is mfa_required, posted once', async () => {
  // JGLOBAL_AUTH_INVALID_SECRETKEY, en-GB (Joomla 3.10.12).
  const seen = signIn({
    loginPage: j3Login({ secretkey: true }),
    landing: j3Login({ secretkey: true, message: 'The two factor authentication Secret Key is invalid.' })
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'right-password')
  assert.equal(session.reason, 'mfa_required')
  assert.deepEqual(session.detail, { at: 'login_landing', check: 'mfa' })
  assert.equal(posts(seen), 1)
})

test('Joomla 3 two-factor in German is read in the site’s own words', async () => {
  const seen = signIn({
    loginPage: j3Login({ lang: 'de-de', secretkey: true }),
    landing: j3Login({
      lang: 'de-de',
      secretkey: true,
      message: 'Der geheime Schlüssel der Zwei-Faktor-Authentifizierung ist ungültig.'
    }),
    languageFiles: {
      [`${ROOT}/administrator/language/de-DE/de-DE.ini`]:
        'JGLOBAL_AUTH_INVALID_PASS="Benutzername und Passwort passen nicht."\nJGLOBAL_AUTH_INVALID_SECRETKEY="Der geheime Schlüssel der Zwei-Faktor-Authentifizierung ist ungültig."\n'
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'right-password')
  assert.equal(session.reason, 'mfa_required')
  assert.equal(posts(seen), 1)
})

test('Joomla 4+ MFA: a captive page after the right password is mfa_required, not signed in', async () => {
  const captive = `${ADMIN}?option=com_users&view=captive`
  const seen = signIn({
    loginPage: j4Login(),
    location: captive,
    // The captive page carries the logout link every admin template ships.
    landing:
      '<html><body><a href="index.php?option=com_login&amp;task=logout">Log out</a><form action="index.php?option=com_users&amp;task=captive.validate"></form></body></html>'
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'right-password')
  assert.equal(session.reason, 'mfa_required')
  assert.equal(posts(seen), 1)
})

test('a wrong password on a German site is still invalid_credential', async () => {
  signIn({
    loginPage: j3Login({ lang: 'de-de', secretkey: true }),
    landing: j3Login({ lang: 'de-de', secretkey: true, message: 'Benutzername und Passwort passen nicht.' }),
    languageFiles: {
      [`${ROOT}/administrator/language/de-DE/de-DE.ini`]:
        'JGLOBAL_AUTH_INVALID_PASS="Benutzername und Passwort passen nicht."\nJGLOBAL_AUTH_INVALID_SECRETKEY="Der geheime Schlüssel ist ungültig."\nJERROR_LOGIN_DENIED="Sie haben keinen Zugriff."\n'
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'wrong')
  assert.deepEqual(session, {
    ok: false,
    reason: 'invalid_credential',
    detail: { at: 'login_landing', check: 'invalid_credential' }
  })
})

test('a non-English site whose language file cannot be read says the message was not read', async () => {
  signIn({
    loginPage: j4Login({ lang: 'pl-pl' }),
    landing: j4Login({ lang: 'pl-pl', warning: 'Nie masz dostępu do panelu administracyjnego.' })
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(session.reason, 'invalid_credential')
  assert.deepEqual(session.detail, { at: 'login_landing', check: 'message_unread' })
})

// ── 2. No administrator access, in the backend's language ───────────────────────────────────

test('no administrator access on a German Joomla 6 is no_backend_access', async () => {
  const denied = 'Sie haben keinen Zugriff auf den Administrationsbereich dieser Website.'
  const seen = signIn({
    loginPage: j4Login({ lang: 'de-de' }),
    landing: j4Login({ lang: 'de-de', warning: denied }),
    languageFiles: {
      [`${ROOT}/administrator/language/de-DE/joomla.ini`]: `JERROR_LOGIN_DENIED="${denied}"\nJGLOBAL_AUTH_INVALID_PASS="Benutzername und Passwort passen nicht."\n`
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'editor', 'right-password')
  assert.deepEqual(session, {
    ok: false,
    reason: 'no_backend_access',
    detail: { at: 'login_landing', check: 'no_backend_access' }
  })
  assert.equal(posts(seen), 1)
  // The language file is fetched without the site's session cookie.
  const ini = seen.find((call) => call.url.endsWith('/joomla.ini'))
  assert.equal(ini.cookie, '')
})

test('no administrator access on a French Joomla 3 is no_backend_access ("_QQ_", escaped quotes)', async () => {
  signIn({
    loginPage: j3Login({ lang: 'fr-fr' }),
    landing: j3Login({
      lang: 'fr-fr',
      message: 'Vous n&#039;avez pas accès à la partie &quot;administration&quot; de ce site.'
    }),
    languageFiles: {
      [`${ROOT}/administrator/language/fr-FR/fr-FR.ini`]:
        'JERROR_LOGIN_DENIED="Vous n\'avez pas accès à la partie "_QQ_"administration"_QQ_" de ce site."\n'
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'editor', 'right-password')
  assert.equal(session.reason, 'no_backend_access')
})

test('the language tag is never used to build a path outside the language folder', () => {
  assert.equal(joomla.languageTagOf('<html lang="de-de">'), 'de-DE')
  assert.equal(joomla.languageTagOf('<html lang="sr-yu">'), 'sr-YU')
  assert.equal(joomla.languageTagOf('<html lang="../../x">'), undefined)
  assert.equal(joomla.languageTagOf('<html>'), undefined)
})

// ── 2b. Joomla 3 refuses on the login POST itself ───────────────────────────────────────────
//
// Joomla 3.10's `LoginController::login()` redirects only on success: a refused sign-in falls
// through to `display()`, a 200 that draws the login form again with the message queued. Production
// read that 200 as `unreachable`/`no_redirect` (a Joomla 3.10.11 import).

/** A Joomla 3 that serves `loginPage` on GET and answers the POST with `refused`, a 200. */
function signInJ3({ loginPage = j3Login(), refused, languageFiles = {} }) {
  const table = {
    [ADMIN]: (init) =>
      init.method === 'POST'
        ? new Response(refused, { headers: { 'set-cookie': 'sid=2; path=/' } })
        : new Response(loginPage, { headers: { 'set-cookie': 'sid=1; path=/' } })
  }
  for (const [url, ini] of Object.entries(languageFiles)) table[url] = () => new Response(ini)
  return routes(table)
}

test('Joomla 3 answering a wrong password with a 200 is invalid_credential, with the email shape kept', async () => {
  const refused = j3Login({
    message: 'Username and password do not match or you do not have an account yet.'
  })
  for (const [username, isEmail] of [
    ['owner@shop.example', true],
    ['admin', false]
  ]) {
    const seen = signInJ3({ refused })
    const session = await joomla.loginToAdmin(ADMIN, username, 'wrong')
    assert.deepEqual(session, {
      ok: false,
      reason: 'invalid_credential',
      detail: { at: 'login_post', check: 'invalid_credential' }
    })
    assert.equal(posts(seen), 1)
    // The run's diagnostic carries the username's shape, never its value.
    const detail = run.signInRefusal(session.reason, session.detail, username)
    assert.deepEqual(detail, { at: 'login_post', check: 'invalid_credential', username_is_email: isEmail })
    assert.ok(!JSON.stringify(detail).includes(username))
  }
})

test('Joomla 3 answering an account without administrator access with a 200 is no_backend_access', async () => {
  signInJ3({
    refused: j3Login({ message: 'You do not have access to the Administrator section of this site.' })
  })
  const session = await joomla.loginToAdmin(ADMIN, 'editor', 'right-password')
  assert.deepEqual(session, {
    ok: false,
    reason: 'no_backend_access',
    detail: { at: 'login_post', check: 'no_backend_access' }
  })
  assert.equal(run.signInRefusal(session.reason, session.detail, 'editor').username_is_email, false)
})

test('Joomla 3 answering a missing Secret Key with a 200 is mfa_required', async () => {
  signInJ3({
    loginPage: j3Login({ secretkey: true }),
    refused: j3Login({ secretkey: true, message: 'The two factor authentication Secret Key is invalid.' })
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'right-password'), {
    ok: false,
    reason: 'mfa_required',
    detail: { at: 'login_post', check: 'mfa' }
  })
})

test('a German Joomla 3 refusing on a 200 is read through its language file', async () => {
  const seen = signInJ3({
    loginPage: j3Login({ lang: 'de-de' }),
    refused: j3Login({ lang: 'de-de', message: DE_WRONG }),
    languageFiles: { [DE_INI_J3]: DE_FULL }
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'wrong'), {
    ok: false,
    reason: 'invalid_credential',
    detail: { at: 'login_post', check: 'invalid_credential' }
  })
  assert.ok(languageReads(seen).some((call) => call.url === DE_INI_J3))
})

test('a Joomla 3 login form again with no message to read is message_unread, not unreachable', async () => {
  signInJ3({ refused: j3Login() })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), {
    ok: false,
    reason: 'invalid_credential',
    detail: { at: 'login_post', check: 'message_unread' }
  })
})

test("a 200 on the login POST that is not Joomla's login form stays unreachable/no_redirect", async () => {
  for (const refused of [
    '<html>ok</html>',
    // A sign-in form some other page draws, with the sentence, but not Joomla's template.
    '<html lang="en-gb"><div class="alert-message">Username and password do not match</div><form id="form-login"><input name="passwd" type="password"></form></html>',
    // RSFirewall's Protected Area, drawn by Joomla's admin template, asking a password of its own.
    '<html><link href="/administrator/templates/isis/css/template.css" rel="stylesheet"><form method="post"><input type="password" name="rsf_backend_password"></form></html>'
  ]) {
    signInJ3({ refused })
    assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), {
      ok: false,
      reason: 'unreachable',
      detail: { at: 'login_post', check: 'no_redirect', status: 200, path: '/administrator/index.php' }
    })
  }
})

// ── 3. Cookies across the sign-in ───────────────────────────────────────────────────────────

test('two cookies on the login page both survive the login POST that renews one of them', async () => {
  const landingUrl = `${ADMIN}?option=com_cpanel`
  routes({
    [ADMIN]: (init) =>
      init.method === 'POST'
        ? withCookies('', ['sid=2; path=/; HttpOnly'], { status: 303, headers: { location: landingUrl } })
        : withCookies(j4Login(), ['sid=1; path=/', 'lb=node7; path=/']),
    // The balancer sends a request without its cookie to another node, which knows no session.
    [landingUrl]: (init) => {
      const cookie = headerOf(init, 'cookie') ?? ''
      return new Response(
        cookie.includes('sid=2') && cookie.includes('lb=node7')
          ? '<a href="index.php?option=com_login&amp;task=logout">x</a>'
          : j4Login()
      )
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(session.ok, true, JSON.stringify(session))
})

test('a cookie set on the landing redirect, from bare host to www, stays with the session', async () => {
  const www = 'https://www.example.test/administrator/index.php?option=com_cpanel'
  routes({
    [ADMIN]: (init) =>
      init.method === 'POST'
        ? withCookies('', ['sid=2; path=/'], {
            status: 303,
            headers: { location: `${ADMIN}?option=com_cpanel` }
          })
        : withCookies(j4Login(), ['sid=1; path=/']),
    [`${ADMIN}?option=com_cpanel`]: () =>
      withCookies('', ['edge=e1; path=/'], { status: 301, headers: { location: www } }),
    [www]: (init) => {
      const cookie = headerOf(init, 'cookie') ?? ''
      return new Response(
        cookie.includes('sid=2') && cookie.includes('edge=e1')
          ? '<a href="index.php?option=com_login&amp;task=logout">x</a>'
          : j4Login()
      )
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(session.ok, true, JSON.stringify(session))
  assert.match(session.cookie, /sid=2/)
  assert.match(session.cookie, /edge=e1/)
})

test('a page that sets an unrelated cookie does not sign the installer out', async () => {
  const optionsUrl = `${ADMIN}?option=com_config&view=component&component=com_claudecowork`
  const installUrl = `${ADMIN}?option=com_installer&view=install`
  const seen = routes({
    // The options page sets a language cookie of its own and has no token yet.
    [optionsUrl]: () => withCookies('', ['lang_pref=de; path=/']),
    [installUrl]: (init) => {
      const cookie = headerOf(init, 'cookie') ?? ''
      return new Response(
        cookie.includes('joomla_session=abc')
          ? `<a href="index.php?option=com_login&amp;task=logout">x</a><form><input type="hidden" name="${CSRF}" value="1"></form>`
          : j4Login()
      )
    },
    [`${ADMIN}?option=com_admin&view=sysinfo&layout=phpinfo`]: () =>
      new Response('<h1 class="p">PHP Version 8.3.0</h1>')
  })
  // The install POST is not routed: reaching it at all proves the session was kept.
  const result = await joomla.installCowork(
    { ok: true, cookie: 'joomla_session=abc', authHeader: {}, webRootUrl: ROOT },
    PACKAGE_URL,
    LATEST
  )
  assert.notEqual(result.detail?.check, 'signed_out', JSON.stringify(result))
  const installGets = seen.filter((call) => call.url === installUrl && call.method === 'GET')
  assert.ok(installGets.length > 0)
  for (const call of installGets) assert.match(call.cookie, /joomla_session=abc/)
})

test('the cookie jar keeps one site, its paths and Secure, and nothing else', () => {
  const { CookieJar } = jarModule
  const jar = new CookieJar()
  jar.absorb(
    withCookies('', [
      'sid=1; Path=/',
      'admin_only=a; Path=/administrator',
      'tight=t; Path=/administrator/index.php/x',
      'safe=s; Path=/; Secure',
      'stranger=x; Domain=other.test; Path=/',
      'gone=old; Path=/'
    ]),
    'https://example.test/administrator/index.php'
  )
  jar.absorb(withCookies('', ['gone=deleted; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT']), `${ROOT}/`)
  jar.absorb(withCookies('', ['sid=2; Path=/']), 'https://www.example.test/')
  assert.equal(jar.header('https://example.test/administrator/index.php'), 'admin_only=a; safe=s; sid=2')
  // www and the bare host are one site.
  assert.equal(jar.header('https://www.example.test/'), 'safe=s; sid=2')
  // No Secure cookie on http, no cookie for another site.
  assert.equal(jar.header('http://example.test/'), 'sid=2')
  assert.equal(jar.header('https://other.test/'), '')
  assert.equal(jar.header('https://evil-example.test/'), '')
  assert.equal(CookieJar.fromHeader('a=1; b=2', ROOT).header(`${ROOT}/x`), 'a=1; b=2')
})

// ── 4. The database dump keeps its bytes ────────────────────────────────────────────────────

test('a binary column survives the dump byte for byte', async () => {
  // A BLOB as the engine writes it: raw bytes inside a quoted literal, escaped but not encoded.
  const first = Buffer.concat([
    Buffer.from("INSERT INTO `t` VALUES (1,'"),
    Buffer.from([0xff, 0xfe, 0x80, 0xc3]),
    Buffer.from("');\n")
  ])
  const second = Buffer.concat([
    Buffer.from("INSERT INTO `t` VALUES (2,'"),
    Buffer.from([0xc3]),
    Buffer.from("');\n")
  ])
  let stored
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://store.test/')) {
      stored = Buffer.from(init.body)
      return new Response('', { status: 200 })
    }
    const sent = JSON.parse(init.body)
    if (sent.action === 'db.tables') return new Response(JSON.stringify({ ok: true, tables: ['t'] }))
    const done = sent.params.cursor === 'c1'
    return new Response(
      JSON.stringify({
        ok: true,
        sql_b64: (done ? second : first).toString('base64'),
        next_cursor: done ? null : 'c1',
        done,
        rows: 1,
        total: 2
      })
    )
  }
  const artifacts = { signPut: async () => ({ key: 'db-1', url: 'https://store.test/db-1' }) }
  const result = await exporter.exportDatabase(`${ROOT}/door`, TOKEN, artifacts)
  const expected = Buffer.concat([first, second])
  assert.deepEqual(gunzipSync(stored), expected)
  assert.equal(result.bytes, expected.length)
})

// ── 5. An upload too large for the web server ───────────────────────────────────────────────

test('an upload refused with 413 is upload_too_large, with where it stopped', async () => {
  // The URL road is still asked after the 413 (#1568): the site's own download carries no body.
  const installUrl = `${ADMIN}?option=com_installer&view=install`
  const state = { posts: [] }
  const SESSION = { ok: true, cookie: 'joomla_session=abc', authHeader: {}, webRootUrl: ROOT }
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const method = init.method ?? 'GET'
    if (url === installUrl) {
      if (method === 'POST') {
        const kind = init.body instanceof FormData ? 'upload' : 'url'
        state.posts.push(kind)
        if (kind === 'upload')
          return withUrl(
            new Response(
              '<html><head><title>413 Request Entity Too Large</title></head><body>nginx</body></html>',
              {
                status: 413
              }
            ),
            url
          )
        return withUrl(new Response('', { status: 303, headers: { location: url } }), url)
      }
      return withUrl(new Response(`<form><input type="hidden" name="${CSRF}" value="1"></form>`), url)
    }
    if (url.includes('sysinfo')) return withUrl(new Response('<p>disabled</p>'), url)
    if (url.startsWith(`${ADMIN}?option=com_config`)) return withUrl(new Response(''), url)
    if (url === PACKAGE_URL) return withUrl(new Response(new Uint8Array(4)), url)
    throw new TypeError(`fetch failed: no route for ${method} ${url}`)
  }
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, {
    ok: false,
    reason: 'upload_too_large',
    detail: {
      at: 'upload_install',
      check: 'too_large',
      status: 413,
      path: '/administrator/index.php',
      roads: {
        url_install: { post_status: 303, result_status: 200 },
        upload_install: { post_status: 413, cause: 'too_large' }
      },
      package_bytes: 4
    }
  })
  assert.deepEqual(state.posts, ['upload', 'url'])
})

test('a 413 decides the outcome: only the URL road is asked after it', async () => {
  const installUrl = `${ADMIN}?option=com_installer&view=install`
  const SESSION = { ok: true, cookie: 'joomla_session=abc', authHeader: {}, webRootUrl: ROOT }
  let refused = false
  const after = []
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const method = init.method ?? 'GET'
    if (refused) {
      after.push(`${method} ${url}`)
      throw new TypeError('fetch failed: the site went away')
    }
    if (url === installUrl) {
      if (method === 'POST') {
        if (init.body instanceof FormData) {
          refused = true
          return withUrl(new Response('<title>413 Request Entity Too Large</title>', { status: 413 }), url)
        }
        return withUrl(new Response('', { status: 303, headers: { location: url } }), url)
      }
      return withUrl(new Response(`<form><input type="hidden" name="${CSRF}" value="1"></form>`), url)
    }
    if (url.includes('sysinfo')) return withUrl(new Response('<p>disabled</p>'), url)
    if (url.startsWith(`${ADMIN}?option=com_config`)) return withUrl(new Response(''), url)
    if (url === PACKAGE_URL) return withUrl(new Response(new Uint8Array(4)), url)
    throw new TypeError(`fetch failed: no route for ${method} ${url}`)
  }
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.reason, 'upload_too_large')
  // The installer page read again for the URL road; it went away, and the 413 still decides.
  assert.deepEqual(after, [`GET ${installUrl}`])
})

test('a 403 on the upload POST decides the outcome the same way: only the URL road is asked after it', async () => {
  const installUrl = `${ADMIN}?option=com_installer&view=install`
  const SESSION = { ok: true, cookie: 'joomla_session=abc', authHeader: {}, webRootUrl: ROOT }
  let refused = false
  const after = []
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const method = init.method ?? 'GET'
    if (refused) {
      after.push(`${method} ${url}`)
      throw new TypeError('fetch failed: the site went away')
    }
    if (url === installUrl) {
      if (method === 'POST') {
        if (init.body instanceof FormData) {
          refused = true
          return withUrl(new Response('<h1>Forbidden</h1>mod_security', { status: 403 }), url)
        }
        return withUrl(new Response('', { status: 303, headers: { location: url } }), url)
      }
      return withUrl(new Response(`<form><input type="hidden" name="${CSRF}" value="1"></form>`), url)
    }
    if (url.includes('sysinfo')) return withUrl(new Response('<p>disabled</p>'), url)
    if (url.startsWith(`${ADMIN}?option=com_config`)) return withUrl(new Response(''), url)
    if (url === PACKAGE_URL) return withUrl(new Response(new Uint8Array(4)), url)
    throw new TypeError(`fetch failed: no route for ${method} ${url}`)
  }
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  // The page names ModSecurity, so the firewall is named rather than called a security extension.
  assert.equal(result.reason, 'blocked_by_firewall')
  assert.equal(result.firewall, 'modsecurity')
  assert.equal(result.detail.check, 'server_denied')
  assert.deepEqual(after, [`GET ${installUrl}`])
})

// ── The closed sets and the sentences ───────────────────────────────────────────────────────

test('the new checks are known on both sides of the diagnostic', () => {
  for (const check of ['too_large', 'message_unread', 'firewall']) {
    assert.ok(diagnostic.DIAGNOSTIC_CHECKS.has(check), check)
    assert.ok(webDiagnostic.DIAGNOSTIC_CHECKS.has(check), check)
  }
  assert.deepEqual([...diagnostic.DIAGNOSTIC_CHECKS].sort(), [...webDiagnostic.DIAGNOSTIC_CHECKS].sort())
  assert.deepEqual([...diagnostic.DIAGNOSTIC_STEPS].sort(), [...webDiagnostic.DIAGNOSTIC_STEPS].sort())
})

test('upload_too_large has its own sentence', () => {
  assert.equal(refusal.importErrorKey('upload_too_large'), 'import_error_upload_too_large')
})

// ── Council round: only a recognised message is a verdict ───────────────────────────────────

const DE_INI = `${ROOT}/administrator/language/de-DE/joomla.ini`
const DE_INI_J3 = `${ROOT}/administrator/language/de-DE/de-DE.ini`
const DE_WRONG = 'Benutzername und Passwort passen nicht oder Sie haben noch kein Benutzerkonto.'
const DE_DENIED = 'Sie haben keinen Zugriff auf den Administrationsbereich dieser Website.'
const DE_FULL = `JGLOBAL_AUTH_INVALID_PASS="${DE_WRONG}"\nJGLOBAL_AUTH_NO_USER="${DE_WRONG}"\nJERROR_LOGIN_DENIED="${DE_DENIED}"\nJGLOBAL_AUTH_INVALID_SECRETKEY="Der geheime Schlüssel ist ungültig."\n`
const languageReads = (seen) => seen.filter((call) => call.url.includes('/language/'))
const unread = {
  ok: false,
  reason: 'invalid_credential',
  detail: { at: 'login_landing', check: 'message_unread' }
}
const wrong = {
  ok: false,
  reason: 'invalid_credential',
  detail: { at: 'login_landing', check: 'invalid_credential' }
}

test('an English wrong-password message is invalid_credential', async () => {
  signIn({
    loginPage: j3Login(),
    landing: j3Login({ message: 'Username and password do not match or you do not have an account yet.' })
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'wrong'), wrong)
})

test('an English page whose message is not one Tracy knows is message_unread, with no file read', async () => {
  const seen = signIn({ loginPage: j4Login(), landing: j4Login({ warning: 'Your session has expired.' }) })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), unread)
  assert.equal(languageReads(seen).length, 0)
})

test('a page without a language tag is message_unread, with no file read', async () => {
  const landing = j4Login({ warning: DE_WRONG }).replace(/ lang="[^"]*"/, '')
  const seen = signIn({ loginPage: j4Login(), landing, languageFiles: { [DE_INI]: DE_FULL } })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), unread)
  assert.equal(languageReads(seen).length, 0)
})

test('a non-English message that matches no known sentence is message_unread', async () => {
  signIn({
    loginPage: j4Login({ lang: 'de-de' }),
    landing: j4Login({ lang: 'de-de', warning: 'Ihre Sitzung ist abgelaufen.' }),
    languageFiles: { [DE_INI]: DE_FULL }
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), unread)
})

test('a language file without the wrong-password sentence never proves a wrong password', async () => {
  signIn({
    loginPage: j4Login({ lang: 'de-de' }),
    landing: j4Login({ lang: 'de-de', warning: DE_WRONG }),
    languageFiles: { [DE_INI]: `JERROR_LOGIN_DENIED="${DE_DENIED}"\n` }
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), unread)
})

test('the German wrong-password sentence from joomla.ini is invalid_credential', async () => {
  signIn({
    loginPage: j4Login({ lang: 'de-de' }),
    landing: j4Login({ lang: 'de-de', warning: DE_WRONG }),
    languageFiles: { [DE_INI]: DE_FULL }
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), wrong)
})

test('only the message counts: the denied sentence in a script or an attribute is not a verdict', async () => {
  const decoy = `<script>var help = "You do not have access to the Administrator section of this site."</script><a title="${DE_DENIED}" href="#">?</a>`
  signIn({
    loginPage: j3Login(),
    landing: j3Login({
      message: 'Username and password do not match or you do not have an account yet.'
    }).replace('</head>', `${decoy}</head>`)
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), wrong)
  signIn({
    loginPage: j4Login({ lang: 'de-de' }),
    landing: j4Login({ lang: 'de-de', warning: DE_WRONG }).replace('</head>', `${decoy}</head>`),
    languageFiles: { [DE_INI]: DE_FULL }
  })
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), wrong)
})

test('Joomla 4.0/4.1 secret-key messages in the script options are mfa_required, in both wordings', async () => {
  for (const warning of [
    'The two factor authentication Secret Key is invalid.',
    'The Multi-factor Authentication Secret Key is invalid.'
  ]) {
    const seen = signIn({ loginPage: j4Login(), landing: j4Login({ warning }) })
    const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
    assert.deepEqual(session, {
      ok: false,
      reason: 'mfa_required',
      detail: { at: 'login_landing', check: 'mfa' }
    })
    assert.equal(posts(seen), 1)
  }
})

test('a language line with a trailing comment still counts, and named entities on the page decode', async () => {
  signIn({
    loginPage: j3Login({ lang: 'de-de' }),
    landing: j3Login({ lang: 'de-de', message: 'Der geheime Schl&uuml;ssel ist ung&uuml;ltig.' }),
    languageFiles: {
      [DE_INI_J3]:
        'JGLOBAL_AUTH_INVALID_SECRETKEY="Der geheime Schlüssel ist ungültig." ; Zwei-Faktor "alt"\n'
    }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(session.reason, 'mfa_required')
})

test('an out-of-range character reference anywhere on the page never throws', async () => {
  signIn({
    loginPage: j4Login({ lang: 'de-de' }),
    landing: j4Login({
      lang: 'de-de',
      warning: `${DE_WRONG} &#1114112; &#xD800; &#99999999999999999999;`
    }).replace('<body>', '<body>&#1114112;'),
    languageFiles: { [DE_INI]: DE_FULL }
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(session.reason, 'invalid_credential')
})

test('language reads are capped at two requests, redirects included', async () => {
  const seen = routes({})
  const table = {
    [ADMIN]: (init) =>
      init.method === 'POST'
        ? new Response('', { status: 303, headers: { location: ADMIN } })
        : new Response(
            seen.some((c) => c.method === 'POST') ? j4Login({ lang: 'de-de', warning: DE_WRONG }) : j4Login()
          )
  }
  for (let i = 0; i < 6; i++)
    table[`${ROOT}/administrator/language/de-DE/${i === 0 ? 'joomla.ini' : `hop${i}.ini`}`] = () =>
      new Response('', {
        status: 302,
        headers: { location: `${ROOT}/administrator/language/de-DE/hop${i + 1}.ini` }
      })
  table[DE_INI_J3] = () => new Response(DE_FULL)
  routes(table, seen)
  assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), unread)
  assert.ok(languageReads(seen).length <= 2, JSON.stringify(languageReads(seen)))
})

for (const status of [401, 403, 429]) {
  test(`a ${status} on the language file stops every further read`, async () => {
    const seen = signIn({
      loginPage: j4Login({ lang: 'de-de' }),
      landing: j4Login({ lang: 'de-de', warning: DE_WRONG }),
      languageFiles: { [DE_INI_J3]: DE_FULL }
    })
    globalThis.fetch = (
      (inner) =>
      async (url, init = {}) => {
        if (String(url) === DE_INI) {
          seen.push({ url: String(url), method: 'GET', cookie: '' })
          return withUrl(new Response('denied', { status }), String(url))
        }
        return inner(url, init)
      }
    )(globalThis.fetch)
    assert.deepEqual(await joomla.loginToAdmin(ADMIN, 'admin', 'pw'), unread)
    assert.deepEqual(
      languageReads(seen).map((c) => c.url),
      [DE_INI]
    )
  })
}

test('no language file is read after a landing a firewall answered', async () => {
  let posted = false
  const seen = routes({
    [ADMIN]: (init) => {
      if (init.method === 'POST') {
        posted = true
        return new Response('', { status: 303, headers: { location: ADMIN } })
      }
      return posted
        ? new Response(j4Login({ lang: 'de-de', warning: DE_WRONG }), {
            headers: { 'cf-mitigated': 'challenge' }
          })
        : new Response(j4Login())
    },
    [DE_INI]: () => new Response(DE_FULL)
  })
  const session = await joomla.loginToAdmin(ADMIN, 'admin', 'pw')
  assert.equal(languageReads(seen).length, 0)
  assert.notDeepEqual(session, wrong)
})

test('message_unread gets its own sentence, not "wrong password"', () => {
  assert.equal(
    refusal.importErrorKey('invalid_credential', { check: 'message_unread' }),
    'import_error_signin_unclear'
  )
  assert.equal(
    refusal.importErrorKey('invalid_credential', { check: 'invalid_credential' }),
    'import_error_invalid_credential'
  )
  assert.equal(refusal.importErrorKey('invalid_credential'), 'import_error_invalid_credential')
})

test('a wrong password on Joomla says Joomla needs the username; WordPress keeps its sentence', () => {
  assert.equal(
    refusal.importErrorKey('invalid_credential', { check: 'invalid_credential', platform: 'joomla' }),
    'import_error_invalid_credential_joomla'
  )
  assert.equal(
    refusal.importErrorKey('invalid_credential', { platform: 'wordpress' }),
    'import_error_invalid_credential'
  )
  // A refusal Tracy could not read stays "could not tell why" on Joomla too.
  assert.equal(
    refusal.importErrorKey('invalid_credential', { check: 'message_unread', platform: 'joomla' }),
    'import_error_signin_unclear'
  )
  // Other refusals of a Joomla run keep their own sentences.
  assert.equal(
    refusal.importErrorKey('no_backend_access', { platform: 'joomla' }),
    'import_error_no_backend_access'
  )
})

test('messagesOf reads the noscript copy inside the message container and nothing elsewhere', () => {
  const noscript =
    '<div id="system-message-container" aria-live="polite"><noscript><div class="alert alert-warning">Username and password do not match or you do not have an account yet.</div></noscript></div>'
  assert.deepEqual(joomla.messagesOf(noscript), [
    'Username and password do not match or you do not have an account yet.'
  ])
  const elsewhere =
    '<div id="system-message-container" aria-live="polite"></div><noscript><div class="alert alert-info">Username and password do not match</div></noscript>'
  assert.deepEqual(joomla.messagesOf(elsewhere), [])
})
