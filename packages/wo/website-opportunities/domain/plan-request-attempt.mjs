// One attempt of a change request (ticket #617, `plan-request.mjs`): the model's answer checked (shape, quotes, texts),
// its changes applied to the current plan, the revised composition gated with the ids it keeps, what was settled put
// back, and the lines the customer reads. Every problem goes back to the re-compose. Pure.
import { checkBuildDocument } from './build-contract.mjs'
import { gatePlan } from './plan-gate.mjs'
import {
  applyRequestChanges,
  compositionPagesOf,
  givenIdsOf,
  REMOVED_PAGE_DATA_REASON
} from './plan-request-apply.mjs'
import { requestTextProblems } from './plan-request-guard.mjs'
import { systemPagesCompositionOf } from './plan-system-pages.mjs'
import { changedEntriesOf, notDoneLinesOf } from './plan-request-lines.mjs'
import { ownerValuesNotShown, withoutContradicted } from './plan-request-owner-apply.mjs'
import { requestReplyProblems } from './plan-request-reply.mjs'
import {
  carriedAssumptionsOf,
  carriedLeftOutOf,
  settledLookProblems,
  settleRevisedPlan
} from './plan-request-settled.mjs'
import { OWNER_REMOVED_REASON } from './plan-operations.mjs'
import { broughtBackProblems, customerTakenOffOf, REQUESTED_OFF_REASON } from './plan-request-taken-off.mjs'

/** The not done line of a request nothing on the plan can follow, when the model gave none. */
export const NOTHING_TO_CHANGE = Object.freeze({
  what: 'Your request',
  reason: 'outside_plan',
  why: 'Nothing on the plan could follow it, so the plan is unchanged.'
})
const list = (value) => (Array.isArray(value) ? value : [])
/** What the customer took off before, but a value the owner typed in this request: that is new data. */
const takenOffBefore = (plan, data, owner) => {
  const out = customerTakenOffOf(plan, data)
  for (const id of owner?.fresh ?? []) out.delete(id)
  return out
}

/** The gate's message for a channel a change took off its page, with what the re-compose may do. */
const CHANNEL_HINT =
  '; a change of this request took it off the page that showed it: keep it on the contact page in the same answer, or leave that part of the request undone and report it under notDone with reason outside_plan'
const MAIN_LOST =
  'this page lost its main section: a page cannot lose its main section; remove the page only when the request asks for that, or report the wish under notDone with reason outside_plan'

/** The code of a not done line: code's own, or none for a line the model wrote. */
const NOTHING_CODE = 'nothing_to_change'
const withCodes = (changed, notDone) => ({
  changed: changed.map((e) => e.text),
  notDone: notDone.map(({ what, reason, why }) => ({ what, reason, why })),
  codes: {
    changed: changed.map((e) => e.code),
    changedParams: changed.map((e) => e.params ?? {}),
    notDone: notDone.map((e) => e.code ?? null),
    notDoneParams: notDone.map((e) => e.params ?? {}),
    // The kind of refusal of every not done line (the closed set of its `reason`), also for a line the model wrote.
    notDoneReasons: notDone.map((e) => e.reason)
  }
})

/**
 * One attempt: the answer's shape and texts, the changes applied, the gate, what was settled put back, the lines.
 * `owner`: what code did itself for the request (`applyOwnerEdits`, with its `edits`), or null; `plan` is then the
 * plan with code's renames, and the context is composed from the profile with code's values.
 */
export function revisionOf(reply, { plan, request, context, owner = null }) {
  const problems = []
  const problem = (code, at, message) => problems.push({ code, at, message })
  const failed = () => ({ ok: false, problems })
  if (!requestReplyProblems(reply, request.text, problem)) return failed()
  requestTextProblems(reply, context, problem)
  const changes = list(reply.changes)
  const applied = applyRequestChanges(plan, changes, problem, context)
  const again = broughtBackProblems(
    {
      plan,
      data: context.data,
      changes,
      request: request.text,
      takenOff: takenOffBefore(plan, context.data, owner)
    },
    problem
  )
  if (problems.length > 0) return failed()
  const unchanged = (notDone) => ({
    ok: true,
    unchanged: true,
    plan,
    ...withCodes([], notDone.length ? notDone : [{ ...NOTHING_TO_CHANGE, code: NOTHING_CODE }])
  })
  const asked = list(reply.notDone).map(({ what, reason, why }) => ({ what, reason, why }))
  const modelNotDone = owner ? withoutContradicted(asked, owner.edits, plan) : asked
  if (changes.length === 0 && !owner) return unchanged(modelNotDone)
  for (const [id, reason] of owner?.takenOff ?? [])
    if (!applied.takenOff.has(id)) applied.takenOff.set(id, reason)
  const carried = carriedLeftOutOf({ plan, data: context.data, ...applied, fresh: owner?.fresh })
  const composition = {
    pages: compositionPagesOf(applied.pages),
    assumptions: carriedAssumptionsOf(plan, applied.pages),
    leftOut: carried.composition,
    // The legal and not-found pages the plan carries, on the pages the changes keep (`plan-system-pages.mjs`).
    ...systemPagesCompositionOf(plan, applied.pages, context.data)
  }
  const gated = gatePlan(composition, {
    ...context,
    leftOut: [...context.leftOut, ...carried.context],
    removedPageTypes: carried.removedTypes,
    carriedCodes: carried.codes,
    givenIds: givenIdsOf(applied.pages),
    idTag: `r${plan.revision + 1}`,
    labels: new Map(list(plan.items).map((i) => [i.id, i.label])),
    askedOff: new Set([REQUESTED_OFF_REASON, REMOVED_PAGE_DATA_REASON, OWNER_REMOVED_REASON])
  })
  if (!gated.ok)
    return {
      ok: false,
      problems: gated.problems.map((p) =>
        p.code === 'contact_channel_missing' && applied.removedPages.length + applied.takenOff.size > 0
          ? { ...p, message: p.message + CHANNEL_HINT }
          : p
      )
    }
  // A page the changes left without its main section is dropped by the gate: the request did not ask for that.
  const kept = new Set(gated.plan.pages.map((p) => p.id))
  for (const page of applied.pages)
    if (!page.origin.startsWith('new-') && !kept.has(page.origin))
      problem('page_lost', `pages[${page.origin}]`, MAIN_LOST)
  const revised = settleRevisedPlan(gated.plan, plan, context.blocks, context.data)
  for (const p of settledLookProblems(revised, gated.plan.look, plan, context))
    problem(p.code, p.at, p.message)
  for (const p of checkBuildDocument(revised).problems) problem('contract_b', p.at, p.message)
  if (problems.length > 0) return failed()
  const changed = [...(owner?.lines ?? []), ...changedEntriesOf(plan, revised, again, context.blocks)]
  const notDone = notDoneLinesOf({
    current: plan,
    revised,
    changes,
    refused: applied.refused,
    notDone: modelNotDone,
    codeNotDone: [
      ...applied.notDone,
      ...(owner?.notDone ?? []),
      ...(owner ? ownerValuesNotShown(owner.edits, revised) : [])
    ]
  })
  if (changed.length === 0) return unchanged(notDone)
  return { ok: true, unchanged: false, plan: revised, ...withCodes(changed, notDone), gated }
}
