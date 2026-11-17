// The plan composer of the AI quickstart build (ticket #593, ADR 0046 decision 3, replacing the planner). ONE call to
// the standard build model (the model the step chain hands the step; no separate smaller model) composes the plan from
// the needs profile, the block list and the page recipes. The model never sees the demo: it reads the profile's data
// and the blocks' declared shape, nothing else. The rules gate (`plan-gate.mjs`) then checks the plan.
//
// The customer's answers to the profile's questions are applied first (`plan-answers.mjs`). Everything the model does
// not produce is checked before the call (`plan-preflight.mjs`), with its own error code and no model call.
//
// A plan that fails the gate is composed again, at most TWICE as the step chain's site planner is, with the gate's
// problems and the last plan as the gate read it (`firstPlan`, after the gate's own fixes), so each fix round corrects
// that plan instead of composing a new one with new faults. A mechanical fault the gate fixes itself never costs an attempt (`plan-gate-fixes.mjs`); every fix
// is recorded with its attempt and returned as `fixes` with the plan. A third failure throws a
// `PlanComposerError` with code `plan_gate_failed` and every problem, for the stop and report rule (ADR 0047, #591).
// That error carries `noRerun: true`: it already includes its own fix rounds, so the step chain does not run the
// step again. A model call that throws is left as it is, so the step chain may run the step once more. `buildPlanStep`
// (`plan-step.mjs`) settles the brand record, builds the needs profile, then composes the plan.
import { settleAnswers } from './plan-answers.mjs'
import { kindLimitsOf } from './answer-field-limits.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import { briefContextOf, briefLeftOutOf } from './plan-composer-brief.mjs'
import { addItemFieldFacts, conflictAssumptionsOf } from './plan-conflicts.mjs'
import { planDataOf } from './plan-data.mjs'
import { gatePlan } from './plan-gate.mjs'
import { lookOf } from './plan-look-pictures.mjs'
import { preflightContext, preflightDeclarations } from './plan-preflight.mjs'
import { withoutWithheld } from './plan-withheld.mjs'
import {
  PLAN_COMPOSER_PROMPT_FILE,
  PROMPT_SHA256,
  planComposerRequest,
  readComposerReply
} from './plan-composer-request.mjs'

export { PlanComposerError }
export { buildPlanStep } from './plan-step.mjs'
export {
  PLAN_COMPOSER_PROMPT,
  PLAN_COMPOSER_PROMPT_FILE,
  planComposerRequest,
  readComposerReply
} from './plan-composer-request.mjs'

/** How many times the model composes: the first attempt and two fix rounds with the gate's problems, as the step
 * chain's site planner has (gap audit of the plan stage, 17/11/2026). */
export const PLAN_COMPOSE_ATTEMPTS = 3

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Every block the plan may place, by id: the template's store first, then the Tracy library. */
export function blockMapOf(blockStore, library = []) {
  const blocks = new Map()
  for (const block of list(blockStore?.blocks))
    blocks.set(block.id, { ...block, source: block.source ?? 'template' })
  for (const block of list(library))
    if (!blocks.has(block.id)) blocks.set(block.id, { ...block, source: 'library' })
  return blocks
}

/**
 * What the composer works from: the profile's data with plan ids (after the customer's answers), every block of the
 * store and of the Tracy library, the recipes, the look and the assumptions the profile and the look bring. `profile`
 * in the result is the settled profile: the page writer reads its item fields. The look comes from the brand step's
 * record (`brandLookOf`, #616); only `allowTemplateLook: true`, for tests, keeps the old template fallback. `brief`: the
 * content brief research stored, when there is one (`plan-composer-brief.mjs`).
 * @throws {PlanComposerError} `answer_invalid` when an answer does not fit its question; `brand_missing` without a
 *   brand record; `brand_logo_colours_unmeasured` when the brand step kept the template accent and the logo's colours
 *   were never measured
 */
export function composerContextOf({
  profile: given,
  answers = [],
  answerReadings = null,
  blockStore,
  pageRecipes,
  library = [],
  template,
  brand,
  planId = 'plan',
  allowTemplateLook = false,
  brief = null
}) {
  const blocks = blockMapOf(blockStore, library)
  const settled = settleAnswers(given, answers, kindLimitsOf(blocks.values()), answerReadings)
  const profile = settled.profile
  const data = addItemFieldFacts(profile, planDataOf(profile))
  const recipes = new Map(list(pageRecipes?.recipes).map((r) => [r?.pageType, r]))
  const {
    look,
    assumptions: lookAssumptions,
    sources: lookSources
  } = lookOf(template, brand, { allowTemplateLook })
  const language = isText(profile?.language?.value) ? profile.language.value : 'en'
  const languageAssumption = isText(profile?.language?.value)
    ? []
    : [
        {
          id: 'language',
          field: 'language',
          said: 'No source showed its language, so the site is in English.'
        }
      ]
  const conflicts = conflictAssumptionsOf(profile, data)
  return {
    planId,
    profile,
    language,
    data,
    blocks,
    recipes,
    look,
    lookSources,
    template,
    allowTemplateLook,
    assumptions: [...conflicts.assumptions, ...lookAssumptions, ...languageAssumption],
    // What the content brief holds and no block can show: on the plan card, never lost (`plan-composer-brief.mjs`).
    leftOut: [...settled.leftOut, ...briefLeftOutOf(brief)],
    // The brief as the model reads it: key messages, audience, voice, held fields with their reasons.
    brief: briefContextOf(brief),
    conflicts: conflicts.accounting
  }
}

/**
 * Compose the plan: one model call, the gate, and at most two more calls with the gate's problems.
 * @param {Parameters<typeof composerContextOf>[0] & {model: (request: object) => Promise<unknown>}} input
 * @returns {Promise<{plan: object, profile: object, attempts: Array<{problems: object[], fixes?: object[]}>,
 *   fixes: object[], placed: object[],
 *   accounting: object, rows: object[], conflicts: object[], lookSources: object, prompt: object}>} `lookSources`:
 *   where the look's accent and logo came from (`{accent: {from, name}, logo: {from, name}}`); `rows`: the child list rows and row
 *   fields the gate's rules dropped, with their codes (`plan-rows.mjs`) `profile`: the profile after the answers, for the page
 *   writer; `accounting`: where every fact and item went; `conflicts`: how every conflict of the profile is settled
 */
export async function composePlan(input) {
  if (typeof input?.model !== 'function')
    throw new PlanComposerError('model_missing', 'no build model was given', {}, { noRerun: true })
  preflightDeclarations(input)
  const context = composerContextOf(input)
  preflightContext(context)
  const attempts = []
  let problems = []
  let firstPlan = null
  for (let n = 0; n < PLAN_COMPOSE_ATTEMPTS; n++) {
    const reply = await input.model(planComposerRequest(context, problems, firstPlan))
    const composition = readComposerReply(reply)
    const gated = composition
      ? gatePlan(composition, context)
      : {
          ok: false,
          fixes: [],
          problems: [{ code: 'reply_unreadable', at: '', message: 'the reply is not a JSON object' }]
        }
    attempts.push({ problems: gated.problems, ...(gated.fixes.length ? { fixes: gated.fixes } : {}) })
    if (gated.ok)
      return {
        plan: gated.plan,
        profile: withoutWithheld(context.profile),
        attempts,
        fixes: gated.fixes,
        placed: gated.placed,
        accounting: gated.accounting,
        rows: gated.rows,
        conflicts: context.conflicts,
        lookSources: context.lookSources,
        prompt: { file: PLAN_COMPOSER_PROMPT_FILE, sha256: PROMPT_SHA256 }
      }
    problems = gated.problems
    firstPlan = gated.composition ?? null
  }
  throw new PlanComposerError(
    'plan_gate_failed',
    `the composed plan failed the rules gate ${PLAN_COMPOSE_ATTEMPTS} times`,
    { problems, attempts },
    { noRerun: true }
  )
}
