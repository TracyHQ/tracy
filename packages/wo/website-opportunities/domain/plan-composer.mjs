// The plan composer of the AI quickstart build (ticket #593, ADR 0046 decision 3, replacing the planner). ONE call to
// the standard build model (the model the step chain hands the step; no separate smaller model) composes the plan from
// the needs profile, the block list and the page recipes. The model never sees the demo: it reads the profile's data
// and the blocks' declared shape, nothing else. The rules gate (`plan-gate.mjs`) then checks the plan.
//
// The customer's answers to the profile's questions are applied first (`plan-answers.mjs`). Everything the model does
// not produce is checked before the call (`plan-preflight.mjs`), with its own error code and no model call.
//
// A plan that fails the gate is composed again ONCE, with the gate's problems. A second failure throws a
// `PlanComposerError` with code `plan_gate_failed` and every problem, for the stop and report rule (ADR 0047, #591).
// That error carries `noRerun: true`: it already includes its own second attempt, so the step chain does not run the
// step again. A model call that throws is left as it is, so the step chain may run the step once more. `buildPlanStep`
// (`plan-step.mjs`) settles the brand record, builds the needs profile, then composes the plan.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { settleAnswers } from './plan-answers.mjs'
import { kindLimitsOf } from './answer-field-limits.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import { addItemFieldFacts, conflictAssumptionsOf } from './plan-conflicts.mjs'
import { modelViewOf, planDataOf } from './plan-data.mjs'
import { gatePlan } from './plan-gate.mjs'
import { lookOf } from './plan-look-pictures.mjs'
import { preflightContext, preflightDeclarations } from './plan-preflight.mjs'

export { PlanComposerError }
export { buildPlanStep } from './plan-step.mjs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every plan it composed. */
export const PLAN_COMPOSER_PROMPT_FILE = 'plan-composer-prompt.md'
export const PLAN_COMPOSER_PROMPT = readFileSync(
  new URL(`./${PLAN_COMPOSER_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PLAN_COMPOSER_PROMPT).digest('hex')
/** How many times the model composes: the first attempt and one more with the gate's problems. */
export const PLAN_COMPOSE_ATTEMPTS = 2

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const pick = (field) => {
  const { name, type, kind, limit } = field ?? {}
  return { name, type, ...(kind ? { kind } : {}), ...(limit ? { limit } : {}) }
}

/** A block as the model reads it: its declared shape only. Nothing else of the store reaches the model. */
const modelBlockOf = (block) => ({
  id: block.id,
  type: block.type,
  source: block.source ?? 'template',
  items: { min: block.items?.min, max: block.items?.max },
  noData: { rule: block.noData?.rule },
  fields: list(block.fields).map(pick),
  itemFields: list(block.itemFields).map(pick)
})

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
 * record (`brandLookOf`, #616); only `allowTemplateLook: true`, for tests, keeps the old template fallback.
 * @throws {PlanComposerError} `answer_invalid` when an answer does not fit its question; `brand_missing` without a
 *   brand record; `brand_accent_unsettled` when the brand step kept the template accent in a case no rule covers
 */
export function composerContextOf({
  profile: given,
  answers = [],
  blockStore,
  pageRecipes,
  library = [],
  template,
  brand,
  planId = 'plan',
  allowTemplateLook = false
}) {
  const blocks = blockMapOf(blockStore, library)
  const settled = settleAnswers(given, answers, kindLimitsOf(blocks.values()))
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
    leftOut: settled.leftOut,
    conflicts: conflicts.accounting
  }
}

/** The request of one model call: the prompt, the business, the blocks and the recipes, and the problems to fix. */
export function planComposerRequest(context, problems = []) {
  const user = {
    business: modelViewOf(context.data),
    language: context.language,
    blocks: [...context.blocks.values()].map(modelBlockOf),
    recipes: [...context.recipes.values()].map(({ pageType, mainBlock, blocks }) => ({
      pageType,
      mainBlock,
      blocks
    })),
    ...(problems.length ? { problems: problems.map(({ at, message }) => ({ at, message })) } : {})
  }
  return { system: PLAN_COMPOSER_PROMPT, user: JSON.stringify(user), format: 'json' }
}

/** The model's reply as an object, or null when it is not the JSON object the prompt asks for. */
export function readComposerReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/**
 * Compose the plan: one model call, the gate, and at most one more call with the gate's problems.
 * @param {Parameters<typeof composerContextOf>[0] & {model: (request: object) => Promise<unknown>}} input
 * @returns {Promise<{plan: object, profile: object, attempts: Array<{problems: object[]}>, placed: object[],
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
  for (let n = 0; n < PLAN_COMPOSE_ATTEMPTS; n++) {
    const composition = readComposerReply(await input.model(planComposerRequest(context, problems)))
    const gated = composition
      ? gatePlan(composition, context)
      : {
          ok: false,
          problems: [{ code: 'reply_unreadable', at: '', message: 'the reply is not a JSON object' }]
        }
    attempts.push({ problems: gated.problems })
    if (gated.ok)
      return {
        plan: gated.plan,
        profile: context.profile,
        attempts,
        placed: gated.placed,
        accounting: gated.accounting,
        rows: gated.rows,
        conflicts: context.conflicts,
        lookSources: context.lookSources,
        prompt: { file: PLAN_COMPOSER_PROMPT_FILE, sha256: PROMPT_SHA256 }
      }
    problems = gated.problems
  }
  throw new PlanComposerError(
    'plan_gate_failed',
    `the composed plan failed the rules gate ${PLAN_COMPOSE_ATTEMPTS} times`,
    { problems, attempts },
    { noRerun: true }
  )
}
