// The finder's model door (#448, carried over from PR #426, its fixer and checker doors dropped):
// `finisherFinder`, set in /ops › Model & AI and meant for DeepSeek Flash on DeepSeek's own API (lib/bench-harness.js). It
// thinks at `max`, the finder's effort; a model that does not take it refuses with the levels it does take. Like the other
// doors it never falls back to the environment: an unset, disabled or unreadable door refuses with its reason
// (lib/door-ladder.js). The finder looks at screenshots, so a model that cannot read pictures refuses too.
//
// The door is `{ ok, label, model, providerId, snapshot, ask({ system, content }) => { text, costUsd, reasoning, usage } }`,
// or a refusal `{ ok: false, code, reason }`. Tests give scripted ones.
import { runAgent } from '../../lib/agent-over-door.js'
import { benchHarnessFor, effortsFor, sendsImages } from '../../lib/bench-harness.js'
import { cannotSeeReason, DOORS_WHERE, ladderRefusal, lookedUpDoor } from '../../lib/door-ladder.js'

export const FINDER_DOOR = 'finisherFinder'
export const FINDER_LABEL = 'Finisher finder'
export const FINDER_PROVIDER = 'deepseek'
export const FINDER_MODEL = 'deepseek-flash'
export const FINDER_EFFORT = 'max'

/** One call in a fresh conversation, at the model's bench harness and the finder's effort. */
function askerOf({ providerId, baseUrl, apiKey, model }, fetchImpl) {
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
      effort: FINDER_EFFORT,
      maxTurns: 1
    })
    const said = [...(turns ?? [])].reverse().find((t) => t?.state === 'answered')?.message
    const reasoning = said?.reasoning_content ?? said?.reasoning ?? null
    return {
      text: typeof answer === 'string' ? answer : JSON.stringify(answer),
      costUsd: totals?.cost ?? null,
      reasoning: typeof reasoning === 'string' ? reasoning : null,
      usage: totals ? { promptTokens: totals.promptTokens, completionTokens: totals.completionTokens } : null
    }
  }
}

/**
 * The finder's door from /ops › Model & AI.
 * @param {{ pool: import('pg').Pool, secret?: string, fetchImpl?: typeof fetch }} input
 */
export async function finderDoor({ pool, secret, fetchImpl = fetch }) {
  const found = await lookedUpDoor(pool, FINDER_DOOR, secret)
  const refused = ladderRefusal(found, {
    prefix: 'FINDER_DOOR',
    label: `"${FINDER_LABEL}"`,
    runsOn: `it runs on ${FINDER_MODEL} on the ${FINDER_PROVIDER} provider`
  })
  if (refused) return refused
  const { providerId, baseUrl, apiKey, model } = found.credential
  const takes = effortsFor(model, providerId)
  if (takes && !takes.includes(FINDER_EFFORT))
    return {
      ok: false,
      code: 'FINDER_DOOR_EFFORT_UNSUPPORTED',
      reason: `The "${FINDER_LABEL}" door's model ${model} does not take effort ${FINDER_EFFORT}; it takes ${takes.join(', ')}. Pick another model in ${DOORS_WHERE}.`
    }
  if (found.snapshot?.metadata?.vision === false || !sendsImages(model, providerId))
    return {
      ok: false,
      code: 'FINDER_DOOR_NO_IMAGES',
      reason: cannotSeeReason({
        said: `The "${FINDER_LABEL}" door's model ${model}`,
        label: `"${FINDER_LABEL}"`,
        sight: 'the finder looks at page screenshots'
      })
    }
  return {
    ok: true,
    label: FINDER_LABEL,
    model,
    providerId,
    snapshot: {
      door: FINDER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      ...found.snapshot,
      effortUsed: FINDER_EFFORT
    },
    ask: askerOf({ providerId, baseUrl, apiKey, model }, fetchImpl)
  }
}
