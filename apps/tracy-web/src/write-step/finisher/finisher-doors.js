// The finisher's three model doors (spec #418): `finisherFinder`, `finisherFixer` and `finisherChecker`, each set in
// /ops › Model & AI and meant for DeepSeek Flash on DeepSeek's own API at maximum reasoning effort (lib/bench-harness.js),
// like the planner, the writer and the picture picker. Like theirs, a door never falls back to the environment: an unset,
// disabled or unreadable door refuses the run with its reason. The finder and the checker look at screenshots, so a model
// that cannot read pictures (its provider says so, or its harness profile sends none) refuses the run too.
//
// What the finisher is given for each role is a door object: { ok, label, model, providerId, images, snapshot,
// ask({ system, content }) => { text, costUsd } }, or a refusal { ok: false, code, reason }. Tests give scripted ones.
import { runAgent } from '../../lib/agent-over-door.js'
import { benchHarnessFor, sendsImages } from '../../lib/bench-harness.js'
import { lookupDoor } from '../../lib/llm-store.js'

export const FINISHER_PROVIDER = 'deepseek'
export const FINISHER_MODEL = 'deepseek-flash'
const WHERE = '/ops › Model & AI'

/** The roles, their door ids and labels, and whether the role looks at pictures. */
export const FINISHER_ROLES = Object.freeze({
  finder: Object.freeze({ door: 'finisherFinder', label: 'Finisher finder', images: true }),
  fixer: Object.freeze({ door: 'finisherFixer', label: 'Finisher fixer', images: false }),
  checker: Object.freeze({ door: 'finisherChecker', label: 'Finisher checker', images: true })
})

const DEFAULT_NAMED = `${FINISHER_MODEL} on the ${FINISHER_PROVIDER} provider`

/**
 * The refusal that stops a finisher run before it shoots or writes anything, or null when every door may be used.
 * @param {Record<string, object>} doors by role
 */
export function doorsRefusal(doors) {
  for (const [role, spec] of Object.entries(FINISHER_ROLES)) {
    const door = doors?.[role]
    if (!door) return { code: 'FINISHER_DOOR_UNSET', reason: `No ${spec.label} door was given.` }
    if (!door.ok) return { code: door.code, reason: door.reason }
    if (spec.images && !door.images)
      return {
        code: 'FINISHER_DOOR_NO_IMAGES',
        reason: `The ${spec.label} door's model ${door.model} cannot read pictures, and the ${role} looks at page screenshots. Pick another model for the "${spec.label}" door in ${WHERE} (it is meant for ${DEFAULT_NAMED}).`
      }
  }
  return null
}

/** One call in a fresh conversation, at the model's bench harness (max effort on DeepSeek Flash). */
function askerOf({ providerId, baseUrl, apiKey, model }, fetchImpl) {
  const {
    modelProfile: _profile,
    budgetUsd: _budget,
    writeAfterToolTurns: _turns,
    images: _images,
    ...harness
  } = benchHarnessFor(model, providerId)
  return async ({ system, content }) => {
    const { answer, totals } = await runAgent({
      door: { baseUrl, apiKey, model },
      system,
      firstUser: content,
      fetchImpl,
      ...harness,
      maxTurns: 1
    })
    return {
      text: typeof answer === 'string' ? answer : JSON.stringify(answer),
      costUsd: totals?.cost ?? null
    }
  }
}

/**
 * The door of one role from /ops › Model & AI.
 * @param {{ pool: import('pg').Pool, secret?: string, role: 'finder' | 'fixer' | 'checker', fetchImpl?: typeof fetch }} input
 */
export async function finisherDoor({ pool, secret, role, fetchImpl = fetch }) {
  const spec = FINISHER_ROLES[role]
  const found = secret ? await lookupDoor(pool, spec.door, secret) : { state: 'unreadable' }
  const refuse = (suffix, reason) => ({ ok: false, code: `FINISHER_DOOR_${suffix}`, reason })
  if (found.state === 'unassigned' || (found.state === 'ok' && !found.credential?.model))
    return refuse(
      'UNSET',
      `The "${spec.label}" door has no provider and model. Set it in ${WHERE} (it runs on ${DEFAULT_NAMED}).`
    )
  if (found.state === 'disabled')
    return refuse(
      'DISABLED',
      `The provider of the "${spec.label}" door is switched off. Turn it on, or pick another provider in ${WHERE}.`
    )
  if (found.state !== 'ok')
    return refuse(
      'UNREADABLE',
      `The key of the "${spec.label}" door's provider cannot be opened. Save the key again in ${WHERE}.`
    )
  const { providerId, baseUrl, apiKey, model } = found.credential
  return {
    ok: true,
    label: spec.label,
    model,
    providerId,
    images: found.snapshot?.metadata?.vision !== false && sendsImages(model, providerId),
    snapshot: { door: spec.door, model, endpointHost: new URL(baseUrl).hostname, ...found.snapshot },
    ask: askerOf({ providerId, baseUrl, apiKey, model }, fetchImpl)
  }
}

/** The three doors of a finisher run, by role. */
export async function finisherDoors(input) {
  const entries = await Promise.all(
    Object.keys(FINISHER_ROLES).map(async (role) => [role, await finisherDoor({ ...input, role })])
  )
  return Object.fromEntries(entries)
}
