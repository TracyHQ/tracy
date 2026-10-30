/**
 * The template inventory (spec TracyHQ/tracy#231, ticket #233): code lists every visible element of a released template from
 * its content map and contract, each with a stable id, its kind and its limits. No model is involved. Read against the real
 * released map of one template (any released map works the same way).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { inventoryOfContract, templateInventory } from '../src/sites/brief-engines/template-inventory.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const inventory = inventoryOfContract(contract)
const byId = new Map(inventory.elements.map((e) => [e.id, e]))

test('every element has a unique stable id, and two reads give the same list', () => {
  assert.equal(byId.size, inventory.elements.length)
  const again = inventoryOfContract(contract)
  assert.deepEqual(
    again.elements.map((e) => e.id),
    inventory.elements.map((e) => e.id)
  )
  assert.equal(inventory.contract, 'ja-boxing/j6/1.0.8')
})

test('pages carry their route and layout, and the showcase pages are marked', () => {
  const home = byId.get('page:menuItem-101')
  assert.equal(home.kind, 'page')
  assert.equal(home.route, 'home')
  assert.equal(home.layout, 'home')
  assert.equal(home.showcase, false)
  assert.equal(byId.get('page:menuItem-152').showcase, true)
})

test('a card collection carries its capacity, and its cards point back to it', () => {
  const cards = byId.get('cards:module-157.item')
  assert.equal(cards.kind, 'cards')
  assert.equal(cards.section, 'section:module-157')
  assert.equal(cards.limits.capacity, 4)
  const icon = byId.get('icon:module-157.12')
  assert.equal(icon.kind, 'icon')
  assert.deepEqual(icon.card, { collection: 'cards:module-157.item', index: 0 })
  assert.equal(byId.get('section:module-157').kind, 'section')
  assert.ok(byId.get('section:module-157').pages.includes('page:menuItem-101'))
})

test('picture slots carry their frame, buttons their action, text slots their limit', () => {
  const hero = byId.get('picture:module-156.0')
  assert.equal(hero.kind, 'picture')
  assert.equal(hero.role, 'business.hero_image')
  assert.equal(hero.limits.aspect, 1.5)
  assert.equal(hero.limits.minWidth, 2160)
  const button = byId.get('button:module-156.5')
  assert.equal(button.kind, 'button')
  assert.equal(button.action, 'primary-cta')
  assert.equal(button.urlKey, 'module-156.6')
  assert.equal(button.limits.maxCharacters, 43)
  assert.equal(byId.has('slot:module-156.6'), false, 'a button url is part of its button')
  const heading = byId.get('slot:category-2.0')
  assert.equal(heading.kind, 'slot')
  assert.equal(heading.decide, false)
  assert.equal(heading.limits.maxCharacters, 46)
})

test('menus, footer columns, contact blocks, CTA bands and record pages are elements', () => {
  assert.equal(byId.get('menu:mainmenu').kind, 'menu')
  const column = byId.get('footer-column:footer-offerings')
  assert.equal(column.kind, 'footer-column')
  assert.equal(column.limits.capacity, 5)
  assert.equal(byId.has('menu:classes'), false, 'a menu a footer column shows is that column')
  assert.equal(byId.get('contact-block:footer-contact').section, 'section:module-175')
  assert.equal(byId.get('cta-band:module-161.cta-band').kind, 'cta-band')
  const records = byId.get('record-page:classes')
  assert.equal(records.kind, 'record-page')
  assert.deepEqual(records.entities, ['article-2', 'article-14', 'article-15', 'article-16'])
})

test('every element the plan must decide is of a known kind, and nothing else is', () => {
  const kinds = new Set(inventory.elements.filter((e) => e.decide).map((e) => e.kind))
  assert.deepEqual([...kinds].sort(), [
    'button',
    'cards',
    'contact-block',
    'cta-band',
    'footer-column',
    'icon',
    'link',
    'menu',
    'page',
    'picture',
    'record-page',
    'section'
  ])
})

test('an empty content map gives an empty inventory', () => {
  assert.deepEqual(templateInventory({ contentMap: {} }).elements, [])
})
