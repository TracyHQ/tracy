#!/usr/bin/env node
/**
 * Cached-handover recovery, driven through the REAL `startRun` (#172).
 *
 * A run that finds a fresh finished read hands it over without signing in, so it never reaches the
 * credential registration. If the earlier run had been downgraded to http, the seat book refused
 * the credential and Apply answers COMPONENT_NOT_REGISTERED. The only recovery is explicit https
 * intent supplied on the retry that names the same source (host + path).
 *
 * These tests bundle `run.ts` with esbuild and exercise the actual cached fast path: a temporary
 * `DSH_HOME` holds synthetic `site-tokens.json` and `handovers.json`, `fetch` is mocked in memory,
 * `startRun` is called, and `runStatus` is polled until the run settles. Only the network is mocked;
 * the fs and the run logic are the real ones. Each test uses its own temporary home and site key so
 * the sequential `node:test` runner shares no state between them.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const realFetch = globalThis.fetch
const realHome = process.env.DSH_HOME

let run
let buildDir

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-run-build-'))
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/run.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    // Not `packages: 'external'`: `run.ts` reaches `@tracy/core/lease`, which must be bundled the
    // way `scripts/build-host.mjs` bundles it; a copy in a temp folder cannot resolve it.
    write: false
  })
  const file = path.join(buildDir, 'run.mjs')
  writeFileSync(file, built.outputFiles[0].text)
  run = await import(pathToFileURL(file).href)
})

after(() => {
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
})

const ORIGIN = 'https://cowork.example.test'
const COOKIE = 'session=synthetic-cookie'
const HELD_TOKEN = 'a'.repeat(32)
const CACHED = {
  webrootKey: 'webroot/synthetic.tar',
  dbKey: 'db/synthetic.sql.gz',
  liveSite: 'http://example.test'
}

const homes = []

/** A fresh temporary DSH_HOME seeded with a saved token and, optionally, a fresh finished read. */
function seedHome({ heldWebRoot = 'http://example.test', handover = true } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), 'tch-run-home-'))
  homes.push(home)
  const dir = path.join(home, 'tracy-add-site')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'site-tokens.json'),
    JSON.stringify({
      'example.test': {
        token: HELD_TOKEN,
        webRootUrl: heldWebRoot,
        platform: 'joomla',
        version: '0.8.0',
        savedAt: Date.now()
      }
    })
  )
  if (handover) {
    writeFileSync(
      path.join(dir, 'handovers.json'),
      JSON.stringify({ 'example.test': { result: CACHED, finishedAt: Date.now() } })
    )
  }
  process.env.DSH_HOME = home
  return home
}

beforeEach(() => {
  globalThis.fetch = () => {
    throw new TypeError('fetch was not installed for this test')
  }
})

after(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

/** A `fetch` built from a handler, recording every request (url, method, parsed body). */
function installFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    let body
    try {
      body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    } catch {
      body = init.body
    }
    // `redirect` defaults to 'follow' per the fetch spec; record it so a test can assert that a
    // verification request opted out of automatic redirect following (this mock never emulates it).
    const redirect = init.redirect ?? 'follow'
    const call = {
      url: String(url),
      method,
      body,
      headers: new Headers(init.headers),
      at: Date.now(),
      protocol: new URL(String(url)).protocol,
      redirect
    }
    // Operation reporting is independent of the cached handover's site reads and writes.
    if (method === 'POST' && String(url).endsWith('/import-result')) return Response.json({ ok: true })
    // So is the host's own handover to the fleet once the read is done (#1652, `fleet-handover.ts`).
    if (method === 'POST' && String(url).endsWith('/provision'))
      return Response.json({ jobId: 'job-1' }, { status: 202 })
    calls.push(call)
    const res = handler(call)
    if (!res) throw new TypeError(`unexpected fetch: ${method} ${url}`)
    return res
  }
  return calls
}

function jsonResponse(status, obj) {
  const headers = new Headers({ 'content-type': 'application/json' })
  return new Response(JSON.stringify(obj), { status, headers })
}

function redirectResponse(status, location) {
  return new Response(null, { status, headers: new Headers({ location }) })
}

const isDoorCall = (call) => call.method === 'POST' && call.url.includes('option=com_claudecowork')
const isRegisterPut = (call) => call.method === 'PUT' && call.url.includes('/component-credential')

async function settle(id, budgetMs = 4000, timers) {
  const deadline = Date.now() + budgetMs
  for (let turn = 0; ; turn++) {
    const state = run.runStatus(id)
    if (state && state.state !== 'running') return state
    if (timers) {
      if (turn > 20_000) throw new Error('run did not settle on the mocked clock')
      await new Promise((resolve) => setImmediate(resolve))
      timers.runAll()
    } else {
      if (Date.now() > deadline) throw new Error('run did not settle in time')
      await new Promise((r) => setTimeout(r, 5))
    }
  }
}

test('an https webRootUrl retry recovers over https and corrects the handed-over address', async (t) => {
  // Measure pacing on the mocked clock, like site-link-pacing.test.mjs. Real timers may fire early.
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  t.after(() => t.mock.timers.reset())
  seedHome()
  const calls = installFetch((call) => {
    if (
      isDoorCall(call) &&
      call.body?.action === 'info' &&
      call.url.includes('/index.php?') &&
      !call.url.includes('/administrator/index.php?')
    )
      return jsonResponse(404, { error: true, code: 404 })
    if (isDoorCall(call) && call.body?.action === 'info')
      return jsonResponse(200, { ok: true, info: { component: '0.8.0' } })
    if (isRegisterPut(call)) return jsonResponse(200, {})
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id, 4000, t.mock.timers)

  assert.equal(state.state, 'done')
  assert.equal(state.step, 'handing_over')
  // Same stored artifacts, corrected liveSite.
  assert.equal(state.result.webrootKey, CACHED.webrootKey)
  assert.equal(state.result.dbKey, CACHED.dbKey)
  assert.equal(state.result.liveSite, 'https://example.test')

  // The token was verified over https before registration.
  const door = calls.find(isDoorCall)
  assert.ok(door, 'the component was asked over https')
  assert.equal(door.protocol, 'https:')
  const engineCalls = calls.filter((call) => isDoorCall(call) && call.body?.action === 'info')
  assert.equal(engineCalls.length, 2)
  assert.ok(engineCalls[1].at - engineCalls[0].at >= 1000, 'recovery engine calls use SiteLink pacing')

  // The registration PUT carried the remembered token to the https endpoint. A retry that pastes a
  // new token does not come here at all: it reads the site again (`handover-lifecycle.test.mjs`).
  const put = calls.find(isRegisterPut)
  assert.ok(put, 'the credential was registered')
  assert.equal(put.body.token, HELD_TOKEN)
  assert.ok(put.body.endpoint.startsWith('https://example.test'))

  // Nothing on the cached path reads the archive, asks the manifest, or touches the artifact store.
  assert.ok(
    calls.every((c) => !c.url.includes('/artifacts/')),
    'no artifact calls'
  )
  assert.ok(
    !calls.some((c) => c.body?.action === 'db.tables' || c.body?.action === 'files.pack'),
    'no export calls'
  )

  // No credential is left in the state the status door returns.
  const dump = JSON.stringify(state)
  assert.ok(!dump.includes(HELD_TOKEN) && !dump.includes(COOKIE))
})

test('no https intent: the cached read is handed over unchanged and nothing is registered', async () => {
  seedHome()
  const calls = installFetch(() => null)

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    webRootUrl: 'http://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'done')
  assert.equal(state.result.liveSite, CACHED.liveSite)
  assert.equal(calls.length, 0, 'no request was made without a secure intent')
})

test('an https retry naming a different host does not register or rewrite the source', async () => {
  seedHome()
  const calls = installFetch(() => null)

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    adminUrl: 'https://evil.test/administrator',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'done')
  assert.equal(state.result.liveSite, CACHED.liveSite)
  assert.equal(calls.filter(isRegisterPut).length, 0, 'no registration for a mismatched source')
})

test('an https endpoint that redirects the verification request is not trusted; no registration', async () => {
  seedHome()
  const calls = installFetch((call) => {
    // Both doors 307 the token off the https endpoint. A followed redirect would leak the token; the
    // verification must refuse it, so recovery does not happen and no credential is registered.
    if (isDoorCall(call)) return redirectResponse(307, 'http://example.test/index.php')
    if (isRegisterPut(call)) return jsonResponse(200, {})
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'done')
  assert.equal(state.result.liveSite, CACHED.liveSite, 'liveSite is not corrected without verification')
  assert.equal(calls.filter(isRegisterPut).length, 0, 'the token was never registered after a redirect')
  assert.ok(
    calls.every((c) => c.protocol === 'https:'),
    'the token was never sent to the http redirect target'
  )
  // The mock does not emulate automatic redirects, so the refusal is only real if the verification
  // opted out of following them: every info request must carry redirect 'manual' (or 'error').
  const infoCalls = calls.filter((c) => isDoorCall(c) && c.body?.action === 'info')
  assert.ok(infoCalls.length > 0, 'the verification was attempted')
  assert.ok(
    infoCalls.every((c) => c.redirect === 'manual' || c.redirect === 'error'),
    'every verification request opted out of automatic redirect following'
  )
})

test('an https endpoint answering 500 with an ok body is not trusted; no registration', async () => {
  seedHome()
  const calls = installFetch((call) => {
    // A 500 whose JSON body claims {ok:true}. A verification that trusts the body over the HTTP
    // status would falsely register; it must reject every non-2xx answer in noFollow mode.
    if (isDoorCall(call) && call.body?.action === 'info')
      return jsonResponse(500, { ok: true, info: { component: '0.8.0' } })
    if (isRegisterPut(call)) return jsonResponse(200, {})
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'done')
  assert.equal(
    state.result.liveSite,
    CACHED.liveSite,
    'liveSite is not corrected on an unsuccessful verification'
  )
  assert.equal(state.result.webrootKey, CACHED.webrootKey)
  assert.equal(state.result.dbKey, CACHED.dbKey)
  assert.equal(calls.filter(isRegisterPut).length, 0, 'a 500 with an ok body never registers a credential')
})

test('a refused registration PUT is not reported as a successful recovery', async () => {
  seedHome()
  const calls = installFetch((call) => {
    if (isDoorCall(call) && call.body?.action === 'info')
      return jsonResponse(200, { ok: true, info: { component: '0.8.0' } })
    if (isRegisterPut(call)) return jsonResponse(403, { code: 'SEAT_NOT_AUTHORIZED' })
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'done')
  // The seat book refused the PUT, so the handover stays the cached http address — a refusal must
  // never read back as a corrected, secure recovery.
  assert.equal(state.result.liveSite, CACHED.liveSite)
  assert.ok(calls.some(isRegisterPut), 'registration was attempted')
})

test('the retry must match the archive source, not a saved webroot replaced under another subpath', async () => {
  // A later run saved a token under a different subpath, but the cached archive was read from the
  // root (`CACHED.liveSite`). An https retry naming that saved subpath does not name the archive's
  // source, so nothing is registered and the source identity is not rewritten.
  seedHome({ heldWebRoot: 'http://example.test/other' })
  const calls = installFetch((call) => {
    if (isDoorCall(call) && call.body?.action === 'info')
      return jsonResponse(200, { ok: true, info: { component: '0.8.0' } })
    if (isRegisterPut(call)) return jsonResponse(200, {})
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    adminUrl: 'https://example.test/other/administrator',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'done')
  assert.equal(state.result.liveSite, CACHED.liveSite)
  assert.equal(state.result.webrootKey, CACHED.webrootKey)
  assert.equal(state.result.dbKey, CACHED.dbKey)
  assert.equal(calls.length, 0, 'a retry that does not name the archive source verifies nothing')
  assert.equal(calls.filter(isRegisterPut).length, 0, 'and registers no credential')
})

test('non-cached saved token: an https retry registers over https before the export stops', async () => {
  seedHome({ handover: false })
  const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json'
  const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/pkg.zip'
  const calls = installFetch((call) => {
    if (call.method === 'GET' && call.url === MANIFEST)
      return jsonResponse(200, { version: '0.8.0', package: PACKAGE })
    if (isRegisterPut(call)) return jsonResponse(200, {})
    // A deliberate export refusal: the site answers db.tables with a plain refusal, which stops the
    // run after the credential has already been registered over https.
    if (isDoorCall(call) && call.body?.action === 'db.tables') return jsonResponse(200, { ok: false })
    if (isDoorCall(call) && call.body?.action === 'info')
      return jsonResponse(200, { ok: true, info: { component: '0.8.0' } })
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    adminUrl: 'https://example.test/administrator',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id)

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'call_failed')

  // The saved http webroot was upgraded to https from the explicit adminUrl intent, and the
  // credential was registered against that https endpoint with the synthetic saved token.
  const put = calls.find(isRegisterPut)
  assert.ok(put, 'the credential was registered before the export stopped')
  assert.ok(put.body.endpoint.startsWith('https://example.test'))
  assert.equal(put.body.token, HELD_TOKEN)
})

test('a pasted token no door answers on stops as cowork_not_answering, before any registration or read', async () => {
  // yido.eu, production 19/10/2026: a pasted token, no com_claudecowork on the site (Joomla's own
  // "component not found" on the front door, a server password on the administrator door). The run
  // used to read through the front door anyway and tell the customer "the site stopped answering".
  seedHome({ handover: false })
  const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json'
  const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/pkg.zip'
  const calls = installFetch((call) => {
    if (call.method === 'GET' && call.url === MANIFEST)
      return jsonResponse(200, { version: '0.8.0', package: PACKAGE })
    if (isDoorCall(call) && call.url.includes('/administrator/'))
      return new Response('<h1>Unauthorized</h1>', { status: 401 })
    if (isDoorCall(call))
      return jsonResponse(404, { error: true, code: 404, message: 'Komponente nicht gefunden' })
    if (call.method === 'GET' || call.method === 'HEAD') return new Response('', { status: 200 })
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    token: 'p'.repeat(48),
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id, 8000)

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'cowork_not_answering')
  // Both doors asked, twice: one second look absorbs a blip on the road.
  assert.equal(calls.filter((c) => isDoorCall(c) && c.body?.action === 'info').length, 4)
  assert.equal(
    calls.filter(isRegisterPut).length,
    0,
    'no credential registered for a token nothing answers on'
  )
  assert.ok(
    !calls.some((c) => c.body?.action === 'db.tables' || c.body?.action === 'files.pack'),
    'no export calls'
  )
})

test('a pasted token whose doors Cloudflare challenges stops as blocked_by_firewall, the firewall named', async () => {
  seedHome({ handover: false })
  const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json'
  const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/pkg.zip'
  const calls = installFetch((call) => {
    if (call.method === 'GET' && call.url === MANIFEST)
      return jsonResponse(200, { version: '0.8.0', package: PACKAGE })
    if (isDoorCall(call))
      return new Response('<title>Just a moment...</title>', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge', server: 'cloudflare' }
      })
    if (call.method === 'GET' || call.method === 'HEAD') return new Response('', { status: 200 })
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    token: 'p'.repeat(48),
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id, 8000)

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'blocked_by_firewall')
  assert.deepEqual(state.errorDetail, { firewall: 'cloudflare' })
  assert.equal(state.diagnostic.at, 'api_door')
  assert.equal(state.diagnostic.check, 'firewall')
  assert.equal(calls.filter(isRegisterPut).length, 0)
})

test('a pasted Joomla token sends Basic auth on the webroot probe', async () => {
  seedHome({ handover: false })
  const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json'
  const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/pkg.zip'
  const calls = installFetch((call) => {
    if (call.method === 'GET' && call.url === MANIFEST)
      return jsonResponse(200, { version: '0.8.0', package: PACKAGE })
    if (isDoorCall(call) && call.body?.action === 'info')
      return jsonResponse(200, { ok: true, info: { component: '0.8.0' } })
    if (isDoorCall(call) && call.body?.action === 'db.tables') return jsonResponse(200, { ok: false })
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    token: 'p'.repeat(48),
    webRootUrl: 'https://example.test',
    basicAuth: { username: 'extra', password: 'secret' },
    origin: ORIGIN,
    cookie: COOKIE
  })
  await settle(started.id)

  const probe = calls.find((call) => call.method === 'GET' && call.url === 'https://example.test/')
  assert.equal(probe.headers.get('authorization'), `Basic ${Buffer.from('extra:secret').toString('base64')}`)
})

test('a pasted Joomla token with an unanswered Basic challenge asks for the extra password', async () => {
  seedHome({ handover: false })
  const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json'
  const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/pkg.zip'
  installFetch((call) => {
    if (call.method === 'GET' && call.url === MANIFEST)
      return jsonResponse(200, { version: '0.8.0', package: PACKAGE })
    if (isDoorCall(call) && call.url.includes('/administrator/'))
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="Site admin"' }
      })
    if (isDoorCall(call)) return jsonResponse(404, { error: true, code: 404 })
    if (call.method === 'GET' || call.method === 'HEAD') return new Response('', { status: 200 })
    return null
  })

  const started = run.startRun({
    siteKey: 'example.test',
    platform: 'joomla',
    token: 'p'.repeat(48),
    webRootUrl: 'https://example.test',
    origin: ORIGIN,
    cookie: COOKIE
  })
  const state = await settle(started.id, 8000)

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'basic_auth_required')
  assert.deepEqual(state.diagnostic, {
    at: 'api_door',
    check: 'basic_challenge',
    status: 401,
    path: '/administrator/index.php'
  })
})
