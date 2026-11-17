// The place choice question (#609): when the owner's Google link matches more than one place (two branches under one
// name, `link-fields.js` `GOOGLE_LINK_AMBIGUOUS`), the build chat asks which place is theirs, as the Website
// Opportunities picker does, before any other research question. One choice per candidate (its name and address in
// one label, so branches can be told apart; the label is what the card answers with, so labels never repeat), at
// most five, then "None of these", which goes on without the link.
// A Contract B question on the `place-choice` topic, made by the same helper as the needs profile's questions
// (`needs-profile-questions.mjs`). Pure.
import { PLACE_CHOICE_TOPIC } from './build-contract-questions.mjs'
import { FREE_TEXT_MAX, contractQuestionOf } from './needs-profile-questions.mjs'
import { asChosen } from './plan-free-answers.mjs'

export { PLACE_CHOICE_TOPIC }
/** The id of the place choice question. */
export const PLACE_CHOICE_QUESTION_ID = 'place-choice'
/** The id of the choice that picks none of the places. */
export const PLACE_CHOICE_NONE = 'none'
/** The most candidates offered (the picker's own cap). */
export const PLACE_CHOICES_MAX = 5
export const PLACE_CHOICE_PROMPT =
  'We found more than one place on Google Maps under this name. Which one is yours?'
export const PLACE_CHOICE_NONE_LABEL = 'None of these'
/** The question when the places were found by the business name and city the owner gave (no link, #575). */
export const PLACE_CHOICE_FOUND_PROMPT =
  'We looked for your business on Google Maps by its name and city. Is it one of these?'

/** A text cut to the card's limit (80 characters for a label and a detail), counted by code point. */
function clip(text, max = 80) {
  const chars = [...String(text).trim()]
  return chars.length > max
    ? `${chars
        .slice(0, max - 3)
        .join('')
        .trimEnd()}...`
    : chars.join('')
}
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The question for the candidates of an ambiguous Google link (`{provider, providerId, name, address?}`, as
 * `pickerCandidateOf` makes them). A candidate's choice id is its place id, so the answer names the place itself.
 * @param {Array<{provider?: string, providerId: string, name: string, address?: string}>} candidates
 * @param {{found?: boolean}} [opts] `found`: the places come from a search by the name and city the owner gave, not
 *   from a Google link (one place may be offered then: the owner still says whether it is theirs)
 */
export function placeChoiceQuestionOf(candidates, { found = false } = {}) {
  const seen = new Set()
  const offered = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => isText(c?.providerId) && isText(c?.name) && c.providerId !== PLACE_CHOICE_NONE)
    .filter((c) => !seen.has(c.providerId) && seen.add(c.providerId))
    .slice(0, PLACE_CHOICES_MAX)
  const labels = new Set()
  const choices = [
    ...offered.map((c, i) => {
      const name = clip(c.name, 40)
      const address = isText(c.address) ? clip(c.address) : null
      // The card answers with the label it showed, so no two labels are the same (two branches share a name).
      let label = clip(address ? `${name}, ${address}` : name)
      if (labels.has(label)) label = `${clip(label, 74)} (${i + 1})`
      labels.add(label)
      return {
        id: c.providerId,
        label,
        code: 'place_choice_option',
        params: { name, ...(address ? { address } : {}) }
      }
    }),
    { id: PLACE_CHOICE_NONE, label: PLACE_CHOICE_NONE_LABEL, code: 'place_choice_none', params: {} }
  ]
  return contractQuestionOf(
    PLACE_CHOICE_TOPIC,
    found ? PLACE_CHOICE_FOUND_PROMPT : PLACE_CHOICE_PROMPT,
    choices,
    null,
    FREE_TEXT_MAX[PLACE_CHOICE_TOPIC],
    { code: found ? 'place_choice_found' : 'place_choice' }
  )
}

/**
 * The place an answer picked, as the picker sends it (`place` of `link-fields.js`), `PLACE_CHOICE_NONE`, or null when
 * there is no answer. A typed answer is that choice only when it is exactly one (label, id or code, after trimming and
 * case folding, `asChosen`); any other typed text is read by the model first (`answer-reading.mjs`), and the caller
 * passes the place it read as a choice. Code matches no name or address: unread typed text is none.
 * @param {object} question the place choice question
 * @param {{choice?: string, text?: string} | null | undefined} answer
 */
export function placeOfChoice(question, answer) {
  if (!answer || typeof answer !== 'object') return null
  const candidates = (question?.choices ?? []).filter((c) => c?.id !== PLACE_CHOICE_NONE)
  const chosen = asChosen(answer, question)
  const picked = chosen.choice !== undefined ? candidates.find((c) => c.id === chosen.choice) : undefined
  if (!picked) return PLACE_CHOICE_NONE
  return {
    provider: 'google-places',
    providerId: picked.id,
    name: picked.params?.name ?? picked.label,
    ...(picked.params?.address ? { address: picked.params.address } : {})
  }
}
