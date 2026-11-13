// The people of a business never disappear because a team block needs more of them (product owner decision D43, the
// locked planner rule P6). When the business has fewer people than a team block needs, the plan shows them in another
// block of the template that can hold that many, on a page whose recipe lists it. The gate's own placement already
// does so for people the plan shows nowhere (`plan-placement.mjs`: a block is used only when the people reach its
// `items.min`) and otherwise reports them as left out with the reason. This rule closes the other way out: the model
// leaving the people out while such a block exists (`person_dropped_block_fits`). People are never made up.
import { BLOCK_TYPES, GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { fitsRecipe } from './plan-placement-pages.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const showsPeople = (d) =>
  GROUP_KINDS_V3[BLOCK_TYPES[d?.type]?.itemKind]?.allowedKinds?.includes('person') ?? false

/**
 * The block and kept page with the most room for people, when the business has `count` of them: a template block that
 * shows people, whose minimum is at most `count`, on a page of the plan whose recipe lists it, not on that page yet or
 * there with room. Null when no block of the template can. `room` is how many it can show, at most `count`.
 * @returns {{block: string, page: string, room: number} | null}
 */
export function peopleBlockFor(count, composition, { blocks, recipes, data }) {
  let best = null
  for (const d of blocks.values()) {
    if ((d.source ?? 'template') !== 'template' || !showsPeople(d) || d.items.min > count) continue
    for (const page of composition.pages) {
      if (!fitsRecipe(d, recipes.get(page.pageType))) continue
      const there = page.blocks.find((b) => b.block === d.id)
      const people = list(there?.data).filter((id) => data.byId.get(id)?.kind === 'person').length
      const room = Math.min(d.items.max - people, count)
      if (room > 0 && room > (best?.room ?? 0)) best = { block: d.id, page: page.name, room }
    }
  }
  return best
}

/**
 * Report, once per plan, the model leaving out every person of the business while a block of the template can show
 * them. The message names the block with the most room and how many of the people it can show: the others are left
 * out with a reason, as the gate accepts.
 */
export function droppedPeopleProblems(composition, context, problem) {
  const { data } = context
  const people = data.items.filter((i) => i.kind === 'person' && !data.withheld?.has(i.id))
  if (people.length === 0) return
  const shown = new Set(composition.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  if (people.some((p) => shown.has(p.id))) return
  const at = list(composition.leftOut).findIndex((e) => people.some((p) => p.id === e?.item))
  const fit = at === -1 ? null : peopleBlockFor(people.length, composition, context)
  if (!fit) return
  const n = people.length
  problem(
    'person_dropped_block_fits',
    `leftOut[${at}].item`,
    `your people are left out while block ${fit.block} on page ${JSON.stringify(fit.page)} can show up to ${fit.room} of your ${n} ${n === 1 ? 'person' : 'people'}: show ${fit.room === n ? (n === 1 ? 'that person' : 'them') : `${fit.room} of them`} there${fit.room < n ? ' and leave the others out with a reason' : ''}; never leave people out because another team block needs more`
  )
}
