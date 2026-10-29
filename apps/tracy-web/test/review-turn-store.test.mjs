// REVIEW (09/10/2026) — the chat-turn record and the undo stamp, at the store level.
//
//   TEST_DATABASE_URL=postgres://… node --test apps/tracy-web/test/review-turn-store.test.mjs
//
// Coverage for behaviours of `turns.js` / `turn-undo-store.js` that no other test holds (openTurn's
// merge, a turn id on another site, closeTurn's late-close ordering of ledger L31, flagConcurrent
// within one conversation, undoneSince), plus the review's ONE finding, since fixed (migration 182):
//
//   An undo press whose only outcome was `unsure` (nothing verifiably undone: the host answered 202,
//   a 502, an operation left `pending`) is stamped `undone_at` (`undoneMarks` counts "may have gone",
//   so the agent's notice fires), and activity-v2 used to read that same stamp as proof: "Partly
//   undone" and no Undo on the row. activity-v2's rule is "UNDONE ONLY BY PROOF" (activity-v2.js,
//   SYSTEM.md §5). The stamp is now split: `undone_at` (pressed) for the agent notice and ops usage,
//   `undo_proven_at` (proven) for Site changes; an unproven press never clears an earlier proof.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { turnUndoneOf } from '../src/sites/activity-v2.js'
import { fileOutcome, runUndo, undoneMarks } from '../src/sites/turn-undo.js'
import { markTurnsUndone, undoneSince } from '../src/sites/turn-undo-store.js'
import { closeTurn, flagConcurrent, markStale, openTurn, STALE_AFTER_MS, turnOf } from '../src/sites/turns.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const SITE = 'lantern.localhost'
const OTHER = 'harbor.localhost'
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

async function sites() {
  await db.pool.query(
    `insert into site (site_key, label, host) values ($1, 'lantern', 'local'), ($2, 'harbor', 'local')`,
    [SITE, OTHER]
  )
}

const open = (turnId, extra = {}) =>
  openTurn(db.pool, {
    turnId,
    siteKey: SITE,
    actor: 'ada@x.y',
    title: `Request ${turnId}`,
    source: 'panel',
    ...extra
  })

test(
  'openTurn: a retry or a steer merges into the first row — actor, title and request state stay the first call’s',
  opts,
  async () => {
    await sites()
    const first = await open('sess-a:1', { requestState: 'truncated' })
    assert.equal(first.created, true)
    const steer = await open('sess-a:1', { actor: 'bob@x.y', title: 'Something else', steered: true })
    assert.equal(steer.created, false)
    const row = await turnOf(db.pool, 'sess-a:1')
    assert.equal(row.actor, 'ada@x.y')
    assert.equal(row.title, 'Request sess-a:1')
    assert.equal(row.steered, true)
    assert.equal(row.request_state, 'truncated')
    // A later retry that says steered:false never un-steers it.
    await open('sess-a:1', { steered: false })
    assert.equal((await turnOf(db.pool, 'sess-a:1')).steered, true)
  }
)

test(
  'openTurn: a turn id already recorded on another site is refused, and the first row is untouched',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    await assert.rejects(
      openTurn(db.pool, {
        turnId: 'sess-a:1',
        siteKey: OTHER,
        actor: 'eve@x.y',
        title: 'x',
        source: 'panel'
      }),
      /belongs to another site/
    )
    const row = await turnOf(db.pool, 'sess-a:1')
    assert.equal(row.site_key, SITE)
    assert.equal(row.actor, 'ada@x.y')
  }
)

test(
  'closeTurn: closing on another site changes nothing; a retried close keeps the moment and the answer',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    assert.equal(await closeTurn(db.pool, { turnId: 'sess-a:1', siteKey: OTHER, sha: SHA_A, files: 3 }), null)
    assert.equal((await turnOf(db.pool, 'sess-a:1')).state, 'open')
    await closeTurn(db.pool, {
      turnId: 'sess-a:1',
      siteKey: SITE,
      sha: SHA_A,
      files: 3,
      reply: { text: 'Done.', state: 'full' },
      endReason: 'completed'
    })
    // The retry whose first answer was lost: nothing dirty any more, no answer, no reason.
    await closeTurn(db.pool, { turnId: 'sess-a:1', siteKey: SITE, sha: null, files: 0 })
    const row = await turnOf(db.pool, 'sess-a:1')
    assert.equal(row.state, 'closed')
    assert.equal(row.head_sha, SHA_A)
    assert.equal(row.files, 3)
    assert.equal(row.reply, 'Done.')
    assert.equal(row.end_reason, 'completed')
  }
)

test(
  'closeTurn (L31): a close whose job was filed EARLIER but heard LATER adds its files and moves nothing else',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    const t0 = new Date('2026-10-09T10:00:00Z')
    const t1 = new Date('2026-10-09T10:00:05Z')
    // The newer close lands first …
    await closeTurn(db.pool, {
      turnId: 'sess-a:1',
      siteKey: SITE,
      sha: SHA_B,
      files: 1,
      reply: { text: 'Second answer', state: 'full' },
      endReason: 'completed',
      filedAt: t1,
      closedAt: new Date('2026-10-09T10:00:06Z')
    })
    // … then the sweep hears of the older one.
    await closeTurn(db.pool, {
      turnId: 'sess-a:1',
      siteKey: SITE,
      sha: SHA_A,
      files: 2,
      reply: { text: 'First answer', state: 'interrupted' },
      endReason: 'aborted',
      filedAt: t0,
      closedAt: new Date('2026-10-09T10:00:30Z')
    })
    const row = await turnOf(db.pool, 'sess-a:1')
    assert.equal(row.head_sha, SHA_B, 'the head stays the newer commit')
    assert.equal(row.files, 3, 'both closes’ files are counted')
    assert.equal(row.reply, 'Second answer')
    assert.equal(row.reply_state, 'full')
    assert.equal(row.end_reason, 'completed')
    assert.equal(new Date(row.close_filed_at).toISOString(), t1.toISOString())
    assert.equal(
      new Date(row.closed_at).toISOString(),
      '2026-10-09T10:00:30.000Z',
      'closed_at keeps the later one'
    )
  }
)

test(
  'flagConcurrent: the same conversation’s other open turn is not "another conversation"; another session is, both ways',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    await open('sess-a:2')
    assert.equal(await flagConcurrent(db.pool, 'sess-a:2'), false)
    assert.equal((await turnOf(db.pool, 'sess-a:1')).concurrent, false)
    await open('sess-b:1')
    assert.equal(await flagConcurrent(db.pool, 'sess-b:1'), true)
    for (const id of ['sess-a:1', 'sess-a:2', 'sess-b:1'])
      assert.equal((await turnOf(db.pool, id)).concurrent, true, id)
    // A turn of the same conversation on ANOTHER site is not on this tree.
    await openTurn(db.pool, {
      turnId: 'sess-c:1',
      siteKey: OTHER,
      actor: 'x@y.z',
      title: 't',
      source: 'panel'
    })
    assert.equal(await flagConcurrent(db.pool, 'sess-c:1'), false)
  }
)

test('markStale: only `open` turns of this site past the cut go stale', opts, async () => {
  await sites()
  await open('sess-a:1')
  await open('sess-a:2')
  await openTurn(db.pool, { turnId: 'sess-c:1', siteKey: OTHER, actor: 'x@y.z', title: 't', source: 'panel' })
  await closeTurn(db.pool, { turnId: 'sess-a:2', siteKey: SITE, sha: null, files: 0 })
  await db.pool.query(`update site_turn set opened_at = now() - interval '2 hours'`)
  assert.equal(await markStale(db.pool, SITE, new Date(Date.now())), 1)
  assert.equal((await turnOf(db.pool, 'sess-a:1')).state, 'stale')
  assert.equal((await turnOf(db.pool, 'sess-a:2')).state, 'closed')
  assert.equal((await turnOf(db.pool, 'sess-c:1')).state, 'open')
  // Just inside the cut: still open.
  await open('sess-d:1')
  await db.pool.query(`update site_turn set opened_at = $1 where turn_id = 'sess-d:1'`, [
    new Date(Date.now() - STALE_AFTER_MS + 60_000)
  ])
  assert.equal(await markStale(db.pool, SITE, new Date(Date.now())), 0)
})

test(
  'undoneSince: turns undone since the previous turn opened, newest first, once; never on a first turn',
  opts,
  async () => {
    await sites()
    const minutes = (n) => new Date(Date.parse('2026-10-09T10:00:00Z') + n * 60_000)
    for (const n of [1, 2, 3]) await open(`sess-a:${n}`)
    for (const n of [1, 2, 3])
      await db.pool.query(`update site_turn set opened_at = $2, state = 'closed' where turn_id = $1`, [
        `sess-a:${n}`,
        minutes(n * 10)
      ])
    // "Go back to here" from turn 2: turns 3 and 2 went back after turn 3 opened.
    await markTurnsUndone(db.pool, SITE, [
      { turnId: 'sess-a:3', complete: true, proven: true },
      { turnId: 'sess-a:2', complete: false, proven: true }
    ])
    // The press happened at 35 minutes: it proved what it undid, so both its stamps move.
    await db.pool.query(
      `update site_turn set undone_at = $1, undo_proven_at = $1 where undone_at is not null`,
      [minutes(35)]
    )
    assert.deepEqual(await undoneSince(db.pool, SITE, 'sess-a', 4), [
      { turn: 3, title: 'Request sess-a:3', undo_complete: true },
      { turn: 2, title: 'Request sess-a:2', undo_complete: false }
    ])
    // Turn 4 opened after the stamp: turn 5 names nothing again.
    await open('sess-a:4')
    await db.pool.query(`update site_turn set opened_at = $1 where turn_id = 'sess-a:4'`, [minutes(40)])
    assert.deepEqual(await undoneSince(db.pool, SITE, 'sess-a', 5), [])
    // A conversation's first turn has no previous one; another site's rows never leak in.
    assert.deepEqual(await undoneSince(db.pool, SITE, 'sess-z', 1), [])
    assert.deepEqual(await undoneSince(db.pool, OTHER, 'sess-a', 4), [])
  }
)

test('undoneSince names at most five turns', opts, async () => {
  await sites()
  for (let n = 1; n <= 8; n++) await open(`sess-a:${n}`)
  await db.pool.query(`update site_turn set opened_at = now() - interval '1 hour'`)
  await markTurnsUndone(
    db.pool,
    SITE,
    [2, 3, 4, 5, 6, 7, 8].map((n) => ({ turnId: `sess-a:${n}`, complete: true, proven: true }))
  )
  const named = await undoneSince(db.pool, SITE, 'sess-a', 9)
  assert.deepEqual(
    named.map((t) => t.turn),
    [8, 7, 6, 5, 4]
  )
})

const pendingUndo = (steps) =>
  runUndo(steps, {
    // The restore door answered 202 FLEET_JOB_PENDING: the host has not said whether it ran.
    undoCommit: async () => fileOutcome({ status: 202, body: { code: 'FLEET_JOB_PENDING' } }),
    revertApply: async () => ({ outcome: 'reverted' })
  })
const doneUndo = (steps) =>
  runUndo(steps, {
    undoCommit: async () => fileOutcome({ status: 200, body: { ok: true, status: 'succeeded' } }),
    revertApply: async () => ({ outcome: 'reverted' })
  })

test(
  'a press that undid nothing verifiably (host answered 202) tells the agent but does not mark the Site changes row undone',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    await closeTurn(db.pool, { turnId: 'sess-a:1', siteKey: SITE, sha: SHA_A, files: 2 })
    const steps = [{ turnId: 'sess-a:1', commits: [SHA_A], applyIds: [] }]
    const result = await pendingUndo(steps)
    assert.equal(result.turns[0].files.status, 'unsure', 'precondition: nothing is known to have gone back')
    await markTurnsUndone(db.pool, SITE, undoneMarks(steps, result, new Set()))
    const row = await turnOf(db.pool, 'sess-a:1')
    assert.ok(row.undone_at instanceof Date, 'pressed: the agent notice still hears of it')
    assert.equal(row.undo_proven_at, null)
    assert.equal(turnUndoneOf(row), null, 'Site changes: undone only by proof, so the row keeps its Undo')
  }
)

test(
  'a proven press after an unproven one marks the row; an unproven press after a proven one keeps it',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    await closeTurn(db.pool, { turnId: 'sess-a:1', siteKey: SITE, sha: SHA_A, files: 2 })
    const steps = [{ turnId: 'sess-a:1', commits: [SHA_A], applyIds: [] }]
    await markTurnsUndone(db.pool, SITE, undoneMarks(steps, await pendingUndo(steps), new Set()))
    assert.equal(turnUndoneOf(await turnOf(db.pool, 'sess-a:1')), null)

    await markTurnsUndone(db.pool, SITE, undoneMarks(steps, await doneUndo(steps), new Set([SHA_A])))
    const proven = await turnOf(db.pool, 'sess-a:1')
    assert.ok(proven.undo_proven_at instanceof Date)
    assert.deepEqual(turnUndoneOf(proven), { at: proven.undo_proven_at.toISOString(), complete: true })

    await db.pool.query(`update site_turn set undone_at = undone_at - interval '1 hour',
                              undo_proven_at = undo_proven_at - interval '1 hour' where turn_id = 'sess-a:1'`)
    const before = await turnOf(db.pool, 'sess-a:1')
    await markTurnsUndone(db.pool, SITE, undoneMarks(steps, await pendingUndo(steps), new Set()))
    const after = await turnOf(db.pool, 'sess-a:1')
    assert.ok(after.undone_at > before.undone_at, 'the later press is still stamped for the agent')
    assert.deepEqual(
      turnUndoneOf(after),
      turnUndoneOf(before),
      'the earlier proof, and its completeness, stay'
    )
    // The agent notice keeps the last press's word, as before migration 182: that press proved nothing.
    assert.deepEqual(await undoneSince(db.pool, SITE, 'sess-a', 2), [
      { turn: 1, title: 'Request sess-a:1', undo_complete: false }
    ])
  }
)

test(
  'a proven partial press after a complete one: Site changes still reads complete, the notice reads that last press',
  opts,
  async () => {
    await sites()
    await open('sess-a:1')
    await closeTurn(db.pool, { turnId: 'sess-a:1', siteKey: SITE, sha: SHA_A, files: 2 })
    const steps = [{ turnId: 'sess-a:1', commits: [SHA_A], applyIds: ['apply-1'] }]
    await markTurnsUndone(db.pool, SITE, undoneMarks(steps, await doneUndo(steps), new Set([SHA_A])))
    assert.equal(turnUndoneOf(await turnOf(db.pool, 'sess-a:1')).complete, true)

    // The files go back again, the content revert is refused: proven, but only part of the turn.
    const partial = await runUndo(steps, {
      undoCommit: async () => fileOutcome({ status: 200, body: { ok: true, status: 'succeeded' } }),
      revertApply: async () => ({ outcome: 'failed', code: 'APPLY_CHANGED_SINCE' })
    })
    const marks = undoneMarks(steps, partial, new Set([SHA_A]))
    assert.deepEqual(marks, [{ turnId: 'sess-a:1', complete: false, proven: true }], 'precondition')
    await markTurnsUndone(db.pool, SITE, marks)
    const row = await turnOf(db.pool, 'sess-a:1')
    assert.equal(turnUndoneOf(row).complete, true, 'a complete undo stays complete on Site changes')
    assert.deepEqual(await undoneSince(db.pool, SITE, 'sess-a', 2), [
      { turn: 1, title: 'Request sess-a:1', undo_complete: false }
    ])
  }
)
