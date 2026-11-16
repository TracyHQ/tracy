// The customer's answers to the needs profile's questions, applied before the plan is composed (ticket #593). Pure: a
// profile and Contract B answers in, a settled copy of the profile out; the profile given is never changed.
// - `fact-conflict`: the fact (or item field) takes the chosen value with that value's sources, and the conflict is
//   settled (`chosen`), so the plan shows no assumption for it;
// - `main-button`: the chosen label is the plan's main call to action, the fact `contact.cta_label`;
// - `contact-method`: a choice without a value is reported in the plan's left out list, never invented;
// - `site-language`: the chosen tag is the site language (`plan.language`);
// - typed text on any of those four is read by the model (`answer-reading.mjs`), never by code: it is never held to a
//   template field's limit, and what the reading kept is written (`plan-answer-readings.mjs`; a language tag on the
//   site language). On the first three it is also an owner statement for the page writer (`plan-free-answers.mjs`).
//   Unread, it changes no value. Text typed exactly as an offered choice is that choice;
// - `site-name`: the name the site shows while research keeps the business name off it (`plan-site-name.mjs`); a name
//   longer than the template's business name fields is `site_name_too_long` (`details.limit`), an empty one or one with
//   a control character, markup or markdown is `site_name_invalid`; both carry `details.question` (the whole question)
//   and `details.questionId`, so the chat asks again.
// An answer that does not pass `checkAnswer` against its question, names no question of the profile, answers one
// twice, or gives a value longer than the template's fields of that kind hold (`kindLimitsOf`; a fact is never
// shortened, so it would stop the build after approval) is an `answer_invalid` error, never a silent ignore. A
// question without an answer keeps its default.
import { checkAnswer } from './build-contract-questions.mjs'
import { MAIN_BUTTON_KIND } from './needs-profile-questions.mjs'
import { conflictPlace } from './plan-conflicts.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import { asChosen, isStatement, isTyped, statementOf } from './plan-free-answers.mjs'
import { applyReading, readingsMapOf } from './plan-answer-readings.mjs'
import {
  normalisedSiteName,
  settleSiteName,
  siteNameErrorDetails,
  siteNameProblems
} from './plan-site-name.mjs'

/** The source id an answer's value carries in the settled profile; its origin `answer` reads "Your answer". */
export const ANSWER_SOURCE = 'customer-answer'
const list = (value) => (Array.isArray(value) ? value : [])
const PLAN_TAG = /^[a-z]{2,3}(-[A-Z]{2})?$/
const CONTACT_CHOICES = Object.freeze({
  phone: 'Your phone number',
  email: 'Your email address',
  link: 'Your booking or contact link'
})

/** The left out reason of a contact method chosen without its value; a later plan revision keeps the entry. */
export const CONTACT_VALUE_MISSING_REASON =
  'You chose how visitors reach you but gave no value yet, so none is shown. Add it on the plan.'

const answered = (value) => ({ value, sources: [ANSWER_SOURCE], confidence: 'single-source' })

/** The value and sources a chosen answer gives to a conflict: the chosen value's own. */
function conflictValue(answer, question, conflict) {
  const choice = question.choices.find((c) => c.id === answer.choice)
  const index = question.choices.indexOf(choice)
  const value = list(conflict.values).find((v) => v.value === choice.label) ?? list(conflict.values)[index]
  return { value: value.value, sources: [...value.sources], confidence: 'single-source' }
}

function settleConflict(profile, conflict, fact) {
  const place = conflictPlace(conflict)
  if (place.scope === 'fact') profile.facts[place.kind] = [{ ...profile.facts[place.kind]?.[0], ...fact }]
  else if (place.scope === 'item') {
    const item = list(profile.items?.[place.kind]).find((i) => i.id === place.id)
    if (item) item.fields[place.role] = { ...item.fields[place.role], ...fact }
  }
  conflict.chosen = fact.value
  conflict.chosenBy = 'answer'
}

/** The site language a chosen or read tag gives; a script subtag (`zh-Hant`) keeps its language only. */
function setLanguage(profile, tag) {
  profile.language = {
    ...profile.language,
    value: PLAN_TAG.test(tag) ? tag : tag.split('-')[0],
    chosenBy: 'answer'
  }
}

/** The fact an answer gives, as `{kind, value, at}`, or null when it gives none. */
function factOfAnswer(answer, question) {
  if (isTyped(answer, question)) return null
  const text = typeof answer?.text === 'string' ? answer.text.trim() : undefined
  if (question.topic === 'main-button') {
    const value = text ?? question.choices.find((c) => c.id === answer?.choice)?.label
    return value === undefined
      ? null
      : { kind: MAIN_BUTTON_KIND, value, at: text === undefined ? 'choice' : 'text' }
  }
  return null
}

/**
 * Apply the customer's answers to a copy of the profile.
 * @param {object} profile a needs profile (`needs-profile.mjs`)
 * @param {object[]} [answers] Contract B answers (`tracy-build-answer/v1`)
 * @param {Map<string, number>} [limits] the template's smallest text limit per data kind (`kindLimitsOf`)
 * @param {Map<string, object> | object | null} [readings] what the answer reading kept per question
 *   (`answer-reading.mjs`): a free answer it read as a choice settles as that choice, its facts are written with the
 *   answer source (`plan-answer-readings.mjs`); the typed text stays an owner statement either way
 * @returns {{profile: object, leftOut: object[], answered: string[]}} `answered`: the ids of the questions answered
 * @throws {PlanComposerError} `answer_invalid` with `details.problems`
 */
export function settleAnswers(profile, answers = [], limits = new Map(), readings = null) {
  const problems = []
  if (!Array.isArray(answers))
    throw new PlanComposerError('answer_invalid', 'answers must be a list', {}, { noRerun: true })
  const questions = new Map(list(profile?.questions).map((q) => [q.id, q]))
  const reads = readingsMapOf(readings)
  // The typed answers the reading read as an offered choice: settled as that choice, kept as a statement too.
  const typed = new Map()
  answers = answers.map((given) => {
    const question = questions.get(given?.question)
    const a = asChosen(given, question)
    // A contact method's choice names no value, so its reading's facts are what count.
    const choice =
      question && isTyped(a, question) && question.topic !== 'contact-method'
        ? reads.get(question.id)?.choice
        : undefined
    if (!choice) return a
    typed.set(question.id, a)
    const { text: _text, ...rest } = a
    return { ...rest, choice }
  })
  const seen = new Set()
  let tooLong
  const nameProblems = []
  answers.forEach((answer, i) => {
    const question = questions.get(answer?.question)
    if (!question)
      return problems.push({ at: `answers[${i}].question`, message: 'not a question of the profile' })
    const isName = question.topic === 'site-name'
    if (seen.has(question.id)) {
      const twice = { at: `answers[${i}]`, message: 'the question is answered twice' }
      problems.push(twice)
      if (isName) nameProblems.push(twice)
    }
    seen.add(question.id)
    // A site name is normalised before it is checked: a tab or a no-break space is a space, not a control character.
    const checked =
      isName && typeof answer?.text === 'string'
        ? { ...answer, text: normalisedSiteName(answer.text) }
        : answer
    for (const p of checkAnswer(checked, question).problems) {
      const found = { at: `answers[${i}]${p.at ? `.${p.at}` : ''}`, message: p.message }
      problems.push(found)
      if (isName) nameProblems.push(found)
    }
    if (isName && typeof answer?.text === 'string') {
      const named = siteNameProblems(
        answer.text,
        limits,
        `answers[${i}].text`,
        list(profile?.withheld?.people)
      )
      problems.push(...named.problems)
      if (named.tooLong) tooLong ??= named.tooLong
      else nameProblems.push(...named.problems)
    }
    const fact = answer?.skipped ? null : factOfAnswer(answer, question)
    const limit = fact?.kind ? limits.get(fact.kind) : undefined
    if (limit !== undefined && [...fact.value].length > limit)
      problems.push({
        at: `answers[${i}].${fact.at}`,
        message: `${[...fact.value].length} characters, longer than the ${limit} the template's field holds`
      })
  })
  if (tooLong)
    throw new PlanComposerError(
      'site_name_too_long',
      `the site name holds ${tooLong.length} characters, the template's business name at most ${tooLong.limit}`,
      siteNameErrorDetails(profile, limits, { ...tooLong, problems }),
      { noRerun: true }
    )
  if (nameProblems.length > 0)
    throw new PlanComposerError(
      'site_name_invalid',
      `the site name is not plain text a site can show (${nameProblems.length} problem(s))`,
      siteNameErrorDetails(profile, limits, { problems }),
      { noRerun: true }
    )
  if (problems.length > 0)
    throw new PlanComposerError(
      'answer_invalid',
      `${problems.length} answer problem(s)`,
      { problems },
      { noRerun: true }
    )
  const settled = structuredClone(profile)
  settled.facts ??= {}
  const leftOut = []
  for (const answer of answers) {
    if (answer.skipped) continue
    const question = questions.get(answer.question)
    const original = typed.get(question.id) ?? (isTyped(answer, question) ? answer : null)
    const conflictOf = () => settled.conflicts?.find((c) => c.question === question.id)
    const statement =
      original && isStatement(original, question)
        ? statementOf(original, question, conflictOf(), ANSWER_SOURCE)
        : null
    if (statement) settled.ownerFacts = [...list(settled.ownerFacts), statement]
    const reading = original ? reads.get(question.id) : undefined
    if (reading) applyReading(settled, { question, reading, statement, answered, settleConflict })
    if (isTyped(answer, question)) {
      if (question.topic === 'site-language' && reading?.language) setLanguage(settled, reading.language)
      continue
    }
    if (question.topic === 'fact-conflict') {
      const conflict = settled.conflicts.find((c) => c.question === question.id)
      if (conflict) settleConflict(settled, conflict, conflictValue(answer, question, conflict))
    } else if (question.topic === 'main-button') {
      const label = question.choices.find((c) => c.id === answer.choice).label
      settled.facts['contact.cta_label'] = [answered(label)]
    } else if (question.topic === 'contact-method') {
      leftOut.push({
        what: CONTACT_CHOICES[answer.choice] ?? 'Your contact detail',
        kind: 'feature',
        reason: CONTACT_VALUE_MISSING_REASON,
        code: 'contact_value_missing'
      })
    } else if (question.topic === 'site-name') {
      if (answer.text !== undefined) settleSiteName(settled, answer.text, answered)
    } else if (question.topic === 'site-language') setLanguage(settled, answer.choice)
  }
  if (answers.some((a) => !a.skipped))
    settled.sources = [...list(settled.sources), { id: ANSWER_SOURCE, origin: 'answer' }]
  return { profile: settled, leftOut, answered: answers.filter((a) => !a.skipped).map((a) => a.question) }
}
