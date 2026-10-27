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
const read = (query = {}) =>
  listStatistics(db.pool, statisticQuery({ view: 'installs', days: '7', ...query }, NOW), NOW)
async function person(email) {
  return (await db.pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
}
async function copy(account, version = '0.7.0', platform = 'mac', firstSeen = '2026-10-17T10:00:00Z') {
  const id = randomUUID()
  await db.pool.query(
    `insert into desktop_install(install_id,account_id,channel,version,platform,first_seen,last_seen,linked_at)
    values($1,$2,'stable',$3,$4,$5,'2026-10-22T10:00:00Z','2026-10-22T11:00:00Z')`,
    [id, account, version, platform, firstSeen]
  )
  return id
}
async function opened(account, id, at, version = '0.6.1', platform = 'mac') {
  await db.pool.query(
    `insert into ops_signal(kind,account_id,occurred_at,data)
    values('desktop.app_opened',$1,$2,$3)`,
    [account, at, { installId: id, version, platform }]
  )
}

test('copy subset funnel keeps one unit, current identity and immutable opening evidence', opts, async () => {
  const a = await person('a@example.test'),
    b = await person('b@example.test')
  const first = await copy(a),
    second = await copy(a),
    third = await copy(b),
    anonymous = await copy(null)
  await opened(null, first, '2026-10-18T10:00:00Z')
  await opened(a, first, '2026-10-19T10:00:00Z')
  await opened(a, first, '2026-10-20T10:00:00Z')
  await opened(a, third, '2026-10-19T10:00:00Z')
  await opened(null, anonymous, '2026-10-19T10:00:00Z')
  await opened(b, randomUUID(), '2026-10-19T10:00:00Z')
  const report = await read()
  assert.deepEqual(report.analytics.desktopGrowth.funnel, { copies: 4, signedIn: 3, opened: 1 })
  assert.equal(report.analytics.desktopGrowth.openedCopiesOutsideConnections, 1)
  const people = await read({ view: 'users' })
  assert.deepEqual(people.analytics.desktopGrowth.funnel, { copies: 3, signedIn: 3, opened: 1 })
  assert.equal(people.total, 2)
  assert.equal((await read({ user: a })).analytics.desktopGrowth.funnel.copies, 2)
  const searched = await read({ view: 'users', q: a })
  assert.equal(searched.analytics.desktopGrowth.funnel.opened, 1)
  assert.equal(searched.summary.activeAppUsers, 1)
  assert.equal(
    searched.analytics.desktopGrowth.adoption.reduce((sum, row) => sum + row.total, 0),
    3
  )
  assert.equal((await read({ account: 'unlinked' })).analytics.desktopGrowth.funnel.signedIn, 0)
  assert(second)
})

test('shares include Unknown, aggregate before pagination, search and combined filters', opts, async () => {
  const a = await person('group@example.test')
  for (let i = 0; i < 21; i++) await copy(a, i < 10 ? '0.6.1' : '0.7.0', i < 11 ? 'mac' : 'win')
  await copy(null, null, 'linux')
  const report = await read({ pageSize: '10', page: '2' })
  const data = report.analytics.desktopGrowth
  assert.equal(report.rows.length, 10)
  assert.equal(data.distributionTotal, 22)
  for (const dimension of ['platform', 'version']) {
    const rows = data.distribution.filter((row) => row.dimension === dimension)
    assert.equal(
      rows.reduce((sum, row) => sum + row.count, 0),
      22
    )
    assert(Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 100) < 0.0001)
    if (dimension === 'version') assert.equal(rows.find((row) => row.label === 'Unknown').count, 1)
  }
  const filtered = (await read({ platform: 'macos', version: '0.7.0', q: 'group' })).analytics.desktopGrowth
  assert.equal(filtered.distributionTotal, 1)
  assert.equal(
    filtered.newCopies.reduce((sum, row) => sum + row.copies, 0),
    1
  )
  assert.equal((await read({ q: 'missing' })).analytics.desktopGrowth.distributionTotal, 0)
  assert.equal((await read({ view: 'quickstarts' })).analytics.desktopGrowth, null)
})

test(
  'adoption uses saved event version by copy/day, retains anonymous opens and empty days',
  opts,
  async () => {
    const a = await person('versions@example.test')
    const id = await copy(a, '9.0.0', 'win')
    await opened(a, id, '2026-10-19T10:00:00Z', '0.6.1')
    await opened(a, id, '2026-10-20T10:00:00Z', '0.7.0')
    await opened(null, randomUUID(), '2026-10-20T10:00:00Z', null)
    const data = (await read()).analytics.desktopGrowth
    assert.equal(Date.parse(data.activityCollectionStart), Date.parse('2026-10-19T10:00:00Z'))
    assert.deepEqual(data.adoption.find((row) => row.day === '2026-10-19').versions, [
      { version: '0.6.1', copies: 1, share: 100 }
    ])
    assert.deepEqual(data.adoption.find((row) => row.day === '2026-10-20').versions, [
      { version: '0.7.0', copies: 1, share: 50 },
      { version: 'Unknown', copies: 1, share: 50 }
    ])
    assert.deepEqual(
      data.adoption.find((row) => row.day === '2026-10-21'),
      { day: '2026-10-21', total: 0, versions: [] }
    )
    assert(!data.adoption.some((row) => row.versions.some((version) => version.version === '9.0.0')))
    const empty = (await read({ start: '2026-09-01', end: '2026-09-02' })).analytics.desktopGrowth
    assert.equal(empty.distributionTotal, 0)
    assert.equal(empty.adoption.length, 2)
    assert.deepEqual(empty.funnel, { copies: 0, signedIn: 0, opened: 0 })
  }
)

test(
  'new copies use first contact even when latest contact moves outside the acquisition period',
  opts,
  async () => {
    const a = await person('new@example.test')
    await copy(a, '0.7.0', 'mac', '2026-10-17T17:00:00Z')
    const data = (await read({ start: '2026-10-18', end: '2026-10-18' })).analytics.desktopGrowth
    assert.equal(data.funnel.copies, 0)
    assert.equal(data.newCopies[0].copies, 1)
    assert.equal(data.newCopies[0].day, '2026-10-18')
  }
)

test('24h desktop windows are exact and hourly for activity, new copies and adoption', opts, async () => {
  const at = Date.parse('2026-10-22T12:37:12Z')
  const account = await person('hourly@example.test')
  const id = await copy(account, '0.7.0', 'mac', new Date(at - 86_400_000).toISOString())
  await db.pool.query('update desktop_install set last_seen=$1 where install_id=$2', [new Date(at - 1), id])
  for (const instant of [at - 86_400_001, at - 86_400_000, at - 1, at])
    await opened(account, id, new Date(instant).toISOString())
  const report = await listStatistics(db.pool, statisticQuery({ view: 'installs', days: '24h' }, at), at)
  assert.equal(Date.parse(report.analytics.range.end) - Date.parse(report.analytics.range.start), 86_400_000)
  assert.equal(report.analytics.daily.length, 24)
  assert.equal(report.analytics.previousDaily.length, 24)
  assert.equal(report.analytics.daily[0].activeAppUsers, 1)
  assert.equal(report.analytics.daily.at(-1).activeAppUsers, 1)
  assert.equal(report.analytics.desktopGrowth.newCopies.length, 24)
  assert.equal(report.analytics.desktopGrowth.newCopies[0].copies, 1)
  assert.equal(report.analytics.desktopGrowth.adoption.length, 24)
  assert.equal(
    report.analytics.desktopGrowth.adoption.reduce((sum, row) => sum + row.total, 0),
    2
  )
})

test('all time desktop empty history has no comparisons or invented buckets', opts, async () => {
  const report = await read({ days: 'all' })
  assert.equal(report.analytics.previous, null)
  assert.deepEqual(report.analytics.previousDaily, [])
  assert.deepEqual(report.analytics.daily, [])
  assert.equal(report.analytics.range.startAt, null)
  assert.equal(report.analytics.range.compare, false)
  assert.deepEqual(report.analytics.desktopGrowth.newCopies, [])
  assert.deepEqual(report.analytics.desktopGrowth.adoption, [])
})

test('all time desktop begins at first recorded contact and excludes the read instant', opts, async () => {
  const id = await copy(null, '0.7.0', 'mac', '2020-01-01T17:00:00Z')
  await opened(null, id, new Date(NOW).toISOString())
  const report = await read({ days: 'all' })
  assert.equal(report.analytics.range.startAt, '2020-01-01T17:00:00.000Z')
  assert.equal(report.analytics.daily[0].day, '2020-01-02')
  assert.equal(report.analytics.desktopGrowth.newCopies[0].day, '2020-01-02')
  assert.equal(report.summary.activeAppUsers, 0)
  assert.equal(report.analytics.previous, null)
})

test('empty source tags do not turn a known marketing channel into Unknown', opts, async () => {
  const account = await person('medium-only@example.test')
  const id = await copy(account)
  await db.pool.query(`insert into ops_signal(kind,account_id,data) values('account.first_sign_in',$1,$2)`, [
    account,
    { source: { source: '', medium: 'newsletter' } }
  ])
  await opened(account, id, '2026-10-22T10:00:00Z')
  const unknown = await read({ view: 'users', source: 'unknown' })
  assert.equal(unknown.total, 0)
  assert.equal(unknown.summary.activeAppUsers, 0)
  assert.equal(unknown.analytics.desktopGrowth.distributionTotal, 0)
  assert.equal((await read({ view: 'users', source: 'newsletter' })).total, 1)
})

test('server version sorting follows numeric release components across all pages', opts, async () => {
  const account = await person('version-sort@example.test')
  for (const version of ['0.9.0', '0.10.0', '0.10.0-dev.2', '0.10.0-dev.10', '0.10.0-preview.1'])
    await copy(account, version)
  const report = await read({ sort: 'version', direction: 'desc' })
  assert.deepEqual(
    report.rows.map((row) => row.version),
    ['0.10.0', '0.10.0-preview.1', '0.10.0-dev.10', '0.10.0-dev.2', '0.9.0']
  )
})

test(
  'same-time opening versions use numeric event sequence to resolve the first observation',
  opts,
  async () => {
    const account = await person('version-tie@example.test')
    const id = await copy(account)
    await db.pool.query(
      `insert into ops_signal(id,kind,account_id,occurred_at,data) values
      (9,'desktop.app_opened',$1,'2026-10-21T10:00:00Z',$2),
      (10,'desktop.app_opened',$1,'2026-10-21T10:00:00Z',$3)`,
      [
        account,
        { installId: id, version: '0.9.0', platform: 'mac' },
        { installId: id, version: '0.10.0', platform: 'mac' }
      ]
    )
    const data = (await read()).analytics.desktopGrowth
    assert.deepEqual(data.adoption.find((row) => row.day === '2026-10-21').versions, [
      { version: '0.9.0', copies: 1, share: 100 }
    ])
  }
)

test('source sorting uses the visible medium when the source tag is empty', opts, async () => {
  const rows = []
  for (const [name, source] of [
    ['newsletter', { source: '', medium: 'newsletter' }],
    ['alpha', { source: 'alpha' }]
  ]) {
    const account = await person(`${name}@example.test`)
    rows.push(account)
    await copy(account)
    await db.pool.query(
      `insert into ops_signal(kind,account_id,data) values('account.first_sign_in',$1,$2)`,
      [account, { source }]
    )
  }
  const report = await read({ view: 'users', sort: 'source', direction: 'asc' })
  assert.deepEqual(
    report.rows.map((row) => row.userId),
    [rows[1], rows[0]]
  )
})
