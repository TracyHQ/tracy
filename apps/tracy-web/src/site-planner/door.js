// The site planner bench's model door (ADR 0041, #301): the credential a run spends, or a refusal with its reason.
// Unlike modelForDoor it never falls back to the environment: an unset, disabled or unreadable door stops the run
// and says why, because a bench run on a model nobody chose would not measure the prompt it claims to measure.
import { doorEntry } from '../lib/llm-catalog.js'
import { lookupDoor } from '../lib/llm-store.js'
import { looksMissingOf } from '../lib/template-kit/reader.js'

export const SITE_PLANNER_DOOR = 'sitePlanner'

/**
 * The model the bench's planner runs on (ADR 0041 amendment): DeepSeek V4 Pro on DeepSeek's own API, for its cost. It
 * reads no pictures, so it plans a kit only from complete looks (below). Claude Sonnet 5.5 and Opus 5.5 through
 * OpenRouter still run as alternatives. The door is still set in /ops; an unset door names this provider and model.
 */
export const SITE_PLANNER_PROVIDER = 'deepseek'
export const SITE_PLANNER_MODEL = 'deepseek-v4-pro'
const DEFAULT_NAMED = `${SITE_PLANNER_MODEL} on the ${SITE_PLANNER_PROVIDER} provider`

const WHERE = '/ops › Model & AI'

const REFUSALS = {
  unassigned: [
    'SITE_PLANNER_DOOR_UNSET',
    `The "Site planner" door has no provider and model. Set it in ${WHERE} (the planner runs on ${DEFAULT_NAMED}).`
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
 * A model that cannot read pictures may still plan, from text alone, a kit whose every packed 1440 shot has a current
 * look (ADR 0041 amendment, lib/template-kit/reader.js looksMissingOf): the looks stand in for the images. Such a run
 * is offered no image tool, and its snapshot records `images: false`.
 * @param {{ pool: import('pg').Pool, secret: string, kit?: { ref: string, doc: any } | null,
 *   sendsImages?: (model: string, providerId: string) => boolean }} input `kit`: the kit the run plans; without it a
 *   model that cannot read pictures is refused. `sendsImages`: false when the run's harness never sends images to this
 *   model (a text-only profile), which then needs the same complete looks.
 * @returns {Promise<
 *   | { ok: true, door: { providerId: string, baseUrl: string, apiKey: string, model: string }, snapshot: object }
 *   | { ok: false, code: string, reason: string, lacking?: string[] }
 * >} `snapshot` is what a run stores: which provider, model and assignment revision it used, whether the model was
 *   given images, never the key.
 */
export async function sitePlannerDoor({ pool, secret, kit = null, sendsImages = () => true }) {
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
      reason: `The "Site planner" door names no model. Set it in ${WHERE} (the planner runs on ${DEFAULT_NAMED}).`
    }
  // Refuse only what the provider says is missing; an unlisted model passes, as on assignment (ops/llm.js).
  const metadata = found.snapshot.metadata
  const { requires, prefers } = doorEntry(SITE_PLANNER_DOOR)
  const lacking = [...requires, ...prefers].filter((cap) => metadata?.[cap] === false)
  const lacks = (reason) => ({ ok: false, code: 'SITE_PLANNER_MODEL_LACKS', lacking, reason })
  const pick = `Pick another model for the "Site planner" door in ${WHERE}.`
  const blind = lacking.includes('vision')
  const images = !blind && sendsImages(model, providerId)
  // Tool calls have no stand-in; reading pictures does, when the kit has a look for every shot.
  if (lacking.some((cap) => cap !== 'vision') || (blind && !kit))
    return lacks(
      `The provider says ${model} cannot do ${lacking.map((cap) => NEEDS[cap] ?? cap).join(' or ')}. ${pick}`
    )
  if (!images) {
    const missing = looksMissingOf(kit?.doc)
    if (!kit || missing.length) {
      const why = blind
        ? `The provider says ${model} cannot do reading pictures`
        : `${model} is given no pictures`
      const named = missing.slice(0, 3).map((m) => m.id)
      const more = missing.length > named.length ? ', ...' : ''
      return {
        ...lacks(
          kit
            ? `${why}, and the kit ${kit.ref} has no current look for ${missing.length} of its 1440 shots (${named.join(', ')}${more}), so it cannot be planned from text. Give the kit its looks, or pick another model for the "Site planner" door in ${WHERE}.`
            : `${why}, and no kit was named to plan from looks. ${pick}`
        ),
        lacking: ['vision']
      }
    }
  }
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    snapshot: {
      door: SITE_PLANNER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      images,
      ...found.snapshot
    }
  }
}
