import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { usageCandidates, backfillUsage } from '../scripts/backfill-turn-token-usage.mjs'
import { freshPool } from './_db.mjs'

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-token-backfill-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (dir, extra = 0) => {
    const target = path.join(root, dir)
    mkdirSync(target, { recursive: true })
    const rows = [
      { type: 'session', version: 4, id: 's', cwd: '/site/demo' },
      {
        seq: 1,
        type: 'assistant/message',
        data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 5 + extra, cacheReadTokens: 20 } }
      },
      { seq: 2, type: 'turn/end', data: { turn: 1 } }
    ]
    writeFileSync(path.join(target, 'session.v4.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n')
    writeFileSync(path.join(target, 'session.v3.jsonl'), 'old generation must be ignored')
  }
  write('active/session-s')
  return { root, write }
}
test('backfill selects newest generation, accepts identical archives and refuses conflicting copies', (t) => {
  const { root, write } = fixture(t)
  write('archive/session-s')
  assert.equal(usageCandidates([root]).candidates.get('s:1').usage.totalTokens, 35)
  write('archive/conflict', 1)
  const got = usageCandidates([root])
  assert.equal(got.candidates.get('s:1'), false)
  assert.equal(got.report.ambiguous, 1)
})
test('backfill dry-run writes nothing; apply matches exact site and is idempotent without overwriting live snapshots', {
  skip: !process.env.TEST_DATABASE_URL
}, async (t) => {
  const { root } = fixture(t)
  const { pool, close } = await freshPool()
  t.after(close)
  await pool.query(
    "insert into site (site_key,label,host) values ('demo.test','demo','local'),('other.test','other','local')"
  )
  await pool.query(
    `insert into site_turn (turn_id,site_key,session_id,turn,actor,title,source) values ('s:1','demo.test','s',1,'a@b.test','hi','panel')`
  )
  const peek = async () =>
    (await pool.query("select token_usage from site_turn where turn_id='s:1'")).rows[0].token_usage
  assert.equal((await backfillUsage(pool, [root], ['demo.test'])).wouldWrite, 1)
  assert.equal(await peek(), null)
  assert.equal((await backfillUsage(pool, [root], ['other.test'], true)).written, 0)
  assert.equal((await backfillUsage(pool, [root], ['demo.test'], true)).written, 1)
  assert.equal((await peek()).totalTokens, 35)
  assert.equal((await backfillUsage(pool, [root], ['demo.test'], true)).written, 0)
  await assert.rejects(backfillUsage(pool, [root], [], true), /explicit/)
})
