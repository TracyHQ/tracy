/**
 * The platform glyph of a Sources row (`src/client/source-logo.tsx`): the source kind picks it, then the host of its
 * address, else the generic website globe. Every glyph is monochrome (currentColor). Places and links are fictional.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-source-logo.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SOURCE_LOGO_PATHS, sourceLogoKey } from '../src/client/source-logo.ts'

const CASES = [
  ['instagram', null, 'instagram'],
  ['instagram-search', null, 'instagram'],
  ['facebook', null, 'facebook'],
  ['facebook-search', null, 'facebook'],
  ['tiktok', null, 'tiktok'],
  ['youtube', null, 'youtube'],
  ['tripadvisor', null, 'tripadvisor'],
  ['google-places', null, 'maps'],
  ['google-maps', null, 'maps'],
  ['whatsapp', null, 'whatsapp'],
  ['website', 'https://sample.example/', 'website'],
  // A listing or a plain link names its platform by host.
  ['listing', 'https://www.tripadvisor.com/Restaurant-Sample', 'tripadvisor'],
  ['listing', 'https://m.facebook.com/sample', 'facebook'],
  ['url', 'https://youtu.be/sample', 'youtube'],
  ['url', 'https://maps.app.goo.gl/Sample', 'maps'],
  ['url', 'https://wa.me/10000000000', 'whatsapp'],
  // No shipped glyph: the generic globe.
  ['listing', 'https://www.magicpin.example/sample', 'website'],
  ['listing', 'https://notinstagram.com/sample', 'website'],
  ['listing', null, 'website'],
  ['listing', 'javascript:alert(1)', 'website'],
  ['unknown-kind', 'not a url', 'website']
]
for (const [source, ref, want] of CASES)
  test(`${source} ${ref ?? '(no address)'} reads as ${want}`, () => {
    assert.equal(sourceLogoKey(source, ref), want)
  })

test('every brand glyph has a path, and the website globe is drawn by the icon set', () => {
  assert.deepEqual(Object.keys(SOURCE_LOGO_PATHS).sort(), [
    'facebook',
    'google',
    'instagram',
    'maps',
    'tiktok',
    'tripadvisor',
    'whatsapp',
    'youtube'
  ])
  for (const d of Object.values(SOURCE_LOGO_PATHS)) assert.match(d, /^M/)
})
