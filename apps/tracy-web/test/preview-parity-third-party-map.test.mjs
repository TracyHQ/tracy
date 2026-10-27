/**
 * PREVIEW-PARITY reads the web fonts a page's words are set in. A Google Maps widget draws its own
 * controls (the "Keyboard shortcuts" and terms buttons, the error card) in Roboto, which the Maps
 * script loads when it runs and the page itself never names. Whether that script finished, and with
 * which answer, differs from one load to the next and from the popup to Try on, so JA Smallbiz 1.0.3's
 * home failed at 1440px under Moxie with "roboto: popup not used" (dot 3, 19/10/2026) while the
 * template's own words were identical. The map's own subtree (.gm-style, .gm-err-container) is a
 * third-party picture: its fonts, icons and boxes are not read. A template font missing from the
 * popup is still a difference.
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

// a local face (no network): declared and loaded as "mapfont" for the map, "pagefont" for the page
const FACE = (/** @type {string} */ name) =>
  `@font-face { font-family: "${name}"; src: local("Helvetica"), local("Arial"); }`
const page = (/** @type {boolean} */ mapDrawn, /** @type {boolean} */ pageFont = true) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  ${FACE('mapfont')} ${FACE('pagefont')}
  body { margin: 0; font: 16px/1.5 ${pageFont ? '"pagefont", ' : ''}sans-serif }
  .gm-style button { font-family: "mapfont", sans-serif }
  </style></head><body><main style="width:900px;margin:0 auto"><h1>Our shop</h1><p>We are open every day.</p><p>Visit us downtown.</p><p>Call us any time.</p>
  <div id="ja-widget-map1" style="height:300px">${
    mapDrawn
      ? '<div class="gm-style"><div class="gmnoprint"><div class="gm-style-cc"><button>Keyboard shortcuts</button><button>Map data</button><button>Terms</button><button>Report a map error</button></div></div></div>'
      : ''
  }</div></main><script>document.fonts.load('16px mapfont'); document.fonts.load('16px pagefont')</script></body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9695)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url) => {
  await chrome.open(url, 1440)
  await chrome.evaluate('document.fonts.ready.then(() => true)')
  return chrome.evaluate(PARITY_PROBE)
}

test('PREVIEW-PARITY: a Google Maps widget drawn on one side only is no font difference', opts, async () => {
  const tryOn = await read(page(true))
  const popup = await read(page(false))
  const r = compareParity(popup, tryOn)
  assert.equal(r.count, 0, JSON.stringify(r.findings))
  // the true catch stays: the page's own face missing from the popup
  const bare = await read(page(false, false))
  const h = compareParity(bare, tryOn)
  assert.ok(
    h.findings.some((/** @type {any} */ f) => f.kind === 'font' && /pagefont/.test(f.family)),
    JSON.stringify(h.findings)
  )
})
