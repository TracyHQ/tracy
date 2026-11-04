// The Claude Cowork release a site runs, and whether it is a given release or later. Shared: the brief engines' brand
// writers and the T4 page background (joomla-t4-body-background.js) read it, so it lives in lib/ (module-graph.test.mjs).

/** `x.y.z` (a leading `v` and a suffix allowed) as three numbers, or null. */
function semverOf(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ''))
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** True when `version` is `since` or later; null when `version` cannot be read. */
export function versionAtLeast(version, since) {
  const have = semverOf(version)
  const want = semverOf(since)
  if (have === null || want === null) return null
  for (let i = 0; i < 3; i += 1) if (have[i] !== want[i]) return have[i] > want[i]
  return true
}

/** The plugin's own version, or null when the site does not say. */
export async function componentOf(/** @type {Function} */ read) {
  const info = await read('info', {}).catch(() => null)
  return info?.ok === false ? null : (info?.info?.component ?? null)
}
