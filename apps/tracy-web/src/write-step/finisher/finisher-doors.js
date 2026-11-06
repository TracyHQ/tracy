// The finisher's three model doors (spec #418): `finisherFinder`, `finisherFixer` and `finisherChecker`, each set in
// /ops › Model & AI and meant for DeepSeek Flash on DeepSeek's own API (lib/bench-harness.js), like the planner, the writer
// and the picture picker. Each role thinks at its own reasoning effort (ADR 0044 decision 30): the effort set on its door in
// /ops, else its role's default: finder max, fixer high, checker high. The product owner chose medium for the fixer
// (2026-11-06); DeepSeek takes low, high and max only, so the fixer runs at high, the nearest level it takes. The checker
// was low until a real run saw it keep two spacing rules that left the words glued (#424). An effort the
// door's model does not take (lib/bench-harness.js MODEL_EFFORTS) refuses the run with the levels it does take. Like the
// other doors, a door never falls back to the environment: an unset, disabled or unreadable door refuses the run with its
// reason. The finder and the checker look at screenshots, so a model that cannot read pictures (its provider says so, or
// its harness profile sends none) refuses the run too.
//
// What the finisher is given for each role is a door object: { ok, label, model, providerId, images, snapshot,
// ask({ system, content }) => { text, costUsd, reasoning, usage } }, or a refusal { ok: false, code, reason }. Tests give scripted ones.
import { runAgent } from '../../lib/agent-over-door.js'
import { benchHarnessFor, effortsFor, sendsImages } from '../../lib/bench-harness.js'
import { cannotSeeReason, DOORS_WHERE, ladderRefusal, lookedUpDoor } from '../../lib/door-ladder.js'

export const FINISHER_PROVIDER = 'deepseek'
export const FINISHER_MODEL = 'deepseek-flash'

/** The roles, their door ids and labels, and what the role looks at when it looks at pictures (null when it does not). */
export const FINISHER_ROLES = Object.freeze({
  finder: Object.freeze({
    door: 'finisherFinder',
    label: 'Finisher finder',
    sight: 'the finder looks at page screenshots',
    effort: 'max'
  }),
  fixer: Object.freeze({ door: 'finisherFixer', label: 'Finisher fixer', sight: null, effort: 'high' }),
  checker: Object.freeze({
    door: 'finisherChecker',
    label: 'Finisher checker',
    sight: 'the checker compares crops of the repaired block',
    effort: 'high'
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

/** One call in a fresh conversation, at the model's bench harness and the role's effort. */
function askerOf({ providerId, baseUrl, apiKey, model, effort }, fetchImpl) {
  const {
    modelProfile: _profile,
    budgetUsd: _budget,
    writeAfterToolTurns: _turns,
    images: _images,
    ...harness
  } = benchHarnessFor(model, providerId)
  return async ({ system, content }) => {
    const { answer, totals, turns } = await runAgent({
      door: { baseUrl, apiKey, model },
      system,
      firstUser: content,
      fetchImpl,
      ...harness,
      effort,
      maxTurns: 1
    })
    // The model's own reasoning on the answered turn (DeepSeek's reasoning_content), kept so a person can audit what it saw.
    const said = [...(turns ?? [])].reverse().find((t) => t?.state === 'answered')?.message
    const reasoning = said?.reasoning_content ?? said?.reasoning ?? null
    return {
      text: typeof answer === 'string' ? answer : JSON.stringify(answer),
      costUsd: totals?.cost ?? null,
      reasoning: typeof reasoning === 'string' ? reasoning : null,
      usage: totals
        ? {
            promptTokens: totals.promptTokens,
            completionTokens: totals.completionTokens,
            cachedTokens: totals.cachedTokens,
            reasoningTokens: totals.reasoningTokens
          }
        : null
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
  // The effort set on the door in /ops, else the role's own default.
  const effort = found.snapshot?.effort ?? spec.effort
  const takes = effortsFor(model, providerId)
  if (takes && !takes.includes(effort))
    return {
      ok: false,
      code: 'FINISHER_DOOR_EFFORT_UNSUPPORTED',
      reason: `The "${spec.label}" door asks ${model} for effort ${effort}; it takes ${takes.join(', ')}. Pick one of them in ${DOORS_WHERE}.`
    }
  return {
    ok: true,
    label: spec.label,
    model,
    providerId,
    images: found.snapshot?.metadata?.vision !== false && sendsImages(model, providerId),
    snapshot: {
      door: spec.door,
      model,
      endpointHost: new URL(baseUrl).hostname,
      ...found.snapshot,
      effortUsed: effort
    },
    ask: askerOf({ providerId, baseUrl, apiKey, model, effort }, fetchImpl)
  }
}

/** The three doors of a finisher run, by role. */
export async function finisherDoors(input) {
  const entries = await Promise.all(
    Object.keys(FINISHER_ROLES).map(async (role) => [role, await finisherDoor({ ...input, role })])
  )
  return Object.fromEntries(entries)
}
