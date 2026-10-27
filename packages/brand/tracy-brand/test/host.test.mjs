/**
 * The host half on dsh 0.1.7: the brand preferences are this entry's Cordis Config, every field
 * `.volatile()` (dsh's settings forms list ONLY volatile fields, and the Loader keeps the plugin
 * mounted when only those change), and every index render serves the values read right now.
 *
 * Needs `@deepseek-ai/schemastery` >= 3.18.3 (the first with `.volatile()`), which resolves from the
 * workspace once `pnpm dsh:build` + `pnpm install` have run.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, apply, brandValues, inject } from '../src/host/index.ts'
import {
  BOOT_GLOBAL,
  CODE_FONT_FIELD,
  DEFAULT_FONT,
  GLOBAL_FONT_FIELD,
  PRIMARY_FIELD
} from '../src/shared/settings.mjs'

test('every brand field is volatile, so dsh offers it as a live form field', () => {
  for (const field of [PRIMARY_FIELD, GLOBAL_FONT_FIELD, CODE_FONT_FIELD]) {
    assert.equal(Config.dict[field].meta.volatile, true, `${field} must be .volatile()`)
  }
})

test('an empty row config resolves to the defaults, as volatile references', () => {
  const config = Config({})
  assert.equal(typeof config[PRIMARY_FIELD].get, 'function')
  assert.deepEqual(brandValues(config), {
    [PRIMARY_FIELD]: '',
    [GLOBAL_FONT_FIELD]: DEFAULT_FONT,
    [CODE_FONT_FIELD]: DEFAULT_FONT
  })
})

test('the host half needs no service to activate: `settings` is taken optionally', () => {
  // test-quality: contract cordis waits on every injected service; one named here keeps the plugin off, silently, on a host without it
  assert.deepEqual(inject, [])
})

function fakeContext() {
  const listeners = new Map()
  const injected = []
  return {
    injected,
    fiber: { id: 'fiber' },
    inject(services, callback) {
      injected.push({ services, callback })
    },
    on(event, listener) {
      listeners.set(event, listener)
    },
    render() {
      const rows = []
      listeners.get('webserver/index-inject')({ push: (...more) => rows.push(...more) })
      return rows
    }
  }
}

test('every index render serves the values the references hold at that moment', () => {
  let primary = '#ef4444'
  const ref = (read) => ({ get: read })
  const config = {
    [PRIMARY_FIELD]: ref(() => primary),
    [GLOBAL_FONT_FIELD]: ref(() => 'inter'),
    [CODE_FONT_FIELD]: ref(() => DEFAULT_FONT)
  }
  const ctx = fakeContext()
  apply(ctx, config)
  const global = () => ctx.render().find((row) => row.kind === 'global')
  assert.deepEqual(global(), {
    kind: 'global',
    name: BOOT_GLOBAL,
    value: { [PRIMARY_FIELD]: '#ef4444', [GLOBAL_FONT_FIELD]: 'inter', [CODE_FONT_FIELD]: DEFAULT_FONT }
  })
  primary = '#00b96b'
  assert.equal(global().value[PRIMARY_FIELD], '#00b96b', 'a live edit reaches the next page load')
  // Title and view transition still ride the head.
  assert.ok(ctx.render().some((row) => row.kind === 'html' && row.html.startsWith('<title>')))
})

test('when dsh serves settings, the entry opts out of an auto-generated form', () => {
  const ctx = fakeContext()
  apply(ctx, Config({}))
  assert.equal(ctx.injected.length, 1)
  assert.deepEqual(ctx.injected[0].services, ['settings'])
  const calls = []
  const effects = []
  ctx.injected[0].callback({
    settings: { configure: (presentation, owner) => (calls.push({ presentation, owner }), () => {}) },
    effect: (fn) => effects.push(fn())
  })
  assert.deepEqual(calls, [{ presentation: { auto: false }, owner: ctx.fiber }])
  assert.equal(typeof effects[0], 'function')
})
