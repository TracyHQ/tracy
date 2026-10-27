// A widget visitor's sign-in survives a tracy-web restart (review Q4, 20/10/2026): the embedded
// widget never gets `tracy_sess` back (SameSite=Lax in a cross-site iframe), so the sign-in lived in
// the process alone. Now the visitor's own cookie finds a stored, revocable binding
// (`widget_sign_in`, `src/widget/store.js`) — and an expired, signed-out or other visitor's one does not.
//
//   node --test apps/tracy-web/test/widget-sign-in-restart.test.mjs     (needs TEST_DATABASE_URL)
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { mintSession, sessionFromCookieHeader, withSessionRevocations } from '../src/lib/session.js'
import { widgetRoutes } from '../src/widget/route.js'
import { conversationStore } from '../src/widget/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const gate = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const origin = 'https://widget-restart.example.test',
  secret = 'widget-restart-secret',
  email = 'person@example.test'

/** The sign-ins ended elsewhere (`/auth/signout`), by `jti`. */
const revoked = new Set()
const book = { isRevoked: async (jti) => revoked.has(jti), revoke: async (jti) => revoked.add(jti) }

/** One tracy-web process: its own visitor memory, the shared database. */
function process_() {
  const real = db.pool
  // The widget's switch is on; everything else is the real database.
  const pool = {
    query: (sql, args) => (sql.includes('ui_setting') ? { rows: [{ on: true }] } : real.query(sql, args)),
    connect: () => real.connect()
  }
  const widget = widgetRoutes({
    pool,
    contextStore: conversationStore(pool, secret),
    config: { origin, sessionSecret: secret },
    request: async (path, init = {}) => {
      if (path === '/login') return Response.json({ ok: true })
      if (path === '/verify')
        return Response.json(
          { ok: true },
          { headers: { 'set-cookie': `tracy_sess=${await mintSession(email, secret)}; Path=/; HttpOnly` } }
        )
      const signed = await sessionFromCookieHeader(new Headers(init.headers).get('cookie'), secret)
      return signed ? Response.json({ ok: true }) : Response.json({ code: 'NOT_SIGNED_IN' }, { status: 401 })
    }
  })
  const app = new Hono()
  app.route('/widget', widget)
  const send = (path, { cookie = '', data } = {}) =>
    withSessionRevocations(book, () =>
      app.request(origin + '/widget' + path, {
        headers: { cookie, ...(data ? { origin, 'content-type': 'application/json' } : {}) },
        ...(data ? { method: 'POST', body: JSON.stringify(data) } : {})
      })
    )
  const signedIn = async (cookie) => (await (await send('/api/auth/status', { cookie })).json()).signedIn
  return { send, signedIn }
}

/** A visitor signs in with a code in one process; answers its widget cookie (the only cookie it keeps). */
async function signIn(p) {
  const visible = await p.send('/api/visible', { data: {} })
  const cookie = visible.headers.get('set-cookie').split(';')[0]
  assert.equal((await p.send('/api/auth/email', { cookie, data: { email } })).status, 200)
  assert.equal((await p.send('/api/auth/verify', { cookie, data: { code: '123456' } })).status, 200)
  assert.equal(await p.signedIn(cookie), true, 'not signed in after the code')
  return cookie
}

beforeEach(async () => {
  revoked.clear()
  if (process.env.TEST_DATABASE_URL) await db.pool.query('insert into account(email) values ($1)', [email])
})

test('signed in, then a restart: the same visitor is still signed in', gate, async () => {
  const cookie = await signIn(process_())
  assert.equal(await process_().signedIn(cookie), true, 'the restart signed the visitor out')
  // Nothing a browser could replay is stored: no token, no email in clear.
  const stored = JSON.stringify((await db.pool.query('select * from widget_sign_in')).rows)
  assert.doesNotMatch(stored, /v1\.|person@example/)
})

test('another visitor cookie, or none, restores nothing', gate, async () => {
  await signIn(process_())
  const later = process_()
  const other = (await later.send('/api/visible', { data: {} })).headers.get('set-cookie').split(';')[0]
  assert.equal(await later.signedIn(other), false)
  assert.equal(await later.signedIn(''), false)
})

test('an expired binding is not restored', gate, async () => {
  const cookie = await signIn(process_())
  await db.pool.query(`update widget_sign_in set expires_at = now() - interval '1 second'`)
  assert.equal(await process_().signedIn(cookie), false)
})

test('a visitor whose conversation expired is a new visitor, signed out', gate, async () => {
  const cookie = await signIn(process_())
  const store = conversationStore(db.pool, secret)
  const visitorId = cookie.split('=')[1]
  const hour = 60 * 60 * 1000
  assert.match((await store.readSignIn(visitorId)) ?? '', /^tracy_sess=v1\./)
  // The conversation lives a day, the sign-in three: past the day, the visitor's row is gone first.
  assert.equal(await store.readSignIn(visitorId, Date.now() + 25 * hour), null)
  // And the cron's sweep takes the row and its binding with it (cascade).
  await store.cleanup(Date.now() + 25 * hour)
  assert.equal((await db.pool.query('select 1 from widget_sign_in')).rowCount, 0)
})

test('signed out elsewhere: not restored, and the binding is forgotten', gate, async () => {
  const cookie = await signIn(process_())
  const { rows } = await db.pool.query('select session_jti from widget_sign_in')
  revoked.add(rows[0].session_jti)
  assert.equal(await process_().signedIn(cookie), false)
  assert.equal((await db.pool.query('select 1 from widget_sign_in')).rowCount, 0)
})

test('signed out in the widget (the binding cleared): not restored', gate, async () => {
  const cookie = await signIn(process_())
  // What `POST /widget/api/native/logout` does to the binding, beside ending the sign-in.
  await conversationStore(db.pool, secret).unbindSignIn(cookie.split('=')[1])
  assert.equal(await process_().signedIn(cookie), false)
})
