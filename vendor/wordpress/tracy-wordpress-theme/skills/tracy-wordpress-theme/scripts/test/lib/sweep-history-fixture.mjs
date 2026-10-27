// A sweep history made by hand, for the tests of site-sweep-scope.mjs and site-sweep-publish.mjs.
import { ALL_CHECKS, DEFAULT_WIDTHS } from '../../visual/site-sweep.mjs'
import { acceptCells, keyOf, resolveEntry } from '../../visual/site-sweep-scope.mjs'

export const PAGES = ['/', '/a', '/b', '/c']
export const HEIGHT_WIDTHS = [320, 390, 576, 768, 992, 1024, 1180, 1440]
export const at = (ranAt, out = '/runs/one', mode = 'full') => ({ ranAt, out, mode })
export const group = (cause, cells, measured = at('t1')) => ({ cause, what: cause.split('|')[0], occurrences: cells.length, routes: [...new Set(cells.map((c) => c[0]))], widths: [...new Set(cells.map((c) => c[1]).filter((w) => w != null))], schemes: [...new Set(cells.map((c) => c[2]).filter(Boolean))], cells, examples: [{ route: cells[0][0], width: cells[0][1], scheme: cells[0][2], source: '0', port: '9' }], measured, evidence: 'site-sweep.json#groups.x[0]' })
export const rec = (id, o = {}, measured = at('t1')) => ({ id, title: id, cases: 10, measured, open: [], accepted: [], debt: [], acceptErrors: [], ...o })
export const fullScope = (schemes = ['light', 'dark']) => ({ checks: [...ALL_CHECKS], routes: PAGES, widths: DEFAULT_WIDTHS, heightsWidths: HEIGHT_WIDTHS, schemes })
export const record = (o = {}) => ({ ranAt: 't1', mode: 'full', reason: null, out: '/runs/one', exit: 1, wallMs: 1000, scope: fullScope(), ...o })
export const IDENTITY = { site: 'http://p', source: 'http://s', spec: 'x' }
export const KEY = keyOf(IDENTITY)
export const exitOf = (checks) => {
  const l = Object.values(checks)
  return l.some((c) => c.open.length || c.acceptErrors.length || c.intermittent?.length) ? 1 : l.some((c) => c.debt.length) ? 3 : 0
}
/** A sweep.accept error as recordsOf writes it: its row and the cells it is measured at again. */
export const acceptError = (id, row, message = 'stale', measured = at('t1')) => ({ cause: row?.cause ?? null, message, row, cells: acceptCells(row, id, fullScope()), measured })

/** An entry as stored (v2): `checks` are the records that differ from a clean check; `o.latest` a later run record. */
export const storedOf = (checks, o = {}) => {
  const all = Object.fromEntries(ALL_CHECKS.map((id) => [id, checks[id] ?? rec(id)]))
  const exit = exitOf(all)
  const full = record({ exit })
  const latest = o.latest ?? full
  const runs = { [full.ranAt]: full, [latest.ranAt]: latest, ...(o.runs ?? {}) }
  const { latest: _l, runs: _r, ...rest } = o
  return { identity: IDENTITY, revision: 1, full: full.ranAt, latest: latest.ranAt, runs, effective: { exit, checks: all }, log: [...new Set([full.ranAt, latest.ranAt])], ...rest }
}
/** The same entry as the tool reads it: the full run, the latest run and the log as run records. */
export const entryOf = (checks, o = {}) => resolveEntry(storedOf(checks, o))
export const docOf = (entry, key = KEY) => ({ schema: 'tracy-site-sweep-state/v2', runs: { [key]: entry } })
export const scopeBits = (s) => ({ checks: s.checks, routes: s.routes, widths: s.widths, heightsWidths: s.heightsWidths, schemes: s.schemes })
export const later = (ranAt, o = {}) => record({ ranAt, mode: 'scoped', scope: { ...fullScope(), checks: ['overflow'] }, ...o })
/** An accepted group as recordsOf writes it. */
export const acc = (cells, measured = at('t1'), o = {}) => ({ cause: 'k', what: null, kind: 'decided', decision: 'D-1', evidence: null, occurrences: cells.length, routes: [...new Set(cells.map((c) => c[0]))], widths: [...new Set(cells.map((c) => c[1]).filter((w) => w != null))], schemes: [...new Set(cells.map((c) => c[2]).filter(Boolean))], cells, measured, ...o })
