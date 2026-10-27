/**
 * The content contract profile a release is sealed by, and its JSON files, for the rules that hold
 * a release to what its contract declares (editions, demo trim map, multilingual map, content map).
 *
 *   const contract = releaseContract(context)   // null: no profile seals this release
 *   contract.json('editions.json')              // parsed file, or null when the profile has none
 *
 * The profile is found the way a site build finds it (`contracts.js` `contractFor`): the exact
 * version, else the nearest lower one of the same major, which `fallbackFrom` then names. EmDash
 * releases have no contract; this answers null for them.
 *
 * Tests pass `context.contracts` (a `ContractIndex` from `readContracts(dir)`) to hold a release to
 * a contract cut for the test; without it the profiles this checkout or image ships are read.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { contractFor, defaultContracts } from '../../contracts.js'

/** @type {WeakMap<object, ReturnType<typeof open> | null>} */
const memo = new WeakMap()

/** @param {import('../../contracts.js').Contract & { fallbackFrom?: string }} contract */
function open(contract) {
  /** @type {Map<string, any>} */
  const files = new Map()
  return {
    id: contract.id,
    dir: contract.dir,
    fallbackFrom: contract.fallbackFrom ?? null,
    /**
     * One JSON file of the profile, parsed; null when the profile does not carry it.
     * @param {string} name a file name inside the profile directory
     */
    json(name) {
      if (!files.has(name)) {
        let text = null
        try {
          text = readFileSync(path.join(contract.dir, name), 'utf8')
        } catch {
          // Not carried by this profile.
        }
        files.set(name, text === null ? null : JSON.parse(text))
      }
      return files.get(name)
    }
  }
}

/**
 * @param {import('../index.js').RuleContext & { contracts?: import('../../contracts.js').ContractIndex }} context
 * @returns {ReturnType<typeof open> | null}
 */
export function releaseContract(context) {
  if (!memo.has(context)) {
    const index = context.contracts ?? defaultContracts()
    const found = context.release.tag
      ? contractFor(index, context.release.tag, context.release.version)
      : null
    memo.set(context, found ? open(found) : null)
  }
  return memo.get(context) ?? null
}

/**
 * The entities of the profile's `content-map.json`, or an empty list.
 * @param {ReturnType<typeof releaseContract>} contract
 * @returns {Record<string, any>[]}
 */
export function contractEntities(contract) {
  const entities = contract?.json('content-map.json')?.entities
  return Array.isArray(entities) ? entities : []
}

/**
 * The slots of the profile's `content-map.json`, or an empty list.
 * @param {ReturnType<typeof releaseContract>} contract
 * @returns {Record<string, any>[]}
 */
export function contractSlots(contract) {
  const slots = contract?.json('content-map.json')?.slots
  return Array.isArray(slots) ? slots : []
}
