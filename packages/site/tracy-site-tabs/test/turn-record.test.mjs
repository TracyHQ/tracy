/**
 * The chat-turn record on the host's one dsh (plan `tasks/todo-site-changes.md` §6, Q2): a turn opens
 * when a person's message enters it, closes when the turn stops, and an idle sweeps the turns that
 * ended without stopping (aborted, errored).
 *
 *   node --test packages/site/tracy-site-tabs/test/turn-record.test.mjs
 *
 * `createTurnBook` is driven with a fake `send` — the seam where the plugin meets tracy-web — so what
 * is asserted is exactly what the doors receive, in order.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import {
  createTurnBook,
  endReasonOf,
  openingOf,
  REPLY_MAX,
  replyOf,
  TURN_UNDONE_PRODUCER,
  undoneOf,
  withUndoneNotice,
  workOf
} from '../src/host/turn-record.mjs'

/** A message the password gate stamped as typed by `email`. */
const said = (text, email = 'ada@example.com', extra = {}) => ({
  id: `msg-${text.length}-${email}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user', prompter: { user: 'Ada', email }, rpcId: `rpc-${text.length}` },
  ...extra
})
const notice = (text) => ({
  id: 'n-1',
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'tracy-site-tools' }
})

/** A `send` that records every door call and answers each with `answer(door, body)` (default 200). */
function recorder(answer = () => ({ ok: true, status: 200 })) {
  const sent = []
  /** The early `turn/undone` reads, apart: the doors these tests follow are open → steer → close. */
  const asks = []
  const send = async (door, body, who) => {
    if (door === 'turn/undone') {
      asks.push({ body, email: who.email })
      const a = await answer(door, body, sent.length)
      if (a instanceof Error) throw a
      return a
    }
    sent.push({ door, body, email: who.email })
    const a = await answer(door, body, sent.length)
    if (a instanceof Error) throw a
    return a
  }
  return { sent, asks, send }
}

const quiet = () => {}

test('openingOf: the first message a person typed with an address opens the turn; machine notices and unsigned messages do not', () => {
  assert.deepEqual(openingOf([notice('AGENTS.md'), said('Make the badge say Hello')]), {
    email: 'ada@example.com',
    title: 'Make the badge say Hello',
    source: 'panel',
    promptMessageId: 'msg-24-ada@example.com',
    rpcId: 'rpc-24'
  })
  assert.equal(openingOf([notice('only the machine')]), null)
  assert.equal(openingOf([]), null)
  assert.equal(openingOf(undefined), null)
  // A gate master account names a user but no address: nobody the seat book could check.
  assert.equal(
    openingOf([{ ...said('Hi'), source: { kind: 'user', prompter: { user: 'admin', email: '' } } }]),
    null
  )
  const comment = buildCommentTurn({
    text: 'Make this heading red',
    element: { url: 'https://s.test/', selector: 'h1', label: 'heading', text: 'Hello', marks: [] },
    locate: null
  })
  const fromComment = openingOf([said(comment)])
  assert.equal(fromComment?.source, 'comment')
  assert.equal(fromComment?.title, 'Make this heading red') // An unnumbered comment block carries no request number (its n is a placeholder): none is sent.
  assert.equal(fromComment?.commentNs, undefined)
})

test('openingOf: a numbered comment turn (Send to Tracy) names the request numbers it carries', () => {
  const element = { url: 'https://s.test/', selector: 'h1', label: 'heading', text: 'Hello', marks: [] }
  const one = buildCommentTurn({ items: [{ n: 38, text: 'Make this heading red', element }], numbered: true })
  assert.deepEqual(openingOf([said(one)])?.commentNs, [38])
  const two = buildCommentTurn({
    items: [
      { n: 4, text: 'Make this heading red', element },
      { n: 9, text: 'And bigger', element: { ...element, selector: 'h2' } }
    ]
  })
  const opening = openingOf([said(two)])
  assert.equal(opening?.source, 'comment')
  assert.deepEqual(opening?.commentNs, [4, 9])
})

test('a request longer than the cap opens its turn with requestState truncated; one within it sends none (QA-A11)', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  const long = `Append a line. ${' SCV2-qa1-A11-filler'.repeat(205)}`
  assert.ok(long.length > 4000)
  await book.stepEntered({ sessionId: 's-long', turn: 1, messages: [said(long)], cwd: '/site/lantern' })
  await book.stepEntered({
    sessionId: 's-short',
    turn: 1,
    messages: [said('Fix the footer')],
    cwd: '/site/lantern'
  })
  const [cut, whole] = sent.filter((s) => s.door === 'turn').map((s) => s.body)
  assert.equal(cut.requestState, 'truncated')
  assert.ok(cut.title.length <= 4000)
  assert.ok(cut.title.endsWith('…') && !cut.title.endsWith('……') && !cut.title.endsWith(' …'))
  assert.equal('requestState' in whole, false)
  assert.equal(openingOf([said(long)])?.requestCut, true)
  assert.equal(openingOf([said('Fix the footer')])?.requestCut, undefined)
})

test("a person's message opens the turn (awaited, before the step runs); its stop closes it with the same id", async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({
    sessionId: 'session-a1',
    turn: 3,
    messages: [said('Fix the footer')],
    cwd: '/site/lantern'
  })
  await book.turnStopping({ sessionId: 'session-a1', turn: 3 })
  assert.deepEqual(sent, [
    {
      door: 'turn',
      body: {
        turnId: 'session-a1:3',
        title: 'Fix the footer',
        source: 'panel',
        promptMessageId: 'msg-14-ada@example.com',
        rpcId: 'rpc-14',
        // This dsh holds the turn's first write behind earlier moments still committing (option A).
        waitsForMoments: true
      },
      email: 'ada@example.com'
    },
    { door: 'moment', body: { title: 'Fix the footer', turnId: 'session-a1:3' }, email: 'ada@example.com' }
  ])
  // A second stop of the same turn (another plugin steered it on) closes it again: a moment is cheap
  // when nothing is dirty, and the files written after the first stop must land somewhere.
  await book.turnStopping({ sessionId: 'session-a1', turn: 3 })
  assert.equal(sent.filter((s) => s.door === 'moment').length, 2)
})

test('a step with no person in it opens nothing, and a stop of a turn nobody opened records nothing', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({
    sessionId: 'session-a1',
    turn: 1,
    messages: [notice('site facts')],
    cwd: '/site/x'
  })
  await book.stepEntered({ sessionId: 'session-a1', turn: 1, messages: [], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 'session-a1', turn: 1 })
  assert.deepEqual(sent, [])
})

test('A05: three prompts in one conversation are three turns, each closed under its own id — never folded into one idle', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  const session = 'session-a1'
  for (const [turn, text] of [
    [1, 'Change the heading'],
    [2, 'What colour is the footer?'],
    [3, 'Make the footer blue']
  ]) {
    await book.stepEntered({ sessionId: session, turn, messages: [said(text)], cwd: '/site/x' })
    await book.turnStopping({ sessionId: session, turn })
  }
  assert.deepEqual(
    sent.map((s) => [s.door, s.body.turnId, s.body.title]),
    [
      ['turn', 'session-a1:1', 'Change the heading'],
      ['moment', 'session-a1:1', 'Change the heading'],
      ['turn', 'session-a1:2', 'What colour is the footer?'],
      ['moment', 'session-a1:2', 'What colour is the footer?'],
      ['turn', 'session-a1:3', 'Make the footer blue'],
      ['moment', 'session-a1:3', 'Make the footer blue']
    ]
  )
})

test('somebody typing again in the same turn marks it steered; the first message still names it', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({ sessionId: 's-1', turn: 1, messages: [said('Make it red')], cwd: '/site/x' })
  await book.stepEntered({ sessionId: 's-1', turn: 1, messages: [notice('a tool result')], cwd: '/site/x' })
  await book.stepEntered({
    sessionId: 's-1',
    turn: 1,
    messages: [said('no, blue', 'bo@example.com')],
    cwd: '/site/x'
  })
  await book.turnStopping({ sessionId: 's-1', turn: 1 })
  assert.deepEqual(
    sent.map((s) => [s.door, s.body.steered === true, s.email]),
    [
      ['turn', false, 'ada@example.com'],
      ['turn', true, 'bo@example.com'],
      ['moment', false, 'ada@example.com']
    ]
  )
  assert.equal(sent[1].body.title, 'Make it red')
  assert.equal(sent[2].body.title, 'Make it red')
})

test('A09: a close that fails is sent again, at most three times in all — once it lands, never again', async () => {
  const flaky = recorder((door, _body, n) =>
    door === 'moment' && n < 4 ? new Error('ECONNRESET') : { ok: true, status: 200 }
  )
  const book = createTurnBook({ send: flaky.send, warn: quiet, retryDelayMs: 0 })
  await book.stepEntered({ sessionId: 's-1', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 's-1', turn: 1 })
  assert.deepEqual(
    flaky.sent.map((s) => s.door),
    ['turn', 'moment', 'moment', 'moment']
  )
  await book.idle({
    sessionId: 's-1',
    events: [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'turn/end', data: { turn: 1 } }
    ]
  })
  assert.equal(flaky.sent.length, 4, 'a closed turn is not swept again')

  const down = recorder((door) =>
    door === 'moment' ? { ok: false, status: 502 } : { ok: true, status: 200 }
  )
  const book2 = createTurnBook({ send: down.send, warn: quiet, retryDelayMs: 0 })
  await book2.stepEntered({ sessionId: 's-2', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  await book2.turnStopping({ sessionId: 's-2', turn: 1 })
  await book2.idle({ sessionId: 's-2', events: [{ type: 'turn/end', data: { turn: 1 } }] })
  assert.equal(
    down.sent.filter((s) => s.door === 'moment').length,
    3,
    'three tries, then the row goes stale on the server'
  )
})

test('a stop never waits longer than its budget: a hung close lets the turn end', async () => {
  const hung = recorder((door) => (door === 'moment' ? new Promise(() => {}) : { ok: true, status: 200 }))
  const book = createTurnBook({ send: hung.send, warn: quiet, timeoutMs: 50, retryDelayMs: 0 })
  await book.stepEntered({ sessionId: 's-1', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  const started = Date.now()
  await book.turnStopping({ sessionId: 's-1', turn: 1 })
  assert.ok(Date.now() - started < 1000, `waited ${Date.now() - started} ms`)
})

test('an idle closes the turns that ended without stopping (aborted, errored); a turn still running is left alone', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({ sessionId: 's-1', turn: 4, messages: [said('Rebuild the menu')], cwd: '/site/x' })
  await book.stepEntered({ sessionId: 's-1', turn: 5, messages: [said('and the footer')], cwd: '/site/x' })
  await book.idle({
    sessionId: 's-1',
    events: [
      { type: 'turn/start', data: { turn: 4 } },
      { type: 'turn/end', data: { turn: 4, reason: { kind: 'aborted' } } },
      { type: 'turn/start', data: { turn: 5 } }
    ]
  })
  assert.deepEqual(
    sent.filter((s) => s.door === 'moment').map((s) => s.body.turnId),
    ['s-1:4']
  )
  // Another conversation's idle sweeps nothing of this one.
  await book.idle({ sessionId: 's-2', events: [{ type: 'turn/end', data: { turn: 5 } }] })
  assert.equal(sent.filter((s) => s.door === 'moment').length, 1)
})

test('an open that fails does not stop the turn: the step goes on, and the close is still sent', async () => {
  const { sent, send } = recorder((door) =>
    door === 'turn' ? new Error('ECONNREFUSED') : { ok: true, status: 200 }
  )
  const book = createTurnBook({ send, warn: quiet, retryDelayMs: 0 })
  await book.stepEntered({ sessionId: 's-1', turn: 1, messages: [said('Fix it')], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 's-1', turn: 1 })
  assert.deepEqual(
    sent.map((s) => s.door),
    ['turn', 'moment']
  )
})

// ── Tracy's answer (plan `tasks/todo-open-conversation.md` §C) ──────────────────────────────────

const V4 = JSON.parse(readFileSync(new URL('./fixtures/turn-events-v4.json', import.meta.url), 'utf8')).events
const answer = (turn, text, extra = {}) => ({
  type: 'assistant/message',
  data: {
    turn,
    step: 1,
    stream: [],
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    ...extra
  }
})

test('replyOf: the text of the turn’s LAST assistant message — no reasoning, tool call, tool result or narration; code is [code]', () => {
  const r = replyOf(V4, 3)
  assert.deepEqual(r, {
    reply:
      'Done — the About page is now **Our story**.\n\nI changed its title and slug:\n\n[code]\n\nThe menu picks the new name up by itself.',
    replyState: 'full'
  })
  for (const leak of [
    'hunter2',
    'DB_PASSWORD',
    'wp-config',
    'wp_update_post',
    'Let me find',
    'Now answer',
    'system-reminder'
  ])
    assert.ok(!r.reply.includes(leak), leak)
  assert.equal(replyOf(V4, 4), null, 'another turn has no answer here')
  assert.equal(replyOf([], 3), null)
  assert.equal(replyOf(undefined, 3), null)
})

test('replyOf: an unclosed fence runs to the end; ~~~ fences too; inline code stays', () => {
  assert.equal(
    replyOf([answer(1, 'See:\n~~~\nx\n~~~\nand `npm test`.\n```js\nnever closed')], 1).reply,
    'See:\n[code]\nand `npm test`.\n[code]'
  )
})

test('replyOf: past 2000 characters it is cut between words, marked … and truncated; a cancelled turn says interrupted', () => {
  const long = replyOf([answer(2, 'word '.repeat(700))], 2)
  assert.equal(long.replyState, 'truncated')
  assert.ok([...long.reply].length <= REPLY_MAX)
  assert.match(long.reply, /word…$/)
  assert.deepEqual(replyOf([answer(2, 'I was changing the', { interrupted: true })], 2), {
    reply: 'I was changing the',
    replyState: 'interrupted'
  })
  // A message with only a tool call (no text) is not the answer; the earlier text one is.
  const toolOnly = {
    type: 'assistant/message',
    data: { turn: 2, message: { content: [{ type: 'tool-call', name: 'x' }] } }
  }
  assert.equal(replyOf([answer(2, 'Here it is.'), toolOnly], 2).reply, 'Here it is.')
})

test('the close carries reply + replyState; a turn with no text, or an older caller with no events, sends neither', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({
    sessionId: 's-r',
    turn: 3,
    messages: [said('Rename the About page')],
    cwd: '/site/x'
  })
  await book.turnStopping({ sessionId: 's-r', turn: 3, events: V4 })
  const moment = sent.find((s) => s.door === 'moment')
  assert.equal(moment.body.replyState, 'full')
  assert.match(moment.body.reply, /^Done — the About page/)
  await book.stepEntered({ sessionId: 's-r', turn: 4, messages: [said('Again')], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 's-r', turn: 4, events: V4 })
  await book.stepEntered({ sessionId: 's-r', turn: 5, messages: [said('Old caller')], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 's-r', turn: 5 })
  const later = sent.filter((s) => s.door === 'moment').slice(1)
  assert.deepEqual(
    later.map((s) => s.body),
    [
      { title: 'Again', turnId: 's-r:4', endReason: 'completed' },
      { title: 'Old caller', turnId: 's-r:5' }
    ]
  )
})

test('a turn closed by the idle sweep (aborted) carries the words it got out', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({ sessionId: 's-i', turn: 1, messages: [said('Long job')], cwd: '/site/x' })
  await book.idle({
    sessionId: 's-i',
    events: [
      answer(1, 'Halfway there', { interrupted: true }),
      { type: 'turn/end', data: { turn: 1, reason: 'aborted' } }
    ]
  })
  assert.deepEqual(sent.find((s) => s.door === 'moment').body, {
    title: 'Long job',
    turnId: 's-i:1',
    reply: 'Halfway there',
    replyState: 'interrupted',
    endReason: 'aborted'
  })
})

test('the close names how the turn ended (turn/end reason): a model error, a block, a normal stop; a stop with no turn/end yet is completed', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  // Brian 03/10: "DeepSeek Messages transport failed" — the turn ended in an error and never stopped.
  await book.stepEntered({ sessionId: 's-e', turn: 2, messages: [said('Fix the footer')], cwd: '/site/x' })
  await book.stepEntered({ sessionId: 's-e', turn: 3, messages: [said('Blocked one')], cwd: '/site/x' })
  await book.idle({
    sessionId: 's-e',
    events: [
      {
        type: 'turn/end',
        data: { turn: 2, reason: { kind: 'error', error: { message: 'DeepSeek Messages transport failed' } } }
      },
      { type: 'turn/end', data: { turn: 3, reason: { kind: 'blocked' } } }
    ]
  })
  // A turn that stopped normally: its turn/end already in the log names it completed.
  await book.stepEntered({ sessionId: 's-e', turn: 4, messages: [said('All good')], cwd: '/site/x' })
  await book.turnStopping({
    sessionId: 's-e',
    turn: 4,
    events: [{ type: 'turn/end', data: { turn: 4, reason: { kind: 'completed' } } }]
  })
  // The log says nothing of turn 5 yet — dsh runs turn-stopping BEFORE it appends turn/end, so this is
  // every real stop: a turn that reached turn-stopping with no max-tokens step completed.
  await book.stepEntered({ sessionId: 's-e', turn: 5, messages: [said('Still going')], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 's-e', turn: 5, events: [] })
  const reasons = sent.filter((s) => s.door === 'moment').map((s) => [s.body.turnId, s.body.endReason])
  assert.deepEqual(reasons, [
    ['s-e:2', 'error'],
    ['s-e:3', 'blocked'],
    ['s-e:4', 'completed'],
    ['s-e:5', 'completed']
  ])
})

test('endReasonOf reads the kind of the turn’s own turn/end, object or bare word; an unknown kind is nothing', () => {
  const end = (turn, reason) => ({ type: 'turn/end', data: { turn, reason } })
  assert.equal(endReasonOf([end(1, { kind: 'error' }), end(2, { kind: 'completed' })], 2), 'completed')
  assert.equal(endReasonOf([end(1, 'aborted')], 1), 'aborted')
  assert.equal(endReasonOf([end(1, { kind: 'max-tokens' })], 1), 'max-tokens')
  assert.equal(endReasonOf([end(1, { kind: 'whatever' })], 1), null)
  assert.equal(endReasonOf([end(1, { kind: 'error' })], 2), null)
  assert.equal(endReasonOf(undefined, 1), null)
})

// ── What a turn took, for usage (plan tasks/todo-do-dung-that.md U1) ──────────────────────────────────

const step = (turn) => ({ type: 'step/start', data: { turn, step: 1 } })
const call = (turn) => ({ type: 'tool/call', data: { turn, callId: 'c', name: 'tracy_site' } })
const result = (turn, text, isError = false) => ({
  type: 'tool/result',
  data: { turn, message: { role: 'tool', isError, content: [{ type: 'text', text }] } }
})

test('workOf counts the turn’s own steps, calls and failed calls: ok:false at the top, or the error flag', () => {
  const events = [
    step(1),
    call(1),
    result(1, '{"ok":true}'),
    step(2),
    call(2),
    // a door's refusal: an ordinary answer, isError false — the flag alone would count none
    result(2, '{"ok":false,"code":"NOT_FOUND"}'),
    call(2),
    result(2, 'command not found', true),
    call(2),
    // a successful read whose items say ok:false is not a failure
    result(2, '{"ok":true,"items":[{"ok":false}]}'),
    call(2),
    result(2, 'plain text from bash'),
    step(2)
  ]
  assert.deepEqual(workOf(events, 2), { steps: 2, calls: 4, failedCalls: 2 })
  assert.deepEqual(workOf(events, 1), { steps: 1, calls: 1, failedCalls: 0 })
  assert.equal(workOf(events, 3), null, 'no step of that turn logged')
  assert.equal(workOf(undefined, 1), null)
})

test('the close carries work when the turn’s steps are in the log; an idle-swept turn too; none without', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  await book.stepEntered({ sessionId: 's-w', turn: 1, messages: [said('Make it blue')], cwd: '/site/x' })
  await book.turnStopping({
    sessionId: 's-w',
    turn: 1,
    events: [step(1), call(1), result(1, '{"ok":false}'), step(1)]
  })
  await book.stepEntered({ sessionId: 's-w', turn: 2, messages: [said('Again')], cwd: '/site/x' })
  await book.idle({
    sessionId: 's-w',
    events: [
      step(2),
      call(2),
      result(2, '{"ok":true}'),
      { type: 'turn/end', data: { turn: 2, reason: 'aborted' } }
    ]
  })
  await book.stepEntered({ sessionId: 's-w', turn: 3, messages: [said('Nothing logged')], cwd: '/site/x' })
  await book.turnStopping({ sessionId: 's-w', turn: 3, events: [] })
  const works = sent.filter((s) => s.door === 'moment').map((s) => [s.body.turnId, s.body.work])
  assert.deepEqual(works, [
    ['s-w:1', { steps: 2, calls: 1, failedCalls: 1 }],
    ['s-w:2', { steps: 1, calls: 1, failedCalls: 0 }],
    ['s-w:3', undefined]
  ])
})

// ── Undone from the chat (06/10/2026): the open's answer names them, the step carries one notice ──

const UNDONE = [
  { turn: 2, title: 'Make the heading say Welcome', complete: true },
  { turn: 1, title: 'Use brown', complete: false }
]

test('the open answers the turns the person undid since the last turn; a steer, a refusal or a thrown send answer none', async () => {
  const { send } = recorder((door) => ({
    ok: true,
    status: 200,
    // both doors read the same list (`undoneSince`); the early one answers it before the seal
    body: { ok: true, undone: door === 'turn' || door === 'turn/undone' ? UNDONE : [] }
  }))
  const book = createTurnBook({ send, warn: quiet })
  const open = (turn, text = 'Fix the footer') =>
    book.stepEntered({ sessionId: 'session-u1', turn, messages: [said(text)], cwd: '/site/lantern' })
  assert.deepEqual(await open(3), UNDONE)
  // The same turn again (a steer): the turn is already open, the undo already told.
  assert.deepEqual(await open(3, 'and the header too'), [])
  // No person in the step: nothing opened, nothing to tell.
  assert.deepEqual(
    await book.stepEntered({ sessionId: 'session-u1', turn: 4, messages: [], cwd: '/site/lantern' }),
    []
  )
  const refused = createTurnBook({ send: recorder(() => ({ ok: false, status: 500 })).send, warn: quiet })
  assert.deepEqual(
    await refused.stepEntered({ sessionId: 's', turn: 1, messages: [said('Hi')], cwd: '/site/x' }),
    []
  )
  const thrown = createTurnBook({ send: recorder(() => new Error('ECONNRESET')).send, warn: quiet })
  assert.deepEqual(
    await thrown.stepEntered({ sessionId: 's', turn: 1, messages: [said('Hi')], cwd: '/site/x' }),
    []
  )
  // An older tracy-web answers no body, or no list.
  const older = createTurnBook({ send: recorder().send, warn: quiet })
  assert.deepEqual(
    await older.stepEntered({ sessionId: 's', turn: 1, messages: [said('Hi')], cwd: '/site/x' }),
    []
  )
})

test('undoneOf keeps only well-formed entries, at most five', () => {
  assert.deepEqual(undoneOf(null), [])
  assert.deepEqual(undoneOf({ undone: 'yes' }), [])
  assert.deepEqual(
    undoneOf({
      undone: [{ turn: '2', title: 'x' }, { turn: 2 }, { turn: 2, title: 'ok', complete: 'true' }]
    }),
    [{ turn: 2, title: 'ok', complete: false }]
  )
  const many = Array.from({ length: 9 }, (_, i) => ({ turn: i + 1, title: `t${i}`, complete: true }))
  assert.equal(undoneOf({ undone: many }).length, 5)
})

test("withUndoneNotice: one agent-only notice right after the person's message; nothing when nothing was undone", () => {
  const before = notice('AGENTS.md')
  const person = said('Change the heading again')
  const after = notice('later context')
  const out = withUndoneNotice([before, person, after], UNDONE, 'n-undone')
  assert.equal(out.length, 4)
  assert.equal(out[0], before)
  assert.equal(out[1], person)
  assert.equal(out[3], after)
  assert.deepEqual(out[2], {
    id: 'n-undone',
    role: 'user',
    content: [
      {
        type: 'text',
        text:
          'Since your last reply, the person undid 2 of your earlier requests from the chat: ' +
          'request 2 "Make the heading say Welcome" (fully undone); request 1 "Use brown" (partly undone). ' +
          'The site is back to how it was before those requests. Do not say the site changed on its own; ' +
          'read the site again before you describe it.'
      }
    ],
    source: {
      kind: 'tracy-site',
      producer: TURN_UNDONE_PRODUCER,
      form: 'notice',
      summary: 'Earlier request undone'
    }
  })
  const same = [person]
  assert.equal(withUndoneNotice(same, [], 'n'), same)
  // No person's message in the step: nowhere to put it, nothing said.
  const machine = [before]
  assert.equal(withUndoneNotice(machine, UNDONE, 'n'), machine)
})

test("from the second turn on the step's undone list comes from turn/undone at once, while the open (and its seal) still runs; a first turn never asks", async () => {
  // 16/10/2026: the step waited for the open — the previous turn's sweep plus the seal — only for this list.
  /** @type {(v: unknown) => void} */
  let answerOpen = () => {}
  const asked = []
  const send = async (door, body) => {
    asked.push(door)
    if (door === 'turn/undone') return { ok: true, status: 200, body: { ok: true, undone: UNDONE } }
    if (door === 'turn' && body.steered !== true) return new Promise((resolve) => (answerOpen = resolve))
    return { ok: true, status: 200, body: { ok: true } }
  }
  const book = createTurnBook({ send, warn: quiet })
  const entered = book.enter({
    sessionId: 'session-q1',
    turn: 2,
    messages: [said('Fix the footer')],
    cwd: '/site/lantern'
  })
  assert.deepEqual(await entered.undone, UNDONE, 'answered while the open is still unanswered')
  const write = book.writeReady({ sessionId: 'session-q1' })
  let wrote = false
  void write.then(() => (wrote = true))
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(wrote, false, 'the first write still waits for the open: the seal guarantee does not move')
  answerOpen({ ok: true, status: 200, body: { ok: true, undone: UNDONE } })
  assert.equal(await write, true)

  // A tracy-web without the door (404) falls back to the open's list, as before.
  const older = createTurnBook({
    send: async (door) =>
      door === 'turn/undone'
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, body: { ok: true, undone: door === 'turn' ? UNDONE : [] } },
    warn: quiet
  })
  assert.deepEqual(
    await older.stepEntered({ sessionId: 'session-q2', turn: 2, messages: [said('Hi')], cwd: '/site/x' }),
    UNDONE
  )

  // A first turn names no undone turn: nothing is asked early.
  asked.length = 0
  await book.stepEntered({ sessionId: 'session-q3', turn: 1, messages: [said('Hi')], cwd: '/site/x' })
  assert.equal(asked.includes('turn/undone'), false)
})

// Local stand 24/10/2026: a check's notice and dsh's todo reminder, steered at turn-stopping after the close, ran
// the turn on with its row closed, and a build's every write in it was refused AGENT_DEMO_TURN_NOT_BOUND.
test('a step steered into a turn already closed opens it again, and the turn’s next stop closes it again', async () => {
  const { sent, send } = recorder()
  const book = createTurnBook({ send, warn: quiet })
  const at = { sessionId: 'build-1', turn: 1, cwd: '/site/lantern' }
  await book.stepEntered({ ...at, messages: [said('Build the whole site')] })
  // A notice in a turn still open sends nothing.
  await book.stepEntered({ ...at, messages: [notice('step budget')] })
  await book.turnStopping({ sessionId: 'build-1', turn: 1, events: [] })
  await book.stepEntered({ ...at, messages: [notice('Your todo list still has unfinished items')] })
  // Twice in the same closed run: one reopen.
  await book.stepEntered({ ...at, messages: [notice('again')] })
  await book.writeReady({ sessionId: 'build-1' })
  await book.turnStopping({ sessionId: 'build-1', turn: 1, events: [] })
  assert.deepEqual(
    sent.map((s) => [s.door, s.body.turnId, s.body.steered === true]),
    [
      ['turn', 'build-1:1', false],
      ['moment', 'build-1:1', false],
      ['turn', 'build-1:1', true],
      ['moment', 'build-1:1', false]
    ]
  )
  assert.equal(sent[2].body.title, 'Build the whole site')
  assert.equal(sent[2].email, 'ada@example.com')
})
