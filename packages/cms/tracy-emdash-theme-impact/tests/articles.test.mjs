// The article helpers of the donation cards: the amounts the source prints with a thousands comma and the share raised.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { amount, articlePath, percent } from '../src/lib/articles.ts'

test('amounts read the source spelling: 4,500 is 4500, an empty or wordy value is 0', () => {
  assert.equal(amount('4,500'), 4500)
  assert.equal(amount('$9,000.50'), 9000.5)
  assert.equal(amount(''), 0)
  assert.equal(amount(undefined), 0)
  assert.equal(amount('n/a'), 0)
})

test('the share raised has one decimal like the source (76.7%), never passes 100 and is 0 without a goal', () => {
  assert.equal(percent('23,000', '30,000'), 76.7)
  assert.equal(percent('4,500', '9,000'), 50)
  assert.equal(percent('12,000', '10,000'), 100)
  assert.equal(percent('1,000', ''), 0)
})

test('an article lives under its list: the blog is /blog, the others keep their collection name', () => {
  assert.equal(articlePath('posts', 'a-post'), '/blog/a-post')
  assert.equal(articlePath('donations', 'a-cause'), '/donations/a-cause')
  assert.equal(articlePath('events', 'an-event'), '/events/an-event')
})
