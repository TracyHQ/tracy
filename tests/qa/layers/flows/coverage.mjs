// Coverage of the flows layer, per item and required tag, from the denominator, the manifests and
// (when there are any) the results of a run. Four numbers are kept apart and never merged into
// one percentage: obligations (item × tag), implemented (a case exists), executed (it reached a
// verdict other than not-run), proven (PASS with a red proof). N-A needs a reason and a source.

import { assertCommitted } from '../../lib/denominator.mjs'
import { readJson } from './util.mjs'

/**
 * @param {{ items: any[], unresolved: any[], complete?: boolean }} denominator
 * @param {any[]} manifests
 * @param {any[]} [results]
 */
export function computeCoverage(denominator, manifests, results = []) {
  const byId = new Map(results.map((r) => [r.id, r]))
  const casesFor = new Map()
  for (const m of manifests)
    for (const item of m.itemIds)
      for (const tag of m.edgeTags) {
        const k = `${item}|${tag}`
        if (!casesFor.has(k)) casesFor.set(k, [])
        casesFor.get(k).push(m.id)
      }
  const items = []
  const totals = {
    obligations: 0,
    na: 0,
    naWithoutReason: 0,
    implemented: 0,
    executed: 0,
    proven: 0,
    open: 0,
    PASS: 0,
    FAIL: 0,
    ENV: 0,
    PENDING: 0
  }
  for (const item of denominator.items) {
    const tags = {}
    // Required and N-A are disjoint in the shared contract; an N-A entry is a key into `naReasons`, and
    // the contract has already checked that every reason names its source.
    for (const [tag, key] of Object.entries(item.na)) {
      tags[tag] = { status: 'N-A', reason: denominator.naReasons[key] }
      totals.na += 1
    }
    for (const tag of item.requiredTags) {
      totals.obligations += 1
      const ids = casesFor.get(`${item.id}|${tag}`) ?? []
      if (!ids.length) {
        tags[tag] = { status: 'open', cases: [] }
        totals.open += 1
        continue
      }
      totals.implemented += 1
      const verdicts = ids.map((id) => byId.get(id)?.verdict ?? null)
      const executed = verdicts.some((v) => v === 'PASS' || v === 'FAIL')
      const proven = ids.some((id) => byId.get(id)?.verdict === 'PASS' && byId.get(id)?.redProof)
      if (executed) totals.executed += 1
      if (proven) totals.proven += 1
      for (const v of verdicts) if (v) totals[v] += 1
      tags[tag] = { status: proven ? 'proven' : executed ? 'executed' : 'implemented', cases: ids, verdicts }
    }
    items.push({ id: item.id, kind: item.kind, tags })
  }
  return {
    note: 'Not a percentage: obligations, implemented, executed and proven are different things (plan §3).',
    complete: false,
    incompleteBecause: denominator.details?.incompleteBecause ?? 'extraction is incomplete',
    unresolved: denominator.unresolved,
    totals,
    items
  }
}

export function loadDenominator(file) {
  const d = readJson(file)
  return assertCommitted(d, 'flows', file)
}
