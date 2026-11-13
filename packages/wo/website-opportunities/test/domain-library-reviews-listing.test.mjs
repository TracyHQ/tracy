// The link of the Tracy reviews block goes to the business's Google listing and nowhere else (ticket #596): a Google
// Maps place or search address, or the Maps link built from a place id. The same check holds for a link the caller
// passes and for the one read from the needs profile's Google source. Invented places only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { tracyLibraryBlock } from '../domain/library.mjs'
import { checkedListingUrl, googleListingUrl } from '../domain/library-reviews-listing.mjs'
import { ReviewsBlockError, renderReviewsBlock } from '../domain/library-reviews-render.mjs'

const BLOCK = tracyLibraryBlock('tracy-reviews')
const REVIEW = { text: 'Invented praise.', author: 'Pell Quorrin', rating: 5, origin: 'google' }
const missing = (e) => e instanceof ReviewsBlockError && e.code === 'listing_missing'
const hrefOf = (html) => html.match(/<a href="([^"]*)"/)[1].replace(/&amp;/g, '&')

const ACCEPTED = [
  'https://maps.google.com/?cid=1234567890',
  'https://maps.google.co.uk/maps/place/Invented+Club',
  'https://www.google.com/maps/place/Invented+Club/@51.5,-0.1,15z',
  'https://www.google.de/maps/search/?api=1&query=Invented',
  'https://google.com/maps/place/Invented+Club',
  'https://www.google.co.uk/maps',
  'https://g.page/invented-club',
  'https://maps.app.goo.gl/inventedShortLink',
  'https://www.google.com/maps/search/?api=1&query=Invented&query_place_id=invented-place-0001'
]
const REFUSED = [
  'https://www.google.com/url?q=https://evil.example/',
  'https://maps.google.com/url?q=https://evil.example/',
  'https://www.google.com/search?q=invented+club',
  'https://www.google.com/',
  'https://evil.example/',
  'https://evil.example/?google.com',
  'https://google.com.evil.example/maps',
  'https://google.com@evil.example/maps',
  // A user name before a Google host, joined here so the address does not read as an e-mail address in the source.
  ['https://reviewer', 'maps.google.com/'].join('@'),
  'https://maps.google.com:8443/',
  'https://goo.gl/invented',
  'https://share.google/invented',
  'http://maps.google.com/',
  'javascript:alert(1)',
  'https://x" onmouseover="alert(1)',
  'not a link at all',
  ''
]

test('a Google Maps place or search address is accepted, trimmed, from the caller and from the profile alike', () => {
  for (const url of ACCEPTED) {
    assert.equal(checkedListingUrl(url), new URL(url).href, url)
    assert.equal(checkedListingUrl(`  ${url}  `), new URL(url).href, url)
    assert.equal(googleListingUrl({ ref: ` ${url} ` }), new URL(url).href, url)
    const { html } = renderReviewsBlock(BLOCK, { listingUrl: ` ${url} `, reviews: [REVIEW] })
    assert.equal(hrefOf(html), new URL(url).href, url)
  }
  assert.equal(checkedListingUrl('HTTPS://www.google.com/maps'), 'https://www.google.com/maps')
})

test('a Google redirect, a host that is not Google and anything not https are refused, in both paths', () => {
  for (const url of REFUSED) {
    assert.throws(() => checkedListingUrl(url), missing, url)
    assert.throws(() => renderReviewsBlock(BLOCK, { listingUrl: url, reviews: [REVIEW] }), missing, url)
    if (url.includes(':')) assert.throws(() => googleListingUrl({ ref: url }), missing, url)
  }
})

test('a place id becomes the Maps link Tracy builds, a Places API name loses its prefix', () => {
  const built = googleListingUrl({ ref: ' invented-place-0001 ', name: ' Brindlewick Tennis Club ' })
  assert.equal(
    built,
    'https://www.google.com/maps/search/?api=1&query=Brindlewick%20Tennis%20Club&query_place_id=invented-place-0001'
  )
  assert.equal(checkedListingUrl(built), built)
  assert.equal(
    googleListingUrl({ ref: 'places/ChIJinventedPlace0001' }),
    'https://www.google.com/maps/search/?api=1&query=ChIJinventedPlace0001&query_place_id=ChIJinventedPlace0001'
  )
  for (const ref of ['places/', 'places/a b', 'a b', '0x1:0x2', 'places/../x'])
    assert.throws(() => googleListingUrl({ ref }), missing, ref)
})

test('no Google source at all fails with listing_missing, never a TypeError', () => {
  for (const source of [null, undefined, {}, { ref: null }, { ref: '  ' }, 'invented-place-0001'])
    assert.throws(() => googleListingUrl(source), missing, String(source))
  assert.throws(() => renderReviewsBlock(BLOCK, { google: null, reviews: [REVIEW] }), missing)
  assert.throws(() => renderReviewsBlock(BLOCK, { reviews: [REVIEW] }), missing)
  assert.throws(() => renderReviewsBlock(BLOCK, null), missing)
})
