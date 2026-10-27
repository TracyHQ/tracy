const POINTS = 10

/** A place that can be reached: a phone, a chat contact or an email. */
export default {
  id: 'contact',
  weight: POINTS,
  score({ candidate }) {
    const reachable =
      Boolean(candidate.phone) ||
      Object.values(candidate.contacts ?? {}).some(Boolean) ||
      Boolean(candidate.email) ||
      (Array.isArray(candidate.emails) && candidate.emails.length > 0)
    return reachable ? { points: POINTS, reason: 'contact.reachable' } : { points: 0, reason: 'contact.none' }
  }
}
