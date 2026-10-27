// Coverage of the infra denominator by the case manifests, never rolled into one percentage:
// every (item, required tag) is `covered` (a case names that item and tag), `na` (declared with a
// reason and a source) or `open`. "Covered" means a case is written; verdicts are counted apart.
export function coverage(denominator, manifests, results = []) {
  const verdictOf = new Map(results.map((r) => [r.id, r.verdict]))
  const byItem = new Map()
  for (const m of manifests) {
    for (const item of m.itemIds) {
      const tags = byItem.get(item) ?? new Map()
      for (const tag of m.edgeTags) tags.set(tag, [...(tags.get(tag) ?? []), m.id])
      byItem.set(item, tags)
    }
  }
  const rows = []
  const total = {
    items: denominator.items.length,
    obligations: 0,
    covered: 0,
    na: 0,
    open: 0,
    passing: 0,
    failing: 0
  }
  for (const item of denominator.items) {
    const tags = byItem.get(item.id) ?? new Map()
    // Required and N-A are disjoint in the shared contract: every tag of the item is one obligation.
    for (const tag of [...item.requiredTags, ...Object.keys(item.na)]) {
      total.obligations += 1
      if (item.na[tag] !== undefined) {
        total.na += 1
        rows.push({ item: item.id, tag, status: 'na', reason: denominator.naReasons[item.na[tag]] })
      } else if (tags.has(tag)) {
        total.covered += 1
        const verdicts = tags.get(tag).map((id) => verdictOf.get(id))
        if (verdicts.includes('PASS')) total.passing += 1
        if (verdicts.includes('FAIL')) total.failing += 1
        rows.push({ item: item.id, tag, status: 'covered', cases: tags.get(tag) })
      } else {
        total.open += 1
        rows.push({ item: item.id, tag, status: 'open' })
      }
    }
  }
  const knownItems = new Set(denominator.items.map((i) => i.id))
  const unknownItems = [...byItem.keys()].filter((id) => !knownItems.has(id)).sort()
  return { total, rows, unknownItems }
}

export function summaryLines(denominator, cov) {
  const t = cov.total
  const lines = [
    '## Coverage (never one number: items, obligations and verdicts are counted apart)',
    '',
    `- denominator items: ${t.items}; extraction: ${denominator.details.extraction}; unresolved sources: ${denominator.unresolved.length}`,
    `- required obligations (item × tag): ${t.obligations}; with a case written: ${t.covered}; declared N-A (reason + source): ${t.na}; open: ${t.open}`,
    `- of the covered obligations: ${t.passing} have a PASS case, ${t.failing} have a FAIL case`
  ]
  if (cov.unknownItems.length)
    lines.push(`- cases naming items not in the denominator: ${cov.unknownItems.join(', ')}`)
  if (denominator.details.extraction !== 'complete')
    lines.push('- extraction is INCOMPLETE: do not read these numbers as the whole infrastructure')
  lines.push('')
  return lines
}
