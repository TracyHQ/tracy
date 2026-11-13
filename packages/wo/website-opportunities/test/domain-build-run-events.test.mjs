// The step chain's records turned into Contract B progress events and outcomes (#597). The records come from a replica
// of the engine's record rules (`fixtures/build-run/engine-records.mjs`: the engine lives in apps/tracy-web, which a
// domain package must not import), never hand-shaped lines. Every document is checked by the Contract B validators,
// one by one and as a run. An invented bakery with three pages.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-build-run-events.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { runsProblems } from '../domain/build-contract-scenario-runs.mjs'
import { reporterFor } from '../domain/build-contract-shared.mjs'
import {
  ENGINE_STEPS,
  PRE_APPROVAL_STEPS,
  buildEngineSteps,
  contractRunOf,
  contractStepOf,
  outcomeOf,
  progressEventOf
} from '../domain/build-run-events.mjs'
import { engineRun, failure } from './fixtures/build-run/engine-records.mjs'

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
const GROUP = ['look', 'writer:home', 'writer:breads', 'writer:visit', 'pictures']
const stateOf = (doc) =>
  Object.fromEntries(doc.steps.map((s) => [s.id, [s.state, s.attempt, s.noRerun ?? false]]))
const deferred = () => {
  let settle
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/** A run played on the engine replica: `scripts` per step (default done once), events snapshotted along the way. */
async function play(scripts = {}, { signal, cancel, frame, stopAfter, cancelled = false } = {}) {
  const engine = engineRun({ signal })
  const events = []
  const snap = () => {
    const { doc, problems } = progressEventOf({
      ...base,
      seq: events.length + 1,
      elapsedSeconds: events.length * 10,
      ...engine.snapshot(),
      cancelled: cancelled && Boolean(signal?.aborted)
    })
    assert.deepEqual(problems, [], JSON.stringify(doc?.steps))
    events.push(doc)
  }
  const script = (name) => scripts[name] ?? ['done']
  const gate = deferred()
  const group = GROUP.map((name) =>
    engine.step(
      name,
      name === 'look'
        ? [gate.promise.then(() => script('look')[0]), ...script('look').slice(1)]
        : script(name)
    )
  )
  snap()
  gate.settle()
  cancel?.(engine)
  await Promise.all(group)
  if (!engine.run.stop && stopAfter !== 'group') {
    await engine.step('icons', script('icons'))
    if (!engine.run.stop) await engine.step('order', script('order'))
    if (frame) engine.end(failure(frame))
    else if (!engine.run.stop) await engine.step('write', script('write'))
  }
  snap()
  return {
    engine,
    events,
    final: (extra = {}) => outcomeOf({ ...base, elapsedSeconds: 99, ...engine.snapshot(), ...extra })
  }
}

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
function assertValidRun({ events }, outcome) {
  assert.deepEqual(outcome.problems, [])
  assert.equal(checkBuildDocument(outcome.doc).ok, true)
  assert.deepEqual(runChecked(events, outcome.doc), [])
}

test('the step names: the table, the steps before approval, and an unknown step is a problem, never pending', () => {
  assert.deepEqual(Object.keys(ENGINE_STEPS), ['look', 'pictures', 'icons', 'order', 'write'])
  assert.deepEqual(contractStepOf('writer:breads'), { id: 'writer:breads', kind: 'writer', page: 'breads' })
  for (const s of [...PRE_APPROVAL_STEPS, 'site-check', 'copy', 'writer:'])
    assert.equal(contractStepOf(s), null)
  const record = [
    { step: 'kit', attempt: 1, outcome: 'done' },
    { step: 'copy', attempt: 1, outcome: 'done' }
  ]
  const { doc, problems } = progressEventOf({
    ...base,
    seq: 1,
    elapsedSeconds: 1,
    record,
    running: ['site-check']
  })
  assert.deepEqual(
    problems.map((p) => [p.at, p.code]),
    [
      ['record[1].step', 'engine_step_unknown'],
      ['running', 'engine_step_unknown']
    ]
  )
  assert.deepEqual(
    doc.steps.map((s) => s.kind),
    ['look', 'writer', 'writer', 'writer', 'pictures', 'write']
  )
  assert.equal(doc.steps[2].label, 'Write the Breads page')
  const twice = progressEventOf({
    ...base,
    pages: [PAGES[0], PAGES[0]],
    seq: 1,
    elapsedSeconds: 1,
    record: []
  })
  assert.ok(twice.problems.some((p) => p.code === 'page_twice'))
  assert.deepEqual(buildEngineSteps(PAGES).slice(-4), ['pictures', 'icons', 'order', 'write'])
})

test('a clean build: events and a done outcome, valid one by one and as a run', async () => {
  const played = await play()
  assert.deepEqual(stateOf(played.events[0]).look, ['running', 1, false])
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.equal(outcome.doc.result, 'done')
  assert.ok(outcome.doc.steps.every((s) => s.state === 'done' && s.attempt === 1))
  assert.equal(
    contractRunOf({ ...base, final: true, elapsedSeconds: 99, ...played.engine.snapshot() }).doc.result,
    'done'
  )
})

test('pictures placed, icons not started: the pictures step is still under way', async () => {
  const played = await play({}, { stopAfter: 'group' })
  assert.deepEqual(stateOf(played.events.at(-1)).pictures, ['running', 1, false])
})

test('a step re-run once then done: running on attempt 2 between, done on attempt 2', async () => {
  const played = await play({ 'writer:breads': [failure('network'), 'done'] })
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.deepEqual(stateOf(outcome.doc)['writer:breads'], ['done', 2, false])
  const between = progressEventOf({
    ...base,
    seq: 1,
    elapsedSeconds: 1,
    record: played.engine.run.record.filter((l) => !(l.step === 'writer:breads' && l.attempt === 2)),
    running: []
  })
  assert.deepEqual(between.problems, [])
  assert.deepEqual(stateOf(between.doc)['writer:breads'], ['running', 2, false])
})

test('a step that fails twice: failed on attempt 2, the write step pending, the outcome stopped at it', async () => {
  const played = await play({
    icons: [
      failure('reply unreadable', { code: 'icon_ranking_failed' }),
      failure('again', { code: 'icon_ranking_failed' })
    ]
  })
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.deepEqual(stateOf(outcome.doc).pictures, ['failed', 2, false])
  assert.deepEqual(stateOf(outcome.doc).write, ['pending', 0, false])
  assert.deepEqual(outcome.doc.stopped, {
    step: 'pictures',
    reason: 'icon_ranking_failed: again',
    teamNotified: true
  })
})

test('the writer that failed its own rewrite (noRerun) ran once: failed on attempt 1 with noRerun', async () => {
  // Details heavier than the engine keeps: cut by the record, the mapping does not need them.
  const big = { failing: Array.from({ length: 200 }, (_, i) => ({ key: `k${i}`, value: 'v'.repeat(40) })) }
  const error = failure('still fails', { code: 'copy_check_failed', noRerun: true, details: big })
  const played = await play({ 'writer:visit': [error] })
  assert.equal(played.engine.run.stop.details.truncated, true)
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.deepEqual(stateOf(outcome.doc)['writer:visit'], ['failed', 1, true])
  assert.equal(outcome.doc.result, 'stopped')
})

test('a deterministic failure on the first attempt is failed on attempt 1 with noRerun', async () => {
  const played = await play({
    order: [failure('a field has no entry', { code: 'write_order_invalid', noRerun: true })]
  })
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.deepEqual(stateOf(outcome.doc).write, ['failed', 1, true])
})

test('the deadline stops a running step on its first attempt: failed on attempt 1; a cancel is cancelled', async () => {
  for (const cancelled of [false, true]) {
    const outer = new AbortController()
    const played = await play(
      { pictures: ['hang'] },
      {
        signal: outer.signal,
        cancelled,
        cancel: () =>
          setTimeout(
            () => outer.abort(new Error(cancelled ? 'cancelled by the customer' : 'the chain deadline')),
            1
          )
      }
    )
    const outcome = played.final({ cancelled })
    assertValidRun(played, outcome)
    if (cancelled) {
      assert.deepEqual(
        [outcome.doc.result, outcome.doc.cancelled, outcome.doc.stopped],
        ['cancelled', { teamNotified: false }, undefined]
      )
      assert.deepEqual(stateOf(outcome.doc).pictures, ['pending', 0, false])
      assert.ok(!outcome.doc.steps.some((s) => s.state === 'failed' || s.state === 'running'))
    } else {
      assert.deepEqual(stateOf(outcome.doc).pictures, ['failed', 1, true])
      assert.equal(outcome.doc.stopped.reason, 'the chain deadline')
    }
  }
})

test('a stop of the run frame is carried by the write step: failed on attempt 1, every other step done', async () => {
  const played = await play({}, { frame: 'the site never came up' })
  assert.deepEqual([played.engine.run.stop.step, played.engine.run.stop.attempts], ['run', 0])
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.deepEqual(stateOf(outcome.doc).write, ['failed', 1, true])
  assert.equal(outcome.doc.stopped.reason, 'STEP_CHAIN_RUN_FAILED: the site never came up')
  // The apply timing out while the write step runs: the frame names the write step, attempts 0.
  const engine = engineRun()
  await Promise.all(GROUP.map((name) => engine.step(name, ['done'])))
  await engine.step('icons', ['done'])
  await engine.step('order', ['done'])
  const writing = engine.step('write', ['hang'])
  engine.end(failure('the apply timed out'))
  await writing
  assert.deepEqual([engine.run.stop.step, engine.run.stop.attempts], ['write', 0])
  const timedOut = outcomeOf({ ...base, elapsedSeconds: 9, ...engine.snapshot() })
  assert.deepEqual(timedOut.problems, [])
  assert.deepEqual(stateOf(timedOut.doc).write, ['failed', 1, true])
})

test('an outcome never shows a running step: a run that ended unfinished is stopped like the engine says', async () => {
  const played = await play({}, { stopAfter: 'group' })
  const outcome = played.final()
  assertValidRun(played, outcome)
  assert.ok(!outcome.doc.steps.some((s) => s.state === 'running'))
  assert.deepEqual(stateOf(outcome.doc).pictures, ['failed', 1, true])
  assert.match(outcome.doc.stopped.reason, /^STEP_CHAIN_INCOMPLETE: /)
  // Everything done but the write step, which never ran: the write step carries it, as the engine's incompleteStop.
  const engine = engineRun()
  await Promise.all(GROUP.map((name) => engine.step(name, ['done'])))
  await engine.step('icons', ['done'])
  await engine.step('order', ['done'])
  const noWrite = outcomeOf({ ...base, elapsedSeconds: 9, ...engine.snapshot() })
  assert.deepEqual(noWrite.problems, [])
  assert.deepEqual([noWrite.doc.stopped.step, ...stateOf(noWrite.doc).write], ['write', 'failed', 1, true])
})

test('the write step failing twice after the others, and the write order failing twice: write failed on 2', async () => {
  for (const name of ['write', 'order']) {
    const played = await play({ [name]: [failure('refused'), failure('refused again', { code: 'w' })] })
    const outcome = played.final()
    assertValidRun(played, outcome)
    assert.deepEqual([outcome.doc.stopped.step, ...stateOf(outcome.doc).write], ['write', 'failed', 2, false])
  }
})

test('a stop before approval is not a build run: no document', () => {
  const record = [
    { step: 'needs', attempt: 1, outcome: 'failed, re-running' },
    { step: 'needs', attempt: 2, outcome: 'failed', code: 'research_unusable', error: 'no source' }
  ]
  const stop = { step: 'needs', attempts: 2, code: 'research_unusable', error: 'no source' }
  assert.deepEqual(outcomeOf({ ...base, elapsedSeconds: 1, record, stop }), {
    doc: null,
    reason: 'before_build_run',
    problems: []
  })
  assert.equal(
    progressEventOf({ ...base, seq: 1, elapsedSeconds: 1, record, stop }).reason,
    'before_build_run'
  )
})
