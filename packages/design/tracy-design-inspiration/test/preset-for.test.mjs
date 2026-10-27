import assert from 'node:assert/strict'
import { test } from 'node:test'
import { presetFor } from '../src/client/preset-for.mjs'

test('keeps the role the customer already works in, swaps the platform', () => {
  assert.equal(presetFor('designer-wordpress', 'joomla'), 'designer-joomla')
  assert.equal(presetFor('writer-joomla', 'wordpress'), 'writer-wordpress')
  assert.equal(presetFor('seo-geo-emdash', 'joomla'), 'seo-geo-joomla')
})

test('a session with no Tracy preset builds as the designer', () => {
  assert.equal(presetFor(undefined, 'joomla'), 'designer-joomla')
  assert.equal(presetFor('', 'joomla'), 'designer-joomla')
  assert.equal(presetFor('standard', 'wordpress'), 'designer-wordpress')
})

test('a platform the matrix does not know answers null, never a made-up preset id', () => {
  assert.equal(presetFor('designer-wordpress', 'shopify'), null)
})
