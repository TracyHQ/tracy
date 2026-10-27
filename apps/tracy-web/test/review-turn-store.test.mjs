// REVIEW (09/10/2026) — the chat-turn record and the undo stamp, at the store level.
//
//   TEST_DATABASE_URL=postgres://… node --test apps/tracy-web/test/review-turn-store.test.mjs
//
// Coverage for behaviours of `turns.js` / `turn-undo-store.js` that no other test holds (openTurn's
// merge, a turn id on another site, closeTurn's late-close ordering of ledger L31, flagConcurrent
// within one conversation, undoneSince), plus ONE finding, kept as a TODO (a decision, not a code slip):
//
//   An undo press whose only outcome was `unsure` (nothing verifiably undone: the host answered 202,
//   a 502, an operation left `pending`) is stamped `undone_at` (`undoneMarks` counts "may have gone"),
//   and activity-v2 turns that stamp into `undone: {complete:false}` ("Partly undone") and removes
//   the row's undo (`undoable: !headUndone && undone === null`). activity-v2's own rule is
//   "UNDONE ONLY BY PROOF" (activity-v2.js:22, SYSTEM.md §5 "mark 'undone' only with
//   evidence"); an unsure outcome is not proof.
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
      { turnId: 'sess-a:3', complete: true },
      { turnId: 'sess-a:2', complete: false }
    ])
    await db.pool.query(`update site_turn set undone_at = $1 where undone_at is not null`, [minutes(35)])
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
    [2, 3, 4, 5, 6, 7, 8].map((n) => ({ turnId: `sess-a:${n}`, complete: true }))
  )
  const named = await undoneSince(db.pool, SITE, 'sess-a', 9)
  assert.deepEqual(
    named.map((t) => t.turn),
    [8, 7, 6, 5, 4]
  )
})

// TODO, not a pass: `undoneMarks` stamps `undone_at` on an `unsure` outcome on purpose (turn-undo.test.mjs
// pins it, so the agent's "earlier request undone" notice fires), and activity-v2 reads the same stamp as
// proof. Splitting "proven" from "pressed" is a decision of its own (review 09/10/2026).
test('FINDING: a press that undid nothing verifiably (host answered 202) must not mark the Site changes row undone', {
  ...opts,
  todo: 'undone_at serves both the agent notice and the Site changes proof; split pending a decision'
}, async () => {
  await sites()
  await open('sess-a:1')
  await closeTurn(db.pool, { turnId: 'sess-a:1', siteKey: SITE, sha: SHA_A, files: 2 })
  const steps = [{ turnId: 'sess-a:1', commits: [SHA_A], applyIds: [] }]
  // The restore door answered 202 FLEET_JOB_PENDING: the host has not said whether it ran.
  const result = await runUndo(steps, {
    undoCommit: async () => fileOutcome({ status: 202, body: { code: 'FLEET_JOB_PENDING' } }),
    revertApply: async () => ({ outcome: 'reverted' })
  })
  assert.equal(result.turns[0].files.status, 'unsure', 'precondition: nothing is known to have gone back')
  await markTurnsUndone(db.pool, SITE, undoneMarks(steps, result, new Set()))
  const row = await turnOf(db.pool, 'sess-a:1')
  assert.equal(
    turnUndoneOf(row),
    null,
    'activity-v2 shows "Partly undone" and drops the row’s Undo on no proof (activity-v2.js "UNDONE ONLY BY PROOF")'
  )
})
