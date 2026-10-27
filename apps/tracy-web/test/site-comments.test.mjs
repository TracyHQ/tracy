/**
 * Site comments on the server (`tasks/todo-comment-thread.md` § D, contract H-S; stage 6
 * `tasks/evidence/comment-people/contract.md` § H1): tables `site_comment` and `site_request`, and
 * the doors under `/api/sites/:key/comments` and `/api/sites/:key/requests` (`src/sites/comments.js`).
 *
 * Every case goes through `buildApp` against Postgres, so the seat gate (`requireGrant` in
 * `sites/route.js`), the mount line and the migration are covered together with the doors.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { personFace } from '../src/lib/person-face.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { createSite } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
// One migrated database for the whole file, emptied before each test (every test builds its own
// sites, people and counters in `world`). Tests run one at a time, so they share it safely.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const SECRET = 's'.repeat(32)
const SITE = 'lantern.example'
const OTHER = 'harbor.example'
const ELEMENT = { kind: 'text', tag: 'h1', text: 'Northgate Coffee', selector: 'main h1' }
const LOCATE = { path: '/', index: 0 }
// A poll mark on the database's clock: `updated_at` is stamped by `now()`, so a mark taken from
// Date.now() compares two clocks (red under scripts/run-clock-shift.mjs).
const dbNow = async (pool) => (await pool.query('select now() as t')).rows[0].t.toISOString()

/** The file's migrated database, emptied, with two sites and four people: owner, editor, a second editor on SITE, and
 * a stranger with a seat only on OTHER. Returns a `call(email, method, path, body?)` helper. */
async function world() {
  const { pool } = db
  const cfg = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  await createSite(pool, { siteKey: SITE, label: 'lantern', host: 'local' })
  await createSite(pool, { siteKey: OTHER, label: 'harbor', host: 'local' })
  const seat = async (email, siteKey, role, name = null) => {
    const { rows } = await pool.query(
      `insert into account (email, display_name) values ($1, $2)
       on conflict (email) do update set email = excluded.email returning id`,
      [email, name]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [siteKey, rows[0].id, role]
    )
    return rows[0].id
  }
  const ids = {
    owner: await seat('owner@x.y', SITE, 'owner', 'Olivia Owner'),
    editor: await seat('editor@x.y', SITE, 'editor'),
    editor2: await seat('second@x.y', SITE, 'editor'),
    stranger: await seat('stranger@x.y', OTHER, 'owner')
  }
  const app = buildApp({
    config: cfg,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, cfg),
    host: { hostCall, hostJob }
  })
  /** `body` goes as JSON; `{ raw }` sends that text exactly as it is, JSON or not. */
  const call = async (email, method, path, body, { raw } = {}) => {
    const headers = {}
    if (email) headers.cookie = `tracy_sess=${await mintSession(email, SECRET)}`
    if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers,
        body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body)
      })
    )
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const base = `/api/sites/${SITE}/comments`
  const post = (email, body) =>
    call(email, 'POST', base, { url: 'http://lantern.localhost/', element: ELEMENT, locate: LOCATE, ...body })
  /** "Send to Tracy": one request row per item, the way the fork calls it right before the chat. */
  const request = (email, items, extra = {}) =>
    call(email, 'POST', `/api/sites/${SITE}/requests`, {
      sessionId: 'sess-1',
      requestId: 'req-1',
      items,
      ...extra
    })
  /** A row as a stage-5 chat turn left it: a status the door no longer takes, written by SQL. */
  const legacy = (id, columns) => {
    const keys = Object.keys(columns)
    return pool.query(
      `update site_comment set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
      [id, ...keys.map((k) => columns[k])]
    )
  }
  return { pool, call, post, request, legacy, base, ids }
}

test(
  'create then list: the server numbers the comment, keeps it open and names its author',
  opts,
  async () => {
    const { call, post, base, ids } = await world()
    const made = await post('owner@x.y', { text: 'Make the heading bigger' })
    assert.equal(made.status, 201)
    assert.equal(made.body.comment.n, 1)
    assert.equal(made.body.comment.status, 'pending', 'pending is what "open" is stored as')
    assert.equal(made.body.comment.sentToTracy, false)
    assert.deepEqual(made.body.comment.element, ELEMENT)
    assert.deepEqual(made.body.comment.locate, LOCATE)
    assert.deepEqual(made.body.comment.author, {
      accountId: ids.owner,
      email: 'owner@x.y',
      name: 'Olivia Owner',
      ...personFace({ id: ids.owner, email: 'owner@x.y', display_name: 'Olivia Owner' })
    })
    assert.deepEqual(made.body.comment.can, { edit: true, delete: true })

    const general = await post('editor@x.y', {
      text: 'The whole page feels slow',
      element: null,
      locate: null
    })
    assert.equal(general.status, 201)
    assert.equal(general.body.comment.n, 2)
    assert.equal(general.body.comment.element, null)
    assert.deepEqual(general.body.comment.author, {
      accountId: ids.editor,
      email: 'editor@x.y',
      ...personFace({ id: ids.editor, email: 'editor@x.y' })
    })

    const listed = await call('editor@x.y', 'GET', base)
    assert.equal(listed.status, 200)
    assert.equal(listed.body.n_next, 3)
    assert.equal(listed.body.siteChangedAt, null, 'nothing was ever written to the site')
    assert.deepEqual(
      listed.body.comments.map((c) => [c.n, c.text, c.can, c.sentToTracy]),
      [
        [1, 'Make the heading bigger', { edit: false, delete: false }, false],
        [2, 'The whole page feels slow', { edit: true, delete: true }, false]
      ]
    )
  }
)

test(
  'POST /requests: one internal row per item, numbered from the counter comments use, past 99',
  opts,
  async () => {
    const { pool, call, post, request, base, ids } = await world()
    const first = (await post('editor@x.y', { text: 'one' })).body.comment
    assert.equal(first.n, 1)

    const sent = await request('editor@x.y', [
      { url: 'http://lantern.localhost/', element: ELEMENT, text: 'Bigger heading' },
      { url: 'http://lantern.localhost/about', element: null, text: 'Whole page: warmer' }
    ])
    assert.equal(sent.status, 201)
    assert.deepEqual(
      sent.body.requests.map((r) => r.n),
      [2, 3],
      'one sequence for comments and requests'
    )
    assert.ok(sent.body.requests.every((r) => /^[0-9a-f-]{36}$/.test(r.id)))
    assert.equal((await post('editor@x.y', { text: 'after' })).body.comment.n, 4)

    const { rows } = await pool.query(
      `select n, account_id, session_id, request_id, url, element, text, comment_id
         from site_request where site_key = $1 order by n`,
      [SITE]
    )
    assert.deepEqual(rows, [
      {
        n: 2,
        account_id: ids.editor,
        session_id: 'sess-1',
        request_id: 'req-1',
        url: 'http://lantern.localhost/',
        element: ELEMENT,
        text: 'Bigger heading',
        comment_id: null
      },
      {
        n: 3,
        account_id: ids.editor,
        session_id: 'sess-1',
        request_id: 'req-1',
        url: 'http://lantern.localhost/about',
        element: null,
        text: 'Whole page: warmer',
        comment_id: null
      }
    ])
    // A request is never a comment: nothing new in the list, no pin.
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.n),
      [1, 4]
    )

    // No cap at 99: the counter runs on.
    await pool.query('update site_comment_counter set last_n = 120 where site_key = $1', [SITE])
    const late = await request('owner@x.y', [{ url: 'http://lantern.localhost/', text: 'Again' }])
    assert.equal(late.status, 201)
    assert.deepEqual(
      late.body.requests.map((r) => r.n),
      [121]
    )
    assert.equal((await post('owner@x.y', { text: 'late comment' })).body.comment.n, 122)
  }
)

test(
  'a comment sent to Tracy reads sentToTracy: true for every seat; the rest stay false',
  opts,
  async () => {
    const { pool, call, post, request, base, ids } = await world()
    const a = (await post('owner@x.y', { text: 'Title A' })).body.comment
    const b = (await post('editor@x.y', { text: 'Title B' })).body.comment
    await new Promise((r) => setTimeout(r, 20))
    const mark = await dbNow(pool)

    // Anyone may send anyone's comment (rule 3): the editor sends the owner's.
    const sent = await request('editor@x.y', [
      { url: a.url, element: a.element, text: 'Please do this', commentId: a.id }
    ])
    assert.equal(sent.status, 201)
    const { rows } = await pool.query('select comment_id from site_request where n = $1', [
      sent.body.requests[0].n
    ])
    assert.equal(rows[0].comment_id, a.id)

    for (const who of ['owner@x.y', 'second@x.y']) {
      const list = (await call(who, 'GET', base)).body.comments
      assert.deepEqual(
        list.map((c) => [c.id, c.sentToTracy]),
        [
          [a.id, true],
          [b.id, false]
        ],
        who
      )
    }
    // Who sent it and when: the thread's "sent to Tracy by …" lines.
    const [listedA, listedB] = (await call('owner@x.y', 'GET', base)).body.comments
    assert.equal(listedA.sends.length, 1)
    assert.deepEqual(listedA.sends[0].author, {
      accountId: ids.editor,
      email: 'editor@x.y',
      ...personFace({ id: ids.editor, email: 'editor@x.y' })
    })
    assert.match(listedA.sends[0].at, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/)
    assert.deepEqual(listedB.sends, [])
    // A send bumps the sent comment, so another seat's poll brings it back with its new send (else
    // that seat's "Send N" would count it again); the unsent one stays out, and nothing else moves.
    const polled = (await call('second@x.y', 'GET', `${base}?since=${encodeURIComponent(mark)}`)).body
    assert.deepEqual(
      polled.comments.map((c) => [c.id, c.sentToTracy, c.sends.length, c.text, c.status]),
      [[a.id, true, 1, 'Title A', 'pending']]
    )
    assert.equal(polled.comments[0].sends[0].author.email, 'editor@x.y')
    assert.equal(polled.siteChangedAt, null, 'a send is not a change to the site')
    // A send without a comment bumps no row.
    const mark2 = await dbNow(pool)
    await request('editor@x.y', [{ url: a.url, text: 'Fresh words' }])
    assert.deepEqual(
      (await call('second@x.y', 'GET', `${base}?since=${encodeURIComponent(mark2)}`)).body.comments,
      []
    )
  }
)

test('POST /requests refuses a bad body, a comment of another site, and no seat', opts, async () => {
  const { call, post, request } = await world()
  const mine = (await post('editor@x.y', { text: 'x' })).body.comment
  const foreign = (
    await call('stranger@x.y', 'POST', `/api/sites/${OTHER}/comments`, { url: 'http://h/', text: 'far' })
  ).body.comment
  const item = { url: 'http://lantern.localhost/', text: 'Do it' }

  for (const [body, field] of [
    [{ items: [item], sessionId: '' }, 'sessionId'],
    [{ items: [item], requestId: 42 }, 'requestId'],
    [{ items: [] }, 'items'],
    [{ items: 'no' }, 'items'],
    [{ items: [{ ...item, url: '' }] }, 'items[0].url'],
    [{ items: [item, { ...item, text: '   ' }] }, 'items[1].text'],
    [{ items: [{ ...item, element: ['no'] }] }, 'items[0].element'],
    [{ items: [{ ...item, commentId: 7 }] }, 'items[0].commentId']
  ]) {
    const { items, ...extra } = body
    const res = await request('editor@x.y', items, extra)
    assert.equal(res.status, 400, field)
    assert.equal(res.body.code, 'COMMENT_BAD_INPUT', field)
    assert.equal(res.body.field, field)
    assert.ok(res.body.next)
  }
  // A thread sent with no new words carries the comment's own: empty text is fine with a commentId.
  assert.equal((await request('editor@x.y', [{ ...item, text: '', commentId: mine.id }])).status, 201)

  const across = await request('editor@x.y', [item, { ...item, commentId: foreign.id }])
  assert.equal(across.status, 404)
  assert.equal(across.body.code, 'COMMENT_NOT_FOUND')
  assert.equal(across.body.field, 'items[1].commentId')

  const counter = await call('editor@x.y', 'GET', `/api/sites/${SITE}/comments`)
  assert.equal(counter.body.n_next, 3, 'a refused send hands out no number')

  const stranger = await call('stranger@x.y', 'POST', `/api/sites/${SITE}/requests`, {
    sessionId: 's',
    requestId: 'r',
    items: [item]
  })
  assert.equal(stranger.status, 403)
  assert.equal(stranger.body.code, 'SEAT_NOT_AUTHORIZED')
  assert.equal((await call(null, 'POST', `/api/sites/${SITE}/requests`, {})).status, 401)
})

test('the author edits the words; a status report is no longer taken on a comment', opts, async () => {
  const { call, post, base } = await world()
  const { id } = (await post('editor@x.y', { text: 'Bigger' })).body.comment

  const edited = await call('editor@x.y', 'PATCH', `${base}/${id}`, { text: 'Much bigger' })
  assert.equal(edited.status, 200)
  assert.equal(edited.body.comment.text, 'Much bigger')
  assert.equal(edited.body.comment.status, 'pending')

  for (const [field, value] of [
    ['status', 'working'],
    ['status', 'resolved'],
    ['requestId', 'req-1'],
    ['callId', 'call-1'],
    ['question', 'Which heading?'],
    ['answer', 'updated'],
    ['sentAt', '2026-09-29T10:00:00.000Z']
  ]) {
    const bad = await call('editor@x.y', 'PATCH', `${base}/${id}`, { [field]: value })
    assert.equal(bad.status, 400, field)
    assert.equal(bad.body.code, 'COMMENT_BAD_INPUT')
    assert.equal(bad.body.field, field)
    assert.ok(bad.body.next)
  }
  assert.equal((await call('editor@x.y', 'PATCH', `${base}/${id}`, {})).body.field, 'body')
  assert.equal((await call('editor@x.y', 'GET', base)).body.comments[0].status, 'pending')
})

test(
  'old rows keep reading: a stage-5 status, question and answer come back as they were stored',
  opts,
  async () => {
    const { call, post, legacy, base } = await world()
    const done = (await post('editor@x.y', { text: 'Bigger heading' })).body.comment
    const asked = (await post('owner@x.y', { text: 'Which one?' })).body.comment
    await legacy(done.id, {
      status: 'done',
      answer: 'updated: the Home heading now reads Title B',
      request_id: 'req-old',
      sent_at: new Date('2026-09-28T10:00:00Z')
    })
    await legacy(asked.id, { status: 'asked', question: 'Which heading?' })

    const list = (await call('second@x.y', 'GET', base)).body.comments
    assert.deepEqual(
      list.map((c) => [c.n, c.status, c.answer, c.question, c.requestId, c.sentAt]),
      [
        [
          1,
          'done',
          'updated: the Home heading now reads Title B',
          null,
          'req-old',
          '2026-09-28T10:00:00.000Z'
        ],
        [2, 'asked', null, 'Which heading?', null, null]
      ]
    )
    // Still open: anyone resolves it, and the reopen puts the old status back.
    const resolved = await call('second@x.y', 'POST', `${base}/${done.id}/resolve`)
    assert.equal(resolved.body.comment.status, 'resolved')
    const reopened = await call('second@x.y', 'POST', `${base}/${done.id}/reopen`)
    assert.equal(reopened.body.comment.status, 'done')
  }
)

test("any seat resolves anyone's comment; only its author edits or deletes it", opts, async () => {
  const { call, post, base, ids } = await world()
  const { id } = (await post('editor@x.y', { text: 'mine' })).body.comment
  for (const [method, path, body] of [
    ['PATCH', `${base}/${id}`, { text: 'hijack' }],
    ['DELETE', `${base}/${id}`]
  ]) {
    for (const who of ['second@x.y', 'owner@x.y']) {
      const res = await call(who, method, path, body)
      assert.equal(res.status, 403, `${who} ${method}`)
      assert.equal(res.body.code, 'COMMENT_NOT_YOURS')
      assert.ok(res.body.next)
    }
  }
  const seen = (await call('second@x.y', 'GET', base)).body.comments[0]
  assert.deepEqual(seen.can, { edit: false, delete: false })
  assert.equal(seen.text, 'mine')
  assert.deepEqual((await call('owner@x.y', 'GET', base)).body.comments[0].can, {
    edit: false,
    delete: false
  })

  const resolved = await call('second@x.y', 'POST', `${base}/${id}/resolve`)
  assert.equal(resolved.status, 200, 'a second editor resolves the first one’s comment')
  assert.equal(resolved.body.comment.status, 'resolved')
  assert.equal(resolved.body.comment.resolvedBy.accountId, ids.editor2)
  assert.ok(resolved.body.comment.resolvedAt)

  const again = await call('owner@x.y', 'POST', `${base}/${id}/resolve`)
  assert.equal(again.status, 200, 'resolving twice is fine')
  assert.equal(again.body.comment.resolvedBy.accountId, ids.editor2, 'the first resolver stays')

  const reopened = await call('owner@x.y', 'POST', `${base}/${id}/reopen`)
  assert.equal(reopened.status, 200)
  assert.equal(reopened.body.comment.status, 'pending')
  assert.equal(reopened.body.comment.resolvedAt, null)
  assert.equal(reopened.body.comment.resolvedBy, null)
})

test('a reply to a resolved comment reopens it in the same write, by any seat (S7)', opts, async () => {
  const { call, post, base, pool } = await world()
  const parent = (await post('owner@x.y', { text: 'Title A' })).body.comment
  const resolved = await call('owner@x.y', 'POST', `${base}/${parent.id}/resolve`)
  assert.equal(resolved.body.comment.status, 'resolved')

  const reply = await post('editor@x.y', { text: 'No, make it Title B', replyTo: parent.id })
  assert.equal(reply.status, 201)
  assert.equal(reply.body.comment.replyTo, parent.id)
  assert.equal(reply.body.comment.status, 'pending')
  assert.equal(reply.body.parent.id, parent.id)
  assert.equal(reply.body.parent.status, 'pending')
  assert.equal(reply.body.parent.resolvedAt, null)
  assert.equal(reply.body.parent.resolvedBy, null)
  assert.deepEqual(reply.body.parent.can, { edit: false, delete: false }, "the editor's view of it")

  const { rows } = await pool.query(`select actor, detail from audit where action = 'comment.reopen'`)
  assert.deepEqual(
    rows.map((r) => [r.actor, r.detail.id, r.detail.by]),
    [['editor@x.y', parent.id, 'reply']],
    'the reopen is audited once, as done by the reply'
  )
  const second = await post('owner@x.y', { text: 'Fine, B', replyTo: parent.id })
  assert.equal(second.status, 201)
  assert.equal(second.body.parent.status, 'pending')
  assert.equal((await post('owner@x.y', { text: 'solo' })).body.parent, undefined)
})

test(
  'delete is soft: gone from the list, visible to a poll, and its number is never handed out again',
  opts,
  async () => {
    const { call, post, base } = await world()
    const first = (await post('editor@x.y', { text: 'one' })).body.comment
    const second = (await post('editor@x.y', { text: 'two' })).body.comment
    const before = (await call('editor@x.y', 'GET', base)).body.comments.at(-1).updatedAt

    const deleted = await call('editor@x.y', 'DELETE', `${base}/${second.id}`)
    assert.equal(deleted.status, 200)
    assert.ok(deleted.body.comment.deletedAt)
    assert.deepEqual(deleted.body.comment.can, { edit: false, delete: false })

    const listed = (await call('editor@x.y', 'GET', base)).body
    assert.deepEqual(
      listed.comments.map((c) => c.n),
      [1]
    )
    assert.equal(listed.n_next, 3)
    const polled = (await call('editor@x.y', 'GET', `${base}?since=${encodeURIComponent(before)}`)).body
      .comments
    assert.ok(
      polled.some((c) => c.id === second.id && c.deletedAt),
      'the poll learns of the delete'
    )

    const third = (await post('editor@x.y', { text: 'three' })).body.comment
    assert.equal(third.n, 3, 'n 2 is not reused')
    assert.equal((await call('editor@x.y', 'DELETE', `${base}/${second.id}`)).body.code, 'COMMENT_NOT_FOUND')
    assert.equal((await call('editor@x.y', 'PATCH', `${base}/${second.id}`, { text: 'x' })).status, 404)
    assert.ok(first.id)
  }
)

test(
  '/clear {url}: every comment of that page goes, open and resolved, with their replies, whoever wrote them; other pages stay (Brian 23:20)',
  opts,
  async () => {
    const { call, post, base, pool } = await world()
    const HOME = 'http://lantern.localhost/'
    const ABOUT = 'http://lantern.localhost/about'
    const owners = (await post('owner@x.y', { text: 'owner open', url: HOME })).body.comment
    const editors = (await post('editor@x.y', { text: 'editor open', url: HOME })).body.comment
    const reply = (await post('second@x.y', { text: 'reply on it', url: HOME, replyTo: editors.id })).body
      .comment
    const done = (await post('editor@x.y', { text: 'resolved one', url: HOME })).body.comment
    const doneReply = (await post('owner@x.y', { text: 'agreed', url: HOME, replyTo: done.id })).body.comment
    await call('owner@x.y', 'POST', `${base}/${done.id}/resolve`)
    const about = (await post('owner@x.y', { text: 'about page', url: ABOUT })).body.comment
    const aboutReply = (await post('editor@x.y', { text: 'yes', url: ABOUT, replyTo: about.id })).body.comment
    const gone = (await post('editor@x.y', { text: 'deleted before', url: HOME })).body.comment
    await call('editor@x.y', 'DELETE', `${base}/${gone.id}`)

    const cleared = await call('second@x.y', 'POST', `${base}/clear`, { url: HOME })
    assert.equal(cleared.status, 200)
    assert.deepEqual(
      [...cleared.body.cleared].sort(),
      [owners.id, editors.id, reply.id, done.id, doneReply.id].sort(),
      'a seat without a word on the page clears the whole page, resolved threads included; an already deleted one is not counted'
    )
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [about.id, aboutReply.id],
      'the other page keeps its thread'
    )
    const { rows } = await pool.query(`select actor, detail from audit where action = 'comment.clear'`)
    assert.deepEqual(rows, [{ actor: 'second@x.y', detail: { url: HOME, ids: cleared.body.cleared } }])

    const nothing = await call('second@x.y', 'POST', `${base}/clear`, { url: HOME })
    assert.deepEqual(nothing.body.cleared, [])
    for (const bad of [{ url: '' }, { url: 42 }, { url: HOME, ids: [owners.id] }]) {
      const res = await call('owner@x.y', 'POST', `${base}/clear`, bad)
      assert.equal(res.status, 400, JSON.stringify(bad))
      assert.equal(res.body.code, 'COMMENT_BAD_INPUT')
    }
  }
)

test(
  '/clear {threads}: Delete all of exactly the threads the tab shows, any page, open or resolved, with their replies, whoever wrote them (UI fine-tune 30/09)',
  opts,
  async () => {
    const { call, post, base } = await world()
    const HOME = 'http://lantern.localhost/'
    const ABOUT = 'http://lantern.localhost/about'
    const owners = (await post('owner@x.y', { text: 'owner open', url: HOME })).body.comment
    const editors = (await post('editor@x.y', { text: 'editor on about', url: ABOUT })).body.comment
    const reply = (await post('second@x.y', { text: 'reply', url: ABOUT, replyTo: editors.id })).body.comment
    const hidden = (await post('editor@x.y', { text: 'resolved, hidden', url: HOME })).body.comment
    await call('owner@x.y', 'POST', `${base}/${hidden.id}/resolve`)

    const cleared = await call('second@x.y', 'POST', `${base}/clear`, { threads: [owners.id, editors.id] })
    assert.equal(cleared.status, 200)
    assert.deepEqual(
      [...cleared.body.cleared].sort(),
      [owners.id, editors.id, reply.id].sort(),
      'two pages, other people’s words, the reply with its thread; the resolved one not named stays (U26)'
    )
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [hidden.id]
    )
    assert.deepEqual([...cleared.body.deleted].sort(), [owners.id, editors.id].sort())
    assert.deepEqual(cleared.body.gone, [])
    const unknown = await call('owner@x.y', 'POST', `${base}/clear`, {
      threads: ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']
    })
    assert.equal(unknown.status, 200, 'an id that names nothing is already gone, not a refusal (INTH-1)')
    assert.deepEqual(unknown.body, {
      cleared: [],
      deleted: [],
      gone: ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']
    })
    for (const bad of [
      { threads: 'x' },
      { threads: [1] },
      { threads: [hidden.id], url: HOME },
      { threads: [hidden.id], ids: [hidden.id] }
    ]) {
      const res = await call('owner@x.y', 'POST', `${base}/clear`, bad)
      assert.equal(res.status, 400, JSON.stringify(bad))
      assert.equal(res.body.code, 'COMMENT_BAD_INPUT')
    }
  }
)

test(
  '/clear {threads} takes a tombstone thread whole: its remaining replies go with it (INTH-1)',
  opts,
  async () => {
    const { call, post, base, pool } = await world()
    const HOME = 'http://lantern.localhost/'
    const tomb = (await post('owner@x.y', { text: 'root, deleted later', url: HOME })).body.comment
    const standing = (await post('editor@x.y', { text: 'reply still there', url: HOME, replyTo: tomb.id }))
      .body.comment
    assert.equal((await call('owner@x.y', 'DELETE', `${base}/${tomb.id}`)).body.comment.deletedRoot, true)
    const other = (await post('second@x.y', { text: 'another thread', url: HOME })).body.comment

    const cleared = await call('second@x.y', 'POST', `${base}/clear`, { threads: [tomb.id, other.id] })
    assert.equal(cleared.status, 200)
    assert.deepEqual([...cleared.body.cleared].sort(), [standing.id, other.id].sort())
    assert.deepEqual([...cleared.body.deleted].sort(), [tomb.id, other.id].sort())
    assert.deepEqual(cleared.body.gone, [])
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments,
      [],
      'the tombstone leaves with its reply'
    )
    const { rows } = await pool.query(`select detail from audit where action = 'comment.clear'`)
    assert.deepEqual(rows.at(-1).detail.ids.sort(), [standing.id, other.id].sort())
  }
)

test(
  '/clear {threads}: a thread someone else deleted during the Undo window is skipped, the rest still go (INTH-1)',
  opts,
  async () => {
    const { call, post, base } = await world()
    const mine = (await post('owner@x.y', { text: 'owner one' })).body.comment
    const mine2 = (await post('owner@x.y', { text: 'owner two' })).body.comment
    const theirs = (await post('editor@x.y', { text: 'editor, deletes it in the window' })).body.comment
    // The tab named all three at the press; ten seconds later the editor has deleted theirs.
    assert.equal((await call('editor@x.y', 'DELETE', `${base}/${theirs.id}`)).status, 200)

    const cleared = await call('owner@x.y', 'POST', `${base}/clear`, {
      threads: [mine.id, theirs.id, mine2.id]
    })
    assert.equal(cleared.status, 200)
    assert.deepEqual([...cleared.body.deleted].sort(), [mine.id, mine2.id].sort())
    assert.deepEqual(cleared.body.gone, [theirs.id])
    assert.deepEqual((await call('owner@x.y', 'GET', base)).body.comments, [])
  }
)

test(
  '/clear {threads} is refused whole only for a real refusal: no session, no seat, another site’s thread named here',
  opts,
  async () => {
    const { call, post, base } = await world()
    const kept = (await post('owner@x.y', { text: 'stays' })).body.comment
    const noSession = await call(null, 'POST', `${base}/clear`, { threads: [kept.id] })
    assert.equal(noSession.status, 401)
    assert.equal(noSession.body.code, 'NOT_SIGNED_IN')
    const noSeat = await call('stranger@x.y', 'POST', `${base}/clear`, { threads: [kept.id] })
    assert.equal(noSeat.status, 403)
    assert.equal(noSeat.body.code, 'SEAT_NOT_AUTHORIZED')
    // The stranger's own site: the id names nothing there, so nothing is touched here.
    const elsewhere = await call('stranger@x.y', 'POST', `/api/sites/${OTHER}/comments/clear`, {
      threads: [kept.id]
    })
    assert.equal(elsewhere.status, 200)
    assert.deepEqual(elsewhere.body.gone, [kept.id])
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [kept.id]
    )
  }
)

test(
  '/clear deletes nothing for a body that is not an object or names nothing — "all of mine" is `{mine: true}`',
  opts,
  async () => {
    const { call, post, base } = await world()
    const mine = (await post('editor@x.y', { text: 'mine' })).body.comment
    for (const raw of ['', '{}', 'null', '[]', '"x"', '7', '{"ids":', 'not json']) {
      const res = await call('editor@x.y', 'POST', `${base}/clear`, undefined, { raw })
      assert.equal(res.status, 400, `body ${JSON.stringify(raw)} answered ${res.status}`)
      assert.equal(res.body.code, 'COMMENT_BAD_INPUT')
    }
    for (const bad of [
      { mine: false },
      { mine: 'yes' },
      { mine: true, ids: [mine.id] },
      { mine: true, url: 'x' }
    ]) {
      const res = await call('editor@x.y', 'POST', `${base}/clear`, bad)
      assert.equal(res.status, 400, JSON.stringify(bad))
      assert.equal(res.body.code, 'COMMENT_BAD_INPUT')
    }
    assert.deepEqual(
      (await call('editor@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [mine.id],
      'nothing was deleted by a refused body'
    )
    assert.deepEqual((await call('editor@x.y', 'POST', `${base}/clear`, { mine: true })).body.cleared, [
      mine.id
    ])
  }
)

test(
  "/clear by ids or with `{mine: true}` clears only the caller's own comments (a delete is the author's)",
  opts,
  async () => {
    const { call, post, base } = await world()
    const mine = (await post('editor@x.y', { text: 'mine' })).body.comment
    const theirs = (await post('second@x.y', { text: 'theirs' })).body.comment
    const owners = (await post('owner@x.y', { text: 'owners' })).body.comment

    const refused = await call('owner@x.y', 'POST', `${base}/clear`, { ids: [owners.id, theirs.id] })
    assert.equal(refused.status, 403)
    assert.equal(refused.body.code, 'COMMENT_NOT_YOURS')
    assert.deepEqual(refused.body.ids, [theirs.id])
    assert.equal((await call('editor@x.y', 'GET', base)).body.comments.length, 3, 'all or nothing')

    const unknown = await call('editor@x.y', 'POST', `${base}/clear`, {
      ids: ['00000000-0000-4000-8000-000000000000']
    })
    assert.equal(unknown.status, 404)
    assert.equal(unknown.body.code, 'COMMENT_NOT_FOUND')

    assert.deepEqual((await call('editor@x.y', 'POST', `${base}/clear`, { mine: true })).body.cleared, [
      mine.id
    ])
    assert.deepEqual((await call('owner@x.y', 'POST', `${base}/clear`, { ids: [owners.id] })).body.cleared, [
      owners.id
    ])
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [theirs.id]
    )
  }
)

/** A(root on /a) ← B(reply on /b) ← C(reply to the reply, on /b), each by a different seat, and an
 * unrelated thread D on /b. A reply may name any comment and any page, so C is a grandchild of A. */
async function deepThread(post) {
  const A = (await post('owner@x.y', { text: 'root on /a', url: 'http://lantern.localhost/a' })).body.comment
  const B = (
    await post('editor@x.y', { text: 'reply on /b', url: 'http://lantern.localhost/b', replyTo: A.id })
  ).body.comment
  const C = (
    await post('second@x.y', { text: 'reply to the reply', url: 'http://lantern.localhost/b', replyTo: B.id })
  ).body.comment
  const D = (await post('second@x.y', { text: 'another thread on /b', url: 'http://lantern.localhost/b' }))
    .body.comment
  return { A, B, C, D }
}

test('/clear {url} and {threads} take a whole thread at any depth, across pages (#674)', opts, async () => {
  const { call, post, base, pool } = await world()
  const listed = async () => (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id)

  const one = await deepThread(post)
  const byUrl = await call('second@x.y', 'POST', `${base}/clear`, { url: 'http://lantern.localhost/a' })
  assert.equal(byUrl.status, 200)
  assert.deepEqual([...byUrl.body.cleared].sort(), [one.A.id, one.B.id, one.C.id].sort(), 'A, B and C')
  assert.deepEqual(await listed(), [one.D.id], 'nothing orphaned; the other thread on /b stays')
  const { rows: audited } = await pool.query(`select detail from audit where action = 'comment.clear'`)
  assert.deepEqual(audited.at(-1).detail.ids, byUrl.body.cleared, 'the audit names every row deleted')

  const two = await deepThread(post)
  const byThread = await call('second@x.y', 'POST', `${base}/clear`, { threads: [two.A.id, two.A.id] })
  assert.equal(byThread.status, 200)
  assert.deepEqual([...byThread.body.cleared].sort(), [two.A.id, two.B.id, two.C.id].sort())
  assert.equal(new Set(byThread.body.cleared).size, 3, 'each id once')
  assert.deepEqual(byThread.body.deleted, [two.A.id])
  assert.deepEqual(byThread.body.gone, [])
  assert.deepEqual(await listed(), [one.D.id, two.D.id])

  const { rows } = await pool.query(
    'select id from site_comment where deleted_at is null and site_key = $1 order by n',
    [SITE]
  )
  assert.deepEqual(
    rows.map((r) => r.id),
    [one.D.id, two.D.id]
  )
})

test(
  '/clear walks through deleted rows: a reply under a deleted middle reply or root still goes (#674)',
  opts,
  async () => {
    const { call, post, base } = await world()
    const listed = async () => (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id)

    // The middle reply removed by its author: B is a tombstone over C.
    const one = await deepThread(post)
    assert.equal((await call('editor@x.y', 'DELETE', `${base}/${one.B.id}`)).status, 200)
    const byThread = await call('second@x.y', 'POST', `${base}/clear`, { threads: [one.A.id] })
    assert.deepEqual([...byThread.body.cleared].sort(), [one.A.id, one.C.id].sort(), 'B is not counted again')
    assert.deepEqual(byThread.body.deleted, [one.A.id])

    // Root and middle both removed, only C live: the thread is still named as deleted, not gone.
    const two = await deepThread(post)
    assert.equal((await call('editor@x.y', 'DELETE', `${base}/${two.B.id}`)).status, 200)
    assert.equal((await call('owner@x.y', 'DELETE', `${base}/${two.A.id}`)).status, 200)
    const tomb = await call('second@x.y', 'POST', `${base}/clear`, { threads: [two.A.id] })
    assert.deepEqual(tomb.body, { cleared: [two.C.id], deleted: [two.A.id], gone: [] })

    // The same through a page whose root is already deleted.
    const three = await deepThread(post)
    assert.equal((await call('owner@x.y', 'DELETE', `${base}/${three.A.id}`)).status, 200)
    const byUrl = await call('second@x.y', 'POST', `${base}/clear`, { url: 'http://lantern.localhost/a' })
    assert.deepEqual([...byUrl.body.cleared].sort(), [three.B.id, three.C.id].sort())
    assert.deepEqual(await listed(), [one.D.id, two.D.id, three.D.id])

    // Nothing left to take: an already-cleared thread is gone.
    const again = await call('second@x.y', 'POST', `${base}/clear`, { threads: [three.A.id] })
    assert.deepEqual(again.body, { cleared: [], deleted: [], gone: [three.A.id] })
  }
)

test(
  '/clear {ids}: the author’s own thread root takes every reply under it; a named reply goes alone; one foreign id refuses all (#674)',
  opts,
  async () => {
    const { call, post, base } = await world()
    const { A, B, C, D } = await deepThread(post)

    const foreign = await call('owner@x.y', 'POST', `${base}/clear`, { ids: [A.id, B.id] })
    assert.equal(foreign.status, 403)
    assert.deepEqual(foreign.body.ids, [B.id])
    const missing = await call('owner@x.y', 'POST', `${base}/clear`, {
      ids: [A.id, '00000000-0000-4000-8000-000000000000']
    })
    assert.equal(missing.status, 404)
    assert.equal((await call('owner@x.y', 'GET', base)).body.comments.length, 4, 'all or nothing')

    // A reply named by its author goes alone: it stays a tombstone over the reply under it.
    const reply = await call('editor@x.y', 'POST', `${base}/clear`, { ids: [B.id] })
    assert.deepEqual(reply.body.cleared, [B.id])
    const after = (await call('owner@x.y', 'GET', base)).body.comments
    assert.deepEqual(
      after.map((c) => [c.id, c.deletedRoot]),
      [
        [A.id, false],
        [B.id, true],
        [C.id, false],
        [D.id, false]
      ]
    )

    // The root named by its author takes the thread with it, whoever wrote the replies.
    const root = await call('owner@x.y', 'POST', `${base}/clear`, { ids: [A.id, A.id] })
    assert.equal(root.status, 200)
    assert.deepEqual([...root.body.cleared].sort(), [A.id, C.id].sort())
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [D.id]
    )

    // `/clear {mine: true}` is still the caller's own words only, never the replies under them.
    const mine = (await post('owner@x.y', { text: 'mine' })).body.comment
    const theirs = (await post('editor@x.y', { text: 'theirs', replyTo: mine.id })).body.comment
    assert.deepEqual((await call('owner@x.y', 'POST', `${base}/clear`, { mine: true })).body.cleared, [
      mine.id
    ])
    assert.deepEqual(
      (await call('owner@x.y', 'GET', base)).body.comments.map((c) => c.id),
      [D.id, mine.id, theirs.id]
    )
  }
)

test(
  'TH-1: no cap on open or unsent comments — a long thread of replies never locks anyone out',
  opts,
  async () => {
    const { post } = await world()
    const root = (await post('owner@x.y', { text: 'Start of a long thread' })).body.comment
    for (let i = 0; i < 24; i++) {
      const who = i % 2 ? 'owner@x.y' : 'editor@x.y'
      const reply = await post(who, { text: `reply ${i}`, replyTo: root.id })
      assert.equal(reply.status, 201, `reply ${i} by ${who}`)
    }
    for (let i = 0; i < 14; i++) assert.equal((await post('editor@x.y', { text: `own ${i}` })).status, 201)
  }
)

test(
  'a plain rate limit: at most 30 comments or replies per author per minute, then COMMENT_RATE_LIMIT in plain words',
  opts,
  async () => {
    const { pool, post, ids } = await world()
    for (let i = 0; i < 30; i++) assert.equal((await post('editor@x.y', { text: `c${i}` })).status, 201)
    const over = await post('editor@x.y', { text: 'thirty-first' })
    assert.equal(over.status, 429)
    assert.equal(over.body.code, 'COMMENT_RATE_LIMIT')
    assert.equal(over.body.limit, 30)
    assert.ok(over.body.retryAfter >= 1 && over.body.retryAfter <= 60, `retryAfter ${over.body.retryAfter}`)
    assert.doesNotMatch(over.body.next, /unsent|field|GET |POST /, 'plain words, no stage-5 wording')
    assert.match(over.body.next, /minute/)

    assert.equal((await post('second@x.y', { text: 'someone else' })).status, 201, 'per author')
    await pool.query(
      "update site_comment set created_at = created_at - interval '61 seconds' where author_account_id = $1",
      [ids.editor]
    )
    const after = await post('editor@x.y', { text: 'a minute later' })
    assert.equal(after.status, 201)
    assert.equal(
      after.body.comment.n,
      32,
      'the refused create handed out no number (30 + 1 by another author + this)'
    )
  }
)

test(
  'the rate limit holds across sites: concurrent writes by one author on two sites at 29 let exactly one through (#676)',
  opts,
  async () => {
    const { pool, call, ids } = await world()
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'editor', $2, now())`,
      [OTHER, ids.editor]
    )
    // 29 writes in the last minute, spread over both sites.
    for (let i = 0; i < 29; i++)
      await pool.query(
        `insert into site_comment (site_key, n, author_account_id, url, text) values ($1, $2, $3, 'http://x/', 'w')`,
        [i % 2 ? OTHER : SITE, 1000 + i, ids.editor]
      )
    // Hold both sites' counter rows so every create queues behind them, then let go at once: the
    // creates then race for the count on two sites, which the per-site counter alone never stopped.
    await pool.query(`insert into site_comment_counter (site_key, last_n) values ($1, 0), ($2, 0)`, [
      SITE,
      OTHER
    ])
    const PER_SITE = 3
    const writes = []
    // Released here, not at file end: the file's pool would wait on it when it closes.
    const holder = await pool.connect()
    try {
      await holder.query('begin')
      await holder.query(`select 1 from site_comment_counter where site_key = any($1) for update`, [
        [SITE, OTHER]
      ])
      for (let i = 0; i < PER_SITE; i++)
        for (const site of [SITE, OTHER])
          writes.push(
            call('editor@x.y', 'POST', `/api/sites/${site}/comments`, {
              url: 'http://x/',
              text: `race ${site} ${i}`
            })
          )
      // Bounded wait until every create is blocked on a lock (the counter row or the author's lock).
      const deadline = Date.now() + 15_000
      for (;;) {
        const { rows } = await pool.query(
          `select count(*)::int as n from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'
              and query ~* 'site_comment_counter|advisory'`
        )
        if (rows[0].n >= writes.length) break
        assert.ok(Date.now() < deadline, `only ${rows[0].n} of ${writes.length} creates are waiting`)
        await new Promise((resolve) => setImmediate(resolve))
      }
      await holder.query('commit')
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
    }
    const results = await Promise.all(writes)

    const statuses = results.map((r) => r.status).sort()
    assert.deepEqual(statuses, [201, ...Array(writes.length - 1).fill(429)], JSON.stringify(statuses))
    for (const r of results.filter((x) => x.status === 429)) assert.equal(r.body.code, 'COMMENT_RATE_LIMIT')
    const { rows: total } = await pool.query(
      'select count(*)::int as n from site_comment where author_account_id = $1',
      [ids.editor]
    )
    assert.equal(total[0].n, 30, 'never more than 30 a minute, whatever the site')
    const { rows: counters } = await pool.query(
      'select site_key, last_n from site_comment_counter order by site_key'
    )
    assert.equal(
      counters.reduce((sum, r) => sum + r.last_n, 0),
      1,
      'refused creates handed out no number on either site'
    )
    const other = await call('second@x.y', 'POST', `/api/sites/${SITE}/comments`, {
      url: 'http://x/',
      text: 'someone else'
    })
    assert.equal(other.status, 201, 'another author still writes')
  }
)

test(
  'length: the list root says limits.maxChars; longer text is COMMENT_TOO_LONG with the limit and its length',
  opts,
  async () => {
    const { call, post, request, base } = await world()
    const list = await call('editor@x.y', 'GET', base)
    assert.deepEqual(list.body.limits, { maxChars: 4000 })

    assert.equal((await post('editor@x.y', { text: 'x'.repeat(4000) })).status, 201, 'exactly the limit fits')
    const long = await post('editor@x.y', { text: 'x'.repeat(4001) })
    assert.equal(long.status, 400)
    assert.equal(long.body.code, 'COMMENT_TOO_LONG')
    assert.equal(long.body.field, 'text')
    assert.equal(long.body.maxChars, 4000)
    assert.equal(long.body.length, 4001)
    assert.doesNotMatch(long.body.next, /`field`|GET |POST /, 'plain words')
    assert.match(long.body.next, /4000/)

    const mine = (await post('editor@x.y', { text: 'short' })).body.comment
    const edit = await call('editor@x.y', 'PATCH', `${base}/${mine.id}`, { text: 'y'.repeat(4001) })
    assert.equal(edit.body.code, 'COMMENT_TOO_LONG')
    const sent = await request('editor@x.y', [{ url: mine.url, text: 'z'.repeat(4001) }])
    assert.equal(sent.body.code, 'COMMENT_TOO_LONG')
    assert.equal(sent.body.field, 'items[0].text')
  }
)

test('since returns only what changed at or after it', opts, async () => {
  const { call, pool, post, base } = await world()
  const a = (await post('editor@x.y', { text: 'a' })).body.comment
  const b = (await post('editor@x.y', { text: 'b' })).body.comment
  await new Promise((r) => setTimeout(r, 20))
  const mark = await dbNow(pool)
  await new Promise((r) => setTimeout(r, 20))
  await call('editor@x.y', 'PATCH', `${base}/${a.id}`, { text: 'a2' })
  const changed = await call('editor@x.y', 'GET', `${base}?since=${encodeURIComponent(mark)}`)
  assert.equal(changed.status, 200)
  assert.deepEqual(
    changed.body.comments.map((c) => c.id),
    [a.id]
  )
  assert.equal(changed.body.n_next, 3)
  assert.ok(b.id)
  const bad = await call('editor@x.y', 'GET', `${base}?since=yesterday`)
  assert.equal(bad.status, 400)
  assert.equal(bad.body.field, 'since')
})

test(
  "siteChangedAt is the site row's last_write_at (040), on the full list and on a poll",
  opts,
  async () => {
    const { call, pool, base } = await world()
    await pool.query("update site set last_write_at = '2026-09-29T10:00:00Z' where site_key = $1", [SITE])
    await pool.query("update site set last_write_at = '2026-09-29T11:00:00Z' where site_key = $1", [OTHER])
    assert.equal((await call('editor@x.y', 'GET', base)).body.siteChangedAt, '2026-09-29T10:00:00.000Z')
    const polled = await call(
      'editor@x.y',
      'GET',
      `${base}?since=${encodeURIComponent(new Date().toISOString())}`
    )
    assert.equal(polled.body.siteChangedAt, '2026-09-29T10:00:00.000Z', 'the poll carries it too')
  }
)

test('no seat on the site is refused the way every site door refuses it', opts, async () => {
  const { call, post, base } = await world()
  const { id } = (await post('editor@x.y', { text: 'x' })).body.comment
  assert.equal((await call(null, 'GET', base)).body.code, 'NOT_SIGNED_IN')
  assert.equal((await call(null, 'GET', base)).status, 401)
  for (const [method, path, body] of [
    ['GET', base],
    ['POST', base, { url: 'http://x/', text: 'y' }],
    ['PATCH', `${base}/${id}`, { text: 'z' }],
    ['POST', `${base}/${id}/resolve`],
    ['DELETE', `${base}/${id}`],
    ['POST', `${base}/clear`, {}],
    ['POST', `${base}/clear`, { url: 'http://x/' }]
  ]) {
    const res = await call('stranger@x.y', method, path, body)
    assert.equal(res.status, 403, `${method} ${path}`)
    assert.equal(res.body.code, 'SEAT_NOT_AUTHORIZED')
  }
})

test('replyTo must name a live comment of the same site', opts, async () => {
  const { call, post, base } = await world()
  const parent = (await post('editor@x.y', { text: 'root' })).body.comment
  const reply = await post('owner@x.y', { text: 'and this too', replyTo: parent.id })
  assert.equal(reply.status, 201)
  assert.equal(reply.body.comment.replyTo, parent.id)

  const foreign = (
    await call('stranger@x.y', 'POST', `/api/sites/${OTHER}/comments`, { url: 'http://h/', text: 'far' })
  ).body.comment
  const across = await post('editor@x.y', { text: 'nope', replyTo: foreign.id })
  assert.equal(across.status, 404)
  assert.equal(across.body.code, 'COMMENT_NOT_FOUND')
  assert.equal(across.body.field, 'replyTo')
  assert.equal(foreign.n, 1, 'numbering is per site')

  assert.equal((await post('editor@x.y', { text: 'x', replyTo: 'not-a-uuid' })).status, 404)
  assert.equal((await post('editor@x.y', { text: '   ' })).body.field, 'text')
  assert.equal((await post('editor@x.y', { text: 'x', element: ['no'] })).body.field, 'element')
  assert.equal((await call('editor@x.y', 'POST', base, { text: 'x' })).body.field, 'url')
})

test(
  'TH-4: a deleted root with a live reply is a tombstone (deletedRoot) — listed, polled, no words, still a thread — until its last reply goes',
  opts,
  async () => {
    const { call, pool, post, legacy, base } = await world()
    const x = (await post('owner@x.y', { text: 'Title A' })).body.comment
    await legacy(x.id, { status: 'done', answer: 'updated: it reads A', question: 'q' })
    const reply = (await post('editor@x.y', { text: 'No, Title B', replyTo: x.id })).body.comment
    await new Promise((r) => setTimeout(r, 20))
    const mark = await dbNow(pool)
    const gone = await call('owner@x.y', 'DELETE', `${base}/${x.id}`)
    assert.equal(gone.status, 200)
    assert.equal(
      gone.body.comment.deletedRoot,
      true,
      'the delete answer already says it stays as a tombstone'
    )

    for (const who of ['owner@x.y', 'editor@x.y']) {
      const list = (await call(who, 'GET', base)).body.comments
      assert.deepEqual(
        list.map((c) => c.id),
        [x.id, reply.id],
        `${who}: the reply keeps its parent`
      )
      const kept = list[0]
      assert.ok(kept.deletedAt, 'marked deleted')
      assert.equal(kept.deletedRoot, true)
      assert.equal(kept.text, '', 'the words its author removed are not sent')
      assert.equal(kept.answer, null)
      assert.equal(kept.question, null)
      assert.deepEqual(kept.attachments, [])
      assert.deepEqual(kept.locate, LOCATE, 'where it was stays, so the thread keeps its pin')
      assert.deepEqual(kept.element, ELEMENT)
      assert.equal(kept.status, 'done', 'its thread status stands: it still counts as open')
      assert.equal(kept.author.name, 'Olivia Owner')
      assert.deepEqual(kept.can, { edit: false, delete: false })
      assert.equal(list[1].deletedRoot, false, 'a live row is no tombstone')
    }
    const polled = (await call('editor@x.y', 'GET', `${base}?since=${encodeURIComponent(mark)}`)).body
      .comments
    const tomb = polled.find((c) => c.id === x.id)
    assert.equal(tomb?.text, '', 'a poll carries no removed words either')
    assert.equal(tomb?.deletedRoot, true, 'a poll tells a tombstone from a comment that went away')

    // Still a thread: anyone replies under it, resolves or reopens it, and sends it to Tracy.
    const second = await post('second@x.y', { text: 'Still B please', replyTo: x.id })
    assert.equal(second.status, 201)
    assert.equal(second.body.parent?.deletedRoot, true)
    const resolved = await call('editor@x.y', 'POST', `${base}/${x.id}/resolve`)
    assert.equal(resolved.status, 200)
    assert.equal(resolved.body.comment.status, 'resolved')
    assert.equal((await call('editor@x.y', 'POST', `${base}/${x.id}/reopen`)).body.comment.status, 'done')
    const sent = await call('editor@x.y', 'POST', `/api/sites/${SITE}/requests`, {
      sessionId: 's',
      requestId: 'r',
      items: [{ url: x.url, text: '', commentId: x.id }]
    })
    assert.equal(sent.status, 201)
    // …but its words are gone for good: no edit, no second delete.
    assert.equal((await call('owner@x.y', 'PATCH', `${base}/${x.id}`, { text: 'back' })).status, 404)
    assert.equal((await call('owner@x.y', 'DELETE', `${base}/${x.id}`)).status, 404)

    await call('second@x.y', 'DELETE', `${base}/${second.body.comment.id}`)
    await new Promise((r) => setTimeout(r, 20))
    const mark2 = await dbNow(pool)
    await call('editor@x.y', 'DELETE', `${base}/${reply.id}`)
    assert.deepEqual((await call('owner@x.y', 'GET', base)).body.comments, [], 'no live reply, no tombstone')
    const last = (await call('owner@x.y', 'GET', `${base}?since=${encodeURIComponent(mark2)}`)).body.comments
    assert.equal(
      last.find((c) => c.id === x.id)?.deletedRoot,
      false,
      'the poll brings the root back as gone once its last reply goes'
    )
  }
)

test(
  "a deleted root with no replies is simply gone, and /clear {mine: true} leaves a tombstone over other people's replies",
  opts,
  async () => {
    const { call, post, base } = await world()
    const lone = (await post('owner@x.y', { text: 'Alone' })).body.comment
    const gone = await call('owner@x.y', 'DELETE', `${base}/${lone.id}`)
    assert.equal(gone.body.comment.deletedRoot, false)
    const root = (await post('owner@x.y', { text: 'Mine' })).body.comment
    const theirs = (await post('editor@x.y', { text: 'Theirs', replyTo: root.id })).body.comment
    const cleared = await call('owner@x.y', 'POST', `${base}/clear`, { mine: true })
    assert.deepEqual(cleared.body.cleared, [root.id])
    const list = (await call('editor@x.y', 'GET', base)).body.comments
    assert.deepEqual(
      list.map((c) => [c.id, c.deletedRoot]),
      [
        [root.id, true],
        [theirs.id, false]
      ]
    )
  }
)

test(
  'sends: every send of a comment, oldest first, by whoever sent it — the last 20 only',
  opts,
  async () => {
    const { pool, call, post, request, base, ids } = await world()
    const a = (await post('editor@x.y', { text: 'Title A' })).body.comment
    const item = { url: a.url, text: '', commentId: a.id }
    await request('owner@x.y', [item])
    await request('second@x.y', [item])
    await pool.query(
      "update site_request set created_at = created_at - interval '1 hour' where account_id = $1",
      [ids.editor2]
    )
    const two = (await call('editor@x.y', 'GET', base)).body.comments[0]
    assert.deepEqual(
      two.sends.map((s) => [s.author.email, s.author.name]),
      [
        ['second@x.y', undefined],
        ['owner@x.y', 'Olivia Owner']
      ],
      'oldest first, each with its own sender'
    )
    assert.equal(two.sentToTracy, true)
    assert.ok(two.sends[0].at < two.sends[1].at)

    for (let i = 0; i < 21; i++) await request('owner@x.y', [item])
    const capped = (await call('editor@x.y', 'GET', base)).body.comments[0]
    assert.equal(capped.sends.length, 20)
    assert.ok(
      capped.sends.every((s) => s.author.email === 'owner@x.y'),
      'the two oldest dropped, the most recent 20 kept'
    )
    const polled = await call('editor@x.y', 'GET', `${base}?since=1970-01-01T00:00:00Z`)
    assert.equal(polled.body.comments[0].sends.length, 20, 'the poll carries them too')
  }
)

test(
  'POST /requests: a site accepts at most MAX_REQUESTS_PER_MINUTE sends a minute, then 429',
  opts,
  async () => {
    const { request, pool } = await world()
    const { MAX_REQUESTS_PER_MINUTE } = await import('../src/sites/comments.js')
    const item = { url: 'http://lantern.localhost/', element: null, text: 'Warmer' }
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i += 1)
      assert.equal((await request('editor@x.y', [item], { requestId: `r-${i}` })).status, 201)
    const over = await request('editor@x.y', [item], { requestId: 'r-over' })
    assert.equal(over.status, 429)
    assert.equal(over.body.error ?? over.body.code, 'COMMENT_RATE_LIMIT')
    const { rows } = await pool.query('select count(*)::int as n from site_request')
    assert.equal(rows[0].n, MAX_REQUESTS_PER_MINUTE, 'the refused send wrote nothing')
  }
)
