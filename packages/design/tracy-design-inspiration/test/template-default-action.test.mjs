/**
 * The Template default popup's primary button (`template-default-action.mjs`, 15/10/2026): "Back to template
 * default" whenever a system is worn — after one apply, after two, after the newest was undone, on a locked
 * template — or a quiet "in use" when nothing is worn.
 *
 *   node --test packages/design/tracy-design-inspiration/test/template-default-action.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { templateDefaultActionOf } from '../src/client/template-default-action.mjs'

const worn = { id: null, slotId: 'refero:b', name: 'B' }
const of = (read, more = {}) => templateDefaultActionOf({ read, trial: null, ...more })

test('nothing worn: "Your site uses this look", off, no reason', () => {
  assert.deepEqual(of({ worn: null, canApply: true }), {
    label: { key: 'ds.default.inUse' },
    enabled: false,
    reason: null
  })
})

test('a system worn: back to template default, on, whatever the history of applies', () => {
  for (const last of [
    null,
    { applyId: 'a', id: 'refero:b', previous: { id: 'refero:a', name: 'A' }, undone: false },
    { applyId: 'a', id: 'refero:b', previous: null, undone: true }
  ])
    assert.deepEqual(of({ worn, canApply: true, last }), {
      label: { key: 'ds.worn.back' },
      enabled: true,
      reason: null
    })
})

test('a locked template still goes back', () => {
  assert.equal(
    of({ worn, canApply: true, supported: false, locked: true, reason: 'TEMPLATE_NOT_READY' }).enabled,
    true
  )
})

test('off: a viewer with its reason; a try that is up, without one (its bar holds the Undo)', () => {
  assert.deepEqual(of({ worn, canApply: false }).reason, { key: 'ds.viewer' })
  assert.equal(of({ worn, canApply: false }).enabled, false)
  const trying = of({ worn, canApply: true }, { trial: {} })
  assert.equal(trying.enabled, false)
  assert.equal(trying.reason, null)
})
