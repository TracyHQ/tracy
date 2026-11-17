// A typed answer is the owner's statement, read by the model (owner rule of 16/11): it is never held to the size of
// the field its value may reach (#609). A long sentence typed to a phone conflict question is a valid answer and
// reaches the answer reading whole; only the transport bound refuses, and the site name keeps its real limit.
// Invented club, scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-typed-answer-length.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { answerReadingRequest, needsAnswerReading } from '../domain/answer-reading.mjs'
import { TYPED_ANSWER_MAX_LENGTH, checkAnswer } from '../domain/build-contract-questions.mjs'
import { siteNameQuestionOf } from '../domain/plan-site-name-question.mjs'
import { PHONE_QUESTION, answer, conflictedClubProfile } from './fixtures/plan-composer/invented-club.mjs'

/** A 300 character owner sentence about their phone numbers, invented. */
const SENTENCE = (() => {
  const words =
    'Both numbers are ours. Please show +1 555 0142 778 as the main line for bookings and lessons, and keep the ' +
    'other one, +1 555 0142 779, for the pro shop only, because the front desk does not answer it after six in the ' +
    'evening and on Sundays the shop is closed, so callers should be sent to the main line. '
  return words.repeat(2).slice(0, 300)
})()

test('a 300 character typed answer to a phone conflict question is accepted and reaches the answer reading', () => {
  assert.equal([...SENTENCE].length, 300)
  const profile = conflictedClubProfile()
  const question = profile.questions.find((q) => q.id === PHONE_QUESTION)
  assert.equal(question.freeText.maxLength, TYPED_ANSWER_MAX_LENGTH)
  const typed = answer(PHONE_QUESTION, { text: SENTENCE })
  assert.deepEqual(checkAnswer(typed, question), { ok: true, problems: [] })
  assert.equal(needsAnswerReading(profile, [typed]), true)
  const request = JSON.stringify(answerReadingRequest(profile, [typed]))
  assert.ok(request.includes(JSON.stringify(SENTENCE).slice(1, -1)), 'the whole sentence reaches the reading')
})

test('only the transport bound refuses a typed statement; the site name keeps its own limit', () => {
  const question = conflictedClubProfile().questions.find((q) => q.id === PHONE_QUESTION)
  const over = answer(PHONE_QUESTION, { text: 'x'.repeat(TYPED_ANSWER_MAX_LENGTH + 1) })
  assert.equal(checkAnswer(over, question).ok, false)
  const name = siteNameQuestionOf(new Map())
  assert.equal(name.freeText.maxLength, 120)
  assert.equal(checkAnswer(answer(name.id, { text: 'N'.repeat(121) }), name).ok, false)
})
