#!/usr/bin/env node
/**
 * The host hands a finished read over to the fleet itself (#1652, `src/host/fleet-handover.ts`),
 * driven through the REAL `startRun`.
 *
 * The defect: the only caller of `POST /api/sites/:key/provision` was the wizard page, so an owner
 * who closed the tab while the files were packed got a run at `done` / `handing_over` and no copy
 * until they opened the recovery link (prod, 23/10/2026).
 *
 * Same harness as `handover-lifecycle.test.mjs`: `run.ts` bundled with esbuild, a temporary
 * `DSH_HOME`, `fetch` mocked as a small WordPress site with the Claude Cowork engine, the artifact
 * relay, the store and tracy-web's provision door. A lane restart is a second import of the same
 * bundle under another URL: a fresh module, with only what the first one left on disk.
 * The wizard's half (tab open, tab reopened mid-build) is `import-watch.test.mjs`.
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
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

let bundle
let buildDir
let run

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-fleet-handover-build-'))
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/run.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    write: false
  })
  bundle = path.join(buildDir, 'run.mjs')
  writeFileSync(bundle, built.outputFiles[0].text)
  run = await import(pathToFileURL(bundle).href)
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
  globalThis.fetch = () => {
    throw new TypeError('fetch was not installed for this test')
  }
})

const SITE = 'example.test'
const WEBROOT = 'https://example.test'
const API = `${WEBROOT}/wp-admin/admin-ajax.php?action=claude_cowork`
const ORIGIN = 'https://cowork.example.test'
const COOKIE = 'session=synthetic-cookie'
const MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/update.json'
const PACKAGE = 'https://github.com/TracyHQ/claude-cowork/releases/download/v0.8.0/claude-cowork.zip'
const TOKEN = 'a'.repeat(32)
const PROVISION = `${ORIGIN}/api/sites/${SITE}/provision`

function home() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-fleet-handover-home-'))
  homes.push(dir)
  mkdirSync(path.join(dir, 'tracy-add-site'), { recursive: true })
  process.env.DSH_HOME = dir
  return dir
}

const queued = (dir) => {
  const folder = path.join(dir, 'tracy-add-site', 'fleet-handovers')
  return existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.json')) : []
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * One WordPress site with the engine, the relay, the store, and tracy-web's provision door, which
 * answers from `door.answers` in order (the last repeats); a function answer may throw (no answer).
 */
function world({ answers = [() => json(202, { siteKey: SITE, jobId: 'job-1' })] } = {}) {
  const door = { answers, requests: [] }
  let serial = 0
  const answer = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    if (method === 'POST' && url.endsWith('/import-result')) return json(200, { ok: true })
    if (method === 'POST' && url === PROVISION) {
      door.requests.push({ body, cookie: new Headers(init.headers).get('cookie') })
      return door.answers[Math.min(door.requests.length - 1, door.answers.length - 1)]()
    }
    if (method === 'GET' && url === MANIFEST) return json(200, { version: '0.8.0', package: PACKAGE })
    if (method === 'GET' && url === `${WEBROOT}/`) {
      const response = new Response('<html></html>')
      Object.defineProperty(response, 'url', { value: url })
      return response
    }
    if (method === 'POST' && url === API) {
      if (body.token !== TOKEN) return json(200, { ok: false, error: 'unauthorized' })
      if (body.action === 'info') return json(200, { ok: true, info: { component: '0.8.0' } })
      // A component without the live fingerprint answers as the real one does.
      if (body.action === 'site.fingerprint') return json(200, { ok: false, error: 'unknown_action' })
      if (body.action === 'db.tables') return json(200, { ok: true, tables: ['wp_posts'] })
      if (body.action === 'db.dump')
        return json(200, {
          ok: true,
          sql_b64: Buffer.from("INSERT INTO wp_posts VALUES ('alpha');\n").toString('base64'),
          next_cursor: null,
          next_offset: 1,
          done: true,
          rows: 1,
          total: 1
        })
      if (body.action === 'files.pack')
        return json(200, {
          ok: true,
          etag: 'etag',
          files: 3,
          bytes: 42,
          next_path: '',
          next_offset: 0,
          done: true
        })
      return null
    }
    const relay = `${ORIGIN}/api/sites/${SITE}/`
    if (url.startsWith(relay)) {
      const step = url.slice(relay.length)
      if (method === 'PUT' && step === 'component-credential') return json(200, {})
      if (step === 'artifacts/put') {
        serial += 1
        return json(200, { key: `sites/example/db/${serial}.sql.gz`, url: `https://store.test/db/${serial}` })
      }
      if (step === 'artifacts/begin') {
        serial += 1
        return json(200, { key: `sites/example/webroot/${serial}.tar`, uploadId: `upload-${serial}` })
      }
      if (step === 'artifacts/part') return json(200, { url: `https://store.test/part/${serial}` })
      if (step === 'artifacts/finish') return json(200, {})
      return null
    }
    if (method === 'PUT' && url.startsWith('https://store.test/')) return new Response(null, { status: 200 })
    return null
  }
  globalThis.fetch = async (url, init) => {
    const res = await answer(String(url), init)
    if (!res) throw new TypeError(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
    return res
  }
  return door
}

/** Until the run is no longer `running` and its handover no longer `pending`. */
// Site calls are paced one a second (site-link.ts), and a WordPress read makes about seven of them.
async function settled(module, id, budgetMs = 15_000) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const state = module.runStatus(id)
    if (state && state.state !== 'running' && state.handover?.state !== 'pending') return state
    if (Date.now() > deadline) throw new Error(`run did not settle: ${JSON.stringify(state)}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

const start = (module = run) =>
  module.startRun({
    siteKey: SITE,
    platform: 'wordpress',
    origin: ORIGIN,
    cookie: COOKIE,
    token: TOKEN,
    webRootUrl: WEBROOT
  })

test('#1652 no tab: the finished read is handed over by the host, once, with the owner session', async () => {
  const dir = home()
  const door = world()
  const state = await settled(run, start().id)

  assert.equal(state.state, 'done')
  assert.deepEqual(state.handover, { state: 'filed', jobId: 'job-1' })
  assert.equal(door.requests.length, 1, 'one build request')
  assert.equal(door.requests[0].cookie, COOKIE)
  assert.deepEqual(door.requests[0].body, { platform: 'wordpress', ...state.result })
  assert.deepEqual(queued(dir), [], 'nothing left to send')
  // The run the status door shows carries no cookie, and the book on disk neither.
  assert.ok(!JSON.stringify(state).includes(COOKIE))
  assert.ok(!readFileSync(path.join(dir, 'tracy-add-site', 'runs.json'), 'utf8').includes(COOKIE))
})

test('#1652 lane restart between done and the handover: the next lane sends it at boot', async () => {
  const dir = home()
  // tracy-web cannot be reached while this lane finishes the read.
  const door = world({
    answers: [
      () => {
        throw new TypeError('fetch failed')
      }
    ]
  })
  const id = start().id
  const deadline = Date.now() + 15_000
  while (door.requests.length === 0 || run.runStatus(id)?.state === 'running') {
    if (Date.now() > deadline) throw new Error('the first lane never asked')
    await new Promise((r) => setTimeout(r, 5))
  }
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(run.runStatus(id).handover, { state: 'pending' })
  assert.equal(queued(dir).length, 1, 'kept on disk for the next attempt')
  const file = path.join(dir, 'tracy-add-site', 'fleet-handovers', queued(dir)[0])
  assert.equal(statSync(file).mode & 0o777, 0o600, 'it holds the owner session: private')

  // The lane restarts: a fresh module that knows only the disk, and tracy-web answers again.
  door.answers = [() => json(202, { siteKey: SITE, jobId: 'job-after-restart', reused: false })]
  const restarted = await import(`${pathToFileURL(bundle).href}?restart=${Date.now()}`)
  await restarted.settleFleetHandovers()
  const state = restarted.runStatus(id)
  assert.equal(state.state, 'done')
  assert.deepEqual(state.handover, { state: 'filed', jobId: 'job-after-restart' })
  assert.equal(door.requests.length, 2, 'the failed attempt and the one after the restart')
  assert.deepEqual(queued(dir), [])
  // The run book is written behind a queue: give it a moment, then the next lane reads it too.
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(dir, 'tracy-add-site', 'runs.json'), 'utf8'))[id].handover,
    { state: 'filed', jobId: 'job-after-restart' }
  )
})

test('#1652 a refusal is written on the run and not retried, so the wizard hands over itself', async () => {
  const dir = home()
  const door = world({ answers: [() => json(401, { code: 'NOT_SIGNED_IN' })] })
  const state = await settled(run, start().id)
  assert.deepEqual(state.handover, { state: 'refused', code: 'NOT_SIGNED_IN' })
  assert.equal(door.requests.length, 1)
  await run.settleFleetHandovers()
  assert.equal(door.requests.length, 1, 'a refusal is not asked again')
  assert.deepEqual(queued(dir), [])
})
