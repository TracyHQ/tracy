// `/api/ops/release-checklist` — the release checklist the /ops screen draws. Two properties are
// asserted: it never answers a value (only which names are absent), and a partly configured
// all-or-nothing block is a failure, not "not set up".

import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { deploymentOf, evaluateChecklist } from '../src/ops/release-checklist.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1,contabo',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1',
  HOST_contabo_ORIGIN: 'http://contabo',
  HOST_contabo_DSH_ORIGIN: 'http://contabo-dsh',
  HOST_contabo_SECRET: 'h2',
  SEAT_contabo_SECRET: 'k2',
  DEMO_HOST: 'contabo',
  HOST_NAME: 'prod1',
  MODEL_API_KEY: 'sk-or-v1-secret-value-nobody-should-see',
  TRACY_ENVIRONMENT: 'staging',
  SITE_ADDRESS_PREFIX: 'stg-',
  APP_IMAGE_TAG: 'app-0123456789ab',
  GOOGLE_OAUTH_CLIENT_ID: 'google-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret-value-nobody-should-see',
  ARTIFACT_S3_ENDPOINT: 'https://r2.example',
  ARTIFACT_S3_BUCKET: 'bucket',
  MODEL_WORDS: 'meta-llama/llama-3.3-70b-instruct'
}

function harness(pool, extra = {}) {
  const fullEnv = { ...env, ...extra }
  const config = readConfig(fullEnv)
  const app = buildApp({
    config,
    env: fullEnv,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config)
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
    )
  return { get, cookieFor }
}

async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const workspaceId = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    'insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
    [workspaceId, account, role]
  )
}

const byId = (body) => Object.fromEntries(body.items.map((i) => [i.id, i]))

test('GET /api/ops/release-checklist is behind the ops door', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  const out = await get('/api/ops/release-checklist')
  assert.equal(out.status, 302)
  await out.body?.cancel()
  const stranger = await get('/api/ops/release-checklist', await cookieFor('nobody@x.y'))
  assert.equal(stranger.status, 403)
})

test('GET /api/ops/release-checklist answers verdicts, never a value', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const { get, cookieFor } = harness(pool)
  const res = await get('/api/ops/release-checklist', await cookieFor('owner@tracy.test'))
  assert.equal(res.status, 200)
  const body = await res.json()
  const text = JSON.stringify(body)
  assert.ok(!text.includes('secret-value-nobody-should-see'), 'a secret reached the browser')
  assert.equal(body.environment, 'staging')
  assert.equal(body.release, 'app-0123456789ab')
  assert.ok(body.items.length >= 50, `only ${body.items.length} items`)
  const ids = body.items.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length, 'item ids must be unique (ticks are stored under them)')
  for (const i of body.items)
    assert.ok(
      body.groups.some((g) => g.id === i.group),
      `${i.id} has an unknown group`
    )

  const items = byId(body)
  assert.equal(items['env-signin-google'].auto.state, 'pass')
  assert.equal(items['env-core-prefix'].auto.state, 'pass')
  // MAIL / MAIL_FROM absent: a miss that names them.
  assert.equal(items['env-signin-mail'].auto.state, 'fail')
  assert.match(items['env-signin-mail'].auto.detail, /MAIL_FROM/)
  // Two of four R2 keys: half configured behaves like none, so it is a failure that names the rest.
  assert.equal(items['env-storage-r2'].auto.state, 'fail')
  assert.match(items['env-storage-r2'].auto.detail, /ARTIFACT_S3_ACCESS_KEY/)
  // Telegram alerts are empty on staging by design: reported, not failed.
  assert.equal(items['env-alerts-telegram'].auto.state, 'info')
  // Database checks ran against the migrated test schema.
  assert.equal(items['db-migrations'].auto.state, 'pass')
  assert.equal(items['db-campaign-tables'].auto.state, 'pass')
  assert.equal(items['db-staff-owner'].auto.state, 'pass')
  assert.equal(items['db-template-shots'].auto.state, 'fail')
  // A manual line has no verdict.
  assert.equal(items['feat-login-otp'].auto, null)
  // The desktop app is re-tested on every release and released after the server: manual lines, last group.
  assert.equal(body.groups.at(-1).id, 'desktop')
  assert.equal(items['desktop-retest'].auto, null)
  assert.equal(items['desktop-contract'].group, 'desktop')
})

test('a deployment is named without any hostname in code', () => {
  // Production declares no TRACY_ENVIRONMENT: an https server is a real deployment, named by HOST_NAME.
  assert.equal(
    deploymentOf({ environment: 'local', origin: 'https://cowork.example' }, { HOST_NAME: 'prod1' }),
    'prod1'
  )
  assert.equal(deploymentOf({ environment: 'local', origin: 'https://cowork.example' }, {}), 'server')
  assert.equal(deploymentOf({ environment: 'staging', origin: 'https://cowork.example' }, {}), 'staging')
  assert.equal(
    deploymentOf({ environment: 'local', origin: 'http://tracy.test' }, { HOST_NAME: 'prod1' }),
    'local'
  )
})

test('a local stand reports misses as notes, never as something to fix', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const { get, cookieFor } = harness(pool, { TRACY_ENVIRONMENT: '' })
  const body = await (await get('/api/ops/release-checklist', await cookieFor('owner@tracy.test'))).json()
  assert.equal(body.environment, 'local')
  assert.equal(body.items.filter((i) => i.auto?.state === 'fail').length, 0)
  assert.match(byId(body)['env-storage-r2'].auto.detail, /^Local stand, no fix needed/)
})

test('the stg- prefix outside staging is a failure', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const { get, cookieFor } = harness(pool, { TRACY_ENVIRONMENT: 'production' })
  const body = await (await get('/api/ops/release-checklist', await cookieFor('owner@tracy.test'))).json()
  assert.equal(byId(body)['env-core-prefix'].auto.state, 'fail')
})

test('variables added since the screen shipped: model plan key, invitations, Discord, CI', async () => {
  // No database here: the db lines answer `check failed`, the env lines are what is asserted.
  const pool = { query: async () => Promise.reject(new Error('no database')) }
  const run = async (environment, env) =>
    Object.fromEntries((await evaluateChecklist({ env, environment, pool })).map((i) => [i.id, i]))

  const staging = await run('staging', { TRACY_ENVIRONMENT: 'staging' })
  // SEAT_PLAN_KEK missing breaks account subscriptions: a miss on a server.
  assert.equal(staging['env-agent-seat-plan'].auto.state, 'fail')
  // The sandbox and its Gmail keys must stay off outside dev; absent is the right answer there.
  assert.equal(staging['env-ops-invitations'].auto.state, 'pass')
  assert.equal(staging['env-ops-invitations-gmail'].auto.state, 'info')
  // Optional doors: a note, never a miss.
  assert.equal(staging['env-alerts-discord'].auto.state, 'info')
  assert.equal(staging['env-ops-ci'].auto.state, 'info')
  assert.equal(staging['env-core-environment'].auto.state, 'pass')
  assert.equal(staging['env-core-own-domain-probe'].auto.state, 'pass')
  // Cloudflare for SaaS unset: own domains are not offered there — a warning, not a crash.
  assert.equal(staging['env-golive-cloudflare-saas'].auto.state, 'warn')

  const prod = await run('prod1', {
    INVITATIONS_SANDBOX_ENABLED: '1',
    INVITATIONS_GMAIL_KEY: 'k',
    TRACY_OWN_DOMAIN_PROBE_PORT: '8443'
  })
  assert.equal(prod['env-core-environment'].auto.state, 'warn')
  assert.equal(prod['env-ops-invitations'].auto.state, 'fail')
  assert.equal(prod['env-ops-invitations-gmail'].auto.state, 'fail')
  assert.equal(prod['env-core-own-domain-probe'].auto.state, 'fail')

  const dev = await run('dev', {
    TRACY_ENVIRONMENT: 'dev',
    INVITATIONS_SANDBOX_ENABLED: '1',
    INVITATIONS_GMAIL_CLIENT_ID: 'id',
    SEAT_PLAN_KEK: 'kek-value-nobody-should-see'
  })
  assert.equal(dev['env-ops-invitations'].auto.state, 'pass')
  // One of four Gmail keys behaves like none: a failure naming the rest.
  assert.equal(dev['env-ops-invitations-gmail'].auto.state, 'fail')
  assert.match(dev['env-ops-invitations-gmail'].auto.detail, /INVITATIONS_GMAIL_KEY_ID/)
  assert.equal(dev['env-agent-seat-plan'].auto.state, 'pass')
  assert.ok(!JSON.stringify(dev).includes('kek-value-nobody-should-see'), 'a secret reached the list')

  // #1037 slice 2: both Cloudflare for SaaS keys or a failure naming the missing one; the token
  // never on the list; the stand-in API base a failure on a server.
  const saas = await run('dev', {
    CLOUDFLARE_SAAS_ZONE_ID: 'z',
    CLOUDFLARE_SAAS_TOKEN: 'saas-token-nobody-should-see'
  })
  assert.equal(saas['env-golive-cloudflare-saas'].auto.state, 'pass')
  assert.ok(!JSON.stringify(saas).includes('saas-token-nobody-should-see'), 'the token reached the list')
  const half = await run('dev', { CLOUDFLARE_SAAS_ZONE_ID: 'z' })
  assert.equal(half['env-golive-cloudflare-saas'].auto.state, 'fail')
  assert.match(half['env-golive-cloudflare-saas'].auto.detail, /CLOUDFLARE_SAAS_TOKEN/)
  const stand = await run('dev', {
    CLOUDFLARE_SAAS_ZONE_ID: 'z',
    CLOUDFLARE_SAAS_TOKEN: 't',
    CLOUDFLARE_SAAS_API: 'http://x'
  })
  assert.equal(stand['env-golive-cloudflare-saas'].auto.state, 'fail')
})

test('DOCS_ORIGIN is a line of its own: a server without it is a miss (the image carries the docs site)', async () => {
  const pool = { query: async () => Promise.reject(new Error('no database')) }
  const run = async (environment, env) =>
    Object.fromEntries((await evaluateChecklist({ env, environment, pool })).map((i) => [i.id, i]))
  assert.equal((await run('staging', { TRACY_ENVIRONMENT: 'staging' }))['env-agent-docs'].auto.state, 'fail')
  const set = await run('staging', { TRACY_ENVIRONMENT: 'staging', DOCS_ORIGIN: 'https://docs.tracy.test' })
  assert.equal(set['env-agent-docs'].auto.state, 'pass')
  assert.ok(!JSON.stringify(set).includes('docs.tracy.test'), 'a value reached the list')
})
