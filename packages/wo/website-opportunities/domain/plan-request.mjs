// The plan step's change request (ticket #617, parent #577): the customer types what they want changed on the plan, and
// the standard build model revises it. The request is checked first (Contract B, `build-contract-plan-request.mjs`): an
// empty, blank, over long or stale request stops with its own code before any model call. The model answers with a
// closed list of changes, each quoting the words of the request that ask for it (`plan-request-reply.mjs`); code
// applies them to the current plan (`plan-request-apply.mjs`), so nothing the request does not name can move, then the
// revised composition goes through the same rules gate as a first plan (`gatePlan`), with the same single re-compose
// on a failure and the same `plan_gate_failed` error with `noRerun` after the second. What was settled before is put
// back by code (`plan-request-settled.mjs`). The customer reads what changed, held to the real difference, and what
// could not be done with a reason (`plan-request-lines.mjs`); every text the model writes passes the guard of the
// plan's own lines (`plan-request-guard.mjs`). A request that leads to no change returns the plan unchanged, with the
// explanation: not a failure.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { checkBuildDocument } from './build-contract.mjs'
import {
  checkPlanRequest,
  PLAN_REQUEST_MAX_LENGTH,
  PLAN_REVISION_SCHEMA,
  requestTextLength
} from './build-contract-plan-request.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import { composerContextOf, planComposerRequest, readComposerReply } from './plan-composer.mjs'
import { gatePlan } from './plan-gate.mjs'
import { preflightContext, preflightDeclarations } from './plan-preflight.mjs'
import { applyRequestChanges, compositionPagesOf } from './plan-request-apply.mjs'
import { requestTextProblems } from './plan-request-guard.mjs'
import { planDifferenceOf, readableResultOf } from './plan-request-lines.mjs'
import { requestReplyProblems } from './plan-request-reply.mjs'
import { carriedAssumptionsOf, carriedLeftOutOf, settleRevisedPlan } from './plan-request-settled.mjs'
import { withoutWithheld } from './plan-withheld.mjs'

export const PLAN_REQUEST_PROMPT_FILE = 'plan-request-prompt.md'
export const PLAN_REQUEST_PROMPT = readFileSync(
  new URL(`./${PLAN_REQUEST_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PLAN_REQUEST_PROMPT).digest('hex')
/** The not done line of a request nothing on the plan can follow, when the model gave none. */
export const NOTHING_TO_CHANGE = Object.freeze({
  what: 'Your request',
  reason: 'outside_plan',
  why: 'Nothing on the plan could follow it, so the plan is unchanged.'
})
const list = (value) => (Array.isArray(value) ? value : [])
const fail = (code, message, details = {}) => new PlanComposerError(code, message, details, { noRerun: true })

/** Refuse a request before any model call: missing, blank, over long, or not for this plan's revision. */
function checkRequest(request, plan) {
  const length = requestTextLength(request?.text)
  if (length === 0) throw fail('request_empty', 'the change request has no text')
  if (length > PLAN_REQUEST_MAX_LENGTH)
    throw fail(
      'request_too_long',
      `the change request has ${length} characters, at most ${PLAN_REQUEST_MAX_LENGTH}`
    )
  const checked = checkPlanRequest(request, plan)
  if (checked.ok) return
  const stale = checked.problems.some((p) => p.at === 'plan.revision' || p.at === 'plan.id')
  throw fail(stale ? 'request_stale' : 'request_invalid', 'the change request does not fit the plan', {
    problems: checked.problems
  })
}

/** The request of one model call: the composer's view of the business, the current plan, the customer's words. */
export function planRequestModelRequest(context, plan, text, problems = []) {
  const view = JSON.parse(planComposerRequest(context).user)
  const pages = plan.pages.map(({ id, name, pageType, blocks }) => ({
    id,
    name,
    pageType,
    blocks: blocks.map((b) => ({ id: b.id, block: b.block, label: b.label, data: [...b.data] }))
  }))
  const user = {
    request: text,
    plan: { language: plan.language, pages },
    ...view,
    ...(problems.length ? { problems: problems.map(({ at, message }) => ({ at, message })) } : {})
  }
  return { system: PLAN_REQUEST_PROMPT, user: JSON.stringify(user), format: 'json' }
}

/** One attempt: the answer's shape and texts, the changes applied, the gate, what was settled put back, the lines. */
function revisionOf(reply, { plan, request, context }) {
  const problems = []
  const problem = (code, at, message) => problems.push({ code, at, message })
  const failed = () => ({ ok: false, problems })
  if (!requestReplyProblems(reply, request.text, problem)) return failed()
  requestTextProblems(reply, context, problem)
  const changes = list(reply.changes)
  const applied = applyRequestChanges(plan, changes, problem)
  if (problems.length > 0) return failed()
  const unchanged = (lost = []) => {
    const notDone = [...list(reply.notDone).map(({ what, reason, why }) => ({ what, reason, why })), ...lost]
    return {
      ok: true,
      unchanged: true,
      plan,
      changed: [],
      notDone: notDone.length ? notDone : [{ ...NOTHING_TO_CHANGE }]
    }
  }
  if (changes.length === 0) return unchanged()
  const removedPages = plan.pages
    .filter((p) => applied.units.includes(`page-removed:${p.id}`))
    .map((p) => p.name)
  const carried = carriedLeftOutOf({
    plan,
    data: context.data,
    pages: applied.pages,
    ...applied,
    removedPages
  })
  const composition = {
    pages: compositionPagesOf(applied.pages),
    assumptions: carriedAssumptionsOf(plan),
    leftOut: carried.composition
  }
  const gated = gatePlan(composition, { ...context, leftOut: [...context.leftOut, ...carried.context] })
  if (!gated.ok) return { ok: false, problems: gated.problems }
  const revised = settleRevisedPlan(gated.plan, plan, context.blocks, context.data)
  for (const p of checkBuildDocument(revised).problems) problem('contract_b', p.at, p.message)
  if (problems.length > 0) return failed()
  const difference = planDifferenceOf(plan, revised, applied.pages, context.recipes)
  const lines = readableResultOf({ difference, changes, units: applied.units, notDone: list(reply.notDone) })
  if (difference.length === 0) return unchanged(lines.notDone.slice(list(reply.notDone).length))
  return { ok: true, unchanged: false, plan: revised, ...lines, gated }
}

/**
 * Revise a plan after the customer's change request.
 * @param {{plan: object, profile: object, request: object, model: Function, blockStore: object, pageRecipes: object,
 *   library?: object[], template: object, brand: object, allowTemplateLook?: boolean}} input `plan` and `profile` as
 *   the draft keeps them (the living plan and its settled needs profile); `request` a `tracy-build-plan-request/v1`
 *   for that plan's revision; the kit, the template and the brand record as the first composition had them
 * @returns {Promise<{plan: object, profile: object, unchanged: boolean, changed: string[],
 *   notDone: Array<{what: string, reason: string, why: string}>, revision: object, attempts: Array<{problems: object[]}>,
 *   prompt: {file: string, sha256: string}, placed?: object[], accounting?: object, rows?: object[]}>} `revision`: the
 *   Contract B `tracy-build-plan-revision/v1` the chat shows; `plan` is the current plan itself when `unchanged`
 * @throws {PlanComposerError} `request_empty`, `request_too_long`, `request_stale`, `request_invalid`, `model_missing`
 *   and the composer's preflight codes before any model call; `plan_gate_failed` (`noRerun`) after two failed attempts
 */
export async function revisePlan({ plan, profile, request, model, ...kit }) {
  if (typeof model !== 'function') throw fail('model_missing', 'no build model was given')
  checkRequest(request, plan)
  preflightDeclarations(kit)
  const base = composerContextOf({ ...kit, profile, answers: [], planId: plan.id })
  preflightContext(base)
  // The language the customer chose on the plan card stays; the look is composed as a first plan's (and checked as
  // one), then the look fields the customer changed are put back (`settleRevisedPlan`).
  const context = { ...base, language: plan.language }
  const attempts = []
  let problems = []
  for (let n = 0; n < 2; n++) {
    const reply = readComposerReply(
      await model(planRequestModelRequest(context, plan, request.text, problems))
    )
    const result = revisionOf(reply, { plan, request, context })
    const revision = result.ok && {
      schema: PLAN_REVISION_SCHEMA,
      request: request.id,
      plan: { id: result.plan.id, revision: result.plan.revision },
      changed: result.changed,
      notDone: result.notDone
    }
    // The lines the customer reads are a Contract B document too: one that fails the check is never shown.
    const failed = result.ok
      ? checkBuildDocument(revision).problems.map((p) => ({ code: 'contract_b', ...p }))
      : result.problems
    attempts.push({ problems: failed })
    if (failed.length > 0) {
      problems = failed
      continue
    }
    const { gated } = result
    return {
      plan: result.plan,
      profile: result.unchanged ? profile : withoutWithheld(context.profile),
      unchanged: result.unchanged,
      changed: result.changed,
      notDone: result.notDone,
      revision,
      attempts,
      prompt: { file: PLAN_REQUEST_PROMPT_FILE, sha256: PROMPT_SHA256 },
      ...(gated ? { placed: gated.placed, accounting: gated.accounting, rows: gated.rows } : {})
    }
  }
  throw fail('plan_gate_failed', 'the revised plan failed the rules gate 2 times', { problems, attempts })
}
