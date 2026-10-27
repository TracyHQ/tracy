// `/api/ops/general` and `/api/ops/servers` — the Settings screens, LAYER A: they report, they
// never write. Two properties are worth more than the field list, and both are asserted below:
//
//   1. A SECRET IS NEVER ANSWERED, only whether one is set. The screen's job is "is this door
//      configured", and a screen that could print a key would make every staff role a key reader.
//   2. WHAT THIS PROCESS CANNOT SEE, IT SAYS IT CANNOT SEE. `tracy-web` holds no agent-model key
//      and no seeder picture key — those reach `tracy-dsh` through compose. Drawing them as "off"
//      would be a confident lie about somebody else's configuration.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { mintSession } from '../src/lib/session.js'
import { SESSION_TTL_S, WRITE_LIMIT_PER_HOUR } from '../src/lib/policy.js'

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

test('GET /api/ops/general is behind the same door as every other ops surface', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  const out = await get('/api/ops/general')
  assert.equal(out.status, 302)
  await out.body?.cancel()
  const stranger = await get('/api/ops/general', await cookieFor('nobody@x.y'))
  assert.equal(stranger.status, 403)
  assert.equal(await stranger.text(), '')
})

test('GET /api/ops/general never answers a secret, only whether one is set', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const { get, cookieFor } = harness(pool)
  const res = await get('/api/ops/general', await cookieFor('owner@tracy.test'))
  assert.equal(res.status, 200)
  const body = await res.json()

  // The whole document, not just the field we expect it in: a key leaking through some other
  // branch (an echoed env map, a debug field) is exactly what this assertion is for.
  assert.ok(
    !JSON.stringify(body).includes('secret-value-nobody-should-see'),
    'the model key reached the browser'
  )
  // The model block is gone entirely — one screen owns models now (`/api/ops/llm`), and a
  // second copy here read the environment instead of the book, so the two disagreed the moment
  // somebody configured a provider.
  assert.equal('model' in body, false)
})

test(
  'GET /api/ops/general reports the limits the doors actually enforce, from one definition',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    const { get, cookieFor } = harness(pool)
    const body = await (await get('/api/ops/general', await cookieFor('owner@tracy.test'))).json()
    assert.equal(body.limits.sessionTtlS, SESSION_TTL_S)
    assert.equal(body.limits.writesPerHour, WRITE_LIMIT_PER_HOUR)
    assert.equal(body.limits.otpMaxAttempts, 5)
  }
)

test(
  'GET /api/ops/general marks a half-configured integration as NOT ready and names what is missing',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    // Three of the GitHub App's four keys: `readGithub` answers null, and every GitHub door then
    // refuses — the screen has to show that as "not ready", not as "configured".
    const { get, cookieFor } = harness(pool, {
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY: 'pem',
      GITHUB_ORG: 'TracyHQ'
    })
    const body = await (await get('/api/ops/general', await cookieFor('owner@tracy.test'))).json()
    const github = body.integrations.find((i) => i.id === 'github-app')
    assert.equal(github.ready, false)
    assert.deepEqual(github.missing, ['GITHUB_WEBHOOK_SECRET'])
  }
)

test('GET /api/ops/servers names which machine holds which role', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const { get, cookieFor } = harness(pool)
  const res = await get('/api/ops/servers', await cookieFor('owner@tracy.test'))
  assert.equal(res.status, 200)
  const body = await res.json()

  const prod1 = body.servers.find((s) => s.name === 'prod1')
  const contabo = body.servers.find((s) => s.name === 'contabo')
  // `HOSTS`'s FIRST name is where every new customer site is built — the fact this screen exists
  // to make visible, since today it is the order of a comma-separated string and nothing else.
  assert.deepEqual(prod1.roles.sort(), ['landing', 'newSites', 'onboarding'].sort())
  assert.deepEqual(contabo.roles, ['demo'])
  assert.equal(prod1.colocated, true)

  // A secret per host is exactly what a roles table must never carry.
  assert.ok(!JSON.stringify(body).includes('h1'), 'a host secret reached the browser')
})

test('GET /api/ops/servers marks EVERY demo host, not only the default one', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  // Two machines carry demos since 23/09 (`DEMO_HOSTS`); `contabo` is only the one a press lands
  // on when nobody picked. A table that marked one of them would draw the other as idle.
  const { get, cookieFor } = harness(pool, { DEMO_HOSTS: 'contabo,prod1' })
  const body = await (await get('/api/ops/servers', await cookieFor('owner@tracy.test'))).json()
  const roles = Object.fromEntries(body.servers.map((s) => [s.name, s.roles]))
  assert.ok(roles.contabo.includes('demo'))
  assert.ok(roles.prod1.includes('demo'))
  assert.ok(roles.prod1.includes('newSites'), 'a demo host may also be where new sites are built')
})

test('GET /api/ops/servers draws a record-only target as taking no role at all', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const { get, cookieFor } = harness(pool, { DEMO_JOOMLART_ZONE: 'demo.joomlart.com' })
  const body = await (await get('/api/ops/servers', await cookieFor('owner@tracy.test'))).json()
  const record = body.servers.find((s) => s.kind === 'record')
  assert.equal(record.name, 'joomlart')
  // Not an empty role list — `roles: null` reads as "does not apply", where `[]` would read as
  // "configured to do nothing", and Tracy never installs onto that machine at all.
  assert.equal(record.roles, null)
})
