// The customer's logo and favicon (src/lib/brand.ts, TCH #1013 T24/T25a): which picture a spot shows in which theme,
// and when the template's own icon is printed beside EmDash's.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brandLogos, logoSpots, templateIconWanted } from '../src/lib/brand.ts'
import { shareImageOf } from '../src/lib/share-image.ts'

const LIGHT = '/_emdash/api/media/file/logo-light.png'
const DARK_VALUE = {
  id: 'm2',
  provider: 'local',
  meta: { storageKey: 'logo-dark.png' },
  src: 'https://x.example/d.png'
}
const DARK = '/_emdash/api/media/file/logo-dark.png'

test('the light logo comes from core settings, the dark one from the chrome entry field', () => {
  const logos = brandLogos(
    { title: 'Tamarind', logo: { mediaId: 'm1', url: LIGHT, alt: 'Tamarind logo' } },
    DARK_VALUE,
    'Tamarind'
  )
  assert.deepEqual(logos, { light: LIGHT, dark: DARK, alt: 'Tamarind logo' })
})

test('missing pictures are null, never made up; the alt falls back to the name, then the site title', () => {
  assert.deepEqual(brandLogos({}, undefined, 'Tamarind'), { light: null, dark: null, alt: 'Tamarind' })
  assert.deepEqual(brandLogos({ title: 'Site' }, null, ''), { light: null, dark: null, alt: 'Site' })
  assert.deepEqual(brandLogos(null, null, null), { light: null, dark: null, alt: '' })
  // a reference EmDash could not resolve (media deleted) has no url: no picture
  assert.equal(brandLogos({ logo: { mediaId: 'gone' } }, null, 'x').light, null)
  assert.equal(brandLogos({}, { id: 'only-an-id' }, 'x').dark, null)
})

test('a themed spot shows each theme its own picture, and the text where a theme has none', () => {
  const both = { light: LIGHT, dark: DARK, alt: 'a' }
  assert.deepEqual(logoSpots(both, 'themed'), [
    { kind: 'image', src: LIGHT, theme: 'light' },
    { kind: 'image', src: DARK, theme: 'dark' }
  ])
  assert.deepEqual(
    logoSpots({ light: LIGHT, dark: null, alt: 'a' }, 'themed'),
    [
      { kind: 'image', src: LIGHT, theme: 'light' },
      { kind: 'text', theme: 'dark' }
    ],
    'a light logo is never put on a dark header'
  )
  assert.deepEqual(logoSpots({ light: null, dark: DARK, alt: 'a' }, 'themed'), [
    { kind: 'text', theme: 'light' },
    { kind: 'image', src: DARK, theme: 'dark' }
  ])
})

test('no logo at all is the demo markup: the text lockup once, in every theme', () => {
  const none = { light: null, dark: null, alt: 'a' }
  assert.deepEqual(logoSpots(none, 'themed'), [{ kind: 'text', theme: 'any' }])
  assert.deepEqual(logoSpots(none, 'dark'), [{ kind: 'text', theme: 'any' }])
})

test('a spot that is dark in both themes takes only the dark logo', () => {
  assert.deepEqual(logoSpots({ light: LIGHT, dark: DARK, alt: 'a' }, 'dark'), [
    { kind: 'image', src: DARK, theme: 'any' }
  ])
  assert.deepEqual(logoSpots({ light: LIGHT, dark: null, alt: 'a' }, 'dark'), [
    { kind: 'text', theme: 'any' }
  ])
})

test("the template's icon is printed only while the customer has no favicon", () => {
  assert.equal(templateIconWanted({}), true)
  assert.equal(templateIconWanted(null), true)
  assert.equal(
    templateIconWanted({ favicon: { mediaId: 'gone' } }),
    true,
    'an unresolved reference prints nothing'
  )
  assert.equal(
    templateIconWanted({ favicon: { mediaId: 'f', url: '/_emdash/api/media/file/fav.png' } }),
    false
  )
})

// 🔒 THE CUSTOMER'S SHARE CARD WINS OVER A PAGE'S HERO PICTURE (TCH #1013, D5). Measured 10/10/2026 on dev
// (g55-biz-emd-full, 1.7.4): every page without a picture shared the logo card, but the home page shared its generated
// hero photograph, because Home passed `hero_image` as its own share picture. A hero is decoration; an article's or a
// project's picture is what the link is about, so that one is kept.
test('the share picture: an own picture is kept, a hero gives way to the customer’s share card', () => {
  const CARD = '/_emdash/api/media/file/share-card.png'
  const withCard = { seo: { defaultOgImage: { mediaId: 's1', url: CARD } } }
  assert.equal(shareImageOf(withCard, { hero: '/hero.jpg' }), CARD, 'a hero gives way to the card')
  assert.equal(
    shareImageOf(withCard, { own: '/article.jpg' }),
    '/article.jpg',
    'an article keeps its picture'
  )
  assert.equal(shareImageOf(withCard, {}), CARD)
  assert.equal(shareImageOf({}, { hero: '/hero.jpg' }), '/hero.jpg', 'no card: the hero, as the demo shared')
  assert.equal(shareImageOf(null, {}), null)
  assert.equal(
    shareImageOf({ seo: { defaultOgImage: { mediaId: 'gone' } } }, { hero: '/hero.jpg' }),
    '/hero.jpg',
    'a card EmDash could not resolve is no card'
  )
})
