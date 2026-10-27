// Two coverage losses stay closed: a UI item that is only N-A still reaches the report, and an
// unresolved row keeps its `detail` when the inventory is built.
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildInventory } from '../inventory/build.mjs'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync } from '../lib/bounded-reader.mjs'
import { buildCoverage } from '../layers/ui/engine.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const denominator = (items) => ({
  items,
  matrix: { cellCount: 1, axes: { languages: ['en'], viewports: ['1440'], themes: ['light'] } },
  unresolved: []
})
const item = (id, requiredTags, na = {}) => ({ id, kind: 'ui-story-assertion', requiredTags, na })

test('buildCoverage counts an item whose only tags are N-A, and still skips an item asked nothing', () => {
  const cov = buildCoverage({
    denominator: denominator([
      item('only-na', [], { a: 'x', b: 'y' }),
      item('empty', []),
      item('mixed', ['t'], { u: 'z' })
    ]),
    cases: [],
    ordered: []
  })
  assert.deepEqual(cov.perItem['only-na'], { a: 'na', b: 'na' })
  assert.equal(Object.hasOwn(cov.perItem, 'empty'), false)
  assert.deepEqual(cov.perItem.mixed, { t: 'open', u: 'na' })
  assert.equal(cov.items.na, 3)
  assert.equal(cov.items.open, 1)
  assert.equal(cov.byKind['ui-story-assertion'].na, 3)
})

test('buildInventory keeps every field of an unresolved row, detail included', () => {
  const { inventory } = buildInventory(ROOT)
  const harness = readBoundedJsonSync(path.join(ROOT, 'tests/qa/layers/harness/denominator.json'), {
    maxBytes: MAX_LAYER_FILE_BYTES
  })
  const withDetail = harness.unresolved.filter((u) => u.detail !== undefined)
  assert.ok(withDetail.length > 0, 'the harness denominator carries a row with detail')
  for (const u of withDetail) {
    const hit = inventory.unresolved.find(
      (v) => v.source === 'layer:harness' && v.reason === u.reason && v.origin === u.source
    )
    assert.ok(hit, `unresolved row is in the inventory: ${u.source}`)
    assert.deepEqual(hit.detail, u.detail)
  }
})
