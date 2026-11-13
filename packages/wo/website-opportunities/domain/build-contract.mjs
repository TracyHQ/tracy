// The Contract B check (ticket #590, parent spec #577, ADRs 0046 and 0047): what the build engine and the chat
// exchange. The build plan, progress events, the final outcome, questions to the customer with their answers, and
// plan edits. The chat renders only from these documents and never reads engine internals. Pure: documents in, every
// problem out, each with its place. Nothing throws on a malformed document.
//
// A build scenario bundles one customer's exchange in order (questions, answers, plan, edits, runs) so the check can
// also hold each answer to its question, each edit to the plan revision it applies to, and each run to its plan. The
// format is documented in `docs/references/build-contract.md`.
import { BUILD_PLAN_SCHEMA, buildPlanProblems } from './build-contract-plan.mjs'
import { checkPlanEdit, PLAN_EDIT_SCHEMA } from './build-contract-plan-edit.mjs'
import {
  PLAN_REQUEST_SCHEMA,
  PLAN_REVISION_SCHEMA,
  planRequestProblems,
  planRevisionProblems
} from './build-contract-plan-request.mjs'
import { ANSWER_SCHEMA, checkAnswer, QUESTION_SCHEMA, questionProblems } from './build-contract-questions.mjs'
import { OUTCOME_SCHEMA, outcomeProblems, PROGRESS_SCHEMA, progressProblems } from './build-contract-run.mjs'
import { runsProblems } from './build-contract-scenario-runs.mjs'
import { closedShapeProblems } from './build-contract-shapes.mjs'
import { isName, isObject, label, reporterFor } from './build-contract-shared.mjs'

export const BUILD_SCENARIO_SCHEMA = 'tracy-build-scenario/v1'
export const BUILD_SCENARIO_SUFFIX = '.build-scenario.json'

const SINGLE_DOCUMENTS = {
  [BUILD_PLAN_SCHEMA]: buildPlanProblems,
  [QUESTION_SCHEMA]: questionProblems,
  [PROGRESS_SCHEMA]: progressProblems,
  [OUTCOME_SCHEMA]: outcomeProblems,
  // A change request is checked on its own (shape and length); `checkPlanRequest` also holds it to its plan.
  [PLAN_REQUEST_SCHEMA]: planRequestProblems,
  [PLAN_REVISION_SCHEMA]: planRevisionProblems
}
const result = (problems) => ({ ok: problems.length === 0, problems })

function questionsAndAnswers(scenario, report) {
  const questions = new Map()
  ;(scenario.questions ?? []).forEach((question, i) => {
    const at = `questions[${label(question?.id, i)}]`
    if (isName(question?.id) && questions.has(question.id)) report(`${at}.id`, 'question id appears twice')
    questionProblems(question, report.under(at))
    if (isName(question?.id)) questions.set(question.id, question)
  })
  const answered = new Set()
  ;(scenario.answers ?? []).forEach((answer, i) => {
    const at = `answers[${label(answer?.question, i)}]`
    const question = questions.get(answer?.question)
    if (!question)
      return report(`${at}.question`, `${JSON.stringify(answer?.question)} is not a question asked`)
    if (answered.has(question.id)) report(at, 'a question is answered once')
    answered.add(question.id)
    for (const p of checkAnswer(answer, question).problems) report.under(at)(p.at, p.message)
  })
}

/** Apply the edits in order; returns revision -> plan and edit id -> revision it produced. */
function plansAndEdits(scenario, report) {
  const plans = new Map()
  const editRevision = new Map()
  const planReport = report.under('plan')
  let planProblemCount = 0
  buildPlanProblems(scenario.plan, (at, message) => {
    planProblemCount += 1
    planReport(at, message)
  })
  if (planProblemCount > 0) return { plans, editRevision, planOk: false }
  let current = scenario.plan
  plans.set(current.revision, current)
  ;(scenario.edits ?? []).forEach((edit, i) => {
    const at = `edits[${label(edit?.id, i)}]`
    const checked = checkPlanEdit(edit, current)
    for (const p of checked.problems) report.under(at)(p.at, p.message)
    if (!checked.ok) return
    current = checked.plan
    plans.set(current.revision, current)
    editRevision.set(edit.id, current.revision)
  })
  return { plans, editRevision, planOk: true }
}

/**
 * Check a build scenario: every document, then answers against questions, edits against the plan, runs against plans.
 * @returns {{ok: boolean, problems: Array<{at: string, message: string}>}}
 */
export function checkBuildScenario(scenario) {
  const problems = []
  const report = reporterFor(problems)
  if (!isObject(scenario)) {
    report('', 'a build scenario must be a JSON object')
    return result(problems)
  }
  if (scenario.schema !== BUILD_SCENARIO_SCHEMA) report('schema', `schema must be "${BUILD_SCENARIO_SCHEMA}"`)
  if (!isName(scenario.name)) report('name', 'a scenario needs a name')
  for (const key of ['questions', 'answers', 'edits', 'runs'])
    if (scenario[key] !== undefined && !Array.isArray(scenario[key])) report(key, `${key} must be a list`)
  if (problems.length > 0) return result(problems)
  closedShapeProblems(scenario, 'build scenario', '', report)
  questionsAndAnswers(scenario, report)
  const { plans, editRevision, planOk } = plansAndEdits(scenario, report)
  if (planOk) runsProblems(scenario, plans, editRevision, report)
  return result(problems)
}

/**
 * Check one Contract B document by its schema. A scenario is checked whole; an answer or a plan edit needs its
 * question or plan, so on its own it is checked through `checkAnswer` or `checkPlanEdit`, or inside a scenario.
 */
export function checkBuildDocument(doc) {
  if (doc?.schema === BUILD_SCENARIO_SCHEMA) return checkBuildScenario(doc)
  const problems = []
  const report = reporterFor(problems)
  const check = SINGLE_DOCUMENTS[doc?.schema]
  if (check) check(doc, report)
  else if (doc?.schema === ANSWER_SCHEMA || doc?.schema === PLAN_EDIT_SCHEMA)
    report(
      'schema',
      'an answer or a plan edit is checked against its question or plan: put it in a build scenario'
    )
  else report('schema', `${JSON.stringify(doc?.schema)} is not a Contract B schema`)
  return result(problems)
}

/** One line per problem, the way the gate prints them: `<file> <at>: <message>`. */
export const formatProblem = (file, { at, message }) => `${file}${at ? ` ${at}` : ''}: ${message}`
