/**
 * Tracy's token mapping (vendor/tracy/od-brand-engine/tracy-tokens.ts) on the engine's own default
 * seed: what tracyTokensCss writes. That the engine's token names match the names the vendored
 * design systems declare is a cross-tree rule and lives in gate `infra-contracts`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  defaultSeed,
  deriveTokens,
  TRACY_TOKEN_NAMES,
  tracyTokensCss
} from '../../vendor/tracy/od-brand-engine/dist/index.js'

test('tracyTokensCss: one :root block, every token once, values from the derived set', () => {
  const t = deriveTokens(defaultSeed, 'default')
  const css = tracyTokensCss(t)
  assert.match(css, /^:root \{\n/)
  const notOnce = TRACY_TOKEN_NAMES.filter(
    (name) => (css.match(new RegExp(`  ${name}: `, 'g')) ?? []).length !== 1
  )
  assert.deepEqual(notOnce, [], 'every token appears exactly once')
  assert.match(css, /--accent: #1677ff;/, "Ant's default primary")
  assert.match(css, /--accent-on: #ffffff;/, 'white type on a mid-blue accent')
  assert.match(css, /--text-4xl: (4[89]|[5-9]\d)px;/, 'display ceiling at least 48px like the 152 systems')
  assert.match(css, /--radius-pill: 9999px;/)
})

test('dark theme maps too, and a light accent gets dark type on it', () => {
  const dark = deriveTokens(defaultSeed, 'dark')
  const css = tracyTokensCss(dark)
  assert.match(css, /--bg: #[0-2][0-9a-f]{5};/, 'a dark canvas')
  const pale = deriveTokens({ ...defaultSeed, colorPrimary: '#f5e663' }, 'default')
  assert.match(tracyTokensCss(pale), /--accent-on: #111111;/)
})

test('a distinct display face is named before the body stack', () => {
  const t = deriveTokens(defaultSeed, 'default')
  assert.match(tracyTokensCss(t, 'Playfair Display'), /--font-display: Playfair Display, /)
  assert.match(tracyTokensCss(t, ''), /--font-display: -apple-system|--font-display: [^,]+, /)
  // fijitrips, 06/09: body stack already led with Poppins and the display line read `Poppins, Poppins, …`.
  const poppins = { ...t, fontFamily: "Poppins, system-ui, 'Segoe UI', sans-serif" }
  assert.match(tracyTokensCss(poppins, 'Poppins'), /--font-display: Poppins, system-ui, /)
  assert.doesNotMatch(tracyTokensCss(poppins, 'Poppins'), /Poppins, Poppins/)
})
