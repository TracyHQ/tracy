/**
 * The last findings that kept the design-system lock closed on the three WordPress role-variable
 * quickstarts (16/10/2026), each a detector reading the template's own design as the system's fault:
 * - TPL-1 / GRAD-1: the status colours the slot writes itself (tokens56 tunes them to the system) are
 *   the system's paint; Tracy Base WordPress's danger swatch (#e15252 under Figma dark) is one.
 * - BTN-1: an inverse button paints its band's words colour, light or dark as those words are.
 * - CLIP-1: a fixed-height button that kept its height and its label shows no padding change.
 * - HIER-2: a heading the template paints in its accent may wear the system's accent.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { detect as buttonDark, inverse } from '../scripts/preview-detectors/button-dark.mjs'
import { sizeChange } from '../scripts/preview-detectors/button-size.mjs'
import { accented, detect as headingQuiet } from '../scripts/preview-detectors/heading-quiet.mjs'
import { slotStatusColours } from '../scripts/preview-detectors/lib/system-palette.mjs'

const rgb = (/** @type {string} */ h) => ({
  r: Number.parseInt(h.slice(1, 3), 16),
  g: Number.parseInt(h.slice(3, 5), 16),
  b: Number.parseInt(h.slice(5, 7), 16),
  a: 1
})

test("slot status colours: the slot's own literal status declarations, never a var() fallback", () => {
  const slot =
    ':root{--wp--preset--color--danger:#e15252;--wp--preset--color--success: #41b26b}' +
    '.x{--ds-c-warn-text:#FC0;--ds-c-danger-bg:#311d1d;color:var(--ds-c-danger, #b01e1e)}' +
    '.y{--wp--preset--color--accent:#4d49fc;--tb-success:var(--x)}'
  assert.deepEqual(slotStatusColours(slot).sort(), ['#311d1d', '#41b26b', '#e15252', '#ffcc00'])
  assert.deepEqual(slotStatusColours(''), [])
})

test("button-dark: Tracy Base's inverse call is the band's words colour, not a dark button", () => {
  const button = (fill, ground, words) => ({
    path: 'section/div/a',
    at: 'a.wp-block-button__link',
    text: 'Start a conversation',
    cls: 'wp-block-button__link',
    fill: rgb(fill),
    ground: rgb(ground),
    words: words ? rgb(words) : undefined
  })
  // the template's dark look: black on its bright blue band, as black as the band's words
  const plain = { data: [button('#000000', '#2997ff', '#000000')] }
  // Figma's dark side: the band's words are white, so is the inverse button
  const worn = { data: [button('#ffffff', '#4d49fc', '#ffffff')] }
  assert.ok(inverse(worn.data[0], plain.data[0]))
  assert.equal(buttonDark({ worn, plain }).count, 0)
  // a black button on a band whose words are white is the dark one: turned white, it is a finding
  const dark = { data: [button('#000000', '#2997ff', '#ffffff')] }
  assert.equal(buttonDark({ worn, plain: dark }).count, 1)
  // an older run without the words colour judges as before
  assert.equal(
    buttonDark({
      worn: { data: [button('#ffffff', '#4d49fc')] },
      plain: { data: [button('#000000', '#2997ff')] }
    }).count,
    1
  )
})

test("button-size: JA Kinetic's 44px hero button keeps its height and its label under Figma's padding", () => {
  const was = { text: 'Start free', w: 136, h: 44, padY: 0, padX: 44, lh: 15, font: 15, bw: 2, radius: 9 }
  assert.equal(sizeChange({ ...was, w: 132, padY: 20, padX: 40, lh: 16, font: 16, radius: 50 }, was), null)
  // the same padding on a box that grew with it is still a blow-up
  assert.match(sizeChange({ ...was, h: 64, padY: 40 }, was), /vertical padding 0 to 40px/)
  // a fixed box too short for its label now is one too
  assert.match(sizeChange({ ...was, padY: 36, lh: 16 }, was), /vertical padding 0 to 36px/)
})

test("heading-quiet: JA Kinetic's accent numerals wear the system's accent, a muted heading is still quiet", () => {
  const ground = rgb('#1f1f1f')
  const heading = (fg) => ({
    path: 'main/span',
    at: 'span.hx-spec-num',
    text: '01',
    fg: rgb(fg),
    ground,
    size: 34
  })
  const plain = {
    data: {
      headings: [{ ...heading('#c6f432'), ground: rgb('#141614') }],
      body: { '#141614': { fg: '#9ba39b' } }
    }
  }
  const worn = (fg) => ({
    data: {
      headings: [heading(fg)],
      body: { '#1f1f1f': { fg: '#e5e5e5' } },
      accents: [rgb('#7e7bf8'), rgb('#4d49fc')]
    }
  })
  assert.ok(accented(heading('#7e7bf8'), plain.data.headings[0], worn('#7e7bf8').data.accents))
  assert.equal(headingQuiet({ worn: worn('#7e7bf8'), plain }).count, 0)
  // the same numerals in a grey the system mutes: quieter than the body, a finding
  assert.equal(headingQuiet({ worn: worn('#6f6f6f'), plain }).count, 1)
  // an accent that does not read as large text (3:1) is no excuse
  assert.equal(accented(heading('#4d49fc'), plain.data.headings[0], worn('#4d49fc').data.accents), false)
})
