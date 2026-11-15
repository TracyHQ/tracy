// The second opinion of the secret scan (ticket #586): the pinned gitleaks (`scripts/opensource/install-gitleaks.mjs`)
// over the same texts the rules read, with its own default rules and `--redact`, so its report never holds a value.
// The texts are written to a temporary folder (deleted at the end, whatever happens) under neutral names mapped back
// to the published ones; a finding is fingerprinted from the scan's own copy of the text at the line and columns
// gitleaks names. A machine without the pinned binary gets `not_available`, never a silent pass.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GITLEAKS_PATH, GITLEAKS_VERSION } from '../../opensource/install-gitleaks.mjs'
import { fingerprintOf } from './secret-rules.mjs'

/** The pinned binary, or why it cannot run: `{bin}` or `{reason}`. */
export function pinnedGitleaks(bin = process.env.GITLEAKS_BIN ?? GITLEAKS_PATH) {
  if (!existsSync(bin))
    return { reason: 'no gitleaks at the pinned path (node scripts/opensource/install-gitleaks.mjs)' }
  try {
    const version = execFileSync(bin, ['version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    if (version !== GITLEAKS_VERSION)
      return { reason: 'gitleaks ' + version + ' found, ' + GITLEAKS_VERSION + ' pinned' }
  } catch (error) {
    return { reason: 'gitleaks does not run: ' + error.message }
  }
  return { bin }
}

/**
 * Run gitleaks over texts. `{status: 'ran', version, findings}` or `{status: 'not_available', reason}`; a run that
 * fails is `{status: 'failed', reason}`.
 * @param {Iterable<{file: string, text: string}>} texts
 */
export function gitleaksFindings(texts, { bin } = {}) {
  const pinned = bin ? { bin } : pinnedGitleaks()
  if (!pinned.bin) return { status: 'not_available', reason: pinned.reason }
  const work = mkdtempSync(path.join(tmpdir(), 'aiq-secrets-'))
  try {
    const tree = path.join(work, 'tree')
    mkdirSync(tree)
    const byName = new Map()
    let n = 0
    for (const t of texts) {
      // A neutral name keeps gitleaks from guessing a decompressor from the published name.
      const name = 'f' + String((n += 1)).padStart(6, '0') + '.txt'
      writeFileSync(path.join(tree, name), t.text)
      byName.set(name, t)
    }
    const report = path.join(work, 'report.json')
    const args = ['dir', tree, '--redact', '--no-banner', '--report-format', 'json', '--report-path', report]
    const r = spawnSync(pinned.bin, [...args, '--exit-code', '0', '--log-level', 'error'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 1 << 26
    })
    if (r.status !== 0) return { status: 'failed', reason: 'gitleaks exited ' + r.status }
    const findings = []
    for (const f of JSON.parse(readFileSync(report, 'utf8'))) {
      const t = byName.get(path.basename(f.File))
      if (!t) continue
      const line = t.text.split('\n')[f.StartLine - 1] ?? ''
      const value = f.StartLine === f.EndLine ? line.slice(f.StartColumn - 1, f.EndColumn) : line
      findings.push({
        file: t.file,
        at: 'line:' + f.StartLine,
        rule: 'gitleaks:' + f.RuleID,
        fingerprint: fingerprintOf(value)
      })
    }
    return { status: 'ran', version: GITLEAKS_VERSION, findings }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
