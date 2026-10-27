/**
 * The template picker's groups for a business of a known trade: Recommended, then Fits any business, then the rest,
 * on whatever the CMS chips and the search let through. The cards are the dev catalogue's (26/10/2026) for a fitness
 * business: JA Boxing (Joomla) made for it; JA Smallbiz (Joomla), JA Morgan (Joomla, WordPress) and Tracy Business
 * (every CMS) for any business.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { onPlatforms } from '../src/client/platforms.mjs'
import { readyFirst } from '../src/client/ready-first.mjs'
import { recommendedHeadingKey, TRADES, tradeGroups } from '../src/client/trade-groups.mjs'
import { en } from '../src/client/strings.ts'

const card = (id, platforms) => ({
  id,
  name: id.replace('ja-', 'JA ').replace('tracy-', 'Tracy '),
  platforms
})
const catalogue = [
  card('ja-fresco', ['wordpress', 'joomla']),
  card('ja-morgan', ['wordpress', 'joomla']),
  card('tracy-business', ['wordpress', 'emdash', 'joomla']),
  card('ja-vital', ['joomla']),
  card('ja-smallbiz', ['joomla']),
  card('tracy', ['wordpress', 'emdash', 'joomla']),
  card('ja-boxing', ['joomla'])
]
const ranking = {
  trade: 'fitness',
  recommended: ['ja-boxing'],
  generic: ['ja-morgan', 'tracy-business', 'ja-smallbiz']
}
/** What the gallery shows: the CMS chips and the typed name, as `Filter.tsx` `select` applies them. */
const shown = (chips, query = '') =>
  readyFirst(
    catalogue.filter(
      (d) => (query === '' || d.id.includes(query.toLowerCase())) && onPlatforms(d, new Set(chips))
    )
  )
const ids = (groups) => groups?.map((g) => [g.key, g.rows.map((d) => d.id)])

test('every card on screen: Recommended first, then Fits any business, then the rest in catalogue order', () => {
  assert.deepEqual(ids(tradeGroups(shown([]), ranking)), [
    ['recommended', ['ja-boxing']],
    ['generic', ['ja-morgan', 'tracy-business', 'ja-smallbiz']],
    ['rest', ['ja-fresco', 'ja-vital', 'tracy']]
  ])
})

test('inside one CMS chip the groups hold that CMS’s cards, and an empty group is left out', () => {
  assert.deepEqual(ids(tradeGroups(shown(['joomla']), ranking)), [
    ['recommended', ['ja-boxing']],
    ['generic', ['ja-morgan', 'tracy-business', 'ja-smallbiz']],
    ['rest', ['ja-fresco', 'ja-vital', 'tracy']]
  ])
  // No boxing template on WordPress: no Recommended heading there.
  assert.deepEqual(ids(tradeGroups(shown(['wordpress']), ranking)), [
    ['generic', ['ja-morgan', 'tracy-business']],
    ['rest', ['ja-fresco', 'tracy']]
  ])
  assert.deepEqual(ids(tradeGroups(shown(['emdash']), ranking)), [
    ['generic', ['tracy-business']],
    ['rest', ['tracy']]
  ])
})

test('a search groups what it found', () => {
  assert.deepEqual(ids(tradeGroups(shown([], 'box'), ranking)), [['recommended', ['ja-boxing']]])
  assert.deepEqual(ids(tradeGroups(shown([], 'ja-'), ranking)), [
    ['recommended', ['ja-boxing']],
    ['generic', ['ja-morgan', 'ja-smallbiz']],
    ['rest', ['ja-fresco', 'ja-vital']]
  ])
})

test('nothing to group by: no ranking, or nothing recommended or generic on screen, is the grid as today', () => {
  assert.equal(tradeGroups(shown([]), null), null)
  assert.equal(tradeGroups(shown([]), undefined), null)
  assert.equal(tradeGroups(shown([], 'fresco'), ranking), null)
  assert.equal(tradeGroups([], ranking), null)
})

test('each trade has its own heading in English; an unknown trade reads "your business"', () => {
  for (const trade of TRADES) {
    const key = recommendedHeadingKey(trade)
    assert.equal(key, `trade.recommended.${trade}`)
    assert.ok(en[key], `missing ${key}`)
    assert.doesNotMatch(en[key], /[\u2013\u2014]/)
  }
  assert.equal(en[recommendedHeadingKey('fitness')], 'Recommended for a fitness business')
  assert.equal(recommendedHeadingKey('music'), 'trade.recommended')
  assert.equal(recommendedHeadingKey(null), 'trade.recommended')
})
