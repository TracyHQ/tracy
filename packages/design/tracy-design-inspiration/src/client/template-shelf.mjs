/**
 * What may stand on the Design inspiration shelf: things a site can be made from.
 *
 * 🔒 A MEASURED BRAND IS NOT A TEMPLATE (Akemi, 03/10/2026). A `brand:<host>` row is the colours
 * and fonts read off a website, drawn in a borrowed page (`reference-donor.mjs`); it cannot build a
 * site on its own. It used to sit in the grid beside the finished templates under a corner ribbon
 * (ADR 0011), and a customer could not tell the two apart. So the grid drops it here, in the one
 * place both surfaces (the tab in dsh and the public page) pass through, whatever road the row came
 * by: the agent's extract, the public page's domain box, or the community shelf. The brand files
 * stay where they are; the agent still reads them as context.
 *
 * Plain JavaScript so `node --test` runs it without a build step, like `ready-first.mjs`.
 */

/** The id prefix of a measured brand (`host/gallery.mjs` BRAND_PREFIX). */
const BRAND_PREFIX = 'brand:'

/**
 * Whether a row is a measured brand rather than something a site can be made from.
 *
 * @param {{ id?: unknown }} row
 * @returns {boolean}
 */
export function isBrandCard(row) {
  return typeof row?.id === 'string' && row.id.startsWith(BRAND_PREFIX)
}

/**
 * The rows the grid may show, in the order they came: every row except the brand cards.
 *
 * @template {{ id?: unknown }} T
 * @param {readonly T[] | null | undefined} rows
 * @returns {T[]}
 */
export function templateShelf(rows) {
  return Array.isArray(rows) ? rows.filter((d) => !isBrandCard(d)) : []
}
