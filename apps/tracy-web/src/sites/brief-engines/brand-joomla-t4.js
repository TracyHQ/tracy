/**
 * The T4 half of the Joomla brand writer (plan T20): a T4 template keeps its logo, name and favicon in a site profile
 * FILE per template style (`etc/site/<profile>.json`), reached through the plugin's `template.siteSettings` (Claude
 * Cowork for Joomla 0.23.0): read the profiles the site's styles use, then ONE `set` with each profile's own values.
 *
 *   site_logo              the logo for that profile's header (dark profile → the dark-background logo)
 *   site_logo_dark, site_logo_2   the dark-background logo (Nova and Podcast dark mode; Spa's overlay)
 *   site_logo_small, site_logo_dark_small   emptied where the demo set one: empty shows the main logo on phones too
 *   site_name              the customer's name, only where the demo wrote its own name
 *   other_faviconFile      the favicon
 *
 * A spot the customer gave no logo for is emptied (`""`): T4 then prints the name as text (Q7) rather than the demo's
 * logo. No logo at all leaves every logo key as the template has it (LOGO-4 dropped, 09/10/2026).
 * 🔒 THE UNDO IS THE PLUGIN'S: one step per `set`, recorded under the brand apply id (plugin README "A template's logo,
 * name and favicon").
 */
import { darkSpotsOf, roleOf, variantFor } from './brand-joomla-places.js'

const SMALL_KEYS = ['site_logo_small', 'site_logo_dark_small']

/**
 * @param {object} input
 * @param {string} input.folder @param {any} input.profile @param {string} [input.name]
 * @param {{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}} input.logos
 * @param {boolean} [input.nameFallback] - a brief build: a key whose logo could not be uploaded is emptied, so T4 prints
 *   the name rather than the template's logo
 * @param {boolean} [input.textLogo] - no logo of the business: every logo key the demo set is emptied, so T4 prints the name
 * @param {string | null} input.favicon - the uploaded favicon's path
 * @param {any} input.settings - the `template.siteSettings` read
 * @param {(role: string, where: string) => Promise<string | null>} input.upload
 * @param {Function} input.write
 * @param {(where: string) => void} input.wrote @param {(where: string, reason: string) => void} input.skip
 * @returns {Promise<{used: Set<string>, ok: boolean}>}
 */
export async function writeT4Profiles({
  folder,
  profile,
  name,
  logos,
  textLogo = false,
  nameFallback = false,
  favicon,
  settings,
  upload,
  write,
  wrote,
  skip
}) {
  const used = new Set()
  const anyLogo = Object.keys(logos).length > 0
  const dark = darkSpotsOf(profile)
  const profiles = settings?.profiles && typeof settings.profiles === 'object' ? settings.profiles : {}
  /** @type {Record<string, Record<string, string>>} */
  const byProfile = {}
  const did = new Set()
  for (const [profileName, entry] of Object.entries(profiles)) {
    const current = entry?.settings && typeof entry.settings === 'object' ? entry.settings : {}
    /** @type {Record<string, string>} */
    const values = {}
    if (anyLogo) {
      for (const key of ['site_logo', 'site_logo_dark', 'site_logo_2']) {
        if (key !== 'site_logo' && !Object.hasOwn(current, key)) continue
        const variant = variantFor(logos, dark.t4(profileName, key))
        const path = variant
          ? await upload(roleOf(variant), key === 'site_logo' ? 'logo' : 'logo-dark')
          : null
        // An upload the site refused leaves the template's logo, unless the spot falls back to the name (a brief build).
        if (variant && !path && !nameFallback) continue
        values[key] = path ?? ''
        if (path) {
          used.add(variant)
          did.add(key === 'site_logo' ? 'logo' : 'logo-dark')
        }
      }
      for (const key of SMALL_KEYS) if (String(current[key] ?? '') !== '') values[key] = ''
    }
    if (textLogo && !anyLogo) {
      for (const key of ['site_logo', 'site_logo_dark', 'site_logo_2', ...SMALL_KEYS])
        if (String(current[key] ?? '') !== '') {
          values[key] = ''
          did.add('logo-text')
        }
    }
    if (name && String(current.site_name ?? '') !== '' && current.site_name !== name) {
      values.site_name = name
      did.add('site_name')
    }
    if (favicon) {
      values.other_faviconFile = favicon
      did.add('favicon')
    }
    for (const [key, value] of Object.entries(values)) if (current[key] === value) delete values[key]
    if (Object.keys(values).length) byProfile[profileName] = values
  }
  if (!Object.keys(byProfile).length) return { used, ok: true }
  try {
    await write('template.siteSettings', { operation: 'set', template: folder, profiles: byProfile })
    for (const where of did) wrote(where)
    return { used, ok: true }
  } catch (error) {
    const why = `the site refused its logo settings (${error instanceof Error ? error.message : error})`
    if (anyLogo) skip('logo', why)
    if (favicon) skip('favicon', why)
    return { used: new Set(), ok: false }
  }
}
