/** Measure the shipped theme's header with the public WordPress block markup and core styles. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const theme = 'packages/cms/tracy-wordpress-theme/src/tracy-base/assets/css/'
const css = ['tracy.css', 'layout.css', 'tracy-base.css']
  .map((name) => readFileSync(theme + name, 'utf8'))
  .join('\n')
const fixture = readFileSync('tests/regression/fixtures/wordpress-base-header.html', 'utf8')
const browser = await chromium.connectOverCDP(process.env.REG_CDP ?? 'http://127.0.0.1:9222')
const context = await browser.newContext()
await context.route('**/*', (route) => route.abort())
const page = await context.newPage()
for (const name of ['Desert Lantern Studio', 'AReallyLongBusinessNameWithoutAnySpaces', 'Studio']) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.setContent(fixture)
    await page.addStyleTag({ content: css })
    await page.locator('.tracy-brand a').evaluate((node, text) => {
      node.textContent = text
    }, name)
    const state = await page.evaluate(() => {
      const menu = document
        .querySelector('.wp-block-navigation__responsive-container-open')
        .getBoundingClientRect()
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        menuLeft: menu.left,
        menuRight: menu.right
      }
    })
    assert(state.scroll <= width, `${name} at ${width}px overflows: ${JSON.stringify(state)}`)
    if (width < 782) assert(state.menuLeft >= 0 && state.menuRight <= width, 'Menu stays within the viewport')
    console.log('PASS', name, width, JSON.stringify(state))
  }
}
// Shared Chrome is borrowed. Disconnect by exiting, never close its browser or contexts.
process.exit(0)
