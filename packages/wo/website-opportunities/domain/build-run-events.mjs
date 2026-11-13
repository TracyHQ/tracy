// The step chain's own step records turned into Contract B progress events and the final outcome (#597; Contract B:
// `build-contract-run.mjs`, docs/references/build-contract.md). Pure: the engine's record lines in, one document out,
// checked by the Contract B validators before it is returned, so the caller sends only a valid one.
//
// Engine steps map onto Contract B steps:
//   look              -> look
//   writer:<pageId>   -> writer, with that page
//   pictures + icons  -> one pictures step: failed if either failed, running if either runs, done when both are done
//   order + write     -> write
// Every other engine step (the doors, the kit, needs, brand, answers, plan, approval: the steps before approval) is not
// a Contract B step and never shows. A site check is never a build step (ADR 0047, decision 3): no event carries one.
//
// Attempts. Contract B counts the engine's re-run: a failing step is re-run once, and `failed` is on attempt 2. A step
// that made its own second attempt and stops at once (`noRerun`, the page writer's `copy_check_failed`) reports the
// attempts it made (`details.attempts`), so it fails on attempt 2. A step that stops on its FIRST attempt without a
// second try of its own (a deterministic `noRerun` stop, a stop by the deadline) is reported as it is, failed on
// attempt 1: Contract B cannot express that, so the document comes back with its problems and is not sent.
import { OUTCOME_SCHEMA, PROGRESS_SCHEMA, outcomeProblems, progressProblems } from './build-contract-run.mjs'
import { TEXT_LIMITS } from './build-contract-shapes.mjs'
import { reporterFor } from './build-contract-shared.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** The error codes of a step that already made its own second attempt when it stops (`noRerun`). */
const SELF_RETRIED_CODES = new Set(['copy_check_failed'])
const WRITER = 'writer:'

/** The Contract B step an engine step belongs to, or null for a step Contract B does not show. */
export function contractStepOf(engineStep) {
  if (engineStep === 'look') return { id: 'look', kind: 'look' }
  if (typeof engineStep === 'string' && engineStep.startsWith(WRITER) && engineStep.length > WRITER.length)
    return { id: engineStep, kind: 'writer', page: engineStep.slice(WRITER.length) }
  if (engineStep === 'pictures' || engineStep === 'icons') return { id: 'pictures', kind: 'pictures' }
  if (engineStep === 'order' || engineStep === 'write') return { id: 'write', kind: 'write' }
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

const labelOf = (step, pages) => {
  if (step.kind === 'look') return 'Apply your colours and logo'
  if (step.kind === 'pictures') return 'Place your photos and icons'
  if (step.kind === 'write') return 'Put the pages on your site'
  const name = list(pages).find((p) => p.id === step.page)?.name
  return typeof name === 'string' && name.trim() ? `Write the ${name.trim()} page` : 'Write a page'
}

/** The attempts a failed line stands for: its own, or the step's own second attempt (`details.attempts`). */
function failedAttempt(line) {
  const own = Number.isInteger(line?.details?.attempts) ? line.details.attempts : null
  const self = own ?? (SELF_RETRIED_CODES.has(line?.code) ? 2 : 1)
  return Math.max(line?.attempt ?? 1, self)
}

/** One engine step's state: `{state, attempt}` from its record lines, whether it runs, and the step the build stopped at. */
function engineStateOf(name, { record, running, stop }) {
  const lines = record.filter((l) => l?.step === name)
  const last = lines.at(-1)
  if (stop?.step === name)
    return { state: 'failed', attempt: failedAttempt(last ?? { attempt: stop.attempts }) }
  if (running.includes(name)) return { state: 'running', attempt: lines.length + 1 }
  if (!last || last.outcome === 'stopped') return { state: 'pending', attempt: 0 }
  if (last.outcome === 'done') return { state: 'done', attempt: last.attempt }
  // A first failure being re-run: shown running on attempt 2 even before the second attempt starts.
  if (last.outcome === 'failed, re-running') return { state: 'running', attempt: last.attempt + 1 }
  return { state: 'failed', attempt: failedAttempt(last) }
}

/** The state of a Contract B step from its engine steps (`contractStepOf`): see the header for the rule. */
function groupStateOf(states, stopped) {
  const failed = states.find((s) => s.state === 'failed')
  if (failed) return failed
  const attempt = Math.max(0, ...states.map((s) => s.attempt))
  if (states.every((s) => s.state === 'done')) return { state: 'done', attempt }
  if (states.every((s) => s.state === 'pending')) return { state: 'pending', attempt: 0 }
  // Part done, part not started: under way while the build runs; once it has stopped nothing runs, and the part done
  // does not make the step done.
  if (stopped && !states.some((s) => s.state === 'running')) return { state: 'pending', attempt: 0 }
  return { state: 'running', attempt: Math.max(1, attempt) }
}

/**
 * The Contract B steps of a run, in order.
 * @param {{run: {kind: string}, pages: Array<{id: string, name?: string}>, record: object[], running?: string[],
 *   stop?: {step: string, attempts?: number} | null, engineSteps?: string[]}} input `record`: the engine's record
 *   lines (`{step, attempt, outcome, code?, details?}`); `running`: the engine steps under way; `stop`: the engine's
 *   stop (`run.stop`); `engineSteps`: the engine steps of the run (a full build: `buildEngineSteps(pages)`)
 */
export function contractStepsOf({ pages, record, running = [], stop = null, engineSteps }) {
  const names = engineSteps ?? buildEngineSteps(pages)
  const groups = new Map()
  for (const name of names) {
    const step = contractStepOf(name)
    if (!step) continue
    if (!groups.has(step.id)) groups.set(step.id, { step, members: [] })
    groups.get(step.id).members.push(name)
  }
  const ctx = { record: list(record), running: list(running), stop }
  return [...groups.values()].map(({ step, members }) => ({
    ...step,
    label: labelOf(step, pages),
    ...groupStateOf(
      members.map((m) => engineStateOf(m, ctx)),
      Boolean(stop)
    )
  }))
}

const checked = (doc, check) => {
  const problems = []
  check(doc, reporterFor(problems))
  return { doc, problems }
}
const seconds = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)

/**
 * A progress event of the run: a full snapshot of its steps.
 * @param {{planId: string, planRevision: number, run: {id: string, kind: 'build' | 'partial', edit?: string},
 *   seq: number, elapsedSeconds: number}} input plus the fields of `contractStepsOf`
 * @returns {{doc: object, problems: Array<{at: string, message: string}>}} `doc` is a `tracy-build-progress/v1`
 *   event; send it only when `problems` is empty
 */
export function progressEventOf(input) {
  const { planId, planRevision, run, seq, elapsedSeconds } = input
  return checked(
    {
      schema: PROGRESS_SCHEMA,
      planId,
      planRevision,
      run,
      seq,
      elapsedSeconds: seconds(elapsedSeconds),
      steps: contractStepsOf({ ...input, running: input.stop ? [] : input.running })
    },
    progressProblems
  )
}

/**
 * The final outcome of the run: `done` only when the write step (order and write) completed and every step is done;
 * else `stopped` at the step the engine stopped at, its reason for the Tracy team.
 * @param {object} input the fields of `progressEventOf` without `seq`
 * @returns {{doc: object, problems: Array<{at: string, message: string}>}} `doc` is a `tracy-build-outcome/v1`
 */
export function outcomeOf(input) {
  const { planId, planRevision, run, elapsedSeconds, stop = null } = input
  const steps = contractStepsOf({ ...input, running: [] })
  const done = !stop && steps.at(-1)?.kind === 'write' && steps.every((s) => s.state === 'done')
  const failed = steps.find((s) => s.state === 'failed')
  const reason = [stop?.code, stop?.error].filter(Boolean).join(': ') || 'the build did not finish'
  return checked(
    {
      schema: OUTCOME_SCHEMA,
      planId,
      planRevision,
      run,
      result: done ? 'done' : 'stopped',
      elapsedSeconds: seconds(elapsedSeconds),
      steps,
      ...(done
        ? {}
        : {
            stopped: {
              step: failed?.id ?? contractStepOf(stop?.step)?.id ?? 'write',
              reason: [...reason].slice(0, TEXT_LIMITS.reason).join(''),
              teamNotified: true
            }
          })
    },
    outcomeProblems
  )
}

/** The document of the run as it stands: the outcome when `final`, else a progress event (`seq` needed). */
export const contractRunOf = ({ final = false, ...input }) =>
  final ? outcomeOf(input) : progressEventOf(input)
