/**
 * Tag pages (a tag link on an article opens the page of every item with that tag) list those items. Each declares its
 * items list like an author page does: the tag as source, the items shown in order, and each card field. The page is
 * tied to its tag by the last part of its path (the tag's alias); a page the crawl cannot tie to a tag, a view of
 * several tags and the later pages of a list (`?start=`) declare nothing. Everything here is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tagListsOf } from '../content-coverage/lib/tag-lists.mjs'

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
      { key: 'tag-7', kind: 'tag', sourceId: 7, identity: { path: 'tides' } },
      { key: 'tag-8', kind: 'tag', sourceId: 8, identity: { path: 'reefs' } }
    ],
    slots: [
      slot('article-41.0', 'title', 'text', 'Spring Tides Explained', 'editorial.heading'),
      slot('article-42.0', 'title', 'text', 'Reading a Tide Table', 'editorial.heading'),
      slot('article-43.0', 'title', 'text', 'Reef Walks at Dawn', 'editorial.heading'),
      slot('tag-7.0', 'title', 'text', 'tides', 'taxonomy.tag'),
      slot('tag-8.0', 'title', 'text', 'reefs', 'taxonomy.tag')
    ],
    pages: []
  }
  const tagPage = (url, tag, items) => ({ url, mapPages: [], rendersEntity: tag && { entity: tag }, items })
  const findings = {
    pages: [
      tagPage('http://site.invalid/component/tags/tag/tides', 'tag-7', [
        text('tides', ['tag-7.0'], at(0, 20, 300, 40), { tag: 'h1' }),
        text('Reading a Tide Table', ['article-42.0'], at(0, 100, 300, 30), {
          href: '/news/reading-a-tide-table'
        }),
        text('Spring Tides Explained', ['article-41.0'], at(0, 160, 300, 30), {
          href: '/news/spring-tides-explained'
        }),
        // An article in a sidebar block: not the tag's list.
        text('Reef Walks at Dawn', ['article-43.0'], at(900, 100, 200, 30), { homes: ['Mod70'] })
      ]),
      // The second page of the same tag: the first already declares the list.
      tagPage('http://site.invalid/component/tags/tag/tides?start=20', 'tag-7', [
        text('Spring Tides Explained', ['article-41.0'], at(0, 100, 300, 30), {
          href: '/news/spring-tides-explained'
        })
      ]),
      // A menu page showing several tags: its heading names one tag, its path names none.
      tagPage('http://site.invalid/news/tagged', 'tag-8', [
        text('Reef Walks at Dawn', ['article-43.0'], at(0, 100, 300, 30), {
          href: '/news/reef-walks-at-dawn'
        })
      ])
    ]
  }
  return { map, findings }
}

test('a tag page declares the items it shows, in order, with their card fields', () => {
  const { map, findings } = fixture()
  const { itemLists } = tagListsOf({ map, findings })
  assert.deepEqual(Object.keys(itemLists), ['tag-7.items'])
  const list = itemLists['tag-7.items']
  assert.equal(list.block, null)
  assert.equal(list.page, null)
  assert.equal(list.rowKind, 'items')
  assert.deepEqual(list.source, { kind: 'tag', id: 'tag-7', title: 'tides', page: null, route: null })
  assert.equal(list.pagePath, '/component/tags/tag/tides')
  assert.deepEqual(list.shown, ['article-42', 'article-41'])
  assert.equal(list.max, 2)
  assert.equal(list.maxFrom, 'demo-count')
  assert.equal(list.observedBy, 'body')
  assert.deepEqual(
    list.rowSlots.map((r) => r.field),
    ['title', 'link']
  )
})

test('a page whose path names no tag of the map declares nothing', () => {
  const { map, findings } = fixture()
  map.entities = map.entities.filter((e) => e.key !== 'tag-7')
  assert.deepEqual(tagListsOf({ map, findings }).itemLists, {})
})

test('a heading whose first slot is another item ("Tagged: Reefs" beside a feature named "Reefs") still ties the tag', () => {
  const { map, findings } = fixture()
  map.slots.push(slot('module-5.0', 'title', 'text', 'reefs', 'offering.name'))
  findings.pages.push(
    tagPage2('http://site.invalid/component/tags/tag/reefs', 'module-5', [
      text('Tagged: reefs', ['module-5.0', 'tag-8.0'], at(0, 20, 300, 40), { tag: 'h1' }),
      text('Reef Walks at Dawn', ['article-43.0'], at(0, 100, 300, 30), { href: '/news/reef-walks-at-dawn' })
    ])
  )
  assert.deepEqual(Object.keys(tagListsOf({ map, findings }).itemLists), ['tag-7.items', 'tag-8.items'])
  // The matcher gave the tag's words to the feature alone: the words still tie the tag.
  findings.pages.at(-1).items[0].slots = ['module-5.0']
  assert.deepEqual(Object.keys(tagListsOf({ map, findings }).itemLists), ['tag-7.items', 'tag-8.items'])
  // A heading printing other words ties nothing.
  map.slots.push(slot('module-6.0', 'title', 'text', 'kelp', 'offering.name'))
  findings.pages.at(-1).items[0].slots = ['module-6.0']
  assert.deepEqual(Object.keys(tagListsOf({ map, findings }).itemLists), ['tag-7.items'])
})

function tagPage2(url, entity, items) {
  return { url, mapPages: [], rendersEntity: { entity }, items }
}

test('a module alone in its position, with no chrome of its own, is found by the position wrapper', async () => {
  const { blockPool } = await import('../content-coverage/lib/item-lists.mjs')
  const items = [
    { kind: 'text', value: 'A', scopes: ['t4-section-9'] },
    { kind: 'text', value: 'B', scopes: ['t4-section-10'] }
  ]
  assert.deepEqual(blockPool({ sourceId: 122 }, false, 'section-9')(items)?.pool.map((p) => p.it.value), ['A'])
  assert.equal(blockPool({ sourceId: 122 }, false)(items), null, 'not alone there: no guess')
})
