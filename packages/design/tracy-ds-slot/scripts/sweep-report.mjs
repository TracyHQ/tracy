#!/usr/bin/env node
/**
 * One table over a sweep of templates (each `<dir>/<template>/final/flow.json`, written by
 * pass-joomla.mjs / pass-wordpress.mjs / flow.mjs):
 *
 *   node scripts/sweep-report.mjs <sweep dir> > <sweep dir>/README-table.md
 *
 * Per template: the verdicts that pass, the controls (computed differences against the default as
 * released — 0 means the template looks exactly as it did), how much of the page follows each
 * system (lowest–highest), the texts a system made less readable than the template's own default
 * (under 4.5:1 and worse than before), the role checks missed, the
 * screenshots of the default and of each system.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: sweep-report.mjs <sweep dir>')
  process.exit(1)
}
const pct = (x) => `${Math.round(x * 100)}%`
const rows = []
for (const t of readdirSync(dir).sort()) {
  // a sweep's own layout (<t>/final/flow.json + PNGs) or a curated one (<t>/flow.json + JPEGs)
  const curated = existsSync(join(dir, t, 'flow.json'))
  const f = curated ? join(dir, t, 'flow.json') : join(dir, t, 'final', 'flow.json')
  if (!existsSync(f)) continue
  const j = JSON.parse(readFileSync(f, 'utf8'))
  const sys = j.verdicts.filter((v) => v.kind === 'system')
  const ctl = j.verdicts.filter((v) => v.kind === 'control')
  const follows = sys.map((v) => v.follows?.rate).filter((x) => typeof x === 'number')
  // a contrast regression: under 4.5:1 AND worse than the template's own default for that kind of text
  const own = (vw, name) => j.rows[0].views[vw].contrast?.find((c) => c.name === name)?.ratio ?? 99
  const contrast = sys.flatMap((v) =>
    v.contrast
      .filter((c) => c.regressed ?? (c.ratio < 4.5 && c.ratio < own(v.vw, c.name) - 0.05))
      .map((c) => ({ ...c, at: `${v.label} ${v.vw}` }))
  )
  const low = contrast.length ? contrast.reduce((a, c) => (c.ratio < a.ratio ? c : a)) : null
  const misses = [...new Set(sys.flatMap((v) => v.misses.map((m) => m.split('=')[0])))]
  const shots = j.rows
    .filter((r) => r.views?.desktop?.shot)
    .filter((r) => !curated || !r.label.startsWith('clear'))
    .map(
      (r) =>
        `[${r.step}](${t}/${curated ? r.views.desktop.shot.replace(/\.png$/, '.jpg') : `final/${r.views.desktop.shot}`})`
    )
    .join(' ')
  rows.push(
    `| ${t} | ${j.verdicts.filter((v) => v.pass).length}/${j.verdicts.length} | ${ctl.map((c) => c.differences).join(' · ')} | ${follows.length ? `${pct(Math.min(...follows))}–${pct(Math.max(...follows))}` : '—'} | ${low ? `${contrast.length}: lowest ${low.ratio.toFixed(2)} (${low.name}, ${low.at})` : 'none'} | ${misses.join(', ') || '—'} | ${shots} |`
  )
}
console.log(
  [
    '| Template | Verdicts | Controls (differences) | Page follows | Text made less readable than the template’s own (< 4.5:1) | Role checks missed | Desktop screenshots |',
    '|---|---|---|---|---|---|---|',
    ...rows
  ].join('\n')
)
