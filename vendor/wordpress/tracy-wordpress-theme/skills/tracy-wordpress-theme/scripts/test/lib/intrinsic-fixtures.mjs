// Valid intrinsic evidence, built by the producer's own builder (intrinsic-report.mjs), for the tests that
// then break exactly one thing. Never hand-written totals: a fixture that could drift from the schema proves nothing.
import { INTRINSIC_WIDTHS, buildIntrinsicReport, intrinsicClaimOf, summaryClaimOf } from '../../visual/intrinsic-report.mjs'

export const WIDTHS = INTRINSIC_WIDTHS
const base = (kind) => (kind === 'control-wrap' ? { kind, label: 'Contact Us', key: 'control-wrap|Contact Us|main|1', selector: 'main > a.btn', lines: 2, boxWidth: 110 } : kind === 'text-clipped' ? { kind, label: 'A long clipped heading', key: 'text-clipped|A long clipped heading|main|1', selector: 'main > h2', over: 14 } : { kind, label: '', key: 'page-overflow', selector: 'html', over: 30 })

/** A classified row. `kind` control-wrap | text-clipped | page-overflow; `cls` site-only | shared-source-defect | source-fixed. */
export function row(cls = 'site-only', kind = 'control-wrap', o = {}) {
  const r = { ...base(kind), class: cls, ...o }
  if (cls === 'shared-source-defect' && !('source' in o)) r.source = kind === 'control-wrap' ? { lines: r.lines } : { over: r.over }
  if (cls === 'site-only' && kind === 'control-wrap' && !('source' in o) && o.withSource) r.source = { lines: 2 }
  delete r.withSource
  return r
}

/** Readings for routes × widths; `rowsAt['/a@320']` holds that reading's rows, `errorAt['/a@320']` its failure. */
export function readingsOf(routes, { rowsAt = {}, errorAt = {}, widths = WIDTHS } = {}) {
  return routes.flatMap((route) => widths.map((width) => ({ route, width, ...(errorAt[`${route}@${String(width)}`] ? { error: errorAt[`${route}@${String(width)}`] } : {}), rows: rowsAt[`${route}@${String(width)}`] ?? [] })))
}

export function reportOf({ routes = ['/'], sourceRead = true, rowsAt = {}, errorAt = {}, widths = WIDTHS } = {}) {
  return buildIntrinsicReport({ widths, sourceRead, routes, readings: readingsOf(routes, { rowsAt, errorAt, widths }) })
}

/** The two visual.json blocks that agree with `rep`. */
export function claimsOf(rep) {
  const intrinsic = intrinsicClaimOf(rep)
  return { intrinsic, summary: summaryClaimOf(intrinsic) }
}
export const clone = (v) => JSON.parse(JSON.stringify(v))
