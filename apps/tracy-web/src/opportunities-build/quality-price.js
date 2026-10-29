/** Price freshness changes accounting evidence, never feature availability. */
import { readFileSync } from 'node:fs'
import { visionCostCents } from 'website-opportunities/src/cost-prices.js'

const prices = JSON.parse(readFileSync(new URL('./quality-prices.json', import.meta.url)))

/** Unknown rates follow research's existing UNVERIFIED policy, with no cache discount or claimed actual cost. */
export function boundedQualityPrice(price, { now = Date.now } = {}) {
  const reviewAfter = price?.reviewAfter ?? price?.validUntil
  if (
    price &&
    ['inputCentsPerM', 'cacheCentsPerM', 'outputCentsPerM', 'maxImageTokens'].every(
      (key) => Number.isFinite(price[key]) && price[key] >= 0
    ) &&
    (!reviewAfter || now() < Date.parse(reviewAfter))
  )
    return price
  return {
    ...price,
    inputCentsPerM: Math.max(
      price?.inputCentsPerM ?? 0,
      visionCostCents('unknown', { promptTokens: 1_000_000, completionTokens: 0 })
    ),
    cacheCentsPerM: Math.max(
      price?.inputCentsPerM ?? 0,
      visionCostCents('unknown', { promptTokens: 1_000_000, completionTokens: 0 })
    ),
    outputCentsPerM: Math.max(
      price?.outputCentsPerM ?? 0,
      visionCostCents('unknown', { promptTokens: 0, completionTokens: 1_000_000 })
    ),
    maxImageTokens: price?.maxImageTokens ?? prices.maxImageTokens,
    costBasis: 'unverified-conservative-upper-bound',
    warning:
      'Model price is missing or due for review. Calls reserve the conservative research rate; actual spend remains unknown.'
  }
}

export function qualityPriceFor(host, model, { now = Date.now } = {}) {
  const rate = prices.endpointHost === host ? prices.models[model] : null
  return boundedQualityPrice(
    rate
      ? {
          ...rate,
          source: prices.source,
          verifiedAt: prices.verifiedAt,
          reviewAfter: prices.reviewAfter,
          maxImageTokens: prices.maxImageTokens,
          costBasis: 'verified-peak-upper-bound'
        }
      : null,
    { now }
  )
}
