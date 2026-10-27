// Site changes V2 — undo/restore operations (contract §2 049, §3, D2, D3, §5; plan L2.4, L2.8, A06,
// A25–A28). The restore door, the undo-scope door, reconcile and the one-off audit backfill, run
// against a REAL webroot Git: the fake `tracy-host` below executes the fleet's own `webroot-git.sh`
// on a throwaway stack for every job, so "is HEAD a restore commit" is answered by Git, not a stub.
//
// The harness can cut the door's view of a job (`host.cut = true`): the script has already run and
// committed, but every poll answers 503 and the clock jumps past the door's deadline — the
// "answer lost after the host finished" case (L2.4). Local only; nothing here touches a stand.
//
// TODO(integration, P2 projection): A25's "C1 is not marked undone" and A27's "one event, count once,
// stable cursor" are projection behaviour (activity.js). Here they are proven at the data level: the
// operation names C2 only, and one site+resulting_sha identity exists. The UI/projection half is for
// the integration round once P2's projection reads `site_operation`.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import {
  backfillFromAudit,
  createOperation,
  finishOperation,
  inspectCommit,
  isRestoreCommit,
  commitFacts,
  reconcilePending,
  resetReconcileThrottle,
  scopeOfCommit,
  settlementOf
} from '../src/sites/operations.js'
import { jobById, putJob, updateJob } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(async () => {
  await db.reset()
  resetReconcileThrottle()
})
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const here = dirname(fileURLToPath(import.meta.url))
const GIT_SCRIPT = join(
  here,
  '..',
  '..',
  '..',
  'packages',
  'fleet',
  'tracy-fleet-operation',
  'scripts',
  'webroot',
  'webroot-git.sh'
)
const LABEL = 'lantern'
const SITE = 'lantern.localhost'

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

// ── a real webroot Git ─────────────────────────────────────────────────────────────────────────

function stack() {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-ops-'))
  const webroot = join(srv, LABEL, '.webroot')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  mkdirSync(join(webroot, 'wp-content', 'themes', 'tracy'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 0 }\n')
  writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', 'x.css'), 'x { }\n')
  writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', 'y.css'), 'y { }\n')
  const scriptEnv = {
    ...process.env,
    TRACY_SRV: srv,
    TRACY_SITES_ROOT: srv,
    TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  /** The script as the host hook runs it: stdout + stderr folded, exit status kept. */
  const script = (args) => {
    const r = spawnSync('bash', [GIT_SCRIPT, '--label', LABEL, ...args], { env: scriptEnv, encoding: 'utf8' })
    return { status: r.status, output: `${r.stderr ?? ''}${r.stdout ?? ''}` }
  }
  const json = (args) => {
    const r = script(args)
    assert.equal(r.status, 0, r.output)
    return JSON.parse(r.output.trim().split('\n').at(-1))
  }
  const git = (...args) =>
    execFileSync(
      'git',
      ['--git-dir', join(srv, LABEL, 'webroot-baseline.git'), '--work-tree', webroot, ...args],
      {
        encoding: 'utf8',
        env: scriptEnv
      }
    )
  json(['--op', 'ensure'])
  const write = (rel, text) => {
    mkdirSync(dirname(join(webroot, rel)), { recursive: true })
    writeFileSync(join(webroot, rel), text)
  }
  const read = (rel) => (existsSync(join(webroot, rel)) ? readFileSync(join(webroot, rel), 'utf8') : null)
  const moment = (title, turn) =>
    json(['--op', 'moment', '--title', title, ...(turn ? ['--turn', turn] : [])])
  return {
    srv,
    webroot,
    script,
    json,
    git,
    write,
    read,
    moment,
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

const KIND_OP = {
  'webroot-commit': 'commit',
  'webroot-restore-undo': 'restore-undo',
  'webroot-restore-reset': 'restore-reset'
}

/** A fake tracy-host whose jobs run the real script. `cut`: polls of a restore job answer 503 and
 * push the clock past the door's deadline. */
function fakeHost(s, clock) {
  const host = { jobs: new Map(), seq: 0, cut: false, runs: { restore: 0, commit: 0 }, oldHost: false }
  const run = (body) => {
    const op = KIND_OP[body.kind]
    if (!op) return { state: 'failed', output: `unknown kind ${body.kind}` }
    if (op.startsWith('restore')) host.runs.restore++
    else host.runs.commit++
    const r = s.script(['--op', op, '--sha', body.sha])
    let output = r.output
    if (host.oldHost && op === 'commit' && r.status === 0) {
      // A host from before the commit reader named author/subject/total.
      const data = JSON.parse(output.trim().split('\n').at(-1))
      delete data.author
      delete data.subject
      delete data.total
      delete data.parent
      output = JSON.stringify(data)
    }
    return { state: r.status === 0 ? 'done' : 'failed', output }
  }
  host.fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    if (u.pathname === '/_host/site') {
      const body = JSON.parse(init.body)
      const id = `job-${++host.seq}`
      host.jobs.set(id, { kind: body.kind, ...run(body) })
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      const job = host.jobs.get(u.pathname.slice('/_host/jobs/'.length))
      if (!job) return new Response(JSON.stringify({ code: 'JOB_UNKNOWN' }), { status: 404 })
      if (host.cut && job.kind.startsWith('webroot-restore')) {
        clock.skew += 10 * 60_000
        return new Response('{}', { status: 503 })
      }
      return new Response(JSON.stringify({ state: job.state, output: job.output }), { status: 200 })
    }
    return new Response(null, { status: 404 })
  }
  /** `runSiteJob`'s shape, for calling operations.js directly (reconcile, backfill). */
  host.runJob = async (_site, input) => {
    const out = run(input)
    return out.state === 'done'
      ? { ok: true, output: out.output }
      : { ok: false, reason: out.output.trim().slice(0, 200) }
  }
  host.pollJob = async (_site, id) => {
    const res = await host.fetchImpl(`http://tracy-host.test/_host/jobs/${id}`, {})
    return { ok: res.ok, body: res.ok ? await res.json() : null }
  }
  return host
}

async function world(pool) {
  const s = stack()
  const clock = { skew: 0 }
  const host = fakeHost(s, clock)
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl: host.fetchImpl,
    now: () => Date.now() + clock.skew
  })
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, LABEL, 'local'])
  const seat = async (email, role) => {
    const { rows } = await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [SITE, rows[0].id, role]
    )
    return `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  }
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  const siteRow = async () => (await pool.query('select * from site where site_key = $1', [SITE])).rows[0]
  return { s, host, clock, seat, send, siteRow }
}

const ops = async (pool) => (await pool.query('select * from site_operation order by created_at, id')).rows
const restoreAudits = async (pool) =>
  (await pool.query("select actor, detail from audit where action = 'site.restore' order by id")).rows

// ── L2.4 / A06 ─────────────────────────────────────────────────────────────────────────────────

test(
  'A06: a retry with the same idemKey answers the same operation; the undo runs once, one success',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const turn = w.s.moment('Use brown', 'session-a1:1')
      const press = { sha: turn.head.slice(0, 7), mode: 'undo', idemKey: 'press-0001-abcdef' }
      const first = await w.send('POST', `/api/sites/${SITE}/restore`, owner, press)
      assert.equal(first.status, 200)
      const a = await first.json()
      assert.equal(a.status, 'succeeded')
      assert.equal(a.ok, true)
      assert.equal(a.files, 1)
      const head = w.s.git('rev-parse', 'HEAD').trim()
      assert.equal(a.head, head)

      const again = await w.send('POST', `/api/sites/${SITE}/restore`, owner, press)
      assert.equal(again.status, 200)
      const b = await again.json()
      assert.deepEqual(b, a, 'the replay answers exactly what the first press answered')
      assert.equal(w.host.runs.restore, 1, 'the restore ran once')
      assert.equal(w.s.git('rev-parse', 'HEAD').trim(), head, 'no second commit')

      const rows = await ops(pool)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].status, 'succeeded')
      assert.equal(rows[0].resulting_sha, head)
      assert.equal(rows[0].target_sha, turn.head, 'the target is stored full, though the press sent 7 chars')
      assert.equal(rows[0].actor_email, 'owner@x.y')
      assert.deepEqual(rows[0].scope, { files: 1, complete: true, truncatedList: false })
      assert.ok(rows[0].job_id)
      assert.equal((await restoreAudits(pool)).length, 1, 'one audit line, as before')

      // The same key for another press is refused, and runs nothing.
      const reused = await w.send('POST', `/api/sites/${SITE}/restore`, owner, { ...press, mode: 'reset' })
      assert.equal(reused.status, 409)
      assert.deepEqual(await reused.json(), { code: 'IDEMPOTENCY_KEY_REUSED' })
      assert.equal(w.host.runs.restore, 1)

      // A malformed key is refused; no key at all still gets an operation row (older client).
      const bad = await w.send('POST', `/api/sites/${SITE}/restore`, owner, { ...press, idemKey: 'x' })
      assert.equal(bad.status, 400)
      assert.deepEqual(await bad.json(), { code: 'INVALID_IDEM_KEY' })
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'L2.4: answer lost after the host committed → unknown (no audit, no success); the retry reconciles through the job without a second undo',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const turn = w.s.moment('Use brown', 'session-a1:1')
      const press = { sha: turn.head, mode: 'undo', idemKey: 'press-0002-abcdef' }
      w.host.cut = true
      const lost = await w.send('POST', `/api/sites/${SITE}/restore`, owner, press)
      assert.equal(lost.status, 502)
      const body = await lost.json()
      assert.equal(body.code, 'FLEET_JOB_FAILED')
      assert.equal(body.reason, 'timeout')
      assert.equal(body.status, 'unknown')
      // The host DID undo: Git has the restore commit, Postgres has no success for it yet.
      const head = w.s.git('rev-parse', 'HEAD').trim()
      assert.match(w.s.git('log', '-1', '--format=%ae %s').trim(), /^fleet@tracy\.ai restore: undo /)
      let [row] = await ops(pool)
      assert.equal(row.status, 'unknown')
      assert.equal(row.resulting_sha, null)
      assert.equal(row.error, 'TIMEOUT')
      assert.equal((await restoreAudits(pool)).length, 0)

      w.host.cut = false
      const retry = await w.send('POST', `/api/sites/${SITE}/restore`, owner, press)
      assert.equal(retry.status, 200)
      const settled = await retry.json()
      assert.equal(settled.status, 'succeeded')
      assert.equal(settled.operationId, body.operationId)
      assert.equal(settled.head, head)
      assert.equal(w.host.runs.restore, 1, 'reconciled, not re-run')
      ;[row] = await ops(pool)
      assert.equal(row.status, 'succeeded')
      assert.equal(row.resulting_sha, head)
      assert.equal((await ops(pool)).length, 1)
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'L2.4: reconcilePending settles a lost answer from the job row (no key, older client); bounded, idempotent, never re-runs',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const turn = w.s.moment('Use brown', 'session-a1:1')
      w.host.cut = true
      const lost = await w.send('POST', `/api/sites/${SITE}/restore`, owner, { sha: turn.head, mode: 'undo' })
      assert.equal(lost.status, 502)
      assert.equal((await ops(pool))[0].status, 'unknown')
      w.host.cut = false
      const site = await w.siteRow()
      const deps = { runJob: w.host.runJob, pollJob: w.host.pollJob }
      const first = await reconcilePending(pool, site, deps)
      assert.equal(first.settled.length, 1)
      assert.equal(first.settled[0].status, 'succeeded')
      const head = w.s.git('rev-parse', 'HEAD').trim()
      assert.equal((await ops(pool))[0].resulting_sha, head)
      resetReconcileThrottle()
      const second = await reconcilePending(pool, site, deps)
      assert.deepEqual(second, { checked: 0, settled: [] }, 'a settled row is not looked at again')
      assert.equal(w.host.runs.restore, 1)
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'reconcile: a pending row inside the door window is left to the door; one past it with no job turns unknown/NO_JOB and is final',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const site = await w.siteRow()
      // The door window is judged against created_at, which PostgreSQL stamps on ITS clock, so the
      // reconcile is handed that same clock: comparing it with Node's Date.now() made the test depend
      // on the two clocks agreeing (red under the CI step that moves Date.now() 400 days ahead).
      const dbNow = async () =>
        Number((await pool.query('select extract(epoch from clock_timestamp()) * 1000 as ms')).rows[0].ms)
      const deps = { runJob: w.host.runJob, pollJob: w.host.pollJob }
      const onDbClock = async () => {
        const at = await dbNow()
        return { ...deps, now: () => at }
      }
      const { operation: fresh } = await createOperation(pool, {
        siteKey: SITE,
        action: 'undo',
        targetSha: 'abcdef1',
        actorEmail: 'a@x.y'
      })
      assert.deepEqual(await reconcilePending(pool, site, await onDbClock()), { checked: 0, settled: [] })
      await pool.query("update site_operation set created_at = now() - interval '10 minutes' where id = $1", [
        fresh.id
      ])
      const out = await reconcilePending(pool, site, await onDbClock())
      assert.deepEqual(out.settled, [{ id: fresh.id, status: 'unknown' }])
      resetReconcileThrottle()
      assert.equal(
        (await reconcilePending(pool, site, await onDbClock())).checked,
        0,
        'NO_JOB is final, not retried on every look'
      )
      assert.equal(w.host.runs.restore, 0)
    } finally {
      w.s.dispose()
    }
  }
)

// ── A25 + scope: two commits in one turn; >500 files; excluded files ────────────────────────────

test(
  'A25: one turn, C1 touches X and C2 touches Y — undo-scope of C2 is Y only; undoing C2 keeps X and names only C2',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/x.css', 'x { color: red }\n')
      const c1 = w.s.moment('Part one', 'session-a1:7')
      w.s.write('wp-content/themes/tracy/y.css', 'y { color: blue }\n')
      const c2 = w.s.moment('Part two', 'session-a1:7')
      assert.notEqual(c1.head, c2.head)

      const scope = await w.send('GET', `/api/sites/${SITE}/moments/${c2.head}/undo-scope`, owner)
      assert.equal(scope.status, 200)
      assert.deepEqual(await scope.json(), { files: 1, complete: true, truncatedList: false })

      const undo = await w.send('POST', `/api/sites/${SITE}/restore`, owner, {
        sha: c2.head,
        mode: 'undo',
        idemKey: 'a25-undo-c2-0001'
      })
      assert.equal(undo.status, 200)
      assert.equal((await undo.json()).status, 'succeeded')
      assert.equal(w.s.read('wp-content/themes/tracy/x.css'), 'x { color: red }\n', 'C1 change stays')
      assert.equal(w.s.read('wp-content/themes/tracy/y.css'), 'y { }\n', 'C2 change reverted')
      const rows = await ops(pool)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].target_sha, c2.head)
      assert.equal(
        rows.some((r) => r.target_sha === c1.head),
        false,
        'no operation names C1'
      )
      // The restore commit names C2's short sha and nothing of C1.
      const subject = w.s.git('log', '-1', '--format=%s', rows[0].resulting_sha).trim()
      assert.match(subject, new RegExp(`^restore: undo ${c2.head.slice(0, 7)}`))
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'undo-scope past 500 files and with excluded files counts what restore_undo reverts; an older host says complete:false',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      for (let i = 1; i <= 501; i++) w.s.write(`wp-content/uploads/bulk/f${i}.txt`, `${i}\n`)
      const bulk = w.s.moment('Bulk')
      const big = await w.send('GET', `/api/sites/${SITE}/moments/${bulk.head}/undo-scope`, owner)
      assert.deepEqual(await big.json(), { files: 501, complete: true, truncatedList: true })

      // An older moment that swallowed an internal file (Q4): hidden from the list's count, but the
      // undo reverts it too — the scope says 2, as the undo will.
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: teal }\n')
      w.s.write('tracy-changed.json', '{"at":1}\n')
      w.s.git('add', '-f', '--', 'wp-content/themes/tracy/style.css', 'tracy-changed.json')
      w.s.git(
        '-c',
        'user.name=Agent',
        '-c',
        'user.email=agent@tracy.ai',
        'commit',
        '-q',
        '-m',
        'agent: with cache'
      )
      const mixed = w.s.git('rev-parse', 'HEAD').trim()
      const scope = await (
        await w.send('GET', `/api/sites/${SITE}/moments/${mixed}/undo-scope`, owner)
      ).json()
      assert.deepEqual(scope, { files: 2, complete: true, truncatedList: false })
      const done = await (
        await w.send('POST', `/api/sites/${SITE}/restore`, owner, {
          sha: mixed,
          mode: 'undo',
          idemKey: 'scope-mixed-0001'
        })
      ).json()
      assert.equal(done.files, scope.files, 'the dialog count is the undo count')

      // Older host: no total → a 500-file page is a lower bound.
      w.host.oldHost = true
      const old = await (
        await w.send('GET', `/api/sites/${SITE}/moments/${bulk.head}/undo-scope`, owner)
      ).json()
      assert.deepEqual(old, { files: 500, complete: false, truncatedList: true })

      // Permission: same as /moments — a stranger is refused.
      const stranger = await w.send(
        'GET',
        `/api/sites/${SITE}/moments/${bulk.head}/undo-scope`,
        'tracy_sess=nope'
      )
      assert.ok(stranger.status === 401 || stranger.status === 403, String(stranger.status))
      const badSha = await w.send('GET', `/api/sites/${SITE}/moments/zz/undo-scope`, owner)
      assert.equal(badSha.status, 400)
    } finally {
      w.s.dispose()
    }
  }
)

// ── A28 no-op, D2 shape, P0 #6 two commits ─────────────────────────────────────────────────────

test(
  'A28: a no-op restore claims no commit — no resulting_sha, the earlier operation keeps its identity',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const turn = w.s.moment('Use brown')
      const undo = await (
        await w.send('POST', `/api/sites/${SITE}/restore`, owner, {
          sha: turn.head,
          mode: 'undo',
          idemKey: 'a28-undo-00001'
        })
      ).json()
      assert.equal(undo.status, 'succeeded')
      const restoreHead = w.s.git('rev-parse', 'HEAD').trim()
      // Reset to where the site already is: nothing to change, the host answers files:0 + old HEAD.
      const noop = await w.send('POST', `/api/sites/${SITE}/restore`, owner, {
        sha: restoreHead,
        mode: 'reset',
        idemKey: 'a28-reset-0001'
      })
      assert.equal(noop.status, 200)
      const n = await noop.json()
      assert.equal(n.status, 'succeeded_noop')
      assert.equal(n.files, 0)
      assert.equal(w.s.git('rev-parse', 'HEAD').trim(), restoreHead, 'no new commit')
      const rows = await ops(pool)
      assert.deepEqual(
        rows.map((r) => [r.action, r.status, r.resulting_sha]),
        [
          ['undo', 'succeeded', restoreHead],
          ['reset', 'succeeded_noop', null]
        ]
      )
      assert.equal(
        rows.filter((r) => r.status === 'succeeded').length,
        1,
        'no success-with-change row for the no-op'
      )
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'D2/P0 #6: the head is verified by author + RAW subject; a seal or a chat moment titled "restore: undo …" is never the undo commit',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const site = await w.siteRow()
      const inspect = (sha) => inspectCommit(w.host.runJob, site, sha)
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const turn = w.s.moment('Use brown')
      const op = { action: 'undo', target_sha: turn.head }
      // A chat moment that spoofs the subject, as title_of() would show it.
      w.s.write('wp-content/themes/tracy/x.css', 'x { spoof }\n')
      const spoof = w.s.moment(`restore: undo ${turn.head.slice(0, 7)} (Use brown)`)
      assert.deepEqual(await settlementOf(op, { ok: true, files: 1, head: spoof.head }, inspect), {
        status: 'succeeded_noop',
        error: 'HEAD_NOT_RESTORE'
      })
      // One press, two commits: the seal made first, then the restore. Only the restore is claimed.
      w.s.write('wp-content/themes/tracy/y.css', 'y { pending }\n')
      const done = w.s.json(['--op', 'restore-undo', '--sha', spoof.head])
      const facts = commitFacts(
        JSON.parse(w.s.script(['--op', 'commit', '--sha', done.head]).output.trim().split('\n').at(-1))
      )
      assert.equal(facts.authorEmail, 'fleet@tracy.ai')
      const seal = facts.parent
      assert.match(w.s.git('log', '-1', '--format=%ae', seal).trim(), /^outside@tracy\.ai$/)
      const spoofOp = { action: 'undo', target_sha: spoof.head }
      assert.deepEqual(await settlementOf(spoofOp, { ok: true, files: 1, head: done.head }, inspect), {
        status: 'succeeded',
        resultingSha: done.head,
        error: null
      })
      // If the restore commit had failed (`|| true`), HEAD would be the seal: not claimed.
      assert.equal(
        (await settlementOf(spoofOp, { ok: true, files: 1, head: seal }, inspect)).status,
        'succeeded_noop'
      )
      // The right shape for another target is not this operation's commit.
      assert.equal(
        (await settlementOf(op, { ok: true, files: 1, head: done.head }, inspect)).status,
        'succeeded_noop'
      )
      // A reset op does not accept an undo commit.
      assert.equal(isRestoreCommit(facts, { action: 'reset', targetSha: spoof.head }), false)
      // An older host names no author/subject: unverifiable → unknown, never success.
      w.host.oldHost = true
      assert.deepEqual(await settlementOf(spoofOp, { ok: true, files: 1, head: done.head }, inspect), {
        status: 'unknown',
        error: 'UNVERIFIABLE_HOST'
      })
      // A head that does not exist.
      w.host.oldHost = false
      assert.deepEqual(await settlementOf(spoofOp, { ok: true, files: 1, head: 'f'.repeat(40) }, inspect), {
        status: 'unknown',
        error: 'HEAD_MISSING'
      })
      assert.deepEqual(scopeOfCommit({ files: [], truncated: false }), {
        files: 0,
        complete: true,
        truncatedList: false
      })
    } finally {
      w.s.dispose()
    }
  }
)

// ── A27: Git first, operation after — one identity ─────────────────────────────────────────────

test(
  'A27: the commit exists in Git before the row completes; after reconcile one site+resulting_sha identity holds the presser, a second claim is refused',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      await w.seat('owner@x.y', 'owner')
      const dev = await w.seat('dev@x.y', 'editor')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const turn = w.s.moment('Use brown')
      w.host.cut = true
      const lost = await (
        await w.send('POST', `/api/sites/${SITE}/restore`, dev, { sha: turn.head, mode: 'undo' })
      ).json()
      assert.equal(lost.status, 'unknown')
      const head = w.s.git('rev-parse', 'HEAD').trim()
      // Before reconcile: Git has the commit, no row claims it (the tab shows it as legacy, By Unknown).
      assert.equal(
        (await pool.query('select 1 from site_operation where resulting_sha = $1', [head])).rows.length,
        0
      )
      w.host.cut = false
      await reconcilePending(pool, await w.siteRow(), { runJob: w.host.runJob, pollJob: w.host.pollJob })
      const claimed = (await pool.query('select * from site_operation where resulting_sha = $1', [head])).rows
      assert.equal(claimed.length, 1)
      assert.equal(
        claimed[0].actor_email,
        'dev@x.y',
        'enriched with the person who pressed, not the owner, not "Tracy"'
      )

      // A second operation reaching the same commit (a stray completion) cannot become a second success.
      const { operation: other } = await createOperation(pool, {
        siteKey: SITE,
        action: 'undo',
        targetSha: turn.head,
        actorEmail: 'x@x.y'
      })
      const after = await finishOperation(pool, other.id, { status: 'succeeded', resultingSha: head })
      assert.equal(after.status, 'unknown')
      assert.equal(after.error, 'RESULT_CLAIMED')
      assert.equal(after.resulting_sha, null)
      // A backfill row for the same commit is not inserted either.
      const inserted = await pool.query(
        `insert into site_operation (site_key, action, status, resulting_sha, provenance, source_ref)
       values ($1, 'undo', 'succeeded', $2, 'backfill-audit', '999') on conflict do nothing returning id`,
        [SITE, head]
      )
      assert.equal(inserted.rows.length, 0)
    } finally {
      w.s.dispose()
    }
  }
)

// ── A26: backfill from audit ───────────────────────────────────────────────────────────────────

test(
  'A26: backfill writes an actor only where site + full head + mode + target match a real restore commit; reruns and restarts add no row',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const s = w.s
      // Real history on `lantern`: two undone moments, a reset, a spoof moment, a seal.
      s.write('wp-content/themes/tracy/x.css', 'x { 1 }\n')
      const t1 = s.moment('T1')
      const r1 = s.json(['--op', 'restore-undo', '--sha', t1.head]).head
      s.write('wp-content/themes/tracy/y.css', 'y { 2 }\n')
      const t2 = s.moment('T2')
      const r2 = s.json(['--op', 'restore-undo', '--sha', t2.head]).head
      s.write('wp-content/themes/tracy/style.css', 'body { 3 }\n')
      const t3 = s.moment('T3')
      const r3 = s.json(['--op', 'restore-reset', '--sha', t2.head]).head
      s.write('wp-content/themes/tracy/x.css', 'x { 4 }\n')
      const spoof = s.moment(`restore: undo ${t3.head.slice(0, 7)} (T3)`)
      s.write('wp-content/themes/tracy/x.css', 'x { outside }\n')
      s.json(['--op', 'seal-outside'])
      const seal = s.git('rev-parse', 'HEAD').trim()
      // A second site on another host whose Git has none of these commits.
      await pool.query(
        "insert into site (site_key, label, host) values ('other.localhost', 'other', 'local')"
      )
      const site = await w.siteRow()
      const inspect = (siteKey, sha) =>
        siteKey === SITE ? inspectCommit(w.host.runJob, site, sha) : Promise.resolve({ state: 'missing' })

      const audit = (actor, siteKey, detail) =>
        pool.query(
          "insert into audit (actor, action, site_key, detail) values ($1, 'site.restore', $2, $3::jsonb)",
          [actor, siteKey, detail === null ? null : JSON.stringify(detail)]
        )
      // complete: short target (P0 #4), full head
      await audit('alice@x.y', SITE, { mode: 'undo', sha: t1.head.slice(0, 7), head: r1 })
      // same target on another site, head unknown there
      await audit('bob@x.y', 'other.localhost', { mode: 'undo', sha: t1.head.slice(0, 7), head: r1 })
      // head null
      await audit('carol@x.y', SITE, { mode: 'undo', sha: t2.head, head: null })
      // two actors for one head
      await audit('dave@x.y', SITE, { mode: 'undo', sha: t2.head, head: r2 })
      await audit('erin@x.y', SITE, { mode: 'undo', sha: t2.head.slice(0, 9), head: r2 })
      // a reset with its real commit; and a no-op reset to the same target whose audit kept the OLD head
      await audit('frank@x.y', SITE, { mode: 'reset', sha: t2.head, head: r3 })
      await audit('gina@x.y', SITE, { mode: 'undo', sha: t3.head, head: r3 })
      // head is a chat moment that spoofs the subject; head is a seal
      await audit('hank@x.y', SITE, { mode: 'undo', sha: t3.head, head: spoof.head })
      await audit('ivy@x.y', SITE, { mode: 'undo', sha: t3.head, head: seal })
      // written by the V2 door: its live row exists
      await audit('jo@x.y', SITE, { mode: 'undo', sha: t3.head, head: seal, operationId: 'x' })
      // site deleted since
      await audit('kim@x.y', 'gone.localhost', { mode: 'undo', sha: t1.head, head: r1 })
      // ops_signal alone (moment only) is never enough
      await pool.query("insert into ops_signal (kind, site_key, data) values ('site.undo', $1, $2::jsonb)", [
        SITE,
        JSON.stringify({ moment: t3.head })
      ])

      const dry = await backfillFromAudit(pool, { inspect, batch: 3, dryRun: true })
      assert.equal(dry.written, 2)
      assert.equal((await ops(pool)).length, 0, 'dry run writes nothing')

      // A restart mid-batch: the host read throws on the 3rd group; the rerun completes.
      let calls = 0
      await assert.rejects(
        backfillFromAudit(pool, {
          inspect: (k, sha) => {
            if (++calls === 3) throw new Error('host went away')
            return inspect(k, sha)
          },
          batch: 3
        })
      )
      const partial = (await ops(pool)).length
      const t0 = Date.now()
      const full = await backfillFromAudit(pool, { inspect, batch: 3, sleep: async () => {} })
      const elapsed = Date.now() - t0
      assert.equal(full.scanned, 11)
      const rows = await ops(pool)
      assert.equal(rows.length, 2)
      assert.equal(full.written + partial, 2)
      assert.deepEqual(
        rows
          .map((r) => [r.actor_email, r.action, r.target_sha, r.resulting_sha, r.status, r.provenance])
          .sort(),
        [
          ['alice@x.y', 'undo', t1.head, r1, 'succeeded', 'backfill-audit'],
          ['frank@x.y', 'reset', t2.head, r3, 'succeeded', 'backfill-audit']
        ]
      )
      assert.ok(rows.every((r) => /^\d+$/.test(r.source_ref)))
      assert.deepEqual(full.skipped, {
        'live-door': 1,
        'no-head': 1,
        'head-missing': 1,
        'site-gone': 1,
        'conflicting-actors': 2,
        'not-this-commit': 1,
        'not-a-restore-commit': 2
      })
      // Second full run: nothing new.
      const again = await backfillFromAudit(pool, { inspect, batch: 3 })
      assert.equal(again.written, 0)
      assert.equal((await ops(pool)).length, 2)
      process.stdout.write(`# backfill: scanned ${full.scanned} audit rows in ${elapsed} ms\n`)
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'backfill: an older host (no author/subject) proves nothing — every row stays Unknown',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      w.s.write('wp-content/themes/tracy/x.css', 'x { 1 }\n')
      const t1 = w.s.moment('T1')
      const r1 = w.s.json(['--op', 'restore-undo', '--sha', t1.head]).head
      await pool.query(
        "insert into audit (actor, action, site_key, detail) values ('a@x.y', 'site.restore', $1, $2::jsonb)",
        [SITE, JSON.stringify({ mode: 'undo', sha: t1.head, head: r1 })]
      )
      w.host.oldHost = true
      const site = await w.siteRow()
      const out = await backfillFromAudit(pool, {
        inspect: (_k, sha) => inspectCommit(w.host.runJob, site, sha)
      })
      assert.equal(out.written, 0)
      assert.deepEqual(out.skipped, { 'unverifiable-host': 1 })
      assert.equal((await ops(pool)).length, 0)
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'job rows: putJob/updateJob keep the poll body the reconcile reads (`detail.output` is the job stdout)',
  opts,
  async () => {
    const { pool } = db
    await pool.query("insert into site (site_key, label, host) values ('a.localhost', 'a', 'local')")
    await putJob(pool, { id: 'j-1', siteKey: 'a.localhost', host: 'local', kind: 'webroot-restore-undo' })
    const detail = { state: 'done', output: 'x\n{"ok":true,"files":0,"head":"abc"}' }
    const job = await updateJob(pool, 'j-1', { state: 'done', detail })
    assert.deepEqual(job.detail, detail)
    // What the poll reads back later: the same body, the stdout whole.
    const polled = await jobById(pool, 'j-1')
    assert.equal(polled.state, 'done')
    assert.deepEqual(polled.detail, detail)
  }
)
