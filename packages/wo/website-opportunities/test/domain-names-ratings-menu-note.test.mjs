// General rules about names, copied ratings and the menu note, each tested on businesses of other trades with one
// counter-case where the rule must not fire.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brandNameOf, brandNamed } from '../domain/brand-social.mjs'
import { copiedRatingVerdict } from '../domain/listing-page.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { matchSocialPage, searchPlaceOf, socialQueries } from '../domain/social-search.mjs'
import { menuEmptyNote, NO_PRICES_NOTE } from '../src/menu-items.js'

// F03: a listing's copy of another platform's rating never stands beside that platform's own rating.
test('a copied rating gives way to the direct one, a disagreeing copy cancels both, the listing’s own stays', () => {
  assert.equal(
    copiedRatingVerdict({ rating: 4.6, reviews: 120, ratingOf: 'google' }, { rating: 4.6, reviews: 120 }),
    'copy'
  )
  assert.equal(
    copiedRatingVerdict({ rating: 4.1, reviews: 30, ratingOf: 'tripadvisor' }, { rating: 4.5, reviews: 30 }),
    'conflict'
  )
  assert.equal(
    copiedRatingVerdict({ rating: 5, reviews: 16, ratingOf: 'google' }, { rating: 5, reviews: 4 }),
    'conflict'
  )
  // Counter-cases: the listing's own rating, and a copy of a platform Tracy holds nothing of.
  assert.equal(copiedRatingVerdict({ rating: 4.2, reviews: 9 }, { rating: 4.6, reviews: 120 }), null)
  assert.equal(copiedRatingVerdict({ rating: 4.2, reviews: 9, ratingOf: 'google' }, null), null)
})

const listingRow = (facts) => ({
  source: 'listing',
  ref: 'https://listing.test/biz/1',
  status: 'complete',
  collected_at: '2026-10-26T10:00:00.000Z',
  collected: { listings: [{ ok: true, url: 'https://listing.test/biz/1', facts }] }
})
const ratingsOf = (google, facts) => {
  const doc = placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: 'ChIJx', name: 'Rosa Dental' },
    profile: { name: 'Rosa Dental', googlePlace: { placeId: 'ChIJx', ...google } },
    sources: [listingRow(facts)],
    madeAt: '2026-10-27T10:00:00.000Z'
  })
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  return doc.claims.statistics
    .filter((f) => f.value.label === 'rating')
    .map((f) => [f.value.amount, doc.evidence.find((e) => f.evidenceRefs.includes(e.id))?.sourceRef ?? null])
}

test('in the place profile: the agreeing copy is dropped, a disagreeing one drops both, the own one is kept', () => {
  const agree = ratingsOf(
    { rating: 4.6, userRatingCount: 120 },
    { rating: 4.6, reviews: 120, ratingOf: 'google' }
  )
  assert.equal(agree.length, 1, JSON.stringify(agree))
  const differ = ratingsOf(
    { rating: 4.6, userRatingCount: 120 },
    { rating: 4.9, reviews: 300, ratingOf: 'google' }
  )
  assert.equal(differ.length, 0, JSON.stringify(differ))
  const own = ratingsOf({ rating: 4.6, userRatingCount: 120 }, { rating: 4.2, reviews: 9 })
  assert.equal(own.length, 2, JSON.stringify(own))
})

// F13: the decided name is searched and matched besides Google's.
test('a decided name that is not Google’s is searched second and a page under it matches', () => {
  const facts = { name: 'Bright Smile Clinic LLC', placeId: 'p1', addressComponents: [] }
  const place = searchPlaceOf(facts, { otherNames: ['Rosa Dental'], phone: '+971 4 000 0000' })
  const queries = socialQueries(place, 'instagram')
  assert.equal(queries[1], 'Rosa Dental instagram')
  assert.ok(queries.length >= 3)
  const bakery = searchPlaceOf({ name: 'Al Noor Trading', placeId: 'p2' }, { otherNames: ['Crumb Bakery'] })
  assert.ok(socialQueries(bakery, 'facebook').includes('Crumb Bakery facebook'))
  const page = { name: 'Rosa Dental', phone: '+971 4 000 0000' }
  assert.notDeepEqual(matchSocialPage(place, page).reasons, ['name_mismatch'])
  assert.deepEqual(matchSocialPage({ ...place, otherNames: undefined }, page).reasons, ['name_mismatch'])
  // Counter-case: the same name (any spelling) adds no query.
  const same = searchPlaceOf({ name: 'Rosa Dental', placeId: 'p3' }, { otherNames: ['ROSA  dental'] })
  assert.equal(same.otherNames, undefined)
  assert.deepEqual(
    socialQueries(same, 'instagram'),
    socialQueries(searchPlaceOf({ name: 'Rosa Dental', placeId: 'p3' }), 'instagram')
  )
})

// F14: the brand's name is the decided business name, never a handle.
test('a brand named by a handle takes the decided name; a display name that is the decided name is kept', () => {
  assert.equal(brandNameOf('crumb.bakery', 'Crumb Bakery'), 'Crumb Bakery')
  assert.equal(brandNameOf('rosadental_dxb', 'Rosa Dental'), 'Rosa Dental')
  assert.equal(brandNameOf('ROSA DENTAL', 'Rosa Dental'), 'ROSA DENTAL')
  assert.equal(brandNamed({ origin: 'social', name: 'iron.works.gym' }, 'Iron Works').name, 'Iron Works')
  assert.equal(brandNamed(null, 'Iron Works'), null)
  const doc = placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: 'ChIJy', name: 'Crumb Bakery' },
    profile: { name: 'Crumb Bakery', nameCheck: { name: 'Crumb Bakery', state: 'agreed' } },
    brand: {
      social: { origin: 'social', official: false, colors: [], fonts: [], evidence: [], name: 'crumb.bakery' }
    },
    sources: [],
    madeAt: '2026-10-27T10:00:00.000Z'
  })
  assert.equal(doc.brand.name.value, 'Crumb Bakery')
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
})

// F16: only a food business hears of menus and dishes when none was read.
test('the empty menu note speaks of dishes only to a food business', () => {
  assert.equal(menuEmptyNote({}, { trade: 'fitness' }), NO_PRICES_NOTE)
  assert.equal(menuEmptyNote({ menuPhotoStatus: 'switched_off' }, { trade: 'beauty' }), NO_PRICES_NOTE)
  assert.equal(menuEmptyNote({}, { trade: 'unknown' }), NO_PRICES_NOTE)
  assert.doesNotMatch(NO_PRICES_NOTE, /menu|dish/i)
  // Counter-case: a restaurant still hears why no dish was read.
  assert.match(menuEmptyNote({}, { trade: 'food' }), /No menu link or menu photo was found/)
  assert.match(menuEmptyNote({ menuPhotoStatus: 'switched_off' }), /photo reading is off/)
})
