// The names of a kit's blocks, for the plan composer (#575). The step chain's planner sees the template's demo site and
// recognises a block that shows how the trade works ("The workout", "Training route") by what it says; the composer
// never sees the demo (ADR 0046), so it reads the block's original name instead. The kit keeps it in its blank site
// contract (`blank-site-contract/content-map.json`): every stored place a block's field writes (`slot`, `slots`) is a
// slot of the content map, and each slot belongs to an entity of the template whose `identity.title` is the name the
// template gives that section. A block whose places belong to entities with exactly one non-empty title is named by it;
// any other block gets no name (no title, or places of several titled entities): nothing is guessed. Demo wording
// stays out: the name is the section's title, never a slot's sample text. Pure.

const list = (value) => (Array.isArray(value) ? value : [])

/** The stored places a block's fields write: `slot` and `slots` of its fields, item fields and child list fields. */
function placesOf(block) {
  const fields = [
    ...list(block?.fields),
    ...list(block?.itemFields),
    ...list(block?.lists).flatMap((l) => list(l?.fields))
  ]
  return fields.flatMap((f) => [f?.slot, ...list(f?.slots)]).filter((k) => typeof k === 'string')
}

/**
 * The original name of every block the content map names, by block id.
 * @param {{blocks?: object[]}} blockStore the kit's block store
 * @param {{slots?: object[], entities?: object[]} | null} contentMap the kit's blank site content map
 * @returns {Map<string, string>}
 */
export function blockNamesOf(blockStore, contentMap) {
  const entityOf = new Map(list(contentMap?.slots).map((s) => [s?.key, s?.entity]))
  const titleOf = new Map(
    list(contentMap?.entities)
      .filter((e) => typeof e?.identity?.title === 'string' && e.identity.title.trim() !== '')
      .map((e) => [e.key, e.identity.title.trim().replace(/\s+/g, ' ')])
  )
  const names = new Map()
  for (const block of list(blockStore?.blocks)) {
    const titles = new Set(
      placesOf(block)
        .map((key) => titleOf.get(entityOf.get(key)))
        .filter(Boolean)
    )
    if (titles.size === 1) names.set(block.id, [...titles][0])
  }
  return names
}

/** The block store with `name` on every block the content map names (`blockNamesOf`); the store given is unchanged. */
export function withBlockNames(blockStore, contentMap) {
  const names = blockNamesOf(blockStore, contentMap)
  if (names.size === 0) return blockStore
  return {
    ...blockStore,
    blocks: list(blockStore.blocks).map((b) => (names.has(b.id) ? { ...b, name: names.get(b.id) } : b))
  }
}
