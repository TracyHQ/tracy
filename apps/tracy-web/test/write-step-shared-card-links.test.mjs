// A card's photo and name links whose one address several rows' slots hold (dev lat33, 24/11/2026: JA Boxing's trainer
// cards): the plan hides the links and none of those slots, so nothing can take the links off without leaving every card an
// empty link. They stay as the template prints them, a skipped line judged by the link checks, never "the contract has no
// slot". Every name and slot here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideOrders } from '../src/write-step/hide-plan.js'

const KIT = {
  blocks: [
    {
      id: 'block-8',
      source: { entity: 'module-8' },
      links: [
        {
          id: 'block-8.link-2',
          label: null,
          target: '/team/ana',
          action: 'navigation',
          icon: { mechanism: 'image-file', file: 'item-1.jpg', classes: null, title: null, network: null }
        },
        { id: 'block-8.link-3', label: 'Ana Ruiz', target: '/team/ana', action: 'navigation' }
      ]
    }
  ]
}
const url = (key) => ({
  key,
  entity: 'module-8',
  column: 'params',
  type: 'url',
  sample: '/team/ana',
  current: '/team/ana'
})

test("a card link whose address several rows' slots share, hidden alone, stays as the template prints it", () => {
  const order = hideOrders({
    kit: KIT,
    plan: { pages: [] },
    owners: new Map(['block-8.link-2', 'block-8.link-3'].map((slot) => [slot, { slot, kind: 'hide' }])),
    extras: {},
    reading: { slots: [url('module-8.4'), url('module-8.5')] },
    changes: {},
    cannotHide: null,
    rowsRemove: false
  })
  assert.deepEqual(
    ['block-8.link-2', 'block-8.link-3'].map((id) => order.orders.get(id)?.via),
    ['unremovable-link', 'unremovable-link']
  )
  assert.deepEqual(
    order.noWayOut.filter((n) => n.slot.startsWith('block-8')),
    []
  )
})
