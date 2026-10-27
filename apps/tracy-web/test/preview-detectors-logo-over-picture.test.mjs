/**
 * logo-invisible reads the ground UNDER the logo, not only its ancestors' fills. JA Vega 1.0.7
 * (16/10/2026) lays its white wordmark in a header that overlaps the next section (.header-overlap, no
 * ground of its own): the hero or page-title photograph is a sibling layer under it, the page's DOM ground
 * is the white body. In the preview the logo's pixels cannot be read (a cross-origin image), so the
 * detector infers the ink from the template's DOM ground: white body -> "dark ink", Moxie's black page ->
 * contrast 1, a logo-invisible finding on 21 of 28 pages while the logo reads on the photograph on both.
 * A picture layer met under the logo's centre before any opaque layer is the logo's ground: a logo over a
 * picture, not judged (the rule the detector already has for an ancestor picture). A white logo on a real
 * white ground is still found. Runs the probe in a real headless Chrome; skipped when no Chrome is here.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/logo-invisible.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

const LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="139" height="60"><rect x="10" y="10" width="119" height="40" fill="#ffffff"/></svg>')}`

/** A Vega-like page: a header overlapping a photograph section (`overlap`), or a header with its own fill. */
const page = (/** @type {{ page: string, header?: string, overlap?: boolean }} */ o) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: ${o.page} }
    .t4-content { background: ${o.page} }
    .t4-header { ${o.overlap ? 'position: absolute; top: 0; left: 0; right: 0; z-index: 10' : `background: ${o.header}`} }
    .hero { height: 600px; background: #121316 linear-gradient(135deg, #1a1d3a, #0b0c10) }
  </style></head><body><div class="t4-content"><div class="t4-section t4-header"><header class="header-block">
    <div class="navbar-brand logo-image"><a href="/"><img class="logo-img" src="${LOGO}" alt="Vega" width="139" height="60"></a></div>
  </header></div><div class="t4-section t4-hero"><div class="hero"></div></div></div></body></html>`)}`

/** The preview cannot read a cross-origin logo's pixels: its ink is unknown there. */
const unread = (/** @type {any[]} */ xs) => xs.map((x) => ({ ...x, ink: null }))

test('logo-invisible: a logo in a header laid over a photograph is a logo over a picture', opts, async () => {
  const chrome = await browser(9673)
  try {
    const read = async (/** @type {string} */ url) => {
      await chrome.open(url, 800)
      return chrome.evaluate(probe)
    }
    const plain = await read(page({ page: '#ffffff', overlap: true }))
    const worn = await read(page({ page: '#000000', overlap: true }))
    assert.equal(plain.length, 1, 'the header logo is read')
    assert.equal(worn[0].ground, null, 'the photograph under the logo is its ground: not judged')
    assert.equal(detect({ worn: { data: unread(worn) }, plain: { data: unread(plain) } }).count, 0)
  } finally {
    await chrome.close()
  }
})

test('logo-invisible: a white logo on a real white ground is still found', opts, async () => {
  const chrome = await browser(9674)
  try {
    const read = async (/** @type {string} */ url) => {
      await chrome.open(url, 800)
      return chrome.evaluate(probe)
    }
    const plain = await read(page({ page: '#ffffff', header: '#121316' }))
    const worn = await read(page({ page: '#ffffff', header: '#ffffff' }))
    assert.deepEqual(worn[0].ground, { r: 255, g: 255, b: 255, a: 1 })
    for (const [w, p] of [
      [worn, plain],
      [unread(worn), unread(plain)]
    ]) {
      const r = detect({ worn: { data: w }, plain: { data: p } })
      assert.equal(r.count, 1, 'white on white is found, pixels read or inferred')
      assert.match(r.findings[0].at, /logo-img/)
    }
  } finally {
    await chrome.close()
  }
})

/**
 * JA Sensei 1.0.5 (18/10/2026, probe 10): the header has no ground of its own and the hero below it is pulled
 * up under it; a system paints that hero a solid navy where the template had a gradient. The first opaque
 * layer met under the logo's centre is then the hero's fill, yet the probe went on to the logo's ancestors and
 * judged the white wordmark against the page's light grey, contrast 1 on every page while it read on the navy.
 * The ground is the first opaque layer under the logo's centre, a sibling's as much as an ancestor's.
 */
const pulled = (/** @type {{ hero: string }} */ o) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: #ffffff }
    .t3-wrapper-inner { background: #f5f5f5 }
    .t3-header { position: relative; z-index: 2; height: 200px }
    .t3-hero { position: relative; z-index: 1; margin-top: -200px; height: 600px; background: ${o.hero} }
  </style></head><body><div class="t3-wrapper"><div class="t3-wrapper-inner"><header class="t3-header"><div class="logo logo-image">
    <a href="/"><img class="logo-img" src="${LOGO}" alt="Sensei" width="139" height="60"></a></div></header>
    <div class="t3-hero"></div></div></div></body></html>`)}`

test('logo-invisible: a sibling layer pulled under the logo is its ground', opts, async () => {
  const chrome = await browser(9675)
  try {
    const read = async (/** @type {string} */ url) => {
      await chrome.open(url, 800)
      return chrome.evaluate(probe)
    }
    const plain = await read(pulled({ hero: 'linear-gradient(135deg, #6a3df0, #b54ae8)' }))
    const navy = await read(pulled({ hero: '#151444' }))
    assert.deepEqual(
      navy[0].ground,
      { r: 21, g: 20, b: 68, a: 1 },
      'the navy hero under the logo is its ground'
    )
    assert.equal(
      detect({ worn: { data: navy }, plain: { data: plain } }).count,
      0,
      'a white logo on navy reads'
    )
    const white = await read(pulled({ hero: '#ffffff' }))
    assert.equal(
      detect({ worn: { data: white }, plain: { data: plain } }).count,
      1,
      'white on a white hero is found'
    )
  } finally {
    await chrome.close()
  }
})
