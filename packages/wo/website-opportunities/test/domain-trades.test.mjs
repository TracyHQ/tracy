// Which trade a business is in (`domain/trades.mjs`), and Add site's search for any business by name and city.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { offeringKindOf } from '../domain/offering-kind.mjs'
import { placeProfileFromDemoRequest } from '../domain/place-profile-from-demo-request.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { tradeWords } from '../domain/trade-words.mjs'
import { TRADES, defaultOfferingKind, statedTradeOf, tradeOfCategory } from '../domain/trades.mjs'
import { extractPage } from '../domain/website-crawler.mjs'

test('a business is placed in its trade by its primary type, then its other types; unknown types are other', () => {
  assert.equal(domain.tradeOfPlace({ primaryType: 'dentist' }), 'health')
  assert.equal(domain.tradeOfPlace({ primaryType: 'italian_restaurant' }), 'food')
  assert.equal(domain.tradeOfPlace({ kind: 'bars' }), 'food')
  assert.equal(
    domain.tradeOfPlace({ primaryType: 'point_of_interest', types: ['establishment', 'spa'] }),
    'beauty'
  )
  assert.equal(domain.tradeOfPlace({ primaryType: 'lawyer' }), 'professional')
  assert.equal(domain.tradeOfPlace({ primaryType: 'hotel' }), 'hospitality')
  assert.equal(domain.tradeOfPlace({ primaryType: 'car_repair' }), 'auto')
  assert.equal(domain.tradeOfPlace({ primaryType: 'establishment' }), 'other')
  assert.equal(domain.tradeOfPlace(), 'other')
  assert.ok(domain.TRADES.includes('other'))
})

const KEY = 'test-key'
const resolve = async () => [{ address: '142.250.0.1', family: 4 }]
const okJson = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

test('anyKind keeps every business with its trade, asks for types, and still leaves out towns', async () => {
  const seen = []
  const places = [
    {
      id: 'smile',
      displayName: { text: 'Smile Dental' },
      primaryType: 'dentist',
      types: ['dentist', 'health'],
      location: { latitude: 1, longitude: 2 }
    },
    {
      id: 'pho',
      displayName: { text: 'Pho 77' },
      primaryType: 'vietnamese_restaurant',
      location: { latitude: 1, longitude: 2 }
    },
    {
      id: 'hanoi',
      displayName: { text: 'Hanoi' },
      primaryType: 'locality',
      location: { latitude: 1, longitude: 2 }
    }
  ]
  const fetch = async (url, init) => {
    seen.push(init)
    return okJson({ places })
  }
  const any = await domain.searchNamedPlaces(
    { query: 'Smile Dental Hanoi', anyKind: true },
    { googleKey: KEY, resolve, fetch }
  )
  assert.deepEqual(
    any.candidates.map((c) => `${c.providerId}:${c.trade}`),
    ['smile:health', 'pho:food']
  )
  assert.match(new Headers(seen[0].headers).get('x-goog-fieldmask'), /places\.types/)
  const find = await domain.searchNamedPlaces(
    { query: 'Smile Dental Hanoi' },
    { googleKey: KEY, resolve, fetch }
  )
  assert.deepEqual(
    find.candidates.map((c) => c.providerId),
    ['pho']
  )
  assert.equal(find.candidates[0].trade, undefined)
  assert.doesNotMatch(new Headers(seen[1].headers).get('x-goog-fieldmask'), /places\.types/)
})

test('the schema.org type a website states is its trade; LocalBusiness and the unknown are other', () => {
  assert.equal(domain.tradeOfSchemaType('Dentist'), 'health')
  assert.equal(domain.tradeOfSchemaType('DaySpa'), 'beauty')
  assert.equal(domain.tradeOfSchemaType('Attorney'), 'professional')
  assert.equal(domain.tradeOfSchemaType('Restaurant'), 'food')
  assert.equal(domain.tradeOfSchemaType('LocalBusiness'), 'other')
  assert.equal(domain.tradeOfSchemaType(undefined), 'other')
})

test('one category normaliser: a trade code, Google type, schema.org type or cuisine, in any case or spacing', () => {
  const cases = [
    ['Gym', 'fitness'],
    ['gym', 'fitness'],
    ['hair salon', 'beauty'],
    ['Hair-Salon', 'beauty'],
    ['day_spa', 'beauty'],
    ['restaurant', 'food'],
    ['Vietnamese', 'food'],
    ['fitness', 'fitness'],
    ['dog whisperer', 'other'],
    ['', null],
    [undefined, null]
  ]
  for (const [category, trade] of cases) assert.equal(tradeOfCategory(category), trade, String(category))
})

test('the profile adapter reads a category through the same normaliser, and its offerings follow the trade', () => {
  const kindOf = (category) => {
    const doc = placeProfileFromDemoRequest({
      business: { name: 'Place', ...(category ? { category } : {}), items: [{ name: 'Item', price: '10' }] }
    })
    return [statedTradeOf(doc), doc.offerings[0].value.kind]
  }
  assert.deepEqual(kindOf('Gym'), ['fitness', 'service'])
  assert.deepEqual(kindOf('hair salon'), ['beauty', 'service'])
  assert.deepEqual(kindOf('restaurant'), ['food', 'dish'])
  // A stated category nothing places is no guess at food; no category at all is a legacy restaurant.
  assert.deepEqual(kindOf('dog whisperer'), ['other', 'service'])
  assert.deepEqual(kindOf(undefined), [null, 'dish'])
})

test('one trade-to-kind table for offerings, trade words and neutral names', () => {
  for (const trade of TRADES) assert.equal(tradeWords(trade).itemKind, defaultOfferingKind(trade), trade)
  assert.equal(defaultOfferingKind(null), 'dish')
  assert.equal(defaultOfferingKind('other'), 'service')
  assert.equal(offeringKindOf({}, 'other'), 'service')
  assert.equal(offeringKindOf({ section: 'Coffee' }, null), 'drink')
})

// A website that states its schema.org type and has no Google category is still placed in its trade.

const siteOnly = (businessType, where = 'profile') =>
  placeProfileFromResearch({
    identity: { namespace: 'url', externalId: 'https://site.test/', name: 'Site' },
    profile: {
      name: 'Site',
      ...(where === 'profile' ? { businessType, provenance: { businessType: { source: 'website' } } } : {})
    },
    sources: [
      {
        source: 'website',
        ref: 'https://site.test/',
        status: 'complete',
        collected: { profile: { name: 'Site', businessType } }
      }
    ]
  })

test('a website-stated schema.org subtype, with no Google category, is its trade and offers services', () => {
  for (const [type, trade] of [
    ['HealthClub', 'fitness'],
    ['BeautySalon', 'beauty'],
    ['DaySpa', 'beauty'],
    ['Dentist', 'health'],
    ['LegalService', 'professional'],
    ['Physiotherapy', 'health'],
    ['SportsClub', 'fitness'],
    ['AutoBodyShop', 'auto']
  ])
    for (const where of ['profile', 'source-row']) {
      const doc = siteOnly(type, where)
      assert.equal(statedTradeOf(doc), trade, `${type} ${where}`)
      assert.equal(defaultOfferingKind(statedTradeOf(doc)), 'service', `${type} ${where}`)
    }
})

test('a bare LocalBusiness is a stated but unplaced category: services, never dishes', () => {
  for (const where of ['profile', 'source-row']) {
    const doc = siteOnly('LocalBusiness', where)
    assert.equal(statedTradeOf(doc), 'other', where)
    assert.equal(defaultOfferingKind(statedTradeOf(doc)), 'service', where)
    const menu = doc.coverage.find((c) => c.target === 'menu')
    assert.equal(menu.status, 'not_applicable', where)
  }
})

test('the crawler keeps every subtype the trade table knows, written as a name or a schema.org IRI', () => {
  const ld = (type) =>
    `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': type, name: 'X' })}</script></head></html>`
  assert.equal(extractPage(ld('SportsClub'), 'https://x.test/').business.type, 'SportsClub')
  assert.equal(
    extractPage(ld('https://schema.org/HealthClub'), 'https://x.test/').business.type,
    'HealthClub'
  )
  assert.equal(extractPage(ld(['LocalBusiness', 'schema:DaySpa']), 'https://x.test/').business.type, 'DaySpa')
})
