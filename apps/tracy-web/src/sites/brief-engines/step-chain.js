/**
 * The step chain as one build (#483, spec #472): a brief-build engine that runs the new build flow on the server for a
 * build whose quickstart template is allow-listed (`lib/step-chain-switch.js`). The run frame (`brief-build.js`) gives it
 * what it gives every engine: `prepare` while the host creates the base site from the template's quickstart, then
 * `apply` once the site is up. So the order is the bench's:
 *
 *     press ──┬─ the host creates the base site ───────────────────────────────────┐
 *             └─ template kit ─┬─ brand step ──────────────────────────────────────┤ all ready?
 *                              └─ planner ─┬─ Site copy (writer + Copy check) ─────┤
 *                                          └─ Picture manifest ────────────────────┘
 *                                                                                  └─ Write step (step 9)
 *
 * The template kit is fetched and checked first, before anything forks. The Write step is step 9 whole
 * (`write-step-nine.js` `runStepNine`: write, Site check, 9b repair pass, recheck, hand-over); it waits for the base site,
 * the brand, the copy and the pictures. Every model step reads the research revision the benches read
 * (`brief.researchRevisionId`). The brand boundary alone can fill a missing voice from the frame's selected site language,
 * recording that projection on the brand run without changing the revision.
 *
 * 🔒 EVERY WRITE GOES THROUGH THE SETUP DOOR UNDER THE RUN'S ID. The Write step is handed one site door,
 * `applyFor(email, runId)` (the Apply door as the person who pressed Build, `applyAs(..., { setupRun })`), so Site changes
 * folds every write of the build into one "Tracy setup" row.
 *
 * 🔒 FAILURE IS SOFT AND SILENT, AND THE WRITE NEVER LEAVES DEMO CONTENT (ADR 0044, the product owner's rule). A step that
 * fails does not stop the others: what depends on its output is skipped, and the Write step still runs with whatever
 * exists. A failed step that still made something (the checks rejected every version) hands over its best version, which
 * is used. A step that made nothing hands over nothing: the Write step then writes from stand-ins (a plan that keeps the
 * whole kit, a copy that fills nothing, `write-step/stand-in-files.js`), and its closing ladder empties every kept slot
 * nothing fills (decision 31). Only a template kit that cannot be read stops the Write step, since no slot can be mapped
 * without it: the base site is handed over as created (a configuration error). Either way the run ends `applied`, with
 * the ending kept on the row (`timings.chain`), and nothing is said to the operator or the owner. An enabled template
 * never falls back to the old build.
 *
 * Steps are injected (`app.js` wires the real ones, `step-chain-steps.js`); each answers `{ value, usd }` or throws (an
 * error may carry the `value` it still made, and the `usd` it spent), and is given the run's `AbortSignal`.
 */
import { REPAIR_LIMITS } from '../../write-step/repair-pass/repair-limits.js'

/**
 * The outer deadline of a chain run (#478): the model steps get this long, counted from the start of `prepare`. A step
 * still going at the deadline is stopped (its best version, if it made one, is used) and the run ends as a soft failure:
 * the Write step still runs, so the site is handed over and no kept slot keeps demo content.
 */
export const STEP_CHAIN_DEADLINE_MS = 2 * 60 * 60_000

/** What the Write step (step 9: write, Site check, hand-over) may take after the deadline: the run's hard stop. */
export const STEP_CHAIN_HANDOVER_MS = 15 * 60_000

/**
 * Step 9b's windows for a chain build, from how far into the run the Write step starts. 9b keeps its own 10 and 12 minute
 * windows (`REPAIR_LIMITS`), cut shorter when the deadline is nearer; once the deadline has passed it starts no new work
 * and returns within the handover window.
 *
 * 🔒 THE DEADLINE BOUNDS THE MODEL STEPS, NOT 9b'S WINDOW. #478 let 9b run until the 2 hour deadline. Measured on the local
 * stand (12/11/2026, Central Padel): the write began 22 minutes in, so 9b could start new work for 98 minutes, and it went
 * on one page at a time (about 1 minute of repair, then 1.5 minutes of re-check) past 30 minutes. A build that leaves template pictures
 * behind is fixed at the picture step, not by a longer repair window.
 * @param {number} elapsedMs
 */
export function chainRepairLimits(elapsedMs) {
  const left = Math.max(0, STEP_CHAIN_DEADLINE_MS - elapsedMs)
  if (left === 0) return { stopNewWorkMs: 0, returnByMs: STEP_CHAIN_HANDOVER_MS }
  const stopNewWorkMs = Math.min(left, REPAIR_LIMITS.stopNewWorkMs)
  return { stopNewWorkMs, returnByMs: stopNewWorkMs + (REPAIR_LIMITS.returnByMs - REPAIR_LIMITS.stopNewWorkMs) }
}

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
 * @typedef {object} StepChainSteps
 * @property {(ctx: object, inputs: {}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} kit
 * @property {(ctx: object, inputs: {kit: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} brand
 * @property {(ctx: object, inputs: {kit: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} plan
 * @property {(ctx: object, inputs: {kit: any, plan: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} copy
 * @property {(ctx: object, inputs: {kit: any, plan: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} pictures
 * @property {(ctx: object, inputs: {kit: any, plan: any, copy: any, brand: any, pictures: any},
 *   how: {signal: AbortSignal, door: {apply: Function}, limits: {stopNewWorkMs: number, returnByMs: number}}) => Promise<{value: any, usd?: number | null, knownUsd?: number}>} write - step 9 whole; any
 *   input but the kit may be null (its step made nothing), and its value carries the write report (`report`)
 * @property {(prepared: any) => Promise<void>} [dispose] - what the steps left behind (files), whatever became of the run
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
  return {
    limits: STEP_CHAIN_LIMITS,
    /** The chain writes the brand itself (step 9), so the frame's own brand step does not run after it. */
    writesBrand: true,
    requiresSetupHold: true,
    ...(steps.validateBase ? { validateBase: (ctx) => steps.validateBase(ctx) } : {}),

    async prepare(ctx) {
      const t0 = now()
      /** @type {Array<{step: string, startMs: number, endMs: number, usd: number | null, knownUsd?: number, outcome: string, error?: string}>} */
      const record = []
      // The outer deadline stops the steps, not the run: the Write step runs after it on the run's own signal.
      const deadline = new AbortController()
      const cancelTimer = timer(() => deadline.abort(new Error('the chain deadline')), deadlineMs)
      const signal = AbortSignal.any([ctx.signal, deadline.signal])
      let failed = null
      /**
       * The steps running now (each with the clock reading it started at), and the snapshot of the run so far that the
       * row keeps while the run is going. The start of each running step goes on the snapshot (`runningSince`) so the
       * doors can say how long it has been running (#537).
       */
      const active = new Map()
      let progressWrite = Promise.resolve()
      const snap = () => {
        const summary = chainSummary(record, failed, now() - t0, [...active.keys()], sinceOf(active))
        // Parallel steps share one row. Persist snapshots in order so a slower earlier write
        // cannot erase another step's start, completion or measured spend.
        progressWrite = progressWrite.then(() => ctx.progress?.(summary)).catch(() => {})
        return progressWrite
      }
      /** Run one step, timed and costed; a failure is kept, never thrown, and what the step still made is used. */
      const run = async (step, inputs) => {
        const start = now()
        active.set(step, start)
        await snap()
        try {
          const answer = await steps[step](ctx, inputs, { signal })
          active.delete(step)
          record.push({
            step,
            startMs: start - t0,
            endMs: now() - t0,
            usd: answer?.usd === null ? null : Number(answer?.usd ?? 0),
            ...(answer?.usd === null ? { knownUsd: Number(answer?.knownUsd ?? 0) } : {}),
            outcome: 'done'
          })
          await snap()
          return { value: answer?.value ?? null }
        } catch (error) {
          active.delete(step)
          const made = error?.value ?? null
          record.push({
            step,
            startMs: start - t0,
            endMs: now() - t0,
            usd: error?.usd === null ? null : Number(error?.usd ?? 0),
            ...(error?.usd === null ? { knownUsd: Number(error?.knownUsd ?? 0) } : {}),
            outcome: signal.aborted ? 'stopped' : made ? 'failed, best version used' : 'failed',
            ...(typeof error?.code === 'string' ? { code: error.code } : {}),
            error: messageOf(error)
          })
          failed ??= step
          await snap()
          return made ? { value: made } : null
        }
      }
      /** A step that cannot start because the step it reads made nothing. */
      const skip = (step, because) => {
        const at = now() - t0
        record.push({
          step,
          startMs: at,
          endMs: at,
          usd: 0,
          outcome: 'skipped',
          error: `no ${because} to work from`
        })
        return null
      }
      try {
        const kit = await run('kit', {})
        if (!kit) return { runId: ctx.runId, t0, record, failed, inputs: null, snap, active }
        const [brand, planned] = await Promise.all([
          run('brand', { kit: kit.value }),
          run('plan', { kit: kit.value }).then(async (plan) => {
            if (!plan) return { plan: null, copy: skip('copy', 'plan'), pictures: skip('pictures', 'plan') }
            const [copy, pictures] = await Promise.all([
              run('copy', { kit: kit.value, plan: plan.value }),
              run('pictures', { kit: kit.value, plan: plan.value })
            ])
            return { plan, copy, pictures }
          })
        ])
        return {
          runId: ctx.runId,
          t0,
          record,
          failed,
          snap,
          active,
          inputs: {
            kit: kit.value,
            plan: planned.plan?.value ?? null,
            copy: planned.copy?.value ?? null,
            brand: brand?.value ?? null,
            pictures: planned.pictures?.value ?? null
          }
        }
      } finally {
        cancelTimer()
      }
    },

    async apply(ctx, prepared) {
      const { t0, record, snap, active } = prepared
      let { failed } = prepared
      let wrote = 0
      let kept = 0
      if (prepared.inputs) {
        const start = now()
        active.set('write', start)
        await snap()
        try {
          const door = { apply: applyFor(ctx.email, ctx.runId) }
          const answer = await steps.write(ctx, prepared.inputs, {
            signal: ctx.signal,
            door,
            limits: chainRepairLimits(start - t0)
          })
          const report = answer?.value?.report ?? null
          const ok = report?.status === 'done'
          record.push({
            step: 'write',
            startMs: start - t0,
            endMs: now() - t0,
            usd: answer?.usd === null ? null : Number(answer?.usd ?? 0),
            ...(answer?.usd === null ? { knownUsd: Number(answer?.knownUsd ?? 0) } : {}),
            outcome: ok ? 'done' : 'failed',
            ...(report?.recovery ? { recovery: report.recovery } : {}),
            ...(answer?.value?.diagnostics ? { diagnostics: answer.value.diagnostics } : {}),
            ...(ok ? {} : { error: messageOf(report?.cause?.reason ?? report?.status ?? 'no write report') })
          })
          if (!ok) failed ??= 'write'
          wrote = Number(report?.counts?.written ?? 0)
          kept = Number(report?.counts?.skipped ?? 0)
        } catch (error) {
          record.push({
            step: 'write',
            startMs: start - t0,
            endMs: now() - t0,
            usd: error?.usd === null ? null : Number(error?.usd ?? 0),
            ...(error?.usd === null ? { knownUsd: Number(error?.knownUsd ?? 0) } : {}),
            outcome: 'failed',
            error: messageOf(error)
          })
          failed ??= 'write'
        }
      }
      return { wrote, kept, chain: chainSummary(record, failed, now() - t0) }
    },

    async dispose(prepared) {
      await steps.dispose?.(prepared)
    }
  }
}

/**
 * The measurement the row keeps (`timings.chain`): per step its minutes and USD, the totals, and how the run ended.
 * @param {Array<{step: string, startMs: number, endMs: number, usd: number | null, knownUsd?: number, outcome: string, error?: string}>} record
 * @param {string | null} failed
 * @param {number} totalMs
 * @param {string[] | null} [running]
 * @param {Record<string, string> | null} [runningSince] - when each running step started, ISO
 */
export function chainSummary(record, failed, totalMs, running = null, runningSince = null) {
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
    ending: running ? 'running' : failed ? 'soft-failure' : 'complete',
    ...(running
      ? { running, ...(runningSince ? { runningSince } : {}) }
      : failed
        ? { failedStep: failed }
        : {}),
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
