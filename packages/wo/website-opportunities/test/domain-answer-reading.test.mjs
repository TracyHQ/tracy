// The answer reading (owner decision of 16/11): a free text answer is read by the standard build model before the
// planner, and the facts it states enter the profile with origin `answer`. A typed value settles its conflict, even
// against a website value; "use both" keeps the default primary and flags the statement; a main button sentence gives
// the offered kind and the extra contact facts; an unusable reply falls back to the owner statement without a stop; no
// call is made when every answer is a chosen option. Invented club, scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-answer-reading.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { needsAnswerReading, readOwnerAnswers } from '../domain/answer-reading.mjs'
import { ANSWER_SOURCE, settleAnswers } from '../domain/plan-answers.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { knownOf, ownerFactView, placeOwnerFacts } from '../domain/page-writer-owner-facts.mjs'
import {
  PHONE_QUESTION,
  PRICE_QUESTION,
  answer,
  blockStore,
  brand,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const WEBSITE_PHONE = '+1 555 0142 778'
const GOOGLE_PHONE = '+1 555 0142 779'
const THIRD = '+1 555 0177 310'
const inputs = (answers, answerReadings) => ({
  profile: conflictedClubProfile(),
  answers,
  answerReadings,
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club'
})
const reply = (...answers) => JSON.stringify({ answers })
const read = async (answers, ...replies) => {
  const model = scriptedModel(...replies)
  const readings = await readOwnerAnswers({ profile: conflictedClubProfile(), answers, model })
  return { readings, model }
}

test('no call is made when every answer is a chosen option', async () => {
  const answers = [answer(PHONE_QUESTION, { choice: 'value-2' }), answer('main-button', { choice: 'call' })]
  assert.equal(needsAnswerReading(conflictedClubProfile(), answers), false)
  // Typed exactly as an offered label is a chosen option too.
  assert.equal(
    needsAnswerReading(conflictedClubProfile(), [answer('main-button', { text: 'call us' })]),
    false
  )
  const { readings, model } = await read(answers)
  assert.equal(readings, null)
  assert.equal(model.calls.length, 0)
})

test('the request carries each free answer with its question, choices, candidates and allowed kinds only', async () => {
  const text = `Our real number is ${THIRD}`
  const { model } = await read([answer(PHONE_QUESTION, { text })], reply())
  assert.equal(model.calls.length, 1)
  assert.match(model.calls[0].system, /^DRAFT, not approved/)
  const sent = JSON.parse(model.calls[0].user).answers
  assert.equal(sent.length, 1)
  assert.deepEqual(
    [sent[0].question, sent[0].text, sent[0].candidates],
    [PHONE_QUESTION, text, [WEBSITE_PHONE, GOOGLE_PHONE]]
  )
  assert.ok(sent[0].kinds.includes('contact.phone') && sent[0].kinds.includes('contact.email'))
  assert.ok(!sent[0].kinds.includes('contact.cta_label'))
})

test('a typed third phone becomes contact.phone with origin answer, settling the conflict against the website', async () => {
  const text = `Our real number is ${THIRD}`
  const answers = [answer(PHONE_QUESTION, { text })]
  const { readings } = await read(
    answers,
    reply({ question: PHONE_QUESTION, facts: [{ kind: 'contact.phone', value: THIRD, evidence: text }] })
  )
  const context = composerContextOf(inputs(answers, readings))
  assert.deepEqual(context.profile.facts['contact.phone'][0].value, THIRD)
  assert.deepEqual(context.profile.facts['contact.phone'][0].sources, [ANSWER_SOURCE])
  const conflict = context.profile.conflicts.find((c) => c.question === PHONE_QUESTION)
  assert.deepEqual([conflict.chosen, conflict.chosenBy], [THIRD, 'answer'])
  // The statement still travels to the writer.
  assert.equal(context.data.ownerFacts.find((f) => f.question === PHONE_QUESTION).text, text)
  const { plan } = await composePlan({
    ...inputs(answers, readings),
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  assert.equal(plan.facts.find((f) => f.id === 'contact-phone').value, THIRD)
  assert.ok(!plan.assumptions.some((a) => a.field === 'facts[contact-phone].value'))
})

test('"use both" keeps the default primary, settles the conflict by the owner and flags the statement', async () => {
  const text = 'Use both numbers please'
  const answers = [answer(PHONE_QUESTION, { text })]
  const { readings } = await read(
    answers,
    reply({
      question: PHONE_QUESTION,
      facts: [
        { kind: 'contact.phone', value: GOOGLE_PHONE, evidence: 'Use both numbers' },
        { kind: 'contact.phone', value: WEBSITE_PHONE, evidence: 'Use both numbers' }
      ]
    })
  )
  const { profile, data } = composerContextOf(inputs(answers, readings))
  assert.equal(profile.facts['contact.phone'][0].value, WEBSITE_PHONE)
  const conflict = profile.conflicts.find((c) => c.question === PHONE_QUESTION)
  assert.deepEqual([conflict.chosen, conflict.chosenBy], [WEBSITE_PHONE, 'answer'])
  const said = data.ownerFacts.find((f) => f.question === PHONE_QUESTION)
  assert.deepEqual(said.mention, [{ kind: 'contact.phone', value: GOOGLE_PHONE }])
})

test('the model names the primary value when the owner states a preference', async () => {
  const text = 'Use both, the 779 one first'
  const answers = [answer(PHONE_QUESTION, { text })]
  const { readings } = await read(
    answers,
    reply({
      question: PHONE_QUESTION,
      facts: [
        { kind: 'contact.phone', value: GOOGLE_PHONE, evidence: 'the 779 one first', primary: true },
        { kind: 'contact.phone', value: WEBSITE_PHONE, evidence: 'Use both' }
      ]
    })
  )
  const { profile, data } = composerContextOf(inputs(answers, readings))
  assert.equal(profile.facts['contact.phone'][0].value, GOOGLE_PHONE)
  const said = data.ownerFacts.find((f) => f.question === PHONE_QUESTION)
  assert.deepEqual(said.mention, [{ kind: 'contact.phone', value: WEBSITE_PHONE }])
})

test('a main button sentence gives the offered kind the model picks plus the extra contact facts', async () => {
  const insta = 'https://www.instagram.com/brindlewick.example'
  const whatsapp = '+1 555 0199 412'
  const text = `Call us, and people can also message us on ${insta} or on WhatsApp at ${whatsapp}`
  const answers = [answer('main-button', { text })]
  const { readings } = await read(
    answers,
    reply({
      question: 'main-button',
      choice: 'call',
      facts: [
        { kind: 'contact.social_url', value: insta, evidence: `message us on ${insta}` },
        { kind: 'contact.phone', value: whatsapp, evidence: `WhatsApp at ${whatsapp}` }
      ]
    })
  )
  const { profile, data } = composerContextOf(inputs(answers, readings))
  assert.equal(profile.facts['contact.cta_label'][0].value, 'Call us')
  const social = profile.facts['contact.social_url'].find((f) => f.value === insta)
  assert.deepEqual(social.sources, [ANSWER_SOURCE])
  // The phone kind holds one value, from the website: the owner's second number is flagged on the statement.
  assert.equal(profile.facts['contact.phone'][0].value, WEBSITE_PHONE)
  const said = data.ownerFacts.find((f) => f.question === 'main-button')
  assert.deepEqual(said.mention, [{ kind: 'contact.phone', value: whatsapp }])
})

test('nothing is length-checked before the model: a long typed price is the price the gate then judges', async () => {
  const text = 'It is $26 per session for members and guests alike'
  const value = '$26 per session for members and guests'
  const answers = [answer(PRICE_QUESTION, { text })]
  const { readings } = await read(
    answers,
    reply({ question: PRICE_QUESTION, facts: [{ kind: 'offering.price', value, evidence: text }] })
  )
  // A template whose price field holds 10 characters: the answer settling refuses nothing.
  const limits = new Map([['offering.price', 10]])
  const { profile } = settleAnswers(conflictedClubProfile(), answers, limits, readings)
  const lessons = profile.items.service.find((i) => i.id === 'service-adult-group-lessons')
  assert.deepEqual(
    [lessons.fields['offering.price'].value, lessons.fields['offering.price'].sources],
    [value, [ANSWER_SOURCE]]
  )
  const conflict = profile.conflicts.find((c) => c.question === PRICE_QUESTION)
  assert.deepEqual([conflict.chosen, conflict.chosenBy], [value, 'answer'])
})

test('an unusable reply falls back to the owner statement, never a stop', async () => {
  const text = `Our real number is ${THIRD}`
  const answers = [answer(PHONE_QUESTION, { text })]
  const unusable = [
    'not json',
    reply({ question: PHONE_QUESTION }),
    // An invented value (not in the text, not a candidate) and evidence the owner never wrote.
    reply({
      question: PHONE_QUESTION,
      facts: [{ kind: 'contact.phone', value: '+1 555 0100 999', evidence: 'call this one' }]
    }),
    // A kind the question does not allow.
    reply({
      question: PHONE_QUESTION,
      facts: [{ kind: 'business.name', value: 'Our real number', evidence: 'Our real number' }]
    }),
    // A choice that is not offered.
    reply({ question: PHONE_QUESTION, choice: 'value-9' }),
    async () => {
      throw new Error('the model door failed')
    }
  ]
  for (const r of unusable) {
    const { readings } = await read(answers, r)
    const { profile, data } = composerContextOf(inputs(answers, readings))
    assert.equal(profile.facts['contact.phone'][0].value, WEBSITE_PHONE, String(r))
    assert.equal(profile.conflicts.find((c) => c.question === PHONE_QUESTION).chosen ?? null, null)
    assert.equal(data.ownerFacts.find((f) => f.question === PHONE_QUESTION).text, text)
  }
})

test('a typed answer the model reads as an offered choice settles as that choice and stays a statement', async () => {
  const text = 'The one Google shows is right'
  const answers = [answer(PHONE_QUESTION, { text })]
  const { readings } = await read(answers, reply({ question: PHONE_QUESTION, choice: 'value-2' }))
  const { profile, data } = composerContextOf(inputs(answers, readings))
  assert.equal(profile.facts['contact.phone'][0].value, GOOGLE_PHONE)
  assert.equal(profile.conflicts.find((c) => c.question === PHONE_QUESTION).chosenBy, 'answer')
  assert.equal(data.ownerFacts.find((f) => f.question === PHONE_QUESTION).text, text)
})

test('the writer reads a flagged statement with its contact values and may name them', () => {
  const view = ownerFactView({
    id: 'answer-x',
    text: 'Use both numbers please',
    mention: [{ kind: 'contact.phone', value: GOOGLE_PHONE }]
  })
  assert.deepEqual(view.mention, [{ kind: 'contact.phone', value: GOOGLE_PHONE }])
  assert.match(view.mentionUse, /contact copy, exactly as written/)
  assert.ok(
    knownOf([], { ownerFacts: [{ text: 'x', mention: view.mention }] }).some((k) => k.value === GOOGLE_PHONE)
  )
})

test('a flagged statement is placed on the contact page block with the most room to write', () => {
  const plan = {
    pages: [
      { id: 'home', pageType: 'home', blocks: [{ id: 'h1', data: [] }] },
      {
        id: 'contact',
        pageType: 'contact',
        blocks: [
          { id: 'c1', data: [] },
          { id: 'c2', data: [] }
        ]
      }
    ]
  }
  const slot = (block, limit) => ({ block, from: 'writer', field: { kind: 'editorial.body', limit } })
  const fieldsByPage = [[slot('h1', 200)], [slot('c1', 40), slot('c2', 120)]]
  const facts = [
    {
      id: 'answer-a',
      group: 'contact',
      text: 'Use both',
      mention: [{ kind: 'contact.phone', value: GOOGLE_PHONE }]
    },
    { id: 'answer-b', group: 'contact', text: 'No flag' }
  ]
  const { placed } = placeOwnerFacts(plan, { data: { ownerFacts: facts, byId: new Map() } }, fieldsByPage)
  assert.deepEqual(
    placed.map((p) => [p.id, p.block]),
    [
      ['answer-a', 'c2'],
      ['answer-b', 'h1']
    ]
  )
})

test('the primary value is never picked by code: none marked keeps the default, two marked is unread', async () => {
  const other = '+1 555 0188 204'
  const text = `Use ${THIRD} and ${other}`
  const answers = [answer(PHONE_QUESTION, { text })]
  const fact = (value, primary) => ({ kind: 'contact.phone', value, evidence: text, primary })
  // Two new values, no preference stated: the default stays primary, both values are flagged, never the first one.
  const none = await read(answers, reply({ question: PHONE_QUESTION, facts: [fact(THIRD), fact(other)] }))
  const a = composerContextOf(inputs(answers, none.readings))
  assert.equal(a.profile.facts['contact.phone'][0].value, WEBSITE_PHONE)
  assert.deepEqual(
    a.data.ownerFacts.find((f) => f.question === PHONE_QUESTION).mention.map((m) => m.value),
    [THIRD, other]
  )
  // Both marked primary: no answer to which one is, so the kind is unread and the answer stays a statement.
  const both = await read(
    answers,
    reply({ question: PHONE_QUESTION, facts: [fact(THIRD, true), fact(other, true)] })
  )
  assert.equal(both.readings.size, 0)
})
