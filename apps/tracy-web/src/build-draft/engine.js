/**
 * The build chat's engine runner (#609): starts research or compose in the background, keeps the state of the step in
 * the draft (`engine-store.js`) and writes what the step produced when it ends. The doors (`engine-route.js`) answer
 * `running` at once and the tool reads `GET /engine` again.
 *
 * 🔒 A STEP SURVIVES ITS REQUEST, NOT ITS PROCESS. Each runner has an id of its own (one per process). A step left
 * `running` by another runner is a step whose process ended: the next read stops it with a fault (`stopOrphan`), so the
 * chat never waits on it forever. A step that fails twice, or once with `noRerun` (`engine-rerun.js`), is recorded as
 * the draft's fault (`recordFault`) and the owner reads one sentence (`SAY`).
 *
 * The only plan writer used here is `putComposed`: the plan that comes out of the plan composer and its rules gate.
 */
import { randomUUID } from 'node:crypto'
import { endStep, readEngineRow, startStep, stopOrphan } from './engine-store.js'
import { faultOf, runWithRerun } from './engine-rerun.js'
import { SAY, engineStateOf } from './engine-state.js'
import { composeStep, researchStep } from './engine-steps.js'
import { putComposed, recordFault } from './store.js'

/** Which sentence a failure gets, by its code; every other failure is a fault of ours. */
const SAY_BY_CODE = {
  brand_unavailable: SAY.brand,
  research_unusable: SAY.research,
  research_empty: SAY.research,
  research_unavailable: SAY.research
}
const REASON_BY_CODE = { brand_unavailable: 'brand-unavailable' }

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {{loadKit: (slug: string) => object | null}} deps.kits the AI quickstart catalogue
 * @param {() => Promise<Function>} deps.buildModel the build model door (`build-model.js`); throws `model_missing`
 * @param {(input: {links: string[], description: string | null}) => Promise<{brief: object, manifest: object[]}>} deps.gather
 * @param {(input: {research: object}) => Promise<object | null>} deps.brandStep the pre site brand step (#616)
 * @param {() => number} [deps.now]
 */
export function createEngine({ pool, kits, buildModel, gather, brandStep, now = Date.now }) {
  const runner = randomUUID()
  /** @type {Map<string, Promise<void>>} the steps this process runs, by account */
  const jobs = new Map()

  async function finish(accountId, step, run) {
    const ran = await run().catch((error) => ({ ok: false, error, attempts: 1 }))
    if (ran.ok) return endStep(pool, accountId, runner, { state: 'done' }, ran.columns, now)
    const fault = faultOf(step, ran)
    await recordFault(pool, accountId, fault)
    return endStep(
      pool,
      accountId,
      runner,
      {
        state: 'stopped',
        say: SAY_BY_CODE[fault.code] ?? SAY.fault,
        ...(REASON_BY_CODE[fault.code] ? { reason: REASON_BY_CODE[fault.code] } : {})
      },
      {},
      now
    )
  }

  /** Mark the step running and run it in the background; answers the engine state at once. */
  async function start(accountId, step, inputs, run) {
    if (jobs.has(accountId))
      return {
        state: { step: (await readEngineRow(pool, accountId))?.engine?.step ?? step, state: 'running' }
      }
    // Held before the state is written, so a read in between never takes this step for an orphan.
    let release
    jobs.set(accountId, new Promise((resolve) => (release = resolve)))
    const started = await startStep(pool, accountId, { step, inputs, runner, now }, () => false).catch(
      (error) => ({ thrown: error })
    )
    if (started.thrown || started.error) {
      jobs.delete(accountId)
      release()
      if (started.thrown) throw started.thrown
      return started
    }
    const job = finish(accountId, step, run)
      .catch((error) => console.error(`[build-draft] ${step} could not record its end:`, error))
      .finally(() => {
        jobs.delete(accountId)
        release()
      })
    jobs.set(accountId, job)
    return { state: { step, state: 'running' } }
  }

  /** Run a step with the rerun rule; a model door that is not set stops it at once (`model_missing`). */
  const ranWith = (step, inputs, columnsOf) => async () => {
    const model = await buildModel()
    const ran = await runWithRerun((copy) => step(copy, model), inputs)
    return ran.ok ? { ...ran, columns: await columnsOf(ran.value) } : ran
  }

  return {
    runner,
    /** Research from the owner's links; the research and its needs profile go into the draft. */
    async research(accountId, { links, description }, row) {
      const kit = row?.template ? kits.loadKit(row.template.slug) : null
      const inputs = { links, ...(description ? { description } : {}) }
      return start(
        accountId,
        'research',
        inputs,
        ranWith(
          (copy, model) => researchStep(copy, { gather, model, kit }),
          inputs,
          // The needs profile of a living plan belongs to that plan (the edit gate reads it): kept while one exists.
          (record) => ({ research: record, ...(row?.plan ? {} : { needs_profile: record.profile }) })
        )
      )
    },
    /** Compose the plan for the chosen template; it reaches the draft only through `putComposed`. */
    async compose(accountId, { request }, row, kit) {
      const template = kit.template
      const inputs = {
        research: row.research,
        answers: row.answers,
        template,
        ...(request ? { request } : {})
      }
      return start(
        accountId,
        'compose',
        { ...(request ? { request } : {}), template },
        ranWith(
          (copy, model) => composeStep(copy, { model, kit, brandStep }),
          inputs,
          async (composed) => {
            const put = await putComposed(pool, accountId, composed)
            if (put.error) throw Object.assign(new Error(`putComposed: ${put.error}`), { code: put.error })
            return {}
          }
        )
      )
    },
    /** The engine state of the account's draft; a step whose process ended is stopped first. */
    async read(accountId) {
      const row = await readEngineRow(pool, accountId)
      if (row?.engine?.state === 'running' && !(row.engine.runner === runner && jobs.has(accountId))) {
        await stopOrphan(pool, accountId, () => false, { state: 'stopped', say: SAY.interrupted }, now)
        return engineStateOf(await readEngineRow(pool, accountId))
      }
      return engineStateOf(row)
    },
    /** Resolves when the account's step of this process has ended (tests, and a clean shutdown). */
    settled: (accountId) => jobs.get(accountId) ?? Promise.resolve()
  }
}
