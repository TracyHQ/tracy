/**
 * The role scan as a step of building a quickstart release: scan the template source that is about to
 * be packed, write `design-system-roles.json` (the release asset rule VARS-1 reads) into the release
 * folder and a human summary beside it, and refuse the build while anything VARS-1 would hold is left.
 *
 * What blocks is exactly what VARS-1 fails on (apps/tracy-web .../rules/vars-1-role-variables.js), so a
 * build that passes here is not held on /ops for the same reason: every hardcoded entry that is not a
 * compiled twin and is not handled with a reason (scanner classes auto, flag, missing), and every
 * required role variable the template never reads.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { scanTemplate } from './role-scan/index.mjs'
import { buildReport, humanSummary, ROLE_SCAN_FILE } from './role-scan/report.mjs'
import { missingRoleVariables } from './role-variables.mjs'

export { ROLE_SCAN_FILE }

/** The summary's file name; written beside the release folder, never uploaded. */
export const ROLE_SCAN_SUMMARY = 'design-system-roles.md'

/** How many spots an error message names before it says how many more. */
const SHOWN = 20

const isTwin = (h) => typeof h.twin === 'string' && h.twin.trim() !== ''

/**
 * What in a role scan report VARS-1 would hold, one line each: `file:line (component, property value)`
 * for an open spot, `missing: --ds-…` for a required role variable never read.
 * @param {{ declared: string[], hardcoded: any[] }} report
 * @returns {string[]}
 */
export function roleScanBlockers(report) {
  const open = report.hardcoded.filter(
    (h) => !isTwin(h) && (h.handled !== true || !String(h.reason ?? '').trim())
  )
  return [
    ...missingRoleVariables(report.declared).map((n) => `missing: ${n} (no shipped source reads it)`),
    ...open.map(
      (h) =>
        `${h.file}:${h.line} (${h.component}${h.property ? `, ${h.property}` : ''}${h.value ? ` ${h.value}` : h.class === 'missing' ? ' not set' : ''})${h.class ? ` [${h.class}]` : ''}`
    )
  ]
}

/**
 * Scan one template source for a release and write its report.
 * @param {{ templateDir: string, releaseDir: string, summaryDir?: string, template: string,
 *   platform: 'joomla' | 'wordpress' | 'emdash', version: string, include?: string[], now?: Date }} o
 * @returns {{ report: any, blockers: string[], file: string, summary: string }}
 */
export function releaseRoleScan(o) {
  const scan = scanTemplate(resolve(o.templateDir), { include: o.include ?? [] })
  const report = buildReport(scan, {
    template: o.template,
    platform: o.platform,
    version: o.version,
    now: o.now
  })
  const file = join(o.releaseDir, ROLE_SCAN_FILE)
  const summary = join(o.summaryDir ?? dirname(resolve(o.releaseDir)), ROLE_SCAN_SUMMARY)
  mkdirSync(o.releaseDir, { recursive: true })
  mkdirSync(dirname(summary), { recursive: true })
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(summary, humanSummary(report))
  return { report, blockers: roleScanBlockers(report), file, summary }
}

/**
 * The error a build stops with when the scan is not clean: what is left, and how to clear it.
 * @param {{ report: any, blockers: string[], summary: string }} r @param {string} templateDir
 */
export function roleScanError(r, templateDir) {
  const { blockers } = r
  const list = blockers.slice(0, SHOWN).map((b) => `  - ${b}`)
  if (blockers.length > SHOWN) list.push(`  - and ${blockers.length - SHOWN} more`)
  return new Error(
    [
      `role scan: ${blockers.length} item(s) rule VARS-1 would hold (unresolved ${r.report.unresolved}) in ${templateDir}:`,
      ...list,
      `Summary: ${r.summary}. Clear them in the template source: node packages/design/tracy-ds-slot/scripts/role-scan.mjs <template dir> --write,`,
      'settle each "Flag for agent" and "Role not read" entry by hand (or mark it /* ds-keep: <reason> */), then build again.'
    ].join('\n')
  )
}
