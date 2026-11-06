/**
 * The page measures the reach checks read (`lists`, `maps`, `phones`), on an invented page in a headless Chromium: a card list
 * with an empty card, a map frame, a map script, a map link, and phone numbers in and out of a tel: link. Skipped when
 * Playwright or its browser is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-reach-measures-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { MEASURE_CAPS, measurePageInPage } from '../src/demo-qa-page-measures.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

const PAGE = `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<div class="team">
  <div class="card col"><h3>Ana Ruiz</h3><p>Coach</p></div>
  <div class="card col active"><h3>Ben Olsen</h3><p>Coach</p></div>
  <div class="card col" style="height:120px;border:1px solid #ccc"><h3></h3><a href="index.php?Itemid=9"></a></div>
</div>
<iframe src="https://www.google.com/maps/embed?pb=!1m18!2d-3.2500!3d12.5000!4m2" width="300" height="200"></iframe>
<script>window.jaMap = { mode: 'normal', locations: {"location":{"0":"Wall Rd"},"latitude":{"0":"40.7049955"},"longitude":{"0":"-74.0069912"}} }</script>
<a href="https://maps.google.com/?q=9+Quay+Lane">Directions</a>
<p>Call <a href="tel:+0005550199">+000 555 0199</a> or <span class="mobile">+000 555 0177</span></p>
</body></html>`

test('lists, maps and phones are read as a visitor sees them', opts, async () => {
  const browser = await playwright.chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.setContent(PAGE)
    const m = await page.evaluate(measurePageInPage, { tolerance: 2, stretch: 0.05, caps: MEASURE_CAPS })
    const cards = m.lists.find((l) => l.selector.includes('.card'))
    assert.equal(cards.items.length, 3, 'a state class does not split the list')
    assert.deepEqual(cards.items[2], { chars: 0, text: '', pictures: 0 })
    const byKind = Object.fromEntries(m.maps.map((x) => [x.kind, x]))
    assert.deepEqual([byKind.frame.lat, byKind.frame.lng], [12.5, -3.25])
    assert.deepEqual([byKind.script.lat, byKind.script.lng], [40.7049955, -74.0069912])
    assert.equal(byKind.link.address, '9 Quay Lane')
    const phones = Object.fromEntries(m.phones.map((p) => [p.digits, p.inTel]))
    assert.deepEqual(phones, { '0005550199': true, '0005550177': false })
  } finally {
    await browser.close()
  }
})

// An invented card row: two play buttons with an empty player address, one hidden by the write step's rule, and one with a video.
const VIDEO_PAGE = `<!doctype html><html><body style="margin:0">
<div class="card"><img src="data:," width="200" height="120"><a class="play-chip" data-src="https://www.youtube.com/embed/" href="#">Play</a></div>
<div class="card hidden-one"><a class="play-chip" data-src="https://www.youtube.com/embed/" href="#">Play</a></div>
<div class="card"><a class="play-chip" data-src="https://www.youtube.com/embed/abc123" href="#">Play</a></div>
<style>.hidden-one .play-chip[data-src$="/embed/"]{display:none!important}</style>
</body></html>`

test(
  'video controls are read with the address they open, and a control the page hides is not',
  opts,
  async () => {
    const browser = await playwright.chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.setContent(VIDEO_PAGE)
      const m = await page.evaluate(measurePageInPage, { tolerance: 2, stretch: 0.05, caps: MEASURE_CAPS })
      assert.deepEqual(
        m.videoButtons.map((b) => [b.selector, b.attribute, b.address]),
        [
          ['a.play-chip', 'data-src', 'https://www.youtube.com/embed/'],
          ['a.play-chip', 'data-src', 'https://www.youtube.com/embed/abc123']
        ]
      )
    } finally {
      await browser.close()
    }
  }
)
