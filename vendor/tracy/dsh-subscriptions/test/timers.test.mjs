import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { serializeBlob } from '../lib/blob.js'

// #302: the background refresh/probe loops must be safe no-ops on an
// empty or far-from-expiry config, and every timer must die on dispose.
// mock.timers + a recording global fetch keep this deterministic and
// network-free.

function fakeCtx(config) {
  const state = { provided: {}, effects: [], cleanups: [], routes: [] }
  const ctx = {
    log: { warn() {}, error() {}, info() {} },
    emit() {},
    provide(name, value) { state.provided[name] = value; return () => { delete state.provided[name] } },
    effect(fn, label) { state.effects.push(label); const c = fn(); const d = typeof c === 'function' ? c : () => {}; state.cleanups.push(d); return d },
    inject(names, fn) { fn(ctx); return () => {} },
    llm: { registerAdapter() { return { dispose() {} } } },
    credentials: {
      async resolve(_ref) {
        if (config && config.slots && config.slots.length) {
          return { value: serializeBlob({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3600 * 1000 }) }
        }
        return null
      },
      async set() {}, async unset() {},
      async describe(_ref) { return { configured: Boolean(config && config.slots && config.slots.length), writable: true } },
    },
    webServer: { register(spec) { state.routes.push(spec); return () => {} }, tapIndex(h) { return h } },
    settings: { register(ns, cfg, opts) { return { get: () => (opts && opts.base) || config || {}, set: async () => {}, watch: () => () => {} } } },
    tools: { register() { return () => {} } },
  }
  return { ctx, state }
}

async function loadMod() { return import('../lib/index.js') }

test('background ticks are safe no-ops on an empty config and never touch the network', async () => {
  const mod = await loadMod()
  const fetchCalls = []
  const origFetch = globalThis.fetch
  globalThis.fetch = async (...a) => { fetchCalls.push(a[0]); return new Response('{}', { status: 200 }) }
  try { mock.timers.reset() } catch {}
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  try {
    const { ctx, state } = fakeCtx({})
    mod.apply(ctx, mod.Config({}))
    await mock.timers.tick(10 * 60 * 1000)
    await new Promise((r) => globalThis.setImmediate(r))

    const external = fetchCalls.filter((u) => !String(u).includes('127.0.0.1') && !String(u).includes('localhost'))
    assert.deepEqual(external, [], 'empty config must not trigger any external vendor request')
    for (const c of state.cleanups) { try { c() } catch (e) { assert.fail('dispose threw: ' + e.message) } }
  } finally {
    mock.timers.reset()
    globalThis.fetch = origFetch
  }
})

test('refresh-ahead skips blobs that are far from expiry', async () => {
  const mod = await loadMod()
  const fetchCalls = []
  const origFetch = globalThis.fetch
  globalThis.fetch = async (...a) => { fetchCalls.push(a[0]); return new Response('{}', { status: 200 }) }
  try { mock.timers.reset() } catch {}
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  try {
    const cfg = { slots: [{ provider: 'codex', index: 1, label: 'x' }], refreshAheadMs: 5 * 60 * 1000 }
    const { ctx, state } = fakeCtx(cfg)
    mod.apply(ctx, mod.Config(cfg))
    await mock.timers.tick(5 * 60 * 1000)
    await new Promise((r) => globalThis.setImmediate(r))

    const external = fetchCalls.filter((u) => !String(u).includes('127.0.0.1') && !String(u).includes('localhost'))
    // Eager usage/model probes (#75) are expected at startup; a token
    // refresh for a blob that is hours from expiry is not.
    const refreshes = external.filter((u) => /oauth\/token|\/auth\//.test(String(u)))
    assert.deepEqual(refreshes, [], 'a blob one hour from expiry must not refresh')
    for (const c of state.cleanups) { try { c() } catch (e) { assert.fail('dispose threw: ' + e.message) } }
  } finally {
    mock.timers.reset()
    globalThis.fetch = origFetch
  }
})

test('probe loop respects probeIntervalMin gating and disposal', async () => {
  const mod = await loadMod()
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try { mock.timers.reset() } catch {}
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  try {
    const cfg = { probeIntervalMin: 0 }
    const { ctx, state } = fakeCtx(cfg)
    mod.apply(ctx, mod.Config(cfg))
    await mock.timers.tick(60 * 60 * 1000)
    for (const c of state.cleanups) { try { c() } catch (e) { assert.fail('dispose threw: ' + e.message) } }
    assert.ok(state.effects.some((l) => String(l).includes('refresh ahead')))
  } finally {
    mock.timers.reset()
    globalThis.fetch = origFetch
  }
})
