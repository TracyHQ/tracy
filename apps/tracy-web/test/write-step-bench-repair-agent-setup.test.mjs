/**
 * The 9b repair agent of a step chain build (#477, spec #472): each session it opens is written down as the build's before
 * any prompt reaches it, and is archived once the pass is over so the customer's chat list never shows it. Real Postgres
 * for the pair; the dsh behind the seat is a fake at the network edge. Without `setupRun` (the bench) nothing is written
 * down and the agent cannot retire a session.
 *
 *   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/write-step-bench-repair-agent-setup.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readConfig } from '../src/config.js'
import { setupRunOfSession } from '../src/sites/setup-session.js'
import { benchRepairAgent } from '../src/write-step-bench-repair-agent.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SITE = 'harbourpadel.localhost'
const EMAIL = 'owner@example.test'
const RUN = '3b9c1d5e-7a2f-4c8d-9e0a-1b2c3d4e5f60'

const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})

/** A dsh that makes sessions `repair-1`, `repair-2`… and archives what it is asked to; every call is kept. */
function fakeDsh() {
  const calls = []
  let n = 0
  const fetchImpl = async (url, init) => {
    const endpoint = String(url).split('/api/')[1]
    const request = JSON.parse(String(init.body)).payload.args.request
    calls.push({ endpoint, request })
    const value =
      endpoint === 'workspace/create'
        ? { workspace: { workspaceId: 'w-1' } }
        : endpoint === 'session/create'
          ? { sessionId: `repair-${++n}` }
          : endpoint === 'workspace/archiveSession'
            ? { archivedSessionIds: [request.sessionId] }
            : null
    return Response.json({
      type: 'server-response',
      rpcId: JSON.parse(String(init.body)).rpcId,
      result: { ok: true, value }
    })
  }
  return { calls, fetchImpl }
}

async function agentFor(pool, over = {}) {
  await pool.query(
    `insert into site (site_key, label, host, platform) values ($1, 'harbourpadel', 'local', 'joomla')`,
    [SITE]
  )
  const { rows } = await pool.query(`insert into account (email) values ($1) returning id`, [EMAIL])
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
    [SITE, rows[0].id]
  )
  const dsh = fakeDsh()
  const agent = benchRepairAgent({
    pool,
    config,
    seatDoor: { mintSeatSession: async () => 'tok' },
    door: {},
    siteKey: SITE,
    email: EMAIL,
    fetchImpl: dsh.fetchImpl,
    ...over
  })
  return { agent, dsh }
}

test(
  'a build’s agent writes each session down as the build’s on open, and archives it on retire',
  opts,
  async () => {
    const { pool } = db
    const { agent, dsh } = await agentFor(pool, { setupRun: RUN })
    const first = await agent.open()
    const second = await agent.open()
    assert.deepEqual([first.sessionId, second.sessionId], ['repair-1', 'repair-2'])
    assert.equal(await setupRunOfSession(pool, SITE, 'repair-1'), RUN)
    assert.equal(await setupRunOfSession(pool, SITE, 'repair-2'), RUN)
    assert.equal(await setupRunOfSession(pool, SITE, 'someone-elses-chat'), null)
    assert.deepEqual(await agent.retire({ sessionId: 'repair-1' }), { ok: true })
    assert.deepEqual(dsh.calls.at(-1), {
      endpoint: 'workspace/archiveSession',
      request: { sessionId: 'repair-1', stopActivity: true }
    })
  }
)

test('the bench’s agent writes nothing down and cannot retire a session', opts, async () => {
  const { pool } = db
  const { agent } = await agentFor(pool)
  const opened = await agent.open()
  assert.equal(opened.sessionId, 'repair-1')
  assert.equal(await setupRunOfSession(pool, SITE, 'repair-1'), null)
  assert.equal(agent.retire, undefined)
})
