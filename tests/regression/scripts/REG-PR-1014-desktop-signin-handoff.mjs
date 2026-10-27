/**
 * REG-PR-1014 — Google/GitHub sign-in from the desktop app returns to the app, and Approve works in
 * a real browser (lane rounds included).
 *
 * Boots this checkout's tracy-web (memory store, console mail) on a free port, and drives Chrome on
 * the chrome-watch CDP endpoint as the person's browser. The desktop app's half is played by plain
 * HTTP with the app's headers; the app itself is covered by packages/desktop/tracy-desktop/test.
 *
 * Why a real browser: the bug was `Referrer-Policy: no-referrer` making Chrome send `Origin: null`
 * on the approve form, which no unit test sees because the tests set `Origin` themselves.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { checks, cannotRun, ROOT } from './lib.mjs'

const CDP = process.env.REG_CDP_URL ?? 'http://127.0.0.1:9222'
const require = createRequire(join(ROOT, 'apps/tracy-host/package.json'))
const { chromium } = require('playwright')
const c = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

const port = await freePort()
const ORIGIN = `http://127.0.0.1:${port}`
let log = ''
const web = spawn(process.execPath, ['src/server.js'], {
  cwd: join(ROOT, 'apps/tracy-web'),
  env: {
    PATH: process.env.PATH,
    PORT: String(port),
    TRACY_ORIGIN: ORIGIN,
    // Fresh per run: a cookie left in the shared Chrome by an earlier run must not be valid here
    // (cookies ignore the port).
    SESSION_SECRET: randomBytes(32).toString('hex'),
    LOCAL_LOGIN_PREVIEW: '1',
    SITE_DOMAIN: 'tracy.test',
    HOSTS: 'local',
    HOST_local_DSH_ORIGIN: 'http://127.0.0.1:9',
    HOST_local_ORIGIN: 'http://127.0.0.1:9',
    HOST_local_SECRET: 'reg-pr-1014-host-secret-0123456789abcdef',
    SEAT_local_SECRET: 'reg-pr-1014-seat-secret-0123456789abcdef'
  }
})
web.stdout.on('data', (d) => (log += d))
web.stderr.on('data', (d) => (log += d))
const stop = () => web.kill()
process.on('exit', stop)

for (let i = 0; i < 40 && !log.includes('listening on'); i++) await wait(250)
if (!log.includes('listening on')) {
  stop()
  cannotRun(`tracy-web did not start: ${log.slice(-400)}`)
}

let browser
try {
  browser = await chromium.connectOverCDP(CDP)
} catch {
  stop()
  cannotRun(`no Chrome on ${CDP} (start it with chrome-watch)`)
}
const ctx = browser.contexts()[0]

const api = (path, init = {}) => fetch(`${ORIGIN}${path}`, init)
const open = async (body) =>
  (
    await api('/auth/link/browser', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  ).json()
const status = async (nonce) => (await (await api(`/auth/link/${nonce}`)).json()).status

/** Sign in with an email code in the browser, land on the approve page, press `button`. */
async function answer(nonce, email, button) {
  // Each answer signs in as its own address: drop this host's cookies (only 127.0.0.1's) first.
  await ctx.clearCookies({ domain: '127.0.0.1' })
  const page = await ctx.newPage()
  await page.goto(`${ORIGIN}/signin?n=${nonce}`)
  if (page.url().includes('/login')) {
    const before = log.length
    await page.fill('#login-email', email)
    await page.click('#email-form button[type=submit]')
    let code = null
    for (let i = 0; i < 40 && !code; i++) {
      await wait(250)
      code = log.slice(before).match(/\b(\d{6})\b/)?.[1] ?? null
    }
    if (!code) throw new Error('no sign-in code in the console mail')
    const slots = page.locator('#code-form .otp-slot')
    for (let i = 0; i < 6; i++) await slots.nth(i).fill(code[i])
    // The code form submits itself once the sixth digit lands; press it only if it did not.
    const landed = await page.waitForURL(/\/signin\?n=/, { timeout: 3000 }).then(
      () => true,
      () => false
    )
    if (!landed) {
      page
        .locator('#code-form')
        .evaluate((f) => f.requestSubmit())
        .catch(() => {})
      await page.waitForURL(/\/signin\?n=/, { timeout: 15000 })
    }
  }
  const policy = (await page.request.get(page.url())).headers()['referrer-policy']
  const text = await page.locator('body').innerText()
  await page.getByRole('button', { name: button }).click()
  await wait(1000)
  await page.close()
  return { policy, text }
}

try {
  // 1. A lane round: Approve in a real browser reaches `approved` (it stayed `pending` before).
  const lane = await open({})
  const l = await answer(lane.nonce, `reg-1014-lane-${port}@example.test`, /approve/i)
  c.eq('lane approve page: referrer-policy', l.policy, 'same-origin')
  c.eq('lane round after Approve', await status(lane.nonce), 'approved')

  // 2. A desktop round: the page shows the app's match code; Approve, then redeem with the app's headers.
  const desk = await open({ purpose: 'desktop', device: 'Tracy Cowork for Mac' })
  c.check(
    'desktop round has a match code',
    /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(desk.matchCode ?? ''),
    desk.matchCode
  )
  const email = `reg-1014-desk-${port}@example.test`
  const d = await answer(desk.nonce, email, /approve/i)
  c.check('approve page shows the same match code', d.text.includes(desk.matchCode))
  c.check('approve page names Tracy Cowork for Mac', d.text.includes('Tracy Cowork for Mac'))
  c.eq('desktop round after Approve', await status(desk.nonce), 'approved')

  const redeem = (secret, origin = ORIGIN) =>
    api(`/auth/link/${desk.nonce}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify({ clientSecret: secret })
    })
  c.eq('redeem without Origin', (await redeem(desk.clientSecret, null)).status, 403)
  c.eq('redeem with a wrong secret', (await redeem('0'.repeat(64))).status, 404)
  const lane2 = await open({})
  c.eq(
    'a lane round cannot be redeemed for a session',
    (
      await api(`/auth/link/${lane2.nonce}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ clientSecret: lane2.clientSecret })
      })
    ).status,
    404
  )
  const ok = await redeem(desk.clientSecret)
  c.eq('redeem after a wrong secret still works', ok.status, 204)
  const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0]
  c.check('redeem sets tracy_sess', cookie.startsWith('tracy_sess='), cookie.slice(0, 12))
  const me = await (await api('/auth/me', { headers: { cookie } })).json()
  c.eq('the session names the approved account', me.email, email)
  c.eq('a second redeem is refused', (await redeem(desk.clientSecret)).status, 404)

  // 3. Deny.
  const denied = await open({ purpose: 'desktop' })
  await answer(denied.nonce, email, /deny/i)
  c.eq('desktop round after Deny', await status(denied.nonce), 'denied')
} catch (e) {
  c.check('scenario ran to the end', false, String(e?.message ?? e).slice(0, 300))
} finally {
  stop()
}
c.done()
