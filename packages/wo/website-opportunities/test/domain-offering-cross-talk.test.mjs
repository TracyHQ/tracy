// Spec TracyHQ/tracy#189: a card or page of one offering is written about that offering only. The check flags every line of
// an offering's card that names another offering of the business. Businesses are made up; two trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { offeringCrossTalk, offeringWords } from '../domain/offering-cross-talk.mjs'

const line = (key, group) => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  group: group ? { id: group } : null
})

test('a word two offerings share names neither; an interface word names nothing', () => {
  const words = offeringWords(['Swimming Lessons', 'Fitness Lessons', 'Padel'])
  assert.deepEqual([...words.get('Swimming Lessons')], ['swimming'])
  assert.deepEqual([...words.get('Padel')], ['padel'])
})

test('a sports club: the swimming card that lists every sport is flagged, the padel card about padel is not', () => {
  const cardNames = {
    'article-2.offering': 'Swimming Lessons',
    'article-3.offering': 'Padel',
    'module-9.item.0': 'Fitness Lessons'
  }
  const found = offeringCrossTalk({
    slots: [
      line('article-2.4'),
      line('article-3.4'),
      line('module-9.1', 'module-9.item.0'),
      line('module-12.0')
    ],
    written: {
      'article-2.4': 'Pick padel, swimming or fitness and train one to one.',
      'article-3.4': 'Fast rallies on our padel courts.',
      'module-9.1': 'Strength and mobility, one session at a time.',
      'module-12.0': 'Padel, swimming and fitness for all ages.'
    },
    cardNames
  })
  assert.deepEqual(found, [
    { key: 'article-2.4', offering: 'Swimming Lessons', names: ['Padel', 'Fitness Lessons'] }
  ])
})

test('a bakery: one product named on another product page is flagged; with one offering there is nothing to cross', () => {
  const cardNames = { 'article-7.offering': 'Rye loaf', 'article-8.offering': 'Croissants' }
  const slots = [line('article-7.1')]
  const written = { 'article-7.1': 'Our rye loaf pairs well with croissants.' }
  assert.equal(offeringCrossTalk({ slots, written, cardNames }).length, 1)
  assert.deepEqual(offeringCrossTalk({ slots, written, cardNames: { 'article-7.offering': 'Rye loaf' } }), [])
})
