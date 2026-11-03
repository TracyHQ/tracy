#!/usr/bin/env node
// The P8 commands in their order, as one command (modelled on the WordPress kit's
// scripts/quickstart/patch-chain.mjs). Each step is the existing tool run as a child process, its
// output in a log file; the chain prints one line per step, stops on the first step that exits non-zero
// and names that step's log. It ADDS NO CHECK OF ITS OWN: what passes or fails is what each tool decides,
// and every refusal (a used pack folder, a non-empty clean-install target, a busy port, a pending gate)
// is the tool's. Run from the template folder.
//
//   node tools/release-chain.mjs --pack <new-dir> --target <new-clean-site-dir> --port <n>
//        --source <design-folder> --reviews <receipts-dir> --out <chain-dir>
//        [--contract qa.contract.json] [--config template.config.json]
//        [--report <qa-run>/report.json] [--version x.y.z] [--tag t] [--repo owner/name]
//        [--from <step>] [--verbose] [-- <more qa.mjs flags, e.g. --visual --source-site … --visual-fast-gate …>]
//
// Steps (references/qa-and-packaging.md §Package, SKILL.md P8):
//   docs           node tools/generate-docs.mjs --check
//   artifact       node tools/artifact.mjs                      (artifact.json, after the docs)
//   pack           node tools/distribution.mjs pack <contract> <pack>
//   clean-install  (cd <pack> && bash tools/clean-install.sh <target> <port>)  — from the PACKAGE, so the
//                  clean site is built from what ships; the script's own preflight guards the target
//   qa             node tools/qa.mjs --contract … --source … --site <origin> --out <out>/qa.<n> --config …
//                  --browser --artifact <pack> --reviews <dir> [flags after --]
//   content-api    node tools/content-api-gate.mjs <pack>
//   release        node tools/release.mjs --artifact <pack> --site <target> --report <qa report> --out <out>/release.<n>
// ONE SITE: qa.mjs measures the clean install that release.mjs snapshots. clean-install.sh starts it with
// HOST=127.0.0.1 PORT=<port> and bootstraps it at http://127.0.0.1:<port>; $EMDASH_SITE_URL only sets the
// URL the site calls itself, not where it listens — so QA runs on http://127.0.0.1:<port>, whatever that
// variable says, and there is no `--site` (refused: another site would put one site's QA report into
// another site's release). The chain records the clean install it ran (target, port, origin) in
// chain.json. Resuming at a step after clean-install REQUIRES that record (exit 2 without it, or when
// --target/--port name another site); the release step fails when the report's `origin` is not the
// recorded site (release.mjs binds the report to the artifact, not to the site). The record is not
// trusted as written: its origin is recomputed from its port and a record that disagrees exits 2.
// `--port` is an integer 1–65535 in canonical spelling; origins are compared only as `new URL(…).origin`
// (the form qa.mjs writes) and targets by real path. `--from <step>` starts there (a step
// that failed, once fixed); `release` takes the report of the last qa step this chain passed (chain.json),
// or `--report`. Logs: <out>/logs/<n>-<step>.log, numbered per run so a rerun never overwrites one.
// Output: `release-chain <step>: ok|FAIL|skipped …` per step and a last line `release-chain: status=… -> <file>`;
// `--verbose` prints each step's log after its line. Exit 0 every step passed · 1 a step failed · 2 usage.
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { summaryLine, takeVerbose } from './cli-output.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const STEPS = ['docs', 'artifact', 'pack', 'clean-install', 'qa', 'content-api', 'release']
const NEEDS = {
  docs: [],
  artifact: [],
  pack: ['pack'],
  'clean-install': ['pack', 'target', 'port'],
  qa: ['pack', 'target', 'source', 'reviews', 'port'],
  'content-api': ['pack'],
  release: ['pack', 'target', 'port']
}
const FLAGS = ['pack', 'target', 'port', 'source', 'reviews', 'out', 'contract', 'config', 'report', 'version', 'tag', 'repo', 'from']

export class Refusal extends Error {}
/** A TCP port as clean-install.sh and a URL take it: an integer 1–65535, in canonical spelling ("080" → "80"); null otherwise. */
export const portOf = (v) => (/^\d{1,5}$/.test(String(v)) && Number(v) >= 1 && Number(v) <= 65535 ? String(Number(v)) : null)
/** An origin in the one form every comparison here uses — the form qa.mjs writes (`new URL(site).origin`); null when unparseable. */
export const normOrigin = (v) => {
  try {
    return new URL(String(v)).origin
  } catch {
    return null
  }
}
/** Where clean-install.sh's site listens and is bootstrapped: loopback on the port ($EMDASH_SITE_URL does not move it). */
export const siteOrigin = (port) => new URL(`http://127.0.0.1:${portOf(port)}`).origin
/** A target folder by its real location once it exists (a symlink or `a/../b` names the same site), else as resolved. */
export const realTarget = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export function parseArgs(argv) {
  const dash = argv.indexOf('--')
  const own = dash < 0 ? argv.slice() : argv.slice(0, dash)
  const qaExtra = dash < 0 ? [] : argv.slice(dash + 1)
  const verbose = takeVerbose(own)
  const o = { qaExtra, verbose, contract: 'qa.contract.json', config: 'template.config.json', from: STEPS[0] }
  if (qaExtra.includes('--site')) own.unshift('--site')
  for (let i = 0; i < own.length; i++) {
    const name = own[i].replace(/^--/, '')
    if (own[i] === '--site')
      throw new Error('--site is refused: QA runs on the clean install the release snapshots, http://127.0.0.1:<port>, where clean-install.sh starts it')
    if (!own[i].startsWith('--') || !FLAGS.includes(name)) throw new Error(`unknown argument ${own[i]}`)
    const v = own[++i]
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`)
    o[name] = v
  }
  if (!STEPS.includes(o.from)) throw new Error(`--from must be one of ${STEPS.join(', ')}`)
  if (!o.out) throw new Error('--out <chain-dir> is required')
  if (o.port !== undefined) {
    const port = portOf(o.port)
    if (!port) throw new Error(`--port must be an integer 1–65535, got ${o.port}`)
    o.port = port
    o.site = siteOrigin(port)
  }
  const missing = new Set()
  for (const step of STEPS.slice(STEPS.indexOf(o.from))) for (const k of NEEDS[step]) if (!o[k]) missing.add(`--${k}`)
  if (missing.size) throw new Error(`missing ${[...missing].join(', ')} for the steps from ${o.from}`)
  return o
}

const nextFree = (dir, base) => {
  let n = 1
  while (existsSync(path.join(dir, `${base}.${n}`))) n++
  return path.join(dir, `${base}.${n}`)
}

export function runChain(o, { cwd = process.cwd(), print = console.log } = {}) {
  const out = path.resolve(cwd, o.out)
  const stateFile = path.join(out, 'chain.json')
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { runs: [], qaReport: null }
  const logs = path.join(out, 'logs')
  mkdirSync(logs, { recursive: true })
  const runNo = readdirSync(logs).reduce((n, f) => Math.max(n, Number(f.split('-')[0]) || 0), 0) + 1
  const abs = (p) => (p ? path.resolve(cwd, p) : p)
  const pack = abs(o.pack)
  const node = process.execPath
  const tool = (t) => path.join(HERE, t)
  const run = { at: new Date().toISOString(), from: o.from, steps: [] }
  state.runs.push(run)
  const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n')
  const site = o.port ? { target: o.target ? realTarget(abs(o.target)) : null, port: o.port, origin: o.site } : null
  let known = null
  if (STEPS.indexOf(o.from) > STEPS.indexOf('clean-install')) {
    const rec = state.cleanInstall
    if (!rec)
      throw new Refusal(
        `${stateFile} records no clean install: a step after clean-install measures or releases that site — run the chain from clean-install (or earlier)`
      )
    // the record is not trusted as written: its origin is recomputed from its port the way a fresh run
    // computes it, and a record that disagrees (an external origin, a port spelled otherwise) is refused
    const port = portOf(rec.port)
    if (!port || typeof rec.target !== 'string' || normOrigin(rec.origin) !== siteOrigin(port))
      throw new Refusal(
        `${stateFile} records a clean install this chain could not have recorded (target ${rec.target}, port ${rec.port}, origin ${rec.origin}; the clean install listens on ${port ? siteOrigin(port) : 'no valid port'}) — run the chain from clean-install`
      )
    known = { target: realTarget(rec.target), port, origin: siteOrigin(port) }
    const differs = ['target', 'port'].filter((k) => site?.[k] && site[k] !== known[k])
    if (differs.length)
      throw new Refusal(
        `this chain installed the clean site ${known.target} on ${known.origin}; ${differs.map((k) => `--${k} ${site[k]}`).join(', ')} names another site — QA and release must be the same site`
      )
  }
  let qaDir = null
  const commands = {
    docs: () => [node, [tool('generate-docs.mjs'), '--check'], cwd],
    artifact: () => [node, [tool('artifact.mjs')], cwd],
    pack: () => [node, [tool('distribution.mjs'), 'pack', o.contract, pack], cwd],
    'clean-install': () => ['bash', [path.join(pack, 'tools', 'clean-install.sh'), abs(o.target), o.port], pack],
    qa: () => {
      qaDir = nextFree(out, 'qa')
      return [
        node,
        [tool('qa.mjs'), '--contract', o.contract, '--source', o.source, '--site', o.site, '--out', qaDir,
          '--config', o.config, '--browser', '--artifact', pack, '--reviews', o.reviews, ...o.qaExtra],
        cwd
      ]
    },
    'content-api': () => [node, [tool('content-api-gate.mjs'), pack], cwd],
    release: () => {
      const report = abs(o.report) ?? state.qaReport
      if (!report) return { refuse: 'no qa report from this chain; give --report or run from qa' }
      let origin
      try {
        origin = JSON.parse(readFileSync(report, 'utf8')).origin
      } catch (e) {
        return { refuse: `qa report ${report} cannot be read: ${e.message}` }
      }
      const released = known?.origin ?? o.site
      if (normOrigin(origin) !== released)
        return { refuse: `qa report measured ${origin ?? 'no origin'}, the clean site released is ${released}: not the same site` }
      return [
        node,
        [tool('release.mjs'), '--artifact', pack, '--site', known?.target ?? realTarget(abs(o.target)), '--report', report, '--out', nextFree(out, 'release'),
          ...['version', 'tag', 'repo'].flatMap((k) => (o[k] ? [`--${k}`, o[k]] : []))],
        cwd
      ]
    }
  }
  const start = STEPS.indexOf(o.from)
  for (const [i, step] of STEPS.entries()) {
    if (i < start) {
      print(`release-chain ${step}: skipped (--from ${o.from})`)
      continue
    }
    const log = path.join(logs, `${runNo}-${String(i + 1).padStart(2, '0')}-${step}.log`)
    const cmd = commands[step]()
    if (cmd.refuse) {
      writeFileSync(log, `${cmd.refuse}\n`)
      run.steps.push({ step, status: 'fail', code: null, log })
      save()
      print(`release-chain ${step}: FAIL (${cmd.refuse}) -> ${log}`)
      print(summaryLine('release-chain', '', { status: 'fail', at: step }, log))
      return { ok: false, failed: step, log }
    }
    const [bin, args, dir] = cmd
    const fd = openSync(log, 'w')
    const t0 = Date.now()
    let r
    try {
      writeFileSync(fd, `$ (cd ${dir} && ${[bin, ...args].join(' ')})\n`)
      r = spawnSync(bin, args, { cwd: dir, stdio: ['ignore', fd, fd], env: process.env })
    } finally {
      closeSync(fd)
    }
    const code = r.status ?? (r.error ? 127 : 1)
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    run.steps.push({ step, status: code === 0 ? 'ok' : 'fail', code, seconds: Number(secs), log, ...(qaDir && step === 'qa' ? { dir: qaDir } : {}) })
    if (step === 'qa' && code === 0) state.qaReport = path.join(qaDir, 'report.json')
    if (step === 'clean-install' && code === 0) {
      // a new clean site: a qa report of the previous one is not evidence for it
      state.cleanInstall = { ...site, target: realTarget(site.target) }
      state.qaReport = null
    }
    save()
    print(`release-chain ${step}: ${code === 0 ? 'ok' : `FAIL (exit ${code})`} ${secs} s -> ${log}`)
    if (o.verbose) print(readFileSync(log, 'utf8').trimEnd())
    if (code !== 0) {
      print(summaryLine('release-chain', '', { status: 'fail', at: step }, log))
      return { ok: false, failed: step, log }
    }
  }
  print(summaryLine('release-chain', '', { status: 'ok', steps: STEPS.length - start }, stateFile))
  return { ok: true, state: stateFile }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  let o
  try {
    o = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`${e.message}\nusage: release-chain.mjs --pack <new> --target <new> --port <n> --source <design> --reviews <dir> --out <dir> [--from <step>] [-- <qa.mjs flags>]`)
    process.exit(2)
  }
  try {
    process.exitCode = runChain(o).ok ? 0 : 1
  } catch (e) {
    if (!(e instanceof Refusal)) throw e
    console.error(e.message)
    process.exitCode = 2
  }
}
