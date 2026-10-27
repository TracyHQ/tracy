/**
 * The header's brand block as the browser half reads it (`brand` of a read, judged by `header-brand`), on headers
 * shaped as WordPress, Joomla T4 and EmDash templates write them, and on one that lost its brand block. Needs a
 * Chrome on CDP (`chrome-watch`); skipped otherwise:
 *   DEMO_QA_CDP=http://127.0.0.1:9222 node --test apps/tracy-host/test/demo-qa-header-brand-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'

import { readDemoPage } from '../src/demo-qa-browser.js'
import { checkHeaderBrand, collectedOf } from '../src/demo-qa.js'

const cdp = process.env.DEMO_QA_CDP
const opts = { skip: cdp ? false : 'set DEMO_QA_CDP (a chrome-watch CDP address)' }
if (cdp) after(() => setTimeout(() => process.exit(), 200))

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const LOGO = 'wp-content/uploads/tracy-content/aa11.png'
const nav = '<nav class="wp-block-navigation"><a href="/">Home</a> <a href="/menu">Menu</a></nav>'
const PAGES = {
  '/wp':
    `<header class="wp-block-template-part"><div class="wp-block-site-logo"><a href="/" class="custom-logo-link" rel="home"><img class="custom-logo" width="80" height="40" src="/${LOGO}" alt=""></a></div>` +
    `<p class="wp-block-site-title"><a href="/" rel="home">Tin Lantern Saigon</a></p>${nav}</header><main><p>Welcome</p></main>`,
  '/lost': `<header class="wp-block-template-part">${nav}</header><main><p>Welcome</p></main>`,
  '/t4':
    '<div id="t4-header" class="t4-header"><a class="navbar-brand" href="/index.php"><span class="site-name">Pho Ba Corner</span></a>' +
    '<ul class="navbar-nav"><li><a href="/index.php">Home</a></li></ul></div><main><p>Welcome</p></main>',
  '/emdash':
    '<header><a href="/" class="flex gap-2"><svg width="32" height="32"><title>Tracy Base</title><rect width="32" height="32"/></svg><span>Tracy Base</span></a>' +
    '<nav><a href="/about">About</a></nav></header><main><p>Welcome</p></main>',
  // Local round 24, 25/10/2026: the name's link home shares one container with the header's <nav>.
  '/beside-nav':
    '<div class="wrap"><div class="topbar"><a href="tel:4155550170">415.555.0170</a> <a href="mailto:hi@b.test">hi@b.test</a> <a href="/careers">Careers</a></div>' +
    '<header><div class="container-site flex"><a href="/" class="flex"><span class="mark"></span><span>q. patisserie</span></a>' +
    '<nav aria-label="Primary"><a href="/">Home</a><a href="/services">Menu</a><a href="/news">News</a></nav>' +
    '<a href="/search" class="btn-icon">Search</a><a href="/contact" class="btn-forest">Order a cake</a></div></header></div><main><p>Welcome</p></main>',
  // Local round 31, 25/10/2026 (Levain): a hero heading's accent line, a paragraph of three words.
  '/accent':
    '<main><div class="hero-heading h1"><h1 class="hero-heading-title">Welcome to Levain</h1><p class="hero-heading-accent">Bar &amp; Restaurant</p></div>' +
    '<p class="price">Only $5.99</p><ul><li>Soup or salad</li></ul></main>',
  // Tin Lantern, 24/10/2026: a header rebuilt as paragraphs of links keeps no brand.
  '/link-row':
    '<header><p><a href="/">Home</a> <a href="/menu">Menu</a> <a href="/about">About</a></p></header><main><p>Welcome</p></main>'
}

function site() {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path.endsWith('.png')) {
      res.writeHead(200, { 'content-type': 'image/png' })
      return res.end(PNG)
    }
    res.writeHead(PAGES[path] ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><title>t</title><body>${PAGES[path] ?? '<p>Not found</p>'}</body>`)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

test(
  'a real read: the header brand of WordPress, Joomla T4 and EmDash headers, a header that lost it, and a heading’s short lines',
  opts,
  async () => {
    const { chromium } = await import('playwright')
    const server = await site()
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const browser = await chromium.connectOverCDP(cdp)
      const page = await browser.contexts()[0].newPage()
      const read = async (path) => readDemoPage(page, `${base}${path}`, path)
      const wp = await read('/wp')
      assert.equal(wp.brand.found, true)
      assert.equal(wp.brand.images.length, 1)
      assert.match(wp.brand.images[0].src, /aa11\.png$/)
      assert.match(wp.brand.text, /Tin Lantern Saigon/)
      assert.doesNotMatch(wp.brand.text, /Menu/)
      const lost = await read('/lost')
      assert.equal(lost.brand.found, false)
      const t4 = await read('/t4')
      assert.equal(t4.brand.text, 'Pho Ba Corner')
      const emdash = await read('/emdash')
      assert.equal(emdash.brand.images[0].svg, true)
      const besideNav = await read('/beside-nav')
      assert.equal(besideNav.brand.text, 'q. patisserie')
      assert.equal((await read('/link-row')).brand.found, false)
      // A line set as part of a heading is read as a short block; a price or a list's line of three words is not.
      const accent = await read('/accent')
      assert.deepEqual(
        accent.blocks.filter((b) => b.short).map((b) => b.text),
        ['Welcome to Levain', 'Bar & Restaurant']
      )
      assert.ok(!accent.blocks.some((b) => /\$5\.99|Soup/.test(b.text)))

      const logo = {
        collected: collectedOf({ name: 'Tin Lantern Saigon', logo: 'm1' }),
        placedSources: { [LOGO]: '$logo' }
      }
      assert.equal(checkHeaderBrand([wp], logo).pass, true)
      assert.equal(checkHeaderBrand([lost], logo).detail[0].code, 'BRAND_MISSING')
      assert.equal(checkHeaderBrand([t4], { collected: collectedOf({ name: 'Pho Ba Corner' }) }).pass, true)
      assert.equal(
        checkHeaderBrand([emdash], { collected: collectedOf({ name: 'Pho Ba Corner' }) }).detail[0].code,
        'BRAND_NAME_MISSING'
      )
    } finally {
      server.close()
    }
  }
)
