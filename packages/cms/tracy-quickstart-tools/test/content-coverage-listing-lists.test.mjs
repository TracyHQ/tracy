/**
 * Listing pages (a page whose body lists content items: a category, the featured items, the authors) declare their
 * items list like a category block does: source, bounds from the view's own settings, items shown in order, and each
 * card field with its character limit, the link to the item's page and the demo-owned fields. Only the page body
 * counts: blocks on the same page (a footer menu, a sidebar) are not the listing. Everything here is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mergeViewports } from '../content-coverage/lib/items.mjs'
import { listingListsOf } from '../content-coverage/lib/listing-lists.mjs'

const at = (x, y, w, h) => ({ desktop: { visible: true, count: 1, rect: { x, y, w, h } } })
const text = (value, slots, viewports, extra = {}) => ({
  kind: 'text',
  value,
  status: 'matched',
  matchBy: 'exact',
  slots,
  viewports,
  homes: [''],
  ...extra
})
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

function fixture() {
  const map = {
    entities: [
      { key: 'category-31', kind: 'category', identity: { path: 'workshops' }, sourceId: 31 },
      ...[41, 42].map((id) => ({
        key: `article-${id}`,
        kind: 'article',
        sourceId: id,
        identityReferences: { catid: 'category-31' }
      })),
      { key: 'user-61', kind: 'user', sourceId: 61 },
      { key: 'user-62', kind: 'user', sourceId: 62 },
      { key: 'menuItem-405', kind: 'menuItem', sourceId: 405 }
    ],
    slots: [
      slot('category-31.0', 'title', 'text', 'Workshops', 'editorial.heading'),
      slot('article-41.0', 'title', 'text', 'Rope Basics', 'offering.name'),
      slot('article-41.1', 'attribs', 'text', '$20', 'offering.price', { jsonPath: ['price'] }),
      slot('article-42.0', 'title', 'text', 'Kettlebell Flow', 'offering.name'),
      slot('article-42.1', 'attribs', 'text', '$25', 'offering.price', { jsonPath: ['price'] }),
      slot('menuItem-405.0', 'title', 'text', 'Rope Basics', 'editorial.navigation_label'),
      slot('user-61.0', 'name', 'text', 'Mia Ross', 'person.name'),
      slot('user-62.0', 'name', 'text', 'Theo Blake', 'person.name')
    ],
    pages: [
      {
        entity: 'menuItem-302',
        route: 'workshops',
        link: 'index.php?option=com_content&view=category&layout=blog&id=31'
      },
      { entity: 'menuItem-303', route: 'team', link: 'index.php?option=com_content&view=author&layout=list' },
      { entity: 'menuItem-304', route: 'highlights', link: 'index.php?option=com_content&view=featured' }
    ]
  }
  const lock = {
    entities: {
      'menuItem-302': {
        params: JSON.stringify({ num_leading_articles: '0', num_intro_articles: '4', num_links: '' })
      },
      'menuItem-303': { params: { num_authors: '8' } },
      'menuItem-304': { params: {} }
    }
  }
  const findings = {
    pages: [
      {
        url: 'http://site.invalid/index.php?Itemid=302',
        mapPages: [{ entity: 'menuItem-302', route: 'workshops' }],
        items: [
          text('Kettlebell Flow', ['article-42.0'], at(0, 100, 300, 30), {
            href: '/workshops/kettlebell-flow'
          }),
          text('$25', ['article-42.1'], at(0, 140, 100, 20)),
          // The card title is also a footer menu label: one item, both copies.
          text('Rope Basics', ['article-41.0', 'menuItem-405.0'], at(0, 300, 300, 30), {
            href: '/workshops/rope-basics',
            homes: ['', 'Mod90']
          }),
          text('$20', ['article-41.1'], at(0, 340, 100, 20)),
          // A block on the same page that shows an item of the category: not the listing.
          text('Kettlebell Flow', ['article-42.0'], at(0, 900, 300, 30), {
            homes: ['Mod70'],
            value: 'Kettlebell'
          })
        ]
      },
      {
        url: 'http://site.invalid/index.php?Itemid=303',
        mapPages: [{ entity: 'menuItem-303', route: 'team' }],
        items: [
          text('Theo Blake', ['user-62.0'], at(0, 100, 200, 30), { href: '/team/author/theo' }),
          text('Mia Ross', ['user-61.0'], at(300, 100, 200, 30), { href: '/team/author/mia' })
        ]
      },
      { url: 'http://site.invalid/index.php?Itemid=304', mapPages: [{ entity: 'menuItem-304' }], items: [] }
    ]
  }
  return { map, lock, findings }
}

test('a category listing page declares its items list with the page size from its view settings', () => {
  const { map, lock, findings } = fixture()
  const list = listingListsOf({ map, lock, findings }).itemLists['menuItem-302.items']
  assert.equal(list.page, 'menuItem-302')
  assert.equal(list.block, null)
  assert.equal(list.rowKind, 'items')
  assert.deepEqual(list.source, {
    kind: 'category',
    id: 'category-31',
    title: 'Workshops',
    page: 'menuItem-302',
    route: 'workshops'
  })
  assert.deepEqual(list.shown, ['article-42', 'article-41'])
  assert.equal(list.max, 4)
  assert.equal(list.maxFrom, 'view-setting')
  assert.equal(list.observedBy, 'body')
  const fields = Object.fromEntries(list.rowSlots.map((r) => [r.field, r]))
  assert.deepEqual(Object.keys(fields), ['title', 'link', 'custom:price'])
  assert.equal(fields['custom:price'].demoOwned, true)
  assert.deepEqual(
    fields.link.items.map((i) => i.path),
    ['/workshops/kettlebell-flow', '/workshops/rope-basics']
  )
  assert.deepEqual(list.demoOwned, ['article-42.0', 'article-41.0', 'article-42.1', 'article-41.1'])
})

test('an author list declares people rows, and each item page joins the listing', () => {
  const { map, lock, findings } = fixture()
  const { itemLists, itemPages } = listingListsOf({ map, lock, findings })
  const list = itemLists['menuItem-303.items']
  assert.equal(list.source.kind, 'authors')
  assert.deepEqual(list.shown, ['user-62', 'user-61'])
  assert.equal(list.max, 8)
  assert.equal(list.rowSlots[0].field, 'title')
  assert.equal(list.rowSlots[0].demoOwned, true)
  assert.deepEqual(itemPages['user-61'], {
    path: '/team/author/mia',
    listingPage: 'menuItem-303',
    listingRoute: 'team',
    linkedFrom: ['menuItem-303']
  })
})

test('a listing page that shows no item declares no list, so no list is left without card fields', () => {
  const { map, lock, findings } = fixture()
  assert.equal(listingListsOf({ map, lock, findings }).itemLists['menuItem-304.items'], undefined)
})

test('each copy of an item records whether it sits in a block, so the page body can be told apart', () => {
  const merged = mergeViewports(
    {
      desktop: {
        items: [
          { kind: 'text', value: 'Rope Basics', scopes: [] },
          { kind: 'text', value: 'Rope Basics', scopes: ['Mod90', 'footer-2'] },
          { kind: 'text', value: 'Only in a block', scopes: ['mod-list-70', 'Mod70'] }
        ]
      }
    },
    'http://site.invalid/'
  )
  assert.deepEqual(merged[0].homes, ['', 'Mod90'])
  assert.deepEqual(merged[1].homes, ['mod-list-70'])
})

test('a menu drawn outside every block (a header mega menu) is not the listing, even when it names its items', () => {
  const { map, lock, findings } = fixture()
  findings.pages[2].items = [
    text('Rope Basics', ['article-41.0', 'menuItem-405.0'], at(0, 10, 100, 20), {
      role: 'nav',
      href: '/workshops/rope-basics'
    })
  ]
  assert.equal(listingListsOf({ map, lock, findings }).itemLists['menuItem-304.items'], undefined)
})

test('a card title an off-canvas menu also prints is still the body copy, read by its own role', () => {
  const merged = mergeViewports(
    {
      desktop: {
        items: [
          // The menu copies are met first: the merged item's role is the menus'. One of them (a header mega menu)
          // sits outside every block, like the card.
          { kind: 'text', value: 'Rope Basics', role: 'nav', scopes: ['Mod90'] },
          { kind: 'text', value: 'Rope Basics', role: 'nav', scopes: [] },
          { kind: 'text', value: 'Rope Basics', role: 'content', scopes: [] }
        ]
      }
    },
    'http://site.invalid/'
  )
  assert.equal(merged[0].role, 'nav')
  assert.equal(merged[0].bodyRole, 'content')

  const { map, lock, findings } = fixture()
  findings.pages[2].items = [
    text('Rope Basics', ['article-41.0', 'menuItem-405.0'], at(0, 10, 100, 20), {
      role: 'nav',
      bodyRole: 'content',
      homes: ['Mod90', ''],
      href: '/workshops/rope-basics'
    })
  ]
  assert.deepEqual(listingListsOf({ map, lock, findings }).itemLists['menuItem-304.items'].shown, [
    'article-41'
  ])

  // A bare link (the logo's home address, a "#") matches every url slot holding the same value: its body copy's role
  // proves no card, so a menu's copy still keeps it out.
  findings.pages[2].items = [
    {
      kind: 'link',
      value: '/workshops/rope-basics',
      status: 'matched',
      slots: ['article-41.0'],
      role: 'nav',
      bodyRole: 'content',
      homes: ['Mod90', ''],
      viewports: at(0, 10, 100, 20)
    }
  ]
  assert.equal(listingListsOf({ map, lock, findings }).itemLists['menuItem-304.items'], undefined)
})
