/**
 * The preview probe reads only words a visitor can see. JA Social II Joomla 1.0.4 (19/10/2026): the
 * home slider's dots carry their slide titles ("Chat anywhere"), pushed half out of a 14px dot by
 * text-indent; under a system the contract paints those labels transparent at size 0, yet the probe
 * still read them as black words on the system's dark dot fill (2.37:1, CON-2). Words in a fully
 * transparent colour or at size 0 are no text. Black words on a dark fill are still found.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is here.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { comparePreview, PREVIEW_PROBE } from '../src/sites/design-system-preview-probe.js'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

/** Three slide dots with their titles inside; `dot` the dots' fill, `label` extra styles for the titles. */
const page = (/** @type {string} */ dot, /** @type {string} */ label) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    body { margin: 0; background: #ffffff; font: 14px/1.5 sans-serif }
    ol { list-style: none; padding: 40px }
    li { display: inline-block; width: 14px; height: 14px; border-radius: 50%; overflow: hidden; text-indent: -30px;
      line-height: 30px; margin-right: 5px; color: #000000; background: ${dot}; ${label} }
  </style></head><body><ol class="carousel-indicators"><li>Matches</li><li>Chat anywhere</li><li>Photo Galleries</li></ol></body></html>`)}`

const dotsOf = (/** @type {any} */ worn, /** @type {any} */ plain) =>
  comparePreview(worn, plain, []).lowText.filter((x) => /Matches|Chat anywhere|Photo Galleries/.test(x.text))

test(
  'preview probe: transparent or size-0 words are not read, black words on a dark dot still are',
  opts,
  async () => {
    const chrome = await browser(9675)
    try {
      const read = async (/** @type {string} */ url) => {
        await chrome.open(url, 1440)
        return chrome.evaluate(PREVIEW_PROBE)
      }
      const plain = await read(page('transparent', ''))
      const hidden = await read(page('#4c4a42', 'color: transparent; font-size: 0'))
      assert.equal(dotsOf(hidden, plain).length, 0, 'labels hidden under the system are not low text')
      const shown = await read(page('#4c4a42', ''))
      assert.equal(dotsOf(shown, plain).length, 3, 'black labels on the dark dots are still found')
    } finally {
      await chrome.close()
    }
  }
)
