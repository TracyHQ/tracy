/**
 * The template picker's groups for a business of a known trade (the owner approved it 26/10/2026): the cards made for
 * the trade first, marked Recommended; then the cards that suit any business; then every other card, as today.
 *
 * The ranking is the server's (tracy-web `templateRanking`, the same card words `autoTemplate` reads), so the picker
 * never guesses a trade from a card itself. Grouping runs on the cards already filtered (CMS chips, categories,
 * search), so each CMS chip shows its own groups and a search keeps them.
 *
 * Plain JavaScript so `node --test` runs it without a build step, like `ready-first.mjs`.
 */

/** The trades a business can be (tracy-web `lib/wo-revision-choice.js` BUSINESS_TRADES). */
export const TRADES = Object.freeze([
  'food',
  'nonprofit',
  'events',
  'beauty',
  'health',
  'fitness',
  'hospitality',
  'travel',
  'professional',
  'creative',
  'education',
  'retail',
  'auto',
  'home'
])

/**
 * The cards in groups, or null when there is nothing to group by: no ranking, or no card of the filtered set in
 * either the recommended or the generic group (then the grid stays exactly as today). A group with no card is left
 * out. Within a group the incoming order is kept.
 *
 * @template {{ id: string }} T
 * @param {readonly T[]} list - the cards on screen, already filtered and ordered.
 * @param {{ trade: string, recommended: readonly string[], generic: readonly string[] } | null | undefined} ranking
 * @returns {{ key: 'recommended' | 'generic' | 'rest', rows: T[] }[] | null}
 */
export function tradeGroups(list, ranking) {
  if (!ranking || !Array.isArray(list)) return null
  const recommended = new Set(Array.isArray(ranking.recommended) ? ranking.recommended : [])
  const generic = new Set(Array.isArray(ranking.generic) ? ranking.generic : [])
  const groups = [
    { key: 'recommended', rows: list.filter((d) => recommended.has(d.id)) },
    { key: 'generic', rows: list.filter((d) => !recommended.has(d.id) && generic.has(d.id)) },
    { key: 'rest', rows: list.filter((d) => !recommended.has(d.id) && !generic.has(d.id)) }
  ]
  if (groups[0].rows.length === 0 && groups[1].rows.length === 0) return null
  return /** @type {{ key: 'recommended' | 'generic' | 'rest', rows: T[] }[]} */ (
    groups.filter((g) => g.rows.length > 0)
  )
}

/**
 * The heading of the Recommended group: one sentence per trade, so each language words it whole (an article, a
 * noun's gender); a trade this list does not know reads "your business".
 * @param {string | null | undefined} trade
 * @returns {string}
 */
export function recommendedHeadingKey(trade) {
  return TRADES.includes(String(trade)) ? `trade.recommended.${trade}` : 'trade.recommended'
}
