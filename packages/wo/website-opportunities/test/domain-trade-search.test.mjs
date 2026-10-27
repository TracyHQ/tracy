import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEARCH_TRADES,
  TRADE_SEARCH,
  ANY_GOOGLE_TYPES,
  searchTradeOf,
  tradeOfOsmTags,
  osmStatementsOf,
  searchPhrasesOf
} from '../domain/trade-search.mjs'
import { TRADES, tradeOfPlace } from '../domain/trades.mjs'

test('every searchable kind is a trade; the catch-alls (nonprofit, other) are not searchable', () => {
  assert.ok(SEARCH_TRADES.every((t) => TRADES.includes(t)))
  assert.ok(!SEARCH_TRADES.includes('nonprofit') && !SEARCH_TRADES.includes('other'))
  assert.deepEqual(Object.keys(TRADE_SEARCH).sort(), [...SEARCH_TRADES].sort())
})

test('a Google type searched under a kind is filed under that same kind when a place comes back', () => {
  for (const trade of SEARCH_TRADES)
    for (const type of TRADE_SEARCH[trade].google)
      assert.equal(tradeOfPlace({ primaryType: type }), trade, `${type} → ${trade}`)
  for (const type of ANY_GOOGLE_TYPES) assert.notEqual(tradeOfPlace({ primaryType: type }), 'other', type)
})

test('Google takes at most 50 types per call: "any" and every kind fit', () => {
  assert.ok(ANY_GOOGLE_TYPES.length <= 50)
  for (const trade of SEARCH_TRADES) assert.ok(TRADE_SEARCH[trade].google.length <= 50, trade)
  assert.equal(new Set(ANY_GOOGLE_TYPES).size, ANY_GOOGLE_TYPES.length)
})

test('a kind name is checked: any or none = every kind, an unknown name is refused', () => {
  assert.equal(searchTradeOf(undefined), null)
  assert.equal(searchTradeOf('any'), null)
  assert.equal(searchTradeOf('beauty'), 'beauty')
  assert.equal(searchTradeOf('government'), undefined)
  assert.equal(searchTradeOf('other'), undefined)
})

test('OSM tags tell the kind; any shop no other kind names is retail; non-commercial tags are none', () => {
  assert.equal(tradeOfOsmTags({ amenity: 'restaurant' }), 'food')
  assert.equal(tradeOfOsmTags({ shop: 'hairdresser' }), 'beauty')
  assert.equal(tradeOfOsmTags({ amenity: 'dentist' }), 'health')
  assert.equal(tradeOfOsmTags({ craft: 'plumber' }), 'home')
  assert.equal(tradeOfOsmTags({ tourism: 'guest_house' }), 'hospitality')
  assert.equal(tradeOfOsmTags({ shop: 'bicycle' }), 'retail')
  assert.equal(tradeOfOsmTags({ shop: 'vacant' }), null)
  assert.equal(tradeOfOsmTags({ amenity: 'townhall' }), null)
  assert.equal(tradeOfOsmTags({ amenity: 'parking' }), null)
})

test('Overpass statements: one kind keeps its own tags; every kind is the union', () => {
  const around = '(around:500,1,2)'
  assert.equal(
    osmStatementsOf('food', around),
    'nwr[amenity~"^(restaurant|cafe|fast_food|bar|pub)$"](around:500,1,2);'
  )
  const all = osmStatementsOf(null, around)
  for (const part of [
    'amenity~"^(restaurant|',
    'shop~"^(hairdresser|',
    'craft~"^(plumber|',
    'tourism~"^(hotel|',
    '[shop][shop!~"^(vacant|'
  ])
    assert.ok(all.includes(part), part)
  assert.doesNotMatch(all, /townhall|parking|place_of_worship/)
})

test('Google Maps phrases: one for a kind, one per kind for every kind', () => {
  assert.deepEqual(searchPhrasesOf('food'), ['restaurant'])
  assert.equal(searchPhrasesOf(null).length, SEARCH_TRADES.length)
})
