// save_brand_file gate: one focused failing case per rule of the logo (name, spots, looks, mark, icon,
// plate contrast). Each case breaks exactly one thing in a passing invented case and expects the field named.
import { test } from 'node:test'
import { assertNames, expectRejected, lookOf } from './_brand-gate-rules.mjs'

const ROWS = [
  [
    'the logo name is the brief name',
    '1-padel',
    ({ brand }) => {
      brand.logo.name.text = 'Palm Terrace'
    },
    'logo.name.text'
  ],
  [
    'the rendered name is the name or its capitals',
    '1-padel',
    ({ brand }) => {
      brand.logo.name.rendersAs = 'Palm'
    },
    'logo.name.rendersAs'
  ],
  [
    'a several-word name records its two-line variant',
    '1-padel',
    ({ brand }) => {
      brand.logo.name.twoLines = null
    },
    'logo.name.twoLines'
  ],
  [
    'two lines are the exact name split at a word',
    '1-padel',
    ({ brand }) => {
      brand.logo.name.twoLines.lines = ['Palm', 'Terrace']
    },
    'logo.name.twoLines.lines'
  ],
  [
    'every kit spot appears once',
    '1-padel',
    ({ brand }) => {
      brand.logo.spots.pop()
    },
    'logo.spots',
    /logo-footer-1/
  ],
  [
    'an unknown spot id is refused',
    '1-padel',
    ({ brand }) => {
      brand.logo.spots[0].spot = 'logo-nowhere'
    },
    'logo.spots[0].spot'
  ],
  [
    'backgrounds never change: spot ground is the kit ground',
    '1-padel',
    ({ brand }) => {
      brand.logo.spots[0].ground = '#010101'
    },
    'logo.spots[0].ground'
  ],
  [
    'the footer logo is not writable in this kit',
    '1-padel',
    ({ brand }) => {
      brand.logo.spots[4].writable = true
    },
    'logo.spots[4].writable'
  ],
  [
    'a demo logo file is never used',
    '1-padel',
    ({ brand }) => {
      brand.logo.spots[0].file = 'images/joomlart/logo/item-1.png'
    },
    'logo.spots[0].file',
    /demo logo/
  ],
  [
    'a spot cannot show a two-line logo without a two-line name',
    '3-no-logo',
    ({ brand }) => {
      brand.logo.name.twoLines = null
    },
    'logo.spots[0].shows',
    /no two-line name/
  ],
  [
    'a shown one-line logo must be listed',
    '1-padel',
    ({ brand }) => {
      brand.logo.logos.light = null
    },
    'logo.logos.light'
  ],
  [
    'an unused two-line logo is not listed',
    '1-padel',
    ({ brand }) => {
      brand.logo.logos.twoLines = { light: 'logo/logo.light.png', dark: null }
    },
    'logo.logos.twoLines.light',
    /unused/
  ],
  [
    'the last look of a shown logo must pass',
    '1-padel',
    ({ brand }) => {
      lookOf(brand, 'logo/logo.light.png').at(-1).verdict = 'fail'
    },
    'logo.logos.light',
    /last look/
  ],
  [
    'a look passes only when every check passed',
    '1-padel',
    ({ brand }) => {
      lookOf(brand, 'logo/logo.light.png')[0].checks[0].verdict = 'fail'
    },
    'logo.look[1].verdict'
  ],
  [
    'a look names the ground it was shown on',
    '1-padel',
    ({ brand }) => {
      lookOf(brand, 'logo/logo.light.png')[0].ground = 'white'
    },
    'logo.look[1].ground'
  ],
  [
    'a cut mark passes the look on its material ground',
    '1-padel',
    ({ brand }) => {
      lookOf(brand, 'mark.png', '#032010').at(-1).verdict = 'fail'
    },
    'logo.mark.file',
    /material's ground/
  ],
  [
    'a mark shown alone passes on that side ground',
    '4-black-grey-symbol',
    ({ brand }) => {
      for (const l of lookOf(brand, 'mark.png', '#ffffff')) l.verdict = 'fail'
    },
    'logo.mark (shown alone on light)'
  ],
  [
    'a lettermark has one or two letters',
    '1-padel',
    ({ brand }) => {
      Object.assign(brand.logo.mark, { decision: 'lettermark', letters: 'PTP' })
    },
    'logo.mark.letters'
  ],
  [
    'the material is the logo the brief found',
    '1-padel',
    ({ brand }) => {
      brand.logo.material.mediaId = 'other'
    },
    'logo.material.mediaId'
  ],
  [
    'no logo in the brief means no material',
    '3-no-logo',
    ({ brand }) => {
      brand.logo.material = { mediaId: 'x' }
    },
    'logo.material'
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
