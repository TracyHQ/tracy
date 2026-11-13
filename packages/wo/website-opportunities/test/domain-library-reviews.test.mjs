// What the Tracy reviews block shows (ticket #596): at most six reviews, only four or five stars, wording unchanged,
// reviewers named by first name and initial with a link to the Google listing. Invented reviewers and businesses only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { tracyLibraryBlock } from '../domain/library.mjs'
import { googleListingUrl, reviewsToShow } from '../domain/library-reviews-content.mjs'
import { ReviewsBlockError, renderReviewsBlock } from '../domain/library-reviews-render.mjs'

const BLOCK = tracyLibraryBlock('tracy-reviews')
const LISTING = 'https://www.google.com/maps/search/?api=1&query=Example&query_place_id=invented-place-0001'
const FIRST = ['Pell', 'Arno', 'Bryn', 'Cael', 'Dima', 'Eske', 'Fenn', 'Gael', 'Hux']
const review = (n, rating = 5, extra = {}) => ({
  author: `${FIRST[(n - 1) % FIRST.length]} Quorrin`,
  text: `Invented praise number ${n}.`,
  rating,
  origin: 'google',
  ...extra
})
const textsOf = (html) => [...html.matchAll(/<blockquote[^>]*><p>([\s\S]*?)<\/p>/g)].map((m) => m[1])
const unescape = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

test('at most six reviews are shown, the rest are set aside with the reason', () => {
  const { shown, setAside } = reviewsToShow(Array.from({ length: 9 }, (_, i) => review(i + 1)))
  assert.equal(shown.length, 6)
  assert.deepEqual(
    setAside.map((s) => s.index),
    [6, 7, 8]
  )
  assert.match(setAside[0].reason, /at most 6 reviews/)
  const { html } = renderReviewsBlock(BLOCK, {
    listingUrl: LISTING,
    reviews: Array.from({ length: 9 }, (_, i) => review(i + 1))
  })
  assert.equal((html.match(/<li /g) ?? []).length, 6)
})

test('only reviews of four or five stars are shown; one without a rating is set aside', () => {
  const reviews = [
    review(1, 5),
    review(2, 4),
    review(3, 3),
    review(4, 1),
    review(5, null),
    review(6, '4'),
    review(7, 4.5)
  ]
  const { shown, setAside } = reviewsToShow(reviews)
  assert.deepEqual(
    shown.map((r) => r.rating),
    [5, 4, 4]
  )
  assert.deepEqual(
    setAside.map((s) => s.index),
    [2, 3, 4, 6]
  )
  assert.match(setAside[0].reason, /four or five stars/)
  assert.match(setAside[2].reason, /no star rating/)
})

test('the wording is unchanged: escaped for HTML, never cut, never edited; a review too long is set aside', () => {
  const words = 'Coach said "elbows in" & it worked <3\nSecond line, kept as written.'
  const { html } = renderReviewsBlock(BLOCK, {
    listingUrl: LISTING,
    reviews: [review(1, 5, { text: words })]
  })
  assert.deepEqual(textsOf(html).map(unescape), [words])
  const long = 'a'.repeat(BLOCK.itemFields.find((f) => f.name === 'text').limit + 1)
  const { shown, setAside } = reviewsToShow([review(1, 5, { text: long }), review(2)], { textLimit: 320 })
  assert.equal(shown.length, 1)
  assert.match(setAside[0].reason, /never cut/)
})

test('needs profile items are read as they are: text, author and rating from their fields', () => {
  const item = {
    id: 'quote-1',
    kind: 'quote',
    sources: ['gmaps'],
    fields: {
      'quote.text': { value: 'Friendly coaches and the courts are always swept.' },
      'quote.author_name': { value: 'Mara Telling' },
      'quote.rating_or_source': { value: '5' }
    }
  }
  assert.deepEqual(reviewsToShow([item], { origins: new Map([['gmaps', 'google']]) }).shown, [
    { text: 'Friendly coaches and the courts are always swept.', author: 'Mara T.', rating: 5 }
  ])
})

test('only a review with a Google source is shown: a website testimonial with stars is set aside', () => {
  const origins = new Map([
    ['gmaps', 'google'],
    ['site', 'website']
  ])
  const { shown, setAside } = reviewsToShow(
    [
      review(1, 5, { origin: 'website' }),
      review(2, 5, { origin: undefined }),
      review(3, 5, { origin: undefined, sources: ['site'] }),
      review(4, 5, { origin: undefined, sources: ['site', 'gmaps'] }),
      review(5, 5, { origin: undefined, origins: ['social', 'google'] }),
      review(6, 5, { origin: undefined, sources: ['gmaps'] })
    ],
    { origins }
  )
  assert.deepEqual(
    shown.map((r) => r.text),
    ['Invented praise number 4.', 'Invented praise number 5.', 'Invented praise number 6.']
  )
  assert.deepEqual(
    setAside.map((s) => [s.index, s.reason]),
    [
      [0, 'it is not a Google review'],
      [1, 'it is not a Google review'],
      [2, 'it is not a Google review']
    ]
  )
  assert.equal(reviewsToShow([review(1, 5, { origin: undefined, sources: ['gmaps'] })]).shown.length, 0)
})

test('every reviewer name links to the Google listing, and so does the closing link', () => {
  const { html } = renderReviewsBlock(BLOCK, {
    heading: 'What members say',
    listingLabel: 'Read every review',
    google: { ref: 'invented-place-0001', name: 'Brindlewick Tennis Club' },
    reviews: [review(1), review(2, 4)]
  })
  const links = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [unescape(m[1]), m[2]])
  const expected =
    'https://www.google.com/maps/search/?api=1&query=Brindlewick%20Tennis%20Club&query_place_id=invented-place-0001'
  assert.deepEqual(links, [
    [expected, 'Pell Q.'],
    [expected, 'Arno Q.'],
    [expected, 'Read every review']
  ])
  assert.match(html, /aria-label="4 out of 5 stars"/)
})

test('the Google listing link: a Google address as it is, a place id made a Maps link, anything else refused', () => {
  assert.equal(
    googleListingUrl({ ref: 'https://maps.app.goo.gl/invented' }),
    'https://maps.app.goo.gl/invented'
  )
  assert.match(googleListingUrl({ ref: 'invented-place-0001' }), /query_place_id=invented-place-0001$/)
  for (const ref of ['https://brindlewick-tennis.example/', 'http://maps.google.com/x', undefined])
    assert.throws(
      () => googleListingUrl({ ref }),
      (e) => e instanceof ReviewsBlockError && e.code === 'listing_missing'
    )
})

test('no listing link or no review to show fails with a code, so the block is hidden, never shown half', () => {
  assert.throws(
    () => renderReviewsBlock(BLOCK, { reviews: [review(1)] }),
    (e) => e instanceof ReviewsBlockError && e.code === 'listing_missing'
  )
  assert.throws(
    () => renderReviewsBlock(BLOCK, { listingUrl: LISTING, reviews: [review(1, 3)] }),
    (e) => e instanceof ReviewsBlockError && e.code === 'no_reviews'
  )
})
