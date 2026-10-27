/**
 * The comment picker's security, server side (plan `tasks/todo-comment-to-edit.md` §S): the
 * ticket door (`sites/preview-ticket.js`), the tokens (`lib/preview-ticket.js`) and the site
 * proxy's redemption and injection (`bar/preview.js`, `bar/site-proxy.js`).
 *
 * Most cases need no database: the bar is built with a fake site book and a fake seat book, and
 * the door is mounted on a bare Hono app with a fake `requireGrant`. The last test goes through
 * `buildApp` against Postgres, so the wiring in `app.js` and `sites/route.js` is covered too.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { Hono } from 'hono'
import { barRoutes } from '../src/bar/route.js'
import { pickerScriptTag, reporterScriptTag, splitPreviewParam } from '../src/bar/preview.js'
import { siteTarget } from '../src/sites/resolver.js'
import { mountPreviewTicket } from '../src/sites/preview-ticket.js'
import { fileDb } from './_db.mjs'
import { outgoingCookieHeader, PREVIEW_COOKIE } from '../src/lib/cookies.js'
import { mintSession, SESSION_TTL_S } from '../src/lib/session.js'
import {
  PREVIEW_TICKET_TTL_S,
  continuationExpiry,
  mintPreviewContinuation,
  mintPreviewTicket,
  pickAllowed,
  readPreviewToken,
  seatHashOf,
  usedTicketStore
} from '../src/lib/preview-ticket.js'
import { normalizeRole } from '../src/seats/roles.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const SECRET = 's'.repeat(32)
const AUD = 'https://cowork.tracy.test'
const T0 = 1_800_000_000_000

function config(overrides = {}) {
  return {
    origin: AUD,
    secure: true,
    siteDomain: 'tracy.test',
    siteDomainAliases: [],
    sessionSecret: SECRET,
    sessionDomain: 'tracy.test',
    hostName: 'local',
    badgeUrl: 'https://cowork.tracy.test/badge.js',
    commentPicker: true,
    commentPickerInsecureDev: false,
    ...overrides
  }
}

// ── tokens ───────────────────────────────────────────────────────────────────────────────────

test('ticket: round-trips, carries a seat hash and never the email', async () => {
  const { ticket, exp } = await mintPreviewTicket({
    site: 'lantern.example',
    email: 'Owner@X.Y',
    aud: AUD,
    secret: SECRET,
    now: T0
  })
  assert.equal(exp, T0 / 1000 + PREVIEW_TICKET_TTL_S)
  assert.ok(!ticket.includes('owner'), 'no email in the token')
  assert.ok(!Buffer.from(ticket.split('.')[1], 'base64url').toString().includes('@'))
  const claims = await readPreviewToken('ticket', ticket, SECRET, T0)
  assert.equal(claims.site, 'lantern.example')
  assert.equal(claims.aud, AUD)
  assert.equal(claims.purpose, 'pick')
  assert.equal(claims.seatHash, await seatHashOf('owner@x.y'))
  assert.match(claims.seatHash, /^seat:[0-9a-f]{64}$/)
  assert.equal(typeof claims.jti, 'string')
})

test('ticket: expired, tampered, wrong secret, or the other kind of token is refused', async () => {
  const { ticket } = await mintPreviewTicket({
    site: 'a.example',
    email: 'o@x.y',
    aud: AUD,
    secret: SECRET,
    now: T0
  })
  assert.equal(await readPreviewToken('ticket', ticket, SECRET, T0 + PREVIEW_TICKET_TTL_S * 1000), null)
  assert.equal(await readPreviewToken('ticket', ticket, 'x'.repeat(32), T0), null)
  const [p, body, sig] = ticket.split('.')
  const forged = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), site: 'b.example' })
  ).toString('base64url')
  assert.equal(await readPreviewToken('ticket', `${p}.${forged}.${sig}`, SECRET, T0), null)
  // A ticket is not a continuation, a continuation is not a ticket, a session is neither.
  assert.equal(await readPreviewToken('continuation', ticket, SECRET, T0), null)
  const cont = await mintPreviewContinuation({
    site: 'a.example',
    seatHash: 'seat:x',
    aud: AUD,
    secret: SECRET,
    sessionExp: T0 / 1000 + 3600,
    now: T0
  })
  assert.equal(await readPreviewToken('ticket', cont, SECRET, T0), null)
  assert.ok(await readPreviewToken('continuation', cont, SECRET, T0 + 3599_000))
  const session = await mintSession('o@x.y', SECRET, T0)
  assert.equal(await readPreviewToken('ticket', session, SECRET, T0), null)
})

test('continuation: it lives exactly as long as the session it was issued under, never past the session TTL', async () => {
  const mint = (sessionExp) =>
    mintPreviewContinuation({
      site: 'a.example',
      seatHash: 'seat:x',
      aud: AUD,
      secret: SECRET,
      sessionExp,
      now: T0
    })
  // A session with five hours left: the continuation lapses with it, not after fifteen minutes.
  const sessionExp = T0 / 1000 + 5 * 3600
  const cont = await mint(sessionExp)
  assert.ok(await readPreviewToken('continuation', cont, SECRET, T0 + 20 * 60_000), 'alive past 15 min')
  assert.ok(await readPreviewToken('continuation', cont, SECRET, (sessionExp - 1) * 1000))
  assert.equal(await readPreviewToken('continuation', cont, SECRET, sessionExp * 1000), null)
  assert.equal(continuationExpiry(sessionExp, T0), sessionExp)
  // A claimed expiry beyond what any session can hold is capped at the session TTL from now.
  assert.equal(continuationExpiry(T0 / 1000 + 10 * SESSION_TTL_S, T0), T0 / 1000 + SESSION_TTL_S)
  // No session expiry at all: a continuation that is already over (fails closed).
  assert.equal(continuationExpiry(undefined, T0), T0 / 1000)
  assert.equal(await readPreviewToken('continuation', await mint(undefined), SECRET, T0), null)
})

test('usedTicketStore: a jti is claimable once, and forgotten after it expires', () => {
  let now = T0
  const store = usedTicketStore(() => now)
  assert.equal(store.claim('j1', T0 / 1000 + 120), true)
  assert.equal(store.claim('j1', T0 / 1000 + 120), false)
  now = T0 + 121_000
  assert.equal(store.claim('j2', now / 1000 + 120), true)
  assert.equal(store.size, 1, 'the expired jti was pruned')
})

// ── the ticket door ──────────────────────────────────────────────────────────────────────────

function door({ grant = { role: 'editor' }, email = 'e@x.y', cfg = config(), mayPick } = {}) {
  const app = new Hono()
  mountPreviewTicket(app, {
    config: cfg,
    requireGrant: async (c) => {
      if (!email) return { error: c.json({ code: 'NOT_SIGNED_IN' }, 401) }
      if (!grant) return { error: c.json({ code: 'SEAT_NOT_AUTHORIZED' }, 403) }
      return { email, account: { id: 1 }, grant }
    },
    mayPick: mayPick ?? (async (_site, role) => pickAllowed(normalizeRole, role)),
    now: () => T0
  })
  const ask = (body = { parentOrigin: AUD }, headers = { origin: AUD }) =>
    app.fetch(
      new Request('https://cowork.tracy.test/api/sites/lantern.example/preview-ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })
    )
  return { ask }
}

test('door: flag off answers 404, before anything else is read', async () => {
  const res = await door({ cfg: config({ commentPicker: false }) }).ask()
  assert.equal(res.status, 404)
})

test('door: an agent actor header is refused even with a seat', async () => {
  const res = await door().ask({ parentOrigin: AUD }, { origin: AUD, 'x-tracy-actor': 'anything' })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'AGENT_NOT_ALLOWED')
})

test('door: signed out is 401, no seat is 403', async () => {
  assert.equal((await door({ email: null }).ask()).status, 401)
  const res = await door({ grant: null }).ask()
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'SEAT_NOT_AUTHORIZED')
})

test('door: a role the bound rule refuses is 403 ROLE_CANNOT_EDIT', async () => {
  const res = await door({ grant: { role: 'constructor' } }).ask()
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'ROLE_CANNOT_EDIT', role: 'constructor' })
  // The bound rule decides, not the role name.
  const narrowed = await door({ grant: { role: 'editor' }, mayPick: async () => false }).ask()
  assert.equal(narrowed.status, 403)
})

test('pickAllowed: every role of the seat book, viewer included; an unknown role, no role or no rule do not', () => {
  assert.equal(pickAllowed(normalizeRole, 'owner'), true)
  assert.equal(pickAllowed(normalizeRole, 'editor'), true)
  assert.equal(pickAllowed(normalizeRole, 'viewer'), true)
  assert.equal(pickAllowed(normalizeRole, 'constructor'), false)
  assert.equal(pickAllowed(normalizeRole, null), false)
  assert.equal(pickAllowed(undefined, 'owner'), false)
  assert.equal(
    pickAllowed(() => {
      throw new Error('boom')
    }, 'owner'),
    false,
    'a rule that throws is no'
  )
})

test('door: every live seat gets a ticket, a viewer included (ADR 0028: a viewer comments)', async () => {
  for (const role of ['owner', 'editor', 'viewer']) {
    const res = await door({ grant: { role } }).ask()
    assert.equal(res.status, 200, role)
  }
  // An agent never picks, whatever the seat.
  const agent = await door({ grant: { role: 'viewer' } }).ask(
    { parentOrigin: AUD },
    { origin: AUD, 'x-tracy-actor': 'anything' }
  )
  assert.equal(agent.status, 403)
  assert.equal((await agent.json()).code, 'AGENT_NOT_ALLOWED')
  // Nor does a viewer escape the origin check.
  const elsewhere = await door({ grant: { role: 'viewer' } }).ask(
    { parentOrigin: 'https://evil.example' },
    { origin: 'https://evil.example' }
  )
  assert.equal(elsewhere.status, 400)
  assert.equal((await elsewhere.json()).code, 'PARENT_ORIGIN_NOT_ALLOWED')
})

test('door: parentOrigin must be present, equal the request Origin, and be allowlisted', async () => {
  const d = door()
  for (const [body, headers] of [
    [{}, { origin: AUD }],
    [{ parentOrigin: AUD }, {}],
    [{ parentOrigin: AUD }, { origin: 'https://evil.example' }],
    [{ parentOrigin: 'https://evil.example' }, { origin: 'https://evil.example' }],
    [{ parentOrigin: 'http://127.0.0.1:51710' }, { origin: 'http://127.0.0.1:51710' }]
  ]) {
    const res = await d.ask(body, headers)
    assert.equal(res.status, 400, JSON.stringify({ body, headers }))
    assert.equal((await res.json()).code, 'PARENT_ORIGIN_NOT_ALLOWED')
  }
})

test('door: success is {ticket, exp}, no-store, bound to site + seat hash + aud', async () => {
  const res = await door().ask()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  assert.deepEqual(Object.keys(body).sort(), ['exp', 'ticket'])
  assert.equal(body.exp, T0 / 1000 + 120)
  const claims = await readPreviewToken('ticket', body.ticket, SECRET, T0)
  assert.equal(claims.site, 'lantern.example')
  assert.equal(claims.aud, AUD)
  assert.equal(claims.seatHash, await seatHashOf('e@x.y'))
})

// ── the site proxy ───────────────────────────────────────────────────────────────────────────

const PAGE = '<html><body><p>hi</p></body></html>'

/** No picker on the page: neither its tag nor the attribute that turns it on. */
function noPicker(html) {
  return !html.includes('data-tracy-preview="pick"') && !html.includes('data-parent-origin')
}

/** The bar with a fake site book and seat book: `roles` maps email → role on `lantern.example`. */
function bar({ cfg = config(), roles = { 'e@x.y': 'editor' }, upstream, mayPick, ensureFramePolicy } = {}) {
  const calls = []
  const app = barRoutes({
    pool: {},
    ensureFramePolicy,
    config: cfg,
    sites: {
      byLabel: async (_pool, label) =>
        label === 'lantern'
          ? { site_key: 'lantern.example', label: 'lantern', host: 'local', publish: 'draft' }
          : null,
      target: siteTarget
    },
    seats: {
      accountByEmail: async (_pool, email) => (roles[email] ? { id: email } : null),
      grantFor: async (_pool, id) => (roles[id] ? { role: roles[id] } : null)
    },
    mayPick: mayPick ?? (async (_site, role) => pickAllowed(normalizeRole, role)),
    fetchImpl: async (req) => {
      calls.push(req)
      return (
        upstream?.(req) ?? new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      )
    }
  })
  return { app, calls }
}

async function sessionCookie(email, now = Date.now()) {
  return `tracy_sess=${await mintSession(email, SECRET, now)}`
}

/** The `Max-Age` of the one `Set-Cookie` a response carries. */
function maxAgeOf(res) {
  const [cookie] = res.headers.getSetCookie()
  return Number(/Max-Age=(\d+)/.exec(cookie ?? '')?.[1])
}

async function ticketFor(email = 'e@x.y', { site = 'lantern.example', aud = AUD, now = Date.now() } = {}) {
  return (await mintPreviewTicket({ site, email, aud, secret: SECRET, now })).ticket
}

function visit(app, path, { cookie, dest = 'iframe', proto = 'https', method = 'GET' } = {}) {
  return app.fetch(
    new Request(`http://lantern.tracy.test${path}`, {
      method,
      headers: {
        host: 'lantern.tracy.test',
        'x-forwarded-proto': proto,
        ...(dest ? { 'sec-fetch-dest': dest } : {}),
        ...(cookie ? { cookie } : {})
      }
    })
  )
}

test('splitPreviewParam: strips only the ticket, keeps every other byte', () => {
  assert.deepEqual(splitPreviewParam('?a=b%20c&tracy_preview=T&x=1+2'), {
    search: '?a=b%20c&x=1+2',
    ticket: 'T'
  })
  assert.deepEqual(splitPreviewParam('?tracy_preview=T'), { search: '', ticket: 'T' })
  assert.deepEqual(splitPreviewParam('?a=b%20c'), { search: '?a=b%20c', ticket: null })
  assert.deepEqual(splitPreviewParam('?tracy%5Fpreview=T&a=1'), { search: '?a=1', ticket: 'T' })
  assert.deepEqual(splitPreviewParam(''), { search: '', ticket: null })
})

test('redeem: a valid ticket in an iframe answers 303 to the clean URL with the continuation cookie', async () => {
  const { app, calls } = bar()
  const ticket = await ticketFor()
  // Signed in ten hours ago: the continuation lives for what is left of that session.
  const res = await visit(app, `/about/?lang=vi&tracy_preview=${ticket}`, {
    cookie: await sessionCookie('e@x.y', Date.now() - 10 * 3600_000)
  })
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), 'https://lantern.tracy.test/about/?lang=vi')
  assert.equal(res.headers.get('cache-control'), 'private, no-store')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  const [cookie] = res.headers.getSetCookie()
  assert.match(cookie, /^__Host-tracy_pv=pc1\./)
  for (const attr of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax'])
    assert.ok(cookie.includes(attr), `${attr} in ${cookie}`)
  const left = SESSION_TTL_S - 10 * 3600
  assert.ok(Math.abs(maxAgeOf(res) - left) <= 2, `Max-Age ${maxAgeOf(res)} ≈ the session's ${left}`)
  const claims = await readPreviewToken('continuation', cookie.split(';')[0].split('=')[1], SECRET)
  assert.ok(Math.abs(claims.exp - (Math.floor(Date.now() / 1000) + left)) <= 2, 'token exp = session exp')
  assert.ok(!/Domain=/i.test(cookie), 'host-only')
  assert.equal(calls.length, 0, 'the 303 is answered without asking the site')
})

test('redeem: a viewer seat redeems its ticket too — the picker only points, it writes nothing', async () => {
  const { app, calls } = bar({ roles: { 'e@x.y': 'viewer' } })
  const res = await visit(app, `/?tracy_preview=${await ticketFor()}`, {
    cookie: await sessionCookie('e@x.y')
  })
  assert.equal(res.status, 303)
  assert.match(res.headers.getSetCookie()[0], /^__Host-tracy_pv=pc1\./)
  assert.equal(calls.length, 0)
})

test('redeem: a ticket is single-use — the replay is proxied without the ticket and without a cookie', async () => {
  const { app, calls } = bar()
  const ticket = await ticketFor()
  const cookie = await sessionCookie('e@x.y')
  assert.equal((await visit(app, `/?tracy_preview=${ticket}`, { cookie })).status, 303)
  const replay = await visit(app, `/?tracy_preview=${ticket}`, { cookie })
  assert.equal(replay.status, 200)
  assert.deepEqual(replay.headers.getSetCookie(), [])
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).search, '', 'the ticket never reaches the site')
  const html = await replay.text()
  assert.ok(noPicker(html), html)
  // No picker, but the page still says where it is to Tracy's origin (runtime 18, feature `address`).
  assert.ok(html.includes(`${reporterScriptTag(AUD)}</body>`), html)
})

// An IMPORTED site keeps the customer's domain as its key (`lantern.example` in this fixture) while
// its fleet copy answers at `<label>.<zone>` (`lantern.tracy.test`), and every road Tracy opens it on
// is that copy address — so the picker on an import IS this proxy, no plugin involved (measured on
// the stand 27/09, `tasks/evidence/comment-to-edit/import-findings.md` §1A). The binding is to the
// KEY the workspace asks with, never to the hostname the frame happens to load.
test('redeem: an imported site binds the ticket to its key, not to its copy hostname', async () => {
  const cookie = await sessionCookie('e@x.y')
  const byKey = bar()
  assert.equal((await visit(byKey.app, `/?tracy_preview=${await ticketFor()}`, { cookie })).status, 303)
  const byHost = bar()
  const res = await visit(
    byHost.app,
    `/?tracy_preview=${await ticketFor('e@x.y', { site: 'lantern.tracy.test' })}`,
    {
      cookie
    }
  )
  assert.equal(res.status, 200)
  assert.deepEqual(res.headers.getSetCookie(), [])
  assert.equal(byHost.calls[0].headers.get('x-tracy-preview'), null)
})

test('redeem: refused tickets are stripped before the upstream fetch and change nothing else', async () => {
  const cases = [
    ['expired', await ticketFor('e@x.y', { now: Date.now() - 121_000 }), 'e@x.y', {}],
    ['another site', await ticketFor('e@x.y', { site: 'other.example' }), 'e@x.y', {}],
    ['another person', await ticketFor('someone@x.y'), 'e@x.y', {}],
    ['aud not allowlisted', await ticketFor('e@x.y', { aud: 'https://evil.example' }), 'e@x.y', {}],
    ['signed out', await ticketFor(), null, {}],
    ['seat gone', await ticketFor(), 'e@x.y', { roles: {} }],
    ['not a seat role', await ticketFor(), 'e@x.y', { roles: { 'e@x.y': 'constructor' } }],
    ['forged', `${(await ticketFor()).slice(0, -4)}AAAA`, 'e@x.y', {}]
  ]
  for (const [name, ticket, email, opts] of cases) {
    const { app, calls } = bar(opts)
    const res = await visit(app, `/p?a=1&tracy_preview=${ticket}`, {
      cookie: email ? await sessionCookie(email) : undefined
    })
    assert.equal(res.status, 200, name)
    assert.deepEqual(res.headers.getSetCookie(), [], name)
    assert.equal(calls.length, 1, name)
    assert.equal(new URL(calls[0].url).search, '?a=1', `${name}: ticket stripped upstream`)
    assert.equal(calls[0].headers.get('x-tracy-preview'), null, name)
  }
})

test('Sec-Fetch-Dest: on https only an iframe navigation redeems — a document or no header does not', async () => {
  for (const dest of ['document', null, 'empty']) {
    const { app, calls } = bar()
    const res = await visit(app, `/?tracy_preview=${await ticketFor()}`, {
      cookie: await sessionCookie('e@x.y'),
      dest
    })
    assert.equal(res.status, 200, String(dest))
    assert.equal(new URL(calls[0].url).search, '', 'still stripped')
  }
  // A POST never redeems either.
  const { app } = bar()
  const post = await visit(app, `/?tracy_preview=${await ticketFor()}`, {
    cookie: await sessionCookie('e@x.y'),
    method: 'POST'
  })
  assert.equal(post.status, 200)
})

test('Sec-Fetch-Dest: a plain-HTTP stand redeems only with TRACY_COMMENT_PICKER_INSECURE_DEV, and then without __Host-', async () => {
  const off = bar({ cfg: config({ origin: AUD }) })
  const refused = await visit(off.app, `/?tracy_preview=${await ticketFor()}`, {
    cookie: await sessionCookie('e@x.y'),
    proto: 'http',
    dest: null
  })
  assert.equal(refused.status, 200)

  const on = bar({ cfg: config({ commentPickerInsecureDev: true }) })
  const res = await visit(on.app, `/?tracy_preview=${await ticketFor()}`, {
    cookie: await sessionCookie('e@x.y'),
    proto: 'http',
    dest: null
  })
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), 'http://lantern.tracy.test/')
  const [cookie] = res.headers.getSetCookie()
  assert.match(cookie, /^tracy_pv=/)
  assert.ok(!cookie.includes('Secure'))
  // Even with the switch, an explicit non-iframe destination is refused.
  const doc = await visit(on.app, `/?tracy_preview=${await ticketFor()}`, {
    cookie: await sessionCookie('e@x.y'),
    proto: 'http',
    dest: 'document'
  })
  assert.equal(doc.status, 200)
})

async function continuationCookie(email = 'e@x.y', overrides = {}) {
  const value = await mintPreviewContinuation({
    site: 'lantern.example',
    seatHash: await seatHashOf(email),
    aud: AUD,
    secret: SECRET,
    sessionExp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
    ...overrides
  })
  return `${PREVIEW_COOKIE}=${value}`
}

test('inject: a valid continuation + live seat gets the picker, the upstream header and the leak headers', async () => {
  const { app, calls } = bar({
    upstream: () =>
      new Response(PAGE, {
        headers: {
          'content-type': 'text/html',
          'content-security-policy': "frame-ancestors 'self' https://*.tracy.test",
          'cache-control': 'public, max-age=600',
          vary: 'Accept-Encoding'
        }
      })
  })
  const res = await visit(app, '/', {
    cookie: `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`
  })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes(`${pickerScriptTag(AUD)}</body>`), html)
  assert.match(html, /<script data-parent-origin="https:\/\/cowork\.tracy\.test" data-tracy-preview="pick">/)
  assert.equal(calls[0].headers.get('x-tracy-preview'), 'pick')
  assert.equal(res.headers.get('cache-control'), 'private, no-store')
  assert.match(res.headers.get('vary'), /Accept-Encoding/)
  assert.match(res.headers.get('vary'), /Cookie/)
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
})

test('inject: the narrow frame-ancestors is a SEPARATE CSP header; the site policy is untouched', async () => {
  const sitePolicy = "default-src 'self'; frame-ancestors 'self' https://*.tracy.test"
  const { app } = bar({
    upstream: () =>
      new Response(PAGE, { headers: { 'content-type': 'text/html', 'content-security-policy': sitePolicy } })
  })
  const res = await visit(app, '/', {
    cookie: `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`
  })
  // Headers.get joins repeated headers with ", "; the site's value must survive intact as its own entry.
  const csp = res.headers.get('content-security-policy')
  assert.equal(csp, `${sitePolicy}, frame-ancestors 'self' ${AUD}`)
})

/**
 * REGRESSION (25/10/2026, `tracy-ai-8836f920.tracy.site`): a site page that frames a page of its
 * OWN origin showed "refused to connect" inside Tracy's preview, and only there. The nested frame's
 * request is itself a framed navigation carrying the continuation cookie, so it got the picker
 * header too; that header named only the app, and `frame-ancestors` is checked against EVERY
 * ancestor, so the nested frame's parent (the site itself) was refused. The narrowing must still
 * refuse any parent that is neither the site nor the ticket's app origin.
 */
test('inject: the narrow frame-ancestors lets the site frame its own pages inside the app, nothing more', async () => {
  const { app } = bar({
    upstream: () =>
      new Response(PAGE, {
        headers: {
          'content-type': 'text/html',
          'content-security-policy': "frame-ancestors 'self' https://*.tracy.test"
        }
      })
  })
  const res = await visit(app, '/demo/nested.html', {
    cookie: `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`
  })
  const narrow = res.headers
    .get('content-security-policy')
    .split(', ')
    .find((policy) => !policy.includes('*.tracy.test'))
  assert.deepEqual(narrow.split(/\s+/), ['frame-ancestors', "'self'", AUD])
})

test('inject: nothing without the cookie, with a cookie for another person, or once the seat is gone', async () => {
  const cases = [
    ['no cookie', await sessionCookie('e@x.y'), {}],
    ['other person', `${await sessionCookie('e@x.y')}; ${await continuationCookie('someone@x.y')}`, {}],
    ['signed out', await continuationCookie(), {}],
    ['seat revoked', `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`, { roles: {} }],
    [
      'session expired',
      `${await sessionCookie('e@x.y', Date.now() - (SESSION_TTL_S + 60) * 1000)}; ${await continuationCookie()}`,
      {}
    ],
    [
      'continuation lapsed with its session',
      `${await sessionCookie('e@x.y')}; ${await continuationCookie('e@x.y', { sessionExp: Math.floor(Date.now() / 1000) - 1 })}`,
      {}
    ],
    [
      'top-level visit',
      `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`,
      { dest: 'document' }
    ]
  ]
  for (const [name, cookie, { roles, dest }] of cases) {
    const { app, calls } = bar(roles ? { roles } : {})
    const res = await visit(app, '/', { cookie, ...(dest ? { dest } : {}) })
    const html = await res.text()
    assert.ok(noPicker(html), name)
    // A framed page with no picker still names Tracy's origin for its address; a top-level visit
    // has no parent to tell and gets nothing.
    if (dest === 'document') assert.ok(!html.includes('data-tracy-preview'), name)
    else assert.ok(html.includes(`${reporterScriptTag(AUD)}</body>`), name)
    assert.equal(calls[0].headers.get('x-tracy-preview'), null, name)
    assert.notEqual(res.headers.get('referrer-policy'), 'no-referrer', name)
    assert.deepEqual(res.headers.getSetCookie(), [], `${name}: no continuation is (re)issued`)
  }
})

test("report: a framed page served without the picker names Tracy's origin for its address, and nothing else", async () => {
  // Brian 30/09/2026, EmDash on the local stand: the frame's request carried no session for the seat
  // the ticket named, so the page came back without the picker — and without anything that could say
  // where a link followed inside it had gone. The address bar stayed on the page the tab had opened.
  const { app, calls } = bar()
  const res = await visit(app, '/contact/', { cookie: await sessionCookie('stranger@x.y') })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(noPicker(html), html)
  assert.ok(html.includes(`${reporterScriptTag(AUD)}</body>`), html)
  assert.match(
    html,
    /<script data-report-origin="https:\/\/cowork\.tracy\.test" data-tracy-preview="address">/
  )
  // Not a picker response: the site is not told `pick`, no cookie, no picker headers.
  assert.equal(calls[0].headers.get('x-tracy-preview'), null)
  assert.deepEqual(res.headers.getSetCookie(), [])
  assert.notEqual(res.headers.get('referrer-policy'), 'no-referrer')
  assert.notEqual(res.headers.get('cache-control'), 'private, no-store')

  // A plain-HTTP stand without the dev switch cannot tell a frame from a visit: nothing.
  const http = await visit(bar({ cfg: config({ origin: AUD }) }).app, '/', { proto: 'http', dest: null })
  assert.ok(!(await http.text()).includes('data-tracy-preview'))
  // With the switch, a frame on it gets the reporter too.
  const stand = await visit(bar({ cfg: config({ commentPickerInsecureDev: true }) }).app, '/', {
    proto: 'http',
    dest: null
  })
  assert.ok((await stand.text()).includes(reporterScriptTag(AUD)))
})

test('reporterScriptTag: the same runtime, told only where to say its address; an embedded </script cannot close the tag', () => {
  const tag = reporterScriptTag('https://a.example')
  assert.ok(!tag.includes('</script><'))
  assert.ok(!tag.includes('data-parent-origin'), 'never the attribute that turns the picker on')
  assert.match(
    reporterScriptTag('https://a.example"><x'),
    /data-report-origin="https:\/\/a\.example&quot;&gt;&lt;x"/
  )
})

test('slide: a session re-minted since the continuation was issued carries it along on the next picker load', async () => {
  const { app } = bar()
  const nowS = Math.floor(Date.now() / 1000)
  // Issued under a session with an hour left; `/auth/me` has since re-minted the session (72 h).
  const res = await visit(app, '/', {
    cookie: `${await sessionCookie('e@x.y')}; ${await continuationCookie('e@x.y', { sessionExp: nowS + 3600 })}`
  })
  assert.ok((await res.text()).includes('data-tracy-preview="pick"'))
  const [cookie] = res.headers.getSetCookie()
  assert.match(cookie, /^__Host-tracy_pv=pc1\./)
  assert.ok(Math.abs(maxAgeOf(res) - SESSION_TTL_S) <= 2, `Max-Age ${maxAgeOf(res)}`)
  const claims = await readPreviewToken('continuation', cookie.split(';')[0].split('=')[1], SECRET)
  assert.ok(claims.exp > nowS + 3600, 'the new continuation follows the new session')
  assert.equal(res.headers.get('cache-control'), 'private, no-store')

  // Already as long as its session: nothing is re-set, so an ordinary load writes no cookie.
  const same = await visit(app, '/', {
    cookie: `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`
  })
  assert.ok((await same.text()).includes('data-tracy-preview="pick"'))
  assert.deepEqual(same.headers.getSetCookie(), [])
})

test('the continuation cookie never reaches the site, nor does a client-sent x-tracy-preview', async () => {
  const { app, calls } = bar()
  await app.fetch(
    new Request('http://lantern.tracy.test/', {
      headers: {
        host: 'lantern.tracy.test',
        'x-forwarded-proto': 'https',
        'sec-fetch-dest': 'iframe',
        'x-tracy-preview': 'pick',
        cookie: `wp_cookie=1; ${await continuationCookie('someone@x.y')}; tracy_pv=x`
      }
    })
  )
  assert.equal(calls[0].headers.get('cookie'), 'wp_cookie=1')
  assert.equal(calls[0].headers.get('x-tracy-preview'), null)
  assert.equal(outgoingCookieHeader(`__Host-tracy_pv=a; __host-TRACY_PV=b; keep=1`, null), 'keep=1')
})

test('flag off: tickets and cookies are ignored entirely — the request reaches the site as sent', async () => {
  const { app, calls } = bar({ cfg: config({ commentPicker: false }) })
  const ticket = await ticketFor()
  const res = await visit(app, `/?tracy_preview=${ticket}`, {
    cookie: `${await sessionCookie('e@x.y')}; ${await continuationCookie()}`
  })
  assert.equal(res.status, 200)
  assert.ok(!(await res.text()).includes('data-tracy-preview'))
  assert.equal(new URL(calls[0].url).searchParams.get('tracy_preview'), ticket)
  assert.equal(calls[0].headers.get('x-tracy-preview'), null)
  assert.equal(res.headers.get('referrer-policy'), null)
})

test('pickerScriptTag: an embedded </script cannot close the tag early', async () => {
  assert.ok(!pickerScriptTag('https://a.example').includes('</script><'))
  assert.match(
    pickerScriptTag('https://a.example"><x'),
    /data-parent-origin="https:\/\/a\.example&quot;&gt;&lt;x"/
  )
})

// ── end to end through buildApp (Postgres) ───────────────────────────────────────────────────

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

test(
  'end to end: an editor asks the door for a ticket, the site proxy redeems it once',
  dbOpts,
  async (t) => {
    const { buildApp } = await import('../src/app.js')
    const { readConfig } = await import('../src/config.js')
    const { dbSitesResolver } = await import('../src/sites/resolver.js')
    const { createSite } = await import('../src/sites/store.js')
    const { hostCall, hostJob } = await import('../src/host/client.js')
    const { pool } = db
    const env = {
      TRACY_ORIGIN: AUD,
      SITE_DOMAIN: 'tracy.test',
      SESSION_SECRET: SECRET,
      HOSTS: 'local',
      HOST_NAME: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      TRACY_COMMENT_PICKER: '1'
    }
    const cfg = readConfig(env)
    assert.equal(cfg.commentPicker, true)
    await createSite(pool, { siteKey: 'lantern.example', label: 'lantern', host: 'local' })
    const acct = (await pool.query("insert into account (email) values ('e@x.y') returning id")).rows[0]
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('lantern.example', $1, 'editor', $1, now())`,
      [acct.id]
    )
    // `app.js` gives the bar no injected fetch (it dials the site container), so the site's own
    // copy is stood in for at the global for the length of this test.
    const upstream = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (req) => {
      if (String(req).endsWith('/_host/frame-policy')) return Response.json({ state: 'current' })
      upstream.push(req)
      return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
    }
    t.after(() => {
      globalThis.fetch = realFetch
    })
    const app = buildApp({
      config: cfg,
      pool,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, cfg),
      host: { hostCall, hostJob }
    })
    const cookie = await sessionCookie('e@x.y')
    const issued = await app.fetch(
      new Request('https://cowork.tracy.test/api/sites/lantern.example/preview-ticket', {
        method: 'POST',
        headers: { host: 'cowork.tracy.test', origin: AUD, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ parentOrigin: AUD })
      })
    )
    assert.equal(issued.status, 200)
    const { ticket } = await issued.json()

    const frame = (path, extraCookie = '') =>
      app.fetch(
        new Request(`http://lantern.tracy.test${path}`, {
          headers: {
            host: 'lantern.tracy.test',
            'x-forwarded-proto': 'https',
            'sec-fetch-dest': 'iframe',
            cookie: `${cookie}${extraCookie}`
          }
        })
      )
    const redeemed = await frame(`/?tracy_preview=${ticket}`)
    assert.equal(redeemed.status, 303)
    const pv = redeemed.headers.getSetCookie()[0].split(';')[0]
    const page = await frame('/', `; ${pv}`)
    assert.equal(page.status, 200)
    assert.ok((await page.text()).includes('data-tracy-preview="pick"'))
    assert.equal(upstream.at(-1).headers.get('x-tracy-preview'), 'pick')
    assert.equal(upstream.at(-1).headers.get('cookie'), null)
    assert.equal((await frame(`/?tracy_preview=${ticket}`)).status, 200, 'single use')

    // An agent never gets one, and with the flag off the door does not exist.
    const agent = await app.fetch(
      new Request('https://cowork.tracy.test/api/sites/lantern.example/preview-ticket', {
        method: 'POST',
        headers: {
          host: 'cowork.tracy.test',
          origin: AUD,
          'x-tracy-actor': 'x',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ parentOrigin: AUD })
      })
    )
    assert.equal(agent.status, 403)
  }
)

test('config: both switches are off by default; the insecure dev switch is refused on an https origin', async () => {
  const { readConfig } = await import('../src/config.js')
  const base = {
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  }
  const off = readConfig({ ...base, TRACY_ORIGIN: AUD })
  assert.equal(off.commentPicker, false)
  assert.equal(off.commentPickerInsecureDev, false)
  assert.throws(
    () => readConfig({ ...base, TRACY_ORIGIN: AUD, TRACY_COMMENT_PICKER_INSECURE_DEV: '1' }),
    /TRACY_COMMENT_PICKER_INSECURE_DEV/
  )
  const stand = readConfig({
    ...base,
    TRACY_ORIGIN: 'http://tracy.test:8080',
    TRACY_COMMENT_PICKER_INSECURE_DEV: '1'
  })
  assert.equal(stand.commentPickerInsecureDev, true)
})

test('a vouched frame reconciles managed policy before upstream; direct visitors never trigger a write', async () => {
  const order = []
  const b = bar({
    ensureFramePolicy: async () => {
      order.push('policy')
      return true
    },
    upstream: () => {
      order.push('upstream')
      return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
    }
  })
  await visit(b.app, '/', { dest: 'document' })
  assert.deepEqual(order, ['upstream'])
  order.length = 0
  const cookie = await sessionCookie('e@x.y')
  const ticket = await ticketFor()
  const redirect = await visit(b.app, `/?tracy_preview=${ticket}`, { cookie })
  assert.equal(redirect.status, 303)
  const continuation = redirect.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const framed = await visit(b.app, '/', { cookie: `${cookie}; ${continuation}` })
  assert.equal(framed.status, 200)
  assert.deepEqual(order, ['policy', 'upstream'])
})

test('a failed frame-policy reconciliation returns a framable translated page before upstream', async () => {
  const b = bar({ ensureFramePolicy: async () => false })
  const cookie = await sessionCookie('e@x.y')
  const ticket = await ticketFor()
  const redirect = await visit(b.app, `/?tracy_preview=${ticket}`, { cookie })
  const continuation = redirect.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const answer = await visit(b.app, '/', { cookie: `${cookie}; ${continuation}` })
  assert.equal(answer.status, 503)
  assert.equal(answer.headers.get('x-frame-options'), null)
  assert.ok(!answer.headers.get('content-security-policy')?.includes('frame-ancestors'))
  assert.equal(b.calls.length, 0)
})
