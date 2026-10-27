// Tracy's answer kept with a turn (plan `tasks/todo-open-conversation.md` §C): the door's own cut
// (`replyWithin`), its check of a `/moment` body (`momentReply`), migration 050 over a database
// that already holds turns, and `closeTurn` keeping an answer across a close that sends none.
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrate } from '../src/db/index.js'
import { momentReply } from '../src/sites/route.js'
import { closeTurn, REPLY_MAX, REPLY_MAX_BYTES, replyWithin } from '../src/sites/turns.js'
import { scratchPool } from './_db.mjs'

const skip = !process.env.TEST_DATABASE_URL

describe('replyWithin: the door cuts again, whatever the host did', () => {
  test('keeps paragraphs, folds blank runs and spaces, drops control characters', () => {
    assert.deepEqual(replyWithin('Done.  It\tworks.\r\n\n\n\nNext:\u0000 menu'), {
      text: 'Done. It works.\n\nNext: menu',
      cut: false
    })
    assert.equal(replyWithin('   \n '), null)
    assert.equal(replyWithin(42), null)
  })

  test('past 2000 characters: cut between words with …; past 4000 bytes: cut further', () => {
    const long = replyWithin('word '.repeat(600))
    assert.equal(long.cut, true)
    assert.ok([...long.text].length <= REPLY_MAX)
    assert.match(long.text, /word…$/)
    const wide = replyWithin('ể'.repeat(1990))
    assert.equal(wide.cut, true)
    assert.ok(Buffer.byteLength(wide.text, 'utf8') <= REPLY_MAX_BYTES)
  })
})

describe('momentReply: what /moment accepts', () => {
  const turnId = 's1:1'
  test('none sent → null; a valid one → kept with the host’s state unless the door cut it', () => {
    assert.equal(momentReply({}, turnId), null)
    assert.equal(momentReply({ reply: null }, turnId), null)
    assert.deepEqual(momentReply({ reply: 'Done.', replyState: 'interrupted' }, turnId), {
      text: 'Done.',
      state: 'interrupted'
    })
    assert.equal(momentReply({ reply: 'word '.repeat(600), replyState: 'full' }, turnId).state, 'truncated')
    assert.equal(momentReply({ reply: '  ', replyState: 'full' }, turnId), null, 'nothing readable')
  })

  test('refused: no turn, not a string, over 64 KiB, a state missing or unknown, a state alone', () => {
    for (const [body, id] of [
      [{ reply: 'x', replyState: 'full' }, undefined],
      [{ reply: ['x'], replyState: 'full' }, turnId],
      [{ reply: 'x'.repeat(64 * 1024 + 1), replyState: 'full' }, turnId],
      [{ reply: 'x' }, turnId],
      [{ reply: 'x', replyState: 'FULL' }, turnId],
      [{ replyState: 'full' }, turnId]
    ])
      assert.equal(momentReply(body, id), false, JSON.stringify(body).slice(0, 60))
  })
})

describe('migration 050 and closeTurn', { skip }, () => {
  test('applies over turns that exist; old rows read null; a close without a reply keeps one', async () => {
    const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
    const dir = mkdtempSync(path.join(tmpdir(), 'scv2-050-'))
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
    for (const f of all) if (f < '050') copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
    const scratch = await scratchPool()
    const { pool } = scratch
    try {
      await migrate(pool, dir, { lockId: 50_050 })
      await pool.query(
        `insert into site (site_key, label, host, platform) values ('s.tracy.test', 's', 'local', 'wordpress')`
      )
      const turn = (id) =>
        pool.query(
          `insert into site_turn (turn_id, site_key, session_id, turn, actor, title) values ($1, 's.tracy.test', $2, 1, 'a@b.c', 'hi')`,
          [id, id.split(':')[0]]
        )
      await turn('old:1')
      // Only the migration under test: a later one (051 and on) is not what this asserts.
      for (const f of all) if (f.startsWith('050-')) copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
      const { applied } = await migrate(pool, dir, { lockId: 50_050 })
      assert.deepEqual(applied, ['050-site-turn-reply.sql'])
      const { rows } = await pool.query(`select reply, reply_state from site_turn where turn_id = 'old:1'`)
      assert.deepEqual(rows[0], { reply: null, reply_state: null }, 'no backfill')

      // `closeTurn` is today's: it also writes columns later migrations add (054 `end_reason`).
      for (const f of all) if (f > '051') copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
      await migrate(pool, dir, { lockId: 50_050 })
      await turn('new:1')
      await closeTurn(pool, {
        turnId: 'new:1',
        siteKey: 's.tracy.test',
        sha: null,
        files: 0,
        reply: { text: 'Done.', state: 'full' }
      })
      await closeTurn(pool, { turnId: 'new:1', siteKey: 's.tracy.test', sha: null, files: 0 })
      const kept = await pool.query(`select reply, reply_state from site_turn where turn_id = 'new:1'`)
      assert.deepEqual(kept.rows[0], { reply: 'Done.', reply_state: 'full' })
    } finally {
      await scratch.close()
    }
  })
})
