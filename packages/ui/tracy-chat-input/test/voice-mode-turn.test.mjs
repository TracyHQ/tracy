// The turns a voice conversation follows (`src/client/voice-mode-turn.mjs`), read from dsh's event
// window as it is logged: turn marks with `data.turn`, model steps with `data.message.content`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followFrom, questionOf, startedIn, textOf, turnsOf, workOf } from '../src/client/voice-mode-turn.mjs'

const entry = (type, data) => ({ type: 'event', event: { type, data } })
const step = (...content) => entry('assistant/message', { message: { content } })

test('words followed by a call are said while working; the last words are the reply', () => {
  const [turn] = turnsOf([
    entry('turn/start', { turn: 2 }),
    entry('user/message', { content: [{ type: 'text', text: 'Make the button green' }] }),
    step({ type: 'reasoning', text: 'The user wants…' }, { type: 'text', text: 'Let me look first.' }),
    entry('tool/call', { callId: 'a', name: 'tracy_site', arguments: '{"action":"content.locate"}' }),
    entry('tool/result', { message: { toolCallId: 'a', content: [] } }),
    entry('tool/call', { callId: 'b', name: 'tracy_site', arguments: { action: 'content.replace' } }),
    step({ type: 'text', text: 'Done, it is green.' }),
    entry('turn/end', { turn: 2, reason: 'completed' })
  ])
  assert.deepEqual(turn, {
    turn: 2,
    ended: true,
    reason: 'completed',
    steps: [
      { kind: 'said', text: 'Let me look first.' },
      { kind: 'work', work: 'look' },
      { kind: 'work', work: 'words' }
    ],
    asking: null,
    askingId: null,
    choices: [],
    reviewing: false,
    planIds: [],
    reply: 'Done, it is green.'
  })
})

test('a second card in the same turn is a card of its own, named by the call that asked it', () => {
  const card = (callId, question) =>
    entry('tool/call', { callId, name: 'ask_user_question', arguments: { question } })
  const answered = (callId) => entry('tool/result', { message: { toolCallId: callId, content: [] } })
  const first = turnsOf([entry('turn/start', { turn: 3 }), card('q1', 'Which page?')])[0]
  assert.equal(first.askingId, 'q1')
  const second = turnsOf([
    entry('turn/start', { turn: 3 }),
    card('q1', 'Which page?'),
    answered('q1'),
    card('q2', 'Which colour?')
  ])[0]
  assert.equal(second.asking, 'Which colour?')
  assert.equal(second.askingId, 'q2')
  const none = turnsOf([entry('turn/start', { turn: 3 }), card('q1', 'Which page?'), answered('q1')])[0]
  assert.equal(none.askingId, null)
})

test('a turn that ended on a call has no reply; an interrupted step is not words', () => {
  const [turn] = turnsOf([
    entry('turn/start', { turn: 1 }),
    step({ type: 'text', text: 'Working on it.' }),
    entry('tool/call', { callId: 'a', name: 'bash', arguments: '{}' }),
    entry('assistant/message', {
      interrupted: true,
      message: { content: [{ type: 'text', text: 'Half a' }] }
    }),
    entry('turn/end', { turn: 1, reason: 'cancelled' })
  ])
  assert.equal(turn.reply, '')
  assert.equal(turn.reason, 'cancelled')
})

test('a question card is waited on until its result; a running turn is not ended', () => {
  const asking = turnsOf([
    entry('turn/start', { turn: 5 }),
    entry('tool/call', { callId: 'q', name: 'ask_user_question', arguments: { question: 'Which page?' } })
  ])[0]
  assert.equal(asking.ended, false)
  assert.equal(asking.asking, 'Which page?')
  assert.deepEqual(asking.steps, [], 'the card is not work to say')
  const choosing = turnsOf([
    entry('turn/start', { turn: 6 }),
    entry('tool/call', {
      callId: 'q',
      name: 'ask_user_question',
      arguments: JSON.stringify({
        questions: [{ id: 'c', question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Green' }] }]
      })
    })
  ])[0]
  assert.equal(choosing.asking, 'Which colour?')
  assert.deepEqual(choosing.choices, ['Red', 'Green'], 'its choices, to be asked out loud')
  // dsh writes why a turn ended as `{ kind }`.
  const failed = turnsOf([
    entry('turn/start', { turn: 7 }),
    entry('turn/end', { turn: 7, reason: { kind: 'error', error: { code: 'UNKNOWN' } } })
  ])[0]
  assert.equal(failed.reason, 'error')
  assert.equal(failed.reply, '')
  const answered = turnsOf([
    entry('turn/start', { turn: 5 }),
    entry('tool/call', { callId: 'q', name: 'ask_user_question', arguments: { question: 'Which page?' } }),
    entry('tool/result', { callId: 'q' })
  ])[0]
  assert.equal(answered.asking, null)
})

test('events before the window’s first turn start are left out; turns come oldest first', () => {
  const turns = turnsOf([
    step({ type: 'text', text: 'From a turn whose start is not here.' }),
    entry('turn/end', { turn: 1 }),
    entry('turn/start', { turn: 2 }),
    entry('turn/end', { turn: 2 }),
    entry('turn/start', { turn: 3 })
  ])
  assert.deepEqual(
    turns.map((t) => [t.turn, t.ended]),
    [
      [2, true],
      [3, false]
    ]
  )
})

test('what a call does, in plain kinds only', () => {
  assert.equal(workOf('tracy_site', '{"action":"content.read"}'), 'look')
  assert.equal(workOf('tracy_site', { action: 'content.replace' }), 'words')
  assert.equal(workOf('tracy_site', { action: 'content.contract' }), 'words')
  assert.equal(workOf('tracy_site', { action: 'look.set' }), 'design')
  assert.equal(workOf('tracy_site', { action: 'look.revert' }), 'undo')
  assert.equal(workOf('tracy_site', { action: 'apply.revert' }), 'undo')
  assert.equal(workOf('tracy_site', { action: 'media.upload' }), 'pictures')
  assert.equal(workOf('tracy_emdash', { action: 'something.new' }), 'site')
  assert.equal(workOf('edit', {}), 'files')
  assert.equal(workOf('bash', 'not json'), 'files')
  assert.equal(workOf('grep', {}), 'look')
  assert.equal(workOf('anything_else', {}), 'other')
  assert.equal(workOf(undefined, undefined), 'other')
})

test('the question of a card, as far as it says one', () => {
  assert.equal(questionOf({ questions: [{ question: ' Pick a colour? ' }] }), 'Pick a colour?')
  assert.equal(questionOf('{"question":"Which one?"}'), 'Which one?')
  assert.equal(questionOf({ options: [] }), '')
  assert.equal(textOf('  plain  '), 'plain')
})

test('followFrom: the turn running at the press, and the newest turn the window knows', () => {
  assert.deepEqual(followFrom([entry('turn/start', { turn: 4 }), entry('turn/end', { turn: 4 })]), {
    running: null,
    after: 4
  })
  assert.deepEqual(followFrom([entry('turn/start', { turn: 6 })]), { running: 6, after: 6 })
  assert.deepEqual(followFrom([]), { running: null, after: null })
  assert.deepEqual(
    startedIn({
      kind: 'append',
      entries: [entry('turn/start', { turn: 9 }), entry('turn/end', { turn: 8 })]
    }),
    [9]
  )
  assert.deepEqual(startedIn({ kind: 'replace', entries: [entry('turn/start', { turn: 9 })] }), [])
})

test('the plan calls a running turn waits on are named, oldest first; answered or ended, none', () => {
  const plan = (callId) =>
    entry('tool/call', { callId, name: 'exit_plan_mode', arguments: { plan: '# Plan' } })
  const answered = (callId) => entry('tool/result', { message: { toolCallId: callId, content: [] } })
  const one = turnsOf([entry('turn/start', { turn: 4 }), plan('p1')])[0]
  assert.equal(one.reviewing, true)
  assert.deepEqual(one.planIds, ['p1'])
  const two = turnsOf([entry('turn/start', { turn: 4 }), plan('p1'), plan('p2')])[0]
  assert.deepEqual(two.planIds, ['p1', 'p2'], 'two plans at once: Voice takes no approval for either')
  const again = turnsOf([entry('turn/start', { turn: 4 }), plan('p1'), answered('p1'), plan('p2')])[0]
  assert.deepEqual(again.planIds, ['p2'], 'a plan revised after feedback is a new call')
  const ended = turnsOf([entry('turn/start', { turn: 4 }), plan('p1'), entry('turn/end', { turn: 4 })])[0]
  assert.deepEqual(ended.planIds, [])
  assert.equal(ended.reviewing, false)
})
