import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listingFromHtml, nameHintOfListingUrl, readListingPage } from '../domain/listing-page.mjs'

const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'
const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]

// The shape magicpin answered a plain request with (26/10/2026): the directory's Organization and the business's
// ExerciseGym node, the directory's social pages in sameAs.
const PAGE = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"magicpin",
 "url":"https://magicpin.com","sameAs":["https://www.facebook.com/mymagicpin","https://www.instagram.com/mymagicpin"],
 "telephone":"+91 11 1111 1111"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ExerciseGym","name":"Padel & Tennis Coach",
 "telephone":"+971 50 123 4567","address":{"@type":"PostalAddress","streetAddress":"Al Barsha",
 "addressLocality":"Dubai","addressCountry":"AE"},"geo":{"@type":"GeoCoordinates","latitude":"25.0123",
 "longitude":"55.2456"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"37"},
 "sameAs":["https://www.facebook.com/mymagicpin"]}</script>
</head><body><footer><a href="https://www.instagram.com/mymagicpin">Follow magicpin</a></footer></body></html>`

test('the business node of a listing page: name, address, phone, geo, rating, category; never the Organization', () => {
  const facts = listingFromHtml(PAGE)
  assert.deepEqual(facts, {
    name: 'Padel & Tennis Coach',
    address: 'Al Barsha, Dubai, AE',
    telephone: '+971 50 123 4567',
    category: 'ExerciseGym',
    geo: { lat: 25.0123, lng: 55.2456 },
    rating: 4.8,
    reviews: 37
  })
  // Nothing of the directory's own pages (sameAs, footer links) is read.
  assert.ok(!JSON.stringify(facts).includes('mymagicpin'))
  assert.equal(
    listingFromHtml('<script type="application/ld+json">{"@type":"Organization","name":"magicpin"}</script>'),
    null
  )
})

test('a name hint from the listing URL', () => {
  assert.equal(nameHintOfListingUrl(MAGICPIN), 'Padel and Tennis Coach')
  assert.equal(
    nameHintOfListingUrl('https://www.yelp.com/biz/harbor-pizza-new-york'),
    'harbor pizza new york'
  )
  assert.equal(nameHintOfListingUrl('not a url'), null)
})

test('readListingPage: one limited read; a page that blocks keeps a name hint and never throws', async () => {
  const asked = []
  const ok = await readListingPage(MAGICPIN, {
    resolve: PUBLIC,
    fetch: async (url) => {
      asked.push(url)
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } })
    }
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.facts.name, 'Padel & Tennis Coach')
  assert.deepEqual(asked, [MAGICPIN])

  const blocked = await readListingPage(MAGICPIN, {
    resolve: PUBLIC,
    fetch: async () => new Response('denied', { status: 403 })
  })
  assert.deepEqual(blocked, { ok: false, reason: 'blocked', nameHint: 'Padel and Tennis Coach' })
  const down = await readListingPage(MAGICPIN, {
    resolve: PUBLIC,
    fetch: async () => {
      throw new Error('socket hang up')
    }
  })
  assert.equal(down.ok, false)
  assert.equal(down.reason, 'fetch_failed')
  const inside = await readListingPage(MAGICPIN, {
    resolve: async () => [{ address: '127.0.0.1', family: 4 }],
    fetch: async () => new Response(PAGE)
  })
  assert.equal(inside.reason, 'not_public')
})

// The shape of magicpin's page data (26/10/2026): its own rating empty, Google's rating shown in the header.
const NEXT_PAGE = (merchant) => `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ExerciseGym","name":"Padel & Tennis Coach",
 "telephone":"+971 50 123 4567"}</script></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { merchantData: merchant } } })}</script>
</body></html>`

test('a listing whose JSON-LD has no rating: the rating its page data shows, and whose rating it is (#1780)', () => {
  const google = {
    rating: 0,
    totalRatingCount: 0,
    googleRatingInfo: { rating: 5, count: 16, isClaimed: true },
    ratingsByPlatform: { google: { count: 16, rating: 5 }, justdial: null, magicpin: null }
  }
  assert.deepEqual(listingFromHtml(NEXT_PAGE(google)), {
    name: 'Padel & Tennis Coach',
    telephone: '+971 50 123 4567',
    category: 'ExerciseGym',
    rating: 5,
    reviews: 16,
    ratingOf: 'google'
  })
  // The listing's own rating, when it has one, is its own.
  const own = listingFromHtml(NEXT_PAGE({ ...google, rating: 4.2, totalRatingCount: 9 }))
  assert.deepEqual([own.rating, own.reviews, own.ratingOf], [4.2, 9, undefined])
  // No count, no rating.
  assert.equal(
    listingFromHtml(NEXT_PAGE({ rating: 0, totalRatingCount: 0, googleRatingInfo: { rating: 5, count: 0 } }))
      .rating,
    undefined
  )
  assert.equal(listingFromHtml(PAGE).ratingOf, undefined, 'JSON-LD rating stays first')
})
