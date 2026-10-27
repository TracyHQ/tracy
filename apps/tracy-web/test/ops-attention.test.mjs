/**
 * The Admin attention doors against a real database: the report the rail's badge counts, and the
 * questionnaire comparison a row loads when it is opened. Releases are seeded straight into
 * `quickstart_releases`, as a read of GitHub would have left them; the contracts are the repo's own.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { markDemoLive, noteDemoJob, recordDemoJob, upsertDemoSite } from '../src/lib/demo-sites.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const IMPACT = 'quickstart/ja-impact/j6'
const KINETIC = 'quickstart/ja-kinetic/j6'
const NOCONTRACT = 'quickstart/ja-nowhere/j6'

function harness(pool, { available = false } = {}) {
  const config = readConfig(env)
  const llm = {
    available: async () => available,
    notConfigured: 'no model',
    run: async () => ({ ok: false })
  }
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    llm
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
  const ws =
    (await pool.query("select id from workspace where kind = 'tracy_admin' limit 1")).rows[0]?.id ??
    (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

const joomla = (label, template, version) => ({
  schemaVersion: 'tracy-setting/v1',
  platform: 'joomla',
  label,
  version,
  cms: '6.1.1',
  template,
  install: { installer: { file: `${template}.zip`, sha256: 'a'.repeat(64) } }
})

async function seed(pool) {
  const insert = (tag, setting) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        tag,
        JSON.stringify({
          name: `Quickstart: ${tag}`,
          kind: 'quickstart',
          github: 'prerelease',
          publishedAt: null,
          assets: []
        }),
        JSON.stringify(setting)
      ]
    )
  await insert(IMPACT, joomla('JA Impact', 'ja_impact', '1.0.0'))
  await insert(KINETIC, joomla('JA Kinetic', 'ja_kinetic', '1.0.2'))
  await insert(NOCONTRACT, joomla('JA Nowhere', 'ja_nowhere', '1.0.0'))

  // Kinetic: a live demo, a contract with a design, and its own released questions — only the
  // missing Design inspiration card (a live demo nobody sees there) is left.
  await upsertDemoSite(pool, {
    siteKey: 'demo-kinetic',
    label: 'kinetic',
    host: 'local',
    platform: 'joomla',
    tag: KINETIC,
    version: '1.0.2',
    sha256: 'a'.repeat(64)
  })
  await markDemoLive(pool, 'demo-kinetic', { address: 'https://kinetic.tracy.test/', port: 8001 })
  await pool.query(
    `insert into question_set (id, owner, name, source, version, sha256, doc)
     values ($1, $2, 'Released 1.0.2', 'released', '1.0.2', 'aa', $3::jsonb)`,
    [
      `${KINETIC}@aa`,
      KINETIC,
      JSON.stringify({
        schemaVersion: 'tracy-questions/v1',
        owner: KINETIC,
        languages: ['en'],
        questions: [{ id: 'name', kind: 'text', step: 1, label: { en: 'Name' }, feeds: ['site.name'] }]
      })
    ]
  )

  // Impact: its demo failed to build.
  await upsertDemoSite(pool, {
    siteKey: 'demo-impact',
    label: 'impact',
    host: 'local',
    platform: 'joomla',
    tag: IMPACT,
    version: '1.0.0',
    sha256: 'a'.repeat(64)
  })
  await recordDemoJob(pool, { id: 'job-impact-1', siteKey: 'demo-impact', host: 'local', kind: 'provision' })
  await noteDemoJob(pool, 'job-impact-1', {
    state: 'failed',
    step: 'provision',
    detail: { output: '==> installing\nUsage: php installation/joomla.php install [options]' }
  })

  // A demo of a quickstart this server no longer offers.
  await upsertDemoSite(pool, {
    siteKey: 'demo-gone',
    label: 'gone',
    host: 'local',
    platform: 'joomla',
    tag: 'quickstart/ja-gone/j6',
    version: '1.0.0',
    sha256: 'a'.repeat(64)
  })
}

const checksOf = (body, key) => body.subjects.find((s) => s.key === key)?.items.map((i) => i.check) ?? null

test('the report: who may read it, and what it says about each quickstart', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seed(pool)
  assert.equal((await get('/api/ops/attention')).status, 302, 'a stranger is sent to sign in')
  assert.equal((await get('/api/ops/attention', await cookieFor('out@example.test'))).status, 403)

  await seedStaff(pool, 'dev@example.test', 'developer')
  const res = await get('/api/ops/attention', await cookieFor('dev@example.test'))
  assert.equal(res.status, 200, 'any staff role may read')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()

  assert.deepEqual(checksOf(body, IMPACT), [
    'demo-failed',
    'no-design-system',
    'standard-questions',
    'no-card'
  ])
  assert.deepEqual(checksOf(body, KINETIC), ['not-on-inspiration'])
  assert.deepEqual(checksOf(body, NOCONTRACT), ['no-demo', 'no-contract', 'standard-questions', 'no-card'])
  assert.deepEqual(checksOf(body, 'gone'), ['demo-orphan'])

  const failed = body.subjects.find((s) => s.key === IMPACT).items[0]
  assert.deepEqual(failed, {
    check: 'demo-failed',
    severity: 'broken',
    params: { demo: 'impact', reason: 'Usage: php installation/joomla.php install [options]' }
  })
  assert.deepEqual(body.subjects.find((s) => s.key === IMPACT).items[1].params, {
    contract: 'ja-impact/j6/1.0.0'
  })
  assert.equal(body.count, 4)
  assert.equal(body.offered, 3)
  assert.deepEqual(body.counts, { broken: 3, missing: 5, hint: 2 })
  assert.ok(body.readAt)
  // Broken subjects first.
  assert.deepEqual(
    body.subjects.map((s) => s.worst),
    ['broken', 'broken', 'broken', 'missing']
  )
})

test('choosing a released set clears the standard-questions item at once', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seed(pool)
  await seedStaff(pool, 'owner@example.test')
  const cookie = await cookieFor('owner@example.test')
  assert.ok(
    checksOf(await (await get('/api/ops/attention', cookie)).json(), NOCONTRACT).includes(
      'standard-questions'
    )
  )
  await pool.query(
    `insert into question_set (id, owner, name, source, version, sha256, doc)
     values ($1, $2, 'Generated', 'generated', null, null, '{"questions":[]}'::jsonb)`,
    [`${NOCONTRACT}@gen`, NOCONTRACT]
  )
  assert.ok(
    checksOf(await (await get('/api/ops/attention', cookie)).json(), NOCONTRACT).includes(
      'standard-questions'
    ),
    'a draft nobody chose is not in use'
  )
  await pool.query(
    "insert into question_choice (owner, set_id, revision, updated_by) values ($1, $2, 1, 'owner@example.test')",
    [NOCONTRACT, `${NOCONTRACT}@gen`]
  )
  assert.ok(
    !checksOf(await (await get('/api/ops/attention', cookie)).json(), NOCONTRACT).includes(
      'standard-questions'
    )
  )
})

test('the questionnaire comparison of one quickstart', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seed(pool)
  await seedStaff(pool, 'owner@example.test')
  const cookie = await cookieFor('owner@example.test')

  assert.equal((await get(`/api/ops/attention/questionnaire?tag=${encodeURIComponent(IMPACT)}`)).status, 302)
  assert.equal((await get('/api/ops/attention/questionnaire?tag=nope', cookie)).status, 404)

  const res = await get(`/api/ops/attention/questionnaire?tag=${encodeURIComponent(IMPACT)}`, cookie)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const impact = await res.json()
  assert.equal(impact.setName, 'Standard joomla')
  assert.equal(impact.setSource, 'standard')
  assert.equal(impact.limited, null)
  assert.equal(impact.canGenerate, undefined, 'the Generate press was removed with the generator')
  assert.equal(impact.writable, true)
  // The standard "Pages" question offers the release's own page list (#1013); this release ships none.
  assert.deepEqual(impact.asked.find((q) => q.id === 'pages').dead, {
    consumer: 'site.pages',
    code: 'no-page-list'
  })
  assert.equal(impact.asked.find((q) => q.id === 'pages').label, 'Trang')
  const roles = impact.parts.map((p) => p.role)
  assert.ok(roles.includes('contact'), `contact among ${roles.join(', ')}`)
  assert.ok(
    impact.parts.some((p) => !p.covered),
    'the standard set leaves template parts unasked'
  )
  for (const p of impact.parts) assert.ok(p.examples.length <= 2)

  const nowhere = await (
    await get(`/api/ops/attention/questionnaire?tag=${encodeURIComponent(NOCONTRACT)}`, cookie)
  ).json()
  assert.equal(nowhere.limited, 'no-contract')
  assert.deepEqual(nowhere.parts, [])
  assert.deepEqual(nowhere.asked.find((q) => q.id === 'languages').dead, {
    consumer: 'site.languages',
    code: 'unsealed-languages'
  })
})
