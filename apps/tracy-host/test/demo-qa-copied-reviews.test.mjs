/**
 * `no-copied-reviews`: a post is written from the research and may quote one short line of a review; a post whose
 * body is mostly one review's words fails. The Willow Nook (lrsweep rig, 25/10/2026): twenty template posts became
 * "X's review of The Willow Nook", each a TripAdvisor or Google review copied whole.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHECK_IDS, checkNoCopiedReviews, collectedOf, copiedShare } from '../src/demo-qa.js'

const REVIEW =
  'We came for a quick coffee and stayed for three hours. The sofas are deep, the staff remember your name, and the cardamom buns are the best in Copenhagen. Come early on a Saturday or you will not get a seat by the window.'
const asked = {
  collected: collectedOf({ name: 'The Willow Nook', reviews: [{ text: REVIEW, author: 'Ida V.' }] })
}
const post = (postText) => ({ path: '/blog/x/', url: 'http://x/blog/x/', status: 200, postText })

test('no-copied-reviews: a post that is a review copied whole fails, naming its author', () => {
  const check = checkNoCopiedReviews(
    [post(`Ida V.'s review of The Willow Nook\n\n${REVIEW}\n\nIda V., Google`)],
    asked
  )
  assert.equal(check.pass, false)
  assert.equal(check.detail[0].code, 'REVIEW_COPIED')
  assert.equal(check.detail[0].author, 'Ida V.')
  assert.ok(CHECK_IDS.includes('no-copied-reviews'))
})

test('no-copied-reviews: a post in its own words quoting one short line of the review passes', () => {
  const own =
    'Our sofas on Søbjørnsstræde have been a second living room for students, writers and neighbours since the café opened. We bake cardamom buns every morning and pour coffee from a small roaster down the street. As Ida V. put it on Google: "the cardamom buns are the best in Copenhagen." Weekends fill up fast, so come before ten for a seat by the window, and stay as long as you like.'
  const check = checkNoCopiedReviews([post(own)], asked)
  assert.equal(check.pass, true, JSON.stringify(check.detail))
  assert.ok(copiedShare(own, REVIEW) < 0.5)
})

test('no-copied-reviews: pages that are not posts, and runs with no review, judge nothing', () => {
  assert.equal(checkNoCopiedReviews([{ path: '/', text: REVIEW, postText: null }], asked).pass, true)
  assert.equal(checkNoCopiedReviews([post(REVIEW)], { collected: collectedOf({ name: 'X' }) }).pass, true)
})
