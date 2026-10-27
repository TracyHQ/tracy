/**
 * report.md and coverage-run.json for one run. Counts are computed from the results, never typed;
 * a figure is never printed as complete when the denominator says it is not.
 */
import fs from 'node:fs'
import path from 'node:path'

import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync } from '../../lib/bounded-reader.mjs'

/** What this layer does NOT prove, printed on every report. */
export const SEAMS = Object.freeze([
  'docker: a stand-in CLI records `docker exec` argv (container, user, workdir); no container runs, so the effect INSIDE a site container is not observed',
  'tracy-web: the doors (/turn, /moment, /apply, /changed) are a local HTTP recorder; no Postgres, no Site changes table, no CMS plugin sits behind them',
  'EmDash MCP: tracy_emdash talks to a scripted MCP through the exec seam; EmDash itself is not run',
  'pwsh and terminal_open: not loaded on this host; a recording fixture stands behind the real hooks and dispatcher',
  'model: a scripted model with a fixed seed; the live-model set runs only with --live-model and credentials',
  'permission revocation by dsh-passwords (seat lowered to read-only) needs the real gate: only the dsh-level mode change is exercised'
])

const count = (results, verdict) => results.filter((r) => r.verdict === verdict).length

export function coverageRun(results, file = null) {
  // No coverage file is no coverage; a file the reader refuses (or whose parent is broken) is an error.
  if (file === null) return null
  const doc = readBoundedJsonSync(file, { maxBytes: MAX_LAYER_FILE_BYTES, allowMissing: true })
  if (doc === null) return null
  const byId = new Map(results.map((r) => [r.id, r.verdict]))
  const cells = { covered: 0, na: 0, open: 0, allPass: 0, anyFail: 0, anyEnv: 0, notRun: 0 }
  const items = []
  for (const item of doc.items) {
    const row = {
      item: item.item,
      kind: item.kind,
      pass: 0,
      fail: 0,
      env: 0,
      pending: 0,
      notRun: 0,
      na: 0,
      open: 0
    }
    for (const cell of Object.values(item.cells)) {
      if (cell.startsWith('na:')) {
        row.na += 1
        cells.na += 1
      } else if (cell.startsWith('open:')) {
        row.open += 1
        cells.open += 1
      } else {
        cells.covered += 1
        const verdicts = cell
          .slice('covered:'.length)
          .split(',')
          .map((id) => byId.get(id) ?? 'NOT-RUN')
        if (verdicts.every((v) => v === 'PASS')) {
          row.pass += 1
          cells.allPass += 1
        } else if (verdicts.includes('FAIL')) {
          row.fail += 1
          cells.anyFail += 1
        } else if (verdicts.includes('ENV')) {
          row.env += 1
          cells.anyEnv += 1
        } else if (verdicts.includes('NOT-RUN')) {
          row.notRun += 1
          cells.notRun += 1
        } else row.pending += 1
      }
    }
    items.push(row)
  }
  return { incomplete: doc.incomplete, revision: doc.revision, cells, items }
}

export function writeReport({
  out,
  results,
  manifests,
  detail,
  target,
  proveRed,
  liveModel,
  durationMs,
  missing,
  workers = 1
}) {
  const total = results.length
  const red = results.filter((r) => r.redProof !== null).length
  // `<out>/generated` exists only when the run expanded documents. When that directory is absent there is
  // no coverage file to read; when it is present (a symlink included) the file is read under the strict rules.
  const generatedDir = path.join(out, 'generated')
  const hasGenerated = (() => {
    try {
      fs.lstatSync(generatedDir)
      return true
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  })()
  const cov = coverageRun(results, hasGenerated ? path.join(generatedDir, 'coverage.json') : null)
  const lines = []
  lines.push('# QA harness layer — run report', '')
  lines.push(
    `- target: ${target}  ·  prove-red: ${proveRed}  ·  live-model: ${liveModel}  ·  duration: ${(durationMs / 1000).toFixed(1)}s  ·  workers: ${workers}`
  )
  lines.push(
    `- cases: ${total}  ·  PASS ${count(results, 'PASS')}  ·  FAIL ${count(results, 'FAIL')}  ·  ENV ${count(results, 'ENV')}  ·  PENDING ${count(results, 'PENDING')}  ·  RED-proven ${red}`
  )
  if (cov !== null) {
    const c = cov.cells
    lines.push(
      `- denominator cells: covered ${c.covered} (written) · N/A ${c.na} · open ${c.open}${cov.incomplete ? ' · **denominator INCOMPLETE** (see generated/denominator.json `unresolved`)' : ''}`
    )
    lines.push(
      `- of the covered cells: all cases PASS ${c.allPass} · a case FAILs ${c.anyFail} · ENV ${c.anyEnv} · only PENDING ${c.covered - c.allPass - c.anyFail - c.anyEnv - c.notRun} · not run ${c.notRun}`
    )
    lines.push(
      '- "covered" means a deterministic case exists; only PASS (green + RED proof) counts as holding. No percentage is printed: open cells are real and are not in any ratio.'
    )
  }
  if (missing.length > 0)
    lines.push(`- build probe: missing ${missing.length} built output(s) → runtime cases are ENV`)
  lines.push('', '## What this run does not prove (seams)', '')
  for (const seam of SEAMS) lines.push(`- ${seam}`)

  const fails = results.filter((r) => r.verdict === 'FAIL')
  lines.push('', `## FAIL (${fails.length})`, '')
  if (fails.length === 0) lines.push('none')
  for (const r of fails)
    lines.push(
      `- \`${r.id}\` — ${r.reason}${r.evidence.length ? ` — evidence: ${r.evidence.join(', ')}` : ''}`
    )

  for (const verdict of ['ENV', 'PENDING']) {
    const list = results.filter((r) => r.verdict === verdict)
    lines.push('', `## ${verdict} (${list.length})`, '')
    const groups = new Map()
    for (const r of list) {
      const key = r.reason.replace(/\b(QA-HARNESS-[A-Za-z0-9_-]+|harness\.[A-Za-z0-9_.+-]+)/g, '<id>')
      groups.set(key, [...(groups.get(key) ?? []), r.id])
    }
    // Every id is listed with its reason and evidence: a grouped example is not a report of each non-PASS.
    for (const [reason, ids] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`- (${ids.length}) ${reason}`)
      for (const id of ids) {
        const r = list.find((x) => x.id === id)
        const own = r.reason === reason ? '' : ` — ${r.reason}`
        lines.push(`  - \`${id}\`${own}${r.evidence.length ? ` — evidence: ${r.evidence.join(', ')}` : ''}`)
      }
    }
  }
  lines.push('', `Generated by tests/qa/layers/harness/run.mjs (${manifests.length} manifests selected).`, '')
  const tmp = path.join(out, `report.md.tmp-${process.pid}`)
  fs.writeFileSync(tmp, lines.join('\n'))
  fs.renameSync(tmp, path.join(out, 'report.md'))
  if (cov !== null) {
    const f = path.join(out, 'coverage-run.json')
    fs.writeFileSync(`${f}.tmp-${process.pid}`, `${JSON.stringify(cov, null, 2)}\n`)
    fs.renameSync(`${f}.tmp-${process.pid}`, f)
  }
  void detail
}
