// The site writer bench's model door (#329): the credential a run spends, or a refusal with its reason. Like the
// planner's door it never falls back to the environment: an unset, disabled or unreadable door stops the run and says
// why, because a bench run on a model nobody chose would not measure the prompt it claims to measure. The writer
// keeps historical text-only input; a frozen WO visual policy requires tool calls and actual pictures.
import { lookupDoor } from '../lib/llm-store.js'

export const SITE_WRITER_DOOR = 'siteWriter'

/** The writer's default model: DeepSeek Flash on DeepSeek's own API, at max effort (lib/bench-harness.js). */
export const SITE_WRITER_PROVIDER = 'deepseek'
export const SITE_WRITER_MODEL = 'deepseek-flash'
const DEFAULT_NAMED = `${SITE_WRITER_MODEL} on the ${SITE_WRITER_PROVIDER} provider`

const WHERE = '/ops › Model & AI'

const REFUSALS = {
  unassigned: [
    'SITE_WRITER_DOOR_UNSET',
    `The "Site writer" door has no provider and model. Set it in ${WHERE} (the writer runs on ${DEFAULT_NAMED}).`
  ],
  disabled: [
    'SITE_WRITER_DOOR_DISABLED',
    `The provider of the "Site writer" door is switched off. Turn it on, or pick another provider in ${WHERE}.`
  ],
  unreadable: [
    'SITE_WRITER_DOOR_UNREADABLE',
    `The key of the "Site writer" door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${WHERE}.`
  ]
}

/**
 * @param {{ pool: import('pg').Pool, secret: string }} input
 * @returns {Promise<
 *   | { ok: true, door: { providerId: string, baseUrl: string, apiKey: string, model: string }, snapshot: object }
 *   | { ok: false, code: string, reason: string }
 * >} `snapshot` is what a run stores: which provider, model and assignment revision it used, never the key.
 */
export async function siteWriterDoor({ pool, secret, requireImages = false }) {
  const found = await lookupDoor(pool, SITE_WRITER_DOOR, secret)
  if (found.state !== 'ok') {
    const [code, reason] = REFUSALS[found.state] ?? REFUSALS.unreadable
    return { ok: false, code, reason }
  }
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (!model)
    return {
      ok: false,
      code: 'SITE_WRITER_DOOR_UNSET',
      reason: `The "Site writer" door names no model. Set it in ${WHERE} (the writer runs on ${DEFAULT_NAMED}).`
    }
  if (
    requireImages &&
    (found.snapshot.metadata?.vision === false || found.snapshot.metadata?.tools === false)
  )
    return {
      ok: false,
      code: 'SITE_WRITER_MODEL_LACKS',
      reason: 'This writer run requires a model that reads pictures and calls tools.'
    }
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    snapshot: {
      door: SITE_WRITER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      images: requireImages,
      ...found.snapshot
    }
  }
}
