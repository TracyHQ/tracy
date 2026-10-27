import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'

const origin = 'http://tracy.test'
const env = {
  TRACY_ORIGIN: origin,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

for (const gate of ['on', 'off']) {
  test(`public email sign-in with legacy BETA_GATE=${gate} keeps the template without membership`, async () => {
    const sent = []
    const identity = memoryIdentityStore()
    const app = buildApp({
      config: readConfig({ ...env, BETA_GATE: gate }),
      identity,
      mail: { send: async (letter) => sent.push(letter) },
      fetchImpl: async () => {
        throw new Error('Sign-in must not call the membership service')
      },
      log: { warn() {}, error() {}, log() {} }
    })
    const next = '/new?template=ja-kinetic&platform=joomla&utm_source=joomlart&utm_medium=product-page'
    const post = (path, data) =>
      app.request(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data)
      })
    const requested = await post('/login', { email: 'guest@example.com', next })
    assert.equal(requested.status, 200)
    assert.equal(sent.length, 1)
    const code = sent[0].text.match(/\b\d{6}\b/)[0]
    const wrong = await post('/verify', { email: 'guest@example.com', code: 'invalid', next })
    assert.equal(
      wrong.headers.getSetCookie().some((c) => c.startsWith('tracy_sess=v1.')),
      false
    )
    const verified = await post('/verify', { email: 'guest@example.com', code, next })
    assert.equal(verified.status, 303)
    assert.equal(new URL(verified.headers.get('location'), origin).href, origin + next)
    const cookie = verified.headers.getSetCookie().find((c) => c.startsWith('tracy_sess=v1.'))
    assert.ok(cookie)
    const again = await app.request(`${origin}/login?next=${encodeURIComponent(next)}`, {
      headers: { cookie: cookie.split(';')[0] }
    })
    assert.equal(again.status, 302)
    assert.equal(new URL(again.headers.get('location'), origin).href, origin + next)
    await app.betaLogin.stop()
  })
}
