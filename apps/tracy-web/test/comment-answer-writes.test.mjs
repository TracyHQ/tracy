// An Apply call carrying `comment` beside `action` (the numbers of the caller's own "Send to Tracy"
// requests) writes by role, and a write that goes through stamps those requests "Done by Tracy".
// The comment-answer exception of 29/09 (a content-only seat writing what its comment points at)
// was removed with ADR 0028: no role holds `content` alone, so the number never widens a write.
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshPool } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'

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
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}

const SITE = 'lantern.localhost'
const OTHER = 'harbor.localhost'

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

async function seat(pool, siteKey, email, role) {
  const id = await accountId(pool, email)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, id, role]
  )
}

/** Two sites, each with an owner and an editor, the first with a connected component answering ok. */
async function world(pool) {
  const calls = []
  let answer = { ok: true, apply_id: 'a-1' }
  const fetchImpl = async (input, init) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify(answer), { status: 200 })
  }
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  for (const [key, label] of [
    [SITE, 'lantern'],
    [OTHER, 'harbor']
  ]) {
    await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [key, label, 'local'])
    await seat(pool, key, 'owner@x.y', 'owner')
    await seat(pool, key, 'editor@x.y', 'editor')
  }
  await seat(pool, SITE, 'second-editor@x.y', 'editor')
  await seat(pool, SITE, 'viewer@x.y', 'viewer')
  await seat(pool, OTHER, 'stranger@x.y', 'owner')
  await writeComponent(
    pool,
    SITE,
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const cookie = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = async (email, method, path, body, headers = {}) => {
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { cookie: await cookie(email), 'content-type': 'application/json', ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    return { status: res.status, body: await res.json() }
  }
  /**
   * A stage-5 comment by `email` on `siteKey`: left pending, or with the status a stage-5 turn gave
   * it when the Browser tab sent it (written by SQL — the door no longer takes a status).
   */
  const comment = async (email, { siteKey = SITE, status = 'sent' } = {}) => {
    const made = await send(email, 'POST', `/api/sites/${siteKey}/comments`, {
      text: 'Make the footer say Lantern Studio',
      url: `https://${siteKey}/`,
      element: null
    })
    assert.equal(made.status, 201)
    if (status !== 'pending')
      await pool.query(
        "update site_comment set status = $2, request_id = 'req-1', sent_at = now() where id = $1",
        [made.body.comment.id, status]
      )
    return made.body.comment
  }
  /** "Send to Tracy" (stage 6): the request row the fork writes right before the chat message. */
  const request = async (email, { siteKey = SITE, commentId } = {}) => {
    const made = await send(email, 'POST', `/api/sites/${siteKey}/requests`, {
      sessionId: 'sess-1',
      requestId: 'req-1',
      items: [
        { url: `https://${siteKey}/`, element: null, text: 'Make the footer say Lantern Studio', commentId }
      ]
    })
    assert.equal(made.status, 201)
    return made.body.requests[0]
  }
  const apply = (email, action, params, extra = {}, headers = {}) =>
    send(email, 'POST', `/api/sites/${SITE}/apply`, { action, params, ...extra }, headers)
  /** What the gate signs for the person who typed (`x-tracy-actor`), as a host dsh sends it. */
  const actor = (email) => {
    const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
      'base64url'
    )
    return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
  }
  /** `tracy-site-tools` after a `tracy_emdash` write: the conversation's own site, as the prompter. */
  const changed = async (
    email,
    { label = 'lantern', body = { tool: 'content_update' }, session = 'sess-9', turn = null } = {}
  ) => {
    const res = await app.fetch(
      new Request('http://tracy.test/api/sites/_conversation/changed', {
        method: 'POST',
        headers: {
          'x-tracy-actor': actor(email),
          'x-tracy-workspace-label': label,
          'x-tracy-session': session,
          ...(turn ? { 'x-tracy-turn': turn } : {}),
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    )
    return { status: res.status, body: await res.json() }
  }
  /** `tracy-site-tools` before a person's turn: when did the conversation's site last change? */
  const lastChange = async (email, { label = 'lantern', session = 'sess-9' } = {}) => {
    const res = await app.fetch(
      new Request('http://tracy.test/api/sites/_conversation/changed', {
        headers: {
          'x-tracy-actor': actor(email),
          'x-tracy-workspace-label': label,
          'x-tracy-session': session
        }
      })
    )
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
  }
  return { calls, send, comment, request, apply, changed, lastChange, answer: (next) => void (answer = next) }
}

const PART = { kind: 'templatePart', key: 'footer', fields: { content: '<p>Lantern Studio</p>' } }

// ADR 0028 (08/10/2026): an editor holds `content`, `code` and `site`, a viewer holds nothing. An
// editor writes the part its comment points at by role; a viewer's comment opens nothing, and no
// call is ever refused COMMENT_NOT_IN_FLIGHT any more. These tests pin both ends of that.

test(
  'comment answer: an editor writes the template part its comment points at by role, and the request is Done by Tracy',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      const mine = await w.request('editor@x.y')

      const written = await w.apply('editor@x.y', 'content.update', PART, { comment: mine.n })
      assert.equal(written.status, 200)
      assert.deepEqual(written.body, { ok: true, apply_id: 'a-1' })
      // The number is Tracy's, never the site's: the component sees the call without it.
      assert.equal(w.calls.length, 1)
      assert.equal(JSON.stringify(w.calls[0].body).includes('"comment"'), false)
      const { rows } = await pool.query(
        "select actor from audit where site_key = $1 and action = 'content.update'",
        [SITE]
      )
      assert.deepEqual(
        rows.map((r) => r.actor),
        ['editor@x.y']
      )
      const answered = await pool.query(
        'select answered_at from site_request where site_key = $1 and n = $2',
        [SITE, mine.n]
      )
      assert.notEqual(answered.rows[0].answered_at, null, 'the cited request is Done by Tracy')

      // Without a comment number too: the role, not the comment, lets it write.
      assert.equal((await w.apply('editor@x.y', 'content.update', PART)).status, 200)
      // A number that names nothing of the editor's is no reason to refuse a write its role makes
      // (there is no COMMENT_NOT_IN_FLIGHT any more); it simply stamps nothing.
      const stray = await w.apply('editor@x.y', 'content.update', PART, { comment: 424242 })
      assert.equal(stray.status, 200)
    } finally {
      await close()
    }
  }
)

test(
  "comment answer: a viewer's own sent comment or request opens no write — every action is refused by role",
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      const comment = await w.comment('viewer@x.y')
      const request = await w.request('viewer@x.y')

      for (const n of [comment.n, request.n, undefined]) {
        for (const [action, params, toolset] of [
          ['content.update', PART, 'code'],
          ['content.update', { kind: 'post', id: 1, fields: { title: 'x' } }, 'content'],
          ['extension.install', { url: 'https://evil.example/x.zip' }, 'code'],
          ['db.restore', {}, 'site'],
          ['media.upload', {}, 'content'],
          ['apply.revert', { apply_id: 'a-1' }, 'content']
        ]) {
          const refused = await w.apply('viewer@x.y', action, params, n === undefined ? {} : { comment: n })
          assert.equal(refused.status, 403, `${action} ${n}`)
          assert.deepEqual(refused.body, { code: 'TOOLSET_NOT_GRANTED', toolset, role: 'viewer' })
        }
      }
      assert.equal(w.calls.length, 0, 'the site was never asked')

      // A read stays open to a viewer.
      assert.equal((await w.apply('viewer@x.y', 'info', {})).status, 200)
    } finally {
      await close()
    }
  }
)

test(
  'siteChangedAt on the comment list moves with a successful Apply write, not with a read-only call',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      const list = async () => (await w.send('editor@x.y', 'GET', `/api/sites/${SITE}/comments`)).body
      assert.equal((await list()).siteChangedAt, null)

      assert.equal((await w.apply('owner@x.y', 'content.contract', { operation: 'inspect' })).status, 200)
      assert.equal((await list()).siteChangedAt, null, 'an inspect changes nothing')

      assert.equal((await w.apply('owner@x.y', 'content.update', PART)).status, 200)
      const { rows } = await pool.query(
        "select at from audit where site_key = $1 and action = 'content.update' order by id desc limit 1",
        [SITE]
      )
      assert.equal((await list()).siteChangedAt, rows[0].at.toISOString(), 'stamped with its audit row')
      const site = await pool.query('select site_key, last_write_at from site order by site_key')
      assert.deepEqual(
        site.rows.map((r) => [r.site_key, r.last_write_at?.toISOString() ?? null]),
        [
          [OTHER, null],
          [SITE, rows[0].at.toISOString()]
        ],
        'kept on the site row (040), the other site untouched'
      )

      // A write the site refused moves nothing.
      w.answer({ ok: false, error: 'bad_params' })
      await w.apply('owner@x.y', 'content.update', PART)
      assert.equal((await list()).siteChangedAt, rows[0].at.toISOString())
    } finally {
      await close()
    }
  }
)

test(
  "POST /changed (dev round 02/10): an EmDash write in a comment turn answers that turn's own requests — the Apply door's rule, by the turn's comment numbers",
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      const answered = async (n) =>
        (await pool.query('select answered_at from site_request where site_key = $1 and n = $2', [SITE, n]))
          .rows[0].answered_at !== null
      /** The turn the host dsh opened for a "Send to Tracy" message (`POST /turn`, `comment_ns`). */
      const turn = (turnId, actor, commentNs) =>
        pool.query(
          `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, comment_ns)
           values ($1, $2, $3, $4, $5, 'Make the footer say Lantern Studio', 'comment', $6)`,
          [turnId, SITE, turnId.split(':')[0], Number(turnId.split(':')[1]), actor, commentNs]
        )
      const mine = await w.request('editor@x.y')
      const later = await w.request('editor@x.y')

      // A panel turn (no comment numbers) and a look edit in a comment turn answer nothing.
      await turn('sess-9:1', 'editor@x.y', null)
      await w.changed('editor@x.y', { turn: 'sess-9:1', body: { tool: 'content_update', via: 'emdash-mcp' } })
      await turn('sess-9:2', 'editor@x.y', [mine.n])
      await w.changed('editor@x.y', { turn: 'sess-9:2', body: { tool: 'edit', via: 'file-look' } })
      assert.equal(await answered(mine.n), false)
      // Someone else's turn reported by this seat answers nothing: the requests are the typer's own.
      await turn('sess-9:3', 'owner@x.y', [mine.n])
      await w.changed('editor@x.y', { turn: 'sess-9:3', body: { tool: 'content_update', via: 'emdash-mcp' } })
      assert.equal(await answered(mine.n), false)

      // The EmDash write of the comment turn: its request is "Done by Tracy"; the other one is not.
      const done = await w.changed('editor@x.y', {
        turn: 'sess-9:2',
        body: { tool: 'content_update', via: 'emdash-mcp' }
      })
      assert.equal(done.status, 200)
      assert.equal(await answered(mine.n), true)
      assert.equal(await answered(later.n), false)
    } finally {
      await close()
    }
  }
)

test(
  'POST /changed (a write outside the Apply door: tracy_emdash, a look file, look.revert): the conversation site is stamped changed for every viewer, and audited',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      const list = async () => (await w.send('owner@x.y', 'GET', `/api/sites/${SITE}/comments`)).body
      assert.equal((await list()).siteChangedAt, null)

      const done = await w.changed('editor@x.y')
      assert.equal(done.status, 200)
      assert.match(done.body.changedAt, /^\d{4}-\d\d-\d\dT/)
      assert.equal((await list()).siteChangedAt, done.body.changedAt)
      const { rows } = await pool.query(
        "select actor, site_key, detail from audit where action = 'site.changed'"
      )
      assert.deepEqual(rows, [
        { actor: 'editor@x.y', site_key: SITE, detail: { tool: 'content_update', sessionId: 'sess-9' } }
      ])
      // A tool name is optional — a look write's file tool or `look.revert` too (F2); anything else
      // there is refused.
      assert.equal((await w.changed('editor@x.y', { body: {} })).status, 200)
      const revert = await w.changed('editor@x.y', { body: { tool: 'look.revert' } })
      assert.equal(revert.status, 200)
      assert.equal((await list()).siteChangedAt, revert.body.changedAt)
      assert.equal((await w.changed('editor@x.y', { body: { tool: 'Look Revert!' } })).status, 400)
      const bad = await w.changed('editor@x.y', { body: { tool: 42 } })
      assert.equal(bad.status, 400)
      assert.equal(bad.body.code, 'INVALID_REQUEST')

      // Seat-authed like every site door: no seat on the site, no stamp.
      const outsider = await w.changed('stranger@x.y')
      assert.equal(outsider.status, 403)
      assert.equal(outsider.body.code, 'SEAT_NOT_AUTHORIZED')
      const nowhere = await w.changed('editor@x.y', { label: 'no-such-site' })
      assert.equal(nowhere.status, 404)
      assert.equal(nowhere.body.code, 'CONVERSATION_SITE_UNKNOWN')
      const other = await pool.query('select last_write_at from site where site_key = $1', [OTHER])
      assert.equal(other.rows[0].last_write_at, null)
    } finally {
      await close()
    }
  }
)

test(
  'GET /changed (V7S-1): when the conversation site last changed, read-only, seat-authed, for the site-changed notice',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      const never = await w.lastChange('editor@x.y')
      assert.equal(never.status, 200)
      assert.deepEqual(never.body, { changedAt: null, byThisConversation: false })
      assert.equal(never.cache, 'private, no-store')

      const done = await w.changed('owner@x.y')
      const after = await w.lastChange('editor@x.y')
      assert.deepEqual(after.body, { changedAt: done.body.changedAt, byThisConversation: true })
      // Reading writes nothing: no audit row, the stamp unchanged.
      const rows = await pool.query("select count(*)::int as n from audit where action = 'site.changed'")
      assert.equal(rows.rows[0].n, 1)
      assert.deepEqual((await w.lastChange('editor@x.y')).body, {
        changedAt: done.body.changedAt,
        byThisConversation: true
      })

      const outsider = await w.lastChange('stranger@x.y')
      assert.equal(outsider.status, 403)
      assert.equal(outsider.body.code, 'SEAT_NOT_AUTHORIZED')
      const nowhere = await w.lastChange('editor@x.y', { label: 'no-such-site' })
      assert.equal(nowhere.status, 404)
      assert.equal(nowhere.body.code, 'CONVERSATION_SITE_UNKNOWN')
    } finally {
      await close()
    }
  }
)

test(
  "GET /changed (e2e v8 V8-1): says whether the last write was the asking conversation's own — Apply door and POST /changed alike",
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      const w = await world(pool)
      // The conversation's own write through the Apply door: stamped after its call was made, so only
      // the session recorded with the stamp can tell it from another conversation's (V8-1).
      const own = await w.apply(
        'editor@x.y',
        'content.update',
        PART,
        { comment: (await w.comment('editor@x.y')).n },
        {
          'x-tracy-session': 'sess-9'
        }
      )
      assert.equal(own.status, 200)
      const mine = await w.lastChange('editor@x.y')
      assert.match(mine.body.changedAt, /^\d{4}-\d\d-\d\dT/)
      assert.equal(mine.body.byThisConversation, true)
      assert.equal(
        (await w.lastChange('editor@x.y', { session: 'sess-other' })).body.byThisConversation,
        false
      )

      // Another conversation writes after it (an EmDash write reported by POST /changed): no longer its own.
      const theirs = await w.changed('owner@x.y', { session: 'sess-other' })
      assert.deepEqual((await w.lastChange('editor@x.y')).body, {
        changedAt: theirs.body.changedAt,
        byThisConversation: false
      })
      assert.equal((await w.lastChange('owner@x.y', { session: 'sess-other' })).body.byThisConversation, true)

      // A write that names no conversation (no session header) is nobody's own.
      await w.apply('owner@x.y', 'content.update', PART)
      assert.equal(
        (await w.lastChange('owner@x.y', { session: 'sess-other' })).body.byThisConversation,
        false
      )
      // A header that is not a session id never matches, whatever was stored.
      assert.equal((await w.lastChange('owner@x.y', { session: '' })).body.byThisConversation, false)
    } finally {
      await close()
    }
  }
)
