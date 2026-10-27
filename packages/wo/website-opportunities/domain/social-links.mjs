/**
 * A social link as Tracy keeps and shows it (#1780 item 10): the profile URL the social-stats parser normalises
 * (`social-stats/handles.mjs parseSocialUrl`: `https://www.instagram.com/<handle>/`), else the link without its share
 * and campaign tracking (`link-kinds.mjs TRACKING_PARAMS`). Applied where the brief and the place profile read links, so
 * a record saved before links were cleaned at paste time (`?igsh=…&utm_source=qr`) shows clean without new research.
 */
import { TRACKING_PARAMS, withoutTracking } from './link-kinds.mjs'
import { parseSocialUrl } from './social-stats/handles.mjs'

/** @param {unknown} url @param {string} [network] */
export function cleanSocialUrl(url, network) {
  if (typeof url !== 'string' || !url.trim()) return url
  const known = ['facebook', 'instagram', 'tiktok', 'youtube'].includes(network) ? network : undefined
  return parseSocialUrl(url, known ? { network: known } : {})?.url ?? withoutTracking(url.trim())
}

/** Every link of a `{network: url}` map, cleaned. */
export function cleanSocials(socials) {
  if (!socials || typeof socials !== 'object') return {}
  return Object.fromEntries(
    Object.entries(socials).map(([network, url]) => [network, cleanSocialUrl(url, network)])
  )
}

/** Whether a URL carries share or campaign tracking (`link-kinds.mjs TRACKING_PARAMS`). */
function tracked(url) {
  try {
    return [...new URL(url).searchParams.keys()].some((k) => TRACKING_PARAMS.test(k))
  } catch {
    return false
  }
}

/**
 * A stored link as Tracy reads it: cleaned (`cleanSocialUrl`) when it carries tracking, else exactly as stored, so a
 * clean address keeps the spelling other readers match on (site checks, social stats, source refs).
 * @param {unknown} url @param {string} [network]
 */
export function untrackedUrl(url, network) {
  return typeof url === 'string' && tracked(url) ? cleanSocialUrl(url, network) : url
}

/** Every link of a `{network: url}` map, read with `untrackedUrl`. */
export function untrackedSocials(socials) {
  if (!socials || typeof socials !== 'object') return socials
  return Object.fromEntries(
    Object.entries(socials).map(([network, url]) => [network, untrackedUrl(url, network)])
  )
}

/**
 * A stored profile (`mergeProfile` shape, the snapshot's or an account's) as Tracy reads it: its socials, its links and
 * Google's website without tracking, whenever the profile was saved (#1780 item 10). A new object; the stored one is
 * not changed.
 * @template T
 * @param {T} profile
 * @returns {T}
 */
export function cleanProfileLinks(profile) {
  if (!profile || typeof profile !== 'object') return profile
  const out = { ...profile }
  if (profile.socials && typeof profile.socials === 'object') out.socials = untrackedSocials(profile.socials)
  if (Array.isArray(profile.links)) out.links = [...new Set(profile.links.map((l) => untrackedUrl(l)))]
  const google = profile.googlePlace
  if (google && typeof google === 'object') {
    out.googlePlace = { ...google, ...(google.website ? { website: untrackedUrl(google.website) } : {}) }
    if (google.matchFacts?.website)
      out.googlePlace.matchFacts = { ...google.matchFacts, website: untrackedUrl(google.matchFacts.website) }
  }
  return out
}

/**
 * Every web address inside a stored JSON value (any depth, any key) read with `untrackedUrl`: the one a research
 * snapshot or source holds, whatever field carries it (`ref`, `url`, `website`, a socials map). Strings that are no
 * http(s) address, and addresses without tracking, are returned as they were. The same object comes back when nothing
 * changed, so a clean value costs no copy (#1780 item 10).
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function untrackedLinksDeep(value) {
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? untrackedUrl(value) : value
  if (Array.isArray(value)) {
    const next = value.map(untrackedLinksDeep)
    return next.some((item, i) => item !== value[i]) ? next : value
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  let changed = false
  const next = {}
  for (const [key, item] of Object.entries(value)) {
    next[key] = untrackedLinksDeep(item)
    if (next[key] !== item) changed = true
  }
  return changed ? next : value
}
