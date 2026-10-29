/**
 * The reading step of a place's research (#1780): what the business sells, who it is for, its team and its story, read
 * once per research run from the bio, posts and reviews already collected (`domain/business-reading.mjs`). The model is
 * the one /ops › Models & AI assigns to "WO editorial" (door `woEditorial`), and its call is reserved first on the research
 * cost ledger (provider `woEditorial`, purpose `business-reading`), the same way the menu-photo reading step pays.
 * 🔒 Without a model (none assigned, an unusable one, a failed, cut off, empty or unreadable answer, the budget spent) the
 * rules read what they can and the reading says why the model did not run; it never fails the research.
 * A run whose texts and model are those of the reading it holds keeps it and pays nothing.
 */
import { createHash } from 'node:crypto'
import {
  BUSINESS_READING_SYSTEM,
  BUSINESS_READING_VERSION,
  businessReadingPrompt,
  checkBusinessReading,
  readBusinessByRules,
  readingFactsOf,
  readingSourcesOf,
  withListedServiceParts,
  withPostOfferings
} from '../domain/business-reading.mjs'
import { BudgetExceededError } from './cost-ledger.js'
import { visionCostCents } from './cost-prices.js'
import { controlError } from './google-maps-research.js'
import { requireHost } from './host.js'
import { modelTokensOf } from './wo-model-tokens.js'

export const BUSINESS_READING_PURPOSE = 'business-reading'
/** The /ops model door the step reads with: Website Opportunities' editorial model. */
export const BUSINESS_READING_DOOR = 'woEditorial'
// A thinking model (DeepSeek's thinking mode) counts its reasoning in `max_tokens`. At 4k the reasoning alone used the
// whole budget on dev (26/10/2026, Harbour Sport Club: ledger settled at the ceiling) and the JSON answer was cut off.
// The editorial model's own client (`opportunities-build/editorial-model.js`) allows 12k for the same reason.
const MAX_OUTPUT_TOKENS = 12_000
const CALL_MS = 120_000
const EFFORT = 'low'
const EFFORT_OFF = 'off'

/**
 * What the door gives this step, from `lookupDoor`'s answer (pure): `ready` with the call's credential, or why not.
 * `effort` is `low` when the provider takes one, `off` when the assignment turned reasoning off, else null.
 * @returns {{state: 'ready', door: {url: string, key: string, model: string, effort: string | null}}
 *   | {state: 'not_configured' | 'unavailable', reason?: string}}
 */
export function businessReadingDoorOf(found, host) {
  if (!found || found.state === 'unassigned') return { state: 'not_configured' }
  if (found.state !== 'ok') return { state: 'unavailable', reason: `provider_${found.state}` }
  const { apiKey, baseUrl, model } = found.credential
  const { effortOptions } = requireHost(host, ['effortOptions'])
  const options = effortOptions({
    presetId: found.snapshot?.presetId,
    baseUrl,
    metadata: found.snapshot?.metadata
  })
  return {
    state: 'ready',
    door: {
      url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
      key: apiKey,
      model,
      effort:
        options.parameter !== 'reasoning_effort'
          ? null
          : found.snapshot?.effort === EFFORT_OFF
            ? EFFORT_OFF
            : options.choices.includes(EFFORT)
              ? EFFORT
              : null
    }
  }
}

/** The door of the operator's assignment (`host.lookupDoor`). */
export async function businessReadingDoorFor(pool, secret, host) {
  const { lookupDoor } = requireHost(host, ['lookupDoor', 'effortOptions'])
  return businessReadingDoorOf(await lookupDoor(pool, BUSINESS_READING_DOOR, secret), host)
}

/** How a reading was made: the rule and prompt version, and the model with its effort. */
export function businessReadingVersion(door) {
  const model = door ? `${door.model}|${door.effort ?? 'default'}` : 'rules'
  const hash = createHash('sha256')
    .update([BUSINESS_READING_VERSION, BUSINESS_READING_SYSTEM, model].join('\n'))
    .digest('hex')
  return `${BUSINESS_READING_VERSION}-${hash.slice(0, 12)}`
}

const inputHashOf = (sources, name, trade, facts) =>
  createHash('sha256')
    .update(JSON.stringify([name ?? null, trade ?? null, sources, ...(facts.length ? [facts] : [])]))
    .digest('hex')
    .slice(0, 24)

/** The most one reading may cost, in cents: its prompt (about 3 characters a token) and the longest answer. */
export const businessReadingCeilingCents = (model, prompt) =>
  visionCostCents(model, {
    promptTokens: Math.ceil(String(prompt).length / 3) + 1_000,
    completionTokens: MAX_OUTPUT_TOKENS
  })

/**
 * Read a business. `held`: the reading the place holds (kept when its texts and version are these). `charge(spec, call)`
 * reserves the call on the ledger. Never throws for the model's sake: the rules answer instead, with the reason.
 * `googleTypes` and `categories` (each social profile's own category, `{source, text}`) are what the sub-trade may
 * quote besides the texts (`readingFactsOf`).
 * @param {{bio?: string | null, posts?: any[], reviews?: any[], name?: string | null, trade?: string | null,
 *   googleTypes?: string[], categories?: {source: string, text: string}[],
 *   door: {state: string, door?: any, reason?: string}, held?: any,
 *   charge: (spec: object, call: () => Promise<any>) => Promise<any>, fetchImpl?: typeof fetch, now?: () => number,
 *   log?: any}} input
 * @returns {Promise<object | null>} the reading, or null when there is no text to read
 */
export async function readBusiness({
  bio = null,
  posts = [],
  reviews = [],
  name = null,
  trade = null,
  googleTypes = [],
  categories = [],
  door,
  held = null,
  charge,
  fetchImpl = fetch,
  now = Date.now,
  log = console
}) {
  const sources = readingSourcesOf({ bio, posts, reviews })
  if (!sources.length) return null
  const ready = door?.state === 'ready' ? door.door : null
  const version = businessReadingVersion(ready)
  const facts = readingFactsOf({ googleTypes, categories })
  const inputHash = inputHashOf(sources, name, trade, facts)
  // A held reading made before joined service lines kept every part gets them now, paying nothing (F10).
  if (held?.method === 'model' && held.version === version && held.inputHash === inputHash)
    return {
      ...held,
      uspThemes: held.uspThemes?.length ? held.uspThemes : null,
      ...(!held.uspThemes?.length ? { uspThemesReason: held.uspThemesReason ?? 'not_recorded' } : {}),
      services: withPostOfferings(withListedServiceParts(held.services, sources), sources)
    }
  const at = new Date(now()).toISOString()
  const rules = (reason, extra = {}) => ({
    version: businessReadingVersion(null),
    method: 'rules',
    reason,
    inputHash,
    at,
    ...readBusinessByRules(sources),
    uspThemes: null,
    uspThemesReason: `rules_${reason}`,
    ...extra
  })
  if (!ready) return rules(door?.state === 'unavailable' ? 'unavailable' : 'not_configured')
  const prompt = businessReadingPrompt(sources, { name, trade, facts })
  let answer
  try {
    answer = await charge(
      {
        operation: ready.model,
        maxCents: businessReadingCeilingCents(ready.model, prompt),
        actualCents: (r) =>
          visionCostCents(ready.model, {
            promptTokens: r.promptTokens,
            completionTokens: r.completionTokens
          }),
        tokens: (r) => modelTokensOf([r.usage])
      },
      () => askText({ door: ready, system: BUSINESS_READING_SYSTEM, text: prompt, fetchImpl })
    )
  } catch (error) {
    if (error instanceof BudgetExceededError) return rules('budget')
    if (controlError(error)) throw error
    log.warn?.('wo business reading failed', { error: error?.message })
    return rules('failed')
  }
  // Why the answer could not be read, told apart: cut off by the token limit, empty, or not the contract's JSON.
  if (answer.finishReason === 'length') return rules('truncated', { model: ready.model })
  if (!String(answer.text ?? '').trim()) return rules('empty', { model: ready.model })
  const read = checkBusinessReading(answer.text, sources, { trade, facts })
  if (!read) return rules('unreadable', { model: ready.model })
  return { version, method: 'model', model: ready.model, inputHash, at, ...read }
}

/** One chat completion asking for JSON, as `askVision` does without a picture. */
async function askText({ door, system, text, fetchImpl }) {
  const res = await fetchImpl(door.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${door.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: door.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(door.effort === EFFORT_OFF
        ? { thinking: { type: 'disabled' } }
        : door.effort
          ? { reasoning_effort: door.effort }
          : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text }
      ]
    }),
    signal: AbortSignal.timeout(CALL_MS)
  })
  if (!res.ok)
    throw Object.assign(new Error(`the editorial model answered ${res.status}`), {
      code: `LLM_HTTP_${res.status}`
    })
  const body = await res.json()
  return {
    text: body?.choices?.[0]?.message?.content ?? '',
    // `length`: the answer hit `max_tokens` (on a thinking model, often inside the reasoning) and is incomplete.
    finishReason: body?.choices?.[0]?.finish_reason ?? null,
    promptTokens: Number(body?.usage?.prompt_tokens) || 0,
    completionTokens: Number(body?.usage?.completion_tokens) || 0,
    usage: body?.usage ?? null,
    requestId: body?.id ?? null
  }
}
