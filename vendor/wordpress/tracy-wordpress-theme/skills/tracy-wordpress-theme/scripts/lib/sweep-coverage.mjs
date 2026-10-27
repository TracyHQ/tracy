// What a measure covers, and whether that is enough for a patch release (`release.mjs --patch`).
//
// A sweep records in its fix-measure.json a `coverage` block — the checks it ran, the routes, widths, heights widths and schemes it
// measured, whether any of them was named by the caller (`--only`, `--pages`, `--widths`, `--schemes`), and whether the document
// carries evidence it did not measure:
//   coverage: {mode: 'full'|'scoped', explicit: ['--only', …], carried: boolean, checks: [id…], routes: [path…], widths: [px…], heightsWidths: [px…], schemes: [light|dark…]}
// A patch release accepts a measure only when it is a FULL run of every check over every renderable route of the visual contract
// on the standard axes. A measure with no coverage (a port's own script, an older sweep) is valid as a document, and never enough
// for a release. Missing evidence is a problem, never a pass.
import { SWEEP_TARGET_CHECKS } from '../visual/applicability.mjs'

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const isList = (x, ok) => Array.isArray(x) && x.every(ok)
const str = (x) => typeof x === 'string' && x !== ''
const num = (x) => Number.isInteger(x) && x > 0
const same = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')
const THEME_WIDTHS = [390, 768, 1440]
const TOUCH_WIDTHS = [1024, 1180]
const DRAWER_WIDTHS = [390, 768]
const TARGET_CHECKS = new Set(SWEEP_TARGET_CHECKS)

const anchorsOf = (widths) => [...new Set([widths.includes(1440) ? 1440 : Math.max(...widths), widths.includes(390) ? 390 : Math.min(...widths)])]
const themeWidthsOf = (widths) => (widths.some((w) => THEME_WIDTHS.includes(w)) ? THEME_WIDTHS.filter((w) => widths.includes(w)) : anchorsOf(widths))

/** The per-page comparison and target obligations in the default full site-sweep schedule. */
export function expectedSweepCells({ pages, widths, heightsWidths, schemes, homePath = null }) {
  const out = []
  const anchors = anchorsOf(widths)
  const themeWidths = themeWidthsOf(widths)
  const home = pages.find((p) => p.path === (homePath ?? '/')) ?? pages[0]
  const add = (check, page, axis = {}) => out.push({ check, route: page.path, ...axis, referenceKind: page.referenceKind ?? null })
  for (const page of pages) {
    for (const check of ['overflow', 'background', 'header', 'chips']) for (const width of widths) for (const scheme of schemes) add(check, page, { width, scheme })
    for (const sys of schemes) for (const saved of ['none', 'light', 'dark']) add('scheme', page, { width: widths.includes(1440) ? 1440 : Math.max(...widths), state: `os-${sys}/${saved === 'none' ? 'no-choice' : `saved-${saved}`}` })
    for (const width of anchors) for (const scheme of schemes) add('fixed-widgets', page, { width, scheme })
    for (const check of ['icons', 'forms', 'text']) for (const width of anchors) add(check, page, { width, scheme: schemes[0] })
    for (const width of heightsWidths) add('heights', page, { width })
  }
  if (home) {
    for (const width of themeWidths) for (const sys of schemes) for (const saved of ['none', 'light', 'dark', 'auto']) add('first-interaction', home, { width, state: `theme:${sys}/${saved}` })
    for (const width of TOUCH_WIDTHS.filter((w) => widths.includes(w))) add('first-interaction', home, { width, state: 'touch' })
    for (const width of DRAWER_WIDTHS.filter((w) => widths.includes(w))) add('first-interaction', home, { width, state: 'drawer' })
  }
  return out
}

/** Validate case-level evidence; axis unions alone cannot prove the full route × width × state schedule. */
export function sweepOutcomeProblems(report, pages) {
  const out = []
  const outcomes = report?.applicability?.outcomes
  if (!Array.isArray(outcomes) || report?.applicability?.version !== 1) return ['the sweep has no supported applicability outcome ledger']
  const key = (x) => `${x.check}|${x.route}|${x.width ?? ''}|${x.scheme ?? ''}|${x.state ?? ''}`
  const expected = expectedSweepCells({ pages, widths: report.widths ?? [], heightsWidths: report.heights?.widths ?? report.widths ?? [], schemes: report.schemes ?? [] })
  const indexed = new Map()
  for (const item of outcomes) {
    if (!item || typeof item !== 'object') { out.push('an applicability outcome is malformed'); continue }
    const k = key(item)
    const list = indexed.get(k) ?? []
    list.push(item)
    indexed.set(k, list)
  }
  const rows = [...(report.rows ?? []), ...(report.stateRows ?? []), ...Object.values(report.behaviourRows ?? {}).flatMap((x) => Array.isArray(x) ? x : []), ...(report.heights?.cells ?? [])]
  const pageRoutes = new Set(pages.map((p) => p.path))
  for (const row of rows) if (row?.route && !pageRoutes.has(row.route)) out.push(`sweep evidence contains unexpected route ${row.route}`)
  const expectedKeys = new Set(expected.map((x) => key({ ...x, check: `sweep-${x.check}-comparison` })))
  const rowState = (cell) => cell.state?.replace(/^theme:/, '').replace(/\/none$/, '/no-choice').replace(/\/auto$/, '/old-auto-value')
  const rowsFor = (cell) => rows.filter((r) => r?.route === cell.route && (cell.width === undefined || r.width === cell.width) && (cell.scheme === undefined || r.scheme === cell.scheme) && (cell.state === undefined || r.state === rowState(cell)) && r.port && (cell.referenceKind === 'none' ? r.referenceKind === 'none' : r.source))
  for (const cell of expected) {
    const comparisonCheck = `sweep-${cell.check}-comparison`
    const claims = indexed.get(key({ ...cell, check: comparisonCheck })) ?? []
    if (cell.referenceKind === 'none') {
      if (claims.length !== 1 || claims[0]?.status !== 'not-applicable' || claims[0]?.reason !== 'reference.kind=none') out.push(`${comparisonCheck} ${cell.route} ${cell.width ?? cell.state ?? ''}: missing or invalid spec-bound N/A outcome`)
    } else {
      if (claims.length) out.push(`${comparisonCheck} ${cell.route}: N/A is not allowed for reference.kind=${cell.referenceKind ?? 'unknown'}`)
      const reads = rowsFor(cell)
      if (!reads.length) out.push(`${cell.check} ${cell.route} ${cell.width ?? cell.state ?? ''}: expected measurement is missing`)
      else if (cell.check !== 'first-interaction' || cell.state === undefined || cell.state.startsWith('theme:') || cell.state === 'drawer') {
        if (reads.length !== 1) out.push(`${cell.check} ${cell.route} ${cell.width ?? cell.state ?? ''}: measurement cell is duplicated or conflicting`)
      }
    }
    const targetRequired = cell.referenceKind === 'none' && TARGET_CHECKS.has(cell.check)
    if (targetRequired) {
      const checkId = cell.check
      const targetCell = checkId === 'first-interaction' ? { ...cell, state: cell.state?.replace(/^theme:/, '').replace(/\/none$/, '/no-choice').replace(/\/auto$/, '/old-auto-value') } : cell
      const target = (indexed.get(key({ ...targetCell, check: checkId })) ?? []).filter((x) => x.status !== 'not-applicable')
      if (!target.length) out.push(`${checkId} ${cell.route} ${cell.width ?? cell.state ?? ''}: target outcome is missing`)
      else if (target.some((x) => !['pass', 'fail', 'not-measured'].includes(x.status))) out.push(`${checkId} ${cell.route}: target outcome status is invalid`)
      if (target.some((x) => x.status === 'fail')) out.push(`${checkId} ${cell.route} ${cell.width ?? cell.state ?? ''}: target invariant failed`)
      if (target.some((x) => x.status === 'not-measured')) out.push(`${checkId} ${cell.route} ${cell.width ?? cell.state ?? ''}: target invariant is not measured`)
      if (['overflow', 'scheme'].includes(checkId) && target.length !== 1) out.push(`${checkId} ${cell.route} ${cell.width ?? cell.state ?? ''}: target cell is duplicated or conflicting`)
    }
  }
  for (const item of outcomes) {
    const isComparison = typeof item.check === 'string' && item.check.startsWith('sweep-') && item.check.endsWith('-comparison')
    if (item.status === 'not-applicable') {
      const page = pages.find((p) => p.path === item.route)
      if (!isComparison || page?.referenceKind !== 'none' || item.reason !== 'reference.kind=none' || !expectedKeys.has(key(item))) out.push(`${item.check ?? '(unknown check)'} ${item.route ?? '(unknown route)'}: forged or unauthorized N/A outcome`)
    } else if (!isComparison) {
      const check = item.check
      const expectedState = (x) => x.state?.replace(/^theme:/, '').replace(/\/none$/, '/no-choice').replace(/\/auto$/, '/old-auto-value')
      const candidate = expected.find((x) => x.check === check && x.route === item.route && (x.width === undefined || x.width === item.width) && (x.scheme === undefined || x.scheme === item.scheme) && (x.state === undefined || expectedState(x) === item.state))
      if (!candidate || candidate.referenceKind !== 'none' || !TARGET_CHECKS.has(check)) out.push(`${check ?? '(unknown check)'} ${item.route ?? '(unknown route)'}: unexpected target outcome`)
      if (!['pass', 'fail', 'not-measured'].includes(item.status)) out.push(`${check} ${item.route}: target outcome status is invalid`)
    }
  }
  return out
}

/** The coverage block of a sweep. Lists are copied; `explicit` names the options the caller used to narrow the run. */
export function coverageOf({ mode, explicit = [], carried = false, checks, routes, widths, heightsWidths, schemes }) {
  return { mode, explicit: [...explicit], carried: Boolean(carried), checks: [...checks], routes: [...routes], widths: [...widths], heightsWidths: [...heightsWidths], schemes: [...schemes] }
}

/** Why `c` is not a coverage block: a list of messages, empty when it is one. */
export function validateCoverage(c) {
  if (!isObj(c)) return ['coverage is not an object']
  const out = []
  if (c.mode !== 'full' && c.mode !== 'scoped') out.push(`coverage.mode is ${JSON.stringify(c.mode ?? null)}, not full or scoped`)
  if (!isList(c.explicit, str)) out.push('coverage.explicit is not a list of option names')
  if (typeof c.carried !== 'boolean') out.push('coverage.carried is not true or false')
  if (!isList(c.checks, str)) out.push('coverage.checks is not a list of check ids')
  if (!isList(c.routes, str)) out.push('coverage.routes is not a list of routes')
  if (!isList(c.widths, num)) out.push('coverage.widths is not a list of widths')
  if (!isList(c.heightsWidths, num)) out.push('coverage.heightsWidths is not a list of widths')
  if (!isList(c.schemes, str)) out.push('coverage.schemes is not a list of schemes')
  return out
}

/**
 * Two coverage blocks of measures of the same run merge into the block of the sweep that has one; two blocks merge only when they are the
 * same block. Several scoped runs never add up to a full one. → the block, or null (no measure has one, or they differ).
 */
export function mergeCoverage(blocks) {
  const have = blocks.filter((b) => b !== undefined && b !== null)
  if (!have.length) return null
  const [first] = have
  return have.every((b) => JSON.stringify(b) === JSON.stringify(first)) ? first : null
}

/**
 * Why a measure is not enough for a patch release. `expected` is what a full run covers: {checks, routes, widths, heightsWidths, schemes}.
 * → [{code, message}], empty when the measure is a full run of every check over every route on the standard axes.
 */
export function coverageProblems(measure, expected) {
  const out = []
  const P = (code, message) => out.push({ code, message })
  const c = measure?.coverage
  if (c === undefined || c === null) {
    P('measure-coverage-missing', 'the measure records no coverage (which checks, routes, widths and schemes it measured): only a full `site-sweep.mjs --zip` run does — a measure of a port\'s own script is merged into it with fix-measure.mjs merge')
    return out
  }
  const shape = validateCoverage(c)
  if (shape.length) {
    P('measure-coverage-invalid', `the measure's coverage is malformed: ${shape.slice(0, 3).join('; ')}`)
    return out
  }
  if (c.mode !== 'full') P('measure-scoped', `the measure is of a scoped run${c.explicit.length ? ` (${c.explicit.join(', ')})` : ''}, not of a full run: rerun the sweep with no --only, --pages, --widths or --schemes (a first run, or --full --reason "<text>")`)
  else if (c.explicit.length) P('measure-scoped', `the measure's run was narrowed by ${c.explicit.join(', ')}`)
  if (c.carried) P('measure-carried', 'the measure carries evidence it did not measure in the run that wrote it')
  const list = (xs) => `${xs.slice(0, 6).join(', ')}${xs.length > 6 ? ', …' : ''}`
  const lacking = expected.checks.filter((id) => !c.checks.includes(id))
  if (lacking.length) P('measure-checks-missing', `the run did not measure ${lacking.length} of the ${expected.checks.length} check(s): ${list(lacking)}`)
  const unlisted = expected.checks.filter((id) => !(measure.checks ?? []).some((k) => k?.id === id))
  if (unlisted.length) P('measure-checks-missing', `the measure lists no result for ${unlisted.length} check(s): ${list(unlisted)}`)
  const missing = expected.routes.filter((r) => !c.routes.includes(r))
  const extra = c.routes.filter((r) => !expected.routes.includes(r))
  if (missing.length || extra.length) P('measure-routes-missing', `the routes measured are not the visual contract's: ${missing.length ? `${missing.length} not measured (${list(missing)})` : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? `${extra.length} not in the contract (${list(extra)})` : ''}`)
  for (const [axis, label] of [['widths', 'widths'], ['heightsWidths', 'heights widths'], ['schemes', 'schemes']]) if (!same(c[axis], expected[axis])) P('measure-axes-missing', `the ${label} measured are ${c[axis].join('/') || 'none'}, a full run measures ${expected[axis].join('/')}`)
  return out
}

/**
 * The coverage a site-sweep.json PROVES by its own rows, not by what it declares: the checks it measured (none carried or scoped), the routes,
 * widths and schemes of its rows and heights cells, the heights widths it read. The release compares a measure's coverage with this, so a measure
 * cannot certify itself as a full run: it must stand on a sweep document that holds the evidence.
 * `declared` (the report's own `coverage`) only contributes the mode, the options the caller named and the carried flag.
 */
export function coverageFromReport(report) {
  const sign = (x) => x !== null && typeof x === 'object'
  const list = (x) => (Array.isArray(x) ? x : [])
  const uniq = (xs) => [...new Set(xs)]
  const declared = sign(report?.coverage) ? report.coverage : null
  const behaviour = sign(report?.behaviourRows) ? Object.values(report.behaviourRows).flatMap(list) : []
  const rows = [...list(report?.rows), ...list(report?.stateRows), ...behaviour, ...list(report?.heights?.cells)].filter(sign)
  const carriedByRun = sign(report?.run) && report.run.mode !== 'full'
  const carriedByChecks = list(report?.checks).some((c) => sign(c) && (c.carried || c.scoped || c.carriedGroups || c.carriedNotMeasured)) || (sign(report?.carried) && Object.keys(report.carried).length > 0)
  return {
    mode: declared?.mode === 'full' && !carriedByRun ? 'full' : 'scoped',
    explicit: declared ? list(declared.explicit) : ['(no coverage recorded)'],
    carried: Boolean(declared?.carried) || carriedByRun || carriedByChecks,
    checks: list(report?.checks).filter((c) => sign(c) && !c.carried && !c.scoped && typeof c.id === 'string').map((c) => c.id),
    routes: uniq(rows.map((r) => r.route).filter((x) => typeof x === 'string')),
    widths: uniq(list(report?.rows).map((r) => r?.width).filter((x) => Number.isInteger(x))).sort((a, b) => a - b),
    heightsWidths: uniq(list(report?.heights?.widths).filter((x) => Number.isInteger(x))).sort((a, b) => a - b),
    schemes: uniq(list(report?.rows).map((r) => r?.scheme).filter((x) => x === 'light' || x === 'dark')).sort()
  }
}
