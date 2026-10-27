/**
 * A stored candidate (`wo_opportunity.candidate`) as Tracy reads it today, whenever it was saved (#1780). Every reader
 * that shows, briefs or audits a candidate takes it through here: the Details and list answers, the brief, the place
 * profile and the page speed audit. A new object; the stored row is not changed.
 *
 * - Its social links lose their share tracking (`social-links.mjs`): a record saved before links were cleaned at paste
 *   time (`?igsh=…&utm_source=qr`, opportunity 5a1e2b3c on dev) reads clean without new research.
 * - Its `website` is judged with today's link rules (`link-kinds.mjs linkKind`): a listing page (magicpin, opportunity
 *   9c3d4e5f on dev) or a social page saved as the website before those rules is read as a listing or a social link,
 *   and the site check of that page goes with it.
 */
import { linkKind } from './link-kinds.mjs'
import { untrackedSocials } from './social-links.mjs'

const SOCIAL_KINDS = new Set(['facebook', 'instagram', 'tiktok', 'youtube'])

/**
 * @template {Record<string, any>} T
 * @param {T} candidate
 * @returns {T}
 */
export function candidateAsRead(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate
  const out = { ...candidate }
  if (candidate.socials && typeof candidate.socials === 'object')
    out.socials = untrackedSocials(candidate.socials)
  const website = typeof candidate.website === 'string' ? candidate.website : null
  const info = website ? linkKind(website) : null
  if (info?.kind === 'listing') {
    const listings = Array.isArray(candidate.listings) ? candidate.listings : []
    const held = listings.some((l) => typeof l?.url === 'string' && linkKind(l.url)?.key === info.key)
    out.listings = held ? listings : [...listings, { url: info.url, source: info.source }]
  } else if (info && SOCIAL_KINDS.has(info.kind)) {
    out.socials = { [info.kind]: info.url, ...out.socials }
  } else return out
  out.website = null
  delete out.siteCheck
  return out
}
