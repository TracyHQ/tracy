#!/usr/bin/env node
/**
 * The preview gate (14/10/2026): one command that measures the Add site preview of every row in
 * scope on this branch, compares it row by row with the frozen develop baseline, prints one table and
 * fails when a row is worse than the baseline or a target row is not clean.
 *
 *   node scripts/tdsr/preview-gate.mjs --demos <demos.json> [--baseline scripts/tdsr/baseline-develop.json]
 *        [--rows <slug,…>] [--from <light-dir>,<dark-dir>] [--write-baseline]
 *
 * --rows measures and judges only those rows (slugs such as ja-impact-wp7), for a fix round; run all
 * rows once before marking a pull request ready.
 *
 * --from reads an earlier preview-check run instead of measuring; --write-baseline writes what it read
 * or measured as the baseline (run it on develop's emitter). A row is worse when any of its counts
 * (kept, glare, keptText, lowText, lostButtons) is above the baseline's on either visitor scheme.
 * --targets <slug,…>: those rows must also reach 0 kept blocks, glare blocks, kept texts and
 * unreadable texts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const opt = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args[i + 1]
}
const has = (n) => args.includes(n)
const BASELINE = resolve(ROOT, opt('--baseline', 'scripts/tdsr/baseline-develop.json'))
const slugOf = (/** @type {string} */ t) => t.replace(/^quickstart\//, '').replace(/\//g, '-')
const ROWS = opt('--rows')?.split(',').filter(Boolean) ?? null
const K = ['kept', 'glare', 'keptText', 'lowText', 'lostButtons']
const SCHEMES = ['light', 'dark']
/** The rows the design review named: they must be clean, not only not worse. */
const TARGETS = (opt('--targets') ?? '').split(',').filter(Boolean)

/** One run's counts per row: `{ <slug>: [kept, glare, keptText, lowText, lostButtons] | 'error …' }`. */
function read(dir) {
  const out = {}
  for (const slug of readdirSync(dir)) {
    const f = join(dir, slug, 'preview.json')
    if (!existsSync(f)) continue
    const r = JSON.parse(readFileSync(f, 'utf8'))
    const s = Object.values(r.systems ?? {})[0]
    out[slug] = r.error ? `error ${r.error}` : s?.miss ? `miss ${s.miss}` : K.map((k) => s[k].length)
  }
  return out
}

let runs
const from = opt('--from')
if (from) {
  const [l, d] = from.split(',')
  runs = { light: read(l), dark: read(d) }
} else {
  const demos = opt('--demos')
  if (!demos) {
    console.error(
      'usage: preview-gate.mjs --demos <demos.json> [--only tag,…] [--from l,d] [--write-baseline]'
    )
    process.exit(2)
  }
  const tags = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).tags : []
  const only = (ROWS ? tags.filter((t) => ROWS.includes(slugOf(t))) : tags).join(',')
  runs = {}
  for (const scheme of SCHEMES) {
    const out = mkdtempSync(join(tmpdir(), `preview-gate-${scheme}-`))
    execFileSync(
      process.execPath,
      [
        'apps/tracy-web/scripts/preview-check.mjs',
        '--demos',
        demos,
        '--out',
        out,
        '--scheme',
        scheme,
        // the frozen baseline holds the home page's counts: the gate compares home with home (the
        // per-page measurement is preview-check's default and preview-measure-all's)
        '--pages',
        'home',
        ...(only ? ['--only', only] : [])
      ],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }
    )
    runs[scheme] = read(out)
  }
}

if (has('--write-baseline')) {
  const demos = opt('--demos')
  const tags = demos ? JSON.parse(readFileSync(demos, 'utf8')).map((d) => d.tag) : []
  const slugs = Object.keys(runs.light)
  const keep = tags.filter((t) => slugs.includes(t.replace(/^quickstart\//, '').replace(/\//g, '-')))
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ measuredAt: new Date().toISOString(), system: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', counts: K, tags: keep, rows: runs }, null, 2)}\n`
  )
  console.log(`baseline written: ${BASELINE} (${slugs.length} rows)`)
  process.exit(0)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8')).rows
let red = 0
console.log(`| Row | Scheme | develop [${K.join(', ')}] | branch | Verdict |\n|---|---|---|---|---|`)
for (const slug of Object.keys(base.light)
  .filter((x) => !ROWS || ROWS.includes(x))
  .sort())
  for (const scheme of SCHEMES) {
    const b = base[scheme]?.[slug]
    const a = runs[scheme]?.[slug]
    let verdict = 'ok'
    if (!Array.isArray(a)) verdict = `NOT MEASURED (${a ?? 'absent'})`
    else if (Array.isArray(b) && a.some((x, i) => x > b[i]))
      verdict = `WORSE: ${K.filter((_, i) => a[i] > b[i]).join(', ')}`
    else if (TARGETS.includes(slug) && a.slice(0, 4).some((x) => x > 0)) verdict = 'TARGET NOT CLEAN'
    if (verdict !== 'ok') red++
    console.log(`| ${slug} | ${scheme} | ${JSON.stringify(b)} | ${JSON.stringify(a)} | ${verdict} |`)
  }
console.log(red ? `\npreview gate: ${red} row(s) red` : '\npreview gate: green')
process.exit(red ? 1 : 0)
