/**
 * The change request step of the build chat's engine (#609 over #617): the owner's written request revises the living
 * plan through Part 3's `revisePlan`. It makes a model call, so it runs in the background like compose (`engine.js`):
 * the same rerun rule, the same stopped handling, and no transaction held across the model call. The revised plan is
 * written only when the plan is still the one the request was made for (`putRevised`), so an edit made meanwhile is
 * never overwritten.
 *
 * 🔒 THE DRAFT KEEPS THE WHOLE PROFILE. `revisePlan` (like `composePlan`) hands on the profile without what the owner
 * keeps off the site, for the page writer. The draft's `needs_profile` is what the edit gate and the next request read,
 * and they need the held facts and items with the `withheld` marker (a card edit that shows the held name again must
 * find it), so the profile kept is the settled one `revisePlan` worked from (`composerContextOf`, no model call).
 */
import { randomUUID } from 'node:crypto'
import {
  PLAN_REQUEST_MAX_LENGTH,
  PLAN_REQUEST_SCHEMA,
  checkPlanRequest,
  composerContextOf,
  revisePlan
} from 'website-opportunities/domain'

/** Said when a written request is longer than a change request holds. Plain English, no dashes. */
export const requestTooLongSay = (limit = PLAN_REQUEST_MAX_LENGTH) =>
  `That request is too long. Please keep it to ${limit} characters or fewer.`
/** Said when a written request has nothing to read. Plain English, no dashes. */
export const REQUEST_EMPTY_SAY = 'Please tell me in a few words what you would like changed on the plan.'

/** A Contract B change request (`tracy-build-plan-request/v1`) for the living plan's current revision. */
export const planRequestOf = (plan, text, id = `request-${randomUUID()}`) => ({
  schema: PLAN_REQUEST_SCHEMA,
  id,
  plan: { id: plan.id, revision: plan.revision },
  text
})

/**
 * The owner sentence when a request cannot be sent to the model at all (too long, nothing to read), or null when it
 * can. Checked by the door before any step starts: no fault, the owner just writes it again.
 */
export function requestRefusalOf(plan, text) {
  const checked = checkPlanRequest(planRequestOf(plan, text, 'request-check'), plan)
  if (checked.ok) return null
  if ([...String(text)].length > PLAN_REQUEST_MAX_LENGTH)
    return { code: 'REQUEST_TOO_LONG', say: requestTooLongSay() }
  return { code: 'REQUEST_EMPTY', say: REQUEST_EMPTY_SAY }
}

/**
 * Revise the plan with the owner's request. Inputs are plain data (the rerun rule copies them).
 * @param {{plan: object, profile: object, request: object, template: object, brand: object}} inputs
 * @param {{model: Function, kit: {blockStore: object, pageRecipes: object, library?: object[]}}} tools
 * @returns {Promise<{plan: object, profile: object, unchanged: boolean, changed: string[], notDone: object[]}>}
 */
export async function reviseStep({ plan, profile, request, template, brand }, { model, kit }) {
  const shared = {
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: kit.library,
    template,
    brand
  }
  const revised = await revisePlan({ ...shared, plan, profile, request, model })
  if (revised.unchanged) return { ...revised, profile }
  return {
    ...revised,
    profile: composerContextOf({ ...shared, profile, answers: [], planId: plan.id }).profile
  }
}

/** What the revise step's done state keeps for the answer: the lines the owner reads, as Part 3 wrote them. */
export const revisionOf = (revised) => ({
  changed: Array.isArray(revised.changed) ? revised.changed : [],
  notDone: (Array.isArray(revised.notDone) ? revised.notDone : []).map(({ what, reason, why }) => ({
    what,
    reason,
    why
  }))
})
