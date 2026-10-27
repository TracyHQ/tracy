/**
 * The JoomlArt sign-in door on a deployment: /signin/joomlart → aMember login → callback →
 * /new?template=<id>, where the web landing offers Build, the quickstart zip and the Tracy Desktop
 * hint (ADR 0030: same features on the web and in the app). Runs on the chrome-watch Chrome (CDP
 * 9222), never closes the page. Env: ORIGIN (https://cowork.tracy.site), TEMPLATE (ja-kinetic),
 * AMEMBER_TEST_USER / AMEMBER_TEST_PASSWORD.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'apps/tracy-host/package.json'))('playwright')
const ORIGIN = (process.env.ORIGIN ?? 'https://cowork.tracy.site').replace(/\/$/, '')
const TEMPLATE = process.env.TEMPLATE ?? 'ja-kinetic'
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
const next = `/new?template=${TEMPLATE}&platform=joomla`
await page.goto(`${ORIGIN}/signin/joomlart?next=${encodeURIComponent(next)}`, {
  waitUntil: 'domcontentloaded'
})
await page.waitForURL((u) => /joomlart\.com\/member\/(login|sso)/.test(u.href) || u.origin === ORIGIN, {
  timeout: 60_000
})
say(
  /joomlart\.com\/member\//.test(page.url()) || new URL(page.url()).origin === ORIGIN,
  'D1: the door sent the browser to aMember',
  mask(page.url())
)
if (/\/member\/login\/?$/.test(new URL(page.url()).pathname) && USER) {
  await page.fill('#amember-login', USER)
  await page.fill('#amember-pass', PASS)
  await Promise.all([
    page.waitForURL((u) => u.origin === ORIGIN, { timeout: 60_000 }),
    page.click('#am-login-form input[type=submit][value="Login"]')
  ])
  say(true, 'D2: aMember asked for a login and the test account signed in')
}
await page.waitForLoadState('domcontentloaded')
const landed = new URL(page.url())
say(
  landed.origin === ORIGIN && landed.pathname === '/new' && landed.searchParams.get('template') === TEMPLATE,
  `D3: landed on ${ORIGIN}/new?template=${TEMPLATE}`,
  page.url()
)
say(
  hops.some((h) => h.includes('/signin/joomlart/callback')),
  'D3: came back through the callback',
  hops
)
say(
  (await context.cookies(ORIGIN)).some((c) => c.name === 'tracy_sess'),
  'D3: tracy_sess set, no OTP typed'
)
await page.locator('[data-template-build]').waitFor({ timeout: 30_000 })
say((await page.locator('[data-template-build]').count()) === 1, 'D4: the Build button is on the page')
say(
  (await page.locator('a[download][href*="/quickstart.zip"]').count()) === 1,
  'D4: the quickstart zip link is on the page (same on the web as in the app)'
)
const body = await page.locator('body').innerText()
say(/Tracy Desktop/.test(body), 'D4: the page mentions Tracy Desktop (the invitation, not a gate)')
const zipHref = await page.locator('a[download][href*="/quickstart.zip"]').getAttribute('href')
const head = await page.request
  .fetch(`${ORIGIN}${zipHref}`, { method: 'HEAD', maxRedirects: 0 })
  .catch(() => null)
say(
  head && [200, 302].includes(head.status()),
  'D5: the zip door answers a signed-in browser (no desktop-only refusal)',
  head?.status()
)
process.stdout.write(failures ? `${failures} CHECK(S) FAILED\n` : 'ALL CHECKS PASSED\n')
process.exit(failures ? 1 : 0)
