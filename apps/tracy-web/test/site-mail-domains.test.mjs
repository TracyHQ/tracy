/**
 * Mode `tracy-domain` on Tracy's SHARED Resend account (`mail/site-mail/domains.js`), end to end
 * through `buildApp` on a real database, against a fake account that behaves like Resend's: it holds
 * a fixed number of domains, answers 404 for an id it does not have, and refuses a create over the
 * plan with Resend's own wording.
 *
 * What was measured on 24/09 and must not happen again: a changed domain left behind, a domain kept
 * after leaving the mode, a full account reported as "did not answer", a stale id checked forever.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { sweepSiteMailDomains } from '../src/cron.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { addressDomain, tracyDomain } from '../src/mail/site-mail/domains.js'
import { domainFailure, ResendError, resendDomains } from '../src/mail/site-mail/resend-domains.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1',
  SITE_MAIL: 'smtp',
  SITE_MAIL_DOMAIN: 'sites.tracy.test',
  SITE_MAIL_KEY: 're_site_key'
}

const LIMIT_TEXT = 'You have reached the domain limit of your plan. Upgrade to add more.'

/**
 * A Resend account in memory. `plan` is the real refusal Resend makes (so the preflight can be
 * switched off by a high `SITE_MAIL_DOMAIN_LIMIT` and the upstream refusal tested on its own).
 */
function fakeAccount({ domains = [], plan = 3 } = {}) {
  const account = domains.map((d) => ({ status: 'verified', ...d }))
  const calls = []
  let n = 0
  const gone = (id) => new ResendError(`resend GET /domains/${id}: Domain not found`, 404, 'not_found')
  const find = (id) => account.find((d) => d.id === id)
  const client = {
    list: async () => {
      calls.push('list')
      return account.map(({ id, name, status }) => ({ id, name, status }))
    },
    create: async (name) => {
      calls.push(`create ${name}`)
      if (account.length >= plan)
        throw new ResendError(`resend POST /domains: ${LIMIT_TEXT}`, 403, 'validation_error')
      const d = { id: `new_${++n}`, name, status: 'not_started' }
      account.push(d)
      return {
        ...d,
        records: [{ type: 'TXT', name: `resend._domainkey.${name}`, value: 'p=abc', status: 'not_started' }]
      }
    },
    get: async (id) => {
      calls.push(`get ${id}`)
      const d = find(id)
      if (!d) throw gone(id)
      return { ...d, records: [] }
    },
    verify: async (id) => {
      calls.push(`verify ${id}`)
      const d = find(id)
      if (!d) throw gone(id)
      return { ...d, records: [] }
    },
    remove: async (id) => {
      calls.push(`remove ${id}`)
      const i = account.findIndex((d) => d.id === id)
      if (i < 0) return false
      account.splice(i, 1)
      return true
    }
  }
  return { client, account, calls, names: () => account.map((d) => d.name).sort() }
}

/** Tracy's own two sending domains, as the dev account held them on 24/09. */
const TRACY_OWN = [
  { id: 'own_ai', name: 'sites.tracy.ai' },
  { id: 'own_site', name: 'sites.tracy.test' }
]

function harness(pool, fake, envOver = {}) {
  const config = readConfig({ ...env, ...envOver })
  const logs = []
  const log = { log: (s) => logs.push(s), warn: (s) => logs.push(s) }
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async () => new Response('site proxy', { status: 502 }),
    siteMail: { resend: () => fake.client, log }
  })
  const call = async (method, path, email, body) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        method,
        headers: {
          ...(email ? { cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}` } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  const save = (siteKey, body, email = 'owner@x.test') =>
    call('PUT', `/api/sites/${siteKey}/mail`, email, body)
  return { app, call, save, config, logs }
}

async function site(pool, label) {
  const siteKey = `${label}.tracy.test`
  await pool.query(
    "insert into site (site_key, label, host, publish) values ($1, $2, 'prod1', 'published')",
    [siteKey, label]
  )
  const { rows } = await pool.query(
    "insert into account (email) values ('owner@x.test') on conflict (email) do update set email = excluded.email returning id"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())",
    [siteKey, rows[0].id]
  )
  return siteKey
}

async function opsStaff(pool, email = 'ops@tracy.test') {
  const id = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
    )
  ).rows[0].id
  await pool.query(
    "insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())",
    [ws, id]
  )
  return email
}

const row = async (pool, siteKey) =>
  (await pool.query('select * from site_mail where site_key = $1', [siteKey])).rows[0] ?? null

test('changing the domain deletes the old Tracy-made one: two saves leave exactly one', opts, async () => {
  const { pool } = db
  const a = await site(pool, 'lantern')
  const fake = fakeAccount({ domains: TRACY_OWN })
  const h = harness(pool, fake)

  const first = await h.save(a, { mode: 'tracy-domain', domain: 'one.test' })
  assert.equal(first.status, 200)
  const firstBody = await first.json()
  assert.equal(firstBody.domain, 'one.test')
  assert.ok(firstBody.domainPendingSince, 'waiting since the save')
  assert.equal(
    Date.parse(firstBody.domainReleaseAt) - Date.parse(firstBody.domainPendingSince),
    3 * 86_400_000,
    'released SITE_MAIL_DOMAIN_PENDING_DAYS (3) later'
  )
  assert.equal((await row(pool, a)).domain_owned, true)

  // The account is now full (3 of 3): the change still fits, because the old one is freed first.
  const second = await h.save(a, { mode: 'tracy-domain', domain: 'two.test' })
  assert.equal(second.status, 200)
  assert.deepEqual(fake.names(), ['sites.tracy.ai', 'sites.tracy.test', 'two.test'])
  assert.deepEqual(fake.calls.slice(-3), ['list', 'remove new_1', 'create two.test'])
  const r = await row(pool, a)
  assert.equal(r.resend_domain_id, 'new_2')

  const audit = (
    await pool.query("select detail from audit where site_key = $1 and action = 'site.mail' order by id", [a])
  ).rows.map((x) => x.detail)
  assert.deepEqual(audit.at(-1), {
    mode: 'tracy-domain',
    domain: 'two.test',
    resendDomainId: 'new_2',
    created: true
  })
})

test('leaving tracy-domain, or Remove, deletes the Tracy-made domain and clears the row', opts, async () => {
  const { pool } = db
  const a = await site(pool, 'lantern')
  const fake = fakeAccount({ domains: TRACY_OWN })
  const h = harness(pool, fake)

  await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })
  const away = await (await h.save(a, { mode: 'tracy' })).json()
  assert.equal(away.mode, 'tracy')
  assert.equal(away.domain, null)
  assert.equal(away.fromAddress, 'lantern@sites.tracy.test')
  assert.deepEqual(fake.names(), ['sites.tracy.ai', 'sites.tracy.test'])

  await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })
  const removed = await h.call('DELETE', `/api/sites/${a}/mail/domain`, 'owner@x.test')
  assert.equal(removed.status, 200)
  const body = await removed.json()
  assert.equal(body.mode, 'tracy', 'a mode with no domain says what it is')
  assert.equal(body.domain, null)
  assert.deepEqual(fake.names(), ['sites.tracy.ai', 'sites.tracy.test'])
  assert.equal((await h.call('DELETE', `/api/sites/${a}/mail/domain`, 'owner@x.test')).status, 400)
  const actions = (
    await pool.query('select action from audit where site_key = $1 order by id', [a])
  ).rows.map((x) => x.action)
  assert.deepEqual(actions, ['site.mail', 'site.mail', 'site.mail', 'site.mail.domain.remove'])
})

test('a domain Tracy did not create, or a Tracy sending domain, is never deleted', opts, async () => {
  const { pool } = db
  const a = await site(pool, 'lantern')
  const fake = fakeAccount({
    domains: [...TRACY_OWN, { id: 'hand_1', name: 'shop.test', status: 'pending' }]
  })
  const h = harness(pool, fake, { SITE_MAIL_DOMAIN_LIMIT: '5' })

  // Already on the account (added by hand): reused, not created, and not Tracy's to delete.
  const reused = await (await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })).json()
  assert.equal(reused.domainStatus, 'pending')
  assert.equal(reused.domainReleaseAt, null, 'no release clock on a domain Tracy did not make')
  assert.equal((await row(pool, a)).resend_domain_id, 'hand_1')
  assert.equal((await row(pool, a)).domain_owned, false)
  assert.ok(!fake.calls.some((c) => c.startsWith('create')))

  await h.save(a, { mode: 'tracy' })
  assert.ok(fake.names().includes('shop.test'), 'left on the account')
  assert.ok(!fake.calls.some((c) => c.startsWith('remove')))

  // A row that claims ownership of a Tracy sending domain (hand-edited, or older code) is still
  // refused the delete.
  await pool.query(
    "update site_mail set mode = 'tracy-domain', domain = 'sites.tracy.test', resend_domain_id = 'own_site', domain_owned = true where site_key = $1",
    [a]
  )
  await h.save(a, { mode: 'tracy' })
  assert.ok(fake.names().includes('sites.tracy.test'))

  // Two rows pointing at one id (never made by Tracy, but possible by hand): kept for the other.
  const b = await site(pool, 'ember')
  await pool.query(
    "update site_mail set domain = 'y.test', resend_domain_id = 'hand_1', domain_owned = false where site_key = $1",
    [a]
  )
  await pool.query(
    "insert into site_mail (site_key, mode, domain, resend_domain_id, domain_owned) values ($1, 'tracy-domain', 'x.test', 'hand_1', true)",
    [b]
  )
  await h.call('DELETE', `/api/sites/${b}/mail/domain`, 'owner@x.test')
  assert.ok(fake.names().includes('shop.test'), 'another row still points at it')
  assert.ok(!fake.calls.some((c) => c.startsWith('remove')))
})

test("tracyDomain: the domain of MAIL_FROM is Tracy's too; console mail adds none", () => {
  const resend = readConfig({ ...env, MAIL: 'resend:re_sys', MAIL_FROM: 'Tracy <noreply@Tracy.AI>' })
  assert.equal(addressDomain('Tracy <noreply@tracy.ai>'), 'tracy.ai')
  assert.equal(addressDomain('noreply@tracy.ai'), 'tracy.ai')
  assert.equal(tracyDomain('tracy.ai', resend), true)
  assert.equal(tracyDomain('mail.tracy.ai', resend), true)
  assert.equal(tracyDomain('shop.test', resend), false)
  assert.equal(tracyDomain('nottracy.ai', resend), false)

  const consoleMail = readConfig(env)
  assert.equal(consoleMail.mail.kind, 'console')
  assert.equal(tracyDomain('tracy.ai', consoleMail), false)
  assert.equal(tracyDomain('x.sites.tracy.test', consoleMail), true)
})

test("the domain Tracy's system mail leaves from is refused to a site, and never deleted", opts, async () => {
  const { pool } = db
  const a = await site(pool, 'lantern')
  // The system sending domain is already verified on the account: reusing it would let the site
  // send as Tracy.
  const fake = fakeAccount({ domains: [...TRACY_OWN, { id: 'sys_ai', name: 'tracy.ai' }], plan: 9 })
  const h = harness(pool, fake, {
    SITE_MAIL_DOMAIN_LIMIT: '9',
    MAIL: 'resend:re_sys',
    MAIL_FROM: 'Tracy <noreply@tracy.ai>'
  })

  for (const domain of ['tracy.ai', 'Mail.Tracy.AI']) {
    const refused = await h.save(a, { mode: 'tracy-domain', domain })
    assert.equal(refused.status, 400, domain)
    assert.deepEqual(await refused.json(), { code: 'INVALID_REQUEST', reason: 'DOMAIN_NOT_ALLOWED' })
  }
  assert.equal(await row(pool, a), null, 'nothing written for a refused domain')
  assert.deepEqual(fake.calls, [], 'Resend never asked')

  const ok = await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })
  assert.equal(ok.status, 200)
  assert.equal((await row(pool, a)).domain, 'shop.test')

  // A row that claims ownership of it (hand-edited, or older code) is still refused the delete.
  await pool.query(
    "update site_mail set domain = 'tracy.ai', resend_domain_id = 'sys_ai', domain_owned = true where site_key = $1",
    [a]
  )
  await h.save(a, { mode: 'tracy' })
  assert.ok(fake.names().includes('tracy.ai'))
  assert.ok(!fake.calls.includes('remove sys_ai'))
})

test('re-saving the same domain reuses it; a domain another site holds is a 409', opts, async () => {
  const { pool } = db
  const a = await site(pool, 'lantern')
  const b = await site(pool, 'ember')
  const fake = fakeAccount({ domains: TRACY_OWN })
  const h = harness(pool, fake)

  await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })
  const creates = () => fake.calls.filter((c) => c.startsWith('create')).length
  assert.equal(creates(), 1)
  const again = await h.save(a, { mode: 'tracy-domain', domain: 'Shop.Test' })
  assert.equal(again.status, 200)
  assert.equal(creates(), 1, 'same name, same id: nothing asked of Resend')

  const theirs = await h.save(b, { mode: 'tracy-domain', domain: 'shop.test' })
  assert.equal(theirs.status, 409)
  assert.deepEqual(await theirs.json(), { code: 'SITE_MAIL_DOMAIN_TAKEN' })
  assert.equal(creates(), 1)
  assert.equal(await row(pool, b), null, 'nothing written for the refused site')

  // The database says the same thing if two saves race past the read.
  await assert.rejects(
    pool.query("insert into site_mail (site_key, mode, domain) values ($1, 'tracy-domain', 'shop.test')", [
      b
    ]),
    /site_mail_domain_holder/
  )
})

test(
  'a full account is SITE_MAIL_DOMAIN_LIMIT — from the preflight and from Resend itself',
  opts,
  async () => {
    const { pool } = db
    const a = await site(pool, 'lantern')
    const b = await site(pool, 'ember')
    const fake = fakeAccount({ domains: TRACY_OWN })
    const h = harness(pool, fake)

    assert.equal((await h.save(a, { mode: 'tracy-domain', domain: 'one.test' })).status, 200)
    // 3 of 3: refused before any create.
    const full = await h.save(b, { mode: 'tracy-domain', domain: 'two.test' })
    assert.equal(full.status, 409)
    assert.deepEqual(await full.json(), { code: 'SITE_MAIL_DOMAIN_LIMIT' })
    assert.ok(!fake.calls.includes('create two.test'))
    assert.equal(await row(pool, b), null)

    // A limit set too high still ends honestly: Resend's own refusal maps to the same code.
    const loose = harness(pool, fake, { SITE_MAIL_DOMAIN_LIMIT: '10' })
    const refused = await loose.save(b, { mode: 'tracy-domain', domain: 'two.test' })
    assert.equal(refused.status, 409)
    assert.deepEqual(await refused.json(), { code: 'SITE_MAIL_DOMAIN_LIMIT' })

    // /ops shows the slots.
    const ops = await opsStaff(pool)
    const read = await (await h.call('GET', '/api/ops/mail', ops)).json()
    assert.deepEqual(read.domainSlots, { used: 3, limit: 3 })
  }
)

test('domainFailure: only silence is "did not answer"', () => {
  const limit = domainFailure(new ResendError(`resend POST /domains: ${LIMIT_TEXT}`, 403, 'validation_error'))
  assert.deepEqual(limit, { status: 409, body: { code: 'SITE_MAIL_DOMAIN_LIMIT' } })
  assert.deepEqual(domainFailure(new ResendError('restricted', 401, 'restricted_api_key')), {
    status: 503,
    body: { code: 'SITE_MAIL_DOMAIN_UNAVAILABLE' }
  })
  assert.deepEqual(domainFailure(new ResendError('bad name', 422, 'validation_error')), {
    status: 400,
    body: { code: 'INVALID_REQUEST', reason: 'DOMAIN_REJECTED' }
  })
  assert.equal(domainFailure(new ResendError('timeout')).status, 502)
  assert.equal(domainFailure(new ResendError('boom', 500)).status, 502)
})

test('resendDomains: list pages, DELETE 404 is gone, a hang times out', async () => {
  const seen = []
  const pages = [
    { object: 'list', has_more: true, data: [{ id: 'a', name: 'A.test', status: 'verified' }] },
    { object: 'list', has_more: false, data: [{ id: 'b', name: 'b.test', status: 'pending' }] }
  ]
  const fetchImpl = async (url, init) => {
    seen.push(`${init.method} ${url}`)
    if (init.method === 'GET') return Response.json(pages.shift())
    return Response.json({ statusCode: 404, message: 'Domain not found', name: 'not_found' }, { status: 404 })
  }
  const client = resendDomains({ key: 'k', fetchImpl })
  assert.deepEqual(await client.list(), [
    { id: 'a', name: 'a.test', status: 'verified' },
    { id: 'b', name: 'b.test', status: 'pending' }
  ])
  assert.match(seen[1], /after=a/)
  assert.equal(await client.remove('gone'), false)

  const hang = resendDomains({
    key: 'k',
    timeoutMs: 50,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      )
  })
  const error = await hang.list().catch((e) => e)
  assert.ok(error instanceof ResendError)
  assert.equal(error.status, null)
  assert.equal(domainFailure(error).status, 502)
})

test(
  'a stale Resend id (deleted on the dashboard) is gone: Check again asks for the name anew',
  opts,
  async () => {
    const { pool } = db
    const a = await site(pool, 'joomlart')
    const fake = fakeAccount({ domains: TRACY_OWN })
    const h = harness(pool, fake)
    await pool.query(
      "insert into site_mail (site_key, mode, domain, resend_domain_id, domain_status) values ($1, 'tracy-domain', 'joomlart.com', 'f9bd82db-stale', 'not_started')",
      [a]
    )
    const res = await h.call('POST', `/api/sites/${a}/mail/verify`, 'owner@x.test')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.domain, 'joomlart.com')
    assert.equal(body.domainStatus, 'not_started')
    assert.equal(body.dnsRecords.length, 1)
    assert.deepEqual(fake.calls, ['verify f9bd82db-stale', 'list', 'create joomlart.com'])
    const r = await row(pool, a)
    assert.equal(r.resend_domain_id, 'new_1')
    assert.equal(r.domain_owned, true)

    // Removing a stale id is not an error either: the delete's 404 is "already gone".
    await pool.query("update site_mail set resend_domain_id = 'gone-too' where site_key = $1", [a])
    const removed = await h.call('DELETE', `/api/sites/${a}/mail/domain`, 'owner@x.test')
    assert.equal(removed.status, 200)
    assert.equal((await removed.json()).domain, null)
  }
)

test(
  'the release clock deletes only expired, unverified, Tracy-made domains, and tolerates 404',
  opts,
  async () => {
    const { pool } = db
    const keys = {}
    for (const label of ['old', 'fresh', 'verified', 'byhand', 'vanished', 'lateverify'])
      keys[label] = await site(pool, label)
    const fake = fakeAccount({
      plan: 10,
      domains: [
        ...TRACY_OWN,
        { id: 'r_old', name: 'old.test', status: 'pending' },
        { id: 'r_fresh', name: 'fresh.test', status: 'pending' },
        { id: 'r_verified', name: 'verified.test', status: 'verified' },
        { id: 'r_byhand', name: 'byhand.test', status: 'pending' },
        { id: 'r_late', name: 'late.test', status: 'verified' }
      ]
    })
    const put = (label, domain, id, status, owned, age) =>
      pool.query(
        `insert into site_mail (site_key, mode, domain, resend_domain_id, domain_status, domain_owned, domain_requested_at)
       values ($1, 'tracy-domain', $2, $3, $4, $5, now() - $6::interval)`,
        [keys[label], domain, id, status, owned, age]
      )
    await put('old', 'old.test', 'r_old', 'pending', true, '4 days')
    await put('fresh', 'fresh.test', 'r_fresh', 'pending', true, '1 day')
    await put('verified', 'verified.test', 'r_verified', 'verified', true, '30 days')
    await put('byhand', 'byhand.test', 'r_byhand', 'pending', false, '30 days')
    await put('vanished', 'vanished.test', 'r_vanished', 'not_started', true, '5 days')
    // Verified on Resend without anyone pressing "Check again": the row still says pending.
    await put('lateverify', 'late.test', 'r_late', 'pending', true, '5 days')

    const config = readConfig(env)
    const logs = []
    const run = () =>
      sweepSiteMailDomains(pool, config, {
        resend: () => fake.client,
        log: { log: (s) => logs.push(s), warn: (s) => logs.push(s) }
      })
    const first = await run()
    assert.equal(first.ran, true)
    assert.deepEqual(first.released.sort(), [keys.old, keys.vanished].sort())
    assert.deepEqual(first.verified, [keys.lateverify])
    assert.deepEqual(first.failed, [])
    assert.deepEqual(fake.names(), [
      'byhand.test',
      'fresh.test',
      'late.test',
      'sites.tracy.ai',
      'sites.tracy.test',
      'verified.test'
    ])

    const old = await row(pool, keys.old)
    assert.equal(old.domain, 'old.test', 'the name stays for the screen')
    assert.equal(old.domain_status, 'expired')
    assert.equal(old.resend_domain_id, null)
    assert.equal(old.domain_owned, false)
    assert.ok(old.domain_released_at)
    assert.equal(old.mode, 'tracy-domain')
    assert.equal((await row(pool, keys.lateverify)).domain_status, 'verified')

    // The site keeps sending, from the Tracy address; the screen says when it was released.
    const h = harness(pool, fake)
    const view = await (await h.call('GET', `/api/sites/${keys.old}/mail`, 'owner@x.test')).json()
    assert.equal(view.fromAddress, 'old@sites.tracy.test')
    assert.equal(view.domainStatus, 'expired')
    assert.equal(view.domainReleasedAt, old.domain_released_at.toISOString())
    assert.equal(view.domainPendingSince, null)
    assert.equal(view.domainReleaseAt, null)

    const audit = (
      await pool.query(
        "select site_key, actor, detail from audit where action = 'site.mail.domain.expired' order by site_key"
      )
    ).rows
    assert.equal(audit.length, 2)
    assert.equal(audit[0].actor, null)
    assert.equal(audit.find((x) => x.site_key === keys.vanished).detail.deleted, false)

    // Idempotent: nothing left to do.
    const second = await run()
    assert.deepEqual([second.released, second.verified, second.failed], [[], [], []])

    // A released domain can be asked for again, and gets a fresh clock.
    const roomy = harness(pool, fake, { SITE_MAIL_DOMAIN_LIMIT: '10' })
    const again = await (await roomy.save(keys.old, { mode: 'tracy-domain', domain: 'old.test' })).json()
    assert.equal(again.domainStatus, 'not_started')
    assert.ok(again.domainReleaseAt)
    assert.equal(again.domainReleasedAt, null)
  }
)

test(
  '/ops releases a site domain; ops mode change away from tracy-domain releases it too',
  opts,
  async () => {
    const { pool } = db
    const a = await site(pool, 'lantern')
    const fake = fakeAccount({ domains: TRACY_OWN })
    const h = harness(pool, fake)
    const ops = await opsStaff(pool)

    await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })
    const listed = (await (await h.call('GET', '/api/ops/mail', ops)).json()).sites.find(
      (s) => s.siteKey === a
    )
    assert.equal(listed.domainOwned, true)
    assert.ok(listed.domainReleaseAt)

    const released = await h.call('DELETE', `/api/ops/mail/sites/${a}/domain`, ops)
    assert.equal(released.status, 200)
    const entry = await released.json()
    assert.equal(entry.domain, null)
    assert.equal(entry.mode, 'tracy')
    assert.deepEqual(fake.names(), ['sites.tracy.ai', 'sites.tracy.test'])

    await h.save(a, { mode: 'tracy-domain', domain: 'shop.test' })
    const off = await (await h.call('PUT', `/api/ops/mail/sites/${a}`, ops, { mode: 'off' })).json()
    assert.equal(off.mode, 'off')
    assert.equal(off.domain, null)
    assert.deepEqual(fake.names(), ['sites.tracy.ai', 'sites.tracy.test'])

    // Nothing to release; a stranger may not.
    assert.equal((await h.call('DELETE', `/api/ops/mail/sites/${a}/domain`, ops)).status, 400)
    assert.equal((await h.call('DELETE', `/api/ops/mail/sites/${a}/domain`, 'who@x.test')).status, 403)
    const actions = (
      await pool.query("select action from audit where action like 'ops.%' order by id")
    ).rows.map((x) => x.action)
    assert.deepEqual(actions, ['ops.site-mail.domain.release', 'ops.site-mail'])
  }
)
