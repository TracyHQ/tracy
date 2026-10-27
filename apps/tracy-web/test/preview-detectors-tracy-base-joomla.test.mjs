/**
 * Two findings Tracy Base Joomla 1.0.4's preview kept on every system while the visitor saw nothing wrong
 * (16/10/2026), each a probe reading the template's own design as the wear's fault:
 * - template-fonts-left (FONT-2): the demo logo sets its name in an SVG <text> with its own face on every
 *   page; lettering drawn inside an SVG is the picture's, not a text block.
 * - unstyled-input (FORM-1): the archive's month select and the category list's limit select sit bare in a
 *   chip whose outline is a box-shadow ring (--tracy-ring); the ring is the box's line.
 * The probes run in a real headless Chrome. Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import {
  detect as fontsLeft,
  probe as fontsProbe
} from '../scripts/preview-detectors/template-fonts-left.mjs'
import { detect as unstyled, probe as inputProbe } from '../scripts/preview-detectors/unstyled-input.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }
const page = (/** @type {string} */ body, bg = '#ffffff') =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:${bg}">${body}</body></html>`)}`

const LOGO =
  '<a class="logo"><svg width="150" height="32" viewBox="0 0 150 32"><text x="42" y="21" font-family="Template Display, sans-serif" font-size="17">Tracy Base</text></svg></a>'

test('template-fonts-left: the lettering of an SVG logo is not a text block', opts, async () => {
  const chrome = await browser(9657)
  try {
    const read = async (/** @type {string} */ html) => {
      await chrome.open(page(html), 1200)
      return chrome.evaluate(fontsProbe)
    }
    const plain = await read(`${LOGO}<p style="font-family:'Template Text'">Words of the template</p>`)
    assert.equal(plain.families['template display'], undefined, 'the SVG lettering is left out')
    const worn = await read(`${LOGO}<p style="font-family:'IBM Plex Sans'">Words of the system</p>`)
    const slot = '<style id="tracy-ds-slot">:root{--ds-font-body:"IBM Plex Sans"}</style>'
    assert.equal(fontsLeft({ worn: { data: worn, html: slot }, plain: { data: plain } }).count, 0)
    // a paragraph still in the template's face is still found
    const left = await read(
      `${LOGO}<p style="font-family:'IBM Plex Sans'">Words of the system</p><p style="font-family:'Template Text'">Words of the template</p>`
    )
    assert.equal(fontsLeft({ worn: { data: left, html: slot }, plain: { data: plain } }).count, 1)
  } finally {
    await chrome.close()
  }
})

const CHIP = (/** @type {string} */ ring) =>
  `<div style="padding:40px"><label style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:#eae5cc;box-shadow:${ring}"><select name="month" style="min-height:44px;width:60px;border:0;background:transparent;color:#000"><option>Month</option></select></label></div>`

test(
  'unstyled-input: a bare select inside a chip outlined by a box-shadow ring is seen as a field',
  opts,
  async () => {
    const chrome = await browser(9658)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html, '#f4efd4'), 1200)
        return chrome.evaluate(inputProbe)
      }
      const ringed = await read(CHIP('0 0 0 1px #a19e8c'))
      assert.equal(unstyled({ worn: { data: ringed }, plain: { data: ringed } }).count, 0)
      // the same chip with no ring and a fill barely off the page is still not seen
      const bare = await read(CHIP('none'))
      const r = unstyled({ worn: { data: bare }, plain: { data: bare } })
      assert.equal(r.count, 1)
      assert.match(r.findings[0].why, /not seen as a field/)
      // a soft shadow (a blur, an offset) draws no line
      const soft = await read(CHIP('0 2px 8px #a19e8c'))
      assert.equal(unstyled({ worn: { data: soft }, plain: { data: soft } }).count, 1)
    } finally {
      await chrome.close()
    }
  }
)
