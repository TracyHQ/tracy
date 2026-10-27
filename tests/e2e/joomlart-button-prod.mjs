/**
 * Click-through from joomlart.com: the product page's Download button → aMember sign-in →
 * cowork.tracy.ai/signin/joomlart/callback → /new?template=<id>. Runs on the chrome-watch Chrome
 * (CDP 9222), never closes the page. Env: PRODUCT_URL (joomlart.com product page), ORIGIN
 * (Tracy origin the button must land on), AMEMBER_TEST_USER / AMEMBER_TEST_PASSWORD.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'apps/tracy-host/package.json'))('playwright')
const PRODUCT_URL = process.env.PRODUCT_URL ?? 'https://www.joomlart.com/joomla/templates/ja-kinetic'
const ORIGIN = (process.env.ORIGIN ?? 'https://cowork.tracy.ai').replace(/\/$/, '')
const USER = process.env.AMEMBER_TEST_USER ?? ''
const PASS = process.env.AMEMBER_TEST_PASSWORD ?? ''
let failures = 0
const say = (ok, label, got) => {
  process.stdout.write(
    `${ok ? 'ok' : 'not ok'} - ${label}${ok || got === undefined ? '' : `: got ${JSON.stringify(got)}`}\n`
  )
  if (!ok) failures++
}
const mask = (u) => u.replace(/(sso|sig)(=|%3D)[A-Za-z0-9_%-]+/g, '$1$2…')
const browser = await chromium.connectOverCDP(process.env.CDP ?? 'http://127.0.0.1:9222')
const context = browser.contexts()[0]
// KEEP_SESSIONS=1 keeps the joomlart.com and Tracy cookies: the second click must not ask for a login.
if (process.env.KEEP_SESSIONS !== '1') {
  try {
    await context.clearCookies({ domain: /(^|\.)(tracy\.ai|tracy\.site|joomlart\.com)$/ })
  } catch {}
}
const page = await context.newPage()
const hops = []
page.on('response', (r) => {
  if (r.request().isNavigationRequest()) hops.push(`${r.status()} ${mask(r.url())}`)
})
await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded' })
const btn = page.locator('.pd-cta a.btn-success').first()
const href = await btn.getAttribute('href')
say(href?.startsWith(`${ORIGIN}/signin/joomlart?next=`), 'P1: the Download button points at Tracy', href)
say((await btn.innerText()).trim() === 'Download', 'P1: the button says Download', await btn.innerText())
await Promise.all([
  page.waitForURL((u) => /joomlart\.com\/member\/(login|sso)/.test(u.href) || u.origin === ORIGIN, {
    timeout: 60_000
  }),
  btn.click()
])
if (/\/member\/login\/?$/.test(new URL(page.url()).pathname) && USER) {
  await page.fill('#amember-login', USER)
  await page.fill('#amember-pass', PASS)
  await Promise.all([
    page.waitForURL((u) => u.origin === ORIGIN, { timeout: 60_000 }),
    page.click('#am-login-form input[type=submit][value="Login"]')
  ])
  say(true, 'P2: aMember asked for a login and the test account signed in')
}
await page.waitForLoadState('domcontentloaded')
const landed = new URL(page.url())
say(
  landed.origin === ORIGIN &&
    landed.pathname === '/new' &&
    landed.searchParams.get('template') === 'ja-kinetic',
  'P3: landed on Tracy /new?template=ja-kinetic',
  page.url()
)
say(
  hops.some((h) => h.includes('/signin/joomlart/callback')),
  'P3: came back through the callback',
  hops
)
const cookies = await context.cookies(ORIGIN)
say(
  cookies.some((c) => c.name === 'tracy_sess'),
  'P3: tracy_sess set, no OTP typed'
)
// The page draws its two buttons after reading the release list; wait for the first one.
await page.locator('[data-template-build]').waitFor({ timeout: 30_000 })
say((await page.locator('[data-template-build]').count()) === 1, 'P4: the Build button is on the page')
say(
  (await page.locator('a[download][href*="/quickstart.zip"]').count()) === 1,
  'P4: the Download button is on the page'
)
process.stdout.write(failures ? `${failures} CHECK(S) FAILED\n` : 'ALL CHECKS PASSED\n')
process.exit(failures ? 1 : 0)
