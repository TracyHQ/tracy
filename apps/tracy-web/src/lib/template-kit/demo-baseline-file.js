/**
 * The demo baseline of a quickstart version kept beside its contract (ADR 0044, decision 8; #419): `demo-baseline.json` next to
 * `template-kit.json` and `content-coverage.json`, committed at step 0 by whoever made the kit, in the image through the same
 * Dockerfile COPY as the contract. It is what the untouched quickstart site showed (text keys, picture files and hashes, the
 * words over pictures, tall blocks, text blocks, maps), measured through the host's demo-qa door
 * (`apps/tracy-web/scripts/site-check-baseline.mjs`) and written beside the contract by the kit tool
 * (`packages/cms/tracy-quickstart-tools/template-kit/cli.mjs baseline`). The site check and the write step bench read it
 * first (`site-check/demo-baseline.js` `contractBaselineStore`); the bench's baseline folder is only a fallback cache.
 *
 * The Template kit step asks for it only for the templates `demo-baseline-policy.json` names (`holdPublishFor`): there a
 * missing, unreadable or stale file is a flow gap (`flow-reads.js`, `kit-demo-baseline-missing`). Every other template
 * reads exactly as before.
 *
 * 🔒 A FILE COUNTS ONLY FOR THE VERSION IT MEASURED. Its `quickstart` is the contract id; a file left from another version
 * is stale, never a pass. A baseline guessed from the kit (`source: "kit"`, `baselineFromKit`) is no measurement and is
 * refused here.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { contractOfRelease } from '../slot-roles-of-release.js'

export const BASELINE_FILE = 'demo-baseline.json'
export const BASELINE_SCHEMA = 'demo-baseline/1'

/** Which templates must carry the file before a new version is published (owner, 06/11/2026: JA Boxing only for now). */
export const DEMO_BASELINE_POLICY = Object.freeze(
  JSON.parse(readFileSync(fileURLToPath(new URL('./demo-baseline-policy.json', import.meta.url)), 'utf8'))
)

/**
 * @typedef {{ state: 'none' } | { state: 'invalid', reason: string } | { state: 'stale', reason: string } | { state: 'read', doc: any }} DemoBaseline
 */

const isList = (x) => Array.isArray(x)

/**
 * Why a parsed baseline file cannot be used, or null. Checks only what the demo measures read.
 * @param {any} doc
 */
export function demoBaselineProblem(doc) {
  if (doc === null || typeof doc !== 'object' || isList(doc)) return `${BASELINE_FILE} is not an object`
  if (doc.schema !== BASELINE_SCHEMA) return `${BASELINE_FILE} is not ${BASELINE_SCHEMA}`
  if (doc.source !== 'host')
    return `${BASELINE_FILE} was not measured on the untouched site (source ${String(doc.source)})`
  if (typeof doc.quickstart !== 'string' || doc.quickstart === '')
    return `${BASELINE_FILE} names no quickstart version`
  if (!isList(doc.texts) || !isList(doc.labels)) return `${BASELINE_FILE} lists no texts or labels`
  if (!isList(doc.pictures?.files) || !isList(doc.pictures?.shas)) return `${BASELINE_FILE} lists no pictures`
  return null
}

/** @type {Map<string, { stamp: string, value: DemoBaseline }>} */
const memo = new Map()

const stampOf = (file) => {
  try {
    const stat = statSync(file, { bigint: true })
    return `${stat.mtimeNs}:${stat.size}`
  } catch {
    return 'missing'
  }
}

/**
 * The baseline file beside a contract, read again only when it changed (/ops builds every road on each list read).
 * @param {{ id: string, dir?: string } | null | undefined} contract what `contractFor` answered
 * @returns {DemoBaseline}
 */
export function baselineOfContract(contract) {
  if (!contract?.dir) return { state: 'none' }
  const file = path.join(contract.dir, BASELINE_FILE)
  const stamp = stampOf(file)
  const seen = memo.get(file)
  if (seen && seen.stamp === stamp && seen.id === contract.id) return seen.value
  const value = readBaseline(file, contract.id)
  memo.set(file, { stamp, id: contract.id, value })
  return value
}

/** @returns {DemoBaseline} */
function readBaseline(file, id) {
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return { state: 'none' }
    return { state: 'invalid', reason: `${BASELINE_FILE} is not valid JSON` }
  }
  const problem = demoBaselineProblem(doc)
  if (problem) return { state: 'invalid', reason: problem }
  if (doc.quickstart !== id)
    return { state: 'stale', reason: `${BASELINE_FILE} measured ${doc.quickstart}, not ${id}` }
  return { state: 'read', doc }
}

/**
 * The baseline beside the contract that seals this release's version.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 */
export function baselineOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  return baselineOfContract(contractOfRelease(release, contracts))
}

/**
 * The baseline beside the contract whose id is `contractId` (the key the bench and the site check name a version by).
 * @param {Map<string, { id: string, dir?: string }>} index
 * @param {string} contractId
 * @returns {DemoBaseline}
 */
export function baselineOfContractId(index, contractId) {
  for (const contract of index.values()) if (contract.id === contractId) return baselineOfContract(contract)
  return { state: 'none' }
}

/**
 * Whether the Template kit step asks this release for the file.
 * @param {any} release
 * @param {{ holdPublishFor?: string[] }} [policy]
 */
export const baselineAskedOf = (release, policy = DEMO_BASELINE_POLICY) =>
  typeof release?.tag === 'string' && (policy.holdPublishFor ?? []).includes(release.tag)
