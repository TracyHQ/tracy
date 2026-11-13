// What the reviewed decisions add to drafted fields (#583): rows keyed to a page, a list read inside one stored HTML
// value, light and dark pairs and the text an icon illustrates, and template strings that are content. Invented
// template and data only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftBlocks } from '../ai-quickstart/lib/draft-blocks.mjs'
import { filledPath } from '../ai-quickstart/lib/draft-child-lists.mjs'

const KIT_390 = (n) => `kit frame (390px ${n}, 1440px ${n + 9})`
const slot = (key, extra) => ({
  key,
  entity: key.replace(/\.\d+$/, ''),
  type: 'text',
  column: 'params',
  ...extra
})
const contentMap = {
  slots: [
    // An invented masthead: two title rows, each keyed to a page by a stored menu item id.
    slot('module-30.0', { role: 'editorial.heading', jsonPath: ['rows', 'title', 0] }),
    slot('module-30.1', { role: 'editorial.heading', jsonPath: ['rows', 'title', 1] }),
    // An invented team: two people, each with an HTML value of social links.
    slot('module-31.0', { role: 'person.name', jsonPath: ['team', 'name', 0] }),
    slot('module-31.1', { role: 'person.name', jsonPath: ['team', 'name', 1] }),
    slot('module-31.2', {
      role: 'editorial.paragraph',
      jsonPath: ['team', 'info', 0],
      sample:
        '((div))((a href="#"))((i class="fab fa-one"))((/i))((/a))((a href="#"))((i class="fab fa-two"))((/i))((/a))((/div))'
    }),
    slot('module-31.3', {
      role: 'editorial.paragraph',
      jsonPath: ['team', 'info', 1],
      sample: '((div))((a href="#"))((i class="fab fa-one"))((/i))((/a))((/div))'
    }),
    // An invented features block: a light and a dark icon file per item, and a template string it draws.
    slot('module-32.0', { role: 'editorial.heading', jsonPath: ['f', 'title', 0] }),
    slot('module-32.1', { role: 'editorial.item_icon', type: 'image', jsonPath: ['f', 'icon', 0] }),
    slot('module-32.2', { role: 'editorial.item_icon', type: 'image', jsonPath: ['f', 'icon-light', 0] }),
    slot('languageString-5.0', {
      entity: 'languageString-5',
      role: 'editorial.button_label',
      column: 'value'
    }),
    slot('languageString-6.0', { entity: 'languageString-6', role: 'editorial.paragraph', column: 'value' })
  ]
}
const kitText = (id, n = 20) => ({ id, maxCharacters: n, maxCharactersFrom: KIT_390(n) })
const kit = {
  blocks: [
    {
      id: 'block-30',
      role: 'masthead',
      source: { entity: 'module-30' },
      slots: [],
      frames: [],
      lists: []
    },
    {
      id: 'block-31',
      role: 'section',
      source: { entity: 'module-31' },
      slots: [],
      frames: [],
      lists: [
        {
          id: 'block-31.person',
          rowKind: 'slots',
          min: 1,
          max: 2,
          minSource: 'measured',
          maxFrom: 'demo-count',
          rowSlots: [
            { id: 'block-31.0', role: 'person.name' },
            { id: 'block-31.2', role: 'editorial.paragraph' }
          ],
          rows: [
            { slots: [kitText('block-31.0'), kitText('block-31.2')] },
            { slots: [kitText('block-31.1'), kitText('block-31.3')] }
          ]
        }
      ]
    },
    {
      id: 'block-32',
      role: 'section',
      source: { entity: 'module-32' },
      slots: [
        { ...kitText('block-32.0'), role: 'editorial.heading', type: 'text' },
        { id: 'languageString-5.0', role: 'editorial.button_label' },
        { id: 'languageString-6.0', role: 'editorial.paragraph' }
      ],
      frames: [
        { id: 'block-32.1', role: 'editorial.item_icon', width: 48, height: 48 },
        { id: 'block-32.2', role: 'editorial.item_icon', width: 48, height: 48 }
      ],
      lists: []
    }
  ]
}
const decisions = {
  unlisted: { 'languageString-6.0': { as: 'kept', why: 'invented: interface text valid on every site' } },
  blocks: {
    'block-30': {
      type: 'hero',
      lists: [
        {
          name: 'pages',
          column: 'params',
          items: { min: 0 },
          itemsFrom: { min: 'invented' },
          key: { name: 'page', jsonPath: ['rows', 'page', '{1}', 0] },
          fields: [{ name: 'title', jsonPath: ['rows', 'title', '{1}'] }]
        }
      ],
      keys: [{ name: 'stat-page', column: 'params', jsonPath: ['rows', 'page', 2, 0], pageType: 'classes' }]
    },
    'block-31': {
      type: 'team',
      itemLists: [
        {
          name: 'social',
          column: 'params',
          html: { jsonPath: ['team', 'info', '{0}'], row: 'a' },
          items: { min: 0 },
          itemsFrom: { min: 'invented' },
          fields: [
            { name: 'link', kind: 'person.social_url', type: 'link', xpath: '/html/body/div/a[{1}]/@href' },
            {
              name: 'network-icon',
              kind: 'editorial.item_icon',
              type: 'icon',
              storage: 'class-name',
              iconOf: 'network',
              frame: { width: 18, height: 18 },
              xpath: '/html/body/div/a[{1}]/i/@class'
            }
          ]
        }
      ]
    },
    'block-32': {
      type: 'services',
      fields: [
        { slot: 'languageString-5.0', name: 'button-label', kind: 'editorial.button_label', type: 'text' }
      ],
      fieldKeys: {
        'item-icon': { theme: 'dark', for: ['heading'] },
        'item-icon-2': { theme: 'light', variantOf: 'item-icon', for: ['heading'] }
      }
    }
  }
}
const draft = () =>
  draftBlocks({
    kit,
    contentMap,
    decisions,
    measured: { 'languageString-5.0': { limit: 14, limitFrom: 'invented measurement at 390px' } }
  })
const blockOf = (res, id) => res.blocks.find((b) => b.id === id)

test('a pattern element that is one placeholder becomes the row number', () => {
  assert.deepEqual(filledPath(['rows', 'page', '{1}', 0, 'x{1}'], { 1: '3' }), ['rows', 'page', 3, 0, 'x3'])
})

test('rows keyed to a page get a link field derived as the page of the row, with its key place per row', () => {
  const [list] = blockOf(draft(), 'block-30').lists
  const page = list.fields.find((f) => f.name === 'page')
  assert.deepEqual(page, {
    name: 'page',
    kind: 'editorial.navigation_url',
    type: 'link',
    derived: 'the page of the row',
    keyAt: [
      [
        { entity: 'module-30', column: 'params', jsonPath: ['rows', 'page', 0, 0] },
        { entity: 'module-30', column: 'params', jsonPath: ['rows', 'page', 1, 0] }
      ]
    ]
  })
})

test('a block field keyed to a page type names its key place and the page type', () => {
  const stat = blockOf(draft(), 'block-30').fields.find((f) => f.name === 'stat-page')
  assert.deepEqual(stat.keyAt, { entity: 'module-30', column: 'params', jsonPath: ['rows', 'page', 2, 0] })
  assert.equal(stat.pageType, 'classes')
  assert.equal(stat.derived, 'the page of the row')
})

test('a list read inside a stored HTML value: one row per link, each place a piece of that value', () => {
  const res = draft()
  const block = blockOf(res, 'block-31')
  const [social] = block.itemLists
  assert.deepEqual(social.items, { min: 0, max: 2 })
  assert.deepEqual(social.fields.find((f) => f.name === 'link').slots, [
    ['module-31.2@/html/body/div/a[1]/@href', 'module-31.2@/html/body/div/a[2]/@href'],
    ['module-31.3@/html/body/div/a[1]/@href']
  ])
  const icon = social.fields.find((f) => f.name === 'network-icon')
  assert.deepEqual(
    [icon.storage, icon.iconOf, icon.frame],
    ['class-name', 'network', { width: 18, height: 18 }]
  )
  // The HTML value is the list's, so no item field holds it.
  assert.deepEqual(
    block.itemFields.map((f) => f.name),
    ['name']
  )
  assert.deepEqual(res.problems, [])
})

test('decided field keys pair a light and a dark icon file and name the text they illustrate', () => {
  const block = blockOf(draft(), 'block-32')
  const icons = block.fields.filter((f) => f.type === 'icon')
  assert.deepEqual(
    icons.map((f) => [f.name, f.theme, f.variantOf, f.for]),
    [
      ['item-icon', 'dark', undefined, ['heading']],
      ['item-icon-2', 'light', 'item-icon', ['heading']]
    ]
  )
})

test('a template string the decisions declare is a field; an interface string is listed with its class', () => {
  const res = draft()
  const label = blockOf(res, 'block-32').fields.find((f) => f.name === 'button-label')
  assert.deepEqual([label.slot, label.limit], ['languageString-5.0', 14])
  assert.ok(!res.derived.some((d) => d.slot === 'languageString-5.0'))
  assert.deepEqual(
    res.unlisted.find((u) => u.slot === 'languageString-6.0'),
    {
      block: 'block-32',
      slot: 'languageString-6.0',
      at: 'value',
      as: 'kept',
      why: 'invented: interface text valid on every site'
    }
  )
})
