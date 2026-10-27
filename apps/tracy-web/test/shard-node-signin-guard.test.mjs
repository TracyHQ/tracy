// apps/tracy-web/test/shard-node-signin-guard.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { mintSession } from '../src/lib/session.js'

const shardEnv = {
  TRACY_ORIGIN: 'https://s2.tracy.ai',
  SITE_DOMAIN: 'tracy.ai',
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
const toMaster = (next) => `https://cowork.tracy.ai/login?next=${encodeURIComponent(next)}`
function harness(env = shardEnv) {
  const sent = []
  const app = buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail: { send: async (m) => sent.push(m) },
    now: () => 1_760_000_000_000
  })
  const go = (path, init = {}) => app.fetch(new Request(`https://s2.tracy.ai${path}`, init))
  return { go, sent }
}

test('a shard sends sign-in to the master and never mails a code', async () => {
  const { go, sent } = harness()
  const login = await go('/login?next=/new/')
  assert.equal(login.status, 302)
  assert.equal(login.headers.get('location'), toMaster('https://s2.tracy.ai/new/'))
  const json = await go('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.c' })
  })
  assert.equal(json.status, 403)
  assert.deepEqual(await json.json(), { code: 'SIGN_IN_AT_MASTER', login: toMaster('https://s2.tracy.ai/') })
  for (const path of [
    '/verify',
    '/signin/code',
    '/signin/verify',
    '/auth/otp/start',
    '/auth/otp/verify',
    '/auth/link/abc/session'
  ])
    assert.equal(
      (await go(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
        .status,
      403,
      path
    )
  assert.equal(sent.length, 0)
})

test('an invitation link reaches the master’s sign-up with next back to this shard', async () => {
  const { go } = harness()
  const res = await go('/login?next=%2Finvite%2Ftok123')
  assert.equal(res.headers.get('location'), toMaster('https://s2.tracy.ai/invite/tok123'))
  const lane = await go('/signin?n=abc')
  assert.equal(lane.headers.get('location'), toMaster('https://s2.tracy.ai/signin?n=abc'))
})

test('a person already signed in on the shard is let through to the door they asked for', async () => {
  const { go } = harness()
  const token = await mintSession('a@b.c', 's'.repeat(32), 1_760_000_000_000)
  const res = await go('/login?next=/new/', { headers: { cookie: `tracy_sess_s2=${token}` } })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://s2.tracy.ai/new/')
})

test('a browser posting the old form gets a page in its language with a way to the master', async () => {
  const { go } = harness()
  const res = await go('/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html',
      'accept-language': 'vi'
    },
    body: 'email=a%40b.c'
  })
  assert.equal(res.status, 403)
  const page = await res.text()
  assert.match(page, /Bạn đăng nhập tại <strong>cowork\.tracy\.ai<\/strong>/)
  assert.match(page, /<form method="get" action="https:\/\/cowork\.tracy\.ai\/login">/)
  assert.match(
    res.headers.get('content-security-policy'),
    /form-action 'self'[^;]* https:\/\/cowork\.tracy\.ai/
  )
})

test('the master signs people in exactly as before', async () => {
  const masterEnv = { ...shardEnv }
  for (const key of ['TRACY_DEPLOYMENT_ROLE', 'MASTER_ORIGIN', 'SHARD_SECRET', 'SESSION_COOKIE_NAME'])
    delete masterEnv[key]
  const { go } = harness(masterEnv)
  assert.equal((await go('/login')).status, 200)
})
