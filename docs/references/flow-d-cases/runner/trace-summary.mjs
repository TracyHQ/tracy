// Speed across a whole run: role × level × CMS from every case's trace (trace.mjs), and the 10 slowest steps.
//   node trace-summary.mjs <out-dir> [--json]
// A case dir without trace.json is traced on the fly (not written). Grouped by the CMS a case ran on
// (result.platform), never by site label, so a run sharded over several sites per CMS reads as one column.
// Cells are medians for time (agent = model + tools + idle, customer time left out) and means for counts.
import { existsSync, readFileSync } from 'node:fs'
import { buildTrace, caseDirs } from './trace.mjs'

const OUT = process.argv[2]
if (!OUT) {
  console.error('usage: node trace-summary.mjs <out-dir> [--json]')
  process.exit(2)
}
const traces = []
for (const dir of caseDirs(OUT)) {
  let t = null
  try {
    t = existsSync(`${dir}/trace.json`)
      ? JSON.parse(readFileSync(`${dir}/trace.json`, 'utf8'))
      : buildTrace(
          readFileSync(`${dir}/session.jsonl`, 'utf8'),
          existsSync(`${dir}/result.json`) ? JSON.parse(readFileSync(`${dir}/result.json`, 'utf8')) : null
        )
  } catch (error) {
    console.error(`${dir}: ${String(error.message).slice(0, 120)}`)
    continue
  }
  t.dir = dir
  t.case ??= dir.split('/').pop()
  traces.push(t)
}
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const runnerErr = (t) => /RUNNER|fixture .* missing|no Comment button/.test(t.verdict?.error ?? '')
function cell(list) {
  const valid = list.filter((t) => !runnerErr(t))
  const T = (k) => valid.map((t) => t.totals[k] / 1000)
  return {
    n: valid.length,
    pass: valid.filter((t) => t.verdict?.pass).length,
    ok: valid.filter((t) => t.verdict?.acceptable).length,
    runner: list.length - valid.length,
    agentS: median(T('agentMs')),
    modelS: median(T('modelMs')),
    toolS: median(T('toolMs')),
    idleS: median(T('idleMs')),
    steps: mean(valid.map((t) => t.totals.steps)),
    calls: mean(valid.map((t) => t.totals.calls)),
    refused: valid.reduce((a, t) => a + t.totals.refused, 0),
    newK: mean(valid.map((t) => t.totals.tokens.new / 1000)),
    promptK: mean(valid.map((t) => t.totals.tokens.prompt / 1000)),
    outK: mean(valid.map((t) => t.totals.tokens.output / 1000)),
    overBudget: valid.filter((t) => t.verdict?.budget && !t.verdict.budget.pass).length,
    // 29/09: writes of every road (door / file / build), and turns handed back without a change.
    writes: mean(valid.map((t) => Object.values(t.totals.writeKinds ?? {}).reduce((a, b) => a + b, 0))),
    handed: valid.reduce((a, t) => a + (t.totals.handedBack ?? 0), 0)
  }
}
const CMS = ['wordpress', 'joomla', 'emdash']
const roleOf = (t) => t.role ?? '-'
const levelOf = (t) => (t.level ? `L${t.level}` : '-')
const groups = new Map()
const put = (k, t) => {
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(t)
}
for (const t of traces) {
  const p = t.platform ?? '?'
  put(`${roleOf(t)}|${levelOf(t)}|${p}`, t)
  put(`${roleOf(t)}|${levelOf(t)}|ALL`, t)
  put(`${roleOf(t)}|ALL|${p}`, t)
  put(`${roleOf(t)}|ALL|ALL`, t)
  put(`ALL|${levelOf(t)}|${p}`, t)
  put(`ALL|${levelOf(t)}|ALL`, t)
  put(`ALL|ALL|${p}`, t)
  put('ALL|ALL|ALL', t)
}
const roles = [...new Set(traces.map(roleOf))].sort()
const levels = [...new Set(traces.map(levelOf))].sort()
const order = []
// An ALL row that would only repeat the one role / level above it is left out.
for (const r of [...roles, 'ALL'])
  for (const l of [...levels, 'ALL'])
    for (const p of [...CMS, 'ALL'])
      if (
        groups.has(`${r}|${l}|${p}`) &&
        !(r === 'ALL' && roles.length === 1) &&
        !(l === 'ALL' && levels.length === 1)
      )
        order.push(`${r}|${l}|${p}`)
const table = Object.fromEntries(order.map((k) => [k, cell(groups.get(k))]))
const slowest = traces
  .flatMap((t) =>
    t.steps
      .filter((s) => s.durMs !== null)
      .map((s) => ({
        case: t.case,
        platform: t.platform,
        site: t.site,
        n: s.n,
        turn: s.turn,
        durMs: s.durMs,
        gapBeforeMs: s.gapBeforeMs ?? null,
        modelMs: s.modelMs,
        ttfbMs: s.model?.ttfbMs ?? null,
        reasoningMs: s.model?.reasoningMs ?? 0,
        argsMs: s.model?.argsMs ?? 0,
        toolMs: s.toolMs,
        customerMs: s.customerMs,
        out: s.tokens.output,
        prompt: s.tokens.prompt,
        tools: s.tools.map((c) => `${c.verb}${c.refused ? ` ✗${c.refused}` : ''}`)
      }))
  )
  .sort((a, b) => b.durMs - a.durMs)
  .slice(0, 10)
const wasteKinds = {}
for (const t of traces)
  for (const w of t.waste ?? []) {
    const x = (wasteKinds[w.kind] ??= { cases: 0, count: 0, ms: 0 })
    x.cases++
    x.count += w.count ?? 1
    x.ms += w.ms ?? 0
  }
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ out: OUT, cases: traces.length, table, slowest, waste: wasteKinds }, null, 1))
  process.exit(0)
}
const f = (v, d = 0) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))
const cols = [
  ['role', 9, (k) => k.split('|')[0]],
  ['level', 6, (k) => k.split('|')[1]],
  ['cms', 10, (k) => k.split('|')[2]],
  ['n', 4, (_, c) => c.n],
  ['pass', 5, (_, c) => c.pass],
  ['ok', 4, (_, c) => c.ok],
  ['run', 4, (_, c) => c.runner],
  ['agent s', 8, (_, c) => f(c.agentS, 1)],
  ['model s', 8, (_, c) => f(c.modelS, 1)],
  ['tool s', 7, (_, c) => f(c.toolS, 1)],
  ['idle s', 7, (_, c) => f(c.idleS, 1)],
  ['steps', 6, (_, c) => f(c.steps, 1)],
  ['calls', 6, (_, c) => f(c.calls, 1)],
  ['ref', 4, (_, c) => c.refused],
  ['new k', 7, (_, c) => f(c.newK, 1)],
  ['prompt k', 9, (_, c) => f(c.promptK, 0)],
  ['out k', 6, (_, c) => f(c.outK, 1)],
  ['overBudget', 11, (_, c) => c.overBudget],
  ['writes', 7, (_, c) => f(c.writes, 1)],
  ['handed', 7, (_, c) => c.handed]
]
console.log(
  `\n${OUT}: ${traces.length} traced cases (time = median per case, counts = mean per case; agent = model + tools + idle, customer time left out)\n`
)
console.log(cols.map(([h, w], i) => (i < 3 ? String(h).padEnd(w) : String(h).padStart(w))).join(' '))
for (const [k, c] of Object.entries(table))
  console.log(
    cols.map(([, w, fn], i) => (i < 3 ? String(fn(k, c)).padEnd(w) : String(fn(k, c)).padStart(w))).join(' ')
  )
console.log('\n10 slowest steps:')
for (const s of slowest)
  console.log(
    `  ${(s.durMs / 1000).toFixed(1).padStart(6)} s  ${String(s.case).padEnd(14)} ${String(s.platform).padEnd(9)} step ${String(s.n).padEnd(3)} model ${f(s.modelMs / 1000, 1)} s (TTFB ${f(s.ttfbMs / 1000, 1)}, reasoning ${f(s.reasoningMs / 1000, 1)}, args ${f(s.argsMs / 1000, 1)}, ${s.out} out tok, prompt ${Math.round(s.prompt / 1000)}k) · tools ${f(s.toolMs / 1000, 1)} s${s.customerMs ? ` · customer ${f(s.customerMs / 1000, 1)} s` : ''}${s.gapBeforeMs > 1000 ? ` · +${f(s.gapBeforeMs / 1000, 1)} s before` : ''} · ${s.tools.join(', ').slice(0, 110) || 'answer'}`
  )
console.log('\nwaste across the run:')
for (const [kind, x] of Object.entries(wasteKinds).sort((a, b) => b[1].ms - a[1].ms))
  console.log(
    `  ${kind.padEnd(32)} ${String(x.cases).padStart(3)} cases · ${String(x.count).padStart(4)} × · ${(x.ms / 1000).toFixed(1)} s`
  )
