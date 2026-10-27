/**
 * Which slot contract lane.mjs measures a release through: the one a Tracy site built from that release
 * wears (apps/tracy-web ds-slot.js contractFor), not the line's first file.
 *
 * A line can hold several contracts, each for its own releases (JA Podcast: joomla-ja-podcast up to 1.0.4,
 * joomla-ja-podcast-modes for 1.0.5, joomla-ja-podcast-roles for 1.0.6). Measuring 1.0.6 through the line's
 * base contract hid the template's light/dark switch and dropped the 1.0.6 role rules: CON-1 + MODE-2 failed
 * on every system while the product wears the two-mode roles contract cleanly (17/10/2026).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractFor } from '../../../../apps/tracy-web/src/lib/ds-slot.js'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '../templates')

/** The line's base contract: the file every later contract of the template extends. */
export function baseContractOf(slug) {
  return slug === 'tracy-apple' ? 'joomla-tracy-base' : `joomla-${slug}`
}

/**
 * The contract to measure `version` of `tag` through.
 * @param {string} slug     e.g. ja-podcast
 * @param {string} tag      e.g. quickstart/ja-podcast/j6
 * @param {string | null} version  e.g. 1.0.6 (null: not known yet, the base contract)
 * @returns {{ contract: string, reason?: string }} `reason` set when no contract's range holds the release
 *   and the base contract is used (a build newer than every contract names: measured, but not what a site wears)
 */
export function laneContract(slug, tag, version) {
  const base = baseContractOf(slug)
  if (!version) return { contract: base }
  const template = JSON.parse(readFileSync(join(TEMPLATES, `${base}.json`), 'utf8')).template
  const r = contractFor(template, { key: tag, version })
  if ('contract' in r) return { contract: r.contract }
  return { contract: base, reason: r.reason }
}
