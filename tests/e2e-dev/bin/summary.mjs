#!/usr/bin/env node
// One page for many runs (plan §4 S8):
//
//   node tests/e2e-dev/bin/summary.mjs [--since <date|datetime>] [--until <…>] [--out <file>]
//
// `--since` defaults to today 00:00 (local time), `--until` to now; `--out` to
// `<resultsRoot>/summary.md`. Reads every `report.json` of the suite (`<root>/<runId>/`) and of the
// regression runner's dev profile (`<root>/reg/<runId>/`) started in the window.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ENV } from '../lib/env.mjs'
import { redactText } from '../lib/redact.mjs'
import { buildSummary, collectReports } from '../lib/summary.mjs'

const { values } = parseArgs({
  options: { since: { type: 'string' }, until: { type: 'string' }, out: { type: 'string' } }
})

const today = new Date()
today.setHours(0, 0, 0, 0)
const since = values.since ? new Date(values.since) : today
const until = values.until ? new Date(values.until) : new Date()
if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
  console.error('--since/--until must be a date (2026-10-04) or a datetime (2026-10-04T18:00:00Z)')
  process.exit(2)
}
const runs = collectReports(ENV.resultsRoot, { since, until })
const md = redactText(buildSummary(runs, { since, until }))
const out = values.out ?? join(ENV.resultsRoot, 'summary.md')
writeFileSync(out, md)
console.log(`${runs.length} run(s) → ${out}`)
