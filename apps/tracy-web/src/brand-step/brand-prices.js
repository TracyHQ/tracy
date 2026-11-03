// What a brand model call costs when its provider sends no cost figure (brand step trial bench, #320). The cap
// counts every call, so a call with no cost figure must not count as 0: its cost is computed from its token usage at
// the model's price and the row is marked `cost_estimated`; with no usable token count either, it counts the price's
// per-call ceiling. A model with no price here is refused before anything is sent (fail closed): without a price an
// answer that carries no cost cannot be counted.
// The provider's own cost always wins when it sends one. Prices are USD per million tokens, matched on the model id
// without its vendor prefix.
//   deepseek flash: DeepSeek's pricing page at the peak rate (site-planner/bench-control.js, read 03/11/2026).
//   gpt-6-luna and the picture model: CEILINGS, not list prices. No pricing page was read for them on 03/11/2026, so
//   they are set above the usual rate of their class, so that an estimate overcounts toward the cap. Replace them with
//   list prices when someone reads them.
import { costOf, usageOf } from '../lib/agent-over-door-wire.js'
import { DEEPSEEK_FLASH_PRICE } from '../site-planner/bench-control.js'

const price = (inputCacheHit, inputCacheMiss, output, callCeiling) => ({
  inputCacheHit,
  inputCacheMiss,
  output,
  callCeiling
})

export const BRAND_PRICES = Object.freeze([
  { match: /^deepseek-(v4\.1-)?flash/, price: { ...DEEPSEEK_FLASH_PRICE.peak, callCeiling: 0.25 } },
  { match: /^gpt-6-luna/, price: price(0.5, 5, 30, 0.25) },
  { match: /^gemini-3\.1-flash-lite-image/, price: price(0.1, 1, 60, 0.15) }
])

const bare = (model) =>
  String(model ?? '')
    .toLowerCase()
    .split('/')
    .at(-1)

/** The price of a model, or null when the table does not know it. */
export function priceFor(model, table = BRAND_PRICES) {
  return table.find((entry) => entry.match.test(bare(model)))?.price ?? null
}

const round = (usd) => Math.round(usd * 1e9) / 1e9

/**
 * The cost of one answer: what the provider reported, else the tokens at the price, else the per-call ceiling.
 * @param {object | null | undefined} usage the provider's usage object (prompt_tokens, completion_tokens, cost, ...)
 * @returns {{ cost: number, estimated: boolean }}
 */
export function costOfCall(usage, priceOfModel) {
  const reported = costOf(usage)
  if (reported !== null) return { cost: reported, estimated: false }
  const t = usageOf(usage)
  if (t.promptTokens + t.completionTokens > 0)
    return { cost: costOf(usage, priceOfModel) ?? priceOfModel.callCeiling, estimated: true }
  return { cost: priceOfModel.callCeiling, estimated: true }
}

/** The same for an agent turn, whose usage the loop already normalised (promptTokens, cachedTokens, ...). */
export function costOfTurn(usage, priceOfModel) {
  const prompt = usage?.promptTokens ?? 0
  const completion = usage?.completionTokens ?? 0
  if (prompt + completion === 0) return priceOfModel.callCeiling
  const hit = Math.min(usage.cachedTokens ?? 0, prompt)
  return round(
    (hit * priceOfModel.inputCacheHit +
      (prompt - hit) * priceOfModel.inputCacheMiss +
      completion * priceOfModel.output) /
      1e6
  )
}
