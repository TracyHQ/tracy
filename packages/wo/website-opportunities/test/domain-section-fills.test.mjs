import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neutralItemName, placeholderFor, SECTION_ACTIONS } from '../domain/section-fills.mjs'
import { neutralWords } from '../domain/neutral-copy.mjs'
import { forbiddenFillers, forbiddenFillerText } from '../domain/slot-fill-manifest.mjs'

// 🔒 No filler stands in for a fact (plan §7, 26/10/2026).
test('a slot with no source is empty, an item name neutral by kind, a heading or a picture left to the brief', () => {
  assert.equal(placeholderFor('homepage.menu.dish-name.3'), 'Menu item')
  assert.equal(placeholderFor('homepage.menu.dish-name.3', { kind: 'service' }), 'Service')
  assert.equal(placeholderFor('homepage.menu.dish-name.3', { kind: 'product' }), 'Product')
  for (const key of [
    'homepage.menu.dish-price.3',
    'homepage.menu.dish-description.3',
    'homepage.menu.dish-extra-class.3',
    'homepage.specials.price.1',
    'homepage.testimonials.name.2',
    'homepage.testimonials.quote',
    'homepage.about.text'
  ])
    assert.equal(placeholderFor(key), '', key)
  for (const key of ['homepage.about.title', 'homepage.hero.image', 'homepage.cta.url'])
    assert.equal(placeholderFor(key), null, key)
})

test('the neutral item name follows the site language', () => {
  assert.equal(neutralItemName({ locale: 'en' }), 'Menu item')
  const vi = neutralItemName({ locale: 'vi' })
  assert.ok(vi && vi !== 'Menu item')
  assert.ok(neutralWords('vi').includes(vi))
  assert.ok(neutralWords().includes(vi) && neutralWords().includes('Menu item'))
})

test('no section action and no stand-in names a forbidden filler', () => {
  for (const [action, says] of Object.entries(SECTION_ACTIONS))
    for (const filler of forbiddenFillers('en')) assert.ok(!says.includes(filler), `${action}: ${filler}`)
  for (const kind of ['dish', 'service', 'product'])
    assert.equal(forbiddenFillerText(neutralItemName({ kind })), false)
  assert.ok(forbiddenFillers('en').includes('Coming soon'))
  assert.ok(forbiddenFillers().length > forbiddenFillers('en').length)
})
