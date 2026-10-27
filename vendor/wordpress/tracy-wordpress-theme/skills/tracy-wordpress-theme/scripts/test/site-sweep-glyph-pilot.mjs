#!/usr/bin/env node
// site-sweep-glyph-pilot.mjs — live verification of the icon-glyph and short-label findings of site-sweep, READ-ONLY on the stands.
//
//   node scripts/test/site-sweep-glyph-pilot.mjs --profile morgan --source <origin> --site <origin> --pages /a,/b [--widths 390,1440]
//        [--only icons,text,header] --artifacts-root <dir>
//
// It runs the PRODUCTION command line (scripts/visual/site-sweep.mjs) and writes, under <artifacts-root>/pilot-<profile>-<stamp>/, the exact
// argv, stdout, stderr, exit code and the fresh reports of the run, then inspects the findings itself: the exit code alone proves nothing
// (the command ends 1 when it finds a defect, which is what the Morgan profile expects).
//
//   morgan   the pair whose port draws an X where the source draws the bird in its topbar, and whose logo reads "JA Morgan." where the
//            source reads "Morgan.": on EVERY route and width asked, the run must report the glyph difference of the X network and the
//            logo wording, must not call the topbar icons only-on-one-side or unpairable, and must not leave a cell not measured.
//
// Exit 0 only when every assertion holds. 1: an assertion failed. 2: usage, or an input missing (nothing was measured).
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.join(here, '..', '..')
const CLI = path.join('scripts', 'visual', 'site-sweep.mjs')
const VALUES = ['--profile', '--source', '--site', '--pages', '--widths', '--only', '--artifacts-root']

const die = (msg, code = 2) => {
  console.error(`site-sweep-glyph-pilot: ${msg}`)
  process.exit(code)
}
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  if (!VALUES.includes(argv[i])) die(`unknown argument ${argv[i]} (known: ${VALUES.join(' ')})`)
  if (argv[i + 1] == null || argv[i + 1].startsWith('--')) die(`${argv[i]} needs a value`)
  opt[argv[i].slice(2)] = argv[++i]
}
const profile = opt.profile
if (profile !== 'morgan') die('--profile morgan is required (it is the only profile)')
for (const n of ['source', 'site', 'artifacts-root']) if (!opt[n]) die(`--${n} is required: the live stands are inputs, none is assumed (nothing was measured)`)
const origin = (n) => {
  try {
    const u = new URL(opt[n])
    if (!/^https?:$/.test(u.protocol)) throw new Error('scheme')
    return u.origin
  } catch {
    return die(`--${n} ${opt[n]}: not an http(s) origin`)
  }
}
const SOURCE = origin('source')
const SITE = origin('site')
const ONLY = opt.only ?? 'icons,text,header'
const WIDTHS = (opt.widths ?? '390,1440').split(',').map((w) => w.trim())
if (!WIDTHS.every((w) => /^\d+$/.test(w))) die(`--widths ${opt.widths}: not a list of widths`)
const PAGES = opt.pages ? opt.pages.split(',').map((p) => p.trim()) : null
if (PAGES && !PAGES.every((p) => p.startsWith('/'))) die(`--pages ${opt.pages}: each page starts with /`)
if (!PAGES) die('--pages is required for the morgan profile (the routes the finding is asserted on)')

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const root = path.join(path.resolve(opt['artifacts-root']), `pilot-${profile}-${stamp}`)
mkdirSync(root, { recursive: true })
const write = (name, text) => writeFileSync(path.join(root, name), typeof text === 'string' ? text : `${JSON.stringify(text, null, 2)}\n`)
const log = []
const say = (m) => {
  log.push(m)
  console.log(m)
}

// the stands answer before anything is measured: a refused connection is a missing input, never a clean run
for (const [side, o] of [['source', SOURCE], ['site', SITE]]) {
  try {
    const res = await fetch(o, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) })
    say(`${side} ${o} answers ${res.status}`)
  } catch (e) {
    write('pilot-result.json', { profile, verdict: 'input-missing', why: `${side} ${o}: ${e.message}` })
    die(`${side} ${o} does not answer (${e.message}): nothing was measured`)
  }
}

/** One production run of this skill's CLI. → { argv, exit, dir, report } */
function run(label, skill, runRoot) {
  const dir = path.join(root, label)
  mkdirSync(dir, { recursive: true })
  const args = [CLI, '--site', SITE, '--source', SOURCE, '--run-root', runRoot, '--only', ONLY, '--widths', WIDTHS.join(','), '--schemes', 'light', '--out', path.join(dir, 'out')]
  if (PAGES) args.push('--pages', PAGES.join(','))
  const r = spawnSync(process.execPath, args, { cwd: skill, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  writeFileSync(path.join(dir, 'argv.json'), `${JSON.stringify({ cwd: skill, command: process.execPath, args }, null, 2)}\n`)
  writeFileSync(path.join(dir, 'stdout.txt'), r.stdout ?? '')
  writeFileSync(path.join(dir, 'stderr.txt'), r.stderr ?? '')
  writeFileSync(path.join(dir, 'exit.txt'), `${r.status}\n`)
  const file = path.join(dir, 'out', 'site-sweep.json')
  let report = null
  try {
    report = JSON.parse(readFileSync(file, 'utf8'))
  } catch {}
  say(`${label}: exit ${r.status}${report ? '' : ' (no site-sweep.json written)'}`)
  return { argv: args, exit: r.status, dir, report }
}

const checks = []
const assert = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail })
  say(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`)
}
const cellsOf = (rows) => new Set(rows.map((d) => `${d.route}@${d.width}`))

{
  // a minimal dossier: the routes are the same on both sides (the pair names no rewrite)
  const dossier = path.join(root, 'dossier')
  mkdirSync(dossier, { recursive: true })
  write('dossier/visual.contract.json', {
    design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tracy_theme' } } },
    source: { kind: 'live', darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light' },
    pages: PAGES.map((p) => ({ id: p, path: p, status: 200, sourceRoute: p }))
  })
  const head = run('head', SKILL, dossier)
  const rep = head.report
  assert('the run wrote a report', rep, 'site-sweep.json is missing: see head/stderr.txt')
  if (rep) {
    const cells = PAGES.flatMap((p) => WIDTHS.map((w) => `${p}@${w}`))
    const icons = rep.defects?.icons ?? []
    const text = rep.defects?.text ?? []
    const glyph = icons.filter((d) => d.what === 'icon-glyph' && /x-twitter|twitter|\bx\b/.test(`${d.source} ${d.port}`) && d.sourceShape?.length && d.portShape?.length && JSON.stringify(d.sourceShape) !== JSON.stringify(d.portShape))
    const missingGlyph = cells.filter((c) => !cellsOf(glyph).has(c))
    assert('the X glyph is reported on every route and width, with both shapes', !missingGlyph.length && glyph.length, `no icon-glyph finding of the X network on: ${missingGlyph.join(', ') || 'any cell'}`)
    const logo = text.filter((d) => d.what === 'text-label-differs' && /^logo /.test(d.culprit) && d.source === '"Morgan."' && d.port === '"JA Morgan."')
    const missingLogo = cells.filter((c) => !cellsOf(logo).has(c))
    assert('the logo wording "Morgan." → "JA Morgan." is reported on every route and width', !missingLogo.length && logo.length, `no text-label-differs finding of the logo on: ${missingLogo.join(', ') || 'any cell'}`)
    // every icon left on one side in the top band, whatever its network is called
    const nesting = icons.filter((d) => /^icon-only-(source|port)$/.test(d.what) && d.culprit === 'header')
    assert('the topbar icons are paired, not left over on one side', !nesting.length, `${nesting.length} icon-only finding(s) in the top band (${[...cellsOf(nesting)].slice(0, 4).join(', ')}): ${nesting.slice(0, 2).map((d) => `${d.source} | ${d.port}`).join('; ')}`)
    const unmeasured = Object.entries(rep.notMeasured ?? {}).flatMap(([id, rows]) => rows.map((r) => ({ id, ...r })))
    assert('no cell is not-measured', !unmeasured.length, unmeasured.slice(0, 4).map((r) => `${r.id}:${r.cause}`).join(', '))
    assert('the command ends with the defect exit', head.exit === 1, `exit ${head.exit}`)
  }
}

const failed = checks.filter((c) => !c.ok)
write('pilot-result.json', { profile, verdict: failed.length ? 'fail' : 'pass', checks, root })
say(`${failed.length ? 'FAIL' : 'PASS'}: ${checks.length - failed.length}/${checks.length} assertions; evidence in ${root}`)
process.exit(failed.length ? 1 : 0)
