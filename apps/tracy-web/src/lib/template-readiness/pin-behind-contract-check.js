/**
 * The pin behind the latest contract check of the readiness verdict (ticket #437, piece `quickstart-release`): the
 * quickstart list (`quickstarts.json`) pins a version of the template, and the contract folder of that template may
 * already hold a newer contract. A contract cut for a version the list does not pin is work nobody can reach: sites
 * are built from the pinned version, so the pin is the thing to move once that version is released.
 *
 *   null   the release is at the newest contract version of its template: nothing to flag
 *   todo   a contract exists for a newer version (`pin-behind-contract`, `{ pinned, latest, fix }`)
 *

 * A passing check says nothing, so the piece code a Road to live step already gave is not replaced by it.
 * The contracts come from the index the verdict is already handed; nothing is read from GitHub. Not judged (null):
 * a release without a semantic version, or a template with no contract at all (the contract step says that).
 */
import { fixOf } from './fixes.js'

const semver = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''))
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])]
}
/** True when version triple `a` is above `b`. */
const newer = (a, b) => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0

/** The newest contract version cut for a release tag, or null. @param {Map<string, any>} contracts */
export function latestContractVersion(contracts, tag) {
  let best = null
  for (const key of contracts.keys()) {
    if (!key.startsWith(`${tag}@`)) continue
    const have = semver(key.slice(tag.length + 1))
    if (have !== null && (best === null || newer(have, best))) best = have
  }
  return best === null ? null : best.join('.')
}

export const PIN_BEHIND_CHECK = Object.freeze({
  piece: 'quickstart-release',
  step: 'pin-behind-contract',
  judge(release, world) {
    const pinned = release?.setting?.version
    if (semver(pinned) === null || typeof release?.tag !== 'string') return null
    const latest = latestContractVersion(world?.contracts ?? new Map(), release.tag)
    if (latest === null) return null
    if (!newer(semver(latest), semver(pinned))) return null
    return {
      state: 'todo',
      code: 'pin-behind-contract',
      params: {
        pinned,
        latest,
        fix: fixOf('pin-behind-contract', { pinned, latest }).text
      }
    }
  }
})
