/**
 * THE WRITE LEASE — and the four properties an earlier design got wrong.
 *
 *   node --test apps/tracy-web/test/write-lease.test.mjs     (needs TEST_DATABASE_URL)
 *
 * Two chat sessions on one site both reach the Apply door, both write, and the second overwrites the
 * first with nothing said. These tests pin the lease that turns that into an answer — and each one
 * exists because a reviewed design failed it on paper:
 *
 *  1. ATOMICITY. A table keyed `(site_key, session_id)` gives each racer its own row, so two
 *     `update … where not exists (a live holder)` statements lock different rows, read each other's
 *     pre-image under READ COMMITTED, and BOTH win. Keyed on `site_key` there is one row to contend
 *     for and Postgres decides. Test 1 races them for real.
 *  2. NULL ORDERING. A queue ticket stamped only on refusal is NULL for a newcomer, and `x < NULL`
 *     is NULL, so `not exists (an earlier waiter)` was true and the newest session beat everybody
 *     waiting. Test 4 puts a newcomer behind a waiter.
 *  3. WHICH CLOCK EXPIRES A HOLDER. Refreshing on every apply means a holder that only READS keeps
 *     the write lease alive — "a chat that stops writing releases" was false against the schema that
 *     shipped with it. Test 5 reads under a held lease and checks it still expires.
 *  4. NO CEILING. A TTL that only fires on silence never fires for a retry loop, so one customer
 *     could hold another's site for ever. Test 6 holds it continuously and takes it anyway.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { fileDb } from './_db.mjs'
import {
  notePresence,
  releaseWriteLease,
  takeWriteLease,
  WRITE_LEASE_CEILING_MS,
  WRITE_LEASE_STALE_MS
} from '../src/sites/store.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const gate = { skip: url ? false : 'set TEST_DATABASE_URL' }

const SITE = 'demo.tracy.test'
const A = { siteKey: SITE, sessionId: 'session-a', actor: 'lan@tracy.test' }
const B = { siteKey: SITE, sessionId: 'session-b', actor: 'minh@tracy.test' }

/** Move a lease's clocks back, the way time would. */
const age = (pool, column, ms) =>
  pool.query(
    `update site_write_lease set ${column} = ${column} - ($2::int * interval '1 millisecond') where site_key = $1`,
    [SITE, ms]
  )

test('two sessions racing in the same millisecond: exactly one gets the lease', gate, async () => {
  const { pool } = db
  // The property the per-session key could not have. Fired together, on one row, by the database.
  const [a, b] = await Promise.all([takeWriteLease(pool, A), takeWriteLease(pool, B)])
  const winners = [a, b].filter((r) => r.ok)
  assert.equal(winners.length, 1, 'both sessions believed they held the lease')
  const loser = [a, b].find((r) => !r.ok)
  assert.ok(loser.holder, 'the loser was not told who holds it')
  assert.ok(
    loser.holder.holder_actor === A.actor || loser.holder.holder_actor === B.actor,
    'the refusal names nobody'
  )
})

test('the holder may keep writing; a second session is refused and told who is there', gate, async () => {
  const { pool } = db
  assert.equal((await takeWriteLease(pool, A)).ok, true)
  assert.equal((await takeWriteLease(pool, A)).ok, true, 'the holder was refused its own lease')
  const refused = await takeWriteLease(pool, B)
  assert.equal(refused.ok, false)
  assert.equal(refused.holder.holder_actor, A.actor)
})

test('releasing hands the site on; a stale release from a loser frees nothing', gate, async () => {
  const { pool } = db
  await takeWriteLease(pool, A)
  // B lost, then tries to release — a late call from a session that never held it must not free
  // the site under the person who does.
  await takeWriteLease(pool, B)
  await releaseWriteLease(pool, B)
  assert.equal((await takeWriteLease(pool, B)).ok, false, 'a loser released the holder’s lease')

  await releaseWriteLease(pool, A)
  assert.equal((await takeWriteLease(pool, B)).ok, true, 'the lease was not handed on')
})

test('among waiters the earlier ARRIVAL is ahead, even when it asks to write later', gate, async () => {
  const { pool } = db
  // B arrives first and reads for a while — the measured shape: an agent's opening moves are
  // reads. A arrives second and writes immediately. The rule is arrival, not first write.
  await notePresence(pool, B)
  await pool.query(
    `update site_presence set first_at = first_at - interval '60 seconds' where site_key = $1 and session_id = $2`,
    [SITE, B.sessionId]
  )
  await notePresence(pool, A)

  const holder = { siteKey: SITE, sessionId: 'session-holder', actor: 'holder@tracy.test' }
  await notePresence(pool, holder)
  assert.equal((await takeWriteLease(pool, holder)).ok, true)

  // B has only READ so far: it is not waiting, so nobody is ahead of A yet (acceptance v4, 30/09 —
  // counting visitors told a customer "4 requests queued ahead" with nobody waiting).
  const refusedA = await takeWriteLease(pool, A)
  assert.equal(refusedA.ok, false)
  assert.equal(refusedA.aheadOfYou, 0, 'a reader was counted as a place in the queue')

  const refusedB = await takeWriteLease(pool, B)
  assert.equal(refusedB.ok, false)
  assert.equal(refusedB.aheadOfYou, 0, 'B arrived first and was told somebody is ahead of it')

  // Now B IS waiting, and arrived before A: one ahead, and never more than the row knows.
  const againA = await takeWriteLease(pool, A)
  assert.equal(againA.aheadOfYou, 1, 'A was told nobody waits before it, but B does')

  // And the ticket in the row is the EARLIEST waiter's, not the most recent claimant's — the NULL
  // ordering bug put whoever asked last at the front.
  const { rows } = await pool.query('select wanted_session from site_write_lease where site_key = $1', [SITE])
  assert.equal(rows[0].wanted_session, B.sessionId)
})

test('a holder that only READS still loses the lease when it stops writing', gate, async () => {
  const { pool } = db
  assert.equal((await takeWriteLease(pool, A)).ok, true)
  // A keeps talking — every read touches presence — but writes nothing. Presence is not the clock
  // the write lease expires on, or a chat holds a site by being open.
  await age(pool, 'wrote_at', WRITE_LEASE_STALE_MS + 1_000)
  await notePresence(pool, A)
  assert.equal((await takeWriteLease(pool, B)).ok, true, 'reading kept a write lease alive')
})

test('a holder that never goes silent is still bounded by the ceiling', gate, async () => {
  const { pool } = db
  assert.equal((await takeWriteLease(pool, A)).ok, true)
  // A retry loop: writing constantly, so the silence TTL never fires. Without a ceiling this holds
  // another customer's site for ever.
  await age(pool, 'taken_at', WRITE_LEASE_CEILING_MS + 1_000)
  assert.equal((await takeWriteLease(pool, A)).ok, true, 'the holder could not renew')
  await age(pool, 'taken_at', WRITE_LEASE_CEILING_MS + 1_000)
  assert.equal((await takeWriteLease(pool, B)).ok, true, 'a continuous holder was never breakable')
})

test('a visit from last week is not a place in today’s queue', gate, async () => {
  const { pool } = db
  await notePresence(pool, B)
  await pool.query(
    `update site_presence set first_at = now() - interval '7 days', seen_at = now() - interval '7 days'
      where site_key = $1 and session_id = $2`,
    [SITE, B.sessionId]
  )
  await notePresence(pool, A)
  // B comes back. Its arrival is NOW, not last week, or it outranks everyone who asked today and
  // the rule the customer was promised reads as nonsense.
  await notePresence(pool, B)
  const { rows } = await pool.query(
    'select session_id from site_presence where site_key = $1 order by first_at',
    [SITE]
  )
  assert.deepEqual(
    rows.map((r) => r.session_id),
    [A.sessionId, B.sessionId]
  )
})

test('presence reports the others, never yourself', gate, async () => {
  const { pool } = db
  assert.deepEqual(await notePresence(pool, A), [])
  const others = await notePresence(pool, B)
  assert.equal(others.length, 1)
  assert.equal(others[0].session_id, A.sessionId)
  assert.equal(others[0].actor, A.actor)
})

/**
 * Taking the lease and renewing one look identical in the row, and the Apply door has to tell them
 * apart: only the call that OPENED a hold may hand it back after a refusal. A session already
 * holding the lease is in the middle of one customer request — many writes, one `apply_id` — and
 * releasing under it lets the other chat into the half-applied result.
 */
test('the lease says whether it was opened or renewed', gate, async () => {
  const { pool } = db
  const first = await takeWriteLease(pool, A)
  assert.equal(first.ok, true)
  assert.equal(first.fresh, true, 'the first take did not report itself as fresh')
  const again = await takeWriteLease(pool, A)
  assert.equal(again.ok, true)
  assert.equal(again.fresh, false, 'a renewal reported itself as a fresh hold')

  // And after a release, the same session taking it again is a NEW hold, not a renewal — otherwise
  // the door could never give the lease back twice in one session.
  await releaseWriteLease(pool, A)
  const third = await takeWriteLease(pool, A)
  assert.equal(third.fresh, true, 'a take after a release was read as a renewal')
})

/**
 * "The site frees itself shortly" is not something a customer can decide against. The refusal
 * carries the floor in milliseconds, measured from the holder's last WRITE, on the database's clock.
 */
test('a refusal says how long until the site frees, and the number shrinks', gate, async () => {
  const { pool } = db
  await takeWriteLease(pool, A)
  const fresh = await takeWriteLease(pool, B)
  assert.equal(fresh.ok, false)
  assert.ok(
    fresh.freeInMs > WRITE_LEASE_STALE_MS - 5_000 && fresh.freeInMs <= WRITE_LEASE_STALE_MS,
    `a full window should be about ${WRITE_LEASE_STALE_MS}ms, got ${fresh.freeInMs}`
  )

  // Age the holder's last write by two thirds of the window; the wait left must fall by the same.
  await age(pool, 'wrote_at', Math.round(WRITE_LEASE_STALE_MS * (2 / 3)))
  const later = await takeWriteLease(pool, B)
  assert.equal(later.ok, false)
  assert.ok(
    later.freeInMs < fresh.freeInMs,
    `the wait did not shrink as the holder aged: ${fresh.freeInMs} then ${later.freeInMs}`
  )

  // Past the window the lease is takeable, so there is nothing left to wait for — and the number
  // must never go negative, which is what a wait computed on the app's clock can do.
  await age(pool, 'wrote_at', WRITE_LEASE_STALE_MS)
  const takeable = await takeWriteLease(pool, B)
  assert.equal(takeable.ok, true, 'a stale lease was not takeable')
})

/**
 * ONE PERSON, A NEW CONVERSATION. The lease exists so two DIFFERENT people (or their agents) cannot
 * interleave writes. It was keyed on the conversation, so the same customer opening a fresh chat
 * inside the 90 s window after their previous chat's last write was refused `SITE_BUSY` by
 * themselves (stand, 29/09: `tasks/evidence/comment-multi-pin/stand-e2e.md` round 2). The newer
 * conversation of the same account takes the lease over; a different account still waits.
 */
const A2 = { siteKey: SITE, sessionId: 'session-a2', actor: A.actor }

test(
  'a newer conversation of the SAME account takes the lease over from its own earlier one',
  gate,
  async () => {
    const { pool } = db
    await notePresence(pool, A)
    assert.equal((await takeWriteLease(pool, A)).ok, true)
    await pool.query(
      `update site_presence set first_at = first_at - interval '10 seconds' where session_id = $1`,
      [A.sessionId]
    )
    await notePresence(pool, A2)
    const taken = await takeWriteLease(pool, A2)
    assert.equal(taken.ok, true, 'the same account was refused by its own earlier conversation')
    assert.equal(taken.fresh, true)
    assert.equal(taken.takenOverFrom, A.sessionId, 'the takeover does not name the conversation it replaced')
    const { rows } = await pool.query('select holder_session, holder_actor from site_write_lease')
    assert.deepEqual(rows[0], { holder_session: A2.sessionId, holder_actor: A.actor })

    // The earlier conversation coming back does not take it again: two chats of one person writing
    // at once would interleave exactly as two people do. It is told it is one of its own.
    const back = await takeWriteLease(pool, A)
    assert.equal(back.ok, false, 'the older conversation took the lease back — the two would interleave')
    assert.equal(back.holder.holder_session, A2.sessionId)
  }
)

test('a DIFFERENT account is still refused while the holder is live', gate, async () => {
  const { pool } = db
  await notePresence(pool, A)
  assert.equal((await takeWriteLease(pool, A)).ok, true)
  await pool.query(`update site_presence set first_at = first_at - interval '10 seconds'`)
  await notePresence(pool, B)
  const refused = await takeWriteLease(pool, B)
  assert.equal(refused.ok, false, 'another person got into the middle of a live hold')
  assert.equal(refused.holder.holder_session, A.sessionId)
})

test('a plain renewal or a take of a stale lease is not reported as a takeover', gate, async () => {
  const { pool } = db
  await notePresence(pool, A)
  assert.equal((await takeWriteLease(pool, A)).takenOverFrom, null)
  assert.equal((await takeWriteLease(pool, A)).takenOverFrom, null, 'a renewal read as a takeover')
  await age(pool, 'wrote_at', WRITE_LEASE_STALE_MS + 1_000)
  await notePresence(pool, B)
  const stale = await takeWriteLease(pool, B)
  assert.equal(stale.ok, true)
  assert.equal(stale.takenOverFrom, null, 'taking a stale lease read as a takeover')
})

test('a seat key never takes over, nor is taken over by, a chat of the same account', gate, async () => {
  const { pool } = db
  const KEY = { siteKey: SITE, sessionId: 'key:abcdefghijklmnop', actor: A.actor }
  await notePresence(pool, KEY)
  assert.equal((await takeWriteLease(pool, KEY)).ok, true)
  await pool.query(`update site_presence set first_at = first_at - interval '10 seconds'`)
  await notePresence(pool, A2)
  assert.equal((await takeWriteLease(pool, A2)).ok, false, 'a chat stepped into a running script')
})

test(
  'the waiting count is never more than the one waiter the row holds, nor counts finished visits',
  gate,
  async () => {
    const { pool } = db
    // Four conversations visited and left; one holds. Measured on the stand (v4, ED1): "4 requests
    // queued ahead of mine" with none of them waiting.
    for (const n of [1, 2, 3, 4])
      await notePresence(pool, { siteKey: SITE, sessionId: `session-old-${n}`, actor: 'lan@tracy.test' })
    const holder = { siteKey: SITE, sessionId: 'session-holder', actor: 'lan@tracy.test' }
    await notePresence(pool, holder)
    assert.equal((await takeWriteLease(pool, holder)).ok, true)
    await notePresence(pool, B)
    const refused = await takeWriteLease(pool, B)
    assert.equal(refused.ok, false)
    assert.equal(refused.aheadOfYou, 0)
  }
)

test('the turn-end release frees only the caller’s own hold', gate, async () => {
  const { pool } = db
  assert.equal((await takeWriteLease(pool, A)).ok, true)
  // Somebody else quoting A's session id frees nothing.
  assert.equal(
    await releaseWriteLease(pool, { siteKey: SITE, sessionId: A.sessionId, actor: B.actor }),
    false
  )
  assert.equal((await takeWriteLease(pool, B)).ok, false, 'another person freed A’s hold')
  // A's own turn ended: the site is free at once, not 90 s later.
  assert.equal(await releaseWriteLease(pool, { siteKey: SITE, sessionId: A.sessionId, actor: A.actor }), true)
  assert.equal((await takeWriteLease(pool, B)).ok, true, 'a finished conversation still blocked the site')
})

// Review Q3 (20/10/2026): the turn-end release of turn N is sent after N ends and retried for seconds,
// so it can land after turn N+1 of the same conversation renewed the lease. By session alone it freed
// N+1's hold mid-request; the lease now keeps its latest writer's turn and an older turn frees nothing.
const turnOf = (n, root = A.sessionId) => `${root}:${n}`

test('a late release of turn N leaves the hold turn N+1 renewed', gate, async () => {
  const { pool } = db
  assert.equal((await takeWriteLease(pool, { ...A, turnId: turnOf(4) })).ok, true)
  assert.equal((await takeWriteLease(pool, { ...A, turnId: turnOf(5) })).fresh, false)
  assert.equal(
    await releaseWriteLease(pool, {
      siteKey: SITE,
      sessionId: A.sessionId,
      actor: A.actor,
      turnId: turnOf(4)
    }),
    false,
    'turn 4’s release freed the hold turn 5 renewed'
  )
  assert.equal((await takeWriteLease(pool, B)).ok, false, 'another chat stepped into turn 5')
  // Turn 5's own release frees it, and a duplicate of it then changes nothing.
  const release5 = { siteKey: SITE, sessionId: A.sessionId, actor: A.actor, turnId: turnOf(5) }
  assert.equal(await releaseWriteLease(pool, release5), true)
  assert.equal(await releaseWriteLease(pool, release5), false)
  assert.equal((await takeWriteLease(pool, B)).ok, true, 'turn 5 ended and the site stayed held')
})

test('writes landing out of order keep the highest turn', gate, async () => {
  const { pool } = db
  await takeWriteLease(pool, { ...A, turnId: turnOf(7) })
  // A slow write of turn 6 renews after turn 7's: the lease is still turn 7's.
  assert.equal((await takeWriteLease(pool, { ...A, turnId: turnOf(6) })).ok, true)
  // A write with no turn (an older dsh) keeps what the lease knew.
  assert.equal((await takeWriteLease(pool, A)).ok, true)
  const { rows } = await pool.query('select holder_turn_root, holder_turn from site_write_lease')
  assert.deepEqual(rows[0], { holder_turn_root: A.sessionId, holder_turn: 7 })
  assert.equal(
    await releaseWriteLease(pool, {
      siteKey: SITE,
      sessionId: A.sessionId,
      actor: A.actor,
      turnId: turnOf(6)
    }),
    false
  )
  assert.equal(
    await releaseWriteLease(pool, {
      siteKey: SITE,
      sessionId: A.sessionId,
      actor: A.actor,
      turnId: turnOf(7)
    }),
    true
  )
  // Turn numbers are compared within one root session only: 10 does not sort after 9 for another root.
  await takeWriteLease(pool, { ...A, turnId: turnOf(10) })
  assert.equal(
    await releaseWriteLease(pool, {
      siteKey: SITE,
      sessionId: A.sessionId,
      actor: A.actor,
      turnId: turnOf(2, 'session-other-root')
    }),
    true,
    'a turn of another root was ordered against this one'
  )
})

test('a release with no turn, or of a lease that recorded none, behaves as before', gate, async () => {
  const { pool } = db
  await takeWriteLease(pool, { ...A, turnId: turnOf(3) })
  assert.equal(await releaseWriteLease(pool, { siteKey: SITE, sessionId: A.sessionId, actor: A.actor }), true)
  await takeWriteLease(pool, A)
  assert.equal(
    await releaseWriteLease(pool, {
      siteKey: SITE,
      sessionId: A.sessionId,
      actor: A.actor,
      turnId: turnOf(1)
    }),
    true
  )
  // A new holder starts from its own turn, not the previous holder's.
  await takeWriteLease(pool, { ...A, turnId: turnOf(9) })
  await releaseWriteLease(pool, { siteKey: SITE, sessionId: A.sessionId, actor: A.actor, turnId: turnOf(9) })
  await takeWriteLease(pool, { ...B, turnId: `${B.sessionId}:0` })
  assert.equal(
    await releaseWriteLease(pool, {
      siteKey: SITE,
      sessionId: B.sessionId,
      actor: B.actor,
      turnId: `${B.sessionId}:0`
    }),
    true
  )
})
