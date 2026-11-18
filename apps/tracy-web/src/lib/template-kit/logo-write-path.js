// How the write step writes one logo spot of a template kit, decided once for both the write step
// (`write-step/brand-write-orders.js`) and the Template kit gate of /ops (`flow-reads.js`, `kit-logo-unsettable`), so the
// gate never passes a spot the write step cannot write.
//
// A kit records where a logo lives as its framework keeps it. A T4 template keeps it in a key of its site profile
// (`site_logo`, ...), which `template.siteSettings` writes. A T3 template keeps it in a param of its template style
// (`logoimage`, ...); the site profile door refuses that key, and the content map holds the param as a frame
// (`templateStyle-9.0`) that the one contract call writes. So a setting goes through the profile only when it is a
// site profile key; any other spot is written through its frame, or not at all.
import { contentMapKey } from '../content-map-key.js'

/** The logo keys of a T4 site profile that `template.siteSettings` writes. */
export const PROFILE_LOGO_KEYS = new Set([
  'site_logo',
  'site_logo_dark',
  'site_logo_2',
  'site_logo_small',
  'site_logo_dark_small'
])
/**
 * The options a WordPress block theme keeps its logo in. The header (and footer) logo is a Site Logo block, which
 * prints the attachment of the `site_logo` option; a theme that reads a dark logo keeps it in `tracy_logo_dark`.
 */
export const WORDPRESS_LOGO_OPTIONS = new Set(['site_logo', 'tracy_logo_dark'])
/**
 * What an EmDash theme keeps its brand pictures in (the theme's `tools/personalize.mjs`, `writeBrand`): the light or only
 * logo is core `settings.logo` (`{mediaId, alt}`), the favicon core `settings.favicon`, and the dark-background logo the
 * image field `logo_dark` of the theme's chrome entry. Neither needs a content map slot: the settings door and the
 * schema door write them, so the kit names the place (`site.logoSpots[].setting`, `site.favicon.mechanism.setting`).
 */
export const EMDASH_LOGO_SETTINGS = new Set(['settings.logo', 'chrome.logo_dark'])
/** The phone menu's own picture of a main logo key. */
const SMALL_KEY = { site_logo: 'site_logo_small', site_logo_dark: 'site_logo_dark_small' }

const named = (value) => typeof value === 'string' && value !== ''

/**
 * @param {{ setting?: string | null, frameId?: string | null, where?: string }} spot a kit logo spot
 * @param {{ frameKnown?: (key: string) => boolean, siteLogoBlock?: boolean }} [world] `frameKnown`: whether the content
 *   map holds a frame key; without it any named frame counts. `siteLogoBlock`: true when the theme's header prints a
 *   Site Logo block (WordPress); left out, a spot is judged as on Joomla
 * @returns {{ via: 'profile' | 'small-logo', key: string } | { via: 'wordpress-option' | 'emdash-setting', key: string } | { via: 'contract', key: string, frame: string } |
 *   { via: 'none', reason: string }}
 */
export function logoWritePath(spot, { frameKnown, siteLogoBlock } = {}) {
  const setting = spot?.setting
  // WordPress: a Site Logo block is set through an option; no frame is needed, the block follows the option.
  if (
    siteLogoBlock === true &&
    !named(spot?.frameId) &&
    named(setting) &&
    WORDPRESS_LOGO_OPTIONS.has(setting)
  )
    return { via: 'wordpress-option', key: setting }
  if (named(setting) && EMDASH_LOGO_SETTINGS.has(setting) && !named(spot?.frameId))
    return { via: 'emdash-setting', key: setting }
  if (named(setting) && PROFILE_LOGO_KEYS.has(setting)) {
    if (spot.where !== 'offcanvas') return { via: 'profile', key: setting }
    if (!SMALL_KEY[setting]) return { via: 'none', reason: `no small logo for ${setting}` }
    return { via: 'small-logo', key: SMALL_KEY[setting] }
  }
  const frame = spot?.frameId
  if (!named(frame)) {
    const why = named(setting) ? `the site profile cannot write ${setting} and ` : ''
    return { via: 'none', reason: `${why}the kit names no frame for this spot` }
  }
  const key = contentMapKey(frame)
  if (frameKnown && !frameKnown(key)) return { via: 'none', reason: `the content map has no frame ${key}` }
  return { via: 'contract', key, frame }
}
