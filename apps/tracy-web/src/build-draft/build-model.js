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
import { retryAfterMs, withRetries } from '../lib/agent-over-door-retry.js'
import { usageOf } from './model-usage.js'

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
 * The error of one attempt as the step chain's retry reads it (`lib/agent-over-door-retry.js` `isTransient`): its door
 * code beside the error the caller sees, which keeps its own code and message.
 */
function retryable(error, code, extra = {}) {
  const own = error instanceof Error ? error : new Error(String(error))
  return Object.assign(new Error(own.message), { code, cause: own, ...extra })
}

/** The error the caller sees: the attempt's own, with the failed attempts before it (`retries`). */
const unwrapped = (error) =>
  error?.cause instanceof Error ? Object.assign(error.cause, { retries: error.retries ?? [] }) : error

/**
 * The model function for one door credential. It answers the reply text, as ever. What each call used and cost is told
 * to an optional `onUsage(usage)` (`model-usage.js` `usageOf`), once per call that was sent: the one given here for
 * every call of this function, and the one in the call's own argument, `model({system, user, onUsage})`, for that call.
 * A callback that throws never fails the call.
 *
 * A call that fails on a transient provider error is sent again, the step chain's door rule (`agent-over-door-retry.js`,
 * five attempts with backoff, the provider's Retry-After first): a timeout, a network error, HTTP 408, 409, 425, 429,
 * 500, 502, 503, 504 or 529, a body that is not JSON, or an error object whose code or words say busy. Any other
 * failure fails at once. Every attempt that went out is told to `onUsage`.
 * @param {{apiKey: string, baseUrl: string, words: string}} door
 * @param {{fetchImpl?: typeof fetch, onUsage?: (usage: object) => void, now?: () => number,
 *   retry?: {policy?: object, sleep?: (ms: number) => Promise<void>, random?: () => number}}} [options] `retry`: the
 *   options of `withRetries` (a test passes its own `sleep`)
 */
export function modelCallOf(door, { fetchImpl = fetch, onUsage: forAll, now, retry = {} } = {}) {
  return async function buildModel({ system, user, format, images = [], onUsage: forThis } = {}) {
    const report = (body, failed) => {
      const usage = usageOf(door, body, { failed, ...(now ? { now } : {}) })
      for (const tell of [forAll, forThis])
        try {
          tell?.(usage)
        } catch {}
    }
    const content = images.length
      ? [{ type: 'text', text: user }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
      : user
    const request = {
      method: 'POST',
      headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: door.words,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content }
        ],
        ...(format === 'json' ? { response_format: { type: 'json_object' } } : {})
      })
    }
    // One attempt: the reply text, or an error whose `retry` (the step chain's door codes) says what went wrong.
    const attempt = async () => {
      let res
      try {
        res = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          ...request,
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
        })
      } catch (error) {
        // A call that went out and got no answer may still have been billed: its cost is unknown.
        report(null, true)
        throw retryable(error, error?.name === 'TimeoutError' ? 'AGENT_TIMEOUT' : 'AGENT_NETWORK')
      }
      const raw = await res.text().catch(() => '')
      let body = null
      try {
        body = JSON.parse(raw)
      } catch {}
      if (!res.ok) {
        report(null, true)
        const failed = Object.assign(new Error(`the build model answered ${res.status}`), {
          code: 'model_call_failed'
        })
        throw retryable(failed, 'AGENT_PROVIDER_HTTP', {
          status: res.status,
          retryAfterMs: retryAfterMs(res.headers?.get?.('retry-after'))
        })
      }
      if (body === null) {
        report(null, true)
        const cut = Object.assign(new Error('the build model answered no JSON'), {
          code: 'model_call_failed'
        })
        throw retryable(cut, 'AGENT_PROVIDER_JSON')
      }
      // An answer with no usable text was billed all the same: its usage is told before the call is refused.
      report(body, false)
      const providerError = body?.error
      if (
        providerError &&
        typeof providerError === 'object' &&
        typeof body?.choices?.[0]?.message?.content !== 'string'
      ) {
        const said = Object.assign(new Error('the build model answered an error'), {
          code: 'model_call_failed'
        })
        throw retryable(said, 'AGENT_PROVIDER_ERROR', {
          providerCode: providerError.code ?? providerError.type,
          reason: providerError.message
        })
      }
      const text = body?.choices?.[0]?.message?.content
      if (typeof text !== 'string')
        throw Object.assign(new Error('the build model answered no text'), { code: 'model_call_failed' })
      return text
    }
    try {
      return (await withRetries(attempt, retry)).answer
    } catch (error) {
      throw unwrapped(error)
    }
  }
}

/**
 * The resolver the engine calls before each step: the model function, or `model_missing`.
 * @param {{pool: import('pg').Pool, config: {model: object | null, sessionSecret: string}, fetchImpl?: typeof fetch}} deps
 * @returns {(options?: {onUsage?: (usage: object) => void}) => Promise<Function>}
 */
export function buildModelDoor({ pool, config, fetchImpl }) {
  // `onUsage`: told what each call of the returned function used and cost (a step's own collector, `model-usage.js`).
  return async ({ onUsage } = {}) => {
    const door = await modelForChain(pool, [BUILD_MODEL_DOOR], config)
    // A local runtime needs no key (`keyOptional`), so a door is missing only without an address or a model.
    if (!door?.baseUrl || !door.words) throw modelMissing()
    return modelCallOf(door, { fetchImpl, onUsage })
  }
}
