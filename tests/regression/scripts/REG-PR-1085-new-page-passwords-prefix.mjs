/**
 * REG-PR-1085-new-page-passwords-prefix — on the creation workspace (`/new/`), dsh-passwords' client
 * asks its own doors under the page's mount: `/new/api/dsh-passwords/state` and
 * `/new/gateway/api/messages`, never the host's bare root (which answers 404).
 *
 * The bug (2.7.7-tracy.1 … tracy.5): the rebase onto upstream 2.7.7 kept `dshUrl` but dropped every
 * call to it, so the passwords card and the internal chat fetched `/api/dsh-passwords/state` and
 * `/gateway/api/messages` at the root. A site page hid it (tracy-web recovers the site from the
 * Referer); a `/new/` Referer names no site, so both fell through and got 404.
 *
 * Read-only: a fresh seat (minted with the stand's SESSION_SECRET, never printed) loads `/new/` once
 * in a new context of the chrome-watch Chrome. Nothing is created but the seat's own account row,
 * which tracy-web makes on first sight of any cookie. Nothing is closed (the watcher keeps the page).
 *
 * Env: TRACY_STAND (origin, default http://tracy.test:8080) · TRACY_STAND_ENV (.env holding
 * SESSION_SECRET, default ~/TCH/deploy/.env) · REG_CDP_URL (default http://127.0.0.1:9222) ·
 * REG_WAIT_MS (how long to watch the page after load, default 15000; the chat polls every 4 s).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { checks, cannotRun, ROOT } from './lib.mjs'

const STAND = new URL(process.env.TRACY_STAND ?? 'http://tracy.test:8080').origin
const ENV_FILE = process.env.TRACY_STAND_ENV ?? join(homedir(), 'TCH', 'deploy', '.env')
const CDP = process.env.REG_CDP_URL ?? 'http://127.0.0.1:9222'
const WAIT_MS = Number(process.env.REG_WAIT_MS ?? 15_000)
const DOORS = [
  { name: 'state', tail: '/api/dsh-passwords/state' },
  { name: 'messages', tail: '/gateway/api/messages' }
]
const c = checks()

function loadPlaywright() {
  for (const root of [ROOT, join(homedir(), 'TCH')]) {
    const store = join(root, 'node_modules', '.pnpm')
    if (!existsSync(store)) continue
    const dir = readdirSync(store)
      .filter((d) => /^playwright@\d+\.\d+\.\d+$/.test(d))
      .sort()
      .pop()
    if (dir)
      return createRequire(join(store, dir, 'node_modules', 'playwright', 'package.json'))('playwright')
  }
  return cannotRun('playwright not found under node_modules/.pnpm')
}

if (!existsSync(ENV_FILE)) cannotRun(`no stand env file at ${ENV_FILE} (set TRACY_STAND_ENV)`)
const line = readFileSync(ENV_FILE, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SESSION_SECRET='))
if (!line) cannotRun(`no SESSION_SECRET in ${ENV_FILE}`)
const secret = line
  .slice('SESSION_SECRET='.length)
  .trim()
  .split(/\s+/)[0]
  .split(',')[0]
  .replace(/^['"]|['"]$/g, '')
const { mintSession } = await import(join(ROOT, 'apps/tracy-web/src/lib/session.js'))
const email = `reg-new-prefix-${Date.now()}@example.test`
const token = await mintSession(email, secret)

const me = await fetch(`${STAND}/auth/me`, { headers: { cookie: `tracy_sess=${token}` } }).catch(() => null)
if (!me) cannotRun(`stand ${STAND} does not answer`)
if (me.status !== 200)
  cannotRun(`minted seat not accepted by ${STAND}/auth/me (HTTP ${me.status}) — wrong TRACY_STAND_ENV?`)

const { chromium } = loadPlaywright()
let browser
try {
  // A busy shared Chrome (other sessions attached to many pages) can take tens of seconds to attach.
  browser = await chromium.connectOverCDP(CDP, { timeout: 120_000 })
} catch (e) {
  cannotRun(`no Chrome on ${CDP} (start it with chrome-watch): ${String(e?.message ?? e).split('\n')[0]}`)
}
// A fresh context: the shared Chrome holds other sessions' tracy_sess cookies for the same domain.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([
  { name: 'tracy_sess', value: token, domain: new URL(STAND).hostname, path: '/', httpOnly: true }
])
const page = await ctx.newPage()
/** @type {{door: string, path: string, status: number}[]} */
const seen = []
/** `chatEnabled` from the first state answer that parsed: the chat polls messages only when it is not false. */
let chatEnabled
page.on('response', async (r) => {
  const path = new URL(r.url()).pathname
  const door = DOORS.find((d) => path.endsWith(d.tail))
  if (!door) return
  seen.push({ door: door.name, path, status: r.status() })
  if (door.name === 'state' && r.ok() && chatEnabled === undefined) {
    const body = await r.json().catch(() => null)
    if (body && typeof body === 'object') chatEnabled = body.chatEnabled !== false
  }
})
await page.goto(`${STAND}/new/`, { waitUntil: 'load', timeout: 90_000 })
await page.waitForTimeout(WAIT_MS)
const landed = new URL(page.url()).pathname
const base = await page.evaluate(() => document.querySelector('base[href]')?.getAttribute('href') ?? null)
console.log(`# stand ${STAND} · seat ${email} · landed ${landed} · base ${base}`)
for (const s of seen) console.log(`# ${s.status} ${s.path}`)

console.log(`# state says chatEnabled: ${String(chatEnabled)}`)

c.check('the page stays on the creation workspace /new/', landed.startsWith('/new/'), landed)
const state = seen.filter((s) => s.door === 'state')
c.check('the page asks /api/dsh-passwords/state at least once', state.length > 0, state.length)
c.check(
  'every state request goes under /new/ and answers 200',
  state.length > 0 && state.every((s) => s.path === '/new/api/dsh-passwords/state' && s.status === 200),
  state.map((s) => `${s.status} ${s.path}`)
)
// The chat polls /gateway/api/messages only while it is on. A failed state read (the bug: 404 at
// the root) leaves it on by default, which is why the broken page also polled messages at the
// root; a Tracy seat's state says chatEnabled: false, so the fixed page polls nothing.
const messages = seen.filter((s) => s.door === 'messages')
c.check(
  'every /gateway/api/messages request goes under /new/ and none answers 404',
  messages.every((s) => s.path.startsWith('/new/gateway/api/messages') && s.status !== 404),
  messages.map((s) => `${s.status} ${s.path}`)
)
if (chatEnabled === true)
  c.check('with the chat on, the page polls /new/gateway/api/messages', messages.length > 0, messages.length)
else if (chatEnabled === false) console.log('# chat off for this seat: no messages poll expected')
c.done()
