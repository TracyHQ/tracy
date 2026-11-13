// The pages of a gated plan as the composition gives them (`plan-gate.mjs`, #593), and the model's assumption lines
// the plan keeps.
import { heldTextsOf, namesHeld } from './plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The pages as the plan holds them, with ids, and each page's index in the composition. A block the model left with no
 * data is left out, as the gate's messages ask (`no_data` is never sent back); a page whose main block is missing or
 * empty is dropped with its reason. A first composition's ids follow the positions (`home`, `home-b2`). A revision
 * (`plan-request.mjs`) gives `givenIds`, per composition page `{page, blocks}` with `null` for what it adds, and
 * `idTag` (`r<revision>`): a page or block it keeps keeps its id, and a new one gets an id with the tag, so it never
 * takes an id this plan used before.
 */
export function pagesOf(composition, { recipes, blocks, givenIds, idTag }) {
  const pages = []
  const leftOut = []
  const ids = new Set(
    list(givenIds)
      .map((g) => g?.page)
      .filter(Boolean)
  )
  const index = new Map()
  for (const [i, page] of composition.pages.entries()) {
    const recipe = recipes.get(page.pageType)
    if (!page.blocks.some((b) => b.block === recipe.mainBlock && b.data.length > 0)) {
      leftOut.push({
        what: page.name,
        kind: 'page',
        reason: 'There was nothing to show in the main section of this page.'
      })
      continue
    }
    const given = givenIds?.[i]
    const base = given ? `${page.pageType}-${idTag}` : page.pageType
    let id = given?.page ?? base
    if (!given?.page) for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
    ids.add(id)
    index.set(id, i)
    const blockId = (j) =>
      given?.blocks?.[j] ?? (given?.page ? `${id}-${idTag}-b${j + 1}` : `${id}-b${j + 1}`)
    const kept = page.blocks.flatMap((b, j) => {
      const d = blocks.get(b.block)
      const block = { id: blockId(j), type: d.type, block: d.id, source: d.source ?? 'template' }
      return b.data.length ? [{ ...block, label: b.label, data: [...b.data], reason: b.reason }] : []
    })
    pages.push({ id, name: page.name, pageType: page.pageType, blocks: kept })
  }
  return { pages, leftOut, index }
}

/** Whether an assumption's field is on a page the plan keeps: one about a dropped page goes with the page. */
function onKeptPage(field, pages) {
  const page = /^pages\[([^\]]+)\]/.exec(field)?.[1]
  return page === undefined || pages.some((p) => p.id === page)
}

/**
 * The model's assumption lines the plan keeps: one about a dropped page goes with the page, and one naming a held person
 * or the held business name is dropped (#593 review G7), as the data naming them is.
 */
export function keptAssumptionsOf(composition, pages, context) {
  const held = heldTextsOf(context.profile?.withheld)
  return list(composition.assumptions)
    .map((a, i) => ({ id: `model-${i + 1}`, field: a.field, said: a.said }))
    .filter((a) => onKeptPage(a.field, pages) && !namesHeld([a.said], held))
}
