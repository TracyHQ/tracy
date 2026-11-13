// The Contract B check (ticket #590), tightened after review: closed shapes for every object, length limits counted by
// code point, assumptions with alternatives, and answer text without control characters. Invented data only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkBuildDocument, checkBuildScenario } from '../domain/build-contract.mjs'
import { checkPlanEdit } from '../domain/build-contract-plan-edit.mjs'
import { checkAnswer } from '../domain/build-contract-questions.mjs'

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/build-contract/${name}.build-scenario.json`, import.meta.url), 'utf8')
  )
const HAPPY = read('sunrise-tennis-club')
const plan = () => structuredClone(HAPPY.plan)
const blockOf = (p, page, id) => p.pages.find((x) => x.id === page).blocks.find((b) => b.id === id)
const lines = (res) => res.problems.map((p) => `${p.at}: ${p.message}`)
function assertProblem(res, at, message) {
  assert.equal(res.ok, false)
  assert.ok(
    res.problems.some((p) => p.at === at && message.test(p.message)),
    `expected ${at} ${message}, got:\n${lines(res).join('\n')}`
  )
}
const edit = (p, changes) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: 'edit-x',
  plan: { id: p.id, revision: p.revision },
  changes
})
const COPY = 'Welcome to the best tennis club in town, book your lesson today'

test('copy under any key the shape does not document is rejected, wherever it sits', () => {
  const places = [
    [(p) => blockOf(p, 'home', 'h1'), 'pages[home].blocks[h1]'],
    [(p) => p.pages[0], 'pages[home]'],
    [(p) => p.items[0], 'items[s1]'],
    [(p) => p.facts[0], 'facts[name]'],
    [(p) => p, ''],
    [(p) => p.look, 'look'],
    [(p) => p.look.template, 'look.template'],
    [(p) => p.look.logo, 'look.logo'],
    [(p) => p.pictures, 'pictures'],
    [(p) => p.pictures.own, 'pictures.own'],
    [(p) => p.pictures.generated, 'pictures.generated'],
    [(p) => p.facts[0].sources[0], 'facts[name].sources[0]'],
    [(p) => p.assumptions[0], 'assumptions[language]'],
    [(p) => p.leftOut[0], 'leftOut[0]']
  ]
  for (const key of ['title', 'subtitle', 'description', 'headline', 'tagline', 'cta', 'intro', 'Heading'])
    for (const [where, at] of places) {
      const p = plan()
      where(p)[key] = COPY
      assertProblem(checkBuildDocument(p), at ? `${at}.${key}` : key, /is not a field of/)
    }
})

test('a plan edit cannot slip copy in through extra keys of a value it sets', () => {
  const p = plan()
  const template = {
    slug: 'example-sports-template',
    name: 'Example Sports',
    version: '1.0.0',
    heading: COPY
  }
  assertProblem(
    checkPlanEdit(edit(p, [{ field: 'look.template', value: template }]), p),
    'plan look.template.heading',
    /after the edit: .*is not a field of/
  )
  const logo = { kind: 'own', source: 'Upload', body: COPY }
  assertProblem(
    checkPlanEdit(edit(p, [{ field: 'look.logo', value: logo }]), p),
    'plan look.logo.body',
    /after the edit: .*is not a field of/
  )
})

test('labels, reasons and other short texts have a length limit, counted by code point', () => {
  const p = plan()
  blockOf(p, 'home', 'h1').label = 'Welcome to Sunrise. '.repeat(30)
  blockOf(p, 'home', 'h2').reason = 'x'.repeat(201)
  p.assumptions[0].said = 'x'.repeat(201)
  p.leftOut[0].what = 'x'.repeat(81)
  p.items[0].label = 'x'.repeat(81)
  p.pages[1].name = 'x'.repeat(41)
  const res = checkBuildDocument(p)
  assertProblem(res, 'pages[home].blocks[h1].label', /at most 80 characters/)
  assertProblem(res, 'pages[home].blocks[h2].reason', /at most 200 characters/)
  assertProblem(res, 'assumptions[language].said', /at most 200 characters/)
  assertProblem(res, 'leftOut[0].what', /at most 80 characters/)
  assertProblem(res, 'items[s1].label', /at most 80 characters/)
  assertProblem(res, 'pages[about].name', /at most 40 characters/)
  const emoji = plan()
  blockOf(emoji, 'home', 'h1').label = '🎾'.repeat(80)
  assert.deepEqual(lines(checkBuildDocument(emoji)), [])
})

test('assumption ids are unique', () => {
  const p = plan()
  p.assumptions[1].id = 'language'
  assertProblem(checkBuildDocument(p), 'assumptions[language].id', /appears twice/)
})

test('an assumption may list the alternatives the sources disagree on', () => {
  const p = plan()
  const hours = p.assumptions.find((a) => a.id === 'hours')
  hours.alternatives = [
    { value: 'Every day, 6:00 to 22:00', sources: [{ kind: 'google', name: 'Google Maps' }] },
    { value: 'Mon to Sat, 7:00 to 21:00', sources: [{ kind: 'website', name: 'Website' }] }
  ]
  assert.deepEqual(lines(checkBuildDocument(p)), [])
  const picked = checkPlanEdit(
    edit(p, [{ field: 'facts[hours].value', value: 'Mon to Sat, 7:00 to 21:00' }]),
    p
  )
  assert.deepEqual(lines(picked), [])

  const bad = structuredClone(p)
  const alt = bad.assumptions.find((a) => a.id === 'hours')
  alt.alternatives = [alt.alternatives[1]]
  assertProblem(checkBuildDocument(bad), 'assumptions[hours].alternatives', /at least two/)
  alt.alternatives = [
    { value: 'Weekends only', sources: [{ kind: 'website', name: 'Website' }] },
    { value: 'Mon to Sat, 7:00 to 21:00', sources: [{ kind: 'website', name: 'Website' }], note: COPY }
  ]
  const res = checkBuildDocument(bad)
  assertProblem(res, 'assumptions[hours].alternatives', /current value .* is one of them/)
  assertProblem(res, 'assumptions[hours].alternatives[1].note', /is not a field of/)
  const empty = structuredClone(p)
  empty.assumptions.find((a) => a.id === 'hours').alternatives[0].sources = []
  assertProblem(checkBuildDocument(empty), 'assumptions[hours].alternatives[0].sources', /at least one/)
  const onLanguage = structuredClone(p)
  onLanguage.assumptions[0].alternatives = structuredClone(hours.alternatives)
  assertProblem(
    checkBuildDocument(onLanguage),
    'assumptions[language].alternatives',
    /facts\[\]\.value or items/
  )
})

test('questions, answers, edits and run documents are closed shapes too', () => {
  const q = structuredClone(HAPPY.questions[0])
  q.title = COPY
  q.choices[0].icon = 'star'
  q.freeText.hint = 'x'
  const qr = checkBuildDocument(q)
  assertProblem(qr, 'title', /is not a field of a question/)
  assertProblem(qr, 'choices[book].icon', /is not a field of a choice/)
  assertProblem(qr, 'freeText.hint', /is not a field of/)
  const outcome = structuredClone(HAPPY.runs[0].outcome)
  outcome.steps[0].failed = true
  outcome.note = 'x'
  outcome.run.extra = 1
  const or = checkBuildDocument(outcome)
  assertProblem(or, 'steps[look].failed', /is not a field of a step/)
  assertProblem(or, 'note', /is not a field of an outcome/)
  assertProblem(or, 'run.extra', /is not a field of a run/)
  const s = structuredClone(HAPPY)
  s.answers[0].comment = 'x'
  s.edits[0].changes[0].why = 'x'
  s.runs[0].extra = 1
  s.extra = 1
  const sr = checkBuildScenario(s)
  assertProblem(sr, 'answers[main-button].comment', /is not a field of an answer/)
  assertProblem(sr, 'edits[edit-1].changes[items[s2].label].why', /is not a field of a change/)
  assertProblem(sr, 'runs[0].extra', /is not a field of a scenario run/)
  assertProblem(sr, 'extra', /is not a field of a build scenario/)
})

test('a placeholder is a short text', () => {
  const q = structuredClone(HAPPY.questions[0])
  q.freeText.placeholder = 'x'.repeat(81)
  assertProblem(checkBuildDocument(q), 'freeText.placeholder', /at most 80 characters/)
  q.freeText.placeholder = 3
  assertProblem(checkBuildDocument(q), 'freeText.placeholder', /short text/)
})

test('answer text counts code points and refuses control characters', () => {
  const q = structuredClone(HAPPY.questions[0])
  const answer = (text) => ({ schema: 'tracy-build-answer/v1', question: q.id, text })
  assert.deepEqual(lines(checkAnswer(answer('😀'.repeat(80)), q)), [])
  assertProblem(checkAnswer(answer('😀'.repeat(81)), q), 'text', /at most 80 characters/)
  assertProblem(checkAnswer(answer('a\u0000b'), q), 'text', /control character/)
  assertProblem(checkAnswer(answer('line\nbreak'), q), 'text', /control character/)
})
