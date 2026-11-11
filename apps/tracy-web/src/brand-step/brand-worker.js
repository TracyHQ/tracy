// The brand bench worker (brand step trial bench, #320): a durable queue over brand_run, one run at a time, parallel to
// the site planner bench (its own table, its own queue). A run claims the queued row, runs the locked prompt over the
// brand agent door with the brand tools, saves every model call as it happens, runs the gate on the file the agent
// saved and plays the fix rounds (brand-rounds.js). After the last fix round or at the cost cap it builds the safe
// version by code (brand-safe-version.js).
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes
// at the round the saved rounds say, from the saved turns. A call that was answered is never sent again, and neither
// is one that was dispatched and never answered (the provider may have charged it): that run fails with
// AGENT_TURN_UNANSWERED. A cancel is honoured between two model calls and between two rounds.
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { platformRefusal } from '../lib/cms-line.js'
import { ensureLogo } from './brand-logo.js'
import { brandPrompt } from './brand-prompt.js'
import { brandDoors } from './brand-doors.js'
import { BRAND_PRICES, priceFor } from './brand-prices.js'
import { createReview } from './brand-reviewer.js'
import { nextRound, playRound } from './brand-rounds.js'
import { BRAND_SPOT_CHECK } from './gate-spots.js'
import { BRAND_HELD_NAME_CHECK } from './gate-logo.js'
import { buildSafeVersion } from './brand-safe-version.js'
import { saveRound } from './brand-round-store.js'
import { cancelAsked, setLogoSource, setProgress } from './brand-store.js'
import { openKit } from '../lib/template-kit-source.js'

/** One run at a time; a lease of 3 minutes renewed every minute; a redeploy costs one of the 20 claims. */
export const BRAND_QUEUE = Object.freeze({ concurrency: 1, leaseMs: 3 * 60_000, maxAttempts: 20 })

class LeaseLost extends Error {}

/**
 * @param {{ pool: import('pg').Pool, secret: string, config?: any, fetchImpl?: typeof fetch,
 *   wiring: () => Promise<{ tools: object[], filesFor: (runId: string) => object, fontFor: (kit: object) => Promise<object | null> }>,
 *   kitImages: { ensure: Function }, index?: Map<string, object>, log?: Console, now?: () => number, retry?: object }} deps
 *   `wiring` gives the tools, the run file folders and the template font (brand-wiring.js; tests pass fakes).
 */
export function createBrandQueue({ log = console, now, ...deps }) {
  return createDurableQueue({
    pool: deps.pool,
    table: 'brand_run',
    keyColumn: 'id',
    name: 'brand',
    ...BRAND_QUEUE,
    log,
    ...(now ? { now } : {}),
    run: (row, lease) => runBrandRun(deps, row, lease)
  })
}

/** Run one claimed run to its verdict. False when the lease was lost and nothing more was written. */
export async function runBrandRun(deps, row, lease) {
  const { pool } = deps
  const runId = row.id
  const leaseToken = lease.token
  const must = async (written) => {
    if (!(await written)) throw new LeaseLost()
  }
  const end = (status, error = null, fields = {}) =>
    lease.finish({
      status,
      error,
      ...fields,
      step: 'done',
      checked_at: new Date(),
      finished_at: new Date(),
      updated_at: new Date()
    })
  try {
    if (row.cancel_requested_at) {
      if (row.step !== 'waiting')
        await must(saveRound(pool, { runId, round: row.round, state: 'cancelled', leaseToken }))
      return end('cancelled')
    }
    const ready = await prepare(deps, row)
    if (!ready.ok) return end('failed', `${ready.code}: ${ready.reason}`)
    if (ready.logoSource) await must(setLogoSource(pool, { runId, logo: ready.logoSource, leaseToken }))
    for (;;) {
      const next = await nextRound(pool, runId)
      // Preparation and round reads can outlive a cancellation; fence round zero and safe-version work too.
      if (await cancelAsked(pool, runId)) return end('cancelled')
      if (next.end) return end(...next.end)
      if (next.safe) return await safeVersion(deps, { row, ready, reason: next.safe, leaseToken, must, end })
      const { round, followUp } = next
      await must(setProgress(pool, { runId, step: round ? 'fixing' : 'working', round, leaseToken }))
      if (next.opening) await must(saveRound(pool, { runId, round, state: 'working', leaseToken }))
      const verdict = await playRound(deps, { row, ready, round, followUp, leaseToken, must })
      if (verdict) return end(...verdict)
    }
  } catch (error) {
    if (error instanceof LeaseLost) return false
    throw error
  }
}

async function safeVersion(deps, { row, ready, reason, leaseToken, must, end }) {
  await must(setProgress(deps.pool, { runId: row.id, step: 'safe-version', round: row.round, leaseToken }))
  try {
    const file = await buildSafeVersion({
      tools: ready.tools,
      ctx: ready.ctx,
      kit: ready.kit,
      brief: row.brief,
      reason,
      heldNameCheck: row.harness?.brandHeldNameCheck ?? null
    })
    return end('succeeded', null, {
      outcome: 'safe-version',
      safe_version_reason: reason,
      brand_file: JSON.stringify(file)
    })
  } catch (error) {
    return end('failed', String(error?.message ?? error))
  }
}

// Everything the run was started with must still hold: a run that silently ran on another model, prompt or a kit the
// server no longer reads would not measure what it records.
async function prepare(deps, row) {
  const { pool, secret, index, kitImages } = deps
  if (row.harness?.brandHeldNameCheck != null && row.harness.brandHeldNameCheck !== BRAND_HELD_NAME_CHECK)
    return {
      ok: false,
      code: 'BRAND_HELD_NAME_CHECK_CHANGED',
      reason: 'the recorded held name check is unsupported'
    }
  if (row.harness?.brandSpotCheck != null && row.harness.brandSpotCheck !== BRAND_SPOT_CHECK)
    return {
      ok: false,
      code: 'BRAND_SPOT_CHECK_CHANGED',
      reason: 'the recorded brand spot check is unsupported'
    }
  const prompt = brandPrompt()
  if (prompt.sha256 !== row.prompt_sha256)
    return { ok: false, code: 'BRAND_PROMPT_CHANGED', reason: 'the approved prompt changed since the start' }
  const kit = openKit(row.kit?.ref, index ? { index } : {})
  if (!kit) return { ok: false, code: 'BRAND_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const unplatformed = platformRefusal(kit, 'BRAND')
  if (unplatformed) return unplatformed
  const doors = await brandDoors({ pool, secret, override: row.door?.agent?.override ?? null })
  if (!doors.ok) return doors
  for (const side of ['agent', 'reviewer']) {
    const now = doors[side].snapshot
    const was = row.door?.[side]
    if (!['providerId', 'model', 'endpointHost'].every((k) => now[k] === was?.[k]))
      return {
        ok: false,
        code: 'BRAND_DOOR_CHANGED',
        reason: `the ${side} door now uses ${now.providerId} ${now.model}, the run was started on ${was?.providerId} ${was?.model}`
      }
  }
  const images = await kitImages.ensure(kit)
  if (!images.ok) return images
  const wiring = await deps.wiring()
  // Every model call is counted toward the cap even when the provider sends no cost, so each door's model needs a
  // price (brand-prices.js); one without is refused here, before any call.
  const prices = wiring.prices ?? BRAND_PRICES
  const agentPrice = priceFor(doors.agent.door.model, prices)
  const reviewerPrice = priceFor(doors.reviewer.door.model, prices)
  for (const [side, found] of [
    ['agent', agentPrice],
    ['reviewer', reviewerPrice]
  ])
    if (!found)
      return {
        ok: false,
        code: 'BRAND_PRICE_UNKNOWN',
        reason: `no price for the ${side} model ${doors[side].door.model}, so its calls cannot be counted toward the cap. Add it to brand-step/brand-prices.js`
      }
  const font = await wiring.fontFor(kit).catch((e) => ({ refusal: String(e?.message ?? e) }))
  if (!font || font.refusal)
    return {
      ok: false,
      code: 'BRAND_FONT_UNRESOLVED',
      reason: `the template heading font cannot be read: ${font?.refusal ?? 'the template has no slot contract'}`
    }
  const files = wiring.filesFor(row.id)
  // The found logo is a media id in the brief; its bytes go into the run folder before any model call.
  const logo = await ensureLogo({ pool, files, brief: row.brief, objects: wiring.logoObjects ?? null })
  if (!logo.ok) return { ok: false, code: 'BRAND_LOGO_UNAVAILABLE', reason: logo.reason }
  // The picture of a kit image by its id, for open_image: the bytes the kit image cache serves, or null.
  const kitImage = async (id) => {
    const opened = await images.images.open(id)
    const base64 = typeof opened === 'object' ? opened?.images?.[0]?.base64 : null
    return base64 ? Buffer.from(base64, 'base64') : null
  }
  return {
    ok: true,
    logoSource: logo.source,
    prompt,
    kit,
    agent: doors.agent,
    agentPrice,
    tools: wiring.tools,
    ctx: {
      files,
      kit: kit.doc,
      brief: row.brief,
      font,
      runId: row.id,
      kitImage,
      draw: await wiring.drawFor?.({ pool, secret, fetchImpl: deps.fetchImpl, prices })
    },
    reviewFor: ({ spend, tool }) =>
      createReview({
        door: doors.reviewer.door,
        fetchImpl: deps.fetchImpl,
        spend,
        tool,
        price: reviewerPrice
      })
  }
}
