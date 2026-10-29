// Where a brief asset came from: its source, the credit its source requires shown, and who uploaded it. Research
// collects these with every picture; the brief keeps them so a later step can tell an owner's own photo from a
// customer's snapshot and can show a Google author wherever the photo shows.
//
// 🔒 Missing is not a guess. A source that names no author gives credit "" (never an invented name), and an uploader
// the source does not reveal is "unknown", never "owner".

/** Who uploaded a picture: the business, one of its customers, or not known. */
export const UPLOADER_ROLES = Object.freeze(['owner', 'customer', 'unknown'])
/** Sources that are the business's own channels: whatever they hold, the business published. */
const OWN_CHANNELS = new Set([
  'website',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'twitter'
])

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const web = (v) => {
  const s = text(v)
  return s && /^https?:\/\//i.test(s) ? s : null
}

/** One author, a name or `{displayName, uri}`, as "Name (https://…)" or "Name". */
function authorText(a) {
  if (typeof a === 'string') return text(a)
  const name = text(a?.displayName) ?? text(a?.name)
  if (!name) return null
  const link = web(a.uri) ?? web(a.url)
  return link ? `${name} (${link})` : name
}

/** The credit of a stored picture (`credit`, or a legacy row's `labels.credit`) as one plain string; "" when it names no one. */
export function creditTextOf(m) {
  const credit = m?.credit ?? m?.labels?.credit
  if (typeof credit === 'string') return credit.trim()
  const authors = Array.isArray(credit?.authors) ? credit.authors.map(authorText).filter(Boolean) : []
  return authors.join('; ')
}

/** Who uploaded a picture: a stated role, else what its source implies, else unknown. */
export function uploaderRoleOf(m) {
  if (UPLOADER_ROLES.includes(m?.uploaderRole)) return m.uploaderRole
  const credit = m?.credit ?? m?.labels?.credit
  // A picture from a guest's review is the guest's, on any platform.
  if (credit?.photoSource === 'review') return 'customer'
  if (OWN_CHANNELS.has(m?.source)) return 'owner'
  return 'unknown'
}

/**
 * Whether a picture must name who took it: one from a third party (a Google or Tripadvisor author, a guest). The
 * business's own channels and its own uploads are credited to the business itself.
 */
export function creditRequiredOf(m) {
  return !OWN_CHANNELS.has(m?.source) && m?.uploaderRole !== 'owner'
}

/** The three fields every brief asset carries. */
export function assetOriginOf(m) {
  return {
    source: text(m?.source) ?? 'unknown',
    credit: creditTextOf(m),
    uploaderRole: uploaderRoleOf(m)
  }
}

/** Sources that are map or review listings: anyone may post a photo there, and it can show another venue. */
const MAP_LISTINGS = new Set(['google-places', 'google-maps', 'google', 'tripadvisor', 'yelp', 'foursquare'])

/** Whether the business itself published a picture: its own upload, or a picture read as its own photo. */
export function isOwnersPhoto(m) {
  return uploaderRoleOf(m) === 'owner' || m?.isOwnPhoto === true
}

/**
 * Whether a picture was posted on a map listing by someone other than the business (TracyHQ/tracy#135): such a photo can
 * show another venue (a court with another club's sign), so it never represents the business in an identity slot.
 */
export function isMapPhotoByOthers(m) {
  return MAP_LISTINGS.has(m?.source) && !isOwnersPhoto(m)
}
