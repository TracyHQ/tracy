// Starting and cancelling a brand bench run (brand step trial bench, #320). A start checks everything a run needs
// before it is queued (the brief's brand part, the kit and what the brand step reads from it, both doors, the kit's
// images, the template font) and stores what the run will use, so a refused start leaves nothing behind and an
// accepted one says exactly what it ran: brief as used, kit, prompt hash, both door snapshots (never a key), tool
// names and harness settings. The worker (brand-worker.js) does the rest.
import { briefOfRevision } from '../site-planner/bench-control.js'
import { openKit, readableKits } from '../site-planner/kit-source.js'
import { brandBriefProblems } from './brand-brief-shape.js'
import { brandDoors } from './brand-doors.js'
import { brandHarnessFor } from './brand-harness.js'
import { brandPrompt } from './brand-prompt.js'
import { activeRun, BRAND_RUN_ACTIVE, createRun, readRun, requestCancel, UUID } from './brand-store.js'
import { homeShotOf } from './brand-first-message.js'
import { kitProblem } from './kit-grounds.js'

export { briefOfRevision }

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra })

/** Why a kit cannot feed the brand step, or null: what the gate reads, the favicon, the home shot at 1440. */
export function brandKitProblem(doc) {
  const problem = kitProblem(doc)
  if (problem) return problem
  if (!doc.site.favicon) return 'the kit has no site.favicon'
  if (!homeShotOf({ doc })) return 'the kit has no home page shot at 1440'
  return null
}

/** The brand tools as a run records them: names and versions only. */
export const toolInfo = (tools) => tools.map((t) => ({ name: t.name, version: t.version ?? null }))

/**
 * Queue one run, or refuse it with a reason and nothing written.
 * @param {{ pool: import('pg').Pool, secret: string, brief: unknown, briefSource: object, kitRef: string,
 *   startedBy: string, kitImages: { ensure: Function }, wiring: Function, index?: Map<string, object>,
 *   agentModel?: { model: string, reason: string } }} input `agentModel`: a one-off agent model for this run,
 *   recorded with its reason; `wiring` gives the tools and the template font (brand-wiring.js).
 */
export async function startBrandRun({
  pool,
  secret,
  brief,
  briefSource,
  kitRef,
  startedBy,
  kitImages,
  wiring,
  index,
  agentModel
}) {
  const problems = brandBriefProblems(brief)
  if (problems.length)
    return refuse('BRAND_BRIEF_SHAPE', `The brief cannot run: ${problems.join('; ')}`, { problems })
  const kits = readableKits(index ? { index } : {})
  const kit = kits.find((k) => k.ref === kitRef)
  if (!kit)
    return refuse(
      'BRAND_KIT_UNKNOWN',
      `No readable kit "${kitRef}". Readable kits: ${kits.map((k) => k.ref).join(', ') || 'none'}.`
    )
  const opened = openKit(kitRef, index ? { index } : {})
  const kitIssue = brandKitProblem(opened.doc)
  if (kitIssue)
    return refuse('BRAND_KIT_UNUSABLE', `The kit ${kitRef} cannot run the brand step: ${kitIssue}.`)
  if (agentModel && !String(agentModel.reason ?? '').trim())
    return refuse('BRAND_OVERRIDE_REASON', 'A one-off agent model needs a reason; it is recorded on the run.')
  const doors = await brandDoors({ pool, secret, override: agentModel ?? null })
  if (!doors.ok) return refuse(doors.code, doors.reason, doors.lacking ? { lacking: doors.lacking } : {})
  const wired = await wiring()
  const font = await wired.fontFor(opened).catch((e) => ({ refusal: String(e?.message ?? e) }))
  if (!font || font.refusal)
    return refuse(
      'BRAND_FONT_UNRESOLVED',
      `The template heading font of ${kitRef} cannot be read: ${font?.refusal ?? 'the template has no slot contract'}.`
    )
  const active = await activeRun(pool)
  if (active) return activeRefusal(active)
  // Last, since the first use of a kit version downloads its image zip: a kit whose images are unusable never queues.
  const images = await kitImages.ensure(opened)
  if (!images.ok) return refuse(images.code, images.reason)
  const created = await createRun(pool, {
    startedBy,
    brief,
    briefSource,
    kit,
    promptSha256: brandPrompt().sha256,
    door: { agent: doors.agent.snapshot, reviewer: doors.reviewer.snapshot },
    tools: toolInfo(wired.tools),
    harness: brandHarnessFor(doors.agent.snapshot.model, doors.agent.snapshot.providerId)
  })
  if (created.error === BRAND_RUN_ACTIVE) return activeRefusal(created.active)
  return { ok: true, run: created.run }
}

function activeRefusal(active) {
  const who = active
    ? `run ${active.id} (started by ${active.startedBy}, step ${active.step})`
    : 'another run'
  return refuse(BRAND_RUN_ACTIVE, `Only one brand run at a time: ${who} is still active.`, { active })
}

/**
 * Cancel a run. One no worker holds ends at once; one a worker holds is asked to stop, which the worker does
 * between two model calls (a call in flight is never cut).
 */
export async function cancelBrandRun(pool, runId) {
  if (!UUID.test(String(runId))) return refuse('BRAND_RUN_NOT_FOUND', `No run ${runId}.`)
  const { rows } = await pool.query(
    `update brand_run set status = 'cancelled', step = 'done', cancel_requested_at = coalesce(cancel_requested_at, now()),
       finished_at = now(), updated_at = now(), lease_token = lease_token + 1
     where id = $1 and status = 'queued' and (lease_until is null or lease_until < now())
     returning id`,
    [runId]
  )
  if (rows.length) {
    await pool.query(
      `update brand_round set state = 'cancelled', finished_at = now() where run_id = $1 and state = 'working'`,
      [runId]
    )
    return { ok: true, run: await readRun(pool, runId) }
  }
  const asked = await requestCancel(pool, runId)
  if (asked) return { ok: true, run: asked }
  const run = await readRun(pool, runId)
  if (!run) return refuse('BRAND_RUN_NOT_FOUND', `No run ${runId}.`)
  return refuse('BRAND_RUN_NOT_ACTIVE', `Run ${runId} has already ended (${run.status}).`)
}
