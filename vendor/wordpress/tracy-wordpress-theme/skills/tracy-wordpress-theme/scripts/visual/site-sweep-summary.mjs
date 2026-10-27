// site-sweep-summary.mjs — the one file to open after a sweep: per check the groups (most cells first), with their examples,
// accept row, baseline state and evidence, and the not-measured causes once with counts. Pure: report (+ baseline groups) in,
// summary object and its Markdown out. summary.json is the object, summary.md its rendering.
//
// A report with a history (site-sweep-scope.mjs) says what kind of run it is: `run` (full with its reason, or scoped with its scope). In a scoped
// re-run a check that was not measured has the verdict `carried`, a group that was not measured the status `carried` with the run that measured it,
// a measured check with nothing open `pass in scope`, and a group open in the earlier run and clean on every cell measured again is in `fixedSinceLast`.
//
// SIZE. Examples are capped at three per group; a report whose rendering would pass MAX_LINES lines shows fewer examples
// (one, then none) — a group is never dropped.

export const SUMMARY_SCHEMA = 'tracy-site-sweep-summary/v1'
export const MAX_LINES = 300
const LEVELS = [3, 1, 0]
const CLIP = 90

const clip = (s, n = CLIP) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const val = (v) => clip(v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const cellsOf = (g) => g.cells ?? g.occurrences

const exampleOf = (d) => ({
  route: d.route,
  width: d.width ?? null,
  scheme: d.scheme ?? d.state ?? null,
  source: val(d.source),
  port: val(d.port),
  ...(d.delta != null ? { delta: d.delta } : {}),
  ...(d.text ? { text: clip(String(d.text), 40) } : {})
})

/** Up to three rows on distinct routes (then any), as examples. */
function pickExamples(rows) {
  const out = []
  for (const d of rows) if (out.length < 3 && !out.some((e) => e.route === d.route)) out.push(d)
  for (const d of rows) if (out.length < 3 && !out.includes(d)) out.push(d)
  return out.map(exampleOf)
}

function stateOf(baseline, id, key) {
  if (!baseline) return null
  const known = baseline.groups?.[id]
  if (!known) return 'unknown'
  return known.includes(key) ? 'unchanged' : 'new'
}

function verdictOf(c) {
  if (c.carried) return 'carried'
  if (c.status === 'not-applicable') return 'not-applicable'
  if (c.pass) return c.scoped ? 'pass in scope' : 'pass'
  if (c.defects > 0 || c.acceptErrors > 0 || c.intermittent > 0) return 'fail'
  return 'not-measured'
}

/** The not-measured causes of the whole run, each once: { cause, count, checks, why, example }. */
function notMeasuredCauses(report) {
  const by = new Map()
  const add = (cause, check, count, why, example) => {
    const x = by.get(cause) ?? { cause, count: 0, checks: [], why: why ?? '', example: example ?? '' }
    x.count += count
    if (!x.checks.includes(check)) x.checks.push(check)
    by.set(cause, x)
  }
  for (const c of report.checks) {
    // a cause every case of which was measured in an earlier run is named as carried
    for (const [cause, x] of Object.entries(c.notMeasuredCauses ?? {})) add(x.carriedFrom ? `carried: ${cause}` : cause, c.id, x.pages, x.carriedFrom ? `not measured in the run of ${x.carriedFrom} and not measured in this run: ${x.why}` : x.why, x.example)
    for (const [cause, x] of Object.entries(c.behaviourCauses ?? {})) add(x.carriedFrom ? `carried: ${cause}` : cause, c.id, x.cases, x.carriedFrom ? `not measured in the run of ${x.carriedFrom} and not measured in this run: ${x.why}` : x.why, x.example)
    for (const u of c.statesUnavailable ?? []) add(`state-unavailable: ${u.state}`, c.id, u.routes, u.reason, '')
  }
  const heights = new Map()
  for (const n of report.notMeasured?.heights ?? []) {
    const x = heights.get(n.cause) ?? { count: 0, why: n.why, example: `${n.route} @${n.width}: ${n.detail}` }
    x.count++
    heights.set(n.cause, x)
  }
  for (const [cause, x] of heights) add(cause, 'heights', x.count, x.why, x.example)
  const owed = new Map()
  for (const o of report.owed ?? []) {
    const reason = String(o.reason ?? '').split('\n')[0]
    const x = owed.get(reason) ?? { count: 0, checks: new Set(), example: `${o.route}${o.width != null ? ` @${o.width}` : ''}` }
    x.count++
    if (o.check) x.checks.add(o.check)
    owed.set(reason, x)
  }
  for (const [reason, x] of owed) {
    const cause = `owed: ${clip(reason, 120)}`
    const checks = x.checks.size ? [...x.checks] : ['(route)']
    for (const k of checks) add(cause, k, k === checks[0] ? x.count : 0, reason, x.example)
  }
  return [...by.values()].sort((a, b) => b.count - a.count)
}

/**
 * The summary of a finished sweep report. `baseline` is readBaseline's result (`groups` per check, or null when the earlier output
 * has none), or null without --baseline. `examples` is the cap per group (3, 1 or 0).
 */
export function buildSummary(report, { baseline = null, examples = 3 } = {}) {
  const accepted = report.accepted ?? []
  const checks = report.checks.map((c) => {
    const defectGroups = (report.groups?.[c.id] ?? []).map((g, i) => ({ g, i }))
    const rowsOf = (cause) => (report.defects?.[c.id] ?? []).filter((d) => (d.cause ?? `${d.what}|${d.culprit ?? ''}`) === cause)
    const groups = defectGroups.map(({ g, i }) => {
      const rows = rowsOf(g.cause)
      return {
        key: g.cause,
        kind: g.what,
        status: 'defect',
        routes: g.routes.length,
        widths: g.widths,
        schemes: g.schemes,
        cells: g.occurrences,
        examples: pickExamples(rows).slice(0, examples),
        accept: null,
        baseline: stateOf(baseline, c.id, g.cause),
        evidence: `site-sweep.json#groups.${c.id}[${i}]`
      }
    })
    for (const a of accepted.filter((x) => x.check === c.id)) {
      const rows = (report.notDefectCases ?? []).filter((d) => d.check === c.id && d.accepted && d.acceptCause === a.cause)
      groups.push({
        key: a.cause,
        kind: a.kind,
        status: 'accepted',
        routes: a.routes.length,
        widths: a.widths,
        schemes: a.schemes,
        cells: a.occurrences,
        examples: (rows.length ? pickExamples(rows) : a.example ? [exampleOf(a.example)] : []).slice(0, examples),
        accept: { matched: true, decision: a.decision ?? null, ...(a.notCovered ? { notCovered: a.notCovered } : {}) },
        baseline: stateOf(baseline, c.id, a.cause),
        evidence: a.evidence ?? null,
        ...(a.measured && a.measured.ranAt !== report.ranAt ? { carriedFrom: a.measured.ranAt } : {})
      })
    }
    const kept = report.carried?.[c.id]
    for (const g of defectGroups) if (g.g.carriedCells) Object.assign(groups.find((x) => x.status === 'defect' && x.key === g.g.cause), { carriedCells: g.g.carriedCells, carriedCellsFrom: g.g.carriedFrom })
    for (const g of kept?.open ?? [])
      groups.push({ key: g.cause, kind: g.what, status: 'carried', routes: g.routes.length, widths: g.widths, schemes: g.schemes, cells: g.occurrences, examples: g.examples.filter((e) => g.cells.some((x) => x[0] === e.route && x[1] === e.width && x[2] === e.scheme)).slice(0, examples), accept: null, baseline: stateOf(baseline, c.id, g.cause), evidence: `${g.measured.out}/${g.evidence}`, carriedFrom: g.measured.ranAt, ...(g.parts?.length > 1 ? { carriedCellsFrom: g.parts } : {}) })
    // confirmed in an earlier run, absent since, not yet absent long enough to be fixed: counted, failing, measured again
    for (const g of report.intermittent?.[c.id] ?? [])
      groups.push({ key: g.cause, kind: g.what, status: 'intermittent', routes: g.routes.length, widths: [], schemes: [], cells: g.cells, examples: [], accept: null, baseline: stateOf(baseline, c.id, g.cause), evidence: `${g.lastSeen.out}/${g.evidence}`, absent: g.absent, needs: g.needs, lastSeen: g.lastSeen.ranAt })
    groups.sort((a, b) => b.cells - a.cells || b.routes - a.routes)
    const present = new Set(groups.map((g) => g.key))
    const fixed = baseline?.groups?.[c.id] ? baseline.groups[c.id].filter((k) => !present.has(k)) : []
    return { id: c.id, verdict: verdictOf(c), groups: c.defects, accepted: c.accepted ?? 0, cases: c.cases, notMeasured: c.notMeasured, groupList: groups, intermittent: c.intermittent ?? 0, fixed, fixedSinceLast: report.fixed?.[c.id] ?? [], ...(c.notApplicable ? { comparisonNotApplicable: c.notApplicable } : {}), ...(c.target ? { target: c.target } : {}), ...(c.carried ? { carriedFrom: c.carriedFrom.ranAt } : {}) }
  })
  return {
    schema: SUMMARY_SCHEMA,
    site: report.site,
    source: report.source,
    ranAt: report.ranAt,
    exit: report.exit,
    run: report.run ?? null,
    routes: { measured: report.routesMeasured, total: report.routesTotal },
    widths: report.widths,
    schemes: report.schemes,
    baseline: baseline ? { version: baseline.version, groups: baseline.groups ? 'compared' : 'not in the baseline (check results only)' } : null,
    examplesPerGroup: examples,
    checks,
    ...(report.applicability ? { applicability: report.applicability } : {}),
    notMeasured: notMeasuredCauses(report),
    notOwed: notOwedOf(report),
    acceptErrors: (report.acceptErrors ?? []).map((e) => (e.measured && e.measured.ranAt !== report.ranAt ? `carried from the run of ${e.measured.ranAt}: ${e.message}` : e.message))
  }
}

/** The cells closed without being read, once per reason, with the checks and the count (the dark of a source with no dark of its own). */
function notOwedOf(report) {
  const by = new Map()
  for (const o of report.notOwed ?? []) {
    const x = by.get(o.reason) ?? { reason: o.reason, cells: 0, checks: new Set(), routes: new Set() }
    x.cells++
    for (const c of o.checks ?? (o.check ? [o.check] : [])) x.checks.add(c)
    x.routes.add(o.route)
    by.set(o.reason, x)
  }
  return [...by.values()].map((x) => ({ reason: x.reason, cells: x.cells, checks: [...x.checks], routes: x.routes.size }))
}

const span = (g) => `${g.routes} route(s) × ${g.widths.length ? `${g.widths.length} width(s) (${g.widths.join('/')})` : '1'}${g.schemes.length ? ` × ${g.schemes.join('/')}` : ''}, ${g.cells} cell(s)`

/** What kind of run it was: full with its reason, or scoped with the scope it measured and the runs it stands on. */
function runLine(run) {
  if (run.mode === 'full') return `Full run${run.reason ? ` — reason: ${run.reason}` : run.previous ? '' : ' (the first of this site, source and dossier)'}.`
  const x = run.scope
  const scope = x.checks.length ? `checks ${x.checks.join(', ')}; ${x.routes.length} route(s) (${clip(x.routes.join(', '), 160)}); widths ${x.widths.join(', ') || '—'}${x.heightsWidths.length ? `; heights widths ${x.heightsWidths.join(', ')}` : ''}; schemes ${x.schemes.join(', ')}` : 'nothing was unresolved, nothing was measured'
  return `**Scoped re-run**${run.fullWithoutReason ? ' (`--full` without `--reason` narrows)' : ''}: ${scope}. The rest is carried from the run of ${run.previous.ranAt} (\`${run.previous.out}\`), on the full run of ${run.full.ranAt}${run.full.reason ? ` (${run.full.reason})` : ''}; carried is not measured and is not a pass. A full run needs \`--full --reason "<text>"\`.`
}

/** The Markdown of a summary object. */
export function renderSummary(s) {
  const L = [`# Sweep summary — ${s.site} against ${s.source}`, '']
  L.push(`Ran ${s.ranAt}; exit ${s.exit}; ${s.routes.measured}/${s.routes.total} route(s) measured; widths ${s.widths.join(', ')}; schemes ${s.schemes.join(', ')}.${s.baseline ? ` Baseline ${s.baseline.version}${s.baseline.groups === 'compared' ? '' : ' (check results only: groups are not compared)'}.` : ''}`, '')
  if (s.run) L.push(runLine(s.run), '')
  if (s.applicability) {
    const families = s.applicability.comparisonFamilies ?? s.checks.filter((c) => c.comparisonNotApplicable > 0).length
    const pure = s.checks.filter((c) => c.verdict === 'not-applicable').length
    L.push(`${s.applicability.targetChecks?.passed ?? 0} target checks passed; ${pure} checks not-applicable; ${families} comparison families not-applicable.`, '')
  }
  L.push('| check | verdict | groups | accepted | cases | not measured |', '|---|---|---:|---:|---:|---:|')
  for (const c of s.checks) L.push(`| ${c.id} | ${c.verdict} | ${c.groups} | ${c.accepted} | ${c.cases} | ${c.notMeasured} |`)
  L.push('')
  for (const c of s.checks) {
    L.push(`## ${c.id} — ${c.verdict}`, '')
    if (c.verdict === 'carried') L.push(`Not measured in this run: carried from the run of ${c.carriedFrom}.`, '')
    else if (!c.groupList.length && !c.fixed.length && !c.fixedSinceLast.length) L.push(`No group in ${c.cases} case(s)${s.run?.mode === 'scoped' ? ' measured in this run' : ''}.`, '')
    for (const g of c.groupList) {
      const tags = [g.status === 'accepted' ? `accepted: ${g.accept.decision ?? g.kind}${g.accept.notCovered ? `, ${g.accept.notCovered} more row(s) stay defects` : ''}` : g.status === 'carried' ? 'CARRIED DEFECT' : g.status === 'intermittent' ? `INTERMITTENT: confirmed (last seen ${g.lastSeen}), absent from ${g.absent} of ${g.needs} consecutive covering run(s) needed to count as fixed; fails the check until then` : 'DEFECT', g.carriedFrom ? `carried from the run of ${g.carriedFrom}${g.status === 'carried' && g.carriedCellsFrom ? ` (its cells come from the runs of ${g.carriedCellsFrom.map((x) => `${x.ranAt}: ${x.cells}`).join(', ')})` : ''}, not measured in this run` : null, g.carriedCells ? `${g.carriedCells} of its cell(s) carried, not measured in this run${g.carriedCellsFrom?.length ? ` (from the run of ${g.carriedCellsFrom.map((x) => x.ranAt).join(', ')})` : ''}` : null, g.baseline ? `baseline ${g.baseline}` : null].filter(Boolean)
      L.push(`- \`${clip(g.key, 140)}\` — ${g.kind}; ${span(g)}; ${tags.join('; ')}; evidence ${g.evidence ?? '—'}`)
      for (const e of g.examples) L.push(`  - ${e.route}${e.width != null ? ` @${e.width}` : ''}${e.scheme ? ` ${e.scheme}` : ''}: source ${e.source} → port ${e.port}${e.delta != null ? ` (${e.delta} px)` : ''}`)
    }
    for (const k of c.fixed) L.push(`- \`${clip(k, 140)}\` — fixed (in the baseline, gone now)`)
    for (const k of c.fixedSinceLast) L.push(`- \`${clip(k, 140)}\` — fixed (confirmed in an earlier run, then absent from consecutive runs that measured every cell of it)`)
    L.push('')
  }
  if (s.notMeasured.length) {
    L.push('## Not measured, by cause', '')
    for (const n of s.notMeasured) L.push(`- **${n.cause}** — ${n.count} case(s) in ${n.checks.join(', ')}${n.why ? `: ${clip(n.why, 160)}` : ''}${n.example ? `; e.g. ${clip(n.example, 120)}` : ''}`)
    L.push('')
  }
  if (s.notOwed?.length) {
    L.push('## Not owed (closed by a declaration, not measured)', '')
    for (const n of s.notOwed) L.push(`- ${n.cells} cell(s) on ${n.routes} route(s) in ${n.checks.join(', ')}: ${n.reason}`)
    L.push('')
  }
  if (s.acceptErrors.length) {
    L.push('## sweep.accept rows in error', '')
    for (const e of s.acceptErrors) L.push(`- ${clip(e, 300)}`)
    L.push('')
  }
  return L.join('\n')
}

/** The summary at the largest example cap whose Markdown fits MAX_LINES (never fewer groups). → { summary, md } */
export function summarise(report, opts = {}) {
  let out
  for (const examples of LEVELS) {
    const summary = buildSummary(report, { ...opts, examples })
    out = { summary, md: renderSummary(summary) }
    if (out.md.split('\n').length <= MAX_LINES) break
  }
  return out
}

/** stdout of a normal run: one line per check, then the path of the summary. */
export function summaryLines(summary, file) {
  return [...summary.checks.map((c) => (c.verdict === 'carried' ? `${c.id}: carried, ${c.groups} group(s)${c.accepted ? ` (+${c.accepted} accepted)` : ''}, ${c.notMeasured} not measured — not measured in this run, from the run of ${c.carriedFrom}` : `${c.id}: ${c.verdict}, ${c.groups} group(s)${c.accepted ? ` (+${c.accepted} accepted)` : ''}, ${c.cases} case(s), ${c.notMeasured} not measured`)), `summary: ${file}`]
}
