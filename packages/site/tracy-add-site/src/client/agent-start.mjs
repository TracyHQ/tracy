/**
 * The wizard's last step: the site's agent, started by the wizard itself once the copy is built.
 *
 * Before 04/09 the handover sent people to My Sites for a second button ("Start the agent").
 * Now the wizard presses it for them, through the same door (`POST /api/sites/<key>/agent`),
 * and waits the same way My Sites does. This module is the waiting: pure, no React, no fetch,
 * so `node --test` pins the one definition of "ready" both surfaces share.
 *
 * "Ready" is the site's row in `GET /api/sites` carrying a non-null `agent`. "Failed" is only
 * patience running out — the door itself refusing is decided by the caller, before this runs.
 */

/** Same cadence as My Sites (`START_POLL_MS` there): two surfaces, one rhythm. */
export const START_POLL_MS = 5000
/** Same patience as My Sites: a lane needs tunnel, DNS and a dsh boot; four minutes covers a slow host. */
export const START_PATIENCE_MS = 4 * 60 * 1000

/**
 * Where the start stands, from the latest site list.
 * @param {{ rows: Array<{ siteKey: string; agent: string | null }>; siteKey: string; since: number; now: number; patienceMs?: number }} input
 * @returns {'ready' | 'failed' | 'starting'}
 */
export function agentStage({ rows, siteKey, since, now, patienceMs = START_PATIENCE_MS }) {
  const row = rows.find((r) => r.siteKey === siteKey)
  // Ready beats failed: an agent that answers late is an agent that answers.
  if (row && row.agent !== null && row.agent !== undefined) return 'ready'
  if (now - since >= patienceMs) return 'failed'
  return 'starting'
}

/**
 * The one thing the handover offers for a stage.
 * @param {'ready' | 'failed' | 'starting'} stage
 * @returns {'open' | 'retry' | 'wait'}
 */
export function handoverAction(stage) {
  if (stage === 'ready') return 'open'
  if (stage === 'failed') return 'retry'
  return 'wait'
}
