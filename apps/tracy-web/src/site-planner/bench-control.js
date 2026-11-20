// Starting and cancelling a site planner bench run (ADR 0041, #301). A start checks everything a run needs before
// it is queued (the brief's shape, the kit, the door, the kit's images) and stores what the run will use, so a refused start leaves
// nothing behind and an accepted one says exactly what it ran: brief as used, kit, prompt hash, checker version, door
// snapshot (never the key) and harness settings. The worker (bench-worker.js) does the rest.
import { benchHarnessFor, capsOf, sendsImages } from '../lib/bench-harness.js'
import { framedPartsProblem } from './plan-frame.js'
import { parallelPagesProblem } from './plan-parts.js'
import { BENCH_RUNS_AT_ONCE, benchFullRefusal, briefOfRevision, UUID } from '../lib/bench-sql.js'
import { activeRuns, createRun, readRun, requestCancel, SITE_PLANNER_RUN_ACTIVE } from './bench-store.js'
import { briefShapeProblems } from './brief-shape.js'
import { PLANNER_BRIEF_VIEW } from './brief-view.js'
import { sitePlannerDoor } from './door.js'
import { openKit, readableKits } from './kit-source.js'
import { CHECKER_VERSION } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'
import { VISUAL_REVIEW_POLICY } from './visual-review.js'

export {
  BENCH_HARNESS,
  benchHarnessFor,
  DEEPSEEK_FLASH_PRICE,
  DEEPSEEK_PEAK_UTC,
  DEEPSEEK_V4_PRO_PRICE,
  MODEL_HARNESS,
  sendsImages
} from '../lib/bench-harness.js'
export { briefOfRevision }

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra })

/**
 * Queue one run, or refuse it with a reason and nothing written.
 * @param {{ pool: import('pg').Pool, secret: string, brief: unknown, briefSource: object, kitRef: string,
 *   startedBy: string, kitImages: { ensure: Function }, index?: Map<string, object>, noCaps?: boolean, requireVisualReview?: boolean,
 *   kitInFirstMessage?: boolean, kitIndexInFirstMessage?: boolean, firstDraftEffort?: 'low' | 'high' | 'max',
 *   parallelPages?: number, planTurns?: boolean, framedParts?: number }} input `framedParts`: round 0 as a frame, then
 *   its kept pages in that many parts at the same time (plan-frame.js; frozen as harness.framedParts, never with
 *   parallelPages above 1, planTurns or the whole kit in the first message); `kitIndexInFirstMessage`: the first message carries the kit's
 *   site, page groups and pages beside its contents (template-kit-source.js kitIndexFirstMessage), blocks read by tool;
 *   `firstDraftEffort`: the reasoning effort of round 0 (fix rounds keep the run's); `parallelPages`: the number of
 *   parts round 0 is planned in at the same time (plan-parts.js; 1 or absent plans it as before and freezes nothing);
 *   `planTurns`: round 0 is planned in turns of one conversation, the whole site first, then one page group a turn
 *   (plan-turns.js; frozen as harness.planTurns, never with parallelPages above 1); `kitImages`: the kit images of this
 *   server (kit-images.js kitImagesFor); `index`: the contracts to find kits in (tests); `noCaps`: the run is a step of
 *   a chain build, so it carries no USD budget (#478).
 */
export async function startBenchRun({
  pool,
  secret,
  brief,
  briefSource,
  kitRef,
  startedBy,
  kitImages,
  index,
  noCaps = false,
  requireVisualReview = false,
  kitInFirstMessage = false,
  kitIndexInFirstMessage = false,
  firstDraftEffort,
  parallelPages,
  planTurns = false,
  framedParts
}) {
  if (framedParts !== undefined) {
    const problem = framedPartsProblem(framedParts)
    if (problem) return refuse('SITE_PLANNER_BAD_FRAMED_PARTS', `The run cannot start: ${problem}.`)
    if (parallelPages > 1 || planTurns || kitInFirstMessage)
      return refuse(
        'SITE_PLANNER_BAD_FRAMED_PARTS',
        'The run cannot start: a framed plan is its own way of planning round 0, not with parallel pages, plan turns or the whole kit in the first message.'
      )
  }
  if (kitInFirstMessage && kitIndexInFirstMessage)
    return refuse(
      'SITE_PLANNER_BAD_FIRST_MESSAGE',
      'The run cannot start: the whole kit and the kit index in the first message are two choices; ask for one.'
    )
  if (parallelPages !== undefined) {
    const partsProblem = parallelPagesProblem(parallelPages)
    if (partsProblem)
      return {
        ok: false,
        code: 'SITE_PLANNER_BAD_PARALLEL_PAGES',
        reason: `The run cannot start: ${partsProblem}.`
      }
  }
  if (planTurns && parallelPages > 1)
    return refuse(
      'SITE_PLANNER_BAD_PLAN_TURNS',
      'The run cannot start: plan turns writes round 0 as one conversation, so parallel pages must be 1 or absent.'
    )
  const problems = briefShapeProblems(brief)
  if (problems.length)
    return refuse('SITE_PLANNER_BRIEF_SHAPE', `The brief cannot run: ${problems.join('; ')}`, { problems })
  const kits = readableKits(index ? { index } : {})
  const kit = kits.find((k) => k.ref === kitRef)
  if (!kit)
    return refuse(
      'SITE_PLANNER_KIT_UNKNOWN',
      `No readable kit "${kitRef}". Readable kits: ${kits.map((k) => k.ref).join(', ') || 'none'}.`
    )
  const opened = openKit(kitRef, index ? { index } : {})
  const door = await sitePlannerDoor({ pool, secret, kit: opened, sendsImages })
  if (!door.ok) return refuse(door.code, door.reason, door.lacking ? { lacking: door.lacking } : {})
  if (requireVisualReview && !door.snapshot.images)
    return refuse(
      'SITE_PLANNER_VISUAL_REVIEW_UNAVAILABLE',
      'This WO run requires a model that receives kit images.'
    )
  const running = await activeRuns(pool)
  if (running.length >= BENCH_RUNS_AT_ONCE) return fullRefusal(running)
  // Last, since the first use of a kit version downloads its image zip: a kit whose images are unusable never queues.
  // A model given no images plans from the looks alone, so its run needs no image zip.
  if (door.snapshot.images) {
    const images = await kitImages.ensure(opened)
    if (!images.ok) return refuse(images.code, images.reason)
  }
  const base = capsOf(benchHarnessFor(door.snapshot.model, door.snapshot.providerId), noCaps)
  if (
    firstDraftEffort !== undefined &&
    (base.modelProfile !== 'deepseek-flash-native' || !['low', 'high', 'max'].includes(firstDraftEffort))
  )
    return refuse(
      'SITE_PLANNER_BAD_FIRST_DRAFT_EFFORT',
      'The run cannot start: a first draft effort must be low, high or max, on native DeepSeek Flash.'
    )
  const created = await createRun(pool, {
    startedBy,
    brief,
    briefSource,
    kit,
    promptSha256: plannerPrompt().sha256,
    checkerVersion: CHECKER_VERSION,
    door: door.snapshot,
    harness: {
      ...base,
      briefView: PLANNER_BRIEF_VIEW,
      // Asked for (a chain build's plan step): the kit's index in the first message, blocks read by tool, and the
      // first draft's own effort; frozen with the run.
      ...(kitIndexInFirstMessage ? { kitIndexInFirstMessage: true } : {}),
      ...(firstDraftEffort !== undefined ? { firstDraftEffort } : {}),
      // Asked for (a chain build's plan step): the whole kit goes in the first message (template-kit-source.js
      // wholeKitFirstMessage); frozen with the run, so a run saved before reads part by part as it did.
      ...(kitInFirstMessage ? { kitInFirstMessage: true } : {}),
      // Asked for: round 0 planned in parts at the same time (plan-parts.js), frozen with the run.
      ...(parallelPages > 1 ? { parallelPages } : {}),
      // Asked for: round 0 planned in turns of one conversation (plan-turns.js), frozen with the run.
      ...(planTurns ? { planTurns: true } : {}),
      // Asked for: round 0 as a frame, then its kept pages in parts at the same time (plan-frame.js), frozen.
      ...(framedParts !== undefined ? { framedParts } : {}),
      ...(requireVisualReview ? { visualReview: VISUAL_REVIEW_POLICY } : {})
    }
  })
  if (created.error === SITE_PLANNER_RUN_ACTIVE) return fullRefusal(created.activeRuns)
  return { ok: true, run: created.run }
}

const fullRefusal = (running) => benchFullRefusal(SITE_PLANNER_RUN_ACTIVE, 'planner runs', running)

/**
 * Cancel a run. One no worker holds ends at once; one a worker holds is asked to stop, which the worker does
 * between two model calls (a call in flight is never cut).
 */
export async function cancelBenchRun(pool, runId) {
  if (!UUID.test(String(runId))) return refuse('SITE_PLANNER_RUN_NOT_FOUND', `No run ${runId}.`)
  const { rows } = await pool.query(
    `update site_planner_run set status = 'cancelled', step = 'done', cancel_requested_at = coalesce(cancel_requested_at, now()),
       finished_at = now(), updated_at = now(), lease_token = lease_token + 1
     where id = $1 and status = 'queued' and (lease_until is null or lease_until < now())
     returning id`,
    [runId]
  )
  if (rows.length) {
    await pool.query(
      `update site_planner_round set state = 'cancelled', finished_at = now() where run_id = $1 and state = 'planning'`,
      [runId]
    )
    return { ok: true, run: await readRun(pool, runId) }
  }
  const asked = await requestCancel(pool, runId)
  if (asked) return { ok: true, run: asked }
  const run = await readRun(pool, runId)
  if (!run) return refuse('SITE_PLANNER_RUN_NOT_FOUND', `No run ${runId}.`)
  return refuse('SITE_PLANNER_RUN_NOT_ACTIVE', `Run ${runId} has already ended (${run.status}).`)
}
