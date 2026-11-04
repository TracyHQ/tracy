/**
 * Menu blocks at capture: a block whose own settings name a menu (any menu, not only the main one) gets a
 * `menuBlocks` entry in the content map listing that menu's items in display order, each with its label slot and
 * character limit, where it leads, and whether that target opened on the crawl. Every menu, item and page here is
 * invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { menuBlocksOf } from '../content-coverage/lib/menu-blocks.mjs'
import { measureSlotFit } from '../content-coverage/lib/slot-fit.mjs'

const label = (id, sample, fit) => ({
  key: `menuItem-${id}.0`,
  entity: `menuItem-${id}`,
  column: 'title',
  type: 'text',
  sample,
  maxCharacters: 60,
  role: 'editorial.navigation_label',
  ...(fit ? { fit: { measured: true, maxCharacters: fit } } : {})
})
const row = (menutype, title, type, link, extra = {}) => ({
  menutype,
  title,
  type,
  link,
  published: '1',
  level: '1',
  parent_id: '1',
  ...extra
})

function fixture() {
  const map = {
    entities: [
      { key: 'module-80', kind: 'module', identity: { title: 'Explore' }, sourceId: 80 },
      { key: 'module-81', kind: 'module', identity: { title: 'Top links' }, sourceId: 81 },
      { key: 'module-82', kind: 'module', identity: { title: 'About us text' }, sourceId: 82 },
      ...[501, 502, 503, 504, 505, 506, 507, 508, 601].map((id) => ({
        key: `menuItem-${id}`,
        kind: 'menuItem',
        sourceId: id
      }))
    ],
    slots: [
      { key: 'module-80.0', entity: 'module-80', column: 'title', type: 'text', sample: 'Explore' },
      label(501, 'Timetable', 12),
      label(502, 'Partner gym', null),
      label(503, 'Coming soon', 14),
      label(504, 'Programs', 10),
      label(505, 'Old offers', 11),
      label(506, 'Kids club', 9),
      label(507, 'Hidden', 9),
      label(508, 'Shortcut', 9),
      label(601, 'Timetable page', 20)
    ],
    pages: [
      { entity: 'menuItem-601', route: 'timetable', link: 'index.php?option=com_content&view=article&id=9' },
      { entity: 'menuItem-505', route: 'old-offers', link: 'index.php?option=com_content&view=article&id=8' }
    ]
  }
  const lock = {
    entities: {
      'module-80': {
        module: 'mod_anything',
        params: JSON.stringify({ menutype: 'footer-links', startLevel: 1, endLevel: 0, showAllChildren: 1 })
      },
      // The same menu, one level only: the child item is left out.
      'module-81': {
        module: 'mod_other',
        params: { menutype: 'footer-links', startLevel: '1', endLevel: '1' }
      },
      // A block with no menu in its settings.
      'module-82': { module: 'mod_custom', params: JSON.stringify({ heading: 'About us' }) },
      // Display order follows lft: 502 is drawn before 501 although its id is larger.
      'menuItem-501': row('footer-links', 'Timetable', 'url', 'index.php?Itemid=601', { lft: '20' }),
      'menuItem-502': row('footer-links', 'Partner gym', 'url', 'https://partner.invalid/', { lft: '10' }),
      'menuItem-503': row('footer-links', 'Coming soon', 'url', '#', { lft: '30' }),
      'menuItem-504': row('footer-links', 'Programs', 'heading', '', { lft: '40' }),
      'menuItem-506': row('footer-links', 'Kids club', 'alias', 'index.php?Itemid=', {
        lft: '41',
        level: '2',
        parent_id: '504',
        params: JSON.stringify({ aliasoptions: '601' })
      }),
      'menuItem-505': row(
        'footer-links',
        'Old offers',
        'component',
        'index.php?option=com_content&view=article&id=8',
        {
          lft: '50'
        }
      ),
      'menuItem-507': row('footer-links', 'Hidden', 'url', '#', { lft: '60', published: '0' }),
      'menuItem-508': row('other-menu', 'Shortcut', 'url', '#', { lft: '5' }),
      'menuItem-601': row(
        'hidden-pages',
        'Timetable page',
        'component',
        'index.php?option=com_content&view=article&id=9'
      )
    }
  }
  const findings = {
    pages: [
      {
        url: 'http://site.invalid/index.php?Itemid=601',
        requested: 'http://site.invalid/index.php?Itemid=601',
        status: 200,
        mapPages: [{ entity: 'menuItem-601', route: 'timetable' }],
        items: [
          {
            kind: 'text',
            value: 'Timetable',
            status: 'matched',
            slots: ['menuItem-501.0'],
            href: '/index.php/timetable',
            scopes: ['Mod80']
          }
        ]
      },
      { url: 'http://site.invalid/index.php/timetable', status: 200, mapPages: [], items: [] }
    ],
    failures: [{ url: 'http://site.invalid/index.php?Itemid=505', mapPage: 'menuItem-505', status: 404 }]
  }
  return { map, lock, findings }
}

test('a block whose settings name a menu lists its published items in display order, with levels', () => {
  const { map, lock, findings } = fixture()
  const { menuBlocks } = menuBlocksOf({ map, lock, findings })
  const block = menuBlocks['module-80']
  assert.equal(block.block, 'module-80')
  assert.equal(block.menu, 'footer-links')
  assert.equal(block.titleSlot, 'module-80.0')
  assert.equal(block.orderFrom, 'menu-tree')
  assert.deepEqual(
    block.items.map((i) => [i.item, i.level, i.parent]),
    [
      ['menuItem-502', 1, null],
      ['menuItem-501', 1, null],
      ['menuItem-503', 1, null],
      ['menuItem-504', 1, null],
      ['menuItem-506', 2, 'menuItem-504'],
      ['menuItem-505', 1, null]
    ]
  )
})

test('each item carries its label slot with the slot-fit limit, else the store limit', () => {
  const { map, lock, findings } = fixture()
  const items = menuBlocksOf({ map, lock, findings }).menuBlocks['module-80'].items
  const by = Object.fromEntries(items.map((i) => [i.item, i.label]))
  assert.deepEqual(by['menuItem-501'], {
    slot: 'menuItem-501.0',
    text: 'Timetable',
    maxCharacters: 12,
    limitFrom: 'slot-fit'
  })
  assert.deepEqual(by['menuItem-502'], {
    slot: 'menuItem-502.0',
    text: 'Partner gym',
    maxCharacters: 60,
    limitFrom: 'store'
  })
})

test('each target says where it leads and whether it opened on the crawl', () => {
  const { map, lock, findings } = fixture()
  const items = menuBlocksOf({ map, lock, findings }).menuBlocks['module-80'].items
  const by = Object.fromEntries(items.map((i) => [i.item, i.target]))
  assert.deepEqual(by['menuItem-501'], {
    kind: 'page',
    page: 'menuItem-601',
    path: '/index.php/timetable',
    alive: true,
    status: 200
  })
  assert.deepEqual(by['menuItem-502'], {
    kind: 'url',
    url: 'https://partner.invalid/',
    alive: null,
    status: null
  })
  assert.deepEqual(by['menuItem-503'], { kind: 'none', alive: false, status: null })
  assert.deepEqual(by['menuItem-504'], { kind: 'heading', alive: null, status: null })
  assert.deepEqual(by['menuItem-506'], {
    kind: 'alias',
    page: 'menuItem-601',
    path: null,
    alive: true,
    status: 200
  })
  assert.deepEqual(by['menuItem-505'], {
    kind: 'page',
    page: 'menuItem-505',
    path: null,
    alive: false,
    status: 404
  })
})

test('the level settings of a block decide which items it holds', () => {
  const { map, lock, findings } = fixture()
  const block = menuBlocksOf({ map, lock, findings }).menuBlocks['module-81']
  assert.ok(!block.items.some((i) => i.item === 'menuItem-506'))
  assert.equal(block.items.length, 5)
})

test('a block without a menu in its settings gets no menu block', () => {
  const { map, lock, findings } = fixture()
  assert.equal(menuBlocksOf({ map, lock, findings }).menuBlocks['module-82'], undefined)
})

test('without a tree position the items follow their ids, and the order is said to be weaker', () => {
  const { map, lock, findings } = fixture()
  for (const e of Object.values(lock.entities)) delete e.lft
  const block = menuBlocksOf({ map, lock, findings }).menuBlocks['module-80']
  assert.equal(block.orderFrom, 'item-id')
  assert.deepEqual(
    block.items.map((i) => i.item),
    ['menuItem-501', 'menuItem-502', 'menuItem-503', 'menuItem-504', 'menuItem-506', 'menuItem-505']
  )
})

test('measureSlotFit writes menuBlocks with the lock, nothing without it', () => {
  const { map, lock, findings } = fixture()
  const out = measureSlotFit({ map, findings, lock })
  assert.deepEqual(Object.keys(out.map.menuBlocks).sort(), ['module-80', 'module-81'])
  assert.equal(out.summary.menuBlocks, 2)
  assert.equal(measureSlotFit({ map, findings }).map.menuBlocks, undefined)
})

test('an item only a signed-in account may see is no item of the block a visitor is shown', () => {
  const { map, lock, findings } = fixture()
  // Access levels: 1 public and 5 guest are shown to a visitor; 2 registered and 6 super users are not.
  Object.assign(lock.entities['menuItem-502'], { access: '2' })
  Object.assign(lock.entities['menuItem-503'], { access: '6' })
  Object.assign(lock.entities['menuItem-505'], { access: '5' })
  const items = menuBlocksOf({ map, lock, findings }).menuBlocks['module-80'].items.map((i) => i.item)
  assert.deepEqual(items, ['menuItem-501', 'menuItem-504', 'menuItem-506', 'menuItem-505'])
})
