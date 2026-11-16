// The answer reading on every question of the build chat (owner principle of 16/11): a typed contact method, site
// language or place choice is read by the model, never by a code pattern. A pressed option stays deterministic; an
// unusable reply falls back to an owner statement (or the default), never to `answer_invalid`. Invented club and
// bakery, scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-answer-reading-topics.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { needsAnswerReading, readOwnerAnswers } from '../domain/answer-reading.mjs'
import { ANSWER_SOURCE, settleAnswers } from '../domain/plan-answers.mjs'
import { PLACE_CHOICE_NONE, placeChoiceQuestionOf, placeOfChoice } from '../domain/place-choice-question.mjs'
import { answer, clubProfile, scriptedModel } from './fixtures/plan-composer/invented-club.mjs'

const PHONE = '+1 555 0142 310'
const EMAIL = 'desk@brindlewick-tennis.example'
const reply = (...answers) => JSON.stringify({ answers })

/** The invented club with no contact found, so the contact method and the site language are asked. */
function profile() {
  const p = clubProfile()
  for (const kind of ['contact.phone', 'contact.email', 'contact.cta_url']) delete p.facts[kind]
  p.questions.push(
    {
      schema: 'tracy-build-question/v1',
      id: 'contact-method',
      topic: 'contact-method',
      prompt: 'How should visitors contact you?',
      choices: [
        { id: 'phone', label: 'A phone number' },
        { id: 'email', label: 'An email address' },
        { id: 'link', label: 'A booking or contact link' }
      ],
      freeText: { maxLength: 120 }
    },
    {
      schema: 'tracy-build-question/v1',
      id: 'site-language',
      topic: 'site-language',
      prompt: 'Which language should the site be in?',
      choices: [
        { id: 'en', label: 'English' },
        { id: 'pt-BR', label: 'Portuguese' }
      ],
      freeText: { maxLength: 40 }
    }
  )
  return p
}
const read = async (answers, ...replies) => {
  const model = scriptedModel(...replies)
  return { readings: await readOwnerAnswers({ profile: profile(), answers, model }), model }
}

test('a typed contact method with two methods gives two contact facts with origin answer', async () => {
  const text = `Call ${PHONE} or write to ${EMAIL}`
  const answers = [answer('contact-method', { text })]
  const { readings, model } = await read(
    answers,
    reply({
      question: 'contact-method',
      facts: [
        { kind: 'contact.phone', value: PHONE, evidence: `Call ${PHONE}` },
        { kind: 'contact.email', value: EMAIL, evidence: `write to ${EMAIL}` }
      ]
    })
  )
  const sent = JSON.parse(model.calls[0].user).answers[0]
  assert.ok(sent.kinds.includes('contact.phone') && sent.kinds.includes('contact.email'))
  const { profile: settled } = settleAnswers(profile(), answers, new Map(), readings)
  assert.deepEqual(settled.facts['contact.phone'], [
    { value: PHONE, sources: [ANSWER_SOURCE], confidence: 'single-source' }
  ])
  assert.equal(settled.facts['contact.email'][0].value, EMAIL)
  assert.equal(settled.ownerFacts.find((f) => f.question === 'contact-method').text, text)
})

test('a typed contact method code would not have read is never answer_invalid; unusable, it stays a statement', async () => {
  const text = 'Just ring the front desk, they always pick up'
  const answers = [answer('contact-method', { text })]
  const { readings } = await read(answers, reply({ question: 'contact-method' }))
  const settled = settleAnswers(profile(), answers, new Map([['contact.phone', 5]]), readings)
  assert.equal(settled.profile.facts['contact.phone'], undefined)
  assert.equal(settled.profile.ownerFacts.find((f) => f.question === 'contact-method').text, text)
  // Without any reading at all (no call made, or it failed) the same holds.
  assert.equal(settleAnswers(profile(), answers).profile.facts['contact.email'], undefined)
})

test('a pressed contact method stays deterministic: no call, and its missing value is reported', async () => {
  const answers = [answer('contact-method', { choice: 'phone' })]
  assert.equal(needsAnswerReading(profile(), answers), false)
  const { leftOut } = settleAnswers(profile(), answers)
  assert.deepEqual(
    leftOut.map((l) => l.code),
    ['contact_value_missing']
  )
})

test('a typed site language is read by the model; code only checks the tag is a supported one', async () => {
  const text = 'Brazilian Portuguese please'
  const answers = [answer('site-language', { text })]
  const { readings, model } = await read(answers, reply({ question: 'site-language', language: 'pt-BR' }))
  assert.equal(JSON.parse(model.calls[0].user).answers[0].asks, 'language')
  const { profile: settled } = settleAnswers(profile(), answers, new Map(), readings)
  assert.deepEqual([settled.language.value, settled.language.chosenBy], ['pt-BR', 'answer'])
  // A tag that is no language, and no reading at all: the language stays as research found it, nothing stops.
  for (const r of [reply({ question: 'site-language', language: 'not a tag' }), 'not json']) {
    const bad = await read(answers, r)
    assert.equal(settleAnswers(profile(), answers, new Map(), bad.readings).profile.language.value, 'en')
  }
  // Code reads no language name: a typed "French" without a reading changes nothing.
  assert.equal(
    settleAnswers(profile(), [answer('site-language', { text: 'French' })]).profile.language.value,
    'en'
  )
  // The pressed option is as before.
  assert.equal(
    settleAnswers(profile(), [answer('site-language', { choice: 'pt-BR' })]).profile.language.value,
    'pt-BR'
  )
})

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

test('a typed place choice is read by the model: the offered place it names, or none', async () => {
  const q = placeChoiceQuestionOf([NORTH, SOUTH])
  const typed = answer(q.id, { text: 'the one on Fernwick Road' })
  const placeProfile = { questions: [q] }
  assert.equal(needsAnswerReading(placeProfile, [typed]), true)
  const model = scriptedModel(reply({ question: q.id, choice: SOUTH.providerId }))
  const readings = await readOwnerAnswers({ profile: placeProfile, answers: [typed], model })
  assert.equal(readings.get(q.id).choice, SOUTH.providerId)
  assert.equal(
    placeOfChoice(q, { ...typed, text: undefined, choice: SOUTH.providerId }).providerId,
    SOUTH.providerId
  )
  // Code matches no name or address: a typed address alone, with no reading, is none.
  assert.equal(placeOfChoice(q, answer(q.id, { text: '4 fernwick road, brackenford' })), PLACE_CHOICE_NONE)
  // Typed exactly as an offered label is that choice (trimming and case folding only).
  const label = q.choices.find((c) => c.id === SOUTH.providerId).label
  assert.equal(
    placeOfChoice(q, answer(q.id, { text: ` ${label.toUpperCase()} ` })).providerId,
    SOUTH.providerId
  )
})
