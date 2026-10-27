/**
 * REG-PR-1166 — the desktop first-run email round: the address typed in the app is verified and the
 * round approved by ONE press in the browser, and only by the round's own code from Tracy's origin.
 *
 * Boots this checkout's tracy-web (memory store, console mail) on a free port and plays both halves
 * over HTTP: the app (`POST /auth/link/browser` with `email`, then the redeem) and the browser (the
 * `/signin?n=` page, its host-only `tracy_signin_browser` cookie and form token, `POST /signin/code`,
 * `POST /signin/verify`). Fences (council (a) of tasks/todo-desktop-onboard-v2.md):
 *   - the GET mails nothing, and the browser URL carries no address;
 *   - a request without Origin, or from another origin, is refused (403) on both doors;
 *   - a form token of another round is refused (403);
 *   - an ordinary web sign-in code (`POST /login`) for the same address does not approve the round;
 *   - another round's code does not approve this round;
 *   - a new code kills the round's previous one;
 *   - the right code from the right origin approves the round in one press (no Approve page), the
 *     browser's session becomes the typed address, the app's redeem gets a session for it, and a
 *     second press is refused.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { cannotRun, checks, ROOT } from './lib.mjs'

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
    DOCS_ORIGIN: 'http://docs.localhost:9',
    MAIL: 'console',
    LOCAL_LOGIN_PREVIEW: '1',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    SITE_DOMAIN: 'tracy.test',
    HOSTS: 'local',
    HOST_local_DSH_ORIGIN: 'http://127.0.0.1:9',
    HOST_local_ORIGIN: 'http://127.0.0.1:9',
    HOST_local_SECRET: 'reg-pr-1166-host-secret-0123456789abcdef',
    SEAT_local_SECRET: 'reg-pr-1166-seat-secret-0123456789abcdef'
  }
})
web.stdout.on('data', (d) => (log += d))
web.stderr.on('data', (d) => (log += d))
const stop = () => web.kill()
process.on('exit', stop)
for (let i = 0; i < 60 && !log.includes('listening on'); i++) await wait(250)
if (!log.includes('listening on')) {
  stop()
  cannotRun(`tracy-web did not start: ${log.slice(-400)}`)
}

const Y = `reg1166-${randomBytes(3).toString('hex')}@example.test`
const api = (path, init = {}) => fetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init })
const mails = (from) =>
  [...log.slice(from).matchAll(/\[mail\] to=(\S+) subject=.*?\b(\d{6})\b/g)].map((m) => ({
    to: m[1],
    code: m[2]
  }))
async function mailedCode(from) {
  for (let i = 0; i < 40; i++) {
    const hit = mails(from)
      .filter((m) => m.to === Y)
      .at(-1)
    if (hit) return hit.code
    await wait(250)
  }
  return null
}
const openRound = async () =>
  (
    await api('/auth/link/browser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ purpose: 'desktop', device: 'Tracy Cowork for Mac', email: Y })
    })
  ).json()
const status = async (nonce) => (await (await api(`/auth/link/${nonce}`)).json()).status

let browserCookie = ''
/** The browser's GET of the round page: its HTML and form token; keeps the browser id cookie. */
async function roundPage(nonce) {
  const r = await api(`/signin?n=${nonce}`, { headers: browserCookie ? { cookie: browserCookie } : {} })
  const set = (r.headers.get('set-cookie') ?? '').split(';')[0]
  if (set.startsWith('tracy_signin_browser=')) browserCookie = set
  const html = await r.text()
  return {
    status: r.status,
    html,
    referrer: r.headers.get('referrer-policy'),
    token: /name="t" value="([^"]+)"/.exec(html)?.[1] ?? ''
  }
}
/** A browser form post on one of the round's doors. */
const post = (path, fields, { origin = ORIGIN, cookie = browserCookie } = {}) =>
  api(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(fields).toString()
  })

try {
  const r1 = await openRound()
  c.check('the app opens a desktop round carrying the address', typeof r1.nonce === 'string', r1)
  const mark0 = log.length
  const p1 = await roundPage(r1.nonce)
  c.eq('GET /signin?n= answers', p1.status, 200)
  c.check('the page names the typed address', p1.html.includes(Y), p1.html.slice(0, 200))
  c.check('the page shows the match code', p1.html.includes(r1.matchCode), r1.matchCode)
  c.check('the page offers to email a code', p1.html.includes('action="/signin/code"'), null)
  c.check(
    'the browser id cookie is planted, host-only',
    browserCookie.startsWith('tracy_signin_browser='),
    browserCookie
  )
  await wait(500)
  c.eq('the GET mailed nothing', mails(mark0).filter((m) => m.to === Y).length, 0)

  const f1 = { n: r1.nonce, t: p1.token }
  c.eq('/signin/code without Origin', (await post('/signin/code', f1, { origin: null })).status, 403)
  c.eq(
    '/signin/code from another origin',
    (await post('/signin/code', f1, { origin: 'https://evil.example' })).status,
    403
  )

  // A second round in the same browser: its token must not fit the first round.
  const r2 = await openRound()
  const p2 = await roundPage(r2.nonce)
  c.eq(
    "/signin/code with another round's token",
    (await post('/signin/code', { n: r1.nonce, t: p2.token })).status,
    403
  )
  c.eq('nothing mailed by the refused requests', mails(mark0).filter((m) => m.to === Y).length, 0)

  let mark = log.length
  const sent = await post('/signin/code', f1)
  c.eq('/signin/code from Tracy with the round token', sent.status, 200)
  // Under no-referrer Chrome posts the code step's form with Origin: null and the press is refused
  // (found by the stand E2E, 11/10/2026).
  c.eq('the code step keeps Referrer-Policy same-origin', sent.headers.get('referrer-policy'), 'same-origin')
  c.eq('the round page keeps Referrer-Policy same-origin', p1.referrer, 'same-origin')
  const code1 = await mailedCode(mark)
  c.check('a code is mailed to the typed address', !!code1, code1)

  // An ordinary web sign-in code for the same address.
  mark = log.length
  const login = await post('/login', { email: Y }, { cookie: '' })
  c.check('a web sign-in code is sent (control)', login.status < 400, login.status)
  const webCode = await mailedCode(mark)
  c.check('control: the web code differs from the round code', !!webCode && webCode !== code1, webCode)
  c.eq(
    'the web sign-in code does not approve the round',
    (await post('/signin/verify', { ...f1, code: webCode })).status,
    401
  )
  c.eq('round still pending after the web code', await status(r1.nonce), 'pending')

  // Another round's code.
  mark = log.length
  await post('/signin/code', { n: r2.nonce, t: p2.token })
  const code2 = await mailedCode(mark)
  c.check('control: round 2 has its own code', !!code2 && code2 !== code1, code2)
  c.eq(
    "round 2's code does not approve round 1",
    (await post('/signin/verify', { ...f1, code: code2 })).status,
    401
  )

  // The right code without Origin.
  c.eq(
    '/signin/verify without Origin',
    (await post('/signin/verify', { ...f1, code: code1 }, { origin: null })).status,
    403
  )
  c.eq('round still pending after the refusals', await status(r1.nonce), 'pending')

  // One press.
  const press = await post('/signin/verify', { ...f1, code: code1 })
  c.eq('the right code from Tracy: one press', press.status, 200)
  const pressHtml = await press.text()
  c.check('no separate Approve page after the press', !pressHtml.includes('action="/signin/approve"'), null)
  const sess = (press.headers.get('set-cookie') ?? '').match(/tracy_sess=[^;]+/)?.[0] ?? ''
  c.check('the browser gets a session', !!sess, press.headers.get('set-cookie'))
  const me = sess ? await (await api('/auth/me', { headers: { cookie: sess } })).json() : {}
  c.eq('the browser session is the typed address', me.email, Y)
  c.eq('the round is approved', await status(r1.nonce), 'approved')
  c.check(
    'a second press is refused',
    (await post('/signin/verify', { ...f1, code: code1 })).status >= 400,
    null
  )

  const redeem = await api(`/auth/link/${r1.nonce}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ clientSecret: r1.clientSecret })
  })
  c.eq('the app redeems the round', redeem.status, 204)
  const appCookie = (redeem.headers.get('set-cookie') ?? '').match(/tracy_sess=[^;]+/)?.[0] ?? ''
  const appMe = appCookie ? await (await api('/auth/me', { headers: { cookie: appCookie } })).json() : {}
  c.eq('the app session is the typed address', appMe.email, Y)

  // A new code kills the round's previous one.
  mark = log.length
  await post('/signin/code', { n: r2.nonce, t: p2.token })
  const code3 = await mailedCode(mark)
  c.check('control: a new code for round 2', !!code3 && code3 !== code2, code3)
  c.eq(
    'the previous code of round 2 is dead',
    (await post('/signin/verify', { n: r2.nonce, t: p2.token, code: code2 })).status,
    401
  )
  c.eq(
    'the new code of round 2 works',
    (await post('/signin/verify', { n: r2.nonce, t: p2.token, code: code3 })).status,
    200
  )
} catch (e) {
  c.check('scenario ran to the end', false, String(e?.stack ?? e).slice(0, 400))
} finally {
  stop()
}
c.done()
