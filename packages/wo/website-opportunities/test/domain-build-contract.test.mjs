// The Contract B check (ticket #590): build plan, progress events, outcome, questions with answers, and plan edits.
// Every scenario is an invented business; no model is called.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkBuildDocument, checkBuildScenario } from '../domain/build-contract.mjs'
import { applyPlanEdit, checkPlanEdit } from '../domain/build-contract-plan-edit.mjs'
import { checkAnswer } from '../domain/build-contract-questions.mjs'

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/build-contract/${name}.build-scenario.json`, import.meta.url), 'utf8')
  )
const HAPPY = read('sunrise-tennis-club')
const STOPPED = read('sunrise-tennis-club-could-not-finish')
const happy = () => structuredClone(HAPPY)
const plan = () => structuredClone(HAPPY.plan)
const question = (id) => structuredClone(HAPPY.questions.find((q) => q.id === id))
const blockOf = (p, page, id) => p.pages.find((x) => x.id === page).blocks.find((b) => b.id === id)

/** The problems of a document, as `<at>: <message>` lines. */
const lines = (res) => res.problems.map((p) => `${p.at}: ${p.message}`)
function assertProblem(res, at, message) {
  assert.equal(res.ok, false)
  assert.ok(
    res.problems.some((p) => p.at === at && message.test(p.message)),
    `expected ${at} ${message}, got:\n${lines(res).join('\n')}`
  )
}

test('the sample scenarios of the chat mock pass', () => {
  for (const scenario of [HAPPY, STOPPED]) assert.deepEqual(lines(checkBuildScenario(scenario)), [])
})

test('a plan, a progress event and an outcome each pass on their own', () => {
  const run = HAPPY.runs[0]
  for (const doc of [HAPPY.plan, HAPPY.questions[0], run.events[1], run.outcome])
    assert.deepEqual(lines(checkBuildDocument(doc)), [])
})

for (const [key, at, message] of [
  ['look', 'look', /missing look section/],
  ['pictures', 'pictures', /missing pictures summary/],
  ['assumptions', 'assumptions', /missing assumptions/],
  ['leftOut', 'leftOut', /missing left out list/]
]) {
  test(`a plan without its ${key} is rejected`, () => {
    const p = plan()
    delete p[key]
    assertProblem(checkBuildDocument(p), at, message)
  })
}

test('a plan block without its data items is rejected', () => {
  const p = plan()
  delete blockOf(p, 'home', 'h2').data
  assertProblem(checkBuildDocument(p), 'pages[home].blocks[h2].data', /missing data/)
  blockOf(p, 'home', 'h2').data = []
  assertProblem(checkBuildDocument(p), 'pages[home].blocks[h2].data', /at least one id/)
})

test('a block data item must exist and fit the block type', () => {
  const p = plan()
  blockOf(p, 'home', 'h2').data.push('s9')
  blockOf(p, 'coaches', 't1').data.push('r1')
  blockOf(p, 'home', 'h4').data.push('s1')
  const res = checkBuildDocument(p)
  assertProblem(res, 'pages[home].blocks[h2].data[4]', /"s9" is not a fact or item/)
  assertProblem(res, 'pages[coaches].blocks[t1].data[3]', /is a quote; a team block shows person items/)
  assertProblem(res, 'pages[home].blocks[h4].data[3]', /a contact block shows facts only/)
})

test('a plan carries no written copy', () => {
  const p = plan()
  blockOf(p, 'home', 'h1').heading = 'Serve, rally, win'
  assertProblem(checkBuildDocument(p), 'pages[home].blocks[h1].heading', /no written copy/)
})

test('the look section and pictures summary are checked', () => {
  const p = plan()
  p.look.accent = 'green'
  p.pictures.generated.frames = 40
  const res = checkBuildDocument(p)
  assertProblem(res, 'look.accent', /#rrggbb/)
  // No cap on generated frames (D45): any whole count stands.
  assert.ok(!res.problems.some((x) => x.at === 'pictures.generated.frames'), 'forty generated frames stand')
  p.pictures.generated.frames = -1
  assertProblem(checkBuildDocument(p), 'pictures.generated', /frames to be generated/)
})

test('an assumption must be correctable and a left out entry needs its reason', () => {
  const p = plan()
  p.assumptions[0].field = 'pictures.own.frames'
  delete p.leftOut[0].reason
  const res = checkBuildDocument(p)
  assertProblem(
    res,
    'assumptions[language].field',
    /must be correctable.*not a field the customer can change/
  )
  assertProblem(res, 'leftOut[0].reason', /needs its reason/)
})

test('a question carries its choices and accepts a free text answer', () => {
  const q = question('main-button')
  delete q.freeText
  q.choices = []
  const res = checkBuildDocument(q)
  assertProblem(res, 'freeText', /accepts a free text answer/)
  assertProblem(res, 'choices', /carries its choices/)
})

test('an answer is validated against its question', () => {
  const q = question('main-button')
  const answer = (fields) => ({ schema: 'tracy-build-answer/v1', question: 'main-button', ...fields })
  assert.equal(checkAnswer(answer({ choice: 'call' }), q).ok, true)
  assert.equal(checkAnswer(answer({ text: 'Join a free trial lesson' }), q).ok, true)
  assertProblem(checkAnswer(answer({ choice: 'fax' }), q), 'choice', /"fax" is not a choice/)
  assertProblem(checkAnswer(answer({ text: 'x'.repeat(81) }), q), 'text', /at most 80 characters/)
  assertProblem(checkAnswer(answer({ text: '   ' }), q), 'text', /not empty/)
  assertProblem(checkAnswer(answer({ choice: 'call', text: 'Call' }), q), '', /exactly one of/)
  assertProblem(checkAnswer(answer({ skipped: true }), q), 'skipped', /marked skippable/)
  assertProblem(
    checkAnswer({ ...answer({ choice: 'call' }), question: 'phone' }, q),
    'question',
    /is for "phone"/
  )
})

test('a plan edit names its fields and new values and applies to its plan', () => {
  const p = plan()
  const edit = structuredClone(HAPPY.edits[0])
  const res = checkPlanEdit(edit, p)
  assert.deepEqual(lines(res), [])
  assert.equal(res.plan.revision, 2)
  assert.equal(res.plan.items.find((i) => i.id === 's2').label, 'Junior academy')
  assert.equal(p.items.find((i) => i.id === 's2').label, 'Junior squad', 'the original plan is not changed')
  assert.deepEqual(applyPlanEdit(p, edit), res.plan)
})

test('a plan edit is rejected when it does not fit the plan', () => {
  const p = plan()
  const edit = (changes, revision = 1) => ({
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-x',
    plan: { id: p.id, revision },
    changes
  })
  assertProblem(
    checkPlanEdit(edit([{ field: 'items[s2].label', value: 'X' }], 3), p),
    'plan.revision',
    /stale edit/
  )
  assertProblem(
    checkPlanEdit(edit([{ field: 'items[s9].label', value: 'X' }]), p),
    'changes[items[s9].label].field',
    /no entry with id "s9"/
  )
  assertProblem(
    checkPlanEdit(edit([{ field: 'pictures.own.frames', value: 3 }]), p),
    'changes[pictures.own.frames].field',
    /not a field the customer can change/
  )
  assertProblem(
    checkPlanEdit(edit([{ field: 'facts[phone].value', value: 4000 }]), p),
    'changes[facts[phone].value].value',
    /holds a string, the new value is a number/
  )
  assertProblem(
    checkPlanEdit(edit([{ field: 'look.accent', value: 'blue' }]), p),
    'plan look.accent',
    /after the edit: .*#rrggbb/
  )
  assertProblem(
    checkPlanEdit(edit([{ field: 'pages[home].blocks[h2].data', value: ['s1', 'c1'] }]), p),
    'plan pages[home].blocks[h2].data[1]',
    /after the edit: item "c1" is a person/
  )
  assertProblem(checkPlanEdit(edit([]), p), 'changes', /at least one/)
})

test('an outcome of done with a failed or unfinished step is rejected', () => {
  const done = structuredClone(HAPPY.runs[0].outcome)
  done.steps[7] = { ...done.steps[7], state: 'failed', attempt: 2 }
  assertProblem(checkBuildDocument(done), 'steps[generated-pictures].state', /done means every step.*failed/)
  const unfinished = structuredClone(HAPPY.runs[0].outcome)
  unfinished.steps[8] = { ...unfinished.steps[8], state: 'pending', attempt: 0 }
  assertProblem(checkBuildDocument(unfinished), 'steps[write].state', /done means every step.*pending/)
})

test('done ends with the write step and never needs a site check', () => {
  const outcome = structuredClone(HAPPY.runs[0].outcome)
  assert.equal(
    outcome.steps.some((s) => /check/.test(s.kind)),
    false
  )
  assert.equal(checkBuildDocument(outcome).ok, true)
  const withCheck = structuredClone(outcome)
  withCheck.steps.push({
    id: 'check',
    kind: 'site-check',
    label: 'Check every page',
    state: 'done',
    attempt: 1
  })
  const res = checkBuildDocument(withCheck)
  assertProblem(res, 'steps[check].kind', /site check is not a build step/)
  assertProblem(res, 'steps', /ends with the write step/)
})

test('a build never reports applied, and a stopped outcome names its failed step', () => {
  const outcome = structuredClone(HAPPY.runs[0].outcome)
  outcome.result = 'applied'
  assertProblem(checkBuildDocument(outcome), 'result', /never reports applied/)
  const stopped = structuredClone(STOPPED.runs[0].outcome)
  stopped.stopped.step = 'look'
  stopped.stopped.teamNotified = false
  const res = checkBuildDocument(stopped)
  assertProblem(res, 'stopped.step', /"look" is not the failed step/)
  assertProblem(res, 'stopped.teamNotified', /team is told/)
})

test('a failed step is one whose re-run failed too', () => {
  const event = structuredClone(STOPPED.runs[0].events[1])
  event.steps[7] = { ...event.steps[7], state: 'failed', attempt: 1 }
  event.steps[6] = { ...event.steps[6], attempt: 3 }
  const res = checkBuildDocument(event)
  assertProblem(res, 'steps[generated-pictures].attempt', /failed means the re-run failed too/)
  assertProblem(res, 'steps[own-photos].attempt', /re-run once/)
})

test('a scenario holds answers, edits and runs to what they belong to', () => {
  const s = happy()
  s.answers[0].choice = 'fax'
  s.runs[0].events[2].seq = 1
  s.runs[1].outcome.planRevision = 1
  s.runs[0].events[2].steps[0].state = 'running'
  const res = checkBuildScenario(s)
  assertProblem(res, 'answers[main-button].choice', /"fax" is not a choice/)
  assertProblem(res, 'runs[0].events[2].seq', /rises/)
  assertProblem(res, 'runs[1].run', /same run and plan revision/)
  assertProblem(res, 'runs[0].events[2].steps[look].state', /a done step stays done/)
})

test('an unknown document and a lone answer get a clear message', () => {
  assertProblem(checkBuildDocument({ schema: 'tracy-build-chat/v9' }), 'schema', /not a Contract B schema/)
  assertProblem(checkBuildDocument(HAPPY.answers[0]), 'schema', /put it in a build scenario/)
  assertProblem(checkBuildDocument(null), 'schema', /not a Contract B schema/)
})
