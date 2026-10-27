#!/usr/bin/env node
/**
 * A finished read that was already handed over is not handed over again to an import that brings
 * new credentials (#530), driven through the REAL `startRun`.
 *
 * The defect: a read finished, the fleet built the copy from it, the copy was deleted, and the
 * same site was imported again with a fresh admin login. The new run found the two-hour
 * finished-read cache (`handover.ts`) and handed the OLD read over in ~13 ms: the source was not
 * read, the new credentials were not used, Claude Cowork was not installed, the copy got old content.
 *
 * The plugin cannot learn that a handover reached the fleet: the wizard calls `/provision` on
 * `cowork-web` directly (`src/client/import.ts` `provisionImported`), never through a dsh door. So
 * the rule is the input: credentials given on this import mean "read the site now"; the cache
 * serves only a retry that brings none (the lane restarted between the read and the handover).
 *
 * Same harness as `handover-recovery.test.mjs`: `run.ts` bundled with esbuild, a temporary
 * `DSH_HOME`, `fetch` mocked as a small in-memory WordPress site plus the artifact relay and the
 * store. The run, the export, the token book and the cache are the real ones. One seam: the
 * `./handover.js` import is wrapped to count `takeOrSweep` calls, so a test can prove the
 * credentialed path never consults the cache at all.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const realFetch = globalThis.fetch
const realHome = process.env.DSH_HOME

let run
let buildDir

/** Wrap `run.ts`'s `./handover.js` so every `takeOrSweep` call is recorded in `globalThis`. */
const takeOrSweepSpy = {
  name: 'take-or-sweep-spy',
  setup(build) {
    build.onResolve({ filter: /^\.\/handover\.js$/ }, (args) =>
      args.importer === path.join(pkgRoot, 'src/host/run.ts')
        ? { path: 'handover', namespace: 'take-or-sweep-spy' }
        : undefined
    )
    build.onLoad({ filter: /.*/, namespace: 'take-or-sweep-spy' }, () => ({
      contents: [
        `import * as real from ${JSON.stringify(path.join(pkgRoot, 'src/host/handover.ts'))}`,
        'export const rememberHandover = real.rememberHandover',
        'export const rememberPartial = real.rememberPartial',
        'export const forgetHandover = real.forgetHandover',
        'export async function takeOrSweep(siteKey, remove) {',
        '  globalThis.__takeOrSweepCalls.push(siteKey)',
        '  return real.takeOrSweep(siteKey, remove)',
        '}'
      ].join('\n'),
      resolveDir: path.join(pkgRoot, 'src/host'),
      loader: 'js'
    }))
  }
}

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-lifecycle-build-'))
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/run.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    plugins: [takeOrSweepSpy],
    write: false
  })
  const file = path.join(buildDir, 'run.mjs')
  writeFileSync(file, built.outputFiles[0].text)
  run = await import(pathToFileURL(file).href)
})

const homes = []

after(() => {
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

beforeEach(() => {
  globalThis.__takeOrSweepCalls = []
  globalThis.fetch = () => {
    throw new TypeError('fetch was not installed for this test')
  }
})

const SITE = 'example.test'
const WEBROOT = 'https://example.test'
const API = `${WEBROOT}/wp-admin/admin-ajax.php?action=claude_cowork`
const ADMIN = `${WEBROOT}/wp-admin`
const LOGIN = `${WEBROOT}/wp-login.php`
const ORIGIN = 'https://cowork.example.test'
const COOKIE = 'session=synthetic-cookie'
const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/update.json'
const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/claude-cowork.zip'
const TOKEN_A = 'a'.repeat(32)
const TOKEN_B = 'b'.repeat(32)
const INSTALLED_TOKEN = 'c'.repeat(32)
const PASSWORD = 'synthetic-password'

/** A temporary DSH_HOME, optionally seeded with a raw `handovers.json` body. */
function home({ handovers } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-lifecycle-home-'))
  homes.push(dir)
  mkdirSync(path.join(dir, 'tracy-add-site'), { recursive: true })
  if (handovers !== undefined) writeFileSync(path.join(dir, 'tracy-add-site', 'handovers.json'), handovers)
  process.env.DSH_HOME = dir
  return dir
}

const handoversOf = (dir) =>
  JSON.parse(readFileSync(path.join(dir, 'tracy-add-site', 'handovers.json'), 'utf8'))

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({ 'content-type': 'application/json' })
  })
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
 * The world outside the plugin: one WordPress site with the Claude Cowork engine, the artifact relay
 * on `cowork-web`, and the store behind signed URLs. `site.content` is what a database read finds;
 * `site.tokens` are the tokens the engine accepts; `site.plugin` is what `plugins.php` shows.
 * `hold` lets a test defer one engine action until it releases it.
 */
function world() {
  const site = { content: 'alpha', tokens: new Set([TOKEN_A]), plugin: 'absent', installs: 0 }
  const store = new Map()
  const removed = []
  const calls = []
  const hold = new Map()
  let serial = 0

  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    const method = init.method ?? 'GET'
    let body
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    const call = { url, method, body }
    // Operation reporting is independent of the cached handover's site reads and writes.
    if (method === 'POST' && String(url).endsWith('/import-result')) return Response.json({ ok: true })
    // So is the host's own handover to the fleet once the read is done (#1652, `fleet-handover.ts`).
    if (method === 'POST' && String(url).endsWith('/provision'))
      return Response.json({ jobId: 'job-1' }, { status: 202 })
    calls.push(call)

    if (method === 'GET' && url === MANIFEST) return json(200, { version: '0.8.0', package: PACKAGE })
    if (method === 'GET' && url === PACKAGE) return new Response(new Uint8Array([80, 75, 3, 4]))

    // `resolveWebRoot`: the site answers where it was asked.
    if (method === 'GET' && url === `${WEBROOT}/`) return html('<html></html>', { url })

    // The engine.
    if (method === 'POST' && url === API) {
      const { token, action, params } = body
      if (!site.tokens.has(token)) return json(200, { ok: false, error: 'unauthorized' })
      const gate = hold.get(action)
      if (gate) {
        hold.delete(action)
        await gate
      }
      if (action === 'info') return json(200, { ok: true, info: { component: '0.8.0' } })
      // A component without the live fingerprint answers as the real one does.
      if (action === 'site.fingerprint') return json(200, { ok: false, error: 'unknown_action' })
      if (action === 'db.tables') return json(200, { ok: true, tables: ['wp_posts'] })
      if (action === 'db.dump') {
        const sql = `INSERT INTO wp_posts VALUES ('${site.content}');\n`
        return json(200, {
          ok: true,
          sql_b64: Buffer.from(sql).toString('base64'),
          next_cursor: null,
          next_offset: 1,
          done: true,
          rows: 1,
          total: 1
        })
      }
      if (action === 'files.pack') {
        store.set(params.put_url, `files of ${site.content}`)
        return json(200, {
          ok: true,
          etag: `etag-${serial}`,
          files: 3,
          bytes: 42,
          next_path: '',
          next_offset: 0,
          done: true
        })
      }
      return null
    }

    // The artifact relay on `cowork-web`, and the credential custody door.
    const relay = `${ORIGIN}/api/sites/${SITE}/`
    if (url.startsWith(relay)) {
      const step = url.slice(relay.length)
      if (method === 'PUT' && step === 'component-credential') return json(200, {})
      if (step === 'artifacts/put') {
        serial += 1
        return json(200, { key: `db/${serial}.sql.gz`, url: `https://store.test/db/${serial}.sql.gz` })
      }
      if (step === 'artifacts/begin') {
        serial += 1
        return json(200, { key: `webroot/${serial}.tar`, uploadId: `upload-${serial}` })
      }
      if (step === 'artifacts/part') return json(200, { url: `https://store.test/part/${body.key}` })
      if (step === 'artifacts/finish') return json(200, {})
      if (step === 'artifacts/delete') {
        removed.push(body.key)
        return json(200, {})
      }
      return null
    }
    if (method === 'PUT' && url.startsWith('https://store.test/db/')) {
      const key = url.slice('https://store.test/'.length)
      store.set(key, gunzipSync(Buffer.from(init.body)).toString('utf8'))
      return new Response(null, { status: 200 })
    }

    // WordPress admin: sign in, install, read the token the plugin minted.
    if (method === 'GET' && url === LOGIN) return html('<form></form>', { url })
    if (method === 'POST' && url === LOGIN) {
      const form = new URLSearchParams(String(init.body))
      const good = form.get('pwd') === PASSWORD
      return html('', {
        status: 302,
        location: `${ADMIN}/`,
        setCookie: good ? ['wordpress_logged_in_x=1; Path=/'] : []
      })
    }
    if (method === 'GET' && url === `${ADMIN}/plugin-install.php?tab=upload`)
      return html('<input type="hidden" name="_wpnonce" value="abc123">', { url })
    if (method === 'POST' && url === `${ADMIN}/update.php?action=upload-plugin`) {
      site.installs += 1
      site.plugin = 'inactive'
      return html('<p>Plugin installed.</p>')
    }
    if (method === 'GET' && url === `${ADMIN}/plugins.php`) {
      if (site.plugin === 'active')
        return html('<a href="plugins.php?action=deactivate&amp;plugin=claude-cowork%2Fcc.php">x</a>')
      if (site.plugin === 'inactive')
        return html('<a href="plugins.php?action=activate&amp;plugin=claude-cowork%2Fcc.php">x</a>')
      return html('<p>No plugins.</p>')
    }
    if (method === 'GET' && url.startsWith(`${ADMIN}/plugins.php?action=activate`)) {
      site.plugin = 'active'
      site.tokens.add(INSTALLED_TOKEN)
      return html('<p>Activated.</p>')
    }
    if (method === 'GET' && url === `${ADMIN}/options-general.php?page=claude-cowork`)
      return html(`<input id="claude_cowork_token" type="text" value="${INSTALLED_TOKEN}">`)

    return null
  }

  // Unknown requests fail loudly rather than answering something plausible.
  const fetchImpl = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const res = await fetchImpl(url, init)
    if (!res) throw new TypeError(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
    return res
  }

  return { site, store, removed, calls, hold }
}

// Site calls are paced one a second (site-link.ts), and a WordPress read makes about seven of them.
async function settle(id, budgetMs = 15_000) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const state = run.runStatus(id)
    if (state && state.state !== 'running') return state
    if (Date.now() > deadline) throw new Error('run did not settle in time')
    await new Promise((r) => setTimeout(r, 5))
  }
}

const start = (input) =>
  run.startRun({ siteKey: SITE, platform: 'wordpress', origin: ORIGIN, cookie: COOKIE, ...input })

const engineCalls = (calls, action) => calls.filter((c) => c.url === API && c.body?.action === action)

/** A complete first import: pasted token, the site read, the finished read cached on disk. */
async function firstImport(w) {
  const state = await settle(start({ token: TOKEN_A, webRootUrl: WEBROOT }).id)
  assert.equal(state.state, 'done', 'the first import finished')
  assert.match(w.store.get(state.result.dbKey), /alpha/)
  return state.result
}

/** The fleet took the read and built a copy; then the copy was deleted and the source changed. */
function handedOverThenSourceChanged(w, result) {
  const fleetTook = { ...result }
  w.site.content = 'BETA'
  // The copy's teardown and a re-install on the source leave the first token dead.
  w.site.tokens = new Set()
  w.calls.length = 0
  return fleetTook
}

test('#530: re-import with an admin login after a handover reads the site again', async () => {
  const dir = home()
  const w = world()
  const first = await firstImport(w)
  assert.deepEqual(handoversOf(dir)[SITE].result, first, 'the finished read was cached')
  handedOverThenSourceChanged(w, first)
  globalThis.__takeOrSweepCalls = []

  const again = start({ adminUrl: LOGIN, username: 'admin', password: PASSWORD })
  const state = await settle(again.id)

  assert.equal(state.state, 'done')
  assert.notEqual(state.result.dbKey, first.dbKey, 'a new dump, not the cached one')
  assert.notEqual(state.result.webrootKey, first.webrootKey, 'a new archive, not the cached one')
  assert.match(w.store.get(state.result.dbKey), /BETA/, 'the new dump holds the current content')
  assert.doesNotMatch(w.store.get(state.result.dbKey), /alpha/)

  // Signed in with the credentials just given, installed Claude Cowork, and read with its new token.
  assert.ok(
    w.calls.some((c) => c.method === 'POST' && c.url === LOGIN),
    'signed in'
  )
  assert.equal(w.site.installs, 1, 'Claude Cowork was installed')
  const tables = engineCalls(w.calls, 'db.tables')
  assert.equal(tables.length, 1, 'the database was read')
  assert.equal(tables[0].body.token, INSTALLED_TOKEN)
  assert.equal(engineCalls(w.calls, 'files.pack').length, 1, 'the files were read')

  // The cache was never consulted, and the read the fleet took was not deleted from the store.
  assert.deepEqual(globalThis.__takeOrSweepCalls, [])
  assert.deepEqual(w.removed, [])
  assert.deepEqual(handoversOf(dir)[SITE].result, state.result, 'the new read replaced the old line')

  const dump = JSON.stringify(state)
  assert.ok(!dump.includes(PASSWORD) && !dump.includes(INSTALLED_TOKEN) && !dump.includes(COOKIE))
})

test('#530: re-import with a newly pasted token uses that token and reads the site again', async () => {
  home()
  const w = world()
  const first = await firstImport(w)
  handedOverThenSourceChanged(w, first)
  w.site.tokens = new Set([TOKEN_B])
  globalThis.__takeOrSweepCalls = []

  const state = await settle(start({ token: TOKEN_B, webRootUrl: WEBROOT }).id)

  assert.equal(state.state, 'done')
  assert.notEqual(state.result.dbKey, first.dbKey)
  assert.match(w.store.get(state.result.dbKey), /BETA/)
  const engine = w.calls.filter((c) => c.url === API)
  assert.ok(
    engine.length > 0 && engine.every((c) => c.body.token === TOKEN_B),
    'every engine call used the pasted token'
  )
  const put = w.calls.find((c) => c.method === 'PUT' && c.url.endsWith('/component-credential'))
  assert.equal(put.body.token, TOKEN_B, 'the pasted token was registered, not the old one')
  assert.deepEqual(globalThis.__takeOrSweepCalls, [])
  assert.deepEqual(w.removed, [])
  const dump = JSON.stringify(state)
  assert.ok(!dump.includes(TOKEN_B) && !dump.includes(TOKEN_A))
})

test('a read that never reached the fleet: a retry without credentials still takes the fast path', async () => {
  home()
  const w = world()
  const first = await firstImport(w)
  w.site.content = 'BETA'
  w.calls.length = 0
  globalThis.__takeOrSweepCalls = []

  const state = await settle(start({}).id)

  assert.equal(state.state, 'done')
  assert.equal(state.step, 'handing_over')
  assert.deepEqual(state.result, first, 'the cached read, unchanged')
  assert.deepEqual(globalThis.__takeOrSweepCalls, [SITE])
  assert.equal(w.calls.length, 0, 'no sign-in, no install, no read, no store call')
})

test('incomplete credentials fail with credentials_required, never the cached read', async () => {
  for (const input of [
    { password: PASSWORD },
    { username: 'admin', password: PASSWORD },
    { adminUrl: LOGIN, password: PASSWORD },
    { adminUrl: LOGIN, username: 'admin' },
    { token: TOKEN_B },
    { basicAuth: { username: 'gate', password: 'gate' } }
  ]) {
    home()
    const w = world()
    await firstImport(w)
    w.calls.length = 0
    globalThis.__takeOrSweepCalls = []

    const state = await settle(start(input).id)

    assert.equal(state.state, 'error', JSON.stringify(Object.keys(input)))
    assert.equal(state.error, 'credentials_required')
    assert.equal(state.result, undefined)
    assert.deepEqual(globalThis.__takeOrSweepCalls, [])
    assert.equal(w.calls.length, 0)
  }
})

test('the start door: credentials sent blank are still sent — credentials_required, never the cached read', async () => {
  // `index.ts` `handleStart` builds the run's credentials with `credentialsFrom(body)`. A blank or
  // whitespace-only field used to read as "not given", so a blank token or login took the cache.
  for (const body of [
    { token: '' },
    { token: '   ', webRootUrl: WEBROOT },
    { token: null, webRootUrl: WEBROOT },
    { adminUrl: LOGIN, username: '', password: '' },
    { adminUrl: LOGIN, username: '  ', password: PASSWORD },
    { adminUrl: LOGIN, username: 'admin', password: ' ' },
    { password: '' },
    { basicAuth: { username: '', password: '' } },
    {
      adminUrl: LOGIN,
      username: 'admin',
      password: PASSWORD,
      basicAuth: { username: 'gate', password: ' ' }
    },
    { adminUrl: LOGIN, username: 'admin', password: PASSWORD, basicAuth: {} }
  ]) {
    home()
    const w = world()
    await firstImport(w)
    w.calls.length = 0
    globalThis.__takeOrSweepCalls = []

    const state = await settle(
      start({ webRootUrl: body.webRootUrl, adminUrl: body.adminUrl, ...run.credentialsFrom(body) }).id
    )

    assert.equal(state.state, 'error', JSON.stringify(body))
    assert.equal(state.error, 'credentials_required')
    assert.equal(state.result, undefined)
    assert.deepEqual(globalThis.__takeOrSweepCalls, [])
    assert.equal(w.calls.length, 0)
  }
})

test('the start door: a body with no credential field at all is a retry and takes the fast path', async () => {
  home()
  const w = world()
  const first = await firstImport(w)
  w.calls.length = 0
  globalThis.__takeOrSweepCalls = []

  const credentials = run.credentialsFrom({ siteKey: SITE, platform: 'wordpress' })
  assert.deepEqual(credentials, {
    username: undefined,
    password: undefined,
    basicAuth: undefined,
    token: undefined
  })
  const state = await settle(start(credentials).id)

  assert.equal(state.state, 'done')
  assert.deepEqual(state.result, first)
  assert.deepEqual(globalThis.__takeOrSweepCalls, [SITE])
})

test('wrong credentials keep the importer error, never the cached read', async () => {
  home()
  const w = world()
  await firstImport(w)
  w.site.tokens = new Set()

  const login = await settle(start({ adminUrl: LOGIN, username: 'admin', password: 'wrong' }).id)
  assert.equal(login.state, 'error')
  assert.equal(login.error, 'invalid_credential')
  // A bare redirect without the cookie names no reason: the run says it could not read one. Of the
  // username only its shape is kept.
  assert.deepEqual(login.diagnostic, {
    at: 'login_post',
    check: 'message_unread',
    username_is_email: false
  })
  assert.equal(login.result, undefined)

  const pasted = await settle(start({ token: TOKEN_B, webRootUrl: WEBROOT }).id)
  assert.equal(pasted.state, 'error')
  assert.equal(pasted.error, 'call_failed')
  assert.equal(pasted.result, undefined)
})

test('a failure after the cache is bypassed stays a failure', async () => {
  home()
  const w = world()
  await firstImport(w)
  w.site.tokens.add(TOKEN_B)

  // The store refuses the dump.
  const refusing = globalThis.fetch
  globalThis.fetch = async (url, init) =>
    String(url).endsWith('/artifacts/put') ? json(503, { code: 'STORE_DOWN' }) : refusing(url, init)
  const stored = await settle(start({ token: TOKEN_B, webRootUrl: WEBROOT }).id)
  assert.equal(stored.state, 'error')
  assert.equal(stored.error, 'store_refused')
  assert.equal(stored.result, undefined)

  // The manifest cannot be read.
  globalThis.fetch = async (url, init) => (String(url) === MANIFEST ? json(500, {}) : refusing(url, init))
  const manifest = await settle(start({ adminUrl: LOGIN, username: 'admin', password: PASSWORD }).id)
  assert.equal(manifest.state, 'error')
  assert.equal(manifest.error, 'manifest_unreachable')
  assert.equal(manifest.result, undefined)
})

test('whatever the cache holds, a credentialed import reads the site and deletes nothing', async () => {
  const stale = JSON.stringify({
    [SITE]: {
      result: { webrootKey: 'webroot/old.tar', dbKey: 'db/old.sql.gz', liveSite: WEBROOT },
      finishedAt: Date.now() - 3 * 60 * 60_000
    }
  })
  for (const handovers of [undefined, '', 'not json', '[]', stale]) {
    home({ handovers })
    const w = world()
    const state = await settle(start({ token: TOKEN_A, webRootUrl: WEBROOT }).id)
    assert.equal(state.state, 'done', `handovers.json = ${JSON.stringify(handovers)}`)
    assert.match(w.store.get(state.result.dbKey), /alpha/)
    assert.deepEqual(w.removed, [], 'an expired read is not swept on this path: the fleet may hold it')
    assert.deepEqual(globalThis.__takeOrSweepCalls, [])
  }
})

test('the finished read cannot be written: the run fails instead of reporting done', async () => {
  const dir = home()
  // A directory where the book goes: the atomic rename onto it fails.
  mkdirSync(path.join(dir, 'tracy-add-site', 'handovers.json', 'blocker'), { recursive: true })
  world()

  const state = await settle(start({ token: TOKEN_A, webRootUrl: WEBROOT }).id)

  assert.equal(state.state, 'error')
  assert.equal(state.error, 'unexpected')
  assert.equal(state.result, undefined)
  assert.deepEqual(globalThis.__takeOrSweepCalls, [])
})

test('D1: overlapping starts for one site adopt the same active read', async () => {
  home()
  const w = world()
  await firstImport(w)
  w.site.content = 'BETA'
  w.site.tokens.add(TOKEN_B)

  // Hold the actual read while a second tab submits its start.
  let release
  w.hold.set('db.tables', new Promise((resolve) => (release = resolve)))
  const fresh = start({ token: TOKEN_B, webRootUrl: WEBROOT })
  for (let i = 0; i < 400 && w.hold.size > 0; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(w.hold.size, 0, 'the credentialed run reached its database read')
  const adopted = start({})
  release()
  const read = await settle(fresh.id)

  assert.equal(adopted.id, fresh.id, 'a second active read was opened for the same site')
  assert.equal(read.state, 'done')
  assert.match(w.store.get(read.result.dbKey), /BETA/, 'the credentialed run was not handed the cached read')
})

test('D1: two retries of one failed run start only one replacement even after it has failed', async () => {
  home()
  world()
  const failed = await settle(start({ username: '', password: '' }).id)
  assert.equal(failed.state, 'error')
  const replacement = await settle(start({ username: '', password: '', retryOf: failed.id }).id)
  assert.equal(replacement.state, 'error')
  assert.notEqual(replacement.id, failed.id)
  const repeated = start({ username: '', password: '', retryOf: failed.id })
  assert.equal(repeated.id, replacement.id, 'a late retry of the same failure opened another read')
  await settle(repeated.id)
})
