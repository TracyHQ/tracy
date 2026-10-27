// The Comments list redesign's server half (`tasks/comments-list-redesign-plan.md`, 01/10/2026):
// a comment's number is never handed out twice; read marks are one person's
// (`045-site-comment-read.sql`, `/comments/reads`, `/:id/read`, `/:id/unread`) and say what the tab
// drew (`061-site-comment-read-seen-n.sql`), reading the Inbox rows of the replies they cover; and a
// site write citing a request's number stamps that request `answeredAt` — the tab's "Done by Tracy".
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCommentReads } from '../../../packages/ui/tracy-chat-input/src/client/comment-reads.mjs'
import { createCommentLists, rowsOf } from '../../../packages/ui/tracy-chat-input/src/client/comment-view.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { migrate } from '../src/db/index.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'
import { fileDb, scratchPool } from './_db.mjs'

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
const SITE = 'lantern.localhost'
const OTHER = 'harbor.localhost'
const PART = { kind: 'templatePart', key: 'footer', fields: { content: '<p>Lantern Studio</p>' } }

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** Two sites; owner and editor on SITE, a stranger with a seat on OTHER only; a component that answers. */
async function world(_t) {
  const { pool } = db
  let answer = { ok: true, apply_id: 'a-1' }
  const fetchImpl = async () => new Response(JSON.stringify(answer), { status: 200 })
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  const seat = async (siteKey, email, role) => {
    const { rows } = await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [siteKey, rows[0].id, role]
    )
  }
  for (const [key, label] of [
    [SITE, 'lantern'],
    [OTHER, 'harbor']
  ])
    await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [key, label, 'local'])
  await seat(SITE, 'owner@x.y', 'owner')
  await seat(SITE, 'editor@x.y', 'editor')
  await seat(OTHER, 'stranger@x.y', 'owner')
  await writeComponent(
    pool,
    SITE,
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const send = async (email, method, path, body) => {
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
          'content-type': 'application/json'
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const base = `/api/sites/${SITE}/comments`
  const post = async (email, extra = {}) => {
    const made = await send(email, 'POST', base, {
      text: 'Footer says Lantern',
      url: `https://${SITE}/`,
      element: null,
      ...extra
    })
    assert.equal(made.status, 201)
    return made.body.comment
  }
  /** A browser's fetch for `email`: what a client module sends, with that person's cookie. */
  const raw = async (email, path, init = {}) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        ...init,
        headers: {
          ...init.headers,
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`
        }
      })
    )
  return { pool, send, raw, base, post, answer: (next) => void (answer = next) }
}

test(
  'a comment number is never handed out twice: delete, then create, takes the next one',
  opts,
  async (t) => {
    const w = await world(t)
    const first = await w.post('editor@x.y')
    const second = await w.post('editor@x.y')
    assert.equal((await w.send('editor@x.y', 'DELETE', `${w.base}/${second.id}`)).status, 200)
    const third = await w.post('editor@x.y')
    assert.deepEqual([first.n, second.n, third.n], [1, 2, 3])
    // A send to Tracy takes numbers from the same sequence; the next comment comes after them.
    const sent = await w.send('editor@x.y', 'POST', `/api/sites/${SITE}/requests`, {
      sessionId: 's',
      requestId: 'r',
      items: [{ url: `https://${SITE}/`, element: null, text: '', commentId: first.id }]
    })
    assert.equal(sent.status, 201)
    assert.equal(sent.body.requests[0].n, 4)
    assert.equal((await w.post('owner@x.y')).n, 5)
  }
)

test('read marks are per person: read, unread, and nobody else sees them', opts, async (t) => {
  const w = await world(t)
  const c = await w.post('owner@x.y')
  assert.deepEqual((await w.send('editor@x.y', 'GET', `${w.base}/reads`)).body, { reads: [] })

  const read = await w.send('editor@x.y', 'POST', `${w.base}/${c.id}/read`, { seenN: c.n })
  assert.equal(read.status, 200)
  assert.deepEqual(read.body, { read: { id: c.id, seenN: c.n } })
  const mine = (await w.send('editor@x.y', 'GET', `${w.base}/reads`)).body.reads
  assert.deepEqual(mine, [{ id: c.id, seenN: c.n }])
  // The owner's marks are the owner's: none.
  assert.deepEqual((await w.send('owner@x.y', 'GET', `${w.base}/reads`)).body, { reads: [] })

  const unread = await w.send('editor@x.y', 'POST', `${w.base}/${c.id}/unread`)
  assert.deepEqual(unread.body, { read: { id: c.id, seenN: null } })
  assert.deepEqual((await w.send('editor@x.y', 'GET', `${w.base}/reads`)).body.reads, [
    { id: c.id, seenN: null }
  ])
})

test(
  '/read takes what the tab saw: a number is required, never past the thread, never lowered',
  opts,
  async (t) => {
    const w = await world(t)
    const root = await w.post('owner@x.y')
    const reply = await w.post('owner@x.y', { replyTo: root.id })
    const other = await w.post('owner@x.y')
    const read = (body) => w.send('editor@x.y', 'POST', `${w.base}/${root.id}/read`, body)
    for (const body of [undefined, {}, { seenN: -1 }, { seenN: 1.5 }, { seenN: '3' }]) {
      const refused = await read(body)
      assert.equal(refused.status, 400, JSON.stringify(body))
      assert.equal(refused.body.field, 'seenN')
    }
    // Past the thread's largest number (another thread's #3 included): the thread's own is kept.
    assert.equal((await read({ seenN: other.n + 50 })).body.read.seenN, reply.n)
    // An older moment (a second tab) never lowers it.
    assert.equal((await read({ seenN: root.n })).body.read.seenN, reply.n)
    // Marking a reply marks its thread.
    const viaReply = await w.send('editor@x.y', 'POST', `${w.base}/${reply.id}/unread`)
    assert.deepEqual(viaReply.body, { read: { id: root.id, seenN: null } })
    // After "Mark as unread", opening again files what the tab saw, even an older number.
    assert.equal((await read({ seenN: root.n })).body.read.seenN, root.n)
  }
)

test('a read mark changes nothing on the comment: a poll does not bring it back', opts, async (t) => {
  const w = await world(t)
  const c = await w.post('owner@x.y')
  // On the database's clock, which stamps `updated_at`: a Date.now() mark under a moved clock lies
  // past every row, and the empty poll below would prove nothing.
  const db = (await w.pool.query('select now() as t')).rows[0].t
  const mark = new Date(db.getTime() + 5).toISOString()
  await new Promise((r) => setTimeout(r, 20))
  await w.send('editor@x.y', 'POST', `${w.base}/${c.id}/read`, { seenN: c.n })
  const polled = await w.send('owner@x.y', 'GET', `${w.base}?since=${encodeURIComponent(mark)}`)
  assert.deepEqual(polled.body.comments, [])
})

test('read marks keep the seat rule: another site is 403, an unknown comment 404', opts, async (t) => {
  const w = await world(t)
  const c = await w.post('owner@x.y')
  assert.equal((await w.send('stranger@x.y', 'POST', `${w.base}/${c.id}/read`)).status, 403)
  assert.equal((await w.send('stranger@x.y', 'GET', `${w.base}/reads`)).status, 403)
  const missing = await w.send('editor@x.y', 'POST', `${w.base}/00000000-0000-4000-8000-000000000000/read`)
  assert.equal(missing.status, 404)
  assert.equal(missing.body.code, 'COMMENT_NOT_FOUND')
})

test(
  'a write citing the request number stamps answeredAt on that send ("Done by Tracy")',
  opts,
  async (t) => {
    const w = await world(t)
    const c = await w.post('owner@x.y')
    const sent = await w.send('owner@x.y', 'POST', `/api/sites/${SITE}/requests`, {
      sessionId: 's',
      requestId: 'r',
      items: [{ url: `https://${SITE}/`, element: null, text: '', commentId: c.id }]
    })
    const n = sent.body.requests[0].n
    const before = (await w.send('owner@x.y', 'GET', w.base)).body.comments.find((x) => x.id === c.id)
    assert.equal(before.sends.length, 1)
    assert.equal(before.sends[0].answeredAt, null)

    // A write that fails answers nothing.
    w.answer({ ok: false, error: { code: 'NOPE' } })
    await w.send('owner@x.y', 'POST', `/api/sites/${SITE}/apply`, {
      action: 'content.update',
      params: PART,
      comment: n
    })
    const failed = (await w.send('owner@x.y', 'GET', w.base)).body.comments.find((x) => x.id === c.id)
    assert.equal(failed.sends[0].answeredAt, null)

    // Another person's write citing the owner's number stamps nothing either.
    w.answer({ ok: true, apply_id: 'a-2' })
    await w.send('editor@x.y', 'POST', `/api/sites/${SITE}/apply`, {
      action: 'content.update',
      params: { kind: 'post', id: 1, fields: { title: 'x' } },
      comment: n
    })
    const foreign = (await w.send('owner@x.y', 'GET', w.base)).body.comments.find((x) => x.id === c.id)
    assert.equal(foreign.sends[0].answeredAt, null)

    // On the database's clock, which stamps `updated_at` (a Date.now() mark compares two clocks).
    const mark = (await w.pool.query('select now() as t')).rows[0].t.toISOString()
    const written = await w.send('owner@x.y', 'POST', `/api/sites/${SITE}/apply`, {
      action: 'content.update',
      params: PART,
      comment: n
    })
    assert.equal(written.status, 200)
    // The comment's row moved, so another seat's poll learns it at once.
    const polled = (await w.send('editor@x.y', 'GET', `${w.base}?since=${encodeURIComponent(mark)}`)).body
      .comments
    assert.deepEqual(
      polled.map((x) => x.id),
      [c.id]
    )
    assert.ok(Date.parse(polled[0].sends[0].answeredAt) > 0)
  }
)

// ── A mark is what the tab drew (`061-site-comment-read-seen-n.sql`, Lee 04/10/2026) ──
// Driven through the Comments tab's own modules (tracy-chat-input `comment-view.mjs`,
// `comment-reads.mjs`) against the real doors, in an order the test controls: the reader's list is
// read, someone else replies, THEN the reader's mark goes.

/** The Comments tab of `email`: its lists, its read marks, and a reload of both from the doors. */
function tab(w, email) {
  const lists = createCommentLists()
  lists.setViewer(email)
  const fetch = (path, init = {}) => w.raw(email, path, init)
  const reads = createCommentReads({ lists, siteKey: SITE, fetch })
  const loadList = async () =>
    lists.serve({ status: 'ready', siteKey: SITE, body: (await w.send(email, 'GET', w.base)).body })
  const unread = (id) => rowsOf(lists.getSnapshot()).find((r) => r.id === id)?.unread
  return { lists, reads, loadList, unread }
}

test(
  'a reply written while the mark is on its way stays unread; opening again reads it; Mark as unread',
  opts,
  async (t) => {
    const w = await world(t)
    const root = await w.post('owner@x.y')
    const k = await w.post('editor@x.y', { replyTo: root.id })
    const a = tab(w, 'owner@x.y')
    await a.loadList()
    await a.reads.load()
    assert.equal(a.unread(root.id), true, 'the editor’s reply, never opened')

    // (a) The editor replies after the owner's tab drew the thread, before its mark arrives.
    const k1 = await w.post('editor@x.y', { replyTo: root.id })
    assert.ok(k1.n > k.n)
    assert.equal(await a.reads.read(root.id), true)
    assert.deepEqual((await w.send('owner@x.y', 'GET', `${w.base}/reads`)).body.reads, [
      { id: root.id, seenN: k.n }
    ])
    await a.loadList()
    await a.reads.load()
    assert.equal(a.unread(root.id), true, 'reply #k+1 was never on her screen')

    // (b) Opened again with the reply drawn: read.
    assert.equal(await a.reads.read(root.id), true)
    assert.deepEqual((await w.send('owner@x.y', 'GET', `${w.base}/reads`)).body.reads, [
      { id: root.id, seenN: k1.n }
    ])
    await a.reads.load()
    assert.equal(a.unread(root.id), false)

    // Her own reply never makes it unread, and a mark she files after it still covers the editor's.
    await w.post('owner@x.y', { replyTo: root.id })
    await a.loadList()
    assert.equal(a.unread(root.id), false)

    // (c) Mark as unread: unread, whatever she saw.
    assert.equal(await a.reads.unread(root.id), true)
    await a.reads.load()
    assert.equal(a.unread(root.id), true)
    assert.deepEqual((await w.send('owner@x.y', 'GET', `${w.base}/reads`)).body.reads, [
      { id: root.id, seenN: null }
    ])
  }
)

test(
  'a reply to a reply belongs to the root’s thread: unread by its number, and it reopens the root',
  opts,
  async (t) => {
    const w = await world(t)
    const root = await w.post('owner@x.y')
    const reply = await w.post('editor@x.y', { replyTo: root.id })
    const a = tab(w, 'owner@x.y')
    await a.loadList()
    await a.reads.load()
    assert.equal(await a.reads.read(root.id), true)
    assert.equal((await w.send('owner@x.y', 'POST', `${w.base}/${root.id}/resolve`)).status, 200)
    const deep = await w.post('editor@x.y', { replyTo: reply.id })
    const rows = (await w.send('owner@x.y', 'GET', w.base)).body.comments
    assert.equal(rows.find((x) => x.id === root.id).status, 'pending', 'the root came back')
    await a.loadList()
    await a.reads.load()
    assert.equal(a.unread(root.id), true, `#${deep.n} under #${reply.n} is the thread's`)
    assert.equal(await a.reads.read(root.id), true)
    assert.deepEqual((await w.send('owner@x.y', 'GET', `${w.base}/reads`)).body.reads, [
      { id: root.id, seenN: deep.n }
    ])
  }
)

test('opening a thread reads the Inbox rows about the replies it showed, and only those', opts, async (t) => {
  const w = await world(t)
  const inbox = async (email) =>
    (await w.send(email, 'GET', '/api/notifications')).body.notifications.filter((n) =>
      n.kind.startsWith('comment.')
    )
  const root = await w.post('owner@x.y')
  const elsewhere = await w.post('owner@x.y')
  const k = await w.post('editor@x.y', { replyTo: root.id })
  const e = await w.post('editor@x.y', { replyTo: elsewhere.id })
  // The editor's own Inbox row about this thread (the owner replies in it): not the owner's to read.
  await w.post('owner@x.y', { replyTo: root.id })
  const a = tab(w, 'owner@x.y')
  await a.loadList()
  await a.reads.load()
  // Written after the owner's tab drew the thread, before the mark.
  const k1 = await w.post('editor@x.y', { replyTo: root.id })

  const before = await inbox('owner@x.y')
  assert.deepEqual(
    before.map((n) => [n.kind, n.data.n, n.readAt]).sort(),
    [
      ['comment.reply', k.n, null],
      ['comment.reply', k1.n, null],
      ['comment.reply', e.n, null]
    ].sort()
  )
  assert.equal(await a.reads.read(root.id), true)
  const after = new Map((await inbox('owner@x.y')).map((n) => [n.data.n, n.readAt]))
  assert.ok(after.get(k.n), 'the reply she saw: read')
  assert.equal(after.get(k1.n), null, 'the reply written after her tab drew the thread: unread')
  assert.equal(after.get(e.n), null, 'another thread: unread')
  const editor = await inbox('editor@x.y')
  assert.ok(editor.length > 0)
  assert.ok(
    editor.every((n) => n.readAt === null),
    'the editor’s rows are the editor’s'
  )

  // A row written after the mark stays unread; one the tab then shows is read with the next open.
  const k2 = await w.post('editor@x.y', { replyTo: root.id })
  assert.equal(new Map((await inbox('owner@x.y')).map((n) => [n.data.n, n.readAt])).get(k2.n), null)
  await a.loadList()
  assert.equal(await a.reads.read(root.id), true)
  const last = new Map((await inbox('owner@x.y')).map((n) => [n.data.n, n.readAt]))
  assert.ok(last.get(k1.n) && last.get(k2.n))
  // One way: reading the Inbox never marks the thread.
  const other = await w.post('editor@x.y', { replyTo: elsewhere.id })
  const row = (await inbox('owner@x.y')).find((n) => n.data.n === other.n)
  assert.equal((await w.send('owner@x.y', 'POST', `/api/notifications/${row.id}/read`)).status, 200)
  const marks = (await w.send('owner@x.y', 'GET', `${w.base}/reads`)).body.reads
  assert.equal(
    marks.find((m) => m.id === elsewhere.id),
    undefined
  )
})

test('migration 061 carries old marks over: what the thread held up to read_at', opts, async () => {
  const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
  const dir = mkdtempSync(path.join(tmpdir(), 'read-marks-migrations-'))
  const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
  for (const f of all) if (f < '061') copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
  const { pool, close } = await scratchPool()
  try {
    await migrate(pool, dir, { lockId: 59_059 })
    await pool.query(`insert into site (site_key, label, host) values ($1, 'lantern', 'local')`, [SITE])
    const { rows: people } = await pool.query(
      `insert into account (email) values ('owner@x.y'), ('editor@x.y') returning id`
    )
    const [owner, editor] = people.map((p) => p.id)
    const comment = async (n, at, replyTo = null) =>
      (
        await pool.query(
          `insert into site_comment (site_key, n, author_account_id, url, text, reply_to, created_at)
           values ($1, $2, $3, 'https://lantern.localhost/', 'words', $4, $5) returning id`,
          [SITE, n, owner, replyTo, at]
        )
      ).rows[0].id
    const root = await comment(1, '2026-10-01T10:00:00Z')
    const reply = await comment(2, '2026-10-01T10:05:00Z', root)
    await comment(5, '2026-10-01T10:06:00Z', reply)
    await comment(7, '2026-10-01T11:00:00Z', root)
    const lone = await comment(8, '2026-10-01T09:00:00Z')
    const later = await comment(9, '2026-10-01T12:00:00Z')
    await pool.query(
      `insert into site_comment_read (comment_id, account_id, site_key, read_at) values
         ($1, $4, $5, '2026-10-01T10:30:00Z'), ($2, $4, $5, null), ($3, $4, $5, '2026-10-01T11:00:00Z')`,
      [root, lone, later, editor, SITE]
    )

    for (const f of all) if (f >= '061') copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
    const { applied } = await migrate(pool, dir, { lockId: 59_059 })
    assert.equal(applied[0], '061-site-comment-read-seen-n.sql')
    const { rows } = await pool.query('select comment_id, seen_n from site_comment_read')
    const seen = new Map(rows.map((r) => [r.comment_id, r.seen_n]))
    assert.equal(seen.get(root), 5, 'the reply at depth 2 (#5) was there by 10:30; #7 came later')
    assert.equal(seen.get(lone), null, 'Mark as unread stays unread')
    assert.equal(seen.get(later), 0, 'read before it was written: nothing seen')
    const { rows: cols } = await pool.query(
      `select column_name from information_schema.columns where table_name = 'site_comment_read' and table_schema = current_schema()`
    )
    assert.ok(!cols.some((c) => c.column_name === 'read_at'), 'read_at is gone')

    // A database that took this change under its first name (059) runs it again under 061: nothing moves.
    await pool.query("delete from schema_migration where name = '061-site-comment-read-seen-n.sql'")
    const again = await migrate(pool, dir, { lockId: 59_059 })
    assert.deepEqual(again.applied, ['061-site-comment-read-seen-n.sql'])
    const { rows: after } = await pool.query('select comment_id, seen_n from site_comment_read')
    assert.deepEqual(
      new Map(after.map((r) => [r.comment_id, r.seen_n])),
      seen,
      'a second run keeps every mark'
    )
  } finally {
    await close()
  }
})
