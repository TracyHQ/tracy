import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { signShardRequest } from '../src/lib/shard-channel.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SECRET = 'ab'.repeat(32)
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
  SHARD_SECRET: SECRET,
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}
// A failed handoff goes to the master's sign-in, back to the page the ticket stored (never /handoff)
// and to /new/ when no ticket row is found.
const loginFor = (path) =>
  `https://cowork.tracy.ai/login?next=${encodeURIComponent(`https://s2.tracy.ai${path}`)}`
// `&handoff=failed` tells a master that already holds a session not to mint a second ticket.
const MASTER_LOGIN = `${loginFor('/invite/tok')}&handoff=failed`
const MASTER_LOGIN_NEW = `${loginFor('/new/')}&handoff=failed`
// The master's nonce (32 hex): `tracy_handoff` carries it, adopt carried only its hash.
const NONCE = 'c0ffee'.repeat(5) + 'ab'
const OTHER_NONCE = 'f'.repeat(32)

async function world() {
  let clock = Date.now()
  await db.pool.query(
    "insert into quickstart_releases (tag, release, tracy) values ('test/none', '{}', 'no-setting')"
  )
  const app = buildApp({
    config: readConfig(env),
    pool: db.pool,
    identity: pgIdentityStore(db.pool),
    mail: { send: async () => {} },
    now: () => clock
  })
  const ticket = async () => {
    const body = JSON.stringify({
      email: 'a@b.c',
      displayName: '',
      locale: 'en',
      source: 'master',
      idempotencyKey: 'm-1',
      nonceHash: createHash('sha256').update(NONCE).digest('hex'),
      next: '/invite/tok'
    })
    const headers = signShardRequest({
      secret: SECRET,
      method: 'POST',
      path: '/_shard/adopt',
      body,
      now: clock
    })
    const adopted = await app.fetch(
      new Request('https://s2.tracy.ai/_shard/adopt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body
      })
    )
    return (await adopted.json()).handoff
  }
  const open = (handoff, cookie, query = '') =>
    app.fetch(
      new Request(`https://s2.tracy.ai/handoff?t=${handoff}${query}`, {
        headers: { host: 's2.tracy.ai', ...(cookie ? { cookie } : {}) }
      })
    )
  return { ticket, open, later: (ms) => (clock += ms) }
}

test(
  'a ticket and its nonce become a session of this shard, once, with W1’s cookies and no pointer',
  opts,
  async () => {
    const { ticket, open } = await world()
    const handoff = await ticket()
    const res = await open(handoff, `tracy_handoff=${NONCE}`)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), 'https://s2.tracy.ai/invite/tok')
    const set = res.headers.getSetCookie()
    assert.ok(
      set.some((v) => v.startsWith('tracy_sess_s2=v1.')),
      set.join(' | ')
    )
    assert.ok(
      !set.some((v) => v.includes('tracy_shard')),
      'a shard never sets the master’s pointer (contract §3, §4)'
    )
    assert.ok(
      set.some((v) => /^tracy_handoff=; Path=\/; .*Domain=tracy\.ai; Max-Age=0$/.test(v)),
      set.join(' | ')
    )
    assert.ok(
      !set.some((v) => v.startsWith('tracy_sess=v1')),
      'the master’s cookie name is never written here'
    )
    const again = await open(handoff, `tracy_handoff=${NONCE}`)
    assert.equal(again.headers.get('location'), MASTER_LOGIN)
  }
)

test('only t is read: a next in the query never chooses where the person lands', opts, async () => {
  const { ticket, open } = await world()
  const res = await open(
    await ticket(),
    `tracy_handoff=${NONCE}`,
    `&next=${encodeURIComponent('https://evil.example/')}`
  )
  assert.equal(res.headers.get('location'), 'https://s2.tracy.ai/invite/tok')
  const failed = await open('x'.repeat(43), `tracy_handoff=${NONCE}`, '&next=%2Fsites')
  assert.equal(
    failed.headers.get('location'),
    MASTER_LOGIN_NEW,
    'no ticket row found: /new/, never /handoff and never the next from the query'
  )
})

test(
  'a ticket without its nonce, with another browser’s, a used one or a late one goes back to the master and sets no session',
  opts,
  async () => {
    const { ticket, open, later } = await world()
    for (const cookie of [null, `tracy_handoff=${OTHER_NONCE}`]) {
      const res = await open(await ticket(), cookie)
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('location'), MASTER_LOGIN)
      assert.ok(!res.headers.getSetCookie().some((v) => v.startsWith('tracy_sess')))
    }
    const burnt = await ticket()
    await open(burnt, `tracy_handoff=${OTHER_NONCE}`)
    assert.equal(
      (await open(burnt, `tracy_handoff=${NONCE}`)).headers.get('location'),
      MASTER_LOGIN,
      'a wrong nonce spends the ticket'
    )
    const late = await ticket()
    later(61_000)
    const res = await open(late, `tracy_handoff=${NONCE}`)
    assert.equal(res.headers.get('location'), MASTER_LOGIN)
    assert.ok(!res.headers.getSetCookie().some((v) => v.startsWith('tracy_sess')))
  }
)

test(
  'two tracy_handoff cookies are a broken ticket, spent and signed in nowhere; a failed handoff never goes back to /handoff',
  opts,
  async () => {
    const { ticket, open } = await world()
    const planted = await ticket()
    // A customer site under the parent domain planted a second nonce (contract §3.1 (3)): even with
    // the right one beside it, nothing opens, and the ticket is spent.
    const res = await open(planted, `tracy_handoff=${OTHER_NONCE}; tracy_handoff=${NONCE}`)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), MASTER_LOGIN)
    assert.ok(!res.headers.getSetCookie().some((v) => v.startsWith('tracy_sess')))
    assert.ok(
      res.headers.getSetCookie().some((v) => v.startsWith('tracy_handoff=;') && v.endsWith('Max-Age=0')),
      'the nonce is cleared in every outcome'
    )
    // A planted copy lives under its own (domain, path): every copy is cleared, not only `Path=/`.
    const cleared = res.headers.getSetCookie().filter((v) => v.startsWith('tracy_handoff=;'))
    for (const path of ['/', '/handoff'])
      for (const domain of [true, false])
        assert.ok(
          cleared.some((v) => v.includes(`Path=${path};`) && v.includes('Domain=tracy.ai;') === domain),
          `cleared on Path=${path}, ${domain ? 'with' : 'without'} Domain: ${cleared.join(' | ')}`
        )
    assert.ok(res.headers.get('location').endsWith('&handoff=failed'), 'the master is told it failed')
    assert.equal(
      (await open(planted, `tracy_handoff=${NONCE}`)).headers.get('location'),
      MASTER_LOGIN,
      'spent: the right nonce alone no longer opens it'
    )
    for (const cookie of [null, `tracy_handoff=${OTHER_NONCE}`])
      assert.ok(
        !(await open(await ticket(), cookie)).headers.get('location').includes('/handoff'),
        'the master is never told to come back to /handoff'
      )
  }
)
