// The first-run screen's account flag (tasks/todo-web-onboard.md, ADR 0030): `GET /api/onboarding`
// says whether the signed-in account has closed the Getting started screen, `POST /api/onboarding`
// records it once. The screen on the web shows while the flag is null; the desktop app records it too
// when its screen closes, so the web never asks again someone who finished on the app.
// `POST /api/onboarding/menu-hide` records "Hide from account menu" once, read back as `menuHiddenAt`;
// `POST /api/onboarding/menu-show` ("Show in account menu") clears it.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world(_t) {
  const { pool } = db
  const config = readConfig(env)
  const app = buildApp({ config, pool, mail: { send: async () => {} }, host: { hostCall, hostJob } })
  const call = async (email, method, headers = {}, path = '/api/onboarding') => {
    const all = { ...headers }
    if (email) all.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    const res = await app.fetch(new Request(`http://tracy.test:8080${path}`, { method, headers: all }))
    return { status: res.status, body: JSON.parse(await res.text()) }
  }
  return { pool, call }
}

test('no session: both doors answer 401 NOT_SIGNED_IN', opts, async (t) => {
  const { call } = await world(t)
  for (const method of ['GET', 'POST']) {
    const res = await call(null, method)
    assert.equal(res.status, 401)
    assert.equal(res.body.code, 'NOT_SIGNED_IN')
  }
})

test(
  'a new account has not closed the screen; POST records it once and GET then says when',
  opts,
  async (t) => {
    const { pool, call } = await world(t)
    await pool.query("insert into account (email) values ('new@tracy.test')")
    assert.deepEqual((await call('new@tracy.test', 'GET')).body, { completedAt: null, menuHiddenAt: null })

    const first = await call('new@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' })
    assert.equal(first.status, 200)
    assert.ok(!Number.isNaN(Date.parse(first.body.completedAt)), 'an ISO time')

    const again = await call('new@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' })
    assert.equal(again.body.completedAt, first.body.completedAt, 'idempotent: the first time stays')
    assert.deepEqual((await call('new@tracy.test', 'GET')).body, { ...first.body, menuHiddenAt: null })
  }
)

test(
  'a session whose account has no row yet: GET says not closed, POST creates the account and records',
  opts,
  async (t) => {
    const { pool, call } = await world(t)
    assert.deepEqual((await call('fresh@tracy.test', 'GET')).body, { completedAt: null, menuHiddenAt: null })
    const res = await call('fresh@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' })
    assert.equal(res.status, 200)
    const { rows } = await pool.query(
      "select onboarding_completed_at from account where email = 'fresh@tracy.test'"
    )
    assert.ok(rows[0].onboarding_completed_at instanceof Date)
  }
)

test('one account closing the screen never marks another', opts, async (t) => {
  const { call } = await world(t)
  await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' })
  assert.deepEqual((await call('b@tracy.test', 'GET')).body, { completedAt: null, menuHiddenAt: null })
})

test('POST from a customer page on a sibling host is refused by the cross-site guard', opts, async (t) => {
  const { call } = await world(t)
  const res = await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-site' })
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'CSRF_ORIGIN')
  assert.deepEqual((await call('a@tracy.test', 'GET')).body, { completedAt: null, menuHiddenAt: null })
})

const HIDE = '/api/onboarding/menu-hide'

test(
  'menu-hide: null until the first POST, which is kept; a later POST answers the same time',
  opts,
  async (t) => {
    const { call } = await world(t)
    assert.equal((await call('row@tracy.test', 'GET')).body.menuHiddenAt, null)
    const first = await call('row@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    assert.equal(first.status, 200)
    assert.deepEqual(Object.keys(first.body), ['menuHiddenAt'])
    assert.ok(!Number.isNaN(Date.parse(first.body.menuHiddenAt)), 'an ISO time')
    const again = await call('row@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    assert.equal(again.body.menuHiddenAt, first.body.menuHiddenAt, 'idempotent: the first time stays')
    // Both flags come back together, and hiding the row does not close the screen.
    assert.deepEqual((await call('row@tracy.test', 'GET')).body, {
      completedAt: null,
      menuHiddenAt: first.body.menuHiddenAt
    })
  }
)

test(
  'menu-hide: 401 without a session, 403 from a sibling host, and one account never hides another',
  opts,
  async (t) => {
    const { call } = await world(t)
    const none = await call(null, 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    assert.equal(none.status, 401)
    assert.equal(none.body.code, 'NOT_SIGNED_IN')
    const sibling = await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-site' }, HIDE)
    assert.equal(sibling.status, 403)
    assert.equal(sibling.body.code, 'CSRF_ORIGIN')
    assert.equal((await call('a@tracy.test', 'GET')).body.menuHiddenAt, null)
    await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    assert.equal((await call('b@tracy.test', 'GET')).body.menuHiddenAt, null)
  }
)

const SHOW = '/api/onboarding/menu-show'

test(
  'menu-show: clears a hide so the row comes back; a later hide records a new time; showing twice is harmless',
  opts,
  async (t) => {
    const { call } = await world(t)
    const hidden = await call('back@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    assert.ok(hidden.body.menuHiddenAt)
    const shown = await call('back@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, SHOW)
    assert.equal(shown.status, 200)
    assert.deepEqual(shown.body, { menuHiddenAt: null })
    assert.deepEqual((await call('back@tracy.test', 'GET')).body, { completedAt: null, menuHiddenAt: null })
    const again = await call('back@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, SHOW)
    assert.deepEqual(again.body, { menuHiddenAt: null })
    const rehidden = await call('back@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    assert.ok(!Number.isNaN(Date.parse(rehidden.body.menuHiddenAt)), 'hidden again after showing')
  }
)

test(
  'menu-show: 401 without a session, 403 from a sibling host, and one account never shows another',
  opts,
  async (t) => {
    const { call } = await world(t)
    const none = await call(null, 'POST', { 'sec-fetch-site': 'same-origin' }, SHOW)
    assert.equal(none.status, 401)
    assert.equal(none.body.code, 'NOT_SIGNED_IN')
    await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    await call('b@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, HIDE)
    const sibling = await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-site' }, SHOW)
    assert.equal(sibling.status, 403)
    assert.equal(sibling.body.code, 'CSRF_ORIGIN')
    assert.ok((await call('a@tracy.test', 'GET')).body.menuHiddenAt, 'a refused show changes nothing')
    await call('a@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, SHOW)
    assert.equal((await call('a@tracy.test', 'GET')).body.menuHiddenAt, null)
    assert.ok((await call('b@tracy.test', 'GET')).body.menuHiddenAt, 'b stays hidden')
  }
)

test('menu-show: a session whose account has no row yet answers null', opts, async (t) => {
  const { call } = await world(t)
  const res = await call('nobody@tracy.test', 'POST', { 'sec-fetch-site': 'same-origin' }, SHOW)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { menuHiddenAt: null })
})

// Usage of the first-run guides (`onboarding/usage.js`): steps reached and how a showing ended.
const STEP = '/api/onboarding/step'
async function post(world, email, body) {
  const { app, config } = world
  const res = await app.fetch(
    new Request(`http://tracy.test:8080${STEP}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        ...(email ? { cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}` } : {})
      },
      body: JSON.stringify(body)
    })
  )
  return { status: res.status, body: JSON.parse(await res.text()) }
}
function stepWorld() {
  const config = readConfig(env)
  const app = buildApp({ config, pool: db.pool, mail: { send: async () => {} }, host: { hostCall, hostJob } })
  return { app, config }
}
const signals = async (kind) =>
  (await db.pool.query('select data from ops_signal where kind = $1 order by id', [kind])).rows.map(
    (r) => r.data
  )

test(
  'POST /api/onboarding/step keeps one step per showing and step, and one end per showing',
  opts,
  async () => {
    const w = stepWorld()
    const run = '5b3c4d6e-7f80-4192-a3b4-c5d6e7f80912'
    assert.equal((await post(w, null, { runId: run, flow: 'welcome', step: '1' })).status, 401)
    for (const step of ['1', '2', '2']) {
      const res = await post(w, 'new@tracy.test', { runId: run.toUpperCase(), flow: 'welcome', step })
      assert.deepEqual(res, { status: 200, body: { ok: true } })
    }
    for (const end of ['escape', 'close'])
      assert.equal(
        (await post(w, 'new@tracy.test', { runId: run, flow: 'welcome', step: '2', end })).status,
        200
      )
    assert.deepEqual(await signals('onboard.step'), [
      { run_id: run, flow: 'welcome', step: '1', email: 'new@tracy.test' },
      { run_id: run, flow: 'welcome', step: '2', email: 'new@tracy.test' }
    ])
    // The first end wins: a showing ends once.
    assert.deepEqual(await signals('onboard.exit'), [
      { run_id: run, flow: 'welcome', step: '2', end: 'escape', email: 'new@tracy.test' }
    ])
    const tour = '6c4d5e7f-8091-42a3-b4c5-d6e7f8091a23'
    assert.equal(
      (await post(w, 'new@tracy.test', { runId: tour, flow: 'tour-site', step: 'publish', end: 'skip' }))
        .status,
      200
    )
    assert.equal((await signals('onboard.exit')).at(-1).flow, 'tour-site')
  }
)

test(
  'POST /api/onboarding/step refuses what is not on the closed lists, and keeps nothing for it',
  opts,
  async () => {
    const w = stepWorld()
    const run = '7d5e6f80-91a2-43b4-c5d6-e7f8091a2b34'
    const cases = [
      [{ flow: 'welcome', step: '1' }, 'INVALID_RUN_ID'],
      [{ runId: 'nope', flow: 'welcome', step: '1' }, 'INVALID_RUN_ID'],
      [{ runId: run, flow: 'checkout', step: '1' }, 'INVALID_FLOW'],
      [{ runId: run, flow: 'toString', step: '1' }, 'INVALID_FLOW'],
      [{ runId: run, flow: 'welcome', step: '9' }, 'INVALID_STEP'],
      [{ runId: run, flow: 'tour-start', step: 'publish' }, 'INVALID_STEP'],
      [{ runId: run, flow: 'welcome', step: '1', end: 'skip' }, 'INVALID_END'],
      [{ runId: run, flow: 'tour-site', step: 'team', end: 'cta' }, 'INVALID_END']
    ]
    for (const [body, code] of cases)
      assert.deepEqual(await post(w, 'new@tracy.test', body), { status: 400, body: { code } })
    assert.deepEqual(await signals('onboard.step'), [])
    assert.deepEqual(await signals('onboard.exit'), [])
  }
)
