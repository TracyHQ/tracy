// The evidence model of the interaction-parity probe (interaction-parity.mjs): its claim, its notes and its validator.
// The reader of interaction evidence — report.mjs (exit code, machine notes) — goes through these functions.
//
//   record  { tool, status: 'run', thresholds, tiers, origins: {site, source}, chromePages, pages: string[], checks: string[], examined,
//             coverage: {check, route, width, theme, measured}[], findings: finding[], notMeasured: row[], blocking }
//   claim   { status, tool, file, pages, checks, examined, findings, notMeasured, blocking }   (visual.json `interaction`; the summary keeps status, findings, notMeasured, examined, blocking)
//
// The claim's counts are RECOMPUTED from the record's rows: a count that disagrees with the rows is a contradiction,
// never a number to trust. `blocking` counts everything that stops a run: a state that was not measured, a probe that
// read nothing, a probe that did not run. A FINDING does not block: the probe's pairing is verified on one port only, so
// its findings are an advisory list to read (`advisory`, notes/advisory.md), never a verdict. What would lift it back:
// every finding of a second port classified.
import { CHECKS, CHROME_CHECKS, COVERAGE_STATUSES, INTERACTION_KINDS, INTERACTION_TOOL, TIERS, caseKey, owedCases } from './interaction-page-contract.mjs'
import { checkApplicability, noReferenceReason } from './applicability.mjs'

export const INTERACTION_FILE = 'interaction.json'

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const nonneg = (v) => Number.isSafeInteger(v) && v >= 0

/** What blocks a run: unmeasured states, nothing read, a probe that did not run. Findings are advisory (see the header). */
export const interactionBlocking = (r) => (r.status === 'run' ? (r.notMeasured?.length ?? r.notMeasured ?? 0) + ((r.examined ?? 0) === 0 ? 1 : 0) : 1)

/** The claim visual.json carries for a record (or for a probe that did not run). */
export function interactionClaimOf(record) {
  if (!record || record.status !== 'run') return { status: record?.status ?? 'not-run', reason: record?.reason ?? 'the probe did not run', blocking: 1 }
  const claim = {
    status: 'run',
    tool: record.tool,
    file: INTERACTION_FILE,
    pages: record.pages.length,
    checks: record.checks,
    examined: record.examined,
    findings: record.findings.length,
    notMeasured: record.notMeasured.length,
    advisory: record.findings.length
  }
  return { ...claim, blocking: interactionBlocking(claim) }
}
export const interactionSummaryOf = (claim) => ({ status: claim.status, ...(claim.reason ? { reason: claim.reason } : {}), findings: claim.findings ?? 0, advisory: claim.findings ?? 0, notMeasured: claim.notMeasured ?? 0, examined: claim.examined ?? 0, blocking: claim.blocking })

/**
 * @param {object} [o.owed]  what the consumer owes the record (see interactionAttestationProblems): given, a record that does not
 *   attest every owed case as measured is refused too
 * @returns {string[]} the refusals: empty when the record is what the claim says it is, was produced by this tool and read something.
 */
export function validateInteractionRecord(record, { claim = null, owed = null } = {}) {
  const out = []
  if (!isObj(record)) return ['interaction.json is not an object']
  if (record.tool !== INTERACTION_TOOL) out.push(`interaction.json was written by ${String(record.tool)}, this tool is ${INTERACTION_TOOL}: measure again`)
  if (record.status !== 'run') out.push(`interaction probe status is ${String(record.status)}, not run`)
  for (const k of ['pages', 'checks', 'findings', 'notMeasured']) if (!Array.isArray(record[k])) out.push(`interaction.${k} is not a list`)
  if (!nonneg(record.examined)) out.push('interaction.examined is not a count')
  if (out.length) return out
  for (const f of record.findings) if (!INTERACTION_KINDS.includes(f?.kind)) out.push(`interaction finding of unknown kind ${JSON.stringify(f?.kind)}`)
  if (record.examined === 0) out.push('interaction probe examined nothing: a probe that read nothing is not a pass')
  if (claim) {
    const want = interactionClaimOf(record)
    for (const k of ['findings', 'advisory', 'notMeasured', 'examined', 'pages', 'blocking']) if (claim[k] !== want[k]) out.push(`visual.json interaction.${k} is ${JSON.stringify(claim[k])} but interaction.json has ${JSON.stringify(want[k])}`)
  }
  if (owed) out.push(...interactionAttestationProblems(record, owed))
  return out
}

const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i])
const bare = (r) => (String(r).length > 1 ? String(r).replace(/\/+$/, '') : String(r))
const originOrNull = (u) => {
  try {
    return new URL(String(u)).origin
  } catch {
    return null
  }
}
const show = (c) => `${c.check} ${c.route}${c.width ? ` ${c.width}px` : ''}${c.theme ? ` ${c.theme}` : ''}`
const attestedCaseKey = (c) => caseKey({ ...c, route: bare(c.route) })

/**
 * What a record attests, against what the consumer owes it. A record that lists its checks and an `examined` count says
 * nothing about WHICH states it measured: it carries one row per case (check × route × width × theme) and the cases that
 * were owed must each be there, once, measured. A state that was owed and not measured is never clean.
 * @param {object} owed
 * @param {string[]|null} [owed.routes]  the pages the consumer's own run measured: every one must be a page of the record (default: the record's own pages)
 * @param {string|null} [owed.site]       the origin the consumer measured: the record's must be the same
 * @param {string|null} [owed.source]     the source origin the consumer compares with (null: not checked)
 * @returns {string[]}
 */
export function interactionAttestationProblems(record, { routes = null, site = null, source = null, referenceKinds = null } = {}) {
  const out = []
  const rawKinds = referenceKinds instanceof Map ? Object.fromEntries(referenceKinds) : referenceKinds
  const expectedKinds = rawKinds ? Object.fromEntries(Object.entries(rawKinds).map(([route, kind]) => [bare(route), kind])) : null
  if (!isObj(record) || !Array.isArray(record.pages) || !Array.isArray(record.checks)) return ['interaction record has no pages and checks to attest']
  if (record.tool !== INTERACTION_TOOL) return [`interaction record version is ${String(record.tool)}, expected ${INTERACTION_TOOL}: measure again with the current probe`]
  const cov = record.coverage
  if (!Array.isArray(cov) || !cov.length) return ['interaction.coverage is missing or empty: the record does not say which cases were measured (measure again with the current probe)']
  if (!isObj(record.tiers)) out.push('interaction.tiers is missing: the record does not say which widths and themes it ran')
  else
    for (const k of Object.keys(TIERS))
      if (JSON.stringify(record.tiers[k]) !== JSON.stringify(TIERS[k])) out.push(`interaction.tiers.${k} is ${JSON.stringify(record.tiers[k] ?? null)}, the tool's tiers are ${JSON.stringify(TIERS[k])}: a narrowed run is not a pass`)
  const checks = [...record.checks].sort()
  if (!sameList(checks, [...CHECKS].sort())) out.push(`interaction.checks is ${JSON.stringify(record.checks)}, a run owes ${JSON.stringify(CHECKS)}`)
  const o = record.origins
  if (!isObj(o) || !originOrNull(o.site)) out.push('interaction.origins.site is missing')
  else {
    if (site && originOrNull(site) !== o.site) out.push(`interaction was measured at ${o.site}, this consumer's site is ${originOrNull(site) ?? site}`)
    const requiresSource = (record.pages ?? []).some((route) => expectedKinds?.[bare(route)] !== 'none')
    if (requiresSource && source && originOrNull(source) !== o.source) out.push(`interaction compared with ${o.source ?? 'no source'}, this consumer's source is ${originOrNull(source) ?? source}`)
    if (requiresSource && !o.source) out.push('interaction.origins.source is null: no state was compared with a source')
  }
  const pages = record.pages.map(bare)
  for (const r of routes ?? []) if (!pages.includes(bare(r))) out.push(`interaction record does not list the page ${r} this consumer measured`)
  const chrome = record.chromePages === null ? null : Array.isArray(record.chromePages) ? record.chromePages.map(bare) : undefined
  if (chrome === undefined) out.push('interaction.chromePages is neither null nor a list')
  else if (chrome) {
    if (!chrome.length) out.push('interaction.chromePages is empty: the shared header was read on no page')
    for (const c of chrome) if (!pages.includes(c)) out.push(`interaction.chromePages names ${c}, which is not a page of the record`)
  }
  // every case is one row, once; a row outside the grid is refused too (a record cannot invent cases to look complete)
  const have = new Map()
  const kinds = expectedKinds
  for (const c of cov) {
    if (!isObj(c) || typeof c.check !== 'string' || typeof c.route !== 'string' || typeof c.measured !== 'boolean') { out.push(`interaction.coverage has a row that is not {check, route, width, theme, measured}: ${JSON.stringify(c).slice(0, 80)}`); continue }
    const expectedKind = kinds?.[bare(c.route)]
    const sourceCheck = `interaction-${c.check}-comparison`
    const applicability = expectedKind && c.check !== 'contrast' ? checkApplicability(expectedKind, sourceCheck) : 'applicable'
    if (c.status === 'not-applicable') {
      if (applicability !== 'not-applicable') out.push(`interaction.coverage ${show(c)} claims not-applicable without a bound reference.kind=none`)
      if (c.reason !== noReferenceReason) out.push(`interaction.coverage ${show(c)} has an invalid not-applicable reason`)
      if (!c.measured) out.push(`interaction.coverage ${show(c)} has not measured its target-side obligation`)
    } else if (applicability === 'not-applicable') out.push(`interaction.coverage ${show(c)} is missing its typed not-applicable outcome for reference.kind=none`)
    else if (c.status !== undefined && !COVERAGE_STATUSES.includes(c.status)) out.push(`interaction.coverage ${show(c)} has unknown status ${JSON.stringify(c.status)}`)
    const k = caseKey({ ...c, route: bare(c.route) })
    if (have.has(k)) out.push(`interaction.coverage lists ${show(c)} twice`)
    have.set(k, c.measured)
  }
  const owedList = owedCases({ pages, chromePages: chrome ?? null, checks: CHECKS, headerWidths: TIERS.headerWidths })
  const owedKeys = new Set(owedList.map(caseKey))
  const missing = owedList.filter((c) => !have.has(caseKey(c)))
  const unmeasured = owedList.filter((c) => have.get(caseKey(c)) === false)
  for (const c of missing.slice(0, 5)) out.push(`interaction: ${show(c)} was owed and has no row in the record`)
  if (missing.length > 5) out.push(`interaction: ${missing.length - 5} more owed case(s) have no row`)
  for (const c of unmeasured.slice(0, 5)) out.push(`interaction: ${show(c)} was owed and NOT measured`)
  if (unmeasured.length > 5) out.push(`interaction: ${unmeasured.length - 5} more owed case(s) were not measured`)
  for (const k of have.keys()) if (!owedKeys.has(k)) out.push(`interaction.coverage has a case outside the grid the run owes: ${k}`)
  for (const c of CHROME_CHECKS) if (!owedList.some((x) => x.check === c)) out.push(`interaction: no page owes the ${c} check (no chrome page)`)

  const obligations = record.obligations
  const outcomes = record.outcomes
  const discoveries = record.discoveries
  if (!Array.isArray(obligations)) out.push('interaction.obligations is missing or not a list')
  if (!Array.isArray(outcomes)) out.push('interaction.outcomes is missing or not a list')
  if (!Array.isArray(discoveries)) out.push('interaction.discoveries is missing or not a list')
  if (Array.isArray(obligations) && Array.isArray(outcomes) && Array.isArray(discoveries)) {
    const ids = new Set()
    const obligationKeys = new Map()
    const obligationCounts = new Map()
    for (const obligation of obligations) {
      if (!isObj(obligation) || typeof obligation.id !== 'string' || !['drawer', 'form'].includes(obligation.check) || typeof obligation.route !== 'string') {
        out.push(`interaction.obligations has an invalid row: ${JSON.stringify(obligation).slice(0, 100)}`)
        continue
      }
      if (ids.has(obligation.id)) out.push(`interaction.obligations lists ${obligation.id} twice`)
      ids.add(obligation.id)
      const key = attestedCaseKey(obligation)
      obligationKeys.set(obligation.id, key)
      if (!have.has(key)) out.push(`interaction obligation ${obligation.id} is outside the recorded drawer/form cases`)
      obligationCounts.set(key, (obligationCounts.get(key) ?? 0) + 1)
    }
    const outcomesById = new Map()
    for (const outcome of outcomes) {
      if (!isObj(outcome) || typeof outcome.id !== 'string' || !['ok', 'finding', 'notMeasured'].includes(outcome.outcome)) {
        out.push(`interaction.outcomes has an invalid row: ${JSON.stringify(outcome).slice(0, 100)}`)
        continue
      }
      if (!ids.has(outcome.id)) out.push(`interaction.outcomes has no obligation for ${outcome.id}`)
      const rows = outcomesById.get(outcome.id) ?? []
      rows.push(outcome.outcome)
      outcomesById.set(outcome.id, rows)
      if (ids.has(outcome.id) && outcome.outcome === 'notMeasured' && have.get(obligationKeys.get(outcome.id)) === true) out.push(`interaction obligation ${outcome.id} is notMeasured but its case is claimed measured`)
    }
    for (const id of ids) {
      const count = outcomesById.get(id)?.length ?? 0
      if (count !== 1) out.push(`interaction obligation ${id} has ${count} outcomes${count > 1 ? ' (more than one outcome)' : ''}`)
    }
    const discoveryByKey = new Map()
    for (const discovery of discoveries) {
      if (!isObj(discovery) || !['drawer', 'form'].includes(discovery.check) || typeof discovery.route !== 'string' || typeof discovery.complete !== 'boolean' || !nonneg(discovery.count)) {
        out.push(`interaction.discoveries has an invalid row: ${JSON.stringify(discovery).slice(0, 100)}`)
        continue
      }
      const key = attestedCaseKey(discovery)
      if (discoveryByKey.has(key)) out.push(`interaction.discoveries lists ${key} twice`)
      if (!have.has(key)) out.push(`interaction discovery ${key} has no recorded drawer/form case`)
      discoveryByKey.set(key, discovery)
      const count = obligationCounts.get(key) ?? 0
      if (discovery.count !== count) out.push(`interaction discovery ${key} discovered ${discovery.count}, obligations recorded ${count}`)
      if (!discovery.complete && have.get(key) === true) out.push(`interaction has an incomplete discovery for ${key}, but its case is claimed measured`)
    }
    for (const c of cov.filter((x) => (x?.check === 'drawer' || x?.check === 'form') && x.status !== 'not-applicable')) {
      const key = attestedCaseKey(c)
      if (!discoveryByKey.has(key)) out.push(`interaction discovery is missing for ${key}`)
    }
  }
  return out
}


/**
 * One cause per group: the same kind of difference on the same control, state or form, wherever and at whatever width it shows. A header control
 * that is `extra` on 33 routes × 5 widths is ONE group with its routes and widths. Numbers (a position, a height) and per-route detail are not part of the cause;
 * the rows of the record are untouched — this is a view of them.
 * @returns {{cause: string, kind: string, count: number, routes: string[], widths: number[], themes: string[], example: object}[]}
 */
export function groupInteractionFindings(findings) {
  const part = (v) => (typeof v === 'string' ? v : Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.join('/') : '')
  const causeOf = (f) => [f.kind, ...['control', 'state', 'form', 'rows', 'missing', 'extra', 'source', 'site', 'reason'].map((k) => part(f[k]))].join('|')
  const groups = new Map()
  for (const f of findings ?? []) {
    const key = causeOf(f)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { cause: key, kind: f.kind, count: 0, routes: [], widths: [], themes: [], example: f }))
    g.count++
    if (f.route != null && !g.routes.includes(f.route)) g.routes.push(f.route)
    if (f.width != null && !g.widths.includes(f.width)) g.widths.push(f.width)
    if (f.theme != null && !g.themes.includes(f.theme)) g.themes.push(f.theme)
  }
  return [...groups.values()].map((g) => ({ ...g, widths: g.widths.sort((a, b) => a - b) }))
}

/** Machine rows (report.mjs `notes/machine.json` shape): one per state that was not measured, one for a probe that failed. Findings are NOT machine rows: they are advisory (interactionAdvisory). */
export function interactionNotes(i, start = 0) {
  if (!i) return []
  const rows = []
  const add = (lens, page, axis, detail, fix) =>
    rows.push({ id: `M${start + rows.length + 1}`, lens, page, layout: null, axis, stage: null, what: JSON.stringify(detail).slice(0, 300), fix, verify: `rerun visual-qa: ${lens} gone on ${page}/${axis}`, status: 'open' })
  if (i.status !== 'run') add('machine:interaction-probe', '-', '-', { status: i.status, reason: i.reason }, 'the interaction probe is part of every run: fix the error or give --spec and --source-site, then rerun')
  for (const n of i.notMeasured ?? []) add('machine:interaction-probe', n.route ?? '-', `${n.width ?? '-'}px`, { check: n.check, reason: n.reason, ...(n.control ? { control: n.control } : {}) }, 'this state was not measured: fix the route, the control or the stand, then rerun — an unmeasured state is not a pass')
  return rows
}

/**
 * The advisory list (notes/advisory.json, advisory.md): one row per CAUSE of the probe's findings, with the routes and widths it
 * shows on. Rows to read, never todos: they are not in machine.json, no verdict counts them, and no exit code follows them.
 */
export function interactionAdvisory(i) {
  if (!i || i.status !== 'run') return []
  return groupInteractionFindings(i.findings).map((g, n) => {
    const { kind, route, width, theme, ...rest } = g.example
    const where = g.count > 1 ? { occurrences: g.count, routes: g.routes.slice(0, 8), ...(g.routes.length > 8 ? { moreRoutes: g.routes.length - 8 } : {}), widths: g.widths, ...(g.themes.length ? { themes: g.themes } : {}) } : {}
    return { id: `A${n + 1}`, lens: `advisory:interaction-${kind}`, page: route ?? '-', axis: g.count > 1 ? 'several' : `${width ?? '-'}px${theme ? `-${theme}` : ''}`, what: JSON.stringify({ ...rest, ...where }).slice(0, 300) }
  })
}

export function advisoryMarkdown(rows, at) {
  return [
    `# Advisory — interaction parity — ${at}`,
    '',
    'Read these; none of them decides a checkpoint, a gate or a release. The probe pairs controls with the source on one port only, so a finding is a thing to look at, not a verdict.',
    'What lifts it back to a verdict: every finding of a second port classified.',
    '',
    ...(rows.length ? ['| id | kind | page | axis | what |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.lens} | ${r.page} | ${r.axis} | ${r.what.replace(/\|/g, '\\|')} |`)] : ['none']),
    ''
  ].join('\n')
}

export const interactionLine = (s) => `Interaction parity: ${s.status} · advisory findings ${s.advisory ?? s.findings} (notes/advisory.md, not counted) · not measured ${s.notMeasured} · examined ${s.examined}${s.blocking ? ' — **blocks the run** (notes/machine.md)' : ''}`
