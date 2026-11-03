// Starting and cancelling a site planner bench run (ADR 0041, #301). A start checks everything a run needs before
// it is queued (the brief's shape, the kit, the door, the kit's images) and stores what the run will use, so a refused start leaves
// nothing behind and an accepted one says exactly what it ran: brief as used, kit, prompt hash, checker version, door
// snapshot (never the key) and harness settings. The worker (bench-worker.js) does the rest.
import { MAX_OUTPUT_TOKENS } from '../lib/agent-over-door.js'
import { RETRY_DEFAULTS } from '../lib/agent-over-door-retry.js'
import { activeRun, createRun, readRun, requestCancel, SITE_PLANNER_RUN_ACTIVE } from './bench-store.js'
import { briefShapeProblems } from './brief-shape.js'
import { sitePlannerDoor } from './door.js'
import { openKit, readableKits } from './kit-source.js'
import { CHECKER_VERSION } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * How every bench run calls the model, stored on the run (parity with the reference run, ADR 0041). The output
 * budget is Claude Code's (thinking counts against it, and the reference plan alone is about 50k tokens); a call
 * that long, not streamed, can take well over 20 minutes, hence 45. Transient provider errors are retried. Both cache
 * markers (system and rolling) live one hour: an answer can take longer than 5 minutes, and a 5 minute rolling marker
 * then expires before the next call, which writes the whole conversation to the cache again. Thinking effort is
 * medium, as in the Claude Code runs that produced the approved reference plans.
 */
export const BENCH_HARNESS = Object.freeze({
  maxTokens: MAX_OUTPUT_TOKENS,
  effort: 'medium',
  cacheTtl: Object.freeze({ system: '1h', rolling: '1h' }),
  toolImages: 'inline',
  cacheMarkers: true,
  maxTurns: 150,
  callTimeoutMs: 45 * 60_000,
  retry: RETRY_DEFAULTS
})

/**
 * DeepSeek's own API reports no cost, so a run on it computes one from this table, USD per million tokens.
 * Assumed, check platform.deepseek.com pricing: input on a cache miss and output are OpenRouter's listing of
 * DeepSeek's own endpoint for deepseek-v4.1-flash (03/11/2026); the cache hit price is an assumption.
 */
export const DEEPSEEK_FLASH_PRICE = Object.freeze({ inputCacheHit: 0.03, inputCacheMiss: 0.3, output: 1.2 })

/**
 * The same for deepseek-v4-pro on DeepSeek's own API, USD per million tokens.
 * Assumed from OpenRouter third-party listings on 2026-11-03; check platform.deepseek.com pricing.
 */
export const DEEPSEEK_V4_PRO_PRICE = Object.freeze({ inputCacheHit: 0.1, inputCacheMiss: 1, output: 2.5 })

/**
 * What changes in the harness for the door's model, by model id, and by the door's provider id where an entry names
 * one (`providerId`). Read on 03/11/2026 from OpenRouter's model list and endpoints (deepseek/deepseek-v4.1-flash-1017:
 * text and image input, tools, reasoning efforts max, high, low and none, the smallest endpoint output limit 131072)
 * and DeepSeek's API docs (images only in user messages, reasoning sent back in a tool loop, automatic caching). The
 * first matching entry wins.
 */
export const MODEL_HARNESS = Object.freeze([
  {
    profile: 'deepseek-flash-native',
    providerId: 'deepseek',
    match: /^deepseek-flash$/,
    harness: {
      // DeepSeek's own API: reasoning_effort instead of OpenRouter's reasoning object, no usage or provider field,
      // and reasoning_content sent back on every later turn (agent-over-door-wire.js).
      wire: 'deepseek-native',
      toolImages: 'user-message',
      cacheMarkers: false,
      effort: 'high',
      // Not yet measured against DeepSeek's own API; kept at the bench budget until it is.
      maxTokens: MAX_OUTPUT_TOKENS,
      price: DEEPSEEK_FLASH_PRICE
    }
  },
  {
    profile: 'deepseek-v4-pro-native',
    providerId: 'deepseek',
    match: /^deepseek-v4-pro$/,
    harness: {
      wire: 'deepseek-native',
      // DeepSeek's own API lists this model as text only (03/11/2026): it plans from the kit's looks, is offered no
      // image tool, and the door lets it in only for a kit with a current look for every shot (door.js).
      images: false,
      toolImages: 'user-message',
      cacheMarkers: false,
      effort: 'high',
      // A planner-sized call (231k prompt tokens, 20.8k out) answered in 191 s with this budget (03/11/2026).
      maxTokens: 128000,
      price: DEEPSEEK_V4_PRO_PRICE
    }
  },
  // Claude Sonnet 5.5 and Opus 5.5 alike (alternatives to the planner's default model, door.js SITE_PLANNER_MODEL): OpenRouter lists both with
  // image input, tools, reasoning_effort, a 1h cache write price and 128000 output tokens on every endpoint (03/11/2026).
  { profile: 'anthropic', match: /^anthropic\//, harness: {} },
  {
    profile: 'deepseek-v4.1-flash',
    match: /^deepseek\/deepseek-v4\.1-flash/,
    harness: {
      // DeepSeek takes images in user messages only, never inside a tool result.
      toolImages: 'user-message',
      // DeepSeek caches on its own; Anthropic's cache_control markers are left out.
      cacheMarkers: false,
      // The model offers low, high and max but no medium; high is its default.
      effort: 'high',
      // One provider for the whole run: each provider caches on its own, and DeepSeek's own endpoint is the one
      // whose image handling its docs describe.
      provider: Object.freeze({ order: Object.freeze(['deepseek']), allow_fallbacks: false })
    }
  }
])

/** Any other model: images in user messages and no cache markers, the forms OpenAI-compatible models all accept. */
const OTHER_MODEL = { profile: 'other', harness: { toolImages: 'user-message', cacheMarkers: false } }

/**
 * The harness a run on this model records: BENCH_HARNESS with the model's own settings and its profile name.
 * `providerId` is the door's provider (the run's door snapshot); an entry that names a provider matches only it.
 */
export function benchHarnessFor(model, providerId) {
  const entry =
    MODEL_HARNESS.find(
      (m) => (m.providerId === undefined || m.providerId === providerId) && m.match.test(String(model ?? ''))
    ) ?? OTHER_MODEL
  return { ...BENCH_HARNESS, ...entry.harness, modelProfile: entry.profile }
}

/** Whether a run's harness sends images to this model: false for a text-only profile. */
export const sendsImages = (model, providerId) => benchHarnessFor(model, providerId).images !== false

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra })

/**
 * Queue one run, or refuse it with a reason and nothing written.
 * @param {{ pool: import('pg').Pool, secret: string, brief: unknown, briefSource: object, kitRef: string,
 *   startedBy: string, kitImages: { ensure: Function }, index?: Map<string, object> }} input `kitImages`: the kit
 *   images of this server (kit-images.js kitImagesFor); `index`: the contracts to find kits in (tests).
 */
export async function startBenchRun({
  pool,
  secret,
  brief,
  briefSource,
  kitRef,
  startedBy,
  kitImages,
  index
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
    harness: benchHarnessFor(door.snapshot.model, door.snapshot.providerId)
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

/** The brief of one WO revision by its id. */
export async function briefOfRevision(pool, revisionId) {
  if (!UUID.test(String(revisionId))) return { ok: false, code: 'SITE_PLANNER_REVISION_UNKNOWN' }
  const { rows } = await pool.query('select brief from wo_revision where id = $1', [revisionId])
  if (!rows[0]) return { ok: false, code: 'SITE_PLANNER_REVISION_UNKNOWN' }
  return { ok: true, brief: rows[0].brief }
}
