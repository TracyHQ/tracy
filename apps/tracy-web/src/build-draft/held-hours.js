/**
 * The opening hours research's brief holds until the owner confirms them, settled in the build chat (#575 walk, second
 * round) THE STEP CHAIN'S WAY: the owner's choice is kept on the business as the Profile card keeps it (`hoursPick`,
 * `saveHoursPick`), and the content brief is made again from it, so the plan's hours are the brief's own.
 *
 *   ask      research asks `heldHoursQuestionOf` (Keep, They are wrong, Leave off) with its other questions, before the
 *            template choice; Edit chosen with nothing typed asks for the hours in words (`TYPED_ID`);
 *   settle   before the plan is composed, an answer not settled yet is read (typed hours by the answer reading, ledger
 *            step `answers`), kept as the pick, and the brief made again (`settleHeldHours`). An answer that gives no
 *            pick (hours that cannot be read) is settled too: the hours stay held, and nothing is asked twice.
 *
 * Only a research of links holds such hours: a business known by its owner's words has the hours the owner said.
 */
import { asChosen, HELD_HOURS_ID, heldHoursPickOf, heldHoursQuestionOf } from 'website-opportunities/domain'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The question asked for the hours in words, after Edit was chosen with nothing typed. */
export const TYPED_ID = `${HELD_HOURS_ID}.typed`
const typedQuestionOf = (question) => ({
  ...question,
  id: TYPED_ID,
  prompt: 'Type your opening hours, one line per group of days, for example Mon to Fri 9:00 to 18:00.',
  code: 'held_hours_typed',
  choices: question.choices.filter((c) => c.id === 'leave').map(({ recommended: _r, ...c }) => c)
})

const answerOf = (row, id) => list(row?.answers).find((a) => a?.question === id) ?? null

/** The held hours questions the draft's research asks now: none once its answer is settled. */
export function heldHoursQuestionsOf(row) {
  const research = row?.research
  if (!research || research.owner) return []
  const question = heldHoursQuestionOf(research.brief)
  if (!question) return []
  const answer = answerOf(row, question.id)
  const chosen = answer ? asChosen(answer, question) : null
  const typedNext = chosen?.choice === 'edit' && !isText(chosen.text)
  return typedNext ? [question, typedQuestionOf(question)] : [question]
}

/** The answer the hours are settled with, and its question, or null while there is none to settle. */
function pendingOf(row) {
  const [question, typed] = heldHoursQuestionsOf(row)
  if (!question) return null
  const asked = typed ?? question
  const answer = answerOf(row, asked.id)
  if (!answer) return null
  const key = JSON.stringify([asked.id, answer.choice ?? null, answer.text ?? null])
  return row.research.heldHoursSettled === key ? null : { question: asked, answer, key }
}

/** Whether the owner answered the held hours and the brief was not made again with the answer yet. */
export const heldHoursWaiting = (row) => pendingOf(row) !== null

/**
 * Keep the owner's answer as the business's hours pick and make the research again from the new brief.
 * @param {object} row the draft row
 * @param {{service: {hours: Function} | null, accountId: string,
 *   readAnswers: (questions: object[], answers: object[]) => Promise<Map<string, object> | null>,
 *   rebuild: () => Promise<object>}} tools `rebuild`: the research record made again from the business's brief
 * @returns {Promise<object | null>} the new research record, or null when nothing was waiting
 */
export async function settleHeldHours(row, { service, accountId, readAnswers, rebuild }) {
  const pending = pendingOf(row)
  if (!pending) return null
  const answer = asChosen(pending.answer, pending.question)
  const reading = isText(answer.text)
    ? ((await readAnswers([pending.question], [answer]).catch(() => null))?.get(pending.question.id) ?? null)
    : null
  const pick = heldHoursPickOf(answer, reading)
  const opportunityId = row.research.ids?.opportunityId
  // No pick, or no business to keep it on: settled as it is, the hours stay held and are not asked again.
  if (!pick || !opportunityId || !service?.hours) return { ...row.research, heldHoursSettled: pending.key }
  await service.hours({ accountId, opportunityId, pick })
  const record = await rebuild()
  return { ...record, profile: withAnswerSource(record.profile, pick), heldHoursSettled: pending.key }
}

/** The source the hours the owner kept or typed in the chat are credited to: "Your answer" (origin `answer`). */
export const HOURS_ANSWER_SOURCE = 'held-hours-answer'

/**
 * The needs profile with the owner's answer named first among the sources of its opening hours: the owner kept them or
 * typed them, so the plan card says "Your answer". A leave pick shows no hours, so nothing is credited.
 */
function withAnswerSource(profile, pick) {
  const hours = profile?.facts?.['contact.hours']
  if (pick.choice === 'leave' || !Array.isArray(hours) || hours.length === 0) return profile
  const sources = list(profile.sources)
  return {
    ...profile,
    sources: sources.some((s) => s?.id === HOURS_ANSWER_SOURCE)
      ? sources
      : [...sources, { id: HOURS_ANSWER_SOURCE, origin: 'answer' }],
    facts: {
      ...profile.facts,
      'contact.hours': hours.map((fact) => ({
        ...fact,
        sources: [HOURS_ANSWER_SOURCE, ...list(fact.sources).filter((id) => id !== HOURS_ANSWER_SOURCE)]
      }))
    }
  }
}
