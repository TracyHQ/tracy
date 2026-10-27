/**
 * empty-block reads what the page paints UNDER a box, not only its ancestors' fills. JA Vogue 1.0.7's
 * article layout 2 (`.item-page.type-1`, 18/10/2026): the hero photo is a sibling `figure > img`, and
 * `div.content-info` (about 720 × 226 px, white title and info line) is laid over it with
 * `position: absolute`. The probe took the words' ground from the ancestors (the light page), found
 * white on white, and reported the title block as empty under Moxie and Figma light: a false finding,
 * the words stand on the photo (photo-text judges words on pictures).
 * The probe runs in a real headless Chrome on that shape: a box over a loaded photo is seen; the same
 * box over a photo that never loaded, or over a fill laid between it and the photo, is still a finding.
 * Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/empty-block.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

// a dark photo: a loaded picture with its own pixels
const PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#3b2f2a"/><circle cx="80" cy="45" r="30" fill="#6d5a4e"/></svg>')}`

/**
 * The Vogue hero: a photo, the title block laid over it in white. `src` is the photo's address,
 * `veil` a fill laid between the photo and the block, `top` pushes the hero below the first screen.
 */
const hero = (
  /** @type {{ src?: string, veil?: boolean, top?: number }} */ { src = PHOTO, veil = false, top = 40 } = {}
) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: #f6f1e7; font: 16px/1.5 sans-serif }
    .main-top { position: relative; width: 1170px; margin: ${top}px auto 40px }
    .item-image { margin: 0 } .item-image img { display: block; width: 1170px; height: 600px; object-fit: cover }
    .veil { position: absolute; inset: 0; background: #f6f1e7 }
    .content-info { position: absolute; top: 50%; left: 50%; z-index: 9; width: 720px; min-height: 226px; transform: translate(-50%, -50%); color: #fff; text-align: center }
    .content-info h1 { color: #fff; font-size: 44px; margin: 0 0 24px } .article-info { color: #fff; display: flex; justify-content: center; gap: 16px; margin: 0 }
  </style></head><body><div class="item-page type-1"><div class="main-top">
    <figure class="pull-left item-image"><img src="${src}" width="1727" height="1152"></figure>
    ${veil ? '<div class="veil"></div>' : ''}
    <div class="content-info"><div class="article-aside"><dl class="article-info text-muted"><dt hidden>Details</dt>
      <dd class="category-name">Category: <a href="#" style="color:#fff">Fashion</a></dd><dd class="published"><time>Dec 6, 2023</time></dd></dl></div>
      <div class="page-header"><h1>Glowing from Within: The ultimate guide to radiant skin care</h1></div></div>
  </div></div><p style="height:1600px">Article body.</p></body></html>`)}`

test('empty-block: a box laid over a loaded photo stands on it and is seen', opts, async () => {
  const chrome = await browser(9673)
  try {
    const read = async (/** @type {string} */ url) => {
      await chrome.open(url, 800)
      return chrome.evaluate(probe)
    }
    const info = (/** @type {any[]} */ data) => data.find((b) => /content-info/.test(b.at))

    for (const top of [40, 1400]) {
      const onPhoto = await read(hero({ top }))
      assert.ok(info(onPhoto), `the title block is a large box the probe reads (hero at ${top} px)`)
      assert.equal(info(onPhoto).seen, 'on picture', `the white words stand on the photo (hero at ${top} px)`)
      assert.equal(detect({ worn: { data: onPhoto }, plain: { data: onPhoto } }).count, 0)
    }

    // true catches stay: the photo never loaded, or a fill between the photo and the block hides it
    // (the photo that never loaded leaves the whole hero showing nothing: the outermost box is the hero)
    for (const [why, url, at] of [
      ['a photo that never loaded', hero({ src: 'missing-photo.jpg' }), /item-page/],
      ['a fill laid between the photo and the block', hero({ veil: true }), /content-info/]
    ]) {
      const lost = await read(/** @type {string} */ (url))
      const r = detect({ worn: { data: lost }, plain: { data: lost } })
      assert.equal(r.count, 1, `white words over ${why} still show nothing`)
      assert.match(r.findings[0].at, /** @type {RegExp} */ (at))
    }
  } finally {
    await chrome.close()
  }
})
