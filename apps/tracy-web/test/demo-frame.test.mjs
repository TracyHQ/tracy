/**
 * The probe behind `GET /api/templates/:id/demo-frame`: one GET at the demo, headers read, body
 * dropped, the answer cached for a while — and the four ways a demo is NOT framable, each named.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { makeDemoFrameProbe } from '../src/lib/demo-frame.js'

const html = (headers, status = 200) =>
  new Response('<html>demo</html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers }
  })

test('a demo that names the caller in frame-ancestors is framable; one that names nobody is not', async () => {
  const calls = []
  const probe = makeDemoFrameProbe({
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init?.method ?? 'GET', signal: init?.signal instanceof AbortSignal })
      return html({ 'content-security-policy': "frame-ancestors 'self' https://cowork.tracy.site" })
    }
  })
  const yes = await probe('https://business-emdash.tracy.site/', 'https://cowork.tracy.site')
  assert.deepEqual(yes, { framable: true, reason: 'frame-ancestors' })
  const no = await probe('https://business-emdash.tracy.site/', 'https://cowork.tracy.ai')
  assert.equal(no.framable, false)
  assert.equal(no.reason, 'frame-ancestors')
  // GET, not HEAD (HEAD answered a 301 and a stale X-Frame-Options on one Joomla demo, 20/09), with
  // a signal so a hung demo cannot hold the door — and ONE request for both questions: the headers
  // are cached, the origin is compared afterwards.
  assert.deepEqual(calls, [{ url: 'https://business-emdash.tracy.site/', method: 'GET', signal: true }])
})

test('only X-Frame-Options, a non-html answer, a 502 page, and a demo that does not answer', async () => {
  const answers = {
    'https://saas.test/': () => html({ 'x-frame-options': 'SAMEORIGIN' }),
    'https://json.test/': () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
    'https://down.test/': () => html({}, 502),
    'https://hang.test/': () => new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 5))
  }
  const probe = makeDemoFrameProbe({ fetchImpl: async (url) => answers[url](), timeoutMs: 50 })
  assert.deepEqual(await probe('https://saas.test/', 'https://cowork.tracy.site'), {
    framable: false,
    reason: 'x-frame-options'
  })
  assert.deepEqual(await probe('https://json.test/', 'https://cowork.tracy.site'), {
    framable: false,
    reason: 'not-html'
  })
  assert.deepEqual(await probe('https://down.test/', 'https://cowork.tracy.site'), {
    framable: false,
    reason: 'status:502'
  })
  assert.deepEqual(await probe('https://hang.test/', 'https://cowork.tracy.site'), {
    framable: false,
    reason: 'unreachable'
  })
})

test('the answer is cached per demo for the TTL, and a failure is cached too — a down demo is not hammered', async () => {
  let n = 0
  let t = 1000
  const probe = makeDemoFrameProbe({
    fetchImpl: async () => {
      n += 1
      return html({ 'content-security-policy': 'frame-ancestors *' })
    },
    ttlMs: 100,
    now: () => t
  })
  await probe('https://a.test/', 'https://x.test')
  await probe('https://a.test/', 'https://y.test')
  assert.equal(n, 1, 'two origins, one fetch')
  t += 101
  await probe('https://a.test/', 'https://x.test')
  assert.equal(n, 2, 'past the TTL, asked again')
})

test('a demo address that is not https/http is refused without a request', async () => {
  const probe = makeDemoFrameProbe({
    fetchImpl: async () => {
      throw new Error('must not be called')
    }
  })
  assert.deepEqual(await probe('file:///etc/passwd', 'https://x.test'), {
    framable: false,
    reason: 'no-demo'
  })
  assert.deepEqual(await probe('', 'https://x.test'), { framable: false, reason: 'no-demo' })
})

// ── the door ─────────────────────────────────────────────────────────────────────────────────────
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'demo',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h',
  SEAT_demo_SECRET: 'k'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const TAG = 'tracy-business/j6'

async function seedReleaseAndDemo(pool, { live = true } = {}) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      TAG,
      JSON.stringify({
        name: 'Tracy Business / Joomla 6',
        kind: 'quickstart',
        github: 'published',
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label: 'Tracy Business',
        version: '1.0.0',
        cms: '6.1.1',
        install: {},
        template: 'tracy-business',
        card: {
          category: 'Professional & Corporate',
          provider: 'Tracy',
          layouts: [{ key: 'home', label: 'Home', path: '/' }]
        }
      })
    ]
  )
  if (live)
    await pool.query(
      `insert into site (site_key, label, host, platform, publish, address, demo, quickstart_tag, quickstart_version)
       values ('business-joomla.tracy.test', 'business-joomla', 'demo', 'joomla', 'published', 'https://business-joomla.tracy.test/', true, $1, '1.0.0')`,
      [TAG]
    )
}

test('the door: the list names the probe, and the probe answers per origin', opts, async () => {
  const { pool } = db
  await seedReleaseAndDemo(pool)
  const asked = []
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async (url) => {
      asked.push(String(url))
      return html({ 'content-security-policy': "frame-ancestors 'self' https://cowork.tracy.test" })
    }
  })
  const get = (path) => app.fetch(new Request(`https://cowork.tracy.test${path}`, { redirect: 'manual' }))

  const list = await (await get('/api/templates')).json()
  assert.equal(
    list.templates[0].card.demo.probe,
    'https://cowork.tracy.test/api/templates/tracy-business/demo-frame',
    'the list hands the card the door as an address'
  )

  const yes = await get('/api/templates/tracy-business/demo-frame?origin=https%3A%2F%2Fcowork.tracy.test')
  assert.equal(yes.status, 200)
  assert.equal(
    yes.headers.get('access-control-allow-origin'),
    '*',
    'a public page on another origin asks too'
  )
  assert.equal(yes.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await yes.json(), { framable: true, reason: 'frame-ancestors' })

  const no = await get('/api/templates/tracy-business/demo-frame?origin=https%3A%2F%2Fsomeone.test')
  assert.deepEqual(await no.json(), { framable: false, reason: 'frame-ancestors' })
  assert.deepEqual(asked, ['https://business-joomla.tracy.test/'], 'one GET at the demo for both askers')

  assert.equal((await get('/api/templates/tracy-business/demo-frame')).status, 400, 'no origin, no answer')
  assert.equal((await get('/api/templates/tracy-business/demo-frame?origin=cowork.tracy.test')).status, 400)
  assert.equal(
    (await get('/api/templates/nope/demo-frame?origin=https%3A%2F%2Fcowork.tracy.test')).status,
    404
  )
})

test('the door: a template with no live demo is not framable, and no request is made', opts, async () => {
  const { pool } = db
  await seedReleaseAndDemo(pool, { live: false })
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async () => {
      throw new Error('must not be called')
    }
  })
  const res = await app.fetch(
    new Request(
      'https://cowork.tracy.test/api/templates/tracy-business/demo-frame?origin=https%3A%2F%2Fcowork.tracy.test'
    )
  )
  assert.deepEqual(await res.json(), { framable: false, reason: 'no-demo' })
  const list = await (await app.fetch(new Request('https://cowork.tracy.test/api/templates'))).json()
  assert.equal(list.templates[0].card.demo, undefined, 'no demo, no probe')
})
