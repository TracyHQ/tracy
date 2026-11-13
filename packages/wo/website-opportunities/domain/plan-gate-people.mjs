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
 * The first block and kept page that can show `count` people: a template block that shows people, whose minimum is
 * at most `count`, on a page of the plan whose recipe lists it, not on that page yet or there with room. Null when no
 * block of the template can.
 * @returns {{block: string, page: string} | null}
 */
export function peopleBlockFor(count, composition, { blocks, recipes, data }) {
  for (const d of blocks.values()) {
    if ((d.source ?? 'template') !== 'template' || !showsPeople(d) || d.items.min > count) continue
    for (const page of composition.pages) {
      if (!fitsRecipe(d, recipes.get(page.pageType))) continue
      const there = page.blocks.find((b) => b.block === d.id)
      const people = list(there?.data).filter((id) => data.byId.get(id)?.kind === 'person').length
      if (!there || people < d.items.max) return { block: d.id, page: page.name }
    }
  }
  return null
}

/** Report the model leaving out every person of the business while a block of the template can show them. */
export function droppedPeopleProblems(composition, context, problem) {
  const { data } = context
  const people = data.items.filter((i) => i.kind === 'person' && !data.withheld?.has(i.id))
  if (people.length === 0) return
  const shown = new Set(composition.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  if (people.some((p) => shown.has(p.id))) return
  const fit = peopleBlockFor(people.length, composition, context)
  if (!fit) return
  list(composition.leftOut).forEach((entry, i) => {
    if (data.byId.get(entry?.item)?.kind !== 'person' || data.withheld?.has(entry.item)) return
    problem(
      'person_dropped_block_fits',
      `leftOut[${i}].item`,
      `${JSON.stringify(entry.item)} is left out while block ${fit.block} can show ${people.length} ${people.length === 1 ? 'person' : 'people'} on page ${JSON.stringify(fit.page)}: show the people there, never leave them out because another team block needs more`
    )
  })
}
