/**
 * Two LANG classes the Template Customization Question Readiness built-site check missed on round g60 (10/10/2026): JA Essence Joomla printed "Tháng sáu 9, 2023" (a
 * Vietnamese month NAME before the day) beside the pack's "09 Tháng sáu 2023", and `dates` passed because it knew only a month
 * NUMBER before the day; and the heading font Jost has no Vietnamese glyphs ("đề" drawn as "đê" and a loose accent), which no
 * check read at all.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'

import { wrongDates } from '../lib/template-customization-question-readiness-built-site/dates-and-styles.mjs'
import { glyphGaps } from '../lib/template-customization-question-readiness-built-site/font-glyphs.mjs'

const doc = (/** @type {string} */ text) => parseHTML(`<html><body><p>${text}</p></body></html>`).document

test('g60: a Vietnamese month name before the day is a wrong date; the pack’s own day-first form is not', () => {
  assert.deepEqual(wrongDates(doc('Tháng sáu 9, 2023'), 'vi'), ['Tháng sáu 9, 2023'])
  assert.deepEqual(wrongDates(doc('Tháng Mười Hai 14, 2023'), 'vi-VN'), ['Tháng Mười Hai 14, 2023'])
  assert.deepEqual(wrongDates(doc('Tháng mười một 2, 2023'), 'vi'), ['Tháng mười một 2, 2023'])
  assert.deepEqual(wrongDates(doc('09 Tháng sáu 2023'), 'vi'), [])
  assert.deepEqual(wrongDates(doc('9 tháng 6, 2023'), 'vi'), [])
  assert.deepEqual(wrongDates(doc('Tháng sáu 2023'), 'vi'), [])
})

const JOST = new URL(
  '../../packages/cms/tracy-wordpress-theme/overlays/wp-ja-essence/assets/fonts/jost-400.woff2',
  import.meta.url
)

/** A Vietnamese page whose headings are set in `family`, its faces given as CSS. */
const page = (
  /** @type {string} */ faces,
  /** @type {string} */ uses = 'h2 { font-family: Jost, sans-serif; }'
) =>
  parseHTML(
    `<html><head><style>${faces} ${uses}</style></head><body><h2>Đề nghị hợp tác</h2><p>Liên hệ</p></body></html>`
  ).document

test('g60: a heading font whose file has no Vietnamese glyphs is named, with the letters it cannot draw', async () => {
  const { readFileSync } = await import('node:fs')
  const gaps = await glyphGaps({
    doc: page('@font-face { font-family: "Jost"; src: url("/fonts/jost-400.woff2") format("woff2"); }'),
    lang: 'vi',
    sheets: [],
    fetchText: async () => '',
    fetchBytes: async () => new Uint8Array(readFileSync(JOST))
  })
  assert.deepEqual(
    gaps.map((g) => [g.family, g.subset]),
    [['jost', 'vietnamese']]
  )
  for (const letter of ['ề', 'ợ', 'ị']) assert.ok(gaps[0].missing.includes(letter), `${letter} is named`)
})

test('Google faces cut by unicode-range are judged by their ranges; a family with a vietnamese face, or unused, passes', async () => {
  const latin =
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329'
  const ext =
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF'
  const vi =
    'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB'
  const google = [
    `@font-face { font-family: 'Jost'; src: url(https://fonts.gstatic.com/j1.woff2); unicode-range: ${ext}; }`,
    `@font-face { font-family: 'Jost'; src: url(https://fonts.gstatic.com/j2.woff2); unicode-range: ${latin}; }`,
    `@font-face { font-family: 'Noto Serif'; src: url(https://fonts.gstatic.com/n1.woff2); unicode-range: ${vi}; }`,
    `@font-face { font-family: 'Noto Serif'; src: url(https://fonts.gstatic.com/n2.woff2); unicode-range: ${latin}; }`
  ].join('\n')
  const doc = parseHTML(
    `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto+Serif%3A400%2C700%7CJost"><style>h2{font-family:Jost} p{font-family:"Noto Serif"}</style></head><body><h2>Đề nghị</h2><p>Liên hệ đề nghị</p></body></html>`
  ).document
  const asked = []
  const gaps = await glyphGaps({
    doc,
    lang: 'vi-VN',
    sheets: [],
    fetchText: async (url, headers) => (asked.push([url, headers?.['user-agent'] ?? '']), google),
    fetchBytes: async () => null
  })
  assert.deepEqual(
    gaps.map((g) => [g.family, g.missing]),
    [['jost', ['ề', 'ị', 'ệ']]],
    'Jost lacks the vietnamese face; Đ is in its latin-ext one; Noto Serif has the vietnamese face'
  )
  assert.match(asked[0][1], /Chrome/, 'Google is asked as a browser, which gets the faces cut by range')
  const unused = await glyphGaps({
    doc: page(google, 'p{font-family:"Noto Serif"}'),
    lang: 'vi',
    sheets: [],
    fetchText: async () => '',
    fetchBytes: async () => null
  })
  assert.deepEqual(unused, [], 'a family the page never uses is not judged')
  assert.deepEqual(
    await glyphGaps({
      doc: page(google),
      lang: 'en',
      sheets: [],
      fetchText: async () => '',
      fetchBytes: async () => null
    }),
    []
  )
})

test('a font file that cannot be read judges nothing', async () => {
  const gaps = await glyphGaps({
    doc: page('@font-face { font-family: "Jost"; src: url("/fonts/jost-400.woff2"); }'),
    lang: 'vi',
    sheets: [],
    fetchText: async () => '',
    fetchBytes: async () => new Uint8Array([1, 2, 3])
  })
  assert.deepEqual(gaps, [])
})
