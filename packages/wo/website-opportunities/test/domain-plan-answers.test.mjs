// The customer's answers and the profile's conflicts on the plan (ticket #593, product decision of 13/11): an answer
// to a fact conflict sets the value, the main button, contact method and site language answers reach the plan, an
// invalid answer is a typed error, and every conflict left open is an assumption with its alternatives. A scripted
// fake model only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { PlanComposerError, composePlan } from '../domain/plan-composer.mjs'
import {
  PHONE_QUESTION,
  PRICE_QUESTION,
  answer,
  blockStore,
  brand,
  clubProfile,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const compose = (overrides = {}) => {
  const model = scriptedModel(JSON.stringify(goodComposition()))
  return composePlan({
    profile: conflictedClubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model,
    ...overrides
  }).then((result) => ({ ...result, model }))
}
const fact = (plan, id) => plan.facts.find((f) => f.id === id)
const assumptionOn = (plan, field) => plan.assumptions.find((a) => a.field === field)

test('a chosen value settles its conflict: the fact takes it, with its own sources, and no assumption is left', async () => {
  const { plan, profile } = await compose({ answers: [answer(PHONE_QUESTION, { choice: 'value-2' })] })
  assert.equal(fact(plan, 'contact-phone').value, '+1 555 0142 779')
  assert.deepEqual(fact(plan, 'contact-phone').sources, [{ kind: 'google', name: 'Google listing' }])
  assert.equal(assumptionOn(plan, 'facts[contact-phone].value'), undefined)
  assert.equal(profile.facts['contact.phone'][0].value, '+1 555 0142 779')
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})

test('a typed value settles an item field conflict; the page writer reads it from the returned profile', async () => {
  const { plan, profile } = await compose({ answers: [answer(PRICE_QUESTION, { text: '$26 per session' })] })
  const lessons = profile.items.service.find((i) => i.id === 'service-adult-group-lessons')
  assert.equal(lessons.fields['offering.price'].value, '$26 per session')
  assert.equal(fact(plan, 'service-adult-group-lessons-offering-price'), undefined)
  assert.ok(!plan.assumptions.some((a) => a.field.includes('offering-price')))
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('the main button, contact method and site language answers reach the plan', async () => {
  const profile = clubProfile()
  profile.questions.push(
    {
      schema: 'tracy-build-question/v1',
      id: 'contact-method',
      topic: 'contact-method',
      prompt: 'How?',
      choices: [{ id: 'phone', label: 'A phone number' }],
      freeText: { maxLength: 120 }
    },
    {
      schema: 'tracy-build-question/v1',
      id: 'site-language',
      topic: 'site-language',
      prompt: 'Which?',
      choices: [
        { id: 'en', label: 'English' },
        { id: 'pt-BR', label: 'Portuguese' }
      ],
      freeText: { maxLength: 40 }
    }
  )
  delete profile.facts['contact.email']
  const { plan } = await compose({
    profile,
    answers: [
      answer('main-button', { choice: 'call' }),
      answer('contact-method', { text: 'desk@brindlewick-tennis.example' }),
      answer('site-language', { choice: 'pt-BR' })
    ]
  })
  assert.equal(fact(plan, 'contact-cta-label').value, 'Call us')
  assert.deepEqual(fact(plan, 'contact-cta-label').sources, [{ kind: 'answer', name: 'Your answer' }])
  assert.equal(fact(plan, 'contact-email').value, 'desk@brindlewick-tennis.example')
  assert.equal(plan.language, 'pt-BR')
  // The main button's words go to the header's button field: placed by the gate, not dropped.
  const header = plan.pages[0].blocks.find((b) => b.block === 'header-main')
  assert.ok(header.data.includes('contact-cta-label'))
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('an invalid answer is a typed error before any model call, never a silent ignore', async () => {
  const cases = [
    [answer(PHONE_QUESTION, { choice: 'value-9' })],
    [answer(PHONE_QUESTION, { skipped: true })],
    [answer('no-such-question', { choice: 'x' })],
    [answer('main-button', { choice: 'book' }), answer('main-button', { choice: 'call' })],
    [answer(PHONE_QUESTION, { text: 'x'.repeat(41) })],
    [{ question: PHONE_QUESTION, choice: 'value-1' }],
    'not a list'
  ]
  for (const answers of cases) {
    const model = scriptedModel()
    await assert.rejects(
      compose({ answers, model }),
      (e) => e instanceof PlanComposerError && e.code === 'answer_invalid' && e.noRerun === true,
      JSON.stringify(answers)
    )
    assert.equal(model.calls.length, 0)
  }
})

test('every conflict left open is an assumption carrying its alternatives, item fields included', async () => {
  const { plan } = await compose()
  for (const [field, values] of [
    ['facts[business-founded-year].value', ['1987', '1989']],
    ['facts[contact-phone].value', ['+1 555 0142 778', '+1 555 0142 779']],
    ['facts[service-adult-group-lessons-offering-price].value', ['$25 per session', '$28 per session']],
    ['facts[person-ilse-varrow-person-role].value', ['Head coach', 'club coach']]
  ]) {
    const a = assumptionOn(plan, field)
    assert.ok(a, field)
    assert.deepEqual(
      a.alternatives.map((v) => v.value),
      values
    )
    assert.ok(a.alternatives.some((v) => v.value === fact(plan, /\[(.+)\]/.exec(field)[1]).value))
  }
  assert.match(assumptionOn(plan, 'facts[contact-phone].value').said, /did not confirm/)
  assert.match(assumptionOn(plan, 'facts[business-founded-year].value').said, /disagree/)
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('accounting: profile conflicts = settled by an answer + shown as an assumption with alternatives', async () => {
  const runs = [
    [],
    [answer(PHONE_QUESTION, { choice: 'value-1' })],
    [answer(PHONE_QUESTION, { text: '+1 555 0142 700' }), answer(PRICE_QUESTION, { choice: 'value-2' })]
  ]
  for (const answers of runs) {
    const { plan, conflicts } = await compose({ answers })
    const total = conflictedClubProfile().conflicts.length
    const settled = conflicts.filter((c) => c.settledBy === 'answer').length
    const assumed = conflicts.filter(
      (c) => c.assumption && plan.assumptions.find((a) => a.id === c.assumption)?.alternatives
    )
    console.log(`conflicts ${total} = answered ${settled} + assumptions ${assumed.length}`)
    assert.equal(total, 4)
    assert.equal(settled, answers.length)
    assert.equal(settled + assumed.length, total)
    assert.equal(conflicts.filter((c) => c.unexplained).length, 0)
  }
})
