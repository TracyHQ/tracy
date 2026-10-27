import { defaultOfferingKind } from './trades.mjs'

/**
 * What an offering is, by the place's trade (`defaultOfferingKind`): a menu's dishes and drinks belong to food and to
 * a place with no trade at all; every other trade offers services, a shop products. A kind the source states is kept.
 */
const KINDS = new Set([
  'dish',
  'drink',
  'service',
  'class',
  'membership',
  'package',
  'room',
  'product',
  'experience'
])
const DRINK = /\b(coffee|tea|drinks?|beverages?|cocktails?|wine|beer|juice|smoothies?)\b/i

/**
 * @param {{kind?: unknown, section?: unknown, source?: {section?: unknown}}} item
 * @param {string | null} trade - a `tracy-trade` code, or null when no category was stated
 */
export function offeringKindOf(item, trade) {
  if (typeof item?.kind === 'string' && KINDS.has(item.kind)) return item.kind
  const kind = defaultOfferingKind(trade)
  if (kind !== 'dish') return kind
  return DRINK.test(String(item?.section ?? item?.source?.section ?? '')) ? 'drink' : 'dish'
}
