// The model doors a step chain build spends, and the check that names the ones that cannot be answered (ADR 0047,
// consequences; #591). Shared by the creation door, which refuses a chain press before the base site is created when a
// door is empty, and by the chain's own first step (`step-chain-steps.js` `doors`), which stops a run whose door went
// empty after the press.
import { BRAND_AGENT_DOOR, BRAND_REVIEWER_DOOR } from './brand-step/brand-doors.js'
import { PICTURE_PICKER_DOOR } from './site-pictures/door.js'
import { PICTURE_DRAWER_DOOR } from './site-pictures/drawer-door.js'
import { PICTURE_LOOKER_DOOR } from './site-pictures/looker-door.js'
import { SITE_PLANNER_DOOR } from './site-planner/door.js'
import { SITE_WRITER_DOOR } from './site-writer/door.js'
import { lookupDoor } from './lib/llm-store.js'

/**
 * The model doors a chain build spends, checked before any model work: the brand agent and its reviewer, the planner,
 * the writer, and the picture step's picker, looker and drawer. The picture icon ranker is not among them: an unset
 * ranker door never stops a picture run, the shortlist order decides (lib/llm-catalog.js).
 */
export const STEP_CHAIN_MODEL_DOORS = Object.freeze([
  BRAND_AGENT_DOOR,
  BRAND_REVIEWER_DOOR,
  SITE_PLANNER_DOOR,
  SITE_WRITER_DOOR,
  PICTURE_PICKER_DOOR,
  PICTURE_LOOKER_DOOR,
  PICTURE_DRAWER_DOOR
])

/**
 * The doors of `STEP_CHAIN_MODEL_DOORS` that cannot be answered (unset, switched off, a key that will not open, no model
 * named). None means every door the chain spends is ready.
 * @param {import('pg').Pool} pool
 * @param {string} secret
 * @returns {Promise<Array<{door: string, state: string}>>}
 */
export async function emptyChainDoors(pool, secret) {
  const empty = []
  for (const door of STEP_CHAIN_MODEL_DOORS) {
    const found = await lookupDoor(pool, door, secret)
    if (found.state !== 'ok') empty.push({ door, state: found.state })
    else if (!found.credential?.model) empty.push({ door, state: 'no-model' })
  }
  return empty
}
