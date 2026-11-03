// The picture looker's door (#343, ADR 0043 section 3): the model that checks every finished picture, reached through
// its own door `pictureLooker` (by default openai/gpt-6-luna through OpenRouter, as the brand step's reviewer). It must
// be of another maker than the picker's model, so a picture is never judged by the kind of model that chose it.
//
// Like the icon ranker's, the door never stops a run: an unset, disabled or unreadable door, a model its provider says
// cannot read pictures, or a model of the picker's maker means no picture is looked at, and the manifest says why
// (`looker.note`). A run whose door is set records the door's snapshot (never the key) on the manifest.
import { lookupDoor } from '../lib/llm-store.js'

export const PICTURE_LOOKER_DOOR = 'pictureLooker'

/** The model the looker is meant to run on (OpenRouter id). Naming it here assigns nothing: a door is set in /ops. */
export const PICTURE_LOOKER_MODEL = 'openai/gpt-6-luna'

const LABEL = '"Picture looker"'

/**
 * Who made a model: the vendor prefix of an OpenRouter id ("openai/gpt-6-luna" is openai's), else the provider that
 * serves it ("deepseek-flash" on the deepseek provider is deepseek's).
 */
export function makerOf(providerId, model) {
  const id = String(model ?? '').toLowerCase()
  return id.includes('/') ? id.split('/')[0] : String(providerId ?? '').toLowerCase()
}

/**
 * The looker door, or null with the reason no picture is looked at.
 * @param {{ pool: import('pg').Pool, secret?: string, picker?: { providerId: string, model: string } | null }} input
 *   `picker`: the run's picker door, whose maker the looker must not share
 * @returns {Promise<{ door: { providerId: string, baseUrl: string, apiKey: string, model: string } | null,
 *   snapshot: object | null, note: string | null }>}
 */
export async function pictureLookerDoor({ pool, secret, picker = null }) {
  const found = secret ? await lookupDoor(pool, PICTURE_LOOKER_DOOR, secret) : { state: 'unassigned' }
  const none = (note) => ({ door: null, snapshot: null, note: `no picture was looked at: ${note}` })
  if (found.state !== 'ok')
    return none(`the ${LABEL} door is ${found.state} (set it in /ops, meant for ${PICTURE_LOOKER_MODEL})`)
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (!model) return none(`the ${LABEL} door names no model`)
  if (found.snapshot.metadata?.vision === false)
    return none(`the provider says ${model} cannot read pictures`)
  if (picker && makerOf(providerId, model) === makerOf(picker.providerId, picker.model))
    return none(
      `${model} is of the same maker as the picker's ${picker.model}; pick a model of another maker`
    )
  return {
    door: { providerId, baseUrl, apiKey, model },
    snapshot: {
      door: PICTURE_LOOKER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      ...found.snapshot
    },
    note: null
  }
}
