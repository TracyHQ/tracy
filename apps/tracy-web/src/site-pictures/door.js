// The picture bench's picker door (#342): the credential a run spends, or a refusal with its reason. Like the planner's
// and the writer's doors it never falls back to the environment: an unset, disabled or unreadable door stops the run
// and says why. The picker reads the owner photos by sight, so a model its provider says cannot read pictures is
// refused.
import { cannotSeeReason, DOORS_WHERE as WHERE } from '../lib/door-ladder.js'
import { lookupDoor } from '../lib/llm-store.js'

export const PICTURE_PICKER_DOOR = 'picturePicker'

/** The picker's default model: DeepSeek Flash on DeepSeek's own API, at max effort (lib/bench-harness.js). */
export const PICTURE_PICKER_PROVIDER = 'deepseek'
export const PICTURE_PICKER_MODEL = 'deepseek-flash'
const DEFAULT_NAMED = `${PICTURE_PICKER_MODEL} on the ${PICTURE_PICKER_PROVIDER} provider`

const REFUSALS = {
  unassigned: [
    'SITE_PICTURES_DOOR_UNSET',
    `The "Picture picker" door has no provider and model. Set it in ${WHERE} (the picker runs on ${DEFAULT_NAMED}).`
  ],
  disabled: [
    'SITE_PICTURES_DOOR_DISABLED',
    `The provider of the "Picture picker" door is switched off. Turn it on, or pick another provider in ${WHERE}.`
  ],
  unreadable: [
    'SITE_PICTURES_DOOR_UNREADABLE',
    `The key of the "Picture picker" door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${WHERE}.`
  ]
}

/**
 * @param {{ pool: import('pg').Pool, secret: string }} input
 * @returns {Promise<
 *   | { ok: true, door: { providerId: string, baseUrl: string, apiKey: string, model: string }, snapshot: object }
 *   | { ok: false, code: string, reason: string }
 * >} `snapshot` is what a run stores: which provider, model and assignment revision it used, never the key.
 */
export async function picturePickerDoor({ pool, secret }) {
  const found = await lookupDoor(pool, PICTURE_PICKER_DOOR, secret)
  if (found.state !== 'ok') {
    const [code, reason] = REFUSALS[found.state] ?? REFUSALS.unreadable
    return { ok: false, code, reason }
  }
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (!model)
    return {
      ok: false,
      code: 'SITE_PICTURES_DOOR_UNSET',
      reason: `The "Picture picker" door names no model. Set it in ${WHERE} (the picker runs on ${DEFAULT_NAMED}).`
    }
  if (found.snapshot.metadata?.vision === false)
    return {
      ok: false,
      code: 'SITE_PICTURES_MODEL_LACKS',
      reason: cannotSeeReason({
        said: `The provider says ${model}`,
        label: '"Picture picker"',
        sight: 'the picker looks at the owner photos'
      })
    }
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    snapshot: {
      door: PICTURE_PICKER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      images: true,
      ...found.snapshot
    }
  }
}
