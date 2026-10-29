import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { listStatistics, statisticDetail, statisticQuery } from '../src/lib/app-statistic.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { mintSession } from '../src/lib/session.js'
import { appStatisticRoutes } from '../src/ops/app-statistic.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const NOW = Date.parse('2026-10-10T12:00:00Z')
const recent = '2026-10-10T11:00:00Z'
const old = '2026-09-01T11:00:00Z'
const quiet = { warn() {}, log() {}, error() {} }
const query = (values = {}) => statisticQuery({ days: '7', ...values })
async function account(email = 'person@example.test') {
  return (await db.pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
}
async function install(user = null, version = '1.0.0', lastSeen = recent) {
  const id = randomUUID()
  await db.pool.query(
    `insert into desktop_install(install_id,channel,version,account_id,first_seen,last_seen,linked_at)
    values($1,'stable',$2,$3,$4,$4,case when $3::uuid is null then null else $4::timestamptz end)`,
    [id, version, user, lastSeen]
  )
  return id
}
async function download(user = null, version = '1.0.0', at = recent) {
  const id = randomUUID()
  await db.pool.query(
    `insert into desktop_download(id,requested_at,account_id,version,channel,platform,file,dedupe_key)
    values($1::uuid,$2,$3,$4,'stable','macos','Tracy.dmg',$1::text)`,
    [id, at, user, version]
  )
  return id
}
async function signal(user, siteKey, kind, at, data = {}) {
  await db.pool.query(
    'insert into ops_signal(account_id,site_key,kind,occurred_at,data) values($1,$2,$3,$4,$5)',
    [user, siteKey, kind, at, JSON.stringify(data)]
  )
}

test('rejects malformed filters instead of broadening the requested scope', () => {
  for (const bad of [
    { view: 'visitors' },
    { days: '24' },
    { account: 'signed-in' },
    { sort: 'id;drop' },
    { direction: 'sideways' },
    { page: '0' },
    { pageSize: '500' },
    { user: 'not-an-id' },
    { channel: 'production' },
    { q: 'x'.repeat(201) }
  ]) {
    assert.throws(() => query(bad))
  }
})

test(
  'users aggregate real account-linked app copies; anonymous downloads never enrich people',
  opts,
  async () => {
    const user = await account()
    const first = await install(user)
    await install(user)
    await download(user)
    await download(user)
    await download()
    await install()
    const all = await listStatistics(db.pool, query(), NOW)
    assert.equal(all.total, 1)
    assert.equal(all.rows[0].downloads, undefined)
    assert.equal(all.rows[0].installs, 2)
    assert.deepEqual(all.summary, {
      users: 1,
      activeAppUsers: 0,
      installs: 2,
      quickstarts: 0,
      linkedInstalls: 2,
      unlinkedInstalls: 0
    })
    await db.pool.query("update desktop_install set version='2.0.0',last_seen=$2 where install_id=$1", [
      first,
      recent
    ])
    const updated = await listStatistics(db.pool, query({ view: 'installs', user }), NOW)
    assert.equal(updated.total, 2)
    assert.ok(updated.rows.some((r) => r.installId === first && r.version === '2.0.0'))
    assert.equal((await listStatistics(db.pool, query({ version: '2.0.0' }), NOW)).rows[0].installs, 1)
  }
)

test('pagination exceeds 500, remains stable, and preserves totals on an empty page', opts, async () => {
  await db.pool.query(
    `insert into desktop_install(install_id,channel,version,last_seen)
    select md5(n::text)::uuid,'stable','1.0.0',$1 from generate_series(1,551) n`,
    [recent]
  )
  const one = await listStatistics(db.pool, query({ view: 'installs', pageSize: '100' }), NOW)
  const last = await listStatistics(db.pool, query({ view: 'installs', pageSize: '100', page: '6' }), NOW)
  assert.equal(one.total, 551)
  assert.equal(one.rows.length, 100)
  assert.equal(last.rows.length, 51)
  assert.equal(last.summary.installs, 551)
  assert.equal(new Set([...one.rows, ...last.rows].map((r) => r.id)).size, 151)
  const empty = await listStatistics(db.pool, query({ view: 'installs', page: '100' }), NOW)
  assert.equal(empty.total, 551)
  assert.equal(empty.rows.length, 0)
})

test('people sort by matching app contact without treating template requests as app use', opts, async () => {
  const older = await account('older@example.test')
  const newer = await account('newer@example.test')
  const templateOnly = await account('template@example.test')
  await install(older, '1.0.0', '2026-10-08T09:00:00Z')
  await install(newer, '1.0.0', '2026-10-09T09:00:00Z')
  await quickstart(older, 'quickstart/ja-kinetic/j5', recent)
  await quickstart(templateOnly, 'quickstart/ja-kinetic/j5', recent)
  const all = await listStatistics(db.pool, query(), NOW)
  assert.equal(query().sort, 'lastAppContact')
  assert.deepEqual(
    all.rows.map((r) => r.userId),
    [newer, older, templateOnly]
  )
  assert.deepEqual(
    all.rows.map((r) => r.lastAppContact),
    ['2026-10-09T09:00:00.000Z', '2026-10-08T09:00:00.000Z', null]
  )
  await install(older, '2.0.0', '2026-10-10T10:00:00Z')
  const matchingVersion = await listStatistics(db.pool, query({ version: '1.0.0' }), NOW)
  assert.deepEqual(
    matchingVersion.rows.map((r) => r.userId),
    [newer, older]
  )
  assert.equal(matchingVersion.rows[1].lastAppContact, '2026-10-08T09:00:00.000Z')
  const today = await listStatistics(db.pool, query({ days: '1' }), NOW)
  assert.deepEqual(
    today.rows.map((r) => r.userId),
    [older, templateOnly]
  )
  assert.equal(today.rows[0].lastAppContact, '2026-10-10T10:00:00.000Z')
  assert.equal(
    (await statisticDetail(db.pool, 'users', older, NOW)).row.lastAppContact,
    '2026-10-10T10:00:00.000Z'
  )
  assert.equal(query({ view: 'installs' }).sort, 'time')
  assert.equal(
    (await listStatistics(db.pool, query({ view: 'installs', sort: 'lastAppContact' }), NOW)).rows.length,
    3
  )
})

test(
  'rolling date, unknown identity, literal search and account filters match their counts',
  opts,
  async () => {
    const user = await account('percent%person@example.test')
    await install(user)
    await install(null, '1.0.0', old)
    await download(null)
    await download(user, '1.0.0', old)
    const downloads = await listStatistics(db.pool, query({ view: 'downloads' }), NOW)
    assert.equal(downloads.total, 1)
    assert.equal(downloads.rows[0].email, undefined)
    assert.equal(downloads.rows[0].installId, undefined)
    assert.equal(
      (await listStatistics(db.pool, query({ view: 'downloads', account: 'linked' }), NOW)).total,
      1
    )
    assert.equal((await listStatistics(db.pool, query({ view: 'downloads', days: 'all' }), NOW)).total, 2)
    assert.equal((await listStatistics(db.pool, query({ q: '%' }), NOW)).total, 1)
    assert.equal((await listStatistics(db.pool, query({ q: '_' }), NOW)).total, 0)
    assert.equal(
      (await listStatistics(db.pool, query({ view: 'installs', account: 'unlinked' }), NOW)).total,
      0
    )
    assert.equal((await listStatistics(db.pool, query({ source: 'unknown' }), NOW)).total, 1)
  }
)

test(
  'anonymous detail never groups other anonymous records; sign-in linkage identifies one install',
  opts,
  async () => {
    const first = await install()
    await install()
    await download()
    const before = await statisticDetail(db.pool, 'installs', first, NOW)
    assert.equal(before.installs.length, 1)
    assert.equal(before.downloads, undefined)
    assert.equal(before.activity.length, 0)
    assert.equal(before.row.account, 'unlinked')
    const user = await account()
    await db.pool.query('update desktop_install set account_id=$2,linked_at=$3 where install_id=$1', [
      first,
      user,
      recent
    ])
    const after = await statisticDetail(db.pool, 'installs', first, NOW)
    assert.equal(after.row.email, 'person@example.test')
    assert.equal(after.row.account, 'linked')
    assert.equal((await listStatistics(db.pool, query(), NOW)).total, 1)
    assert.equal((await listStatistics(db.pool, query({ view: 'downloads' }), NOW)).rows[0].userId, undefined)
  }
)

test('needs attention excludes resolved history and restores manually reopened issues', opts, async () => {
  const user = await account()
  await install(user)
  await signal(user, 'demo', 'site.stuck', '2026-10-09T10:00:00Z', { step: 'build', reason: 'timeout' })
  assert.equal((await listStatistics(db.pool, query({ attention: 'needs-attention' }), NOW)).total, 1)
  await signal(user, 'demo', 'site.result', '2026-10-09T11:00:00Z', { outcome: 'done' })
  assert.equal((await listStatistics(db.pool, query({ attention: 'needs-attention' }), NOW)).total, 0)
  await signal(user, 'demo', 'ops.reopened', '2026-10-09T12:00:00Z')
  const detail = await statisticDetail(db.pool, 'users', user, NOW)
  assert.equal(detail.issues.length, 1)
  assert.equal(detail.issues[0].reason, 'timeout')
  await signal(user, 'demo', 'ops.handled', '2026-10-09T13:00:00Z')
  assert.equal((await statisticDetail(db.pool, 'users', user, NOW)).issues.length, 0)
})

test('both list and detail require an accepted Tracy admin workspace seat', opts, async () => {
  const config = { origin: 'https://cowork.tracy.test', sessionSecret: 's'.repeat(32) }
  const app = new Hono().route('/', appStatisticRoutes({ pool: db.pool, config, now: () => NOW }))
  const user = await account('staff@example.test')
  const id = await install(user)
  const cookie = `tracy_sess=${await mintSession('staff@example.test', config.sessionSecret)}`
  const read = (path, headers = {}) => app.request(`https://cowork.tracy.test${path}`, { headers })
  for (const path of ['/api/ops/app-statistic', `/api/ops/app-statistic/installs/${id}`]) {
    assert.equal((await read(path)).status, 302)
    assert.equal((await read(path, { cookie })).status, 403)
  }
  const ws = (
    await db.pool.query("insert into workspace(display_name,kind) values('Tracy','tracy_admin') returning id")
  ).rows[0].id
  await db.pool.query(
    "insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,'developer',$2,now())",
    [ws, user]
  )
  const response = await read('/api/ops/app-statistic', { cookie })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await read('/api/ops/app-statistic?pageSize=999', { cookie })).status, 400)
  assert.equal((await read(`/api/ops/app-statistic/installs/${id}`, { cookie })).status, 200)
  assert.equal((await read('/api/ops/app-statistic/installs/invalid', { cookie })).status, 404)
  await db.pool.query('update seat_workspace set revoked_at=now()')
  assert.equal((await read('/api/ops/app-statistic', { cookie })).status, 403)
})

test(
  'account source is attribution of first sign-in, not assigned to anonymous downloads or installs',
  opts,
  async () => {
    const user = await account()
    await install(user)
    await download()
    await signal(user, null, 'account.first_sign_in', '2026-10-01T10:00:00Z', {
      source: { source: 'newsletter', medium: 'email' }
    })
    const users = await listStatistics(db.pool, query({ source: 'newsletter' }), NOW)
    assert.equal(users.total, 1)
    assert.deepEqual(users.rows[0].source, { source: 'newsletter', medium: 'email' })
    assert.equal(
      (await listStatistics(db.pool, query({ view: 'downloads', source: 'newsletter' }), NOW)).total,
      0
    )
    assert.equal(
      (await listStatistics(db.pool, query({ view: 'installs', source: 'newsletter' }), NOW)).total,
      1
    )
    assert.equal((await statisticDetail(db.pool, 'users', user, NOW)).row.source.source, 'newsletter')
  }
)

test(
  'full application serves the installed list and detail routes behind the same staff boundary',
  opts,
  async () => {
    const config = readConfig({
      TRACY_ORIGIN: 'https://cowork.tracy.test',
      SITE_DOMAIN: 'tracy.test',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'prod1',
      HOST_prod1_ORIGIN: 'http://prod1',
      HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
      HOST_prod1_SECRET: 'h1',
      SEAT_prod1_SECRET: 'k1'
    })
    const user = await account('full@example.test')
    const id = await install(user)
    const ws = (
      await db.pool.query(
        "insert into workspace(display_name,kind) values('Tracy','tracy_admin') returning id"
      )
    ).rows[0].id
    await db.pool.query(
      "insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,'developer',$2,now())",
      [ws, user]
    )
    const app = buildApp({
      config,
      pool: db.pool,
      host,
      mail: { send: async () => {} },
      sites: dbSitesResolver(db.pool, config),
      fetchImpl: async () => Response.json({ error: 'unexpected' }, { status: 500 }),
      now: () => NOW
    })
    const cookie = `tracy_sess=${await mintSession('full@example.test', config.sessionSecret)}`
    for (const path of ['/api/ops/app-statistic?days=all', `/api/ops/app-statistic/installs/${id}`]) {
      const response = await app.fetch(
        new Request(`https://cowork.tracy.test${path}`, { headers: { cookie } })
      )
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  }
)

test(
  'detail reports truncated account histories and version search matches users and installs',
  opts,
  async () => {
    const user = await account()
    await db.pool.query(
      `insert into desktop_install(install_id,channel,version,account_id,last_seen)
    select md5(n::text)::uuid,'stable','2.9.7',$1,$2 from generate_series(1,101) n`,
      [user, recent]
    )
    const users = await listStatistics(db.pool, query({ q: '2.9.7' }), NOW)
    assert.equal(users.total, 1)
    assert.equal(users.rows[0].installs, 101)
    assert.equal((await listStatistics(db.pool, query({ view: 'installs', q: '2.9.7' }), NOW)).total, 101)
    const detail = await statisticDetail(db.pool, 'users', user, NOW)
    assert.equal(detail.installs.length, 100)
    assert.equal(detail.truncated.installs, true)
    assert.equal(detail.truncated.downloads, undefined)
  }
)

test(
  'legacy email-only account events appear without stealing events assigned to another account',
  opts,
  async () => {
    const user = await account('legacy@example.test')
    const other = await account('other@example.test')
    const unlinked = await install()
    await install(user)
    await signal(null, 'legacy-site', 'site.create', recent, { email: 'LEGACY@example.test' })
    await signal(other, 'other-site', 'site.import', recent, { email: 'legacy@example.test' })
    const detail = await statisticDetail(db.pool, 'users', user, NOW)
    assert.deepEqual(
      detail.activity.map((e) => e.siteKey),
      ['legacy-site']
    )
    assert.equal((await statisticDetail(db.pool, 'installs', unlinked, NOW)).activity.length, 0)
  }
)

test(
  'an install reports the platform whose channel file it read, in the downloads vocabulary',
  opts,
  async () => {
    const ids = {}
    for (const platform of ['mac', 'win', 'linux']) {
      ids[platform] = randomUUID()
      await db.pool.query(
        `insert into desktop_install(install_id,channel,platform,version,last_seen) values($1,'stable',$2,'0.4.0',$3)`,
        [ids[platform], platform, recent]
      )
    }
    const { rows } = await listStatistics(db.pool, query({ view: 'installs' }), NOW)
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.platform])), {
      [ids.mac]: 'macos',
      [ids.win]: 'windows',
      [ids.linux]: 'linux'
    })
    const detail = await statisticDetail(db.pool, 'installs', ids.win, NOW)
    assert.equal(detail.row.platform, 'windows')
  }
)

test('downloads and installs filter by operating system, which the options list', opts, async () => {
  const user = await account()
  for (const [platform, file] of [
    ['macos', 'Tracy-Cowork-0.4.0-arm64.dmg'],
    ['windows', 'Tracy-Cowork-0.4.0-win-x64-setup.exe'],
    ['linux', 'Tracy-Cowork-0.4.0-linux-x64.AppImage']
  ])
    await db.pool.query(
      `insert into desktop_download(id,requested_at,account_id,version,channel,platform,arch,file,dedupe_key)
      values(gen_random_uuid(),$1,$2,'0.4.0','stable',$3,'x64',$4,$4)`,
      [recent, user, platform, file]
    )
  for (const platform of ['mac', 'win'])
    await db.pool.query(
      `insert into desktop_install(install_id,channel,platform,version,account_id,last_seen) values(gen_random_uuid(),'stable',$1,'0.4.0',$2,$3)`,
      [platform, user, recent]
    )
  const of = async (view, platform) =>
    (await listStatistics(db.pool, query({ view, platform }), NOW)).rows.map((r) => r.platform ?? r.id).sort()
  assert.deepEqual(await of('downloads', 'windows'), ['windows'])
  assert.deepEqual(await of('downloads', 'linux'), ['linux'])
  assert.deepEqual(await of('installs', 'windows'), ['windows'])
  assert.deepEqual(await of('installs', 'linux'), [])
  assert.deepEqual(await of('downloads', ''), ['linux', 'macos', 'windows'])
  const users = await listStatistics(db.pool, query({ view: 'users', platform: 'windows' }), NOW)
  assert.equal(users.summary.downloads, undefined)
  assert.equal(users.summary.installs, 1)
  assert.deepEqual(users.options.platforms, ['linux', 'macos', 'windows'])
  assert.throws(() => query({ platform: 'ios' }), /platform/)
})

async function quickstart(user = null, tag = 'quickstart/ja-kinetic/j6', at = recent, referrer = null) {
  const id = randomUUID()
  await db.pool.query(
    'insert into quickstart_download(id,account_id,tag,at,referrer) values($1,$2,$3,$4,$5)',
    [id, user, tag, at, referrer]
  )
  return id
}

test('the quickstarts view drops desktop-only filters and accepts a template filter', () => {
  const q = query({
    view: 'quickstarts',
    version: '1.0.0',
    channel: 'stable',
    platform: 'macos',
    account: 'linked',
    template: 'ja-kinetic',
    sort: 'template'
  })
  assert.equal(q.view, 'quickstarts')
  assert.equal(q.version, '')
  assert.equal(q.channel, '')
  assert.equal(q.platform, '')
  assert.equal(q.account, 'all')
  assert.equal(q.template, 'ja-kinetic')
  assert.equal(q.sort, 'template')
  // A template names quickstart rows only; on the desktop views it would empty every table.
  assert.equal(query({ view: 'downloads', template: 'ja-kinetic' }).template, '')
  assert.throws(() => query({ view: 'quickstarts', template: 'x'.repeat(201) }), /template/)
})

test(
  'one quickstart row is one admitted zip request; a deleted account stays a counted unknown',
  opts,
  async () => {
    const user = await account('quick@example.test')
    await signal(user, null, 'account.first_sign_in', '2026-10-01T10:00:00Z', {
      source: { source: 'joomlart' }
    })
    const mine = await quickstart(user, 'quickstart/ja-kinetic/j6', recent)
    const gone = await account('gone@example.test')
    const orphan = await quickstart(gone, 'quickstart/ja-purity/wp', recent)
    await db.pool.query('delete from account where id=$1', [gone])
    const list = await listStatistics(
      db.pool,
      query({ view: 'quickstarts', sort: 'template', direction: 'asc' }),
      NOW
    )
    assert.equal(list.total, 2)
    assert.equal(list.dateField, 'requestedAt')
    assert.deepEqual(
      list.rows.map((r) => [r.id, r.userId, r.email, r.template, r.cms]),
      [
        [mine, user, 'quick@example.test', 'ja-kinetic', 'j6'],
        [orphan, null, null, 'ja-purity', 'wp']
      ]
    )
    assert.equal(list.rows[0].requestedAt, new Date(recent).toISOString())
    assert.deepEqual(list.rows[0].source, { source: 'joomlart' })
    assert.equal(list.rows[1].source, null)
    assert.equal(list.summary.quickstarts, 2)
    assert.equal(list.summary.users, 1)
    assert.deepEqual(list.options.templates, ['ja-kinetic', 'ja-purity'])
    const one = await listStatistics(db.pool, query({ view: 'quickstarts', template: 'ja-purity' }), NOW)
    assert.deepEqual(
      one.rows.map((r) => r.id),
      [orphan]
    )
    assert.equal((await listStatistics(db.pool, query({ view: 'quickstarts', q: 'kinetic' }), NOW)).total, 1)
    assert.equal((await listStatistics(db.pool, query({ view: 'quickstarts', q: 'quick@' }), NOW)).total, 1)
    assert.equal(
      (await listStatistics(db.pool, query({ view: 'quickstarts', source: 'joomlart' }), NOW)).total,
      1
    )
    // Desktop filters do not apply to a quickstart; they are dropped, not turned into an empty table.
    assert.equal(
      (await listStatistics(db.pool, query({ view: 'quickstarts', version: '9.9.9' }), NOW)).total,
      2
    )
  }
)

test(
  'the quickstart date range starts exactly at midnight UTC+7 for seven inclusive days',
  opts,
  async () => {
    const boundary = new Date('2026-10-03T17:00:00Z')
    const inside = await quickstart(null, 'quickstart/ja-kinetic/j6', boundary.toISOString())
    await quickstart(null, 'quickstart/ja-kinetic/j6', new Date(boundary.getTime() - 1).toISOString())
    const list = await listStatistics(db.pool, query({ view: 'quickstarts' }), NOW)
    assert.deepEqual(
      list.rows.map((r) => r.id),
      [inside]
    )
    assert.equal((await listStatistics(db.pool, query({ view: 'quickstarts', days: 'all' }), NOW)).total, 2)
  }
)

test(
  'users count quickstarts once beside downloads and installs, and quickstart-only users appear',
  opts,
  async () => {
    const both = await account('both@example.test')
    const only = await account('only@example.test')
    for (let n = 0; n < 3; n++) await download(both)
    for (let n = 0; n < 2; n++) await install(both)
    for (let n = 0; n < 2; n++) await quickstart(both)
    await quickstart(both, 'quickstart/ja-kinetic/j6', old)
    await quickstart(only)
    await quickstart(null)
    const users = await listStatistics(db.pool, query({ sort: 'user', direction: 'asc' }), NOW)
    assert.deepEqual(
      users.rows.map((r) => [r.email, r.downloads, r.installs, r.quickstarts]),
      [
        ['both@example.test', undefined, 2, 2],
        ['only@example.test', undefined, 0, 1]
      ]
    )
    assert.equal(users.summary.quickstarts, 3)
    assert.equal(
      (await listStatistics(db.pool, query({ sort: 'quickstarts', direction: 'desc' }), NOW)).rows[0].email,
      'both@example.test'
    )
    // A desktop version filter keeps desktop records only; a quickstart has no app version.
    assert.deepEqual(
      (await listStatistics(db.pool, query({ version: '1.0.0' }), NOW)).rows.map((r) => [
        r.email,
        r.quickstarts
      ]),
      [['both@example.test', 0]]
    )
    // Detail rows are all time, as for downloads and installs: the old quickstart counts there.
    const detail = await statisticDetail(db.pool, 'users', both, NOW)
    assert.equal(detail.row.quickstarts, 3)
    assert.equal(detail.quickstarts.length, 3)
    assert.equal(detail.downloads, undefined)
  }
)

test('quickstart paging is server-side and stable past 50 rows', opts, async () => {
  await db.pool.query(
    `insert into quickstart_download(id,tag,at)
    select md5(n::text)::uuid,'quickstart/ja-kinetic/j6',$1 from generate_series(1,120) n`,
    [recent]
  )
  const first = await listStatistics(db.pool, query({ view: 'quickstarts' }), NOW)
  const third = await listStatistics(db.pool, query({ view: 'quickstarts', page: '3' }), NOW)
  assert.equal(first.total, 120)
  assert.equal(first.pages, 3)
  assert.equal(first.rows.length, 50)
  assert.equal(third.rows.length, 20)
  assert.equal(new Set([...first.rows, ...third.rows].map((r) => r.id)).size, 70)
  assert.equal(
    (await listStatistics(db.pool, query({ view: 'quickstarts', pageSize: '100', page: '2' }), NOW)).rows
      .length,
    20
  )
})

test(
  'quickstart detail lists the same account’s quickstarts and activity, never another anonymous row',
  opts,
  async () => {
    const user = await account('quick@example.test')
    const other = await account('other@example.test')
    const first = await quickstart(user)
    await quickstart(user, 'quickstart/ja-purity/wp', old)
    await quickstart(other)
    await download(user)
    await signal(user, 'demo', 'site.import', recent)
    const detail = await statisticDetail(db.pool, 'quickstarts', first, NOW)
    assert.equal(detail.row.id, first)
    assert.equal(detail.row.template, 'ja-kinetic')
    assert.deepEqual(detail.quickstarts.map((r) => r.template).sort(), ['ja-kinetic', 'ja-purity'])
    assert.equal(detail.downloads, undefined)
    assert.equal(detail.activity.length, 1)
    assert.equal(detail.truncated.quickstarts, false)
    const a = await quickstart(null)
    await quickstart(null)
    const anonymous = await statisticDetail(db.pool, 'quickstarts', a, NOW)
    assert.deepEqual(
      anonymous.quickstarts.map((r) => r.id),
      [a]
    )
    assert.equal(anonymous.activity.length, 0)
    assert.equal(await statisticDetail(db.pool, 'quickstarts', randomUUID(), NOW), null)
  }
)

test(
  'a quickstart row links its template page (Joomla only) and its release, and shows the recorded referrer',
  opts,
  async () => {
    const page = 'https://www.joomlart.com/joomla/templates/ja-kinetic'
    const joomla = await quickstart(null, 'quickstart/ja-kinetic/j6', recent, page)
    const wordpress = await quickstart(null, 'quickstart/ja-purity/wp7')
    const { rows } = await listStatistics(db.pool, query({ view: 'quickstarts', days: 'all' }), NOW)
    const of = Object.fromEntries(rows.map((r) => [r.id, r]))
    assert.equal(of[joomla].templateUrl, 'https://www.joomlart.com/joomla/templates/ja-kinetic')
    assert.equal(
      of[joomla].releaseUrl,
      'https://github.com/JoomlArt-Products/joomlart-products/releases/tag/quickstart/ja-kinetic/j6'
    )
    assert.equal(of[joomla].referrer, page)
    // A cms that is not Joomla gets no guessed template page; a row from before recording has no referrer.
    assert.equal(of[wordpress].templateUrl, null)
    assert.equal(
      of[wordpress].releaseUrl,
      'https://github.com/JoomlArt-Products/joomlart-products/releases/tag/quickstart/ja-purity/wp7'
    )
    assert.equal(of[wordpress].referrer, null)
    const found = await listStatistics(
      db.pool,
      query({ view: 'quickstarts', q: 'templates/ja-kinetic' }),
      NOW
    )
    assert.deepEqual(
      found.rows.map((r) => r.id),
      [joomla]
    )
    const detail = await statisticDetail(db.pool, 'quickstarts', joomla, NOW)
    assert.equal(detail.row.referrer, page)
    assert.equal(detail.quickstarts[0].templateUrl, 'https://www.joomlart.com/joomla/templates/ja-kinetic')
  }
)

test(
  'an account whose first sign-in came through JoomlArt sign-in reads JoomlArt as its source',
  opts,
  async () => {
    // Written by the real store, so the test reads what `/signin/joomlart/callback` records:
    // `via: 'JoomlArt'`, and a `source` only when the link carried `utm_*`.
    const identity = pgIdentityStore(db.pool)
    identity.setSignal(createOpsSignal({ pool: db.pool, config: {}, log: quiet }))
    const plain = await identity.upsertOAuthIdentity('joomlart', 'ja-1', 'plain@example.test')
    const tagged = await identity.upsertOAuthIdentity('joomlart', 'ja-2', 'tagged@example.test', {
      admission: { badge: 'gate off', plans: [], source: { medium: 'email', campaign: 'oct' } }
    })
    const named = await identity.upsertOAuthIdentity('joomlart', 'ja-3', 'named@example.test', {
      admission: { badge: 'gate off', plans: [], source: { source: 'newsletter' } }
    })
    const google = await identity.upsertOAuthIdentity('google', 'g-1', 'google@example.test')
    const byId = async () =>
      Object.fromEntries(
        (await listStatistics(db.pool, query({ days: 'all' }), NOW)).rows.map((r) => [r.id, r.source])
      )
    for (const a of [plain, tagged, named, google]) await quickstart(a.id)
    const sources = await byId()
    assert.deepEqual(sources[plain.id], { source: 'joomlart' })
    // A link's own utm values are kept; JoomlArt only fills the `source` the link left empty.
    assert.deepEqual(sources[tagged.id], { source: 'joomlart', medium: 'email', campaign: 'oct' })
    assert.deepEqual(sources[named.id], { source: 'newsletter' })
    // Google is a way to sign in, not where the person came from: still unknown.
    assert.equal(sources[google.id], null)
    const joomlart = await listStatistics(db.pool, query({ days: 'all', source: 'joomlart' }), NOW)
    assert.deepEqual(joomlart.rows.map((r) => r.id).sort(), [plain.id, tagged.id].sort())
    assert.ok(joomlart.options.sources.includes('joomlart'))
    const quick = await listStatistics(db.pool, query({ view: 'quickstarts', days: 'all' }), NOW)
    assert.deepEqual(quick.rows.find((r) => r.userId === plain.id).source, { source: 'joomlart' })
    assert.equal((await statisticDetail(db.pool, 'users', plain.id, NOW)).row.source.source, 'joomlart')
  }
)

test('custom UTC+7 dates reject invalid or incomplete intervals and allow small table pages', () => {
  for (const values of [
    { start: '2026-02-30', end: '2026-03-01' },
    { start: '2026-10-10' },
    { start: '2026-10-11', end: '2026-10-10' },
    { start: '2025-01-01', end: '2026-10-10' },
    { start: '2026-10-10', end: '2099-10-10' }
  ])
    assert.throws(() => query(values))
  assert.equal(query({ start: '2026-10-01', end: '2026-10-10', pageSize: '10' }).start, '2026-10-01')
})

test(
  'analytics uses the same bounded scope as the table and compares the preceding interval',
  opts,
  async () => {
    const user = await account()
    await download(user, '1.0.0', '2026-10-10T00:00:00Z')
    await download(null, '1.0.0', '2026-10-10T11:59:59Z')
    await download(null, '1.0.0', '2026-10-11T00:00:00Z')
    await download(null, '1.0.0', '2026-10-09T12:00:00Z')
    await download(null, '9.0.0', old)
    const list = await listStatistics(
      db.pool,
      query({ view: 'downloads', start: '2026-10-10', end: '2026-10-10' }),
      NOW
    )
    assert.equal(list.total, 2)
    assert.equal(list.summary.downloads, 2)
    assert.equal(list.analytics.previous.downloads, 1)
    assert.deepEqual(
      list.analytics.daily.map((r) => [r.day, r.downloads, r.users]),
      [['2026-10-10', 2, undefined]]
    )
    assert.deepEqual(
      list.analytics.previousDaily.map((r) => [r.day, r.downloads]),
      [['2026-10-09', 1]]
    )
    assert.equal(list.analytics.range.timeZone, 'Asia/Ho_Chi_Minh')
    assert.ok(list.options.versions.includes('9.0.0'))
    const search = await listStatistics(
      db.pool,
      query({ view: 'downloads', q: 'person@', start: '2026-10-10', end: '2026-10-10' }),
      NOW
    )
    assert.equal(search.summary.downloads, 0)
    assert.equal(search.analytics.previous.downloads, 0)
    assert.equal(search.analytics.daily[0].downloads, 0)
    const all = await listStatistics(db.pool, query({ view: 'downloads', days: 'all' }), NOW)
    assert.equal(all.analytics.previous, null)
    assert.equal(all.analytics.previousDaily.length, 0)
  }
)

test('daily users count each account once on its latest matching activity date', opts, async () => {
  const user = await account()
  await download(user, '1.0.0', '2026-10-08T10:00:00Z')
  await download(user, '1.0.0', '2026-10-09T10:00:00Z')
  await quickstart(user, 'quickstart/ja-kinetic/j6', '2026-10-10T10:00:00Z')
  const list = await listStatistics(db.pool, query({ start: '2026-10-08', end: '2026-10-10' }), NOW)
  assert.deepEqual(
    list.analytics.daily.map((r) => [r.day, r.users]),
    [
      ['2026-10-08', 0],
      ['2026-10-09', 0],
      ['2026-10-10', 1]
    ]
  )
  assert.equal(list.summary.users, 1)
})

test('installs ignore acquisition source because the install record does not capture it', () => {
  assert.equal(query({ view: 'installs', source: 'newsletter' }).source, '')
})

test('custom date validation uses today in UTC+7 even before UTC midnight', () => {
  const now = Date.parse('2026-10-10T18:00:00Z')
  assert.equal(statisticQuery({ start: '2026-10-11', end: '2026-10-11' }, now).end, '2026-10-11')
  assert.throws(() => statisticQuery({ start: '2026-10-12', end: '2026-10-12' }, now), /end/)
})

test('UTC+7 buckets and previous periods meet exactly at local midnight', opts, async () => {
  const user = await account()
  const previous = await download(user, '1.0.0', '2026-10-09T16:59:59.999Z')
  const current = await download(user, '1.0.0', '2026-10-09T17:00:00Z')
  await download(user, '1.0.0', '2026-10-10T17:00:00Z')
  for (const values of [{ days: '1' }, { start: '2026-10-10', end: '2026-10-10' }]) {
    const result = await listStatistics(db.pool, query({ view: 'downloads', ...values }), NOW)
    assert.deepEqual(
      result.rows.map((r) => r.id),
      [current]
    )
    assert.equal(result.analytics.previous.downloads, 1)
    assert.deepEqual(
      result.analytics.daily.map((r) => [r.day, r.downloads]),
      [['2026-10-10', 1]]
    )
    assert.deepEqual(
      result.analytics.previousDaily.map((r) => [r.day, r.downloads]),
      [['2026-10-09', 1]]
    )
    assert.deepEqual(result.analytics.range, {
      start: '2026-10-09T17:00:00.000Z',
      end: '2026-10-10T17:00:00.000Z',
      previousStart: '2026-10-08T17:00:00.000Z',
      previousEnd: '2026-10-09T17:00:00.000Z',
      timeZone: 'Asia/Ho_Chi_Minh',
      partialEnd: true
    })
  }
  const historical = await listStatistics(
    db.pool,
    query({ view: 'downloads', start: '2026-10-09', end: '2026-10-09' }),
    NOW
  )
  assert.deepEqual(
    historical.rows.map((r) => r.id),
    [previous]
  )
  assert.equal(historical.analytics.range.partialEnd, false)
})

test(
  'download responses expose recorded file data without account-only fields or linked filters',
  opts,
  async () => {
    const id = await download(await account())
    const list = await listStatistics(
      db.pool,
      query({ view: 'downloads', attention: 'needs-attention', account: 'linked', user: randomUUID() }),
      NOW
    )
    assert.equal(list.total, 1)
    for (const key of ['userId', 'email', 'name', 'installId', 'attention', 'installs', 'quickstarts'])
      assert.equal(Object.hasOwn(list.rows[0], key), false, key)
    assert.equal(Object.hasOwn(list.summary, 'users'), false)
    const detail = await statisticDetail(db.pool, 'downloads', id, NOW)
    assert.deepEqual(Object.keys(detail).sort(), ['readAt', 'row', 'view'])
  }
)
