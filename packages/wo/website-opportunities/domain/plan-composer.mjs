// The plan composer of the AI quickstart build (ticket #593, ADR 0046 decision 3, replacing the planner). ONE call to
// the standard build model (the model the step chain hands the step; no separate smaller model) composes the plan from
// the needs profile, the block list and the page recipes. The model never sees the demo: it reads the profile's data
// and the blocks' declared shape, nothing else. The rules gate (`plan-gate.mjs`) then checks the plan.
//
// A plan that fails the gate is composed again ONCE, with the gate's problems. A second failure throws a
// `PlanComposerError` with code `plan_gate_failed` and every problem, for the stop and report rule (ADR 0047, #591).
//
// `buildPlanStep` runs the brand step in parallel with the needs profile once research has finished, and composes the
// plan only after both have finished, so the look section is final before the plan is shown.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildNeedsProfile } from './needs-profile.mjs'
import { conflictAssumptionsOf, modelViewOf, planDataOf } from './plan-data.mjs'
import { gatePlan } from './plan-gate.mjs'
import { lookOf } from './plan-look-pictures.mjs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every plan it composed. */
export const PLAN_COMPOSER_PROMPT_FILE = 'plan-composer-prompt.md'
export const PLAN_COMPOSER_PROMPT = readFileSync(
  new URL(`./${PLAN_COMPOSER_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PLAN_COMPOSER_PROMPT).digest('hex')
/** How many times the model composes: the first attempt and one more with the gate's problems. */
export const PLAN_COMPOSE_ATTEMPTS = 2

/** A failure of the plan step, with a code the step chain reports (ADR 0047). `details` keeps what the report needs. */
export class PlanComposerError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
  }
}

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

/**
 * What the composer works from: the profile's data with plan ids, every block of the store and of the Tracy library,
 * the recipes, the look and the assumptions the profile and the look bring.
 */
export function composerContextOf({
  profile,
  blockStore,
  pageRecipes,
  library = [],
  template,
  brand,
  planId = 'plan'
}) {
  const data = planDataOf(profile)
  const blocks = new Map()
  for (const block of list(blockStore?.blocks))
    blocks.set(block.id, { ...block, source: block.source ?? 'template' })
  for (const block of list(library))
    if (!blocks.has(block.id)) blocks.set(block.id, { ...block, source: 'library' })
  const recipes = new Map(list(pageRecipes?.recipes).map((r) => [r.pageType, r]))
  const { look, assumptions: lookAssumptions } = lookOf(template, brand)
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
  return {
    planId,
    language,
    data,
    blocks,
    recipes,
    look,
    assumptions: [...conflictAssumptionsOf(profile, data), ...lookAssumptions, ...languageAssumption]
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
 * @returns {Promise<{plan: object, attempts: Array<{problems: object[]}>, placed: object[], prompt: object}>}
 */
export async function composePlan(input) {
  if (typeof input?.model !== 'function')
    throw new PlanComposerError('model_missing', 'no build model was given')
  const context = composerContextOf(input)
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
        attempts,
        placed: gated.placed,
        prompt: { file: PLAN_COMPOSER_PROMPT_FILE, sha256: PROMPT_SHA256 }
      }
    problems = gated.problems
  }
  throw new PlanComposerError(
    'plan_gate_failed',
    `the composed plan failed the rules gate ${PLAN_COMPOSE_ATTEMPTS} times`,
    { problems, attempts }
  )
}

/**
 * The plan step after research: the needs profile and the brand step run in parallel, then the plan is composed.
 * @param {{research: object, model: Function, brandStep: () => Promise<object | null>} &
 *   Omit<Parameters<typeof composerContextOf>[0], 'profile' | 'brand'>} input `brandStep` runs the existing brand step
 *   and resolves to its record
 */
export async function buildPlanStep({ research, model, brandStep, ...rest }) {
  if (typeof brandStep !== 'function')
    throw new PlanComposerError('brand_step_missing', 'no brand step was given')
  // Started first and not awaited: the brand step runs while the needs profile is built.
  const brandRun = (async () => brandStep())().catch((error) => {
    throw new PlanComposerError('brand_step_failed', String(error?.message ?? error), { cause: error })
  })
  const [profile, brand] = await Promise.all([buildNeedsProfile({ research, model }), brandRun])
  const composed = await composePlan({ ...rest, profile, brand, model })
  return { profile, brand, ...composed }
}
