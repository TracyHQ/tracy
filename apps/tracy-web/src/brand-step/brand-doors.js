// The brand bench's two model doors (#320): the brand agent (needs tool calls and vision) and the brand reviewer
// (needs vision), each resolved from the provider book only. Like the site planner door there is no environment or
// file fallback: an unset, disabled or unreadable door, a model the provider says cannot do what the door needs, an
// Anthropic model, or one model on both doors refuses the run with its reason. Assigning is done in /ops.
import { doorEntry } from '../lib/llm-catalog.js'
import { isAnthropicModel } from '../lib/llm-door-policy.js'
import { lookupDoor } from '../lib/llm-store.js'

export const BRAND_AGENT_DOOR = 'brandAgent'
export const BRAND_REVIEWER_DOOR = 'brandReviewer'

const WHERE = '/ops > Model & AI'
const LABELS = { [BRAND_AGENT_DOOR]: 'Brand agent', [BRAND_REVIEWER_DOOR]: 'Brand reviewer' }
const CODES = { [BRAND_AGENT_DOOR]: 'BRAND_AGENT_DOOR', [BRAND_REVIEWER_DOOR]: 'BRAND_REVIEWER_DOOR' }
const NEEDS = { tools: 'tool calls', vision: 'reading pictures' }

export { isAnthropicModel }

// The model without its vendor prefix ("openai/gpt-6-luna" and "gpt-6-luna" are one model).
const bare = (model) =>
  String(model ?? '')
    .toLowerCase()
    .split('/')
    .at(-1)

const refuse = (door, suffix, reason, extra = {}) => ({
  ok: false,
  code: `${CODES[door]}_${suffix}`,
  reason,
  ...extra
})

async function oneDoor({ pool, secret, door, override }) {
  const label = `"${LABELS[door]}"`
  const found = await lookupDoor(pool, door, secret)
  if (found.state === 'unassigned')
    return refuse(door, 'UNSET', `The ${label} door has no provider and model. Set it in ${WHERE}.`)
  if (found.state === 'disabled')
    return refuse(
      door,
      'DISABLED',
      `The provider of the ${label} door is switched off. Turn it on, or pick another provider in ${WHERE}.`
    )
  if (found.state !== 'ok')
    return refuse(
      door,
      'UNREADABLE',
      `The key of the ${label} door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${WHERE}.`
    )
  const { providerId, baseUrl, apiKey } = found.credential
  const model = override?.model ?? found.credential.model
  const replaces = override ? found.credential.model : null
  if (!model) return refuse(door, 'UNSET', `The ${label} door names no model. Set it in ${WHERE}.`)
  if (isAnthropicModel(providerId, model))
    return refuse(
      door,
      'ANTHROPIC',
      `${model} is an Anthropic model. The brand step never uses Opus or Sonnet; pick another model for the ${label} door in ${WHERE}.`
    )
  // Refuse only what the provider says is missing; an unlisted model passes, as on assignment (ops/llm.js).
  const metadata = override ? null : found.snapshot.metadata
  const lacking = doorEntry(door).requires.filter((cap) => metadata?.[cap] === false)
  if (lacking.length)
    return refuse(
      door,
      'MODEL_LACKS',
      `The provider says ${model} cannot do ${lacking.map((c) => NEEDS[c] ?? c).join(' or ')}, which the ${label} door needs. Pick another model in ${WHERE}.`,
      { lacking }
    )
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    // What a run stores: never the key.
    snapshot: {
      door,
      model,
      endpointHost: new URL(baseUrl).hostname,
      ...found.snapshot,
      ...(override ? { override: { ...override, ...(replaces ? { replaces } : {}) } } : {})
    }
  }
}

/**
 * Both brand doors, or the first refusal. `override`: a one-off agent model for this run, `{ model, reason,
 * reviewerModel? }`, on the agent door's provider; recorded in the agent snapshot. `reviewerModel` is the explicit
 * switch of the reviewer for this run only (on the reviewer door's provider), so the two never match; it is recorded
 * in the reviewer snapshot with the same reason and the model it replaces. Nothing is switched on its own: the same
 * model on both doors is still refused.
 * @returns {Promise<{ ok: true, agent: { door: object, snapshot: object }, reviewer: { door: object, snapshot: object } }
 *   | { ok: false, code: string, reason: string }>}
 */
export async function brandDoors({ pool, secret, override = null }) {
  const agent = await oneDoor({ pool, secret, door: BRAND_AGENT_DOOR, override })
  if (!agent.ok) return agent
  const reviewerOverride = override?.reviewerModel
    ? { model: override.reviewerModel, reason: override.reason }
    : null
  const reviewer = await oneDoor({ pool, secret, door: BRAND_REVIEWER_DOOR, override: reviewerOverride })
  if (!reviewer.ok) return reviewer
  if (bare(agent.door.model) === bare(reviewer.door.model))
    return {
      ok: false,
      code: 'BRAND_SAME_MODEL',
      reason: `The brand agent and the brand reviewer both resolve to ${agent.door.model}. The reviewer has to be another model, so the agent's work is not judged by the model that made it. Change one door in ${WHERE}.`
    }
  return { ok: true, agent, reviewer }
}
