/**
 * The build model of the build chat's engine (#609): the `buildModel` door of `lib/llm-catalog.js` as the function the
 * WO package's steps call, `model({system, user, format, images?}) → reply text`. One door for the engine's text calls
 * and for its calls that look at pictures (`images`: picture addresses or `data:` URIs, sent as image parts of the
 * user message). Drawing pictures is another door.
 *
 * The door is resolved like every door of this process (`lib/llm-door.js`): the provider book first, the environment's
 * model only when nobody assigned the door, and nothing when an assigned provider cannot answer. Nothing to call is
 * `model_missing` with `noRerun`: the step stops and the team is told; the owner is never asked about it.
 */
import { modelForChain } from '../lib/llm-door.js'

/** The door's id in `LLM_DOORS`. */
export const BUILD_MODEL_DOOR = 'buildModel'
/** One call's own time limit: a needs profile or a plan is one JSON answer. */
const CALL_TIMEOUT_MS = 180_000

/** The error a step stops on when no build model is set. */
export function modelMissing() {
  return Object.assign(new Error('the build model door has no provider and model'), {
    code: 'model_missing',
    noRerun: true
  })
}

/**
 * The model function for one door credential.
 * @param {{apiKey: string, baseUrl: string, words: string}} door
 * @param {{fetchImpl?: typeof fetch}} [options]
 */
export function modelCallOf(door, { fetchImpl = fetch } = {}) {
  return async function buildModel({ system, user, format, images = [] }) {
    const content = images.length
      ? [{ type: 'text', text: user }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
      : user
    const res = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: door.words,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content }
        ],
        ...(format === 'json' ? { response_format: { type: 'json_object' } } : {})
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
    })
    const body = await res.json().catch(() => null)
    if (!res.ok)
      throw Object.assign(new Error(`the build model answered ${res.status}`), { code: 'model_call_failed' })
    const text = body?.choices?.[0]?.message?.content
    if (typeof text !== 'string')
      throw Object.assign(new Error('the build model answered no text'), { code: 'model_call_failed' })
    return text
  }
}

/**
 * The resolver the engine calls before each step: the model function, or `model_missing`.
 * @param {{pool: import('pg').Pool, config: {model: object | null, sessionSecret: string}, fetchImpl?: typeof fetch}} deps
 * @returns {() => Promise<Function>}
 */
export function buildModelDoor({ pool, config, fetchImpl }) {
  return async () => {
    const door = await modelForChain(pool, [BUILD_MODEL_DOOR], config)
    // A local runtime needs no key (`keyOptional`), so a door is missing only without an address or a model.
    if (!door?.baseUrl || !door.words) throw modelMissing()
    return modelCallOf(door, { fetchImpl })
  }
}
