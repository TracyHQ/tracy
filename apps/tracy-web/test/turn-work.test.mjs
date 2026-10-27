// What a chat turn took and whether its change was seen (plan tasks/todo-do-dung-that.md U1–U2, migration 114):
// the host's site-tabs plugin sends `work` on `POST /moment` (`momentWork` checks it, `closeTurn` keeps it
// by the newest close, like the answer), and site-tools sends the visual check's verdict (`checkTurn`).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { momentWork, WORK_COUNT_MAX } from '../src/sites/route.js'
import { checkTurn, closeTurn, openTurn, VISUAL_NOTE, VISUAL_VERDICTS } from '../src/sites/turns.js'
import { freshPool } from './_db.mjs'

const skip = !process.env.TEST_DATABASE_URL

describe('momentWork: what /moment accepts', () => {
  test('none sent → null; whole counts → kept', () => {
    assert.equal(momentWork({}, 's:1'), null)
    assert.equal(momentWork({ work: null }, 's:1'), null)
    assert.deepEqual(momentWork({ work: { steps: 3, calls: 5, failedCalls: 1 } }, 's:1'), {
      steps: 3,
      calls: 5,
      failedCalls: 1
    })
    assert.deepEqual(momentWork({ work: { steps: 1, calls: 0, failedCalls: 0, extra: 'x' } }, 's:1'), {
      steps: 1,
      calls: 0,
      failedCalls: 0
    })
  })
  test('refused: no turn, not an object, a count missing, negative, fractional, too big, more failed than calls', () => {
    assert.equal(momentWork({ work: { steps: 1, calls: 1, failedCalls: 0 } }, undefined), false)
    assert.equal(momentWork({ work: [1, 1, 0] }, 's:1'), false)
    assert.equal(momentWork({ work: 'many' }, 's:1'), false)
    assert.equal(momentWork({ work: { steps: 1, calls: 1 } }, 's:1'), false)
    assert.equal(momentWork({ work: { steps: -1, calls: 1, failedCalls: 0 } }, 's:1'), false)
    assert.equal(momentWork({ work: { steps: 1.5, calls: 1, failedCalls: 0 } }, 's:1'), false)
    assert.equal(momentWork({ work: { steps: WORK_COUNT_MAX + 1, calls: 1, failedCalls: 0 } }, 's:1'), false)
    assert.equal(momentWork({ work: { steps: 1, calls: 1, failedCalls: 2 } }, 's:1'), false)
  })
})

test('the verdicts and notes the check door takes', () => {
  assert.deepEqual([...VISUAL_VERDICTS], ['shown', 'not_shown', 'broken', 'cannot_tell', 'skipped'])
  for (const note of ['no-write', 'capture-TIMEOUT', 'judge-failed', 'off'])
    assert.ok(VISUAL_NOTE.test(note), note)
  for (const note of ['', 'judge-failed: model x', '-x', 'a'.repeat(49), 'Upper'])
    assert.ok(!VISUAL_NOTE.test(note), note)
})

describe('closeTurn and checkTurn keep what a turn took', { skip }, () => {
  test('work is written by the newest close and kept by one that sends none; an older close writes nothing over it', async (t) => {
    const { pool, close } = await freshPool()
    t.after(close)
    await pool.query(`insert into site (site_key, label, host) values ('s.localhost', 's', 'local')`)
    await openTurn(pool, {
      turnId: 'sess:1',
      siteKey: 's.localhost',
      actor: 'a@b.c',
      title: 'hi',
      source: 'panel'
    })
    const at = (s) => new Date(`2026-10-17T10:00:${s}Z`)
    await closeTurn(pool, {
      turnId: 'sess:1',
      siteKey: 's.localhost',
      sha: null,
      files: 0,
      work: { steps: 2, calls: 3, failedCalls: 1 },
      filedAt: at('10')
    })
    // A steer ran one more step: the turn stopped again, its work counted over the whole turn.
    await closeTurn(pool, {
      turnId: 'sess:1',
      siteKey: 's.localhost',
      sha: null,
      files: 0,
      work: { steps: 3, calls: 4, failedCalls: 1 },
      filedAt: at('20')
    })
    // The first close's job heard late by the sweep: older, so it writes nothing over the newer work.
    await closeTurn(pool, {
      turnId: 'sess:1',
      siteKey: 's.localhost',
      sha: null,
      files: 0,
      work: { steps: 2, calls: 3, failedCalls: 1 },
      filedAt: at('10')
    })
    // A retry with no work keeps it.
    await closeTurn(pool, { turnId: 'sess:1', siteKey: 's.localhost', sha: null, files: 0 })
    const { rows } = await pool.query(
      `select steps, calls, failed_calls from site_turn where turn_id = 'sess:1'`
    )
    assert.deepEqual(rows[0], { steps: 3, calls: 4, failed_calls: 1 })
  })

  test('a turn closed by an older dsh reads null work — unknown, not zero', async (t) => {
    const { pool, close } = await freshPool()
    t.after(close)
    await pool.query(`insert into site (site_key, label, host) values ('s.localhost', 's', 'local')`)
    await openTurn(pool, {
      turnId: 'sess:2',
      siteKey: 's.localhost',
      actor: 'a@b.c',
      title: 'hi',
      source: 'panel'
    })
    await closeTurn(pool, { turnId: 'sess:2', siteKey: 's.localhost', sha: null, files: 0 })
    const { rows } = await pool.query(
      `select steps, calls, failed_calls, visual, visual_note from site_turn where turn_id = 'sess:2'`
    )
    assert.deepEqual(rows[0], {
      steps: null,
      calls: null,
      failed_calls: null,
      visual: null,
      visual_note: null
    })
  })

  test('checkTurn keeps the latest verdict on this site’s turn; another site’s turn is not touched', async (t) => {
    const { pool, close } = await freshPool()
    t.after(close)
    await pool.query(
      `insert into site (site_key, label, host) values ('s.localhost', 's', 'local'), ('o.localhost', 'o', 'local')`
    )
    await openTurn(pool, {
      turnId: 'sess:3',
      siteKey: 's.localhost',
      actor: 'a@b.c',
      title: 'hi',
      source: 'panel'
    })
    assert.equal(
      await checkTurn(pool, 's.localhost', 'sess:3', { visual: 'skipped', note: 'no-image-model' }),
      true
    )
    assert.equal(await checkTurn(pool, 's.localhost', 'sess:3', { visual: 'shown', note: null }), true)
    assert.equal(await checkTurn(pool, 'o.localhost', 'sess:3', { visual: 'broken', note: null }), false)
    assert.equal(await checkTurn(pool, 's.localhost', 'sess:9', { visual: 'shown', note: null }), false)
    const { rows } = await pool.query(`select visual, visual_note from site_turn where turn_id = 'sess:3'`)
    assert.deepEqual(rows[0], { visual: 'shown', visual_note: null })
    await assert.rejects(
      pool.query(`update site_turn set visual = 'maybe' where turn_id = 'sess:3'`),
      /check constraint/,
      'the column takes only the five verdicts'
    )
  })
})
