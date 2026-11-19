// A block a kit container holds is drawn only by its container (`placements.<id>.holds`, measured: the container draws
// every module of its position assigned to the page). A plan that places a held block without its container (#575: a
// plans page with its main block, block-167, and not the pricing container block-184) is repaired by bringing the
// container along, just before the first block it holds on that page. The container shows no data of its own (its
// words are the tab labels and the section heading, written as copy), so the plan card's content does not change.
// Pure: returns a new plan, and what it added.

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * @param {{pages: object[]}} plan the approved plan
 * @param {{placements?: Record<string, {holds?: {blocks?: string[]}}>} | null | undefined} mapping the kit mapping
 * @param {(id: string) => ({type?: string, source?: string} | undefined)} [blockOf] the block store's entry of a block
 * @returns {{plan: object, added: Array<{page: string, block: string, id: string, held: string[]}>}}
 */
export function withHeldContainers(plan, mapping, blockOf = () => undefined) {
  const added = []
  const containers = Object.entries(mapping?.placements ?? {}).filter(
    ([, p]) => list(p?.holds?.blocks).length
  )
  if (!containers.length) return { plan, added }
  const pages = list(plan.pages).map((page) => {
    let blocks = list(page.blocks)
    for (const [container, p] of containers) {
      if (blocks.some((b) => b.block === container)) continue
      const held = blocks.filter((b) => p.holds.blocks.includes(b.block))
      if (!held.length) continue
      const id = `${page.id}-holder-${container}`
      const entry = {
        id,
        type: blockOf(container)?.type ?? held[0].type,
        block: container,
        source: blockOf(container)?.source ?? 'template',
        label: held[0].label,
        data: [],
        reason: held[0].reason
      }
      const at = blocks.indexOf(held[0])
      blocks = [...blocks.slice(0, at), entry, ...blocks.slice(at)]
      added.push({ page: page.id, block: container, id, held: held.map((b) => b.id) })
    }
    return blocks === page.blocks ? page : { ...page, blocks }
  })
  return { plan: added.length ? { ...plan, pages } : plan, added }
}
