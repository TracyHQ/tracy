/**
 * REG-PR-1166 — the desktop first run signs in inside the Setup frame, and nobody else sees it.
 *
 * Boots this checkout's tracy-web (memory store, console mail) on a free port and reads the pages:
 *   - `/login?onboard=1`: the Setup frame, four steps, step 1 current, steps 2–4 disabled, no Skip /
 *     Continue, no script, the email form a GET to `/signin/email`;
 *   - `/login` and `/login?onboard=0`: no frame, the classic `POST /login` form (the web and an old
 *     user are unchanged);
 *   - `GET /signin/email` (reached only by a browser that is not the app): it mails nothing and
 *     sends the browser to `/login` with the address filled in; a malformed address or a foreign
 *     `next` is dropped;
 *   - `POST /auth/link/browser`: an `email` is accepted on a desktop round only — a lane round with
 *     one, a malformed one, or one over 254 characters is refused (400).
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

const api = (path, init = {}) => fetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init })
const page = async (path) => (await api(path)).text()
const steps = (html) => [...html.matchAll(/<button class="setup-step"[^>]*>/g)].map((m) => m[0])
const round = async (body) =>
  (
    await api('/auth/link/browser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body)
    })
  ).status

try {
  const onboard = await page('/login?onboard=1')
  const rail = steps(onboard)
  c.check('onboard=1: the Setup frame', onboard.includes('class="setup"'), null)
  c.eq('onboard=1: four steps', rail.length, 4)
  c.check(
    'onboard=1: step 1 current, not disabled',
    /aria-current="step"/.test(rail[0] ?? '') && !/disabled/.test(rail[0] ?? ''),
    rail[0]
  )
  c.check(
    'onboard=1: steps 2–4 disabled',
    rail.slice(1).every((b) => / disabled/.test(b)),
    rail.slice(1)
  )
  c.check(
    'onboard=1: the email form is a GET to /signin/email',
    /<form id="email-form" method="get" action="\/signin\/email">/.test(onboard),
    null
  )
  c.check(
    'onboard=1: no sign-in script intercepts the form (the app must see the navigation)',
    !onboard.includes("getElementById('email-form')"),
    null
  )
  c.check(
    'control: the plain page has that script',
    (await page('/login')).includes("getElementById('email-form')"),
    null
  )
  c.check('onboard=1: no Skip / Continue button', !/>\s*(Skip|Continue)\s*</.test(onboard), null)

  for (const path of ['/login', '/login?onboard=0', '/login?onboard=true']) {
    const html = await page(path)
    c.check(`${path}: no Setup frame`, !html.includes('class="setup"'), null)
    c.check(
      `${path}: the classic POST /login form`,
      /<form id="email-form" method="post" action="\/login/.test(html),
      null
    )
  }

  const mark = log.length
  const go = await api('/signin/email?email=Someone%40Example.test')
  c.eq('/signin/email: redirects', go.status, 302)
  c.eq(
    '/signin/email: to /login with the address',
    go.headers.get('location'),
    '/login?email=someone%40example.test'
  )
  const bad = await api('/signin/email?email=not-an-address&next=https%3A%2F%2Fevil.example%2F')
  c.eq(
    '/signin/email: a malformed address and a foreign next are dropped',
    bad.headers.get('location'),
    '/login'
  )
  await wait(300)
  c.check('/signin/email mails nothing', !log.slice(mark).includes('[mail] to='), log.slice(mark, mark + 200))

  c.eq(
    'a desktop round with an email is accepted',
    await round({ purpose: 'desktop', email: 'a@example.test' }),
    200
  )
  c.eq('a lane round with an email is refused', await round({ email: 'a@example.test' }), 400)
  c.eq('a malformed email is refused', await round({ purpose: 'desktop', email: 'nope' }), 400)
  c.eq(
    'an email over 254 characters is refused',
    await round({ purpose: 'desktop', email: `${'a'.repeat(250)}@example.test` }),
    400
  )
} catch (e) {
  c.check('scenario ran to the end', false, String(e?.stack ?? e).slice(0, 400))
} finally {
  stop()
}
c.done()
