// The step chain's own step records turned into Contract B progress events and the final outcome (#597; Contract B:
// `build-contract-run.mjs`, docs/references/build-contract.md). Pure: the engine's record lines, the steps running and
// its stop in, one document out, checked by the Contract B validators, so the caller sends it only when `problems` is
// empty.
//
// Engine steps map onto Contract B steps (`ENGINE_STEPS`; the build graph of #597):
//   look              -> look
//   writer:<pageId>   -> writer, with that page
//   pictures + icons  -> one pictures step: failed if either failed, running while either runs, done when both are
//   order + write     -> write
// The steps before approval (`PRE_APPROVAL_STEPS`) are not a build run: a stop there gives no document
// (`before_build_run`). Any other step name is `engine_step_unknown`, never shown as pending. A site check is never a
// build step (ADR 0047, decision 3).
//
// Attempts are the engine's: a step that ran once is never shown on attempt 2. A step that stops for good on its first
// attempt (its error was `noRerun`, the deadline, the run frame) is failed on attempt 1 with `noRerun: true`. A stop of
// the run frame (`run`, attempts 0) and a run that ended before its write step completed (the engine's
// `incompleteStop`: write, attempts 0) are carried by the write step when every other step is done, else by the first
// step that did not finish. A run the customer cancelled is `cancelled`: nothing failed, nothing unfinished shows.
import { OUTCOME_SCHEMA, PROGRESS_SCHEMA, outcomeProblems, progressProblems } from './build-contract-run.mjs'
import { TEXT_LIMITS } from './build-contract-shapes.mjs'
import { reporterFor } from './build-contract-shared.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const WRITER = 'writer:'
/** Engine step name -> Contract B step; `writer:<pageId>` is a writer step of that page. */
export const ENGINE_STEPS = Object.freeze({
  look: { id: 'look', kind: 'look' },
  pictures: { id: 'pictures', kind: 'pictures' },
  icons: { id: 'pictures', kind: 'pictures' },
  order: { id: 'write', kind: 'write' },
  write: { id: 'write', kind: 'write' }
})
/** The steps before the customer's approval: not a build run, never in a Contract B run. */
export const PRE_APPROVAL_STEPS = Object.freeze([
  'doors',
  'aiq',
  'kit',
  'needs',
  'brand',
  'answers',
  'plan',
  'approval'
])
/** The stop step the run frame names when it fails a run outside the steps. */
export const FRAME_STEP = 'run'
/** The engine's code of a run that ended before its write step completed (`incompleteStop`). */
export const STEP_CHAIN_INCOMPLETE = 'STEP_CHAIN_INCOMPLETE'

/** The Contract B step an engine step belongs to, or null for a step Contract B does not show. */
export function contractStepOf(engineStep) {
  if (Object.hasOwn(ENGINE_STEPS, engineStep)) return { ...ENGINE_STEPS[engineStep] }
  if (typeof engineStep === 'string' && engineStep.startsWith(WRITER) && engineStep.length > WRITER.length)
    return { id: engineStep, kind: 'writer', page: engineStep.slice(WRITER.length) }
  return null
}

/** The engine steps of a full build, in Contract B order: look, one writer per page, pictures, icons, order, write. */
export const buildEngineSteps = (pages) => [
  'look',
  ...list(pages).map((p) => `${WRITER}${p.id}`),
  'pictures',
  'icons',
  'order',
  'write'
]

const LABELS = {
  look: 'Apply your colours and logo',
  pictures: 'Place your photos and icons',
  write: 'Put the pages on your site'
}
const labelOf = (step, pages) => {
  if (LABELS[step.kind]) return LABELS[step.kind]
  const name = list(pages).find((p) => p.id === step.page)?.name
  return typeof name === 'string' && name.trim() ? `Write the ${name.trim()} page` : 'Write a page'
}

const known = (name) => contractStepOf(name) !== null || PRE_APPROVAL_STEPS.includes(name)
const highest = (lines) => Math.max(0, ...lines.map((l) => l.attempt ?? 0))

/** One engine step that did not stop the run: `{state, attempt}` from its lines and whether it runs. */
function memberState(name, { record, running, halted }) {
  const lines = record.filter((l) => l?.step === name)
  const last = lines.at(-1)
  if (!halted && running.includes(name)) return { state: 'running', attempt: highest(lines) + 1 }
  if (last?.outcome === 'done') return { state: 'done', attempt: last.attempt }
  // A first failure about to be re-run shows running on attempt 2; once the run has stopped it never finished.
  if (!halted && last?.outcome === 'failed, re-running')
    return { state: 'running', attempt: last.attempt + 1 }
  return { state: 'pending', attempt: 0 }
}

/** A Contract B step from its members' states (none failed). */
function groupState(states, halted) {
  const attempt = Math.max(0, ...states.map((s) => s.attempt))
  if (states.every((s) => s.state === 'done')) return { state: 'done', attempt }
  if (halted || states.every((s) => s.state === 'pending')) return { state: 'pending', attempt: 0 }
  return { state: 'running', attempt: Math.max(1, attempt) }
}

/** The stop the record shows: the engine's, else a line that failed for good, else none. */
function stopOf(record, stop) {
  if (stop) return stop
  const failed = record.find((l) => l?.outcome === 'failed')
  return failed
    ? { step: failed.step, attempts: failed.attempt, code: failed.code, error: failed.error }
    : null
}

/**
 * The Contract B steps of a run, in order, with the problems of its input.
 * @param {{pages: Array<{id: string, name?: string}>, record: object[], running?: string[], stop?: object | null,
 *   engineSteps?: string[], cancelled?: boolean, final?: boolean}} input `record`: the engine's record lines;
 *   `running`: the engine steps under way; `stop`: the engine's `run.stop`; `engineSteps`: the run's engine steps (a
 *   full build: `buildEngineSteps(pages)`); `cancelled`: the customer cancelled the run; `final`: for the outcome
 * @returns {{steps: object[], stop: object | null, problems: object[], before?: true}} `before`: the run stopped
 *   before approval, no build run
 */
export function contractStepsOf(input) {
  const { pages, running = [], engineSteps, cancelled = false, final = false } = input
  const record = list(input.record)
  const problems = []
  const pageIds = list(pages).map((p) => p?.id)
  pageIds.forEach((id, i) => {
    if (pageIds.indexOf(id) !== i)
      problems.push({
        at: `pages[${i}]`,
        code: 'page_twice',
        message: `page ${JSON.stringify(id)} appears twice`
      })
  })
  record.forEach((l, i) => {
    if (!known(l?.step))
      problems.push({
        at: `record[${i}].step`,
        code: 'engine_step_unknown',
        message: `${JSON.stringify(l?.step)} is neither a Contract B step nor a step before approval`
      })
  })
  for (const name of list(engineSteps))
    if (!known(name))
      problems.push({
        at: 'engineSteps',
        code: 'engine_step_unknown',
        message: `${JSON.stringify(name)} is not known`
      })
  for (const name of list(running))
    if (!known(name))
      problems.push({
        at: 'running',
        code: 'engine_step_unknown',
        message: `${JSON.stringify(name)} is not known`
      })
  let stop = cancelled ? null : stopOf(record, input.stop)
  if (stop && PRE_APPROVAL_STEPS.includes(stop.step)) return { steps: [], stop, problems, before: true }
  if (stop && stop.step !== FRAME_STEP && !contractStepOf(stop.step))
    problems.push({
      at: 'stop.step',
      code: 'engine_step_unknown',
      message: `${JSON.stringify(stop.step)} is not known`
    })
  const halted = Boolean(stop) || cancelled || final
  const names = list(engineSteps ?? buildEngineSteps(pages))
  const groups = new Map()
  for (const name of names) {
    const step = contractStepOf(name)
    if (!step) continue
    if (!groups.has(step.id)) groups.set(step.id, { step, members: [] })
    groups.get(step.id).members.push(name)
  }
  const ctx = { record, running: list(running), halted }
  const steps = [...groups.values()].map(({ step, members }) => ({
    ...step,
    label: labelOf(step, pages),
    ...groupState(
      members.map((m) => memberState(m, ctx)),
      halted
    ),
    members
  }))
  // A final outcome with nothing stopped and an unfinished step ended before its write step: the engine's stop.
  if (final && !stop && !cancelled && steps.some((s) => s.state !== 'done'))
    stop = {
      step: 'write',
      attempts: 0,
      code: STEP_CHAIN_INCOMPLETE,
      error: 'the run ended before the write step completed'
    }
  if (stop) failCarrier(steps, stop, record)
  return { steps: steps.map(({ members: _members, ...s }) => s), stop, problems }
}

/** Mark the Contract B step that carries the stop failed, on the attempts its engine step ran. */
function failCarrier(steps, stop, record) {
  const frame = stop.step === FRAME_STEP || ((stop.attempts ?? 0) === 0 && stop.step === 'write')
  const others = steps.filter((s) => s.kind !== 'write')
  const carrier = frame
    ? others.every((s) => s.state === 'done')
      ? steps.find((s) => s.kind === 'write')
      : steps.find((s) => s.state !== 'done')
    : steps.find((s) => s.members.includes(stop.step))
  if (!carrier) return
  const lines = record.filter((l) => l?.step === stop.step)
  const attempt = Math.min(2, Math.max(1, stop.attempts ?? 0, highest(lines)))
  Object.assign(carrier, { state: 'failed', attempt, ...(attempt < 2 ? { noRerun: true } : {}) })
}

const seconds = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)
const checked = (doc, check, problems) => {
  check(doc, reporterFor(problems))
  return { doc, problems }
}
const beforeBuildRun = (problems) => ({ doc: null, reason: 'before_build_run', problems })

/**
 * A progress event of the run: a full snapshot of its steps.
 * @param {{planId: string, planRevision: number, run: {id: string, kind: 'build' | 'partial', edit?: string},
 *   seq: number, elapsedSeconds: number}} input plus the fields of `contractStepsOf`
 * @returns {{doc: object | null, problems: object[], reason?: 'before_build_run'}} a `tracy-build-progress/v1` event
 */
export function progressEventOf(input) {
  const { planId, planRevision, run, seq, elapsedSeconds } = input
  const { steps, problems, before } = contractStepsOf({ ...input, final: false })
  if (before) return beforeBuildRun(problems)
  const doc = {
    schema: PROGRESS_SCHEMA,
    planId,
    planRevision,
    run,
    seq,
    elapsedSeconds: seconds(elapsedSeconds),
    steps
  }
  return checked(doc, progressProblems, problems)
}

/**
 * The final outcome: `done` only when every step, ending with the write step (order and write), completed;
 * `cancelled` when the customer cancelled; else `stopped` at the step that carries the engine's stop.
 * @param {object} input the fields of `progressEventOf` without `seq`
 * @returns {{doc: object | null, problems: object[], reason?: 'before_build_run'}} a `tracy-build-outcome/v1`
 */
export function outcomeOf(input) {
  const { planId, planRevision, run, elapsedSeconds, cancelled = false } = input
  const { steps, stop, problems, before } = contractStepsOf({ ...input, final: true })
  if (before) return beforeBuildRun(problems)
  const failed = steps.find((s) => s.state === 'failed')
  const result = cancelled ? 'cancelled' : stop ? 'stopped' : 'done'
  const reason = [stop?.code, stop?.error].filter(Boolean).join(': ') || 'the build stopped'
  const doc = {
    schema: OUTCOME_SCHEMA,
    planId,
    planRevision,
    run,
    result,
    elapsedSeconds: seconds(elapsedSeconds),
    steps,
    ...(result === 'cancelled' ? { cancelled: { teamNotified: false } } : {}),
    ...(result === 'stopped'
      ? {
          stopped: {
            step: failed?.id ?? 'write',
            reason: [...reason].slice(0, TEXT_LIMITS.reason).join(''),
            teamNotified: true
          }
        }
      : {})
  }
  return checked(doc, outcomeProblems, problems)
}

/** The document of the run as it stands: the outcome when `final`, else a progress event (`seq` needed). */
export const contractRunOf = ({ final = false, ...input }) =>
  final ? outcomeOf(input) : progressEventOf(input)
