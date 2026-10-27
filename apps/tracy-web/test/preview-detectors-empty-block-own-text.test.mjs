/**
 * empty-block reads the words a box draws as its OWN text node, not only those of its descendants.
 * JA Sensei 1.0.5's call-to-action banner (`a.btn.btn-success.btn-block`, about 1170 × 186 px, 16/10/2026)
 * writes its words straight into the anchor; its only element child is the arrow icon span, which draws
 * through a pseudo element and has no text. The probe read only descendants, found nothing seen, and
 * reported the banner as an empty block on both the template's own preview and every system: a false
 * finding. The probe runs in a real headless Chrome on that shape: readable own words are seen, own
 * words the colour of the box's ground are still not.
 * Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/empty-block.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

/** The Sensei banner: words as the anchor's own text node, an icon span with no text of its own. */
const banner = (/** @type {string} */ colour) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
    .ico::before { content: "\\2192"; }
  </style></head><body style="margin:0;background:#ffffff"><section style="padding:40px">
    <a class="btn btn-success btn-block" href="#" style="display:block;box-sizing:border-box;width:1170px;height:186px;padding:60px 40px;background:#1f7a4d;color:${colour};font:600 28px/1.4 sans-serif;text-decoration:none">Become an instructor and share your knowledge <span class="ico"></span></a>
  </section></body></html>`)}`

test(
  'empty-block: a box whose words are its own text node is seen when they read on its ground',
  opts,
  async () => {
    const chrome = await browser(9672)
    try {
      const read = async (/** @type {string} */ url) => {
        await chrome.open(url, 800)
        return chrome.evaluate(probe)
      }
      const readable = await read(banner('#ffffff'))
      const box = readable.find((b) => /btn-block/.test(b.at))
      assert.ok(box, 'the banner is a large box the probe reads')
      assert.equal(box.seen, 'text', "the banner's own words are seen")
      assert.equal(detect({ worn: { data: readable }, plain: { data: readable } }).count, 0)

      const lost = await read(banner('#1f7a4d'))
      const r = detect({ worn: { data: lost }, plain: { data: readable } })
      assert.equal(r.count, 1, 'own words the colour of the ground still show nothing')
      assert.match(r.findings[0].at, /btn-block/)
      assert.equal(r.findings[0].by, 'system')
    } finally {
      await chrome.close()
    }
  }
)
