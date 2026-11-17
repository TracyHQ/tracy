/**
 * What one build model call really used and cost (#609), and the collector a step keeps for all its calls.
 *
 * The build model door (`build-model.js`) answers the reply text only, as the Website Opportunities steps expect, and
 * tells what the call used through an optional `onUsage(usage)` callback, once per call. This file makes that object
 * (`usageOf`) and sums a step's calls (`usageCollector`), so the engine can settle the step's ledger row at its real
 * cost (`engine-spend.js` `stepCostCents`), the same rule the brand step follows.
 *
 * 🔒 A COST IS NEVER MADE UP. `costCents` is a number only when the answer reported its tokens AND the price table
 * (`opportunities-build/quality-prices.json`, the table the quality model prices with: host checked, expiry checked)
 * lists that host and model. Otherwise it is `null`, and a step with one unpriced call keeps its ceiling.
 */
import { readFileSync } from 'node:fs'

const prices = JSON.parse(
  readFileSync(new URL('../opportunities-build/quality-prices.json', import.meta.url), 'utf8')
)

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null)

/** The price of one answer in cents (not rounded), or null when the host, the model, the date or the tokens are not known. */
function costOf({ host, model, inputTokens, outputTokens, cachedInputTokens, at }) {
  if (host !== prices.endpointHost || at >= Date.parse(prices.validUntil)) return null
  const rate = Object.hasOwn(prices.models, model) ? prices.models[model] : null
  if (!rate || inputTokens === null || outputTokens === null) return null
  // Cached tokens are priced at the cache rate only when the provider said how many there were; else all input is at
  // the full rate, the upper bound (the cache rate is lower).
  const hit = cachedInputTokens ?? 0
  if (hit > inputTokens) return null
  return (
    ((inputTokens - hit) * rate.inputCentsPerM +
      hit * rate.cacheCentsPerM +
      outputTokens * rate.outputCentsPerM) /
    1_000_000
  )
}

/**
 * The usage of one model call, normalised.
 * @param {{baseUrl: string, words: string}} door the credential the call was sent with
 * @param {{usage?: object, model?: string} | null} body the provider's JSON answer; null when the call got none
 * @param {{failed?: boolean, now?: () => number}} [options] `failed`: the call got no usable answer (its cost is unknown)
 * @returns {{provider: string, model: string, inputTokens: number | null, outputTokens: number | null,
 *   cachedInputTokens: number | null, costCents: number | null, failed?: true}} `provider`: the endpoint's host;
 *   `model`: the model the call asked for; tokens are null when the provider did not report them; `cachedInputTokens`
 *   is null when the provider does not say
 */
export function usageOf(door, body, { failed = false, now = Date.now } = {}) {
  let host = ''
  try {
    host = new URL(door.baseUrl).hostname
  } catch {}
  const u = !failed && body?.usage && typeof body.usage === 'object' ? body.usage : {}
  const inputTokens = count(u.prompt_tokens)
  const outputTokens = count(u.completion_tokens)
  const cachedInputTokens = count(u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens)
  const costCents = failed
    ? null
    : costOf({ host, model: door.words, inputTokens, outputTokens, cachedInputTokens, at: now() })
  return {
    provider: host,
    model: door.words,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costCents,
    ...(failed ? { failed: true } : {})
  }
}

/**
 * Collects the usage of every call of one step. Give `onUsage` to the door (`buildModelDoor()({onUsage})`), and put
 * `cost()` in the step's result: `{costCents}` when the step made calls and every one of them reported a cost, else
 * `{}` (the ledger then keeps the ceiling). A failed call counts as a call of unknown cost.
 */
export function usageCollector() {
  const calls = []
  return {
    onUsage: (usage) => void calls.push(usage),
    calls: () => calls.slice(),
    cost() {
      if (!calls.length || !calls.every((c) => Number.isFinite(c.costCents))) return {}
      return { costCents: calls.reduce((sum, c) => sum + c.costCents, 0) }
    }
  }
}

/**
 * What a step's model calls spent: `usd` when every call reported its cost, else null (the step chain then keeps its
 * own count); `knownUsd` the cost the calls did report; `calls` each call's model and tokens, never a word of it.
 */
export function spendOf(usage) {
  const calls = usage.calls()
  const known = calls.filter((c) => Number.isFinite(c.costCents)).reduce((sum, c) => sum + c.costCents, 0)
  const all = usage.cost()
  return {
    usd: Number.isFinite(all.costCents) ? all.costCents / 100 : null,
    knownUsd: known / 100,
    calls: calls.map(({ provider, model, inputTokens, outputTokens, failed }) => ({
      provider,
      model,
      inputTokens,
      outputTokens,
      ...(failed ? { failed: true } : {})
    }))
  }
}
