/**
 * The Sources of a place before its research has any row (`src/client/source-links-model.ts`): one row per link the
 * owner pasted, and the Google listing when the place was picked in a search. All places and links are fictional.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-source-links.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  overviewSourcesOf,
  pastedLinksOf,
  safeHttpUrl,
  shortUrl,
  sourcesToShow
} from '../src/client/source-links-model.ts'

const PASTED = {
  provider: 'url',
  candidate: {
    pastedLinks: [
      { source: 'instagram', url: 'https://www.instagram.com/sample_kite_club' },
      { source: 'google-places', url: 'https://maps.app.goo.gl/SampleKiteClub' },
      { source: 'listing', url: 'https://www.listing.example/dubai/sample-kite-club' },
      { source: 'listing', url: 'https://www.other-listing.example/sample-kite-club' }
    ]
  }
}

test('a place added by its links lists each pasted link, Not collected yet, in the order they were saved', () => {
  const rows = sourcesToShow([], PASTED)
  assert.deepEqual(
    rows.map((r) => [r.source, r.pastedLink, r.status]),
    [
      ['instagram', 'https://www.instagram.com/sample_kite_club', null],
      ['google-places', 'https://maps.app.goo.gl/SampleKiteClub', null],
      ['listing', 'https://www.listing.example/dubai/sample-kite-club', null],
      ['listing', 'https://www.other-listing.example/sample-kite-club', null]
    ]
  )
  assert.equal(
    rows.some((r) => r.fromSearch),
    false
  )
})

test('a place picked in a search adds its Google listing first, with the links pasted beside it', () => {
  const searched = {
    provider: 'google-places',
    candidate: { pastedLinks: [{ source: 'instagram', url: 'https://www.instagram.com/sample_kite_club' }] }
  }
  const rows = sourcesToShow([], searched)
  assert.deepEqual(
    rows.map((r) => [r.source, r.fromSearch === true]),
    [
      ['google-places', true],
      ['instagram', false]
    ]
  )
  assert.deepEqual(
    sourcesToShow([], { provider: 'google-places', candidate: {} }).map((r) => r.source),
    ['google-places']
  )
})

test("once research has rows, they are shown as they are: the links are research's own rows by then", () => {
  const research = [{ source: 'website', status: 'complete' }]
  assert.deepEqual(sourcesToShow(research, PASTED), research)
})

test('an older candidate without pastedLinks gives its listings, and its website and social pages when a link was its identity', () => {
  const old = {
    provider: 'url',
    candidate: {
      website: 'https://kite-club.example/',
      socials: { instagram: 'https://www.instagram.com/sample_kite_club' },
      listings: [{ url: 'https://www.listing.example/sample-kite-club' }]
    }
  }
  assert.deepEqual(
    pastedLinksOf(old).map((l) => l.source),
    ['listing', 'website', 'instagram']
  )
  // A Google place as identity: its website and socials are Google's, not pasted.
  assert.deepEqual(
    pastedLinksOf({ ...old, provider: 'google-places' }).map((l) => l.source),
    ['listing']
  )
})

test('nothing usable: no rows, and an address that is not http is never a link', () => {
  assert.deepEqual(sourcesToShow([], null), [])
  assert.deepEqual(
    sourcesToShow([], {
      provider: 'url',
      candidate: { pastedLinks: [{ source: 'website', url: 'javascript:alert(1)' }] }
    }),
    []
  )
})

test('a listing added before research has its own row; the other pasted links stay beside it (#537)', () => {
  const opp = {
    candidate: {
      pastedLinks: [
        { url: 'https://www.instagram.com/sample_kite_club', source: 'instagram' },
        { url: 'https://www.listing.example/dubai/sample-kite-club', source: 'listing' }
      ]
    }
  }
  const rows = sourcesToShow([{ source: 'listing', status: 'failed' }], opp)
  assert.deepEqual(
    rows.map((r) => `${r.source}:${r.status}`),
    ['instagram:null', 'listing:failed']
  )
})

test('the overview lists only collected sources after research, every pasted link before it', () => {
  const shown = [
    { source: 'instagram', status: 'complete' },
    { source: 'website', status: 'skipped', reason: 'not_found' },
    { source: 'tripadvisor', status: 'failed' },
    { source: 'google-maps', status: 'blocked' }
  ]
  assert.deepEqual(
    overviewSourcesOf(shown, true).map((s) => s.source),
    ['instagram']
  )
  assert.equal(overviewSourcesOf(shown, false).length, 4)
})

test('only http and https addresses become links, shown as host and path with an ellipsis', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), null)
  assert.equal(safeHttpUrl('data:text/html,x'), null)
  assert.equal(safeHttpUrl('not a url'), null)
  assert.equal(safeHttpUrl(null), null)
  assert.equal(safeHttpUrl('https://www.instagram.com/sample_club'), 'https://www.instagram.com/sample_club')
  assert.equal(shortUrl('https://www.instagram.com/sample_club/'), 'instagram.com/sample_club')
  assert.equal(shortUrl('https://sample.example/a?x=1#top'), 'sample.example/a')
  const long = shortUrl(`https://sample.example/${'a'.repeat(80)}`)
  assert.equal(long.length, 48)
  assert.ok(long.endsWith('\u2026'))
})
