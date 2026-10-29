// The owner's own posts about each offering, for the writer of that offering (spec TracyHQ/tracy#189, round 9 class F).
// Fictional businesses of two trades.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { offeringPostsOf, PER_OFFERING, POST_CHARS } from '../src/sites/brief-engines/offering-posts.js'

const post = (title, body, authorship = 'page') => ({ title, body, authorship, kinds: ['service'] })

test('a bakery: each class gets the posts that name it, spelling variants alike, reviews never', () => {
  const items = [
    post('Personalised Sourdough Classes', 'Small groups on weekday evenings. Message us to book. #bread'),
    post('Rye week', 'Our rye loaves are back on the shelf.'),
    post('Sourdough classes', 'A great class, I loved it.', 'review')
  ]
  const out = offeringPostsOf(items, ['Personalized Sourdough Classes', 'Rye Loaves', 'Cake Decorating'])
  assert.deepEqual(Object.keys(out), ['Personalized Sourdough Classes', 'Rye Loaves'])
  assert.equal(out['Personalized Sourdough Classes'].length, 1)
  assert.match(out['Personalized Sourdough Classes'][0], /weekday evenings/)
  assert.doesNotMatch(out['Personalized Sourdough Classes'][0], /#bread/)
})

test('a dental clinic: a generic word alone does not tie a post to an offering', () => {
  const items = [post('New sessions', 'Evening sessions are open for checkups.')]
  assert.equal(offeringPostsOf(items, ['Whitening Sessions']), null)
  assert.deepEqual(Object.keys(offeringPostsOf(items, ['Checkups']) ?? {}), ['Checkups'])
})

test('a large catalogue stays bounded: a few posts an offering, each cut short', () => {
  const long = 'Whitening '.repeat(200)
  const items = Array.from({ length: 10 }, (_, i) => post(`Whitening ${i}`, long))
  const out = offeringPostsOf(items, ['Whitening'])
  assert.equal(out.Whitening.length, PER_OFFERING)
  assert.ok(out.Whitening.every((p) => p.length <= POST_CHARS))
  assert.equal(offeringPostsOf(null, ['Whitening']), null)
})
