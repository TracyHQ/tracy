/**
 * The "Google rating" row of the Details Profile card, from `profile.googleRating` (the server's decision,
 * `website-opportunities/domain/google-rating.mjs`): Google's rating, how many reviews it counts, and whether the site
 * shows it. Under 5 reviews the site leaves it off until the person shows it. Nothing is decided here.
 */
type Rec = Record<string, unknown>

export interface RatingRowView {
  /** Google's rating, of 5. */
  score: number
  /** How many reviews it counts; null when Google did not say. */
  reviews: number | null
  /** Under 5 reviews (or an unknown count): left off the site unless the person shows it. */
  few: boolean
  /** The site shows it. */
  shown: boolean
  /** The person chose (show or leave); false while the default holds. */
  chosen: boolean
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})

/** The row, or null when Google has no rating for this place. */
export function ratingRowView(profile: unknown): RatingRowView | null {
  const d = rec(rec(profile).googleRating)
  const state = d.state
  const score = d.score
  if ((state !== 'shown' && state !== 'left') || typeof score !== 'number' || !Number.isFinite(score))
    return null
  const reviews =
    typeof d.reviews === 'number' && Number.isInteger(d.reviews) && d.reviews >= 0 ? d.reviews : null
  return {
    score,
    reviews,
    few: d.few === true,
    shown: state === 'shown',
    chosen: d.choice === 'show' || d.choice === 'leave'
  }
}

/** The rating as Google writes it, one decimal, in the reader's digits: 5 is "5.0". */
export function ratingText(score: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(score)
}

/** Which choices the row offers: both while a thin rating waits for the person, else the one that changes it. */
export function ratingActions(view: RatingRowView): ('show' | 'leave')[] {
  if (view.few && !view.chosen) return ['show', 'leave']
  return view.shown ? ['leave'] : ['show']
}
