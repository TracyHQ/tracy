/**
 * `tracy_design_inspiration.json` — what a release says about the card it puts on Design
 * inspiration, and every way that file is refused.
 *
 * The card left `tracy_setting.json` on 16/09 because the two files answer to different owners: the
 * setting is install truth a provision reads and nobody edits after a release is cut, the card is
 * presentation an administrator changes from ops without re-cutting anything.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DESIGN_INSPIRATION_SCHEMA, validateDesignInspiration } from '../src/tracy-setting.mjs'

const good = () => ({
  schemaVersion: DESIGN_INSPIRATION_SCHEMA,
  template: 'tracy-business',
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'Industrial / B2B company site: services, portfolio, news, careers, contact.',
  image: 'business-home-1440.png',
  languages: ['en', 'ru'],
  nav: 'top-left',
  hero: 'split',
  dark: true,
  vi: false,
  layouts: [
    {
      key: 'home',
      label: 'Home',
      path: '/',
      shots: { desktop: 'business-home-1440.png', mobile: 'business-home-390.png' }
    },
    {
      key: 'services',
      label: 'Services',
      path: '/services',
      count: 12,
      shots: { desktop: 'business-services-1440.png' }
    }
  ]
})

test('a well-formed design inspiration has no problems', () => {
  assert.deepEqual(validateDesignInspiration(good()), [])
  assert.equal(DESIGN_INSPIRATION_SCHEMA, 'tracy-design-inspiration/v1')
})

test('the optional half may all be left out — a card is provider, category, blurb, image, layouts', () => {
  const doc = good()
  for (const key of ['languages', 'nav', 'hero', 'dark', 'vi', 'count']) delete doc[key]
  delete doc.layouts[1].count
  assert.deepEqual(validateDesignInspiration(doc), [])
})

test('anything that is not an object is refused before a field is read', () => {
  assert.deepEqual(validateDesignInspiration(null), ['not an object'])
  assert.deepEqual(validateDesignInspiration([]), ['not an object'])
  assert.deepEqual(validateDesignInspiration('{}'), ['not an object'])
})

test('a schemaVersion Tracy does not know is refused, and the sentence says which one it wanted', () => {
  const doc = good()
  doc.schemaVersion = 'tracy-setting/v1'
  const problems = validateDesignInspiration(doc)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /schemaVersion must be tracy-design-inspiration\/v1/)
})

test('every required field of the header is held to shape, and all of them at once', () => {
  const doc = good()
  doc.template = 'Tracy Business'
  doc.provider = 'Acme'
  doc.category = ''
  doc.blurb = 7
  doc.image = 'home.gif'
  assert.deepEqual(validateDesignInspiration(doc), [
    'template must be a template id like tracy-business',
    'provider must be one of Tracy, JoomlArt',
    'category must name a category of Design templates',
    'blurb must be the sentence a reader sees on the card',
    'image must be a picture file name like home-1440.png'
  ])
})

test('a missing field reads the same as a wrong one — the card cannot be drawn either way', () => {
  const doc = good()
  for (const key of ['template', 'provider', 'category', 'blurb', 'image']) delete doc[key]
  assert.equal(validateDesignInspiration(doc).length, 5)
})

test('demo is refused outright: the live demo belongs to the server that serves the card', () => {
  const doc = good()
  doc.demo = { url: 'https://business-emdash.tracy.ai', version: '1.0.0' }
  const problems = validateDesignInspiration(doc)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /demo is the server's, not the file's/)
})

test('a card with no layout has nothing to show', () => {
  const empty = good()
  empty.layouts = []
  assert.deepEqual(validateDesignInspiration(empty), [
    'layouts must list at least one layout — a card with no layout has nothing to show'
  ])
  const missing = good()
  delete missing.layouts
  assert.equal(validateDesignInspiration(missing).length, 1)
})

test('each layout is held to key, label, path and a desktop shot, and the problem names the index', () => {
  const doc = good()
  doc.layouts = [{ key: 'HOME', label: 7, path: 'about', count: 0, shots: {} }]
  assert.deepEqual(validateDesignInspiration(doc), [
    'layouts[0].key must be a key like home',
    'layouts[0].label must say what a person sees on the tab',
    'layouts[0].path must be a path on the demo, starting with /',
    'layouts[0].count must be a whole number of pages, 1 or more',
    'layouts[0].shots.desktop must be a picture file name like home-1440.png'
  ])
})

test('a mobile shot is optional, but a mobile shot that is not a picture name is refused', () => {
  const doc = good()
  doc.layouts[0].shots.mobile = '../../etc/passwd'
  assert.deepEqual(validateDesignInspiration(doc), [
    'layouts[0].shots.mobile must be a picture file name like home-390.png'
  ])
})

test('two layouts cannot share a key — the tabs would be one tab', () => {
  const doc = good()
  doc.layouts[1].key = 'home'
  assert.deepEqual(validateDesignInspiration(doc), ['layouts[1].key "home" is already a layout of this card'])
})

test('a layout that is not an object says so instead of listing five missing fields', () => {
  const doc = good()
  doc.layouts = ['home']
  assert.deepEqual(validateDesignInspiration(doc), ['layouts[0] must be a layout: key, label, path, shots'])
})

test('the filter traits are a closed list, because the filter offers exactly those buttons', () => {
  const doc = good()
  doc.nav = 'hamburger'
  doc.hero = 'carousel'
  doc.dark = 'yes'
  doc.vi = 1 // retired trait (f4097d2d5): a card that still carries it validates
  doc.languages = 'en'
  assert.deepEqual(validateDesignInspiration(doc), [
    'languages must be a list of language tags',
    'nav must be one of top-left, top-centered, brand-centered, overlay, sidebar',
    'hero must be one of split, centered, cover, stack',
    'dark must be true or false'
  ])
})
