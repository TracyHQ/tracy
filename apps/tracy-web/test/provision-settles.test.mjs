/**
 * A provision that ends must be RECORDED as ended — whether or not a browser tab was watching.
 *
 * `site_creation` is the row that answers "what happened to this build". Until now only the
 * job-poll door wrote it, and that door runs only while a tab polls: the create flow navigates
 * away the moment the site row exists, and a person who reloads, closes the tab, or simply reads
 * the chat instead leaves nobody polling. Measured 15/09 on the local stand — provisioning died at
 * its last step (a port another process held) at 01:16, and at 01:28 the row still read
 * `provisioning`, the chat's task list still showed a spinner on "creating", and nothing anywhere
 * said the build had stopped.
 *
 * So: the door settles the row on both endings, and a sweep settles the rows nobody polled.
 */
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import {
  PROVISION_GIVE_UP_MS,
  PROVISION_UNREACHABLE_GIVE_UP_MS,
  settleProvisions,
  startUnwatchedBuilds
} from '../src/cron.js'

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
  // The deployment this process IS — `pairComponent` pairs only sites on its own host.
  HOST_NAME: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/**
 * A fleet that takes the job and then answers `state` for every poll of it.
 * `extra` is the rest of the fleet's own answer — `port` above all, which is what the handover
 * turns into an address.
 */
function fakeFleet(state, extra = {}) {
  return async (input) => {
    const u = new URL(String(input))
    if (u.pathname === '/_host/provision')
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
    if (u.pathname.startsWith('/_host/jobs/'))
      return new Response(JSON.stringify({ state, step: 'provision', ...extra }), { status: 200 })
    if (u.pathname === '/_host/attach') return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    return new Response('{}', { status: 200 })
  }
}

function harness(pool, fetchImpl, briefs = undefined) {
  const config = readConfig({ ...env, DATABASE_URL: url })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    ...(briefs ? { briefs } : {}),
    fetchImpl
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
  return { config, cookieFor, send, get }
}

const creationRow = async (pool, buildId) => {
  const { rows } = await pool.query('select * from site_creation where build_id = $1', [buildId])
  return rows[0]
}

test('a poll that finds the provision failed settles the creation row', opts, async () => {
  const { pool } = db
  const { cookieFor, send, get } = harness(pool, fakeFleet('failed'))
  const owner = await cookieFor('owner@x.y')
  const buildId = '11111111-1111-4111-8111-111111111111'
  const created = await send('POST', '/api/sites', owner, {
    label: 'lantern',
    platform: 'wordpress',
    buildId
  })
  const { siteKey, jobId } = await created.json()
  assert.equal((await creationRow(pool, buildId)).state, 'provisioning')

  const polled = await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
  assert.equal((await polled.json()).state, 'failed')
  assert.equal((await creationRow(pool, buildId)).state, 'failed')
})

test('a poll that finds the provision done settles the creation row too', opts, async () => {
  const { pool } = db
  const { cookieFor, send, get } = harness(pool, fakeFleet('done'))
  const owner = await cookieFor('owner@x.y')
  const buildId = '22222222-2222-4222-8222-222222222222'
  const created = await send('POST', '/api/sites', owner, {
    label: 'beacon',
    platform: 'wordpress',
    buildId
  })
  const { siteKey, jobId } = await created.json()

  await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)
  assert.equal((await creationRow(pool, buildId)).state, 'done')
})

/**
 * 🔒 A DONE BUILD WHOSE WORDS DID NOT GO IN SAYS SO (TCH #1013, measured 08/10/2026 on tamq-7q-tbwp3/4): the site's plugin did
 * not carry its contract, Apply failed with a reason on its row, and this door answered a plain `done` — the wizard moved on and
 * nobody was told. Like `repoError` and `laneError`, the brief's ending rides beside `done`.
 */
test("a done poll carries the brief's ending and its reason", opts, async () => {
  const { pool } = db
  const briefs = {
    start: async () => ({ started: true }),
    gate: async () => ({
      open: false,
      step: null,
      state: 'failed',
      error: 'the site is not bound to its content contract yet'
    }),
    waiting: async () => null,
    abandon: async () => {}
  }
  const { cookieFor, send, get } = harness(pool, fakeFleet('done'), briefs)
  const owner = await cookieFor('owner@x.y')
  const created = await send('POST', '/api/sites', owner, {
    label: 'plover',
    platform: 'wordpress',
    buildId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  })
  const { siteKey, jobId } = await created.json()
  const body = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
  assert.equal(body.state, 'done')
  assert.equal(body.briefState, 'failed')
  assert.equal(body.briefError, 'the site is not bound to its content contract yet')
})

test('a done poll of a site made with no brief says nothing about one', opts, async () => {
  const { pool } = db
  const briefs = {
    start: async () => ({ started: true }),
    gate: async () => ({ open: false, step: null }),
    waiting: async () => null,
    abandon: async () => {}
  }
  const { cookieFor, send, get } = harness(pool, fakeFleet('done'), briefs)
  const owner = await cookieFor('owner@x.y')
  const created = await send('POST', '/api/sites', owner, {
    label: 'sanderling',
    platform: 'wordpress',
    buildId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  })
  const { siteKey, jobId } = await created.json()
  const body = await (await get(`/api/sites/${siteKey}/jobs/${jobId}`, owner)).json()
  assert.equal(body.state, 'done')
  assert.equal('briefState' in body, false)
  assert.equal('briefError' in body, false)
})

test('the sweep settles a provision nobody polled — the tab is gone, the truth is not', opts, async () => {
  const { pool } = db
  const fetchImpl = fakeFleet('failed')
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '33333333-3333-4333-8333-333333333333'
  await send('POST', '/api/sites', owner, { label: 'kestrel', platform: 'wordpress', buildId })
  assert.equal((await creationRow(pool, buildId)).state, 'provisioning')

  // Nobody polls. The row is as old as the sweep's own patience, and the sweep asks the fleet.
  const settled = await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })
  assert.equal(settled.settled, 1)
  assert.equal((await creationRow(pool, buildId)).state, 'failed')
  const { rows } = await pool.query('select state from job where id = $1', ['job-1'])
  assert.equal(rows[0].state, 'failed')
})

test('the sweep leaves a provision that is still running alone', opts, async () => {
  const { pool } = db
  const fetchImpl = fakeFleet('running')
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '44444444-4444-4444-8444-444444444444'
  await send('POST', '/api/sites', owner, { label: 'marlin', platform: 'wordpress', buildId })

  const settled = await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })
  assert.equal(settled.settled, 0)
  assert.equal((await creationRow(pool, buildId)).state, 'provisioning')
})

test(
  'the sweep gives up on a build still running 75 minutes after its job was made, or whose host has not answered for 2 hours',
  opts,
  async () => {
    // 16/10/2026: no layer limited a build, so a job the host never ended kept the customer's spinner turning.
    const { pool } = db
    const running = fakeFleet('running')
    const { config, cookieFor, send } = harness(pool, running)
    const owner = await cookieFor('owner@x.y')
    const buildId = '55555555-5555-4555-8555-555555555555'
    await send('POST', '/api/sites', owner, { label: 'puffin', platform: 'wordpress', buildId })
    // The age is read on the database clock, so the test ages the row rather than moving a clock.
    const age = (id, ms) =>
      pool.query(
        `update job set created_at = now() - ($2::bigint * interval '1 millisecond') where id = $1`,
        [id, ms]
      )

    // still inside the limit: left alone, as before
    await age('job-1', 30 * 60_000)
    let settled = await settleProvisions(pool, config, { fetchImpl: running, staleMs: 0 })
    assert.equal(settled.settled, 0)
    assert.equal((await creationRow(pool, buildId)).state, 'provisioning')

    // past it: failed, saying why, and the creation settles with it
    await age('job-1', PROVISION_GIVE_UP_MS + 60_000)
    settled = await settleProvisions(pool, config, { fetchImpl: running, staleMs: 0 })
    assert.equal(settled.settled, 1)
    assert.equal((await creationRow(pool, buildId)).state, 'failed')
    const { rows } = await pool.query('select state, detail from job where id = $1', ['job-1'])
    assert.equal(rows[0].state, 'failed')
    assert.equal(rows[0].detail.reason, 'timeout')

    // a host that does not answer: patient for two hours, then failed
    const silent = async (url, init) => {
      const path = new URL(String(url)).pathname
      if (path === '/_host/provision')
        return new Response(JSON.stringify({ jobId: 'job-2' }), { status: 200 })
      if (path.startsWith('/_host/jobs/')) throw new Error('ECONNREFUSED')
      return running(url, init)
    }
    const other = harness(pool, silent)
    const owner2 = await other.cookieFor('owner2@x.y')
    const buildId2 = '66666666-6666-4666-8666-666666666666'
    await other.send('POST', '/api/sites', owner2, {
      label: 'gannet',
      platform: 'wordpress',
      buildId: buildId2
    })
    await age('job-2', 60 * 60_000)
    await settleProvisions(pool, other.config, { fetchImpl: silent, staleMs: 0 })
    assert.equal(
      (await creationRow(pool, buildId2)).state,
      'provisioning',
      'an unreachable host is not an answer yet'
    )
    await age('job-2', PROVISION_UNREACHABLE_GIVE_UP_MS + 60_000)
    await settleProvisions(pool, other.config, { fetchImpl: silent, staleMs: 0 })
    assert.equal((await creationRow(pool, buildId2)).state, 'failed')
  }
)

const siteRow = async (pool, siteKey) => {
  const { rows } = await pool.query('select * from site where site_key = $1', [siteKey])
  return rows[0]
}

/**
 * 🔒 A SITE THAT FINISHED BUILDING AND HAS NO ADDRESS CANNOT BE OPENED BY ANY DOOR, and nothing
 * says so. `site.address` is what `/api/sites` hands back as `copyUrl` and what the side card
 * opens; null there is not a cosmetic gap. Measured 21/09 on the local stand: three sites built
 * from design inspirations, the fleet answering `done` with `port` 52001 and 52002, all three
 * `site_creation` rows settled to `done` by this very sweep — and all three still holding a null
 * `address`, because the only code that had ever written one sat behind a browser poll that had
 * navigated away minutes earlier.
 */
test(
  "the sweep writes the address of a site nobody polled — the port is the fleet's, not the tab's",
  opts,
  async () => {
    const { pool } = db
    const fetchImpl = fakeFleet('done', { port: 52001 })
    const { config, cookieFor, send } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const buildId = '55555555-5555-4555-8555-555555555555'
    const created = await send('POST', '/api/sites', owner, {
      label: 'petrel',
      platform: 'wordpress',
      buildId
    })
    const { siteKey } = await created.json()
    assert.equal((await siteRow(pool, siteKey)).address, null)

    // Nobody polls. The fleet finished anyway, and said which port it finished on.
    await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })

    const site = await siteRow(pool, siteKey)
    assert.equal(site.port, 52001)
    // `config.origin` is `http://tracy.test:8080`, so scheme AND port come from it — never a literal.
    assert.equal(site.address, 'http://petrel.localhost:8080/')
    assert.equal(site.publish, 'draft')
    // 🔒 AND THE LANE, or the address buys nothing: `/api/sites` reports `agent` only for a site
    // that is BOTH addressed and attached, and the left column refuses to open a row whose
    // `agent` is null. `/attach` is a host call signed with this deployment's own secret — it
    // never sees an email — so no grant stands between the sweep and it.
    assert.equal(site.attached, true)
  }
)

/**
 * The guard is the null, not the value: a site with an address has been through the poll door, and
 * the customer may have PUBLISHED it since. Re-stamping `publish: 'draft'` from a background timer
 * would un-publish a live site, which is a worse failure than the one this sweep fixes.
 */
test('the sweep leaves an address that already exists alone, publish and all', opts, async () => {
  const { pool } = db
  const fetchImpl = fakeFleet('done', { port: 52002 })
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '66666666-6666-4666-8666-666666666666'
  const created = await send('POST', '/api/sites', owner, {
    label: 'kittiwake',
    platform: 'wordpress',
    buildId
  })
  const { siteKey } = await created.json()
  await pool.query(
    "update site set address = 'https://kittiwake.example/', publish = 'published' where site_key = $1",
    [siteKey]
  )

  await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })

  const site = await siteRow(pool, siteKey)
  assert.equal(site.address, 'https://kittiwake.example/')
  assert.equal(site.publish, 'published')
})

/** A fleet that ends `done` without a port has not said where the site answers — so neither do we. */
test('the sweep settles a done build with no port, and writes no address', opts, async () => {
  const { pool } = db
  const fetchImpl = fakeFleet('done')
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '77777777-7777-4777-8777-777777777777'
  const created = await send('POST', '/api/sites', owner, {
    label: 'gannet',
    platform: 'wordpress',
    buildId
  })
  const { siteKey } = await created.json()

  const settled = await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })
  assert.equal(settled.settled, 1)
  assert.equal((await creationRow(pool, buildId)).state, 'done')
  assert.equal((await siteRow(pool, siteKey)).address, null)
})

/**
 * The two repairs are independent. A fleet that refuses `/attach` must not cost the site the
 * address it had already earned — and the build still ended, which is the one answer the
 * `site_creation` row exists to give.
 */
test('a lane that refuses does not cost the site its address, nor the row its ending', opts, async () => {
  const { pool } = db
  const refusesAttach = async (input) => {
    const u = new URL(String(input))
    if (u.pathname === '/_host/provision')
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
    if (u.pathname.startsWith('/_host/jobs/'))
      return new Response(JSON.stringify({ state: 'done', step: 'ready', port: 52003 }), {
        status: 200
      })
    if (u.pathname === '/_host/attach')
      return new Response(JSON.stringify({ code: 'LANE_FAILED' }), { status: 502 })
    return new Response('{}', { status: 200 })
  }
  const { config, cookieFor, send } = harness(pool, refusesAttach)
  const owner = await cookieFor('owner@x.y')
  const buildId = '88888888-8888-4888-8888-888888888888'
  const created = await send('POST', '/api/sites', owner, {
    label: 'skuagull',
    platform: 'wordpress',
    buildId
  })
  const { siteKey } = await created.json()

  const settled = await settleProvisions(pool, config, {
    fetchImpl: refusesAttach,
    staleMs: 0,
    log: { info: () => {}, error: () => {} }
  })

  assert.equal(settled.settled, 1)
  assert.equal((await creationRow(pool, buildId)).state, 'done')
  const site = await siteRow(pool, siteKey)
  assert.equal(site.address, 'http://skuagull.localhost:8080/')
  assert.equal(site.attached, false)
})

/**
 * 🔒 THE CONTENT DOOR IS THE AGENT'S ONLY DOOR, and an unwatched build never got one. Measured
 * 21/09/2026 on the local stand: three sites built from design inspirations, `site_component` empty
 * for all three. On a `tracy-business/j6` site that is a dead end by construction — its own
 * `templates/tracy_business/AGENTS.md` rule 3 says content is read and written through this door
 * and nowhere else, while `COMPONENT_NOT_REGISTERED`'s `next` sends the agent to edit files, which
 * rule 4 forbids. Pairing needs no viewer: a signed host call for the token, then the site's own
 * door. The email only ever stamped `created_by`.
 */
test('the sweep connects the content door of a site nobody polled', opts, async () => {
  const { pool } = db
  const fleetWithDoor = async (input, init) => {
    const u = new URL(String(input))
    if (u.pathname === '/_host/provision')
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
    if (u.pathname.startsWith('/_host/jobs/'))
      return new Response(JSON.stringify({ state: 'done', step: 'ready', port: 52004 }), {
        status: 200
      })
    if (u.pathname === '/_host/attach') return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    if (u.pathname === '/_host/agent-token')
      return new Response(JSON.stringify({ token: 't'.repeat(24) }), { status: 200 })
    // The site's own component door, answering `core.manifest` the way provision leaves it.
    if (u.searchParams.get('option') === 'com_claudecowork') {
      const sent = JSON.parse(String(init?.body ?? '{}'))
      if (sent.action !== 'core.manifest' || sent.token !== 't'.repeat(24))
        return new Response(JSON.stringify({ ok: false }), { status: 403 })
      return new Response(JSON.stringify({ ok: true, manifest: { platform: 'joomla' } }), {
        status: 200
      })
    }
    return new Response('{}', { status: 200 })
  }
  const { config, cookieFor, send } = harness(pool, fleetWithDoor)
  const owner = await cookieFor('owner@x.y')
  const buildId = '99999999-9999-4999-8999-999999999999'
  const created = await send('POST', '/api/sites', owner, {
    label: 'dunlin',
    platform: 'joomla',
    buildId
  })
  const { siteKey } = await created.json()
  const before = await pool.query('select count(*) from site_component where site_key = $1', [siteKey])
  assert.equal(Number(before.rows[0].count), 0)

  await settleProvisions(pool, config, {
    fetchImpl: fleetWithDoor,
    staleMs: 0,
    log: { info: () => {}, error: () => {} }
  })

  const { rows } = await pool.query('select config, created_by from site_component where site_key = $1', [
    siteKey
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].config.token, 't'.repeat(24))
  // Who did it, not who authorised it: the customer was not here.
  assert.equal(rows[0].created_by, 'cron:provision-sweep')
})

// ── …and then starts the build that press was for ───────────────────────────────────────────────
//
// Settling the row is only half of "nobody was watching". The press that started the provision
// also OWNS starting the build — `startBuild` is the one call that carries the customer's answers
// into the site — and it runs inside a promise owned by the page. Measured 22/09/2026 on three
// sites built through Design inspiration, one per CMS: all three provisioned and serving, all
// three still wearing the template's demo content, `docs/agents/build/` absent on every one.

/** Records what the seat door and the dsh build door were asked, and lets a test refuse. */
function fakeDsh({ refuse = false } = {}) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    calls.push({ url: u.toString(), path: u.pathname, body: init?.body ? JSON.parse(init.body) : null })
    if (u.pathname === '/_host/provision')
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
    if (u.pathname.startsWith('/_host/jobs/'))
      return new Response(JSON.stringify({ state: 'done', step: 'ready', port: 52000 }), { status: 200 })
    if (u.pathname === '/_host/attach') return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    if (u.pathname.endsWith('/start'))
      return refuse ? new Response('NO_SESSION', { status: 400 }) : new Response('{}', { status: 200 })
    return new Response('{}', { status: 200 })
  }
  return { fetchImpl, calls }
}

const seatDoor = { mintSeatSession: async () => 'seat-token' }

async function pressed(pool, buildId, press, sessionId = 'sess-1') {
  await pool.query('update site_creation set press = $2::jsonb, session_id = $3 where build_id = $1', [
    buildId,
    JSON.stringify(press),
    sessionId
  ])
}

test('the sweep starts the build the press never got to start', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeDsh()
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '44444444-4444-4444-8444-444444444444'
  await send('POST', '/api/sites', owner, { label: 'harrier', platform: 'emdash', buildId })
  await pressed(pool, buildId, { id: 'tracy-business', answers: { name: 'Claude Motors' } })

  // The provision ends with nobody polling, and the sweep settles it — then finishes the press.
  await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })
  const out = await startUnwatchedBuilds(pool, config, { fetchImpl, seatDoor })
  assert.equal(out.started, 1, JSON.stringify(calls.map((c) => c.path)))

  const started = calls.find((c) => c.path.endsWith('/start'))
  assert.ok(started, 'the dsh build door was called')
  assert.equal(started.body.id, 'tracy-business')
  assert.deepEqual(started.body.answers, { name: 'Claude Motors' })
  assert.equal(started.body.targetSiteKey, 'harrier.localhost')
  // 🔒 AND THE ADDRESS, WHICH THE PRESS COULD NOT HAVE KNOWN. It is written the moment the
  // customer submits, before the fleet has answered with one — so a sweep that forwarded only
  // the press started builds naming no site. EmDash's first stage refuses exactly that ("This
  // build names no site address"), and measured 23/09/2026 on `site-g5dm6x` that is how a build
  // reached `done` with `personalize` never run and the site left 100% demo content.
  assert.equal(started.body.targetUrl, 'http://harrier.localhost:8080/', JSON.stringify(started.body))
  // 🔒 The SAME session the claim made, never a second one: a build owned by a conversation the
  // customer never opens reports into nowhere.
  assert.match(started.url, /session=sess-1/)
  // The to-do list the customer is looking at is repainted too — starting the build does not
  // touch it, and it still reads whatever step the dead press last managed to report.
  assert.ok(calls.some((c) => c.path.endsWith('/provision') && c.body?.step === 'complete'))

  // 🔒 AT MOST ONCE. A second tick must find nothing left to do.
  const again = await startUnwatchedBuilds(pool, config, { fetchImpl, seatDoor })
  assert.equal(again.started, 0)
})

test('a build the sweep could not deliver is left for the next tick, not marked done', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeDsh({ refuse: true })
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '55555555-5555-4555-8555-555555555555'
  await send('POST', '/api/sites', owner, { label: 'merlin', platform: 'emdash', buildId })
  await pressed(pool, buildId, { id: 'tracy-business', answers: { name: 'x' } })
  await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })

  const out = await startUnwatchedBuilds(pool, config, { fetchImpl, seatDoor })
  assert.equal(out.started, 0)
  assert.equal(out.failed, 1)
  // The stamp is released, or a door that was merely down for a minute would cost the customer
  // their build for ever.
  const { rows } = await pool.query('select build_started_at from site_creation where build_id = $1', [
    buildId
  ])
  assert.equal(rows[0].build_started_at, null)
})

test('a claimed site whose questions were never answered is not built out of nothing', opts, async () => {
  const { pool } = db
  const { fetchImpl, calls } = fakeDsh()
  const { config, cookieFor, send } = harness(pool, fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const buildId = '66666666-6666-4666-8666-666666666666'
  await send('POST', '/api/sites', owner, { label: 'osprey', platform: 'wordpress', buildId })
  // No press: the site was claimed and its questionnaire never answered.
  await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })

  const out = await startUnwatchedBuilds(pool, config, { fetchImpl, seatDoor })
  assert.equal(out.started, 0)
  assert.equal(
    calls.filter((c) => c.path.endsWith('/start')).length,
    0,
    'the build door was never called — that site is waiting for its owner'
  )
})

// ── …but never a build that needs somebody present ──────────────────────────────────────────────
//
// A Joomla or WordPress build writes through the Apply door, and every call there ACTS AS A
// PERSON — the one who typed, or the one with the lane open. A sweep has neither. Measured
// 23/09/2026 on two sites created then walked away from: the sweep started both, and both died at
// `check` with NO_VIEWER — "Nobody has this lane open in a browser" — leaving a FAILED build with a
// technical sentence the customer would read on return. Worse than no build.
//
// So those are left alone: `build_started_at` stays null, and the page that comes back — with its
// person — starts the build itself.

for (const platform of ['joomla', 'wordpress']) {
  test(`the sweep leaves a ${platform} build for the customer’s return`, opts, async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeDsh()
    const { config, cookieFor, send } = harness(pool, fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const buildId =
      platform === 'joomla' ? '77777777-7777-4777-8777-777777777777' : '88888888-8888-4888-8888-888888888888'
    await send('POST', '/api/sites', owner, { label: `left-${platform}`, platform, buildId })
    await pressed(pool, buildId, { id: 'tracy-business', answers: { name: 'x' } })
    await settleProvisions(pool, config, { fetchImpl, staleMs: 0 })

    const out = await startUnwatchedBuilds(pool, config, { fetchImpl, seatDoor })
    assert.equal(out.started, 0)
    assert.equal(
      calls.filter((c) => c.path.endsWith('/start')).length,
      0,
      'the build door was never called — it would only have failed at check'
    )
    // 🔒 And the row is left UNSTARTED, which is what lets the returning page start it.
    const { rows } = await pool.query('select build_started_at from site_creation where build_id = $1', [
      buildId
    ])
    assert.equal(rows[0].build_started_at, null)
  })
}
