/**
 * What can be made today comes first in the grid.
 *
 * The host sends brands, then templates, then the 152 design systems (`host/index.ts`, the catalog
 * branch). That order put the buildable cards on top only as long as the customer had no brand of
 * their own, because brands are pinned ahead of everything — and since 24/09/2026 every design
 * system is Coming soon (`host/gallery.mjs` says why), so what was a harmless accident became the
 * difference between finding the three cards that work and scrolling a wall of greyed ones.
 *
 * Plain JavaScript so `node --test` runs it without a build step, like `build-handoff.mjs`.
 */

/**
 * Whether a row can be made into a site today.
 *
 * A row names the CMSes it has a build for, and an empty list means none. `undefined` is NOT
 * "none": a surface that sends no list at all does not know, and a row it did not speak about is
 * left where it was rather than pushed to the back on a missing field.
 *
 * @param {{ platforms?: unknown }} row
 * @returns {boolean}
 */
export function isReady(row) {
  return !(Array.isArray(row?.platforms) && row.platforms.length === 0)
}

/**
 * Brands first, then what can be built, then what is Coming soon.
 *
 * A STABLE partition, not a sort: within each part the incoming order is kept, so the publisher's
 * ordering and any sort applied before this one both survive. Brands stay pinned first — they are
 * the customer's own row, not a thing to build from, and the fit score is measured against them.
 *
 * @template {{ id?: string, platforms?: unknown }} T
 * @param {readonly T[]} list - the rows in the order the host and any active sort left them.
 * @returns {T[]}
 */
export function readyFirst(list) {
  const rows = Array.isArray(list) ? list : []
  const brands = rows.filter((d) => typeof d?.id === 'string' && d.id.startsWith('brand:'))
  const rest = rows.filter((d) => !(typeof d?.id === 'string' && d.id.startsWith('brand:')))
  return [...brands, ...rest.filter(isReady), ...rest.filter((d) => !isReady(d))]
}
