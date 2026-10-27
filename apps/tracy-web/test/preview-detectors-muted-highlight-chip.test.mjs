/**
 * muted-highlight (HIER-1) and a badge on a fill of its own (JA Vogue 1.0.7's typography page, final gate
 * 18/10/2026). "Example heading <span class="badge bg-dark">New</span>": the badge stands out by its chip, a fill
 * of its own, not by its words' colour against the heading's ground. Under Moxie's dark side its words took the
 * system's muted tone on the dark chip, 8.26:1, while the heading read 15:1 on the page; the detector held both
 * against the chip's fill and called the hierarchy inverted. A highlight on a fill of its own is a chip: its words
 * are read on the chip (CON-2), and the chip, not its words' colour, carries the emphasis. A coloured span in the
 * heading's own words that the system turns khaki is still found.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as muted from '../scripts/preview-detectors/muted-highlight.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #ffffff; color: #222222 }
  .h2 { font-size: 32px; margin: 40px; color: #5a6169 }
  .badge { display: inline-block; padding: 4px 8px; font-size: 14px; color: #ffffff }
  .bg-dark { background-color: #212529 }
  .bg-light { background-color: #f8f9fa; color: #212529 }
  .accent { color: #1f9d55 }
  ${wear}
  </style></head><body>
  <p class="h2">Example heading <span class="badge bg-dark">New</span></p>
  <p class="h2">Example heading <span class="badge bg-light">New</span></p>
  <p class="h2">We make <span class="accent">websites</span> people love</p>
  </body></html>`)}`

/** Moxie's dark side: cream words on black, the chip a dark grey, its words and the accent in the muted tone. */
const WORN = `
  body { background: #000000; color: #f4efd4 } .h2 { color: inherit }
  .bg-dark { background-color: #1f1f1d } .badge { color: #b7b39f }
  .bg-light { background-color: #f4efd4; color: #5d5b51 }
  .accent { color: #858273 }
`

/** Moxie's light side: a cream page, the light chip a step off it, its words and the accent in the muted tone. */
const WORN_LIGHT = `
  body { background: #fffdf5; color: #3d3c35 } .h2 { color: inherit }
  .bg-dark { background-color: #3d3c35 } .badge { color: #e0dccb }
  .bg-light { background-color: #f4f1e6; color: #5d5b51 }
  .accent { color: #8a8778 }
`

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9686)
  for (const [name, wear] of [
    ['plain', ''],
    ['worn', WORN],
    ['wornLight', WORN_LIGHT]
  ]) {
    await chrome.open(page(wear), 1440)
    read[name] = await chrome.evaluate(muted.probe)
  }
})
after(async () => chrome?.close())

const run = (/** @type {string} */ worn) =>
  muted.detect({ worn: { data: read[worn] }, plain: { data: read.plain } })

test(
  'muted-highlight: a badge on a chip of its own, dark or light, is not a highlight made quieter',
  opts,
  () => {
    for (const worn of ['worn', 'wornLight']) {
      const r = run(worn)
      assert.ok(!r.findings.some((x) => x.text === 'New'), `${worn}: ${JSON.stringify(r.findings)}`)
    }
  }
)

test("muted-highlight: a coloured span turned khaki beside the heading's words is still found", opts, () => {
  for (const worn of ['worn', 'wornLight'])
    assert.deepEqual(
      run(worn).findings.map((x) => x.text),
      ['websites'],
      worn
    )
})
