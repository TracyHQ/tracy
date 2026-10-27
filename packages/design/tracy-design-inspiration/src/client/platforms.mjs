/**
 * The CMS filter above the library (Akemi, 29/09/2026): Joomla, WordPress and EmDash as chips, each
 * with its logo and the number of templates that support it.
 *
 * - A template that supports several CMSes shows under EACH of them, and counts under each — the
 *   counts are "templates you can start from on this CMS", so they deliberately sum past the total.
 * - Several chips on = a card shows when it supports ANY of them (Akemi chose OR over AND, 29/09):
 *   picking more widens the grid, the way a facet does on any shop.
 * - Nothing here is a hand-kept number. Counts are read off the rows ops publishes
 *   (`GET /api/templates`), so a template published tomorrow moves them with no code change.
 *
 * Plain `.mjs`, not `.ts`, so `test/platforms.test.mjs` can import it — the same reason as
 * `groups.mjs`.
 */

/**
 * The platforms the filter offers, in its order — Joomla first because Tracy is Joomla-first.
 * Labels are proper nouns and are never translated. A CMS the door names that is not listed here is
 * not offered: adding one is adding a row, a logo and a decision, not something to infer.
 */
export const PLATFORMS = /** @type {const} */ ([
  { id: 'joomla', label: 'Joomla' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'emdash', label: 'EmDash' }
])

/**
 * The platforms a card supports, in the filter's order and only those the filter offers. A card
 * that sends no list (a design system, a surface that does not know) supports none.
 * @param {{ platforms?: readonly string[] | undefined }} card
 * @returns {string[]}
 */
export function platformsOf(card) {
  const own = Array.isArray(card?.platforms) ? card.platforms : []
  return PLATFORMS.map((p) => p.id).filter((id) => own.includes(id))
}

/**
 * How many cards support each offered platform — every offered platform present, zero included,
 * so a chip can say "none yet" rather than vanish.
 * @param {readonly { platforms?: readonly string[] | undefined }[]} cards
 * @returns {Map<string, number>}
 */
export function platformCounts(cards) {
  /** @type {Map<string, number>} */
  const counts = new Map(PLATFORMS.map((p) => [p.id, 0]))
  for (const card of cards) for (const id of platformsOf(card)) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/**
 * Whether a card passes the chosen platforms: always when none is chosen, else when it supports
 * any of them.
 * @param {{ platforms?: readonly string[] | undefined }} card
 * @param {ReadonlySet<string>} chosen
 * @returns {boolean}
 */
export function onPlatforms(card, chosen) {
  if (chosen.size === 0) return true
  return platformsOf(card).some((id) => chosen.has(id))
}
