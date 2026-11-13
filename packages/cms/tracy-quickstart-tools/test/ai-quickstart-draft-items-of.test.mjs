// Blocks that list the records of another block (#584): the draft copies the decided owner and order, and matches
// each item field to the owner item field storing the same place. Invented blocks only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyItemsOf, linkItemsOf } from '../ai-quickstart/lib/draft-items-of.mjs'

const owner = () => ({
  id: 'menu-cards',
  itemFields: [
    { name: 'dish', type: 'text', slots: ['article-31.0', 'article-32.0', 'article-33.0'] },
    { name: 'photo', type: 'image', slots: ['article-31.7', 'article-32.7', 'article-33.7'] },
    { name: 'link', type: 'link', derived: 'the dish page' }
  ]
})
const teaser = () => ({
  id: 'dish-teaser',
  itemFields: [
    { name: 'title', type: 'text', slots: ['article-33.0', 'article-31.0'] },
    { name: 'picture', type: 'image', slots: ['article-33.7', 'article-31.7'] },
    { name: 'link', type: 'link', derived: 'the dish page' },
    { name: 'tone', type: 'design' }
  ]
})
const decision = {
  itemsOrder: { by: 'title', direction: 'asc', from: 'invented: the teaser module orders by title' },
  itemsOf: { block: 'menu-cards', select: 'all', why: 'invented: the teaser shows the dishes of the menu' }
}

test('the draft names the owner field each item field draws, matched by stored place or derivation', () => {
  const block = teaser()
  applyItemsOf(block, decision)
  const out = { problems: [] }
  linkItemsOf([owner(), block], out)
  assert.deepEqual(out.problems, [])
  assert.deepEqual(block.itemsOrder, decision.itemsOrder)
  assert.deepEqual(block.itemsOf, {
    block: 'menu-cards',
    select: 'all',
    fields: { title: 'dish', picture: 'photo', link: 'link' },
    why: decision.itemsOf.why
  })
})

test('an item field storing no place of the owner, or an owner that is not drafted, is a problem', () => {
  const block = teaser()
  block.itemFields[0].slots = ['article-40.0']
  applyItemsOf(block, decision)
  const out = { problems: [] }
  linkItemsOf([owner(), block], out)
  assert.deepEqual(out.problems, [
    {
      block: 'dish-teaser',
      problem: 'itemsOf: item field "title" stores no place an item field of menu-cards stores'
    }
  ])
  const lone = teaser()
  applyItemsOf(lone, decision)
  const missing = { problems: [] }
  linkItemsOf([lone], missing)
  assert.deepEqual(missing.problems, [
    { block: 'dish-teaser', problem: 'itemsOf: menu-cards is not a block of the store' }
  ])
})
