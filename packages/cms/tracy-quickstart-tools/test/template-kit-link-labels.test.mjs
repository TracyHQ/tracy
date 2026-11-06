// Each text link of a block names the slot its label comes from: a menu link the menu item of the block's own menu
// (by label and address, the top level first), any other link the one slot that prints those words, a button label
// first. Fabricated swim club: a header with a main menu, a footer menu that repeats one label, and a button.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { labelLinks, menuLinkChecks, whatElseChanges } from '../template-kit/lib/link-labels.mjs'

const item = (n, label, path, level = 1) => ({
  item: `menuItem-${n}`,
  label: { text: label, slot: `menuItem-${n}.0` },
  level,
  target: path ? { kind: 'page', path } : { kind: 'heading' }
})
const MENUS = {
  'module-1': {
    items: [
      item(101, 'Home', '/index.php'),
      item(150, 'Lessons', '/index.php/lessons'),
      item(151, 'Kids', '/index.php/lessons/kids', 2),
      item(193, 'About', '/index.php/about')
    ]
  },
  'module-9': { items: [item(184, 'About', null), item(185, 'Prices', '/index.php/prices')] }
}
const SLOTS = [
  { key: 'menuItem-101.0', type: 'text', role: 'editorial.menu_label', sample: 'Home' },
  { key: 'menuItem-150.0', type: 'text', role: 'editorial.menu_label', sample: 'Lessons' },
  { key: 'category-9.0', type: 'text', role: 'editorial.heading', sample: 'Lessons' },
  { key: 'menuItem-193.0', type: 'text', role: 'editorial.menu_label', sample: 'About' },
  { key: 'menuItem-184.0', type: 'text', role: 'editorial.menu_label', sample: 'About' },
  { key: 'module-7.2', type: 'text', role: 'editorial.heading', sample: 'Book a lane' },
  { key: 'module-7.1', type: 'text', role: 'editorial.button_label', sample: 'Book a lane' }
]
const SITE = 'http://swim.test'

const header = () => [
  { id: 'header.link-1', label: 'HOME', target: '/' },
  { id: 'header.link-2', label: 'LESSONS', target: '/lessons' },
  { id: 'header.link-3', label: 'ABOUT', target: '/about' },
  { id: 'header.link-4', label: 'BOOK A LANE', target: '/contact' }
]

test('menu links take the menu item of the block own menu, by label and address, whatever the casing', () => {
  const links = header()
  labelLinks({ links, menuBlocks: MENUS, mapSlots: SLOTS, siteUrl: SITE })
  assert.deepEqual(
    links.map((l) => l.labelId),
    ['menuItem-101.0', 'menuItem-150.0', 'menuItem-193.0', 'block-7.1']
  )
  assert.equal(links[2].menuItem, 'menuItem-193', 'the main menu About, not the footer one')
  assert.equal(links[0].menu, 'module-1')
  assert.equal(links[3].menu, undefined, 'a button is no menu link')
})

test('self-check: every top-level menu item is a link label, and every menu link names its label slot', () => {
  const links = header()
  labelLinks({ links, menuBlocks: MENUS, mapSlots: SLOTS, siteUrl: SITE })
  const groups = [
    {
      id: 'nav-main',
      items: [
        { level: 1, label: 'Home', labelSlot: 'menuItem-101.0' },
        { level: 2, label: 'Kids', labelSlot: 'menuItem-151.0' },
        { level: 1, label: 'Shop', labelSlot: 'menuItem-160.0' }
      ]
    }
  ]
  const offCanvas = { id: 'off', links: [{ id: 'off.link-1', label: 'Home', menuItem: 'menuItem-101' }] }
  const errors = []
  assert.equal(menuLinkChecks({ blocks: [{ id: 'header', links }, offCanvas], groups, errors }), 2)
  assert.deepEqual(
    errors.map((e) => e.field),
    ['blocks[off].links[off.link-1]', 'site.navigationGroups[nav-main].items[Shop]']
  )
  assert.equal(menuLinkChecks({ blocks: [{ id: 'header', links }], groups: [], errors: [] }), 0)
})

test('outside a menu only a button or menu label is a link label: a heading that shares the words is not', () => {
  const links = [{ id: 'header.link-0', label: 'Harbour Swim Club', target: '/' }, ...header()]
  const slots = [
    ...SLOTS,
    { key: 'module-4.0', type: 'text', role: 'editorial.heading', sample: 'Harbour Swim Club' }
  ]
  labelLinks({ links, menuBlocks: MENUS, mapSlots: slots, siteUrl: SITE })
  assert.equal(links[0].labelId, undefined)
})

test("a form's button prints its sign-up's newsletter label; a link of the same words does not", () => {
  const slots = [
    { key: 'module-6.0', type: 'text', role: 'editorial.newsletter_label', sample: 'Join the list' }
  ]
  const links = [
    {
      id: 'block-2.button-1',
      label: 'Join the list',
      target: null,
      opens: { kind: 'form', action: '/news/signup' }
    },
    { id: 'block-2.link-1', label: 'Join the list', target: '/join' }
  ]
  labelLinks({ links, mapSlots: slots, siteUrl: SITE })
  assert.deepEqual(
    links.map((l) => l.labelId ?? null),
    ['block-6.0', null]
  )
})

test('a label slot says what else changes with it: other blocks, page titles and menus printing the same slot', () => {
  const kit = {
    blocks: [
      {
        id: 'header',
        slots: [{ id: 'menuItem-150.0', alsoShownIn: ['crumbs'] }, { id: 'menuItem-193.0' }]
      }
    ],
    pages: [
      { id: 'page-lessons', h1: { via: 'content-slot', slot: 'menuItem-150.0' } },
      { id: 'page-about', h1: { via: 'content-slot', slot: 'block-3.0' } }
    ],
    site: {
      navigationGroups: [
        { id: 'nav-main', items: [{ labelSlot: 'menuItem-150.0' }] },
        { id: 'nav-off', items: [{ labelSlot: 'menuItem-150.0' }, { labelSlot: 'menuItem-9.0' }] }
      ]
    }
  }
  whatElseChanges(kit)
  const [lessons, about] = kit.blocks[0].slots
  assert.deepEqual(lessons.alsoChanges, {
    blocks: ['crumbs'],
    pageTitles: ['page-lessons'],
    menus: ['nav-main', 'nav-off']
  })
  assert.equal(about.alsoChanges, undefined, 'printed nowhere else: nothing to say')
})

test('links repeating the same words take each its own twin slot, in content map order', () => {
  // An article with three "See dates" buttons, one per section: three slots with the same words.
  const slots = [3, 8, 13].map((n) => ({
    key: `article-40.${n}`,
    type: 'text',
    role: 'editorial.button_label',
    sample: 'See dates'
  }))
  const links = ['/tides', '/reefs', '/dunes'].map((target, i) => ({
    id: `l${i}`,
    label: 'See dates',
    target
  }))
  labelLinks({ links, menuBlocks: {}, mapSlots: slots, siteUrl: SITE })
  assert.deepEqual(
    links.map((l) => l.labelId),
    ['article-40.3', 'article-40.8', 'article-40.13']
  )
})

test('self-check: a top-level menu heading is a text slot of the menu, not a link label', () => {
  const groups = [
    {
      id: 'nav-drawer',
      items: [
        { level: 1, label: 'Sample pages', labelSlot: 'menuItem-18.0', target: { kind: 'heading' } },
        {
          level: 2,
          label: 'Login',
          labelSlot: 'menuItem-19.0',
          target: { kind: 'page', page: 'menuItem-19' }
        },
        {
          level: 1,
          label: 'Contact',
          labelSlot: 'menuItem-23.0',
          target: { kind: 'page', page: 'menuItem-23' }
        }
      ]
    }
  ]
  const drawer = { id: 'drawer', links: [{ id: 'drawer.link-2', label: 'Login', labelId: 'menuItem-19.0' }] }
  const errors = []
  assert.equal(menuLinkChecks({ blocks: [drawer], groups, errors }), 1)
  assert.deepEqual(
    errors.map((e) => e.field),
    ['site.navigationGroups[nav-drawer].items[Contact]']
  )
})

test("a button repeating another page's words takes the twin slot of the block's own entity", () => {
  // Nine tour pages, each its own "Book Now": the one of tour 16 is tour 16's, not the first in map order.
  const slots = [15, 16, 17].map((n) => ({
    key: `article-${n}.18`,
    entity: `article-${n}`,
    type: 'text',
    role: 'editorial.button_label',
    sample: 'Book Now'
  }))
  const links = [{ id: 'l0', label: 'Book Now', target: null }]
  labelLinks({ links, menuBlocks: {}, mapSlots: slots, entities: ['article-16'], siteUrl: SITE })
  assert.equal(links[0].labelId, 'article-16.18')
})

test('a menu no captured page draws: an item that opens nothing is left out, one that opens a page is still caught', () => {
  const groups = [
    {
      id: 'nav-block-9',
      block: 'block-9',
      items: [
        { level: 1, label: 'Bakeries', labelSlot: 'menuItem-40.0', target: { kind: 'none' }, alive: false },
        {
          level: 1,
          label: 'Classes',
          labelSlot: 'menuItem-41.0',
          target: { kind: 'page', page: 'menuItem-41' },
          alive: true
        }
      ]
    }
  ]
  const errors = []
  assert.equal(menuLinkChecks({ blocks: [{ id: 'header', links: [] }], groups, errors }), 1)
  assert.deepEqual(
    errors.map((e) => e.field),
    ['site.navigationGroups[nav-block-9].items[Classes]']
  )
  // The same menu drawn on a page: its dead item must be some link's label too.
  assert.equal(menuLinkChecks({ blocks: [{ id: 'block-9', links: [] }], groups, errors: [] }), 2)
})

test('a footer column listing aliases of main menu items reads its own menu, not the main menu it ties with', () => {
  const menus = {
    'module-1': { items: [item(101, 'Home', '/index.php'), item(150, 'Lessons', '/index.php/lessons')] },
    'module-30': { items: [item(301, 'Home', '/index.php'), item(302, 'Lessons', '/index.php/lessons')] }
  }
  const links = [
    { id: 'foot.link-1', label: 'Home', target: '/' },
    { id: 'foot.link-2', label: 'Lessons', target: '/lessons' }
  ]
  assert.equal(labelLinks({ links, menuBlocks: menus, entities: ['module-30'], siteUrl: SITE }), 'module-30')
  assert.deepEqual(
    links.map((l) => l.labelId),
    ['menuItem-301.0', 'menuItem-302.0']
  )
  // A block that is neither keeps the first menu, as before.
  const other = [
    { id: 'x.link-1', label: 'Home', target: '/' },
    { id: 'x.link-2', label: 'Lessons', target: '/lessons' }
  ]
  assert.equal(
    labelLinks({ links: other, menuBlocks: menus, entities: ['module-7'], siteUrl: SITE }),
    'module-1'
  )
})
