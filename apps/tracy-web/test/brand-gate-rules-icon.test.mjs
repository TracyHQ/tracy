// save_brand_file gate: one focused failing case per rule of the icon mark: the blind check, the icon colours,
// the plate fallback and the attempt limits. Each case breaks exactly one thing in a passing invented case.
import { test } from 'node:test'
import { iconPng, withFiles } from './_brand-gate-files.mjs'
import { assertNames, expectRejected, lookOf } from './_brand-gate-rules.mjs'

const attempt = (brand, i = 0) => brand.logo.mark.icon.attempts[i]

const ROWS = [
  [
    'blind verdict is recomputed from the three guesses',
    '2-words-only',
    ({ brand }) => {
      attempt(brand).blind.guesses = ['car wash', 'zoo', 'bank']
    },
    'logo.mark.icon.attempts[0].blind.verdict'
  ],
  [
    'the matched position is recomputed',
    '2-words-only',
    ({ brand }) => {
      attempt(brand).blind.matchedPosition = 1
    },
    'logo.mark.icon.attempts[0].blind.matchedPosition'
  ],
  [
    'the blind check runs at 128 px',
    '2-words-only',
    ({ brand }) => {
      attempt(brand).blind.size = 32
    },
    'logo.mark.icon.attempts[0].blind.size'
  ],
  [
    'a neighbour business is not a pass',
    '2-words-only',
    ({ brand }) => {
      Object.assign(brand.logo.mark.icon, { neighbour: 'pilates studio', neighbourAccept: [] })
    },
    'logo.mark.icon.attempts[0].blind.verdict'
  ],
  [
    'the icon takes the logo colours in order',
    '5-bakery-words',
    ({ brand }) => {
      brand.logo.mark.icon.colours = ['#6b3a1f']
    },
    'logo.mark.icon.colours',
    /logo's colours/
  ],
  [
    'an icon without a logo takes the accent',
    '3-no-logo',
    ({ brand }) => {
      brand.logo.mark.icon.colours = ['#123456']
    },
    'logo.mark.icon.colours',
    /colours\.accent/
  ],
  [
    'every icon pixel is one of its colours',
    '5-bakery-words',
    async ({ c }) => ({
      files: withFiles(c, { [c.brand.logo.mark.file]: await iconPng(['#6b3a1f', '#00ff00']) })
    }),
    'logo.mark.file',
    /outside/
  ],
  [
    'plate fallback needs 3:1 between icon and plate',
    '5-bakery-words',
    ({ brand }) => {
      attempt(brand).plate = { shape: 'circle', iconColour: '#6b3a1f', plateColour: '#c0562b', ratio: 2.05 }
    },
    'logo.mark.icon.attempts[0].plate.ratio',
    /3:1/
  ],
  [
    'plate ratio is recomputed',
    '5-bakery-words',
    ({ brand }) => {
      attempt(brand).plate = { shape: 'circle', iconColour: '#6b3a1f', plateColour: '#c0562b', ratio: 4 }
    },
    'logo.mark.icon.attempts[0].plate.ratio',
    /recomputed/
  ],
  [
    'at most three drawn icon attempts',
    '2-words-only',
    ({ brand }) => {
      const a = attempt(brand)
      brand.logo.mark.icon.attempts.unshift(
        ...[1, 2, 3].map(() => ({
          ...structuredClone(a),
          verdict: 'fail',
          blind: { ...a.blind, verdict: 'fail', matchedPosition: null, guesses: ['x', 'y', 'z'] }
        }))
      )
    },
    'logo.mark.icon.attempts',
    /at most 3 drawn/
  ],
  [
    'the passing attempt is the mark file',
    '2-words-only',
    ({ brand }) => {
      attempt(brand).file = 'icon/other.png'
    },
    'logo.mark.icon.attempts',
    /logo\.mark\.file/
  ],
  [
    'the icon look has a passing blind check',
    '2-words-only',
    ({ brand }) => {
      for (const l of lookOf(brand, 'icon/icon-1.png'))
        l.checks = l.checks.filter((c) => !c.check.startsWith('blind:'))
    },
    'logo.mark.file',
    /blind/
  ],
  [
    'blind looks are shown at 128 px',
    '2-words-only',
    ({ brand }) => {
      lookOf(brand, 'icon/icon-1.png')[0].shownAt = 32
    },
    'logo.look (blind)'
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
