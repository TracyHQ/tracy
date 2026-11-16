// The place choice question (#609): a Google link that matches more than one place is asked about in the build chat,
// one choice per candidate (its name, its address as the detail) and a last "None of these". Every place here is
// invented; no place id is real.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-place-choice-question.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PLACE_CHOICE_NONE,
  PLACE_CHOICE_QUESTION_ID,
  checkAnswer,
  placeChoiceQuestionOf,
  placeOfChoice
} from '../domain/index.mjs'
import { questionProblems } from '../domain/build-contract-questions.mjs'

const NORTH = {
  provider: 'google-places',
  providerId: 'ChIJinventedNorth01',
  name: 'Hollowmere Bakehouse',
  address: '12 Quillan Lane, Brackenford'
}
const SOUTH = {
  provider: 'google-places',
  providerId: 'ChIJinventedSouth02',
  name: 'Hollowmere Bakehouse',
  address: '4 Fernwick Road, Brackenford'
}

const problemsOf = (question) => {
  const found = []
  questionProblems(question, (at, message) => found.push(`${at}: ${message}`))
  return found
}

test('two same name branches: one choice each, told apart by address, then None of these', () => {
  const q = placeChoiceQuestionOf([NORTH, SOUTH])
  assert.deepEqual(problemsOf(q), [])
  assert.equal(q.id, PLACE_CHOICE_QUESTION_ID)
  assert.equal(q.topic, 'place-choice')
  assert.equal(q.code, 'place_choice')
  assert.equal(q.prompt, 'We found more than one place on Google Maps under this name. Which one is yours?')
  assert.deepEqual(
    q.choices.map((c) => [c.id, c.label]),
    [
      [NORTH.providerId, 'Hollowmere Bakehouse, 12 Quillan Lane, Brackenford'],
      [SOUTH.providerId, 'Hollowmere Bakehouse, 4 Fernwick Road, Brackenford'],
      [PLACE_CHOICE_NONE, 'None of these']
    ]
  )
  assert.deepEqual(q.choices[1].params, { name: SOUTH.name, address: SOUTH.address })
  assert.equal(q.choices.at(-1).code, 'place_choice_none')
  assert.equal(new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`).test(JSON.stringify(q)), false)
})

test('at most five candidates are offered, each once, and long texts fit the card', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({
    provider: 'google-places',
    providerId: `ChIJinventedMany0${i}`,
    name: `Hollowmere Bakehouse ${'branch '.repeat(20)}${i}`,
    address: `${i} Quillan Lane ${'and more '.repeat(20)}`
  }))
  const q = placeChoiceQuestionOf([...many, many[0]])
  assert.deepEqual(problemsOf(q), [])
  assert.equal(q.choices.length, 6)
  assert.equal(new Set(q.choices.map((c) => c.id)).size, 6)
  assert.equal(new Set(q.choices.map((c) => c.label)).size, 6, 'the card answers by label: no label repeats')
  const same = placeChoiceQuestionOf([
    { ...NORTH, address: undefined },
    { ...SOUTH, address: undefined }
  ])
  assert.deepEqual(problemsOf(same), [])
  assert.deepEqual(
    same.choices.map((c) => c.label),
    ['Hollowmere Bakehouse', 'Hollowmere Bakehouse (2)', 'None of these']
  )
})

test('the answer names the picked candidate, None of these, or a typed exact label; code matches no name', () => {
  const q = placeChoiceQuestionOf([NORTH, SOUTH])
  const answer = (form) => ({ schema: 'tracy-build-answer/v1', question: q.id, ...form })
  assert.equal(checkAnswer(answer({ choice: SOUTH.providerId }), q).ok, true)
  assert.deepEqual(placeOfChoice(q, answer({ choice: SOUTH.providerId })), {
    provider: 'google-places',
    providerId: SOUTH.providerId,
    name: SOUTH.name,
    address: SOUTH.address
  })
  assert.equal(placeOfChoice(q, answer({ choice: PLACE_CHOICE_NONE })), PLACE_CHOICE_NONE)
  // An address or a name typed alone is read by the model first (`answer-reading.mjs`); code matches neither.
  assert.equal(placeOfChoice(q, answer({ text: '4 fernwick road, brackenford' })), PLACE_CHOICE_NONE)
  const label = q.choices.find((c) => c.id === SOUTH.providerId).label
  assert.equal(placeOfChoice(q, answer({ text: label.toLowerCase() })).providerId, SOUTH.providerId)
  assert.equal(placeOfChoice(q, answer({ text: 'the one by the river' })), PLACE_CHOICE_NONE)
  assert.equal(placeOfChoice(q, null), null)
})
