/**
 * The overlap safety net (`picture-overlap.js`) on fictional pages: a figure over a hero's headline is found at every
 * width it covers it; a figure in its own column, a backdrop behind the words, and a caption a template sets over a photo
 * are not. Launches the Playwright Chromium the host ships; skipped where none is installed.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { overlapFindings, readPictureOverlaps } from '../src/picture-overlap.js'
import { makePictureOverlap } from '../src/picture-overlap-browser.js'

let browser = null
let server = null
let base = ''
const files = new Map()

/** A figure on a clear ground, and an opaque picture, as SVG (the host carries no image library). */
const clearWith = (width, height, part) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${part.left}" y="${part.top}" width="${part.width}" height="${part.height}" fill="#d9c21a"/></svg>`
const opaque = (width, height) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#335577"/></svg>`

const page = (body) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
  body{margin:0;font:16px sans-serif} .wrap{position:relative;min-height:600px;overflow:hidden}
  .row{display:flex;flex-wrap:wrap} .col{flex:1 1 50%;min-width:320px} .col img{width:100%;display:block}
  @media (max-width:767px){.col{flex-basis:100%}}
  </style></head><body><header><a class="logo" href="/">Crumb and Crust</a></header>${body}</body></html>`

const PAGES = {
  // A bakery hero: a big figure stood over the whole hero, across the headline and the button.
  '/over': page(
    '<section class="wrap"><div style="position:relative;z-index:2;padding:40px"><h1>Fresh bread every morning</h1><a class="btn" href="/order">Order now</a></div>' +
      '<div style="position:absolute;inset:0;z-index:1"><img src="/images/tracy-content/ball.svg" style="width:100%;height:100%"></div></section>'
  ),
  // A dental clinic about block: a framed photo in its own column, stacked under the words on phones.
  '/column': page(
    '<section class="row"><div class="col"><h2>Gentle care for every smile</h2><p>Book a check-up with our team.</p></div>' +
      '<div class="col"><img src="/images/tracy-content/framed.svg"></div></section>'
  ),
  // A backdrop photo behind the words, and a caption a template sets over a gallery photo.
  '/design': page(
    '<section class="wrap"><img src="/images/tracy-content/bg.svg" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' +
      '<h1 style="position:relative">Our bakery</h1></section>' +
      '<figure style="position:relative;width:320px"><img src="/images/tracy-content/tile.svg" style="width:100%;display:block">' +
      '<figcaption style="position:absolute;bottom:0"><p>Rye loaves</p></figcaption></figure>'
  )
}

before(async () => {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
    browser = await chromium.launch()
  } catch {
    browser = null
    return
  }
  files.set(
    '/images/tracy-content/ball.svg',
    clearWith(1440, 900, { left: 300, top: 0, width: 900, height: 900 })
  )
  files.set(
    '/images/tracy-content/framed.svg',
    clearWith(800, 800, { left: 40, top: 40, width: 720, height: 720 })
  )
  files.set('/images/tracy-content/bg.svg', opaque(1600, 900))
  files.set('/images/tracy-content/tile.svg', opaque(640, 480))
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    if (PAGES[path]) {
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(PAGES[path])
    }
    const bytes = files.get(path)
    if (!bytes) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'image/svg+xml' })
    res.end(bytes)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  await browser?.close()
  server?.close()
})

const skip = () => (browser ? false : 'no Playwright Chromium on this machine')

test('a figure over the headline and the button is found at every width it covers them', async (t) => {
  if (skip()) return t.skip(skip())
  const p = await browser.newPage()
  const found = overlapFindings(await readPictureOverlaps(p, `${base}/over`))
  await p.close()
  assert.equal(found.length, 1)
  assert.equal(found[0].src, 'images/tracy-content/ball.svg')
  assert.deepEqual(found[0].widths, [1440, 1024, 768, 390])
  assert.ok(found[0].covers.some((c) => c.kind === 'heading'))
  assert.ok(found[0].covers.some((c) => c.kind === 'button'))
})

test('a framed photo in its own column, a backdrop and a template caption are no overlap', async (t) => {
  if (skip()) return t.skip(skip())
  const p = await browser.newPage()
  const column = await readPictureOverlaps(p, `${base}/column`)
  const design = await readPictureOverlaps(p, `${base}/design`)
  await p.close()
  assert.deepEqual(overlapFindings(column), [])
  assert.deepEqual(overlapFindings(design), [])
})

test("the route's browser reads every named page of the site and answers the findings", async (t) => {
  if (skip()) return t.skip(skip())
  const playwright = await import('playwright')
  const check = await makePictureOverlap({ playwright, log: {} })
  const answer = await check({
    asked: { pages: ['/over', '/column'], folder: 'tracy-content/' },
    base: `${base}/`,
    signal: new AbortController().signal
  })
  await check.close()
  assert.deepEqual(
    answer.pages.map((p) => p.ok),
    [true, true]
  )
  assert.deepEqual(
    answer.findings.map((f) => f.src),
    ['images/tracy-content/ball.svg']
  )
})

test('the findings merge the widths of one picture', () => {
  const found = overlapFindings([
    { width: 390, src: 'a.png', covers: [{ kind: 'heading', text: 'Hi' }] },
    {
      width: 1440,
      src: 'a.png',
      covers: [
        { kind: 'heading', text: 'Hi' },
        { kind: 'logo', text: '' }
      ]
    }
  ])
  assert.deepEqual(found, [
    {
      src: 'a.png',
      widths: [1440, 390],
      covers: [
        { kind: 'heading', text: 'Hi' },
        { kind: 'logo', text: '' }
      ]
    }
  ])
})
