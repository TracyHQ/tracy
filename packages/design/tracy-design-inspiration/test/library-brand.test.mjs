/**
 * A library inspiration as a brand for the engine: the palette and faces read off tokens.css, the
 * tagline off DESIGN.md — the engine then builds the six sample products a customer's own brand gets.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildBrandSystem, validateBrand } from '@tracy/od-brand-engine'

import { brandFromSystem, firstFamily, taglineOf, tokenValue } from '../src/host/library-brand.mjs'

const TOKENS = `:root{
  --bg: #ffffff;
  --surface: #f7f7f7;
  --fg: #222222;
  --muted: #6a6a6a;
  --border: #dddddd;
  --accent: #ff385c;
  --accent-hover: #e31c5f;       /* hand-picked */
  --font-display:
    "Airbnb Cereal VF", "Airbnb Cereal App", Circular,
    -apple-system, system-ui, sans-serif;
  --font-body: Inter, system-ui, sans-serif;
  --font-mono: ui-monospace, Menlo, monospace;
  --radius-md: 14px;
}`
const DESIGN = `# Design System Inspired by Airbnb\n\n> Category: E-Commerce & Retail\n> Travel marketplace. Warm coral accent, photography-driven, rounded UI.\n\n## 1. Visual Theme\n`

test("tokenValue / firstFamily / taglineOf read the inspiration's own files", () => {
  assert.equal(tokenValue(TOKENS, '--accent'), '#ff385c')
  assert.equal(
    tokenValue(TOKENS, '--accent-hover'),
    '#e31c5f',
    'the comment after the semicolon is not the value'
  )
  assert.equal(firstFamily(tokenValue(TOKENS, '--font-display')), 'Airbnb Cereal VF')
  assert.equal(firstFamily(tokenValue(TOKENS, '--font-body')), 'Inter')
  assert.equal(taglineOf(DESIGN), 'Travel marketplace. Warm coral accent, photography-driven, rounded UI.')
  assert.equal(taglineOf('# x\n\n> Category: A\n'), '')
})

test('brandFromSystem: a valid engine Brand, and the engine builds six real sample products from it', () => {
  const brand = brandFromSystem({
    id: 'airbnb',
    name: 'Airbnb',
    category: 'E-Commerce & Retail',
    tokensCss: TOKENS,
    designMd: DESIGN
  })
  assert.equal(brand.name, 'Airbnb')
  assert.equal(brand.tagline, 'Travel marketplace. Warm coral accent, photography-driven, rounded UI.')
  assert.deepEqual(
    brand.colors.map((c) => [c.role, c.hex]),
    [
      ['background', '#ffffff'],
      ['surface', '#f7f7f7'],
      ['foreground', '#222222'],
      ['muted', '#6a6a6a'],
      ['border', '#dddddd'],
      ['accent', '#ff385c'],
      ['accent-secondary', '#e31c5f']
    ]
  )
  assert.equal(brand.typography.display.family, 'Airbnb Cereal VF')
  assert.equal(brand.typography.mono?.family, 'ui-monospace')
  assert.equal(brand.layout.radius, '14px')
  assert.doesNotThrow(() => validateBrand(brand, brand.sourceUrl))
  const system = buildBrandSystem(brand, { slug: 'airbnb' })
  for (const kind of ['landing', 'deck', 'poster', 'email', 'newsletter', 'form']) {
    const html = system.files[`artifacts/${kind}.html`]
    assert.equal(typeof html, 'string', kind)
    assert.ok(html.length > 8000, `${kind}: ${html.length} chars — a real product, not upstream's 6 KB card`)
    assert.match(html, /Airbnb/)
  }
  assert.match(system.files['artifacts/deck.html'], /slide/i)
})

test('brandFromSystem: a bare tokens.css still yields a brand the engine accepts', () => {
  const brand = brandFromSystem({ id: 'x', name: 'X', tokensCss: ':root{--accent:#123456;}' })
  assert.equal(brand.tagline, '')
  assert.equal(brand.colors.find((c) => c.role === 'accent')?.hex, '#123456')
  assert.doesNotThrow(() => validateBrand(brand, brand.sourceUrl))
  assert.ok(buildBrandSystem(brand).files['artifacts/poster.html'].length > 8000)
})
