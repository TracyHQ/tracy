/**
 * Review (09/10/2026) of the Apply door's write path (`applyDoorOnce`, `sites/route.js`): the lease,
 * the `site_write` outcome, and the seat checks, at the door, with a fake Claude Cowork plugin.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/review-apply-write-door.test.mjs
 *
 * The first test failed on develop 6d8434735 (the target refusal kept the lease; fixed). The second is a
 * TODO: the Joomla plugin answers `write_failed` both for a rolled-back write and for one whose move
 * landed, so the door cannot tell them apart until the Claude Cowork plugin says so in a field of its
 * own. The rest pin behaviour that had no test at the door.
 */
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'

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
const SITE = 'lantern.localhost'

/** A fake Claude Cowork plugin: answers `answer(body)` and records every call. */
function fakePlugin(answer) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url: String(input), body })
    return new Response(JSON.stringify(answer(body)), { status: 200 })
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
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'lantern', 'local'])
  for (const [email, role] of [
    ['owner@x.y', 'owner'],
    ['editor@x.y', 'editor'],
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
  await writeComponent(
    pool,
    SITE,
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  /** An Apply as a chat session makes it (the lease keys on `x-tracy-session`). */
  const apply = async (email, session, body) =>
    app.fetch(
      new Request(`http://tracy.test/api/sites/${SITE}/apply`, {
        method: 'POST',
        headers: {
          cookie: await cookieFor(email),
          'content-type': 'application/json',
          ...(session ? { 'x-tracy-session': session } : {})
        },
        body: JSON.stringify(body)
      })
    )
  return { app, apply }
}

const leaseRow = async (pool) =>
  (await pool.query('select * from site_write_lease where site_key = $1', [SITE])).rows[0] ?? null
const writes = async (pool) =>
  (
    await pool.query('select action, outcome, session_id from site_write where site_key = $1 order by id', [
      SITE
    ])
  ).rows

test(
  'media.delete is accepted by the Apply door; dry_run is not recorded as a site write',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin((body) =>
      body.params.dry_run === true
        ? {
            ok: true,
            deleted: {
              path: 'images/hero.jpg',
              files: [{ path: 'images/hero.jpg', size: 123, sha256: 'abc' }]
            },
            totalBytes: 123,
            undoCopyUnderCap: true,
            usedIn: [],
            usedInScope: 'all pages'
          }
        : {
            ok: true,
            deleted: {
              path: 'images/hero.jpg',
              files: [{ path: 'images/hero.jpg', size: 123, sha256: 'abc' }]
            },
            storageDeleted: true,
            filesLeft: [],
            usedIn: [],
            usedInScope: 'all pages',
            undo: 'apply.revert media-real-1',
            cdnCache: 'may be cached'
          }
    )
    const { apply } = await setup(pool, plugin.fetchImpl)

    const preview = await apply('owner@x.y', 'session-media', {
      action: 'media.delete',
      params: { apply_id: 'media-preview-1', path: 'images/hero.jpg', dry_run: true }
    })
    assert.equal(preview.status, 200)
    assert.equal((await preview.json()).ok, true)
    assert.equal(plugin.calls[0].body.action, 'media.delete')
    assert.equal(plugin.calls[0].body.params.dry_run, true)
    assert.deepEqual(await writes(pool), [], 'preview does not create a site_write row')
    assert.equal(await leaseRow(pool), null, 'preview does not hold the write lease')

    const deleted = await apply('owner@x.y', 'session-media', {
      action: 'media.delete',
      params: { apply_id: 'media-real-1', path: 'images/hero.jpg' }
    })
    assert.equal(deleted.status, 200)
    assert.equal((await deleted.json()).storageDeleted, true)
    assert.equal(plugin.calls[1].body.action, 'media.delete')
    assert.equal(plugin.calls[1].body.params.dry_run, undefined)
    assert.equal((await writes(pool))[0].action, 'media.delete')
  }
)

const WRITE = {
  action: 'content.update',
  params: { kind: 'article', id: 1, fields: { title: 'x' }, apply_id: 'a-1' }
}

// ── FAILING: defects ────────────────────────────────────────────────────────────────────────────

test(
  'a write refused APPLY_TARGET_NOT_ALLOWED changed nothing, so it must not hold the site for 90 s',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin(() => ({ ok: true, kind: 'article', id: 1 }))
    const { apply } = await setup(pool, plugin.fetchImpl)

    const refused = await apply('owner@x.y', 'session-a', {
      ...WRITE,
      target: 'https://lantern--preview.example/'
    })
    assert.equal(refused.status, 400)
    assert.equal((await refused.json()).code, 'APPLY_TARGET_NOT_ALLOWED')
    assert.equal(plugin.calls.length, 0, 'the refused call reached the plugin')

    // Nothing was written, so the customer's other conversation must get in at once.
    const other = await apply('editor@x.y', 'session-b', WRITE)
    const body = await other.json()
    assert.equal(
      other.status,
      200,
      `a call refused before the plugin left the lease with ${(await leaseRow(pool))?.holder_session}: ${body.code}`
    )
  }
)

// A write that failed AFTER part of it reached the site (22/10/2026). The Joomla plugin moves a menu item,
// then its field update throws: the answer is `ok:false`, and the site has changed. It was recorded `refused`
// ("nothing written"), the lease went back to the other chat, and Site changes showed nothing for a site that
// had changed. The plugin now says so with a machine-readable `landed: true`; only that flag counts.
const PARTLY = {
  ok: false,
  error: 'write_failed',
  message: 'the move landed (revert via apply.revert); the field update failed: Duplicate alias'
}
const MOVE_AND_FIELD = {
  action: 'content.update',
  params: { kind: 'menuItem', id: 12, fields: { parent_id: 3, alias: 'home' }, apply_id: 'm-1' }
}

test(
  "a plugin 'write_failed' flagged landed is recorded as a change that may have happened, keeps the lease and moves the stamp",
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin(() => ({ ...PARTLY, landed: true }))
    const { apply } = await setup(pool, plugin.fetchImpl)

    const res = await apply('owner@x.y', 'session-a', MOVE_AND_FIELD)
    assert.equal(res.status, 200)
    const answer = await res.json()
    assert.equal(answer.ok, false, 'the agent is still told it failed')
    assert.equal(answer.landed, true, 'and told part of it landed')

    const rows = await writes(pool)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].outcome, 'unknown', "not 'refused' (nothing written): the move landed")
    assert.equal((await leaseRow(pool))?.holder_session, 'session-a', 'the half-applied site was handed on')
    const stamp = (await pool.query('select last_write_at from site where site_key = $1', [SITE])).rows[0]
    assert.ok(stamp.last_write_at, 'the site changed, so the stamp other conversations read moved')
  }
)

test(
  "a plugin 'write_failed' with no landed flag is still a clean refusal: the lease goes back, no stamp",
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin(() => PARTLY)
    const { apply } = await setup(pool, plugin.fetchImpl)

    await apply('owner@x.y', 'session-a', MOVE_AND_FIELD)
    const rows = await writes(pool)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].outcome, 'refused', 'the message words are never read: only the flag counts')
    assert.equal((await leaseRow(pool))?.holder_session ?? null, null, 'a clean no gives the lease back')
    const stamp = (await pool.query('select last_write_at from site where site_key = $1', [SITE])).rows[0]
    assert.equal(stamp.last_write_at, null)
  }
)

test('a landed flag on an answer that is ok, or is not a write failure, changes nothing', opts, async () => {
  const { pool } = db
  const plugin = fakePlugin(() => ({ ok: true, kind: 'article', id: 1, landed: true }))
  const { apply } = await setup(pool, plugin.fetchImpl)
  await apply('owner@x.y', 'session-a', WRITE)
  const rows = await writes(pool)
  assert.equal(rows[0].outcome, 'ok')
})

// ── PASSING: coverage ───────────────────────────────────────────────────────────────────────────

test(
  'a viewer seat cannot write through the door: refused, plugin never called, no lease, no site_write',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin(() => ({ ok: true }))
    const { apply } = await setup(pool, plugin.fetchImpl)

    for (const body of [
      WRITE,
      { action: 'apply.revert', params: { apply_id: 'a-1' } },
      { action: 'content.delete', params: { kind: 'article', id: 1, apply_id: 'd-1' } },
      { action: 'media.upload', params: { path: 'images/x.png', content_b64: 'AA==', apply_id: 'u-1' } }
    ]) {
      const res = await apply('viewer@x.y', 'session-v', body)
      assert.equal(res.status, 403, body.action)
      assert.equal((await res.json()).code, 'TOOLSET_NOT_GRANTED', body.action)
    }
    assert.equal(plugin.calls.length, 0)
    assert.equal(await leaseRow(pool), null)
    assert.deepEqual(await writes(pool), [])
  }
)

test(
  'an accepted write records site_write ok under its session; a clean refusal records refused and frees the site',
  opts,
  async () => {
    const { pool } = db
    let answer = { ok: true, kind: 'article', id: 1 }
    const plugin = fakePlugin(() => answer)
    const { apply } = await setup(pool, plugin.fetchImpl)

    assert.equal((await apply('owner@x.y', 'session-a', WRITE)).status, 200)
    // The plugin received exactly what was asked, with the token and nothing else of the door's.
    assert.equal(plugin.calls.length, 1)
    assert.equal(plugin.calls[0].body.action, 'content.update')
    assert.deepEqual(plugin.calls[0].body.params, WRITE.params)
    assert.equal(plugin.calls[0].body.token, 'z'.repeat(20))

    answer = { ok: false, error: 'bad_params', message: 'apply_id required' }
    // A different account, after the holder freed it — its own refused call opened and closes the hold.
    await pool.query('update site_write_lease set holder_session = null where site_key = $1', [SITE])
    assert.equal((await apply('editor@x.y', 'session-b', WRITE)).status, 200)
    assert.deepEqual(
      (await writes(pool)).map((r) => [r.outcome, r.session_id]),
      [
        ['ok', 'session-a'],
        ['refused', 'session-b']
      ]
    )
    assert.equal((await leaseRow(pool))?.holder_session ?? null, null)
  }
)

test(
  'a plugin that cannot be reached leaves site_write unknown and keeps the lease (the write may have landed)',
  opts,
  async () => {
    const { pool } = db
    const fetchImpl = async () => {
      throw new Error('socket hang up')
    }
    const { apply } = await setup(pool, fetchImpl)

    const res = await apply('owner@x.y', 'session-a', WRITE)
    assert.equal(res.status, 502)
    assert.equal((await res.json()).code, 'COMPONENT_UNREACHABLE')
    assert.deepEqual(
      (await writes(pool)).map((r) => r.outcome),
      ['unknown']
    )
    assert.equal((await leaseRow(pool))?.holder_session, 'session-a')
  }
)

test(
  'a write from a chat with no session header takes no lease (the build and the seeder)',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakePlugin(() => ({ ok: true }))
    const { apply } = await setup(pool, plugin.fetchImpl)

    assert.equal((await apply('owner@x.y', null, WRITE)).status, 200)
    assert.equal(await leaseRow(pool), null)
    assert.deepEqual(
      (await writes(pool)).map((r) => r.outcome),
      ['ok']
    )
  }
)
