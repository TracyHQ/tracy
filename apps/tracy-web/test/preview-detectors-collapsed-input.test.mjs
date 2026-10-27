/**
 * collapsed-button reads an input's label against the room Chrome gives it. A label wider than the
 * input's content box is not centred any more: Chrome starts it at the content box's left and clips it
 * at the padding box's right. The probe measured it against the content box alone and called JA
 * Kinetic Joomla's footer Subscribe (130 × 45 px, 34 px of padding each side, 65 px of words in a
 * 60 px content box) "label cut" on every page, while the visitor reads it whole (15/10/2026). The
 * probe runs in a real headless Chrome on the measured shapes of that button and of ja-voyara's
 * Subscribe disc (42 × 42 px, 18 px type), which really shows "Subs".
 * Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/collapsed-button.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

const page = (/** @type {string} */ control) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#f2f4ee"><footer style="padding:40px">${control}</footer></body></html>`)}`
/** JA Kinetic Joomla's footer Subscribe as measured on the demo (AcyMailing, `input.btn.btn-primary.button.subbutton`). */
const KINETIC = (/** @type {string} */ value) =>
  `<input type="button" class="btn btn-primary button subbutton" value="${value}" style="box-sizing:border-box;width:130px;height:45px;padding:0 34px;border:1px solid transparent;border-radius:9px;background:#4d7c0f;color:#fff;font:600 14px/16.8px sans-serif">`
/** ja-voyara's newsletter Subscribe under a system: a 42 px disc. */
const VOYARA =
  '<input type="submit" class="btn btn-primary button" value="Subscribe" style="box-sizing:border-box;width:42px;height:42px;padding:0 12px;border:0;border-radius:50%;background:#333;color:#fff;font:18px sans-serif">'

test(
  'collapsed-button: an input label that spills into its padding is whole; one past the padding box is cut',
  opts,
  async () => {
    const chrome = await browser(9656)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html), 800)
        return chrome.evaluate(probe)
      }
      const kinetic = await read(KINETIC('Subscribe'))
      assert.equal(kinetic.length, 1)
      assert.equal(kinetic[0].clipped, false, "Kinetic's Subscribe reads whole")
      assert.equal(detect({ worn: { data: kinetic }, plain: { data: kinetic } }).count, 0)
      const long = await read(KINETIC('Subscribe to the dispatch'))
      assert.equal(long[0].clipped, true, 'words past the padding box are cut')
      const voyara = await read(VOYARA)
      const r = detect({ worn: { data: voyara }, plain: { data: kinetic } })
      assert.equal(r.count, 1, "ja-voyara's Subscribe disc is still found")
      assert.equal(r.findings[0].why, 'label cut')
    } finally {
      await chrome.close()
    }
  }
)
