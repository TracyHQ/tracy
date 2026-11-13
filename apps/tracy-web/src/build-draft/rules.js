/**
 * The pure rules of the pre site build draft (#603, `store.js`): what a draft accepts, held to Contract B (#590,
 * `docs/references/build-contract.md`), and how its one step of undo is made. The draft defines no format of its own:
 * a question, an answer, a plan and a plan edit are the Contract B documents, checked by the Contract B check.
 */
import { PLAN_EDIT_SCHEMA, checkAnswer, checkBuildDocument } from 'website-opportunities/domain'
import { parseFieldPath, resolveFieldPath } from 'website-opportunities/domain/build-contract-shared.mjs'

const BUILD_PLAN_SCHEMA = 'tracy-build-plan/v1'
const QUESTION_SCHEMA = 'tracy-build-question/v1'
const isName = (value) => typeof value === 'string' && value.trim() !== ''

/** The chosen template `{slug, name, version}`, the shape of a plan's `look.template`; null when it is not one. */
export function readTemplate(sent) {
  if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return null
  const { slug, name, version } = sent
  return isName(slug) && isName(name) && isName(version) ? { slug, name, version } : null
}

/** The Contract B problems of a build plan, or null when it passes. */
export function planProblem(plan) {
  if (plan?.schema !== BUILD_PLAN_SCHEMA)
    return [{ at: 'schema', message: `schema must be "${BUILD_PLAN_SCHEMA}"` }]
  const { problems } = checkBuildDocument(plan)
  return problems.length ? problems : null
}

/** The Contract B problems of an answer to its question (the question checked too), or null when both pass. */
export function answerProblem(question, answer) {
  if (question?.schema !== QUESTION_SCHEMA)
    return [{ at: 'question.schema', message: `schema must be "${QUESTION_SCHEMA}"` }]
  const asked = checkBuildDocument(question).problems.map((p) => ({ ...p, at: `question ${p.at}`.trim() }))
  if (asked.length) return asked
  const { problems } = checkAnswer(answer, question)
  return problems.length ? problems.map((p) => ({ ...p, at: `answer ${p.at}`.trim() })) : null
}

/**
 * The undo of a plan edit just applied to `before`: a Contract B plan edit of the plan it produced (revision + 1) that
 * puts each changed field back to its value in `before`. It is applied like any edit, so the revision keeps rising and
 * the partial re-run reads it like any other change.
 */
export function undoEditOf(before, edit) {
  return {
    schema: PLAN_EDIT_SCHEMA,
    id: `undo-${edit.id}`,
    plan: { id: edit.plan.id, revision: edit.plan.revision + 1 },
    changes: edit.changes.map(({ field }) => ({
      field,
      value: structuredClone(resolveFieldPath(before, parseFieldPath(field)).value)
    }))
  }
}

/** What the doors answer for a draft row: the Contract B documents as stored, and whether one undo is offered. */
export function draftShape(row) {
  return {
    id: row.id,
    questions: row.questions,
    answers: row.answers,
    template: row.template,
    plan: row.plan,
    lastEdit: row.last_edit,
    canUndo: row.undo_edit !== null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }
}
