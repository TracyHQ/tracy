// Navigation blocks and merged pages in the AI quickstart draft (#583): a menu block takes every item of the menu it
// draws, at every level, with its count from the content map; a merged page keeps its sparse entries in the report.
// Invented template and data only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftBlocks } from '../ai-quickstart/lib/draft-blocks.mjs'

const label = (n, text) => ({
  key: `menuItem-${n}.0`,
  entity: `menuItem-${n}`,
  type: 'text',
  role: 'editorial.menu_label',
  column: 'title',
  sample: text
})

test('a navigation block takes every item of the menu it draws, the levels its count comes from', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    slots: [label(1, 'Home'), label(2, 'About'), label(3, 'Our team')],
    menuBlocks: {
      'module-5': {
        menu: 'invented-menu',
        items: [
          { item: 'menuItem-1', level: 1, label: { slot: 'menuItem-1.0' } },
          { item: 'menuItem-2', level: 1, label: { slot: 'menuItem-2.0' } },
          { item: 'menuItem-3', level: 2, label: { slot: 'menuItem-3.0' } }
        ]
      }
    }
  }
  // The kit read only the top level: the submenu label sits behind a toggle.
  const kit = {
    blocks: [
      {
        id: 'block-5',
        role: 'section',
        source: { entity: 'module-5' },
        slots: [{ id: 'menuItem-1.0' }, { id: 'menuItem-2.0' }],
        lists: [],
        frames: []
      }
    ]
  }
  const res = draftBlocks({
    kit,
    contentMap,
    decisions: { blocks: { 'block-5': { type: 'header', nav: true } } },
    measured: {
      'menuItem-1.0': { limit: 30, limitFrom: 'invented reading at 390px' },
      'menuItem-2.0': { limit: 24, limitFrom: 'invented reading at 390px' }
    }
  })
  const [block] = res.blocks
  const field = block.itemFields.find((f) => f.name === 'label')
  assert.deepEqual(field.slots, ['menuItem-1.0', 'menuItem-2.0', 'menuItem-3.0'])
  assert.equal(field.limit, 24)
  assert.match(field.limitFrom, /narrowest measured menu label \(2 of 3 measured\)/)
  assert.deepEqual(block.items, { min: 1, max: 3 })
  assert.match(
    block.itemsFrom.max,
    /invented-menu\) holds 3 items in the demo \(2 at level 1, 1 at level 2\)/
  )
  // The label not yet measured is offered for measuring.
  assert.deepEqual(
    res.unmeasured.map((u) => u.slot),
    ['menuItem-3.0']
  )
})

test('a merged page of one layout keeps its sparse entries in the report, naming the page', () => {
  const item = (id, slots) => ({ field: 'x', role: 'editorial.paragraph', type: 'text', slots })
  const body = (id, entity, items) => ({
    id,
    role: 'page-body',
    source: { entity },
    slots: [],
    frames: [],
    lists: [
      {
        id: `${entity}.items`,
        rowKind: 'items',
        min: 1,
        max: 2,
        minSource: 'measured',
        maxFrom: 'demo-count',
        shown: items,
        rowSlots: [
          {
            ...item(
              'title',
              items.map((e) => ({ id: `${e}.0` }))
            ),
            role: 'editorial.heading'
          },
          item('note', [{ id: `${items[0]}.1` }])
        ]
      }
    ]
  })
  const slot = (key, role) => ({ key, entity: key.split('.')[0], type: 'text', role, column: 'attribs' })
  const contentMap = {
    slots: [
      slot('article-11.0', 'editorial.heading'),
      slot('article-12.0', 'editorial.heading'),
      slot('article-11.1', 'editorial.paragraph'),
      slot('article-21.0', 'editorial.heading'),
      slot('article-22.0', 'editorial.heading'),
      slot('article-21.1', 'editorial.paragraph')
    ]
  }
  const why = 'invented: a note only the first item stores'
  const res = draftBlocks({
    kit: {
      blocks: [
        body('body-one', 'article-1', ['article-11', 'article-12']),
        body('body-two', 'article-2', ['article-21', 'article-22'])
      ]
    },
    contentMap,
    decisions: {
      groups: [
        {
          match: '^body-',
          id: 'listing',
          type: 'posts',
          sparse: { 'article-11.1': why, 'article-21.1': why }
        }
      ]
    }
  })
  assert.deepEqual(
    res.sparse.map((s) => [s.block, s.slots, s.on ?? null]),
    [
      ['listing', ['article-11.1'], null],
      ['listing', ['article-21.1'], 'body-two']
    ]
  )
})
