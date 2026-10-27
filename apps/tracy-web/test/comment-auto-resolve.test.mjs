// Comments sent to Tracy close themselves on proof of a write (Brian, 03–04/10/2026, ADR 0025): a
// write through the Apply door citing the request of a comment's LATEST send resolves that comment as
// Tracy; a stamp of an older send never closes a comment that got new words after it; a reply reopens
// it. The "Send all" picker learns which comments are already sent and waiting
// (`GET /comments/sent`), and the chat learns what one comment turn did (`GET /comments/report`).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'
import { closeTurn, openTurn } from '../src/sites/turns.js'
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
const SITE = 'lantern.localhost'
const PART = { kind: 'templatePart', key: 'footer', fields: { content: '<p>Lantern Studio</p>' } }

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** One site with an owner and an editor, a component that answers every write. */
async function world(_t) {
  const { pool } = db
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true, apply_id: 'a-1' }), { status: 200 })
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'lantern', 'local'])
  for (const [email, role] of [
    ['owner@x.y', 'owner'],
    ['editor@x.y', 'editor']
  ]) {
    const { rows } = await pool.query(`insert into account (email) values ($1) returning id`, [email])
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [SITE, rows[0].id, role]
    )
  }
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
  const tick = () => new Promise((r) => setTimeout(r, 15))
  const w = {
    pool,
    send,
    base,
    /** A new open comment by `email`. */
    async comment(email, text = 'Footer says Lantern', extra = {}) {
      const made = await send(email, 'POST', base, { text, url: `https://${SITE}/`, element: null, ...extra })
      assert.equal(made.status, 201)
      await tick()
      return made.body.comment
    },
    /** "Send to Tracy" of these comments in one chat message; the request numbers, in order. */
    async sendToTracy(email, ids, session = 'sess-1') {
      const sent = await send(email, 'POST', `/api/sites/${SITE}/requests`, {
        sessionId: session,
        requestId: `r-${Math.random()}`,
        items: ids.map((id) => ({ url: `https://${SITE}/`, element: null, text: '', commentId: id }))
      })
      assert.equal(sent.status, 201)
      await tick()
      return sent.body.requests.map((r) => r.n)
    },
    /** A site write through the Apply door citing `ns`. */
    async write(email, ns) {
      const written = await send(email, 'POST', `/api/sites/${SITE}/apply`, {
        action: 'content.update',
        params: PART,
        comment: ns.length === 1 ? ns[0] : ns
      })
      assert.equal(written.status, 200)
      await tick()
    },
    async row(id, email = 'owner@x.y') {
      const list = (await send(email, 'GET', base)).body.comments
      return list.find((x) => x.id === id)
    }
  }
  return w
}

test('a write citing the latest send of a comment resolves it as Tracy', opts, async (t) => {
  const w = await world(t)
  const c = await w.comment('editor@x.y')
  const [n] = await w.sendToTracy('owner@x.y', [c.id])
  assert.equal((await w.row(c.id)).status, 'pending')

  await w.write('owner@x.y', [n])

  const after = await w.row(c.id)
  assert.equal(after.status, 'resolved')
  assert.ok(Date.parse(after.resolvedAt) > 0)
  assert.equal(after.resolvedByTracy, true)
  assert.deepEqual(after.resolvedBy, { accountId: '', email: '', name: 'Tracy', initial: 'T', tracy: true })
})

test('a reply reopens a comment Tracy resolved, and it no longer reads as Tracy’s', opts, async (t) => {
  const w = await world(t)
  const c = await w.comment('editor@x.y')
  const [n] = await w.sendToTracy('owner@x.y', [c.id])
  await w.write('owner@x.y', [n])

  const reply = await w.send('editor@x.y', 'POST', w.base, {
    text: 'Also make it bold',
    url: `https://${SITE}/`,
    element: null,
    replyTo: c.id
  })
  assert.equal(reply.status, 201)
  assert.equal(reply.body.parent.status, 'pending')
  assert.equal(reply.body.parent.resolvedByTracy, false)
  assert.equal(reply.body.parent.resolvedBy, null)
})

test('a stamp of an older send never closes a comment with new words after it', opts, async (t) => {
  const w = await world(t)
  const replied = await w.comment('editor@x.y', 'Footer says Lantern')
  const edited = await w.comment('editor@x.y', 'Header says Lantern')
  const resent = await w.comment('editor@x.y', 'Title says Lantern')
  const [nReplied, nEdited, nResent] = await w.sendToTracy('owner@x.y', [replied.id, edited.id, resent.id])

  // After the send: a reply under one, an edit of another, and a second send of the third.
  await w.comment('owner@x.y', 'and the copyright year', { replyTo: replied.id })
  const edit = await w.send('editor@x.y', 'PATCH', `${w.base}/${edited.id}`, {
    text: 'Header says Lantern Studio'
  })
  assert.equal(edit.status, 200)
  await w.sendToTracy('owner@x.y', [resent.id], 'sess-2')

  // Tracy's write cites the FIRST send of all three: stamped, but none of them closes.
  await w.write('owner@x.y', [nReplied, nEdited, nResent])
  for (const id of [replied.id, edited.id, resent.id]) {
    const row = await w.row(id)
    assert.equal(row.status, 'pending', `comment ${id} stays open`)
    assert.ok(Date.parse(row.sends[0].answeredAt) > 0, 'the old send is still stamped')
  }
})

test('a write that does not cite the request, or fails, resolves nothing', opts, async (t) => {
  const w = await world(t)
  const c = await w.comment('editor@x.y')
  const [n] = await w.sendToTracy('owner@x.y', [c.id])
  // Another person's write citing the owner's number is refused, so it resolves nothing.
  const foreign = await w.send('editor@x.y', 'POST', `/api/sites/${SITE}/apply`, {
    action: 'content.update',
    params: { kind: 'post', id: 1, fields: { title: 'x' } },
    comment: n
  })
  assert.notEqual(foreign.body?.ok, false)
  assert.equal((await w.row(c.id)).status, 'pending')
  // A write citing no number.
  const plain = await w.send('owner@x.y', 'POST', `/api/sites/${SITE}/apply`, {
    action: 'content.update',
    params: PART
  })
  assert.equal(plain.status, 200)
  assert.equal((await w.row(c.id)).status, 'pending')
})

test('a person resolving or reopening clears Tracy as the resolver', opts, async (t) => {
  const w = await world(t)
  const c = await w.comment('editor@x.y')
  const [n] = await w.sendToTracy('owner@x.y', [c.id])
  await w.write('owner@x.y', [n])
  const reopened = await w.send('owner@x.y', 'POST', `${w.base}/${c.id}/reopen`)
  assert.equal(reopened.body.comment.resolvedByTracy, false)
  const resolved = await w.send('editor@x.y', 'POST', `${w.base}/${c.id}/resolve`)
  assert.equal(resolved.body.comment.resolvedByTracy, false)
  assert.equal(resolved.body.comment.resolvedBy.email, 'editor@x.y')
})

/** The turn a send's chat message opened, as the host records it (`POST /turn`), in `state`. */
async function turnOf(w, { session, turn, ns, state = 'closed', replyState = null, endReason = undefined }) {
  if (endReason !== undefined) {
    // Closed by the host's `/moment` with how the turn ended (`site_turn.end_reason`, 054).
    await openTurn(w.pool, {
      turnId: `${session}:${turn}`,
      siteKey: SITE,
      actor: 'owner@x.y',
      title: 'From comments',
      source: 'comment',
      commentNs: ns
    })
    await closeTurn(w.pool, { turnId: `${session}:${turn}`, siteKey: SITE, sha: null, files: 0, endReason })
    return
  }
  await openTurn(w.pool, {
    turnId: `${session}:${turn}`,
    siteKey: SITE,
    actor: 'owner@x.y',
    title: 'From comments',
    source: 'comment',
    commentNs: ns
  })
  await w.pool.query('update site_turn set state = $2, reply_state = $3 where turn_id = $1', [
    `${session}:${turn}`,
    state,
    replyState
  ])
}

test('the picker learns which open comments are sent and waiting, and since when', opts, async (t) => {
  const w = await world(t)
  const never = await w.comment('editor@x.y', 'never sent')
  const waiting = await w.comment('editor@x.y', 'sent, nothing new')
  const repliedTo = await w.comment('editor@x.y', 'sent, then a reply')
  const failed = await w.comment('editor@x.y', 'sent into a turn that died')
  const cancelled = await w.comment('editor@x.y', 'sent into a turn stopped mid-answer')
  const done = await w.comment('editor@x.y', 'sent and done')
  const [nWaiting, , , , nDone] = await w.sendToTracy('owner@x.y', [
    waiting.id,
    repliedTo.id,
    failed.id,
    cancelled.id,
    done.id
  ])
  await turnOf(w, { session: 'sess-1', turn: 1, ns: [nWaiting, nWaiting + 1, nDone] })
  const [nFailed] = await w.sendToTracy('owner@x.y', [failed.id], 'sess-9')
  await turnOf(w, { session: 'sess-9', turn: 1, ns: [nFailed], state: 'stale' })
  const [nCancelled] = await w.sendToTracy('owner@x.y', [cancelled.id], 'sess-8')
  await turnOf(w, { session: 'sess-8', turn: 1, ns: [nCancelled], replyState: 'interrupted' })
  await w.comment('owner@x.y', 'one more thing', { replyTo: repliedTo.id })
  await w.write('owner@x.y', [nDone])

  const res = await w.send('editor@x.y', 'GET', `${w.base}/sent`)
  assert.equal(res.status, 200)
  const sent = new Map(res.body.sent.map((s) => [s.id, s.at]))
  const latest = (await w.row(waiting.id)).sends.at(-1).at
  // `failed` and `cancelled` were sent twice: first in the message that went well, then into a turn
  // that died or was stopped — that second send does not count, so they wait since the first.
  assert.deepEqual([...sent.keys()].sort(), [waiting.id, failed.id, cancelled.id].sort())
  assert.equal(sent.get(waiting.id), latest)
  assert.equal(sent.get(failed.id), latest)
  assert.equal(sent.get(cancelled.id), latest)
  assert.ok(!sent.has(never.id), 'never sent: ticked')
  assert.ok(!sent.has(repliedTo.id), 'a reply after the send: ticked')
  assert.ok(!sent.has(done.id), 'resolved: not in the picker at all')
})

test('a comment whose only send went into a failed turn counts as never sent', opts, async (t) => {
  const w = await world(t)
  const died = await w.comment('editor@x.y', 'only send died')
  const stopped = await w.comment('editor@x.y', 'only send was stopped')
  const [nDied] = await w.sendToTracy('owner@x.y', [died.id], 'sess-a')
  await turnOf(w, { session: 'sess-a', turn: 3, ns: [nDied], state: 'stale' })
  const [nStopped] = await w.sendToTracy('owner@x.y', [stopped.id], 'sess-b')
  await turnOf(w, { session: 'sess-b', turn: 1, ns: [nStopped], replyState: 'interrupted' })
  const res = await w.send('owner@x.y', 'GET', `${w.base}/sent`)
  assert.deepEqual(res.body.sent, [])
})

test(
  'a send into a turn that ended in a model error, a cancel or a block counts as never sent',
  opts,
  async (t) => {
    // Brian 03/10: the turn ended with "DeepSeek Messages transport failed" — those comments were not done.
    const w = await world(t)
    const outcomes = ['error', 'aborted', 'blocked', 'completed', 'max-tokens']
    const ids = {}
    for (const [i, kind] of outcomes.entries()) {
      const c = await w.comment('editor@x.y', `sent into a turn that ended ${kind}`)
      const [n] = await w.sendToTracy('owner@x.y', [c.id], `sess-${kind}`)
      await turnOf(w, { session: `sess-${kind}`, turn: i + 1, ns: [n], endReason: kind })
      ids[kind] = c.id
    }
    const sent = new Set((await w.send('owner@x.y', 'GET', `${w.base}/sent`)).body.sent.map((s) => s.id))
    assert.deepEqual(
      outcomes.filter((kind) => sent.has(ids[kind])),
      ['completed', 'max-tokens'],
      'only turns that ended normally count as sent'
    )
  }
)

test('the sent list keeps the seat rule', opts, async (t) => {
  const w = await world(t)
  const { rows } = await w.pool.query(`insert into account (email) values ('stranger@x.y') returning id`)
  assert.ok(rows[0].id)
  assert.equal((await w.send('stranger@x.y', 'GET', `${w.base}/sent`)).status, 403)
  assert.equal(
    (await w.send('stranger@x.y', 'GET', `${w.base}/report?turn=${encodeURIComponent('sess-1:1')}`)).status,
    403
  )
})

test('the report of a comment turn: done where a write cited it, else not confirmed', opts, async (t) => {
  const w = await world(t)
  const footer = await w.comment('editor@x.y', 'Footer says Lantern')
  const header = await w.comment('owner@x.y', 'Header says Lantern')
  const title = await w.comment('editor@x.y', 'Title says Lantern')
  const ns = await w.sendToTracy('owner@x.y', [footer.id, header.id, title.id], 'sess-r')
  await turnOf(w, { session: 'sess-r', turn: 2, ns, state: 'open' })
  await w.write('owner@x.y', [ns[0], ns[2]])

  const res = await w.send('owner@x.y', 'GET', `${w.base}/report?turn=${encodeURIComponent('sess-r:2')}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, {
    turn: 'sess-r:2',
    comments: [
      { id: footer.id, text: 'Footer says Lantern', done: true },
      { id: header.id, text: 'Header says Lantern', done: false },
      { id: title.id, text: 'Title says Lantern', done: true }
    ]
  })
})

test('a turn the report does not know, or one typed in the chat, lists nothing', opts, async (t) => {
  const w = await world(t)
  const unknown = await w.send('owner@x.y', 'GET', `${w.base}/report?turn=${encodeURIComponent('nobody:9')}`)
  assert.deepEqual(unknown.body, { turn: 'nobody:9', comments: [] })
  await openTurn(w.pool, {
    turnId: 'sess-p:1',
    siteKey: SITE,
    actor: 'owner@x.y',
    title: 'Make the footer blue',
    source: 'panel'
  })
  const panel = await w.send('owner@x.y', 'GET', `${w.base}/report?turn=${encodeURIComponent('sess-p:1')}`)
  assert.deepEqual(panel.body, { turn: 'sess-p:1', comments: [] })
  const bad = await w.send('owner@x.y', 'GET', `${w.base}/report?turn=not-a-turn`)
  assert.equal(bad.status, 400)
  assert.equal(bad.body.code, 'COMMENT_BAD_INPUT')
})
