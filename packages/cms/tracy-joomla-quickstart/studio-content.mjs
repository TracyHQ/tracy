/** Shared demo facts. Renderers must escape these strings at their HTML boundary. */
import { readFileSync } from 'node:fs'
import {
  contractHash,
  validateContract
} from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'

export const studioContract = validateContract(
  JSON.parse(
    readFileSync(new URL('./content/tracy-editorial/content-contract.json', import.meta.url), 'utf8')
  )
)
export const studioContentHash = contractHash(studioContract)
export function studioFact(key) {
  if (!Object.hasOwn(studioContract.facts, key)) throw new Error(`Unknown studio fact: ${key}`)
  return studioContract.facts[key].value
}
export function studioRows(prefix, ids, fields) {
  return ids.map((id) => fields.map((field) => studioFact(`${prefix}.${id}.${field}`)))
}
