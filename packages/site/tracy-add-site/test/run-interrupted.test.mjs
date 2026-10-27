#!/usr/bin/env node
/**
 * An import cut by a dsh restart is told as interrupted and continues from the parts already
 * stored (#1565), driven through the REAL `startRun`, export and books.
 *
 * QA, 21/10/2026: a 628 MB webroot on a 38–133 KB/s uplink needed ~1.5 h; an unrelated deploy
 * replaced dsh after its 20 min drain ran out. `status` then answered `404 RUN_UNKNOWN`, the wizard
 * showed the empty chooser, and the upload cursor on disk was dropped anyway because it counted
 * 60 min from the FIRST part.
 *
 * Here: a WordPress site signed into with a password, its read held on the second part; a second
 * instance of the module stands for the dsh that comes back (same `DSH_HOME`, empty memory). It
 * must answer `interrupted` for the run, and a Continue with no password must go on from the
 * cursor — never re-send part 1, never open a second run for the site.
 *
 * Same world as `handover-lifecycle.test.mjs`: `run.ts` bundled with esbuild, a temporary
 * `DSH_HOME`, `fetch` mocked as a small WordPress site plus the artifact relay and the store.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

let buildDir
let runFile
let resume
let instances = 0
const homes = []

/** A fresh module instance: what a restarted dsh loads, with nothing in memory. */
async function freshDsh() {
  instances += 1
  return import(`${pathToFileURL(runFile).href}?instance=${instances}`)
}

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-interrupted-build-'))
  const bundle = async (entry, name) => {
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
    return file
  }
  runFile = await bundle('src/host/run.ts', 'run.mjs')
  resume = await import(pathToFileURL(await bundle('src/host/resume.ts', 'resume.mjs')).href)
})

after(() => {
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

beforeEach(() => {
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
const INSTALLED_TOKEN = 'c'.repeat(32)
const PASSWORD = 'synthetic-password'

function home() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-interrupted-home-'))
  homes.push(dir)
  mkdirSync(path.join(dir, 'tracy-add-site'), { recursive: true })
  process.env.DSH_HOME = dir
  return dir
}

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
 * One WordPress site with the Claude Cowork engine, the artifact relay and the store. The webroot
 * is three parts; `holdPart` makes the engine never answer that part's first ask, the way a dsh
 * killed mid-part never hears it.
 */
function world({ holdPart }) {
  const site = { tokens: new Set(), plugin: 'absent', installs: 0, logins: 0 }
  const packs = []
  const finished = []
  let serial = 0
  let held = false

  const engine = async (body) => {
    const { token, action, params } = body
    if (!site.tokens.has(token)) return json(200, { ok: false, error: 'unauthorized' })
    if (action === 'info') return json(200, { ok: true, info: { component: '0.8.0' } })
    if (action === 'db.tables') return json(200, { ok: true, tables: ['wp_posts'] })
    if (action === 'db.dump')
      return json(200, {
        ok: true,
        sql_b64: Buffer.from("INSERT INTO wp_posts VALUES ('x');\n").toString('base64'),
        next_cursor: null,
        next_offset: 1,
        done: true,
        rows: 1,
        total: 1
      })
    if (action === 'site.fingerprint') return json(200, { ok: false, error: 'unknown_action' })
    if (action === 'files.pack') {
      // The part is named by the cursor: '' is part 1, 'p2' part 2, 'p3' part 3.
      const part = params.path === '' ? 1 : Number(params.path.slice(1))
      packs.push({ part, put_url: params.put_url })
      if (part === holdPart && !held) {
        held = true
        return new Promise(() => {})
      }
      return json(200, {
        ok: true,
        etag: `etag-part-${part}`,
        files: 10,
        bytes: 8 * 1024 * 1024,
        next_path: part < 3 ? `p${part + 1}` : '',
        next_offset: 0,
        done: part === 3
      })
    }
    return null
  }

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
    if (method === 'POST' && url.endsWith('/import-result')) return Response.json({ ok: true })
    if (method === 'GET' && url === MANIFEST) return json(200, { version: '0.8.0', package: PACKAGE })
    if (method === 'GET' && url === PACKAGE) return new Response(new Uint8Array([80, 75, 3, 4]))
    if (method === 'GET' && url === `${WEBROOT}/`) return html('<html></html>', { url })
    if (method === 'POST' && url === API) return engine(body)

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
      if (step === 'artifacts/part')
        return json(200, { url: `https://store.test/part/${body.uploadId}/${body.partNumber}` })
      if (step === 'artifacts/finish') {
        finished.push(body)
        return json(200, {})
      }
      if (step === 'artifacts/delete' || step === 'artifacts/abort') return json(200, {})
      return null
    }
    if (method === 'PUT' && url.startsWith('https://store.test/db/'))
      return new Response(null, { status: 200 })

    if (method === 'GET' && url === LOGIN) return html('<form></form>', { url })
    if (method === 'POST' && url === LOGIN) {
      site.logins += 1
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
  const fetchImpl = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const res = await fetchImpl(url, init)
    if (!res) throw new TypeError(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
    return res
  }
  return { site, packs, finished }
}

async function until(check, budgetMs = 15_000) {
  const deadline = Date.now() + budgetMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time')
    await new Promise((r) => setTimeout(r, 10))
  }
}

async function settle(dsh, id, budgetMs = 30_000) {
  let state
  await until(() => {
    state = dsh.runStatus(id)
    return state && state.state !== 'running'
  }, budgetMs)
  return state
}

const base = { siteKey: SITE, platform: 'wordpress', origin: ORIGIN, cookie: COOKIE }

test('#1565: a run cut by a restart is interrupted, and Continue goes on from the stored parts with no password', async () => {
  const dir = home()
  const w = world({ holdPart: 2 })
  const before = await freshDsh()
  const first = before.startRun({ ...base, adminUrl: LOGIN, username: 'admin', password: PASSWORD })
  // Part 1 stored, part 2 on its way: the moment the deploy replaces dsh.
  await until(() => w.packs.some((p) => p.part === 2))
  const leaseFile = path.join(dir, 'leases', `${first.id}.json`)
  assert.ok(existsSync(leaseFile), 'the running import holds a deploy lease')

  // dsh comes back: same disk, empty memory.
  const after = await freshDsh()
  await after.restoreRuns()
  const cut = after.runStatus(first.id)
  assert.ok(cut, 'status knows the run instead of RUN_UNKNOWN')
  assert.equal(cut.state, 'error')
  assert.equal(cut.error, 'interrupted')
  assert.equal(cut.step, 'reading_files')
  assert.equal(cut.detail.parts, 1)
  assert.equal(cut.resumable, true, 'the code Claude Cowork minted is on disk: no password needed')
  assert.equal(after.runForSite(SITE).id, first.id)
  assert.ok(!existsSync(leaseFile), 'the dead run no longer looks like work a deploy must wait for')
  const told = JSON.stringify(cut)
  assert.ok(!told.includes(PASSWORD) && !told.includes(INSTALLED_TOKEN) && !told.includes(COOKIE))
  // Nothing of the password reached the disk either.
  for (const book of ['runs.json', 'uploads.json', 'site-tokens.json'])
    assert.ok(!readFileSync(path.join(dir, 'tracy-add-site', book), 'utf8').includes(PASSWORD), book)

  // No automatic re-run at boot: nothing was asked of the site after the restart.
  const packsAtRestart = w.packs.length
  const loginsAtRestart = w.site.logins
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(w.packs.length, packsAtRestart)

  // Continue: no credentials, the interrupted run named. A second press joins the same run.
  const resumed = after.startRun({ ...base, retryOf: first.id })
  const again = after.startRun({ ...base, retryOf: first.id })
  assert.notEqual(resumed.id, first.id)
  assert.equal(again.id, resumed.id, 'never two runs on one site')
  const done = await settle(after, resumed.id)
  assert.equal(done.state, 'done', JSON.stringify(done))

  assert.equal(w.site.logins, loginsAtRestart, 'no sign-in: the password was not needed')
  const afterRestart = w.packs.slice(packsAtRestart).map((p) => p.part)
  assert.deepEqual(afterRestart, [2, 3], 'part 1 was not sent again')
  // One archive: part 1 from before the restart, parts 2 and 3 after it.
  assert.equal(w.finished.length, 1)
  assert.deepEqual(
    w.finished[0].parts.map((p) => p.ETag),
    ['etag-part-1', 'etag-part-2', 'etag-part-3']
  )
})

test('#1565: a restart that finds no running import marks nothing', async () => {
  const dir = home()
  writeFileSync(
    path.join(dir, 'tracy-add-site', 'runs.json'),
    JSON.stringify({
      old: {
        id: 'old',
        siteKey: SITE,
        platform: 'wordpress',
        state: 'done',
        step: 'handing_over',
        detail: {},
        result: { webrootKey: 'w', dbKey: 'd', liveSite: WEBROOT },
        startedAt: Date.now() - 60_000,
        updatedAt: Date.now() - 30_000
      }
    })
  )
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  assert.equal(dsh.runStatus('old').state, 'done')
})

test('#1565: an upload cursor stays usable while parts keep landing, within a bound', async () => {
  home()
  const hour = 60 * 60_000
  const cursor = (startedAgo, updatedAgo) => ({
    key: 'k',
    uploadId: 'u',
    parts: [{ PartNumber: 1, ETag: 'e1' }],
    cursor: { path: 'a.php', offset: 1, size: 10 },
    files: 1,
    bytes: 1,
    startedAt: Date.now() - startedAgo,
    updatedAt: Date.now() - updatedAgo
  })
  // A 1.5 h read whose last part landed a minute ago: still the same read.
  await resume.rememberUpload('slow.test', cursor(1.5 * hour, 60_000))
  assert.ok(await resume.heldUpload('slow.test'))
  assert.equal(await resume.staleUpload('slow.test'), undefined)
  // Nothing landed for longer than an interrupted run stays on screen: stale.
  await resume.rememberUpload('idle.test', cursor(7 * hour, 6.5 * hour))
  assert.equal(await resume.heldUpload('idle.test'), undefined)
  assert.ok(await resume.staleUpload('idle.test'))
  // A read that kept moving for more than a day is still a mix of two sites: stale.
  await resume.rememberUpload('old.test', cursor(25 * hour, 60_000))
  assert.equal(await resume.heldUpload('old.test'), undefined)
})
