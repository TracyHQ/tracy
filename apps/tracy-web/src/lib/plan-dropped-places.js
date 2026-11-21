// Where a plan's drops take a block or a slot off the site, read the same way by the write step's hide orders
// (write-step/hide-plan.js) and by the plan check's R27 (site-planner/plan-check/rules-cowork-hides.js), which must not
// import each other's domain: a block no kept page keeps or shows, and a slot whose stored field prints only on pages
// the plan drops. Pure.

const each = (value) => (Array.isArray(value) ? value : [])
const slashless = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')
const blocksOfPage = (page) => [...new Set(Object.values(page?.blocks ?? {}).flat())]
const MODULE = /^module-\d+$/

/** The kit's blocks the plan drops whole, as module keys: no kept page keeps or shows one. */
export function droppedBlocks(plan, kit) {
  const kitBlocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const kept = each(plan?.pages).filter((p) => p?.decision === 'keep')
  const shared = each(plan?.sharedBlocks)
  const decisions = [...shared, ...kept.flatMap((p) => each(p.blocks))]
  const hides = new Set(decisions.filter((d) => d?.decision === 'hide').map((d) => d.block))
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const dropped = new Map()
  for (const block of hides) {
    const module = kitBlocks.get(block)?.source?.entity
    if (!MODULE.test(String(module))) continue
    if (decisions.some((d) => d?.block === block && d.decision !== 'hide')) continue
    const sharedHide = shared.some((d) => d?.block === block)
    const shownOnKept = kept.some(
      (p) =>
        blocksOfPage(kitPages.get(p.id)).includes(block) && !each(p.blocks).some((d) => d?.block === block)
    )
    if (!sharedHide && shownOnKept) continue
    dropped.set(block, module)
  }
  return dropped
}

/**
 * Where a slot prints that a visitor still reaches: the kit's stored field of the slot names every page that printed it
 * (`drives`) and the block that lists it (`listedIn`). Null when the kit does not say, or when a kept page or a block that
 * stays prints it; otherwise the places that took it off the site with them.
 */
export function printedOnlyOnDropped(slot, { kit, plan, dropped }) {
  if (neverShown(kit, slot)) return { pages: [], unseen: true }
  const field = each(kit?.storedFields).find((f) => f?.slot === slot)
  const drives = each(field?.drives).filter((d) => typeof d?.page === 'string')
  if (!drives.length) return null
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const kept = each(plan?.pages)
    .filter((p) => p?.decision === 'keep' && kitPages.has(p.id))
    .map((p) => kitPages.get(p.id))
  const keptPaths = new Set(kept.map((p) => slashless(p.path)))
  if (drives.some((d) => keptPaths.has(slashless(String(d.page).split('?')[0])))) return null
  const list = field?.listedIn
  if (
    typeof list === 'string' &&
    list &&
    !dropped.has(list) &&
    kept.some((p) => blocksOfPage(p).includes(list))
  )
    return null
  const pages = [...new Set(drives.map((d) => d.page))]
  return { pages, ...(typeof list === 'string' && list ? { list } : {}) }
}

const NOT_SHOWN = 'the frame is not shown at any captured width'

/** A frame the kit read on no page at any width (its own error says so): it prints nowhere a visitor of a kept page looks. */
function neverShown(kit, slot) {
  const tail = `].frames[${slot}].width`
  return each(kit?.errors).some((e) => {
    const field = String(e?.field ?? '')
    return e?.reason === NOT_SHOWN && field.startsWith('blocks[') && field.endsWith(tail)
  })
}
