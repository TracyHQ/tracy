// What a person calls the rows of a list (ticket #584). Pure.
//
//   a child list:          {"name": "calendar", "label": "Class days", "items": ..., "itemsFrom": ..., "fields": ...}
//   a block's item list:   {"id": "class-cards", "itemsLabel": "Classes", "items": ..., "itemFields": ...}
//
// A label is a short English noun phrase in sentence case (a capital first letter, no closing full stop), at most
// LABEL_LIMIT characters: the words a form or an editor shows above the rows ("Class days", "Membership plans").
// Every child list carries `label`; every block with item fields carries `itemsLabel` (a block's `label` would read
// as the name of the block, not of its items).

export const LABEL_LIMIT = 40

/** The problem of a list label, or null. */
export function labelProblem(value) {
  if (typeof value !== 'string' || value.trim() === '')
    return 'name what a person calls the rows: a short noun phrase in sentence case'
  if (value !== value.trim() || /\s{2}/.test(value)) return 'a label has no leading, closing or double spaces'
  if (value.length > LABEL_LIMIT) return `a label is at most ${LABEL_LIMIT} characters`
  if (!/^[A-Z]/.test(value)) return 'a label starts with a capital letter (sentence case)'
  if (/[.:;!?]$/.test(value)) return 'a label is a noun phrase, with no closing punctuation'
  return null
}

/** Every list label of a block: its `itemsLabel` and the `label` of each child list, with where it sits. */
function labelsOf(block) {
  const out = []
  if (typeof block.itemsLabel === 'string')
    out.push({ at: `blocks[${block.id}].itemsLabel`, label: block.itemsLabel })
  const walk = (lists, key, above) =>
    (Array.isArray(lists) ? lists : []).forEach((l) => {
      const at = `${above}.${key}[${l?.name}]`
      if (typeof l?.label === 'string') out.push({ at: `${at}.label`, label: l.label })
      walk(l?.lists, 'lists', at)
    })
  walk(block.lists, 'lists', `blocks[${block.id}]`)
  walk(block.itemLists, 'itemLists', `blocks[${block.id}]`)
  return out
}

/**
 * No two lists one page shows carry the same label (#584): an editor or a form showing the rows of one page by their
 * labels could not tell them apart ("Social links" for a trainer's links and the business's own). A page is a page
 * type of the recipes, with every block of its recipe and of its variants.
 */
export function pageLabelProblems(blockStore, pageRecipes, report) {
  const blocks = new Map(
    (Array.isArray(blockStore?.blocks) ? blockStore.blocks : [])
      .filter((b) => b && typeof b.id === 'string')
      .map((b) => [b.id, b])
  )
  const seen = new Set()
  for (const recipe of Array.isArray(pageRecipes?.recipes) ? pageRecipes.recipes : []) {
    const ids = new Set([
      ...(recipe?.blocks ?? []),
      ...(recipe?.variants ?? []).flatMap((v) => v?.blocks ?? [])
    ])
    const byLabel = new Map()
    for (const id of ids)
      for (const l of labelsOf(blocks.get(id) ?? {})) {
        const key = l.label.toLowerCase()
        byLabel.set(key, [...(byLabel.get(key) ?? []), l])
      }
    for (const [, same] of byLabel) {
      if (same.length < 2) continue
      const where = same.map((l) => l.at)
      const once = where.join(' ')
      if (seen.has(once)) continue
      seen.add(once)
      report(
        where[1],
        `"${same[1].label}" is also the label of ${where.filter((_, i) => i !== 1).join(', ')} on the ${recipe.pageType} page: one page's lists carry distinct labels`
      )
    }
  }
}
