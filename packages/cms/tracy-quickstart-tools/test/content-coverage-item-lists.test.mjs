/**
 * Item lists at capture: a block that pulls content items from a category (its own settings name the category) gets
 * an `itemLists` entry in the content map: the source, the bounds, the items it shows in display order, and which
 * fields of each item its cards show with their character limits. The detail page of each shown item is tied to the
 * category in `itemPages`. Every category, item, block and business here is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { itemListsOf } from '../content-coverage/lib/item-lists.mjs'
import { measureSlotFit } from '../content-coverage/lib/slot-fit.mjs'

const at = (x, y, w, h) => ({ desktop: { visible: true, count: 1, rect: { x, y, w, h } } })
const look = { width: 300, lines: 1, charWidth: 10, textTransform: 'none' }
const atLook = (x, y, w, h) => ({ desktop: { visible: true, count: 1, rect: { x, y, w, h }, look } })

function text(value, slots, viewports, extra = {}) {
  return { kind: 'text', value, status: 'matched', matchBy: 'exact', slots, viewports, ...extra }
}
function picture(value, slots, viewports, extra = {}) {
  return {
    kind: 'image',
    source: 'img',
    value,
    status: 'matched',
    matchBy: 'path',
    slots,
    viewports,
    ...extra
  }
}

const slot = (key, column, type, sample, role, extra = {}) => ({
  key,
  entity: key.replace(/\.\d+$/, ''),
  column,
  type,
  sample,
  maxCharacters: 80,
  role,
  ...extra
})

/** Three workshop items of an invented gym, shown by block module-70 (category 31, three items). */
function fixture() {
  const article = (id, title, day, time) => [
    slot(`article-${id}.0`, 'title', 'text', title, 'offering.name'),
    slot(`article-${id}.1`, 'introtext', 'text', `${title} for every level.`, 'editorial.paragraph'),
    slot(`article-${id}.2`, 'images', 'image', `images/demo/workshops/${id}.jpg`, 'offering.image', {
      jsonPath: ['image_intro']
    }),
    slot(`article-${id}.3`, 'attribs', 'text', day, 'offering.schedule', {
      jsonPath: ['sessions', 'sessions0', 'day']
    }),
    slot(`article-${id}.4`, 'attribs', 'text', time, 'offering.schedule', {
      jsonPath: ['sessions', 'sessions0', 'time']
    })
  ]
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [
      { key: 'category-31', kind: 'category', identity: { path: 'workshops' }, sourceId: 31 },
      { key: 'category-32', kind: 'category', identity: { path: 'news' }, sourceId: 32 },
      { key: 'module-70', kind: 'module', identity: { title: 'Workshops' }, sourceId: 70 },
      { key: 'module-71', kind: 'module', identity: { title: 'Opening hours' }, sourceId: 71 },
      { key: 'module-72', kind: 'module', identity: { title: 'Latest news' }, sourceId: 72 },
      ...[41, 42, 43].map((id) => ({
        key: `article-${id}`,
        kind: 'article',
        identity: { alias: `w${id}` },
        sourceId: id,
        identityReferences: { catid: 'category-31' }
      })),
      {
        key: 'article-50',
        kind: 'article',
        identity: { alias: 'n50' },
        sourceId: 50,
        identityReferences: { catid: 'category-32' }
      }
    ],
    slots: [
      slot('category-31.0', 'title', 'text', 'Workshops', 'editorial.heading'),
      slot('module-70.0', 'params', 'text', 'Our workshops', 'editorial.heading'),
      slot('module-71.0', 'params', 'text', 'Open daily', 'editorial.heading'),
      ...article(41, 'Rope Basics', 'MONDAY', '7:00 AM'),
      ...article(42, 'Kettlebell Flow', 'TUESDAY', '7:00 AM'),
      ...article(43, 'Mobility Hour', 'MONDAY', '6:30 PM'),
      slot('article-50.0', 'title', 'text', 'New mats arrived', 'editorial.heading'),
      slot('languageString-9.0', 'value', 'text', 'Book a spot', 'editorial.button_label')
    ],
    pages: [
      {
        entity: 'menuItem-301',
        route: 'home',
        link: 'index.php?option=com_content&view=featured',
        assignedModules: [{ entity: 'module-70' }, { entity: 'module-71' }]
      },
      {
        entity: 'menuItem-302',
        route: 'workshops',
        link: 'index.php?option=com_content&view=category&layout=blog&id=31',
        assignedModules: []
      }
    ]
  }
  const lock = {
    entities: {
      // A category block: its settings name category 31 and show three items.
      'module-70': {
        module: 'mod_any_list',
        params: JSON.stringify({ catid: ['31'], count: 3, heading: 'Our workshops' })
      },
      // No category in its settings: a block of its own words, never an item list.
      'module-71': { module: 'mod_custom', params: JSON.stringify({ heading: 'Open daily' }) },
      // A category block whose settings hold the category inside a nested object, with no count.
      'module-72': { module: 'mod_other', params: { source: { category: 32 } } }
    }
  }
  const scoped = (extra = {}) => ({ scopes: ['mod-list-70', 'Mod70', 'section-2'], ...extra })
  // The home page in DOM order: Kettlebell Flow first, then Rope Basics, then Mobility Hour (not alphabetical, not id).
  const items = [
    text('Our workshops', ['module-70.0'], at(0, 900, 400, 40), scoped()),
    text(
      'Kettlebell Flow',
      ['article-42.0'],
      atLook(600, 1000, 300, 30),
      scoped({ href: '/workshops/kettlebell-flow' })
    ),
    text(
      'Book a spot',
      ['languageString-9.0'],
      at(1000, 1000, 120, 40),
      scoped({ href: '/workshops/kettlebell-flow' })
    ),
    text('Kettlebell Flow for every level.', ['article-42.1'], atLook(600, 1040, 500, 40), scoped()),
    text('TUESDAY', ['article-42.3'], atLook(600, 1100, 150, 20), scoped()),
    // Words two items share: it belongs to the card it sits in.
    text('7:00 AM', ['article-41.4', 'article-42.4'], atLook(600, 1130, 150, 20), scoped()),
    text(
      'Rope Basics',
      ['article-41.0'],
      atLook(600, 1400, 300, 30),
      scoped({ href: '/workshops/rope-basics' })
    ),
    text(
      'Book a spot',
      ['languageString-9.0'],
      at(1000, 1400, 120, 40),
      scoped({ href: '/workshops/rope-basics' })
    ),
    text('Rope Basics for every level.', ['article-41.1'], atLook(600, 1440, 500, 40), scoped()),
    // Shared by two items, sitting in the Rope Basics card.
    text('MONDAY', ['article-41.3', 'article-43.3'], atLook(600, 1500, 150, 20), scoped()),
    text(
      'Mobility Hour',
      ['article-43.0'],
      atLook(600, 1800, 300, 30),
      scoped({ href: '/workshops/mobility-hour' })
    ),
    text('Mobility Hour for every level.', ['article-43.1'], atLook(600, 1840, 500, 40), scoped()),
    text('6:30 PM', ['article-43.4'], atLook(600, 1930, 150, 20), scoped()),
    // Mobility Hour's day is the shared "MONDAY": the findings merged its copy into the one in the Rope Basics card.
    picture('/images/demo/workshops/42.jpg', ['article-42.2'], at(600, 1160, 500, 200), scoped()),
    picture('/images/demo/workshops/41.jpg', ['article-41.2'], at(600, 1560, 500, 200), scoped()),
    picture('/images/demo/workshops/43.jpg', ['article-43.2'], at(600, 1960, 500, 200), scoped()),
    // Another block of the same page shows one item's title as a tab label: not this block.
    text('Rope Basics', ['article-41.0', 'module-71.0'], at(0, 4000, 100, 30), { scopes: ['Mod71'] }),
    text('Open daily', ['module-71.0'], at(0, 3900, 300, 30), { scopes: ['Mod71'] })
  ]
  const findings = {
    pages: [
      { url: 'http://site.invalid/', mapPages: [{ entity: 'menuItem-301', route: 'home' }], items },
      {
        url: 'http://site.invalid/workshops',
        mapPages: [{ entity: 'menuItem-302', route: 'workshops' }],
        items: []
      }
    ]
  }
  return { map, lock, findings }
}

test('a block whose settings name a category gets an items list with the shown items in display order', () => {
  const { map, lock, findings } = fixture()
  const { itemLists } = itemListsOf({ map, lock, findings })
  const list = itemLists['module-70.items']
  assert.ok(list, 'module-70 has an items list')
  assert.equal(list.block, 'module-70')
  assert.equal(list.rowKind, 'items')
  assert.deepEqual(list.source, {
    kind: 'category',
    id: 'category-31',
    title: 'Workshops',
    page: 'menuItem-302',
    route: 'workshops'
  })
  assert.deepEqual(list.shown, ['article-42', 'article-41', 'article-43'])
  assert.equal(list.max, 3)
  assert.equal(list.maxFrom, 'block-setting')
  assert.equal(list.min, null)
  assert.equal(list.minFrom, 'unknown')
  assert.equal(list.observedBy, 'block')
  assert.equal(list.observedOn, '/')
})

test('a block without a category in its settings gets no items list', () => {
  const { map, lock, findings } = fixture()
  const { itemLists } = itemListsOf({ map, lock, findings })
  assert.equal(itemLists['module-71.items'], undefined)
})

test('a category block no page showed is still declared, with nothing shown and the reason', () => {
  const { map, lock, findings } = fixture()
  const list = itemListsOf({ map, lock, findings }).itemLists['module-72.items']
  assert.equal(list.source.id, 'category-32')
  assert.deepEqual(list.shown, [])
  assert.deepEqual(list.rowSlots, [])
  assert.equal(list.max, null)
  assert.equal(list.observedBy, null)
})

test('each card field maps to every shown item own slot, with the slot-fit limit, and shared words go to their card', () => {
  const { map, lock, findings } = fixture()
  const fitted = measureSlotFit({ map, findings }).map
  const list = itemListsOf({ map: fitted, lock, findings }).itemLists['module-70.items']
  const byField = Object.fromEntries(list.rowSlots.map((r) => [r.field, r]))
  assert.deepEqual(Object.keys(byField), [
    'title',
    'link',
    'summary',
    'custom:sessions/sessions0/day',
    'custom:sessions/sessions0/time',
    'image:image_intro'
  ])
  assert.deepEqual(
    byField.title.items.map((i) => [i.item, i.slot]),
    [
      ['article-42', 'article-42.0'],
      ['article-41', 'article-41.0'],
      ['article-43', 'article-43.0']
    ]
  )
  // The tightest measured box: 300px at 10px a character holds 30 characters on one line.
  assert.equal(byField.title.items[0].maxCharacters, 30)
  assert.equal(byField.title.items[0].limitFrom, 'slot-fit')
  // "MONDAY" sits in the Rope Basics card and "7:00 AM" in the Kettlebell Flow card: the findings keep one copy of
  // shared words, so the card that lost its copy gets its own slot of the same field, marked inferred.
  const slotsOf = (field) => byField[field].items.map((i) => [i.slot, i.inferred === true])
  assert.deepEqual(slotsOf('custom:sessions/sessions0/day'), [
    ['article-42.3', false],
    ['article-41.3', false],
    ['article-43.3', true]
  ])
  assert.deepEqual(slotsOf('custom:sessions/sessions0/time'), [
    ['article-42.4', false],
    ['article-41.4', true],
    ['article-43.4', false]
  ])
  assert.deepEqual(byField.link, {
    field: 'link',
    kind: 'link',
    target: 'item-page',
    labels: ['Book a spot'],
    demoOwned: false,
    items: [
      { item: 'article-42', path: '/workshops/kettlebell-flow' },
      { item: 'article-41', path: '/workshops/rope-basics' },
      { item: 'article-43', path: '/workshops/mobility-hour' }
    ]
  })
  assert.equal(byField['image:image_intro'].type, 'image')
  assert.equal(byField['image:image_intro'].items.length, 3)
})

test('demo facts on the cards (names, schedule, pictures) are demo-owned; template prose is not', () => {
  const { map, lock, findings } = fixture()
  const list = itemListsOf({ map, lock, findings }).itemLists['module-70.items']
  const owned = Object.fromEntries(list.rowSlots.map((r) => [r.field, r.demoOwned]))
  assert.equal(owned.title, true)
  assert.equal(owned['custom:sessions/sessions0/day'], true)
  assert.equal(owned['custom:sessions/sessions0/time'], true)
  assert.equal(owned.summary, false)
  assert.ok(list.demoOwned.includes('article-41.4'))
  assert.ok(list.demoOwned.includes('article-42.0'))
  assert.ok(!list.demoOwned.includes('article-42.1'))
})

test('the detail page of each shown item is tied to its category page, so it joins that page group', () => {
  const { map, lock, findings } = fixture()
  const { itemPages } = itemListsOf({ map, lock, findings })
  assert.deepEqual(itemPages['article-41'], {
    path: '/workshops/rope-basics',
    category: 'category-31',
    categoryPage: 'menuItem-302',
    categoryRoute: 'workshops',
    linkedFrom: ['module-70']
  })
  assert.equal(Object.keys(itemPages).length, 3)
})

test('without block scopes in the findings, the cards are read from the pages the block is assigned to', () => {
  const { map, lock, findings } = fixture()
  for (const it of findings.pages[0].items) delete it.scopes
  const list = itemListsOf({ map, lock, findings }).itemLists['module-70.items']
  assert.equal(list.observedBy, 'page')
  assert.deepEqual(list.shown, ['article-42', 'article-41', 'article-43'])
})

test('measureSlotFit writes itemLists and itemPages when given the presentation lock, and nothing without it', () => {
  const { map, lock, findings } = fixture()
  const withLock = measureSlotFit({ map, findings, lock })
  assert.deepEqual(Object.keys(withLock.map.itemLists).sort(), ['module-70.items', 'module-72.items'])
  assert.equal(withLock.map.itemLists['module-70.items'].rowSlots[0].items[0].maxCharacters, 30)
  assert.ok(withLock.map.itemPages['article-42'])
  assert.equal(withLock.summary.itemLists, 2)
  const without = measureSlotFit({ map, findings }).map
  assert.equal(without.itemLists, undefined)
  assert.equal(without.itemPages, undefined)
})

test('a card title that merged with the page heading (no link) takes its detail page from a link inside the card', () => {
  const { map, lock, findings } = fixture()
  const title = findings.pages[0].items.find((it) => it.value === 'Kettlebell Flow')
  delete title.href
  const { itemLists, itemPages } = itemListsOf({ map, lock, findings })
  const link = itemLists['module-70.items'].rowSlots.find((r) => r.field === 'link')
  assert.deepEqual(link.items[0], { item: 'article-42', path: '/workshops/kettlebell-flow' })
  assert.equal(itemPages['article-42'].path, '/workshops/kettlebell-flow')
})

test('a card title whose words also fill a footer menu link still anchors its card and names its detail page', () => {
  const { map, lock, findings } = fixture()
  map.entities.push({
    key: 'menuItem-401',
    kind: 'menuItem',
    identity: { title: 'Kettlebell Flow' },
    sourceId: 401
  })
  map.slots.push(slot('menuItem-401.0', 'title', 'text', 'Kettlebell Flow', 'editorial.navigation_label'))
  // The footer link shares the card title's words, so the title matched both slots; the button sits above the
  // card's other parts, outside the box they make.
  const items = findings.pages[0].items
  const title = items.find((it) => it.value === 'Kettlebell Flow')
  title.slots = ['article-42.0', 'menuItem-401.0']
  items.find((it) => it.value === 'Book a spot').viewports = at(1000, 960, 120, 40)
  const { itemLists, itemPages } = itemListsOf({ map, lock, findings })
  const list = itemLists['module-70.items']
  assert.deepEqual(list.shown, ['article-42', 'article-41', 'article-43'])
  const link = list.rowSlots.find((r) => r.field === 'link')
  assert.deepEqual(
    link.items.map((i) => i.item),
    ['article-42', 'article-41', 'article-43']
  )
  assert.equal(itemPages['article-42'].path, '/workshops/kettlebell-flow')
  const title42 = list.rowSlots.find((r) => r.field === 'title').items[0]
  assert.deepEqual([title42.item, title42.slot], ['article-42', 'article-42.0'])
})
