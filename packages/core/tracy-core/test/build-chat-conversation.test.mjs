// The build chat's first two pieces as data (#604): the research line and the questions are pure functions of what
// the build session received, so the same dsh chat components draw the sample scenarios now and real tool results
// later (#609).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAnswer } from '../../../wo/website-opportunities/domain/build-contract-questions.mjs'
import {
  answerOf,
  askRequestOf,
  MAX_QUESTIONS_AT_ONCE,
  researchRowOf,
  replyOf
} from '../src/build-chat/index.mjs'
import { RESEARCH, SCENARIOS } from './fixtures/build-chat/stages.mjs'

const QUESTIONS = SCENARIOS.done.questions

test('the research line is one row titled by how many sources were read, each source kept for the open row', () => {
  const row = researchRowOf(RESEARCH)
  assert.equal(row.title, 'Read 3 sources')
  assert.equal(row.summary, '4 services, 38 photos, 6 reviews')
  assert.deepEqual(
    row.details.items.map((s) => s.title),
    ['Website', 'Instagram', 'Google Maps']
  )
  assert.ok(row.details.items.every((s) => s.lines.length > 0))
  assert.equal(researchRowOf({ ...RESEARCH, sources: RESEARCH.sources.slice(0, 1) }).title, 'Read 1 source')
})

test('Contract B questions become one ask_user_question request: prompt, buttons, the recommended choice', () => {
  const request = askRequestOf(QUESTIONS, [])
  assert.equal(request.questions.length, 2)
  const [first, second] = request.questions
  assert.equal(first.id, 'main-button')
  assert.equal(first.question, 'What should visitors do first on your site?')
  assert.deepEqual(
    first.options.map((o) => o.label),
    ['Book a court', 'Call', 'WhatsApp', 'Send a form']
  )
  assert.equal(first.options[0].description, 'Your Instagram bio links to bookings')
  assert.equal(first.recommended, 'Book a court')
  assert.equal(first.multiSelect, false)
  assert.equal(second.recommended, '04 000 0000')
})

test('a request asks at most three questions, and answered ones are not asked again', () => {
  assert.equal(MAX_QUESTIONS_AT_ONCE, 3)
  const many = [1, 2, 3, 4, 5].map((n) => ({ ...QUESTIONS[0], id: `q${n}` }))
  assert.equal(askRequestOf(many, []).questions.length, 3)
  const answered = [{ schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'book' }]
  assert.deepEqual(
    askRequestOf(QUESTIONS, answered).questions.map((q) => q.id),
    ['phone']
  )
  assert.equal(askRequestOf(QUESTIONS, SCENARIOS.done.answers), null)
})

test('a picked button and a typed answer each become a Contract B answer that passes the check', () => {
  const [button, phone] = QUESTIONS
  const picked = answerOf(button, { id: 'main-button', selected: ['Book a court'] })
  assert.deepEqual(picked, { schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'book' })
  assert.deepEqual(checkAnswer(picked, button).problems, [])
  const typed = answerOf(phone, { id: 'phone', selected: [], custom: ' 04 000 0001 ' })
  assert.deepEqual(typed, { schema: 'tracy-build-answer/v1', question: 'phone', text: '04 000 0001' })
  assert.deepEqual(checkAnswer(typed, phone).problems, [])
  assert.equal(answerOf(phone, { id: 'phone', selected: [] }), null)
})

test('the given answers stay in the conversation as one reply, in the words the owner saw', () => {
  const reply = replyOf(QUESTIONS, SCENARIOS.done.answers)
  assert.equal(reply.outcome, 'answered')
  assert.deepEqual(
    reply.questions.map((q) => q.question),
    QUESTIONS.map((q) => q.prompt)
  )
  assert.deepEqual(
    reply.answers.map((a) => a.selected),
    [['Book a court'], ['04 000 0000']]
  )
  const typed = replyOf(QUESTIONS, [
    SCENARIOS.done.answers[0],
    { schema: 'tracy-build-answer/v1', question: 'phone', text: '04 000 0001' }
  ])
  assert.deepEqual(typed.answers[1], { id: 'phone', selected: [], custom: '04 000 0001' })
})
