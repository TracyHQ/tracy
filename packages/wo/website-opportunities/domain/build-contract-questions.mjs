// Questions to the customer and their answers, in Contract B (ticket #590, spec #577 "Questions to the customer").
// A question carries its choices, shown as buttons, and always accepts a free text answer. An answer is valid only
// against its question: it picks one of the choices, or gives text within the question's limit, or skips a question
// that may be skipped.

import { CONTROL_CHARACTER, closedShapeProblems, textLength, textProblems } from './build-contract-shapes.mjs'
import { isName, isObject, isWhole, label, reporterFor } from './build-contract-shared.mjs'
import { FACT_ROLES_V3 } from './place-content-roles.mjs'

export const QUESTION_SCHEMA = 'tracy-build-question/v1'
export const ANSWER_SCHEMA = 'tracy-build-answer/v1'
/** What a question may be about: the three agreed cases plus facts that disagree between sources. */
export const QUESTION_TOPICS = Object.freeze([
  'main-button',
  'contact-method',
  'site-language',
  'fact-conflict'
])

/** Report every problem of one question through `report(at, message)`. */
export function questionProblems(question, report) {
  if (!isObject(question)) return report('', 'a question must be a JSON object')
  closedShapeProblems(question, 'question', '', report)
  if (question.schema !== QUESTION_SCHEMA) report('schema', `schema must be "${QUESTION_SCHEMA}"`)
  if (!isName(question.id)) report('id', 'a question needs a non-empty id')
  if (!QUESTION_TOPICS.includes(question.topic))
    report('topic', `topic is one of ${QUESTION_TOPICS.join(', ')}`)
  if (question.topic === 'fact-conflict' && !FACT_ROLES_V3.includes(question.fact))
    report('fact', 'a fact conflict names the fact it settles, a fact role of place-content-roles/3')
  textProblems(
    question.prompt,
    'prompt',
    report,
    'prompt',
    'a question needs the sentence the customer reads'
  )
  if (!Array.isArray(question.choices) || question.choices.length === 0)
    report('choices', 'a question carries its choices, at least one')
  else {
    const ids = new Set()
    let recommended = 0
    question.choices.forEach((choice, i) => {
      const at = `choices[${label(choice?.id, i)}]`
      if (!isObject(choice)) return report(at, 'a choice must be an object {id, label}')
      closedShapeProblems(choice, 'choice', at, report)
      if (!isName(choice.id)) report(`${at}.id`, 'a choice needs a non-empty id')
      else if (ids.has(choice.id)) report(`${at}.id`, 'choice id appears twice')
      else ids.add(choice.id)
      textProblems(choice.label, `${at}.label`, report, 'label', 'a choice needs the label its button shows')
      if (choice.detail !== undefined)
        textProblems(choice.detail, `${at}.detail`, report, 'detail', 'a detail is a short text')
      if (choice.recommended !== undefined && typeof choice.recommended !== 'boolean')
        report(`${at}.recommended`, 'recommended is true or false')
      if (choice.recommended === true) recommended += 1
    })
    if (recommended > 1) report('choices', 'at most one choice is recommended')
  }
  const free = question.freeText
  if (!isObject(free) || !isWhole(free.maxLength, 1))
    report('freeText', 'a question accepts a free text answer: freeText {maxLength} is required')
  else {
    closedShapeProblems(free, 'free text', 'freeText', report)
    if (free.placeholder !== undefined)
      textProblems(
        free.placeholder,
        'freeText.placeholder',
        report,
        'placeholder',
        'a placeholder is a short text'
      )
  }
  if (question.skippable !== undefined && typeof question.skippable !== 'boolean')
    report('skippable', 'skippable is true or false')
}

/**
 * Check an answer against its question.
 * @returns {{ok: boolean, problems: Array<{at: string, message: string}>}}
 */
export function checkAnswer(answer, question) {
  const problems = []
  const report = reporterFor(problems)
  if (!isObject(answer)) {
    report('', 'an answer must be a JSON object')
    return { ok: false, problems }
  }
  closedShapeProblems(answer, 'answer', '', report)
  if (answer.schema !== ANSWER_SCHEMA) report('schema', `schema must be "${ANSWER_SCHEMA}"`)
  if (answer.question !== question?.id)
    report(
      'question',
      `the answer is for ${JSON.stringify(answer.question)}, not ${JSON.stringify(question?.id)}`
    )
  const forms = ['choice', 'text', 'skipped'].filter((key) => answer[key] !== undefined)
  if (forms.length !== 1) {
    report('', 'an answer holds exactly one of choice, text or skipped')
    return { ok: false, problems }
  }
  if (answer.choice !== undefined && !question?.choices?.some((choice) => choice?.id === answer.choice))
    report('choice', `${JSON.stringify(answer.choice)} is not a choice of the question`)
  if (answer.text !== undefined) {
    const max = question?.freeText?.maxLength ?? 0
    if (!isName(answer.text)) report('text', 'a free text answer is not empty')
    else if (CONTROL_CHARACTER.test(answer.text))
      report('text', 'a free text answer holds no control character (line breaks included)')
    else if (textLength(answer.text) > max)
      report('text', `a free text answer holds at most ${max} characters, counted by code point`)
  }
  if (answer.skipped !== undefined && !(answer.skipped === true && question?.skippable === true))
    report('skipped', 'only a question marked skippable can be skipped')
  return { ok: problems.length === 0, problems }
}
