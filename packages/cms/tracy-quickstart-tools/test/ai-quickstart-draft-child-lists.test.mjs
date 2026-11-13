// Child lists in the AI quickstart draft (#583, decision of 13/11): the reviewed decisions name a list and the stored
// place pattern of its fields; the draft reads, per parent place, the rows that place stores, and takes those places
// out of every other field and report list. Invented template and data only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftBlocks } from '../ai-quickstart/lib/draft-blocks.mjs'

const row = (entity, n, field, sample, extra = {}) => ({
  key: `${entity}.${n}`,
  entity,
  type: 'text',
  role: 'offering.schedule',
  column: 'attribs',
  jsonPath: ['sessions', `sessions${field[0]}`, field[1]],
  sample,
  ...extra
})
const title = (entity, n) => ({
  key: `${entity}.${n}`,
  entity,
  type: 'text',
  role: 'offering.name',
  column: 'title'
})
// Three invented class records storing 2, 1 and 0 session rows.
const contentMap = {
  roleVocabularyVersion: 'place-content-roles/3',
  slots: [
    title('article-1', 0),
    row('article-1', 1, [0, 'day'], 'Mon'),
    row('article-1', 2, [0, 'time'], '6 am'),
    row('article-1', 3, [1, 'day'], 'Tue'),
    row('article-1', 4, [1, 'time'], '7 am'),
    title('article-2', 0),
    row('article-2', 1, [0, 'day'], 'Wed'),
    row('article-2', 2, [0, 'time'], '8 am'),
    title('article-3', 0)
  ]
}
const kitSlot = (id, limit) => ({
  id,
  maxCharacters: limit,
  maxCharactersFrom: `kit frame (390px ${limit}, 1440px ${limit + 10})`
})
const kit = {
  blocks: [
    {
      id: 'block-1',
      role: 'section',
      source: { entity: 'module-1' },
      slots: [],
      frames: [],
      lists: [
        {
          id: 'block-1.items',
          rowKind: 'items',
          min: 1,
          max: 3,
          minSource: 'measured',
          maxFrom: 'block-setting',
          shown: ['article-1', 'article-2', 'article-3'],
          rowSlots: [
            {
              field: 'title',
              role: 'offering.name',
              type: 'text',
              slots: ['article-1.0', 'article-2.0', 'article-3.0'].map((id) => kitSlot(id, 30))
            },
            {
              field: 'custom:sessions/sessions0/day',
              role: 'offering.schedule',
              type: 'text',
              slots: [kitSlot('article-1.1', 20), kitSlot('article-2.1', 18)]
            }
          ]
        }
      ]
    }
  ]
}
const calendar = {
  name: 'sessions',
  label: 'Baking sessions',
  column: 'attribs',
  items: { min: 0 },
  itemsFrom: { min: 'invented: a card lays out with no session row' },
  fields: [
    { name: 'day', jsonPath: ['sessions', 'sessions{1}', 'day'] },
    { name: 'time', jsonPath: ['sessions', 'sessions{1}', 'time'] }
  ]
}
const draft = (block) =>
  draftBlocks({
    kit,
    contentMap,
    decisions: { blocks: { 'block-1': { type: 'services', ...block } } },
    measured: { 'article-1.2': { limit: 9, limitFrom: 'invented measurement at 390px' } }
  })

test('a child list of each item lists, per item place, the rows that place stores', () => {
  const res = draft({ itemsLabel: 'Bakes', itemLists: [calendar] })
  const [block] = res.blocks
  assert.equal(block.itemsLabel, 'Bakes')
  const [list] = block.itemLists
  assert.equal(list.label, 'Baking sessions')
  assert.deepEqual(list.items, { min: 0, max: 2 })
  assert.match(list.itemsFrom.max, /most rows a stored parent place holds \(2; per place 2, 1, 0\)/)
  assert.deepEqual(
    list.fields.map((f) => [f.name, f.type, f.limit, f.slots]),
    [
      ['day', 'text', 18, [['article-1.1', 'article-1.3'], ['article-2.1'], []]],
      ['time', 'text', 9, [['article-1.2', 'article-1.4'], ['article-2.2'], []]]
    ]
  )
  // The places of the list are no item field and no sparse entry any more.
  assert.deepEqual(
    block.itemFields.map((f) => f.name),
    ['name']
  )
  assert.deepEqual(res.sparse, [])
  assert.deepEqual(res.problems, [])
  // A child field takes the least limit any of its rows has, measured or from the kit frame at 390 px.
  assert.deepEqual(
    res.unmeasured.filter((u) => ['day', 'time'].includes(u.field)),
    []
  )
})

test('a child list without a stated minimum is reported, never guessed', () => {
  const res = draft({ itemLists: [{ ...calendar, items: {}, itemsFrom: {} }] })
  assert.match(res.problems[0].problem, /child list sessions: state its minimum/)
})

test('a child list without a label is reported', () => {
  const { label: _label, ...unlabelled } = calendar
  const res = draft({ itemLists: [unlabelled] })
  assert.deepEqual(
    res.problems.map((p) => p.problem),
    ['child list sessions: name what a person calls its rows (label)']
  )
})

test('a row that stores only some fields of the list is reported', () => {
  const res = draft({
    itemLists: [
      {
        ...calendar,
        fields: [...calendar.fields, { name: 'room', jsonPath: ['sessions', 'sessions{1}', 'room'] }]
      }
    ]
  })
  assert.match(res.problems.map((p) => p.problem).join('\n'), /no parent place stores a room/)
})

test('a nested child list reads its rows inside each row of its parent list', () => {
  const nestedMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    slots: [
      {
        key: 'article-9.0',
        entity: 'article-9',
        type: 'text',
        role: 'editorial.heading',
        column: 'attribs',
        jsonPath: ['steps', 'steps0', 'title']
      },
      {
        key: 'article-9.1',
        entity: 'article-9',
        type: 'text',
        role: 'editorial.paragraph',
        column: 'attribs',
        jsonPath: ['steps', 'steps0', 'desc'],
        xpath: '/html/body/ul/li[1]/text()'
      },
      {
        key: 'article-9.2',
        entity: 'article-9',
        type: 'text',
        role: 'editorial.paragraph',
        column: 'attribs',
        jsonPath: ['steps', 'steps0', 'desc'],
        xpath: '/html/body/ul/li[2]/text()'
      },
      {
        key: 'article-9.3',
        entity: 'article-9',
        type: 'text',
        role: 'editorial.heading',
        column: 'attribs',
        jsonPath: ['steps', 'steps1', 'title']
      },
      {
        key: 'article-9.4',
        entity: 'article-9',
        type: 'text',
        role: 'editorial.paragraph',
        column: 'attribs',
        jsonPath: ['steps', 'steps1', 'desc'],
        xpath: '/html/body/ul/li[1]/text()'
      }
    ]
  }
  const res = draftBlocks({
    kit: {
      blocks: [
        {
          id: 'body-post',
          role: 'page-body',
          source: { entity: 'article-9' },
          slots: [],
          lists: [],
          frames: []
        }
      ]
    },
    contentMap: nestedMap,
    decisions: {
      blocks: {
        'body-post': {
          type: 'text',
          lists: [
            {
              name: 'steps',
              label: 'Steps',
              column: 'attribs',
              items: { min: 1 },
              itemsFrom: { min: 'invented: one step lays out' },
              fields: [{ name: 'title', jsonPath: ['steps', 'steps{1}', 'title'] }],
              lists: [
                {
                  name: 'points',
                  label: 'Points',
                  column: 'attribs',
                  items: { min: 1 },
                  itemsFrom: { min: 'invented: one point lays out' },
                  fields: [
                    {
                      name: 'point',
                      jsonPath: ['steps', 'steps{1}', 'desc'],
                      xpath: '/html/body/ul/li[{2}]/text()'
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  })
  const [steps] = res.blocks[0].lists
  assert.deepEqual(steps.fields[0].slots, [['article-9.0', 'article-9.3']])
  assert.deepEqual(steps.lists[0].fields[0].slots, [['article-9.1', 'article-9.2'], ['article-9.4']])
  assert.deepEqual(steps.lists[0].items, { min: 1, max: 2 })
  assert.deepEqual(res.blocks[0].fields, [])
  assert.deepEqual(res.unlisted, [])
})
