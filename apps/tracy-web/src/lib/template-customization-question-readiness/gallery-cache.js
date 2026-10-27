/**
 * Which releases Design inspiration shows, and which of their assets the Template Customization
 * Question Readiness check needs in a download cache. Pure: the downloader script
 * (`scripts/template-customization-question-readiness-download.mjs`) does the network part.
 *
 * The gallery is `GET /api/templates` (public). Its rows come from `templateCards` in
 * `../quickstart-releases.js`, where `platforms[].tag` is the release's own GitHub `tag_name`
 * (`r.tag`, written by `readingOf` from `release.tag_name`) and `platforms[].version` is the
 * setting's `version`. So the tag is used as given; only a `local/` pack (a folder on that server,
 * `local-releases.js`) has no GitHub release and is left out.
 */
import { isLocalTag } from '../local-releases.js'
import { themeZipsOfSetting } from './readers/theme-zips.js'

/** A release tag as `ja-products` spells them: `quickstart/ja-essence/j6`, `tracy-business/emdash-0.x`. */
const TAG = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*){1,2}$/

/** One asset name the cache may hold (the same rule `release-source.js` reads by). */
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

/**
 * @typedef {{ template: string, platform: string, version: string, tag: string }} GalleryRelease
 */

/**
 * The GitHub releases behind every card of a `GET /api/templates` answer, in the gallery's order.
 * @param {any} body the parsed answer, `{ readAt, templates: [{ id, platforms: [{ platform, tag, version }] }] }`
 * @returns {{ releases: GalleryRelease[], skipped: string[] }} `skipped` says why a platform row was left out
 */
export function galleryReleases(body) {
  /** @type {GalleryRelease[]} */
  const releases = []
  /** @type {string[]} */
  const skipped = []
  const seen = new Set()
  for (const t of Array.isArray(body?.templates) ? body.templates : []) {
    for (const p of Array.isArray(t?.platforms) ? t.platforms : []) {
      const tag = p?.tag
      if (typeof tag !== 'string' || isLocalTag(tag)) {
        skipped.push(`${t?.id}: ${String(tag)} is not a GitHub release`)
        continue
      }
      if (!TAG.test(tag)) {
        skipped.push(`${t?.id}: "${tag}" is not a release tag`)
        continue
      }
      if (seen.has(tag)) continue
      seen.add(tag)
      releases.push({ template: String(t.id), platform: String(p.platform), version: String(p.version), tag })
    }
  }
  return { releases, skipped }
}

/** The small assets: every JSON file of the release, plus its checksums. */
export const isSmallAsset = (/** @type {string} */ name) => name.endsWith('.json') || name === 'SHA256SUMS'

/**
 * The assets of one release the check reads, beyond the small ones: what
 * `readers/release-content.js` opens for the setting's platform.
 *
 * - the demo database (`install.database`), else the Joomla installer zip (`install.installer`);
 * - the EmDash source zip (`install.source`);
 * - the WordPress theme zip the readers open first (`themeZipOf`): only that one is kept, so the
 *   download and a full `gh release download` read the same theme;
 * - the webroot tar.gz only when asked (`withWebroot`): `themeFile` falls back to it, and it is large.
 * An Akeeba `bundle` is never fetched: the readers report it `live-only` without opening it.
 * @param {Record<string, any>} setting the release's `tracy_setting.json`
 * @param {string[]} names every asset name of the release
 * @param {{ withWebroot?: boolean }} [opts]
 * @returns {string[]}
 */
export function contentAssetsOf(setting, names, { withWebroot = false } = {}) {
  const install = setting?.install ?? {}
  const want = new Set()
  const named = (/** @type {string} */ part) => {
    const file = install[part]?.file
    if (typeof file === 'string' && names.includes(file)) want.add(file)
  }
  if (install.database) named('database')
  else named('installer')
  named('source')
  if (withWebroot) named('webroot')
  const theme = themeZipOf(setting, names)
  if (theme) want.add(theme)
  return [...want].filter((n) => ASSET_NAME.test(n))
}

/**
 * The WordPress theme zip a reader opens first for this release, or null when it carries none: the
 * one ordering `readers/theme-zips.js` gives, with the template id as the theme folder. A theme zip
 * is named after the THEME's version, which need not be the release's (JA Morgan 1.1.12 ships
 * `wp-ja-morgan-1.1.11.zip`), so picking by the release version alone found nothing and the server
 * read no theme at all (12/10/2026).
 * @param {Record<string, any>} setting the release's `tracy_setting.json`
 * @param {string[]} names every asset name of the release
 * @returns {string | null}
 */
export function themeZipOf(setting, names) {
  if (setting?.platform !== 'wordpress') return null
  return themeZipsOfSetting(setting, names)[0] ?? null
}
