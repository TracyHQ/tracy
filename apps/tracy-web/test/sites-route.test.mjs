import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, after, before, beforeEach } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { loadStandardQuestions } from '../src/lib/build-questions.js'
import { saveDesignSystemsShown } from '../src/lib/design-systems-setting.js'
import { saveUiSwitches } from '../src/lib/ui-setting.js'
import { personFace } from '../src/lib/person-face.js'
import { BRIEF_REWRITE_LIMIT_PER_HOUR } from '../src/lib/policy.js'
import { syncLocalReleases } from '../src/lib/quickstart-releases.js'
import { mintSession } from '../src/lib/session.js'
import { seedShards } from '../src/shards/store.js'
import { pressImportClaim } from '../src/sites/import-address.js'
import { labelPrefix } from '../src/sites/label.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { createSite, setQuickstart } from '../src/sites/store.js'
import { markTurnsUndone } from '../src/sites/turn-undo-store.js'
import { archiveSessionsAtDoor, forgetWorkspaceAtDoor, revokeSeatAtDoor } from '../src/workspace/seat-door.js'
import { answerAddSiteHold } from './_add-site-hold.mjs'
import { fileDb } from './_db.mjs'

/** The standard questionnaire of each CMS, as this build ships it. */
const STANDARD_QUESTIONS_FILE = loadStandardQuestions()

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

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
  ARTIFACT_S3_ENDPOINT: 'http://r2.test',
  ARTIFACT_S3_BUCKET: 'artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'AK',
  ARTIFACT_S3_SECRET_KEY: 'SK'
}

/** A fake `tracy-host` plus a fake R2, both reached through the one `fetchImpl` every
 * `hostCall`/`hostJob`/`signedCall` call is threaded through — mirrors how `test/host-client.test.mjs`
 * records calls instead of touching a real socket.
 *
 * `siteJob` drives the ONE `webroot-*` job a test starts through `runSiteJob` (`POST /_host/site`
 * always answers `{jobId: 'site-job-1'}`): `states` is what `GET /_host/jobs/site-job-1` answers
 * on each successive poll (staying on the last entry once exhausted — a poll loop that outlives
 * the array), and `output` is the job's `output` field once a state is `done`/`failed`. Provision
 * jobs (`job-1`, from `/_host/provision`) are untouched by this — they still fall through to the
 * generic `/_host/jobs/` branch below, which every existing test here already relies on.
 *
 * `teardownJob` makes `/_host/teardown` answer the way tracy-host does (202 with a job id), and
 * `states` is what `GET /_host/jobs/teardown-1` answers on each poll (`output`, when given, rides on
 * an ended one, as tracy-host writes the script's last lines); without it the teardown
 * answers `{ok: true}` and nothing is waited on. `archive` is the dsh's answer to
 * `/gateway/seat/archive-sessions` — a move by default, `{refuse: '<REASON>'}` for a 409, or
 * `{answers: ['<REASON>' | null, …]}` for one answer per call (null moves; the last repeats), or
 * `{hang: true}` for a dsh that never answers until the caller's signal ends the call. `forget` is the
 * dsh's answer to `/gateway/seat/forget-workspace`: `{status, body}`, a confirmed forget by default. */
function fakeNetwork({ siteJob, goLive, teardownJob, archive, forget } = {}) {
  const calls = []
  const jobStates = siteJob?.states ?? ['done']
  const jobOutput = siteJob?.output ?? '{"ok":true}'
  let jobCursor = 0
  let lastKind = null
  // Read at each poll, so a test can let a teardown that failed or hung end well later on.
  const teardownStates = () => teardownJob?.states ?? ['done']
  let teardownCursor = 0
  let teardownLabel = null
  let archiveCursor = 0
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    calls.push({ url: String(input), init })
    const held = answerAddSiteHold(input, init)
    if (held) return held
    if (u.pathname === '/_host/provision') {
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
    }
    if (u.pathname === '/_host/site') {
      lastKind = JSON.parse(init.body).kind
      // `siteJob.refuse`: the job kinds the host refuses to take at all.
      if (siteJob?.refuse?.includes(lastKind))
        return new Response(JSON.stringify({ code: 'FLEET_REFUSED' }), { status: 502 })
      return new Response(JSON.stringify({ jobId: 'site-job-1' }), { status: 200 })
    }
    if (u.pathname === '/_host/jobs/site-job-1') {
      // `siteJob.byKind[kind]`: a different answer per job kind (`{state, output}`), for a test whose
      // one door runs two jobs (a turn's seal, then its moment).
      const own = siteJob?.byKind?.[lastKind]
      if (own) return new Response(JSON.stringify(own), { status: 200 })
      const state = jobStates[Math.min(jobCursor, jobStates.length - 1)]
      jobCursor++
      const body = state === 'done' || state === 'failed' ? { state, output: jobOutput } : { state }
      return new Response(JSON.stringify(body), { status: 200 })
    }
    if (u.pathname === '/_host/jobs/teardown-1') {
      const states = teardownStates()
      const state = states[Math.min(teardownCursor, states.length - 1)]
      teardownCursor++
      // tracy-host writes the script's own exit code and last lines once the job has ended
      // (`runGoLiveJob`): a `done` carries teardown.sh's closing line, a `failed` what the test gave.
      const ended = state === 'done' || state === 'failed'
      const output =
        state === 'done'
          ? `==> tearing down\nTRACY_RESULT torn_down=1 label=${teardownLabel}\n==> ${teardownLabel} is gone`
          : (teardownJob?.output ?? '')
      return new Response(
        JSON.stringify({
          state,
          step: 'go-live:teardown',
          ...(ended ? { exitCode: state === 'done' ? 0 : 1, output } : {})
        }),
        { status: 200 }
      )
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      return new Response(JSON.stringify({ state: 'done', port: 8123 }), { status: 200 })
    }
    if (u.pathname === '/_host/attach') {
      return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    }
    if (u.pathname === '/_host/reserve' || u.pathname === '/_host/unreserve') {
      const { label } = JSON.parse(init.body)
      return new Response(
        JSON.stringify({ ok: true, label, path: `/site/${label}`, reserved: true, removed: true }),
        { status: 200 }
      )
    }
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/forget-workspace') {
      return new Response(
        JSON.stringify(forget?.body ?? { ok: true, archived: ['s-1', 's-2'], deleted: true }),
        { status: forget?.status ?? 200 }
      )
    }
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/archive-sessions' && archive?.hang) {
      init.signal?.throwIfAborted()
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal.reason))
      })
    }
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/archive-sessions') {
      const refuse = archive?.answers
        ? archive.answers[Math.min(archiveCursor++, archive.answers.length - 1)]
        : archive?.refuse
      return refuse
        ? new Response(JSON.stringify({ ok: false, reason: refuse, error: 'kept' }), { status: 409 })
        : new Response(JSON.stringify({ ok: true, archivedTo: 'x-20260928T101530Z', sessions: 2 }), {
            status: 200
          })
    }
    if (u.host === 'dsh.test' && u.pathname === '/gateway/seat/revoke') {
      return new Response(JSON.stringify({ ok: true, revoked: 1 }), { status: 200 })
    }
    if (u.pathname === '/_host/teardown') {
      return teardownJob
        ? new Response(JSON.stringify({ jobId: 'teardown-1' }), { status: 202 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    // A site is deleted through the keyed go-live door (`op: 'teardown'`): one job per key.
    if (u.pathname === '/_host/go-live' && JSON.parse(init.body).op === 'teardown' && !goLive?.refuse) {
      teardownLabel = JSON.parse(init.body).label
      return new Response(JSON.stringify({ jobId: 'teardown-1' }), { status: 202 })
    }
    if (u.pathname === '/_host/go-live') {
      return goLive?.refuse
        ? // The host's own refusal, as `goLiveRoute` words it for a label it has no folder for.
          new Response(JSON.stringify({ code: 'NOT_FOUND', accepted: false }), { status: 404 })
        : new Response(JSON.stringify({ jobId: 'golive-1' }), { status: 200 })
    }
    if (u.host === 'r2.test' && u.searchParams.has('uploads')) {
      return new Response('<UploadId>upload-1</UploadId>', { status: 200 })
    }
    return new Response(null, { status: 404 })
  }
  return { calls, fetchImpl }
}

/** A `now()` that hands out one value per call, repeating the last once exhausted — lets a test
 * force `runSiteJob`'s poll loop past its deadline after exactly ONE real (short) wait, instead
 * of actually waiting out a 45s/120s deadline. See the "never finishes" test below for the trace
 * of which call gets which value. */
function stepClock(values) {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/**
 * The wall clock as Postgres' `now()` reads it. `scripts/clock-shift.mjs` moves `Date.now()` 400 days ahead but not
 * `performance`, so a door that compares `opened_at` (stamped by the database) with an injected `Date.now()` sees every
 * turn as 400 days old under the shift. Handing the door this clock keeps both sides on the same one.
 */
const realNow = () => Math.floor(performance.timeOrigin + performance.now())

function harness(pool, { fetchImpl, now, envOverrides, seatDoor, briefs } = {}) {
  const config = readConfig({ ...env, ...envOverrides })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    ...(seatDoor ? { seatDoor } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(briefs ? { briefs } : {}),
    ...(now ? { now } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  const get = (path, cookie) => send('GET', path, cookie)
  return { app, config, cookieFor, get, send }
}

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

async function seatRow(pool, siteKey, email, role) {
  const id = await accountId(pool, email)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, id, role]
  )
  return id
}

/** A site with a live owner seat, ready for the webroot doors below (all of which require an
 * existing site row, unlike `POST /api/sites` which creates one). */
async function ownedSite(pool, siteKey = 'lantern.localhost', label = 'lantern') {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
  await seatRow(pool, siteKey, 'owner@x.y', 'owner')
}

test(
  'GET /api/sites/import-address reads existing ownership without claiming or exposing identity',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, get } = harness(pool)
    const owner = await cookieFor('owner@x.y')
    const stranger = await cookieFor('stranger@x.y')
    assert.equal((await get('/api/sites/import-address?siteKey=lantern.localhost')).status, 401)
    const before = await pool.query('select count(*)::int as count from site')
    const free = await get('/api/sites/import-address?siteKey=lantern.localhost', owner)
    assert.deepEqual(await free.json(), { ownership: 'available' })
    assert.equal(free.headers.get('cache-control'), 'no-store')
    assert.deepEqual((await pool.query('select count(*)::int as count from site')).rows, before.rows)
    assert.deepEqual(
      (await pool.query('select email from account')).rows,
      [],
      'preflight never creates accounts'
    )
    await ownedSite(pool)
    const mine = await get(
      '/api/sites/import-address?siteKey=https%3A%2F%2Fwww.LANTERN.localhost%2Fpath',
      owner
    )
    assert.deepEqual(await mine.json(), { ownership: 'mine' })
    const other = await get('/api/sites/import-address?siteKey=lantern.localhost', stranger)
    assert.deepEqual(await other.json(), { ownership: 'other', joinPath: '/lantern/join' })
    assert.deepEqual((await pool.query('select email from account order by email')).rows, [
      { email: 'owner@x.y' }
    ])
  }
)

test(
  'POST /api/sites: a bad label is refused with its reason; a good one claims the name and starts a provision on the default host; a different caller cannot then claim the same name',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')

    // 'dashboard' is six characters (the shape rule's own floor), so it reaches the reserved-word
    // check — unlike the brief's own example word 'api' (three characters), which the Worker's
    // `siteLabelRefusal` refuses as 'shape' before it ever gets there. See the task report.
    const bad = await send('POST', '/api/sites', owner, { label: 'dashboard', platform: 'wordpress' })
    assert.equal(bad.status, 400)
    assert.deepEqual(await bad.json(), { code: 'INVALID_LABEL', reason: 'reserved' })
    // The zone's own names for customers' own domains (#1037): `connect` (the CNAME target) and
    // `origin` (the fallback origin) are nobody's site, on the create door and the claim door alike.
    for (const label of ['connect', 'origin']) {
      for (const [door, extra] of [
        ['/api/sites', {}],
        ['/api/sites/claim', { buildId: '0b6b8d4e-2a7c-4f1e-9a3d-5c8e7f6a1b20' }]
      ]) {
        const zone = await send('POST', door, owner, { label, platform: 'wordpress', ...extra })
        assert.equal(zone.status, 400, `${door} ${label}`)
        assert.deepEqual(await zone.json(), { code: 'INVALID_LABEL', reason: 'reserved' }, `${door} ${label}`)
      }
    }

    const good = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    assert.equal(good.status, 202)
    const goodBody = await good.json()
    assert.equal(goodBody.siteKey, 'lantern.localhost')
    assert.ok(goodBody.jobId)

    const provisionCall = calls.find((c) => c.url.endsWith('/_host/provision'))
    assert.ok(provisionCall, 'the fake host never saw a provision call')
    // `siteKey` and `liveSite` are here on purpose and the assertion is exact: without them
    // `provision.sh` falls back to a literal `https://<label>.tracy.ai`, and the site is built
    // under a hostname it does not live on — WordPress's `siteurl`/`home` and the AGENTS.md the
    // site's own agent reads. Measured 11/09 on the dev machine, on a site that reported ready.
    assert.match(JSON.parse(provisionCall.init.body).jobKey, /:legacy:lantern\.localhost:1$/)
    assert.deepEqual(JSON.parse(provisionCall.init.body), {
      site: 'lantern.localhost',
      siteKey: 'lantern.localhost',
      liveSite: 'http://lantern.localhost:8080/',
      publicOrigin: 'http://tracy.test:8080',
      label: 'lantern',
      platform: 'wordpress',
      fresh: true,
      ownerEmail: 'owner@x.y',
      jobKey: provisionCall && JSON.parse(provisionCall.init.body).jobKey
    })

    const stranger = await cookieFor('stranger@x.y')
    const taken = await send('POST', '/api/sites', stranger, { label: 'lantern', platform: 'wordpress' })
    assert.equal(taken.status, 409)
    assert.deepEqual(await taken.json(), {
      code: 'TAKEN',
      message: 'That domain is already taken. Choose another site address.',
      joinPath: '/lantern/join'
    })

    // The same owner asking again is idempotent — a retried provision is not a name fight with
    // yourself (ported from `handleCreateSite`'s `alreadyMine` branch).
    const again = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    assert.equal(again.status, 202)
    const signals = (
      await pool.query("select kind,data from ops_signal where kind in ('site.create','site.stuck')")
    ).rows
    assert.equal(signals.length, 1, 'same-owner retry and TAKEN do not create another event')
    assert.equal(signals[0].kind, 'site.create')
    assert.equal(signals[0].data.source, 'cold')
  }
)

// Usage (plan tasks/todo-do-dung-that.md U4): an opening of the Add site wizard, and the Create it led to.
test(
  'POST /api/sites/wizard records one wizard.opened per id; the Create that carries the id keeps it on site.create',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const id = '3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607'
    assert.equal((await send('POST', '/api/sites/wizard', null, { wizardId: id })).status, 401)
    for (const body of [{}, { wizardId: 'nope' }, { wizardId: 42 }]) {
      const bad = await send('POST', '/api/sites/wizard', owner, body)
      assert.equal(bad.status, 400)
      assert.equal((await bad.json()).code, 'INVALID_WIZARD_ID')
    }
    assert.equal((await send('POST', '/api/sites/wizard', owner, { wizardId: id, where: 'new' })).status, 200)
    // React's double effect, a reload of the same opening: still one.
    assert.equal(
      (await send('POST', '/api/sites/wizard', owner, { wizardId: id.toUpperCase(), where: 'bogus' })).status,
      200
    )
    const opened = (await pool.query("select data from ops_signal where kind = 'wizard.opened'")).rows
    assert.deepEqual(
      opened.map((r) => r.data),
      [{ wizard_id: id, where: 'new', email: 'owner@x.y' }]
    )
    const made = await send('POST', '/api/sites', owner, {
      label: 'lantern',
      platform: 'wordpress',
      wizardId: id
    })
    assert.equal(made.status, 202)
    const created = (await pool.query("select data from ops_signal where kind = 'site.create'")).rows
    assert.equal(created[0].data.wizard_id, id)
    // A Create from an older page sends none, and a malformed id is not refused — only not kept.
    const older = await send('POST', '/api/sites', owner, {
      label: 'harbor',
      platform: 'wordpress',
      wizardId: 'x'
    })
    assert.equal(older.status, 202)
    const both = (await pool.query("select data from ops_signal where kind = 'site.create' order by id")).rows
    assert.equal(both[1].data.wizard_id, undefined)
  }
)

// Usage: the pages an opening reached, so an opening left before Create says where (`WIZARD_STEPS`).
test(
  'POST /api/sites/wizard with step records one wizard.step per id and page, and refuses a page not on the list',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const id = '4a2d3c5b-6e7f-4081-9ba2-c3d4e5f60718'
    assert.equal(
      (await send('POST', '/api/sites/wizard', null, { wizardId: id, step: 'start:source' })).status,
      401
    )
    const noId = await send('POST', '/api/sites/wizard', owner, { step: 'start:source' })
    assert.equal((await noId.json()).code, 'INVALID_WIZARD_ID')
    for (const step of ['create:nowhere', 'Create:design', 42, '']) {
      const bad = await send('POST', '/api/sites/wizard', owner, { wizardId: id, step })
      assert.equal(bad.status, 400)
      assert.equal((await bad.json()).code, 'INVALID_WIZARD_STEP')
    }
    for (const step of ['start:source', 'import:address', 'import:access', 'import:address'])
      assert.equal((await send('POST', '/api/sites/wizard', owner, { wizardId: id, step })).status, 200)
    const steps = (await pool.query("select data from ops_signal where kind = 'wizard.step' order by id"))
      .rows
    assert.deepEqual(
      steps.map((r) => r.data),
      [
        { wizard_id: id, step: 'start:source', email: 'owner@x.y' },
        { wizard_id: id, step: 'import:address', email: 'owner@x.y' },
        { wizard_id: id, step: 'import:access', email: 'owner@x.y' }
      ]
    )
    // A step is not an opening: the opening is told on its own.
    assert.equal((await pool.query("select 1 from ops_signal where kind = 'wizard.opened'")).rowCount, 0)
  }
)

test('every page the Add site form can name is on the WIZARD_STEPS list', async () => {
  const { WIZARD_STEPS } = await import('../src/sites/route.js')
  const { createStepIds } = await import(
    '../../../packages/site/tracy-add-site/src/client/create-navigation.mjs'
  )
  const { wizardStepName } = await import('../../../packages/site/tracy-add-site/src/client/wizard-usage.mjs')
  const base = { stageAt: 'form', origin: 'create', businessOn: true, importPage: null }
  const named = [
    ...createStepIds(true).map((page) => wizardStepName({ ...base, currentStep: page, activeStep: page })),
    ...['address', 'platform', 'access', 'details', 'review'].map((page) =>
      wizardStepName({ ...base, origin: 'import', currentStep: page, activeStep: page, importPage: page })
    ),
    wizardStepName({ ...base, origin: 'business', currentStep: 'platform', activeStep: 'platform' })
  ]
  for (const step of named) assert.ok(WIZARD_STEPS.has(step), step)
})

test(
  'job poll: done sets the local address and attaches the site, and My Sites then reads agent: "/"',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send, get } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')

    const created = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    const { siteKey, jobId } = await created.json()

    const polled = await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
    assert.equal(polled.status, 200)
    const body = await polled.json()
    assert.equal(body.state, 'done')
    assert.equal(body.liveUrl, 'http://lantern.localhost:8080/')
    assert.equal(body.lane, '/')

    const { rows } = await pool.query('select * from site where site_key = $1', [siteKey])
    assert.equal(rows[0].address, 'http://lantern.localhost:8080/')
    assert.equal(rows[0].publish, 'draft')
    assert.equal(rows[0].port, 8123)
    assert.equal(rows[0].attached, true)

    const mine = await get('/api/sites', owner)
    const row = (await mine.json()).sites.find((s) => s.siteKey === siteKey)
    assert.equal(row.agent, '/')
  }
)

test('job poll: an id belonging to another site is refused, and an unknown id is 404', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork()
  const { cookieFor, send, get } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')
  const created = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
  const { siteKey } = await created.json()

  const unknown = await get(`/api/sites/${siteKey}/jobs/nope`, owner)
  assert.equal(unknown.status, 404)
  assert.deepEqual(await unknown.json(), { code: 'JOB_UNKNOWN' })

  await pool.query(
    "insert into site (site_key, label, host) values ('other.localhost', 'other-00000000', 'local')"
  )
  await pool.query(
    "insert into job (id, site_key, host, kind) values ('foreign-job', 'other.localhost', 'local', 'provision')"
  )
  const foreign = await get(`/api/sites/${siteKey}/jobs/foreign-job`, owner)
  assert.equal(foreign.status, 403)
  assert.deepEqual(await foreign.json(), { code: 'JOB_NOT_YOURS' })
})

test(
  'artifacts: begin returns a key under sites/<labelPrefix>/, and part with a key from another site is refused',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')

    const begin = await send('POST', '/api/sites/lantern.localhost/artifacts/begin', owner, {
      kind: 'webroot'
    })
    assert.equal(begin.status, 200)
    const { key, uploadId } = await begin.json()
    assert.equal(uploadId, 'upload-1')
    assert.equal(key.startsWith(`sites/${labelPrefix('lantern.localhost')}/`), true)

    const part = await send('POST', '/api/sites/lantern.localhost/artifacts/part', owner, {
      key: 'sites/somebody-elses-site/2026-x-webroot.tar',
      uploadId: 'upload-1',
      partNumber: 1
    })
    assert.equal(part.status, 403)
    assert.deepEqual(await part.json(), { code: 'KEY_NOT_YOURS' })
  }
)

test(
  'artifacts: a part URL is signed for ARTIFACT_S3_PUBLIC_ENDPOINT when set, the begin/finish calls stay internal',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    const { cookieFor, send } = harness(pool, {
      fetchImpl: network.fetchImpl,
      envOverrides: { ARTIFACT_S3_PUBLIC_ENDPOINT: 'https://store.example.net' }
    })
    const owner = await cookieFor('owner@x.y')
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')

    // `begin` reaches the fake R2 at its internal address — it would 404 anywhere else.
    const begin = await send('POST', '/api/sites/lantern.localhost/artifacts/begin', owner, {
      kind: 'webroot'
    })
    assert.equal(begin.status, 200)
    const { key, uploadId } = await begin.json()

    const part = await send('POST', '/api/sites/lantern.localhost/artifacts/part', owner, {
      key,
      uploadId,
      partNumber: 1
    })
    assert.equal(part.status, 200)
    const signed = new URL((await part.json()).url)
    assert.equal(signed.origin, 'https://store.example.net')
    assert.equal(signed.pathname, `/artifacts/${key}`)
    assert.equal(signed.searchParams.get('uploadId'), uploadId)
  }
)

test(
  'DELETE /api/sites/:key: a dsh that cannot forget the sessions does not stop the teardown, and says so',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork({ forget: { status: 502, body: { ok: false } } })
    const fetchImpl = async (input, init) =>
      new URL(String(input)).pathname === '/gateway/seat/revoke'
        ? new Response(JSON.stringify({ ok: false }), { status: 502 })
        : network.fetchImpl(input, init)
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { forgetWorkspaceAtDoor, archiveSessionsAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('ember.localhost', 'ember', 'local')")
    await seatRow(pool, 'ember.localhost', 'owner@x.y', 'owner')
    const removed = await send('DELETE', '/api/sites/ember.localhost', await cookieFor('owner@x.y'))
    assert.equal(removed.status, 200)
    assert.deepEqual(await removed.json(), {
      removed: true,
      host: true,
      repo: false,
      sessions: false,
      sessionsReason: 'SESSIONS_NOT_STOPPED',
      seats: false
    })
    assert.equal(
      (await pool.query('select 1 from site where site_key = $1', ['ember.localhost'])).rows.length,
      0
    )
    // #561: a turn waiting on its customer holds no lease, so without the forget's stop the dsh's
    // lease rule could move the folder under a live turn. It is not asked at all.
    assert.equal(
      network.calls.filter((c) => c.url === 'http://dsh.test/gateway/seat/archive-sessions').length,
      0
    )
  }
)

/**
 * 🔒 `host` IS WHETHER THE STACK WENT, NOT WHETHER THE JOB STARTED (28/09/2026). `/teardown` only
 * STARTS `teardown.sh` and answers 202, so `answer.ok` was true for a job that then failed or never
 * finished: the dialog said the site was torn down while its containers, volumes and files were still
 * on the host — and the book row was already gone, so nothing was left to retry from and nobody knew
 * to look. The job's outcome was polled and thrown away; it is reported now.
 */
test(
  'DELETE /api/sites/:key: a teardown still running when the wait ends removes NOTHING — the site stays, held by its delete, until the host says it is gone; then the book is closed with nobody at the door',
  opts,
  async () => {
    const { pool } = db
    // The job does not end while the door waits.
    const teardownJob = { states: ['running'] }
    const { fetchImpl, calls } = fakeNetwork({ teardownJob })
    // `begun`, the first look at the clock in the wait, then one past `TEARDOWN_WAIT_MS` — the wait
    // ends after one real 120 ms pause, not 45 seconds.
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      now: stepClock([0, 0, 100_000]),
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('slow.localhost', 'slow', 'local')")
    await seatRow(pool, 'slow.localhost', 'owner@x.y', 'owner')
    const owner = await cookieFor('owner@x.y')
    const pending = await send('DELETE', '/api/sites/slow.localhost', owner)
    assert.equal(pending.status, 202)
    const body = await pending.json()
    assert.equal(body.code, 'DELETE_PENDING')
    assert.equal(body.removed, false)
    assert.equal(body.jobId, 'teardown-1')
    assert.equal(body.operation.op, 'delete')
    assert.equal(body.operation.state, 'running')
    // Nothing of the book went: the row, the seat, and no session folder was asked for.
    assert.equal((await pool.query("select 1 from site where site_key = 'slow.localhost'")).rows.length, 1)
    assert.equal(
      (await pool.query("select 1 from seat where site_key = 'slow.localhost' and revoked_at is null")).rows
        .length,
      1
    )
    assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length, 0)
    assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/revoke')).length, 0)
    const op = (await pool.query("select * from site_publish_op where site_key = 'slow.localhost'")).rows[0]
    assert.equal(op.op, 'delete')
    assert.equal(op.state, 'running')
    // The list says so while it lasts.
    const listed = await (await send('GET', '/api/sites', owner)).json()
    assert.equal(listed.sites.find((row) => row.siteKey === 'slow.localhost').publishing, 'delete')

    // While the delete holds the site nothing else starts on it: not a publish, not a second delete.
    const publish = await send('POST', '/api/sites/slow.localhost/go-live', owner, { op: 'live' })
    assert.equal(publish.status, 409)
    assert.equal((await publish.json()).code, 'PUBLISH_BUSY')
    const again = await send('DELETE', '/api/sites/slow.localhost', owner)
    assert.equal(again.status, 409)
    assert.equal((await again.json()).code, 'PUBLISH_BUSY')
    const teardowns = () =>
      calls.filter((c) => c.url.endsWith('/_host/go-live') && JSON.parse(c.init.body).op === 'teardown')
    assert.equal(new Set(teardowns().map((c) => JSON.parse(c.init.body).jobKey)).size, 1, 'one key')

    // The host finishes later. Whoever looks at the site next closes the book — here the person
    // pressing Delete once more, who is told the site is removed (never "no such site").
    teardownJob.states = ['done']
    const pressed = await send('DELETE', '/api/sites/slow.localhost', owner)
    assert.equal(pressed.status, 200)
    assert.deepEqual(await pressed.json(), {
      removed: true,
      host: true,
      repo: false,
      sessions: true,
      seats: true
    })
    assert.equal((await pool.query("select 1 from site where site_key = 'slow.localhost'")).rows.length, 0)
    assert.equal(
      (await pool.query("select 1 from site_publish_op where site_key = 'slow.localhost'")).rows.length,
      0
    )
    assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/revoke')).length, 1)
    assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length, 1)
  }
)

/**
 * 🔒 A FAILED TEARDOWN SAYS WHY, IN THE SCRIPT'S OWN WORDS. tracy-host's teardown job carries the
 * script's last lines as `output` and no `error` (`runTeardownJob`), and this door read `error` only:
 * the person deleting a site saw `TEARDOWN_FAILED` and nothing else, never teardown.sh's
 * "!! teardown of <label> did not finish … still on this host …" line (05/10/2026). The reason is that
 * verdict line, bounded, with the host's paths cut down to the root's name and the site's own part, and
 * any name that is not this site's (a neighbour's volume docker answered with) left out.
 */
test(
  "DELETE /api/sites/:key: a teardown that failed says the script's verdict line, without the host's paths or anyone else's names",
  opts,
  async () => {
    const { pool } = db
    const cases = [
      {
        label: 'stuck',
        output: [
          '==> tearing down stuck → /srv/tracy-private/stuck',
          "!! could not remove /srv/tracy-private/stuck (rm: cannot remove '/srv/tracy-private/stuck/webroot-baseline.git': Directory not empty) — trying once more in 2 s",
          "!! could not remove /srv/tracy-private/stuck: rm: cannot remove '/srv/tracy-private/stuck/webroot-baseline.git': Directory not empty",
          '==> removed the site network stuck_default (10.240.7.0/24)',
          '==> keeping /var/lib/tracy-host/logs/teardown-stuck.log: /srv/tracy-private/stuck could not be removed, and it says why',
          '!! teardown of stuck did not finish (the steps after the directory ran): still on this host after two tries: /srv/tracy-private/stuck — run the teardown again once nothing holds it, or remove it by hand'
        ].join('\n'),
        says: /^TEARDOWN_FAILED: teardown of stuck did not finish .*still on this host after two tries: tracy-private\/stuck\b/
      },
      {
        label: 'held',
        output: [
          "!! teardown of held stopped: docker answered 'held2_db' when asked for the volumes of held — not a name this site owns",
          '!! keeping /srv/tracy-private/held (its .env holds the password of that volume) and the teardown log; fix the cause and run the teardown again'
        ].join('\n'),
        says: /^TEARDOWN_FAILED: teardown of held stopped: docker answered '…' when asked for the volumes of held/
      }
    ]
    for (const { label, output, says } of cases) {
      const teardownJob = { states: ['failed'], output }
      const { fetchImpl, calls } = fakeNetwork({ teardownJob })
      const { cookieFor, send } = harness(pool, {
        fetchImpl,
        seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
      })
      await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [
        `${label}.localhost`,
        label,
        'local'
      ])
      await seatRow(pool, `${label}.localhost`, 'owner@x.y', 'owner')
      const owner = await cookieFor('owner@x.y')
      const removed = await send('DELETE', `/api/sites/${label}.localhost`, owner)
      // 🔒 NOT DELETED: the host could not take the site off it, so the row — and with it the seat
      // to ask again from — is still there, and nothing else was removed.
      assert.equal(removed.status, 409)
      const body = await removed.json()
      assert.equal(body.code, 'TEARDOWN_FAILED')
      assert.equal(body.removed, false)
      assert.equal(body.retry, true)
      assert.equal(body.host, false)
      assert.match(body.hostReason, says, body.hostReason)
      const key = `${label}.localhost`
      assert.equal((await pool.query('select 1 from site where site_key = $1', [key])).rows.length, 1)
      assert.equal(
        (await pool.query('select 1 from seat where site_key = $1 and revoked_at is null', [key])).rows
          .length,
        1
      )
      assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/revoke')).length, 0)
      assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length, 0)
      const failedOp = (await pool.query('select * from site_publish_op where site_key = $1', [key])).rows[0]
      assert.equal(failedOp.op, 'delete')
      assert.equal(failedOp.state, 'failed')
      // Deleted again: the SAME operation under the same key, as its next attempt — and this time
      // the host finishes, so the row goes.
      teardownJob.states = ['done']
      const retried = await send('DELETE', `/api/sites/${label}.localhost`, owner)
      assert.equal(retried.status, 200)
      assert.equal((await retried.json()).removed, true)
      const asks = calls
        .filter((c) => c.url.endsWith('/_host/go-live'))
        .map((c) => JSON.parse(c.init.body))
        .filter((ask) => ask.op === 'teardown')
      assert.equal(new Set(asks.map((ask) => ask.jobKey)).size, 1, 'one key for both runs')
      assert.equal(asks[0].attempt, undefined)
      assert.equal(asks.at(-1).attempt, 1)
      assert.equal((await pool.query('select 1 from site where site_key = $1', [key])).rows.length, 0)
      // No absolute path (the host's layout), no neighbour's name.
      assert.doesNotMatch(body.hostReason, /(^|[\s'"(])\/|\/srv|held2/, body.hostReason)
      assert.ok(
        body.hostReason.length <= 'TEARDOWN_FAILED: '.length + 200,
        `bounded: ${body.hostReason.length}`
      )
    }
  }
)

/**
 * #561: the forget asks the site's turns to stop (dsh `stopActivity`, `session/cancel`) but does not
 * wait for them to end, so the archive door, which asks dsh what still runs right before the move,
 * can answer `SESSION_ACTIVE` for a moment. Measured 29/09 on dev: a turn of a deleted site kept its
 * session live and held the next deploy for the whole 1200 s drain.
 */
test(
  'DELETE /api/sites/:key: a turn the forget stopped but still winding down is waited for, then its folder moves',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      archive: { answers: ['SESSION_ACTIVE', 'SESSION_ACTIVE', null] }
    })
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('busy.localhost', 'busy', 'local')")
    await seatRow(pool, 'busy.localhost', 'owner@x.y', 'owner')
    const removed = await send('DELETE', '/api/sites/busy.localhost', await cookieFor('owner@x.y'))
    assert.deepEqual(await removed.json(), {
      removed: true,
      host: true,
      repo: false,
      sessions: true,
      seats: true
    })
    const forget = calls.findIndex((c) => c.url === 'http://dsh.test/gateway/seat/forget-workspace')
    const asked = calls
      .map((c, i) => (c.url === 'http://dsh.test/gateway/seat/archive-sessions' ? i : -1))
      .filter((i) => i !== -1)
    assert.equal(asked.length, 3)
    assert.ok(forget !== -1 && forget < asked[0], 'the turns are stopped before the folder is asked for')
  }
)

test(
  'DELETE /api/sites/:key: a turn dsh still reports running when the wait ends keeps its folder, and says so',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ archive: { refuse: 'SESSION_ACTIVE' } })
    const archiveCalls = () => calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length
    // Six seconds per ask, counted from before the first: the second ask is past `SESSIONS_STOP_WAIT_MS`.
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      now: () => archiveCalls() * 6_000,
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('stuck.localhost', 'stuck', 'local')")
    await seatRow(pool, 'stuck.localhost', 'owner@x.y', 'owner')
    const removed = await send('DELETE', '/api/sites/stuck.localhost', await cookieFor('owner@x.y'))
    const body = await removed.json()
    assert.equal(body.sessions, false)
    assert.equal(body.sessionsReason, 'SESSION_ACTIVE')
    assert.equal(archiveCalls(), 2, 'asked again once, then bounded')
  }
)

/**
 * A site nobody ever chatted in has no session folder in dsh's store, and a second ask after a
 * move finds none either: dsh answers `NO_SESSION_FOLDER`. Nothing is left behind, so the delete
 * reports the sessions as handled instead of telling the customer the cleanup is incomplete
 * (measured 14/10/2026 on dev: `qaak13ds.tracy.site`, no `--site-qaak13ds--` anywhere).
 */
test(
  'DELETE /api/sites/:key: a site that never had a session folder reports its sessions as handled',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ archive: { refuse: 'NO_SESSION_FOLDER' } })
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('quiet.localhost', 'quiet', 'local')")
    await seatRow(pool, 'quiet.localhost', 'owner@x.y', 'owner')
    const removed = await send('DELETE', '/api/sites/quiet.localhost', await cookieFor('owner@x.y'))
    assert.deepEqual(await removed.json(), {
      removed: true,
      host: true,
      repo: false,
      sessions: true,
      seats: true
    })
    assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length, 1)
  }
)

// The review of #561: a 200 from the forget door is not proof its turns were asked to stop. Each of
// these left the folder movable although dsh never confirmed the forget.
for (const [name, body] of [
  ['a registration dsh did not remove', { ok: true, archived: ['s-1'], deleted: false }],
  ['no word on the registration', { ok: true, archived: ['s-1'] }],
  ['an archived list that is not one', { ok: true, archived: 's-1', deleted: true }],
  ['an archived list holding a non-id', { ok: true, archived: ['s-1', 7], deleted: true }],
  ['no ok', { archived: [], deleted: true }],
  ['ok false', { ok: false, archived: [], deleted: true }]
]) {
  test(
    `DELETE /api/sites/:key: a forget answering ${name} keeps the session folder in place`,
    opts,
    async () => {
      const { pool } = db
      const { fetchImpl, calls } = fakeNetwork({ forget: { body } })
      const { cookieFor, send } = harness(pool, {
        fetchImpl,
        seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
      })
      await pool.query("insert into site (site_key, label, host) values ('half.localhost', 'half', 'local')")
      await seatRow(pool, 'half.localhost', 'owner@x.y', 'owner')
      const removed = await send('DELETE', '/api/sites/half.localhost', await cookieFor('owner@x.y'))
      const answer = await removed.json()
      assert.equal(answer.removed, true)
      assert.equal(answer.sessions, false)
      assert.equal(answer.sessionsReason, 'SESSIONS_NOT_STOPPED')
      assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length, 0)
      const forget = calls.find((c) => c.url.endsWith('/gateway/seat/forget-workspace'))
      assert.ok(
        forget.init.signal instanceof AbortSignal,
        'the forget is bounded, never left to hang the delete'
      )
    }
  )
}

test(
  'DELETE /api/sites/:key: a dsh that never answers the archive ends the wait instead of holding the delete',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ archive: { hang: true } })
    const archiveCalls = () => calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length
    // The clock starts before the first ask (`begun`, the first reading after the teardown call); by
    // the time the ask is sent all but 10 ms of the wait are spent, so its signal ends it in 10 ms.
    let readings = 0
    // The archive is asked once the book is closed; the seats are revoked at the dsh just before it.
    const tornDown = () => calls.some((c) => c.url.endsWith('/gateway/seat/revoke'))
    const { cookieFor, send } = harness(pool, {
      // Delivery can happen after the timeout fires while the seat assertion is being signed.
      // Force that ordering, so the fake network must behave like fetch for an aborted request.
      fetchImpl: async (url, init) => {
        if (String(url).endsWith('/gateway/seat/archive-sessions')) {
          assert.ok(init.signal instanceof AbortSignal)
          if (!init.signal.aborted)
            await new Promise((resolve) => init.signal.addEventListener('abort', resolve, { once: true }))
        }
        return fetchImpl(url, init)
      },
      now: () => (!tornDown() || readings++ === 0 ? 0 : 9_990),
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('mute.localhost', 'mute', 'local')")
    await seatRow(pool, 'mute.localhost', 'owner@x.y', 'owner')
    const started = Date.now()
    const removed = await send('DELETE', '/api/sites/mute.localhost', await cookieFor('owner@x.y'))
    const answer = await removed.json()
    assert.equal(answer.removed, true)
    assert.equal(answer.sessions, false)
    assert.equal(answer.sessionsReason, 'DSH_UNREACHABLE')
    assert.equal(archiveCalls(), 1)
    assert.ok(Date.now() - started < 5_000, `the delete answered in ${Date.now() - started} ms`)
  }
)

test(
  'DELETE /api/sites/:key: without the archive door the answer says so instead of claiming the sessions moved',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor }
    })
    await pool.query("insert into site (site_key, label, host) values ('bare.localhost', 'bare', 'local')")
    await seatRow(pool, 'bare.localhost', 'owner@x.y', 'owner')
    const removed = await send('DELETE', '/api/sites/bare.localhost', await cookieFor('owner@x.y'))
    const body = await removed.json()
    assert.equal(body.sessions, false)
    assert.equal(body.sessionsReason, 'NO_DSH_DOOR')
    assert.equal(calls.filter((c) => c.url.endsWith('/gateway/seat/archive-sessions')).length, 0)
  }
)

test(
  'DELETE /api/sites/:key/claim: releases an import no host was asked to build, and nothing else',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    // `mintSeatSession`: an unfinished import is released through the Remove path, which asks the
    // host that ran its read (`sites/import-remove.js`).
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { forgetWorkspaceAtDoor, mintSeatSession: async () => 'lane-token' }
    })
    await pool.query(
      `insert into site (site_key, label, host, origin) values
         ('dead.example', 'dead-example', 'local', 'migrated'),
         ('built.example', 'built-example', 'local', 'migrated'),
         ('born.localhost', 'born', 'local', 'fleet_born')`
    )
    await pool.query(
      "insert into job (id, site_key, host, kind) values ('j1', 'built.example', 'local', 'provision')"
    )
    for (const key of ['dead.example', 'built.example', 'born.localhost']) {
      await seatRow(pool, key, 'owner@x.y', 'owner')
    }
    await seatRow(pool, 'dead.example', 'editor@x.y', 'editor')

    const refused = await send('DELETE', '/api/sites/dead.example/claim', await cookieFor('editor@x.y'))
    assert.equal(refused.status, 403)

    const owner = await cookieFor('owner@x.y')
    for (const key of ['built.example', 'born.localhost']) {
      const kept = await send('DELETE', `/api/sites/${key}/claim`, owner)
      assert.equal(kept.status, 409)
      assert.deepEqual(await kept.json(), { code: 'SITE_IN_USE' })
    }

    const released = await send('DELETE', '/api/sites/dead.example/claim', owner)
    assert.equal(released.status, 200)
    assert.deepEqual(await released.json(), { released: true })
    const left = await pool.query('select site_key from site order by site_key')
    assert.deepEqual(
      left.rows.map((r) => r.site_key),
      ['born.localhost', 'built.example']
    )
    // Nothing was built, so there is nothing on a host to tear down; the host that ran the read was
    // asked to hold the site, then to forget it.
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/teardown')).length, 0)
    assert.deepEqual(
      calls
        .filter((c) => c.url.endsWith('/new/api/tracy-add-site/hold'))
        .map((c) => JSON.parse(c.init.body).op),
      ['hold', 'forget']
    )
  }
)

test(
  'DELETE /api/sites/:key: a finished import torn down asks its add-site host to forget the read; a built site does not',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ teardownJob: { states: ['done'] } })
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: {
        forgetWorkspaceAtDoor,
        revokeSeatAtDoor,
        archiveSessionsAtDoor,
        mintSeatSession: async () => 'lane-token'
      }
    })
    await pool.query(
      `insert into site (site_key, label, host, origin, port) values
         ('shop.example', 'shop-example', 'local', 'migrated', 8123),
         ('born.localhost', 'born', 'local', 'fleet_born', 8124)`
    )
    await pool.query(
      "insert into job (id, site_key, host, kind) values ('j1', 'shop.example', 'local', 'provision')"
    )
    for (const key of ['shop.example', 'born.localhost']) await seatRow(pool, key, 'owner@x.y', 'owner')
    const owner = await cookieFor('owner@x.y')
    const holdOps = () =>
      calls.filter((c) => c.url.endsWith('/new/api/tracy-add-site/hold')).map((c) => JSON.parse(c.init.body))

    assert.equal((await send('DELETE', '/api/sites/born.localhost', owner)).status, 200)
    assert.deepEqual(holdOps(), [], 'a site built in Tracy has no read on the add-site host')

    assert.equal((await send('DELETE', '/api/sites/shop.example', owner)).status, 200)
    assert.equal((await pool.query("select 1 from site where site_key = 'shop.example'")).rows.length, 0)
    assert.deepEqual(
      holdOps().map((b) => [b.op, b.siteKey]),
      [
        ['hold', 'shop.example'],
        ['forget', 'shop.example'],
        ['release', 'shop.example']
      ]
    )
  }
)

test(
  'DELETE /api/sites/:key: an editor is refused; the owner tears it down and the row is gone',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ teardownJob: { states: ['running', 'done'] } })
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { forgetWorkspaceAtDoor, revokeSeatAtDoor, archiveSessionsAtDoor }
    })
    await pool.query(
      "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
    )
    await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')
    await seatRow(pool, 'lantern.localhost', 'editor@x.y', 'editor')

    const editor = await cookieFor('editor@x.y')
    const refused = await send('DELETE', '/api/sites/lantern.localhost', editor)
    assert.equal(refused.status, 403)
    assert.deepEqual(await refused.json(), { code: 'NOT_SITE_OWNER' })

    const owner = await cookieFor('owner@x.y')
    const removed = await send('DELETE', '/api/sites/lantern.localhost', owner)
    assert.equal(removed.status, 200)
    assert.deepEqual(await removed.json(), {
      removed: true,
      host: true,
      repo: false,
      sessions: true,
      seats: true
    })
    // No repo on record, so GitHub is never asked anything (#338).
    assert.equal(calls.filter((c) => new URL(c.url).hostname === 'api.github.com').length, 0)
    // The dsh forgets the folder's sessions FIRST: it can only find them while the folder the
    // teardown removes still exists, and the label (so the folder) comes back if the site does.
    const forget = calls.findIndex((c) => c.url === 'http://dsh.test/gateway/seat/forget-workspace')
    const teardown = calls.findIndex(
      (c) => c.url.endsWith('/_host/go-live') && JSON.parse(c.init.body).op === 'teardown'
    )
    assert.ok(forget !== -1 && teardown !== -1 && forget < teardown, 'forget-workspace before teardown')
    // The teardown is asked for under the operation's own key, and never through the unkeyed door.
    assert.match(JSON.parse(calls[teardown].init.body).jobKey, /^publish:[0-9a-f]{32}$/)
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/teardown')).length, 0)
    assert.deepEqual(JSON.parse(calls[forget].init.body), { path: '/site/lantern' })
    // The session folder leaves the store only AFTER the host said the teardown ended: the dsh
    // refuses while `/site/lantern` exists, and `/teardown` only starts the job.
    const archive = calls.findIndex((c) => c.url === 'http://dsh.test/gateway/seat/archive-sessions')
    const polls = calls
      .map((c, i) => (c.url.endsWith('/_host/jobs/teardown-1') ? i : -1))
      .filter((i) => i !== -1)
    assert.equal(polls.length, 2, 'polled until the job said done')
    assert.ok(archive > polls[1], 'archive-sessions after the teardown job ended')
    assert.deepEqual(JSON.parse(calls[archive].init.body), { path: '/site/lantern' })
    // Every live seat is revoked at the dsh too, not only in the book: a browser keeps its seat
    // cookie for twelve hours, and the same site added back under the same name mints the same
    // grant fingerprint — so that cookie would be reused, on a seat whose workspace the forget
    // above just removed ("Choose workspace", measured 25/09 on wp-test1.tracy.test).
    const revoked = calls
      .filter((c) => c.url === 'http://dsh.test/gateway/seat/revoke')
      .map((c) => JSON.parse(c.init.body))
      .sort((a, b) => a.email.localeCompare(b.email))
    assert.deepEqual(revoked, [
      { email: 'editor@x.y', site: 'lantern.localhost' },
      { email: 'owner@x.y', site: 'lantern.localhost' }
    ])

    assert.equal(
      (await pool.query('select 1 from site where site_key = $1', ['lantern.localhost'])).rows.length,
      0
    )
    assert.equal(
      (await pool.query('select 1 from seat where site_key = $1', ['lantern.localhost'])).rows.length,
      0
    )
  }
)

// ── runSiteJob's poll loop, and a smoke test per webroot door it backs ───────────────────────────
//
// `changes` is the vehicle for the three loop-behavior cases (a plain GET, so no body to build) —
// `runSiteJob` itself is shared code, not re-implemented per door, so exercising the loop once is
// exercising it for all six. Each remaining door then gets its own smoke test proving it reaches
// the host with the door's own `kind` and fields, per the review's request.

test(
  'runSiteJob (via GET .../changes): a job that starts queued and finishes done is polled to completion',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: {
        states: ['queued', 'done'],
        output: '{"ok":true,"since":{"version":1,"sha":"a"},"moments":[{"title":"x"}],"files":["a.php"]}'
      }
    })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/changes', owner)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      since: { version: 1, sha: 'a' },
      moments: [{ title: 'x' }],
      files: ['a.php'],
      // An older host answers no ceiling flags: null, never a guess.
      truncated: null
    })

    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    assert.deepEqual(JSON.parse(siteCall.init.body), { kind: 'webroot-changes', label: 'lantern' })
    // Two polls: one for 'queued', one for 'done' — the loop did not stop early or spin forever.
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/jobs/site-job-1')).length, 2)
  }
)

test(
  'runSiteJob (via GET .../changes): a job the host reports failed is surfaced as FLEET_JOB_FAILED, not thrown',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({
      siteJob: { states: ['queued', 'failed'], output: 'ensure_repo_built: no such file' }
    })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/changes', owner)
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), {
      code: 'FLEET_JOB_FAILED',
      reason: 'ensure_repo_built: no such file'
    })
  }
)

test(
  'runSiteJob (via GET .../changes): a job that never finishes hits the deadline and answers FLEET_JOB_PENDING, without ever actually waiting out the deadline',
  opts,
  async () => {
    const { pool } = db
    // Never a terminal state — the loop's only way out is the deadline.
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { states: ['queued'] } })
    // Three `now()` calls in `runSiteJob`: `begun`, the loop condition before the one poll this
    // test lets run, and the loop condition after it — jumping straight past the 45s deadline on
    // that third call ends the loop after exactly one real (120ms) wait rather than 45 real
    // seconds, without touching `changes`'s own deadline constant.
    const { cookieFor, get } = harness(pool, { fetchImpl, now: stepClock([0, 0, 100_000]) })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/changes', owner)
    assert.equal(res.status, 202)
    assert.deepEqual(await res.json(), { code: 'FLEET_JOB_PENDING' })
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/jobs/site-job-1')).length, 1)
  }
)

// BUG-L4-2 (Site changes V2, round L4): a host that took the job and then stopped answering held
// the activity door for 302 s — the socket's own timeout — because no call to the host had one.
// The Git read is `bounded`: each call gets what is left of its 45 s, and the door answers 202.
// The clock jumps 44.5 s when the job is posted, so the poll has ~0.5 s left and the test lasts ~1 s.
for (const [label, query] of [
  ['V1', ''],
  ['V2', '?version=2']
]) {
  test(
    `activity ${label}: a host that stops answering mid-job is a 202 at the deadline, not a hang`,
    opts,
    async () => {
      const { pool } = db
      const { fetchImpl: answers } = fakeNetwork()
      let skew = 0
      const polls = []
      const fetchImpl = async (input, init) => {
        const path = new URL(String(input)).pathname
        if (path === '/_host/site' && JSON.parse(init.body).kind === 'webroot-history') {
          skew = 44_500
          return new Response(JSON.stringify({ jobId: 'site-job-1' }), { status: 200 })
        }
        if (path === '/_host/jobs/site-job-1') {
          polls.push(init.signal)
          // The host never answers: only our own signal ends this call.
          return new Promise((_, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal.reason))
          })
        }
        return answers(input, init)
      }
      const { cookieFor, get } = harness(pool, { fetchImpl, now: () => Date.now() + skew })
      await ownedSite(pool)
      const owner = await cookieFor('owner@x.y')
      const started = Date.now()
      const res = await get(`/api/sites/lantern.localhost/activity${query}`, owner)
      const took = Date.now() - started
      assert.equal(res.status, 202)
      assert.deepEqual(await res.json(), { code: 'FLEET_JOB_PENDING' })
      assert.ok(took < 5_000, `answered in ${took} ms, not after the socket's timeout`)
      assert.ok(polls.length >= 1 && polls.every((signal) => signal instanceof AbortSignal))
    }
  )
}

test('runSiteJob: a caller that did not ask for a bound gives no host call a timeout', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: '{"ok":true,"rows":[]}' } })
  const { cookieFor, get } = harness(pool, { fetchImpl })
  await ownedSite(pool)
  const owner = await cookieFor('owner@x.y')
  assert.equal((await get('/api/sites/lantern.localhost/changes', owner)).status, 200)
  const hostCalls = calls.filter((c) => c.url.includes('/_host/'))
  assert.ok(hostCalls.length >= 2)
  assert.ok(
    hostCalls.every((c) => c.init.signal === undefined),
    'no signal: no new timeout'
  )
})

test('GET /api/sites/:key/backups: reaches the host with kind webroot-history', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeNetwork({
    siteJob: { output: '{"ok":true,"latest":{"version":2,"sha":"b"},"rows":[{"version":2}]}' }
  })
  const { cookieFor, get } = harness(pool, { fetchImpl })
  await ownedSite(pool)
  const owner = await cookieFor('owner@x.y')

  const res = await get('/api/sites/lantern.localhost/backups', owner)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    latest: { version: 2, sha: 'b' },
    rows: [{ version: 2 }],
    truncated: false,
    may: { restoreFiles: true, restoreEverything: true, export: true }
  })
  const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
  assert.deepEqual(JSON.parse(siteCall.init.body), { kind: 'webroot-history', label: 'lantern' })
})

test(
  'GET /api/sites/:key/backups: preserves EmDash app snapshot availability per backup point',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({
      siteJob: {
        output:
          '{"ok":true,"latest":{"version":2,"sha":"b"},"rows":[{"kind":"backup","version":2,"applicationAvailable":false},{"kind":"backup","version":1,"applicationAvailable":true}]}'
      }
    })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const res = await get('/api/sites/lantern.localhost/backups', owner)
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.deepEqual(
      body.rows.map(({ version, applicationAvailable }) => [version, applicationAvailable]),
      [
        [2, false],
        [1, true]
      ]
    )
  }
)

test(
  'GET .../backups asked twice at once: one webroot-history job on the host answers both',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { states: ['running', 'done'], output: '{"ok":true,"latest":null,"rows":[]}' }
    })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const answers = await Promise.all([
      get('/api/sites/lantern.localhost/backups', owner),
      get('/api/sites/lantern.localhost/backups', owner)
    ])
    assert.deepEqual(
      answers.map((r) => r.status),
      [200, 200]
    )
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/site')).length, 1, 'one job filed')
  }
)

test(
  'GET .../changes and .../backups: every person the host names wears the face /api/team gives their account; anyone else null',
  opts,
  async () => {
    const { pool } = db
    await ownedSite(pool)
    await pool.query(
      `update account set display_name = 'Ada Lovelace', avatar_url = 'https://lh3.googleusercontent.com/a/ada=s96-c'
        where email = 'owner@x.y'`
    )
    const account = (
      await pool.query(`select id, email, display_name, avatar_url from account where email = 'owner@x.y'`)
    ).rows[0]
    const ada = personFace(account)
    const seat = { kind: 'person', name: 'Ada', email: 'OWNER@x.y' }
    const stranger = { kind: 'person', name: 'Ola', email: 'ola@outside.test' }

    const changes = fakeNetwork({
      siteJob: {
        output: JSON.stringify({
          ok: true,
          since: { version: 1, sha: 'a' },
          moments: [
            { sha: 'c', title: 'by Ada', by: seat },
            { sha: 'd', title: 'by Ola', by: stranger },
            { sha: 'e', title: 'by the agent', by: { kind: 'agent' } }
          ],
          files: [
            { path: 'a.php', by: seat },
            { path: 'b.php', by: { kind: 'outside' } }
          ]
        })
      }
    })
    const one = harness(pool, { fetchImpl: changes.fetchImpl })
    const body = await (
      await one.get('/api/sites/lantern.localhost/changes', await one.cookieFor('owner@x.y'))
    ).json()
    assert.deepEqual(
      body.moments.map((m) => m.by),
      [{ ...seat, face: ada }, { ...stranger, face: null }, { kind: 'agent' }]
    )
    assert.deepEqual(
      body.files.map((f) => f.by),
      [{ ...seat, face: ada }, { kind: 'outside' }]
    )
    assert.match(
      ada.avatarUrl,
      /^\/auth\/avatar\/[0-9a-f-]{36}\?v=[0-9a-f]{8}$/,
      'Tracy’s own address for the picture'
    )

    const backups = fakeNetwork({
      siteJob: {
        output: JSON.stringify({
          ok: true,
          latest: { version: 2, sha: 'b' },
          rows: [
            { kind: 'backup', version: 2, sha: 'b', by: seat },
            { kind: 'moment', sha: 'f', by: stranger }
          ]
        })
      }
    })
    const two = harness(pool, { fetchImpl: backups.fetchImpl })
    const listed = await (
      await two.get('/api/sites/lantern.localhost/backups', await two.cookieFor('owner@x.y'))
    ).json()
    assert.deepEqual(
      listed.rows.map((r) => r.by),
      [
        { ...seat, face: ada },
        { ...stranger, face: null }
      ]
    )
  }
)

test(
  'POST /api/sites/:key/backup: carries byEmail always, and byName when the account has a display name',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: {
        output: '{"ok":true,"version":3,"title":"v3","fleetSha":"abc123"}'
      }
    })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const ownerId = await (async () => {
      await ownedSite(pool)
      const { rows } = await pool.query('select id from account where email = $1', ['owner@x.y'])
      return rows[0].id
    })()
    await pool.query('update account set display_name = $2 where id = $1', [ownerId, 'Ada Lovelace'])
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/backup', owner, { title: 'v3' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      ok: true,
      version: 3,
      title: 'v3',
      sha: 'abc123',
      // A host that predates backups (ADR 0024) says nothing about a database.
      database: { state: 'unknown-host', engine: null, sha256: null, size: null }
    })

    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    assert.deepEqual(JSON.parse(siteCall.init.body), {
      kind: 'webroot-backup',
      title: 'v3',
      byEmail: 'owner@x.y',
      byName: 'Ada Lovelace',
      label: 'lantern'
    })
    const { rows } = await pool.query(
      "select actor, detail from audit where site_key = $1 and action = 'site.backup'",
      ['lantern.localhost']
    )
    assert.deepEqual(rows, [{ actor: 'owner@x.y', detail: { title: 'v3', version: 3, sha: 'abc123' } }])
  }
)

test(
  'POST /api/sites/:key/backup: no display name on the account means no byName field at all — never a blank one',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { output: '{"ok":true,"version":1,"title":"v1"}' }
    })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/backup', owner, { title: 'v1' })
    assert.equal(res.status, 200)
    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    const sent = JSON.parse(siteCall.init.body)
    assert.equal('byName' in sent, false)
    assert.equal(sent.byEmail, 'owner@x.y')
  }
)

// #1403 item 9: the door's two-minute wait ran out while the host went on making the backup. The
// 502 it answered read "Nothing on the site was changed", the person pressed again, and the site
// got a second backup. The door does not look at the CMS; each one is pressed all the same.
for (const platform of ['wordpress', 'joomla', 'emdash']) {
  test(
    `POST /api/sites/:key/backup (${platform}): a slow request identifies its own pending job, and a second press identifies that foreign job`,
    opts,
    async () => {
      const { pool } = db
      const { fetchImpl, calls } = fakeNetwork({ siteJob: { states: ['running'] } })
      // `begun`, the loop condition before the one poll, then past the two minutes.
      const { cookieFor, send } = harness(pool, { fetchImpl, now: stepClock([0, 0, 200_000]) })
      await ownedSite(pool)
      await pool.query('update site set platform = $2 where site_key = $1', ['lantern.localhost', platform])
      const owner = await cookieFor('owner@x.y')

      const first = await send('POST', '/api/sites/lantern.localhost/backup', owner, {
        title: 'Before launch'
      })
      assert.equal(first.status, 202)
      const firstBody = await first.json()
      assert.deepEqual(firstBody, {
        code: 'BACKUP_PENDING',
        jobId: 'site-job-1',
        startedByRequest: true
      })
      const audited = await pool.query("select 1 from audit where site_key = $1 and action = 'site.backup'", [
        'lantern.localhost'
      ])
      assert.equal(audited.rowCount, 0)

      // The host still says `running`: the second press is answered from that job.
      const second = await send('POST', '/api/sites/lantern.localhost/backup', owner, { title: 'Again' })
      assert.equal(second.status, 202)
      assert.deepEqual(await second.json(), {
        code: 'BACKUP_PENDING',
        jobId: 'site-job-1',
        startedByRequest: false
      })
      assert.equal(calls.filter((c) => c.url.endsWith('/_host/site')).length, 1)
    }
  )
}

test(
  'POST /api/sites/:key/backup: once the host ended the backup that held the door, the next press makes a new one',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { states: ['done'], output: '{"ok":true,"version":4,"title":"Next"}' }
    })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    // A backup job the door stopped waiting for: its row still says running; the host says done.
    await pool.query(
      "insert into job (id, site_key, host, kind, state) values ($1, $2, 'local', 'webroot-backup', 'running')",
      ['site-job-1', 'lantern.localhost']
    )
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/backup', owner, { title: 'Next' })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).version, 4)
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/site')).length, 1)
    const { rows } = await pool.query("select state from job where id = 'site-job-1'")
    assert.equal(rows[0].state, 'done')
  }
)

test(
  'POST /api/sites/:key/backup: a host that failed the backup is still a 502 FLEET_JOB_FAILED',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ siteJob: { states: ['failed'], output: 'disk full' } })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/backup', owner, { title: 'v1' })
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { code: 'FLEET_JOB_FAILED', reason: 'disk full' })
  }
)

test(
  'POST /api/sites/:key/moment: reaches the host with kind webroot-moment and the title',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { output: '{"ok":true,"committed":true,"files":2,"head":"abc"}' }
    })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/moment', owner, {
      title: 'agent: fixed a typo'
    })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, committed: true, files: 2, head: 'abc' })
    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    assert.deepEqual(JSON.parse(siteCall.init.body), {
      kind: 'webroot-moment',
      title: 'agent: fixed a typo',
      label: 'lantern'
    })
    const { rows } = await pool.query(
      "select actor, detail from audit where site_key = $1 and action = 'site.moment'",
      ['lantern.localhost']
    )
    assert.deepEqual(rows, [
      { actor: 'owner@x.y', detail: { title: 'agent: fixed a typo', committed: true, head: 'abc' } }
    ])
  }
)

// SC-3 (dev 11/10/2026): a setup run holds the webroot like a chat turn — the seal under its own turn before the first
// write, its moment under the same turn once the writes are over — and the moment it heard back from is recorded.
test(
  'setupWebroot: the run seals under its own turn, then commits its moment and records the carrier write',
  opts,
  async () => {
    const { pool } = db
    const run = '0f6c8a52-6a63-4f0c-9d3e-3b1f2f0d7a11'
    const sealed = 'a'.repeat(40)
    const moment = 'b'.repeat(40)
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: {
        byKind: {
          'webroot-seal-outside': {
            state: 'done',
            output: JSON.stringify({
              ok: true,
              sealed: { sha: sealed, files: ['wp-config-extra.php'], at: 1791700000, parentAt: 1791699900 },
              skipped: null,
              outside: []
            })
          },
          'webroot-moment': {
            state: 'done',
            output: JSON.stringify({
              ok: true,
              committed: true,
              files: 25,
              sha: moment,
              head: moment,
              paths: []
            })
          }
        }
      }
    })
    const { app } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await pool.query(`update site set platform = 'wordpress' where site_key = 'lantern.localhost'`)
    const who = { siteKey: 'lantern.localhost', runId: run, email: 'owner@x.y' }

    assert.deepEqual(await app.setupWebroot('open', who), { held: true })
    assert.deepEqual(await app.setupWebroot('close', who), { held: true })
    const jobs = hostSiteCalls(calls).map((c) => JSON.parse(c.init.body))
    assert.deepEqual(jobs, [
      { kind: 'webroot-seal-outside', turn: `setup-${run}:1`, label: 'lantern' },
      { kind: 'webroot-moment', title: 'Tracy setup', turn: `setup-${run}:1`, label: 'lantern' }
    ])
    // What was dirty before the run is kept as outside, as a turn's open keeps it.
    const { rows: outside } = await pool.query('select sha, cause from site_outside where site_key = $1', [
      'lantern.localhost'
    ])
    assert.deepEqual(outside, [{ sha: sealed, cause: 'seal' }])
    const { rows: writes } = await pool.query(
      'select actor, action, via, origin, origin_ref, outcome, target from site_write where site_key = $1',
      ['lantern.localhost']
    )
    assert.deepEqual(writes, [
      {
        actor: 'owner@x.y',
        action: 'setup.files',
        via: 'setup-moment',
        origin: 'setup',
        origin_ref: run,
        outcome: 'ok',
        target: { sha: moment, files: 25 }
      }
    ])
  }
)

test('setupWebroot: an EmDash site keeps no webroot history, so nothing is held', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeNetwork()
  const { app } = harness(pool, { fetchImpl })
  await ownedSite(pool)
  await pool.query(`update site set platform = 'emdash' where site_key = 'lantern.localhost'`)
  const who = {
    siteKey: 'lantern.localhost',
    runId: '0f6c8a52-6a63-4f0c-9d3e-3b1f2f0d7a11',
    email: 'owner@x.y'
  }
  assert.deepEqual(await app.setupWebroot('open', who), { held: false })
  assert.equal(hostSiteCalls(calls).length, 0)
})

test(
  'GET /api/sites/:key/file-diff: reaches the host with kind webroot-file-diff and the path',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: 'plain text diff, not JSON' } })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/file-diff?path=wp-content/index.php', owner)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      path: 'wp-content/index.php',
      diff: 'plain text diff, not JSON',
      truncated: false
    })
    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    assert.deepEqual(JSON.parse(siteCall.init.body), {
      kind: 'webroot-file-diff',
      path: 'wp-content/index.php',
      label: 'lantern'
    })
  }
)

test(
  'GET /api/sites/:key/file-diff?sha=: asks the host for the diff IN that moment; a malformed sha is 400',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: '+one line' } })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/file-diff?path=wp-content/a.css&sha=abc1234', owner)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      path: 'wp-content/a.css',
      diff: '+one line',
      truncated: false,
      sha: 'abc1234'
    })
    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    assert.deepEqual(JSON.parse(siteCall.init.body), {
      kind: 'webroot-file-diff',
      path: 'wp-content/a.css',
      sha: 'abc1234',
      label: 'lantern'
    })
    const bad = await get('/api/sites/lantern.localhost/file-diff?path=wp-content/a.css&sha=HEAD~1', owner)
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).code, 'INVALID_SHA')
  }
)

test(
  'GET /api/sites/:key/moments/:sha/files: reaches the host with kind webroot-commit and the sha, and passes the files through',
  opts,
  async () => {
    const { pool } = db
    const files = [
      { path: 'wp-content/themes/x/style.css', status: 'modified', additions: 3, deletions: 1 },
      { path: 'wp-content/uploads/a.jpg', status: 'added', additions: null, deletions: null }
    ]
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { output: JSON.stringify({ ok: true, sha: 'abcdef1234567', files }) }
    })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await get('/api/sites/lantern.localhost/moments/abcdef1/files', owner)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { sha: 'abcdef1234567', files, truncated: false })
    const siteCall = calls.find((c) => c.url.endsWith('/_host/site'))
    assert.deepEqual(JSON.parse(siteCall.init.body), {
      kind: 'webroot-commit',
      sha: 'abcdef1',
      label: 'lantern'
    })
  }
)

test(
  'GET /api/sites/:key/moments/:sha/files: a moment past the host cap says truncated, so the tab never shows 500 of 1277 as all',
  opts,
  async () => {
    const { pool } = db
    const files = [{ path: 'a.php', status: 'added', additions: 1, deletions: 0 }]
    const { fetchImpl } = fakeNetwork({
      siteJob: { output: JSON.stringify({ ok: true, sha: 'abcdef1234567', files, truncated: true }) }
    })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const res = await get('/api/sites/lantern.localhost/moments/abcdef1/files', await cookieFor('owner@x.y'))
    assert.equal(res.status, 200)
    assert.equal((await res.json()).truncated, true)
  }
)

test(
  'GET /api/sites/:key/moments/:sha/files: refuses a sha that is not hex, before the host is asked; refuses a viewer without a seat',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: '{"ok":true,"files":[]}' } })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const bad = await get('/api/sites/lantern.localhost/moments/HEAD~1/files', owner)
    assert.equal(bad.status, 400)
    assert.deepEqual(await bad.json(), { code: 'INVALID_SHA' })
    const short = await get('/api/sites/lantern.localhost/moments/abc12/files', owner)
    assert.equal(short.status, 400)

    const stranger = await cookieFor('stranger@x.y')
    const refused = await get('/api/sites/lantern.localhost/moments/abcdef1/files', stranger)
    assert.equal(refused.status, 403)
    assert.equal(
      calls.some((c) => c.url.endsWith('/_host/site')),
      false
    )
  }
)

test(
  'POST /api/sites/:key/restore: reaches the host with the mode-selected kind and the sha',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: '{"ok":true,"files":3,"head":"def"}' } })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/restore', owner, {
      sha: 'abcdef1',
      mode: 'undo'
    })
    assert.equal(res.status, 200)
    // V2 adds `operationId`/`status`; the fields an older client reads are unchanged. A `head` that
    // is no full sha cannot be verified as a restore commit: the operation stays `unknown`.
    const answer = await res.json()
    assert.deepEqual(
      { ...answer, operationId: undefined },
      {
        ok: true,
        files: 3,
        head: 'def',
        operationId: undefined,
        status: 'unknown'
      }
    )
    // First a read-only look at the target (full sha + scope), then the restore itself.
    const siteCall = calls.filter((c) => c.url.endsWith('/_host/site')).map((c) => JSON.parse(c.init.body))
    assert.deepEqual(siteCall, [
      { kind: 'webroot-commit', sha: 'abcdef1', label: 'lantern' },
      { kind: 'webroot-restore-undo', sha: 'abcdef1', label: 'lantern' }
    ])
    const { rows } = await pool.query(
      "select actor, detail from audit where site_key = $1 and action = 'site.restore'",
      ['lantern.localhost']
    )
    assert.deepEqual(rows, [
      {
        actor: 'owner@x.y',
        detail: { mode: 'undo', sha: 'abcdef1', head: 'def', operationId: answer.operationId }
      }
    ])
  }
)

// ── Q1 (plan todo-site-changes): configuration files and the undo guard ─────────────────────

const hostSiteCalls = (calls) => calls.filter((c) => c.url.endsWith('/_host/site'))

test(
  'GET /api/sites/:key/file-diff: a configuration file is named but never read, by any spelling and for every role',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: "define('DB_PASSWORD','fixture');" } })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await seatRow(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    for (const who of ['owner@x.y', 'editor@x.y']) {
      const cookie = await cookieFor(who)
      for (const [query, path] of [
        ['wp-config.php', 'wp-config.php'],
        ['.%2Fwp-config.php', 'wp-config.php'],
        ['blog%2F%2Fwp-config.php', 'blog/wp-config.php'],
        ['wp%252Dconfig.php', 'wp%2Dconfig.php'],
        ['configuration.php', 'configuration.php'],
        ['.env.local', '.env.local']
      ]) {
        const res = await get(`/api/sites/lantern.localhost/file-diff?path=${query}`, cookie)
        assert.equal(res.status, 200, query)
        assert.deepEqual(await res.json(), { path, blocked: true, reason: 'configuration-file' }, query)
      }
    }
    assert.equal(hostSiteCalls(calls).length, 0, 'the host is never asked for the bytes')
  }
)

test(
  'GET /api/sites/:key/file-diff: a path with git pathspec magic or no file in it is refused before the host',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: 'x' } })
    const { cookieFor, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')
    for (const query of [
      '.',
      '%3A(glob)**%2Fwp-config.php',
      '*config.php',
      'wp-config.ph%3F',
      'a%2F..%2F..%2Fx'
    ]) {
      const res = await get(`/api/sites/lantern.localhost/file-diff?path=${query}`, owner)
      assert.equal(res.status, 400, query)
      assert.deepEqual(await res.json(), { code: 'INVALID_PATH' }, query)
    }
    assert.equal(hostSiteCalls(calls).length, 0)
  }
)

test(
  'GET /api/sites/:key/file-diff: the host gets the normalized path; a host that refuses the file answers blocked, not 502',
  opts,
  async () => {
    const { pool } = db
    const first = fakeNetwork({ siteJob: { output: '+a' } })
    const { cookieFor, get } = harness(pool, { fetchImpl: first.fetchImpl })
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')
    const res = await get('/api/sites/lantern.localhost/file-diff?path=wp-content%2F%2F.%2Findex.php', owner)
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(hostSiteCalls(first.calls)[0].init.body).path, 'wp-content/index.php')

    const refusing = fakeNetwork({
      siteJob: {
        states: ['failed'],
        output: '{"ok":false,"code":"CONFIG_FILE_BLOCKED","blocked":true,"reason":"configuration-file"}'
      }
    })
    const second = harness(pool, { fetchImpl: refusing.fetchImpl })
    const blocked = await second.get(
      '/api/sites/lantern.localhost/file-diff?path=wp-content/secrets.php',
      await second.cookieFor('owner@x.y')
    )
    assert.equal(blocked.status, 200)
    assert.deepEqual(await blocked.json(), {
      path: 'wp-content/secrets.php',
      blocked: true,
      reason: 'configuration-file'
    })

    // tracy-host's job validator refusing the path before any job runs reads the same.
    const validator = fakeNetwork({ siteJob: { output: 'x' } })
    const refusingHost = async (input, init) =>
      new URL(String(input)).pathname === '/_host/site'
        ? new Response(JSON.stringify({ code: 'BAD_REQUEST', why: 'refused path: CONFIG_FILE_BLOCKED' }), {
            status: 400
          })
        : validator.fetchImpl(input, init)
    const third = harness(pool, { fetchImpl: refusingHost })
    const refused = await third.get(
      '/api/sites/lantern.localhost/file-diff?path=wp-content/secrets.php',
      await third.cookieFor('owner@x.y')
    )
    assert.equal(refused.status, 200)
    assert.equal((await refused.json()).blocked, true)
  }
)

test(
  'POST /api/sites/:key/restore: a seat without the code toolset is refused 403 FORBIDDEN_WRITE for undo and reset, before the host',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ siteJob: { output: '{"ok":true,"files":1,"head":"def"}' } })
    const { cookieFor, send } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await seatRow(pool, 'lantern.localhost', 'viewer@x.y', 'viewer')
    const viewer = await cookieFor('viewer@x.y')
    for (const mode of ['undo', 'reset']) {
      const res = await send('POST', '/api/sites/lantern.localhost/restore', viewer, { sha: 'abcdef1', mode })
      assert.equal(res.status, 403, mode)
      assert.deepEqual(await res.json(), { code: 'FORBIDDEN_WRITE', toolset: 'code', role: 'viewer' })
    }
    assert.equal(hostSiteCalls(calls).length, 0)
    const { rows } = await pool.query("select 1 from audit where action = 'site.restore'")
    assert.equal(rows.length, 0)
  }
)

test('POST /api/sites/:key/restore: an editor may undo (the code toolset, ADR 0028)', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ siteJob: { output: '{"ok":true,"files":1,"head":"def"}' } })
  const { cookieFor, send } = harness(pool, { fetchImpl })
  await ownedSite(pool)
  await seatRow(pool, 'lantern.localhost', 'editor@x.y', 'editor')
  for (const who of ['editor@x.y']) {
    const res = await send('POST', '/api/sites/lantern.localhost/restore', await cookieFor(who), {
      sha: 'abcdef1',
      mode: 'undo'
    })
    assert.equal(res.status, 200, who)
  }
})

test(
  'POST /api/sites/:key/restore: the host refusing with CONFLICT or NOT_UNDOABLE is a 409 with its code and files, and no audit row',
  opts,
  async () => {
    const { pool } = db
    for (const [output, expected] of [
      [
        '==> narration\n{"ok":false,"code":"CONFLICT","files":["wp-content/themes/tracy/style.css"]}',
        { code: 'CONFLICT', files: ['wp-content/themes/tracy/style.css'] }
      ],
      ['{"ok":false,"code":"NOT_UNDOABLE"}', { code: 'NOT_UNDOABLE' }]
    ]) {
      const { fetchImpl } = fakeNetwork({ siteJob: { output } })
      const { cookieFor, send } = harness(pool, { fetchImpl })
      if (!(await pool.query("select 1 from site where site_key = 'lantern.localhost'")).rows.length)
        await ownedSite(pool)
      const res = await send('POST', '/api/sites/lantern.localhost/restore', await cookieFor('owner@x.y'), {
        sha: 'abcdef1',
        mode: 'undo'
      })
      assert.equal(res.status, 409, output)
      const { operationId, status, ...rest } = await res.json()
      assert.deepEqual(rest, expected)
      assert.equal(status, 'failed')
      assert.ok(operationId)
    }
    const { rows } = await pool.query("select 1 from audit where action = 'site.restore'")
    assert.equal(rows.length, 0)
  }
)

// ── A moment recorded by the host's one dsh (ADR 0014) ─────────────────────────────────────────
// That dsh serves every site and holds nobody's browser cookie, so `tracy-site-tabs` signs the
// moment as the person who typed the turn and names the site folder the session stands in. Before,
// it read a site key the host dsh does not have, recorded nothing, and the agent's edits were later
// sealed as "outside Tracy".

/** A prompter assertion as the password gate mints it (`dsh-passwords`' `tracyAssertion`). */
function assertionFor(email, secret) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(realNow() / 1000) + 60 })).toString(
    'base64url'
  )
  return `v1.${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

test(
  'POST /api/sites/:key/moment: a signed prompter records it, held to the site of their conversation, and the audit names them',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { output: '{"ok":true,"committed":true,"files":1,"head":"abc"}' }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'moment-actor-test-key' }
    })
    await ownedSite(pool)
    await pool.query(
      "insert into site (site_key, label, host) values ('harbor.localhost', 'harbor', 'local')"
    )
    await seatRow(pool, 'harbor.localhost', 'owner@x.y', 'owner')
    const moment = (key, email, label) =>
      app.fetch(
        new Request(`http://tracy.test/api/sites/${key}/moment`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tracy-actor': assertionFor(email, config.actorSecret),
            ...(label ? { 'x-tracy-workspace-label': label } : {})
          },
          body: JSON.stringify({ title: 'Fix the footer' })
        })
      )

    const named = await moment('lantern.localhost', 'owner@x.y', 'lantern')
    assert.equal(named.status, 200)
    assert.deepEqual(await named.json(), { ok: true, committed: true, files: 1, head: 'abc' })
    // `_conversation` is "the site this folder is": the host dsh need not know the key at all.
    assert.equal((await moment('_conversation', 'owner@x.y', 'lantern')).status, 200)

    // The same person holds a seat on harbor too; a lantern conversation still cannot record there.
    const other = await moment('harbor.localhost', 'owner@x.y', 'lantern')
    assert.equal(other.status, 403)
    assert.equal((await other.json()).code, 'SITE_OUTSIDE_CONVERSATION')
    assert.equal((await moment('_conversation', 'owner@x.y', 'nowhere')).status, 404)
    // A signature proves who typed, never a seat.
    assert.equal((await moment('lantern.localhost', 'outsider@x.y', 'lantern')).status, 403)

    const jobs = calls.filter((c) => c.url.endsWith('/_host/site')).map((c) => JSON.parse(c.init.body))
    assert.deepEqual(jobs, [
      { kind: 'webroot-moment', title: 'Fix the footer', label: 'lantern' },
      { kind: 'webroot-moment', title: 'Fix the footer', label: 'lantern' }
    ])
    const { rows } = await pool.query(
      "select actor, site_key, detail from audit where action = 'site.moment' order by id"
    )
    assert.deepEqual(
      rows,
      Array.from({ length: 2 }, () => ({
        actor: 'owner@x.y',
        site_key: 'lantern.localhost',
        detail: { title: 'Fix the footer', committed: true, head: 'abc' }
      }))
    )
  }
)

// ── SITE_ADDRESS_PREFIX — what a dev deployment puts in front of a name, and what it must not ──
//
// Ported from the Worker (`seat-registry/src/index.js:1163`) 10/09, together with the reason a
// prefix exists at all: `dev.tracy.ai` is a TWO-level name and Cloudflare's Universal certificate
// covers `tracy.ai` + `*.tracy.ai` only — measured twice, three days apart, the same refusal to
// even complete a TLS handshake. `dev-<label>.tracy.ai` is one level and free.
//
// Without it a dev site called `lantern` answers at `lantern.<zone>` — the SAME hostname a
// production site of that name owns.

test(
  'POST /api/sites: the prefix lands on the address, and never on the name a person typed',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const { send, cookieFor } = harness(pool, {
      fetchImpl: net.fetchImpl,
      envOverrides: { SITE_ADDRESS_PREFIX: 'dev-' }
    })
    const owner = await cookieFor('owner@x.y')

    const made = await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    assert.equal(made.status, 202)
    assert.equal((await made.json()).siteKey, 'dev-lantern.localhost')

    // The row the fleet works from carries the prefix too: the container is `dev-lantern-web-1`
    // and the site directory `…/dev-lantern`. `bar/route.js` looks a site up BY LABEL
    // (`sites.byLabel`), so a label without the prefix would make the site's own hostname
    // unresolvable — the failure this assertion exists to catch.
    const row = await pool.query('select label from site where site_key = $1', ['dev-lantern.localhost'])
    assert.equal(row.rows[0].label, 'dev-lantern')

    // 🔒 THE ROUND TRIP, which is where this feature actually breaks if it breaks. A browser asks
    // for the site's real hostname; `bar/route.js` bolts a label off the front of it and looks the
    // site up BY THAT LABEL. Assert the two halves meet — the address the create branch minted,
    // and the row the bar will find from it.
    const { hostKind } = await import('../src/bar/route.js')
    const { readConfig } = await import('../src/config.js')
    const cfg = readConfig({ ...env, SITE_ADDRESS_PREFIX: 'dev-' })
    const seen = hostKind('dev-lantern.localhost', cfg)
    assert.deepEqual(seen, { kind: 'site', label: 'dev-lantern' })
    const { siteByLabel } = await import('../src/sites/store.js')
    const found = await siteByLabel(pool, seen.label)
    assert.equal(found?.site_key, 'dev-lantern.localhost')

    // And the judgement is still on what they typed: `dashboard` is a reserved name, and
    // `dev-dashboard` would sail past a checker that ran after the prefix was glued on.
    const bad = await send('POST', '/api/sites', owner, { label: 'dashboard', platform: 'wordpress' })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).code, 'INVALID_LABEL')
  }
)

test("POST /api/sites: an IMPORTED site keeps the customer's own address, prefix or not", opts, async () => {
  const { pool } = db
  const net = fakeNetwork()
  const { send, cookieFor } = harness(pool, {
    fetchImpl: net.fetchImpl,
    envOverrides: { SITE_ADDRESS_PREFIX: 'dev-' }
  })
  const owner = await cookieFor('owner@x.y')

  // `fijitrips.example` is somebody else's domain. Putting `dev-` in front of it is not
  // namespacing, it is renaming their site.
  const imported = await send('POST', '/api/sites', owner, {
    origin: 'import',
    siteKey: 'fijitrips.example',
    platform: 'wordpress'
  })
  assert.equal(imported.status, 201)
  assert.equal((await imported.json()).siteKey, 'fijitrips.example')
  const importedSignal = (await pool.query("select * from ops_signal where kind='site.import'")).rows
  assert.equal(importedSignal.length, 1)
  assert.equal(importedSignal[0].site_key, 'fijitrips.example')
  assert.equal(importedSignal[0].data.platform, 'wordpress')
})

// 🔒 THE IMPORT BRANCH HAS TO NAME THE SITE, for the same reason the create branch does and with
// the same silent failure when it doesn't. `PROVISION_FLAGS` keeps `site` (`--site`) and `siteKey`
// (`--site-key`) as two different flags, and with no `--site-key` the script falls back to
// `$LABEL.$FLEET_ZONE` (`provision/provision.sh:126`) — so an imported site gets an `AGENTS.md`
// telling the agent it works on `fijitrips-example-5254d120.tracy.site` instead of the customer's
// own domain. The job still reports `ready`; only the agent is wrong about whose site it is.
test(
  'POST /api/sites/:key/provision: the import instruction names the site, not just its label',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl: net.fetchImpl })
    const owner = await cookieFor('owner@x.y')

    const imported = await send('POST', '/api/sites', owner, {
      origin: 'import',
      siteKey: 'fijitrips.example',
      platform: 'wordpress'
    })
    assert.equal(imported.status, 201)

    // The keys the export half would have uploaded, under this site's own artifact namespace
    // (`labelPrefix`) — anything else is refused with KEY_NOT_YOURS before the fleet is called.
    const started = await send('POST', '/api/sites/fijitrips.example/provision', owner, {
      platform: 'wordpress',
      webrootKey: 'sites/fijitrips-example/webroot.tar',
      dbKey: 'sites/fijitrips-example/db.sql.gz',
      liveSite: 'https://fijitrips.example'
    })
    assert.equal(started.status, 202)

    const instruction = JSON.parse(net.calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(instruction.siteKey, 'fijitrips.example')
    // The host refuses any job key outside SAFE_JOB_KEY (`refused jobKey`); the first import's key
    // names the row's birth and must still pass it (11/10: `first@<iso>` never did).
    assert.match(instruction.jobKey, /^[A-Za-z0-9:._-]{8,120}$/)
    assert.match(instruction.jobKey, /^import:fijitrips\.example:first-/)
    // No `fresh`, no `quickstart`: that absence IS how `provision.sh` knows the import road, where
    // the copy is opted into the Content API through the plugin it carries (`content.identity`,
    // platform/wordpress.sh and platform/joomla.sh). Either flag here and the copy answers 501.
    assert.equal(instruction.fresh, undefined)
    assert.equal(instruction.quickstart, undefined)
    // The address a person opens the copy at — the one the job poll later stores as
    // `site.address` — so the site folder can tell the agent where its staging site is.
    assert.match(instruction.copyAddress, /^http:\/\/fijitrips-example-[0-9a-f]+\.localhost:8080\/$/)
    // The canonical the CMS renderers pin (issue #167) is the COPY's own address, NOT the source
    // origin the client sent in `liveSite`: a copy pinned to the source 301s to the original or
    // loops on force_ssl. Same value as `copyAddress`, and never the source.
    assert.equal(instruction.liveSite, instruction.copyAddress)
    assert.notEqual(instruction.liveSite, 'https://fijitrips.example')

    // The host downloads the archive with curl from URLs signed HERE — it holds no store keys
    // and ships no aws CLI (measured 14/09: every import died at "fetching webroot").
    for (const [field, key] of [
      ['webrootUrl', 'sites/fijitrips-example/webroot.tar'],
      ['dbUrl', 'sites/fijitrips-example/db.sql.gz']
    ]) {
      const signed = new URL(instruction[field])
      assert.equal(signed.origin, 'http://r2.test')
      assert.equal(signed.pathname, `/artifacts/${key}`)
      assert.ok(signed.searchParams.get('X-Amz-Signature'), `${field} is signed`)
      assert.ok(
        Number(signed.searchParams.get('X-Amz-Expires')) >= 3600,
        `${field} outlives a slow provision`
      )
    }
  }
)

// 🔒 THE SOURCE ORIGIN CANNOT BECOME THE COPY'S CANONICAL — issue #167. Both CMS config renderers
// pin the copy to `--live-site`/`--site-url` (`SITE_URL`); the import branch used to feed that the
// source's own public origin (`run.ts:323` → `body.liveSite`) while separately computing the right
// copy address. The bug is the DATAFLOW — the source deciding the copy's canonical — not any one
// scheme: the copy must be canonical to ITS OWN address whether this deployment serves plain http
// on a port or https on a real domain. So both cases are covered here, on both platforms, with the
// realistic client input (the source's public origin observed during export).
const deployments = [
  {
    name: 'local http on a port',
    // The default harness origin: http://…localhost:8080.
    env: undefined,
    copyPattern: /^http:\/\/fijitrips-example-[0-9a-f]+\.localhost:8080\/$/
  },
  {
    name: 'a real https deployment',
    env: { TRACY_ORIGIN: 'https://cowork.tracy.site', SITE_DOMAIN: 'tracy.site' },
    copyPattern: /^https:\/\/fijitrips-example-[0-9a-f]+\.tracy\.site\/$/
  }
]
for (const platform of ['joomla', 'wordpress']) {
  for (const dep of deployments) {
    test(
      `POST /api/sites/:key/provision: the source origin cannot override the ${platform} copy's canonical (${dep.name})`,
      opts,
      async () => {
        const { pool } = db
        const net = fakeNetwork()
        const { send, cookieFor } = harness(pool, {
          fetchImpl: net.fetchImpl,
          ...(dep.env ? { envOverrides: dep.env } : {})
        })
        const owner = await cookieFor('owner@x.y')

        const imported = await send('POST', '/api/sites', owner, {
          origin: 'import',
          siteKey: 'fijitrips.example',
          platform
        })
        assert.equal(imported.status, 201)

        const started = await send('POST', '/api/sites/fijitrips.example/provision', owner, {
          platform,
          webrootKey: 'sites/fijitrips-example/webroot.tar',
          dbKey: 'sites/fijitrips-example/db.sql.gz',
          // What the client actually sends: the source's own public origin.
          liveSite: 'https://fijitrips.example'
        })
        assert.equal(started.status, 202)

        const instruction = JSON.parse(net.calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
        // The canonical is the copy's OWN address — this deployment's scheme and (if any) port.
        assert.match(instruction.copyAddress, dep.copyPattern)
        assert.match(instruction.liveSite, dep.copyPattern)
        assert.equal(instruction.liveSite, instruction.copyAddress)
        // …and never the source origin the client supplied.
        assert.notEqual(instruction.liveSite, 'https://fijitrips.example')
      }
    )
  }
}

/** The platform the book holds for one site. */
async function platformOf(pool, siteKey) {
  const { rows } = await pool.query('select platform from site where site_key = $1', [siteKey])
  return rows[0]?.platform ?? null
}

// 🔒 THE BOOK SAYS WHAT THE COPY IS. Measured 30/09 importing tracy.ai (WordPress): the wizard opens
// on Joomla, the first press claimed the row AS joomla, the person switched to WordPress and pressed
// again, and the claim — already the caller's — came back untouched. The plugin install and the
// provision ran as WordPress, the row stayed joomla, and the Apply door's `pairFleetCopy` refused
// every write (`platform_mismatch`). Until a host has been asked to build anything, the second press
// is the person correcting a choice, and the row follows it.
test(
  'POST /api/sites import: a second press under another platform re-states the row while nothing was built',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl: net.fetchImpl })
    const owner = await cookieFor('owner@x.y')

    const first = await send('POST', '/api/sites', owner, {
      origin: 'import',
      siteKey: 'tracy.ai',
      platform: 'joomla'
    })
    assert.equal(first.status, 201)
    assert.equal(await platformOf(pool, 'tracy.ai'), 'joomla')

    const second = await send('POST', '/api/sites', owner, {
      origin: 'import',
      siteKey: 'tracy.ai',
      platform: 'wordpress'
    })
    assert.equal(second.status, 200)
    const { idleMs, press, pressBefore, ...answer } = await second.json()
    assert.deepEqual(answer, { siteKey: 'tracy.ai', alreadyMine: true, retryable: true })
    assert.equal(typeof idleMs, 'number')
    assert.ok(BigInt(press) > BigInt(pressBefore))
    assert.equal(await platformOf(pool, 'tracy.ai'), 'wordpress')
  }
)

// #1665: a start the host refused, or one a redeploy cut, left a claim the wizard read as "a start
// may still be on its way" for good. The door now answers how long before this press it was last
// pressed, on this server's clock; the wizard starts under it only once that is past the wait and the
// host shows no run (`packages/site/tracy-add-site/src/client/import.ts` `UNANSWERED_START_MS`).
test(
  'POST /api/sites import: a press that finds its claim standing answers how long it sat idle',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl: net.fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const press = () =>
      send('POST', '/api/sites', owner, { origin: 'import', siteKey: 'tracy.ai', platform: 'joomla' })

    const first = await press()
    assert.equal(first.status, 201)
    const made = await first.json()
    assert.equal(made.idleMs, undefined, 'a claim just made has no earlier press')
    assert.match(made.press, /^\d{16}$/, 'every press carries its identity, the first one too')

    // The last press five minutes ago: the next one says so, and is itself the new last press.
    await pool.query(
      `update site set created_at = now() - interval '10 minutes', import_touched_at = now() - interval '5 minutes'
      where site_key = 'tracy.ai'`
    )
    const idle = await (await press()).json()
    assert.ok(idle.idleMs >= 5 * 60_000 && idle.idleMs < 6 * 60_000, `idleMs ${idle.idleMs}`)
    assert.equal(idle.retryable, true)
    assert.ok(BigInt(idle.pressBefore) < BigInt(idle.press))
    const again = await (await press()).json()
    assert.ok(again.idleMs < 60_000, `the press just before counts: idleMs ${again.idleMs}`)
    assert.equal(again.pressBefore, idle.press, 'the press before is the one just answered')

    // Two presses at once on an idle claim are taken one at a time: the second waits for the first's
    // row lock, then names it as its press before, so only the first can find the claim idle.
    await pool.query(
      `update site set import_touched_at = now() - interval '5 minutes' where site_key = 'tracy.ai'`
    )
    const holder = await pool.connect()
    try {
      await holder.query('begin')
      const early = await pressImportClaim(holder, 'tracy.ai')
      const waiting = pressImportClaim(pool, 'tracy.ai')
      await new Promise((resolve) => setTimeout(resolve, 100))
      await holder.query('commit')
      const late = await waiting
      assert.ok(early.idleMs >= 5 * 60_000, `idleMs ${early.idleMs}`)
      assert.ok(late.idleMs < 60_000, `the second press found the claim idle: ${late.idleMs}`)
      assert.equal(late.pressBefore, early.press)
      assert.ok(BigInt(late.press) > BigInt(early.press) && BigInt(early.press) > BigInt(again.press))
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
    }

    // A row from before the column was written counts from its birth.
    await pool.query(
      `update site set created_at = now() - interval '7 minutes', import_touched_at = null where site_key = 'tracy.ai'`
    )
    const old = await (await press()).json()
    assert.ok(old.idleMs >= 7 * 60_000 && old.idleMs < 8 * 60_000, `idleMs ${old.idleMs}`)
    const { rows } = await pool.query(
      `select import_touched_at > now() - interval '1 minute' as fresh from site where site_key = 'tracy.ai'`
    )
    assert.equal(rows[0].fresh, true, 'the press is still the activity the abandoned-import sweep reads')
  }
)

// …and once a host HAS been asked to build it, a different platform is refused by name rather than
// rewritten: the copy on the host is the platform the job was filed as, and a row rewritten over it
// is the same mismatch the other way round. The same platform stays the free retry it always was.
test(
  'POST /api/sites import: after a provision was filed, another platform is PLATFORM_CHANGED, the same one retries',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl: net.fetchImpl })
    const owner = await cookieFor('owner@x.y')

    assert.equal(
      (await send('POST', '/api/sites', owner, { origin: 'import', siteKey: 'tracy.ai', platform: 'joomla' }))
        .status,
      201
    )
    const started = await send('POST', '/api/sites/tracy.ai/provision', owner, {
      platform: 'joomla',
      webrootKey: 'sites/tracy-ai/webroot.tar'
    })
    assert.equal(started.status, 202)

    const changed = await send('POST', '/api/sites', owner, {
      origin: 'import',
      siteKey: 'tracy.ai',
      platform: 'wordpress'
    })
    assert.equal(changed.status, 409)
    assert.deepEqual(await changed.json(), { code: 'PLATFORM_CHANGED', platform: 'joomla' })
    assert.equal(await platformOf(pool, 'tracy.ai'), 'joomla')

    const same = await send('POST', '/api/sites', owner, {
      origin: 'import',
      siteKey: 'tracy.ai',
      platform: 'joomla'
    })
    assert.equal(same.status, 200)
    assert.equal((await same.json()).retryable, undefined, 'a built import cannot open another read')
  }
)

// Defence in depth, at the one place tracy-web itself states the platform to the host: the provision
// instruction. The host's job answer carries no platform (`{state, step, port}`), and the job row
// keeps no copy of the instruction, so the poll that finishes the handover has nothing to compare
// with; this door does. A row that disagrees with the instruction it is about to send is corrected
// while nothing was built yet, and refused once something was.
test(
  'POST /api/sites/:key/provision: an imported row follows the platform the instruction builds, until a job exists',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl: net.fetchImpl })
    const owner = await cookieFor('owner@x.y')

    assert.equal(
      (await send('POST', '/api/sites', owner, { origin: 'import', siteKey: 'tracy.ai', platform: 'joomla' }))
        .status,
      201
    )
    const started = await send('POST', '/api/sites/tracy.ai/provision', owner, {
      platform: 'wordpress',
      webrootKey: 'sites/tracy-ai/webroot.tar'
    })
    assert.equal(started.status, 202)
    assert.equal(await platformOf(pool, 'tracy.ai'), 'wordpress')
    const instruction = JSON.parse(net.calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(instruction.platform, 'wordpress')

    // A job now exists under wordpress: a provision under joomla would build a copy the row does not
    // describe, over one it does.
    const again = await send('POST', '/api/sites/tracy.ai/provision', owner, {
      platform: 'joomla',
      webrootKey: 'sites/tracy-ai/webroot.tar'
    })
    assert.equal(again.status, 409)
    assert.deepEqual(await again.json(), { code: 'PLATFORM_CHANGED', platform: 'wordpress' })
    assert.equal(net.calls.filter((c) => c.url.endsWith('/_host/provision')).length, 1)
    assert.equal(await platformOf(pool, 'tracy.ai'), 'wordpress')
  }
)

test(
  "a fleet-born site's address takes its SCHEME from TRACY_ORIGIN — https on a real deployment",
  opts,
  async () => {
    // Measured 11/09 on the dev machine: the address was built with a literal `http://`, so
    // `site.address` — the string `/api/sites` hands back as `copyUrl` and the job poll returns as
    // `liveUrl`, i.e. the one URL a person copies to give their site to somebody else — said
    // `http://devsmoke1.tracy.site/` for a site that answers https.
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const live = harness(pool, {
      fetchImpl,
      envOverrides: { TRACY_ORIGIN: 'https://cowork.tracy.site', SITE_DOMAIN: 'tracy.site' }
    })
    const owner = await live.cookieFor('owner@x.y')
    const created = await live.send('POST', '/api/sites', owner, {
      label: 'lantern',
      platform: 'wordpress'
    })
    const { siteKey, jobId } = await created.json()
    const body = await (await live.get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
    assert.equal(body.state, 'done')
    // No port: `https://cowork.tracy.site` has none, so none is invented.
    assert.equal(body.liveUrl, 'https://lantern.tracy.site/')

    // And the door that READS the stored address must agree with the door that WROTE it.
    const mine = await (await live.get('/api/sites', owner)).json()
    assert.equal(mine.sites.find((s) => s.siteKey === siteKey).copyUrl, 'https://lantern.tracy.site/')
  }
)

// ── the Publish cluster: state, and go-live on a domain of the customer's own ───────────────────

async function siteWithOwner(pool, harnessed) {
  const owner = await harnessed.cookieFor('owner@x.y')
  const created = await harnessed.send('POST', '/api/sites', owner, {
    label: 'lantern',
    platform: 'wordpress'
  })
  const { siteKey } = await created.json()
  return { owner, siteKey }
}

/** A SECOND live seat on the same site, at a role below admin. Added beside the owner rather than
 * by demoting them — `seat_keep_one_owner` (002-book.sql) refuses to let a site lose its last
 * accepted owner, and it is right to. */
async function editorOn(pool, harnessed, siteKey, role = 'editor') {
  const email = `${role}@x.y`
  const acct = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [siteKey, acct.id, role]
  )
  return harnessed.cookieFor(email)
}

test(
  'GET /api/sites/:key/state: a fresh site reads draft/standard, and carries the plan book',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const h = harness(pool, { fetchImpl })
    const { owner, siteKey } = await siteWithOwner(pool, h)
    const body = await (await h.get(`/api/sites/${siteKey}/state`, owner)).json()
    // Normalised the way the Worker's `readSiteState` normalises a KV row it may never have
    // written: a `publish` column that was never set means the site has never been published.
    assert.equal(body.publish, 'draft')
    assert.equal(body.plan, 'standard')
    assert.equal(body.plans.standard.badge, true)
    assert.equal(body.plans.plus.badge, false)
  }
)

test(
  'POST /api/sites/:key/state: a VIEWER cannot change the publish state — an Owner or Editor does (ADR 0028)',
  opts,
  async () => {
    // Putting a site on the public internet asks for an Owner or an Editor; a Viewer only reads.
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const h = harness(pool, { fetchImpl })
    const { siteKey } = await siteWithOwner(pool, h)
    const viewer = await editorOn(pool, h, siteKey, 'viewer')
    const res = await h.send('POST', `/api/sites/${siteKey}/state`, viewer, { publish: 'published' })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).code, 'NOT_SITE_EDITOR')
    const { rows } = await pool.query('select publish from site where site_key = $1', [siteKey])
    assert.equal(rows[0].publish, 'draft')
  }
)

test(
  'POST /api/sites/:key/state: the publish flag is refused by name, in every spelling; a plan is still set; a body naming no plan is refused',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const h = harness(pool, { fetchImpl })
    const { owner, siteKey } = await siteWithOwner(pool, h)
    const flag = async () =>
      (await pool.query('select publish, plan from site where site_key = $1', [siteKey])).rows[0]
    for (const body of [
      { publish: 'published' },
      { publish: 'draft' },
      { publish: 'sideways' },
      { publish: null },
      { publish: 'published', plan: 'plus' }
    ]) {
      const res = await h.send('POST', `/api/sites/${siteKey}/state`, owner, body)
      assert.equal(res.status, 409, JSON.stringify(body))
      assert.deepEqual(await res.json(), { code: 'PUBLISH_BY_GO_LIVE' }, JSON.stringify(body))
    }
    assert.deepEqual(await flag(), { publish: 'draft', plan: null }, 'nothing was written, the plan included')
    // A live site is not covered through this door either.
    await pool.query("update site set publish = 'published' where site_key = $1", [siteKey])
    assert.equal(
      (await h.send('POST', `/api/sites/${siteKey}/state`, owner, { publish: 'draft' })).status,
      409
    )
    assert.equal((await flag()).publish, 'published')
    for (const body of [{}, { plan: 'nope' }, { plan: 7 }, { plan: 'constructor' }]) {
      const res = await h.send('POST', `/api/sites/${siteKey}/state`, owner, body)
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    for (const body of [null, [], 'published', 7]) {
      const res = await h.send('POST', `/api/sites/${siteKey}/state`, owner, body)
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    const plan = await h.send('POST', `/api/sites/${siteKey}/state`, owner, { plan: 'plus' })
    assert.equal(plan.status, 200)
    assert.deepEqual(await plan.json(), { ok: true, plan: 'plus' })
    assert.deepEqual(
      await flag(),
      { publish: 'published', plan: 'plus' },
      'a plan change leaves the flag alone'
    )
  }
)

test(
  'POST /api/sites/:key/go-live op=live: the FLEET goes first — 202 with the job, and the flag stays draft until the job has ended',
  opts,
  async () => {
    // Flipping `published` is what tells `bar/route.js` to drop the guest gate and the badge. Doing
    // it first opens a window where the site is public while it is still noindexed and still cannot
    // send mail — the door opened before the house was tidied. The whole flow: `site-publish.test.mjs`.
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const h = harness(pool, { fetchImpl })
    const { owner, siteKey } = await siteWithOwner(pool, h)
    const before = calls.length
    // The old shape of this request carried the customer's domains: refused by name, fleet not asked.
    const old = await h.send('POST', `/api/sites/${siteKey}/go-live`, owner, {
      op: 'live',
      domains: ['lantern.example']
    })
    assert.equal(old.status, 400)
    assert.deepEqual(await old.json(), { code: 'DOMAINS_NOT_SUPPORTED' })
    assert.ok(!calls.slice(before).some((c) => c.url.endsWith('/_host/go-live')))

    const res = await h.send('POST', `/api/sites/${siteKey}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.jobId, 'golive-1')
    assert.equal(body.publish, 'draft')
    const call = calls.slice(before).find((c) => c.url.endsWith('/_host/go-live'))
    assert.ok(call, 'the fleet was asked')
    const { jobKey, ...sent } = JSON.parse(call.init.body)
    assert.deepEqual(sent, { label: 'lantern', op: 'live', publicOrigin: 'http://tracy.test:8080' })
    assert.match(jobKey, /^publish:[0-9a-f]{32}$/)
    const { rows } = await pool.query('select publish from site where site_key = $1', [siteKey])
    assert.equal(rows[0].publish, 'draft')
  }
)

test(
  'POST /api/sites/:key/go-live op=draft: the FLAG goes first, and a refusal leaves it down',
  opts,
  async () => {
    // The reverse order, and for the reverse reason: put the guest gate back up BEFORE closing mail
    // and turning noindex on. And when the fleet then refuses, the flag stays down — the site is
    // left COVERED, which is the safer of the two wrong states, and the answer says so rather than
    // quietly undoing itself back into the exposed one.
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ goLive: { refuse: true } })
    const h = harness(pool, { fetchImpl })
    const { owner, siteKey } = await siteWithOwner(pool, h)
    await pool.query("update site set publish = 'published' where site_key = $1", [siteKey])

    const res = await h.send('POST', `/api/sites/${siteKey}/go-live`, owner, { op: 'draft' })
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.code, 'NOT_FOUND')
    assert.equal(body.publishFlipped, true)
    const { rows } = await pool.query('select publish from site where site_key = $1', [siteKey])
    assert.equal(rows[0].publish, 'draft', 'the flag stays DOWN after a refusal')
  }
)

test(
  'job poll: a poll of an old build job after the site went live leaves the publish flag alone',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send, get } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const { siteKey, jobId } = await (
      await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    ).json()
    assert.equal((await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).status, 200)
    const born = await pool.query('select publish from site where site_key = $1', [siteKey])
    assert.equal(born.rows[0].publish, 'draft', 'a site is born a draft')
    // The site is published since (through go-live; written here as that leaves it).
    await pool.query("update site set publish = 'published' where site_key = $1", [siteKey])
    // The Build tab left open, a reload, a second tab: the same finished job is polled again.
    for (let i = 0; i < 3; i++) {
      const again = await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
      assert.equal(again.status, 200)
      assert.equal((await again.json()).state, 'done')
    }
    const { rows } = await pool.query('select publish from site where site_key = $1', [siteKey])
    assert.equal(rows[0].publish, 'published', 'only a go-live takes a site back to draft')
  }
)

test(
  'POST /api/sites/:key/go-live: a mistyped op is refused before the fleet is ever asked',
  opts,
  async () => {
    // Shape before availability: a typo is wrong whether or not the fleet is alive, and answering
    // FLEET_UNAVAILABLE to it sends the caller to look at a server for a mistake in their own line.
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const h = harness(pool, { fetchImpl })
    const { owner, siteKey } = await siteWithOwner(pool, h)
    const before = calls.length
    const res = await h.send('POST', `/api/sites/${siteKey}/go-live`, owner, { op: 'liv' })
    assert.equal(res.status, 400)
    assert.ok(!calls.slice(before).some((c) => c.url.endsWith('/_host/go-live')))
  }
)

test('GET /api/sites: addressPrefix reports what this deployment actually prepends', opts, async () => {
  const { pool } = db
  const plain = harness(pool)
  assert.equal(
    (await (await plain.send('GET', '/api/sites', await plain.cookieFor('a@x.y'))).json()).addressPrefix,
    ''
  )

  const dev = harness(pool, { envOverrides: { SITE_ADDRESS_PREFIX: 'dev-' } })
  assert.equal(
    (await (await dev.send('GET', '/api/sites', await dev.cookieFor('a@x.y'))).json()).addressPrefix,
    'dev-'
  )
})

test(
  'a new Joomla job pairs through the host once without returning its token to the browser',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    let tokenReads = 0
    const token = 'private-joomla-token-for-this-test'
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') {
        tokenReads++
        assert.deepEqual(JSON.parse(init.body), { label: 'harbor' })
        return Response.json({ token })
      }
      if (u.hostname === 'harbor-web-1') {
        assert.equal(u.searchParams.get('task'), 'api.exec')
        assert.equal(JSON.parse(init.body).token, token)
        assert.equal(init.redirect, 'error')
        return Response.json({ ok: true, manifest: { platform: 'joomla' } })
      }
      return network.fetchImpl(url, init)
    }
    const { send, get, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    const owner = await cookieFor('owner@x.y')
    const created = await send('POST', '/api/sites', owner, {
      label: 'harbor',
      platform: 'joomla',
      quickstart: 'tracy-apple/j6'
    })
    const job = await created.json()
    for (let i = 0; i < 2; i++) {
      const r = await get(`/api/sites/${job.siteKey}/jobs/${job.jobId}`, owner)
      assert.equal(r.status, 200)
      const raw = await r.text()
      assert.equal(JSON.parse(raw).custody, 'registered')
      assert.equal(raw.includes(token), false)
    }
    assert.equal(tokenReads, 1)
    const rows = await pool.query('select config from site_component where site_key=$1', [job.siteKey])
    assert.equal(rows.rows.length, 1)
    assert.equal(
      rows.rows[0].config.endpoint,
      'http://harbor-web-1/index.php?option=com_claudecowork&task=api.exec&format=json'
    )
  }
)

// A fleet-born WordPress site was never paired: every Build from a design died at "Checking the site ·
// COMPONENT_NOT_REGISTERED" (measured 14/09), and the one site that worked had its row inserted by hand
// with exactly this endpoint and the token provision left in `tracy-agent.token`.
test(
  'a new WordPress job pairs through the host on the admin-ajax door, and the job row keeps the outcome',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    let tokenReads = 0
    const token = 'private-wordpress-token-for-this-test'
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') {
        tokenReads++
        assert.deepEqual(JSON.parse(init.body), { label: 'quayside' })
        return Response.json({ token })
      }
      if (u.hostname === 'quayside-web-1') {
        assert.equal(`${u.pathname}${u.search}`, '/wp-admin/admin-ajax.php?action=claude_cowork')
        assert.deepEqual(JSON.parse(init.body), { token, action: 'core.manifest', params: {} })
        assert.equal(init.redirect, 'error')
        return Response.json({ ok: true, manifest: { platform: 'wordpress', platformVersion: '6.9' } })
      }
      return network.fetchImpl(url, init)
    }
    const { send, get, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    const owner = await cookieFor('owner@x.y')
    const created = await send('POST', '/api/sites', owner, { label: 'quayside', platform: 'wordpress' })
    const job = await created.json()
    for (let i = 0; i < 2; i++) {
      const r = await get(`/api/sites/${job.siteKey}/jobs/${job.jobId}`, owner)
      assert.equal(r.status, 200)
      const raw = await r.text()
      assert.equal(JSON.parse(raw).custody, 'registered')
      assert.equal(raw.includes(token), false)
    }
    assert.equal(tokenReads, 1)
    const rows = await pool.query('select config from site_component where site_key=$1', [job.siteKey])
    assert.equal(rows.rows.length, 1)
    assert.equal(
      rows.rows[0].config.endpoint,
      'http://quayside-web-1/wp-admin/admin-ajax.php?action=claude_cowork'
    )
    const stored = await pool.query('select detail from job where id = $1', [job.jobId])
    assert.deepEqual(stored.rows[0].detail, { state: 'done', port: 8123, custody: 'registered' })
    assert.equal(JSON.stringify(stored.rows[0]).includes(token), false)
  }
)

test(
  'a WordPress component that does not answer as WordPress is not registered, and the job row says why',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') return Response.json({ token: 'x'.repeat(24) })
      if (u.hostname === 'quayside-web-1')
        return Response.json({ ok: true, manifest: { platform: 'joomla' } })
      return network.fetchImpl(url, init)
    }
    const { send, get, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    const owner = await cookieFor('owner@x.y')
    const job = await (
      await send('POST', '/api/sites', owner, { label: 'quayside', platform: 'wordpress' })
    ).json()
    const body = await (await get(`/api/sites/${job.siteKey}/jobs/${job.jobId}`, owner)).json()
    assert.equal(body.custody, 'unavailable')
    assert.equal(body.custodyDetail, 'the WordPress component did not verify its token')
    assert.equal((await pool.query('select 1 from site_component')).rowCount, 0)
    const stored = await pool.query('select detail from job where id = $1', [job.jobId])
    assert.equal(stored.rows[0].detail.custody, 'unavailable')
    assert.equal(stored.rows[0].detail.custodyDetail, 'the WordPress component did not verify its token')
  }
)

test(
  'POST /api/sites/:key/agent: a fleet-born site with no component on record is paired there, and only once',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    const token = 'private-wordpress-token-for-this-test'
    let probes = 0
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') return Response.json({ token })
      if (u.hostname === 'quayside-web-1') {
        probes++
        return Response.json({ ok: true, manifest: { platform: 'wordpress' } })
      }
      return network.fetchImpl(url, init)
    }
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await pool.query(
      "insert into site (site_key, label, host, platform, origin) values ('quayside.localhost', 'quayside', 'local', 'wordpress', 'fleet_born')"
    )
    await seatRow(pool, 'quayside.localhost', 'owner@x.y', 'owner')
    const owner = await cookieFor('owner@x.y')

    const first = await send('POST', '/api/sites/quayside.localhost/agent', owner)
    assert.equal(first.status, 200)
    const raw = await first.text()
    assert.deepEqual(JSON.parse(raw), { lane: 'ok', custody: 'registered' })
    assert.equal(raw.includes(token), false)
    const cred = await pool.query('select config from site_component where site_key = $1', [
      'quayside.localhost'
    ])
    assert.equal(
      cred.rows[0].config.endpoint,
      'http://quayside-web-1/wp-admin/admin-ajax.php?action=claude_cowork'
    )

    // With a component on record the answer is the attach answer, exactly as before.
    const again = await send('POST', '/api/sites/quayside.localhost/agent', owner)
    assert.deepEqual(await again.json(), { lane: 'ok' })
    assert.equal(probes, 1)
  }
)

test(
  'POST /api/sites/:key/agent (ADR 0028): a viewer starts the agent it asks, but never pairs the content plugin',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    let probes = 0
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') return Response.json({ token: 'x'.repeat(40) })
      if (u.hostname === 'quayside-web-1') {
        probes++
        return Response.json({ ok: true, manifest: { platform: 'wordpress' } })
      }
      return network.fetchImpl(url, init)
    }
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await pool.query(
      "insert into site (site_key, label, host, platform, origin) values ('quayside.localhost', 'quayside', 'local', 'wordpress', 'fleet_born')"
    )
    await seatRow(pool, 'quayside.localhost', 'owner@x.y', 'owner')
    await seatRow(pool, 'quayside.localhost', 'viewer@x.y', 'viewer')

    const res = await send('POST', '/api/sites/quayside.localhost/agent', await cookieFor('viewer@x.y'))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { lane: 'ok' })
    assert.equal(probes, 0, 'the site was never probed for pairing')
    const cred = await pool.query('select 1 from site_component where site_key = $1', ['quayside.localhost'])
    assert.equal(cred.rowCount, 0, 'no write credential was registered for a viewer')
  }
)

test(
  'write doors (ADR 0028): a viewer is refused at upload and turn undo before the host hears of it; reads and comments stay open',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send, get } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await seatRow(pool, 'lantern.localhost', 'viewer@x.y', 'viewer')
    const viewer = await cookieFor('viewer@x.y')
    const before = calls.length

    const upload = await send('POST', '/api/sites/lantern.localhost/artifacts/begin', viewer, {
      kind: 'webroot'
    })
    assert.equal(upload.status, 403)
    assert.deepEqual(await upload.json(), { code: 'FORBIDDEN_WRITE', role: 'viewer' })

    const undo = await send('POST', '/api/sites/lantern.localhost/turns/undo', viewer, {
      session: 'sess-1',
      turnId: 'sess-1:1',
      scope: 'turn'
    })
    assert.equal(undo.status, 403)
    assert.deepEqual(await undo.json(), { code: 'FORBIDDEN_WRITE', role: 'viewer' })

    const credential = await send('PUT', '/api/sites/lantern.localhost/component-credential', viewer, {
      endpoint: 'https://lantern.example/cowork',
      token: 'a'.repeat(20)
    })
    assert.equal(credential.status, 403)
    assert.equal(calls.length, before, 'no refused write reached the host')

    // The job-poll door finishes a handover (repo, pairing): an owner or editor polls, a viewer not.
    const poll = await get('/api/sites/lantern.localhost/jobs/nope', viewer)
    assert.equal(poll.status, 403)
    assert.deepEqual(await poll.json(), { code: 'NOT_SITE_OWNER' })
    await seatRow(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    const byEditor = await get('/api/sites/lantern.localhost/jobs/nope', await cookieFor('editor@x.y'))
    assert.equal(byEditor.status, 404, 'an editor passes the gate (it may poll its own publish)')

    // A viewer comments, resolves and reopens like any seat.
    const made = await send('POST', '/api/sites/lantern.localhost/comments', viewer, {
      text: 'The phone number is wrong',
      url: 'https://lantern.localhost/',
      element: null
    })
    assert.equal(made.status, 201)
    const { comment } = await made.json()
    assert.equal(
      (await send('POST', `/api/sites/lantern.localhost/comments/${comment.id}/resolve`, viewer)).status,
      200
    )
    assert.equal((await get('/api/sites/lantern.localhost/comments', viewer)).status, 200)
  }
)

// The host mints the token now (`apps/tracy-host/src/app.js`), so its refusal became an answer
// worth reading: a site that is switched off and a site that never had the component installed
// used to reach the person as one sentence, and they are two different repairs.
test(
  'POST /api/sites/:key/agent: the host’s refusal is what custodyDetail says, one per repair',
  opts,
  async () => {
    const cases = [
      ['SITE_DOWN', 409, 'the site is not running, so its component token could not be read'],
      ['COMPONENT_NOT_INSTALLED', 409, 'the Joomla component is not installed on this site'],
      ['SITE_UNKNOWN', 404, 'its host has no record of this site'],
      // A code this side has never heard of keeps the sentence this door has always answered.
      ['MINT_FAILED', 500, 'the provisioned component token is unavailable']
    ]
    for (const [code, status, detail] of cases) {
      await db.reset() // each case starts from an empty schema, as it did with a schema of its own
      const { pool } = db
      const network = fakeNetwork()
      let probes = 0
      const fetchImpl = async (url, init) => {
        const u = new URL(String(url))
        if (u.pathname === '/_host/agent-token') {
          return Response.json({ code, detail: 'the script said so' }, { status })
        }
        if (u.hostname === 'harbor-web-1') {
          probes++
          return Response.json({ ok: true, manifest: { platform: 'joomla' } })
        }
        return network.fetchImpl(url, init)
      }
      const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
      await pool.query(
        "insert into site (site_key, label, host, platform, origin) values ('harbor.localhost', 'harbor', 'local', 'joomla', 'fleet_born')"
      )
      await seatRow(pool, 'harbor.localhost', 'owner@x.y', 'owner')
      const owner = await cookieFor('owner@x.y')

      const res = await send('POST', '/api/sites/harbor.localhost/agent', owner)
      assert.equal(res.status, 200, code)
      const body = await res.json()
      assert.equal(body.custody, 'unavailable', code)
      assert.equal(body.custodyDetail, detail, code)
      // No token, so the component door was never opened and nothing was written down.
      assert.equal(probes, 0, code)
      assert.equal((await pool.query('select 1 from site_component')).rowCount, 0, code)
    }
  }
)

// ── Which design a new Joomla site is built with ──────────────────────────────────────────────
//
// The resolver itself is covered by `design-plan.test.mjs`; what these check is the part only the
// door can get wrong — that the answer is the SERVER's, that it reaches the fleet, that it is
// written down, and that a caller cannot name the template, the profile or the package itself.

test(
  'POST /api/sites: a design with its own Joomla template reaches the fleet as the design that was picked, and is recorded',
  opts,
  async () => {
    const { pool } = db
    // Library designs by id: the operator's switch is on, as it was before there was one.
    await designSystemsOn(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const made = await send('POST', '/api/sites', owner, {
      label: 'harbour',
      platform: 'joomla',
      quickstart: 'tracy-apple/j6',
      design: 'airbnb'
    })
    assert.equal(made.status, 202)
    const body = await made.json()
    assert.equal(body.design.requestedDesign, 'airbnb')
    assert.equal(body.design.effectiveDesign, 'airbnb')
    assert.equal(body.design.fallback, false)

    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    // The PICKED design and the revision, and deliberately not the effective design, the
    // template or the profile: the fleet resolves those again from its own copy of the registry,
    // so there is one resolver of record. See `provision/design-plan.py`.
    assert.equal(provision.design, 'airbnb')
    assert.equal(provision.designRevision, body.design.registryRevision)
    assert.equal(provision.effectiveDesign, undefined)
    assert.equal(provision.contractProfile, undefined)

    const { rows } = await pool.query(
      'select requested_design, effective_design, design_profile from site where site_key = $1',
      ['harbour.localhost']
    )
    assert.deepEqual(rows[0], {
      requested_design: 'airbnb',
      effective_design: 'airbnb',
      design_profile: 'tracy-airbnb/j6/1.2.0'
    })
  }
)

test(
  'POST /api/sites: a design with no Joomla template yet starts construction from Base without recording an unfinished design as installed',
  opts,
  async () => {
    const { pool } = db
    // Library designs by id: the operator's switch is on, as it was before there was one.
    await designSystemsOn(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const made = await send('POST', '/api/sites', owner, {
      label: 'lantern',
      platform: 'joomla',
      quickstart: 'tracy-base/j6',
      design: 'stripe'
    })
    assert.equal(made.status, 202)
    const body = await made.json()
    assert.equal(body.workspacePath, '/site/lantern')
    assert.equal(body.design.requestedDesign, 'stripe')
    assert.equal(body.design.effectiveDesign, 'stripe')
    assert.equal(body.design.fallback, true)

    // The fleet is told what the CUSTOMER picked, not the fallback: it resolves the same way and
    // its policy marker records both, so nothing downstream loses the ask.
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.design, 'stripe')
    assert.equal(provision.quickstart, 'tracy-base/j6')

    const { rows } = await pool.query(
      'select requested_design, effective_design, design_profile from site where site_key = $1',
      ['lantern.localhost']
    )
    assert.deepEqual(rows[0], {
      requested_design: 'stripe',
      effective_design: null,
      design_profile: null
    })
  }
)

test(
  'POST /api/sites: a caller cannot name the design it is not allowed to choose, and an unknown id is refused',
  opts,
  async () => {
    const { pool } = db
    // Library designs by id: the operator's switch is on, as it was before there was one.
    await designSystemsOn(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')

    // An id that is in no library is not turned into the default with a friendly notice — it is
    // refused, and no name is claimed.
    const unknown = await send('POST', '/api/sites', owner, {
      label: 'ghostly',
      platform: 'joomla',
      quickstart: 'tracy-apple/j6',
      design: 'not-a-design'
    })
    assert.equal(unknown.status, 400)
    assert.deepEqual(await unknown.json(), { code: 'UNKNOWN_DESIGN' })
    assert.equal((await pool.query('select 1 from site')).rowCount, 0)

    // Metadata a caller invents about the plan is ignored, not believed: the effective design is
    // resolved from the id, and a made-up profile changes nothing about what is built.
    const forged = await send('POST', '/api/sites', owner, {
      label: 'forged',
      platform: 'joomla',
      quickstart: 'tracy-base/j6',
      design: 'stripe',
      effectiveDesign: 'airbnb',
      contractProfile: 'tracy-airbnb/j6/1.0.0',
      template: { element: 'tracy_airbnb', source: 'artifact' }
    })
    assert.equal(forged.status, 202)
    assert.equal((await forged.json()).design.effectiveDesign, 'stripe')
    const provision = JSON.parse(calls.filter((c) => c.url.endsWith('/_host/provision')).at(-1).init.body)
    assert.equal(provision.design, 'stripe')
    assert.equal(provision.quickstart, 'tracy-base/j6')
    assert.equal(provision.contractProfile, undefined)
    const { rows } = await pool.query('select effective_design, design_profile from site where label = $1', [
      'forged'
    ])
    assert.deepEqual(rows[0], { effective_design: null, design_profile: null })
  }
)

test(
  'POST /api/sites: a registry that moved since the form asked answers with the new plan instead of building from the old one',
  opts,
  async () => {
    const { pool } = db
    // Library designs by id: the operator's switch is on, as it was before there was one.
    await designSystemsOn(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const stale = await send('POST', '/api/sites', owner, {
      label: 'drifted',
      platform: 'joomla',
      quickstart: 'tracy-apple/j6',
      design: 'apple',
      designRevision: 'f'.repeat(64)
    })
    assert.equal(stale.status, 409)
    const body = await stale.json()
    assert.equal(body.code, 'DESIGN_PLAN_CHANGED')
    // The answer carries what it WOULD build, so the form can show it and let the customer press
    // again knowing. A conflict the customer can only read is a conflict they cannot resolve.
    assert.equal(body.plan.effectiveDesign, 'apple')
    assert.equal((await pool.query('select 1 from site')).rowCount, 0)
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/provision')).length, 0)
  }
)

test('GET /api/sites/design-plan: says what a design builds with, and claims nothing', opts, async () => {
  const { pool } = db
  // Library designs by id: the operator's switch is on, as it was before there was one.
  await designSystemsOn(pool)
  const { fetchImpl, calls } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')

  const served = await send('GET', '/api/sites/design-plan?design=airbnb&platform=joomla', owner)
  assert.equal(served.status, 200)
  assert.equal((await served.json()).plan.effectiveDesign, 'airbnb')

  const fallback = await send('GET', '/api/sites/design-plan?design=stripe&platform=joomla', owner)
  const plan = (await fallback.json()).plan
  assert.equal(plan.requestedDesign, 'stripe')
  assert.equal(plan.effectiveDesign, 'stripe')
  assert.equal(plan.workflow, 'template-build')
  assert.equal(plan.baseQuickstart, 'tracy-base/j6')
  assert.equal(plan.fallback, true)

  const unknown = await send('GET', '/api/sites/design-plan?design=not-a-design&platform=joomla', owner)
  assert.equal(unknown.status, 400)

  const other = await send('GET', '/api/sites/design-plan?design=apple&platform=wordpress', owner)
  assert.equal(other.status, 400)

  // Read-only: no row, no name reserved, and the fleet never heard of it.
  assert.equal((await pool.query('select 1 from site')).rowCount, 0)
  assert.equal(calls.length, 0)

  // And it is a signed-in door like every other one here.
  const stranger = await send('GET', '/api/sites/design-plan?design=apple&platform=joomla')
  assert.equal(stranger.status, 401)
})

// ── The operator's design-system switch at every door that starts a site ─────────────────────────
// Off (the default): a request naming one of the library's design systems by id is refused at each
// door; a template card — even one whose id is also a library design, like ja-kinetic — and a
// request naming no design at all go through as before. On: the library builds as it always did.

/** ja-kinetic as the template card its release carries: the same id is also a library design. */
async function seedKineticTemplate(pool) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      'quickstart/ja-kinetic/j6',
      JSON.stringify({
        name: 'JA Kinetic',
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label: 'JA Kinetic',
        version: '1.0.0',
        cms: '6.1.1',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        },
        card: { template: 'ja-kinetic' }
      })
    ]
  )
}

/** The switch an operator presses on Quickstarts, turned on. */
function designSystemsOn(pool) {
  return saveDesignSystemsShown(pool, true, 'ops@x.y')
}

const BUILD_ID = '22222222-2222-4222-8222-222222222222'

test('switch off: every door that starts a site refuses a design system named by id', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')
  const refused = async (response, design) => {
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { code: 'DESIGN_SYSTEMS_OFF', design })
  }

  await refused(await send('GET', '/api/sites/design-plan?design=airbnb&platform=joomla', owner), 'airbnb')
  await refused(await send('GET', '/api/sites/questions?design=airbnb&platform=joomla', owner), 'airbnb')
  // Before the platform's own answer: EmDash takes a design and ignores it, WordPress refuses one
  // as unsupported — neither may hide that the id named was a design system.
  await refused(await send('GET', '/api/sites/questions?design=apple&platform=emdash', owner), 'apple')
  await refused(await send('GET', '/api/sites/design-plan?design=apple&platform=wordpress', owner), 'apple')
  await refused(
    await send('POST', '/api/sites/claim', owner, {
      platform: 'joomla',
      design: 'airbnb',
      buildId: BUILD_ID
    }),
    'airbnb'
  )
  await refused(
    await send('POST', '/api/sites', owner, {
      label: 'harbour',
      platform: 'joomla',
      quickstart: 'tracy-apple/j6',
      design: 'airbnb'
    }),
    'airbnb'
  )
  await refused(
    await send('POST', '/api/sites', owner, { label: 'slateworks', platform: 'emdash', design: 'apple' }),
    'apple'
  )

  assert.equal((await pool.query('select 1 from site')).rowCount, 0)
  assert.equal(calls.length, 0, 'the fleet never heard of any of it')
})

test('switch off: a template card and a request with no design build as before', opts, async () => {
  const { pool } = db
  await seedKineticTemplate(pool)
  const { fetchImpl } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')

  // ja-kinetic is checked as a template first, so the library copy of the id refuses nothing.
  const plan = await send('GET', '/api/sites/design-plan?design=ja-kinetic&platform=joomla', owner)
  assert.equal(plan.status, 200)
  const planned = (await plan.json()).plan
  assert.equal(planned.workflow, 'template')
  // What the template wears comes from its sealing profile's `design.json`; ja-kinetic's says none.
  assert.equal(planned.design, null)
  assert.equal(
    (await send('GET', '/api/sites/questions?design=ja-kinetic&platform=joomla', owner)).status,
    200
  )
  const kinetic = await send('POST', '/api/sites', owner, {
    label: 'kinetic',
    platform: 'joomla',
    design: 'ja-kinetic',
    quickstart: 'quickstart/ja-kinetic/j6',
    designRevision: 'template'
  })
  assert.equal(kinetic.status, 202, JSON.stringify(await kinetic.clone().json()))
  assert.equal((await kinetic.json()).builtFrom, 'quickstart/ja-kinetic/j6')

  // No design: the default path, Joomla's `apple` included, is nobody naming a design system.
  assert.equal((await send('GET', '/api/sites/design-plan?platform=joomla', owner)).status, 200)
  assert.equal((await send('GET', '/api/sites/questions?platform=joomla', owner)).status, 200)
  const plain = await send('POST', '/api/sites', owner, { label: 'plainsite', platform: 'joomla' })
  assert.equal(plain.status, 202, JSON.stringify(await plain.clone().json()))
  const claimed = await send('POST', '/api/sites/claim', owner, {
    platform: 'wordpress',
    buildId: BUILD_ID
  })
  assert.equal(claimed.status, 201, JSON.stringify(await claimed.clone().json()))
})

// #1403 item 7: with no text model, the answers of Customize your site were sent anyway, and the Apply run failed
// minutes after the build. The questions door now says beforehand whether they can be written.
test(
  'GET /api/sites/questions says whether the answers can be written: the seedText, then web, door',
  opts,
  async () => {
    const { pool } = db
    const { saveProvider, assignDoor } = await import('../src/lib/llm-store.js')
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send, config } = harness(pool, { fetchImpl, envOverrides: { MODEL_API_KEY: '' } })
    const owner = await cookieFor('owner@x.y')
    const written = async (platform) => {
      const res = await send('GET', `/api/sites/questions?platform=${platform}`, owner)
      assert.equal(res.status, 200)
      return (await res.json()).answersWritten
    }
    for (const platform of ['wordpress', 'joomla', 'emdash'])
      assert.equal(await written(platform), false, platform)
    await saveProvider(
      pool,
      { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-or-live', enabled: true },
      config.sessionSecret,
      'ops@tracy.test'
    )
    await assignDoor(pool, 'seedText', { providerId: 'openrouter', model: 'm' }, 'ops@tracy.test')
    for (const platform of ['wordpress', 'joomla', 'emdash'])
      assert.equal(await written(platform), true, platform)
    // A provider taken out of service writes nothing, and the form must not say otherwise.
    await saveProvider(
      pool,
      { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-or-live', enabled: false },
      config.sessionSecret,
      'ops@tracy.test'
    )
    assert.equal(await written('wordpress'), false)
  }
)

test('switch on: a design system named by id builds as it always did', opts, async () => {
  const { pool } = db
  await designSystemsOn(pool)
  const { fetchImpl } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')

  const plan = await send('GET', '/api/sites/design-plan?design=airbnb&platform=joomla', owner)
  assert.equal(plan.status, 200)
  assert.equal((await plan.json()).plan.effectiveDesign, 'airbnb')
  assert.equal((await send('GET', '/api/sites/questions?design=airbnb&platform=joomla', owner)).status, 200)
  const made = await send('POST', '/api/sites', owner, {
    label: 'harbour',
    platform: 'joomla',
    quickstart: 'tracy-apple/j6',
    design: 'airbnb'
  })
  assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
})

/** A sealed quickstart as a read of GitHub leaves it: released, readable, with a contract of its own. */
async function seedSealedRelease(pool, tag, platform, version) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform,
        label: tag,
        version,
        cms: platform === 'wordpress' ? '7.1' : '6.1.1',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        }
      })
    ]
  )
}

/** `tracy-business` on Joomla and EmDash — no WordPress release, which is the refusal under test. */
async function seedTemplateReleases(pool) {
  const insert = (tag, platform, install) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        tag,
        JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform,
          label: 'Tracy Business',
          version: '1.0.0',
          cms: platform === 'joomla' ? '6.1.1' : '0.37.0',
          install,
          card: { template: 'tracy-business' }
        })
      ]
    )
  await insert('tracy-business/j6', 'joomla', {
    webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
    database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
  })
  await insert('tracy-business/emdash', 'emdash', {
    source: { file: 'q.zip', sha256: 'c'.repeat(64) },
    state: { file: 's.tar.gz', sha256: 'd'.repeat(64) }
  })
}

test(
  'POST /api/sites/claim: the name makes the site, its seat and its folder; the press that follows builds it — same request, one site',
  opts,
  async () => {
    const { pool } = db
    // The template is known by its release (ADR 0017), not by a catalogue: seed it as the create door's tests do.
    await seedTemplateReleases(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const buildId = '11111111-1111-4111-8111-111111111111'

    // 1. The claim: a site row, an owner seat, a reserved folder on the host — and no provision.
    const claimed = await send('POST', '/api/sites/claim', owner, {
      label: 'granite-works',
      platform: 'emdash',
      design: 'tracy-business',
      buildId
    })
    assert.equal(
      claimed.status,
      201,
      `${JSON.stringify(await claimed.clone().json())} ${calls.map((x) => x.url).join(',')}`
    )
    const c1 = await claimed.json()
    assert.equal(c1.siteKey, 'granite-works.localhost')
    assert.equal(c1.workspacePath, '/site/granite-works')
    assert.equal(
      c1.next,
      '/granite-works.localhost/?tab=tracy:build:emdash&site=granite-works.localhost',
      'the page is the site key, the dsh folder is the label, and no inspiration= (that would start a second session)'
    )
    assert.ok(
      calls.some((x) => x.url.endsWith('/_host/reserve')),
      'the folder is reserved on the host'
    )
    assert.ok(!calls.some((x) => x.url.endsWith('/_host/provision')), 'nothing is provisioned by a claim')
    const { rows: sites } = await pool.query(
      'select platform, requested_design from site where site_key = $1',
      [c1.siteKey]
    )
    assert.deepEqual(sites[0], { platform: 'emdash', requested_design: 'tracy-business' })
    const { rows: seat } = await pool.query('select role from seat where site_key = $1', [c1.siteKey])
    assert.equal(seat[0].role, 'owner')
    const { rows: cr } = await pool.query(
      'select state, site_key, job_id from site_creation where build_id = $1',
      [buildId]
    )
    assert.deepEqual(cr[0], { state: 'claimed', site_key: c1.siteKey, job_id: null })

    // Asked twice (a reload before the move): the same site, no second row — and its folder made again, as a
    // first claim that lost the host at /reserve left none (local stand 24/10/2026).
    const reservesBefore = calls.filter((x) => x.url.endsWith('/_host/reserve')).length
    const again = await send('POST', '/api/sites/claim', owner, {
      label: 'granite-works',
      platform: 'emdash',
      design: 'tracy-business',
      buildId
    })
    assert.equal(again.status, 200)
    assert.equal((await again.json()).siteKey, c1.siteKey)
    assert.equal(calls.filter((x) => x.url.endsWith('/_host/reserve')).length, reservesBefore + 1)
    // A different request under the same id: a conflict, not a second site.
    const other = await send('POST', '/api/sites/claim', owner, {
      label: 'granite-works',
      platform: 'joomla',
      design: 'tracy-business',
      buildId
    })
    assert.equal(other.status, 409)
    assert.equal((await other.json()).code, 'IDEMPOTENCY_CONFLICT')

    // 2. The press in the site's workspace: the same build id, the same request → provision.
    const built = await send('POST', '/api/sites', owner, {
      label: 'granite-works',
      platform: 'emdash',
      design: 'tracy-business',
      designRevision: 'template',
      buildId
    })
    assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))
    const b = await built.json()
    assert.equal(b.siteKey, c1.siteKey)
    assert.equal(b.builtFrom, 'tracy-business/emdash')
    assert.equal(calls.filter((x) => x.url.endsWith('/_host/provision')).length, 1)
    const { rows: after } = await pool.query(
      'select state, job_id, attempt from site_creation where build_id = $1',
      [buildId]
    )
    assert.equal(after[0].state, 'provisioning')
    assert.equal(after[0].attempt, 1)
    assert.equal(
      (await pool.query('select count(*)::int as n from site')).rows[0].n,
      1,
      'one site, claimed then built'
    )

    // The name is taken for everyone else, from the claim on.
    const stranger = await cookieFor('other@x.y')
    const taken = await send('POST', '/api/sites/claim', stranger, {
      label: 'granite-works',
      platform: 'wordpress',
      buildId: '22222222-2222-4222-8222-222222222222'
    })
    assert.equal(taken.status, 409)
    assert.equal((await taken.json()).code, 'TAKEN')
  }
)

// 20/09 (tasks/pa-dia-chi-mot-duong-cho-site.md §7: "one or two loads would be better"). A create used to
// land on `/<site>/?…`, and dsh then wrote `s/<id>` onto the bar a beat later. When the claim door can
// have the session made BEFORE the browser moves, the address it hands back already names it, and
// the site page loads once and settles — no write after it. The session is made through the same
// RPC door the browser uses (`POST /<site>/api/session/create`), on a seat minted for the site.
test(
  'POST /api/sites/claim: when dsh makes the session ahead, next names it — /<site>/s/<id>',
  opts,
  async () => {
    const { pool } = db
    await seedTemplateReleases(pool)
    const rpc = []
    const { fetchImpl: base } = fakeNetwork()
    const fetchImpl = async (input, init) => {
      const u = new URL(String(input))
      if (u.host === 'dsh.test' && u.pathname.startsWith('/granite-works.localhost/api/')) {
        const body = JSON.parse(init.body)
        rpc.push({
          endpoint: u.pathname.slice('/granite-works.localhost/api/'.length),
          body,
          headers: init.headers
        })
        const value =
          body.method === 'workspace/create'
            ? { workspace: { workspaceId: 'w-1', path: '/site/granite-works' }, created: true }
            : { sessionId: 'session-ready-1' }
        return new Response(
          JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value } }),
          {
            status: 200
          }
        )
      }
      return base(input, init)
    }
    const minted = []
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: {
        mintSeatSession: async ({ grant }) => {
          minted.push(grant)
          return 'jwt-for-the-site'
        }
      }
    })
    const owner = await cookieFor('owner@x.y')
    const claimed = await send('POST', '/api/sites/claim', owner, {
      label: 'granite-works',
      platform: 'emdash',
      design: 'tracy-business',
      buildId: '22222222-2222-4222-8222-222222222222'
    })
    assert.equal(claimed.status, 201)
    const c = await claimed.json()
    assert.equal(
      c.next,
      '/granite-works.localhost/s/session-ready-1?tab=tracy:build:emdash&site=granite-works.localhost'
    )
    // The seat the session was made on is the site's own, for the person who claimed it.
    assert.deepEqual(minted[0], {
      role: 'owner',
      email: 'owner@x.y',
      folders: ['/site/granite-works'],
      site: 'granite-works.localhost'
    })
    // Both calls go through dsh's gateway under the site's mount, as the browser would.
    assert.deepEqual(
      rpc.map((r) => r.endpoint),
      ['workspace/create', 'session/create']
    )
    assert.equal(rpc[0].headers.cookie, 'dsh_gateway_token=jwt-for-the-site')
    assert.equal(rpc[0].headers['x-forwarded-prefix'], '/granite-works.localhost')
    assert.deepEqual(rpc[0].body.payload, { args: { request: { path: '/site/granite-works' } } })
    // By workspace id, never by cwd — the gateway's first-baseline seeding keeps only sessions
    // that sit in a workspace (`sessionMadeAhead` says what a cwd session cost on dev).
    assert.deepEqual(rpc[1].body.payload, {
      args: { request: { workspaceId: 'w-1', agentPreset: 'designer-emdash' } }
    })
  }
)

// A dsh that cannot be reached, refuses, or answers nonsense must not stop a claim: the address
// falls back to the site root, where dsh makes the session on arrival as it does today.
test(
  'POST /api/sites/claim: a session dsh could not make ahead falls back to the site root',
  opts,
  async () => {
    const { pool } = db
    await seedTemplateReleases(pool)
    const { fetchImpl: base } = fakeNetwork()
    const fetchImpl = async (input, init) => {
      const u = new URL(String(input))
      if (u.host === 'dsh.test' && u.pathname.includes('/api/'))
        return new Response('<html>403</html>', { status: 403 })
      return base(input, init)
    }
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      seatDoor: { mintSeatSession: async () => 'jwt' }
    })
    const owner = await cookieFor('owner@x.y')
    const claimed = await send('POST', '/api/sites/claim', owner, {
      label: 'granite-works',
      platform: 'emdash',
      design: 'tracy-business',
      buildId: '33333333-3333-4333-8333-333333333333'
    })
    assert.equal(claimed.status, 201)
    const c = await claimed.json()
    assert.equal(c.next, '/granite-works.localhost/?tab=tracy:build:emdash&site=granite-works.localhost')
  }
)

test(
  'POST /api/sites/claim: no name → a draft address the fleet made up, and the press that follows uses it',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const buildId = '33333333-3333-4333-8333-333333333333'
    const claimed = await send('POST', '/api/sites/claim', owner, {
      platform: 'emdash',
      design: 'tracy-business',
      buildId
    })
    assert.equal(claimed.status, 201, JSON.stringify(await claimed.clone().json()))
    const c = await claimed.json()
    assert.match(c.label, /^ed-[a-z0-9]{6}$/, 'a draft address named by its CMS, not a name nobody gave')
    assert.equal(c.siteKey, `${c.label}.localhost`)
    assert.equal(c.next, `/${c.label}.localhost/?tab=tracy:build:emdash&site=${c.label}.localhost`)
    // Asked again: the same draft, not a second one.
    const again = await send('POST', '/api/sites/claim', owner, {
      platform: 'emdash',
      design: 'tracy-business',
      buildId
    })
    assert.equal((await again.json()).label, c.label)
    // The press sends the label it was given; same fingerprint, same request, one site.
    const built = await send('POST', '/api/sites', owner, {
      label: c.label,
      platform: 'emdash',
      design: 'tracy-business',
      designRevision: 'template',
      buildId
    })
    assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))
    assert.equal((await built.json()).siteKey, c.siteKey)
    assert.equal(calls.filter((x) => x.url.endsWith('/_host/provision')).length, 1)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 1)
  }
)

test(
  'POST /api/sites/claim: a nameless build whose provision FAILED is retried by the same press — not IDEMPOTENCY_CONFLICT',
  opts,
  async () => {
    // Measured 23/09/2026 on the local stand: a Joomla build claimed with no name, its provision
    // failed, and pressing Retry answered 409 IDEMPOTENCY_CONFLICT. The claim stored the hash of the
    // NAMELESS request; the press carries the draft label, so the hash moved — accepted while the
    // row said `claimed`, refused once it said `failed`. Same build, same answers: it is the retry.
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const buildId = '44444444-4444-4444-8444-444444444444'
    const ask = { platform: 'emdash', design: 'tracy-business', buildId }
    const c = await (await send('POST', '/api/sites/claim', owner, ask)).json()
    const press = { ...ask, label: c.label, designRevision: 'template' }
    const first = await send('POST', '/api/sites', owner, press)
    assert.equal(first.status, 202, JSON.stringify(await first.clone().json()))
    const { jobId } = await first.json()
    await pool.query("update job set state = 'failed' where id = $1", [jobId])
    await pool.query("update site_creation set state = 'failed' where job_id = $1", [jobId])
    const retry = await send('POST', '/api/sites', owner, press)
    assert.equal(retry.status, 202, JSON.stringify(await retry.clone().json()))
    const body = await retry.json()
    assert.equal(body.siteKey, c.siteKey)
    assert.equal(body.attempt, 2)
    assert.equal(calls.filter((x) => x.url.endsWith('/_host/provision')).length, 2)
    // Other answers under the same build id are still a different build.
    const other = await send('POST', '/api/sites', owner, { ...press, design: 'tracy-apple' })
    assert.equal(other.status, 409)
  }
)

test('POST /api/sites/claim: refuses what the create door refuses, and needs a build id', opts, async () => {
  const { pool } = db
  // The template is known by its release (ADR 0017), not by a catalogue: seed it as the create door's tests do.
  await seedTemplateReleases(pool)
  const { fetchImpl } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')
  const noId = await send('POST', '/api/sites/claim', owner, {
    label: 'granite-works',
    platform: 'wordpress'
  })
  assert.equal(noId.status, 400)
  assert.equal((await noId.json()).code, 'INVALID_BUILD_ID')
  const badLabel = await send('POST', '/api/sites/claim', owner, {
    label: 'ab',
    platform: 'wordpress',
    buildId: '11111111-1111-4111-8111-111111111111'
  })
  assert.equal((await badLabel.json()).code, 'INVALID_LABEL')
  const wrongCms = await send('POST', '/api/sites/claim', owner, {
    label: 'granite-works',
    platform: 'wordpress',
    design: 'tracy-business',
    buildId: '11111111-1111-4111-8111-111111111111'
  })
  assert.equal((await wrongCms.json()).code, 'UNSUPPORTED_PLATFORM')
  assert.equal(
    (
      await send('POST', '/api/sites/claim', undefined, {
        label: 'granite-works',
        platform: 'wordpress',
        buildId: '11111111-1111-4111-8111-111111111111'
      })
    ).status,
    401
  )
  assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 0)
})

test(
  'POST /api/sites: a template card is installed as seen on the CMS pressed, and refused on one it has no build for',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    // Two releases of the same template, as a read of GitHub would have left them: the card is
    // what makes a release a template, and the CMS it has no release for is the one refused.
    await seedTemplateReleases(pool)

    // Joomla: the template's own quickstart, no contract, no design plan.
    // Exactly what the Build form sends after asking the plan door: the template as `design`,
    // its quickstart echoed back, the plan's revision.
    const joomla = await send('POST', '/api/sites', owner, {
      label: 'granite',
      platform: 'joomla',
      design: 'tracy-business',
      quickstart: 'tracy-business/j6',
      designRevision: 'template'
    })
    assert.equal(joomla.status, 202, JSON.stringify(await joomla.clone().json()))
    const body = await joomla.json()
    assert.equal(body.template, 'tracy-business')
    assert.equal(body.builtFrom, 'tracy-business/j6')
    assert.equal(body.design, undefined, 'no design plan: the template is what was asked for')
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.quickstart, 'tracy-business/j6')
    assert.equal(provision.design, undefined, 'the fleet is told the archive, not a design to resolve')
    const { rows } = await pool.query(
      'select requested_design, effective_design, design_profile from site where site_key = $1',
      ['granite.localhost']
    )
    assert.deepEqual(rows[0], {
      requested_design: 'tracy-business',
      effective_design: 'tracy-business',
      design_profile: null
    })

    // EmDash: the template's EmDash build, not the default base.
    const emdash = await send('POST', '/api/sites', owner, {
      label: 'slateworks',
      platform: 'emdash',
      design: 'tracy-business'
    })
    assert.equal(emdash.status, 202, JSON.stringify(await emdash.clone().json()))
    const e = await emdash.json()
    assert.equal(e.builtFrom, 'tracy-business/emdash')
    assert.equal(e.designApplied, undefined, 'nothing was substituted, so nothing to confess')

    // WordPress: the card has no WordPress build — the same refusal the greyed button carried.
    const wp = await send('POST', '/api/sites', owner, {
      label: 'marblework',
      platform: 'wordpress',
      design: 'tracy-business'
    })
    assert.equal(wp.status, 400)
    assert.equal((await wp.json()).code, 'UNSUPPORTED_PLATFORM')

    // And the plan door answers the same way, on both sides.
    const plan = await send('GET', '/api/sites/design-plan?design=tracy-business&platform=joomla', owner)
    assert.equal(plan.status, 200)
    const card = (await plan.json()).plan
    assert.deepEqual(card.workflow, 'template')
    assert.equal(card.multilingual, undefined, 'a card that is no one-language design says nothing')
    const none = await send('GET', '/api/sites/design-plan?design=tracy-business&platform=wordpress', owner)
    assert.equal(none.status, 400)
  }
)

/**
 * Tracy Base (the EmDash default base) and Tracy SaaS as GitHub leaves them on 08/10/2026: SaaS is
 * taken off Design inspiration (`inspiration_hidden`) and carries its card inside its setting
 * WITHOUT repeating the template id; its pages are home + pricing.
 */
async function seedHiddenSaasBesideBase(pool) {
  const insert = (tag, label, setting, hidden) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason, inspiration_hidden)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null, $4)`,
      [
        tag,
        JSON.stringify({
          name: label,
          kind: 'quickstart',
          github: 'published',
          publishedAt: null,
          assets: []
        }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform: 'emdash',
          label,
          version: '1.4.0',
          cms: '1.1.0',
          install: {
            source: { file: 'q.zip', sha256: 'c'.repeat(64) },
            state: { file: 's.tar.gz', sha256: 'd'.repeat(64) }
          },
          ...setting
        }),
        hidden
      ]
    )
  await insert('tracy-base/emdash-0.x', 'Tracy Base', {}, false)
  await insert(
    'tracy-saas/emdash-0.x',
    'Tracy SaaS',
    { template: 'tracy-saas', card: { provider: 'JoomlArt', blurb: 'SaaS.', image: 'x.png' } },
    true
  )
  await givePages(pool, 'tracy-saas/emdash-0.x', [
    { id: 'home', label: 'Home', home: true },
    { id: 'pricing', label: 'Pricing' }
  ])
  await pool.query(
    `insert into build_base (platform, quickstart, updated_by) values ('emdash', $1, 'test')`,
    ['tracy-base/emdash-0.x']
  )
}

test(
  'POST /api/sites + GET /api/sites/questions: a hidden EmDash template named by id builds and asks as itself, never the base (#1013)',
  opts,
  async () => {
    const { pool } = db
    await seedHiddenSaasBesideBase(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send, get } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const pagesOf = (served) => served.questions.find((q) => q.id === 'pages')?.options

    // The questions door: by template id and by quickstart, the SaaS release's own pages.
    const byId = await (await get('/api/sites/questions?platform=emdash&design=tracy-saas', owner)).json()
    assert.equal(byId.quickstart, 'tracy-saas/emdash-0.x')
    assert.deepEqual(pagesOf(byId), ['home', 'pricing'])
    const byTag = await (
      await get(
        `/api/sites/questions?platform=emdash&quickstart=${encodeURIComponent('tracy-saas/emdash-0.x')}`,
        owner
      )
    ).json()
    assert.equal(byTag.quickstart, 'tracy-saas/emdash-0.x')
    assert.deepEqual(pagesOf(byTag), ['home', 'pricing'])
    // Nothing named: the default base, as before.
    const plain = await (await get('/api/sites/questions?platform=emdash', owner)).json()
    assert.equal(plain.quickstart, 'tracy-base/emdash-0.x')

    // The create door: the template itself, nothing substituted.
    const built = await send('POST', '/api/sites', owner, {
      label: 'helixwatch',
      platform: 'emdash',
      design: 'tracy-saas'
    })
    assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))
    const b = await built.json()
    assert.equal(b.builtFrom, 'tracy-saas/emdash-0.x')
    assert.equal(b.template, 'tracy-saas')
    assert.equal(b.designApplied, undefined, 'nothing was substituted, so nothing to confess')
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.quickstart, 'tracy-saas/emdash-0.x')
  }
)

test(
  'POST /api/sites: the Add site wizard sends only {label, platform, design} and a WordPress template builds',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    await seedTemplateReleases(pool)
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        'tracy-business/wp7',
        JSON.stringify({
          name: 'tracy-business/wp7',
          kind: 'quickstart',
          github: 'published',
          publishedAt: null,
          assets: []
        }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform: 'wordpress',
          label: 'Tracy Business',
          version: '1.0.0',
          cms: '7.0',
          install: {
            webroot: { file: 'w.tar.gz', sha256: 'e'.repeat(64) },
            database: { file: 'd.sql.gz', sha256: 'f'.repeat(64) }
          },
          card: { template: 'tracy-business' }
        })
      ]
    )
    const wp = await send('POST', '/api/sites', owner, {
      label: 'basalt',
      platform: 'wordpress',
      design: 'tracy-business'
    })
    assert.equal(wp.status, 202, JSON.stringify(await wp.clone().json()))
    const body = await wp.json()
    assert.equal(body.template, 'tracy-business')
    assert.equal(body.builtFrom, 'tracy-business/wp7')
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.quickstart, 'tracy-business/wp7')
  }
)

// ── A brand (`brand:<host>`) on WordPress — ADR 0023, brand on WordPress ─────────────────────────
//
// The pure half is `brand-plan.test.mjs`. What this pins is the door: a brand press builds a fresh
// WordPress the Build dresses with the released `tracy` theme (the road every catalogue look on
// WordPress takes), the site row says the brand was asked for, the fleet is told no design it
// would try to resolve, and the refusal only stands where the Design inspiration button is grey.

/** `tracy-base` on WordPress: a template card whose sealing profile names a catalogue system. */
async function seedBrandWearer(pool) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      'tracy-base/wp7',
      JSON.stringify({
        name: 'tracy-base/wp7',
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'wordpress',
        label: 'Tracy Base',
        version: '1.0.0',
        cms: '7.1',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        },
        card: { template: 'tracy-base' }
      })
    ]
  )
}

test(
  'GET /api/sites/design-plan: a brand on WordPress plans the brand, where a template can wear one',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')

    // No WordPress template wears a catalogue look: the same answer the greyed button carries.
    const grey = await send(
      'GET',
      '/api/sites/design-plan?design=brand:basecamp.com&platform=wordpress',
      owner
    )
    assert.equal(grey.status, 400)
    assert.equal((await grey.json()).code, 'UNSUPPORTED_DESIGN')

    await seedBrandWearer(pool)
    const lit = await send(
      'GET',
      '/api/sites/design-plan?design=brand:basecamp.com&platform=wordpress',
      owner
    )
    assert.equal(lit.status, 200, JSON.stringify(await lit.clone().json()))
    const { plan } = await lit.json()
    assert.equal(plan.requestedDesign, 'brand:basecamp.com')
    assert.equal(plan.workflow, 'brand')
    assert.equal(plan.baseQuickstart, null)
    assert.deepEqual(plan.design, { id: 'brand:basecamp.com', source: 'brand' })

    // A brand id is a host, checked before it is anything else.
    const odd = await send('GET', '/api/sites/design-plan?design=brand:..%2Fetc&platform=wordpress', owner)
    assert.equal(odd.status, 400)
    assert.equal((await odd.json()).code, 'UNKNOWN_DESIGN')

    assert.equal((await pool.query('select 1 from site')).rowCount, 0)
    assert.equal(calls.length, 0)
  }
)

test(
  'POST /api/sites: a brand on WordPress builds a fresh site, records the brand, and tells the fleet no design',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    await seedBrandWearer(pool)

    const made = await send('POST', '/api/sites', owner, {
      label: 'campfire',
      platform: 'wordpress',
      design: 'brand:basecamp.com',
      designRevision: 'brand'
    })
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    const body = await made.json()
    assert.deepEqual(body.design.design, { id: 'brand:basecamp.com', source: 'brand' })
    assert.equal(body.template, undefined, 'a brand is not a template press')

    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.fresh, true)
    assert.equal(provision.quickstart, undefined, 'the Build dresses a fresh WordPress with the tracy theme')
    assert.equal(provision.design, undefined, 'the fleet resolves Joomla designs only')
    assert.equal(provision.designRevision, undefined)

    const { rows } = await pool.query(
      'select requested_design, effective_design, design_profile, quickstart_tag from site where site_key = $1',
      ['campfire.localhost']
    )
    assert.deepEqual(rows[0], {
      requested_design: 'brand:basecamp.com',
      effective_design: 'brand:basecamp.com',
      design_profile: null,
      quickstart_tag: null
    })

    // A plan from another revision is answered with this one, not built.
    const stale = await send('POST', '/api/sites', owner, {
      label: 'campfire-two',
      platform: 'wordpress',
      design: 'brand:basecamp.com',
      designRevision: 'template'
    })
    assert.equal(stale.status, 409)
    assert.equal((await stale.json()).plan.workflow, 'brand')

    // An id that names no host claims nothing.
    const odd = await send('POST', '/api/sites', owner, {
      label: 'campfire-three',
      platform: 'wordpress',
      design: 'brand:../../etc'
    })
    assert.equal(odd.status, 400)
    assert.equal((await odd.json()).code, 'UNKNOWN_DESIGN')
    assert.equal((await pool.query('select 1 from site where label <> $1', ['campfire'])).rowCount, 0)
  }
)

// Measured 30/09 on the stand `dsgnm`: `POST /api/sites` with `brand:basecamp.com` answered the brand
// plan at 01:17 +04, `GET /api/sites/design-plan` with the same design answered `UNSUPPORTED_DESIGN`
// from 01:26. Not two rules: `tracy-base/j6` was re-cut as 1.0.1 at 01:16 (release asset
// `tracy_setting.json`), the 10-minute releases refresh read it after the press, and neither 1.0.1
// nor `tracy-base/wp7` 1.1.1 has a sealing profile naming a catalogue system — so from then on no
// WordPress card wore one and BOTH doors refused. This pins that the two doors give one answer on
// one table, lit and grey, so the next report of a disagreement starts from the data.
test(
  'brand on WordPress: the plan door and the create door give the same answer on the same releases',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const ask = () =>
      send('GET', '/api/sites/design-plan?design=brand:basecamp.com&platform=wordpress', owner)
    const press = (label) =>
      send('POST', '/api/sites', owner, { label, platform: 'wordpress', design: 'brand:basecamp.com' })

    await seedBrandWearer(pool)
    const planned = await ask()
    assert.equal(planned.status, 200, JSON.stringify(await planned.clone().json()))
    const made = await press('emberlight')
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    assert.deepEqual((await made.json()).design, (await planned.json()).plan)

    // The card's only archive moves to a version no profile seals (9.9.9 — 1.1.1 got its profile on
    // 30/09, so a real version would go stale here): it wears nothing, and both refuse.
    await pool.query(
      `update quickstart_releases set setting = jsonb_set(setting, '{version}', '"9.9.9"') where tag = $1`,
      ['tracy-base/wp7']
    )
    const grey = await ask()
    assert.equal(grey.status, 400)
    assert.equal((await grey.json()).code, 'UNSUPPORTED_DESIGN')
    const refused = await press('embergrey')
    assert.equal(refused.status, 400)
    assert.equal((await refused.json()).code, 'UNSUPPORTED_DESIGN')
  }
)

// Measured 30/09 on the stand `dsgnm`: the brand is extracted into the folder of the site the viewer
// is in (`Brand/<host>/`), the new site is built in its own folder, and `style` found no
// `tokens.css` there. The press names the site it came from (`brandFrom`); this door lets the host
// copy the brand only from a site the SAME viewer holds a seat on — never another customer's folder.
test(
  'POST /api/sites: a brand press brings the brand from a site the viewer holds a seat on, and from no other',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const stranger = await cookieFor('stranger@x.y')
    await seedBrandWearer(pool)
    const brandPress = (label, extra = {}) => ({
      label,
      platform: 'wordpress',
      design: 'brand:basecamp.com',
      designRevision: 'brand',
      ...extra
    })
    assert.equal((await send('POST', '/api/sites', owner, brandPress('extracted'))).status, 202)
    assert.equal((await send('POST', '/api/sites', stranger, brandPress('theirs'))).status, 202)
    const provisions = () =>
      calls.filter((c) => c.url.endsWith('/_host/provision')).map((c) => JSON.parse(c.init.body))
    assert.equal(provisions()[0].brandFrom, undefined, 'a press that names no source brings nothing')

    const made = await send(
      'POST',
      '/api/sites',
      owner,
      brandPress('wearer', { brandFrom: 'extracted.localhost' })
    )
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    assert.deepEqual(provisions().at(-1).brandFrom, { label: 'extracted', host: 'basecamp.com' })

    // Another customer's site: refused before anything is claimed or provisioned.
    const before = provisions().length
    const theirs = await send(
      'POST',
      '/api/sites',
      owner,
      brandPress('borrower', { brandFrom: 'theirs.localhost' })
    )
    assert.equal(theirs.status, 403)
    assert.equal((await theirs.json()).code, 'SEAT_NOT_AUTHORIZED')
    const nowhere = await send(
      'POST',
      '/api/sites',
      owner,
      brandPress('phantom', { brandFrom: 'nowhere.localhost' })
    )
    assert.equal(nowhere.status, 403)
    assert.equal(provisions().length, before)
    assert.equal(
      (await pool.query('select 1 from site where label in ($1, $2)', ['borrower', 'phantom'])).rowCount,
      0
    )

    // Not a brand press: the source means nothing and is not passed on.
    const plain = await send('POST', '/api/sites', owner, {
      label: 'plainwp',
      platform: 'wordpress',
      brandFrom: 'extracted.localhost'
    })
    assert.equal(plain.status, 202, JSON.stringify(await plain.clone().json()))
    assert.equal(provisions().at(-1).brandFrom, undefined)
  }
)

// ── A WordPress quickstart (tracy-base/wp7) — accepted from the catalog, refused across platforms ─
//
// The pure half (`quickstartAllowed`) is `quickstarts.test.mjs`; what this pins is the door: the
// pair reaches the fleet as named, with no design plan (the archive IS the design), and the Joomla
// archive on a WordPress create — or the reverse — is a 400 rather than a site nobody asked for.

test(
  'POST /api/sites: a WordPress quickstart from the catalog reaches the fleet as named, without a design plan',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    // Since 26/09 the entry pins a Claude Cowork plugin by asset id (0.14.0-rc.3 carries the tracy-base
    // profiles), and a part fetched by asset id needs the releases credential before anything is
    // created — the refusal without one is its own test below.
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      envOverrides: { TRACY_RELEASES_GITHUB_TOKEN: 'ghs_test' }
    })
    const owner = await cookieFor('owner@x.y')
    // The contract profile `tracy-base/wp7/1.0.0` ships in this repository; what the door needs
    // besides it is the release itself, read off GitHub into the table.
    await seedSealedRelease(pool, 'tracy-base/wp7', 'wordpress', '1.0.0')
    const made = await send('POST', '/api/sites', owner, {
      label: 'quayside',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7'
    })
    assert.equal(made.status, 202)
    const body = await made.json()
    assert.equal(body.design, undefined)
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.platform, 'wordpress')
    assert.equal(provision.fresh, true)
    // 🔒 The seal travels with the entry. `provision.sh` reads it back with
    // `quickstart.py --field contract`, and a site provisioned without it is one the Claude Cowork plugin
    // accepts structural writes on — so this assertion is the whole point of the change.
    assert.equal(provision.quickstartEntry.contract, 'tracy-base/wp7/1.0.0')
    assert.equal(provision.quickstartEntry.coworkMinVersion, '0.8.0')
    assert.equal(provision.quickstart, 'tracy-base/wp7')
    assert.equal(provision.design, undefined)
    assert.equal(provision.designRevision, undefined)

    for (const [platform, quickstart] of [
      ['wordpress', 'tracy-apple/j6'],
      ['wordpress', 'tracy-base/j6'],
      ['joomla', 'tracy-base/wp7'],
      ['emdash', 'tracy-base/wp7'],
      ['wordpress', 'tracy-base/wp8']
    ]) {
      const refused = await send('POST', '/api/sites', owner, {
        label: 'quayside-two',
        platform,
        quickstart
      })
      assert.equal(refused.status, 400, `${platform} + ${quickstart}`)
      assert.equal((await refused.json()).code, 'UNSUPPORTED_QUICKSTART')
    }
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/provision')).length, 1)
  }
)

test('GET /api/sites/questions serves the CMS standard file as the create door will', opts, async () => {
  const { pool } = db
  // Library designs by id: the operator's switch is on, as it was before there was one.
  await designSystemsOn(pool)
  const { get, cookieFor } = harness(pool)
  assert.equal((await get('/api/sites/questions?platform=emdash')).status, 401, 'a viewer must be signed in')
  const cookie = await cookieFor('viewer@example.test')
  // EmDash: the default base is the one template the catalogue carries. Its questionnaire is a
  // candidate on this server — put there by a read of its release — and is not served (D11).
  // The EmDash base is whatever release this server has read and can install.
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      'tracy-business/emdash',
      JSON.stringify({
        name: 'Tracy Business',
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        label: 'Tracy Business',
        version: '1.0.0',
        cms: '0.37.0',
        install: {
          source: { file: 'q.zip', sha256: 'a'.repeat(64) },
          state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
        }
      })
    ]
  )
  await pool.query(
    `insert into question_set (id, owner, name, source, version, sha256, doc)
     values ($1, $2, 'Released 1.0.0', 'released', '1.0.0', 'aa', $3::jsonb)`,
    [
      'tracy-business/emdash@aa',
      'tracy-business/emdash',
      JSON.stringify({
        schemaVersion: 'tracy-questions/v1',
        owner: 'tracy-business/emdash',
        languages: ['en', 'vi'],
        questions: [
          {
            id: 'name',
            kind: 'text',
            step: 1,
            label: { en: 'Company name', vi: 'Tên công ty' },
            feeds: ['site.name']
          },
          { id: 'sector', kind: 'text', step: 2, label: { en: 'Sector', vi: 'Ngành' }, feeds: ['agent'] },
          {
            id: 'contact',
            kind: 'text',
            step: 2,
            label: { en: 'Contact', vi: 'Liên hệ' },
            feeds: ['agent']
          }
        ]
      })
    ]
  )
  const emdash = await (await get('/api/sites/questions?platform=emdash&lang=vi', cookie)).json()
  // The released set is kept but not served this round (D11): the standard EmDash file is.
  assert.equal(emdash.source, 'standard')
  assert.equal(emdash.quickstart, 'tracy-business/emdash')
  // The logo and favicon questions follow the `site-brand-uploads` switch (D12), off by default and here: they are
  // left out, and nothing else is.
  const withoutBrand = (platform) =>
    STANDARD_QUESTIONS_FILE[platform].questions
      .filter((q) => q.kind !== 'logo' && q.kind !== 'favicon')
      .map((q) => q.id)
  assert.deepEqual(
    emdash.questions.map((q) => q.id),
    withoutBrand('emdash')
  )
  // Joomla: the design plan names a base that ships no set → the CMS's standard file, in its order.
  const joomla = await (await get('/api/sites/questions?platform=joomla&design=apple', cookie)).json()
  assert.equal(joomla.source, 'standard')
  assert.deepEqual(
    joomla.questions.map((q) => q.id),
    withoutBrand('joomla')
  )
  // The language options are the tags the pack catalog pins, lowercased by sync-questions.mjs
  // (43 since 07/10, U10 of #1013) — no bare "fr": a bare code is a question for the customer, never an option.
  const offered = joomla.questions.find((q) => q.id === 'languages').options
  assert.ok(offered.includes('fr-fr'), `fr-fr offered among ${offered.length}`)
  assert.ok(!offered.includes('fr'), 'no bare language code')
  assert.equal(joomla.languages, 'one', 'every site is built in one language this round (D10)')
  // A design that can never carry a second edition (ja-kinetic) is built in ONE language too.
  const kinetic = await (await get('/api/sites/questions?platform=joomla&design=ja-kinetic', cookie)).json()
  assert.equal(kinetic.languages, 'one')
  // WordPress: no archive on this build → standard; an unknown platform is refused.
  const wp = await (await get('/api/sites/questions?platform=wordpress', cookie)).json()
  assert.equal(wp.source, 'standard')
  assert.equal(wp.quickstart, null)
  assert.equal((await get('/api/sites/questions?platform=drupal', cookie)).status, 400)
})

/** The pages `tracy_site_pages.json` gives a release, as the release reader stores them. */
async function givePages(pool, tag, pages) {
  await pool.query('update quickstart_releases set pages = $2::jsonb where tag = $1', [
    tag,
    JSON.stringify(pages)
  ])
}
const NOVA_PAGES = [
  { id: 'home', label: 'Home', home: true },
  { id: 'about-us', label: 'About us' },
  { id: 'contact', label: 'Contact' }
]
/** Brand uploads on: an artifact store configured and the `site-brand-uploads` switch pressed. */
const BRAND_STORE = {
  ARTIFACT_S3_ENDPOINT: 'http://store.test:9000',
  ARTIFACT_S3_BUCKET: 'tracy-artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'ak',
  ARTIFACT_S3_SECRET_KEY: 'sk'
}

test('GET /api/sites/questions fits the standard set to the template it serves (T05)', opts, async () => {
  const { pool } = db
  await seedSealedRelease(pool, 'quickstart/ja-vega/wp7', 'wordpress', '1.1.11')
  await seedSealedRelease(pool, 'quickstart/ja-nova/wp7', 'wordpress', '1.1.9')
  await givePages(pool, 'quickstart/ja-nova/wp7', NOVA_PAGES)
  const { get, cookieFor } = harness(pool, { envOverrides: BRAND_STORE })
  const cookie = await cookieFor('viewer@example.test')
  const ask = async (tag) =>
    (
      await get(`/api/sites/questions?platform=wordpress&quickstart=${encodeURIComponent(tag)}`, cookie)
    ).json()
  const q = (served, id) => served.questions.find((x) => x.id === id)

  // Switch off (its default): no logo, no favicon; every other question of the file.
  const off = await ask('quickstart/ja-vega/wp7')
  assert.deepEqual(
    off.questions.map((x) => x.id),
    STANDARD_QUESTIONS_FILE.wordpress.questions
      .filter((x) => !['logo', 'favicon'].includes(x.kind))
      .map((x) => x.id)
  )
  assert.equal(off.languages, 'one')

  await saveUiSwitches(pool, { 'site-brand-uploads': true }, 'test')
  const vega = await ask('quickstart/ja-vega/wp7')
  assert.deepEqual(q(vega, 'logo').variants, ['dark'], 'JA Vega WordPress: one logo for a dark header')
  assert.ok(q(vega, 'favicon'))
  assert.equal(q(vega, 'pages').keepsAllPages, true, 'no page list: every page kept, nothing offered')
  assert.equal(q(vega, 'pages').options, undefined)
  const nova = await ask('quickstart/ja-nova/wp7')
  assert.deepEqual(q(nova, 'logo').variants, ['light', 'dark'])
  assert.deepEqual(q(nova, 'pages').options, ['home', 'about-us', 'contact'])
  assert.deepEqual(q(nova, 'pages').locked, ['home'])
  assert.deepEqual(q(nova, 'pages').optionLabels, {
    home: 'Home',
    'about-us': 'About us',
    contact: 'Contact'
  })
  // What was served is what was kept: the snapshot carries the pages and the tiles.
  const kept = await (await get(`/api/sites/questions/snapshot?hash=${nova.set.contentHash}`, cookie)).json()
  const keptPages = kept.doc.questions.find((x) => x.id === 'pages')
  assert.deepEqual(keptPages.options, ['home', 'about-us', 'contact'])
  assert.deepEqual(kept.doc.questions.find((x) => x.id === 'logo').variants, ['light', 'dark'])
})

test(
  'POST /api/sites keeps only the pages of the template being built, home always (T05)',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const briefs = fakeBriefs()
    const { cookieFor, send, get } = harness(pool, {
      fetchImpl,
      briefs,
      envOverrides: { TRACY_RELEASES_GITHUB_TOKEN: 'ghs_test' }
    })
    const owner = await cookieFor('owner@x.y')
    await seedSealedRelease(pool, 'tracy-base/wp7', 'wordpress', '1.0.0')
    await givePages(pool, 'tracy-base/wp7', NOVA_PAGES)
    const served = await (
      await get('/api/sites/questions?platform=wordpress&quickstart=tracy-base%2Fwp7', owner)
    ).json()

    const made = await send('POST', '/api/sites', owner, {
      label: 'page-keeper',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7',
      brief: {
        questionnaire: served.set.contentHash,
        answers: { name: 'Golden Crust', pages: ['contact', 'gallery'] }
      }
    })
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    const [started] = briefs.log.started
    assert.deepEqual(started.brief.pages, {
      all: [
        { id: 'home', label: 'Home', home: true },
        { id: 'about-us', label: 'About us' },
        { id: 'contact', label: 'Contact' }
      ],
      picked: ['home', 'contact']
    })
    assert.equal(started.brief.pageNotes.length, 1, 'the unknown page is dropped with a note')
    assert.match(started.brief.pageNotes[0], /"gallery"/)
    assert.deepEqual(started.brief.answers.find((a) => a.id === 'pages').value, ['home', 'contact'])

    // A snapshot kept before the pages were filled in (the standard file as it is) still keeps the pages.
    const old = JSON.parse(JSON.stringify(STANDARD_QUESTIONS_FILE.wordpress))
    const oldHash = 'e'.repeat(64)
    await pool.query(
      `insert into question_snapshot (content_hash, set_id, revision, doc) values ($1, 'standard:wordpress', 0, $2::jsonb)`,
      [oldHash, JSON.stringify(old)]
    )
    const again = await send('POST', '/api/sites', owner, {
      label: 'page-keeper-two',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7',
      brief: { questionnaire: oldHash, answers: { pages: ['about-us'] } }
    })
    assert.equal(again.status, 202)
    assert.deepEqual(briefs.log.started[1].brief.pages.picked, ['home', 'about-us'])

    // A template with no page list: no pages in the brief, the other answers kept.
    await givePages(pool, 'tracy-base/wp7', null)
    const bare = await send('POST', '/api/sites', owner, {
      label: 'page-keeper-three',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7',
      brief: { answers: { name: 'Golden Crust', pages: ['home'] } }
    })
    assert.equal(bare.status, 202)
    assert.equal(briefs.log.started[2].brief.pages, null)
    assert.deepEqual(
      briefs.log.started[2].brief.answers.map((a) => a.id),
      ['name']
    )
  }
)

test('POST /api/sites builds one language: of several sent, only the first is kept (D10)', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork()
  const briefs = fakeBriefs()
  const { cookieFor, send, get } = harness(pool, {
    fetchImpl,
    briefs,
    envOverrides: { TRACY_RELEASES_GITHUB_TOKEN: 'ghs_test' }
  })
  const owner = await cookieFor('owner@x.y')
  await seedSealedRelease(pool, 'tracy-base/wp7', 'wordpress', '1.0.0')
  const served = await (
    await get('/api/sites/questions?platform=wordpress&quickstart=tracy-base%2Fwp7', owner)
  ).json()
  assert.equal(served.languages, 'one')
  const offered = served.questions.find((x) => x.kind === 'languages').options
  const made = await send('POST', '/api/sites', owner, {
    label: 'one-language',
    platform: 'wordpress',
    quickstart: 'tracy-base/wp7',
    brief: {
      questionnaire: served.set.contentHash,
      answers: { languages: [offered[3], offered[1], offered[2]] }
    }
  })
  assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
  const [started] = briefs.log.started
  assert.deepEqual(started.brief.answers.find((a) => a.id === 'languages').value, [offered[3]])
})

// ── A quickstart nothing seals is refused, however healthy it looks ────────────────────────────
//
// The failure this stops: a release Tracy reads, validates and could install, that no contract
// profile binds. Every screen shows it as ready; provisioning it hands the customer a site the
// Claude Cowork plugin accepts STRUCTURAL writes on. It used to be caught by a `contract` field copied into
// `quickstarts.json` — now it is caught by the absence of a profile, which is the same fact
// without the copy.

test('POST /api/sites: a readable quickstart that no contract seals is refused', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')
  // No contract profile names this release at this version — and none is meant to.
  await seedSealedRelease(pool, 'tracy-base/wp7', 'wordpress', '9.9.9')
  const refused = await send('POST', '/api/sites', owner, {
    label: 'unsealed',
    platform: 'wordpress',
    quickstart: 'tracy-base/wp7'
  })
  assert.equal(refused.status, 400)
  assert.equal((await refused.json()).code, 'UNSUPPORTED_QUICKSTART')
  assert.equal(calls.filter((c) => c.url.endsWith('/_host/provision')).length, 0, 'the fleet was never asked')
})

// ── A quickstart this deployment has no credential for: refused BEFORE the site exists ──────────
//
// `quickstart.py` already refuses an asset-id artifact with no token, but it runs at
// `fetching webroot` — after the name is claimed, the row written, a port taken, a subnet made
// and three directories created. Nothing tears a failed provision down, and the Retry the
// customer is handed re-runs the same unauthenticated fetch, so it cannot ever work.
//
// The pair below is the whole claim: same release, same request, ONLY the credential differs.

/** A release whose parts are fetched by GitHub asset id — the shape that needs a credential. */
async function seedPrivateRelease(pool, tag, platform, version) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({
        name: tag,
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: [
          { name: 'w.tar.gz', id: 4011, size: 40 },
          { name: 'd.sql.gz', id: 4012, size: 20 }
        ]
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform,
        label: tag,
        version,
        cms: platform === 'wordpress' ? '7.1' : '6.1.1',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        }
      })
    ]
  )
}

test(
  'POST /api/sites: a quickstart fetched by asset id is refused when this deployment holds no credential',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    // The base env configures neither the GitHub App nor TRACY_RELEASES_GITHUB_TOKEN.
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    await seedPrivateRelease(pool, 'tracy-base/wp7', 'wordpress', '1.0.0')
    const refused = await send('POST', '/api/sites', owner, {
      label: 'nocred',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7'
    })
    assert.equal(refused.status, 503)
    const body = await refused.json()
    assert.equal(body.code, 'QUICKSTART_UNREACHABLE')
    assert.equal(body.quickstart, 'tracy-base/wp7')
    // 🔒 The reason is the point: it is what `releasesToken` knows and the door used to discard.
    // Without it the screen can only say "it failed", which is the state that produced a Retry
    // nobody could ever make work.
    assert.match(body.reason, /TRACY_RELEASES_GITHUB_TOKEN|GitHub App/)
    assert.equal(
      calls.filter((c) => c.url.endsWith('/_host/provision')).length,
      0,
      'the fleet was never asked'
    )
    // And nothing was created to clean up.
    const { rows } = await pool.query('select site_key from site')
    assert.deepEqual(rows, [], 'no site row may survive a refusal')
  }
)

test(
  'POST /api/sites: the same quickstart provisions, and carries the credential, once one is configured',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, {
      fetchImpl,
      envOverrides: { TRACY_RELEASES_GITHUB_TOKEN: 'ghs_test' }
    })
    const owner = await cookieFor('owner@x.y')
    await seedPrivateRelease(pool, 'tracy-base/wp7', 'wordpress', '1.0.0')
    const made = await send('POST', '/api/sites', owner, {
      label: 'withcred',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7'
    })
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.releasesToken, 'ghs_test')
    // The asset ids the entry was refused for above are the ones the host will fetch by.
    assert.equal(provision.quickstartEntry.webroot.githubAssetId, 4011)
  }
)

// ── A pack not published yet, on a dev stand (`lib/local-releases.js`) ─────────────────────────
//
// The customer road, unchanged: the gallery's "(local)" card is pressed, claimed, then built. The
// pack's files are `file:` addresses, so no credential is asked for — the stand below has none —
// and the published card beside it still builds the published release.
test(
  'POST /api/sites/claim + /api/sites: a local card builds its pack from file: addresses, with no credential; the published card is untouched',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(join(tmpdir(), 'sites-local-'))
    await seedTemplateReleases(pool)
    const at = join(dir, 'tracy-business', 'j6')
    mkdirSync(at, { recursive: true })
    const bytes = { 'w.tar.gz': 'webroot', 'd.sql.gz': 'dump', 'r.zip': 'cowork' }
    for (const [name, body] of Object.entries(bytes)) writeFileSync(join(at, name), body)
    const pin = (name) => ({ file: name, sha256: createHash('sha256').update(bytes[name]).digest('hex') })
    writeFileSync(
      join(at, 'tracy_setting.json'),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label: 'Tracy Business',
        version: '1.1.0',
        cms: '6.1.1',
        install: { webroot: pin('w.tar.gz'), database: pin('d.sql.gz'), cowork: pin('r.zip') },
        template: 'tracy_business',
        card: { template: 'tracy-business', image: 'business-home-1440.png' }
      })
    )
    await syncLocalReleases(pool, dir, { log: {} })

    const { fetchImpl, calls } = fakeNetwork()
    // No App, no TRACY_RELEASES_GITHUB_TOKEN: a published private release would be refused here.
    const { cookieFor, send, get } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')

    const listed = await (await get('/api/templates')).json()
    assert.deepEqual(
      listed.templates.map((t) => [t.id, t.label]),
      [
        ['tracy-business', 'Tracy Business'],
        ['local-tracy-business', 'Tracy Business (local)']
      ]
    )

    const ask = {
      label: 'tdlocal-tb',
      platform: 'joomla',
      design: 'local-tracy-business',
      buildId: '33333333-3333-4333-8333-333333333333'
    }
    const claimed = await send('POST', '/api/sites/claim', owner, ask)
    assert.equal(claimed.status, 201, JSON.stringify(await claimed.clone().json()))
    const built = await send('POST', '/api/sites', owner, ask)
    assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))
    assert.equal((await built.json()).builtFrom, 'local/tracy-business/j6')
    const provision = JSON.parse(calls.find((c) => c.url.endsWith('/_host/provision')).init.body)
    assert.equal(provision.quickstart, 'local/tracy-business/j6')
    assert.equal(provision.quickstartEntry.webroot.url, `file://${join(at, 'w.tar.gz')}`)
    assert.equal(provision.quickstartEntry.webroot.bytes, bytes['w.tar.gz'].length)
    assert.equal(provision.releasesToken, undefined, 'a file: address needs no credential')
    // Sealed as the published tracy-business/j6 1.1.0 is, so the minimum Claude Cowork plugin version travels too; no
    // Claude Cowork plugin pin covers 1.1.0, so the pack's own Claude Cowork plugin is installed, from the pack.
    assert.equal(provision.quickstartEntry.cowork.url, `file://${join(at, 'r.zip')}`)
    assert.equal(typeof provision.quickstartEntry.contract, 'string')
    assert.equal(typeof provision.coworkMinVersion, 'string')

    // The published card still builds the published release.
    const plan = await (
      await get('/api/sites/design-plan?platform=joomla&design=tracy-business', owner)
    ).json()
    assert.equal(plan.plan.baseQuickstart, 'tracy-business/j6')
  }
)

// ── What a site was built FROM survives claim-then-workspace ────────────────────────────────────
//
// `store.js` says those three columns are "written together with the claim so a site that failed
// half way through still says what it was being built from". That held for a create that names its
// quickstart in the same call. On the road customers actually take — claim a draft address, answer
// the questionnaire in the site's own workspace — the claim has no quickstart yet, and by the time
// one is resolved the row exists, so `claimOwnership` used to hand it back untouched and the
// columns stayed null for ever.
//
// Measured 22/09/2026 on three sites built through Design inspiration (`tracy-business` on all
// three CMS): `quickstart_tag` null on every one, while their provision logs read
// `tracy-business/wp7`, `tracy-business/j6` and `tracy-business/emdash-0.x`.

test('POST /api/sites after a claim: the row records the quickstart the press resolved', opts, async () => {
  const { pool } = db
  await seedTemplateReleases(pool)
  const { fetchImpl } = fakeNetwork()
  const { cookieFor, send } = harness(pool, { fetchImpl })
  const owner = await cookieFor('owner@x.y')
  const buildId = '33333333-3333-4333-8333-333333333333'
  const request = { label: 'slate-yard', platform: 'emdash', design: 'tracy-business', buildId }

  const claimed = await send('POST', '/api/sites/claim', owner, request)
  assert.equal(claimed.status, 201, JSON.stringify(await claimed.clone().json()))
  const siteKey = (await claimed.json()).siteKey
  // The claim cannot know: no questionnaire has been answered yet.
  const blank = await pool.query('select quickstart_tag from site where site_key = $1', [siteKey])
  assert.equal(blank.rows[0].quickstart_tag, null, 'a claim names no quickstart, and must not invent one')

  const built = await send('POST', '/api/sites', owner, { ...request, designRevision: 'template' })
  assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))

  // 🔒 The press DID resolve one, and it is the answer the row owed all along.
  const { rows } = await pool.query(
    'select quickstart_tag, quickstart_version from site where site_key = $1',
    [siteKey]
  )
  assert.equal(rows[0].quickstart_tag, 'tracy-business/emdash')
  assert.equal(rows[0].quickstart_version, '1.0.0')
  assert.equal(
    (await pool.query('select count(*)::int as n from site')).rows[0].n,
    1,
    'still one site — filling a blank is not creating a second row'
  )
})

test('setQuickstart fills a blank once and never rewrites it', opts, async () => {
  const { pool } = db
  const siteKey = 'provenance.localhost'
  await createSite(pool, { siteKey, label: 'provenance', host: 'local', platform: 'joomla' })
  const first = await setQuickstart(pool, siteKey, { tag: 'tracy-business/j6', version: '1.0.0' })
  assert.equal(first.quickstart_tag, 'tracy-business/j6')

  // 🔒 The `is null` guard IS the safety: provenance that a later call can overwrite is
  // provenance nobody can trust, and this column is read exactly when one site behaves unlike
  // its siblings.
  const second = await setQuickstart(pool, siteKey, { tag: 'something-else/j6', version: '9.9.9' })
  assert.equal(second, null, 'an already-recorded provenance answers null rather than changing')
  const { rows } = await pool.query(
    'select quickstart_tag, quickstart_version from site where site_key = $1',
    [siteKey]
  )
  assert.deepEqual(rows[0], { quickstart_tag: 'tracy-business/j6', quickstart_version: '1.0.0' })

  assert.equal(await setQuickstart(pool, siteKey, { tag: '' }), null, 'an empty tag is not an answer')
})

test(
  'warm claim records one new site and one ready result, without provisioning or duplicate signals',
  opts,
  async () => {
    const { pool } = db
    const { generationOf, poolKeyOf } = await import('../src/lib/inventory-pool-key.js')
    const { resolveInstall } = await import('../src/lib/quickstart-releases.js')
    await seedTemplateReleases(pool)
    const tag = 'tracy-business/j6'
    const install = await resolveInstall(pool, tag)
    const generation = generationOf({ install })
    const poolKey = poolKeyOf({
      environment: 'local',
      host: 'local',
      platform: 'joomla',
      quickstartTag: tag,
      quickstartVersion: install.version,
      generation
    })
    await pool.query(
      `insert into inventory_pool (pool_key,environment,host,platform,quickstart_tag,quickstart_version,generation,enabled)
    values ($1,'local','local','joomla',$2,$3,$4,true)`,
      [poolKey, tag, install.version, generation]
    )
    await pool.query(
      "insert into site (site_key,label,host,platform,origin,quickstart_tag) values ('stocksignal.localhost','stocksignal','local','joomla','fleet_born',$1)",
      [tag]
    )
    await pool.query(
      `insert into inventory_instance (pool_key,site_key,label,host,generation,state,health_ok,health_checked_at)
    values ($1,'stocksignal.localhost','stocksignal','local',$2,'ready',true,now())`,
      [poolKey, generation]
    )
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const cookie = await cookieFor('warm-owner@example.com')
    const body = { buildId: crypto.randomUUID(), platform: 'joomla', design: 'tracy-business' }
    const first = await send('POST', '/api/sites/claim', cookie, body)
    assert.equal(first.status, 201, JSON.stringify(await first.clone().json()))
    assert.equal((await first.json()).siteKey, 'stocksignal.localhost')
    assert.equal((await send('POST', '/api/sites/claim', cookie, body)).status, 200)
    const events = (
      await pool.query(
        "select kind,data from ops_signal where kind in ('site.create','site.result') order by id"
      )
    ).rows
    assert.equal(events.length, 2)
    assert.equal(events[0].kind, 'site.create')
    assert.equal(events[0].data.source, 'warm')
    assert.equal(events[1].kind, 'site.result')
    assert.equal(events[1].data.outcome, 'done')
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/provision')).length, 0)
  }
)

// ── Chat turns (plan tasks/todo-site-changes.md §5–§6, Q2) ─────────────────────────────────────
// The host dsh's site-tabs plugin opens a turn when the person's message enters it (`POST /turn`)
// and closes it when the turn stops (`POST /moment` with `turnId`). The row is the only place the
// person's name sits beside their words: the commit is authored `Agent`.

const SHA_A = 'a'.repeat(40)
const SHA_D = 'd'.repeat(40)
const SHA_M = 'b'.repeat(40)

/** A door the host dsh calls, signed as `email` from the `lantern` folder. */
function signedDoor(app, config) {
  return (path, body, email = 'owner@x.y', label = 'lantern') =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tracy-actor': assertionFor(email, config.actorSecret),
          'x-tracy-workspace-label': label
        },
        body: JSON.stringify(body)
      })
    )
}

const SEALED = JSON.stringify({
  ok: true,
  head: SHA_A,
  sealed: { sha: SHA_A, files: ['wp-content/plugins/jce/jce.php'] },
  skipped: null,
  outside: [
    {
      sha: SHA_A,
      at: 1_790_000_100,
      title: 'changes made to the site outside Tracy',
      cause: 'seal',
      deployTag: null,
      files: ['wp-content/plugins/jce/jce.php']
    },
    {
      sha: SHA_D,
      at: 1_790_000_000,
      title: 'deploy v2026.10.01 updated tracy-access.php',
      cause: 'deploy',
      deployTag: 'v2026.10.01',
      files: ['wp-content/mu-plugins/tracy-access.php']
    }
  ]
})
const MOMENT = JSON.stringify({
  ok: true,
  committed: true,
  files: 2,
  head: SHA_M,
  sha: SHA_M,
  paths: ['a.css', 'b.php']
})

const turnRow = async (pool, turnId) =>
  (await pool.query('select * from site_turn where turn_id = $1', [turnId])).rows[0] ?? null

test(
  'POST /api/sites/:key/turn: opens the turn as the person who typed, seals the site at its start, and keeps the outside commits',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { byKind: { 'webroot-seal-outside': { state: 'done', output: SEALED } } }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    const res = await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:3',
      title: 'Make the badge say Hello',
      source: 'comment',
      promptMessageId: 'msg-1',
      rpcId: 'rpc-1',
      commentNs: [12, 13]
    })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      ok: true,
      turnId: 'session-a1:3',
      concurrent: false,
      unsealedStart: false,
      undone: [],
      // No earlier turn of this conversation is still having its moment committed (option A).
      momentsPending: []
    })
    const jobs = calls.filter((c) => c.url.endsWith('/_host/site')).map((c) => JSON.parse(c.init.body))
    assert.deepEqual(jobs, [{ kind: 'webroot-seal-outside', turn: 'session-a1:3', label: 'lantern' }])
    const row = await turnRow(pool, 'session-a1:3')
    assert.equal(row.site_key, 'lantern.localhost')
    assert.equal(row.session_id, 'session-a1')
    assert.equal(row.turn, 3)
    assert.equal(row.actor, 'owner@x.y')
    assert.equal(row.title, 'Make the badge say Hello')
    assert.equal(row.source, 'comment')
    assert.equal(row.prompt_message_id, 'msg-1')
    assert.equal(row.rpc_id, 'rpc-1')
    assert.deepEqual(row.comment_ns, [12, 13], 'the comment numbers the host read off the turn')
    assert.equal(row.state, 'open')
    const outside = await pool.query('select sha, files, cause, deploy_tag, at from site_outside order by at')
    assert.deepEqual(
      outside.rows.map((r) => [r.sha, r.files, r.cause, r.deploy_tag, r.at.getTime() / 1000]),
      [
        [SHA_D, 1, 'deploy', 'v2026.10.01', 1_790_000_000],
        [SHA_A, 1, 'seal', null, 1_790_000_100]
      ]
    )

    // The same turn again — a steer, or a retry — merges: no second seal, no second row.
    const again = await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:3',
      title: 'and make it red',
      source: 'panel',
      steered: true
    })
    assert.equal(again.status, 200)
    assert.equal(calls.filter((c) => c.url.endsWith('/_host/site')).length, 1)
    const merged = await turnRow(pool, 'session-a1:3')
    assert.equal(merged.steered, true)
    assert.equal(merged.title, 'Make the badge say Hello', 'the first message names the turn')
  }
)

test(
  'POST /api/sites/:key/turn/undone: the turns undone since the last turn opened, at once — no row, no host job (16/10/2026)',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({
      siteJob: { byKind: { 'webroot-seal-outside': { state: 'done', output: SEALED } } }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    assert.equal(
      (await door('/api/sites/_conversation/turn', { turnId: 'session-u9:1', title: 'Make it blue' })).status,
      200
    )
    await markTurnsUndone(pool, 'lantern.localhost', [
      { turnId: 'session-u9:1', complete: true, proven: true }
    ])
    const jobsBefore = calls.filter((c) => c.url.endsWith('/_host/site')).length
    const res = await door('/api/sites/_conversation/turn/undone', { turnId: 'session-u9:2' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      ok: true,
      undone: [{ turn: 1, title: 'Make it blue', complete: true }]
    })
    assert.equal(
      calls.filter((c) => c.url.endsWith('/_host/site')).length,
      jobsBefore,
      'no seal, no host job'
    )
    assert.equal(await turnRow(pool, 'session-u9:2'), null, 'the turn is not opened by this read')
    // A first turn names nothing; a turn id that is not one is refused.
    assert.deepEqual(
      await (await door('/api/sites/_conversation/turn/undone', { turnId: 'session-u8:1' })).json(),
      {
        ok: true,
        undone: []
      }
    )
    assert.equal((await door('/api/sites/_conversation/turn/undone', { turnId: 'nope' })).status, 400)
  }
)

// #1403 item 13: the thumbs under Tracy's answer lived only in the conversation's log.
test(
  "POST /api/sites/:key/turn/rating: a Good or Bad kept beside the turn, taken back by null; nothing but this site's turns",
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({
      siteJob: { byKind: { 'webroot-seal-outside': { state: 'done', output: SEALED } } }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    assert.equal(
      (await door('/api/sites/_conversation/turn', { turnId: 'session-r5:1', title: 'Make it blue' })).status,
      200
    )
    const rated = await door('/api/sites/_conversation/turn/rating', {
      turnId: 'session-r5:1',
      rating: 'negative',
      categories: ['task-result']
    })
    assert.equal(rated.status, 200)
    assert.deepEqual(await rated.json(), { ok: true })
    const row = async () =>
      (
        await pool.query('select rating, rating_categories, rated_at from site_turn where turn_id = $1', [
          'session-r5:1'
        ])
      ).rows[0]
    const kept = await row()
    assert.equal(kept.rating, 'negative')
    assert.deepEqual(kept.rating_categories, ['task-result'])
    assert.ok(kept.rated_at instanceof Date)
    // Taken back.
    assert.equal(
      (await door('/api/sites/_conversation/turn/rating', { turnId: 'session-r5:1', rating: null })).status,
      200
    )
    assert.deepEqual(await row(), { rating: null, rating_categories: null, rated_at: null })
    // Refusals: a turn this site does not hold, a rating or a category that is not one.
    assert.equal(
      (await door('/api/sites/_conversation/turn/rating', { turnId: 'session-r5:9', rating: 'positive' }))
        .status,
      404
    )
    assert.equal(
      (await door('/api/sites/_conversation/turn/rating', { turnId: 'session-r5:1', rating: 'meh' })).status,
      400
    )
    assert.equal(
      (
        await door('/api/sites/_conversation/turn/rating', {
          turnId: 'session-r5:1',
          rating: 'positive',
          categories: ['<b>']
        })
      ).status,
      400
    )
    assert.equal(
      (await door('/api/sites/_conversation/turn/rating', { turnId: 'nope', rating: null })).status,
      400
    )
  }
)

test(
  'POST /api/sites/:key/turn: a title the host cut at its own cap is stored truncated when the host says so (QA-A11)',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({
      siteJob: { byKind: { 'webroot-seal-outside': { state: 'done', output: SEALED } } }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    // What the host sends for 4114 typed characters: within 4000, ending in its own "…".
    const cut = `${'SCV2-filler '.repeat(332).trim()}…`
    assert.ok(cut.length <= 4000)
    const res = await door('/api/sites/_conversation/turn', {
      turnId: 'session-a11:1',
      title: cut,
      source: 'panel',
      requestState: 'truncated'
    })
    assert.equal(res.status, 200)
    const row = await turnRow(pool, 'session-a11:1')
    assert.equal(row.request_state, 'truncated')
    assert.equal(row.title, cut, 'the title is kept as sent: one "…", none added')
    // No word from the host (an older dsh): a title within the cap that ends in "…" is the door's
    // own reading, as before.
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-a11:2',
      title: 'Short request',
      source: 'panel'
    })
    assert.equal((await turnRow(pool, 'session-a11:2')).request_state, 'full')
    // Any other value is not a claim the door takes.
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-a11:3',
      title: 'Short again',
      source: 'panel',
      requestState: 'full-ish'
    })
    assert.equal((await turnRow(pool, 'session-a11:3')).request_state, 'full')
  }
)

test(
  'POST /api/sites/:key/turn: a seal that fails leaves the turn open and says unsealedStart; a bad turn id or a stranger is refused',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({
      siteJob: { byKind: { 'webroot-seal-outside': { state: 'failed', output: 'boom' } } }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    const res = await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:1',
      title: 'Hi',
      source: 'panel'
    })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).unsealedStart, true)
    assert.equal((await turnRow(pool, 'session-a1:1')).unsealed_start, true)

    for (const turnId of ['session a:1', 'session-a1', '../x:1', 42]) {
      const bad = await door('/api/sites/_conversation/turn', { turnId, title: 'Hi', source: 'panel' })
      assert.equal(bad.status, 400, String(turnId))
    }
    // Comment numbers that are not small positive integers are dropped, never stored as given.
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:9',
      title: 'Odd numbers',
      source: 'comment',
      commentNs: ['7', -1, 1.5]
    })
    assert.equal((await turnRow(pool, 'session-a1:9')).comment_ns, null)
    const noTitle = await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:2',
      title: ' ',
      source: 'panel'
    })
    assert.equal(noTitle.status, 400)
    const stranger = await door(
      '/api/sites/_conversation/turn',
      { turnId: 'session-z:1', title: 'Hi', source: 'panel' },
      'outsider@x.y'
    )
    assert.equal(stranger.status, 403)
    assert.equal(await turnRow(pool, 'session-z:1'), null)
  }
)

test(
  'POST /api/sites/:key/turn: two conversations open at once are both concurrent; a turn left open 30 minutes reads stale',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({
      siteJob: { byKind: { 'webroot-seal-outside': { state: 'done', output: SEALED } } }
    })
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    await seatRow(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    const door = signedDoor(app, config)
    await pool.query(
      `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, opened_at)
       values ('session-old:1', 'lantern.localhost', 'session-old', 1, 'owner@x.y', 'Long gone', now() - interval '31 minutes')`
    )
    await door('/api/sites/_conversation/turn', { turnId: 'session-a1:1', title: 'One', source: 'panel' })
    const second = await door(
      '/api/sites/_conversation/turn',
      { turnId: 'session-b2:1', title: 'Two', source: 'panel' },
      'editor@x.y'
    )
    assert.equal((await second.json()).concurrent, true)
    assert.equal((await turnRow(pool, 'session-a1:1')).concurrent, true)
    assert.equal((await turnRow(pool, 'session-b2:1')).concurrent, true)
    assert.equal((await turnRow(pool, 'session-b2:1')).actor, 'editor@x.y')
    const old = await turnRow(pool, 'session-old:1')
    assert.equal(old.state, 'stale')
    assert.equal(old.concurrent, false, 'a stale turn is nobody to share a tree with')
  }
)

test(
  'POST /api/sites/:key/moment with turnId: the moment carries the turn, closes its row, and a retry keeps what the first recorded',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork({
      siteJob: {
        byKind: {
          'webroot-seal-outside': { state: 'done', output: SEALED },
          'webroot-moment': { state: 'done', output: MOMENT }
        }
      }
    })
    const { app, config } = harness(pool, {
      fetchImpl: net.fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:4',
      title: 'Fix the footer',
      source: 'panel'
    })
    const res = await door('/api/sites/_conversation/moment', {
      title: 'Fix the footer',
      turnId: 'session-a1:4'
    })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, committed: true, files: 2, head: SHA_M })
    const jobs = net.calls.filter((c) => c.url.endsWith('/_host/site')).map((c) => JSON.parse(c.init.body))
    assert.deepEqual(jobs.at(-1), {
      kind: 'webroot-moment',
      title: 'Fix the footer',
      turn: 'session-a1:4',
      label: 'lantern'
    })
    const row = await turnRow(pool, 'session-a1:4')
    assert.equal(row.state, 'closed')
    assert.equal(row.head_sha, SHA_M)
    assert.equal(row.files, 2)
    assert.ok(row.closed_at instanceof Date)
    const audit = await pool.query("select detail from audit where action = 'site.moment'")
    assert.equal(audit.rows[0].detail.turnId, 'session-a1:4')

    // The answer to the close was lost; the retry finds nothing dirty.
    const { app: app2 } = harness(pool, {
      fetchImpl: fakeNetwork({
        siteJob: {
          byKind: {
            'webroot-moment': {
              state: 'done',
              output: JSON.stringify({
                ok: true,
                committed: false,
                files: 0,
                head: SHA_M,
                sha: null,
                paths: []
              })
            }
          }
        }
      }).fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    assert.equal(
      (
        await signedDoor(app2, config)('/api/sites/_conversation/moment', {
          title: 'Fix the footer',
          turnId: 'session-a1:4'
        })
      ).status,
      200
    )
    const kept = await turnRow(pool, 'session-a1:4')
    assert.equal(kept.head_sha, SHA_M)
    assert.equal(kept.files, 2)

    // An older dsh sends no turnId: the moment runs as before and no turn row moves.
    const legacy = await door('/api/sites/_conversation/moment', { title: 'Old dsh' })
    assert.equal(legacy.status, 200)
    assert.equal(
      JSON.parse(net.calls.filter((c) => c.url.endsWith('/_host/site')).at(-1).init.body).turn,
      undefined
    )
    const bad = await door('/api/sites/_conversation/moment', { title: 'x', turnId: 'nope' })
    assert.equal(bad.status, 400)
  }
)

// A demo stayed on "Building…" for hours: its agent ended with an error and its moment never closed the turn.
test(
  'POST /api/sites/:key/moment: a moment job that fails, or that the host refuses, still closes the turn with how it ended',
  opts,
  async () => {
    const { pool } = db
    const failing = fakeNetwork({
      siteJob: {
        byKind: {
          'webroot-seal-outside': { state: 'done', output: SEALED },
          'webroot-moment': { state: 'failed', output: 'webroot-git: no webroot yet' }
        }
      }
    })
    const { app, config } = harness(pool, {
      fetchImpl: failing.fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-e1:1',
      title: 'Build it',
      source: 'panel'
    })
    const failed = await door('/api/sites/_conversation/moment', {
      title: 'Build it',
      turnId: 'session-e1:1',
      endReason: 'error'
    })
    assert.equal(failed.status, 502)
    const row = await turnRow(pool, 'session-e1:1')
    assert.deepEqual([row.state, row.end_reason, row.head_sha, row.files], ['closed', 'error', null, 0])

    const refusing = fakeNetwork({
      siteJob: {
        byKind: { 'webroot-seal-outside': { state: 'done', output: SEALED } },
        refuse: ['webroot-moment']
      }
    })
    const { app: app2 } = harness(pool, {
      fetchImpl: refusing.fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    const door2 = signedDoor(app2, config)
    await door2('/api/sites/_conversation/turn', {
      turnId: 'session-e2:1',
      title: 'Build it',
      source: 'panel'
    })
    const refused = await door2('/api/sites/_conversation/moment', {
      title: 'Build it',
      turnId: 'session-e2:1',
      endReason: 'blocked'
    })
    assert.equal(refused.status, 502)
    assert.equal((await refused.json()).code, 'FLEET_JOB_FAILED')
    const kept = await turnRow(pool, 'session-e2:1')
    assert.deepEqual([kept.state, kept.end_reason, kept.head_sha, kept.files], ['closed', 'blocked', null, 0])
    assert.equal((await pool.query("select 1 from audit where action = 'site.moment'")).rows.length, 0)
  }
)

// Plan `tasks/todo-open-conversation.md` §C: the close carries Tracy's answer; the door checks it
// before any work, cuts it again itself, and a close without one keeps what was recorded.
test(
  'POST /api/sites/:key/moment with reply: checked before the job, cut by the door, kept across a retry',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork({
      siteJob: {
        byKind: {
          'webroot-seal-outside': { state: 'done', output: SEALED },
          'webroot-moment': { state: 'done', output: MOMENT }
        }
      }
    })
    const { app, config } = harness(pool, {
      fetchImpl: net.fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-a1:6',
      title: 'Rename About',
      source: 'panel'
    })
    const jobs = () => net.calls.filter((c) => c.url.endsWith('/_host/site')).length

    const before = jobs()
    for (const body of [
      { title: 'x', reply: 'no turn', replyState: 'full' },
      { title: 'x', turnId: 'session-a1:6', reply: 42, replyState: 'full' },
      { title: 'x', turnId: 'session-a1:6', reply: 'no state' },
      { title: 'x', turnId: 'session-a1:6', reply: 'odd state', replyState: 'done' },
      { title: 'x', turnId: 'session-a1:6', replyState: 'full' },
      { title: 'x', turnId: 'session-a1:6', reply: 'x'.repeat(64 * 1024 + 1), replyState: 'full' }
    ]) {
      const res = await door('/api/sites/_conversation/moment', body)
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80))
      assert.equal((await res.json()).code, 'INVALID_REPLY')
    }
    assert.equal(jobs(), before, 'a refused reply runs no job')

    // The host says `full` but sent 3000 characters: the door cuts and says `truncated`.
    const long = 'word '.repeat(600)
    const res = await door('/api/sites/_conversation/moment', {
      title: 'Rename About',
      turnId: 'session-a1:6',
      reply: long,
      replyState: 'full'
    })
    assert.equal(res.status, 200)
    const row = await turnRow(pool, 'session-a1:6')
    assert.equal(row.reply_state, 'truncated')
    assert.ok([...row.reply].length <= 2000 && row.reply.endsWith('word…'))

    // A retried close with no reply keeps the answer recorded.
    await door('/api/sites/_conversation/moment', { title: 'Rename About', turnId: 'session-a1:6' })
    assert.equal((await turnRow(pool, 'session-a1:6')).reply, row.reply)
    // A short answer is kept as sent, with the host's state.
    await door('/api/sites/_conversation/turn', { turnId: 'session-a1:7', title: 'Stop it', source: 'panel' })
    await door('/api/sites/_conversation/moment', {
      title: 'Stop it',
      turnId: 'session-a1:7',
      reply: 'I was changing <b>the</b>',
      replyState: 'interrupted'
    })
    const seven = await turnRow(pool, 'session-a1:7')
    assert.deepEqual([seven.reply, seven.reply_state], ['I was changing <b>the</b>', 'interrupted'])
  }
)

// Plan `tasks/todo-do-dung-that.md` U1–U2: what a turn took and whether its change was seen, kept with it.
test(
  'POST /moment with work and POST /turn/check: checked before anything runs, kept on the turn; another site’s turn is 404',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork({
      siteJob: {
        byKind: {
          'webroot-seal-outside': { state: 'done', output: SEALED },
          'webroot-moment': { state: 'done', output: MOMENT }
        }
      }
    })
    const { app, config } = harness(pool, {
      fetchImpl: net.fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-w1:1',
      title: 'Make it blue',
      source: 'panel'
    })
    const jobs = () => net.calls.filter((c) => c.url.endsWith('/_host/site')).length

    const before = jobs()
    for (const work of [{ steps: 1 }, { steps: 1, calls: 1, failedCalls: 2 }, 'many']) {
      const res = await door('/api/sites/_conversation/moment', { title: 'x', turnId: 'session-w1:1', work })
      assert.equal(res.status, 400)
      assert.equal((await res.json()).code, 'INVALID_WORK')
    }
    assert.equal(jobs(), before, 'a refused work runs no job')

    const res = await door('/api/sites/_conversation/moment', {
      title: 'Make it blue',
      turnId: 'session-w1:1',
      work: { steps: 4, calls: 6, failedCalls: 1 }
    })
    assert.equal(res.status, 200)
    const row = await turnRow(pool, 'session-w1:1')
    assert.deepEqual([row.steps, row.calls, row.failed_calls], [4, 6, 1])

    const check = (body) => door('/api/sites/_conversation/turn/check', body)
    assert.equal((await check({ turnId: 'session-w1:1', visual: 'shown' })).status, 200)
    assert.equal((await turnRow(pool, 'session-w1:1')).visual, 'shown')
    assert.equal(
      (await check({ turnId: 'session-w1:1', visual: 'skipped', note: 'no-image-model' })).status,
      200
    )
    const skipped = await turnRow(pool, 'session-w1:1')
    assert.deepEqual([skipped.visual, skipped.visual_note], ['skipped', 'no-image-model'])
    for (const [body, code] of [
      [{ turnId: 'nope', visual: 'shown' }, 'INVALID_TURN'],
      [{ turnId: 'session-w1:1', visual: 'maybe' }, 'INVALID_VISUAL'],
      [{ turnId: 'session-w1:1', visual: 'skipped', note: 'judge-failed: model x' }, 'INVALID_NOTE']
    ]) {
      const refused = await check(body)
      assert.equal(refused.status, 400)
      assert.equal((await refused.json()).code, code)
    }
    const unknown = await check({ turnId: 'session-w1:9', visual: 'shown' })
    assert.equal(unknown.status, 404)
    assert.equal((await unknown.json()).code, 'TURN_UNKNOWN')
  }
)

test(
  'a long prompt: the turn keeps every word typed; the Git moment is cut at a word boundary within 200 characters and ends with "…"',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork({
      siteJob: {
        byKind: {
          'webroot-seal-outside': { state: 'done', output: SEALED },
          'webroot-moment': { state: 'done', output: MOMENT }
        }
      }
    })
    const { app, config } = harness(pool, {
      fetchImpl: net.fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    // 33 words of 6–7 characters: 228 characters, so a cut at exactly 200 would land mid-word.
    const words = Array.from({ length: 33 }, (_, i) => `word${String(i).padStart(2, '0')}`).join(' ')
    assert.ok(words.length > 200)
    await door('/api/sites/_conversation/turn', { turnId: 'session-a1:5', title: words, source: 'panel' })
    assert.equal((await turnRow(pool, 'session-a1:5')).title, words, 'the turn row keeps the whole prompt')

    await door('/api/sites/_conversation/moment', { title: words, turnId: 'session-a1:5' })
    const job = JSON.parse(net.calls.filter((c) => c.url.endsWith('/_host/site')).at(-1).init.body)
    assert.equal(job.kind, 'webroot-moment')
    assert.ok(job.title.length <= 200, `${job.title.length} characters`)
    assert.ok(job.title.endsWith('…'), job.title)
    const kept = job.title.slice(0, -1)
    assert.ok(words.startsWith(`${kept} `), 'cut between two words, never inside one')

    // A short title passes as typed, no ellipsis.
    await door('/api/sites/_conversation/moment', { title: 'Fix the footer' })
    assert.equal(
      JSON.parse(net.calls.filter((c) => c.url.endsWith('/_host/site')).at(-1).init.body).title,
      'Fix the footer'
    )
  }
)

// ── A turn's job that outlives the door's wait (ledger L31, measured 05/10/2026) ───────────────
// On the local stand the host needed a median 89 s for a moment and 44 s for a seal (one site's
// webroot jobs wait for each other); the doors waited 45 s and 15 s, then forgot the job. The turn
// read `stale` although the host had committed its files. What the door does with a finished job —
// close the turn with the sha and audit it, keep the outside commits a seal made — must still happen
// once the host ends the job: exactly once, and never from an answer the host did not give.

const SHA_N = 'e'.repeat(40)
const MOMENT_N = JSON.stringify({
  ok: true,
  committed: true,
  files: 1,
  head: SHA_N,
  sha: SHA_N,
  paths: ['c.css']
})

/**
 * A fake host for one site's turn jobs. Each job gets its own id, `<kind>-<n>` (the n-th job of that
 * kind), and answers what `answers[id]` or else `answers[kind]` says WHEN it is polled — so a test
 * can end a job after the door stopped waiting for it. While `clock.holding` is set, every poll of a
 * job still running moves `clock.skew` past any door's wait: the door gives up after one real poll.
 * `filed` lists every job asked for, with its body.
 *
 * `slow` (while holding): `post` ms added to `clock.skew` by the job's POST — the door's wait spent
 * before it polls; `hang`, a pattern of job ids whose poll answers nothing until the call is cut (or
 * 2 s, then `running`), as a host that stops answering mid-job.
 */
function turnHost(answers, clock, slow = {}) {
  const counts = new Map()
  /** @type {Record<string, any>[]} */
  const filed = []
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    if (u.pathname === '/_host/site') {
      const body = JSON.parse(init.body)
      counts.set(body.kind, (counts.get(body.kind) ?? 0) + 1)
      const id = `${body.kind}-${counts.get(body.kind)}`
      filed.push({ id, ...body })
      if (clock.holding && slow.post) clock.skew += slow.post
      return new Response(JSON.stringify({ jobId: id }), { status: 200 })
    }
    const id = u.pathname.match(/^\/_host\/jobs\/(.+)$/)?.[1]
    if (!id) return new Response(null, { status: 404 })
    if (clock.holding && slow.hang?.test(id))
      return new Promise((resolve, reject) => {
        const late = setTimeout(
          () => resolve(new Response(JSON.stringify({ state: 'running' }), { status: 200 })),
          2_000
        )
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(late)
          reject(init.signal.reason)
        })
      })
    const kind = id.replace(/-\d+$/, '')
    const answer = answers[id] ?? answers[kind] ?? { state: 'done', output: '{"ok":true}' }
    if (clock.holding && answer.state === 'running') clock.skew += 50_000
    return new Response(JSON.stringify(answer), { status: 200 })
  }
  return { fetchImpl, filed }
}

/** A harness whose clock a test can push past a door's wait; the door helpers sign as the owner. */
async function lateHarness(pool, answers, slow = {}) {
  const clock = { skew: 0, holding: false }
  const host = turnHost(answers, clock, slow)
  const { app, config } = harness(pool, {
    fetchImpl: host.fetchImpl,
    now: () => realNow() + clock.skew,
    envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
  })
  await ownedSite(pool)
  const signed = signedDoor(app, config)
  /** One door call during which a job still running outlives the door's wait. */
  const held = async (path, body) => {
    clock.holding = true
    try {
      return await signed(path, body)
    } finally {
      clock.holding = false
      clock.skew = 0
    }
  }
  // The follow-up sweep the cron runs, as it would run `ahead` ms from now.
  const sweep = async (ahead = 0) => {
    const { settleDoorFollowUps } = await import('../src/cron.js')
    return settleDoorFollowUps(pool, config, { fetchImpl: host.fetchImpl, now: () => realNow() + ahead })
  }
  /** The moment jobs the host was asked for, in order. */
  const moments = () => host.filed.filter((job) => job.kind === 'webroot-moment')
  return { door: signed, held, sweep, moments }
}

const momentAudits = async (pool) =>
  (await pool.query("select detail from audit where action = 'site.moment' order by id")).rows.map(
    (r) => r.detail
  )

test(
  'L31: a moment the host ends after the door stopped waiting still closes its turn with the sha, the answer and one audit line',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside': { state: 'done', output: SEALED },
      'webroot-moment': { state: 'running' }
    }
    const { door, held, sweep } = await lateHarness(pool, answers)
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-l31:1',
      title: 'Fix the footer',
      source: 'panel'
    })

    const res = await held('/api/sites/_conversation/moment', {
      title: 'Fix the footer',
      turnId: 'session-l31:1',
      reply: 'The footer is fixed.',
      replyState: 'full',
      endReason: 'completed'
    })
    // Not a failure: the host is still working, and the dsh must not send the close again.
    assert.equal(res.status, 202)
    assert.equal((await res.json()).code, 'FLEET_JOB_PENDING')
    const open = await turnRow(pool, 'session-l31:1')
    assert.equal(open.state, 'open', 'nothing the host did not say is written on the turn')
    assert.equal(open.head_sha, null)
    assert.deepEqual(await momentAudits(pool), [])

    // The host is still at it: the sweep writes nothing.
    await sweep()
    assert.equal((await turnRow(pool, 'session-l31:1')).state, 'open')

    // The host commits: the next sweep does what the door would have done.
    const endedAt = realNow() - 5 * 60_000
    answers['webroot-moment'] = { state: 'done', output: MOMENT, updatedAt: endedAt }
    await sweep(60_000)
    const closed = await turnRow(pool, 'session-l31:1')
    assert.equal(closed.state, 'closed')
    assert.equal(closed.closed_at.getTime(), endedAt, 'closed when the host ended the job, not when heard')
    assert.equal(closed.head_sha, SHA_M)
    assert.equal(closed.files, 2)
    assert.equal(closed.reply, 'The footer is fixed.')
    assert.equal(closed.end_reason, 'completed')
    assert.deepEqual(await momentAudits(pool), [
      { title: 'Fix the footer', committed: true, head: SHA_M, turnId: 'session-l31:1' }
    ])

    // Never twice.
    await sweep(10 * 60_000)
    assert.equal((await turnRow(pool, 'session-l31:1')).files, 2)
    assert.equal((await momentAudits(pool)).length, 1)
  }
)

test(
  'L31: a moment the host fails after the door stopped waiting closes its turn with no moment; one the host never ends is given up after its bound, the same way',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside': { state: 'done', output: SEALED },
      'webroot-moment': { state: 'running' }
    }
    const { door, held, sweep, moments } = await lateHarness(pool, answers)
    await door('/api/sites/_conversation/turn', { turnId: 'session-l31:2', title: 'One', source: 'panel' })
    assert.equal(
      (await held('/api/sites/_conversation/moment', { title: 'One', turnId: 'session-l31:2' })).status,
      202
    )
    // A failure that is not about a busy site is not tried again.
    answers['webroot-moment-1'] = {
      state: 'failed',
      output: 'webroot repo not built yet: run webroot-ensure first'
    }
    await sweep(60_000)
    await sweep(120_000)
    // The agent stopped all the same: the turn closes, with no commit the host did not make.
    const failed = await turnRow(pool, 'session-l31:2')
    assert.deepEqual(
      [failed.state, failed.head_sha, failed.files],
      ['closed', null, 0],
      'a failed job is no moment'
    )
    assert.deepEqual(await momentAudits(pool), [])
    assert.equal(moments().length, 1, 'no second job')

    await door('/api/sites/_conversation/turn', { turnId: 'session-l31:3', title: 'Two', source: 'panel' })
    assert.equal(
      (await held('/api/sites/_conversation/moment', { title: 'Two', turnId: 'session-l31:3' })).status,
      202
    )
    // A day later the host has still not ended it: the follow-up is dropped and the turn closed with no moment.
    await sweep(25 * 60 * 60_000)
    answers['webroot-moment-2'] = { state: 'done', output: MOMENT }
    await sweep(26 * 60 * 60_000)
    const expired = await turnRow(pool, 'session-l31:3')
    assert.deepEqual([expired.state, expired.head_sha, expired.files], ['closed', null, 0])
    assert.deepEqual(await momentAudits(pool), [])
  }
)

test(
  'L31: a late moment of a turn that stopped twice adds its files but never writes over the newer close',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside': { state: 'done', output: SEALED },
      'webroot-moment-1': { state: 'running' },
      'webroot-moment-2': { state: 'done', output: MOMENT_N }
    }
    const { door, held, sweep } = await lateHarness(pool, answers)
    await door('/api/sites/_conversation/turn', {
      turnId: 'session-l31:4',
      title: 'Steered',
      source: 'panel'
    })
    const first = await held('/api/sites/_conversation/moment', {
      title: 'Steered',
      turnId: 'session-l31:4',
      reply: 'first answer',
      replyState: 'full'
    })
    assert.equal(first.status, 202)
    const second = await door('/api/sites/_conversation/moment', {
      title: 'Steered',
      turnId: 'session-l31:4',
      reply: 'second answer',
      replyState: 'full'
    })
    assert.equal(second.status, 200)
    assert.equal((await turnRow(pool, 'session-l31:4')).head_sha, SHA_N)

    // The first stop's job had committed first; tracy-web hears of it only now.
    answers['webroot-moment-1'] = { state: 'done', output: MOMENT }
    await sweep(60_000)
    const row = await turnRow(pool, 'session-l31:4')
    assert.equal(row.files, 3, 'both moments count')
    assert.equal(row.head_sha, SHA_N, 'the later stop keeps the head')
    assert.equal(row.reply, 'second answer', 'and its answer')
    assert.equal((await momentAudits(pool)).length, 2)
  }
)

test(
  'L31: a seal the host ends after the door stopped waiting keeps its outside commits; the turn still says it started unsealed',
  opts,
  async () => {
    const { pool } = db
    const answers = { 'webroot-seal-outside': { state: 'running' } }
    const { held, sweep } = await lateHarness(pool, answers)
    const res = await held('/api/sites/_conversation/turn', {
      turnId: 'session-l31:5',
      title: 'Make it blue',
      source: 'panel'
    })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).unsealedStart, true)
    assert.equal((await pool.query('select 1 from site_outside')).rows.length, 0)

    answers['webroot-seal-outside'] = { state: 'done', output: SEALED }
    await sweep(60_000)
    const outside = await pool.query('select sha, cause from site_outside order by at')
    assert.deepEqual(
      outside.rows.map((r) => [r.sha, r.cause]),
      [
        [SHA_D, 'deploy'],
        [SHA_A, 'seal']
      ]
    )
    // The agent was let go before the seal ended: what it wrote first may sit in that seal, and what
    // was dirty before the turn is not proven out of its moment. The flag stays.
    assert.equal((await turnRow(pool, 'session-l31:5')).unsealed_start, true)
    await sweep(10 * 60_000)
    assert.equal((await pool.query('select 1 from site_outside')).rows.length, 2)
  }
)

test(
  'L31: the follow-up is filed with the job, before the door waits — a tracy-web restart mid-wait loses nothing',
  opts,
  async () => {
    const { pool } = db
    /** @type {any[]} */
    let owedWhileWaiting = []
    const answers = {
      'webroot-seal-outside': { state: 'done', output: SEALED },
      'webroot-moment': { state: 'done', output: MOMENT }
    }
    const host = turnHost(answers, { skew: 0, holding: false })
    const fetchImpl = async (input, init) => {
      if (String(input).includes('/_host/jobs/webroot-moment-'))
        owedWhileWaiting = (
          await pool
            .query(
              'select f.door, f.turn_id, j.id as job from site_job_follow_up f join job j on j.id = f.job_id'
            )
            .catch(() => ({ rows: [] }))
        ).rows
      return host.fetchImpl(input, init)
    }
    const { app, config } = harness(pool, {
      fetchImpl,
      now: realNow,
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'turn-actor-test-key' }
    })
    await ownedSite(pool)
    const door = signedDoor(app, config)
    await door('/api/sites/_conversation/turn', { turnId: 'session-l31:6', title: 'Hi', source: 'panel' })
    assert.equal(
      (await door('/api/sites/_conversation/moment', { title: 'Hi', turnId: 'session-l31:6' })).status,
      200
    )
    assert.deepEqual(owedWhileWaiting, [
      { door: 'moment', turn_id: 'session-l31:6', job: 'webroot-moment-1' }
    ])
    assert.equal(
      (await pool.query('select 1 from site_job_follow_up')).rows.length,
      0,
      'done, so owed no more'
    )
  }
)

test(
  'L31: a moment that fails late because the site was busy is asked for once more, and that one closes the turn',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside': { state: 'done', output: SEALED },
      'webroot-moment': { state: 'running' }
    }
    const { door, held, sweep, moments } = await lateHarness(pool, answers)
    await door('/api/sites/_conversation/turn', { turnId: 'session-l31:7', title: 'Busy', source: 'panel' })
    const res = await held('/api/sites/_conversation/moment', {
      title: 'Busy',
      turnId: 'session-l31:7',
      reply: 'Done.',
      replyState: 'full'
    })
    assert.equal(res.status, 202)
    // The dsh took the 202 as recorded and will not send the close again; the host then gave up on
    // the site's lock (`webroot-git.sh` `locked`, 120 s).
    answers['webroot-moment-1'] = {
      state: 'failed',
      output: 'another webroot job holds this site; try again shortly'
    }
    await sweep(60_000)
    assert.deepEqual(
      moments().map(({ id, kind, title, turn, label }) => ({ id, kind, title, turn, label })),
      [
        {
          id: 'webroot-moment-1',
          kind: 'webroot-moment',
          title: 'Busy',
          turn: 'session-l31:7',
          label: 'lantern'
        },
        {
          id: 'webroot-moment-2',
          kind: 'webroot-moment',
          title: 'Busy',
          turn: 'session-l31:7',
          label: 'lantern'
        }
      ]
    )
    assert.equal((await turnRow(pool, 'session-l31:7')).state, 'open')

    answers['webroot-moment-2'] = { state: 'done', output: MOMENT }
    await sweep(120_000)
    const row = await turnRow(pool, 'session-l31:7')
    assert.equal(row.state, 'closed')
    assert.equal(row.head_sha, SHA_M)
    assert.equal(row.reply, 'Done.')
    assert.equal((await momentAudits(pool)).length, 1)
    await sweep(10 * 60_000)
    assert.equal(moments().length, 2, 'exactly one more job')
  }
)

test(
  'L31: a site that stays busy gets at most two more moment jobs, then the turn closes with no moment',
  opts,
  async () => {
    const { pool } = db
    const busy = {
      state: 'failed',
      output: "fatal: Unable to create '/x/webroot-baseline.git/index.lock': File exists."
    }
    const answers = {
      'webroot-seal-outside': { state: 'done', output: SEALED },
      'webroot-moment': { state: 'running' }
    }
    const { door, held, sweep, moments } = await lateHarness(pool, answers)
    await door('/api/sites/_conversation/turn', { turnId: 'session-l31:8', title: 'Busy', source: 'panel' })
    assert.equal(
      (await held('/api/sites/_conversation/moment', { title: 'Busy', turnId: 'session-l31:8' })).status,
      202
    )
    answers['webroot-moment'] = busy
    for (let minute = 1; minute <= 6; minute++) await sweep(minute * 60_000)
    assert.equal(moments().length, 3, 'the first job and two more')
    const busyTurn = await turnRow(pool, 'session-l31:8')
    assert.deepEqual([busyTurn.state, busyTurn.head_sha, busyTurn.files], ['closed', null, 0])
    assert.equal((await pool.query('select 1 from site_job_follow_up')).rows.length, 0, 'nothing owed')
  }
)

test(
  'L31: the moment door answers within its wait even when the host stops answering mid-job',
  opts,
  async () => {
    const { pool } = db
    const answers = { 'webroot-seal-outside': { state: 'done', output: SEALED } }
    // The POST spends 9.8 s of the door's 10; the polls then hang.
    const { door, held } = await lateHarness(pool, answers, { post: 9_800, hang: /^webroot-moment-/ })
    await door('/api/sites/_conversation/turn', { turnId: 'session-l31:9', title: 'Slow', source: 'panel' })
    const started = performance.now()
    const res = await held('/api/sites/_conversation/moment', { title: 'Slow', turnId: 'session-l31:9' })
    const took = performance.now() - started
    assert.equal(res.status, 202)
    assert.ok(took < 1_500, `answered after ${Math.round(took)} ms of real time, not when the poll gave up`)
  }
)

test(
  "L31: a seal that ends after 12 s of the door's wait counts as late — the dsh has let the agent go by then",
  opts,
  async () => {
    const { pool } = db
    const answers = { 'webroot-seal-outside': { state: 'done', output: SEALED } }
    // The door's 12 s run out before its first poll, though the host would have said done.
    const { held, sweep } = await lateHarness(pool, answers, { post: 12_500 })
    const res = await held('/api/sites/_conversation/turn', {
      turnId: 'session-l31:10',
      title: 'Late seal',
      source: 'panel'
    })
    assert.equal((await res.json()).unsealedStart, true)
    await sweep(60_000)
    assert.equal((await pool.query('select 1 from site_outside')).rows.length, 2, 'its commits are kept')
    assert.equal((await turnRow(pool, 'session-l31:10')).unsealed_start, true)
  }
)

// A seal that ends late but proves the turn's start (09/10/2026, dskeepjo T4b): the Joomla seal took
// 15.3 s, sealed nothing, and nothing else ran on the site meanwhile — yet the turn kept the door's
// `unsealed_start`, and its Undo was refused as "mixed with another request". The host's job records
// carry their own times (`createdAt`/`updatedAt`, epoch ms), which the sweep keeps on the job row.
const NOTHING_SEALED = JSON.stringify({ ok: true, head: SHA_A, sealed: null, skipped: null, outside: [] })

test(
  "L31: a late seal that sealed nothing while nothing else committed on the site takes the turn's unsealed mark off",
  opts,
  async () => {
    const { pool } = db
    const answers = { 'webroot-seal-outside': { state: 'running' } }
    const { held, sweep } = await lateHarness(pool, answers)
    const res = await held('/api/sites/_conversation/turn', {
      turnId: 'session-p5:1',
      title: 'Make the main button red',
      source: 'panel'
    })
    assert.equal((await res.json()).unsealedStart, true, 'the door could not wait for it')
    assert.equal((await turnRow(pool, 'session-p5:1')).unsealed_start, true)

    const at = realNow()
    answers['webroot-seal-outside'] = {
      state: 'done',
      output: NOTHING_SEALED,
      createdAt: at - 15_300,
      updatedAt: at
    }
    await sweep(60_000)
    assert.equal((await turnRow(pool, 'session-p5:1')).unsealed_start, false)
    assert.equal((await pool.query('select 1 from site_job_follow_up')).rows.length, 0)
  }
)

test(
  "L31: a late seal that sealed nothing keeps the mark when the previous turn's late moment committed while it waited",
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside-1': { state: 'done', output: NOTHING_SEALED },
      'webroot-seal-outside-2': { state: 'running' },
      'webroot-moment-1': { state: 'running' }
    }
    const { door, held, sweep } = await lateHarness(pool, answers)
    await door('/api/sites/_conversation/turn', { turnId: 'session-p5:1', title: 'One', source: 'panel' })
    assert.equal((await turnRow(pool, 'session-p5:1')).unsealed_start, false, 'sealed in time')
    // The dsh takes the 202 as recorded and opens the next turn while the host still commits the first.
    assert.equal(
      (await held('/api/sites/_conversation/moment', { title: 'One', turnId: 'session-p5:1' })).status,
      202
    )
    const res = await held('/api/sites/_conversation/turn', {
      turnId: 'session-p5:2',
      title: 'Two',
      source: 'panel'
    })
    assert.equal((await res.json()).unsealedStart, true)

    // The first turn's moment held the site's lock until well into the second turn's seal, and
    // committed: what the second turn's agent wrote first may be in it (uiweekwp 09/10/2026).
    const at = realNow()
    answers['webroot-moment-1'] = {
      state: 'done',
      output: MOMENT,
      createdAt: at - 30_000,
      updatedAt: at - 6_000
    }
    answers['webroot-seal-outside-2'] = {
      state: 'done',
      output: NOTHING_SEALED,
      createdAt: at - 20_000,
      updatedAt: at
    }
    await sweep(60_000)
    assert.equal((await turnRow(pool, 'session-p5:1')).state, 'closed')
    assert.equal((await turnRow(pool, 'session-p5:2')).unsealed_start, true)
  }
)

// ── Option A (David 10/10/2026, ledger L31): the next turn's first write waits for the earlier moment ──
// The stand, 09/10 (uiweekwp): turn 1's `/moment` answered 202, the dsh opened turn 2, and turn 1's
// moment ended on the host 20 s after that — what turn 2 wrote in between would have been committed
// under turn 1's name. Now the open names such moments (`momentsPending`), the dsh holds the first
// write until `POST /moment/wait` says they ended (or its bound, then `release`).

/** The seal payload the follow-up row of `turnId`'s seal carries. */
const sealPayload = async (pool, turnId) =>
  (await pool.query("select payload from site_job_follow_up where door = 'seal' and turn_id = $1", [turnId]))
    .rows[0]?.payload ?? null

/**
 * Turn 1's seal, ended in its door's wait a minute ago — with the host's own record times, as every
 * real job has: a job whose times are unknown counts as having run in a later seal's window.
 */
const SEAL_ONE = () => ({
  state: 'done',
  output: NOTHING_SEALED,
  createdAt: realNow() - 60_000,
  updatedAt: realNow() - 59_000
})

/** Turn 1 sealed in time, its close answered 202 while its moment still runs, turn 2 opened. */
async function turnTwoWhileOneCommits(pool, answers, { waits = true } = {}) {
  const harness = await lateHarness(pool, answers)
  const { door, held } = harness
  await door('/api/sites/_conversation/turn', { turnId: 'session-ph:1', title: 'One', source: 'panel' })
  assert.equal(
    (await held('/api/sites/_conversation/moment', { title: 'One', turnId: 'session-ph:1' })).status,
    202
  )
  const opened = await held('/api/sites/_conversation/turn', {
    turnId: 'session-ph:2',
    title: 'Two',
    source: 'panel',
    ...(waits ? { waitsForMoments: true } : {})
  })
  return { ...harness, opened: await opened.json() }
}

test(
  'option A: the next open names the earlier moments still committing, and a dsh that holds is trusted for its seal',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside-1': SEAL_ONE(),
      'webroot-seal-outside-2': { state: 'running' },
      'webroot-moment-1': { state: 'running' }
    }
    const { opened } = await turnTwoWhileOneCommits(pool, answers)
    assert.deepEqual(opened.momentsPending, ['session-ph:1'])
    assert.deepEqual((await sealPayload(pool, 'session-ph:2')).heldBehind, ['webroot-moment-1'])
  }
)

test("option A: an open names nothing when the earlier moment ended in its door's wait", opts, async () => {
  const { pool } = db
  const { door } = await lateHarness(pool, {
    'webroot-seal-outside': { state: 'done', output: NOTHING_SEALED }
  })
  await door('/api/sites/_conversation/turn', { turnId: 'session-pq:1', title: 'One', source: 'panel' })
  assert.equal(
    (await door('/api/sites/_conversation/moment', { title: 'One', turnId: 'session-pq:1' })).status,
    200
  )
  const res = await door('/api/sites/_conversation/turn', {
    turnId: 'session-pq:2',
    title: 'Two',
    source: 'panel',
    waitsForMoments: true
  })
  assert.deepEqual((await res.json()).momentsPending, [])
})

test(
  'option A: an older dsh that does not hold still hears the moment named, but its seal does not trust it',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside-1': SEAL_ONE(),
      'webroot-seal-outside-2': { state: 'running' },
      'webroot-moment-1': { state: 'running' }
    }
    const { opened } = await turnTwoWhileOneCommits(pool, answers, { waits: false })
    assert.deepEqual(opened.momentsPending, ['session-ph:1'])
    assert.equal((await sealPayload(pool, 'session-ph:2')).heldBehind, undefined)
  }
)

test(
  'option A: /moment/wait says not yet while the host commits, and ended — with the turn closed under its commit — once it has',
  opts,
  async () => {
    const { pool } = db
    const answers = {
      'webroot-seal-outside-1': SEAL_ONE(),
      'webroot-seal-outside-2': { state: 'running' },
      'webroot-moment-1': { state: 'running' }
    }
    const { door, held, sweep } = await turnTwoWhileOneCommits(pool, answers)
    const wait = (body, how = held) => how('/api/sites/_conversation/moment/wait', body)
    let res = await wait({ turnId: 'session-ph:1' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, ended: false })
    assert.equal((await turnRow(pool, 'session-ph:1')).state, 'open')

    const at = realNow()
    answers['webroot-moment-1'] = {
      state: 'done',
      output: MOMENT,
      createdAt: at - 30_000,
      updatedAt: at - 6_000
    }
    res = await wait({ turnId: 'session-ph:1' }, door)
    assert.deepEqual(await res.json(), { ok: true, ended: true })
    const one = await turnRow(pool, 'session-ph:1')
    assert.equal(one.state, 'closed', 'closed by the wait itself, not left to the sweep')
    assert.equal(one.head_sha, SHA_M)
    assert.equal(one.closed_at.getTime(), at - 6_000, "the host's own end of the moment")
    assert.equal(one.concurrent, false)

    // Turn 2's seal ends behind that moment, clean: the moment was held for, so it proves the start.
    answers['webroot-seal-outside-2'] = {
      state: 'done',
      output: NOTHING_SEALED,
      createdAt: at - 20_000,
      updatedAt: at
    }
    await sweep(60_000)
    const two = await turnRow(pool, 'session-ph:2')
    assert.equal(two.unsealed_start, false)
    assert.equal(two.concurrent, false)

    // Nothing owed: ended at once. A malformed id is refused.
    assert.deepEqual(await (await wait({ turnId: 'session-ph:9' }, door)).json(), { ok: true, ended: true })
    assert.equal((await wait({ turnId: 'nope' }, door)).status, 400)
  }
)

test('option A: let go at the bound, a moment that then commits marks both turns', opts, async () => {
  const { pool } = db
  const answers = {
    'webroot-seal-outside-1': SEAL_ONE(),
    'webroot-seal-outside-2': { state: 'running' },
    'webroot-moment-1': { state: 'running' }
  }
  const { held, sweep } = await turnTwoWhileOneCommits(pool, answers)
  const res = await held('/api/sites/_conversation/moment/wait', { turnId: 'session-ph:1', release: true })
  assert.deepEqual(await res.json(), { ok: true, ended: false, released: true })
  assert.equal((await sealPayload(pool, 'session-ph:2')).released, true)

  const at = realNow()
  answers['webroot-moment-1'] = {
    state: 'done',
    output: MOMENT,
    createdAt: at - 30_000,
    updatedAt: at - 6_000
  }
  answers['webroot-seal-outside-2'] = {
    state: 'done',
    output: NOTHING_SEALED,
    createdAt: at - 20_000,
    updatedAt: at
  }
  await sweep(60_000)
  const one = await turnRow(pool, 'session-ph:1')
  const two = await turnRow(pool, 'session-ph:2')
  assert.equal(one.state, 'closed')
  assert.equal(one.concurrent, true, "turn 1's moment may hold turn 2's first edits")
  assert.equal(two.unsealed_start, true, "turn 2's first edits may sit in turn 1's moment")
})

test('option A: let go at the bound, a moment that commits nothing marks nothing', opts, async () => {
  const { pool } = db
  const answers = {
    'webroot-seal-outside-1': SEAL_ONE(),
    'webroot-seal-outside-2': { state: 'running' },
    'webroot-moment-1': { state: 'running' }
  }
  const { held, sweep } = await turnTwoWhileOneCommits(pool, answers)
  await held('/api/sites/_conversation/moment/wait', { turnId: 'session-ph:1', release: true })
  const at = realNow()
  const nothing = JSON.stringify({ ok: true, committed: false, files: 0, head: SHA_A, sha: null, paths: [] })
  answers['webroot-moment-1'] = {
    state: 'done',
    output: nothing,
    createdAt: at - 30_000,
    updatedAt: at - 6_000
  }
  answers['webroot-seal-outside-2'] = {
    state: 'done',
    output: NOTHING_SEALED,
    createdAt: at - 20_000,
    updatedAt: at
  }
  await sweep(60_000)
  assert.equal((await turnRow(pool, 'session-ph:1')).concurrent, false)
  assert.equal((await turnRow(pool, 'session-ph:2')).unsealed_start, false)
})

test(
  "🔒 option A, the stand's sequence through the dsh's own turn book: turn 2's first write waits for turn 1's moment, and the records do not mix",
  opts,
  async (t) => {
    const { pool } = db
    const { createTurnBook } = await import('../../../packages/site/tracy-site-tabs/src/host/turn-record.mjs')
    const answers = {
      'webroot-seal-outside-1': SEAL_ONE(),
      'webroot-seal-outside-2': { state: 'running' },
      'webroot-moment-1': { state: 'running' },
      'webroot-moment-2': { state: 'done', output: MOMENT_N }
    }
    const { held, sweep } = await lateHarness(pool, answers)
    // The host dsh's own turn book, its doors answered by this tracy-web.
    const send = async (door, body) => {
      const res = await held(`/api/sites/_conversation/${door}`, body)
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
    }
    const book = createTurnBook({ send, warn: () => {}, info: () => {}, askAgainMs: 10 })
    const said = (text) => ({
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user', prompter: { user: 'Owner', email: 'owner@x.y' }, rpcId: `rpc-${text}` }
    })
    const t0 = realNow()
    const ms = (at) => (at === null ? null : at - t0)
    await book.stepEntered({
      sessionId: 'session-pe',
      turn: 1,
      messages: [said('One')],
      cwd: '/site/lantern'
    })
    await book.writeReady({ sessionId: 'session-pe' })
    // Turn 1 stops; its door answers 202 with the moment still running on the host.
    await book.turnStopping({ sessionId: 'session-pe', turn: 1, events: [] })
    await book.stepEntered({
      sessionId: 'session-pe',
      turn: 2,
      messages: [said('Two')],
      cwd: '/site/lantern'
    })
    const openedTwo = realNow()
    // Turn 2's model asks for its first write.
    const asked = realNow()
    let released = null
    const write = book.writeReady({ sessionId: 'session-pe' }).then(() => {
      released = realNow()
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    const heldWhileRunning = released === null
    // The host ends turn 1's moment now.
    const momentEnded = realNow()
    answers['webroot-moment-1'] = { state: 'done', output: MOMENT, createdAt: t0, updatedAt: momentEnded }
    await write
    t.diagnostic(
      `p5-timing ${JSON.stringify({ turn2Opened: ms(openedTwo), writeAsked: ms(asked), moment1Ended: ms(momentEnded), writeReleased: ms(released) })}`
    )
    assert.equal(heldWhileRunning, true, "turn 2's first write is held while turn 1's moment runs")
    assert.ok(released >= momentEnded, 'and goes only after that moment ended')

    // Turn 2 writes and stops; its moment ends in its door's wait, after turn 2's seal (the site's lock).
    answers['webroot-moment-2'] = {
      state: 'done',
      output: MOMENT_N,
      createdAt: momentEnded + 600,
      updatedAt: momentEnded + 700
    }
    await book.turnStopping({ sessionId: 'session-pe', turn: 2, events: [] })
    answers['webroot-seal-outside-2'] = {
      state: 'done',
      output: NOTHING_SEALED,
      createdAt: openedTwo,
      updatedAt: momentEnded + 500
    }
    await sweep(60_000)
    const one = await turnRow(pool, 'session-pe:1')
    const two = await turnRow(pool, 'session-pe:2')
    t.diagnostic(
      `p5-records ${JSON.stringify({
        turn1: {
          opened: ms(one.opened_at.getTime()),
          closed: ms(one.closed_at?.getTime() ?? null),
          head: one.head_sha?.slice(0, 7)
        },
        turn2: {
          opened: ms(two.opened_at.getTime()),
          firstWrite: ms(released),
          closed: ms(two.closed_at?.getTime() ?? null),
          head: two.head_sha?.slice(0, 7)
        },
        flags: { turn1Concurrent: one.concurrent, turn2Unsealed: two.unsealed_start }
      })}`
    )
    assert.equal(one.head_sha, SHA_M)
    assert.equal(two.head_sha, SHA_N)
    assert.ok(one.closed_at.getTime() <= released, "turn 1's record closes before turn 2's first write")
    assert.equal(one.concurrent, false)
    assert.equal(two.unsealed_start, false, 'held for, the earlier moment does not cost turn 2 its Undo')
  }
)

test(
  "option A: when the earlier moment ended in its door's wait, the next turn's first write waits not at all",
  opts,
  async (t) => {
    const { pool } = db
    const { createTurnBook } = await import('../../../packages/site/tracy-site-tabs/src/host/turn-record.mjs')
    const { held } = await lateHarness(pool, {
      'webroot-seal-outside': { state: 'done', output: NOTHING_SEALED },
      'webroot-moment': { state: 'done', output: MOMENT }
    })
    const sent = []
    const send = async (door, body) => {
      sent.push(door)
      const res = await held(`/api/sites/_conversation/${door}`, body)
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
    }
    const book = createTurnBook({ send, warn: () => {}, info: () => {} })
    const said = (text) => ({
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user', prompter: { user: 'Owner', email: 'owner@x.y' }, rpcId: `rpc-${text}` }
    })
    await book.stepEntered({
      sessionId: 'session-pf',
      turn: 1,
      messages: [said('One')],
      cwd: '/site/lantern'
    })
    await book.turnStopping({ sessionId: 'session-pf', turn: 1, events: [] })
    await book.stepEntered({
      sessionId: 'session-pf',
      turn: 2,
      messages: [said('Two')],
      cwd: '/site/lantern'
    })
    // Since 16/10 the step's undone list comes from `turn/undone`, so the step no longer waits for the
    // open; the first write does (the seal), and only for it — never for the earlier moment, which
    // ended in its own door's wait. Once the open has answered, writes go at once.
    assert.ok(sent.includes('turn/undone'), 'the second turn read its undone list early')
    await book.writeReady({ sessionId: 'session-pf' })
    const started = performance.now()
    assert.equal(await book.writeReady({ sessionId: 'session-pf' }), false)
    const waited = performance.now() - started
    t.diagnostic(`p5-no-wait ${waited.toFixed(3)} ms`)
    assert.ok(waited < 5, `${waited.toFixed(2)} ms`)
    assert.equal(sent.includes('moment/wait'), false, 'tracy-web is not even asked')
  }
)

test(
  'GET /api/sites/:key/changes: a seal the look made is kept as a site_outside row; the answer passes truncated through',
  opts,
  async () => {
    const { pool } = db
    const output = JSON.stringify({
      ok: true,
      since: { version: 1, sha: SHA_M },
      moments: [],
      files: [],
      truncated: { moments: false, files: true },
      sealed: { sha: SHA_A, files: ['a.php', 'b.php'] }
    })
    const { fetchImpl } = fakeNetwork({ siteJob: { output } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    const res = await app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/changes', {
        headers: { cookie: await cookieFor('owner@x.y') }
      })
    )
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).truncated, { moments: false, files: true })
    const { rows } = await pool.query('select sha, files, cause from site_outside')
    assert.deepEqual(rows, [{ sha: SHA_A, files: 2, cause: 'seal' }])
  }
)

// ── POST /api/sites/brief/rewrite — "Rewrite with AI" in the Add site popup ──────────────────────
/** A fetch double for the text model: answers every chat call with `text`, and keeps the calls. */
function modelAnswering(text) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 })
  }
  return { fetchImpl, calls }
}
const MODEL_ENV = { MODEL_API_KEY: 'sk-test', MODEL_BASE_URL: 'https://model.example/v1', MODEL_WORDS: 'm' }

test(
  'POST /api/sites/brief/rewrite: signed-in only, needs a sentence, and says plainly when no model is set',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send } = harness(pool)
    assert.equal(
      (await send('POST', '/api/sites/brief/rewrite', undefined, { text: 'A bakery' })).status,
      401
    )
    const cookie = await cookieFor('rewriter@example.test')
    // An empty box is a valid press now (the answer is a sample), so the first thing it meets is the missing model.
    // A sentence but no model: stated, not guessed around.
    const off = await send('POST', '/api/sites/brief/rewrite', cookie, { text: '' })
    assert.equal(off.status, 503)
    assert.equal((await off.json()).code, 'MODEL_NOT_CONFIGURED')
  }
)

test(
  "POST /api/sites/brief/rewrite: returns the model's rewrite, counted against the original",
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = modelAnswering('A family-run bakery selling fresh bread and cakes')
    const { cookieFor, send } = harness(pool, { fetchImpl, envOverrides: MODEL_ENV })
    const cookie = await cookieFor('rewriter2@example.test')
    const res = await send('POST', '/api/sites/brief/rewrite', cookie, {
      text: 'We are a family bakery that sells bread and cakes'
    })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      text: 'A family-run bakery selling fresh bread and cakes',
      words: 9,
      sourceWords: 10,
      mode: 'rewrite'
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://model.example/v1/chat/completions')
  }
)

test(
  'POST /api/sites/brief/rewrite: a rewrite that stays over the length limit is a 502, not a cut sentence',
  opts,
  async () => {
    const { pool } = db
    const wordy = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const { fetchImpl, calls } = modelAnswering(wordy)
    const { cookieFor, send } = harness(pool, { fetchImpl, envOverrides: MODEL_ENV })
    const cookie = await cookieFor('rewriter3@example.test')
    const res = await send('POST', '/api/sites/brief/rewrite', cookie, { text: 'A family bakery in town' })
    assert.equal(res.status, 502)
    assert.equal((await res.json()).code, 'REWRITE_UNUSABLE')
    assert.equal(calls.length, 2, 'one repair round')
  }
)

test(
  'POST /api/sites/brief/rewrite: an empty box gets a sample sentence of about ten words',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = modelAnswering('We make fresh bread and cakes for our neighbours')
    const { cookieFor, send } = harness(pool, { fetchImpl, envOverrides: MODEL_ENV })
    const cookie = await cookieFor('rewriter5@example.test')
    const res = await send('POST', '/api/sites/brief/rewrite', cookie, {
      text: '',
      question: 'What do you do?'
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.mode, 'sample')
    assert.equal(body.sourceWords, 0)
    assert.equal(body.words, 9)
  }
)

test('POST /api/sites/brief/rewrite: capped per person per hour', opts, async () => {
  const { pool } = db
  const { fetchImpl } = modelAnswering('A family-run bakery in town')
  const { cookieFor, send } = harness(pool, { fetchImpl, envOverrides: MODEL_ENV })
  const cookie = await cookieFor('rewriter4@example.test')
  // The bucket is per person: fill it to the cap, and the next press is refused with Retry-After.
  // The hour is read off the process clock, the one the door reads: Postgres' `now()` would not move with a shifted clock.
  const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  await pool.query(
    `insert into rate_bucket (bucket, window_start, count) values ($1, $2, $3)
     on conflict (bucket, window_start) do update set count = excluded.count`,
    ['brief-rewrite:rewriter4@example.test', windowStart, BRIEF_REWRITE_LIMIT_PER_HOUR]
  )
  const res = await send('POST', '/api/sites/brief/rewrite', cookie, { text: 'A family bakery in town' })
  assert.equal(res.status, 429)
  assert.ok(Number(res.headers.get('retry-after')) >= 1)
})

// ── "Apply" in the Add site popup: the text and pictures of a site made with a brief ─────────────────
//
// What the doors owe `sites/brief-build.js`, with a runner double: the create door hands it the press, the
// poll door keeps the customer on "working" while it runs, a failed install abandons it, and the engines'
// own door (`applyAs`) is the Apply door as one person. What the runner and the engines do is tested beside them.

/** A runner that records what it was asked and answers as scripted. */
function fakeBriefs({ held = null, waiting = null, placing = null } = {}) {
  const log = { started: [], gates: [], waits: [], abandoned: [] }
  const answers = { held, waiting, placing }
  return {
    log,
    answers,
    start: async (input) => (log.started.push(input), { started: true }),
    gate: async (siteKey) => (log.gates.push(siteKey), answers.held ?? { open: false, step: null }),
    waiting: async (siteKey) => (log.waits.push(siteKey), answers.waiting),
    placing: async () => answers.placing,
    abandon: async (siteKey) => void log.abandoned.push(siteKey)
  }
}

test(
  'POST /api/sites with a brief hands the press to the runner; no brief, an empty one or no runner starts nothing',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const briefs = fakeBriefs()
    const { cookieFor, send } = harness(pool, { fetchImpl, briefs })
    const owner = await cookieFor('owner@x.y')

    const made = await send('POST', '/api/sites', owner, {
      label: 'lantern',
      platform: 'wordpress',
      brief: {
        about: '  A family bakery  in Hanoi.\u0000 ',
        goal: 'sell',
        style: 'friendly',
        extra: 'dropped'
      }
    })
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    const { siteKey } = await made.json()
    assert.equal(briefs.log.started.length, 1)
    const [started] = briefs.log.started
    assert.equal(started.siteKey, siteKey)
    assert.equal(started.email, 'owner@x.y')
    assert.equal(started.label, 'lantern')
    assert.equal(started.platform, 'wordpress')
    assert.deepEqual(started.brief, { about: 'A family bakery in Hanoi.', goal: 'sell', style: 'friendly' })
    assert.ok(started.accountId, 'the account that owns the site')
    assert.equal(
      started.jobId,
      'job-1',
      'the host job, so the work can tell the site is up before the wizard does'
    )
    assert.ok(started.host)

    // "I will do it later": no brief, nothing started. An empty or nonsense one is no brief either.
    for (const [label, brief] of [
      ['plain', undefined],
      ['empty', { about: '   ', goal: null, style: null }],
      ['nonsense', { about: '', goal: 'world peace', style: 'loud' }],
      ['text', 'a string']
    ]) {
      const r = await send('POST', '/api/sites', owner, {
        label: `${label}-site`,
        platform: 'wordpress',
        ...(brief === undefined ? {} : { brief })
      })
      assert.equal(r.status, 202, label)
    }
    assert.equal(briefs.log.started.length, 1, 'only the real brief started anything')
  }
)

test(
  'POST /api/sites with answers by question id: judged against the set the customer was shown, not the set of the day',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const briefs = fakeBriefs()
    const { cookieFor, send, get } = harness(pool, { fetchImpl, briefs })
    const owner = await cookieFor('owner@x.y')

    // The questions of this CMS, as the popup asks for them: this is the set the answers are judged against.
    const served = await (await get('/api/sites/questions?platform=wordpress', owner)).json()
    assert.ok(served.set.contentHash, 'the served set is named by its hash')
    const ids = served.questions.map((q) => q.id)
    assert.ok(ids.includes('name') && ids.includes('about'))

    const made = await send('POST', '/api/sites', owner, {
      label: 'asked-set',
      platform: 'wordpress',
      brief: {
        questionnaire: served.set.contentHash,
        answers: {
          name: '  Golden  Crust ',
          about: 'A family bakery in Hanoi.',
          stray: 'nobody asked',
          tone: 'nope'
        }
      }
    })
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    assert.equal(briefs.log.started.length, 1)
    const [started] = briefs.log.started
    assert.deepEqual(
      started.brief.answers.map((a) => [a.id, a.value]),
      [
        ['name', 'Golden Crust'],
        ['about', 'A family bakery in Hanoi.']
      ],
      'an unknown question and an option the question does not offer are dropped'
    )
    assert.equal(started.brief.about, 'A family bakery in Hanoi.')

    // A hash this server never served is judged against the set the site would be asked today.
    const unknown = await send('POST', '/api/sites', owner, {
      label: 'unknown-set',
      platform: 'wordpress',
      brief: { questionnaire: 'f'.repeat(64), answers: { name: 'Golden Crust' } }
    })
    assert.equal(unknown.status, 202)
    assert.equal(briefs.log.started.length, 2)

    // Answers to nothing the set asks, or none at all, are no brief: the plain road.
    for (const [label, brief] of [
      ['stray', { answers: { stray: 'x' } }],
      ['empty', { answers: {} }]
    ]) {
      const r = await send('POST', '/api/sites', owner, {
        label: `${label}-answers`,
        platform: 'wordpress',
        brief
      })
      assert.equal(r.status, 202, label)
    }
    assert.equal(briefs.log.started.length, 2, 'nothing answered, nothing started')
  }
)

test(
  'job poll: while the words are being written the site is "running" with the step, and is not settled',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const briefs = fakeBriefs({
      held: { open: true, step: 'writing your text and pictures', state: 'applying' }
    })
    const { cookieFor, send, get } = harness(pool, { fetchImpl, briefs })
    const owner = await cookieFor('owner@x.y')
    const { siteKey, jobId } = await (
      await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    ).json()

    const held = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
    assert.equal(held.state, 'running')
    assert.equal(held.step, 'writing your text and pictures')
    assert.equal(held.liveUrl, 'http://lantern.localhost:8080/', 'the handover is done: the address is known')
    assert.deepEqual(briefs.log.gates, [siteKey])
    const creation = (await pool.query('select state from site_creation where site_key = $1', [siteKey]))
      .rows[0]
    assert.notEqual(creation?.state, 'done', 'the press is not settled until the words are in')

    // The work finishes: the very next poll is the ordinary `done`.
    briefs.answers.held = { open: false, step: null, state: 'applied' }
    const finished = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
    assert.equal(finished.state, 'done')
    assert.equal(finished.lane, '/')
  }
)

test(
  'job poll: a poll that arrives while the work goes on says "working" and does not hand the site over again',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const briefs = fakeBriefs({
      waiting: { step: 'placing your text and pictures on the site', state: 'applying' }
    })
    const { cookieFor, send, get } = harness(pool, { fetchImpl: net.fetchImpl, briefs })
    const owner = await cookieFor('owner@x.y')
    const { siteKey, jobId } = await (
      await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    ).json()
    const before = net.calls.length

    const body = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
    assert.equal(body.state, 'running')
    assert.equal(body.step, 'placing your text and pictures on the site')
    assert.deepEqual(
      net.calls.slice(before).map((c) => new URL(c.url).pathname),
      ['/_host/jobs/job-1'],
      'the host is asked for the job and for nothing else: no pairing, no repo, no lane'
    )
    assert.deepEqual(briefs.log.gates, [], 'gate runs after the handover, not on this poll')
  }
)

// #1403 item 7, the stand 16/10/2026: Apply placed the words for three minutes while the console said "Recording a
// starting point" — the host's last step — because the poll named the brief's step only once the host was done.
test(
  'job poll: words placed while the host still records its starting point are named instead of the host step',
  opts,
  async () => {
    const { pool } = db
    const net = fakeNetwork()
    const recording = async (input, init) =>
      new URL(String(input)).pathname === '/_host/jobs/job-1'
        ? new Response(JSON.stringify({ state: 'running', step: 'baseline' }), { status: 200 })
        : net.fetchImpl(input, init)
    const briefs = fakeBriefs({ placing: 'placing your text and pictures on the site' })
    const { cookieFor, send, get } = harness(pool, { fetchImpl: recording, briefs })
    const owner = await cookieFor('owner@x.y')
    const { siteKey, jobId } = await (
      await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'joomla' })
    ).json()
    const placing = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
    assert.equal(placing.state, 'running')
    assert.equal(placing.step, 'placing your text and pictures on the site')
    // Not placing (still writing, or no brief): the host's own step, as before.
    briefs.answers.placing = null
    const host = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
    assert.equal(host.step, 'baseline')
    assert.deepEqual(briefs.log.gates, [], 'nothing is handed over before the host is done')
  }
)

test('job poll: a host that could not install the site abandons the words', opts, async () => {
  const { pool } = db
  const net = fakeNetwork()
  const failing = async (input, init) =>
    new URL(String(input)).pathname === '/_host/jobs/job-1'
      ? new Response(JSON.stringify({ state: 'failed', output: 'no disk' }), { status: 200 })
      : net.fetchImpl(input, init)
  const briefs = fakeBriefs()
  const { cookieFor, send, get } = harness(pool, { fetchImpl: failing, briefs })
  const owner = await cookieFor('owner@x.y')
  const { siteKey, jobId } = await (
    await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
  ).json()
  const body = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
  assert.equal(body.state, 'failed')
  assert.deepEqual(briefs.log.abandoned, [siteKey])
})

test(
  'applyAs: the Apply door as one person — a stranger and a seat without the toolset are refused with ok:false',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { app, cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const { siteKey } = await (
      await send('POST', '/api/sites', owner, { label: 'lantern', platform: 'wordpress' })
    ).json()

    const stranger = await app.applyAs('nobody@x.y', {
      siteKey,
      action: 'content.contract',
      params: { operation: 'inspect' }
    })
    assert.equal(stranger.ok, false)
    assert.equal(stranger.code, 'SEAT_NOT_AUTHORIZED')

    // A viewer holds no toolset (ADR 0028): installing a plugin is refused by name.
    await seatRow(pool, siteKey, 'writer@x.y', 'viewer')
    const refused = await app.applyAs('writer@x.y', {
      siteKey,
      action: 'plugin.install',
      params: { slug: 'anything' }
    })
    assert.equal(refused.ok, false)
    assert.equal(refused.code, 'TOOLSET_NOT_GRANTED')
    assert.match(String(refused.message), /TOOLSET_NOT_GRANTED/)
  }
)

test(
  'POST /api/sites: an archived quickstart (tracy_archived.json) is refused; without the mark it is not',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    await seedSealedRelease(pool, 'tracy-base/wp7', 'wordpress', '1.0.0')
    const mark = (assets) =>
      pool.query(
        `update quickstart_releases set release = jsonb_set(release, '{assets}', $2::jsonb) where tag = $1`,
        ['tracy-base/wp7', JSON.stringify(assets)]
      )
    const press = (label) =>
      send('POST', '/api/sites', owner, { label, platform: 'wordpress', quickstart: 'tracy-base/wp7' })

    await mark([{ name: 'tracy_archived.json', size: 2, id: 1 }])
    const refused = await press('archived-one')
    assert.equal(refused.status, 400)
    assert.equal((await refused.json()).code, 'UNSUPPORTED_QUICKSTART')
    assert.equal(
      calls.filter((c) => c.url.endsWith('/_host/provision')).length,
      0,
      'the fleet was never asked'
    )

    await mark([])
    const again = await press('archived-two')
    assert.notEqual(
      (await again.json()).code,
      'UNSUPPORTED_QUICKSTART',
      'the mark taken off, the release may be named again'
    )
  }
)

test(
  'a person who lives on a shard is sent there to create, import or claim, and nothing is made here',
  opts,
  async () => {
    const { pool } = db
    await seedShards(
      pool,
      [
        {
          name: 's1',
          origin: 'https://s1.tracy.test',
          secret: 'a'.repeat(64),
          tunnelId: '11111111-1111-4111-8111-111111111111'
        }
      ],
      env.SESSION_SECRET
    )
    await pool.query("update shard set accepting = true where name = 's1'")
    await pool.query("insert into directory_email (email, shard) values ('mover@test.example', 's1')")
    const { cookieFor, send } = harness(pool, { fetchImpl: fakeNetwork().fetchImpl })
    const mover = await cookieFor('mover@test.example')
    for (const [path, body] of [
      ['/api/sites', { label: 'plainwp', platform: 'wordpress' }],
      ['/api/sites', { origin: 'import', siteKey: 'shop.example.com', platform: 'wordpress' }],
      ['/api/sites/claim', { buildId: 'b'.repeat(32), platform: 'wordpress' }]
    ]) {
      const res = await send('POST', path, mover, body)
      assert.equal(res.status, 409, path)
      assert.deepEqual(await res.json(), { code: 'USE_SHARD', redirect: 'https://s1.tracy.test/new/' })
    }
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 0)
    await pool.query("insert into directory_email (email, shard) values ('legacy@test.example', 's0')")
    const legacy = await send('POST', '/api/sites', await cookieFor('legacy@test.example'), {
      label: 'plainwp',
      platform: 'wordpress'
    })
    assert.notEqual((await legacy.json()).code, 'USE_SHARD')
  }
)

test(
  'a full shard is not where a new site goes, and neither is this master: USE_SHARD points at the fresh-start door',
  opts,
  async () => {
    const { pool } = db
    await seedShards(
      pool,
      [
        {
          name: 's1',
          origin: 'https://s1.tracy.test',
          secret: 'a'.repeat(64),
          tunnelId: '11111111-1111-4111-8111-111111111111'
        }
      ],
      env.SESSION_SECRET
    )
    await pool.query(
      "update shard set accepting = true, last_heartbeat = '{\"accepting\": false}' where name = 's1'"
    )
    await pool.query("insert into directory_email (email, shard) values ('full@test.example', 's1')")
    const { cookieFor, send } = harness(pool, { fetchImpl: fakeNetwork().fetchImpl })
    const res = await send('POST', '/api/sites', await cookieFor('full@test.example'), {
      label: 'fullwp',
      platform: 'wordpress'
    })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { code: 'USE_SHARD', redirect: `${env.TRACY_ORIGIN}/new/?fresh=1` })
    assert.equal(
      (await pool.query('select count(*)::int as n from site')).rows[0].n,
      0,
      'nothing is made on this master'
    )
  }
)

test(
  'a label a shard holds is TAKEN on this master too; a free one is held for this master while it is made',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into label_registry (label, holder, expires_at) values ('heldwp', 's1', now() + interval '30 minutes')"
    )
    const { cookieFor, send } = harness(pool, { fetchImpl: fakeNetwork().fetchImpl })
    const owner = await cookieFor('owner@test.example')
    const taken = await send('POST', '/api/sites', owner, { label: 'heldwp', platform: 'wordpress' })
    assert.equal(taken.status, 409)
    assert.equal((await taken.json()).code, 'TAKEN')
    const made = await send('POST', '/api/sites', owner, { label: 'freewp', platform: 'wordpress' })
    assert.equal(made.status, 202, JSON.stringify(await made.clone().json()))
    assert.equal(
      (await pool.query("select holder from label_registry where label = 'freewp'")).rows[0].holder,
      's0'
    )
  }
)

test(
  'an explicitly selected quickstart refuses changed version or archive bytes before any claim/provision',
  opts,
  async () => {
    const { pool } = db
    await seedKineticTemplate(pool)
    const { fetchImpl, calls } = fakeNetwork()
    const { cookieFor, send } = harness(pool, { fetchImpl })
    const owner = await cookieFor('owner@x.y')
    const release = {
      version: '1.0.0',
      files: {
        webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
        database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
      }
    }
    for (const expected of [
      null,
      { ...release, version: '0.9.0' },
      { ...release, files: { ...release.files, webroot: { file: 'w.tar.gz', sha256: 'c'.repeat(64) } } }
    ]) {
      const response = await send('POST', '/api/sites', owner, {
        label: 'explicit-choice',
        platform: 'joomla',
        design: 'ja-kinetic',
        quickstart: 'quickstart/ja-kinetic/j6',
        expectedQuickstartRelease: expected
      })
      assert.equal(response.status, 409)
      assert.equal((await response.json()).code, 'TEMPLATE_VERSION_CHANGED')
    }
    assert.equal((await pool.query('select 1 from site_creation')).rowCount, 0)
    assert.equal(calls.length, 0)
    // JSONB may reorder the keys; the same version/checksums still reach the normal provision path.
    const accepted = await send('POST', '/api/sites', owner, {
      label: 'explicit-choice',
      platform: 'joomla',
      design: 'ja-kinetic',
      quickstart: 'quickstart/ja-kinetic/j6',
      expectedQuickstartRelease: release
    })
    assert.equal(accepted.status, 202, JSON.stringify(await accepted.clone().json()))
  }
)
