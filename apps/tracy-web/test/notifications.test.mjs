// The Inbox doors (spec #809, step 1): a person reads and marks only their own notifications, the
// actor never gets a row for their own act, rows older than 90 days are neither shown nor kept, and
// the language the interface speaks (a pick, else the device, else English) reaches the account
// through the poll.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { sweepExpired } from '../src/cron.js'
import { addNotification, listNotifications, settleByRef, unreadCount } from '../src/notifications/store.js'
import { rosterRow } from '../src/seats/route.js'
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
  const send = async (email, method, path, { cookie = '', acceptLanguage = '' } = {}) => {
    const session = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    const headers = { cookie: cookie ? `${session}; ${cookie}` : session }
    if (acceptLanguage) headers['accept-language'] = acceptLanguage
    const res = await app.fetch(new Request(`http://tracy.test${path}`, { method, headers }))
    return { status: res.status, body: JSON.parse(await res.text()) }
  }
  return { pool, app, account, send }
}

test('a person lists, counts and marks only their own notifications', opts, async (t) => {
  const { pool, account, send } = await world(t)
  const akemi = await account('akemi@lab3.example')
  const lee = await account('lee@lab3.example')
  // A row that waits on nobody: a waiting request stays unread until settled (tested below).
  const first = await addNotification(pool, {
    recipient: akemi,
    kind: 'team.joined',
    actor: lee,
    siteKey: 'kinetic.vn',
    data: { role: 'editor' }
  })
  await addNotification(pool, {
    recipient: akemi,
    kind: 'comment.mention',
    actor: lee,
    data: { quote: 'Is this approved?' }
  })
  await addNotification(pool, { recipient: lee, kind: 'team.invited', actor: akemi })

  const all = await send('akemi@lab3.example', 'GET', '/api/notifications')
  assert.equal(all.status, 200)
  assert.equal(all.body.notifications.length, 2)
  assert.equal(all.body.unread, 2)
  assert.equal(all.body.notifications[0].kind, 'comment.mention', 'newest first')
  assert.equal(all.body.notifications[0].actor.email, 'lee@lab3.example')

  const read = await send('akemi@lab3.example', 'POST', `/api/notifications/${first.id}/read`)
  assert.equal(read.status, 200)
  assert.ok(read.body.notification.readAt)
  const unread = await send('akemi@lab3.example', 'GET', '/api/notifications?filter=unread')
  assert.deepEqual(
    unread.body.notifications.map((n) => n.kind),
    ['comment.mention']
  )
  assert.equal((await send('akemi@lab3.example', 'GET', '/api/notifications/unread')).body.unread, 1)

  // Lee's row is not Akemi's to mark.
  const leeRow = (await pool.query('select id from notification where account_id = $1', [lee])).rows[0].id
  assert.equal((await send('akemi@lab3.example', 'POST', `/api/notifications/${leeRow}/read`)).status, 404)

  assert.equal((await send('akemi@lab3.example', 'POST', '/api/notifications/read-all')).body.marked, 1)
  assert.equal((await send('akemi@lab3.example', 'GET', '/api/notifications/unread')).body.unread, 0)
  assert.equal((await send('lee@lab3.example', 'GET', '/api/notifications/unread')).body.unread, 1)
})

test(
  'each row draws its actor with the face /api/team gives the same account; no actor is null',
  opts,
  async (t) => {
    const { pool, account, send } = await world(t)
    const akemi = await account('akemi@lab3.example')
    const lee = await account('lee@lab3.example')
    await pool.query(`update account set display_name = 'Lee Nguyen', avatar_url = $2 where id = $1`, [
      lee,
      'https://lh3.googleusercontent.com/a/lee=s96-c'
    ])
    const joined = await addNotification(pool, {
      recipient: akemi,
      kind: 'team.joined',
      actor: lee,
      siteKey: 'kinetic.vn'
    })
    await addNotification(pool, { recipient: akemi, kind: 'team.invited' })

    // The Team tab's row for Lee, built by the door's own `rosterRow` from the same account.
    const seat = (
      await pool.query('select email, display_name, avatar_url from account where id = $1', [lee])
    ).rows[0]
    const team = rosterRow({ account_id: lee, seat, role: 'editor' })
    const face = { initial: team.initial, color: team.color, avatarUrl: team.avatarUrl }
    assert.equal(face.initial, 'L')
    assert.match(face.avatarUrl, new RegExp(`^/auth/avatar/${lee}\\?v=[0-9a-f]{8}$`))

    const list = await send('akemi@lab3.example', 'GET', '/api/notifications')
    const byKind = Object.fromEntries(list.body.notifications.map((n) => [n.kind, n]))
    assert.deepEqual(byKind['team.joined'].actor, {
      id: lee,
      email: 'lee@lab3.example',
      name: 'Lee Nguyen',
      face
    })
    assert.equal(byKind['team.invited'].actor, null, 'a system row has no actor, and so no face')

    const unread = await send('akemi@lab3.example', 'GET', '/api/notifications?filter=unread')
    assert.deepEqual(unread.body.notifications.find((n) => n.id === joined.id).actor.face, face)

    // Marking a row read answers it the way the list does: the actor named, with the same face.
    const read = await send('akemi@lab3.example', 'POST', `/api/notifications/${joined.id}/read`)
    assert.equal(read.status, 200)
    assert.deepEqual(read.body.notification.actor, byKind['team.joined'].actor)
    assert.equal(read.body.notification.siteName, 'kinetic.vn')
    assert.ok(read.body.notification.readAt)
  }
)

test('the actor never gets a notification for their own act', opts, async (t) => {
  const { pool, account } = await world(t)
  const akemi = await account('akemi@lab3.example')
  assert.equal(await addNotification(pool, { recipient: akemi, kind: 'comment.reply', actor: akemi }), null)
  assert.equal((await pool.query('select count(*)::int as n from notification')).rows[0].n, 0)
})

test('rows about one request settle together, except the one that answered it', opts, async (t) => {
  const { pool, account } = await world(t)
  const [akemi, lee] = [await account('akemi@lab3.example'), await account('lee@lab3.example')]
  const ref = 'join:kinetic.vn:vincent'
  await addNotification(pool, { recipient: akemi, kind: 'team.join_request', ref })
  await addNotification(pool, { recipient: lee, kind: 'team.join_request', ref })
  assert.equal(await settleByRef(pool, ref, { except: lee }), 1)
  const { rows } = await pool.query(
    'select account_id, settled_at from notification order by account_id = $1',
    [akemi]
  )
  assert.equal(rows.find((r) => r.account_id === akemi).settled_at instanceof Date, true)
  assert.equal(rows.find((r) => r.account_id === lee).settled_at, null)
})

test('notifications older than 90 days are not shown, not counted, and swept', opts, async (t) => {
  const { pool, account, send } = await world(t)
  const akemi = await account('akemi@lab3.example')
  await addNotification(pool, { recipient: akemi, kind: 'team.invited' })
  await addNotification(pool, { recipient: akemi, kind: 'team.left' })
  await pool.query(`update notification set created_at = now() - interval '91 days' where kind = 'team.left'`)
  const list = await send('akemi@lab3.example', 'GET', '/api/notifications')
  assert.deepEqual(
    list.body.notifications.map((n) => n.kind),
    ['team.invited']
  )
  assert.equal(list.body.unread, 1)
  // The sweep takes a server-wide advisory lock; six other test files in the same CI shard run it
  // too, so a turn can come back `ran: false` (CI 04/10: 2 rows left, `2 !== 1`). Wait for a turn.
  for (let i = 0; i < 40 && !(await sweepExpired(pool)).ran; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.equal((await pool.query('select count(*)::int as n from notification')).rows[0].n, 1)
})

test('pages follow the createdAt cursor and refuse a malformed one', opts, async (t) => {
  const { pool, account, send } = await world(t)
  const akemi = await account('akemi@lab3.example')
  for (let i = 0; i < 52; i += 1) {
    const row = await addNotification(pool, { recipient: akemi, kind: 'comment.reply', data: { i } })
    await pool.query(`update notification set created_at = now() - make_interval(secs => $2) where id = $1`, [
      row.id,
      52 - i
    ])
  }
  const first = await send('akemi@lab3.example', 'GET', '/api/notifications')
  assert.equal(first.body.notifications.length, 50)
  assert.ok(first.body.next)
  const second = await send(
    'akemi@lab3.example',
    'GET',
    `/api/notifications?before=${encodeURIComponent(first.body.next)}`
  )
  assert.equal(second.body.notifications.length, 2)
  assert.equal(second.body.next, null)
  assert.equal((await send('akemi@lab3.example', 'GET', '/api/notifications?before=yesterday')).status, 400)
})

test(
  'the poll remembers the language the interface speaks: a pick, else the device if Tracy has it, else English',
  opts,
  async (t) => {
    const { pool, account, send } = await world(t)
    const akemi = await account('akemi@lab3.example')
    const language = async () =>
      (await pool.query('select language from account where id = $1', [akemi])).rows[0].language
    const poll = (headers) => send('akemi@lab3.example', 'GET', '/api/notifications/unread', headers)
    await poll({ acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' })
    assert.equal(await language(), 'vi', 'following a Vietnamese device: mail in Vietnamese')
    await poll({ cookie: 'tracy_lang=de', acceptLanguage: 'vi-VN' })
    assert.equal(await language(), 'de', 'a pick wins over the device')
    await poll({ acceptLanguage: 'ja-JP,ja;q=0.9' })
    assert.equal(
      await language(),
      'en',
      'back to Follow device on a Japanese device: English, not the old pick'
    )
    await poll({ cookie: 'tracy_lang=klingon', acceptLanguage: 'ko-KR' })
    assert.equal(await language(), 'en', 'an unknown pick and an unsupported device: English')
    await poll({})
    assert.equal(await language(), 'en', 'no hint at all: English')
  }
)

test('the Inbox names the language on screen, and that wins over a stale cookie', opts, async (t) => {
  const { pool, account, send } = await world(t)
  const akemi = await account('akemi@lab3.example')
  const language = async () =>
    (await pool.query('select language from account where id = $1', [akemi])).rows[0].language
  const poll = (query, headers) =>
    send('akemi@lab3.example', 'GET', `/api/notifications/unread${query}`, headers)
  await poll('?lang=en', { cookie: 'tracy_lang=vi', acceptLanguage: 'vi-VN' })
  assert.equal(await language(), 'en', 'the screen speaks English: mail in English, whatever the cookie says')
  await poll('?lang=zh-CN', {})
  assert.equal(await language(), 'zh', 'dsh writes zh-CN; tracy-web calls it zh')
  await poll('?lang=ja', { acceptLanguage: 'ja-JP' })
  assert.equal(await language(), 'en', 'a language Tracy does not have: English')
})

test('no session is 401; a session with no account yet sees an empty Inbox', opts, async (t) => {
  const { app, send } = await world(t)
  const res = await app.fetch(new Request('http://tracy.test/api/notifications'))
  assert.equal(res.status, 401)
  const empty = await send('nobody@lab3.example', 'GET', '/api/notifications')
  assert.deepEqual(empty.body, { notifications: [], next: null, unread: 0 })
})

test('settleByRef writes only a known outcome into data', opts, async (t) => {
  const { pool, account } = await world(t)
  const akemi = await account('akemi@lab3.example')
  await addNotification(pool, {
    recipient: akemi,
    kind: 'team.invited',
    ref: 'invite:a',
    data: { role: 'editor' }
  })
  await addNotification(pool, {
    recipient: akemi,
    kind: 'team.invited',
    ref: 'invite:b',
    data: { role: 'editor' }
  })
  await addNotification(pool, {
    recipient: akemi,
    kind: 'team.invited',
    ref: 'invite:c',
    data: { role: 'editor' }
  })
  await settleByRef(pool, 'invite:a', { outcome: 'accepted' })
  await settleByRef(pool, 'invite:b', { outcome: 'bogus' })
  await settleByRef(pool, 'invite:c')
  const { rows } = await pool.query('select ref, data, settled_at from notification order by ref')
  assert.deepEqual(
    rows.map((r) => [r.ref, r.data, r.settled_at instanceof Date]),
    [
      ['invite:a', { role: 'editor', outcome: 'accepted' }, true],
      ['invite:b', { role: 'editor' }, true],
      ['invite:c', { role: 'editor' }, true]
    ]
  )
})

test(
  'a request or invitation still waiting counts as unread and lists under Unread after it was read, until settled',
  opts,
  async (t) => {
    const { pool, account } = await world(t)
    const akemi = await account('akemi@lab3.example')
    const waiting = await addNotification(pool, {
      recipient: akemi,
      kind: 'team.join_request',
      ref: 'join:a'
    })
    await addNotification(pool, { recipient: akemi, kind: 'team.joined' })
    await pool.query('update notification set read_at = now() where account_id = $1', [akemi])
    assert.equal(await unreadCount(pool, akemi), 1, 'the waiting request still counts')
    const page = await listNotifications(pool, akemi, { filter: 'unread' })
    assert.deepEqual(
      page.notifications.map((n) => n.id),
      [waiting.id]
    )
    await settleByRef(pool, 'join:a')
    assert.equal(await unreadCount(pool, akemi), 0)
    assert.deepEqual((await listNotifications(pool, akemi, { filter: 'unread' })).notifications, [])
  }
)
