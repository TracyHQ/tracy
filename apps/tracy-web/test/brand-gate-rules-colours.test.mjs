// save_brand_file gate: one focused failing case per rule of the colours (accent only, decisions C, 8 and 9).
// Each case breaks exactly one thing in a passing invented case and expects the field named.
import { test } from 'node:test'
import { assertNames, expectRejected } from './_brand-gate-rules.mjs'

const ROWS = [
  [
    'accent is the lifted colour the build made (contrast 3:1 on the opening ground)',
    '1-padel',
    ({ brand }) => {
      brand.colours.accent = '#0f884e'
    },
    'colours.accent',
    /colours\.lift\.to/
  ],
  [
    'the lift is recomputed, never picked',
    '1-padel',
    ({ brand }) => {
      brand.colours.lift.to = '#119955'
    },
    'colours.lift.to'
  ],
  [
    'a colour that needs a lift records it',
    '5-bakery-words',
    ({ brand }) => {
      brand.colours.lift = null
    },
    'colours.lift'
  ],
  [
    'lift lightness numbers are recomputed',
    '1-padel',
    ({ brand }) => {
      brand.colours.lift.lightnessTo = 0.5
    },
    'colours.lift.lightnessFrom/To'
  ],
  [
    'black is never an accent',
    '2-words-only',
    ({ brand }) => {
      brand.colours.brandColour = '#1a1a1a'
    },
    'colours.brandColour',
    /black/
  ],
  [
    'grey is never an accent',
    '4-black-grey-symbol',
    ({ brand }) => {
      Object.assign(brand.colours, { decision: 'new-accent', brandColour: '#8a8a8a', builds: 1 })
    },
    'colours.brandColour',
    /grey/
  ],
  [
    'an accent must come from the brief colours',
    '1-padel',
    ({ brand }) => {
      brand.colours.brandColour = '#336699'
    },
    'colours.brandColour',
    /not one of brief/
  ],
  [
    'the replaced colour is the template accent',
    '1-padel',
    ({ brand }) => {
      brand.colours.replaces = '#000000'
    },
    'colours.replaces'
  ],
  [
    'only the accent changes',
    '1-padel',
    ({ brand }) => {
      brand.colours.bg = '#ffffff'
    },
    'colours.bg'
  ],
  [
    'backgrounds and text colours are kept',
    '1-padel',
    ({ brand }) => {
      brand.colours.keeps = 'brand'
    },
    'colours.keeps'
  ],
  [
    'only accent colours shift',
    '1-padel',
    ({ brand }) => {
      brand.colours.shifts[0].colour = 'text'
    },
    'colours.shifts[0].colour'
  ],
  [
    'a shift starts from the built accent',
    '1-padel',
    ({ brand }) => {
      brand.colours.shifts[0].from = '#ffffff'
    },
    'colours.shifts[0].from'
  ],
  [
    'kept-template builds nothing',
    '3-no-logo',
    ({ brand }) => {
      brand.colours.builds = 1
    },
    'colours.builds'
  ],
  [
    'kept-template keeps the template accent',
    '3-no-logo',
    ({ brand }) => {
      brand.colours.accent = '#0f884d'
    },
    'colours.accent'
  ],
  [
    'a built module has a sane size',
    '1-padel',
    ({ brand }) => {
      brand.colours.module.bytes = 0
    },
    'colours.module.bytes'
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
