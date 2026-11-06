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
/** The phone menu's own picture of a main logo key. */
const SMALL_KEY = { site_logo: 'site_logo_small', site_logo_dark: 'site_logo_dark_small' }

const named = (value) => typeof value === 'string' && value !== ''

/**
 * @param {{ setting?: string | null, frameId?: string | null, where?: string }} spot a kit logo spot
 * @param {{ frameKnown?: (key: string) => boolean }} [world] `frameKnown`: whether the content map holds a frame key;
 *   without it any named frame counts
 * @returns {{ via: 'profile' | 'small-logo', key: string } | { via: 'contract', key: string, frame: string } |
 *   { via: 'none', reason: string }}
 */
export function logoWritePath(spot, { frameKnown } = {}) {
  const setting = spot?.setting
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
