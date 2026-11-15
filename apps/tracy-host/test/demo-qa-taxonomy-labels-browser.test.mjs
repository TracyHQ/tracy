/**
 * The template's taxonomy names a page shows (`labels` of `readDemoPage`) on an invented page served from here: a link
 * whose path names a category or tag, and a Joomla tag list (`ul.tags`) whose links a menu item routes elsewhere.
 * Launches its own headless Chromium; skipped when Playwright or its browser is not installed.
 *   node --test apps/tracy-host/test/demo-qa-taxonomy-labels-browser.test.mjs
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

const PAGE = `<meta name="viewport" content="width=device-width, initial-scale=1">
  <h1>Article</h1>
  <p><a href="/blog/category/engineering/">Engineering (5)</a></p>
  <ul class="tags list-inline"><li class="list-inline-item tag-2"><a href="/index.php/tag-business">Business</a></li>
    <li class="list-inline-item tag-3"><a href="/index.php/tag-security">Security</a></li></ul>
  <p><a href="/about">About us</a></p>`

test(
  'a tag a Joomla tag list links through a menu item is read as a label, like a category its path names',
  opts,
  async () => {
    const server = createServer((req, res) =>
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(req.url.split('?')[0] === '/' ? PAGE : '<p>Page</p>')
    )
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const browser = await playwright.chromium.launch({ headless: true })
    try {
      const page = await (await browser.newContext()).newPage()
      const r = await readDemoPage(page, `http://127.0.0.1:${server.address().port}/`, '/', {})
      assert.deepEqual(
        r.labels.map((l) => [l.text, l.href]),
        [
          ['Engineering', '/blog/category/engineering/'],
          ['Business', '/index.php/tag-business'],
          ['Security', '/index.php/tag-security']
        ]
      )
    } finally {
      await browser.close()
      server.close()
    }
  }
)
