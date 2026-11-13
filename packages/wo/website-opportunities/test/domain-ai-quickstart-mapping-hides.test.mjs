// The hide declarations of an AI quickstart mapping file (ticket #584): every button and every list whose rows can be
// fewer, on a record the blank site keeps, says how an empty one leaves the page. On an invented gym's block store.
import assert from 'node:assert/strict'
import test from 'node:test'
import { hideProblems, hidesNeeded } from '../domain/ai-quickstart-mapping-hides.mjs'

const acm = (key, path) => ({
  slot: key,
  entity: 'module-31',
  column: 'params',
  jsonPath: ['coaches', 'coaches[data]', ...path],
  nestedJson: 'jatools-config'
})
const piece = (key, n) => ({
  ...acm(key, ['coaches[data][links]', 0]),
  xpath: `/html/body/div/a[${n}]/@href`,
  piece: true
})

const store = () => ({
  blocks: [
    {
      id: 'block-31',
      items: { min: 1, max: 2 },
      fields: [
        { name: 'button-label', kind: 'editorial.button_label', type: 'text' },
        { name: 'button-link', kind: 'editorial.navigation_url', type: 'link' }
      ],
      itemFields: [{ name: 'name', kind: 'person.name', type: 'text' }],
      itemLists: [
        {
          name: 'social',
          items: { min: 0, max: 2 },
          fields: [{ name: 'link', kind: 'person.social_url', type: 'link' }]
        }
      ]
    },
    {
      id: 'block-32',
      items: { min: 1, max: 3 },
      itemFields: [{ name: 'title', kind: 'editorial.heading', type: 'text' }]
    }
  ]
})

const mapping = () => ({
  entities: { 'module-31': { kind: 'module' }, 'article-5': { kind: 'article', created: true } },
  blocks: {
    'block-31': {
      fields: {
        'button-label': {
          slot: 'module-31.8',
          entity: 'module-31',
          column: 'params',
          jsonPath: ['title-btn']
        },
        'button-link': { slot: 'module-31.9', entity: 'module-31', column: 'params', jsonPath: ['link-btn'] }
      },
      itemFields: {
        name: [
          acm('module-31.0', ['coaches[data][title]', 0]),
          acm('module-31.1', ['coaches[data][title]', 1])
        ]
      },
      itemLists: { social: { fields: { link: [[piece('module-31.4', 1), piece('module-31.4', 2)]] } } }
    },
    'block-32': {
      itemFields: { title: [{ slot: 'article-5.1', entity: 'article-5', column: 'title' }] }
    }
  },
  hides: {
    'block-31': [
      {
        control: ['button-label', 'button-link'],
        by: 'setting',
        location: { entity: 'module-31', column: 'params', jsonPath: ['section-link'] },
        value: '0',
        why: 'the section chrome prints the button while section-link is on'
      },
      {
        rows: 'items',
        by: 'row',
        row: {
          entity: 'module-31',
          column: 'params',
          nestedJson: 'jatools-config',
          parent: ['coaches', 'coaches[data]'],
          arrays: ['coaches[data][title]', 'coaches[data][links]']
        },
        why: 'one card per row of the lists'
      },
      { rows: 'social', by: 'omit', why: 'links are elements of one stored value' }
    ]
  }
})

const run = (m, s = store()) => {
  const out = []
  hideProblems(m, s, (at, message) => out.push(`${at}: ${message}`))
  return out
}

test('a button and the rows that can be fewer on a kept record need a hide entry; a created record needs none (#584)', () => {
  assert.deepEqual(run(mapping()), [])
  const needed = hidesNeeded(store().blocks[1], mapping().blocks['block-32'], new Set(['article-5']))
  assert.deepEqual(needed, { controls: [], rows: [] })
  const bare = mapping()
  delete bare.hides
  assert.deepEqual(run(bare), [
    'hides[block-31]: fields.button-label is part of a button: say how an empty button leaves the page (a "control" entry)',
    'hides[block-31]: fields.button-link is part of a button: say how an empty button leaves the page (a "control" entry)',
    'hides[block-31]: its items can hold fewer rows than the template: say how an unfilled row leaves the page (a "rows" entry)',
    'hides[block-31]: list social can hold fewer rows than the template: say how an unfilled row leaves the page (a "rows" entry)'
  ])
})

test('each way is checked against the places it hides (#584)', () => {
  const m = mapping()
  m.hides['block-31'][0] = {
    control: ['button-label', 'button-link'],
    by: 'rows.remove',
    slots: ['module-31.8'],
    why: 'x'
  }
  m.hides['block-31'][1].row.arrays = ['coaches[data][links]']
  m.hides['block-31'][2].by = 'nothing'
  assert.deepEqual(run(m), [
    'hides[block-31][0]: module-31.8: rows.remove takes an element of an HTML value, and this place has no xpath',
    'hides[block-31][0]: module-31.9: rows.remove takes an element of an HTML value, and this place has no xpath',
    "hides[block-31][1].row: module-31.0: this place lies in none of the row's lists",
    "hides[block-31][1].row: module-31.1: this place lies in none of the row's lists",
    'hides[block-31][2].by: by must be one of empty, rows.remove, setting, omit, row'
  ])
  const n = mapping()
  n.hides['block-31'][0] = { control: ['button-label'], rows: 'items', by: 'empty' }
  n.hides['block-31'][2] = { rows: 'social', by: 'setting', location: { entity: 'module-31' }, why: 'x' }
  n.hides['block-99'] = []
  assert.deepEqual(run(n), [
    'hides[block-99]: "block-99" is not a block of the store',
    'hides[block-31][0]: a hide entry names either a control (its fields) or rows ("items" or a list name)',
    'hides[block-31][2].location: a location needs an entity and a column',
    'hides[block-31][2].value: the value written at the setting, a string',
    'hides[block-31]: fields.button-label is part of a button: say how an empty button leaves the page (a "control" entry)',
    'hides[block-31]: fields.button-link is part of a button: say how an empty button leaves the page (a "control" entry)'
  ])
})

test('omit takes only pieces of one value, and an entry says why (#584)', () => {
  const m = mapping()
  m.blocks['block-31'].itemLists.social.fields.link = [[acm('module-31.6', ['coaches[data][links]', 0])]]
  delete m.hides['block-31'][2].why
  assert.deepEqual(run(m), [
    'hides[block-31][2].why: say why this way takes the place off the page (measured how)',
    'hides[block-31][2]: module-31.6: omit leaves a row out of one stored value; this place is no piece of one'
  ])
})
