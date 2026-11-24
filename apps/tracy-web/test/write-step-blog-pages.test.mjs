// A blog the plan keeps, end to end through the write step (dev lat32, 23/11/2026): a kept post one category below the blog's
// menu item takes its slug as its article's alias, keeping the id the router prints; a dropped category view has nothing to
// unpublish; a dropped tag page takes its tag off; the listing's pagination and the fields of a dropped post's article leave
// with what the plan drops. Every site, page, row and word here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeOrders } from '../src/write-step/page-route-lines.js'
import { demoArticleAlias } from '../src/write-step/page-route-parent.js'
import { restoreRoutes, runRouteStage } from '../src/write-step/page-route-stage.js'
import { dropPages, tagListingOf } from '../src/write-step/hide-writes.js'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { hideLines } from '../src/write-step/hide-lines.js'
import { fakeSite, SITE } from './_write-step-run.mjs'

const item = (id, alias, path, parent, extra = {}) => ({
  kind: 'menuItem',
  id,
  alias,
  path,
  parent_id: parent,
  published: 1,
  language: '*',
  client_id: 0,
  menutype: 'mainmenu',
  type: 'component',
  link: 'index.php?option=com_content&view=category&layout=blog&id=8',
  ...extra
})
const POST = '/journal/2-kitchen-notes/4-old-harvest-supper'
const KIT = {
  blocks: [
    { id: 'body-post', source: { owner: 'article-4', ownerKind: 'article' } },
    { id: 'body-category', source: { owner: 'category-2', ownerKind: 'category listing' } },
    { id: 'body-tag', source: { owner: 'tag-3', ownerKind: 'tag listing' } },
    { id: 'body-old-post', source: { owner: 'article-5', ownerKind: 'article' } },
    {
      id: 'body-journal',
      source: { owner: 'category-8', ownerKind: 'category listing' },
      links: [
        {
          id: 'body-journal.link-9',
          label: '2',
          target: '/journal?start=6',
          action: 'page-control',
          fixedLabel: { rule: 'pagination', reason: 'a CMS pagination control' }
        }
      ],
      lists: [{ id: 'menuItem-10.items', rowSlots: [{ field: 'title', slots: [{ id: 'article-5.3' }] }] }]
    }
  ],
  pages: [
    { id: 'page-journal', path: '/journal', blocks: { 1440: ['body-journal'] } },
    { id: 'page-post', path: POST, blocks: { 1440: ['body-post'] } },
    { id: 'page-category', path: '/journal/2-kitchen-notes', blocks: { 1440: ['body-category'] } },
    { id: 'page-tag', path: '/component/tags/tag/supper', blocks: { 1440: ['body-tag'] } },
    {
      id: 'page-old-post',
      path: '/journal/2-kitchen-notes/5-older-note',
      blocks: { 1440: ['body-old-post'] }
    }
  ]
}
const PLAN = {
  pages: [
    { id: 'page-journal', decision: 'keep', slug: 'journal' },
    { id: 'page-post', decision: 'keep', slug: 'Spring Tasting Night' },
    { id: 'page-category', decision: 'drop' },
    { id: 'page-tag', decision: 'drop' },
    { id: 'page-old-post', decision: 'drop' }
  ]
}
const RECORDS = () => [
  item(10, 'journal', 'journal', 1),
  { kind: 'article', id: 4, alias: 'old-harvest-supper', title: 'Old harvest supper', catid: 2, state: 1 },
  { kind: 'article', id: 5, alias: 'older-note', title: 'Older note', catid: 2, state: 1 },
  { kind: 'tag', id: 3, title: 'Supper', published: 1 }
]
const rows = () => RECORDS().filter((r) => r.kind === 'menuItem')

test('a post one category below the blog item is ordered on its article, keeping the id the router prints', () => {
  const order = routeOrders({ plan: PLAN, kit: KIT, rows: rows() }).find((o) => o.pageId === 'page-post')
  assert.deepEqual(
    [order.via, order.articleId, order.parentItemId, order.between, order.idPrefix, order.to, order.reason],
    [
      'article',
      4,
      10,
      ['2-kitchen-notes'],
      '4-',
      '/journal/2-kitchen-notes/4-spring-tasting-night',
      undefined
    ]
  )
  assert.equal(demoArticleAlias(order), 'old-harvest-supper')
})

test('the stage renames the post through its article, and a rerun gives it back its demo alias, not its address part', async () => {
  const site = fakeSite({ records: RECORDS() })
  const kept = [
    { id: 'page-journal', path: '/journal' },
    { id: 'page-post', path: POST }
  ]
  const out = await runRouteStage({ door: site.door, siteKey: SITE, kit: KIT, plan: PLAN, keptPages: kept })
  const post = out.routes.find((r) => r.pageId === 'page-post')
  assert.deepEqual([post.outcome, post.to], ['written', '/journal/2-kitchen-notes/4-spring-tasting-night'])
  assert.equal(site.records.get('article-4').alias, 'spring-tasting-night')
  assert.equal(
    out.keptPages.find((p) => p.id === 'page-post').path,
    '/journal/2-kitchen-notes/4-spring-tasting-night'
  )
  const done = await restoreRoutes({ door: site.door, siteKey: SITE, routes: [post] })
  assert.equal(done.stop, undefined)
  assert.equal(site.records.get('article-4').alias, 'old-harvest-supper')
})

test('a dropped category view is skipped though a kept post lives under it; a dropped tag page takes its tag off', async () => {
  const site = fakeSite({ records: RECORDS() })
  const results = new Map()
  const pages = ['page-category', 'page-tag'].map((id) => ({
    page: KIT.pages.find((p) => p.id === id),
    depends: id === 'page-category' ? `the kept page page-post (${POST})` : null
  }))
  const wrote = await dropPages({ door: site.door, siteKey: SITE, pages, results, kit: KIT, plan: PLAN })
  assert.equal(wrote, true)
  assert.deepEqual(
    [results.get('page-category').status, results.get('page-category').reason],
    ['skipped', 'no published menu item opens this dropped page']
  )
  const tag = results.get('page-tag')
  assert.equal(tag.status, 'hidden')
  assert.deepEqual([tag.ordered, tag.readFrom.params], ['0', { kind: 'tag', id: 3 }])
  assert.equal(site.records.get('tag-3').published, 0)
  assert.equal(tagListingOf(KIT.pages[1], KIT), null, 'a post is no tag page')
})

test("a listing's pagination and a dropped post's title in a kept listing leave with the items the plan drops", () => {
  const order = hideOrders({
    kit: KIT,
    plan: PLAN,
    owners: new Map(['body-journal.link-9', 'article-5.3'].map((slot) => [slot, { slot, kind: 'hide' }])),
    extras: {},
    reading: {
      slots: [{ key: 'article-5.3', entity: 'article-5', column: 'title', type: 'text', current: 'x' }]
    },
    changes: {},
    cannotHide: null,
    rowsRemove: false
  })
  assert.equal(order.orders.get('body-journal.link-9').via, 'pagination')
  assert.deepEqual(order.orders.get('article-5.3'), { via: 'with-article', key: 'article-5.3', article: 5 })
  assert.deepEqual(
    order.noWayOut.filter((n) => ['body-journal.link-9', 'article-5.3'].includes(n.slot)),
    []
  )
  const lines = hideLines({
    order,
    words: { refusedAll: null, refused: new Map() },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused: new Map(),
    settled: new Map()
  })
  const line = (slot) => lines.hides.get(slot)
  assert.equal(line('body-journal.link-9').status, 'skipped')
  assert.deepEqual(
    [line('article-5.3').status, line('article-5.3').printed, line('article-5.3').readFrom.params],
    ['hidden', false, { kind: 'article', id: 5 }]
  )
})
