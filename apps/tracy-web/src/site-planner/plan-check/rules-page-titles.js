// R20: every kept page has a written title. Which slot is a page's title is the kit's measurement (`pages[].titleSlot`,
// or `titleCandidates` when the kit could not tell two fields apart), never the slot's role or list.
import { arr, has } from './rule-set.js'

export function checkR20({ R, kitPages, keptPageIds, keptDecisions, decisionParts }) {
  const r = R.r20
  const settled = [...kitPages.values()].some((p) => 'titleSlot' in p)
  if (!settled) {
    r.note('cannot check: this kit has no pages[].titleSlot (it was made before page titles were measured)')
    return
  }
  for (const pageId of keptPageIds) {
    const page = kitPages.get(pageId)
    if (!page) continue // R01 names an unknown page.
    const titles = [page.titleSlot, ...arr(page.titleCandidates)].filter(has)
    if (!titles.length) {
      r.note(`${pageId}: the kit names no title slot for this page, so nothing here checks it`)
      continue
    }
    const decisions = keptDecisions.filter((x) => x.page === pageId || x.page === null)
    const parts = decisions.map((x) => decisionParts(x.d))
    const hidden = new Set(parts.flatMap((p) => p.hidden.map((h) => h.slot)))
    const written = parts
      .flatMap((p) => p.copy)
      .some((c) => titles.includes(c.slot) && !hidden.has(c.slot) && (has(c.text) || has(c.says)))
    if (written) r.ok()
    else
      r.fail(
        pageId,
        `kept page ${pageId} has no written title: nothing writes ${titles.join(' or ')}, the slot the page prints as its title`,
        'page-title'
      )
  }
}
