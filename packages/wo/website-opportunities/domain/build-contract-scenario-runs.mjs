// The runs of a build scenario in Contract B (ticket #590): each run checked against the plan revision it builds.
// A full build writes every page of the plan; a step that failed for good stays failed in every later document of the
// run and the outcome is stopped at it; events rise in seq and elapsed time, and keep the same steps.
import { outcomeProblems, progressProblems } from './build-contract-run.mjs'
import { closedShapeProblems } from './build-contract-shapes.mjs'
import { isObject, label } from './build-contract-shared.mjs'

const stepIds = (doc) => (Array.isArray(doc?.steps) ? doc.steps.map((s) => s?.id) : [])
const sameRun = (a, b) => a?.id === b?.id && a?.kind === b?.kind && a?.edit === b?.edit

/** The step that failed for good in `doc`, if any. */
const failedStep = (doc) =>
  Array.isArray(doc?.steps) ? doc.steps.find((s) => s?.state === 'failed') : undefined

/** A failed step is final: every later document of the run still shows it failed on attempt 2. */
function failedStaysFailed(failed, doc, at, report) {
  if (!failed) return
  const j = doc?.steps?.findIndex((s) => s?.id === failed.id) ?? -1
  const later = j >= 0 ? doc.steps[j] : null
  if (later && (later.state !== 'failed' || later.attempt !== failed.attempt))
    report(
      `${at}.steps[${failed.id}].state`,
      'a failed step stays failed: it was already re-run once, the build stopped'
    )
}

function eventsProblems(run, plan, report) {
  let previous = null
  let failed = null
  const started = new Set()
  ;(run.events ?? []).forEach((event, i) => {
    const at = `events[${i}]`
    progressProblems(event, report.under(at))
    if (previous) {
      if (!(event?.seq > previous.seq)) report(`${at}.seq`, 'seq rises with each event of the run')
      if (event?.elapsedSeconds < previous.elapsedSeconds)
        report(`${at}.elapsedSeconds`, 'elapsed time never goes back')
      if (stepIds(event).join() !== stepIds(previous).join())
        report(`${at}.steps`, 'every event of a run lists the same steps in the same order')
      previous.steps?.forEach((step, j) => {
        if (step?.state === 'done' && event?.steps?.[j]?.state !== 'done')
          report(`${at}.steps[${label(step.id, j)}].state`, 'a done step stays done')
      })
      failedStaysFailed(failed, event, at, report)
    }
    failed = failed ?? failedStep(event)
    if (failed && i > 0) notStartedProblems(event, started, failed, at, report)
    for (const step of event?.steps ?? [])
      if (step?.state === 'running' || step?.state === 'done') started.add(step.id)
    previous = event
  })
  const steps = run.events?.[0]?.steps ?? run.outcome?.steps ?? []
  for (const [i, step] of steps.entries())
    if (step?.kind === 'writer' && plan && !plan.pages.some((page) => page?.id === step.page))
      report(
        `steps[${label(step.id, i)}].page`,
        `${JSON.stringify(step.page)} is not a page of the plan it builds`
      )
  const kind = (run.events?.[0] ?? run.outcome)?.run?.kind
  if (kind === 'build' && plan && Array.isArray(steps))
    for (const page of plan.pages)
      if (!steps.some((step) => step?.kind === 'writer' && step.page === page?.id))
        report(
          'steps',
          `no writer step for page ${JSON.stringify(page?.id)}: a full build writes every page of the plan`
        )
  return { last: previous, failed, started, events: run.events?.length ?? 0 }
}

/**
 * Once a step failed for good, a step shown done must have been running or done in an earlier event of the run: a
 * step that had not started when the build stopped stays pending. Checked only when an earlier event exists.
 */
function notStartedProblems(doc, started, failed, at, report) {
  ;(doc?.steps ?? []).forEach((step, i) => {
    if (step?.state === 'done' && step.id !== failed?.id && !started.has(step.id))
      report(
        `${at}.steps[${label(step.id, i)}].state`,
        `${JSON.stringify(step.id)} had not started when the build stopped: a step that had not started stays pending`
      )
  })
}

/** The outcome of a run whose events show a step failed for good is stopped at that step. */
function stoppedOutcomeProblems(outcome, failed, report) {
  failedStaysFailed(failed, outcome, 'outcome', report)
  if (failed && (outcome.result !== 'stopped' || outcome.stopped?.step !== failed.id))
    report(
      'outcome.result',
      `the run stopped at step ${JSON.stringify(failed.id)}, which failed for good: the outcome is stopped and names it`
    )
}

/** Check every run of the scenario against the plan revisions and edits. */
export function runsProblems(scenario, plans, editRevision, report) {
  ;(scenario.runs ?? []).forEach((run, i) => {
    const runReport = report.under(`runs[${i}]`)
    if (!isObject(run) || (!Array.isArray(run.events) && run.outcome === undefined))
      return runReport('', 'a run holds its progress events, its outcome, or both')
    closedShapeProblems(run, 'scenario run', '', runReport)
    const docs = [...(run.events ?? []), ...(run.outcome ? [run.outcome] : [])]
    const first = docs[0]
    for (const doc of docs) {
      if (doc?.planId !== scenario.plan?.id)
        runReport('planId', `every document of the run names plan ${scenario.plan?.id}`)
      if (doc?.planRevision !== first?.planRevision || !sameRun(doc?.run, first?.run))
        runReport('run', 'every document of the run names the same run and plan revision')
    }
    const plan = plans.get(first?.planRevision)
    if (!plan) runReport('planRevision', `revision ${first?.planRevision} is not a revision of the plan`)
    if (first?.run?.kind === 'partial' && editRevision.get(first.run.edit) !== first.planRevision)
      runReport('run.edit', 'a partial run builds the revision its plan edit produced')
    const { last, failed, started, events } = eventsProblems(run, plan, runReport)
    if (run.outcome) {
      outcomeProblems(run.outcome, runReport.under('outcome'))
      stoppedOutcomeProblems(run.outcome, failed, runReport)
      if ((failed ?? failedStep(run.outcome)) && events > 0)
        notStartedProblems(run.outcome, started, failed ?? failedStep(run.outcome), 'outcome', runReport)
      if (last && stepIds(last).join() !== stepIds(run.outcome).join())
        runReport('outcome.steps', 'the outcome lists the same steps as the progress events')
      if (last && run.outcome.elapsedSeconds < last.elapsedSeconds)
        runReport('outcome.elapsedSeconds', 'the outcome comes after the last progress event')
    }
  })
}
