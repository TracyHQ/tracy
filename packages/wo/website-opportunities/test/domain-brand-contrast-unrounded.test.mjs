// The 3:1 checks of the look record compare the plain WCAG ratio, never a rounded one (ticket #616, second review 13/11): white
// on #ae8d8f reads 2.997:1, which two decimals round up to 3.00. Rounding stays for display only. Invented kit colours.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-contrast-unrounded.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrastOf, contrastRatioOf, MIN_RATIO } from '../domain/brand-hue.mjs'
import { adjustedAccentOf } from '../domain/brand-look-adjust.mjs'
import { wordsOnAccentOf } from '../domain/brand-look-kit.mjs'

const kit = (ground, groundSide = 'light') => ({
  doc: {
    site: { brandColours: { sides: [{ marker: 'body', ground, groundSide }], primary: { wordsOn: [] } } }
  }
})

test('the unrounded ratio sits under 3:1 where the rounded one shows 3.00', () => {
  assert.equal(contrastOf('#ffffff', '#ae8d8f'), 3)
  const plain = contrastRatioOf('#ffffff', '#ae8d8f')
  assert.ok(plain < MIN_RATIO && plain > 2.99, String(plain))
  assert.equal(contrastRatioOf('#ffffff', 'nope'), null)
})

test('words on an accent are held to the unrounded ratio', () => {
  assert.equal(wordsOnAccentOf(kit('#ffffff'), '#ae8d8f'), '#000000', 'white reads 2.997:1: black instead')
})

test('every adjusted accent reads 3:1 by the unrounded ratio, on its grounds and under its words', () => {
  for (const hex of ['#c6a4a6', '#c5a799', '#a3b49b', '#d9302c', '#2255cc'])
    for (const ground of ['#ffffff', '#f4efe6']) {
      const out = adjustedAccentOf(hex, kit(ground))
      if (!out) continue
      const accent = out.accents.light
      assert.ok(contrastRatioOf(accent, ground) >= MIN_RATIO, `${hex} on ${ground}: ${accent}`)
      assert.ok(contrastRatioOf(out.onAccent.light, accent) >= MIN_RATIO, `${hex} words on ${accent}`)
    }
})
