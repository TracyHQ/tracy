// Many runs on one page (plan §4 S8): every `report.json` written in a time window — the suite's
// runs (`<resultsRoot>/<runId>/`) and the regression runner's dev runs (`<resultsRoot>/reg/<runId>/`)
// — as one table of journey × CMS × run, headed by the deploys those runs measured. Readable in two
// minutes: the deploys first, then one line per run, then the grid, then why each red row is red.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {{ dir: string, kind: 'suite' | 'reg', report: any }} RunReport
 */

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Reports whose run started inside `[since, until)`. Folders without a report of this shape are
 * skipped (the results root is shared with other tools).
 * @param {string} root
 * @param {{ since: Date, until: Date }} window
 * @returns {RunReport[]} oldest first
 */
export function collectReports(root, { since, until }) {
  /** @type {RunReport[]} */
  const out = []
  const scan = (base, kind) => {
    if (!existsSync(base)) return
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(base, entry.name)
      const report = readJson(join(dir, 'report.json'))
      if (!report || typeof report.runId !== 'string' || !Array.isArray(report.journeys)) continue
      const at = new Date(report.startedAt)
      if (!(at >= since && at < until)) continue
      out.push({ dir, kind, report })
    }
  }
  scan(root, 'suite')
  scan(join(root, 'reg'), 'reg')
  return out.toSorted((a, b) => String(a.report.startedAt).localeCompare(String(b.report.startedAt)))
}

const tag = (image) =>
  typeof image === 'string' && image.includes(':') ? image.slice(image.lastIndexOf(':') + 1) : '—'

/** `web · dsh · sidebar` of a run's deploy manifest; `—` when the run measured none. */
export function deployKey(report) {
  const d = report.deploy
  if (!d?.images) return '—'
  const web = tag(Object.entries(d.images).find(([k]) => k.endsWith('web-1'))?.[1])
  const dsh = tag(Object.entries(d.images).find(([k]) => k.endsWith('dsh'))?.[1])
  const sidebar = d.plugins?.['dsh-better-sidebar'] ?? '—'
  return `${web} · ${dsh} · ${sidebar}`
}

const cell = (row) => {
  if (!row) return ''
  const s = Math.round((row.ms ?? 0) / 1000)
  const verdict = row.verdict === 'NOT RUN' ? 'NOT RUN' : row.verdict
  return `${verdict}${row.retries ? ' ↻' : ''}${row.verdict === 'PASS' || row.verdict === 'FAIL' ? ` ${s} s` : ''}`
}

const oneLine = (text, max = 160) =>
  String(text ?? '')
    // Playwright's call logs carry terminal colour codes.
    // oxlint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
    .slice(0, max)

const hhmm = (iso) =>
  String(iso ?? '')
    .slice(5, 16)
    .replace('T', ' ')

/**
 * The grid for one kind of run: one row per journey × CMS seen in any run, one column per run.
 * @param {RunReport[]} runs
 */
function grid(runs) {
  const keyOf = (j) => `${j.id}\u0000${j.cms ?? ''}`
  /** @type {Map<string, { id: string, cms: string | null }>} */
  const rows = new Map()
  for (const r of runs) for (const j of r.report.journeys) if (!rows.has(keyOf(j))) rows.set(keyOf(j), j)
  const order = (id) => {
    const m = /^([A-Z]+)-?(\d+)([a-z]?)$/.exec(id)
    return m ? `${m[1]}${m[2].padStart(4, '0')}${m[3]}` : id
  }
  const sorted = [...rows.values()].toSorted(
    (a, b) => order(a.id).localeCompare(order(b.id)) || String(a.cms ?? '').localeCompare(String(b.cms ?? ''))
  )
  const lines = []
  lines.push(
    `| Journey | CMS | ${runs.map((r) => `\`${r.report.runId}\``).join(' | ')} |`,
    `|---|---|${runs.map(() => '---').join('|')}|`
  )
  const reds = []
  for (const j of sorted) {
    const cells = runs.map((r) => cell(r.report.journeys.find((x) => keyOf(x) === keyOf(j))))
    lines.push(`| ${j.id} | ${j.cms ?? '—'} | ${cells.join(' | ')} |`)
    // The newest red verdict of the row, with its reason: what to read first.
    for (const r of runs.toReversed()) {
      const x = r.report.journeys.find((y) => keyOf(y) === keyOf(j))
      if (x && x.verdict !== 'PASS') {
        reds.push(
          `- **${j.id}${j.cms ? ` ${j.cms}` : ''}** — ${x.verdict} in \`${r.report.runId}\`: ${oneLine(x.reason) || '(no reason recorded)'}`
        )
        break
      }
    }
  }
  return { lines, reds }
}

/**
 * The summary page.
 * @param {RunReport[]} runs - oldest first
 * @param {{ since: Date, until: Date }} window
 * @returns {string} markdown
 */
export function buildSummary(runs, { since, until }) {
  const all = runs.flatMap((r) => r.report.journeys)
  const n = (v) => all.filter((j) => j.verdict === v).length
  const lines = [
    `# E2E dev — summary ${since.toISOString().slice(0, 16)}Z → ${until.toISOString().slice(0, 16)}Z`,
    ''
  ]
  if (runs.length === 0) return `${lines.join('\n')}_No run in this window._\n`
  lines.push(
    `**${runs.length} run(s) · ${n('PASS')} PASS · ${n('FAIL')} FAIL · ${n('BLOCKED')} BLOCKED · ${n('NOT RUN')} NOT RUN** (verdicts, all runs)`,
    ''
  )

  lines.push('## Deploys measured', '', '| Deploy (web/host · dsh · sidebar) | Runs |', '|---|---|')
  /** @type {Map<string, string[]>} */
  const deploys = new Map()
  for (const r of runs) {
    const k = deployKey(r.report)
    deploys.set(k, [...(deploys.get(k) ?? []), r.report.runId])
  }
  for (const [k, ids] of deploys) lines.push(`| \`${k}\` | ${ids.map((id) => `\`${id}\``).join(', ')} |`)
  const straddled = runs.filter((r) => r.report.deployChangedDuringRun?.length)
  if (straddled.length)
    lines.push(
      '',
      `A deploy landed during ${straddled.map((r) => `\`${r.report.runId}\``).join(', ')}: those verdicts belong to neither deploy alone.`
    )

  lines.push(
    '',
    '## Runs',
    '',
    '| Run | Kind | Started (UTC) | Deploy | PASS | FAIL | BLOCKED | NOT RUN | Cleanup |',
    '|---|---|---|---|---|---|---|---|---|'
  )
  for (const r of runs) {
    const s = r.report.summary ?? {}
    const left = (r.report.leftover ?? []).filter((x) => x.state !== 'kept').length
    lines.push(
      `| \`${r.report.runId}\` | ${r.kind === 'reg' ? '--reg' : 'suite'} | ${hhmm(r.report.startedAt)} | \`${deployKey(r.report).split(' · ')[0]}\` | ${s.pass ?? 0} | ${s.fail ?? 0} | ${s.blocked ?? 0} | ${s.notRun ?? 0} | ${left ? `**${left} left**` : 'clean'} |`
    )
  }

  for (const [kind, title] of [
    ['suite', 'Journey × CMS × run'],
    ['reg', 'Regression cases on dev (`--reg`) × run']
  ]) {
    const mine = runs.filter((r) => r.kind === kind)
    if (mine.length === 0) continue
    const { lines: g, reds } = grid(mine)
    lines.push('', `## ${title}`, '')
    // What to read first sits above the grid; the grid is the evidence behind it.
    if (reds.length) lines.push('**Why red (newest red verdict of each row):**', '', ...reds, '')
    lines.push("`↻` = passed or failed after a retry; time is the journey's own.", '', ...g)
  }
  lines.push('')
  return lines.join('\n')
}
