/**
 * The Apply door's `media.upload` on an EmDash site (`sites/emdash-media.js`): the picture goes to the
 * site's host (`POST /_host/emdash-media`), which runs the site's own `media_upload` inside its container —
 * tracy-web holds no EmDash write token. Same seat check, toolset gate, lease and `site_write` row as a
 * Joomla or WordPress upload; the answer names the library item and its url.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/apply-emdash-media.test.mjs
 */
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'

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
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}
const SITE = 'orchid.localhost'
const SHA = 'a'.repeat(64)
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64')
const UPLOAD = {
  action: 'media.upload',
  params: { apply_id: 'wo-media-abc', path: `tracy-content/${SHA}.png`, content_b64: PNG_B64 }
}

/** A fake host that answers `/_host/emdash-media` with `answer(body)` = [status, json], and records each call. */
function fakeHost(answer) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const url = String(input)
    if (!url.startsWith('http://tracy-host.test/_host/')) throw new Error(`unexpected fetch ${url}`)
    const body = JSON.parse(init.body)
    calls.push({ path: new URL(url).pathname, body })
    const [status, json] = answer(body)
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
  }
  return { calls, fetchImpl }
}

async function setup(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  await pool.query(
    `insert into site (site_key, label, host, platform, origin) values ($1, 'orchid', 'local', 'emdash', 'fleet_born')`,
    [SITE]
  )
  for (const [email, role] of [
    ['owner@x.y', 'owner'],
    ['viewer@x.y', 'viewer']
  ]) {
    const { rows } = await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
      [SITE, rows[0].id, role]
    )
  }
  const apply = async (email, session, body) =>
    app.fetch(
      new Request(`http://tracy.test/api/sites/${SITE}/apply`, {
        method: 'POST',
        headers: {
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
          'content-type': 'application/json',
          'x-tracy-session': session
        },
        body: JSON.stringify(body)
      })
    )
  return { apply }
}

const writes = async (pool) =>
  (await pool.query('select action, outcome from site_write where site_key = $1 order by id', [SITE])).rows
const leaseRow = async (pool) =>
  (await pool.query('select holder_session from site_write_lease where site_key = $1', [SITE])).rows[0] ??
  null

test('an owner’s media.upload on EmDash goes to the host and answers the library item', opts, async () => {
  const { pool } = db
  const host = fakeHost(() => [
    200,
    { ok: true, id: '01MEDIA', url: '/_emdash/api/media/file/01MEDIA.png', deduplicated: false }
  ])
  const { apply } = await setup(pool, host.fetchImpl)
  const res = await apply('owner@x.y', 'session-a', UPLOAD)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    ok: true,
    id: '01MEDIA',
    url: '/_emdash/api/media/file/01MEDIA.png',
    path: '/_emdash/api/media/file/01MEDIA.png',
    deduplicated: false
  })
  assert.equal(host.calls.length, 1)
  assert.equal(host.calls[0].path, '/_host/emdash-media')
  assert.deepEqual(host.calls[0].body, {
    label: 'orchid',
    filename: `${SHA}.png`,
    contentType: 'image/png',
    base64: PNG_B64
  })
  assert.deepEqual(await writes(pool), [{ action: 'media.upload', outcome: 'ok' }])
})

test('a viewer is refused at the toolset gate; the host is never asked', opts, async () => {
  const { pool } = db
  const host = fakeHost(() => [200, { ok: true, id: 'x', url: '/x' }])
  const { apply } = await setup(pool, host.fetchImpl)
  const res = await apply('viewer@x.y', 'session-v', UPLOAD)
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'TOOLSET_NOT_GRANTED')
  assert.equal(host.calls.length, 0)
})

test(
  'a path that names no picture is refused before the host; a clean no from the site is refused and frees the site',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost(() => [
      422,
      { ok: false, code: 'TOOL_FAILED', detail: 'scope media:write missing' }
    ])
    const { apply } = await setup(pool, host.fetchImpl)
    const bad = await apply('owner@x.y', 'session-a', {
      action: 'media.upload',
      params: { apply_id: 'u-1', path: 'tracy-content/x.gif', content_b64: PNG_B64 }
    })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).code, 'INVALID_MEDIA')
    assert.equal(host.calls.length, 0)

    const res = await apply('owner@x.y', 'session-a', UPLOAD)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, false)
    assert.equal(body.error, 'TOOL_FAILED')
    assert.deepEqual((await writes(pool)).at(-1), { action: 'media.upload', outcome: 'refused' })
    assert.equal(await leaseRow(pool).then((r) => r?.holder_session ?? null), null)
  }
)

test(
  'a host that gives no readable answer is unknown, not refused: 502 and the site stays held',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost(() => [502, { ok: false, code: 'SITE_UNREACHABLE' }])
    const { apply } = await setup(pool, host.fetchImpl)
    const res = await apply('owner@x.y', 'session-a', UPLOAD)
    assert.equal(res.status, 502)
    assert.equal((await res.json()).code, 'EMDASH_MEDIA_UNREACHABLE')
    assert.deepEqual(await writes(pool), [{ action: 'media.upload', outcome: 'unknown' }])
    assert.equal((await leaseRow(pool))?.holder_session, 'session-a')
  }
)

test(
  'bytes the library already holds (deduplicated) are answered ok but write no site_write row',
  opts,
  async () => {
    const { pool } = db
    const host = fakeHost(() => [
      200,
      { ok: true, id: '01MEDIA', url: '/_emdash/api/media/file/01MEDIA.png', deduplicated: true }
    ])
    const { apply } = await setup(pool, host.fetchImpl)
    const res = await apply('owner@x.y', 'session-a', UPLOAD)
    assert.equal(res.status, 200)
    assert.equal((await res.json()).deduplicated, true)
    assert.deepEqual(await writes(pool), [], 'nothing changed: no Site changes row')
    const trail = (
      await pool.query(`select detail from audit where site_key = $1 and action = 'media.upload'`, [SITE])
    ).rows
    assert.equal(trail.length, 1, 'the call itself is still in the trail')
    assert.equal(trail[0].detail.deduplicated, true)
    const stamp = (await pool.query('select last_write_at from site where site_key = $1', [SITE])).rows[0]
    assert.equal(stamp.last_write_at, null, 'last_write_at does not move')
  }
)
