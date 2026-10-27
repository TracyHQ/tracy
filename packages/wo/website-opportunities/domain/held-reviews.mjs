// Reviews that name someone a site brief holds off the site (#1791): a person named only in guest reviews waits for the
// owner, so a review that names them is no testimonial the site may quote. Pure, no imports: the brief and the review
// sources of the app both read it.

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''

/** The people the brief holds off the site, by name (`missing` team values). */
export const heldPeopleOf = (missing) =>
  (Array.isArray(missing) ? missing : [])
    .filter((m) => m?.field === 'team')
    .flatMap((m) => (m.withheld ?? []).flatMap((w) => w.values ?? []))
    .filter(nonEmpty)

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The held names a text writes, as whole words. */
export const heldNamesIn = (text, names) =>
  names.filter((n) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'iu').test(String(text ?? ''))
  )

/** The reviews that name someone held off the site, each with `namesHeld` and its text (for `isHeldReviewQuote`). */
export function reviewsNamingHeld(reviews, names) {
  if (!names?.length) return []
  return (Array.isArray(reviews) ? reviews : []).flatMap((r) => {
    const named = heldNamesIn(r?.text, names)
    return named.length ? [{ ...r, namesHeld: named }] : []
  })
}

/**
 * Reviews split by whether the site may show them (pure): `reviews` names nobody held off the site, `heldReviews`
 * keeps the others by author with `namesHeld` and without their text: a held review is named, never quoted, so no
 * testimonial and no quote puts a held name or a held review's words on the site. Without held names, as is.
 * @returns {{reviews: any[], heldReviews?: any[]}}
 */
export function heldReviewsSplit(reviews, names) {
  const list = Array.isArray(reviews) ? reviews : []
  if (!names?.length) return { reviews: list }
  const held = new Set(reviewsNamingHeld(list, names).map((r) => r.text))
  const shown = list.filter((r) => !held.has(r?.text))
  const heldReviews = reviewsNamingHeld(list, names).map(({ text: _text, ...r }) => r)
  return { reviews: shown, ...(heldReviews.length ? { heldReviews } : {}) }
}

const QUOTE_MIN_WORDS = 3
const folded = (t) =>
  String(t ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * Whether a quoted item comes from a held review (pure): a quote of a review that names someone held off the site
 * (`names`), was written by the author of a held review (`held`, from `reviewsNamingHeld`) or is part of a held
 * review's text (three words or more: a single word a guest repeats is no quote of theirs). Owner text (bio, posts,
 * website) is never a held review. A bare string is judged by its words.
 * @param {string | {quote?: string, source?: {kind?: string, author?: string}}} item
 * @param {{names?: string[], held?: {author?: string, text?: string}[]}} [opts]
 */
export function isHeldReviewQuote(item, { names = [], held = [] } = {}) {
  const quote = typeof item === 'string' ? item : item?.quote
  const source = typeof item === 'string' ? null : item?.source
  if (source && source.kind !== 'review') return false
  if (heldNamesIn(quote, names).length) return true
  if (source && nonEmpty(source.author) && held.some((r) => r?.author === source.author)) return true
  const words = folded(quote)
  return (
    words.split(' ').length >= QUOTE_MIN_WORDS &&
    held.some((r) => nonEmpty(r?.text) && folded(r.text).includes(words))
  )
}

/**
 * The business reading less every quote of a held review (pure, `isHeldReviewQuote`): the quotes of the kind of
 * business, the key messages and an item's mentions are dropped one by one, an item that stands on such a quote alone
 * (a service, an audience, a story line, a service area, a fact it states) is dropped, and a key message left with no
 * quote goes. The team stays as it is: a person only held reviews name is held there, which is how the brief holds them.
 */
export function readingWithoutHeldReviews(reading, opts = {}) {
  if (!reading || typeof reading !== 'object') return reading
  if (!opts.names?.length && !opts.held?.length) return reading
  const usable = (i) => !isHeldReviewQuote(i, opts)
  const quotes = (list) => (Array.isArray(list) ? list.filter(usable) : list)
  const items = (list) =>
    Array.isArray(list)
      ? list
          .filter(usable)
          .map((i) => (Array.isArray(i?.mentions) ? { ...i, mentions: quotes(i.mentions) } : i))
      : list
  const out = { ...reading }
  for (const key of ['services', 'audience', 'story', 'serviceAreas', 'facts'])
    if (key in reading) out[key] = items(reading[key])
  if (Array.isArray(reading.keyMessages))
    out.keyMessages = reading.keyMessages
      .map((m) => (Array.isArray(m?.quotes) ? { ...m, quotes: quotes(m.quotes) } : m))
      .filter((m) => !Array.isArray(m?.quotes) || m.quotes.length > 0)
  if (reading.subTrade && Array.isArray(reading.subTrade.quotes))
    out.subTrade = { ...reading.subTrade, quotes: quotes(reading.subTrade.quotes) }
  return out
}
