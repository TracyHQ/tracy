// save_brand_file gate: the shape rules of the name and logo variants, the looks and the spots.
// Each case breaks one thing in a passing invented case and expects the field named.
import { test } from 'node:test'
import { assertNames, del, expectRejected, lookOf, put } from './_brand-gate-rules.mjs'

/** Rows: [title, case id, mutate, expected field, optional why regex]. */
const ROWS = [
  ['the material is an object', '1-padel', put('logo.material', 'logo.png'), 'logo.material'],
  [
    'the material names the brief logo',
    '1-padel',
    put('logo.material.mediaId', 'other'),
    'logo.material.mediaId'
  ],
  ['the material width is an integer', '1-padel', put('logo.material.width', '10px'), 'logo.material.width'],
  [
    'the material says if it has alpha',
    '1-padel',
    put('logo.material.hasAlpha', 'yes'),
    'logo.material.hasAlpha'
  ],
  ['the material says what it reads as', '1-padel', put('logo.material.readsAs', 4), 'logo.material.readsAs'],
  [
    'the material ground is a colour or transparent',
    '1-padel',
    put('logo.material.ground', 'blue'),
    'logo.material.ground'
  ],
  ['the name has its two-line record', '1-padel', del('logo.name.twoLines'), 'logo.name.twoLines'],
  ['the logos have their two-line record', '1-padel', del('logo.logos.twoLines'), 'logo.logos.twoLines'],
  [
    'both sides of the two-line logos are named',
    '3-no-logo',
    del('logo.logos.twoLines.light'),
    'logo.logos.twoLines.light'
  ],
  [
    'no two-line logo at all is null',
    '1-padel',
    put('logo.logos.twoLines', { light: null, dark: null }),
    'logo.logos.twoLines',
    /null/
  ],
  ['looks are a non-empty array', '1-padel', put('logo.look', []), 'logo.look'],
  ['a look names its ground', '1-padel', put('logo.look.0.ground', 'white'), 'logo.look[0].ground'],
  ['a look has a verdict', '1-padel', put('logo.look.0.verdict', 'ok'), 'logo.look[0].verdict', /pass\|fail/],
  ['a look has checks', '1-padel', put('logo.look.0.checks', []), 'logo.look[0].checks'],
  ['a check has its parts', '1-padel', put('logo.look.0.checks.0', { check: 'x' }), 'logo.look[0].checks[0]'],
  [
    'a passing look has only passing checks',
    '1-padel',
    put('logo.look.0.checks.0.verdict', 'fail'),
    'logo.look[0].verdict',
    /pass only/
  ],
  [
    'the icon is looked at on each side it is worn on',
    '2-words-only',
    ({ brand }) => {
      lookOf(brand, 'recoloured/mark.dark.png').at(-1).verdict = 'fail'
    },
    'logo.mark (icon on dark)'
  ],
  ['spots are an array', '1-padel', put('logo.spots', 'none'), 'logo.spots'],
  ['a spot is a kit spot', '1-padel', put('logo.spots.0.spot', 'nowhere'), 'logo.spots[0].spot'],
  [
    'a spot does not show a demo logo',
    '1-padel',
    put('logo.spots.0.file', 'images/joomlart/demo.png'),
    'logo.spots[0].file'
  ],
  [
    'a spot shows a known kind',
    '1-padel',
    put('logo.spots.0.shows', 'banner'),
    'logo.spots[0].shows',
    /logo \| logo-2-lines/
  ],
  [
    'a spot ground is the kit ground',
    '1-padel',
    put('logo.spots.0.ground', '#abcdef'),
    'logo.spots[0].ground'
  ],
  [
    'a spot says if it is writable',
    '1-padel',
    put('logo.spots.0.writable', (w) => !w),
    'logo.spots[0].writable'
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
