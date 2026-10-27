/**
 * The bridge reader (`src/client/bridge.ts`) and the scan of this computer (`src/client/scan.ts`):
 * the screen exists only in a desktop app speaking bridge protocol 2; the scan answers fast, then
 * asks again every 1.5 s until `scanComplete`, for at most `SCAN_CAP_MS` (past the app's 10 s
 * login-shell timeout). Refresh starts with
 * `agents.refresh` and continues the same way.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-scan-'))
  const outfile = path.join(outDir, 'scan.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export * from './bridge'; export * from './scan'`,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const result = (found, scanComplete, ids = ['claude', 'codex']) => ({
  results: ids.map((id) => ({ id, status: found.includes(id) ? 'found' : 'not-found' })),
  scanComplete
})

/** A full v2 app whose `agents` answer `answers` in turn (the last repeats). */
function appWith(answers, refreshAnswers = answers) {
  const calls = []
  const take = (list, n) => {
    const next = list[Math.min(n, list.length - 1)]
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  let detects = 0
  let refreshes = 0
  return {
    calls,
    app: {
      protocolVersion: 2,
      agents: {
        detect: (ids) => (calls.push(['detect', ids]), take(answers, detects++)),
        refresh: (ids) => (calls.push(['refresh', ids]), take(refreshAnswers, refreshes++))
      },
      onboarding: { get: async () => ({}), close: async () => ({}) },
      notifications: {
        status: async () => ({}),
        setEnabled: async () => ({}),
        test: async () => ({}),
        openSystemSettings: async () => {}
      }
    }
  }
}

test('onboardApp: nothing on the web, nothing for protocol 1 or a bridge missing a part', () => {
  assert.equal(lib.onboardApp(undefined), undefined)
  assert.equal(lib.onboardApp({}), undefined)
  assert.equal(lib.onboardApp({ tracyDesktop: {} }), undefined)
  const v1 = { tracyDesktop: { app: { ...appWith([]).app, protocolVersion: 1 } } }
  assert.equal(lib.onboardApp(v1), undefined)
  const partial = appWith([]).app
  delete partial.onboarding
  assert.equal(lib.onboardApp({ tracyDesktop: { app: partial } }), undefined)
  const full = appWith([]).app
  assert.equal(lib.onboardApp({ tracyDesktop: { app: full } }), full)
})

test('fast then complete: every answer reported, one re-ask after 1.5 s', async () => {
  const { app, calls } = appWith([result(['claude'], false), result(['claude', 'codex'], true)])
  const seen = []
  const slept = []
  const last = await lib.scanAgents(app, ['claude', 'codex'], {
    sleep: async (ms) => void slept.push(ms),
    onAnswer: (d) => seen.push(d.scanComplete)
  })
  assert.equal(last.scanComplete, true)
  assert.deepEqual(seen, [false, true])
  assert.deepEqual(slept, [1500])
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['detect', 'detect']
  )
})

test("a scan that never completes is asked again until past the app's 10 s shell timeout, then stops", async () => {
  // The app reads the login shell's PATH with a 10 s limit (tracy-desktop src/shell-path.js). Three
  // re-asks (4.5 s) gave up before a slow shell answered, and the screen kept "Looking…" for good
  // (measured on the packaged 0.6.0-dev.1, 11/10/2026).
  const { app, calls } = appWith([result(['claude'], false)])
  let waited = 0
  const last = await lib.scanAgents(app, ['claude', 'codex'], { sleep: async (ms) => void (waited += ms) })
  assert.equal(last.scanComplete, false)
  assert.ok(waited > 10_000, `asked for ${waited} ms`)
  assert.equal(waited, lib.MAX_REPOLLS * lib.REPOLL_MS)
  assert.ok(lib.MAX_REPOLLS * lib.REPOLL_MS >= lib.SCAN_CAP_MS)
  assert.equal(calls.length, lib.MAX_REPOLLS + 1)
})

test('refresh: starts with agents.refresh, then detect while incomplete', async () => {
  const { app, calls } = appWith([result(['codex'], true)], [result([], false)])
  const last = await lib.scanAgents(app, ['claude', 'codex'], { refresh: true, sleep: async () => {} })
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['refresh', 'detect']
  )
  assert.deepEqual(
    last.results.find((r) => r.id === 'codex'),
    { id: 'codex', status: 'found' }
  )
})

test('a first answer that fails or is malformed → null (the caller shows the scan failed)', async () => {
  assert.equal(
    await lib.scanAgents(appWith([new Error('gone')]).app, ['claude'], { sleep: async () => {} }),
    null
  )
  assert.equal(await lib.scanAgents(appWith([null]).app, ['claude'], { sleep: async () => {} }), null)
  assert.equal(
    await lib.scanAgents(appWith([{ results: 'x' }]).app, ['claude'], { sleep: async () => {} }),
    null
  )
})

test('a later failure keeps the last good answer; an abort stops asking', async () => {
  const late = appWith([result(['claude'], false), new Error('gone')])
  const kept = await lib.scanAgents(late.app, ['claude', 'codex'], { sleep: async () => {} })
  assert.equal(kept.results[0].status, 'found')

  const controller = new AbortController()
  const { app, calls } = appWith([result([], false)])
  const seen = []
  await lib.scanAgents(app, ['claude'], {
    signal: controller.signal,
    sleep: async () => controller.abort(),
    onAnswer: () => seen.push(1)
  })
  assert.equal(calls.length, 1)
  assert.equal(seen.length, 1)
})

test('no ids → no question asked', async () => {
  const { app, calls } = appWith([result([], true)])
  assert.equal(await lib.scanAgents(app, [], { sleep: async () => {} }), null)
  assert.equal(calls.length, 0)
})
