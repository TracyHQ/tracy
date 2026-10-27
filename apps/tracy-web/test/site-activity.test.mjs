// The Site changes tab's one list (plan `tasks/todo-site-changes.md` §5, P1): `sites/activity.js`
// reads chat turns, their writes, outside rows and CMS admin edits from Postgres, the Git moments
// no row accounts for from the host's `webroot-history` job, and serves them newest first under one
// cursor. Writes join their turn by `turn_id` only — never by time.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { Hono } from 'hono'
import { personFace } from '../src/lib/person-face.js'
import { mountActivity, readActivity } from '../src/sites/activity.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
const skip = !process.env.TEST_DATABASE_URL

const SITE = { site_key: 'scwp1002.tracy.test', label: 'scwp1002', host: 'local', platform: 'wordpress' }
const MAI = 'mai.tran@example.test'
const SAM = 'sam.ortiz@example.test'

/** A fixed wall clock: every row is placed relative to it, so ordering never depends on `now()`. */
const T0 = Date.parse('2026-10-01T10:00:00Z')
const iso = (minutes) => new Date(T0 + minutes * 60_000).toISOString()

/** A host that answers `webroot-history` with `rows` (Git's newest first), recording each call. */
function fakeHost(rows = [], extra = {}) {
  const calls = []
  const runJob = async (_site, input) => {
    calls.push(input)
    if (extra.fail) return { ok: false, reason: extra.fail }
    return {
      ok: true,
      output: `==> narration\n${JSON.stringify({ ok: true, head: 'f'.repeat(40), latest: null, rows, ...extra.answer })}`
    }
  }
  return { runJob, calls }
}

const sha = (c) => c.repeat(40)
const commit = (c, minutes, over = {}) => ({
  sha: sha(c),
  at: Math.floor((T0 + minutes * 60_000) / 1000),
  by: { kind: 'agent' },
  kind: 'moment',
  title: `moment ${c}`,
  turn: null,
  files: 1,
  ...over
})

async function seed(pool) {
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    SITE.site_key,
    SITE.label,
    SITE.host,
    SITE.platform
  ])
  await pool.query(`insert into account (email, display_name) values ($1, 'Mai Tran'), ($2, 'Sam Ortiz')`, [
    MAI,
    SAM
  ])
}

async function turn(pool, id, over = {}) {
  const row = {
    session_id: id.split(':')[0],
    turn: Number(id.split(':')[1] ?? 1),
    actor: MAI,
    title: `prompt ${id}`,
    source: 'panel',
    opened_at: iso(0),
    closed_at: iso(1),
    state: 'closed',
    head_sha: null,
    files: 0,
    ...over
  }
  await pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, rpc_id, opened_at,
       closed_at, state, head_sha, files, unsealed_start, concurrent, steered, comment_ns)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id,
      SITE.site_key,
      row.session_id,
      row.turn,
      row.actor,
      row.title,
      row.source,
      row.rpc_id ?? null,
      row.opened_at,
      row.closed_at,
      row.state,
      row.head_sha,
      row.files,
      row.unsealed_start ?? false,
      row.concurrent ?? false,
      row.steered ?? false,
      row.comment_ns ?? null
    ]
  )
}

async function write(pool, over = {}) {
  const row = {
    at: iso(0),
    turn_id: null,
    session_id: null,
    actor: MAI,
    action: 'content.update',
    outcome: 'ok',
    target: null,
    via: 'apply',
    ...over
  }
  await pool.query(
    `insert into site_write (site_key, at, turn_id, session_id, actor, action, outcome, target, via)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      SITE.site_key,
      row.at,
      row.turn_id,
      row.session_id,
      row.actor,
      row.action,
      row.outcome,
      row.target && JSON.stringify(row.target),
      row.via
    ]
  )
}

async function outside(pool, c, minutes, over = {}) {
  await pool.query(
    'insert into site_outside (sha, site_key, at, files, cause, deploy_tag) values ($1, $2, $3, $4, $5, $6)',
    [sha(c), SITE.site_key, iso(minutes), over.files ?? 2, over.cause ?? 'seal', over.deploy_tag ?? null]
  )
}

async function cmsEdit(pool, n, minutes, over = {}) {
  await pool.query(
    `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, resource_title, op, occurred_at, cursor_key)
     values ($1, 'wordpress-tracy-log', $2, 'page', $3, $4, 'update', $5, $6)`,
    [
      SITE.site_key,
      JSON.stringify(over.actor ?? { name: 'minh', id: '3' }),
      String(n),
      over.title ?? `Page ${n}`,
      iso(minutes),
      String(n)
    ]
  )
}

const read = (pool, host, opts = {}) => readActivity(pool, SITE, { runJob: host.runJob, ...opts })

/** The face `/api/team` gives the account behind `email` (`personFace` over the same row). */
async function faceOf(pool, email) {
  const { rows } = await pool.query(
    'select id, email, display_name, avatar_url from account where email = $1',
    [email]
  )
  return personFace(rows[0])
}
const ids = (page) => page.items.map((i) => `${i.kind}:${i.id}`)

describe('site activity', { skip }, () => {
  before(db.open)
  beforeEach(db.reset)
  after(db.close)

  test('a chat turn carries the writes of ITS turn id, never a neighbour’s that landed at the same second', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { title: 'Change the badge text', opened_at: iso(0), closed_at: iso(2) })
    await turn(pool, 's2:1', {
      actor: SAM,
      title: 'Fix the footer',
      opened_at: iso(0),
      closed_at: iso(2),
      head_sha: sha('a'),
      files: 2
    })
    await write(pool, {
      turn_id: 's1:1',
      at: iso(1),
      action: 'content.update',
      target: { kind: 'page', id: 12, fields: ['title'] }
    })
    // Same instant, other conversation: must stay with s2:1.
    await write(pool, { turn_id: 's2:1', at: iso(1), action: 'content.contract', actor: SAM })
    const page = await read(pool, fakeHost())
    const one = page.items.find((i) => i.id === 's1:1')
    const two = page.items.find((i) => i.id === 's2:1')
    assert.equal(one.kind, 'chat')
    assert.deepEqual(one.by, { name: 'Mai Tran', email: MAI, face: await faceOf(pool, MAI) })
    assert.equal(one.title, 'Change the badge text')
    assert.deepEqual(
      one.writes.map((w) => w.action),
      ['content.update']
    )
    assert.deepEqual(one.writes[0].target, { kind: 'page', id: '12', fields: ['title'] })
    assert.equal(one.files, null)
    assert.deepEqual(one.undo, { allowed: false, reason: 'no-files' })
    assert.deepEqual(
      two.writes.map((w) => w.action),
      ['content.contract']
    )
    assert.deepEqual(two.files, { sha: sha('a'), count: 2 })
    assert.deepEqual(two.undo, { allowed: true })
    assert.equal(two.at, iso(0), 'a chat row sits at the time its turn opened')
  })

  test('three prompts of one conversation are three rows; the one that changed nothing is not shown', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { opened_at: iso(0), closed_at: iso(1), head_sha: sha('a'), files: 1 })
    await turn(pool, 's1:2', { opened_at: iso(2), closed_at: iso(3) })
    await turn(pool, 's1:3', { opened_at: iso(4), closed_at: iso(5) })
    await write(pool, { turn_id: 's1:3', session_id: 's1', at: iso(4.5) })
    // A write that was refused changed nothing: it alone keeps no turn on the list.
    await write(pool, { turn_id: 's1:2', session_id: 's1', at: iso(2.5), outcome: 'refused' })
    const page = await read(pool, fakeHost())
    assert.deepEqual(ids(page), ['chat:s1:3', 'chat:s1:1'])
    assert.deepEqual(page.counts, { all: 2, chat: 2, outside: 0 })
  })

  test('an open turn is not shown; one left open for over 30 minutes shows as stale', async () => {
    const { pool } = db
    await seed(pool)
    const recent = new Date(Date.now() - 60_000).toISOString()
    await turn(pool, 's1:1', { state: 'open', opened_at: recent, closed_at: null, files: 0 })
    await write(pool, { turn_id: 's1:1', at: recent })
    await turn(pool, 's2:1', { state: 'open', opened_at: iso(0), closed_at: null })
    await write(pool, { turn_id: 's2:1', at: iso(1), outcome: 'unknown' })
    const page = await read(pool, fakeHost())
    assert.deepEqual(ids(page), ['chat:s2:1'])
    assert.equal(page.items[0].state, 'stale')
    assert.equal(page.items[0].writes[0].outcome, 'unknown')
  })

  test('every person a row names carries the face /api/team gives their account; a Git identity outside Tracy has none', async () => {
    const { pool } = db
    await seed(pool)
    await pool.query(
      `update account set avatar_url = 'https://lh3.googleusercontent.com/a/sam=s96-c' where email = $1`,
      [SAM]
    )
    await turn(pool, 's1:1', { opened_at: iso(10), closed_at: iso(11), head_sha: sha('a'), files: 1 })
    // Writes with no turn record, by an address no account holds.
    await write(pool, { turn_id: 'gone:1', session_id: 'gone', at: iso(5), actor: 'left@example.test' })
    const host = fakeHost([
      commit('c', 30, { by: { kind: 'person', name: 'Sam', email: SAM.toUpperCase() } }),
      commit('d', 20, { by: { kind: 'person', name: 'Ola', email: 'ola@outside.test' } }),
      commit('a', 11, { turn: 's1:1' })
    ])
    const page = await read(pool, host)
    const byId = Object.fromEntries(page.items.map((i) => [i.id, i]))
    assert.deepEqual(byId['s1:1'].by.face, await faceOf(pool, MAI), 'a turn: the typer’s face')
    const sam = byId[sha('c')].by
    assert.deepEqual(
      sam,
      {
        kind: 'person',
        name: 'Sam',
        email: SAM.toUpperCase(),
        face: await faceOf(pool, SAM)
      },
      'a Git trailer naming a seat: that account’s face, whatever the case of the address'
    )
    assert.match(
      sam.face.avatarUrl,
      /^\/auth\/avatar\/[0-9a-f-]{36}\?v=[0-9a-f]{8}$/,
      'Tracy’s own address for the picture'
    )
    assert.equal(byId[sha('d')].by.face, null, 'a Git identity no account holds: no face')
    assert.equal(byId['turn:gone:1'].by.face, null, 'writes by an address no account holds: no face')
  })

  test('writes with no turn record are an unknown row, grouped by turn id, else by conversation', async () => {
    const { pool } = db
    await seed(pool)
    await write(pool, { turn_id: 'gone:4', session_id: 'gone', at: iso(1) })
    await write(pool, { turn_id: 'gone:4', session_id: 'gone', at: iso(2), action: 'menu.update' })
    await write(pool, {
      turn_id: null,
      session_id: 'old-dsh',
      at: iso(5),
      actor: SAM,
      via: 'emdash-mcp',
      action: 'content_update'
    })
    const page = await read(pool, fakeHost())
    assert.deepEqual(
      page.items.map((i) => [i.kind, i.writes.length, i.by?.email]),
      [
        ['unknown', 1, SAM],
        ['unknown', 2, MAI]
      ]
    )
    assert.equal(page.items[0].writes[0].via, 'emdash-mcp')
    assert.equal(page.items[1].undo.allowed, false)
  })

  test('outside rows: files from site_outside (a deploy says so) and CMS admin edits; the filter and counts follow', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { opened_at: iso(10), head_sha: sha('a'), files: 1 })
    await outside(pool, 'b', 9)
    await outside(pool, 'c', 8, { cause: 'deploy', deploy_tag: 'app-1234', files: 1 })
    await cmsEdit(pool, 1, 7)
    const all = await read(pool, fakeHost())
    assert.deepEqual(ids(all), [
      'chat:s1:1',
      `outside-files:${sha('b')}`,
      `outside-files:${sha('c')}`,
      'outside-cms:wordpress-tracy-log:1'
    ])
    assert.deepEqual(all.counts, { all: 4, chat: 1, outside: 3 })
    const deploy = all.items[2]
    assert.equal(deploy.cause, 'deploy')
    assert.equal(deploy.deployTag, 'app-1234')
    assert.deepEqual(deploy.undo, { allowed: false, reason: 'outside' })
    const cms = all.items[3]
    assert.deepEqual(cms.cmsActor, { name: 'minh', id: '3' })
    assert.equal(cms.resource.title, 'Page 1')
    const onlyOutside = await read(pool, fakeHost(), { filter: 'outside' })
    assert.equal(onlyOutside.items.length, 3)
    assert.deepEqual(onlyOutside.counts, all.counts, 'counts do not depend on the filter')
    const onlyChat = await read(pool, fakeHost(), { filter: 'chat' })
    assert.deepEqual(ids(onlyChat), ['chat:s1:1'])
  })

  test('paging: every row exactly once, even when newer rows arrive between pages', async () => {
    const { pool } = db
    await seed(pool)
    for (let n = 0; n < 5; n++)
      await turn(pool, `s${n}:1`, { opened_at: iso(n), head_sha: sha(String(n)), files: 1 })
    // Two rows at the very same instant: the id breaks the tie.
    await outside(pool, 'd', 2)
    await cmsEdit(pool, 1, 2)
    const host = fakeHost()
    const seen = []
    let page = await read(pool, host, { limit: 3 })
    seen.push(...ids(page))
    await turn(pool, 'new:1', { opened_at: iso(100), head_sha: sha('e'), files: 1 })
    while (page.nextCursor) {
      page = await read(pool, host, { limit: 3, cursor: page.nextCursor })
      seen.push(...ids(page))
    }
    assert.equal(new Set(seen).size, seen.length, 'no row twice')
    assert.equal(seen.length, 7, 'no row lost')
    assert.ok(!seen.includes('chat:new:1'), 'a row newer than the first page waits for a re-read')
  })

  test('Git moments no row accounts for are read from the host: legacy, outside, and an undo that strikes its moment', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { opened_at: iso(50), head_sha: sha('a'), files: 1 })
    await outside(pool, 'b', 40)
    const host = fakeHost([
      commit('9', 60, {
        title: 'restore: undo 1111111 (agent: old)',
        by: { kind: 'person', name: 'x', email: 'x@y' },
        files: 1
      }),
      commit('a', 51, { turn: 's1:1' }),
      commit('t', 45, { turn: 's9:9' }),
      commit('b', 40, { by: { kind: 'outside' }, kind: 'outside', title: 'Changes made outside Tracy' }),
      commit('8', 30, {
        by: { kind: 'outside' },
        kind: 'outside',
        title: 'deploy app-77 updated tracy-access.php'
      }),
      commit('1', 20, { title: 'old' }),
      { kind: 'backup', version: 1, sha: sha('1'), title: 'v1', at: 1, by: { kind: 'agent' }, files: 3 }
    ])
    const page = await read(pool, host)
    assert.deepEqual(host.calls, [{ kind: 'webroot-history' }])
    assert.deepEqual(ids(page), [
      `legacy:${sha('9')}`,
      'chat:s1:1',
      `legacy:${sha('t')}`,
      `outside-files:${sha('b')}`,
      `outside-files:${sha('8')}`,
      `legacy:${sha('1')}`
    ])
    const restore = page.items[0]
    assert.equal(restore.restore, 'undo')
    assert.equal(restore.undo.allowed, false)
    const undone = page.items.at(-1)
    assert.equal(undone.undone, true)
    assert.equal(undone.undo.allowed, false)
    assert.equal(page.items[4].cause, 'deploy')
    // An undo pressed in the tab is a row of the list but not a chat turn: "N chat turns" leaves it
    // out (dev round 02/10: Joomla read "8 chat turns" for 6 turns and 2 undos).
    assert.deepEqual(page.counts, { all: 6, chat: 3, outside: 2 })
    assert.equal(page.coverage.gitTruncated, false)
    assert.equal(page.coverage.git, 'read')
  })

  test('a host that cannot answer still leaves the Postgres rows, and coverage says Git was not read', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { head_sha: sha('a'), files: 1 })
    const page = await read(pool, fakeHost([], { fail: 'FLEET_REFUSED' }))
    assert.deepEqual(ids(page), ['chat:s1:1'])
    assert.equal(page.coverage.git, 'failed')
    assert.equal(page.coverage.gitTruncated, null)
  })

  test('the host reports its cap: coverage carries gitTruncated', async () => {
    const { pool } = db
    await seed(pool)
    const page = await read(pool, fakeHost([commit('1', 1)], { answer: { truncated: true } }))
    assert.equal(page.coverage.gitTruncated, true)
  })

  test('a comment turn names its comment by (conversation, number), never by the prompt RPC id', async () => {
    const { pool } = db
    await seed(pool)
    const { rows } = await pool.query(`select id from account where email = $1`, [MAI])
    const request = (n, session, requestId, text) =>
      pool.query(
        `insert into site_request (site_key, n, account_id, session_id, request_id, url, text)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [SITE.site_key, n, rows[0].id, session, requestId, `http://scwp1002.tracy.test:8080/p${n}/`, text]
      )
    await request(7, 's1', 'browser-tab-id-7', 'make it bigger')
    await request(8, 's2', 'browser-tab-id-8', 'Fix the footer')
    await request(9, 's3', 'browser-tab-id-9', 'Fix the footer')
    // The number the host read off the turn's comment block: joined by (session, n).
    await turn(pool, 's1:1', {
      source: 'comment',
      rpc_id: 'dsh-rpc-1',
      comment_ns: [7],
      head_sha: sha('a'),
      files: 1,
      opened_at: iso(3)
    })
    // An older dsh sent no number: the request of the SAME conversation with the same words.
    await turn(pool, 's2:1', {
      source: 'comment',
      rpc_id: 'dsh-rpc-2',
      title: 'Fix the footer',
      head_sha: sha('b'),
      files: 1,
      opened_at: iso(2)
    })
    // A comment turn whose number names no request of its conversation links nowhere.
    await turn(pool, 's4:1', {
      source: 'comment',
      comment_ns: [9],
      head_sha: sha('c'),
      files: 1,
      opened_at: iso(1)
    })
    await pool.query(
      `insert into site_cms_log_cursor (site_key, source, enabled, last_pulled_at) values ($1, 'wordpress-tracy-log', true, now())`,
      [SITE.site_key]
    )
    const page = await read(pool, fakeHost())
    const by = Object.fromEntries(page.items.map((i) => [i.id, i]))
    assert.deepEqual(by['s1:1'].commentRef, { n: 7, url: 'http://scwp1002.tracy.test:8080/p7/' })
    assert.equal(by['s1:1'].source, 'comment')
    assert.deepEqual(by['s2:1'].commentRef, { n: 8, url: 'http://scwp1002.tracy.test:8080/p8/' })
    assert.equal(by['s4:1'].commentRef, null)
    assert.equal(page.coverage.since, iso(1))
    assert.equal(page.coverage.cmsLog.source, 'wordpress-tracy-log')
    assert.equal(page.coverage.cmsLog.enabled, true)
    assert.deepEqual(page.coverage.cmsLog.limits, [], 'WordPress records menus, settings and media')
    assert.equal(page.coverage.fileHistory, true)
  })

  test('an EmDash site says what it cannot show: no file history, and the admin log leaves out menus, settings and media', async () => {
    const { pool } = db
    await seed(pool)
    const emdash = { ...SITE, platform: 'emdash' }
    const page = await readActivity(pool, emdash, { runJob: fakeHost().runJob })
    // Dev round 02/10: the webroot repo of an EmDash site holds no file (its code is the `/app`
    // volume, its data and uploads sit on the private root), and EmDash 1.0.1's audit-log plugin
    // records page and post edits only.
    assert.equal(page.coverage.fileHistory, false)
    assert.equal(page.coverage.cmsLog.source, 'emdash-audit-log')
    assert.deepEqual(page.coverage.cmsLog.limits, ['menus', 'settings', 'media'])
  })

  test('a seat that may not write files sees no Undo: every row says forbidden, as /restore would answer', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { head_sha: sha('a'), files: 1 })
    const host = fakeHost([commit('1', 20, { title: 'old' })])
    const writer = await read(pool, host)
    assert.deepEqual(
      writer.items.map((i) => i.undo),
      [{ allowed: true }, { allowed: true }]
    )
    const editor = await read(pool, host, { canWriteFiles: false })
    assert.deepEqual(
      editor.items.map((i) => i.undo),
      [
        { allowed: false, reason: 'forbidden' },
        { allowed: false, reason: 'forbidden' }
      ]
    )
  })

  test('no raw record leaves: a target keeps names only, never values', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1')
    await write(pool, {
      turn_id: 's1:1',
      target: {
        kind: 'page',
        id: 4,
        fields: ['title', { secret: 1 }],
        values: { title: 'TOP SECRET' },
        detail: 'raw'
      }
    })
    const page = await read(pool, fakeHost())
    const body = JSON.stringify(page)
    assert.ok(!body.includes('TOP SECRET'))
    assert.ok(!body.includes('raw'))
    assert.deepEqual(page.items[0].writes[0].target, { kind: 'page', id: '4', fields: ['title'] })
  })

  test('the door: a live seat reads; anyone else gets the gate’s refusal; a bad cursor or filter is 400', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { head_sha: sha('a'), files: 1 })
    const app = new Hono()
    let allowed = true
    let writes = true
    mountActivity(app, {
      pool,
      requireGrant: async (c) =>
        allowed ? { email: MAI } : { error: c.json({ code: 'SEAT_NOT_AUTHORIZED' }, 403) },
      siteByKey: async (key) => (key === SITE.site_key ? SITE : null),
      runJob: fakeHost().runJob,
      mayWriteFiles: async (auth, siteKey) => {
        assert.equal(auth.email, MAI)
        assert.equal(siteKey, SITE.site_key)
        return writes
      }
    })
    const ok = await app.request(`/api/sites/${SITE.site_key}/activity?limit=5`)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'private, no-store')
    const okBody = await ok.json()
    assert.deepEqual(ids(okBody), ['chat:s1:1'])
    assert.deepEqual(okBody.items[0].undo, { allowed: true })
    writes = false
    const editor = await (await app.request(`/api/sites/${SITE.site_key}/activity?limit=5`)).json()
    assert.deepEqual(editor.items[0].undo, { allowed: false, reason: 'forbidden' })
    assert.equal((await app.request(`/api/sites/${SITE.site_key}/activity?cursor=nope`)).status, 400)
    assert.equal((await app.request(`/api/sites/${SITE.site_key}/activity?filter=agent`)).status, 400)
    assert.equal((await app.request(`/api/sites/${SITE.site_key}/activity?limit=500`)).status, 400)
    assert.equal((await app.request('/api/sites/unknown.tracy.test/activity')).status, 404)
    allowed = false
    assert.equal((await app.request(`/api/sites/${SITE.site_key}/activity`)).status, 403)
  })

  test('a host still building the site’s history for the first time answers 202', async () => {
    const { pool } = db
    await seed(pool)
    const app = new Hono()
    mountActivity(app, {
      pool,
      requireGrant: async () => ({ email: MAI }),
      siteByKey: async () => SITE,
      runJob: fakeHost([], { fail: 'timeout' }).runJob
    })
    const res = await app.request(`/api/sites/${SITE.site_key}/activity`)
    assert.equal(res.status, 202)
    assert.equal((await res.json()).code, 'FLEET_JOB_PENDING')
  })

  // Q4 (plan §12 "Q4 cache"): a CMS cache that rode into a moment before the exclude list named it.
  // Git is not rewritten; the host's reader leaves such files out of each moment's count and names
  // the moments that held nothing else (`hidden`). The rows Postgres recorded at the time follow it.
  test('Q4: a turn or a seal that held only CMS cache is not a row; a mixed turn counts its real files; housekeeping stays', async () => {
    const { pool } = db
    await seed(pool)
    // leemood on dev: a question whose moment held only T3's compiled CSS.
    await turn(pool, 's1:1', { opened_at: iso(10), head_sha: sha('a'), files: 1 })
    // The same, but the turn also wrote content: still a row, with no files.
    await turn(pool, 's2:1', { opened_at: iso(9), head_sha: sha('b'), files: 1 })
    await write(pool, { turn_id: 's2:1', at: iso(9.5) })
    // scjo1002 c0a061d4: one real edit and two T4 optimizer files (3 when the turn closed).
    await turn(pool, 's3:1', { opened_at: iso(8), head_sha: sha('c'), files: 3 })
    // A look after a page view sealed one T4 optimizer file as "outside Tracy" (dev, 02/10).
    await outside(pool, 'd', 7, { files: 1 })
    // Housekeeping is about Tracy's own bookkeeping and keeps its row (P1: its own note).
    await outside(pool, 'e', 6, { files: 5, cause: 'housekeeping' })
    // A Postgres row the host's window does not reach keeps what Postgres says.
    await turn(pool, 's4:1', { opened_at: iso(5), head_sha: sha('f'), files: 2 })
    const host = fakeHost([commit('c', 8, { turn: 's3:1', files: 1 })], {
      answer: {
        hidden: [
          { sha: sha('a'), turn: 's1:1' },
          { sha: sha('b'), turn: 's2:1' },
          { sha: sha('d'), turn: null },
          { sha: sha('e'), turn: null }
        ]
      }
    })
    const page = await read(pool, host)
    assert.deepEqual(ids(page), ['chat:s2:1', 'chat:s3:1', `outside-files:${sha('e')}`, 'chat:s4:1'])
    const [wrote, mixed, housekeeping, beyond] = page.items
    assert.equal(wrote.files, null, 'its moment was all cache: no files to open')
    assert.deepEqual(wrote.undo, { allowed: false, reason: 'no-files' })
    assert.deepEqual(mixed.files, { sha: sha('c'), count: 1 })
    assert.deepEqual(housekeeping.files, { sha: sha('e'), count: 5 })
    assert.deepEqual(beyond.files, { sha: sha('f'), count: 2 })
    assert.deepEqual(page.counts, { all: 4, chat: 3, outside: 1 })
  })
})
