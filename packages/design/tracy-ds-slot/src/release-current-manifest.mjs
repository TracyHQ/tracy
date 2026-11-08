// Which manifest a cut starts from (release-joomla.mjs). The release's own manifest.json is its current state, unless
// it is an older single-zip manifest, or the cut names `--from` another version: a version re-cut before its switch
// is flipped (JA Voyara 1.0.12, 06/11/2026) has its own manifest uploaded already, and the cut must start again from
// the version the switch still serves, read from that version's tch contract.

/**
 * @param {any} manifest the release's manifest.json, parsed
 * @param {string | null | undefined} from the `--from` version, if any
 * @returns {string | null} why the release manifest is not the base of this cut, null when it is
 */
export function releaseManifestRefusal(manifest, from) {
  if (!manifest?.platform || !manifest?.parts) return 'stale manifest'
  if (from && manifest.version !== from)
    return `the release manifest is ${manifest.version}, the cut starts from ${from}`
  return null
}
