/**
 * The preview probe reads a text's ground from the layer really painted under the words, not only from
 * its ancestors' fills. JA Sensei 1.0.5 (16/10/2026) lays its header (logo, main menu) over the hero or
 * the inner masthead, a sibling module painted behind it by position; the words' ancestors' only fill is
 * the page. Under Moxie the band was the light periwinkle accent and the menu stayed white (about 2:1):
 * the probe judged the menu on Moxie's black page and passed it. Under Figma the band is a navy accent
 * band and the menu reads 17:1: the probe judged it on Figma's white page, "#ffffff on #ffffff", CON-2.
 * An opaque layer met under the words' centre, below the words and above their ancestors' fill, is their
 * ground. White words on a real white ground are still found. Runs the probe in a real headless Chrome;
 * skipped when no Chrome is here.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { comparePreview, PREVIEW_PROBE } from '../src/sites/design-system-preview-probe.js'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

/**
 * A Sensei-like page: the header (menu links) is the hero's earlier sibling pulled over it with a
 * negative margin; `band` is the hero's fill or null for none, `page` the wrapper's fill.
 */
const page = (/** @type {{ page: string, band: string | null, menu: string }} */ o) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: ${o.page} }
    .t3-wrapper-inner { background: ${o.page} }
    .t3-header { position: relative; z-index: 2; box-sizing: border-box; height: 110px; padding: 45px 90px }
    .navbar-nav a { color: ${o.menu}; font: 600 16px/20px sans-serif; margin-right: 40px; text-decoration: none }
    .t3-hero { margin-top: -110px; height: 700px; ${o.band ? `background: ${o.band}` : ''} }
  </style></head><body><div class="t3-wrapper-inner"><header class="t3-header"><nav class="navbar-nav">
    <a href="/">Home</a><a href="/about">About Us</a><a href="/blog">Our Blog</a><a href="/contact">Contact Us</a>
  </nav></header><div class="t3-hero"><div class="acm-features"></div></div></div></body></html>`)}`

const menuOf = (/** @type {any} */ probed) =>
  probed.texts.filter((x) => /Home|About Us|Our Blog|Contact Us/.test(x.text))
const lowOf = (/** @type {any} */ worn, /** @type {any} */ plain) =>
  comparePreview(worn, plain, []).lowText.filter((x) => /Home|About Us|Our Blog|Contact Us/.test(x.text))

test(
  'preview probe: words laid over a sibling band are judged on the band, white on real white is still found',
  opts,
  async () => {
    const chrome = await browser(9674)
    try {
      const read = async (/** @type {string} */ url) => {
        await chrome.open(url, 1440)
        return chrome.evaluate(PREVIEW_PROBE)
      }
      // the template's own page: white menu on its purple hero
      const plain = await read(page({ page: '#f1f5f7', band: '#7b2ff7', menu: '#ffffff' }))
      assert.deepEqual(
        menuOf(plain).map((x) => x.ground),
        Array(4).fill({ r: 123, g: 47, b: 247, a: 1 }),
        "the template's menu is read on its hero"
      )
      // Figma: a navy accent band on a white page, white words (17:1): no low text
      const figma = await read(page({ page: '#ffffff', band: '#151444', menu: '#ffffff' }))
      assert.equal(lowOf(figma, plain).length, 0, 'white menu on the navy band reads')
      // Moxie as it was: the light periwinkle accent on a black page, white words (about 2:1): found
      const moxie = await read(page({ page: '#000000', band: '#84acfb', menu: '#ffffff' }))
      assert.equal(lowOf(moxie, plain).length, 4, 'white menu on the light periwinkle band is found')
      // no band under the header: white words on the real white page are still found
      const bare = await read(page({ page: '#ffffff', band: null, menu: '#ffffff' }))
      assert.equal(lowOf(bare, plain).length, 4, 'white menu on a real white page is found')
    } finally {
      await chrome.close()
    }
  }
)
