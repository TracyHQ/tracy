/**
 * The header logo as the browser half draws it: the business's name in the style of the template's logo (its ink,
 * its kind of letter), and the business's own logo laid whole in the template logo's box. Needs a Chrome on CDP
 * (`chrome-watch`); skipped otherwise:
 *   DEMO_QA_CDP=http://127.0.0.1:9222 node --test apps/tracy-host/test/demo-qa-wordmark-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'

import { readDemoPage } from '../src/demo-qa-browser.js'

const cdp = process.env.DEMO_QA_CDP
const opts = { skip: cdp ? false : 'set DEMO_QA_CDP (a chrome-watch CDP address)' }
if (cdp) after(() => setTimeout(() => process.exit(), 200))

// A handwritten-looking logo: one joined stroke across the line, in a violet ink, on a transparent ground.
const SCRIPT_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><path d="M10 40 Q 25 5 40 40 T 70 40 T 100 40 T 130 40 T 160 40 T 190 40" fill="none" stroke="#8a2be2" stroke-width="5"/></svg>'
// The business's own logo: a square badge.
const BADGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="#111"/></svg>'
const PAGE =
  '<!doctype html><title>Logo</title><header><a href="/" class="custom-logo-link" style="color:rgb(204, 51, 51)">' +
  '<img class="custom-logo" src="/logo.svg" width="200" height="60" alt=""></a></header>' +
  '<main><h2 style="font-family:Georgia, serif">Our kitchen</h2></main>'

/** What `/fitted.png` serves, and the page that shows it as the logo: the fitted copy once it was set. */
const shown = { png: null }

function site() {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path === '/fitted.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      return res.end(Buffer.from(shown.png ?? '', 'base64'))
    }
    if (path === '/set/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(PAGE.replace('src="/logo.svg"', 'src="/fitted.png"'))
    }
    if (path.endsWith('.svg')) {
      res.writeHead(200, { 'content-type': 'image/svg+xml' })
      return res.end(path === '/badge.svg' ? BADGE : SCRIPT_LOGO)
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

test(
  "the wordmark takes the template logo's ink and kind of letter; the business's logo its box",
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = await readDemoPage(page, `${base}/`, '/', { wordmark: 'The Willow Nook' })
      const mark = read.wordmark
      assert.ok(mark, 'a wordmark was drawn')
      assert.equal(mark.colour, 'rgb(138, 43, 226)')
      assert.equal(mark.style.cls, 'script')
      assert.equal(mark.style.source, 'shipped')
      assert.equal(mark.font, '"Tracy Wordmark Script"')
      // A one-line logo: one line, never below the template's cap height, so it may run a little past the box.
      assert.equal(mark.style.lines, 1)
      assert.equal(mark.style.template.lines, 1)
      assert.ok(mark.height === 120 && mark.width >= 400, `${mark.width} × ${mark.height}`)
      assert.ok(mark.style.size * 0.7 >= mark.style.template.cap * 0.9)
      assert.equal(Buffer.from(mark.png, 'base64').subarray(1, 4).toString(), 'PNG')
      assert.equal(read.wordmarkSpot, undefined)

      const own = await readDemoPage(page, `${base}/`, '/', { logoPicture: '/badge.svg' })
      assert.equal(own.wordmark, undefined)
      const fitted = own.fittedLogo
      assert.deepEqual([fitted.width, fitted.height], [400, 120])
      assert.equal(fitted.source, `${base}/badge.svg`)
      // The page shows the template's logo, not the fitted copy: it is set.
      assert.equal(fitted.matches, false)
      // Once the page shows the fitted copy, the read says so, and the sweep plans nothing (`planSweep`).
      shown.png = fitted.png
      const again = await readDemoPage(page, `${base}/set/`, '/set/', { logoPicture: '/badge.svg' })
      assert.equal(again.fittedLogo.matches, true)
      // Laid whole and centred: the badge's middle is inked, the box's sides are clear.
      await page.setContent('<p>x</p>')
      const alpha = await page.evaluate(async (png) => {
        const picture = new Image()
        picture.src = `data:image/png;base64,${png}`
        await picture.decode()
        const canvas = Object.assign(document.createElement('canvas'), { width: 400, height: 120 })
        const g = canvas.getContext('2d')
        g.drawImage(picture, 0, 0)
        return [g.getImageData(200, 60, 1, 1).data[3], g.getImageData(20, 60, 1, 1).data[3]]
      }, fitted.png)
      assert.deepEqual(alpha, [255, 0])
      await page.close()
    } finally {
      server.close()
    }
  }
)
