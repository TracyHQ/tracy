/**
 * Publishing a site through `POST /api/sites/:key/go-live`, and what `GET /api/sites/:key/state`
 * reads back: one operation per site at a time, and the `published` flag only after the host's job
 * has ended `done` (`src/sites/publish.js`, `publish-store.js`, `069-site-publish-op.sql`).
 *
 * The app is the real `buildApp` on a real PostgreSQL; the host is a `fetchImpl` that answers the
 * way `tracy-host` does (`apps/tracy-host/src/app.js` `goLiveRoute`: 202 with a job id, then
 * `GET /_host/jobs/:id` reading queued → running → done | failed), driven by each test.
 *
 * WHAT THIS DOES NOT RUN: `tracy-host` and `go-live.sh` (their contract is held by
 * `apps/tracy-host/test/site-publish.test.mjs`), a browser, and the site proxy's headers
 * (`test/bar.test.mjs`).
 *
 * Everything here goes through the doors, and imports nothing that did not exist before this flow:
 * the store's own functions (the last section) are imported inside their tests.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/site-publish.test.mjs
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp as buildHostApp } from '../../tracy-host/src/app.js'
// A namespace: on sources without the acceptance mark this file still loads.
import * as hostJobs from '../../tracy-host/src/jobs.js'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { sweepPublishOps } from '../src/cron.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { followThrough, settleFollowUps } from '../src/sites/door-follow-up.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

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
  SEAT_local_SECRET: 'k'
}

const SITE = 'lantern.localhost'
/** The closing line `go-live.sh` prints when every step went through. */
const said = (op, lines = '') => `${lines}TRACY_RESULT go_live=${op} label=lantern platform=wordpress`

/**
 * The host. `goLive(payload, n)` answers the n-th `POST /_host/go-live` (a `Response`, or a throw
 * for a host that cannot be reached); by default it behaves as `tracy-host` does with a job key:
 * 202 with `golive-<n>` for a new key; the same job (`reused`) for a key whose job is waiting,
 * running or has an outcome; and the same job STARTED AGAIN (`reruns`) for a key whose record is
 * gone or is no outcome (failed by a restart, or ended on the site's lock). `jobs[id]` is what
 * `GET /_host/jobs/<id>` answers (an object → 200, a number → that status); unknown ids are 404.
 * `onSiteJob` runs each time a webroot job is asked for — the moment `GET /settings` reads the CMS.
 */
/** `tracy-host` `hasOutcome`: the record carries its script's own exit code. */
const hostKeeps = (record) =>
  record.orphanedAt == null &&
  record.busy !== true &&
  record.unobserved !== true &&
  (record.state === 'done'
    ? record.exitCode === 0
    : record.state === 'failed' &&
      Number.isInteger(record.exitCode) &&
      record.exitCode !== 0 &&
      record.exitCode !== 75)

/** The routing target the fake host names (`POST /_host/routing-target`): its tunnel's public name. */
const TARGET = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com'
/** `tracy-host` `hasOutcomeFor`: a cleanup that failed is run again only for a higher attempt. */
const hostRunsAgain = (record, payload) =>
  hostKeeps(record) &&
  record.state === 'failed' &&
  ['go-live:draft', 'go-live:drop-domain', 'go-live:teardown'].includes(record.step) &&
  (payload.attempt ?? 0) > (record.attempt ?? 0)

function fakeHost({ goLive, onSiteJob, target = TARGET, sitePage } = {}) {
  const calls = []
  const jobs = {}
  /** Job key → the job it names, as the host keeps it: the same key is the same job. */
  const keyed = new Map()
  /** The job ids the host started again under their key. */
  const reruns = []
  let asked = 0
  const fetchImpl = async (input, init) => {
    // The proxy hands over a `Request`; every other caller a URL and its init.
    const u = new URL(input instanceof Request ? input.url : String(input))
    // The site's own copy, asked at its Tracy address before an own domain is removed (#1037,
    // `addressStanding`): its home page, unless a test answers otherwise (`sitePage`).
    if (/-web-1$|-sites\./.test(u.hostname))
      return sitePage
        ? sitePage(u, init)
        : new Response('<!doctype html><html><body>home</body></html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' }
          })
    calls.push({ path: u.pathname, body: init?.body ? JSON.parse(init.body) : null })
    if (u.pathname === '/_host/go-live') {
      asked++
      const payload = JSON.parse(init.body)
      if (goLive) return goLive(payload, asked)
      if (keyed.has(payload.jobKey)) {
        asked--
        const id = keyed.get(payload.jobKey)
        const record = jobs[id]
        // As `tracy-host` `hasOutcome`: waiting or running in this process, or the script's own ending.
        const kept =
          record !== undefined &&
          (typeof record === 'number' ||
            record.state === 'queued' ||
            record.state === 'running' ||
            hostKeeps(record)) &&
          !(typeof record === 'object' && hostRunsAgain(record, payload))
        if (kept) return Response.json({ jobId: id, reused: true }, { status: 202 })
        jobs[id] = { state: 'queued', step: `go-live:${payload.op}`, attempt: payload.attempt ?? 0 }
        reruns.push(id)
        return Response.json({ jobId: id }, { status: 202 })
      }
      keyed.set(payload.jobKey, `golive-${asked}`)
      jobs[`golive-${asked}`] = { state: 'queued', step: `go-live:${payload.op}` }
      return Response.json({ jobId: `golive-${asked}` }, { status: 202 })
    }
    // The name an own domain must point at; `target: null` is a host with no tunnel.
    if (u.pathname === '/_host/routing-target') {
      const named = typeof target === 'function' ? await target() : target
      if (named instanceof Response) return named
      return named === null
        ? Response.json({ code: 'NOT_CONFIGURED' }, { status: 501 })
        : Response.json({ target: named })
    }
    // A webroot job (`GET /settings` reads the CMS through one): `onSiteJob` runs while it is asked.
    if (u.pathname === '/_host/site' && onSiteJob) await onSiteJob()
    if (u.pathname.startsWith('/_host/jobs/')) {
      const answer = jobs[u.pathname.slice('/_host/jobs/'.length)]
      if (answer === undefined) return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
      if (typeof answer === 'number') return new Response('<html>bad gateway</html>', { status: answer })
      return Response.json(answer)
    }
    return new Response(null, { status: 404 })
  }
  const goLiveCalls = () => calls.filter((call) => call.path === '/_host/go-live')
  /** The job keys the host was asked under: one key is one operation, however often it is asked. */
  const keys = () => [...new Set(goLiveCalls().map((call) => call.body.jobKey))]
  return { calls, jobs, keyed, reruns, fetchImpl, goLiveCalls, keys }
}

function harness(pool, fetchImpl, dns, ownDomainProbe, customHostnames) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    // Cloudflare for SaaS as a test answers it (`_fake-cloudflare.mjs`); left out, none (#1037).
    ...(customHostnames !== undefined ? { customHostnames } : {}),
    // The HTTPS probe of an own domain, as the test answers it (#1037); never the network.
    ownDomainProbe: ownDomainProbe ?? (async () => ({ status: 'failed', error: 'DNS_NXDOMAIN' })),
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl,
    // DNS as the test answers it; without one, a lookup fails (never the machine's resolver).
    dns: dns ?? {
      resolveTxt: async () => {
        throw Object.assign(new Error('no DNS in this test'), { code: 'ESERVFAIL' })
      },
      resolveCname: async () => {
        throw Object.assign(new Error('no DNS in this test'), { code: 'ESERVFAIL' })
      }
    }
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body, raw) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { app, config, cookieFor, send, get: (path, cookie) => send('GET', path, cookie) }
}

async function account(pool, email) {
  const { rows } = await pool.query(
    'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
    [email]
  )
  return rows[0].id
}

/** A seat row. `status`: accepted (default) · invited (never accepted) · revoked. */
async function seat(pool, siteKey, email, role, status = 'accepted') {
  const id = await account(pool, email)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at, revoked_at)
     values ($1, $2, $3, $2, $4, $5)`,
    [siteKey, id, role, status === 'invited' ? null : new Date(), status === 'revoked' ? new Date() : null]
  )
  return id
}

async function site(pool, siteKey = SITE, label = 'lantern', owner = 'owner@x.y') {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
  await seat(pool, siteKey, owner, 'owner')
}

/** The n-th go-live the host was sent, without its job key — which is checked to be one. */
function sent(host, n = 0) {
  const { jobKey, routeGen, publicOrigin, ...rest } = host.goLiveCalls()[n].body
  assert.equal(publicOrigin, env.TRACY_ORIGIN, 'the web public origin accompanies every signed publish')
  assert.match(jobKey, /^publish:[0-9a-f]{32}$/)
  // The generation of its own-domain routes goes with an ask that names domains, and only with one.
  if (Array.isArray(rest.domains) && rest.domains.length > 0)
    assert.ok(
      Number.isSafeInteger(routeGen) && routeGen > 0,
      'an ask with domains names its route generation'
    )
  else assert.equal(routeGen, undefined, 'no domains, no route generation')
  return rest
}

const flag = async (pool, siteKey = SITE) =>
  (await pool.query('select publish from site where site_key = $1', [siteKey])).rows[0].publish
/** Round the database's microsecond clock up to milliseconds so a due row in the same millisecond
 * is not excluded when the sweep receives a JavaScript Date. */
const dbNow = async (pool) =>
  (await pool.query('select ceil(extract(epoch from now()) * 1000)::double precision as ms')).rows[0].ms
const opRow = async (pool, siteKey = SITE) =>
  (await pool.query('select * from site_publish_op where site_key = $1', [siteKey])).rows[0] ?? null
const count = async (pool, table, siteKey = SITE) =>
  (await pool.query(`select count(*)::int as n from ${table} where site_key = $1`, [siteKey])).rows[0].n
const state = async (h, cookie, siteKey = SITE) => (await h.get(`/api/sites/${siteKey}/state`, cookie)).json()

async function setup(hostOptions) {
  const { pool } = db
  const host = fakeHost(hostOptions)
  const h = harness(pool, host.fetchImpl)
  await site(pool)
  const owner = await h.cookieFor('owner@x.y')
  return { pool, host, h, owner }
}

// ── going live ──────────────────────────────────────────────────────────────────────────────────

test(
  'going live: 202 with the job, the flag stays draft while the job runs, and rises only when the host says done',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.jobId, 'golive-1')
    assert.equal(body.op, 'live')
    assert.equal(body.state, 'running')
    assert.equal(body.publish, 'draft', 'the host took the job; the site is not open yet')
    assert.deepEqual(sent(host), { label: 'lantern', op: 'live' }, 'no domains field reaches the host')

    assert.equal(await flag(pool), 'draft')
    const job = (await pool.query("select kind, host from job where id = 'golive-1'")).rows[0]
    assert.deepEqual(job, { kind: 'go-live', host: 'local' })
    assert.equal(await count(pool, 'site_job_follow_up'), 1, 'the ending is owed to the follow-up book')

    host.jobs['golive-1'] = { state: 'running', step: 'go-live:live' }
    const during = await state(h, owner)
    assert.equal(during.publish, 'draft')
    assert.equal(during.operation.state, 'running')
    assert.equal(during.operation.op, 'live')
    assert.equal(during.operation.confirmed, true)
    assert.equal(during.operation.jobId, 'golive-1')
    assert.equal(during.mayPublish, true)

    host.jobs['golive-1'] = {
      state: 'done',
      step: 'go-live:live',
      exitCode: 0,
      output: said('live')
    }
    const afterDone = await state(h, owner)
    assert.equal(afterDone.publish, 'published')
    assert.equal(afterDone.operation, null)
    assert.equal(await flag(pool), 'published')
    assert.equal((await opRow(pool)).state, 'done')
    assert.equal(await count(pool, 'site_job_follow_up'), 0)
    const audited = (await pool.query("select actor, detail from audit where action = 'site.go-live'")).rows
    assert.equal(audited.length, 1)
    assert.equal(audited[0].actor, 'owner@x.y')
    assert.deepEqual(audited[0].detail, { op: 'live', domains: [], jobId: 'golive-1' })

    // A second read finds nothing left to do: one audit line, one flag.
    await state(h, owner)
    assert.equal(
      (await pool.query("select count(*)::int as n from audit where action = 'site.go-live'")).rows[0].n,
      1
    )
  }
)

test(
  'going live: a job the host fails leaves the site a draft, and the state says the operation failed',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    host.jobs['golive-1'] = {
      state: 'failed',
      step: 'go-live:live',
      exitCode: 1,
      output: '!! /srv/tracy/lantern: could not read the subnet'
    }
    const read = await state(h, owner)
    assert.equal(read.publish, 'draft')
    assert.equal(read.operation.state, 'failed')
    assert.equal(read.operation.op, 'live')
    assert.equal(read.operation.code, 'JOB_FAILED')
    // A job the host failed by its script's own exit ends the operation at once and is not asked for again.
    assert.equal(host.goLiveCalls().length, 1)
    assert.deepEqual(host.reruns, [])
    assert.ok(!JSON.stringify(read).includes('/srv/tracy'), "the host's own lines are not sent to the screen")
    assert.match((await opRow(pool)).detail, /subnet/, 'they are kept for an operator')
    assert.equal(await flag(pool), 'draft')
    assert.equal(
      (await pool.query("select count(*)::int as n from audit where action = 'site.go-live'")).rows[0].n,
      0
    )

    // A failed operation does not hold the site: the next press starts a new job.
    const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(again.status, 202)
    assert.equal((await again.json()).jobId, 'golive-2')
  }
)

// ── going back to draft ─────────────────────────────────────────────────────────────────────────

test(
  'back to draft: the flag drops BEFORE the host is asked, and a job that then fails never raises it again',
  opts,
  async () => {
    const seen = []
    const { pool, host, h, owner } = await setup()
    await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
    const original = host.fetchImpl
    const watching = harness(pool, async (input, init) => {
      if (String(input).endsWith('/_host/go-live')) seen.push(await flag(pool))
      return original(input, init)
    })
    const res = await watching.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.publish, 'draft')
    assert.equal(body.publishFlipped, true)
    assert.deepEqual(seen, ['draft'], 'the site was already covered when the host heard of it')
    assert.deepEqual(sent(host), { label: 'lantern', op: 'draft' })

    host.jobs['golive-1'] = { state: 'failed', step: 'go-live:draft', exitCode: 1, output: 'x' }
    const read = await state(h, owner)
    assert.equal(read.publish, 'draft', 'covered is the safer wrong state')
    assert.equal(read.operation.state, 'failed')
    assert.equal(read.operation.op, 'draft')
  }
)

test('back to draft: a finished job closes the operation and the site reads draft', opts, async () => {
  const { pool, host, h, owner } = await setup()
  await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
  await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
  host.jobs['golive-1'] = { state: 'done', step: 'go-live:draft', exitCode: 0, output: said('draft') }
  const read = await state(h, owner)
  assert.equal(read.publish, 'draft')
  assert.equal(read.operation, null)
  assert.equal((await opRow(pool)).state, 'done')
})

/**
 * `pool`, with every statement that lowers or raises a site's publish flag held at `gate` before it
 * is sent — on the pool itself and on every client it hands out.
 */
function gatedFlagWrites(pool, gate) {
  const wrap = (target) =>
    new Proxy(target, {
      get(inner, name) {
        if (name === 'query')
          return async (...args) => {
            if (typeof args[0] === 'string' && /^\s*update site set publish\b/.test(args[0])) await gate()
            return inner.query(...args)
          }
        if (name === 'connect') return async () => wrap(await inner.connect())
        const value = Reflect.get(inner, name)
        return typeof value === 'function' ? value.bind(inner) : value
      }
    })
  return wrap(pool)
}

test(
  'back to draft, held between the reservation and the lowered flag: nobody sees the operation, no read sends the host its job while the site reads published, and both are there together afterwards',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    let reached
    let release
    const atFlag = new Promise((resolve) => (reached = resolve))
    const held = new Promise((resolve) => (release = resolve))
    const h = harness(
      gatedFlagWrites(pool, () => {
        reached()
        return held
      }),
      host.fetchImpl
    )
    await site(pool)
    await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
    const owner = await h.cookieFor('owner@x.y')

    const pressed = h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    await atFlag
    // Another connection, as another replica or another tab's request reads it.
    assert.equal(await flag(pool), 'published')
    assert.equal(await opRow(pool), null, 'no operation is visible before the flag is down')
    const read = await state(h, owner)
    assert.equal(read.publish, 'published')
    assert.equal(read.operation, null)
    assert.equal(host.goLiveCalls().length, 0, 'the host was sent nothing for a site still published')

    release()
    const res = await pressed
    assert.equal(res.status, 202)
    assert.equal((await res.json()).publishFlipped, true)
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).state, 'running')
    assert.deepEqual(sent(host), { label: 'lantern', op: 'draft' })
    assert.equal(host.goLiveCalls().length, 1)
  }
)

// ── the host refuses, or does not answer ────────────────────────────────────────────────────────

test(
  'publishing is not set up on the host (501): the door says NOT_CONFIGURED, the operation reads failed, the site stays a draft',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup({
      goLive: () => Response.json({ code: 'NOT_CONFIGURED', accepted: false }, { status: 501 })
    })
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 501)
    assert.deepEqual(await res.json(), { code: 'NOT_CONFIGURED' })
    const read = await state(h, owner)
    assert.equal(read.publish, 'draft')
    assert.equal(read.operation.state, 'failed')
    assert.equal(read.operation.code, 'NOT_CONFIGURED')
    assert.equal(await count(pool, 'job'), 0, 'no job was started, so none is written')
    // Nothing holds the site: pressing again asks the host again.
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(host.goLiveCalls().length, 2)
  }
)

test(
  "the host refuses in its own words — a code its go-live door defines, on that code's status: the code and status are passed on, the operation fails, nothing is written for a job",
  opts,
  async () => {
    const { HOST_REFUSALS } = await store()
    assert.deepEqual(Object.keys(HOST_REFUSALS).sort(), [
      'BAD_REQUEST',
      'NOT_CONFIGURED',
      'NOT_FOUND',
      'ROUTING_TARGET_CHANGED'
    ])
    for (const [code, status] of Object.entries(HOST_REFUSALS)) {
      await db.reset()
      const { pool, host, h, owner } = await setup({
        goLive: () => Response.json({ code, why: 'refused label', accepted: false }, { status })
      })
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(res.status, status, code)
      assert.deepEqual(await res.json(), { code }, code)
      assert.equal((await opRow(pool)).state, 'failed', code)
      assert.equal((await opRow(pool)).code, code, code)
      assert.equal(await flag(pool), 'draft', code)
      assert.equal(await count(pool, 'job'), 0, code)
      // Ended: a read asks the host nothing more, and the next press is a new operation.
      await state(h, owner)
      assert.equal(host.goLiveCalls().length, 1, code)
    }
  }
)

/** Answers with a 4xx/5xx status that are NOT the host refusing in its own words. */
const UNVERIFIED_REFUSALS = {
  'an HTML 404 from something in between': () =>
    new Response('<html><h1>404 Not Found</h1></html>', {
      status: 404,
      headers: { 'content-type': 'text/html' }
    }),
  'an empty 403': () => new Response('', { status: 403 }),
  'an empty 404': () => new Response(null, { status: 404 }),
  'a JSON 403 with a code the host does not define': () =>
    Response.json({ code: 'BAD_SIGNATURE', why: 'stale' }, { status: 403 }),
  'a JSON 400 with an unknown code': () => Response.json({ code: 'NOPE' }, { status: 400 }),
  'a JSON 502 with an unknown code': () => Response.json({ code: 'FLEET_REFUSED' }, { status: 502 }),
  "a JSON 503 with another door's code": () => Response.json({ code: 'HOST_UPDATING' }, { status: 503 }),
  'a known code on a status the host never uses for it': () =>
    Response.json({ code: 'NOT_FOUND' }, { status: 502 }),
  'a 404 whose body is a list': () => Response.json([{ code: 'NOT_FOUND' }], { status: 404 }),
  'a 404 whose code is not a string': () => Response.json({ code: 404 }, { status: 404 }),
  'a 404 that is JSON null': () => Response.json(null, { status: 404 }),
  'a 400 with no code': () => Response.json({ why: 'refused label' }, { status: 400 }),
  // The host's own code on its own status, but not its word that the key was never taken.
  'a 404 NOT_FOUND that does not say whether the key was taken': () =>
    Response.json({ code: 'NOT_FOUND' }, { status: 404 }),
  'a 501 NOT_CONFIGURED that does not say whether the key was taken': () =>
    Response.json({ code: 'NOT_CONFIGURED' }, { status: 501 }),
  'a 404 NOT_FOUND for a key the host HAS taken': () =>
    Response.json({ code: 'NOT_FOUND', accepted: true, jobId: 'j-held' }, { status: 404 }),
  'a 501 NOT_CONFIGURED for a key the host HAS taken': () =>
    Response.json({ code: 'NOT_CONFIGURED', accepted: true, jobId: 'j-held' }, { status: 501 }),
  'a 400 whose `accepted` is the string "false"': () =>
    Response.json({ code: 'BAD_REQUEST', accepted: 'false' }, { status: 400 }),
  'a 404 whose `accepted` is null': () =>
    Response.json({ code: 'NOT_FOUND', accepted: null }, { status: 404 }),
  'a 404 whose `accepted` is 0': () => Response.json({ code: 'NOT_FOUND', accepted: 0 }, { status: 404 })
}

test(
  "a 4xx/5xx that is not the host's own refusal — HTML, an empty body, an unknown code, a known code on the wrong status — ends nothing: the first press stays unconfirmed and holds the site",
  opts,
  async () => {
    for (const [what, answer] of Object.entries(UNVERIFIED_REFUSALS)) {
      for (const op of ['live', 'draft']) {
        await db.reset()
        let refusing = true
        const { pool, host, h, owner } = await setup({
          goLive: () => (refusing ? answer() : Response.json({ jobId: 'golive-1' }, { status: 202 }))
        })
        if (op === 'draft')
          await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
        const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op })
        const where = `${what} / ${op}`
        assert.equal(res.status, 504, where)
        assert.equal((await res.json()).code, 'HOST_UNREACHABLE', where)
        let row = await opRow(pool)
        assert.equal(row.state, 'starting', `${where}: not failed`)
        assert.equal(row.code, 'HOST_UNREACHABLE', where)
        const ref = row.ref
        const read = await state(h, owner)
        assert.equal(read.operation.state, 'running', where)
        assert.equal(read.operation.confirmed, false, where)
        const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        assert.equal(again.status, 409, `${where}: the reservation is held`)
        assert.equal((await opRow(pool)).ref, ref, where)
        assert.deepEqual(host.keys().length, 1, `${where}: one key, asked again`)
        assert.ok(host.goLiveCalls().length >= 3, `${where}: every read and press asked again`)
        assert.equal(await count(pool, 'job'), 0, where)

        // The host itself answers at last: the same operation goes on as its job.
        refusing = false
        const back = await state(h, owner)
        assert.equal(back.operation.confirmed, true, where)
        row = await opRow(pool)
        assert.equal(row.state, 'running', where)
        assert.equal(row.ref, ref, where)
        assert.equal(row.job_id, 'golive-1', where)
      }
    }
  }
)

test(
  "after the host ACCEPTED the job, no refusal ends the operation — not an HTML 404, an empty 403 or an unknown code, and not even the host's own code: the script behind the job may be at work, so the site stays held until the job's own outcome",
  opts,
  async () => {
    const { HOST_REFUSALS } = await store()
    const answers = {
      ...UNVERIFIED_REFUSALS,
      ...Object.fromEntries(
        Object.entries(HOST_REFUSALS).map(([code, status]) => [
          `the host's own ${code}`,
          () => Response.json({ code, why: 'refused' }, { status })
        ])
      )
    }
    // What the poll of the job reads while the re-ask is being refused.
    const records = {
      'the job record is gone': () => undefined,
      'the record still reads running': () => ({ state: 'running', step: 'go-live:live' }),
      'the poll gets a gateway page': () => 502
    }
    for (const [what, answer] of Object.entries(answers)) {
      for (const [how, record] of Object.entries(records)) {
        await db.reset()
        let refusing = false
        const { pool, host, h, owner } = await setup({
          goLive: () => (refusing ? answer() : Response.json({ jobId: 'golive-1' }, { status: 202 }))
        })
        const first = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        assert.equal(first.status, 202)
        const ref = (await opRow(pool)).ref
        if (record() !== undefined) host.jobs['golive-1'] = record()
        refusing = true
        const where = `${what} / ${how}`
        for (let look = 0; look < 2; look++) {
          const read = await state(h, owner)
          assert.equal(read.operation?.state, 'running', `${where}: not failed`)
          assert.equal(read.operation.confirmed, false, where)
          assert.equal(read.publish, 'draft', where)
        }
        const row = await opRow(pool)
        assert.equal(row.state, 'running', where)
        assert.equal(row.ref, ref, where)
        assert.equal(row.job_id, 'golive-1', where)
        assert.equal(row.code, 'HOST_SILENT', where)
        assert.equal(row.detail, null, where)
        const press = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
        assert.equal(press.status, 409, `${where}: the reservation is held`)
        assert.equal((await press.json()).code, 'PUBLISH_BUSY', where)
        assert.equal(host.keys().length, 1, where)

        // The first script's own ending is what ends it.
        refusing = false
        host.jobs['golive-1'] = { state: 'done', step: 'go-live:live', exitCode: 0, output: said('live') }
        const ended = await state(h, owner)
        assert.equal(ended.operation, null, where)
        assert.equal(ended.publish, 'published', where)
      }
    }
  }
)

test(
  'back to draft refused by the host: the flag stays DOWN and the answer says it was flipped',
  opts,
  async () => {
    const { pool, h, owner } = await setup({
      goLive: () => Response.json({ code: 'NOT_FOUND', accepted: false }, { status: 404 })
    })
    await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { code: 'NOT_FOUND', publishFlipped: true })
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).state, 'failed')
  }
)

const NO_ANSWER = [
  ['the connection fails', () => Promise.reject(new TypeError('fetch failed'))],
  ['a page from something in between', () => new Response('<html>502</html>', { status: 502 })],
  ['an empty 200', () => new Response('', { status: 200 })],
  ['a 200 that is not JSON', () => new Response('<html>ok</html>', { status: 200 })],
  ['a 202 with no job id', () => Response.json({ ok: true }, { status: 202 })],
  ['a job id that is not a string', () => Response.json({ jobId: 7 }, { status: 202 })],
  ['a job id that is a path', () => Response.json({ jobId: '../../etc' }, { status: 202 })]
]

test(
  'no answer from the host: nothing is called a success or a failure — the site stays reserved for as long as the host stays silent, and no second operation starts',
  opts,
  async () => {
    for (const [what, goLive] of NO_ANSWER) {
      await db.reset()
      const { pool, host, h, owner } = await setup({ goLive })
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(res.status, 504, what)
      assert.deepEqual(await res.json(), { code: 'HOST_UNREACHABLE' }, what)
      assert.equal(await flag(pool), 'draft', what)
      assert.equal(await count(pool, 'job'), 0, what)
      const key = host.goLiveCalls()[0].body.jobKey
      const reservedAt = (await opRow(pool)).started_at

      // A day later, a week later: time alone frees nothing. Every look asks the host again, under
      // the SAME key — so a host that did take the job answers that job, and starts no other.
      for (const age of ['1 day', '7 days']) {
        await pool.query(
          `update site_publish_op set updated_at = now() - interval '${age}' where site_key = $1`,
          [SITE]
        )
        const held = await state(h, owner)
        assert.equal(held.operation.state, 'running', `${what}: it may be running on the host`)
        assert.equal(held.operation.confirmed, false, what)
        assert.equal(held.publish, 'draft', what)
        const second = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
        assert.equal(second.status, 409, what)
        assert.equal((await second.json()).code, 'PUBLISH_BUSY', what)
      }
      const row = await opRow(pool)
      assert.equal(row.state, 'starting', what)
      assert.equal(row.op, 'live', `${what}: the other direction did not take the row`)
      assert.equal(row.started_at.getTime(), reservedAt.getTime(), `${what}: the same reservation`)
      assert.ok(host.goLiveCalls().length > 1, `${what}: the host was asked again`)
      assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.jobKey))], [key], what)
      assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.op))], ['live'], what)
      assert.equal(await count(pool, 'job'), 0, what)
    }
  }
)

test(
  'the answer that never arrived is found by asking again: the host names the job it took, and the operation goes on as that job',
  opts,
  async () => {
    // The host took the first ask (job `taken-1`) but its answer was lost on the way back.
    let lost = true
    const taken = new Map()
    const { pool, host, h, owner } = await setup({
      goLive: (payload) => {
        const first = !taken.has(payload.jobKey)
        if (first) taken.set(payload.jobKey, 'taken-1')
        if (lost) return Promise.reject(new TypeError('fetch failed'))
        return Response.json(
          { jobId: taken.get(payload.jobKey), ...(first ? {} : { reused: true }) },
          { status: 202 }
        )
      }
    })
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 504)
    assert.equal((await state(h, owner)).operation.confirmed, false)

    lost = false
    host.jobs['taken-1'] = { state: 'running', step: 'go-live:live' }
    const found = await state(h, owner)
    assert.equal(found.operation.state, 'running')
    assert.equal(found.operation.confirmed, true)
    assert.equal(found.operation.jobId, 'taken-1')
    assert.equal(taken.size, 1, 'one key, one job: nothing was started twice')
    assert.equal(await count(pool, 'job'), 1)
    assert.equal(await count(pool, 'site_job_follow_up'), 1)

    host.jobs['taken-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
    const done = await state(h, owner)
    assert.equal(done.publish, 'published')
    assert.equal(done.operation, null)
  }
)

test(
  'an unconfirmed operation ends only on a refusal that says the host never took its key: without that word it holds; with it, it ends failed and the next press is a new operation with a new key',
  opts,
  async () => {
    let answer = () => Promise.reject(new TypeError('fetch failed'))
    const { pool, host, h, owner } = await setup({ goLive: (payload, n) => answer(payload, n) })
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    // A refusal that does not say the key was never taken ends nothing: the 202 may have been lost.
    answer = () => Response.json({ code: 'NOT_FOUND' }, { status: 404 })
    assert.equal((await state(h, owner)).operation.state, 'running')
    answer = () => Response.json({ code: 'NOT_FOUND', accepted: true, jobId: 'j-held' }, { status: 404 })
    assert.equal((await state(h, owner)).operation.state, 'running')
    assert.equal((await opRow(pool)).state, 'starting')
    answer = () => Response.json({ code: 'NOT_FOUND', accepted: false }, { status: 404 })
    const read = await state(h, owner)
    assert.equal(read.operation.state, 'failed')
    assert.equal(read.operation.code, 'NOT_FOUND')
    assert.equal(read.publish, 'draft')

    answer = (payload, n) => Response.json({ jobId: `fresh-${n}` }, { status: 202 })
    const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(again.status, 202)
    const keys = host.goLiveCalls().map((call) => call.body.jobKey)
    assert.notEqual(keys.at(-1), keys[0], 'a new operation is not the old one asked again')
    assert.equal((await opRow(pool)).state, 'running')
  }
)

test(
  'a door that died after reserving: the very next look hands the reservation to the host under its key — a second after it was taken or a month after',
  opts,
  async () => {
    const { reservePublishOp } = await store()
    for (const age of ['0 seconds', '5 seconds', '2 minutes', '30 days']) {
      await db.reset()
      const { pool, host, h, owner } = await setup()
      // What a door leaves behind when its process ends between the reservation and the host's answer.
      const reserved = await reservePublishOp(pool, { siteKey: SITE, op: 'live', actor: 'owner@x.y' })
      await pool.query(
        `update site_publish_op set started_at = now() - interval '${age}', updated_at = now() - interval '${age}'`
      )
      const read = await state(h, owner)
      assert.equal(host.goLiveCalls().length, 1, `${age}: asked on the first read, no grace`)
      assert.equal(host.goLiveCalls()[0].body.jobKey, `publish:${reserved.ref}`, age)
      assert.equal(read.operation.state, 'running', age)
      assert.equal(read.operation.confirmed, true, age)
      assert.equal(read.operation.jobId, 'golive-1', age)
      assert.equal((await opRow(pool)).actor, 'owner@x.y', age)
      const busy = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(busy.status, 409, age)
      assert.deepEqual(host.keys(), [`publish:${reserved.ref}`], age)
      assert.equal(host.keyed.size, 1, `${age}: one job on the host`)
    }
  }
)

test(
  'back to draft with no answer from the host: the site is covered at once, and stays covered',
  opts,
  async () => {
    const { pool, h, owner } = await setup({ goLive: () => Promise.reject(new TypeError('fetch failed')) })
    await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(res.status, 504)
    assert.deepEqual(await res.json(), { code: 'HOST_UNREACHABLE', publishFlipped: true })
    assert.equal(await flag(pool), 'draft')
  }
)

test(
  'a host this process cannot sign for says nothing about the operation: unconfirmed and held, never failed — another process may have handed it over',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await pool.query("update site set host = 'elsewhere' where site_key = $1", [SITE])
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 504)
    assert.equal((await res.json()).code, 'HOST_UNREACHABLE')
    assert.equal((await opRow(pool)).state, 'starting')
    assert.equal(host.goLiveCalls().length, 0, 'nothing is sent unsigned')
    const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(again.status, 409)
    // Known again: the same reservation is handed over.
    await pool.query("update site set host = 'local' where site_key = $1", [SITE])
    const read = await state(h, owner)
    assert.equal(read.operation.confirmed, true)
    assert.equal(host.keyed.size, 1)
  }
)

// ── one operation at a time ─────────────────────────────────────────────────────────────────────

test(
  'a double click, a second tab: two presses at once start ONE job; the other is told PUBLISH_BUSY with the state to show',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const press = () => h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    const answers = await Promise.all([press(), press(), press(), press()])
    const statuses = answers.map((res) => res.status).sort()
    assert.deepEqual(statuses, [202, 409, 409, 409])
    // The presses that lost may each have asked the host about the winner's operation: one key,
    // one job on the host, nothing started beside it.
    assert.equal(host.keys().length, 1)
    assert.equal(host.keyed.size, 1)
    assert.deepEqual(host.reruns, [])
    assert.equal(await count(pool, 'job'), 1)
    assert.equal(await count(pool, 'site_publish_op'), 1)
    const refused = await answers.find((res) => res.status === 409).json()
    assert.equal(refused.code, 'PUBLISH_BUSY')
    assert.equal(refused.operation.state, 'running')
    assert.equal(refused.publish, 'draft')
  }
)

test(
  'while a job runs, nothing else moves the flag: not a second publish, not the other direction',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    host.jobs['golive-1'] = { state: 'running', step: 'go-live:live' }
    for (const body of [{ op: 'live' }, { op: 'draft' }]) {
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, body)
      assert.equal(res.status, 409, JSON.stringify(body))
      assert.equal((await res.json()).code, 'PUBLISH_BUSY')
    }
    assert.equal(host.keys().length, 1)
    assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.op))], ['live'])
    assert.equal(host.keyed.size, 1)
    assert.deepEqual(host.reruns, [])
    assert.equal(await flag(pool), 'draft')
    // The plan is not the flag: it may still be changed.
    const plan = await h.send('POST', `/api/sites/${SITE}/state`, owner, { plan: 'plus' })
    assert.equal(plan.status, 200)
    assert.deepEqual(await plan.json(), { ok: true, plan: 'plus' })
  }
)

test(
  'the state door never moves the publish flag — idle, mid-publish, live, or raced against a publish: only go-live does',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const statePost = (body) => h.send('POST', `/api/sites/${SITE}/state`, owner, body)
    const refusedAll = async (when) => {
      for (const body of [
        { publish: 'published' },
        { publish: 'draft' },
        { publish: 'published', plan: 'plus' },
        { publish: null },
        { publish: 'nonsense' }
      ]) {
        const res = await statePost(body)
        assert.equal(res.status, 409, `${when} ${JSON.stringify(body)}`)
        assert.deepEqual(await res.json(), { code: 'PUBLISH_BY_GO_LIVE' }, when)
      }
    }
    // Idle: no operation on record, nothing running. This was the way round the host.
    await refusedAll('idle')
    assert.equal(await flag(pool), 'draft')
    assert.equal(await opRow(pool), null)
    assert.equal(host.calls.length, 0)
    const site0 = (await pool.query('select plan from site where site_key = $1', [SITE])).rows[0]
    assert.notEqual(site0.plan, 'plus', 'a refused body changed nothing, the plan it carried included')

    // Raced against a publish: whichever lands first, the flag is the operation's alone.
    const [live, ...writes] = await Promise.all([
      h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' }),
      statePost({ publish: 'published' }),
      statePost({ publish: 'published' }),
      statePost({ publish: 'draft' })
    ])
    assert.equal(live.status, 202)
    assert.deepEqual(
      writes.map((res) => res.status),
      [409, 409, 409]
    )
    assert.equal(await flag(pool), 'draft', 'the host has not said done')
    await refusedAll('mid-publish')

    host.jobs['golive-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
    assert.equal((await state(h, owner)).publish, 'published')
    // Live: it is not covered again through this door either — its domains would stay in the ingress.
    await refusedAll('live')
    assert.equal(await flag(pool), 'published')
    assert.equal(
      (await pool.query("select count(*)::int as n from audit where action = 'site.state'")).rows[0].n,
      0
    )

    // Bodies that are not an object at all, and one that asks for nothing.
    for (const raw of ['', 'null', '[]', '"published"', '{}', '{"plan":"nonsense"}']) {
      const res = await h.send('POST', `/api/sites/${SITE}/state`, owner, undefined, raw)
      assert.equal(res.status, 400, raw)
      assert.equal((await res.json()).code, 'INVALID_REQUEST', raw)
    }
  }
)

test(
  'the state door reads every key before it writes: a valid plan beside a field it does not have is refused whole, and nothing is changed',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const planOf = async () =>
      (await pool.query('select plan from site where site_key = $1', [SITE])).rows[0].plan
    const audits = async () =>
      (await pool.query("select count(*)::int as n from audit where action = 'site.state'")).rows[0].n
    const before = await planOf()
    assert.notEqual(before, 'plus')
    for (const body of [
      { plan: 'plus', unexpected: true },
      { unexpected: true, plan: 'plus' },
      { plan: 'plus', origin: 'fleet_born' },
      { plan: 'plus', plans: {} },
      { plan: 'plus', op: 'live' },
      { plan: 'plus', domains: [] },
      { plan: 'plus', __proto__: null, constructor: 1 },
      { plan: 'plus', '': 1 },
      { unexpected: true }
    ]) {
      const res = await h.send('POST', `/api/sites/${SITE}/state`, owner, body)
      assert.equal(res.status, 400, JSON.stringify(body))
      const refusal = await res.json()
      assert.equal(refusal.code, 'INVALID_REQUEST', JSON.stringify(body))
      assert.match(refusal.reason, /^unknown field: /, JSON.stringify(body))
      assert.equal(await planOf(), before, `${JSON.stringify(body)}: the plan beside it was not written`)
    }
    assert.equal(await audits(), 0)
    assert.equal(host.calls.length, 0)
    // The plan alone is still taken.
    const alone = await h.send('POST', `/api/sites/${SITE}/state`, owner, { plan: 'plus' })
    assert.equal(alone.status, 200)
    assert.equal(await planOf(), 'plus')
    assert.equal(await audits(), 1)
  }
)

test(
  'a job the host calls done without the closing line of its script is not believed: the flag stays down, in either direction',
  opts,
  async () => {
    for (const output of [
      '',
      '==> mail egress: OPEN\n==> noindex: off',
      // The other direction's line, and the line inside a longer word.
      'TRACY_RESULT go_live=draft label=lantern platform=wordpress',
      'TRACY_RESULT go_live=livestock label=lantern platform=wordpress',
      'x TRACY_RESULT go_live=live label=lantern platform=wordpress',
      // The line of ANOTHER site — a longer label that starts with this one, or just another one —
      // and a line that names no site at all: not this operation's ending.
      'TRACY_RESULT go_live=live label=lantern2 platform=wordpress',
      'TRACY_RESULT go_live=live label=harbor platform=wordpress',
      'TRACY_RESULT go_live=live',
      'TRACY_RESULT go_live=live platform=wordpress label=lantern'
    ]) {
      await db.reset()
      const { pool, host, h, owner } = await setup()
      await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      host.jobs['golive-1'] = { state: 'done', step: 'go-live:live', exitCode: 0, output }
      const read = await state(h, owner)
      assert.equal(read.publish, 'draft', JSON.stringify(output))
      assert.equal(read.operation.state, 'failed', JSON.stringify(output))
      assert.equal(read.operation.code, 'JOB_NO_RESULT', JSON.stringify(output))
      assert.equal(await flag(pool), 'draft')
    }
    // Missing `output` altogether, heard by the sweep.
    await db.reset()
    const { pool, h, owner } = await setup()
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    // The row is due by the database's clock; the sweep is given that clock, not this machine's.
    const at = await dbNow(pool)
    await settleFollowUps(pool, {
      pollJob: async () => ({
        ok: true,
        status: 200,
        body: { state: 'done', exitCode: 0, step: 'go-live:live' }
      }),
      now: () => at,
      log: { info() {}, warn() {} }
    })
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).code, 'JOB_NO_RESULT')
  }
)

// ── endings heard late, twice, or by the sweep ──────────────────────────────────────────────────

test('an ending is applied once, and only to the operation it belongs to', opts, async () => {
  const { pool, host, h, owner } = await setup()
  await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
  host.jobs['golive-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
  await state(h, owner)
  assert.equal(await flag(pool), 'published')
  // Back to draft, then the first job's ending is heard AGAIN: the site must not reopen.
  await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
  assert.equal(
    await followThrough(pool, 'golive-1', 'go-live', {
      state: 'done',
      outcome: 'done',
      output: said('live')
    }),
    null
  )
  assert.equal(await flag(pool), 'draft')
  assert.equal((await opRow(pool)).job_id, 'golive-2')
})

test('nobody on the screen: the follow-up sweep hears the ending and raises the flag', opts, async () => {
  const { pool, h, owner } = await setup()
  await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
  const asked = []
  // The row is due by the database's clock; the sweep is given that clock, not this machine's.
  const at = await dbNow(pool)
  const swept = await settleFollowUps(pool, {
    pollJob: async ({ host, jobId }) => {
      asked.push([host, jobId])
      return {
        ok: true,
        status: 200,
        body: { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
      }
    },
    now: () => at,
    log: { info() {}, warn() {} }
  })
  assert.deepEqual(asked, [['local', 'golive-1']])
  assert.equal(swept.settled, 1)
  assert.equal(await flag(pool), 'published')
  assert.equal((await opRow(pool)).state, 'done')
  assert.equal((await pool.query("select state from job where id = 'golive-1'")).rows[0].state, 'done')
})

test(
  'the sweep on a job still running leaves the site a draft and asks again later; on a failed one it closes the operation failed',
  opts,
  async () => {
    const { pool, h, owner } = await setup()
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    let answer = { state: 'running', step: 'go-live:live' }
    const base = await dbNow(pool)
    const sweep = () =>
      settleFollowUps(pool, {
        pollJob: async () => ({ ok: true, status: 200, body: answer }),
        now: () => base + 60 * 60_000,
        log: { info() {}, warn() {} }
      })
    assert.equal((await sweep()).settled, 0)
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).state, 'running')
    answer = { state: 'failed', exitCode: 1, step: 'go-live:live', output: 'boom' }
    await pool.query("update site_job_follow_up set next_at = now() - interval '1 minute'")
    assert.equal((await sweep()).settled, 1)
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).state, 'failed')
    assert.equal((await opRow(pool)).code, 'JOB_FAILED')
  }
)

test(
  'a day of silence about a running job: the follow-up book does NOT give its row up, the operation does NOT end — the site stays held, and still asked about, until the host itself says how the job ended',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    host.jobs['golive-1'] = 502
    const base = await dbNow(pool)
    const swept = await settleFollowUps(pool, {
      pollJob: async () => ({ ok: false, status: 0, body: null }),
      now: () => base + 25 * 60 * 60_000,
      log: { info() {}, warn() {} }
    })
    // A publish holds its site until the host says how it went: what the book owes it is never
    // dropped by a clock (it used to be, after a day — and then nothing asked for it any more).
    assert.equal(swept.expired, 0, 'a clock drops nothing that a publish is owed')
    assert.equal(await count(pool, 'site_job_follow_up'), 1, 'the row is still owed, to be asked about again')
    const again = await settleFollowUps(pool, {
      pollJob: async () => ({ ok: false, status: 0, body: null }),
      now: () => base + 40 * 24 * 60 * 60_000,
      log: { info() {}, warn() {} }
    })
    assert.equal(again.expired, 0, 'nor after forty days')
    assert.equal(await count(pool, 'site_job_follow_up'), 1)
    const row = await opRow(pool)
    assert.equal(row.state, 'running', 'a clock is not an ending')
    assert.equal(row.code, null)
    assert.equal(await flag(pool), 'draft')
    // Still one operation at a time, a day later.
    const second = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(second.status, 409)
    assert.equal((await second.json()).code, 'PUBLISH_BUSY')
    assert.equal(host.keys().length, 1)
    assert.deepEqual(host.reruns, [], 'the host still has the job: asked again, started nothing')
    assert.equal((await state(h, owner)).operation.state, 'running')

    // The host answers at last: the read ends the operation on that answer, with nothing owed in the book.
    host.jobs['golive-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
    const done = await state(h, owner)
    assert.equal(done.publish, 'published')
    assert.equal(done.operation, null)
    assert.equal(
      (await pool.query("select count(*)::int as n from audit where action = 'site.go-live'")).rows[0].n,
      1
    )
    // Heard twice: nothing more happens.
    await state(h, owner)
    assert.equal(
      (await pool.query("select count(*)::int as n from audit where action = 'site.go-live'")).rows[0].n,
      1
    )
  }
)

test(
  'a poll the host cannot answer — unreachable, a gateway page, a state nobody knows — changes nothing',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    for (const answer of [502, { state: 'finished' }, { nothing: true }, { state: 'queued' }]) {
      host.jobs['golive-1'] = answer
      const read = await state(h, owner)
      assert.equal(read.operation.state, 'running', JSON.stringify(answer))
      assert.equal(read.publish, 'draft')
    }
    assert.equal((await opRow(pool)).state, 'running')
  }
)

test(
  'GET /jobs/:id on a go-live job ends the publish and runs NONE of a provision handover',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await pool.query(
      "update site set address = 'http://lantern.localhost:8080/', attached = false where site_key = $1",
      [SITE]
    )
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    // `port` is what a provision's answer carries; on a go-live job it must not be read as one.
    host.jobs['golive-1'] = {
      state: 'done',
      exitCode: 0,
      step: 'go-live:live',
      port: 8123,
      output: said('live')
    }
    const before = host.calls.length
    const res = await h.get(`/api/sites/${SITE}/jobs/golive-1`, owner)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { kind: 'go-live', state: 'done', step: 'go-live:live' })
    const row = (
      await pool.query('select publish, port, attached, address from site where site_key = $1', [SITE])
    ).rows[0]
    assert.deepEqual(row, {
      publish: 'published',
      port: null,
      attached: false,
      address: 'http://lantern.localhost:8080/'
    })
    const asked = host.calls.slice(before).map((call) => call.path)
    assert.deepEqual(asked, ['/_host/jobs/golive-1'], 'no attach, no pairing, no repo')
  }
)

// ── who may press ───────────────────────────────────────────────────────────────────────────────

test(
  'roles (ADR 0028): Owner and Editor publish and unpublish; a Viewer is refused before the host hears of it, and the state says so',
  opts,
  async () => {
    const { pool, host, h } = await setup()
    for (const role of ['editor', 'viewer']) await seat(pool, SITE, `${role}@x.y`, role)
    for (const role of ['viewer']) {
      const cookie = await h.cookieFor(`${role}@x.y`)
      for (const op of ['live', 'draft']) {
        const res = await h.send('POST', `/api/sites/${SITE}/go-live`, cookie, { op })
        assert.equal(res.status, 403, `${role} ${op}`)
        assert.equal((await res.json()).code, 'NOT_SITE_EDITOR')
      }
      const flip = await h.send('POST', `/api/sites/${SITE}/state`, cookie, { publish: 'published' })
      assert.equal(flip.status, 403, role)
      const read = await state(h, cookie)
      assert.equal(read.mayPublish, false, role)
      assert.equal(read.publish, 'draft', `${role} still reads the state`)
    }
    assert.equal(host.goLiveCalls().length, 0)
    assert.equal(await opRow(pool), null)

    const editor = await h.cookieFor('editor@x.y')
    assert.equal((await state(h, editor)).mayPublish, true)
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, editor, { op: 'live' })
    assert.equal(res.status, 202)
    host.jobs['golive-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
    assert.equal((await state(h, editor)).publish, 'published')
    const back = await h.send('POST', `/api/sites/${SITE}/go-live`, editor, { op: 'draft' })
    assert.equal(back.status, 202)
  }
)

test(
  "nobody signed in, a seat not yet accepted, a revoked seat, a stranger, another workspace's site, a site that does not exist: refused, and nothing is touched",
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    await site(pool, 'harbor.localhost', 'harbor', 'other@x.y')
    await seat(pool, SITE, 'invited@x.y', 'editor', 'invited')
    await seat(pool, SITE, 'revoked@x.y', 'editor', 'revoked')
    await account(pool, 'stranger@x.y')
    const cases = [
      ['nobody', null, SITE, 401, 'NOT_SIGNED_IN'],
      ['invited editor', await h.cookieFor('invited@x.y'), SITE, 403, 'SEAT_NOT_AUTHORIZED'],
      ['revoked editor', await h.cookieFor('revoked@x.y'), SITE, 403, 'SEAT_NOT_AUTHORIZED'],
      ['stranger', await h.cookieFor('stranger@x.y'), SITE, 403, 'SEAT_NOT_AUTHORIZED'],
      ["another workspace's site", owner, 'harbor.localhost', 403, 'SEAT_NOT_AUTHORIZED'],
      ['unknown site', owner, 'nowhere.localhost', 403, 'SEAT_NOT_AUTHORIZED']
    ]
    for (const [who, cookie, key, status, code] of cases) {
      for (const [method, path, body] of [
        ['POST', 'go-live', { op: 'live' }],
        ['POST', 'go-live', { op: 'draft' }],
        ['POST', 'state', { publish: 'published' }],
        ['GET', 'state', undefined]
      ]) {
        const res = await h.send(method, `/api/sites/${key}/${path}`, cookie, body)
        assert.equal(res.status, status, `${who} ${method} ${path}`)
        assert.equal((await res.json()).code, code, `${who} ${method} ${path}`)
      }
    }
    assert.equal(host.calls.length, 0)
    assert.equal((await pool.query('select count(*)::int as n from site_publish_op')).rows[0].n, 0)
    assert.equal(await flag(pool, 'harbor.localhost'), 'draft')
  }
)

test("a job of another site cannot be read through this site's door", opts, async () => {
  const { pool, host, h, owner } = await setup()
  await site(pool, 'harbor.localhost', 'harbor', 'other@x.y')
  const other = await h.cookieFor('other@x.y')
  await h.send('POST', '/api/sites/harbor.localhost/go-live', other, { op: 'live' })
  host.jobs['golive-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
  const res = await h.get(`/api/sites/${SITE}/jobs/golive-1`, owner)
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'JOB_NOT_YOURS')
  assert.equal(await flag(pool, 'harbor.localhost'), 'draft', 'and the read ended nothing')
})

// ── the body ────────────────────────────────────────────────────────────────────────────────────

test(
  'a body the door cannot read is refused before the host is asked or the site reserved',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const path = `/api/sites/${SITE}/go-live`
    const raws = ['', '{"op":', 'null', '[]', '"live"', '7']
    for (const raw of raws) {
      const res = await h.send('POST', path, owner, undefined, raw)
      assert.equal(res.status, 400, JSON.stringify(raw))
      assert.equal((await res.json()).code, 'INVALID_REQUEST', JSON.stringify(raw))
    }
    const bodies = [
      {},
      { op: 'liv' },
      { op: 'LIVE' },
      { op: ['live'] },
      { op: 'live', force: true },
      { op: 'draft', jobKey: 'publish:0123456789abcdef' },
      { op: 'live', label: 'harbor' }
    ]
    for (const body of bodies) {
      const res = await h.send('POST', path, owner, body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal((await res.json()).code, 'INVALID_REQUEST', JSON.stringify(body))
    }
    assert.equal(host.calls.length, 0)
    assert.equal(await opRow(pool), null)
  }
)

test(
  'a request that carries `domains` is refused by name — whatever the field holds, in either direction, live or not — and nothing reaches the host',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const path = `/api/sites/${SITE}/go-live`
    const carried = [
      [],
      null,
      'acmestudio.com',
      7,
      false,
      { 0: 'acmestudio.com' },
      ['acmestudio.com'],
      ['acmestudio.com', 'www.acmestudio.com'],
      [null],
      [['acmestudio.com']],
      Array.from({ length: 11 }, (_, i) => `d${i}.example.com`)
    ]
    for (const op of ['live', 'draft', 'nonsense', undefined]) {
      for (const domains of carried) {
        const res = await h.send('POST', path, owner, { ...(op ? { op } : {}), domains })
        assert.equal(res.status, 400, `${op} ${JSON.stringify(domains)}`)
        assert.deepEqual(
          await res.json(),
          { code: 'DOMAINS_NOT_SUPPORTED' },
          `${op} ${JSON.stringify(domains)}`
        )
      }
    }
    assert.equal(host.calls.length, 0, 'the host heard of none of them')
    assert.equal(await opRow(pool), null, 'and the site was never reserved')
    assert.equal(await flag(pool), 'draft')

    // The same on a live site: the refusal does not cover it, and the next plain press still works.
    await h.send('POST', path, owner, { op: 'live' })
    host.jobs['golive-1'] = { state: 'done', exitCode: 0, output: said('live') }
    assert.equal((await state(h, owner)).publish, 'published')
    const res = await h.send('POST', path, owner, { op: 'draft', domains: [] })
    assert.equal(res.status, 400)
    assert.equal(await flag(pool), 'published', 'a refused draft did not drop the flag')
    assert.equal(host.goLiveCalls().length, 1)
    // A Viewer who sends it is told who may publish first: the role is checked before the body.
    await seat(pool, SITE, 'viewer@x.y', 'viewer')
    const viewer = await h.cookieFor('viewer@x.y')
    assert.equal((await h.send('POST', path, viewer, { op: 'live', domains: [] })).status, 403)
  }
)

// ── a job the host can no longer answer for ─────────────────────────────────────────────────────

/** The host's records that end a job without saying what its script did. */
const NO_OUTCOME = {
  'no record of the job': () => undefined,
  'failed by a restart': () => ({
    state: 'failed',
    step: 'go-live:live',
    orphanedAt: 1_790_000_000_000,
    detail: 'tracy-host restarted before this job finished (was running at "go-live:live")'
  }),
  'ended on the lock of an earlier run': () => ({
    state: 'failed',
    step: 'go-live:live',
    exitCode: 75,
    busy: true,
    output: '!! another go-live of lantern is running — nothing was changed'
  }),
  // The run threw (its log could not be written) with the script still at work: no exit code.
  'failed with no exit code': () => ({
    state: 'failed',
    step: 'go-live:live',
    exitCode: null,
    unobserved: true,
    detail: "ENOSPC: no space left on device, open 'go-live-lantern.log'"
  }),
  // The write of `done` failed and a later write of `failed` went through: still no exit code.
  'failed after the ending could not be written': () => ({
    state: 'failed',
    step: 'go-live:live',
    detail: 'EIO: job store'
  }),
  'done with no exit code': () => ({
    state: 'done',
    step: 'go-live:live',
    output: 'TRACY_RESULT go_live=live label=lantern platform=wordpress'
  }),
  'done with a non-zero exit code': () => ({
    state: 'done',
    step: 'go-live:live',
    exitCode: 1,
    output: 'TRACY_RESULT go_live=live label=lantern platform=wordpress'
  })
}

test(
  'a job the host has no record of, failed because the host restarted, or ended on the site lock is NOT an ending: the host is asked for the SAME operation again and the operation goes on as that job',
  opts,
  async () => {
    for (const [what, record] of Object.entries(NO_OUTCOME)) {
      for (const op of ['live', 'draft']) {
        await db.reset()
        const { pool, host, h, owner } = await setup()
        if (op === 'draft')
          await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
        await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op })
        const key = host.goLiveCalls()[0].body.jobKey
        const ref = (await opRow(pool)).ref
        if (record() === undefined) delete host.jobs['golive-1']
        else host.jobs['golive-1'] = record()

        const read = await state(h, owner)
        assert.equal(read.operation?.state, 'running', `${what} ${op}: never "failed" from absence`)
        assert.equal(read.operation.op, op)
        assert.equal(read.operation.confirmed, true, `${what} ${op}: the host has the job again`)
        assert.deepEqual(host.reruns, ['golive-1'], `${what} ${op}: started again under the same key`)
        assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.jobKey))], [key], what)
        assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.op))], [op], what)
        let row = await opRow(pool)
        assert.equal(row.state, 'running', what)
        assert.equal(row.ref, ref, `${what}: the same reservation`)
        assert.equal(row.code, null, what)
        assert.equal(await count(pool, 'site_job_follow_up'), 1, `${what}: the ending is owed again`)
        assert.equal(
          (await pool.query("select state from job where id = 'golive-1'")).rows[0].state,
          'queued'
        )
        assert.equal(await flag(pool), 'draft', `${what} ${op}: live not raised, draft already covered`)
        // It still holds the site: no second operation beside it, in either direction.
        for (const next of ['live', 'draft']) {
          const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: next })
          assert.equal(again.status, 409, `${what} ${op} → ${next}`)
          assert.equal((await again.json()).code, 'PUBLISH_BUSY', `${what} ${op} → ${next}`)
        }

        // The run that was started again ends, and THAT is the operation's ending.
        host.jobs['golive-1'] = { state: 'done', step: `go-live:${op}`, exitCode: 0, output: said(op) }
        const ended = await state(h, owner)
        assert.equal(ended.operation, null, `${what} ${op}`)
        assert.equal(ended.publish, op === 'live' ? 'published' : 'draft', `${what} ${op}`)
        row = await opRow(pool)
        assert.equal(row.state, 'done', what)
        assert.equal(
          (await pool.query("select count(*)::int as n from audit where action = 'site.go-live'")).rows[0].n,
          1,
          `${what} ${op}: one ending, one audit line`
        )
      }
    }
  }
)

test(
  'while the host cannot take the operation back — silent, a gateway page, or "still busy" — the site stays held, whatever the age, and is asked for again under the same key on every read',
  opts,
  async () => {
    const silences = {
      'the connection fails': () => Promise.reject(new TypeError('fetch failed')),
      'a page from something in between': () => new Response('<html>502</html>', { status: 502 }),
      'a 202 with no job id': () => Response.json({ ok: true }, { status: 202 }),
      'GO_LIVE_BUSY: an earlier job of the site still holds it': () =>
        Response.json({ code: 'GO_LIVE_BUSY', jobId: 'earlier-1', op: 'live' }, { status: 409 }),
      SITE_BUSY: () => Response.json({ code: 'SITE_BUSY' }, { status: 409 })
    }
    for (const [what, record] of Object.entries(NO_OUTCOME)) {
      for (const [silence, answer] of Object.entries(silences)) {
        await db.reset()
        let quiet = false
        const jobs = {}
        const { pool, host, h, owner } = await setup({
          goLive: (payload, n) => {
            if (quiet) return answer()
            jobs.key = payload.jobKey
            return Response.json({ jobId: `golive-${n}` }, { status: 202 })
          }
        })
        await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        const ref = (await opRow(pool)).ref
        if (record() !== undefined) host.jobs['golive-1'] = record()
        quiet = true
        const where = `${what} / ${silence}`
        for (const age of ['0 seconds', '1 day', '30 days']) {
          await pool.query(
            `update site_publish_op set started_at = now() - interval '${age}', updated_at = now() - interval '${age}'`
          )
          const read = await state(h, owner)
          assert.equal(read.operation?.state, 'running', `${where} after ${age}`)
          assert.equal(read.operation.confirmed, false, `${where}: said as not confirmed`)
          assert.equal(read.publish, 'draft', where)
          const row = await opRow(pool)
          assert.equal(row.state, 'running', where)
          assert.equal(row.ref, ref, where)
          assert.equal(row.code, 'HOST_SILENT', where)
          const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
          assert.equal(again.status, 409, where)
          assert.equal((await again.json()).code, 'PUBLISH_BUSY', where)
        }
        assert.ok(host.goLiveCalls().length >= 4, `${where}: asked again on every read`)
        assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.jobKey))], [jobs.key], where)
        assert.deepEqual([...new Set(host.goLiveCalls().map((call) => call.body.op))], ['live'], where)
        assert.equal(await flag(pool), 'draft', where)

        // The host comes back and takes the operation under that key: it goes on, confirmed.
        quiet = false
        host.jobs['golive-1'] = { state: 'running', step: 'go-live:live' }
        const back = await state(h, owner)
        assert.equal(back.operation.state, 'running', where)
        assert.equal(back.operation.confirmed, true, where)
        assert.equal((await opRow(pool)).code, null, where)
      }
    }
  }
)

test(
  'the host says another job holds this site when a publish is pressed: "still busy" is not an outcome — nothing fails, the site stays reserved, and the same key is asked again until the host takes it',
  opts,
  async () => {
    for (const code of ['GO_LIVE_BUSY', 'SITE_BUSY']) {
      await db.reset()
      let busy = true
      const { pool, host, h, owner } = await setup({
        goLive: () =>
          busy
            ? Response.json({ code, jobId: 'earlier-1', op: 'draft' }, { status: 409 })
            : Response.json({ jobId: 'golive-9' }, { status: 202 })
      })
      const pressed = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(pressed.status, 504, code)
      assert.deepEqual(await pressed.json(), { code: 'HOST_UNREACHABLE' }, code)
      let row = await opRow(pool)
      assert.equal(row.state, 'starting', `${code}: not failed`)
      assert.equal(row.job_id, null, `${code}: the other job is not taken over`)
      assert.equal(await count(pool, 'job'), 0, code)
      const held = await state(h, owner)
      assert.equal(held.operation.state, 'running', code)
      assert.equal(held.operation.confirmed, false, code)
      assert.equal((await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).status, 409)
      busy = false
      const taken = await state(h, owner)
      assert.equal(taken.operation.confirmed, true, code)
      row = await opRow(pool)
      assert.equal(row.state, 'running', code)
      assert.equal(row.job_id, 'golive-9', code)
      assert.equal(new Set(host.goLiveCalls().map((call) => call.body.jobKey)).size, 1, code)
    }
  }
)

// ── the web door against the REAL `tracy-host` go-live door ─────────────────────────────────────
//
// `buildApp` of `apps/tracy-host` behind the web app's `fetchImpl`: calls are really signed and
// really verified, the host's own in-memory guard, its acceptance mark and its job record decide what
// a repeated key does. `run` stands in for `go-live.sh` and is held open by each test; the job store
// is the host's own (`jobs.js`, files under a directory of this run) and fails the writes a test
// tells it to.

const hostDirs = []
after(() => Promise.all(hostDirs.map((dir) => rm(dir, { recursive: true, force: true }))))

/**
 * @param {object} [options]
 * @param {(fields: Record<string, unknown>) => boolean} [options.failPut] - job-store writes that throw
 * @param {() => boolean} [options.failAccept] - whether the acceptance mark cannot be written now
 * @param {(n: number) => Promise<void> | void} [options.beforeGoLive] - runs before the n-th go-live
 *   request reaches the host: a barrier a test holds a request at
 * @param {(n: number) => boolean} [options.loseGoLive] - the host takes the n-th go-live request and
 *   answers it, and the answer never arrives
 */
async function realHost({
  failPut = () => false,
  failAccept = () => false,
  beforeGoLive = () => {},
  loseGoLive = () => false
} = {}) {
  const root = await mkdtemp(
    path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'tracy-web-publish-host-')
  )
  hostDirs.push(root)
  const config = {
    hostName: 'local',
    hostSecret: env.HOST_local_SECRET,
    sitesRoot: path.join(root, 'sites'),
    privateRoot: path.join(root, 'private'),
    scriptsDir: path.join(root, 'scripts'),
    jobsDir: path.join(root, 'jobs'),
    logDir: path.join(root, 'logs'),
    cloudflare: { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  }
  await mkdir(path.join(config.privateRoot, 'lantern'), { recursive: true })
  const refusedPuts = []
  const jobs = {
    async put(id, fields) {
      if (failPut(fields)) {
        refusedPuts.push(fields)
        throw new Error('ENOSPC: the job record could not be written')
      }
      return hostJobs.putJob(config.jobsDir, id, fields)
    },
    get: (id) => hostJobs.readJob(config.jobsDir, id),
    async accept(id) {
      if (failAccept()) throw new Error('ENOSPC: the acceptance mark could not be written')
      return hostJobs.acceptJob(config.jobsDir, id)
    },
    accepted: (id) => hostJobs.jobAccepted(config.jobsDir, id)
  }
  /** The job records as they stand on disk right now. */
  const files = (suffix) => {
    try {
      return readdirSync(config.jobsDir).filter((name) => name.endsWith(suffix))
    } catch {
      return []
    }
  }
  const records = {
    get(id) {
      try {
        return JSON.parse(readFileSync(path.join(config.jobsDir, `${id}.json`), 'utf8'))
      } catch {
        return undefined
      }
    },
    get size() {
      return files('.json').length
    }
  }
  /** Every start of the script: `{ input, resolve, reject }`, ended by the test. */
  const runs = []
  const run = (input) => new Promise((resolve, reject) => runs.push({ input, resolve, reject }))
  let app = buildHostApp({ config, jobs, run })
  const goLives = []
  /** Every answer the host gave to a go-live, in order: `{ status, body }`. */
  const answers = []
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    if (u.pathname !== '/_host/go-live') return app.fetch(new Request(String(input), init))
    goLives.push(JSON.parse(init.body))
    const n = goLives.length
    await beforeGoLive(n)
    const res = await app.fetch(new Request(String(input), init))
    answers.push({ status: res.status, body: await res.clone().json() })
    if (loseGoLive(n)) throw new TypeError('fetch failed')
    return res
  }
  return {
    fetchImpl,
    config,
    records,
    /** How many keys this host has marked as taken. */
    marks: () => files('.accepted').length,
    recordPath: (id) => path.join(config.jobsDir, `${id}.json`),
    markPath: (id) => path.join(config.jobsDir, `${id}.accepted`),
    refusedPuts,
    runs,
    goLives,
    answers,
    /** The host process starts again: what it held in memory is gone, its job records are not. */
    restart() {
      app = buildHostApp({ config, jobs, run })
    }
  }
}

async function setupRealHost(options) {
  const { pool } = db
  const host = await realHost(options)
  const h = harness(pool, host.fetchImpl)
  await site(pool)
  const owner = await h.cookieFor('owner@x.y')
  return { pool, host, h, owner }
}

async function until(done, what) {
  const deadline = Date.now() + 10_000
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(`${what}: gave up waiting`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const scriptDone = (op) => ({ code: 0, tail: [said(op)] })

test(
  'a FRESH reservation whose door is still waiting on the host: a read at that very moment asks the host under the same key, the host runs ONE script, and the door that comes through later is told that same job',
  opts,
  async () => {
    let letFirstThrough
    const barrier = new Promise((resolve) => (letFirstThrough = resolve))
    const { pool, host, h, owner } = await setupRealHost({
      // The door's own request is held on its way to the host; every later one goes straight in.
      beforeGoLive: (n) => (n === 1 ? barrier : undefined)
    })
    const pressed = h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    await until(() => host.goLives.length === 1, 'the door asked the host')
    const row = await opRow(pool)
    assert.equal(row.state, 'starting')
    assert.ok((await dbNow(pool)) - new Date(row.started_at).getTime() < 5_000, 'reserved this instant')

    const read = await state(h, owner)
    assert.equal(host.goLives.length, 2, 'the read asked the host: no grace for a fresh reservation')
    assert.equal(host.goLives[1].jobKey, `publish:${row.ref}`)
    assert.equal(read.operation.state, 'running')
    assert.equal(read.operation.confirmed, true)
    const jobId = read.operation.jobId
    await until(() => host.runs.length === 1, 'the script started')

    letFirstThrough()
    const res = await pressed
    assert.equal(res.status, 202)
    assert.equal((await res.json()).jobId, jobId, 'the same job, not a second one')
    assert.deepEqual([...new Set(host.goLives.map((sent) => sent.jobKey))], [`publish:${row.ref}`])
    await state(h, owner)
    assert.equal(host.runs.length, 1, 'one script, however many asked')
    assert.equal(await count(pool, 'job'), 1)
    assert.equal(await count(pool, 'site_job_follow_up'), 1)

    host.runs[0].resolve(scriptDone('live'))
    await until(() => host.records.get(jobId).state === 'done', 'the job ended')
    const ended = await state(h, owner)
    assert.equal(ended.publish, 'published')
    assert.equal(ended.operation, null)
    assert.equal((await opRow(pool)).ref, row.ref)
  }
)

test(
  'the host could not write `running`: its record stays `queued` with nothing running behind it — the next read hands the same key over again, the script runs, and its real ending ends the operation',
  opts,
  async () => {
    for (const [op, ending, want] of [
      ['live', () => scriptDone('live'), { state: 'done', publish: 'published' }],
      [
        'live',
        () => ({ code: 3, tail: ['!! could not reload Apache'] }),
        { state: 'failed', publish: 'draft' }
      ],
      ['draft', () => scriptDone('draft'), { state: 'done', publish: 'draft' }]
    ]) {
      await db.reset()
      let failing = true
      const { pool, host, h, owner } = await setupRealHost({
        failPut: (fields) => failing && fields.state === 'running'
      })
      if (op === 'draft')
        await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op })
      assert.equal(res.status, 202)
      const { jobId } = await res.json()
      await until(() => host.refusedPuts.length === 1, 'the write of `running` failed')
      // Let the host's own release of the site run.
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(host.records.get(jobId).state, 'queued', 'the record never left queued')
      assert.equal(host.runs.length, 0, 'no script was started')
      const ref = (await opRow(pool)).ref
      failing = false

      const read = await state(h, owner)
      assert.equal(read.operation.state, 'running', op)
      assert.equal(read.operation.jobId, jobId, 'the same job id for the same key')
      await until(() => host.runs.length === 1, 'the read had the host start the script')
      assert.deepEqual([...new Set(host.goLives.map((sent) => sent.jobKey))], [`publish:${ref}`])
      // Reads while it runs start nothing more.
      await state(h, owner)
      await state(h, owner)
      assert.equal(host.runs.length, 1, 'still one script')
      assert.equal((await opRow(pool)).state, 'running')

      host.runs[0].resolve(ending())
      await until(() => host.records.get(jobId).state !== 'running', 'the job ended')
      const ended = await state(h, owner)
      const row = await opRow(pool)
      assert.equal(row.state, want.state, op)
      assert.equal(row.ref, ref, 'the same reservation to the end')
      assert.equal(ended.publish, want.publish, op)
      if (want.state === 'failed') assert.equal(ended.operation.code, 'JOB_FAILED')
      else assert.equal(ended.operation, null)
    }
  }
)

test(
  "the host could not write `unobserved` (nor the ending): its record stays `running` after the site was let go — the next read hands the same key over again and the script's real ending ends the operation",
  opts,
  async () => {
    const lostRuns = {
      'the run threw and the unobserved record could not be written': (run) =>
        run.reject(new Error('EIO: the log could not be written')),
      'the script ended 0 but neither `done` nor `unobserved` could be written': (run) =>
        run.resolve(scriptDone('live')),
      'the script was killed by a signal and `unobserved` could not be written': (run) =>
        run.resolve({ code: null, tail: [] })
    }
    for (const [what, lose] of Object.entries(lostRuns)) {
      for (const [ending, want] of [
        [() => scriptDone('live'), { state: 'done', publish: 'published' }],
        [() => ({ code: 3, tail: ['!! could not reload Apache'] }), { state: 'failed', publish: 'draft' }]
      ]) {
        await db.reset()
        let failing = true
        const { pool, host, h, owner } = await setupRealHost({
          // The first write (`queued`) and `running` go through; every ending fails.
          failPut: (fields) => failing && (fields.state === 'done' || fields.state === 'failed')
        })
        const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        const { jobId } = await res.json()
        await until(() => host.runs.length === 1, `${what}: the script started`)
        const ref = (await opRow(pool)).ref
        lose(host.runs[0])
        await until(
          () => host.refusedPuts.some((fields) => fields.unobserved === true),
          `${what}: the write of unobserved failed`
        )
        await new Promise((resolve) => setTimeout(resolve, 20))
        assert.equal(host.records.get(jobId).state, 'running', `${what}: the record still reads running`)
        assert.equal(await flag(pool), 'draft', `${what}: nothing was believed`)
        failing = false

        const read = await state(h, owner)
        assert.equal(read.operation.state, 'running', what)
        assert.equal(read.operation.jobId, jobId, what)
        await until(() => host.runs.length === 2, `${what}: the read had the host run the key again`)
        assert.deepEqual([...new Set(host.goLives.map((sent) => sent.jobKey))], [`publish:${ref}`], what)
        await state(h, owner)
        assert.equal(host.runs.length, 2, `${what}: reads while it runs start nothing more`)
        assert.equal(await flag(pool), 'draft', what)

        host.runs[1].resolve(ending())
        await until(() => host.records.get(jobId).state !== 'running', `${what}: the job ended`)
        const ended = await state(h, owner)
        const row = await opRow(pool)
        assert.equal(row.state, want.state, what)
        assert.equal(row.ref, ref, what)
        assert.equal(ended.publish, want.publish, what)
        if (want.state === 'failed') assert.equal(ended.operation.code, 'JOB_FAILED', what)
        else assert.equal(ended.operation, null, what)
        assert.equal(
          (await pool.query("select count(*)::int as n from audit where action = 'site.go-live'")).rows[0].n,
          want.state === 'done' ? 1 : 0,
          what
        )
      }
    }
  }
)

test(
  'the sweep hearing of a record that is no outcome does not end the operation either: it stays held, and the next read asks the host again',
  opts,
  async () => {
    for (const [what, record] of Object.entries(NO_OUTCOME)) {
      if (record() === undefined) continue
      await db.reset()
      const { pool, host, h, owner } = await setup()
      await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      host.jobs['golive-1'] = record()
      await pool.query("update site_job_follow_up set next_at = now() - interval '1 minute'")
      const swept = await settleFollowUps(pool, {
        pollJob: ({ host: name, jobId }) => hostJob(h.config, name, jobId, { fetchImpl: host.fetchImpl })
      })
      assert.equal(swept.ran, true, what)
      let row = await opRow(pool)
      assert.equal(row.state, 'running', `${what}: the sweep ended nothing`)
      assert.equal(row.code, 'HOST_SILENT', what)
      assert.equal(await flag(pool), 'draft', what)
      assert.deepEqual(host.reruns, [], `${what}: the sweep does not start a job`)
      const read = await state(h, owner)
      assert.equal(read.operation.state, 'running', what)
      assert.deepEqual(host.reruns, ['golive-1'], `${what}: the read asked for the same operation`)
      row = await opRow(pool)
      assert.equal(row.code, null, what)
      assert.equal(await count(pool, 'site_job_follow_up'), 1, `${what}: owed to the sweep again`)
      host.jobs['golive-1'] = { state: 'done', exitCode: 0, output: said('live') }
      await pool.query("update site_job_follow_up set next_at = now() - interval '1 minute'")
      await settleFollowUps(pool, {
        pollJob: ({ host: name, jobId }) => hostJob(h.config, name, jobId, { fetchImpl: host.fetchImpl })
      })
      assert.equal(await flag(pool), 'published', `${what}: the sweep hears the real ending`)
      assert.equal((await opRow(pool)).state, 'done', what)
    }
  }
)

// ── what the screens read ───────────────────────────────────────────────────────────────────────

test(
  'GET /state keeps what it always said, and GET /settings carries the same publishing snapshot',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const fresh = await state(h, owner)
    assert.equal(fresh.publish, 'draft')
    assert.equal(fresh.plan, 'standard')
    assert.equal(fresh.plans.standard.badge, true)
    assert.equal(fresh.operation, null)
    assert.equal(fresh.mayPublish, true)

    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    host.jobs['golive-1'] = { state: 'running', step: 'go-live:live' }
    const settings = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
    assert.equal(settings.publishing.publish, 'draft')
    assert.equal(settings.publishing.operation.state, 'running')
    assert.equal(settings.publishing.mayPublish, true)
    host.jobs['golive-1'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
    const reloaded = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
    assert.equal(typeof reloaded.publishing.liveSince, 'string')
    assert.ok(
      (await dbNow(pool)) - new Date(reloaded.publishing.liveSince).getTime() < 60_000,
      'when the publish ended'
    )
    assert.deepEqual(reloaded.publishing, {
      publish: 'published',
      mayPublish: true,
      liveSince: reloaded.publishing.liveSince,
      operation: null
    })

    // "Live since" is the moment of the publish that made it live: gone once the site is a draft
    // again, and never made up for a site opened another way.
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    host.jobs['golive-2'] = { state: 'done', exitCode: 0, step: 'go-live:draft', output: said('draft') }
    assert.equal('liveSince' in (await state(h, owner)), false)
    // A site that is live with no publish of this door on record (an import, an operator).
    await db.pool.query("update site set publish = 'published' where site_key = $1", [SITE])
    const opened = await state(h, owner)
    assert.equal(opened.publish, 'published')
    assert.equal('liveSince' in opened, false)
  }
)

test(
  "GET /api/sites says each seated site's publish state, and nothing for an invitation not yet answered",
  opts,
  async () => {
    const { pool, h, owner } = await setup()
    await site(pool, 'harbor.localhost', 'harbor', 'other@x.y')
    await pool.query("update site set publish = 'published' where site_key = 'harbor.localhost'")
    await seat(pool, 'harbor.localhost', 'owner@x.y', 'editor')
    await site(pool, 'northwind.localhost', 'northwind', 'third@x.y')
    await seat(pool, 'northwind.localhost', 'owner@x.y', 'editor', 'invited')
    const { sites } = await (await h.get('/api/sites', owner)).json()
    const byKey = Object.fromEntries(sites.map((row) => [row.siteKey, row]))
    assert.equal(byKey[SITE].publish, 'draft')
    assert.equal(byKey['harbor.localhost'].publish, 'published')
    assert.equal(byKey['northwind.localhost'].status !== 'accepted', true)
    assert.equal('publish' in byKey['northwind.localhost'], false)
  }
)

test(
  'GET /api/sites carries the operation under way — its direction, confirmed by the host or not — and drops it once the operation ended, done or failed',
  opts,
  async () => {
    for (const op of ['live', 'draft']) {
      await db.reset()
      let down = false
      const { pool, host, h, owner } = await setup({
        goLive: (payload, n) => {
          if (down) return Promise.reject(new TypeError('fetch failed'))
          host.jobs[`golive-${n}`] = { state: 'queued', step: `go-live:${payload.op}` }
          return Response.json({ jobId: `golive-${n}` }, { status: 202 })
        }
      })
      // A second seated site with nothing under way, and an invitation on a site that has one.
      await site(pool, 'harbor.localhost', 'harbor', 'other@x.y')
      await seat(pool, 'harbor.localhost', 'owner@x.y', 'editor')
      await site(pool, 'northwind.localhost', 'northwind', 'third@x.y')
      await seat(pool, 'northwind.localhost', 'owner@x.y', 'editor', 'invited')
      const third = await h.cookieFor('third@x.y')
      await h.send('POST', '/api/sites/northwind.localhost/go-live', third, { op: 'live' })
      if (op === 'draft')
        await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
      const rows = async (cookie = owner) => {
        const { sites } = await (await h.get('/api/sites', cookie)).json()
        return Object.fromEntries(sites.map((row) => [row.siteKey, row]))
      }
      assert.equal('publishing' in (await rows())[SITE], false, `${op}: nothing under way yet`)

      const asked = host.calls.length
      await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op })
      const during = await rows()
      assert.equal(during[SITE].publishing, op, op)
      // The flag is the flag still: a publish has not raised it, a draft dropped it at the press.
      assert.equal(during[SITE].publish, 'draft', op)
      assert.equal('publishing' in during['harbor.localhost'], false, 'another site is not touched')
      assert.equal('publishing' in during['northwind.localhost'], false, 'an invitation is told nothing')
      assert.equal('publish' in during['northwind.localhost'], false)
      assert.equal(host.calls.length, asked + 1, 'the list asked no host: one call, the press itself')
      // The editor of the same site reads the same thing.
      await seat(pool, SITE, 'editor@x.y', 'editor')
      assert.equal((await rows(await h.cookieFor('editor@x.y')))[SITE].publishing, op)

      host.jobs['golive-2'] = { state: 'done', step: `go-live:${op}`, exitCode: 0, output: said(op) }
      await state(h, owner)
      const ended = await rows()
      assert.equal('publishing' in ended[SITE], false, `${op}: ended`)
      assert.equal(ended[SITE].publish, op === 'live' ? 'published' : 'draft', op)

      // An operation the host never confirmed (`starting`) holds the site too, and the list says so.
      down = true
      const next = op === 'live' ? 'draft' : 'live'
      assert.equal((await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: next })).status, 504)
      assert.equal((await opRow(pool)).state, 'starting')
      assert.equal((await rows())[SITE].publishing, next, `${op}: unconfirmed ${next}`)
      // A failed one does not.
      await pool.query(
        "update site_publish_op set state = 'failed', code = 'JOB_FAILED' where site_key = $1",
        [SITE]
      )
      assert.equal('publishing' in (await rows())[SITE], false)
    }
  }
)

// ── below the doors: the reservation and the ending, on the store itself ────────────────────────

/** `publish-store.js`, imported by the tests that use it and by nothing else in this file. */
const store = () => import('../src/sites/publish-store.js')

/** A site and nothing else: no seat, no account. */
async function bareSite(pool) {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'lantern', 'local'])
}

/** Run `fn(client)` in a transaction, as the follow-up book runs `settleGoLive`. */
async function inTransaction(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const value = await fn(client)
    await client.query('commit')
    return value
  } finally {
    client.release()
  }
}

/** A site whose `live` operation is running as job `job-1`. */
async function running(pool, op = 'live') {
  const { adoptJob, reservePublishOp } = await store()
  await bareSite(pool)
  const first = await reservePublishOp(pool, { siteKey: SITE, op, actor: 'owner@x.y' })
  await adoptJob(pool, { siteKey: SITE, host: 'local', jobId: 'job-1', ref: first.ref })
}

test(
  'two replicas, one reservation: of reserves racing on separate connections exactly one takes the site',
  opts,
  async () => {
    const { reservePublishOp } = await store()
    const { pool } = db
    await bareSite(pool)
    const taken = await Promise.all(
      Array.from({ length: 8 }, () => reservePublishOp(pool, { siteKey: SITE, op: 'live' }))
    )
    assert.equal(taken.filter(Boolean).length, 1)
    assert.equal((await opRow(pool)).state, 'starting')
  }
)

test('a running operation holds the site whatever its age; an ended one never does', opts, async () => {
  const { currentPublishOp, reservePublishOp, settleGoLive } = await store()
  const { pool } = db
  await running(pool)
  await pool.query("update site_publish_op set updated_at = now() - interval '30 days'")
  assert.equal(await reservePublishOp(pool, { siteKey: SITE, op: 'draft' }), null)
  assert.equal((await currentPublishOp(pool, SITE)).state, 'running', 'age alone ends nothing')

  await inTransaction(pool, (client) =>
    settleGoLive(client, {
      siteKey: SITE,
      jobId: 'job-1',
      answer: { state: 'failed', outcome: 'failed', output: 'x' }
    })
  )
  const next = await reservePublishOp(pool, { siteKey: SITE, op: 'draft' })
  assert.equal(next.op, 'draft')
  assert.equal(next.job_id, null)
  assert.equal(next.code, null)
  assert.equal(next.detail, null, 'nothing of the last operation is left on the row')
  assert.deepEqual(next.domains, [], 'a site with no domain of its own carries none')
  assert.equal(next.attempt, 0, 'a new operation, not a cleanup taken back')
})

test(
  'an unconfirmed reservation holds the site whatever its age: no clock ends it, only an answer does',
  opts,
  async () => {
    const { PUBLISH_CODES, currentPublishOp, failPublishOp, leaveUnconfirmed, reservePublishOp } =
      await store()
    const { pool } = db
    await bareSite(pool)
    const first = await reservePublishOp(pool, { siteKey: SITE, op: 'live' })
    assert.match(first.ref, /^[0-9a-f]{32}$/)
    await leaveUnconfirmed(pool, { siteKey: SITE, ref: first.ref })
    for (const age of ['4 minutes', '6 minutes', '1 day', '1 year']) {
      await pool.query(`update site_publish_op set updated_at = now() - interval '${age}'`)
      assert.equal(await reservePublishOp(pool, { siteKey: SITE, op: 'live' }), null, age)
      const row = await currentPublishOp(pool, SITE)
      assert.equal(row.state, 'starting', age)
      assert.equal(row.code, PUBLISH_CODES.unreachable, age)
      assert.equal(row.ref, first.ref, age)
    }
    // The host's refusal is what frees it.
    await failPublishOp(pool, { siteKey: SITE, ref: first.ref, code: PUBLISH_CODES.refused })
    const next = await reservePublishOp(pool, { siteKey: SITE, op: 'live' })
    assert.ok(next)
    assert.notEqual(next.ref, first.ref, 'a new operation has its own name')
  }
)

test(
  'a reservation that lost its row to a later one writes nothing over it: not a job, not a failure',
  opts,
  async () => {
    const { PUBLISH_CODES, failPublishOp, leaveUnconfirmed, adoptJob, reservePublishOp } = await store()
    const { pool } = db
    await bareSite(pool)
    const first = await reservePublishOp(pool, { siteKey: SITE, op: 'live' })
    await new Promise((r) => setTimeout(r, 5))
    await failPublishOp(pool, { siteKey: SITE, ref: first.ref, code: PUBLISH_CODES.refused })
    const second = await reservePublishOp(pool, { siteKey: SITE, op: 'draft' })
    assert.ok(first && second, 'the first ended, the second took the row')
    const mine = { siteKey: SITE, ref: first.ref }
    assert.equal(await adoptJob(pool, { ...mine, host: 'local', jobId: 'late-1' }), null)
    assert.equal(await failPublishOp(pool, { ...mine, code: PUBLISH_CODES.refused }), null)
    await leaveUnconfirmed(pool, mine)
    assert.equal((await pool.query('select count(*)::int as n from job')).rows[0].n, 0)
    assert.equal((await pool.query('select count(*)::int as n from site_job_follow_up')).rows[0].n, 0)
    const row = await opRow(pool)
    assert.equal(row.op, 'draft')
    assert.equal(row.state, 'starting')
    assert.equal(row.code, null)
  }
)

test(
  'two reservations taken in the same millisecond are two operations: the late answers about the first, arriving after the second took the row, write nothing',
  opts,
  async () => {
    const { PUBLISH_CODES, failPublishOp, leaveUnconfirmed, adoptJob, reservePublishOp } = await store()
    const { pool } = db
    await bareSite(pool)
    const first = await reservePublishOp(pool, { siteKey: SITE, op: 'live' })
    await failPublishOp(pool, { siteKey: SITE, ref: first.ref, code: PUBLISH_CODES.refused })
    const second = await reservePublishOp(pool, { siteKey: SITE, op: 'draft' })
    // The same instant on both, to the microsecond: nothing about the time tells them apart.
    await pool.query('update site_publish_op set started_at = $2 where site_key = $1', [
      SITE,
      first.started_at
    ])
    assert.notEqual(second.ref, first.ref)
    assert.equal(new Date((await opRow(pool)).started_at).getTime(), new Date(first.started_at).getTime())

    // The answers about the FIRST arrive now, after the second took the row — the host's job first.
    const late = { siteKey: SITE, ref: first.ref }
    assert.equal(await adoptJob(pool, { ...late, host: 'local', jobId: 'late-job' }), null)
    assert.equal(await failPublishOp(pool, { ...late, code: PUBLISH_CODES.refused }), null)
    await leaveUnconfirmed(pool, late)
    let row = await opRow(pool)
    assert.equal(row.ref, second.ref)
    assert.equal(row.op, 'draft')
    assert.equal(row.state, 'starting')
    assert.equal(row.job_id, null, "the first operation's job is not the second's")
    assert.equal(row.code, null)
    assert.equal((await pool.query('select count(*)::int as n from job')).rows[0].n, 0)
    assert.equal((await pool.query('select count(*)::int as n from site_job_follow_up')).rows[0].n, 0)

    // And the second's own answer, named by its ref, is written.
    const mine = await adoptJob(pool, { siteKey: SITE, ref: second.ref, host: 'local', jobId: 'job-2' })
    assert.equal(mine.job_id, 'job-2')
    row = await opRow(pool)
    assert.equal(row.state, 'running')
    assert.equal(row.job_id, 'job-2')
  }
)

test(
  'an ending for a job that is not the running operation changes nothing, whatever it says',
  opts,
  async () => {
    const { settleGoLive } = await store()
    const { pool } = db
    await running(pool)
    for (const state of ['done', 'failed', 'expired']) {
      const ended = await inTransaction(pool, (client) =>
        settleGoLive(client, { siteKey: SITE, jobId: 'stale-9', answer: { state } })
      )
      assert.equal(ended, null, state)
    }
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).state, 'running')
  }
)

test(
  'the ending of a live raises the flag in the same transaction that closes the operation: a rollback undoes both',
  opts,
  async () => {
    const { settleGoLive } = await store()
    const { pool } = db
    await running(pool)
    const client = await pool.connect()
    try {
      await client.query('begin')
      const ended = await settleGoLive(client, {
        siteKey: SITE,
        jobId: 'job-1',
        answer: { state: 'done', outcome: 'done', output: said('live') }
      })
      assert.equal(ended.state, 'done')
      await client.query('rollback')
    } finally {
      client.release()
    }
    assert.equal(await flag(pool), 'draft')
    assert.equal((await opRow(pool)).state, 'running', 'still owed, so whoever hears it next does it')
    assert.equal((await pool.query('select count(*)::int as n from audit')).rows[0].n, 0)
  }
)

test(
  "the ending of a draft never raises the flag, a job nobody ended reads HOST_SILENT, and the host's last lines are kept bounded",
  opts,
  async () => {
    const { PUBLISH_CODES, adoptJob, reservePublishOp, settleGoLive } = await store()
    const { pool } = db
    await running(pool, 'draft')
    const ended = await inTransaction(pool, (client) =>
      settleGoLive(client, {
        siteKey: SITE,
        jobId: 'job-1',
        answer: { state: 'failed', outcome: 'failed', output: `${'x'.repeat(5000)}THE END` }
      })
    )
    assert.equal(ended.state, 'failed')
    assert.equal(ended.code, PUBLISH_CODES.jobFailed)
    assert.equal(ended.detail.length, 2000)
    assert.ok(ended.detail.endsWith('THE END'), 'the last lines are the ones kept')
    assert.equal(await flag(pool), 'draft')

    const again = await reservePublishOp(pool, { siteKey: SITE, op: 'draft' })
    await adoptJob(pool, { siteKey: SITE, host: 'local', jobId: 'job-2', ref: again.ref })
    // No answer that is the script's own ending ends the operation: the row is marked and held.
    for (const answer of [
      { state: 'lost' },
      { state: 'expired' },
      { state: 'running' },
      // An ending the caller did not read off the host's record as the script's own is not believed.
      { state: 'failed' },
      { state: 'failed', outcome: null, output: 'x' },
      { state: 'done', output: said('draft') },
      { state: 'done', outcome: null, output: said('draft') },
      { state: 'done', outcome: 'running', output: said('draft') },
      { state: 'failed', outcome: true },
      { state: undefined },
      {}
    ]) {
      const unheard = await inTransaction(pool, (client) =>
        settleGoLive(client, { siteKey: SITE, jobId: 'job-2', answer })
      )
      assert.equal(unheard, null, JSON.stringify(answer))
      const heldRow = await opRow(pool)
      assert.equal(heldRow.state, 'running', JSON.stringify(answer))
      assert.equal(heldRow.code, PUBLISH_CODES.silent, JSON.stringify(answer))
      assert.equal(await reservePublishOp(pool, { siteKey: SITE, op: 'draft' }), null)
    }
    const failed = await inTransaction(pool, (client) =>
      settleGoLive(client, {
        siteKey: SITE,
        jobId: 'job-2',
        answer: { state: 'failed', outcome: 'failed', output: 'x' }
      })
    )
    assert.equal(failed.state, 'failed')
    assert.equal(failed.code, PUBLISH_CODES.jobFailed)
    const done = await reservePublishOp(pool, { siteKey: SITE, op: 'draft' })
    await adoptJob(pool, { siteKey: SITE, host: 'local', jobId: 'job-3', ref: done.ref })
    await inTransaction(pool, (client) =>
      settleGoLive(client, {
        siteKey: SITE,
        jobId: 'job-3',
        answer: { state: 'done', outcome: 'done', output: said('draft') }
      })
    )
    assert.equal(await flag(pool), 'draft')
  }
)

test('what the screen is told: starting and running read as one wait, a failure carries its code, done and nothing read as no operation', async () => {
  const { publishView } = await store()
  const at = new Date('2026-10-05T07:02:00.000Z')
  const base = { op: 'live', job_id: null, started_at: at, updated_at: at, code: null }
  const view = (site, op, mayPublish = true) => publishView(site, op, { mayPublish })
  assert.deepEqual(view({ publish: 'draft' }, null), { publish: 'draft', mayPublish: true, operation: null })
  assert.deepEqual(view({ publish: null }, { ...base, state: 'done' }, false), {
    publish: 'draft',
    mayPublish: false,
    operation: null
  })
  // "Live since" only beside the publish that made the site live, and only while it is live.
  assert.deepEqual(view({ publish: 'published' }, { ...base, state: 'done' }), {
    publish: 'published',
    mayPublish: true,
    liveSince: '2026-10-05T07:02:00.000Z',
    operation: null
  })
  assert.equal('liveSince' in view({ publish: 'published' }, { ...base, op: 'draft', state: 'done' }), false)
  assert.equal('liveSince' in view({ publish: 'published' }, null), false)
  assert.equal('liveSince' in view({ publish: 'draft' }, { ...base, state: 'done' }), false)
  assert.deepEqual(view({ publish: 'published' }, { ...base, state: 'starting' }).operation, {
    op: 'live',
    state: 'running',
    confirmed: false,
    jobId: null,
    startedAt: '2026-10-05T07:02:00.000Z'
  })
  assert.deepEqual(view({ publish: 'draft' }, { ...base, state: 'running', job_id: 'j1' }).operation, {
    op: 'live',
    state: 'running',
    confirmed: true,
    jobId: 'j1',
    startedAt: '2026-10-05T07:02:00.000Z'
  })
  // A running row the host last said nothing useful about is one wait still, said as not confirmed.
  for (const code of ['HOST_SILENT', 'HOST_UNREACHABLE'])
    assert.equal(
      view({ publish: 'draft' }, { ...base, state: 'running', job_id: 'j1', code }).operation.confirmed,
      false,
      code
    )
  const failed = view(
    { publish: 'draft' },
    { ...base, state: 'failed', job_id: 'j1', code: 'NOT_CONFIGURED', detail: 'secret' }
  )
  assert.deepEqual(failed.operation, {
    op: 'live',
    state: 'failed',
    jobId: 'j1',
    startedAt: '2026-10-05T07:02:00.000Z',
    code: 'NOT_CONFIGURED',
    endedAt: '2026-10-05T07:02:00.000Z'
  })
  assert.ok(!JSON.stringify(failed).includes('secret'))
})

// ── resolved on read: there is no background sweep for an unresolved operation ──────────────────
test(
  'an unresolved operation is resolved by the next read of the site — GET /state, GET /settings or a poll of its job — whether it is still starting, running with a job the host lost, orphaned, busy, unobserved or given up by the follow-up book',
  opts,
  async () => {
    const scenes = {
      'starting: the host never confirmed it': null,
      'running: follow-up given up, record gone': () => undefined,
      ...NO_OUTCOME
    }
    const doors = {
      'GET /state': (h, owner) => h.get(`/api/sites/${SITE}/state`, owner),
      'GET /settings': (h, owner) => h.get(`/api/sites/${SITE}/settings`, owner),
      'GET /jobs/:id': (h, owner) => h.get(`/api/sites/${SITE}/jobs/golive-1`, owner)
    }
    for (const [scene, record] of Object.entries(scenes)) {
      for (const [door, read] of Object.entries(doors)) {
        // A `starting` operation has no job yet, so there is no job to poll.
        if (record === null && door === 'GET /jobs/:id') continue
        const what = `${scene} · ${door}`
        await db.reset()
        let down = record === null
        const { pool, host, h, owner } = await setup({
          goLive: (payload, n) => {
            if (down) return Promise.reject(new TypeError('fetch failed'))
            host.jobs['golive-1'] = { state: 'queued', step: `go-live:${payload.op}` }
            return Response.json({ jobId: 'golive-1', asked: n }, { status: 202 })
          }
        })
        const pressed = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        assert.equal(pressed.status, record === null ? 504 : 202, what)
        const before = await opRow(pool)
        assert.equal(before.state, record === null ? 'starting' : 'running', what)
        const key = host.goLiveCalls()[0].body.jobKey
        if (record === null) down = false
        else if (record() === undefined) {
          delete host.jobs['golive-1']
          // The follow-up book gave the job up (a day of silence): nothing in the background owes it.
          if (scene.startsWith('running: follow-up')) await pool.query('delete from site_job_follow_up')
        } else host.jobs['golive-1'] = record()
        const asked = host.goLiveCalls().length

        const res = await read(h, owner)
        assert.equal(res.status, 200, what)
        assert.equal(host.goLiveCalls().length, asked + 1, `${what}: the read asked the host again`)
        assert.equal(host.goLiveCalls().at(-1).body.jobKey, key, `${what}: under the same key`)
        const row = await opRow(pool)
        assert.equal(row.ref, before.ref, `${what}: the same reservation`)
        assert.equal(row.state, 'running', what)
        assert.equal(row.job_id, 'golive-1', what)
        assert.equal(row.code, null, `${what}: confirmed again`)
        assert.equal(await count(pool, 'site_job_follow_up'), 1, `${what}: the ending is owed again`)
        assert.equal(await flag(pool), 'draft', `${what}: nothing was raised on the way`)

        // The job that was asked for again ends by its script: the next read of ANY of the doors ends it.
        host.jobs['golive-1'] = { state: 'done', step: 'go-live:live', exitCode: 0, output: said('live') }
        assert.equal((await read(h, owner)).status, 200, what)
        assert.equal(await flag(pool), 'published', what)
        assert.equal((await opRow(pool)).state, 'done', what)
      }
    }
  }
)

// ── GET /settings: one snapshot ─────────────────────────────────────────────────────────────────

test(
  'GET /settings while the address changes and a publish ends during the CMS read: the address, the admin link, the address state and the publishing state are all of AFTER — never an old address beside a new state',
  opts,
  async () => {
    const { pool } = db
    let during = async () => {}
    const host = fakeHost({ onSiteJob: () => during() })
    const h = harness(pool, host.fetchImpl)
    await site(pool)
    await pool.query(
      "update site set platform = 'wordpress', address = 'http://lantern.localhost:8080/' where site_key = $1",
      [SITE]
    )
    const owner = await h.cookieFor('owner@x.y')
    await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })

    const before = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
    assert.equal(before.siteUrl, 'http://lantern.localhost:8080/')
    assert.equal(before.adminUrl, 'http://lantern.localhost:8080/wp-admin/')
    assert.equal(before.currentSiteUrl, 'http://lantern.localhost:8080/')
    assert.equal(before.publishing.publish, 'draft')
    assert.equal(before.publishing.operation.state, 'running')

    // While the CMS is being read: the Owner's rename lands, and the host ends the publish job.
    let ran = 0
    during = async () => {
      ran++
      await pool.query("update site set address = 'http://harbor.localhost:8080/' where site_key = $1", [
        SITE
      ])
      host.jobs['golive-1'] = { state: 'done', exitCode: 0, output: said('live') }
    }
    const res = await h.get(`/api/sites/${SITE}/settings`, owner)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(ran, 1, 'the change landed inside this one request')
    assert.equal(body.siteKey, SITE)
    assert.equal(body.siteUrl, 'http://harbor.localhost:8080/')
    assert.equal(body.adminUrl, 'http://harbor.localhost:8080/wp-admin/')
    assert.equal(body.currentSiteUrl, 'http://harbor.localhost:8080/')
    assert.equal(body.publishing.publish, 'published')
    assert.equal(body.publishing.operation, null)
    assert.equal(typeof body.publishing.liveSince, 'string')
    assert.equal(typeof body.addressChange, 'object')
  }
)

test(
  'GET /settings of a site deleted while its CMS was being read is 404, not a page of the row that was',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost({
      onSiteJob: () => pool.query('delete from site where site_key = $1', [SITE])
    })
    const h = harness(pool, host.fetchImpl)
    await site(pool)
    await pool.query("update site set platform = 'wordpress' where site_key = $1", [SITE])
    const owner = await h.cookieFor('owner@x.y')
    const res = await h.get(`/api/sites/${SITE}/settings`, owner)
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { code: 'SITE_UNKNOWN' })
  }
)

// ── the host took the job, the answer was lost, and the host has changed since ──────────────────

/** What changes on the host after it took the job: `[what, the refusal a new ask would get, change, undo]`. */
const HOST_CHANGES = [
  [
    "the site's folder is gone",
    { status: 404, code: 'NOT_FOUND' },
    (host) => rm(path.join(host.config.privateRoot, 'lantern'), { recursive: true }),
    (host) => mkdir(path.join(host.config.privateRoot, 'lantern'), { recursive: true })
  ],
  // The tunnel configuration going is no longer such a change for these asks: a publish at the
  // Tracy address names no domain, and the host asks for its tunnel only when one is named
  // (`tracy-host` `goLiveRoute`; the asks that do name one are in `site-address.test.mjs`).
  [
    "the site's folder was replaced by a file",
    { status: 404, code: 'NOT_FOUND' },
    async (host) => {
      await rm(path.join(host.config.privateRoot, 'lantern'), { recursive: true })
      await writeFile(path.join(host.config.privateRoot, 'lantern'), '')
    },
    async (host) => {
      await rm(path.join(host.config.privateRoot, 'lantern'), { force: true })
      await mkdir(path.join(host.config.privateRoot, 'lantern'), { recursive: true })
    }
  ]
]

test(
  "the 202 is lost and the host changes while the script runs: the next read is told the SAME job — never NOT_FOUND / NOT_CONFIGURED — and the operation ends on the script's own outcome",
  opts,
  async () => {
    for (const [what, , change] of HOST_CHANGES) {
      await db.reset()
      const { pool, host, h, owner } = await setupRealHost({ loseGoLive: (n) => n === 1 })
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(res.status, 504, what)
      assert.equal(host.answers[0].status, 202, 'the host took the job')
      const row = await opRow(pool)
      assert.equal(row.state, 'starting', what)
      assert.equal(row.job_id, null, 'this side never heard of a job')
      await until(() => host.runs.length === 1, 'the script started')

      await change(host)
      const read = await state(h, owner)
      assert.deepEqual(
        host.answers[1],
        { status: 202, body: { jobId: host.answers[0].body.jobId, reused: true } },
        `${what}: the key is looked up before the folder and the configuration`
      )
      assert.equal(read.operation.state, 'running', what)
      assert.equal(read.operation.jobId, host.answers[0].body.jobId, what)
      assert.equal((await opRow(pool)).ref, row.ref, what)
      assert.equal(read.publish, 'draft', what)

      host.runs[0].resolve(scriptDone('live'))
      await until(() => host.records.get(read.operation.jobId).state === 'done', 'the job ended')
      const ended = await state(h, owner)
      assert.equal(ended.publish, 'published', `${what}: the real outcome`)
      assert.equal(ended.operation, null, what)
      assert.equal(host.runs.length, 1, 'one script')
    }
  }
)

test(
  'the 202 is lost, the host restarts with the script still at work and has changed: its refusal says the key WAS taken, the operation holds through every read, and a second press is refused — then the host is whole again and the same key runs to a real outcome',
  opts,
  async () => {
    for (const [what, refusal, change, undo] of HOST_CHANGES) {
      await db.reset()
      const { pool, host, h, owner } = await setupRealHost({ loseGoLive: (n) => n === 1 })
      await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      await until(() => host.runs.length === 1, 'the script started')
      const jobId = host.answers[0].body.jobId
      const row = await opRow(pool)
      assert.equal(row.job_id, null, what)

      // Nothing in the host's memory holds the site now; the record still reads `running`.
      host.restart()
      await change(host)
      for (let i = 0; i < 3; i++) {
        const read = await state(h, owner)
        assert.deepEqual(
          host.answers.at(-1),
          { status: refusal.status, body: { code: refusal.code, accepted: true, jobId } },
          what
        )
        assert.equal(read.operation.state, 'running', `${what}: read ${i} — still held`)
        assert.equal(read.operation.confirmed, false, what)
        assert.equal(read.publish, 'draft', what)
      }
      const held = await opRow(pool)
      assert.equal(held.state, 'starting', `${what}: not ended`)
      assert.equal(held.ref, row.ref, what)
      const second = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
      assert.equal(second.status, 409, `${what}: the site is still held`)
      assert.equal((await second.json()).code, 'PUBLISH_BUSY', what)
      assert.equal((await opRow(pool)).ref, row.ref, what)
      assert.equal(host.runs.length, 1, 'nothing was started beside the first script')

      // The first script ends where nobody hears it (its process outlived the host that started it).
      await undo(host)
      const again = await state(h, owner)
      assert.equal(again.operation.state, 'running', what)
      assert.equal(again.operation.jobId, jobId, 'the same key is the same job')
      await until(() => host.runs.length === 2, 'the same key runs again')
      host.runs[1].resolve(scriptDone('live'))
      await until(() => host.records.get(jobId).state === 'done', 'the job ended')
      const ended = await state(h, owner)
      assert.equal(ended.publish, 'published', what)
      assert.equal(ended.operation, null, what)
      assert.deepEqual([...new Set(host.goLives.map((sent) => sent.jobKey))], [`publish:${row.ref}`], what)
    }
  }
)

test(
  'the ask never reached the host, and the host has changed: its refusal says the key was NEVER taken, and only that ends the operation',
  opts,
  async () => {
    for (const [what, refusal, change] of HOST_CHANGES) {
      await db.reset()
      const { pool, host, h, owner } = await setupRealHost({
        beforeGoLive: (n) => {
          if (n === 1) throw new TypeError('fetch failed')
        }
      })
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(res.status, 504, what)
      assert.equal(host.answers.length, 0, 'the host heard nothing')
      await change(host)
      const read = await state(h, owner)
      assert.deepEqual(
        host.answers[0],
        { status: refusal.status, body: { code: refusal.code, accepted: false } },
        what
      )
      assert.equal(read.operation.state, 'failed', what)
      assert.equal(read.operation.code, refusal.code, what)
      assert.equal(read.publish, 'draft', what)
      assert.equal((await opRow(pool)).state, 'failed', what)
      assert.equal(host.runs.length, 0, what)
      assert.equal(host.records.size, 0, what)
      assert.equal(host.marks(), 0, `${what}: no mark, no record — the key was never taken`)
    }
  }
)

/** What can become of a taken job's record on the host's disk: `[what, damage(recordPath)]`. */
const RECORD_LOSSES = [
  ['the record was deleted', (file) => rm(file)],
  ['the record is not JSON any more', (file) => writeFile(file, '{"state":"runn')],
  [
    'the record cannot be read',
    async (file) => {
      // A folder under the record's name: reading it fails for every user, root included.
      await rm(file)
      await mkdir(file)
    },
    (file) => rm(file, { recursive: true })
  ]
]

test(
  'the 202 is lost, the host restarts and its record of the job is deleted, damaged or unreadable, and the host has changed: the refusal still says the key WAS taken — the operation holds through every read, a second press is refused, and the same key runs to a real outcome once the host is whole',
  opts,
  async () => {
    for (const [lost, damage, repair = () => {}] of RECORD_LOSSES) {
      for (const [changed, refusal, change, undo] of HOST_CHANGES) {
        const what = `${lost}; ${changed}`
        await db.reset()
        const { pool, host, h, owner } = await setupRealHost({ loseGoLive: (n) => n === 1 })
        const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        assert.equal(res.status, 504, what)
        assert.equal(host.answers[0].status, 202, 'the host took the job')
        await until(() => host.runs.length === 1, 'the script started')
        const jobId = host.answers[0].body.jobId
        const row = await opRow(pool)
        assert.equal(row.state, 'starting', what)
        assert.equal(row.job_id, null, 'this side never heard of a job')

        // The host starts again with the script still at work; its record of the job goes.
        host.restart()
        await damage(host.recordPath(jobId))
        assert.equal(host.records.get(jobId), undefined, what)
        await change(host)
        for (let i = 0; i < 3; i++) {
          const read = await state(h, owner)
          assert.deepEqual(
            host.answers.at(-1),
            { status: refusal.status, body: { code: refusal.code, accepted: true, jobId } },
            `${what}: read ${i} — taken, outcome unknown`
          )
          assert.equal(read.operation.state, 'running', `${what}: read ${i} — still held`)
          assert.equal(read.operation.confirmed, false, what)
          assert.equal(read.publish, 'draft', what)
        }
        const held = await opRow(pool)
        assert.equal(held.state, 'starting', `${what}: not ended`)
        assert.equal(held.ref, row.ref, what)
        const second = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
        assert.equal(second.status, 409, `${what}: the site is still held`)
        assert.equal((await second.json()).code, 'PUBLISH_BUSY', what)
        assert.equal((await opRow(pool)).ref, row.ref, what)
        assert.equal(host.runs.length, 1, 'nothing was started beside the first script')

        // The host is whole again: the same key is taken again as the same job.
        await repair(host.recordPath(jobId))
        await undo(host)
        const again = await state(h, owner)
        assert.equal(again.operation.state, 'running', what)
        assert.equal(again.operation.jobId, jobId, 'the same key is the same job')
        await until(() => host.runs.length === 2, 'the same key runs again')
        host.runs[1].resolve(scriptDone('live'))
        await until(() => host.records.get(jobId)?.state === 'done', 'the job ended')
        const ended = await state(h, owner)
        assert.equal(ended.publish, 'published', what)
        assert.equal(ended.operation, null, what)
        assert.deepEqual([...new Set(host.goLives.map((sent) => sent.jobKey))], [`publish:${row.ref}`], what)
        host.runs[0].resolve(scriptDone('live'))
      }
    }
  }
)

test(
  'the 202 is lost and the host can no longer LOOK AT its mark for the key: its refusal says neither taken nor never taken, and the operation holds',
  opts,
  async () => {
    /** `[what, spoil(host, jobId)]` — the mark's path answers something other than "there" or "not there". */
    const MARK_UNREADABLE = [
      [
        'a folder under the mark’s name',
        async (host, jobId) => {
          await rm(host.markPath(jobId))
          await mkdir(host.markPath(jobId))
        }
      ],
      [
        'a link under the mark’s name',
        async (host, jobId) => {
          await rm(host.markPath(jobId))
          await symlink('/nowhere/at/all', host.markPath(jobId))
        }
      ],
      [
        'the jobs directory is a file',
        async (host) => {
          await rm(host.config.jobsDir, { recursive: true })
          await writeFile(host.config.jobsDir, 'not a directory')
        }
      ]
    ]
    for (const [unreadable, spoil] of MARK_UNREADABLE) {
      for (const [changed, refusal, change] of HOST_CHANGES) {
        const what = `${unreadable}; ${changed}`
        await db.reset()
        const { pool, host, h, owner } = await setupRealHost({ loseGoLive: (n) => n === 1 })
        await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        await until(() => host.runs.length === 1, 'the script started')
        const jobId = host.answers[0].body.jobId
        const row = await opRow(pool)
        host.restart()
        await rm(host.recordPath(jobId), { force: true })
        await spoil(host, jobId)
        await change(host)
        for (let i = 0; i < 2; i++) {
          const read = await state(h, owner)
          assert.deepEqual(
            host.answers.at(-1),
            { status: refusal.status, body: { code: refusal.code } },
            `${what}: no word on the key`
          )
          assert.equal(read.operation.state, 'running', `${what}: read ${i} — still held`)
          assert.equal(read.operation.confirmed, false, what)
          assert.equal(read.publish, 'draft', what)
        }
        const held = await opRow(pool)
        assert.equal(held.state, 'starting', what)
        assert.equal(held.ref, row.ref, what)
        assert.equal(host.runs.length, 1, what)
        host.runs[0].resolve(scriptDone('live'))
      }
    }
  }
)

test(
  'the host cannot write its mark for the key: it takes nothing — no record, no script — and says so with a 503 that ends nothing; the same key is taken once the store writes again',
  opts,
  async () => {
    let broken = true
    const { pool, host, h, owner } = await setupRealHost({ failAccept: () => broken })
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(host.answers[0].status, 503)
    assert.equal(host.answers[0].body.code, 'JOB_STORE_UNAVAILABLE')
    assert.equal('accepted' in host.answers[0].body, false)
    assert.notEqual(res.status, 202, 'nothing was started, and the door does not say otherwise')
    const row = await opRow(pool)
    assert.equal(row.state, 'starting', 'held, not ended')
    assert.equal(row.job_id, null)
    assert.equal(host.runs.length, 0)
    assert.equal(host.records.size, 0)
    assert.equal(host.marks(), 0)

    const read = await state(h, owner)
    assert.equal(host.answers.at(-1).status, 503, 'asked again, same answer')
    assert.equal(read.operation.state, 'running')
    assert.equal(read.operation.confirmed, false)
    assert.equal(host.runs.length, 0)

    broken = false
    const taken = await state(h, owner)
    assert.equal(host.answers.at(-1).status, 202)
    assert.equal(taken.operation.jobId, host.answers.at(-1).body.jobId)
    assert.equal(host.marks(), 1)
    await until(() => host.runs.length === 1, 'the script started')
    host.runs[0].resolve(scriptDone('live'))
    await until(() => host.records.get(taken.operation.jobId)?.state === 'done', 'the job ended')
    const ended = await state(h, owner)
    assert.equal(ended.publish, 'published')
    assert.equal(ended.operation, null)
    assert.equal((await opRow(pool)).ref, row.ref)
  }
)

// ── The site's own domain through the same operation: carried, connected, taken out, asked again ─

const DOMAIN = 'shop.example.com'
const dnsFail = (code) => Object.assign(new Error(`query${code}`), { code })
/** What `go-live.sh` prints for one domain (step 4), as `settleGoLive` reads it. */
const routed = (domain) => `==> ingress: ${domain} → tracy-web http://127.0.0.1:51710\n`
/** The line of a host still running the script from before #1037: a rule straight to the site's port. */
const routedDirect = (domain) => `==> ingress: ${domain} → 127.0.0.1:8123\n`
const removed = (domain) => `==> ingress: removed ${domain}\n`
const notOurs = (domain) => `==> ingress: ${domain} is not routed to this site\n`
const nameRow = async (pool, name = DOMAIN) =>
  (await pool.query('select * from site_name where name = $1', [name])).rows[0] ?? null

/**
 * A site with one own domain saved through the real door. `dns.txt` / `dns.cname` are
 * `{ name: answer | Error | () => answer }`; with `proven` (the default) both records are right.
 */
async function ownSetup({ hostOptions, proven = true } = {}) {
  const { pool } = db
  const host = fakeHost(hostOptions)
  const dns = { txt: {}, cname: {}, asked: [] }
  const answer = (kind) => async (name) => {
    dns.asked.push(`${kind} ${name}`)
    const found = dns[kind][name]
    if (found === undefined) throw dnsFail(kind === 'txt' ? 'ENOTFOUND' : 'ENODATA')
    const value = typeof found === 'function' ? await found() : found
    if (value instanceof Error) throw value
    return value
  }
  // What the real domain answers when Tracy asks it over HTTPS: this site's proof, unless a test
  // says otherwise (`probe.answer`: a reading, or a function of the row asked).
  const probe = { answer: { status: 'ok' }, asked: [] }
  const h = harness(
    pool,
    host.fetchImpl,
    { resolveTxt: answer('txt'), resolveCname: answer('cname') },
    async (row) => {
      probe.asked.push(row)
      return typeof probe.answer === 'function' ? probe.answer(row) : probe.answer
    }
  )
  await site(pool)
  // A site with a copy on its host and a Tracy address: what a removal asks before it takes a
  // domain away (#1037).
  await pool.query(
    "update site set attached = true, address = 'https://lantern.tracy.test/' where site_key = $1",
    [SITE]
  )
  const owner = await h.cookieFor('owner@x.y')
  // 🔒 A DOMAIN THE SITE ALREADY HAS, on a server without Cloudflare for SaaS: reserved before this
  // server stopped offering new ones (the reserve door now answers `OWN_DOMAIN_UNAVAILABLE` here,
  // `site-domain-provider.test.mjs`). Everything below is how such a domain is still published,
  // probed and removed through the host's tunnel (#1037, slice 1).
  const token = randomBytes(24).toString('hex')
  await pool.query(
    `insert into site_name(name, site_key, kind, state, token, hold_until)
     values ($1, $2, 'custom', 'pending', $3, now() + interval '72 hours')`,
    [DOMAIN, SITE, token]
  )
  if (proven) {
    dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    dns.cname[DOMAIN] = [TARGET]
  }
  /** End the host's job `id` as its script would: exit code, its lines, and (exit 0) the closing line. */
  const end = (id, op, { code = 0, lines = '', closing = code === 0 } = {}) => {
    host.jobs[id] = {
      ...host.jobs[id],
      state: code === 0 ? 'done' : 'failed',
      exitCode: code,
      step: `go-live:${op}`,
      output: closing ? said(op, lines) : lines
    }
  }
  /** Publish and let the host connect the domain: the site is live at its own domain afterwards. */
  const connect = async () => {
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 202)
    const { jobId } = await res.json()
    end(jobId, 'live', { lines: routed(DOMAIN) })
    // The read that hears the job's ending also asks the domain itself, and its proof connects it.
    const after = await state(h, owner)
    assert.equal(after.publish, 'published')
    assert.equal((await nameRow(pool)).state, 'active')
    return jobId
  }
  return { pool, host, h, owner, dns, token, end, connect, probe }
}

test(
  'going live with an own domain DNS proves: the domain goes to the host with the target it was measured against, and is connected only when the script says it added the rule',
  opts,
  async () => {
    const { pool, host, h, owner, dns, end } = await ownSetup()
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.deepEqual(sent(host), { label: 'lantern', op: 'live', domains: [DOMAIN], routingTarget: TARGET })
    assert.deepEqual(body.operation.domains, [DOMAIN])
    // DNS was read for THIS publish, both records, and nothing else was asked of it.
    assert.deepEqual(dns.asked.sort(), [`cname ${DOMAIN}`, `txt _tracy.${DOMAIN}`])

    const op = await opRow(pool)
    assert.deepEqual(op.domains, [DOMAIN])
    assert.equal(op.target, TARGET)
    assert.equal(op.attempt, 0)
    const pending = await nameRow(pool)
    assert.equal(pending.state, 'pending', 'the host took the job; the domain is not connected yet')
    assert.notEqual(pending.carried_at, null, 'from here the host may have its rule')
    assert.notEqual(pending.checked_at, null, 'the reading the publish was decided on is on record')
    assert.equal(pending.routing_target, TARGET)
    assert.equal(await flag(pool), 'draft')

    end(body.jobId, 'live', { lines: `==> mail egress: OPEN\n${routed(DOMAIN)}` })
    const done = await state(h, owner)
    assert.equal(done.publish, 'published')
    assert.equal(done.operation, null)
    assert.equal((await nameRow(pool)).state, 'active')
    const audited = (await pool.query("select detail from audit where action = 'site.go-live'")).rows
    assert.deepEqual(audited, [{ detail: { op: 'live', domains: [DOMAIN], jobId: body.jobId } }])

    const settings = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
    assert.equal(settings.addressChange.status, 'ready')
    assert.equal('pending' in settings.addressChange, false)
    assert.equal(settings.addressChange.connected.length, 1)
    assert.equal(settings.addressChange.connected[0].name, DOMAIN)
    assert.equal(settings.addressChange.connected[0].state, 'connected')
    assert.deepEqual(settings.addressChange.connected[0].routing, {
      type: 'CNAME',
      name: DOMAIN,
      value: TARGET
    })
  }
)

/**
 * What may stand between a saved domain and a proof, when Publish is pressed: `[what, arrange(dns,
 * token), hostOptions]`. In every one the site is published at its Tracy address, WITHOUT the domain.
 */
const NOT_PROVEN = [
  ['the TXT record is not there', (dns) => delete dns.txt[`_tracy.${DOMAIN}`]],
  ['the TXT record has another value', (dns) => (dns.txt[`_tracy.${DOMAIN}`] = [['not-the-token']])],
  ['the TXT lookup fails', (dns) => (dns.txt[`_tracy.${DOMAIN}`] = dnsFail('ESERVFAIL'))],
  ['the host has no tunnel to point at', () => {}, { target: null }],
  ['the host names something that is not a host name', () => {}, { target: 'https://evil.example/x' }],
  ['the host names a target in upper case with a path', () => {}, { target: `${TARGET}/x` }],
  [
    'the host answers its target door with a page',
    () => {},
    { target: () => new Response('<html>502</html>', { status: 502 }) }
  ],
  [
    'the host answers its target door with JSON that names none',
    () => {},
    { target: () => Response.json({ ok: true }) }
  ],
  [
    'the host cannot be reached for its target',
    () => {},
    { target: () => Promise.reject(new Error('unreachable')) }
  ]
]

test(
  'a domain DNS does not prove at the moment Publish is pressed is not carried: the site goes live at its Tracy address, the domain stays pending, and nothing about it reaches the host',
  opts,
  async () => {
    for (const [what, arrange, hostOptions] of NOT_PROVEN) {
      await db.reset()
      const { pool, host, h, owner, dns, token, end } = await ownSetup({ hostOptions })
      arrange(dns, token)
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      assert.equal(res.status, 202, what)
      const body = await res.json()
      assert.deepEqual(sent(host), { label: 'lantern', op: 'live' }, `${what}: no domain, no target`)
      assert.equal('domains' in body.operation, false, what)
      assert.deepEqual((await opRow(pool)).domains, [], what)
      const row = await nameRow(pool)
      assert.equal(row.state, 'pending', what)
      assert.equal(row.carried_at, null, `${what}: nothing was handed to the host`)
      assert.notEqual(row.checked_at, null, `${what}: what DNS said is on record all the same`)
      end(body.jobId, 'live')
      assert.equal((await state(h, owner)).publish, 'published', what)
      const after = await nameRow(pool)
      assert.equal(after.state, 'pending', `${what}: published without it, the domain is not connected`)
      // What the screen is told about the domain is that reading: never "ready" for both.
      const settings = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
      const readiness = settings.addressChange.pending.readiness
      assert.equal(readiness.ownership && readiness.routing, false, what)
      assert.deepEqual(settings.addressChange.connected, [], what)
    }
  }
)

/**
 * What the routing record may read while the TXT record proves the name is the site's (#1037): no
 * particular CNAME is demanded any more — where the customer is told to point the name is not this
 * host's tunnel for ever — so each of these IS carried, and the HTTPS probe decides.
 */
const ROUTING_NOT_READ = [
  ['the CNAME is not there', (dns) => delete dns.cname[DOMAIN]],
  ['the CNAME leads somewhere else', (dns) => (dns.cname[DOMAIN] = ['edge.customers.example.net'])],
  [
    'the CNAME leads to another tunnel',
    (dns) => (dns.cname[DOMAIN] = ['ffffffff-0000-4000-8000-000000000000.cfargotunnel.com'])
  ],
  ['the CNAME lookup fails', (dns) => (dns.cname[DOMAIN] = dnsFail('ETIMEOUT'))],
  ['the CNAME answer is not an answer', (dns) => (dns.cname[DOMAIN] = () => 'x')]
]

test(
  'a domain whose ownership is proven is carried whatever its routing record reads: no CNAME to the tunnel is demanded, and it is connected by its own HTTPS proof or not at all',
  opts,
  async () => {
    for (const [what, arrange] of ROUTING_NOT_READ) {
      for (const opens of [true, false]) {
        await db.reset()
        const { pool, host, h, owner, dns, token, end, probe } = await ownSetup()
        arrange(dns, token)
        probe.answer = opens ? { status: 'ok' } : { status: 'failed', error: 'DNS_NXDOMAIN' }
        const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
        assert.equal(res.status, 202, what)
        const body = await res.json()
        assert.deepEqual(
          sent(host),
          { label: 'lantern', op: 'live', domains: [DOMAIN], routingTarget: TARGET },
          `${what}: carried on its ownership`
        )
        end(body.jobId, 'live', { lines: routed(DOMAIN) })
        assert.equal((await state(h, owner)).publish, 'published', what)
        const row = await nameRow(pool)
        assert.equal(row.state, opens ? 'active' : 'pending', `${what}: the probe decides`)
        const settings = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
        const shown = opens ? settings.addressChange.connected[0] : settings.addressChange.pending
        // The routing reading is still what DNS said — a diagnosis, never "ready" by courtesy.
        assert.equal(shown.readiness.routing, false, what)
        assert.equal(shown.readiness.tls, opens, what)
      }
    }
  }
)

test(
  'the job ends done without the line for the domain: the site IS published, the domain is NOT called connected, and the operation reads failed for that reason',
  opts,
  async () => {
    const { pool, host, h, owner, end } = await ownSetup()
    const { jobId } = await (await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).json()
    // The line of ANOTHER domain, and one that only mentions this one, are not this domain's line.
    // Nor is the line of a host still running the script from before #1037 — a rule straight to the
    // site's port, past this app — a route this app counts as installed.
    end(jobId, 'live', {
      lines: `${routed('other.example.com')}${routedDirect(DOMAIN)}!! could not add ${DOMAIN} to the ingress\n`
    })
    const seen = await state(h, owner)
    assert.equal(seen.publish, 'published')
    assert.equal(seen.operation.state, 'failed')
    assert.equal(seen.operation.code, 'DOMAIN_NOT_ROUTED')
    assert.deepEqual(seen.operation.domains, [DOMAIN])
    assert.equal(
      'retry' in seen.operation,
      false,
      'a publish is not a cleanup: the next press is a new operation'
    )
    const row = await nameRow(pool)
    assert.equal(row.state, 'pending')
    assert.notEqual(row.carried_at, null, 'its rule may be there: removing it goes through the host')
    // Pressed again: a new operation under a new key, the domain measured and carried again.
    const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(again.status, 202)
    assert.equal(host.keys().length, 2)
    assert.deepEqual(sent(host, 1), {
      label: 'lantern',
      op: 'live',
      domains: [DOMAIN],
      routingTarget: TARGET
    })
    end((await again.json()).jobId, 'live', { lines: routed(DOMAIN) })
    assert.equal((await state(h, owner)).operation, null)
    assert.equal((await nameRow(pool)).state, 'active')
  }
)

test(
  'the host says the domains were proven against a tunnel it no longer writes to: the operation ends on that refusal, nothing is published and nothing connected',
  opts,
  async () => {
    const { pool, h, owner } = await ownSetup({
      hostOptions: {
        goLive: () => Response.json({ code: 'ROUTING_TARGET_CHANGED', accepted: false }, { status: 409 })
      }
    })
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { code: 'ROUTING_TARGET_CHANGED' })
    assert.equal((await opRow(pool)).state, 'failed')
    assert.equal((await opRow(pool)).code, 'ROUTING_TARGET_CHANGED')
    assert.equal(await flag(pool), 'draft')
    assert.equal((await nameRow(pool)).state, 'pending')
  }
)

test(
  "back to draft takes the connected domain out: it stops opening the site with the reservation, it is named to the host, and the host's rule is forgotten only for a line of the script that says it is gone or is not this site's",
  opts,
  async () => {
    for (const [what, lines, gone] of [
      ['removed', removed(DOMAIN), true],
      ["the rule is another site's by now", notOurs(DOMAIN), true],
      ['done, with no word on the domain', '==> mail egress: BLOCKED\n', false],
      ['a line about another domain', removed('other.example.com'), false],
      ['a line that only contains the name', `==> ingress: removed ${DOMAIN}.evil.example\n`, false]
    ]) {
      await db.reset()
      const { pool, host, h, owner, end, connect } = await ownSetup()
      await connect()
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
      assert.equal(res.status, 202, what)
      assert.deepEqual(sent(host, 1), { label: 'lantern', op: 'draft', domains: [DOMAIN] }, what)
      assert.equal(await flag(pool), 'draft', `${what}: the flag came down with the reservation`)
      // #1037: the name's requests reach this app, so this app stops serving it NOW — before the
      // host has said or done anything — and no probe still in flight can connect it again.
      const held = await nameRow(pool)
      assert.equal(held.state, 'pending', `${what}: not connected from the reservation on`)
      assert.equal(held.routed_at, null, what)
      assert.equal(held.probe_secret, null, what)
      assert.notEqual(held.carried_at, null, `${what}: the host may still have its rule`)
      end((await res.json()).jobId, 'draft', { lines })
      const seen = await state(h, owner)
      const row = await nameRow(pool)
      if (gone) {
        assert.equal(seen.operation, null, what)
        assert.equal(row.state, 'pending', `${what}: still the site's, no longer connected`)
        assert.equal(row.carried_at, null, what)
      } else {
        assert.equal(seen.operation.state, 'failed', what)
        assert.equal(seen.operation.code, 'DOMAIN_STILL_ROUTED', what)
        assert.equal(seen.operation.retry, true, what)
        assert.equal(row.state, 'pending', `${what}: this app no longer serves it`)
        assert.notEqual(
          row.carried_at,
          null,
          `${what}: its rule may still be on the host, to ask about again`
        )
      }
      assert.equal(seen.publish, 'draft', what)
    }
  }
)

test(
  'a cleanup that half succeeded is recorded as half done, is visible, and is asked for again under the SAME key — which runs only when the next attempt is asked for, never by being looked at',
  opts,
  async () => {
    const { pool, host, h, owner, end, connect } = await ownSetup()
    await connect()
    // A second domain of the site the host also carries (by hand: the door allows one at a time).
    await pool.query(
      "insert into site_name(name,site_key,kind,state,token,carried_at) values('second.example.com',$1,'custom','active',repeat('c',48),now())",
      [SITE]
    )
    const first = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    const { jobId } = await first.json()
    assert.deepEqual(sent(host, 1).domains.sort(), ['second.example.com', DOMAIN].sort())
    const key = host.goLiveCalls()[1].body.jobKey
    const ref = (await opRow(pool)).ref

    // The script took one out, could not take the other, and ended non-zero with no closing line.
    end(jobId, 'draft', {
      code: 1,
      lines: `==> mail egress: BLOCKED\n${removed('second.example.com')}!! could not remove ${DOMAIN} from the ingress — it may still open the site\n!! 1 domain(s) could not be removed from the ingress\n`
    })
    const failed = await state(h, owner)
    assert.equal(failed.publish, 'draft')
    assert.equal(failed.operation.state, 'failed')
    assert.equal(failed.operation.code, 'DOMAIN_STILL_ROUTED')
    assert.equal(failed.operation.retry, true)
    // The finished half is on record; the other half still reads as it is on the host.
    assert.equal((await nameRow(pool, 'second.example.com')).state, 'pending')
    assert.equal((await nameRow(pool, 'second.example.com')).carried_at, null)
    assert.equal((await nameRow(pool)).state, 'pending')
    assert.notEqual((await nameRow(pool)).carried_at, null, 'its rule may still be on the host')
    assert.equal((await opRow(pool)).attempt, 0)

    // Looked at, again and again, by a read and by the follow-up sweep: nothing runs again.
    for (let i = 0; i < 3; i++) await state(h, owner)
    const base = await dbNow(pool)
    const swept = await settleFollowUps(pool, {
      pollJob: async () => assert.fail('an ended operation is not asked about'),
      now: () => base + 60_000,
      log: { info() {}, warn() {} }
    })
    assert.equal(swept.settled, 0)
    assert.deepEqual(host.reruns, [], 'a failed job is not run again for being looked at')
    assert.equal(host.goLiveCalls().length, 2)

    // Pressed again: the same operation, under the same key, as its next attempt — with only the
    // domain that is still to go.
    const again = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(again.status, 202)
    const retried = host.goLiveCalls().at(-1).body
    assert.equal(retried.jobKey, key, 'the same key')
    assert.equal(retried.attempt, 1)
    assert.deepEqual(retried.domains, [DOMAIN], 'the finished half is not asked for twice')
    assert.deepEqual(host.reruns, [jobId], 'the host ran the same job again')
    assert.equal((await again.json()).jobId, jobId)
    const row = await opRow(pool)
    assert.equal(row.ref, ref)
    assert.equal(row.attempt, 1)
    assert.equal(row.state, 'running')
    assert.equal(row.code, null)
    assert.equal(host.keys().length, 2, 'the publish and ONE draft: no second key for the same cleanup')

    // A second press while it runs is refused; the same attempt asked again starts nothing more.
    const beside = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(beside.status, 409)
    assert.deepEqual(host.reruns, [jobId])

    end(jobId, 'draft', { lines: removed(DOMAIN) })
    const done = await state(h, owner)
    assert.equal(done.operation, null)
    assert.equal(done.publish, 'draft')
    assert.equal((await nameRow(pool)).state, 'pending')
    assert.equal((await nameRow(pool)).carried_at, null)
    // Done: the next draft is a new operation, with a key of its own.
    const fresh = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(fresh.status, 202)
    assert.equal(host.keys().length, 3)
    assert.equal((await opRow(pool)).attempt, 0)
  }
)

test(
  'a back to draft at the Tracy address that failed is taken back under its own key too; a publish that failed, and a cleanup the host never took, are not',
  opts,
  async () => {
    const { pool, host, h, owner } = await setup()
    const go = async (op) => h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op })
    const live = await (await go('live')).json()
    host.jobs[live.jobId] = { state: 'failed', exitCode: 1, step: 'go-live:live', output: '!! no' }
    assert.equal((await state(h, owner)).operation.code, 'JOB_FAILED')
    assert.equal('retry' in (await state(h, owner)).operation, false)
    await go('live')
    assert.equal(host.keys().length, 2, 'a failed publish pressed again is a new operation')
    assert.equal((await opRow(pool)).attempt, 0)
    host.jobs['golive-2'] = { state: 'done', exitCode: 0, step: 'go-live:live', output: said('live') }
    await state(h, owner)

    const draft = await (await go('draft')).json()
    const ref = (await opRow(pool)).ref
    host.jobs[draft.jobId] = {
      state: 'failed',
      exitCode: 1,
      step: 'go-live:draft',
      output: '!! could not reload Apache'
    }
    const failed = await state(h, owner)
    assert.equal(failed.operation.code, 'JOB_FAILED')
    assert.equal(failed.operation.retry, true)
    const again = await go('draft')
    assert.equal(again.status, 202)
    assert.equal((await opRow(pool)).ref, ref)
    assert.equal((await opRow(pool)).attempt, 1)
    assert.equal(host.goLiveCalls().at(-1).body.attempt, 1)
    assert.equal(host.keys().length, 3)
    assert.deepEqual(host.reruns, [draft.jobId])

    // A draft the host REFUSED before taking it has no job to run again: the next press is new.
    await db.reset()
    const refused = await setup({
      goLive: (payload, n) =>
        n === 1
          ? Response.json({ code: 'NOT_FOUND', accepted: false }, { status: 404 })
          : Response.json({ jobId: `golive-${n}` }, { status: 202 })
    })
    const one = await refused.h.send('POST', `/api/sites/${SITE}/go-live`, refused.owner, { op: 'draft' })
    assert.equal(one.status, 404)
    const firstRef = (await opRow(refused.pool)).ref
    const two = await refused.h.send('POST', `/api/sites/${SITE}/go-live`, refused.owner, { op: 'draft' })
    assert.equal(two.status, 202)
    assert.notEqual((await opRow(refused.pool)).ref, firstRef)
    assert.equal((await opRow(refused.pool)).attempt, 0)
    assert.equal('attempt' in refused.host.goLiveCalls().at(-1).body, false)
  }
)

test(
  'removing a connected domain is an operation of the site: 202 and Removing…, the name stops opening the site at once, the row is kept until the script says the rule is out, a failure is on record, and the same removal is taken back under its key',
  opts,
  async () => {
    const { pool, host, h, owner, end, connect } = await ownSetup()
    await connect()
    const res = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    assert.equal(res.status, 202)
    const body = await res.json()
    assert.equal(body.op, 'drop-domain')
    assert.equal(body.operation.op, 'drop-domain')
    assert.equal(body.operation.state, 'running')
    assert.deepEqual(body.operation.domains, [DOMAIN])
    assert.deepEqual(sent(host, 1), { label: 'lantern', op: 'drop-domain', domains: [DOMAIN] })
    const key = host.goLiveCalls()[1].body.jobKey
    assert.equal(body.publish, 'published', 'the site stays live at its Tracy address')
    const held = await nameRow(pool)
    assert.equal(held.state, 'pending', 'this app stops serving the name with the reservation (#1037)')
    assert.equal(held.probe_secret, null, 'and nothing can prove it connected again')
    assert.notEqual(held.carried_at, null, 'the row stays until the host says its rule is out')

    // While it runs: one operation per site, whatever is pressed.
    const publish = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
    assert.equal(publish.status, 409)
    assert.equal((await publish.json()).code, 'PUBLISH_BUSY')
    const twice = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    assert.equal(twice.status, 409)
    assert.equal(await flag(pool), 'published', 'the refused draft lowered nothing')
    // The list of sites does not call this "publishing": the site's standing is not changing.
    const listed = await (await h.get('/api/sites', owner)).json()
    assert.equal(JSON.stringify(listed).includes('"publishing"'), false)

    // It fails: on record, visible, the domain still connected.
    end(body.jobId, 'drop-domain', { code: 1, lines: `!! could not remove ${DOMAIN} from the ingress\n` })
    const failed = await state(h, owner)
    assert.equal(failed.operation.op, 'drop-domain')
    assert.equal(failed.operation.state, 'failed')
    assert.equal(failed.operation.code, 'DOMAIN_STILL_ROUTED')
    assert.equal(failed.operation.retry, true)
    assert.equal(failed.publish, 'published')
    assert.equal((await nameRow(pool)).state, 'pending')
    assert.notEqual((await nameRow(pool)).carried_at, null)

    // Asked again: the same key, the next attempt.
    const again = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    assert.equal(again.status, 202)
    assert.equal(host.goLiveCalls().at(-1).body.jobKey, key)
    assert.equal(host.goLiveCalls().at(-1).body.attempt, 1)
    assert.deepEqual(host.reruns, [body.jobId])

    end(body.jobId, 'drop-domain', { lines: removed(DOMAIN) })
    const done = await state(h, owner)
    assert.equal(done.operation, null)
    assert.equal(done.publish, 'published')
    assert.equal(await nameRow(pool), null, "the domain is no longer the site's")
    const audited = (await pool.query("select detail from audit where action = 'site.domain.remove'")).rows
    assert.deepEqual(audited, [{ detail: { name: DOMAIN, jobId: body.jobId } }])
    // Gone: removing it once more is a 404. Saving it again is a NEW domain, which a server without
    // Cloudflare for SaaS does not start (#1037, slice 2).
    const none = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    assert.equal(none.status, 404)
    const saved = await h.send('PUT', `/api/sites/${SITE}/address`, owner, { name: DOMAIN, kind: 'custom' })
    assert.equal(saved.status, 503)
    assert.equal((await saved.json()).code, 'OWN_DOMAIN_UNAVAILABLE')
  }
)

test(
  'a removal whose job ends done without the line for the domain, or with the closing line of another direction, removes nothing',
  opts,
  async () => {
    for (const [what, output, code] of [
      ['no word on the domain', said('drop-domain'), 'DOMAIN_STILL_ROUTED'],
      ['the closing line of a draft', said('draft', removed(DOMAIN)), 'JOB_NO_RESULT'],
      ['no closing line at all', removed(DOMAIN), 'JOB_NO_RESULT']
    ]) {
      await db.reset()
      const { pool, host, h, owner, connect } = await ownSetup()
      await connect()
      const res = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
      const { jobId } = await res.json()
      host.jobs[jobId] = { state: 'done', exitCode: 0, step: 'go-live:drop-domain', output }
      const seen = await state(h, owner)
      assert.equal(seen.operation.state, 'failed', what)
      assert.equal(seen.operation.code, code, what)
      assert.notEqual(await nameRow(pool), null, `${what}: the row is still there`)
    }
  }
)

test(
  'two presses at the same moment are one operation: two removals, two publishes with a domain, a removal beside a publish',
  opts,
  async () => {
    const pairs = [
      [
        'two removals',
        (h, owner) => h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN }),
        null
      ],
      [
        'two drafts',
        (h, owner) => h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' }),
        null
      ],
      [
        'a removal beside a draft',
        (h, owner) => h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN }),
        (h, owner) => h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' })
      ]
    ]
    for (const [what, one, other] of pairs) {
      await db.reset()
      const { pool, host, h, owner, connect } = await ownSetup()
      await connect()
      const answers = await Promise.all([one(h, owner), (other ?? one)(h, owner)])
      const statuses = answers.map((res) => res.status).sort()
      assert.deepEqual(statuses, [202, 409], what)
      assert.equal(host.keys().length, 2, `${what}: the publish before, and ONE operation now`)
      assert.equal((await pool.query('select count(*)::int as n from site_publish_op')).rows[0].n, 1, what)
      const refused = await answers.find((res) => res.status === 409).json()
      assert.ok(['PUBLISH_BUSY', 'ADDRESS_CHANGE_BUSY'].includes(refused.code), `${what}: ${refused.code}`)
    }
  }
)

test(
  'an Editor may publish and sees the domain without its proof; `domains` typed into the publish door is still refused by name',
  opts,
  async () => {
    const { pool, host, h, owner, token } = await ownSetup()
    // ADR 0028: the Editor publishes (the Admin's place before 08/10); a Viewer does not.
    await seat(pool, SITE, 'admin@x.y', 'editor')
    await seat(pool, SITE, 'editor@x.y', 'viewer')
    const admin = await h.cookieFor('admin@x.y')
    const editor = await h.cookieFor('editor@x.y')
    for (const cookie of [admin, editor]) {
      const text = await (await h.get(`/api/sites/${SITE}/settings`, cookie)).text()
      assert.equal(text.includes(token), false, 'the token is nowhere in what this seat is told')
      const settings = JSON.parse(text)
      assert.equal(settings.addressChange.pending.name, DOMAIN)
      assert.equal(settings.addressChange.allowed, false)
      assert.equal('verification' in settings.addressChange.pending, false)
    }
    assert.equal((await (await h.get(`/api/sites/${SITE}/settings`, owner)).text()).includes(token), true)
    for (const domains of [[DOMAIN], [], null, 'shop.example.com', ['evil.example.com']]) {
      const res = await h.send('POST', `/api/sites/${SITE}/go-live`, admin, { op: 'live', domains })
      assert.equal(res.status, 400)
      assert.deepEqual(await res.json(), { code: 'DOMAINS_NOT_SUPPORTED' })
    }
    assert.equal(host.goLiveCalls().length, 0)
    assert.equal((await h.send('POST', `/api/sites/${SITE}/go-live`, editor, { op: 'live' })).status, 403)
    // The Editor's publish carries what DNS proves, exactly as the Owner's does.
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, admin, { op: 'live' })
    assert.equal(res.status, 202)
    assert.deepEqual(sent(host).domains, [DOMAIN])
    // But removing the domain is the Owner's.
    const remove = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, admin, { name: DOMAIN })
    assert.equal(remove.status, 403)
  }
)

/** What `teardown.sh` prints last when nothing of the site is left on the host. */
const tornDown = 'TRACY_RESULT torn_down=1 label=lantern\n==> lantern is gone'
/** The asks for a teardown the fake host got, and the job the first of them named. */
const teardownAsks = (host) => host.goLiveCalls().filter((call) => call.body.op === 'teardown')
const teardownJob = (host) => host.keyed.get(teardownAsks(host)[0]?.body.jobKey)
/** Wait until the host has been asked for a teardown and named its job. */
async function teardownAsked(host) {
  for (let i = 0; i < 400 && teardownJob(host) === undefined; i++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  assert.notEqual(teardownJob(host), undefined, 'the host was asked for the teardown')
  return teardownJob(host)
}
/** End the host's teardown job as `teardown.sh` would. */
const endTeardown = (host, id, { code = 0, output = code === 0 ? tornDown : '' } = {}) => {
  host.jobs[id] = {
    ...host.jobs[id],
    state: code === 0 ? 'done' : 'failed',
    exitCode: code,
    step: 'go-live:teardown',
    output
  }
}
const siteCount = async (pool) => (await pool.query('select count(*)::int as n from site')).rows[0].n
const liveSeats = async (pool) =>
  (await pool.query('select count(*)::int as n from seat where revoked_at is null')).rows[0].n

test(
  'a site is not deleted beside an operation of its own: refused whole while one holds it, with nothing forgotten or torn down',
  opts,
  async () => {
    const { pool, host, h, owner, end } = await ownSetup()
    const { jobId } = await (await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).json()
    const refused = await h.send('DELETE', `/api/sites/${SITE}`, owner)
    assert.equal(refused.status, 409)
    const body = await refused.json()
    assert.equal(body.code, 'PUBLISH_BUSY')
    assert.equal(body.operation.state, 'running')
    assert.equal(teardownAsks(host).length, 0, 'no teardown was asked for')
    assert.equal(
      host.calls.some((call) => call.path === '/_host/teardown'),
      false
    )
    assert.notEqual(await nameRow(pool), null, 'the site and its names are all still there')
    assert.equal(await siteCount(pool), 1)
    assert.equal(await liveSeats(pool), 1)
    // Ended: the delete goes through, as an operation of its own under a key of its own.
    end(jobId, 'live', { lines: routed(DOMAIN) })
    await state(h, owner)
    const going = h.send('DELETE', `/api/sites/${SITE}`, owner)
    endTeardown(host, await teardownAsked(host))
    const gone = await going
    assert.equal(gone.status, 200)
    assert.equal((await gone.json()).removed, true)
    assert.deepEqual(teardownAsks(host)[0].body, {
      label: 'lantern',
      op: 'teardown',
      publicOrigin: env.TRACY_ORIGIN,
      jobKey: teardownAsks(host)[0].body.jobKey
    })
    assert.equal(
      host.calls.some((call) => call.path === '/_host/teardown'),
      false,
      'never the unkeyed door'
    )
    assert.equal(await siteCount(pool), 0)
    assert.equal(await nameRow(pool), null)
  }
)

test(
  'a delete TAKES the site before the host is asked: a publish, a draft, a domain change or a second delete pressed after it starts nothing — and the row goes only once the host said the site is gone',
  opts,
  async () => {
    const { pool, host, h, owner } = await ownSetup()
    const going = h.send('DELETE', `/api/sites/${SITE}`, owner)
    const job = await teardownAsked(host)
    // The teardown is at work on the host. The site is held by its delete, and still whole in the book.
    const held = (await pool.query('select * from site_publish_op where site_key = $1', [SITE])).rows[0]
    assert.equal(held.op, 'delete')
    // `starting` until the host's answer to the ask is written down, `running` after: both hold the site.
    assert.ok(['starting', 'running'].includes(held.state), held.state)
    assert.equal(await siteCount(pool), 1)
    assert.equal(await liveSeats(pool), 1)
    assert.notEqual(await nameRow(pool), null)
    for (const [what, press, code] of [
      ['publish', () => h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' }), 'PUBLISH_BUSY'],
      ['draft', () => h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'draft' }), 'PUBLISH_BUSY'],
      ['a second delete', () => h.send('DELETE', `/api/sites/${SITE}`, owner), 'PUBLISH_BUSY'],
      [
        'renaming the site',
        () =>
          h.send('PUT', `/api/sites/${SITE}/address`, owner, { name: 'renamed.localhost', kind: 'managed' }),
        'ADDRESS_CHANGE_BUSY'
      ],
      [
        'removing the domain',
        () => h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN }),
        'ADDRESS_CHANGE_BUSY'
      ]
    ]) {
      const res = await press()
      assert.equal(res.status, 409, what)
      assert.equal((await res.json()).code, code, what)
    }
    assert.equal(host.keys().length, 1, 'the host heard of one operation: the teardown')
    assert.equal(await siteCount(pool), 1, 'still there: the host has not said the site is gone')
    // What the screens are told meanwhile.
    const seen = await state(h, owner)
    assert.equal(seen.operation.op, 'delete')
    assert.equal(seen.operation.state, 'running')

    endTeardown(host, job)
    const gone = await going
    assert.equal(gone.status, 200)
    const body = await gone.json()
    assert.equal(body.removed, true)
    assert.equal(body.host, true)
    assert.equal(await siteCount(pool), 0)
    assert.equal(await liveSeats(pool), 0)
    assert.equal(await nameRow(pool), null)
  }
)

test(
  'a teardown that FAILED, or ended without its own closing line, deletes nothing: the row and the seats stay, the delete reads failed, and deleting again is the same operation taken up under its key',
  opts,
  async () => {
    /** `[what, how the host's job ends]` */
    const ENDINGS = [
      [
        'the script failed',
        (host, id) => endTeardown(host, id, { code: 1, output: '!! teardown of lantern did not finish: x' })
      ],
      [
        'done without the closing line',
        (host, id) => endTeardown(host, id, { output: '==> removed things' })
      ],
      [
        "done with another site's closing line",
        (host, id) => endTeardown(host, id, { output: 'TRACY_RESULT torn_down=1 label=lantern2' })
      ]
    ]
    for (const [what, ending] of ENDINGS) {
      await db.reset()
      const { pool, host, h, owner } = await ownSetup()
      const going = h.send('DELETE', `/api/sites/${SITE}`, owner)
      const job = await teardownAsked(host)
      ending(host, job)
      const res = await going
      assert.equal(res.status, 409, what)
      const body = await res.json()
      assert.equal(body.code, 'TEARDOWN_FAILED', what)
      assert.equal(body.removed, false, what)
      assert.equal(await siteCount(pool), 1, `${what}: the row is kept`)
      assert.equal(await liveSeats(pool), 1, `${what}: the seat to ask again from is kept`)
      assert.notEqual(await nameRow(pool), null, what)
      const op = (await pool.query('select * from site_publish_op where site_key = $1', [SITE])).rows[0]
      assert.equal(op.op, 'delete', what)
      assert.equal(op.state, 'failed', what)
      const seen = await state(h, owner)
      assert.equal(seen.operation.op, 'delete', what)
      assert.equal(seen.operation.state, 'failed', what)
      assert.equal(seen.operation.retry, true, what)

      // Again: the same key, the next attempt — and now the host finishes.
      const again = h.send('DELETE', `/api/sites/${SITE}`, owner)
      for (let i = 0; i < 400 && teardownAsks(host).at(-1).body.attempt !== 1; i++)
        await new Promise((resolve) => setTimeout(resolve, 10))
      assert.equal(teardownAsks(host).at(-1).body.attempt, 1, `${what}: asked as the next attempt`)
      assert.equal(host.keys().length, 1, `${what}: under the same key`)
      endTeardown(host, job)
      const gone = await again
      assert.equal(gone.status, 200, what)
      assert.equal(await siteCount(pool), 0, what)
    }
  }
)

test(
  'a delete whose door is no longer there to hear it is finished with nobody on the screen: the sweep hears the host say the site is gone and closes the book — and hears nothing from a job that only stopped',
  opts,
  async () => {
    const { pool, host, h, owner } = await ownSetup()
    const going = h.send('DELETE', `/api/sites/${SITE}`, owner)
    const job = await teardownAsked(host)
    const sweep = () =>
      pool.query("update site_publish_op set sweep_at = now() - interval '1 second'").then(() =>
        sweepPublishOps(pool, h.config, {
          fetchImpl: host.fetchImpl,
          log: { info() {}, warn() {} },
          closeDeleted: h.app.closeDeletedSite
        })
      )
    // Still running on the host: the sweep asks, and nothing is removed.
    await sweep()
    assert.equal(await siteCount(pool), 1)
    // Ended by a signal, with no exit code: not the script saying anything. Still held, still whole.
    host.jobs[job] = {
      ...host.jobs[job],
      state: 'failed',
      exitCode: null,
      unobserved: true,
      signal: 'SIGTERM'
    }
    await sweep()
    assert.equal(await siteCount(pool), 1, 'a job that only stopped deletes nothing')
    assert.equal(await liveSeats(pool), 1)
    const held = (await pool.query('select * from site_publish_op where site_key = $1', [SITE])).rows[0]
    assert.equal(held.state, 'running', 'and the delete goes on holding the site')
    assert.equal(host.keys().length, 1)
    // The host ran the key again and finished: the sweep closes the book.
    endTeardown(host, host.keyed.get(host.keys()[0]))
    await sweep()
    assert.equal(await siteCount(pool), 0)
    assert.equal(await liveSeats(pool), 0)
    assert.equal(await nameRow(pool), null)
    // The door that started it, still waiting in this test, finds the site gone.
    const res = await going
    assert.equal(res.status, 200)
    assert.equal((await res.json()).removed, true)
  }
)

test(
  'a process that hears the host finish a delete but cannot close the book only writes the mark: the site stays whole and held, and the next look that can close it does — without asking the host again',
  opts,
  async () => {
    // The door hearing the host itself is 'a delete TAKES the site before the host is asked: …'. Here the
    // hearing is a sweep with no closer.
    const second = await ownSetup()
    const waiting = second.h.send('DELETE', `/api/sites/${SITE}`, second.owner)
    const id = await teardownAsked(second.host)
    endTeardown(second.host, id)
    await second.pool.query("update site_publish_op set sweep_at = now() - interval '1 second'")
    await sweepPublishOps(second.pool, second.h.config, {
      fetchImpl: second.host.fetchImpl,
      log: { info() {}, warn() {} }
    })
    // Whoever heard first, the door ends the same way: removed, and only after the host's word.
    const done = await waiting
    assert.equal(done.status, 200)
    assert.equal(await siteCount(second.pool), 0)
  }
)

// ── #1037: connected means the domain was opened ────────────────────────────────────────────────
// The host's `==> ingress:` line used to make a domain `active`. It now only says the route is
// installed; the domain is connected by a fresh HTTPS probe answered by this site's row for this
// attempt (`sites/domain-probe.js`, `address.js` `confirmOwnDomains`), and by nothing else.
import { sweepLegacyOwnDomains, sweepOwnDomainProbes } from '../src/cron.js'

const due = (pool, name = DOMAIN) =>
  pool.query('update site_name set probe_next_at = now() where name = $1', [name])
const shownDomain = async (h, owner) => {
  const { addressChange } = await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()
  return { addressChange, domain: addressChange.pending ?? addressChange.connected[0] ?? null }
}

test(
  '#1037: the host saying the rule is in does not connect a domain — it stays pending with the reason its probe found, is asked again by the sweep, and is connected only by its own proof',
  opts,
  async () => {
    const { pool, host, h, owner, end, probe } = await ownSetup()
    probe.answer = { status: 'failed', error: 'TLS_INVALID' }
    const { jobId } = await (await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).json()
    const handed = await nameRow(pool)
    assert.match(handed.probe_secret, /^[0-9a-f]{64}$/, 'this attempt has a secret of its own')
    assert.equal(handed.routed_at, null)
    assert.deepEqual(probe.asked, [], 'nothing is asked before the host installed the route')
    assert.ok(Number.isSafeInteger(host.goLiveCalls()[0].body.routeGen))

    end(jobId, 'live', { lines: routed(DOMAIN) })
    const seen = await state(h, owner)
    assert.equal(seen.publish, 'published')
    assert.equal(seen.operation, null, "the host's part is done")
    const row = await nameRow(pool)
    assert.equal(row.state, 'pending', 'the rule being in the ingress is not the domain being connected')
    assert.notEqual(row.routed_at, null)
    assert.deepEqual(probe.asked, [{ name: DOMAIN, siteKey: SITE, secret: handed.probe_secret }])
    const shown = await shownDomain(h, owner)
    assert.equal(shown.addressChange.status, 'pending')
    assert.deepEqual(shown.addressChange.connected, [])
    assert.equal(shown.domain.state, 'pending')
    assert.equal(shown.domain.connection.status, 'failed')
    assert.equal(shown.domain.connection.error, 'TLS_INVALID')
    assert.equal(shown.domain.readiness.tls, false)
    assert.equal(typeof shown.domain.connection.checkedAt, 'string')

    // Not due yet: a read and a sweep ask nothing.
    probe.asked.length = 0
    await state(h, owner)
    assert.deepEqual(await sweepOwnDomainProbes(pool, h.config, { probe: () => assert.fail('not due') }), {
      asked: 0,
      connected: []
    })
    assert.deepEqual(probe.asked, [])

    // Every way the real domain can fail to be this site keeps it pending, with that reason.
    for (const error of [
      'DNS_NXDOMAIN',
      'DNS_NO_ADDRESS',
      'DNS_TIMEOUT',
      'DNS_FAILED',
      'ADDRESS_NOT_PUBLIC',
      'TLS_INVALID',
      'CONNECT_FAILED',
      'TIMEOUT',
      'REDIRECT',
      'HTTP_STATUS',
      'EMPTY',
      'TOO_LARGE',
      'WRONG_ANSWER'
    ]) {
      await due(pool)
      const swept = await sweepOwnDomainProbes(pool, h.config, {
        probe: async () => ({ status: 'failed', error })
      })
      assert.deepEqual(swept, { asked: 1, connected: [] }, error)
      const after = await nameRow(pool)
      assert.equal(after.state, 'pending', error)
      assert.deepEqual(after.probe_reading, { status: 'failed', error }, error)
      // probe_next_at is stamped by the database clock: compare it with that clock, not Date.now().
      assert.ok(
        after.probe_next_at.getTime() > (await dbNow(pool)) + 5_000,
        `${error}: asked again later, not at once`
      )
      assert.equal((await shownDomain(h, owner)).domain.connection.error, error)
    }
    // A probe that throws, or answers nonsense, is a probe that failed.
    for (const broken of [
      async () => {
        throw new Error('socket hang up')
      },
      async () => null,
      async () => ({ status: 'OK' }),
      async () => ({})
    ]) {
      await due(pool)
      assert.deepEqual(await sweepOwnDomainProbes(pool, h.config, { probe: broken }), {
        asked: 1,
        connected: []
      })
      assert.equal((await nameRow(pool)).state, 'pending')
    }
    assert.ok((await nameRow(pool)).probe_tries >= 17)

    // The domain opens the site: connected, by the sweep, with nobody on the screen.
    await due(pool)
    assert.deepEqual(await sweepOwnDomainProbes(pool, h.config, { probe: async () => ({ status: 'ok' }) }), {
      asked: 1,
      connected: [DOMAIN]
    })
    const connected = await nameRow(pool)
    assert.equal(connected.state, 'active')
    assert.equal(connected.probe_next_at, null)
    assert.equal(connected.probe_tries, 0)
    const shownAfter = await shownDomain(h, owner)
    assert.equal(shownAfter.addressChange.status, 'ready')
    assert.equal(shownAfter.domain.state, 'connected')
    assert.equal(shownAfter.domain.connection.status, 'ok')
    assert.equal(shownAfter.domain.readiness.tls, true)
    const audited = (await pool.query("select detail from audit where action = 'site.domain.connect'")).rows
    assert.deepEqual(audited, [{ detail: { name: DOMAIN } }])
  }
)

test(
  '#1037: a probe that ends late connects nothing — the name was removed, saved again, handed to a newer attempt, is being taken out, or its site is no longer published',
  opts,
  async () => {
    const late = [
      [
        'the name was removed meanwhile',
        async ({ pool }) => pool.query('delete from site_name where name = $1', [DOMAIN])
      ],
      [
        'the name was saved again (a new reservation)',
        async ({ pool }) =>
          pool.query(
            "update site_name set token = repeat('n', 48), probe_secret = null, routed_at = null where name = $1",
            [DOMAIN]
          )
      ],
      [
        'a newer attempt has its own secret',
        async ({ pool }) =>
          pool.query("update site_name set probe_secret = repeat('9', 64) where name = $1", [DOMAIN])
      ],
      [
        'an operation holds the site (it may be taking this name out)',
        async ({ pool }) =>
          pool.query("update site_publish_op set state = 'running', op = 'drop-domain' where site_key = $1", [
            SITE
          ])
      ],
      [
        'the site went back to draft',
        async ({ pool }) => pool.query("update site set publish = 'draft' where site_key = $1", [SITE])
      ]
    ]
    for (const [what, meanwhile] of late) {
      await db.reset()
      const bed = await ownSetup()
      const { pool, h, owner, end, probe } = bed
      probe.answer = { status: 'failed', error: 'DNS_NXDOMAIN' }
      const { jobId } = await (
        await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
      ).json()
      end(jobId, 'live', { lines: routed(DOMAIN) })
      await state(h, owner)
      assert.equal((await nameRow(pool)).state, 'pending', what)
      await due(pool)
      // The probe is in flight, answers "this site" — and the world changed before it was written.
      const swept = await sweepOwnDomainProbes(pool, h.config, {
        probe: async () => {
          await meanwhile(bed)
          return { status: 'ok' }
        }
      })
      assert.deepEqual(swept, { asked: 1, connected: [] }, what)
      const row = await nameRow(pool)
      if (row)
        assert.equal(row.state, 'pending', `${what}: not connected by an answer that is no longer its own`)
      const connects = await pool.query("select 1 from audit where action = 'site.domain.connect'")
      assert.equal(connects.rowCount, 0, what)
    }
  }
)

/** A name as the flow before #1037 left it: connected on the host's log line, never asked, no route here. */
const asLegacy = async (pool) => {
  await pool.query("update site set publish = 'published' where site_key = $1", [SITE])
  await pool.query(
    `update site_name
        set state = 'active', carried_at = now(), ownership_proven_at = now(), routed_at = null,
            connected_at = null, probe_secret = null, probe_reading = null, probed_at = null,
            probe_next_at = null, migrate_next_at = null
      where name = $1`,
    [DOMAIN]
  )
}
const quiet = { log() {}, info() {}, warn() {}, error() {} }

test(
  '#1037: a site connected before routes went through tracy-web reads pending until the real domain answered through the new route — Publish again brings it over, and it is served meanwhile',
  opts,
  async () => {
    const { pool, host, h, owner, end, probe } = await ownSetup()
    await asLegacy(pool)
    // 🔒 Never asked, so never shown as connected (review of #1037) — though it is being served.
    const before = await shownDomain(h, owner)
    assert.equal(before.domain.state, 'pending')
    assert.equal(before.addressChange.status, 'pending')
    assert.deepEqual(before.addressChange.connected, [])
    assert.deepEqual(before.domain.connection, { status: 'waiting', route: 'direct' })
    assert.equal('holdUntil' in before.domain, false, 'it is not a reservation that can lapse')

    probe.answer = { status: 'failed', error: 'HTTP_STATUS' }
    const res = await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })
    assert.equal(res.status, 202, 'a published site can be published again')
    const { jobId } = await res.json()
    assert.deepEqual(sent(host), { label: 'lantern', op: 'live', domains: [DOMAIN], routingTarget: TARGET })
    assert.equal((await nameRow(pool)).state, 'active', 'still served while its route is replaced')

    // A host still on the old script: its line is not the new route's, and nothing is marked.
    end(jobId, 'live', { lines: routedDirect(DOMAIN) })
    const stale = await state(h, owner)
    assert.equal(stale.operation.code, 'DOMAIN_NOT_ROUTED')
    assert.equal((await nameRow(pool)).routed_at, null)
    assert.deepEqual(probe.asked, [])

    // The host with the new script: route installed, the domain asked — and it did not answer.
    const again = await (await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).json()
    end(again.jobId, 'live', { lines: routed(DOMAIN) })
    assert.equal((await state(h, owner)).operation, null)
    const row = await nameRow(pool)
    assert.notEqual(row.routed_at, null)
    assert.equal(row.state, 'active', 'visitors are being served: a failed probe takes nothing away')
    assert.equal(row.connected_at, null)
    assert.equal(probe.asked.length, 1)
    const failing = await shownDomain(h, owner)
    assert.equal(failing.domain.state, 'pending', 'the route being in is not the domain having answered')
    assert.deepEqual(
      { status: failing.domain.connection.status, error: failing.domain.connection.error },
      { status: 'failed', error: 'HTTP_STATUS' }
    )
    // And it is asked again until it answers: only then does the card say connected.
    await due(pool)
    await sweepOwnDomainProbes(pool, h.config, { probe: async () => ({ status: 'ok' }) })
    const proven = await shownDomain(h, owner)
    assert.equal(proven.domain.state, 'connected')
    assert.equal(proven.addressChange.status, 'ready')
    assert.equal(proven.domain.connection.status, 'ok')
    assert.notEqual((await nameRow(pool)).connected_at, null)
    // 🔒 Published once more: a NEW attempt. What the earlier one proved is not this one's — the name
    // goes on being served and reads pending until this attempt's route is in and its probe answered.
    const provenAt = (await nameRow(pool)).connected_at
    const secretBefore = (await nameRow(pool)).probe_secret
    probe.asked.length = 0
    probe.answer = { status: 'failed', error: 'TIMEOUT' }
    const third = await (await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).json()
    const handedAgain = await nameRow(pool)
    assert.equal(handedAgain.state, 'active', 'served while it is asked again')
    assert.notEqual(handedAgain.probe_secret, secretBefore)
    assert.equal(handedAgain.routed_at, null, "the route mark is the earlier attempt's: cleared")
    assert.equal(handedAgain.connected_at, null, "the proof is the earlier attempt's: cleared")
    const during = await shownDomain(h, owner)
    assert.equal(during.domain.state, 'pending', 'not connected before this attempt was confirmed')
    assert.deepEqual(during.addressChange.connected, [])
    assert.deepEqual(during.domain.connection, { status: 'waiting' })
    // The host job of this attempt FAILS: nothing of the earlier attempt comes back.
    end(third.jobId, 'live', { code: 1 })
    assert.equal((await state(h, owner)).operation.state, 'failed')
    const afterFailedJob = await shownDomain(h, owner)
    assert.equal(afterFailedJob.domain.state, 'pending')
    assert.equal(afterFailedJob.domain.readiness.tls, false)
    assert.equal((await nameRow(pool)).connected_at, null)
    assert.deepEqual(probe.asked, [], 'no route of this attempt, nothing to ask')
    // Published again, the route goes in, and the domain does NOT answer: still pending, with the reason.
    const fourth = await (await h.send('POST', `/api/sites/${SITE}/go-live`, owner, { op: 'live' })).json()
    end(fourth.jobId, 'live', { lines: routed(DOMAIN) })
    await state(h, owner)
    const later = await shownDomain(h, owner)
    assert.equal(later.domain.state, 'pending', 'a failed probe of the new attempt is not connected')
    assert.equal(later.addressChange.status, 'pending')
    assert.equal(later.domain.connection.status, 'failed')
    assert.equal(later.domain.connection.error, 'TIMEOUT')
    assert.equal((await nameRow(pool)).state, 'active', 'and its visitors are still served')
    assert.equal((await nameRow(pool)).connected_at, null)
    // The attempt's own proof connects it again.
    await due(pool)
    await sweepOwnDomainProbes(pool, h.config, { probe: async () => ({ status: 'ok' }) })
    const again2 = await shownDomain(h, owner)
    assert.equal(again2.domain.state, 'connected')
    assert.equal(again2.domain.connection.status, 'ok')
    assert.ok((await nameRow(pool)).connected_at > provenAt, 'proved anew, for this attempt')
    // A later look of the SAME attempt that fails takes nothing away.
    await due(pool)
    await sweepOwnDomainProbes(pool, h.config, {
      probe: async () => ({ status: 'failed', error: 'TIMEOUT' })
    })
    assert.equal((await shownDomain(h, owner)).domain.state, 'connected')
  }
)

test(
  '#1037 rollout: every domain still on the old direct rule is moved by the sweep itself, through the normal publish path — nobody presses Publish; busy, draft and already-moved sites are left alone, and a host that cannot do it yet is asked again later',
  opts,
  async () => {
    const { pool, host, h, owner, end, connect, probe } = await ownSetup()
    const sweep = () => sweepLegacyOwnDomains(pool, h.config, { fetchImpl: host.fetchImpl, log: quiet })
    // A name connected the new way is not the sweep's.
    await connect()
    const calls = host.keys().length
    assert.deepEqual(await sweep(), { sites: 0, started: 0, held: 0, failed: 0 })
    assert.equal(host.keys().length, calls)

    await asLegacy(pool)
    probe.asked.length = 0
    assert.deepEqual(await sweep(), { sites: 1, started: 1, held: 0, failed: 0 })
    const asked = host.goLiveCalls().at(-1).body
    assert.deepEqual(
      { label: asked.label, op: asked.op, domains: asked.domains },
      { label: 'lantern', op: 'live', domains: [DOMAIN] }
    )
    assert.ok(Number.isSafeInteger(asked.routeGen) && asked.routeGen > 0, 'a route generation of its own')
    assert.equal(
      'routingTarget' in asked,
      false,
      "no DNS is read: the customer's records are not what is fixed"
    )
    const handed = await nameRow(pool)
    assert.equal(handed.state, 'active', 'served throughout')
    assert.match(handed.probe_secret, /^[0-9a-f]{64}$/, 'a new connection attempt')
    // migrate_next_at is stamped by the database clock: compare it with that clock.
    assert.ok(handed.migrate_next_at.getTime() > (await dbNow(pool)) + 60_000)
    // While its operation runs, and until the next try is due, the sweep starts nothing more.
    assert.deepEqual(await sweep(), { sites: 0, started: 0, held: 0, failed: 0 })
    await pool.query('update site_name set migrate_next_at = now() where name = $1', [DOMAIN])
    assert.deepEqual(await sweep(), { sites: 1, started: 0, held: 1, failed: 0 }, 'the site is held: later')
    assert.equal(host.keys().length, calls + 1, 'one job: asking how it stands starts nothing new')

    // A host still on the old script: not installed, so not done — asked again when due.
    const jobId = host.keyed.get(asked.jobKey)
    end(jobId, 'live', { lines: routedDirect(DOMAIN) })
    await state(h, owner)
    assert.equal((await nameRow(pool)).routed_at, null)
    assert.deepEqual(probe.asked, [])
    assert.deepEqual(await sweep(), { sites: 0, started: 0, held: 0, failed: 0 }, 'not before its next try')
    await pool.query('update site_name set migrate_next_at = now() where name = $1', [DOMAIN])
    assert.deepEqual(await sweep(), { sites: 1, started: 1, held: 0, failed: 0 })
    const second = host.goLiveCalls().at(-1).body
    assert.ok(second.routeGen > asked.routeGen)

    // The host with the new script: the rule is replaced, the real domain is asked, and only its
    // answer makes the card say connected.
    end(host.keyed.get(second.jobKey), 'live', { lines: routed(DOMAIN) })
    assert.equal((await state(h, owner)).operation, null)
    assert.equal(probe.asked.length, 1, 'verified: the domain itself was asked')
    const moved = await nameRow(pool)
    assert.notEqual(moved.routed_at, null)
    assert.notEqual(moved.connected_at, null)
    assert.equal((await shownDomain(h, owner)).domain.state, 'connected')
    // Moved: never taken again.
    await pool.query('update site_name set migrate_next_at = now() where name = $1', [DOMAIN])
    assert.deepEqual(await sweep(), { sites: 0, started: 0, held: 0, failed: 0 })

    // A draft site's name is not served and not moved; a host that refuses is counted and retried.
    await asLegacy(pool)
    await pool.query("update site set publish = 'draft' where site_key = $1", [SITE])
    assert.deepEqual(await sweep(), { sites: 0, started: 0, held: 0, failed: 0 })
    await db.reset()
    const down = await ownSetup({
      hostOptions: { goLive: () => Response.json({ code: 'bad request' }, { status: 400 }) }
    })
    await asLegacy(down.pool)
    const refused = await sweepLegacyOwnDomains(down.pool, down.h.config, {
      fetchImpl: down.host.fetchImpl,
      log: quiet
    })
    assert.equal(refused.sites, 1)
    assert.equal(refused.started, 0, 'not started — whether the host refused outright or left it unconfirmed')
    assert.equal(refused.held + refused.failed, 1)
    assert.equal((await nameRow(down.pool)).routed_at, null)
    assert.equal((await nameRow(down.pool)).state, 'active', 'a failed move takes nothing away')
  }
)

test(
  '#1037: every run of an operation that names domains carries a route generation of its own, rising across runs and sites',
  opts,
  async () => {
    const { pool, host, h, owner, end, connect } = await ownSetup()
    await connect()
    const first = host.goLiveCalls()[0].body.routeGen
    const drop = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    const { jobId } = await drop.json()
    const second = host.goLiveCalls()[1].body.routeGen
    assert.ok(second > first)
    end(jobId, 'drop-domain', { code: 1, lines: `!! could not remove ${DOMAIN} from the ingress\n` })
    await state(h, owner)
    await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    const third = host.goLiveCalls().at(-1).body
    assert.equal(third.attempt, 1)
    assert.ok(third.routeGen > second, 'a run taken back is a newer run')
    assert.equal(String((await opRow(pool)).route_gen), String(third.routeGen))
  }
)

test(
  "#1037 the whole app: every public hostname that is not Tracy's goes to the site router — connected is proxied; pending, released and never-held names are refused; only an address inside the machine reaches the app",
  opts,
  async () => {
    const { pool, h, owner, connect } = await ownSetup()
    await pool.query(
      "update site set address = 'https://lantern.tracy.test/', platform = 'wordpress' where site_key = $1",
      [SITE]
    )
    const at = (host, path = '/', method = 'GET') =>
      h.app.fetch(
        new Request(`http://${host}${path}`, {
          method,
          headers: {
            host,
            ...(method === 'GET' ? {} : { 'content-type': 'application/json', origin: `http://${host}` })
          },
          ...(method === 'GET' ? {} : { body: '{}' })
        })
      )
    // Every Tracy door, whichever router mounts it — the Invitations door included — is behind the
    // hostname router: a name that is not Tracy's never reaches one, read or write.
    const tracyDoors = [
      ['GET', '/login'],
      ['GET', '/api/config'],
      ['GET', '/api/ops/invitations'],
      ['POST', '/api/ops/invitations'],
      ['GET', '/api/ops/invitations/1']
    ]
    // Saved, not connected: Tracy's refusal page — not the site, and not Tracy's own app either.
    for (const [method, path] of tracyDoors) {
      const pending = await at(DOMAIN, path, method)
      assert.equal(pending.status, 404, `${method} ${path}`)
      assert.match(await pending.text(), /<html/i)
    }
    // A name nobody ever held is somebody's domain all the same: refused, never Tracy's own app.
    for (const stranger of ['never-held.example.org', 'tracy.test.evil.example', 'login.example.co.uk']) {
      for (const [method, path] of tracyDoors) {
        const refused = await at(stranger, path, method)
        assert.equal(refused.status, 404, `${stranger}: ${method} ${path}`)
        assert.match(await refused.text(), /<html/i)
      }
    }
    // The closed exception: an address inside the machine or its private network reaches the app.
    for (const local of [
      '127.0.0.1',
      '10.0.0.7',
      'localhost',
      'tracy-web',
      'host.docker.internal',
      'web.local',
      'stand.test'
    ]) {
      const inside = await at(local, '/login')
      assert.notEqual(inside.status, 404, `${local}: Tracy's own sign-in page`)
    }

    await connect()
    // Connected: the site's own copy is dialled, and its page — not Tracy's sign-in — comes back.
    const served = await at(DOMAIN, '/login')
    assert.equal(served.status, 200, 'the site router took it and went to the site')
    assert.match(await served.text(), /<body>home<\/body>/)
    for (const [method, path] of tracyDoors.filter(([m]) => m === 'GET')) {
      const page = await at(DOMAIN, path, method)
      assert.equal(page.status, 200, `${method} ${path}: the site's, not Tracy's door`)
      assert.match(await page.text(), /<body>home<\/body>/)
    }
    // The back office is sent to the Tracy address without the site being asked.
    const admin = await at(DOMAIN, '/wp-admin/')
    assert.equal(admin.status, 302)
    assert.equal(admin.headers.get('location'), 'https://lantern.tracy.test/wp-admin/')

    // Removed through the host: let go, and refused from then on.
    const drop = await h.send('DELETE', `/api/sites/${SITE}/address/domain`, owner, { name: DOMAIN })
    assert.equal(drop.status, 202)
    assert.equal((await at(DOMAIN, '/')).status, 404, 'refused from the reservation of the removal on')
  }
)

// ── #1037 slice 2: with Cloudflare for SaaS, a published site connects its proven domain by itself ──
import { fakeCloudflare } from './_fake-cloudflare.mjs'
import { sweepCustomHostnames, sweepOwnDomainStarts } from '../src/cron.js'

test(
  '#1037 slice 2: a published site connects its domain by itself once its records are right — the card says connect.<zone>, the host is named no tunnel, and connected waits for the hostname and its certificate',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost()
    const cf = fakeCloudflare()
    cf.state = { status: 'pending', ssl: 'pending_validation', records: [] }
    const dns = { txt: {}, cname: {} }
    const answer = (kind) => async (name) => {
      const found = dns[kind][name]
      if (found === undefined) throw dnsFail(kind === 'txt' ? 'ENOTFOUND' : 'ENODATA')
      return found
    }
    const probed = []
    const probe = async (row) => {
      probed.push(row.name)
      return { status: 'ok' }
    }
    const h = harness(
      pool,
      host.fetchImpl,
      { resolveTxt: answer('txt'), resolveCname: answer('cname') },
      probe,
      cf.client
    )
    await site(pool)
    await pool.query(
      "update site set attached = true, publish = 'published', address = 'https://lantern.tracy.test/' where site_key = $1",
      [SITE]
    )
    const owner = await h.cookieFor('owner@x.y')
    const saved = await h.send('PUT', `/api/sites/${SITE}/address`, owner, { name: DOMAIN, kind: 'custom' })
    assert.equal(saved.status, 202)
    const pending = (await saved.json()).pending
    assert.deepEqual(pending.routing, { type: 'CNAME', name: DOMAIN, value: 'connect.localhost' })
    assert.equal(
      host.calls.some((call) => call.path === '/_host/routing-target'),
      false,
      "the tunnel is nobody's to point at"
    )

    const sweepDns = { dnsTxt: answer('txt'), dnsCname: answer('cname') }
    const startSweep = () =>
      sweepOwnDomainStarts(pool, h.config, {
        fetchImpl: host.fetchImpl,
        dns: sweepDns,
        saas: true,
        log: { warn() {}, error() {} }
      })
    // No records yet: nothing is carried, nothing is registered.
    assert.deepEqual(await startSweep(), { sites: 1, started: 0, held: 0, failed: 0 })
    assert.equal(host.goLiveCalls().length, 0)
    assert.equal(await sweepCustomHostnames(pool, h.config, { hostnames: cf.client }).then((o) => o.taken), 0)

    // The customer adds the two records and closes the tab. The sweep's next look connects it.
    dns.txt[`_tracy.${DOMAIN}`] = [[pending.verification.value]]
    dns.cname[DOMAIN] = ['connect.localhost']
    await pool.query('update site_name set dns_next_at = null')
    assert.deepEqual(await startSweep(), { sites: 1, started: 1, held: 0, failed: 0 })
    assert.deepEqual(
      sent(host),
      { label: 'lantern', op: 'live', domains: [DOMAIN] },
      'no routingTarget: connect.<zone> is not the tunnel'
    )
    const swept = await sweepCustomHostnames(pool, h.config, { hostnames: cf.client })
    assert.equal(swept.taken, 1)
    assert.equal(cf.hostnames.size, 1, 'the proven name is registered')

    // The host installs the route; the probe sweep waits for the hostname and its certificate.
    const jobId = host.goLiveCalls().length && (await opRow(pool)).job_id
    host.jobs[jobId] = {
      ...host.jobs[jobId],
      state: 'done',
      exitCode: 0,
      step: 'go-live:live',
      output: said('live', routed(DOMAIN))
    }
    await state(h, owner)
    const routedRow = await nameRow(pool)
    assert.notEqual(routedRow.routed_at, null)
    assert.equal(routedRow.state, 'pending')
    await sweepOwnDomainProbes(pool, h.config, { probe, hostnames: cf.client })
    assert.deepEqual(probed, [], 'not asked while the hostname is pending')
    assert.deepEqual((await nameRow(pool)).probe_reading, { status: 'failed', error: 'HOSTNAME_PENDING' })
    let card = (await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()).addressChange.pending
    assert.deepEqual(card.connection.error, 'HOSTNAME_PENDING')
    assert.deepEqual(card.hostname, { ready: false, reason: 'HOSTNAME_PENDING' })

    cf.set(DOMAIN, { status: 'active', ssl: 'active' })
    await pool.query("update site_name set probe_next_at = now(), dns_next_at = now() + interval '1 hour'")
    await sweepOwnDomainProbes(pool, h.config, { probe, hostnames: cf.client })
    assert.deepEqual(probed, [DOMAIN])
    assert.equal((await nameRow(pool)).state, 'active')
    card = (await (await h.get(`/api/sites/${SITE}/settings`, owner)).json()).addressChange.connected[0]
    assert.equal(card.state, 'connected')
    assert.deepEqual(card.hostname, { ready: true })
    // Connected: the start sweep has nothing more to do for it.
    await pool.query('update site_name set dns_next_at = null')
    assert.deepEqual(await startSweep(), { sites: 0, started: 0, held: 0, failed: 0 })
  }
)

test(
  'teardownSiteAs (the demo sweep): the delete door’s own operation as a function — started, then gone once the host said so',
  opts,
  async () => {
    const { pool, host, h } = await ownSetup()
    const asked = await h.app.teardownSiteAs(SITE, 'owner@x.y')
    assert.equal(asked, 'started')
    const job = await teardownAsked(host)
    assert.deepEqual(teardownAsks(host)[0].body, {
      label: 'lantern',
      op: 'teardown',
      publicOrigin: env.TRACY_ORIGIN,
      jobKey: teardownAsks(host)[0].body.jobKey
    })
    assert.equal(await siteCount(pool), 1, 'still there: the host has not said the site is gone')
    endTeardown(host, job)
    assert.equal(await h.app.teardownSiteAs(SITE, 'owner@x.y'), 'gone')
    assert.equal(await siteCount(pool), 0)
    assert.equal(await liveSeats(pool), 0)
    assert.equal(await h.app.teardownSiteAs(SITE, 'owner@x.y'), 'gone')
  }
)
