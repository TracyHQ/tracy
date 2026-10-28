/**
 * The measured content coverage of the contract that seals a release, read from the contract folder
 * itself (`content-coverage.json` beside `content-map.json`, committed by whoever ran the audit; in
 * the image through the same Dockerfile COPY as the contract). /ops only reads it, like the Design
 * system measurement file (spec decision 15 of tasks/spec-template-design-system-readiness.md).
 *
 * 🔒 A FILE COUNTS ONLY FOR THE EXACT MAP AND LOCK IT MEASURED. It names the contract id and the
 * sha256 of `content-map.json` and `presentation-lock.json`; capture the contract again and the old
 * measurement is stale, never a pass.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { coverageFileProblem } from './judge.js'

export const COVERAGE_FILE = 'content-coverage.json'

/**
 * @typedef {{ state: 'none' } | { state: 'invalid', reason: string } | { state: 'stale', reason: string, doc: any } | { state: 'measured', doc: any }} Coverage
 */

/** @type {Map<string, { stamp: string, value: Coverage }>} */
const memo = new Map()

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
// A file's stamp: modification time in nanoseconds plus size. A write inside the clock's
// granularity can keep the time, so the memo below also refuses to trust a stamp that is too
// recent (the racy-file rule git uses for its index).
const mtime = (file) => {
  try {
    const stat = statSync(file, { bigint: true })
    return `${stat.mtimeNs}:${stat.size}`
  } catch {
    return 'missing'
  }
}

/** A stamp read this close to a file's last write may hide a second write in the same tick. */
const RACY_MS = 2000

/** @param {string} stamp */
const newestWriteMs = (stamp) =>
  Math.max(
    0,
    ...stamp
      .split('|')
      .filter((part) => part !== 'missing')
      .map((part) => Number(BigInt(part.split(':')[0]) / 1000000n))
  )

/**
 * @param {{ id: string, dir?: string } | null | undefined} contract what `contractFor` answered
 * @returns {Coverage}
 */
export function coverageOfContract(contract) {
  if (!contract?.dir) return { state: 'none' }
  const file = path.join(contract.dir, COVERAGE_FILE)
  const map = path.join(contract.dir, 'content-map.json')
  const lock = path.join(contract.dir, 'presentation-lock.json')
  // Re-read only when one of the three files changed: /ops builds every road on each list read.
  const stamp = [file, map, lock].map(mtime).join('|')
  const seen = memo.get(file)
  if (seen && seen.stamp === stamp && seen.readAt - newestWriteMs(stamp) > RACY_MS) return seen.value
  const value = readCoverage(contract, { file, map, lock })
  memo.set(file, { stamp, value, readAt: Date.now() })
  return value
}

/** @returns {Coverage} */
function readCoverage(contract, { file, map, lock }) {
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return { state: 'none' }
    return { state: 'invalid', reason: `${COVERAGE_FILE} is not valid JSON` }
  }
  const problem = coverageFileProblem(doc)
  if (problem) return { state: 'invalid', reason: problem }
  if (doc.contract?.id !== contract.id)
    return { state: 'stale', doc, reason: `it measured ${String(doc.contract?.id)}, not ${contract.id}` }
  try {
    if (doc.contract?.contentMapSha256 !== sha256(map))
      return { state: 'stale', doc, reason: 'content-map.json changed after it was measured' }
    if (doc.contract?.presentationLockSha256 !== sha256(lock))
      return { state: 'stale', doc, reason: 'presentation-lock.json changed after it was measured' }
  } catch {
    return { state: 'invalid', reason: 'the contract files beside it cannot be read' }
  }
  return { state: 'measured', doc }
}
