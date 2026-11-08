// A link the plan hides that has no slot of its own (a social icon printed inside a cell of words) leaves with the slot that
// prints it: its row when the plan gives the row up, its cell when the writer puts words with no link there. Measured on a
// local step chain run: 70 such hides were reported failed as "no slot of this site" and blocked the site check, while their
// rows had left the page and their cells held the writer's words. Every name and slot here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { hideLines } from '../src/write-step/hide-lines.js'

const ICONS = '<a href="#"><i class="fab fa-facebook"></i></a><a href="#"><i class="fab fa-twitter"></i></a>'
const picture = (id, position, file) => ({
  id,
  position,
  label: null,
  target: '/team/invented-coach',
  icon: { mechanism: 'image-file', file },
  action: 'navigation'
})
const kit = {
  blocks: [
    {
      id: 'block-7',
      source: { entity: 'module-7' },
      lists: [
        {
          id: 'block-7.person',
          rows: [
            {
              index: 0,
              slots: [
                { id: 'block-7.4', type: 'image' },
                { id: 'block-7.0', type: 'text' },
                { id: 'block-7.2', type: 'text' }
              ]
            },
            {
              index: 1,
              slots: [
                { id: 'block-7.5', type: 'image' },
                { id: 'block-7.1', type: 'text' },
                { id: 'block-7.3', type: 'text' }
              ]
            }
          ]
        }
      ],
      links: [
        { id: 'block-7.link-1', position: 0, label: null, target: null, action: 'external-profile' },
        { id: 'block-7.link-2', position: 1, label: null, target: null, action: 'external-profile' },
        { id: 'block-7.link-3', position: 2, label: null, target: null, action: 'external-profile' },
        { id: 'block-7.link-4', position: 3, label: null, target: null, action: 'external-profile' },
        // The card's picture is a link to a profile page; no slot holds that address.
        picture('block-7.link-5', 4, 'item-1.jpg'),
        picture('block-7.link-6', 5, 'item-2.jpg')
      ]
    }
  ]
}
const slot = (key, sample, row, at) => ({
  key,
  entity: 'module-7',
  column: 'params',
  type: 'text',
  role: 'editorial.text',
  sample,
  current: sample,
  row,
  jsonPath: ['items', at],
  canHide: true
})
const reading = {
  slots: [
    slot('module-7.0', 'Invented Coach One', 'r0', 0),
    slot('module-7.2', ICONS, 'r0', 1),
    slot('module-7.1', 'Invented Coach Two', 'r1', 2),
    slot('module-7.3', ICONS, 'r1', 3),
    { ...slot('module-7.4', 'images/invented/team/item-1.jpg', 'r0', 4), type: 'image' },
    {
      ...slot(
        'module-7.5',
        'images/invented/team/item-2.jpg#joomlaImage://local-images/invented/team/item-2.jpg?width=5&height=5',
        'r1',
        5
      ),
      type: 'image'
    }
  ]
}
const plan = {
  pages: [],
  sharedBlocks: [
    {
      block: 'block-7',
      lists: [
        {
          list: 'block-7.person',
          rows: 1,
          items: [{ copy: [{ slot: 'block-7.0' }, { slot: 'block-7.2' }] }]
        }
      ]
    }
  ]
}
const hides = ['block-7.link-1', 'block-7.link-2', 'block-7.link-3', 'block-7.link-4', 'block-7.link-6']
const owners = new Map([
  ['block-7.0', { slot: 'block-7.0', kind: 'text' }],
  ['block-7.2', { slot: 'block-7.2', kind: 'text' }],
  ...hides.map((id) => [id, { slot: id, kind: 'hide' }])
])

const ordersOf = (changes) =>
  hideOrders({ plan, kit, owners, extras: {}, reading, changes, cannotHide: null, rowsRemove: true })

test('a hidden icon link of a given-up row leaves with the row, not as a missing slot', () => {
  const out = ordersOf({ 'module-7.0': 'Sumi', 'module-7.2': 'Coach' })
  for (const id of ['block-7.link-3', 'block-7.link-4']) {
    const order = out.orders.get(id)
    assert.notEqual(order.via, 'failed', `${id}: ${order.reason}`)
    assert.equal(order.key, 'module-7.3')
  }
  // The link drawn around the given-up row's picture goes with that picture.
  assert.equal(out.orders.get('block-7.link-6').via, 'carried')
  assert.equal(out.orders.get('block-7.link-6').key, 'module-7.5')
  assert.ok(out.removeSlots.includes('module-7.3'))
  assert.deepEqual(
    out.noWayOut.filter((n) => hides.includes(n.slot)),
    []
  )
  const { hides: results } = hideLines({
    order: out,
    words: { refused: new Map() },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused: new Map(),
    settled: new Map(),
    removed: new Map([
      ['module-7.1', true],
      ['module-7.3', true],
      ['module-7.5', true]
    ])
  })
  assert.equal(results.get('block-7.link-3').status, 'hidden')
  assert.equal(results.get('block-7.link-6').status, 'hidden')
})

test('a hidden icon link inside a cell the writer fills with plain words leaves with the old words', () => {
  const out = ordersOf({ 'module-7.0': 'Sumi', 'module-7.2': 'Coach' })
  for (const id of ['block-7.link-1', 'block-7.link-2']) {
    const order = out.orders.get(id)
    assert.notEqual(order.via, 'failed', `${id}: ${order.reason}`)
    assert.equal(order.key, 'module-7.2')
  }
  const { hides: results } = hideLines({
    order: out,
    words: { refused: new Map() },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused: new Map(),
    settled: new Map(),
    removed: new Map([['module-7.3', true]])
  })
  assert.equal(results.get('block-7.link-1').status, 'hidden')
  assert.match(results.get('block-7.link-1').reason, /module-7\.2/)
  // The cell's own write refused: the old words and their link stay, so the hide fails in the plugin's words.
  const refused = new Map([['module-7.2', { code: 'SLOT_INVENTED', message: 'invented refusal' }]])
  const { hides: kept } = hideLines({
    order: out,
    words: { refused: new Map() },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused,
    settled: new Map(),
    removed: new Map()
  })
  assert.equal(kept.get('block-7.link-1').status, 'failed')
})

test('a cell that keeps its words keeps its link: that hide still says it cannot be done', () => {
  const out = ordersOf({ 'module-7.0': 'Sumi' })
  assert.equal(out.orders.get('block-7.link-1').via, 'failed')
  assert.match(out.orders.get('block-7.link-1').reason, /inside the words of module-7\.2/)
})
