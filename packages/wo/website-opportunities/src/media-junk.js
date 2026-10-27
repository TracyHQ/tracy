/**
 * Pictures a restaurant's page shows that are not its photographs: social-network icons, map images, arrows, spacers,
 * pattern backgrounds, banners and rows that could not be downloaded. They come from the website's own markup, so only
 * website pictures are judged by name and size (a social page's or a listing's photographs never are).
 *
 * 🔒 NOTHING IS DELETED. A junk row stays in the place's media, flagged hidden: the profile lists it behind "Show them",
 * and it stays out of the brief, the brand palette and the logo candidates. A tiny picture may still be a LOGO if the
 * vision model says so (`place-logo.js`); a social icon or a map never is.
 */

const SOCIAL_NAME =
  /facebook|instagram|twitter|tripadv|youtube|tiktok|pinterest|linkedin|whatsapp|snapchat|yelp|foursquare|trustpilot|g[-_ ]?plus|google[-_ ]?plus/i
const MAP_NAME = /(^|[^a-z])maps?([^a-z]|$)|googlemaps|openstreetmap|staticmap/i
const ICON_NAME =
  /(^|[^a-z])icons?([^a-z]|$)|favicon|sprite|arrow|bullet|spacer|pixel|blank|separator|divider/i
const DECORATION_NAME =
  /(^|[^a-z])(bg|background|pattern|texture|overlay|shadow|gradient|border|sprite|spacer)([^a-z]|$)/i
/** A short side or long side under these is an icon or a spacer, not a photograph. */
const TINY_SHORT = 40
const TINY_LONG = 64
/** A picture this small on its long side that carries a social network's name is that network's icon. */
const SOCIAL_ICON_MAX = 256
const ICON_MAX = 128
const BANNER_RATIO = 4
const BANNER_MAX = 1000
const NOT_A_LOGO = new Set(['social-icon', 'map', 'icon', 'not_stored'])

const nameOf = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
  } catch {
    return String(url ?? '')
  }
}

/**
 * Why a picture is not shown as a photograph, or null when it is one.
 * @param {{source?: string, status?: string, kind?: string, source_url?: string, width?: number | null,
 *   height?: number | null, alt?: string | null, caption?: string | null, labels?: any}} row a `wo_place_media` row
 * @returns {'not_stored' | 'social-icon' | 'map' | 'icon' | 'tiny' | 'decoration' | null}
 */
export function mediaJunk(row) {
  if (row.kind === 'video') return null
  if (row.status !== 'stored') return 'not_stored'
  const subject = row.labels?.vision?.labels?.subject
  if (subject === 'icon') return 'icon'
  if (subject === 'map') return 'map'
  if (row.source !== 'website') return null
  const w = Number(row.width) || 0
  const h = Number(row.height) || 0
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  const name = nameOf(row.source_url)
  const words = `${name} ${row.alt ?? ''} ${row.caption ?? ''}`
  if (long > 0 && long <= SOCIAL_ICON_MAX && SOCIAL_NAME.test(words)) return 'social-icon'
  if (MAP_NAME.test(words)) return 'map'
  if (long > 0 && long <= ICON_MAX && ICON_NAME.test(words)) return 'decoration'
  if (long > 0 && (short < TINY_SHORT || long < TINY_LONG)) return 'tiny'
  if (long > 0 && w * h < 5000) return 'tiny'
  if (DECORATION_NAME.test(name)) return 'decoration'
  if (short > 0 && long < BANNER_MAX && long / short >= BANNER_RATIO) return 'decoration'
  return null
}

/** Whether a picture judged junk for this reason can never be the restaurant's logo. */
export const neverALogo = (reason) => reason !== null && NOT_A_LOGO.has(reason)
