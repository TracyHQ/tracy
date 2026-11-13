// Draft the page recipes of an AI quickstart from a template kit (ADR 0046, ticket #583). Pure. A kit page group
// gives a page type for its listing page and one for its item pages; a pager page (`?start=`) is its listing again.
//
// The author's block order is read at the widest width the kit measured: there every block sits in its layout
// position, while a phone layout may reorder blocks visually (JA Boxing moves its social icons above the footer
// links at 390 px). A block placed inside another (`positions: ["inside:<id>"]`) follows its container. Item pages
// of one type that differ (one demo page shows another related block) give the order most of them share; the
// others are kept as `variants`, so nothing the author composed is lost.
//
// Decision keys (`decisions.pageTypes[<group id>]`): `listing`, `item` (page type names), `mainBlock`,
// `itemMainBlock`, `skip` (a reason: the group gives no page type). `decisions.onEveryPage` lists blocks every page
// shows without the kit reading them in the page flow (a phone menu that slides in): each follows the page's first
// block.

const widest = (page) => {
  const widths = Object.keys(page.blocks ?? {}).sort((a, b) => Number(b) - Number(a))
  return page.blocks?.[widths[0]] ?? []
}

/** The store block order of a kit page; kit blocks the store left out are dropped. */
function orderOf(page, storeIdOf, nestedOf, everyPage = []) {
  const out = []
  for (const kitId of widest(page)) {
    const id = storeIdOf[kitId]
    if (!id || out.includes(id)) continue
    out.push(id, ...(nestedOf.get(id) ?? []).filter((n) => !out.includes(n)))
  }
  out.splice(1, 0, ...everyPage.filter((id) => !out.includes(id)))
  return out
}

/** The page's main block: its body, else its first block that is not shared by other pages. */
function mainBlockOf(page, storeIdOf, kitBlocks) {
  const kitIds = widest(page).filter((k) => storeIdOf[k])
  const body = kitIds.find((k) => kitBlocks.get(k)?.role === 'page-body')
  const own = kitIds.find((k) => {
    const b = kitBlocks.get(k)
    return b && !b.shared && !['header', 'footer', 'mobile-menu'].includes(b.role)
  })
  return storeIdOf[body ?? own ?? kitIds[0]]
}

function majority(orders) {
  const counts = new Map()
  for (const o of orders) counts.set(JSON.stringify(o), (counts.get(JSON.stringify(o)) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return ranked.map(([key, pages]) => ({ blocks: JSON.parse(key), pages }))
}

/**
 * @param {{kit: object, storeIdOf: Record<string, string>, blocks: object[], decisions?: object}} input
 * @returns {{recipes: object[], excluded: object[]}}
 */
export function draftRecipes({ kit, storeIdOf, blocks, decisions = {} }) {
  const nestedOf = new Map()
  for (const b of blocks) {
    const inside = (b.positions ?? []).find((p) => p.startsWith('inside:'))
    if (inside) nestedOf.set(inside.slice(7), [...(nestedOf.get(inside.slice(7)) ?? []), b.id])
  }
  const everyPage = decisions.onEveryPage ?? []
  const kitBlocks = new Map((kit.blocks ?? []).map((b) => [b.id, b]))
  const pages = (kit.pages ?? []).filter((p) => !String(p.path ?? '').includes('?start='))
  const recipes = []
  const excluded = []
  for (const group of kit.pageGroups ?? []) {
    const decision = decisions.pageTypes?.[group.id] ?? {}
    if (decision.skip) {
      excluded.push({ group: group.id, reason: decision.skip })
      continue
    }
    const slug = group.id.replace(/^group-/, '')
    const root = pages.find((p) => p.id === group.root)
    const items = pages.filter((p) => p.group === group.id && p.id !== group.root)
    if (root)
      recipes.push({
        pageType: decision.listing ?? slug,
        mainBlock: decision.mainBlock ?? mainBlockOf(root, storeIdOf, kitBlocks),
        blocks: orderOf(root, storeIdOf, nestedOf, everyPage),
        from: [root.id]
      })
    if (items.length === 0) continue
    const [first, ...others] = majority(items.map((p) => orderOf(p, storeIdOf, nestedOf, everyPage)))
    const sample = items.find(
      (p) => JSON.stringify(orderOf(p, storeIdOf, nestedOf, everyPage)) === JSON.stringify(first.blocks)
    )
    const recipe = {
      pageType: decision.item ?? `${slug}-item`,
      mainBlock: decision.itemMainBlock ?? mainBlockOf(sample, storeIdOf, kitBlocks),
      blocks: first.blocks,
      pages: first.pages
    }
    if (others.length) recipe.variants = others
    recipe.from = items.map((p) => p.id)
    recipes.push(recipe)
  }
  return { recipes, excluded }
}
