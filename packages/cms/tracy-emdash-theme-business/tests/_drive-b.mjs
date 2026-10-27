// Drives the B flow in a headless Chrome with a signed session cookie (no extension needed).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const S = process.env.S
const token = readFileSync(`${S}/sess.txt`, 'utf8').trim()
const text = async (page, sel) =>
  (await page
    .locator(sel)
    .first()
    .textContent()
    .catch(() => '')) ?? ''
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } })
await ctx.addCookies([{ name: 'tracy_sess', value: token, domain: 'tracy.test', path: '/' }])
const page = await ctx.newPage()
const log = []
page.on('console', (m) => {
  if (/design-inspiration|site-build|handoff/.test(m.text())) log.push(m.text().slice(0, 160))
})
await page.goto('http://tracy.test:8080/new/?tab=tracy:design-inspiration&open=tracy-business', {
  waitUntil: 'load'
})
await page.waitForTimeout(9000)
await page.screenshot({ path: `${S}/b1.png` })
const dialog = await page.locator('[role=dialog]').count()
const btn = page.locator('button[title^="Create a Emdash"]').first()
const btnCount = await btn.count()
console.log(
  'url1',
  page.url(),
  '| dialog',
  dialog,
  '| create-with-emdash buttons',
  btnCount,
  '| body:',
  (await page.locator('body').innerText()).slice(0, 160).replace(/\n/g, ' ')
)
if (btnCount) {
  await btn.click()
  const t0 = Date.now()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${S}/b2.png` })
  console.log(
    'after press: url',
    page.url(),
    '| build tab:',
    (await text(page, '.tracy-site-build')).slice(0, 160)
  )
  await page
    .waitForURL((u) => !u.pathname.startsWith('/new'), { timeout: 60000 })
    .catch(() => console.log('no navigation within 60s'))
  console.log('navigated in', Date.now() - t0, 'ms →', page.url())
  await page.waitForTimeout(14000)
  await page.screenshot({ path: `${S}/b3.png` })
  console.log(
    'site page body:',
    (await page.locator('body').innerText()).slice(0, 120).replace(/\n/g, ' '),
    '| build form:',
    (await text(page, '.tracy-site-build')).slice(0, 300)
  )
  console.log('build tabs:', await page.locator('.tracy-site-build').count())
}
console.log('console:', log.slice(0, 6))
await browser.close()
