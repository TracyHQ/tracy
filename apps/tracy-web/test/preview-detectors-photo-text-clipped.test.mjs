/**
 * photo-text and words a carousel clips away (JA Vogue 1.0.7 home-6, final gate 18/10/2026). The page is two
 * columns: a large photograph on the left, an Owl slider on the right whose stage runs far to the left of its
 * window (`.owl-stage-outer`, overflow hidden). The slides off the window are clipped: the visitor sees one slide,
 * its words on the page's dark ground. The probe took the hidden slides' words, whose boxes lie over the left
 * photograph, as words on that photograph and flagged the system's quieter meta colour there. Words a clipping
 * ancestor cuts away are not seen. A caption laid on the photograph itself is still found.
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
const SLIDE = solidPhoto(200, 160, 150)

/** A Vogue home-6-like page; `wear` stands for the slot, `caption` lays words on the photograph itself. */
const page = (/** @type {string} */ wear, caption = false) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #000000; color: #eef1f5 }
  .row { display: flex; width: 1440px; height: 900px }
  .left { position: relative; width: 720px; height: 900px }
  .left img { display: block; width: 720px; height: 900px }
  .left .cap { position: absolute; left: 60px; bottom: 80px; color: #c2c8d0; font-size: 14px }
  .right { width: 720px; padding-left: 48px; box-sizing: border-box }
  .outer { position: relative; width: 624px; overflow: hidden }
  .stage { display: flex; width: 3744px; transform: translate3d(-1344px, 0, 0) }
  .slide { width: 624px; flex: none; text-align: center }
  .slide img { display: block; width: 520px; height: 350px; margin: 0 auto }
  .slide .meta { color: #c2c8d0; font-size: 13px; margin-top: 30px }
  .slide .intro { color: #c2c8d0; font-size: 14px }
  ${wear}
  </style></head><body><div class="row">
  <div class="left"><img src="${PHOTO}" alt="">${caption ? '<p class="cap">PHOTO CAPTION HERE</p>' : ''}</div>
  <div class="right"><div class="outer"><div class="stage">${[
    'STYLE',
    'INTERIOR',
    'SKIN CARE',
    'TRAVEL',
    'FASHION',
    'LIFESTYLE'
  ]
    .map(
      (c) =>
        `<div class="slide"><img src="${SLIDE}" alt=""><p class="meta">${c} 05 DECEMBER 2023</p><p class="intro">Delve into the world of sustainable fashion</p></div>`
    )
    .join('')}</div></div></div>
  </div></body></html>`)}`

/** Moxie's dark side: the meta and the intro in its muted tone. */
const WORN = `.slide .meta, .slide .intro, .left .cap { color: #858273 }`

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9685)
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

test('photo-text: words a carousel clips out of its window are not words on a photograph', opts, () => {
  const r = photoText.detect({ worn: { data: read.worn }, plain: { data: read.plain } })
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test('photo-text: a caption laid on the photograph is still found beside the clipped slides', opts, () => {
  const r = photoText.detect({ worn: { data: read.wornCap }, plain: { data: read.plainCap } })
  assert.equal(r.count, 1, JSON.stringify(r.findings))
  assert.equal(r.findings[0].text, 'PHOTO CAPTION HERE')
})
