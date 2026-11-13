/**
 * The step chain as one build (#483, spec #472): a brief-build engine that runs the new build flow on the server for a
 * build whose quickstart template is allow-listed (`lib/step-chain-switch.js`). The run frame (`brief-build.js`) gives it
 * what it gives every engine: `prepare` while the host creates the base site from the template's quickstart, then
 * `apply` once the site is up. So the order is the bench's:
 *
 *     press ──┬─ the host creates the base site ───────────────────────────────────┐
 *             └─ model doors ─ template kit ─┬─ brand step ────────────────────────┤ all ready?
 *                                            └─ planner ─┬─ Site copy ─────────────┤
 *                                                        └─ Picture manifest ──────┘
 *                                                                                  ├─ icons ─ write order (an assembled run)
 *                                                                                  └─ Write step
 *
 * Every model door the chain needs is checked first, before any model work: an empty door stops the build up front
 * (ADR 0047, consequences). The template kit is fetched and checked next, before anything forks. The Write step writes
 * the files to the site and nothing else: there is no site check and no repair pass inside a build (ADR 0047, decisions
 * 1 and 3). Every model step reads the research revision the benches read (`brief.researchRevisionId`).
 *
 * AN ASSEMBLED RUN (#597): when the steps say a run is assembled from the domain steps (`assembles(ctx)`, a run built
 * from an approved build draft), two more steps run once the copy and the pictures are both made: `icons` (the icons
 * follow the written copy and are checked against the placed frames) and `order` (the write order is built and
 * checked). The Write step is then handed the order beside the other inputs. Any other run keeps the chain above.
 *
 * 🔒 EVERY WRITE GOES THROUGH THE SETUP DOOR UNDER THE RUN'S ID. The Write step is handed one site door,
 * `applyFor(email, runId)` (the Apply door as the person who pressed Build, `applyAs(..., { setupRun })`), so Site changes
 * folds every write of the build into one "Tracy setup" row.
 *
 * 🔒 A FAILING STEP IS RE-RUN ONCE, THEN THE BUILD STOPS AND REPORTS (ADR 0047, decision 2; #591). A step that throws (or a
 * Write step whose report is not `done`) is run again exactly once, from the same inputs it was given. A second failure
 * stops the whole build: the steps still running are stopped, nothing later starts, nothing is written, and the engine
 * throws a stop error (`STEP_CHAIN_STOPPED`) whose message is the sentence the customer is told, and which carries the
 * report for the Tracy team (`stop`: the step, its inputs, its output and the error) and the whole measurement (`chain`).
 * A step stopped by the run's own deadline is not re-run: the build stops at it. There are no stand-ins and no "best
 * version": what a failed step still made is kept in the report, never written. So a build ends `complete` only when
 * every step, ending with the Write step, completed (ADR 0047, decision 3).
 *
 * 🔒 EVERY STEP KEEPS ITS RECORD (ADR 0047, decision 5). Each attempt of each step is a record line: when it ran, what it
 * cost, how it ended, its inputs and its output (a kit by its ref, files by their path). The lines go on the row while
 * the run goes (`timings.chain`, through `ctx.progress`) and are handed to the steps' `dispose` at the end, which keeps
 * them on disk with the files they name (`step-chain-steps.js`), with no flag.
 *
 * Steps are injected (`app.js` wires the real ones, `step-chain-steps.js`); each answers `{ value, usd }` or throws (an
 * error may carry the `value` it still made, the `usd` it spent, bounded `details` naming what failed, and `noRerun: true`
 * when the step already made its own second attempt), and is given the run's `AbortSignal` and the attempt's number. An
 * answer with no value is a failure of that step. Each attempt gets its own deep copy of its inputs.
 *
 * 🔒 THE RECORD AND THE ROW AGREE. A run ends `complete` only when its last record line is a completed Write step. When
 * the run frame fails a run outside the engine (the site never came up, the setup hold was not proven, the apply timed
 * out), it calls `end(run, error)`: the run's stop names that reason, and the row and the kept record both carry it.
 */
import {
  chainSummary,
  detailsOf,
  messageOf,
  recordedInputs,
  recordedValue,
  sinceOf,
  spendOf,
  STEP_CHAIN_RUN_FAILED,
  writeExtras
} from './step-chain-record.js'

export {
  chainSummary,
  recordedValue,
  STEP_CHAIN_INCOMPLETE,
  STEP_CHAIN_RUN_FAILED,
  withBaseSite
} from './step-chain-record.js'

/**
 * The outer deadline of a chain run (#478): the model steps get this long, counted from the start of `prepare`. A step
 * still going at the deadline is stopped, and the build stops at it (ADR 0047).
 */
export const STEP_CHAIN_DEADLINE_MS = 2 * 60 * 60_000

/** What the Write step may take after the deadline: the run's hard stop. */
export const STEP_CHAIN_HANDOVER_MS = 15 * 60_000

/** The code of the error a stopped build throws (`stopError`). */
export const STEP_CHAIN_STOPPED = 'STEP_CHAIN_STOPPED'

/** The code of the stop report when a model door the chain needs is empty. */
export const STEP_CHAIN_DOORS_EMPTY = 'STEP_CHAIN_DOORS_EMPTY'

/** How many times a step runs at most: once, and once again from the same inputs (ADR 0047, decision 2). */
export const STEP_CHAIN_ATTEMPTS = 2

/**
 * What the customer is told when the build stops: the row's error, which the poll door hands back. It names no step and no
 * system fault (ADR 0047, decision 4: a broken step is never a question to the customer).
 */
export const STEP_CHAIN_STOPPED_MESSAGE =
  'Your site could not be finished. The Tracy team has the details and will look into it.'

/**
 * The frame's clocks for a chain run (#478): the frame's 25 minute run cut and its apply cut do not apply. The steps are
 * bounded by the engine's own deadline; the frame's `runMs` is only the backstop for a worker that is stuck after it.
 */
export const STEP_CHAIN_LIMITS = Object.freeze({
  prepareMs: STEP_CHAIN_DEADLINE_MS,
  // A queued opening seal must finish before setup writes or a backup history read can begin.
  webrootMs: 3 * 60_000,
  // Counted from the site coming up: as long as the deadline, so it never fires before the engine's own deadline does.
  prepareGraceMs: STEP_CHAIN_DEADLINE_MS,
  applyMs: STEP_CHAIN_DEADLINE_MS + STEP_CHAIN_HANDOVER_MS,
  runMs: STEP_CHAIN_DEADLINE_MS + STEP_CHAIN_HANDOVER_MS
})

/** A real timer that never keeps the process alive: `(fire, ms) => cancel`. */
const realTimer = (fire, ms) => {
  const handle = setTimeout(fire, ms)
  handle.unref?.()
  return () => clearTimeout(handle)
}

/** The code of a step failure when a step answered no value at all (`{ value: null }` or nothing). */
export const STEP_CHAIN_NO_OUTPUT = 'STEP_CHAIN_NO_OUTPUT'

/** The inputs of one attempt: its own deep copy, so no step sees what a parallel step or an earlier attempt changed. */
const ownCopy = (inputs) => structuredClone(inputs ?? {})

/**
 * The error a stopped build throws. Its message is what the customer is told; `stop` is the report for the Tracy team;
 * `chain` the measurement the row keeps; `prepared` what the steps left, so the frame can hand it to `dispose`.
 */
function stopError(stop, chain, prepared) {
  return Object.assign(new Error(STEP_CHAIN_STOPPED_MESSAGE), {
    code: STEP_CHAIN_STOPPED,
    stop,
    chain,
    prepared
  })
}

/** Thrown inside a run once the build has stopped, so every branch still under way unwinds. */
const HALTED = Symbol('the build stopped')

/**
 * @typedef {object} StepChainSteps
 * @property {(ctx: object) => Promise<Array<{door: string, state: string}>>} [doors] - the model doors the chain needs that
 *   cannot be answered (unset, disabled, unreadable, no model); none means every door is ready
 * @property {(ctx: object, inputs: {}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} kit
 * @property {(ctx: object, inputs: {kit: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} brand
 * @property {(ctx: object, inputs: {kit: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} plan
 * @property {(ctx: object, inputs: {kit: any, plan: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} copy
 * @property {(ctx: object, inputs: {kit: any, plan: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} pictures
 * @property {(ctx: object, inputs: {kit: any, plan: any, copy: any, brand: any, pictures: any},
 *   how: {signal: AbortSignal, door: {apply: Function}}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} write - the
 *   Write step; its value carries the write report (`report`), and only a report `done` is a completed step
 * @property {(ctx: object) => boolean} [assembles] - whether this run runs `icons` and `order` (default: whenever
 *   `order` is given)
 * @property {(ctx: object, inputs: {kit: any, plan: any, copy: any, pictures: any}, how: {signal: AbortSignal}) =>
 *   Promise<{value: any, usd?: number | null}>} [icons] - the icons of an assembled run, after the copy
 * @property {(ctx: object, inputs: {kit: any, plan: any, copy: any, pictures: any, brand: any, icons?: any},
 *   how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null}>} [order] - the write order of an assembled
 *   run, built and checked
 * @property {(prepared: any) => Promise<void>} [dispose] - keeps the run's record (`prepared.chain`) with what the steps
 *   left behind (files), whatever became of the run
 */

/**
 * @param {{ steps: StepChainSteps, applyFor: (email: string, setupRun: string) => (call: any) => Promise<any>,
 *   now?: () => number, timer?: (fire: () => void, ms: number) => () => void, deadlineMs?: number }} deps
 */
export function createStepChainEngine({
  steps,
  applyFor,
  now = Date.now,
  timer = realTimer,
  deadlineMs = STEP_CHAIN_DEADLINE_MS
}) {
  /** The measurement of a run as it stands (`prepared` is the run's own state, shared by `prepare` and `apply`). */
  const summaryOf = (run, running = null) =>
    chainSummary(
      run.record,
      run.stop?.step ?? null,
      now() - run.t0,
      running,
      running ? sinceOf(run.active) : null,
      run.stop
    )

  /**
   * Run one step, timed and costed, at most `STEP_CHAIN_ATTEMPTS` times from the same inputs. Every attempt is a record
   * line, and every attempt gets its own deep copy of the inputs. A second failure (or one under a stopped signal, or an
   * error marked `noRerun`) stops the build: `run.stop` names it, `halt` stops the rest.
   */
  async function attempt(run, ctx, step, inputs, how) {
    for (let n = 1; ; n += 1) {
      if (run.stop) throw HALTED
      const start = now()
      run.active.set(step, start)
      await run.snap()
      try {
        // A run already stopped (its deadline, the frame) starts no step: the attempt is recorded as stopped.
        if (how.signal.aborted) throw how.signal.reason ?? new Error('the build stopped')
        const answer = await runStep(step)(ctx, ownCopy(inputs), { ...how, attempt: n })
        if (answer?.value === undefined || answer?.value === null)
          throw Object.assign(new Error(`the ${step} step answered no value`), {
            code: STEP_CHAIN_NO_OUTPUT,
            usd: answer?.usd,
            knownUsd: answer?.knownUsd
          })
        run.active.delete(step)
        run.record.push({
          step,
          attempt: n,
          startMs: start - run.t0,
          endMs: now() - run.t0,
          ...spendOf(answer),
          outcome: 'done',
          inputs: recordedInputs(inputs),
          output: recordedValue(answer.value),
          ...(step === 'write' ? writeExtras(answer.value) : {})
        })
        await run.snap()
        return answer.value
      } catch (error) {
        run.active.delete(step)
        const stopped = how.signal.aborted
        // 🔒 ONE RE-RUN, OWNED BY THE ENGINE (ADR 0047, decision 2). A step of the new build path must not retry inside
        // itself beyond what its own ticket defines: the engine's single re-run is the retry. A step that already made its
        // own second attempt (the plan composer's `plan_gate_failed`) marks its error `noRerun: true`, and the build stops
        // at once. The bench steps still run their own fix rounds (`MAX_FIX_ROUNDS`) inside every attempt: they are the
        // old steps, replaced when the new writer and picture policy are wired in.
        const last = stopped || error?.noRerun === true || n >= STEP_CHAIN_ATTEMPTS
        const line = {
          step,
          attempt: n,
          startMs: start - run.t0,
          endMs: now() - run.t0,
          ...spendOf(error),
          outcome: stopped ? 'stopped' : last ? 'failed' : 'failed, re-running',
          ...(typeof error?.code === 'string' ? { code: error.code } : {}),
          error: messageOf(error),
          ...detailsOf(error),
          inputs: recordedInputs(inputs),
          output: recordedValue(error?.value ?? null),
          ...(step === 'write' ? writeExtras(error?.value) : {})
        }
        run.record.push(line)
        if (last && !run.stop) {
          run.stop = {
            step,
            attempts: n,
            ...(line.code ? { code: line.code } : {}),
            error: line.error,
            ...(line.details !== undefined ? { details: line.details } : {}),
            inputs: line.inputs,
            output: line.output
          }
          run.halt.abort(new Error(`the ${step} step failed`))
        }
        await run.snap()
        if (last) throw HALTED
      }
    }
  }

  /** Whether a run runs the assembled steps after the copy and the pictures (`icons`, `order`). */
  const assembles = (ctx) => typeof steps.order === 'function' && (steps.assembles?.(ctx) ?? true)

  /** The function one step runs: the Write step and the door check carry the engine's own judgement of their answer. */
  const runStep = (step) => (step === 'write' ? writeOnce : step === 'doors' ? doorsOnce : steps[step])

  /** The door check once: an empty door is a failure that is not re-run (a door does not fill itself in a second). */
  async function doorsOnce(ctx) {
    const empty = (await steps.doors(ctx)) ?? []
    if (!empty.length) return { value: { empty: [] }, usd: 0 }
    throw Object.assign(
      new Error(`empty model doors: ${empty.map((d) => `${d.door} (${d.state})`).join(', ')}`),
      { code: STEP_CHAIN_DOORS_EMPTY, value: { empty }, noRerun: true, usd: 0 }
    )
  }

  /** The Write step once: a report that is not `done` is a failure of the step, carrying what it wrote. */
  async function writeOnce(ctx, inputs, how) {
    const answer = await steps.write(ctx, inputs, how)
    const report = answer?.value?.report ?? null
    if (report?.status === 'done') return answer
    throw Object.assign(new Error(messageOf(report?.cause?.reason ?? report?.status ?? 'no write report')), {
      ...(typeof report?.cause?.code === 'string' ? { code: report.cause.code } : {}),
      value: answer?.value ?? null,
      usd: answer?.usd,
      knownUsd: answer?.knownUsd
    })
  }

  /** Every branch settled; then, if the build stopped, the stop error (an unexpected error is thrown as it is). */
  async function settled(run, branches) {
    const results = await Promise.allSettled(branches)
    const unexpected = results.find((r) => r.status === 'rejected' && r.reason !== HALTED)
    if (unexpected?.status === 'rejected') throw unexpected.reason
    if (run.stop) throw HALTED
    return results.map((r) => (r.status === 'fulfilled' ? r.value : null))
  }

  return {
    limits: STEP_CHAIN_LIMITS,
    /** The chain writes the brand itself (the Write step), so the frame's own brand step does not run after it. */
    writesBrand: true,
    requiresSetupHold: true,
    ...(steps.validateBase ? { validateBase: (ctx) => steps.validateBase(ctx) } : {}),

    async prepare(ctx) {
      const t0 = now()
      // The outer deadline stops the steps, not the run; a stopped build stops every step still running.
      const deadline = new AbortController()
      const halt = new AbortController()
      const cancelTimer = timer(() => deadline.abort(new Error('the chain deadline')), deadlineMs)
      const signal = AbortSignal.any([ctx.signal, deadline.signal, halt.signal])
      /** The steps running now (each with the clock reading it started at), and the run's record and stop. */
      const run = { runId: ctx.runId, t0, record: [], stop: null, halt, active: new Map(), inputs: null }
      let progressWrite = Promise.resolve()
      run.snap = () => {
        // Once the frame has ended the run (`end`), the row holds the final measurement: no late snapshot replaces it.
        if (run.ended) return progressWrite
        const summary = summaryOf(run, [...run.active.keys()])
        // Parallel steps share one row. Persist snapshots in order so a slower earlier write
        // cannot erase another step's start, completion or measured spend.
        progressWrite = progressWrite.then(() => ctx.progress?.(summary)).catch(() => {})
        return progressWrite
      }
      const how = { signal }
      try {
        // Every model door first, through the same path as a step: an error there stops the build at `doors`.
        if (steps.doors) await attempt(run, ctx, 'doors', {}, how)
        const kit = await attempt(run, ctx, 'kit', {}, how)
        const [brand, planned] = await settled(run, [
          attempt(run, ctx, 'brand', { kit }, how),
          attempt(run, ctx, 'plan', { kit }, how).then(async (plan) => {
            const [copy, pictures] = await settled(run, [
              attempt(run, ctx, 'copy', { kit, plan }, how),
              attempt(run, ctx, 'pictures', { kit, plan }, how)
            ])
            return { plan, copy, pictures }
          })
        ])
        run.inputs = { kit, plan: planned.plan, copy: planned.copy, brand, pictures: planned.pictures }
        if (assembles(ctx)) {
          const made = { kit, plan: planned.plan, copy: planned.copy, pictures: planned.pictures }
          if (steps.icons) run.inputs.icons = await attempt(run, ctx, 'icons', made, how)
          run.inputs.order = await attempt(
            run,
            ctx,
            'order',
            { ...made, brand, ...(steps.icons ? { icons: run.inputs.icons } : {}) },
            how
          )
        }
        return run
      } catch (error) {
        if (error !== HALTED) throw error
        throw stopError(run.stop, summaryOf(run), run)
      } finally {
        cancelTimer()
      }
    },

    async apply(ctx, run) {
      try {
        const value = await attempt(run, ctx, 'write', run.inputs, {
          signal: ctx.signal,
          door: { apply: applyFor(ctx.email, ctx.runId) }
        })
        const counts = value?.report?.counts ?? {}
        return {
          wrote: Number(counts.written ?? 0),
          kept: Number(counts.skipped ?? 0),
          chain: summaryOf(run)
        }
      } catch (error) {
        if (error !== HALTED) throw error
        throw stopError(run.stop, summaryOf(run), run)
      }
    },

    /**
     * The run frame failed the run outside the engine: the run's stop names `reason` (unless a step already stopped it),
     * and the measurement it hands back is the one the row keeps. A run already complete stays complete only when
     * no reason is given.
     * @param {any} run
     * @param {unknown} [reason]
     */
    end(run, reason) {
      if (!run?.record) return null
      run.ended = true
      if (!run.stop && reason !== undefined) {
        run.stop = {
          step: [...run.active.keys()][0] ?? 'run',
          attempts: 0,
          code: typeof reason?.code === 'string' ? reason.code : STEP_CHAIN_RUN_FAILED,
          error: messageOf(reason),
          ...detailsOf(reason)
        }
        run.halt?.abort(new Error('the run failed'))
      }
      return summaryOf(run)
    },

    /** The run's record goes to the steps' `dispose` with it, which keeps it (ADR 0047, decision 5). */
    async dispose(run) {
      if (!run) return
      await steps.dispose?.({ ...run, chain: summaryOf(run) })
    }
  }
}
