// Every research question carries a stable code and its params, and every choice a stable id and code (#609): the
// chat can then show a question in the customer's language from the code, the English text staying the fallback, and
// a choice whose label holds data (a phone number, a language) carries that data as params. Contract B accepts both
// fields, under the rules of the plan's codes (`build-contract-plan-codes.mjs`). Invented business, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-question-codes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { questionProblems } from '../domain/build-contract-questions.mjs'
import { reporterFor } from '../domain/build-contract-shared.mjs'
import { questionsOf, siteLanguageOf } from '../domain/needs-profile-questions.mjs'

const sources = [
  { id: 'website', origin: 'website', language: 'en' },
  { id: 'google', origin: 'google', language: 'fr' }
]
const conflict = (id, kind, at, values) => ({ id, kind, at, values, default: values[0].value })
const PROFILE = {
  facts: { 'contact.phone': [{ value: '+1 555 0100' }], 'contact.address': [{ value: '1 Pier Road' }] },
  items: { service: [{ id: 'service-basics', fields: { 'offering.name': { value: 'Basics Course' } } }] },
  conflicts: [
    conflict('conflict-1', 'contact.phone', 'facts.contact.phone', [
      { value: '+1 555 0100', sources: ['website'] },
      { value: '+1 555 0199', sources: ['google'] }
    ]),
    conflict('conflict-2', 'offering.price', 'items.service.service-basics.offering.price', [
      { value: '$90', sources: ['website'] },
      { value: '$95', sources: ['google'] }
    ])
  ],
  sources,
  language: siteLanguageOf(sources)
}
const problemsOf = (q) => {
  const problems = []
  questionProblems(q, reporterFor(problems))
  return problems
}
const shapeOf = (q) => ({
  code: q.code,
  params: q.params,
  choices: q.choices.map((c) => [c.id, c.code, c.params])
})

test('every question and choice carries its code and params, and stays a valid Contract B question', () => {
  const { questions } = questionsOf(PROFILE)
  for (const q of questions) assert.deepEqual(problemsOf(q), [], q.id)
  assert.deepEqual(questions.map(shapeOf), [
    {
      code: 'fact_conflict_business',
      params: { fact: 'contact.phone' },
      choices: [
        ['value-1', 'fact_conflict_value', { value: '+1 555 0100', from: 'website' }],
        ['value-2', 'fact_conflict_value', { value: '+1 555 0199', from: 'google_maps' }]
      ]
    },
    {
      code: 'main_button',
      params: {},
      choices: [
        ['call', 'main_button_call', {}],
        ['visit', 'main_button_visit', {}]
      ]
    },
    {
      code: 'site_language',
      params: {},
      choices: [
        ['en', 'site_language_option', { language: 'en' }],
        ['fr', 'site_language_option', { language: 'fr' }]
      ]
    },
    {
      code: 'fact_conflict_item',
      params: { fact: 'offering.price', item: 'Basics Course' },
      choices: [
        ['value-1', 'fact_conflict_value', { value: '$90', from: 'website' }],
        ['value-2', 'fact_conflict_value', { value: '$95', from: 'google_maps' }]
      ]
    }
  ])
})

test('the contact method question and the short main button labels carry their own codes', () => {
  const { questions } = questionsOf({
    facts: { 'contact.address': [{ value: '1 Pier Road' }] },
    sources,
    language: { value: 'en', options: ['en'], mixed: false },
    limits: new Map([['contact.cta_label', 6]])
  })
  assert.deepEqual(questions.map(shapeOf), [
    { code: 'main_button', params: {}, choices: [['visit', 'main_button_visit_short', {}]] },
    {
      code: 'contact_method',
      params: {},
      choices: [
        ['phone', 'contact_method_phone', {}],
        ['email', 'contact_method_email', {}],
        ['link', 'contact_method_link', {}]
      ]
    }
  ])
})

test('Contract B refuses a code that is not lower case words joined by underscores, and params that are not plain values', () => {
  const [q] = questionsOf(PROFILE).questions
  assert.ok(problemsOf({ ...q, code: 'fact_conflict.business' }).some((p) => p.at === 'code'))
  assert.ok(problemsOf({ ...q, params: { fact: { deep: true } } }).some((p) => p.at === 'params.fact'))
  const choices = [{ ...q.choices[0], params: [] }, q.choices[1]]
  assert.ok(problemsOf({ ...q, choices }).some((p) => p.at.endsWith('.params')))
})

test("a value from the owner's chat answer is said to come from Your answer, never from a social profile", () => {
  const owned = [...sources, { id: 'owner-statement', origin: 'answer' }]
  const { questions } = questionsOf({
    ...PROFILE,
    sources: owned,
    conflicts: [
      conflict('conflict-1', 'contact.phone', 'facts.contact.phone', [
        { value: '+1 555 0100', sources: ['website'] },
        { value: '+1 555 0177', sources: ['owner-statement'] }
      ])
    ]
  })
  const [, fromOwner] = questions[0].choices
  assert.equal(fromOwner.detail, 'From Your answer')
  assert.equal(fromOwner.params.from, 'owner_answer')
})
