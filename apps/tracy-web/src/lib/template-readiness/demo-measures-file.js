/**
 * The demo measurements of a quickstart version (ticket #436), read from the contract folder itself:
 * `demo-measures.json` beside `content-map.json`, written by `apps/tracy-web/scripts/demo-measures.mjs` on the untouched
 * demo and committed by whoever ran it, the way `content-coverage.json` is (`content-coverage/reader.js`). /ops and the
 * readiness verdict only read it. It ships in no Claude Cowork plugin package (`check-design-templates.ts` leaves it out of
 * `contractFiles`, like the coverage file).
 *
 *   {
 *     "schemaVersion": "tracy-demo-measures/v1",
 *     "quickstart": { "slug": "<quickstart slug>", "version": "<quickstart version measured>" },
 *     "widths": [1440, 390],
 *     "pages": ["/", ...],
 *     "status": "green" | "red" | "unmeasured",
 *     "groups": [ { "name", "status", "checked", "reason"?, "failures": [ { group, page, width, measured, level, reason } ] } ]
 *   }
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { contractFor } from '../contracts.js'
import { DEMO_MEASURES_VERSION } from '../../site-check/demo-measures.js'

export const DEMO_MEASURES_FILE = 'demo-measures.json'

/** The platforms whose untouched demo is measured (baseline and layout measures): the same rules on each. */
export const DEMO_MEASURED_PLATFORMS = Object.freeze(['joomla', 'wordpress'])

/** The widths a demo is measured at: the site check's own (desktop and phone). */
const REQUIRED_WIDTHS = [1440, 390]

/**
 * @typedef {{ state: 'no-contract' } | { state: 'none', contract: string } | { state: 'invalid', contract: string, reason: string }
 *   | { state: 'read', contract: string, doc: any }} DemoMeasures
 */

/** What is wrong with a document's shape, or null. */
export function demoMeasuresProblem(doc) {
  if (!doc || typeof doc !== 'object') return 'it is not a JSON object'
  if (doc.schemaVersion !== DEMO_MEASURES_VERSION)
    return `schemaVersion is ${JSON.stringify(doc.schemaVersion)}, not ${DEMO_MEASURES_VERSION}`
  if (typeof doc.quickstart?.version !== 'string') return 'it names no quickstart version'
  if (!Array.isArray(doc.widths) || !REQUIRED_WIDTHS.every((w) => doc.widths.includes(w)))
    return `it was not measured at ${REQUIRED_WIDTHS.join(' and ')}`
  if (!Array.isArray(doc.groups) || doc.groups.length === 0) return 'it holds no measured group'
  for (const g of doc.groups) {
    if (typeof g?.name !== 'string' || typeof g?.status !== 'string') return 'a group has no name or status'
    if (!Array.isArray(g.failures)) return `group ${g.name} has no failures list`
  }
  return null
}

/**
 * The demo measurements of the contract that seals `release`.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 * @returns {DemoMeasures}
 */
export function demoMeasuresOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  const contract = contractFor(contracts, release?.tag, version)
  if (!contract?.dir) return { state: 'no-contract' }
  let doc
  try {
    doc = JSON.parse(readFileSync(path.join(contract.dir, DEMO_MEASURES_FILE), 'utf8'))
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return { state: 'none', contract: contract.id }
    return { state: 'invalid', contract: contract.id, reason: `${DEMO_MEASURES_FILE} is not valid JSON` }
  }
  const problem = demoMeasuresProblem(doc)
  if (problem) return { state: 'invalid', contract: contract.id, reason: problem }
  return { state: 'read', contract: contract.id, doc }
}
