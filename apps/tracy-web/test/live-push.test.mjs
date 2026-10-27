/**
 * "Sync to live" doors (`src/sites/live-push.js`, `GET|POST /api/sites/:key/push…`): who may (an
 * Owner, in a browser session), what the host is handed (and what never leaves this process), the
 * lease it shares with Sync from live and every chat write, a preview's expiry, apply → host job →
 * row, the Site changes row, and undo.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/live-push.test.mjs
 */
import { createHmac } from 'node:crypto'
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { takeWriteLease, writeComponent } from '../src/sites/store.js'
import { pushStageOf, previewOf } from '../src/sites/live-push-contract.js'
import { failureDetailOf, stoppedAnswer } from '../src/sites/live-push.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'live-push-actor-test-key',
  HOST_NAME: 'local',
  ARTIFACT_S3_ENDPOINT: 'http://r2.test',
  ARTIFACT_S3_BUCKET: 'artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'AK',
  ARTIFACT_S3_SECRET_KEY: 'SK'
}
const LIVE = 'https://shop.example/index.php?option=com_claudecowork&task=api.exec&format=json'
const COPY = 'http://shop-example-1-web-1/index.php?option=com_claudecowork&task=api.exec&format=json'
const LIVE_TOKEN = 'l'.repeat(40)
const COPY_TOKEN = 'c'.repeat(48)
const SITE = 'shop.example'

// The host's answers as `LIVE-PUSH-CONTRACT.md` §2–§4 write them.
const PREVIEWED = {
  ok: true,
  state: 'ready',
  platform: 'joomla',
  limit: 200,
  overLimit: false,
  hasDeletes: true,
  items: [
    {
      id: 'article:new:57',
      kind: 'article',
      op: 'create',
      group: 'add',
      title: 'Opening hours',
      liveId: null,
      fields: { title: { after: { text: 'Opening hours' } } }
    },
    {
      id: 'article:7',
      kind: 'article',
      op: 'update',
      group: 'change',
      title: 'About us',
      liveId: 7,
      fields: { title: { before: { text: 'SECRET-BEFORE' }, after: { text: 'About us' } } }
    },
    {
      id: 'article:9',
      kind: 'article',
      op: 'delete',
      group: 'remove',
      title: 'Old news',
      liveId: 9,
      fields: {}
    },
    {
      id: 'article:3',
      kind: 'article',
      op: 'update',
      group: 'change',
      title: 'Contact',
      liveId: 3,
      fields: { title: { before: { text: 'Contact' }, after: { text: 'Contact us' } } },
      conflict: { reason: 'changed-on-both', fields: ['title'] }
    }
  ],
  itemsTotal: 4,
  unsupported: [
    { what: 'file', path: 'templates/cassiopeia/css/user.css', change: 'modified' },
    { what: 'field', kind: 'article', title: 'About us', field: 'created_by_alias' }
  ],
  unsupportedTotal: 2
}
const PUSHED = {
  ok: true,
  state: 'partial',
  written: [
    { id: 'article:new:57', kind: 'article', op: 'create', title: 'Opening hours', liveId: 58 },
    { id: 'article:7', kind: 'article', op: 'update', title: 'About us', liveId: 7 }
  ],
  conflicts: [
    {
      id: 'article:9',
      kind: 'article',
      op: 'delete',
      title: 'Old news',
      liveId: 9,
      reason: 'changed-on-live'
    }
  ],
  failed: [],
  skipped: [],
  counts: { written: 2, conflicts: 1, failed: 0, skipped: 0 }
}
const UNDONE = {
  ok: true,
  state: 'partial',
  restored: [{ id: 'article:7', kind: 'article', op: 'update', title: 'About us', liveId: 7 }],
  kept: [{ id: 'article:new:57', title: 'Opening hours', reason: 'changed-on-live', fields: ['title'] }],
  failed: []
}

/**
 * A host that answers every job by its kind from `answers` (`{ok:true,state:'applied'}` otherwise),
 * `done` unless `running` holds the kind: then it says it runs, with `progress` lines.
 */
function network({ answers = {} } = {}) {
  const jobs = new Map()
  const calls = []
  const running = new Set()
  const fetchImpl = async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(init.body) : null
    calls.push({ url, body })
    if (url.endsWith('/_host/site')) {
      const id = `job-${jobs.size + 1}`
      jobs.set(id, body)
      return Response.json({ jobId: id }, { status: 202 })
    }
    const m = /\/_host\/jobs\/(.+)$/.exec(url)
    if (m) {
      const job = jobs.get(m[1])
      if (running.has(job.kind))
        return Response.json({ state: 'running', step: job.kind, progress: ['==> [3s] writing article 7'] })
      const answer = answers[job.kind] ?? { ok: true, state: 'applied' }
      // A job that printed no answer of its own: its output and end state as given.
      if (typeof answer.$output === 'string')
        return Response.json({ state: answer.$state ?? 'failed', step: job.kind, output: answer.$output })
      return Response.json({ state: 'done', step: job.kind, output: `==> done\n${JSON.stringify(answer)}` })
    }
    return new Response('{}', { status: 404 })
  }
  return { fetchImpl, calls, jobs, running }
}

const ANSWERS = {
  'webroot-live-push-preview': PREVIEWED,
  'webroot-live-push-apply': PUSHED,
  'webroot-live-push-undo': UNDONE
}

function harness(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = async (method, path, cookie, body, headers = {}) => {
    const response = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...headers,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await response.text()
    return { status: response.status, text, body: text ? JSON.parse(text) : null }
  }
  const actor = (email) => {
    const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
      'base64url'
    )
    return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
  }
  return { send, cookieFor, actor }
}

async function seat(pool, siteKey, email, role) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, rows[0].id, role]
  )
}

async function importedSite(
  pool,
  { platform = 'joomla', origin = 'migrated', importFingerprint = null } = {}
) {
  await pool.query(
    'insert into site (site_key, label, host, platform, origin, port) values ($1, $2, $3, $4, $5, $6)',
    [SITE, 'shop-example-1', 'local', platform, origin, 52001]
  )
  await seat(pool, SITE, 'owner@x.y', 'owner')
  await seat(pool, SITE, 'editor@x.y', 'editor')
  await writeComponent(
    pool,
    SITE,
    {
      endpoint: COPY,
      token: COPY_TOKEN,
      liveEndpoint: LIVE,
      liveToken: LIVE_TOKEN,
      ...(importFingerprint ? { importFingerprint } : {})
    },
    'owner@x.y'
  )
}

/** A previewed push, read back once so its row is settled. */
async function previewed(send, owner) {
  const started = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
  assert.equal(started.status, 202, started.text)
  const read = await send('GET', `/api/sites/${SITE}/push`, owner)
  assert.equal(read.body.push.state, 'previewed', read.text)
  return read.body.push
}

test(
  'only an Owner in a browser session reaches the doors: editors, the agent and nobody are refused',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor, actor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const editor = await cookieFor('editor@x.y')
    for (const [method, path, body] of [
      ['GET', `/api/sites/${SITE}/push`],
      ['POST', `/api/sites/${SITE}/push/preview`],
      ['POST', `/api/sites/${SITE}/push`, { previewId: '00000000-0000-4000-8000-000000000000' }],
      ['POST', `/api/sites/${SITE}/push/00000000-0000-4000-8000-000000000000/undo`]
    ]) {
      const refused = await send(method, path, editor, body)
      assert.equal(refused.status, 403, `${method} ${path}`)
      assert.equal(refused.body.code, 'FORBIDDEN_PUSH')
      // The agent's signed actor assertion is not a session: the door does not take it.
      const agent = await send(method, path, null, body, { 'x-tracy-actor': actor('owner@x.y') })
      assert.equal(agent.status, 401, `${method} ${path} as the agent`)
    }
    assert.equal(net.jobs.size, 0, 'no host job was filed')
  }
)

test(
  'a preview: the host gets the live door and token, the answer is grouped, no token anywhere',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const before = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.deepEqual(before.body, { available: true, push: null, lastPush: null })

    const started = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal(started.status, 202)
    assert.equal(started.body.push.state, 'running')
    assert.equal(started.body.push.phase, 'preview')
    const job = [...net.jobs.values()][0]
    assert.equal(job.kind, 'webroot-live-push-preview')
    assert.equal(job.endpoint, LIVE)
    assert.equal(job.token, LIVE_TOKEN)
    assert.equal(job.previewId, started.body.push.id)
    assert.equal(job.label, 'shop-example-1')

    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    const p = read.body.push
    assert.equal(p.state, 'previewed')
    assert.deepEqual(
      [p.preview.add, p.preview.change, p.preview.remove].map((g) => g.map((i) => i.id)),
      [['article:new:57'], ['article:7'], ['article:9']]
    )
    assert.deepEqual(p.preview.change[0].fields, ['title'], 'the field names, never their values')
    assert.ok(!read.text.includes('SECRET-BEFORE'))
    assert.deepEqual(
      p.preview.unsupported.map((u) => u.name),
      ['templates/cassiopeia/css/user.css', 'About us › created_by_alias']
    )
    assert.deepEqual(
      p.preview.liveChanged.map((i) => [i.title, i.reason]),
      [['Contact', 'changed-on-both']],
      'both sites changed it: listed apart, never in a group the push writes'
    )
    assert.ok(Date.parse(p.expiresAt) - Date.now() > 29 * 60_000, 'a preview lives thirty minutes')
    assert.equal(p.undoable, false)

    const { rows } = await pool.query('select * from site_push')
    const { rows: audits } = await pool.query("select * from audit where action like 'site.push%'")
    for (const text of [started.text, read.text, JSON.stringify(rows), JSON.stringify(audits)])
      assert.ok(!text.includes(LIVE_TOKEN) && !text.includes(LIVE), 'no live token or address')
    // The preview held the write lease while it ran, and let it go once it ended.
    const { rows: lease } = await pool.query(
      'select holder_session from site_write_lease where site_key = $1',
      [SITE]
    )
    assert.ok(!lease[0]?.holder_session, 'released after the preview')
  }
)

test(
  'apply: ticked removals only, the host gets them, the row says what reached the live site and Site changes has it',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const p = await previewed(send, owner)

    const bad = await send('POST', `/api/sites/${SITE}/push`, owner, {
      previewId: p.id,
      confirm: { deletes: ['article:9'] }
    })
    assert.equal(bad.status, 400, 'deletes is one tick, not a list')
    const shape = await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: 'nope' })
    assert.equal(shape.status, 400)

    const pushed = await send('POST', `/api/sites/${SITE}/push`, owner, {
      previewId: p.id,
      confirm: { deletes: true }
    })
    assert.equal(pushed.status, 202, pushed.text)
    assert.equal(pushed.body.push.phase, 'apply')
    const job = [...net.jobs.values()].at(-1)
    assert.equal(job.kind, 'webroot-live-push-apply')
    assert.equal(job.pushId, p.id)
    assert.equal(job.previewId, p.id)
    assert.deepEqual(job.confirm, { deletes: true, php: false })
    assert.equal(job.token, LIVE_TOKEN)

    const again = await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
    assert.equal(again.status, 409, 'a preview is pushed once')

    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    const row = read.body.push
    assert.equal(row.state, 'pushed')
    assert.deepEqual(
      row.result.pushed.map((i) => i.title),
      ['Opening hours', 'About us']
    )
    assert.deepEqual(
      row.result.conflicts.map((i) => i.title),
      ['Old news']
    )
    assert.equal(row.undoable, true)
    assert.equal(row.deletes, true)
    assert.equal(row.result.pushed[1].liveId, '7')

    const { rows: ops } = await pool.query('select action, status, actor_email, scope from site_operation')
    assert.equal(ops.length, 1)
    assert.equal(ops[0].action, 'sync-to-live')
    assert.equal(ops[0].status, 'succeeded')
    assert.equal(ops[0].actor_email, 'owner@x.y')
    assert.equal(ops[0].scope.pushed, 2)
    assert.equal(ops[0].scope.conflicts, 1)
    const { rows: audits } = await pool.query(
      "select action from audit where action like 'site.push%' order by id"
    )
    assert.deepEqual(
      audits.map((a) => a.action),
      ['site.push.preview', 'site.push.preview.previewed', 'site.push', 'site.push.pushed']
    )
  }
)

test('undo: the newest push only, and Site changes records it', opts, async () => {
  const { pool } = db
  const net = network({ answers: ANSWERS })
  const { send, cookieFor } = harness(pool, net.fetchImpl)
  await importedSite(pool)
  const owner = await cookieFor('owner@x.y')
  const p = await previewed(send, owner)
  await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
  await send('GET', `/api/sites/${SITE}/push`, owner)

  // A newer preview does not take the Undo away: the push is still the newest that reached the live site.
  const next = await previewed(send, owner)
  const both = await send('GET', `/api/sites/${SITE}/push`, owner)
  assert.equal(both.body.push.id, next.id)
  assert.equal(both.body.lastPush.id, p.id)
  assert.equal(both.body.lastPush.undoable, true)

  const unknown = await send('POST', `/api/sites/${SITE}/push/${next.id}/undo`, owner)
  assert.equal(unknown.status, 409, 'a preview is not a push')
  assert.equal(unknown.body.code, 'PUSH_NOT_UNDOABLE')

  const undo = await send('POST', `/api/sites/${SITE}/push/${p.id}/undo`, owner)
  assert.equal(undo.status, 202, undo.text)
  const job = [...net.jobs.values()].at(-1)
  assert.equal(job.kind, 'webroot-live-push-undo')
  assert.equal(job.pushId, p.id)
  const read = await send('GET', `/api/sites/${SITE}/push`, owner)
  assert.equal(read.body.lastPush.state, 'undone')
  assert.equal(read.body.lastPush.undoable, false)
  assert.deepEqual(
    read.body.lastPush.undo.conflicts.map((i) => i.title),
    ['Opening hours']
  )
  const twice = await send('POST', `/api/sites/${SITE}/push/${p.id}/undo`, owner)
  assert.equal(twice.status, 409)
  const { rows: ops } = await pool.query('select action, scope from site_operation order by created_at')
  assert.deepEqual(
    ops.map((o) => o.action),
    ['sync-to-live', 'sync-to-live-undo']
  )
  assert.equal(ops[1].scope.restored, 1)
})

test(
  'one lease: a chat writing refuses a preview, a running push refuses a sync and a chat, a running sync refuses a push',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')

    // A chat of the editor holds the site's write lease.
    assert.ok((await takeWriteLease(pool, { siteKey: SITE, sessionId: 'chat-1', actor: 'editor@x.y' })).ok)
    const busy = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal(busy.status, 409)
    assert.equal(busy.body.code, 'PUSH_SITE_BUSY')
    assert.equal(busy.body.holder, 'editor@x.y')
    await pool.query('delete from site_write_lease')

    // A push under way holds the lease: a Sync from live and a chat (the same Owner's, too) are refused.
    net.running.add('webroot-live-push-preview')
    const started = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal(started.status, 202)
    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(read.body.push.state, 'running')
    assert.equal(read.body.push.step, 'writing', 'the stage of the progress line')
    const sync = await send('POST', `/api/sites/${SITE}/sync`, owner)
    assert.equal(sync.status, 409)
    assert.equal(sync.body.code, 'SYNC_SITE_BUSY')
    await pool.query(
      `insert into site_presence (site_key, session_id, first_at, seen_at) values ($1, 'chat-2', now(), now())`,
      [SITE]
    )
    const chat = await takeWriteLease(pool, { siteKey: SITE, sessionId: 'chat-2', actor: 'owner@x.y' })
    assert.equal(chat.ok, false, 'the Owner opening a chat does not take the push’s lease over')
    const second = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal(second.body.code, 'PUSH_RUNNING')
    net.running.clear()
    await send('GET', `/api/sites/${SITE}/push`, owner)

    // A Sync from live under way refuses a push.
    await pool.query(
      `insert into site_sync (id, site_key, state, step, host_job) values (gen_random_uuid(), $1, 'running', 'webroot-sync', 'job-x')`,
      [SITE]
    )
    const syncing = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal(syncing.status, 409)
    assert.equal(syncing.body.code, 'PUSH_SYNC_RUNNING')
  }
)

test('a preview expires after thirty minutes, and a newer one supersedes it', opts, async () => {
  const { pool } = db
  const net = network({ answers: ANSWERS })
  const { send, cookieFor } = harness(pool, net.fetchImpl)
  await importedSite(pool)
  const owner = await cookieFor('owner@x.y')
  const first = await previewed(send, owner)
  const second = await previewed(send, owner)
  const old = await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: first.id })
  assert.equal(old.status, 409)
  assert.equal(old.body.code, 'PREVIEW_SUPERSEDED')

  await pool.query("update site_push set expires_at = now() - interval '1 second' where id = $1", [second.id])
  const read = await send('GET', `/api/sites/${SITE}/push`, owner)
  assert.equal(read.body.push.state, 'expired')
  const late = await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: second.id })
  assert.equal(late.status, 409)
  assert.equal(late.body.code, 'PREVIEW_EXPIRED')
  assert.ok(![...net.jobs.values()].some((j) => j.kind === 'webroot-live-push-apply'), 'nothing was pushed')
})

test(
  'a preview whose Sync from live held records is held; one with nothing to send cannot be pushed',
  opts,
  async () => {
    const { pool } = db
    const net = network({
      answers: {
        'webroot-live-push-preview': {
          ok: false,
          code: 'SYNC_NEEDS_ATTENTION',
          sync: { ok: true, state: 'needs_attention', held: [{ id: 'x' }] }
        }
      }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    const held = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(held.body.push.state, 'held')
    assert.equal(held.body.push.preview.held, 1)

    net.jobs.clear()
    const empty = network({
      answers: { 'webroot-live-push-preview': { ok: true, state: 'nothing', items: [] } }
    })
    const h2 = harness(pool, empty.fetchImpl)
    const p = await previewed(h2.send, owner)
    const nothing = await h2.send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
    assert.equal(nothing.status, 409)
    assert.equal(nothing.body.code, 'PUSH_NOTHING')
  }
)

test(
  'a host that fails the apply part way: the row is failed, what reached the live site stays undoable',
  opts,
  async () => {
    const { pool } = db
    const net = network({
      answers: {
        ...ANSWERS,
        'webroot-live-push-apply': {
          ok: false,
          code: 'LIVE_UNREACHABLE',
          written: [{ id: 'article:7', kind: 'article', op: 'update', title: 'About us' }]
        }
      }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const p = await previewed(send, owner)
    await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(read.body.push.state, 'failed')
    assert.equal(read.body.push.error, 'LIVE_UNREACHABLE')
    assert.equal(read.body.push.undoable, true)
    const { rows } = await pool.query('select action from site_operation')
    assert.deepEqual(
      rows.map((r) => r.action),
      ['sync-to-live']
    )
  }
)

test(
  'a site built in Tracy, or on a platform without the content actions, has no Sync to live',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool, { platform: 'emdash' })
    const owner = await cookieFor('owner@x.y')
    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.deepEqual(read.body, { available: false, why: 'platform', push: null, lastPush: null })
    const refused = await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal(refused.body.code, 'PUSH_UNSUPPORTED_PLATFORM')
    await pool.query("update site set platform = 'joomla', origin = 'built' where site_key = $1", [SITE])
    const built = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(built.body.why, 'not-imported')
  }
)

test(
  'a preview that stops says why: the host’s detail on the row and in the view, or its last stopped step when it printed no answer',
  opts,
  async () => {
    const { pool } = db
    const detail =
      "SqlError: ERROR 1267 (HY000) at line 125: Illegal mix of collations (utf8mb4_unicode_520_ci,IMPLICIT) and (utf8mb4_unicode_ci,IMPLICIT) for operation '…'"
    const net = network({
      answers: { ...ANSWERS, 'webroot-live-push-preview': { ok: false, code: 'CHANGESET_FAILED', detail } }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(read.body.push.state, 'failed')
    assert.equal(read.body.push.error, 'CHANGESET_FAILED')
    assert.equal(read.body.push.errorDetail, detail)
    const { rows } = await pool.query("select detail from audit where action = 'site.push.preview.failed'")
    assert.equal(rows[0]?.detail?.why, detail, JSON.stringify(rows))

    // A job that died with no answer: its last `stopped:` step is its answer.
    await pool.query('delete from site_push')
    const died = network({
      answers: {
        ...ANSWERS,
        'webroot-live-push-preview': {
          $output:
            '==> [3s] stage: comparing\n==> [9s] preview stopped: CHANGESET_FAILED: the changeset stopped with no answer\n'
        }
      }
    })
    const second = harness(pool, died.fetchImpl)
    await second.send('POST', `/api/sites/${SITE}/push/preview`, owner)
    const again = await second.send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(again.body.push.error, 'CHANGESET_FAILED')
    assert.equal(again.body.push.errorDetail, 'the changeset stopped with no answer')
  }
)

test('why a phase stopped: the detail, the inner sync’s, or a stopped step — never a value', () => {
  assert.equal(failureDetailOf({ ok: false, code: 'CHANGESET_FAILED', detail: 'KeyError: …' }), 'KeyError: …')
  assert.equal(
    failureDetailOf({
      ok: false,
      code: 'SYNC_FAILED',
      sync: { ok: false, code: 'MERGE_FAILED', detail: 'the database merge stopped' }
    }),
    'MERGE_FAILED: the database merge stopped'
  )
  assert.equal(failureDetailOf({ ok: true, state: 'ready' }), null)
  assert.equal(failureDetailOf({ ok: false, code: 'NO_BASE' }), null)
  assert.deepEqual(
    stoppedAnswer({
      progress: ['==> [1s] stage: writing', '==> [4s] apply stopped: LIVE_UNREACHABLE: UNREACHABLE']
    }),
    { ok: false, code: 'LIVE_UNREACHABLE', detail: 'UNREACHABLE' }
  )
  assert.equal(stoppedAnswer({ output: '==> [1s] stage: writing\n' }), null)
})

test('the contract helpers: stages from host steps, and a preview answer grouped by op', () => {
  assert.equal(pushStageOf('stage: comparing'), 'comparing')
  assert.equal(pushStageOf('reading the live site'), 'syncing')
  assert.equal(pushStageOf('writing article 7'), 'writing')
  assert.equal(pushStageOf('something else'), null)
  const p = previewOf({
    items: [
      { id: 'a', op: 'upload', kind: 'media', fields: { file: { after: { text: 'secret' } } } },
      { op: 'update' }
    ]
  })
  assert.deepEqual(
    p.add,
    [{ id: 'a', kind: 'media', title: null, fields: ['file'], op: 'upload' }],
    'an upload is an add; no value is kept, and an item with no id is dropped'
  )
  assert.deepEqual(p.change, [])
  // What a change is and the fixed words of its title go by name, for the dialog to translate; a name
  // that is not one (spaces, markup) is dropped, and a subject only rides with its label.
  const w = previewOf({
    items: [
      { id: 'h', op: 'update', kind: 'templatePart', what: 'templatePart', title: 'Header' },
      {
        id: 'c',
        op: 'update',
        kind: 'post',
        what: 'setting',
        label: 'additionalCss',
        subject: 'astra',
        title: 'Additional CSS · astra'
      },
      {
        id: 'x',
        op: 'update',
        kind: 'post',
        what: '<b>page</b>',
        label: 'two words',
        subject: 'astra',
        title: 'X'
      }
    ],
    unsupported: [
      { what: 'setting', name: 'Permalink structure', reason: 'permalink', label: 'permalink_structure' }
    ]
  })
  assert.deepEqual(
    w.change.map((i) => [i.id, i.what ?? null, i.label ?? null, i.subject ?? null]),
    [
      ['h', 'templatePart', null, null],
      ['c', 'setting', 'additionalCss', 'astra'],
      ['x', null, null, null]
    ]
  )
  assert.equal(w.unsupported[0].label, 'permalink_structure')
  // Phase 2: files and settings in their own groups, a PHP file in its own; a file by its name and size.
  const q = previewOf({
    items: [
      {
        id: 'f',
        op: 'upload',
        group: 'files',
        kind: 'file',
        title: 'media/templates/site/x/css/user.css',
        size: 120
      },
      {
        id: 's',
        op: 'update',
        group: 'settings',
        kind: 'siteIdentity',
        title: 'Global Configuration',
        fields: { 'Site Name': {} }
      },
      { id: 'p', op: 'upload', group: 'php', kind: 'file', title: 'media/mod_a/helper.php', size: 30 }
    ],
    unsupported: [
      {
        what: 'file',
        path: 'templates/t4/css/custom.css',
        change: 'modified',
        reason: 'engine-has-no-file-write',
        size: 9
      }
    ]
  })
  assert.deepEqual(q.files, [
    { id: 'f', kind: 'file', title: 'media/templates/site/x/css/user.css', op: 'upload', size: 120 }
  ])
  assert.deepEqual(
    q.settings.map((i) => [i.id, i.fields]),
    [['s', ['Site Name']]]
  )
  assert.deepEqual(
    q.php.map((i) => i.id),
    ['p']
  )
  assert.deepEqual(q.unsupported, [
    { kind: 'file', name: 'templates/t4/css/custom.css', reason: 'engine-has-no-file-write', size: 9 }
  ])
  assert.equal(q.itemsTotal, 3)
  // Template files: a parent theme's file carries its warning, a too-large file the door's limit,
  // and the preview says which CMS (the switches it names are called differently on each).
  const t = previewOf({
    platform: 'wordpress',
    items: [
      {
        id: 'file:wp-content/themes/astra/style.css',
        op: 'upload',
        group: 'files',
        kind: 'file',
        title: 'wp-content/themes/astra/style.css',
        size: 10,
        warning: 'parent-theme'
      }
    ],
    unsupported: [
      {
        what: 'file',
        path: 'wp-content/themes/astra/big.css',
        reason: 'too-large',
        size: 3145728,
        limit: 2097152
      },
      { what: 'file', path: 'wp-content/themes/astra/functions.php', reason: 'php-disabled' }
    ]
  })
  assert.equal(t.platform, 'wordpress')
  assert.equal(t.files[0].warning, 'parent-theme')
  assert.deepEqual(t.unsupported, [
    {
      kind: 'file',
      name: 'wp-content/themes/astra/big.css',
      reason: 'too-large',
      size: 3145728,
      limit: 2097152
    },
    { kind: 'file', name: 'wp-content/themes/astra/functions.php', reason: 'php-disabled' }
  ])
})

test(
  'the preview carries the first-sync base Sync from live sends: the import’s fingerprint, when the site has one',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    const FINGERPRINT = { tables: { jos_content: 'abc' }, files: 'def' }
    await importedSite(pool, { importFingerprint: FINGERPRINT })
    const owner = await cookieFor('owner@x.y')
    const p = await previewed(send, owner)
    const preview = [...net.jobs.values()].find((j) => j.kind === 'webroot-live-push-preview')
    assert.deepEqual(preview.baseFingerprint, FINGERPRINT)
    await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
    const apply = [...net.jobs.values()].find((j) => j.kind === 'webroot-live-push-apply')
    assert.equal(apply.baseFingerprint, undefined, 'the apply does not take one')
    await send('GET', `/api/sites/${SITE}/push`, owner)

    await pool.query('delete from site_push')
    await pool.query("update site_component set config = config - 'importFingerprint'")
    net.jobs.clear()
    await previewed(send, owner)
    const bare = [...net.jobs.values()].find((j) => j.kind === 'webroot-live-push-preview')
    assert.equal('baseFingerprint' in bare, false, 'no fingerprint is made up for an import that kept none')
  }
)

test(
  'a deleted copy takes its sync and push rows with it: the same live site imported again starts with none',
  opts,
  async () => {
    const { pool } = db
    const net = network({ answers: ANSWERS })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await previewed(send, owner)
    await pool.query(
      `insert into site_sync (id, site_key, state, step, host_job) values (gen_random_uuid(), $1, 'applied', null, 'job-y')`,
      [SITE]
    )
    const count = async () =>
      (
        await pool.query(
          `select (select count(*)::int from site_sync where site_key = $1) as syncs,
                  (select count(*)::int from site_push where site_key = $1) as pushes`,
          [SITE]
        )
      ).rows[0]
    const before = await count()
    assert.ok(before.pushes > 0 && before.syncs > 0, JSON.stringify(before))
    await pool.query('delete from site where site_key = $1', [SITE])
    assert.deepEqual(await count(), { syncs: 0, pushes: 0 })

    await importedSite(pool)
    const read = await send('GET', `/api/sites/${SITE}/push`, owner)
    assert.equal(read.body.push, null, 'no push of the deleted copy')
    assert.equal(read.body.lastPush, null)
    const sync = await send('GET', `/api/sites/${SITE}/sync`, owner)
    assert.equal(sync.body.sync ?? null, null, 'no sync of the deleted copy')
  }
)

test(
  'a push that wrote nothing ran no sync: no site_sync row, and Sync from live still reads the preview’s sync',
  opts,
  async () => {
    const { pool } = db
    const net = network({
      answers: {
        ...ANSWERS,
        'webroot-live-push-preview': {
          ...PREVIEWED,
          sync: { ok: true, state: 'applied', unchanged: 'fingerprint' }
        },
        'webroot-live-push-apply': {
          ok: true,
          state: 'nothing',
          written: [],
          conflicts: [
            {
              id: 'article:7',
              kind: 'article',
              op: 'update',
              title: 'About us',
              liveId: 7,
              fields: [],
              reason: 'open-in-editor'
            }
          ],
          failed: [],
          skipped: [],
          counts: { written: 0, conflicts: 1, failed: 0, skipped: 0 },
          sync: { ok: true, state: 'skipped' }
        }
      }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const p = await previewed(send, owner)
    await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
    await send('GET', `/api/sites/${SITE}/push`, owner)
    const { rows } = await pool.query('select origin, state from site_sync order by created_at')
    assert.deepEqual(
      rows.map((r) => `${r.origin}:${r.state}`),
      ['push:applied']
    )
    const read = await send('GET', `/api/sites/${SITE}/sync`, owner)
    assert.equal(read.body.sync.state, 'applied', 'the newest sync is the preview’s, not a failure')
    const { rows: audits } = await pool.query("select action from audit where action like 'site.sync%'")
    assert.ok(!audits.some((a) => a.action === 'site.sync.failed'))
  }
)

test(
  'the Sync from live a push runs is a site_sync row of its own: the Sync from live door reads it, the site’s last write is stamped',
  opts,
  async () => {
    const { pool } = db
    const READ_AT = '2026-10-24T09:00:00Z'
    const net = network({
      answers: {
        ...ANSWERS,
        'webroot-live-push-preview': {
          ...PREVIEWED,
          liveReadAt: READ_AT,
          sync: {
            state: 'applied',
            liveReadAt: READ_AT,
            kept: 0,
            renumbered: 0,
            summary: { files: { fromTheirs: 2 }, database: { rowsFromTheirs: 3 }, backup: 12 },
            timing: { steps: [{ at: 0, step: 'reading the live site', stage: 'reading' }], read: null }
          }
        },
        'webroot-live-push-apply': {
          ...PUSHED,
          sync: { ok: true, state: 'applied', unchanged: true, version: 13 }
        }
      }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const p = await previewed(send, owner)

    const { rows: syncs } = await pool.query('select * from site_sync order by created_at')
    assert.equal(syncs.length, 1)
    assert.equal(syncs[0].origin, 'push')
    assert.equal(syncs[0].state, 'applied')
    assert.equal(syncs[0].answer.pushId, p.id)
    assert.equal(syncs[0].created_by, 'owner@x.y')
    const { rows: site } = await pool.query('select last_write_at from site where site_key = $1', [SITE])
    assert.ok(site[0].last_write_at, 'an applied sync changed the copy: the site’s last write is stamped')

    const read = await send('GET', `/api/sites/${SITE}/sync`, owner)
    assert.equal(read.status, 200)
    assert.equal(read.body.sync.state, 'applied')
    assert.equal(read.body.sync.liveReadAt, new Date(READ_AT).toISOString())
    assert.equal(read.body.sync.summary.backup, 12)
    assert.deepEqual(read.body.sync.kept, [], 'a count of kept places is not walked as a list')
    assert.ok(!read.text.includes(LIVE_TOKEN))

    // The sync after the apply: its own row; unchanged, so no new stamp.
    const stamp = site[0].last_write_at
    await send('POST', `/api/sites/${SITE}/push`, owner, { previewId: p.id })
    await send('GET', `/api/sites/${SITE}/push`, owner)
    const { rows: after } = await pool.query(
      'select origin, state, answer from site_sync order by created_at'
    )
    assert.equal(after.length, 2)
    assert.equal(after[1].answer.version, 13)
    const { rows: site2 } = await pool.query('select last_write_at from site where site_key = $1', [SITE])
    assert.equal(site2[0].last_write_at.getTime(), stamp.getTime())
    const { rows: audits } = await pool.query(
      "select action from audit where action like 'site.sync%' order by id"
    )
    assert.deepEqual(
      audits.map((a) => a.action),
      ['site.sync.applied', 'site.sync.unchanged']
    )
  }
)

test(
  'a preview whose inner sync held records leaves a held site_sync row; Sync anyway does not resume a run that is not its own',
  opts,
  async () => {
    const { pool } = db
    const HELD = [
      { id: 'db:jos_forms:["4"]', kind: 'row', table: 'jos_forms', reason: 'added-both', key: { id: '4' } }
    ]
    const net = network({
      answers: {
        'webroot-live-push-preview': {
          ok: false,
          code: 'SYNC_NEEDS_ATTENTION',
          sync: { ok: true, state: 'needs_attention', liveReadAt: '2026-10-24T09:00:00Z', held: HELD }
        }
      }
    })
    const { send, cookieFor } = harness(pool, net.fetchImpl)
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')
    await send('POST', `/api/sites/${SITE}/push/preview`, owner)
    assert.equal((await send('GET', `/api/sites/${SITE}/push`, owner)).body.push.state, 'held')
    const read = await send('GET', `/api/sites/${SITE}/sync`, owner)
    assert.equal(read.body.sync.state, 'needs_resolution')
    assert.deepEqual(
      read.body.sync.held.map((h) => h.id),
      [HELD[0].id]
    )
    const { rows: site } = await pool.query('select last_write_at from site where site_key = $1', [SITE])
    assert.equal(site[0].last_write_at, null, 'a held sync changed nothing')

    const anyway = await send('POST', `/api/sites/${SITE}/sync`, owner, { allowHeld: true })
    assert.equal(anyway.status, 202, anyway.text)
    const job = [...net.jobs.values()].find((j) => j.kind === 'webroot-sync')
    assert.equal(job.allowHeld, true)
    assert.equal('resumeSyncId' in job, false)
  }
)
