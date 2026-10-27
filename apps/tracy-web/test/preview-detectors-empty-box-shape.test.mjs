/**
 * empty-box and a shape cut by clip-path (JA Sensei 1.0.5, final gate 18/10/2026). Sensei draws the wave at
 * the foot of its home hero as an empty `div.mask-wrap` filled in the page's ground and cut to a wave by
 * `clip-path: polygon(...)`. On the template the hero is a gradient, so the white wave read as nothing; worn,
 * the hero is a solid colour and the wave, filled in the system's ground, steps off it: empty-box read the
 * 1837 x 220 box as a hollow box that draws, on every page with the hero, though the eye sees the same wave.
 * A box cut to a shape paints that shape, like a mask: it is not hollow. A hollow box the system outlines out
 * of nothing (JA Tour's message container) is still found.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as emptyBox from '../scripts/preview-detectors/empty-box.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

/** A Sensei-like hero with its wave, `wear` standing for the slot. */
const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #ffffff; color: #222 }
  .acm-features { position: relative; width: 1440px; height: 900px; background-image: linear-gradient(135deg, #6a3df0, #b54ae8) }
  .mask-wrap { position: absolute; bottom: 0; left: -200px; width: 1837px; height: 220px; background: #ffffff;
    clip-path: polygon(33% 6%, 21% 33%, 9% 40%, 0% 24%, 0% 100%, 100% 100%, 100% 85%, 87% 64%, 63% 82%, 49% 51%, 38% 9%) }
  #system-message-container { width: 790px }
  h2 { margin: 0; padding-top: 100px; text-align: center }
  ${wear}
  </style></head><body>
  <div id="system-message-container"></div>
  <div class="acm-features"><h2>Learning a new skill</h2><div class="mask-wrap"></div></div>
  </body></html>`)}`

/** Sensei worn: a solid hero, the wave in the system's ground. */
const WORN = `
  .acm-features { background-image: none; background-color: #151444 }
  .mask-wrap { background: #f5f5f5 }
`

/** What Moxie did to JA Tour: the empty message container outlined. */
const OUTLINED = `${WORN}
  #system-message-container { border: 1px solid #a2a2a1; padding: 10px }
`

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9684)
  for (const [name, wear] of [
    ['plain', ''],
    ['worn', WORN],
    ['outlined', OUTLINED]
  ]) {
    await chrome.open(page(wear), 1440)
    read[name] = await chrome.evaluate(emptyBox.probe)
  }
})
after(async () => chrome?.close())

const run = (/** @type {string} */ worn) =>
  emptyBox.detect({ worn: { data: read[worn] }, plain: { data: read.plain } })

test('empty-box: a box cut to a shape by clip-path is not an empty box', opts, () => {
  const r = run('worn')
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test(
  'empty-box: the box the system outlines out of nothing is still found next to a clipped shape',
  opts,
  () => {
    const r = run('outlined')
    assert.equal(r.count, 1, JSON.stringify(r.findings))
    assert.match(r.findings[0].at, /system-message-container/)
  }
)
