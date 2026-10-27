/**
 * button-role (BTN-1) and a row cell (ROW_CELL, 17/10/2026). JA Impact's header "Donate now" is a
 * square, full-height green block flush with the bordered menu cells of the same row; Akemi decided it
 * stays square under every system (its fill follows the accent). The detector flagged its square corner
 * against the system's pill. A button that fills its header or menu row, top to bottom, beside bordered
 * cells is a row cell: its corner is the row's, only its colours are judged. A free button, and a button
 * in a header that is shorter than its row, are still judged on their corner.
 * The probe runs in a real headless Chrome. Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/button-role.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

const ACCENT = '#0cb76d'
const SYSTEM = [ACCENT, '#ffffff', '#1d3677']
const ROOT = `:root{--ds-btn-radius:26px;--ds-c-accent:${ACCENT}}body{margin:0;background:#fff;font:16px sans-serif}`
/** The bordered menu row of JA Impact's header, 66 px tall, with the call to action at its right. */
const ROW = (/** @type {string} */ action) =>
  `<header><div class="row" style="display:flex;justify-content:space-between;align-items:center;height:66px;padding:0 32px;background:#1d3677">` +
  `<nav><ul style="display:flex;margin:0;padding:0;list-style:none">` +
  ['Home', 'About', 'Events']
    .map(
      (w) =>
        `<li><a href="#" style="display:flex;align-items:center;height:66px;padding:0 32px;border-right:1px solid #444;color:#fff">${w}</a></li>`
    )
    .join('') +
  `</ul></nav><div class="header-action">${action}</div></div></header>`
const page = (/** @type {string} */ body) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>${ROOT}</style></head><body>${body}</body></html>`)}`
/** A square accent button of the given height. */
const BUTTON = (/** @type {number} */ h) =>
  `<a class="btn btn-success" href="#" style="display:flex;align-items:center;height:${h}px;padding:0 32px;border:0;border-radius:0;background:${ACCENT};color:#fff">Donate now</a>`

test(
  'button-role: a flush full-height cell of a bordered header row is a row cell; free or shorter buttons are still judged',
  opts,
  async () => {
    const chrome = await browser(9662)
    try {
      const read = async (/** @type {string} */ body) => {
        await chrome.open(page(body), 800)
        const data = await chrome.evaluate(probe)
        return { data, r: detect({ worn: { data }, plain: { data }, systemColours: SYSTEM }) }
      }
      // (1) JA Impact: the header Donate now fills the 66 px menu row beside its bordered cells
      const cell = await read(ROW(BUTTON(66)))
      const donate = cell.data.buttons.find((/** @type {any} */ b) => b.text === 'Donate now')
      assert.equal(donate?.cell, true, 'the flush header block is a row cell')
      assert.equal(cell.r.count, 0, 'its square corner is the row corner')
      // (2) a free button that lost the system's corner
      const free = await read(`<main style="padding:40px">${BUTTON(44)}</main>`)
      assert.equal(free.data.buttons[0].cell, undefined)
      assert.equal(free.r.count, 1)
      assert.match(free.r.findings[0].why, /corner 0px where the system's button has 2\dpx/)
      // (3) a button inside the header row but shorter than it: a free call to action
      const short = await read(ROW(BUTTON(44)))
      const b = short.data.buttons.find((/** @type {any} */ x) => x.text === 'Donate now')
      assert.equal(b?.cell, undefined, 'a 44 px button in a 66 px row is not a cell')
      assert.equal(short.r.count, 1)
      assert.match(short.r.findings[0].why, /corner 0px/)
      // a row cell is still judged on its colours
      const off = await read(ROW(BUTTON(66).replace(`background:${ACCENT}`, 'background:#d3b298')))
      assert.equal(off.r.count, 1)
      assert.match(off.r.findings[0].why, /fill #d3b298 is none of the system's colours/)
      assert.doesNotMatch(off.r.findings[0].why, /corner/)
    } finally {
      await chrome.close()
    }
  }
)
