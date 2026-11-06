// Every text a block shows is a slot of the kit or fixed text: a block's own slot outside any list (a section
// title, an intro, a lone button label) is declared in `blocks[].slots`, and the self-check names any shown text
// that comes from a content map slot the kit declares nowhere ("orphan text"). Fabricated data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildBlock } from '../template-kit/lib/kit-blocks.mjs'
import { indexMap } from '../template-kit/lib/map-index.mjs'
import { orphanTextChecks } from '../template-kit/lib/orphan-text.mjs'
import { sampleIndex } from '../template-kit/lib/sample-index.mjs'

const MAP = {
  entities: [{ key: 'module-40', kind: 'module', identity: { module: 'mod_example' } }],
  slots: [
    {
      key: 'module-40.0',
      entity: 'module-40',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Quick rounds',
      group: { id: 'module-40.item.0', item: 0 }
    },
    {
      key: 'module-40.1',
      entity: 'module-40',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Slow rounds',
      group: { id: 'module-40.item.1', item: 1 }
    },
    {
      key: 'module-40.2',
      entity: 'module-40',
      type: 'text',
      role: 'editorial.heading',
      sample: 'THE TRAINING',
      maxCharacters: 30
    },
    {
      key: 'module-40.3',
      entity: 'module-40',
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Ten rounds split between two styles of training.'
    },
    {
      key: 'module-40.4',
      entity: 'module-40',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'about us',
      jsonPath: ['intro']
    },
    {
      key: 'module-40.5',
      entity: 'module-40',
      type: 'url',
      role: 'editorial.navigation_url',
      sample: 'index.php?Itemid=9',
      jsonPath: ['intro']
    },
    { key: 'module-40.6', entity: 'module-40', type: 'text', role: 'editorial.paragraph', sample: '' }
  ],
  pages: [],
  fitGroups: { 'module-40.item': { max: 2, items: 2 } }
}

const rec = {
  id: 'block-40',
  source: 'module-40',
  widths: {
    1440: {
      pages: ['home'],
      details: {
        texts: [
          'THE TRAINING',
          'Ten rounds split between two styles of training.',
          'ABOUT US',
          'Quick rounds',
          'Slow rounds',
          'Since 2031'
        ],
        links: [{ label: 'ABOUT US', href: '/about' }],
        repeats: []
      }
    }
  }
}

const build = () =>
  buildBlock({
    rec,
    entity: 'module-40',
    idx: indexMap(MAP),
    samples: sampleIndex(MAP),
    errors: [],
    minEvidence: {},
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })

test("a block's own slots outside any list that it shows are declared in its slots", () => {
  const b = build()
  assert.deepEqual(
    b.slots.map((s) => [s.id, s.role, s.type]),
    [
      ['block-40.2', 'editorial.heading', 'text'],
      ['block-40.3', 'editorial.paragraph', 'text'],
      ['block-40.4', 'editorial.button_label', 'text'],
      ['block-40.5', 'editorial.navigation_url', 'url']
    ]
  )
  assert.equal(b.slots[0].maxCharacters, 30)
  assert.equal(b.slots[0].sample, 'THE TRAINING')
  // Template words no slot holds stay fixed text; list rows stay in the list.
  assert.deepEqual(
    b.fixedText.map((t) => t.text),
    ['Since 2031']
  )
  assert.ok(!b.slots.some((s) => s.id === 'block-40.0'))
})

test('self-check: a shown text from a slot the kit declares nowhere is an orphan', () => {
  const b = build()
  assert.equal(orphanTextChecks({ blocks: [b], errors: [] }), 0)
  const dropped = { ...b, slots: b.slots.filter((s) => s.id !== 'block-40.2') }
  const errors = []
  assert.equal(orphanTextChecks({ blocks: [dropped], errors }), 1)
  assert.equal(errors[0].kind, 'orphan-text')
  assert.match(errors[0].reason, /THE TRAINING/)
})
