/**
 * The WordPress theme zips a release attaches, in the order a reader should open them:
 *
 *   themeZipsInOrder(['wp-ja-kinetic-1.0.0.zip', 'wp-ja-kinetic-1.1.9.zip', 'wp-ja-kinetic-1.0.7.zip'],
 *     'wp-ja-kinetic', '1.0.7')
 *   // ['wp-ja-kinetic-1.0.7.zip', 'wp-ja-kinetic-1.1.9.zip', 'wp-ja-kinetic-1.0.0.zip']
 *
 * A release may keep old cuts attached (JA Kinetic 1.0.7 carries 1.0.0 to 1.1.9), so a reader that
 * took the first by name read an old theme. First the zip of the release's own version, then the
 * unversioned zip of the theme (`wp-tracy-business.zip`), then the theme's other zips newest first
 * by semantic version, then any other `wp-*.zip`. A zip of the theme may lack the wp- prefix
 * (`tracy-base-1.1.5.zip`). The name only orders: a reader opens each zip in turn and takes the
 * first that holds the file it wants, so a zip that is not the theme is passed over by its content.
 */

/** The version at the end of a zip name: `wp-ja-kinetic-1.1.9.zip`, `tracy-base-1.1.5.zip`. */
const VERSIONED = /-(\d+(?:\.\d+)*)\.zip$/

const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** @param {string} v */
const parts = (v) => v.split('.').map(Number)

/** @param {string} a @param {string} b newest first */
const newestFirst = (a, b) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (y[i] ?? 0) - (x[i] ?? 0)
    if (d) return d
  }
  return 0
}

/**
 * @param {string[]} names every file name of the release
 * @param {string | null | undefined} stylesheet the active theme's folder (option `stylesheet`), when known
 * @param {string} version the release's version
 * @returns {string[]}
 */
export function themeZipsInOrder(names, stylesheet, version) {
  const theme = String(stylesheet ?? '').replace(/^wp-/, '')
  // A zip of this theme, with or without the wp- prefix and the version (Tracy Base ships
  // `tracy-base-1.1.5.zip`, the JA ports `wp-ja-morgan-1.1.11.zip`, 12/10/2026).
  const own = theme ? new RegExp(`^(?:wp-)?${escape(theme)}(?:-\\d+(?:\\.\\d+)*)?\\.zip$`) : null
  const rank = (/** @type {string} */ n) => {
    const v = VERSIONED.exec(n)?.[1]
    const mine = own?.test(n) ?? false
    if (v === version && (!theme || mine)) return 0
    if (mine && !v) return 1
    if (mine) return 2
    return v ? 3 : 4
  }
  return names
    .filter(
      (n) => /^wp-.+\.zip$/.test(n) || (own?.test(n) ?? false) || (!!stylesheet && n === `${stylesheet}.zip`)
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        newestFirst(VERSIONED.exec(a)?.[1] ?? '0', VERSIONED.exec(b)?.[1] ?? '0') ||
        a.localeCompare(b)
    )
}

/**
 * The theme zips of a release in reading order, from its `tracy_setting.json` alone (before the
 * demo database names the active theme): the template id stands for the theme folder, else the
 * theme of the one zip without a version (`wp-ja-impact.zip`). The server downloads the first
 * (`gallery-cache.js` `themeZipOf`) and the readers open them in this order, so both read the same
 * theme.
 * @param {Record<string, any>} setting
 * @param {string[]} names
 */
export function themeZipsOfSetting(setting, names) {
  const template = typeof setting?.template === 'string' ? setting.template : ''
  const plain = names.find((n) => /^wp-.+\.zip$/.test(n) && !VERSIONED.test(n))
  const stylesheet = template ? `wp-${template.replace(/^wp-/, '')}` : (plain?.slice(0, -4) ?? null)
  return themeZipsInOrder(names, stylesheet, String(setting?.version ?? ''))
}
