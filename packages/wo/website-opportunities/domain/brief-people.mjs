// The people of a brief a site may show on its team cards (spec TracyHQ/tracy#189, product owner 29/10/2026, option A).
// Pure and deterministic: no model, no site.
//
// 🔒 A PERSON THE REVIEWS NAME MAY FILL A TEAM CARD: a person held off the site only because guest reviews alone name them
// (`review-only-person`) is shown on a people card when the reviews give them a role ("coach", "dentist", "owner") or when
// at least two different reviews name them. Named once, with no role, they stay off. The owner's own choice always wins,
// and any other reason to hold a person (stale, sensitive, the owner left them off) still keeps them off.
// 🔒 ONLY WHAT THE SOURCES SAY: the name as the texts write it and the role a text states; never a surname, a bio, a
// photo of someone else or a social link. The build names every person shown this way to the owner (`peopleFromReviewsNote`).
import { heldNamesIn } from './held-reviews.mjs'

/** The one reason a review-named person may be lifted onto a team card; any other reason keeps them off. */
export const REVIEW_ONLY_PERSON = 'review-only-person'
/** A person with no role is shown when at least this many different reviews name them. */
export const REVIEW_MENTIONS_MIN = 2

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')

/** Every review the brief holds, the ones held back for naming someone included, each once. */
function reviewsOf(brief) {
  const place = brief?.googlePlace ?? {}
  const seen = new Set()
  const out = []
  for (const r of [...(place.reviews ?? []), ...(place.heldReviews ?? [])]) {
    if (!r || typeof r !== 'object') continue
    const key = [r.author, r.publishTime, r.googleMapsUri, r.text].map((v) => String(v ?? '')).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/**
 * How many different reviews of the brief name a person, as a whole word: a review's text, or the names a held review
 * was held for (its text is not kept).
 * @param {any} brief
 * @param {string} name
 */
export function reviewMentionsOf(brief, name) {
  const label = text(name)
  if (!label) return 0
  return reviewsOf(brief).filter(
    (r) =>
      heldNamesIn(r.text, [label]).length > 0 ||
      (Array.isArray(r.namesHeld) && r.namesHeld.some((n) => text(n).toLowerCase() === label.toLowerCase()))
  ).length
}

/** The fact behind a reading item, by its id. */
const factOf = (brief, item) =>
  item?.factId ? ((brief?.facts ?? []).find((f) => f?.id === item.factId) ?? null) : null

/**
 * The brief's people a site may show, in the brief's order. `fromReviews`: shown although only guest reviews name them,
 * by the rule above; the build names them to the owner.
 * @param {any} brief - a validated brief revision
 * @returns {Array<{id: string, label: string, role: string | null, fromReviews: boolean}>}
 */
export function showablePeopleOf(brief) {
  const out = []
  for (const p of brief?.reading?.team ?? []) {
    const id = text(p?.id)
    const label = text(p?.label)
    if (!id || !label) continue
    const role = text(p?.role) || null
    const fact = factOf(brief, p)
    // The owner's own choice wins over every rule.
    if (fact?.decidedBy === 'owner') {
      if (fact.onSite !== false) out.push({ id, label, role, fromReviews: false })
      continue
    }
    const held = p.onSite === false || p.reviewsOnly === true || fact?.onSite === false
    if (!held) {
      // A brief made since 29/10/2026 already shows such a person (`liftReviewPeople`): still named to the owner.
      const lifted = fact?.onSite === true && (fact.reasons ?? []).includes(REVIEW_ONLY_PERSON)
      out.push({ id, label, role, fromReviews: lifted })
      continue
    }
    const reasons = Array.isArray(fact?.reasons)
      ? fact.reasons
      : p.reviewsOnly === true
        ? [REVIEW_ONLY_PERSON]
        : []
    const reviewOnly = reasons.length > 0 && reasons.every((r) => r === REVIEW_ONLY_PERSON)
    if (reviewOnly && (role || reviewMentionsOf(brief, label) >= REVIEW_MENTIONS_MIN))
      out.push({ id, label, role, fromReviews: true })
  }
  return out
}

/**
 * The build note that names the people shown from reviews alone, for the owner to check; null when there are none.
 * @param {Array<{label: string, fromReviews?: boolean}>} people
 */
export function peopleFromReviewsNote(people) {
  const named = (people ?? []).filter((p) => p?.fromReviews === true).map((p) => p.label)
  if (!named.length) return null
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`
  return `people: ${list} ${named.length === 1 ? 'is' : 'are'} shown on the team cards from what guest reviews say about them; check the ${named.length === 1 ? 'name and role' : 'names and roles'} with the owner`
}

/**
 * A sourced role in the casing of the demo text it replaces: all capitals, a capital first letter, or all small, as the
 * demo writes it. A demo with no letters (markup, icons) gives a capital first letter, as a label under a name reads.
 * Only the casing changes, never a word.
 * @param {string} role
 * @param {unknown} demo
 */
export function roleInCasingOf(role, demo) {
  const value = text(role)
  if (!value) return ''
  const letters = String(demo ?? '')
    .replace(/\(\(.*?\)\)|<[^>]*>/gs, ' ')
    .replace(/[^\p{L}]/gu, '')
  if (letters && letters === letters.toUpperCase() && letters !== letters.toLowerCase())
    return value.toUpperCase()
  if (letters && letters === letters.toLowerCase()) return value.toLowerCase()
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Whether a person only reviews name passes the rule: a role, or this many different reviews naming them. */
const passes = (brief, name, role) =>
  Boolean(text(role)) || reviewMentionsOf(brief, name) >= REVIEW_MENTIONS_MIN

/**
 * The brief's facts with every team member held only as `review-only-person` and passing the rule above shown on the
 * site, the reason kept so the brief reads "shown from reviews, owner to check" (`SHOWN_FROM_REVIEWS`). The owner's own
 * choice and any other reason are left as they are. Pure: a new list, the facts not changed.
 * @param {any[]} facts - brief facts (`briefFactsOf`)
 * @param {{reviews?: any[], team?: Array<{label?: string, role?: string}>}} input - every review the brief read (with
 *   its text), and the reading's team (a role the reading kept from a quote)
 */
export function liftReviewPeople(facts, { reviews = [], team = [] } = {}) {
  const brief = { googlePlace: { reviews } }
  return (Array.isArray(facts) ? facts : []).map((f) => {
    if (f?.field !== 'team' || f.onSite !== false || f.decidedBy === 'owner') return f
    const reasons = Array.isArray(f.reasons) ? f.reasons : []
    if (!reasons.length || !reasons.every((r) => r === REVIEW_ONLY_PERSON)) return f
    const name = text(f.value?.name)
    const role = text(f.value?.role) || text(team.find((p) => text(p?.label) === name)?.role)
    return name && passes(brief, name, role) ? { ...f, onSite: true } : f
  })
}

/** How the brief names a person shown from reviews alone. */
export const SHOWN_FROM_REVIEWS = 'shown from reviews, owner to check'
