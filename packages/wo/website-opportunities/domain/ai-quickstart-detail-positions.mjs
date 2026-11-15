// The positions a template prints only on a page reached under its list page (`pages.<type>.under.detailPositions`
// of the mapping file). Pure. Called by `mappingProblems` (`ai-quickstart-mapping.mjs`) with the page recipes.
//
// `under.detailPositions: {positions: [<position>], assignTo: "list-page", why}`: the positions the layout of such a
// page prints (on T4 the `detail-article` sub layout, applied only when the page shown is not its menu item's own
// view) and how a copy placed there is assigned: to the list page's menu item, the Itemid of the address under it,
// so it prints on every article of the type under that list page. With `ownItem` (the article on a menu item of its
// own) the page prints none of these positions. The check:
//   - every `under` entry declares `detailPositions`, and nothing else does;
//   - a block whose positions are all detail positions is placed only on page types whose `under` prints one of
//     them (elsewhere it prints nothing);
// and `scripts/ai-quickstart/check-source-contract.mjs` fails a position the template does not have.

export const DETAIL_ASSIGN_TO = 'list-page'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])

/** The detail positions of a page type, or [] (a page that is no article reached under its list page). */
export const detailPositionsOf = (mapping, pageType) =>
  each(mapping?.pages?.[pageType]?.under?.detailPositions?.positions).filter(isName)

/** Every position some page type declares as a detail position. */
export const allDetailPositions = (mapping) =>
  new Set(Object.keys(mapping?.pages ?? {}).flatMap((t) => detailPositionsOf(mapping, t)))

/** The problems of the detail positions of a mapping file, against the block store and the page recipes. */
export function detailPositionProblems(mapping, blocks, { report, pageRecipes }) {
  for (const [type, page] of Object.entries(isObject(mapping.pages) ? mapping.pages : {})) {
    if (!isObject(page)) continue
    for (const key of ['menuItem', 'ownItem', 'unbuilt'])
      if (isObject(page[key]) && page[key].detailPositions !== undefined)
        report(
          `pages.${type}.${key}.detailPositions`,
          'only a page reached under its list page has detail positions'
        )
    if (!isObject(page.under)) continue
    const d = page.under.detailPositions
    const at = `pages.${type}.under.detailPositions`
    if (!isObject(d)) {
      report(
        at,
        'declare the positions this page prints only under its list page: {positions, assignTo, why}'
      )
      continue
    }
    if (!Array.isArray(d.positions) || !d.positions.every(isName))
      report(`${at}.positions`, 'positions is a list of template positions (may be empty)')
    if (d.assignTo !== DETAIL_ASSIGN_TO)
      report(
        `${at}.assignTo`,
        `a copy at a detail position is assigned to the list page: "${DETAIL_ASSIGN_TO}"`
      )
    if (!isName(d.why)) report(`${at}.why`, 'say how the detail positions were measured')
  }
  const detail = allDetailPositions(mapping)
  if (!detail.size) return
  const byId = new Map(blocks.map((b) => [b.id, b]))
  each(pageRecipes?.recipes).forEach((recipe, r) => {
    const own = new Set(detailPositionsOf(mapping, recipe?.pageType))
    each(recipe?.blocks).forEach((id, i) => {
      const positions = each(byId.get(id)?.positions).filter((p) => !String(p).startsWith('inside:'))
      if (!positions.length || !positions.every((p) => detail.has(p))) return
      if (!positions.some((p) => own.has(p)))
        report(
          `pages.${recipe.pageType}`,
          `the recipe (recipes[${r}].blocks[${i}]) places "${id}", which sits only in a detail position (${positions.join(', ')}) this page type does not print: it would print nothing`
        )
    })
  })
}
