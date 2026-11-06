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
import { cannotSeeReason, ladderRefusal, lookedUpDoor } from '../../lib/door-ladder.js'

export const FINISHER_PROVIDER = 'deepseek'
export const FINISHER_MODEL = 'deepseek-flash'

/** The roles, their door ids and labels, and what the role looks at when it looks at pictures (null when it does not). */
export const FINISHER_ROLES = Object.freeze({
  finder: Object.freeze({
    door: 'finisherFinder',
    label: 'Finisher finder',
    sight: 'the finder looks at page screenshots'
  }),
  fixer: Object.freeze({ door: 'finisherFixer', label: 'Finisher fixer', sight: null }),
  checker: Object.freeze({
    door: 'finisherChecker',
    label: 'Finisher checker',
    sight: 'the checker compares crops of the repaired block'
  })
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
    // The one place a finisher door that cannot read pictures is refused: its provider says so, or its harness sends none.
    if (spec.sight && !door.images)
      return {
        code: 'FINISHER_DOOR_NO_IMAGES',
        reason: cannotSeeReason({
          said: `The "${spec.label}" door's model ${door.model}`,
          label: `"${spec.label}"`,
          sight: spec.sight
        })
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
  const found = await lookedUpDoor(pool, spec.door, secret)
  const refused = ladderRefusal(found, {
    prefix: 'FINISHER_DOOR',
    label: `"${spec.label}"`,
    runsOn: `it runs on ${DEFAULT_NAMED}`
  })
  if (refused) return refused
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
