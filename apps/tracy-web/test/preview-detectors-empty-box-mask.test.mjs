/**
 * empty-box and a picture drawn through a CSS mask (JA Trip 1.0.7, final gate 18/10/2026). Trip's doodle
 * layer `div.bg-overlay.bg-overlay-image` is a background picture on the template; worn, the template
 * draws the same doodles in the system's accent by giving the layer a fill and the picture as
 * `mask-image`. The fill only shows through the picture's shapes, so the layer is a picture, not an
 * empty filled box; empty-box read it as a ~1440 × 1200 hollow box that draws and flagged it on every
 * page with the layer. A mask paints its picture: such a box is not hollow, like a background picture.
 * A hollow box the system outlines out of nothing (JA Tour's message container) is still found.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as emptyBox from '../scripts/preview-detectors/empty-box.mjs'
import { solidPhoto } from './_solid-photo.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

const DOODLES = solidPhoto(240, 140, 90)

/** A Trip-like section: a doodle layer behind a heading, `wear` standing for the slot. */
const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #f6f7f9; color: #222 }
  section { position: relative; width: 1440px; height: 1200px }
  .bg-overlay { position: absolute; inset: 0 }
  .bg-overlay-image { background-image: url("${DOODLES}"); background-repeat: no-repeat; opacity: .5 }
  #system-message-container { width: 790px }
  h2 { position: relative; text-align: center; margin: 0; padding-top: 100px }
  ${wear}
  </style></head><body>
  <div id="system-message-container"></div>
  <section><div class="bg-overlay bg-overlay-image"></div><h2>How We Can Help Your Journey</h2></section>
  </body></html>`)}`

/** Trip 1.0.7 worn: the doodles in the accent, the picture as the mask (both spellings). */
const MASKED = `
  .bg-overlay-image { background-image: none; background-color: #3a4fb0;
    -webkit-mask-image: url("${DOODLES}"); mask-image: url("${DOODLES}");
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat }
`

/** What Moxie did to JA Tour: the empty message container outlined. */
const OUTLINED = `${MASKED}
  #system-message-container { border: 1px solid #a2a2a1; padding: 10px }
`

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9683)
  for (const [name, wear] of [
    ['plain', ''],
    ['masked', MASKED],
    ['outlined', OUTLINED]
  ]) {
    await chrome.open(page(wear), 1440)
    read[name] = await chrome.evaluate(emptyBox.probe)
  }
})
after(async () => chrome?.close())

const run = (/** @type {string} */ worn) =>
  emptyBox.detect({ worn: { data: read[worn] }, plain: { data: read.plain } })

test('empty-box: a layer that draws a picture through a mask is not an empty box', opts, () => {
  const r = run('masked')
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test(
  'empty-box: the box the system outlines out of nothing is still found next to a masked layer',
  opts,
  () => {
    const r = run('outlined')
    assert.equal(r.count, 1, JSON.stringify(r.findings))
    assert.match(r.findings[0].at, /system-message-container/)
  }
)
