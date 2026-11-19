// Starting and cancelling a site writer bench run (#329). A start checks everything a run needs before it is queued
// (the plan's and the brief's shape, the kit, the door) and stores what the run will use, so a refused start leaves
// nothing behind and an accepted one says exactly what it ran: plan, brief as used, kit (with the sha256 of the content
// map beside it, null when there is none), prompt hash, checker version,
// door snapshot (never the key) and harness settings, pages per turn among them (#330), and parallel pages when a run
// asks for its first draft in parts (2026-11-15; left out of the harness otherwise, so a run that does not ask is
// started exactly as before). The worker (bench-worker.js) does the rest.
import { briefShapeProblems } from '../lib/bench-brief-shape.js'
import { benchHarnessFor, capsOf } from '../lib/bench-harness.js'
import { BENCH_RUNS_AT_ONCE, benchFullRefusal, briefOfRevision, UUID } from '../lib/bench-sql.js'
import { openContentMap } from '../lib/content-map-source.js'
import { planShapeProblems } from '../lib/plan-shape.js'
import { openKit, readableKits } from '../lib/template-kit-source.js'
import { activeRuns, createRun, readRun, requestCancel, SITE_WRITER_RUN_ACTIVE } from './bench-store.js'
import { CHECKER_VERSION } from './copy-check/check-copy.js'
import { siteWriterDoor } from './door.js'
import { WRITER_VISUAL_POLICY } from './visual-review.js'
import { writerPrompt } from './writer-prompt.js'
import { DEFAULT_PAGES_PER_TURN, pagesPerTurnProblem } from './writer-turns.js'
import { parallelPagesProblem } from './writer-parts.js'

export { briefOfRevision }

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra })

/**
 * Queue one run, or refuse it with a reason and nothing written.
 * @param {{ pool: import('pg').Pool, secret: string, plan: unknown, planSource: object, brief: unknown,
 *   briefSource: object, kitRef: string, startedBy: string, pagesPerTurn?: number | 'all', parallelPages?: number,
 *   index?: Map<string, object>, effort?: 'low' | 'high' | 'max' }} input `effort`: an explicit native DeepSeek Flash
 *   run setting; omission keeps the measured model default. `pagesPerTurn`: pages per writing turn, the whole site in one turn unless
 *   given; `index`: the contracts to find kits in (tests). `parallelPages`: the number of parts the first draft
 *   is written in at the same time (writer-parts.js); absent or 1, round 0 is written as before.
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
  pagesPerTurn = DEFAULT_PAGES_PER_TURN,
  parallelPages,
  effort,
  index,
  noCaps = false,
  requireVisualReview = false,
  baseCopy,
  maxFixRounds
}) {
  if (baseCopy !== undefined && !(isPlainObject(baseCopy) && Array.isArray(baseCopy.slots)))
    return refuse(
      'SITE_WRITER_HARNESS',
      'The run cannot start: the base copy is not a site copy (no list of slots).'
    )
  if (
    maxFixRounds !== undefined &&
    !(Number.isInteger(maxFixRounds) && maxFixRounds >= 0 && maxFixRounds <= 2)
  )
    return refuse(
      'SITE_WRITER_HARNESS',
      'The run cannot start: max fix rounds is a whole number from 0 to 2.'
    )
  const turnProblem = pagesPerTurnProblem(pagesPerTurn)
  if (turnProblem) return refuse('SITE_WRITER_HARNESS', `The run cannot start: ${turnProblem}.`)
  if (parallelPages !== undefined) {
    const partsProblem = parallelPagesProblem(parallelPages)
    if (partsProblem) return refuse('SITE_WRITER_HARNESS', `The run cannot start: ${partsProblem}.`)
    if (parallelPages > 1 && pagesPerTurn !== 'all')
      return refuse(
        'SITE_WRITER_HARNESS',
        'The run cannot start: parallel pages writes every part in one turn, so pages per turn must be "all".'
      )
  }
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
  // The content map beside the kit gives the main menu dropdowns; its hash is frozen with the kit (null: none).
  const contentMap = openContentMap(kitRef, where)
  if (contentMap?.invalid)
    return refuse('SITE_WRITER_CONTENT_MAP', `The run cannot start: ${contentMap.invalid}.`)
  const door = await siteWriterDoor({ pool, secret, requireImages: requireVisualReview })
  if (!door.ok) return refuse(door.code, door.reason)
  let harness
  try {
    harness = capsOf(benchHarnessFor(door.snapshot.model, door.snapshot.providerId, { effort }), noCaps)
  } catch (error) {
    if (error.code !== 'BENCH_EFFORT_UNSUPPORTED') throw error
    return refuse('SITE_WRITER_HARNESS', error.message)
  }
  if (requireVisualReview && harness.images === false)
    return refuse(
      'SITE_WRITER_MODEL_LACKS',
      'This writer run requires actual image input; the selected model harness is text only.'
    )
  const running = await activeRuns(pool)
  if (running.length >= BENCH_RUNS_AT_ONCE) return fullRefusal(running)
  const created = await createRun(pool, {
    startedBy,
    plan,
    planSource,
    brief,
    briefSource,
    kit: { ...kit, contentMapSha256: contentMap?.sha256 ?? null },
    promptSha256: writerPrompt().sha256,
    checkerVersion: CHECKER_VERSION,
    door: door.snapshot,
    harness: {
      ...harness,
      pagesPerTurn,
      ...(parallelPages > 1 ? { parallelPages } : {}),
      ...(requireVisualReview ? { visualReview: WRITER_VISUAL_POLICY } : {}),
      // A base copy is round 0 (site-writer/bench-worker.js baseCopyOf); fewer fix rounds end the run sooner.
      ...(baseCopy !== undefined ? { baseCopy } : {}),
      ...(maxFixRounds !== undefined ? { maxFixRounds } : {})
    }
  })
  if (created.error === SITE_WRITER_RUN_ACTIVE) return fullRefusal(created.activeRuns)
  return { ok: true, run: created.run }
}

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

const fullRefusal = (running) => benchFullRefusal(SITE_WRITER_RUN_ACTIVE, 'writer runs', running)

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

export { planShapeProblems }
