/**
 * photo-text and words drawn inside an inline <svg> laid over a picture (JA Kinetic WP 1.0.12, 20/10/2026): the
 * hero terminal is a raster picture, and while a system is worn the slot lays the theme's drawn twin of it (an
 * inline SVG whose <text> elements carry the log lines) over it in the same box. An SVG <text> has no innerText,
 * and the probe threw on it ("Cannot read properties of undefined (reading 'trim')"), so the whole page went
 * unmeasured. Words of an SVG drawing are painted by its fill and belong to the picture, as words inside an <img>
 * do: they are not words on a photograph. A caption laid on the photograph is still found.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as photoText from '../scripts/preview-detectors/photo-text.mjs'
import { solidPhoto } from './_solid-photo.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

const PHOTO = solidPhoto(124, 90, 71)

/** A picture with its drawn twin laid over it; `wear` stands for the slot, `caption` adds a second picture with words on it. */
const page = (/** @type {string} */ wear, caption = false) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #000000; color: #eef1f5 }
  figure { position: relative; width: 660px; height: 245px; margin: 40px }
  figure img { display: block; width: 660px; height: 245px }
  .twin { display: none }
  .cap { position: absolute; left: 30px; bottom: 20px; margin: 0; color: #c2c8d0; font-size: 14px }
  ${wear}
  </style></head><body><figure><img src="${PHOTO}" alt="terminal">
  <svg class="twin" viewBox="0 0 1320 490" aria-hidden="true"><rect width="1320" height="490" fill="#0c110f"/>
  <text x="34" y="135" font-size="26" fill="#d7dbda">14:32:01 <tspan fill="#30a46c">INFO</tspan> checkout-api 200</text>
  <text x="34" y="183" font-size="26" fill="#d7dbda">14:32:01 <tspan fill="#30a46c">INFO</tspan> cart-api 200</text></svg>
  </figure>${caption ? `<figure><img src="${PHOTO}" alt=""><p class="cap">PHOTO CAPTION HERE</p></figure>` : ''}</body></html>`)}`

/** The slot's rule: the twin over the picture, in the same box. */
const WORN = `.twin { display: block; position: absolute; inset: 0; width: 100%; height: 100% } .cap { color: #858273 }`

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9687)
  for (const [name, wear, caption] of [
    ['plain', '', false],
    ['worn', WORN, false],
    ['plainCap', '', true],
    ['wornCap', WORN, true]
  ]) {
    await chrome.open(page(/** @type {string} */ (wear), /** @type {boolean} */ (caption)), 1440)
    read[name] = await photoText.read(chrome, await chrome.evaluate(photoText.probe))
  }
})
after(async () => chrome?.close())

test(
  'photo-text: the words of an SVG drawing laid over a picture are the picture, not words on it',
  opts,
  () => {
    const r = photoText.detect({ worn: { data: read.worn }, plain: { data: read.plain } })
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    assert.ok(
      !JSON.stringify(read.worn).includes('checkout-api'),
      'no SVG <text> is read as words on a photograph'
    )
  }
)

test('photo-text: a caption laid on another picture of the page is still found', opts, () => {
  const r = photoText.detect({ worn: { data: read.wornCap }, plain: { data: read.plainCap } })
  assert.equal(r.count, 1, JSON.stringify(r.findings))
  assert.equal(r.findings[0].text, 'PHOTO CAPTION HERE')
})
