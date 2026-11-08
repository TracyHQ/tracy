// JA Voyara's light pill on its accent call bands (BTN-1, measurement of 1.0.12, 07/11/2026): the tour
// layout's "Reserve" button (.voy-tour-cta__btn.btn-white, css/tour.css) is filled with --ds-c-surface on a
// band painted --ds-c-accent-band. The surface role says nothing about the band: under Figma's dark side
// the surface is #212121 and the band #151444, 1.07:1, so the preview probe read the button as lost on
// the four tour pages. The slot contract names the band buttons with the band's own pair instead: the
// fill is the band's words colour (on-accent-band, 4.5:1 on the band by construction), the label the band.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = {
  figma: 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  stripe: 'od:stripe'
}
// the preview probe's own floor for a fill that still draws a shape (design-system-preview-probe.js)
const SHAPE = 1.25
// the white pills set on a band painted --ds-c-accent-band, each with the template's fill role
// (the blog's .voy-cta-band is a kept band: the band machine paints its buttons)
const BAND_BUTTONS = ['.voy-tour-cta__btn.btn-white', '.voy-art-cta .btn-white']
const contract = loadContract('joomla-ja-voyara')
const sheet = (id) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, contract), contract).css

/** Each value a sheet gives one role variable, in order (one per side of the switch). */
const valuesOf = (css, name) => [...css.matchAll(new RegExp(`${name}:(#[0-9a-f]{6})`, 'gi'))].map((m) => m[1])
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The role a band button's fill takes in the sheet: the contract's follow rule, else the template's surface. */
const fillRoleOf = (css, selector) =>
  new RegExp(`${escape(selector)}[^{]*\\{[^}]*background-color:var\\(--ds-c-([a-z-]+)\\)`).exec(css)?.[1] ??
  'surface'

test('the band buttons keep their shape on the accent band, on both sides of every system', () => {
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const css = sheet(id)
    const bands = valuesOf(css, '--ds-c-accent-band')
    assert.equal(bands.length, 2, `${key}: both sides`)
    for (const selector of BAND_BUTTONS) {
      const role = fillRoleOf(css, selector)
      const fills = valuesOf(css, `--ds-c-${role}`)
      bands.forEach((band, i) => {
        assert.ok(
          contrast(fills[i], band) >= SHAPE,
          `${key} side ${i}: ${selector} fill ${role} ${fills[i]} on band ${band}`
        )
      })
    }
  }
})

test('the band buttons label reads on their fill: the band colour on the band words colour', () => {
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const css = sheet(id)
    for (const selector of BAND_BUTTONS)
      assert.match(
        css,
        new RegExp(`${escape(selector)}[^{]*\\{[^}]*color:var\\(--ds-c-accent-band\\)`),
        `${key}: ${selector}`
      )
    const bands = valuesOf(css, '--ds-c-accent-band')
    const words = valuesOf(css, '--ds-c-on-accent-band')
    bands.forEach((band, i) => assert.ok(contrast(band, words[i]) >= 4.5, `${key} side ${i}`))
  }
})
