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
 *
 * 🔒 THE BRAND STEP RUNS EARLY, AS ITS OWN STEP (#616). It needs the research and the chosen template's kit, never a
 * site, so it starts as soon as both are in the draft (`brandIfDue`: the template door calls it) and keeps its look
 * record in the draft (`brand`). Compose only reads that record: a draft without a record for its template starts the
 * brand step instead of composing (the tool waits on it, then asks for the plan again). The step keeps its own attempts
 * (`brand-before-site.js`) and is never wrapped in a second rerun.
 */
import { randomUUID } from 'node:crypto'
import { endStep, readEngineRow, startStep, stopOrphan } from './engine-store.js'
import { faultOf, runWithRerun } from './engine-rerun.js'
import { SAY, engineStateOf } from './engine-state.js'
import { brandOf, composeStep, researchStep } from './engine-steps.js'
import { putComposed, recordFault } from './store.js'

/** The failures that mean the business's own look could not be shown (#616): the owner reads the brand sentence. */
const BRAND_CODES = new Set([
  'brand_missing',
  'brand_logo_colours_unmeasured',
  'brand_step_failed',
  'brand_file_unreadable',
  'brand_input_missing',
  'brand_input_ambiguous'
])
/** The rules gate's look problems (D40, D42): a plan that failed the gate on them stops like a missing brand. */
const LOOK_PROBLEMS = new Set(['template_accent', 'neutral_accent', 'template_logo', 'template_look_said'])
const RESEARCH_CODES = new Set(['research_unusable', 'research_empty', 'research_unavailable'])

/** The stopped state of a fault: one sentence for the owner, and why, by its code. */
export function stoppedOf(fault) {
  const look =
    BRAND_CODES.has(fault.code) ||
    (fault.code === 'plan_gate_failed' && (fault.problems ?? []).some((p) => LOOK_PROBLEMS.has(p?.code)))
  if (look) return { state: 'stopped', say: SAY.brand, reason: 'brand-unavailable' }
  // Nothing to read at all (a description alone): the owner is asked for a link.
  if (fault.code === 'research_empty' && fault.reason === 'no_links')
    return { state: 'stopped', say: SAY.links }
  return { state: 'stopped', say: RESEARCH_CODES.has(fault.code) ? SAY.research : SAY.fault }
}

/** Whether the step's inputs name this template. */
const sameTemplate = (engine, template) =>
  engine.inputs?.template?.slug === template?.slug && engine.inputs?.template?.version === template?.version

/** Whether the draft holds the brand step's record for this template. */
export const brandFor = (row, template) =>
  row?.brand?.record &&
  row.brand.template?.slug === template?.slug &&
  row.brand.template?.version === template?.version
    ? row.brand.record
    : null

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {{loadKit: (slug: string) => object | null}} deps.kits the AI quickstart catalogue
 * @param {() => Promise<Function>} deps.buildModel the build model door (`build-model.js`); throws `model_missing`
 * @param {(input: {links: string[], description: string | null}, context: {accountId?: string}) =>
 *   Promise<{brief: object, manifest: object[], setAside?: object[]}>} deps.gather
 * @param {(input: {research: object, template: object, kit: object}) => Promise<object | null>} deps.brandStep the
 *   pre site brand step (#616): answers the look record (`tracy-brand-look/v1`)
 * @param {(accountId: string, run: string) => Promise<unknown>} [deps.prunePictures] deletes the pictures an older
 *   research stored (`pictures.js` `prune`), called once a research step's record is in the draft
 * @param {() => number} [deps.now]
 */
export function createEngine({ pool, kits, buildModel, gather, brandStep, prunePictures, now = Date.now }) {
  const runner = randomUUID()
  /** @type {Map<string, Promise<void>>} the steps this process runs, by account */
  const jobs = new Map()

  /** A research run whose success prunes the pictures of the research it replaced. */
  const withPrune = (accountId, run) => async () => {
    const ran = await run()
    const pictureRun = ran?.ok ? ran.columns?.research?.pictureRun : null
    return pictureRun && prunePictures ? { ...ran, after: () => prunePictures(accountId, pictureRun) } : ran
  }

  async function finish(accountId, step, run) {
    const ran = await run().catch((error) => ({ ok: false, error, attempts: 1 }))
    if (ran.ok) {
      const ended = await endStep(pool, accountId, runner, { state: 'done' }, ran.columns, now)
      // Once the draft names the new research, what it replaced goes (the pictures of older research runs).
      await ran.after?.().catch(() => null)
      return ended
    }
    const fault = faultOf(step, ran)
    await recordFault(pool, accountId, fault)
    return endStep(pool, accountId, runner, stoppedOf(fault), {}, now)
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

  /** Run the brand step once (it keeps its own attempts) and keep its record for the template it ran on. */
  function brand(accountId, row, kit) {
    const { slug, version } = kit.template
    return start(accountId, 'brand', { template: { slug, version } }, async () => {
      const record = await brandOf({ research: row.research, template: kit.template }, { brandStep, kit })
      if (!record)
        throw Object.assign(new Error('the brand step answered no look record'), {
          code: 'brand_missing',
          noRerun: true
        })
      return { ok: true, attempts: 1, columns: { brand: { record, template: { slug, version } } } }
    })
  }

  return {
    runner,
    /**
     * Start the brand step when the draft has research and a template but no look record for that template, and no
     * step of this process runs. Answers the engine state it started, or null when nothing was due.
     */
    async brandIfDue(accountId) {
      if (jobs.has(accountId)) return null
      const row = await readEngineRow(pool, accountId)
      const chosen = row?.plan?.look?.template ?? row?.template
      if (!row?.research?.profile || !chosen || brandFor(row, chosen)) return null
      const kit = kits.loadKit(chosen.slug)
      return kit ? brand(accountId, row, kit) : null
    },
    /** Research from the owner's links; the research and its needs profile go into the draft. */
    async research(accountId, { links, description }, row) {
      const kit = row?.template ? kits.loadKit(row.template.slug) : null
      const inputs = { links, ...(description ? { description } : {}) }
      return start(
        accountId,
        'research',
        inputs,
        withPrune(
          accountId,
          ranWith(
            (copy, model) => researchStep(copy, { gather, model, kit, accountId }),
            inputs,
            // The needs profile of a living plan belongs to that plan (the edit gate reads it): kept while one exists.
            // New research makes the brand record stale: the brand step reads the research.
            (record) => ({
              research: record,
              brand: null,
              ...(row?.plan ? {} : { needs_profile: record.profile })
            })
          )
        )
      )
    },
    /**
     * Compose the plan for the chosen template from the stored brand record; it reaches the draft only through
     * `putComposed`. Without a record for the template, the brand step starts instead (or its stopped state answers).
     */
    async compose(accountId, { request }, row, kit) {
      const template = kit.template
      const record = brandFor(row, template)
      if (!record) {
        // The brand step of this template already stopped: its sentence answers, it is not run again here.
        if (
          row.engine?.step === 'brand' &&
          row.engine.state === 'stopped' &&
          sameTemplate(row.engine, template)
        )
          return { state: engineStateOf(row) }
        return brand(accountId, row, kit)
      }
      const inputs = { research: row.research, answers: row.answers, template, brand: record }
      return start(accountId, 'compose', { ...(request ? { request } : {}), template }, async () => {
        const model = await buildModel()
        const ran = await runWithRerun((copy) => composeStep(copy, { model, kit }), inputs)
        if (!ran.ok) return ran
        const { lookSources } = ran.value
        const put = await putComposed(pool, accountId, ran.value, {
          runner,
          ...(lookSources ? { lookSources } : {})
        })
        if (put.error) throw Object.assign(new Error(`putComposed: ${put.error}`), { code: put.error })
        return { ...ran, columns: {} }
      })
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
