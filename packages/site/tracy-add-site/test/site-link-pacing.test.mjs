#!/usr/bin/env node
/**
 * The importer's manners towards one site (`src/host/site-link.ts`): engine calls paced about a
 * second apart, a `Retry-After` waited out, 5000-row database pages, and a host that bans the
 * importer's IP partway through stopping the run with `blocked_by_host` instead of more retries.
 *
 * The defect (a Joomla 3.10 site, measured 2026-10-19): engine calls back to back for about two and
 * a half minutes, then TCP 80/443 from the importer's IP refused while the site worked from other
 * addresses. The retry ladder kept knocking, and the customer's next try failed at sign-in as
 * `unreachable`.
 *
 * `fetch` is mocked and so are `setTimeout` and `Date` (`mock.timers`), so the pauses are measured on
 * the mocked clock and cost no real time. `drive` turns the event loop and fires due timers until
 * the promise under test settles.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const realFetch = globalThis.fetch
const realHome = process.env.DSH_HOME

let exporter
let run
let buildDir
const homes = []

async function bundle(entry, name) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    write: false
  })
  const file = path.join(buildDir, name)
  writeFileSync(file, built.outputFiles[0].text)
  return import(pathToFileURL(file).href)
}

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-site-link-build-'))
  exporter = await bundle('src/host/export.ts', 'export.mjs')
  run = await bundle('src/host/run.ts', 'run.mjs')
})

after(() => {
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-site-link-home-'))
  homes.push(dir)
  mkdirSync(path.join(dir, 'tracy-add-site'), { recursive: true })
  process.env.DSH_HOME = dir
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
})

afterEach(() => {
  mock.timers.reset()
  globalThis.fetch = realFetch
})

/** Turn the event loop and fire due timers until `promise` settles; resolves to its outcome. */
async function drive(promise, budget = 20_000) {
  let settled = false
  const outcome = promise.then(
    (value) => ({ value }),
    (error) => ({ error })
  )
  outcome.then(() => (settled = true))
  for (let turn = 0; !settled; turn++) {
    if (turn > budget) throw new Error('did not settle')
    await new Promise((resolve) => setImmediate(resolve))
    mock.timers.runAll()
  }
  return outcome
}

const refused = () => {
  const cause = Object.assign(new Error('connect ECONNREFUSED 192.0.2.10:443'), { code: 'ECONNREFUSED' })
  return new TypeError('fetch failed', { cause })
}

/** Node's multi-address connect: every address refused, the codes on an `AggregateError` cause. */
const refusedEverywhere = () => {
  const one = (address) =>
    Object.assign(new Error(`connect ECONNREFUSED ${address}:443`), { code: 'ECONNREFUSED' })
  const cause = new AggregateError([one('192.0.2.10'), one('2001:db8::10')])
  return new TypeError('fetch failed', { cause })
}

const json = (body, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

const dumpChunk = (from, to, rows) =>
  json({
    ok: true,
    sql_b64: Buffer.from(`-- rows ${from}..${to}\n`).toString('base64'),
    next_cursor: String(to),
    done: to >= rows,
    rows: to - from,
    total: rows
  })

const ENDPOINT = 'https://example.test/wp-admin/admin-ajax.php?action=claude_cowork'
const artifacts = { signPut: async () => ({ url: 'https://store.test/db', key: 'db-key' }) }

/**
 * An engine with one table of `rows` rows. `answer(action, params, n)` may answer the n-th engine
 * call itself (a Response, or a thrown error); every engine call is recorded with the mocked time.
 */
function engine({ rows = 12_000, answer } = {}) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === 'https://store.test/db') return new Response(null, { status: 200 })
    const { action, params = {} } = JSON.parse(init.body)
    calls.push({ action, params, at: Date.now() })
    const own = answer?.(action, params, calls.length)
    if (own) return own
    if (action === 'db.tables') return json({ ok: true, tables: ['wp_posts'] })
    const from = Number(params.cursor || 0)
    return dumpChunk(from, Math.min(rows, from + Math.min(5000, params.limit)), rows)
  }
  return calls
}

const gaps = (calls) => calls.slice(1).map((call, i) => call.at - calls[i].at)

test('engine calls are paced: at least a second between consecutive calls, 5000 rows a page', async () => {
  const calls = engine({ rows: 12_000 })
  const { value, error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  assert.equal(error, undefined)
  assert.equal(value.tables, 1)
  assert.deepEqual(
    calls.map((c) => c.action),
    ['db.tables', 'db.dump', 'db.dump', 'db.dump']
  )
  assert.deepEqual(
    calls.filter((c) => c.action === 'db.dump').map((c) => c.params.limit),
    [5000, 5000, 5000]
  )
  for (const gap of gaps(calls)) assert.ok(gap >= 1000, `gap of ${gap} ms`)
})

test('a 503 with Retry-After: the next call waits it out, longer than the ladder would', async () => {
  const calls = engine({
    rows: 100,
    answer: (action, _params, n) =>
      action === 'db.dump' && n === 2
        ? new Response('busy', { status: 503, headers: { 'retry-after': '30' } })
        : undefined
  })
  const { error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  assert.equal(error, undefined)
  assert.equal(calls.length, 3)
  assert.ok(gaps(calls)[1] >= 30_000, `waited ${gaps(calls)[1]} ms after Retry-After: 30`)
})

test('a 429 with Retry-After as an HTTP date is honoured too', async () => {
  const calls = engine({
    rows: 100,
    answer: (action, _params, n) =>
      action === 'db.dump' && n === 2
        ? new Response('slow down', {
            status: 429,
            headers: { 'retry-after': new Date(Date.now() + 20_000).toUTCString() }
          })
        : undefined
  })
  const { error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  assert.equal(error, undefined)
  assert.ok(gaps(calls)[1] >= 19_000, `waited ${gaps(calls)[1]} ms`)
})

test('refused after the site answered: blocked_by_host after three attempts, not the whole ladder', async () => {
  const calls = engine({
    answer: (action) => {
      if (action === 'db.dump') throw refused()
    }
  })
  const { error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  assert.equal(error?.name, 'ExportFailed')
  assert.equal(error.reason, 'blocked_by_host')
  assert.equal(error.detail, 'ECONNREFUSED')
  assertNoAddress({ message: error.message, detail: error.detail }, 'the export refusal')
  assert.equal(calls.filter((c) => c.action === 'db.dump').length, 3, 'stopped instead of a fourth try')
})

test('refused at every address after the site answered (AggregateError): blocked_by_host too', async () => {
  const calls = engine({
    answer: (action) => {
      if (action === 'db.dump') throw refusedEverywhere()
    }
  })
  const { error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  assert.equal(error?.reason, 'blocked_by_host')
  assert.equal(error.detail, 'ECONNREFUSED')
  assertNoAddress({ message: error.message, detail: error.detail }, 'the export refusal')
  assert.equal(calls.filter((c) => c.action === 'db.dump').length, 3)
})

test('one reading of a fetch error: diagnostics and the TLS check look inside an AggregateError', async () => {
  const diagnostic = await bundle('src/host/diagnostic.mjs', 'diagnostic.mjs')
  const joomla = await bundle('src/host/joomla.ts', 'joomla.mjs')
  assert.equal(diagnostic.diagnosticError(refused()), 'ECONNREFUSED')
  assert.equal(diagnostic.diagnosticError(refusedEverywhere()), 'ECONNREFUSED')
  const expired = Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' })
  const tls = new TypeError('fetch failed', { cause: new AggregateError([expired]) })
  assert.equal(joomla.isTlsFailure(tls), true)
  assert.equal(diagnostic.diagnosticError(tls), 'CERT_HAS_EXPIRED')
  assert.equal(diagnostic.diagnosticError(new Error('boom')), 'other')
})

test('refused before the site ever answered: the full ladder, then site_offline (#1616), not a ban', async () => {
  const calls = engine({
    answer: () => {
      throw refused()
    }
  })
  const { error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  // Not blocked_by_host: nothing shows this IP was ever let in. The site did not answer at all.
  assert.equal(error?.reason, 'site_offline')
  assert.equal(error?.detail, 'ECONNREFUSED')
  assert.equal(calls.length, 4, 'every attempt of the ladder')
})

test('one refused call, then answers: a blip, retried, and the dump completes', async () => {
  const calls = engine({
    rows: 100,
    answer: (action, _params, n) => {
      if (action === 'db.dump' && n === 2) throw refused()
    }
  })
  const { value, error } = await drive(exporter.exportDatabase(ENDPOINT, 'tok', artifacts))
  assert.equal(error, undefined)
  assert.equal(value.tables, 1)
  assert.equal(calls.length, 3)
})

test('retryAfterMs reads seconds and HTTP dates, caps them, and ignores the unreadable', async () => {
  const link = await bundle('src/host/site-link.ts', 'site-link.mjs')
  const now = Date.parse('2026-10-19T10:00:00Z')
  assert.equal(link.retryAfterMs('5', now), 5000)
  assert.equal(link.retryAfterMs('Mon, 19 Oct 2026 10:00:10 GMT', now), 10_000)
  assert.equal(link.retryAfterMs('Mon, 19 Oct 2026 09:00:00 GMT', now), 0)
  assert.equal(link.retryAfterMs('86400', now), link.MAX_RETRY_AFTER_MS)
  assert.equal(link.retryAfterMs('soon', now), undefined)
  assert.equal(link.retryAfterMs(null, now), undefined)
  assert.equal(link.connectionFailure(refused()), 'ECONNREFUSED')
  assert.equal(
    link.connectionFailure(new TypeError('fetch failed', { cause: new AggregateError([refused().cause]) })),
    'ECONNREFUSED'
  )
  assert.equal(link.connectionFailure(new DOMException('timed out', 'TimeoutError')), undefined)
})

// A whole run (`startRun`), WordPress with an admin login, against a host that bans the importer.

const SITE = 'banned.test'
const WEBROOT = 'https://banned.test'
const API = `${WEBROOT}/wp-admin/admin-ajax.php?action=claude_cowork`
const ADMIN = `${WEBROOT}/wp-admin`
const LOGIN = `${WEBROOT}/wp-login.php`
const ORIGIN = 'https://cowork.example.test'
const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/update.json'
const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/claude-cowork.zip'
const JOOMLA_MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json'
const RELEASES = 'https://github.com/TracyHQ/claude-cowork/releases/download'
const TOKEN = 'c'.repeat(32)
const PASSWORD = 'synthetic-password'
/** Tracy's own address, as a stale caller that still passes the removed `egressIp` would send it. */
const TRACY_ADDRESS = '203.0.113.7'

/**
 * No IPv4 or IPv6 address anywhere in `value`. Product decision: no refusal sentence or diagnostic
 * names an address.
 */
function assertNoAddress(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.doesNotMatch(text, /\b\d{1,3}(?:\.\d{1,3}){3}\b/, `${label}: an IPv4 address`)
  assert.doesNotMatch(text, /\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}\b/i, `${label}: an IPv6 address`)
}

function html(body, { status = 200, url, setCookie = [], location } = {}) {
  const headers = new Headers()
  for (const cookie of setCookie) headers.append('set-cookie', cookie)
  if (location) headers.set('location', location)
  const response = new Response(status >= 300 && status < 400 ? null : body, { status, headers })
  if (url) Object.defineProperty(response, 'url', { value: url })
  return response
}

/**
 * A WordPress site behind a host that bans: once `host.banned`, every request to the site is
 * refused at TCP. `host.banAfter` bans it right after that engine action answers.
 */
function wordpressWorld() {
  const host = {
    banned: false,
    banAfter: null,
    plugin: 'absent',
    refusal: refused,
    wrongPassword: false,
    challenge: false
  }
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const method = init.method ?? 'GET'
    if (method === 'POST' && url.endsWith('/import-result')) return Response.json({ ok: true })
    const body =
      typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : undefined
    calls.push({ url, method, action: body?.action, at: Date.now() })
    if (method === 'GET' && url === MANIFEST) return json({ version: '0.8.0', package: PACKAGE })
    if (method === 'GET' && url === JOOMLA_MANIFEST)
      return json({ version: '0.8.0', package: `${RELEASES}/v0.8.0/claude-cowork-joomla.zip` })
    if (method === 'GET' && url === PACKAGE) return new Response(new Uint8Array([80, 75, 3, 4]))
    if (url.startsWith(`${ORIGIN}/api/sites/${SITE}/`)) {
      const step = url.slice(`${ORIGIN}/api/sites/${SITE}/`.length)
      if (step === 'component-credential') return json({})
      if (step === 'artifacts/put') return json({ key: 'db/1.sql.gz', url: 'https://store.test/db/1' })
      return json({})
    }
    if (url.startsWith('https://store.test/')) return new Response(null, { status: 200 })
    if (!url.startsWith(WEBROOT)) throw new TypeError(`unexpected fetch: ${method} ${url}`)

    if (host.banned) throw host.refusal()
    // Cloudflare's managed challenge in front of the whole site, as measured on a customer's Joomla.
    if (host.challenge)
      return new Response(
        '<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script>',
        {
          status: 403,
          headers: { 'cf-mitigated': 'challenge', server: 'cloudflare' }
        }
      )
    if (method === 'POST' && url === API) {
      if (body.action === host.banAfter) host.banned = true
      if (body.action === 'info') return json({ ok: true, info: { component: '0.8.0' } })
      // A component without the live fingerprint answers as the real one does.
      if (body.action === 'site.fingerprint') return json({ ok: false, error: 'unknown_action' })
      if (body.action === 'db.tables') return json({ ok: true, tables: ['wp_posts'] })
      return json({ ok: false, error: 'unexpected' })
    }
    if (url === `${WEBROOT}/`) return html('<html></html>', { url })
    if (method === 'GET' && url === LOGIN) return html('<form></form>', { url })
    if (method === 'POST' && url === LOGIN && host.wrongPassword)
      return html(
        '<div id="login_error"><strong>Error:</strong> The password you entered for the username is incorrect.</div>',
        { url }
      )
    if (method === 'POST' && url === LOGIN)
      return html('', { status: 302, location: `${ADMIN}/`, setCookie: ['wordpress_logged_in_x=1; Path=/'] })
    if (url === `${ADMIN}/plugin-install.php?tab=upload`)
      return html('<input type="hidden" name="_wpnonce" value="abc123">', { url })
    if (url === `${ADMIN}/update.php?action=upload-plugin`) {
      host.plugin = 'inactive'
      return html('<p>Plugin installed.</p>')
    }
    if (url === `${ADMIN}/plugins.php`)
      return host.plugin === 'active'
        ? html('<a href="plugins.php?action=deactivate&amp;plugin=claude-cowork%2Fcc.php">x</a>')
        : host.plugin === 'inactive'
          ? html('<a href="plugins.php?action=activate&amp;plugin=claude-cowork%2Fcc.php">x</a>')
          : html('<p>No plugins.</p>')
    if (url.startsWith(`${ADMIN}/plugins.php?action=activate`)) {
      host.plugin = 'active'
      return html('<p>Activated.</p>')
    }
    if (url === `${ADMIN}/options-general.php?page=claude-cowork`)
      return html(`<input id="claude_cowork_token" type="text" value="${TOKEN}">`)
    throw new TypeError(`unexpected fetch: ${method} ${url}`)
  }
  return { host, calls }
}

async function finished(state) {
  const { error } = await drive(
    (async () => {
      for (;;) {
        const now = run.runStatus(state.id)
        if (now.state !== 'running') return now
        await new Promise((resolve) => setImmediate(resolve))
      }
    })()
  )
  assert.equal(error, undefined)
  return run.runStatus(state.id)
}

const startLogin = (siteKey = SITE, platform = 'wordpress', username = 'admin') =>
  run.startRun({
    siteKey,
    platform,
    origin: ORIGIN,
    cookie: 'session=synthetic',
    adminUrl: platform === 'joomla' ? `${WEBROOT}/administrator/` : LOGIN,
    username,
    password: PASSWORD,
    egressIp: TRACY_ADDRESS
  })

const signIns = (calls) => calls.filter((c) => c.method === 'POST' && c.url === LOGIN).length

test('the first engine calls of a run share the site link pacing', async () => {
  const w = wordpressWorld()
  const state = await finished(startLogin('pacing.test'))
  assert.equal(state.state, 'error')
  const firstEngineCalls = w.calls.filter((call) => call.action === 'info' || call.action === 'db.tables')
  assert.deepEqual(
    firstEngineCalls.map((call) => call.action),
    // The component check, then the live fingerprint's own `info` (WordPress too since 26/10/2026).
    ['info', 'info', 'db.tables']
  )
  assert.ok(
    firstEngineCalls[1].at - firstEngineCalls[0].at >= 1000,
    `first two engine calls were ${firstEngineCalls[1].at - firstEngineCalls[0].at} ms apart`
  )
})

test('a run banned partway through stops with blocked_by_host, no address, and no new sign-in', async () => {
  const w = wordpressWorld()
  w.host.banAfter = 'db.tables'

  const state = await finished(startLogin())

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'blocked_by_host')
  assert.deepEqual(state.diagnostic, {
    at: 'export',
    check: 'connection_refused_after_progress',
    error: 'ECONNREFUSED'
  })
  assert.equal(state.errorDetail, undefined)
  assertNoAddress(state, 'the banned run')
  assert.equal(signIns(w.calls), 1, 'signed in once, never again after the ban')
  assert.equal(w.calls.filter((c) => c.action === 'db.dump').length, 3, 'three refused dumps, then stop')

  // The customer tries again while the ban holds: the sign-in page is refused, and that is the
  // same ban, not a wrong address.
  w.calls.length = 0
  const again = await finished(startLogin())
  assert.equal(again.error, 'blocked_by_host')
  assert.equal(again.diagnostic.check, 'connection_refused_after_ban')
  assert.equal(again.diagnostic.error, 'ECONNREFUSED')
  assert.equal(again.errorDetail, undefined)
  assertNoAddress(again, 'the run after the ban')
  assert.equal(signIns(w.calls), 0)
})

test('a sign-in page refused with no ban before is still unreachable', async () => {
  const w = wordpressWorld()
  w.host.banned = true

  const state = await finished(startLogin('never-banned.test'))

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'unreachable')
  assert.equal(signIns(w.calls), 0)
})

test('after a ban, a sign-in refused at every address (AggregateError) is still the ban, on both platforms', async () => {
  for (const platform of ['wordpress', 'joomla']) {
    const siteKey = `aggregate-${platform}.test`
    const w = wordpressWorld()
    w.host.banAfter = 'db.tables'
    const banned = await finished(startLogin(siteKey))
    assert.equal(banned.error, 'blocked_by_host', platform)

    w.host.refusal = refusedEverywhere
    w.calls.length = 0
    const again = await finished(startLogin(siteKey, platform))
    assert.equal(again.error, 'blocked_by_host', platform)
    assert.equal(again.diagnostic.check, 'connection_refused_after_ban', platform)
    assert.equal(again.diagnostic.error, 'ECONNREFUSED', platform)
    assert.equal(again.errorDetail, undefined, platform)
    assertNoAddress(again, platform)
    assert.equal(signIns(w.calls), 0, platform)
    assert.ok(!JSON.stringify(again).includes(banned.id), 'nothing of the earlier run is shown')
  }
})

test('a Joomla run behind a Cloudflare challenge stops with blocked_by_firewall, the firewall named', async () => {
  const w = wordpressWorld()
  w.host.challenge = true
  const warned = []
  const warn = console.warn
  console.warn = (line) => warned.push(String(line))
  try {
    const state = await finished(startLogin('challenged.test', 'joomla'))
    assert.equal(state.state, 'error')
    assert.equal(state.error, 'blocked_by_firewall')
    assert.deepEqual(state.errorDetail, { firewall: 'cloudflare' })
    assert.deepEqual(state.diagnostic, { at: 'login_page', check: 'forbidden', status: 403 })
    assert.ok(
      warned.some((line) => line.includes('blocked by cloudflare at signing_in')),
      'one operator log line names the firewall'
    )
  } finally {
    console.warn = warn
  }
})

test('the customer sentence for blocked_by_host says wait a few hours, then Tracy support, and names no address', async () => {
  const { en } = await bundle('src/client/strings.ts', 'strings.mjs')
  const sentence = en.import_error_blocked_by_host
  const refused = sentence.indexOf('blocked Tracy')
  const later = sentence.indexOf('Try again in a few hours')
  const support = sentence.indexOf('contact Tracy support')
  assert.ok(
    refused >= 0 && later > refused && support > later,
    `refusal, then retry later, then support: ${sentence}`
  )
  assert.doesNotMatch(
    sentence,
    /picks? up|where it (stopped|left off)|resume|continue/i,
    'no promise of a resume'
  )
  assert.doesNotMatch(sentence, /\{ip\}|IP address/)
  assertNoAddress(sentence, 'the sentence')
  assert.equal(en.import_error_blocked_by_host_ip, undefined, 'no second sentence that could carry one')
})

// A refused account: the operator learns whether the username had an email's shape, never the value.

/**
 * The result a run queued for the operator. It is written to disk before it is sent
 * (`operation-signal.ts`); under the frozen clock the run id is too short for the sender, so the
 * queued notice is what is read here.
 */
async function queuedResult(id) {
  const queued = path.join(process.env.DSH_HOME, 'tracy-add-site', 'operation-results', `${id}.json`)
  for (let turn = 0; !existsSync(queued); turn++) {
    if (turn > 200_000) throw new Error(`no result queued for ${id}`)
    await new Promise((resolve) => setImmediate(resolve))
  }
  return JSON.parse(readFileSync(queued, 'utf8')).result
}

test('a refused WordPress sign-in reports whether the username was an email and how the run came in, never the username', async () => {
  for (const [username, isEmail] of [
    ['owner@shop.example', true],
    ['shopowner', false]
  ]) {
    const w = wordpressWorld()
    w.host.wrongPassword = true
    const siteKey = `refused-${isEmail}.test`
    const state = await finished(startLogin(siteKey, 'wordpress', username))
    assert.equal(state.error, 'invalid_credential', username)
    assert.deepEqual(state.diagnostic, {
      at: 'login_post',
      check: 'invalid_credential',
      username_is_email: isEmail
    })
    const report = await queuedResult(state.id)
    assert.equal(report.sign_in, 'password')
    assert.deepEqual(report.detail, {
      at: 'login_post',
      check: 'invalid_credential',
      username_is_email: isEmail
    })
    assert.ok(!JSON.stringify(report).includes(username), 'the username itself is never sent')
    assert.ok(!JSON.stringify(state).includes(username), 'the username itself is never kept')
  }
})

test('a run that fails with no diagnostic still reports how it came in, and no made-up detail', async () => {
  wordpressWorld()
  // Neither a login nor a pasted code, and nothing kept for this site: it stops before any request.
  const state = await finished(
    run.startRun({
      siteKey: 'no-diagnostic.test',
      platform: 'wordpress',
      origin: ORIGIN,
      cookie: 'session=synthetic'
    })
  )
  assert.equal(state.error, 'credentials_required')
  assert.equal(state.diagnostic, undefined)
  const report = await queuedResult(state.id)
  assert.equal(report.sign_in, 'saved')
  assert.equal('detail' in report, false)
})

test('signInRefusal marks only a refused account, and signInWay names how the run came in', () => {
  const unread = { at: 'login_landing', check: 'message_unread' }
  assert.deepEqual(run.signInRefusal('invalid_credential', unread, ' owner@shop.example '), {
    ...unread,
    username_is_email: true
  })
  assert.deepEqual(run.signInRefusal('no_backend_access', undefined, 'admin'), {
    at: 'login_post',
    check: 'no_backend_access',
    username_is_email: false
  })
  assert.deepEqual(run.signInRefusal('invalid_credential', undefined, 'owner@localhost'), {
    at: 'login_post',
    check: 'invalid_credential',
    username_is_email: false
  })
  // Anything in front of the account is not about the username.
  const gate = { at: 'login_post', check: 'forbidden', status: 403 }
  assert.equal(run.signInRefusal('admin_gate', gate, 'owner@shop.example'), gate)
  assert.equal(run.signInRefusal('mfa_required', undefined, 'owner@shop.example'), undefined)

  const base = { siteKey: SITE, platform: 'joomla', origin: ORIGIN, cookie: '' }
  assert.equal(run.signInWay({ ...base, adminUrl: LOGIN, username: 'a', password: 'b' }), 'password')
  assert.equal(run.signInWay({ ...base, token: TOKEN, webRootUrl: WEBROOT }), 'code')
  assert.equal(run.signInWay(base), 'saved')
})
