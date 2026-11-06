// Template kit: item lists of a block (the content map's itemLists) as lists[] rows, their demo-owned slots, the
// open question when two card fields print the same text, and each item page placed under its category's page.
// Made-up data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { noMinReason } from '../template-kit/lib/min-evidence.mjs'
import { matchRepeat } from '../template-kit/lib/rows.mjs'

import { itemListsOf, joinMeasuredTwins } from '../template-kit/lib/kit-item-lists.mjs'
import { groupPages } from '../template-kit/lib/kit.mjs'
import { minPlan } from '../template-kit/lib/pipeline.mjs'

const slot = (key, sample, role) => ({ key, entity: key.replace(/\.\d+$/, ''), type: 'text', sample, role })
const MAP = {
  slots: [
    slot('article-1.4', 'Morning Run', 'offering.name'),
    slot('article-1.7', 'Morning Run', 'editorial.heading'),
    slot('article-1.8', 'Mon 7am', 'offering.schedule'),
    slot('article-2.4', 'Night Swim', 'offering.name'),
    slot('article-2.7', 'Night Swim', 'editorial.heading'),
    slot('article-2.8', 'Fri 9pm', 'offering.schedule')
  ],
  itemLists: {
    'module-5.items': {
      block: 'module-5',
      rowKind: 'items',
      source: {
        kind: 'category',
        id: 'category-3',
        title: 'Sessions',
        page: 'menuItem-8',
        route: 'sessions'
      },
      min: null,
      minFrom: 'unknown',
      max: 2,
      maxFrom: 'block-setting',
      shown: ['article-1', 'article-2'],
      demoOwned: ['article-1.4', 'article-2.4', 'article-1.8', 'article-2.8'],
      observedBy: 'block',
      rowSlots: [
        {
          field: 'title',
          kind: 'title',
          type: 'text',
          role: 'offering.name',
          demoOwned: true,
          items: [
            { item: 'article-1', slot: 'article-1.4', maxCharacters: 14, limitFrom: 'slot-fit' },
            { item: 'article-2', slot: 'article-2.4', maxCharacters: 12, limitFrom: 'slot-fit' }
          ]
        },
        {
          field: 'custom:session-title',
          kind: 'custom',
          type: 'text',
          role: 'editorial.heading',
          demoOwned: false,
          items: [
            { item: 'article-1', slot: 'article-1.7', maxCharacters: 14 },
            { item: 'article-2', slot: 'article-2.7', maxCharacters: 12 }
          ]
        },
        {
          field: 'link',
          kind: 'link',
          target: 'item-page',
          labels: ['Join'],
          demoOwned: false,
          items: [
            { item: 'article-1', path: '/index.php/sessions/morning-run' },
            { item: 'article-2', path: '/index.php/sessions/night-swim' }
          ]
        }
      ]
    }
  },
  itemPages: {
    'article-1': {
      path: '/index.php/sessions/morning-run',
      category: 'category-3',
      categoryRoute: 'sessions'
    }
  }
}

test('a block item list becomes a lists[] row: bounds, card fields with limits, demo-owned slots', () => {
  const errors = []
  const { lists, demoOwned } = itemListsOf({ map: MAP, blockId: 'block-5', entities: ['module-5'], errors })
  const l = lists[0]
  assert.deepEqual(
    [l.id, l.rowKind, l.min, l.max, l.source.id],
    ['block-5.items', 'items', null, 2, 'category-3']
  )
  assert.deepEqual(l.shown, ['article-1', 'article-2'])
  const title = l.rowSlots.find((r) => r.field === 'title')
  assert.equal(title.maxCharacters, 12, 'the tightest limit of the items')
  assert.deepEqual(title.slots[1], { item: 'article-2', id: 'article-2.4', maxCharacters: 12 })
  assert.deepEqual(
    l.rowSlots.find((r) => r.field === 'link').slots.map((s) => s.path),
    ['/index.php/sessions/morning-run', '/index.php/sessions/night-swim']
  )
  assert.deepEqual(
    demoOwned.map((d) => d.id),
    ['article-1.4', 'article-2.4', 'article-1.8', 'article-2.8']
  )
  assert.equal(demoOwned[2].sample, 'Mon 7am')
  assert.ok(
    errors.some((e) => e.field === 'blocks[block-5].lists[block-5.items].min'),
    'an unknown min is named'
  )
  const q = errors.find((e) => e.kind === 'open-question')
  assert.match(q.reason, /title and custom:session-title/)
  assert.equal(l.rowSlots.length, 3, 'both fields are kept')
  const other = itemListsOf({ map: MAP, blockId: 'block-6', entities: ['module-6'], errors: [] })
  assert.equal(other.lists.length, 0)
})

test('a measured minimum wins over an unknown one, and the plan measures block item lists', () => {
  const errors = []
  const minEvidence = { 'block-5.items': { okCounts: [1, 2], max: 2, images: {} } }
  const { lists } = itemListsOf({ map: MAP, blockId: 'block-5', entities: ['module-5'], minEvidence, errors })
  assert.equal(lists[0].min, 1)
  assert.ok(!errors.some((e) => e.field.endsWith('.min')))
  const kit = {
    widths: [1440],
    blocks: [{ id: 'block-5', lists: [{ id: 'block-5.items', rowKind: 'items', max: 2, shown: ['a', 'b'] }] }]
  }
  const repeats = [{ path: [0, 1], shape: 'DIV.card', count: 2, firstLine: 2 }]
  const capture = {
    pages: [{ slug: 'home', path: '/' }],
    blocks: { 'block-5': { source: 'module-5', widths: { 1440: { pages: ['home'], details: { repeats } } } } }
  }
  assert.deepEqual(
    minPlan(kit, capture).map((j) => [j.listId, j.max, j.repeat.shape]),
    [['block-5.items', 2, 'DIV.card']]
  )
})

test("an item's detail page joins its category page's group", () => {
  const page = (id, path, kind = 'page') => ({ id, path, kind, from: [] })
  const pages = [
    page('page-home', '/'),
    page('page-sessions', '/sessions', 'category blog'),
    page('page-sessions_morning-run', '/sessions/morning-run', 'article'),
    page('page-about', '/about')
  ]
  const groups = groupPages(pages, new Map([['/sessions/morning-run', '/sessions']]))
  const g = groups.find((x) => x.root === 'page-sessions')
  assert.deepEqual(g.children, ['page-sessions_morning-run'])
})

test("a person's card-field decision closes the open question and keeps both fields", () => {
  const errors = []
  const cardFields = {
    'custom:session-title': { printed: false, reason: 'the card prints the article title', by: 'owner' }
  }
  const { lists } = itemListsOf({ map: MAP, blockId: 'block-5', entities: ['module-5'], cardFields, errors })
  assert.ok(!errors.some((e) => e.kind === 'open-question'))
  const custom = lists[0].rowSlots.find((r) => r.field === 'custom:session-title')
  assert.deepEqual([custom.printed, custom.decidedBy], [false, 'owner: the card prints the article title'])
  assert.equal(lists[0].rowSlots.find((r) => r.field === 'title').printed, undefined)
})

test('rows in a closed tab count but lose to shown rows, and a list with no minimum says why', () => {
  const hidden = { path: [0, 1], count: 4, shownCount: 0 }
  const shown = { path: [0, 2], count: 4, shownCount: 4 }
  assert.equal(matchRepeat([hidden, shown], 4), shown)
  assert.equal(matchRepeat([hidden], 4), hidden)
  assert.match(noMinReason(undefined, 3), /could be measured/)
  assert.match(
    noMinReason({ checks: { 1: {} }, max: 2, sparseRow: 'left-packed', minIfCentered: 1 }, 2),
    /every count from 1 to 2 leaves a hole.*min 1 once centered/
  )
  assert.match(noMinReason({ checks: { 1: {} }, max: 2 }, 2), /none lays out without a hole/)
})

test('a list measured under the map list id joins the map list and leaves, keeping its measured minimum', () => {
  const measured = { id: 'tag-4.items', rowKind: 'items', min: 2, minFrom: 'measured', max: 3, rowSlots: [] }
  const other = { id: 'module-9.items', rowKind: 'items', min: 1, rowSlots: [] }
  const blockLists = [measured, other]
  const fromMap = {
    id: 'tag-4.items',
    rowKind: 'items',
    min: null,
    minFrom: 'unknown',
    max: 3,
    rowSlots: [{ field: 'title' }]
  }
  joinMeasuredTwins(blockLists, [fromMap])
  assert.deepEqual(blockLists, [other])
  assert.equal(fromMap.min, 2)
  assert.equal(fromMap.minFrom, 'measured')
  assert.deepEqual(fromMap.rowSlots, [{ field: 'title' }])
})
