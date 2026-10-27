import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeBlob } from '../lib/blob.js'

function makeCtx({ config, globalProviders = [], vault = {}, onReplace = null }) {
  const state = {
    registeredAdapters: [],
    replacedAdapters: [],
    settingsReplaced: [],
    cleanups: [],
    logs: [],
  }

  let activeHandle = null

  const ctx = {
    logger() {
      return {
        info(msg) { state.logs.push({ level: 'info', msg }) },
        warn(msg) { state.logs.push({ level: 'warn', msg }) },
        debug(msg) { state.logs.push({ level: 'debug', msg }) },
      }
    },
    emit() {},
    provide() { return () => {} },
    effect(fn) {
      const c = fn()
      const d = typeof c === 'function' ? c : () => {}
      state.cleanups.push(d)
      return d
    },
    inject(names, fn) {
      fn(ctx)
      return () => {}
    },
    llm: {
      listProviders() {
        const ourProviders = activeHandle ? activeHandle.providers : []
        const all = [...globalProviders]
        for (const p of ourProviders) {
          if (!all.includes(p)) all.push(p)
        }
        return all.map((id) => ({ id, name: id }))
      },
      registerAdapter(providers, adapter) {
        // If any provider is already in globalProviders, throw DUPLICATE_ADAPTER (matching Cordis llm service)
        for (const p of providers) {
          if (globalProviders.includes(p)) {
            const err = new Error(`an adapter for provider "${p}" is already registered`)
            err.code = 'DUPLICATE_ADAPTER'
            throw err
          }
        }
        activeHandle = {
          providers: [...providers],
          adapter,
          disposed: false,
          replace(next) {
            state.replacedAdapters.push([...next])
            activeHandle.providers = [...next]
            if (onReplace) onReplace(next)
          },
        }
        const dispose = () => {
          if (activeHandle) activeHandle.disposed = true
          activeHandle = null
        }
        dispose.replace = activeHandle.replace
        state.registeredAdapters.push(providers)
        return dispose
      },
    },
    credentials: {
      async resolve(ref) {
        const raw = vault[ref]
        if (!raw) return null
        return { value: typeof raw === 'string' ? raw : serializeBlob(raw) }
      },
      async set(ref, val) {
        vault[ref] = val
      },
      async unset(ref) {
        delete vault[ref]
      },
      async describe(ref) {
        const val = vault[ref]
        if (!val) return { configured: false }
        const parsed = typeof val === 'string' ? JSON.parse(val) : val
        return { configured: true, label: parsed.label || parsed.email || '' }
      },
    },
    webServer: {
      register() { return () => {} },
      tapIndex(h) { return h },
    },
    settings: (function () {
      let current = config || {}
      return {
        // The host settings service in DSH 0.1.7-rc.2 and 0.2.0: describe/update/replace.
        // settings.register was removed before 0.1.7-rc.2.
        describe() {
          return [{ ns: 'dsh-subscriptions', value: current, revision: 0, status: 'ready' }]
        },
        async update(ns, patch) {
          current = { ...current, ...patch }
          state.settingsReplaced.push(current)
        },
        async replace(ns, section) {
          current = section
          state.settingsReplaced.push(current)
        },
      }
    })(),
    tools: { register() { return () => {} } },
  }

  return { ctx, state }
}

async function loadMod() { return import('../lib/index.js') }

test('syncAdapter: skips already-bound providers owned by sibling plugin without throwing DUPLICATE_ADAPTER', async () => {
  const mod = await loadMod()
  // Sibling plugin already registered 'antigravity'
  const globalProviders = ['antigravity']
  const vault = {
    ANTIGRAVITY_OAUTH_1: serializeBlob({ accessToken: 'at-anti', refreshToken: 'rt-anti' }),
    CODEX_OAUTH_1: serializeBlob({ accessToken: 'at-codex', refreshToken: 'rt-codex' }),
  }
  const cfg = {
    slots: [
      { provider: 'antigravity', index: 1, label: 'work' },
      { provider: 'codex', index: 1, label: 'main' },
    ],
  }

  const { ctx, state } = makeCtx({ config: cfg, globalProviders, vault })
  mod.apply(ctx, mod.Config(cfg))

  // Allow effects and microtasks to settle
  await new Promise((r) => globalThis.setImmediate(r))

  // Sibling provider antigravity was skipped; codex was successfully claimed
  assert.equal(state.registeredAdapters.length, 1)
  assert.deepEqual(state.registeredAdapters[0], ['codex'])

  // Check logs noted the skip
  const skippedLog = state.logs.find((l) => l.msg.includes('skipping already-bound providers'))
  assert.ok(skippedLog, 'should log skipped providers')
  assert.ok(skippedLog.msg.includes('antigravity'))

  // Clean up
  for (const c of state.cleanups) c()
})

test('syncAdapter: handle.replace preserves owned providers and does not drop them', async () => {
  const mod = await loadMod()
  const vault = {
    CODEX_OAUTH_1: serializeBlob({ accessToken: 'at1', refreshToken: 'rt1' }),
    CLAUDE_OAUTH_1: serializeBlob({ accessToken: 'at2', refreshToken: 'rt2' }),
  }
  const cfg = {
    slots: [
      { provider: 'codex', index: 1, label: 'slot1' },
    ],
  }

  const { ctx, state } = makeCtx({ config: cfg, globalProviders: [], vault })
  mod.apply(ctx, mod.Config(cfg))
  await new Promise((r) => globalThis.setImmediate(r))

  assert.equal(state.registeredAdapters.length, 1)
  assert.deepEqual(state.registeredAdapters[0], ['codex'])

  // Add claude slot and trigger update via settings.replace
  const newSlots = [
    { provider: 'codex', index: 1, label: 'slot1' },
    { provider: 'claude', index: 1, label: 'slot2' },
  ]
  await ctx.settings.replace('dsh-subscriptions', mod.plainConfig(mod.Config({ slots: newSlots })))

  for (const c of state.cleanups) c()
})

test('reconcileSlots: discovers orphaned vault credentials and appends them via settings.replace', async () => {
  const mod = await loadMod()
  // User has CODEX_OAUTH_1, CODEX_OAUTH_2, and GROK_OAUTH_2 in vault,
  // but config.slots only declares CODEX_OAUTH_1
  const vault = {
    CODEX_OAUTH_1: serializeBlob({ email: 'user@openai.com', accessToken: 'at1', refreshToken: 'rt1' }),
    CODEX_OAUTH_2: serializeBlob({ email: 'second@openai.com', accessToken: 'at2', refreshToken: 'rt2' }),
    GROK_OAUTH_2: serializeBlob({ email: 'user@x.ai', accessToken: 'at3', refreshToken: 'rt3' }),
  }
  const cfg = {
    slots: [
      { provider: 'codex', index: 1, label: 'user@openai.com' },
    ],
  }

  const { ctx, state } = makeCtx({ config: cfg, globalProviders: [], vault })
  mod.apply(ctx, mod.Config(cfg))

  // Allow microtasks and reconcile promises to settle
  await new Promise((r) => setTimeout(r, 50))

  // Check that settings.replace was called with the reconciled slots
  assert.ok(state.settingsReplaced.length > 0, 'settingsApi.replace must be called')
  const lastReplaced = state.settingsReplaced[state.settingsReplaced.length - 1]
  const slotRefs = lastReplaced.slots.map((s) => `${s.provider}#${s.index}`)

  assert.ok(slotRefs.includes('codex#1'), 'retains original slot')
  assert.ok(slotRefs.includes('codex#2'), 'reconciles orphaned codex#2')
  assert.ok(slotRefs.includes('grok#2'), 'reconciles orphaned grok#2')

  // Labels should be recovered from blob/vault
  const codex2 = lastReplaced.slots.find((s) => s.provider === 'codex' && s.index === 2)
  assert.equal(codex2.label, 'second@openai.com')

  // Clean up
  for (const c of state.cleanups) c()
})

test('reconcileSlots: no-ops when all configured vault entries are already declared in slots', async () => {
  const mod = await loadMod()
  const vault = {
    CODEX_OAUTH_1: serializeBlob({ email: 'user@openai.com', accessToken: 'at1', refreshToken: 'rt1' }),
  }
  const cfg = {
    slots: [
      { provider: 'codex', index: 1, label: 'user@openai.com' },
    ],
  }

  const { ctx, state } = makeCtx({ config: cfg, globalProviders: [], vault })
  mod.apply(ctx, mod.Config(cfg))

  await new Promise((r) => setTimeout(r, 50))

  assert.equal(state.settingsReplaced.length, 0, 'no settings replace if no orphaned slots')
  for (const c of state.cleanups) c()
})
