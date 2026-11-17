// The end action of every page (#575, plan stage restore of the step chain's `pages[].endAction` and
// `site.primaryAction`, planner-prompt.md lines 27, 318 and 342): a visitor who reads a page to its end is led to the
// main action the owner chose. The step chain's planner wrote `endAction {intent, leadsTo}` per page; the build chat
// reads the template's form, so the end action is a block of the page:
//   1. the recipe's call to action block (type `call_to_action`, with a field for the main button's words): kept, or
//      added by code at its place in the recipe when the model left it out, never without the main button's words;
//   2. else the last kept block of the page before the footer, when it has a field for the main button's words.
// The block shows the main action's facts it has fields for; `endAction.factIds` names them all, so the writer and the
// write step know where the button leads. A page whose template has neither has no end action (true of the template,
// recorded by nothing). Every change is recorded through `fix`. Pure: pages in, new pages out.
import { extraBlockId, fitsRecipe, insertBlock } from './plan-placement-pages.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const LABEL_KIND = 'contact.cta_label'
const FRAME_TYPES = new Set(['header', 'footer'])
const fieldsOf = (d) => [...list(d?.fields), ...list(d?.itemFields)].filter((f) => f?.type !== 'design')
const hasKind = (d, kind) => fieldsOf(d).some((f) => f?.kind === kind)

/** The reason the owner reads for a call to action block code adds. */
export const END_ACTION_REASON = 'Visitors who read to the end of the page are led to your main button.'

/**
 * Give every page its end action block.
 * @param {object[]} pages the placed pages of the plan
 * @param {{data: object, blocks: Map<string, object>, recipes: Map<string, object>, primaryAction?: {factIds:
 *   string[]} | null, idTag?: string}} context
 * @param {(entry: object) => void} fix
 * @param {Map<string, number>} index plan page id to its composition index
 */
export function withEndActions(pages, { data, blocks, recipes, primaryAction, idTag }, fix, index) {
  const ids = list(primaryAction?.factIds).filter((id) => data.byId.has(id))
  if (ids.length === 0) return pages
  const kindOf = (id) => data.byId.get(id)?.kind
  if (!ids.some((id) => kindOf(id) === LABEL_KIND)) return pages
  const out = structuredClone(pages)
  for (const page of out) {
    const at = `pages[${index?.get(page.id) ?? page.id}]`
    const recipe = recipes.get(page.pageType)
    const cta = list(recipe?.blocks)
      .map((id) => blocks.get(id))
      .find((d) => d?.type === 'call_to_action' && hasKind(d, LABEL_KIND) && fitsRecipe(d, recipe))
    let block = cta ? page.blocks.find((b) => b.block === cta.id) : null
    if (cta && !block) {
      block = {
        id: extraBlockId(page, idTag),
        type: cta.type,
        block: cta.id,
        source: cta.source ?? 'template',
        label: 'Call to action',
        data: [],
        reason: END_ACTION_REASON
      }
      insertBlock(page, block, recipe)
      fix({
        code: 'end_action_added',
        at,
        rule: 'a page whose recipe has a call to action block ends with it, leading to the main button',
        was: null,
        now: cta.id
      })
    }
    if (!block) {
      const body = page.blocks.filter((b) => !FRAME_TYPES.has(blocks.get(b.block)?.type))
      const last = body.at(-1)
      if (last && last.block !== recipe?.mainBlock && hasKind(blocks.get(last.block), LABEL_KIND))
        block = last
    }
    if (!block) continue
    const description = blocks.get(block.block)
    for (const id of ids) {
      if (block.data.includes(id) || !hasKind(description, kindOf(id))) continue
      const used = block.data.filter((d) => kindOf(d) === kindOf(id)).length
      if (used >= fieldsOf(description).filter((f) => f.kind === kindOf(id)).length) continue
      block.data.push(id)
      fix({
        code: 'end_action_facts',
        at: `${at}.blocks[${block.id}].data`,
        rule: 'the end action block shows the main button it leads to',
        was: null,
        now: id
      })
    }
    page.endAction = { block: block.id, factIds: [...ids] }
  }
  return out
}

/** The end action of a page whose block a later rule took off the page goes with it. */
export function withoutLostEndActions(pages) {
  return pages.map((page) => {
    if (!page.endAction || page.blocks.some((b) => b.id === page.endAction.block)) return page
    const rest = { ...page }
    delete rest.endAction
    return rest
  })
}
