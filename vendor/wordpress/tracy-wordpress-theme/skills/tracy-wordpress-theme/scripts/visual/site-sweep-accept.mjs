// The dossier's record of what the sweep must not count: a fault of the SOURCE, or a difference the port keeps by decision.
//
// review.config.json  "sweep": { "accept": [ { check, cause, routes, widths?, schemes?, decision, evidence, kind, key? } ] }
//
//   check     the sweep check the group belongs to (overflow, scheme, background, header, chips, the behaviour checks, heights)
//   cause     the group's cause key exactly as site-sweep.md prints it after "cause" (`chip-background|span.badge`)
//   routes    EXPLICIT exact paths — the routes the row covers; no wildcard (lib/parity-acceptance.mjs routeScopeErrors)
//   widths    optional, only these widths;   schemes  optional, only these schemes / scheme states
//   decision  ONE decision id that exists exactly once in the dossier's DECISIONS.md (lib/parity-acceptance.mjs parseDecisions)
//   evidence  a path (absolute, or relative to the dossier) that exists, or an http(s) URL
//   kind      "source-fault" (the source is wrong) | "decided" (the port keeps the difference on purpose) | "not-measurable" (below)
//   key       optional: words the decision's own text must contain
//
// A third kind records what the tool COULD NOT MEASURE (the not-measured causes of site-sweep.md: `icons-unpairable`, `icon-covered`,
// `touch-control-not-found`, `form-purpose-unknown`, a chips cause…) after the dossier measured it by hand:
//   { check, cause, kind: "not-measurable", cases, reason, measurement, evidence }
//   cause        the not-measured cause key as site-sweep.md prints it (`icons-unpairable`)
//   cases        how many not-measured cases of that cause the hand measurement covers (a positive integer)
//   reason       why the tool cannot read it;   measurement  what was measured by hand and found;   evidence  as above (a file that exists, or a URL)
// No routes, widths, schemes or decision: the row covers the cause across the run, up to `cases`. The cause stays listed in the report and in
// fix-measure.json with its count. A cause the row does not name, or more cases than `cases`, fails the check again; a row whose cause no
// longer occurs is an ERROR (stale), like any other row.
//
// A row moves the defect rows it covers to `notDefects` with its decision and evidence. A row that matches no defect group is an
// ERROR (a stale exception), and so is a row that names a route/width/scheme the group does not occur on, or a defect row that
// two rows both cover. Defect rows a row does not cover stay defects.
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DECISION_ID, citationErrors, routeScopeErrors } from '../lib/parity-acceptance.mjs'
import { CHECK_ORDER, causeOf } from './site-sweep-judge.mjs'
import { BEHAVIOUR_ORDER } from './site-sweep-behaviour-judge.mjs'

const ALL_CHECK_IDS = [...CHECK_ORDER, ...BEHAVIOUR_ORDER, 'heights']

export const ACCEPT_KINDS = Object.freeze(['source-fault', 'decided', 'not-measurable'])
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s)

/** Where an evidence path lives: `~/` is the home directory, a relative path is the dossier's. */
export function evidencePath(evidence, runRoot) {
  if (evidence.startsWith('~/')) return path.join(os.homedir(), evidence.slice(2))
  return path.isAbsolute(evidence) ? evidence : path.join(runRoot, evidence)
}

/** Routes as the sweep names them: an exact path, and a query string when the page is one (`/?s=zqxwv`) — the shared rule. */
export const routeErrors = (routes) => routeScopeErrors(routes)

/** The refusals of the rows themselves (shape, decision, evidence): one line each; empty when every row stands. `decisions` is parseDecisions' result. */
export function validateSweepAccept(rows, { decisions, runRoot }) {
  if (rows === undefined || rows === null) return []
  if (!Array.isArray(rows)) return ['sweep.accept is not a list']
  const errors = []
  rows.forEach((row, n) => {
    const at = `sweep.accept[${n}] ${JSON.stringify(row?.check ?? null)} ${JSON.stringify(row?.cause ?? null)}`
    const E = (m) => errors.push(`${at}: ${m}`)
    if (!row || typeof row !== 'object' || Array.isArray(row)) return E('is not an object')
    if (!ALL_CHECK_IDS.includes(row.check)) E(`check must be one of ${ALL_CHECK_IDS.join(', ')}`)
    if (typeof row.cause !== 'string' || !row.cause.trim()) E('needs the group\'s cause key as site-sweep.md prints it')
    if (row.kind === 'not-measurable') {
      for (const k of ['routes', 'widths', 'schemes', 'decision', 'key']) if (row[k] !== undefined) E(`a not-measurable row has no ${k}: it covers the cause across the run, up to its \`cases\``)
      if (!Number.isInteger(row.cases) || row.cases < 1) E('needs `cases`: the number of not-measured cases of the cause the hand measurement covers (a positive integer)')
      for (const k of ['reason', 'measurement']) if (typeof row[k] !== 'string' || !row[k].trim()) E(`needs \`${k}\`: ${k === 'reason' ? 'why the tool cannot measure it' : 'what was measured by hand and what it showed'}`)
      if (typeof row.evidence !== 'string' || !row.evidence.trim()) E('needs evidence: a path to a file or an http(s) URL')
      else if (!isUrl(row.evidence) && !existsSync(evidencePath(row.evidence, runRoot))) E(`evidence ${row.evidence} does not exist (${evidencePath(row.evidence, runRoot)})`)
      return
    }
    for (const m of routeErrors(row.routes)) E(m)
    if (row.widths !== undefined && (!Array.isArray(row.widths) || !row.widths.length || !row.widths.every((w) => Number.isInteger(w) && w > 0))) E('widths must be a non-empty list of integers')
    if (row.schemes !== undefined && (!Array.isArray(row.schemes) || !row.schemes.length || !row.schemes.every((x) => typeof x === 'string' && x))) E('schemes must be a non-empty list of names')
    if (!ACCEPT_KINDS.includes(row.kind)) E(`kind must be ${ACCEPT_KINDS.map((k) => JSON.stringify(k)).join(' or ')}`)
    if (typeof row.decision !== 'string' || !DECISION_ID.test(row.decision)) E(`decision must be exactly one decision id (D-n), got ${JSON.stringify(row.decision ?? null)}`)
    else for (const m of citationErrors(row.decision, [row.key ?? row.decision], decisions)) E(m)
    if (typeof row.evidence !== 'string' || !row.evidence.trim()) E('needs evidence: a path to a file or an http(s) URL')
    else if (!isUrl(row.evidence) && !existsSync(evidencePath(row.evidence, runRoot))) E(`evidence ${row.evidence} does not exist (${evidencePath(row.evidence, runRoot)})`)
  })
  return errors
}

/**
 * Move the defect rows the accept rows cover to `notDefects`. `judged` is { check: {defects, notDefects, …} } and is changed in place.
 * `scope` = { routes: [path], widths: [n], heightsWidths?: [n], partial? }: a row whose routes (or widths) were not part of this run at all is skipped, not stale;
 * a `heights` row is held to `heightsWidths` (heights reads 576 and 992 beside the run's widths), the other checks to `widths`.
 * `cell` = true: the scope is what `--explain` measured (`cells` = [{route, width}], the readings the judge took in): a row whose whole scope was measured (every route × width pair) is checked like a full run; a row that reaches beyond it is applied to the cells measured and never judged stale or over-broad by them — that is a question for a run that measures its scope is checked like a full run; the others are skipped as `unvalidated`, or applied and listed in `unverified`.
 * `partial` (a scoped re-run, site-sweep-scope.mjs): the run measured a part of what the row covers, so a row that matches no group, or names a
 * route, width or scheme the group was not measured on, is skipped (`unvalidated`), not an error; it covers the rows it does match.
 * → { accepted: [entry], errors: [{check, row, message}], skipped: [{row, why}] }
 */
export function applyAccept(judged, rows, scope) {
  const accepted = []
  const closedItems = {}
  const errors = []
  const skipped = []
  const ran = new Set(scope?.routes ?? [])
  const claimed = new Map()
  // the defect rows as the sweep measured them: a row is checked against these, not against what an earlier row already took
  const original = Object.fromEntries(Object.entries(judged).map(([id, x]) => [id, x ? [...x.defects] : []]))
  ;(rows ?? []).forEach((row, n) => {
    // `scope.cell` (one route at one width, as `--explain`): a row is decided by that cell only when its whole scope is that cell (one route, one width);
    // a row with more routes, more widths or none is also true or stale at cells this run did not measure, so it is skipped as `unvalidated`, never judged by one cell
    // (every route × width pair the row names was judged — `scope.cells` — and it names widths)
    const pairs = new Set((scope?.cells ?? []).map((c) => `${c.route}|${c.width}`))
    const pairMissing = (row.routes ?? []).flatMap((r) => (row.widths ?? []).filter((w) => !pairs.has(`${r}|${w}`)).map((w) => ({ r, w })))
    const partial = scope?.cell ? !(row.kind !== 'not-measurable' && row.widths?.length && pairMissing.length === 0) : Boolean(scope?.partial)
    const j = judged[row.check]
    const fail = (message) => errors.push({ check: row.check, row: n, cause: row.cause, message: `sweep.accept[${n}] ${row.check} "${row.cause}": ${message}` })
    if (!j) return skipped.push({ row: n, why: `${row.check} was not run` })
    if (row.kind === 'not-measurable') return closeNotMeasured(j, row, { fail, accepted, closedItems, unvalidated: partial ? () => skipped.push({ row: n, why: 'its cause was not in the measured scope', unvalidated: true }) : null })
    if (scope?.routes && !row.routes.some((r) => ran.has(r))) return skipped.push({ row: n, why: 'none of its routes was part of this run' })
    // heights reads its own widths (576 and 992 beside the run's): a heights row is in this run when heights read one of its widths
    const ranWidths = row.check === 'heights' && scope?.heightsWidths ? scope.heightsWidths : scope?.widths
    if (ranWidths && row.widths && !row.widths.some((w) => ranWidths.includes(w))) return skipped.push({ row: n, why: 'none of its widths was part of this run' })
    const same = original[row.check].filter((d) => causeOf(d) === row.cause)
    if (!same.length && partial) return skipped.push({ row: n, why: 'its group was not in the measured scope', unvalidated: true })
    if (!same.length) {
      const known = [...new Set(original[row.check].map(causeOf))].slice(0, 5)
      return fail(`matches no defect group in this run — a stale exception (the fault is gone, or the cause key changed)${known.length ? `; the groups of ${row.check} are: ${known.map((k) => `"${k}"`).join(', ')}` : `; ${row.check} has no defect group`}`)
    }
    const inRow = (d) => row.routes.includes(d.route) && (!row.widths || row.widths.includes(d.width)) && (!row.schemes || row.schemes.includes(d.scheme) || row.schemes.includes(d.state))
    const covered = same.filter(inRow)
    // a row may not name more than the group has: a route, width or scheme it covers must be one the group occurs on
    const over = []
    for (const r of row.routes) if (ran.has(r) && !covered.some((d) => d.route === r)) over.push(`route ${r}`)
    for (const w of row.widths ?? []) if ((!ranWidths || ranWidths.includes(w)) && !covered.some((d) => d.width === w)) over.push(`width ${w}`)
    for (const x of row.schemes ?? []) if (!covered.some((d) => d.scheme === x || d.state === x)) over.push(`scheme ${x}`)
    if (partial && !covered.length) return skipped.push({ row: n, why: 'its group was not in the measured scope', unvalidated: true })
    if (over.length && !partial) return fail(`names ${over.join(', ')} where the group does not occur — a row covers only what it was measured on`)
    const twice = covered.find((d) => claimed.has(d))
    if (twice) return fail(`a defect row (${twice.route}${twice.width != null ? ` @${twice.width}` : ''}) is also covered by sweep.accept[${claimed.get(twice)}]: a group is matched to at most one row`)
    for (const d of covered) claimed.set(d, n)
    j.defects = j.defects.filter((d) => !covered.includes(d))
    for (const d of covered) j.notDefects.push({ ...d, check: row.check, why: `${row.kind} ${row.decision}`, evidence: row.evidence, decision: row.decision, kind: row.kind, accepted: true, acceptCause: row.cause })
    const first = covered[0]
    accepted.push({
      check: row.check,
      cause: row.cause,
      what: first.what,
      kind: row.kind,
      decision: row.decision,
      evidence: row.evidence,
      occurrences: covered.length,
      routes: [...new Set(covered.map((d) => d.route))],
      widths: [...new Set(covered.map((d) => d.width).filter((w) => w != null))].sort((a, b) => a - b),
      schemes: [...new Set(covered.map((d) => d.scheme ?? d.state).filter(Boolean))],
      example: { route: first.route, width: first.width ?? null, scheme: first.scheme ?? first.state ?? null, source: first.source, port: first.port },
      // defect rows of the same cause the row does not cover stay defects
      notCovered: same.length - covered.length
    })
  })
  settleClosed(judged, closedItems)
  return { accepted, errors, skipped, closedItems }
}

/** The not-measured causes of one case: a chips case lists several, every other check names one. */
export const notMeasuredCausesOf = (n) => (Array.isArray(n.causes) && n.causes.length ? n.causes.map((c) => c.cause) : [n.cause])

/**
 * Close the not-measured cases of one cause with a `not-measurable` row. A case with several causes (chips) is closed when every cause
 * of it is recorded. More cases than the row says is an error and closes nothing: the cases stay not measured.
 */
function closeNotMeasured(j, row, { fail, accepted, closedItems, unvalidated = null }) {
  if (j.closed?.some((c) => c.row.cause === row.cause)) return fail('the cause is recorded by another not-measurable row: one row per cause')
  const mine = j.notMeasured.filter((x) => notMeasuredCausesOf(x).includes(row.cause))
  if (!mine.length && unvalidated) return unvalidated()
  if (!mine.length) {
    const known = [...new Set(j.notMeasured.flatMap(notMeasuredCausesOf))].slice(0, 5)
    return fail(`matches no not-measured cause in this run — a stale row (the cause is gone, or its key changed)${known.length ? `; the not-measured causes of ${row.check} are: ${known.map((k) => `"${k}"`).join(', ')}` : `; ${row.check} has nothing not measured`}`)
  }
  if (mine.length > row.cases) return fail(`${mine.length} case(s) of this cause are not measured, the row records ${row.cases}: the cause grew beyond what the hand measurement covers`)
  j.closed ??= []
  j.closed.push({ row, items: mine })
  const first = mine[0]
  accepted.push({
    check: row.check,
    cause: row.cause,
    what: `not measured: ${row.cause}`,
    kind: row.kind,
    reason: row.reason,
    measurement: row.measurement,
    evidence: row.evidence,
    occurrences: mine.length,
    recordedCases: row.cases,
    routes: [...new Set(mine.map((d) => d.route))],
    widths: [...new Set(mine.map((d) => d.width).filter((w) => w != null))].sort((a, b) => a - b),
    schemes: [...new Set(mine.map((d) => d.scheme ?? d.state).filter(Boolean))],
    example: { route: first.route, width: first.width ?? null, scheme: first.scheme ?? first.state ?? null, detail: first.detail ?? first.reason ?? null }
  })
}

/** After every row ran: take the cases whose every cause a row closed out of `notMeasured`, and count them per check. */
export function settleClosed(judged, closedItems) {
  for (const [id, j] of Object.entries(judged)) {
    if (!j?.closed?.length) continue
    const recorded = new Set(j.closed.map((c) => c.row.cause))
    const gone = j.notMeasured.filter((x) => notMeasuredCausesOf(x).every((c) => recorded.has(c)))
    j.notMeasured = j.notMeasured.filter((x) => !gone.includes(x))
    j.closedNotMeasured = gone
    closedItems[id] = gone.length
  }
}
