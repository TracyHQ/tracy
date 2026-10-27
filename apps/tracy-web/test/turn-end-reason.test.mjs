// How a chat turn ended, kept with the turn (ADR 0025 § Failed turns, 04/10/2026): the host's
// site-tabs plugin sends the `turn/end` reason kind on `POST /moment` (`endReason`), the door checks it
// (`momentEndReason`) and `closeTurn` keeps it in `site_turn.end_reason` (migration 054). A close that
// sends none keeps the one recorded.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { momentEndReason } from '../src/sites/route.js'
import { closeTurn, FAILED_END_REASONS, openTurn } from '../src/sites/turns.js'
import { freshPool } from './_db.mjs'

const skip = !process.env.TEST_DATABASE_URL

test('ADR 0025: a turn cut by the token cap still counts as sent', () => {
  assert.ok(!FAILED_END_REASONS.includes('max-tokens'))
  assert.ok(!FAILED_END_REASONS.includes('completed'))
})

describe('momentEndReason: what /moment accepts', () => {
  test('none sent → null; a kind dsh writes → kept', () => {
    assert.equal(momentEndReason({}, 's:1'), null)
    assert.equal(momentEndReason({ endReason: null }, 's:1'), null)
    for (const kind of ['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted'])
      assert.equal(momentEndReason({ endReason: kind }, 's:1'), kind)
  })
  test('refused: an unknown kind, not a string, or one with no turn', () => {
    assert.equal(momentEndReason({ endReason: 'exploded' }, 's:1'), false)
    assert.equal(momentEndReason({ endReason: { kind: 'error' } }, 's:1'), false)
    assert.equal(momentEndReason({ endReason: 'error' }, undefined), false)
  })
})

describe('closeTurn keeps how the turn ended', { skip }, () => {
  test('stored on the close; a later close that sends none keeps it', async (t) => {
    const { pool, close } = await freshPool()
    t.after(close)
    await pool.query(`insert into site (site_key, label, host) values ('s.localhost', 's', 'local')`)
    await openTurn(pool, {
      turnId: 'sess:1',
      siteKey: 's.localhost',
      actor: 'a@b.c',
      title: 'hi',
      source: 'comment'
    })
    await closeTurn(pool, {
      turnId: 'sess:1',
      siteKey: 's.localhost',
      sha: null,
      files: 0,
      endReason: 'error'
    })
    await closeTurn(pool, { turnId: 'sess:1', siteKey: 's.localhost', sha: null, files: 0 })
    const { rows } = await pool.query(`select state, end_reason from site_turn where turn_id = 'sess:1'`)
    assert.deepEqual(rows[0], { state: 'closed', end_reason: 'error' })
  })
})
