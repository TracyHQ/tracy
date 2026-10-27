/**
 * Audit every surface the contract declares — the twelve artifacts and the 128 site pages — from
 * two observations taken the way each surface can actually be read.
 *
 * They arrive separately because the reading differs: artifacts are read inside their sandboxed
 * iframe through build-time markers, site pages through the selector map. Merging them here keeps
 * one thing true: the audit runs at the contract's own scope, so a surface cannot pass by being
 * left out of the question.
 *
 * Usage: node audit-content.mjs <observed-marketing.json> <observed-site.json> [merged-out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { auditContent } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'
import { studioContract } from './studio-content.mjs'

const [marketingFile, siteFile, mergedFile] = process.argv.slice(2)
if (!marketingFile || !siteFile)
  throw new Error(
    'Usage: node audit-content.mjs <observed-marketing.json> <observed-site.json> [merged-out.json]'
  )
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const marketing = read(marketingFile)
const site = read(siteFile)
if (marketing.contractHash !== site.contractHash)
  throw new Error('The two observations were taken against different contract revisions; re-observe both.')

const observed = {
  contractId: marketing.contractId,
  contractHash: marketing.contractHash,
  surfaces: [...marketing.surfaces, ...site.surfaces]
}
if (mergedFile) writeFileSync(mergedFile, JSON.stringify(observed, null, 2) + '\n')
const plan = read(new URL('./content/tracy-editorial/content-plan.json', import.meta.url))
const result = auditContent(studioContract, plan, observed)
console.log(JSON.stringify({ ...result, contractSurfaces: studioContract.surfaces.length }, null, 2))
