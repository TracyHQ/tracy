/**
 * empty-block looks through a dimming scrim. JA Morgan WordPress 1.1.16's masthead (about-us, services,
 * every inner page, 19/10/2026) is a core cover block: the photo is an `img`, the dimming is an opaque
 * span laid over it at CSS opacity .6, and the white title sits on top. The probe met the span's fill
 * first, took it for a ground that hides the photo, read the words' ground off the light page and
 * reported the title as empty under Moxie and Figma light: a false finding (photo-text judges words
 * on pictures). A fill drawn at full opacity between the photo and the words is still a finding.
 * Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/empty-block.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

const PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#3b2f2a"/><circle cx="80" cy="45" r="30" fill="#6d5a4e"/></svg>')}`

/** The core cover block: photo, dimming span at `dim` opacity, white words on top. */
const cover = (/** @type {number} */ dim) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: #f6f1e7; font: 16px/1.5 sans-serif }
    .wp-block-cover { position: relative; display: flex; align-items: center; justify-content: center; min-height: 360px; margin: 40px 0 }
    .wp-block-cover__background { position: absolute; inset: 0; z-index: 1; background: #000; opacity: ${dim} }
    .wp-block-cover__image-background { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0 }
    .wp-block-cover__inner-container { position: relative; z-index: 1; width: 1140px; min-height: 209px; color: #fff; text-align: center }
    h1 { color: #fff; font-size: 48px; margin: 0 0 16px }
  </style></head><body><div class="wp-block-cover ja-masthead">
    <span aria-hidden="true" class="wp-block-cover__background has-background-dim-60 has-background-dim"></span>
    <img class="wp-block-cover__image-background" alt="" src="${PHOTO}">
    <div class="wp-block-cover__inner-container"><h1>About Us</h1><p>Quisque dolor fringilla semper, libero hendrerit allis, magna augue putate.</p></div>
  </div><p style="height:1600px">Page body.</p></body></html>`)}`

test('empty-block: words over a photo dimmed by a translucent scrim stand on the picture', opts, async () => {
  const chrome = await browser(9675)
  try {
    const read = async (/** @type {string} */ url) => {
      await chrome.open(url, 800)
      return chrome.evaluate(probe)
    }
    const inner = (/** @type {any[]} */ data) => data.find((b) => /inner-container/.test(b.at))

    const dimmed = await read(cover(0.6))
    assert.ok(inner(dimmed), 'the inner container is a large box the probe reads')
    assert.equal(inner(dimmed).seen, 'on picture', 'the white words stand on the dimmed photo')
    assert.equal(detect({ worn: { data: dimmed }, plain: { data: dimmed } }).count, 0)

    // true catch stays: an opaque fill at full opacity hides the photo, white words on it over a light page
    const hidden = await read(
      cover(1).replace(encodeURIComponent('background: #000'), encodeURIComponent('background: #f6f1e7'))
    )
    const r = detect({ worn: { data: hidden }, plain: { data: hidden } })
    assert.equal(r.count, 1, 'white words over an opaque light fill still show nothing')
    assert.match(r.findings[0].at, /inner-container|wp-block-cover/)
  } finally {
    await chrome.close()
  }
})
