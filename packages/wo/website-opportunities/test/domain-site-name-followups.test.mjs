// Follow-ups to the site name question (#593): the invalid answer error, the shape of the three site name errors, the
// plan edit gate wording a held id neutrally, and the card edit of the business name to the held name. Invented
// club and people; scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-site-name-followups.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { siteNameMissingError } from '../domain/plan-site-name.mjs'
import { settleAnswers } from '../domain/plan-answers.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { withWithheld } from '../domain/plan-withheld.mjs'
import {
  COACH,
  SERVICES,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const HELD = 'Brindlewick Tennis Club'
const NEUTRAL = 'Racket club by the river'
const LIMITS = new Map([['business.name', 24]])
const QUOTE = 'quote-my-two-kids-love-the-junior-coaching'
const answer = (text, question = 'site-name') => ({ schema: 'tracy-build-answer/v1', question, text })
const caught = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  assert.fail('expected an error')
}

/** The club whose name research holds, a review quoting it, with no neutral identity yet. */
function pending(extra = {}) {
  const profile = clubProfile()
  profile.items.quote[1].fields['quote.text'].value = `${HELD} changed my kids' game.`
  return withWithheld(profile, { withheld: { name: true, ...extra } }, { limits: LIMITS })
}

test('1: a site name answer that is empty, with a control character, markup or markdown is site_name_invalid', () => {
  for (const text of ['   ', 'Two\nlines', '<b>Courts</b>', '**Courts**']) {
    const e = caught(() => settleAnswers(pending(), [answer(text)], LIMITS))
    assert.equal(e.code, 'site_name_invalid', JSON.stringify(text))
    assert.equal(e.noRerun, true)
    assert.equal(e.details.questionId, 'site-name')
    assert.equal(e.details.question.topic, 'site-name')
    assert.ok(e.details.problems.length > 0)
  }
})

test('1: a different topic invalid answer still gives answer_invalid', () => {
  const profile = pending()
  const e = caught(() => settleAnswers(profile, [answer('not a language', 'site-language')], LIMITS))
  assert.equal(e.code, 'answer_invalid')
  const bad = caught(() => settleAnswers(profile, [answer('Courts', 'no-such-question')], LIMITS))
  assert.equal(bad.code, 'answer_invalid')
})

test('2: the three site name errors carry the whole question and its id; too long keeps limit, length, problems', () => {
  const tooLong = caught(() => settleAnswers(pending(), [answer('R'.repeat(40))], LIMITS))
  assert.equal(tooLong.code, 'site_name_too_long')
  assert.equal(tooLong.details.question.id, 'site-name')
  assert.equal(tooLong.details.question.topic, 'site-name')
  assert.equal(tooLong.details.questionId, 'site-name')
  assert.equal(tooLong.details.limit, 24)
  assert.equal(tooLong.details.length, 40)
  assert.ok(tooLong.details.problems.length > 0)
  const invalid = caught(() => settleAnswers(pending(), [answer('')], LIMITS))
  assert.deepEqual(Object.keys(invalid.details).sort(), ['problems', 'question', 'questionId'])
  assert.deepEqual(invalid.details.question, tooLong.details.question)
  const missing = siteNameMissingError(pending(), LIMITS)
  assert.deepEqual(Object.keys(missing.details).sort(), ['question', 'questionId'])
  assert.deepEqual(missing.details.question, tooLong.details.question)
})

const inputs = () => ({
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand()
})
const withoutTeam = () => {
  const c = goodComposition()
  c.pages.splice(1, 1)
  c.assumptions = []
  return c
}

/** A plan composed while the name is held behind a neutral identity and Ilse Varrow is held; the full profile kept. */
async function held() {
  const settled = pending({ siteName: NEUTRAL, people: ['Ilse Varrow'] })
  const { plan, profile: stripped } = await composePlan({
    ...inputs(),
    profile: settled,
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(withoutTeam()))
  })
  const edit = (...changes) => ({
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-1',
    plan: { id: plan.id, revision: plan.revision },
    changes: changes.map(([field, value]) => ({ field, value }))
  })
  const gate = (e, profile = settled) => gateEditedPlan({ plan, edit: e, profile, ...inputs() })
  const services = plan.pages[0].blocks.find((b) => b.type === 'services')
  return { plan, settled, stripped, edit, gate, servicesField: `pages[home].blocks[${services.id}].data` }
}

test('3: bringing back a held person is refused with a message holding neither the id nor a token of the name', async () => {
  const { edit, gate, stripped, servicesField } = await held()
  for (const profile of [undefined, stripped]) {
    const result = gate(edit([servicesField, [...SERVICES, COACH]]), profile)
    assert.equal(result.ok, false)
    const text = JSON.stringify(result.problems).toLowerCase()
    for (const token of [COACH, 'ilse', 'varrow']) assert.equal(text.includes(token), false, token)
    assert.ok(result.problems.length > 0)
  }
  const full = gate(edit([servicesField, [...SERVICES, COACH]]))
  assert.deepEqual(
    full.problems.map((p) => [p.code, p.message]),
    [
      [
        'withheld_shown',
        'This change cannot be saved: A team member you keep private stays off your site. You asked to keep this off the site.'
      ]
    ]
  )
  const field = gate(edit([`items[${COACH}].label`, 'Coach']))
  assert.equal(field.ok, false)
  assert.equal(JSON.stringify(field.problems).toLowerCase().includes('ilse'), false)
  assert.equal(JSON.stringify(field.problems).includes(COACH), false)
})

test('4: a card edit of the name to the held name shows it: nothing hides it afterwards', async () => {
  const { edit, gate, settled } = await held()
  assert.deepEqual([...planDataOf(settled).withheld].sort(), [COACH, QUOTE].sort())
  for (const value of [HELD, `The ${HELD.toLowerCase()} Pro Shop`]) {
    const result = gate(edit(['facts[business-name].value', value]))
    assert.equal(result.ok, true, JSON.stringify(result.problems))
    assert.equal(result.profile.withheld.names, undefined)
    assert.equal(result.profile.withheld.siteName, value)
    assert.deepEqual([...planDataOf(result.profile).withheld], [COACH])
    assert.equal(result.profile.facts['business.name'][0].sources[0], 'customer-answer')
  }
})

test('4: a card edit to a different name keeps the original held name hidden and sets the site name', async () => {
  const { edit, gate } = await held()
  const result = gate(edit(['facts[business-name].value', 'Riverside Courts']))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(result.profile.withheld.names, [HELD])
  assert.equal(result.profile.withheld.siteName, 'Riverside Courts')
  assert.deepEqual([...planDataOf(result.profile).withheld].sort(), [COACH, QUOTE].sort())
})
