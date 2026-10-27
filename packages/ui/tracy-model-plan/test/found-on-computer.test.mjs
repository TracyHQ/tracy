/**
 * "Found on this computer" (`src/client/found-on-computer.ts`): which vendors' programs the desktop
 * app found on this machine, through `window.tracyDesktop.app.agents.detect` (bridge protocol 2).
 * The web has no bridge, an older app has protocol 1: both answer nothing. Finding a program only
 * orders rows; it never says "connected".
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
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-found-'))
  const outfile = path.join(outDir, 'found.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'found-on-computer.ts')],
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

const noSleep = () => Promise.resolve()

/** A v2 bridge answering `answers` in turn (the last one repeats), recording each call. */
function bridge(answers, version = 2) {
  const calls = []
  return {
    calls,
    app: {
      protocolVersion: version,
      agents: {
        detect: async (ids) => {
          calls.push(ids)
          const next = answers[Math.min(calls.length - 1, answers.length - 1)]
          if (next instanceof Error) throw next
          return next
        }
      }
    }
  }
}

const result = (found, scanComplete, ids = ['claude', 'codex', 'copilot']) => ({
  results: ids.map((id) => ({ id, status: found.includes(id) ? 'found' : 'unknown' })),
  scanComplete
})

test('no bridge (the web) → nothing found, nothing asked', async () => {
  assert.deepEqual(await lib.foundOnComputer(['claude'], { app: undefined, sleep: noSleep }), [])
  assert.deepEqual(lib.desktopApp(undefined), undefined)
  assert.deepEqual(lib.desktopApp({}), undefined)
})

test('bridge protocol 1 (an older app) → nothing found, detect never called', async () => {
  const b = bridge([result(['claude'], true)], 1)
  assert.deepEqual(await lib.foundOnComputer(['claude'], { app: b.app, sleep: noSleep }), [])
  assert.equal(b.calls.length, 0)
})

test('v2: a fast first answer, then the complete one → every found vendor', async () => {
  const b = bridge([result(['claude'], false), result(['claude', 'copilot'], true)])
  const seen = []
  const slept = []
  const found = await lib.foundOnComputer(['claude', 'codex', 'copilot'], {
    app: b.app,
    sleep: (ms) => {
      slept.push(ms)
      return Promise.resolve()
    },
    onFound: (ids) => seen.push(ids)
  })
  assert.deepEqual(found, ['claude', 'copilot'])
  assert.deepEqual(b.calls, [
    ['claude', 'codex', 'copilot'],
    ['claude', 'codex', 'copilot']
  ])
  assert.deepEqual(slept, [1500])
  assert.deepEqual(seen, [['claude'], ['claude', 'copilot']])
})

test('v2: a scan that never completes is asked again at most 3 times', async () => {
  const b = bridge([result(['codex'], false)])
  assert.deepEqual(await lib.foundOnComputer(['claude', 'codex'], { app: b.app, sleep: noSleep }), ['codex'])
  assert.equal(b.calls.length, 4, 'one call, then three re-polls')
})

test('only status "found" counts; ids the page did not ask for are ignored', async () => {
  const b = bridge([
    {
      results: [
        { id: 'claude', status: 'not-found' },
        { id: 'codex', status: 'unsupported' },
        { id: 'kiro', status: 'found' },
        { id: 'stranger', status: 'found' }
      ],
      scanComplete: true
    }
  ])
  assert.deepEqual(await lib.foundOnComputer(['claude', 'codex', 'kiro'], { app: b.app, sleep: noSleep }), [
    'kiro'
  ])
})

test('errors and malformed answers → empty, no throw', async () => {
  const thrown = bridge([new Error('boom')])
  assert.deepEqual(await lib.foundOnComputer(['claude'], { app: thrown.app, sleep: noSleep }), [])
  const junk = bridge([null])
  assert.deepEqual(await lib.foundOnComputer(['claude'], { app: junk.app, sleep: noSleep }), [])
  const noAgents = { protocolVersion: 2 }
  assert.deepEqual(await lib.foundOnComputer(['claude'], { app: noAgents, sleep: noSleep }), [])
  // A later poll failing keeps what an earlier one found.
  const late = bridge([result(['claude'], false), new Error('gone')])
  assert.deepEqual(await lib.foundOnComputer(['claude', 'codex'], { app: late.app, sleep: noSleep }), [
    'claude'
  ])
})

test('an empty list asks nothing', async () => {
  const b = bridge([result([], true)])
  assert.deepEqual(await lib.foundOnComputer([], { app: b.app, sleep: noSleep }), [])
  assert.equal(b.calls.length, 0)
})

test('foundFirst: found vendors first, each group in its original order', () => {
  const providers = [
    { id: 'claude', name: 'Claude' },
    { id: 'codex', name: 'Codex' },
    { id: 'copilot', name: 'Copilot' },
    { id: 'kiro', name: 'Kiro' }
  ]
  assert.deepEqual(
    lib.foundFirst(providers, ['kiro', 'codex']).map((p) => p.id),
    ['codex', 'kiro', 'claude', 'copilot']
  )
  assert.equal(lib.foundFirst(providers, []), providers, 'nothing found → the same list')
})
