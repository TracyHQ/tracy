// The template fixes a list measurement proposes: centering a sparse last row, one fix per row element (CSS
// selector). Only card rows of a block (`rowKind: slots`) whose minimum the fix would lower are proposed; a
// paginated listing (`rowKind: items`, a short last row is normal there) and pagination controls are left out
// and named in `skipped` with the reason, so a person can see what was not proposed.

const PAGINATION = /pagination|pager|page-item|page-link|page-numbers/i

/** Why a measured list with a fix is not proposed, or null when it is. */
export function skipReason(listId, m) {
  if (PAGINATION.test(`${m.fix.selector} ${m.rows?.shape ?? ''}`))
    return 'pagination control: its last row is a page number list, not content'
  if (m.rowKind !== 'slots')
    return `rowKind ${m.rowKind ?? 'unknown'}: a short last row is normal in a paginated listing`
  const now = m.min ?? Number.POSITIVE_INFINITY
  if (!(m.minIfCentered != null && m.minIfCentered < now))
    return `centering would not lower the minimum (${m.min ?? 'none'} -> ${m.minIfCentered ?? 'none'})`
  return null
}

/**
 * @param {Record<string, object>} minEvidence the list measurements (min-evidence.json)
 * @returns {{fixes: object[], skipped: {list: string, selector: string, reason: string}[]}}
 */
export function templateFixes(minEvidence) {
  const by = new Map()
  const skipped = []
  for (const [listId, m] of Object.entries(minEvidence)) {
    if (!m.fix) continue
    const reason = skipReason(listId, m)
    if (reason) {
      skipped.push({ list: listId, selector: m.fix.selector, reason })
      continue
    }
    const f = by.get(m.fix.selector) ?? {
      selector: m.fix.selector,
      display: m.fix.display,
      rule: m.fix.rule,
      verified: true,
      lists: [],
      unlocks: {},
      gap: { left: 0, right: 0 },
      evidence: []
    }
    f.lists.push(listId)
    f.verified &&= !!m.fix.verified
    f.unlocks[listId] = { min: m.min, minIfCentered: m.minIfCentered }
    for (const [count, byW] of Object.entries(m.centered ?? {}))
      for (const [width, c] of Object.entries(byW)) {
        f.gap.right = Math.max(f.gap.right, c.gap?.right ?? 0)
        f.evidence.push({
          list: listId,
          count: Number(count),
          width,
          gap: c.gap,
          ok: c.ok,
          before: m.images?.[count]?.[width],
          after: c.image
        })
      }
    by.set(m.fix.selector, f)
  }
  return { fixes: [...by.values()], skipped }
}

/** The proposed fixes of a template-fixes.json (an older file is a bare list). */
export const fixesOf = (file) => (Array.isArray(file) ? file : (file?.fixes ?? []))
