/**
 * The build chat's engine runner (#609): starts research or compose in the background, keeps the state of the step in
 * the draft (`engine-store.js`) and writes what the step produced when it ends. The doors (`engine-route.js`) answer
 * `running` at once and the tool reads `GET /engine` again.
 *
 * 🔒 A STEP SURVIVES ITS REQUEST, NOT ITS PROCESS. Each runner has an id of its own (one per process). A step left
 * `running` by another runner is a step whose process ended: the next read stops it with a fault (`stopOrphan`), so the
 * chat never waits on it forever. A step that fails twice, or once with `noRerun` (`engine-rerun.js`), is recorded as
 * the draft's fault (`recordFault`) and the owner reads one sentence (`SAY`). A compose that needs the owner's answer
 * (a site name question, `engine-asking.js`) ends `asking` instead: no fault, the question goes on the card.
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
import {
  adoptStep,
  continueStep,
  endStep,
  putEndedStep,
  readEngineRow,
  startStep,
  stopOrphan
} from './engine-store.js'
import { faultOf, runWithRerun } from './engine-rerun.js'
import { SAY, engineStateOf, unchangedOf } from './engine-state.js'
import { askingOf } from './engine-asking.js'
import { placeAnswerOf } from './gather-place.js'
import {
  EngineStepError,
  brandRunOf,
  composeStep,
  planProfileOf,
  researchRecordOf,
  researchStep,
  withheldOfResearch
} from './engine-steps.js'
import { answersStillAsked } from './answers-kept.js'
import { finishPlaceResearch, startPlaceResearch } from './place-research.js'
import { nextDayAt, nextWindowAt, tryLaterSay } from './spend-limits.js'
import { answerReadingsOf, placeReadingOf, placeStatementOf } from './answer-readings.js'
import { spendGate, spendLeft } from './engine-spend.js'
import { usageCollector } from './model-usage.js'
import { discardPlan, putComposed, putRevised, recordFault } from './store.js'
import { planRequestOf, reviseStep, revisionOf } from './engine-revise.js'

/** The failures that mean the business's own look could not be shown (#616): the owner reads the brand sentence. */
const BRAND_CODES = new Set([
  'brand_missing',
  'brand_logo_colours_unmeasured',
  'brand_step_failed',
  'brand_file_unreadable',
  'brand_input_missing',
  'brand_input_ambiguous',
  'brand_logo_path_relative',
  'brand_brief_changed',
  // A brand step that ended without a brand file (`step-chain.js` `STEP_CHAIN_NO_OUTPUT`, after its one rerun).
  'STEP_CHAIN_NO_OUTPUT'
])
/** The rules gate's look problems (D40, D42): a plan that failed the gate on them stops like a missing brand. */
const LOOK_PROBLEMS = new Set(['template_accent', 'neutral_accent', 'template_logo', 'template_look_said'])
const RESEARCH_CODES = new Set(['research_unusable', 'research_empty', 'research_unavailable'])
/** The step chain's research refused for one of its daily limits (`place-research.js`): try again later. */
const LIMIT_CODES = new Set(['research_limit'])
/**
 * The stops only the owner could lift, when the failure carries no question to ask (#609, #593 G4):
 * `site_name_missing` without `details.question`. With its question the step ends `asking` instead
 * (`engine-asking.js`); this sentence is the fallback, recorded as a fault since no card can ask for the input.
 */
const OWNER_INPUT_CODES = Object.freeze({
  site_name_missing: { say: 'siteName', reason: 'site-name-missing' }
})

/** The brand step ended because the OWNER cancelled it: nothing broke, so it is neither a brand nor a team fault. */
const BRAND_CANCEL_CODE = 'brand_step_stopped'
export const SAY_CANCELLED =
  'I stopped as you asked. Your answers are kept, and you can continue when you are ready.'

/**
 * The stopped state of a fault: one sentence for the owner, and why, by its code.
 * @param {object} fault
 * @param {number} [now] when it stopped: a daily limit says when the owner can try again from it
 */
export function stoppedOf(fault, now = Date.now()) {
  if (fault.code === BRAND_CANCEL_CODE) return { state: 'stopped', say: SAY_CANCELLED, reason: 'cancelled' }
  // A change request that could not be applied leaves the living plan as it was: the owner reads that, not a stop.
  if (fault.step === 'revise') return { state: 'stopped', say: SAY.revise, reason: 'revise-failed' }
  const look =
    BRAND_CODES.has(fault.code) ||
    (fault.code === 'plan_gate_failed' && (fault.problems ?? []).some((p) => LOOK_PROBLEMS.has(p?.code)))
  if (look) return { state: 'stopped', say: SAY.brand, reason: 'brand-unavailable' }
  const owner = Object.hasOwn(OWNER_INPUT_CODES, fault.code) ? OWNER_INPUT_CODES[fault.code] : null
  if (owner) return { state: 'stopped', say: SAY[owner.say], reason: owner.reason }
  // Nothing to read at all (no link and no words), or no link and no name: the owner is asked for them.
  if (fault.code === 'research_empty' && fault.reason === 'no_links')
    return { state: 'stopped', say: SAY.links }
  if (fault.code === 'research_empty' && fault.reason === 'no_name')
    return { state: 'stopped', say: SAY.name }
  if (LIMIT_CODES.has(fault.code)) {
    // The step chain's daily limits open again with the next UTC day (`place-requests.js`): the owner reads when.
    const at = nextDayAt(now)
    return { state: 'stopped', say: tryLaterSay(at, now), reason: 'try-later', retryAt: at.toISOString() }
  }
  const stopped = { state: 'stopped', say: RESEARCH_CODES.has(fault.code) ? SAY.research : SAY.fault }
  return mayRerun(fault) ? { ...stopped, rerun: true } : stopped
}

/**
 * Faults the OWNER may have run again although the engine never reruns them on its own: the same inputs would fail
 * the same way for a deterministic step, but the plan composer is a model, and its next plan may pass the rules gate.
 */
const OWNER_RERUN_CODES = new Set(['plan_gate_failed'])

/**
 * Whether a stop that is neither a cancel, a look, a missing answer nor a change request may be run again when the
 * owner asks: its fault does not say a rerun cannot help (`noRerun`), or is one the model may do differently.
 */
const mayRerun = (fault) =>
  fault.code !== 'research_empty' && (fault.noRerun !== true || OWNER_RERUN_CODES.has(fault.code))

const listOf = (value) => (Array.isArray(value) ? value : [])
const textOf = (value) => (typeof value === 'string' ? value.trim() : '')
/** Whether two calls name the same links, in the same order. */
const sameLinks = (a, b) => JSON.stringify(listOf(a)) === JSON.stringify(listOf(b))
/** Whether a research call names exactly what the draft's research was made from: its links, words and name. */
const sameResearch = (inputs, call) =>
  sameLinks(inputs?.links, call.links) &&
  textOf(inputs?.description) === textOf(call.description) &&
  textOf(inputs?.name) === textOf(call.name)

/** Whether a running step is a research waiting on the step chain's place run (`place-research.js`). */
const waiting = (engine) => engine?.step === 'research' && Boolean(engine.place)

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
 *   Promise<{brief: object, manifest: object[], setAside?: object[]}>} deps.gather the research of the owner's words
 *   alone (`gather.js`); with no `placeResearch` it reads whatever it is given (tests)
 * @param {() => object | null} [deps.placeResearch] the step chain's research of one business for its owner
 *   (`opportunities-build/business-research.js`), read at call time: a research of links runs it
 *   (`place-research.js`), over several polls of the engine
 * @param {(input: {research: object, template: object, kit: object}) => Promise<object | null>} deps.brandStep the
 *   pre site brand step (#616): answers the look record (`tracy-brand-look/v1`)
 * @param {(accountId: string, run: string) => Promise<unknown>} [deps.prunePictures] deletes the pictures an older
 *   research stored (`pictures.js` `prune`), called once a research step's record is in the draft
 * @param {(spec: object, fn: Function) => Promise<any>} [deps.charge] the research cost ledger's seam
 *   (`createChargeable`): each step is reserved there at its ceiling (`spend-limits.js`); without it nothing is counted
 *   in the ledger, the hourly limits still hold
 * @param {() => number} [deps.now]
 */
export function createEngine({
  pool,
  kits,
  buildModel,
  gather,
  placeResearch = () => null,
  brandStep,
  prunePictures,
  charge,
  now = Date.now
}) {
  const runner = randomUUID()
  const admit = spendGate({ pool, charge, now })
  /** @type {Map<string, Promise<void>>} the steps this process runs, by account */
  const jobs = new Map()

  /** A research run whose success prunes the pictures of the research it replaced. */
  const withPrune = (accountId, run) => async () => {
    const ran = await run()
    const pictureRun = ran?.ok ? ran.value?.pictureRun : null
    return pictureRun && prunePictures ? { ...ran, after: () => prunePictures(accountId, pictureRun) } : ran
  }

  /** End a step with what its run answered; `draftId`: the draft it was started for, so a later draft is never written. */
  async function finish(accountId, step, run, draftId = null) {
    const ran = await run().catch((error) => ({ ok: false, error, attempts: 1 }))
    // Its work goes on outside this process (the step chain's place run): the step stays running, with what it names.
    if (ran.ok && ran.ended?.state === 'running') {
      const { state: _running, ...patch } = ran.ended
      return continueStep(pool, accountId, runner, patch, draftId)
    }
    if (ran.ok) {
      const ended = await endStep(
        pool,
        accountId,
        runner,
        ran.ended ?? { state: 'done' },
        ran.columns,
        now,
        draftId
      )
      // Once the draft names the new research, what it replaced goes (the pictures of older research runs). A step
      // whose end was refused (no longer this runner's, or a build holds the draft) wrote nothing: nothing goes.
      if (!ended.error) await ran.after?.().catch(() => null)
      return ended
    }
    const fault = faultOf(step, ran)
    // An owner cancel is not a fault the team needs to see; a draft a start over replaced is not this step's.
    const current = draftId ? (await readEngineRow(pool, accountId))?.id === draftId : true
    if (fault.code !== BRAND_CANCEL_CODE && current) await recordFault(pool, accountId, fault)
    return endStep(pool, accountId, runner, stoppedOf(fault, now()), {}, now, draftId)
  }

  /**
   * When a start refused by the spend gate may be tried again: the next hour window when the step's hourly limit is
   * spent, else the next day (the ledger's daily cap).
   */
  async function retryAtOf(accountId, limit) {
    return (await spendLeft(pool, accountId, limit, now)) ? nextDayAt(now()) : nextWindowAt(now())
  }

  /**
   * Mark the step running and run it in the background; answers the engine state at once. `limit`: the hourly limit
   * the start counts against, when not the step's own; `ceiling`: the ledger step its reservation is held at, when not
   * its limit's (`spend-limits.js`). A refused start answers `{error: 'TRY_LATER', retryAt}`.
   */
  async function start(accountId, step, inputs, run, { limit = step, ceiling = limit } = {}) {
    if (jobs.has(accountId))
      return {
        state: { step: (await readEngineRow(pool, accountId))?.engine?.step ?? step, state: 'running' }
      }
    // Held before the state is written, so a read in between never takes this step for an orphan.
    let release
    jobs.set(accountId, new Promise((resolve) => (release = resolve)))
    // The owner's hourly limit for this step, and its reservation in the research cost ledger (`engine-spend.js`).
    const spend = await admit(accountId, limit, ceiling).catch(() => null)
    if (!spend) {
      jobs.delete(accountId)
      release()
      return { error: 'TRY_LATER', retryAt: (await retryAtOf(accountId, limit)).toISOString() }
    }
    // A research waiting on its place run is worked on outside this process: it is live, never replaced.
    const started = await startStep(pool, accountId, { step, inputs, runner, now }, waiting).catch(
      (error) => ({ thrown: error })
    )
    if (started.running) {
      spend.cancel()
      jobs.delete(accountId)
      release()
      return { state: { step: started.running.step, state: 'running' } }
    }
    if (started.thrown || started.error) {
      spend.cancel()
      jobs.delete(accountId)
      release()
      if (started.thrown) throw started.thrown
      return started
    }
    const job = finish(accountId, step, () => spend.run(run), started.draftId)
      .catch((error) => console.error(`[build-draft] ${step} could not record its end:`, error))
      .finally(() => {
        // A start over may have let this account's draft go meanwhile (`detach`): only this job's own entry goes.
        if (jobs.get(accountId) === job) jobs.delete(accountId)
        release()
      })
    jobs.set(accountId, job)
    return { state: { step, state: 'running' } }
  }

  /** Run `work` as this process's step of the account, so a read in between never takes it for an orphan. */
  function background(accountId, work) {
    let release
    jobs.set(accountId, new Promise((resolve) => (release = resolve)))
    const job = Promise.resolve()
      .then(work)
      .catch((error) => console.error('[build-draft] research could not record its end:', error))
      .finally(() => {
        if (jobs.get(accountId) === job) jobs.delete(accountId)
        release()
      })
    jobs.set(accountId, job)
    return job
  }

  /** The columns a research writes when it ends: the record, a stale brand gone, the answers it still asks. */
  const researchColumns = (row, kit) => (record) => (current) => ({
    research: record,
    brand: null,
    // The needs profile of a living plan belongs to that plan (the edit gate reads it): kept while one exists.
    ...(row?.plan ? {} : { needs_profile: record.profile }),
    ...answersStillAsked(current, [
      ...(record.profile?.questions ?? []),
      ...(planProfileOf(record, kit)?.questions ?? [])
    ])
  })

  /**
   * End a research whose place run ended (#575), in this process: its content brief made and the needs profile read
   * (`place-research.js` `finishPlaceResearch`, then `researchRecordOf`), with the rerun rule, under the ledger step
   * `profile` (the place run's own spend is in the step chain's ledger already). A place run that failed stops with
   * its code. Pictures of older research runs of the draft go once the record is in.
   */
  async function endPlaceResearch(accountId, row, progress) {
    const engine = row.engine
    if (!(await adoptStep(pool, accountId, runner, engine.place.opportunityId))) return
    if (progress.state === 'failed') {
      const error = new EngineStepError(
        'research_unavailable',
        `the place research ended ${progress.code ?? 'failed'}`,
        { noRerun: true }
      )
      await finish(accountId, 'research', async () => ({ ok: false, error, attempts: 1 }), row.id)
      return
    }
    const spend = await admit(accountId, 'profile').catch(() => null)
    if (!spend) {
      const at = await retryAtOf(accountId, 'profile')
      await endStep(
        pool,
        accountId,
        runner,
        { state: 'stopped', say: tryLaterSay(at, now()), rerun: true, retryAt: at.toISOString() },
        {},
        now,
        row.id
      )
      return
    }
    const kit = row.template ? kits.loadKit(row.template.slug) : null
    const service = placeResearch()
    await finish(
      accountId,
      'research',
      () =>
        spend.run(async () => {
          const model = await buildModel()
          const ran = await runWithRerun(
            async (copy) =>
              researchRecordOf(
                await finishPlaceResearch(copy, {
                  service,
                  accountId,
                  place: engine.place,
                  // The owner's words read beside the place research, as before it (`gather.js` `readDescription`).
                  readDescription: gather?.readDescription ?? null,
                  withheld: withheldOfResearch(row.research)
                }),
                copy,
                { model, kit }
              ),
            {
              links: engine.inputs?.links ?? [],
              description: engine.inputs?.description ?? null,
              name: engine.inputs?.name ?? null
            }
          )
          if (!ran.ok) return ran
          return {
            ...ran,
            columns: researchColumns(row, kit)(ran.value),
            // The draft pictures of research made before (#609) are not this research's: they go.
            ...(prunePictures ? { after: () => prunePictures(accountId, randomUUID()) } : {})
          }
        }),
      row.id
    )
  }

  /**
   * A research waiting on its place run, read on a poll: the run's progress (a paused run resumed by the step chain's
   * own rule), and, once it ended, its end started in this process. Answers the engine state.
   */
  async function advanceResearch(accountId, row) {
    const service = placeResearch()
    const progress = service
      ? await service.progress({ accountId, opportunityId: row.engine.place.opportunityId }).catch(() => null)
      : { state: 'failed', code: 'RESEARCH_UNAVAILABLE', sources: [] }
    if (progress && progress.state !== 'running' && !jobs.has(accountId))
      background(accountId, () => endPlaceResearch(accountId, row, progress))
    return engineStateOf(row, { progress: progress ?? undefined })
  }

  /** The spend gate and model door of the answer reading (`answer-readings.js`): its own ledger step `answers`. */
  const readingTools = (accountId) => ({
    reserve: () => admit(accountId, 'answers'),
    modelOf: async () => {
      const reading = usageCollector()
      return { model: await buildModel({ onUsage: reading.onUsage }), cost: reading.cost }
    }
  })

  /** Run a step with the rerun rule; a model door that is not set stops it at once (`model_missing`). */
  const ranWith = (step, inputs, columnsOf) => async () => {
    const model = await buildModel()
    const ran = await runWithRerun((copy) => step(copy, model), inputs)
    return ran.ok ? { ...ran, columns: await columnsOf(ran.value) } : ran
  }

  /** A step whose failure only the owner can lift by answering ends `asking` with the question (`engine-asking.js`). */
  const askingOrRan = (run) => async () => {
    const ran = await run()
    const asking = ran.ok ? null : askingOf(ran.error)
    return asking ? { ok: true, attempts: ran.attempts, ended: asking, columns: {} } : ran
  }

  /** Run the brand step once (it keeps its own attempts) and keep its record for the template it ran on. */
  function brand(accountId, row, kit) {
    const { slug, version } = kit.template
    return start(accountId, 'brand', { template: { slug, version } }, async () => {
      const { record, costCents } = await brandRunOf(
        { research: row.research, template: kit.template, accountId },
        { brandStep, kit }
      )
      if (!record)
        throw Object.assign(new Error('the brand step answered no look record'), {
          code: 'brand_missing',
          noRerun: true
        })
      // What the brand step really cost, when it knew it: the ledger settles at that (`engine-spend.js`).
      return {
        ok: true,
        attempts: 1,
        columns: { brand: { record, template: { slug, version } } },
        ...(costCents !== undefined ? { costCents } : {})
      }
    })
  }

  /**
   * Without a look record for the kit's template, the brand step comes first (or its stopped state answers, when it
   * already stopped for that template); null when the record is there.
   */
  function lookFirst(accountId, row, kit) {
    if (brandFor(row, kit.template)) return null
    if (
      row.engine?.step === 'brand' &&
      row.engine.state === 'stopped' &&
      sameTemplate(row.engine, kit.template)
    )
      return Promise.resolve({ state: engineStateOf(row) })
    return brand(accountId, row, kit)
  }

  /**
   * Revise the living plan with the owner's written request (`engine-revise.js`), in the background. The plan and its
   * profile are written only while the plan is still the one the request was made for; otherwise the owner is told and
   * nothing changes. A failure stops with one sentence and the plan as it was; its fault keeps the request text.
   */
  function revise(accountId, row, kit, text) {
    const template = kit.template
    const request = planRequestOf(row.plan, text)
    const base = { id: row.plan.id, revision: row.plan.revision }
    const inputs = {
      plan: row.plan,
      profile: row.needs_profile,
      request,
      template,
      brand: brandFor(row, template)
    }
    return start(accountId, 'revise', { request: text, plan: base, template }, async () => {
      const usage = usageCollector()
      const model = await buildModel({ onUsage: usage.onUsage })
      const ran = await runWithRerun((copy) => reviseStep(copy, { model, kit }), inputs)
      if (!ran.ok) {
        if (ran.error && typeof ran.error === 'object') ran.error.requestText = text
        return ran
      }
      const ended = { unchanged: ran.value.unchanged === true, revision: revisionOf(ran.value) }
      const put = await putRevised(pool, accountId, ran.value, { runner, base, ended })
      if (put.error === 'STALE_PLAN')
        return {
          ok: true,
          attempts: ran.attempts,
          ended: { state: 'stopped', say: SAY.stale, reason: 'stale' },
          columns: {}
        }
      if (put.error) throw Object.assign(new Error(`putRevised: ${put.error}`), { code: put.error })
      // What the step's calls really cost, when every one reported it: the ledger settles at that.
      return { ...ran, columns: {}, ...usage.cost() }
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
      const started = kit ? await brand(accountId, row, kit) : null
      // Past its limit the brand step does not start: compose starts it again later, and says so.
      return started?.error ? null : started
    },
    /**
     * Research the business; the research and its needs profile go into the draft. Links (with the step chain's research
     * wired) run the step chain's own place research over several polls (`place-research.js`): the step starts, keeps
     * running while the place run reads each source, and ends once its content brief is made. The owner's words alone
     * are read by `gather` in one step.
     */
    async research(accountId, { links, description, name }, row) {
      const kit = row?.template ? kits.loadKit(row.template.slug) : null
      // 🔒 A call that starts nothing is answered with the step as it is, and counted nowhere (#575): research that
      // still runs, or that already ended for the same words (`sameResearch`).
      const engine = row?.engine
      if (engine?.step === 'research' && engine.state === 'running')
        return { state: await this.read(accountId) }
      if (
        engine?.step === 'research' &&
        engine.state === 'done' &&
        sameResearch(engine.inputs, { links, description, name })
      )
        return { state: engineStateOf(row, { kit }) }
      // A typed answer to which place the Google link means is read by the model first, as the `answers` step; the
      // place it names, else None of these with the owner's text kept in the description (`answer-readings.js`).
      const readChoice = await placeReadingOf(row, links, readingTools(accountId))
      const said = placeStatementOf(row, links, readChoice, description)
      const inputs = { links, ...(said ? { description: said } : {}), ...(name ? { name } : {}) }
      // The owner's answer to which place the Google link means, when this research asked it (`gather-place.js`).
      const place = placeAnswerOf(row, links, readChoice)
      // The place question still waits on the owner for these links: asked again, never researched again.
      if (
        engine?.step === 'research' &&
        engine.state === 'asking' &&
        place === undefined &&
        sameLinks(engine.inputs?.links, links)
      )
        return { state: engineStateOf(row, { kit }) }
      const started = await this.startResearch(accountId, { inputs, place, kit }, row)
      // A start refused while the place question was open never leaves the draft asking with no card (#575): it stops
      // with when to try again, and the owner may run it again then.
      if (started.error === 'TRY_LATER' && engine?.state === 'asking') {
        const at = new Date(started.retryAt)
        await putEndedStep(
          pool,
          accountId,
          {
            step: 'research',
            state: 'stopped',
            inputs: engine.inputs,
            say: tryLaterSay(at, now()),
            reason: 'try-later',
            rerun: true,
            retryAt: started.retryAt
          },
          now
        )
        return { state: engineStateOf(await readEngineRow(pool, accountId)) }
      }
      return started
    },
    /** Start the research with its inputs read (`research`): the step chain's place research of links, or `gather`. */
    startResearch(accountId, { inputs, place, kit }, row) {
      const { links } = inputs
      const service = links?.length ? placeResearch() : null
      if (service)
        return start(
          accountId,
          'research',
          inputs,
          askingOrRan(async () => {
            try {
              const started = await startPlaceResearch(inputs, {
                service,
                accountId,
                draftId: row?.id ?? null,
                research: row?.research ?? null,
                now,
                ...(place ? { place } : {})
              })
              return { ok: true, attempts: 1, ended: { state: 'running', place: started }, columns: {} }
            } catch (error) {
              // The place question, a refused start: one attempt, ended as the rerun rule ends a step.
              return { ok: false, error, attempts: 1 }
            }
          }),
          // Counted as its link judging only: the place research is held by the step chain's own limits.
          { limit: 'researchLinks' }
        )
      return start(
        accountId,
        'research',
        inputs,
        withPrune(
          accountId,
          askingOrRan(
            ranWith(
              (copy, model) =>
                researchStep(copy, {
                  gather,
                  model,
                  kit,
                  accountId,
                  withheld: withheldOfResearch(row?.research),
                  ...(place ? { place } : {})
                }),
              inputs,
              (record) => researchColumns(row, kit)(record)
            )
          )
        )
      )
    },
    /**
     * Compose the plan for the chosen template from the stored brand record; it reaches the draft only through
     * `putComposed`. Without a record for the template, the brand step starts instead (or its stopped state answers).
     *
     * 🔒 A LIVING PLAN IS NEVER REPLACED SILENTLY (#609). On a draft that holds a plan, compose never composes: with a
     * written request it runs the revise step (Part 3's `revisePlan`, #617), which changes only what the request names
     * and keeps the owner's edits; with no request it answers the plan as it is, marked `unchanged` (`unchangedOf`).
     * Only `restart` (the owner asked to start the plan over) discards the plan and its edits, then composes as for a
     * first plan.
     */
    async compose(accountId, { request, restart }, inputRow, kit) {
      let row = inputRow
      if (row.plan && !restart && !request) return { state: unchangedOf(row) }
      if (row.plan && !restart) return lookFirst(accountId, row, kit) ?? revise(accountId, row, kit, request)
      if (row.plan) {
        // Never under a step this process still runs: that step answers.
        if (jobs.has(accountId)) return { state: { step: row.engine?.step ?? 'compose', state: 'running' } }
        // Past the compose limit the plan is kept: discarding it is only for a compose that starts.
        if (!(await spendLeft(pool, accountId, 'compose', now))) return { error: 'TRY_LATER' }
        await discardPlan(pool, accountId)
        row = await readEngineRow(pool, accountId)
      }
      const template = kit.template
      const first = lookFirst(accountId, row, kit)
      if (first) return first
      const inputs = {
        research: row.research,
        answers: row.answers,
        template,
        brand: brandFor(row, template)
      }
      return start(accountId, 'compose', { ...(request ? { request } : {}), template }, async () => {
        // The owner's typed answers are read first, once, as their own ledger step (`answer-readings.js`).
        const answerReadings = await answerReadingsOf(inputs, { kit, ...readingTools(accountId) })
        const usage = usageCollector()
        const model = await buildModel({ onUsage: usage.onUsage })
        const ran = await runWithRerun(
          (copy) => composeStep(copy, { model, kit }),
          answerReadings ? { ...inputs, answerReadings } : inputs
        )
        if (!ran.ok) {
          // The owner has one more thing to answer (the site name): a question on the card, not a fault.
          const asking = askingOf(ran.error)
          return asking ? { ok: true, attempts: ran.attempts, ended: asking, columns: {} } : ran
        }
        const { lookSources } = ran.value
        const put = await putComposed(pool, accountId, ran.value, {
          runner,
          draftId: row.id,
          ...(lookSources ? { lookSources } : {})
        })
        if (put.error) throw Object.assign(new Error(`putComposed: ${put.error}`), { code: put.error })
        return { ...ran, columns: {}, ...usage.cost() }
      })
    },
    /**
     * The engine state of the account's draft; a step whose process ended is stopped first. The chosen template's kit,
     * when there is one, holds the site name question to its limit.
     */
    async read(accountId) {
      const row = await readEngineRow(pool, accountId)
      // A research waiting on the step chain's place run lives outside this process: it is read, never orphaned.
      if (waiting(row?.engine) && row.engine.state === 'running') return advanceResearch(accountId, row)
      if (row?.engine?.state === 'running' && !(row.engine.runner === runner && jobs.has(accountId))) {
        await stopOrphan(
          pool,
          accountId,
          () => false,
          { state: 'stopped', say: SAY.interrupted, rerun: true },
          now
        )
        return engineStateOf(await readEngineRow(pool, accountId))
      }
      const chosen = row?.plan?.look?.template ?? row?.template
      const kit = chosen?.slug ? kits.loadKit(chosen.slug) : null
      return engineStateOf(row, { kit })
    },
    /** Resolves when the account's step of this process has ended (tests, and a clean shutdown). */
    settled: (accountId) => jobs.get(accountId) ?? Promise.resolve(),
    /**
     * Let go of the account's step in this process (#575): a start over removed the draft it worked for. The step
     * runs on and its end writes nothing (no draft names its runner); a new step of the new draft starts at once.
     */
    detach(accountId) {
      jobs.delete(accountId)
    }
  }
}
