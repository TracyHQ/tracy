// Undo by chat turn — the two doors (`GET /api/sites/:key/turns`, `POST /api/sites/:key/turns/undo`)
// against Postgres and a REAL webroot Git: the fake `tracy-host` below runs the fleet's own
// `webroot-git.sh` (turn-moments, undo-check, restore-undo) on a throwaway stack, and a fake site
// component answers `apply.revert`. Plan `tasks/undo-change/plan.md` 1.5. Needs TEST_DATABASE_URL;
// without it every test here is skipped. The decisions themselves are tested without a database in
// `turn-undo.test.mjs`.
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
import { resetReconcileThrottle } from '../src/sites/operations.js'
import { writeComponent } from '../src/sites/store.js'
import { cssHash, lookCss } from '../../tracy-host/src/look-css.js'
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
  const srv = mkdtempSync(join(tmpdir(), 'tracy-turn-undo-'))
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
  'webroot-restore-reset': 'restore-reset',
  'webroot-turn-moments': 'turn-moments',
  'webroot-undo-check': 'undo-check'
}

/** The script's flags for one job body, as `apps/tracy-host/src/webroot.js` builds them. */
const flagsOf = (body) =>
  body.turns
    ? ['--turns', body.turns.join(',')]
    : body.shas
      ? ['--shas', body.shas.join(',')]
      : ['--sha', body.sha]

/** A fake tracy-host whose jobs run the real script. `cut`: polls of a restore job answer 503 and
 * push the clock past the door's deadline. */
function fakeHost(s, clock) {
  const host = {
    jobs: new Map(),
    seq: 0,
    cut: false,
    runs: { restore: 0, commit: 0 },
    oldHost: false,
    component: [],
    componentAnswer: () => ({ ok: true }),
    // The site's Additional CSS per theme, as the fake docker below plays WordPress's PHP.
    css: {},
    lookJobs: []
  }
  /** The real tracy-host `site-look-css` job, over a docker that plays `WP_CUSTOM_CSS_PHP`. */
  const docker = async (input) => {
    const q = JSON.parse(input.stdin)
    const now = host.css[q.stylesheet] ?? ''
    let answer
    if (q.mode === 'read') answer = { ok: true, stylesheet: q.stylesheet, css: now, block: true }
    else if (q.expect !== cssHash(now)) answer = { ok: false, conflict: true }
    else {
      host.css[q.stylesheet] = q.css
      answer = { ok: true, stylesheet: q.stylesheet, css: q.css }
    }
    return { code: 0, tail: [`TRACY_WP_CSS ${Buffer.from(JSON.stringify(answer)).toString('base64')}`] }
  }
  const lookJob = async (body) => {
    host.lookJobs.push(body.mode)
    try {
      const answer = await lookCss({ body, config: { sitesRoot: s.srv }, run: docker })
      return { state: 'done', output: JSON.stringify(answer) }
    } catch (error) {
      return { state: 'failed', output: String(error?.message ?? error) }
    }
  }
  const run = (body) => {
    const op = KIND_OP[body.kind]
    if (!op) return { state: 'failed', output: `unknown kind ${body.kind}` }
    if (op.startsWith('restore')) host.runs.restore++
    else host.runs.commit++
    const r = s.script(['--op', op, ...flagsOf(body)])
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
      host.jobs.set(id, {
        kind: body.kind,
        ...(body.kind === 'site-look-css' ? await lookJob(body) : run(body))
      })
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    if (u.host === 'component.test') {
      const call = JSON.parse(init.body)
      host.component.push(call)
      return new Response(JSON.stringify(host.componentAnswer(call)), { status: 200 })
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
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    SITE,
    LABEL,
    'local',
    'wordpress'
  ])
  await writeComponent(pool, SITE, { endpoint: 'http://component.test/door', token: 't0k' }, 'owner@x.y')
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
  /** `tracy-site-tools` reporting a write outside the Apply door, from the conversation's own site. */
  const changed = (cookie, turn, body) =>
    app.fetch(
      new Request('http://tracy.test/api/sites/_conversation/changed', {
        method: 'POST',
        headers: {
          cookie,
          'x-tracy-workspace-label': LABEL,
          'x-tracy-session': SESSION,
          'x-tracy-turn': turn,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    )
  return { s, host, clock, seat, send, siteRow, changed }
}

const SESSION = 'session-a1'

/** A closed turn row, as `POST /turn` + `/moment` leave it. */
async function closedTurn(pool, n, { files = 0, head = null, minutesAgo = 10 } = {}) {
  await pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, opened_at, closed_at, state, head_sha, files)
     values ($1, $2, $3, $4, 'owner@x.y', $5, now() - make_interval(mins => $6), now() - make_interval(mins => $6 - 1),
             'closed', $7, $8)`,
    [`${SESSION}:${n}`, SITE, SESSION, n, `Request ${n}`, minutesAgo, head, files]
  )
}

/** An Apply write of a turn: the audit row and its site_write row, one statement as the door writes them. */
async function applyWrite(pool, n, applyId, minutesAgo, { writeAction = 'content.update', target } = {}) {
  await pool.query(
    `with a as (insert into audit (actor, action, site_key, detail, at)
                values ('owner@x.y', 'content.update', $1, $2::jsonb, now() - make_interval(mins => $4)))
     insert into site_write (site_key, turn_id, session_id, actor, action, outcome, target, via, at)
     values ($1, $3, $5, 'owner@x.y', $6, 'ok', $7::jsonb, 'apply',
             now() - make_interval(mins => $4))`,
    [
      SITE,
      JSON.stringify({
        ok: true,
        apply_id: applyId,
        turnId: `${SESSION}:${n}`,
        sessionId: SESSION,
        writeClass: true
      }),
      `${SESSION}:${n}`,
      minutesAgo,
      SESSION,
      writeAction,
      JSON.stringify(target ?? { kind: 'post', id: '42' })
    ]
  )
}

test(
  'the latest turn: GET says Undo, POST undoes its files then its content, and GET then says undone',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const moment = w.s.moment('Use brown', `${SESSION}:1`)
      await closedTurn(pool, 1, { files: 1, head: moment.head, minutesAgo: 10 })
      await applyWrite(pool, 1, 'apply-0001', 9)

      const read = await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)
      assert.equal(read.status, 200)
      const view = await read.json()
      assert.equal(view.cms, 'wordpress')
      assert.equal(view.siteBusy, false)
      assert.equal(view.filesChecked, true)
      const [t1] = view.turns
      assert.equal(t1.changed, true)
      assert.deepEqual(t1.files, { count: 1, commits: [moment.head], zones: { design: 1 } })
      assert.equal(t1.content[0].applyId, 'apply-0001')
      assert.deepEqual(t1.undo, {
        state: 'available',
        latest: true,
        reasons: [],
        needs: { code: true, content: true }
      })

      const press = { session: SESSION, turnId: `${SESSION}:1`, scope: 'turn', idemKey: 'turn-undo-0001' }
      const done = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, press)
      assert.equal(done.status, 200)
      const result = await done.json()
      assert.equal(result.ok, true)
      assert.equal(result.complete, true)
      assert.equal(result.turns[0].files.status, 'undone')
      assert.deepEqual(result.turns[0].content, { reverted: ['apply-0001'], failed: [], unsure: [] })
      assert.equal(w.s.read('wp-content/themes/tracy/style.css'), 'body { margin: 0 }\n', 'the file is back')
      assert.deepEqual(
        w.host.component.map((call) => [call.action, call.params.apply_id]),
        [['apply.revert', 'apply-0001']]
      )
      const op = (await pool.query('select action, status from site_operation')).rows
      assert.deepEqual(op, [{ action: 'undo', status: 'succeeded' }])

      const again = await (await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)).json()
      assert.equal(again.turns[0].undo.state, 'undone')

      // A retry of the same press answers the recorded result and runs nothing.
      const runs = w.host.runs.restore
      const replay = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, press)
      assert.equal(replay.status, 200)
      assert.deepEqual(await replay.json(), result)
      assert.equal(w.host.runs.restore, runs)
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'a turn whose apply CREATED a row offers Undo and POST reverts it by its apply id (#1259)',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      await closedTurn(pool, 1, { files: 0, head: null, minutesAgo: 10 })
      // As `recordApply` leaves it: audit keeps content.update, site_write says content.create.
      await applyWrite(pool, 1, 'apply-create-1', 9, {
        writeAction: 'content.create',
        target: { kind: 'page', id: '77' }
      })
      const read = await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)
      assert.equal(read.status, 200)
      const [t1] = (await read.json()).turns
      assert.equal(t1.undo.state, 'available')
      assert.deepEqual(
        t1.content.map((c) => [c.applyId, c.action, c.target.id]),
        [['apply-create-1', 'content.create', '77']]
      )
      const press = { session: SESSION, turnId: `${SESSION}:1`, scope: 'turn', idemKey: 'turn-undo-create' }
      const done = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, press)
      assert.equal(done.status, 200)
      const result = await done.json()
      assert.deepEqual(result.turns[0].content, { reverted: ['apply-create-1'], failed: [], unsure: [] })
      assert.deepEqual(
        w.host.component.map((call) => [call.action, call.params.apply_id]),
        [['apply.revert', 'apply-create-1']]
      )
      const again = await (await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)).json()
      assert.equal(again.turns[0].undo.state, 'undone')
    } finally {
      w.s.dispose()
    }
  }
)

test('an admin edit after the turn: POST is refused BLOCKED and writes nothing', opts, async () => {
  const { pool } = db
  const w = await world(pool)
  try {
    const owner = await w.seat('owner@x.y', 'owner')
    w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
    const moment = w.s.moment('Use brown', `${SESSION}:1`)
    await closedTurn(pool, 1, { files: 1, head: moment.head, minutesAgo: 10 })
    await applyWrite(pool, 1, 'apply-0002', 9)
    await pool.query(
      `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, resource_title, op, occurred_at, cursor_key)
       values ($1, 'wordpress-tracy-log', '{"id": 3, "name": "Ann"}', 'post', '42', 'Home', 'update', now() - interval '2 minutes', 'c1')`,
      [SITE]
    )
    const head = w.s.git('rev-parse', 'HEAD').trim()
    const refused = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, {
      session: SESSION,
      turnId: `${SESSION}:1`,
      scope: 'turn'
    })
    assert.equal(refused.status, 409)
    const body = await refused.json()
    assert.equal(body.code, 'BLOCKED')
    assert.equal(body.reasons[0].code, 'CONTENT_CHANGED_AFTER')
    assert.equal(body.reasons[0].via, 'cms-admin')
    assert.equal(w.s.git('rev-parse', 'HEAD').trim(), head, 'no commit')
    assert.equal(w.host.component.length, 0, 'no revert sent')
    assert.equal((await pool.query('select count(*)::int as n from site_operation')).rows[0].n, 0)
  } finally {
    w.s.dispose()
  }
})

test(
  'going back two turns undoes the newer turn first; scope turn on an older turn is NOT_LATEST',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: one }\n')
      const one = w.s.moment('One', `${SESSION}:1`)
      await closedTurn(pool, 1, { files: 1, head: one.head, minutesAgo: 20 })
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: two }\n')
      const two = w.s.moment('Two', `${SESSION}:2`)
      await closedTurn(pool, 2, { files: 1, head: two.head, minutesAgo: 10 })

      const notLatest = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, {
        session: SESSION,
        turnId: `${SESSION}:1`,
        scope: 'turn'
      })
      assert.equal(notLatest.status, 409)
      assert.deepEqual(await notLatest.json(), { code: 'NOT_LATEST' })

      const back = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, {
        session: SESSION,
        turnId: `${SESSION}:1`,
        scope: 'from-here'
      })
      assert.equal(back.status, 200)
      const result = await back.json()
      assert.equal(result.complete, true)
      assert.deepEqual(
        result.turns.map((t) => [t.turnId, t.files.status]),
        [
          [`${SESSION}:2`, 'undone'],
          [`${SESSION}:1`, 'undone']
        ]
      )
      assert.equal(w.s.read('wp-content/themes/tracy/style.css'), 'body { margin: 0 }\n')
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'an undo is told to the conversation once: the next turn open names it, a retry and the turn after do not',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      w.s.write('wp-content/themes/tracy/style.css', 'body { color: brown }\n')
      const moment = w.s.moment('Use brown', `${SESSION}:1`)
      await closedTurn(pool, 1, { files: 1, head: moment.head, minutesAgo: 10 })
      await applyWrite(pool, 1, 'apply-0003', 9)

      const done = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, {
        session: SESSION,
        turnId: `${SESSION}:1`,
        scope: 'turn'
      })
      assert.equal(done.status, 200)
      assert.equal((await done.json()).complete, true)
      const [stamp] = (
        await pool.query('select undone_at, undo_complete from site_turn where turn_id = $1', [
          `${SESSION}:1`
        ])
      ).rows
      assert.ok(stamp.undone_at instanceof Date, 'undone_at is stamped')
      assert.equal(stamp.undo_complete, true)

      const open = (n) =>
        w.send('POST', `/api/sites/${SITE}/turn`, owner, { turnId: `${SESSION}:${n}`, title: `Request ${n}` })
      const second = await open(2)
      assert.equal(second.status, 200)
      assert.deepEqual((await second.json()).undone, [{ turn: 1, title: 'Request 1', complete: true }])
      // The same turn sent again (a retry, a steer) is not a new turn: nothing named twice.
      assert.deepEqual((await (await open(2)).json()).undone, [])
      // The turn after opened later than the undo: the agent has been told already.
      assert.deepEqual((await (await open(3)).json()).undone, [])
    } finally {
      w.s.dispose()
    }
  }
)

// ── WordPress looks: `look.set` writes the site's Additional CSS, which Git never holds ─────────────

/** A look undo entry as `tracy-site-tools` `look.set` leaves it on WordPress: the CSS before and after. */
function lookEntry(s, id, before, after) {
  const dir = join(s.srv, LABEL, '.tracy', 'undo', 'look', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'c0'), before, 'utf8')
  writeFileSync(join(dir, 'c1'), after, 'utf8')
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      v: 1,
      id,
      at: new Date().toISOString(),
      tool: 'look.set',
      files: [],
      customCss: { stylesheet: 'tracy', before: 'c0', after: 'c1' }
    })
  )
  return () => JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
}

test(
  'a WordPress look turn: /changed records look-css with its undo id, POST puts the Additional CSS back through the host, GET then says undone',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      const manifest = lookEntry(w.s, 'abc123', '/* mine */', '/* mine */\n.x { color: blue }')
      w.host.css.tracy = '/* mine */\n.x { color: blue }'
      await closedTurn(pool, 1, { minutesAgo: 10 })
      const turnId = `${SESSION}:1`

      // The door: `look-css` is a via of its own; only a six-hex undo id is kept, never CSS text.
      const bad = await w.changed(owner, turnId, { tool: 'look.set', via: 'look-x' })
      assert.equal(bad.status, 400)
      const odd = await w.changed(owner, `${SESSION}:9`, {
        tool: 'look.set',
        via: 'look-css',
        target: { kind: 'additional-css', id: '.x { color: blue }' }
      })
      assert.equal(odd.status, 200)
      const said = await w.changed(owner, turnId, {
        tool: 'look.set',
        via: 'look-css',
        target: { kind: 'additional-css', id: 'abc123' }
      })
      assert.equal(said.status, 200)
      const rows = (await pool.query('select turn_id, action, via, target from site_write order by id')).rows
      assert.deepEqual(rows, [
        { turn_id: `${SESSION}:9`, action: 'look.set', via: 'look-css', target: null },
        {
          turn_id: turnId,
          action: 'look.set',
          via: 'look-css',
          target: { kind: 'additional-css', id: 'abc123' }
        }
      ])
      await pool.query('delete from site_write where turn_id = $1', [`${SESSION}:9`])

      const view = await (await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)).json()
      const [t1] = view.turns
      assert.equal(t1.changed, true)
      assert.equal(t1.look[0].undo, 'abc123')
      assert.deepEqual(t1.undo, {
        state: 'available',
        latest: true,
        reasons: [],
        needs: { code: true, content: false }
      })
      assert.deepEqual(w.host.lookJobs, ['check'])

      const done = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, {
        session: SESSION,
        turnId,
        scope: 'turn'
      })
      assert.equal(done.status, 200)
      const result = await done.json()
      assert.equal(result.complete, true)
      assert.deepEqual(result.turns[0].look, { undone: ['abc123'], failed: [], unsure: [] })
      assert.equal(w.host.css.tracy, '/* mine */', 'the Additional CSS is back, byte for byte')
      assert.equal(manifest().reverted.by, 'turn-undo', 'a later look.revert of it refuses')
      const back = (
        await pool.query("select action, via, target, turn_id from site_write where action = 'look.revert'")
      ).rows
      assert.deepEqual(back, [
        {
          action: 'look.revert',
          via: 'look-css',
          target: { kind: 'additional-css', id: 'abc123' },
          turn_id: null
        }
      ])
      assert.ok((await w.siteRow()).last_write_at instanceof Date, 'everybody’s Refresh button learns of it')

      const again = await (await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)).json()
      assert.equal(again.turns[0].undo.state, 'undone')
    } finally {
      w.s.dispose()
    }
  }
)

test(
  'Additional CSS saved in the Customizer after the look turn: GET says LOOK_CHANGED_AFTER, POST is refused and writes nothing',
  opts,
  async () => {
    const { pool } = db
    const w = await world(pool)
    try {
      const owner = await w.seat('owner@x.y', 'owner')
      const manifest = lookEntry(w.s, 'abc123', '', '.x { color: blue }')
      w.host.css.tracy = '.x { color: blue }\n.later { color: red }'
      await closedTurn(pool, 1, { minutesAgo: 10 })
      await w.changed(owner, `${SESSION}:1`, {
        tool: 'look.set',
        via: 'look-css',
        target: { kind: 'additional-css', id: 'abc123' }
      })
      const view = await (await w.send('GET', `/api/sites/${SITE}/turns?session=${SESSION}`, owner)).json()
      assert.deepEqual(view.turns[0].undo.reasons, [{ code: 'LOOK_CHANGED_AFTER', via: 'outside' }])
      const refused = await w.send('POST', `/api/sites/${SITE}/turns/undo`, owner, {
        session: SESSION,
        turnId: `${SESSION}:1`,
        scope: 'turn'
      })
      assert.equal(refused.status, 409)
      assert.equal((await refused.json()).code, 'BLOCKED')
      assert.equal(w.host.css.tracy, '.x { color: blue }\n.later { color: red }', 'the later change stands')
      assert.equal(manifest().reverted, undefined)
      assert.ok(!w.host.lookJobs.includes('undo'))
    } finally {
      w.s.dispose()
    }
  }
)
