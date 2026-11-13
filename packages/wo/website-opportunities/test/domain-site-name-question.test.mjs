// The site name question (#593 G4): Contract B takes a free text `site-name` question with no choice, and the profile
// the plan step reads carries it only while research keeps the business name off the site and nothing neutral names
// it. Invented florist and tennis club; no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-site-name-question.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkBuildScenario } from '../domain/build-contract.mjs'
import { QUESTION_TOPICS, checkAnswer, questionProblems } from '../domain/build-contract-questions.mjs'
import * as domain from '../domain/index.mjs'
import { siteNameQuestionOf } from '../domain/plan-site-name-question.mjs'
import { withWithheld } from '../domain/plan-withheld.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'

const HELD = 'Larkspur Bloom'
const problemsOf = (question) => {
  const out = []
  questionProblems(question, (at, message) => out.push({ at, message }))
  return out
}
const heldProfile = () => {
  const profile = boxingProfile()
  profile.facts['business.name'] = [{ value: HELD, sources: ['site'], confidence: 'single-source' }]
  return profile
}

test('1: Contract B takes a site-name question with no choice', () => {
  assert.ok(QUESTION_TOPICS.includes('site-name'))
  assert.deepEqual(problemsOf(siteNameQuestionOf(new Map())), [])
  const answer = { schema: 'tracy-build-answer/v1', question: 'site-name', text: 'Riverside Courts' }
  assert.equal(checkAnswer(answer, siteNameQuestionOf(new Map())).ok, true)
})

test('1: the four old topics still require at least one choice', () => {
  for (const topic of ['main-button', 'contact-method', 'site-language', 'fact-conflict']) {
    const question = {
      ...siteNameQuestionOf(new Map()),
      id: topic,
      topic,
      ...(topic === 'fact-conflict' ? { fact: 'contact.phone' } : {})
    }
    assert.deepEqual(
      problemsOf(question).map((p) => p.at),
      ['choices'],
      topic
    )
  }
})

test('1: a site-name question WITH choices is refused, a choice could show the held name', () => {
  const question = { ...siteNameQuestionOf(new Map()), choices: [{ id: 'a', label: 'Riverside Courts' }] }
  assert.deepEqual(problemsOf(question), [
    { at: 'choices', message: 'a site-name question is free text only: its choices are an empty list' }
  ])
  assert.equal(problemsOf({ ...siteNameQuestionOf(new Map()), choices: undefined }).length > 0, true)
})

test('1: the sample scenario with a site name question and its answer passes the contract check', () => {
  const file = new URL(
    './fixtures/build-contract/sunrise-tennis-club-site-name.build-scenario.json',
    import.meta.url
  )
  const res = checkBuildScenario(JSON.parse(readFileSync(file, 'utf8')))
  assert.deepEqual(res.problems, [])
})

test('2: the profile carries the site name question first while the name is held and nothing neutral names it', () => {
  const profile = withWithheld(
    heldProfile(),
    { withheld: { name: true } },
    { limits: new Map([['business.name', 20]]) }
  )
  assert.deepEqual(profile.questions[0], {
    schema: 'tracy-build-question/v1',
    id: 'site-name',
    topic: 'site-name',
    prompt: 'Your site will not show the business name we found. What name should your site show instead?',
    choices: [],
    freeText: { maxLength: 20, placeholder: 'Type your answer' }
  })
  assert.equal(JSON.stringify(profile.questions).includes(HELD), false)
  assert.deepEqual(
    profile.questions.map((q) => q.id),
    ['site-name', 'main-button']
  )
  // Without a template the question keeps its own cap; a second pass never adds a second question.
  const again = withWithheld(profile, { withheld: { name: true } })
  assert.equal(again.questions.filter((q) => q.topic === 'site-name').length, 1)
  assert.equal(again.questions[0].freeText.maxLength, 120)
})

test('2: the question is absent when a neutral identity exists', () => {
  const profile = withWithheld(heldProfile(), { withheld: { name: true, siteName: 'Flowers in Ambermoor' } })
  assert.equal(
    profile.questions.some((q) => q.topic === 'site-name'),
    false
  )
})

test('2: the question is absent when the name is not held', () => {
  for (const research of [{}, { withheld: { people: ['Ilse Varrow'] } }]) {
    const profile = withWithheld(heldProfile(), research)
    assert.equal(
      profile.questions.some((q) => q.topic === 'site-name'),
      false
    )
  }
})

test('5: the domain index exports what the caller needs to recognise the site name topic', () => {
  assert.equal(domain.SITE_NAME_TOPIC, 'site-name')
  assert.equal(domain.SITE_NAME_QUESTION_ID, 'site-name')
  assert.equal(domain.siteNameMissing({ name: true }), true)
  assert.equal(domain.siteNameMissing({ name: true, siteName: 'Riverside Courts' }), false)
  assert.equal(typeof domain.siteNameQuestionOf, 'function')
  assert.equal(typeof domain.siteNameMissingError, 'function')
  assert.equal(typeof domain.normalisedSiteName, 'function')
})
