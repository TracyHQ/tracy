/**
 * `no-google-review-quoted` against what a CMS prints: WordPress turns "I've" into "I’ve" and " - " into " – "
 * (wptexturize), so a verbatim review the agent pasted never matched its source, and the check named neither the
 * review nor what it lacked — four repairs could not fix it (local stand 24/10/2026, QuillHaus and Tin Lantern).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkNoGoogleReviewQuoted } from '../src/demo-qa.js'

const page = (over = {}) => ({ path: '/', url: 'http://x/', status: 200, error: null, loadMs: 1, ...over })
const tobin = {
  text: 'Cozy bar - friendly staff... I\'ve been here "many" times, 2x a month!',
  author: 'Tobin',
  url: 'https://www.google.com/maps/reviews/tobin'
}
const victor = {
  text: 'Relaxed bar with kind people, do visit!! Friendly bar, warm crowd. You might make new friends here.',
  author: 'Victor Lane',
  url: 'https://www.google.com/maps/reviews/victor'
}
const printed = 'Cozy bar – friendly staff… I’ve been here “many” times, 2× a month!'

test('no-google-review-quoted: a review the CMS printed with typographic quotes, dashes and ellipses is still verbatim', () => {
  const read = page({ text: `${printed} Tobin · Google review`, reviewLinks: [tobin.url] })
  const check = checkNoGoogleReviewQuoted([read], {
    googleReviews: [tobin.text],
    googleReviewTestimonials: [tobin]
  })
  assert.equal(check.pass, true, JSON.stringify(check.detail))
})

test('no-google-review-quoted: changed words still fail, typography aside', () => {
  const read = page({
    text: `${printed.replace('friendly', 'lovely')} Tobin · Google review`,
    reviewLinks: [tobin.url]
  })
  const check = checkNoGoogleReviewQuoted([read], {
    googleReviews: [tobin.text],
    googleReviewTestimonials: [tobin]
  })
  assert.equal(check.pass, false)
  assert.equal(check.detail[0].author, 'Tobin')
  assert.deepEqual(check.detail[0].missing, ['wording'])
})

test('no-google-review-quoted: verbatim reviews with their authors pass; the links the page could add are notes', () => {
  // The page credits both reviews to Google but links the place, not each review.
  const read = page({
    text: `${printed} Tobin Google review ${victor.text} Victor Lane Google review`,
    reviewLinks: ['https://www.google.com/maps/search/?api=1&query_place_id=abc']
  })
  const check = checkNoGoogleReviewQuoted([read], {
    googleReviews: [tobin.text, victor.text],
    googleReviewTestimonials: [tobin, victor]
  })
  assert.equal(check.pass, true)
  assert.deepEqual(
    check.detail.map((d) => [d.author, d.canAdd]),
    [
      ['Tobin', ['link']],
      ['Victor Lane', ['link']]
    ]
  )
})

test('no-google-review-quoted: a review with no author fails and says so', () => {
  const check = checkNoGoogleReviewQuoted([page({ text: victor.text, reviewLinks: [victor.url] })], {
    googleReviewTestimonials: [victor]
  })
  assert.equal(check.pass, false)
  assert.deepEqual(check.detail[0].missing, ['author'])
  assert.match(check.detail[0].fix, /name/)
})
