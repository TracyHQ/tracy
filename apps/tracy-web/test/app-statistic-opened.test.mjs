import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { listStatistics, statisticQuery } from '../src/lib/app-statistic.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const NOW = Date.parse('2026-10-22T12:00:00Z')
const query = (q = {}) => statisticQuery({ days: '7', ...q }, NOW)
async function person(email) {
  return (await db.pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
}
async function opened(account, copy, at, version = '0.6.1', platform = 'mac') {
  await db.pool.query(
    `insert into ops_signal(kind,account_id,occurred_at,data) values('desktop.app_opened',$1,$2,$3)`,
    [account, at, { installId: copy, version, platform }]
  )
}

test('updater connections alone are not active app users and disclose unavailable data', opts, async () => {
  const account = await person('connection@example.test')
  await db.pool.query(
    `insert into desktop_install(install_id,channel,version,account_id,last_seen)
     values($1,'stable','0.6.0',$2,'2026-10-22T10:00:00Z')`,
    [randomUUID(), account]
  )
  const report = await listStatistics(db.pool, query(), NOW)
  assert.equal(report.activityAvailable, false)
  assert.equal(report.activityMinimumVersion, '0.6.1')
  assert.equal(report.summary.activeAppUsers, 0)
  assert.equal(report.rows[0].lastOpened, null)
  assert.equal(report.rows[0].daysUsed, 0)
})

test('active people merge copies, anonymous copies remain separate, and days use UTC+7', opts, async () => {
  const account = await person('opened@example.test')
  const one = randomUUID(),
    two = randomUUID(),
    anonymous = randomUUID()
  await opened(account, one, '2026-10-21T16:59:59Z')
  await opened(account, two, '2026-10-21T17:00:00Z')
  await opened(account, one, '2026-10-22T10:00:00Z')
  await opened(null, one, '2026-10-20T10:00:00Z')
  await opened(null, anonymous, '2026-10-22T10:00:00Z')
  await opened(account, one, '2026-10-10T10:00:00Z')
  const report = await listStatistics(db.pool, query(), NOW)
  assert.equal(report.activityAvailable, true)
  assert.equal(report.summary.activeAppUsers, 2)
  assert.equal(report.analytics.previous.activeAppUsers, 1)
  assert.equal(report.total, 1)
  assert.equal(report.rows[0].daysUsed, 2)
  assert.equal(report.rows[0].lastOpened, '2026-10-22T10:00:00.000Z')
  assert.equal(report.rows[0].installs, 0)
  assert.deepEqual(report.options.versions, ['0.6.1'])
  assert.deepEqual(report.options.platforms, ['macos'])
  assert.deepEqual(
    report.analytics.daily.slice(-2).map((r) => [r.day, r.activeAppUsers]),
    [
      ['2026-10-21', 1],
      ['2026-10-22', 2]
    ]
  )
  const today = await listStatistics(db.pool, query({ days: '1' }), NOW)
  assert.equal(today.rows[0].daysUsed, 1)
  const empty = await listStatistics(db.pool, query({ start: '2026-09-01', end: '2026-09-02' }), NOW)
  assert.equal(empty.activityAvailable, false)
  assert.equal(empty.summary.activeAppUsers, 0)
})

test(
  'opened filters apply historical event version/platform and account source without retroactive links',
  opts,
  async () => {
    const a = await person('a@example.test'),
      b = await person('b@example.test')
    const copy = randomUUID()
    await opened(null, copy, '2026-10-20T10:00:00Z')
    await db.pool.query(
      `insert into desktop_install(install_id,account_id,channel,version,platform,last_seen)
     values($1,$2,'stable','0.7.0','win','2026-10-22T10:00:00Z')`,
      [copy, b]
    )
    await opened(a, randomUUID(), '2026-10-21T10:00:00Z')
    await opened(b, randomUUID(), '2026-10-22T10:00:00Z', '0.7.0', 'win')
    await db.pool.query(
      `insert into ops_signal(kind,account_id,data) values('account.first_sign_in',$1,'{"source":{"source":"newsletter"}}')`,
      [a]
    )
    const filtered = await listStatistics(db.pool, query({ version: '0.6.1', platform: 'macos' }), NOW)
    assert.equal(filtered.summary.activeAppUsers, 2)
    assert.deepEqual(
      filtered.rows.map((r) => r.userId),
      [a]
    )
    assert.equal(
      (await listStatistics(db.pool, query({ source: 'newsletter' }), NOW)).summary.activeAppUsers,
      1
    )
    assert.equal(
      (await listStatistics(db.pool, query({ account: 'unlinked' }), NOW)).summary.activeAppUsers,
      1
    )
    const signed = await listStatistics(db.pool, query({ user: b }), NOW)
    assert.equal(signed.rows[0].daysUsed, 1)
    assert.equal(signed.rows[0].lastOpened, '2026-10-22T10:00:00.000Z')
  }
)

test('people activity columns sort numerically and place never-opened rows last', opts, async () => {
  const a = await person('a@example.test'),
    b = await person('b@example.test'),
    c = await person('c@example.test')
  await opened(a, randomUUID(), '2026-10-21T10:00:00Z')
  await opened(a, randomUUID(), '2026-10-22T10:00:00Z')
  await opened(b, randomUUID(), '2026-10-20T10:00:00Z')
  await db.pool.query(
    `insert into desktop_install(install_id,channel,version,account_id,last_seen)
     values($1,'stable','0.6.0',$2,'2026-10-22T10:00:00Z')`,
    [randomUUID(), c]
  )
  for (const sort of ['lastOpened', 'daysUsed']) {
    assert.deepEqual(
      (await listStatistics(db.pool, query({ sort }), NOW)).rows.map((r) => r.userId),
      [a, b, c]
    )
  }
})

test('opening visibility uses the complete current filter scope before pagination', opts, async () => {
  const a = await person('scope@example.test')
  await opened(a, randomUUID(), '2026-10-22T10:00:00Z')
  assert.equal((await listStatistics(db.pool, query({ q: 'no-match' }), NOW)).activityAvailable, false)
  assert.equal((await listStatistics(db.pool, query({ version: '9.9.9' }), NOW)).activityAvailable, false)
  assert.equal((await listStatistics(db.pool, query({ page: '2' }), NOW)).activityAvailable, true)
})
