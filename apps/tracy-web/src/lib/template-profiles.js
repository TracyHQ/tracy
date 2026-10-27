/**
 * How a released template takes a customer's brand: how many logos it needs, whether it already
 * shows a customer's logo and favicon, and where the writers put them.
 *
 * 🔒 DATA, KEYED BY RELEASE AND VERSION, LOOKED UP LIKE A CONTRACT. The rows live in
 * `template-profiles.json` beside this file; this module only reads them. A version with no row of
 * its own takes the nearest LOWER row of the same release and major (the rule `contractFor` applies
 * to contract profiles), so a UI patch release keeps its brand behaviour at runtime. The
 * `design-templates` gate is stricter: every release on Design inspiration needs an EXACT row, so a
 * re-release whose logo spot moved never silently inherits a stale `brandReady` or `logos`.
 *
 * 🔒 NO PAGES HERE. The pages a template has travel with its release (`tracy_site_pages.json`,
 * `site-pages-schema.mjs`), because they change whenever the template's menu does.
 *
 * Fields of a row:
 *   logos        `pair`   a light-background logo AND a dark-background one (dark mode, dark header)
 *                `dark`   one logo, and every spot it shows in is dark: it must be the light-on-dark one
 *                `single` one logo on a light background
 *   brandReady   the template already shows a customer's logo without being released again
 *   faviconReady the template already shows a customer's favicon without being released again
 *   darkLogo     WordPress only: the theme shows option `tracy_logo_dark` (an attachment id) where the background is
 *                dark, so the writer puts the dark-background logo there; absent means the theme does not read it
 *   nameFallback WordPress only: every logo spot of the theme shows the site title as text when `site_logo` (and
 *                `tracy_logo_dark`) is empty. A measured fact about the theme; no writer reads it since a blank
 *                logo keeps the template's logo (LOGO-4 dropped, 09/10/2026)
 *   framework    Joomla only: `t3` (logo in template style params) or `t4` (logo in a site profile file)
 *   profiles     Joomla T4 only: the site profile files (`etc/site/<name>.json`) that carry a logo
 *   footerSlot   the image slot of the sealing contract that holds a second, footer logo
 *   darkSpots    Joomla only: the logo spots on a dark background beyond the shared rules (T4 profiles, the T3 header,
 *                the footer slot), read by the brand engine and the readiness check alike; shape and checks in
 *                `template-profile-dark-spots.js`
 *   frame        `{ width, height }` of the demo logo the spot was drawn for, in pixels
 *   logoHeight   the height in CSS pixels the template shows its demo header logo at, set ONLY where the template's
 *                CSS does not hold an uploaded logo to it (the picture's own size is its size on the page): the
 *                writer scales every logo down to that height, never up (`prepareBrand`). A re-release that caps the
 *                logo in CSS leaves it out and gets the full picture
 *   unverified   fields whose value research could not prove; a later ticket checks them on a site
 *   note         one sentence for the person reading the table
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import TABLE from './template-profiles.json' with { type: 'json' }
import { contractFor } from './contracts.js'
import { publishedTagOf } from './local-releases.js'
import { darkSpotsProblems } from './template-profile-dark-spots.js'

/** The table as shipped: `{ releases: { <tag>: { <version>: row } } }`. */
export const TEMPLATE_PROFILES = TABLE

/** The logo layouts a template can have. There is no `none`: every template takes a logo. */
export const LOGO_LAYOUTS = Object.freeze(['pair', 'dark', 'single'])

const FIELDS = new Set([
  'logos',
  'brandReady',
  'faviconReady',
  'darkLogo',
  'nameFallback',
  'framework',
  'profiles',
  'footerSlot',
  'darkSpots',
  'frame',
  'logoHeight',
  'unverified',
  'note'
])

/** A WordPress release tag (`quickstart/ja-nova/wp7`, `tracy-base/wp7`). */
const WORDPRESS_TAG = /\/wp\d+$/

/** `x.y.z` as three numbers, or null for anything else (pre-release and build tags included). */
function semverOf(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version))
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** @param {number[]} a @param {number[]} b */
const compareSemver = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * The brand profile of one release at one version, or null when the table has none for it.
 *
 * Exact row first; else the row of the HIGHEST version below the requested one, same release and
 * same major, marked `fallbackFrom` with the version that was asked for. Never a higher version,
 * another major or another release; a non-semver version answers null. A local pack
 * (`local/<slug>/<cms>`) is profiled as the release it stands for.
 * @param {unknown} release the release tag (`quickstart/ja-vega/wp7`)
 * @param {unknown} version the quickstart version (`tracy_setting.json` `version`)
 * @param {{ releases?: Record<string, Record<string, object>> }} [table]
 */
export function templateProfileOf(release, version, table = TABLE) {
  if (typeof release !== 'string' || typeof version !== 'string') return null
  const tag = publishedTagOf(release)
  const rows = table?.releases?.[tag]
  if (!rows || typeof rows !== 'object') return null
  if (Object.hasOwn(rows, version)) return { release: tag, version, ...rows[version] }
  const wanted = semverOf(version)
  if (wanted === null) return null
  let best = null
  for (const key of Object.keys(rows)) {
    const have = semverOf(key)
    if (have === null || have[0] !== wanted[0] || compareSemver(have, wanted) >= 0) continue
    if (best === null || compareSemver(have, best.have) > 0) best = { key, have }
  }
  return best === null ? null : { release: tag, version: best.key, ...rows[best.key], fallbackFrom: version }
}

/**
 * Every way the table is wrong, as sentences naming the row. Empty is clean.
 *
 * With `contracts` (the index `readContracts` builds), a `footerSlot` is also held to the profile
 * that seals that release: it must be an image slot there, or the writer would put a logo nowhere.
 * @param {any} table
 * @param {{ contracts?: Map<string, any> }} [opts]
 * @returns {string[]}
 */
export function profileTableProblems(table, { contracts } = {}) {
  const problems = []
  const releases = table?.releases
  if (!releases || typeof releases !== 'object') return ['template-profiles.json has no `releases` object']
  for (const [tag, rows] of Object.entries(releases)) {
    if (!rows || typeof rows !== 'object') {
      problems.push(`${tag}: must map versions to rows`)
      continue
    }
    for (const [version, row] of Object.entries(rows)) {
      const at = `${tag}@${version}`
      if (semverOf(version) === null) {
        problems.push(`${at}: the version must be x.y.z`)
        continue
      }
      problems.push(...rowProblems(at, row), ...darkSpotsProblems(at, tag, row))
      if (row?.darkLogo !== undefined && !WORDPRESS_TAG.test(tag))
        problems.push(
          `${at}: darkLogo is read on WordPress only (Joomla and EmDash have their own dark spots)`
        )
      if (row?.nameFallback !== undefined && !WORDPRESS_TAG.test(tag))
        problems.push(
          `${at}: nameFallback is read on WordPress only (every Joomla T3/T4 and EmDash template prints the name without a logo)`
        )
      if (contracts && typeof row?.footerSlot === 'string') {
        const problem = footerSlotProblem(contracts, tag, version, row.footerSlot)
        if (problem) problems.push(`${at}: ${problem}`)
      }
    }
  }
  return problems
}

/** @param {string} at @param {any} row */
function rowProblems(at, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [`${at}: a row must be an object`]
  const problems = []
  for (const key of Object.keys(row)) if (!FIELDS.has(key)) problems.push(`${at}: unknown field "${key}"`)
  if (!LOGO_LAYOUTS.includes(row.logos))
    problems.push(`${at}: logos is ${JSON.stringify(row.logos)}, must be one of ${LOGO_LAYOUTS.join(', ')}`)
  for (const flag of ['brandReady', 'faviconReady'])
    if (typeof row[flag] !== 'boolean') problems.push(`${at}: ${flag} must be true or false`)
  if (row.darkLogo !== undefined && typeof row.darkLogo !== 'boolean')
    problems.push(`${at}: darkLogo must be true or false`)
  if (row.nameFallback !== undefined && typeof row.nameFallback !== 'boolean')
    problems.push(`${at}: nameFallback must be true or false`)
  if (row.framework !== undefined && row.framework !== 't3' && row.framework !== 't4')
    problems.push(`${at}: framework must be t3 or t4`)
  if (
    row.profiles !== undefined &&
    (!Array.isArray(row.profiles) || row.profiles.some((p) => typeof p !== 'string' || p === ''))
  )
    problems.push(`${at}: profiles must be a list of profile names`)
  if (row.footerSlot !== undefined && (typeof row.footerSlot !== 'string' || row.footerSlot === ''))
    problems.push(`${at}: footerSlot must be a slot key`)
  if (
    row.frame !== undefined &&
    !(
      Number.isInteger(row.frame?.width) &&
      row.frame.width > 0 &&
      Number.isInteger(row.frame?.height) &&
      row.frame.height > 0
    )
  )
    problems.push(`${at}: frame must be { width, height } in whole pixels`)
  if (row.logoHeight !== undefined && !(Number.isInteger(row.logoHeight) && row.logoHeight > 0))
    problems.push(`${at}: logoHeight must be a whole number of pixels above zero`)
  if (row.note !== undefined && typeof row.note !== 'string') problems.push(`${at}: note must be a sentence`)
  if (row.unverified !== undefined) {
    if (!Array.isArray(row.unverified)) problems.push(`${at}: unverified must list field names`)
    else
      for (const field of row.unverified)
        if (!Object.hasOwn(row, field) || field === 'unverified' || field === 'note')
          problems.push(`${at}: unverified names "${field}", which this row does not set`)
  }
  return problems
}

/** Why a footer slot is not an image slot of the sealing profile, or null when it is. */
function footerSlotProblem(contracts, tag, version, key) {
  const sealed = contractFor(contracts, tag, version)
  if (!sealed?.dir) return `footerSlot ${key} names a slot, but no contract profile seals this release`
  let slots
  try {
    slots = JSON.parse(readFileSync(path.join(sealed.dir, 'content-map.json'), 'utf8')).slots ?? []
  } catch {
    return `footerSlot ${key}: the content map of ${sealed.id} could not be read`
  }
  const slot = slots.find((s) => s?.key === key)
  if (!slot) return `footerSlot ${key} is not a slot of ${sealed.id}`
  if (slot.type !== 'image')
    return `footerSlot ${key} is a ${String(slot.type)} slot of ${sealed.id}, not an image`
  return null
}

/**
 * The gallery releases with no EXACT row, as sentences naming each. The runtime falls back to an
 * older row; the gate does not, so a re-release is profiled on purpose, not by inheritance.
 * @param {any} table
 * @param {{ tag: string, version: string }[]} gallery
 * @returns {string[]}
 */
export function galleryCoverageProblems(table, gallery) {
  const problems = []
  for (const { tag, version } of gallery) {
    const rows = table?.releases?.[tag]
    if (rows && Object.hasOwn(rows, version)) continue
    const older = rows ? Object.keys(rows).sort() : []
    problems.push(
      `${tag}@${version} is on Design templates but template-profiles.json has no row for it${older.length ? ` (rows: ${older.join(', ')})` : ''}`
    )
  }
  return problems
}
