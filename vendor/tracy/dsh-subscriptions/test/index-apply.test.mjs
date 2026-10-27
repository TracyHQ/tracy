import { test } from 'node:test'
import assert from 'node:assert/strict'

// #288 follow-up: index.js apply() sat at 7.8% coverage because the
// cordis context is only available inside the harness. This fake ctx
// pins the plugin entry contract: what gets provided, registered and
// wired, and that apply stays synchronous and disposable.

function fakeCtx() {
  const state = {
    provided: {},
    adapters: [],
    tools: [],
    routes: [],
    effects: [],
    injections: [],
    cleanups: [],
    emitted: [],
  }
  const ctx = {
    log: { warn() {}, error() {}, info() {} },
    logger: () => ({ warn() {}, error() {}, info() {} }),
    emit(name, payload) { state.emitted.push({ name, payload }) },
    provide(name, value) {
      state.provided[name] = value
      return () => { delete state.provided[name] }
    },
    effect(fn, label) {
      state.effects.push(label || '(unlabelled)')
      const cleanup = fn()
      const dispose = typeof cleanup === 'function' ? cleanup : () => {}
      state.cleanups.push(dispose)
      return dispose
    },
    inject(names, fn) {
      state.injections.push(names)
      fn(ctx)
      return () => {}
    },
    llm: {
      registerAdapter(providers, adapter) {
        state.adapters.push({ providers, adapter })
        return { dispose() {} }
      },
    },
    credentials: {
      get: async () => null,
      set: async () => {},
      list: async () => [],
      clearRef: async () => {},
    },
    webServer: {
      register(spec) { state.routes.push(spec); return () => {} },
      tapIndex(html) { return html },
    },
    settings: {
      register() {
        return { get: () => ({}), set: async () => {}, watch: () => () => {} }
      },
    },
    tools: { register(tool) { state.tools.push(tool); return () => {} } },
  }
  return { ctx, state }
}

async function loadPlugin() {
  const mod = await import('../lib/index.js')
  return mod
}

test('plugin metadata declares the cordis contract', async () => {
  const mod = await loadPlugin()
  assert.equal(mod.name, '@goodandready/dsh-subscriptions')
  assert.deepEqual(mod.inject, ['llm', 'credentials', 'webServer', 'settings'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.Config, 'function')
})

test('apply wires the plugin without throwing and provides its services', async () => {
  const mod = await loadPlugin()
  const { ctx, state } = fakeCtx()
  mod.apply(ctx, mod.plainConfig(mod.Config({})))
  try {
    assert.ok(state.provided.subscriptions, 'subscriptions service provided')
    assert.equal(typeof state.provided.subscriptions.request, 'function')
    assert.ok(state.provided.subscriptionImages, 'subscriptionImages service provided')
    assert.ok(state.routes.length > 0, 'routes registered')
    // The settings service is injected (describe/update/replace); only the removed
    // settings.register used to be called, and that is what must be gone.
    assert.ok(state.injections.some((n) => n.includes('settings')), 'settings injected')
    assert.ok(state.effects.length > 0, 'effects registered')
    for (const r of state.routes) assert.ok(r.path && r.handler, 'route shape')
    assert.ok(state.routes.some((r) => r.path === '/dsh-subscriptions/status'))
    assert.ok(state.routes.some((r) => r.path === '/dsh-subscriptions/config'))
  } finally {
    for (const c of state.cleanups) {
      try { c() } catch { /* disposal must not throw either */ }
    }
  }
})

test('apply is idempotent over a fresh ctx and disposes cleanly', async () => {
  const mod = await loadPlugin()
  const { ctx, state } = fakeCtx()
  mod.apply(ctx, mod.Config({}))
  assert.ok(Object.keys(state.provided).length >= 2)
  for (const c of state.cleanups) c()
  assert.deepEqual(Object.keys(state.provided), [], 'provide cleanups remove services')
})

test('config defaults are applied when apply is called with an empty object', async () => {
  const mod = await loadPlugin()
  const { ctx, state } = fakeCtx()
  mod.apply(ctx, {})
  try {
    assert.ok(state.provided.subscriptions)
  } finally {
    for (const c of state.cleanups) c()
  }
})

test("apply does not access undeclared properties on strict Cordis context proxy (#419)", async () => {
  const mod = await loadPlugin()
  const { ctx, state } = fakeCtx()
  const allowed = new Set([
    "llm", "credentials", "webServer", "settings",
    "log", "logger", "emit", "provide", "effect", "inject", "on", "slots", "tools",
    "Config", "apply", "name", "inject"
  ])
  const strictCtx = new Proxy(ctx, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !allowed.has(prop) && !(prop in target)) {
        throw new Error(`cannot get property "${prop}" without inject`)
      }
      return Reflect.get(target, prop, receiver)
    }
  })
  mod.apply(strictCtx, mod.Config({}))
  assert.ok(state.provided.subscriptions)
  for (const c of state.cleanups) c()
})
