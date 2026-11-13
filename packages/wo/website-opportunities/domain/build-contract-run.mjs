// Progress events and the final outcome of a build run, in Contract B (ticket #590, ADR 0047). A run is the full build
// after approval or a partial re-run after a plan edit. Both list the run's steps; the write step is always the last.
// "done" means every step, ending with the write step, completed without failure: an outcome of done that carries a
// failed or unfinished step is rejected. A site check is not a build step this round (ADR 0047, decision 3), so done
// never depends on one. A failing step is re-run once; "failed" means its second attempt failed and the build stopped:
// the failed step is final, nothing is running any more and the write step never runs. A full build carries a look step, writer steps and a
// pictures step before the write step; a partial re-run carries only the steps its plan edit needs, plus the write step.

import { closedShapeProblems, textProblems } from './build-contract-shapes.mjs'
import { isName, isObject, isWhole, label } from './build-contract-shared.mjs'

export const PROGRESS_SCHEMA = 'tracy-build-progress/v1'
export const OUTCOME_SCHEMA = 'tracy-build-outcome/v1'
export const STEP_KINDS = Object.freeze(['look', 'writer', 'pictures', 'write'])
export const STEP_STATES = Object.freeze(['pending', 'running', 'done', 'failed'])
export const RUN_KINDS = Object.freeze(['build', 'partial'])
export const OUTCOME_RESULTS = Object.freeze(['done', 'stopped'])
/** At most one re-run per step (ADR 0047, decision 2). */
export const MAX_ATTEMPTS = 2
const SITE_CHECK_KINDS = new Set(['site-check', 'check', 'verify'])
/** The step kinds a full build carries besides the write step (the writer steps: one per page of the plan). */
export const FULL_BUILD_KINDS = Object.freeze(['look', 'writer', 'pictures'])

function runProblems(run, report) {
  if (!isObject(run) || !isName(run.id) || !RUN_KINDS.includes(run.kind))
    return report('run', `run must be {id, kind}: kind one of ${RUN_KINDS.join(', ')}`)
  closedShapeProblems(run, 'run', 'run', report)
  if (run.kind === 'partial' && !isName(run.edit))
    report('run.edit', 'a partial run names the plan edit it applies')
  if (run.kind === 'build' && run.edit !== undefined) report('run.edit', 'a full build applies no plan edit')
}

function stepProblems(step, at, report) {
  if (!isObject(step)) return report(at, 'a step must be an object {id, kind, label, state, attempt}')
  closedShapeProblems(step, 'step', at, report)
  if (!isName(step.id)) report(`${at}.id`, 'a step needs a non-empty id')
  if (SITE_CHECK_KINDS.has(step.kind))
    report(`${at}.kind`, 'a site check is not a build step this round (ADR 0047): done does not depend on it')
  else if (!STEP_KINDS.includes(step.kind))
    report(`${at}.kind`, `step kind is one of ${STEP_KINDS.join(', ')}`)
  if (step.kind === 'writer' && !isName(step.page))
    report(`${at}.page`, 'a writer step names the page it writes')
  else if (step.kind !== 'writer' && step.page !== undefined)
    report(`${at}.page`, 'only a writer step names a page')
  textProblems(step.label, `${at}.label`, report, 'label', 'a step needs a label the customer can read')
  if (!STEP_STATES.includes(step.state))
    return report(`${at}.state`, `step state is one of ${STEP_STATES.join(', ')}`)
  const pendingAttempt = step.state === 'pending' ? 0 : 1
  if (!isWhole(step.attempt, pendingAttempt) || step.attempt > MAX_ATTEMPTS)
    report(`${at}.attempt`, `attempt is ${pendingAttempt} to ${MAX_ATTEMPTS}: a failing step is re-run once`)
  else if (step.state === 'pending' && step.attempt !== 0)
    report(`${at}.attempt`, 'a pending step has attempt 0')
  else if (step.state === 'failed' && step.attempt !== MAX_ATTEMPTS)
    report(
      `${at}.attempt`,
      'failed means the re-run failed too: a first failure is re-run, shown running attempt 2'
    )
}

/**
 * After a step failed for good the build has stopped: at most one step is failed, no step is running, and the write
 * step is neither running nor done. Look, pictures and writer steps run in parallel, so another of them may be done.
 * When the write step itself failed, it ran alone after every other step, so every other step is done.
 */
function afterFailureProblems(steps, report) {
  const index = steps.findIndex((s) => s?.state === 'failed')
  if (index < 0) return
  if (steps.filter((s) => s?.state === 'failed').length > 1)
    report('steps', 'a run stops at its first step that failed for good: at most one step is failed')
  const failed = steps[index]
  steps.forEach((step, i) => {
    if (i === index || !isObject(step) || step.state === 'failed') return
    const at = `steps[${label(step.id, i)}].state`
    if (step.state === 'running')
      report(at, `the build stopped at ${JSON.stringify(failed.id)}: no step is still running`)
    else if (step.kind === 'write' && step.state === 'done')
      report(at, 'the write step never runs after a step failed for good: it stays pending')
    else if (failed.kind === 'write' && step.state !== 'done')
      report(at, 'the write step runs alone after every other step: when it fails, every other step is done')
  })
}

/** Which steps a run carries: a full build its look, writer and pictures steps; a partial run at least one step. */
function runStepKindsProblems(steps, runKind, report) {
  if (runKind === 'build') {
    for (const kind of FULL_BUILD_KINDS)
      if (!steps.some((s) => s?.kind === kind))
        report(
          'steps',
          `a full build carries a ${kind} step before the write step (${FULL_BUILD_KINDS.join(', ')})`
        )
  } else if (runKind === 'partial' && steps.length < 2)
    report('steps', 'a partial re-run carries at least one step before the write step')
  const pages = new Set()
  steps.forEach((step, i) => {
    if (step?.kind !== 'writer' || !isName(step.page)) return
    if (pages.has(step.page))
      report(
        `steps[${label(step.id, i)}].page`,
        `one writer step per page: ${JSON.stringify(step.page)} has two`
      )
    pages.add(step.page)
  })
}

/** The step list of a run: unique ids, exactly one write step and it comes last, the kinds the run kind needs. */
export function stepsProblems(steps, report, runKind) {
  if (!Array.isArray(steps) || steps.length === 0) return report('steps', 'steps must list at least one step')
  const ids = new Set()
  steps.forEach((step, i) => {
    const at = `steps[${label(step?.id, i)}]`
    if (isName(step?.id) && ids.has(step.id)) report(`${at}.id`, 'step id appears twice')
    if (isName(step?.id)) ids.add(step.id)
    stepProblems(step, at, report)
  })
  const writes = steps.filter((s) => s?.kind === 'write').length
  if (writes !== 1 || steps.at(-1)?.kind !== 'write')
    report('steps', 'a run ends with the write step, exactly one, and nothing comes after it')
  runStepKindsProblems(steps, runKind, report)
  afterFailureProblems(steps, report)
}

/** Report every problem of one progress event: a snapshot of the run's steps while it runs. */
export function progressProblems(event, report) {
  if (!isObject(event)) return report('', 'a progress event must be a JSON object')
  closedShapeProblems(event, 'progress event', '', report)
  if (event.schema !== PROGRESS_SCHEMA) report('schema', `schema must be "${PROGRESS_SCHEMA}"`)
  if (!isName(event.planId)) report('planId', 'a progress event names its plan')
  if (!isWhole(event.planRevision, 1)) report('planRevision', 'planRevision is the revision the run builds')
  runProblems(event.run, report)
  if (!isWhole(event.seq, 1)) report('seq', 'seq is a whole number from 1, rising with each event of the run')
  if (!isWhole(event.elapsedSeconds)) report('elapsedSeconds', 'elapsedSeconds is a whole number of seconds')
  stepsProblems(event.steps, report, event.run?.kind)
}

/** Report every problem of a final outcome: done, or stopped at a step that failed twice. */
export function outcomeProblems(outcome, report) {
  if (!isObject(outcome)) return report('', 'an outcome must be a JSON object')
  closedShapeProblems(outcome, 'outcome', '', report)
  if (outcome.schema !== OUTCOME_SCHEMA) report('schema', `schema must be "${OUTCOME_SCHEMA}"`)
  if (!isName(outcome.planId)) report('planId', 'an outcome names its plan')
  if (!isWhole(outcome.planRevision, 1)) report('planRevision', 'planRevision is the revision the run built')
  runProblems(outcome.run, report)
  if (!isWhole(outcome.elapsedSeconds))
    report('elapsedSeconds', 'elapsedSeconds is a whole number of seconds')
  if (!OUTCOME_RESULTS.includes(outcome.result))
    return report(
      'result',
      `result is "done" or "stopped", not ${JSON.stringify(outcome.result)}: a build never reports applied or complete`
    )
  stepsProblems(outcome.steps, report, outcome.run?.kind)
  if (!Array.isArray(outcome.steps)) return
  outcome.steps.forEach((step, i) => {
    if (step?.state === 'running')
      report(`steps[${label(step.id, i)}].state`, 'an outcome is final: no step is still running')
  })
  if (outcome.result === 'done') {
    if (outcome.stopped !== undefined) report('stopped', 'a done outcome carries no stop report')
    outcome.steps.forEach((step, i) => {
      if (isObject(step) && step.state !== 'done')
        report(
          `steps[${label(step.id, i)}].state`,
          `done means every step, ending with the write step, completed; this step is ${step.state}`
        )
    })
    return
  }
  const stop = outcome.stopped
  if (!isObject(stop)) return report('stopped', 'a stopped outcome carries {step, reason, teamNotified}')
  closedShapeProblems(stop, 'stop report', 'stopped', report)
  outcome.steps.forEach((step, i) => {
    if (step?.kind === 'write' && step.state === 'done')
      report(
        `steps[${label(step.id, i)}].state`,
        'a stopped run never puts pages on the site: the write step is not done'
      )
  })
  const failed = outcome.steps.filter((s) => s?.state === 'failed')
  if (failed.length !== 1) report('steps', 'a stopped run has exactly one failed step, the one it stopped at')
  if (!failed.some((s) => s.id === stop.step))
    report('stopped.step', `${JSON.stringify(stop.step)} is not the failed step of the run`)
  textProblems(
    stop.reason,
    'stopped.reason',
    report,
    'reason',
    'a stop report says what failed, for the Tracy team'
  )
  if (stop.teamNotified !== true)
    report('stopped.teamNotified', 'the Tracy team is told of every stopped build')
}
