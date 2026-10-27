/**
 * Where a content write came from, as the Apply door records it (`site_write.origin`, sweep #4 and #2 of the
 * 04/10 dev E2E; council 11/10/2026), at the door with a fake Claude Cowork plugin:
 *
 *   - a write the server makes for a person from their brief (`applyAs` with the run's id) is recorded as
 *     Tracy setup, under that run, with the person as its actor; the same call without a run is not;
 *   - a write made with a seat key is recorded as the key's (`api`), whatever session header a chat sends;
 *   - a revert names the change it takes back, so its own Site changes row can say which.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/site-write-origin.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'
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
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}
const SITE = 'lantern.localhost'
const KEY_ID = 'abcdefghijklmnop'
const WRITE = {
  siteKey: SITE,
  action: 'content.update',
  params: { kind: 'post', id: 7, fields: { post_title: 'x' }, apply_id: 'a-1' }
}

async function setup(pool) {
  const config = readConfig(env)
  const fetchImpl = async () =>
    new Response(JSON.stringify({ ok: true, kind: 'post', id: 7 }), { status: 200 })
  const app = /** @type {any} */ (
    buildApp({ config, pool, mail: { send: async () => {} }, host: { hostCall, hostJob }, fetchImpl })
  )
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'lantern', 'local'])
  const { rows } = await pool.query(`insert into account (email) values ('owner@x.y') returning id`)
  const account = rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
    [SITE, account.id]
  )
  await writeComponent(
    pool,
    SITE,
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const keyPrincipal = {
    kind: 'key',
    email: 'owner@x.y',
    account,
    grant: { role: 'owner' },
    key: { keyId: KEY_ID, email: 'owner@x.y', siteKey: SITE, scopes: ['content'] }
  }
  const cookie = `tracy_sess=${await mintSession('owner@x.y', config.sessionSecret)}`
  /** An Apply over HTTP as a chat makes it, with whatever session header the chat sends. */
  const overHttp = (session, body) =>
    app.fetch(
      new Request(`http://tracy.test/api/sites/${SITE}/apply`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', 'x-tracy-session': session },
        body: JSON.stringify(body)
      })
    )
  return { app, keyPrincipal, overHttp }
}

const writes = async (pool) =>
  (
    await pool.query(
      'select actor, action, session_id, origin, origin_ref, target from site_write where site_key = $1 order by id',
      [SITE]
    )
  ).rows

test(
  'sweep 4: a write made for a person from their brief is recorded as Tracy setup, under its run',
  opts,
  async () => {
    const { pool } = db
    const { app } = await setup(pool)
    const answer = await app.applyAs('owner@x.y', WRITE, { setupRun: 'run-9' })
    assert.notEqual(answer.ok, false, JSON.stringify(answer))
    await app.applyAs('owner@x.y', { ...WRITE, params: { ...WRITE.params, apply_id: 'a-2' } })
    const [setupWrite, plain] = await writes(pool)
    assert.deepEqual(
      { actor: setupWrite.actor, origin: setupWrite.origin, ref: setupWrite.origin_ref },
      { actor: 'owner@x.y', origin: 'setup', ref: 'run-9' }
    )
    assert.deepEqual(
      { origin: plain.origin, ref: plain.origin_ref },
      { origin: null, ref: null },
      'no run, no claim'
    )
  }
)

test(
  'sweep 2: a seat key’s write is recorded as the key’s; a chat header shaped like a key’s is not',
  opts,
  async () => {
    const { pool } = db
    const { app, keyPrincipal, overHttp } = await setup(pool)
    const answered = await app.applyDoor({ ...WRITE, principal: keyPrincipal, headers: {} })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
    // The key holds the site's write lease for its quiet window; free it so the chat may write.
    await pool.query('delete from site_write_lease where site_key = $1', [SITE])
    const res = await overHttp(`key:${'b'.repeat(16)}`, {
      action: WRITE.action,
      params: { ...WRITE.params, apply_id: 'a-3' }
    })
    assert.equal(res.status, 200, await res.text())
    const [byKey, byChat] = await writes(pool)
    assert.deepEqual(
      { session: byKey.session_id, origin: byKey.origin, ref: byKey.origin_ref },
      { session: `key:${KEY_ID}`, origin: 'api', ref: KEY_ID }
    )
    assert.equal(byChat.session_id, `key:${'b'.repeat(16)}`)
    assert.equal(byChat.origin, null, 'a header is never provenance')
  }
)

test('sweep 2: a revert names the change it takes back', opts, async () => {
  const { pool } = db
  const { app, keyPrincipal } = await setup(pool)
  const answered = await app.applyDoor({
    siteKey: SITE,
    action: 'apply.revert',
    params: { apply_id: 'api-abc-1' },
    principal: keyPrincipal,
    headers: {}
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  const [revert] = await writes(pool)
  assert.equal(revert.action, 'apply.revert')
  assert.deepEqual(revert.target, { reverts: 'api-abc-1' })
  assert.equal(revert.origin, 'api')
})
