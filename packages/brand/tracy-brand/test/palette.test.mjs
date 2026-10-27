/**
 * The palette handed to dsh's theme service is GENERATED from @tracy/ui: tokens.css supplies the
 * light and dark fallback values, dsh-bridge.css the alias → token mapping. Every value must be a
 * literal, never a `var()` (a `var()` on both sides of the bridge is a CSS custom-property cycle).
 * These tests drive the generator on small inline CSS; that the REAL files yield a clean palette is
 * the `plugin-contracts` gate's job.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePalette, parseTokenBlocks, parseBridge } from '../scripts/palette.mjs'

const TOKENS = `:root, body {\n  --background: oklch(1 0 0);\n}\n[data-ds-dark-theme], .dark {\n  --background: oklch(0.145 0 0);\n}`

test('a token that reads a dsh alias contributes its FALLBACK, not the var()', () => {
  const css = `:root, body {\n  --background: var(--dsw-alias-bg-base, oklch(1 0 0));\n  --primary: oklch(0.623 0.16 259.8);\n}\n[data-ds-dark-theme], .dark {\n  --background: var(--dsw-alias-bg-base, oklch(0.145 0 0));\n}`
  const { light, dark } = parseTokenBlocks(css)
  assert.equal(light.get('--background'), 'oklch(1 0 0)')
  assert.equal(light.get('--primary'), 'oklch(0.623 0.16 259.8)')
  assert.equal(dark.get('--background'), 'oklch(0.145 0 0)')
})

test('the bridge maps every alias to one Tracy token', () => {
  const map = parseBridge(
    `html body {\n  --dsw-alias-bg-base: var(--background);\n  --dsw-specific-sidebar-fill: var(--sidebar);\n}`
  )
  assert.deepEqual(
    [...map],
    [
      ['--dsw-alias-bg-base', '--background'],
      ['--dsw-specific-sidebar-fill', '--sidebar']
    ]
  )
})

test('a token the dark block does not restate falls back to its light value; every value is a literal', () => {
  const tokens = `:root, body {\n  --background: var(--dsw-alias-bg-base, oklch(1 0 0));\n  --ring: oklch(0.7 0.1 250);\n}\n[data-ds-dark-theme], .dark {\n  --background: var(--dsw-alias-bg-base, oklch(0.145 0 0));\n}`
  const bridge = `html body { --dsw-alias-bg-base: var(--background); --dsw-alias-border-inverted: var(--ring); }`
  assert.deepEqual(generatePalette(tokens, bridge), {
    '--dsw-alias-bg-base': { light: 'oklch(1 0 0)', dark: 'oklch(0.145 0 0)' },
    '--dsw-alias-border-inverted': { light: 'oklch(0.7 0.1 250)', dark: 'oklch(0.7 0.1 250)' }
  })
})

test('a bridge entry pointing at a token tokens.css does not declare is an error, not a silent gap', () => {
  assert.throws(
    () => generatePalette(TOKENS, `html body { --dsw-alias-bg-base: var(--no-such-token); }`),
    /--no-such-token/
  )
})
