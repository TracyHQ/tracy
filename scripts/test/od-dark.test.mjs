/**
 * The dark rules of `build-od-dark.mjs`, pinned without a DOM: which literals count, which do not,
 * and the two verdicts a fixture can get.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { darkReport, literalColors, luminance, parseColor, rulesOf } from '../lib/od-dark-rules.mjs'

test('parseColor: hex, rgb(), hsl(), a few names; var() is not a colour', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 })
  assert.deepEqual(parseColor('#00000080').a.toFixed(2), '0.50')
  assert.deepEqual(parseColor('rgba(255,255,255,0.72)'), { r: 255, g: 255, b: 255, a: 0.72 })
  assert.equal(Math.round(parseColor('hsl(0, 0%, 100%)').r), 255)
  assert.equal(parseColor('white').r, 255)
  assert.equal(parseColor('var(--bg)'), null)
})

test('luminance: white is 1, black is 0, cream is light', () => {
  assert.equal(luminance(parseColor('#fff')), 1)
  assert.equal(luminance(parseColor('#000')), 0)
  assert.ok(luminance(parseColor('#fbf6ee')) > 0.9)
  assert.ok(luminance(parseColor('#171a21')) < 0.02)
})

test('literalColors: every stop of a gradient, nothing from a token', () => {
  assert.equal(literalColors('linear-gradient(135deg, #fbf6ee 0%, #fffdf8 58%, #f1e3cf 100%)').length, 3)
  assert.equal(literalColors('var(--bg)').length, 0)
  assert.equal(literalColors('rgba(0,0,0,0.12)').length, 1)
})

test('rulesOf: style rules and inline styles, media wrappers unwrapped, comments dropped', () => {
  const html =
    '<style>/* x */ .a { color: #111 } @media (max-width: 600px) { .b { background: #fff } }</style><div style="background:#eee"></div>'
  const rules = rulesOf(html)
  assert.deepEqual(
    rules.map(([s]) => s),
    ['.a', '.b', '@inline']
  )
})

test("darkReport: the paper wrapper is the override's job; a light block or dark ink elsewhere is not", () => {
  const paper =
    '<style>.page{background:linear-gradient(135deg,#fbf6ee,#f1e3cf)} .card{background:var(--surface)}</style>'
  assert.equal(darkReport(paper).safe, true, 'Artistic-shaped: literal only on .page')
  const input = '<style>.field input{background:#ffffff}</style>'
  assert.equal(darkReport(input).safe, false)
  assert.equal(darkReport(input).lightBg.length, 1)
  const ink = '<style>.hero h1{color:#0b0b0b}</style>'
  assert.equal(darkReport(ink).darkText.length, 1)
  const accent = '<style>.btn{background:#ff385c;color:#fff}</style>'
  assert.equal(darkReport(accent).safe, true, 'a saturated accent and white text read fine on dark')
  const mix = '<style>.btn:hover{background:color-mix(in oklab, var(--bg), white 4%)}</style>'
  assert.equal(darkReport(mix).safe, true, 'color-mix follows its token')
  const faint = '<style>.x{background:rgba(255,255,255,0.08)}</style>'
  assert.equal(darkReport(faint).safe, true, 'a faint white wash is not a block')
})
