/**
 * Author pages (an author list's link opens one author's page) list that author's articles. Each declares its items
 * list like a listing page does: the author as source, the bound from the author view's own settings, the articles
 * shown in order, and each card field. Only articles the dump says the author wrote are candidates; a page the crawl
 * cannot tie to a shipped user (a machine's own account) and the later pages of a list (`?start=`) declare nothing.
 * Everything here is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { authorListsOf } from '../content-coverage/lib/author-lists.mjs'
import { accountsOfDump, authorsOfDump } from '../content-coverage/lib/db-index.mjs'

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
const slot = (key, column, type, sample, role) => ({
  key,
  entity: key.replace(/\.\d+$/, ''),
  column,
  type,
  sample,
  maxCharacters: 80,
  role
})

function fixture() {
  const map = {
    entities: [
      ...[41, 42, 43].map((id) => ({ key: `article-${id}`, kind: 'article', sourceId: id })),
      { key: 'user-61', kind: 'user', sourceId: 61 },
      { key: 'user-62', kind: 'user', sourceId: 62 }
    ],
    slots: [
      slot('article-41.0', 'title', 'text', 'Rope Basics', 'offering.name'),
      slot('article-42.0', 'title', 'text', 'Kettlebell Flow', 'offering.name'),
      slot('article-43.0', 'title', 'text', 'Morning Stretch', 'offering.name'),
      slot('user-61.0', 'name', 'text', 'Mia Ross', 'person.name'),
      slot('user-62.0', 'name', 'text', 'Theo Blake', 'person.name')
    ],
    pages: [
      { entity: 'menuItem-303', route: 'team', link: 'index.php?option=com_content&view=author&layout=list' }
    ]
  }
  const lock = {
    entities: { 'menuItem-303': { params: JSON.stringify({ num_authors: '8', num_intro_articles: '6' }) } }
  }
  const authorPage = (url, user, items) => ({
    url,
    mapPages: [],
    rendersEntity: user && { entity: user },
    items
  })
  const findings = {
    contentAuthors: { 41: '61', 42: '61', 43: '62' },
    pages: [
      authorPage('http://site.invalid/team/author/mia', 'user-61', [
        text('Mia Ross', ['user-61.0'], at(0, 20, 300, 40), { tag: 'h1' }),
        text('Kettlebell Flow', ['article-42.0'], at(0, 100, 300, 30), {
          href: '/workshops/kettlebell-flow'
        }),
        text('Rope Basics', ['article-41.0'], at(400, 100, 300, 30), { href: '/workshops/rope-basics' }),
        // Another author's article in a sidebar block: neither the body nor hers.
        text('Morning Stretch', ['article-43.0'], at(900, 100, 200, 30), { homes: ['Mod70'] })
      ]),
      // The second page of her list: the bound already says how many one page holds.
      authorPage('http://site.invalid/team/author/mia?start=6', 'user-61', [
        text('Rope Basics', ['article-41.0'], at(0, 100, 300, 30), { href: '/workshops/rope-basics' })
      ]),
      // A machine's own account: no shipped user, nothing to declare.
      authorPage('http://site.invalid/team/author/admin', null, [
        text('Morning Stretch', ['article-43.0'], at(0, 100, 300, 30), { href: '/workshops/morning-stretch' })
      ])
    ]
  }
  return { map, lock, findings }
}

test("an author page declares that author's articles, bounded by the author view's settings", () => {
  const { map, lock, findings } = fixture()
  const { itemLists } = authorListsOf({ map, lock, findings })
  assert.deepEqual(Object.keys(itemLists), ['user-61.items'])
  const list = itemLists['user-61.items']
  assert.equal(list.block, null)
  assert.equal(list.page, null)
  assert.equal(list.rowKind, 'items')
  assert.deepEqual(list.source, {
    kind: 'author',
    id: 'user-61',
    title: 'Mia Ross',
    page: 'menuItem-303',
    route: 'team'
  })
  assert.equal(list.pagePath, '/team/author/mia')
  assert.deepEqual(list.shown, ['article-42', 'article-41'])
  assert.equal(list.min, null)
  assert.equal(list.max, 6)
  assert.equal(list.maxFrom, 'view-setting')
  assert.equal(list.observedBy, 'body')
  const fields = Object.fromEntries(list.rowSlots.map((r) => [r.field, r]))
  assert.deepEqual(Object.keys(fields), ['title', 'link'])
  assert.deepEqual(
    fields.link.items.map((i) => i.path),
    ['/workshops/kettlebell-flow', '/workshops/rope-basics']
  )
})

test('without the authors of the dump nothing proves whose articles a page shows: no list', () => {
  const { map, lock, findings } = fixture()
  delete findings.contentAuthors
  assert.deepEqual(authorListsOf({ map, lock, findings }).itemLists, {})
})

test('without the view setting the bound is the count the demo shows', () => {
  const { map, findings } = fixture()
  const list = authorListsOf({ map, lock: { entities: {} }, findings }).itemLists['user-61.items']
  assert.equal(list.max, 2)
  assert.equal(list.maxFrom, 'demo-count')
})

test('a shipped user the map does not hold still gets the list of its own author page', () => {
  const { map, lock, findings } = fixture()
  // The site's own account: shipped in the dump, not in the map, so the page heading ties it to no entity.
  map.entities.push({ key: 'article-44', kind: 'article', sourceId: 44 })
  map.slots.push(slot('article-44.0', 'title', 'text', 'Open Gym Hours', 'offering.name'))
  findings.contentAuthors[44] = '70'
  findings.contentUsers = {
    61: { username: 'mia', name: 'Mia Ross' },
    70: { username: 'owner', name: 'Site Owner' }
  }
  findings.pages.push({
    url: 'http://site.invalid/team/author/owner',
    mapPages: [],
    rendersEntity: null,
    items: [
      text('Open Gym Hours', ['article-44.0'], at(0, 100, 300, 30), { href: '/workshops/open-gym-hours' })
    ]
  })
  const { itemLists } = authorListsOf({ map, lock, findings })
  assert.deepEqual(Object.keys(itemLists).sort(), ['user-61.items', 'user-70.items'])
  const list = itemLists['user-70.items']
  assert.deepEqual(list.source, {
    kind: 'author',
    id: 'user-70',
    title: 'Site Owner',
    page: 'menuItem-303',
    route: 'team'
  })
  assert.equal(list.pagePath, '/team/author/owner')
  assert.deepEqual(list.shown, ['article-44'])
  assert.equal(list.max, 6)
  assert.deepEqual(
    list.rowSlots.map((r) => r.field),
    ['title', 'link']
  )
  // The machine's own account is still in no list: the dump does not ship it.
  assert.equal(itemLists['user-admin.items'], undefined)
})

test("the dump's accounts give each user's login and display name, nothing else", () => {
  const tables = new Map([
    [
      'jos_users',
      [{ id: '70', name: 'Site Owner', username: 'owner', email: 'owner@site.invalid', password: 'x' }]
    ]
  ])
  assert.deepEqual(accountsOfDump(tables, 'jos_'), { 70: { username: 'owner', name: 'Site Owner' } })
})

test("the dump's articles name their author", () => {
  const tables = new Map([
    [
      'jos_content',
      [
        { id: '41', created_by: '61', title: 'Rope Basics' },
        { id: '42', created_by: '0', title: 'Kettlebell Flow' }
      ]
    ],
    ['jos_users', [{ id: '61', name: 'Mia Ross' }]]
  ])
  assert.deepEqual(authorsOfDump(tables, 'jos_'), { 41: '61' })
})
