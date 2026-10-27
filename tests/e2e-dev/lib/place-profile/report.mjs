// The acceptance file of the place-profile line: `tasks/e2e-wo-place-profile-<YYYY-MM-DD>.md` (plan §4, §7). One
// section per case with what §7 asks of each — deploy SHA, release, sidecar and profile hashes, URL, every
// assertion PASS/FAIL — read from the run's `report.json` (which `report.mjs` wrote). Screenshots stay in the run
// folder (outside the repository); the file names them by path only. Several runs on one day append.

import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

const TITLES = Object.freeze({
  E1: 'Gym, Tracy Base (Joomla)',
  E2: 'Restaurant with a menu, ja-restaurant (WordPress)',
  E3: 'Open repo, demo-request/v2, spa',
  E4: 'Old client, demo-request/v1, gym',
  E5: '/ops Road to live, Slot roles',
  E6: 'Details, place profile + coverage',
  E7: 'Gym, Tracy Base (EmDash)',
  E8: 'Languages (vi, ja)',
  E9: 'Broken sidecar',
  E10: 'Group lock',
  E11: 'Bad input',
  E12: 'Repeats and recovery',
  E13: 'Visitor experience'
})

const code = (v) => (v === null || v === undefined || v === '' ? '—' : `\`${v}\``)

/** The checks of a judged demo, flattened to `viewport url: name PASS|FAIL`. */
function checkLines(details) {
  const lines = []
  for (const p of details?.pages ?? [])
    for (const c of p.checks ?? [])
      lines.push(
        `  - ${c.pass ? 'PASS' : '**FAIL**'} ${p.viewport} ${p.url} · ${c.name}${c.pass ? '' : ` — ${JSON.stringify(c.detail?.problems ?? c.detail).slice(0, 200)}`}`
      )
  return lines
}

/**
 * The Markdown of one run.
 * @param {{ runDir: string, runId: string, report: any }} r
 */
export function placeProfileMarkdown({ runDir, runId, report }) {
  const d = report.deploy ?? {}
  const out = [
    `## Run \`${runId}\` · ${report.environment} (${report.origin}) · ${report.startedAt}`,
    '',
    `- Deploy: web image ${code(d.env?.APP_IMAGE_TAG)}, dsh commit ${code(d.env?.DSH_SOURCE_COMMIT)}${report.deployChangedDuringRun?.length ? ` — **changed during the run** (${report.deployChangedDuringRun.join(', ')})` : ''}`,
    `- Flags: ${JSON.stringify(report.flags)}`,
    `- Verdicts: ${report.summary.pass} PASS · ${report.summary.fail} FAIL · ${report.summary.blocked} BLOCKED · ${report.summary.notRun} NOT RUN`,
    `- Evidence and screenshots: \`${runDir}\` (not in the repository)`,
    '',
    '| Case | Verdict | Reason |',
    '|---|---|---|',
    ...report.journeys
      .filter((j) => /^E\d+$/.test(j.id))
      .map(
        (j) =>
          `| ${j.id} ${TITLES[j.id] ?? ''} | ${j.verdict} | ${String(j.reason ?? '')
            .replace(/\|/g, '\\|')
            .slice(0, 220)} |`
      ),
    ''
  ]
  for (const j of report.journeys.filter((x) => /^E\d+$/.test(x.id))) {
    const det = j.attempts?.at(-1)?.details ?? {}
    out.push(`### ${j.id} — ${TITLES[j.id] ?? ''}: ${j.verdict}`, '')
    if (j.reason) out.push(`- Reason: ${j.reason}`)
    if (det.needs)
      out.push(
        `- Needs: ${det.needs.line} (${det.needs.what}); declared ${det.needs.declared}, host announces profile/1: ${det.needs.hostAnnouncesProfile}`
      )
    if (det.release)
      out.push(`- Release: ${code(det.release.key)} ${det.release.version ? `v${det.release.version}` : ''}`)
    if (det.sidecar)
      out.push(
        `- Sidecar: ${det.sidecar.state}, sha256 ${code(det.sidecar.sha256)}, baseHash ${code(det.sidecar.baseHash)}`
      )
    if (det.profile)
      out.push(
        `- Profile: hash ${code(det.profile.hash)}, trade ${code(det.profile.trade)}, ${det.profile.offerings} offering(s)`
      )
    if (det.url) out.push(`- URL: ${det.url}`)
    if (det.demo)
      out.push(
        `- Demo: ${code(det.demo.id)} ${det.demo.status} (${(det.demo.seen ?? []).join(' → ')}), site ${code(det.demo.siteKey)}`
      )
    if (det.create) out.push(`- POST /v1/demos: ${det.create.status} ${det.create.code ?? ''}`)
    if (det.trade)
      out.push(
        `- Trade: candidate ${code(det.trade.candidate)}, brief ${code(det.trade.brief)}, pages ${(det.trade.pages ?? []).join(', ') || '—'}, asks dishes ${det.trade.asksDishes}`
      )
    if (det.home)
      out.push(
        `- Home: ${det.home.url} · ${det.home.sections} section(s) · ${det.home.images} image(s) · broken ${det.home.broken?.length ?? 0} · shot \`${det.home.shot}\``
      )
    if (det.local) out.push(`- Local: \`${JSON.stringify(det.local).slice(0, 600)}\``)
    if (det.roads) out.push(`- Roads: \`${JSON.stringify(det.roads).slice(0, 600)}\``)
    if (det.browserErrors)
      out.push(`- Browser errors (chrome-watch since ${det.browserErrors.since}): ${det.browserErrors.count}`)
    out.push(...checkLines(det))
    for (const n of j.attempts?.at(-1)?.notes ?? []) out.push(`- Note: ${n}`)
    out.push('')
  }
  return out.join('\n')
}

/** Write (or append to) the day's acceptance file; returns its path. */
export function writePlaceProfileReport({ runDir, runId, report, now = new Date() }) {
  const day = now.toISOString().slice(0, 10)
  const file = join(REPO, 'tasks', `e2e-wo-place-profile-${day}.md`)
  const md = placeProfileMarkdown({ runDir, runId, report })
  if (existsSync(file)) appendFileSync(file, `\n${md}\n`)
  else
    writeFileSync(
      file,
      `# Place profile acceptance E2E — ${day}\n\nWritten by \`node tests/e2e-dev/run.mjs --tier place-profile\` (plan \`tasks/plan-wo-place-profile-code.md\` §4, §7). One section per run.\n\n${md}\n`
    )
  return file
}
