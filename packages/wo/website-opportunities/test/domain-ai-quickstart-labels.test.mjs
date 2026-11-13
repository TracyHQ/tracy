// List labels (#584) on the invented fixture: every child list names its rows (`label`), every block with item
// fields names its items (`itemsLabel`), each a short noun phrase in sentence case.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { labelProblem } from '../domain/ai-quickstart-labels.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const valid = () => ({
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
})
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const blockOf = (set, id) => set.blockStore.blocks.find((b) => b.id === id)

test('a label is a short noun phrase in sentence case', () => {
  assert.equal(labelProblem('Opening hours'), null)
  assert.equal(labelProblem("Baker's specials"), null)
  assert.match(labelProblem(''), /noun phrase/)
  assert.match(labelProblem('opening hours'), /capital letter/)
  assert.match(labelProblem('Opening hours.'), /closing punctuation/)
  assert.match(labelProblem(' Opening hours'), /spaces/)
  assert.match(labelProblem('A'.repeat(41)), /at most 40/)
})

test('a child list without a label fails, nested in a block or in its items', () => {
  const set = valid()
  delete blockOf(set, 'footer-main').lists[0].label
  delete blockOf(set, 'services-grid').itemLists[0].label
  assert.deepEqual(problemsOf(set), [
    'blocks[services-grid].itemLists[sessions].label: name what a person calls the rows: a short noun phrase in sentence case',
    'blocks[footer-main].lists[opening-hours].label: name what a person calls the rows: a short noun phrase in sentence case'
  ])
})

test('a block with item fields names its items; a block without them carries no itemsLabel', () => {
  const set = valid()
  delete blockOf(set, 'services-grid').itemsLabel
  blockOf(set, 'hero-home').itemsLabel = 'Heroes'
  assert.deepEqual(problemsOf(set), [
    'blocks[hero-home].itemsLabel: itemsLabel names the items of a block with item fields',
    'blocks[services-grid].itemsLabel: name what a person calls the rows: a short noun phrase in sentence case'
  ])
})

test('no two lists one page shows carry the same label (#584)', () => {
  const set = valid()
  assert.deepEqual(problemsOf(set), [])
  blockOf(set, 'footer-main').lists[0].label = 'Baking days'
  assert.deepEqual(problemsOf(set), [
    'blocks[footer-main].lists[opening-hours].label: "Baking days" is also the label of blocks[services-grid].itemLists[sessions].label on the home page: one page\'s lists carry distinct labels'
  ])
  blockOf(set, 'footer-main').lists[0].label = 'bakes'
  assert.match(problemsOf(set).join('\n'), /"bakes" is also the label of blocks\[services-grid\]\.itemsLabel/)
})
