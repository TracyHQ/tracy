/**
 * reveal-hidden (PREV-2) finds blocks a reveal script moved off the page and never brought back. JA Space
 * Joomla 1.0.5 (19/10/2026): the Case Studies owl carousel lays its `.item.ja-animate` slides out beyond the
 * page width; each slide's reveal (`moveFromBottom … forwards`) has finished and leaves `translateY(0)`, which
 * the browser computes as the identity matrix. The probe read that as "moved off-screen by its own
 * transform" and failed PREV-2 on the home pages under every system, the template's own page alike.
 * A transform that moves nothing is no move: such a slide is laid out there, as a carousel's slides are.
 * True catches stay: a slide-in still translated off the page, and a block at opacity 0.
 * The probe runs in a real headless Chrome. Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/reveal-hidden.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

/** A carousel strip wider than the page: three slides beyond its right edge, each with `extra` styles. */
const page = (/** @type {string} */ extra) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; font: 16px/1.5 sans-serif; overflow-x: hidden }
    @keyframes moveFromBottom { from { transform: translateY(200px) } to { transform: translateY(0) } }
    .stage-outer { overflow: hidden; width: 100% }
    .stage { display: flex; width: 4000px }
    .item { width: 380px; height: 300px; margin-right: 30px; flex: none; animation: moveFromBottom 10ms ease-in-out forwards }
    .item.far { ${extra} }
  </style></head><body><div class="stage-outer"><div class="stage">
    <div class="item ja-animate"><img alt="" width="380" height="280"><span>Little Blind Text</span></div>
    <div class="item ja-animate"><span>Pointing has control</span></div>
    <div class="item ja-animate"><span>Wild Question Marks</span></div>
    <div class="item ja-animate far"><span>Far slide one</span></div>
    <div class="item ja-animate far"><span>Far slide two</span></div>
  </div></div></body></html>`)}`

test(
  'reveal-hidden: carousel slides beyond the page after a finished reveal are laid out, not hidden',
  opts,
  async () => {
    const chrome = await browser(9674)
    try {
      const read = async (/** @type {string} */ url) => {
        await chrome.open(url, 500)
        return chrome.evaluate(probe)
      }
      const laidOut = await read(page(''))
      assert.equal(detect({ worn: { data: laidOut } }).count, 0, JSON.stringify(laidOut))

      // true catches stay: a slide still translated off the page by its own transform, a block at opacity 0
      const moved = await read(page('animation: none; transform: translateX(3000px)'))
      assert.ok(detect({ worn: { data: moved } }).count >= 1, 'a slide its transform keeps off the page')
      const faded = await read(page('opacity: 0'))
      const r = detect({ worn: { data: faded } })
      assert.ok(r.count >= 1, 'a block left at opacity 0')
      assert.equal(r.findings[0].why, 'opacity')
    } finally {
      await chrome.close()
    }
  }
)
