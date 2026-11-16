// The build chat's research before a site exists takes every picture a link holds (#609): the Google place's photos
// (through the Place Photos door, under the executor's cap) and the pictures the listing page holds of the business
// (`listing-pictures.mjs`), stored by the same picture run as a social page's. Invented bakery, invented bytes.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-place-listing-pictures.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listingPicturesOf } from 'website-opportunities/domain/listing-pictures.mjs'
import { PLACE_PHOTOS_MAX } from 'website-opportunities/src/executor.js'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import {
  MAPS,
  PLACE_ID,
  fakeDomain,
  fakeObjects,
  fakePicturePool,
  placeDetails,
  pngOf,
  runtimeWith
} from './build-draft-gather-fakes.mjs'

const LISTING = 'https://www.yelp.com/biz/hollowmere-bakehouse-brackenford'
const LOGO = 'https://img.listing.example/hollowmere/logo.png'
const SHOP = 'https://img.listing.example/hollowmere/shopfront.jpg'
const OG = 'https://img.listing.example/hollowmere/og.jpg'
const LISTING_HTML = `<html><head>
  <meta property="og:image" content="${OG}">
  <link rel="icon" href="/favicon.ico">
  <script type="application/ld+json">${JSON.stringify([
    {
      '@type': 'Organization',
      name: 'The Directory',
      logo: 'https://img.listing.example/directory-logo.png'
    },
    {
      '@type': 'Bakery',
      name: 'Hollowmere Bakehouse',
      telephone: '+1 555 0142 318',
      logo: LOGO,
      image: [{ '@type': 'ImageObject', url: SHOP, caption: 'The shop front' }]
    }
  ])}</script></head>
  <body><img src="https://ads.listing.example/banner.gif"><img src="/img/other-business.jpg"></body></html>`

const photoName = (n) => `places/${PLACE_ID}/photos/photo${n}`

test('a listing page gives the business node logo and images and its og:image, never the directory or icons', () => {
  assert.deepEqual(listingPicturesOf(LISTING_HTML, LISTING), [
    { url: LOGO, kind: 'image', sourceUrl: LISTING, role: 'logo' },
    { url: SHOP, kind: 'image', sourceUrl: LISTING, caption: 'The shop front' },
    { url: OG, kind: 'image', sourceUrl: LISTING }
  ])
  assert.deepEqual(listingPicturesOf('<html></html>', LISTING), [])
})

test('a Google place and a listing, no social pictures: pictures kept from both, each with its source', async () => {
  const photos = Array.from({ length: PLACE_PHOTOS_MAX + 2 }, (_, i) => ({
    name: photoName(i),
    authorAttributions: [{ displayName: `Invented Visitor ${i}` }]
  }))
  const { domain, calls } = await fakeDomain({ details: () => ({ ...placeDetails(), photos }) })
  domain.readListingPage = async (url) => ({
    ok: true,
    facts: { name: 'Hollowmere Bakehouse', telephone: '+1 555 0142 318' },
    media: listingPicturesOf(LISTING_HTML, url)
  })
  const served = {
    [LOGO]: await pngOf(400, 400, { r: 20, g: 20, b: 20 }),
    [SHOP]: await pngOf(800, 600, { r: 200, g: 180, b: 150 })
  }
  domain.fetchLimited = async (url) =>
    served[url]
      ? { status: 200, bytes: served[url], truncated: false }
      : { status: 404, bytes: new Uint8Array(), truncated: false }
  const photoAsked = []
  domain.fetchPlacePhoto = async (name, deps) => {
    photoAsked.push([name, deps.googleKey])
    const n = Number(name.slice(-1))
    if (n > 1) throw Object.assign(new Error('provider error'), { code: 'PROVIDER_ERROR' })
    return {
      bytes: await pngOf(1200, 800, { r: 60 + n * 40, g: 120, b: 90 }),
      mime: 'image/png',
      sourceUrl: `google-places:${name}`,
      attributions: deps.attributions
    }
  }
  const pool = fakePicturePool()
  const gather = preSiteGatherer({
    pool,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith({ google: 'google-test' }),
      fetch: async () => assert.fail('no fetch outside the fakes'),
      paidRunAllowed: async () => true,
      objects: fakeObjects()
    }
  })
  const { manifest, picturesSetAside } = await gather(
    { links: [MAPS, LISTING], description: null },
    { accountId: 'acc-1' }
  )
  assert.ok(calls.some((c) => c[0] === 'details'))
  // The executor's cap holds: the two photos past it are never asked for.
  assert.equal(photoAsked.length, PLACE_PHOTOS_MAX)
  assert.ok(photoAsked.every(([, key]) => key === 'google-test'))
  assert.deepEqual(
    manifest.map((m) => [m.source, m.sourceUrl]).sort(),
    [
      ['google-places', `google-places:${photoName(0)}`],
      ['google-places', `google-places:${photoName(1)}`],
      ['listing', LOGO],
      ['listing', SHOP]
    ].sort()
  )
  const credit = pool.rows.find((r) => r.source_url === `google-places:${photoName(0)}`).labels.credit
  assert.deepEqual(credit.provider, 'Google')
  assert.equal(credit.authors.length, 1)
  // What did not download is set aside with its reason, by the same rules as a social picture.
  assert.ok(picturesSetAside.some((p) => p.url === OG))
  assert.ok(picturesSetAside.some((p) => p.url === `google-places:${photoName(2)}`))
})

test('the /ops/wo switch googlePlacesPhotos off: no Google photo is asked for', async () => {
  const { domain } = await fakeDomain({
    details: () => ({ ...placeDetails(), photos: [{ name: photoName(0) }] })
  })
  domain.fetchPlacePhoto = async () => assert.fail('the switch is off')
  const gather = preSiteGatherer({
    pool: fakePicturePool(),
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith({ google: 'google-test' }, { googlePlacesPhotos: false }),
      fetch: async () => assert.fail('no fetch outside the fakes'),
      paidRunAllowed: async () => true,
      objects: fakeObjects()
    }
  })
  const { manifest } = await gather({ links: [MAPS], description: null }, { accountId: 'acc-1' })
  assert.deepEqual(manifest, [])
})
