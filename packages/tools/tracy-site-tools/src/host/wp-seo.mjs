/**
 * A WORDPRESS PAGE'S OWN SEARCH TITLE AND DESCRIPTION — where they live on a site, read off the Claude
 * Cowork plugin's own `wordpress/cowork/lib/SeoFields.php` (TracyHQ/claude-cowork#119) and pinned to it by
 * `test/fixtures/wp-seo-meta.json`.
 *
 * WordPress prints no meta description and builds `<title>` from the post title, so on a site with no SEO
 * plugin a page's search title had no place of its own: the agent renamed the page, and its breadcrumb and
 * heading with it (05/10/2026, Tracy Business wp7). From `WP_SEO_META.since` the plugin keeps both in its own
 * post meta and prints them itself — but only while no SEO plugin runs: with Yoast or Rank Math their keys
 * are the ones printed, and the others keep them where no door of the plugin writes.
 *
 * Plain data and pure functions: `normalize.mjs` reads the site (plugin list, version) and asks these.
 */

/**
 * The plugin's own keys, and the first plugin version that prints them. `since` is the proposed release
 * number of #119; re-pin it (and the fixture) to the released tag.
 */
export const WP_SEO_META = Object.freeze({
  title: '_claude_cowork_seo_title',
  description: '_claude_cowork_seo_description',
  since: '0.18.0'
})

/**
 * @typedef {{ id: string, name: string, folders: readonly string[], module?: string,
 *   title: string | null, description: string | null }} WpSeoPlugin
 *   `title`/`description`: the post meta that plugin prints, when a write there shows; null when it keeps
 *   them where no door writes (its own table or settings). `module`: printed only with that Jetpack module on.
 */

/**
 * The SEO plugins `SeoFields::PLUGINS` stands aside for, in its order, by the folder they install under.
 * @type {readonly WpSeoPlugin[]}
 */
export const WP_SEO_PLUGINS = Object.freeze(
  [
    {
      id: 'yoast',
      name: 'Yoast SEO',
      folders: ['wordpress-seo', 'wordpress-seo-premium'],
      title: '_yoast_wpseo_title',
      description: '_yoast_wpseo_metadesc'
    },
    {
      id: 'rank-math',
      name: 'Rank Math',
      folders: ['seo-by-rank-math', 'seo-by-rank-math-pro'],
      title: 'rank_math_title',
      description: 'rank_math_description'
    },
    {
      id: 'aioseo',
      name: 'All in One SEO',
      folders: ['all-in-one-seo-pack', 'all-in-one-seo-pack-pro'],
      title: null,
      description: null
    },
    {
      id: 'seopress',
      name: 'SEOPress',
      folders: ['wp-seopress', 'wp-seopress-pro'],
      title: null,
      description: null
    },
    {
      id: 'the-seo-framework',
      name: 'The SEO Framework',
      folders: ['autodescription'],
      title: null,
      description: null
    },
    { id: 'slim-seo', name: 'Slim SEO', folders: ['slim-seo'], title: null, description: null },
    { id: 'squirrly', name: 'Squirrly SEO', folders: ['squirrly-seo'], title: null, description: null },
    {
      id: 'smartcrawl',
      name: 'SmartCrawl',
      folders: ['smartcrawl-seo', 'wpmu-dev-seo'],
      title: null,
      description: null
    },
    { id: 'surerank', name: 'SureRank', folders: ['surerank'], title: null, description: null },
    {
      id: 'jetpack-seo',
      name: 'Jetpack SEO',
      folders: ['jetpack'],
      module: 'seo-tools',
      title: null,
      description: null
    }
  ].map((row) => Object.freeze({ ...row, folders: Object.freeze(row.folders) }))
)

/** @param {unknown} v @returns {v is Record<string, any>} */
const seoRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * The active plugin folders a `plugin.list` answer names (`{file:"wordpress-seo/wp-seo.php", active:true}`).
 * @param {unknown} rows
 * @returns {Set<string>}
 */
export function activeFolders(rows) {
  /** @type {Set<string>} */
  const folders = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!seoRecord(row) || row.active !== true || typeof row.file !== 'string') continue
    folders.add(row.file.split('/')[0])
  }
  return folders
}

/**
 * The SEO plugin a site runs, as `SeoFields::running()` decides it, or null.
 * @param {Set<string>} folders - `activeFolders` of its plugin list.
 * @param {unknown} modules - Jetpack's `jetpack_active_modules` option, when Jetpack is active.
 * @returns {WpSeoPlugin | null}
 */
export function seoPluginOf(folders, modules) {
  for (const plugin of WP_SEO_PLUGINS) {
    if (!plugin.folders.some((folder) => folders.has(folder))) continue
    if (plugin.module !== undefined && !(Array.isArray(modules) && modules.includes(plugin.module))) continue
    return plugin
  }
  return null
}

/**
 * The Claude Cowork version an `info` answer gives: `info.component`, the field both engines answer (the
 * same reading as Add site's, `tracy-add-site/src/host/wordpress.ts`), or null.
 * @param {unknown} answer
 * @returns {string | null}
 */
export function componentVersion(answer) {
  if (!seoRecord(answer)) return null
  const info = seoRecord(answer.info) ? answer.info : {}
  const v = info.component ?? info.version ?? answer.component ?? answer.version
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Whether `version` is `floor` or later, both `x.y.z` (a pre-release suffix is read as its release). A
 * version that cannot be read is not one that prints anything: false.
 * @param {string | null} version
 * @param {string} floor
 * @returns {boolean}
 */
export function versionAtLeast(version, floor) {
  const parse = (/** @type {string | null} */ v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? '').trim())
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const a = parse(version)
  const b = parse(floor)
  if (a === null || b === null) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}
