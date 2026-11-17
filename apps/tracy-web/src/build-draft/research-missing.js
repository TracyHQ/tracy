/**
 * What a finished research did not put on the site (#575), small and plain, for the account the owner reads after
 * research (`tracy_build`'s research guidance): the brief's own `missing` list (`brief.mjs`, the step chain's content
 * brief), each entry said by what it is and whether research found it but holds it back until the owner confirms it
 * (`withheld`, a fact assessment's decision) or did not find it. Pure.
 *
 * 🔒 FOUND BUT HELD IS NOT MISSING. The brief lists a fact it holds back (opening hours read as open all day, a rating
 * of few reviews, old posts) beside the facts no source gave: the owner reads the first as "found, kept off until you
 * confirm it", never as "not found". A source that could not be read (`source:<name>`) is said by the link lines.
 */

/** The owner's words for the brief's missing fields; a field not named here is said by its own name. */
const WHAT = Object.freeze({
  prices: 'prices',
  hours: 'opening hours',
  googleRating: 'Google rating',
  rating: 'rating',
  posts: 'recent posts',
  booking: 'a booking link',
  phone: 'phone number',
  email: 'email address',
  address: 'address',
  services: 'services',
  menu: 'menu',
  team: 'team',
  story: 'story',
  audience: 'who it is for',
  logo: 'logo',
  socials: 'social pages',
  website: 'website',
  whatsapp: 'WhatsApp'
})

const MAX = 8

/** A camelCase field said as words. */
const wordsOf = (field) => field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()

/**
 * @param {object | null | undefined} brief the research record's brief
 * @returns {Array<{what: string, held: boolean}>} at most `MAX` entries, the held ones first
 */
export function researchMissingOf(brief) {
  const seen = new Set()
  const out = []
  for (const entry of Array.isArray(brief?.missing) ? brief.missing : []) {
    const field = typeof entry?.field === 'string' ? entry.field : ''
    if (!field || field.startsWith('source:') || seen.has(field)) continue
    seen.add(field)
    const held = Array.isArray(entry.withheld) && entry.withheld.length > 0
    out.push({ what: WHAT[field] ?? wordsOf(field), held })
  }
  return [...out.filter((m) => m.held), ...out.filter((m) => !m.held)].slice(0, MAX)
}
