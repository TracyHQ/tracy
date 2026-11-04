// save_brand_file gate: one focused failing case per rule of the icon mark: the icon colours,
// the plate fallback and the attempt limits. Each case breaks exactly one thing in a passing invented case.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBrandFile } from '../src/brand-step/save-brand-file.js'
import { iconPng, loadCase, withFiles } from './_brand-gate-files.mjs'
import { assertNames, expectRejected } from './_brand-gate-rules.mjs'

const attempt = (brand, i = 0) => brand.logo.mark.icon.attempts[i]

const ROWS = [
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
          verdict: 'fail'
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
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}

test('gate: an icon attempt with no blind data passes when its looks pass', async () => {
  const c = await loadCase('2-words-only')
  const brand = structuredClone(c.brand)
  assert.equal('blind' in attempt(brand), false)
  assert.equal('businessType' in brand.logo.mark.icon, false)
  const r = await checkBrandFile({ brandFile: brand, brief: c.brief, kit: c.kit, files: c.files })
  assert.deepEqual(r.rejected ?? [], [])
  assert.equal(r.ok, true)
})
