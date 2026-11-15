// One stored picture drawn for two slots (ticket #586, review 4 X8). The plugin refuses a picture of another width
// over height than its slot's aspect, so a picture stored once and used in two slots of different aspects is a real
// conflict, recorded in the check record. Two slots of the same aspect with different minimum widths are not one: the
// compare is on the aspects, never on rounded heights. An invented bakery: a hero slot 3:2 at 400 px, a card slot 3:2
// at 401 px and a square avatar slot.
import assert from 'node:assert/strict'
import test from 'node:test'
import { pictureShapesOf } from '../ai-quickstart/gate/marker-pictures.mjs'
import { checkRecord } from '../ai-quickstart/gate/record.mjs'

const contract = {
  slots: [
    { key: 'hero.1', fit: { aspect: 1.5, minWidth: 400 } },
    { key: 'card.1', fit: { aspect: 1.5, minWidth: 401 } },
    { key: 'avatar.1', fit: { aspect: 1, minWidth: 120 } }
  ]
}
const plan = (slots) => ({
  ops: [
    { kind: 'picture.upload', key: 'picture:bread', stored: { id: 'images/bread.jpg' } },
    ...slots.map((slot) => ({ kind: 'module', values: [{ value: { ref: 'picture:bread' }, loc: { slot } }] }))
  ]
})

test('X8: two slots of one aspect with different minimum widths are no shape conflict', () => {
  assert.deepEqual(pictureShapesOf(plan(['hero.1', 'card.1']), contract).conflicts, [])
})

test('X8: one picture in a 3:2 slot and a square slot is a conflict naming both slots', () => {
  assert.deepEqual(pictureShapesOf(plan(['hero.1', 'avatar.1']), contract).conflicts, [
    { picture: 'bread', slots: ['hero.1', 'avatar.1'] }
  ])
})

test('X8: the check record keeps the shape conflicts of the marker build', () => {
  const record = checkRecord({
    kit: { ref: 'bakery/j6@1.0.0', mapping: { template: { slug: 'bakery' } } },
    origin: 'http://bakery.example',
    built: {
      gaps: [],
      written: { report: { status: 'done' } },
      writePlan: { ops: [] },
      orderProblems: [],
      pictureShapeConflicts: [{ picture: 'bread', slots: ['hero.1', 'avatar.1'] }]
    },
    accounting: { counts: {}, places: [] },
    real: { status: 'done' },
    renders: [],
    pages: [],
    classified: { findings: [], exempt: [], seen: new Set(), notSeen: [] },
    groups: [],
    demo: { browser: [], html: [], checks: {} },
    controls: {},
    widths: [1440],
    themes: ['light'],
    plugin: null,
    refusals: [],
    startedAt: '2026-01-01T00:00:00.000Z'
  })
  assert.deepEqual(record.write.pictureShapeConflicts, [{ picture: 'bread', slots: ['hero.1', 'avatar.1'] }])
})
