/**
 * shrunk-block (LAYOUT-2) does not read the words of a heading as a block. JA Tour 1.0.4's home hero
 * (16/10/2026) sets its headline as `h1.slide-title > a.heading-link`: the template's 80px words wrap to
 * two or three lines (496 × 140, 753 × 190), Moxie's 55px display size sets them on one (475 × 50,
 * 740 × 67). The width stayed, only lines were lost; the probe counted the link as a shrunk block because
 * it is an anchor. A heading's size is the system's choice (the detector's own header), so an element
 * inside H1–H6 (or .h1–.h6) counts only when it draws a box of its own (a fill, a picture or a border).
 * A banner link that really shrank, and a filled link inside a heading, are still found.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/shrunk-block.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

/** A page at one headline size; `banner` is the height of a filled banner link below it. */
const page = (
  /** @type {number} */ size,
  /** @type {number} */ banner,
  /** @type {string} */ fillInHeading
) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#fff;font-family:serif">
  <section style="width:760px;padding:20px">
    <h1 class="slide-title" style="margin:0;font-size:${size}px;line-height:1.2;font-weight:400"><a class="heading-link" href="#" style="color:#222;text-decoration:none">Life Is Short The World Is Wide</a></h1>
    <h2 style="margin:20px 0;font-size:${size}px"><a class="pill-in-heading" href="#" style="display:block;background:${fillInHeading};color:#fff;padding:${size === 80 ? 60 : 4}px 20px">Book a tour today</a></h2>
    <a class="btn btn-block" href="#" style="display:block;box-sizing:border-box;width:720px;height:${banner}px;background:#1f7a4d;color:#fff">Become an instructor</a>
  </section></body></html>`)}`

test(
  'shrunk-block: a heading link that only lost lines is not a block; real shrunk boxes still are',
  opts,
  async () => {
    const chrome = await browser(9674)
    try {
      const read = async (/** @type {string} */ url) => {
        await chrome.open(url, 800)
        return chrome.evaluate(probe)
      }
      const plain = await read(page(80, 186, '#1f7a4d'))
      const worn = await read(page(55, 56, '#1f7a4d'))
      const r = detect({ worn: { data: worn }, plain: { data: plain } })
      const at = r.findings.map((f) => f.at).join(' | ')
      assert.doesNotMatch(at, /heading-link/, 'the hero headline only lost lines: words, not a block')
      assert.match(at, /btn-block/, 'a banner link reduced from 186 to 56px is still found')
      assert.match(at, /pill-in-heading/, 'a link inside a heading that draws its own fill is still a block')
    } finally {
      await chrome.close()
    }
  }
)
