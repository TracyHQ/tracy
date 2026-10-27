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

/**
 * Reviews split by whether the site may show them (pure): `reviews` names nobody held off the site, `heldReviews`
 * keeps the others, each with `namesHeld`, so no testimonial puts a held name on the site. Without held names, as is.
 * @returns {{reviews: any[], heldReviews?: any[]}}
 */
export function heldReviewsSplit(reviews, names) {
  const list = Array.isArray(reviews) ? reviews : []
  if (!names.length) return { reviews: list }
  const shown = []
  const held = []
  for (const r of list) {
    const named = heldNamesIn(r?.text, names)
    if (named.length) held.push({ ...r, namesHeld: named })
    else shown.push(r)
  }
  return { reviews: shown, ...(held.length ? { heldReviews: held } : {}) }
}
