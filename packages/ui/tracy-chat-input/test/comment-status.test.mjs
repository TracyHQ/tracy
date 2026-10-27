/**
 * `comment-status.mjs` since stage 6 (contract `tasks/evidence/comment-people/contract.md` §H2): comments
 * carry no status any more, so nothing says `tracy:comment-status`. What stays is the turn's PROGRESS,
 * for the fork's Refresh button (rule 10): `tracy:tracy-working` when a turn sent from the Browser tab
 * starts, `tracy:site-changed` on each write of `tracy_site` / `tracy_emdash` that went through in that
 * turn, and `tracy:turn-end` when it ends — each `{sessionId, requestId, siteKey}`. Every case feeds
 * `eventSource` changes as dsh shapes them (`{revision, change:{kind, entries:[{type:'event', event}]}}`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as status from '../src/client/comment-status.mjs'

const {
  ASKING_EVENT,
  callWrites,
  createTurnProgressTracker,
  DROP_MS,
  SITE_CHANGED_EVENT,
  TURN_END_EVENT,
  watchTurnProgress,
  WORKING_EVENT
} = status

const S = 'session-1'
const SITE = 'northgate.tracy.site'
const TURN_A = 'comment turn A'
const TURN_B = 'comment turn B'

const entry = (type, data) => ({ type: 'event', event: { type, data } })
const turnStart = (turn) => entry('turn/start', { turn })
const turnEnd = (turn) => entry('turn/end', { turn, reason: 'completed' })
const said = (text, kind = 'user') =>
  entry('user/message', { id: 'm', role: 'user', source: { kind }, content: [{ type: 'text', text }] })
/** A `tool/call` as the session log keeps it: `arguments` is the call's JSON text. */
const call = (turn, callId, args, name = 'tracy_site') =>
  entry('tool/call', {
    turn,
    step: 1,
    callId,
    name,
    arguments: args === undefined ? undefined : JSON.stringify(args)
  })
/** A `tool/result` in session format V4, with the echo block in front of the JSON as site-tools renders it. */
const result = (turn, callId, answer, { isError = false, comment = null } = {}) =>
  entry('tool/result', {
    turn,
    step: 1,
    message: {
      role: 'tool',
      toolCallId: callId,
      source: { kind: 'tool', callId },
      isError,
      content: [
        ...(comment === null ? [] : [{ type: 'text', text: `comment: ${comment}` }]),
        { type: 'text', text: JSON.stringify(answer) }
      ]
    }
  })

const replace = (comment, extra = {}) => ({
  action: 'content.replace',
  params: { find: 'a', replace: 'b', ...extra },
  comment
})
const read = (comment) => ({ action: 'content.get', params: { kind: 'page', id: 1 }, comment })
const emdash = (comment, tool, args = {}) => ({ tool, arguments: args, comment })
const OK = { ok: true, applyId: 'a-1' }
const REFUSED = { ok: false, code: 'SLOT_LOCKED', error: 'no' }

/** A tracker fed through `feed`, a Map of sent turns (`comment-send.mjs` `sentTurns`), and what it said. */
function harness(
  turns = [['req-A', { sessionId: S, siteKey: SITE, text: TURN_A, ns: [140] }]],
  options = {}
) {
  const sentTurns = new Map(turns)
  /** @type {{ type: string, detail: Record<string, unknown> }[]} */
  const out = []
  const tracker = createTurnProgressTracker({
    sentTurns,
    emit: (type, detail) => out.push({ type, detail }),
    ...options
  })
  let revision = 0
  const feed = (entries, kind = 'append', sessionId = S) => {
    revision += 1
    tracker.feed(sessionId, { revision, change: { kind, entries } })
  }
  const said_ = () => out.map((o) => `${o.detail.requestId}:${o.type.replace('tracy:', '')}`)
  return { sentTurns, out, tracker, feed, said: said_ }
}

test('the four events and nothing else: the status event is gone', () => {
  assert.equal(WORKING_EVENT, 'tracy:tracy-working')
  assert.equal(ASKING_EVENT, 'tracy:tracy-asking')
  assert.equal(SITE_CHANGED_EVENT, 'tracy:site-changed')
  assert.equal(TURN_END_EVENT, 'tracy:turn-end')
  assert.equal('STATUS_EVENT' in status, false)
  assert.equal('watchCommentStatus' in status, false)
})

test('a sent turn: working when its message starts the turn, site-changed per write that went through, turn-end', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'c1', replace(140)), result(1, 'c1', OK, { comment: 140 })])
  h.feed([call(1, 'c2', replace(140)), result(1, 'c2', OK)])
  h.feed([turnEnd(1)])
  assert.deepEqual(h.said(), [
    'req-A:tracy-working',
    'req-A:site-changed',
    'req-A:site-changed',
    'req-A:turn-end'
  ])
  for (const o of h.out) assert.deepEqual(o.detail, { sessionId: S, requestId: 'req-A', siteKey: SITE })
})

test('a confirmed media.delete is a site write and refreshes the Browser tab', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([
    call(1, 'media-delete', { action: 'media.delete', params: { apply_id: 'a-1', id: 42, confirm: true } }),
    result(1, 'media-delete', { ok: true, storageDeleted: true })
  ])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed'])
})

test('a question card in the turn: asking when it is asked, working again once it is answered (F3)', () => {
  // Stage 6 acceptance F3: Refresh spun "Tracy is working" for seven minutes while Tracy was waiting
  // on the person's answer to a question card.
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'c1', replace(140)), result(1, 'c1', OK)])
  h.feed([call(1, 'q1', { questions: [{ id: 'x', question: 'Which one?' }] }, 'ask_user_question')])
  h.feed([result(1, 'q1', { answers: [{ id: 'x', selected: ['A'] }] })])
  h.feed([turnEnd(1)])
  assert.deepEqual(h.said(), [
    'req-A:tracy-working',
    'req-A:site-changed',
    'req-A:tracy-asking',
    'req-A:tracy-working',
    'req-A:turn-end'
  ])
})

test('a question in a turn that was not sent from the Browser tab says nothing', () => {
  const h = harness()
  h.feed([turnStart(1), said('typed by hand')])
  h.feed([call(1, 'q1', { questions: [] }, 'ask_user_question'), result(1, 'q1', { answers: [] })])
  assert.deepEqual(h.said(), [])
})

test('a write in the turn counts whatever number it names — or none: the page changed all the same', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'c1', replace(undefined)), result(1, 'c1', OK)])
  h.feed([call(1, 'c2', replace(7)), result(1, 'c2', OK)])
  // A digit string the door reads as its number (`comment-echo.mjs` `spelled`, round 7) is a write too.
  h.feed([call(1, 'c3', replace('1')), result(1, 'c3', OK)])
  assert.deepEqual(h.said(), [
    'req-A:tracy-working',
    'req-A:site-changed',
    'req-A:site-changed',
    'req-A:site-changed'
  ])
})

test('reads, dry runs and refused or failed writes change nothing on the site: no site-changed', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'r', read(140)), result(1, 'r', { ok: true, item: {} })])
  h.feed([call(1, 'd', replace(140, { dryRun: true })), result(1, 'd', OK)])
  h.feed([call(1, 'x', replace(140)), result(1, 'x', REFUSED)])
  h.feed([call(1, 'e', replace(140)), result(1, 'e', OK, { isError: true })])
  h.feed([turnEnd(1)])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:turn-end'])
})

test('tracy_emdash: a write that went through changes the site; a read or a refused write does not', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([
    call(1, 'e1', emdash(140, 'content_get', { id: 'x' }), 'tracy_emdash'),
    result(1, 'e1', { ok: true })
  ])
  h.feed([
    call(1, 'e2', emdash(140, 'content_update', { id: 'x' }), 'tracy_emdash'),
    result(1, 'e2', { ok: true })
  ])
  h.feed([
    call(1, 'e3', emdash(140, 'content_publish'), 'tracy_emdash'),
    result(1, 'e3', { ok: false, code: 'CONFLICT' })
  ])
  h.feed([call(1, 'e4', { list: true }, 'tracy_emdash'), result(1, 'e4', { ok: true })])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed'])
})

test('unreadable arguments: a result with a receipt (applyId / undo) is a write that went through', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'u1', undefined), result(1, 'u1', { ok: true, applyId: 'a-9' })])
  h.feed([call(1, 'u2', undefined), result(1, 'u2', { ok: true, item: {} })])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed'])
})

test('a call id is read once: the same call and result appended again say nothing new', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A), call(1, 'c1', replace(140)), result(1, 'c1', OK)])
  h.feed([call(1, 'c1', replace(140)), result(1, 'c1', OK)])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed'])
})

test('a message that is not a sent turn binds nothing; writes of that turn say nothing', () => {
  const h = harness()
  h.feed([turnStart(1), said('hello'), call(1, 'c1', replace(1)), result(1, 'c1', OK), turnEnd(1)])
  assert.deepEqual(h.out, [])
})

test('the same text in ANOTHER session, or written by a plugin, binds nothing', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)], 'append', 'session-2')
  h.feed([turnStart(1), said(TURN_A, 'plugin')])
  assert.deepEqual(h.out, [])
})

test('history is not news: a replace or prepend carrying a whole finished turn says nothing', () => {
  const h = harness()
  const turn = [turnStart(1), said(TURN_A), call(1, 'c1', replace(140)), result(1, 'c1', OK), turnEnd(1)]
  h.feed(turn, 'replace')
  h.feed(turn, 'prepend')
  assert.deepEqual(h.out, [])
})

test('one revision is read once, however often the source notifies', () => {
  const h = harness()
  h.tracker.feed(S, { revision: 5, change: { kind: 'append', entries: [turnStart(1), said(TURN_A)] } })
  h.tracker.feed(S, { revision: 5, change: { kind: 'append', entries: [turnStart(1), said(TURN_A)] } })
  assert.deepEqual(h.said(), ['req-A:tracy-working'])
})

test('a queued turn: the running turn’s end is not its end; it says working when its own turn starts', () => {
  const h = harness([
    ['req-A', { sessionId: S, siteKey: SITE, text: TURN_A }],
    ['req-B', { sessionId: S, siteKey: SITE, text: TURN_B }]
  ])
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'c1', replace(1)), result(1, 'c1', OK), turnEnd(1)])
  h.feed([turnStart(2), said(TURN_B), call(2, 'c2', replace(2)), result(2, 'c2', OK), turnEnd(2)])
  assert.deepEqual(h.said(), [
    'req-A:tracy-working',
    'req-A:site-changed',
    'req-A:turn-end',
    'req-B:tracy-working',
    'req-B:site-changed',
    'req-B:turn-end'
  ])
})

test('the message may land before the sender files its turn: the next event of that turn binds it', () => {
  const h = harness([])
  h.feed([turnStart(1), said(TURN_A)])
  h.sentTurns.set('req-A', { sessionId: S, siteKey: SITE, text: TURN_A })
  h.feed([call(1, 'c1', replace(1)), result(1, 'c1', OK)])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed'])
})

test('a turn that never ends is let go after an hour with its turn-end, so Refresh never spins forever', () => {
  let clock = 0
  /** @type {(() => void) | null} */
  let timer = null
  const h = harness(undefined, {
    now: () => clock,
    every: (fn) => {
      timer = fn
      return () => {
        timer = null
      }
    }
  })
  h.feed([turnStart(1), said(TURN_A)])
  assert.equal(typeof timer, 'function')
  clock = DROP_MS - 1
  h.tracker.tick()
  assert.deepEqual(h.said(), ['req-A:tracy-working'])
  clock = DROP_MS
  h.tracker.tick()
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:turn-end'])
  assert.equal(timer, null, 'no open turn, no timer')
  // Its late turn/end says nothing again.
  h.feed([turnEnd(1)])
  assert.equal(h.out.length, 2)
})

test('watchTurnProgress follows the conversation on screen and dispatches the events on the target', () => {
  /** @type {(() => void)[]} */
  const sourceListeners = []
  let snapshot = { revision: 0, change: undefined }
  const sessions = {
    list: {
      getSnapshot: () => ({ byId: { [S]: { retainedBy: { mainView: 1 } } } }),
      subscribe: () => () => {}
    },
    binding: (id) =>
      id === S
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
    target.addEventListener(type, (e) => seen.push([type, /** @type {CustomEvent} */ (e).detail]))
  const sentTurns = new Map([['req-A', { sessionId: S, siteKey: SITE, text: TURN_A }]])
  const stop = watchTurnProgress({ sessions, target, sentTurns })
  snapshot = {
    revision: 1,
    change: {
      kind: 'append',
      entries: [turnStart(1), said(TURN_A), call(1, 'c1', replace(1)), result(1, 'c1', OK)]
    }
  }
  for (const l of sourceListeners) l()
  const detail = { sessionId: S, requestId: 'req-A', siteKey: SITE }
  assert.deepEqual(seen, [
    [WORKING_EVENT, detail],
    [SITE_CHANGED_EVENT, detail]
  ])
  stop()
  // Without a registry it follows nothing and throws nothing.
  watchTurnProgress({ sessions, target, sentTurns: undefined })()
})

test('tracy_emdash writes are exactly the tools the preview reload counts as writes (one reading, two packages)', async () => {
  const { callChangedSite } = await import('../../../site/tracy-site-tabs/src/host/turn.mjs')
  const { readFileSync } = await import('node:fs')
  const fixture = JSON.parse(
    readFileSync(
      new URL('../../../tools/tracy-site-tools/test/fixtures/emdash/tools-0.38.json', import.meta.url),
      'utf8'
    )
  )
  const names = (fixture.tools ?? fixture.result?.tools ?? fixture).map((t) => t.name)
  assert.equal(names.length, 59)
  for (const name of [...names, 'content.update', 'page.text', 'page_look']) {
    const args = { tool: name, arguments: {} }
    assert.equal(
      callWrites('tracy_emdash', args),
      callChangedSite({ name: 'tracy_emdash', arguments: args }),
      name
    )
  }
  for (const args of [
    { action: 'content.update', params: {} },
    { action: 'content.replace', params: { dryRun: true } },
    { action: 'content.contract', params: { operation: 'inspect' } },
    { action: 'contract.apply', params: {} },
    { action: 'apply.revert', params: {} },
    { action: 'content.get', params: {} }
  ])
    assert.equal(
      callWrites('tracy_site', args),
      callChangedSite({ name: 'tracy_site', arguments: args }),
      args.action
    )
})

test('tracy_emdash: the door’s repairs are read as the door reads them — dotted names, nested calls, list and page reads', () => {
  assert.equal(callWrites('tracy_emdash', emdash(1, 'content.update', { id: 'x' })), true)
  assert.equal(
    callWrites('tracy_emdash', { arguments: { tool: 'menu_set_items', arguments: { name: 'main' } } }),
    true
  )
  assert.equal(callWrites('tracy_emdash', { list: true }), false)
  assert.equal(callWrites('tracy_emdash', emdash(4, 'page.text', { path: '/' })), false)
  assert.equal(callWrites('tracy_emdash', emdash(5, 'apply.revert', {})), false)
})

// ── Acceptance F2 (sender half): a look change and its undo change the site too ────────────────

/** A dsh file-tool result: plain text blocks, optionally the look-undo note site-tools appends. */
const fileResult = (turn, callId, texts, { isError = false } = {}) =>
  entry('tool/result', {
    turn,
    step: 1,
    message: {
      role: 'tool',
      toolCallId: callId,
      source: { kind: 'tool', callId },
      isError,
      content: texts.map((text) => ({ type: 'text', text }))
    }
  })
const NOTE =
  'undo: 7f3a9c — Tracy kept a copy of templates/tracy/css/custom.css before this look change; `tracy_site` `look.revert` {undo: "7f3a9c"} puts it back.'

test('F2: `look.revert` is a write — its result that went through is a site change', () => {
  assert.equal(callWrites('tracy_site', { action: 'look.revert', params: { undo: '7f3a9c' } }), true)
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([
    call(1, 'lr', { action: 'look.revert', params: { undo: '7f3a9c' } }),
    result(1, 'lr', { ok: true, restored: 1 })
  ])
  h.feed([
    call(1, 'lx', { action: 'look.revert', params: { undo: 'ffffff' } }),
    result(1, 'lx', { ok: false, code: 'LOOK_UNDO_NOT_FOUND' })
  ])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed'])
})

test('F2: a look file write (edit / write / shell) whose result carries `undo: <id>` is a site change', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([
    call(
      1,
      'e1',
      { file_path: '/site/n/templates/tracy/css/custom.css', old_string: 'a', new_string: 'b' },
      'edit'
    ),
    fileResult(1, 'e1', ['The file was edited.', NOTE])
  ])
  h.feed([
    call(1, 'w1', { file_path: '/site/n/custom.css', content: 'x' }, 'write'),
    fileResult(1, 'w1', ['Wrote 1 line.', NOTE])
  ])
  h.feed([call(1, 's1', { command: 'cp a.css b.css' }, 'bash'), fileResult(1, 's1', ['', NOTE])])
  assert.deepEqual(h.said(), [
    'req-A:tracy-working',
    'req-A:site-changed',
    'req-A:site-changed',
    'req-A:site-changed'
  ])
})

test('F2: a file write with no undo note, a failed one, or a note-looking line elsewhere changes nothing here', () => {
  const h = harness()
  h.feed([turnStart(1), said(TURN_A)])
  // A plain edit (not a look change): no undo note.
  h.feed([
    call(1, 'e1', { file_path: '/site/n/notes.txt', old_string: 'a', new_string: 'b' }, 'edit'),
    fileResult(1, 'e1', ['The file was edited.'])
  ])
  // An errored write, even with the note.
  h.feed([
    call(1, 'e2', { file_path: '/site/n/custom.css' }, 'edit'),
    fileResult(1, 'e2', ['failed', NOTE], { isError: true })
  ])
  // Not a six-hex id, or not at the start of its block.
  h.feed([
    call(1, 'e3', { file_path: '/site/n/custom.css' }, 'edit'),
    fileResult(1, 'e3', ['undo: later', 'see undo: 7f3a9c'])
  ])
  // A read tool never counts.
  h.feed([call(1, 'r1', { file_path: '/site/n/custom.css' }, 'read'), fileResult(1, 'r1', [NOTE])])
  h.feed([turnEnd(1)])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:turn-end'])
})

// ── Every turn of the conversation on screen (fix/refresh-chat-turns, 30/09/2026) ──
// Measured by Brian on the stand: a task TYPED in the chat of a conversation on r1e1734 wrote the
// site several times, and the Browser tab's Refresh said "New version ready" while Tracy was still at
// work — the 15 s poll saw Tracy's own write and the tab, never told a turn had started, was idle.

/** The site the session stands in, as `watchTurnProgress` answers it: only session S, on SITE. */
const onSite = { siteOf: (/** @type {string} */ id) => (id === S ? SITE : null) }

test('a turn typed in the chat of a conversation on this site: working, site-changed, turn-end, with its site', () => {
  const h = harness([], onSite)
  h.feed([turnStart(1), said('make the header blue')])
  h.feed([call(1, 'c1', replace(undefined)), result(1, 'c1', OK)])
  h.feed([call(1, 'c2', replace(undefined)), result(1, 'c2', OK)])
  h.feed([turnEnd(1)])
  const id = `turn:${S}:1`
  assert.deepEqual(h.said(), [
    `${id}:tracy-working`,
    `${id}:site-changed`,
    `${id}:site-changed`,
    `${id}:turn-end`
  ])
  for (const o of h.out) assert.deepEqual(o.detail, { sessionId: S, requestId: id, siteKey: SITE })
})

test('a turn of a conversation on another site (or on none) says nothing', () => {
  const h = harness([], onSite)
  h.feed(
    [turnStart(1), said('make the header blue'), call(1, 'c1', replace(1)), result(1, 'c1', OK), turnEnd(1)],
    'append',
    'session-2'
  )
  assert.deepEqual(h.out, [])
})

test('a chat turn asks and goes on like a sent one; a turn with no write ends with no site-changed', () => {
  const h = harness([], onSite)
  h.feed([turnStart(1), said('which colour?')])
  h.feed([call(1, 'q1', { questions: [] }, 'ask_user_question')])
  h.feed([result(1, 'q1', { answers: [] })])
  h.feed([turnEnd(1)])
  const id = `turn:${S}:1`
  assert.deepEqual(h.said(), [
    `${id}:tracy-working`,
    `${id}:tracy-asking`,
    `${id}:tracy-working`,
    `${id}:turn-end`
  ])
})

test('a Send to Tracy turn on a site is said once, under its request — not a second time as a chat turn', () => {
  const h = harness(undefined, onSite)
  h.feed([turnStart(1), said(TURN_A)])
  h.feed([call(1, 'c1', replace(140)), result(1, 'c1', OK), turnEnd(1)])
  assert.deepEqual(h.said(), ['req-A:tracy-working', 'req-A:site-changed', 'req-A:turn-end'])
})

test('a sent turn filed after its message landed takes over the chat turn already said: still one working', () => {
  const h = harness([], onSite)
  h.feed([turnStart(1), said(TURN_A)])
  h.sentTurns.set('req-A', { sessionId: S, siteKey: SITE, text: TURN_A })
  h.feed([call(1, 'c1', replace(1)), result(1, 'c1', OK), turnEnd(1)])
  assert.deepEqual(h.said(), [`turn:${S}:1:tracy-working`, 'req-A:site-changed', 'req-A:turn-end'])
})

test('a conversation left mid-turn and reopened after it ended: the history loaded again closes the turn', () => {
  const h = harness([], onSite)
  h.feed([turnStart(1), said('make the header blue'), call(1, 'c1', replace(1)), result(1, 'c1', OK)])
  // Away while the turn ended; coming back loads the window again (a replace), never an append.
  h.feed(
    [turnStart(1), said('make the header blue'), call(1, 'c1', replace(1)), result(1, 'c1', OK), turnEnd(1)],
    'replace'
  )
  const id = `turn:${S}:1`
  assert.deepEqual(h.said(), [`${id}:tracy-working`, `${id}:site-changed`, `${id}:turn-end`])
})

test('watchTurnProgress: a chat turn counts when the session stands in this page’s site (cwd /site/<label>)', () => {
  /** @type {(() => void)[]} */
  const listeners = []
  let snapshot = { revision: 0, change: undefined }
  const rows = { [S]: { retainedBy: { mainView: 1 }, cwd: '/site/northgate' } }
  const sessions = {
    list: { getSnapshot: () => ({ byId: rows }), subscribe: () => () => {} },
    binding: () => ({
      eventSource: { getSnapshot: () => snapshot, subscribe: (l) => (listeners.push(l), () => {}) }
    })
  }
  const run = (siteKey) => {
    const target = new EventTarget()
    const seen = []
    for (const type of [WORKING_EVENT, SITE_CHANGED_EVENT, TURN_END_EVENT])
      target.addEventListener(type, (e) => seen.push([type, /** @type {CustomEvent} */ (e).detail.siteKey]))
    listeners.length = 0
    snapshot = { revision: 0, change: undefined }
    const stop = watchTurnProgress({ sessions, target, sentTurns: new Map(), siteKey: () => siteKey })
    snapshot = {
      revision: 1,
      change: {
        kind: 'append',
        entries: [turnStart(1), said('hi'), call(1, 'c1', replace(1)), result(1, 'c1', OK), turnEnd(1)]
      }
    }
    for (const l of listeners) l()
    stop()
    return seen
  }
  assert.deepEqual(run(SITE), [
    [WORKING_EVENT, SITE],
    [SITE_CHANGED_EVENT, SITE],
    [TURN_END_EVENT, SITE]
  ])
  // The page is another site's workspace, or the creation workspace: the turn is not this tab's.
  assert.deepEqual(run('southgate.tracy.site'), [])
  assert.deepEqual(run(null), [])
  rows[S] = { retainedBy: { mainView: 1 } }
  assert.deepEqual(run(SITE), [], 'a session with no site folder names no site')
})
