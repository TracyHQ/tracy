/**
 * Audit the observed DOM against the plan, scoped to the twelve marketing surfaces.
 *
 * The skill's CLI audits the whole contract; this migration covers the marketing artifacts only,
 * so the scope is passed explicitly and the contract keeps its full 140-surface scope. Shrinking
 * the contract to make an audit pass is the failure this argument exists to avoid.
 */
import { readFile } from 'node:fs/promises'
import { auditContent } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'
import { studioContract } from './studio-content.mjs'
import { MARKETING_SURFACES, scopeToMarketing } from './marketing-plan.mjs'

const [observedFile] = process.argv.slice(2)
if (!observedFile) throw new Error('Usage: node audit-marketing-samples.mjs <observed-content.json>')
const read = async (url) => JSON.parse(await readFile(url, 'utf8'))
const plan = await read(new URL('./content/tracy-editorial/content-plan.json', import.meta.url))
const observed = await read(observedFile)
const result = auditContent(studioContract, scopeToMarketing(plan), observed, MARKETING_SURFACES)
console.log(
  JSON.stringify(
    { ...result, scope: MARKETING_SURFACES.length, contractSurfaces: studioContract.surfaces.length },
    null,
    2
  )
)
