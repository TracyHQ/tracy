// A free text answer is information for a model, never a field value (owner decision of 16/11): typed into the "Type
// your answer" box of a main button or a fact conflict question, it is never held to a template field's limit and never
// written into a field by code. It reaches the plan data as an owner statement tied to its question, which the page
// writer rewords. A chosen option (by id, or typed exactly as one of the offered labels) behaves as before. Invented
// club, scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-free-answers.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { ANSWER_SOURCE, settleAnswers } from '../domain/plan-answers.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { ownerFactView } from '../domain/page-writer-owner-facts.mjs'
import {
  PHONE_QUESTION,
  answer,
  blockStore,
  brand,
  conflictedClubProfile,
  conflictedClubResearch,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

// Shaped like the measured case: 76 characters for the main button, 30 for the phone conflict.
const BUTTON_TEXT = 'Book a free trial lesson, and say the first one is free for kids under ten!!'
const PHONE_TEXT = 'Use both, the 779 one for kids'
const LIMITS = new Map([
  ['contact.phone', 22],
  ['contact.cta_label', 32]
])

const inputs = (answers) => ({
  profile: conflictedClubProfile(),
  answers,
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club'
})

test('the fixture texts have the measured lengths', () => {
  assert.deepEqual([[...BUTTON_TEXT].length, [...PHONE_TEXT].length], [76, 30])
})

test('long free text on the main button and on a phone conflict is not answer_invalid', () => {
  const answers = [answer(PHONE_QUESTION, { text: PHONE_TEXT }), answer('main-button', { text: BUTTON_TEXT })]
  const { profile } = settleAnswers(conflictedClubProfile(), answers, LIMITS)
  // Nothing typed is written into a field: no main button fact, and the phone keeps its candidates, unsettled.
  assert.equal(profile.facts['contact.cta_label'], undefined)
  assert.equal(profile.facts['contact.phone'][0].value, '+1 555 0142 778')
  const conflict = profile.conflicts.find((c) => c.question === PHONE_QUESTION)
  assert.equal(conflict.chosen ?? null, null)
  assert.deepEqual(
    conflict.values.map((v) => v.value),
    ['+1 555 0142 778', '+1 555 0142 779']
  )
})

test('the composer input carries both texts as owner statements tied to their questions', () => {
  const answers = [answer(PHONE_QUESTION, { text: PHONE_TEXT }), answer('main-button', { text: BUTTON_TEXT })]
  const context = composerContextOf(inputs(answers))
  const statements = context.data.ownerFacts.filter((f) => f.question)
  assert.deepEqual(
    statements.map((f) => [f.question, f.text]),
    [
      [PHONE_QUESTION, PHONE_TEXT],
      ['main-button', BUTTON_TEXT]
    ]
  )
  const phone = statements[0]
  assert.match(phone.asked, /different values for your phone number/)
  assert.deepEqual(phone.candidates, ['+1 555 0142 778', '+1 555 0142 779'])
  assert.equal(statements[1].group, 'main-button')
  // The writer reads each one as a statement to reword, with its question and the candidate values.
  const view = ownerFactView(phone)
  assert.equal(view.kind, 'owner.fact')
  assert.equal(view.value, PHONE_TEXT)
  assert.match(view.question, /phone number/)
  assert.deepEqual(view.candidates, phone.candidates)
})

test('a plan is composed with both free answers: no stop, the conflict stays an assumption', async () => {
  const answers = [answer(PHONE_QUESTION, { text: PHONE_TEXT }), answer('main-button', { text: BUTTON_TEXT })]
  const { plan, profile } = await composePlan({
    ...inputs(answers),
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  assert.ok(plan.assumptions.some((a) => a.field === 'facts[contact-phone].value'))
  assert.equal(profile.facts['contact.cta_label'], undefined)
})

test('a chosen option keeps its behaviour: written as the fact, by id or typed as its exact label', () => {
  const byId = settleAnswers(conflictedClubProfile(), [answer('main-button', { choice: 'call' })], LIMITS)
  assert.deepEqual(byId.profile.facts['contact.cta_label'], [
    { value: 'Call us', sources: [ANSWER_SOURCE], confidence: 'single-source' }
  ])
  assert.equal(byId.profile.ownerFacts, undefined)
  const typedLabel = settleAnswers(
    conflictedClubProfile(),
    [answer('main-button', { text: ' call us ' }), answer(PHONE_QUESTION, { text: '+1 555 0142 779' })],
    LIMITS
  )
  assert.equal(typedLabel.profile.facts['contact.cta_label'][0].value, 'Call us')
  assert.equal(typedLabel.profile.facts['contact.phone'][0].value, '+1 555 0142 779')
  assert.equal(typedLabel.profile.ownerFacts, undefined)
})

test('a chosen option is still held to the template limit of its kind', () => {
  const short = new Map([['contact.cta_label', 5]])
  assert.throws(
    () => settleAnswers(conflictedClubProfile(), [answer('main-button', { choice: 'call' })], short),
    (e) =>
      e.code === 'answer_invalid' && /7 characters, longer than the 5/.test(e.details.problems[0].message)
  )
})

test('the free text box of a question is no longer capped by the template field', () => {
  const club = conflictedClubResearch()
  const store = blockStore()
  const profile = needsProfileOf(club.research, club.reading, { blockStore: store, library: library() })
  const button = profile.questions.find((q) => q.topic === 'main-button')
  assert.equal(button.freeText.maxLength, 80)
  // The offered choices still fit the template's button (18 characters in the invented club's store).
  for (const c of button.choices) assert.ok([...c.label].length <= 18, c.label)
  assert.equal(profile.questions.find((q) => q.id === PHONE_QUESTION).freeText.maxLength, 40)
})
