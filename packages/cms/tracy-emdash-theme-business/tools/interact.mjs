#!/usr/bin/env node
// Interaction checks with a real browser: language menu, Resources mega panel, theme toggle,
// article table of contents, filter chips. Keyboard AND pointer, with dismiss paths. Writes a JSON
// report; exit 1 when any check fails.
//   node tools/interact.mjs <base-url> <out-file.json> [--article /news/<slug>]
import { writeFileSync } from 'node:fs'
import { launchBrowser } from './qa-browser.mjs'
const [base, out] = process.argv.slice(2)
const opt = (n, d) => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? process.argv[i + 1] : d
}
const article = opt('--article', '/news/four-common-mistakes-in-heavy-machine-foundation-design')
if (!base || !out) {
  console.error('usage: interact.mjs <base-url> <out.json>')
  process.exit(2)
}
// The renderer is chosen once, in qa-browser.mjs: Playwright's own Chromium by default (the build
// the lockfile pins), the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no
// silent fallback either way. This file used to prefer the installed Chrome — measured 2026-09-16,
// that is 152.0.7977.84 against the lockfile's 153.0.8010.12, and Chrome updates itself, so two
// runs a week apart could not be compared and nothing in the output said which had drawn them.
const browser = await launchBrowser()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`)
}
const menuOpen = () => page.$$eval('[role=menu]', (els) => els.filter((e) => e.checkVisibility()).length)
const popOpen = () =>
  page.$$eval(
    '[data-slot=popover-content], [role=dialog]',
    (els) => els.filter((e) => e.checkVisibility()).length
  )

await page.goto(`${base}/about`, { waitUntil: 'networkidle' })
// Language menu: pointer open, item links, Escape closes, outside click closes, keyboard open.
const langBtn = page.locator('[data-slot=dropdown-menu-trigger]').first()
await langBtn.click()
await page.waitForTimeout(300)
const items = await page.$$eval('[role=menu] a', (as) =>
  as.map((a) => ({ href: a.getAttribute('href'), lang: a.getAttribute('lang'), text: a.textContent.trim() }))
)
check('language menu opens on click', (await menuOpen()) === 1, items)
check(
  'language menu links to the RU translation',
  items.some((i) => i.lang === 'ru' && i.href === '/ru/about') &&
    items.some((i) => i.lang === 'en' && i.href === '/about')
)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
check('language menu closes on Escape', (await menuOpen()) === 0)
await langBtn.click()
await page.waitForTimeout(200)
await page.mouse.click(640, 600)
await page.waitForTimeout(200)
check('language menu closes on outside click', (await menuOpen()) === 0)
await langBtn.focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const focusedInMenu = await page.evaluate(() => !!document.activeElement?.closest('[role=menu]'))
check('language menu opens with Enter and moves focus inside', (await menuOpen()) === 1 && focusedInMenu)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// Resources mega panel
const resBtn = page.locator('[data-slot=popover-trigger]').first()
await resBtn.click()
await page.waitForTimeout(300)
const cols = await page.$$eval('[data-slot=popover-content] a', (as) => as.length)
check('resources panel opens with links', (await popOpen()) === 1 && cols >= 10, { links: cols })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
check('resources panel closes on Escape', (await popOpen()) === 0)
await resBtn.click()
await page.waitForTimeout(200)
await page.mouse.click(640, 700)
await page.waitForTimeout(200)
check('resources panel closes on outside click', (await popOpen()) === 0)
await resBtn.focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
check('resources panel opens with Enter', (await popOpen()) === 1)
await page.keyboard.press('Escape')
check('page still usable after dismiss (main visible)', await page.$eval('main', (e) => e.checkVisibility()))

// Theme toggle: click -> html[data-theme=dark], persisted across reload, label flips.
const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const label = () => page.$eval('.ng-theme-toggle .ng-theme-label', (e) => e.textContent.trim())
const before = await label()
await page.click('.ng-theme-toggle')
await page.waitForTimeout(200)
check('theme toggle switches to dark', (await theme()) === 'dark' && (await label()) !== before, {
  before,
  after: await label(),
  bodyBg: await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
})
await page.reload({ waitUntil: 'networkidle' })
check(
  'dark theme persists across reload',
  (await theme()) === 'dark' && (await page.evaluate(() => localStorage.getItem('ngi-theme'))) === 'dark'
)
await page.click('.ng-theme-toggle')
await page.waitForTimeout(200)
check('theme toggles back to light', (await theme()) === 'light')

// Article TOC + share copy button
await page.goto(`${base}${article}`, { waitUntil: 'networkidle' })
const tocLinks = await page.$$('[data-toc-link]')
if (tocLinks.length) {
  const target = await tocLinks[2].getAttribute('data-toc-link')
  await tocLinks[2].click()
  await page.waitForTimeout(900)
  const y = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top, target)
  const active = await page.$eval(`[data-toc-link="${target}"]`, (e) => e.classList.contains('border-signal'))
  check(
    'TOC link scrolls to its heading and becomes active',
    y !== undefined && y < 160 && y > -5 && active,
    { top: Math.round(y), target }
  )
} else check('TOC present on the article', false)
check(
  'share buttons present (LinkedIn, Facebook, copy)',
  (await page.$$('[data-share] a, [data-share] button')).length === 3
)

// Filter chips are real links
await page.goto(`${base}/projects`, { waitUntil: 'networkidle' })
const chip = page.locator('a.chip').first()
const chipHref = await chip.getAttribute('href')
await chip.click()
await page.waitForLoadState('networkidle')
check(
  'project filter chip navigates to a sector archive',
  page.url().endsWith(chipHref) && (await page.$$eval('a.chip-active', (els) => els.length)) === 1,
  { url: page.url() }
)

check('no console/page errors during interactions', errors.length === 0, errors.slice(0, 3))
await browser.close()
const pass = results.filter((r) => r.pass).length
writeFileSync(
  out,
  JSON.stringify({ base, at: new Date().toISOString(), pass, total: results.length, results }, null, 2)
)
console.log(`${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
