// A change request and its plan revision, of Contract B (ticket #617): the customer types what they want changed on the
// plan in their own words (`tracy-build-plan-request/v1`), and the engine answers with what changed and what could not
// be done, each with a reason the customer reads (`tracy-build-plan-revision/v1`). The request text has a length limit
// (`request.text`, `TEXT_LIMITS`), checked here before any model reads it. Pure: a document in, every problem out.
import { closedShapeProblems, TEXT_LIMITS, textLength, textProblems } from './build-contract-shapes.mjs'
import { isName, isObject, isWhole, reporterFor } from './build-contract-shared.mjs'

export const PLAN_REQUEST_SCHEMA = 'tracy-build-plan-request/v1'
export const PLAN_REVISION_SCHEMA = 'tracy-build-plan-revision/v1'
/** The longest request a customer may type, in code points. */
export const PLAN_REQUEST_MAX_LENGTH = TEXT_LIMITS['request.text']
/**
 * Why a part of a request was not done: the template has no page recipe for it, the business has no data to fill the
 * section, the business does not have that fact, the customer keeps it private, or a plan cannot change it.
 */
export const NOT_DONE_REASONS = Object.freeze([
  'no_recipe',
  'no_data',
  'fact_missing',
  'kept_private',
  'outside_plan'
])

/**
 * The plan a document names: `{id, revision}`. A request may name any whole revision (0 included): one that is not the
 * plan's current revision is stale (`checkPlanRequest`), not malformed.
 */
function planReferenceProblems(ref, at, report, first = 1) {
  if (!isObject(ref) || !isName(ref.id) || !isWhole(ref.revision, first))
    return report(at, `${at} names the plan: {id, revision}`)
  closedShapeProblems(ref, 'plan reference', at, report)
}

/** Every problem of a change request on its own: shape, plan reference, and a text within its length. */
export function planRequestProblems(request, report) {
  if (!isObject(request)) return report('', 'a change request must be a JSON object')
  closedShapeProblems(request, 'plan request', '', report)
  if (request.schema !== PLAN_REQUEST_SCHEMA) report('schema', `schema must be "${PLAN_REQUEST_SCHEMA}"`)
  if (!isName(request.id)) report('id', 'a change request needs a non-empty id')
  planReferenceProblems(request.plan, 'plan', report, 0)
  if (isName(request.text) && visibleTextOf(request.text) === '')
    return report('text', 'a change request needs the text the customer typed: it has no visible character')
  textProblems(
    request.text,
    'text',
    report,
    'request.text',
    'a change request needs the text the customer typed'
  )
}

/**
 * Check a change request against the plan it applies to: its own problems, then the plan id and revision (a request
 * for an older revision is stale).
 * @returns {{ok: boolean, problems: Array<{at: string, message: string}>}}
 */
export function checkPlanRequest(request, plan) {
  const problems = []
  const report = reporterFor(problems)
  planRequestProblems(request, report)
  if (problems.length === 0 && request.plan.id !== plan?.id)
    report(
      'plan.id',
      `the request is for plan ${JSON.stringify(request.plan.id)}, not ${JSON.stringify(plan?.id)}`
    )
  else if (problems.length === 0 && request.plan.revision !== plan?.revision)
    report(
      'plan.revision',
      `the request is for revision ${request.plan.revision}, the plan is at ${plan?.revision}: a stale request is not applied`
    )
  return { ok: problems.length === 0, problems }
}

/**
 * A text without what shows nothing: format characters (zero width spaces and joiners, a byte order mark) and combining
 * marks attached to no character (at the start, or after white space), trimmed.
 */
export const visibleTextOf = (text) =>
  String(text)
    .replace(/\p{Cf}/gu, '')
    .replace(/(^|\s)\p{M}+/gu, '$1')
    .trim()

/** 0 when a request text is missing or shows no visible character; its length otherwise, in code points. */
export const requestTextLength = (text) => (isName(text) && visibleTextOf(text) !== '' ? textLength(text) : 0)

/** Every problem of a plan revision: the request it answers, the plan it produced, what changed and what was not done. */
export function planRevisionProblems(doc, report) {
  if (!isObject(doc)) return report('', 'a plan revision must be a JSON object')
  closedShapeProblems(doc, 'plan revision', '', report)
  if (doc.schema !== PLAN_REVISION_SCHEMA) report('schema', `schema must be "${PLAN_REVISION_SCHEMA}"`)
  if (!isName(doc.request)) report('request', 'a plan revision names the change request it answers')
  planReferenceProblems(doc.plan, 'plan', report)
  if (!Array.isArray(doc.changed))
    report('changed', 'changed lists what changed, in sentences (may be empty)')
  else
    doc.changed.forEach((line, i) =>
      textProblems(
        line,
        `changed[${i}]`,
        report,
        'changed[]',
        'a changed line is a sentence the customer reads'
      )
    )
  if (!Array.isArray(doc.notDone))
    return report('notDone', 'notDone lists what could not be done (may be empty)')
  doc.notDone.forEach((entry, i) => {
    const at = `notDone[${i}]`
    if (!isObject(entry)) return report(at, 'a not done entry must be an object {what, reason, why}')
    closedShapeProblems(entry, 'not done entry', at, report)
    textProblems(entry.what, `${at}.what`, report, 'what', 'say what was not done')
    if (!NOT_DONE_REASONS.includes(entry.reason))
      report(`${at}.reason`, `reason is one of ${NOT_DONE_REASONS.join(', ')}`)
    textProblems(entry.why, `${at}.why`, report, 'reason', 'say why, in words the customer reads')
  })
}
