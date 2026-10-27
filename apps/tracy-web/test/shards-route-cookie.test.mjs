/** The routing cookie (spec §1, §2.2; review amendment 1): which master pages send a person on. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { isUserPage, routeCookie } from '../src/shards/route-cookie.js'
import { MASTER_ENV } from './_shards.mjs'

const config = readConfig(MASTER_ENV)
const book = { get: async (name) => (name === 's1' ? { name: 's1', origin: 'https://s1.tracy.test' } : null) }

function harness({ tracyHost = true } = {}) {
  const app = new Hono()
  app.use('*', routeCookie({ config, book, isTracyHost: () => tracyHost }))
  app.all('*', (c) => c.text('master'))
  return (path, { headers = {}, method = 'GET' } = {}) =>
    app.request(`https://cowork.tracy.test${path}`, { method, headers: { accept: 'text/html', ...headers } })
}

test('only the pages a person works on move: home, new, sites, account and a site key', () => {
  for (const path of [
    '/',
    '/new',
    '/new/s/abc',
    '/sites',
    '/sites/x',
    '/account',
    '/account/keys',
    '/shop.tracy.test',
    '/shop.tracy.test/s/1'
  ])
    assert.equal(isUserPage(path), true, path)
  for (const path of [
    '/login',
    '/verify',
    '/auth/me',
    '/signin',
    '/signin/google',
    '/signin/google/callback',
    '/handoff',
    '/invite/abc',
    '/ops',
    '/ops/shards',
    '/api/sites',
    '/github/push',
    '/badge.js',
    '/tracy-badge.js',
    '/favicon.ico',
    '/design-inspiration',
    '/v1/sites',
    '/_host/x',
    '/_shard/adopt',
    '/docs/api',
    '/health',
    '/robots.txt',
    '/new-thing'
  ])
    assert.equal(isUserPage(path), false, path)
})

test('signed out, a page view with a pointer goes to the same address on the shard', async () => {
  const res = await harness()('/sites?tab=all', { headers: { cookie: '__Host-tracy_shard=s1' } })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://s1.tracy.test/sites?tab=all')
})

test('signed in on the master, the page view goes through /login?next= where the ticket is issued', async () => {
  const session = await mintSession('mai@tracy.test', config.sessionSecret)
  const res = await harness()('/new/', {
    headers: { cookie: `__Host-tracy_shard=s1; tracy_sess=${session}` }
  })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent('https://s1.tracy.test/new/')}`)
})

test('the master answers: no pointer, an unknown pointer, a fetch, a POST, a sign-in door, another host', async () => {
  const get = harness()
  const answers = [
    await get('/sites'),
    await get('/sites', { headers: { cookie: '__Host-tracy_shard=s9' } }),
    await get('/sites', { headers: { cookie: '__Host-tracy_shard=s1', accept: 'application/json' } }),
    await get('/sites', { headers: { cookie: '__Host-tracy_shard=s1' }, method: 'POST' }),
    await get('/login?next=%2F', { headers: { cookie: '__Host-tracy_shard=s1' } }),
    await harness({ tracyHost: false })('/sites', { headers: { cookie: '__Host-tracy_shard=s1' } })
  ]
  for (const res of answers) assert.equal(await res.text(), 'master')
})

test('?stay=1 drops the pointer under the session domain and comes back to the same address without it', async () => {
  const res = await harness()('/sites?stay=1&tab=all', { headers: { cookie: '__Host-tracy_shard=s1' } })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://cowork.tracy.test/sites?tab=all')
  assert.deepEqual(res.headers.getSetCookie(), [
    '__Host-tracy_shard=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'
  ])
})

test('/new/?fresh=1 is never sent back to the pointer: signed in it goes to the fresh hook, signed out to sign in first', async () => {
  const seen = []
  const app = new Hono()
  app.use(
    '*',
    routeCookie({
      config,
      book,
      isTracyHost: () => true,
      fresh: async (c, email) => {
        seen.push(email)
        return email === 'full@tracy.test' ? c.redirect('https://s2.tracy.test/handoff?t=T', 302) : null
      }
    })
  )
  app.all('*', (c) => c.text('master'))
  const get = (path, cookie) =>
    app.request(`https://cowork.tracy.test${path}`, { headers: { accept: 'text/html', cookie } })
  const full = await mintSession('full@tracy.test', config.sessionSecret)
  const handed = await get('/new/?fresh=1', `__Host-tracy_shard=s1; tracy_sess=${full}`)
  assert.equal(handed.headers.get('location'), 'https://s2.tracy.test/handoff?t=T')
  const stay = await mintSession('stay@tracy.test', config.sessionSecret)
  assert.equal(
    await (await get('/new?fresh=1', `__Host-tracy_shard=s1; tracy_sess=${stay}`)).text(),
    'master'
  )
  assert.deepEqual(seen, ['full@tracy.test', 'stay@tracy.test'])
  const out = await get('/new/?fresh=1', '__Host-tracy_shard=s1')
  assert.equal(out.status, 302)
  assert.equal(
    out.headers.get('location'),
    `/login?next=${encodeURIComponent('https://cowork.tracy.test/new/?fresh=1')}`
  )
  const plain = await get('/new/', `__Host-tracy_shard=s1; tracy_sess=${full}`)
  assert.equal(
    plain.headers.get('location'),
    `/login?next=${encodeURIComponent('https://s1.tracy.test/new/')}`,
    'without fresh=1 the pointer still leads'
  )
})
