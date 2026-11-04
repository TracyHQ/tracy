// A hidden slot takes its row or element with it (rows.remove): which rows a plan gives up, which slots go to the door, and what
// the report says. Every business word and slot here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { hideLines } from '../src/write-step/hide-lines.js'
import { goneRowSlots, slotsToRemove } from '../src/write-step/hide-rows.js'
import { linkDoors } from '../src/write-step/link-doors.js'
import { lineOrder, lineResult } from '../src/write-step/link-lines.js'
import { planClaims } from '../src/write-step/owner-table.js'

const kit = {
  blocks: [
    {
      id: 'block-1',
      source: { entity: 'module-1' },
      lists: [
        {
          id: 'block-1.card',
          rows: [
            { index: 0, slots: [{ id: 'block-1.0' }, { id: 'block-1.4' }] },
            { index: 1, slots: [{ id: 'block-1.1' }, { id: 'block-1.5' }] },
            { index: 2, slots: [{ id: 'block-1.2' }, { id: 'block-1.6' }] },
            { index: 3, slots: [{ id: 'block-1.3' }, { id: 'block-1.7' }] }
          ]
        }
      ]
    }
  ]
}
const decision = (extra = {}) => ({
  block: 'block-1',
  lists: [
    {
      list: 'block-1.card',
      rows: 2,
      items: [{ copy: [{ slot: 'block-1.0' }] }, { copy: [{ slot: 'block-1.1' }] }]
    }
  ],
  ...extra
})
const plan = (extra) => ({ sharedBlocks: [decision(extra)], pages: [] })

test('the rows past what the plan keeps are given up, and a row a copy names or fills is not', () => {
  assert.deepEqual(
    [...goneRowSlots({ plan: plan(), kit })],
    ['block-1.2', 'block-1.6', 'block-1.3', 'block-1.7']
  )
  const named = plan({
    lists: [{ list: 'block-1.card', rows: 1, items: [{ copy: [{ slot: 'block-1.2' }] }] }]
  })
  assert.deepEqual(
    [...goneRowSlots({ plan: named, kit })],
    ['block-1.0', 'block-1.4', 'block-1.1', 'block-1.5', 'block-1.3', 'block-1.7']
  )
  assert.deepEqual(
    [...goneRowSlots({ plan: plan(), kit, filled: new Set(['block-1.6']) })],
    ['block-1.3', 'block-1.7']
  )
})

test('a list the plan keeps whole, or a list with no measured rows, gives nothing up', () => {
  const whole = plan({ lists: [{ list: 'block-1.card', rows: 4, items: [] }] })
  assert.deepEqual([...goneRowSlots({ plan: whole, kit })], [])
  const noRows = { blocks: [{ id: 'block-1', lists: [{ id: 'block-1.card', rows: [] }] }] }
  assert.deepEqual([...goneRowSlots({ plan: plan(), kit: noRows })], [])
})

test('a link the same block hides, or on a row it gives up, is no kept link; one hidden elsewhere still wins', () => {
  const p = plan({
    links: [
      { link: 'block-1.4', leadsTo: 'page-a' },
      { link: 'block-1.5', leadsTo: 'page-a' },
      { link: 'block-1.6', leadsTo: 'page-a' }
    ],
    hiddenSlots: [{ slot: 'block-1.5' }]
  })
  const claims = planClaims(
    {
      plan: p,
      hidden: new Set(['block-1.4', 'block-1.5']),
      rowsGone: new Set(['block-1.6']),
      menuHide: []
    },
    'plan.json'
  )
  const kinds = Object.fromEntries(claims.map((c) => [c.slot, c.kind]))
  assert.deepEqual(kinds, { 'block-1.4': 'link', 'block-1.5': 'hide', 'block-1.6': 'hide' })
})

test('a link claim carries the words the plan gave it', () => {
  const p = plan({ links: [{ link: 'block-1.4', leadsTo: 'page-a', labelSlot: 'block-1.0' }] })
  const [claim] = planClaims({ plan: p, hidden: new Set(), menuHide: [] }, 'plan.json')
  assert.equal(claim.label, 'block-1.0')
})

const slot = (key, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  column: 'params',
  type: 'text',
  current: 'Words',
  ...extra
})

test('a row goes when nothing in it stays and the plan gave it up or hid all its words', () => {
  const row = (r) => ({ row: r })
  const onSite = new Map(
    [
      slot('module-1.0', row('a')),
      slot('module-1.1', { ...row('a'), type: 'url' }),
      slot('module-1.2', row('b')),
      slot('module-1.3', row('b')),
      slot('module-1.4', row('c')),
      slot('module-1.5', row('c')),
      slot('module-1.6', row('d')),
      slot('module-1.7', row('d'))
    ].map((s) => [s.key, s])
  )
  const out = slotsToRemove({
    hidden: new Set(['module-1.0', 'module-1.2', 'module-1.4', 'module-1.6']),
    keep: new Set(['module-1.5']),
    gone: new Set(['module-1.7']),
    onSite
  })
  assert.deepEqual(
    [...out].sort(),
    ['module-1.0', 'module-1.6'],
    'a: its words all go; d: the plan gave it up'
  )
})

test('a slot of an HTML field goes to the door, in a row that stays or in none; a plain one does not', () => {
  const onSite = new Map(
    [
      slot('module-1.0', { row: 'a', xpath: '/html/body/div/ul/li[1]/text()' }),
      slot('module-1.1', { row: 'a' }),
      slot('module-1.2', { row: 'a' }),
      slot('module-1.3', { xpath: '/html/body/div/a/text()' }),
      slot('module-1.4')
    ].map((s) => [s.key, s])
  )
  const out = slotsToRemove({
    hidden: new Set(['module-1.0', 'module-1.2', 'module-1.3', 'module-1.4']),
    keep: new Set(['module-1.1']),
    gone: new Set(),
    onSite
  })
  assert.deepEqual([...out].sort(), ['module-1.0', 'module-1.3'])
})

const orders = (over = {}) => {
  const reading = {
    slots: [
      slot('module-1.2', { row: 'r', canHide: 'unmeasured' }),
      slot('module-1.6', { row: 'r', canHide: 'unmeasured' }),
      slot('module-1.0', { row: 'k', canHide: 'unmeasured' }),
      slot('module-1.4', { row: 'k' }),
      slot('module-1.9', { xpath: '/html/body/div/a/text()' }),
      slot('module-1.8', { canHide: 'unmeasured' })
    ],
    ...over.reading
  }
  const owners = new Map(
    ['block-1.2', 'block-1.6', 'block-1.9', 'block-1.8', 'block-1.0'].map((id) => [
      id,
      { slot: id, kind: 'hide' }
    ])
  )
  owners.set('block-1.4', { slot: 'block-1.4', kind: 'text' })
  return hideOrders({
    plan: { pages: [] },
    kit: { blocks: [] },
    owners,
    extras: {},
    reading,
    changes: {},
    cannotHide: null,
    rowsRemove: over.rowsRemove ?? true
  })
}

test('the orders part what is removed from what is emptied', () => {
  const out = orders()
  assert.deepEqual([...out.removeSlots].sort(), ['module-1.2', 'module-1.6', 'module-1.9'])
  assert.deepEqual(out.emptySlots.sort(), ['module-1.0', 'module-1.8'])
  assert.equal(out.orders.get('block-1.2').via, 'removed')
  assert.ok(out.keepSlots.includes('module-1.4'))
})

test('a plugin without the door refuses the slot as before, and removes nothing', () => {
  const out = orders({ rowsRemove: false })
  assert.deepEqual(out.removeSlots, [])
  assert.equal(out.orders.get('block-1.9').via, 'failed')
})

test('a slot an earlier run removed is hidden already, not a slot the site lacks', () => {
  const out = orders({ reading: { removedSlots: { 'module-1.7': 'removed' } } })
  const owners = new Map([['block-1.7', { slot: 'block-1.7', kind: 'hide' }]])
  const again = hideOrders({
    plan: { pages: [] },
    kit: { blocks: [] },
    owners,
    extras: {},
    reading: { slots: [], removedSlots: { 'module-1.7': 'removed' } },
    changes: {},
    cannotHide: null,
    rowsRemove: true
  })
  assert.ok(out)
  assert.equal(again.orders.get('block-1.7').via, 'removed')
  assert.deepEqual(again.removeSlots, [])
})

test('a removed slot is reported hidden and read on the list the plugin keeps; a refused one fails in its words', () => {
  const order = {
    orders: new Map([
      ['block-1.2', { via: 'removed', key: 'module-1.2' }],
      ['block-1.3', { via: 'removed', key: 'module-1.3' }],
      ['block-1.4', { via: 'removed', key: 'module-1.4' }]
    ]),
    blocks: new Map()
  }
  const { hides } = hideLines({
    order,
    words: { refused: new Map() },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused: new Map(),
    settled: new Map(),
    removed: new Map([
      ['module-1.2', true],
      ['module-1.3', 'SLOT_NOT_REMOVABLE: its parent keeps markup: module-1.3']
    ])
  })
  const line = hides.get('block-1.2')
  assert.equal(line.status, 'hidden')
  assert.equal(line.ordered, 'removed')
  assert.deepEqual(line.readFrom, {
    action: 'content.contract',
    params: { operation: 'inspect' },
    path: ['removedSlots', 'module-1.2']
  })
  assert.equal(hides.get('block-1.3').status, 'failed')
  assert.match(hides.get('block-1.3').reason, /SLOT_NOT_REMOVABLE/)
  assert.equal(hides.has('block-1.4'), false, 'the run ended first')
})

test('a link whose words the plan hides leaves with them and says so; if they stay, the link says why', () => {
  const claim = { slot: 'block-1.link-1', content: 'page-a', label: 'block-1.4' }
  const order = lineOrder(
    claim,
    { via: 'slot', keys: ['module-1.3'], link: {} },
    { kind: 'page', url: '/a' },
    { hiddenKeys: new Map([['module-1.4', 'block-1.4']]), leaving: new Set() }
  )
  assert.equal(order.via, 'label')
  const hides = new Map([['block-1.4', { status: 'hidden', reason: 'x', key: 'module-1.4' }]])
  const gone = lineResult(order, { hides, written: new Set(), refused: new Map(), settled: new Map() })
  assert.equal(gone.status, 'hidden')
  assert.match(gone.reason, /page-a/)
  assert.match(gone.reason, /block-1\.4/)
  assert.equal(gone.conflict, true)
  assert.equal(gone.key, 'module-1.4', 'its read is the read of its words')
  const stays = lineResult(order, {
    hides: new Map([['block-1.4', { status: 'failed', reason: 'refused', key: 'module-1.4' }]]),
    written: new Set(),
    refused: new Map(),
    settled: new Map()
  })
  assert.equal(stays.status, 'failed')
  assert.equal(stays.conflict, true)
})

test('a menu link keeps its own way out: the plan takes its item off the site', () => {
  const claim = { slot: 'header.link-1', content: 'page-a', label: 'menuItem-1.0' }
  const order = lineOrder(
    claim,
    { via: 'menu', item: 1, link: { menuItem: 'menuItem-1' } },
    { kind: 'page', url: '/a' },
    { hiddenKeys: new Map([['menuItem-1.0', 'menuItem-1.0']]), leaving: new Set(['menuItem-1']) }
  )
  assert.equal(order.via, 'menu')
})

test('a link inside words an earlier run removed is still found, so a second run reports it the same', () => {
  const block = {
    id: 'block-1',
    source: { entity: 'module-1' },
    links: [
      { id: 'block-1.link-1', position: 1 },
      { id: 'block-1.link-2', position: 2 }
    ]
  }
  const words = {
    key: 'module-1.3',
    entity: 'module-1',
    column: 'params',
    type: 'text',
    sample: '<a href="#">One</a><a href="#">Two</a>'
  }
  const kitWithLinks = { blocks: [block] }
  const first = linkDoors({ kit: kitWithLinks, reading: { slots: [words] }, rows: [] })
  assert.deepEqual([first('block-1.link-2').via, first('block-1.link-2').key], ['words', 'module-1.3'])
  const reading = { slots: [], removedSlots: { 'module-1.3': 'removed' } }
  assert.equal(linkDoors({ kit: kitWithLinks, reading, rows: [] })('block-1.link-2').via, 'none')
  const second = linkDoors({ kit: kitWithLinks, reading, rows: [], contentMap: { slots: [words] } })
  assert.deepEqual([second('block-1.link-2').via, second('block-1.link-2').key], ['words', 'module-1.3'])
})
