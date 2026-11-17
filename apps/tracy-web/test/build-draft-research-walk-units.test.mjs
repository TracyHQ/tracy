// The small pieces a real owner's walk of the build chat's research found wrong (#575, 17/11/2026): link lines that
// flipped all together, a source row carried over from an older research read as done, a failed Google map page that
// hid the place details Google did give, a try later sentence with no time, and found but held facts said as missing.
// Pure; every link is invented.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-research-walk-units.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SET_ASIDE } from '../src/build-draft/gather-links.js'
import { linkProgressOf, linkReadsFrom } from '../src/build-draft/link-reads.js'
import { researchMissingOf } from '../src/build-draft/research-missing.js'
import { TRY_LATER_SAY, tryLaterSay } from '../src/build-draft/spend-limits.js'

const INSTAGRAM = 'https://www.instagram.com/hollowmere.bakery.example/'
const MAPS = 'https://www.google.com/maps/place/Hollowmere+Bakery+Example'

test('while the run goes on, each link flips as its own source is tried by this run', () => {
  const sources = [
    { source: 'instagram', status: 'complete', run: 'done' },
    { source: 'google-places', status: 'complete', run: 'waiting' },
    { source: 'google-maps', status: 'complete', run: 'waiting' }
  ]
  const lines = linkProgressOf([INSTAGRAM, MAPS], { sources })
  assert.deepEqual(
    lines.map((l) => l.state),
    ['read', 'reading'],
    'a row carried over from an older research still reads'
  )
})

test('a Google link reads as read once its place details are in, before its map page', () => {
  const sources = [
    { source: 'google-places', status: 'complete', run: 'done' },
    { source: 'google-maps', status: 'running', run: 'running' }
  ]
  assert.equal(linkProgressOf([MAPS], { sources })[0].state, 'read')
})

test('a Google link whose map page failed but whose place details came back is read', () => {
  const [line] = linkReadsFrom({
    links: [MAPS],
    rows: [
      { source: 'google-places', status: 'complete', coverage: { fetched: 6 } },
      { source: 'google-maps', status: 'failed', reason: 'HTTP_429', coverage: { fetched: 0 } }
    ]
  })
  assert.equal(line.state, 'read', JSON.stringify(line))
})

test('a failed source is said in plain words for its reason, never as a code', () => {
  for (const reason of ['HTTP_402', 'HTTP_429', 'credential_invalid', 'not_found']) {
    assert.ok(SET_ASIDE[reason], reason)
    assert.ok(!/HTTP|_/.test(SET_ASIDE[reason]), SET_ASIDE[reason])
  }
})

test('the try later sentence says when', () => {
  const now = Date.parse('2026-11-17T11:00:00Z')
  assert.equal(
    tryLaterSay('2026-11-17T11:40:00Z', now),
    'I have done this many times in a short while, so I paused here. Please try again in about 40 minutes.'
  )
  assert.match(tryLaterSay('2026-11-18T00:00:00Z', now), /in about 13 hours\.$/)
  assert.equal(tryLaterSay(null, now), TRY_LATER_SAY, 'no time known: the plain sentence')
})

test('what research holds back is said as found but held, apart from what it did not find', () => {
  const missing = researchMissingOf({
    missing: [
      { field: 'prices' },
      { field: 'hours', withheld: [{ reason: 'open-all-day' }] },
      { field: 'googleRating', withheld: [{ reason: 'few-reviews' }] },
      { field: 'source:google-maps' },
      { field: 'prices' }
    ]
  })
  assert.deepEqual(missing, [
    { what: 'opening hours', held: true },
    { what: 'Google rating', held: true },
    { what: 'prices', held: false }
  ])
  assert.deepEqual(researchMissingOf(null), [])
})
