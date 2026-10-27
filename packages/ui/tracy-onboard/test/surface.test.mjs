/**
 * Where the Getting started screen keeps its two flags (`src/client/surface.ts`), against a fake
 * `fetch` and a fake desktop bridge:
 * - the account's door answers `closedAt` and `menuHiddenAt` (an older door without the second
 *   field means "not hidden");
 * - "Hide from account menu" posts to `/api/onboarding/menu-hide`, "Show in account menu" to
 *   `/api/onboarding/menu-show`; neither ever fails the caller;
 * - the desktop app reads both flags from the account; a failed account read rejects so an
 *   automatic first-run screen stays hidden.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let outDir = ''
/** @type {any} */
let surface

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-surface-'))
  const outfile = path.join(outDir, 'surface.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'surface.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  surface = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Every request made, in order: `[url, method]`. */
let requests = []
/** The door's answer to GET /api/onboarding. */
let flags = { completedAt: null, menuHiddenAt: null }
/** When set, every request fails this way: a status, or 'throw' for no network. */
let failure = null
let warnings = []

const fakeFetch = async (url, init = {}) => {
  requests.push([String(url), init.method ?? 'GET', init.credentials])
  if (failure === 'throw') throw new TypeError('network down')
  if (failure !== null) return { ok: false, status: failure, json: async () => ({}) }
  if (String(url) === '/api/onboarding') return { ok: true, status: 200, json: async () => flags }
  if (String(url) === '/api/onboarding/menu-show')
    return { ok: true, status: 200, json: async () => ({ menuHiddenAt: null }) }
  if (String(url) === '/api/onboarding/menu-hide')
    return { ok: true, status: 200, json: async () => ({ menuHiddenAt: '2026-10-12T01:00:00.000Z' }) }
  return { ok: false, status: 404, json: async () => ({}) }
}

beforeEach(() => {
  requests = []
  flags = { completedAt: null, menuHiddenAt: null }
  failure = null
  warnings = []
  console.warn = (...args) => warnings.push(args)
})

test('the account door: never closed, not hidden', async () => {
  const store = surface.accountStore(fakeFetch)
  assert.deepEqual(await store.get(), { closedAt: null, menuHiddenAt: null })
  assert.deepEqual(requests, [['/api/onboarding', 'GET', 'same-origin']])
})

test('the account door: both flags set come back as milliseconds', async () => {
  flags = { completedAt: '2026-10-11T18:00:00.000Z', menuHiddenAt: '2026-10-12T01:00:00.000Z' }
  const store = surface.accountStore(fakeFetch)
  assert.deepEqual(await store.get(), {
    closedAt: Date.UTC(2026, 9, 11, 18),
    menuHiddenAt: Date.UTC(2026, 9, 12, 1)
  })
})

test('an older door without `menuHiddenAt` means not hidden; an unreadable one means not hidden too', async () => {
  flags = { completedAt: null }
  assert.deepEqual(await surface.accountStore(fakeFetch).get(), { closedAt: null, menuHiddenAt: null })
  flags = { completedAt: null, menuHiddenAt: 'yesterday' }
  assert.deepEqual(await surface.accountStore(fakeFetch).get(), { closedAt: null, menuHiddenAt: null })
})

test('hideMenu posts to /api/onboarding/menu-hide with the session cookie', async () => {
  const store = surface.accountStore(fakeFetch)
  await store.hideMenu()
  assert.deepEqual(requests, [['/api/onboarding/menu-hide', 'POST', 'same-origin']])
})

test('hideMenu never fails the caller: a refused door and no network both resolve, warned once', async () => {
  const store = surface.accountStore(fakeFetch)
  failure = 403
  await store.hideMenu()
  failure = 'throw'
  await store.hideMenu()
  assert.equal(requests.length, 2)
  assert.equal(warnings.length, 1, 'one warning for the page, not one per click')
})

test('showMenu posts to /api/onboarding/menu-show with the session cookie', async () => {
  const store = surface.accountStore(fakeFetch)
  await store.showMenu()
  assert.deepEqual(requests, [['/api/onboarding/menu-show', 'POST', 'same-origin']])
})

test('showMenu never fails the caller: a refused door and no network both resolve, warned once', async () => {
  const store = surface.accountStore(fakeFetch)
  failure = 401
  await store.showMenu()
  failure = 'throw'
  await store.showMenu()
  assert.equal(requests.length, 2)
  assert.equal(warnings.length, 1, 'one warning for the page, not one per click')
})

test('the web surface is the account door', async () => {
  flags = { completedAt: null, menuHiddenAt: '2026-10-12T01:00:00.000Z' }
  const web = surface.webSurface(fakeFetch)
  assert.equal(web.agents, undefined)
  assert.equal(web.notifications, undefined)
  assert.deepEqual(await web.onboarding.get(), { closedAt: null, menuHiddenAt: Date.UTC(2026, 9, 12, 1) })
  assert.equal(surface.stepsOf(web), 3)
})

/** A protocol-2 bridge whose device closed the screen at `closedAt`. */
function app(closedAt) {
  return {
    agents: { detect: async () => ({ results: [], scanComplete: true }) },
    notifications: { status: async () => ({ supported: true, enabled: true }) },
    onboarding: {
      get: async () => ({ flowVersion: 1, closedAt, outcome: null, picked: null }),
      close: async (input) => ({ flowVersion: 1, closedAt: 1, ...input })
    }
  }
}

test('the desktop surface: the account decides both flags on a new or reused device', async () => {
  flags = { completedAt: '2026-10-01T00:00:00.000Z', menuHiddenAt: '2026-10-12T01:00:00.000Z' }
  const desktop = surface.desktopSurface(app(null), fakeFetch)
  assert.deepEqual(await desktop.onboarding.get(), {
    closedAt: Date.UTC(2026, 9, 1),
    menuHiddenAt: Date.UTC(2026, 9, 12, 1)
  })
  assert.equal(surface.stepsOf(desktop), 4)
  flags = { completedAt: null, menuHiddenAt: null }
  const closed = surface.desktopSurface(app(1760000000000), fakeFetch)
  assert.deepEqual(await closed.onboarding.get(), { closedAt: null, menuHiddenAt: null })
})

test('the desktop surface: a failed account read rejects even when the device has a flag', async () => {
  failure = 404
  const desktop = surface.desktopSurface(app(1760000000000), fakeFetch)
  await assert.rejects(desktop.onboarding.get(), /onboarding door answered 404/)
  failure = 'throw'
  await assert.rejects(desktop.onboarding.get(), /network down/)
  await desktop.onboarding.hideMenu()
})

test('the desktop surface: hideMenu and showMenu go to the account door', async () => {
  const desktop = surface.desktopSurface(app(null), fakeFetch)
  await desktop.onboarding.hideMenu()
  assert.deepEqual(requests.at(-1), ['/api/onboarding/menu-hide', 'POST', 'same-origin'])
  await desktop.onboarding.showMenu()
  assert.deepEqual(requests.at(-1), ['/api/onboarding/menu-show', 'POST', 'same-origin'])
})
