import assert from 'node:assert/strict'
import test from 'node:test'

import { onPlatforms, PLATFORMS, platformCounts, platformsOf } from '../src/client/platforms.mjs'

/**
 * The 28 templates `GET /api/templates` answered on cowork.tracy.site on 29/09/2026, as ids and
 * platforms only — in the order the door sent them, which is NOT the filter's order (the door wrote
 * `wordpress, emdash, joomla` for Tracy Business).
 */
const DEV_29_09 = [
  ['ja-vega', ['wordpress', 'joomla']],
  ['tracy', ['wordpress', 'joomla']],
  ['ja-kinetic', ['wordpress', 'joomla']],
  ['tracy-business', ['wordpress', 'emdash', 'joomla']],
  ...[
    'ja-voyara',
    'ja-vogue',
    'ja-vital',
    'ja-trip',
    'ja-tour',
    'ja-symphony',
    'ja-spark',
    'ja-space',
    'ja-spa',
    'ja-social-ii',
    'ja-smallbiz',
    'ja-seven',
    'ja-sensei',
    'ja-resume',
    'ja-resort',
    'ja-rent',
    'ja-prodex',
    'ja-podcast',
    'ja-phil',
    'ja-nova',
    'ja-morgan',
    'ja-mood',
    'ja-donate',
    'ja-directory'
  ].map((id) => [id, ['joomla']])
].map(([id, platforms]) => ({ id, platforms }))

/** A design system card: a look with no build of its own, so an empty list. */
const LOOK = { id: 'airbnb', platforms: [] }

test('the filter offers Joomla, WordPress and EmDash, in that order', () => {
  assert.deepEqual(
    PLATFORMS.map((p) => p.id),
    ['joomla', 'wordpress', 'emdash']
  )
})

test('each platform counts every template that supports it — a template on three counts three times', () => {
  const counts = platformCounts(DEV_29_09)
  assert.deepEqual(Object.fromEntries(counts), { joomla: 28, wordpress: 4, emdash: 1 })
})

test('a card with no build counts nowhere, and a platform nobody has counts zero', () => {
  const counts = platformCounts([LOOK, { id: 'x', platforms: ['joomla'] }])
  assert.equal(counts.get('joomla'), 1)
  assert.equal(counts.get('wordpress'), 0)
  assert.equal(counts.get('emdash'), 0)
})

test('a platform the filter does not offer is not counted, and does not throw', () => {
  const counts = platformCounts([{ id: 'x', platforms: ['shopify', 'joomla'] }, { id: 'y' }])
  assert.deepEqual(Object.fromEntries(counts), { joomla: 1, wordpress: 0, emdash: 0 })
})

test('nothing chosen lets every card through, a look included', () => {
  const none = new Set()
  assert.equal(
    DEV_29_09.every((d) => onPlatforms(d, none)),
    true
  )
  assert.equal(onPlatforms(LOOK, none), true)
})

test('one platform chosen: exactly the templates that support it', () => {
  const wp = DEV_29_09.filter((d) => onPlatforms(d, new Set(['wordpress']))).map((d) => d.id)
  assert.deepEqual(wp, ['ja-vega', 'tracy', 'ja-kinetic', 'tracy-business'])
  const em = DEV_29_09.filter((d) => onPlatforms(d, new Set(['emdash']))).map((d) => d.id)
  assert.deepEqual(em, ['tracy-business'])
})

test('several platforms chosen: a card shows when it supports ANY of them (Akemi, 29/09)', () => {
  const both = DEV_29_09.filter((d) => onPlatforms(d, new Set(['wordpress', 'emdash'])))
  assert.equal(both.length, 4)
  const all = DEV_29_09.filter((d) => onPlatforms(d, new Set(['joomla', 'wordpress', 'emdash'])))
  assert.equal(all.length, 28)
})

test('a chosen platform hides the looks: a card with no build supports none', () => {
  assert.equal(onPlatforms(LOOK, new Set(['joomla'])), false)
  assert.equal(onPlatforms({ id: 'z' }, new Set(['joomla'])), false)
})

test("a card's platforms come in the filter's order, whatever order the door sent", () => {
  assert.deepEqual(platformsOf(DEV_29_09[3]), ['joomla', 'wordpress', 'emdash'])
  assert.deepEqual(platformsOf({ platforms: ['shopify', 'wordpress'] }), ['wordpress'])
  assert.deepEqual(platformsOf(LOOK), [])
  assert.deepEqual(platformsOf({}), [])
})
