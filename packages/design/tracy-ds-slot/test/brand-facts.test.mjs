import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BRAND_FACTS_SCHEMA,
  brandFactDifferences,
  brandFactsOf,
  stemOf,
  visibleSpotOf
} from '../src/brand-facts.mjs'

const LIGHT = 'header jd-logo.jd-logo--light.wp-block-site-logo'
const DARK = 'header jd-logo.jd-logo--dark.wp-block-site-logo'
const up = (/** @type {string} */ f) => `http://localhost/wp-content/uploads/2026/10/${f}`
const marks = { site_logo: 'gallery-1', tracy_logo_dark: 'gallery-2', site_icon: 'gallery-3' }

/** The answers of a JA Diner-like theme: a light spot on site_logo and a dark one on tracy_logo_dark. */
const pair = () => ({
  demo: {
    logos: [{ wrapper: LIGHT, src: up('jd-site-logo.png'), width: 128, height: 80, visible: true }],
    icons: []
  },
  marked: {
    logos: [
      { wrapper: LIGHT, src: up('gallery-1-300x200.jpg'), width: 128, height: 85, visible: true },
      { wrapper: DARK, src: up('gallery-2.jpg'), width: 128, height: 85, visible: false }
    ],
    icons: [
      { rel: 'icon', href: up('gallery-3-32x32.jpg') },
      { rel: 'icon', href: up('gallery-3-192x192.jpg') },
      { rel: 'apple-touch-icon', href: up('gallery-3-180x180.jpg') }
    ]
  },
  marks,
  cleared: {
    texts: {
      [LIGHT]: { text: 'JA Diner', img: false, title: true },
      [DARK]: { text: 'JA Diner', img: false, title: true }
    }
  },
  reshaped: { logos: [{ wrapper: LIGHT, src: up('wide.png'), width: 128, height: 40, visible: true }] },
  reshapedMark: 'wide'
})

test('a stem names an upload whatever size WordPress printed', () => {
  assert.equal(stemOf(up('gallery-1-300x200.jpg')), 'gallery-1')
  assert.equal(stemOf(up('photo-scaled.jpg?ver=2')), 'photo')
})

test('a pair theme: each spot by the option it reads, the name in both when they are empty', () => {
  const f = brandFactsOf(pair())
  assert.deepEqual(f.spots, [
    { where: DARK, option: 'tracy_logo_dark' },
    { where: LIGHT, option: 'site_logo' }
  ])
  assert.equal(f.logos, 'pair')
  assert.equal(f.brandReady, true)
  assert.equal(f.darkLogo, true)
  assert.equal(f.nameFallback, true)
  assert.equal(f.faviconReady, true)
  assert.equal(f.favicons, 2)
  assert.deepEqual(f.frame, { width: 128, height: 80 })
  // a wide picture drew 40 high where the demo logo drew 80: the picture's own shape sets the height
  assert.equal(f.heightHeld, false)
  // the spot to reshape is the one visible in the light scheme, never the hidden dark one
  assert.equal(visibleSpotOf(f, pair().marked)?.where, LIGHT)
})

test('one spot on tracy_logo_dark is a dark theme; one on site_logo a single; none says none', () => {
  const dark = pair()
  dark.marked.logos = [dark.marked.logos[1]]
  assert.equal(brandFactsOf(dark).logos, 'dark')
  const single = pair()
  single.marked.logos = [single.marked.logos[0]]
  assert.equal(brandFactsOf(single).logos, 'single')
  const none = pair()
  none.marked.logos = []
  const f = brandFactsOf(none)
  assert.equal(f.logos, 'none')
  assert.equal(f.brandReady, false)
  assert.equal(f.nameFallback, false, 'no spot: nothing falls back')
})

test('a spot that keeps a picture when its option is empty has no name fallback; a held height is held', () => {
  const a = pair()
  a.cleared.texts[DARK] = { text: '', img: true, title: false }
  assert.equal(brandFactsOf(a).nameFallback, false)
  const b = pair()
  b.reshaped = { logos: [{ wrapper: LIGHT, src: up('wide.png'), width: 256, height: 80, visible: true }] }
  assert.equal(brandFactsOf(b).heightHeld, true)
  // no image of another shape in the library: not measured, never guessed
  assert.equal(brandFactsOf({ ...pair(), reshaped: null, reshapedMark: null }).heightHeld, null)
})

test('two versions differ by the facts a row holds; equal facts carry the row', () => {
  const doc = (/** @type {string} */ version, /** @type {any} */ facts) => ({
    schemaVersion: BRAND_FACTS_SCHEMA,
    version,
    facts
  })
  const facts = brandFactsOf(pair())
  assert.deepEqual(brandFactDifferences(doc('1.0.0', facts), doc('1.0.1', structuredClone(facts))), [])
  const moved = { ...facts, frame: { width: 128, height: 60 }, logos: 'single' }
  assert.deepEqual(brandFactDifferences(doc('1.0.0', facts), doc('1.0.1', moved)), [
    'logos: 1.0.0 "pair", 1.0.1 "single"',
    'frame: 1.0.0 {"width":128,"height":80}, 1.0.1 {"width":128,"height":60}'
  ])
  assert.match(brandFactDifferences(null, doc('1.0.1', facts))[0], /not a tracy-brand-facts/)
})
