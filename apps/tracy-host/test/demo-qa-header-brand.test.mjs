/**
 * `header-brand`: the header shows the business — its collected logo when the research has one, its name when it
 * has none — and a header that lost its brand block fails. Tin Lantern's header lost both logo and name and QuillHaus's
 * kept the template's, with the research holding a logo for each, and no check said so (local stand 24/10/2026).
 * And a stylesheet "no longer loaded" says what removed it: WordPress loads a block's sheet only with the block.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHECK_IDS, checkCssIntact, checkHeaderBrand, collectedOf } from '../src/demo-qa.js'

const page = (over = {}) => ({ path: '/', url: 'http://x/', status: 200, error: null, loadMs: 1, ...over })
const LOGO = 'wp-content/uploads/tracy-content/aa11.png'
const PHOTO = 'wp-content/uploads/tracy-content/bb22.jpg'
const asked = (collected, placedSources = {}) => ({ collected: collectedOf(collected), placedSources })
const brand = (over = {}) => ({ found: true, images: [], text: '', ...over })

test('header-brand: the collected logo in the header passes; the name alone, or another picture, does not', () => {
  const withLogo = asked(
    { name: 'Tin Lantern Saigon', logo: 'm-logo' },
    { [LOGO]: '$logo', [PHOTO]: 'm-photo' }
  )
  const shown = checkHeaderBrand(
    [page({ brand: brand({ images: [{ src: `http://x/${LOGO}`, alt: '' }] }) })],
    withLogo
  )
  assert.equal(shown.pass, true, JSON.stringify(shown.detail))
  const nameOnly = checkHeaderBrand([page({ brand: brand({ text: 'Tin Lantern Saigon' }) })], withLogo)
  assert.equal(nameOnly.pass, false)
  assert.equal(nameOnly.detail[0].code, 'LOGO_NOT_IN_HEADER')
  assert.equal(nameOnly.detail[0].file, LOGO)
  const photo = checkHeaderBrand(
    [page({ brand: brand({ images: [{ src: `http://x/${PHOTO}`, alt: 'Tin Lantern Saigon' }] }) })],
    withLogo
  )
  assert.equal(photo.detail[0].code, 'LOGO_NOT_IN_HEADER')
  assert.ok(CHECK_IDS.includes('header-brand'))
})

test("header-brand: the sweep's fitted copy of the logo passes when the page read matches it to the logo", () => {
  // The Willow Nook (lrsweep rig, 25/10/2026): the sweep fits the imported logo to the template's logo box and sets
  // that copy, under tracy-brand/, as the header logo; the imported file itself is never in the header.
  const FITTED = 'wp-content/uploads/tracy-brand/logo-0d10.png'
  const withLogo = asked({ name: 'The Willow Nook', logo: 'm-logo' }, { [LOGO]: '$logo' })
  const header = brand({ images: [{ src: `http://x/${FITTED}`, alt: 'The Willow Nook' }] })
  const fitted = (matches) => ({ matches, logo: `http://x/${FITTED}`, source: `http://x/${LOGO}` })
  const same = checkHeaderBrand([page({ brand: header, fittedLogo: fitted(true) })], withLogo)
  assert.equal(same.pass, true, JSON.stringify(same.detail))
  const other = checkHeaderBrand([page({ brand: header, fittedLogo: fitted(false) })], withLogo)
  assert.equal(other.detail[0]?.code, 'LOGO_NOT_IN_HEADER')
  const none = checkHeaderBrand([page({ brand: header })], withLogo)
  assert.equal(none.detail[0]?.code, 'LOGO_NOT_IN_HEADER')
})

test("header-brand: WordPress's own size rendition of the logo file counts as the logo", () => {
  // The Willow Nook build 8c (25/10/2026): the site-logo block rendered aa11-150x150.png, WordPress's cut of the
  // imported logo, and the check called it another picture; the agent then replaced the template's site-logo block.
  const withLogo = asked({ name: 'The Willow Nook', logo: 'm-logo' }, { [LOGO]: '$logo' })
  const cut = LOGO.replace(/\.png$/, '-150x150.png')
  const shown = checkHeaderBrand(
    [page({ brand: brand({ images: [{ src: `http://x/${cut}`, alt: '' }] }) })],
    withLogo
  )
  assert.equal(shown.pass, true, JSON.stringify(shown.detail))
  const other = LOGO.replace(/aa11\.png$/, 'aa12-150x150.png')
  const wrong = checkHeaderBrand(
    [page({ brand: brand({ images: [{ src: `http://x/${other}`, alt: '' }] }) })],
    withLogo
  )
  assert.equal(wrong.detail[0]?.code, 'LOGO_NOT_IN_HEADER')
})

test('header-brand: a logo the research collected but the build never imported is named by its media id', () => {
  const check = checkHeaderBrand(
    [page({ brand: brand({ text: 'Tin Lantern Saigon' }) })],
    asked({ name: 'Tin Lantern Saigon', logo: 'm-logo' }, { [PHOTO]: 'm-photo' })
  )
  assert.deepEqual(
    check.detail.map((d) => [d.code, d.logo]),
    [['LOGO_NOT_PLACED', 'm-logo']]
  )
  assert.match(check.detail[0].fix, /import/i)
})

test('header-brand: a header with no brand block fails, logo or not', () => {
  for (const collected of [{ name: 'QuillHaus' }, { name: 'QuillHaus', logo: 'm-logo' }]) {
    const check = checkHeaderBrand(
      [page({ brand: { found: false, images: [], text: '' } })],
      asked(collected, { [LOGO]: '$logo' })
    )
    assert.equal(check.pass, false)
    assert.equal(check.detail[0].code, 'BRAND_MISSING')
  }
})

test('header-brand: with no logo collected, the business name in the brand passes and another name fails', () => {
  const noLogo = asked({ name: 'Pho Ba Corner' })
  assert.equal(checkHeaderBrand([page({ brand: brand({ text: 'PHO BA CORNER' }) })], noLogo).pass, true)
  // A logo image whose text names the business is its name too.
  assert.equal(
    checkHeaderBrand(
      [page({ brand: brand({ images: [{ src: 'http://x/a.png', alt: 'Pho Ba Corner' }] }) })],
      noLogo
    ).pass,
    true
  )
  const other = checkHeaderBrand([page({ brand: brand({ text: 'Tracy Base' }) })], noLogo)
  assert.equal(other.detail[0].code, 'BRAND_NAME_MISSING')
})

test('header-brand: a run that names nothing collected, or reads no header, judges nothing', () => {
  assert.equal(checkHeaderBrand([page({ brand: { found: false } })], {}).pass, true)
  assert.equal(checkHeaderBrand([page()], asked({ name: 'QuillHaus' })).pass, true)
})

test('css-intact: a block stylesheet no longer loaded names the block that was removed', () => {
  const baseline = { cssRules: { 'wp-includes/blocks/site-title/style.min.css': { rules: 2, page: '/' } } }
  const check = checkCssIntact([page({ sheets: [] })], baseline)
  assert.equal(check.pass, false)
  assert.match(check.detail[0].fix, /site-title/)
  assert.match(check.detail[0].fix, /block/)
  const theme = checkCssIntact([page({ sheets: [] })], {
    cssRules: { 'wp-content/themes/tracy/style.css': { rules: 9, page: '/' } }
  })
  assert.doesNotMatch(theme.detail[0].fix ?? '', /block/)
})
