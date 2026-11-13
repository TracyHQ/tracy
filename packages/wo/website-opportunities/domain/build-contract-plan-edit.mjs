// A plan edit of Contract B (ticket #590): a structured change to one or more fields of a build plan, sent back by the
// chat and consumed by the partial re-run. It names the plan and the revision it applies to and, per change, the
// field path and its new value. It is valid only against that plan: every field must be one the customer may change,
// the new value must keep the field's kind, and the edited plan must still pass the plan check.
import { buildPlanProblems, editableFieldProblem } from './build-contract-plan.mjs'
import { closedShapeProblems } from './build-contract-shapes.mjs'
import {
  isName,
  isObject,
  label,
  parseFieldPath,
  reporterFor,
  resolveFieldPath
} from './build-contract-shared.mjs'

export const PLAN_EDIT_SCHEMA = 'tracy-build-plan-edit/v1'

const kindOf = (value) => (Array.isArray(value) ? 'list' : value === null ? 'null' : typeof value)

/** The edit's own shape, without the plan: schema, id, plan reference and changes. */
function editShapeProblems(edit, report) {
  if (!isObject(edit)) return report('', 'a plan edit must be a JSON object')
  closedShapeProblems(edit, 'plan edit', '', report)
  if (edit.schema !== PLAN_EDIT_SCHEMA) report('schema', `schema must be "${PLAN_EDIT_SCHEMA}"`)
  if (!isName(edit.id)) report('id', 'a plan edit needs a non-empty id')
  if (!isObject(edit.plan) || !isName(edit.plan.id) || !Number.isInteger(edit.plan.revision))
    report('plan', 'plan names the plan the edit applies to: {id, revision}')
  else closedShapeProblems(edit.plan, 'plan reference', 'plan', report)
  if (!Array.isArray(edit.changes) || edit.changes.length === 0)
    return report('changes', 'changes must list at least one {field, value}')
  const fields = new Set()
  edit.changes.forEach((change, i) => {
    const at = `changes[${label(change?.field, i)}]`
    if (!isObject(change) || !isName(change.field)) return report(at, 'a change must be {field, value}')
    closedShapeProblems(change, 'change', at, report)
    if (fields.has(change.field)) report(at, 'the same field is changed twice in one edit')
    fields.add(change.field)
    if (!Object.hasOwn(change, 'value')) report(`${at}.value`, 'a change needs its new value')
  })
}

/** A copy of `plan` with the edit's changes applied and the revision raised by one. Assumes a valid edit. */
export function applyPlanEdit(plan, edit) {
  const next = structuredClone(plan)
  for (const { field, value } of edit.changes) {
    const found = resolveFieldPath(next, parseFieldPath(field))
    found.parent[found.key] = structuredClone(value)
  }
  next.revision = plan.revision + 1
  return next
}

/**
 * Check a plan edit against the plan it applies to. Problems of the edit sit at their place in the edit; problems
 * the edit would cause in the plan sit at `plan <place in the plan>`, the message starting "after the edit".
 * @returns {{ok: boolean, plan: object | null, problems: Array<{at: string, message: string}>}} `plan` is the
 *   edited plan when the edit is valid
 */
export function checkPlanEdit(edit, plan) {
  const problems = []
  const report = reporterFor(problems)
  editShapeProblems(edit, report)
  if (problems.length > 0) return { ok: false, plan: null, problems }
  if (edit.plan.id !== plan?.id)
    report('plan.id', `the edit is for plan ${JSON.stringify(edit.plan.id)}, not ${JSON.stringify(plan?.id)}`)
  else if (edit.plan.revision !== plan.revision)
    report(
      'plan.revision',
      `the edit is for revision ${edit.plan.revision}, the plan is at ${plan.revision}: a stale edit is not applied`
    )
  for (const change of edit.changes) {
    const at = `changes[${change.field}]`
    const problem = editableFieldProblem(plan, change.field)
    if (problem) {
      report(`${at}.field`, problem)
      continue
    }
    const current = resolveFieldPath(plan, parseFieldPath(change.field)).value
    if (kindOf(current) !== kindOf(change.value))
      report(
        `${at}.value`,
        `the field holds a ${kindOf(current)}, the new value is a ${kindOf(change.value)}`
      )
  }
  if (problems.length > 0) return { ok: false, plan: null, problems }
  const next = applyPlanEdit(plan, edit)
  buildPlanProblems(next, (at, message) => report(`plan ${at}`, `after the edit: ${message}`))
  return problems.length > 0 ? { ok: false, plan: null, problems } : { ok: true, plan: next, problems }
}
