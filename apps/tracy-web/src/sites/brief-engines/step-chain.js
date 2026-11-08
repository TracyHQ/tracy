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
 * (`brief.researchRevisionId`), with no adapter.
 *
 * 🔒 EVERY WRITE GOES THROUGH THE SETUP DOOR UNDER THE RUN'S ID. The Write step is handed one site door,
 * `applyFor(email, runId)` (the Apply door as the person who pressed Build, `applyAs(..., { setupRun })`), so Site changes
 * folds every write of the build into one "Tracy setup" row.
 *
 * 🔒 FAILURE IS SOFT AND SILENT (ADR 0044). A step that fails ends the chain early: what depends on its output does not
 * run, and the site is handed over with what was written. A brand or picture step that fails still lets the Write step
 * write the plan and the copy, and the Write step's closing ladder leaves no kept slot with demo content (decision 31). A
 * template kit, planner or writer that fails leaves the Write step nothing it can write from, so the steps still running
 * are stopped and the site is handed over as created. Either way the run ends `applied`, with the ending kept on the row
 * (`timings.chain`), and nothing is said to the operator or the owner. An enabled template never falls back to the old
 * build.
 *
 * Steps are injected (`app.js` wires the real ones, `step-chain-steps.js`); each answers `{ value, usd }` or throws, and is
 * given an `AbortSignal` that fires when the chain no longer needs it.
 */

/** The outer deadline of a whole chain run: past it, the site is handed over as a soft failure. */
export const STEP_CHAIN_DEADLINE_MS = 2 * 60 * 60_000

/** The frame's clocks for a chain run: none cuts a step; only the outer deadline bounds the run. */
export const STEP_CHAIN_LIMITS = Object.freeze({
  prepareMs: STEP_CHAIN_DEADLINE_MS,
  prepareGraceMs: STEP_CHAIN_DEADLINE_MS,
  applyMs: STEP_CHAIN_DEADLINE_MS,
  runMs: STEP_CHAIN_DEADLINE_MS
})

/** The steps whose output the Write step cannot do without: one failing stops the rest of the chain. */
const NEEDED = new Set(['kit', 'plan', 'copy'])

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places
const messageOf = (error) => String(error instanceof Error ? error.message : error).slice(0, 300)

/**
 * @typedef {object} StepChainSteps
 * @property {(ctx: object, inputs: {}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number}>} kit
 * @property {(ctx: object, inputs: {kit: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number}>} brand
 * @property {(ctx: object, inputs: {kit: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number}>} plan
 * @property {(ctx: object, inputs: {kit: any, plan: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number}>} copy
 * @property {(ctx: object, inputs: {kit: any, plan: any}, how: {signal: AbortSignal}) => Promise<{value: any, usd?: number}>} pictures
 * @property {(ctx: object, inputs: {kit: any, plan: any, copy: any, brand: any, pictures: any},
 *   how: {signal: AbortSignal, door: {apply: Function}}) => Promise<{value: any, usd?: number}>} write - step 9 whole; its
 *   value carries the write report (`report`)
 * @property {(prepared: any) => Promise<void>} [dispose] - what the steps left behind (files), whatever became of the run
 */

/**
 * @param {{ steps: StepChainSteps, applyFor: (email: string, setupRun: string) => (call: any) => Promise<any>,
 *   now?: () => number }} deps
 */
export function createStepChainEngine({ steps, applyFor, now = Date.now }) {
  return {
    limits: STEP_CHAIN_LIMITS,
    /** The chain writes the brand itself (step 9), so the frame's own brand step does not run after it. */
    writesBrand: true,

    async prepare(ctx) {
      const t0 = now()
      /** @type {Array<{step: string, startMs: number, endMs: number, usd: number, outcome: string, error?: string}>} */
      const record = []
      const stop = new AbortController()
      const signal = AbortSignal.any([ctx.signal, stop.signal])
      let failed = null
      /** Run one step, timed and costed; a failure is kept, never thrown. */
      const run = async (step, inputs) => {
        if (failed && NEEDED.has(failed)) return null
        const start = now()
        try {
          const answer = await steps[step](ctx, inputs, { signal })
          record.push({
            step,
            startMs: start - t0,
            endMs: now() - t0,
            usd: Number(answer?.usd ?? 0),
            outcome: 'done'
          })
          return { value: answer?.value ?? null }
        } catch (error) {
          const stopped = signal.aborted && failed !== null
          record.push({
            step,
            startMs: start - t0,
            endMs: now() - t0,
            usd: Number(error?.usd ?? 0),
            outcome: stopped ? 'stopped' : 'failed',
            error: messageOf(error)
          })
          if (!stopped) {
            failed ??= step
            if (NEEDED.has(step)) stop.abort(new Error(`the ${step} step failed`))
          }
          return null
        }
      }
      const kit = await run('kit', {})
      if (!kit) return { runId: ctx.runId, t0, record, failed, inputs: null }
      const [brand, planned] = await Promise.all([
        run('brand', { kit: kit.value }),
        run('plan', { kit: kit.value }).then(async (plan) => {
          if (!plan) return { plan: null, copy: null, pictures: null }
          const [copy, pictures] = await Promise.all([
            run('copy', { kit: kit.value, plan: plan.value }),
            run('pictures', { kit: kit.value, plan: plan.value })
          ])
          return { plan, copy, pictures }
        })
      ])
      const writable = Boolean(planned.plan && planned.copy)
      return {
        runId: ctx.runId,
        t0,
        record,
        failed,
        inputs: writable
          ? {
              kit: kit.value,
              plan: planned.plan.value,
              copy: planned.copy.value,
              brand: brand?.value ?? null,
              pictures: planned.pictures?.value ?? null
            }
          : null
      }
    },

    async apply(ctx, prepared) {
      const { t0, record } = prepared
      let { failed } = prepared
      let wrote = 0
      let kept = 0
      if (prepared.inputs) {
        const start = now()
        try {
          const door = { apply: applyFor(ctx.email, ctx.runId) }
          const answer = await steps.write(ctx, prepared.inputs, { signal: ctx.signal, door })
          const report = answer?.value?.report ?? null
          const ok = report?.status === 'done'
          record.push({
            step: 'write',
            startMs: start - t0,
            endMs: now() - t0,
            usd: Number(answer?.usd ?? 0),
            outcome: ok ? 'done' : 'failed',
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
            usd: 0,
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
 * @param {Array<{step: string, startMs: number, endMs: number, usd: number, outcome: string, error?: string}>} record
 * @param {string | null} failed
 * @param {number} totalMs
 */
export function chainSummary(record, failed, totalMs) {
  return {
    ending: failed ? 'soft-failure' : 'complete',
    ...(failed ? { failedStep: failed } : {}),
    totalMinutes: round(totalMs / 60_000, 2),
    totalUsd: round(
      record.reduce((sum, s) => sum + (Number.isFinite(s.usd) ? s.usd : 0), 0),
      4
    ),
    steps: record.map((s) => ({
      ...s,
      minutes: round((s.endMs - s.startMs) / 60_000, 2),
      usd: round(Number.isFinite(s.usd) ? s.usd : 0, 4)
    }))
  }
}
