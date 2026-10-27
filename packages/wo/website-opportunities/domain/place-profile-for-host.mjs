import { DEMO_REQUEST_V2_LIMITS } from './demo-request.mjs'

const priceOf = (f) => f.value.variants?.some((v) => v.price?.raw)
/** Facts by priority, ties in profile order; the kept ones go back in profile order. */
function keep(facts, max, score) {
  if (facts.length <= max) return facts
  const chosen = new Set(
    facts
      .map((fact, index) => ({ fact, index, score: score(fact) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, max)
      .map((x) => x.fact)
  )
  return facts.filter((f) => chosen.has(f))
}

/**
 * The profile a builder may send in a v2 request: each collection cut to the request's limits, and coverage
 * `partial` for what was cut. Reviews go too, with their author, avatar, source and date.
 * Deterministic: the same profile always gives the same cut.
 */
export function placeProfileForHost(doc, limits = DEMO_REQUEST_V2_LIMITS) {
  const out = structuredClone(doc)
  const pictured = new Set(
    out.media.flatMap((m) =>
      m.value.restrictions?.includes('not-on-demo')
        ? []
        : m.value.relations.filter((r) => r.relation === 'depicts').map((r) => r.entityId)
    )
  )
  const scores = {
    offerings: (f) => (priceOf(f) ? 1 : 0) + (pictured.has(f.id) ? 1 : 0),
    people: () => 0,
    quotes: () => 0
  }
  const cut = []
  for (const key of ['offerings', 'people', 'quotes']) {
    const all = out[key].length
    out[key] = keep(out[key], limits[key], scores[key])
    if (out[key].length < all) cut.push([key, out[key].length, all])
  }

  // Drop what pointed at a removed fact, then evidence and sources nothing cites any more.
  const facts = new Set()
  const collect = (value) => {
    if (Array.isArray(value)) return value.forEach(collect)
    if (!value || typeof value !== 'object') return
    if (Object.hasOwn(value, 'value') && Object.hasOwn(value, 'evidenceRefs')) return facts.add(value.id)
    Object.values(value).forEach(collect)
  }
  const {
    evidence: _evidence,
    sources: _sources,
    coverage: _coverage,
    conflicts: _conflicts,
    ...content
  } = out
  collect(content)
  facts.add(out.business.id)
  for (const m of out.media) m.value.relations = m.value.relations.filter((r) => facts.has(r.entityId))
  out.conflicts = out.conflicts.filter((c) => {
    const target = /^(offerings|people|quotes)\.([^.]+)/.exec(c.target)
    return !target || facts.has(target[2])
  })
  const cited = new Set()
  const cite = (value) => {
    if (Array.isArray(value)) return value.forEach(cite)
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value))
      if (key === 'evidenceRefs' && Array.isArray(child)) child.forEach((id) => cited.add(id))
      else cite(child)
  }
  cite({ ...content, conflicts: out.conflicts })
  out.evidence = out.evidence.filter((e) => cited.has(e.id))
  const used = new Set([...out.evidence.map((e) => e.sourceId), ...out.coverage.flatMap((c) => c.sourceRefs)])
  out.sources = out.sources.filter((s) => used.has(s.id))

  for (const [target, kept, all] of cut) {
    const reason = `Cut to ${kept} of ${all} for the request's limit.`
    const row = out.coverage.find((c) => c.target === target)
    if (row) Object.assign(row, { status: 'partial', reason })
    else out.coverage.push({ target, status: 'partial', sourceRefs: [], reason })
  }
  return out
}
