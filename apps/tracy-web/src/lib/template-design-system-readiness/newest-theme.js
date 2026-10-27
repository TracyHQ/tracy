/**
 * The theme zips of a WordPress release, NEWEST theme version first: what the Template Design System
 * Readiness check reads and downloads. Not the Customize your site order (`themeZipsOfSetting`, "this
 * version's zip first"): a WordPress theme updates itself on every running site (`update.json` on
 * claude-cowork), so the theme a customer wears — and the one the Design system door compares with
 * `maxVersion` — is the newest released one, which the release carries as its newest zip. JA Impact
 * quickstart 1.0.9 carries theme zips 1.0.9 and 1.0.10: "this version's first" read the older theme
 * (13/10/2026). A zip without a version in its name comes after every versioned one.
 */
import { themeZipsOfSetting } from '../template-customization-question-readiness/readers/theme-zips.js'

const versionOf = (/** @type {string} */ name) => /-(\d+(?:\.\d+)*)\.zip$/.exec(name)?.[1] ?? null

/** @param {string} a @param {string} b */
function newerFirst(a, b) {
  const [x, y] = [versionOf(a), versionOf(b)]
  if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1
  const [p, q] = [x.split('.').map(Number), y.split('.').map(Number)]
  for (let i = 0; i < Math.max(p.length, q.length); i += 1) {
    const d = (q[i] ?? 0) - (p[i] ?? 0)
    if (d) return d
  }
  return 0
}

/**
 * @param {Record<string, any>} setting the release's `tracy_setting.json`
 * @param {string[]} names every asset name of the release
 * @returns {string[]}
 */
export const newestThemeZips = (setting, names) => [...themeZipsOfSetting(setting, names)].sort(newerFirst)
