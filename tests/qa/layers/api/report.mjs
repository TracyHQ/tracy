// Coverage and report rendering for the api layer. Counts are computed from the sources (denominator,
// plan, results); nothing is hard-coded, and "complete" is never claimed while a gap exists.

const VERDICTS = ['PASS', 'FAIL', 'ENV', 'PENDING']

export function countVerdicts(results) {
  const c = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const r of results) c[r.verdict] = (c[r.verdict] ?? 0) + 1
  return c
}

/** One verdict for a (door, tag) from its cases: any FAIL wins, then ENV, then PENDING, PASS only when every case passed. */
function rollUp(verdicts) {
  if (verdicts.length === 0) return null
  if (verdicts.includes('FAIL')) return 'FAIL'
  if (verdicts.includes('ENV')) return 'ENV'
  if (verdicts.includes('PENDING')) return 'PENDING'
  return 'PASS'
}

/**
 * @param {{ denominator: object, plan: object, results: object[], requestedIds: Set<string>, redProven: Set<string> }} input
 */
export function buildCoverage({ denominator, plan, results, requestedIds, redProven }) {
  const byId = new Map(results.map((r) => [r.id, r]))
  const groups = { public: emptyGroup(), 'internal-only': emptyGroup() }
  const items = []
  for (const item of plan.items) {
    const g = groups[item.membership]
    g.doors += 1
    const row = { id: item.id, membership: item.membership, tags: {} }
    for (const [tag, t] of Object.entries(item.tags)) {
      let entry
      if (t.status === 'na') {
        g.obligations.na += 1
        entry = { status: 'na', reason: t.reason }
      } else if (t.status === 'open') {
        g.obligations.open += 1
        entry = { status: 'open', reason: t.reason }
      } else {
        const ids = t.cases
        const known = ids.filter((id) => byId.has(id))
        const verdicts = known.map((id) => byId.get(id).verdict)
        const rolled = known.length === ids.length ? rollUp(verdicts) : 'NOT-RUN'
        entry = {
          status: t.status,
          cases: ids.length,
          ran: known.length,
          verdict: rolled,
          requested: ids.every((id) => requestedIds.has(id))
        }
        g.obligations.withCases += 1
        g.byVerdict[rolled] = (g.byVerdict[rolled] ?? 0) + 1
      }
      row.tags[tag] = entry
    }
    items.push(row)
  }
  for (const g of Object.values(groups)) {
    g.obligations.total = g.obligations.na + g.obligations.open + g.obligations.withCases
  }
  const caseTotals = {
    written: results.length,
    redProven: results.filter((r) => redProven.has(r.id)).length,
    verdicts: countVerdicts(results)
  }
  const unresolved = denominator.unresolved ?? []
  return {
    layer: 'api',
    revision: denominator.revision,
    note: 'public and internal-only are reported separately; the internal document contains every public door, so the two are never added',
    complete: false,
    completeReason:
      unresolved.length > 0
        ? `${unresolved.length} unresolved extraction entries`
        : 'obligations remain open or unproven (see per-tag status)',
    groups,
    cases: caseTotals,
    unresolved,
    items
  }
}

function emptyGroup() {
  return { doors: 0, obligations: { total: 0, na: 0, open: 0, withCases: 0 }, byVerdict: {} }
}

export function renderReport({ results, coverage, header, mutants, productFails }) {
  const counts = countVerdicts(results)
  const out = []
  out.push(`# api layer — ${header.when}`, '')
  out.push(
    `target: ${header.target} · cases requested: ${results.length} · red proof: ${header.proveRed ? 'run' : header.redFrom ? `reused from ${header.redFrom}` : 'not run'}`,
    ''
  )
  out.push(`PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING}`, '')
  out.push(`RED-proven cases: ${coverage.cases.redProven}`, '')
  out.push('## Doors (public and internal-only are separate; never add them)', '')
  for (const [name, g] of Object.entries(coverage.groups)) {
    out.push(
      `- ${name}: ${g.doors} doors · obligations ${g.obligations.total} (N-A ${g.obligations.na}, open ${g.obligations.open}, with cases ${g.obligations.withCases}) · with-cases verdicts ${JSON.stringify(g.byVerdict)}`
    )
  }
  out.push('', `Coverage is **incomplete**: ${coverage.completeReason}. No percentage is claimed.`, '')
  if (coverage.unresolved.length) {
    out.push('## Unresolved extraction', '')
    for (const u of coverage.unresolved) out.push(`- ${u.kind} \`${u.id ?? u.where}\`: ${u.reason}`)
    out.push('')
  }
  if (mutants?.length) {
    out.push('## Mutants (RED proof)', '')
    for (const m of mutants)
      out.push(
        `- ${m.id}: applied=${m.applied} booted=${m.booted} cases=${m.cases} red=${m.red} survived=${m.survived}${m.reason ? ` — ${m.reason}` : ''}`
      )
    out.push('')
  }
  if (productFails?.length) {
    out.push('## Product FAILs (grouped by cause)', '')
    for (const f of productFails) out.push(`- ${f.count}× ${f.reason} — e.g. \`${f.example}\``)
    out.push('')
  }
  const non = results.filter((r) => r.verdict !== 'PASS')
  out.push(`## Every non-PASS (${non.length})`, '')
  const grouped = new Map()
  for (const r of non) {
    const key = `${r.verdict}: ${String(r.reason).replace(/\d+/g, 'N').slice(0, 140)}`
    const g = grouped.get(key) ?? { n: 0, ids: [] }
    g.n += 1
    if (g.ids.length < 3) g.ids.push(r.id)
    grouped.set(key, g)
  }
  for (const [key, g] of [...grouped].sort((a, b) => b[1].n - a[1].n))
    out.push(`- ${g.n}× ${key} — e.g. ${g.ids.map((i) => `\`${i}\``).join(', ')}`)
  out.push('', 'Every individual reason is in results.json.', '')
  return `${out.join('\n')}\n`
}
