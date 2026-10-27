// The one model of the intrinsic mobile probe's evidence (#65): its builder, its closed schema and its validator.
// Every reader of intrinsic evidence goes through `validateIntrinsicReport`; the producer builds its report with
// `buildIntrinsicReport`, so the two cannot drift. No browser code lives here (intrinsic-mobile.mjs imports this file).
//
// Supported schema (schemaless or older reports are refused — regenerate them with the current visual-qa):
//
//   report   { widths: int[], sourceRead: bool, routes: string[], measured: int, readings: reading[],
//              findings: finding[], errors: {route,width,error}[], summary: {siteOnly,shared,sourceFixed,errors} }
//   reading  { route, width (the VIEWPORT), defects: int, fixed: int, rows: row[], error?: string }
//   row      { kind, label, key, selector, class, source?, + per kind: control-wrap lines,boxWidth · text-clipped over · page-overflow over }
//   finding  a row of class site-only / shared-source-defect plus its reading's { route, width }
//   source   { lines } for control-wrap, { over } for the others (what the source measured at the same identity)
//
// Every total is RECOMPUTED from the readings' rows and compared with each stored copy (reading, report, summary,
// visual.json's `intrinsic` and `summary.intrinsic`). Invariants: route × width unique; coverage complete ⇔ every
// owed (route, width) is present exactly once and nothing else; sourceRead false ⇒ nothing is source-derived;
// errors > 0 ⇒ not clean. Any violation is a named refusal, never a pass.

export const INTRINSIC_WIDTHS = [320, 360, 375, 390, 414]
export const MAX_WRAP_WORDS = 3
/** The only file the verdict reads the report from. */
export const INTRINSIC_FILE = 'intrinsic.json'

const KINDS = ['control-wrap', 'text-clipped', 'page-overflow']
const ROW_CLASSES = ['site-only', 'shared-source-defect', 'source-fixed']
const SUMMARY_KEYS = ['siteOnly', 'shared', 'sourceFixed', 'errors']
const REPORT_KEYS = ['widths', 'sourceRead', 'routes', 'measured', 'readings', 'findings', 'errors', 'summary']
const READING_KEYS = ['route', 'width', 'error', 'defects', 'fixed', 'rows']
const CLAIM_KEYS = ['status', 'file', 'sourceRead', 'widths', 'routes', 'measured', ...SUMMARY_KEYS]
const SUMMARY_CLAIM_KEYS = ['status', 'siteOnly', 'shared', 'errors', 'blocking']
const ROW_KEYS = {
  'control-wrap': ['kind', 'label', 'key', 'selector', 'class', 'lines', 'boxWidth'],
  'text-clipped': ['kind', 'label', 'key', 'selector', 'class', 'over'],
  'page-overflow': ['kind', 'label', 'key', 'selector', 'class', 'over']
}
const SOURCE_KEY = { 'control-wrap': 'lines', 'text-clipped': 'over', 'page-overflow': 'over' }

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const nonneg = (v) => Number.isSafeInteger(v) && v >= 0
const atLeast = (v, n) => Number.isSafeInteger(v) && v >= n
const str = (v) => typeof v === 'string' && v !== ''
const dupes = (xs) => xs.filter((x, i) => xs.indexOf(x) !== i)
const more = (xs, n = 5) => `${xs.slice(0, n).join(', ')}${xs.length > n ? ` (+${String(xs.length - n)})` : ''}`
const unknownKeys = (o, allowed) => Object.keys(o).filter((k) => !allowed.includes(k))
const pairKey = (x) => `${x.route}@${String(x.width)}`
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v))

/** What of a probe blocks a run: a site-only defect, a reading that failed, a probe that did not run. A defect the source shares does not. */
export const intrinsicBlocking = (i) => (i ? (i.siteOnly ?? 0) + (i.errors ?? 0) + (i.status === 'run' ? 0 : 1) : 0)

/** Whether the site is worse than the source at the same identity (more lines, wider overflow). */
export const isWorse = (site, source) => (site.lines ?? 0) > (source.lines ?? 0) || (site.over ?? 0) > (source.over ?? 0)

/** The counts of a set of readings — the only place a total is computed. */
export function tally(readings) {
  const rows = readings.flatMap((x) => x.rows)
  return {
    siteOnly: rows.filter((r) => r.class === 'site-only').length,
    shared: rows.filter((r) => r.class === 'shared-source-defect').length,
    sourceFixed: rows.filter((r) => r.class === 'source-fixed').length,
    errors: readings.filter((x) => x.error !== undefined).length
  }
}

/** The report of settled readings `{ route, width, rows, error? }`: every copy of a count is derived here, from the rows. */
export function buildIntrinsicReport({ widths, sourceRead, routes, readings }) {
  const settled = readings.map((x) => ({
    route: x.route,
    width: x.width,
    ...(x.error ? { error: x.error } : {}),
    defects: x.rows.length,
    fixed: x.rows.filter((r) => r.class === 'source-fixed').length,
    rows: x.rows.map((r) => ({ ...r }))
  }))
  return {
    widths: [...widths],
    sourceRead: Boolean(sourceRead),
    routes: [...routes],
    measured: settled.length,
    readings: settled,
    findings: settled.flatMap((x) => x.rows.filter((r) => r.class !== 'source-fixed').map((r) => ({ ...r, route: x.route, width: x.width }))),
    errors: settled.filter((x) => x.error !== undefined).map((x) => ({ route: x.route, width: x.width, error: x.error })),
    summary: tally(settled)
  }
}

/** visual.json's `intrinsic` block for a report that was read (status `run`). */
export const intrinsicClaimOf = (rep) => ({ status: 'run', file: INTRINSIC_FILE, sourceRead: rep.sourceRead, widths: rep.widths, routes: rep.routes.length, measured: rep.measured, ...rep.summary })

/** visual.json's `summary.intrinsic` block for that claim. */
export const summaryClaimOf = (claim) => ({ status: claim.status, siteOnly: claim.siteOnly ?? 0, shared: claim.shared ?? 0, errors: claim.errors ?? 0, blocking: intrinsicBlocking(claim) })

// ── schema ─────────────────────────────────────────────────────────────────────────────────────────
function rowProblems(row, sourceRead) {
  if (!isObj(row)) return ['is not an object']
  if (!KINDS.includes(row.kind)) return [`has unsupported kind ${JSON.stringify(row.kind)}`]
  const out = []
  const allowed = [...ROW_KEYS[row.kind], 'source']
  const extra = unknownKeys(row, allowed)
  if (extra.length) out.push(`has unknown field(s) ${extra.join(', ')}`)
  const missing = ROW_KEYS[row.kind].filter((k) => row[k] === undefined)
  if (missing.length) out.push(`lacks ${missing.join(', ')}`)
  if (missing.length) return out
  if (!ROW_CLASSES.includes(row.class)) return [...out, `has unsupported class ${JSON.stringify(row.class)}`]
  if (typeof row.label !== 'string' || row.label.length > 60 || (row.kind === 'page-overflow' ? row.label !== '' : row.label === '')) out.push('has an invalid label')
  if (!str(row.key) || (row.kind === 'page-overflow' ? row.key !== 'page-overflow' : !row.key.startsWith(`${row.kind}|`))) out.push('has an invalid key')
  if (!str(row.selector)) out.push('has no selector')
  if (row.kind === 'control-wrap') {
    if (!atLeast(row.lines, 2)) out.push('has lines below 2')
    if (!nonneg(row.boxWidth)) out.push('has an invalid boxWidth')
  } else if (!atLeast(row.over, 1)) out.push('has an invalid over')
  if (out.length) return out
  // classification against the retained source measurement
  const fixed = row.class === 'source-fixed'
  if (row.source !== undefined) {
    const sk = SOURCE_KEY[row.kind]
    if (!isObj(row.source) || Object.keys(row.source).length !== 1 || !atLeast(row.source[sk], sk === 'lines' ? 2 : 1)) out.push(`has source measurements that are not { ${sk} }`)
    else if (fixed) out.push('is source-fixed yet carries a source block')
    else if (isWorse(row, row.source) !== (row.class === 'site-only')) out.push(`is ${row.class} yet its source measurement ${row.source[sk] < (row[sk] ?? 0) ? 'is smaller' : 'is not smaller'}`)
  } else if (row.class === 'shared-source-defect') out.push('is shared with the source without a source measurement')
  if (!sourceRead && (fixed || row.class === 'shared-source-defect' || row.source !== undefined)) out.push('is derived from the source although sourceRead is false')
  return out
}

function readingProblems(x, i, sourceRead) {
  const at = `reading ${String(i)}`
  if (!isObj(x)) return [`${at} is not an object`]
  const extra = unknownKeys(x, READING_KEYS)
  if (extra.length) return [`${at} has unknown field(s) ${extra.join(', ')}`]
  if (!str(x.route) || !Number.isSafeInteger(x.width) || !nonneg(x.defects) || !nonneg(x.fixed) || !Array.isArray(x.rows) || (x.error !== undefined && !str(x.error))) return [`${at} has a missing or mistyped field`]
  const out = []
  const tag = `${at} (${pairKey(x)})`
  x.rows.forEach((r, j) => out.push(...rowProblems(r, sourceRead).map((m) => `${tag} row ${String(j)} ${m}`)))
  if (out.length) return out
  const keys = x.rows.map((r) => r.key)
  const dup = dupes(keys)
  if (dup.length) out.push(`${tag} repeats defect identity ${more(dup, 2)}`)
  if (x.defects !== x.rows.length) out.push(`${tag} declares ${String(x.defects)} defect(s) but retains ${String(x.rows.length)} row(s)`)
  const fixed = x.rows.filter((r) => r.class === 'source-fixed').length
  if (x.fixed !== fixed) out.push(`${tag} declares ${String(x.fixed)} source-fixed but retains ${String(fixed)}`)
  if (x.error !== undefined && x.rows.length) out.push(`${tag} failed yet holds rows`)
  return out
}

const multiset = (xs) => {
  const m = new Map()
  for (const x of xs) m.set(canon(x), (m.get(canon(x)) ?? 0) + 1)
  return m
}
const sameMultiset = (a, b) => {
  const ma = multiset(a)
  const mb = multiset(b)
  return ma.size === mb.size && [...ma].every(([k, n]) => mb.get(k) === n)
}

function claimProblems(claim, name, keys, expected) {
  if (!isObj(claim)) return [`visual.json holds no ${name} block to reconcile`]
  const out = []
  const extra = unknownKeys(claim, keys)
  if (extra.length) out.push(`unknown field(s) ${extra.join(', ')} in visual.json's ${name} block`)
  for (const [k, v] of Object.entries(expected)) {
    if (k === 'file' || k === 'status') {
      if (claim[k] !== v) out.push(`visual.json ${name} ${k} ${JSON.stringify(claim[k])} ≠ ${JSON.stringify(v)}`)
    } else if (k === 'sourceRead') {
      if (claim[k] !== v) out.push(`visual.json ${name} sourceRead ${String(claim[k])} ≠ ${String(v)} in the report`)
    } else if (k === 'widths') {
      if (!Array.isArray(claim.widths) || claim.widths.length !== v.length || claim.widths.some((w, i) => w !== v[i])) out.push(`visual.json ${name} widths differ from the report widths`)
    } else if (!nonneg(claim[k])) out.push(`visual.json ${name} ${k} is not a non-negative integer`)
    else if (claim[k] !== v) out.push(`visual.json ${name} ${k} ${String(claim[k])} ≠ ${String(v)} recomputed from the readings`)
  }
  return out
}

/**
 * @param {unknown} rep                   the parsed intrinsic.json
 * @param {object} o
 * @param {string[]} o.owedRoutes         the page-map's content routes, read independently of the probe (required)
 * @param {number[]} [o.owedWidths]       the widths owed (the gate's INTRINSIC_WIDTHS; a standalone probe may name its own)
 * @param {{intrinsic: unknown, summary: unknown}|null} [o.claims]  visual.json's `intrinsic` and `summary.intrinsic`; every field is
 *                                        compared, an absent block is a refusal. Null only for a probe run that has no visual.json yet.
 * @param {boolean} [o.allowFailedReadings]  the run reports failed readings as blocking errors itself; a verdict never allows them
 * @returns {string[]} refusals; empty ⇔ the report is well-formed, consistent and complete
 */
export function validateIntrinsicReport(rep, { owedRoutes = null, owedWidths = INTRINSIC_WIDTHS, claims = null, allowFailedReadings = false } = {}) {
  if (!isObj(rep)) return ['the report is not an object']
  const out = []
  const unknown = unknownKeys(rep, REPORT_KEYS)
  if (unknown.length) out.push(`unknown report field(s) ${unknown.join(', ')}`)
  const missing = REPORT_KEYS.filter((k) => rep[k] === undefined)
  if (missing.length) out.push(`the report lacks ${missing.join(', ')}`)
  const lists = ['widths', 'routes', 'readings', 'findings', 'errors'].filter((k) => rep[k] !== undefined && !Array.isArray(rep[k]))
  if (lists.length) out.push(`${lists.join(', ')} must each be a list`)
  if (rep.sourceRead !== undefined && typeof rep.sourceRead !== 'boolean') out.push('sourceRead must be true or false')
  if (rep.measured !== undefined && !nonneg(rep.measured)) out.push('measured is not a non-negative integer')
  if (rep.summary !== undefined) {
    if (!isObj(rep.summary)) out.push('summary is not an object')
    else {
      const extra = unknownKeys(rep.summary, SUMMARY_KEYS)
      if (extra.length) out.push(`unknown summary field(s) ${extra.join(', ')}`)
      for (const k of SUMMARY_KEYS) if (!nonneg(rep.summary[k])) out.push(`its summary ${k} is not a non-negative integer`)
    }
  }
  if (out.length) return out // nothing below may read a field of the wrong type

  const { routes, widths, readings, findings, errors, summary, sourceRead } = rep
  if (routes.some((r) => !str(r)) || widths.some((w) => !Number.isSafeInteger(w))) return ['routes must be non-empty strings and widths integers']
  const shapes = readings.flatMap((x, i) => readingProblems(x, i, sourceRead))
  const badErrors = errors.filter((e) => !isObj(e) || !str(e.route) || !Number.isSafeInteger(e.width) || !str(e.error) || Object.keys(e).length !== 3)
  const badFindings = findings.filter((f) => !isObj(f) || !str(f.route) || !Number.isSafeInteger(f.width))
  if (badErrors.length) shapes.push(`${String(badErrors.length)} malformed error row(s)`)
  if (badFindings.length) shapes.push(`${String(badFindings.length)} malformed finding(s)`)
  if (shapes.length) return shapes.slice(0, 8)

  // inventory: unique, and EXACTLY the owed routes and widths (independent inputs, never the report's own lists)
  const dupRoutes = dupes(routes)
  const dupWidths = dupes(widths.map(String))
  if (dupRoutes.length) out.push(`duplicate route(s) ${more(dupRoutes)}`)
  if (dupWidths.length) out.push(`duplicate width(s) ${more(dupWidths)}`)
  if (!routes.length) out.push('no route measured')
  if (!widths.length) out.push('no width measured')
  if (!Array.isArray(owedRoutes) || !owedRoutes.length || owedRoutes.some((r) => !str(r)) || dupes(owedRoutes).length) out.push('no valid page-map route inventory to check the routes against (the verdict needs --spec)')
  else {
    const absent = owedRoutes.filter((r) => !routes.includes(r))
    const extra = routes.filter((r) => !owedRoutes.includes(r))
    if (absent.length) out.push(`route(s) of the page-map not measured: ${more(absent)}`)
    if (extra.length) out.push(`route(s) measured that are not in the page-map: ${more(extra)}`)
  }
  if (!Array.isArray(owedWidths) || !owedWidths.length || owedWidths.some((w) => !Number.isSafeInteger(w)) || dupes(owedWidths.map(String)).length) out.push('no valid width inventory to check the widths against')
  else {
    const absent = owedWidths.filter((w) => !widths.includes(w))
    const extra = widths.filter((w) => !owedWidths.includes(w))
    if (absent.length) out.push(`width(s) ${absent.join('/')} not measured`)
    if (extra.length) out.push(`width(s) ${extra.join('/')} measured that are not owed`)
  }

  // coverage ⇔ every route × width of the inventory present exactly once, and nothing else
  const count = new Map()
  for (const x of readings) count.set(pairKey(x), (count.get(pairKey(x)) ?? 0) + 1)
  const owed = new Set(routes.flatMap((r) => widths.map((w) => `${r}@${String(w)}`)))
  const lacking = [...owed].filter((p) => count.get(p) !== 1)
  if (lacking.length) out.push(`not exactly one reading for ${more(lacking)}`)
  const stray = readings.filter((x) => !owed.has(pairKey(x))).length
  if (stray) out.push(`${String(stray)} reading(s) outside the routes × widths measured`)
  if (rep.measured !== readings.length) out.push('its measured count disagrees with its readings')

  // errors: recomputed from the readings; the list must be the same multiset; any error ⇒ not clean
  const failed = readings.filter((x) => x.error !== undefined)
  if (!sameMultiset(errors, failed.map((x) => ({ route: x.route, width: x.width, error: x.error })))) out.push(`its errors list (${String(errors.length)}) is not the ${String(failed.length)} failed reading(s)`)
  if (failed.length && !allowFailedReadings) out.push(`${String(failed.length)} failed reading(s) recorded`)

  // findings: exactly the non-source-fixed rows of the readings, with multiplicity
  const projected = readings.flatMap((x) => x.rows.filter((r) => r.class !== 'source-fixed').map((r) => ({ ...r, route: x.route, width: x.width })))
  if (!sameMultiset(findings, projected)) out.push(`its findings (${String(findings.length)}) are not the ${String(projected.length)} classified row(s) of its readings`)

  // totals recomputed from the rows, compared with every stored copy
  const total = tally(readings)
  for (const k of SUMMARY_KEYS) if (summary[k] !== total[k]) out.push(`its summary ${k} ${String(summary[k])} ≠ ${String(total[k])} in its readings`)
  if (!sourceRead && (total.shared || total.sourceFixed)) out.push(`sourceRead is false yet ${String(total.shared)} shared and ${String(total.sourceFixed)} source-fixed defect(s) are counted`)

  if (claims) {
    out.push(...claimProblems(claims.intrinsic, 'intrinsic', CLAIM_KEYS, { status: 'run', file: INTRINSIC_FILE, sourceRead, widths, routes: routes.length, measured: readings.length, ...total }))
    out.push(...claimProblems(claims.summary, 'summary.intrinsic', SUMMARY_CLAIM_KEYS, { status: 'run', siteOnly: total.siteOnly, shared: total.shared, errors: total.errors, blocking: intrinsicBlocking({ ...total, status: 'run' }) }))
  }
  return out
}
