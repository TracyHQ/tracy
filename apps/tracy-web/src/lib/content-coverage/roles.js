/**
 * The slot roles group of Content coverage (ADR 0038): which text and image slots of the content map have no role, read
 * through the shared reader (`../contract-slot-roles.js`, content map first, then the sidecar of the three contracts
 * released with one). PURE reading, no verdict: `judge.js` (`judgeRoles`) decides what holds Publish.
 *
 *   ready     every text and image slot has a role and the declaration is valid (or the sidecar is current, no gaps);
 *             `lint` counts the declaration rule warnings of the packing check, when there are any;
 *   missing   text or image slots have no role (`count`, and the first eight keys in `shown`);
 *   invalid   the declaration is broken (`reason` says how), or a declaration rule of severity error fails;
 *   stale     the sidecar was written for other contract files (`reason`);
 *   none      the contract declares no roles anywhere: every template released before ADR 0038.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { lintContractDir, lintSummary } from '../content-map-lint.js'
import { readSlotRoles } from '../contract-slot-roles.js'
import { contractFor } from '../contracts.js'
import { slotRolesOfRelease } from '../slot-roles-of-release.js'

/** How many slot keys the group names itself. */
const SHOWN_KEYS = 8

/**
 * @typedef {{ errors: number, warnings: number, rules: Array<{ rule: string, severity: string, count: number }> }} Lint
 * @typedef {{ state: 'ready' | 'none', lint?: Lint } | { state: 'missing', count: number, shown: string[], reason: string | null } | { state: 'invalid' | 'stale', reason: string, lint?: Lint }} Roles
 */

/** @type {Map<string, { stamp: string, value: Roles }>} */
const memo = new Map()

const mtime = (file) => {
  try {
    return String(statSync(file).mtimeMs)
  } catch {
    return 'missing'
  }
}

/** Keys of the text and image slots of the content map in `dir` that carry no role. */
function slotsWithoutRole(dir) {
  try {
    const map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
    return (Array.isArray(map?.slots) ? map.slots : [])
      .filter((s) => (s?.type === 'text' || s?.type === 'image') && !Object.hasOwn(s, 'role'))
      .map((s) => String(s.key))
  } catch {
    return []
  }
}

/** The declaration rule counts the step carries: errors, warnings and one row per rule. */
const lintCounts = (lint) => ({
  errors: lint.errors,
  warnings: lint.warnings,
  rules: lintSummary(lint.findings)
})

const missing = (keys, reason = null) => ({
  state: 'missing',
  count: keys.length,
  shown: keys.slice(0, SHOWN_KEYS),
  reason
})

/**
 * @param {ReturnType<typeof readSlotRoles>} read what the shared reader answered
 * @param {string | null | undefined} dir the contract folder it read
 * @returns {Roles}
 */
export function rolesOfRead(read, dir) {
  if (read.source === 'content-map') {
    const keys = dir ? slotsWithoutRole(dir) : []
    if (keys.length > 0) return missing(keys)
    // "has no role" errors are the missing group above; anything else is a broken declaration
    const broken = (read.errors ?? []).filter((e) => !e.endsWith(' has no role'))
    if (read.state === 'invalid' && broken.length > 0) return { state: 'invalid', reason: broken[0] }
    // The packing check's declaration rules (`../content-map-lint.js`): an error is a declaration the brief engine would
    // write wrong, so it is a broken declaration here too; warnings and info ride along for the panel and never hold.
    const lint = dir ? lintContractDir(dir) : null
    const first = lint?.findings.find((f) => f.severity === 'error')
    if (first)
      return {
        state: 'invalid',
        reason: `declaration rule ${first.rule} (${lint.errors} error${lint.errors === 1 ? '' : 's'}): ${first.key} ${first.note}. Fix: ${first.fix}`,
        lint: lintCounts(lint)
      }
    return lint && lint.findings.length > 0 ? { state: 'ready', lint: lintCounts(lint) } : { state: 'ready' }
  }
  if (read.source === 'sidecar') {
    if (read.state === 'stale')
      return { state: 'stale', reason: 'the contract files changed after slot-roles.json was written' }
    if (read.state === 'invalid')
      return { state: 'invalid', reason: String(read.errors?.[0] ?? 'slot-roles.json is invalid') }
    if (read.doc?.status !== 'checked')
      return {
        state: 'invalid',
        reason: `slot-roles.json status is "${String(read.doc?.status ?? 'missing')}", expected "checked"`
      }
    return read.gaps.length > 0 ? missing(read.gaps.map(String)) : { state: 'ready' }
  }
  return { state: 'none' }
}

/**
 * The roles group of a release: the slot roles of the contract that seals its version.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 * @returns {Roles}
 */
export function rolesOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  const dir = contractFor(contracts, release?.tag, version)?.dir ?? null
  if (!dir) return rolesOfRead(slotRolesOfRelease(release, contracts), null)
  // Re-read only when a file changed: /ops builds every road on each list read.
  const stamp = ['content-map.json', 'slot-roles.json', 'manifest.json', 'presentation-lock.json']
    .map((f) => mtime(path.join(dir, f)))
    .join('|')
  const seen = memo.get(dir)
  if (seen && seen.stamp === stamp) return seen.value
  const value = rolesOfRead(readSlotRoles(dir), dir)
  memo.set(dir, { stamp, value })
  return value
}
