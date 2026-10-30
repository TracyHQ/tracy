/**
 * The `darkSpots` field of a template profile row: the Joomla logo spots that sit on a dark background beyond the rules
 * every template shares (`brand-joomla-places.js` `darkSpotsOf`). The brand engine and the readiness check read it from
 * the same row, so a template's dark spots are written once.
 *
 * Shape: `{ profiles?: string[], header?: true, footer?: true, proof?: string }`
 *   profiles  T4 only: site profiles (`etc/site/<name>.json`) whose header is dark; each must be one of the row's `profiles`
 *   header    T3 only: every template style's header is dark, whatever its title says
 *   footer    the footer logo sits on a dark background: the footer image slot (`footerSlot`), or on T3 the footer logo
 *             a template style keeps in its params (`logofooterimage`, JA Cagox)
 *   proof     the demo logo that proved it (a light picture, mean luminance above 180 of 255)
 */

const KEYS = new Set(['profiles', 'header', 'footer', 'proof'])

/** A Joomla release tag (`quickstart/ja-nova/j6`). */
const JOOMLA_TAG = /\/j\d+$/

/**
 * Every way one row's `darkSpots` is wrong, as sentences naming the row. Empty when the row has none or it is clean.
 * @param {string} at - `<tag>@<version>`
 * @param {string} tag
 * @param {any} row
 * @returns {string[]}
 */
export function darkSpotsProblems(at, tag, row) {
  const spots = row?.darkSpots
  if (spots === undefined) return []
  if (!spots || typeof spots !== 'object' || Array.isArray(spots))
    return [`${at}: darkSpots must be an object of profiles, header, footer and proof`]
  const problems = []
  if (!JOOMLA_TAG.test(tag))
    problems.push(
      `${at}: darkSpots is read on Joomla only (WordPress has darkLogo, EmDash its own dark spots)`
    )
  if (row.logos === 'dark')
    problems.push(`${at}: darkSpots says nothing, logos: dark already makes every spot dark`)
  for (const key of Object.keys(spots))
    if (!KEYS.has(key)) problems.push(`${at}: darkSpots has unknown key "${key}"`)
  if (!['profiles', 'header', 'footer'].some((k) => spots[k] !== undefined))
    problems.push(`${at}: darkSpots names no spot (profiles, header or footer)`)
  for (const flag of ['header', 'footer'])
    if (spots[flag] !== undefined && spots[flag] !== true)
      problems.push(`${at}: darkSpots.${flag} must be true (leave it out otherwise)`)
  if (spots.header !== undefined && row.framework !== 't3')
    problems.push(`${at}: darkSpots.header is a T3 style spot, but the row's framework is ${row.framework}`)
  if (spots.footer !== undefined && typeof row.footerSlot !== 'string' && row.framework !== 't3')
    problems.push(
      `${at}: darkSpots.footer marks the footer logo dark, but the row has no footerSlot and is not T3`
    )
  if (spots.profiles !== undefined) {
    if (row.framework !== 't4')
      problems.push(`${at}: darkSpots.profiles is a T4 spot, but the row's framework is ${row.framework}`)
    if (!Array.isArray(spots.profiles) || spots.profiles.length === 0)
      problems.push(`${at}: darkSpots.profiles must list site profile names`)
    else
      for (const name of spots.profiles)
        if (!(row.profiles ?? []).includes(name))
          problems.push(`${at}: darkSpots.profiles names ${name}, not a profile of the row`)
  }
  if (spots.proof !== undefined && (typeof spots.proof !== 'string' || spots.proof === ''))
    problems.push(`${at}: darkSpots.proof must be a sentence`)
  return problems
}
