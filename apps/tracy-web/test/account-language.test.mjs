// `account.language` (ADR 0026 §5, plan T7 Q9): the language mail somebody else triggers reaches a
// person in. Written on every sign-in from the language the request states, and from the
// Settings › Language pick (`tracy_lang`) when a page asks `/auth/me`; never overwritten with the
// English a request only falls back to.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

function world() {
  const { pool } = db
  const sent = []
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    identity: pgIdentityStore(pool),
    mail: { send: async (m) => void sent.push(m) }
  })
  const post = (path, body, headers = {}) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })
    )
  /** Sign in with a code, the request carrying `headers` on both steps. */
  const signIn = async (email, headers = {}) => {
    await post('/login', { email }, headers)
    const code = sent.at(-1).text.match(/\b\d{6}\b/)[0]
    const res = await post('/verify', { email, code }, headers)
    assert.equal(res.status, 200)
  }
  const language = async (email) =>
    (await pool.query('select language from account where email = $1', [email])).rows[0]?.language ?? null
  const me = async (email, cookie = '') =>
    app.fetch(
      new Request('http://tracy.test/auth/me', {
        headers: { cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}${cookie}` }
      })
    )
  return { pool, signIn, language, me }
}

test('a sign-in remembers the language the browser states', opts, async () => {
  const w = world()
  await w.signIn('lee@lab3.example', { 'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8' })
  assert.equal(await w.language('lee@lab3.example'), 'vi')
})

test('a sign-in with the Settings pick in its cookie remembers the pick', opts, async () => {
  const w = world()
  await w.signIn('lee@lab3.example', { 'accept-language': 'vi', cookie: 'tracy_lang=de' })
  assert.equal(await w.language('lee@lab3.example'), 'de')
})

test('a sign-in that states no language Tracy speaks keeps the stored one', opts, async () => {
  const w = world()
  await w.pool.query("insert into account (email, language) values ('lee@lab3.example', 'fr')")
  await w.signIn('lee@lab3.example', { 'accept-language': 'ja-JP,ja;q=0.9' })
  assert.equal(await w.language('lee@lab3.example'), 'fr', 'the English fallback is not a preference')
  await w.signIn('lee@lab3.example', {})
  assert.equal(await w.language('lee@lab3.example'), 'fr', 'no header at all states nothing')
  await w.signIn('lee@lab3.example', { 'accept-language': 'ja, en;q=0.5' })
  assert.equal(await w.language('lee@lab3.example'), 'en', 'a browser that asks for English states English')
})

test('a language picked in Settings reaches the account on the next page load', opts, async () => {
  const w = world()
  await w.pool.query("insert into account (email, language) values ('lee@lab3.example', 'vi')")
  assert.equal((await w.me('lee@lab3.example', '; tracy_lang=nl')).status, 200)
  assert.equal(await w.language('lee@lab3.example'), 'nl')
  // No pick ("Follow device" clears the cookie): the page load changes nothing stored.
  await w.me('lee@lab3.example')
  assert.equal(await w.language('lee@lab3.example'), 'nl')
  // A cookie that names no language of Tracy's changes nothing either.
  await w.me('lee@lab3.example', '; tracy_lang=ja')
  assert.equal(await w.language('lee@lab3.example'), 'nl')
})
