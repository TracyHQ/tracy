import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GPLACES_DETAIL_FIELDS,
  fetchPlaceDetails,
  placeFactsFromDetails,
  placePhotoUrl,
  fetchPlacePhoto
} from '../domain/gplaces-details.mjs'
import * as domain from '../domain/index.mjs'

const KEY = 'AIzaSECRETkey123'
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const okJson = (b, status = 200) =>
  new Response(typeof b === 'string' ? b : JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json' }
  })
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3, 4])

const review = (i) => ({
  name: `places/ChIJp1/reviews/r${i}`,
  rating: 5,
  text: { text: `  Lovely food ${i}.  `, languageCode: 'en' },
  originalText: { text: `Lovely food ${i}.`, languageCode: 'en' },
  authorAttribution: {
    displayName: `Guest ${i}`,
    uri: `https://www.google.com/maps/contrib/${i}`,
    photoUri: 'https://lh3.test/a.png'
  },
  publishTime: '2026-09-01T10:00:00Z',
  googleMapsUri: `https://www.google.com/maps/reviews/${i}`
})
const photo = (i) => ({
  name: `places/ChIJp1/photos/p${i}`,
  widthPx: 4032,
  heightPx: 3024,
  authorAttributions: [
    {
      displayName: `Owner ${i}`,
      uri: `https://maps.google.com/maps/contrib/o${i}`,
      photoUri: 'https://lh3.test/o.png'
    }
  ]
})
const RAW = {
  id: 'ChIJp1',
  displayName: { text: 'Tamarel Restaurant', languageCode: 'en' },
  editorialSummary: { text: 'Riverside Vietnamese cooking.', languageCode: 'en' },
  generativeSummary: { overview: { text: 'Cosy spot known for cao lầu.', languageCode: 'en' } },
  reviewSummary: { text: { text: 'Guests praise the service.', languageCode: 'en' } },
  reviews: Array.from({ length: 7 }, (_, i) => review(i + 1)),
  photos: Array.from({ length: 12 }, (_, i) => photo(i + 1)),
  regularOpeningHours: { weekdayDescriptions: ['Monday: 10:00 AM – 10:00 PM', 'Tuesday: Closed'] },
  priceLevel: 'PRICE_LEVEL_MODERATE',
  servesBreakfast: false,
  servesDinner: true,
  servesBeer: true,
  outdoorSeating: true,
  reservable: true
}

test('detail field mask asks for the Atmosphere fields, unprefixed, no wildcard', () => {
  const fields = GPLACES_DETAIL_FIELDS.split(',')
  for (const f of [
    'id',
    'displayName',
    'editorialSummary',
    'generativeSummary',
    'reviewSummary',
    'reviews',
    'photos',
    'regularOpeningHours',
    'priceLevel',
    'priceRange',
    'servesBreakfast',
    'servesVegetarianFood',
    'outdoorSeating',
    'liveMusic',
    'reservable',
    'delivery',
    'takeout',
    'dineIn',
    'goodForChildren',
    'goodForGroups',
    'allowsDogs'
  ]) {
    assert.ok(fields.includes(f), f)
  }
  assert.ok(fields.every((f) => !f.startsWith('places.')))
  assert.doesNotMatch(GPLACES_DETAIL_FIELDS, /\*/)
  assert.equal(new Set(fields).size, fields.length)
})

test('facts keep only present amenities, at most 5 reviews and 10 photos, each with its attribution', () => {
  const f = placeFactsFromDetails(RAW, { now: () => new Date('2026-10-18T10:00:00.000Z') })
  assert.equal(f.placeId, 'ChIJp1')
  assert.deepEqual(f.amenities, {
    servesBreakfast: false,
    servesDinner: true,
    servesBeer: true,
    outdoorSeating: true
  })
  assert.equal(f.reservable, true)
  assert.deepEqual(f.summaries, {
    editorial: 'Riverside Vietnamese cooking.',
    generative: 'Cosy spot known for cao lầu.',
    reviews: 'Guests praise the service.'
  })
  assert.equal(f.reviews.length, 5)
  assert.deepEqual(f.reviews[0], {
    author: 'Guest 1',
    authorUri: 'https://www.google.com/maps/contrib/1',
    rating: 5,
    text: 'Lovely food 1.',
    language: 'en',
    publishTime: '2026-09-01T10:00:00Z',
    googleMapsUri: 'https://www.google.com/maps/reviews/1'
  })
  assert.deepEqual(f.openingHours, ['Monday: 10:00 AM – 10:00 PM', 'Tuesday: Closed'])
  assert.equal(f.priceLevel, 'PRICE_LEVEL_MODERATE')
  assert.equal(f.photos.length, 10)
  assert.deepEqual(f.photos[0], {
    name: 'places/ChIJp1/photos/p1',
    widthPx: 4032,
    heightPx: 3024,
    attributions: [{ displayName: 'Owner 1', uri: 'https://maps.google.com/maps/contrib/o1' }]
  })
  assert.equal(f.attribution, 'Google')
  assert.equal(f.fetchedAt, '2026-10-18T10:00:00.000Z')
})

test("facts carry Google's own name and website for the place: the shared research's first verified source", () => {
  assert.ok(GPLACES_DETAIL_FIELDS.split(',').includes('websiteUri'))
  const f = placeFactsFromDetails({
    id: 'ChIJw',
    displayName: { text: ' Pho Ba ' },
    websiteUri: ' https://phoba.example/ '
  })
  assert.equal(f.name, 'Pho Ba')
  assert.equal(f.website, 'https://phoba.example/')
  const none = placeFactsFromDetails({ id: 'ChIJw', websiteUri: 'not a url' })
  assert.equal(none.website, undefined, 'only an http(s) address')
  assert.equal(none.name, undefined)
})

test("facts carry the branch's own address and phone, what a found social page is matched on", () => {
  for (const field of ['formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber'])
    assert.ok(GPLACES_DETAIL_FIELDS.split(',').includes(field), field)
  const f = placeFactsFromDetails({
    id: 'ChIJo',
    formattedAddress: ' Sarab 1B, Al Barari, Dubai ',
    nationalPhoneNumber: '056 555 0146',
    internationalPhoneNumber: '+971 56 555 0146'
  })
  assert.equal(f.formattedAddress, 'Sarab 1B, Al Barari, Dubai')
  assert.equal(f.nationalPhoneNumber, '056 555 0146')
  assert.equal(f.internationalPhoneNumber, '+971 56 555 0146')
})

test("facts carry Google's point for the place, what a contribution to the hub offers as its location", () => {
  assert.ok(GPLACES_DETAIL_FIELDS.split(',').includes('location'))
  const f = placeFactsFromDetails({ id: 'ChIJo', location: { latitude: 25.12, longitude: 55.21 } })
  assert.deepEqual(f.location, { latitude: 25.12, longitude: 55.21 })
  assert.equal(placeFactsFromDetails({ id: 'ChIJo', location: { latitude: 'x' } }).location, undefined)
  const none = placeFactsFromDetails({ id: 'ChIJo', nationalPhoneNumber: ' ' })
  assert.equal('nationalPhoneNumber' in none, false)
})

test('a sparse place yields no invented facts', () => {
  const f = placeFactsFromDetails({
    id: 'ChIJx',
    reviews: [{ rating: 4, text: { text: '' } }, { rating: 3 }]
  })
  assert.equal(f.placeId, 'ChIJx')
  assert.deepEqual(f.amenities, {})
  assert.equal('reservable' in f, false)
  assert.deepEqual(f.summaries, {})
  assert.deepEqual(f.reviews, []) // a review without text or author is not usable as a testimonial
  assert.deepEqual(f.photos, [])
  assert.equal('openingHours' in f, false)
  assert.equal('priceLevel' in f, false)
})

test('details: one GET with key and field mask in headers only', async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push({ url: String(url), init })
    return okJson(RAW)
  }
  const raw = await fetchPlaceDetails('ChIJp1', { googleKey: KEY, fetch, resolve, language: 'vi' })
  assert.equal(raw.id, 'ChIJp1')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, 'https://places.googleapis.com/v1/places/ChIJp1?languageCode=vi')
  assert.equal(seen[0].init.method, 'GET')
  assert.equal(seen[0].init.headers['X-Goog-Api-Key'], KEY)
  assert.equal(seen[0].init.headers['X-Goog-FieldMask'], GPLACES_DETAIL_FIELDS)
  assert.doesNotMatch(seen[0].url, /AIza/)
})

test('details: error codes, and the key never reaches a message', async () => {
  const run = (fetch, extra = {}) =>
    fetchPlaceDetails('ChIJp1', { googleKey: KEY, fetch, resolve, ...extra }).then(
      () => null,
      (e) => e
    )
  assert.equal(
    (await fetchPlaceDetails('ChIJp1', { fetch: async () => okJson(RAW), resolve }).catch((e) => e)).code,
    'CREDENTIAL_MISSING'
  )
  assert.equal((await run(async () => okJson({ error: {} }, 429))).code, 'QUOTA')
  assert.equal(
    (await run(async () => okJson({ error: { message: 'Billing account disabled' } }, 403))).code,
    'QUOTA'
  )
  const notFound = await run(async () => okJson({ error: {} }, 404))
  assert.equal(notFound.code, 'PROVIDER_ERROR')
  assert.equal(notFound.status, 404)
  assert.equal((await run(async () => okJson('not json'))).code, 'PROVIDER_ERROR')
  const leaky = await run(async () => {
    throw new Error(`connect failed for key=${KEY}`)
  })
  assert.equal(leaky.code, 'PROVIDER_ERROR')
  assert.doesNotMatch(leaky.message, /AIzaSECRET/)
  const slow = await run(
    (_u, init) =>
      new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    { timeoutMs: 10 }
  )
  assert.equal(slow.code, 'TIMEOUT')
  const badId = await fetchPlaceDetails('../x', {
    googleKey: KEY,
    fetch: async () => okJson(RAW),
    resolve
  }).catch((e) => e)
  assert.equal(badId.code, 'PROVIDER_ERROR')
})

test('photo url asks for JSON, never carries the key', () => {
  assert.equal(
    placePhotoUrl('places/ChIJp1/photos/p1'),
    'https://places.googleapis.com/v1/places/ChIJp1/photos/p1/media?maxWidthPx=1600&skipHttpRedirect=true'
  )
  assert.equal(
    placePhotoUrl('places/ChIJp1/photos/p1', { maxWidthPx: 800 }),
    'https://places.googleapis.com/v1/places/ChIJp1/photos/p1/media?maxWidthPx=800&skipHttpRedirect=true'
  )
  assert.throws(() => placePhotoUrl('../../evil'), /photo name/)
})

test('photo: two steps, key in the header of the first only, bytes sniffed, attributions kept', async () => {
  const seen = []
  const fetch = async (url, init) => {
    const u = String(url)
    seen.push({ url: u, init })
    if (u.startsWith('https://places.googleapis.com/'))
      return okJson({
        name: 'places/ChIJp1/photos/p1/media',
        photoUri: 'https://lh3.googleusercontent.com/place-photos/abc=s1600'
      })
    return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
  }
  const attributions = [{ displayName: 'Owner 1', uri: 'https://maps.google.com/maps/contrib/o1' }]
  const got = await fetchPlacePhoto('places/ChIJp1/photos/p1', {
    googleKey: KEY,
    fetch,
    resolve,
    attributions
  })
  assert.equal(seen.length, 2)
  assert.equal(seen[0].init.headers['X-Goog-Api-Key'], KEY)
  assert.equal(seen[1].url, 'https://lh3.googleusercontent.com/place-photos/abc=s1600')
  assert.equal(seen[1].init.headers['X-Goog-Api-Key'], undefined)
  for (const s of seen) assert.doesNotMatch(s.url, /AIza|key=/)
  assert.deepEqual([...got.bytes], [...JPEG])
  assert.equal(got.mime, 'image/jpeg')
  assert.equal(got.sourceUrl, 'google-places:places/ChIJp1/photos/p1')
  assert.deepEqual(got.attributions, attributions)
})

test('photo: a non-image, an oversized image or a private photoUri is refused with a code', async () => {
  const meta = (photoUri) => okJson({ photoUri })
  const mk =
    (second, photoUri = 'https://lh3.googleusercontent.com/x') =>
    async (url) =>
      String(url).startsWith('https://places.googleapis.com/') ? meta(photoUri) : second()
  const run = (fetch, extra = {}) =>
    fetchPlacePhoto('places/ChIJp1/photos/p1', { googleKey: KEY, fetch, resolve, ...extra }).then(
      () => null,
      (e) => e
    )
  assert.equal(
    (
      await run(
        mk(() => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
      )
    ).code,
    'NOT_MEDIA'
  )
  assert.equal(
    (
      await run(
        mk(
          () =>
            new Response(
              new Uint8Array(64).fill(0xff).map((v, i) => (i < 3 ? [0xff, 0xd8, 0xff][i] : v)),
              { status: 200 }
            )
        ),
        { maxBytes: 16 }
      )
    ).code,
    'TOO_LARGE'
  )
  const blocked = await run(
    mk(() => new Response(JPEG), 'http://127.0.0.1/x'),
    { resolve: async (h) => [{ address: h === '127.0.0.1' ? '127.0.0.1' : '93.184.216.34', family: 4 }] }
  )
  assert.equal(blocked.code, 'URL_BLOCKED')
  assert.equal((await run(async () => okJson({}, 429))).code, 'QUOTA')
  assert.equal((await run(async () => okJson({ nothing: true }))).code, 'PROVIDER_ERROR')
  assert.equal(
    (
      await fetchPlacePhoto('places/ChIJp1/photos/p1', {
        fetch: mk(() => new Response(JPEG)),
        resolve
      }).catch((e) => e)
    ).code,
    'CREDENTIAL_MISSING'
  )
})

test('index exports the details API and the contract names both capabilities', () => {
  for (const n of [
    'GPLACES_DETAIL_FIELDS',
    'fetchPlaceDetails',
    'placeFactsFromDetails',
    'placePhotoUrl',
    'fetchPlacePhoto'
  ])
    assert.ok(n in domain, n)
  assert.ok(domain.CONTRACT.capabilities.includes('collect.google-places.details'))
  assert.ok(domain.CONTRACT.capabilities.includes('collect.google-places.photos'))
  assert.equal(domain.CONTRACT.version, 1)
})

test('fetchPlaceWebsite asks for websiteUri only and answers the website or null', async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push(new Headers(init.headers).get('x-goog-fieldmask'))
    return okJson(seen.length === 1 ? { websiteUri: 'https://quillhaus.example/' } : {})
  }
  assert.equal(
    await domain.fetchPlaceWebsite('ChIJp1', { googleKey: KEY, fetch, resolve }),
    'https://quillhaus.example/'
  )
  assert.equal(await domain.fetchPlaceWebsite('ChIJp1', { googleKey: KEY, fetch, resolve }), null)
  assert.deepEqual(seen, ['websiteUri', 'websiteUri'])
  await assert.rejects(domain.fetchPlaceWebsite('ChIJp1', { fetch, resolve }), { code: 'CREDENTIAL_MISSING' })
  await assert.rejects(
    domain.fetchPlaceWebsite('ChIJp1', {
      googleKey: KEY,
      fetch: async () => okJson({ error: {} }, 404),
      resolve
    }),
    { code: 'PROVIDER_ERROR', status: 404 }
  )
})

test('Google review normalization preserves contributor name, profile and avatar, separate from place photos', () => {
  const review = {
    text: { text: 'A peaceful terrace.' },
    authorAttribution: {
      displayName: 'Lan',
      uri: 'https://www.google.com/maps/contrib/123',
      photoUri: 'https://lh3.googleusercontent.com/a/avatar'
    }
  }
  const facts = placeFactsFromDetails({ id: 'place-id', reviews: [review] })
  assert.equal(facts.reviews[0].author, 'Lan')
  assert.equal(facts.reviews[0].authorUri, review.authorAttribution.uri)
  assert.equal(facts.reviews[0].authorAvatarUrl, review.authorAttribution.photoUri)
  assert.deepEqual(facts.photos, [])
  review.authorAttribution.photoUri = 'javascript:alert(1)'
  assert.equal(
    placeFactsFromDetails({ id: 'place-id', reviews: [review] }).reviews[0].authorAvatarUrl,
    undefined
  )
})

test('fetchPlaceVerification asks for the facts the hub checks and answers them flat, or found:false', async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push({ url: String(url), mask: new Headers(init?.headers).get('X-Goog-FieldMask') })
    return String(url).includes('ChIJgone')
      ? okJson({ error: { status: 'NOT_FOUND' } }, 404)
      : okJson({
          id: 'ChIJp1',
          displayName: { text: 'Tamarel Restaurant' },
          websiteUri: 'https://quillhaus.example/',
          formattedAddress: '1 Main St, Town',
          nationalPhoneNumber: '020 123 4567',
          internationalPhoneNumber: '+31 20 123 4567',
          location: { latitude: 52.37, longitude: 4.89 },
          rating: 4.6,
          userRatingCount: 210,
          primaryType: 'italian_restaurant',
          regularOpeningHours: {
            periods: [
              {
                open: { day: 1, hour: 12, minute: 0, date: { year: 2026 } },
                close: { day: 1, hour: 22, minute: 0 }
              },
              { open: { day: 0, hour: 0, minute: 0 } }
            ],
            weekdayDescriptions: ['Monday: 12:00 PM - 10:00 PM']
          }
        })
  }
  assert.deepEqual(await domain.fetchPlaceVerification('ChIJp1', { googleKey: KEY, fetch, resolve }), {
    found: true,
    id: 'ChIJp1',
    name: 'Tamarel Restaurant',
    website: 'https://quillhaus.example/',
    address: '1 Main St, Town',
    phones: ['+31 20 123 4567', '020 123 4567'],
    location: { latitude: 52.37, longitude: 4.89 },
    rating: 4.6,
    reviewCount: 210,
    category: 'italian_restaurant',
    openingHours: {
      periods: [
        { open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } },
        { open: { day: 0, hour: 0, minute: 0 } }
      ],
      weekdayText: ['Monday: 12:00 PM - 10:00 PM']
    }
  })
  for (const field of ['location', 'rating', 'userRatingCount', 'primaryType', 'regularOpeningHours']) {
    assert.ok(seen[0].mask.split(',').includes(field), field)
  }
  assert.deepEqual(await domain.fetchPlaceVerification('ChIJgone', { googleKey: KEY, fetch, resolve }), {
    found: false,
    id: 'ChIJgone'
  })
  await assert.rejects(domain.fetchPlaceVerification('ChIJp1', { fetch, resolve }), {
    code: 'CREDENTIAL_MISSING'
  })
  await assert.rejects(
    domain.fetchPlaceVerification('ChIJp1', { googleKey: KEY, fetch: async () => okJson({}, 500), resolve }),
    { code: 'PROVIDER_ERROR' }
  )
})

test("facts carry Google's place types, so a menu is offered only to food and drink places", () => {
  assert.ok(GPLACES_DETAIL_FIELDS.split(',').includes('primaryType'))
  assert.ok(GPLACES_DETAIL_FIELDS.split(',').includes('types'))
  const f = placeFactsFromDetails({
    id: 'ChIJw',
    primaryType: 'sushi_restaurant',
    types: ['sushi_restaurant', 'restaurant', 'food', 7]
  })
  assert.equal(f.primaryType, 'sushi_restaurant')
  assert.deepEqual(f.types, ['sushi_restaurant', 'restaurant', 'food'])
  const none = placeFactsFromDetails({ id: 'ChIJw', primaryType: ' ', types: 'restaurant' })
  assert.equal('primaryType' in none, false)
  assert.equal('types' in none, false)
})

test("the price range the call already pays for is kept, Google's per-person amounts", () => {
  const f = placeFactsFromDetails({
    id: 'ChIJp1',
    priceRange: {
      startPrice: { currencyCode: 'USD', units: '10' },
      endPrice: { currencyCode: 'USD', units: '20', nanos: 500000000 }
    }
  })
  assert.deepEqual(f.priceRange, { currency: 'USD', start: 10, end: 20.5 })
  assert.equal('priceRange' in placeFactsFromDetails({ id: 'ChIJp1', priceRange: {} }), false)
})

test('a long review keeps its whole text, so a demo can quote it word for word', () => {
  const long = 'Great food. '.repeat(300).trim()
  const f = placeFactsFromDetails({
    id: 'ChIJp1',
    reviews: [{ text: { text: long }, authorAttribution: { displayName: 'Lan' } }]
  })
  assert.equal(f.reviews[0].text, long)
})

test('detail field mask asks for the attributes any trade has: accessibility, parking, payment, restroom', () => {
  const fields = GPLACES_DETAIL_FIELDS.split(',')
  for (const f of ['accessibilityOptions', 'parkingOptions', 'paymentOptions', 'restroom', 'goodForChildren'])
    assert.ok(fields.includes(f), f)
})

test('facts flatten the general Google attributes into amenities, booleans only', () => {
  const f = placeFactsFromDetails({
    id: 'HarbourSportClub1',
    accessibilityOptions: {
      wheelchairAccessibleEntrance: true,
      wheelchairAccessibleParking: true,
      wheelchairAccessibleRestroom: false,
      wheelchairAccessibleSeating: true
    },
    parkingOptions: { freeParkingLot: true, paidStreetParking: false, valetParking: 'yes' },
    paymentOptions: { acceptsCreditCards: true, acceptsCashOnly: false },
    restroom: true,
    goodForChildren: true,
    goodForWatchingSports: true
  })
  assert.deepEqual(f.amenities, {
    goodForChildren: true,
    restroom: true,
    goodForWatchingSports: true,
    wheelchairAccessibleEntrance: true,
    wheelchairAccessibleParking: true,
    wheelchairAccessibleRestroom: false,
    wheelchairAccessibleSeating: true,
    freeParkingLot: true,
    paidStreetParking: false,
    acceptsCreditCards: true,
    acceptsCashOnly: false
  })
})
