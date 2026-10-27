import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { Hono } from 'hono'
import { signOutCookies } from '../src/lib/cookies.js'
import { SESSION_TTL_S } from '../src/lib/policy.js'
import { mintSession, sessionFromCookieHeader } from '../src/lib/session.js'
import { widgetRoutes } from '../src/widget/route.js'

const origin = 'https://widget.example.test',
  secret = 'widget-test-secret'
/**
 * A widget on a stand-in database. `rate`: `rate_bucket` counts kept per bucket and window (else every
 * count is 1, never over). `contextStore`: none by default (memory only).
 */
function stand({ enabled = true, rate = false, contextStore = null, onDiagnostic } = {}) {
  const calls = [],
    counts = new Map(),
    accounts = []
  const pool = {
    async query(sql, params) {
      if (sql.includes('ui_setting')) return { rows: [{ on: enabled }] }
      if (sql.startsWith('insert into account')) accounts.push(params[0])
      if (rate && sql.includes('rate_bucket')) {
        const key = `${params[0]}|${params[1].toISOString()}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
        return { rows: [{ count: counts.get(key) }] }
      }
      return { rows: [{ count: 1 }] }
    }
  }
  const widget = widgetRoutes({
    contextStore,
    config: { origin, sessionSecret: secret, oauth: { google: { id: 'test', secret: 'test' } } },
    pool,
    ...(onDiagnostic ? { onDiagnostic } : {}),
    request: async (path, init = {}) => {
      calls.push({ path, body: init.body, cookie: init.headers?.cookie })
      if (path === '/api/speech/say') return new Response(new Uint8Array(4), { status: 200 })
      if (path === '/api/speech')
        return Response.json(
          { available: false },
          { headers: { 'set-cookie': 'tracy_sess=internal-renewal; Path=/; HttpOnly' } }
        )
      if (path === '/api/templates')
        return Response.json({
          templates: [{ id: 'template-a', platforms: [{ platform: 'wordpress', tag: 'base' }] }]
        })
      if (path === '/api/design-system/library') return Response.json({ systems: [] })
      if (path === '/login') return Response.json({ ok: true })
      if (path === '/verify') {
        if (JSON.parse(init.body).code !== '012345')
          return Response.json({ code: 'CODE_INVALID' }, { status: 400 })
        return Response.json(
          { ok: true },
          {
            headers: {
              'set-cookie': `tracy_sess=${await mintSession('person@example.test', secret)}; Path=/; HttpOnly; Secure`
            }
          }
        )
      }
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
    }
  })
  const app = new Hono()
  app.route('/widget', widget)
  const send = (path, { cookie = '', data, foreign = false, address } = {}) =>
    app.request(origin + '/widget' + path, {
      headers: {
        cookie,
        ...(address ? { 'cf-connecting-ip': address } : {}),
        ...(data
          ? { origin: foreign ? 'https://foreign.example.test' : origin, 'content-type': 'application/json' }
          : {})
      },
      ...(data ? { method: 'POST', body: JSON.stringify(data) } : {})
    })
  return { send, calls, counts, accounts, widget }
}
/** A visitor is made by its first write (council 19/10/2026): here, the catalogue choices on screen. */
async function visitor(s, { address } = {}) {
  const r = await s.send('/api/visible', { data: { templates: [], systems: [] }, address })
  assert.equal(r.status, 200)
  return r.headers.get('set-cookie').split(';')[0]
}
/** The email of the internal session the widget sent with its last backend call to `path`. */
const sentAs = async (s, path) =>
  sessionFromCookieHeader(s.calls.filter((call) => call.path === path).at(-1)?.cookie ?? '', secret)
test('widget is disabled by the operator switch and foreign writes are refused', async () => {
  assert.equal((await stand({ enabled: false }).send('/api/state')).status, 404)
  const s = stand()
  const cookie = await visitor(s)
  assert.equal(
    (await s.send('/api/auth/email', { cookie, data: { email: 'person@example.test' }, foreign: true }))
      .status,
    403
  )
  assert.equal(s.calls.filter((c) => c.path === '/login').length, 0)
  assert.equal((await s.send('/api/speech/stream', { cookie })).status, 426)
})
test('OTP is bound to the submitted email, never reaches conversation, and keeps selections', async () => {
  const s = stand(),
    cookie = await visitor(s)
  await s.send('/api/select', { cookie, data: { kind: 'template', id: 'template-a' } })
  await s.send('/api/auth/email', { cookie, data: { email: 'person@example.test' } })
  assert.equal((await s.send('/api/turn', { cookie, data: { message: '012345' } })).status, 409)
  assert.equal(
    (await s.send('/api/auth/verify', { cookie, data: { code: '999999', email: 'attacker@example.test' } }))
      .status,
    400
  )
  assert.equal(
    (await s.send('/api/auth/verify', { cookie, data: { code: '012345', email: 'attacker@example.test' } }))
      .status,
    200
  )
  const state = await (await s.send('/api/state', { cookie })).json()
  assert.equal(state.signedIn, true)
  assert.equal(state.selectedTemplate, 'template-a')
  assert.deepEqual(state.history, [])
  assert.ok(
    s.calls
      .filter((c) => c.path === '/verify')
      .every((c) => JSON.parse(c.body).email === 'person@example.test')
  )
  assert.equal(JSON.stringify(state).includes('012345'), false)
  assert.equal((await s.send('/backend/api/team', { cookie })).status, 404)
})
test('Google completion authenticates the original embedded visitor and cannot be replayed', async () => {
  const s = stand(),
    cookie = await visitor(s)
  const flow = await (await s.send('/api/auth/google', { cookie, data: {} })).json()
  assert.equal((await s.send('/oauth/complete?flow=' + flow.flow)).status, 403)
  const signed = `tracy_sess=${await mintSession('google@example.test', secret)}`
  assert.equal((await s.send('/oauth/complete?flow=' + flow.flow, { cookie: signed })).status, 403)
  s.widget.oauthSession({
    next: '/widget/oauth/complete?flow=' + flow.flow,
    token: signed.slice('tracy_sess='.length)
  })
  const done = await s.send('/oauth/complete?flow=' + flow.flow, { cookie: signed })
  assert.equal(done.status, 200)
  assert.equal((await done.text()).includes(signed), false)
  assert.equal((await s.send('/api/auth/status', { cookie })).status, 200)
  assert.equal((await (await s.send('/api/auth/status', { cookie })).json()).signedIn, true)
  assert.equal((await s.send('/oauth/complete?flow=' + flow.flow, { cookie: signed })).status, 403)
  assert.equal(
    await s.widget.speechCookie({ headers: { origin: 'https://foreign.example.test', cookie } }),
    null
  )
})

test('switching from Google to email finishes sign-in without leaving the conversation blocked', async () => {
  const s = stand(),
    cookie = await visitor(s)
  const flow = await (await s.send('/api/auth/google', { cookie, data: {} })).json()
  await s.send('/api/auth/email', { cookie, data: { email: 'person@example.test' } })
  await s.send('/api/auth/verify', { cookie, data: { code: '012345' } })
  assert.equal((await s.send('/api/turn', { cookie, data: { message: 'open login' } })).status, 200)
  const signed = `tracy_sess=${await mintSession('person@example.test', secret)}`
  assert.equal((await s.send('/oauth/complete?flow=' + flow.flow, { cookie: signed })).status, 403)
})

test('widget visitor uses a host-only partitioned cookie and sign-out clears the matching scope', async () => {
  const response = await stand().send('/api/visible', { data: {} })
  const cookie = response.headers.get('set-cookie')
  assert.match(
    cookie,
    /^tracy_widget=[a-f0-9-]{36}; Path=\/widget; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=86400$/
  )
  assert.equal(cookie.includes('Domain='), false)
  const cleared = signOutCookies('', { secure: true }, 'widget.example.test').find((row) =>
    row.startsWith('tracy_widget=')
  )
  assert.equal(
    cleared,
    'tracy_widget=; Path=/widget; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0'
  )
})

test('the shared guest session is minted again before it expires: a process up for days still serves anonymous visitors', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T00:00:00Z') })
  try {
    const s = stand()
    const guestCookie = () => s.calls.filter((call) => call.path === '/api/speech').at(-1)?.cookie ?? ''
    await s.send('/backend/api/speech', { cookie: await visitor(s) })
    const first = guestCookie()
    assert.equal(await sessionFromCookieHeader(first, secret), 'widget-guest@widget.invalid')
    // An hour past its lifetime (SESSION_TTL_S): it was cached once and every call failed.
    mock.timers.tick((SESSION_TTL_S + 60 * 60) * 1000)
    await s.send('/backend/api/speech', { cookie: await visitor(s) })
    const later = guestCookie()
    assert.notEqual(later, first)
    assert.equal(await sessionFromCookieHeader(later, secret), 'widget-guest@widget.invalid')
    assert.equal(await sessionFromCookieHeader(first, secret), null, 'the first one has expired')
  } finally {
    mock.timers.reset()
  }
})

test('guest backend relays never set the internal session cookie in the browser', async () => {
  const s = stand(),
    cookie = await visitor(s)
  const response = await s.send('/backend/api/speech', { cookie })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { available: false })
  assert.equal(response.headers.get('set-cookie'), null)
})

test('a page load makes no visitor: six hundred cookie-less reads keep nothing, write no row and set no cookie', async () => {
  let writes = 0
  const contextStore = {
    async read() {
      return null
    },
    async write() {
      writes++
      return { revision: writes, expires: Date.now() + 86_400_000 }
    }
  }
  const s = stand({ contextStore })
  for (let i = 0; i < 300; i++)
    for (const path of ['/api/state', '/api/catalogue']) {
      const response = await s.send(path)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('set-cookie'), null)
    }
  const state = await (await s.send('/api/state')).json()
  assert.deepEqual([state.history, state.selectedTemplate, state.signedIn], [[], null, false])
  assert.equal(writes, 0, 'no row for a read')
  // Nothing was kept either: every one of the 512 places still takes a visitor, even a busy one.
  for (let i = 0; i < 512; i++)
    assert.equal((await s.send('/api/auth/google', { data: {} })).status, 200, `visitor ${i + 1}`)
})

test('cookie-less reads, a first write, a reload: the visitor is made by the write and kept; a lost cookie starts afresh', async () => {
  const s = stand()
  assert.equal((await s.send('/api/state')).headers.get('set-cookie'), null)
  assert.equal((await s.send('/api/catalogue')).status, 200)
  // No visitor, so no voice socket yet: the page makes one with a write first (`live.js` startVoice).
  assert.equal(await s.widget.speechCookie({ headers: { origin, cookie: '' } }), null)
  const first = await s.send('/api/select', { data: { kind: 'template', id: 'template-a' } })
  assert.equal(first.status, 200)
  const cookie = first.headers.get('set-cookie').split(';')[0]
  assert.match(await s.widget.speechCookie({ headers: { origin, cookie } }), /^tracy_sess=/)
  const reload = await s.send('/api/state', { cookie })
  assert.equal(reload.headers.get('set-cookie'), null)
  assert.equal((await reload.json()).selectedTemplate, 'template-a')
  // The cookie blocked or deleted mid-flow: a read is fresh again, a write is a new visitor, and the
  // first one is untouched.
  assert.equal((await (await s.send('/api/state')).json()).selectedTemplate, null)
  const again = await s.send('/api/select', { data: { kind: 'platform', id: 'joomla' } })
  assert.notEqual(again.headers.get('set-cookie').split(';')[0], cookie)
  assert.equal((await (await s.send('/api/state', { cookie })).json()).selectedTemplate, 'template-a')
})

test('Google sign-in started without a visitor makes one, and completing it attaches what the guest chose', async () => {
  const s = stand()
  const started = await s.send('/api/auth/google', { data: {} })
  const cookie = started.headers.get('set-cookie').split(';')[0]
  const flow = await started.json()
  await s.send('/api/select', { cookie, data: { kind: 'template', id: 'template-a' } })
  const signed = `tracy_sess=${await mintSession('google@example.test', secret)}`
  s.widget.oauthSession({
    next: '/widget/oauth/complete?flow=' + flow.flow,
    token: signed.slice('tracy_sess='.length)
  })
  assert.equal((await s.send('/oauth/complete?flow=' + flow.flow, { cookie: signed })).status, 200)
  const state = await (await s.send('/api/state', { cookie })).json()
  assert.equal(state.signedIn, true)
  assert.equal(state.selectedTemplate, 'template-a')
})

test('the 513th new visitor gets in by letting go of the least recently used idle one', async () => {
  const s = stand()
  const a = (await s.send('/api/select', { data: { kind: 'template', id: 'template-a' } })).headers
    .get('set-cookie')
    .split(';')[0]
  const b = (await s.send('/api/select', { data: { kind: 'template', id: 'template-a' } })).headers
    .get('set-cookie')
    .split(';')[0]
  for (let i = 0; i < 510; i++) await visitor(s)
  // A is used again, so B is now the oldest.
  assert.equal((await (await s.send('/api/state', { cookie: a })).json()).selectedTemplate, 'template-a')
  const late = await s.send('/api/visible', { data: {} })
  assert.equal(late.status, 200)
  assert.match(late.headers.get('set-cookie'), /^tracy_widget=/)
  assert.equal((await (await s.send('/api/state', { cookie: b })).json()).selectedTemplate, null, 'B let go')
  assert.equal((await (await s.send('/api/state', { cookie: a })).json()).selectedTemplate, 'template-a')
})

test('with every place busy a new visitor is refused 503 with Retry-After, never 500, and reads still answer', async () => {
  const events = []
  const s = stand({ onDiagnostic: (entry) => events.push(entry) })
  // Each one waits on its Google popup: none may be let go.
  for (let i = 0; i < 512; i++) assert.equal((await s.send('/api/auth/google', { data: {} })).status, 200)
  const refused = await s.send('/api/visible', { data: {} })
  assert.equal(refused.status, 503)
  assert.equal(refused.headers.get('retry-after'), '30')
  assert.equal(refused.headers.get('set-cookie'), null)
  assert.deepEqual(await refused.json(), { code: 'WIDGET_AT_CAPACITY', retryable: true })
  assert.equal((await s.send('/api/state')).status, 200)
  assert.deepEqual(events, [], 'not reported as an unexpected failure')
})

test('one address makes five visitors a minute and twenty an hour (429), and another address is not held back', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T00:00:00Z') })
  try {
    const s = stand({ rate: true })
    const make = (address) => s.send('/api/visible', { data: {}, address })
    for (let i = 0; i < 5; i++) assert.equal((await make('203.0.113.7')).status, 200)
    const refused = await make('203.0.113.7')
    assert.equal(refused.status, 429)
    assert.equal(refused.headers.get('set-cookie'), null)
    assert.deepEqual(await refused.json(), { code: 'WIDGET_VISITOR_LIMIT' })
    assert.equal((await make('198.51.100.4')).status, 200, 'another address')
    // A visitor the address already has is not a new one.
    const cookie = await visitor(s, { address: '192.0.2.1' })
    for (let i = 0; i < 8; i++)
      assert.equal((await s.send('/api/visible', { cookie, data: {}, address: '192.0.2.1' })).status, 200)
    // The hour counts every attempt: 6, then 5 a minute, and the twenty-first is refused.
    for (const allowed of [5, 5, 4]) {
      mock.timers.tick(60_000)
      for (let i = 0; i < allowed; i++) assert.equal((await make('203.0.113.7')).status, 200)
      if (allowed === 4) assert.equal((await make('203.0.113.7')).status, 429)
    }
    mock.timers.tick(60_000)
    assert.equal((await make('203.0.113.7')).status, 429, 'a new minute, the same hour')
  } finally {
    mock.timers.reset()
  }
})

test('two anonymous visitors speak as two identities the host derives, and a renewal keeps each one', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T00:00:00Z') })
  try {
    const s = stand()
    const a = await visitor(s),
      b = await visitor(s)
    const say = (cookie) => s.send('/backend/api/speech/say', { cookie, data: { text: 'Hello.' } })
    assert.equal((await say(a)).status, 200)
    const first = s.calls.at(-1).cookie
    const mine = await sentAs(s, '/api/speech/say')
    assert.match(mine, /^widget-guest\+[a-f0-9]{16}@widget\.invalid$/)
    await say(b)
    const theirs = await sentAs(s, '/api/speech/say')
    assert.match(theirs, /^widget-guest\+[a-f0-9]{16}@widget\.invalid$/)
    assert.notEqual(theirs, mine)
    // The voice socket of the same visitor is the same identity, whatever the browser sends.
    const socket = await s.widget.speechCookie({ headers: { origin, cookie: `${a}; tracy_sess=forged` } })
    assert.equal(await sessionFromCookieHeader(socket, secret), mine)
    // Reading public doors stays the shared guest's.
    await s.send('/backend/api/speech', { cookie: a })
    assert.equal(await sentAs(s, '/api/speech'), 'widget-guest@widget.invalid')
    // Two hours on the token is new, the identity (and so its day) the same.
    mock.timers.tick(2 * 60 * 60 * 1000)
    await say(a)
    assert.notEqual(s.calls.at(-1).cookie, first)
    assert.equal(await sentAs(s, '/api/speech/say'), mine)
  } finally {
    mock.timers.reset()
  }
})

test('internal sessions are minted once for concurrent calls: one token, one guest account row', async () => {
  const s = stand()
  const cookie = await visitor(s)
  const sockets = await Promise.all(
    Array.from({ length: 5 }, () => s.widget.speechCookie({ headers: { origin, cookie } }))
  )
  assert.equal(new Set(sockets).size, 1)
  await Promise.all(Array.from({ length: 5 }, () => s.send('/backend/api/speech', { cookie })))
  const guests = s.calls.filter((call) => call.path === '/api/speech').map((call) => call.cookie)
  assert.equal(new Set(guests).size, 1)
  assert.deepEqual(s.accounts, ['widget-guest@widget.invalid'])
})
