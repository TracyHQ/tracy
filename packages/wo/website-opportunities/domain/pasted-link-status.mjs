/** Customer-safe outcomes for every pasted address, independent of provider and business. */
import { linkKind } from './link-kinds.mjs'

/** Map source and resolver outcomes to stable public reasons, never provider messages. */
export function linkReadReason(reason) {
  const code = String(reason ?? '').toLowerCase()
  if (/credential|not.configured|no.key|switched.off|unsupported|not.available/.test(code))
    return 'not-configured'
  if (/private|blocked|forbidden|denied|http.?403|login|restricted/.test(code)) return 'blocked'
  if (/not.found|not_found|unresolv|no.business|no.profile|invalid|not.public|http.?404|http.?410/.test(code))
    return 'unresolved'
  return 'fetch-failed'
}

/** Count collected items, never a public review total or a profile's follower count. */
export function linkReadCounts(collected = {}, media = []) {
  const profile = collected.profile ?? collected
  const contacts = new Set()
  for (const value of [
    profile?.phone ?? profile?.telephone ?? profile?.internationalPhoneNumber ?? profile?.nationalPhoneNumber,
    profile?.email,
    profile?.address ?? profile?.formattedAddress
  ]) {
    if (typeof value === 'string' && value.trim()) contacts.add(value.trim())
  }
  for (const value of Object.values(profile?.contacts ?? {}))
    if (typeof value === 'string' && value.trim()) contacts.add(value.trim())
  return {
    photos: media.filter((m) => m.kind === 'image' && (!m.status || m.status === 'stored')).length,
    reviews: Array.isArray(collected.reviews) ? collected.reviews.length : 0,
    contacts: contacts.size
  }
}

/** The existing identity ranking also determines which input must be reviewed if it did not read. */
export function markPrimaryLink(links) {
  const rank = (l) => (l.kind === 'google' ? 0 : l.kind === 'website' ? 1 : l.kind === 'listing' ? 3 : 2)
  const eligible = links.filter((l) => l.used || ['unresolvable', 'blocked', 'not-public'].includes(l.reason))
  const primary = [...eligible].sort((a, b) => rank(a) - rank(b))[0]
  return links.map((l) => ({ ...l, primary: l === primary }))
}

const sameLink = (a, b) => {
  const first = linkKind(a)
  const second = linkKind(b)
  return first && second && first.key === second.key
}

/** Project a saved input list from the current research rows; match each page, never merely its source kind. */
export function pastedLinkResults(opportunity, { sources = [], media = [], finished = false } = {}) {
  return (opportunity.candidate?.pastedLinks ?? []).map((link) => {
    if (!link.used) return { ...link }
    const source = link.kind === 'google' ? 'google-places' : link.kind
    const row = sources.find(
      (s) =>
        s.source === source &&
        (link.kind === 'google' ||
          sameLink(s.ref, link.url) ||
          (link.kind === 'listing' && s.collected?.listings?.some((l) => sameLink(l.url, link.url))))
    )
    const listing =
      link.kind === 'listing' ? row?.collected?.listings?.find((l) => sameLink(l.url, link.url)) : null
    if (row?.last_error)
      return {
        ...link,
        readStatus: 'could-not-read',
        readReason: linkReadReason(row.last_error.reason ?? row.last_error.code)
      }
    const status = listing ? (listing.ok ? 'complete' : 'failed') : row?.status
    const emptyPartial =
      status === 'partial' &&
      row.reason &&
      !(row.coverage?.fetched > 0) &&
      !Object.keys(row.collected?.profile ?? {}).length &&
      !['media', 'posts', 'pages', 'reviews'].some((key) => row.collected?.[key]?.length)
    if (emptyPartial) return { ...link, readStatus: 'could-not-read', readReason: linkReadReason(row.reason) }
    if (status === 'complete' || status === 'partial') {
      const collected = listing ? (listing.facts ?? {}) : (row.collected ?? {})
      const collectedUrls = Array.isArray(collected.media) ? new Set(collected.media.map((m) => m.url)) : null
      const photos = media.filter(
        (m) =>
          m.source === source &&
          (typeof row.shared !== 'boolean' ||
            !m.origin ||
            m.origin === (row.shared ? 'place' : 'opportunity')) &&
          (!collectedUrls || collectedUrls.has(m.source_url ?? m.sourceUrl))
      )
      const { readReason: _reason, ...rest } = link
      return { ...rest, readStatus: 'read', counts: linkReadCounts(collected, photos) }
    }
    if (status && !['pending', 'running'].includes(status))
      return {
        ...link,
        readStatus: 'could-not-read',
        readReason: linkReadReason(listing?.reason ?? row.reason)
      }
    // A resolver already read a Google place or listing before the research job was created.
    if (link.readStatus === 'read') return { ...link }
    return finished
      ? { ...link, readStatus: 'could-not-read', readReason: 'unresolved' }
      : { ...link, readStatus: 'pending' }
  })
}

export const requiresLinkReview = (links) =>
  links.length > 0 &&
  (!links.some((l) => l.readStatus === 'read') || links.some((l) => l.primary && l.readStatus !== 'read'))
