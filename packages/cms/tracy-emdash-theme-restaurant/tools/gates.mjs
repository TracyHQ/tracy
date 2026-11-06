#!/usr/bin/env node
// The recorded result of every gate of one qa.mjs run, one line per gate (modelled on the WordPress
// kit's scripts/port-checks.mjs). Read-only: it opens the report.json qa.mjs already wrote and never
// measures, never searches for "the newest" run and starts nothing. A `pass` here is the verdict that
// report recorded, not a new verification — rerun qa.mjs for that.
//
//   node tools/gates.mjs <qa-run-dir | report.json> [--reviews <dir>] [--json]
//
//   <gate> | pass|fail|pending|blocked|not-applicable | <reason> | <file>
//
// reason  the gate's own `reason`, else its first error (and `+n more`), else its scope; one line.
// file    where the detail lives: visual → visual/VISUAL.md, browser → observations.json, routing →
//         audit/audit.json, a review gate → <reviews>/<gate>.json when --reviews is given (qa.mjs does not
//         record the folder), otherwise REPORT.md. A field holding `|`, `%` or a control character is
//         percent-encoded (decodeURIComponent restores it).
// The last line is `gates: status=<report status> pass=n fail=n pending=n … -> <report.json>`.
// Exit 0 when the report's status is pass, 1 when it is not, 2 when the report cannot be read.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeField, oneLine, summaryLine } from './cli-output.mjs'

const DETAIL = {
  visual: 'visual/VISUAL.md',
  browser: 'observations.json',
  routing: 'audit/audit.json'
}

export function gateRows(reportFile, { reviews = null } = {}) {
  const report = JSON.parse(readFileSync(reportFile, 'utf8'))
  if (!report || typeof report.gates !== 'object' || !report.gates) throw new Error(`${reportFile}: no gates`)
  const dir = path.dirname(reportFile)
  const rows = Object.entries(report.gates).map(([gate, g]) => {
    const errors = Array.isArray(g?.errors) ? g.errors : []
    const reason =
      g?.reason ??
      (errors.length
        ? `${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`
        : (g?.scope ?? ''))
    let file = DETAIL[gate] ? path.join(dir, DETAIL[gate]) : null
    if (!file && reviews && existsSync(path.join(reviews, `${gate}.json`)))
      file = path.join(reviews, `${gate}.json`)
    if (!file || !existsSync(file)) file = path.join(dir, 'REPORT.md')
    return { gate, status: g?.status ?? 'unknown', reason: oneLine(reason, 160), file }
  })
  return { status: report.status ?? 'unknown', report: reportFile, rows }
}

export const formatRow = (r) =>
  [r.gate, r.status, r.reason, r.file].map((v) => encodeField(v, '|')).join(' | ')

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  const ri = argv.indexOf('--reviews')
  const reviews = ri >= 0 ? argv[ri + 1] : null
  const target = argv.find((a, i) => !a.startsWith('--') && (ri < 0 || i !== ri + 1))
  try {
    if (!target) throw new Error('usage: gates.mjs <qa-run-dir | report.json> [--reviews <dir>] [--json]')
    const file = statSync(target).isDirectory() ? path.join(target, 'report.json') : target
    const result = gateRows(file, { reviews })
    if (json) console.log(JSON.stringify(result, null, 2))
    else {
      for (const r of result.rows) console.log(formatRow(r))
      const counts = {}
      for (const r of result.rows) counts[r.status] = (counts[r.status] ?? 0) + 1
      console.log(summaryLine('gates', '', { status: result.status, ...counts }, file))
    }
    process.exitCode = result.status === 'pass' ? 0 : 1
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
