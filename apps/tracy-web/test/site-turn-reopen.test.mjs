// A chat turn its host closed at turn-stopping that a steered step runs on (a check's notice, dsh's todo reminder)
// is open again (`openTurn`), and a whole-site build's turn is stale only past two hours (`markStale`), not thirty
// minutes: either one refused every later write of a build AGENT_DEMO_TURN_NOT_BOUND (local stand 24/10/2026).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { closeTurn, markStale, openTurn } from '../src/sites/turns.js'
import { freshPool } from './_db.mjs'

const skip = !process.env.TEST_DATABASE_URL
const turn = (turnId, extra = {}) => ({
  turnId,
  siteKey: 's.localhost',
  actor: 'a@b.c',
  title: 'Build the whole site',
  source: 'panel',
  ...extra
})
const stateOf = async (pool, turnId) =>
  (await pool.query('select state from site_turn where turn_id = $1', [turnId])).rows[0]?.state

describe('a closed turn steered on, and a build turn’s stale bound', { skip }, () => {
  test('a steer opens a closed turn again; a retried open without a steer does not', async (t) => {
    const { pool, close } = await freshPool()
    t.after(close)
    await pool.query(`insert into site (site_key, label, host) values ('s.localhost', 's', 'local')`)
    await openTurn(pool, turn('wo-demo-a:1'))
    await closeTurn(pool, { turnId: 'wo-demo-a:1', siteKey: 's.localhost', sha: null, files: 0 })
    await openTurn(pool, turn('wo-demo-a:1'))
    assert.equal(await stateOf(pool, 'wo-demo-a:1'), 'closed')
    await openTurn(pool, turn('wo-demo-a:1', { steered: true }))
    assert.equal(await stateOf(pool, 'wo-demo-a:1'), 'open')
  })

  test('an open build turn is stale past two hours, any other past thirty minutes', async (t) => {
    const { pool, close } = await freshPool()
    t.after(close)
    await pool.query(`insert into site (site_key, label, host) values ('s.localhost', 's', 'local')`)
    for (const id of ['wo-demo-b:1', 'chat-c:1', 'wo-demo-d:1']) await openTurn(pool, turn(id))
    const ago = (min) => new Date(Date.now() - min * 60_000)
    await pool.query('update site_turn set opened_at = $2 where turn_id = $1', ['wo-demo-b:1', ago(45)])
    await pool.query('update site_turn set opened_at = $2 where turn_id = $1', ['chat-c:1', ago(45)])
    await pool.query('update site_turn set opened_at = $2 where turn_id = $1', ['wo-demo-d:1', ago(130)])
    assert.equal(await markStale(pool, 's.localhost'), 2)
    assert.equal(await stateOf(pool, 'wo-demo-b:1'), 'open')
    assert.equal(await stateOf(pool, 'chat-c:1'), 'stale')
    assert.equal(await stateOf(pool, 'wo-demo-d:1'), 'stale')
  })
})
