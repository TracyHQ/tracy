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
 *                                                                                  └─ Write step
 *
 * Every model door the chain needs is checked first, before any model work: an empty door stops the build up front
 * (ADR 0047, consequences). The template kit is fetched and checked next, before anything forks. The Write step writes
 * the files to the site and nothing else: there is no site check and no repair pass inside a build (ADR 0047, decisions
 * 1 and 3). Every model step reads the research revision the benches read (`brief.researchRevisionId`).
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
 * error may carry the `value` it still made, and the `usd` it spent), and is given the run's `AbortSignal`.
 */

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

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places

/** When each running step started, ISO, from the clock readings the run keeps (`active`). */
const sinceOf = (active) =>
  Object.fromEntries([...active].map(([step, ms]) => [step, new Date(ms).toISOString()]))
const messageOf = (error) => String(error instanceof Error ? error.message : error).slice(0, 300)

/**
 * A value as the record keeps it: a template kit by its ref (its document is the kit's own file), a Write step's answer by
 * its report's status, counts and cause, anything else as it is (file paths, small objects).
 * @param {any} value
 */
export function recordedValue(value) {
  if (!value || typeof value !== 'object') return value ?? null
  if (typeof value.ref === 'string' && ('doc' in value || 'contentMap' in value)) return { ref: value.ref }
  if (value.report && typeof value.report === 'object') {
    const { status, counts, cause } = value.report
    return { report: { status: status ?? null, counts: counts ?? null, ...(cause ? { cause } : {}) } }
  }
  return value
}

/** A step's inputs as the record keeps them, each by `recordedValue`. */
const recordedInputs = (inputs) =>
  Object.fromEntries(Object.entries(inputs ?? {}).map(([name, value]) => [name, recordedValue(value)]))

/** The USD fields of a record line, from a step's answer or its error. */
const spendOf = (from) => ({
  usd: from?.usd === null ? null : Number(from?.usd ?? 0),
  ...(from?.usd === null ? { knownUsd: Number(from?.knownUsd ?? 0) } : {})
})

/** What a Write step's value adds to its record line: the site recovery and the structural diagnostics it measured. */
const writeExtras = (value) => ({
  ...(value?.report?.recovery ? { recovery: value.report.recovery } : {}),
  ...(value?.diagnostics ? { diagnostics: value.diagnostics } : {})
})

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
   * line. A second failure (or one under a stopped signal) stops the build: `run.stop` names it, `halt` stops the rest.
   */
  async function attempt(run, ctx, step, inputs, how) {
    for (let n = 1; ; n += 1) {
      if (run.stop) throw HALTED
      const start = now()
      run.active.set(step, start)
      await run.snap()
      try {
        const answer = await (step === 'write' ? writeOnce : steps[step])(ctx, inputs, how)
        run.active.delete(step)
        run.record.push({
          step,
          attempt: n,
          startMs: start - run.t0,
          endMs: now() - run.t0,
          ...spendOf(answer),
          outcome: 'done',
          inputs: recordedInputs(inputs),
          output: recordedValue(answer?.value ?? null),
          ...(step === 'write' ? writeExtras(answer?.value) : {})
        })
        await run.snap()
        return answer?.value ?? null
      } catch (error) {
        run.active.delete(step)
        const stopped = how.signal.aborted
        const last = stopped || n >= STEP_CHAIN_ATTEMPTS
        const line = {
          step,
          attempt: n,
          startMs: start - run.t0,
          endMs: now() - run.t0,
          ...spendOf(error),
          outcome: stopped ? 'stopped' : last ? 'failed' : 'failed, re-running',
          ...(typeof error?.code === 'string' ? { code: error.code } : {}),
          error: messageOf(error),
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
        const summary = summaryOf(run, [...run.active.keys()])
        // Parallel steps share one row. Persist snapshots in order so a slower earlier write
        // cannot erase another step's start, completion or measured spend.
        progressWrite = progressWrite.then(() => ctx.progress?.(summary)).catch(() => {})
        return progressWrite
      }
      const how = { signal }
      try {
        if (steps.doors) {
          const start = now()
          const empty = await steps.doors(ctx)
          const line = { step: 'doors', attempt: 1, startMs: start - t0, endMs: now() - t0, usd: 0 }
          if (empty.length) {
            const error = `empty model doors: ${empty.map((d) => `${d.door} (${d.state})`).join(', ')}`
            run.record.push({
              ...line,
              outcome: 'failed',
              code: STEP_CHAIN_DOORS_EMPTY,
              error,
              output: { empty }
            })
            run.stop = {
              step: 'doors',
              attempts: 1,
              code: STEP_CHAIN_DOORS_EMPTY,
              error,
              inputs: {},
              output: { empty }
            }
            throw HALTED
          }
          run.record.push({ ...line, outcome: 'done' })
        }
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

    /** The run's record goes to the steps' `dispose` with it, which keeps it (ADR 0047, decision 5). */
    async dispose(run) {
      if (!run) return
      await steps.dispose?.({ ...run, chain: summaryOf(run) })
    }
  }
}

/**
 * The measurement the row keeps (`timings.chain`): per step attempt its minutes and USD, the totals, and how the run
 * ended: `running`, `complete` (every step, ending with the Write step, completed) or `stopped` (a step failed twice,
 * or a model door was empty; `failedStep` and `stop` name it).
 * @param {Array<{step: string, startMs: number, endMs: number, usd: number | null, knownUsd?: number, outcome: string, error?: string}>} record
 * @param {string | null} failed
 * @param {number} totalMs
 * @param {string[] | null} [running] - the steps under way, for a snapshot of a run still going
 * @param {Record<string, string> | null} [runningSince] - when each running step started, ISO
 * @param {object | null} [stop] - the stop report, when the build stopped
 */
export function chainSummary(record, failed, totalMs, running = null, runningSince = null, stop = null) {
  const complete = record.every((s) => Number.isFinite(s.usd))
  const knownUsd = round(
    record.reduce(
      (sum, s) => sum + (Number.isFinite(s.usd) ? s.usd : Number.isFinite(s.knownUsd) ? s.knownUsd : 0),
      0
    ),
    4
  )
  return {
    // A snapshot of a run still going (`running`: the steps under way) says so; the row's state tells the reader whether
    // the run is still going or ended without finishing the record (a hard failure).
    ending: running ? 'running' : failed ? 'stopped' : 'complete',
    ...(running
      ? { running, ...(runningSince ? { runningSince } : {}) }
      : failed
        ? { failedStep: failed }
        : {}),
    // The report for the Tracy team when the build stopped: the step, its inputs, its output and the error (ADR 0047).
    ...(stop ? { stop } : {}),
    totalMinutes: round(totalMs / 60_000, 2),
    totalUsd: complete ? knownUsd : null,
    ...(complete ? {} : { knownUsd }),
    steps: record.map((s) => ({
      ...s,
      minutes: round((s.endMs - s.startMs) / 60_000, 2),
      usd: Number.isFinite(s.usd) ? round(s.usd, 4) : null
    }))
  }
}

/**
 * The base site as a step of the measurement. The host makes it beside the model steps, from the press until the host
 * says it is up, so it is not timed by the chain's own clock: its minutes are given. It costs no model money.
 * @param {ReturnType<typeof chainSummary>} chain
 * @param {number} ms - from the press until the site was up
 */
export function withBaseSite(chain, ms) {
  const minutes = round(Math.max(0, Number.isFinite(ms) ? ms : 0) / 60_000, 2)
  return { ...chain, steps: [{ step: 'site', minutes, usd: 0, outcome: 'done' }, ...chain.steps] }
}
