// Blocks that list the same records (#584), on the invented fixture: a bakery whose services grid owns three
// invented product pages and a home strip lists two of them. The strip names the grid as the owner of its records,
// with the grid field each of its fields draws, and each block declares the order it lists them in.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const ORDER = { by: 'published', direction: 'desc', from: 'invented: the category view sets newest first' }

/** The fixture with the grid's items on three invented product pages, and a strip that lists two of them. */
function withStrip() {
  const set = {
    blockStore: read('block-store.json'),
    pageRecipes: read('page-recipes.json'),
    mapping: read('mapping.json')
  }
  const grid = set.blockStore.blocks.find((b) => b.id === 'services-grid')
  const name = grid.itemFields.find((f) => f.name === 'name')
  name.slots = ['article-21.4', 'article-22.4', 'article-23.4']
  for (const f of grid.itemFields) if (f.name !== 'name') delete f.slots
  delete grid.itemLists
  grid.itemFields = grid.itemFields.filter((f) => f.name === 'name' || f.name === 'link')
  grid.itemsOrder = ORDER
  const strip = structuredClone(grid)
  strip.id = 'services-strip'
  strip.items = { min: 1, max: 2 }
  strip.itemFields.find((f) => f.name === 'name').name = 'title'
  strip.itemFields.find((f) => f.name === 'title').slots = ['article-22.4', 'article-21.4']
  strip.itemsOrder = { by: 'title', direction: 'asc', from: "invented: the strip module's own setting" }
  strip.itemsOf = {
    block: 'services-grid',
    select: 'all',
    fields: { title: 'name', link: 'link' },
    why: 'invented'
  }
  set.blockStore.blocks.push(strip)
  set.pageRecipes.recipes[0].blocks.push('services-strip')
  delete set.mapping.blocks['services-grid'].itemLists
  for (const key of ['price', 'icon']) delete set.mapping.blocks['services-grid'].itemFields[key]
  set.mapping.blocks['services-strip'] = {
    itemFields: {
      title: [
        { entity: 'module-13', column: 'params', jsonPath: ['items', '1', 'name'] },
        { entity: 'module-13', column: 'params', jsonPath: ['items', '0', 'name'] }
      ],
      link: set.mapping.blocks['services-grid'].itemFields.link
    }
  }
  return { set, grid, strip }
}
const storeProblems = (set) =>
  checkAiQuickstartContract(set)
    .problems.filter((p) => p.file === 'block-store.json' && /itemsO/.test(p.at))
    .map((p) => `${p.at}: ${p.message}`)

test('a block listing the records of another names the owner, the fields it draws and its own order', () => {
  const { set } = withStrip()
  assert.deepEqual(storeProblems(set), [])
})

test('two blocks listing the same records without the link fail', () => {
  const { set, strip } = withStrip()
  delete strip.itemsOf
  assert.deepEqual(storeProblems(set), [
    'blocks[services-strip].itemsOf: its items are records services-grid also lists (article-21, article-22): name the block that owns them'
  ])
})

test('two linked blocks listing their common records in another order declare different orders', () => {
  const { set, grid, strip } = withStrip()
  strip.itemsOrder = { ...grid.itemsOrder }
  assert.deepEqual(storeProblems(set), [
    'blocks[services-strip].itemsOrder: it lists the records it shares with services-grid in another order, yet declares the same order'
  ])
  delete grid.itemsOrder
  strip.itemsOrder = { by: 'title', direction: 'asc', from: 'invented' }
  assert.deepEqual(storeProblems(set), [
    'blocks[services-grid].itemsOrder: a block whose records another block lists declares its order'
  ])
})

test('itemsOf names another block with items, and an owner field of the same type for every item field', () => {
  const { set, strip } = withStrip()
  strip.itemsOf.fields = { title: 'link' }
  strip.itemsOrder = { by: 'alphabet', direction: 'asc', from: 'invented' }
  assert.deepEqual(storeProblems(set), [
    'blocks[services-strip].itemsOrder: itemsOrder is {by: title | published | created | ordering | hits | menu | path, direction: asc | desc, from}',
    'blocks[services-strip].itemsOf.fields[title]: name the text item field of services-grid this field draws',
    'blocks[services-strip].itemsOf.fields[link]: name the link item field of services-grid this field draws'
  ])
  strip.itemsOf = { block: 'services-strip', select: 'all', fields: {}, why: 'invented' }
  assert.match(storeProblems(set).join('\n'), /"services-strip" is no other block of the store with items/)
})
