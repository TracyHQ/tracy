// Review defects of the site name question (#593 review C, fix round 2): a name that names a held person, the held
// names research first kept, the card edit held to the answer's checks, invisible characters, white space, every
// site name problem as `site_name_invalid`, the Contract B cap, and plan edit refusals without internal ids.
// Invented club and people; scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-site-name-review-c2.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { FREE_TEXT_MAX } from '../domain/needs-profile-questions.mjs'
import { settleAnswers } from '../domain/plan-answers.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { siteNameQuestionOf, SITE_NAME_QUESTION_ID } from '../domain/plan-site-name-question.mjs'
import { withheldShowing } from '../domain/plan-site-name.mjs'
import { withWithheld, withoutWithheld } from '../domain/plan-withheld.mjs'
import {
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
const PERSON = 'Ilse Varrow'
const LIMITS = new Map([['business.name', 24]])
const answer = (text, extra = {}) => ({
  schema: 'tracy-build-answer/v1',
  question: 'site-name',
  text,
  ...extra
})
const caught = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  assert.fail('expected an error')
}
function pending(withheld = {}) {
  const profile = clubProfile()
  return withWithheld(profile, { withheld: { name: true, ...withheld } }, { limits: LIMITS })
}
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
async function composed(withheld = { siteName: NEUTRAL, people: [PERSON] }) {
  const { plan, profile } = await composePlan({
    ...inputs(),
    profile: pending(withheld),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(withoutTeam()))
  })
  const edit = (revision, ...changes) => ({
    schema: 'tracy-build-plan-edit/v1',
    id: `edit-${revision}`,
    plan: { id: plan.id, revision },
    changes: changes.map(([field, value]) => ({ field, value }))
  })
  // The template holds a business name of at most 24 characters (the club fixture sets no such limit itself).
  const limited = () => {
    const store = blockStore()
    store.blocks[0].fields.push({ name: 'brand', kind: 'business.name', type: 'text', limit: 24 })
    return { ...inputs(), blockStore: store }
  }
  const gate = (e, p = plan, pr = pending(withheld)) =>
    gateEditedPlan({ plan: p, edit: e, profile: pr, ...limited() })
  return { plan, profile, edit, gate }
}

test('12: an answer naming a held person is site_name_invalid before any model call, without printing the person', () => {
  for (const text of [`${PERSON} Tennis`, PERSON, `tennis with ${PERSON.toUpperCase()}`]) {
    const profile = pending({ people: [PERSON] })
    const e = caught(() => settleAnswers(profile, [answer(text)], LIMITS))
    assert.equal(e.code, 'site_name_invalid', text)
    assert.equal(e.details.questionId, SITE_NAME_QUESTION_ID)
    assert.equal(e.details.question.topic, 'site-name')
    assert.ok(
      e.details.problems.some((p) => p.message === 'This name includes a person you keep off the site.')
    )
    assert.equal(JSON.stringify([e.message, e.details.problems]).toLowerCase().includes('varrow'), false)
  }
})

test('12: the held person who is also the business name is refused, and un-hiding the name never un-hides a person', () => {
  const profile = pending({ people: [PERSON] })
  profile.withheld.names = [PERSON]
  assert.equal(caught(() => settleAnswers(profile, [answer(PERSON)], LIMITS)).code, 'site_name_invalid')
  const shown = withheldShowing({ name: true, people: [PERSON], names: [HELD], heldNames: [HELD] }, HELD)
  assert.deepEqual(shown.people, [PERSON])
  const stripped = withoutWithheld({
    ...profile,
    withheld: shown,
    facts: { 'business.name': [{ value: PERSON }] }
  })
  assert.equal(stripped.facts['business.name'], undefined)
})

test('12: a card edit of the name that names a held person is refused', async () => {
  const { edit, gate, plan } = await composed()
  const result = gate(edit(plan.revision, ['facts[business-name].value', `${PERSON} Tennis`]))
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => p.code),
    ['site_name_invalid']
  )
  assert.equal(result.problems[0].message, 'This name includes a person you keep off the site.')
})

test('13: held name, other name, held name, other name keeps the original name hidden at the end', () => {
  let withheld = pending().withheld
  assert.deepEqual(withheld.heldNames, [HELD])
  withheld = withheldShowing(withheld, 'Riverside Courts')
  assert.deepEqual([withheld.names, withheld.heldNames], [[HELD], [HELD]])
  withheld = withheldShowing(withheld, HELD)
  assert.equal(withheld.names, undefined)
  assert.deepEqual(withheld.heldNames, [HELD])
  withheld = withheldShowing(withheld, 'Riverside Courts')
  assert.deepEqual(withheld, { name: true, siteName: 'Riverside Courts', heldNames: [HELD], names: [HELD] })
  const old = withheldShowing({ name: true, siteName: 'X', names: [HELD] }, 'Riverside Courts')
  assert.deepEqual(old.names, [HELD])
})

test('13: two card edits in a row, the held name then another, hide the held name again', async () => {
  const { edit, gate, plan } = await composed({ siteName: NEUTRAL })
  const first = gate(edit(plan.revision, ['facts[business-name].value', HELD]))
  assert.equal(first.ok, true, JSON.stringify(first.problems))
  assert.equal(first.profile.withheld.names, undefined)
  const second = gate(
    edit(first.plan.revision, ['facts[business-name].value', 'Riverside Courts']),
    first.plan,
    first.profile
  )
  assert.equal(second.ok, true, JSON.stringify(second.problems))
  assert.deepEqual(second.profile.withheld.names, [HELD])
  assert.equal(second.profile.withheld.siteName, 'Riverside Courts')
})

test('14: a card edit of the name holds the limit of the template, worded for the customer', async () => {
  const { edit, gate, plan } = await composed()
  const result = gate(edit(plan.revision, ['facts[business-name].value', 'R'.repeat(62)]))
  assert.equal(result.ok, false)
  assert.equal(result.problems[0].code, 'site_name_too_long')
  assert.match(result.problems[0].message, /holds at most \d+ characters; this one has 62/)
  const markup = gate(edit(plan.revision, ['facts[business-name].value', '<b>Courts</b>']))
  assert.equal(markup.problems[0].code, 'site_name_invalid')
})

test('15: zero width characters are stripped, direction and format characters are refused', () => {
  const ok = settleAnswers(pending(), [answer('Courts​﻿')], LIMITS).profile
  assert.equal(ok.facts['business.name'][0].value, 'Courts')
  for (const text of ['Courts ‮evil', 'Court­s', 'Courts⁦x']) {
    assert.equal(
      caught(() => settleAnswers(pending(), [answer(text)], LIMITS)).code,
      'site_name_invalid',
      text
    )
  }
})

test('16: tabs and non-breaking spaces are collapsed, real control characters stay refused', () => {
  const settled = settleAnswers(pending(), [answer('Riverside\t  Courts')], LIMITS).profile
  assert.equal(settled.facts['business.name'][0].value, 'Riverside Courts')
  assert.equal(
    caught(() => settleAnswers(pending(), [answer('Two\nlines')], LIMITS)).code,
    'site_name_invalid'
  )
  assert.equal(
    caught(() => settleAnswers(pending(), [answer('Bell\u0007')], LIMITS)).code,
    'site_name_invalid'
  )
})

test('17: two answers or a choice answer to the site name question are site_name_invalid with the question', () => {
  for (const answers of [
    [answer('Courts'), answer('Other Courts')],
    [{ schema: 'tracy-build-answer/v1', question: 'site-name', choice: 'x' }]
  ]) {
    const e = caught(() => settleAnswers(pending(), answers, LIMITS))
    assert.equal(e.code, 'site_name_invalid')
    assert.equal(e.details.question.topic, 'site-name')
    assert.equal(e.details.questionId, 'site-name')
  }
})

test('18: Contract B refuses a site-name question whose free text goes beyond the topic cap', () => {
  const q = siteNameQuestionOf(new Map())
  assert.equal(q.freeText.maxLength, FREE_TEXT_MAX['site-name'])
  assert.equal(checkBuildDocument(q).ok, true)
  q.freeText.maxLength = 100000
  const res = checkBuildDocument(q)
  assert.equal(res.ok, false)
  assert.ok(res.problems.some((p) => p.at === 'freeText.maxLength'))
})

test('19: plan edit refusals name things by their plan label, never an internal id', async () => {
  const { edit, gate, plan } = await composed()
  const fields = [
    ['pages[nope].name', 'X'],
    ['pages[home].blocks[nope].label', 'X'],
    ['facts[nope].value', 'X'],
    ['pages[home].id', 'other'],
    ['pages[home].name', 7],
    ['pages[home].blocks[home-b1].reason', 'Nope']
  ]
  for (const [field, value] of fields) {
    const result = gate(edit(plan.revision, [field, value]))
    assert.equal(result.ok, false, field)
    for (const p of result.problems) {
      assert.doesNotMatch(p.message, /"|\[|\]|nope|home-b1/, `${field}: ${p.message}`)
      assert.match(p.message, /^This change cannot be saved: .+\.$/)
      if (p.code === 'edit_invalid') assert.ok(p.details?.problems?.length > 0, field)
    }
  }
  const twice = gate({
    ...edit(plan.revision, ['pages[home].name', 'A']),
    changes: [
      { field: 'pages[home].name', value: 'A' },
      { field: 'pages[home].name', value: 'B' }
    ]
  })
  assert.doesNotMatch(JSON.stringify(twice.problems.map((p) => p.message)), /pages\[|home/)
  assert.match(twice.problems[0].message, /The Home page is changed twice/)
  const dup = gate(
    edit(plan.revision, ['pages[home].blocks[home-b3].data', ['business-name', 'business-name']])
  )
  assert.equal(dup.ok, false)
  assert.doesNotMatch(dup.problems[0].message, /"|business-name/)
  assert.match(dup.problems[0].message, /Services section/)
})
