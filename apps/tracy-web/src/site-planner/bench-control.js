// Starting and cancelling a site planner bench run (ADR 0041, #301). A start checks everything a run needs before
// it is queued (the brief's shape, the kit, the door, the kit's images) and stores what the run will use, so a refused start leaves
// nothing behind and an accepted one says exactly what it ran: brief as used, kit, prompt hash, checker version, door
// snapshot (never the key) and harness settings. The worker (bench-worker.js) does the rest.
import { benchHarnessFor, capsOf, sendsImages } from '../lib/bench-harness.js'
import { briefOfRevision, UUID } from '../lib/bench-sql.js'
import { activeRun, createRun, readRun, requestCancel, SITE_PLANNER_RUN_ACTIVE } from './bench-store.js'
import { briefShapeProblems } from './brief-shape.js'
import { sitePlannerDoor } from './door.js'
import { openKit, readableKits } from './kit-source.js'
import { CHECKER_VERSION } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'

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
 *   startedBy: string, kitImages: { ensure: Function }, index?: Map<string, object> }} input `kitImages`: the kit
 *   images of this server (kit-images.js kitImagesFor); `index`: the contracts to find kits in (tests); `noCaps`: the
 *   run is a step of a chain build, so it carries no USD budget (#478).
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
  noCaps = false
}) {
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
  const active = await activeRun(pool)
  if (active) return activeRefusal(active)
  // Last, since the first use of a kit version downloads its image zip: a kit whose images are unusable never queues.
  // A model given no images plans from the looks alone, so its run needs no image zip.
  if (door.snapshot.images) {
    const images = await kitImages.ensure(opened)
    if (!images.ok) return refuse(images.code, images.reason)
  }
  const created = await createRun(pool, {
    startedBy,
    brief,
    briefSource,
    kit,
    promptSha256: plannerPrompt().sha256,
    checkerVersion: CHECKER_VERSION,
    door: door.snapshot,
    harness: capsOf(benchHarnessFor(door.snapshot.model, door.snapshot.providerId), noCaps)
  })
  if (created.error === SITE_PLANNER_RUN_ACTIVE) return activeRefusal(created.active)
  return { ok: true, run: created.run }
}

function activeRefusal(active) {
  const who = active
    ? `run ${active.id} (started by ${active.startedBy}, step ${active.step})`
    : 'another run'
  return refuse(SITE_PLANNER_RUN_ACTIVE, `Only one run at a time: ${who} is still active.`, { active })
}

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
