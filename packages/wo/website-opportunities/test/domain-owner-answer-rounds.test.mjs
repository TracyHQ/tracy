// What the owner of a business with no link answers in the build chat stays answered (#575 no link walk): typed opening
// hours are read by the model into hours lines the step chain can read (the walk kept the owner's own sentence, which
// no hours check reads, so the brief still missed the hours and the chat said so); and once the owner answered a round
// of brief questions, a later round asks only what blocks the build. Invented answers, a scripted model reply only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-answer-rounds.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkAnswerReading } from '../domain/answer-reading.mjs'
import { briefGapQuestionsOf } from '../domain/brief-gap-questions.mjs'
import { heldHoursPickOf } from '../domain/held-hours-question.mjs'

const HOURS_TEXT =
  'Open weekdays from six in the morning to nine at night, Saturday eight to noon, Sunday closed.'
const question = {
  id: 'brief-gap.hours',
  topic: 'brief-gap',
  prompt: 'What are your opening hours?',
  choices: []
}
const profile = { questions: [question] }
const answers = [{ question: question.id, text: HOURS_TEXT }]
const replyWith = (value, evidence = 'weekdays from six in the morning to nine at night') =>
  JSON.stringify({
    answers: [{ question: question.id, facts: [{ kind: 'contact.hours', value, evidence }] }]
  })

test('typed hours are kept as the hours lines the model wrote, when every line can be read', () => {
  const lines = 'Mo-Fr 06:00-21:00\nSa 08:00-12:00\nSu closed'
  const read = checkAnswerReading(replyWith(lines), profile, answers).get(question.id)
  assert.deepEqual(read.facts, [{ kind: 'contact.hours', value: lines, primary: false }])
  // The step chain's hours pick takes them as its lines.
  assert.deepEqual(heldHoursPickOf({ text: HOURS_TEXT }, read), {
    choice: 'edit',
    hours: ['Mo-Fr 06:00-21:00', 'Sa 08:00-12:00', 'Su closed']
  })
})

test('hours lines no hours check can read, or hours the text does not state, are not kept', () => {
  const unreadable = checkAnswerReading(replyWith('weekdays early to late'), profile, answers)
  assert.equal(unreadable.has(question.id), false)
  const unquoted = checkAnswerReading(replyWith('Mo-Fr 06:00-21:00', 'Monday to Friday'), profile, answers)
  assert.equal(unquoted.has(question.id), false, 'the evidence is words of the owner')
})

test('a phone value still has to be written in the text', () => {
  const reply = JSON.stringify({
    answers: [
      { question: question.id, facts: [{ kind: 'contact.phone', value: '+1 555 0100', evidence: 'six' }] }
    ]
  })
  assert.equal(checkAnswerReading(reply, profile, answers).has(question.id), false)
})

const readiness = {
  checks: [
    { verdict: 'block', questions: [{ id: 'q-offer' }] },
    { verdict: 'warn', questions: [{ id: 'q-phone' }] }
  ],
  ownerQuestions: [
    { id: 'q-offer', field: 'offerings' },
    { id: 'q-prices', field: 'prices' },
    { id: 'q-hours', field: 'hours' },
    { id: 'q-phone', field: 'phone' },
    { id: 'q-address', field: 'address' },
    { id: 'q-story', field: 'about.story' }
  ]
}

test('the first round asks three, blocking first; a later round asks only what still blocks', () => {
  const first = briefGapQuestionsOf(readiness)
  assert.deepEqual(
    first.map((q) => q.id),
    ['brief-gap.offerings', 'brief-gap.prices', 'brief-gap.hours']
  )
  const asked = ['offerings', 'prices', 'hours']
  assert.deepEqual(
    briefGapQuestionsOf(readiness, { asked }),
    [],
    'nothing blocks: the template card comes next'
  )
  // A later round with the blocking offerings never asked yet: only they are asked.
  assert.deepEqual(
    briefGapQuestionsOf(readiness, { asked: ['prices'] }).map((q) => q.id),
    ['brief-gap.offerings']
  )
})
