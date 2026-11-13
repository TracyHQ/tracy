// The text matching of a plan revision (ticket #599, `revision-text-forms.mjs`): a held name or an old value is found
// on every leaf string of a stored value (keys too), in every form a browser shows it (references read until stable,
// percent decoded, tags read as a space or as nothing, accents, case, white space, slug), and a held person also by
// the short forms a block signs a review with; what a run records is masked. Invented names only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-text-forms.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  heldFormsOf,
  leavesOf,
  maskedOf,
  maskHeld,
  namesAnyIn,
  textsNamedIn,
  withShortForms
} from '../domain/revision-text-forms.mjs'

const HELD = 'Wenna Clout'

test('a held name is found in every form a stored value can write it', () => {
  for (const value of [
    '<p>Wenna Clout</p>',
    '<p>Wenna&nbsp;Clout</p>',
    '<p>Wenna<br>Clout</p>',
    '<p>Wenna\nClout</p>',
    'Wenna\tClout',
    '<p>W&#101;nna Clout</p>',
    '<p>Wenna&shy;Clout</p>',
    'W&amp;#101;nna Clout',
    'wenna%20clout',
    'img/wenna-clout.jpg',
    'WENNA CLOUT',
    'W&eacute;nna Clout'
  ])
    assert.ok(namesAnyIn(value, [HELD]), JSON.stringify(value))
  assert.ok(!namesAnyIn('<p>Wenna, the shop cat, met a cloud</p>', [HELD]))
})

test('every leaf of a value is read: nested strings, numbers and object keys', () => {
  const value = {
    records: { 'article:3000': { fields: { introtext: ['<p>kept</p>', { deep: 'Wenna Clout' }] } } }
  }
  assert.ok(namesAnyIn(value, [HELD]))
  assert.ok(namesAnyIn({ 'picture:home.b7.wenna-clout-jpg': 1 }, [HELD]))
  assert.deepEqual(leavesOf({ a: [1, 'x'] }), ['a', '1', 'x'])
  assert.deepEqual(textsNamedIn('Ask for our Wild meadow bouquet.', ['wild MEADOW bouquet', 'Hedgerow']), [
    'wild MEADOW bouquet'
  ])
})

test('a held person is also held by first name and initial, and by initial and last name; a held business name is not cut', () => {
  assert.deepEqual(withShortForms([HELD]), [HELD, 'Wenna C', 'W Clout'])
  const forms = heldFormsOf({ people: [HELD], names: ['Larkspur Blooms'] })
  assert.deepEqual(forms, [HELD, 'Wenna C', 'W Clout', 'Larkspur Blooms'])
  assert.ok(namesAnyIn('<a href="#">Wenna C.</a>', forms))
  assert.ok(namesAnyIn('by W. Clout', forms))
  assert.ok(!namesAnyIn('Larkspur B. is a shop', forms))
})

test('what a run records is masked: a key, a ref or a path naming a held text gets a stand in, the same each time', () => {
  const report = {
    ran: ['copy:home.home-b5', 'picture:home.home-b7.gallery-wenna-clout-jpg.image'],
    paths: { 'picture:home.home-b7.gallery-wenna-clout-jpg.image': 'images/tracy/1c0d50494c745018.jpg' }
  }
  const masked = maskHeld(report, [HELD])
  assert.ok(!JSON.stringify(masked).toLowerCase().includes('wenna'))
  const stand = maskedOf('picture:home.home-b7.gallery-wenna-clout-jpg.image')
  assert.match(stand, /^held:[0-9a-f]{12}$/)
  assert.deepEqual(masked.ran, ['copy:home.home-b5', stand])
  assert.deepEqual(Object.keys(masked.paths), [stand])
  assert.equal(maskHeld(report, []), report)
})
