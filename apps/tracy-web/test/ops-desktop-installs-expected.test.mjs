/**
 * `/ops/desktop/installs` report for an EXPECTED minimum version (tasks/todo-desktop-update-policy.md
 * C8, ACC-9; council §C8): before a person raises `minimumVersion` on a channel, staff ask "which
 * machines of that channel run a version below the one I am about to require?" — counted, split by
 * platform and arch, and listed with lastSeen. Read-only; versions ordered like the release tool
 * (`X.Y.Z` above every `X.Y.Z-dev.N`, numbers compared as numbers).
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/ops-desktop-installs-expected.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'https://cowork.tracy.test'
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1'
}

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    fetchImpl: async () => Response.json({ error: 'unexpected' }, { status: 500 })
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} }))
  return { get, cookieFor }
}

async function account(pool, email) {
  return (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
}

async function seedStaff(pool, email, role) {
  const id = await account(pool, email)
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') on conflict (display_name) do update set kind = excluded.kind returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [ws, id, role]
  )
}

const DAY = 86_400_000
const NOW = Date.now()
const ago = (ms) => new Date(NOW - ms).toISOString()

/** Install ids, named by what each fixture is for. */
const ID = {
  macOld: 'a0000000-0000-4000-8000-000000000001',
  winTenth: 'a0000000-0000-4000-8000-000000000002',
  macCurrent: 'a0000000-0000-4000-8000-000000000003',
  linuxAhead: 'a0000000-0000-4000-8000-000000000004',
  macSilent: 'a0000000-0000-4000-8000-000000000005',
  noVersion: 'a0000000-0000-4000-8000-000000000006',
  oddVersion: 'a0000000-0000-4000-8000-000000000007',
  devBehind: 'b0000000-0000-4000-8000-000000000001',
  devCurrent: 'b0000000-0000-4000-8000-000000000002',
  devStableBuild: 'b0000000-0000-4000-8000-000000000003'
}

/**
 * The machines of both channels as the feed would have recorded them. Written as rows because the
 * feed records `last_seen = now()` and a report about silence needs machines silent for weeks.
 */
async function seedInstalls(pool) {
  const lee = await account(pool, 'lee@tracy.test')
  const rows = [
    [ID.macOld, 'stable', 'mac', '0.5.1', 'arm64', '15.5', ago(1 * DAY), lee],
    [ID.winTenth, 'stable', 'win', '0.5.10', 'x64', '10.0.26100', ago(2 * DAY), null],
    [ID.macCurrent, 'stable', 'mac', '0.6.0', 'arm64', '15.5', ago(DAY / 24), null],
    [ID.linuxAhead, 'stable', 'linux', '0.6.1', 'x64', null, ago(3 * DAY), null],
    [ID.macSilent, 'stable', 'mac', '0.4.0', 'x64', '14.2', ago(40 * DAY), null],
    [ID.noVersion, 'stable', 'mac', null, 'arm64', null, ago(5 * DAY), null],
    [ID.oddVersion, 'stable', 'win', '1.0', 'x64', null, ago(6 * DAY), null],
    [ID.devBehind, 'dev', 'mac', '0.6.0-dev.11', 'arm64', '15.5', ago(2 * DAY), lee],
    [ID.devCurrent, 'dev', 'mac', '0.6.0-dev.12', 'arm64', '15.5', ago(1 * DAY), null],
    [ID.devStableBuild, 'dev', 'linux', '0.5.1', 'arm64', null, ago(4 * DAY), null]
  ]
  for (const [id, channel, platform, version, arch, osVersion, lastSeen, accountId] of rows)
    await pool.query(
      `insert into desktop_install
         (install_id, channel, platform, version, arch, os_version, first_seen, last_seen, account_id, linked_at)
       values ($1, $2, $3, $4, $5, $6, $7::timestamptz - interval '1 day', $7, $8, case when $8::uuid is null then null else now() end)`,
      [id, channel, platform, version, arch, osVersion, lastSeen, accountId]
    )
}

async function asAdmin(pool) {
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const h = harness(pool)
  return { ...h, admin: await h.cookieFor('admin@tracy.test') }
}

test(
  'below an expected stable minimum: the machines it would block, counted, split and newest first',
  opts,
  async () => {
    const { pool } = db
    await seedInstalls(pool)
    const h = await asAdmin(pool)
    const response = await h.get('/api/ops/desktop/installs?below=0.6.0&channel=stable', h.admin)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const report = await response.json()

    assert.equal(report.below, '0.6.0')
    assert.equal(report.channel, 'stable')
    assert.equal(report.days, 'all')
    assert.equal(report.since, null)
    assert.equal(report.total, 3)
    assert.equal(report.atOrAbove, 2)
    assert.equal(report.unknownVersion, 2)
    assert.deepEqual(
      report.installs.map((i) => [i.installId, i.version, i.platform, i.arch, i.email]),
      [
        [ID.macOld, '0.5.1', 'mac', 'arm64', 'lee@tracy.test'],
        [ID.winTenth, '0.5.10', 'win', 'x64', null],
        [ID.macSilent, '0.4.0', 'mac', 'x64', null]
      ]
    )
    assert.equal(report.installs[0].osVersion, '15.5')
    assert.equal(report.installs[0].lastSeen, ago(1 * DAY))
    assert.deepEqual(report.byPlatform, [
      { platform: 'mac', arch: 'arm64', count: 1 },
      { platform: 'mac', arch: 'x64', count: 1 },
      { platform: 'win', arch: 'x64', count: 1 }
    ])
    assert.deepEqual(report.byVersion, [
      { version: '0.5.10', count: 1 },
      { version: '0.5.1', count: 1 },
      { version: '0.4.0', count: 1 }
    ])
  }
)

test('versions compare as numbers, and a dev build sits below its own release', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  const h = await asAdmin(pool)
  const ids = async (path) => (await (await h.get(path, h.admin)).json()).installs.map((i) => i.installId)

  // 0.5.10 is above 0.5.9, though a string compare says otherwise.
  assert.deepEqual(await ids('/api/ops/desktop/installs?below=0.5.9&channel=stable'), [
    ID.macOld,
    ID.macSilent
  ])
  // On dev: 0.6.0-dev.11 and the stable build 0.5.1 are below 0.6.0-dev.12; dev.12 itself is not.
  assert.deepEqual(await ids('/api/ops/desktop/installs?below=0.6.0-dev.12&channel=dev'), [
    ID.devBehind,
    ID.devStableBuild
  ])
  // 0.6.0 is above every 0.6.0-dev.N, so all three dev machines are below it.
  assert.deepEqual(await ids('/api/ops/desktop/installs?below=0.6.0&channel=dev'), [
    ID.devCurrent,
    ID.devBehind,
    ID.devStableBuild
  ])
})

test('a bad expected version, channel or window is a 400 that says what to send', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  const h = await asAdmin(pool)
  const cases = [
    ['below=0.6&channel=stable', 'below'],
    ['below=v0.6.0&channel=stable', 'below'],
    ['below=0.6.0-beta.1&channel=stable', 'below'],
    ['channel=stable', 'below'],
    ['below=0.6.0', 'channel'],
    ['below=0.6.0&channel=beta', 'channel'],
    // A stable channel never offers a dev build, so it cannot require one.
    ['below=0.6.0-dev.3&channel=stable', 'below'],
    ['below=0.6.0&channel=stable&days=14', 'days']
  ]
  for (const [query, field] of cases) {
    const response = await h.get(`/api/ops/desktop/installs?${query}`, h.admin)
    assert.equal(response.status, 400, query)
    const body = await response.json()
    assert.equal(body.code, 'INVALID_REPORT', query)
    assert.equal(body.field, field, query)
    assert.match(body.message, /^[\x20-\x7e]+$/, `${query}: an English message`)
  }
})

test('a "seen in the last N days" window narrows every count, not only the list', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  const h = await asAdmin(pool)
  const report = await (
    await h.get('/api/ops/desktop/installs?below=0.6.0&channel=stable&days=30', h.admin)
  ).json()
  assert.equal(report.days, '30')
  assert.ok(Math.abs(Date.parse(report.since) - (NOW - 30 * DAY)) < 60_000)
  // The machine silent for 40 days drops out of the total and the split.
  assert.deepEqual(
    report.installs.map((i) => i.installId),
    [ID.macOld, ID.winTenth]
  )
  assert.equal(report.total, 2)
  assert.equal(report.atOrAbove, 2)
  assert.equal(report.unknownVersion, 2)
  assert.deepEqual(
    report.byPlatform.map((p) => [p.platform, p.arch, p.count]),
    [
      ['mac', 'arm64', 1],
      ['win', 'x64', 1]
    ]
  )
})

test('only someone who may see /ops reads the report, and reading writes nothing', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  await account(pool, 'customer@tracy.test')
  const h = await asAdmin(pool)
  const path = '/api/ops/desktop/installs?below=0.6.0&channel=stable'
  const before = (await pool.query('select * from desktop_install order by install_id')).rows

  const signedOut = await h.get(path)
  assert.equal(signedOut.status, 302)
  assert.match(signedOut.headers.get('location'), /^\/login\?next=/)
  const customer = await h.get(path, await h.cookieFor('customer@tracy.test'))
  assert.equal(customer.status, 403)
  assert.equal(await customer.text(), '')
  await seedStaff(pool, 'dev@tracy.test', 'developer')
  assert.equal((await h.get(path, await h.cookieFor('dev@tracy.test'))).status, 200)

  assert.deepEqual((await pool.query('select * from desktop_install order by install_id')).rows, before)
})

test('without a report query the door still answers every install, as before', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  const h = await asAdmin(pool)
  const body = await (await h.get('/api/ops/desktop/installs', h.admin)).json()
  assert.deepEqual(Object.keys(body), ['installs'])
  assert.equal(body.installs.length, 10)
})

test('the installs page asks for an expected version and shows its report', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  const h = await asAdmin(pool)

  const plain = await (await h.get('/ops/desktop/installs', h.admin)).text()
  assert.match(plain, /<form method="get" action="\/ops\/desktop\/installs"/)
  for (const name of ['below', 'channel', 'days']) assert.match(plain, new RegExp(`name="${name}"`))
  // The plain list stays: every install, the current one included.
  assert.match(plain, new RegExp(ID.macCurrent))

  const response = await h.get('/ops/desktop/installs?below=0.6.0&channel=stable', h.admin)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const html = await response.text()
  assert.match(html, /3 stable installs run a version below 0\.6\.0/)
  assert.match(html, /2 at or above it, 2 with a version that could not be read/)
  // The split, and each machine with a shortened id that keeps the full one in its title.
  assert.match(html, /<td>macOS<\/td><td>arm64<\/td><td>1<\/td>/)
  assert.match(html, /<td>Windows<\/td><td>x64<\/td><td>1<\/td>/)
  assert.match(html, new RegExp(`<td title="${ID.macOld}">a0000000</td>`))
  assert.match(html, /lee@tracy\.test/)
  assert.doesNotMatch(html, new RegExp(ID.macCurrent))
  // The form keeps what was asked.
  assert.match(html, /name="below" value="0\.6\.0"/)
  assert.match(html, /<option value="stable" selected>/)
})

test('the page escapes every value and answers a bad query with a 400 page', opts, async () => {
  const { pool } = db
  await seedInstalls(pool)
  await pool.query("update desktop_install set os_version = '<b>15</b>' where install_id = $1", [ID.macOld])
  const h = await asAdmin(pool)

  const html = await (await h.get('/ops/desktop/installs?below=0.6.0&channel=stable', h.admin)).text()
  assert.match(html, /macOS &lt;b&gt;15&lt;\/b&gt;/)
  assert.doesNotMatch(html, /<b>15<\/b>/)

  const bad = await h.get(
    `/ops/desktop/installs?below=${encodeURIComponent('"><script>x</script>')}&channel=stable`,
    h.admin
  )
  assert.equal(bad.status, 400)
  const page = await bad.text()
  assert.match(page, /below must be the expected minimum version/)
  assert.doesNotMatch(page, /<script>x<\/script>/)
  assert.match(page, /value="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;"/)
})
