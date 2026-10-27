/**
 * What the desktop app adds to its own dsh before starting it, from the deployment's
 * `GET /api/desktop/config` (tasks/todo-desktop-surface.md part B; Lee, 07/10/2026).
 *
 *   node --test packages/desktop/tracy-desktop/test/plan-profile.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'

/** A temp folder removed when the test ends, pass or fail. */
function tempDir(t, prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const require = createRequire(import.meta.url)
const { planPatch, readDesktopConfig, PLAN_MODELS } = require('../src/plan-profile.js')
const { load } = require('js-yaml')

const ON = {
  llm: { connect: true, providers: ['claude', 'codex'] },
  tracyModel: { provider: null, model: null }
}

const rowsOf = (/** @type {string} */ text) => /** @type {any[]} */ (load(text))
const row = (/** @type {any[]} */ rows, /** @type {string} */ id) => rows.find((r) => r.id === id)

test('connecting on: settings come up, the plugin serves only the allowed vendors with its own card off, Model plan is on, routes follow their order', () => {
  const rows = rowsOf(/** @type {string} */ (planPatch(ON)))
  assert.equal(row(rows, 'settings').disabled, false)
  assert.equal(row(rows, 'config-editor').disabled, false)
  // The option names of dsh-subscriptions 0.6.60-tracy.3 (`lib/config-schema.js`): a wrong name is
  // dropped by the schema without a word, and the plugin would serve every vendor. Its own card is
  // off (`none`): Tracy's Settings › Model plan draws the plans instead.
  assert.deepEqual(row(rows, 'dsh-subscriptions').config, {
    cardPlacement: 'none',
    headerPill: false,
    slashCommands: false,
    allowedVendors: ['claude', 'codex'],
    ollamaFallback: false,
    cascadingFallback: false
  })
  assert.deepEqual(row(rows, 'tracy-mode-picker').config.customerRoutes, [
    { provider: 'claude', model: PLAN_MODELS.claude },
    { provider: 'codex', model: PLAN_MODELS.codex }
  ])
  // Settings › Model plan, inserted disabled by the native bundle, comes up only here.
  assert.deepEqual(row(rows, 'tracy-model-plan'), { id: 'tracy-model-plan', disabled: false })
  // The fleet's stand-downs this profile keeps: the LLM sign-in through pi-ai stays off.
  assert.equal(row(rows, 'authorization'), undefined)
  assert.equal(row(rows, 'ui-settings-models'), undefined)
})

test('connecting off, no vendor, or nothing readable: nothing is added', () => {
  assert.equal(planPatch({ llm: { connect: false, providers: ['claude'] } }), null)
  assert.equal(planPatch({ llm: { connect: true, providers: [] } }), null)
  assert.equal(planPatch(null), null)
  assert.equal(planPatch({ llm: 'yes' }), null)
})

test('a vendor this app has no model for is offered on the card but routes no conversation', () => {
  const rows = rowsOf(
    /** @type {string} */ (planPatch({ llm: { connect: true, providers: ['claude', 'newcomer'] } }))
  )
  assert.deepEqual(row(rows, 'dsh-subscriptions').config.allowedVendors, ['claude', 'newcomer'])
  assert.deepEqual(
    row(rows, 'tracy-mode-picker').config.customerRoutes.map((/** @type {any} */ r) => r.provider),
    ['claude']
  )
})

test('an id that is not a plain vendor word never reaches the patch', () => {
  const rows = rowsOf(
    /** @type {string} */ (planPatch({ llm: { connect: true, providers: ['claude', 'x: y\n- id: hmr'] } }))
  )
  assert.deepEqual(row(rows, 'dsh-subscriptions').config.allowedVendors, ['claude'])
  assert.equal(row(rows, 'hmr'), undefined)
})

/** A fetch that answers once with `body`, or fails. */
const fetchOf = (/** @type {unknown} */ body, ok = true) => {
  /** @type {{ url: string, init: any }[]} */
  const calls = []
  const fn = async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, init })
    if (body instanceof Error) throw body
    return { ok, status: ok ? 200 : 500, json: async () => body }
  }
  return Object.assign(fn, { calls })
}

test('the config is read without a cookie, with a short timeout, and kept for the next start', async (t) => {
  const dir = tempDir(t, 'plan-profile-')
  const cacheFile = path.join(dir, 'desktop-config.json')
  const fetch = fetchOf(ON)
  const read = await readDesktopConfig({ origin: 'http://rc2.tracy.test:31080', fetch, cacheFile })
  assert.deepEqual(read, { config: ON, source: 'server' })
  assert.equal(fetch.calls[0].url, 'http://rc2.tracy.test:31080/api/desktop/config')
  assert.equal(fetch.calls[0].init.credentials, 'omit')
  assert.ok(fetch.calls[0].init.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(readFileSync(cacheFile, 'utf8')), ON)
})

test('a server that does not answer: the last copy read is used; with none, nothing', async (t) => {
  const dir = tempDir(t, 'plan-profile-')
  const cacheFile = path.join(dir, 'desktop-config.json')
  assert.deepEqual(
    await readDesktopConfig({ origin: 'http://x', fetch: fetchOf(new Error('ECONNREFUSED')), cacheFile }),
    { config: null, source: 'none' }
  )
  writeFileSync(cacheFile, JSON.stringify(ON))
  assert.deepEqual(
    await readDesktopConfig({ origin: 'http://x', fetch: fetchOf(new Error('timeout')), cacheFile }),
    { config: ON, source: 'cache' }
  )
  assert.deepEqual(await readDesktopConfig({ origin: 'http://x', fetch: fetchOf({}, false), cacheFile }), {
    config: ON,
    source: 'cache'
  })
  // A broken answer is not cached over a good copy.
  await readDesktopConfig({ origin: 'http://x', fetch: fetchOf('not an object'), cacheFile })
  assert.deepEqual(JSON.parse(readFileSync(cacheFile, 'utf8')), ON)
})

test('no origin configured: nothing is fetched and nothing is used', async (t) => {
  const dir = tempDir(t, 'plan-profile-')
  const cacheFile = path.join(dir, 'desktop-config.json')
  const fetch = fetchOf(ON)
  assert.deepEqual(await readDesktopConfig({ origin: undefined, fetch, cacheFile }), {
    config: null,
    source: 'none'
  })
  assert.equal(fetch.calls.length, 0)
  assert.equal(existsSync(cacheFile), false)
})

test('every option the patch sets is one dsh-subscriptions declares, and every model route names one of its vendors', async () => {
  const plugin = '../../../../vendor/tracy/dsh-subscriptions/lib/'
  const { Config } = await import(`${plugin}config-schema.js`)
  const { BUILTIN_PROVIDERS } = await import(`${plugin}refs.js`)
  const declared = Object.keys(Config.dict)
  const rows = rowsOf(/** @type {string} */ (planPatch(ON)))
  for (const key of Object.keys(row(rows, 'dsh-subscriptions').config)) assert.ok(declared.includes(key), key)
  assert.deepEqual(Object.keys(PLAN_MODELS).sort(), [...BUILTIN_PROVIDERS].sort())
})

test('every vendor the server can offer (`DESKTOP_PROVIDERS`) has a model to route to here', async () => {
  const { DESKTOP_PROVIDERS } = await import('../../../../apps/tracy-web/src/lib/desktop-setting.js')
  for (const { id } of DESKTOP_PROVIDERS) assert.equal(typeof PLAN_MODELS[id], 'string', id)
})

test('the Referer is dropped only for the plan card’s own requests to the local dsh', () => {
  const { refererToDrop } = require('../src/plan-profile.js')
  const home = 'http://127.0.0.1:51731'
  assert.equal(refererToDrop(`${home}/dsh-subscriptions/ui`, home), true)
  assert.equal(refererToDrop(`${home}/dsh-subscriptions/oauth/start?provider=claude`, home), true)
  assert.equal(refererToDrop(`${home}/api/session/list`, home), false)
  assert.equal(refererToDrop('https://claude.ai/dsh-subscriptions/x', home), false)
  assert.equal(refererToDrop(`${home}/x/dsh-subscriptions/ui`, home), false)
  assert.equal(refererToDrop('not a url', home), false)
})
