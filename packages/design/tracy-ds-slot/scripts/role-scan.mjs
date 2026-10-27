#!/usr/bin/env node
/**
 * Packaging-time role scan of a template's sources (roadmap step 4): every hard-coded colour, corner
 * and font stack sorted into auto-convert / flag for agent / keep, and the release asset
 * `design-system-roles.json` that the /ops rule VARS-1 reads.
 *
 *   node packages/design/tracy-ds-slot/scripts/role-scan.mjs <template-dir> [--check | --write]
 *        [--out <report.json>] [--summary <summary.md>] [--include <dir,…>]
 *        [--template <name>] [--platform joomla|wordpress|emdash] [--version <v>]
 *
 * --check (default): report only; exit 1 while any finding is unresolved (auto not yet applied, or flagged).
 * --write: rewrite every auto finding in place (`var(--ds-…, <the template's own value>)`), then scan
 *   again and report what is left (flag + keep). Running it twice changes nothing the second time.
 * A component that should read a corner role and sets no corner at all is reported as `missing`
 * (never rewritten: adding a corner is a change the agent makes by hand).
 * Exit: 0 nothing unresolved · 1 unresolved findings · 2 bad input.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyAutoConverts, scanTemplate } from '../src/role-scan/index.mjs'
import { buildReport, humanSummary } from '../src/role-scan/report.mjs'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const flag = (name) => {
  const i = args.indexOf(name)
  if (i !== -1) args.splice(i, 1)
  return i !== -1
}
const out = opt('--out')
const summaryOut = opt('--summary')
const include = (opt('--include') ?? '').split(',').filter(Boolean)
const over = {
  template: opt('--template') ?? undefined,
  platform: opt('--platform') ?? undefined,
  version: opt('--version') ?? undefined
}
const write = flag('--write')
flag('--check')
const [dir] = args
if (!dir || !existsSync(dir)) {
  console.error(
    'usage: role-scan.mjs <template-dir> [--check | --write] [--out report.json] [--summary summary.md]'
  )
  process.exit(2)
}
const root = resolve(dir)

let scan = scanTemplate(root, { include })
let converted = 0
if (write) {
  const applied = applyAutoConverts(root, scan)
  converted = applied.replaced
  scan = scanTemplate(root, { include })
  const left = scan.findings.filter((f) => f.class === 'auto').length
  if (left) console.error(`role-scan: ${left} auto findings still present after --write (not idempotent)`)
}
const report = buildReport(scan, { ...over, converted })
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
const summary = humanSummary(report)
if (summaryOut) writeFileSync(summaryOut, summary)
const t = report.totals
console.log(
  JSON.stringify({
    template: report.template,
    version: report.version,
    files: t.files,
    auto: t.auto,
    flag: t.flag,
    keep: t.keep,
    missing: t.missing,
    missingRoles: report.missingRoles.length,
    converted,
    unresolved: report.unresolved
  })
)
if (!out && !summaryOut) process.stdout.write(summary)
process.exit(report.unresolved ? 1 : 0)
