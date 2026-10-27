// Site changes V2 through the door (`GET /api/sites/:key/activity?version=2`, plan
// `tasks/todo-site-changes-v2.md` §4, contract §3): the Source filter is applied before the page is
// cut, counts are the same classification over the same rows, the cursor carries version + filter,
// an undo is one event, and without `version=2` the answer is V1, unchanged.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { Hono } from 'hono'
import { mountActivity, readActivity } from '../src/sites/activity.js'
import { SOURCES } from '../src/sites/activity-source.js'
import {
  conversationOf,
  decodeCursorV2,
  encodeCursorV2,
  PEOPLE_SOURCES,
  readActivityV2,
  sourcesOfFilter,
  turnUndoneOf,
  V2_FILTERS
} from '../src/sites/activity-v2.js'
import { personFace } from '../src/lib/person-face.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
const skip = !process.env.TEST_DATABASE_URL

const SITE = { site_key: 'scwp1002.tracy.test', label: 'scwp1002', host: 'local', platform: 'wordpress' }
const MAI = 'mai.tran@example.test'
const SAM = 'sam.ortiz@example.test'
const T0 = Date.parse('2026-10-01T10:00:00Z')
const iso = (minutes) => new Date(T0 + minutes * 60_000).toISOString()
const sha = (c) => String(c).repeat(40).slice(0, 40)

function fakeHost(rows = [], extra = {}) {
  const runJob = async () => {
    if (extra.fail) return { ok: false, reason: extra.fail }
    return { ok: true, output: JSON.stringify({ ok: true, head: sha('f'), rows, ...extra.answer }) }
  }
  return { runJob }
}

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
/** A restore commit as a host that sends the raw subject and author would report it (D2). */
const restoreCommit = (c, minutes, target, over = {}) =>
  commit(c, minutes, {
    title: `restore: undo ${target.slice(0, 7)} (agent: x)`,
    subject: `restore: undo ${target.slice(0, 7)} (agent: x)`,
    author: 'fleet@tracy.ai',
    ...over
  })

async function seed(pool, site = SITE) {
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    site.site_key,
    site.label,
    site.host,
    site.platform
  ])
  await pool.query(
    `insert into account (email, display_name) values ($1, 'Mai Tran'), ($2, 'Sam Ortiz') on conflict do nothing`,
    [MAI, SAM]
  )
}

async function turn(pool, id, over = {}) {
  const row = {
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
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, opened_at, closed_at, state,
       head_sha, files, comment_ns, request_state)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      over.site_key ?? SITE.site_key,
      id.split(':')[0],
      Number(id.split(':')[1] ?? 1),
      row.actor,
      row.title,
      row.source,
      row.opened_at,
      row.closed_at,
      row.state,
      row.head_sha,
      row.files,
      row.comment_ns ?? null,
      row.request_state ?? null
    ]
  )
}

async function write(pool, over = {}) {
  await pool.query(
    `insert into site_write (site_key, at, turn_id, session_id, actor, action, outcome, target, via, origin, origin_ref)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      SITE.site_key,
      over.at ?? iso(0),
      over.turn_id ?? null,
      over.session_id ?? null,
      over.actor === undefined ? MAI : over.actor,
      over.action ?? 'content.update',
      over.outcome ?? 'ok',
      over.target ? JSON.stringify(over.target) : null,
      over.via ?? 'apply',
      over.origin ?? null,
      over.origin_ref ?? null
    ]
  )
}

async function outside(pool, c, minutes, over = {}) {
  await pool.query(
    `insert into site_outside (sha, site_key, at, files, cause, deploy_tag, paths, parent_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      sha(c),
      SITE.site_key,
      over.at ?? iso(minutes),
      over.files ?? over.paths?.length ?? 2,
      over.cause ?? 'seal',
      over.deploy_tag ?? null,
      over.paths ?? null,
      over.paths ? iso(minutes - 1) : null
    ]
  )
}

async function cms(pool, key, minutes, over = {}) {
  await pool.query(
    `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, resource_title, op,
       occurred_at, cursor_key, change_type, producer)
     values ($1, $2, $3, $4, $5, $6, 'update', $7, $8, $9, $10)`,
    [
      SITE.site_key,
      over.source ?? 'wordpress-tracy-log',
      over.actor === undefined ? JSON.stringify({ name: 'minh', id: '3' }) : over.actor,
      over.type ?? 'page',
      over.id ?? '42',
      over.title ?? 'About us',
      over.at ?? iso(minutes),
      key,
      over.change_type ?? 'wp_after_insert_post',
      over.producer ? JSON.stringify(over.producer) : null
    ]
  )
}

async function operation(pool, over = {}) {
  const { rows } = await pool.query(
    `insert into site_operation (site_key, action, target_sha, actor_email, status, resulting_sha, job_id, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id::text`,
    [
      SITE.site_key,
      over.action ?? 'undo',
      over.target_sha ?? null,
      over.actor_email ?? SAM,
      over.status ?? 'succeeded',
      over.resulting_sha ?? null,
      over.job_id ?? 'job-1',
      over.created_at ?? iso(0)
    ]
  )
  return rows[0].id
}

const v2 = (pool, host, opts = {}) => readActivityV2(pool, SITE, { runJob: host.runJob, ...opts })

/** The face `/api/team` gives the account behind `email` (`personFace` over the same row). */
async function faceOf(pool, email) {
  const { rows } = await pool.query(
    'select id, email, display_name, avatar_url from account where email = $1',
    [email]
  )
  return personFace(rows[0])
}
const keys = (page) => page.items.map((i) => `${i.kind}:${i.id}`)

/** Every page of one filter, following the cursor. */
async function walk(pool, host, { filter = 'all', limit }) {
  const seen = []
  let page = await v2(pool, host, { filter, limit })
  seen.push(...page.items)
  let guard = 0
  while (page.nextCursor && guard++ < 500) {
    page = await v2(pool, host, { filter, limit, cursor: page.nextCursor })
    seen.push(...page.items)
  }
  return { items: seen, last: page }
}

const atOf = (i) => Date.parse(i.occurredAt ?? i.detectedAt)

describe('the people filter (Site changes default view)', () => {
  test('people reads every Source but automatic; all reads every Source; one Source reads itself', () => {
    assert.deepEqual(
      PEOPLE_SOURCES,
      SOURCES.filter((s) => s !== 'automatic')
    )
    assert.ok(!PEOPLE_SOURCES.includes('automatic'))
    assert.deepEqual(sourcesOfFilter('people'), PEOPLE_SOURCES)
    assert.deepEqual(sourcesOfFilter('all'), SOURCES)
    assert.deepEqual(sourcesOfFilter('chat'), ['chat'])
    assert.ok(V2_FILTERS.includes('people'))
  })

  test('a cursor cut under people decodes as people', () => {
    const cursor = encodeCursorV2('people', { atUs: 5n, rank: 6, id: 'p1:1' })
    const decoded = decodeCursorV2(cursor)
    assert.equal(decoded.ok, true)
    assert.equal(decoded.ok && decoded.cursor.filter, 'people')
  })
})

describe('conversation (Open conversation)', () => {
  test('a turn id splits into session and turn; mine compares the typer with the reader, case-blind', () => {
    const row = { turn_id: 'session-8f2c:12', actor: 'Mai.Tran@example.test', prompt_message_id: 'msg-1' }
    assert.deepEqual(conversationOf(row, 'mai.tran@example.test'), {
      sessionId: 'session-8f2c',
      turn: 12,
      promptMessageId: 'msg-1',
      mine: true
    })
    assert.equal(conversationOf(row, 'sam.ortiz@example.test').mine, false)
    assert.equal(conversationOf(row, null).mine, false, 'no reader: not mine')
    assert.equal(conversationOf({ ...row, actor: null }, null).mine, false, 'no typer is nobody’s')
  })

  test('a legacy row has no prompt id: null, not a guess; a malformed id gives no conversation', () => {
    assert.equal(
      conversationOf({ turn_id: 's1:3', actor: MAI, prompt_message_id: null }, MAI).promptMessageId,
      null
    )
    assert.equal(conversationOf({ turn_id: 's1:3', actor: MAI }, MAI).promptMessageId, null)
    assert.equal(conversationOf({ turn_id: 'not-a-turn', actor: MAI }, MAI), null)
  })
})

describe('undone (the undo engine’s mark on a turn, migration 067)', () => {
  test('a stamped turn reads {at, complete}; only true is complete', () => {
    const at = new Date('2026-10-06T08:00:00Z')
    assert.deepEqual(turnUndoneOf({ undone_at: at, undo_complete: true }), {
      at: '2026-10-06T08:00:00.000Z',
      complete: true
    })
    assert.deepEqual(turnUndoneOf({ undone_at: at.toISOString(), undo_complete: false }), {
      at: '2026-10-06T08:00:00.000Z',
      complete: false
    })
    assert.equal(
      turnUndoneOf({ undone_at: at, undo_complete: null }).complete,
      false,
      'unknown is not complete'
    )
  })

  test('a turn never undone, or a row without the columns, reads null; never a guessed time', () => {
    assert.equal(turnUndoneOf({ undone_at: null, undo_complete: null }), null)
    assert.equal(turnUndoneOf({}), null)
    assert.equal(turnUndoneOf({ undone_at: 'not a date', undo_complete: true }), null)
  })
})

describe('site activity V2', { skip }, () => {
  before(db.open)
  beforeEach(db.reset)
  after(db.close)

  /**
   * A29: every Source the classifier can produce today has rows, Unknown spans five record kinds,
   * and the oldest rows (deployment, site-changes) are not on the first page of `all`.
   */
  async function seedEverySource(pool) {
    await seed(pool)
    const { rows: acct } = await pool.query(`select id from account where email = $1`, [MAI])
    // chat (newest)
    await turn(pool, 'p1:1', { opened_at: iso(100), head_sha: sha('a'), files: 2 })
    await turn(pool, 'p2:1', { opened_at: iso(99), head_sha: sha('b'), files: 1 })
    // comment, with its request
    await turn(pool, 'c1:1', {
      source: 'comment',
      comment_ns: [7],
      opened_at: iso(98),
      head_sha: sha('c'),
      files: 1
    })
    await pool.query(
      `insert into site_request (site_key, n, account_id, session_id, request_id, url, text)
       values ($1, 7, $2, 'c1', 'r7', 'http://scwp1002.tracy.test:8080/p7/', 'make it bigger')`,
      [SITE.site_key, acct[0].id]
    )
    // unknown ×5 kinds: a comment turn with no request, an outside seal, a CMS account row, writes
    // with no actor, a Git moment with no turn record
    await turn(pool, 'c2:1', {
      source: 'comment',
      comment_ns: [99],
      opened_at: iso(90),
      head_sha: sha('d'),
      files: 1
    })
    await outside(pool, 'e', 89)
    // cms-admin: a CMS row under a signed-in CMS account (Brian 02/10: identity suffices)
    await cms(pool, '5@x', 88)
    // a CMS row with no account (an EmDash delete) stays unknown
    await cms(pool, '7@x', 87.5, { source: 'emdash-audit-log', actor: null, type: 'pages' })
    await write(pool, { at: iso(87), actor: null })
    // automatic: WP-Cron (legacy, hook history) and housekeeping
    await cms(pool, '6@x', 50, { actor: null, change_type: 'upgrader_process_complete' })
    await outside(pool, '1', 49, { cause: 'housekeeping', files: 3 })
    // deployment and site-changes: the oldest rows
    await outside(pool, '2', 10, { cause: 'deploy', deploy_tag: 'app-77', files: 1 })
    const opId = await operation(pool, { target_sha: sha('9'), resulting_sha: sha('3'), created_at: iso(5) })
    const host = fakeHost([
      commit('8', 86, { title: 'old agent moment' }),
      commit('3', 5, {
        title: `restore: undo 9999999 (x)`,
        subject: 'restore: undo 9999999 (x)',
        author: 'fleet@tracy.ai'
      }),
      commit('9', 4, { title: 'moment the undo took back' })
    ])
    return { host, opId }
  }

  test('A29: counts per Source over the whole list; the first page of all may lack a Source the count has', async () => {
    const { pool } = db
    const { host } = await seedEverySource(pool)
    const first = await v2(pool, host, { limit: 4 })
    assert.equal(first.schemaVersion, 2)
    assert.deepEqual(Object.fromEntries(SOURCES.map((s) => [s, first.counts[s]])), {
      chat: 2,
      comment: 1,
      // A Design system press has its own tests below (walkthrough 11/10/2026); none is seeded here.
      'design-system': 0,
      // Tracy setup and API writes have their own tests below (sweep 11/10/2026); none is seeded here.
      setup: 0,
      api: 0,
      'cms-admin': 1, // an authenticated CMS identity (Brian 02/10)
      automatic: 2,
      deployment: 1,
      'site-changes': 1,
      unknown: 6
    })
    assert.equal(first.counts.all, 14)
    assert.ok(!first.items.some((i) => i.origin.source === 'deployment'), 'deployment is not on page one')
    assert.equal(first.counts.complete, true)
    assert.deepEqual(first.counts.reasons, [])
    // The undo commit is the operation, once; the moment it took back is a Git-only row.
    const { items } = await walk(pool, host, { limit: 4 })
    assert.equal(items.length, 14)
    assert.equal(items.filter((i) => i.origin.source === 'site-changes').length, 1)
    assert.ok(
      !items.some((i) => i.kind === 'git' && i.id === sha('3')),
      'the undo commit is not a second row'
    )
    // Unknown spans five record kinds.
    assert.deepEqual(
      [...new Set(items.filter((i) => i.origin.source === 'unknown').map((i) => i.kind))].sort(),
      ['cms-change', 'git', 'outside-files', 'turn', 'writes']
    )
  })

  test('A29: a Source filter is applied before the page is cut, and walks every page of that Source only', async () => {
    const { pool } = db
    const { host } = await seedEverySource(pool)
    for (const source of SOURCES) {
      const { items } = await walk(pool, host, { filter: source, limit: 2 })
      const first = await v2(pool, host, { filter: source, limit: 2 })
      assert.equal(items.length, first.counts[source], `${source}: every row of the count, over the pages`)
      assert.ok(
        items.every((i) => i.origin.source === source),
        `${source}: nothing of another Source`
      )
      assert.equal(
        new Set(items.map((i) => `${i.kind}:${i.id}`)).size,
        items.length,
        `${source}: no row twice`
      )
      for (let n = 1; n < items.length; n++)
        assert.ok(atOf(items[n - 1]) >= atOf(items[n]), `${source}: newest first`)
    }
    // A Source whose only row is the oldest still comes on the FIRST page of its filter.
    const deploy = await v2(pool, host, { filter: 'deployment', limit: 1 })
    assert.deepEqual(keys(deploy), [`outside-files:${sha('2')}`])
    assert.equal(deploy.nextCursor, null)
  })

  test('people: every row but automatic, over the pages, and the counts still name the hidden automatic rows', async () => {
    const { pool } = db
    const { host } = await seedEverySource(pool)
    const everything = await walk(pool, host, { filter: 'all', limit: 3 })
    const { items, last } = await walk(pool, host, { filter: 'people', limit: 2 })
    const first = await v2(pool, host, { filter: 'people', limit: 2 })
    assert.equal(items.length, first.counts.all - first.counts.automatic, 'every non-automatic row')
    assert.ok(first.counts.automatic > 0, 'the seed has automatic rows to hide')
    assert.ok(
      items.every((i) => i.origin.source !== 'automatic'),
      'no automatic row'
    )
    assert.equal(new Set(items.map((i) => `${i.kind}:${i.id}`)).size, items.length, 'no row twice')
    assert.deepEqual(
      items.map((i) => `${i.kind}:${i.id}`),
      everything.items.filter((i) => i.origin.source !== 'automatic').map((i) => `${i.kind}:${i.id}`),
      'the same order as the full list, less automatic'
    )
    assert.equal(last.nextCursor, null)
    // The counts do not depend on the filter: the tab reads `counts.automatic` for its hidden line.
    assert.deepEqual(first.counts, everything.last.counts)
  })

  test('A18: over 100 records at one timestamp page with no row repeated or lost, ids in byte order', async () => {
    const { pool } = db
    await seed(pool)
    const at = iso(30)
    // Mixed-case keys: a language collation would order `B` and `a` differently from JS.
    for (let n = 0; n < 60; n++) await cms(pool, `${n % 2 ? 'B' : 'a'}${n}`, 0, { at })
    for (let n = 0; n < 45; n++) await outside(pool, `${(n % 16).toString(16)}${n}`, 0, { at })
    for (let n = 0; n < 6; n++) await write(pool, { at, session_id: `s${n}`, actor: null })
    // `g…` shas: no outside row above can share one (a shared sha would be ONE accounted row).
    const gitRows = Array.from({ length: 8 }, (_, n) => commit(`g${n}`, 30))
    const host = fakeHost(gitRows)
    const { items } = await walk(pool, host, { limit: 7 })
    const ids = items.map((i) => `${i.kind}:${i.id}`)
    assert.equal(new Set(ids).size, ids.length, 'no row twice')
    assert.equal(ids.length, 60 + 45 + 6 + 8, 'no row lost')
    const filtered = await walk(pool, host, { filter: 'unknown', limit: 9 })
    assert.equal(filtered.items.length, 45 + 6 + 8)
    const admin = await walk(pool, host, { filter: 'cms-admin', limit: 9 })
    assert.equal(admin.items.length, 60, 'every CMS row under an account, over the pages')
  })

  test('Git truncated: counts.complete is false with its reason; EmDash adds no-file-history', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { head_sha: sha('a'), files: 1 })
    const page = await v2(pool, fakeHost([commit('1', 1)], { answer: { truncated: true } }))
    assert.equal(page.counts.complete, false)
    assert.deepEqual(page.counts.reasons, ['git-truncated'])
    const failed = await v2(pool, fakeHost([], { fail: 'FLEET_REFUSED' }))
    assert.deepEqual(failed.counts.reasons, ['git-unread'])
    const emdash = { ...SITE, site_key: 'scem1002.tracy.test', label: 'scem1002', platform: 'emdash' }
    await seed(pool, emdash)
    const em = await readActivityV2(pool, emdash, { runJob: fakeHost().runJob })
    assert.deepEqual(em.counts.reasons, ['no-file-history', 'cms-log-limits'])
  })

  test('every person on the page carries the face /api/team gives their account; anyone else has none', async () => {
    const { pool } = db
    await seed(pool)
    await pool.query(
      `update account set avatar_url = 'https://lh3.googleusercontent.com/a/sam=s96-c' where email = $1`,
      [SAM]
    )
    // Mai's turn, its last moment undone by Sam; two Git moments with no turn on record, one by a
    // seat's address (any case), one by an address no account holds.
    await turn(pool, 's1:1', { opened_at: iso(10), head_sha: sha('b'), files: 1 })
    await operation(pool, { target_sha: sha('b'), resulting_sha: sha('c'), created_at: iso(20) })
    const host = fakeHost([
      commit('e', 40, { by: { kind: 'person', name: 'Sam', email: SAM.toUpperCase() } }),
      commit('d', 30, { by: { kind: 'person', name: 'Ola', email: 'ola@outside.test' } }),
      restoreCommit('c', 20, sha('b')),
      commit('b', 11, { turn: 's1:1' })
    ])
    const page = await v2(pool, host)
    const byId = Object.fromEntries(page.items.map((i) => [i.id, i]))
    const mai = await faceOf(pool, MAI)
    const sam = await faceOf(pool, SAM)
    assert.match(
      sam.avatarUrl,
      /^\/auth\/avatar\/[0-9a-f-]{36}\?v=[0-9a-f]{8}$/,
      'Tracy’s own address for the picture'
    )
    assert.deepEqual(byId['s1:1'].actor.face, mai, 'the requester of a turn')
    assert.deepEqual(byId['s1:1'].reversal.undoneBy.face, sam, 'who undid it')
    const op = page.items.find((i) => i.kind === 'operation')
    assert.deepEqual(op.actor.face, sam, 'who pressed the undo')
    assert.deepEqual(byId[sha('e')].executor, { type: 'person', name: 'Sam', role: 'executor', face: sam })
    assert.equal(byId[sha('d')].executor.face, null, 'a Git identity no account holds: no face')
    assert.equal('face' in byId[sha('d')].actor, false, 'an Unknown actor is not a person: no face field')
  })

  test('an undo is ONE event: the operation, by the person who pressed it; the moment it undid says so', async () => {
    const { pool } = db
    await seed(pool)
    // A turn with two moments and a content write: undoing its LAST moment undoes only that moment.
    await turn(pool, 's1:1', { opened_at: iso(10), head_sha: sha('b'), files: 3 })
    await write(pool, { turn_id: 's1:1', at: iso(10.5), target: { kind: 'page', id: '12' } })
    const opId = await operation(pool, { target_sha: sha('b'), resulting_sha: sha('c'), created_at: iso(20) })
    // Not events: still pending, a no-op, a failure.
    await operation(pool, { status: 'pending', target_sha: sha('a'), created_at: iso(21) })
    await operation(pool, { status: 'succeeded_noop', target_sha: sha('a'), created_at: iso(22) })
    await operation(pool, { status: 'failed', target_sha: sha('a'), created_at: iso(23) })
    const host = fakeHost([
      restoreCommit('c', 20, sha('b'), { files: 2 }),
      commit('b', 11, { turn: 's1:1', files: 2 }),
      commit('a', 10.7, { turn: 's1:1', files: 1 })
    ])
    const page = await v2(pool, host)
    assert.deepEqual(keys(page), [`operation:${opId}`, 'turn:s1:1'])
    const [op, t] = page.items
    assert.equal(op.origin.source, 'site-changes')
    assert.deepEqual(op.actor, {
      type: 'person',
      id: `tracy:${SAM}`,
      name: 'Sam Ortiz',
      role: 'requester',
      face: await faceOf(pool, SAM)
    })
    assert.deepEqual(op.description, {
      key: 'site-changes.undo',
      params: { target: sha('b').slice(0, 7), files: 2 },
      isRequestOnly: false
    })
    assert.deepEqual(op.evidence, {
      operationId: opId,
      commitSha: sha('c'),
      targetSha: sha('b'),
      jobRef: 'job-1'
    })
    assert.equal(t.reversal.state, 'partially-undone')
    assert.deepEqual(t.reversal.partsNotReversed, ['content', 'other-moments'])
    assert.deepEqual(t.reversal.link, { kind: 'operation', id: opId })
    assert.equal(t.reversal.undoneBy.name, 'Sam Ortiz')
    assert.equal(t.capabilities.canUndoFiles, false)
    assert.ok(t.capabilities.reasons.includes('undone'))
    assert.equal(page.counts['site-changes'], 1)
    assert.equal(page.counts.all, 2)
  })

  test('before the reconciler: the restore commit is a legacy Site changes row, By Unknown; pending shows nothing', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { opened_at: iso(10), head_sha: sha('b'), files: 1 })
    await operation(pool, { status: 'unknown', target_sha: sha('b'), created_at: iso(19) })
    const host = fakeHost([restoreCommit('c', 20, sha('b')), commit('b', 11, { turn: 's1:1' })])
    const page = await v2(pool, host)
    assert.deepEqual(keys(page), [`git:${sha('c')}`, 'turn:s1:1'])
    const [restore, t] = page.items
    assert.equal(restore.origin.source, 'site-changes')
    assert.deepEqual(restore.actor, { type: 'unknown', role: 'requester' }, 'git never names who pressed')
    assert.equal(t.reversal.state, 'undone', 'a file-only turn, its only moment undone')
    assert.deepEqual(t.reversal.link, { kind: 'git', id: sha('c') })
  })

  test('a turn the undo engine stamped says undone {at, complete} and offers no second undo', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { opened_at: iso(10), head_sha: sha('b'), files: 1 })
    await turn(pool, 's1:2', { opened_at: iso(12), closed_at: iso(13) })
    await pool.query(
      `update site_turn set undone_at = $2, undo_complete = false where site_key = $1 and turn_id = 's1:1'`,
      [SITE.site_key, iso(30)]
    )
    const host = fakeHost([commit('b', 11, { turn: 's1:1' })])
    const page = await v2(pool, host)
    const t = page.items.find((i) => i.id === 's1:1')
    assert.deepEqual(t.undone, { at: new Date(iso(30)).toISOString(), complete: false })
    assert.equal(t.capabilities.canUndoFiles, false, 'no Undo file changes beside an engine undo')
    assert.ok(t.capabilities.reasons.includes('undone'))
    for (const other of page.items.filter((i) => i.id !== 's1:1')) assert.equal(other.undone, null)
  })

  test('D2: a chat title that reads like an undo marks nothing undone and is no Site changes event', async () => {
    const { pool } = db
    await seed(pool)
    const host = fakeHost([
      commit('c', 20, {
        title: `restore: undo ${sha('b').slice(0, 7)} (x)`,
        subject: `agent: restore: undo ${sha('b').slice(0, 7)} (x)`,
        author: 'agent@tracy.ai'
      }),
      commit('b', 11)
    ])
    const page = await v2(pool, host)
    assert.deepEqual(
      page.items.map((i) => [i.origin.source, i.reversal.state]),
      [
        ['unknown', 'none'],
        ['unknown', 'none']
      ]
    )
  })

  test('a turn row: Source, By, request state, comment author, effects and technical writes', async () => {
    const { pool } = db
    await seed(pool)
    const { rows: acct } = await pool.query(`select id, email from account order by email`)
    const mai = acct.find((a) => a.email === MAI).id
    const sam = acct.find((a) => a.email === SAM).id
    // Sam wrote the comment, Mai sent it to Tracy.
    const { rows: comment } = await pool.query(
      `insert into site_comment (site_key, n, author_account_id, url, text) values ($1, 7, $2, 'http://x/p7/', 'bigger')
       returning id`,
      [SITE.site_key, sam]
    )
    await pool.query(
      `insert into site_request (site_key, n, account_id, session_id, request_id, url, text, comment_id)
       values ($1, 7, $2, 'c1', 'r7', 'http://x/p7/', 'bigger', $3)`,
      [SITE.site_key, mai, comment[0].id]
    )
    await turn(pool, 'c1:1', {
      source: 'comment',
      comment_ns: [7],
      title: 'bigger',
      head_sha: sha('a'),
      files: 1,
      request_state: 'full'
    })
    await write(pool, { turn_id: 'c1:1', at: iso(0.5), target: { kind: 'article', id: '551' } })
    await write(pool, { turn_id: 'c1:1', at: iso(0.6), via: 'file-look', action: 'edit' })
    await turn(pool, 'p1:1', { opened_at: iso(-5), title: 'x'.repeat(200), head_sha: sha('b'), files: 1 })
    const page = await v2(pool, fakeHost([commit('a', 0.7, { turn: 'c1:1', files: 1 })]))
    const c = page.items.find((i) => i.id === 'c1:1')
    assert.equal(c.origin.source, 'comment')
    assert.deepEqual(c.actor, {
      type: 'person',
      id: `tracy:${MAI}`,
      name: 'Mai Tran',
      role: 'requester',
      face: await faceOf(pool, MAI)
    })
    assert.deepEqual(c.executor, { type: 'system', id: 'service:tracy', name: 'Tracy', role: 'executor' })
    assert.deepEqual(c.comment, {
      n: 7,
      url: 'http://x/p7/',
      id: comment[0].id,
      deleted: false,
      author: { type: 'person', id: `tracy:${SAM}`, name: 'Sam Ortiz', face: await faceOf(pool, SAM) }
    })
    assert.deepEqual(c.request, { text: 'bigger', state: 'full' })
    assert.equal(c.description.key, 'effects.summary')
    assert.deepEqual(c.effects.content.resources, [
      { type: 'article', id: '551', title: null, ops: ['update'] }
    ])
    assert.equal(c.effects.files.count, 1)
    assert.deepEqual(c.technical, [{ action: 'edit', via: 'file-look', outcome: 'ok' }])
    assert.equal(c.timeBasis, 'occurred')
    assert.equal(c.capabilities.canUndoFiles, true)
    const legacy = page.items.find((i) => i.id === 'p1:1')
    assert.deepEqual(legacy.request, { text: 'x'.repeat(200), state: 'unknown' })
    assert.deepEqual(legacy.description, { key: 'files.changed', params: { files: 1 }, isRequestOnly: false })
  })

  test('an outside seal reads Detected; a deploy reads Tracy deploy; a CMS row keeps the CMS account and log name', async () => {
    const { pool } = db
    await seed(pool)
    await outside(pool, 'a', 3)
    await outside(pool, 'b', 2, { cause: 'deploy', deploy_tag: 'app-1', files: 1 })
    await cms(pool, '1@x', 1)
    await cms(pool, '2@x', 0, { actor: null, producer: { schema: '2', version: '0.3.0', context: 'cron' } })
    const page = await v2(pool, fakeHost())
    const [seal, deploy, person, cron] = page.items
    assert.equal(seal.timeBasis, 'detected')
    assert.equal(seal.occurredAt, null)
    assert.equal(seal.detectedAt, iso(3))
    assert.equal(seal.description.key, 'files.changed-source-unknown')
    assert.deepEqual(deploy.actor, {
      type: 'system',
      id: 'service:tracy-deploy',
      name: 'Tracy deploy',
      role: 'executor'
    })
    // Git was not read here, so the file it updated is not known: no component is named.
    assert.deepEqual(deploy.description, {
      key: 'deploy.files',
      params: { files: 1, tag: 'app-1' },
      isRequestOnly: false
    })
    assert.equal(person.origin.source, 'cms-admin')
    assert.equal(person.origin.log, 'wordpress-tracy-log')
    assert.equal(person.origin.cms, 'wordpress')
    assert.deepEqual(person.actor, {
      type: 'person',
      id: 'wordpress:3',
      name: 'minh',
      role: 'executor',
      face: null
    })
    assert.deepEqual(person.description.params, { op: 'update', type: 'page', id: '42', title: 'About us' })
    assert.equal(person.effects.files.state, 'not-linked')
    assert.equal(cron.origin.source, 'automatic')
    assert.equal(cron.actor.name, 'WordPress')
    assert.equal(JSON.stringify(page).includes('cursor_key'), false, 'no raw row leaves')
  })

  test('a seat that may not write files is told why, row by row', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { head_sha: sha('a'), files: 1 })
    const page = await v2(pool, fakeHost(), { canWriteFiles: false })
    assert.deepEqual(page.items[0].capabilities, {
      canDiff: true,
      canUndoFiles: false,
      reasons: ['forbidden']
    })
  })

  test('the door: version=2 opts in; filter and cursor are checked; V1 answers byte for byte without it', async () => {
    const { pool } = db
    const { host } = await seedEverySource(pool)
    const app = new Hono()
    mountActivity(app, {
      pool,
      requireGrant: async () => ({ email: MAI }),
      siteByKey: async (key) => (key === SITE.site_key ? SITE : null),
      runJob: host.runJob
    })
    const url = (q) => `/api/sites/${SITE.site_key}/activity?${q}`
    const get = async (q) => {
      const res = await app.request(url(q))
      return { status: res.status, text: await res.text() }
    }

    // V1: no version, or any version but 2, is V1 — the same bytes the V1 reader makes.
    const v1 = await get('limit=5')
    assert.equal(v1.status, 200)
    const direct = await readActivity(pool, SITE, { runJob: host.runJob, limit: 5 })
    assert.equal(v1.text, JSON.stringify(direct))
    assert.ok(!('schemaVersion' in JSON.parse(v1.text)))
    assert.deepEqual(Object.keys(JSON.parse(v1.text)), ['items', 'nextCursor', 'counts', 'coverage'])
    assert.equal((await get('limit=5&version=1')).text, v1.text)
    assert.equal((await get('limit=5&version=3')).text, v1.text)
    assert.equal((await get('filter=outside&version=1')).status, 200, 'V1 filters stay V1')

    // V2
    const page = await get('version=2&filter=all&limit=3')
    assert.equal(page.status, 200)
    const body = JSON.parse(page.text)
    assert.equal(body.schemaVersion, 2)
    assert.ok(body.nextCursor)
    const next = await get(`version=2&filter=all&limit=3&cursor=${body.nextCursor}`)
    assert.equal(next.status, 200)

    const bad = async (q, code, reason) => {
      const res = await get(q)
      assert.equal(res.status, 400, q)
      const answer = JSON.parse(res.text)
      assert.equal(answer.code, code, q)
      if (reason) assert.equal(answer.reason, reason, q)
    }
    await bad('version=2&filter=outside', 'INVALID_FILTER')
    await bad('version=2&filter=agent', 'INVALID_FILTER')
    await bad(`version=2&filter=chat&cursor=${body.nextCursor}`, 'INVALID_CURSOR', 'filter-mismatch')
    await bad(`version=2&filter=people&cursor=${body.nextCursor}`, 'INVALID_CURSOR', 'filter-mismatch')
    assert.equal((await get('version=2&filter=people&limit=3')).status, 200, 'people is a V2 filter')
    assert.equal((await get('filter=people')).status, 400, 'people is not a V1 filter')
    const v1Cursor = JSON.parse(v1.text).nextCursor
    assert.ok(v1Cursor)
    await bad(`version=2&cursor=${v1Cursor}`, 'INVALID_CURSOR', 'version-mismatch')
    await bad('version=2&cursor=nope', 'INVALID_CURSOR', 'malformed')
    await bad('version=2&limit=0', 'INVALID_LIMIT')
    // A V2 cursor sent to V1 is refused too.
    await bad(`cursor=${body.nextCursor}`, 'INVALID_CURSOR')
  })

  test('conversation: on turn events only; mine for the typer, through the door; V1 has no such field', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 'session-a1:2', { opened_at: iso(2), head_sha: sha('a'), files: 1 })
    await pool.query(`update site_turn set prompt_message_id = 'msg-9' where turn_id = 'session-a1:2'`)
    await turn(pool, 'session-b2:1', { actor: SAM, opened_at: iso(1), head_sha: sha('b'), files: 1 })
    await outside(pool, 'c', 0)
    let reader = MAI
    const app = new Hono()
    mountActivity(app, {
      pool,
      requireGrant: async () => ({ email: reader }),
      siteByKey: async () => SITE,
      runJob: fakeHost().runJob
    })
    const read = async (q) => (await app.request(`/api/sites/${SITE.site_key}/activity?${q}`)).json()
    const page = await read('version=2')
    assert.deepEqual(
      page.items.map((i) => [i.id, i.conversation]),
      [
        ['session-a1:2', { sessionId: 'session-a1', turn: 2, promptMessageId: 'msg-9', mine: true }],
        ['session-b2:1', { sessionId: 'session-b2', turn: 1, promptMessageId: null, mine: false }],
        [sha('c'), null]
      ]
    )
    reader = SAM
    const other = await read('version=2')
    assert.deepEqual(
      other.items.map((i) => i.conversation?.mine ?? null),
      [false, true, null]
    )
    const v1 = await read('')
    assert.ok(
      v1.items.every((i) => !('conversation' in i)),
      'V1 unchanged'
    )
    assert.equal(
      JSON.stringify(v1),
      JSON.stringify(await readActivity(pool, SITE, { runJob: fakeHost().runJob })),
      'V1 bytes are the V1 reader’s'
    )
  })

  // BUG-DEV-1 (dev round 02/10): a housekeeping commit was missing until a turn recorded it in
  // site_outside, then appeared with its old time and every count +1. Git's reader now lists it,
  // so the row and the counts are the same before and after the turn records it.
  test('BUG-DEV-1: a housekeeping commit is listed before a turn records it, and nothing moves after', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { opened_at: iso(1), head_sha: sha('a'), files: 1 })
    const title = 'housekeeping, internal files taken out of the history'
    const host = fakeHost([
      commit('h', 5, {
        by: { kind: 'outside' },
        kind: 'outside',
        title,
        author: 'outside@tracy.test',
        subject: `outside Tracy: ${title}`,
        files: 3
      }),
      commit('a', 1, { turn: 's1:1' })
    ])
    const view = (page) => {
      const row = page.items.find((i) => i.id === sha('h'))
      return {
        counts: page.counts,
        row: row && {
          source: row.origin.source,
          occurredAt: row.occurredAt,
          description: row.description,
          files: row.effects.files.count
        }
      }
    }
    const before = view(await v2(pool, host))
    assert.deepEqual(before.row, {
      source: 'automatic',
      occurredAt: iso(5),
      description: { key: 'housekeeping', params: { files: 3 }, isRequestOnly: false },
      files: 3
    })
    assert.equal(before.counts.automatic, 1)
    const v1Before = (await readActivity(pool, SITE, { runJob: host.runJob })).counts

    // The next turn's seal-outside records the commit in site_outside (`recordOutside`).
    await outside(pool, 'h', 5, { cause: 'housekeeping', files: 3 })
    const after = view(await v2(pool, host))
    assert.deepEqual(after, before, 'same row, same time, same counts')
    assert.deepEqual(
      (await readActivity(pool, SITE, { runJob: host.runJob })).counts,
      v1Before,
      'V1 counts too'
    )
  })

  // Dev round 02/10: an outside@ commit only Git knows is the `site_outside` row a later turn
  // records. Its `kind:id` and its place in the order must not move when that happens — not even
  // between two pages of one walk.
  test('an outside commit keeps kind:id and its place when a turn records it mid-walk: nothing repeated or lost', async () => {
    const { pool } = db
    await seed(pool)
    const outsideCommit = (c, minutes, title) =>
      commit(c, minutes, {
        by: { kind: 'outside' },
        kind: 'outside',
        title,
        author: 'outside@tracy.test',
        subject: `outside Tracy: ${title}`
      })
    for (let n = 0; n < 6; n++)
      await turn(pool, `t${n}:1`, { opened_at: iso(10 * n), head_sha: sha(String(n)), files: 1 })
    const host = fakeHost([
      outsideCommit('h', 35, 'housekeeping, internal files taken out of the history'),
      outsideCommit('d', 25, 'deploy app-9 updated tracy-access.php'),
      outsideCommit('e', 15, 'changes made to the site outside Tracy'),
      ...Array.from({ length: 6 }, (_, n) => commit(String(n), 10 * n, { turn: `t${n}:1` })).reverse()
    ])
    const all = await v2(pool, host, { limit: 100 })
    const before = new Map(all.items.map((i) => [`${i.kind}:${i.id}`, i]))
    // V1 already reads a Git-only outside commit as `outside-files` with that kind's rank.
    const v1Keys = async () =>
      (await readActivity(pool, SITE, { runJob: host.runJob, limit: 100 })).items.map(
        (i) => `${i.kind}:${i.id}`
      )
    const v1Before = await v1Keys()
    for (const c of ['h', 'd', 'e'])
      assert.ok(before.has(`outside-files:${sha(c)}`), `${c} reads as outside-files`)

    const seen = []
    let page = await v2(pool, host, { limit: 3 })
    seen.push(...keys(page))
    // A turn opens: its seal-outside records the three commits in site_outside, with their own times.
    await outside(pool, 'h', 35, { cause: 'housekeeping', files: 1 })
    await outside(pool, 'd', 25, { cause: 'deploy', deploy_tag: 'app-9', files: 1 })
    await outside(pool, 'e', 15, { cause: 'seal', files: 1 })
    while (page.nextCursor) {
      page = await v2(pool, host, { limit: 3, cursor: page.nextCursor })
      seen.push(...keys(page))
    }
    assert.equal(new Set(seen).size, seen.length, 'no row twice')
    assert.deepEqual([...seen].sort(), [...before.keys()].sort(), 'no row lost, every kind:id as before')
    const after = await v2(pool, host, { limit: 100 })
    assert.deepEqual(keys(after), keys(all), 'same keys, same order')
    assert.deepEqual(after.counts, all.counts)
    assert.deepEqual(await v1Keys(), v1Before, 'V1 keys and order unchanged too (it never moved)')
    for (const c of ['h', 'd', 'e']) {
      const a = after.items.find((i) => i.id === sha(c))
      const b = before.get(`outside-files:${sha(c)}`)
      assert.deepEqual(
        [a.origin.source, a.description.key, a.occurredAt, a.detectedAt, a.timeBasis],
        [b.origin.source, b.description.key, b.occurredAt, b.detectedAt, b.timeBasis],
        c
      )
    }
  })

  // Brian 02/10, "Tracy update": a deploy names the Tracy component it updated, read off the commit;
  // a CMS row about Tracy's own plugin carries owner: 'tracy'. Source, By and counts do not change.
  // Walkthrough 22/10/2026 (tracywalk-1792671498): a brand-new Joomla site showed "Files changed;
  // source unknown · 122 files" at the top of Site changes. The files were Tracy's own Cowork package:
  // its updater (plg_system_claudecoworkupdate) took 0.24.43 → 0.24.53 on the first request, 35 s
  // after the baseline, and nothing but the next seal ever saw it. Measured on dev 26/10: 30 such
  // rows across Joomla sites, every one of them Tracy updating its own package.
  const COWORK_JOOMLA = [
    'administrator/components/com_claudecowork/claudecowork.xml',
    'administrator/components/com_claudecowork/lib/Engine.php',
    'administrator/language/en-GB/com_claudecowork.ini',
    'administrator/manifests/packages/pkg_claudecowork.xml',
    'components/com_claudecowork/controllers/api.php',
    'media/plg_system_claudecoworkapi/js/door.js',
    'plugins/system/claudecoworkapi/claudecoworkapi.php',
    'plugins/system/claudecoworkupdate/src/Extension/ClaudeCoworkUpdate.php'
  ]
  const COWORK_WORDPRESS = [
    'wp-content/plugins/claude-cowork/claude-cowork.php',
    'wp-content/plugins/claude-cowork/lib/Engine.php'
  ]

  test('a seal that is only Tracy’s own Cowork package updating itself reads as a Tracy update, never Unknown', async () => {
    const { pool } = db
    await seed(pool)
    await outside(pool, 'a', 5, { paths: COWORK_JOOMLA })
    await outside(pool, 'b', 4, { paths: COWORK_WORDPRESS })
    const page = await v2(pool, fakeHost())
    for (const c of ['a', 'b']) {
      const row = page.items.find((i) => i.id === sha(c))
      assert.ok(row, c)
      assert.equal(row.kind, 'outside-files')
      assert.equal(row.origin.source, 'deployment', c)
      assert.equal(row.actor.id, 'service:tracy-deploy', c)
      assert.deepEqual(
        row.description,
        {
          key: 'deploy.updated',
          params: { component: 'cowork', files: c === 'a' ? 8 : 2, tag: null, owner: 'tracy' },
          isRequestOnly: false
        },
        c
      )
      // Sealed, not committed as it was written: still the moment Tracy noticed it.
      assert.equal(row.timeBasis, 'detected', c)
    }
    assert.equal(page.counts.unknown ?? 0, 0)
    assert.equal(page.counts.deployment, 2)
  })

  test('a seal is a Tracy update only when EVERY file is the Cowork package and its manifest moved', async () => {
    const { pool } = db
    await seed(pool)
    // One file of somebody else's beside the package: the seal cannot be split, so it stays Unknown.
    await outside(pool, 'a', 5, { paths: [...COWORK_JOOMLA, 'templates/cassiopeia/index.php'] })
    // The package's code edited by hand, no manifest touched: not an install, so not Tracy's.
    await outside(pool, 'b', 4, { paths: ['administrator/components/com_claudecowork/lib/Engine.php'] })
    await outside(pool, 'c', 3, { paths: ['wp-content/plugins/claude-cowork/lib/Engine.php'] })
    // A look-alike folder is not the package.
    await outside(pool, 'd', 2, {
      paths: [
        'wp-content/plugins/claude-cowork-pro/claude-cowork.php',
        'wp-content/plugins/claude-cowork-pro/a.php'
      ]
    })
    // A seal recorded before paths were kept: nothing to read, nothing claimed.
    await outside(pool, 'e', 1)
    const page = await v2(pool, fakeHost())
    for (const c of ['a', 'b', 'c', 'd', 'e']) {
      const row = page.items.find((i) => i.id === sha(c))
      assert.equal(row.origin.source, 'unknown', c)
      assert.equal(row.description.key, 'files.changed-source-unknown', c)
    }
    assert.equal(page.counts.unknown, 5)
  })

  test('Tracy update: a deploy of tracy-access.php names the connector; Tracy’s plugin row carries owner; V1 unchanged', async () => {
    const { pool } = db
    await seed(pool)
    const deployRow = (c, minutes, file) =>
      commit(c, minutes, {
        by: { kind: 'outside' },
        kind: 'outside',
        title: `deploy app-9 updated ${file}`,
        author: 'outside@tracy.test',
        subject: `outside Tracy: deploy app-9 updated ${file}`
      })
    // One deploy Postgres already holds (its file read from Git's window), one only Git knows.
    await outside(pool, 'b', 5, { cause: 'deploy', deploy_tag: 'app-9', files: 1 })
    const host = fakeHost([
      deployRow('c', 6, 'tracy-access.php'),
      deployRow('b', 5, 'tracy-access.php'),
      deployRow('d', 4, 'other.php')
    ])
    await cms(pool, '1@x', 3, {
      type: 'plugin',
      id: 'claude-cowork/claude-cowork.php',
      title: 'Tracy Claude Cowork',
      change_type: 'upgrader_process_complete'
    })
    await cms(pool, '2@x', 2, {
      type: 'plugin',
      id: 'hello.php',
      title: 'Hello Dolly',
      change_type: 'activated_plugin'
    })
    const before = await v2(pool, host)
    const by = Object.fromEntries(before.items.map((i) => [i.id, i]))
    const connector = {
      key: 'deploy.updated',
      params: { component: 'connector', files: 1, tag: 'app-9', owner: 'tracy' },
      isRequestOnly: false
    }
    assert.deepEqual(by[sha('c')].description, connector, 'Git-only deploy')
    assert.deepEqual(by[sha('b')].description, connector, 'a deploy Postgres holds, its file from Git')
    assert.deepEqual(by[sha('d')].description, {
      key: 'deploy.files',
      params: { files: 1, tag: 'app-9' },
      isRequestOnly: false
    })
    assert.equal(by['wordpress-tracy-log:1@x'].description.params.owner, 'tracy')
    assert.equal(by['wordpress-tracy-log:2@x'].description.params.owner, undefined)
    assert.equal(by['wordpress-tracy-log:1@x'].origin.source, 'cms-admin', 'the Source does not change')
    assert.equal(before.counts.deployment, 3)
    const v1 = await readActivity(pool, SITE, { runJob: host.runJob })
    assert.ok(
      !JSON.stringify(v1).includes('deploy.updated') && !JSON.stringify(v1).includes('owner'),
      'V1 unchanged'
    )
  })

  test('reply: a turn carries the answer its close kept, null when none was kept; other kinds null; V1 unchanged', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 'session-a1:2', { opened_at: iso(3), head_sha: sha('a'), files: 1 })
    await pool.query(
      `update site_turn set reply = 'Done — renamed <b>About</b>.', reply_state = 'truncated' where turn_id = 'session-a1:2'`
    )
    await turn(pool, 'session-a1:1', { opened_at: iso(2), head_sha: sha('b'), files: 1 })
    await outside(pool, 'c', 1)
    const page = await v2(pool, fakeHost())
    assert.deepEqual(
      page.items.map((i) => [i.id, i.reply]),
      [
        ['session-a1:2', { text: 'Done — renamed <b>About</b>.', state: 'truncated' }],
        ['session-a1:1', null],
        [sha('c'), null]
      ]
    )
    const v1 = await readActivity(pool, SITE, { runJob: fakeHost().runJob })
    assert.ok(v1.items.every((i) => !('reply' in i)))
    assert.ok(!JSON.stringify(v1).includes('renamed'), 'V1 does not carry the answer')
  })

  test('comment: the comment’s id, null when the request names none; a deleted one keeps url and author', async () => {
    const { pool } = db
    await seed(pool)
    const { rows: acct } = await pool.query(`select id, email from account order by email`)
    const mai = acct.find((a) => a.email === MAI).id
    const sam = acct.find((a) => a.email === SAM).id
    const { rows: made } = await pool.query(
      `insert into site_comment (site_key, n, author_account_id, url, text, deleted_at)
       values ($1, 5, $2, 'http://x/p5/', 'gone', now()) returning id`,
      [SITE.site_key, sam]
    )
    const request = (n, session, commentId) =>
      pool.query(
        `insert into site_request (site_key, n, account_id, session_id, request_id, url, text, comment_id)
         values ($1, $2, $3, $4, $5, $6, 'words', $7)`,
        [SITE.site_key, n, mai, session, `r${n}`, `http://x/p${n}/`, commentId]
      )
    await request(5, 'd1', made[0].id)
    await request(6, 'n1', null)
    await turn(pool, 'd1:1', {
      source: 'comment',
      comment_ns: [5],
      opened_at: iso(2),
      head_sha: sha('a'),
      files: 1
    })
    await turn(pool, 'n1:1', {
      source: 'comment',
      comment_ns: [6],
      opened_at: iso(1),
      head_sha: sha('b'),
      files: 1
    })
    const page = await v2(pool, fakeHost())
    const by = Object.fromEntries(page.items.map((i) => [i.id, i.comment]))
    assert.deepEqual(by['d1:1'], {
      n: 5,
      url: 'http://x/p5/',
      id: made[0].id,
      deleted: true,
      author: { type: 'person', id: `tracy:${SAM}`, name: 'Sam Ortiz', face: await faceOf(pool, SAM) }
    })
    assert.deepEqual(by['n1:1'], { n: 6, url: 'http://x/p6/', id: null, deleted: false })
    const v1 = await readActivity(pool, SITE, { runJob: fakeHost().runJob })
    const v1Refs = v1.items.map((i) => i.commentRef)
    assert.deepEqual(
      v1Refs,
      [
        { n: 5, url: 'http://x/p5/' },
        { n: 6, url: 'http://x/p6/' }
      ],
      'V1 commentRef unchanged: no id, no deleted'
    )
  })

  test('E6.5: a files-only restore to a backup names that backup; a reset to a plain moment keeps its commit', async () => {
    const { pool } = db
    await seed(pool)
    // "Restore files only" to Backup 2 (`RestoreFilesDialog`: mode reset, the backup's sha).
    const toBackup = await operation(pool, {
      action: 'reset',
      target_sha: sha('2'),
      resulting_sha: sha('c'),
      created_at: iso(30)
    })
    // A reset to a moment no backup tag points at.
    const toMoment = await operation(pool, {
      action: 'reset',
      target_sha: sha('7'),
      resulting_sha: sha('d'),
      created_at: iso(40)
    })
    const host = fakeHost([
      commit('d', 40, { title: 'restore: back to 7777777', files: 1 }),
      commit('c', 30, { title: 'restore: back to 2222222', files: 5 }),
      // A legacy reset commit no operation accounts for, back to the Initial backup.
      commit('e', 20, {
        title: 'restore: back to 1111111',
        subject: 'restore: back to 1111111',
        author: 'fleet@tracy.ai',
        files: 2
      }),
      commit('7', 15),
      {
        kind: 'backup',
        version: 2,
        sha: sha('2'),
        title: 'Backup 2',
        at: Math.floor((T0 + 10 * 60_000) / 1000)
      },
      commit('2', 10),
      { kind: 'backup', version: 1, sha: sha('1'), title: 'Initial backup', at: Math.floor(T0 / 1000) }
    ])
    const page = await v2(pool, host)
    const byId = new Map(page.items.map((i) => [i.id, i]))
    assert.deepEqual(byId.get(toBackup).description, {
      key: 'site-changes.reset',
      params: { target: sha('2').slice(0, 7), files: 5, version: 2 },
      isRequestOnly: false
    })
    assert.deepEqual(byId.get(toMoment).description, {
      key: 'site-changes.reset',
      params: { target: sha('7').slice(0, 7), files: 1, version: null },
      isRequestOnly: false
    })
    assert.deepEqual(byId.get(sha('e')).description, {
      key: 'site-changes.reset',
      params: { target: '1111111', files: 2, version: 1 },
      isRequestOnly: false
    })
  })

  test('Sync to live and its undo are Site changes rows by the Owner: counts only, no file, nothing to undo here', async () => {
    const { pool } = db
    await seed(pool)
    const scoped = async (action, scope, minutes) =>
      (
        await pool.query(
          `insert into site_operation (site_key, action, scope, actor_email, status, job_id, created_at, finished_at)
           values ($1, $2, $3::jsonb, $4, 'succeeded', 'job-p', $5, $5) returning id::text`,
          [SITE.site_key, action, JSON.stringify(scope), SAM, iso(minutes)]
        )
      ).rows[0].id
    const pushed = await scoped('sync-to-live', { pushId: 'p1', pushed: 3, conflicts: 1, failed: 0 }, 30)
    const undone = await scoped(
      'sync-to-live-undo',
      { pushId: 'p1', restored: 2, conflicts: 1, failed: 0 },
      40
    )
    const page = await v2(pool, fakeHost([]))
    const byId = new Map(page.items.map((i) => [i.id, i]))
    const push = byId.get(pushed)
    assert.equal(push.origin.source, 'site-changes')
    assert.equal(push.actor.id, `tracy:${SAM}`)
    assert.deepEqual(push.description, {
      key: 'site-changes.sync-to-live',
      params: { count: 3, conflicts: 1 },
      isRequestOnly: false
    })
    assert.equal(push.capabilities.canUndoFiles, false)
    assert.equal(push.effects.files.count, null, 'no file of the copy is claimed')
    assert.deepEqual(byId.get(undone).description, {
      key: 'site-changes.sync-to-live-undo',
      params: { count: 2, conflicts: 1 },
      isRequestOnly: false
    })
  })

  test('E3.2: an EmDash write names its entry by the title its own answer carried, never by a bare ULID', async () => {
    const { pool } = db
    const em = { ...SITE, site_key: 'scem1004.tracy.test', label: 'scem1004', platform: 'emdash' }
    await seed(pool, em)
    await turn(pool, 'e1:1', { site_key: em.site_key, opened_at: iso(10) })
    const ulid = '01M3PJRBF0GQ7B4HVY1WVH70XN'
    await pool.query(
      `insert into site_write (site_key, at, turn_id, session_id, actor, action, outcome, target, via)
       values ($1, $2, 'e1:1', 'e1', $3, 'content_update', 'ok', $4, 'emdash-mcp')`,
      [
        em.site_key,
        iso(10.5),
        MAI,
        JSON.stringify({ kind: 'home', id: ulid, title: 'Home', state: 'published' })
      ]
    )
    const page = await readActivityV2(pool, em, { runJob: fakeHost().runJob })
    const [row] = page.items
    assert.deepEqual(row.description, {
      key: 'resource.op',
      params: { op: 'update', type: 'home', id: ulid, title: 'Home' },
      isRequestOnly: false
    })
    assert.deepEqual(row.effects.content.resources, [
      { type: 'home', id: ulid, title: 'Home', ops: ['update'] }
    ])
  })

  /** A CMS row of the WordPress hook, every column the fold reads. */
  async function wpRow(pool, key, minutes, over = {}) {
    await pool.query(
      `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, resource_title, op,
         occurred_at, cursor_key, change_type, producer, files)
       values ($1, 'wordpress-tracy-log', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        SITE.site_key,
        over.actor === undefined ? null : JSON.stringify(over.actor),
        over.type ?? 'plugin',
        over.id ?? 'claude-cowork/claude-cowork.php',
        over.title ?? 'Tracy Claude Cowork',
        over.op ?? 'update',
        iso(minutes),
        key,
        over.change_type ?? 'upgrader_process_complete',
        JSON.stringify(over.producer ?? { schema: '2', version: '0.3.1', context: 'cron' }),
        over.files ?? null
      ]
    )
  }
  /** An outside seal with the paths it holds and the time its parent was committed. */
  async function seal(pool, c, minutes, paths, parentMinutes, over = {}) {
    await pool.query(
      `insert into site_outside (sha, site_key, at, files, cause, paths, parent_at)
       values ($1, $2, $3, $4, 'seal', $5, $6)`,
      [
        sha(c),
        SITE.site_key,
        iso(minutes),
        over.files ?? paths?.length ?? 0,
        paths,
        parentMinutes === null ? null : iso(parentMinutes)
      ]
    )
  }

  test('E5.1c: a seal every file of which a sourced CMS row explains folds into that row — one change, one row', async () => {
    const { pool } = db
    await seed(pool)
    const plugin = Array.from({ length: 35 }, (_, i) => `wp-content/plugins/claude-cowork/lib/f${i}.php`)
    // WP-Cron updated Tracy's plugin at 16; Site changes sealed its 35 files at 24 (parent at 10).
    await wpRow(pool, 'cron@1', 16)
    await seal(pool, 'a', 24, plugin, 10)
    // A person uploaded a picture in wp-admin at 30; its five files were sealed at 31.
    const pic = [
      'wp-content/uploads/2026/10/e2e04-upload.png',
      'wp-content/uploads/2026/10/e2e04-upload-150x150.png',
      'wp-content/uploads/2026/10/e2e04-upload-300x200.png',
      'wp-content/uploads/2026/10/e2e04-upload-768x512.png',
      'wp-content/uploads/2026/10/e2e04-upload-1024x683.png'
    ]
    await wpRow(pool, 'admin@2', 30, {
      actor: { id: '1', name: 'admin' },
      type: 'attachment',
      id: '88',
      title: 'e2e04-upload',
      op: 'upload',
      change_type: 'add_attachment',
      producer: { schema: '2', version: '0.3.1' },
      files: pic
    })
    await seal(pool, 'b', 31, pic, 25)

    const page = await v2(pool, fakeHost())
    assert.deepEqual(keys(page), [
      'cms-change:wordpress-tracy-log:admin@2',
      'cms-change:wordpress-tracy-log:cron@1'
    ])
    assert.equal(page.counts.unknown, 0)
    assert.equal(page.counts.all, 2)
    const [upload, cron] = page.items
    // The files ride on the row that explains them: count, commit, and the diff it allows.
    assert.equal(cron.origin.source, 'automatic')
    assert.deepEqual(cron.effects.files, { count: 35, sha: sha('a'), state: 'recorded' })
    assert.equal(cron.evidence.commitSha, sha('a'))
    assert.equal(cron.capabilities.canDiff, true)
    assert.equal(upload.origin.source, 'cms-admin')
    assert.deepEqual(upload.effects.files, { count: 5, sha: sha('b'), state: 'recorded' })
  })

  test('E5.1c: a seal is folded only when EVERY file is explained, inside its window, by a sourced row', async () => {
    const { pool } = db
    await seed(pool)
    const plugin = ['wp-content/plugins/claude-cowork/claude-cowork.php']
    await wpRow(pool, 'cron@1', 16)
    // One file no row explains (a theme file edited by hand in the same window).
    await seal(pool, 'a', 24, [...plugin, 'wp-content/themes/twentytwentyfive/style.css'], 10)
    // The update happened BEFORE the seal's window opened: an old update explains no new edit.
    await seal(pool, 'b', 40, plugin, 30)
    // A legacy seal: no paths, no parent time.
    await seal(pool, 'c', 17, null, null, { files: 1 })
    // A row whose producer proves nothing is Unknown itself: it explains no seal.
    await wpRow(pool, 'odd@2', 50, { producer: { schema: '2', version: '9.9.9', context: 'cron' } })
    await seal(pool, 'd', 52, plugin, 45)
    // A plugin row explains its own folder only — not a folder that merely starts with its name.
    await wpRow(pool, 'cron@3', 60)
    await seal(pool, 'e', 62, ['wp-content/plugins/claude-cowork-extra/x.php'], 55)
    const page = await v2(pool, fakeHost())
    const sealed = page.items.filter((i) => i.kind === 'outside-files').map((i) => i.id)
    assert.deepEqual(sealed.sort(), [sha('a'), sha('b'), sha('c'), sha('d'), sha('e')].sort())
    // Not folded, and still their own rows. `b` and `d` hold only the Cowork plugin with its header
    // moved: Tracy's package updating itself (`isCoworkUpdateSeal`), a Tracy update, never Unknown.
    assert.equal(page.counts.unknown, 4, 'three seals and the row with an unproven producer')
    assert.equal(page.counts.deployment, 2, 'the two seals of the Cowork plugin alone')
  })

  test('E5.1c: an update explains the translations its run brought, sealed while it ran or minutes after; each row counts its own files', async () => {
    const { pool } = db
    await seed(pool)
    // Measured on scv2 (reg97wp02, 04/10): WP-Cron updated core at 16 (logged when it completed),
    // then installed language packs — core's, plugins', themes' — sealed over the next minutes.
    await wpRow(pool, 'core@1', 16, { type: 'core', id: 'wordpress', title: 'WordPress' })
    await seal(pool, 'a', 16.1, ['wp-includes/version.php', 'wp-admin/about.php'], 15)
    await seal(
      pool,
      'b',
      17,
      ['wp-content/languages/admin-bel.po', 'wp-content/languages/plugins/polylang-de_DE.mo'],
      16.1
    )
    // A look while an upload's sizes were still being made, and the run's translations beside them.
    const pic = ['wp-content/uploads/2026/10/a.png', 'wp-content/uploads/2026/10/a-150x150.png']
    await wpRow(pool, 'up@2', 17.5, {
      actor: { id: '1', name: 'admin' },
      type: 'attachment',
      id: '9',
      title: 'a',
      op: 'upload',
      change_type: 'add_attachment',
      producer: { schema: '2', version: '0.3.1' },
      files: pic
    })
    await seal(pool, 'c', 18, [...pic, 'wp-content/languages/themes/twentytwentyfive-de_DE.mo'], 17)
    // Translations an hour after any update are nobody's we know of; nor is a non-translation file there.
    await seal(pool, 'd', 80, ['wp-content/languages/de_DE.mo'], 79)
    await seal(pool, 'e', 18.5, ['wp-content/languages/notes.txt'], 18)
    const page = await v2(pool, fakeHost())
    const sealed = page.items.filter((i) => i.kind === 'outside-files').map((i) => i.id)
    assert.deepEqual(sealed.sort(), [sha('d'), sha('e')].sort())
    const core = page.items.find((i) => i.id === 'wordpress-tracy-log:core@1')
    const upload = page.items.find((i) => i.id === 'wordpress-tracy-log:up@2')
    assert.deepEqual(
      upload.effects.files,
      { count: 2, sha: sha('c'), state: 'recorded' },
      'the upload counts its own files only'
    )
    assert.deepEqual(
      core.effects.files,
      { count: 5, sha: sha('c'), state: 'recorded' },
      'core: its files and every translation of the run'
    )
  })

  test('E5.1c: the seal a Site changes read makes is kept with its paths, and folds at once; the badge never counts it', async () => {
    const { pool } = db
    await seed(pool)
    await pool.query(
      `insert into account (email, display_name) values ('reader@example.test', 'Reader') on conflict do nothing`
    )
    await wpRow(pool, 'cron@1', 16)
    const files = [
      'wp-content/plugins/claude-cowork/claude-cowork.php',
      'wp-content/plugins/claude-cowork/lib/A.php'
    ]
    // The history job sealed the plugin's files as it read (`webroot-git.sh` read_op: `sealed`).
    const at = Math.floor((T0 + 24 * 60_000) / 1000)
    const host = fakeHost(
      [
        commit('a', 24, {
          kind: 'outside',
          by: { kind: 'outside' },
          title: 'changes made to the site outside Tracy',
          author: 'outside@tracy.test',
          files: 2
        })
      ],
      {
        answer: { sealed: { sha: sha('a'), files, at, parentAt: at - 14 * 60 } }
      }
    )
    const page = await v2(pool, host)
    assert.deepEqual(keys(page), ['cms-change:wordpress-tracy-log:cron@1'])
    const { rows } = await pool.query('select paths, parent_at from site_outside where sha = $1', [sha('a')])
    assert.deepEqual(rows[0].paths, files)
    assert.equal(rows[0].parent_at.toISOString(), iso(10))
    const { countUnseenV2 } = await import('../src/sites/activity-store.js')
    assert.equal(
      await countUnseenV2(pool, SITE.site_key, { since: iso(0), viewer: 'reader@example.test' }),
      1,
      'the plugin update (a software row) counts; its seal does not count again'
    )
  })

  // Walkthrough 11/10/2026 (tasks/evidence/ds-walkthrough-2026-10-11, bugs 3 and 4): a Design system
  // press on WordPress showed twice — its own row and "Files changed; source unknown · 2 files" for the
  // two files its job wrote under uploads/tracy/ — and its row read Type "Chat", "Requested by … ·
  // Applied by Tracy", "Changed design-system “Stripe”" for apply and undo alike.
  const DS_FILES = (slug) => [
    `wp-content/uploads/tracy/styles/ds-od-${slug}.json`,
    'wp-content/uploads/tracy/inspirations.json'
  ]
  async function dsApply(pool, applyId, minutes, over = {}) {
    await write(pool, {
      at: iso(minutes),
      session_id: `design-system-${applyId}`,
      action: 'design-system.apply',
      via: 'ds-slot',
      target: {
        kind: 'design-system',
        id: over.id ?? 'stripe',
        title: over.title ?? 'Stripe',
        applyId,
        channel: over.channel ?? 'button',
        from: over.from ?? null,
        ...(over.files === null ? {} : { files: over.files ?? DS_FILES(over.id ?? 'stripe') })
      }
    })
    await pool.query(
      `insert into site_design_system (site_key, undo_id, platform, system_id, system_name, previous_id, previous_name,
         actor, applied_at)
       values ($1, $2, 'wordpress', $3, $4, $5, $6, $7, $8)`,
      [
        SITE.site_key,
        applyId,
        over.id ?? 'stripe',
        over.title ?? 'Stripe',
        over.from?.id?.replace(/^od:/, '') ?? null,
        over.from?.name ?? null,
        MAI,
        iso(minutes)
      ]
    )
  }

  test('a Design system press is ONE row: Type Design system, applied by the person, the files its job wrote on it', async () => {
    const { pool } = db
    await seed(pool)
    // Pressed at 10; the Site changes read at 12 sealed the two files (parent commit at 5).
    await dsApply(pool, 'aaaaaaaaaaa1', 10)
    await seal(pool, 'a', 12, DS_FILES('stripe'), 5)
    // Switched to Spotify at 20, sealed at 21; undone at 30 (an undo writes no file).
    await dsApply(pool, 'aaaaaaaaaaa2', 20, {
      id: 'spotify',
      title: 'Spotify',
      from: { id: 'od:stripe', name: 'Stripe' }
    })
    await seal(pool, 'b', 21, DS_FILES('spotify'), 12)
    await write(pool, {
      at: iso(30),
      session_id: 'design-system-undo-aaaaaaaaaaa2',
      action: 'design-system.undo',
      via: 'ds-slot',
      target: {
        kind: 'design-system',
        id: 'spotify',
        title: 'Spotify',
        applyId: 'aaaaaaaaaaa2',
        back: 'stripe',
        channel: 'button'
      }
    })
    const page = await v2(pool, fakeHost())
    assert.deepEqual(keys(page), [
      'writes:session:design-system-undo-aaaaaaaaaaa2',
      'writes:session:design-system-aaaaaaaaaaa2',
      'writes:session:design-system-aaaaaaaaaaa1'
    ])
    assert.equal(page.counts.unknown, 0, 'no "source unknown" row for the files')
    assert.equal(page.counts['design-system'], 3)
    const [undo, spotify, stripe] = page.items
    for (const row of page.items) {
      assert.equal(row.origin.source, 'design-system')
      assert.equal(row.actor.role, 'executor', 'the person applied it themselves')
      assert.equal(row.actor.name, 'Mai Tran')
      assert.equal(row.executor, undefined, 'no "Applied by Tracy"')
    }
    assert.deepEqual(stripe.description, {
      key: 'design-system.apply',
      params: { name: 'Stripe' },
      isRequestOnly: false
    })
    assert.deepEqual(spotify.description.params, { name: 'Spotify', from: 'Stripe' })
    assert.equal(spotify.description.key, 'design-system.switch')
    assert.deepEqual(undo.description, {
      key: 'design-system.undo',
      params: { name: 'Spotify' },
      isRequestOnly: false
    })
    // The files ride on the press that wrote them: count, commit, and the diff it allows.
    assert.deepEqual(stripe.effects.files, { count: 2, sha: sha('a'), state: 'recorded' })
    assert.equal(stripe.evidence.commitSha, sha('a'))
    assert.equal(stripe.capabilities.canDiff, true)
    assert.deepEqual(spotify.effects.files, { count: 2, sha: sha('b'), state: 'recorded' })
    // The filter by Type finds them; People and Tracy keeps them.
    const only = await v2(pool, fakeHost(), { filter: 'design-system' })
    assert.equal(only.items.length, 3)
    const people = await v2(pool, fakeHost(), { filter: 'people' })
    assert.equal(people.items.length, 3)
  })

  test('a Design system fold needs every file named by a landed press, inside the seal’s window', async () => {
    const { pool } = db
    await seed(pool)
    await dsApply(pool, 'bbbbbbbbbbb1', 10)
    // A file nobody explains sealed with the press's two: the whole seal stays Unknown.
    await seal(pool, 'a', 12, [...DS_FILES('stripe'), 'wp-content/themes/tracy-base/style.css'], 5)
    // The same paths sealed minutes BEFORE the press was recorded (seal at 5, press at 10): more than
    // the door's wait between the job writing them and the row being recorded (3 minutes).
    await seal(pool, 'b', 5, DS_FILES('stripe'), 4)
    // A press whose job named no files (an older host) explains nothing.
    await dsApply(pool, 'bbbbbbbbbbb2', 40, { id: 'spotify', title: 'Spotify', files: null })
    await seal(pool, 'c', 42, DS_FILES('spotify'), 35)
    // An apply whose outcome is unknown (the job never answered) explains nothing either.
    await write(pool, {
      at: iso(50),
      session_id: 'design-system-cccccccccccc',
      action: 'design-system.apply',
      via: 'ds-slot',
      outcome: 'unknown',
      target: {
        kind: 'design-system',
        id: 'linear-app',
        title: 'Linear',
        channel: 'button',
        files: DS_FILES('linear-app')
      }
    })
    await seal(pool, 'd', 52, DS_FILES('linear-app'), 45)
    const page = await v2(pool, fakeHost())
    const sealed = page.items.filter((i) => i.kind === 'outside-files').map((i) => i.id)
    assert.deepEqual(sealed.sort(), [sha('a'), sha('b'), sha('c'), sha('d')].sort())
    const unsure = page.items.find((i) => i.id === 'session:design-system-cccccccccccc')
    assert.equal(unsure.description.key, 'design-system.unsure')
    assert.deepEqual(unsure.effects.files.count, null, 'no files claimed for it')
  })

  test('the chat route’s apply stays Chat (requested by the person, applied by Tracy); a row recorded before the channel stays Chat', async () => {
    const { pool } = db
    await seed(pool)
    await dsApply(pool, 'ddddddddddd1', 10, { channel: 'chat' })
    await write(pool, {
      at: iso(20),
      session_id: 'design-system-ddddddddddd2',
      action: 'design-system.apply',
      via: 'ds-slot',
      target: { kind: 'design-system', id: 'stripe', title: 'Stripe', applyId: 'ddddddddddd2' }
    })
    const page = await v2(pool, fakeHost())
    for (const row of page.items) {
      assert.equal(row.origin.source, 'chat')
      assert.equal(row.actor.role, 'requester')
      assert.equal(row.executor?.name, 'Tracy')
    }
    assert.equal(page.counts['design-system'], 0)
  })

  test('replay of the stand (dswalkwp01, 11/10/2026): its Stripe apply and the seal of its two files read as ONE row', async () => {
    const { pool } = db
    await seed(pool)
    // The stand's own rows (tracy-postgres-1, read only): site_write 6433 and 6434, and the seal
    // 3c735935… a Site changes read made of the files the apply wrote. The write carries what the
    // door now keeps: the channel, the look before, and the files the job names (measured with the
    // new script lines in dswalkwp01-web-1).
    await write(pool, {
      at: '2026-10-11T05:01:16.126Z',
      session_id: 'design-system-dfe916d615c1',
      action: 'design-system.apply',
      via: 'ds-slot',
      target: {
        id: 'stripe',
        kind: 'design-system',
        title: 'Stripe',
        applyId: 'dfe916d615c1',
        channel: 'button',
        from: null,
        files: [
          'wp-content/uploads/tracy/styles/ds-od-stripe.json',
          'wp-content/uploads/tracy/inspirations.json'
        ]
      }
    })
    await write(pool, {
      at: '2026-10-11T05:05:50.107Z',
      session_id: 'design-system-undo-dfe916d615c1',
      action: 'design-system.undo',
      via: 'ds-slot',
      target: {
        id: 'stripe',
        back: null,
        kind: 'design-system',
        title: 'Stripe',
        applyId: 'dfe916d615c1',
        channel: 'button'
      }
    })
    await pool.query(
      `insert into site_outside (sha, site_key, at, files, cause, paths, parent_at)
       values ($1, $2, '2026-10-11T05:02:37Z', 2, 'seal', $3, '2026-10-11T04:10:08Z')`,
      [
        '3c735935cedf6c760ce777bcfd5b38cc5345bd12',
        SITE.site_key,
        ['wp-content/uploads/tracy/inspirations.json', 'wp-content/uploads/tracy/styles/ds-od-stripe.json']
      ]
    )
    const page = await v2(pool, fakeHost())
    assert.deepEqual(keys(page), [
      'writes:session:design-system-undo-dfe916d615c1',
      'writes:session:design-system-dfe916d615c1'
    ])
    assert.equal(page.counts.unknown, 0)
    const [undo, apply] = page.items
    assert.equal(apply.description.key, 'design-system.apply')
    assert.equal(undo.description.key, 'design-system.undo')
    assert.deepEqual(apply.effects.files, {
      count: 2,
      sha: '3c735935cedf6c760ce777bcfd5b38cc5345bd12',
      state: 'recorded'
    })
  })

  test('the badge counts a colleague’s Design system press, never the presser’s own', async () => {
    const { pool } = db
    await seed(pool)
    await dsApply(pool, 'eeeeeeeeeee1', 10)
    await seal(pool, 'a', 12, DS_FILES('stripe'), 5)
    await v2(pool, fakeHost())
    const { countUnseenV2 } = await import('../src/sites/activity-store.js')
    assert.equal(
      await countUnseenV2(pool, SITE.site_key, { since: iso(0), viewer: SAM }),
      1,
      'one press, one'
    )
    assert.equal(await countUnseenV2(pool, SITE.site_key, { since: iso(0), viewer: MAI }), 0)
  })

  // Sweep #4 (04/10 dev E2E J3.1/J3.2): the brief popup's writes for a new site read 7/49/154 Unknown rows
  // on dev; now one row per setup run, Type Tracy setup, the person who sent the brief asking, Tracy writing.
  test('sweep 4: one Tracy setup run is ONE row: Type Tracy setup, requested by the person, applied by Tracy, the run as evidence', async () => {
    const { pool } = db
    await seed(pool)
    for (let i = 0; i < 7; i += 1)
      await write(pool, {
        at: iso(10 + i),
        target: { kind: 'post', id: String(i + 1), fields: ['post_title'] },
        origin: 'setup',
        origin_ref: 'run-a'
      })
    // A session-less write with no recorded provenance is not setup.
    await write(pool, { at: iso(30) })
    const page = await v2(pool, fakeHost())
    assert.deepEqual(keys(page), ['writes:write:8', 'writes:setup:run-a'])
    const [stray, setup] = page.items
    assert.equal(stray.origin.source, 'unknown')
    assert.equal(setup.origin.source, 'setup')
    assert.equal(setup.actor.type, 'person')
    assert.equal(setup.actor.role, 'requester')
    assert.equal(setup.actor.name, 'Mai Tran')
    assert.deepEqual(setup.executor, { type: 'system', id: 'service:tracy', name: 'Tracy', role: 'executor' })
    assert.equal(setup.evidence.setupRun, 'run-a')
    assert.equal(page.counts.setup, 1)
    assert.equal(page.counts.unknown, 1)
    // People and Tracy keeps it: only Automatic waits behind the line.
    const people = await v2(pool, fakeHost(), { filter: 'people' })
    assert.ok(people.items.some((i) => i.origin.source === 'setup'))
  })

  // SC-3 (dev 11/10/2026): a new site's setup run uploads pictures and installs a language, so its writes
  // leave files on the webroot; the first look sealed them as "Files changed; source unknown · 25 files".
  // The run now ends with a Tracy moment of its own (turn `setup-<run>:1`), and its files ride on its row.
  test('SC-3: the files a Tracy setup run wrote ride on its row, never a "source unknown" row', async () => {
    const { pool } = db
    await seed(pool)
    const run = '0f6c8a52-6a63-4f0c-9d3e-3b1f2f0d7a11'
    for (let i = 0; i < 3; i += 1)
      await write(pool, {
        at: iso(10 + i),
        action: i === 0 ? 'media.upload' : 'content.update',
        target: i === 0 ? null : { kind: 'post', id: String(i), fields: ['post_title'] },
        origin: 'setup',
        origin_ref: run
      })
    // The run's closing moment, as the run recorded it: the commit and the files it holds.
    await write(pool, {
      at: iso(14),
      action: 'setup.files',
      via: 'setup-moment',
      target: { sha: sha('5'), files: 25 },
      origin: 'setup',
      origin_ref: run
    })
    const moment = commit('5', 14, { turn: `setup-${run}:1`, title: 'Tracy setup', files: 25 })
    const page = await v2(pool, fakeHost([moment]))
    assert.deepEqual(keys(page), [`writes:setup:${run}`])
    const [setup] = page.items
    assert.equal(setup.origin.source, 'setup')
    assert.equal(setup.effects.files.count, 25)
    assert.equal(setup.effects.files.sha, sha('5'))
    // The carrier is not a content operation of its own: two posts and one picture, as written.
    assert.equal(setup.effects.content.resources.length, 2)
    assert.equal(page.counts.unknown, 0)
    assert.equal(page.counts.setup, 1)
  })

  test('SC-3: a setup moment the run did not hear back from is still its own, never Unknown', async () => {
    const { pool } = db
    await seed(pool)
    const run = '7d1e9b4a-2c3f-4e5a-8b6c-0d1e2f3a4b5c'
    await write(pool, {
      at: iso(10),
      target: { kind: 'post', id: '1', fields: ['post_title'] },
      origin: 'setup',
      origin_ref: run
    })
    // The moment ended after the run stopped waiting: no carrier row, only the commit's trailer.
    const moment = commit('6', 12, { turn: `setup-${run}:1`, title: 'Tracy setup', files: 9 })
    // A commit naming a run this site never had stays what it was.
    const stranger = commit('7', 20, { turn: 'setup-1b2c3d4e-0000-4000-8000-000000000000:1', files: 2 })
    const page = await v2(pool, fakeHost([moment, stranger]))
    assert.deepEqual(keys(page), [`git:${sha('7')}`, `writes:setup:${run}`])
    assert.equal(page.items[1].effects.files.count, 9)
    assert.equal(page.items[1].effects.files.sha, sha('6'))
  })

  test('sweep 2: a seat key’s writes read Type API; its revert is a row of its own that says what it restored', async () => {
    const { pool } = db
    await seed(pool)
    const key = { session_id: 'key:abcdefghijklmnop', origin: 'api', origin_ref: 'abcdefghijklmnop' }
    await write(pool, { ...key, at: iso(10), target: { kind: 'post', id: '314', fields: ['post_title'] } })
    await write(pool, { ...key, at: iso(11), target: { kind: 'post', id: '314', fields: ['post_title'] } })
    await write(pool, { ...key, at: iso(20), action: 'apply.revert', target: { reverts: 'api-abc-1' } })
    const page = await v2(pool, fakeHost())
    assert.deepEqual(keys(page), ['writes:write:3', 'writes:session:key:abcdefghijklmnop'])
    const [revert, writes] = page.items
    assert.equal(writes.origin.source, 'api')
    assert.equal(writes.actor.name, 'Mai Tran')
    assert.equal(writes.executor, undefined, 'no Tracy agent in between')
    assert.equal(revert.origin.source, 'api')
    assert.deepEqual(revert.description, {
      key: 'apply.revert',
      params: { applyId: 'api-abc-1' },
      isRequestOnly: false
    })
    assert.equal(page.counts.api, 2)
    assert.equal(page.counts.unknown, 0)
  })

  test('D6: a V2 read stamps the CMS log read time, as V1 does', async () => {
    const { pool } = db
    await seed(pool)
    await v2(pool, fakeHost())
    const { rows } = await pool.query(`select last_read_at from site_cms_log_cursor where site_key = $1`, [
      SITE.site_key
    ])
    assert.ok(rows[0]?.last_read_at)
  })
})
