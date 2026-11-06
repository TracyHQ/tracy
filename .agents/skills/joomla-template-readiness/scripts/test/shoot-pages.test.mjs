// Runs a real Chromium (the Playwright apps/tracy-host installs); skipped when it is not installed.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { contextOptions, walkPage } from '../shoot-pages.mjs'

const ROOT = path.resolve(import.meta.dirname, '../../../../..')
let chromium = null
try {
  ;({ chromium } = createRequire(path.join(ROOT, 'apps/tracy-host/package.json'))('playwright'))
} catch {}

// A lower section hidden until revealed, the way JA Voyara's reveal.js does it: shown at once under reduced motion,
// otherwise only by a scroll reveal this page never fires (so nothing but reduced motion can show it).
const PAGE = `<!doctype html><html><body style="margin:0">
<section style="height:900px">top</section>
<section id="low" style="height:400px;opacity:0;transition:opacity .2s">low</section>
<script>
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.getElementById('low').style.opacity = '1'
</script></body></html>`

test('a section a template reveals only under reduced motion is shown before the shot', {
  skip: !chromium
}, async () => {
  const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE))
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext(contextOptions({ width: 390, height: 844 }))
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await walkPage(page)
    const opacity = await page.evaluate(() => getComputedStyle(document.getElementById('low')).opacity)
    assert.equal(opacity, '1')
  } finally {
    await browser.close()
    server.close()
  }
})
