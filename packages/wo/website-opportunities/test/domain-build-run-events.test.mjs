// The step chain's records turned into Contract B progress events and outcomes (#597): every document is checked by
// the Contract B validators, one by one and as a run. An invented bakery with three pages; records written by hand in
// the engine's own line shape (`{step, attempt, outcome, code?, details?}`).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-build-run-events.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { runsProblems } from '../domain/build-contract-scenario-runs.mjs'
import { reporterFor } from '../domain/build-contract-shared.mjs'
import {
  buildEngineSteps,
  contractRunOf,
  contractStepOf,
  outcomeOf,
  progressEventOf
} from '../domain/build-run-events.mjs'

const PAGES = [
  { id: 'home', name: 'Home' },
  { id: 'breads', name: 'Breads' },
  { id: 'visit', name: 'Visit us' }
]
const base = {
  planId: 'plan-crumbwell-bakery',
  planRevision: 1,
  run: { id: 'run-1', kind: 'build' },
  pages: PAGES
}
const done = (step, attempt = 1) => ({ step, attempt, outcome: 'done' })
const failed = (step, attempt, extra = {}) => ({
  step,
  attempt,
  outcome: attempt === 2 || extra.last ? 'failed' : 'failed, re-running',
  ...extra
})
const PARALLEL = ['look', 'writer:home', 'writer:breads', 'writer:visit', 'pictures']
const stateOf = (doc) => Object.fromEntries(doc.steps.map((s) => [s.id, [s.state, s.attempt]]))

/** The run as one scenario, checked by the Contract B run rules (seq, done stays done, failed stays failed). */
function runChecked(events, outcome) {
  const problems = []
  runsProblems(
    { plan: { id: base.planId }, runs: [{ events, outcome }] },
    new Map([[1, { pages: PAGES }]]),
    new Map(),
    reporterFor(problems)
  )
  return problems
}

test('the engine steps map onto Contract B steps; steps before approval and a site check never show', () => {
  assert.deepEqual(contractStepOf('writer:breads'), { id: 'writer:breads', kind: 'writer', page: 'breads' })
  assert.deepEqual(
    ['look', 'pictures', 'icons', 'order', 'write'].map((s) => contractStepOf(s).kind),
    ['look', 'pictures', 'pictures', 'write', 'write']
  )
  for (const s of ['doors', 'aiq', 'needs', 'brand', 'answers', 'plan', 'approval', 'site-check', 'writer:'])
    assert.equal(contractStepOf(s), null)
  const { doc, problems } = progressEventOf({
    ...base,
    seq: 1,
    elapsedSeconds: 3,
    engineSteps: ['needs', ...buildEngineSteps(PAGES), 'site-check'],
    record: [done('needs'), done('site-check')],
    running: ['look']
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(
    doc.steps.map((s) => s.kind),
    ['look', 'writer', 'writer', 'writer', 'pictures', 'write']
  )
  assert.ok(!doc.steps.some((s) => /check/.test(s.kind) || /check/.test(s.id)))
  assert.equal(doc.steps[2].label, 'Write the Breads page')
})

test('a clean build: events and a done outcome, valid one by one and as a run', () => {
  const record = []
  const events = []
  const snap = (running, seq) => {
    const { doc, problems } = progressEventOf({ ...base, seq, elapsedSeconds: seq * 10, record, running })
    assert.deepEqual(problems, [])
    assert.equal(checkBuildDocument(doc).ok, true)
    events.push(doc)
    return doc
  }
  snap(PARALLEL, 1)
  record.push(...PARALLEL.map((s) => done(s)))
  // Pictures placed, icons not started yet: the pictures step is still under way.
  assert.deepEqual(stateOf(snap([], 2)).pictures, ['running', 1])
  assert.deepEqual(stateOf(snap(['icons'], 3)).pictures, ['running', 1])
  record.push(done('icons'))
  assert.deepEqual(stateOf(snap(['order'], 4)).write, ['running', 1])
  record.push(done('order'))
  snap(['write'], 5)
  record.push(done('write'))
  const { doc: outcome, problems } = outcomeOf({ ...base, elapsedSeconds: 60, record })
  assert.deepEqual(problems, [])
  assert.equal(outcome.result, 'done')
  assert.ok(outcome.steps.every((s) => s.state === 'done' && s.attempt === 1))
  assert.deepEqual(runChecked(events, outcome), [])
})

test('a step re-run once then done shows running on attempt 2, then done on attempt 2', () => {
  const record = [
    ...PARALLEL.filter((s) => s !== 'writer:breads').map((s) => done(s)),
    failed('writer:breads', 1)
  ]
  const between = progressEventOf({ ...base, seq: 1, elapsedSeconds: 5, record, running: [] })
  assert.deepEqual(between.problems, [])
  assert.deepEqual(stateOf(between.doc)['writer:breads'], ['running', 2])
  record.push(done('writer:breads', 2), done('icons'), done('order'), done('write'))
  const end = contractRunOf({ ...base, final: true, elapsedSeconds: 9, record })
  assert.deepEqual(end.problems, [])
  assert.equal(end.doc.result, 'done')
  assert.deepEqual(stateOf(end.doc)['writer:breads'], ['done', 2])
})

test('a step that fails twice stops the build: failed on attempt 2, write pending, outcome stopped at it', () => {
  const record = [
    done('look'),
    done('writer:home'),
    failed('icons', 1),
    failed('icons', 2, { code: 'icon_ranking_failed', error: 'the ranking reply was unreadable' })
  ]
  record.unshift(done('writer:breads'), done('writer:visit'), done('pictures'))
  const stop = {
    step: 'icons',
    attempts: 2,
    code: 'icon_ranking_failed',
    error: 'the ranking reply was unreadable'
  }
  const event = progressEventOf({ ...base, seq: 2, elapsedSeconds: 30, record, running: ['order'], stop })
  assert.deepEqual(event.problems, [])
  assert.deepEqual(stateOf(event.doc).pictures, ['failed', 2])
  assert.deepEqual(stateOf(event.doc).write, ['pending', 0])
  const { doc, problems } = outcomeOf({ ...base, elapsedSeconds: 31, record, stop })
  assert.deepEqual(problems, [])
  assert.deepEqual(doc.stopped, {
    step: 'pictures',
    reason: 'icon_ranking_failed: the ranking reply was unreadable',
    teamNotified: true
  })
  assert.deepEqual(runChecked([event.doc], doc), [])
})

test('the writer that failed its own rewrite (noRerun) reports attempt 2 and the outcome is valid', () => {
  const line = {
    step: 'writer:visit',
    attempt: 1,
    outcome: 'failed',
    code: 'copy_check_failed',
    details: { attempts: 2 }
  }
  const record = [done('look'), done('writer:home'), line]
  const stop = {
    step: 'writer:visit',
    attempts: 1,
    code: 'copy_check_failed',
    error: 'one field still fails'
  }
  // The other parallel steps had started: one is done, the others were stopped by the halt and show pending.
  record.push(
    { step: 'writer:breads', attempt: 1, outcome: 'stopped' },
    { step: 'pictures', attempt: 1, outcome: 'stopped' }
  )
  const first = progressEventOf({ ...base, seq: 1, elapsedSeconds: 1, record: [], running: PARALLEL })
  const { doc, problems } = outcomeOf({ ...base, elapsedSeconds: 40, record, stop })
  assert.deepEqual(problems, [])
  assert.deepEqual(stateOf(doc)['writer:visit'], ['failed', 2])
  assert.deepEqual(stateOf(doc)['writer:breads'], ['pending', 0])
  assert.equal(doc.result, 'stopped')
  assert.deepEqual(runChecked([first.doc], doc), [])
  // Without details (a record whose details were cut short), the code alone says the writer tried twice.
  const bare = outcomeOf({ ...base, elapsedSeconds: 40, record: [{ ...line, details: undefined }], stop })
  assert.deepEqual(stateOf(bare.doc)['writer:visit'], ['failed', 2])
})

test('the write step failing after the others: write failed on attempt 2, every other step done', () => {
  const record = [
    ...PARALLEL.map((s) => done(s)),
    done('icons'),
    done('order'),
    failed('write', 1),
    failed('write', 2)
  ]
  const stop = { step: 'write', attempts: 2, code: 'write_failed', error: 'the site refused the page' }
  const { doc, problems } = outcomeOf({ ...base, elapsedSeconds: 70, record, stop })
  assert.deepEqual(problems, [])
  assert.deepEqual(stateOf(doc).write, ['failed', 2])
  assert.equal(doc.result, 'stopped')
  // The write order failing twice is the write step failing too.
  const order = outcomeOf({
    ...base,
    elapsedSeconds: 70,
    record: [...record.slice(0, 6), failed('order', 1), failed('order', 2)],
    stop: { step: 'order', attempts: 2, code: 'write_order_invalid', error: 'a field has no entry' }
  })
  assert.deepEqual(order.problems, [])
  assert.deepEqual([order.doc.stopped.step, stateOf(order.doc).write[0]], ['write', 'failed'])
})

test('outcome done only when write completed: write not run is never done', () => {
  const record = [...PARALLEL.map((s) => done(s)), done('icons'), done('order')]
  const { doc, problems } = outcomeOf({ ...base, elapsedSeconds: 50, record })
  assert.equal(doc.result, 'stopped')
  assert.ok(problems.length > 0, 'an unfinished run with no failed step is not a valid outcome')
})

test('a deterministic stop on the first attempt cannot be expressed: failed on attempt 1, rejected', () => {
  const record = [failed('order', 1, { last: true, code: 'write_order_invalid' })]
  const stop = { step: 'order', attempts: 1, code: 'write_order_invalid', error: 'a field has no entry' }
  const { doc, problems } = outcomeOf({
    ...base,
    elapsedSeconds: 50,
    record: [...PARALLEL.map((s) => done(s)), done('icons'), ...record],
    stop
  })
  assert.deepEqual(stateOf(doc).write, ['failed', 1])
  assert.ok(
    problems.some((p) => p.at === 'steps[write].attempt'),
    JSON.stringify(problems)
  )
})
