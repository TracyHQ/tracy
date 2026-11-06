/**
 * `call-memory.mjs`: what `tracy_site` remembers between two calls, pinned without a server — who a
 * snapshot may be served to, when it goes stale, how ids are made, and the order of a site's flights.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  answerVerdict,
  CONFIRM_QUESTION_PREFIX,
  CONFIRM_TTL_MS,
  callKeyOf,
  confirmQuestion,
  confirmQuestionId,
  createCallMemory,
  flightSeat,
  MEMOISED_CODES,
  memoisableRefusal,
  openAnswerRefuses,
  sameCallKey,
  sameCallRefused,
  untranslatedConfirmCard,
  typedRefusal,
  wpRecordOf
} from '../src/host/call-memory.mjs'
import { waitOutLease } from '../src/host/lease-wait.mjs'
import { LEGACY_BOUND_MESSAGE, LEGACY_STRUCTURE_CODE } from '../src/host/legacy-refusal.mjs'
import { withNext } from '../src/host/site.mjs'

const inspect = (revision = 'r1') => ({ ok: true, revision, slots: [{ key: 'module-1.0', type: 'text' }] })
const key = (over = {}) => ({ sessionId: 'session-a', label: 'site-a', actor: 'ana@example.com', ...over })

test('🔒 a snapshot is never served to another person, another conversation, another site, or after a write', () => {
  const m = createCallMemory()
  assert.equal(m.rememberInspect(key(), inspect(), m.generationOf('site-a')), true)
  assert.equal(m.inspectCached(key())?.revision, 'r1')
  // The contract door is behind a role gate: an answer fetched as one person is not the other's.
  assert.equal(m.inspectCached(key({ actor: 'bo@example.com' })), null)
  assert.equal(m.inspectCached(key({ sessionId: 'session-b' })), null)
  assert.equal(m.inspectCached(key({ label: 'site-b' })), null)
  // Any site-changing relay, whoever sent it, makes every conversation's snapshot of that site stale.
  m.invalidateSite('site-a')
  assert.equal(m.inspectCached(key()), null)
})

test('🔒 a conversation or a person the call cannot name gets no cache at all', () => {
  const m = createCallMemory()
  for (const k of [
    key({ sessionId: null }),
    key({ sessionId: '' }),
    key({ actor: null }),
    key({ actor: '' })
  ]) {
    assert.equal(m.rememberInspect(k, inspect(), m.generationOf('site-a')), false)
    assert.equal(m.inspectCached(k), null)
  }
})

test('the snapshot lives for one turn: the next customer message empties it', () => {
  const m = createCallMemory()
  m.rememberInspect(key(), inspect(), m.generationOf('site-a'))
  assert.equal(m.turnOf('session-a'), 0)
  assert.equal(m.newTurn('session-a'), 1)
  assert.equal(m.inspectCached(key()), null)
})

test('🔒 a populate that lands after a concurrent write is not remembered (the generation race, D8)', () => {
  const m = createCallMemory()
  const before = m.generationOf('site-a') // captured when the inspect went out
  m.invalidateSite('site-a') // a write lands while the inspect is on the wire
  assert.equal(m.rememberInspect(key(), inspect(), before), false)
  assert.equal(m.inspectCached(key()), null)
  // An answer that is not a full inspect is never a snapshot.
  assert.equal(m.rememberInspect(key(), { ok: false, error: 'writer_busy' }, m.generationOf('site-a')), false)
})

test('ids never repeat across two fresh memories: the clock and random bytes, never a counter', () => {
  const a = createCallMemory()
  const b = createCallMemory()
  const ids = new Set([a.mint('contract'), a.mint('contract'), b.mint('contract'), b.mint('contract')])
  assert.equal(ids.size, 4)
  for (const id of ids) assert.match(id, /^contract-[0-9a-z]+-[0-9a-f]{6}$/)
  const fixed = createCallMemory({ now: () => 36 ** 3, random: () => 'C0FFEE' })
  assert.equal(fixed.mint('wp'), 'wp-1000-c0ffee')
})

test("one apply id per write (26/10/2026, was D9): each write of a turn its own, in order, under the turn's stem", () => {
  let t = 0
  const m = createCallMemory({ now: () => ++t })
  const first = m.wpApplyId('session-a', 'site-a')
  const second = m.wpApplyId('session-a', 'site-a')
  assert.notEqual(second, first, 'two writes, two ids')
  assert.match(first, /^wp-[0-9a-z]+-[0-9a-f]{6}-1$/)
  assert.equal(second, first.replace(/-1$/, '-2'), "the turn's stem, numbered in order")
  assert.notEqual(m.wpApplyId('session-b', 'site-a'), second, 'another conversation never shares one')
  assert.equal(m.wpApplyId('session-a', 'site-b').endsWith('-1'), true, 'counted per site')
  // Joomla's own prefix is counted apart from WordPress's on the same site.
  assert.match(m.wpApplyId('session-a', 'site-a', 'jo'), /^jo-[0-9a-z]+-[0-9a-f]{6}-1$/)
  m.newTurn('session-a')
  const next = m.wpApplyId('session-a', 'site-a')
  assert.match(next, /-1$/)
  assert.notEqual(next.slice(0, -2), first.slice(0, -2), 'a new turn, a new stem')
})

test('one apply id per write: the receipts list them oldest first, so a build is undone newest-first, one write at a time', () => {
  const m = createCallMemory()
  const ids = [1, 2, 3].map(() => m.wpApplyId('session-a', 'site-a'))
  for (const applyId of ids) m.rememberWrite('session-a', 'site-a', { applyId, ok: true })
  const { applyIds } = m.factsFor('session-a', 'site-a')
  assert.deepEqual(applyIds, ids)
  assert.deepEqual([...applyIds].reverse(), [ids[2], ids[1], ids[0]], 'newest first')
})

test('flight orders calls on one site and never holds a second site back', async () => {
  const m = createCallMemory()
  const log = []
  /** @type {(v?: unknown) => void} */
  let release = () => {}
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const first = m.flight('site-a', async () => {
    log.push('a1 start')
    await gate
    log.push('a1 end')
    return 1
  })
  const second = m.flight('site-a', async () => {
    log.push('a2')
    return 2
  })
  const other = m.flight('site-b', async () => {
    log.push('b1')
    return 3
  })
  assert.equal(await other, 3)
  assert.deepEqual(log, ['a1 start', 'b1'], 'site-b ran while site-a was held')
  release()
  assert.deepEqual(await Promise.all([first, second]), [1, 2])
  assert.deepEqual(log, ['a1 start', 'b1', 'a1 end', 'a2'])
})

test('a failed flight does not break the chain behind it', async () => {
  const m = createCallMemory()
  const failed = m.flight('site-a', async () => {
    throw new Error('boom')
  })
  await assert.rejects(failed, /boom/)
  assert.equal(await m.flight('site-a', async () => 'next'), 'next')
})

// ── review C1 (19/10/2026): a write waiting for the site's lease does not hold the site's flight ────

/** A promise the test settles, and whether it was asked for. */
function gate() {
  /** @type {() => void} */
  let open = () => {}
  const opened = new Promise((resolve) => {
    open = () => resolve(undefined)
  })
  return { opened, open }
}

/** Settles with `fallback` when `p` has not settled within a few event-loop turns. */
async function settledSoon(p, fallback = 'still queued') {
  const later = new Promise((resolve) => setTimeout(() => resolve(fallback), 50))
  return Promise.race([p, later])
}

test('🔒 C1: the conversation holding the lease is not queued behind the write waiting for it, and the waiter queues again behind it', async () => {
  const m = createCallMemory()
  const BUSY = { ok: false, code: 'SITE_BUSY', holder: 'ceo@tracy.ai' }
  const door = []
  const pause = gate()
  const paused = gate()
  let sendsB = 0
  // B writes (a Joomla content.update runs in the site's flight) and is refused: A holds the lease.
  const waiter = m.flight('site-a', () => {
    const seat = flightSeat()
    assert.ok(seat, 'a flight hands its seat to the code it runs')
    return waitOutLease(
      async () => {
        door.push(`B send ${sendsB}`)
        return sendsB++ === 0 ? BUSY : { ok: true }
      },
      {
        sleep: async () => {
          paused.open()
          await pause.opened
        },
        leave: seat.leave,
        rejoin: seat.rejoin
      }
    )
  })
  await paused.opened
  // A, the holder, reads and then writes on the same site while B waits for the lease.
  const read = m.flight('site-a', async () => (door.push('A read'), 'read'))
  assert.equal(await settledSoon(read), 'read', "the holder's read ran while the waiter paused")
  const write = m.flight('site-a', async () => (door.push('A write'), 'written'))
  assert.equal(await settledSoon(write), 'written')
  pause.open()
  assert.deepEqual(await waiter, { ok: true, waitedSeconds: 3 })
  assert.deepEqual(door, ['B send 0', 'A read', 'A write', 'B send 1'])
})

test('🔒 C1: the waiter queues again at the END of the flight: what was queued while it paused goes first', async () => {
  const m = createCallMemory()
  const door = []
  const pause = gate()
  const paused = gate()
  const holding = gate()
  let sends = 0
  const waiter = m.flight('site-a', () => {
    const seat = flightSeat()
    return waitOutLease(
      async () => (
        door.push(`B send ${sends}`), sends++ === 0 ? { ok: false, code: 'SITE_BUSY' } : { ok: true }
      ),
      {
        sleep: async () => {
          paused.open()
          await pause.opened
        },
        leave: seat?.leave,
        rejoin: seat?.rejoin
      }
    )
  })
  await paused.opened
  // A long call of the holder is in the flight when B's pause ends: B's next send waits for it.
  const long = m.flight('site-a', async () => {
    door.push('A start')
    await holding.opened
    door.push('A end')
  })
  pause.open()
  assert.equal(await settledSoon(waiter), 'still queued', 'B waits for its new place')
  holding.open()
  await long
  assert.equal((await waiter).ok, true)
  assert.deepEqual(door, ['B send 0', 'A start', 'A end', 'B send 1'])
})

test("🔒 C1: a seat whose flight has ended is never taken again — the site's queue is not held by it", async () => {
  const m = createCallMemory()
  /** @type {import('../src/host/call-memory.mjs').FlightSeat | null} */
  let kept = null
  await m.flight('site-a', async () => {
    kept = flightSeat()
  })
  assert.ok(kept)
  kept.leave()
  await kept.rejoin()
  assert.equal(await settledSoon(m.flight('site-a', async () => 'next')), 'next')
  assert.equal(flightSeat(), null, 'outside any flight there is no seat')
})

test('reads remember the body length; a template part is found by its slug or its id', () => {
  const m = createCallMemory()
  m.rememberRead('session-a', { kind: 'post', id: 42, title: 'Home', chars: 26_884 })
  m.rememberRead('session-a', { kind: 'templatePart', id: 80, key: 'header', title: 'Header', chars: 7_848 })
  assert.equal(m.readOf('session-a', { id: 42 })?.chars, 26_884)
  assert.equal(m.readOf('session-a', { kind: 'templatePart', key: 'header' })?.chars, 7_848)
  assert.equal(
    m.readOf('session-a', { id: 80 })?.chars,
    7_848,
    'the part is post 80 when written as kind post'
  )
  assert.equal(m.readOf('session-b', { id: 42 }), null, 'another conversation read nothing')
  // A part with no stored override: the theme's file is in charge.
  m.rememberRead('session-a', { kind: 'templatePart', key: 'footer', absent: true })
  assert.equal(m.readOf('session-a', { kind: 'templatePart', key: 'footer' })?.absent, true)
  assert.deepEqual(m.factsFor('session-a', 'site-a').postsRead, [{ id: 42, title: 'Home' }])
})

test('receipts: applied ids in order, the model spelling mapped, an unknown outcome kept apart', () => {
  const m = createCallMemory()
  m.rememberWrite('session-a', 'site-a', { applyId: 'contract-1', asked: 'hero', ok: true })
  m.rememberWrite('session-a', 'site-a', { applyId: 'contract-2', ok: false, unknown: true })
  m.rememberWrite('session-a', 'site-a', { applyId: 'wp-1', ok: true })
  const f = m.factsFor('session-a', 'site-a')
  assert.deepEqual(f.applyIds, ['contract-1', 'wp-1'])
  assert.deepEqual(f.idMap, { hero: 'contract-1' })
  assert.deepEqual(f.unknownIds, ['contract-2'])
  assert.deepEqual(m.factsFor('session-a', 'site-b').applyIds, [], 'receipts are per site')
  // The re-send answered: the id is no longer of unknown outcome.
  m.rememberWrite('session-a', 'site-a', { applyId: 'contract-2', ok: true })
  assert.deepEqual(m.factsFor('session-a', 'site-a').unknownIds, [])
})

test('D34: a destructive call passes once, and only after the customer answered since it was refused', () => {
  const m = createCallMemory()
  const call = { tool: 'content_delete', arguments: { collection: 'posts', id: '01J' } }
  assert.equal(m.confirmed('session-a', call), false, 'never asked')
  m.confirmAsked('session-a', call)
  assert.equal(
    m.confirmed('session-a', { ...call, confirm: true }),
    false,
    'confirm:true with no answer since'
  )
  const q = confirmQuestion(callKeyOf(call), 'x').questions[0]
  m.customerAnswered(
    'session-a',
    { questions: [q] },
    { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] }
  )
  assert.equal(m.confirmed('session-a', { ...call, confirm: true }), true)
  assert.equal(m.confirmed('session-a', call), false, 'spent by the call it allowed')
  assert.equal(q.id, confirmQuestionId(callKeyOf(call)), 'the question is keyed on the call')
  // A refusal that carries NO question of Tracy's (`own: false` — PENDING_DRAFT) is still opened by
  // an open answer: it has no question of its own to wait for (D34.4).
  m.confirmAsked('session-a', 'k', false)
  m.newTurn('session-a')
  assert.equal(m.confirmed('session-a', 'k'), true)
  assert.equal(m.confirmed('session-b', 'k'), false)
})

/**
 * 🔒 D34.4 (28/09/2026): AN OPEN ANSWER DOES NOT OPEN A CALL THAT CARRIES ITS OWN QUESTION. Every
 * `CONFIRM_FIRST` hands the agent a question of Tracy's (`ask`), so a call whose question was never
 * put to the customer was never answered by them. A card holding Tracy's question for the ENGLISH row
 * plus the agent's own "Which language?" answered "English only" opened the RUSSIAN row's delete — a
 * call the customer never saw. A `PENDING_DRAFT` carries no question, so an open answer stays its way
 * through.
 */
test('🔒 D34: a question the agent wrote opens no delete — only an answer to the door’s own question, given after its refusal, does', () => {
  const m = createCallMemory()
  const call = { tool: 'content_delete', arguments: { collection: 'posts', id: '01J' } }
  m.newTurn('session-a')
  // The agent asks first, naming the record; the customer says yes to THAT question.
  m.customerAnswered(
    'session-a',
    {
      questions: [
        {
          id: 'confirm_delete',
          header: 'Delete',
          question: 'Delete the post “Hello world”?',
          options: [{ label: 'Delete it' }, { label: 'Keep it' }]
        }
      ]
    },
    { answers: [{ id: 'confirm_delete', selected: ['Delete it'] }] }
  )
  assert.equal(m.confirmed('session-a', { ...call, confirm: true }), false, 'nothing was asked by the door')
  // The door refuses the call and asks its own question: the yes given before does not count for it…
  m.confirmAsked('session-a', call)
  assert.equal(m.confirmed('session-a', { ...call, confirm: true }), false)
  // …and only an answer to that question, given after the refusal, opens the same call, once.
  const q = confirmQuestion(callKeyOf(call), 'x').questions[0]
  m.customerAnswered(
    'session-a',
    { questions: [q] },
    { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] }
  )
  assert.equal(m.confirmed('session-a', { ...call, confirm: true }), true)
  assert.equal(m.confirmed('session-a', { ...call, confirm: true }), false, 'spent by the call it allowed')
})

test('🔒 D34.4: an open answer opens a PENDING_DRAFT, never a call that carries Tracy’s question', () => {
  const m = createCallMemory({ now: () => 1 })
  const ru = 'content_delete {"id":"ru"}'
  const en = 'content_delete {"id":"en"}'
  m.confirmAsked('s', en)
  m.confirmAsked('s', ru)
  const qEn = confirmQuestion(en, 'x').questions[0]
  const which = { id: 'which-language', question: 'Which language?', options: [{ label: 'English only' }] }
  m.customerAnswered(
    's',
    { questions: [qEn, which] },
    {
      answers: [
        { id: qEn.id, selected: ['Yes, go ahead'] },
        { id: 'which-language', selected: ['English only'] }
      ]
    }
  )
  assert.equal(m.confirmed('s', en), true, 'its own question was answered with the go-ahead')
  assert.equal(m.confirmed('s', ru), false, 'nobody was ever shown the Russian row’s question')
  // A typed message is an open answer too, and opens it no more than the card did.
  m.newTurn('s', 'Ừ, xong rồi nhé')
  assert.equal(m.confirmed('s', ru), false)
  // The same refusal with no question of Tracy's is opened by exactly that open answer.
  m.confirmAsked('s', 'pending-draft-key', false)
  m.newTurn('s', 'Ừ, publish luôn')
  assert.equal(m.confirmed('s', 'pending-draft-key'), true)
})

test('🔒 D34: a question Tracy wrote counts only on its first option — "No, keep it" is not a yes', () => {
  const ask = confirmQuestion(
    'content_delete:{"collection":"posts","id":"01J"}',
    'content_delete removes posts/about.'
  )
  const [q] = ask.questions
  assert.ok(q.id.startsWith(CONFIRM_QUESTION_PREFIX))
  assert.equal(q.id, confirmQuestion('content_delete:{"collection":"posts","id":"01J"}', 'x').questions[0].id)
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['Yes, go ahead', 'No, keep it']
  )
  const answer = (/** @type {object} */ one) => ({ answers: [{ id: q.id, ...one }] })
  const yes = { agreed: [q.id], declined: [], open: false }
  const no = { agreed: [], declined: [q.id], open: false }
  assert.deepEqual(answerVerdict(ask, answer({ selected: ['Yes, go ahead'] })), yes)
  assert.deepEqual(answerVerdict(ask, answer({ selected: ['No, keep it'] })), no)
  assert.deepEqual(
    answerVerdict(ask, answer({ selected: [], custom: 'yes' })),
    no,
    'typed words are not the go-ahead'
  )
  assert.deepEqual(answerVerdict(ask, null), no)
  // The agent put the words in the customer's language: the first option is still the go-ahead.
  const vi = {
    questions: [{ ...q, options: [{ label: 'Có, xoá đi' }, { label: 'Không, giữ lại' }] }]
  }
  assert.deepEqual(answerVerdict(vi, answer({ selected: ['Có, xoá đi'] })), yes)
  assert.deepEqual(answerVerdict(vi, answer({ selected: ['Không, giữ lại'] })), no)
  // A question the agent wrote itself is an open answer, as before: the model reads the words.
  assert.deepEqual(answerVerdict({ questions: [{ id: 'which', question: 'Which page?' }] }, null), {
    agreed: [],
    declined: [],
    open: true
  })
  assert.deepEqual(answerVerdict({}, null), { agreed: [], declined: [], open: true })
  // The id is the key's own, so the memory can tell which refused call an answer is for.
  assert.equal(q.id, confirmQuestionId('content_delete:{"collection":"posts","id":"01J"}'))
})

// 🔒 F2 (27/09/2026): one go-ahead unlocked every call refused before it. The answer counted as "the
// customer answered" for the whole conversation, so a Yes to the English row's question also let the
// Russian row through while the same answer said "No, keep it" to that one.
test('🔒 D34: a yes to one of Tracy’s questions unlocks its own call only — the No beside it keeps that one shut', () => {
  const m = createCallMemory({ now: () => 1 })
  const [en, ru, de] = [
    'content_delete {"id":"en"}',
    'content_delete {"id":"ru"}',
    'content_delete {"id":"de"}'
  ]
  for (const k of [en, ru, de]) m.confirmAsked('s', k)
  const qEn = confirmQuestion(en, 'x').questions[0]
  const qRu = confirmQuestion(ru, 'y').questions[0]
  m.customerAnswered(
    's',
    { questions: [qEn, qRu] },
    {
      answers: [
        { id: qEn.id, selected: ['Yes, go ahead'] },
        { id: qRu.id, selected: ['No, keep it'] }
      ]
    }
  )
  assert.equal(m.confirmed('s', en), true, 'its own question said yes')
  assert.equal(m.confirmed('s', ru), false, 'its own question said no')
  assert.equal(m.confirmed('s', de), false, 'not asked in this answer, and the answer asked nothing else')
  // The yes is spent by the call it allowed.
  assert.equal(m.confirmed('s', en), false)
})

/**
 * 🔒 E5.e4 (dev e2e 04/10/2026): A `confirm-…` ID TRACY NEVER WROTE IS REFUSED BEFORE THE CUSTOMER
 * SEES IT. The agent copied the refusal's question in its own words but named it `confirm-delete`;
 * the customer pressed "Yes, go ahead", and that answer opened nothing — the delete was refused three
 * more times and the article stayed online. The card is now stopped before it is shown, naming the
 * question the refused call is waiting for, so the customer is asked once and the yes counts.
 */
test('🔒 E5.e4: a card with a confirm- id Tracy never wrote is refused before it is shown, naming the waiting question', () => {
  const m = createCallMemory()
  const call = { tool: 'content_delete', arguments: { collection: 'posts', id: '01J', locale: 'en' } }
  const id = confirmQuestionId(callKeyOf(call))
  const forged = {
    questions: [
      {
        id: 'confirm-delete',
        header: 'Confirm',
        question: 'This removes the English version only. Go ahead?',
        options: [{ label: 'Yes, go ahead' }, { label: 'No, keep it' }]
      }
    ]
  }
  // No refused call waits: the id is still Tracy's to give, and the reason says to pick another.
  const idle = m.confirmCardRefusal('s', forged)
  assert.match(String(idle), /"confirm-delete"/)
  assert.match(String(idle), /does not start with "confirm-"/)
  m.confirmAsked('s', call)
  const waiting = m.confirmCardRefusal('s', forged)
  assert.match(String(waiting), /"confirm-delete"/)
  assert.ok(String(waiting).includes(`"${id}"`), 'names the question the refused call waits for')
  assert.match(String(waiting), /content_delete/)
  // The refusal's own ask passes, in any words, as long as the id is the one Tracy wrote.
  const own = confirmQuestion(callKeyOf(call), 'x')
  assert.equal(m.confirmCardRefusal('s', own), null)
  assert.equal(
    m.confirmCardRefusal('s', {
      questions: [
        {
          ...own.questions[0],
          question: 'Xoá bản tiếng Anh?',
          options: [{ label: 'Có' }, { label: 'Không' }]
        }
      ]
    }),
    null
  )
  // A question the agent wrote with its own id, beside or without Tracy's, is the agent's business.
  assert.equal(
    m.confirmCardRefusal('s', { questions: [{ id: 'which-page', question: 'Which page?' }] }),
    null
  )
  assert.equal(m.confirmCardRefusal('s', { questions: [own.questions[0], { id: 'which-page' }] }), null)
  assert.equal(m.confirmCardRefusal('s', {}), null)
  assert.equal(m.confirmCardRefusal('s', null), null)
  // Another conversation's waiting call is not offered here.
  assert.doesNotMatch(String(m.confirmCardRefusal('other', forged)), new RegExp(id))
  // Answered with Tracy's id, the call goes through once — the e2e's delete.
  m.customerAnswered('s', own, { answers: [{ id, selected: ['Yes, go ahead'] }] })
  assert.equal(m.confirmed('s', { ...call, confirm: true }), true)
  // Spent: nothing waits any more, and a forged id is told to pick another.
  assert.match(String(m.confirmCardRefusal('s', forged)), /does not start with "confirm-"/)
})

test('🔒 D34: a No to Tracy’s question holds against every other answer until that call is refused again', () => {
  const m = createCallMemory({ now: () => 1 })
  const del = 'content_delete {"id":"en"}'
  m.confirmAsked('s', del)
  const q = confirmQuestion(del, 'x').questions[0]
  // The customer keeps the entry, and in the same card answers a question the agent wrote itself.
  m.customerAnswered(
    's',
    { questions: [q, { id: 'which', question: 'Which page next?', options: [{ label: 'Home' }] }] },
    {
      answers: [
        { id: q.id, selected: ['No, keep it'] },
        { id: 'which', selected: ['Home'] }
      ]
    }
  )
  assert.equal(m.confirmed('s', del), false, 'the answer beside it is not a yes to this call')
  m.customerAnswered('s') // another question the agent wrote
  m.newTurn('s') // "thanks" — any new message
  assert.equal(m.confirmed('s', del), false, 'the No was the customer’s last word on this call')
  // Refused again, the call starts over — and waits for its OWN question again (D34.4): a bare new
  // message is not an answer to a question nobody asked.
  m.confirmAsked('s', del)
  assert.equal(m.confirmed('s', del), false)
  m.newTurn('s')
  assert.equal(m.confirmed('s', del), false)
  m.customerAnswered('s', { questions: [q] }, { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] })
  assert.equal(m.confirmed('s', del), true)
})

test('typedRefusal: a reply that OPENS with a refusal, in the customers’ languages — and only that', () => {
  const refuses = [
    'No, keep it',
    'no',
    'Nope.',
    "Don't delete it",
    'Keep it please',
    'Cancel that',
    'Thôi, đừng xoá',
    'Không, giữ lại',
    'không',
    'ko xoá nhé',
    'Đừng xoá trang đó',
    'Giữ nguyên nhé',
    'khong, giu lai',
    'Нет, оставь',
    'не удаляй',
    '不要删',
    '别删了',
    '算了',
    '  “No” — leave it'
  ]
  const answers = [
    'Yes, go ahead',
    'Có, xoá đi',
    'Ừ xoá',
    'Mình xác nhận yêu cầu vừa rồi, cứ làm đúng như vậy, không thêm gì khác.',
    'No problem, delete it',
    'Không sao, xoá đi',
    'Không cần hỏi lại, xoá luôn',
    'Nothing else, just delete it',
    'Note: delete the old post',
    'Да, удаляй',
    'Нет проблем, удаляй',
    '不用问了，删吧',
    '删吧',
    'Also change the title',
    '',
    undefined
  ]
  for (const t of refuses) assert.equal(typedRefusal(t), true, `refuses: ${t}`)
  for (const t of answers) assert.equal(typedRefusal(t), false, `not a refusal: ${t}`)
})

test('🔒 D34: a typed message that opens with a refusal keeps every waiting call shut; a later go-ahead opens it once it was refused again', () => {
  const m = createCallMemory({ now: () => 1 })
  const del = 'content_delete {"id":"x"}'
  m.confirmAsked('s', del)
  // The agent asked in prose; the customer types "thôi, đừng xoá" (28/09: this used to open it).
  m.newTurn('s', 'Thôi, đừng xoá nhé')
  assert.equal(m.confirmed('s', del), false, 'a typed refusal is a No')
  m.newTurn('s', 'Cảm ơn')
  assert.equal(m.confirmed('s', del), false, 'the No holds until the call is refused again')
  m.confirmAsked('s', del)
  m.newTurn('s', 'Ừ, xoá đi')
  assert.equal(m.confirmed('s', del), false, 'the call’s own question is the way through (D34.4)')
  const q = confirmQuestion(del, 'x').questions[0]
  m.customerAnswered('s', { questions: [q] }, { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] })
  assert.equal(m.confirmed('s', del), true)
  // A refusal carrying no question of Tracy's reads a bare new message as an answer, as before.
  m.confirmAsked('s', del, false)
  m.newTurn('s')
  assert.equal(m.confirmed('s', del), true)
})

/**
 * 🔒 D34.3 (28/09/2026): THE CUSTOMER'S LATEST WORD WINS. `confirmed` deletes the record the moment
 * the call it allowed runs, so a go-ahead still on the books is one NOTHING has used: the customer
 * clicked Yes and then wrote "No, wait — don't delete it" before the agent's call landed. Keeping
 * that yes ran the delete on words that had already withdrawn it.
 */
test('🔒 D34.3: a typed refusal overrides a go-ahead the agent has not spent yet', () => {
  const m = createCallMemory({ now: () => 1 })
  const del = 'content_delete {"id":"x"}'
  m.confirmAsked('s', del)
  const q = confirmQuestion(del, 'x').questions[0]
  m.customerAnswered('s', { questions: [q] }, { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] })
  // Before the agent's delete lands, the customer writes back.
  m.newTurn('s', 'No, wait — don’t delete it')
  assert.equal(m.confirmed('s', del), false, 'the yes was withdrawn before anything used it')
  // A go-ahead already spent is not reopened by anything: the record is gone.
  m.confirmAsked('s', del)
  m.customerAnswered('s', { questions: [q] }, { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] })
  assert.equal(m.confirmed('s', del), true)
  m.newTurn('s', 'Không, giữ lại')
  assert.equal(m.confirmed('s', del), false)
})

/**
 * 🔒 F3.1 (28/09/2026): `declinedCount` lets a caller holding an agreement of its own see that a No
 * has landed WITHOUT a new turn — an `ask_user_question` answer is not a new message, and the group
 * agreement of a multilingual delete (`emdash-call.mjs`) outlived it.
 */
test('🔒 F3.1: declinedCount counts every refusal, card answer or typed message', () => {
  const m = createCallMemory({ now: () => 1 })
  assert.equal(m.declinedCount('s'), 0)
  assert.equal(m.declinedCount(undefined), 0, 'no conversation, nothing counted')
  const del = 'content_delete {"id":"ru"}'
  m.confirmAsked('s', del)
  const q = confirmQuestion(del, 'x').questions[0]
  m.customerAnswered('s', { questions: [q] }, { answers: [{ id: q.id, selected: ['No, keep it'] }] })
  assert.equal(m.declinedCount('s'), 1, 'No to Tracy’s own question')
  m.customerAnswered(
    's',
    { questions: [{ id: 'agent-q', question: 'Delete it?', options: [{ label: 'Yes' }, { label: 'No' }] }] },
    { answers: [{ id: 'agent-q', selected: ['No'] }] }
  )
  assert.equal(m.declinedCount('s'), 2, 'No on a question the agent wrote')
  m.newTurn('s', 'Không, giữ bản tiếng Nga')
  assert.equal(m.declinedCount('s'), 3, 'a typed refusal')
  m.newTurn('s', 'Cảm ơn')
  assert.equal(m.declinedCount('s'), 3, 'an ordinary message counts nothing')
})

test('🔒 D34: "No" on a question the agent wrote keeps waiting calls shut; a Yes to Tracy’s own question in the same card still counts', () => {
  const m = createCallMemory({ now: () => 1 })
  const a = 'content_delete {"id":"a"}'
  const b = 'content_delete {"id":"b"}'
  m.confirmAsked('s', a)
  m.confirmAsked('s', b)
  const qa = confirmQuestion(a, 'x').questions[0]
  const own = {
    id: 'agent-q',
    question: 'Delete the old page too?',
    options: [{ label: 'Yes' }, { label: 'No' }]
  }
  const args = { questions: [qa, own] }
  const value = {
    answers: [
      { id: qa.id, selected: ['Yes, go ahead'] },
      { id: 'agent-q', selected: ['No'] }
    ]
  }
  assert.equal(openAnswerRefuses(args, value), true)
  m.customerAnswered('s', args, value)
  assert.equal(m.confirmed('s', a), true, 'its own question said yes')
  assert.equal(m.confirmed('s', b), false, 'the agent’s question was answered No')
  // A go-ahead on the agent's own question opens a refusal that carries no question of Tracy's
  // (D34.4); `b` has one, and waits for it.
  m.confirmAsked('s', b)
  m.customerAnswered('s', { questions: [own] }, { answers: [{ id: 'agent-q', selected: ['Yes'] }] })
  assert.equal(m.confirmed('s', b), false)
  m.confirmAsked('s', 'pending-draft', false)
  m.customerAnswered('s', { questions: [own] }, { answers: [{ id: 'agent-q', selected: ['Yes'] }] })
  assert.equal(m.confirmed('s', 'pending-draft'), true)
  // Words typed into the agent's question count the same way — and refuse.
  m.confirmAsked('s', 'pending-draft', false)
  m.customerAnswered(
    's',
    { questions: [own] },
    { answers: [{ id: 'agent-q', selected: [], custom: 'không, giữ lại' }] }
  )
  assert.equal(m.confirmed('s', 'pending-draft'), false)
})

/**
 * 🔒 D34.2 (28/09/2026): THE OPTION ORDER ALONE IS NOT THE ANSWER. The agent writes the words and
 * sends the card, so an agent that put "No, keep it" first turned the customer's No into a go-ahead.
 */
test('🔒 D34.2: a first option that READS as a refusal agrees to nothing', () => {
  const key = 'content_delete {"id":"x"}'
  const id = confirmQuestionId(key)
  const flipped = {
    questions: [
      {
        id,
        question: 'Delete it? Go ahead?',
        options: [{ label: 'Không, giữ lại' }, { label: 'Có, xoá đi' }]
      }
    ]
  }
  assert.deepEqual(answerVerdict(flipped, { answers: [{ id, selected: ['Không, giữ lại'] }] }), {
    agreed: [],
    declined: [id],
    open: false
  })
  // Translated, in the right order, it still agrees.
  const right = {
    questions: [{ id, question: 'Xoá nhé?', options: [{ label: 'Có, xoá đi' }, { label: 'Không, giữ lại' }] }]
  }
  assert.deepEqual(answerVerdict(right, { answers: [{ id, selected: ['Có, xoá đi'] }] }), {
    agreed: [id],
    declined: [],
    open: false
  })
  const m = createCallMemory({ now: () => 1 })
  m.confirmAsked('s', key)
  m.customerAnswered('s', flipped, { answers: [{ id, selected: ['Không, giữ lại'] }] })
  assert.equal(m.confirmed('s', key), false, 'the customer refused, whatever the order said')
})

test('callKeyOf: key order and confirm do not change the key', () => {
  assert.equal(callKeyOf({ b: 1, a: { d: 2, c: 3 }, confirm: true }), callKeyOf({ a: { c: 3, d: 2 }, b: 1 }))
  assert.equal(callKeyOf('as-is'), 'as-is')
})

test('LRU: the oldest conversation goes first when the cap is reached', () => {
  const m = createCallMemory({ maxSessions: 2 })
  m.rememberRead('s1', { kind: 'post', id: 1, chars: 10 })
  m.rememberRead('s2', { kind: 'post', id: 2, chars: 10 })
  m.readOf('s1', { id: 1 }) // s1 is used again: s2 is now the oldest
  m.rememberRead('s3', { kind: 'post', id: 3, chars: 10 })
  assert.equal(m.readOf('s1', { id: 1 })?.chars, 10)
  assert.equal(m.readOf('s2', { id: 2 }), null)
})

test('🔒 a call with no conversation remembers nothing, is remembered by nothing, and never shares an apply id', () => {
  let n = 0
  const m = createCallMemory({ now: () => 1_000, random: () => (n++).toString(16).padStart(6, '0') })
  for (const none of [null, undefined, '']) {
    // Reads: the body guard's baseline is never a stranger's read.
    m.rememberRead(none, { kind: 'post', id: 42, title: 'Home', chars: 26_884 })
    assert.equal(m.readOf(none, { id: 42 }), null)
    // Receipts: nothing to list, nothing to undo — and nothing pooled with another no-session call.
    m.rememberWrite(none, 'site-a', { applyId: 'wp-shared', ok: true })
    // P12: `missing` (E3.3) is a fact about the SITE, told to every call; `lastRevision` (CC-12) is
    // a conversation's, so a nameless call has none.
    assert.deepEqual(m.factsFor(none, 'site-a'), {
      applyIds: [],
      okIds: [],
      unknownIds: [],
      idMap: {},
      postsRead: [],
      missing: [],
      lastRevision: null
    })
    // Confirmations: the model's own `confirm` is never the customer's word.
    m.confirmAsked(none, 'content_delete {"id":"x"}')
    m.customerAnswered(none)
    assert.equal(m.confirmed(none, 'content_delete {"id":"x"}'), false)
    assert.equal(m.newTurn(none), 0)
    assert.equal(m.turnOf(none), 0)
  }
  // A fresh WordPress id per call: one apply.revert can never undo two unrelated conversations.
  const ids = new Set([m.wpApplyId(null, 'site-a'), m.wpApplyId(null, 'site-a'), m.wpApplyId('', 'site-a')])
  assert.equal(ids.size, 3)
  // A named conversation is untouched by all of the above.
  assert.equal(m.readOf('session-a', { id: 42 }), null)
  m.rememberRead('session-a', { kind: 'post', id: 42, chars: 10 })
  assert.equal(m.readOf('session-a', { id: 42 })?.chars, 10)
  const [a, b] = [m.wpApplyId('session-a', 'site-a'), m.wpApplyId('session-a', 'site-a')]
  assert.equal(a.slice(0, -2), b.slice(0, -2), "a named conversation's turn keeps its stem")
})

// ── P12 (PR2): E3.2 refused calls, E3.3 dead roads, E2.2 counting, CC-12 revisions ─────────────────

test('🔒 E3.2: only refusals the same arguments always get are kept — never a transient, a session or a state one', () => {
  for (const code of MEMOISED_CODES) {
    const refusal = code === 'BODY_SHRINK' ? { ok: false, code, read: true } : { ok: false, code }
    assert.equal(memoisableRefusal(refusal), true, code)
  }
  // The component's own codes arrive on `error` (D24).
  assert.equal(
    memoisableRefusal({ ok: false, error: 'bad_params', message: 'kind must be one of: post' }),
    true
  )
  for (const refusal of [
    { ok: false, code: 'COMPONENT_UNREACHABLE' },
    { ok: false, code: 'COWORK_WEB_UNREACHABLE' },
    { ok: false, code: 'SITE_UNREACHABLE' },
    { ok: false, code: 'NOT_MCP' },
    { ok: false, code: 'SITE_REFUSED', httpStatus: 502 },
    { ok: false, code: 'NOT_SIGNED_IN', httpStatus: 401 },
    { ok: false, code: 'NO_VIEWER' },
    { ok: false, code: 'NO_TOKEN' },
    { ok: false, code: 'INSPECT_FIRST' },
    { ok: false, code: 'CONFIRM_FIRST' },
    { ok: false, code: 'OUTCOME_UNKNOWN' },
    { ok: false, code: 'SITE_BUSY', httpStatus: 409 },
    { ok: false, error: 'writer_busy', message: 'another writer is changing this site' },
    { ok: false, error: 'contract_failed', message: 'Content changed; inspect again' },
    { ok: false, error: 'conflict', message: 'A language job is in flight' },
    // A shape code with a 5xx, and a BODY_SHRINK that asked for a read first, are not deterministic.
    { ok: false, code: 'bad_params', httpStatus: 500 },
    { ok: false, code: 'BODY_SHRINK', read: false },
    { ok: false, code: 'BODY_SHRINK', read: true, theme: 'unread' },
    { ok: true }
  ])
    assert.equal(memoisableRefusal(refusal), false, JSON.stringify(refusal))
  // EmDash: validation and a CONFLICT (its arguments carry the stale _rev) are kept; NOT_FOUND is not.
  assert.equal(memoisableRefusal({ ok: false, code: 'TOOL_FAILED', emdash: 'CONFLICT' }), true)
  assert.equal(
    memoisableRefusal({ ok: false, code: 'TOOL_FAILED', error: 'MCP error -32602: Input validation error' }),
    true
  )
  assert.equal(memoisableRefusal({ ok: false, code: 'TOOL_FAILED', emdash: 'NOT_FOUND' }), false)
  // Whatever the code, a next that asks for the same call again is never blocked by the memo.
  assert.equal(
    memoisableRefusal({ ok: false, code: 'bad_params', next: 'Retry once in a few seconds.' }),
    false
  )
})

test('🔒 E3.2 consistency: no kept refusal of the r2 corpus has a next that asks for the identical call again', () => {
  // Plan v2.1 D28: the first E3.2 blocked the very re-send the texts prescribe. These are the ways
  // Tracy's nexts ask for the SAME call again — each of the four transient nexts matches it below.
  // "Same call WITH kind added" is another call, and so is the language job's own "repeat the same
  // call until status is completed" in `LEGACY_STRUCTURE_CODE`'s next (a multilingual.retire, not the write).
  const resend = /\bretry\b|\b(?:same|identical) call (?:once more|again)\b/i
  for (const refusal of [
    { ok: false, code: 'COMPONENT_UNREACHABLE' },
    { ok: false, code: 'NOT_SIGNED_IN', httpStatus: 401 },
    { ok: false, code: 'NO_TOKEN' },
    { ok: false, error: 'writer_busy', message: 'another writer is changing this site' }
  ])
    assert.match(
      String(/** @type {any} */ (withNext(refusal, { platform: 'joomla' })).next),
      resend,
      refusal.code ?? refusal.error
    )
  const corpus = JSON.parse(
    readFileSync(new URL('./fixtures/refusal-corpus-r2.json', import.meta.url), 'utf8')
  )
  let kept = 0
  for (const group of corpus.groups) {
    const platform = group.site.startsWith('wp-')
      ? 'wordpress'
      : group.site.startsWith('j-')
        ? 'joomla'
        : 'emdash'
    const answer = /** @type {any} */ (withNext(group.answer, { platform, action: group.args?.action }))
    if (!memoisableRefusal(answer)) continue
    kept += 1
    assert.doesNotMatch(String(answer.next ?? ''), resend, `${group.code}: ${answer.next}`)
  }
  assert.ok(kept >= 8, `the corpus exercises the kept codes (${kept})`)
})

test('🔒 E3.2 consistency: a kept next that asks for "the same call with …" names only what the repeat key sees', () => {
  // Why the resend rule above is narrower than the plan's ("same call" OR "retry"): "Same call with
  // apply_id", "Same call with kind added" and `LEGACY_STRUCTURE_CODE`'s "repeat the same call until status is
  // completed" each ask for ANOTHER call, and the plan's rule would never keep `LEGACY_STRUCTURE_CODE` at all.
  // What that needs instead is that the change they ask for shows in the key (review, 25/09): the
  // key leaves out `confirm` and the ids Tracy made (`meta.mintedIds`), so no kept next may ask for
  // one of those.
  const blind = /\b(?:confirm|request_id)\b/
  const clause = /\b(?:same|identical) call\b[^.]*/gi
  /** @type {Array<[Record<string, unknown>, { platform: string, action?: string }]>} */
  const refusals = []
  const component = [
    'apply_id required',
    'kind must be one of: post, templatePart, option, postmeta, term',
    'kind must be one of: article, module, menuItem, category',
    'id or key required',
    'fields required',
    'id required',
    'table required',
    'an mlang- apply_id and a request_id are required',
    'something the table does not name'
  ]
  for (const platform of ['wordpress', 'joomla'])
    for (const action of [
      'content.update',
      'content.get',
      'content.list',
      'content.contract',
      'apply.revert'
    ])
      for (const message of component)
        refusals.push([
          { ok: false, error: 'bad_params', message },
          { platform, action }
        ])
  for (const message of [
    LEGACY_BOUND_MESSAGE,
    'Media uploads must use a separate apply receipt',
    'Use a new content-addressed image in images/tracy-content',
    'Only content-contract applies can be reverted in this mode',
    'Later content exists; revert the latest revision first'
  ])
    refusals.push([{ ok: false, error: LEGACY_STRUCTURE_CODE, message }, { platform: 'joomla' }])
  refusals.push(
    [
      { ok: false, code: 'UNKNOWN_PARAM', given: ['search'], allowed: ['kind', 'limit'] },
      { platform: 'wordpress', action: 'content.list' }
    ],
    [
      { ok: false, code: 'ADDRESS_MISSING', needs: 'apply_id' },
      { platform: 'wordpress', action: 'apply.revert' }
    ],
    [
      { ok: false, code: 'ADDRESS_MISSING', needs: 'id and lang' },
      { platform: 'wordpress', action: 'content.language' }
    ],
    [{ ok: false, code: 'NOT_ON_THIS_PLATFORM', what: 'content.contract' }, { platform: 'wordpress' }],
    [
      { ok: false, code: 'BODY_SHRINK', read: true, kind: 'post', id: 42 },
      { platform: 'wordpress', action: 'content.update' }
    ]
  )
  const corpus = JSON.parse(
    readFileSync(new URL('./fixtures/refusal-corpus-r2.json', import.meta.url), 'utf8')
  )
  for (const group of corpus.groups)
    refusals.push([
      group.answer,
      {
        platform: group.site.startsWith('wp-')
          ? 'wordpress'
          : group.site.startsWith('j-')
            ? 'joomla'
            : 'emdash',
        action: group.args?.action
      }
    ])
  let asked = 0
  for (const [refusal, facts] of refusals) {
    const answer = /** @type {any} */ (withNext(refusal, facts))
    if (!memoisableRefusal(answer)) continue
    for (const found of String(answer.next ?? '').match(clause) ?? []) {
      asked += 1
      assert.doesNotMatch(found, blind, `${answer.code ?? answer.error}: ${answer.next}`)
    }
  }
  assert.ok(asked >= 5, `kept nexts that ask for another call were checked (${asked})`)
})

test('E3.2: a kept refusal answers only the identical call, in the same turn, with nothing changed on the site', () => {
  const m = createCallMemory()
  const call = { action: 'content.list', params: { kind: 'post', search: 'x' } }
  const key = sameCallKey('tracy_site', call)
  // Key order and `confirm` never make two calls of one.
  assert.equal(
    key,
    sameCallKey('tracy_site', { params: { search: 'x', kind: 'post' }, action: 'content.list' })
  )
  assert.notEqual(key, sameCallKey('tracy_emdash', call))
  const refusal = withNext(
    { ok: false, code: 'UNKNOWN_PARAM', error: '"search" is not a parameter' },
    { platform: 'wordpress' }
  )
  assert.equal(m.rememberRefused('s1', 'site-a', key, refusal), true)
  const hit = m.refusedBefore('s1', 'site-a', key)
  assert.equal(hit?.code, 'UNKNOWN_PARAM')
  assert.equal(hit?.next, /** @type {any} */ (refusal).next)
  assert.equal(m.refusedBefore('s2', 'site-a', key), null, 'another conversation')
  assert.equal(m.refusedBefore('s1', 'site-b', key), null, 'another site')
  assert.equal(m.refusedBefore(null, 'site-a', key), null, 'no conversation, no memory')
  m.invalidateSite('site-a')
  assert.equal(m.refusedBefore('s1', 'site-a', key), null, 'a write to the site ends it')
  m.rememberRefused('s1', 'site-a', key, refusal)
  m.newTurn('s1')
  assert.equal(m.refusedBefore('s1', 'site-a', key), null, 'the customer spoke')
  assert.equal(m.rememberRefused('s1', 'site-a', key, { ok: false, code: 'NO_VIEWER' }), false)
  // The answer that stands in for the repeat: the earlier code, its own next, nothing sent.
  const same = sameCallRefused(
    { code: 'UNKNOWN_PARAM', error: 'x', next: 'page.text {path, match}' },
    { action: 'content.list' }
  )
  assert.deepEqual(
    [same.ok, same.code, same.refused, same.next, same.action],
    [false, 'SAME_CALL_REFUSED', 'UNKNOWN_PARAM', 'page.text {path, match}', 'content.list']
  )
  assert.ok(same.error.length <= 160)
  assert.equal('next' in sameCallRefused({ code: 'X', error: '', next: null }, { tool: 'menu_get' }), false)
})

test('🔒 E3.3: a dead road is a fact about the site for one hour; a component change forgets it', () => {
  let t = 0
  const m = createCallMemory({ now: () => t })
  m.learn('site-a', 'missing', 'core.manifest', {
    ok: false,
    error: 'bad_action',
    message: 'unknown action: core.manifest'
  })
  m.learn('site-a', 'contractBound')
  assert.deepEqual(m.learned('site-a'), {
    missing: ['core.manifest'],
    contractBound: true,
    noContentRevisions: false,
    noListSearch: false
  })
  assert.deepEqual(
    m.learned('site-b'),
    { missing: [], contractBound: false, noContentRevisions: false, noListSearch: false },
    'per site'
  )
  assert.equal(m.deadRoad('site-a', 'core.manifest')?.error, 'bad_action')
  // Every conversation on the site is told, a nameless one included.
  assert.deepEqual(m.factsFor('s9', 'site-a').missing, ['core.manifest'])
  assert.deepEqual(m.factsFor(null, 'site-a').missing, ['core.manifest'])
  t = 3_599_999
  assert.equal(m.learned('site-a').contractBound, true)
  t = 3_600_000
  assert.deepEqual(
    m.learned('site-a'),
    { missing: [], contractBound: false, noContentRevisions: false, noListSearch: false },
    'an hour later it is asked again'
  )
  assert.equal(m.deadRoad('site-a', 'core.manifest'), null)
  m.learn('site-a', 'missing', 'core.manifest')
  m.unlearn('site-a')
  assert.deepEqual(m.learned('site-a').missing, [])
  // D2: a Claude Cowork plugin that predates content revisions is learned the same way, and forgotten on upgrade.
  m.learn('site-a', 'noContentRevisions')
  assert.equal(m.learned('site-a').noContentRevisions, true)
  t += 3_600_000
  assert.equal(m.learned('site-a').noContentRevisions, false)
  m.learn('site-a', 'noContentRevisions')
  m.unlearn('site-a')
  assert.equal(m.learned('site-a').noContentRevisions, false)
})

test('🔒 list search: a site whose plugin ignored a search is told so for FIFTEEN minutes — the plugin updates itself, so the hour of the other dead roads is too long', () => {
  let t = 0
  const m = createCallMemory({ now: () => t })
  m.learn('site-a', 'noListSearch')
  assert.equal(m.learned('site-a').noListSearch, true)
  assert.equal(m.learned('site-b').noListSearch, false, 'per site')
  assert.deepEqual(
    m.learned('site-a'),
    { missing: [], contractBound: false, noContentRevisions: false, noListSearch: true },
    'no other flag is set with it'
  )
  t = 899_999
  assert.equal(m.learned('site-a').noListSearch, true)
  t = 900_000
  assert.equal(m.learned('site-a').noListSearch, false, 'fifteen minutes later the plugin is asked again')
  // The hour of the others is not shortened by it, nor is it lengthened to the hour.
  m.learn('site-a', 'contractBound')
  m.learn('site-a', 'noListSearch')
  t += 900_000
  assert.equal(m.learned('site-a').contractBound, true, 'the hour road stands')
  assert.equal(m.learned('site-a').noListSearch, false)
  // Learned again, then the component changed (`core.upgrade`, `extension.install`): forgotten at once.
  m.learn('site-a', 'noListSearch')
  m.unlearn('site-a')
  assert.equal(m.learned('site-a').noListSearch, false)
  // The wait is a parameter of the memory, like the hour.
  const quick = createCallMemory({ now: () => t, listSearchTtlMs: 1_000 })
  quick.learn('site-c', 'noListSearch')
  t += 999
  assert.equal(quick.learned('site-c').noListSearch, true)
  t += 1
  assert.equal(quick.learned('site-c').noListSearch, false)
})

test('round 7: failed reads of a site are counted in a row, per site, for ten minutes, until one answers', () => {
  let t = 0
  const m = createCallMemory({ now: () => t })
  // NOT E3.2's memo: a read that did not answer stays out of it, its own next asks for a retry
  assert.equal(memoisableRefusal({ ok: false, code: 'SITE_UNREACHABLE', next: 'once more if …' }), false)
  assert.equal(m.readFailed('site-a'), 1)
  assert.equal(m.readFailed('site-a'), 2)
  assert.equal(m.readFailed('site-b'), 1, 'per site')
  assert.equal(m.readFailed('site-a'), 3)
  m.readServed('site-a')
  assert.equal(m.readFailed('site-a'), 1, 'a read that answered ends the run')
  assert.equal(m.readFailed('site-b'), 2, 'and only for its own site')
  // a failure counts from the LAST one, not the first: a slow retry loop keeps its count
  t = 9 * 60_000
  assert.equal(m.readFailed('site-a'), 2)
  t += 9 * 60_000
  assert.equal(m.readFailed('site-a'), 3)
  t += 10 * 60_000
  assert.equal(m.readFailed('site-a'), 1, 'ten minutes after the last: a first again')
  // a call that names no site is one shared lane, as everywhere in this memory
  assert.equal(m.readFailed(''), 1)
  assert.equal(m.readFailed(null), 2)
})

test('E2.2: accepted WordPress writes are counted per apply id and record; a create counts under its new id', () => {
  const m = createCallMemory()
  assert.equal(wpRecordOf({ kind: 'post', id: 42 }), 'post|42')
  assert.equal(wpRecordOf({ kind: 'post', id: 0 }), null, 'a create names no record')
  assert.equal(
    wpRecordOf({ kind: 'templatePart', id: 80, key: 'header' }),
    'templatePart|header',
    'a part by its slug'
  )
  assert.equal(wpRecordOf({ kind: 'option', key: 'blogname' }), 'option|blogname')
  assert.equal(wpRecordOf({ kind: 'term', id: 5, key: 'category' }), 'term|5|category')
  assert.equal(wpRecordOf({ kind: 'article', id: 4 }), null)
  m.rememberWrite('s1', 'site-a', { applyId: 'wp-1', ok: true, record: 'post|42' })
  m.rememberWrite('s1', 'site-a', { applyId: 'wp-1', ok: true, record: 'post|42' })
  m.rememberWrite('s1', 'site-a', { applyId: 'wp-1', ok: false, record: 'post|42' })
  assert.equal(m.acceptedWrites('s1', 'site-a', 'wp-1', 'post|42'), 2, 'a refused write is not counted')
  assert.equal(m.acceptedWrites('s1', 'site-a', 'wp-2', 'post|42'), 0)
  assert.equal(m.acceptedWrites(null, 'site-a', 'wp-1', 'post|42'), null, 'no conversation, nothing to count')
})

test('CC-12: the revision a conversation read outlives the turn, is its own, and is forgotten on request', () => {
  const m = createCallMemory()
  m.rememberRevision('s1', 'site-a', 'r1')
  m.newTurn('s1')
  assert.equal(m.revisionOf('s1', 'site-a'), 'r1')
  assert.equal(m.factsFor('s1', 'site-a').lastRevision, 'r1')
  assert.equal(m.revisionOf('s2', 'site-a'), null)
  assert.equal(m.revisionOf('s1', 'site-b'), null)
  m.rememberRevision('s1', 'site-a', null)
  assert.equal(m.revisionOf('s1', 'site-a'), null)
})

// ── Content API v2: the revision of each content this conversation read (D1) ─────────────────────────

/** A v1 envelope as the relay answers it: one content, its slots in a block, an item and itself. */
const readOf = (over = {}) => ({
  schemaVersion: 'tracy-content/v1',
  protocol: {
    selected: 'tracy-content/v1',
    relayExtensions: [],
    cowork: { kind: 'joomla', capability: 'v1' }
  },
  contents: [
    {
      id: 'content_aaaa',
      revision: 'rev-a1',
      fields: [{ slotKey: 'menu-1.0' }],
      blocks: [
        {
          fields: [{ slotKey: 'module-1.0' }, { slotKey: null }],
          items: [{ fields: [{ slotKey: 'module-1.1' }] }]
        }
      ]
    },
    { id: 'content_bbbb', revision: 'rev-b1', blocks: [{ fields: [{ slotKey: 'module-2.0' }], items: [] }] }
  ],
  ...over
})

test('🔒 D1: a content.read teaches which content and revision each slot belongs to — per conversation', () => {
  const memory = createCallMemory()
  memory.rememberContentRevisions('s1', 'site', readOf())
  assert.deepEqual(memory.contentRevisionsFor('s1', 'site', ['module-1.0', 'module-1.1', 'menu-1.0']), {
    content_aaaa: 'rev-a1'
  })
  assert.deepEqual(memory.contentRevisionsFor('s1', 'site', ['module-1.0', 'module-2.0']), {
    content_aaaa: 'rev-a1',
    content_bbbb: 'rev-b1'
  })
  assert.equal(
    memory.contentRevisionsFor('s1', 'site', ['module-1.0', 'module-9.0']),
    null,
    'one unread slot → none'
  )
  assert.equal(
    memory.contentRevisionsFor('s2', 'site', ['module-1.0']),
    null,
    'another conversation read nothing'
  )
  assert.equal(memory.contentRevisionsFor('s1', 'other', ['module-1.0']), null)
  assert.equal(memory.contentRevisionsFor(null, 'site', ['module-1.0']), null)
  assert.equal(memory.contentRevisionsFor('s1', 'site', []), null)
})

test('D1: nothing is learned without a v1 cowork or a content revision', () => {
  const memory = createCallMemory()
  memory.rememberContentRevisions(
    's1',
    'site',
    readOf({ protocol: { cowork: { capability: 'unsupported' } } })
  )
  memory.rememberContentRevisions('s1', 'site', { ...readOf(), protocol: undefined })
  const noRevision = readOf()
  delete noRevision.contents[0].revision
  memory.rememberContentRevisions('s1', 'site', noRevision)
  assert.equal(memory.contentRevisionsFor('s1', 'site', ['module-1.0']), null)
  assert.deepEqual(memory.contentRevisionsFor('s1', 'site', ['module-2.0']), { content_bbbb: 'rev-b1' })
})

test('🔒 D1: a write to the site forgets every content revision; an apply receipt re-teaches only its contents', () => {
  const memory = createCallMemory()
  memory.rememberContentRevisions('s1', 'site', readOf())
  memory.invalidateSite('site')
  assert.equal(memory.contentRevisionsFor('s1', 'site', ['module-1.0']), null)
  memory.rememberContentRevisions('s1', 'site', readOf())
  memory.invalidateSite('site')
  memory.rememberAppliedRevisions('s1', 'site', { content_aaaa: 'rev-a2' })
  assert.deepEqual(memory.contentRevisionsFor('s1', 'site', ['module-1.0', 'menu-1.0']), {
    content_aaaa: 'rev-a2'
  })
  assert.equal(memory.contentRevisionsFor('s1', 'site', ['module-2.0']), null, 'b was not in the receipt')
})

test('D1: a read that left while a write landed is not kept (the generation captured before the send)', () => {
  const memory = createCallMemory()
  const before = memory.generationOf('site')
  memory.invalidateSite('site')
  memory.rememberContentRevisions('s1', 'site', readOf(), before)
  assert.equal(memory.contentRevisionsFor('s1', 'site', ['module-1.0']), null)
})

test('D6′ (c): a record this conversation created stays its own through later reads; a read record never becomes one', () => {
  const m = createCallMemory()
  m.rememberWritten('session-a', { kind: 'post', id: 2057, title: 'Autumn', chars: 1_465 }, { created: true })
  assert.equal(m.readOf('session-a', { id: 2057 })?.created, true)
  m.rememberRead('session-a', { kind: 'post', id: 2057, title: 'Autumn', chars: 1_465 })
  assert.equal(
    m.readOf('session-a', { id: 2057 })?.created,
    true,
    'reading it back keeps it the conversation’s own'
  )
  m.rememberRead('session-a', { kind: 'post', id: 42, title: 'Home', chars: 26_884 })
  m.rememberWritten('session-a', { kind: 'post', id: 42, title: 'Home', chars: 26_000 })
  assert.equal(m.readOf('session-a', { id: 42 })?.created, false, 'an edit of a read record is not a create')
  assert.equal(m.readOf('session-b', { id: 2057 }), null, 'another conversation created nothing')
})

test('🔒 W1 (b): shrinkRefused counts per conversation, site and record, for this turn only', () => {
  const m = createCallMemory({ now: () => 1_000 })
  const post = wpRecordOf({ kind: 'post', id: 69 })
  assert.equal(m.shrinkRefused('session-a', 'wp-1', post), 1)
  assert.equal(m.shrinkRefused('session-a', 'wp-1', post), 2, 'the second on the same record')
  assert.equal(
    m.shrinkRefused('session-a', 'wp-1', wpRecordOf({ kind: 'post', id: 70 })),
    1,
    'another record'
  )
  assert.equal(m.shrinkRefused('session-a', 'wp-2', post), 1, 'another site')
  assert.equal(m.shrinkRefused('session-b', 'wp-1', post), 1, 'another conversation')
  assert.equal(
    m.shrinkRefused('session-a', 'wp-1', wpRecordOf({ kind: 'templatePart', key: 'header' })),
    1,
    'a part by its key'
  )
  // The customer spoke: their new words are what a removes quotes, so the count starts again.
  m.newTurn('session-a')
  assert.equal(m.shrinkRefused('session-a', 'wp-1', post), 1)
  // Nothing to count: no conversation, or no record (a create).
  assert.equal(m.shrinkRefused(null, 'wp-1', post), 0)
  assert.equal(m.shrinkRefused('', 'wp-1', post), 0)
  assert.equal(m.shrinkRefused('session-a', 'wp-1', wpRecordOf({ kind: 'post', id: 0 })), 0)
})

// ADR 0034 (council 19/10/2026): the agent words the card in the customer's language; the door holds
// what may not change in it.
test('🔒 a card that leaves out what the door names — the record, the count, the amount — is refused before it is shown', () => {
  const m = createCallMemory()
  const key = 'tracy_site:content.replace:{"find":"Giá: 120.000đ"}'
  m.confirmAsked('s', key, true, ['120.000đ', '150.000đ'])
  const own = confirmQuestion(key, 'This changes a price on your site: 120.000đ → 150.000đ.')
  const card = (question) => ({ questions: [{ ...own.questions[0], question }] })

  const vague = m.confirmCardRefusal('s', card('Mình đổi giá sản phẩm nhé?'))
  const half = m.confirmCardRefusal('s', card('Đổi giá thành 150.000đ nhé?'))

  assert.match(String(vague), /must name "120\.000đ", "150\.000đ" as written/)
  assert.match(String(half), /must name "120\.000đ" as written/)
  assert.equal(m.confirmCardRefusal('s', card('Đổi giá từ 120.000đ thành 150.000đ nhé?')), null)
  assert.equal(m.confirmCardRefusal('s', own), null, "the refusal's own ask, in English, names both")
})

test('🔒 a yes holds five minutes: past it the same call asks again', () => {
  let t = 1_000
  const m = createCallMemory({ now: () => t })
  const key = 'tracy_site:look.set:{"scope":"site"}'
  const yes = (k) => {
    m.confirmAsked('s', k)
    const [q] = confirmQuestion(k, 'x').questions
    m.customerAnswered('s', { questions: [q] }, { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] })
  }

  yes(key)
  t += CONFIRM_TTL_MS - 1
  const inTime = m.confirmed('s', key)
  yes(key)
  t += CONFIRM_TTL_MS + 1
  const late = m.confirmed('s', key)

  // test-quality: contract council 19/10/2026 set five minutes; ADR 0034 states it
  assert.equal(CONFIRM_TTL_MS, 5 * 60_000)
  assert.equal(inTime, true)
  assert.equal(late, false)
  assert.equal(m.confirmed('s', key), false, 'the stale yes is gone, not kept for later')
})

// Live run 20/10/2026 (Voice, Joomla stand): the door's English card was read to a Vietnamese
// customer, whose spoken yes then matched no option.
test("🔒 the door's card still in English is stopped for a person who speaks another language; reworded, it passes", () => {
  const ask = confirmQuestion('tracy_site:content.delete:{"id":4}', 'This deletes something from your site.')
  const id = ask.questions[0].id

  const vi = untranslatedConfirmCard(ask, 'Vietnamese')
  const reworded = {
    questions: [
      {
        ...ask.questions[0],
        header: 'Xác nhận',
        question: 'Mình sẽ xoá bài "Yêu chính mình". Bạn đồng ý chứ?',
        options: [{ label: 'Đồng ý, xoá đi' }, { label: 'Không, giữ lại' }]
      }
    ]
  }
  // Live run 20/10/2026 (EmDash): the question and options in Vietnamese under an English "Confirm".
  const englishHeader = { questions: [{ ...reworded.questions[0], header: 'Confirm' }] }
  assert.match(String(untranslatedConfirmCard(englishHeader, 'Vietnamese')), /still in English/)

  assert.match(String(vi), new RegExp(`"${id}" is still in English`))
  assert.match(String(vi), /in Vietnamese, the language this conversation is in/)
  assert.equal(untranslatedConfirmCard(reworded, 'Vietnamese'), null)
  assert.equal(
    untranslatedConfirmCard(ask, 'English'),
    null,
    'an English conversation reads the door as written'
  )
  assert.equal(untranslatedConfirmCard(ask, ''), null, 'no language known yet: nothing is claimed')
  assert.equal(
    untranslatedConfirmCard(
      { questions: [{ id: 'which-page', question: 'Go ahead?', options: [{ label: 'Yes, go ahead' }] }] },
      'Vietnamese'
    ),
    null,
    "a question of the agent's own is its business"
  )
})

// #257: a write to the front page is labelled the home page (`x-tracy-write-front`), never by its title.
test('isFront: a WordPress post or page of the front page id this conversation found, and nothing else (#257)', () => {
  const memory = createCallMemory({ now: () => 1_000 })
  assert.equal(memory.isFront('s1', { kind: 'post', id: 42 }), false, 'nothing found yet')
  memory.rememberFront('s1', 42)
  assert.equal(memory.isFront('s1', { kind: 'post', id: 42 }), true)
  assert.equal(memory.isFront('s1', { kind: 'page', id: '42' }), true)
  assert.equal(memory.isFront('s1', { kind: 'post', id: 43 }), false)
  assert.equal(memory.isFront('s1', { kind: 'article', id: 42 }), false, 'a Joomla article is not it')
  assert.equal(memory.isFront('s2', { kind: 'post', id: 42 }), false, 'another conversation found none')
  memory.rememberFront('s1', 0)
  assert.equal(memory.isFront('s1', { kind: 'post', id: 42 }), true, 'a bad id changes nothing')
})
