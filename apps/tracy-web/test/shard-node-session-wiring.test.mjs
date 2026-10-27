// apps/tracy-web/test/shard-node-session-wiring.test.mjs
import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { mintSession, withSessionCookieName } from '../src/lib/session.js'
import { forwardHttp } from '../src/workspace/proxy.js'

const at = 1_760_000_000_000
const env = {
  TRACY_ORIGIN: 'https://s2.tracy.ai',
  SITE_DOMAIN: 'tracy.ai',
  SESSION_DOMAIN: 'tracy.ai',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 's2',
  HOST_NAME: 's2',
  HOST_s2_ORIGIN: 'http://host',
  HOST_s2_DSH_ORIGIN: 'http://dsh',
  HOST_s2_SECRET: 'h',
  SEAT_s2_SECRET: 'k',
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: 'https://cowork.tracy.ai',
  SHARD_SECRET: 'ab'.repeat(32),
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}
const shardApp = () =>
  buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    now: () => at
  })

test('/auth/me on a shard reads the shard cookie beside the master’s', async () => {
  const own = await mintSession('a@b.c', 's'.repeat(32), at)
  const masters = await mintSession('a@b.c', 'm'.repeat(32), at)
  const res = await shardApp().fetch(
    new Request('https://s2.tracy.ai/auth/me', {
      headers: { cookie: `tracy_sess=${masters}; tracy_sess_s2=${own}` }
    })
  )
  assert.equal((await res.json()).email, 'a@b.c')
})

test('sign-out on a shard (W1’s signOutCookies) clears its own cookie, the master’s and the nonce, and keeps __Host-tracy_shard', async () => {
  const own = await mintSession('a@b.c', 's'.repeat(32), at)
  const res = await shardApp().fetch(
    new Request('https://s2.tracy.ai/auth/signout', {
      method: 'POST',
      headers: { cookie: `tracy_sess_s2=${own}; tracy_handoff=${'a'.repeat(32)}; __Host-tracy_shard=s2` }
    })
  )
  assert.equal(res.status, 200)
  const cleared = res.headers.getSetCookie()
  for (const name of ['tracy_sess_s2', 'tracy_sess', 'tracy_handoff'])
    assert.equal(
      cleared.filter((v) => v.startsWith(`${name}=;`) && v.endsWith('Max-Age=0')).length,
      1,
      `${name}: ${cleared.join(' | ')}`
    )
  assert.ok(
    !cleared.some((v) => v.includes('tracy_shard=')),
    '__Host-tracy_shard outlives sign-out (contract §3)'
  )
})

test('a same-site POST carrying only tracy_sess_<name> is 403 CSRF_ORIGIN: the guard reads the shard cookie too (contract §3)', async () => {
  const own = await mintSession('a@b.c', 's'.repeat(32), at)
  const post = (headers) =>
    shardApp().fetch(
      new Request('https://s2.tracy.ai/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: '{}'
      })
    )
  const res = await post({ cookie: `tracy_sess_s2=${own}`, 'sec-fetch-site': 'same-site' })
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'CSRF_ORIGIN' })
  const foreign = await post({ cookie: `tracy_sess_s2=${own}`, origin: 'https://shop.tracy.ai' })
  assert.equal(foreign.status, 403, 'a sibling site’s Origin is refused the same way')
})

test('forwardHttp on a shard hands dsh the shard’s own session, not the master’s cookie beside it', async (t) => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push(req.headers['x-tracy-session'])
    res.writeHead(200)
    res.end()
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => upstream.close())
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/api/tracy-add-site/start`)
  await withSessionCookieName('tracy_sess_s2', () =>
    forwardHttp(
      new Request('https://s2.tracy.ai/shop.tracy.ai/api/tracy-add-site/start', {
        headers: { cookie: 'tracy_sess=MASTER; tracy_sess_s2=SHARD; k=v' }
      }),
      target,
      { mount: '/shop.tracy.ai', seatToken: 'T', seatCookieName: 'x', viewerHost: 's2.tracy.ai' }
    )
  )
  assert.equal(seen[0], 'SHARD')
})
