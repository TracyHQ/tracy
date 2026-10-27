/**
 * The site-mail doors end to end through `buildApp`, on a real database: `POST /_site-mail`'s
 * every answer (disabled, token, draft, off, malformed, too large, limits, upstream, log mode), the
 * door staying off Tracy's public hostname, and the /ops and site-admin JSON the screens read.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { openSecret } from '../src/lib/secret-box.js'
import { siteMailToken } from '../src/mail/site-mail/token.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const baseEnv = {
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
/** The shim's address: tracy-web's static IP on the `tracy` network. */
const RELAY = 'http://172.30.0.10:8080/_site-mail'
const MAIL = [
  'To: "Buyer" <buyer@example.test>',
  'Bcc: owner@example.test',
  'From: "Lantern Shop" <shop@gmail.test>',
  'Subject: Your order',
  '',
  'Thanks!',
  ''
].join('\r\n')

function harness(pool, envOver = {}, siteMail = {}) {
  const config = readConfig({ ...baseEnv, ...envOver })
  const sent = []
  const logs = []
  const resendCalls = []
  const deps = {
    smtp: async (o) => {
      sent.push(o)
      if (siteMail.fail) throw new Error('535 authentication failed')
      return { reply: '250 queued' }
    },
    resolve: async () => ({ address: '203.0.113.7' }),
    resend: () => ({
      list: async () => {
        resendCalls.push('list')
        return []
      },
      create: async (name) => {
        resendCalls.push(`create ${name}`)
        return {
          id: 'd_1',
          name,
          status: 'not_started',
          records: [{ type: 'TXT', name: `resend._domainkey.${name}`, value: 'p=abc', status: 'not_started' }]
        }
      },
      verify: async (id) => {
        resendCalls.push(`verify ${id}`)
        return { id, name: 'shop.test', status: 'verified', records: [] }
      },
      get: async () => null,
      remove: async (id) => {
        resendCalls.push(`remove ${id}`)
        return true
      }
    }),
    log: { log: (s) => logs.push(s), warn: (s) => logs.push(s) }
  }
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async () => new Response('site proxy', { status: 502 }),
    siteMail: deps
  })
  const post = (label, body = MAIL, { token, url = RELAY, headers = {} } = {}) =>
    app.fetch(
      new Request(url, {
        method: 'POST',
        headers: {
          'x-tracy-site': label,
          'x-tracy-token': token ?? siteMailToken('h1', label),
          'content-type': 'message/rfc822',
          ...headers
        },
        body
      })
    )
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const call = (method, path, cookie, body) =>
    app.fetch(
      new Request(`https://cowork.tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'https://cowork.tracy.test',
          'content-type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  return { app, post, call, cookieFor, sent, logs, resendCalls, config }
}

async function site(pool, label, publish = 'published') {
  await pool.query('insert into site (site_key, label, host, publish) values ($1, $2, $3, $4)', [
    `${label}.tracy.test`,
    label,
    'prod1',
    publish
  ])
  return `${label}.tracy.test`
}
async function account(pool, email) {
  return (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
}
async function seat(pool, siteKey, email, role) {
  const id = await account(pool, email)
  await pool.query(
    'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
    [siteKey, id, role]
  )
}
async function staff(pool, email, role) {
  const id = await account(pool, email)
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
    )
  ).rows[0].id
  await pool.query(
    'insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
    [ws, id, role]
  )
}
const logRows = async (pool, siteKey) =>
  (
    await pool.query('select status, code from site_mail_log where site_key = $1 order by id', [siteKey])
  ).rows.map((r) => `${r.status}${r.code ? ` ${r.code}` : ''}`)

test(
  'POST /_site-mail: every refusal answers its code, and only a published site reaches the wire',
  opts,
  async () => {
    const { pool } = db
    const live = await site(pool, 'lantern')
    const draft = await site(pool, 'ember', 'draft')
    const h = harness(pool)

    // Token: wrong token, unknown site, token of another site, no header at all.
    assert.equal((await h.post('lantern', MAIL, { token: 'f'.repeat(64) })).status, 401)
    assert.deepEqual(await (await h.post('nobody')).json(), { code: 'SITE_MAIL_TOKEN' })
    assert.equal((await h.post('lantern', MAIL, { token: siteMailToken('h1', 'ember') })).status, 401)
    assert.equal((await h.post('lantern', MAIL, { token: '' })).status, 401)

    // Draft: refused, logged, never sent.
    const d = await h.post('ember')
    assert.equal(d.status, 403)
    assert.deepEqual(await d.json(), { code: 'SITE_MAIL_DRAFT' })
    assert.deepEqual(await logRows(pool, draft), ['refused SITE_MAIL_DRAFT'])

    // Published, mode tracy: 200, rewritten, through Resend's SMTP with the site key.
    const ok = await h.post('lantern')
    assert.equal(ok.status, 200)
    const body = await ok.json()
    assert.equal(body.ok, true)
    assert.match(body.id, /^\d+$/)
    assert.equal(h.sent.length, 1)
    const s = h.sent[0]
    assert.equal(s.host, 'smtp.resend.com')
    assert.equal(s.port, 465)
    assert.equal(s.tls, 'implicit')
    assert.equal(s.user, 'resend')
    assert.equal(s.pass, 're_site_key')
    assert.equal(s.from, 'lantern@sites.tracy.test')
    assert.deepEqual(s.to, ['buyer@example.test', 'owner@example.test'])
    const text = s.raw.toString('latin1')
    assert.match(text, /^From: "Lantern Shop" <lantern@sites\.tracy\.test>\r\n/m)
    assert.match(text, /^Reply-To: "Lantern Shop" <shop@gmail\.test>\r\n/m)
    assert.doesNotMatch(text, /^Bcc:/im)
    assert.ok(text.endsWith('\r\n\r\nThanks!\r\n'))
    assert.deepEqual(await logRows(pool, live), ['sent'])

    // Mode off and own-cms: refused before anything is read.
    await pool.query("insert into site_mail (site_key, mode) values ($1, 'off')", [live])
    assert.deepEqual(await (await h.post('lantern')).json(), { code: 'SITE_MAIL_OFF' })
    await pool.query("update site_mail set mode = 'own-cms' where site_key = $1", [live])
    assert.equal((await h.post('lantern')).status, 403)
    await pool.query("update site_mail set mode = 'tracy' where site_key = $1", [live])

    // Malformed and too large.
    const bad = await h.post('lantern', 'no separator here')
    assert.equal(bad.status, 400)
    assert.deepEqual(await bad.json(), { code: 'SITE_MAIL_MALFORMED' })
    assert.equal((await h.post('lantern', 'Subject: nobody\r\n\r\nbody')).status, 400)
    const huge = await h.post('lantern', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61))
    assert.equal(huge.status, 413)
    assert.equal(h.sent.length, 1, 'no refusal ever reached the wire')
  }
)

test('POST /_site-mail: feature off is 503; log mode logs instead of sending', opts, async () => {
  const { pool } = db
  const key = await site(pool, 'lantern')
  const off = harness(pool, { SITE_MAIL: 'off' })
  const r = await off.post('lantern')
  assert.equal(r.status, 503)
  assert.deepEqual(await r.json(), { code: 'SITE_MAIL_DISABLED' })

  const logged = harness(pool, { SITE_MAIL: 'log', SITE_MAIL_KEY: '' })
  const ok = await logged.post('lantern')
  assert.equal(ok.status, 200)
  assert.equal(logged.sent.length, 0)
  assert.equal(logged.logs.length, 1)
  assert.match(logged.logs[0], /log mode, not sent.*site=lantern.*to=buyer@example\.test,owner@example\.test/)
  assert.match(logged.logs[0], /From: "Lantern Shop" <lantern@sites\.tracy\.test>/)
  assert.doesNotMatch(logged.logs[0], /Thanks!/, 'the body stays out of the log')
  assert.deepEqual(await logRows(pool, key), ['logged'])
})

test('POST /_site-mail: upstream failure is 502 and a failed row', opts, async () => {
  const { pool } = db
  const key = await site(pool, 'lantern')
  const h = harness(pool, {}, { fail: true })
  const r = await h.post('lantern')
  assert.equal(r.status, 502)
  assert.deepEqual(await r.json(), { code: 'SITE_MAIL_UPSTREAM' })
  const row = (
    await pool.query('select status, upstream_error from site_mail_log where site_key = $1', [key])
  ).rows[0]
  assert.equal(row.status, 'failed')
  assert.match(row.upstream_error, /535/)
})

test(
  'limits: site hour, site day and global day refuse with 429 BEFORE any upstream call; own-smtp is exempt',
  opts,
  async () => {
    const { pool } = db
    const a = await site(pool, 'lantern')
    const b = await site(pool, 'ember')
    const c = await site(pool, 'cedar')
    const h = harness(pool, {
      SITE_MAIL_SITE_HOURLY: '2',
      SITE_MAIL_SITE_DAILY: '3',
      SITE_MAIL_GLOBAL_DAILY: '5'
    })

    assert.equal((await h.post('lantern')).status, 200)
    assert.equal((await h.post('lantern')).status, 200)
    const hour = await h.post('lantern')
    assert.equal(hour.status, 429)
    assert.deepEqual(await hour.json(), { code: 'SITE_MAIL_LIMIT', scope: 'site-hour' })
    assert.equal(h.sent.length, 2)

    // Three sent earlier today but outside the hour: the hour allows, the day (3) does not.
    await pool.query(
      `insert into site_mail_log (site_key, mode, status, at)
     select $1, 'tracy', 'sent', greatest(now() - interval '61 minutes', date_trunc('day', now() at time zone 'utc') at time zone 'utc')
       from generate_series(1, 3)`,
      [b]
    )
    const day = await h.post('ember')
    assert.equal(day.status, 429)
    assert.equal((await day.json()).scope, now2hIsToday() ? 'site-day' : 'site-hour')

    // Global: 2 (lantern) + 3 (ember) = 5 Tracy-paid today → every tracy site is refused.
    const global = await h.post('cedar')
    assert.equal(global.status, 429)
    assert.deepEqual(await global.json(), { code: 'SITE_MAIL_LIMIT', scope: 'global-day' })
    assert.equal(h.sent.length, 2, 'no refused message reached the wire')

    // An ops override raises one site's own limit, not the global cap.
    await pool.query('insert into site_mail (site_key, hourly_limit) values ($1, 100)', [a])
    assert.equal((await (await h.post('lantern')).json()).scope, 'global-day')

    // own-smtp: the customer's account, no Tracy limit, dialled at the resolved public address.
    await pool.query(`insert into site_mail (site_key, mode, smtp) values ($1, 'own-smtp', $2::jsonb)`, [
      c,
      JSON.stringify({ host: 'smtp.own.test', port: 587, user: 'me@own.test', password: null })
    ])
    const own = await h.post('cedar')
    assert.equal(own.status, 200)
    const last = h.sent.at(-1)
    assert.equal(last.host, 'smtp.own.test')
    assert.equal(last.port, 587)
    assert.equal(last.tls, 'starttls')
    assert.equal(last.from, 'shop@gmail.test', 'own-smtp keeps the site From')
    assert.equal(typeof last.connect, 'function')
    assert.deepEqual(await logRows(pool, c), ['refused SITE_MAIL_LIMIT', 'sent'])
    assert.ok(h.logs.some((l) => /limit reached: global-day/.test(l)))
  }
)

/** 61 minutes ago is outside the hour and still today (UTC), except in the first 62 minutes of a UTC day. */
function now2hIsToday() {
  const d = new Date()
  return d.getUTCHours() * 60 + d.getUTCMinutes() >= 62
}

test(
  'the relay is not a public door: Tracy hostname, Cloudflare header and site hostnames never reach it',
  opts,
  async () => {
    const { pool } = db
    const key = await site(pool, 'lantern')
    const h = harness(pool)
    const tracy = await h.post('lantern', MAIL, { url: 'https://cowork.tracy.test/_site-mail' })
    assert.equal(tracy.status, 404)
    const viaCloudflare = await h.post('lantern', MAIL, { headers: { 'cf-connecting-ip': '198.51.100.1' } })
    assert.equal(viaCloudflare.status, 404)
    // A site hostname is the site's own: proxied there (the fake upstream answers 502 text), never
    // answered by the relay.
    const toSite = await h.post('lantern', MAIL, { url: 'https://lantern.tracy.test/_site-mail' })
    assert.notEqual(toSite.headers.get('content-type'), 'application/json; charset=utf-8')
    assert.equal(h.sent.length, 0)
    assert.deepEqual(await logRows(pool, key), [])
  }
)

test('/api/ops/mail: staff read, owner/admin write, shapes as the contract says', opts, async () => {
  const { pool } = db
  const a = await site(pool, 'lantern')
  await site(pool, 'ember', 'draft')
  await staff(pool, 'owner@tracy.test', 'owner')
  // A staff rank that reads but does not write (`tracy_admin` keeps owner/admin/developer).
  await staff(pool, 'editor@tracy.test', 'developer')
  const h = harness(pool)
  const owner = await h.cookieFor('owner@tracy.test')
  const editor = await h.cookieFor('editor@tracy.test')
  const stranger = await h.cookieFor('who@x.test')

  assert.equal((await h.call('GET', '/api/ops/mail')).status, 302)
  assert.equal((await h.call('GET', '/api/ops/mail', stranger)).status, 403)
  await h.post('lantern')

  const read = await (await h.call('GET', '/api/ops/mail', editor)).json()
  assert.deepEqual(
    { ...read, sites: undefined },
    {
      enabled: true,
      mode: 'smtp',
      domain: 'sites.tracy.test',
      globalDaily: 50,
      usedToday: 1,
      defaults: { hourly: 10, daily: 20 },
      domainSlots: { used: 0, limit: 3 },
      domainPendingDays: 3,
      writable: false,
      sites: undefined
    }
  )
  assert.deepEqual(read.sites, [
    {
      siteKey: a,
      label: 'lantern',
      published: true,
      mode: 'tracy',
      fromAddress: 'lantern@sites.tracy.test',
      hourly: null,
      daily: null,
      sentToday: 1,
      domain: null,
      domainStatus: null,
      domainOwned: false,
      domainPendingSince: null,
      domainReleaseAt: null,
      domainReleasedAt: null,
      lastError: null
    }
  ])

  assert.equal((await h.call('PUT', `/api/ops/mail/sites/${a}`, editor, { hourly: 50 })).status, 403)
  const raised = await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, { hourly: 50, daily: 200 })
  assert.equal(raised.status, 200)
  const entry = await raised.json()
  assert.equal(entry.hourly, 50)
  assert.equal(entry.daily, 200)
  const reset = await (await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, { hourly: null })).json()
  assert.equal(reset.hourly, null, 'null = back on the default')
  assert.equal(reset.daily, 200)
  const badMode = await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, { mode: 'nope' })
  assert.equal(badMode.status, 400)
  assert.deepEqual(await badMode.json(), { code: 'INVALID_REQUEST', reason: 'INVALID_MODE' })
  assert.equal((await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, { mode: 'own-smtp' })).status, 400)
  assert.equal((await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, { hourly: -1 })).status, 400)
  assert.equal((await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, {})).status, 400)
  assert.equal(
    (await h.call('PUT', '/api/ops/mail/sites/nobody.tracy.test', owner, { hourly: 1 })).status,
    404
  )
  const off = await (await h.call('PUT', `/api/ops/mail/sites/${a}`, owner, { mode: 'off' })).json()
  assert.equal(off.mode, 'off')
  assert.equal(off.fromAddress, null)

  const audited = (await pool.query("select count(*)::int as n from audit where action = 'ops.site-mail'"))
    .rows[0].n
  assert.equal(audited, 3)

  // A reservation that never reported back (a restart mid-send) reads as failed, not "sending".
  await pool.query(
    "insert into site_mail_log (site_key, mode, status, at) values ($1, 'tracy', 'sending', now() - interval '10 minutes')",
    [a]
  )
  await pool.query("insert into site_mail_log (site_key, mode, status) values ($1, 'tracy', 'sending')", [a])
  const log = await (await h.call('GET', `/api/ops/mail/log?siteKey=${a}&limit=5`, editor)).json()
  assert.equal(log.entries.length, 2, 'the in-flight send is not listed')
  const sentEntry = log.entries.find((e) => e.status === 'sent')
  assert.deepEqual(Object.keys(sentEntry).sort(), [
    'at',
    'bytes',
    'code',
    'error',
    'id',
    'messageId',
    'mode',
    'recipients',
    'siteKey',
    'status',
    'subject',
    'to'
  ])
  assert.deepEqual(sentEntry.to, ['buyer@example.test', 'owner@example.test'])
  assert.equal(sentEntry.recipients, 2)
  assert.equal(sentEntry.subject, 'Your order')
  assert.equal(sentEntry.error, null)
  const cut = log.entries.find((e) => e.status === 'failed')
  assert.match(cut.error, /interrupted/)
  assert.equal((await h.call('GET', '/api/ops/mail/log', stranger)).status, 403)
})

test(
  '/api/sites/:key/mail: owners only (ADR 0028); own SMTP password sealed and never answered; own domain via Resend',
  opts,
  async () => {
    const { pool } = db
    const a = await site(pool, 'lantern')
    await seat(pool, a, 'owner@x.test', 'owner')
    await seat(pool, a, 'editor@x.test', 'editor')
    await seat(pool, a, 'viewer@x.test', 'viewer')
    const h = harness(pool)
    const owner = await h.cookieFor('owner@x.test')
    const editor = await h.cookieFor('editor@x.test')
    const stranger = await h.cookieFor('who@x.test')

    assert.equal((await h.call('GET', `/api/sites/${a}/mail`)).status, 401)
    assert.equal((await h.call('GET', `/api/sites/${a}/mail`, stranger)).status, 403)
    // The site's mail is site administration: an editor and a viewer are both refused.
    for (const who of [editor, await h.cookieFor('viewer@x.test')]) {
      const notOwner = await h.call('GET', `/api/sites/${a}/mail`, who)
      assert.equal(notOwner.status, 403)
      assert.deepEqual(await notOwner.json(), { code: 'NOT_SITE_OWNER' })
    }

    assert.deepEqual(await (await h.call('GET', `/api/sites/${a}/mail`, owner)).json(), {
      mode: 'tracy',
      fromAddress: 'lantern@sites.tracy.test',
      replyTo: null,
      domain: null,
      domainStatus: null,
      domainPendingSince: null,
      domainReleaseAt: null,
      domainReleasedAt: null,
      dnsRecords: [],
      smtp: null,
      limits: { hourly: 10, daily: 20 },
      sentToday: 0,
      published: true,
      enabled: true
    })
    // After the first message, replies go to the site's own From as the relay saw it.
    await h.post('lantern')
    const afterFirst = await (await h.call('GET', `/api/sites/${a}/mail`, owner)).json()
    assert.equal(afterFirst.replyTo, '"Lantern Shop" <shop@gmail.test>')
    assert.equal(afterFirst.sentToday, 1)

    // own-smtp: refused without a password or with a private host; stored sealed otherwise.
    const smtp = { host: 'smtp.own.test', port: 587, user: 'me@own.test' }
    assert.deepEqual(
      await (await h.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'own-smtp' })).json(),
      {
        code: 'INVALID_REQUEST',
        reason: 'SMTP_REQUIRED'
      }
    )
    assert.deepEqual(await (await h.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'bogus' })).json(), {
      code: 'INVALID_REQUEST',
      reason: 'INVALID_MODE'
    })
    assert.equal((await h.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'own-smtp', smtp })).status, 400)
    assert.equal(
      (
        await h.call('PUT', `/api/sites/${a}/mail`, owner, {
          mode: 'own-smtp',
          smtp: { ...smtp, host: 'postgres', password: 'x' }
        })
      ).status,
      400
    )
    const saved = await h.call('PUT', `/api/sites/${a}/mail`, owner, {
      mode: 'own-smtp',
      smtp: { ...smtp, password: 'hunter2' }
    })
    assert.equal(saved.status, 200)
    const savedText = await saved.text()
    assert.doesNotMatch(savedText, /hunter2|v1\./, 'no password, sealed or not, in the answer')
    const view = JSON.parse(savedText)
    assert.deepEqual(view.smtp, {
      host: 'smtp.own.test',
      port: 587,
      user: 'me@own.test',
      hasPassword: true
    })
    assert.equal(view.replyTo, null)
    assert.equal(view.fromAddress, null)
    const stored = (await pool.query('select smtp from site_mail where site_key = $1', [a])).rows[0].smtp
    assert.notEqual(stored.password, 'hunter2')
    assert.equal(await openSecret(stored.password, h.config.sessionSecret), 'hunter2')
    // A later save without a password keeps the stored one.
    const kept = await (
      await h.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'own-smtp', smtp: { ...smtp, port: 465 } })
    ).json()
    assert.equal(kept.smtp.hasPassword, true)
    assert.equal(kept.smtp.port, 465)

    // tracy-domain: Tracy's own domains refused; a customer domain registered on Resend.
    assert.deepEqual(
      await (
        await h.call('PUT', `/api/sites/${a}/mail`, owner, {
          mode: 'tracy-domain',
          domain: 'x.sites.tracy.test'
        })
      ).json(),
      { code: 'INVALID_REQUEST', reason: 'DOMAIN_NOT_ALLOWED' }
    )
    assert.equal((await h.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'tracy-domain' })).status, 400)
    const dom = await (
      await h.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'tracy-domain', domain: 'Shop.Test' })
    ).json()
    assert.equal(dom.mode, 'tracy-domain')
    assert.equal(dom.domain, 'shop.test')
    assert.equal(dom.domainStatus, 'not_started')
    assert.deepEqual(dom.dnsRecords, [
      { type: 'TXT', name: 'resend._domainkey.shop.test', value: 'p=abc', status: 'not_started' }
    ])
    assert.equal(dom.fromAddress, 'lantern@sites.tracy.test', 'not verified yet: the Tracy address')
    const verified = await (await h.call('POST', `/api/sites/${a}/mail/verify`, owner)).json()
    assert.equal(verified.domainStatus, 'verified')
    assert.equal(verified.fromAddress, 'noreply@shop.test')
    assert.deepEqual(h.resendCalls, ['list', 'create shop.test', 'verify d_1'])
    assert.equal((await h.call('POST', `/api/sites/${a}/mail/verify`, editor)).status, 403)

    // A verified domain changes what the relay writes.
    await h.post('lantern', MAIL.replace('shop@gmail.test', 'orders@shop.test'))
    assert.equal(h.sent.at(-1).from, 'orders@shop.test')

    const actions = (
      await pool.query('select action from audit where site_key = $1 order by id', [a])
    ).rows.map((r) => r.action)
    assert.deepEqual(actions, ['site.mail', 'site.mail', 'site.mail', 'site.mail.verify'])
  }
)

test(
  '/api/sites/:key/mail: 503 when the feature is off (after the seat check); 502 when Resend fails',
  opts,
  async () => {
    const { pool } = db
    const a = await site(pool, 'lantern')
    await seat(pool, a, 'owner@x.test', 'owner')
    const off = harness(pool, { SITE_MAIL: 'off' })
    const owner = await off.cookieFor('owner@x.test')
    const stranger = await off.cookieFor('who@x.test')
    assert.equal((await off.call('GET', `/api/sites/${a}/mail`, stranger)).status, 403)
    const r = await off.call('GET', `/api/sites/${a}/mail`, owner)
    assert.equal(r.status, 503)
    assert.deepEqual(await r.json(), { code: 'SITE_MAIL_DISABLED' })
    assert.equal((await off.call('PUT', `/api/sites/${a}/mail`, owner, { mode: 'off' })).status, 503)
    // Ops still sees the feature, switched off.
    await staff(pool, 'ops@tracy.test', 'owner')
    const ops = await (await off.call('GET', '/api/ops/mail', await off.cookieFor('ops@tracy.test'))).json()
    assert.equal(ops.enabled, false)
    assert.equal(ops.mode, 'off')

    await pool.query(
      "insert into site_mail (site_key, mode, domain, resend_domain_id, domain_status) values ($1, 'tracy-domain', 'shop.test', 'd_9', 'pending')",
      [a]
    )
    const on = harness(pool)
    const failing = buildApp({
      config: on.config,
      pool,
      host,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, on.config),
      siteMail: {
        resend: () => ({
          verify: async () => {
            throw new Error('resend POST /domains/d_9/verify: HTTP 500')
          }
        }),
        log: { log() {}, warn() {} }
      }
    })
    const v = await failing.fetch(
      new Request(`https://cowork.tracy.test/api/sites/${a}/mail/verify`, {
        method: 'POST',
        headers: { cookie: owner }
      })
    )
    assert.equal(v.status, 502)
    assert.deepEqual(await v.json(), { code: 'SITE_MAIL_UPSTREAM' })
    assert.equal(
      (await pool.query('select domain_status from site_mail where site_key = $1', [a])).rows[0]
        .domain_status,
      'pending'
    )
  }
)
