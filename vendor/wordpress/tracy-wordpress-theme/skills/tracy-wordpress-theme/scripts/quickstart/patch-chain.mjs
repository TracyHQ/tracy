#!/usr/bin/env node
// One command for a patch release: cycle (prune → pack → restore → verify) → sweep → audit → bind → release.
//
//   node scripts/quickstart/patch-chain.mjs --out <dir> --stand <dir> --theme-zip <zip> --source <url>
//        --baseline <sweep dir> --previous <release dir> --contract <slug>/wp7/<version>
//        --run-root <dossier> --spec <spec-pack> --routes <page-map.json> [--baseline-version <x.y.z>]
//        [--plugin <zip|url>] [--from <phase>]   plus the cycle's own options (--id, --version, --site-a, --site-b, --wp-a, --wp-b, --root-b, …)
//
// The tools run as child processes, one phase each, in this order; the chain adds no check of its own:
//   cycle   cycle.mjs --patch --to verify
//   sweep   site-sweep.mjs … --zip <theme zip> --baseline <dir> --full --reason "release gate"   (the full sweep; writes <out>/sweep/fix-measure.json)
//           not run again when <out>/sweep already holds that very measure (sweep-reuse.mjs: a full run, this zip, site, source, dossier and
//           baseline, taken after the restore being verified); the line of the phase says `reused` or `full run: <why>`
//   audit   review/port-audit.mjs --dossier <run-root> --theme-zip <zip> (writes <run-root>/port-audit.json)
//   bind    contract-bind.mjs (the cycle's own argv)
//   release release.mjs --patch (the cycle's own argv); the release lands in <out>/release
//
// The release carries what --previous carried: tracy_setting.json is written from the previous one (--setting-template defaults to it),
// tracy_design_inspiration.json (--card) and every other tracy_*.json are copied unchanged, all listed in SHA256SUMS. --previous
// is read only after its own SHA256SUMS has been checked; a directory that cannot be read or checked stops the chain.
//
// <out> holds chain-state.json (per phase: started, ended, exit code, command, outputs), logs/<phase>.log and
// sweep/; release.mjs owns <out>/release whole. stdout is one line per phase; a failing phase prints the tool's own
// refusal lines and its log path, and the chain exits 1 there. `--from <phase>` resumes at a phase
// (cycle, sweep, audit, bind, release, or prune/pack/restore/verify to resume inside the cycle); earlier phases
// must be green in chain-state.json.
// --plugin defaults to the zip asset of the newest `wordpress-v*` release of TracyHQ/claude-cowork (gh).
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli, parseArgs, UsageError } from './lib.mjs'
import { PHASES as CYCLE_PHASES, SPEC as CYCLE_SPEC, plan } from './cycle.mjs'
import { previousRelease } from './release.mjs'
import { reusableSweep } from './sweep-reuse.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const CHAIN_PHASES = ['cycle', 'sweep', 'audit', 'bind', 'release']
const CYCLE_FROM = CYCLE_PHASES.slice(0, 4)
export const PLUGIN_REPO = 'TracyHQ/claude-cowork'
// the chain's sweep is the full sweep of the release, whatever the dossier's sweep history holds (visual/site-sweep-scope.mjs)
export const SWEEP_FULL_REASON = 'release gate'
// what narrows a sweep, or states its own full/reason: none of it reaches the release sweep
const SWEEP_NARROWING = ['--only', '--pages', '--widths', '--schemes', '--full', '--reason']
const MAX_LINES = 40

const CHAIN_SPEC = {
  '--out': { placeholder: 'dir', required: true, help: 'chain work dir: chain-state.json, logs/, sweep/, and release/ (the release itself)' },
  '--source': { placeholder: 'url', required: true, help: 'the source site, as site-sweep.mjs --source' },
  '--baseline': { placeholder: 'dir', required: true, help: 'the previous sweep (site-sweep.mjs --baseline)' },
  '--baseline-version': { placeholder: 'x.y.z', help: 'the theme version the baseline measured, when it differs from the previous release version; passed to site-sweep and release' },
  '--theme-zip': { placeholder: 'file', required: true, help: 'the final theme zip' },
  '--previous': { placeholder: 'dir', required: true, help: 'the previous release directory (VERIFICATION.json and theme zip)' },
  '--run-root': { placeholder: 'dir', required: true, help: 'the site dossier' },
  '--spec': { placeholder: 'dir', required: true, help: 'spec-pack' },
  '--contract': { placeholder: 'slug/wp7/version', required: true },
  '--from': { placeholder: 'phase', help: `resume at this phase (${[...CHAIN_PHASES, ...CYCLE_FROM].join(', ')}); earlier phases must be green in chain-state.json` },
  '--sweep-arg': { placeholder: 'arg', repeat: true, help: 'an extra argument for site-sweep.mjs (repeatable)' }
}
export const SPEC = { ...CYCLE_SPEC, ...CHAIN_SPEC, '--plugin': { placeholder: 'zip|url', help: `the Cowork plugin; default: the zip of the newest wordpress-v* release of ${PLUGIN_REPO}` } }
delete SPEC['--measure']
delete SPEC['--changed-from']
delete SPEC['--to']
delete SPEC['--patch']
delete SPEC['--verbose']

/** The previous release's theme zip: the manifest asset that is a .zip and not the webroot/database archive. */
export function previousThemeZip(dir) {
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const names = (manifest.assets ?? []).map((a) => (typeof a === 'string' ? a : a.name ?? a.file ?? a.path)).filter(Boolean)
  const zips = names.filter((n) => /\.zip$/.test(n) && !/-(webroot|database)-/.test(n))
  if (zips.length !== 1) throw new UsageError(`--previous ${dir}: manifest.json names ${zips.length} theme zips, expected 1`)
  const file = path.join(dir, path.basename(zips[0]))
  if (!existsSync(file)) throw new UsageError(`--previous ${dir}: ${zips[0]} is not there`)
  return file
}

/** The default plugin: the zip asset of the newest `wordpress-v*` release. `gh` is injectable. */
export function resolvePlugin(gh = (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 60000 })) {
  const list = JSON.parse(gh(['release', 'list', '-R', PLUGIN_REPO, '--limit', '100', '--json', 'tagName,publishedAt,isDraft,isPrerelease']))
  const tags = list.filter((r) => /^wordpress-v\d/.test(r.tagName) && !r.isDraft && !r.isPrerelease)
  if (!tags.length) throw new UsageError(`no wordpress-v* release in ${PLUGIN_REPO}; pass --plugin`)
  tags.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
  const tag = tags[0].tagName
  const view = JSON.parse(gh(['release', 'view', tag, '-R', PLUGIN_REPO, '--json', 'assets']))
  const asset = (view.assets ?? []).find((a) => /\.zip$/.test(a.name))
  if (!asset) throw new UsageError(`${tag} of ${PLUGIN_REPO} has no zip asset; pass --plugin`)
  return asset.url ?? asset.apiUrl
}

/** The argv of every chain phase. Pure. */
export function chainPlan(o) {
  const extra = (o.sweepArg ?? []).flatMap((a) => a.split(' ')).filter(Boolean)
  const narrowing = extra.filter((a) => SWEEP_NARROWING.some((n) => a === n || a.startsWith(`${n}=`)))
  if (narrowing.length) throw new UsageError(`--sweep-arg ${narrowing.join(' ')}: the chain's sweep is the full release sweep; it takes no ${SWEEP_NARROWING.join(', ')}`)
  const t = (...p) => path.join(HERE, '..', ...p)
  const measure = path.join(o.out, 'sweep', 'fix-measure.json')
  const releaseDir = path.join(o.out, 'release')
  const cycleOpts = { ...o, patch: true, changedFrom: o.changedFrom, measure }
  const steps = plan(cycleOpts)
  const withOut = (argv) => {
    const a = [...argv]
    a[a.indexOf('--out') + 1] = releaseDir
    return a
  }
  const baselineVersion = o.baselineVersion ? ['--baseline-version', o.baselineVersion] : []
  const cycleArgv = [path.join(HERE, 'cycle.mjs'), '--patch', '--to', 'verify']
  for (const [name, def] of Object.entries(CYCLE_SPEC)) {
    const k = name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (['patch', 'to', 'measure', 'previous', 'changedFrom', 'plugin', 'contract', 'curl', 'bindSiteUrl', 'from', 'timeout'].includes(k) || o[k] === undefined || o[k] === false) continue
    for (const v of def.repeat ? o[k] : [o[k]]) cycleArgv.push(name, String(v))
  }
  cycleArgv.push('--previous', o.previous, '--changed-from', o.changedFrom, '--timeout', String(o.timeout ?? 3600))
  return {
    cycle: { argv: cycleArgv, outputs: [path.join(o.stand, 'pack'), path.join(o.stand, 'cycle.log')] },
    sweep: { argv: [t('visual', 'site-sweep.mjs'), '--site', o.siteB, '--source', o.source, '--run-root', o.runRoot, '--spec', o.spec, '--zip', o.themeZip, '--baseline', o.baseline, ...baselineVersion, '--full', '--reason', SWEEP_FULL_REASON, ...extra, '--out', path.join(o.out, 'sweep')], outputs: [measure] },
    audit: { argv: [t('review', 'port-audit.mjs'), '--site', o.siteB, '--routes', o.routes, '--source', o.source, '--dossier', o.runRoot, '--theme-zip', o.themeZip, '--out', path.join(o.runRoot, 'port-audit.json')], outputs: [path.join(o.runRoot, 'port-audit.json')] },
    bind: { argv: steps['contract-bind'][0].argv, outputs: [path.join(o.stand, 'pack', 'contract-bind', 'contract-bind.json')] },
    release: { argv: [...withOut(steps.release[0].argv), ...baselineVersion], outputs: [releaseDir] }
  }
}

/** The lines worth showing for a failed phase: the tool's refusal lines, else its last lines; at most MAX_LINES. */
export function failureLines(text) {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter(Boolean)
  const marked = lines.filter((l) => /\[[a-z][a-z0-9-]+\]|refus|fail|error|^!!|✗/i.test(l))
  return (marked.length ? marked : lines).slice(-MAX_LINES)
}

function spawnPhase(argv, logFile) {
  return new Promise((resolve) => {
    const log = createWriteStream(logFile)
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    let output = ''
    const tee = (c) => {
      output += c
      log.write(c)
    }
    child.stdout.on('data', tee)
    child.stderr.on('data', tee)
    child.on('error', (e) => tee(`${e.message}\n`))
    child.on('close', (code) => log.end(() => resolve({ code: code ?? 1, output })))
  })
}

/** `o` with what --previous carried added: its tracy_setting.json and tracy_design_inspiration.json as the defaults of --setting-template and --card, any other tracy_*.json as an --asset. */
export function withCarried(o) {
  let carried
  try {
    carried = previousRelease(o.previous)
  } catch (e) {
    throw new UsageError(e.message)
  }
  const out = { ...o }
  const asset = [...(o.asset ?? [])]
  for (const n of carried.names) {
    const file = path.join(carried.dir, n)
    if (n === 'tracy_setting.json') out.settingTemplate ??= file
    else if (n === 'tracy_design_inspiration.json') out.card ??= file
    else if (!asset.some((a) => path.basename(a) === n)) asset.push(file)
  }
  if (asset.length) out.asset = asset
  return out
}

export async function runChain(o, { run = spawnPhase, plugin = resolvePlugin, now = () => new Date(), write = (s) => process.stdout.write(s), reuse = reusableSweep, readSource } = {}) {
  const from = o.from ?? null
  const startAt = from ? (CYCLE_FROM.includes(from) ? 0 : CHAIN_PHASES.indexOf(from)) : 0
  if (startAt === -1) throw new UsageError(`--from must be one of ${[...CHAIN_PHASES, ...CYCLE_FROM].join(', ')}`)
  const statePath = path.join(o.out, 'chain-state.json')
  const state = from && existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { phases: {} }
  for (const p of CHAIN_PHASES.slice(0, startAt))
    if (state.phases[p]?.exit !== 0) throw new UsageError(`--from ${from}: phase ${p} is not green in ${statePath}; run from ${p}`)
  const carried = withCarried(o)
  mkdirSync(path.join(o.out, 'logs'), { recursive: true })
  const opts = { ...carried, changedFrom: previousThemeZip(o.previous) }
  if (!opts.plugin) opts.plugin = plugin()
  state.plugin = opts.plugin
  const steps = chainPlan(opts)
  if (from && CYCLE_FROM.includes(from)) steps.cycle.argv.push('--from', from)
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
  for (const phase of CHAIN_PHASES.slice(startAt)) {
    const step = steps[phase]
    const logFile = path.join(o.out, 'logs', `${phase}.log`)
    const started = now()
    state.phases[phase] = { started: started.toISOString(), ended: null, exit: null, command: ['node', ...step.argv].join(' '), outputs: step.outputs, log: logFile }
    // the sweep is not run again when the output already holds that measure; every other phase, and any doubt, runs
    let note = ''
    let reused = null
    if (phase === 'sweep') {
      const sweepDir = path.join(o.out, 'sweep')
      reused = reuse({ sweepDir, themeZip: o.themeZip, site: o.siteB, source: o.source, baseline: o.baseline, baselineVersion: o.baselineVersion, runRoot: o.runRoot, spec: o.spec, restoreReport: path.join(o.stand, 'pack', 'restore.json'), sweepArgs: (o.sweepArg ?? []).flatMap((a) => a.split(' ')).filter(Boolean), now: now().getTime(), ...(readSource ? { readSource } : {}) })
      state.phases[phase].sweep = reused.reuse ? { mode: 'reused', ranAt: reused.ranAt, measure: reused.measure, report: reused.report } : { mode: 'full', why: reused.why }
      note = reused.reuse ? ` (reused: the full sweep of ${reused.ranAt} in ${sweepDir} is of this zip, site, source, dossier and baseline, and after the restore)` : ` (full run: ${reused.why})`
    }
    save()
    // a reused sweep spawns nothing: its log is the decision, with the evidence it stands on, so that the log chain-state points at is this run's
    if (reused?.reuse) writeFileSync(logFile, `sweep reused at ${now().toISOString()}${note}\nmeasure: ${reused.measure}\nreport: ${reused.report}\nsweep ran at: ${reused.ranAt}\n`)
    const { code, output } = reused?.reuse ? { code: 0, output: '' } : await run(step.argv, logFile)
    const ended = now()
    Object.assign(state.phases[phase], { ended: ended.toISOString(), exit: code })
    save()
    const secs = Math.round((ended - started) / 1000)
    if (code !== 0) {
      write(`${phase}: FAILED (exit ${code}) in ${secs}s\n${failureLines(output).join('\n')}\nlog: ${logFile}\n`)
      return { ok: false, phase, state }
    }
    write(`${phase}: ok in ${secs}s${note}\n`)
  }
  return { ok: true, state }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain)
  cli(async () => {
    const o = parseArgs(process.argv.slice(2), SPEC, 'usage: patch-chain.mjs --out <dir> --stand <dir> --theme-zip <zip> --source <url> --baseline <sweep dir> --previous <release dir> --contract <id> --run-root <dossier> --spec <spec-pack> --routes <page-map.json> --id <id> --version <v> --site-a <url> --site-b <url> --wp-a "<runner>" --wp-b "<runner>" --root-b "<root runner>" [--baseline-version <v>] [--plugin <zip|url>] [--from <phase>]')
    const r = await runChain(o)
    if (!r.ok) process.exitCode = 1
  })
