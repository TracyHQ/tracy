import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readSignalCustomers } from '../src/lib/ops-signal-customers.js'
import { aggregateSignalGrowth, readGrowthTurns } from '../src/lib/ops-signal-growth.js'
import { signalQuery } from '../src/lib/ops-signal-query.js'
import { fileDb } from './_db.mjs'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-22T03:00:00Z')
const AT = Date.parse('2026-09-07T01:00:00Z')
const at = (n) => new Date(AT + n * 1000)
const person = (id = 'p', n = 0, source = {}) => ({
  account_id: id,
  email: `${id}@customer.test`,
  occurred_at: at(n),
  data: { source }
})
const event = (kind, n, data = {}, rest = {}) => ({
  id: n,
  kind,
  occurred_at: at(n),
  site_key: 'same.test',
  account_id: 'p',
  site_instance: at(10),
  site_demo: false,
  data,
  ...rest
})
const life = [
  event('site.create', 10, { platform: 'wordpress' }),
  event('site.result', 20, { outcome: 'done' })
]
const turn = (rest = {}) => ({
  actor: 'p@customer.test',
  site_key: 'same.test',
  site_instance: at(10),
  site_demo: false,
  opened_at: at(30),
  changed_at: at(35),
  ...rest
})
const run = (people = [person()], events = life, turns = [turn()], active = [], now = NOW) =>
  aggregateSignalGrowth(people, events, turns, active, now)
test('growth: ordered funnel, previous-step conversion, drop-offs and observed timing', () => {
  const out = run([person(), person('q')])
  assert.deepEqual(
    out.funnel.map((s) => [s.people, s.conversionPercent, s.dropped]),
    [
      [2, null, null],
      [1, 50, 1],
      [1, 100, 0],
      [1, 100, 0],
      [1, 100, 0]
    ]
  )
  assert.deepEqual(out.timing.firstSite, { n: 1, medianSeconds: null })
  assert.equal(out.channels[0].activationPercent, 50)
  assert.equal(out.channels[0].sites, 1)
})
test('growth: timing uses nearest rank, shown only at 20 observed people, never zero-filled', () => {
  for (const n of [19, 20, 21]) {
    const people = Array.from({ length: n + 1 }, (_, i) => person(`p${i}`))
    const events = people
      .slice(0, n)
      .map((p, i) =>
        event(
          'site.create',
          i + 1,
          {},
          { account_id: p.account_id, site_key: `site${i}.test`, site_instance: at(i + 1) }
        )
      )
    const out = run(people, events, [])
    assert.deepEqual(out.timing.firstSite, { n, medianSeconds: n < 20 ? null : Math.ceil(n / 2) })
  }
})
test('growth: actor, ready ordering, exact incarnation and successful-change evidence all matter', () => {
  for (const bad of [
    turn({ actor: 'other@customer.test' }),
    turn({ site_instance: at(11) }),
    turn({ site_instance: null }),
    turn({ site_demo: null }),
    turn({ site_demo: true }),
    turn({ opened_at: at(15), changed_at: at(16) })
  ])
    assert.equal(run(undefined, undefined, [bad]).funnel[3].people, 0)
  assert.equal(run(undefined, undefined, [turn({ changed_at: null })]).funnel[4].people, 0)
  assert.equal(run(undefined, undefined, [turn({ changed_at: at(29) })]).funnel[4].people, 0)
  assert.equal(
    run(undefined, [life[0], event('site.result', 20, { outcome: 'exported' })]).funnel[2].people,
    0
  )
})
test('growth: deleted sites retain readiness; reused key ownership and unknown demo are isolated', () => {
  const events = [
    ...life,
    event('site.delete', 40),
    event('site.create', 50, {}, { account_id: 'q', site_instance: at(50) }),
    event('site.result', 60, { outcome: 'done' }, { site_instance: at(50) })
  ]
  assert.deepEqual(
    run([person(), person('q')], events, [turn()]).funnel.map((s) => s.people),
    [2, 2, 2, 1, 1]
  )
  assert.equal(
    run(
      undefined,
      life.map((e) => ({ ...e, site_demo: null }))
    ).funnel[1].people,
    0
  )
  assert.equal(
    run(
      undefined,
      life.map((e) => ({ ...e, site_demo: null }))
    ).coverage.unknownSiteLifetimes,
    1
  )
  assert.equal(run([person('p', 100)]).funnel[1].people, 0)
})
test('growth: follow-up includes activity after acquisition dates but stops at readAt', () => {
  assert.deepEqual(
    run(undefined, undefined, undefined, [], AT + 34000).funnel.map((s) => s.people),
    [1, 1, 1, 1, 0]
  )
  assert.deepEqual(
    run(undefined, undefined, undefined, [], AT + 15000).funnel.map((s) => s.people),
    [1, 1, 0, 0, 0]
  )
})

test('audit 2: deletion ends readiness and request eligibility for that incarnation', () => {
  const deleted = [...life, event('site.delete', 25)]
  assert.equal(run(undefined, deleted, [turn()]).funnel[3].people, 0)
  assert.equal(run(undefined, deleted, [turn({ opened_at: at(25) })]).funnel[3].people, 0)
  assert.equal(
    run(undefined, deleted, [turn({ opened_at: at(24), changed_at: null })]).funnel[3].people,
    1,
    'a request before deletion remains part of historical activation'
  )
  const lateReady = [life[0], event('site.delete', 15), life[1]]
  assert.equal(run(undefined, lateReady, []).funnel[2].people, 0)
  assert.equal(
    run(undefined, deleted, [turn({ opened_at: at(24), changed_at: at(26) })]).funnel[4].people,
    0,
    'a change dated after deletion is not proof of work on that lifetime'
  )
})
test('growth: retention has mature denominators, exact boundaries, pending, and separate definitions', () => {
  const readAt = AT + 15 * DAY
  const out = run(
    [person(), person('q', 10 * 86400)],
    [],
    [
      turn({ opened_at: new Date(AT + 7 * DAY) }),
      turn({ actor: 'q@customer.test', opened_at: new Date(AT + 14 * DAY) })
    ],
    [{ account_id: 'p', days: ['2026-09-14'] }],
    readAt
  )
  const mature = out.retention.find((r) => r.week === '2026-09-07').weeks
  assert.deepEqual(mature[0], {
    week: 1,
    eligible: 1,
    pending: 0,
    presence: 1,
    requests: 1,
    presencePercent: 100,
    requestPercent: 100
  })
  assert.equal(mature[1].eligible, 0)
  assert.equal(mature[1].requestPercent, null)
  const pending = out.retention.find((r) => r.week === '2026-09-14').weeks[0]
  assert.equal(pending.pending, 1)
  assert.equal(pending.requests, 0)
  const zero = run(undefined, [], [], [], readAt).retention[0].weeks[0]
  assert.equal(zero.requestPercent, 0)
})
test('growth: all 205 people contribute, channel counts are additive, missing source remains unknown', () => {
  const people = Array.from({ length: 205 }, (_, i) =>
    person(`p${i}`, 0, i % 2 ? { medium: 'email', source: 'ja', campaign: 'launch' } : {})
  )
  const out = run(people, [], [])
  assert.equal(out.people, 205)
  assert.equal(
    out.channels.reduce((n, r) => n + r.signIns, 0),
    205
  )
  assert.equal(out.channels.find((r) => r.channel === 'none').signIns, 103)
  assert.equal(out.funnel[1].conversionPercent, 0)
  assert.equal(out.funnel[2].conversionPercent, null)
  assert.equal(run([], [], []).funnel[1].conversionPercent, null)
})
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pgOnly = { skip: !process.env.TEST_DATABASE_URL }
test(
  'growth SQL: exact successful turn write or closed committed files proves a change',
  pgOnly,
  async () => {
    const { pool } = db
    const insert = async (id, files = 0, state = 'closed', closed = at(40)) =>
      pool.query(
        "insert into site_turn(turn_id,site_key,session_id,turn,actor,title,opened_at,closed_at,state,files,site_demo,site_instance) values($1,$2,$1,1,$3,'test',$4,$5,$6,$7,false,$8)",
        [id, 'same.test', 'p@customer.test', at(30), closed, state, files, at(10)]
      )
    for (const [id, files, state, closed] of [
      ['failed', 0],
      ['missing', 0],
      ['success', 0],
      ['files', 2],
      ['open-files', 2, 'open', null],
      ['wrong-site', 0],
      ['pre-request', 0]
    ])
      await insert(id, files, state, closed)
    for (const [id, outcome, site, when] of [
      ['failed', 'refused'],
      ['missing', 'unknown'],
      ['success', 'ok'],
      ['wrong-site', 'ok', 'other.test'],
      ['pre-request', 'ok', 'same.test', at(29)]
    ])
      await pool.query(
        "insert into site_write(site_key,turn_id,action,outcome,at) values($1,$2,'content.update',$3,$4)",
        [site ?? 'same.test', id, outcome, when ?? at(35)]
      )
    const turns = await readGrowthTurns(pool, ['p@customer.test'], NOW)
    assert.deepEqual(
      turns
        .filter((t) => t.changed_at)
        .map((t) => t.turn_id)
        .sort(),
      ['files', 'success']
    )
  }
)
test(
  'growth SQL: staff excluded, older sign-in excluded, same-site filters and aggregates precede cap',
  pgOnly,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into account(email) select 'p'||n||'@customer.test' from generate_series(1,205) n"
    )
    await pool.query(
      "insert into ops_signal(kind,account_id,data,occurred_at) select 'account.first_sign_in',id,jsonb_build_object('email',email,'source',jsonb_build_object('medium','email')), $1 from account",
      [new Date(NOW - DAY)]
    )
    const params = new URLSearchParams('days=7')
    const result = await readSignalCustomers(pool, signalQuery(params, NOW), NOW)
    assert.equal(result.rows.length, 200)
    assert.equal(result.growth.people, 205)
    assert.equal(result.growth.channels[0].signIns, 205)
    const id = (await pool.query("select id from account where email='p1@customer.test'")).rows[0].id
    await pool.query(
      "insert into ops_signal(kind,account_id,data,occurred_at) values('account.first_sign_in',$1,$2,$3)",
      [id, { email: 'p1@customer.test' }, new Date(NOW - 30 * DAY)]
    )
    assert.equal((await readSignalCustomers(pool, signalQuery(params, NOW), NOW)).growth.people, 204)
  }
)

test('growth: first request median also needs 20 observed people', () => {
  for (const n of [19, 20]) {
    const people = Array.from({ length: n + 1 }, (_, i) => person(`r${i}`))
    const events = people
      .slice(0, n)
      .flatMap((p, i) => [
        event('site.create', 1, {}, { account_id: p.account_id, site_key: `r${i}.test` }),
        event('site.result', 2, { outcome: 'done' }, { site_key: `r${i}.test` })
      ])
    const turns = people
      .slice(0, n)
      .map((p, i) => turn({ actor: p.email, site_key: `r${i}.test`, opened_at: at(i + 3), changed_at: null }))
    assert.deepEqual(run(people, events, turns).timing.firstRequest, { n, medianSeconds: n < 20 ? null : 12 })
  }
})

test(
  'growth SQL: real staff, same-site combined filters, and reused domain request attribution',
  pgOnly,
  async () => {
    const { pool } = db
    const signup = new Date(NOW - 5 * DAY)
    const oldInstance = new Date(NOW - 4 * DAY)
    const newInstance = new Date(NOW - 2 * DAY)
    await pool.query(
      "insert into account(email) values('p@customer.test'),('q@customer.test'),('staff@customer.test')"
    )
    const ids = new Map((await pool.query('select id,email from account')).rows.map((r) => [r.email, r.id]))
    const staff = ids.get('staff@customer.test')
    const workspace = (
      await pool.query("insert into workspace(display_name,kind) values('Tracy','tracy_admin') returning id")
    ).rows[0].id
    await pool.query(
      "insert into seat_workspace(workspace_id,account_id,role,accepted_at) values($1,$2,'admin',now())",
      [workspace, staff]
    )
    await pool.query(
      "insert into ops_signal(kind,account_id,data,occurred_at) select 'account.first_sign_in',id,jsonb_build_object('email',email),$1 from account",
      [signup]
    )
    const put = (kind, email, site, instance, offset, data) =>
      pool.query(
        'insert into ops_signal(kind,account_id,site_key,site_instance,site_demo,occurred_at,data) values($1,$2,$3,$4,false,$5,$6)',
        [kind, email ? ids.get(email) : null, site, instance, new Date(instance.getTime() + offset), data]
      )
    await put('site.create', 'p@customer.test', 'same.test', oldInstance, 0, { platform: 'wordpress' })
    await put('site.result', null, 'same.test', oldInstance, 1000, { outcome: 'done' })
    await put('site.delete', null, 'same.test', oldInstance, 2000, {})
    await put('site.create', 'q@customer.test', 'same.test', newInstance, 0, { platform: 'joomla' })
    await put('site.stuck', null, 'same.test', newInstance, 1000, {})
    await put('site.create', 'p@customer.test', 'p-joomla.test', newInstance, 0, { platform: 'joomla' })
    await put('site.result', null, 'p-joomla.test', newInstance, 1000, { outcome: 'done' })
    const request = async (id, actor, instance, opened = new Date(NOW - DAY)) => {
      await pool.query(
        "insert into site_turn(turn_id,site_key,session_id,turn,actor,title,opened_at,site_instance,site_demo) values($1,'same.test',$1,1,$2,'test',$3,$4,false)",
        [id, actor, opened, instance]
      )
      await pool.query(
        "insert into site_write(site_key,turn_id,action,outcome,at) values('same.test',$1,'content.update','ok',$2)",
        [id, new Date(opened.getTime() + 100)]
      )
    }
    await request('correct-old', 'p@customer.test', oldInstance, new Date(oldInstance.getTime() + 1500))
    await request('wrong-lifetime', 'q@customer.test', oldInstance)
    const read = (search = '') =>
      readSignalCustomers(pool, signalQuery(new URLSearchParams(`days=7&${search}`), NOW), NOW)
    const all = await read()
    assert.equal(all.growth.people, 2, 'accepted staff are excluded from all new aggregates')
    assert.deepEqual(
      all.growth.funnel.map((s) => s.people),
      [2, 2, 1, 1, 1]
    )
    assert.equal((await read('cms=wordpress&status=deleted')).growth.people, 1)
    assert.equal(
      (await read('cms=joomla&status=deleted')).growth.people,
      0,
      'CMS and status must match the same lifetime'
    )
    const pending = await read('cms=joomla&status=stuck')
    assert.equal(pending.growth.people, 1)
    assert.equal(pending.growth.funnel[3].people, 0, 'another incarnation cannot supply a request')
  }
)

test(
  'growth SQL: both median samples independently reconcile at 19 and 20 observed completers',
  pgOnly,
  async () => {
    const { pool } = db
    const signedIn = new Date(NOW - 5 * DAY)
    const add = async (i) => {
      const email = `median${i}@customer.test`
      const id = (await pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
      const instance = new Date(signedIn.getTime() + i * 1000)
      const site = `median${i}.test`
      await pool.query(
        "insert into ops_signal(kind,account_id,data,occurred_at) values('account.first_sign_in',$1,$2,$3)",
        [id, { email }, signedIn]
      )
      await pool.query(
        "insert into ops_signal(kind,account_id,site_key,site_instance,site_demo,data,occurred_at) values('site.create',$1,$2,$3,false,'{}',$3),('site.result',$1,$2,$3,false,'{\"outcome\":\"done\"}',$4)",
        [id, site, instance, new Date(instance.getTime() + 1000)]
      )
      await pool.query(
        "insert into site_turn(turn_id,site_key,session_id,turn,actor,title,opened_at,site_instance,site_demo) values($1,$1,$1,1,$2,'test',$3,$4,false)",
        [site, email, new Date(instance.getTime() + 2000), instance]
      )
    }
    for (let i = 1; i <= 20; i++) {
      await add(i)
      if (i < 19) continue
      const query = signalQuery(new URLSearchParams('days=7'), NOW)
      const result = await readSignalCustomers(pool, query, NOW)
      const oracle = (
        await pool.query(`select count(*)::int n,
      case when count(*)>=20 then percentile_disc(0.5) within group(order by extract(epoch from s.occurred_at-p.occurred_at)) end site_median,
      case when count(*)>=20 then percentile_disc(0.5) within group(order by extract(epoch from t.opened_at-p.occurred_at)) end request_median
      from ops_signal p join ops_signal s on s.account_id=p.account_id and s.kind='site.create'
      join site_turn t on lower(t.actor)=p.data->>'email' and t.site_key=s.site_key and t.site_instance=s.site_instance
      where p.kind='account.first_sign_in'`)
      ).rows[0]
      assert.deepEqual(result.growth.timing, {
        firstSite: {
          n: oracle.n,
          medianSeconds: oracle.site_median === null ? null : Number(oracle.site_median)
        },
        firstRequest: {
          n: oracle.n,
          medianSeconds: oracle.request_median === null ? null : Number(oracle.request_median)
        }
      })
    }
  }
)
