/**
 * missing-element (LAYOUT-3) read JA Symphony Joomla's article carousel as losing a slide: on the
 * template's page the next slide's title peeks in at the viewport's right edge (1407px of a 1440px
 * page), a system's wider gutter moves it to 1450px, past the edge, inside the carousel's clipped
 * track (owl-stage-outer, overflow hidden, wider content). A slide past the edge of its carousel is
 * reached by the carousel, not lost (dot 3, 19/10/2026). A link pushed out of a clipped row that is
 * not a carousel stays found.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as missingElement from '../scripts/preview-detectors/missing-element.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

const page = (/** @type {string} */ outer, /** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #f5f3ee; color: #222 }
  .track { margin-left: 100px; width: 1240px; overflow: hidden }
  .stage { display: flex; width: 4000px }
  .item { flex: none; width: 300px; margin-right: 110px }
  ${wear}</style></head><body>
  <section class="mod"><div class="${outer}"><div class="stage">
  ${Array.from({ length: 6 }, (_, i) => `<div class="item"><h4><a href="#a${i}">Article title ${i}</a></h4></div>`).join('')}
  </div></div></section></body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9694)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url) => {
  await chrome.open(url, 1440)
  return chrome.evaluate(missingElement.probe)
}

test('missing-element: a carousel slide moved just past the viewport edge is not lost', opts, async () => {
  // the template: the fourth title starts at 1330px, a sliver inside the 1440px viewport
  const plain = await read(page('owl-stage-outer track', ''))
  const worn = await read(page('owl-stage-outer track', '.item { margin-right: 160px }'))
  const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test(
  'missing-element: a link pushed out of a clipped row that is no carousel stays found',
  opts,
  async () => {
    const plain = await read(page('row track', ''))
    const worn = await read(page('row track', '.item { margin-right: 160px }'))
    const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
    assert.ok(r.count > 0, 'the clipped link is lost')
  }
)
