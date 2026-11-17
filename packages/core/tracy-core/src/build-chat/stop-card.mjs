/**
 * The stop card of the build chat (#575, screen 8 "Could not finish" of the approved mock): when the build draft's
 * latest step stopped, or a start was refused for its limit, the chat ends with one card that says why in a plain
 * sentence and offers Try again and Start over. Pure: the card component draws what this answers.
 *
 * Read from the session's own `tracy_build` results (`buildToolFoldOf` `stop`) and, when the chat never heard the stop
 * (the step ended while the chat was closed), from the engine door's state (`GET /api/build-draft/engine`). The engine
 * door wins only to take the card away while a step runs again.
 */
import { canRetryStop } from './tool-results.mjs'

/**
 * Stops the owner continues from by talking in the chat, not by a card: a cancel they asked for, a change request not
 * applied (the plan stays), a plan that moved meanwhile, and research asking for the business's details.
 */
const OWNER_CONTINUES = new Set(['cancelled', 'revise-failed', 'stale', 'details-asked'])

/**
 * @typedef {{ step: string, limit: boolean, retryAt: string | null, retry: 'offered' | 'waiting' | 'none' }} StopCard
 */

/**
 * The card for the build chat's current stop, or null when none shows.
 * @param {{ stop?: import('./tool-results.mjs').StopSeen | null, engine?: any, now?: number }} seen
 *   `stop`: the session's latest stop; `engine`: the engine door's state, when read; `now`: the clock, for `retryAt`
 * @returns {StopCard | null}
 */
export function stopCardOf({ stop = null, engine = null, now = Date.now() }) {
  if (engine?.state === 'running') return null
  const fromEngine =
    engine?.state === 'stopped'
      ? {
          step: typeof engine.step === 'string' ? engine.step : 'status',
          rerun: engine.rerun === true,
          retries: 0,
          ...(typeof engine.reason === 'string' ? { reason: engine.reason } : {}),
          ...(typeof engine.retryAt === 'string' ? { retryAt: engine.retryAt } : {})
        }
      : null
  const seen = stop ?? fromEngine
  if (!seen || (seen.reason && OWNER_CONTINUES.has(seen.reason))) return null
  const at = typeof seen.retryAt === 'string' ? Date.parse(seen.retryAt) : Number.NaN
  const retryAt = Number.isFinite(at) ? /** @type {string} */ (seen.retryAt) : null
  const retry = !canRetryStop(/** @type {any} */ (seen))
    ? 'none'
    : retryAt && at > now
      ? 'waiting'
      : 'offered'
  return { step: seen.step, limit: retryAt !== null, retryAt, retry }
}
