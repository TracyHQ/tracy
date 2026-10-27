// results.json / report.md writers and the exit-code rule for the infra layer.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const VERDICTS = ['PASS', 'FAIL', 'ENV', 'PENDING']

export function counts(results) {
  const out = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const r of results) out[r.verdict] += 1
  out.redProven = results.filter((r) => r.redProof).length
  return out
}

/** 0 every requested case PASS · 1 any FAIL · 3 only ENV/PENDING besides PASS. */
export function exitCodeFor(results) {
  if (results.some((r) => r.verdict === 'FAIL')) return 1
  return results.every((r) => r.verdict === 'PASS') ? 0 : 3
}

export function renderReport(results, { target, proveRed, extra = [] }) {
  const c = counts(results)
  const lines = [
    '# infra layer report',
    '',
    `target: ${target} · prove-red: ${proveRed}`,
    '',
    `PASS ${c.PASS} · FAIL ${c.FAIL} · ENV ${c.ENV} · PENDING ${c.PENDING} · RED-proven ${c.redProven} · cases ${results.length}`,
    '',
    ...extra
  ]
  for (const verdict of ['FAIL', 'ENV', 'PENDING']) {
    const rows = results.filter((r) => r.verdict === verdict)
    if (rows.length === 0) continue
    lines.push(`## ${verdict} (${rows.length})`, '')
    for (const r of rows)
      lines.push(
        `- \`${r.id}\` — ${r.reason}${r.evidence.length ? ` (evidence: ${r.evidence.join(', ')})` : ''}`
      )
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

export function writeOutputs(outDir, results, meta) {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
  writeFileSync(path.join(outDir, 'report.md'), renderReport(results, meta))
}
