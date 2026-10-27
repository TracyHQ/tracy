/**
 * What `release-batch.mjs verify --baseline <dir>` names as the version it compared with, in
 * VERIFICATION.json. That file is uploaded with the release, so it names the baseline by its release
 * and version, never by the folder it was read from on the building machine. PURE.
 */

/**
 * @param {{ release?: string, product?: string, version?: string, builtFrom?: { change?: string } }} manifest
 *   the baseline folder's manifest.json
 * @param {string} tag  the release tag the new version is cut for, when the manifest names none
 * @returns {string}
 */
export function baselineAgainst(manifest, tag) {
  const name = `${manifest.release ?? tag}@${manifest.version ?? 'unknown'}`
  const change = manifest.builtFrom?.change
  return `${name} as built locally${change ? `: ${change}` : ''}`
}
