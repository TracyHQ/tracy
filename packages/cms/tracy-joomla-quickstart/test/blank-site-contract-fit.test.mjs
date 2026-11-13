// The limits and flags of the slots a blank site contract opens (ticket #584): the kit's limit, no keep flag.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  doorLimitOf,
  kitLimitOf,
  kitUsesBySlot,
  LINK_CEILING,
  writableSlot,
  writableSlotProblems
} from '../scripts/blank-site-contract-fit.mjs'

// An invented block store: a button, a list of features inside one HTML value, a shared heading.
const STORE = {
  blocks: [
    {
      id: 'promo',
      fields: [
        { name: 'label', type: 'text', limit: 30, slot: 'module-1.0' },
        { name: 'link', type: 'link', slot: 'module-1.1' },
        { name: 'look', type: 'design', slot: 'module-1.9' }
      ],
      itemFields: [{ name: 'title', type: 'text', limit: 20, slots: ['module-1.2', 'module-1.3'] }],
      itemLists: [
        {
          name: 'features',
          fields: [
            {
              name: 'feature',
              type: 'text',
              limit: 12,
              slots: [
                ['module-1.4@/html/body/div/ul/li[1]/text()', 'module-1.4@/html/body/div/ul/li[2]/text()'],
                []
              ]
            }
          ]
        }
      ]
    },
    { id: 'other', fields: [{ name: 'label', type: 'text', limit: 24, slot: 'module-1.0' }] }
  ]
}

test('a place shared by several fields takes the smallest limit; a link stored as text the address ceiling', () => {
  const uses = kitUsesBySlot(STORE)
  assert.equal(kitLimitOf(uses.get('module-1.0'), ''), 24)
  assert.equal(kitLimitOf(uses.get('module-1.2'), ''), 20)
  assert.equal(kitLimitOf(uses.get('module-1.1'), ''), LINK_CEILING)
  assert.equal(uses.has('module-1.9'), false, 'a design field is no place the build writes')
})

test('pieces of one stored value: the door counts the whole, so their limits add up with a space each', () => {
  const uses = kitUsesBySlot(STORE)
  assert.equal(kitLimitOf(uses.get('module-1.4'), '((ul))((li))((/li))((li))((/li))((/ul))'), 12 + 12 + 2)
  assert.equal(kitLimitOf(uses.get('module-1.4'), '<ul><li>Kept</li></ul>'), 12 + 12 + 2 + 4)
})

test('a demo box limit becomes the kit limit, the per width boxes go, a kept icon takes a drawing', () => {
  const released = {
    key: 'module-1.0',
    type: 'text',
    maxCharacters: 40,
    customize: 'keep',
    fit: { measured: true, maxChars: { desktop: 9, phone: 8 }, maxCharacters: 8, lines: { desktop: 1 } }
  }
  assert.equal(doorLimitOf(released), 8)
  assert.deepEqual(writableSlotProblems(released, 24).length, 2)
  const open = writableSlot(released, 24)
  assert.deepEqual(open, {
    key: 'module-1.0',
    type: 'text',
    maxCharacters: 24,
    fit: { measured: true, maxCharacters: 24, lines: { desktop: 1 } }
  })
  assert.equal(doorLimitOf(open), 24)
  assert.deepEqual(writableSlotProblems(open, 24), [])
  const icon = { key: 'module-1.5', type: 'image', fit: { kind: 'icon', replace: 'keep', transparent: true } }
  assert.match(writableSlotProblems(icon, null).join(), /SLOT_PICTURE_KEPT/)
  assert.deepEqual(writableSlot(icon, null).fit, { kind: 'icon', replace: 'icon', transparent: true })
  assert.throws(
    () => writableSlot({ key: 'module-1.6', type: 'image', fit: { kind: 'photo', replace: 'keep' } }, null),
    /a kept photo the build writes/
  )
})

test('an unmeasured fit is no limit: only the slot cap counts', () => {
  assert.equal(
    doorLimitOf({ type: 'text', maxCharacters: 40, fit: { measured: false, maxCharacters: 5 } }),
    40
  )
})
