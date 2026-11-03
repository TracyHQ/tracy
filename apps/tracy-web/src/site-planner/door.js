// The site planner bench's model door (ADR 0041, #301): the credential a run spends, or a refusal with its reason.
// Unlike modelForDoor it never falls back to the environment: an unset, disabled or unreadable door stops the run
// and says why, because a bench run on a model nobody chose would not measure the prompt it claims to measure.
import { doorEntry } from '../lib/llm-catalog.js'
import { lookupDoor } from '../lib/llm-store.js'

export const SITE_PLANNER_DOOR = 'sitePlanner'

const WHERE = '/ops › Model & AI'

const REFUSALS = {
  unassigned: [
    'SITE_PLANNER_DOOR_UNSET',
    `The "Site planner" door has no provider and model. Set it in ${WHERE}.`
  ],
  disabled: [
    'SITE_PLANNER_DOOR_DISABLED',
    `The provider of the "Site planner" door is switched off. Turn it on, or pick another provider in ${WHERE}.`
  ],
  unreadable: [
    'SITE_PLANNER_DOOR_UNREADABLE',
    `The key of the "Site planner" door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${WHERE}.`
  ]
}

const NEEDS = { tools: 'tool calls', vision: 'reading pictures' }

/**
 * @returns {Promise<
 *   | { ok: true, door: { providerId: string, baseUrl: string, apiKey: string, model: string }, snapshot: object }
 *   | { ok: false, code: string, reason: string, lacking?: string[] }
 * >} `snapshot` is what a run stores: which provider, model and assignment revision it used, never the key.
 */
export async function sitePlannerDoor({ pool, secret }) {
  const found = await lookupDoor(pool, SITE_PLANNER_DOOR, secret)
  if (found.state !== 'ok') {
    const [code, reason] = REFUSALS[found.state] ?? REFUSALS.unreadable
    return { ok: false, code, reason }
  }
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (!model)
    return {
      ok: false,
      code: 'SITE_PLANNER_DOOR_UNSET',
      reason: `The "Site planner" door names no model. Set it in ${WHERE}.`
    }
  // Refuse only what the provider says is missing; an unlisted model passes, as on assignment (ops/llm.js).
  const metadata = found.snapshot.metadata
  const lacking = doorEntry(SITE_PLANNER_DOOR).requires.filter((cap) => metadata?.[cap] === false)
  if (lacking.length)
    return {
      ok: false,
      code: 'SITE_PLANNER_MODEL_LACKS',
      lacking,
      reason: `The provider says ${model} cannot do ${lacking.map((cap) => NEEDS[cap] ?? cap).join(' or ')}. Pick another model for the "Site planner" door in ${WHERE}.`
    }
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    snapshot: { door: SITE_PLANNER_DOOR, model, endpointHost: new URL(baseUrl).hostname, ...found.snapshot }
  }
}
