/**
 * A glare block is a light fill seen on a dark worn page. JA Essence 1.0.9 (16/10/2026) keeps its article
 * carousel as a picture band: each card keeps the template's cream ground (#fdf6f2) under a photo laid
 * edge to edge (card 355x362, photo 355x362 at 1440), so no cream pixel shows; on the dark side the
 * probe still read the card's fill and reported a cream glare block (TPL-1). A block whose whole box a
 * picture inside it covers is not glare; a cream card whose photo covers only part of it still is.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is here.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { comparePreview, PREVIEW_PROBE } from '../src/sites/design-system-preview-probe.js'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

// a photo: a 10x10 SVG picture stretched over its box
const PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#8a7f72"/></svg>')}`

/** A page of three carousel cards on `ground`; each photo covers `cover` of its card's height. */
const page = (/** @type {{ ground: string, cover: number }} */ o) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: ${o.ground} }
    .slider { display: flex; gap: 32px; padding: 40px 156px; height: 1200px }
    .item-inner { position: relative; width: 355px; height: 362px; background: #fdf6f2 }
    .item-inner img { display: block; width: 100%; height: ${Math.round(o.cover * 100)}% }
    .item-inner h3 { position: absolute; left: 20px; bottom: 20px; margin: 0; color: #fff; font: 24px sans-serif }
  </style></head><body><div class="slider">
    ${[1, 2, 3].map((i) => `<div class="item-inner"><img src="${PHOTO}" alt=""><h3>Card ${i}</h3></div>`).join('')}
  </div></body></html>`)}`

const glareOf = (/** @type {any} */ worn, /** @type {any} */ plain) =>
  comparePreview(worn, plain, []).glare.filter((g) => /item-inner/.test(g.at))

test(
  'preview probe: a card its photo covers whole is not glare; a card showing its cream fill still is',
  opts,
  async () => {
    const chrome = await browser(9676)
    try {
      const read = async (/** @type {string} */ url) => {
        await chrome.open(url, 1440)
        return chrome.evaluate(PREVIEW_PROBE)
      }
      // the template's own light page
      const plain = await read(page({ ground: '#f8f8ff', cover: 1 }))
      // a dark worn page, the photos edge to edge: nothing of the cream is seen
      const covered = await read(page({ ground: '#000000', cover: 1 }))
      assert.equal(glareOf(covered, plain).length, 0, 'a fully covered card is not glare')
      // a dark worn page, the photos over half of each card: the cream half glares
      const half = await read(page({ ground: '#000000', cover: 0.5 }))
      assert.equal(glareOf(half, plain).length, 3, 'a card showing its cream fill is glare')
    } finally {
      await chrome.close()
    }
  }
)
