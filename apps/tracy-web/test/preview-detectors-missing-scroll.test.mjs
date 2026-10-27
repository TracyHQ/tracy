/**
 * missing-element (LAYOUT-3) compares what each page shows by element path. JA Vogue Joomla 1.0.8 (22/10/2026):
 * the back-to-top arrow (`#back-to-top i`) is shown only once the page is scrolled (a scroll handler toggles a
 * class on <body>), and the page is measured after a walk down it that ends back at the top. One take caught the
 * template's page before its handler had hidden the arrow again and the worn page after, and read it as an arrow
 * the system lost; the next take found nothing. An element whose visibility follows the scroll position is
 * compared at the same scroll state on both pages: at the top, settled, and scrolled down. A system that hides it
 * in every state still loses it.
 * The probe runs in a real headless Chrome; skipped when no Chrome is here.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as missingElement from '../scripts/preview-detectors/missing-element.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

/**
 * A tall page with a back-to-top button its script shows once the page is scrolled past `from` px, a quarter
 * of a second after the scroll stops (a debounced handler, as many templates write it); `wear` extra styles.
 */
const page = (/** @type {string} */ wear = '', from = 100) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif } main { height: 4000px }
  #back-to-top { display: none; position: fixed; right: 20px; bottom: 20px; width: 40px; height: 40px; background: #222 }
  #back-to-top i { display: block; width: 24px; height: 24px; margin: 8px; background: #fff }
  body.top-away #back-to-top { display: block } ${wear}</style></head><body>
  <main><section class="intro"><h1>A page</h1><p>Words of the page.</p></section></main>
  <div id="back-to-top"><a href="#top"><i class="fa fa-chevron-up"></i></a></div>
  <script>let t; addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => document.body.classList.toggle('top-away', scrollY > ${from}), 250) })</script>
  </body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9696)
})
after(async () => chrome?.close?.())

/**
 * The page opened and measured as preview-check does (probe, then the detector's read step). `stale`: the page
 * is measured right after it came back to the top, before its handler hid the button again.
 */
const measure = async (/** @type {string} */ url, { stale = false, at = 1500 } = {}) => {
  await chrome.open(url, 1440)
  if (stale)
    await chrome.evaluate(
      `(async () => { scrollTo(0, ${at}); await new Promise((r) => setTimeout(r, 600)); scrollTo(0, 0); return 1 })()`
    )
  const data = await chrome.evaluate(missingElement.probe)
  return missingElement.read ? missingElement.read(chrome, data) : data
}

test(
  'missing-element: a button shown only on scroll, caught shown on one page and hidden on the other, is not lost',
  opts,
  async () => {
    const plain = await measure(page(), { stale: true })
    // the take this guards: the template's page read the arrow as shown at the top
    assert.ok(
      plain.elements.some((/** @type {any} */ e) => e.at === 'i.fa.fa-chevron-up' && e.area > 0),
      'the template page was measured with the button still shown'
    )
    const worn = await measure(page())
    const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
    assert.equal(r.count, 0, JSON.stringify(r.findings))
  }
)

test('missing-element: the same timing the other way round is not a loss either', opts, async () => {
  const plain = await measure(page())
  const worn = await measure(page(), { stale: true })
  const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test('missing-element: a scroll-shown button the system hides in every state stays lost', opts, async () => {
  const plain = await measure(page(), { stale: true })
  const worn = await measure(page('#back-to-top { display: none !important }'))
  const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
  assert.ok(r.count > 0, 'the hidden button is lost')
})

test(
  'missing-element: a button shown beyond the read step reach, hidden by the system everywhere, stays lost',
  opts,
  async () => {
    // shown past 1800 px, beyond SCROLL_STATES.down: only the measure itself saw it shown on the template's page
    assert.ok(missingElement.SCROLL_STATES.down < 1800)
    const plain = await measure(page('', 1800), { stale: true, at: 2500 })
    assert.ok(
      plain.elements.some((/** @type {any} */ e) => e.at === 'i.fa.fa-chevron-up' && e.area > 0),
      'the template page was measured with the button still shown'
    )
    const worn = await measure(page('#back-to-top { display: none !important }', 1800))
    const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
    assert.ok(r.count > 0, 'the hidden button is lost')
  }
)

test('missing-element: the read step leaves the page where it found it', opts, async () => {
  const data = await measure(page())
  assert.equal(await chrome.evaluate('scrollY'), 0)
  assert.equal(await chrome.evaluate(`document.body.classList.contains('top-away')`), false)
  assert.ok(Array.isArray(data.elements))
})
