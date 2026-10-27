/**
 * The newest version of a Joomla or WordPress release is cut in TWO places of this repo, and one without the
 * other is a release /ops refuses (REL-3, FAV-1, LOGO-1..3, STAB-1 of the Customize your site check):
 *   - a row in `template-profiles.json` (how the template takes the customer's brand), and
 *   - a content contract profile (`packages/cms/tracy-<cms>-quickstart/contracts/<release>/<version>/`).
 *
 * WHY THIS IS A GATE (15/10/2026). `tracy-business/wp7` 1.3.7 was uploaded with neither, and dev /ops showed
 * "Contract from an older version" and six must-fix items. The `design-templates` gate holds the gallery to
 * the profile table only when it can read GitHub (`TRACY_RELEASES_GITHUB_TOKEN`), which CI has not, so a
 * half-done cut — a contract captured and the row forgotten, or the other way — went green. This check reads
 * the repo alone: for each release, its newest contract needs an exact row, and its newest row an exact
 * contract. EmDash carries no contract profile and is skipped. A release cut with NEITHER is still only seen
 * by the readiness check on the release folder (`scripts/template-customization-question-readiness.mjs`),
 * which is why that check runs on the local pack before upload (docs/references/quickstart-release.md).
 */

/** @param {string} v @returns {number[] | null} */
function semverOf(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** @param {string[]} versions @returns {string | null} the highest x.y.z of the list */
function newest(versions) {
  let best = null
  let bestSemver = null
  for (const v of versions) {
    const s = semverOf(v)
    if (s === null) continue
    if (bestSemver === null || (s[0] - bestSemver[0] || s[1] - bestSemver[1] || s[2] - bestSemver[2]) > 0) {
      best = v
      bestSemver = s
    }
  }
  return best
}

const CONTRACT_CMS = /\/(j|wp)\d+$/

/**
 * Every release whose newest contract has no exact profile row, or whose newest profile row has no exact
 * contract, as sentences naming both sides. Empty is clean.
 * @param {any} table the parsed `template-profiles.json`
 * @param {Map<string, any>} contracts the index `readContracts` builds (keys `<release>@<version>`)
 * @param {{ owed?: string[] }} [opts] `<release>@<version>` pairs known to be missing, each named in the gate
 * @returns {string[]}
 */
export function contractPairProblems(table, contracts, { owed = [] } = {}) {
  const owedSet = new Set(owed)
  /** @type {Map<string, string[]>} */
  const contractVersions = new Map()
  for (const key of contracts.keys()) {
    const at = key.lastIndexOf('@')
    const release = key.slice(0, at)
    if (!CONTRACT_CMS.test(release)) continue
    contractVersions.set(release, [...(contractVersions.get(release) ?? []), key.slice(at + 1)])
  }
  const releases = table?.releases ?? {}
  const problems = []
  for (const [release, versions] of contractVersions) {
    const top = newest(versions)
    if (top === null || owedSet.has(`${release}@${top}`)) continue
    const rows = releases[release]
    if (rows && Object.hasOwn(rows, top)) continue
    const have = rows ? newest(Object.keys(rows)) : null
    problems.push(
      `${release}@${top} has a contract profile but template-profiles.json has no row for it${have ? ` (newest row ${have})` : ''}: measure the release and add the row`
    )
  }
  for (const [release, rows] of Object.entries(releases)) {
    if (!CONTRACT_CMS.test(release) || !rows || typeof rows !== 'object') continue
    const top = newest(Object.keys(rows))
    if (top === null || owedSet.has(`${release}@${top}`) || contracts.has(`${release}@${top}`)) continue
    const have = newest(contractVersions.get(release) ?? [])
    problems.push(
      `${release}@${top} has a template-profiles.json row but no contract profile seals it${have ? ` (newest contract ${have})` : ''}: capture the contract from that release`
    )
  }
  // An owed pair that is paid (row and contract both there) or no longer the newest leaves the list.
  for (const pair of owedSet) {
    const at = pair.lastIndexOf('@')
    const release = pair.slice(0, at)
    const version = pair.slice(at + 1)
    const stillMissing =
      contracts.has(pair) &&
      !Object.hasOwn(releases[release] ?? {}, version) &&
      newest(contractVersions.get(release) ?? []) === version
    if (!stillMissing)
      problems.push(`${pair} is listed as owed but is no longer missing: remove it from the owed list`)
  }
  return problems
}
