/**
 * `/api/ops/cms` — the same door as `/ops`, a read-only surface behind it, and a reader that
 * refuses a snapshot it cannot vouch for.
 *
 * WHAT THESE TESTS ARE FOR, beyond "the route answers". Three properties carry the whole design,
 * and each is cheap to break by accident:
 *
 *   1. The door is the SAME door. Signed out gets the sign-in redirect; a signed-in non-staff gets
 *      a bodyless 403 that says nothing about the surface existing. If this namespace ever grows a
 *      friendlier error, it becomes the one path that maps the internal surface for an outsider.
 *   2. The surface is read-only, and refuses writes rather than 404-ing them — a 404 on POST reads
 *      as "wrong path, try another", a 405 says the shape of the place.
 *   3. A snapshot is DATA THE SERVER VOUCHES FOR. Wrong digest, wrong schema, truncated file,
 *      absent file: each is a distinct, visible failure, never a half-drawn screen. This is the
 *      property the plan calls "tamper must make validation red".
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, after, before, beforeEach } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const SHA = 'a'.repeat(40)

/** The smallest snapshot the reader will accept, so a test can bend exactly one thing at a time. */
function snapshotFixture(over = {}) {
  const sections = {}
  for (const key of [
    'bases',
    'capabilities',
    'stages',
    'designs',
    'contracts',
    'presets',
    'questions',
    'tools'
  ])
    sections[key] = { status: 'ok', reason: null, data: {}, sources: [] }
  sections.designs = {
    status: 'ok',
    reason: null,
    sources: [],
    data: {
      byCms: {
        joomla: { status: 'ok', count: 3, systems: [{ id: 'apple' }, { id: 'airbnb' }, { id: 'bmw' }] },
        wordpress: { status: 'missing', reason: 'not here', systems: null },
        emdash: { status: 'unsupported', reason: 'no theme package', systems: null }
      }
    }
  }
  sections.stages = {
    status: 'ok',
    reason: null,
    sources: [],
    data: { byCms: { joomla: { status: 'ok', stages: ['check', 'shot'] } } }
  }
  return {
    schemaVersion: 'tracy-ops-cms/v1',
    source: {
      env: 'dev',
      label: 'Dev',
      ref: 'origin/develop',
      sha: SHA,
      generatedAt: '2026-09-12T00:00:00.000Z'
    },
    sections,
    observations: [],
    notes: [],
    ...over
  }
}

/** A snapshot directory whose index records the digest of the bytes actually written. */
function fixtureSnapshotDir(files = { dev: snapshotFixture() }, { corruptDigest = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-ops-cms-'))
  const environments = []
  for (const [id, snap] of Object.entries(files)) {
    const body = typeof snap === 'string' ? snap : `${JSON.stringify(snap, null, 2)}\n`
    writeFileSync(join(dir, `${id}.json`), body)
    const digest = createHash('sha256').update(body).digest('hex')
    environments.push({
      id,
      label: id === 'dev' ? 'Dev' : 'Main',
      sha: typeof snap === 'string' ? SHA : (snap.source?.sha ?? null),
      available: true,
      digest: corruptDigest ? 'f'.repeat(64) : digest,
      bytes: Buffer.byteLength(body)
    })
  }
  writeFileSync(
    join(dir, 'index.json'),
    `${JSON.stringify({ schemaVersion: 'tracy-ops-cms/v1', generatedAt: '2026-09-12T00:00:00.000Z', environments }, null, 2)}\n`
  )
  return dir
}

function harness(pool, { snapshotDir, opsFetch } = {}) {
  // `opsFetch` stands in for the model when a test presses Translate: `config.model` is what the
  // door checks for, `fetchImpl` is what it calls. Neither reaches a vendor from a test.
  const config = readConfig(
    opsFetch ? { ...env, MODEL_API_KEY: 'test-key', MODEL_BASE_URL: 'https://model.test/v1' } : env
  )
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    ...(opsFetch ? { fetchImpl: opsFetch } : {}),
    ...(snapshotDir ? { opsSnapshotDir: snapshotDir } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
    )
  const send = (method, path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: cookie ? { cookie } : {}
      })
    )
  return { app, cookieFor, get, send }
}

async function seedStaff(pool, email) {
  const owner = (
    await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
  ).rows[0].id
  const ws = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
    [ws, owner]
  )
  return ws
}

// ── the door ─────────────────────────────────────────────────────────────────────────────────

test('every /api/ops/cms door refuses exactly the way /ops does', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    const paths = [
      '/api/ops/cms/environments',
      '/api/ops/cms/snapshot?env=dev',
      '/api/ops/cms/designs?env=dev&cms=joomla',
      '/api/ops/cms/runtime'
    ]
    for (const path of paths) {
      const out = await get(path)
      assert.equal(out.status, 302, `${path} signed out`)
      assert.equal(out.headers.get('location'), `/login?next=${encodeURIComponent(path.split('?')[0])}`)
      await out.body?.cancel()

      const stranger = await get(path, await cookieFor('nobody@example.test'))
      assert.equal(stranger.status, 403, `${path} signed in, not staff`)
      assert.equal(await stranger.text(), '', 'a 403 here must carry no body — no hint the surface exists')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a revoked staff seat loses the surface again', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const cookie = await cookieFor('staff@tracy.test')
    const before = await get('/api/ops/cms/environments', cookie)
    assert.equal(before.status, 200)
    await before.body?.cancel()

    await pool.query('update seat_workspace set revoked_at = now()')
    const after = await get('/api/ops/cms/environments', cookie)
    assert.equal(after.status, 403)
    assert.equal(await after.text(), '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── read-only, and enforced ──────────────────────────────────────────────────────────────────

test('the namespace answers 405 to every write method, and says why', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { send, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const cookie = await cookieFor('staff@tracy.test')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await send(method, '/api/ops/cms/snapshot?env=dev', cookie)
      assert.equal(res.status, 405, `${method} must be refused`)
      assert.equal(res.headers.get('allow'), 'GET, HEAD')
      const body = await res.json()
      assert.match(body.reason, /read-only/)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── the environment is a key, never a path ───────────────────────────────────────────────────

test('an environment id that is not in the index is a 404, whatever it looks like', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const cookie = await cookieFor('staff@tracy.test')
    for (const bad of [
      '../../../../etc/passwd',
      '..%2F..%2Findex',
      'origin/develop',
      'main;rm -rf /',
      'DEV',
      'a'.repeat(64),
      ''
    ]) {
      const res = await get(`/api/ops/cms/snapshot?env=${encodeURIComponent(bad)}`, cookie)
      assert.equal(res.status, 404, `env=${bad} must not resolve`)
      const body = await res.json()
      assert.equal(body.status, 'error')
      assert.equal(/passwd|root:/.test(JSON.stringify(body)), false, 'and must never echo a filesystem')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── a snapshot the server cannot vouch for is not served as data ─────────────────────────────

test('a snapshot whose bytes do not match the recorded digest is refused', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir({ dev: snapshotFixture() }, { corruptDigest: true })
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const res = await get('/api/ops/cms/snapshot?env=dev', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.match(body.reason, /does not match the digest/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a snapshot from a newer generator is refused rather than half-read', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir({ dev: snapshotFixture({ schemaVersion: 'tracy-ops-cms/v2' }) })
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const res = await get('/api/ops/cms/snapshot?env=dev', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 500)
    assert.match((await res.json()).reason, /this build reads tracy-ops-cms\/v1/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a truncated snapshot is an error naming the environment, not a crash', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir({ dev: '{"schemaVersion":"tracy-ops-cms/v1","sections":' })
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const res = await get('/api/ops/cms/snapshot?env=dev', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 500)
    assert.match((await res.json()).reason, /not valid JSON/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a build with no snapshots at all says so instead of pretending to have none', opts, async () => {
  const { pool } = db
  const dir = mkdtempSync(join(tmpdir(), 'tracy-ops-cms-empty-'))
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const res = await get('/api/ops/cms/environments', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'unavailable')
    assert.deepEqual(body.environments, [])
    assert.match(body.reason, /shipped no configuration snapshots/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a branch that did not resolve at build time reads as unavailable, with its reason', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir({
    dev: {
      schemaVersion: 'tracy-ops-cms/v1',
      source: { env: 'dev', ref: 'origin/develop', sha: null, generatedAt: '2026-09-12T00:00:00.000Z' },
      unavailable: 'None of origin/develop, develop exists in this repository.'
    }
  })
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const res = await get('/api/ops/cms/snapshot?env=dev', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'unavailable')
    assert.match(body.reason, /exists in this repository/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── what a good read gives the screen ────────────────────────────────────────────────────────

test('a snapshot arrives with its provenance and its design catalogue bounded', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const res = await get('/api/ops/cms/snapshot?env=dev', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = await res.json()
    assert.equal(body.source.sha, SHA)
    assert.equal(typeof body.source.digest, 'string')
    assert.equal(body.sections.designs.data.byCms.joomla.total, 3, 'the total is the real one')
    assert.equal(body.sections.designs.data.byCms.wordpress.status, 'missing')
    assert.equal(body.sections.designs.data.byCms.emdash.status, 'unsupported')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the design catalogue pages and searches, and always reports the true total', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const cookie = await cookieFor('staff@tracy.test')

    const page = await (await get('/api/ops/cms/designs?env=dev&cms=joomla&limit=2&offset=0', cookie)).json()
    assert.equal(page.total, 3)
    assert.equal(page.systems.length, 2)

    const hit = await (await get('/api/ops/cms/designs?env=dev&cms=joomla&q=air', cookie)).json()
    assert.equal(hit.matched, 1)
    assert.equal(hit.total, 3, 'searching narrows the rows, never the total')
    assert.equal(hit.systems[0].id, 'airbnb')

    const none = await (await get('/api/ops/cms/designs?env=dev&cms=joomla&q=zzzz', cookie)).json()
    assert.equal(none.matched, 0)
    assert.deepEqual(none.systems, [])

    // A CMS whose catalogue is absent reports its own reason rather than an empty list.
    const absent = await (await get('/api/ops/cms/designs?env=dev&cms=wordpress', cookie)).json()
    assert.equal(absent.status, 'missing')
    assert.equal(absent.reason, 'not here')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a silly limit or offset cannot make the server read more than a page', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const cookie = await cookieFor('staff@tracy.test')
    for (const q of ['limit=999999', 'limit=-5', 'limit=abc', 'offset=-1', 'offset=1e99']) {
      const body = await (await get(`/api/ops/cms/designs?env=dev&cms=joomla&${q}`, cookie)).json()
      assert.ok(body.limit >= 1 && body.limit <= 200, `${q} -> limit ${body.limit}`)
      assert.ok(body.offset >= 0, `${q} -> offset ${body.offset}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── runtime is a different question, and says so ─────────────────────────────────────────────

test(
  'runtime with no host channel is unknown, and says it is not the same as nothing running',
  opts,
  async () => {
    const { pool } = db
    const dir = fixtureSnapshotDir()
    try {
      const { get, cookieFor } = harness(pool, { snapshotDir: dir })
      await seedStaff(pool, 'staff@tracy.test')
      const res = await get('/api/ops/cms/runtime', await cookieFor('staff@tracy.test'))
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.status, 'unknown')
      assert.match(body.reason, /Not the same as nothing running/)
      assert.equal(typeof body.observedAt, 'string')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)

test('a snapshot never carries a running claim of its own', opts, async () => {
  const { pool } = db
  const dir = fixtureSnapshotDir()
  try {
    const { get, cookieFor } = harness(pool, { snapshotDir: dir })
    await seedStaff(pool, 'staff@tracy.test')
    const body = await (
      await get('/api/ops/cms/snapshot?env=dev', await cookieFor('staff@tracy.test'))
    ).json()
    assert.deepEqual(body.observations, [], 'a tree has observed nothing; only /runtime may say otherwise')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * One ready release with a questionnaire, as a read of GitHub would have left it. Written here
 * rather than through the reader so this test says what it depends on.
 */
async function seedRelease(pool, tag) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
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
      `${tag}@aa`,
      tag,
      JSON.stringify({
        schemaVersion: 'tracy-questions/v1',
        owner: tag,
        languages: ['en', 'vi'],
        questions: [
          {
            id: 'name',
            kind: 'text',
            step: 1,
            label: { en: 'Company', vi: 'Công ty' },
            feeds: ['site.name']
          },
          { id: 'sector', kind: 'text', step: 2, label: { en: 'Sector', vi: 'Ngành' }, feeds: ['agent'] }
        ]
      })
    ]
  )
}

test('the live base setting is admin-only, same-origin, persistent and revision checked', opts, async () => {
  const { pool } = db
  const { app, get, cookieFor } = harness(pool)
  const endpoint = '/api/ops/build-base/joomla'
  assert.equal((await get(endpoint)).status, 302)
  const outsider = await cookieFor('outside@example.test')
  assert.equal((await get(endpoint, outsider)).status, 403)
  await seedStaff(pool, 'owner@example.test')
  const owner = await cookieFor('owner@example.test')
  const initial = await (await get(endpoint, owner)).json()
  assert.equal(initial.quickstart, 'tracy-base/j6')
  const put = (origin, body) =>
    app.fetch(
      new Request(`http://tracy.test${endpoint}`, {
        method: 'PUT',
        headers: { cookie: owner, origin, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  const body = { quickstart: initial.quickstart, registryRevision: initial.registryRevision, revision: 0 }
  assert.equal((await put('https://outsider.test', body)).status, 403)
  assert.equal((await put('http://tracy.test', { ...body, quickstart: 'unknown' })).status, 400)
  assert.equal((await put('http://tracy.test', body)).status, 200)
  assert.equal((await put('http://tracy.test', body)).status, 409)
  const fresh = harness(pool)
  const saved = await (await fresh.get(endpoint, owner)).json()
  assert.equal(saved.revision, 1)
  assert.equal(saved.updatedBy, 'owner@example.test')
  // The questionnaire setting: chooses among the sets that exist on this server, and never edits
  // one — editing lives on the quickstart the set belongs to (ops/quickstarts.js).
  const tag = 'tracy-business/emdash-0.x'
  await seedRelease(pool, tag)
  const qEndpoint = '/api/ops/build-questions/emdash'
  const q0 = await (await get(qEndpoint, owner)).json()
  assert.equal(q0.source, 'standard')
  assert.deepEqual(
    q0.options.map((o) => o.id),
    ['standard', tag],
    'the CMS default may be its own set, or a ready release that carries one'
  )
  const putQ = (b) =>
    app.fetch(
      new Request(`http://tracy.test${qEndpoint}`, {
        method: 'PUT',
        headers: { cookie: owner, origin: 'http://tracy.test', 'content-type': 'application/json' },
        body: JSON.stringify(b)
      })
    )
  assert.equal((await putQ({ source: 'tracy-next/emdash', revision: 0 })).status, 400)
  assert.equal((await putQ({ source: tag, revision: 0 })).status, 200)
  assert.equal((await (await get(qEndpoint, owner)).json()).source, tag)
  assert.equal((await get('/api/ops/build-questions/drupal', owner)).status, 404)

  await pool.query("update seat_workspace set role='developer'")
  assert.equal((await put('http://tracy.test', { ...body, revision: 1 })).status, 403)

  // One setting per CMS: EmDash answers on its own path with its own list, and a CMS this build
  // never heard of is 404 rather than an empty setting that looks configurable.
  // EmDash's bases are the releases this server has read — one, seeded above.
  const emdash = await (await get('/api/ops/build-base/emdash', owner)).json()
  assert.equal(emdash.quickstart, tag)
  assert.deepEqual(
    emdash.options.map((o) => o.id),
    [tag]
  )
  assert.equal((await get('/api/ops/build-base/drupal', owner)).status, 404)
})
