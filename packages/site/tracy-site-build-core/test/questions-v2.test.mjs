/**
 * tracy-questions/v2: conditions, required, consumer bindings, capability references — and the one
 * evaluator every surface (Ops preview, the Build form, the server) decides visibility with.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bindingsOf,
  canonicalJson,
  CONSUMERS,
  effectiveAnswers,
  FEEDS,
  isEmptyAnswer,
  missingRequired,
  questionsFor,
  SCHEMA,
  SCHEMA_V2,
  validateQuestions,
  visibleQuestions
} from '../src/questions.mjs'

const v2 = () => ({
  schemaVersion: SCHEMA_V2,
  owner: 'tracy-business/j6',
  languages: ['en'],
  questions: [
    {
      id: 'name',
      kind: 'text',
      label: { en: 'Company name' },
      required: true,
      feeds: ['site.name', 'agent']
    },
    {
      id: 'sector',
      kind: 'choice',
      options: ['construction', 'clinic'],
      label: { en: 'What does the business do?' },
      feeds: ['agent'],
      capabilityRefs: ['page:home', 'slot:home.hero.title'],
      why: 'The hero and the about page speak in the sector’s words.'
    },
    {
      id: 'licence',
      kind: 'text',
      label: { en: 'Contractor licence number' },
      feeds: ['agent'],
      required: true,
      showWhen: { all: [{ question: 'sector', is: 'construction' }] }
    },
    {
      id: 'services',
      kind: 'multi',
      options: ['roofing', 'plumbing'],
      label: { en: 'Services' },
      feeds: ['agent'],
      showWhen: { all: [{ question: 'sector', is: 'construction' }] }
    },
    {
      id: 'roof-types',
      kind: 'longtext',
      label: { en: 'Which roof types?' },
      feeds: ['agent'],
      showWhen: { all: [{ question: 'services', has: 'roofing' }] }
    }
  ]
})

test('a v2 document with conditions, required and refs is valid; v1 stays valid untouched', () => {
  assert.deepEqual(validateQuestions(v2()), [])
  const v1 = { ...v2(), schemaVersion: SCHEMA }
  for (const q of v1.questions) {
    delete q.required
    delete q.showWhen
    delete q.capabilityRefs
    delete q.why
  }
  assert.deepEqual(validateQuestions(v1), [])
})

test('v2 fields in a v1 document are refused — a half-migrated set is not a set', () => {
  const doc = { ...v2(), schemaVersion: SCHEMA }
  const problems = validateQuestions(doc)
  assert.ok(problems.some((p) => p.includes('required') && p.includes(SCHEMA_V2)))
  assert.ok(problems.some((p) => p.includes('showWhen')))
})

test('a condition may only look back: unknown, self, forward and cyclic references are refused', () => {
  const doc = v2()
  doc.questions[1].showWhen = { all: [{ question: 'licence', is: 'x' }] } // forward
  doc.questions[2].showWhen = { all: [{ question: 'licence', is: 'x' }] } // self
  doc.questions[3].showWhen = { all: [{ question: 'nowhere', is: 'x' }] } // unknown
  const problems = validateQuestions(doc)
  assert.equal(problems.filter((p) => p.includes('showWhen')).length, 3, problems.join('\n'))
  for (const p of problems) assert.match(p, /earlier|itself|no question/)
})

test('a condition must fit the question it looks at: `is` on a choice, `has` on a multi, an option that exists', () => {
  const doc = v2()
  doc.questions[2].showWhen = { all: [{ question: 'sector', has: 'construction' }] } // has on a choice
  doc.questions[3].showWhen = { all: [{ question: 'sector', is: 'bakery' }] } // unknown option
  doc.questions[4].showWhen = { all: [{ question: 'services', is: 'roofing' }] } // is on a multi
  doc.questions.push({
    id: 'free',
    kind: 'text',
    label: { en: 'x' },
    feeds: ['agent'],
    showWhen: { all: [{ question: 'name', is: 'acme' }] } // a text question has no options to match
  })
  const problems = validateQuestions(doc)
  assert.equal(problems.filter((p) => p.includes('showWhen')).length, 4, problems.join('\n'))
})

test('a condition that can never hold is refused: two different `is` on one choice, or an empty list', () => {
  const doc = v2()
  doc.questions[2].showWhen = {
    all: [
      { question: 'sector', is: 'construction' },
      { question: 'sector', is: 'clinic' }
    ]
  }
  doc.questions[3].showWhen = { all: [] }
  const problems = validateQuestions(doc)
  assert.ok(
    problems.some((p) => p.includes('never')),
    problems.join('\n')
  )
  assert.ok(
    problems.some((p) => p.includes('all')),
    problems.join('\n')
  )
})

test('a hidden question is not shown, not required, and its answer is not effective', () => {
  const { questions } = v2()
  const clinic = {
    name: 'Acme',
    sector: 'clinic',
    licence: 'L-1',
    services: ['roofing'],
    'roof-types': 'tile'
  }
  assert.deepEqual(
    visibleQuestions(questions, clinic).map((q) => q.id),
    ['name', 'sector']
  )
  assert.deepEqual(effectiveAnswers(questions, clinic), { name: 'Acme', sector: 'clinic' })
  assert.deepEqual(missingRequired(questions, clinic), [])

  const builder = { name: 'Acme', sector: 'construction', services: ['plumbing'] }
  assert.deepEqual(
    visibleQuestions(questions, builder).map((q) => q.id),
    ['name', 'sector', 'licence', 'services']
  )
  assert.deepEqual(missingRequired(questions, builder), ['licence'])

  const roofer = { name: 'Acme', sector: 'construction', licence: 'L-1', services: ['roofing'] }
  assert.deepEqual(
    visibleQuestions(questions, roofer).map((q) => q.id),
    ['name', 'sector', 'licence', 'services', 'roof-types']
  )
  assert.deepEqual(missingRequired(questions, roofer), [])
})

test('a chain of conditions collapses when its root changes — nothing downstream leaks', () => {
  const { questions } = v2()
  const answers = { name: 'Acme', sector: 'construction', services: ['roofing'], 'roof-types': 'tile' }
  assert.equal(effectiveAnswers(questions, answers)['roof-types'], 'tile')
  answers.sector = 'clinic'
  assert.equal(effectiveAnswers(questions, answers)['roof-types'], undefined)
  assert.equal(effectiveAnswers(questions, answers).services, undefined)
})

test('empty means empty: blank text, empty list, null — and whitespace is blank', () => {
  assert.equal(isEmptyAnswer(''), true)
  assert.equal(isEmptyAnswer('   '), true)
  assert.equal(isEmptyAnswer([]), true)
  assert.equal(isEmptyAnswer(null), true)
  assert.equal(isEmptyAnswer(undefined), true)
  assert.equal(isEmptyAnswer('x'), false)
  assert.equal(isEmptyAnswer(['x']), false)
  const { questions } = v2()
  assert.deepEqual(missingRequired(questions, { name: '  ' }), ['name'])
})

test('every feed is a consumer the code reads, and a binding says where the answer lands', () => {
  assert.deepEqual(Object.keys(CONSUMERS).sort(), [...FEEDS].sort())
  const [name] = v2().questions
  assert.deepEqual(bindingsOf(name), [
    { consumer: 'site.name', target: 'name' },
    { consumer: 'agent', target: 'name' }
  ])
})

test('a v2 question feeding a fixed consumer must carry that consumer’s id and kind', () => {
  const doc = v2()
  doc.questions.push(
    { id: 'blurb', kind: 'longtext', label: { en: 'About' }, feeds: ['copy.about'] }, // wrong id
    { id: 'pages', kind: 'multi', options: ['home', 'menu'], label: { en: 'Pages' }, feeds: ['seed.pages'] }, // unknown page
    { id: 'languages', kind: 'multi', options: ['en'], label: { en: 'Languages' }, feeds: ['site.languages'] } // wrong kind
  )
  const problems = validateQuestions(doc)
  assert.ok(problems.some((p) => p.includes('blurb') && p.includes('copy.about') && p.includes('about')))
  assert.ok(problems.some((p) => p.includes('pages') && p.includes('menu')))
  assert.ok(problems.some((p) => p.includes('languages') && p.includes('kind')))
})

test('the same rule reads v1 leniently: a v1 set is not refused for a binding it never declared', () => {
  const doc = { ...v2(), schemaVersion: SCHEMA }
  for (const q of doc.questions) {
    delete q.required
    delete q.showWhen
    delete q.capabilityRefs
    delete q.why
  }
  doc.questions.push({ id: 'blurb', kind: 'longtext', label: { en: 'About' }, feeds: ['copy.about'] })
  assert.deepEqual(validateQuestions(doc), [])
})

test('capability references are checked against the snapshot when one is given, and only then', () => {
  const doc = v2()
  assert.deepEqual(validateQuestions(doc), [])
  const known = new Set(['page:home'])
  const problems = validateQuestions(doc, { capabilities: known })
  assert.equal(problems.length, 1, problems.join('\n'))
  assert.match(problems[0], /slot:home\.hero\.title/)
  doc.questions[1].capabilityRefs = []
  assert.ok(validateQuestions(doc).some((p) => p.includes('capabilityRefs')))
})

test('questionsFor carries required and showWhen to the form, and nothing else new', () => {
  const drawn = questionsFor(v2(), 'en')
  assert.equal(drawn[0].required, true)
  assert.equal(drawn[1].required, false)
  assert.deepEqual(drawn[2].showWhen, { all: [{ question: 'sector', is: 'construction' }] })
  assert.equal('capabilityRefs' in drawn[1], false)
  assert.equal('why' in drawn[1], false)
})

test('canonicalJson sorts keys at every depth, so the same set hashes the same however it was typed', () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } }),
    '{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}'
  )
})
