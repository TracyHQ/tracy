// Hides the plan asks that need no slot of the contract (hide-plan.js), each seen on a JA Diner 1.0.8 chain build (dev,
// 16/11/2026) as a block of the final site check that no template release could clear: a template mask the plan "hides" to
// say it is no picture to replace, the address of a button whose link the plan writes, and a category title printed only on
// pages and blocks the plan drops. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideLines } from '../src/write-step/hide-lines.js'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { linkDoors } from '../src/write-step/link-doors.js'
import { lineOrder } from '../src/write-step/link-lines.js'

const kit = {
  template: { name: 'tpl' },
  pages: [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-10', 'block-20'] } },
    { id: 'page-news', path: '/news', blocks: { 1440: ['block-20', 'block-30'] } },
    { id: 'page-news-a', path: '/news/a', blocks: { 1440: ['block-30'] } }
  ],
  blocks: [
    {
      id: 'block-10',
      source: { entity: 'module-10' },
      frames: [
        { id: 'block-10.0', kind: 'photo', writable: true, picture: 'images/demo/hero.jpg' },
        {
          id: 'block-10.picture-2',
          kind: 'photo',
          writable: false,
          shownAs: 'background',
          picture: 'templates/tpl/images/mask.png'
        },
        {
          id: 'block-10.picture-3',
          kind: 'photo',
          writable: false,
          shownAs: 'background',
          picture: 'images/demo/painted-by-a-setting.jpg'
        }
      ]
    },
    { id: 'block-20', source: { entity: 'module-20' } },
    { id: 'block-30', source: { entity: 'module-30' } }
  ],
  storedFields: [
    {
      slot: 'category-2.0',
      field: 'title',
      listedIn: 'block-30',
      drives: [{ page: '/news/a', tag: 'a', attribute: 'text', shown: true, at: 0 }]
    },
    {
      slot: 'category-3.0',
      field: 'title',
      listedIn: 'block-30',
      drives: [{ page: '/', tag: 'span', attribute: 'text', shown: true, at: 0 }]
    }
  ]
}
const plan = {
  pages: [
    { id: 'page-home', decision: 'keep', blocks: [] },
    { id: 'page-news', decision: 'drop' },
    { id: 'page-news-a', decision: 'drop' }
  ],
  sharedBlocks: [
    { block: 'block-10', decision: 'keep' },
    { block: 'block-20', decision: 'keep' },
    { block: 'block-30', decision: 'hide' }
  ]
}
const hide = (slot) => [slot, { kind: 'hide', slot }]
const reading = {
  slots: [
    { key: 'module-10.8', type: 'url', current: 'index.php?Itemid=142', canHide: false },
    { key: 'category-2.0', entity: 'category-2', column: 'title', type: 'text', current: 'Restaurant news' },
    { key: 'category-3.0', entity: 'category-3', column: 'title', type: 'text', current: 'Guides' }
  ]
}
const run = (claims, extra = {}) =>
  hideOrders({
    plan,
    kit,
    owners: new Map(claims),
    extras: {},
    reading,
    changes: {},
    cannotHide: null,
    rowsRemove: true,
    ...extra
  })
const done = (order) =>
  hideLines({
    order,
    words: { refusedAll: null, refused: new Map() },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused: new Map(),
    settled: new Map()
  }).hides

test('a template mask the plan hides is the template look: skipped with its reason, never a contract refusal', () => {
  const order = run([hide('block-10.picture-2'), hide('block-10.picture-3')])
  assert.deepEqual(order.orders.get('block-10.picture-2'), {
    via: 'template',
    key: 'module-10.picture-2',
    file: 'templates/tpl/images/mask.png'
  })
  // A frame no slot holds that shows a picture of the site's own folder is still demo content: it fails as before.
  assert.equal(order.orders.get('block-10.picture-3').via, 'failed')
  assert.deepEqual(
    order.noWayOut.map((n) => n.slot),
    ['block-10.picture-3']
  )
  const line = done(order).get('block-10.picture-2')
  assert.equal(line.status, 'skipped')
  assert.match(line.reason, /templates\/tpl\/images\/mask\.png .*the template's look/)
})

test("the address a kept plan link writes over the plan hide of it is the link's: the hide yields", () => {
  const plain = run([hide('block-10.8')])
  assert.equal(plain.orders.get('block-10.8').via, 'failed')
  const order = run([hide('block-10.8')], {
    linked: new Set(['module-10.8']),
    changes: { 'module-10.8': 'tel:+1' }
  })
  assert.deepEqual(order.orders.get('block-10.8'), { via: 'linked', key: 'module-10.8' })
  assert.deepEqual(order.noWayOut, [])
  assert.deepEqual(order.emptySlots, [])
  assert.equal(done(order).get('block-10.8').status, 'skipped')
})

test('a title printed only on pages and a block the plan drops leaves with them; one a kept page prints still fails', () => {
  const order = run([hide('category-2.0'), hide('category-3.0')])
  assert.deepEqual(order.orders.get('category-2.0'), {
    via: 'unshown',
    key: 'category-2.0',
    pages: ['/news/a'],
    list: 'block-30'
  })
  assert.equal(order.orders.get('category-3.0').via, 'failed')
  assert.deepEqual(
    order.noWayOut.map((n) => n.slot),
    ['category-3.0']
  )
  const line = done(order).get('category-2.0')
  assert.equal(line.status, 'hidden')
  assert.equal(
    line.reason,
    'the plan hides this slot: it prints only on the dropped block block-30 and pages the plan drops (/news/a), so no kept page shows it'
  )
  // The same title, when the plan keeps the block that lists it on a kept page, has a place a visitor reaches.
  const listed = hideOrders({
    plan: { ...plan, sharedBlocks: plan.sharedBlocks.map((d) => ({ ...d, decision: 'keep' })) },
    kit: {
      ...kit,
      pages: kit.pages.map((p) =>
        p.id === 'page-home' ? { ...p, blocks: { 1440: ['block-10', 'block-30'] } } : p
      )
    },
    owners: new Map([hide('category-2.0')]),
    extras: {},
    reading,
    changes: {},
    cannotHide: null,
    rowsRemove: true
  })
  assert.equal(listed.orders.get('category-2.0').via, 'failed')
})

test('a link whose words stay and whose address the plan hides writes its address; with no label it leaves as before', () => {
  const door = { via: 'slot', keys: ['module-10.8'], link: { id: 'block-10.link-3', target: '/about' } }
  const hiddenKeys = new Map([['module-10.8', 'block-10.8']])
  const target = { kind: 'page', url: 'index.php?Itemid=117', page: { id: 'page-contact', path: '/contact' } }
  const labelled = lineOrder(
    { slot: 'block-10.link-3', content: 'page-contact', label: 'block-10.6' },
    door,
    target,
    { hiddenKeys, leaving: new Set() }
  )
  assert.deepEqual(labelled, {
    via: 'slot',
    keys: ['module-10.8'],
    url: 'index.php?Itemid=117',
    overHide: true
  })
  // The label is hidden too: the button leaves whole, with its words.
  const both = lineOrder(
    { slot: 'block-10.link-3', content: 'page-contact', label: 'block-10.6' },
    door,
    target,
    { hiddenKeys: new Map([...hiddenKeys, ['module-10.6', 'block-10.6']]), leaving: new Set() }
  )
  assert.equal(both.via, 'label')
  const bare = lineOrder({ slot: 'block-10.link-3', content: 'page-contact' }, door, target, {
    hiddenKeys,
    leaving: new Set()
  })
  assert.deepEqual(bare, { via: 'words', key: 'module-10.8', leadsTo: 'page-contact' })
})

test('a hidden link whose words the plan hides too takes the address the site can empty along: the button leaves whole', () => {
  const menuKit = {
    pages: [{ id: 'page-home', path: '/', blocks: { 1440: ['block-97'] } }],
    blocks: [
      {
        id: 'block-97',
        source: { entity: 'module-97', contains: ['module-100'] },
        links: [
          {
            id: 'block-97.link-4',
            label: 'VIEW FULL MENU',
            target: '/about-us',
            labelId: 'block-100.0',
            action: 'go-to-item'
          }
        ]
      }
    ]
  }
  const menuPlan = {
    pages: [{ id: 'page-home', decision: 'keep', blocks: [] }],
    sharedBlocks: [{ block: 'block-97', decision: 'keep' }]
  }
  const slots = (canHide) => ({
    slots: [
      {
        key: 'module-100.0',
        entity: 'module-100',
        column: 'params',
        jsonPath: ['menu', 'menu[basic-btn-title]', 0],
        type: 'text',
        current: 'View full menu',
        canHide: 'unmeasured'
      },
      {
        key: 'module-100.1',
        entity: 'module-100',
        column: 'params',
        jsonPath: ['menu', 'menu[basic-btn-link]', 0],
        type: 'url',
        current: 'index.php?Itemid=142',
        ...(canHide ? { canHide } : {})
      }
    ]
  })
  const orders = (reading, owners = [hide('block-100.0'), hide('block-97.link-4')]) =>
    hideOrders({
      plan: menuPlan,
      kit: menuKit,
      owners: new Map(owners),
      extras: {},
      reading,
      changes: {},
      cannotHide: null,
      rowsRemove: true,
      // The link stage's doors, read with the menu rows: the address names the about page by its menu item only.
      doorOf: linkDoors({ kit: menuKit, reading, rows: [{ id: 142, path: 'about-us', published: 1 }] })
    })
  const taken = orders(slots('withRow'))
  assert.deepEqual(taken.orders.get('block-97.link-4'), {
    via: 'carried',
    key: 'module-100.1',
    keys: ['module-100.1'],
    holder: 'address',
    empties: ['module-100.1']
  })
  assert.deepEqual([...taken.emptySlots].sort(), ['module-100.0', 'module-100.1'])
  assert.deepEqual(taken.noWayOut, [])
  // The site cannot empty the address: the link still fails, and says why.
  const held = orders(slots(null))
  assert.equal(held.orders.get('block-97.link-4').via, 'failed')
  // The words stay: the address is never emptied on its own.
  const alone = orders(slots('withRow'), [hide('block-97.link-4')])
  assert.notEqual(alone.orders.get('block-97.link-4').via, 'carried')
  assert.ok(!alone.emptySlots.includes('module-100.1'))
})
