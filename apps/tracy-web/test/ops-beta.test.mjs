/**
 * `/api/ops/beta/*` (`src/ops/beta.js`): the Beta screens' doors, on a real database.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { customerSite, stuckState } from '../src/ops/beta.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'https://cowork.tracy.test'
// 2026-10-08 10:00 in Vietnam.
const NOW = Date.parse('2026-10-08T03:00:00Z')
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'demo',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h',
  SEAT_demo_SECRET: 'k'
}

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    now: () => NOW,
    signalNow: () => NOW,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    log: { warn() {}, log() {}, error() {} }
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = async (path, cookie) =>
    app.fetch(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' }))
  const post = async (path, cookie, body, headers = {}) =>
    app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie, origin: ORIGIN, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })
    )
  return { app, get, post, cookieFor }
}

async function seedStaff(pool, email, role) {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const workspace =
    (await pool.query("select id from workspace where kind = 'tracy_admin' limit 1")).rows[0]?.id ??
    (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [workspace, account, role]
  )
}

/** One signal row, at a Vietnam wall-clock time on an October 2026 day. */
async function signal(pool, kind, vnDay, vnTime, data = {}, siteKey = null, email = null) {
  let accountId = null
  if (email) {
    accountId = (
      await pool.query(
        `insert into account (email, beta_admission) values ($1, $2)
         on conflict (email) do update set email = excluded.email returning id`,
        [email, data.source ? { badge: 'gate off', plans: [], source: data.source } : null]
      )
    ).rows[0].id
  }
  await pool.query(
    'insert into ops_signal (kind, account_id, site_key, data, occurred_at) values ($1,$2,$3,$4,$5)',
    [
      kind,
      accountId,
      siteKey,
      { ...data, ...(email ? { email } : {}) },
      new Date(`2026-10-${vnDay}T${vnTime}:00+07:00`)
    ]
  )
}

// ── the fold ────────────────────────────────────────────────────────────────────────────────

test('stuckState: failures count up while open; build, delete or a hand close it; reopen opens it again', () => {
  const at = (h) => new Date(`2026-10-08T0${h}:00:00Z`)
  const stuck = (h) => ({
    kind: 'site.stuck',
    data: { step: 'build', reason: 'X', platform: 'joomla' },
    occurred_at: at(h)
  })
  assert.equal(stuckState([]), null)
  assert.equal(stuckState([{ kind: 'site.result', data: { outcome: 'done' }, occurred_at: at(1) }]), null)
  const three = stuckState([stuck(1), stuck(2), stuck(3)])
  assert.equal(three.open, true)
  assert.equal(three.times, 3)
  assert.deepEqual(three.firstAt, at(1))
  const built = stuckState([stuck(1), { kind: 'site.result', data: { outcome: 'done' }, occurred_at: at(2) }])
  assert.equal(built.open, false)
  assert.equal(built.closed.how, 'built')
  const exported = stuckState([
    stuck(1),
    { kind: 'site.result', data: { outcome: 'exported' }, occurred_at: at(2) }
  ])
  assert.equal(exported.open, true, 'only outcome done closes a row')
  const handled = stuckState([stuck(1), { kind: 'ops.handled', data: { by: 'a@x' }, occurred_at: at(2) }])
  assert.deepEqual(handled.closed, { how: 'handled', at: at(2), by: 'a@x' })
  const reopened = stuckState([
    stuck(1),
    { kind: 'ops.handled', data: {}, occurred_at: at(2) },
    { kind: 'ops.reopened', data: {}, occurred_at: at(3) }
  ])
  assert.equal(reopened.open, true)
  assert.equal(reopened.times, 1)
  const again = stuckState([stuck(1), { kind: 'site.delete', data: {}, occurred_at: at(2) }, stuck(3)])
  assert.equal(again.open, true)
  assert.equal(again.times, 1, 'a failure after a close starts a new run')
  assert.deepEqual(again.firstAt, at(3))
})

test('S01: import stages retain their operation; unfamiliar failures are not silently builds', () => {
  const failure = (step) => stuckState([{ kind: 'site.stuck', data: { step }, occurred_at: new Date(NOW) }])
  for (const step of [
    'import',
    'signing_in',
    'installing',
    'reading_content',
    'reading_files',
    'handing_over'
  ])
    assert.equal(failure(step).last.operation, 'import', step)
  assert.equal(failure('build').last.operation, 'build')
  assert.equal(failure('unrecognized').last.operation, 'unknown')
})

// ── signals ─────────────────────────────────────────────────────────────────────────────────

test(
  'signals: by day in Vietnam time, by source with other and none, totals against the window before',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const cookie = await h.cookieFor('dev@tracy.test')
    // Today (08/10, VN) and yesterday, inside a 7-day window.
    await signal(
      pool,
      'account.first_sign_in',
      '08',
      '09:00',
      {
        badge: 'JoomlArt member',
        via: 'email code',
        source: { source: 'joomlart', medium: 'email', campaign: 'c', content: 'members-cta' }
      },
      null,
      'a@x.test'
    )
    await signal(
      pool,
      'account.first_sign_in',
      '08',
      '00:30',
      { badge: 'gate off', via: 'Google', source: { medium: 'blog' } },
      null,
      'b@x.test'
    )
    await signal(
      pool,
      'account.first_sign_in',
      '07',
      '23:59',
      { badge: 'gate off', via: 'email code' },
      null,
      'c@x.test'
    )
    await signal(
      pool,
      'account.first_sign_in',
      '07',
      '12:00',
      { badge: 'gate off', via: 'email code', source: { medium: 'made-up' } },
      null,
      'd@x.test'
    )
    await signal(pool, 'site.create', '08', '09:10', { platform: 'joomla' }, 'one.tracy.test')
    await signal(pool, 'site.import', '07', '10:00', { platform: 'wordpress' }, 'two.tracy.test')
    await signal(pool, 'site.stuck', '08', '09:20', { step: 'build', reason: 'R' }, 'one.tracy.test')
    await signal(pool, 'site.stuck', '08', '09:25', { step: 'build', reason: 'R' }, 'one.tracy.test')
    await signal(pool, 'beta.waitlist', '08', '08:00', { via: 'email code' })
    await signal(pool, 'discord.linked', '08', '10:00', { discord_id: '1' }, null, 'a@x.test')
    await signal(pool, 'discord.linked', '07', '10:00', { discord_id: '2' }, null, 'b@x.test')
    await signal(
      pool,
      'discord.bug_report',
      '08',
      '11:00',
      { discord_id: '1', thread_id: '9' },
      null,
      'a@x.test'
    )
    await signal(pool, 'discord.left', '08', '12:00', { discord_id: '2' }, null, 'b@x.test')
    // The window before (7 days earlier): one sign-in.
    await signal(
      pool,
      'account.first_sign_in',
      '01',
      '10:00',
      { badge: 'gate off', source: { medium: 'email' } },
      null,
      'e@x.test'
    )
    // Older than both windows: ignored.
    await signal(pool, 'account.first_sign_in', '0'.concat('1'), '00:00', {}, null, null)

    const res = await h.get('/api/ops/beta/signals?days=7', cookie)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.days, 7)
    assert.deepEqual(body.sources, [
      'email',
      'blog',
      'demo',
      'site',
      'forum',
      'product-page',
      'helpdesk',
      'social',
      'video',
      'owned',
      'other',
      'none'
    ])
    assert.equal(body.totals.newUsers, 4)
    assert.deepEqual(body.totals.bySource, {
      email: 1,
      blog: 1,
      demo: 0,
      site: 0,
      forum: 0,
      'product-page': 0,
      helpdesk: 0,
      social: 0,
      video: 0,
      owned: 0,
      other: 1,
      none: 1
    })
    assert.equal(body.totals.created, 1)
    assert.equal(body.totals.imported, 1)
    assert.equal(body.totals.stuck, 1, 'stuck counts sites, not attempts')
    assert.equal(body.totals.waitlist, 1)
    assert.equal(body.totals.discordLinked, 2)
    assert.equal(body.totals.discordBugs, 1, 'leaving the server is not counted')
    assert.equal(body.previous.discordLinked, 0)
    assert.equal(
      body.previous.newUsers,
      2,
      'the 01/10 sign-in and the bare one at 01/10 00:00 are in the window before'
    )
    assert.equal(body.byDay.length, 7)
    assert.equal(body.byDay[0].day, '2026-10-08')
    assert.equal(body.byDay[0].newUsers, 2, '00:30 Vietnam time is still the 8th')
    assert.equal(body.byDay[0].stuck, 2)
    assert.equal(body.byDay[0].discordLinked, 1)
    assert.equal(body.byDay[0].discordBugs, 1)
    assert.equal(body.byDay[1].discordLinked, 1)
    assert.equal(body.byDay[1].day, '2026-10-07')
    assert.equal(body.byDay[1].newUsers, 2)
    assert.equal(body.byDay.at(-1).day, '2026-10-02')
    assert.equal(body.latest[0].email, 'a@x.test')
    assert.deepEqual(body.latest[0].source, {
      source: 'joomlart',
      medium: 'email',
      campaign: 'c',
      content: 'members-cta'
    })
    assert.equal(body.latest[0].badge, 'JoomlArt member')
    assert.equal(body.latest.at(-1).email, 'd@x.test')
    assert.equal(body.latest.find((r) => r.email === 'c@x.test').source, null)
  }
)

test(
  'signals: any window other than 7, 14 or 30 reads as 14; nobody but staff gets an answer',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const cookie = await h.cookieFor('dev@tracy.test')
    for (const asked of ['', '3', '30.5', 'abc', '365']) {
      assert.equal(
        (await (await h.get(`/api/ops/beta/signals?days=${asked}`, cookie)).json()).days,
        14,
        asked
      )
    }
    assert.equal((await (await h.get('/api/ops/beta/signals?days=30', cookie)).json()).byDay.length, 30)
    const outsider = await h.cookieFor('stranger@x.test')
    const refused = await h.get('/api/ops/beta/signals', outsider)
    assert.equal(refused.status, 403)
    assert.equal(await refused.text(), '')
    assert.equal((await h.get('/api/ops/beta/signals')).status, 302)
  }
)

// ── customers ───────────────────────────────────────────────────────────────────────────────

test('customerSite: a build that ends done is built; a later failure is stuck; exported is not an end', () => {
  const at = (h) => new Date(`2026-10-08T0${h}:00:00Z`)
  const imported = [
    { kind: 'site.import', data: { platform: 'joomla' }, occurred_at: at(1) },
    { kind: 'site.result', data: { outcome: 'exported' }, occurred_at: at(2) }
  ]
  assert.deepEqual(customerSite('a.test', imported), {
    siteKey: 'a.test',
    kind: 'imported',
    platform: 'joomla',
    startedAt: at(1).toISOString(),
    state: 'pending',
    failures: 0,
    live: false
  })
  const built = customerSite('a.test', [
    ...imported,
    { kind: 'site.stuck', data: {}, occurred_at: at(3) },
    { kind: 'site.result', data: { outcome: 'done' }, occurred_at: at(4) },
    { kind: 'site.go_live', data: {}, occurred_at: at(5) }
  ])
  assert.equal(built.state, 'built')
  assert.equal(built.failures, 1)
  assert.equal(built.live, true)
  const created = customerSite('b.test', [
    { kind: 'site.create', data: { platform: 'wordpress' }, occurred_at: at(1) },
    { kind: 'site.stuck', data: {}, occurred_at: at(2) },
    { kind: 'site.stuck', data: {}, occurred_at: at(3) }
  ])
  assert.equal(created.kind, 'created')
  assert.equal(created.state, 'stuck')
  assert.equal(created.failures, 2)
  assert.equal(
    customerSite('c.test', [
      { kind: 'site.create', data: {}, occurred_at: at(1) },
      { kind: 'site.delete', data: {}, occurred_at: at(2) }
    ]).state,
    'deleted'
  )
})

test(
  'customers: one row per new customer with sites, requests, agent changes and active days; staff and demo left out',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const cookie = await h.cookieFor('dev@tracy.test')

    const source = { source: 'joomlart', medium: 'email', content: 'ceo-invite-g1' }
    await signal(
      pool,
      'account.first_sign_in',
      '07',
      '09:00',
      { badge: 'gate off', source },
      null,
      'a@x.test'
    )
    // The registry exists when history is recorded, so the snapshot proves its classification.
    await pool.query(`insert into site (site_key, label, host, platform, demo, created_at) values
       ('shop.example', 'shop', 'demo', 'joomla', false, '2026-10-07T02:10:00Z'),
       ('demo.tracy.test', 'demo', 'demo', 'joomla', true, '2026-10-07T02:10:00Z')`)
    await signal(pool, 'site.import', '07', '09:10', { platform: 'joomla' }, 'shop.example', 'a@x.test')
    await signal(pool, 'site.stuck', '07', '09:11', { step: 'installing' }, 'shop.example', 'a@x.test')
    // A result signalled without an account still lands on the site.
    await signal(pool, 'site.result', '07', '09:20', { outcome: 'done' }, 'shop.example')
    await signal(pool, 'site.go_live', '07', '11:00', { domain: 'shop.example' }, 'shop.example')
    for (const action of ['content.update', 'content.update', 'content.delete'])
      await signal(pool, 'site.edit', '07', '10:00', { action, ok: true }, 'shop.example', 'a@x.test')
    await signal(
      pool,
      'site.edit',
      '07',
      '10:05',
      { action: 'content.update', ok: false },
      'shop.example',
      'a@x.test'
    )
    await signal(pool, 'site.undo', '07', '10:06', { moment: 'm', ok: true }, 'shop.example', 'a@x.test')
    const turn = (id, site, actor, at) =>
      pool.query(
        `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, state, opened_at)
         values ($1, $2, split_part($1, ':', 1), split_part($1, ':', 2)::int, $3, 'x', 'panel', 'closed', $4)`,
        [id, site, actor, at]
      )
    await turn('s1:1', 'shop.example', 'a@x.test', '2026-10-07T03:00:00Z')
    await turn('s1:2', 'shop.example', 'A@x.test', '2026-10-08T01:00:00Z')
    await turn('s2:1', 'demo.tracy.test', 'a@x.test', '2026-10-08T01:30:00Z')
    const a = (await pool.query(`select id from account where email = 'a@x.test'`)).rows[0].id
    await pool.query(
      `insert into ops_active_day (account_id, day) values ($1, '2026-10-08'), ($1, '2026-10-07')`,
      [a]
    )

    // Signed in, nothing else.
    await signal(pool, 'account.first_sign_in', '08', '08:00', { badge: 'gate off' }, null, 'b@x.test')
    // Staff and a sign-in before the window are left out.
    await signal(pool, 'account.first_sign_in', '08', '08:30', {}, null, 'dev@tracy.test')
    await signal(pool, 'account.first_sign_in', '01', '08:00', {}, null, 'old@x.test')

    const res = await h.get('/api/ops/beta/customers?days=7', cookie)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.days, 7)
    assert.equal(body.total, 2)
    assert.deepEqual(
      body.rows.map((r) => r.email),
      ['b@x.test', 'a@x.test']
    )
    const [b, row] = body.rows
    assert.deepEqual(b.sites, [])
    assert.equal(b.requests, 0)
    assert.deepEqual(b.activeDays, [])
    assert.equal(row.badge, 'gate off')
    assert.deepEqual(row.source, source)
    assert.deepEqual(row.sites, [
      {
        siteKey: 'shop.example',
        kind: 'imported',
        platform: 'joomla',
        startedAt: '2026-10-07T02:10:00.000Z',
        state: 'built',
        failures: 1,
        live: true
      }
    ])
    assert.equal(row.requests, 2, 'the demo site turn is left out; the actor matches case-blind')
    assert.equal(row.lastRequestAt, '2026-10-08T01:00:00.000Z')
    assert.deepEqual(row.edits, {
      done: 3,
      failed: 1,
      editUnknown: 0,
      undone: 1,
      undoFailed: 0,
      undoUnknown: 0,
      actions: { 'content.update': 3, 'content.delete': 1 }
    })
    assert.deepEqual(row.activeDays, ['2026-10-07', '2026-10-08'])
    assert.equal(row.tokens, null)
    assert.deepEqual(row.tokenCoverage, { measuredTurns: 0, partialTurns: 0 })
    await pool.query(`update site_turn set token_usage = $1::jsonb where turn_id in ('s1:1', 's2:1')`, [
      JSON.stringify({ version: 1, totalTokens: 650, missing: 1 })
    ])
    const measured = (await (await h.get('/api/ops/beta/customers?days=7', cookie)).json()).rows.find(
      (r) => r.email === 'a@x.test'
    )
    assert.equal(
      measured.tokens,
      650,
      'demo usage is excluded, recorded usage stays visible despite an unmeasured turn'
    )
    assert.deepEqual(measured.tokenCoverage, { measuredTurns: 1, partialTurns: 1 })
    assert.equal(JSON.stringify(body).includes('"title"'), false, 'never the words of a request')
  }
)

test('customers: any other window reads as 14; nobody but staff gets an answer', opts, async () => {
  const { pool } = db
  const h = harness(pool)
  await seedStaff(pool, 'dev@tracy.test', 'developer')
  const cookie = await h.cookieFor('dev@tracy.test')
  const body = await (await h.get('/api/ops/beta/customers?days=5', cookie)).json()
  assert.equal(body.days, 14)
  assert.deepEqual(body.rows, [])
  const refused = await h.get('/api/ops/beta/customers', await h.cookieFor('stranger@x.test'))
  assert.equal(refused.status, 403)
  assert.equal((await h.get('/api/ops/beta/customers')).status, 302)
})

// ── stuck ───────────────────────────────────────────────────────────────────────────────────

test(
  'stuck: open rows newest first with customer, plans and source; closed today listed with how',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const cookie = await h.cookieFor('dev@tracy.test')
    const plans = [{ id: '10', name: 'JA Template', until: '2027-03-14' }]
    await signal(
      pool,
      'site.stuck',
      '08',
      '06:00',
      {
        step: 'build',
        reason: 'QUICKSTART_UNREACHABLE',
        platform: 'wordpress',
        plans,
        source: { medium: 'email' }
      },
      'mara.tracy.test',
      'mara@x.test'
    )
    await signal(
      pool,
      'site.stuck',
      '08',
      '08:00',
      { step: 'build', reason: 'QUICKSTART_UNREACHABLE', platform: 'wordpress' },
      'mara.tracy.test',
      'mara@x.test'
    )
    await signal(
      pool,
      'site.stuck',
      '08',
      '09:00',
      { step: 'import', reason: 'IMPORT_FAILED', platform: 'joomla' },
      'www.example.net',
      'studio@x.test'
    )
    await signal(
      pool,
      'site.stuck',
      '08',
      '07:00',
      { step: 'build', reason: 'R', platform: 'joomla' },
      'fixed.tracy.test',
      'f@x.test'
    )
    await signal(pool, 'site.result', '08', '07:30', { outcome: 'done' }, 'fixed.tracy.test')
    await signal(
      pool,
      'site.stuck',
      '06',
      '07:00',
      { step: 'build', reason: 'R', platform: 'joomla' },
      'old.tracy.test',
      'o@x.test'
    )
    await signal(pool, 'site.delete', '06', '08:00', { platform: 'joomla' }, 'old.tracy.test')
    // S02: an unresolved case does not expire when its last failure gets old.
    await pool.query(
      "insert into ops_signal (kind, site_key, data, occurred_at) values ('site.stuck','ancient.tracy.test','{}', '2026-08-01T00:00:00Z')"
    )

    const body = await (await h.get('/api/ops/beta/stuck', cookie)).json()
    assert.equal(body.count, 3)
    assert.equal(body.writable, false)
    assert.deepEqual(
      body.open.map((r) => r.siteKey),
      ['www.example.net', 'mara.tracy.test', 'ancient.tracy.test']
    )
    const mara = body.open[1]
    assert.equal(mara.email, 'mara@x.test')
    assert.equal(mara.times, 2)
    assert.equal(mara.reason, 'QUICKSTART_UNREACHABLE')
    assert.equal(mara.platform, 'wordpress')
    assert.deepEqual(mara.plans, plans)
    assert.deepEqual(mara.source, { medium: 'email' })
    assert.equal(mara.firstAt, new Date('2026-10-08T06:00:00+07:00').toISOString())
    assert.deepEqual(
      body.handledToday.map((r) => [r.siteKey, r.closed.how]),
      [['fixed.tracy.test', 'built']]
    )
  }
)

test(
  'stuck: an owner closes a row by hand and opens it again; a developer, another origin or a stale press cannot',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    const owner = await h.cookieFor('owner@tracy.test')
    const dev = await h.cookieFor('dev@tracy.test')
    await signal(
      pool,
      'site.stuck',
      '08',
      '06:00',
      { step: 'build', reason: 'R', platform: 'joomla' },
      'mara.tracy.test',
      'mara@x.test'
    )

    assert.equal(
      (await h.post('/api/ops/beta/stuck/handled', dev, { siteKey: 'mara.tracy.test' })).status,
      403
    )
    assert.equal(
      (
        await h.post(
          '/api/ops/beta/stuck/handled',
          owner,
          { siteKey: 'mara.tracy.test' },
          { origin: 'https://evil.test' }
        )
      ).status,
      403
    )
    // A body that is not JSON is refused by the app-wide request guard (`lib/csrf.js`) before the door.
    assert.equal(
      (
        await h.post(
          '/api/ops/beta/stuck/handled',
          owner,
          { siteKey: 'mara.tracy.test' },
          { 'content-type': 'text/plain' }
        )
      ).status,
      415
    )
    assert.equal(
      (await h.post('/api/ops/beta/stuck/handled', owner, { siteKey: 'nobody.tracy.test' })).status,
      404
    )
    assert.equal(
      (await h.post('/api/ops/beta/stuck/handled', owner, { siteKey: 'mara.tracy.test', reopen: true }))
        .status,
      409
    )

    const closed = await h.post('/api/ops/beta/stuck/handled', owner, { siteKey: 'mara.tracy.test' })
    assert.equal(closed.status, 200)
    const [row] = (
      await pool.query("select data, site_key, telegram_required from ops_signal where kind = 'ops.handled'")
    ).rows
    assert.equal(row.site_key, 'mara.tracy.test')
    assert.equal(row.data.by, 'owner@tracy.test')
    assert.equal(row.data.of, 'site.stuck')
    assert.equal(row.data.since, new Date('2026-10-08T06:00:00+07:00').toISOString())
    assert.equal(row.telegram_required, false)
    const after = await (await h.get('/api/ops/beta/stuck', owner)).json()
    assert.equal(after.count, 0)
    assert.equal(after.writable, true)
    assert.deepEqual(
      after.handledToday.map((r) => [r.siteKey, r.closed.how, r.closed.by]),
      [['mara.tracy.test', 'handled', 'owner@tracy.test']]
    )
    assert.equal(
      (await h.post('/api/ops/beta/stuck/handled', owner, { siteKey: 'mara.tracy.test' })).status,
      409,
      'a second press changes nothing'
    )

    assert.equal(
      (await h.post('/api/ops/beta/stuck/handled', owner, { siteKey: 'mara.tracy.test', reopen: true }))
        .status,
      200
    )
    const reopened = await (await h.get('/api/ops/beta/stuck', owner)).json()
    assert.equal(reopened.count, 1)
    assert.equal(reopened.open[0].times, 1)
  }
)

// ── waitlist ────────────────────────────────────────────────────────────────────────────────

/** A turned-away sign-in: the signal `lib/beta-login.js` records, with no account behind it. */
async function turnedAway(pool, email, vnDay, vnTime, via = 'email code', month = '10') {
  await pool.query("insert into ops_signal (kind, data, occurred_at) values ('beta.waitlist', $1, $2)", [
    { email, via },
    new Date(`2026-${month}-${vnDay}T${vnTime}:00+07:00`)
  ])
}

test(
  'waitlist: one row per address, turned away and the form joined, newest first; staff only',
  opts,
  async () => {
    const { pool } = db
    const h = harness(pool)
    await seedStaff(pool, 'dev@tracy.test', 'developer')
    // a: turned away twice, the last time by Google; sent the form back in August.
    await turnedAway(pool, 'a@x.test', '02', '09:00')
    await turnedAway(pool, 'a@x.test', '07', '20:00', 'google')
    await pool.query(
      `insert into beta_waitlist (email, name, website, platforms, role, site_count, created_at, updated_at)
       values ('a@x.test', 'Ann', 'https://a.example/', '["WordPress"]', 'own', 'one', $1, $1)`,
      [new Date('2026-08-01T10:00:00+07:00')]
    )
    // b: turned away, then sent the form; the confirmation went out.
    await turnedAway(pool, 'b@x.test', '06', '20:00')
    await pool.query(
      `insert into beta_waitlist (email, name, website, platforms, role, site_count, source, created_at, updated_at)
       values ('b@x.test', 'Bo', null, '["Joomla","EmDash"]', 'clients', '2-10',
               '{"source":"pricing","content":"plan-card"}', $1, $1)`,
      [new Date('2026-10-06T21:00:00+07:00')]
    )
    await pool.query(
      `insert into whitelist_confirmation (email, payload, status, created_at, sent_at)
       values ('b@x.test', '{}', 'sent', $1, $1)`,
      [new Date('2026-10-06T21:00:00+07:00')]
    )
    // c: a form sent before its answers were kept: only the confirmation row knows it.
    await pool.query(
      `insert into whitelist_confirmation (email, payload, status, created_at) values ('c@x.test', '{}', 'queued', $1)`,
      [new Date('2026-10-05T08:00:00+07:00')]
    )
    // f: a form WordPress held back (its daily cap): kept with `deliver: false`, no mail asked yet.
    await pool.query(
      `insert into beta_waitlist (email, name, website, platforms, role, site_count, created_at, updated_at)
       values ('f@x.test', 'Fay', null, '["Other"]', 'own', 'none', $1, $1)`,
      [new Date('2026-10-04T09:00:00+07:00')]
    )
    // e: turned away, then came in another way and signed in.
    await turnedAway(pool, 'e@x.test', '03', '11:00')
    await signal(
      pool,
      'account.first_sign_in',
      '04',
      '12:00',
      { badge: 'seat invite', via: 'email code' },
      null,
      'e@x.test'
    )
    // d: turned away before the 30-day window.
    await turnedAway(pool, 'd@x.test', '01', '09:00', 'email code', '09')

    const cookie = await h.cookieFor('dev@tracy.test')
    const res = await h.get('/api/ops/beta/waitlist', cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = await res.json()
    assert.equal(body.days, 30)
    assert.deepEqual(
      body.rows.map((r) => r.email),
      ['a@x.test', 'b@x.test', 'c@x.test', 'f@x.test', 'e@x.test']
    )
    assert.deepEqual(body.totals, { people: 5, turnedAway: 3, form: 4, both: 2, signedIn: 1 })
    const [a, b, c, f, e] = body.rows
    assert.deepEqual(a.turnedAway, {
      times: 2,
      firstAt: '2026-10-02T02:00:00.000Z',
      lastAt: '2026-10-07T13:00:00.000Z',
      via: 'google'
    })
    assert.equal(a.form.name, 'Ann')
    assert.equal(a.form.at, '2026-08-01T03:00:00.000Z')
    assert.equal(a.confirmation, null)
    assert.equal(a.signedInAt, null)
    assert.deepEqual(b.form.platforms, ['Joomla', 'EmDash'])
    assert.equal(b.form.role, 'clients')
    assert.equal(b.form.siteCount, '2-10')
    assert.equal(b.confirmation.status, 'sent')
    assert.deepEqual(b.form.source, { source: 'pricing', content: 'plan-card' })
    assert.equal(a.form.source, null)
    assert.equal(f.form.name, 'Fay')
    assert.equal(f.confirmation, null)
    assert.equal(c.turnedAway, null)
    assert.equal(c.form.name, null)
    assert.equal(c.form.at, '2026-10-05T01:00:00.000Z')
    assert.equal(c.confirmation.status, 'queued')
    assert.equal(e.form, null)
    assert.equal(e.signedInAt, '2026-10-04T05:00:00.000Z')

    // Seven days start on 02/10: a stays (its last refusal is inside), nothing older joins.
    const week = await (await h.get('/api/ops/beta/waitlist?days=7', cookie)).json()
    assert.equal(week.days, 7)
    assert.equal(week.rows.length, 5)
    assert.equal((await (await h.get('/api/ops/beta/waitlist?days=abc', cookie)).json()).days, 30)

    const refused = await h.get('/api/ops/beta/waitlist', await h.cookieFor('stranger@x.test'))
    assert.equal(refused.status, 403)
    assert.equal(await refused.text(), '')
    assert.equal((await h.get('/api/ops/beta/waitlist')).status, 302)
  }
)

test('waitlist: nobody in the window answers an empty list', opts, async () => {
  const { pool } = db
  const h = harness(pool)
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const body = await (
    await h.get('/api/ops/beta/waitlist?days=7', await h.cookieFor('owner@tracy.test'))
  ).json()
  assert.deepEqual(body.totals, { people: 0, turnedAway: 0, form: 0, both: 0, signedIn: 0 })
  assert.deepEqual(body.rows, [])
})
