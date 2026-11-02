/**
 * The header a visitor sees, read in a real browser from an invented bakery page: the logo, the menu with its groups,
 * dropdown entries and `#` links (not the off-canvas copy), the buttons and the other text. Skipped without Chromium.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { openContext, renderPage } from '../content-coverage/lib/render.mjs'

const FIXTURE = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'header', 'page.html')
).href

async function launch() {
  try {
    const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
    const chromium = mod.chromium ?? mod.default?.chromium
    return chromium ? await chromium.launch() : null
  } catch {
    return null
  }
}

test('the header extraction finds the logo, every menu entry, the buttons and the header text', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const ctx = await openContext(browser, 'desktop')
    const r = await renderPage(ctx, FIXTURE, { screenshot: false })
    await ctx.close()
    const h = r.data.header
    assert.equal(h.found, true)
    assert.deepEqual(h.logo, { image: 'logo.png', alt: 'Crumb and Co', text: null, href: '/' })
    assert.deepEqual(
      h.menu.map((m) => [m.text, m.href, m.depth, m.visible]),
      [
        ['Home', '/', 0, true],
        ['Breads', '/breads', 0, true],
        ['About', null, 0, true],
        ['Our Team', '/about/team', 1, false],
        ['Gift cards', '#', 0, true]
      ]
    )
    assert.deepEqual(
      h.buttons.map((b) => [b.text, b.href, b.iconOnly]),
      [
        ['Order a cake', '/order', false],
        ['Toggle navigation', null, true]
      ]
    )
    assert.deepEqual(
      h.texts.map((x) => x.value),
      ['Open daily from 7am']
    )
  } finally {
    await browser.close()
  }
})
