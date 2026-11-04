// The picture looker's door (#343, ADR 0043 section 3): the model that checks every finished picture, reached through
// its own door `pictureLooker` (by default openai/gpt-6-luna through OpenRouter, as the brand step's reviewer). It must
// be of another maker than the picker's model, so a picture is never judged by the kind of model that chose it.
//
// The looker is mandatory: like the picker's door, an unset, disabled or unreadable door, a model its provider says
// cannot read pictures, or a model of the picker's maker refuses the run at its start and again when a worker claims it,
// with the reason. A run records the door's snapshot (never the key) beside the picker's (`door.looker`).
import { lookupDoor } from '../lib/llm-store.js'

export const PICTURE_LOOKER_DOOR = 'pictureLooker'

/** The model the looker is meant to run on (OpenRouter id). Naming it here assigns nothing: a door is set in /ops. */
export const PICTURE_LOOKER_MODEL = 'openai/gpt-6-luna'

const LABEL = '"Picture looker"'
const WHERE = '/ops › Model & AI'

/**
 * Who made a model: the vendor prefix of an OpenRouter id ("openai/gpt-6-luna" is openai's), else the provider that
 * serves it ("deepseek-flash" on the deepseek provider is deepseek's).
 */
export function makerOf(providerId, model) {
  const id = String(model ?? '').toLowerCase()
  return id.includes('/') ? id.split('/')[0] : String(providerId ?? '').toLowerCase()
}

/**
 * The looker door, or a refusal with its code and reason.
 * @param {{ pool: import('pg').Pool, secret?: string, picker?: { providerId: string, model: string } | null }} input
 *   `picker`: the run's picker door, whose maker the looker must not share
 * @returns {Promise<
 *   | { ok: true, door: { providerId: string, baseUrl: string, apiKey: string, model: string }, snapshot: object }
 *   | { ok: false, code: string, reason: string }
 * >} `snapshot` is what a run stores: which provider, model and assignment revision it used, never the key.
 */
export async function pictureLookerDoor({ pool, secret, picker = null }) {
  const found = secret ? await lookupDoor(pool, PICTURE_LOOKER_DOOR, secret) : { state: 'unreadable' }
  const refuse = (suffix, reason) => ({ ok: false, code: `SITE_PICTURES_LOOKER_${suffix}`, reason })
  if (found.state === 'unassigned' || (found.state === 'ok' && !found.credential?.model))
    return refuse(
      'UNSET',
      `The ${LABEL} door has no provider and model. Set it in ${WHERE} (the looker runs on ${PICTURE_LOOKER_MODEL}).`
    )
  if (found.state === 'disabled')
    return refuse(
      'DISABLED',
      `The provider of the ${LABEL} door is switched off. Turn it on, or pick another provider in ${WHERE}.`
    )
  if (found.state !== 'ok')
    return refuse(
      'UNREADABLE',
      `The key of the ${LABEL} door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${WHERE}.`
    )
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (found.snapshot.metadata?.vision === false)
    return refuse(
      'MODEL_LACKS',
      `The provider says ${model} cannot read pictures, and the looker checks every picture by sight. Pick another model for the ${LABEL} door in ${WHERE}.`
    )
  if (picker && makerOf(providerId, model) === makerOf(picker.providerId, picker.model))
    return refuse(
      'SAME_MAKER',
      `${model} is of the same maker as the picker's ${picker.model}. Pick a model of another maker for the ${LABEL} door in ${WHERE}.`
    )
  return {
    ok: true,
    door: { providerId, baseUrl, apiKey, model },
    snapshot: {
      door: PICTURE_LOOKER_DOOR,
      model,
      endpointHost: new URL(baseUrl).hostname,
      ...found.snapshot
    }
  }
}

/**
 * The looker door of a claimed run: the one it was started with (the same provider, model and endpoint, `started`), or
 * a refusal.
 */
export async function runLookerDoor({ pool, secret, picker = null }, started) {
  const door = await pictureLookerDoor({ pool, secret, picker })
  if (!door.ok) return door
  const same = ['providerId', 'model', 'endpointHost'].every((k) => door.snapshot[k] === started?.[k])
  if (!same)
    return {
      ok: false,
      code: 'SITE_PICTURES_LOOKER_CHANGED',
      reason: `the looker door now uses ${door.snapshot.providerId} ${door.snapshot.model}, the run was started on ${started?.providerId} ${started?.model}`
    }
  return door
}
