// kitSlotIds names every slot id of a kit, including the ids nested one level under a list's rowSlots.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kitSlotIds } from '../src/write-step/kit-slot-ids.js'

// An invented kit: no real template or customer data.
const kit = {
  blocks: [
    {
      slots: [{ id: 'demo-block.1' }],
      lists: [
        {
          rowSlots: [
            { id: 'demo-block.2' },
            { id: 'demo-block.row', slots: [{ id: 'demo-block.2.1' }, { id: 'demo-block.2.2' }] }
          ],
          rows: [{ slots: [{ id: 'demo-block.3' }] }]
        }
      ]
    }
  ]
}

test('kitSlotIds reads ids nested under rowSlots[].slots[]', () => {
  const ids = kitSlotIds(kit)
  assert.ok(ids.has('demo-block.2.1'))
  assert.ok(ids.has('demo-block.2.2'))
})

test('kitSlotIds keeps reading the flat rowSlots, rows and block slots', () => {
  const ids = kitSlotIds(kit)
  for (const id of ['demo-block.1', 'demo-block.2', 'demo-block.row', 'demo-block.3'])
    assert.ok(ids.has(id), id)
})
