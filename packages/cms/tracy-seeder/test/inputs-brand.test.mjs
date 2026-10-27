/**
 * A brand is a design system the seeder can draw (ADR 0023): its folder `Brand/<host>/` carries the
 * same files as a vendored system — `components.html`, `tokens.css`, `DESIGN.md`, `slots.json` — so
 * `loadSystemFrom(dir)` reads it where `loadSystem(dataDir, id)` reads the library.
 *
 *   node --test packages/cms/tracy-seeder/test/inputs-brand.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadSystemFrom, systemIdOf } from '../src/inputs.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const APPLE = path.join(ROOT, 'vendor', 'tracy', 'od-design-system', 'systems', 'apple')

test('systemIdOf: a brand id is an id — the seeder no longer refuses it', () => {
  assert.equal(systemIdOf({ chosen: 'brand:acme.example' }), 'brand:acme.example')
  assert.equal(systemIdOf({ chosen: { id: 'apple' } }), 'apple')
  assert.throws(() => systemIdOf({}), /names no chosen inspiration/)
})

test('loadSystemFrom reads a brand folder the way loadSystem reads a library system', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-'))
  mkdirSync(dir, { recursive: true })
  const kit = readFileSync(path.join(APPLE, 'components.html'), 'utf8')
  writeFileSync(path.join(dir, 'components.html'), kit)
  writeFileSync(path.join(dir, 'tokens.css'), readFileSync(path.join(APPLE, 'tokens.css'), 'utf8'))
  writeFileSync(path.join(dir, 'DESIGN.md'), '# Acme\n\nWarm and plain.\n')
  // The brand engine writes its slot map flat: `{ schemaVersion, slots }`, not keyed by system.
  writeFileSync(
    path.join(dir, 'slots.json'),
    JSON.stringify({ schemaVersion: 'tracy-od-slots/v1', slots: [{ id: 'x', tag: 'h1', role: 'headline' }] })
  )
  const system = loadSystemFrom(dir, { id: 'brand:acme.example', name: 'Acme', category: 'Your brand' })
  assert.equal(system.id, 'brand:acme.example')
  assert.equal(system.name, 'Acme')
  assert.equal(system.category, 'Your brand')
  assert.equal(system.fixtureHtml, kit)
  assert.deepEqual(system.fixtureSlots, [{ id: 'x', tag: 'h1', role: 'headline' }])
  assert.ok(
    system.landingHtml.length > 1000,
    'the landing artifact is built from the brand tokens and DESIGN.md'
  )
  assert.ok(Array.isArray(system.landingSlots))
})

test('loadSystemFrom without a fixture says which folder it looked in', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-'))
  assert.throws(
    () => loadSystemFrom(dir, { id: 'brand:x', name: 'x', category: '' }),
    new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  )
})
