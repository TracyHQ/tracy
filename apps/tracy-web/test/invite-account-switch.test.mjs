/**
 * #799 — an invitation opened while signed in as SOMEONE ELSE must offer a way out.
 *
 * `GET /invite/:token` refuses a viewer who is not the invited address with `wrongAccountPage`
 * (403). The page's one action used to be a link to `/login?next=/invite/<token>`, and `/login`
 * sends a person who already holds a session straight on to `next` — back to the same 403. The
 * action is now a form that posts to `/auth/signout` and carries that same login address as
 * `next`, so the wrong session is gone before the sign-in door is asked.
 *
 * WHAT THIS FILE RUNS. The real `seatsRoutes` and `identityRoutes` behind the real `csrfGuard`,
 * in one process, driven the way a browser with JavaScript off drives them: read the action out
 * of the rendered page, submit exactly the fields it carries, apply every `Set-Cookie` to a jar,
 * follow the redirect.
 *
 * WHAT IT DOES NOT RUN. There is no database: `pool` answers the `rate_bucket` upsert and nothing
 * else, and any other statement is recorded as a violation. So the refusal is proven to write
 * nothing, and the acceptance itself (`ensureAccount`, `acceptGrant`) is NOT exercised here — its
 * own suite (`seats.test.mjs`) needs Postgres. Cookie handling is this file's small jar, not a
 * browser's; `Domain`, `Secure` and `SameSite` are not modelled.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { parseHTML } from 'linkedom'
import { readConfig } from '../src/config.js'
import { identityRoutes } from '../src/identity/route.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { csrfGuard } from '../src/lib/csrf.js'
import { WRITE_LIMIT_PER_HOUR } from '../src/lib/policy.js'
import { mintSession } from '../src/lib/session.js'
import { signTeamInvite } from '../src/lib/team-invite.js'
import { seatsRoutes } from '../src/seats/route.js'

const ORIGIN = 'http://tracy.test'
const INVITED = 'invited@example.test'
const SIGNED_IN = 'other@example.test'
const SITE_KEY = 'acme.tracy.test'

const config = readConfig({
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})

/**
 * A pool that knows one statement. `rate` decides what the rate upsert answers: a count, or a
 * rejection. Everything else is refused AND remembered in `forbidden`, because a route may catch
 * the rejection — the list is what a test asserts on.
 */
function strictPool({ rate = () => 1 } = {}) {
  const rateQueries = []
  const forbidden = []
  return {
    rateQueries,
    forbidden,
    async query(sql, params) {
      const text = String(sql)
      if (/^\s*insert into rate_bucket\b/.test(text)) {
        rateQueries.push(params)
        return { rows: [{ count: await rate() }] }
      }
      forbidden.push(text.trim().split('\n')[0])
      throw new Error('strictPool: only the rate_bucket upsert is answered')
    }
  }
}

function harness(poolOptions) {
  const pool = strictPool(poolOptions)
  const sent = []
  const mail = { send: async (m) => void sent.push(m) }
  const app = new Hono()
  app.use('*', csrfGuard({ config, now: Date.now }))
  app.route('/', identityRoutes({ store: memoryIdentityStore(), mail, config }))
  app.route('/', seatsRoutes({ pool, config, mail, sites: { labelOf: async () => 'acme' } }))
  return { app, pool, sent }
}

const inviteToken = (secret = config.sessionSecret) =>
  signTeamInvite({ email: INVITED, role: 'editor', siteKeys: [SITE_KEY] }, secret)

const sessionOf = (email, now) => mintSession(email, config.sessionSecret, now)

/** A browser's cookie jar, as far as these doors need one: name → value, `Max-Age=0` deletes. */
function jarOf(entries = {}) {
  const jar = new Map(Object.entries(entries))
  return {
    jar,
    header: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
    apply(response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split(';').map((part) => part.trim())
        const name = pair.slice(0, pair.indexOf('='))
        const value = pair.slice(pair.indexOf('=') + 1)
        if (value === '' || attrs.some((attr) => /^max-age=0$/i.test(attr))) jar.delete(name)
        else jar.set(name, value)
      }
    }
  }
}

function get(app, url, cookie) {
  return app.fetch(new Request(new URL(url, ORIGIN), { headers: cookie ? { cookie } : {} }))
}

/** A native same-origin form post, with the headers a current browser sends for one. */
function postForm(app, url, fields, cookie, headers = {}) {
  return app.fetch(
    new Request(new URL(url, ORIGIN), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: ORIGIN,
        'sec-fetch-site': 'same-origin',
        ...(cookie ? { cookie } : {}),
        ...headers
      },
      body: new URLSearchParams(fields).toString()
    })
  )
}

/**
 * The one thing the page asks the person to do, read from the DOM and nothing else: a form's
 * submit button, or failing that a link. Returns what pressing it sends.
 */
function actionOf(html) {
  const { document } = parseHTML(html)
  const main = document.querySelector('main')
  const submit = main.querySelector('form button[type="submit"]')
  if (submit) {
    const form = submit.closest('form')
    return {
      kind: 'form',
      form,
      method: (form.getAttribute('method') ?? 'get').toUpperCase(),
      url: form.getAttribute('action'),
      fields: Object.fromEntries(
        [...form.querySelectorAll('input[name]')].map((input) => [
          input.getAttribute('name'),
          input.getAttribute('value') ?? ''
        ])
      ),
      label: submit.textContent
    }
  }
  const link = main.querySelector('a[href]')
  return link
    ? { kind: 'link', method: 'GET', url: link.getAttribute('href'), label: link.textContent }
    : null
}

/** Press `action` and follow redirects the way a browser does, the jar riding along. */
async function press(app, action, cookies) {
  let response =
    action.method === 'POST'
      ? await postForm(app, action.url, action.fields, cookies.header())
      : await get(app, action.url, cookies.header())
  cookies.apply(response)
  const hops = [{ status: response.status, url: action.url }]
  while ([301, 302, 303, 307, 308].includes(response.status) && hops.length < 6) {
    const url = response.headers.get('location')
    response = await get(app, url, cookies.header())
    cookies.apply(response)
    hops.push({ status: response.status, url })
  }
  return { response, hops }
}

async function wrongAccountVisit(poolOptions) {
  const h = harness(poolOptions)
  const token = await inviteToken()
  const cookies = jarOf({
    tracy_sess: await sessionOf(SIGNED_IN),
    tracy_site: 'previous.tracy.test',
    tracy_tok_dsh_previous: 'seat-token'
  })
  const refusal = await get(h.app, `/invite/${token}`, cookies.header())
  return { ...h, token, cookies, refusal, html: await refusal.text() }
}

// ── The defect, and the way out ─────────────────────────────────────────────────────────────

test('#799: the action on the wrong-account page leads to the sign-in door, not back to the refusal', async () => {
  const { app, token, cookies, refusal, html } = await wrongAccountVisit()
  assert.equal(refusal.status, 403)

  const action = actionOf(html)
  assert.ok(action, 'the page offers an action')
  const { response, hops } = await press(app, action, cookies)

  assert.equal(response.status, 200, `pressing the action ended on ${JSON.stringify(hops)}`)
  const { document } = parseHTML(await response.text())
  assert.equal(document.querySelector('input[type="email"][name="email"]').getAttribute('value'), INVITED)
  const nexts = [...document.querySelectorAll('input[name="next"]')].map((input) =>
    input.getAttribute('value')
  )
  assert.ok(nexts.length > 0)
  for (const next of nexts) {
    const target = new URL(next, ORIGIN)
    assert.equal(target.origin, ORIGIN)
    assert.equal(target.pathname + target.search, `/invite/${token}`)
  }
})

test('the action is a native POST to /auth/signout carrying the sign-in address, and clears every cookie', async () => {
  const { app, token, cookies, html } = await wrongAccountVisit()
  const action = actionOf(html)
  assert.equal(action.kind, 'form')
  assert.equal(action.method, 'POST')
  assert.equal(action.url, '/auth/signout')
  // No `data-fetch`: `SEATS_SCRIPT` would swallow the submit and drop `next`. The server's own
  // redirect is the whole mechanism, so the button works with JavaScript off.
  assert.equal(action.form.hasAttribute('data-fetch'), false)
  assert.deepEqual(Object.keys(action.fields), ['next'])
  const next = new URL(action.fields.next, ORIGIN)
  assert.equal(next.pathname, '/login')
  assert.equal(next.searchParams.get('next'), `/invite/${token}`)
  assert.equal(next.searchParams.get('email'), INVITED)
  assert.equal(action.label, `Sign in as ${INVITED}`)

  const signedOut = await postForm(app, action.url, action.fields, cookies.header())
  assert.equal(signedOut.status, 303)
  assert.equal(signedOut.headers.get('location'), `${ORIGIN}/login${next.search}`)
  const cleared = signedOut.headers.getSetCookie()
  for (const name of ['tracy_sess', 'tracy_site', 'tracy_tok_dsh_previous']) {
    assert.ok(
      cleared.some((line) => line.startsWith(`${name}=;`) && /Max-Age=0/.test(line)),
      `${name} is deleted`
    )
  }
  cookies.apply(signedOut)
  assert.deepEqual([...cookies.jar.keys()], [])
})

test('loading the page signs nobody out: no Set-Cookie, and the session still reads back', async () => {
  const { app, token, cookies, refusal } = await wrongAccountVisit()
  assert.deepEqual(refusal.headers.getSetCookie(), [])
  // A prefetch, a reload, a crawler holding the cookie: still nothing.
  for (let i = 0; i < 3; i++) {
    const again = await get(app, `/invite/${token}`, cookies.header())
    assert.equal(again.status, 403)
    assert.deepEqual(again.headers.getSetCookie(), [])
  }
  const me = await get(app, '/auth/me', cookies.header())
  assert.equal((await me.json()).email, SIGNED_IN)
})

test('the refusal runs its rate query and nothing else — no account, no seat, no acceptance', async () => {
  const { pool, token, sent } = await wrongAccountVisit()
  assert.deepEqual(pool.forbidden, [])
  assert.equal(pool.rateQueries.length, 1)
  assert.equal(pool.rateQueries[0][0], `invite-accept:${token}`)
  assert.deepEqual(sent, [])
})

test('fixture boundary: the INVITED account goes past the refusal and reaches the account store', async () => {
  // Proves the strict pool would catch a write on the refusal path: the matching viewer's very
  // next step is `ensureAccount`, which this fixture refuses and records. Acceptance itself is
  // not verified here.
  const { app, pool } = harness()
  app.onError((_error, c) => c.text('fixture: no database', 500))
  const response = await get(app, `/invite/${await inviteToken()}`, `tracy_sess=${await sessionOf(INVITED)}`)
  assert.equal(response.status, 500)
  assert.equal(pool.forbidden.length, 1)
})

// ── What must stay refused ──────────────────────────────────────────────────────────────────

test('malformed, tampered and foreign-secret tokens stay 404 with no action and no writes', async () => {
  const good = await inviteToken()
  const [payload, signature] = good.split('.')
  // Swap the FIRST character: the last one of an unpadded base64url string carries spare bits,
  // so changing it can decode to the very same bytes — a token that is still valid.
  const swapFirst = (text) => `${text[0] === 'A' ? 'B' : 'A'}${text.slice(1)}`
  const tokens = [
    'not-a-token',
    payload,
    `${payload}.`,
    `.${signature}`,
    `${payload}.${signature}.extra`,
    `${payload}.${swapFirst(signature)}`,
    `${swapFirst(payload)}.${signature}`,
    await inviteToken('another-secret-entirely-'.repeat(2)),
    '%20',
    encodeURIComponent('"><script>alert(1)</script>')
  ]
  for (const signedInAs of [SIGNED_IN, INVITED]) {
    for (const token of tokens) {
      const { app, pool } = harness()
      const response = await get(app, `/invite/${token}`, `tracy_sess=${await sessionOf(signedInAs)}`)
      assert.equal(response.status, 404, token)
      const html = await response.text()
      assert.doesNotMatch(html, /auth\/signout/)
      assert.doesNotMatch(html, /<script>alert/)
      assert.deepEqual(response.headers.getSetCookie(), [])
      assert.deepEqual(pool.forbidden, [])
    }
  }
  // No token at all is not this door.
  const { app, pool } = harness()
  assert.equal((await get(app, '/invite/', `tracy_sess=${await sessionOf(INVITED)}`)).status, 404)
  assert.deepEqual(pool.forbidden, [])
  assert.deepEqual(pool.rateQueries, [])
})

test('no session, an expired one, a forged one and two conflicting ones are all sent to sign in — never accepted', async () => {
  const token = await inviteToken()
  const expired = await sessionOf(INVITED, Date.now() - 400 * 24 * 60 * 60 * 1000)
  const forged = await mintSession(INVITED, 'f'.repeat(32))
  const cases = {
    none: null,
    expired: `tracy_sess=${expired}`,
    forged: `tracy_sess=${forged}`,
    garbage: 'tracy_sess=v1.not.a.session',
    conflicting: `tracy_sess=${await sessionOf(INVITED)}; tracy_sess=${await sessionOf(SIGNED_IN)}`
  }
  for (const [name, cookie] of Object.entries(cases)) {
    const { app, pool } = harness()
    const response = await get(app, `/invite/${token}`, cookie)
    assert.equal(response.status, 303, name)
    assert.equal(response.headers.get('location'), `/login?next=${encodeURIComponent(`/invite/${token}`)}`)
    assert.deepEqual(pool.forbidden, [], name)
  }
})

test('rate limit: over the cap, or a rate query that fails, answers 429 before anything else', async () => {
  const outcomes = {
    over: () => WRITE_LIMIT_PER_HOUR + 1,
    rejected: () => Promise.reject(new Error('database is away'))
  }
  for (const [name, rate] of Object.entries(outcomes)) {
    for (const signedInAs of [SIGNED_IN, INVITED]) {
      const { app, pool } = harness({ rate })
      const response = await get(
        app,
        `/invite/${await inviteToken()}`,
        `tracy_sess=${await sessionOf(signedInAs)}`
      )
      assert.equal(response.status, 429, name)
      assert.doesNotMatch(await response.text(), /auth\/signout/)
      assert.deepEqual(response.headers.getSetCookie(), [])
      assert.deepEqual(pool.forbidden, [], name)
    }
  }
  // Exactly at the cap is still served.
  const { refusal } = await wrongAccountVisit({ rate: () => WRITE_LIMIT_PER_HOUR })
  assert.equal(refusal.status, 403)
})

// ── The guards around the action ────────────────────────────────────────────────────────────

test('a sign-out post from anywhere but this origin is refused and clears nothing', async () => {
  const { app, cookies, html } = await wrongAccountVisit()
  const action = actionOf(html)
  const origins = [
    { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    { origin: 'http://customer.tracy.test', 'sec-fetch-site': 'same-site' },
    { origin: ORIGIN, 'sec-fetch-site': 'cross-site' },
    { origin: 'null', 'sec-fetch-site': 'none' }
  ]
  for (const headers of origins) {
    const response = await postForm(app, action.url, action.fields, cookies.header(), headers)
    assert.equal(response.status, 403, JSON.stringify(headers))
    assert.deepEqual(await response.json(), { code: 'CSRF_ORIGIN' })
    assert.deepEqual(response.headers.getSetCookie(), [])
  }
  // No Fetch Metadata at all (an old browser): `Origin` alone decides, and a foreign one loses.
  const old = await app.fetch(
    new Request(`${ORIGIN}/auth/signout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://evil.example',
        cookie: cookies.header()
      },
      body: 'next=%2Flogin'
    })
  )
  assert.equal(old.status, 403)
  assert.deepEqual(old.headers.getSetCookie(), [])
})

test('a sign-out post with a body type the door does not read is refused and clears nothing', async () => {
  const { app, cookies } = await wrongAccountVisit()
  for (const type of ['text/plain', 'application/xml', null]) {
    const response = await app.fetch(
      new Request(`${ORIGIN}/auth/signout`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'sec-fetch-site': 'same-origin',
          cookie: cookies.header(),
          ...(type ? { 'content-type': type } : {})
        },
        body: new TextEncoder().encode('next=/login')
      })
    )
    assert.equal(response.status, 415, String(type))
    assert.deepEqual(response.headers.getSetCookie(), [])
  }
})

test('`next` on the sign-out form cannot leave this origin, whatever is posted', async () => {
  const { app, cookies } = await wrongAccountVisit()
  const offOrigin = [
    'https://evil.example/',
    '//evil.example/login',
    '/\\evil.example',
    'javascript:alert(1)',
    'http://tracy.test.evil.example/',
    './/evil.example',
    '/..//evil.example'
  ]
  for (const next of offOrigin) {
    const response = await postForm(app, '/auth/signout', { next }, cookies.header())
    assert.equal(response.status, 303, next)
    const location = response.headers.get('location')
    assert.ok(location.startsWith(`${ORIGIN}/`), `${next} → ${location}`)
    assert.equal(new URL(location).origin, ORIGIN)
  }
  // Absent → the sign-in door. Empty → this origin's root.
  const absent = await postForm(app, '/auth/signout', {}, cookies.header())
  assert.equal(absent.headers.get('location'), `${ORIGIN}/login`)
  const empty = await postForm(app, '/auth/signout', { next: '' }, cookies.header())
  assert.equal(empty.headers.get('location'), `${ORIGIN}/`)
})

test('pressing the action again, or many times at once, only deletes cookies again', async () => {
  const { app, pool, cookies, html, sent } = await wrongAccountVisit()
  const action = actionOf(html)
  const before = pool.rateQueries.length
  const burst = await Promise.all(
    Array.from({ length: 8 }, () => postForm(app, action.url, action.fields, cookies.header()))
  )
  // And once more after the jar is already empty (a second tab, a back-button resubmit).
  cookies.apply(burst[0])
  burst.push(await postForm(app, action.url, action.fields, cookies.header()))
  for (const response of burst) {
    assert.equal(response.status, 303)
    assert.ok(response.headers.getSetCookie().every((line) => /=; .*Max-Age=0/.test(line)))
  }
  assert.deepEqual(pool.forbidden, [])
  assert.equal(pool.rateQueries.length, before)
  assert.deepEqual(sent, [])
})

test('/login still sends a signed-in person on — the door this fix leaves alone', async () => {
  const { app, token, cookies } = await wrongAccountVisit()
  const response = await get(
    app,
    `/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(INVITED)}`,
    cookies.header()
  )
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), `${ORIGIN}/invite/${token}`)
  const offOrigin = await get(app, '/login?next=https://evil.example/', cookies.header())
  assert.equal(offOrigin.headers.get('location'), `${ORIGIN}/`)
})
