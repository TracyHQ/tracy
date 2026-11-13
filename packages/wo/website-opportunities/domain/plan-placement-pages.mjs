// Where the rules gate may add a block (ticket #593): the page rules the model's plan is held to apply to what the gate
// places itself. A template block sits only on a page whose recipe lists it (its block order or one of its variants),
// never twice on one page; a Tracy library block is listed in no recipe and may join any page, once.

const list = (value) => (Array.isArray(value) ? value : [])

/** The blocks a recipe lists: its block order and every variant's. */
export const recipeBlocksOf = (recipe) =>
  new Set([...list(recipe?.blocks), ...list(recipe?.variants).flatMap((v) => list(v?.blocks))])

/** Whether `description` may sit on a page of `recipe`. */
export const fitsRecipe = (description, recipe) =>
  description.source === 'library' || recipeBlocksOf(recipe).has(description.id)

/** The kept page that may take a new `description` block, the home page first, or null. */
export function pageFor(pages, description, recipes) {
  const home = pages.find((p) => p.pageType === 'home') ?? pages[0]
  for (const page of [home, ...pages.filter((p) => p !== home)]) {
    if (!page || page.blocks.some((b) => b.block === description.id)) continue
    if (!recipes || fitsRecipe(description, recipes.get(page.pageType))) return page
  }
  return null
}

/**
 * Insert `block` into `page`: a template block at its place in the recipe's block order, a library block (or one the
 * recipe does not order) before the footer.
 */
export function insertBlock(page, block, recipe) {
  const order = list(recipe?.blocks)
  const at = order.indexOf(block.block)
  if (block.source !== 'library' && at !== -1) {
    const after = page.blocks.findIndex((b) => {
      const there = order.indexOf(b.block)
      return there > at
    })
    page.blocks.splice(after === -1 ? page.blocks.length : after, 0, block)
    return
  }
  const footer = page.blocks.findIndex((b) => b.type === 'footer')
  page.blocks.splice(footer === -1 ? page.blocks.length : footer, 0, block)
}

/** A new id for a block the gate adds to `page`; a revision's `tag` (`r<revision>`) keeps it off every earlier id. */
export function extraBlockId(page, tag) {
  const base = tag ? `${page.id}-${tag}-extra` : `${page.id}-extra`
  let n = page.blocks.length + 1
  while (page.blocks.some((b) => b.id === `${base}-${n}`)) n += 1
  return `${base}-${n}`
}
