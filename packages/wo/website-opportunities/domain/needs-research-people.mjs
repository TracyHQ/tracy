// People only guest reviews name, as person items of the needs profile research (#575, plan stage inputs, P3). A real
// run lost its coaches page: two coaches customers named in reviews were shown by the brief (the step chain's rule,
// `brief-people.mjs` `liftReviewPeople`: a role the reviews give, or named in two reviews), but the research passed only
// the review's words to the needs profile model as plain text, the model reported no person, and the plan's people
// page had nobody to show.
// Who such a person is and their role is the business reading's (the step chain's model step over the reviews); the
// rule that lifts them onto the site is the brief's. This module only carries the result, as the step chain's brief
// states it, into a typed person item of the source that named them (`needs-profile-typed.mjs` takes it as it is):
//   - only a person the brief SHOWS from reviews: their fact on the site with reason `review-only-person`, or (no fact)
//     a reading entry on the site that only reviews name. A person the brief holds stays held (the fact is set aside
//     with its code, and `plan-withheld.mjs` holds the name);
//   - the name as the reading writes it and the role a review gives, nothing else: no bio, no photo, no social link;
//   - marked `namedBy: 'customer'`, so the plan and the card can say a customer named them;
//   - the review's words of that fact are not passed to the model as text too (`taken.people`), so the model does
//     not read the same person again with words of its own. Pure.
import { REVIEW_ONLY_PERSON } from './brief-people.mjs'
import { readingSourceName } from './needs-research-reading.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
export const NAMED_BY_CUSTOMER = 'customer'

/** Whether the brief shows a reading team entry from reviews alone (the step chain's own reading of its decision). */
function shownFromReviews(person, fact) {
  if (fact) return fact.onSite === true && list(fact.reasons).includes(REVIEW_ONLY_PERSON)
  return person?.onSite === true && (person.reviewsOnly === true || person.fromReviews === true)
}

/**
 * Add a typed person item for every person the brief shows from reviews alone to the research being made.
 * @param {object} brief the stored content brief
 * @param {{sourceOf: (name: string) => object | null, setAside: object[], taken: object}} research
 * @returns {Set<string>} the ids of the brief facts these people stand for: the research takes them as people
 *   (`taken.people`: those fact ids, or the reading entry's id for a person with no fact)
 */
export function addReviewPeopleOfBrief(brief, { sourceOf, setAside, taken }) {
  const facts = new Map(list(brief?.facts).map((f) => [f?.id, f]))
  const used = new Set()
  const people = []
  for (const person of list(brief?.reading?.team)) {
    const fact = isText(person?.factId) ? (facts.get(person.factId) ?? null) : null
    if (!isText(person?.label) || !shownFromReviews(person, fact)) continue
    const source = sourceOf(readingSourceName(person.source)) ?? sourceOf('google')
    if (!source) {
      setAside.push({
        what: 'person',
        ...(isText(person.id) ? { id: person.id } : {}),
        code: 'no_known_source',
        reason: 'a person reviews name, from no source the needs profile knows'
      })
      continue
    }
    source.items = [
      ...list(source.items),
      {
        ...(isText(person.id) ? { id: person.id } : {}),
        kind: 'person',
        fields: {
          'person.name': person.label.trim(),
          ...(isText(person.role) ? { 'person.role': person.role.trim() } : {})
        },
        evidence: isText(person.quote) ? person.quote.trim() : person.label.trim(),
        namedBy: NAMED_BY_CUSTOMER
      }
    ]
    people.push(fact ? fact.id : isText(person.id) ? person.id : person.label.trim())
    if (fact) used.add(fact.id)
  }
  if (people.length) taken.people = people
  return used
}
