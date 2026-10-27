// Remove an unfinished import, and the sweep of abandoned ones (`src/sites/import-remove.js`,
// `src/cron.js` `sweepAbandonedImports`) — PR #1598 part 2.
//
// The door takes the right to delete in one guarded statement, asks the add-site host half of the
// creation workspace's dsh to confirm no read is going and hold the site, and only then deletes:
// the host's runs and cursor, the store objects it names inside the site's prefixes, the seats and
// the row. The fake dsh here keeps the host half's state (a read running, an unreachable host, a
// hold) and records every call, so each case reads what was asked and what is left.
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test, after, before, beforeEach } from 'node:test'
import { buildApp } from '../src/app.js'
import { sweepAbandonedImports, sweepClaims } from '../src/cron.js'
import { forgetImportAtHost, importRemover, REMOVE_MARK_STALE_MS } from '../src/sites/import-remove.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { ABANDONED_IMPORT_MS } from '../src/lib/import-pending.js'
import { mintSession } from '../src/lib/session.js'
import { labelPrefix } from '../src/sites/label.js'
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
  SEAT_local_SECRET: 'k',
  ARTIFACT_S3_ENDPOINT: 'http://r2.test',
  ARTIFACT_S3_BUCKET: 'artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'AK',
  ARTIFACT_S3_SECRET_KEY: 'SK'
}

const IMPORTED = 'old-shop.example.com'
const PREFIX = `sites/${labelPrefix(IMPORTED)}/`

/**
 * The add-site host half as the hold door answers (`hold-door.ts`): `running` a read is going,
 * `down` no answer, `lastActivityAt` its latest run change or part. Every call is checked to carry
 * the seat secret's signature over its body, as the real door requires.
 */
function fakeHost() {
  const state = {
    running: false,
    // The host whose dsh is running the read (`running`): the one the import was claimed on.
    runningOn: 'dsh.test',
    down: false,
    held: false,
    forgotten: 0,
    lastActivityAt: null,
    gate: null,
    // Which dsh each hold call went to, whether the site was held at each store delete, and whether
    // the row was already gone when the host was asked to forget.
    asked: [],
    heldAtStore: [],
    rowGoneAtForget: null
  }
  /** A `/new/` tab left open pressing Start on this host: refused while the site is held. */
  state.startOnHost = () => (state.held ? 'IMPORT_REMOVING' : 'started')
  const calls = []
  const store = []
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input))
    if (u.hostname === 'r2.test') {
      state.heldAtStore.push(state.held)
      if (state.storeRefuses) return new Response(null, { status: 500 })
      store.push(`${init.method} ${decodeURIComponent(u.pathname)}${u.search}`)
      return new Response(null, { status: 204 })
    }
    if (u.pathname === '/_host/provision') return Response.json({ jobId: 'job-1' })
    // The plain delete's teardown, answered the way tracy-host does (`sites-route.test.mjs`
    // `fakeNetwork`): the keyed go-live door takes `op: 'teardown'` as a job that ends done.
    if (u.pathname === '/_host/go-live') {
      const asked = JSON.parse(String(init.body))
      if (asked.op !== 'teardown') return Response.json({ jobId: 'golive-1' })
      calls.push('go-live')
      state.tornDown = asked.label
      return Response.json({ jobId: 'teardown-1' }, { status: 202 })
    }
    if (u.pathname === '/_host/jobs/teardown-1')
      return Response.json({
        state: 'done',
        step: 'go-live:teardown',
        exitCode: 0,
        output: `==> tearing down\nTRACY_RESULT torn_down=1 label=${state.tornDown}\n==> ${state.tornDown} is gone`
      })
    if (u.pathname.startsWith('/_host/jobs/')) return Response.json({ state: 'done', port: 8123 })
    if (u.pathname === '/_host/attach') {
      calls.push('attach')
      return Response.json({ lane: 'ok' })
    }
    if (u.pathname === '/new/api/tracy-add-site/hold') {
      const body = String(init.body)
      const h = init.headers
      const expected = createHmac('sha256', 'k')
        .update(
          `${h['x-seat-timestamp']}\n${h['x-seat-nonce']}\nPOST\n/api/tracy-add-site/hold\n${createHash('sha256').update(body).digest('hex')}`
        )
        .digest('hex')
      assert.equal(h['x-seat-signature'], expected, 'the hold call is signed with the seat secret')
      assert.equal(h.cookie, 'dsh_gateway_token=lane-token')
      const { op, quietForMs } = JSON.parse(body)
      calls.push(op)
      state.asked.push(u.hostname)
      if (state.gate && op === 'hold') await state.gate
      if (state.down) throw new TypeError('fetch failed')
      if (op === 'hold') {
        if (state.running && u.hostname === state.runningOn)
          return Response.json({ code: 'RUN_ACTIVE', runId: 'r1' }, { status: 409 })
        if (quietForMs && state.lastActivityAt !== null && Date.now() - state.lastActivityAt < quietForMs)
          return Response.json(
            { code: 'RECENT_ACTIVITY', lastActivityAt: state.lastActivityAt },
            { status: 409 }
          )
        state.held = true
        // The hold names what the reads left in the store (`hold-door.ts`).
        return Response.json({
          held: true,
          lastActivityAt: state.lastActivityAt,
          upload: { key: `${PREFIX}webroot-1.tar`, uploadId: 'up-1' },
          // One key outside the site's prefix: never deleted from here.
          archives: [`${PREFIX}db-1.sql.gz`, `sites/other-site/db.sql.gz`]
        })
      }
      if (op === 'release') {
        state.held = false
        return Response.json({ released: true })
      }
      if (op === 'forget') {
        if (!state.held) return Response.json({ code: 'NOT_HELD' }, { status: 409 })
        state.rowGoneAtForget = (await rowOf()) === null
        // The hold stays as a tombstone until it lapses (`hold-door.ts`).
        state.forgotten++
        return Response.json({ forgotten: true })
      }
      return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 })
    }
    return Response.json({ ok: true })
  }
  const seatDoor = { mintSeatSession: async () => 'lane-token' }
  return { state, calls, store, fetchImpl, seatDoor }
}

function harness(pool, host = fakeHost(), envOverrides = {}) {
  const config = readConfig({ ...env, ...envOverrides })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl: host.fetchImpl,
    seatDoor: host.seatDoor
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
  return { ...host, config, cookieFor, send }
}

async function claimImport(send, cookie, siteKey = IMPORTED) {
  const res = await send('POST', '/api/sites', cookie, { origin: 'import', siteKey, platform: 'wordpress' })
  assert.ok(res.status === 201 || res.status === 200, `claim answered ${res.status}`)
}

const rowOf = async (siteKey = IMPORTED) =>
  (await db.pool.query('select * from site where site_key = $1', [siteKey])).rows[0] ?? null
const seatCount = async (siteKey = IMPORTED) =>
  (await db.pool.query('select count(*)::int as n from seat where site_key = $1', [siteKey])).rows[0].n
const remove = (send, cookie, siteKey = IMPORTED) => send('DELETE', `/api/sites/${siteKey}/import`, cookie)

test(
  'Remove of an idle unfinished import: the host forgets it, its objects go, then its seats and row',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)

    const res = await remove(h.send, owner)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { removed: true, artifactsKept: 0 })
    assert.deepEqual(h.calls, ['hold', 'forget'])
    assert.equal(h.state.forgotten, 1)
    assert.equal(await rowOf(), null)
    assert.equal(await seatCount(), 0)
    // The open multipart upload is aborted and the finished archive deleted; the key outside the
    // site's own prefix is not touched.
    assert.deepEqual(h.store.sort(), [
      `DELETE /artifacts/${PREFIX}db-1.sql.gz`,
      `DELETE /artifacts/${PREFIX}webroot-1.tar?uploadId=up-1`
    ])
  }
)

test(
  'Remove while the host reports a read running: refused, nothing deleted, the mark lifted',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    h.state.running = true

    const res = await remove(h.send, owner)
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, 'IMPORT_RUNNING')
    assert.deepEqual(h.calls, ['hold'])
    const row = await rowOf()
    assert.ok(row, 'the row stays')
    assert.equal(row.removing_at, null, 'the right to delete is given back')
    assert.equal(await seatCount(), 1)
    assert.deepEqual(h.store, [])
  }
)

test(
  'Remove with the host unreachable: refused, nothing deleted, the mark lifted, a later Remove works',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    h.state.down = true

    const res = await remove(h.send, owner)
    assert.equal(res.status, 503)
    assert.equal((await res.json()).code, 'HOST_UNAVAILABLE')
    const row = await rowOf()
    assert.equal(row.removing_at, null)
    assert.equal(await seatCount(), 1)
    assert.equal(h.state.forgotten, 0)
    assert.ok(h.calls.includes('release'), 'the host is asked to let go of a hold it may have taken')

    h.state.down = false
    assert.equal((await remove(h.send, owner)).status, 200)
    assert.equal(await rowOf(), null)
  }
)

test(
  'while a Remove holds the import, the claim (start, retry, Continue), /provision and /agent are refused',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    let open
    h.state.gate = new Promise((resolve) => {
      open = resolve
    })
    const removing = remove(h.send, owner)
    // Wait until the Remove has taken its mark and is asking the host.
    // Bounded by the condition, not a wall-clock budget: a loaded machine may take seconds to get here.
    const deadline = Date.now() + 30_000
    while (!h.calls.includes('hold') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
    assert.ok(h.calls.includes('hold'), 'the Remove reached the host')
    assert.ok((await rowOf()).removing_at, 'the mark is taken before the host is asked')

    const claim = await h.send('POST', '/api/sites', owner, {
      origin: 'import',
      siteKey: IMPORTED,
      platform: 'wordpress'
    })
    assert.equal(claim.status, 409)
    assert.equal((await claim.json()).code, 'IMPORT_REMOVING')
    const provision = await h.send('POST', `/api/sites/${IMPORTED}/provision`, owner, {
      platform: 'wordpress',
      webrootKey: `${PREFIX}webroot-1.tar`
    })
    assert.equal(provision.status, 409)
    assert.equal((await provision.json()).code, 'IMPORT_REMOVING')
    const agent = await h.send('POST', `/api/sites/${IMPORTED}/agent`, owner)
    assert.equal(agent.status, 409)
    assert.equal((await agent.json()).code, 'IMPORT_REMOVING')
    assert.equal(h.calls.includes('attach'), false)
    const second = await remove(h.send, owner)
    assert.equal((await second.json()).code, 'IMPORT_REMOVING', 'one Remove at a time')

    open()
    assert.equal((await removing).status, 200)
    assert.equal(await rowOf(), null)
  }
)

test('a provision and a Remove sent together: exactly one of them wins', opts, async () => {
  for (let round = 0; round < 5; round++) {
    await db.reset()
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    const [provision, removal] = await Promise.all([
      h.send('POST', `/api/sites/${IMPORTED}/provision`, owner, {
        platform: 'wordpress',
        webrootKey: `${PREFIX}webroot-1.tar`
      }),
      remove(h.send, owner)
    ])
    const provisioned = provision.status === 202
    const removed = removal.status === 200
    assert.equal(
      provisioned !== removed,
      true,
      `round ${round}: provision ${provision.status}, remove ${removal.status}`
    )
    const row = await rowOf()
    if (removed) assert.equal(row, null)
    else {
      assert.ok(row)
      assert.equal(row.removing_at, null)
      const { rows } = await db.pool.query(`select 1 from job where site_key = $1 and kind = 'provision'`, [
        IMPORTED
      ])
      assert.equal(rows.length, 1)
    }
  }
})

test(
  'Remove refuses a finished import, a site built in Tracy, and a seat that may not delete',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    assert.equal(
      (
        await h.send('POST', `/api/sites/${IMPORTED}/provision`, owner, {
          platform: 'wordpress',
          webrootKey: `${PREFIX}webroot-1.tar`
        })
      ).status,
      202
    )
    const finished = await remove(h.send, owner)
    assert.equal(finished.status, 409)
    assert.equal((await finished.json()).code, 'NOT_UNFINISHED_IMPORT')
    assert.ok(await rowOf())

    await db.pool.query(
      "insert into site (site_key, label, host, platform, origin, port) values ('quayside.localhost', 'quayside', 'local', 'wordpress', 'fleet_born', 41000)"
    )
    const { rows } = await db.pool.query(`select id from account where email = 'owner@x.y'`)
    await db.pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('quayside.localhost', $1, 'owner', $1, now())`,
      [rows[0].id]
    )
    const built = await remove(h.send, owner, 'quayside.localhost')
    assert.equal((await built.json()).code, 'NOT_UNFINISHED_IMPORT')
    assert.ok(await rowOf('quayside.localhost'))

    await claimImport(h.send, owner, 'second.example.com')
    const { rows: editor } = await db.pool.query(
      `insert into account (email) values ('editor@x.y') returning id`
    )
    await db.pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('second.example.com', $1, 'editor', $1, now())`,
      [editor[0].id]
    )
    const notOwner = await remove(h.send, await h.cookieFor('editor@x.y'), 'second.example.com')
    assert.equal(notOwner.status, 403)
    assert.ok(await rowOf('second.example.com'))
    assert.deepEqual(h.calls, [], 'the host was never asked')
  }
)

/** The import's claim as old as `age` (Postgres interval), as the sweep reads it. */
async function ageImport(age, siteKey = IMPORTED) {
  await db.pool.query(
    `update site set created_at = now() - $2::interval, import_touched_at = now() - $2::interval where site_key = $1`,
    [siteKey, age]
  )
}

test(
  'sweep: an import idle for 6 h 31 min is removed through the Remove path; 6 h 29 min is kept',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    await claimImport(h.send, owner, 'fresh.example.com')
    await ageImport('6 hours 31 minutes')
    await ageImport('6 hours 29 minutes', 'fresh.example.com')

    const swept = await sweepAbandonedImports(db.pool, h.config, {
      fetchImpl: h.fetchImpl,
      seatDoor: h.seatDoor
    })
    assert.deepEqual(swept, { ran: true, removed: [IMPORTED], kept: [] })
    assert.deepEqual(h.calls, ['hold', 'forget'], 'the same host protocol as the button')
    assert.equal(await rowOf(), null)
    assert.ok(await rowOf('fresh.example.com'))
  }
)

test(
  'sweep: a busy, recently active or unreachable host keeps the import for the next run',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    await ageImport('7 hours')
    const sweep = () =>
      sweepAbandonedImports(db.pool, h.config, { fetchImpl: h.fetchImpl, seatDoor: h.seatDoor })

    h.state.running = true
    assert.deepEqual((await sweep()).kept, [{ siteKey: IMPORTED, code: 'IMPORT_RUNNING' }])
    h.state.running = false
    // A part landed on the host an hour ago: the host's activity counts, not only the claim's.
    h.state.lastActivityAt = Date.now() - 60 * 60_000
    assert.deepEqual((await sweep()).kept, [{ siteKey: IMPORTED, code: 'IMPORT_RECENT' }])
    h.state.lastActivityAt = null
    h.state.down = true
    assert.deepEqual((await sweep()).kept, [{ siteKey: IMPORTED, code: 'HOST_UNAVAILABLE' }])
    const row = await rowOf()
    assert.ok(row)
    assert.equal(row.removing_at, null)
    assert.equal(await seatCount(), 1)

    h.state.down = false
    assert.deepEqual((await sweep()).removed, [IMPORTED])
  }
)

test(
  'sweep: the claim door pressed recently is activity too, and the existing claim sweep is unchanged',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    await db.pool.query(`update site set created_at = now() - interval '7 hours' where site_key = $1`, [
      IMPORTED
    ])
    // A second press of the claim (Retry) an instant ago.
    await claimImport(h.send, owner)
    const swept = await sweepAbandonedImports(db.pool, h.config, {
      fetchImpl: h.fetchImpl,
      seatDoor: h.seatDoor
    })
    assert.deepEqual(swept.removed, [])
    assert.ok(await rowOf())
    // `sweepClaims` looks only at Tracy-built claims (`site_creation`): an import is not its to take.
    const claims = await sweepClaims(db.pool, h.config, {
      fetchImpl: h.fetchImpl,
      hostCall: async () => ({ ok: true, body: { removed: true } })
    })
    assert.deepEqual(claims.released, [])
    assert.ok(await rowOf())
    assert.ok(ABANDONED_IMPORT_MS > 6 * 60 * 60_000)
  }
)

// The plain delete (`DELETE /api/sites/:key`) on an unfinished import is not a second way to delete
// it: it goes through the same Remove path, with the same answers. A finished import and a built site
// keep the plain teardown.
test(
  'DELETE /api/sites/:key on an unfinished import takes the Remove path: busy and unreachable refused, idle removed',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    const del = () => h.send('DELETE', `/api/sites/${IMPORTED}`, owner)

    h.state.running = true
    const busy = await del()
    assert.equal(busy.status, 409)
    assert.equal((await busy.json()).code, 'IMPORT_RUNNING')
    h.state.running = false
    h.state.down = true
    const down = await del()
    assert.equal(down.status, 503)
    assert.equal((await down.json()).code, 'HOST_UNAVAILABLE')
    assert.ok(await rowOf(), 'nothing was deleted')
    assert.equal((await rowOf()).removing_at, null)
    assert.equal(await seatCount(), 1)

    h.state.down = false
    const done = await del()
    assert.equal(done.status, 200)
    assert.deepEqual(await done.json(), {
      removed: true,
      host: true,
      repo: false,
      sessions: true,
      seats: true
    })
    assert.equal(await rowOf(), null)
    assert.deepEqual(h.calls, ['hold', 'hold', 'release', 'hold', 'forget'])
    assert.equal(h.calls.includes('go-live'), false, 'no plain teardown for an unfinished import')
  }
)

test(
  'DELETE /api/sites/:key on a finished import keeps the plain teardown; its add-site host forgets the read after',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    assert.equal(
      (
        await h.send('POST', `/api/sites/${IMPORTED}/provision`, owner, {
          platform: 'wordpress',
          webrootKey: `${PREFIX}webroot-1.tar`
        })
      ).status,
      202
    )
    await h.send('DELETE', `/api/sites/${IMPORTED}`, owner)
    assert.equal(h.calls.includes('go-live'), true, 'the plain teardown was asked')
    assert.equal(await rowOf(), null, 'and it deleted the finished import')
    // Not the Remove path (no hold before the teardown): once the row is gone the add-site host is
    // asked to hold and forget the read's books — its Claude Cowork code and handover line — and
    // then to let the address go, so no tombstone stands.
    assert.deepEqual(h.calls.slice(h.calls.indexOf('go-live')), ['go-live', 'hold', 'forget', 'release'])
    assert.equal(h.state.rowGoneAtForget, true)
    assert.equal(h.state.startOnHost(), 'started', 'a new import of the same address starts at once')
  }
)

test('forgetImportAtHost: a host that hangs or a call that throws never holds or fails the delete', async () => {
  const config = readConfig(env)
  const warned = []
  const log = { warn: (line) => warned.push(line) }
  const site = { siteKey: IMPORTED, host: 'local', email: 'owner@x.y' }
  // Answers nothing until its request is aborted, the way a stalled socket does.
  const asked = []
  const hangs = (input, init = {}) => {
    asked.push(new URL(String(input)).pathname)
    return new Promise((_resolve, reject) => {
      if (init.signal?.aborted) reject(init.signal.reason)
      init.signal?.addEventListener('abort', () => reject(init.signal.reason))
    })
  }
  const started = Date.now()
  const hung = await forgetImportAtHost(
    {
      config,
      seatDoor: { mintSeatSession: async () => 'lane-token' },
      fetchImpl: hangs,
      log,
      deadlineMs: 200
    },
    site
  )
  assert.equal(hung, false)
  assert.ok(Date.now() - started < 2_000, 'the shared deadline ended every call')
  assert.deepEqual(
    asked,
    ['/new/api/tracy-add-site/hold', '/new/api/tracy-add-site/hold'],
    'hold, then release'
  )
  // The seat session's own request carries no timeout; the shared deadline bounds it as well.
  const mintHangs = await forgetImportAtHost(
    {
      config,
      seatDoor: { mintSeatSession: ({ fetchImpl }) => fetchImpl('http://dsh.test/gateway/seat/session', {}) },
      fetchImpl: hangs,
      log,
      deadlineMs: 200
    },
    site
  )
  assert.equal(mintHangs, false)
  assert.equal(asked.at(-1), '/gateway/seat/session')

  const broken = {
    ...config,
    hosts: {
      get() {
        throw new Error('hosts unreadable')
      }
    }
  }
  assert.equal(await forgetImportAtHost({ config: broken, seatDoor: {}, log }, site), false)
  assert.ok(warned.some((line) => line.includes('hosts unreadable')))
})

// ── Review pass 1 (Sol): the hold stands over the whole clean-up; no second path; the row's host ──

test(
  'the hold stands until every deletion is done: a host start meanwhile, or after, is refused',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    const res = await remove(h.send, owner)
    assert.equal(res.status, 200)
    assert.equal(h.state.rowGoneAtForget, true, 'the row and seats were deleted before the host forgot')
    assert.ok(h.state.heldAtStore.length > 0)
    assert.ok(h.state.heldAtStore.every(Boolean), 'the site was held while its stored copies went')
    assert.equal(h.state.startOnHost(), 'IMPORT_REMOVING', 'the tombstone refuses a tab left open')
    assert.deepEqual(h.calls, ['hold', 'forget'], 'never released once anything was deleted')
  }
)

test(
  'a clean-up that fails part-way keeps the mark and the hold, and the next Remove finishes it',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    const failing = importRemover({
      pool: db.pool,
      config: h.config,
      seats: {
        revokeAllGrants: async () => {
          throw new Error('the seat book went away')
        }
      },
      seatDoor: h.seatDoor,
      fetchImpl: h.fetchImpl,
      log: { warn() {}, error() {} }
    })
    const outcome = await failing(IMPORTED, { email: 'owner@x.y' })
    assert.deepEqual(outcome, { refused: { status: 503, code: 'REMOVE_INCOMPLETE' } })
    const row = await rowOf()
    assert.ok(row, 'nothing was deleted')
    assert.ok(row.removing_at, 'the mark stays')
    assert.equal(h.state.held, true, 'the hold stays')
    assert.deepEqual(h.calls, ['hold'], 'neither released nor forgotten')
    assert.equal(await seatCount(), 1)
    assert.deepEqual(h.store, [], 'no stored copy went before the row')

    // The mark is fresh: another Remove now is told one is under way; once stale, it finishes the job.
    assert.equal((await (await remove(h.send, owner)).json()).code, 'IMPORT_REMOVING')
    await db.pool.query(
      `update site set removing_at = removing_at - make_interval(secs => $2) where site_key = $1`,
      [IMPORTED, REMOVE_MARK_STALE_MS / 1000 + 60]
    )
    assert.equal((await remove(h.send, owner)).status, 200)
    assert.equal(await rowOf(), null)
  }
)

test(
  'DELETE /api/sites/:key/claim on an unfinished import is the Remove path: a running read refuses it',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    h.state.running = true
    const refused = await h.send('DELETE', `/api/sites/${IMPORTED}/claim`, owner)
    assert.equal(refused.status, 409)
    assert.equal((await refused.json()).code, 'IMPORT_RUNNING')
    assert.ok(await rowOf(), 'nothing was deleted')
    assert.equal(await seatCount(), 1)
    assert.equal((await rowOf()).removing_at, null)

    h.state.running = false
    const released = await h.send('DELETE', `/api/sites/${IMPORTED}/claim`, owner)
    assert.equal(released.status, 200)
    assert.deepEqual(await released.json(), { released: true })
    assert.equal(await rowOf(), null)
    assert.deepEqual(h.calls, ['hold', 'hold', 'forget'])
  }
)

test(
  'Remove asks the host on the row, not today’s default; an unknown host deletes nothing',
  opts,
  async () => {
    const twoHosts = {
      HOSTS: 'local,other',
      HOST_other_ORIGIN: 'http://tracy-host-other.test',
      HOST_other_DSH_ORIGIN: 'http://dsh-other.test',
      HOST_other_SECRET: 'h2',
      SEAT_other_SECRET: 'k'
    }
    const host = fakeHost()
    const before = harness(db.pool, host, twoHosts)
    const owner = await before.cookieFor('owner@x.y')
    await claimImport(before.send, owner)
    assert.equal((await rowOf()).host, 'local')

    // The default host is now `other`; the read still runs on `local`, where the import was claimed.
    const after = harness(db.pool, host, { ...twoHosts, HOSTS: 'other,local' })
    assert.equal(after.config.defaultHost, 'other')
    host.state.running = true
    const refused = await remove(after.send, owner)
    assert.equal((await refused.json()).code, 'IMPORT_RUNNING')
    assert.deepEqual(host.state.asked, ['dsh.test'], 'the recorded host was asked, not the default')
    assert.ok(await rowOf())

    // A row whose host this deployment no longer knows: no host is asked, nothing goes.
    host.state.running = false
    await db.pool.query(`update site set host = 'gone' where site_key = $1`, [IMPORTED])
    const unknown = await remove(after.send, owner)
    assert.equal(unknown.status, 503)
    assert.equal((await unknown.json()).code, 'HOST_UNAVAILABLE')
    assert.deepEqual(host.state.asked, ['dsh.test'])
    assert.ok(await rowOf())
    assert.equal((await rowOf()).removing_at, null)

    // The sweep follows the same rule.
    await db.pool.query(
      `update site set created_at = now() - interval '7 hours', import_touched_at = null where site_key = $1`,
      [IMPORTED]
    )
    const swept = await sweepAbandonedImports(db.pool, after.config, {
      fetchImpl: host.fetchImpl,
      seatDoor: host.seatDoor
    })
    assert.deepEqual(swept.kept, [{ siteKey: IMPORTED, code: 'HOST_UNAVAILABLE' }])
    assert.ok(await rowOf())
  }
)

// ── Review pass 2 (Sol): nothing irreversible before the commit; the sweep finishes a stale Remove ──

/** A comment file on the import's row and its stored object, as the comment door writes them. */
async function attachFile(siteKey = IMPORTED) {
  const { rows } = await db.pool.query(`select id from account where email = 'owner@x.y'`)
  await db.pool.query(
    `insert into site_comment_attachment (site_key, uploaded_by, name, size, type, object_key)
     values ($1, $2, 'shot.png', 10, 'image/png', $3)`,
    [siteKey, rows[0].id, `comments/${labelPrefix(siteKey)}/file-1`]
  )
  return `DELETE /artifacts/comments/${labelPrefix(siteKey)}/file-1`
}
const attachmentRows = async (siteKey = IMPORTED) =>
  (
    await db.pool.query('select count(*)::int as n from site_comment_attachment where site_key = $1', [
      siteKey
    ])
  ).rows[0].n

test('a failing transaction leaves every comment file and its stored object in place', opts, async () => {
  const h = harness(db.pool)
  const owner = await h.cookieFor('owner@x.y')
  await claimImport(h.send, owner)
  await attachFile()
  const failing = importRemover({
    pool: db.pool,
    config: h.config,
    seats: {
      revokeAllGrants: async () => {
        throw new Error('the seat book went away')
      }
    },
    seatDoor: h.seatDoor,
    fetchImpl: h.fetchImpl,
    log: { warn() {}, error() {} }
  })
  assert.equal((await failing(IMPORTED, { email: 'owner@x.y' })).refused.code, 'REMOVE_INCOMPLETE')
  assert.equal(await attachmentRows(), 1, 'the attachment row is still there')
  assert.deepEqual(h.store, [], 'no stored object was deleted')
})

test(
  'after the commit the comment files go; a store that refuses is logged and the removal still stands',
  opts,
  async () => {
    const h = harness(db.pool)
    const owner = await h.cookieFor('owner@x.y')
    await claimImport(h.send, owner)
    const fileDelete = await attachFile()
    assert.equal((await remove(h.send, owner)).status, 200)
    assert.equal(await attachmentRows(), 0)
    assert.ok(h.store.includes(fileDelete), 'the stored object was deleted after the row')

    await db.reset()
    const refusing = harness(db.pool)
    const again = await refusing.cookieFor('owner@x.y')
    await claimImport(refusing.send, again)
    await attachFile()
    refusing.state.storeRefuses = true
    const warned = []
    const remover = importRemover({
      pool: db.pool,
      config: refusing.config,
      seats: { revokeAllGrants: (await import('../src/seats/store.js')).revokeAllGrants },
      seatDoor: refusing.seatDoor,
      fetchImpl: refusing.fetchImpl,
      log: { warn: (line) => warned.push(String(line)), error() {} }
    })
    assert.equal((await remover(IMPORTED, { email: 'owner@x.y' })).removed, true)
    assert.equal(await rowOf(), null)
    assert.ok(
      warned.some((line) => line.includes(`comments/${labelPrefix(IMPORTED)}/file-1`)),
      warned.join('\n')
    )
  }
)

/** The mark a Remove left `age` ago (Postgres interval), as one that answered REMOVE_INCOMPLETE or died. */
async function markedAgo(age, siteKey = IMPORTED) {
  await db.pool.query(
    `update site set removing_at = date_trunc('milliseconds', now() - $2::interval) where site_key = $1`,
    [siteKey, age]
  )
}

test('sweep: a stale mark is finished through the Remove path, a fresh one is left alone', opts, async () => {
  const h = harness(db.pool)
  const owner = await h.cookieFor('owner@x.y')
  await claimImport(h.send, owner)
  await claimImport(h.send, owner, 'fresh.example.com')
  // Young imports both: only the mark decides here, not the abandoned-import age.
  await markedAgo(`${REMOVE_MARK_STALE_MS / 60_000 + 1} minutes`)
  await markedAgo('1 minute', 'fresh.example.com')

  const swept = await sweepAbandonedImports(db.pool, h.config, {
    fetchImpl: h.fetchImpl,
    seatDoor: h.seatDoor
  })
  assert.deepEqual(swept.removed, [IMPORTED])
  assert.deepEqual(swept.kept, [])
  assert.equal(await rowOf(), null)
  assert.ok((await rowOf('fresh.example.com')).removing_at, 'the Remove in progress keeps its mark')
  assert.deepEqual(h.calls, ['hold', 'forget'], 'only the stale one was asked of the host')
})

test('two runners on the same stale mark: exactly one proceeds', opts, async () => {
  const h = harness(db.pool)
  const owner = await h.cookieFor('owner@x.y')
  await claimImport(h.send, owner)
  await markedAgo(`${REMOVE_MARK_STALE_MS / 60_000 + 1} minutes`)
  const remover = importRemover({
    pool: db.pool,
    config: h.config,
    seats: { revokeAllGrants: (await import('../src/seats/store.js')).revokeAllGrants },
    seatDoor: h.seatDoor,
    fetchImpl: h.fetchImpl,
    log: { warn() {}, error() {} }
  })
  const outcomes = await Promise.all([
    remover(IMPORTED, { email: 'owner@x.y' }),
    remover(IMPORTED, { email: 'owner@x.y' }),
    sweepAbandonedImports(db.pool, h.config, { fetchImpl: h.fetchImpl, seatDoor: h.seatDoor })
  ])
  const proceeded = [outcomes[0].removed, outcomes[1].removed, outcomes[2].removed.length === 1].filter(
    Boolean
  )
  assert.equal(proceeded.length, 1, JSON.stringify(outcomes))
  assert.equal(h.calls.filter((call) => call === 'hold').length, 1, 'the host was asked by one runner only')
  assert.equal(await rowOf(), null)
})

test('two sweeps at once on a stale mark: exactly one completes it', opts, async () => {
  const h = harness(db.pool)
  const owner = await h.cookieFor('owner@x.y')
  await claimImport(h.send, owner)
  await markedAgo(`${REMOVE_MARK_STALE_MS / 60_000 + 1} minutes`)
  const sweep = () =>
    sweepAbandonedImports(db.pool, h.config, { fetchImpl: h.fetchImpl, seatDoor: h.seatDoor })
  const [a, b] = await Promise.all([sweep(), sweep()])
  assert.equal(a.removed.length + b.removed.length, 1, JSON.stringify([a, b]))
  assert.equal(h.calls.filter((call) => call === 'hold').length, 1)
  assert.equal(await rowOf(), null)
})
