/**
 * PREVIEW-PARITY keys a block by its place among siblings of the same tag and class. Try on writes the
 * slot as a Joomla module (mod_custom "Tracy design system", style System-none) into the contract's
 * position, so on a template whose position is a module column (JA Rent: topbar-1) the slot's own
 * `div.mod-custom` lands beside the template's `div.mod-custom`. The popup carries the slot another way,
 * so the template's block was keyed `div.mod-custom` there and `div.mod-custom:2` after Try on, and was
 * reported missing from the popup at 390px (JA Rent 1.0.4, dot 3, 19/10/2026) although both show it at the
 * same size. The slot's carrier is not page content: it is left out of the sibling count.
 * A block the popup really hides is still a difference.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { compareParity } from '../scripts/preview-parity/compare.mjs'
import { PARITY_PROBE } from '../scripts/preview-parity/probe.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

const SLOT = '<style id="tracy-ds-slot">/* tracy-ds-slot: refero:test */ body { color: #111 }</style>'
const page = (/** @type {string} */ carrier, /** @type {string} */ css = '') =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head>${carrier ? '' : SLOT}<style>
  body { margin: 0; font: 16px/1.5 sans-serif } .topbar-1 { width: 100% } .mod-custom { min-height: 48px }
  ${css}</style></head><body><div id="t3-topbar"><div class="container"><div class="row"><div class="topbar-1">${carrier}
  <div class="mod-custom custom"><div class="ja-mobile-info">Toll free +4 38 555 1258 658</div></div>
  </div><p class="hours">Open daily 8 am to 10 pm</p></div></div></div><section class="main" style="min-height:400px">Content</section></body></html>`)}`
// Try on: the slot as a module rendered in the template's own module column
const TRY_ON = `<div id="mod-custom999" class="mod-custom custom">${SLOT}</div>`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9694)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url) => {
  await chrome.open(url, 390)
  return chrome.evaluate(PARITY_PROBE)
}

test(
  'PREVIEW-PARITY: the slot module Try on writes beside a template module shifts no key',
  opts,
  async () => {
    const tryOn = await read(page(TRY_ON))
    const popup = await read(page(''))
    const r = compareParity(popup, tryOn)
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    // the true catch stays: the popup hides the template's block
    const hid = await read(page('', '.topbar-1 .mod-custom { display: none }'))
    const h = compareParity(hid, tryOn)
    assert.ok(
      h.findings.some((/** @type {any} */ f) => f.kind === 'box' && /mod-custom|t3-topbar/.test(f.at)),
      JSON.stringify(h.findings)
    )
  }
)
