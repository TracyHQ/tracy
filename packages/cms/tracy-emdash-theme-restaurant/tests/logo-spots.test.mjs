// The logo (readiness LOGO-1 / LOGO-2): the header draws the customer's logo through `logoSpots()`; the demo logo is only
// the default slot, named by constants, and the dark-mode lift of its dark ink is keyed to its file names, so a logo the
// customer uploads is never recoloured.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DEMO_LOGO, DEMO_LOGO_SMALL } from '../src/lib/demo-logo.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

test('the header shows the logo through logoSpots, the demo files only as the default slot', () => {
  const header = read('src/components/site/Header.astro')
  assert.match(header, /<BrandLogo spots=\{logoSpots\(logos, 'themed'\)\}/)
  assert.doesNotMatch(header, /src="\/brand\//, 'no fixed demo logo path in the markup')
  assert.match(header, /src=\{DEMO_LOGO\}/)
  assert.match(header, /src=\{DEMO_LOGO_SMALL\}/)
})

test('the demo logo files exist', () => {
  for (const file of [DEMO_LOGO, DEMO_LOGO_SMALL])
    assert.ok(existsSync(path.join(ROOT, 'public', file)), file)
})

test('dark mode recolours the demo logo by its file name, never a logo in general', () => {
  const css = read('src/styles/global.css')
  const rules = [...css.matchAll(/html\[data-theme="dark"\][^{}]*logo[^{}]*\{[^}]*\}/g)].map((m) => m[0])
  assert.ok(rules.length > 0)
  for (const rule of rules)
    if (/filter\s*:|invert\(|brightness\(/.test(rule))
      assert.match(rule, /img\[src\$=/, `keyed to a demo file name: ${rule.slice(0, 80)}`)
  assert.doesNotMatch(css, /:not\(\.site-logo\)/, 'the old catch-all selector is gone')
})

test('a dark logo has its place in the questionnaire map', () => {
  const map = JSON.parse(read('seed/personalize.json'))
  assert.equal(map.brand.logoDark.field, 'logo_dark')
})
