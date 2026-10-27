/**
 * E2E of "Login with JoomlArt" on a local stand, through chrome-watch's Chrome (CDP on 9222) so the
 * person can watch and keep the page afterwards (CLAUDE.md § Headless Chrome).
 *
 *   ORIGIN=http://sso.tracy.test:45080 node tests/e2e/signin-joomlart-stand.mjs [--template ja-kinetic]
 *
 * Needs: the stand up with JOOMLART_SSO_* set, `tests/e2e/fake-amember-idp.mjs` running on the host
 * with the same secret, and the template's release in `quickstart_releases`. Prints one line per
 * check and exits non-zero on the first failure. Never closes the browser or the page.
 *
 * Against a real deployment (dev) the IdP is the real aMember: set `IDP_HOST=www.joomlart.com` and
 * `AMEMBER_TEST_USER` / `AMEMBER_TEST_PASSWORD` (the test account the team provides, from
 * `~/TracyHQ/.infra/joomlart-amember.env`); when aMember shows its login form the script fills it.
 * The password is read from the environment and never printed.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'apps/tracy-host/package.json'))('playwright')
const ORIGIN = (process.env.ORIGIN ?? 'http://sso.tracy.test:45080').replace(/\/$/, '')
const TEMPLATE = process.argv.includes('--template')
  ? process.argv[process.argv.indexOf('--template') + 1]
  : 'ja-kinetic'
const CDP = process.env.CDP ?? 'http://127.0.0.1:9222'
const IDP_HOST = process.env.IDP_HOST ?? '127.0.0.1:45900'
const AMEMBER_USER = process.env.AMEMBER_TEST_USER ?? ''
const AMEMBER_PASS = process.env.AMEMBER_TEST_PASSWORD ?? ''

let failures = 0
const say = (ok, label, got) => {
  process.stdout.write(
    `${ok ? 'ok' : 'not ok'} - ${label}${ok || got === undefined ? '' : `: got ${JSON.stringify(got)}`}\n`
  )
  if (!ok) failures++
}

const browser = await chromium.connectOverCDP(CDP)
const context = browser.contexts()[0] ?? (await browser.newContext())
const page = await context.newPage()
const hops = []
page.on('response', (r) => {
  if (r.request().isNavigationRequest()) hops.push(`${r.status()} ${r.url().slice(0, 120)}`)
})

// 1. From joomlart.com's button: the sign-in door, the IdP, the callback, the landing.
// Start signed out on both sides, so a session at the end is this run's and not an older one's.
try {
  await page.context().clearCookies({ domain: /(^|\.)(tracy\.ai|tracy\.site|tracy\.test|joomlart\.com)$/ })
} catch {}
await page.goto(
  `${ORIGIN}/signin/joomlart?next=${encodeURIComponent(`/new?template=${TEMPLATE}&platform=joomla`)}`,
  { waitUntil: 'domcontentloaded' }
)
// The real aMember, not signed in, shows its login form and comes back to the authorize door after.
if (/\/member\/login\/?$/.test(new URL(page.url()).pathname) && AMEMBER_USER) {
  await page.fill('#amember-login', AMEMBER_USER)
  await page.fill('#amember-pass', AMEMBER_PASS)
  await Promise.all([
    page.waitForURL((u) => u.origin === ORIGIN, { timeout: 60_000 }),
    page.click('#am-login-form input[type=submit][value="Login"]')
  ])
  say(true, 'S1: aMember asked for a login and the test account signed in')
}
say(
  // The real aMember serves the door under /member/; the fake IdP serves it at the root.
  hops.some((h) => h.includes(IDP_HOST) && h.includes('/sso/v1/authorize')),
  'S1: the browser went through the IdP',
  hops
)
say(
  hops.some((h) => h.includes('/signin/joomlart/callback')),
  'S1: and came back through the callback',
  hops
)
say(
  new URL(page.url()).pathname === '/new' && new URL(page.url()).searchParams.get('template') === TEMPLATE,
  'S1: landed on /new?template=',
  page.url()
)
const cookies = await context.cookies(ORIGIN)
const sess = cookies.find((c) => c.name === 'tracy_sess')
say(Boolean(sess?.value.startsWith('v1.')), 'S1: tracy_sess is set, no OTP typed')
say(!cookies.some((c) => c.name === 'tracy_oauth_state' && c.value), 'S1: the state cookie is gone')

// 2. The landing page on the web: picture, Build, the zip — the same page the app gets — and,
//    on the web only, the Tracy Desktop offer after them (plan tasks/todo-quickstart-desktop-only.md,
//    11/10: web and app never differ in features; the nudge is words and layout).
const APP_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/154 Safari/537.36 TracyCowork/0.0.0-e2e'
const build = await page.locator('[data-template-build]').getAttribute('href')
say(build === `/new/?inspiration=${TEMPLATE}&platform=joomla`, 'S2: Build carries the creation intent', build)
const webDownload = await page.locator('a[download]').getAttribute('href')
say(
  webDownload === `/api/quickstarts/${TEMPLATE}/j6/quickstart.zip`,
  'S2: the web page links the zip, as the app does',
  webDownload
)
const desktopHref = await page.locator('[data-template-desktop]').getAttribute('href')
say(
  desktopHref === `https://tracy.ai/download/?from=template-${TEMPLATE}`,
  'S2: the web page offers Tracy Desktop',
  desktopHref
)
say(
  (await page.locator('a[href*="joomlart.com/member/downloads"]').count()) === 0,
  'S2: no member-area detour: the web downloads itself'
)
const img =
  (await page.locator('img').count()) > 0 ? await page.locator('img').first().getAttribute('src') : null
say(
  img === null || img.startsWith(`/api/templates/${TEMPLATE}/shots/`),
  img === null
    ? 'S2: no picture, because this deployment holds no shot for the card'
    : 'S2: the card picture is the held shot',
  img
)

// 3. The download door: the browser session gets bytes, headers, hash; the app gets the same.
const door = `/api/quickstarts/${TEMPLATE}/j6/quickstart.zip`
const res = await context.request.get(`${ORIGIN}${door}`, { maxRedirects: 0, timeout: 600_000 })
say(res.status() === 200, 'S3: a browser session gets 200 at the door', res.status())
const headers = res.headers()
say(
  headers['content-type'] === 'application/zip',
  'S3: content-type is application/zip',
  headers['content-type']
)
say(
  /attachment; filename=".*quickstart.*\.zip"/.test(headers['content-disposition'] ?? ''),
  'S3: content-disposition names the zip',
  headers['content-disposition']
)
say(headers['cache-control'] === 'no-store', 'S3: cache-control no-store', headers['cache-control'])
const body = await res.body()
const sha = createHash('sha256').update(body).digest('hex')
say(body.length > 1_000_000, `S3: the zip has bytes (${body.length})`, body.length)
if (headers['x-tracy-sha256'])
  say(headers['x-tracy-sha256'] === sha, 'S3: x-tracy-sha256 matches the bytes', {
    header: headers['x-tracy-sha256'],
    sha
  })
else
  say(true, 'S3: x-tracy-sha256 absent (release row synced before digests were kept) — bytes sha256 ' + sha)
const fromApp = await context.request.get(`${ORIGIN}${door}`, {
  maxRedirects: 0,
  timeout: 600_000,
  headers: { 'user-agent': APP_UA }
})
say(fromApp.status() === 200, 'S3: the app gets 200 at the door too', fromApp.status())
const appSha = createHash('sha256')
  .update(await fromApp.body())
  .digest('hex')
say(appSha === sha, 'S3: the app gets the same bytes', { appSha, sha })

// 3b. The handoff: the web root does not follow the template the web page left waiting; the app's
//     root does, once, and the app page has the zip and no offer of itself.
await page.goto(`${ORIGIN}/`, { waitUntil: 'commit' })
await page.waitForLoadState('domcontentloaded').catch(() => {})
say(
  !(new URL(page.url()).pathname === '/new' && new URL(page.url()).searchParams.has('template')),
  'S3b: the web root does not follow the waiting template',
  page.url()
)
const cdp = await context.newCDPSession(page)
await cdp.send('Network.setUserAgentOverride', { userAgent: APP_UA })
await page.goto(`${ORIGIN}/`, { waitUntil: 'commit' })
await page
  .waitForURL((u) => u.pathname === '/new' || !u.pathname.startsWith('/login'), { timeout: 30_000 })
  .catch(() => {})
say(
  new URL(page.url()).pathname === '/new' && new URL(page.url()).searchParams.get('template') === TEMPLATE,
  'S3b: the app is sent from the root to the waiting template',
  page.url()
)
await page.waitForSelector('[data-template-build]', { timeout: 30_000 })
const appDownload = await page.locator('a[download]').getAttribute('href')
say(appDownload === door, 'S3b: the app page links the zip', appDownload)
say((await page.locator('[data-template-desktop]').count()) === 0, 'S3b: the app page offers no app')
await page.goto(`${ORIGIN}/`, { waitUntil: 'commit' })
await page.waitForLoadState('domcontentloaded').catch(() => {})
say(
  !(new URL(page.url()).pathname === '/new' && new URL(page.url()).searchParams.has('template')),
  'S3b: shown once in the app, the root no longer sends it there',
  page.url()
)
await cdp.send('Network.setUserAgentOverride', { userAgent: '' })
await cdp.detach().catch(() => {})
await page.goto(`${ORIGIN}/new?template=${TEMPLATE}&platform=joomla`, { waitUntil: 'commit' })
await page.waitForSelector('[data-template-build]', { timeout: 30_000 })

// 4. Build: the creation workspace opens with the intent (the dsh page; we only check the address).
await page.locator('[data-template-build]').click()
await page.waitForURL((u) => u.pathname.startsWith('/new/'), { timeout: 60_000 }).catch(() => {})
say(new URL(page.url()).pathname.startsWith('/new/'), 'S4: Build opened the creation workspace', page.url())

process.stdout.write(failures === 0 ? 'ALL CHECKS PASSED\n' : `${failures} CHECK(S) FAILED\n`)
// Leave the page for the person (chrome-watch rule): no close().
process.exit(failures === 0 ? 0 : 1)
