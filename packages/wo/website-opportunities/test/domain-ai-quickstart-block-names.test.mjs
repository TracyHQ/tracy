// The original names of a kit's blocks for the plan composer (#575, `ai-quickstart-block-names.mjs`): read from the
// kit's blank site content map, never guessed. Invented template only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { blockNamesOf, withBlockNames } from '../domain/ai-quickstart-block-names.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { planComposerRequest } from '../domain/plan-composer-request.mjs'
import { brand, clubProfile, library, template } from './fixtures/plan-composer/invented-club.mjs'
import { tradeRecipes, tradeStore } from './fixtures/plan-composer/trade-blocks.mjs'

const store = () => ({
  blocks: [
    {
      id: 'b-steps',
      fields: [{ name: 'heading', slot: 'm1.0' }],
      itemFields: [{ name: 'title', slots: ['m1.1', 'm1.2'] }]
    },
    {
      id: 'b-mixed',
      fields: [
        { name: 'a', slot: 'm2.0' },
        { name: 'b', slot: 'm3.0' }
      ]
    },
    { id: 'b-untitled', fields: [{ name: 'a', slot: 'f1.0' }] },
    {
      id: 'b-blank',
      fields: [
        { name: 'a', slot: 'm4.0' },
        { name: 'b', slot: 's1.0' }
      ]
    }
  ]
})
const contentMap = {
  entities: [
    { key: 'm1', kind: 'module', identity: { title: 'How a  first visit goes ' } },
    { key: 'm2', kind: 'module', identity: { title: 'Prices' } },
    { key: 'm3', kind: 'module', identity: { title: 'Bundles' } },
    { key: 'm4', kind: 'module', identity: { title: '' } },
    { key: 's1', kind: 'module', identity: { title: 'Stay in touch' } },
    { key: 'f1', kind: 'field', identity: {} }
  ],
  slots: [
    { key: 'm1.0', entity: 'm1', sample: 'demo words never read' },
    { key: 'm1.1', entity: 'm1' },
    { key: 'm1.2', entity: 'm1' },
    { key: 'm2.0', entity: 'm2' },
    { key: 'm3.0', entity: 'm3' },
    { key: 'm4.0', entity: 'm4' },
    { key: 's1.0', entity: 's1' },
    { key: 'f1.0', entity: 'f1' }
  ]
}

test('a block is named by the one titled section its places belong to', () => {
  assert.deepEqual(
    [...blockNamesOf(store(), contentMap)],
    [
      ['b-steps', 'How a first visit goes'],
      ['b-blank', 'Stay in touch']
    ]
  )
})

test('a block of several titled sections, or of none, has no name; no content map names nothing', () => {
  const names = blockNamesOf(store(), contentMap)
  assert.equal(names.has('b-mixed'), false)
  assert.equal(names.has('b-untitled'), false)
  assert.equal(blockNamesOf(store(), null).size, 0)
  const given = store()
  assert.equal(withBlockNames(given, null), given)
  assert.equal(withBlockNames(given, contentMap).blocks[0].name, 'How a first visit goes')
  assert.equal(given.blocks[0].name, undefined)
})

test('the composer reads each block name and the data kind of every field, and no demo text', () => {
  const context = composerContextOf({
    profile: clubProfile(),
    blockStore: tradeStore(),
    pageRecipes: tradeRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  const user = JSON.parse(planComposerRequest(context).user)
  const visit = user.blocks.find((b) => b.id === 'first-visit')
  assert.equal(visit.name, 'Your first lesson')
  assert.deepEqual(
    visit.itemFields.map((f) => f.kind),
    ['editorial.heading', 'editorial.paragraph']
  )
  assert.equal(user.blocks.find((b) => b.id === 'services-grid').name, undefined)
})
