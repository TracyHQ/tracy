// The run's report: `report.md` for a person (readable in two minutes, plan §1 "xong khi" (c)) and
// `report.json` for a machine. The top of the page is the deploy manifest J13 measured — the
// version of develop this run judged — then the verdicts, why each red one is red, retries, and
// every resource the run created with what became of it.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENV } from './env.mjs'
import { redact } from './redact.mjs'

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Assemble and write the report of one run.
 * @param {{ runDir: string, runId: string, requested: { id: string, cms: string | null }[],
 *   startedAt: string, finishedAt: string, flags: Record<string, any> }} run
 * @returns {{ md: string, json: any }}
 */
export function writeReport({ runDir, runId, requested, startedAt, finishedAt, flags }) {
  const deploy = readJson(join(runDir, 'deploy.json'))
  const deployEnd = readJson(join(runDir, 'deploy-end.json'))
  // Images that differ between J13 and the end of the run: the run straddled a deploy.
  const changed =
    deploy && deployEnd?.images && !deployEnd.images.error
      ? Object.keys({ ...deploy.images, ...deployEnd.images }).filter(
          (k) => deploy.images?.[k] !== deployEnd.images[k]
        )
      : []
  const manifest = readJson(join(runDir, 'manifest.json'))
  const dir = join(runDir, 'journeys')
  const recorded = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJson(join(dir, f)))
        .filter(Boolean)
    : []
  const key = (j) => `${j.id}${j.cms ? `-${j.cms}` : ''}`
  const byKey = new Map(recorded.map((j) => [key(j), j]))
  const rows = requested.map(
    (r) => byKey.get(key(r)) ?? { ...r, verdict: 'NOT RUN', reason: 'no result recorded', retries: 0, ms: 0 }
  )
  const count = (v) => rows.filter((r) => r.verdict === v).length
  const resources = manifest?.resources ?? []
  const leftover = resources.filter((r) => !['cleaned', 'never-created', 'kept-no-door'].includes(r.state))
  // Kept on --keep is what was asked for; anything else still open is a cleanup failure.
  const uncleaned = leftover.filter((r) => r.state !== 'kept')

  const json = redact({
    environment: ENV.name,
    origin: ENV.origin,
    runId,
    startedAt,
    finishedAt,
    flags,
    deploy,
    deployEnd,
    deployChangedDuringRun: changed,
    summary: {
      pass: count('PASS'),
      fail: count('FAIL'),
      blocked: count('BLOCKED'),
      notRun: count('NOT RUN'),
      total: rows.length
    },
    journeys: rows,
    resources,
    leftover
  })

  const lines = []
  lines.push(`# E2E ${ENV.name} — run \`${runId}\``, '')
  lines.push(`${ENV.origin} · ${startedAt} → ${finishedAt} · flags \`${JSON.stringify(flags)}\``, '')
  lines.push('## Deploy measured (J13)', '')
  if (deploy) {
    lines.push('| Piece | Value |', '|---|---|')
    for (const [k, v] of Object.entries(deploy.images ?? {})) lines.push(`| image ${k} | \`${v}\` |`)
    for (const [k, v] of Object.entries(deploy.env ?? {})) lines.push(`| ${k} | \`${v ?? '—'}\` |`)
    for (const [k, v] of Object.entries(deploy.plugins ?? {})) lines.push(`| ${k} | \`${v ?? '—'}\` |`)
    lines.push(`| templates | ${deploy.templates ?? '—'} |`)
    // The regression runner's dev profile reads the manifest without the health script.
    lines.push(
      `| check-server.sh | ${deploy.checkServer == null ? 'not run' : deploy.checkServer.ok ? 'all green' : `NOT green (${deploy.checkServer.failed ?? '?'} failed)`} |`
    )
    if (changed.length)
      lines.push(
        '',
        `**The deploy changed during this run** (${changed.map((k) => `${k}: \`${deploy.images?.[k]}\` → \`${deployEnd.images[k]}\``).join(', ')}): its verdicts belong to neither deploy alone.`
      )
  } else {
    lines.push('_J13 did not run: this report is not tied to a deploy._')
  }
  lines.push('', '## Verdicts', '')
  lines.push(
    `**${count('PASS')} PASS · ${count('FAIL')} FAIL · ${count('BLOCKED')} BLOCKED · ${count('NOT RUN')} NOT RUN** of ${rows.length}`,
    ''
  )
  lines.push('| Journey | CMS | Verdict | Time | Retries | Why |', '|---|---|---|---|---|---|')
  for (const r of rows) {
    // A PASS after a retry still shows what failed first: a flake is a finding too.
    const firstFail =
      r.verdict === 'PASS' && r.retries ? r.attempts?.find((a) => a.verdict !== 'PASS')?.reason : null
    const why = String(
      r.verdict === 'PASS'
        ? firstFail
          ? `passed on retry; first attempt: ${firstFail}`
          : ''
        : (r.reason ?? '')
    )
      .replace(/\|/g, '\\|')
      .slice(0, 300)
    lines.push(
      `| ${r.id} | ${r.cms ?? '—'} | ${r.verdict} | ${Math.round((r.ms ?? 0) / 1000)} s | ${r.retries ?? 0} | ${why} |`
    )
  }
  lines.push('', '## Resources this run created', '')
  if (resources.length === 0) lines.push('_none_')
  else {
    lines.push('| Kind | Id | State | Last detail |', '|---|---|---|---|')
    for (const r of resources) {
      const last = r.history?.at(-1)?.detail
      lines.push(
        `| ${r.kind} | \`${r.id}\` | ${r.state} | ${last ? JSON.stringify(last).replace(/\|/g, '\\|').slice(0, 200) : ''} |`
      )
    }
  }
  lines.push(
    '',
    uncleaned.length
      ? `**${uncleaned.length} resource(s) NOT cleaned — see above.**`
      : leftover.length
        ? `Manifest clean apart from ${leftover.length} resource(s) kept on --keep.`
        : 'Manifest clean.',
    ''
  )
  const md = redact(lines.join('\n'))
  writeFileSync(join(runDir, 'report.md'), md)
  writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(json, null, 2)}\n`)
  return { md, json }
}
