// The opening hours the content brief holds until the owner confirms them, asked in the build chat (#575 walk, second
// round: the plan card said "kept off until you confirm them" and the chat had no way to confirm). The step chain asks
// the same thing on the Profile card (Keep, Edit hours, Leave off the site) and keeps the person's choice on the
// opportunity as `hoursPick` (`hours-check.mjs`, `saveHoursPick`), which every later brief reads. The build chat asks
// it as one of research's questions, before the template choice, and keeps the answer the same way:
//   keep   the hours one source alone gives (open 24 hours every day) are right: `{choice: 'keep'}`;
//   edit   the owner types the hours; the answer reading reads them (`contact.hours`, `answer-reading.mjs`), and a line
//          `hoursPickOf` cannot read keeps them held, never a guess: `{choice: 'edit', hours}`;
//   leave  no hours on the site: `{choice: 'leave'}`.
// Sources that disagree are asked without Keep: the step chain's decision shows none of them on a keep. Pure.
import { QUESTION_SCHEMA, TYPED_ANSWER_MAX_LENGTH } from './build-contract-questions.mjs'
import { hoursPickOf } from './hours-check.mjs'
import { HELD_HOURS_LEFT_OUT, heldHoursOf } from './plan-composer-brief.mjs'

export const HELD_HOURS_TOPIC = 'held-hours'
export const HELD_HOURS_ID = 'held-hours'

const CHOICES = Object.freeze({
  keep: { id: 'keep', label: 'Keep these hours', code: 'held_hours_keep', params: {} },
  edit: { id: 'edit', label: 'They are wrong, I will type them', code: 'held_hours_edit', params: {} },
  leave: { id: 'leave', label: 'Leave hours off the site', code: 'held_hours_leave', params: {} }
})

/**
 * The question about the hours the brief holds, or null when it holds none waiting for the owner.
 * @param {object | null | undefined} brief the research's content brief
 */
export function heldHoursQuestionOf(brief) {
  const held = heldHoursOf(brief)
  if (!held) return null
  const disagree = held === HELD_HOURS_LEFT_OUT.disagree
  return {
    schema: QUESTION_SCHEMA,
    id: HELD_HOURS_ID,
    topic: HELD_HOURS_TOPIC,
    prompt: disagree
      ? 'Your sources give different opening hours. Which hours should your site show?'
      : 'Only one source gives your opening hours, as open 24 hours every day. Are these your opening hours?',
    code: disagree ? 'held_hours_disagree' : 'held_hours_unconfirmed',
    params: {},
    choices: disagree
      ? [CHOICES.edit, CHOICES.leave]
      : [{ ...CHOICES.keep, recommended: true }, CHOICES.edit, CHOICES.leave],
    freeText: { maxLength: TYPED_ANSWER_MAX_LENGTH, placeholder: 'Type your opening hours' }
  }
}

/**
 * The owner's hours pick from the answer to the held hours question, in the step chain's `hoursPick` shape, or null
 * when the answer gives none yet (Edit chosen and nothing typed, or typed hours that cannot be read).
 * @param {{choice?: string, text?: string} | null | undefined} answer the stored answer
 * @param {{choice?: string, facts?: Array<{kind: string, value: string, primary?: boolean}>} | null | undefined}
 *   reading the answer reading of a typed answer
 */
export function heldHoursPickOf(answer, reading) {
  const choice = reading?.choice ?? answer?.choice
  if (choice === 'keep' || choice === 'leave') return { choice }
  const hours = (Array.isArray(reading?.facts) ? reading.facts : [])
    .filter((f) => f?.kind === 'contact.hours' && typeof f.value === 'string' && f.value.trim() !== '')
    .flatMap((f) => f.value.split('\n').map((line) => line.trim()))
    .filter(Boolean)
  return hours.length ? hoursPickOf({ hoursPick: { choice: 'edit', hours } }) : null
}
