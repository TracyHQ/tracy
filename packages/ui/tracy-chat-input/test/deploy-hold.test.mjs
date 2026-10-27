/**
 * The line under the queue while a Tracy update holds a message, and after it (#517). Seen 28/09 on
 * dev (`qaem643`): two messages sent during an update showed nothing for ten minutes each, then
 * never ran, and nothing said either.
 *
 * Pinned here: what the host half's answer means on screen (four states, never one dressed as
 * another), when the page keeps asking, that a late or failed answer never replaces a newer one,
 * that the door is called under the page's own mount, and the line rendered from the real component
 * in English and Vietnamese. The render half bundles the component with esbuild (this plugin's
 * devDependency) and renders it with `react-dom/server`, resolved from `@tracy/core`, which
 * declares it — the same way `tracy-my-sites`' mail test does.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ACK_TIMEOUT_MS,
  ACK_TRIES,
  ackHeld,
  HELD_POLL_MS,
  earlierNoticeKey,
  heldNoticeKey,
  drawnNotices,
  noticeAcker,
  parseHeld,
  READ_TIMEOUT_MS,
  readHeld,
  shouldPoll,
  watchHeld
} from '../src/client/held-notice.mjs'
import { en } from '../src/client/strings.ts'
// The host half that answers the door, for the one flow only both halves together can show.

/** The page's one read of `/api/ui`, shared by every bundle copy (`@tracy/core/ui-switches`). */
const PAGE_READ = Symbol.for('@tracy/core/ui-switches#page-read')
import { HELD_FILE, heldPrompts } from '../../../tools/tracy-site-tools/src/host/deploy-hold.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const viFile = path.resolve(pkgRoot, '..', '..', 'locale', 'tracy-locale-vi', 'vi', 'tracy-chat-input.json')
const require = createRequire(import.meta.url)

/** The door's answer exactly as `index.ts` writes it: a message of this conversation held now. */
const doorAnswer = (over = {}) => ({
  ok: true,
  draining: true,
  state: 'held',
  count: 1,
  recorded: true,
  settled: false,
  id: null,
  earlier: [],
  ...over
})
/** What `parseHeld` makes of a door answer. */
const parsed = ({ ok: _ok, ...answer }) => answer

test('the six notices, and nothing for a released or unheld conversation', () => {
  const at = (state, over = {}) =>
    heldNoticeKey({ state, count: 0, recorded: false, queued: 0, running: false, ...over })
  assert.equal(at('held', { count: 1, recorded: true }), 'held.waiting')
  assert.equal(at('held', { count: 1, recorded: true, running: true }), 'held.waiting')
  assert.equal(at('held', { recorded: true, queued: 1 }), 'held.waiting', 'a queue the page sees waits too')
  assert.equal(at('failed', { count: 1, recorded: true }), 'held.failed')
  // Delayed: still runs, never "send it again"; nothing promised once nothing of the author's waits.
  assert.equal(at('delayed', { count: 1, recorded: true }), 'held.delayed')
  assert.equal(at('delayed', { recorded: true, queued: 1 }), 'held.delayed')
  assert.equal(at('delayed', { recorded: true }), null)
  // Unsaved: still queued and still runs — its own line, never the "unknown" notice that asks the
  // author to look and maybe send again (the old message would run beside the new one).
  assert.equal(at('unsaved', { count: 1, recorded: true }), 'held.unsaved')
  assert.equal(at('unsaved', { count: 1, recorded: true, running: true }), 'held.unsaved')
  assert.notEqual(en['held.unsaved'], en['held.unknown'])
  assert.match(en['held.unsaved'], /do not send it again/)
  assert.equal(at('released', { count: 1, recorded: true }), null)
  assert.equal(at('none', { queued: 2 }), null)
  // Unknown about a message the host can point to (its record, or a queued one in an idle
  // conversation) is `held.unknown`; a host that cannot read what it held says `held.unreadable`
  // everywhere else — never nothing, since an empty queue may be the loss itself.
  assert.equal(at('unknown'), 'held.unreadable')
  assert.equal(at('unknown', { count: 1 }), 'held.unknown')
  assert.equal(at('unknown', { queued: 1 }), 'held.unknown')
  assert.equal(at('unknown', { queued: 1, running: true }), 'held.unreadable')
  assert.notEqual(en['held.unreadable'], en['held.unknown'])
})

test('the author removed every held message while the update runs: nothing is promised', () => {
  assert.equal(heldNoticeKey({ state: 'held', count: 0, recorded: true, queued: 0, running: false }), null)
})

test('the first deploy of this fix: a version 1 record names no message and its queue is gone — still told', () => {
  // The old process wrote only the session id and its disposal cancelled the queue: count 0, queue
  // empty. This conversation's own record is unknown, so its author is told.
  assert.equal(
    heldNoticeKey({ state: 'unknown', count: 0, recorded: true, queued: 0, running: false }),
    'held.unknown'
  )
  assert.equal(
    heldNoticeKey({ state: 'unknown', count: 0, recorded: true, queued: 0, running: true }),
    'held.unknown'
  )
  // A host that cannot read its records at all says unknown to every conversation: drawn even
  // where nothing waits — its own line, since it cannot say this conversation held anything.
  assert.equal(
    heldNoticeKey({ state: 'unknown', count: 0, recorded: false, queued: 0, running: false }),
    'held.unreadable'
  )
})

test('the page keeps asking while a message waits, and stops once there is nothing to wait for', () => {
  assert.equal(shouldPoll({ state: 'held', queued: 0, running: false }), true)
  assert.equal(shouldPoll({ state: 'released', queued: 0, running: true }), true)
  assert.equal(shouldPoll({ state: null, queued: 1, running: false }), true)
  assert.equal(shouldPoll({ state: 'none', queued: 1, running: true }), false)
  assert.equal(shouldPoll({ state: 'none', queued: 0, running: false }), false)
  assert.equal(shouldPoll({ state: 'failed', settled: true, queued: 0, running: false }), false)
  assert.equal(shouldPoll({ state: 'unknown', settled: true, queued: 0, running: false }), false)
})

test('an answer the host may still change is asked again, whatever the queue the page sees', () => {
  // Delayed, or unknown while the host retries writing the record down: the release may still
  // come, and the page must learn of it without a reload.
  for (const state of ['delayed', 'unsaved', 'unknown', 'held', 'released', 'failed'])
    assert.equal(shouldPoll({ state, settled: false, queued: 0, running: false }), true, state)
  assert.equal(shouldPoll({ state: 'unknown', queued: 0, running: true }), true, 'no settled: not settled')
  assert.equal(shouldPoll({ state: 'none', settled: true, queued: 0, running: false }), false)
})

test('a settled notice of this conversation is confirmed once drawn, by its id; nothing else is', () => {
  const A = '00000000-0000-4000-8000-00000000000a'
  const at = (over) => ({ state: 'failed', settled: true, recorded: true, id: A, ...over })
  assert.deepEqual(drawnNotices(at({}), 'held.failed'), [A])
  assert.deepEqual(drawnNotices(at({ state: 'unknown' }), 'held.unknown'), [A])
  assert.deepEqual(drawnNotices(at({}), null), [], 'not drawn')
  assert.deepEqual(drawnNotices(at({ id: null }), 'held.failed'), [], 'no id: nothing to name')
  assert.deepEqual(
    drawnNotices(at({ settled: false, state: 'unknown' }), 'held.unknown'),
    [],
    'still retried'
  )
  assert.deepEqual(drawnNotices(at({ recorded: false, state: 'unknown' }), 'held.unknown'), [], 'host-wide')
  assert.deepEqual(drawnNotices(at({ state: 'held', settled: false, id: null }), 'held.waiting'), [])
  assert.deepEqual(drawnNotices(at({ state: 'delayed', settled: false, id: null }), 'held.delayed'), [])
  assert.deepEqual(drawnNotices(at({ state: 'unsaved', settled: false, id: null }), 'held.unsaved'), [])
  // Earlier updates' notices beside a hold or a notice are always drawn, so each is confirmed.
  const failedBefore = { id: '00000000-0000-4000-8000-00000000000b', state: 'failed', count: 2 }
  const unknownBefore = { id: '00000000-0000-4000-8000-00000000000c', state: 'unknown', count: 1 }
  assert.deepEqual(
    drawnNotices(at({ state: 'held', settled: false, id: null, earlier: [failedBefore] }), 'held.waiting'),
    ['00000000-0000-4000-8000-00000000000b']
  )
  assert.deepEqual(
    drawnNotices(at({ state: 'held', settled: false, id: null, earlier: [failedBefore] }), null),
    ['00000000-0000-4000-8000-00000000000b']
  )
  assert.deepEqual(drawnNotices(at({ state: 'unknown', earlier: [failedBefore] }), 'held.unknown'), [
    '00000000-0000-4000-8000-00000000000b',
    A
  ])
  assert.deepEqual(
    drawnNotices(
      at({ state: 'held', settled: false, id: null, earlier: [failedBefore, unknownBefore] }),
      null
    ),
    ['00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c']
  )
  // The race: the page drew notice A; the host replaced it with a newer notice (a new id) before
  // the confirmation landed. What the page confirms is A; the newer one is confirmed only once drawn.
  const drawnFirst = drawnNotices(at({}), 'held.failed')
  const newer = at({ id: '00000000-0000-4000-8000-00000000000b' })
  assert.deepEqual(drawnFirst, [A])
  assert.deepEqual(drawnNotices(newer, 'held.failed'), ['00000000-0000-4000-8000-00000000000b'])
  assert.equal(earlierNoticeKey(failedBefore), 'held.failed')
  assert.equal(earlierNoticeKey(unknownBefore), 'held.unknown')
  assert.equal(earlierNoticeKey(null), null)
})

test('the confirmation names the session and the drawn notice ids under the page mount; a failure is only false', async () => {
  const calls = []
  const dshUrl = (p) => `https://cowork.tracy.site/wp-demo.tracy.site/${p.replace(/^\/+/, '')}`
  const taken = JSON.stringify(
    doorAnswer({ state: 'failed', settled: true, id: '00000000-0000-4000-8000-00000000000a' })
  )
  const fetchImpl = async (url, init) => (calls.push({ url, init }), new Response(taken, { status: 200 }))
  assert.equal(
    await ackHeld('session-a', ['00000000-0000-4000-8000-00000000000a'], { dshUrl, fetchImpl }),
    true
  )
  assert.equal(calls[0].url, 'https://cowork.tracy.site/wp-demo.tracy.site/api/tracy-site-tools/held')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    sessionId: 'session-a',
    seen: ['00000000-0000-4000-8000-00000000000a']
  })
  // Nothing drawn: nothing sent.
  assert.equal(await ackHeld('session-a', [], { dshUrl, fetchImpl }), false)
  assert.equal(calls.length, 1)
  assert.equal(
    await ackHeld('session-a', ['00000000-0000-4000-8000-00000000000a'], {
      dshUrl,
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      }
    }),
    false
  )
  // Taken only when the door itself says so: its answer, after writing `seen` down. A refusal
  // (503 NOT_SAVED), or a 200 that is not the door's answer — a proxy's page, an empty or bare
  // body — is not the host taking it, and the notice is confirmed again.
  for (const [status, body] of [
    [503, JSON.stringify({ ok: false, code: 'NOT_SAVED' })],
    [200, '<html>sign in</html>'],
    [200, ''],
    [200, '{}'],
    [200, JSON.stringify({ ok: true })],
    [200, JSON.stringify({ ...JSON.parse(taken), ok: false })],
    [200, JSON.stringify({ ...JSON.parse(taken), settled: undefined })]
  ])
    assert.equal(
      await ackHeld('session-a', ['00000000-0000-4000-8000-00000000000a'], {
        dshUrl,
        fetchImpl: async () => new Response(body, { status })
      }),
      false,
      `${status} ${body}`
    )
})

/** Timers the test fires by hand: `due(ms)` counts those set for `ms`, `run(ms)` fires them. */
function timeoutTimers() {
  let next = 0
  /** @type {Map<number, { fn: () => void, ms: number }>} */
  const set = new Map()
  return {
    setTimeout: (fn, ms) => (set.set(++next, { fn, ms }), next),
    clearTimeout: (n) => void set.delete(n),
    due: (ms) => [...set.values()].filter((t) => t.ms === ms).length,
    run: (ms) => {
      // Snapshot first: a timer armed by fn() waits for the next run(), never this one.
      const due = [...set].filter(([, t]) => t.ms === ms)
      for (const [n, t] of due) {
        set.delete(n)
        t.fn()
      }
    }
  }
}
const settle = () => new Promise((r) => setImmediate(r))

test('a confirmation that fails (dsh being replaced) is not taken for done: sent again until the host takes it, then never again', async () => {
  const A = '00000000-0000-4000-8000-00000000000a'
  const B = '00000000-0000-4000-8000-00000000000b'
  const sent = []
  let answers = [false, true]
  const timers = timeoutTimers()
  const acker = noticeAcker(
    async (sessionId, ids) => (sent.push([sessionId, ids]), answers.shift() ?? true),
    { timers }
  )
  await acker.ack('session-a', [A])
  assert.deepEqual(sent, [['session-a', [A]]])
  assert.equal(timers.due(HELD_POLL_MS), 1, 'a retry is due')
  // The page draws again before the retry: the id is waiting for its retry, not sent twice.
  await acker.ack('session-a', [A])
  assert.equal(sent.length, 1)
  // The retry reaches a host that takes it.
  timers.run(HELD_POLL_MS)
  await settle()
  assert.deepEqual(sent[1], ['session-a', [A]])
  assert.equal(timers.due(HELD_POLL_MS), 0)
  // Taken: drawing it again sends nothing; a new notice is sent alone.
  await acker.ack('session-a', [A, B])
  assert.deepEqual(sent[2], ['session-a', [B]])
  assert.equal(sent.length, 3)
  // A stopped acker (the page left) retries nothing.
  answers = [false]
  const C = '00000000-0000-4000-8000-00000000000c'
  await acker.ack('session-a', [C])
  assert.equal(timers.due(HELD_POLL_MS), 1)
  acker.stop()
  assert.equal(timers.due(HELD_POLL_MS), 0)
  timers.run(HELD_POLL_MS)
  await settle()
  assert.equal(sent.length, 4)
})

test('a host that keeps refusing: three sends, five seconds apart, then the notice stays unconfirmed — a new page tries again', async () => {
  const A = '00000000-0000-4000-8000-00000000000a'
  const sent = []
  const timers = timeoutTimers()
  const acker = noticeAcker(async (sessionId, ids) => (sent.push([sessionId, ids]), false), { timers })
  assert.equal(ACK_TRIES, 3)
  await acker.ack('session-a', [A])
  for (let i = 1; i < ACK_TRIES; i++) {
    assert.equal(timers.due(HELD_POLL_MS), 1, `retry ${i} is due`)
    timers.run(HELD_POLL_MS)
    await settle()
  }
  assert.equal(sent.length, ACK_TRIES)
  assert.equal(timers.due(HELD_POLL_MS), 0, 'no retry after the last try')
  assert.equal(timers.due(ACK_TIMEOUT_MS), 0, 'no request left timing')
  // Redrawn in the same page: out of tries, not sent again.
  await acker.ack('session-a', [A])
  assert.equal(sent.length, ACK_TRIES)
  acker.stop()
  // Never taken: the next page mounted on the conversation confirms it again.
  let taken = 0
  const again = noticeAcker(async () => (taken++, true), { timers: timeoutTimers() })
  await again.ack('session-a', [A])
  assert.equal(taken, 1)
})

test('a confirmation that never answers is aborted after its timeout and counts as not taken', async () => {
  const A = '00000000-0000-4000-8000-00000000000a'
  /** @type {AbortSignal[]} */
  const signals = []
  let answers = [new Promise(() => {}), Promise.resolve(true)]
  const timers = timeoutTimers()
  const acker = noticeAcker(
    (_sessionId, _ids, signal) => (signals.push(signal), /** @type {Promise<boolean>} */ (answers.shift())),
    { timers }
  )
  const first = acker.ack('session-a', [A])
  await settle()
  assert.equal(timers.due(ACK_TIMEOUT_MS), 1, 'the request is timed')
  timers.run(ACK_TIMEOUT_MS)
  await first
  assert.equal(signals[0].aborted, true, 'the hanging request is aborted')
  assert.equal(timers.due(HELD_POLL_MS), 1, 'a retry is due')
  timers.run(HELD_POLL_MS)
  await settle()
  await settle()
  assert.equal(signals.length, 2)
  assert.equal(signals[1].aborted, false)
  assert.equal(timers.due(ACK_TIMEOUT_MS), 0, 'the answered request stops timing')
  assert.equal(timers.due(HELD_POLL_MS), 0, 'taken: no retry')
  // Taken: redrawn, nothing sent.
  await acker.ack('session-a', [A])
  assert.equal(signals.length, 2)
  // The door itself hands the signal to fetch.
  let seenSignal
  const controller = new AbortController()
  await ackHeld('session-a', [A], {
    dshUrl: (p) => p,
    fetchImpl: async (_url, init) => (
      (seenSignal = init.signal), new Response(JSON.stringify(doorAnswer()), { status: 200 })
    ),
    signal: controller.signal
  })
  assert.equal(seenSignal, controller.signal)
})

test('the page leaves while a confirmation is in flight: it is aborted, and its late answer records and retries nothing', async () => {
  const A = '00000000-0000-4000-8000-00000000000a'
  /** @type {(ok: boolean) => void} */
  let answer = () => {}
  /** @type {AbortSignal | undefined} */
  let signal
  let sends = 0
  const timers = timeoutTimers()
  const acker = noticeAcker(
    (_sessionId, _ids, s) => (sends++, (signal = s), new Promise((r) => (answer = r))),
    { timers }
  )
  const inFlight = acker.ack('session-a', [A])
  await settle()
  acker.stop()
  assert.equal(signal?.aborted, true)
  answer(false)
  await inFlight
  assert.equal(timers.due(HELD_POLL_MS), 0, 'no retry after the page left')
  assert.equal(timers.due(ACK_TIMEOUT_MS), 0)
  await acker.ack('session-a', [A])
  assert.equal(sends, 1, 'a stopped acker sends nothing')
})

test('only the exact answer the door writes is an answer: a field missing, of the wrong type, extra, or disagreeing with its state is none', () => {
  const A = '00000000-0000-4000-8000-00000000000a'
  const B = '00000000-0000-4000-8000-00000000000b'
  const C = '00000000-0000-4000-8000-00000000000c'
  const failedBefore = { id: B, state: 'failed', count: 2 }
  const unknownBefore = { id: C, state: 'unknown', count: 1 }
  // Every shape the door writes (`heldPrompts().status`), read back as it is.
  for (const body of [
    doorAnswer(),
    doorAnswer({ state: 'released', draining: false }),
    doorAnswer({ state: 'delayed', draining: false, count: 0 }),
    doorAnswer({ state: 'unsaved' }),
    doorAnswer({ earlier: [failedBefore, unknownBefore] }),
    doorAnswer({ state: 'failed', settled: true, id: A, count: 2 }),
    doorAnswer({ state: 'failed', settled: true, id: A, earlier: [unknownBefore] }),
    doorAnswer({ state: 'unknown', settled: true, id: A, count: 0 }),
    doorAnswer({ state: 'unknown', settled: true, id: A, earlier: [failedBefore] }),
    doorAnswer({ state: 'none', count: 0, recorded: false, settled: true }),
    doorAnswer({ state: 'unknown', count: 0, recorded: false, settled: true })
  ])
    assert.deepEqual(parseHeld(JSON.parse(JSON.stringify(body))), parsed(body), JSON.stringify(body))
  const failed = doorAnswer({ state: 'failed', settled: true, id: A })
  const without = (key) => Object.fromEntries(Object.entries(failed).filter(([k]) => k !== key))
  for (const body of [
    null,
    'held',
    [],
    {},
    { ok: true },
    // The finding: a bare `failed` would say "did not run" about nothing the host said.
    { ok: true, state: 'failed' },
    { ok: true, state: 'failed', id: A },
    // Each key missing in turn.
    ...Object.keys(failed).map(without),
    // Each field of the wrong type, or an unknown value.
    { ...failed, ok: false },
    { ...failed, ok: 'true' },
    { ...failed, state: 'ran' },
    { ...failed, state: 7 },
    { ...failed, count: -1 },
    { ...failed, count: 1.5 },
    { ...failed, count: '1' },
    { ...failed, recorded: 'yes' },
    { ...failed, settled: 1 },
    { ...failed, draining: null },
    { ...failed, id: 'not-an-id' },
    { ...failed, earlier: null },
    { ...failed, earlier: {} },
    // A key the door never writes.
    { ...failed, extra: true },
    // Fields disagreeing with the state.
    { ...failed, settled: false },
    { ...failed, id: null },
    { ...failed, recorded: false },
    doorAnswer({ id: A }),
    doorAnswer({ settled: true }),
    doorAnswer({ recorded: false }),
    doorAnswer({ state: 'delayed', settled: true }),
    doorAnswer({ state: 'none', recorded: false, settled: true }),
    doorAnswer({ state: 'none', count: 0, recorded: true, settled: true }),
    doorAnswer({ state: 'none', count: 0, recorded: false, settled: false }),
    doorAnswer({ state: 'none', count: 0, recorded: false, settled: true, id: A }),
    doorAnswer({ state: 'none', count: 0, recorded: false, settled: true, earlier: [failedBefore] }),
    doorAnswer({ state: 'unknown', count: 1, recorded: false, settled: true }),
    // Earlier notices: each exactly as written, one per state, none of the record's own state.
    doorAnswer({ earlier: [failedBefore, { ...failedBefore, id: C }] }),
    { ...failed, earlier: [{ ...failedBefore, id: C, state: 'failed' }] },
    doorAnswer({ earlier: [{ ...failedBefore, state: 'held' }] }),
    doorAnswer({ earlier: [{ ...failedBefore, state: '<b>' }] }),
    doorAnswer({ earlier: [{ id: B, state: 'failed' }] }),
    doorAnswer({ earlier: [{ ...failedBefore, count: 'x' }] }),
    doorAnswer({ earlier: [{ ...failedBefore, id: 'not-an-id' }] }),
    doorAnswer({ earlier: [{ ...failedBefore, extra: 1 }] }),
    doorAnswer({ earlier: [null] }),
    doorAnswer({ earlier: failedBefore })
  ])
    assert.equal(parseHeld(body), null, JSON.stringify(body))
})

test('the door is asked under the page mount, by POST naming the session in the body, and an unreachable dsh keeps what is shown', async () => {
  const calls = []
  const answer = (status, body) => async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }
  const dshUrl = (p) => `https://cowork.tracy.site/wp-demo.tracy.site/${p.replace(/^\/+/, '')}`
  assert.deepEqual(
    await readHeld('session-a b', {
      dshUrl,
      fetchImpl: answer(200, doorAnswer())
    }),
    parsed(doorAnswer())
  )
  // The seat gateway holds a POST whose JSON body names `sessionId` to the viewer's own sessions.
  assert.equal(calls[0].url, 'https://cowork.tracy.site/wp-demo.tracy.site/api/tracy-site-tools/held')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { sessionId: 'session-a b' })
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(
    await readHeld('s', { dshUrl, fetchImpl: answer(502, { code: 'WORKSPACE_UNREACHABLE' }) }),
    null
  )
  assert.equal(
    await readHeld('s', {
      dshUrl,
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      }
    }),
    null
  )
  assert.equal(
    await readHeld('s', { dshUrl, fetchImpl: async () => new Response('<html>', { status: 200 }) }),
    null
  )
})

/** One read the test answers by hand, and the signal it was given. */
function handReads() {
  /** @type {{ resolve: (value: unknown) => void, signal: AbortSignal }[]} */
  const pending = []
  const read = (_sessionId, signal) => new Promise((resolve) => pending.push({ resolve, signal }))
  return { pending, read }
}

test('a watch asks now, one ask at a time, the next five seconds after the last ends, and drops what arrives after it stopped', async () => {
  const timers = timeoutTimers()
  const answers = []
  const { pending, read } = handReads()
  const stop = watchHeld('session-a', { poll: true, read, onAnswer: (a) => answers.push(a.state), timers })
  assert.equal(pending.length, 1, 'asked at once')
  assert.equal(timers.due(HELD_POLL_MS), 0, 'nothing more asked while the first is on its way')
  pending[0].resolve(parsed(doorAnswer()))
  await settle()
  assert.equal(timers.due(READ_TIMEOUT_MS), 0, 'the answered ask stops timing')
  assert.equal(timers.due(HELD_POLL_MS), 1)
  timers.run(HELD_POLL_MS)
  // dsh is being replaced: no answer, nothing changes on screen.
  pending[1].resolve(null)
  await settle()
  timers.run(HELD_POLL_MS)
  const late = pending[2]
  stop()
  assert.equal(late.signal.aborted, true, 'the ask in flight is aborted')
  assert.equal(timers.due(HELD_POLL_MS) + timers.due(READ_TIMEOUT_MS), 0, 'nothing left armed')
  late.resolve(parsed(doorAnswer({ state: 'none', count: 0, recorded: false, settled: true })))
  await settle()
  assert.deepEqual(answers, ['held'], 'the late answer of a stopped watch is dropped')
  assert.equal(pending.length, 3)
})

test('a dsh that hangs: each ask is aborted after its timeout, and asks never pile up', async () => {
  const timers = timeoutTimers()
  const { pending, read } = handReads()
  const stop = watchHeld('session-a', { poll: true, read, onAnswer: () => {}, timers })
  for (let i = 0; i < 5; i++) {
    assert.equal(pending.length, i + 1)
    assert.equal(timers.due(HELD_POLL_MS), 0, 'no second ask while one hangs')
    assert.equal(timers.due(READ_TIMEOUT_MS), 1)
    timers.run(READ_TIMEOUT_MS)
    await settle()
    assert.equal(pending[i].signal.aborted, true, `ask ${i} aborted`)
    assert.equal(pending.filter((p) => !p.signal.aborted).length, 0, 'none left in flight')
    timers.run(HELD_POLL_MS)
  }
  stop()
})

test('a page opened while dsh restarts, nothing queued (no poll): asked again until one answer arrives, then no more', async () => {
  const timers = timeoutTimers()
  const answers = []
  const { pending, read } = handReads()
  const stop = watchHeld('session-a', { poll: false, read, onAnswer: (a) => answers.push(a.state), timers })
  // dsh being replaced: refused, then a body that is not the door's answer.
  pending[0].resolve(null)
  await settle()
  assert.equal(timers.due(HELD_POLL_MS), 1, 'unanswered: asked again')
  timers.run(HELD_POLL_MS)
  timers.run(READ_TIMEOUT_MS)
  await settle()
  assert.equal(pending[1].signal.aborted, true)
  timers.run(HELD_POLL_MS)
  // dsh is back: the message held before the restart did not run.
  pending[2].resolve(
    parsed(doorAnswer({ state: 'failed', settled: true, id: '00000000-0000-4000-8000-00000000000a' }))
  )
  await settle()
  assert.deepEqual(answers, ['failed'])
  assert.equal(timers.due(HELD_POLL_MS) + timers.due(READ_TIMEOUT_MS), 0, 'answered, not polling: done')
  assert.equal(pending.length, 3)
  stop()
})

test('a read that throws counts as unanswered, and is asked again', async () => {
  const timers = timeoutTimers()
  let asked = 0
  const stop = watchHeld('session-a', {
    poll: false,
    read: async () => {
      asked++
      throw new TypeError('fetch failed')
    },
    onAnswer: () => assert.fail('no answer'),
    timers
  })
  await settle()
  assert.equal(timers.due(HELD_POLL_MS), 1)
  timers.run(HELD_POLL_MS)
  await settle()
  assert.equal(asked, 2)
  stop()
  assert.equal(timers.due(HELD_POLL_MS), 0)
})

test('the door is read with the watch signal: stopping the watch aborts the request itself', async () => {
  /** @type {AbortSignal | undefined} */
  let seen
  const stop = watchHeld('session-a', {
    poll: false,
    read: (id, signal) =>
      readHeld(id, {
        dshUrl: (p) => p,
        signal,
        fetchImpl: (_url, init) => (
          (seen = init.signal),
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          )
        )
      }),
    onAnswer: () => assert.fail('no answer'),
    timers: timeoutTimers()
  })
  await settle()
  assert.equal(seen?.aborted, false)
  stop()
  assert.equal(seen?.aborted, true)
})

let outDir
let render
before(async () => {
  const esbuild = require('esbuild')
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-held-'))
  const outfile = path.join(outDir, 'render.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { DeployHoldNotice, HeldLine, HeldLines } from './DeployHoldNotice'
        export const line = (props) => renderToStaticMarkup(createElement(HeldLine, props))
        export const lines = (props) => renderToStaticMarkup(createElement(HeldLines, props))
        export const notice = (props) => renderToStaticMarkup(createElement(DeployHoldNotice, props))`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    // CommonJS: react-dom/server requires Node built-ins, which an ESM bundle cannot `require`.
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    // react-dom is @tracy/core's dependency, not this plugin's; read it from where it is declared.
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  render = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** A translator over one dictionary, the way dsh's locale binds a namespace. */
const translator = (dict) => (key, params) =>
  dict[key].replace(/\{(\w+)\}/g, (whole, name) => String(params?.[name] ?? whole))

test('the line renders each notice in English and Vietnamese, as a status and as text only', () => {
  const vi = JSON.parse(readFileSync(viFile, 'utf8'))
  for (const key of [
    'held.waiting',
    'held.delayed',
    'held.unsaved',
    'held.failed',
    'held.unknown',
    'held.unreadable'
  ]) {
    assert.ok(vi[key], `vi has ${key}`)
    const english = render.line({ noticeKey: key })
    assert.match(english, /role="status"/)
    assert.ok(english.includes(en[key].replace(/'/g, '&#x27;')), english)
    const vietnamese = render.line({ noticeKey: key, t: translator(vi) })
    assert.ok(vietnamese.includes(vi[key]), vietnamese)
  }
  assert.equal(
    render.line({ noticeKey: 'held.waiting' }),
    `<div class="tv-held" role="status">${en['held.waiting']}</div>`
  )
  assert.match(render.line({ noticeKey: 'held.failed' }), /class="tv-held tv-held-error"/)
  assert.match(render.line({ noticeKey: 'held.delayed' }), /class="tv-held"/)
  assert.match(render.line({ noticeKey: 'held.unsaved' }), /class="tv-held"/)
  assert.match(render.line({ noticeKey: 'held.unknown' }), /class="tv-held tv-held-error"/)
  assert.match(render.line({ noticeKey: 'held.unreadable' }), /class="tv-held tv-held-error"/)
  assert.equal(render.line({ noticeKey: null }), '')
})

test('a second update in the same conversation: the earlier notice not yet shown stays, above the line about the new message', () => {
  const vi = JSON.parse(readFileSync(viFile, 'utf8'))
  const escape = (text) => text.replace(/'/g, '&#x27;')
  assert.equal(
    render.lines({ noticeKey: 'held.waiting', earlierKeys: ['held.failed'] }),
    `<div class="tv-held tv-held-error" role="status">${escape(en['held.failed'])}</div>` +
      `<div class="tv-held" role="status">${escape(en['held.waiting'])}</div>`
  )
  const vietnamese = render.lines({
    noticeKey: 'held.waiting',
    earlierKeys: ['held.unknown'],
    t: translator(vi)
  })
  assert.ok(vietnamese.indexOf(vi['held.unknown']) < vietnamese.indexOf(vi['held.waiting']), vietnamese)
  // Without one, the single line as before; the earlier one alone when nothing of the new waits.
  assert.equal(
    render.lines({ noticeKey: 'held.waiting', earlierKeys: [] }),
    render.line({ noticeKey: 'held.waiting' })
  )
  assert.equal(
    render.lines({ noticeKey: null, earlierKeys: ['held.failed'] }),
    render.line({ noticeKey: 'held.failed' })
  )
  // An update that did not run and one in doubt, both kept beside a third: each its own line,
  // never folded into one.
  assert.equal(
    render.lines({ noticeKey: 'held.waiting', earlierKeys: ['held.failed', 'held.unknown'] }),
    `<div class="tv-held tv-held-error" role="status">${escape(en['held.failed'])}</div>` +
      `<div class="tv-held tv-held-error" role="status">${escape(en['held.unknown'])}</div>` +
      `<div class="tv-held" role="status">${escape(en['held.waiting'])}</div>`
  )
})

test('before the door has answered, and outside a conversation, nothing is drawn', () => {
  const useSession = (select) => select({ running: false, pendingSubmissions: [{}] })
  const useProjection = () => ({ 'next-turn': [{}, {}] })
  assert.equal(render.notice({ sessionId: 'session-a', useSession, useProjection }), '')
  assert.equal(render.notice({}), '')
})

test('a held file the host cannot read, and a queue the update emptied: the author is still told, host answer to line', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'held-unreadable-'))
  try {
    // The previous process held a message; the file it left is cut, and dsh's queue is empty.
    writeFileSync(path.join(home, HELD_FILE), '{"version":2,"sessions":{"session-a":')
    const queue = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
    assert.ok(queue.broken, 'the host knows it cannot read the file')
    // The door's answer, as `index.ts` writes it.
    const body = JSON.parse(
      JSON.stringify({ ok: true, draining: false, ...queue.status('session-a', 'wp-demo') })
    )
    const answer = parseHeld(body)
    assert.deepEqual(
      { state: answer?.state, recorded: answer?.recorded, settled: answer?.settled, id: answer?.id },
      { state: 'unknown', recorded: false, settled: true, id: null }
    )
    for (const running of [false, true]) {
      const key = heldNoticeKey({ ...answer, queued: 0, running })
      assert.equal(key, 'held.unreadable', `running ${running}`)
      assert.deepEqual(drawnNotices(answer, key), [], 'no notice id to confirm')
      assert.ok(render.line({ noticeKey: key }).includes(en['held.unreadable'].replace(/'/g, '&#x27;')))
    }
    assert.equal(
      shouldPoll({ state: answer.state, settled: answer.settled, queued: 0, running: false }),
      false
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

/**
 * The real entry, mounted on a DOM double: what `apply()` registers in the dock, and each
 * occupant rendered by React as the slot runtime would. Every load is a fresh module, so it reads
 * the operator's switches (`@tracy/core/ui-switches`) once, the way a page does.
 */
async function loadEntry(dir) {
  const esbuild = require('esbuild')
  const outfile = path.join(dir, `entry-${Math.random().toString(36).slice(2)}.cjs`)
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { flushSync } from 'react-dom'
        import { createRoot } from 'react-dom/client'
        export { apply } from './index'
        export function mount(el) {
          const root = createRoot(el)
          return {
            render: (Component, props) => flushSync(() => root.render(createElement(Component, props))),
            unmount: () => flushSync(() => root.unmount())
          }
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  return require(outfile)
}

/** Let queued callbacks run: turns of the event loop, not a wait on the clock. */
const turns = async (count) => {
  for (let i = 0; i < count; i++) await new Promise((resolve) => setImmediate(resolve))
}

/** Resolves once `check()` holds (yielding, never sleeping); fails after two seconds. */
async function until(check, what) {
  const started = performance.now()
  while (performance.now() - started < 2000) {
    if (check()) return
    await turns(1)
  }
  assert.fail(`timed out waiting for ${what}`)
}

for (const hidden of [['start-cards'], []]) {
  test(`start-cards ${hidden.length ? 'switched off' : 'left on'} (#535): the held notice (#517) is its own dock occupant, and still drawn`, async () => {
    const { parseHTML } = require('linkedom')
    const { window, document } = parseHTML(
      '<!doctype html><html><head><meta name="tracy-chat-input-audience" content="onboarding"></head>' +
        '<body><div id="start"></div><div id="held"></div></body></html>'
    )
    const saved = Object.fromEntries(
      ['window', 'document', 'location', 'fetch'].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key)
      ])
    )
    const asked = []
    // A new page: no read of the switches door from an earlier test's page (one read per page,
    // kept on globalThis by @tracy/core/ui-switches).
    delete globalThis[PAGE_READ]
    const define = (key, value) =>
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
    define('window', window)
    define('document', document)
    define('location', new URL('https://cowork.tracy.site/new/'))
    define('fetch', async (url) => {
      asked.push(String(url))
      if (url === '/api/ui') return new Response(JSON.stringify({ hidden }), { status: 200 })
      if (String(url).endsWith('/api/tracy-site-tools/held'))
        return new Response(JSON.stringify(doorAnswer()), { status: 200 })
      return new Response('{}', { status: 404 })
    })
    const dir = mkdtempSync(path.join(tmpdir(), 'tci-entry-'))
    const mounted = []
    try {
      const entry = await loadEntry(dir)
      const registered = []
      entry.apply({
        effect: () => {},
        betterSidebar: { getTab: () => ({}), openTab: () => {}, subscribe: () => () => {} },
        sessions: {},
        conversation: {},
        uiConversation: {},
        slots: {
          inject: (_name, register) => register(),
          register: (spec, component) => (registered.push({ spec, component }), () => {})
        },
        locale: { register: () => {}, bind: () => (key) => key }
      })
      const dock = registered.filter(({ spec }) => spec.name === 'conversation.input.dock')
      assert.deepEqual(
        dock.map(({ spec }) => spec.id),
        ['tracy-start', 'tracy-chat-wait', 'tracy-held', 'tracy-viewer', 'tracy-voice-tip'],
        'five occupants (the Viewer bar its own, ADR 0028; the wait line, #1403 item 10; the note introducing Voice its own), each registered once, whatever the switch'
      )
      const start = dock.find(({ spec }) => spec.id === 'tracy-start')
      const held = dock.find(({ spec }) => spec.id === 'tracy-held')
      const t = (key) => en[key] ?? key

      const startView = entry.mount(document.getElementById('start'))
      mounted.push(startView)
      startView.render(start.component, {
        session: { blank: true },
        input: { draft: '' },
        inputActions: { setDraft: () => {} },
        t
      })
      const heldView = entry.mount(document.getElementById('held'))
      mounted.push(heldView)
      heldView.render(held.component, {
        sessionId: 'session-a',
        useSession: (select) => select({ running: false, pendingSubmissions: [] }),
        useProjection: () => ({ 'next-turn': [{}] }),
        t
      })

      await until(() => asked.includes('/api/ui'), 'the switches door')
      const startEl = document.getElementById('start')
      if (hidden.includes('start-cards'))
        await until(() => startEl.innerHTML === '', 'the Start block to leave')
      else await turns(20)
      assert.equal(
        startEl.querySelector('[data-tracy-start]') === null,
        hidden.includes('start-cards'),
        startEl.innerHTML
      )
      const heldEl = document.getElementById('held')
      await until(() => heldEl.querySelector('.tv-held') !== null, 'the held line')
      assert.ok(heldEl.textContent.includes(en['held.waiting']), heldEl.innerHTML)
    } finally {
      // Unmounted while the DOM double is still the global, so no effect outlives the test.
      for (const view of mounted) view.unmount()
      delete globalThis[PAGE_READ]
      await turns(5)
      rmSync(dir, { recursive: true, force: true })
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  })
}

test('the Start block on /new/ (Akemi 01/10, option A): round cards, each opening its own door; Build from my business while its switch is on', async () => {
  const { parseHTML } = require('linkedom')
  const { window, document } = parseHTML(
    '<!doctype html><html><head><meta name="tracy-chat-input-audience" content="onboarding"></head>' +
      '<body><div id="start"></div></body></html>'
  )
  const saved = Object.fromEntries(
    ['window', 'document', 'location', 'fetch'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  )
  const define = (key, value) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  define('window', window)
  define('document', document)
  define('location', new URL('https://cowork.tracy.site/new/'))
  delete globalThis[PAGE_READ]
  define('fetch', async (url) =>
    url === '/api/ui'
      ? new Response(JSON.stringify({ hidden: [] }), { status: 200 })
      : new Response('{}', { status: 404 })
  )
  const dir = mkdtempSync(path.join(tmpdir(), 'tci-start-'))
  let view
  try {
    const entry = await loadEntry(dir)
    const opened = []
    const registered = []
    entry.apply({
      effect: () => {},
      betterSidebar: { getTab: () => ({}), openTab: (seed) => opened.push(seed), subscribe: () => () => {} },
      sessions: {},
      conversation: {},
      uiConversation: {},
      slots: {
        inject: (_name, register) => register(),
        register: (spec, component) => (registered.push({ spec, component }), () => {})
      },
      locale: { register: () => {}, bind: () => (key) => key }
    })
    const start = registered.find(({ spec }) => spec.id === 'tracy-start')
    view = entry.mount(document.getElementById('start'))
    view.render(start.component, {
      session: { blank: true },
      input: { draft: '' },
      inputActions: { setDraft: () => {} },
      t: (key) => en[key] ?? key
    })
    await turns(5)
    const root = document.getElementById('start')
    assert.ok(root.textContent.includes(en['start.title']), root.innerHTML)
    assert.equal(root.querySelector('.tv-start-subtitle')?.textContent, en['start.subtitle'])
    const cards = [...root.querySelectorAll('button.tv-start-card')]
    assert.deepEqual(
      cards.map((card) => card.textContent),
      // `/api/ui` hides nothing here, so `site-from-business` is on and its card shows (24/10/2026: it was reachable
      // only by pressing Back from the platform step of Create).
      [en['start.create'], en['start.business'], en['start.template'], en['start.import']]
    )
    for (const card of cards) card.dispatchEvent(new window.Event('click', { bubbles: true }))
    assert.deepEqual(
      opened.map(({ type, meta }) => ({ type, origin: meta?.origin })),
      [
        { type: 'tracy:add-site', origin: 'create' },
        { type: 'tracy:add-site', origin: 'business' },
        { type: 'tracy:design-inspiration', origin: undefined },
        { type: 'tracy:add-site', origin: 'import' }
      ]
    )
    // Stamped, so the Add site tab tells a new press from a restored one (`platformPressOf`).
    assert.equal(typeof opened[0].meta.pressedAt, 'number')
  } finally {
    view?.unmount()
    delete globalThis[PAGE_READ]
    await turns(5)
    rmSync(dir, { recursive: true, force: true })
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
