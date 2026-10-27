import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  KINDS,
  SEARCH_PRIMARY_TYPES,
  CUISINES,
  kindOfPrimaryType,
  cuisineOfPrimaryType,
  primaryTypesOfKinds,
  primaryTypeOfCuisine
} from '../domain/place-kinds.mjs'

// Table A of the Places API type list, fetched 18/10/2026 (see `source` in the file).
const TYPES = JSON.parse(readFileSync(new URL('./fixtures/google-place-types.json', import.meta.url), 'utf8'))
const NIGHTLIFE = ['night_club', 'karaoke', 'live_music_venue', 'dance_hall', 'comedy_club']

test('KINDS is the fixed, frozen order of the six tabs', () => {
  assert.deepEqual([...KINDS], ['restaurants', 'cafes', 'fast-food', 'bakeries', 'bars', 'nightlife'])
  assert.ok(Object.isFrozen(KINDS))
})

test('every Food and Drink type Google lists has a kind, and so do the five nightlife types', () => {
  for (const t of TYPES.foodAndDrink)
    assert.ok(KINDS.includes(kindOfPrimaryType(t)), `${t} → ${kindOfPrimaryType(t)}`)
  for (const t of NIGHTLIFE) {
    assert.ok(TYPES.entertainmentAndRecreation.includes(t), `${t} is still in Table A`)
    assert.equal(kindOfPrimaryType(t), 'nightlife')
  }
})

test('types outside eating and drinking have no kind', () => {
  for (const t of [
    'hotel',
    'museum',
    'gas_station',
    'resort_hotel',
    'casino',
    'internet_cafe',
    'movie_theater',
    '',
    undefined,
    null,
    42
  ]) {
    assert.equal(kindOfPrimaryType(t), null, String(t))
  }
})

test("spot checks: one type per kind, and the brief's edge cases", () => {
  assert.equal(kindOfPrimaryType('vietnamese_restaurant'), 'restaurants')
  assert.equal(kindOfPrimaryType('steak_house'), 'restaurants')
  assert.equal(kindOfPrimaryType('coffee_shop'), 'cafes')
  assert.equal(kindOfPrimaryType('tea_house'), 'cafes')
  assert.equal(kindOfPrimaryType('sandwich_shop'), 'fast-food')
  assert.equal(kindOfPrimaryType('food_court'), 'fast-food')
  assert.equal(kindOfPrimaryType('meal_takeaway'), 'fast-food')
  assert.equal(kindOfPrimaryType('bagel_shop'), 'fast-food')
  assert.equal(kindOfPrimaryType('ice_cream_shop'), 'bakeries')
  assert.equal(kindOfPrimaryType('candy_store'), 'bakeries')
  assert.equal(kindOfPrimaryType('irish_pub'), 'bars')
  assert.equal(kindOfPrimaryType('winery'), 'bars')
  assert.equal(kindOfPrimaryType('karaoke'), 'nightlife')
})

test('SEARCH_PRIMARY_TYPES is every mapped type, unique and sorted, nothing else', () => {
  const expected = [...TYPES.foodAndDrink, ...NIGHTLIFE].sort()
  assert.deepEqual([...SEARCH_PRIMARY_TYPES], expected)
  assert.ok(Object.isFrozen(SEARCH_PRIMARY_TYPES))
  assert.ok(SEARCH_PRIMARY_TYPES.every((t) => kindOfPrimaryType(t) !== null))
})

test('primaryTypesOfKinds filters by kind, keeps order, and empty or unknown kinds give everything', () => {
  const bars = primaryTypesOfKinds(['bars'])
  assert.ok(bars.includes('pub') && bars.includes('wine_bar') && !bars.includes('cafe'))
  assert.ok(bars.every((t) => kindOfPrimaryType(t) === 'bars'))
  const two = primaryTypesOfKinds(['cafes', 'bakeries'])
  assert.ok(two.every((t) => ['cafes', 'bakeries'].includes(kindOfPrimaryType(t))))
  assert.deepEqual(primaryTypesOfKinds([]), [...SEARCH_PRIMARY_TYPES])
  assert.deepEqual(primaryTypesOfKinds(undefined), [...SEARCH_PRIMARY_TYPES])
  assert.deepEqual(primaryTypesOfKinds(['pets']), [])
})

test('cuisine: the country or dish before _restaurant; formats and non-restaurants are null', () => {
  assert.equal(cuisineOfPrimaryType('vietnamese_restaurant'), 'vietnamese')
  assert.equal(cuisineOfPrimaryType('pizza_restaurant'), 'pizza')
  assert.equal(cuisineOfPrimaryType('pizza_delivery'), 'pizza')
  assert.equal(cuisineOfPrimaryType('korean_barbecue_restaurant'), 'korean_barbecue')
  assert.equal(cuisineOfPrimaryType('vegan_restaurant'), 'vegan')
  for (const t of [
    'restaurant',
    'fast_food_restaurant',
    'fine_dining_restaurant',
    'family_restaurant',
    'buffet_restaurant',
    'breakfast_restaurant',
    'brunch_restaurant',
    'dessert_restaurant',
    'cafe',
    'bar',
    'bakery',
    'night_club',
    'hotel',
    undefined
  ]) {
    assert.equal(cuisineOfPrimaryType(t), null, String(t))
  }
})

test('CUISINES is sorted and unique, every one maps back to a searchable type', () => {
  assert.deepEqual([...CUISINES], [...new Set(CUISINES)].sort())
  assert.ok(Object.isFrozen(CUISINES))
  assert.ok(CUISINES.includes('vietnamese') && CUISINES.includes('pizza') && CUISINES.includes('sushi'))
  assert.ok(!CUISINES.includes('fast_food') && !CUISINES.includes('fine_dining'))
  for (const c of CUISINES) {
    const t = primaryTypeOfCuisine(c)
    assert.ok(SEARCH_PRIMARY_TYPES.includes(t), `${c} → ${t}`)
    assert.equal(cuisineOfPrimaryType(t), c)
  }
  assert.equal(primaryTypeOfCuisine('pizza'), 'pizza_restaurant')
  assert.equal(primaryTypeOfCuisine('martian'), null)
})
