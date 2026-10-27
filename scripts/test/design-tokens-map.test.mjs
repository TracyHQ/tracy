/**
 * The design token map tracy-web reads (`apps/tracy-web/src/design-tokens.json`): every catalogue
 * system's tokens, so the design record tracy-web owns can carry VALUES without the 39 MB `systems/`
 * tree (ADR 0023, "Addendum 29/09").
 *
 *   node --test scripts/test/design-tokens-map.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildTokenMap, tokensOf } from '../lib/design-tokens-map.mjs'

test('tokensOf keeps the first declaration of each custom property and drops comments', () => {
  assert.deepEqual(tokensOf('/* a */ :root { --bg: #fff; --accent: #0071e3; /* b */ } .x { --bg: #000; }'), {
    '--bg': '#fff',
    '--accent': '#0071e3'
  })
})

test('buildTokenMap names every catalogue system, with its tokens when the system ships them', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'token-map-'))
  const systems = path.join(dir, 'systems')
  for (const [id, css] of [
    ['apple', ':root { --bg: #fff; --accent: #0071e3; }'],
    ['airbnb', ':root { --bg: #fafafa; --accent: #ff385c; }']
  ]) {
    mkdirSync(path.join(systems, id), { recursive: true })
    writeFileSync(path.join(systems, id, 'tokens.css'), css)
  }
  const catalog = {
    systems: [
      { id: 'airbnb', name: 'Airbnb' },
      { id: 'apple', name: 'Apple' },
      { id: 'ghost', name: 'Ghost' }
    ]
  }
  const map = buildTokenMap(systems, catalog)
  assert.equal(map.schemaVersion, 'tracy-design-tokens/v1')
  // Sorted by id, so the generated file does not churn with directory order.
  assert.deepEqual(Object.keys(map.ids), ['airbnb', 'apple'])
  assert.deepEqual(map.ids.apple, { '--bg': '#fff', '--accent': '#0071e3' })
  // A catalogue row with no folder still has a name; it has no tokens, and says so by absence.
  assert.deepEqual(map.names, { airbnb: 'Airbnb', apple: 'Apple', ghost: 'Ghost' })
})
