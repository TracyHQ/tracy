#!/usr/bin/env node
// One table per run of TC cases (M-*, W-*, J-*, E-* ids — bench/analyze.mjs only reads C* and V4–V6 ids, so its
// analysis.json and compare.mjs come out empty for these). Reads <out>/<label>/<case>/result.json and trace.json.
//   node summarize-d.mjs <out-dir> [--vs <other-out-dir>] [--json]
// --vs: the same case ids side by side (e.g. the A run on benchwp02 against the D run on benchwpapply01).
// --json writes <out-dir>/summary-d.json.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { loadAll } from '../../tc/lib.mjs'

const argv = process.argv.slice(2)
const OUT = argv[0]
const VS = argv.includes('--vs') ? argv[argv.indexOf('--vs') + 1] : null
if (!OUT) {
  console.error('usage: node summarize-d.mjs <out-dir> [--vs <other-out-dir>] [--json]')
  process.exit(2)
}
const tier = Object.fromEntries((await loadAll()).cases.map((c) => [c.id, c.tier ?? '?']))
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)
function rowsOf(out) {
  const rows = []
  for (const label of readdirSync(out).filter((d) => statSync(`${out}/${d}`).isDirectory())) {
    for (const id of readdirSync(`${out}/${label}`)
      .filter((d) => existsSync(`${out}/${label}/${d}/result.json`))
      .sort()) {
      const r = read(`${out}/${label}/${id}/result.json`)
      const t = read(`${out}/${label}/${id}/trace.json`)?.totals ?? null
      const verdict =
        r.outcome === 'n/a' ? 'n/a' : r.pass ? 'PASS' : r.acceptable ? 'OK' : r.error ? 'ERROR' : 'FAIL'
      rows.push({
        label,
        platform: r.platform,
        case: id,
        tier: tier[id] ?? '?',
        verdict,
        outcome: r.outcome,
        asked: r.asked ?? false,
        agentS:
          typeof (t?.agentMs ?? r.agentMs) === 'number'
            ? Math.round((t?.agentMs ?? r.agentMs) / 100) / 10
            : null,
        steps: t?.steps ?? r.budgetCheck?.measured?.steps ?? null,
        calls: t?.calls ?? r.budgetCheck?.measured?.calls ?? null,
        budget: r.budgetCheck ? (r.budgetCheck.pass ? 'ok' : 'OVER') : '-',
        why:
          r.outcome === 'n/a'
            ? `missing ${(r.missing ?? []).join(', ')}`
            : r.error
              ? String(r.error).split('\n')[0].slice(0, 120)
              : (r.checks ?? [])
                  .filter((c) => !c.ok)
                  .map((c) => c.what)
                  .slice(0, 2)
                  .join(' | ')
                  .slice(0, 160)
      })
    }
  }
  return rows
}
const rows = rowsOf(OUT)
const other = VS ? Object.fromEntries(rowsOf(VS).map((r) => [r.case, r])) : null
const pad = (s, n) => String(s ?? '-').padEnd(n)
for (const t of ['P0', 'P1', '?']) {
  const list = rows.filter((r) => r.tier === t)
  if (!list.length) continue
  const n = (v) => list.filter((r) => r.verdict === v).length
  console.log(
    `\n${t}: ${list.length} cases · PASS ${n('PASS')} · OK ${n('OK')} · FAIL ${n('FAIL')} · ERROR ${n('ERROR')} · n/a ${n('n/a')}`
  )
  for (const r of list) {
    const vs = other
      ? other[r.case]
        ? `  | vs ${pad(other[r.case].verdict, 5)} ${pad(other[r.case].agentS, 6)}s`
        : '  | vs -'
      : ''
    console.log(
      `  ${pad(r.case, 28)} ${pad(r.platform, 9)} ${pad(r.verdict, 5)} ${pad(r.agentS, 6)}s ${pad(r.steps, 3)} steps ${pad(r.budget, 4)}${vs}  ${r.verdict === 'PASS' ? '' : r.why}`
    )
  }
}
if (argv.includes('--json')) writeFileSync(`${OUT}/summary-d.json`, `${JSON.stringify(rows, null, 1)}\n`)
