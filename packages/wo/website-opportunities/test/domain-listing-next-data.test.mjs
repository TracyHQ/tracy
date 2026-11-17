// A Next.js listing page's own gallery and description, read from its page data the way its rating already is.
// The page data's shape as a listing site answered a plain request (17/11/2026); the business, its words and every
// address are invented.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listingFromHtml, readListingPage } from '../domain/listing-page.mjs'
import { LISTING_PICTURES_MAX, listingPicturesOf } from '../domain/listing-pictures.mjs'
import {
  listingDescriptionOfNextData,
  listingGalleryOfNextData,
  pictureKeyOf
} from '../domain/listing-next-data.mjs'

const URL_ = 'https://listings.example.test/uae/Dubai/Cafe/Lantern-Bakery/store/77a1/'
// A public address (IPv6, outside every private range), as the resolver of a real public host answers.
const PUBLIC = async () => [{ address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 }]
const IMG = (n, size = 's0') => `https://img.example.test/p/AbCdEf${n}=${size}`
const DESCRIPTION = 'Lantern Bakery is a neighbourhood bakery known for sourdough and cardamom knots.'

const merchant = (extra = {}) => ({
  name: 'Lantern Bakery',
  description: DESCRIPTION,
  rating: 4.4,
  totalRatingCount: 18,
  coverPic: IMG(1, 's750'),
  profileCover: { url: IMG(1, 's750'), width: 750, height: 420 },
  photos: {
    image_url: IMG(1),
    more_images: [
      { image: IMG(2), media_type: 'IMAGE', description: 'Counter' },
      { image: IMG(3), media_type: 'IMAGE', description: '' },
      { image: IMG(4), media_type: 'VIDEO', video_url: 'https://img.example.test/v4.mp4' }
    ]
  },
  galleryImages: [IMG(5), { url: IMG(2, 's1200') }],
  customerImages: ['https://img.example.test/guest-1.jpg'],
  amenities: [],
  ...extra
})

const PAGE = (m, ld = {}) => `<!doctype html><html><head>
<meta property="og:image" content="/api/og/merchant?url=${encodeURIComponent(IMG(1, 's750'))}">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Bakery',
  name: 'Lantern Bakery',
  telephone: '+971 4 000 0199',
  ...ld
})}</script></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { merchantData: m } } })}</script>
</body></html>`

test('the gallery of the page data: cover first, pictures only, never the guests', () => {
  assert.deepEqual(listingGalleryOfNextData(PAGE(merchant())), [
    IMG(1),
    IMG(1, 's750'),
    IMG(1, 's750'),
    IMG(2),
    IMG(3),
    IMG(5),
    IMG(2, 's1200')
  ])
  assert.deepEqual(listingGalleryOfNextData('<html></html>'), [])
  assert.deepEqual(listingGalleryOfNextData(PAGE({ photos: 'none', galleryImages: 'x' })), [])
})

test('one picture under several addresses is given once: its sizes, and the page proxy of it', () => {
  assert.equal(pictureKeyOf(IMG(1, 's750')), pictureKeyOf(IMG(1)))
  assert.equal(pictureKeyOf(IMG(1, 'w800-h600')), pictureKeyOf(IMG(1)))
  assert.equal(
    pictureKeyOf(`https://listings.example.test/api/og/merchant?url=${encodeURIComponent(IMG(1, 's750'))}`),
    pictureKeyOf(IMG(1))
  )
  assert.notEqual(pictureKeyOf(IMG(1)), pictureKeyOf(IMG(2)))
  assert.notEqual(
    pictureKeyOf('https://a.example.test/x.jpg?v=1'),
    pictureKeyOf('https://a.example.test/x.jpg?v=2')
  )
})

test('the listing pictures: the page data gallery joins the JSON-LD and og:image ones, each picture once', () => {
  const media = listingPicturesOf(PAGE(merchant()), URL_)
  assert.deepEqual(
    media.map((m) => m.url),
    [IMG(1), IMG(2), IMG(3), IMG(5)]
  )
  assert.ok(media.every((m) => m.kind === 'image' && m.sourceUrl === URL_))
  // A page with more pictures than one listing gives stops at the cap.
  const many = merchant({ galleryImages: Array.from({ length: 20 }, (_, i) => IMG(100 + i)) })
  assert.equal(listingPicturesOf(PAGE(many), URL_).length, LISTING_PICTURES_MAX)
})

test('a page without page data gives exactly the pictures it gave before', () => {
  const html = `<html><head><meta property="og:image" content="https://img.example.test/og.jpg">
<script type="application/ld+json">{"@type":"Bakery","name":"Lantern Bakery","image":["https://img.example.test/a.jpg"],
"logo":"https://img.example.test/logo.png"}</script></head></html>`
  assert.deepEqual(
    listingPicturesOf(html, URL_).map((m) => [m.url, m.role ?? null]),
    [
      ['https://img.example.test/logo.png', 'logo'],
      ['https://img.example.test/a.jpg', null],
      ['https://img.example.test/og.jpg', null]
    ]
  )
})

test("the listing's description: the business node's first, else the page data's", () => {
  assert.equal(listingDescriptionOfNextData(PAGE(merchant())), DESCRIPTION)
  assert.equal(listingFromHtml(PAGE(merchant())).description, DESCRIPTION)
  assert.equal(
    listingFromHtml(PAGE(merchant(), { description: 'A bakery on the square.' })).description,
    'A bakery on the square.'
  )
  assert.equal(listingFromHtml(PAGE(merchant({ description: '  ' }))).description, undefined)
  assert.equal(listingDescriptionOfNextData(PAGE(merchant({ description: 'x'.repeat(5000) }))).length, 2000)
})

test('readListingPage carries the gallery and the description of one limited read', async () => {
  const read = await readListingPage(URL_, {
    resolve: PUBLIC,
    fetch: async () =>
      new Response(PAGE(merchant()), { status: 200, headers: { 'content-type': 'text/html' } })
  })
  assert.equal(read.ok, true)
  assert.equal(read.facts.description, DESCRIPTION)
  assert.equal(read.media.length, 4)
})
