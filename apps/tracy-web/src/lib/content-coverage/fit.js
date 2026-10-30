/**
 * The Slot fit group of Content coverage (ADR 0039 decision 7): whether the content map of a release says the shape of
 * every text and image slot (`fit`), read with the contract check of the Website Opportunities domain
 * (`checkContentMapFit`, the same check the `slot-roles` gate runs). PURE reading, no verdict: `judge.js` (`judgeFit`)
 * decides what holds Publish.
 *
 *   ready     the map declares Slot fit and every text and image slot carries a well-formed fit;
 *   missing   the map declares Slot fit but text or image slots have none (`count`, the first eight keys in `shown`);
 *   invalid   the declaration is broken (`reason`): a malformed fit, a wrong version, or a picture whose
 *             `customize: "keep"` disagrees with its measured kind;
 *   none      the map declares no Slot fit at all: every contract captured before ADR 0039 (`count` and `shown` then
 *             name every text and image slot, since none has a fit).
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { checkContentMapFit } from 'website-opportunities/domain'

import { contractFor } from '../contracts.js'

/** How many slot keys the group names itself. */
const SHOWN_KEYS = 8

/**
 * @typedef {{ state: 'ready' } | { state: 'missing' | 'none', count: number, shown: string[] } | { state: 'invalid', reason: string }} Fit
 */

/** @type {Map<string, { stamp: string, value: Fit }>} */
const memo = new Map()

const mtime = (file) => {
  try {
    return String(statSync(file).mtimeMs)
  } catch {
    return 'missing'
  }
}

/**
 * The Slot fit group of one content map.
 * @param {any} contentMap the parsed `content-map.json`, or null when there is none
 * @returns {Fit}
 */
export function fitOfContentMap(contentMap) {
  const check = checkContentMapFit(contentMap ?? { slots: [] })
  const keys = check.missingKeys
  const counted = { count: keys.length, shown: keys.slice(0, SHOWN_KEYS) }
  if (!check.declared) return { state: 'none', ...counted }
  if (keys.length > 0) return { state: 'missing', ...counted }
  if (!check.ok) return { state: 'invalid', reason: String(check.errors[0]) }
  return { state: 'ready' }
}

/** @param {string} dir */
function contentMapIn(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * The Slot fit group of a release: the content map of the contract that seals its version.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 * @returns {Fit}
 */
export function fitOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  const dir = contractFor(contracts, release?.tag, version)?.dir ?? null
  if (!dir) return fitOfContentMap(null)
  // Re-read only when the map changed: /ops builds every road on each list read.
  const stamp = mtime(path.join(dir, 'content-map.json'))
  const seen = memo.get(dir)
  if (seen && seen.stamp === stamp) return seen.value
  const value = fitOfContentMap(contentMapIn(dir))
  memo.set(dir, { stamp, value })
  return value
}
