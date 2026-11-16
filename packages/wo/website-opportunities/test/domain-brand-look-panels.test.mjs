// The accent reads on every ground a side of the template paints, its panels too (run 7 of the release gate): a template
// paints cards, bands and footers on grounds of their own beside the main ground of a side, and an accent held only to
// the main ground read under 3:1 there. The adjusted logo colour (D44: the hue kept, the lightness moved) is held to every
// ground the kit declares, `site.brandColours.sides[].panels` included, and a side without panels is read as its main
// ground. Invented brands and an invented kit; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-look-panels.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { brandLookOf } from '../domain/brand-before-site.mjs'
import {
  MIN_RATIO,
  contrastRatioOf as contrastOf,
  hexOfOklch,
  hueDistance,
  oklchOf
} from '../domain/brand-hue.mjs'
import { adjustedAccentOf } from '../domain/brand-look-adjust.mjs'
import { groundsOf, sideGroundsOf } from '../domain/brand-look-kit.mjs'
import { lemonGroveCider } from './fixtures/plan-composer/invented-brands.mjs'

const MAIN = '#121212'
const PANELS = ['#1b1a1a', '#232222']
/** An invented dark only template whose side paints two panel grounds lighter than its main ground. */
const panelKit = ({ panels = PANELS } = {}) => ({
  ref: 'example-ring@1.0.0',
  doc: {
    site: {
      brandColours: {
        primary: { value: '#cc3344', wordsOn: ['#ffffff', '#000000'] },
        sides: [{ marker: 'base', ground: MAIN, groundSide: 'dark', ...(panels ? { panels } : {}) }]
      }
    }
  }
})

/** A green of one hue that reads at least 3:1 on the main ground and under it on the lightest panel. */
function borderlineGreen() {
  for (let L = 0.3; L < 0.8; L += 0.002) {
    const hex = hexOfOklch(L, 0.08, 165)
    if (contrastOf(hex, MAIN) >= MIN_RATIO && contrastOf(hex, PANELS[1]) < MIN_RATIO) return hex
  }
  throw new Error('no borderline colour')
}

const withLogo = (hex) => {
  const brand = lemonGroveCider()
  brand.brief.brand.colors = [{ hex, role: 'accent' }]
  return brand
}

test('the grounds of a side are its main ground and its panels; no panels reads the main ground only', () => {
  assert.deepEqual(groundsOf(panelKit(), 'dark'), [MAIN, ...PANELS])
  assert.deepEqual(groundsOf(panelKit({ panels: null }), 'dark'), [MAIN])
  assert.deepEqual(sideGroundsOf({ ground: '#ABCDEF', panels: ['#abcdef', 'not a colour', '#000000'] }), [
    '#abcdef',
    '#000000'
  ])
})

test('a logo colour that reads on the main ground but not on a panel is made lighter until it reads on every panel', () => {
  const green = borderlineGreen()
  assert.ok(contrastOf(green, MAIN) >= MIN_RATIO)
  assert.ok(contrastOf(green, PANELS[1]) < MIN_RATIO)
  const record = brandLookOf({ ...withLogo(green), kit: panelKit() })
  assert.equal(record.accent.from, 'logo-adjusted')
  assert.notEqual(record.accent.hex, green)
  for (const ground of [MAIN, ...PANELS])
    assert.ok(contrastOf(record.accent.hex, ground) >= MIN_RATIO, `${record.accent.hex} on ${ground}`)
  assert.ok(hueDistance(oklchOf(green).h, oklchOf(record.accent.hex).h) < 3, 'the hue is kept')
  assert.ok(oklchOf(record.accent.hex).L > oklchOf(green).L, 'lighter on a dark side')
  assert.match(record.accent.say, /lighter/)
})

test('the same colour on a kit that declares no panels stays as it is', () => {
  const green = borderlineGreen()
  const adjusted = adjustedAccentOf(green, panelKit({ panels: null }))
  assert.equal(adjusted.accents.dark, green)
  assert.equal(adjusted.moved.dark, null)
})
