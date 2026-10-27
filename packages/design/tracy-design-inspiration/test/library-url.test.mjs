/**
 * Where the browser reads a system's file from once the catalog named a library (the public page,
 * versioned by vendor commit): the 152 come straight from the page, a brand stays on the lane's
 * own door, and the two aliases the components use (`slots`, `artifact-slots/<kind>`) land on the
 * page's file names. No library named = every request goes through the door, as before.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { libraryFileUrl } from '../src/client/library-url.mjs'

const LIB = { url: 'https://cowork.tracy.ai/design-inspiration', commit: 'abc1234' }
const door = (rest) => `/api/tracy-design-inspiration/${rest}`

test('a system file comes from the page, versioned; a brand file from the door', () => {
  assert.equal(
    libraryFileUrl(LIB, door, 'airbnb', 'tokens.css'),
    'https://cowork.tracy.ai/design-inspiration/systems/airbnb/tokens.css?v=abc1234'
  )
  assert.equal(
    libraryFileUrl(LIB, door, 'airbnb', 'system/artifacts/landing.html'),
    'https://cowork.tracy.ai/design-inspiration/systems/airbnb/system/artifacts/landing.html?v=abc1234'
  )
  assert.equal(
    libraryFileUrl(LIB, door, 'brand:acme.com', 'tokens.css'),
    '/api/tracy-design-inspiration/systems/brand%3Aacme.com/tokens.css'
  )
})

test('the two aliases: slots → slots.json of the system, artifact-slots/<kind> → the measured map of that artifact', () => {
  assert.equal(
    libraryFileUrl(LIB, door, 'airbnb', 'slots'),
    'https://cowork.tracy.ai/design-inspiration/systems/airbnb/slots.json?v=abc1234'
  )
  assert.equal(
    libraryFileUrl(LIB, door, 'airbnb', 'artifact-slots/landing'),
    'https://cowork.tracy.ai/design-inspiration/systems/airbnb/artifact-slots/landing.json?v=abc1234'
  )
  assert.equal(
    libraryFileUrl(LIB, door, 'brand:acme.com', 'slots'),
    '/api/tracy-design-inspiration/systems/brand%3Aacme.com/slots'
  )
})

test('no library named: the door, as before; a relative library url stays relative', () => {
  assert.equal(
    libraryFileUrl(null, door, 'airbnb', 'tokens.css'),
    '/api/tracy-design-inspiration/systems/airbnb/tokens.css'
  )
  assert.equal(
    libraryFileUrl({ url: '/design-inspiration', commit: 'abc1234' }, door, 'airbnb', 'DESIGN.md'),
    '/design-inspiration/systems/airbnb/DESIGN.md?v=abc1234'
  )
  assert.equal(
    libraryFileUrl(
      { url: 'http://localhost:5178/design-inspiration/', commit: 'abc1234' },
      door,
      'zen',
      'components.html'
    ),
    'http://localhost:5178/design-inspiration/systems/zen/components.html?v=abc1234'
  )
})
