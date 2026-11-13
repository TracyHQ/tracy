// The Contract B check (ticket #590), tightened after review: which steps a full build and a partial re-run carry, a
// step that failed for good stays failed and stops the run, and the documented format matches the code's closed
// shapes and limits. Invented data only; no model is called.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkBuildDocument, checkBuildScenario } from '../domain/build-contract.mjs'
import { CONTRACT_SHAPES, TEXT_LIMITS } from '../domain/build-contract-shapes.mjs'

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/build-contract/${name}.build-scenario.json`, import.meta.url), 'utf8')
  )
const HAPPY = read('sunrise-tennis-club')
const STOPPED = read('sunrise-tennis-club-could-not-finish')
const lines = (res) => res.problems.map((p) => `${p.at}: ${p.message}`)
function assertProblem(res, at, message) {
  assert.equal(res.ok, false)
  assert.ok(
    res.problems.some((p) => p.at === at && message.test(p.message)),
    `expected ${at} ${message}, got:\n${lines(res).join('\n')}`
  )
}
const keepSteps = (doc, keep) => {
  doc.steps = doc.steps.filter(keep)
  return doc
}

test('a done full build carries a look step, writer steps and a pictures step before the write step', () => {
  const onlyWrite = keepSteps(structuredClone(HAPPY.runs[0].outcome), (s) => s.kind === 'write')
  const res = checkBuildDocument(onlyWrite)
  assertProblem(res, 'steps', /a full build carries a look step/)
  assertProblem(res, 'steps', /a full build carries a writer step/)
  assertProblem(res, 'steps', /a full build carries a pictures step/)
  const noWriter = keepSteps(structuredClone(HAPPY.runs[0].outcome), (s) => s.kind !== 'writer')
  assertProblem(checkBuildDocument(noWriter), 'steps', /a full build carries a writer step/)
})

test('a partial re-run may omit look, writer and pictures steps but not carry only the write step', () => {
  const lookOnly = structuredClone(HAPPY.runs[1].outcome)
  lookOnly.steps = [
    { id: 'look', kind: 'look', label: 'Apply your new colour', state: 'done', attempt: 1 },
    lookOnly.steps.at(-1)
  ]
  assert.deepEqual(lines(checkBuildDocument(lookOnly)), [])
  const onlyWrite = keepSteps(structuredClone(HAPPY.runs[1].outcome), (s) => s.kind === 'write')
  assertProblem(checkBuildDocument(onlyWrite), 'steps', /a partial re-run carries at least one step before/)
})

test('two writer steps for one page are rejected', () => {
  const outcome = structuredClone(HAPPY.runs[0].outcome)
  outcome.steps[2] = { ...outcome.steps[2], page: 'home' }
  assertProblem(checkBuildDocument(outcome), 'steps[write-about].page', /one writer step per page/)
})

test('in a scenario a full build writes every page of the plan', () => {
  const s = structuredClone(HAPPY)
  for (const doc of [...s.runs[0].events, s.runs[0].outcome]) keepSteps(doc, (x) => x.id !== 'write-coaches')
  assertProblem(checkBuildScenario(s), 'runs[0].steps', /no writer step for page "coaches"/)
  const none = structuredClone(HAPPY)
  for (const doc of [...none.runs[0].events, none.runs[0].outcome]) keepSteps(doc, (x) => x.kind === 'write')
  assertProblem(checkBuildScenario(none), 'runs[0].steps', /no writer step for page "home"/)
})

test('a step that failed for good is final: no later event changes it and the run cannot end done', () => {
  const s = structuredClone(HAPPY)
  const [, second, third] = s.runs[0].events
  second.steps[1] = { ...second.steps[1], state: 'failed', attempt: 2 }
  for (const step of second.steps.slice(2)) Object.assign(step, { state: 'pending', attempt: 0 })
  const res = checkBuildScenario(s)
  assertProblem(res, 'runs[0].events[2].steps[write-home].state', /a failed step stays failed/)
  assertProblem(res, 'runs[0].outcome.result', /stopped at step "write-home"/)
  assert.equal(third.steps[1].state, 'done')
})

test('after a failure nothing runs and the write step is never running or done', () => {
  const event = structuredClone(STOPPED.runs[0].events[1])
  event.steps[7] = { ...event.steps[7], state: 'failed', attempt: 2 }
  event.steps[8] = { ...event.steps[8], state: 'running', attempt: 1 }
  assertProblem(checkBuildDocument(event), 'steps[write].state', /no step is still running/)
  const writeDone = structuredClone(STOPPED.runs[0].outcome)
  writeDone.steps[8] = { ...writeDone.steps[8], state: 'done', attempt: 1 }
  const res = checkBuildDocument(writeDone)
  assertProblem(res, 'steps[write].state', /a stopped run never puts pages on the site/)
  assertProblem(res, 'steps[write].state', /write step never runs after a step failed for good/)
})

test('when the write step itself fails, every other step is done', () => {
  const outcome = structuredClone(STOPPED.runs[0].outcome)
  outcome.steps[7] = { ...outcome.steps[7], state: 'done', attempt: 2 }
  outcome.steps[8] = { ...outcome.steps[8], state: 'failed', attempt: 2 }
  outcome.stopped.step = 'write'
  assert.deepEqual(lines(checkBuildDocument(outcome)), [])
  outcome.steps[6] = { ...outcome.steps[6], state: 'pending', attempt: 0 }
  assertProblem(checkBuildDocument(outcome), 'steps[own-photos].state', /every other step is done/)
})

/** The stopped scenario, where Home fails for good while the other parallel steps were running. */
function writerFailsScenario() {
  const s = structuredClone(STOPPED)
  const [, during] = s.runs[0].events
  for (const step of during.steps)
    if (step.kind !== 'write') Object.assign(step, { state: 'running', attempt: 1 })
  during.steps[0] = { ...during.steps[0], state: 'done', attempt: 1 }
  during.steps[1] = { ...during.steps[1], state: 'running', attempt: 2 }
  const outcome = s.runs[0].outcome
  for (const step of outcome.steps)
    if (step.kind !== 'write') Object.assign(step, { state: 'done', attempt: 1 })
  outcome.steps[1] = { ...outcome.steps[1], state: 'failed', attempt: 2 }
  outcome.stopped = {
    step: 'write-home',
    reason: 'Writing Home failed on both attempts.',
    teamNotified: true
  }
  return s
}

test('a writer listed after a failed writer may be done: they ran in parallel', () => {
  const s = writerFailsScenario()
  assert.equal(s.runs[0].outcome.steps[2].state, 'done')
  assert.deepEqual(lines(checkBuildScenario(s)), [])
})

test('a step that had not started when the build stopped stays pending', () => {
  const s = writerFailsScenario()
  Object.assign(s.runs[0].events[1].steps[7], { state: 'pending', attempt: 0 })
  assertProblem(
    checkBuildScenario(s),
    'runs[0].outcome.steps[generated-pictures].state',
    /had not started when the build stopped/
  )
})

test('a first failure re-run once and then done remains valid', () => {
  assert.deepEqual(lines(checkBuildScenario(HAPPY)), [])
  assert.equal(HAPPY.runs[0].events[2].steps[7].attempt, 2)
})

/** The closed shape table of the doc: `| \`<object>\` | \`a\`, \`b?\` |` rows under "## Closed shapes". */
function documentedShapes(doc) {
  const section = doc.split('\n## Closed shapes')[1]?.split('\n## ')[0] ?? ''
  const shapes = {}
  for (const row of section.matchAll(/^\| `([a-z][a-z .-]*)` \| (.+?) \|$/gm))
    shapes[row[1]] = [...row[2].matchAll(/`([A-Za-z]+\??)`/g)].map((m) => m[1])
  return shapes
}

function documentedLimits(doc) {
  const section = doc.split('\n## Text limits')[1]?.split('\n## ')[0] ?? ''
  const limits = {}
  for (const row of section.matchAll(/^\| `([a-zA-Z.[\]]+)` \| (\d+) \|/gm)) limits[row[1]] = Number(row[2])
  return limits
}

test('the doc and the code agree on every object field and text limit', () => {
  const doc = readFileSync(new URL('../../../../docs/references/build-contract.md', import.meta.url), 'utf8')
  const fromCode = Object.fromEntries(
    Object.entries(CONTRACT_SHAPES).map(([name, shape]) => [
      name,
      [...shape.required, ...shape.optional.map((f) => `${f}?`)]
    ])
  )
  const fromDoc = documentedShapes(doc)
  assert.deepEqual(Object.keys(fromDoc).sort(), Object.keys(fromCode).sort())
  for (const name of Object.keys(fromCode))
    assert.deepEqual([...fromDoc[name]].sort(), [...fromCode[name]].sort(), `fields of ${name}`)
  assert.deepEqual(documentedLimits(doc), TEXT_LIMITS)
})

// #597, decided by the Contract B owner: two additive changes, every earlier sample stays valid untouched.
const WITHOUT_RERUN = read('sunrise-tennis-club-stopped-without-rerun')
const CANCELLED = read('sunrise-tennis-club-cancelled')
const stepOf = (doc, id) => doc.steps.find((s) => s.id === id)

test('a step that stops without a re-run is failed on attempt 1 with noRerun; the sample is valid', () => {
  assert.deepEqual(lines(checkBuildScenario(WITHOUT_RERUN)), [])
  const outcome = WITHOUT_RERUN.runs[0].outcome
  assert.deepEqual(
    [stepOf(outcome, 'generated-pictures').attempt, stepOf(outcome, 'generated-pictures').noRerun],
    [1, true]
  )
  const without = structuredClone(outcome)
  delete stepOf(without, 'generated-pictures').noRerun
  assertProblem(checkBuildDocument(without), 'steps[generated-pictures].attempt', /re-run failed too/)
  const twice = structuredClone(outcome)
  stepOf(twice, 'generated-pictures').attempt = 2
  assertProblem(
    checkBuildDocument(twice),
    'steps[generated-pictures].attempt',
    /noRerun\) failed on attempt 1/
  )
  const onDone = structuredClone(HAPPY.runs[0].outcome)
  onDone.steps[0].noRerun = true
  assertProblem(checkBuildDocument(onDone), 'steps[look].noRerun', /only on a failed step/)
  const notTrue = structuredClone(outcome)
  stepOf(notTrue, 'generated-pictures').noRerun = false
  assertProblem(checkBuildDocument(notTrue), 'steps[generated-pictures].noRerun', /noRerun is true/)
})

test('a run the customer cancelled ends cancelled: nothing failed, nothing written, the team not told', () => {
  assert.deepEqual(lines(checkBuildScenario(CANCELLED)), [])
  const outcome = CANCELLED.runs[0].outcome
  assert.deepEqual(
    [outcome.result, outcome.cancelled, outcome.stopped],
    ['cancelled', { teamNotified: false }, undefined]
  )
  const told = structuredClone(outcome)
  told.cancelled.teamNotified = true
  assertProblem(checkBuildDocument(told), 'cancelled.teamNotified', /not told/)
  const report = structuredClone(outcome)
  report.stopped = { step: 'write', reason: 'cancelled', teamNotified: false }
  assertProblem(checkBuildDocument(report), 'stopped', /no stop report/)
  const failed = structuredClone(outcome)
  Object.assign(stepOf(failed, 'generated-pictures'), { state: 'failed', attempt: 2 })
  assertProblem(checkBuildDocument(failed), 'steps[generated-pictures].state', /no failed step/)
  const missing = structuredClone(outcome)
  delete missing.cancelled
  assertProblem(checkBuildDocument(missing), 'cancelled', /teamNotified: false/)
  const extra = structuredClone(outcome)
  extra.cancelled.by = 'customer'
  assertProblem(checkBuildDocument(extra), 'cancelled.by', /"by" is not a field of a cancel report/)
  const onStopped = structuredClone(STOPPED.runs[0].outcome)
  onStopped.cancelled = { teamNotified: false }
  assertProblem(checkBuildDocument(onStopped), 'cancelled', /only a cancelled outcome/)
})
