// A sign-in code asked through the widget (`src/widget/route.js`): the caller's address is carried to
// `/login`, so codes are counted per caller, not in one `unknown` bucket for every widget visitor.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { clientIp } from '../src/lib/login-mail-rate.js'
import { sessionFromCookieHeader } from '../src/lib/session.js'
import { widgetRoutes } from '../src/widget/route.js'

const origin = 'https://widget-guest.example.test',
  secret = 'widget-guest-secret'

/** The app behind the widget, as far as these doors go: each answers only to a session valid NOW. */
function stand() {
  const calls = [],
    inserts = []
  const pool = {
    async query(sql, args) {
      if (sql.includes('ui_setting')) return { rows: [{ on: true }] }
      if (sql.startsWith('insert into account')) inserts.push(args[0])
      return { rows: [{ count: 1 }] }
    }
  }
  const widget = widgetRoutes({
    contextStore: null,
    config: { origin, sessionSecret: secret },
    pool,
    request: async (path, init = {}) => {
      const headers = new Headers(init.headers)
      const email = await sessionFromCookieHeader(headers.get('cookie'), secret)
      calls.push({ path, email, headers })
      if (path === '/login') return Response.json({ ok: true })
      if (!email) return Response.json({ code: 'NOT_SIGNED_IN' }, { status: 401 })
      if (path === '/api/speech') return Response.json({ available: true })
      if (path === '/api/speech/say') return new Response(new Uint8Array(4), { status: 200 })
      if (path === '/api/templates') return Response.json({ templates: [] })
      if (path === '/api/design-system/library') return Response.json({ systems: [] })
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
    }
  })
  const app = new Hono()
  app.route('/widget', widget)
  const send = (path, { cookie = '', data, headers = {} } = {}) =>
    app.request(origin + '/widget' + path, {
      headers: {
        cookie,
        ...(data ? { origin, 'content-type': 'application/json' } : {}),
        ...headers
      },
      ...(data ? { method: 'POST', body: JSON.stringify(data) } : {})
    })
  // A visitor is made on its first write (#1478): what is visible is the cheapest one.
  const visit = async () => (await send('/api/visible', { data: {} })).headers.get('set-cookie').split(';')[0]
  return { send, visit, calls, inserts, widget }
}

test('a sign-in code asked through the widget is counted against the caller’s own address', async () => {
  const s = stand()
  const cookie = await s.visit()
  const ask = (headers) =>
    s.send('/api/auth/email', { cookie, data: { email: 'person@example.test' }, headers })
  assert.equal((await ask({ 'cf-connecting-ip': '203.0.113.7' })).status, 200)
  const login = (n) => s.calls.filter((c) => c.path === '/login')[n]
  // The address `/login` buckets by is the caller's, read exactly as a direct `/login` reads it.
  assert.equal(clientIp({ req: { header: (name) => login(0).headers.get(name) } }), '203.0.113.7')
  assert.equal((await ask({})).status, 200)
  assert.equal(login(1).headers.has('cf-connecting-ip'), false)
  assert.equal(clientIp({ req: { header: (name) => login(1).headers.get(name) } }), 'unknown')
})
