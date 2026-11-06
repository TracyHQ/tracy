// Runs a real Chromium (the Playwright apps/tracy-host installs); skipped when it is not installed.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { contextOptions, pageUrl, shootPages, walkPage } from '../shoot-pages.mjs'

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

// A Joomla site without URL rewriting answers a page only under /index.php (the same rule as the host's
// site-check measure); a bare path is Apache's 404.
test('a page path is asked under /index.php, the home page and a path already there are kept', () => {
  const base = 'http://demo.test'
  assert.equal(pageUrl(base, '/about-us'), 'http://demo.test/index.php/about-us')
  assert.equal(pageUrl(base, '/'), 'http://demo.test/')
  assert.equal(pageUrl(base, '/index.php/about-us'), 'http://demo.test/index.php/about-us')
  assert.equal(pageUrl(base, '/index.php?option=com_tags'), 'http://demo.test/index.php?option=com_tags')
})

test('a page that answers anything but 200 is a failed shot', { skip: !chromium }, async () => {
  const server = createServer((req, res) =>
    req.url === '/index.php/gone'
      ? res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not Found</h1>')
      : res.writeHead(200, { 'content-type': 'text/html' }).end('<p>ok</p>')
  )
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const out = path.join(import.meta.dirname, `.shots-${process.pid}`)
  try {
    const shots = await shootPages({
      chromium,
      base: `http://127.0.0.1:${server.address().port}`,
      paths: ['/', '/gone'],
      out,
      widths: [{ width: 390, height: 844 }]
    })
    assert.deepEqual(
      shots.map((s) => [s.path, s.status, s.failed]),
      [
        ['/', 200, false],
        ['/gone', 404, true]
      ]
    )
  } finally {
    server.close()
    const { rmSync } = await import('node:fs')
    rmSync(out, { recursive: true, force: true })
  }
})
