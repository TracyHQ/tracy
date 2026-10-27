/**
 * The role scan as the release asset `design-system-roles.json` (schema `tdsr-role-scan/v1`, read by
 * the Template Design System Readiness rule VARS-1) plus a short human summary. PURE.
 *
 * Every field VARS-1 reads is the agreed shape (scratch contract `role-scan-report-shape.md`, written
 * with the VARS-1 author). The scanner adds, per entry, `class` (auto · flag · keep), `selector`,
 * `replacement` (auto) and `candidates` (flag), and `totals`/`unresolved`/`skipped` at the top: VARS-1
 * ignores fields it does not know.
 */
import {
  canBeNotUsed,
  isRoleVariable,
  missingRoleVariables,
  ROLE_SCAN_REPORT_SCHEMA
} from '../role-variables.mjs'

export const ROLE_SCAN_FILE = 'design-system-roles.json'
export const SCANNER = 'tracy-ds-slot role-scan 1.0.0'

const component = (f) => {
  if (f.name) return `token ${f.name}`
  if (f.source === 'tailwind' || f.source === 'svg' || f.source === 'jsx-style' || f.source === 'markup') {
    const tag = /<([A-Za-z][\w.]*)/.exec(f.lineText ?? '')
    return `${f.file
      .split('/')
      .pop()
      .replace(/\.[a-z]+$/i, '')}${tag ? ` <${tag[1]}>` : ''}`
  }
  const first = (f.selector ?? '').split(',')[0].trim()
  return first.length > 60 ? `${first.slice(0, 57)}...` : first || '(top level)'
}

/**
 * @param {ReturnType<import('./index.mjs').scanTemplate>} scan
 * @param {{ template?: string, platform?: string, version?: string, converted?: number, now?: Date }} [over]
 */
export function buildReport(scan, over = {}) {
  const hardcoded = scan.findings.map((f) => ({
    file: f.file,
    line: f.line,
    component: component(f),
    property: f.source === 'tailwind' ? f.text : f.prop,
    // a missing corner has no literal: the property is what the component never sets
    ...(f.class === 'missing' ? {} : { value: f.text }),
    role: f.class === 'auto' || f.class === 'missing' ? f.role : null,
    handled: f.class === 'keep',
    ...(f.class === 'keep' ? { reason: f.reason } : {}),
    class: f.class,
    selector: f.selector || undefined,
    ...(f.class === 'auto' ? { replacement: f.replacement, why: f.reason } : {}),
    ...(f.class === 'flag' ? { candidates: f.candidates, why: f.reason } : {}),
    ...(f.class === 'missing' ? { why: f.reason } : {}),
    // compiled from a scanned Sass/LESS source: listed, not counted (the source is)
    ...(f.twin ? { twin: f.twin } : {}),
    // compiled CSS carrying a value its source does not (a stale or hand-edited build): counted here
    ...(f.outOfSync ? { outOfSync: f.outOfSync } : {})
  }))
  const count = (k) => scan.findings.filter((f) => f.class === k && !f.twin).length
  const totals = {
    auto: count('auto'),
    flag: count('flag'),
    keep: count('keep'),
    missing: count('missing'),
    converted: over.converted ?? 0,
    files: scan.files.length,
    twin: scan.findings.filter((f) => f.twin).length,
    framework: scan.findings.filter((f) => f.framework).length,
    outOfSync: scan.findings.filter((f) => f.outOfSync).length
  }
  const declared = scan.declared.filter((n) => isRoleVariable(n))
  // a required role the template never reads fails VARS-1 as surely as a hard-coded value
  // roles the template declares it has no place for; an always-required one is refused (still missing)
  const notUsed = (scan.notUsed ?? []).filter((n) => canBeNotUsed(n.name))
  const notUsedRefused = (scan.notUsed ?? []).filter((n) => !canBeNotUsed(n.name))
  const missingRoles = missingRoleVariables(declared, notUsed)
  return {
    schema: ROLE_SCAN_REPORT_SCHEMA,
    template: over.template ?? scan.meta.template,
    platform: over.platform ?? scan.meta.platform,
    version: over.version ?? scan.meta.version,
    scannedAt: (over.now ?? new Date()).toISOString(),
    scanner: SCANNER,
    declared,
    missingRoles,
    notUsed: notUsed.map(({ name, reason }) => ({ name, reason })),
    ...(notUsedRefused.length ? { notUsedRefused: notUsedRefused.map((n) => n.name) } : {}),
    hardcoded,
    totals,
    unresolved: totals.auto + totals.flag + totals.missing + missingRoles.length,
    filesScanned: scan.files,
    skipped: scan.skipped
  }
}

/** A short Markdown summary for the person packaging the release. */
export function humanSummary(report) {
  const t = report.totals
  const lines = [
    `# Role scan: ${report.template} ${report.version ?? ''} (${report.platform ?? 'unknown platform'})`,
    '',
    `${t.files} files scanned. Auto-convert: ${t.auto}${t.converted ? ` (converted this run: ${t.converted})` : ''} · Flag for agent: ${t.flag} · Role not read: ${t.missing ?? 0} · Keep: ${t.keep} · Unresolved: ${report.unresolved}`,
    `Role variables read: ${report.declared.length}.`
  ]
  if (report.missingRoles?.length)
    lines.push(
      `Required roles never read (VARS-1 fails): ${report.missingRoles.join(', ')}: read each where its role paints.`
    )
  if (t.twin)
    lines.push(
      `Compiled twins: ${t.twin} findings in CSS compiled from a scanned Sass/LESS source, listed but counted at the source (--write rewrites both).`
    )
  if (t.outOfSync)
    lines.push(
      `Compiled CSS out of sync with source: ${t.outOfSync} findings only the compiled CSS carries (stale or hand-edited build), counted where they are.`
    )
  const group = (k) => report.hardcoded.filter((h) => h.class === k)
  if (group('auto').length) {
    lines.push('', '## Auto-convert (role is clear)')
    for (const h of group('auto')) lines.push(`- ${h.file}:${h.line} \`${h.value}\` → \`${h.replacement}\``)
  }
  if (group('flag').length) {
    lines.push('', '## Flag for agent (role unclear: settle by hand)')
    for (const h of group('flag'))
      lines.push(
        `- ${h.file}:${h.line} ${h.component}: \`${h.value}\`. ${h.why}. Candidates: ${(h.candidates ?? []).join(', ') || 'none'}`
      )
  }
  if (group('missing').length) {
    lines.push('', '## Role not read (the component declares no corner: add one that reads the role)')
    for (const h of group('missing')) lines.push(`- ${h.file}:${h.line} ${h.component}: ${h.why}`)
  }
  if (group('keep').length) {
    lines.push('', '## Keep (not a design role)')
    const byReason = new Map()
    for (const h of group('keep'))
      byReason.set(h.reason, [...(byReason.get(h.reason) ?? []), `${h.file}:${h.line}`])
    for (const [reason, at] of byReason)
      lines.push(`- ${reason}: ${at.length} (${at.slice(0, 6).join(', ')}${at.length > 6 ? ', ...' : ''})`)
  }
  if (report.skipped?.length)
    lines.push('', `Skipped: ${report.skipped.map((s) => `${s.file} (${s.reason})`).join('; ')}`)
  return `${lines.join('\n')}\n`
}
