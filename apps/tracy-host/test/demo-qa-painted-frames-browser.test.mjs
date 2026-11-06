/**
 * Picture frames whose picture is painted, not drawn by an <img>: a template that hides its icon <img> (opacity 0) and
 * paints the icon with a pseudo element's mask or background, or with an icon font glyph, shows a picture; a frame with
 * nothing painted in it, a bare colour block or a tiny placeholder glyph is still an empty frame (`no-empty-picture-slots`).
 * The painted-mask markup is the one JA Boxing 1.0.11 ships for its feature and class icons (ticket #436 follow-up).
 * Launches its own headless Chromium; skipped when Playwright or its browser is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-painted-frames-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'

import { readDemoPage } from '../src/demo-qa-browser.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

// 1x1 PNG: a picture file and a mask that lets everything through.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG = Buffer.from(PNG_B64, 'base64')
const MASK = `url("data:image/png;base64,${PNG_B64}")`

const PAGE = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px sans-serif }
  .row { display: flex; gap: 24px; padding: 24px }
  .ft-icon { position: relative; display: inline-block; vertical-align: middle }
  .ft-icon img { display: block; opacity: 0; width: 100px; height: 100px }
  .ft-icon::before, .ft-icon::after { content: ""; position: absolute; inset: 0; mask-repeat: no-repeat; mask-size: 100% 100% }
  .ft-icon::before { mask-image: ${MASK}; background-color: rgb(19, 18, 18) }
  .ft-icon::after { mask-image: ${MASK}; background-color: #f44141 }
  .ft-icon.d-light { display: none }
  .img-icon { width: 224px; height: 100px }
  .media-box { width: 224px; height: 150px; position: relative }
  .media-box::before { content: ""; position: absolute; inset: 0; background-image: url(/icon.png); background-size: cover }
  .thumb { width: 224px; height: 150px }
  .glyph::before { content: "\\2605"; font-size: 120px; line-height: 1 }
  .photo-frame { width: 300px; height: 200px }
  .image-box { width: 300px; height: 200px; position: relative }
  .image-box::before { content: ""; position: absolute; inset: 0; background-color: #eee }
  .picture-holder { width: 300px; height: 200px }
  .picture-holder .glyph::before { font-size: 16px }
  .gallery-item { width: 300px; height: 200px }
  .gallery-item img { opacity: 0; width: 300px; height: 200px }
</style>
<div class="row">
  <div id="painted-mask" class="img-icon">
    <span class="ft-icon ft-icon-dark d-dark"><img src="/icon.png" alt=""></span>
    <span class="ft-icon ft-icon-light d-light"><img src="/icon.png" alt=""></span>
  </div>
  <div id="painted-background" class="media-box"></div>
  <div id="icon-font" class="thumb"><i class="glyph"></i></div>
</div>
<div class="row">
  <div id="empty" class="photo-frame"></div>
  <div id="colour-only" class="image-box"></div>
  <div id="tiny-glyph" class="picture-holder"><i class="glyph"></i></div>
  <div id="hidden-picture" class="gallery-item"><img src="/icon.png" alt=""></div>
</div>`

function site() {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (path === '/icon.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
    if (path === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
    res.writeHead(404, { 'content-type': 'text/html' }).end('<p>Not found</p>')
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    )
  )
}

test(
  'a frame whose picture is painted by a pseudo element or an icon font is not empty; a truly empty one still is',
  opts,
  async () => {
    const { server, base } = await site()
    const browser = await playwright.chromium.launch({ headless: true })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `${base}/`, '/', {})
      const flagged = r.emptySlots.map((s) => s.selector.split(' > ').pop()).sort()
      assert.deepEqual(flagged, [
        'div#colour-only.image-box',
        'div#empty.photo-frame',
        'div#hidden-picture.gallery-item',
        'div#tiny-glyph.picture-holder'
      ])
    } finally {
      await browser.close()
      server.close()
    }
  }
)
