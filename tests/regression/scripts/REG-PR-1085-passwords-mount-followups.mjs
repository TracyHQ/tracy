/**
 * REG-PR-1085-passwords-mount-followups — two dsh-passwords paths behind tracy-web's mounts.
 *
 * A. The passwords card's own Sign out. The card posts `<site>/gateway/logout`; dsh revoked the
 *    seat and answered with its sign-in redirect, tracy-web read that as a stale seat and sent the
 *    browser back to `<site>/gateway/logout` (302 → GET, a new seat minted on the way → 405), and
 *    the card's next stop `<site>/gateway/login` was a 404 (2.7.7-tracy.6 and before). Fixed: the
 *    card's Sign out is Tracy's sign-out (303 → /login, `tracy_sess` cleared), and
 *    `<mount>/gateway/login` goes to `<mount>/`. Tracy's own `POST /auth/signout` is checked too.
 * B. The owner's delete-folder button in the directory picker. The picker draws it only for rows
 *    whose path it read off dsh's `POST /api/directoryPicker/list`; under a mount that request is
 *    `/<site>/api/directoryPicker/list` and an exact root comparison never matched. Checked through
 *    `vendor/tracy/dsh-passwords/test/tracy/picker-delete-mount.test.ts` at the commit under test
 *    (why not on the stand's page: see below).
 *
 * Writes nothing on the stand but revoking the seat tokens this script minted. Every Tracy session
 * here is minted fresh with the stand's SESSION_SECRET (never printed); signing one out clears only
 * this script's cookies.
 *
 * Env: TRACY_STAND (origin, default http://tracy.test:8080) · TRACY_STAND_ENV (.env with
 * SESSION_SECRET, default ~/TCH/deploy/.env) · REG_OWNER_EMAIL (an account owning a site on that
 * stand; required) · REG_SITE (site key; default the owner's first owned site).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { checks, cannotRun, nodeTest, ROOT } from './lib.mjs'

const STAND = new URL(process.env.TRACY_STAND ?? 'http://tracy.test:8080').origin
const ENV_FILE = process.env.TRACY_STAND_ENV ?? join(homedir(), 'TCH', 'deploy', '.env')
const OWNER = process.env.REG_OWNER_EMAIL ?? ''
const c = checks()

if (!OWNER) cannotRun('REG_OWNER_EMAIL is not set (an account owning a site on the stand)')
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

const listing = await fetch(`${STAND}/api/sites`, {
  headers: { cookie: `tracy_sess=${await mintSession(OWNER, secret)}` }
}).catch(() => null)
if (!listing) cannotRun(`stand ${STAND} does not answer`)
if (listing.status !== 200) cannotRun(`${OWNER} not accepted by ${STAND}/api/sites (HTTP ${listing.status})`)
const owned = ((await listing.json()).sites ?? []).filter(
  (s) => s.role === 'owner' && s.status === 'accepted'
)
const SITE = process.env.REG_SITE ?? owned[0]?.siteKey
if (!SITE || !owned.some((s) => s.siteKey === SITE))
  cannotRun(`${OWNER} owns no site ${SITE ?? ''} on ${STAND}`)
const MOUNT = `/${SITE}`
console.log(`# stand ${STAND} · owner ${OWNER} · site ${SITE}`)

/** A browser-like walk: one cookie jar, redirects followed by hand, every hop printed. */
async function browserWalk(jar, method, path, { accept = 'text/html', body, type } = {}) {
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const hops = []
  let url = STAND + path
  for (let hop = 0; hop < 8; hop++) {
    const headers = { cookie: cookie(), accept, origin: STAND, 'sec-fetch-site': 'same-origin' }
    if (type) headers['content-type'] = type
    const res = await fetch(url, {
      method,
      redirect: 'manual',
      headers,
      body: method === 'GET' ? undefined : body
    })
    for (const set of res.headers.getSetCookie()) {
      const nv = set.split(';')[0]
      const k = nv.slice(0, nv.indexOf('='))
      const v = nv.slice(nv.indexOf('=') + 1)
      if (/Max-Age=0/i.test(set) || v === '') jar.delete(k)
      else jar.set(k, v)
    }
    const at = new URL(url)
    const loc = res.headers.get('location')
    hops.push({ method, path: at.pathname + at.search, status: res.status, location: loc })
    console.log(`# ${method} ${at.pathname}${at.search} -> ${res.status}${loc ? ` ${loc}` : ''}`)
    if (!loc || res.status < 300 || res.status >= 400)
      return { hops, status: res.status, path: at.pathname, body: await res.text() }
    if (res.status !== 307 && res.status !== 308) {
      method = 'GET'
      body = undefined
      type = undefined
    }
    url = new URL(loc, url).href
  }
  return { hops, status: 'redirect-loop', path: '', body: '' }
}
const signInPage = (r) => r.status === 200 && r.path === '/login'

// ── A. The card's Sign out, then where the card sends the browser next ─────────────────────────
const jar = new Map([['tracy_sess', await mintSession(OWNER, secret)]])
const page = await browserWalk(jar, 'GET', `${MOUNT}/`)
c.check('the site page loads for the owner (a seat is minted)', page.status === 200, page.status)
const out = await browserWalk(jar, 'POST', `${MOUNT}/gateway/logout`, { accept: '*/*' })
c.check(
  'POST <site>/gateway/logout answers 303 to /login (Tracy sign-out), never back to itself',
  out.hops[0].status === 303 && out.hops[0].location === '/login',
  `${out.hops[0].status} ${out.hops[0].location}`
)
c.check(
  'no hop of the card sign-out is a 405 or returns to /gateway/logout',
  !out.hops.some((h) => h.status === 405 || (h.location ?? '').includes('/gateway/logout')),
  out.hops.map((h) => `${h.status} ${h.path}`)
)
c.check('the card sign-out ends on the sign-in page', signInPage(out), `${out.status} ${out.path}`)
c.check('the Tracy session cookie is cleared by the card sign-out', !jar.has('tracy_sess'), [...jar.keys()])
const next = await browserWalk(jar, 'GET', `${MOUNT}/gateway/login`)
c.check(
  "the card's next stop <site>/gateway/login ends on the sign-in page (no 404)",
  signInPage(next) && !next.hops.some((h) => h.status === 404),
  next.hops.map((h) => `${h.status} ${h.path}`)
)
c.check(
  'and that sign-in page leads back to the site, not to the password page',
  next.hops.some((h) => (h.location ?? '').startsWith(`/login?next=${encodeURIComponent(`${MOUNT}/`)}`)),
  next.hops.map((h) => h.location)
)

// Tracy's own sign-out, unchanged: a form post answers 303 to its `next`, the session goes.
const jar2 = new Map([['tracy_sess', await mintSession(OWNER, secret)]])
const tracyOut = await browserWalk(jar2, 'POST', '/auth/signout', {
  body: 'next=%2Flogin',
  type: 'application/x-www-form-urlencoded'
})
c.check(
  "Tracy's own POST /auth/signout still answers 303 to /login and clears tracy_sess",
  tracyOut.hops[0].status === 303 && signInPage(tracyOut) && !jar2.has('tracy_sess'),
  tracyOut.hops.map((h) => `${h.status} ${h.path}`)
)

// ── B. The picker's delete button under the mount ───────────────────────────────────────────────
// Checked against the client code of the commit under test, not on the stand's page: a Tracy seat
// is never the dsh master and Tracy's bundles ship no picker dialog, so the button cannot appear on
// a real Tracy page; and on the stand `@tracy/dsh-brand`'s load tracker restores the `window.fetch`
// it captured, dropping any wrapper installed after it (measured 09/10 — raised separately).
// The test drives the real wrapped fetch with a mounted base tag.
const picker = nodeTest(['test/tracy/picker-delete-mount.test.ts'], {
  cwd: 'vendor/tracy/dsh-passwords',
  extra: ['--import', 'tsx']
})
for (const title of [
  'K5: dshPathOf strips the page mount',
  "K5: the owner's picker reads dsh's directory listing under a mount"
]) {
  c.check(
    `picker-delete-mount: "${title}…" passes`,
    picker.passed.some((t) => t.startsWith(title)) && !picker.failed.some((t) => t.startsWith(title)),
    picker.status === 0
      ? picker.passed
      : picker.output
          .split('\n')
          .filter((l) => /not ok|Error|not found/.test(l))
          .slice(0, 4)
  )
}
c.done()
