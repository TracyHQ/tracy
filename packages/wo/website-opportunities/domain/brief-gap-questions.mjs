// What the build chat asks the owner next about a business known only by its owner's words (#575): the questions come
// from the content brief's own readiness (`brief-readiness.mjs` `ownerQuestions`, which lists every check's questions
// and every field the brief's `missing` list holds), never from a second hand made question set. Each becomes a
// Contract B question on the topic `brief-gap`, one field each, with a button to leave the field out for now; what
// the owner types is an owner statement the business reading reads (decision D46), never a field value.
//
// 🔒 BLOCKING FIRST, A FEW AT A TIME, EACH FIELD ONCE. The questions of the checks whose verdict blocks the build come
// first, then the others in the readiness's own order; a field already asked is never asked again, and at most
// `BRIEF_GAP_MAX` are issued at once. Only what the owner can answer in words is asked: the picture checks (photos,
// hero, portraits, a photo of each offering) need a picture, which the chat cannot take. Pure.
import { TYPED_ANSWER_MAX_LENGTH } from './build-contract-questions.mjs'
import { contractQuestionOf } from './needs-profile-questions.mjs'

export const BRIEF_GAP_TOPIC = 'brief-gap'
/** The most brief questions issued at once (the chat card shows three questions at a time). */
export const BRIEF_GAP_MAX = 3
/** The choice that leaves the field out for now. */
export const BRIEF_GAP_SKIP = 'skip'
export const BRIEF_GAP_SKIP_LABEL = 'Leave it out for now'

/**
 * The field a readiness question asks about (its `field`), as the field the build chat asks: the brief's missing
 * offerings and the blocking "nothing the business offers" check are one question.
 */
const FIELD_OF = Object.freeze({
  'business-content': 'offerings',
  offerings: 'offerings',
  menu: 'menu',
  'offering-descriptions': 'offering-descriptions',
  prices: 'prices',
  hours: 'hours',
  phone: 'phone',
  address: 'address',
  booking: 'booking',
  'about.story': 'story'
})

/** The sentence the owner reads for each field (the readiness's own wording is written for a builder). */
export const BRIEF_GAP_PROMPTS = Object.freeze({
  offerings: 'What does your business offer? Name your main services or products.',
  menu: 'What is on your menu? Name a few dishes or drinks.',
  'offering-descriptions': 'How would you describe what you offer, in a sentence or two each?',
  prices: 'What do your main services or products cost?',
  hours: 'What are your opening hours?',
  phone: 'Which phone number should customers call?',
  address: 'What is your street address, or the area you serve?',
  booking: 'How should customers book with you?',
  story: 'How would you describe your business in a few sentences?'
})

const list = (value) => (Array.isArray(value) ? value : [])
/** The question id of a field. */
export const briefGapIdOf = (field) => `${BRIEF_GAP_TOPIC}.${field}`
/** The field of a brief question id, or null. */
export const briefGapFieldOf = (id) =>
  typeof id === 'string' && id.startsWith(`${BRIEF_GAP_TOPIC}.`) ? id.slice(BRIEF_GAP_TOPIC.length + 1) : null

/** The readiness's owner questions, those of a blocking check first, each mapped to the field the chat asks. */
function fieldsInOrder(readiness) {
  const blocking = new Set(
    list(readiness?.checks)
      .filter((c) => c?.verdict === 'block')
      .flatMap((c) => list(c.questions).map((q) => q?.id))
  )
  const questions = list(readiness?.ownerQuestions)
  const ordered = [
    ...questions.filter((q) => blocking.has(q?.id)),
    ...questions.filter((q) => !blocking.has(q?.id))
  ]
  return [...new Set(ordered.map((q) => FIELD_OF[q?.field]).filter(Boolean))]
}

/**
 * The questions to ask next for a brief's readiness, at most `max`, none about a field in `asked`.
 * @param {{checks?: object[], ownerQuestions?: object[]} | null | undefined} readiness the brief's `readiness`
 * @param {{asked?: string[], max?: number}} [opts] `asked`: the fields asked before (answered or left out)
 * @returns {object[]} Contract B questions on the topic `brief-gap`
 */
export function briefGapQuestionsOf(readiness, { asked = [], max = BRIEF_GAP_MAX } = {}) {
  const done = new Set(asked)
  return fieldsInOrder(readiness)
    .filter((field) => !done.has(field))
    .slice(0, Math.max(0, max))
    .map((field) => ({
      ...contractQuestionOf(
        BRIEF_GAP_TOPIC,
        BRIEF_GAP_PROMPTS[field],
        [{ id: BRIEF_GAP_SKIP, label: BRIEF_GAP_SKIP_LABEL, code: 'brief_gap_skip', params: {} }],
        null,
        TYPED_ANSWER_MAX_LENGTH,
        { code: `brief_gap_${field.replace(/[^a-z]+/g, '_')}` }
      ),
      id: briefGapIdOf(field)
    }))
}
