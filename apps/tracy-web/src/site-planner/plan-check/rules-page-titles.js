// R20 follows the kit's measured title and the same exact slot ownership as R01/R07. Brand-owned title slots
// remain the brand step's responsibility; an undeclared title is a kit gap, never permission to invent a write.
import { arr, has, obj } from './rule-set.js'

export function checkR20({
  R,
  kit,
  kitPages,
  blockIx,
  keptPageIds,
  keptDecisions,
  decisionParts,
  unwritable
}) {
  const r = R.r20
  const names = arr(obj(kit.site).nameSlots).filter((name) => name?.kind === 'slot' && has(name.id))
  const settled = [...kitPages.values()].some((p) => 'titleSlot' in p)
  if (!settled) {
    r.note('cannot check: this kit has no pages[].titleSlot (it was made before page titles were measured)')
    return
  }
  for (const pageId of keptPageIds) {
    const page = kitPages.get(pageId)
    if (!page) continue
    const titles = [page.titleSlot, ...arr(page.titleCandidates)].filter(has)
    if (!titles.length) {
      r.note(`${pageId}: the kit names no title slot for this page, so nothing here checks it`)
      continue
    }
    const shown = new Set(Object.values(page.blocks ?? {}).flat())
    const ownersOf = (slot) =>
      [...blockIx]
        .filter(([block, index]) => shown.has(block) && index.slots.has(slot))
        .map(([block]) => block)
    const writable = titles.filter((slot) => !unwritable.has(slot) && ownersOf(slot).length)
    if (!writable.length) {
      r.fail(
        pageId,
        `the measured title ${titles.join(' or ')} has no writable slot declared in this page's kit blocks; correct the kit's title declaration and measured native mapping before planning a write`,
        'kit'
      )
      continue
    }
    const decisions = keptDecisions.filter(
      (x) => shown.has(x.d.block) && (x.page === pageId || x.page === null)
    )
    const parts = decisions.map((x) => ({ block: x.d.block, ...decisionParts(x.d) }))
    const hidden = new Set(parts.flatMap((p) => p.hidden.map((h) => h.slot)))
    const written = parts.some((part) =>
      part.copy.some(
        (c) =>
          writable.includes(c.slot) &&
          ownersOf(c.slot).includes(part.block) &&
          !hidden.has(c.slot) &&
          (has(c.text) || has(c.says))
      )
    )
    if (written) {
      r.ok()
      continue
    }
    const delegated = names.find(
      (name) =>
        writable.includes(name.id) &&
        !hidden.has(name.id) &&
        decisions.some(
          (x) => ownersOf(name.id).includes(x.d.block) && (!has(name.block) || name.block === x.d.block)
        )
    )
    if (delegated) {
      r.ok()
      r.note(
        `${pageId}: the brand step owns title slot ${delegated.id}; its final write and rendered read-back still require verification`
      )
      continue
    }
    r.fail(
      pageId,
      `kept page ${pageId} has no written title: nothing writes ${writable.join(' or ')}, the slot the page prints as its title`,
      'page-title'
    )
  }
}
