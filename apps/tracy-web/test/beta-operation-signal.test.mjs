import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { validateWaitlist } from '../src/beta/route.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { memoryIdentityStore, pgIdentityStore } from '../src/identity/store.js'
import { createBetaAccess, parseAccess, vietnamDay, withDeadline } from '../src/lib/beta-access.js'
import { fallbackHashes } from '../src/lib/beta-fallback.js'
import { signBetaToken, verifyBetaToken } from '../src/lib/beta-token.js'
import { sha256Hex } from '../src/lib/hmac.js'
import * as accepted from '../src/lib/import-diagnostic.js'
import { createOpsSignal, signalText } from '../src/lib/ops-signal.js'
import { mintSession } from '../src/lib/session.js'
import { putJob, updateJob } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: !process.env.TEST_DATABASE_URL }
const clock = Date.parse('2026-10-01T02:00:00Z')
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  BETA_GATE: 'on',
  AMEMBER_API_KEY: 'dedicated-test-key',
  BETA_WAITLIST_URL: 'https://landing.test/early-access/',
  TRACY_ENVIRONMENT: 'dev'
}
const quiet = { warn() {}, log() {}, error() {} }
const config = (extra = {}) => readConfig({ ...env, ...extra })
const member = { ok: true, user_id: 12, subscriptions: { 10: '2027-03-14', 18: '2099-12-31' } }
function harness(body = member, extra = {}) {
  const sent = []
  const calls = []
  const identity = pgIdentityStore(db.pool)
  const fetchImpl = async (url, opts) => {
    calls.push({ url: new URL(url), opts })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'text/html' } })
  }
  const app = buildApp({
    config: config(extra),
    identity,
    host: { hostCall, hostJob },
    pool: db.pool,
    now: () => clock,
    signalNow: () => clock,
    mail: {
      send: async (letter) => {
        sent.push(letter)
      }
    },
    fetchImpl,
    log: quiet
  })
  const post = (path, data, headers = {}) =>
    app.fetch(
      new Request(`${env.TRACY_ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(data)
      })
    )
  return { app, identity, sent, calls, post }
}

test('aMember parser excludes only 18/19/35, accepts unknown eligible products, rejects malformed dates', () => {
  assert.deepEqual(
    parseAccess(
      {
        ok: true,
        user_id: 1,
        subscriptions: {
          10: '2027-03-14',
          18: '2099-12-31',
          19: '2099-12-31',
          35: '2099-12-31',
          999: '2026-10-01',
          30: '2026-10-01',
          31: '2026-10-01',
          28: '2026-10-01'
        }
      },
      '2026-10-01'
    ).plans.map((p) => p.id),
    ['10', '28', '30', '31', '999']
  )
  assert.equal(
    parseAccess({ ok: true, subscriptions: { 999: '2026-10-01' } }, '2026-10-01').plans[0].name,
    'plan #999'
  )
  assert.equal(parseAccess({ ok: true, subscriptions: { 10: '2026-02-30' } }, '2026-10-01').status, 'error')
  assert.equal(
    parseAccess({ ok: true, subscriptions: { 10: '2026-09-30' } }, '2026-10-01').status,
    'waitlist'
  )
  assert.equal(parseAccess({ ok: true, subscriptions: [] }, '2026-10-01').status, 'waitlist')
  assert.equal(parseAccess({ ok: false, code: -1, msg: 'Failure' }, '2026-10-01').status, 'waitlist')
  for (const body of [
    null,
    { ok: true },
    { ok: true, subscriptions: [1] },
    { ok: false, message: 'API Error 10002' },
    { ok: false, code: 17 },
    { ok: true, subscriptions: { 10: 'invalid' } }
  ])
    assert.equal(parseAccess(body, '2026-10-01').status, 'error')
})

test('an import diagnostic keeps only values from closed sets, the same ones the worker writes', async () => {
  const { importDiagnostic } = accepted
  assert.deepEqual(
    importDiagnostic({
      at: 'login_post',
      check: 'forbidden',
      status: 403,
      path: '/administrator/index.php',
      error: 'ECONNRESET'
    }),
    {
      at: 'login_post',
      check: 'forbidden',
      status: 403,
      path: '/administrator/index.php',
      error: 'ECONNRESET'
    }
  )
  // Well-formed is not enough: a renamed admin folder or a password shaped like a code.
  assert.deepEqual(
    importDiagnostic({
      at: 'login_page',
      check: 'admin_gate',
      path: '/administrator/secret123',
      error: 'hunter2'
    }),
    { at: 'login_page', check: 'admin_gate', error: 'other' }
  )
  assert.equal(importDiagnostic({ at: 'hunter2', check: 'admin_gate' }), undefined)
  assert.equal(importDiagnostic({ at: 'login_page', check: 'hunter2' }), undefined)
  assert.equal(importDiagnostic({ at: 'login_page', check: 'admin_gate', status: 1e9 }).status, undefined)
  // The lists are copied (tracy-web imports no Tracy package); a value one side lacks is dropped.
  const worker = await import('../../../packages/site/tracy-add-site/src/host/diagnostic.mjs')
  const pairs = {
    steps: [accepted.DIAGNOSTIC_STEPS, worker.DIAGNOSTIC_STEPS],
    checks: [accepted.DIAGNOSTIC_CHECKS, worker.DIAGNOSTIC_CHECKS],
    paths: [accepted.DIAGNOSTIC_PATHS, worker.DIAGNOSTIC_PATHS],
    errors: [accepted.DIAGNOSTIC_ERRORS, worker.DIAGNOSTIC_ERRORS],
    roads: [accepted.DIAGNOSTIC_ROADS, worker.DIAGNOSTIC_ROADS],
    causes: [accepted.DIAGNOSTIC_CAUSES, worker.DIAGNOSTIC_CAUSES],
    limits: [accepted.DIAGNOSTIC_LIMITS, worker.DIAGNOSTIC_LIMITS],
    signIns: [accepted.DIAGNOSTIC_SIGN_INS, worker.DIAGNOSTIC_SIGN_INS],
    actions: [accepted.DIAGNOSTIC_ACTIONS, worker.DIAGNOSTIC_ACTIONS],
    answers: [accepted.DIAGNOSTIC_ANSWERS, worker.DIAGNOSTIC_ANSWERS],
    engineErrors: [accepted.DIAGNOSTIC_ENGINE_ERRORS, worker.DIAGNOSTIC_ENGINE_ERRORS]
  }
  for (const [name, [web, host]] of Object.entries(pairs))
    assert.deepEqual([...web].sort(), [...host].sort(), name)
})

test('a call_failed diagnostic keeps the engine call, what came back and the engine code, from closed sets', () => {
  const { importDiagnostic } = accepted
  assert.deepEqual(
    importDiagnostic({
      at: 'export',
      check: 'no_engine_reply',
      status: 200,
      action: 'db.dump',
      answer: 'php_notice'
    }),
    { at: 'export', check: 'no_engine_reply', status: 200, action: 'db.dump', answer: 'php_notice' }
  )
  // a value outside the lists is dropped, an engine code outside them is `other`
  assert.deepEqual(
    importDiagnostic({
      at: 'export',
      check: 'engine_refused',
      action: '/home/u1/secret',
      answer: '<html>',
      engine_error: 'hunter2'
    }),
    { at: 'export', check: 'engine_refused', engine_error: 'other' }
  )
  const text = signalText(
    {
      kind: 'site.stuck',
      site_key: 'import.localhost',
      data: {
        step: 'reading_content',
        reason: 'call_failed',
        platform: 'wordpress',
        detail: {
          at: 'export',
          check: 'no_engine_reply',
          status: 200,
          action: 'db.dump',
          answer: 'php_notice'
        }
      }
    },
    'DEV'
  )
  assert.match(text, /\nWhere: export\/no_engine_reply · HTTP 200 · db\.dump · answered php_notice$/)
})

test('an install diagnostic keeps each road and the PHP limits, from closed sets, and the alert shows them', () => {
  const { importDiagnostic } = accepted
  const MB = 1024 * 1024
  // What the worker sends for the Joomla 6.1.3 host with 128M memory and 8M upload limits.
  const sent = {
    at: 'upload_install',
    check: 'over_limit',
    roads: {
      url_install: { post_status: 500, result_status: 200 },
      upload_install: { cause: 'over_limit' }
    },
    php_limits: { memory_limit: 128 * MB, upload_max_filesize: 8 * MB, post_max_size: 8 * MB },
    package_bytes: 60 * MB
  }
  assert.deepEqual(importDiagnostic(sent), sent)
  // Anything outside the closed sets is dropped: page text, a road or limit of another name, a
  // cause shaped like one, an error message, a status out of range.
  assert.deepEqual(
    importDiagnostic({
      at: 'url_install',
      check: 'memory_exhausted',
      status: 500,
      roads: {
        url_install: {
          post_status: 500,
          cause: 'memory_exhausted',
          error: 'Allowed memory size of 134217728 bytes exhausted',
          body: '<b>Fatal error</b>'
        },
        upload_install: { post_status: 9000, cause: '<html>' },
        phpinfo: { post_status: 200 }
      },
      php_limits: { memory_limit: -1, post_max_size: '8M', disable_functions: 1, upload_max_filesize: 1.5 },
      package_bytes: -4,
      server: '10.0.0.4'
    }),
    {
      at: 'url_install',
      check: 'memory_exhausted',
      status: 500,
      roads: { url_install: { post_status: 500, cause: 'memory_exhausted', error: 'other' } },
      php_limits: { memory_limit: -1 }
    }
  )
  const text = signalText(
    {
      kind: 'site.stuck',
      site_key: 'import.localhost',
      data: { step: 'installing', reason: 'upload_too_large', platform: 'joomla', detail: sent }
    },
    'DEV'
  )
  assert.match(
    text,
    /\nWhere: upload_install\/over_limit\nRoads: url_install POST 500 → page 200 · upload_install over_limit\nSizes: memory_limit 128 MB · upload_max_filesize 8 MB · post_max_size 8 MB · package 60 MB$/
  )
})

test('a refused sign-in keeps whether the username was an email and how the run came in, never the username', () => {
  const { importDiagnostic, importSignIn } = accepted
  const sent = { at: 'login_landing', check: 'invalid_credential', username_is_email: true }
  assert.deepEqual(importDiagnostic(sent), sent)
  assert.deepEqual(
    importDiagnostic({ at: 'login_post', check: 'invalid_credential', username_is_email: false }),
    {
      at: 'login_post',
      check: 'invalid_credential',
      username_is_email: false
    }
  )
  // Only a boolean survives; the value typed, or anything shaped like it, is dropped. `sign_in` is
  // the result's own field, never part of the diagnostic.
  assert.deepEqual(
    importDiagnostic({
      at: 'login_landing',
      check: 'invalid_credential',
      username_is_email: 'owner@example.com',
      username: 'owner@example.com',
      sign_in: 'password'
    }),
    { at: 'login_landing', check: 'invalid_credential' }
  )
  for (const way of ['password', 'code', 'saved']) assert.equal(importSignIn(way), way)
  for (const way of ['hunter2', 'owner@example.com', true, undefined, null])
    assert.equal(importSignIn(way), undefined, String(way))
  const stuck = (data) =>
    signalText(
      { kind: 'site.stuck', site_key: 'import.localhost', data: { step: 'signing_in', ...data } },
      'DEV'
    )
  const text = stuck({ reason: 'invalid_credential', platform: 'joomla', sign_in: 'password', detail: sent })
  assert.match(
    text,
    /\nWhere: login_landing\/invalid_credential\nSign-in: password · username is an email address$/
  )
  assert.doesNotMatch(text, /@/)
  // No diagnostic: the alert still says how the run came in, and invents no Where line.
  const bare = stuck({ reason: 'call_failed', platform: 'wordpress', sign_in: 'code' })
  assert.match(bare, /\nReason: call_failed\nSign-in: code$/)
  assert.doesNotMatch(bare, /Where:/)
  // A row from an older worker, or with a way outside the set, prints neither line.
  assert.match(stuck({ reason: 'call_failed', platform: 'wordpress' }), /\nReason: call_failed$/)
  assert.match(
    stuck({ reason: 'call_failed', platform: 'wordpress', sign_in: 'hunter2' }),
    /\nReason: call_failed$/
  )
})

test('legacy gate config cannot restrict sign-in and permits Telegram to be absent', () => {
  assert.equal(config({ AMEMBER_API_KEY: '' }).beta.enabled, false)
  assert.equal(config().beta.enabled, false)
  assert.throws(() => config({ BETA_GATE: 'false' }), /BETA_GATE/)
  assert.throws(() => config({ AMEMBER_API_URL: 'http://api.test' }), /HTTPS/)
  assert.equal(config({ BETA_GATE: 'off', AMEMBER_API_KEY: '' }).beta.enabled, false)
  assert.equal(config().telegram.token, null)
  assert.equal(config().beta.waitlistMode, 'wordpress')
  assert.equal(config({ BETA_WAITLIST_URL: '' }).beta.waitlistUrl, 'https://tracy.ai/whitelist/')
  assert.throws(() => config({ BETA_WAITLIST_MODE: 'other' }), /BETA_WAITLIST_MODE/)
  assert.throws(() => config({ TELEGRAM_THREAD_ID: '0' }), /topic ID/)
})

test('deadline bounds a fetch that ignores AbortSignal', async () => {
  await assert.rejects(
    withDeadline(() => new Promise(() => {}), 15),
    /TIMEOUT/
  )
})

test('waitlist tokens are purpose-bound, tamper-resistant, expiring and clock-injected', async () => {
  const token = await signBetaToken('person@example.com', env.SESSION_SECRET, clock)
  assert.equal(await verifyBetaToken(token, env.SESSION_SECRET, clock), 'person@example.com')
  assert.equal(await verifyBetaToken(`${token}x`, env.SESSION_SECRET, clock), null)
  assert.equal(await verifyBetaToken(token, 'other-secret', clock), null)
  assert.equal(await verifyBetaToken(token, env.SESSION_SECRET, clock + 7 * 86400_000), null)
  assert.equal(await verifyBetaToken('v1.invalid', env.SESSION_SECRET, clock), null)
})

test('fallback importer validates the complete export before replacing any list', async () => {
  const hashes = await fallbackHashes(
    [
      { email: ' Person@Example.com ', subscriptions: { 10: '2027-01-01' } },
      { email: 'person@example.com', subscriptions: { 10: '2027-01-01' } },
      { email: 'legacy@example.com', subscriptions: { 18: '2099-12-31' } }
    ],
    '2026-10-01'
  )
  assert.deepEqual(hashes, [await sha256Hex('person@example.com')])
  await assert.rejects(fallbackHashes([{ email: 'bad', subscriptions: {} }], '2026-10-01'), /invalid email/)
  await assert.rejects(
    fallbackHashes([{ email: 'legacy@example.com', subscriptions: { 18: '2099-12-31' } }], '2026-10-01'),
    /no eligible/
  )
})

test('form validates enums and optional website without silently accepting unsupported schemes', () => {
  const body = {
    name: 'Visitor',
    website: 'example.com',
    platforms: ['Joomla'],
    role: 'own',
    site_count: 'none'
  }
  assert.equal(validateWaitlist(body).website, 'https://example.com/')
  assert.equal(validateWaitlist({ ...body, website: '' }).website, null)
  for (const change of [
    { platforms: [] },
    { platforms: ['Shopify'] },
    { name: '' },
    { role: 'admin' },
    { site_count: 'lots' },
    { website: 'javascript:alert(1)' },
    { website: 'https://user:pass@example.com' }
  ])
    assert.equal(validateWaitlist({ ...body, ...change }), null)
})

// Sign-in is public (15/10/2026): asking for a code queues no membership check and nobody is refused.
// The one membership lookup at verify only LABELS a JoomlArt member for /ops (19/10/2026), and its
// cached answer serves the next sign-in, so a member costs one call however often they sign in.
test(
  'public email sign-in: no queued check, one cached lookup labels the member, one first-sign-in signal',
  pgOnly,
  async () => {
    const h = harness()
    assert.deepEqual(await (await h.post('/login', { email: 'Person@Example.com' })).json(), { ok: true })
    await h.app.betaLogin.drain()
    assert.equal(h.sent.length, 1)
    assert.equal(h.calls.length, 0)
    const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
    const results = await Promise.all([
      h.post('/verify', { email: 'person@example.com', code }),
      h.post('/verify', { email: 'person@example.com', code })
    ])
    assert.ok(results.some((r) => r.status === 200))
    const events = (await db.pool.query("select * from ops_signal where kind = 'account.first_sign_in'")).rows
    assert.equal(events.length, 1)
    assert.equal(events[0].data.badge, 'JoomlArt member')
    assert.deepEqual(
      events[0].data.plans.map((p) => p.id),
      ['10']
    )
    assert.ok(!JSON.stringify(events).includes(code))
    await h.post('/login', { email: 'person@example.com' })
    await h.app.betaLogin.drain()
    const again = h.sent.at(-1).text.match(/\b\d{6}\b/)[0]
    assert.equal((await h.post('/verify', { email: 'person@example.com', code: again })).status, 200)
    assert.equal(
      Number(
        (await db.pool.query("select count(*) as n from ops_signal where kind = 'account.first_sign_in'"))
          .rows[0].n
      ),
      1
    )
    assert.equal(h.calls.length, 1)
  }
)

test('non-members receive an OTP and sign in without a whitelist submission', pgOnly, async () => {
  for (const mode of ['wordpress', 'tracy']) {
    const h = harness({ ok: true, subscriptions: [] }, { BETA_WAITLIST_MODE: mode, AMEMBER_API_KEY: '' })
    const email = `${mode}@example.com`
    assert.deepEqual(await (await h.post('/login', { email })).json(), { ok: true })
    const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
    assert.equal((await h.post('/verify', { email, code })).status, 200)
    assert.ok(await h.identity.accountByEmail(email))
    assert.equal(h.calls.length, 0)
    assert.equal((await db.pool.query('select count(*)::int as n from beta_waitlist')).rows[0].n, 0)
    assert.equal(
      (await db.pool.query("select count(*)::int as n from ops_signal where kind='beta.waitlist'")).rows[0].n,
      0
    )
    await h.app.betaLogin.stop()
  }
})

test(
  'cache lasts 10 minutes, coalesces concurrent requests, and rechecks dates across midnight VN',
  pgOnly,
  async () => {
    let time = Date.parse('2026-10-01T16:59:00Z')
    let calls = 0
    const access = createBetaAccess({
      config: { ...config(), beta: { ...config().beta, enabled: true } },
      pool: db.pool,
      identity: memoryIdentityStore(),
      now: () => time,
      log: quiet,
      fetchImpl: async () => {
        calls++
        await new Promise((r) => setTimeout(r, 10))
        return Response.json({ ok: true, subscriptions: { 10: '2026-10-01' } })
      }
    })
    const answers = await Promise.all(Array.from({ length: 10 }, () => access.decide('person@example.com')))
    assert.ok(answers.every((a) => a.status === 'allow'))
    assert.equal(calls, 1)
    time += 120000
    assert.equal(vietnamDay(time), '2026-10-02')
    assert.equal((await access.decide('person@example.com')).status, 'waitlist')
    assert.equal(calls, 1)
    time += 10 * 60000
    await access.decide('person@example.com')
    assert.equal(calls, 2)
  }
)

test('a sign-in whose cache read returns after another finished the call does not call the API again', async () => {
  // The order a loaded runner produced (12/10/2026): B starts its read of the cache table while A is
  // calling the API, and that read returns only after A finished, with what the table held BEFORE A
  // wrote: nothing. B must take A's answer instead of calling a second time.
  let calls = 0
  let selects = 0
  /** @type {() => void} */
  let firstDone = () => {}
  const aFinished = new Promise((resolve) => (firstDone = resolve))
  /** @type {() => void} */
  let bReading = () => {}
  const bAsked = new Promise((resolve) => (bReading = resolve))
  const pool = {
    async query(sql) {
      if (!sql.trim().startsWith('select result')) return { rows: [], rowCount: 0 }
      selects++
      if (selects === 2) {
        bReading()
        await aFinished
      }
      return { rows: [], rowCount: 0 }
    }
  }
  const access = createBetaAccess({
    config: { ...config(), beta: { ...config().beta, enabled: true } },
    pool,
    identity: memoryIdentityStore(),
    now: () => Date.parse('2026-10-01T10:00:00Z'),
    log: quiet,
    fetchImpl: async () => {
      calls++
      // A answers only once B is already waiting on its read: B looked at the memory cache before A wrote it.
      if (calls === 1) await bAsked
      return Response.json({ ok: true, subscriptions: { 10: '2026-10-01' } })
    }
  })
  const both = [access.decide('person@example.com'), access.decide('person@example.com')]
  // Either sign-in may be the one held; the other one finishing first is the order that matters.
  assert.equal((await Promise.race(both)).status, 'allow')
  firstDone()
  for (const answer of await Promise.all(both)) assert.equal(answer.status, 'allow')
  assert.equal(calls, 1)
})

test(
  'API configuration/network failure uses fallback only on error; errors are not cached',
  pgOnly,
  async () => {
    const email = 'person@example.com'
    await db.pool.query('insert into beta_fallback (email_hash,source_day) values ($1,$2)', [
      await sha256Hex(email),
      '2026-09-28'
    ])
    let body = { ok: false, message: 'API Error 10002 - invalid key' }
    let calls = 0
    const access = createBetaAccess({
      config: { ...config(), beta: { ...config().beta, enabled: true } },
      pool: db.pool,
      identity: memoryIdentityStore(),
      now: () => clock,
      signalNow: () => clock,
      log: quiet,
      fetchImpl: async () => {
        calls++
        return Response.json(body)
      }
    })
    assert.equal((await access.decide(email)).badge, 'fallback list')
    assert.equal((await access.decide('other@example.com')).status, 'unavailable')
    assert.equal((await access.decide(email)).badge, 'fallback list')
    assert.equal(calls, 3)
    body = { ok: true, subscriptions: [] }
    assert.equal((await access.decide(email)).status, 'waitlist')
  }
)

test(
  'seat-invite account with null last_seen_at is first sign-in; public sign-in does not grant a site seat',
  pgOnly,
  async () => {
    const h = harness({ ok: true, subscriptions: [] })
    const owner = (
      await db.pool.query("insert into account (email) values ('owner@example.com') returning id")
    ).rows[0].id
    const person = (
      await db.pool.query("insert into account (email) values ('person@example.com') returning id")
    ).rows[0].id
    await db.pool.query(
      "insert into site (site_key,label,host,platform,origin,created_by) values ('invite.localhost','invite','local','wordpress','fleet_born',$1)",
      [owner]
    )
    await db.pool.query(
      "insert into seat (site_key,account_id,role) values ('invite.localhost',$1,'editor')",
      [person]
    )
    await h.post('/login', { email: 'person@example.com' })
    await h.app.betaLogin.drain()
    assert.equal(h.calls.length, 0)
    const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
    assert.equal((await h.post('/verify', { email: 'person@example.com', code })).status, 200)
    const event = (await db.pool.query("select data from ops_signal where kind = 'account.first_sign_in'"))
      .rows[0]
    assert.equal(event.data.badge, 'gate off')
    assert.deepEqual(event.data.plans, [])
    await db.pool.query("insert into account (email) values ('revoked@example.com')")
    assert.equal((await h.app.betaLogin.access.decide('revoked@example.com')).status, 'allow')
  }
)

test('first-sign-in and primary identity survive an analytics-table failure', pgOnly, async () => {
  const h = harness(member, { BETA_GATE: 'off', AMEMBER_API_KEY: '' })
  await db.pool.query('alter table ops_signal rename to ops_signal_disabled')
  try {
    await h.post('/login', { email: 'person@example.com' })
    const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
    assert.equal((await h.post('/verify', { email: 'person@example.com', code })).status, 200)
    assert.ok((await h.identity.accountByEmail('person@example.com')).lastSeenAt)
  } finally {
    await db.pool.query('alter table ops_signal_disabled rename to ops_signal')
  }
})

test(
  'waitlist form: CORS, cookie independence, token-bound email, retry updates one submission',
  pgOnly,
  async () => {
    const h = harness()
    const token = await signBetaToken('person@example.com', env.SESSION_SECRET, clock)
    const cookie = `tracy_sess=${await mintSession('someone-else@example.com', env.SESSION_SECRET, clock)}`
    const headers = {
      origin: 'https://landing.test',
      authorization: `Bearer ${token}`,
      cookie,
      'sec-fetch-site': 'same-site'
    }
    const data = {
      email: 'forged@example.com',
      name: 'Visitor',
      platforms: ['WordPress'],
      role: 'clients',
      site_count: '2-10',
      website: 'example.com'
    }
    const reply = await h.post('/api/beta/waitlist', data, headers)
    assert.equal(reply.status, 200)
    assert.equal(reply.headers.get('access-control-allow-origin'), 'https://landing.test')
    assert.equal(reply.headers.get('access-control-allow-credentials'), null)
    assert.equal((await h.post('/api/beta/waitlist', { ...data, name: 'Updated' }, headers)).status, 200)
    assert.deepEqual((await db.pool.query('select email,name from beta_waitlist')).rows, [
      { email: 'person@example.com', name: 'Updated' }
    ])
    assert.equal(
      (await h.post('/api/beta/waitlist', data, { ...headers, origin: 'https://evil.test' })).status,
      403
    )
    assert.equal(
      (await h.post('/api/beta/waitlist', data, { ...headers, authorization: 'Bearer bad' })).status,
      401
    )
    assert.equal((await h.post('/api/beta/waitlist', { ...data, platforms: [] }, headers)).status, 400)
  }
)

test('active day is unique for 50 page loads and matches the VN calendar', pgOnly, async () => {
  const h = harness(member, { BETA_GATE: 'off' })
  await h.identity.touchAccount('person@example.com')
  const cookie = `tracy_sess=${await mintSession('person@example.com', env.SESSION_SECRET, clock)}`
  await Promise.all(
    Array.from({ length: 50 }, () =>
      h.app.fetch(new Request(`${env.TRACY_ORIGIN}/auth/me`, { headers: { cookie } }))
    )
  )
  assert.equal((await db.pool.query('select day from ops_active_day')).rowCount, 1)
})

test(
  'Telegram transient failure remains queued; second worker/restart retries once without leaking token',
  pgOnly,
  async () => {
    let success = false
    const outgoing = []
    const conf = config({
      TELEGRAM_BOT_TOKEN: 'telegram-secret',
      TELEGRAM_CHAT_ID: '-1001',
      TELEGRAM_THREAD_ID: '12',
      ALERT_LABEL: 'DEV'
    })
    const fetchImpl = async (_url, opts) => {
      outgoing.push(JSON.parse(opts.body))
      return Response.json(
        success
          ? { ok: true }
          : { ok: false, parameters: { retry_after: 30 }, description: 'secret must not be stored' },
        { status: success ? 200 : 429 }
      )
    }
    const signal = createOpsSignal({ pool: db.pool, config: conf, fetchImpl, log: quiet })
    await signal.record('site.create', {
      email: 'person@example.com',
      siteKey: 'test.localhost',
      data: { platform: 'WordPress', token: 'forbidden', code: '123456', source: 'cold' },
      dedupeKey: 'created'
    })
    await Promise.all([signal.flush(), signal.flush()])
    assert.equal(outgoing.length, 1)
    let row = (await db.pool.query('select * from ops_signal')).rows[0]
    assert.equal(row.telegram_sent_at, null)
    assert.equal(row.telegram_error, 'HTTP_429_TELEGRAM')
    assert.ok(!JSON.stringify(row).includes('secret'))
    assert.equal(row.data.token, undefined)
    assert.equal(row.data.code, undefined)
    success = true
    await db.pool.query('update ops_signal set next_at = now()')
    const restarted = createOpsSignal({ pool: db.pool, config: conf, fetchImpl, log: quiet })
    await restarted.flush()
    row = (await db.pool.query('select * from ops_signal')).rows[0]
    assert.ok(row.telegram_sent_at)
    assert.equal(outgoing.length, 2)
    assert.equal(outgoing[0].message_thread_id, 12)
    assert.match(outgoing[0].text, /\[DEV\]/)
  }
)

test(
  'three failures persist three attempts, notify once, and recovery opens the next episode',
  pgOnly,
  async () => {
    const signal = createOpsSignal({ pool: db.pool, config: config(), log: quiet })
    for (let i = 0; i < 3; i++)
      await signal.record('site.stuck', {
        siteKey: 'test.localhost',
        data: { reason: 'SYSTEM_ERROR' },
        dedupeKey: `failure:${i}`
      })
    assert.equal(
      Number((await db.pool.query('select count(*) as n from ops_signal where telegram_required')).rows[0].n),
      1
    )
    await signal.record('site.stuck', {
      siteKey: 'test.localhost',
      data: { reason: 'SYSTEM_ERROR' },
      dedupeKey: 'failure:0'
    })
    assert.equal(Number((await db.pool.query('select count(*) as n from ops_signal')).rows[0].n), 3)
    await signal.record('site.result', { siteKey: 'test.localhost', data: { outcome: 'done' } })
    await signal.record('site.stuck', {
      siteKey: 'test.localhost',
      data: { reason: 'SYSTEM_ERROR' },
      dedupeKey: 'failure:new'
    })
    assert.equal(
      Number((await db.pool.query('select count(*) as n from ops_signal where telegram_required')).rows[0].n),
      2
    )
  }
)

test(
  'daily uses VN yesterday, survives staggered replicas/restart, and excludes export-only results',
  pgOnly,
  async () => {
    const signal = createOpsSignal({
      pool: db.pool,
      config: config(),
      now: () => clock,
      signalNow: () => clock,
      log: quiet
    })
    await db.pool.query(
      "insert into ops_signal(kind,data,occurred_at) values ('site.create','{}','2026-09-29T17:00:00Z'), ('site.result','{\"outcome\":\"exported\"}','2026-09-30T10:00:00Z'), ('site.result','{\"outcome\":\"done\"}','2026-09-30T11:00:00Z'), ('site.create','{}','2026-09-30T17:00:00Z')"
    )
    await signal.daily()
    const restarted = createOpsSignal({
      pool: db.pool,
      config: config(),
      now: () => clock,
      signalNow: () => clock,
      log: quiet
    })
    await restarted.daily()
    await Promise.all([signal.daily(), restarted.daily()])
    const rows = (await db.pool.query("select data from ops_signal where kind = 'ops.daily'")).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].data.day, '2026-09-30')
    assert.equal(rows[0].data.counts['site.create'], 1)
    assert.equal(rows[0].data.counts['site.result'], 1)
    assert.match(signalText({ kind: 'ops.daily', data: rows[0].data }, 'PROD'), /\[PROD\]/)
  }
)

test(
  'provision job terminal result is recorded once; unowned/demo jobs do not generate analytics',
  pgOnly,
  async () => {
    const h = harness(member, { BETA_GATE: 'off' })
    const actor = await h.identity.touchAccount('person@example.com')
    await db.pool.query(
      "insert into site (site_key,label,host,platform,origin,created_by) values ('copy.localhost','copy','local','wordpress','migrated',$1), ('demo.localhost','demo','local','wordpress','fleet_born',null)",
      [actor.id]
    )
    await putJob(db.pool, { id: 'owned', siteKey: 'copy.localhost', host: 'local', kind: 'provision' })
    await updateJob(db.pool, 'owned', { state: 'done' })
    await updateJob(db.pool, 'owned', { state: 'done' })
    await putJob(db.pool, { id: 'demo', siteKey: 'demo.localhost', host: 'local', kind: 'provision' })
    await updateJob(db.pool, 'demo', { state: 'done' })
    assert.equal((await db.pool.query("select * from ops_signal where kind = 'site.result'")).rowCount, 1)
  }
)

test(
  'S-B1: persisted same-email jobs retain both blocked decisions and drain independently',
  pgOnly,
  async () => {
    const h = harness({ ok: true, subscriptions: [] })
    // Public sign-in currently admits everybody; exercise the retained beta refusal worker.
    let release
    const ready = new Promise((resolve) => {
      release = resolve
    })
    h.app.betaLogin.access.decide = async () => {
      await ready
      return { status: 'waitlist' }
    }
    try {
      for (const via of ['email code', 'Google']) await h.app.betaLogin.enqueue('blocked@example.com', via)
      assert.equal((await db.pool.query('select 1 from beta_login_job')).rowCount, 2)
      assert.equal((await db.pool.query('select 1 from beta_login_latest')).rowCount, 1)
      const draining = h.app.betaLogin.drain()
      release()
      await draining
      await h.app.betaLogin.drain()
      assert.equal((await db.pool.query('select 1 from beta_login_job')).rowCount, 0)
      const blocked = (await db.pool.query("select data from ops_signal where kind = 'beta.waitlist'")).rows
      assert.equal(blocked.length, 2)
      assert.deepEqual(blocked.map((row) => row.data.via).sort(), ['Google', 'email code'])
      assert.equal(h.sent.length, 1, 'separate decision records keep the existing mail cap')
    } finally {
      release()
      await h.app.betaLogin.stop()
    }
  }
)

test(
  'S-B1: persisted older retry cannot replace the latest allowed code after its job completed',
  pgOnly,
  async () => {
    const h = harness()
    const old = crypto.randomUUID()
    const latest = crypto.randomUUID()
    try {
      await db.pool.query(
        `insert into beta_login_job(email,request_id,via,expires_at,next_at,error)
       values ('person@example.com',$1,'email code',now()+interval '10 minutes',now()+interval '30 seconds','DELIVERY_FAILED'),
              ('person@example.com',$2,'email code',now()+interval '10 minutes',now(),null)`,
        [old, latest]
      )
      await db.pool.query(
        `insert into beta_login_latest(email,request_id,expires_at)
       values ('person@example.com',$1,now()+interval '10 minutes'),
              ('expired@example.com',$2,now()-interval '1 second')`,
        [latest, crypto.randomUUID()]
      )
      await h.app.betaLogin.drain()
      assert.equal(h.sent.length, 1, 'the latest request sent its code and completed')
      assert.equal(
        (await db.pool.query('select 1 from beta_login_job where request_id=$1', [latest])).rowCount,
        0
      )
      assert.equal(
        (await db.pool.query("select 1 from beta_login_latest where email='expired@example.com'")).rowCount,
        0
      )
      await db.pool.query('update beta_login_job set next_at=now() where request_id=$1', [old])
      await h.app.betaLogin.drain()
      assert.equal(h.sent.length, 1, 'a durable latest marker suppresses the older delivery retry')
      assert.equal((await db.pool.query('select 1 from beta_login_job')).rowCount, 0)
    } finally {
      await h.app.betaLogin.stop()
    }
  }
)

test('a persisted login job is recovered by a newly built app', pgOnly, async () => {
  await db.pool.query(
    "insert into beta_login_job(email,request_id,via,expires_at) values ('person@example.com',$1,'email code',now()+interval '10 minutes')",
    [crypto.randomUUID()]
  )
  const h = harness()
  await h.app.betaLogin.drain()
  assert.equal(h.sent.length, 1)
  assert.equal((await db.pool.query('select 1 from beta_login_job')).rowCount, 0)
})

test('Google callback admits non-members and records the provider once', pgOnly, async () => {
  for (const allowed of [false, true]) {
    await db.reset()
    const cfg = config({ GOOGLE_OAUTH_CLIENT_ID: 'test-id', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' })
    const identity = pgIdentityStore(db.pool)
    const claims = Buffer.from(
      JSON.stringify({ email: 'google@example.com', email_verified: true, sub: 'google-1' })
    ).toString('base64url')
    const app = buildApp({
      config: cfg,
      identity,
      pool: db.pool,
      now: () => clock,
      signalNow: () => clock,
      log: quiet,
      mail: { send: async () => {} },
      fetchImpl: async (input) => {
        if (new URL(input).hostname === 'oauth2.googleapis.com')
          return Response.json({ id_token: `e30.${claims}.sig`, access_token: 'provider-secret' })
        return Response.json(allowed ? member : { ok: true, subscriptions: [] })
      }
    })
    const started = await app.fetch(new Request(`${env.TRACY_ORIGIN}/signin/google`))
    const state = new URL(started.headers.get('location')).searchParams.get('state')
    const callback = await app.fetch(
      new Request(`${env.TRACY_ORIGIN}/signin/google/callback?state=${state}&code=mock`, {
        headers: { cookie: started.headers.get('set-cookie').split(';')[0] }
      })
    )
    assert.equal(callback.status, 302)
    assert.ok(callback.headers.getSetCookie().some((c) => c.startsWith('tracy_sess=v1.')))
    assert.ok(await identity.accountByEmail('google@example.com'))
    const events = (await db.pool.query("select data from ops_signal where kind = 'account.first_sign_in'"))
      .rows
    assert.equal(events.length, 1)
    assert.equal(events[0].data.via, 'Google')
    // Admitted either way; the membership lookup only labels a member for /ops.
    assert.equal(events[0].data.badge, allowed ? 'JoomlArt member' : 'gate off')
    await app.betaLogin.stop()
  }
})

test('public sign-in rate cap stops additional deliveries and returns 429', pgOnly, async () => {
  const h = harness()
  for (let i = 0; i < 7; i++) {
    const response = await h.post('/login', { email: 'limited@example.com' })
    assert.equal(response.status, i < 5 ? 200 : 429)
    await h.app.betaLogin.drain()
  }
  assert.equal(h.sent.length, 5)
  await h.app.betaLogin.stop()
})

test(
  'import callback deduplicates, ignores user credential errors and retries database failures',
  pgOnly,
  async () => {
    const h = harness()
    const email = 'importer@example.com'
    await h.identity.touchAccount(email)
    await db.pool.query(
      "insert into site (site_key,label,host,origin,created_by) values ('import.localhost','import','local','migrated',(select id from account where email=$1))",
      [email]
    )
    await db.pool.query(
      "insert into seat (account_id,site_key,role,accepted_at) values ((select id from account where email=$1),'import.localhost','owner',now())",
      [email]
    )
    // Minted at the real time, not the fixed `clock`: this door verifies the session against the
    // wall clock, so a session minted at `clock` expired for good 72 hours after that date
    // (04/10/2026 02:00 UTC — every run after it answered 401).
    const cookie = `tracy_sess=${await mintSession(email, env.SESSION_SECRET)}`
    const headers = { cookie, origin: env.TRACY_ORIGIN }
    const result = { run_id: crypto.randomUUID(), state: 'done', step: 'handing_over', seconds: 14 }
    assert.equal((await h.post('/api/sites/import.localhost/import-result', result, headers)).status, 200)
    assert.equal((await h.post('/api/sites/import.localhost/import-result', result, headers)).status, 200)
    assert.equal(
      (await db.pool.query("select count(*)::int as n from ops_signal where kind='site.result'")).rows[0].n,
      1
    )
    assert.equal(
      (
        await h.post(
          '/api/sites/import.localhost/import-result',
          { ...result, run_id: crypto.randomUUID(), state: 'error', reason: 'credentials_required' },
          headers
        )
      ).status,
      200
    )
    assert.equal(
      (await db.pool.query("select count(*)::int as n from ops_signal where kind='site.stuck'")).rows[0].n,
      0
    )
    const legacyFailure = {
      ...result,
      run_id: 'muqo145i6qa75r',
      state: 'error',
      reason: 'unreachable',
      step: 'installing',
      platform: 'joomla',
      // The worker's diagnostic is kept only as values from closed sets: a well-formed path or
      // error code that is not on the list may be the secret itself, so it is dropped or `other`.
      detail: {
        at: 'install_page',
        check: 'joomla_denied',
        status: 403,
        path: '/administrator/secret123',
        error: 'hunter2',
        cookie: 'joomla_user_state=logged_in'
      }
    }
    assert.equal(
      (await h.post('/api/sites/import.localhost/import-result', legacyFailure, headers)).status,
      200
    )
    assert.equal(
      (await h.post('/api/sites/import.localhost/import-result', legacyFailure, headers)).status,
      200
    )
    const stuck = await db.pool.query("select data from ops_signal where kind='site.stuck'")
    assert.equal(stuck.rows.length, 1)
    assert.equal(stuck.rows[0].data.reason, 'unreachable')
    // The alert names the platform; it was blank on the first production import (12/10/2026).
    assert.equal(stuck.rows[0].data.platform, 'joomla')
    assert.deepEqual(stuck.rows[0].data.detail, {
      at: 'install_page',
      check: 'joomla_denied',
      status: 403,
      error: 'other'
    })
    assert.match(
      signalText({ kind: 'site.stuck', site_key: 'import.localhost', data: stuck.rows[0].data }, 'DEV'),
      /\nWhere: install_page\/joomla_denied · HTTP 403 · other$/
    )
    // The alert reads only accepted values, even from a row written before the closed sets.
    const oldRow = {
      ...stuck.rows[0].data,
      detail: { at: 'login_post', check: 'forbidden', path: '/administrator/secret123', error: 'hunter2' }
    }
    const oldText = signalText({ kind: 'site.stuck', site_key: 'import.localhost', data: oldRow }, 'DEV')
    assert.match(oldText, /\nWhere: login_post\/forbidden · other$/)
    assert.equal(/secret123|hunter2/.test(oldText), false)
    // A run that signed in and failed later with no diagnostic: the row keeps how it came in, and
    // no detail is made up for it.
    const noDiagnostic = {
      ...result,
      run_id: crypto.randomUUID(),
      state: 'error',
      reason: 'call_failed',
      step: 'reading_content',
      platform: 'wordpress',
      sign_in: 'password'
    }
    assert.equal(
      (await h.post('/api/sites/import.localhost/import-result', noDiagnostic, headers)).status,
      200
    )
    const bare = (
      await db.pool.query("select data from ops_signal where kind='site.stuck' and data->>'attempt' = $1", [
        noDiagnostic.run_id
      ])
    ).rows[0].data
    assert.equal(bare.sign_in, 'password')
    assert.equal('detail' in bare, false)
    const bareText = signalText({ kind: 'site.stuck', site_key: 'import.localhost', data: bare }, 'DEV')
    assert.match(bareText, /\nReason: call_failed\nSign-in: password$/)
    // A way outside the closed set is dropped, never stored.
    const unknownWay = { ...noDiagnostic, run_id: crypto.randomUUID(), sign_in: 'hunter2' }
    assert.equal((await h.post('/api/sites/import.localhost/import-result', unknownWay, headers)).status, 200)
    const odd = (
      await db.pool.query("select data from ops_signal where kind='site.stuck' and data->>'attempt' = $1", [
        unknownWay.run_id
      ])
    ).rows[0].data
    assert.equal('sign_in' in odd, false)
    // A finished run keeps it too.
    const finished = { ...result, run_id: crypto.randomUUID(), sign_in: 'saved' }
    assert.equal((await h.post('/api/sites/import.localhost/import-result', finished, headers)).status, 200)
    const done = await db.pool.query(
      "select data from ops_signal where kind='site.result' and data->>'attempt' = $1",
      [finished.run_id]
    )
    assert.equal(done.rows[0].data.sign_in, 'saved')
    await db.pool.query('alter table ops_signal rename to ops_signal_temporarily_unavailable')
    try {
      assert.ok(
        (
          await h.post(
            '/api/sites/import.localhost/import-result',
            { ...result, run_id: crypto.randomUUID() },
            headers
          )
        ).status >= 500
      )
    } finally {
      await db.pool.query('alter table ops_signal_temporarily_unavailable rename to ops_signal')
    }
    await h.app.betaLogin.stop()
  }
)

test('a Telegram request that ignores cancellation times out without blocking sign-in', pgOnly, async () => {
  const h = harness()
  const signal = createOpsSignal({
    pool: db.pool,
    config: config({ TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_CHAT_ID: '-1001', TELEGRAM_THREAD_ID: '12' }),
    log: quiet,
    fetchImpl: async () => new Promise(() => {})
  })
  await signal.record('site.import', {
    siteKey: 'timeout.example.com',
    email: 'person@example.com',
    data: { platform: 'joomla' }
  })
  const sending = signal.flush()
  const begun = Date.now()
  await h.post('/login', { email: 'person@example.com' })
  await h.app.betaLogin.drain()
  const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
  assert.equal((await h.post('/verify', { email: 'person@example.com', code })).status, 200)
  assert.ok(Date.now() - begun < 1500)
  await sending
  const event = (
    await db.pool.query("select telegram_error,telegram_sent_at from ops_signal where kind='site.import'")
  ).rows[0]
  assert.equal(event.telegram_sent_at, null)
  assert.equal(event.telegram_error, 'NETWORK_OR_TIMEOUT')
  await h.app.betaLogin.stop()
})

test('two beta workers lease disjoint batches with four concurrent checks each', pgOnly, async () => {
  const one = harness()
  const two = harness()
  const entered = []
  let release
  const barrier = new Promise((resolve) => {
    release = resolve
  })
  const decide = async (email) => {
    entered.push(email)
    await barrier
    return { status: 'allow', badge: 'JoomlArt member', plans: [], gate: true }
  }
  one.app.betaLogin.access.decide = decide
  two.app.betaLogin.access.decide = decide
  for (let i = 0; i < 8; i++)
    await db.pool.query(
      "insert into beta_login_job (email,request_id,via,expires_at) values ($1,$2,'email code',now()+interval '10 minutes')",
      [`batch${i}@example.com`, crypto.randomUUID()]
    )
  const working = Promise.all([one.app.betaLogin.drain(), two.app.betaLogin.drain()])
  try {
    await withDeadline(async () => {
      while (entered.length < 8) await new Promise((r) => setTimeout(r, 5))
    }, 1000)
    assert.equal(new Set(entered).size, 8)
  } finally {
    release()
    await working
  }
  assert.equal(one.sent.length, 4)
  assert.equal(two.sent.length, 4)
  assert.equal((await db.pool.query('select count(*)::int as n from beta_login_job')).rows[0].n, 0)
  await one.app.betaLogin.stop()
  await two.app.betaLogin.stop()
})

test(
  'gate off: a member signing in by email code is let in and labelled with their plans',
  pgOnly,
  async () => {
    const h = harness(member, { BETA_GATE: 'off' })
    assert.equal((await h.post('/login', { email: 'person@example.com' })).status, 200)
    const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
    assert.equal((await h.post('/verify', { email: 'person@example.com', code })).status, 200)
    const event = (await db.pool.query("select data from ops_signal where kind = 'account.first_sign_in'"))
      .rows[0]
    assert.equal(event.data.badge, 'JoomlArt member')
    assert.deepEqual(
      event.data.plans.map((p) => p.id),
      ['10']
    )
    assert.equal(h.calls.length, 1)
  }
)

test('gate off: no plan, or a membership call that fails, still signs in as "gate off"', pgOnly, async () => {
  for (const [body, lookup] of [
    [{ ok: true, subscriptions: [] }, undefined],
    [{ message: 'API Error 10001' }, 'failed']
  ]) {
    await db.reset()
    const h = harness(body, { BETA_GATE: 'off' })
    await h.post('/login', { email: 'person@example.com' })
    const code = h.sent[0].text.match(/\b\d{6}\b/)[0]
    assert.equal((await h.post('/verify', { email: 'person@example.com', code })).status, 200)
    const account = (
      await db.pool.query("select beta_admission from account where email = 'person@example.com'")
    ).rows[0]
    assert.equal(account.beta_admission.badge, 'gate off')
    assert.deepEqual(account.beta_admission.plans, [])
    assert.equal(account.beta_admission.lookup, lookup)
  }
})
