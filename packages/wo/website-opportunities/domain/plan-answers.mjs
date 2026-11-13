// The customer's answers to the needs profile's questions, applied before the plan is composed (ticket #593). Pure: a
// profile and Contract B answers in, a settled copy of the profile out; the profile given is never changed.
// - `fact-conflict`: the fact (or item field) takes the chosen value with that value's sources, or the typed value with
//   the source `answer`, and the conflict is settled (`chosen`), so the plan shows no assumption for it;
// - `main-button`: the plan's main call to action, the fact `contact.cta_label`;
// - `contact-method`: a typed phone, email or link becomes that contact fact; a choice without a value is reported in
//   the plan's left out list, never invented;
// - `site-language`: the site language (`plan.language`);
// - `site-name`: the name the site shows while research keeps the business name off it (`plan-site-name.mjs`); a name
//   longer than the template's business name fields is `site_name_too_long` (`details.limit`), an empty one or one with
//   a control character, markup or markdown is `site_name_invalid`; both carry `details.question` (the whole question)
//   and `details.questionId`, so the chat asks again.
// An answer that does not pass `checkAnswer` against its question, names no question of the profile, answers one
// twice, or gives a value longer than the template's fields of that kind hold (`kindLimitsOf`; a fact is never
// shortened, so it would stop the build after approval) is an `answer_invalid` error, never a silent ignore. A
// question without an answer keeps its default.
import { checkAnswer } from './build-contract-questions.mjs'
import { languageTag, MAIN_BUTTON_KIND } from './needs-profile-questions.mjs'
import { conflictPlace } from './plan-conflicts.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import {
  normalisedSiteName,
  settleSiteName,
  siteNameErrorDetails,
  siteNameProblems
} from './plan-site-name.mjs'

/** The source id an answer's value carries in the settled profile; its origin `answer` reads "Your answer". */
export const ANSWER_SOURCE = 'customer-answer'
const list = (value) => (Array.isArray(value) ? value : [])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PLAN_TAG = /^[a-z]{2,3}(-[A-Z]{2})?$/
const LINK = /^https?:\/\/\S+$/i
const PHONE = /^\+?[\d\s().-]{6,}$/
const CONTACT_CHOICES = Object.freeze({
  phone: 'Your phone number',
  email: 'Your email address',
  link: 'Your booking or contact link'
})

/** The left out reason of a contact method chosen without its value; a later plan revision keeps the entry. */
export const CONTACT_VALUE_MISSING_REASON =
  'You chose how visitors reach you but gave no value yet, so none is shown. Add it on the plan.'

const answered = (value) => ({ value, sources: [ANSWER_SOURCE], confidence: 'single-source' })

/** The value and sources an answer gives to a conflict: the chosen value's own, or the typed text's. */
function conflictValue(answer, question, conflict) {
  if (answer.text !== undefined) return answered(answer.text.trim())
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

/** The contact fact a typed contact answer gives, or null when the text is not a phone, an email or a link. */
function contactKindOf(text) {
  if (EMAIL.test(text)) return 'contact.email'
  if (LINK.test(text)) return 'contact.cta_url'
  if (PHONE.test(text)) return 'contact.phone'
  return null
}

/** The fact an answer gives, as `{kind, value, at}`, or null when it gives none. */
function factOfAnswer(answer, question) {
  const text = typeof answer?.text === 'string' ? answer.text.trim() : undefined
  if (question.topic === 'main-button') {
    const value = text ?? question.choices.find((c) => c.id === answer?.choice)?.label
    return value === undefined
      ? null
      : { kind: MAIN_BUTTON_KIND, value, at: text === undefined ? 'choice' : 'text' }
  }
  if (text === undefined) return null
  if (question.topic === 'contact-method') return { kind: contactKindOf(text), value: text, at: 'text' }
  if (question.topic === 'fact-conflict') return { kind: question.fact, value: text, at: 'text' }
  return null
}

/**
 * Apply the customer's answers to a copy of the profile.
 * @param {object} profile a needs profile (`needs-profile.mjs`)
 * @param {object[]} [answers] Contract B answers (`tracy-build-answer/v1`)
 * @param {Map<string, number>} [limits] the template's smallest text limit per data kind (`kindLimitsOf`)
 * @returns {{profile: object, leftOut: object[], answered: string[]}} `answered`: the ids of the questions answered
 * @throws {PlanComposerError} `answer_invalid` with `details.problems`
 */
export function settleAnswers(profile, answers = [], limits = new Map()) {
  const problems = []
  if (!Array.isArray(answers))
    throw new PlanComposerError('answer_invalid', 'answers must be a list', {}, { noRerun: true })
  const questions = new Map(list(profile?.questions).map((q) => [q.id, q]))
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
    if (question.topic === 'site-language' && answer?.text !== undefined && !languageTag(answer.text))
      problems.push({ at: `answers[${i}].text`, message: 'not a language Tracy can read' })
    if (
      question.topic === 'contact-method' &&
      typeof answer?.text === 'string' &&
      !contactKindOf(answer.text.trim())
    )
      problems.push({ at: `answers[${i}].text`, message: 'not a phone number, an email address or a link' })
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
    if (question.topic === 'fact-conflict') {
      const conflict = settled.conflicts.find((c) => c.question === question.id)
      if (conflict) settleConflict(settled, conflict, conflictValue(answer, question, conflict))
    } else if (question.topic === 'main-button') {
      const label = answer.text?.trim() ?? question.choices.find((c) => c.id === answer.choice).label
      settled.facts['contact.cta_label'] = [answered(label)]
    } else if (question.topic === 'contact-method') {
      if (answer.text === undefined)
        leftOut.push({
          what: CONTACT_CHOICES[answer.choice] ?? 'Your contact detail',
          kind: 'feature',
          reason: CONTACT_VALUE_MISSING_REASON
        })
      else settled.facts[contactKindOf(answer.text.trim())] = [answered(answer.text.trim())]
    } else if (question.topic === 'site-name') {
      if (answer.text !== undefined) settleSiteName(settled, answer.text, answered)
    } else if (question.topic === 'site-language') {
      const tag = answer.text !== undefined ? languageTag(answer.text) : answer.choice
      // A plan language is a tag like `en` or `pt-BR`; a script subtag (`zh-Hant`) keeps its language only.
      settled.language = {
        ...settled.language,
        value: PLAN_TAG.test(tag) ? tag : tag.split('-')[0],
        chosenBy: 'answer'
      }
    }
  }
  if (answers.some((a) => !a.skipped))
    settled.sources = [...list(settled.sources), { id: ANSWER_SOURCE, origin: 'answer' }]
  return { profile: settled, leftOut, answered: answers.filter((a) => !a.skipped).map((a) => a.question) }
}
