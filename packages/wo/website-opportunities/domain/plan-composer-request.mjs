// The request of one plan composer model call (#593, split out of `plan-composer.mjs` in #614): the locked prompt, the
// user message the code builds (the business, the blocks, the recipes; on the second attempt the gate's problems and
// the first plan as the gate read it), and the reading of the reply. The prompt file is never edited here.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { modelViewOf } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The draft prompt (product owner review: #600). Its hash is recorded with every plan it composed. */
export const PLAN_COMPOSER_PROMPT_FILE = 'plan-composer-prompt.md'
export const PLAN_COMPOSER_PROMPT = readFileSync(
  new URL(`./${PLAN_COMPOSER_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
export const PROMPT_SHA256 = createHash('sha256').update(PLAN_COMPOSER_PROMPT).digest('hex')

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
 * The request of one model call: the prompt, the business, the blocks and the recipes; on the second attempt the
 * problems to fix and `firstPlan`, the first reply as the gate read it, which every problem's place points into.
 */
export function planComposerRequest(context, problems = [], firstPlan = null) {
  const user = {
    business: modelViewOf(context.data),
    language: context.language,
    blocks: [...context.blocks.values()].map(modelBlockOf),
    recipes: [...context.recipes.values()].map(({ pageType, mainBlock, blocks }) => ({
      pageType,
      mainBlock,
      blocks
    })),
    ...(problems.length ? { problems: problems.map(({ at, message }) => ({ at, message })) } : {}),
    ...(problems.length && firstPlan ? { firstPlan } : {})
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
