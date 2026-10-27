/**
 * The brand-values contract between the two halves (dsh 0.1.7): the host half serves the current
 * values as `globalThis.__TRACY_BRAND__`, the browser half seeds its palette from them and then
 * follows every section dsh's settings form accepts. The client bundle cannot run under node, so
 * the logic it delegates to `src/shared/*.mjs` is what is pinned here.
 */
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CODE_FONT_FIELD,
  DEFAULT_FONT,
  DEFAULT_SETTINGS,
  GLOBAL_FONT_FIELD,
  PRIMARY_FIELD,
  SETTINGS_NS,
  brandSettingsFrom
} from '../src/shared/settings.mjs'
import { createBrandValues } from '../src/shared/brand-values.mjs'

test("the form is addressed by the bundles' row id", () => {
  // `ctx.configForms.get(id)` takes a profile ENTRY id since dsh 0.1.7, so the form's id is the id of
  // the row each bundle inserts for this package. A rename on either side detaches the rows from their
  // values with no error.
  for (const bundle of ['tracy-native', 'tracy-cowork']) {
    const patch = readFileSync(new URL(`../../../bundle/${bundle}/cordis.patch.yml`, import.meta.url), 'utf8')
    const row = new RegExp(`^\\s*- id: (\\S+)\\n\\s*name: '@tracy/dsh-brand'$`, 'm').exec(patch)
    assert.equal(row?.[1], SETTINGS_NS, bundle)
  }
})

test('brandSettingsFrom keeps string fields and defaults everything else', () => {
  assert.deepEqual(brandSettingsFrom(undefined), { ...DEFAULT_SETTINGS })
  assert.deepEqual(brandSettingsFrom(null), { ...DEFAULT_SETTINGS })
  assert.deepEqual(brandSettingsFrom('nope'), { ...DEFAULT_SETTINGS })
  assert.deepEqual(brandSettingsFrom({ [PRIMARY_FIELD]: '#00b96b', [GLOBAL_FONT_FIELD]: 42, extra: 'x' }), {
    [PRIMARY_FIELD]: '#00b96b',
    [GLOBAL_FONT_FIELD]: DEFAULT_FONT,
    [CODE_FONT_FIELD]: DEFAULT_FONT
  })
})

test('brand values start from the served snapshot, before any settings form answers', () => {
  const values = createBrandValues({ [PRIMARY_FIELD]: '#ef4444', [CODE_FONT_FIELD]: 'fira-code' })
  assert.equal(values.get()[PRIMARY_FIELD], '#ef4444')
  assert.equal(values.get()[CODE_FONT_FIELD], 'fira-code')
  assert.equal(values.get()[GLOBAL_FONT_FIELD], DEFAULT_FONT)
})

test('an absent page snapshot means the defaults, not a throw', () => {
  assert.deepEqual(createBrandValues(undefined).get(), { ...DEFAULT_SETTINGS })
})

test('adopt: undefined keeps the served values (memory mode / still loading) and notifies nobody', () => {
  const values = createBrandValues({ [PRIMARY_FIELD]: '#ef4444' })
  let calls = 0
  values.subscribe(() => calls++)
  values.adopt(undefined)
  assert.equal(values.get()[PRIMARY_FIELD], '#ef4444')
  assert.equal(calls, 0)
})

test('adopt: a changed section replaces the values and notifies; an identical one does not', () => {
  const values = createBrandValues({ [PRIMARY_FIELD]: '#ef4444' })
  let calls = 0
  const off = values.subscribe(() => calls++)
  values.adopt({
    [PRIMARY_FIELD]: '#ef4444',
    [GLOBAL_FONT_FIELD]: DEFAULT_FONT,
    [CODE_FONT_FIELD]: DEFAULT_FONT
  })
  assert.equal(calls, 0)
  values.adopt({ [PRIMARY_FIELD]: '', [GLOBAL_FONT_FIELD]: 'inter', [CODE_FONT_FIELD]: DEFAULT_FONT })
  assert.equal(calls, 1)
  assert.equal(values.get()[PRIMARY_FIELD], '')
  assert.equal(values.get()[GLOBAL_FONT_FIELD], 'inter')
  off()
  values.adopt({ [PRIMARY_FIELD]: '#5b8def' })
  assert.equal(calls, 1, 'an unsubscribed listener is not called')
  assert.equal(values.get()[PRIMARY_FIELD], '#5b8def')
})
