// site-sweep-scope.mjs — the history of the sweeps of one dossier, and what a re-run measures.
//
// HISTORY. <run-root>/site-sweep-state.json (tracy-site-sweep-state/v2) holds, per site + source + dossier inputs (the pages, the
// switches and the selectors the dossier gives): the run records (each kept while the full run, the latest run, the log or a
// result still stands on it), the last full run, the latest run, and the EFFECTIVE result — per check the open groups, the accepted
// groups, what is owed unmeasured and the sweep.accept errors, each with the run that measured it. Only a run with no --only,
// --pages and --widths reads or writes it. site-sweep-publish.mjs writes it, together with the reports, as one transaction.
//
// A history is decoded against a closed schema (stateProblems): the fields of every record, the sets without a repeat, and the
// relations between them — the checks of the full run are the checks of the effective result, the latest run lies inside the full
// run, every cell lies inside what the full run measured for its check, every measured-by names a recorded run, the log is made of
// recorded runs and ends with the latest one, the exit is the exit of the checks. A history that is not that is refused, never read
// as a first run, never narrowed from.
//
// SCOPE. With a history, a run with no scope flag measures only what was unresolved: the checks, routes, widths and schemes of the
// open groups, of what was owed, and of the sweep.accept errors. A full run needs `--full --reason "<text>"`.
//
// MERGE. What a scoped run did not measure is CARRIED from the run that measured it and keeps its verdict: a carried open group, a
// carried owed case or a carried accept error fails the run as it did. A group open before whose every cell was measured again and
// is clean is FIXED. Pure functions, but for the state file.
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { CHECK_ORDER, causeOf, notDefectsForMeasure } from './site-sweep-judge.mjs'
import { BEHAVIOUR_ORDER } from './site-sweep-behaviour-judge.mjs'
import { validateFingerprint } from '../lib/source-fingerprint.mjs'

export const STATE_SCHEMA = 'tracy-site-sweep-state/v2'
export const STATE_FILE = 'site-sweep-state.json'
export const FULL_HINT = 'a full run needs --full --reason "<text>"'
const MAX_STATE_BYTES = 32 * 1024 * 1024
export const LOG_KEEP = 20
/** A group confirmed in an earlier run and absent now stays INTERMITTENT until it is absent from this many consecutive runs that measured every cell of it. */
export const INTERMITTENT_ABSENT = 2
const HEIGHTS = 'heights'
export const CHECKS = Object.freeze([...CHECK_ORDER, ...BEHAVIOUR_ORDER, HEIGHTS])
const ANCHORED = ['chips', 'fixed-widgets', 'icons', 'forms', 'text']
const THEME_WIDTHS = [390, 768, 1440]
const TOUCH_WIDTHS = [1024, 1180]
const DRAWER_WIDTHS = [390, 768]
const SCHEMES = ['light', 'dark']
const MODES = ['full', 'scoped']
const EXITS = [0, 1, 3]

/** The history cannot be read, is not a history, or cannot be published. */
export class HistoryError extends Error {}

const sha = (s) => createHash('sha256').update(s).digest('hex')
const uniq = (list) => [...new Set(list)]
const sorted = (list) => uniq(list).sort((a, b) => a - b)

// The identity names what is MEASURED. The sweep.accept rows are not part of it: they are re-judged against the evidence a history holds
// (rejudgeChecks), so editing one row never starts a history over. `v` marks this algorithm: a history entry keyed by an older one
// (which hashed the rows) can never be taken for the previous run of the same dossier.
const IDENTITY_VERSION = 'accept-free/1'

/** What a history belongs to: the two origins and the dossier inputs that decide what is measured. → { site, source, spec, key } */
export function identityOf({ site, source, plan, specDir = null }) {
  const hasNone = plan.pages.some((p) => p.referenceKind === 'none')
  const allNone = plan.pages.length > 0 && plan.pages.every((p) => p.referenceKind === 'none')
  const identitySource = allNone ? 'not-applicable:reference.kind=none' : source
  const noneBinding = hasNone && specDir ? ['reference.json', 'page-map.json'].map((name) => {
    try { return [name, sha(readFileSync(path.join(specDir, name)))] } catch { return [name, null] }
  }) : null
  const spec = sha(JSON.stringify({ v: hasNone ? `${IDENTITY_VERSION}+none/${plan.applicabilityVersion ?? 1}` : IDENTITY_VERSION, pages: plan.pages.map((p) => hasNone ? [p.id, p.path, p.pagemapPath, p.status, p.view, p.sourceRoute, p.sourceRendered, p.referenceKind] : [p.id, p.path, p.status, p.view, p.sourceRoute, p.sourceRendered]), ...(hasNone ? { noneBinding } : {}), hooks: plan.hooks, marks: plan.marks, selectors: plan.selectors, behaviour: plan.behaviour ?? {}, specDir: specDir ? path.resolve(specDir) : null }))
  return { site, source: identitySource, spec, key: keyOf({ site, source: identitySource, spec }) }
}
export const keyOf = ({ site, source, spec }) => sha(`${site}\n${source}\n${spec}`).slice(0, 24)

export const kindOf = (st) => (st.isSymbolicLink() ? 'symbolic link' : st.isDirectory() ? 'directory' : st.isFIFO() ? 'FIFO' : st.isSocket() ? 'socket' : 'special file')

/** lstat of a path that must be a regular file or absent: → the stat, or null when absent. Never follows a link, never opens. */
export function regularOrAbsent(file, what = 'the sweep history') {
  let st
  try {
    st = lstatSync(file)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw new HistoryError(`${what} ${file} cannot be read: ${e.message}`)
  }
  if (!st.isFile()) throw new HistoryError(`${what} ${file} is a ${kindOf(st)}, not a regular file: refused`)
  return st
}

// ---- the closed schema -----------------------------------------------------------------------------------------------------

const isList = Array.isArray
const isObject = (x) => x !== null && typeof x === 'object' && !isList(x)
const isStr = (x) => typeof x === 'string'
const isNum = (x) => typeof x === 'number' && Number.isFinite(x)
const isCount = (x) => Number.isInteger(x) && x >= 0
const nullable = (f) => (x) => x === null || f(x)
const maybe = (f) => (x) => x === undefined || f(x)
const listOf = (l, ok) => isList(l) && l.every(ok)
/** A list whose members are `ok` and none twice. */
const setOf = (l, ok) => listOf(l, ok) && new Set(l.map((x) => JSON.stringify(x))).size === l.length
/** An object with every key of `req`, the keys of `opt` when it has them, and no other key. */
const exact = (o, req, opt = []) => isObject(o) && req.every((k) => Object.hasOwn(o, k)) && Object.keys(o).every((k) => req.includes(k) || opt.includes(k))
const within = (list, of) => list.every((x) => of.includes(x))
const cellShape = (c) => isList(c) && c.length === 3 && nullable(isStr)(c[0]) && nullable(isNum)(c[1]) && nullable(isStr)(c[2])
const cellKey = (c) => c.join('\u0000')
const cellsShape = (l) => listOf(l, cellShape) && new Set(l.map(cellKey)).size === l.length

const anchorsOf = (widths) => (widths.length ? uniq([widths.includes(1440) ? 1440 : Math.max(...widths), widths.includes(390) ? 390 : Math.min(...widths)]) : [])
const themeWidthsOf = (widths) => (widths.some((w) => THEME_WIDTHS.includes(w)) ? THEME_WIDTHS.filter((w) => widths.includes(w)) : anchorsOf(widths))

/** The system scheme a cell was read in: `light`/`dark`, a state `os-dark/…`, else null (heights, touch, drawer: no scheme of their own). */
export const systemOf = (scheme) => (scheme === 'light' || scheme === 'dark' ? scheme : (/^os-(light|dark)\//.exec(scheme ?? '')?.[1] ?? null))

const THEME_STATE = /^os-(light|dark)\/(no-choice|saved-light|saved-dark)$/
const OLD_AUTO_STATE = /^os-(light|dark)\/old-auto-value$/

/**
 * Why a cell [route, width, scheme-or-state] of a check cannot be one the full run (`fullScope`) measured; null when it can. The
 * routes, the widths of the check (heights its own, the static checks the anchors, the rest the widths), and the schemes or states
 * the check reads.
 */
export function cellProblem(id, [route, width, scheme], fullScope) {
  if (route !== null && !fullScope.routes.includes(route)) return `route ${route} is not a route of the full run`
  let widths
  let reads = false
  if (id === HEIGHTS) {
    widths = fullScope.heightsWidths
    reads = scheme === null || SCHEMES.includes(scheme)
  } else if (id === 'scheme') {
    // the scheme states are read at one width of their own
    widths = fullScope.widths.length ? [fullScope.widths.includes(1440) ? 1440 : Math.max(...fullScope.widths)] : []
    reads = scheme === null || THEME_STATE.test(scheme)
  } else if (id === 'first-interaction') {
    const kind = scheme === 'touch' ? TOUCH_WIDTHS : scheme === 'drawer' ? DRAWER_WIDTHS : null
    widths = kind ? kind.filter((w) => fullScope.widths.includes(w)) : themeWidthsOf(fullScope.widths)
    reads = scheme === null || kind !== null || THEME_STATE.test(scheme) || OLD_AUTO_STATE.test(scheme)
  } else {
    widths = ANCHORED.includes(id) ? anchorsOf(fullScope.widths) : fullScope.widths
    reads = scheme === null || SCHEMES.includes(scheme)
  }
  if (!reads) return `scheme or state ${scheme} is not one ${id} reads`
  if (width !== null && !widths.includes(width)) return `width ${width} is not a width ${id} was measured at`
  const sys = systemOf(scheme)
  if (sys && !fullScope.schemes.includes(sys)) return `scheme ${scheme} is not a scheme of the full run`
  return null
}

/** Why a cell cannot be one a run measured, from the scope the run recorded (membership only: what the run derived from its scope is not recomputed). */
function runProblem(id, [route, width, scheme], scope) {
  if (!scope.checks.includes(id)) return `${id} is not a check of the run`
  if (route !== null && !scope.routes.includes(route)) return `route ${route} is not a route of the run`
  if (id !== 'scheme' && width !== null && !(id === HEIGHTS ? scope.heightsWidths : scope.widths).includes(width)) return `width ${width} is not a width of the run`
  const sys = systemOf(scheme)
  if (sys && !scope.schemes.includes(sys)) return `scheme ${scheme} is not a scheme of the run`
  return null
}

const measuredShape = (m) => exact(m, ['ranAt', 'out', 'mode']) && isStr(m.ranAt) && isStr(m.out) && MODES.includes(m.mode)
const scopeShape = (s) => exact(s, ['checks', 'routes', 'widths', 'heightsWidths', 'schemes']) && setOf(s.checks, (c) => CHECKS.includes(c)) && setOf(s.routes, isStr) && setOf(s.widths, isNum) && setOf(s.heightsWidths, isNum) && setOf(s.schemes, (x) => SCHEMES.includes(x))
const runShape = (r) => exact(r, ['ranAt', 'mode', 'reason', 'out', 'exit', 'wallMs', 'scope']) && isStr(r.ranAt) && MODES.includes(r.mode) && nullable(isStr)(r.reason) && isStr(r.out) && EXITS.includes(r.exit) && nullable(isNum)(r.wallMs) && scopeShape(r.scope)
const rowShape = (r) => r === null || (isObject(r) && [['routes', isStr], ['widths', isNum], ['schemes', isStr]].every(([k, f]) => r[k] === undefined || listOf(r[k], f)))
const exampleShape = (x) => exact(x, ['route', 'width', 'scheme', 'source', 'port'], ['delta']) && nullable(isStr)(x.route) && nullable(isNum)(x.width) && nullable(isStr)(x.scheme) && nullable(isStr)(x.source) && nullable(isStr)(x.port) && maybe(isNum)(x.delta)
const strings = (l) => listOf(l, isStr)
const numbers = (l) => listOf(l, isNum)
const groupShape = (g, extra = []) => exact(g, ['cause', 'what', 'occurrences', 'routes', 'widths', 'schemes', 'cells', 'examples', 'measured', 'evidence', ...extra], ['carriedCells']) && isStr(g.cause) && nullable(isStr)(g.what) && isCount(g.occurrences) && strings(g.routes) && numbers(g.widths) && strings(g.schemes) && cellsShape(g.cells) && g.cells.length > 0 && listOf(g.examples, exampleShape) && measuredShape(g.measured) && isStr(g.evidence) && maybe(isCount)(g.carriedCells)
const acceptedShape = (a) => exact(a, ['cause', 'what', 'kind', 'decision', 'evidence', 'occurrences', 'routes', 'widths', 'schemes', 'cells', 'measured'], ['notCovered', 'examples', 'groupEvidence', 'carriedCells']) && isStr(a.cause) && nullable(isStr)(a.what) && isStr(a.kind) && nullable(isStr)(a.decision) && nullable(isStr)(a.evidence) && isCount(a.occurrences) && strings(a.routes) && numbers(a.widths) && strings(a.schemes) && cellsShape(a.cells) && measuredShape(a.measured) && maybe(isCount)(a.notCovered) && maybe((x) => listOf(x, exampleShape))(a.examples) && maybe(isStr)(a.groupEvidence) && maybe(isCount)(a.carriedCells)
/** An open group that was confirmed before and is absent now: how many consecutive covering runs have not seen it. */
const intermittentShape = (g) => groupShape(g, ['absent']) && isCount(g.absent) && g.absent < INTERMITTENT_ABSENT
const debtShape = (d) => exact(d, ['route', 'width', 'scheme', 'cause', 'reason', 'measured'], ['causes']) && maybe(strings)(d.causes) && cellShape([d.route, d.width, d.scheme]) && isStr(d.cause) && isStr(d.reason) && measuredShape(d.measured)
const acceptErrorShape = (e) => exact(e, ['cause', 'message', 'row', 'cells', 'measured']) && nullable(isStr)(e.cause) && isStr(e.message) && rowShape(e.row) && cellsShape(e.cells) && e.cells.length > 0 && measuredShape(e.measured)
const outcomeShape = (x) => isObject(x) && isStr(x.check) && isStr(x.route) && ['pass', 'fail', 'not-measured', 'not-applicable'].includes(x.status) && (x.status !== 'not-applicable' || (x.check.startsWith('sweep-') && x.check.endsWith('-comparison') && x.reason === 'reference.kind=none'))
const checkShape = (c, id) => exact(c, ['id', 'measured', 'open', 'accepted', 'debt', 'acceptErrors'], ['title', 'cases', 'closed', 'intermittent', 'outcomes']) && maybe((l) => listOf(l, intermittentShape) && l.length > 0)(c.intermittent) && c.id === id && measuredShape(c.measured) && maybe(isStr)(c.title) && maybe(isCount)(c.cases) && listOf(c.open, (g) => groupShape(g)) && listOf(c.accepted, acceptedShape) && listOf(c.debt, debtShape) && listOf(c.acceptErrors, acceptErrorShape) && maybe((x) => listOf(x, debtShape))(c.closed) && maybe((x) => listOf(x, outcomeShape))(c.outcomes)

/** The exit code a set of checks stands for: an open group, an intermittent group or an accept error 1, something owed 3, else 0. */
export const exitOfChecks = (list) => (list.some((c) => c.open.length || c.acceptErrors.length || c.intermittent?.length) ? 1 : list.some((c) => c.debt.length) ? 3 : 0)

/** The refusals of one history entry (as stored): its fields, its sets and the relations between its runs, its log and its result. */
function entryProblems(e, key) {
  if (!exact(e, ['identity', 'revision', 'full', 'latest', 'runs', 'effective', 'log'], ['sourceFingerprint'])) return ['is not a history entry: its fields are not exactly identity, revision, full, latest, runs, effective and log (and a sourceFingerprint)']
  const out = []
  if (!exact(e.identity, ['site', 'source', 'spec']) || ['site', 'source', 'spec'].some((k) => !isStr(e.identity[k]))) out.push('has no identity (site, source, spec)')
  else if (keyOf(e.identity) !== key) out.push('its key is not the key of its identity')
  if (!Number.isInteger(e.revision) || e.revision < 1) out.push('has no revision')
  if (e.sourceFingerprint !== undefined) out.push(...validateFingerprint(e.sourceFingerprint).map((m) => `its sourceFingerprint: ${m}`))
  if (!isObject(e.runs) || !Object.keys(e.runs).length) return [...out, 'has no run records']
  let runsOk = true
  for (const [id, r] of Object.entries(e.runs))
    if (!runShape(r) || r.ranAt !== id) {
      out.push(`its run record ${JSON.stringify(id)} is not a whole run record named by its ranAt`)
      runsOk = false
    }
  if (!runsOk) return out
  const named = (id) => isStr(id) && Object.hasOwn(e.runs, id)
  if (!named(e.full) || !named(e.latest)) return [...out, 'its full or latest run is not one of its run records']
  const full = e.runs[e.full]
  const latest = e.runs[e.latest]
  const fs = full.scope
  const fullWhole = full.mode === 'full' && fs.checks.length && fs.routes.length && fs.widths.length && fs.heightsWidths.length && fs.schemes.length
  if (!fullWhole) out.push('its full run record is not a full run with its checks, routes, widths and schemes')
  else {
    const inside = (r) => within(r.scope.checks, fs.checks) && within(r.scope.routes, fs.routes) && within(r.scope.widths, fs.widths) && within(r.scope.heightsWidths, fs.heightsWidths) && within(r.scope.schemes, fs.schemes)
    if (latest.mode === 'full' ? e.latest !== e.full : latest.ranAt <= full.ranAt) out.push(latest.mode === 'full' ? 'its latest run is a full run that is not its full run' : 'its latest run is not later than its full run')
    // a run after the full run is a scoped run inside it; the log may still hold runs from before it
    for (const r of Object.values(e.runs))
      if (r.ranAt === full.ranAt ? r !== full : r.ranAt > full.ranAt && (r.mode !== 'scoped' || !inside(r))) out.push(`its run ${r.ranAt} is a run after the full run that is not a scoped run inside it`)
  }
  if (!setOf(e.log, isStr) || !e.log.length || e.log.length > LOG_KEEP || !e.log.every(named)) out.push('its log is not a list of its run records, at most 20, none twice')
  else if (e.log.at(-1) !== e.latest || e.log.some((id, i) => i && e.log[i - 1] >= id)) out.push('its log does not end with its latest run, in order')
  const ef = e.effective
  if (!exact(ef, ['exit', 'checks']) || !isObject(ef.checks) || !EXITS.includes(ef.exit)) return [...out, 'has no effective result']
  const ids = Object.keys(ef.checks)
  const bad = ids.filter((id) => !CHECKS.includes(id))
  if (bad.length) out.push(`its effective result holds a check that is not a sweep check: ${bad.join(', ')}`)
  const shaped = ids.filter((id) => CHECKS.includes(id) && !checkShape(ef.checks[id], id))
  if (shaped.length) out.push(...shaped.map((id) => `effective.checks.${id} is not a check record`))
  if (bad.length || shaped.length) return out
  if (fullWhole && (ids.length !== fs.checks.length || !within(ids, fs.checks))) out.push(`its effective result holds ${ids.length} check(s), the full run measured ${fs.checks.length}`)
  const list = Object.values(ef.checks)
  if (ef.exit !== exitOfChecks(list)) out.push(`its effective exit ${ef.exit} does not agree with its checks`)
  const referenced = new Set([e.full, e.latest, ...(isList(e.log) ? e.log : [])])
  const measured = (m, what, id) => {
    referenced.add(m.ranAt)
    const r = e.runs[m.ranAt]
    if (!r || r.out !== m.out || r.mode !== m.mode) out.push(`${what} was measured by a run that is not one of its run records`)
    else if (e.runs[e.full] && r.ranAt < e.full) out.push(`${what} was measured by a run before the full run`)
    else if (!r.scope.checks.includes(id)) out.push(`${what} was measured by a run that did not measure ${id}`)
    return r
  }
  for (const c of list) {
    measured(c.measured, `effective.checks.${c.id}`, c.id)
    // a record of the result: the run that measured it is recorded, and every cell it holds lies inside the full run
    const holds = (what, cells, m, exactly = false) => {
      const r = measured(m, `effective.checks.${c.id}.${what}`, c.id)
      for (const cell of cells) {
        // a debt or an accepted cell lies inside the run that measured it; a group may hold cells carried from earlier runs
        const why = (fullWhole ? cellProblem(c.id, cell, fs) : null) ?? (exactly && r ? runProblem(c.id, cell, r.scope) : null)
        if (why) out.push(`effective.checks.${c.id}.${what}: ${why}`)
      }
    }
    if (new Set(c.open.map((g) => g.cause)).size !== c.open.length) out.push(`effective.checks.${c.id} has two open groups of one cause`)
    if (new Set([...c.open, ...(c.intermittent ?? [])].map((g) => g.cause)).size !== c.open.length + (c.intermittent?.length ?? 0)) out.push(`effective.checks.${c.id} has an intermittent group of a cause that is open or listed twice`)
    for (const g of c.open) holds('open', g.cells, g.measured)
    for (const g of c.intermittent ?? []) holds('intermittent', g.cells, g.measured)
    // an accepted group that holds cells carried from earlier runs (carriedCells) lies inside the full run, not inside the run that measured the rest
    for (const a of c.accepted) holds('accepted', a.cells, a.measured, !a.carriedCells)
    for (const d of c.debt) holds('debt', [[d.route, d.width, d.scheme]], d.measured, true)
    for (const d of c.closed ?? []) holds('closed', [[d.route, d.width, d.scheme]], d.measured, true)
    for (const x of c.acceptErrors) holds('acceptErrors', x.cells, x.measured)
  }
  const stray = Object.keys(e.runs).filter((id) => !referenced.has(id))
  if (stray.length) out.push(`it holds run records nothing stands on: ${stray.slice(0, 3).join(', ')}`)
  return out
}

/** The refusals of a parsed state document; empty when it is a history this tool wrote. */
export function stateProblems(doc) {
  if (!isObject(doc)) return ['it is not a JSON object']
  if (doc.schema !== STATE_SCHEMA) return [`its schema is ${JSON.stringify(doc.schema ?? null)}, not ${STATE_SCHEMA}`]
  if (!exact(doc, ['schema', 'runs']) || !isObject(doc.runs)) return ['it has no `runs` object, or has fields besides schema and runs']
  if (!Object.keys(doc.runs).length) return ['it holds no history entry']
  return Object.entries(doc.runs).flatMap(([key, e]) => entryProblems(e, key).map((m) => `runs.${key}: ${m}`))
}

/** An entry as stored, with its full run, latest run and log as the run records they name. Only of an entry that stateProblems passed. */
export const resolveEntry = (e) => (e ? { ...e, full: e.runs[e.full], latest: e.runs[e.latest], log: e.log.map((id) => e.runs[id]) } : null)

/**
 * Read the history of a dossier. → { file, doc } where doc is null when there is none. An existing file that is not a regular
 * file, is empty, is not JSON, has another schema or another shape is refused (HistoryError): a damaged history is never a first run.
 */
export function readState(runRoot) {
  const file = path.join(runRoot, STATE_FILE)
  if (!regularOrAbsent(file)) return { file, doc: null }
  let text
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    const st = fstatSync(fd)
    if (!st.isFile()) throw new HistoryError(`the sweep history ${file} is a ${kindOf(st)}, not a regular file: refused`)
    if (st.size > MAX_STATE_BYTES) throw new HistoryError(`the sweep history ${file} is ${st.size} bytes: too large to be one`)
    text = readFileSync(fd, 'utf8')
  } catch (e) {
    if (e instanceof HistoryError) throw e
    throw new HistoryError(`the sweep history ${file} cannot be read: ${e.message}`)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  const away = `move ${file} away to start again with a full run`
  if (!text.trim()) throw new HistoryError(`the sweep history ${file} is empty; ${away}`)
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    throw new HistoryError(`the sweep history ${file} is not valid JSON (${e.message}); ${away}`)
  }
  const problems = stateProblems(doc)
  if (problems.length) throw new HistoryError(`the sweep history ${file} is not a ${STATE_SCHEMA} history: ${problems.slice(0, 3).join('; ')}; ${away}`)
  return { file, doc }
}

// ---- cells ----------------------------------------------------------------------------------------------------------------

const cellOf = (d) => [d.route ?? null, d.width ?? null, d.scheme ?? d.state ?? null]
const uniqCells = (cells) => [...new Map(cells.map((c) => [cellKey(c), c])).values()]
const spanOf = (cells) => ({ routes: uniq(cells.map((c) => c[0]).filter((x) => x != null)), widths: sorted(cells.map((c) => c[1]).filter((x) => x != null)), schemes: uniq(cells.map((c) => c[2]).filter(Boolean)) })
const clip = (v) => {
  const s = v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s != null && s.length > 200 ? `${s.slice(0, 199)}…` : s
}
/** The checks an owed entry belongs to. */
export const owedChecks = (o) => o.checks ?? (o.check ? [o.check] : [])

/**
 * Where a sweep.accept row in error is measured again: the routes it names that are routes of the full run, its widths and its
 * schemes that the full run measured for the check; a part of the row that names none of those (or names nothing) is every one.
 */
export function acceptCells(row, id, fullScope) {
  const keep = (list, at) => {
    const kept = (list ?? []).filter(at)
    return kept.length ? kept : [null]
  }
  const routes = keep(row?.routes, (r) => cellProblem(id, [r, null, null], fullScope) === null)
  const widths = keep(row?.widths, (w) => cellProblem(id, [null, w, null], fullScope) === null)
  const schemes = keep(row?.schemes, (s) => cellProblem(id, [null, null, s], fullScope) === null)
  return uniqCells(routes.flatMap((r) => widths.flatMap((w) => schemes.map((s) => [r, w, s]))))
}

const exampleOf = (d) => ({ route: d.route ?? null, width: d.width ?? null, scheme: d.scheme ?? d.state ?? null, source: clip(d.source), port: clip(d.port) })

/**
 * A file the sweep writes into the dossier, named relative to the dossier (forward slashes): the history and its evidence are in the
 * dossier, which is in a repository, so they carry no machine path (ja-fresco S-33). A file outside the dossier keeps its path.
 */
export function dossierPath(runRoot, file) {
  if (!runRoot || !file) return file
  const rel = path.relative(runRoot, file)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : rel === '' ? '.' : file
}

/** The dossier as a report names it: its path in the checkout that holds it, or its folder name outside one. */
export function dossierName(runRoot) {
  for (let dir = path.resolve(runRoot); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return path.relative(dir, path.resolve(runRoot)).split(path.sep).join('/') || '.'
    if (path.dirname(dir) === dir) return path.basename(path.resolve(runRoot))
  }
}

/**
 * The per-check records of a finished sweep report (as runSweep returns it): { id: { id, title, cases, measured, open, accepted,
 * debt, acceptErrors } }. `measured` = { ranAt, out, mode }; `acceptRows` are the dossier's sweep.accept rows (an error names its row);
 * `fullScope` is what the full run measured, the cells of a row in error are put inside it.
 */
export function recordsOf(report, { out, mode, acceptRows = [], fullScope, runRoot = null }) {
  const measured = { ranAt: report.ranAt, out: dossierPath(runRoot, out), mode }
  const records = {}
  for (const c of report.checks) {
    const rows = report.defects?.[c.id] ?? []
    const open = (report.groups?.[c.id] ?? []).map((g, i) => {
      const mine = rows.filter((d) => causeOf(d) === g.cause)
      // a group none of whose rows is kept stays open everywhere: the cell with no route, width or scheme
      const cells = uniqCells(mine.map(cellOf))
      return { cause: g.cause, what: g.what ?? null, occurrences: g.occurrences, routes: g.routes ?? [], widths: g.widths ?? [], schemes: g.schemes ?? [], cells: cells.length ? cells : [[null, null, null]], examples: (g.examples ?? [g.example]).slice(0, 3).map((d) => ({ route: d.route ?? null, width: d.width ?? null, scheme: d.scheme ?? d.state ?? null, source: clip(d.source), port: clip(d.port), ...(d.delta != null ? { delta: d.delta } : {}) })), measured, evidence: `site-sweep.json#groups.${c.id}[${i}]` }
    })
    const accepted = (report.accepted ?? [])
      .filter((a) => a.check === c.id)
      .map((a) => {
        const at = (report.accepted ?? []).indexOf(a)
        const cells = a.kind === 'not-measurable' ? [] : uniqCells((report.notDefectCases ?? []).filter((d) => d.check === c.id && d.accepted && d.acceptCause === a.cause).map(cellOf))
        return { cause: a.cause, what: a.what ?? null, kind: a.kind, decision: a.decision ?? null, evidence: a.evidence ?? null, occurrences: a.occurrences ?? 0, routes: a.routes ?? [], widths: a.widths ?? [], schemes: a.schemes ?? [], cells, ...(a.notCovered ? { notCovered: a.notCovered } : {}), ...(a.kind !== 'not-measurable' && a.example ? { examples: [exampleOf(a.example)], groupEvidence: `site-sweep.json#accepted[${at}]` } : {}), measured }
      })
    const debtOf = (n) => ({ route: n.route ?? null, width: n.width ?? null, scheme: n.scheme ?? n.state ?? null, cause: n.causes?.length ? n.causes.map((x) => x.cause).join('+') : (n.cause ?? 'not-measured'), ...(n.causes?.length ? { causes: n.causes.map((x) => x.cause) } : {}), reason: clip(n.why ?? n.detail ?? n.reason ?? ''), measured })
    // the cases a not-measurable row closed stay, apart from the debt, so that removing the row owes them again
    const closed = (report.closedNotMeasured?.[c.id] ?? []).map(debtOf)
    const debt = [
      ...(report.notMeasured?.[c.id] ?? []).map(debtOf),
      ...(report.owed ?? []).filter((o) => owedChecks(o).includes(c.id)).map((o) => ({ route: o.route ?? null, width: o.width ?? null, scheme: o.scheme ?? o.state ?? null, cause: 'owed', reason: clip(o.reason ?? ''), measured }))
    ]
    const acceptErrors = (report.acceptErrors ?? []).filter((e) => e.check === c.id).map((e) => ({ cause: e.cause ?? null, message: e.message, row: acceptRows[e.row] ?? null, cells: acceptCells(acceptRows[e.row], c.id, fullScope), measured }))
    const outcomes = (report.applicability?.outcomes ?? []).filter((x) => x.check === c.id || x.check === `sweep-${c.id}-comparison`)
    records[c.id] = { id: c.id, title: c.title, cases: c.cases, measured, open, accepted, debt, acceptErrors, ...(outcomes.length ? { outcomes } : {}), ...(closed.length ? { closed } : {}) }
  }
  return records
}

// ---- the scope of a re-run -------------------------------------------------------------------------------------------------


/** What the full run of a history measured, as the options of a scoped run need it. */
export function fullCoverage(full, pages) {
  const widths = full.scope.widths
  return { checks: full.scope.checks, routes: pages, widths, heightsWidths: full.scope.heightsWidths, schemes: full.scope.schemes, anchorWidths: anchorsOf(widths), schemeWidth: widths.length ? (widths.includes(1440) ? 1440 : Math.max(...widths)) : null, themeWidths: themeWidthsOf(widths), homePath: pages.includes('/') ? '/' : (pages[0] ?? null) }
}

/**
 * What a re-run measures: the checks, routes, widths and schemes of everything unresolved in `entry.effective` — open groups, owed
 * cases, sweep.accept errors. `schemes` are the schemes the caller allows (--schemes, or the default); a cell in another scheme is
 * not measured and stays carried (`excluded` counts them). `pages` are the dossier's routes, in order.
 * → { empty, checks, routes, widths, heightsWidths, schemes, anchorWidths, schemeWidth, themeWidths, homePath, excluded }
 */
export function scopeOf(entry, { schemes, pages }) {
  if (JSON.stringify(entry.full.scope.routes) !== JSON.stringify(pages)) throw new HistoryError('the routes of the full run in the sweep history are not the routes of this dossier: the history is not of this dossier')
  const cover = fullCoverage(entry.full, pages)
  const fallback = cover.schemes.includes('light') ? 'light' : cover.schemes[0]
  const want = { checks: new Set(), routes: new Set(), widths: new Set(), heightsWidths: new Set(), schemes: new Set() }
  let excluded = 0
  for (const id of cover.checks) {
    const c = entry.effective.checks[id]
    if (!c) continue
    const cells = [
      ...c.open.flatMap((g) => g.cells),
      // a group confirmed before and absent since is measured again until it has stayed absent long enough
      ...(c.intermittent ?? []).flatMap((g) => g.cells),
      ...c.debt.map(cellOf),
      // a sweep.accept row in error is measured where it says it applies (its cells, put inside the full run when it was recorded)
      ...c.acceptErrors.flatMap((e) => e.cells)
    ]
    for (const [route, width, scheme] of cells) {
      const sys = systemOf(scheme)
      // heights, a touch or a drawer case are read in one scheme; anything else without a scheme (an unreachable route) is owed in all of them
      const needs = sys ? [sys] : id === HEIGHTS || scheme != null ? [fallback] : cover.schemes
      const can = needs.filter((s) => schemes.includes(s))
      if (!can.length) {
        excluded++
        continue
      }
      want.checks.add(id)
      for (const s of can) want.schemes.add(s)
      for (const r of route == null ? pages : [route]) want.routes.add(r)
      if (id === 'first-interaction' && cover.homePath) want.routes.add(cover.homePath)
      if (id === HEIGHTS) for (const w of width == null ? cover.heightsWidths : [width]) want.heightsWidths.add(w)
      // the scheme states are read at one width of their own
      else if (id !== 'scheme') for (const w of width == null ? (ANCHORED.includes(id) ? cover.anchorWidths : cover.widths) : [width]) want.widths.add(w)
    }
  }
  const widths = sorted([...want.widths])
  return {
    empty: want.checks.size === 0,
    checks: cover.checks.filter((c) => want.checks.has(c)),
    routes: pages.filter((r) => want.routes.has(r)),
    widths,
    heightsWidths: sorted([...want.heightsWidths]),
    schemes: schemes.filter((s) => want.schemes.has(s)),
    anchorWidths: cover.anchorWidths.filter((w) => widths.includes(w)),
    schemeWidth: cover.schemeWidth,
    themeWidths: cover.themeWidths.filter((w) => widths.includes(w)),
    homePath: cover.homePath,
    excluded
  }
}

/** Whether a scoped run with `scope` measured a cell of a check. `pages` and `fullSchemes` are what the full run measured. */
export function coversOf(scope, { pages, fullSchemes }) {
  const allRoutes = pages.every((r) => scope.routes.includes(r))
  const widthsOf = (id) => (id === HEIGHTS ? scope.heightsWidths : ANCHORED.includes(id) ? scope.anchorWidths : scope.widths)
  return (id, [route, width, scheme]) => {
    if (!scope.checks.includes(id)) return false
    if (route == null ? !allRoutes : !scope.routes.includes(route)) return false
    if (id !== 'scheme' && width != null && !widthsOf(id).includes(width)) return false
    const sys = systemOf(scheme)
    if (sys) return scope.schemes.includes(sys)
    // every scheme of the full run when the cell names none (an unreachable route), one for a case without a scheme of its own
    return id === HEIGHTS || scheme != null ? scope.schemes.length > 0 : fullSchemes.every((s) => scope.schemes.includes(s))
  }
}

const hits = (d, [route, width, scheme]) => (d.route == null || d.route === route) && (d.width == null || width == null || d.width === width) && (d.scheme == null || scheme == null || d.scheme === scheme)
const sameRow = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The effective result after a run. `prev` is the effective checks of the history (null on a first run), `fresh` recordsOf this run,
 * `covers(id, cell)` whether this run measured a cell (a full run: always), `acceptRows` the dossier's rows now. With `fullScope` (what the full
 * run measured) a scoped result is judged AGAIN as a whole by the rows: what the run and the history each held alone may not be what they are together
 * (two cases of one cause, one carried and one new, against a not-measurable row that records one).
 * → { checks, fixed: {id: [cause]}, carried: {id: {whole, open, cells, debt, acceptErrors, accepted}} }
 *   whole: the check was not measured at all; open: groups carried whole; cells: {cause: [cell]} of a group measured in part.
 */
export function mergeRun({ prev, fresh, covers, full, acceptRows = [], order = [], fullScope = null }) {
  const checks = {}
  const fixed = {}
  const carried = {}
  const ids = uniq([...order, ...Object.keys(prev ?? {}), ...Object.keys(fresh)]).filter((id) => fresh[id] || (!full && prev?.[id]))
  for (const id of ids) {
    const f = fresh[id]
    const p = prev?.[id]
    if (!f) {
      checks[id] = p
      carried[id] = { whole: true, open: p.open, cells: {}, debt: p.debt, acceptErrors: p.acceptErrors, accepted: p.accepted }
      continue
    }
    if (!p) {
      checks[id] = f
      continue
    }
    // a cell this run READ: covered, and not owed by it — neither as a case still not measured nor as one a not-measurable row closed
    const owedNow = (cell) => f.debt.some((d) => hits(d, cell)) || (f.closed ?? []).some((d) => hits(d, cell))
    const unmeasured = (cell) => !covers(id, cell) || owedNow(cell)
    // an earlier owed case (open or closed by a row) is replaced only by a run that READ its cell, or that owes the very same case again
    const sameCase = (a, b) => a.cause === b.cause && cellKey(cellOf(a)) === cellKey(cellOf(b))
    const supersededBy = (d) => f.debt.some((x) => sameCase(x, d)) || (f.closed ?? []).some((x) => sameCase(x, d))
    const stays = (d) => unmeasured(cellOf(d)) && !supersededBy(d)
    const open = f.open.map((g) => ({ ...g }))
    const kept = { whole: false, open: [], cells: {}, origin: {}, debt: [], acceptErrors: [], accepted: [] }
    const gone = []
    const inter = []
    // owed counts as the cell not read, a case a not-measurable row closed included: neither is an absence
    const blocked = (g) => g.cells.some(owedNow)
    // the cells of an earlier group this run did not measure successfully — a full run included: a cell that timed out or is owed is not a clean cell
    const owedCells = (g) => g.cells.filter(unmeasured)
    // the group without the cells this run's acceptance of the same cause covers; null when it covers them all
    const unaccepted = (g) => {
      const taken = f.accepted.filter((a) => a.cause === g.cause).flatMap((a) => a.cells)
      if (!taken.length) return g
      const cells = g.cells.filter((c) => !taken.some((t) => cellKey(t) === cellKey(c)))
      if (!cells.length) return null
      return cells.length === g.cells.length ? g : { ...g, cells, ...spanOf(cells), occurrences: cells.length }
    }
    for (const g of p.open) {
      const left = full ? [] : g.cells.filter(unmeasured)
      const now = open.find((x) => x.cause === g.cause)
      // a cause this run's rows accept in part is judged by cell: every cell of the group they do not name stays pending — the ones this run read
      // clean included, which have been absent once and owe their second covering absence — whatever else of the group is owed or open again
      const split = f.accepted.some((a) => a.cause === g.cause)
      const pend = split ? unaccepted(g)?.cells ?? [] : []
      if (now) {
        const extra = uniqCells([...pend, ...owedCells(g)]).filter((c) => !now.cells.some((x) => cellKey(x) === cellKey(c)))
        if (extra.length) {
          now.cells = [...now.cells, ...extra]
          Object.assign(now, spanOf(now.cells), { occurrences: now.occurrences + extra.length, carriedCells: extra.length })
          kept.cells[g.cause] = extra
          kept.origin[g.cause] = { measured: g.measured, evidence: g.evidence, examples: g.examples }
        }
      } else if (left.length) {
        const cells = split ? uniqCells([...pend, ...left]) : left
        const part = { ...g, cells, ...spanOf(cells), occurrences: cells.length }
        open.push(part)
        kept.open.push(part)
      } else {
        // confirmed before, absent now, every cell measured again: not fixed yet — it may be flaky. A measurement error over its cells does not count as an absence.
        // A row of this run accepts only the cells it names: the cells of the group it does not name are still pending, not dropped.
        const pending = unaccepted(g)
        if (pending) inter.push({ ...pending, absent: blocked(pending) ? 0 : 1 })
      }
    }
    for (const earlier of p.intermittent ?? []) {
      const g = unaccepted(earlier)
      if (!g) continue
      const back = open.find((x) => x.cause === g.cause)
      if (back) {
        // it came back: open again, the count restarts — and the cells of it this run did not measure stay owed, as for any open group
        const left = owedCells(g).filter((c) => !back.cells.some((x) => cellKey(x) === cellKey(c)))
        if (left.length) {
          back.cells = [...back.cells, ...left]
          Object.assign(back, spanOf(back.cells), { occurrences: back.occurrences + left.length, carriedCells: (back.carriedCells ?? 0) + left.length })
          kept.cells[g.cause] = [...(kept.cells[g.cause] ?? []), ...left]
        }
        continue
      }
      if (!full && g.cells.some(unmeasured)) {
        // not every cell of it was measured: the count does not move
        inter.push(g)
        kept.intermittent = [...(kept.intermittent ?? []), g]
      } else if (blocked(g)) inter.push(g)
      else if (g.absent + 1 >= INTERMITTENT_ABSENT) gone.push(g.cause)
      else inter.push({ ...g, absent: g.absent + 1 })
    }
    if (!full) {
      kept.debt = p.debt.filter(stays)
      // an error of a row is settled by a run only when the row is gone or matched its group; a scoped run cannot say a row is not stale
      kept.acceptErrors = p.acceptErrors.filter((e) => e.row && acceptRows.some((r) => sameRow(r, e.row)) && !f.acceptErrors.some((x) => sameRow(x.row, e.row)) && !f.accepted.some((a) => a.cause === e.cause))
      // an accepted group keeps the cells this run did not measure again, whatever else this run found of the same cause: the cells it measured are
      // judged by this run, the others stay as they were (a row removed later owes them again)
      kept.accepted = p.accepted.flatMap((a) => {
        if (a.kind === 'not-measurable') return f.accepted.some((x) => x.cause === a.cause) ? [] : [a]
        // a cell is measured again only when the run covered it and read it: a case it owes (f.debt) leaves the accepted cell as it was
        const cells = a.cells.filter((c) => unmeasured(c))
        if (!cells.length) return []
        if (cells.length === a.cells.length) return [a]
        const { notCovered: _n, carriedCells: _c, ...rest } = a
        return [{ ...rest, cells, occurrences: cells.length, ...spanOf(cells) }]
      })
    }
    // the cases a not-measurable row closed: this run's, and the earlier ones this run did not measure again
    const closed = [...(f.closed ?? []), ...(full ? [] : (p.closed ?? []).filter(stays))]
    const { closed: _own, ...rest } = f
    checks[id] = { ...rest, open, accepted: [...f.accepted, ...kept.accepted], debt: [...f.debt, ...kept.debt], acceptErrors: [...f.acceptErrors, ...kept.acceptErrors], ...(f.outcomes ? { outcomes: f.outcomes } : {}), ...(closed.length ? { closed } : {}), ...(inter.length ? { intermittent: inter } : {}) }
    if (gone.length) fixed[id] = gone
    if (kept.intermittent?.length || kept.open.length || Object.keys(kept.cells).length || kept.debt.length || kept.acceptErrors.length || kept.accepted.length) carried[id] = kept
  }
  return { checks: !full && fullScope ? rejudgeChecks(checks, acceptRows, { fullScope }) : checks, fixed, carried }
}

// ---- the sweep.accept rows against the evidence a history holds -----------------------------------------------------------

const uniqBy = (list, f) => [...new Map(list.map((x) => [f(x), x])).values()]
const cellId = (c) => cellKey(c)
/** A cell of one group: two groups of one check may be on the same cell, and each is matched on its own. */
const claim = (cause, cell) => `${cause}\u0001${cellId(cell)}`
/** The causes of a not-measured case: a chips case lists several, every other check names one. */
const causesOfDebt = (d) => d.causes ?? [d.cause]
const cellWhere = ([route, width]) => `${route}${width != null ? ` @${width}` : ''}`

/**
 * Judge the sweep.accept `rows` again against the effective checks of a history, without a browser. The evidence is kept neutral: an
 * accepted group still holds its cells and examples, a not-measured case a row closed is kept apart from the debt. So a row added
 * moves the cells it covers out of the open groups, a row removed or narrowed owes them again, and a row that no longer matches a
 * group (or names what the group does not have, or covers a cell another row covers) is an accept error, as in a full run.
 * `fullScope` is what the full run measured. A check no row names is returned as it is but for the errors of rows that are gone.
 * Never changes `checks`. → the checks, as stored.
 */
export function rejudgeChecks(checks, rows, { fullScope }) {
  return Object.fromEntries(Object.entries(checks).map(([id, rec]) => [id, rejudgeCheck(rec, id, rows ?? [], fullScope)]))
}

function rejudgeCheck(rec, id, rows, fullScope) {
  const mine = rows.map((row, n) => ({ row, n })).filter((x) => x.row?.check === id)
  const errors = []
  const fail = ({ row, n }, message) => errors.push({ cause: row.cause, message: `sweep.accept[${n}] ${row.check} "${row.cause}": ${message}`, row, cells: acceptCells(row, id, fullScope), measured: rec.measured })
  // ---- the defect groups: the open ones and the accepted ones are one pool, a group per cause
  const units = [
    ...rec.open.map((g) => ({ g, open: true })),
    ...rec.accepted.filter((a) => a.kind !== 'not-measurable').map((a) => ({ open: false, g: { cause: a.cause, what: a.what, occurrences: a.occurrences, cells: a.cells, examples: a.examples ?? [], measured: a.measured, evidence: a.groupEvidence ?? `site-sweep.json#accepted.${id}`, carriedCells: a.carriedCells } }))
  ]
  const pools = new Map()
  for (const u of units) pools.set(u.g.cause, [...(pools.get(u.g.cause) ?? []), u])
  const groups = new Map()
  for (const [cause, list] of pools) {
    const main = list.reduce((a, b) => (b.g.measured.ranAt > a.g.measured.ranAt || (b.g.measured.ranAt === a.g.measured.ranAt && b.open && !a.open) ? b : a))
    const cells = new Map()
    for (const u of list) for (const c of u.g.cells) if (!cells.has(cellId(c))) cells.set(cellId(c), { cell: c, older: u.g.measured.ranAt !== main.g.measured.ranAt })
    const extra = list.reduce((n, u) => n + (u.g.carriedCells ?? 0), 0)
    groups.set(cause, { list, main: main.g, cells: [...cells.values()], extra, occurrences: list.reduce((n, u) => n + u.g.occurrences, 0), what: main.g.what ?? list.find((u) => u.g.what)?.g.what ?? null, examples: uniqBy([...main.g.examples, ...list.filter((u) => u.g !== main.g).flatMap((u) => u.g.examples)], (x) => JSON.stringify(x)).slice(0, 3) })
  }
  const claimed = new Map()
  const covers = []
  const nm = []
  for (const x of mine) {
    const { row, n } = x
    if (row.kind === 'not-measurable') {
      nm.push(x)
      continue
    }
    if (!row.routes.some((r) => fullScope.routes.includes(r))) continue
    if (row.widths && !row.widths.some((w) => fullScope.widths.includes(w))) continue
    const group = groups.get(row.cause)
    if (!group) {
      const known = [...groups.keys()].slice(0, 5)
      fail(x, `matches no defect group in this run — a stale exception (the fault is gone, or the cause key changed)${known.length ? `; the groups of ${row.check} are: ${known.map((k) => `"${k}"`).join(', ')}` : `; ${row.check} has no defect group`}`)
      continue
    }
    const inRow = ([route, width, scheme]) => row.routes.includes(route) && (!row.widths || row.widths.includes(width)) && (!row.schemes || row.schemes.includes(scheme))
    const covered = group.cells.filter((c) => inRow(c.cell))
    const over = []
    for (const r of row.routes) if (fullScope.routes.includes(r) && !covered.some((c) => c.cell[0] === r)) over.push(`route ${r}`)
    for (const w of row.widths ?? []) if (fullScope.widths.includes(w) && !covered.some((c) => c.cell[1] === w)) over.push(`width ${w}`)
    for (const v of row.schemes ?? []) if (!covered.some((c) => c.cell[2] === v)) over.push(`scheme ${v}`)
    if (over.length) {
      fail(x, `names ${over.join(', ')} where the group does not occur — a row covers only what it was measured on`)
      continue
    }
    const twice = covered.find((c) => claimed.has(claim(row.cause, c.cell)))
    if (twice) {
      fail(x, `a defect row (${cellWhere(twice.cell)}) is also covered by sweep.accept[${claimed.get(claim(row.cause, twice.cell))}]: a group is matched to at most one row`)
      continue
    }
    for (const c of covered) claimed.set(claim(row.cause, c.cell), n)
    covers.push({ ...x, group, covered })
  }
  const open = []
  const accepted = []
  const part = (group, cells) => {
    const older = cells.filter((c) => c.older).length
    const carried = Math.min(cells.length, older + group.extra)
    const all = cells.length === group.cells.length
    return { cells: cells.map((c) => c.cell), occurrences: all ? group.occurrences : cells.length, carried }
  }
  for (const [cause, group] of groups) {
    const left = group.cells.filter((c) => !claimed.has(claim(cause, c.cell)))
    if (!left.length) continue
    if (group.list.length === 1 && group.list[0].open && left.length === group.cells.length) {
      open.push(group.list[0].g)
      continue
    }
    const p = part(group, left)
    open.push({ cause, what: group.what, occurrences: p.occurrences, ...spanOf(p.cells), cells: p.cells, examples: group.examples, measured: group.main.measured, evidence: group.main.evidence, ...(p.carried ? { carriedCells: p.carried } : {}) })
  }
  const entries = covers.map((c) => {
    const p = part(c.group, c.covered)
    const left = c.group.cells.length - c.covered.length
    return { n: c.n, entry: { cause: c.row.cause, what: c.group.what, kind: c.row.kind, decision: c.row.decision ?? null, evidence: c.row.evidence ?? null, occurrences: p.occurrences, ...spanOf(p.cells), cells: p.cells, measured: c.group.main.measured, ...(left ? { notCovered: left } : {}), ...(c.group.main.examples.length || c.group.examples.length ? { examples: c.group.examples, groupEvidence: c.group.main.evidence } : {}), ...(p.carried ? { carriedCells: p.carried } : {}) } }
  })
  // ---- the not-measured cases: the debt and the cases a row closed are one pool; a case is closed when every cause of it is recorded
  const pool = [...rec.debt, ...(rec.closed ?? [])]
  const recorded = new Map()
  for (const x of nm) {
    const { row } = x
    if (recorded.has(row.cause)) {
      fail(x, 'the cause is recorded by another not-measurable row: one row per cause')
      continue
    }
    const items = pool.filter((d) => causesOfDebt(d).includes(row.cause))
    if (!items.length) {
      const known = [...new Set(pool.flatMap((d) => causesOfDebt(d)))].slice(0, 5)
      fail(x, `matches no not-measured cause in this run — a stale row (the cause is gone, or its key changed)${known.length ? `; the not-measured causes of ${row.check} are: ${known.map((k) => `"${k}"`).join(', ')}` : `; ${row.check} has nothing not measured`}`)
      continue
    }
    if (items.length > row.cases) {
      fail(x, `${items.length} case(s) of this cause are not measured, the row records ${row.cases}: the cause grew beyond what the hand measurement covers`)
      continue
    }
    recorded.set(row.cause, { ...x, items })
  }
  const shut = pool.filter((d) => causesOfDebt(d).every((c) => recorded.has(c)))
  for (const { n, row, items } of recorded.values())
    entries.push({ n, entry: { cause: row.cause, what: `not measured: ${row.cause}`, kind: row.kind, decision: null, evidence: row.evidence ?? null, occurrences: items.length, ...spanOf(items.map(cellOf)), cells: [], measured: rec.measured } })
  accepted.push(...entries.sort((a, b) => a.n - b.n).map((x) => x.entry))
  const { closed: _was, ...rest } = rec
  return { ...rest, open, accepted, debt: pool.filter((d) => !shut.includes(d)), acceptErrors: errors, ...(shut.length ? { closed: shut } : {}) }
}

/** Exit code of an effective result: 1 an open group or an accept error, else 3 something owed, else 0 — never below the run's own. */
export function effectiveExit(checks, ownExit = 0) {
  const list = Object.values(checks)
  if (ownExit === 1 || list.some((c) => c.open.length || c.acceptErrors.length || c.intermittent?.length)) return 1
  if (ownExit === 3 || list.some((c) => c.debt.length)) return 3
  return ownExit
}

/**
 * The lists of a report from the merged, re-judged evidence (changed in place): the accepted groups, the accept errors, the not-measured
 * cases (and the owed ones, and those a not-measurable row closed) and the not-defect rows of every check of `merged`, the same evidence
 * the counters and the exit code stand on. What the run itself saw and the merge does not judge (a source that is not the page's
 * counterpart, a header difference its missing picture explains) stays as the run measured it.
 */
function listsFromMerged(report, merged, acceptRows) {
  const recs = Object.entries(merged.checks)
  const rowOf = (a, id) => acceptRows.find((r) => r.check === id && r.cause === a.cause && r.kind === a.kind)
  const accepted = recs.flatMap(([id, rec]) =>
    rec.accepted.map((a) => {
      const row = a.kind === 'not-measurable' ? rowOf(a, id) : null
      const { cells: _c, examples, groupEvidence: _g, carriedCells: _cc, measured, ...rest } = a
      return { check: id, ...rest, ...(examples?.find((e) => a.cells.some((x) => cellKey(x) === cellKey(cellOf(e)))) ? { example: examples.find((e) => a.cells.some((x) => cellKey(x) === cellKey(cellOf(e)))) } : {}), ...(row ? { reason: row.reason, measurement: row.measurement, recordedCases: row.cases } : {}), measured }
    })
  )
  const acceptErrors = recs.flatMap(([id, rec]) => rec.acceptErrors.map((e) => ({ check: id, cause: e.cause, message: e.message, row: e.row ? acceptRows.findIndex((r) => sameRow(r, e.row)) : -1, measured: e.measured })))
  const notMeasured = {}
  const closedNotMeasured = {}
  const owed = new Map()
  const causeKey = (n) => (n.causes?.length ? n.causes.map((x) => x.cause ?? x).join('+') : (n.cause ?? 'not-measured'))
  // a case as the run measured it when the run has it (why, detail, the chips of each cause), else as the history keeps it
  const rawOf = (id, d) =>
    (report.notMeasured?.[id] ?? []).find((n) => causeKey(n) === d.cause && n.route === d.route && (n.width ?? null) === d.width && (n.scheme ?? n.state ?? null) === d.scheme) ??
    { route: d.route, width: d.width, scheme: d.scheme, cause: d.cause, ...(d.causes?.length ? { causes: d.causes.map((cause) => ({ cause, chips: null, why: d.reason, detail: [d.reason] })) } : {}), why: d.reason, detail: d.reason, measured: d.measured }
  // a case the history holds (not this run's own) carries the run that measured it; a cause of such cases only is `carriedFrom` that run
  const older = (n) => n.measured && n.measured.ranAt !== report.ranAt
  const finish = (x, n) => {
    if (x.chips == null) delete x.chips
    if (x.older === n && n > 0) x.carriedFrom = x.from
    delete x.older
    delete x.from
  }
  const where = (n) => `${n.route}${n.width != null ? ` @${n.width}` : ''}${n.scheme ?? n.state ? ` ${n.scheme ?? n.state}` : ''}`
  const tables = {}
  for (const [id, rec] of recs) {
    notMeasured[id] = rec.debt.filter((d) => d.cause !== 'owed').map((d) => rawOf(id, d))
    if (rec.closed?.length) closedNotMeasured[id] = rec.closed
    // the cause tables of a check count the cases a not-measurable row closed too, marked as recorded
    const cases = [...notMeasured[id], ...(rec.closed ?? []).map((d) => rawOf(id, d))]
    if (id === 'chips') {
      const t = {}
      for (const n of cases)
        for (const c of n.causes?.length ? n.causes : [{ cause: n.cause, chips: null, why: n.why, detail: [n.detail] }]) {
          const x = t[c.cause] ?? (t[c.cause] = { chips: 0, pages: 0, older: 0, why: c.why, example: `${where(n)}: ${c.detail?.[0] ?? ''}`, from: n.measured?.ranAt })
          x.pages++
          if (older(n)) x.older++
          x.chips = x.chips != null && typeof c.chips === 'number' ? x.chips + c.chips : null
        }
      for (const x of Object.values(t)) finish(x, x.pages)
      tables[id] = { notMeasuredCauses: t }
    } else if (BEHAVIOUR_ORDER.includes(id)) {
      const t = {}
      for (const n of cases) t[n.cause] = { cases: (t[n.cause]?.cases ?? 0) + 1, older: (t[n.cause]?.older ?? 0) + (older(n) ? 1 : 0), why: n.why, example: t[n.cause]?.example ?? `${where(n)}: ${n.detail ?? ''}`, from: t[n.cause]?.from ?? n.measured?.ranAt }
      for (const x of Object.values(t)) finish(x, x.cases)
      tables[id] = { behaviourCauses: t }
    }
    for (const d of rec.debt.filter((x) => x.cause === 'owed')) {
      const key = `${d.route}|${d.width}|${d.scheme}|${d.reason}`
      const o = owed.get(key) ?? { route: d.route, width: d.width, scheme: d.scheme, reason: d.reason, checks: [], measured: d.measured }
      o.checks.push(id)
      owed.set(key, o)
    }
  }
  // the defect groups. Every cell of a merged open group is either measured by this run (a row of this run lies on it) or the history's, and the
  // history's cells keep the run, the evidence and the examples of the record they come from (an open group, the cells carried into one, or an
  // accepted group a row no longer covers). A group with rows of this run is a group of this report, its history's cells counted in `carriedCells`
  // and named in `carriedFrom`; one with none is carried whole, one entry per record its cells come from. No row or example is made up.
  const groups = {}
  const defects = {}
  const carriedOpen = {}
  for (const [id, rec] of recs) {
    const rawGroups = report.groups?.[id] ?? []
    const rawRows = report.defects?.[id] ?? []
    const before = merged.carried[id]
    const originOf = (g, cell) => {
      const k = cellKey(cell)
      const has = (cells) => (cells ?? []).some((c) => cellKey(c) === k)
      const extra = before?.origin?.[g.cause]
      if (extra && has(before.cells?.[g.cause])) return extra
      const o = (before?.open ?? []).find((x) => x.cause === g.cause && has(x.cells))
      if (o) return { measured: o.measured, evidence: o.evidence, examples: o.examples }
      const a = (before?.accepted ?? []).find((x) => x.cause === g.cause && has(x.cells))
      if (a) return { measured: a.measured, evidence: a.groupEvidence ?? null, examples: a.examples ?? [] }
      return { measured: g.measured, evidence: g.evidence, examples: g.examples }
    }
    const partsOf = (g, cells) => {
      const by = new Map()
      for (const c of cells) {
        const o = originOf(g, c)
        const k = `${o.measured.ranAt}|${o.measured.out}|${o.evidence}`
        by.set(k, { o, cells: [...(by.get(k)?.cells ?? []), c] })
      }
      return [...by.values()]
    }
    groups[id] = []
    defects[id] = []
    carriedOpen[id] = []
    for (const g of rec.open) {
      const keys = new Set(g.cells.map(cellKey))
      const mine = rawRows.filter((d) => causeOf(d) === g.cause && keys.has(cellKey(cellOf(d))))
      const own = rawGroups.find((x) => x.cause === g.cause)
      const measuredKeys = new Set(mine.map((d) => cellKey(cellOf(d))))
      const history = g.cells.filter((c) => !(own && measuredKeys.has(cellKey(c))))
      const parts = partsOf(g, history)
      if (own && mine.length) {
        defects[id].push(...mine)
        const onCells = (own.examples ?? []).filter((e) => keys.has(cellKey(cellOf(e))))
        groups[id].push({ ...own, occurrences: g.occurrences, routes: g.routes, widths: g.widths, schemes: g.schemes, example: mine[0], examples: onCells.length ? onCells : [mine[0]], ...(history.length ? { carriedCells: history.length, carriedFrom: parts.map((p) => ({ ranAt: p.o.measured.ranAt, out: p.o.measured.out, cells: p.cells.length })) } : {}) })
        continue
      }
      // no row of this run: carried whole, ONE group for the cause as the merged evidence holds it, the records its cells come from named in `parts`
      const latest = parts.reduce((x, y) => (y.o.measured.ranAt > x.o.measured.ranAt ? y : x))
      const examples = parts.flatMap((p) => (p.o.examples ?? []).filter((e) => p.cells.some((c) => cellKey(c) === cellKey(cellOf(e))))).slice(0, 3)
      carriedOpen[id].push({ ...g, measured: latest.o.measured, evidence: latest.o.evidence, examples, parts: parts.map((p) => ({ ranAt: p.o.measured.ranAt, out: p.o.measured.out, cells: p.cells.length })) })
    }
    groups[id].sort((a, b) => b.routes.length - a.routes.length || b.occurrences - a.occurrences)
  }
  const acceptedCauses = new Set(accepted.map((a) => `${a.check}|${a.cause}`))
  const notDefectCases = (report.notDefectCases ?? []).filter((d) => !d.accepted || acceptedCauses.has(`${d.check}|${d.acceptCause}`))
  const own = notDefectsForMeasure(notDefectCases.filter((d) => !d.accepted))
  const listed = accepted.flatMap((a) => {
    if (a.kind === 'not-measurable') return [{ what: `${a.check}: ${a.cause} not measurable by the tool, ${a.occurrences} case(s) (recorded ${a.recordedCases})`, why: `${a.reason} — measured by hand: ${a.measurement}`, evidence: a.evidence }]
    const at = a.example ? ` — e.g. ${a.example.route}${a.example.width != null ? ` @${a.example.width}` : ''}${a.example.scheme ? ` ${a.example.scheme}` : ''}: source ${a.example.source}, port ${a.example.port}` : ''
    return [{ what: `${a.check}: ${a.what} (${a.cause}) on ${a.routes.length} route(s), ${a.occurrences} case(s)${at}`, why: `recorded in the dossier as ${a.kind} under ${a.decision}, not counted as a port defect`, evidence: a.evidence }]
  })
  // what is carried is what the merged evidence holds of earlier runs
  for (const id of uniq([...Object.keys(merged.carried), ...Object.keys(carriedOpen).filter((k) => carriedOpen[k].length)])) {
    const rec = merged.checks[id]
    if (!rec) continue
    const kept = (merged.carried[id] ??= { whole: false, open: [], cells: {}, debt: [], acceptErrors: [], accepted: [] })
    const was = (x) => x.measured.ranAt !== report.ranAt
    Object.assign(kept, { open: carriedOpen[id] ?? [], debt: rec.debt.filter(was), acceptErrors: rec.acceptErrors.filter(was) })
  }
  Object.assign(report, { accepted, acceptErrors, groups, defects, notMeasured, closedNotMeasured, owed: [...owed.values()].map((o) => ({ ...o, check: o.checks[0] })), notDefectCases, notDefects: [...own, ...listed] })
  for (const c of report.checks) {
    const rec = merged.checks[c.id]
    if (!rec) continue
    c.notDefects = notDefectCases.filter((d) => d.check === c.id && !d.accepted).length + rec.accepted.filter((a) => a.kind !== 'not-measurable').reduce((n, a) => n + a.occurrences, 0)
    Object.assign(c, tables[c.id] ?? {})
    const byHand = rec.accepted.filter((a) => a.kind === 'not-measurable').map((a) => ({ cause: a.cause, cases: a.occurrences, recordedCases: accepted.find((x) => x.check === c.id && x.cause === a.cause)?.recordedCases, reason: accepted.find((x) => x.check === c.id && x.cause === a.cause)?.reason, measurement: accepted.find((x) => x.check === c.id && x.cause === a.cause)?.measurement, evidence: a.evidence }))
    if (byHand.length) c.notMeasurable = byHand
    else delete c.notMeasurable
  }
}

/**
 * Put the history into a report (changed in place): `run` (mode, reason, scope, the runs it stands on), the checks this run did not
 * measure as `carried: true` (never `pass`), the carried groups, owed cases and accept errors counted on the checks they belong to,
 * `fixed`, and the exit code of the effective result.
 */
export function applyHistory(report, { merged, run, order, acceptRows = [] }) {
  const own = new Map(report.checks.map((c) => [c.id, c]))
  const out = []
  for (const id of uniq([...order, ...Object.keys(merged.checks)])) {
    const rec = merged.checks[id]
    if (!rec) continue
    const kept = merged.carried[id]
    const c = own.get(id)
    if (!c) {
      out.push({ id, title: rec.title, cases: rec.cases, ...(rec.intermittent?.length ? { intermittent: rec.intermittent.length } : {}), defects: rec.open.length, defectRows: rec.open.reduce((n, g) => n + g.occurrences, 0), listed: 0, notDefects: 0, accepted: rec.accepted.filter((a) => a.kind !== 'not-measurable').length, acceptErrors: rec.acceptErrors.length, notMeasured: rec.debt.length, pass: false, probeMs: 0, carried: true, carriedFrom: rec.measured })
      continue
    }
    if (run.mode === 'scoped') c.scoped = true
    if (rec.intermittent?.length) {
      c.intermittent = rec.intermittent.length
      c.pass = false
    }
    if (kept) {
      c.carriedGroups = kept.open.length
      c.defects += kept.open.length
      c.defectRows += kept.open.reduce((n, g) => n + g.occurrences, 0)
      c.notMeasured += kept.debt.length
      c.acceptErrors = (c.acceptErrors ?? 0) + kept.acceptErrors.length
      c.carriedNotMeasured = kept.debt.length
      if (kept.open.length || kept.debt.length || kept.acceptErrors.length) c.pass = false
    }
    // a scoped result was judged again as a whole (mergeRun): its counts are the whole's, not the run's plus what was carried
    if (run.mode === 'scoped' && rec.measured.ranAt === report.ranAt) {
      Object.assign(c, { defects: rec.open.length, defectRows: rec.open.reduce((n, g) => n + g.occurrences, 0), accepted: rec.accepted.filter((a) => a.kind !== 'not-measurable').length, acceptErrors: rec.acceptErrors.length, notMeasured: rec.debt.length })
      if (rec.open.length || rec.debt.length || rec.acceptErrors.length) c.pass = false
    }
    out.push(c)
  }
  report.checks = out
  if (run.mode === 'scoped') listsFromMerged(report, merged, acceptRows)
  report.run = run
  report.fixed = merged.fixed
  const applicabilityOutcomes = Object.values(merged.checks).flatMap((c) => c.outcomes ?? [])
  if (applicabilityOutcomes.length) report.applicability = { version: 1, outcomes: applicabilityOutcomes }
  report.intermittent = Object.fromEntries(Object.entries(merged.checks).filter(([, r]) => r.intermittent?.length).map(([id, r]) => [id, r.intermittent.map((g) => ({ cause: g.cause, what: g.what, absent: g.absent, needs: INTERMITTENT_ABSENT, cells: g.cells.length, routes: g.routes, lastSeen: g.measured, evidence: g.evidence }))]))
  report.carried = merged.carried
  report.ownExit = report.exit
  report.exit = effectiveExit(merged.checks, report.exit)
  return report
}

/** The run record of the history and of the report. */
export function runRecord({ report, mode, reason, out, scope, exit, runRoot = null }) {
  return { ranAt: report.ranAt, mode, reason: reason ?? null, out: dossierPath(runRoot, out), exit, wallMs: report.timing?.totalMs ?? null, scope: { checks: scope.checks, routes: scope.routes, widths: scope.widths, heightsWidths: scope.heightsWidths, schemes: scope.schemes } }
}

/** The log keeps its last entries; the run records are kept while the full run, the latest run, the log or a result stands on them. */
const measuredRuns = (checks) => Object.values(checks).flatMap((c) => [c.measured, ...c.open.map((g) => g.measured), ...(c.intermittent ?? []).map((g) => g.measured), ...c.accepted.map((a) => a.measured), ...c.debt.map((d) => d.measured), ...(c.closed ?? []).map((d) => d.measured), ...c.acceptErrors.map((e) => e.measured)].map((m) => m.ranAt))

/**
 * The entry to publish after a run, as stored. `previous` is the entry the run started from, resolved (null on a first run). A run
 * record is never replaced: a run whose ranAt is already recorded is refused.
 */
export function entryAfter({ previous, identity, record, merged, exit, sourceFingerprint = null, revision = null }) {
  if (previous?.runs[record.ranAt]) throw new HistoryError(`a run of ${record.ranAt} is already in the sweep history`)
  const log = [...(previous?.log.map((r) => r.ranAt) ?? []), record.ranAt].slice(-LOG_KEEP)
  const full = record.mode === 'full' ? record.ranAt : previous.full.ranAt
  const keep = new Set([full, record.ranAt, ...log, ...measuredRuns(merged.checks)])
  const all = { ...(previous?.runs ?? {}), [record.ranAt]: record }
  return {
    identity: { site: identity.site, source: identity.source, spec: identity.spec },
    ...(sourceFingerprint ? { sourceFingerprint } : {}),
    revision: revision ?? previous?.revision ?? 0,
    full,
    latest: record.ranAt,
    runs: Object.fromEntries(Object.entries(all).filter(([id]) => keep.has(id))),
    effective: { exit, checks: merged.checks },
    log
  }
}

const few = (list, n = 8) => (list.length > n ? `${list.slice(0, n).join(', ')}, … (${list.length})` : list.join(', '))

/** The stdout line of a run that reads the history: what it is and the scope it measured. */
export function scopeLine(run, routesTotal) {
  if (run.mode === 'full') return run.reason ? `full run: ${run.reason}` : null
  const s = run.scope
  const head = `scoped re-run${run.fullWithoutReason ? ' (--full without --reason narrows)' : ''}`
  const from = `the rest is carried from the run of ${run.previous.ranAt} (${run.previous.out}); ${FULL_HINT}`
  if (!s.checks.length) return `${head}: nothing was open in the run of ${run.previous.ranAt}${run.excluded ? ` in the schemes of this run (${run.excluded} cell(s) in another scheme stay carried)` : ''} — nothing measured; every check is carried from ${run.previous.out}; ${FULL_HINT}`
  return `${head}: checks ${s.checks.join(',')}; routes ${few(s.routes)} (${s.routes.length} of ${routesTotal})${s.widths.length ? `; widths ${s.widths.join(',')}` : ''}${s.heightsWidths.length ? `; heights widths ${s.heightsWidths.join(',')}` : ''}; schemes ${s.schemes.join(',')}; ${from}`
}
