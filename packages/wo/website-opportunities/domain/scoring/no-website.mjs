const SOCIAL_NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube']
const hasSocial = (candidate) =>
  SOCIAL_NETWORKS.some((n) => typeof candidate.socials?.[n] === 'string' && candidate.socials[n])

/** A place with no website at all needs one most: full web points. A place with a website is the next rule's. */
export default {
  id: 'no-website',
  weight: 40,
  score({ candidate }) {
    if (candidate.website) return null
    return { points: 40, reason: hasSocial(candidate) ? 'web.socialOnly' : 'web.none' }
  }
}
