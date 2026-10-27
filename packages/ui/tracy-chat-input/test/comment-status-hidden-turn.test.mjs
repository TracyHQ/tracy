/**
 * Round 9 (acceptance v5 V5S-3 / SEND-v5-new-15, 2/2 on the stand, 30/09/2026): a write sent from the
 * Browser tab of conversation X, the person switched to conversation Y at once, X's turn wrote the site
 * and ended while X was not on screen, and back in X the Refresh button spun "Tracy is working" for good
 * — the page stale, pressing Refresh reloaded it and still spun; only the next turn cleared it.
 *
 * Cause: `watchTurnProgress` follows only the conversation on screen, so X's write and turn end never
 * reached X's (hidden, still mounted) tab. Coming back, the window already holding the finished turn was
 * read as history — `catchUp` only picks up a turn still RUNNING — and the request stayed open for
 * `DROP_MS` (an hour). Now the turn a request is open on is replayed from the window when the
 * conversation comes back (its writes, then its end), a request whose turn left the window is ended
 * when no turn runs, and the tab can ask whether a turn runs (`tracy:turn-state`) before it keeps spinning.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createTurnProgressTracker,
  SITE_CHANGED_EVENT,
  TURN_END_EVENT,
  TURN_STATE_EVENT,
  watchTurnProgress,
  WORKING_EVENT
} from '../src/client/comment-status.mjs'

const X = 'session-x'
const Y = 'session-y'
const SITE = 'e3sw0330.tracy.test'
const TASK = 'first read the About page, then change this heading'

const entry = (type, data) => ({ type: 'event', event: { type, data } })
const turnStart = (turn) => entry('turn/start', { turn })
const turnEnd = (turn) => entry('turn/end', { turn, reason: 'completed' })
const said = (text) =>
  entry('user/message', {
    id: 'm',
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }]
  })
const call = (turn, callId) =>
  entry('tool/call', {
    turn,
    step: 1,
    callId,
    name: 'tracy_site',
    arguments: JSON.stringify({ action: 'content.replace', params: { find: 'a', replace: 'b' } })
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

/** Two conversations on one site; `show(id)` puts one on screen the way dsh's main view retains it. */
function twoConversations() {
  const listListeners = new Set()
  const rows = {
    [X]: { cwd: '/site/e3sw0330', retainedBy: { mainView: 1 } },
    [Y]: { cwd: '/site/e3sw0330', retainedBy: {} }
  }
  /** Each conversation's window: everything its log holds, and the last change. */
  const windows = { [X]: { revision: 0, entries: [] }, [Y]: { revision: 0, entries: [] } }
  const sourceListeners = { [X]: new Set(), [Y]: new Set() }
  const sources = Object.fromEntries(
    [X, Y].map((id) => [
      id,
      {
        getSnapshot: () => windows[id],
        subscribe: (l) => (sourceListeners[id].add(l), () => sourceListeners[id].delete(l))
      }
    ])
  )
  const sessions = {
    list: {
      getSnapshot: () => ({ byId: { ...rows } }),
      subscribe: (l) => (listListeners.add(l), () => listListeners.delete(l))
    },
    binding: (id) => ({ eventSource: sources[id] })
  }
  const show = (id) => {
    for (const key of Object.keys(rows))
      rows[key] = { ...rows[key], retainedBy: key === id ? { mainView: 1 } : {} }
    for (const l of listListeners) l()
  }
  /** The log of `id` grows (whether or not anyone follows it). */
  const append = (id, entries) => {
    const w = windows[id]
    windows[id] = {
      revision: w.revision + 1,
      change: { kind: 'append', entries },
      entries: [...w.entries, ...entries]
    }
    for (const l of sourceListeners[id]) l()
  }
  return { sessions, show, append }
}

function listen(target) {
  const seen = []
  for (const type of [WORKING_EVENT, SITE_CHANGED_EVENT, TURN_END_EVENT])
    target.addEventListener(type, (e) => seen.push(`${e.detail.sessionId}:${type.replace('tracy:', '')}`))
  return seen
}

test('V5S-3: the turn of X ends while Y is on screen — back in X, its write and its end are said', () => {
  const c = twoConversations()
  const target = new EventTarget()
  const seen = listen(target)
  const sentTurns = new Map([['req-A', { sessionId: X, siteKey: SITE, text: TASK }]])
  const stop = watchTurnProgress({ sessions: c.sessions, target, sentTurns, siteKey: () => SITE })
  c.append(X, [turnStart(3), said(TASK)])
  assert.deepEqual(seen, [`${X}:tracy-working`])
  // 0.8 s later the person opens conversation Y; X goes on behind it and ends.
  c.show(Y)
  c.append(X, [call(3, 'c1'), result(3, 'c1'), turnEnd(3)])
  assert.deepEqual(seen, [`${X}:tracy-working`], 'nothing is heard of X while it is not followed')
  c.show(X)
  assert.deepEqual(seen, [`${X}:tracy-working`, `${X}:site-changed`, `${X}:turn-end`])
  // Showing it again says nothing twice.
  c.show(Y)
  c.show(X)
  assert.equal(seen.length, 3)
  stop()
})

test('V5S-3: a turn with no write that ended while hidden ends the working state, with no site-changed', () => {
  const c = twoConversations()
  const target = new EventTarget()
  const seen = listen(target)
  const stop = watchTurnProgress({ sessions: c.sessions, target, sentTurns: new Map(), siteKey: () => SITE })
  c.append(X, [turnStart(1), said('what does the About page say?')])
  c.show(Y)
  c.append(X, [turnEnd(1)])
  c.show(X)
  assert.deepEqual(seen, [`${X}:tracy-working`, `${X}:turn-end`])
  stop()
})

test('V5S-3: coming back while the turn still runs says nothing yet; its end, when it comes, is said', () => {
  const c = twoConversations()
  const target = new EventTarget()
  const seen = listen(target)
  const stop = watchTurnProgress({ sessions: c.sessions, target, sentTurns: new Map(), siteKey: () => SITE })
  c.append(X, [turnStart(1), said('change the heading')])
  c.show(Y)
  c.append(X, [call(1, 'c1'), result(1, 'c1')])
  c.show(X)
  assert.deepEqual(
    seen,
    [`${X}:tracy-working`, `${X}:site-changed`],
    'the write made while hidden is said on return'
  )
  c.append(X, [turnEnd(1)])
  assert.deepEqual(seen, [`${X}:tracy-working`, `${X}:site-changed`, `${X}:turn-end`])
  stop()
})

test('a replace carrying the rest of an open turn replays its write before its end', () => {
  const out = []
  const tracker = createTurnProgressTracker({
    sentTurns: new Map([['req-A', { sessionId: X, siteKey: SITE, text: TASK }]]),
    emit: (type, d) => out.push(`${d.requestId}:${type.replace('tracy:', '')}`)
  })
  tracker.feed(X, { revision: 1, change: { kind: 'append', entries: [turnStart(3), said(TASK)] } })
  tracker.feed(X, {
    revision: 2,
    change: {
      kind: 'replace',
      entries: [turnStart(3), said(TASK), call(3, 'c1'), result(3, 'c1'), turnEnd(3)]
    }
  })
  assert.deepEqual(out, ['req-A:tracy-working', 'req-A:site-changed', 'req-A:turn-end'])
})

test('an open request whose turn is no longer in the window ends when no turn runs there', () => {
  const out = []
  const tracker = createTurnProgressTracker({
    sentTurns: new Map([['req-A', { sessionId: X, siteKey: SITE, text: TASK }]]),
    emit: (type, d) => out.push(`${d.requestId}:${type.replace('tracy:', '')}`)
  })
  tracker.feed(X, { revision: 1, change: { kind: 'append', entries: [turnStart(3), said(TASK)] } })
  // The window loaded again holds only later, finished turns.
  tracker.feed(X, {
    revision: 2,
    change: { kind: 'replace', entries: [turnStart(5), said('later'), turnEnd(5)] }
  })
  assert.deepEqual(out, ['req-A:tracy-working', 'req-A:turn-end'])
  // …but a window whose last turn still runs keeps it open.
  const out2 = []
  const t2 = createTurnProgressTracker({
    sentTurns: new Map([['req-B', { sessionId: X, siteKey: SITE, text: TASK }]]),
    emit: (type, d) => out2.push(`${d.requestId}:${type.replace('tracy:', '')}`)
  })
  t2.feed(X, { revision: 1, change: { kind: 'append', entries: [turnStart(3), said(TASK)] } })
  t2.feed(X, { revision: 2, change: { kind: 'replace', entries: [turnStart(6), said('other')] } })
  assert.deepEqual(out2, ['req-B:tracy-working'])
})

test('tracy:turn-state answers whether a turn runs in the conversation on screen (the tab asks before it keeps spinning)', () => {
  const c = twoConversations()
  const target = new EventTarget()
  const stop = watchTurnProgress({ sessions: c.sessions, target, sentTurns: new Map(), siteKey: () => SITE })
  const ask = (sessionId) => {
    const detail = { sessionId }
    target.dispatchEvent(new CustomEvent(TURN_STATE_EVENT, { detail }))
    return detail.running
  }
  assert.equal(ask(X), undefined, 'an empty window knows nothing')
  c.append(X, [turnStart(1), said('change the heading')])
  assert.equal(ask(X), true)
  c.append(X, [turnEnd(1)])
  assert.equal(ask(X), false)
  // A conversation not on screen is not answered: its window is not read live.
  assert.equal(ask(Y), undefined)
  stop()
  c.append(X, [turnStart(2)])
  assert.equal(ask(X), undefined, 'stopped: nobody answers')
})
