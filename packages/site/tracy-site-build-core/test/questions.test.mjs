/**
 * The questionnaire schema: what a release may declare, and every way the gate refuses it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FEEDS, KINDS, parseQuestions, questionsFor, SCHEMA, validateQuestions } from '../src/questions.mjs'

const good = () => ({
  schemaVersion: SCHEMA,
  owner: 'tracy-business/emdash',
  languages: ['en', 'vi'],
  questions: [
    {
      id: 'name',
      kind: 'text',
      label: { en: 'Company name', vi: 'Tên công ty' },
      hint: { en: 'Acme', vi: 'Acme' },
      feeds: ['site.name', 'agent']
    },
    {
      id: 'sector',
      kind: 'choice',
      options: ['construction', 'other'],
      optionLabels: { construction: { en: 'Construction', vi: 'Xây dựng' } },
      label: { en: 'Sector', vi: 'Ngành' },
      feeds: ['agent']
    }
  ]
})

test('a well-formed questionnaire has no problems', () => {
  assert.deepEqual(validateQuestions(good()), [])
  assert.deepEqual(validateQuestions(good(), { requireName: true }), [])
})

test('every refusal is a sentence, and they all come at once', () => {
  const doc = good()
  doc.schemaVersion = 'tracy-questions/v0'
  doc.languages = ['vi']
  doc.questions[0].label = { en: 'Only English' }
  doc.questions[1].feeds = ['seo.title']
  doc.questions.push({ id: 'name', kind: 'text', label: { en: 'x', vi: 'x' }, feeds: ['agent'] })
  const problems = validateQuestions(doc)
  assert.ok(problems.length >= 5, problems.join('\n'))
  assert.ok(problems.some((p) => p.includes('schemaVersion')))
  assert.ok(problems.some((p) => p.includes('must include en')))
  assert.ok(problems.some((p) => p.includes('has no vi text')))
  assert.ok(problems.some((p) => p.includes('has no reader')))
  assert.ok(problems.some((p) => p.includes('id repeats')))
})

test('a question with no reader is refused — the customer would type into nothing', () => {
  const doc = good()
  doc.questions[1].feeds = []
  assert.ok(validateQuestions(doc).some((p) => p.includes('feeds must name who reads')))
  assert.ok(FEEDS.includes('agent') && FEEDS.includes('seed.pages'))
})

test('choices need options with word-shaped ids; text questions carry none', () => {
  const doc = good()
  doc.questions[1].options = []
  assert.ok(validateQuestions(doc).some((p) => p.includes('needs options')))
  doc.questions[1].options = ['Has Space']
  assert.ok(validateQuestions(doc).some((p) => p.includes('option "Has Space"')))
  doc.questions[0].options = ['x']
  assert.ok(validateQuestions(doc).some((p) => p.includes('text question has no options')))
})

test('a CMS default set must ask for the name', () => {
  const doc = good()
  doc.questions = [doc.questions[1]]
  assert.deepEqual(validateQuestions(doc), [])
  assert.ok(validateQuestions(doc, { requireName: true }).some((p) => p.includes('must ask for `name`')))
})

test('questionsFor draws one language and falls back to English, option labels included', () => {
  const vi = questionsFor(good(), 'vi')
  assert.equal(vi[0].label, 'Tên công ty')
  assert.equal(vi[1].optionLabels.construction, 'Xây dựng')
  assert.equal(vi[1].optionLabels.other, undefined, 'an option without a label keeps its id')
  const fr = questionsFor(good(), 'fr')
  assert.equal(fr[0].label, 'Company name')
  assert.deepEqual(fr[0].feeds, ['site.name', 'agent'])
  const regional = questionsFor(good(), 'vi-VN')
  assert.equal(regional[0].hint, 'Acme')
})

test('parseQuestions names the file and lists every problem', () => {
  assert.throws(() => parseQuestions('{ nope', { where: 'x.json' }), /x\.json is not JSON/)
  assert.throws(
    () => parseQuestions(JSON.stringify({ schemaVersion: 'v9' }), { where: 'x.json' }),
    /x\.json:\n {2}- schemaVersion/
  )
  assert.equal(parseQuestions(JSON.stringify(good())).owner, 'tracy-business/emdash')
})

test('a question names its page with `step`, and the form is told which page it sits on', () => {
  const doc = good()
  doc.questions[0].step = 1
  doc.questions[1].step = 2
  assert.deepEqual(validateQuestions(doc), [])
  const drawn = questionsFor(doc, 'en')
  assert.equal(drawn[0].step, 1)
  assert.equal(drawn[1].step, 2)
  // Absent means page one — a set written before 15/09 draws as it always did.
  assert.equal(questionsFor(good(), 'en')[0].step, 1)
})

test('a step that is not a whole number from 1 is refused', () => {
  for (const bad of [0, -1, 1.5, '2', null]) {
    const doc = good()
    doc.questions[0].step = bad
    const problems = validateQuestions(doc)
    assert.equal(problems.length, 1, JSON.stringify(bad))
    assert.match(problems[0], /questions\[0\] \(name\): step must be a whole number from 1/)
  }
})

test('longtext and languages are kinds of their own, drawn by kind and not by id', () => {
  const doc = good()
  doc.questions[0].kind = 'longtext'
  doc.questions.push({
    id: 'site-languages',
    kind: 'languages',
    options: ['en', 'vi'],
    label: { en: 'Site language', vi: 'Ngôn ngữ site' },
    feeds: ['site.languages']
  })
  assert.deepEqual(validateQuestions(doc), [])
  // test-quality: contract every drawer (ask form, Customize sheet, Build from my business) switches on exactly these kinds
  assert.deepEqual(KINDS, ['text', 'longtext', 'choice', 'multi', 'languages', 'logo', 'favicon', 'business'])
  const drawn = questionsFor(doc, 'vi')
  assert.equal(drawn[0].kind, 'longtext')
  assert.equal(drawn[2].kind, 'languages')
  assert.deepEqual(drawn[2].options, ['en', 'vi'])
})

test('a languages question carries options like a multi; a longtext carries none like a text', () => {
  const doc = good()
  doc.questions[0].kind = 'longtext'
  doc.questions[0].options = ['a']
  assert.deepEqual(validateQuestions(doc), ['questions[0] (name): a text question has no options'])
  const two = good()
  two.questions[1].kind = 'languages'
  delete two.questions[1].options
  assert.deepEqual(validateQuestions(two), ['questions[1] (sector): languages needs options'])
})

test('the template personalize step is a reader an answer may feed', () => {
  assert.ok(FEEDS.includes('template'))
  const doc = good()
  doc.questions[1].feeds = ['template']
  assert.deepEqual(validateQuestions(doc), [])
})
