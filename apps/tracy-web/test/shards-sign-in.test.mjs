/** The two sign-in moments of the shard model (spec §2.1, §2.2; contract §3, §4), on a real directory. */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { readConfig } from '../src/config.js'
import { recordHome } from '../src/shards/directory.js'
import { shardSignIn } from '../src/shards/sign-in.js'
import { createShardBook } from '../src/shards/store.js'
import { fileDb } from './_db.mjs'
import { MASTER_ENV, SESSION_SECRET, healthy, seedTestShards } from './_shards.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SHARD_NEXT = 'https://s1.tracy.test/sites?x=1'

function harness(pool, decision = { kind: 'master' }, env = {}) {
  const config = readConfig({ ...MASTER_ENV, ...env })
  const asked = []
  const alerts = []
  const hooks = shardSignIn({
    pool,
    book: createShardBook({ pool, sessionSecret: SESSION_SECRET }),
    config,
    handoff: {
      handoffFor: async (input) => {
        asked.push(input)
        return decision
      }
    },
    signal: { record: async (kind, input) => alerts.push({ kind, ...input }) },
    pages: {
      workspaceUnavailable: (email, o) => new Response(`unavailable ${email} ${o.retryHref}`, { status: 503 })
    }
  })
  const app = new Hono()
  // `?json=1` plays the login page's own fetch; without it the hook answers as to a navigation.
  const mode = (c) => ({ json: c.req.query('json') === '1' })
  app.get('/after', async (c) => (await hooks.afterSignIn(c, c.req.query('email'), mode(c))) ?? c.text('ok'))
  app.get('/login', async (c) => {
    const routed = await hooks.atLogin(c, c.req.query('email') || null, c.req.query('next'))
    return routed instanceof Response ? routed : c.json(routed)
  })
  app.get('/fresh', async (c) => (await hooks.atFresh(c, c.req.query('email'))) ?? c.text('master'))
  const get = (path, headers = {}) => app.request(`https://cowork.tracy.test${path}`, { headers })
  return { get, asked, alerts }
}

test(
  'after a sign-in a new person carries a pointer to the emptiest shard, across the session domain',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    await healthy(pool, 's1')
    await healthy(pool, 's2', { sites: 150 })
    await pool.query("insert into account (email) values ('new@tracy.test')")
    const res = await harness(pool).get('/after?email=new@tracy.test')
    assert.deepEqual(res.headers.getSetCookie(), [
      '__Host-tracy_shard=s1; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000'
    ])
  }
)

test(
  'somebody who lives on a shard gets that shard; an s0 person loses a stale pointer and gets nothing else',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    await healthy(pool, 's1')
    await healthy(pool, 's2', { sites: 150 })
    await recordHome(pool, 'mover@tracy.test', 's2')
    await recordHome(pool, 'legacy@tracy.test', 's0')
    const h = harness(pool)
    assert.match(
      (await h.get('/after?email=mover@tracy.test')).headers.getSetCookie()[0],
      /^__Host-tracy_shard=s2;/
    )
    assert.deepEqual((await h.get('/after?email=legacy@tracy.test')).headers.getSetCookie(), [])
    const stale = await h.get('/after?email=legacy@tracy.test', { cookie: '__Host-tracy_shard=s1' })
    assert.match(stale.headers.getSetCookie()[0], /^__Host-tracy_shard=; .*Max-Age=0$/)
  }
)

test(
  'no shard able to take a new person: an empty table changes nothing; shards all unfit refuse them before any session, told once a quarter hour',
  opts,
  async () => {
    const { pool } = db
    await pool.query("insert into account (email) values ('new@tracy.test')")
    const empty = harness(pool)
    const kept = await empty.get('/after?email=new@tracy.test')
    assert.equal(await kept.text(), 'ok')
    assert.deepEqual(kept.headers.getSetCookie(), [])
    assert.deepEqual(empty.alerts, [])
    await seedTestShards(pool)
    const closed = harness(pool)
    const page = await closed.get('/after?email=new@tracy.test')
    assert.equal(page.status, 503)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.equal(page.headers.get('cache-control'), 'no-store')
    assert.match(await page.text(), /beta is full right now/)
    assert.deepEqual(page.headers.getSetCookie(), [], 'no pointer, and nothing for a session to ride on')
    const api = await closed.get('/after?email=new@tracy.test&json=1')
    assert.equal(api.status, 503)
    assert.deepEqual(await api.json(), { code: 'NO_SHARD_ACCEPTING' })
    assert.deepEqual(
      closed.alerts.map((a) => [a.kind, a.data]),
      [
        ['shard.none', { reason: 'NO_ELIGIBLE_SHARD' }],
        ['shard.none', { reason: 'NO_ELIGIBLE_SHARD' }]
      ]
    )
    assert.equal(
      new Set(closed.alerts.map((a) => a.dedupeKey)).size,
      1,
      'both refusals fold into one quarter-hour key'
    )
    assert.equal(
      (await pool.query("select count(*)::int as n from directory_email where email = 'new@tracy.test'"))
        .rows[0].n,
      0
    )
    const off = harness(pool, undefined, { SHARD_ADOPT_ALLOW: '' })
    assert.equal(
      await (await off.get('/after?email=new@tracy.test')).text(),
      'ok',
      'adoption off for them: today, no refusal'
    )
    assert.deepEqual(off.alerts, [])
  }
)

test(
  'the refusal page speaks the request language, and a shard that takes people ends the refusal',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    await pool.query("insert into account (email) values ('new@tracy.test')")
    const h = harness(pool)
    const vi = await h.get('/after?email=new@tracy.test', { 'accept-language': 'vi' })
    assert.equal(vi.status, 503)
    assert.match(await vi.text(), /<html lang="vi">/)
    await healthy(pool, 's1')
    const taken = await harness(pool).get('/after?email=new@tracy.test')
    assert.equal(
      await taken.text(),
      'ok',
      'a shard that takes people: the pointer is set and the session may be minted'
    )
    assert.match(taken.headers.getSetCookie()[0], /^__Host-tracy_shard=s1;/)
  }
)

test('a next that is not on a shard in the table is left to the login door as it is', opts, async () => {
  const { pool } = db
  await seedTestShards(pool)
  const h = harness(pool)
  for (const next of ['/sites', 'https://evil.test/x', 'https://s9.tracy.test/x', 'not a url'])
    assert.equal(await (await h.get(`/login?next=${encodeURIComponent(next)}`)).json(), null, next)
  assert.deepEqual(h.asked, [])
})

test('signed out, a next on a shard is kept through the sign-in as a master path', opts, async () => {
  const { pool } = db
  await seedTestShards(pool)
  const res = await harness(pool).get(`/login?next=${encodeURIComponent(SHARD_NEXT)}`)
  assert.deepEqual(await res.json(), { next: `/login?next=${encodeURIComponent(SHARD_NEXT)}` })
})

test(
  'signed in, a handoff answers 302 to the ticket with the pointer and the nonce under the session domain',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    const nonce = '0123456789abcdef0123456789abcdef'
    const decision = {
      kind: 'handoff',
      shard: { name: 's1', origin: 'https://s1.tracy.test' },
      nonce,
      url: `https://s1.tracy.test/handoff?t=${'T'.repeat(43)}`
    }
    const h = harness(pool, decision)
    const res = await h.get(`/login?email=mai@tracy.test&next=${encodeURIComponent(SHARD_NEXT)}`, {
      'cf-ipcountry': 'VN'
    })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), decision.url)
    assert.equal(
      res.headers.get('location').includes('next='),
      false,
      'the page to open rides in the adopt body'
    )
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.headers.getSetCookie(), [
      '__Host-tracy_shard=s1; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000',
      `tracy_handoff=${nonce}; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=tracy.test; Max-Age=60`
    ])
    assert.deepEqual(h.asked, [
      { email: 'mai@tracy.test', wanted: 's1', nextPath: '/sites?x=1', country: 'VN' }
    ])
  }
)

test(
  'signed in and sent back by a shard whose handoff failed: a page, never a second ticket or a 302 to /handoff',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    const decision = {
      kind: 'handoff',
      shard: { name: 's1', origin: 'https://s1.tracy.test' },
      nonce: '0123456789abcdef0123456789abcdef',
      url: `https://s1.tracy.test/handoff?t=${'T'.repeat(43)}`
    }
    const h = harness(pool, decision)
    const res = await h.get(
      `/login?email=mai@tracy.test&next=${encodeURIComponent(SHARD_NEXT)}&handoff=failed`
    )
    assert.equal(res.status, 503)
    assert.match(await res.text(), /unavailable mai@tracy\.test/)
    assert.equal(res.headers.get('location'), null)
    assert.deepEqual(h.asked, [], 'no second ticket is asked for')
  }
)

test(
  'signed in, "stay here" lands on the same path of this master and drops the pointer; "unavailable" is a 503 page',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    const master = await harness(pool, { kind: 'master' }).get(
      `/login?email=legacy@tracy.test&next=${encodeURIComponent(SHARD_NEXT)}`
    )
    assert.equal(master.status, 302)
    assert.equal(master.headers.get('location'), 'https://cowork.tracy.test/sites?x=1')
    assert.match(master.headers.getSetCookie()[0], /^__Host-tracy_shard=; .*Max-Age=0$/)
    const down = await harness(pool, { kind: 'unavailable', shard: 's1' }).get(
      `/login?email=old@tracy.test&next=${encodeURIComponent(SHARD_NEXT)}`
    )
    assert.equal(down.status, 503)
    assert.equal(await down.text(), 'unavailable old@tracy.test /')
  }
)

test(
  'signed in, both shards refusing a new person is NO_SHARD_ACCEPTING: the page, with the session and the pointer taken back',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    const h = harness(pool, { kind: 'none' })
    const res = await h.get(`/login?email=new@tracy.test&next=${encodeURIComponent(SHARD_NEXT)}`, {
      cookie: '__Host-tracy_shard=s1; tracy_sess=x'
    })
    assert.equal(res.status, 503)
    assert.match(res.headers.get('content-type'), /text\/html/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.match(await res.text(), /beta is full right now/)
    assert.deepEqual(res.headers.getSetCookie(), [
      'tracy_sess=; HttpOnly; Secure; SameSite=Lax; Domain=tracy.test; Path=/; Max-Age=0',
      '__Host-tracy_shard=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'
    ])
    assert.deepEqual(h.asked, [
      { email: 'new@tracy.test', wanted: 's1', nextPath: '/sites?x=1', country: null }
    ])
  }
)

test('a host the session domain does not cover cannot hand off, so nothing is adopted', opts, async () => {
  const { pool } = db
  await seedTestShards(pool)
  const h = harness(pool, { kind: 'master' }, { SESSION_DOMAIN: 'other.test' })
  assert.equal(
    await (await h.get(`/login?email=mai@tracy.test&next=${encodeURIComponent(SHARD_NEXT)}`)).json(),
    null
  )
  assert.deepEqual(h.asked, [])
})

test(
  'a fresh start hands over with the pointer and the nonce, or leaves the master to answer',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    const nonce = 'fedcba9876543210fedcba9876543210'
    const decision = {
      kind: 'handoff',
      shard: { name: 's2', origin: 'https://s2.tracy.test' },
      nonce,
      url: `https://s2.tracy.test/handoff?t=${'T'.repeat(43)}`
    }
    const h = harness(pool, decision)
    const res = await h.get('/fresh?email=full@tracy.test', { 'cf-ipcountry': 'DE' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), decision.url)
    assert.deepEqual(res.headers.getSetCookie(), [
      '__Host-tracy_shard=s2; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000',
      `tracy_handoff=${nonce}; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=tracy.test; Max-Age=60`
    ])
    assert.deepEqual(h.asked, [{ email: 'full@tracy.test', fresh: true, nextPath: '/new/', country: 'DE' }])
    assert.equal(
      await (await harness(pool, { kind: 'master' }).get('/fresh?email=full@tracy.test')).text(),
      'master'
    )
  }
)

test(
  'a fresh start no other shard can take is NO_SHARD_ACCEPTING: the page, nothing made here, their session and pointer left alone',
  opts,
  async () => {
    const { pool } = db
    await seedTestShards(pool)
    const res = await harness(pool, { kind: 'none' }).get('/fresh?email=full@tracy.test', {
      cookie: '__Host-tracy_shard=s1; tracy_sess=x'
    })
    assert.equal(res.status, 503)
    assert.match(res.headers.get('content-type'), /text\/html/)
    assert.match(await res.text(), /beta is full right now/)
    assert.deepEqual(
      res.headers.getSetCookie(),
      [],
      'they still live on their old shard: nothing is taken back'
    )
  }
)
