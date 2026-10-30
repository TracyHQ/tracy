/**
 * The agent demo's research, less what the brief holds off the site (#1791, 28/10/2026). The brief already leaves held
 * reviews and a held business name out (`held-reviews.mjs`, `held-name.mjs`); this applies the same rules to the
 * research bundle the demo agent pages through, so neither a raw source nor the business reading hands them back.
 *
 * - A review that names a held person, or was written by the author of such a review, is dropped wherever the research
 *   lists reviews (the profile, its review sites, every raw source).
 * - The business reading loses every quote of a held review (`readingWithoutHeldReviews`), and its team loses the held
 *   people themselves: the bundle names them only in `heldPeople`, where they are marked held.
 * - While the business name is held, a review that prints it is dropped (a review is quoted verbatim or not at all),
 *   and every other text names the business by the neutral identity the brief gives it (`siteNameOf`) instead. Links
 *   are left as they are. The held name then appears only where the bundle marks it held (`nameHeld`, `heldPeople`).
 *
 * Pure: the frozen bundle and its hash are not changed; a copy is returned.
 */
import {
  heldNamesIn,
  isHeldReviewQuote,
  readingWithoutHeldReviews,
  reviewsNamingHeld
} from 'website-opportunities/domain/held-reviews.mjs'

/** A collected review's text and author, whatever provider shape it was read in. */
export const reviewTextOf = (review) =>
  typeof review?.text === 'string'
    ? review.text
    : (review?.text?.text ?? review?.originalText?.text ?? review?.body ?? null)
const reviewAuthorOf = (review) =>
  review?.author ?? review?.authorAttribution?.displayName ?? review?.user?.name ?? null

/** Every review listed anywhere in a value (`reviews` arrays), as {author, text}. */
function reviewsIn(value, out = []) {
  if (Array.isArray(value)) value.forEach((item) => reviewsIn(item, out))
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      if (key === 'reviews' && Array.isArray(item))
        for (const review of item) out.push({ author: reviewAuthorOf(review), text: reviewTextOf(review) })
      else reviewsIn(item, out)
    }
  return out
}

const isLink = (s) => /^(https?:|mailto:|tel:|data:)/i.test(s.trim())
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {any} research - the bundle (`freezeAgentResearch` shape)
 * @param {{heldPeople?: string[], heldName?: string | null, siteName?: string | null}} held
 */
export function researchWithoutHeld(research, { heldPeople = [], heldName = null, siteName = null } = {}) {
  const name = typeof heldName === 'string' && heldName.trim() ? heldName.trim() : null
  if (!heldPeople.length && !name) return research
  const heldReviews = reviewsNamingHeld(reviewsIn([research.profile, research.sources]), heldPeople)
  const heldAuthors = new Set(heldReviews.map((r) => r.author).filter(Boolean))
  const readingOpts = { names: [...heldPeople, ...(name ? [name] : [])], held: heldReviews }
  const nameRe = name ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'giu') : null
  // With no neutral identity (a brief made before it had one), the business is named as such.
  const stand = siteName || 'the business'
  const reviewHeld = (review) => {
    const text = reviewTextOf(review)
    if (heldNamesIn(text, readingOpts.names).length) return true
    const author = reviewAuthorOf(review)
    return Boolean(author) && heldAuthors.has(author)
  }
  const readingOfAgent = (reading) => {
    const out = readingWithoutHeldReviews(reading, readingOpts)
    if (!Array.isArray(out?.team)) return out
    return {
      ...out,
      team: out.team.filter(
        (p) => !heldNamesIn(p?.label ?? p?.name, heldPeople).length && !isHeldReviewQuote(p, readingOpts)
      )
    }
  }
  const clean = (value, key = null) => {
    if (typeof value === 'string') return nameRe && !isLink(value) ? value.replace(nameRe, stand) : value
    if (Array.isArray(value))
      return (key === 'reviews' ? value.filter((r) => !reviewHeld(r)) : value).map((item) => clean(item))
    if (!value || typeof value !== 'object') return value
    const source = key === 'businessReading' ? readingOfAgent(value) : value
    return Object.fromEntries(Object.entries(source).map(([k, item]) => [k, clean(item, k)]))
  }
  // The frozen hashes stay: they trace the bundle to the research it was cut from.
  const { hash, ...data } = research
  return { ...clean(data), hash }
}
