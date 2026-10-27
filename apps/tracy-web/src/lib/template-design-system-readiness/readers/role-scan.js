/**
 * The role scan of a release (`tdsr-role-scan/v1`): which standard role variables the template's
 * shipped sources declare, and which colour, radius or font literals still play a role. The packaging
 * scanner writes it when the quickstart is built and the release carries it as its own small asset,
 * `design-system-roles.json` (every `.json` asset is downloaded with the release, `isSmallAsset`).
 * Rule VARS-1 judges it against the one list of role variables (`@tracy/ds-slot` `role-variables.mjs`).
 *
 * A report counts only for the release it was made from: same platform and version. Anything else
 * (no file, not JSON, another schema, another version) is "not scanned" and says why.
 */
import { dsSlotModule } from '../../ds-slot.js'
import { readText } from '../../template-customization-question-readiness/release-source.js'

export const ROLE_SCAN_FILE = 'design-system-roles.json'

/**
 * `class` of a spot is the scanner's own sort (auto · flag · keep · missing); `missing` = a component
 * that sets no corner at all, so it has no `value`. `twin` = the Sass/LESS source a compiled
 * stylesheet was built from; VARS-1 counts the spot at that source, not here. The scanner marks a
 * twin only when the source carries the value; a literal only the compiled CSS carries is
 * `outOfSync` (the source it should come from) and counts like any other spot.
 * @typedef {{ file: string, line: number, component: string, property?: string, value?: string, role?: string | null, handled: boolean, reason?: string, class?: string, twin?: string, outOfSync?: string }} HardcodedSpot
 * @typedef {{ schema: string, template: string, platform: string, version: string, scannedAt: string, scanner?: string, declared: string[], hardcoded: HardcodedSpot[] }} RoleScan
 * @typedef {{ scan: RoleScan, where: string } | { scan: null, why: string }} RoleScanRead
 */

const isText = (/** @type {unknown} */ x) => typeof x === 'string' && x.trim() !== ''

/**
 * What is wrong with a document as a role scan of this release, in order; empty when it counts.
 * @param {any} doc
 * @param {{ platform: string, version: string }} release
 * @param {string} schema the expected schema tag
 * @returns {string[]}
 */
export function roleScanProblems(doc, release, schema) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not a JSON object']
  const problems = []
  if (doc.schema !== schema) problems.push(`schema is ${JSON.stringify(doc.schema ?? null)}, not ${schema}`)
  if (doc.platform !== release.platform)
    problems.push(`made for platform ${String(doc.platform)}, not ${release.platform}`)
  if (doc.version !== release.version)
    problems.push(`made for version ${String(doc.version)}, not ${release.version}`)
  if (!isText(doc.scannedAt) || Number.isNaN(Date.parse(doc.scannedAt)))
    problems.push('scannedAt is not a date')
  if (!Array.isArray(doc.declared) || !doc.declared.every((n) => typeof n === 'string'))
    problems.push('declared is not a list of names')
  if (!Array.isArray(doc.hardcoded)) problems.push('hardcoded is not a list')
  else
    for (const [i, h] of doc.hardcoded.entries()) {
      const ok =
        h &&
        isText(h.file) &&
        Number.isInteger(h.line) &&
        h.line >= 1 &&
        isText(h.component) &&
        typeof h.handled === 'boolean'
      if (!ok) {
        problems.push(`hardcoded[${i}] needs file, line (from 1), component and handled`)
        break
      }
    }
  return problems
}

/** @type {WeakMap<object, Promise<RoleScanRead>>} */
const memo = new WeakMap()

/**
 * The role scan of this release, or why there is none that counts.
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<RoleScanRead>}
 */
export function roleScanOf(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<RoleScanRead>} */ (memo.get(context))
}

/** @param {import('../index.js').RuleContext} context @returns {Promise<RoleScanRead>} */
async function read(context) {
  const raw = await readText(context.source, ROLE_SCAN_FILE)
  if (raw === null) return { scan: null, why: `the release carries no ${ROLE_SCAN_FILE}` }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return { scan: null, why: `${ROLE_SCAN_FILE} is not JSON` }
  }
  const { ROLE_SCAN_REPORT_SCHEMA } = await dsSlotModule('role-variables')
  const problems = roleScanProblems(doc, context.release, ROLE_SCAN_REPORT_SCHEMA)
  if (problems.length) return { scan: null, why: `${ROLE_SCAN_FILE}: ${problems[0]}` }
  return { scan: /** @type {RoleScan} */ (doc), where: ROLE_SCAN_FILE }
}
