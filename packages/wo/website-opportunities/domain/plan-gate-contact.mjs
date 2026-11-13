// Contact channels on the contact page (locked planner rule P13), for the rules gate. Every contact channel of the
// business (phone, email, address, booking link, social profile) goes on the contact page (the page whose recipe's main
// block is a `contact` block) while a block of that page has a free place for it. Places are counted per data kind per
// block (`factSlotsFor`): only a block that shows facts counts (a block that needs items, such as a reviews block of
// the Tracy library, is no place for a channel); its own fields, plus one place per item for an item field and one per
// row for a list field. A block every recipe lists (a header, a footer) is drawn on every page, so kept on any page it
// counts. A channel beyond the free places of the page is no problem: it is shown elsewhere, or placed, or left out
// with the reason by the gate's placement (`plan-placement-facts.mjs`), after `trimChannelOverflow` took off what a
// block holds beyond its places.
import { CONTACT_CHANNEL_KINDS, factSlotsFor } from './plan-placement-facts.mjs'
import { recipeBlocksOf } from './plan-placement-pages.mjs'

export { CONTACT_CHANNEL_KINDS, factSlotsFor }

/** The ids of `kind` a block shows within its places, in data order. */
const shownOf = (block, kind, { data, blocks }) =>
  block.data
    .filter((id) => data.byId.get(id)?.kind === kind)
    .slice(0, factSlotsFor(blocks.get(block.block), kind))

/**
 * Take off every channel fact a block holds beyond its places for that kind (a block with places for it), so the gate's placement finds it another
 * place or leaves it out with the reason; nothing is shown in a place that does not exist.
 */
export function trimChannelOverflow(pages, context) {
  for (const page of pages)
    for (const block of page.blocks) {
      // Only kinds the block has places for: a fact in a block with no place of its kind is another matter (open).
      const description = context.blocks.get(block.block)
      const kinds = CONTACT_CHANNEL_KINDS.filter((kind) => factSlotsFor(description, kind) > 0)
      const keep = new Set(kinds.flatMap((kind) => shownOf(block, kind, context)))
      block.data = block.data.filter((id) => !kinds.includes(context.data.byId.get(id)?.kind) || keep.has(id))
    }
  return pages
}

/** Report each channel missing from the contact page while a block of that page has a free place for it. */
export function contactChannelProblems(composition, context, problem) {
  const { data, blocks, recipes } = context
  const all = [...recipes.values()].map(recipeBlocksOf)
  const everyPage = new Set([...(all[0] ?? [])].filter((id) => all.every((set) => set.has(id))))
  const siteWide = composition.pages.flatMap((p) => p.blocks.filter((b) => everyPage.has(b.block)))
  const channels = data.facts.filter(
    (f) =>
      CONTACT_CHANNEL_KINDS.includes(f.kind) && !data.byId.get(f.id).itemField && !data.withheld?.has(f.id)
  )
  const library = [...blocks.values()].filter((b) => b.source === 'library').map((b) => b.id)
  composition.pages.forEach((page, i) => {
    const recipe = recipes.get(page.pageType)
    if (blocks.get(recipe?.mainBlock)?.type !== 'contact') return
    const kept = [...page.blocks, ...siteWide.filter((b) => !page.blocks.some((p) => p.block === b.block))]
    const unplaced = [...recipeBlocksOf(recipe), ...library].filter((id) => !kept.some((b) => b.block === id))
    for (const kind of CONTACT_CHANNEL_KINDS) {
      // A site-wide block is one block drawn on every page: what any page's copy of it shows counts.
      const shown = new Set([...page.blocks, ...siteWide].flatMap((b) => shownOf(b, kind, context)))
      const missing = channels.filter((f) => f.kind === kind && !shown.has(f.id))
      // Free places: kept blocks with room first, then blocks the page may hold that it does not hold yet.
      const free = [
        ...kept.map((b) => ({
          id: b.block,
          room: factSlotsFor(blocks.get(b.block), kind) - shownOf(b, kind, context).length
        })),
        ...unplaced.map((id) => ({ id, room: factSlotsFor(blocks.get(id), kind) }))
      ].flatMap(({ id, room }) => Array.from({ length: Math.max(room, 0) }, () => id))
      missing
        .slice(0, free.length)
        .forEach((fact, n) =>
          problem(
            'contact_channel_missing',
            `pages[${i}]`,
            `${JSON.stringify(fact.id)} (${fact.label}) is not on the contact page: block ${free[n]} of that page has a free place for it`
          )
        )
    }
  })
}
