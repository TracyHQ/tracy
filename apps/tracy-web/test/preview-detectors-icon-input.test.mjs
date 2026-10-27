/**
 * icon-invisible (ICON-1) reads a control with no words. A submit or button input writes its words in
 * its value, not in a text node, and the probe took JA Kinetic Joomla's footer Subscribe (black on the
 * light side's blue, 5.8:1) for a wordless control whose fill read 2.87:1 against the footer
 * (14/10/2026). The probe runs in a real headless Chrome on two small pages: the worded input is not a
 * control the rule reads, a wordless icon button painted into its ground still is.
 * Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/icon-invisible.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

/** A footer with one control; `fill` is the control's fill, `bar` the colour of an icon's bars. */
const page = (/** @type {string} */ control) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#ece6d0"><footer style="padding:40px;background:#ece6d0">${control}</footer></body></html>`)}`
const WORDED = (/** @type {string} */ fill) =>
  `<input type="submit" class="btn button" value="Subscribe" style="width:134px;height:45px;border:0;background:${fill};color:#000">`
const ICON = (/** @type {string} */ bar) =>
  `<button class="menu-toggle" aria-label="Menu" style="width:40px;height:40px;border:0;background:transparent;padding:10px"><span style="display:block;height:3px;background:${bar}"></span><span style="display:block;height:3px;margin-top:5px;background:${bar}"></span></button>`

test(
  'icon-invisible: a worded submit input is not read as a wordless control; an icon in its ground is',
  opts,
  async () => {
    const chrome = await browser(9655)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html), 800)
        return chrome.evaluate(probe)
      }
      // the template's own page: the button stands out from the footer, the icon's bars are dark
      const plainInput = await read(WORDED('#4d7c0f'))
      const plainIcon = await read(ICON('#10140f'))
      // the worn page: a light-side blue close to the footer ground (2.8:1), bars the footer's own colour
      const wornInput = await read(WORDED('#6786c4'))
      const wornIcon = await read(ICON('#ece6d0'))
      assert.equal(wornInput.length, 0, 'the worded Subscribe input is not a wordless control')
      assert.equal(plainInput.length, 0)
      const broken = detect({ worn: { data: wornIcon }, plain: { data: plainIcon } })
      assert.equal(broken.count, 1, 'the menu icon painted into its ground is found')
      const clean = detect({ worn: { data: plainIcon }, plain: { data: plainIcon } })
      assert.equal(clean.count, 0, 'the same icon in its own dark bars is clean')
    } finally {
      await chrome.close()
    }
  }
)
