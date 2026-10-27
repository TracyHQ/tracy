/**
 * heading-edge (LAYOUT-1): Akemi's eye check of JA Symphony Joomla 1.0.4 (19/10/2026). The hero title,
 * 200px in the template's narrow brush face inside an 800px box, took a system's wide display face at the
 * same size: "Symphony." ran out of its box to the window's right edge while every rule passed. A heading
 * whose words reach the window's edge under the system, where they sat inside it on the template's page,
 * is one finding; one that only grows inside its box, or that already touched the edge on the template's
 * page, is not.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as headingEdge from '../scripts/preview-detectors/heading-edge.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #111; color: #fff }
  .hero { max-width: 800px; margin: auto; text-align: center }
  .hero h1 { font: 200px/1.1 serif; letter-spacing: -0.05em; margin: 0 }
  .intro h2 { font-size: 32px; text-align: center }
  ${wear}</style></head><body>
  <div class="hero"><h1>We are Sym.</h1></div>
  <div class="intro"><h2>New album now available</h2></div></body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9695)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url) => {
  await chrome.open(url, 1440)
  return chrome.evaluate(headingEdge.probe)
}

test('heading-edge: a hero title a wider face pushes past the window is found', opts, async () => {
  const plain = await read(page(''))
  const worn = await read(page('.hero h1 { letter-spacing: 0.25em; white-space: nowrap }'))
  const r = headingEdge.detect({ worn: { data: worn }, plain: { data: plain } })
  assert.equal(r.count, 1, JSON.stringify(r.findings))
  assert.match(r.findings[0].at, /h1/)
})

test(
  'heading-edge: a title whose words spill out of its box, clear of the window, is found',
  opts,
  async () => {
    const plain = await read(page(''))
    const worn = await read(page('.hero h1 { letter-spacing: 0.1em; white-space: nowrap }'))
    const r = headingEdge.detect({ worn: { data: worn }, plain: { data: plain } })
    assert.equal(r.count, 1, JSON.stringify(r.findings))
    assert.match(r.findings[0].why, /past its own box/)
  }
)

test('heading-edge: a title that grows inside its box, or fits again, is not', opts, async () => {
  const plain = await read(page(''))
  const bigger = await read(page('.hero h1 { font-size: 150px } .intro h2 { font-size: 40px }'))
  assert.equal(headingEdge.detect({ worn: { data: bigger }, plain: { data: plain } }).count, 0)
})

// JA Mood Joomla 1.0.4 (dot 3, 19/10/2026): the video carousel's last card title sits 9px from a 1440px window's
// right edge on the template's own page (1353-1431px); worn, a wider face moves it 2px (1351-1433px). It neither
// spills out of its box nor comes meaningfully closer to the edge: the template put it there. A title that starts
// near the edge and is pushed further than `inside` px toward it is still found.
const heading = (/** @type {number} */ left, /** @type {number} */ right) => ({
  path: 'body>div.video-list>h5',
  at: 'h5.article-title',
  text: 'Cut To The Feeling',
  left,
  right,
  boxLeft: 1340,
  boxRight: 1440,
  w: 1440
})

test('heading-edge: a title the template already set near the edge is not found when worn moves it a hair', () => {
  const r = headingEdge.detect({
    worn: { data: [heading(1351, 1433)] },
    plain: { data: [heading(1353, 1431)] }
  })
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test('heading-edge: a title near the edge that worn pushes to it is still found', () => {
  const r = headingEdge.detect({
    worn: { data: [heading(1345, 1438)] },
    plain: { data: [heading(1353, 1431)] }
  })
  assert.equal(r.count, 1, JSON.stringify(r.findings))
})
