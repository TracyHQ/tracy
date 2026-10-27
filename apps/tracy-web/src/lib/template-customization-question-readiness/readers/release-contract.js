/**
 * The content contract that seals the release being checked (`contracts.js` `contractFor`: the
 * exact profile, else the nearest lower one of the same major, marked `fallbackFrom`), and its two
 * files the name rules read: `content-map.json` (the slots and their samples) and
 * `presentation-lock.json` (the archive as captured). For NAME-1, NAME-3 and NAME-4.
 *
 * The context may carry its own index as `contracts` (a test); the check otherwise reads the
 * profiles this deployment ships. A release sealed by nothing answers null: a template quickstart
 * is installed as released.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { contractFor, defaultContracts } from '../../contracts.js'

/**
 * @param {import('../index.js').RuleContext & { contracts?: Map<string, any> }} context
 */
export function releaseContract(context) {
  const contract = contractFor(
    context.contracts ?? defaultContracts(),
    context.release.tag,
    context.release.version
  )
  if (!contract) return null
  const json = (/** @type {string} */ file) => {
    try {
      return JSON.parse(readFileSync(path.join(contract.dir, file), 'utf8'))
    } catch {
      return null
    }
  }
  return {
    id: String(contract.id),
    dir: String(contract.dir),
    fallbackFrom: contract.fallbackFrom ?? null,
    /** @returns {{ key: string, entity: string, type: string, sample?: unknown, label?: string }[]} */
    slots() {
      const map = json('content-map.json')
      return Array.isArray(map?.slots) ? map.slots : []
    },
    lock: () => json('presentation-lock.json')
  }
}
