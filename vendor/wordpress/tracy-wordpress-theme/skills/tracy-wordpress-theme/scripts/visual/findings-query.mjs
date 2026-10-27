// findings-query.mjs — read-only query over the findings of a Visual QA report, one line per finding.
//
//   node scripts/visual/visual-qa.mjs findings <run-dir|visual.json> [--page <id>] [--axis <variant>] [--open | --accepted] [--limit N]
//
//   <id>\t<page>\t<axis>\t<width>/<scheme>\t<open|accepted>\t<reason>\t<crop>
//
// `id` is the cluster member key `page|axis|findings#index` (or `accepted#index`): the position of the
// finding in visual.json, so a row can be located in the source report. Filters combine (AND) and are applied
// before `--limit` (default 50). The query opens the report and nothing else: it measures nothing and
// writes nothing. Its exit status is 0 for a successful query whatever the findings are (2: bad input) —
// the gate verdict stays with visual-qa.mjs / group-verdict.mjs.
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { encodeField, oneLine } from '../lib/cli-output.mjs'

export const DEFAULT_LIMIT = 50
const MAX_REPORT_BYTES = 256 * 1024 * 1024

const str = (v) => (typeof v === 'string' && v ? v : null)

/** The reason column: the finding's own words when it has them, else kind + element + the changed value. */
function reasonOf(f, list) {
  const head = [str(f?.kind) ?? 'finding', str(f?.element), str(f?.property)].filter(Boolean).join(' ')
  const own = str(f?.reason) ?? str(f?.what)
  const delta = f?.expected !== undefined || f?.observed !== undefined ? `${JSON.stringify(f.expected ?? null)} -> ${JSON.stringify(f.observed ?? null)}` : Array.isArray(f?.deltas) && f.deltas.length ? `${f.deltas.length} delta(s)` : null
  const decision = list === 'accepted' && str(f?.exception?.decision) ? ` [accepted: ${f.exception.decision}]` : ''
  return `${[head, own ?? delta].filter(Boolean).join(': ')}${decision}`
}

/** A crop the report itself records for the finding, else the axis' only tile; otherwise unavailable (no guess is made). */
function cropOf(f, axis) {
  const own = str(f?.tile) ?? str(f?.crop) ?? str(f?.screenshot)
  if (own) return own
  const tiles = Array.isArray(axis?.tiles) ? axis.tiles.filter((t) => typeof t === 'string') : []
  if (tiles.length === 1) return tiles[0]
  return tiles.length ? `unavailable (the axis has ${tiles.length} tiles in ${path.dirname(tiles[0])}/)` : 'unavailable'
}

/**
 * Pure: the finding rows of a parsed visual.json, in report order (page, axis, open before accepted, index).
 * Duplicates are kept: each position in the report is one row.
 */
export function findingRows(report, { page = null, axis = null, status = null } = {}) {
  if (!report || !Array.isArray(report.pages)) throw new Error('not a Visual QA report: no pages[]')
  const rows = []
  for (const p of report.pages) {
    const pageId = String(p?.id ?? '(no id)')
    if (page !== null && pageId !== page) continue
    for (const a of Array.isArray(p?.axes) ? p.axes : []) {
      const variant = String(a?.variant ?? '(no axis)')
      if (axis !== null && variant !== axis) continue
      for (const list of ['findings', 'accepted']) {
        const st = list === 'accepted' ? 'accepted' : 'open'
        if (status !== null && st !== status) continue
        const items = Array.isArray(a?.[list]) ? a[list] : []
        items.forEach((f, index) => {
          rows.push({
            id: `${pageId}|${variant}|${list}#${index}`,
            page: pageId,
            axis: variant,
            viewport: `${a?.width ?? '?'}/${a?.theme ?? '?'}`,
            status: st,
            reason: reasonOf(f, list),
            crop: cropOf(f, a)
          })
        })
      }
    }
  }
  return rows
}

// identity and path fields are exact (control characters and `%` are percent-encoded, decodeURIComponent restores them); only the prose reason is bounded
export const formatFinding = (r) => [encodeField(r.id), encodeField(r.page), encodeField(r.axis), encodeField(r.viewport), r.status, oneLine(r.reason, 140), encodeField(r.crop)].join('\t')

const USAGE = 'usage: visual-qa.mjs findings <run-dir|visual.json> [--page <id>] [--axis <variant>] [--open | --accepted] [--limit N]'

/** CLI entry; `args` excludes the word `findings`. Returns the exit code. */
export function findingsCli(args, { out = console.log, err = console.error } = {}) {
  try {
    const a = parseStrict(args, { values: ['--page', '--axis', '--limit'], flags: ['--open', '--accepted'], positionals: 1 })
    if (a.positional.length !== 1 || (a.flag('--open') && a.flag('--accepted'))) throw new UsageError(USAGE)
    const limitRaw = a.opt('--limit', String(DEFAULT_LIMIT))
    const limit = Number(limitRaw)
    if (!Number.isInteger(limit) || limit < 1) throw new UsageError(`--limit must be a positive integer, got ${limitRaw}`)
    const target = a.positional[0]
    const file = existsSync(target) && statSync(target).isDirectory() ? path.join(target, 'visual.json') : target
    if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`${file}: no such report`)
    if (statSync(file).size > MAX_REPORT_BYTES) throw new UsageError(`${file}: larger than ${MAX_REPORT_BYTES} bytes`)
    let report
    try {
      report = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      throw new UsageError(`${file}: not JSON (${String(e.message).split('\n')[0]})`)
    }
    const rows = findingRows(report, { page: a.opt('--page'), axis: a.opt('--axis'), status: a.flag('--open') ? 'open' : a.flag('--accepted') ? 'accepted' : null })
    for (const r of rows.slice(0, limit)) out(formatFinding(r))
    out(`# ${Math.min(limit, rows.length)} of ${rows.length} finding(s) shown${rows.length > limit ? ' — narrow with --page/--axis/--open or raise --limit' : ''}`)
    return 0
  } catch (e) {
    err(`visual-qa findings: ${e.message}`)
    return 2
  }
}
