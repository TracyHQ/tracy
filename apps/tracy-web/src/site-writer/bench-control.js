// Starting and cancelling a site writer bench run (#329). A start checks everything a run needs before it is queued
// (the plan's and the brief's shape, the kit, the door) and stores what the run will use, so a refused start leaves
// nothing behind and an accepted one says exactly what it ran: plan, brief as used, kit, prompt hash, checker version,
// door snapshot (never the key) and harness settings. The worker (bench-worker.js) does the rest.
import { briefShapeProblems } from '../lib/bench-brief-shape.js'
import { benchHarnessFor } from '../lib/bench-harness.js'
import { briefOfRevision, UUID } from '../lib/bench-sql.js'
import { openKit, readableKits } from '../lib/template-kit-source.js'
import { activeRun, createRun, readRun, requestCancel, SITE_WRITER_RUN_ACTIVE } from './bench-store.js'
import { CHECKER_VERSION } from './copy-check/check-copy.js'
import { siteWriterDoor } from './door.js'
import { writerPrompt } from './writer-prompt.js'

export { briefOfRevision }

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra })
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Every problem that keeps a plan off the writer bench; empty when it may run. The plan checker is not re-run. */
export function planShapeProblems(plan, kitRef) {
  if (!isObject(plan)) return ['the plan is not a JSON object']
  const problems = []
  if (!isObject(plan.site)) problems.push('site must be an object')
  if (!Array.isArray(plan.pages) || !plan.pages.length) problems.push('pages must be a non-empty list')
  if (plan.sharedBlocks !== undefined && !Array.isArray(plan.sharedBlocks))
    problems.push('sharedBlocks must be a list')
  if (typeof plan.kit === 'string' && kitRef && !plan.kit.split(/\s+/).includes(kitRef))
    problems.push(`the plan was made on the kit "${plan.kit}", not ${kitRef}`)
  return problems
}

/**
 * Queue one run, or refuse it with a reason and nothing written.
 * @param {{ pool: import('pg').Pool, secret: string, plan: unknown, planSource: object, brief: unknown,
 *   briefSource: object, kitRef: string, startedBy: string, index?: Map<string, object> }} input `index`: the
 *   contracts to find kits in (tests).
 */
export async function startWriterRun({
  pool,
  secret,
  plan,
  planSource,
  brief,
  briefSource,
  kitRef,
  startedBy,
  index
}) {
  const where = index ? { index } : {}
  const kits = readableKits(where)
  const kit = kits.find((k) => k.ref === kitRef)
  if (!kit)
    return refuse(
      'SITE_WRITER_KIT_UNKNOWN',
      `No readable kit "${kitRef}". Readable kits: ${kits.map((k) => k.ref).join(', ') || 'none'}.`
    )
  const planProblems = planShapeProblems(plan, kitRef)
  if (planProblems.length)
    return refuse('SITE_WRITER_PLAN_SHAPE', `The plan cannot run: ${planProblems.join('; ')}`, {
      problems: planProblems
    })
  const problems = briefShapeProblems(brief)
  if (problems.length)
    return refuse('SITE_WRITER_BRIEF_SHAPE', `The brief cannot run: ${problems.join('; ')}`, { problems })
  if (!openKit(kitRef, where)) return refuse('SITE_WRITER_KIT_UNKNOWN', `The kit ${kitRef} cannot be read.`)
  const door = await siteWriterDoor({ pool, secret })
  if (!door.ok) return refuse(door.code, door.reason)
  const active = await activeRun(pool)
  if (active) return activeRefusal(active)
  const created = await createRun(pool, {
    startedBy,
    plan,
    planSource,
    brief,
    briefSource,
    kit,
    promptSha256: writerPrompt().sha256,
    checkerVersion: CHECKER_VERSION,
    door: door.snapshot,
    harness: benchHarnessFor(door.snapshot.model, door.snapshot.providerId)
  })
  if (created.error === SITE_WRITER_RUN_ACTIVE) return activeRefusal(created.active)
  return { ok: true, run: created.run }
}

function activeRefusal(active) {
  const who = active
    ? `run ${active.id} (started by ${active.startedBy}, step ${active.step})`
    : 'another run'
  return refuse(SITE_WRITER_RUN_ACTIVE, `Only one writer run at a time: ${who} is still active.`, { active })
}

/**
 * Cancel a run. One no worker holds ends at once; one a worker holds is asked to stop, which the worker does
 * between two model calls (a call in flight is never cut).
 */
export async function cancelWriterRun(pool, runId) {
  if (!UUID.test(String(runId))) return refuse('SITE_WRITER_RUN_NOT_FOUND', `No run ${runId}.`)
  const { rows } = await pool.query(
    `update site_writer_run set status = 'cancelled', step = 'done', cancel_requested_at = coalesce(cancel_requested_at, now()),
       finished_at = now(), updated_at = now(), lease_token = lease_token + 1
     where id = $1 and status = 'queued' and (lease_until is null or lease_until < now())
     returning id`,
    [runId]
  )
  if (rows.length) {
    await pool.query(
      `update site_writer_round set state = 'cancelled', finished_at = now() where run_id = $1 and state = 'planning'`,
      [runId]
    )
    return { ok: true, run: await readRun(pool, runId) }
  }
  const asked = await requestCancel(pool, runId)
  if (asked) return { ok: true, run: asked }
  const run = await readRun(pool, runId)
  if (!run) return refuse('SITE_WRITER_RUN_NOT_FOUND', `No run ${runId}.`)
  return refuse('SITE_WRITER_RUN_NOT_ACTIVE', `Run ${runId} has already ended (${run.status}).`)
}
