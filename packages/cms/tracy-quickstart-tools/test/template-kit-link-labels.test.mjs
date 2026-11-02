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
