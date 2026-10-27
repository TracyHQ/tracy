// Settings › Notifications (spec #809, step 5): six groups with two switches each, all on by
// default; a person reads and changes only their own; the join-request group stays on whatever is
// asked; and a turned-off email stops the mail while the Inbox row is still written.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { createNotifier } from '../src/notifications/notify.js'
import { groupOfKind, NOTIFICATION_GROUPS, preferenceFor } from '../src/notifications/preferences.js'
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
  const account = async (email) =>
    (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
  const call = async (email, method, path, body) => {
    const headers = {}
    if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    )
    return { status: res.status, body: JSON.parse(await res.text()) }
  }
  return { pool, account, call }
}

const byId = (groups) => Object.fromEntries(groups.map((g) => [g.id, g]))

test('every notification kind the Inbox renders has exactly one group', () => {
  const kinds = NOTIFICATION_GROUPS.flatMap((g) => g.kinds)
  assert.equal(new Set(kinds).size, kinds.length, 'no kind in two groups')
  assert.equal(kinds.length, 23)
  assert.equal(groupOfKind('team.join_answered').id, 'join-requests')
  // A Viewer's request for edit access waits on the Owners like a join request (ADR 0028 §6); the
  // answer to the Viewer is about them.
  assert.equal(groupOfKind('team.edit_access_request').id, 'join-requests')
  assert.equal(groupOfKind('team.edit_access_answered').id, 'join-requests')
  assert.equal(groupOfKind('team.edit_access_approved').id, 'about-you')
  assert.equal(groupOfKind('team.edit_access_declined').id, 'about-you')
  // T13 loses the reader their access, like T8; T12 and T14 are the Site changes row (04/10).
  assert.equal(groupOfKind('team.site_deleted').id, 'about-you')
  assert.equal(groupOfKind('team.site_restored').id, 'site-changes')
  assert.equal(groupOfKind('team.site_renamed').id, 'site-changes')
  assert.equal(groupOfKind('comment.reopened').id, 'resolved-reopened')
  assert.equal(groupOfKind('site.something_new'), null)
})

test('GET answers the six groups, all on, join requests locked', opts, async (t) => {
  const { account, call } = await world(t)
  await account('akemi@lab3.example')
  const res = await call('akemi@lab3.example', 'GET', '/api/notifications/preferences')
  assert.equal(res.status, 200)
  assert.deepEqual(
    res.body.groups.map((g) => [g.id, g.section, g.locked, g.inbox, g.email]),
    [
      ['about-you', 'team', false, true, true],
      ['join-requests', 'team', true, true, true],
      ['teammates', 'team', false, true, true],
      ['site-changes', 'team', false, true, true],
      ['mentions-replies', 'comments', false, true, true],
      ['resolved-reopened', 'comments', false, true, true]
    ]
  )
  assert.equal((await call(null, 'GET', '/api/notifications/preferences')).status, 401)
})

test('PUT changes one channel of one group, for the caller only', opts, async (t) => {
  const { account, call } = await world(t)
  await account('akemi@lab3.example')
  await account('lee@lab3.example')
  const res = await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { teammates: { email: false } }
  })
  assert.equal(res.status, 200)
  assert.deepEqual(byId(res.body.groups).teammates, {
    id: 'teammates',
    section: 'team',
    locked: false,
    inbox: true,
    email: false
  })
  // A second change keeps the first.
  const again = await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { teammates: { inbox: false } }
  })
  assert.equal(byId(again.body.groups).teammates.email, false)
  assert.equal(byId(again.body.groups).teammates.inbox, false)
  const lee = await call('lee@lab3.example', 'GET', '/api/notifications/preferences')
  assert.equal(byId(lee.body.groups).teammates.email, true, "Lee's switches are untouched")
})

test('the join-request group cannot be turned off', opts, async (t) => {
  const { pool, account, call } = await world(t)
  const akemi = await account('akemi@lab3.example')
  const res = await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { 'join-requests': { inbox: false, email: false } }
  })
  assert.equal(res.status, 200)
  assert.deepEqual(
    [byId(res.body.groups)['join-requests'].inbox, byId(res.body.groups)['join-requests'].email],
    [true, true]
  )
  assert.equal((await pool.query('select count(*)::int as n from notification_preference')).rows[0].n, 0)
  // Even a row written behind the server's back does not silence it.
  await pool.query(
    "insert into notification_preference (account_id, group_id, inbox, email) values ($1, 'join-requests', false, false)",
    [akemi]
  )
  assert.deepEqual(await preferenceFor(pool, akemi, 'team.join_request'), { inbox: true, email: true })
})

test('PUT refuses an unknown group and a malformed body', opts, async (t) => {
  const { account, call } = await world(t)
  await account('akemi@lab3.example')
  const unknown = await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { nope: { email: false } }
  })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.body.code, 'UNKNOWN_GROUP')
  const bad = await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { teammates: { email: 'no' } }
  })
  assert.equal(bad.status, 400)
  assert.equal(bad.body.code, 'BAD_BODY')
  assert.equal((await call(null, 'PUT', '/api/notifications/preferences', { groups: {} })).status, 401)
})

test('preferenceFor reads the group of the kind; an unknown kind is on', opts, async (t) => {
  const { pool, account, call } = await world(t)
  const akemi = await account('akemi@lab3.example')
  await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { 'mentions-replies': { inbox: false } }
  })
  assert.deepEqual(await preferenceFor(pool, akemi, 'comment.reply'), { inbox: false, email: true })
  assert.deepEqual(await preferenceFor(pool, akemi, 'comment.resolved'), { inbox: true, email: true })
  assert.deepEqual(await preferenceFor(pool, akemi, 'site.something_new'), { inbox: true, email: true })
})

test('email off stops the mail but keeps the Inbox row', opts, async (t) => {
  const { pool, account, call } = await world(t)
  const akemi = await account('akemi@lab3.example')
  const lee = await account('lee@lab3.example')
  await call('akemi@lab3.example', 'PUT', '/api/notifications/preferences', {
    groups: { 'resolved-reopened': { email: false } }
  })
  const sent = []
  const notifier = createNotifier({
    pool,
    send: async (mail) => {
      sent.push(mail)
    },
    letterFor: ({ kind }) => ({ subject: kind, text: 't', html: '<p>h</p>' }),
    preferenceFor,
    log: { warn() {}, error() {} }
  })
  await notifier.notify({ recipients: [akemi, lee], kind: 'comment.resolved', actor: null })
  assert.deepEqual(
    sent.map((m) => m.to),
    ['lee@lab3.example']
  )
  const inbox = await call('akemi@lab3.example', 'GET', '/api/notifications')
  assert.deepEqual(
    inbox.body.notifications.map((n) => n.kind),
    ['comment.resolved']
  )
  const row = (await pool.query('select mail_state from notification where account_id = $1', [akemi])).rows[0]
  assert.equal(row.mail_state, 'none')
})
