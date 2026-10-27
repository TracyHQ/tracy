// Coverage of a layer's denominator by its cases (and, when results exist, by what actually ran).
// Per item and required tag: covered by a case, N-A (reason and source), or open. Nothing is rounded up:
// an incomplete extraction keeps `complete: false`, and "implemented" never means "executed".
export function buildCoverage({ denominator, cases, results = null }) {
  const verdictOf = new Map((results ?? []).map((r) => [r.id, r]))
  const byItemTag = new Map()
  for (const c of cases)
    for (const item of c.itemIds)
      for (const tag of c.edgeTags) {
        const key = `${item}\u0000${tag}`
        const list = byItemTag.get(key) ?? []
        list.push(c.id)
        byItemTag.set(key, list)
      }
  const totals = {
    items: denominator.items.length,
    obligations: 0,
    na: 0,
    open: 0,
    implemented: 0,
    executed: 0,
    redProven: 0,
    pass: 0,
    fail: 0,
    env: 0,
    pending: 0
  }
  const items = []
  for (const item of denominator.items) {
    const tags = {}
    // Required and N-A are disjoint in the shared contract; an N-A entry is a key into `naReasons`.
    for (const [tag, key] of Object.entries(item.na)) {
      totals.obligations += 1
      tags[tag] = { status: 'na', reason: denominator.naReasons[key] }
      totals.na += 1
    }
    for (const tag of item.requiredTags) {
      totals.obligations += 1
      const ids = byItemTag.get(`${item.id}\u0000${tag}`) ?? []
      if (ids.length === 0) {
        tags[tag] = { status: 'open', cases: 0 }
        totals.open += 1
        continue
      }
      totals.implemented += 1
      if (!results) {
        tags[tag] = { status: 'implemented', cases: ids.length }
        continue
      }
      const verdicts = ids.map((id) => verdictOf.get(id)?.verdict ?? 'NOT_RUN')
      const count = (v) => verdicts.filter((x) => x === v).length
      const status = count('FAIL')
        ? 'fail'
        : count('PASS')
          ? 'pass'
          : verdicts.every((v) => v === 'NOT_RUN')
            ? 'not-run'
            : 'blocked'
      if (status === 'fail' || status === 'pass') totals.executed += 1
      if (status === 'pass') totals.pass += 1
      if (status === 'fail') totals.fail += 1
      if (ids.some((id) => verdictOf.get(id)?.redProof)) totals.redProven += 1
      tags[tag] = {
        status,
        cases: ids.length,
        PASS: count('PASS'),
        FAIL: count('FAIL'),
        ENV: count('ENV'),
        PENDING: count('PENDING')
      }
    }
    items.push({ id: item.id, kind: item.kind, tags })
  }
  if (results) {
    for (const r of results) {
      if (r.verdict === 'ENV') totals.env += 1
      if (r.verdict === 'PENDING') totals.pending += 1
    }
  }
  return {
    layer: denominator.layer ?? null,
    revision: denominator.revision,
    complete: denominator.unresolved.length === 0 && totals.open === 0,
    incompleteBecause: denominator.unresolved.map((u) => `${u.id}: ${u.reason}`),
    totals,
    items
  }
}
