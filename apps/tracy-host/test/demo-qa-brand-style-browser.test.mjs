/**
 * The browser half of the brand style guard (#378) on an invented page: a read with the style and with it off on both sides of
 * the switch, nothing left behind on the page. Launches its own headless Chromium; skipped when Playwright is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-brand-style-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { BRAND_STYLE_CAPS, readBrandStyle } from '../src/demo-qa-brand-style.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

const page = (style, bodyClass = 'dark-active') => `<!doctype html><html><head><style>
:root{--main:#7a3ff2}
a{color:var(--main);transition:color 1s;border-radius:0}
.light-active{background:#fff}
.dark-active{background:#111}
</style></head><body class="${bodyClass}"><a href="#x" class="link">Go</a><p style="display:none">Hidden</p>${style}</body></html>`

const read = async (browser, html) => {
  const tab = await (await browser.newContext()).newPage()
  await tab.setContent(html)
  const answer = await readBrandStyle(tab)
  return { tab, answer }
}

test('no style on the page reads as not worn', opts, async () => {
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const { answer } = await read(browser, page(''))
    assert.deepEqual(answer, { worn: false })
  } finally {
    await browser.close()
  }
})

test('both sides are read, each difference named once, and the page is left as it was', opts, async () => {
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const style =
      '<style id="tracy-ds-slot">/* tracy-ds-slot: x */:root{--main:#0a7d6e}.dark-active a{border-radius:18px}</style>'
    const { answer, tab } = await read(browser, page(style))
    assert.equal(answer.worn, true)
    assert.equal(answer.opening, 'dark')
    assert.deepEqual(Object.keys(answer.sides), ['dark', 'light'])
    const moved = (side, prop) => answer.sides[side].changes.find((c) => c.prop === prop)
    assert.equal(moved('dark', 'color').with, 'rgb(10, 125, 110)')
    assert.equal(moved('dark', 'color').without, 'rgb(122, 63, 242)')
    assert.equal(moved('dark', 'color').sample, 'a.link')
    assert.equal(moved('dark', 'border-top-left-radius').with, '18px')
    assert.equal(moved('light', 'border-top-left-radius'), undefined, 'the switch really moved')
    assert.ok(answer.sides.dark.colours.some((c) => c.colour === 'rgb(10, 125, 110)'))
    assert.ok(!answer.sides.dark.changes.some((c) => c.prop.startsWith('--')))
    const after = await tab.evaluate(() => ({
      body: document.body.className,
      disabled: document.getElementById('tracy-ds-slot').sheet.disabled,
      styles: document.querySelectorAll('style').length,
      colour: getComputedStyle(document.querySelector('a')).color
    }))
    assert.deepEqual(after, { body: 'dark-active', disabled: false, styles: 2, colour: 'rgb(10, 125, 110)' })
    assert.ok(BRAND_STYLE_CAPS.changes > 0)
  } finally {
    await browser.close()
  }
})
