/**
 * The site's write lease, waited out by the tool rather than handed to the customer
 * (acceptance v4, 30/09, `tasks/evidence/comment-people/e2e-v4/send.md` S09, SEND-v4-new-11).
 *
 *   node --test packages/tools/tracy-site-tools/test/lease-wait.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isLeaseBusy, LEASE_WAIT_MAX_MS, stillBusyNext, waitOutLease } from '../src/host/lease-wait.mjs'

const BUSY = {
  ok: false,
  httpStatus: 409,
  code: 'SITE_BUSY',
  holder: 'ceo@tracy.ai',
  holderIsYou: false,
  aheadOfYou: 0,
  freeInSeconds: 42,
  next: 'Tell the customer who is working on the site and what you were about to change. This conversation is next when they finish.'
}

/** A fake clock the sleeps move forward. */
function clock() {
  let t = 0
  const slept = []
  return {
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms)
      t += ms
    },
    slept
  }
}

test('a free site: one send, the answer untouched', async () => {
  const c = clock()
  let sends = 0
  const answer = await waitOutLease(async () => (sends++, { ok: true, id: 7 }), c)
  assert.deepEqual(answer, { ok: true, id: 7 })
  assert.equal(sends, 1)
  assert.deepEqual(c.slept, [])
})

test('held by a live conversation: waits and sends the same call again until it goes through', async () => {
  const c = clock()
  const answers = [BUSY, BUSY, { ok: true, id: 7 }]
  let sends = 0
  const answer = await waitOutLease(async () => answers[sends++], c)
  assert.equal(sends, 3)
  assert.deepEqual(c.slept, [3_000, 5_000])
  assert.deepEqual(answer, { ok: true, id: 7, waitedSeconds: 8 })
})

test('bounded: past the wait the refusal goes back, saying truthfully how long it waited — no count', async () => {
  const c = clock()
  let sends = 0
  const answer = await waitOutLease(async () => (sends++, BUSY), c)
  const total = c.slept.reduce((a, b) => a + b, 0)
  assert.equal(total, LEASE_WAIT_MAX_MS, 'waited exactly the bound')
  assert.ok(sends <= 14, `${sends} sends is a loop, not a wait`)
  assert.equal(answer.code, 'SITE_BUSY')
  assert.equal(answer.waitedSeconds, 100)
  assert.match(answer.next, /^You already waited 100 s and ceo@tracy\.ai is still writing to this site/)
  assert.doesNotMatch(
    answer.next,
    /is next when they finish|queued|\d+ (?:other )?(?:conversation|request)s?/
  )
  assert.match(answer.next, /Do not retry in a loop/)
})

test('a sleep that returns at once still ends the wait at the bound', async () => {
  let sends = 0
  const answer = await waitOutLease(async () => (sends++, BUSY), { sleep: async () => {}, now: () => 0 })
  assert.equal(answer.waitedSeconds, 100)
  assert.ok(sends <= 14, `${sends} sends`)
})

test('the holder is the same person: said so, without their address', () => {
  assert.match(
    stillBusyNext({ ...BUSY, holderIsYou: true }, 30),
    /another of the customer's own conversations/
  )
  assert.match(stillBusyNext({ ...BUSY, holder: undefined }, 30), /another conversation is still writing/)
})

test('only the lease refusal is waited on', () => {
  assert.equal(isLeaseBusy(BUSY), true)
  assert.equal(isLeaseBusy({ ok: false, code: 'writer_busy' }), false)
  assert.equal(isLeaseBusy({ ok: true, code: 'SITE_BUSY' }), false)
  assert.equal(isLeaseBusy(null), false)
})

// #1403 item 10: the line under the chat says the turn waits on another conversation.
test('the wait is marked once when the first refusal makes it wait, and unmarked when it ends, however it ends', async () => {
  for (const answers of [
    [BUSY, BUSY, { ok: true }],
    [BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY, BUSY]
  ]) {
    const c = clock()
    const marks = []
    let sends = 0
    await waitOutLease(async () => answers[Math.min(sends++, answers.length - 1)], {
      ...c,
      waiting: () => {
        marks.push('begin')
        return () => marks.push('end')
      }
    })
    assert.deepEqual(marks, ['begin', 'end'])
  }
  const c = clock()
  const marks = []
  await waitOutLease(async () => ({ ok: true }), {
    ...c,
    waiting: () => (marks.push('begin'), () => marks.push('end'))
  })
  assert.deepEqual(marks, [], 'a free site never waited')
  const thrown = clock()
  const ended = []
  let n = 0
  await assert.rejects(
    waitOutLease(
      async () => {
        if (n++ === 0) return BUSY
        throw new Error('door down')
      },
      { ...thrown, waiting: () => () => ended.push('end') }
    )
  )
  assert.deepEqual(ended, ['end'], 'a send that throws still ends the wait')
})

// ── review C2 (19/10/2026): the customer's Stop ends the wait; nothing more is sent ─────────────────

test('🔒 C2: a turn stopped before the first send sends nothing', async () => {
  const stop = new AbortController()
  stop.abort()
  let sends = 0
  const answer = await waitOutLease(async () => (sends++, { ok: true }), { ...clock(), signal: stop.signal })
  assert.equal(sends, 0)
  assert.equal(answer.code, 'TURN_STOPPED')
})

test('🔒 C2: Stop while the wait pauses ends the pause at once, and the same call is not sent again', async () => {
  const stop = new AbortController()
  let sends = 0
  /** A pause that only ends when the turn stops: a real one would run out its seconds. */
  const sleep = () => new Promise(() => {})
  const marks = []
  const waiting = waitOutLease(async () => (sends++, BUSY), {
    sleep,
    signal: stop.signal,
    waiting: () => (marks.push('begin'), () => marks.push('end'))
  })
  await new Promise((resolve) => setImmediate(resolve))
  stop.abort()
  const answer = await waiting
  assert.equal(sends, 1, 'the refused send only')
  assert.equal(answer.code, 'TURN_STOPPED')
  assert.equal(answer.ok, false)
  assert.deepEqual(marks, ['begin', 'end'], 'the line under the chat stops saying it waits')
})

// ── review C1 (19/10/2026): the pause is spent outside the site's flight ─────────────────────────────

test('🔒 C1: each pause leaves the flight first and queues for it again before the next send', async () => {
  const c = clock()
  const order = []
  const answers = [BUSY, BUSY, { ok: true }]
  let sends = 0
  await waitOutLease(async () => (order.push(`send ${sends}`), answers[sends++]), {
    ...c,
    sleep: async (ms) => {
      order.push(`pause ${ms}`)
      await c.sleep(ms)
    },
    leave: () => order.push('leave'),
    rejoin: async () => void order.push('rejoin')
  })
  assert.deepEqual(order, [
    'send 0',
    'leave',
    'pause 3000',
    'rejoin',
    'send 1',
    'leave',
    'pause 5000',
    'rejoin',
    'send 2'
  ])
})
