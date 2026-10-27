/**
 * Stage-6 acceptance e2e v3 (send, S12, 30/09): a task TYPED in the chat of window A never made A's
 * Refresh spin — A showed "New version ready" mid-turn at 2.9 s and reloaded at 3.8 s, never "updated" —
 * while window A2 on the same conversation spun from 0.25 s and said "updated" at 4.1 s.
 *
 * The difference is WHEN each window starts following the conversation's event feed. A2 had it
 * followed before the turn began, so `turn/start` and the message arrived as `append`s. In the window
 * that sends, the feed is picked up (or loaded again, as a `replace`) around the send itself: the
 * sessions list changes because of the prompt, `watchTurnProgress` follows the session only then, and
 * the tracker took everything already in the window — the running turn's `turn/start` and message —
 * as history. Its tool calls then arrived with no turn open, so nothing was said.
 *
 * A turn that is still RUNNING when the window is picked up (its `turn/start` in the window, no
 * `turn/end` after it, started within {@link FRESH_TURN_MS}) is caught up: its events so far are read
 * as if they had just arrived. An old unfinished turn stays history, and a turn already said is never
 * said twice.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createTurnProgressTracker,
  SITE_CHANGED_EVENT,
  TURN_END_EVENT,
  watchTurnProgress,
  WORKING_EVENT
} from '../src/client/comment-status.mjs'

const S = 'session-a'
const SITE = 'e3sw0330.tracy.test'
const NOW = Date.UTC(2026, 8, 30, 4, 0, 0)

const entry = (type, data, time = NOW - 1_000) => ({ type: 'event', event: { type, time, data } })
const turnStart = (turn, time) => entry('turn/start', { turn }, time)
const turnEnd = (turn) => entry('turn/end', { turn, reason: 'completed' })
const said = (text, time) =>
  entry(
    'user/message',
    { id: 'm', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] },
    time
  )
const call = (turn, callId) =>
  entry('tool/call', {
    turn,
    step: 1,
    callId,
    name: 'tracy_site',
    arguments: JSON.stringify({
      action: 'content.replace',
      params: { find: 'M&E systems', replace: 'M&E engineering' }
    })
  })
const result = (turn, callId) =>
  entry('tool/result', {
    turn,
    step: 1,
    message: {
      role: 'tool',
      toolCallId: callId,
      source: { kind: 'tool', callId },
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ ok: true, applyId: 'a-1' }) }]
    }
  })

const TASK = 'change the heading "M&E systems" back to "M&E engineering"'
const ID = `turn:${S}:4`

function harness() {
  const out = []
  const tracker = createTurnProgressTracker({
    sentTurns: new Map(),
    emit: (type, detail) => out.push(`${detail.requestId}:${type.replace('tracy:', '')}`),
    siteOf: (id) => (id === S ? SITE : null),
    now: () => NOW
  })
  let revision = 0
  const feed = (entries, kind = 'append') => {
    revision += 1
    tracker.feed(S, { revision, change: { kind, entries } })
  }
  return { out, tracker, feed }
}

test('a running turn started a minute ago is caught up; one started over half an hour ago stays history', () => {
  const recent = harness()
  const minute = NOW - 60_000
  recent.feed([turnStart(4, minute), said(TASK, minute), call(4, 'c1'), result(4, 'c1')], 'replace')
  assert.deepEqual(recent.out, [`${ID}:tracy-working`, `${ID}:site-changed`])
  const stale = harness()
  const halfHour = NOW - 30 * 60_000 - 1_000
  stale.feed([turnStart(4, halfHour), said(TASK, halfHour), call(4, 'c1'), result(4, 'c1')], 'replace')
  assert.deepEqual(stale.out, [])
})

test('S12: the window that sent the task gets it as a replace while it runs — working, its write, then its end', () => {
  const h = harness()
  h.feed(
    [turnStart(3), said('earlier'), turnEnd(3), turnStart(4), said(TASK), call(4, 'c1'), result(4, 'c1')],
    'replace'
  )
  h.feed([call(4, 'c2'), result(4, 'c2')])
  h.feed([turnEnd(4)])
  assert.deepEqual(h.out, [
    `${ID}:tracy-working`,
    `${ID}:site-changed`,
    `${ID}:site-changed`,
    `${ID}:turn-end`
  ])
})

test('a replace that carries a turn already said is not said again', () => {
  const h = harness()
  h.feed([turnStart(4), said(TASK), call(4, 'c1'), result(4, 'c1')])
  h.feed([turnStart(4), said(TASK), call(4, 'c1'), result(4, 'c1')], 'replace')
  assert.deepEqual(h.out, [`${ID}:tracy-working`, `${ID}:site-changed`])
})

test('an old unfinished turn in loaded history stays history (no spinner for an hour)', () => {
  const h = harness()
  const old = NOW - 2 * 60 * 60_000
  h.feed([turnStart(4, old), said(TASK, old), call(4, 'c1'), result(4, 'c1')], 'replace')
  assert.deepEqual(h.out, [])
})

test('S12 wiring: the session is followed only once the prompt changed the list — the running turn is still said', () => {
  const listeners = []
  const sourceListeners = []
  let bound = false
  let snapshot = { revision: 0, change: undefined, entries: [] }
  const sessions = {
    list: {
      getSnapshot: () => ({ byId: { [S]: { cwd: '/site/e3sw0330', retainedBy: { mainView: 1 } } } }),
      subscribe: (l) => (listeners.push(l), () => {})
    },
    // The sending window's binding is not there yet when the watcher starts.
    binding: (id) =>
      id === S && bound
        ? {
            eventSource: {
              getSnapshot: () => snapshot,
              subscribe: (l) => (sourceListeners.push(l), () => {})
            }
          }
        : undefined
  }
  const target = new EventTarget()
  const seen = []
  for (const type of [WORKING_EVENT, SITE_CHANGED_EVENT, TURN_END_EVENT])
    target.addEventListener(type, (e) => seen.push(`${e.detail.requestId}:${type.replace('tracy:', '')}`))
  const realNow = Date.now
  Date.now = () => NOW
  try {
    const stop = watchTurnProgress({ sessions, target, sentTurns: new Map(), siteKey: () => SITE })
    // The prompt: the turn starts, the list changes, and only now is the session's feed there.
    bound = true
    const window = [turnStart(4), said(TASK)]
    snapshot = { revision: 7, change: { kind: 'append', entries: [window[1]] }, entries: window }
    for (const l of listeners) l()
    snapshot = {
      revision: 8,
      change: { kind: 'append', entries: [call(4, 'c1'), result(4, 'c1')] },
      entries: []
    }
    for (const l of sourceListeners) l()
    snapshot = { revision: 9, change: { kind: 'append', entries: [turnEnd(4)] }, entries: [] }
    for (const l of sourceListeners) l()
    stop()
  } finally {
    Date.now = realNow
  }
  assert.deepEqual(seen, [`${ID}:tracy-working`, `${ID}:site-changed`, `${ID}:turn-end`])
})
