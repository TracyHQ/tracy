/**
 * Which assets of a release the Template Design System Readiness check reads, beyond its small JSON
 * files: the archive that holds the template's stylesheets. Pure: the server's background check
 * (`../design-system-readiness.js`) and the local command (`scripts/template-design-system-readiness.mjs
 * --fetch`) download exactly these, one at a time, never the whole release (a Joomla release keeps
 * every older webroot attached, several hundred megabytes).
 *
 * - Joomla: the `installer` zip when the setting names one, else the `webroot` tar.gz;
 * - WordPress: the newest theme zip (`newestThemeZips`: the theme running sites update to), else the webroot;
 * - EmDash: the source zip (`install.source`).
 * And, for PIC-1 (an icon picture drawn in the brand colour, wherever the content shows it): the demo
 * database (`install.database`) of a WordPress or Joomla release, and a WordPress release's webroot,
 * which holds the media library's SVG files (a Joomla webroot or installer is already read).
 */
import { isSmallAsset } from '../template-customization-question-readiness/gallery-cache.js'
import { newestThemeZips } from './newest-theme.js'

/** One asset name the cache may hold (the rule `release-source.js` reads by). */
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

/**
 * @param {Record<string, any>} setting the release's `tracy_setting.json`
 * @param {string[]} names every asset name of the release
 * @returns {string[]} the assets to download, small ones first
 */
export function dsAssetsOf(setting, names) {
  const install = setting?.install ?? {}
  const has = (/** @type {unknown} */ file) => typeof file === 'string' && names.includes(file)
  const want = new Set(names.filter(isSmallAsset))
  if (setting?.platform === 'joomla') {
    if (has(install.installer?.file)) want.add(install.installer.file)
    else if (has(install.webroot?.file)) want.add(install.webroot.file)
    if (has(install.database?.file)) want.add(install.database.file)
  } else if (setting?.platform === 'wordpress') {
    const theme = newestThemeZips(setting, names)[0]
    if (theme) want.add(theme)
    if (has(install.webroot?.file)) want.add(install.webroot.file)
    if (has(install.database?.file)) want.add(install.database.file)
  } else if (setting?.platform === 'emdash') {
    if (has(install.source?.file)) want.add(install.source.file)
  }
  return [...want].filter((n) => ASSET_NAME.test(n))
}
