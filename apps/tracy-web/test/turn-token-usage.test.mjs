import assert from 'node:assert/strict'
import { test } from 'node:test'
import { momentUsage } from '../src/sites/token-usage.js'
import { closeTurn, openTurn } from '../src/sites/turns.js'
import { freshPool } from './_db.mjs'
const usage = {
  version: 1,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 30,
  cacheWriteTokens: 20,
  totalTokens: 65,
  measured: 1,
  missing: 0,
  lastSeq: 10
}
test('moment usage is optional, bounded and validated without trusting extra fields', () => {
  assert.equal(momentUsage({}, 's:1'), null)
  assert.deepEqual(momentUsage({ usage: { ...usage, secret: 'drop' } }, 's:1'), usage)
  for (const bad of [
    [],
    {},
    { ...usage, version: 2 },
    { ...usage, outputTokens: -1 },
    { ...usage, totalTokens: Infinity },
    { ...usage, measured: 0 },
    { ...usage, lastSeq: 0 }
  ])
    assert.equal(momentUsage({ usage: bad }, 's:1'), false)
  assert.equal(momentUsage({ usage }, undefined), false)
})
test('token snapshots replace idempotently by source event sequence, even across delivery reordering and missing usage', {
  skip: !process.env.TEST_DATABASE_URL
}, async (t) => {
  const { pool, close } = await freshPool()
  t.after(close)
  await pool.query(
    "insert into site (site_key,label,host) values ('s.test','s','local'),('other.test','other','local')"
  )
  await openTurn(pool, { turnId: 's:1', siteKey: 's.test', actor: 'a@b.test', title: 'hi', source: 'panel' })
  const save = (over) => closeTurn(pool, { turnId: 's:1', siteKey: 's.test', sha: null, files: 0, ...over })
  await save({ usage })
  await save({ usage })
  const newer = { ...usage, totalTokens: 100, lastSeq: 20 }
  await save({ usage: newer })
  await save({ usage, filedAt: new Date(Date.now() + 10000) })
  await save({})
  await save({ siteKey: 'other.test', usage: { ...newer, totalTokens: 999, lastSeq: 30 } })
  assert.deepEqual(
    (await pool.query("select token_usage from site_turn where turn_id='s:1'")).rows[0].token_usage,
    newer
  )
})
