// Backups (ADR 0024, plan `tasks/todo-backup.md` §2) through tracy-web's doors: what each backup
// point holds (`/backups`, `/backup`), and "Restore everything" (`POST /restore` mode
// `everything`) — its gate, its operation record, its verification and its idempotency — against a
// scripted fake tracy-host that answers each job kind as the test says.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { databaseOf, withDatabases } from '../src/sites/backups.js'
import { resetReconcileThrottle } from '../src/sites/operations.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(async () => {
  await db.reset()
  resetReconcileThrottle()
})
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
  SEAT_local_SECRET: 'k'
}

const SITE = 'lantern.localhost'
const sha = (c) => c.repeat(40)
const DB3 = 'a'.repeat(64)
const S3 = sha('3')
const HEAD = sha('9')
const at = 1_759_400_000

/** The host's `webroot-history` answer with three backups: v3 full, v2 file-only, v1 dump gone. */
const HISTORY = {
  ok: true,
  head: HEAD,
  latest: { version: 3, sha: S3 },
  rows: [
    // The commit a restore to v3 makes (read back by Site changes once the restore ran).
    {
      sha: HEAD,
      at: at + 60,
      by: { kind: 'agent' },
      kind: 'moment',
      title: `restore: back to ${S3.slice(0, 7)}`,
      author: 'fleet@tracy.ai',
      subject: `restore: back to ${S3.slice(0, 7)}`,
      turn: null,
      files: 2
    },
    { sha: sha('7'), at, by: { kind: 'agent' }, kind: 'moment', title: 'm', turn: null, files: 1 },
    {
      kind: 'backup',
      version: 3,
      sha: S3,
      title: 'Backup 3',
      notes: null,
      at,
      by: { kind: 'agent' },
      files: 2,
      database: { engine: 'mariadb', bytes: 1_880_000, sha256: DB3, ok: true }
    },
    {
      kind: 'backup',
      version: 2,
      sha: sha('2'),
      title: 'Backup 2',
      notes: null,
      at,
      by: { kind: 'agent' },
      files: 1,
      database: null
    },
    {
      kind: 'backup',
      version: 1,
      sha: sha('1'),
      title: 'Initial backup',
      notes: null,
      at,
      by: { kind: 'agent' },
      files: 9,
      database: { engine: 'mariadb', bytes: 10, sha256: 'b'.repeat(64), ok: false, reason: 'removed' }
    }
  ],
  truncated: false
}

/** The restore commit `restore_reset` makes, as the host's commit reader names it (D2). */
const RESTORE_COMMIT = {
  ok: true,
  sha: HEAD,
  author: 'fleet@tracy.ai',
  subject: `restore: back to ${S3.slice(0, 7)}`,
  files: [],
  total: 2
}
// `beforeRestore`: the host's own Before-restore backup, made first (webroot-backup.sh `restore_answer`).
const BEFORE = { version: 7, sha: 'f'.repeat(40), database: { ok: true } }
const EVERYTHING_OK = {
  ok: true,
  files: 2,
  head: HEAD,
  database: { restored: true, sha256: DB3 },
  beforeRestore: BEFORE
}

/**
 * A tracy-host that answers each job kind from `answers[kind]` (an object, or a function of the
 * job's input). `states[kind]` overrides the job's state on each poll (`running` keeps it going).
 */
function fakeHost(answers = {}, states = {}) {
  const calls = []
  let n = 0
  /** @type {Map<string, {kind: string, input: any, polls: number}>} */
  const jobs = new Map()
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    if (u.pathname === '/_host/site') {
      const body = JSON.parse(init.body)
      calls.push(body)
      const id = `job-${++n}`
      jobs.set(id, { kind: body.kind, input: body, polls: 0 })
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    const id = u.pathname.replace('/_host/jobs/', '')
    const job = jobs.get(id)
    if (!job) return new Response(null, { status: 404 })
    job.polls++
    const state = states[job.kind]?.(job) ?? 'done'
    if (state === 'running') return new Response(JSON.stringify({ state: 'running' }), { status: 200 })
    if (state === 'failed')
      return new Response(JSON.stringify({ state: 'failed', output: 'boom' }), { status: 200 })
    const answer = answers[job.kind]
    const out = typeof answer === 'function' ? answer(job.input) : (answer ?? { ok: true })
    return new Response(JSON.stringify({ state: 'done', output: JSON.stringify(out) }), { status: 200 })
  }
  return { fetchImpl, calls, jobs }
}

function harness(pool, fetchImpl, now) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl,
    ...(now ? { now } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
  return { cookieFor, send }
}

async function seat(pool, email, role) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [SITE, rows[0].id, role]
  )
}

async function site(pool) {
  await pool.query(
    `insert into site (site_key, label, host, platform) values ($1, 'lantern', 'local', 'wordpress')`,
    [SITE]
  )
  await seat(pool, 'owner@x.y', 'owner')
}

const press = (over = {}) => ({ mode: 'everything', version: 3, confirm: 'restore', ...over })
const operations = async (pool) =>
  (await pool.query(`select * from site_operation where site_key = $1 order by created_at`, [SITE])).rows

// ── What a backup point holds ────────────────────────────────────────────────────────────────

test('databaseOf: full only with the host’s proof and a hash; missing names why; none; an older host cannot tell', () => {
  assert.deepEqual(databaseOf(HISTORY.rows[2]), {
    state: 'full',
    engine: 'mariadb',
    sha256: DB3,
    size: 1_880_000
  })
  assert.deepEqual(databaseOf(HISTORY.rows[3]), { state: 'none', engine: null, sha256: null, size: null })
  assert.deepEqual(databaseOf(HISTORY.rows[4]), {
    state: 'missing',
    engine: 'mariadb',
    sha256: 'b'.repeat(64),
    size: 10,
    reason: 'removed'
  })
  assert.equal(databaseOf({ kind: 'backup' }).state, 'unknown-host')
  assert.equal(databaseOf({ database: { ok: true } }).state, 'missing', 'ok without a hash proves nothing')
  assert.equal(databaseOf({ database: { ok: true, sha256: DB3, engine: 'oracle' } }).engine, null)
  // Only backup rows change; a moment passes through untouched.
  const rows = withDatabases(HISTORY.rows)
  assert.deepEqual(rows[0], HISTORY.rows[0])
  assert.equal(
    withDatabases([{ kind: 'backup', version: 4, sha: 'x', auto: 'pre-restore', database: null }])[0].auto,
    'pre-restore'
  )
  assert.equal(withDatabases([{ kind: 'backup', version: 4, sha: 'x', auto: 'whatever' }])[0].auto, undefined)
})

test(
  'GET /backups: each backup says what it holds; a host that predates backups reads unknown-host',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const { fetchImpl } = fakeHost({ 'webroot-history': HISTORY })
    const { cookieFor, send } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const body = await (await send('GET', `/api/sites/${SITE}/backups`, owner)).json()
    assert.deepEqual(
      body.rows.filter((r) => r.kind === 'backup').map((r) => [r.version, r.database.state]),
      [
        [3, 'full'],
        [2, 'none'],
        [1, 'missing']
      ]
    )
    assert.equal(body.rows[1].kind, 'moment')
    assert.ok(
      !JSON.stringify(body).includes('"ok":true,"reason"'),
      'the host’s raw database object is not passed on'
    )

    const old = { ...HISTORY, rows: HISTORY.rows.map(({ database: _d, ...r }) => r) }
    const oldHost = harness(pool, fakeHost({ 'webroot-history': old }).fetchImpl)
    const oldBody = await (await oldHost.send('GET', `/api/sites/${SITE}/backups`, owner)).json()
    assert.ok(
      oldBody.rows.filter((r) => r.kind === 'backup').every((r) => r.database.state === 'unknown-host')
    )
  }
)

test(
  'GET /backups: says what THIS seat may restore, by the toolsets /restore refuses with (QA-I14)',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    await seat(pool, 'editor@x.y', 'editor')
    await seat(pool, 'viewer@x.y', 'viewer')
    const { cookieFor, send } = harness(pool, fakeHost({ 'webroot-history': HISTORY }).fetchImpl)
    const may = async (who) =>
      (await (await send('GET', `/api/sites/${SITE}/backups`, await cookieFor(who))).json()).may
    // ADR 0028: an editor restores like an owner; a viewer reads the backups and restores nothing.
    // `export` (download a backup) is the Owner's alone; the default door is on.
    assert.deepEqual(await may('owner@x.y'), { restoreFiles: true, restoreEverything: true, export: true })
    assert.deepEqual(await may('editor@x.y'), { restoreFiles: true, restoreEverything: true, export: false })
    assert.deepEqual(await may('viewer@x.y'), {
      restoreFiles: false,
      restoreEverything: false,
      export: false
    })
  }
)

test('POST /backup: a viewer reads backups but makes none (ADR 0028)', opts, async () => {
  const { pool } = db
  await site(pool)
  await seat(pool, 'viewer@x.y', 'viewer')
  const host = fakeHost({ 'webroot-backup': { ok: true, version: 4, title: 'x', fleetSha: sha('4') } })
  const { cookieFor, send } = harness(pool, host.fetchImpl)
  const res = await send('POST', `/api/sites/${SITE}/backup`, await cookieFor('viewer@x.y'), { title: 'x' })
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'FORBIDDEN_WRITE', role: 'viewer' })
  assert.equal(host.calls.length, 0, 'the host was never asked')
})

test('POST /backup: the answer says what the new backup holds, and nothing of a ledger', opts, async () => {
  const { pool } = db
  await site(pool)
  const made = {
    ok: true,
    version: 4,
    title: 'Before launch',
    fleetSha: sha('4')
  }
  const owner = 'owner@x.y'
  for (const [answer, state] of [
    [{ ...made, database: { engine: 'mariadb', bytes: 5, sha256: DB3, ok: true } }, 'full'],
    [made, 'unknown-host']
  ]) {
    const { cookieFor, send } = harness(pool, fakeHost({ 'webroot-backup': answer }).fetchImpl)
    const res = await send('POST', `/api/sites/${SITE}/backup`, await cookieFor(owner), {
      title: 'Before launch'
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.version, 4)
    assert.equal(body.database.state, state)
    assert.deepEqual(Object.keys(body).sort(), ['database', 'ok', 'sha', 'title', 'version'])
  }
})

// ── Restore everything: the gate ─────────────────────────────────────────────────────────────

test(
  'restore everything: the gate — site toolset, the word Restore, a FULL backup — before anything runs',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    await seat(pool, 'viewer@x.y', 'viewer')
    const host = fakeHost({ 'webroot-history': HISTORY })
    const { cookieFor, send } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const ask = async (who, body) => {
      const res = await send('POST', `/api/sites/${SITE}/restore`, who, body)
      return { status: res.status, body: await res.json() }
    }
    for (const who of ['viewer@x.y']) {
      const { status, body } = await ask(await cookieFor(who), press())
      assert.equal(status, 403, who)
      assert.equal(body.code, 'FORBIDDEN_WRITE')
      assert.equal(body.toolset, 'site')
    }
    // The confirmation is the word "Restore" (Brian 03/10, as My Sites' delete): nothing typed, or
    // another word, is refused here — the dialog's own check is not trusted.
    assert.deepEqual(await ask(owner, press({ confirm: undefined })), {
      status: 400,
      body: { code: 'CONFIRM_REQUIRED' }
    })
    assert.deepEqual(await ask(owner, press({ confirm: 'restor' })), {
      status: 400,
      body: { code: 'CONFIRM_MISMATCH' }
    })
    // The site address is no longer the confirmation (replaced 03/10, no alias).
    assert.deepEqual(await ask(owner, press({ confirm: undefined, confirmSiteKey: SITE })), {
      status: 400,
      body: { code: 'CONFIRM_REQUIRED' }
    })
    assert.deepEqual(await ask(owner, press({ version: 'v3' })), {
      status: 400,
      body: { code: 'INVALID_VERSION' }
    })
    assert.equal(host.calls.length, 0, 'no refusal above reached the host')

    assert.deepEqual(await ask(owner, press({ version: 2 })), {
      status: 409,
      body: { code: 'BACKUP_NOT_FULL', version: 2, database: 'none' }
    })
    assert.deepEqual(await ask(owner, press({ version: 1 })), {
      status: 409,
      body: { code: 'BACKUP_NOT_FULL', version: 1, database: 'missing' }
    })
    assert.deepEqual(await ask(owner, press({ version: 8 })), {
      status: 404,
      body: { code: 'BACKUP_UNKNOWN', version: 8 }
    })
    assert.deepEqual(
      host.calls.map((c) => c.kind),
      ['webroot-history', 'webroot-history', 'webroot-history'],
      'only the history was read: no restore ran'
    )
    assert.equal((await operations(pool)).length, 0)
    // An older host: nothing it says proves a database.
    const old = harness(
      pool,
      fakeHost({ 'webroot-history': { ...HISTORY, rows: [{ ...HISTORY.rows[2], database: undefined }] } })
        .fetchImpl
    )
    const legacy = await old.send('POST', `/api/sites/${SITE}/restore`, owner, press())
    assert.equal(legacy.status, 409)
    assert.equal((await legacy.json()).database, 'unknown-host')
  }
)

test(
  'restore everything: a renamed site is confirmed by the word Restore, never by its name or key (03/10/2026)',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    // Settings › Site URL changed the name; the key stays. The confirmation does not depend on
    // either any more (#818 accepted the new name; the word replaced both, Brian 03/10).
    await pool.query('update site set primary_name=$2 where site_key=$1', [SITE, 'lantern-new.localhost'])
    const host = fakeHost({ 'webroot-history': HISTORY })
    const { cookieFor, send } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const ask = async (body) => {
      const res = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ version: 2, ...body }))
      return { status: res.status, body: await res.json() }
    }
    // Past the confirmation, stopped by the next gate (backup 2 holds no database).
    assert.deepEqual(await ask({ confirm: 'Restore' }), {
      status: 409,
      body: { code: 'BACKUP_NOT_FULL', version: 2, database: 'none' }
    })
    for (const typed of ['lantern-new.localhost', SITE])
      assert.deepEqual(
        await ask({ confirm: typed }),
        { status: 400, body: { code: 'CONFIRM_MISMATCH' } },
        typed
      )
  }
)

// ── Restore everything: the run ──────────────────────────────────────────────────────────────

test(
  'restore everything: pending row, the host job, verified database and commit → succeeded; audit; one event in Site changes',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const host = fakeHost({
      'webroot-history': HISTORY,
      'webroot-restore-everything': EVERYTHING_OK,
      'webroot-commit': RESTORE_COMMIT
    })
    const { cookieFor, send } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const res = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ idemKey: 'press-0001' }))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(
      { ...body, operationId: typeof body.operationId },
      { ok: true, files: 2, head: HEAD, version: 3, operationId: 'string', status: 'succeeded' }
    )
    const job = host.calls.find((c) => c.kind === 'webroot-restore-everything')
    assert.deepEqual(job, {
      kind: 'webroot-restore-everything',
      version: 3,
      sha: S3,
      byEmail: 'owner@x.y',
      label: 'lantern'
    })
    const [op] = await operations(pool)
    assert.equal(op.action, 'restore-everything')
    assert.equal(op.target_sha, S3)
    assert.equal(op.resulting_sha, HEAD)
    assert.equal(op.actor_email, 'owner@x.y')
    // The Before-restore backup the host answered with is kept on the row: the restore's return point.
    // The backup's title too, for the team's notification when the operation settles later (T12).
    assert.deepEqual(op.scope, {
      version: 3,
      database: { engine: 'mariadb', sha256: DB3, size: 1_880_000 },
      title: 'Backup 3',
      beforeRestore: 7
    })
    const audit = (await pool.query(`select detail from audit where action = 'site.restore'`)).rows
    assert.deepEqual(audit[0].detail, {
      mode: 'everything',
      version: 3,
      sha: S3,
      head: HEAD,
      operationId: op.id
    })

    // Site changes V2: one Site changes event, described as restoring everything to Backup 3.
    const activity = await (await send('GET', `/api/sites/${SITE}/activity?version=2`, owner)).json()
    const events = activity.items.filter((i) => i.origin.source === 'site-changes')
    assert.equal(events.length, 1)
    assert.deepEqual(events[0].description, {
      key: 'site-changes.restore-everything',
      params: { target: S3.slice(0, 7), version: 3, files: 2, returnPoint: 7 },
      isRequestOnly: false
    })

    // The same press again (a retry): the same operation, no second job.
    const again = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ idemKey: 'press-0001' }))
    assert.equal(again.status, 200)
    assert.equal((await again.json()).operationId, op.id)
    assert.equal(host.calls.filter((c) => c.kind === 'webroot-restore-everything').length, 1)
    // The key, reused for another backup, is refused.
    const other = await send(
      'POST',
      `/api/sites/${SITE}/restore`,
      owner,
      press({ idemKey: 'press-0001', version: 2 })
    )
    assert.equal(other.status, 409)
    assert.equal((await other.json()).code, 'IDEMPOTENCY_KEY_REUSED')
  }
)

test(
  'restore everything with the files already the backup’s: the database moved, so it succeeds — no commit claimed, still one event',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const host = fakeHost({
      'webroot-history': HISTORY,
      'webroot-restore-everything': { ...EVERYTHING_OK, files: 0, head: sha('7') }
    })
    const { cookieFor, send } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const body = await (
      await send('POST', `/api/sites/${SITE}/restore`, owner, press({ confirm: '  Restore ' }))
    ).json()
    assert.equal(body.status, 'succeeded')
    const [op] = await operations(pool)
    assert.equal(op.resulting_sha, null, 'the old head is never claimed')
    const activity = await (await send('GET', `/api/sites/${SITE}/activity?version=2`, owner)).json()
    const event = activity.items.find((i) => i.kind === 'operation')
    assert.equal(event.description.params.files, 0)
    assert.equal(event.evidence.commitSha, undefined)
  }
)

test(
  'restore everything: what the host cannot prove is unknown; what it refuses is failed — and a retry answers the same',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    const cases = [
      // The database it loaded is not the one the backup declared.
      [
        { ...EVERYTHING_OK, database: { restored: true, sha256: 'c'.repeat(64) } },
        202,
        'unknown',
        'DATABASE_UNVERIFIED'
      ],
      [{ ...EVERYTHING_OK, database: undefined }, 202, 'unknown', 'DATABASE_UNVERIFIED'],
      // The head is not this restore's commit.
      [EVERYTHING_OK, 202, 'unknown', 'HEAD_NOT_RESTORE', { ...RESTORE_COMMIT, subject: 'agent: something' }],
      [{ ok: false, code: 'DATABASE_MISSING' }, 409, 'failed', 'DATABASE_MISSING']
    ]
    let n = 0
    for (const [answer, status, state, error, commit = RESTORE_COMMIT] of cases) {
      await db.reset()
      await site(pool)
      const host = fakeHost({
        'webroot-history': HISTORY,
        'webroot-restore-everything': answer,
        'webroot-commit': commit
      })
      const { cookieFor, send } = harness(pool, host.fetchImpl)
      const owner = await cookieFor('owner@x.y')
      const idemKey = `press-case-${++n}`
      const res = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ idemKey }))
      assert.equal(res.status, status, error)
      const body = await res.json()
      assert.equal(body.status, state, error)
      if (status === 409) assert.deepEqual([body.code, body.reason], ['RESTORE_REFUSED', error])
      const [op] = await operations(pool)
      assert.deepEqual([op.status, op.error, op.resulting_sha], [state, error, null], error)
      const replay = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ idemKey }))
      assert.equal(replay.status, status, `${error} replay`)
      assert.equal(
        host.calls.filter((c) => c.kind === 'webroot-restore-everything').length,
        1,
        `${error}: ran once`
      )
    }
  }
)

test(
  'restore everything: the answer lost (timeout) is unknown, then settled from the job — never run twice',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    let skew = 0
    let finished = false
    const host = fakeHost(
      {
        'webroot-history': HISTORY,
        'webroot-restore-everything': EVERYTHING_OK,
        'webroot-commit': RESTORE_COMMIT
      },
      {
        // The host is still working on the first poll; the door's clock jumps past its deadline.
        'webroot-restore-everything': () => {
          if (finished) return 'done'
          skew = 200_000
          return 'running'
        }
      }
    )
    const { cookieFor, send } = harness(pool, host.fetchImpl, () => Date.now() + skew)
    const owner = await cookieFor('owner@x.y')
    const first = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ idemKey: 'press-lost' }))
    assert.equal(first.status, 502)
    const lost = await first.json()
    assert.deepEqual([lost.code, lost.status], ['FLEET_JOB_FAILED', 'unknown'])
    assert.equal((await operations(pool))[0].error, 'TIMEOUT')

    // The host finished. The same press is answered from the job: succeeded, and nothing re-ran.
    finished = true
    skew = 0
    const settled = await send('POST', `/api/sites/${SITE}/restore`, owner, press({ idemKey: 'press-lost' }))
    assert.equal(settled.status, 200)
    assert.equal((await settled.json()).status, 'succeeded')
    assert.equal(host.calls.filter((c) => c.kind === 'webroot-restore-everything').length, 1)
    assert.equal((await operations(pool))[0].resulting_sha, HEAD)
  }
)

test(
  'undo and reset are unchanged: no confirmation word, no history read, the code toolset',
  opts,
  async () => {
    const { pool } = db
    await site(pool)
    await seat(pool, 'dev@x.y', 'editor')
    await seat(pool, 'viewer@x.y', 'viewer')
    const host = fakeHost({
      'webroot-restore-reset': { ok: true, files: 1, head: HEAD },
      'webroot-commit': RESTORE_COMMIT
    })
    const { cookieFor, send } = harness(pool, host.fetchImpl)
    // A viewer holds no `code`: refused before the host is asked anything.
    const refused = await send('POST', `/api/sites/${SITE}/restore`, await cookieFor('viewer@x.y'), {
      mode: 'reset',
      sha: S3
    })
    assert.equal(refused.status, 403)
    assert.deepEqual(await refused.json(), { code: 'FORBIDDEN_WRITE', toolset: 'code', role: 'viewer' })
    assert.equal(host.calls.length, 0)
    const res = await send('POST', `/api/sites/${SITE}/restore`, await cookieFor('dev@x.y'), {
      mode: 'reset',
      sha: S3
    })
    assert.equal(res.status, 200)
    assert.ok(!host.calls.some((c) => c.kind === 'webroot-history'))
    assert.equal((await operations(pool))[0].action, 'reset')
  }
)
