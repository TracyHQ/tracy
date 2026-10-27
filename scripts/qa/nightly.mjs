#!/usr/bin/env node
/**
 * The nightly QA orchestrator (plan §5, §4.1, §4.8, §7.4, §10): one run, P0 -> P8.
 *
 * Usage (run under `lockf -k -t 0 <QA_HOME>/state/run.lock node scripts/qa/nightly.mjs …`, which
 * `--lock` does for you by re-executing itself under lockf):
 *   node scripts/qa/nightly.mjs --run                       the full night
 *   node scripts/qa/nightly.mjs --first-run --baseline <X2> the stand is already up at X2: range X2..T,
 *        P3 writes the tests against X2 ("red before"), the stand is rebuilt at T, P5 reruns on T,
 *        P6 classifies, P7 is empty, P8 commits to `qa/daily-tests`, opens issues, writes the report
 *   --dry-run-issues      everything real except `gh issue/label/comment` (the commands are printed)
 *   --max-prs <n>  --only-pr <n>[,<n>]  --skip-build  --lanes sonnet,sol  --no-push  --lock
 * Env: QA_HOME (default ~/TCH-local/qa), QA_WORKTREES (default ~/TCH-worktrees).
 * Progress: one line per event in <QA_HOME>/r/<runId>/nightly.log (time, phase, PR, lane, result).
 *
 * Exports:
 *   parseArgs(argv): Config
 *   pool(items, n, fn): Promise<results[]>                  // at most n at once, order kept
 *   caseIdOf(file): string                                  // 'pr12-k1.test.mjs' -> 'pr12-k1'
 *   caseStatuses(rerunResult): Map<caseId, 'pass'|'fail'>   // a file is green when none of its tests failed
 *   laneStatus({ written, first, second, firstErrors?, secondErrors? }): 'red'|'flaky'|'green'|'no-test'|'stand-error'|'not-checkable'
 *   publishTests({ git, testsDir, repoDir, runId, lanes: { [lane]: { [pr]: snapshotDir } }, libFrom,
 *                  report?, push }): { committed: boolean, sha, pushed, error? }
 *   defaultDeps(cfg): Deps
 *   runNight(cfg, deps): Promise<{ runId, runDir, night, reportFile, exitCode }>
 *
 * Deps (every outside effect; tests pass fakes):
 *   git(args, { cwd }) -> { code, stdout, stderr }      always with core.hooksPath=/dev/null
 *   fetchT() -> sha                                      `git fetch origin develop` + rev-parse, pinned once
 *   discoverPrs(opts) · prBody(n) · prDiff(pr) -> patch text
 *   planPr(opts) · runAgent(opts) · rerun(opts)         run-agent.mjs and rerun.mjs
 *   stand: { prepareSrc(T), checkConfig(), build(T), deploy(), matches(T) -> { ok, reasons } }
 *   reconcileOrphans(opts) · startLaneServices({ lane, runId, layout }) -> { stop() }
 *   preflight() -> string[] (problems) · gh (createGh) · issuesLedger · watchdogProbes · sleep(ms)
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createEgressProxy } from './fence/egress-proxy.mjs'
import { DEFAULT_PORTS, laneLayout, PROXY_HOSTS, renderProfile } from './fence/render.mjs'
import { cliTokens, cookieValues, intake } from './lib/intake.mjs'
import { createGh, fileLedger, publishIssues } from './lib/issues.mjs'
import { appendLine } from './lib/journal.mjs'
import { LOCK_BUSY, LOCKF, lockArgv, reconcileOrphans } from './lib/lock.mjs'
import { ensureLaneSeats, sweepSites } from './stand/fixtures.mjs'
import { QA } from './stand/qa-stand.mjs'
import { discoverPrs } from './lib/pr-range.mjs'
import { renderReport } from './lib/report.mjs'
import { CI_REPOSITORY } from '../ci/ci-repository.mjs'
import { rerun, rerunCommand, removeTree } from './lib/rerun.mjs'
import {
  planPr,
  readBundled,
  readCodexEffort,
  filterDiff,
  runAgent,
  SCHEMAS,
  validate,
  verifyPrompt,
  writePlanOnce,
  writePrompt
} from './lib/run-agent.mjs'
import {
  advance,
  listQueue,
  newQueueEntry,
  nextRunId,
  qaHome as defaultQaHome,
  readDiscovery,
  readJson,
  readQueueEntry,
  stateDir,
  writeDiscovery,
  writeJsonAtomic,
  writeQueueEntry,
  writeRun
} from './lib/state.mjs'
import { addFollowup, readFollowups, tickFollowup, writeFollowups } from './lib/followups.mjs'
import { createWatchdog } from './lib/watchdog.mjs'
import { installTestlib, libDigest } from './testlib/install.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL_DIR = join(HERE, '..', '..')
const WRITE_LANES = ['sonnet', 'sol']
const TESTS_BRANCH = 'qa/daily-tests'
const NOHOOKS = ['-c', 'core.hooksPath=/dev/null']

// ---------------------------------------------------------------------------------------------
// config

function solEffort() {
  try {
    return readCodexEffort(readFileSync(join(homedir(), '.codex', 'config.toml'), 'utf8')) ?? 'low'
  } catch {
    return 'low'
  }
}

export function parseArgs(argv, env = process.env) {
  const cfg = {
    mode: null,
    baseline: null,
    dryRunIssues: false,
    maxPrs: 30,
    onlyPr: null,
    skipBuild: false,
    lanes: [...WRITE_LANES],
    push: true,
    lock: false,
    qaHome: defaultQaHome(env),
    worktrees: env.QA_WORKTREES ?? join(homedir(), 'TCH-worktrees')
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--run') cfg.mode = 'run'
    else if (a === '--first-run') cfg.mode = 'first-run'
    else if (a === '--baseline') cfg.baseline = val()
    else if (a === '--dry-run-issues' || a === '--issues-dry-run') cfg.dryRunIssues = true
    else if (a === '--max-prs') cfg.maxPrs = Number(val())
    else if (a === '--only-pr') cfg.onlyPr = val().split(',').map(Number)
    else if (a === '--skip-build') cfg.skipBuild = true
    // Resume an interrupted night in its own run folder: lanes already written are not written again.
    else if (a === '--resume') cfg.resumeRunId = val()
    else if (a === '--target') cfg.target = val()
    else if (a === '--lanes') cfg.lanes = val().split(',').filter(Boolean)
    else if (a === '--no-push') cfg.push = false
    else if (a === '--lock') cfg.lock = true
    else throw new Error(`unknown argument: ${a}`)
  }
  if (!cfg.mode) throw new Error('pass --run or --first-run')
  if (cfg.mode === 'first-run' && !/^[0-9a-f]{7,40}$/.test(cfg.baseline ?? ''))
    throw new Error('--first-run needs --baseline <sha>')
  for (const l of cfg.lanes) if (!WRITE_LANES.includes(l)) throw new Error(`unknown lane: ${l}`)
  if (!(cfg.maxPrs > 0)) throw new Error('--max-prs must be a positive number')
  return cfg
}

/** Fill the derived paths of a config. */
function withPaths(cfg) {
  const repoDir = cfg.repoDir ?? TOOL_DIR
  return {
    origin: 'http://qa.tracy.test:36080',
    gateUrl: `http://127.0.0.1:${DEFAULT_PORTS.gate}`,
    fixedSites: [{ key: 'qa-fixedwp', platform: 'wordpress', fixed: true }],
    retryDelayMs: 60_000,
    leaseMs: 120_000,
    renewMs: 30_000,
    keepRunsDays: 14,
    ...cfg,
    repoDir,
    srcDir: cfg.srcDir ?? join(cfg.worktrees, 'qa-src'),
    testsDir: cfg.testsDir ?? join(cfg.worktrees, 'qa-tests'),
    envFile: cfg.envFile ?? join(cfg.qaHome, '.env')
  }
}

// ---------------------------------------------------------------------------------------------
// small helpers

export async function pool(items, n, fn) {
  const out = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
export const caseIdOf = (file) => basename(String(file ?? '')).replace(/\.test\.mjs$/, '')

/** Per case (test file): 'pass' when every test of the file passed, else 'fail'. */
export function caseStatuses(result) {
  const out = new Map()
  for (const t of result?.tests ?? []) {
    if (!t.file) continue
    const id = caseIdOf(t.file)
    if (!t.ok) out.set(id, 'fail')
    else if (!out.has(id)) out.set(id, 'pass')
  }
  for (const f of result?.files ?? []) {
    const id = caseIdOf(f.path)
    if (!out.has(id)) out.set(id, 'fail') // the file ran no test at all: it did not load
  }
  return out
}

/** Per case (test file): the failure messages of its failed tests, from a rerun result. */
export function caseErrors(result) {
  const out = new Map()
  for (const t of result?.tests ?? []) {
    if (!t.file || t.ok) continue
    const id = caseIdOf(t.file)
    const list = out.get(id) ?? []
    list.push(String(t.error?.message ?? t.error?.cause ?? ''))
    out.set(id, list)
  }
  return out
}

// What the test fence prints when it refuses a repository-level command: a sandbox-denied open,
// corepack with no network, EPERM on a path, xcrun unable to load its library.
const FENCE_SIGNATURE = /sandbox blocked open\(\)|\bCorepack\b|Network access disabled|\bEPERM\b|xcrun: error/

/** True when there is at least one failure and every one of them is the fence refusing, not the product. */
export function fenceOnly(messages) {
  return Array.isArray(messages) && messages.length > 0 && messages.every((m) => FENCE_SIGNATURE.test(m))
}

/** A lane's status for one case after P5 (the vocabulary of issues.mjs / report.mjs). */
export function laneStatus({ written, standOk = true, first, second, firstErrors, secondErrors }) {
  if (!written) return 'no-test'
  if (!standOk) return 'stand-error'
  if (first === 'pass') return 'green'
  if (first === undefined) return 'no-test'
  if (second === 'pass') return 'flaky'
  // Red twice, but only because the fence refused a repo command: the case could not be checked here.
  if (fenceOnly(firstErrors) && fenceOnly(secondErrors)) return 'not-checkable'
  return 'red'
}

export function gitRunner() {
  return (args, { cwd } = {}) => {
    const r = spawnSync('git', [...NOHOOKS, ...args], { cwd, encoding: 'utf8', maxBuffer: 256 << 20 })
    return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? String(r.error ?? '') }
  }
}

function runLogged(cmd, args, { cwd, env, logFile }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = []
    const take = (b) => {
      appendFileSafe(logFile, b)
      tail.push(...b.toString().split('\n'))
      if (tail.length > 200) tail.splice(0, tail.length - 200)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('close', (code) => resolve({ code, tail: tail.slice(-50).join('\n') }))
    child.on('error', (err) => resolve({ code: -1, tail: String(err.message) }))
  })
}

function appendFileSafe(file, data) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data, { flag: 'a' })
  } catch {}
}

// ---------------------------------------------------------------------------------------------
// the qa/daily-tests branch

/**
 * Commit the accepted tests (and the report) to `qa/daily-tests` in the worktree `testsDir`
 * (created detached from the repo when missing; the branch is created as an orphan when it exists
 * neither locally nor on origin). Layout on the branch: `<lane>/lib/`, `<lane>/pr-<n>/…`,
 * `reports/<runId>.md`: a test imports `../lib/<x>.mjs` exactly as in the run folder.
 */
export function publishTests({ git, testsDir, repoDir, runId, lanes = {}, libFrom, report, push, message }) {
  const g = (args, cwd = testsDir) => git(args, { cwd })
  const must = (r, what) => {
    if (r.code !== 0) throw new Error(`${what}: ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`)
    return r
  }
  if (!existsSync(join(testsDir, '.git'))) {
    must(g(['worktree', 'add', '--detach', '--no-checkout', testsDir], repoDir), 'worktree add')
  }
  const branchNow = g(['branch', '--show-current']).stdout.trim()
  if (branchNow !== TESTS_BRANCH) {
    const local = g(['rev-parse', '--verify', '--quiet', `refs/heads/${TESTS_BRANCH}`]).code === 0
    if (local) must(g(['checkout', TESTS_BRANCH]), 'checkout')
    else {
      const remote = g(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${TESTS_BRANCH}`]).code === 0
      if (remote) must(g(['checkout', '-b', TESTS_BRANCH, `origin/${TESTS_BRANCH}`]), 'checkout remote')
      else {
        must(g(['checkout', '--orphan', TESTS_BRANCH]), 'orphan')
        g(['rm', '-rf', '--quiet', '--cached', '--ignore-unmatch', '.'])
        for (const e of readdirSync(testsDir))
          if (e !== '.git') rmSync(join(testsDir, e), { recursive: true })
      }
    }
  }
  for (const [lane, prs] of Object.entries(lanes)) {
    if (!Object.keys(prs).length) continue
    const libDir = join(testsDir, lane, 'lib')
    if (existsSync(libDir)) removeTree(libDir)
    if (libFrom) installTestlib(libDir)
    for (const [pr, snap] of Object.entries(prs)) {
      const dest = join(testsDir, lane, `pr-${pr}`)
      if (existsSync(dest)) removeTree(dest)
      mkdirSync(dest, { recursive: true })
      cpSync(snap, dest, { recursive: true })
      makeWritable(dest)
    }
    makeWritable(libDir)
  }
  if (report) {
    mkdirSync(join(testsDir, 'reports'), { recursive: true })
    writeFileSync(join(testsDir, 'reports', `${runId}.md`), report)
  }
  must(g(['add', '-A', '.']), 'add')
  const staged = g(['diff', '--cached', '--quiet']).code !== 0
  let committed = false
  if (staged) {
    must(
      g([
        '-c',
        'user.name=Tracy QA',
        '-c',
        'user.email=qa@tracy.invalid',
        'commit',
        '--no-verify',
        '-q',
        '-m',
        message ?? `test(qa): nightly run ${runId}`
      ]),
      'commit'
    )
    committed = true
  }
  const sha = g(['rev-parse', 'HEAD']).stdout.trim()
  let pushed = false
  let error = null
  if (push) {
    const r = g(['push', '--no-verify', 'origin', `HEAD:refs/heads/${TESTS_BRANCH}`])
    pushed = r.code === 0
    if (!pushed) error = r.stderr.trim().split('\n').slice(-3).join(' | ')
  }
  return { committed, sha, pushed, error }
}

function makeWritable(dir) {
  if (!existsSync(dir)) return
  const walk = (p) => {
    const st = statSync(p)
    chmodSync(p, st.isDirectory() ? 0o755 : 0o644)
    if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e))
  }
  walk(dir)
}

// ---------------------------------------------------------------------------------------------
// real dependencies

function which(name) {
  const r = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' })
  const p = r.stdout.trim()
  return p ? realpathSync(p) : null
}

export function defaultDeps(cfgIn) {
  const cfg = withPaths(cfgIn)
  const git = gitRunner()
  const claudeBin = which('claude')
  const codexBin = which('codex')
  const cliBins = [claudeBin, codexBin && dirname(dirname(codexBin))].filter(Boolean)
  const toolBin = join(TOOL_DIR, 'scripts', 'qa', 'bin')
  const envWithGuard = { ...process.env, PATH: `${toolBin}:${process.env.PATH}` }
  return {
    git,
    cliBins,
    bins: { claude: claudeBin ?? 'claude', codex: codexBin ?? 'codex' },
    fetchT() {
      const f = git(['fetch', '--quiet', 'origin', 'develop'], { cwd: cfg.repoDir })
      if (f.code !== 0) throw new Error(`git fetch: ${f.stderr.trim()}`)
      return git(['rev-parse', 'refs/remotes/origin/develop'], { cwd: cfg.repoDir }).stdout.trim()
    },
    discoverPrs: (o) => discoverPrs(o),
    prBody(n) {
      const r = spawnSync('gh', ['pr', 'view', String(n), '--json', 'body', '-q', '.body'], {
        cwd: cfg.repoDir,
        encoding: 'utf8',
        timeout: 60_000
      })
      return r.status === 0 ? r.stdout : ''
    },
    prDiff(pr) {
      const r = git(['diff', `${pr.mergeCommit}^1`, pr.mergeCommit], { cwd: cfg.repoDir })
      let bundled = []
      try {
        bundled = readBundled(readFileSync(join(cfg.srcDir, 'scripts', 'check-bundles.ts'), 'utf8'))
      } catch {}
      return filterDiff(r.stdout, bundled)
    },
    planPr,
    runAgent,
    rerun,
    reconcileOrphans,
    preflight() {
      const problems = []
      const df = spawnSync('df', ['-k', cfg.qaHome], { encoding: 'utf8' })
      const freeKb = Number(df.stdout.trim().split('\n').at(-1)?.split(/\s+/)[3])
      // QA_MIN_FREE_GB lowers the floor on a full machine; nightly.sh then watches the disk itself.
      const minGb = Number(process.env.QA_MIN_FREE_GB) || 40
      if (freeKb && freeKb < minGb * 1024 * 1024)
        problems.push(`disk: ${Math.round(freeKb / 1048576)} GB free < ${minGb}`)
      const d = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
        encoding: 'utf8',
        env: envWithGuard,
        timeout: 30_000
      })
      if (d.status !== 0) problems.push('docker: no answer')
      return problems
    },
    async probeGate() {
      try {
        await fetch(`${cfg.gateUrl}/__qa/health`, { signal: AbortSignal.timeout(5000) })
        return true
      } catch {
        return false
      }
    },
    stand: {
      async prepareSrc(T, log) {
        const problems = []
        const step = async (what, cmd, args) => {
          const r = await runLogged(cmd, args, {
            cwd: cfg.srcDir,
            env: envWithGuard,
            logFile: join(cfg.runDir, 'src.log')
          })
          log({ phase: 'P1', step: what, code: r.code })
          if (r.code !== 0) problems.push(`${what}: exit ${r.code}\n${r.tail}`)
          return r.code === 0
        }
        if (!existsSync(cfg.srcDir)) {
          const r = git(['worktree', 'add', '--detach', cfg.srcDir, T], { cwd: cfg.repoDir })
          if (r.code !== 0) return [`worktree add: ${r.stderr.trim()}`]
        } else if (!(await step('checkout', 'git', [...NOHOOKS, 'checkout', '--detach', '--force', T]))) {
          return problems
        }
        await step('submodule', 'git', [...NOHOOKS, 'submodule', 'update', '--init', '--recursive'])
        await step('dsh:build', 'pnpm', ['dsh:build'])
        await step('install', 'pnpm', ['install', '--frozen-lockfile'])
        return problems
      },
      async checkConfig() {
        const { checkConfig } = await import('./stand/check-config.mjs')
        return checkConfig({ envFile: cfg.envFile, srcDir: cfg.srcDir })
      },
      async build(T, log) {
        const logFile = join(cfg.runDir, 'build.log')
        const r = await runLogged(
          join(TOOL_DIR, 'scripts', 'rebuild-local.sh'),
          ['--context', cfg.srcDir, '--build-only', 'all'],
          { cwd: TOOL_DIR, env: { ...envWithGuard, APP_IMAGE_TAG: 'qa' }, logFile }
        )
        log({ phase: 'P4', step: 'build', code: r.code })
        if (r.code !== 0) return { ok: false, tail: r.tail }
        // The dsh-home bind mount shadows the image's profiles/: seed them again from the new image.
        const home = join(cfg.qaHome, 'dsh-home')
        const seed = await runLogged(
          '/bin/sh',
          [
            '-c',
            // Labelled so the docker guard lets it through; the old profiles are kept one night.
            `set -e; rm -rf "${home}/profiles.prev"; [ -d "${home}/profiles" ] && mv "${home}/profiles" "${home}/profiles.prev"; docker run --rm --label qa.run=seed --entrypoint sh tracy/dsh:qa -c 'tar -C /desk-home -cf - profiles' | tar -C "${home}" -xf -`
          ],
          { cwd: TOOL_DIR, env: envWithGuard, logFile }
        )
        log({ phase: 'P4', step: 'seed-dsh-profiles', code: seed.code })
        if (seed.code !== 0) return { ok: false, tail: seed.tail }
        return { ok: true }
      },
      async deploy() {
        process.env.PATH = envWithGuard.PATH
        const { deploy } = await import('./stand/deploy.mjs')
        const r = await deploy({ srcDir: cfg.srcDir, envFile: cfg.envFile, runId: cfg.runId })
        // The stand now runs this tool tree's overlay and rules: stamp it, or the next match
        // compares against a toolSha the stand never recorded and rebuilds forever.
        if (r.ok) {
          const file = join(stateDir(cfg.qaHome), 'stand.json')
          let toolSha = null
          try {
            toolSha = readFileSync(join(cfg.qaHome, 'tool.sha'), 'utf8').trim()
          } catch {}
          writeJsonAtomic(file, { ...readJson(file, {}), toolSha })
        }
        return r
      },
      async matches(T) {
        process.env.PATH = envWithGuard.PATH
        const m = await import('./stand/manifest.mjs')
        const previous = readJson(join(stateDir(cfg.qaHome), 'stand.json'), null)
        let toolSha = null
        try {
          toolSha = readFileSync(join(cfg.qaHome, 'tool.sha'), 'utf8').trim()
        } catch {}
        const want = m.desired({ srcDir: cfg.srcDir, sourceSha: T, envFile: cfg.envFile, toolSha })
        const have = m.actual({ srcDir: cfg.srcDir, previous })
        const d = m.decide(want, have)
        m.writeStand({
          ...have,
          baseline: d.rebuild ? 'unverified' : 'valid',
          checkedAt: new Date().toISOString()
        })
        return { ok: !d.rebuild, reasons: d.reasons, sha: have.sourceSha }
      }
    },
    async startLaneServices({ lane, runId, layout }) {
      const stops = []
      const port = DEFAULT_PORTS.lanes[lane].proxy
      try {
        const proxy = createEgressProxy({
          port,
          host: '127.0.0.1',
          allow: PROXY_HOSTS[lane],
          logFile: join(cfg.qaHome, 'r', runId, `egress-${lane}.jsonl`)
        })
        await proxy.listening
        stops.push(() => proxy.close())
      } catch (err) {
        // sol and verify share one port and one allow-list; the second start finds it listening.
        if (err?.code !== 'EADDRINUSE') throw err
      }
      const { startChrome } = await import('./fence/chrome.mjs')
      const profile = renderProfile({
        lane,
        kind: 'chrome',
        layout,
        outDir: join(cfg.qaHome, 'r', runId, 'profiles')
      })
      mkdirSync(layout.staging, { recursive: true })
      const chrome = await startChrome({
        lane,
        profileFile: profile.file,
        cdpPort: DEFAULT_PORTS.lanes[lane].cdp,
        chromeDir: layout.chromeDir,
        procsLog: join(cfg.qaHome, 'r', runId, 'procs.jsonl'),
        runId
      })
      stops.push(() => chrome.stop())
      return {
        stop: async () => Promise.all(stops.map((s) => s()).map((p) => Promise.resolve(p).catch(() => {})))
      }
    },
    gh: createGh({ dryRun: cfg.dryRunIssues }),
    ensureSeats(lanes) {
      process.env.PATH = envWithGuard.PATH
      return ensureLaneSeats({
        lanes,
        sites: readJson(join(stateDir(cfg.qaHome), 'fixed-sites.json'), QA.fixedSites)
      })
    },
    sweepSites(runId) {
      process.env.PATH = envWithGuard.PATH
      return sweepSites({
        qaHome: cfg.qaHome,
        runId,
        keep: readJson(join(stateDir(cfg.qaHome), 'fixed-sites.json'), QA.fixedSites)
      })
    },
    issuesLedger: fileLedger(join(stateDir(cfg.qaHome), 'issues.jsonl')),
    watchdogProbes: {},
    sleep: (ms) => new Promise((r) => setTimeout(r, ms))
  }
}

// ---------------------------------------------------------------------------------------------
// the night

export async function runNight(cfgIn, deps) {
  const startedAt = Date.now()
  const runId = cfgIn.runId ?? nextRunId(cfgIn.qaHome)
  const cfg = withPaths({ ...cfgIn, runId })
  cfg.runDir = join(cfg.qaHome, 'r', runId)
  mkdirSync(cfg.runDir, { recursive: true })
  const state = stateDir(cfg.qaHome)
  mkdirSync(state, { recursive: true })
  const procsPath = join(cfg.runDir, 'procs.jsonl')
  const agentsLog = join(cfg.runDir, 'agents.jsonl')
  const logFile = join(cfg.runDir, 'nightly.log')
  const log = (e) => {
    const line = { at: new Date().toISOString(), ...e }
    appendLine(logFile, line)
    if (cfg.echo !== false) process.stderr.write(`${JSON.stringify(line)}\n`)
  }
  const troubles = []
  const trouble = (phase, text) => {
    troubles.push(`${phase}: ${text}`)
    log({ phase, trouble: String(text).split('\n')[0] })
  }
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const lanes = cfg.lanes
  log({ phase: 'P0', event: 'start', runId, mode: cfg.mode, lanes, dryRunIssues: cfg.dryRunIssues })

  // ----- P0: orphans of earlier runs, T, run.json, lane services
  const orphanReport = { killed: 0, mismatched: 0, foundByRunId: 0 }
  const rDir = join(cfg.qaHome, 'r')
  for (const prev of existsSync(rDir) ? readdirSync(rDir) : []) {
    if (prev === runId) continue
    const p = join(rDir, prev, 'procs.jsonl')
    if (!existsSync(p)) continue
    const r = deps.reconcileOrphans({ procsPath: p, runId: prev })
    orphanReport.killed += r.killed.length
    orphanReport.mismatched += r.mismatched.length
    orphanReport.foundByRunId += r.foundByRunId.length
  }
  log({ phase: 'P0', event: 'orphans', ...orphanReport })
  if (orphanReport.killed || orphanReport.mismatched)
    troubles.push(
      `P0: orphans of earlier runs: ${orphanReport.killed} killed, ${orphanReport.mismatched} left alone (start time differs)`
    )

  for (const p of (await deps.preflight?.()) ?? []) trouble('P0', p)

  // `--target` pins T (a resumed night must stay on the commit its stand was built from).
  const T = cfg.target ?? deps.fetchT()
  log({ phase: 'P0', event: 'T', T })
  // Lanes sign in as fixture@<lane> to act on a fixed site; that account needs its seat.
  if (deps.ensureSeats) {
    const r = deps.ensureSeats([...lanes, 'verify'])
    if (r.ok) log({ phase: 'P0', event: 'fixture seats', granted: r.granted.length })
    else trouble('P0', `fixture seats: ${r.error}`)
  }
  const from = cfg.mode === 'first-run' ? cfg.baseline : readDiscovery(cfg.qaHome).discoveredThrough
  if (!from)
    throw new Error('no discoveredThrough in state/discovery.json: run --first-run --baseline <sha> first')

  // lane keys: the gate checks sha256(key) against run.json; the key itself lives in the lane folder
  const keys = {}
  const allLanes = [...lanes, 'verify']
  for (const lane of allLanes) {
    const layout = laneLayout({ qaHome: cfg.qaHome, worktrees: cfg.worktrees, runId, lane, realpath: false })
    mkdirSync(layout.laneDir, { recursive: true })
    keys[lane] = randomBytes(24).toString('hex')
    writeFileSync(layout.laneKey, `${keys[lane]}\n`, { mode: 0o600 })
  }
  const adminKey = randomBytes(24).toString('hex')
  writeFileSync(join(cfg.runDir, 'admin.key'), `${adminKey}\n`, { mode: 0o600 })
  const writeLease = () =>
    writeRun(cfg.qaHome, {
      runId,
      laneKeyHashes: Object.fromEntries(Object.entries(keys).map(([l, k]) => [l, sha256(k)])),
      adminKeyHash: sha256(adminKey),
      leaseUntil: Date.now() + cfg.leaseMs,
      pid: process.pid
    })
  writeLease()
  const lease = setInterval(writeLease, cfg.renewMs)
  lease.unref?.()
  writeJsonAtomic(
    join(state, 'fixed-sites.json'),
    cfg.fixedSites.map((s) => s.key)
  )

  const services = []
  const watchdog = createWatchdog({
    qaHome: cfg.qaHome,
    runId,
    probes: deps.watchdogProbes ?? {},
    fixedSites: cfg.fixedSites.map((s) => s.key),
    log: (e) => log({ phase: 'watchdog', ...e }),
    onStopLane: (lane, reason) => trouble('watchdog', `lane ${lane} stopped: ${reason}`)
  })
  const cleanup = async () => {
    clearInterval(lease)
    watchdog.stop()
    for (const s of services) await Promise.resolve(s.stop()).catch(() => {})
    try {
      unlinkSync(join(state, 'run.json'))
    } catch {}
  }

  const night = {
    runId,
    range: { from, to: T },
    stand: { sha: null, reconciled: false, baseline: 'unverified' },
    prCount: 0,
    directCommits: [],
    durationMin: 0,
    fence: { ok: true },
    standCanary: { ok: true },
    models: {
      plan: 'opus',
      sonnet: 'sonnet',
      sol: { model: 'gpt-6.1-sol', effort: 'low' },
      verify: { model: 'gpt-6-astra', effort: 'high' }
    },
    redSummary: { sonnet: 0, sol: 0, both: 0, verified: 0 },
    needsReview: [],
    laneDisagreements: [],
    inconclusive: [],
    unclassified: [],
    following: [],
    observedOk: [],
    notCheckable: [],
    docsOnly: [],
    notReached: [],
    ended: [],
    issues: null,
    lanes: {},
    calibration: {},
    regression: { core: 'not run', ran: 0, passed: 0, failed: 0, quarantined: [] },
    chat: { primer: 'off', turns: { sonnet: 0, sol: 0, verify: 0 }, failures: {}, balance: {} },
    troubles,
    sites: { created: 0, deleted: 0, orphans: 0 },
    access: {
      humanUrl: `${cfg.origin}/__qa/human?k=…`,
      otp: 'qa-tool/scripts/qa/otp <email>',
      rerun: 'qa-tool/scripts/qa/rerun <lane> <pr> [case]'
    }
  }
  let exitCode = 0

  try {
    for (const lane of allLanes) {
      const layout = laneLayout({ qaHome: cfg.qaHome, worktrees: cfg.worktrees, runId, lane })
      try {
        services.push(await deps.startLaneServices({ lane, runId, layout }))
        log({ phase: 'P0', lane, event: 'lane services up' })
      } catch (err) {
        trouble('P0', `lane ${lane} services: ${err.message}`)
      }
    }
    watchdog.start()

    // ----- P1: product tree, PRs, plans
    const srcProblems = (await deps.stand.prepareSrc(T, log)) ?? []
    for (const p of srcProblems) trouble('P1', p)
    let configOk = true
    try {
      const cc = await deps.stand.checkConfig()
      if (!cc.ok) {
        configOk = false
        trouble('P1', `check-config on T: ${(cc.problems ?? []).join('; ')}`)
      }
    } catch (err) {
      configOk = false
      trouble('P1', `check-config on T: ${err.message}`)
    }

    const queued = listQueue(cfg.qaHome).filter(
      (e) =>
        !Object.values(e.lanes).every((l) =>
          ['reported', 'skipped', 'gave-up', 'superseded', 'reverted'].includes(l.state)
        )
    )
    const found = deps.discoverPrs({
      repoDir: cfg.repoDir,
      from,
      to: T,
      queued: queued.map((q) => q.number)
    })
    night.directCommits = found.directCommits.map((c) => ({ sha: c.sha, subject: c.subject }))
    for (const r of found.reverted)
      night.ended.push({ pr: r.number, state: 'reverted', reason: r.revertCommit })
    const reverted = new Set(found.reverted.map((r) => r.number))
    let prs = found.prs.filter((p) => !reverted.has(p.number))
    night.prCount = found.prs.length
    if (cfg.onlyPr) prs = prs.filter((p) => cfg.onlyPr.includes(p.number))
    night.docsOnly = prs.filter((p) => p.kind === 'docs').map((p) => p.number)
    for (const p of prs.filter((x) => x.kind === 'theme'))
      night.notCheckable.push({ pr: p.number, reason: 'theme / quickstart: listed only (plan §5 P1)' })
    prs = prs.filter((p) => p.kind !== 'docs' && p.kind !== 'theme')
    const ranked = [...prs].sort((a, b) => a.priority - b.priority || a.number - b.number)
    const chosen = new Set(ranked.slice(0, cfg.maxPrs).map((p) => p.number))
    night.notReached = prs.filter((p) => !chosen.has(p.number)).map((p) => p.number)
    prs = prs.filter((p) => chosen.has(p.number))
    log({
      phase: 'P1',
      event: 'prs',
      count: prs.length,
      prs: prs.map((p) => p.number),
      notReached: night.notReached.length
    })

    for (const p of prs) {
      let e = readQueueEntry(cfg.qaHome, p.number)
      if (!e) {
        e = newQueueEntry({ ...p, author: p.author?.login ?? p.author, firstSeen: runId }, lanes)
        writeQueueEntry(cfg.qaHome, e)
      }
      p.body = deps.prBody(p.number) ?? ''
      p.key = `pr${p.number}`
    }

    const plans = new Map()
    await pool(prs, 3, async (p) => {
      const planFile = join(state, 'plans', `pr-${p.number}.json`)
      let plan = readJson(planFile, null)
      if (!plan) {
        const r = await deps.planPr({
          pr: { key: p.key, title: p.title, body: p.body },
          runId,
          procsPath,
          agentsLog,
          cwd: cfg.runDir,
          cliHome: join(cfg.runDir, 'opus', 'cli', p.key),
          deadline: Date.now() + 3 * 60_000,
          claudeTokenFile: join(cfg.qaHome, 'claude-token'),
          sandbox: false,
          bins: deps.bins
        })
        if (!r.plan) {
          log({ phase: 'P1', pr: p.number, event: 'plan failed', errors: r.errors?.slice(0, 3) })
          night.notCheckable.push({
            pr: p.number,
            reason: `no test plan: ${(r.errors ?? []).join('; ').slice(0, 200)}`
          })
          return
        }
        plan = r.plan
        writePlanOnce(planFile, plan)
      }
      const checkable = plan.cases.filter((c) => c.checkable)
      for (const c of plan.cases.filter((x) => !x.checkable))
        night.notCheckable.push({ pr: p.number, reason: `${c.id}: ${c.reason}` })
      if (!checkable.length) {
        log({ phase: 'P1', pr: p.number, event: 'nothing checkable' })
        return
      }
      plans.set(p.number, { ...plan, cases: checkable })
      let e = readQueueEntry(cfg.qaHome, p.number)
      for (const lane of lanes) if (e.lanes[lane]?.state === 'queued') e = advance(e, lane, 'planned')
      writeQueueEntry(cfg.qaHome, e)
      log({ phase: 'P1', pr: p.number, event: 'planned', cases: checkable.length })
    })

    // ----- P3: write tests against the stand as it is (B)
    const work = []
    const resumed = [] // lanes a --resume finds already written: P5 still reruns them
    for (const p of prs)
      if (plans.has(p.number))
        for (const lane of lanes) {
          const st = readQueueEntry(cfg.qaHome, p.number)?.lanes?.[lane]?.state
          if (cfg.resumeRunId && st && st !== 'queued' && st !== 'planned') {
            resumed.push({ p, lane })
            continue
          }
          work.push({ p, lane })
        }
    const written = new Map() // `${lane}/${pr}` -> { result, snapshotDir, files }
    for (const { p, lane } of resumed) {
      const w = recoverWritten({ cfg, runId, p, lane })
      if (w) written.set(`${lane}/${p.number}`, w)
    }
    const byLane = Object.fromEntries(lanes.map((l) => [l, work.filter((w) => w.lane === l)]))
    await Promise.all(
      lanes.map((lane) =>
        pool(byLane[lane], 3, async ({ p, lane }) => {
          try {
            const res = await writeOne({
              cfg,
              deps,
              runId,
              procsPath,
              agentsLog,
              p,
              lane,
              plan: plans.get(p.number),
              log
            })
            if (res) written.set(`${lane}/${p.number}`, res)
          } catch (err) {
            trouble('P3', `pr ${p.number} lane ${lane}: ${err.message}`)
          }
        })
      )
    )

    // ----- P4: rebuild the stand at T when it does not match
    let standOk = false
    let standCheck = await deps.stand.matches(T)
    if (cfg.skipBuild || standCheck.ok || !configOk) {
      if (!standCheck.ok && !configOk) trouble('P4', 'check-config red: no build, the stand stays at B')
      else if (!standCheck.ok)
        trouble(
          'P4',
          `--skip-build with a stand that differs from desired(T): ${standCheck.reasons.join('; ')}`
        )
    } else {
      log({ phase: 'P4', event: 'rebuild', reasons: standCheck.reasons })
      const b = await deps.stand.build(T, log)
      if (!b.ok) trouble('P4', `build failed\n${b.tail ?? ''}`)
      else {
        const d = await deps.stand.deploy()
        log({ phase: 'P4', event: 'deploy', ok: d.ok, step: d.step })
        if (!d.ok)
          trouble('P4', `deploy failed at ${d.step}: ${(d.unhealthy ?? []).join(', ')} ${d.stderr ?? ''}`)
        standCheck = await deps.stand.matches(T)
      }
    }
    standOk = standCheck.ok
    night.stand = {
      sha: standCheck.sha ?? (standOk ? T : null),
      reconciled: true,
      baseline: standOk ? 'valid' : 'unverified'
    }
    if (!standOk) trouble('P4', `stand does not match desired(T): ${(standCheck.reasons ?? []).join('; ')}`)
    log({ phase: 'P4', event: 'stand', matches: standOk })

    // ----- P5: rerun on T (script, test fence), red -> once more after the delay
    const outcome = new Map() // `${lane}/${pr}` -> Map(caseId -> { first, second, rerunResult })
    if (standOk) {
      const items = [...written.entries()].filter(([, w]) => w.files.length)
      await pool(items, 3, async ([k]) => {
        const [lane, pr] = k.split('/')
        let r1
        try {
          r1 = await deps.rerun({ lane, pr, runId, qaHome: cfg.qaHome, worktrees: cfg.worktrees })
        } catch (err) {
          trouble('P5', `rerun ${lane} ${pr}: ${err.message}`)
          return
        }
        const s1 = caseStatuses(r1)
        const per = new Map()
        const e1 = caseErrors(r1)
        for (const [id, s] of s1)
          per.set(id, { first: s, firstErrors: e1.get(id) ?? [], output: r1.outputTail })
        const red = [...s1].filter(([, s]) => s === 'fail').map(([id]) => id)
        log({
          phase: 'P5',
          pr: Number(pr),
          lane,
          event: 'rerun',
          pass: r1.summary?.pass,
          fail: r1.summary?.fail
        })
        if (red.length) {
          await sleep(cfg.retryDelayMs)
          for (const id of red) {
            let r2 = null
            try {
              r2 = await deps.rerun({
                lane,
                pr,
                target: id,
                runId,
                qaHome: cfg.qaHome,
                worktrees: cfg.worktrees
              })
            } catch (err) {
              trouble('P5', `rerun ${lane} ${pr} ${id}: ${err.message}`)
            }
            const s2 = r2 ? (caseStatuses(r2).get(id) ?? 'fail') : 'fail'
            per.set(id, {
              ...per.get(id),
              second: s2,
              secondErrors: r2 ? (caseErrors(r2).get(id) ?? []) : [],
              output: r2?.outputTail ?? per.get(id).output
            })
            log({ phase: 'P5', pr: Number(pr), lane, case: id, event: 'retry', result: s2 })
          }
        }
        outcome.set(k, per)
        let e = readQueueEntry(cfg.qaHome, Number(pr))
        if (e?.lanes[lane]?.state === 'written') e = advance(e, lane, 'rerun')
        if (e) writeQueueEntry(cfg.qaHome, e)
      })
    } else {
      for (const p of prs)
        if (plans.has(p.number))
          night.unclassified.push(...plans.get(p.number).cases.map((c) => ({ pr: p.number, caseId: c.id })))
    }

    // per case view across lanes
    const cases = []
    for (const p of prs) {
      const plan = plans.get(p.number)
      if (!plan) continue
      for (const c of plan.cases) {
        const laneView = {}
        for (const lane of lanes) {
          const w = written.get(`${lane}/${p.number}`)
          const wroteIt = Boolean(w?.files.includes(`${c.id}.test.mjs`))
          const o = outcome.get(`${lane}/${p.number}`)?.get(c.id)
          laneView[lane] = {
            status: laneStatus({
              written: wroteIt,
              standOk,
              first: o?.first,
              second: o?.second,
              firstErrors: o?.firstErrors,
              secondErrors: o?.secondErrors
            }),
            testPath: `${lane}/pr-${p.number}/tests/${c.id}.test.mjs`,
            before: w?.before?.get(c.id) ?? null,
            output: o?.output ?? '',
            testText: wroteIt ? safeRead(join(w.testsDir, `${c.id}.test.mjs`)) : ''
          }
        }
        cases.push({
          id: c.id,
          pr: p.number,
          quote: c.quote,
          expected: c.expected,
          // The brake groups red cases by HOW they failed, not by PR kind: three PRs failing on the
          // same message is a stand or fixture problem, three apps PRs failing differently is not.
          kind: failureSignature(laneView),
          lanes: laneView
        })
      }
    }

    // ----- P6: one verify run per PR with red cases
    const redByPr = new Map()
    for (const c of cases) {
      if (lanes.some((l) => c.lanes[l].status === 'red')) {
        const list = redByPr.get(c.pr) ?? []
        list.push(c)
        redByPr.set(c.pr, list)
      }
    }
    if (standOk) {
      await pool([...redByPr.entries()], 2, async ([prNum, list]) => {
        const p = prs.find((x) => x.number === prNum)
        let verdicts = null
        try {
          verdicts = await verifyOne({ cfg, deps, runId, procsPath, agentsLog, p, list, lanes, log })
        } catch (err) {
          trouble('P6', `pr ${prNum}: ${err.message}`)
        }
        for (const c of list) {
          const v = verdicts?.get(c.id)
          if (v) c.verdict = { conclusion: v.verdict, observed: v.observation, reason: v.reason }
          else night.unclassified.push({ pr: prNum, caseId: c.id })
        }
      })
    }

    // ----- P7: follow-ups (regression suite: first run is empty)
    const follow = readFollowups(cfg.qaHome)
    if (cfg.mode !== 'first-run') {
      for (const f of Object.values(follow.cases)) {
        // A follow-up reruns the case written in this run when there is one; older tests are rerun by
        // the orchestrator session through `scripts/qa/rerun` until P7 copies them from the branch.
        const c = cases.find((x) => x.id === f.caseId)
        if (!c) continue
        const ok = c.lanes[f.lane]?.status === 'green'
        tickFollowup(follow, f.caseId, { ok, runId, sha: T })
      }
    }

    // ----- report data
    for (const c of cases) {
      const red = lanes.filter((l) => c.lanes[l].status === 'red')
      for (const l of red) night.redSummary[l] = (night.redSummary[l] ?? 0) + 1
      if (red.length > 1) night.redSummary.both += 1
      for (const l of lanes.filter((x) => c.lanes[x].status === 'not-checkable'))
        night.notCheckable.push({
          pr: c.pr,
          reason: `${c.id} (${l}): the test fence refused a repository command on both runs`
        })
      if (c.verdict?.conclusion === 'differs') night.redSummary.verified += 1
      const statuses = lanes.map((l) => c.lanes[l].status)
      if (lanes.length > 1 && new Set(statuses).size > 1)
        night.laneDisagreements.push({
          pr: c.pr,
          caseId: c.id,
          ...Object.fromEntries(lanes.map((l) => [l, c.lanes[l].status]))
        })
      const green = lanes.filter((l) => c.lanes[l].status === 'green')
      if (green.length) night.observedOk.push({ pr: c.pr, caseId: c.id, quote: c.quote, lanes: green })
      if (c.verdict?.conclusion === 'inconclusive')
        night.inconclusive.push({ pr: c.pr, caseId: c.id, reason: c.verdict.reason })
      if (c.verdict?.conclusion === 'differs') {
        const before = red.map((l) => c.lanes[l].before).find(Boolean)
        const p = prs.find((x) => x.number === c.pr)
        night.needsReview.push({
          pr: c.pr,
          author: p?.author?.login ?? p?.author ?? '',
          caseId: c.id,
          quote: c.quote,
          observed: c.verdict.observed,
          differsFromB: before ? (before === 'pass' ? 'no' : 'yes') : 'unknown',
          redLanes: red,
          issue: null,
          look: `qa-tool/${rerunCommand(red[0], c.pr, c.id)}`
        })
        addFollowup(follow, { caseId: c.id, pr: c.pr, lane: red[0], reason: 'differs', runId })
      }
    }
    for (const lane of lanes) {
      const mine = cases.filter((c) => c.lanes[lane])
      night.lanes[lane] = {
        assigned: mine.length,
        ran: mine.filter((c) => !['no-test', 'not-checkable'].includes(c.lanes[lane].status)).length,
        redOnT: mine.filter((c) => c.lanes[lane].status === 'red').length,
        differs: mine.filter((c) => c.lanes[lane].status === 'red' && c.verdict?.conclusion === 'differs')
          .length,
        testWrong: mine.filter(
          (c) => c.lanes[lane].status === 'red' && c.verdict?.conclusion === 'test-wrong'
        ).length,
        confirmed: 0,
        falsePositive: 0,
        timeouts: [...written.keys()].filter(
          (k) => k.startsWith(`${lane}/`) && written.get(k).status === 'timeout'
        ).length,
        minutesPerPr: '-',
        cost: '-'
      }
    }

    // ----- P8: intake already done per PR; commit tests, issues, report
    const toCommit = {}
    for (const [k, w] of written) {
      const [lane, pr] = k.split('/')
      if (!w.snapshotDir || !w.accepted) continue
      toCommit[lane] ??= {}
      toCommit[lane][pr] = w.snapshotDir
    }
    let pub = { pushed: false, error: null }
    try {
      pub = publishTests({
        git: deps.git,
        testsDir: cfg.testsDir,
        repoDir: cfg.repoDir,
        runId,
        lanes: toCommit,
        libFrom: true,
        push: cfg.push
      })
      log({
        phase: 'P8',
        event: 'tests committed',
        committed: pub.committed,
        pushed: pub.pushed,
        sha: pub.sha
      })
      if (cfg.push && !pub.pushed) trouble('P8', `git push: ${pub.error}`)
    } catch (err) {
      trouble('P8', `tests commit: ${err.message}`)
    }

    const issueInput = {
      runId,
      sha: night.stand.sha ?? T,
      standMatches: standOk && (pub.pushed || !cfg.push),
      qaHome: cfg.qaHome,
      dailyIssue: readDailyIssue(state),
      prs: prs.map((p) => ({
        number: p.number,
        title: p.title,
        body: p.body,
        author: { login: p.author?.login ?? p.author, isBot: p.authorIsBot },
        state: 'merged'
      })),
      cases: cases.map((c) => ({
        id: c.id,
        pr: c.pr,
        quote: c.quote,
        expected: c.expected,
        kind: c.kind,
        lanes: Object.fromEntries(
          lanes.map((l) => [l, { status: c.lanes[l].status, testPath: c.lanes[l].testPath }])
        ),
        verdict: c.verdict
      })),
      secrets: secretsFor(cfg)
    }
    try {
      const summary = publishIssues(issueInput, { gh: deps.gh, ledger: deps.issuesLedger })
      night.issues = { ...summary, feedback: {} }
      for (const x of summary.created ?? []) {
        for (const n of night.needsReview) if (n.pr === x.pr) n.issue = x.issue ?? null
        for (const id of x.cases ?? []) if (follow.cases[id]) follow.cases[id].issue = x.issue ?? null
      }
      log({
        phase: 'P8',
        event: 'issues',
        dryRun: Boolean(deps.gh.dryRun),
        blocked: summary.blocked,
        created: summary.created.length,
        commented: summary.commented.length,
        notOpened: summary.notOpened.length
      })
    } catch (err) {
      trouble('P8', `issues: ${err.message}`)
    }
    night.following = Object.values(follow.cases).map((f) => ({
      pr: f.pr,
      caseId: f.caseId,
      issue: f.issue,
      nights: f.nights
    }))
    writeFollowups(cfg.qaHome, follow)

    for (const p of prs) {
      let e = readQueueEntry(cfg.qaHome, p.number)
      if (!e) continue
      for (const lane of lanes) {
        const s = e.lanes[lane]?.state
        try {
          if (s === 'rerun') e = advance(e, lane, 'verified')
          if (e.lanes[lane].state === 'verified') e = advance(e, lane, 'reported')
        } catch {}
      }
      writeQueueEntry(cfg.qaHome, e)
    }
    if (standOk) writeDiscovery(cfg.qaHome, T)
    else trouble('P8', 'discovery not moved: the stand never matched T, the same range comes back tomorrow')
  } catch (err) {
    exitCode = 1
    trouble('run', err?.stack ?? String(err))
  } finally {
    night.durationMin = Math.round((Date.now() - startedAt) / 60_000)
  }

  // report: always, even after a failure
  let reportFile = join(cfg.runDir, 'report.md')
  try {
    const text = renderReport(night)
    writeFileSync(reportFile, text)
    log({ phase: 'P8', event: 'report', file: reportFile })
    try {
      const r = publishTests({
        git: deps.git,
        testsDir: cfg.testsDir,
        repoDir: cfg.repoDir,
        runId,
        report: text,
        push: cfg.push,
        message: `docs(qa): nightly report ${runId}`
      })
      log({ phase: 'P8', event: 'report committed', pushed: r.pushed, sha: r.sha })
    } catch (err) {
      log({ phase: 'P8', trouble: `report commit: ${err.message}` })
    }
  } catch (err) {
    exitCode = 1
    reportFile = null
    log({ phase: 'P8', trouble: `report: ${err.message}` })
  }
  // Sites the lanes created this night: deleted through tracy-web, or taken down when it cannot.
  if (deps.sweepSites) {
    try {
      const sw = await deps.sweepSites(runId)
      log({
        phase: 'P8',
        event: 'sweep',
        deleted: sw.deleted.length,
        downed: sw.downed.length,
        failed: sw.failed
      })
    } catch (err) {
      log({ phase: 'P8', trouble: `sweep: ${err.message}` })
    }
  }
  // One summary comment per night on the standing "Daily QA" issue.
  try {
    const num = readFileSync(join(stateDir(cfg.qaHome), 'daily-issue.txt'), 'utf8').trim()
    if (num && cfg.push !== false) {
      const created = night.issues?.created?.length ?? 0
      const blocked = night.issues?.blocked ?? null
      const body = [
        `Daily QA \`${runId}\`: \`develop\` ${String(night.from ?? cfg.baseline ?? '').slice(0, 9)} → ${String(T ?? '').slice(0, 9)}, ${night.prCount} PRs in range.`,
        `Issues opened: ${created}${blocked ? ` (publishing held: ${blocked})` : ''}. Red on T: sonnet ${night.redSummary?.sonnet ?? 0}, sol ${night.redSummary?.sol ?? 0}.`,
        `Report: https://github.com/${CI_REPOSITORY}/blob/qa/daily-tests/reports/${runId}.md`
      ].join('\n')
      deps.gh.run(['issue', 'comment', num, '--repo', CI_REPOSITORY, '--body', body])
      log({ phase: 'P8', event: 'summary comment', issue: Number(num), dryRun: Boolean(deps.gh.dryRun) })
    }
  } catch (err) {
    log({ phase: 'P8', trouble: `summary comment: ${err.message}` })
  }
  writeJsonAtomic(join(cfg.runDir, 'night.json'), night)
  await cleanup()
  pruneRuns(cfg, runId)
  log({ phase: 'P8', event: 'end', exitCode, minutes: night.durationMin })
  return { runId, runDir: cfg.runDir, night, reportFile, exitCode }
}

/** The "Daily QA" issue number: state/daily-issue.txt (or .json { number }). */
function readDailyIssue(state) {
  const n = Number(safeRead(join(state, 'daily-issue.txt')).trim())
  if (n > 0) return n
  return readJson(join(state, 'daily-issue.json'), null)?.number
}

function safeRead(p) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

function secretsFor(cfg) {
  try {
    return cliTokens({
      codexHome: join(cfg.qaHome, 'codex-auth'),
      claudeTokenFile: join(cfg.qaHome, 'claude-token')
    })
  } catch {
    return []
  }
}

function pruneRuns(cfg, runId) {
  const r = join(cfg.qaHome, 'r')
  const limit = Date.now() - cfg.keepRunsDays * 86_400_000
  for (const d of existsSync(r) ? readdirSync(r) : []) {
    if (d === runId || !/^\d{8}[a-z]+$/.test(d)) continue
    try {
      if (statSync(join(r, d)).mtimeMs < limit) removeTree(join(r, d))
    } catch {}
  }
}

/** How a red case failed, with numbers and ids blanked, for the issue brake. */
function failureSignature(laneView) {
  for (const v of Object.values(laneView)) {
    if (v.status !== 'red') continue
    const m = /(?:Error|AssertionError)[^:\n]*:\s*([^\n]+)|"message":\s*"([^"]+)"/.exec(v.output ?? '')
    const msg = (m?.[1] ?? m?.[2] ?? '').trim()
    if (!msg) continue
    return msg
      .replace(/[0-9a-f]{8,}|\d+/gi, '#')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
  }
  return null
}

// What writeOne returned for a lane written earlier in this same run folder (`--resume`): the
// tests that passed intake are the ones still in the lane folder, and their result.json still
// carries the outcomes recorded on the baseline stand.
function recoverWritten({ cfg, runId, p, lane }) {
  const layout = laneLayout({
    qaHome: cfg.qaHome,
    worktrees: cfg.worktrees,
    runId,
    lane,
    pr: String(p.number)
  })
  if (!existsSync(layout.prTestDir)) return null
  const files = readdirSync(layout.prTestDir).filter((f) => f.endsWith('.test.mjs'))
  const result = readJson(join(layout.prTestDir, 'result.json'), null)
  const before = new Map((result?.cases ?? []).map((c) => [c.caseId, c.before?.outcome]))
  const snapshotDir = join(cfg.runDir, 'intake', lane, `pr-${p.number}`)
  const libDir = join(layout.prDir, 'lib')
  return {
    status: 'ok',
    files,
    testsDir: layout.prTestDir,
    before,
    snapshotDir: files.length && existsSync(snapshotDir) ? snapshotDir : null,
    accepted: files.length > 0,
    libSha256: existsSync(libDir) ? libDigest(libDir) : null
  }
}

/** P3 for one PR and one lane: install lib, render the cli profile, run the lane, intake. */
async function writeOne({ cfg, deps, runId, procsPath, agentsLog, p, lane, plan, log }) {
  const layout = laneLayout({
    qaHome: cfg.qaHome,
    worktrees: cfg.worktrees,
    runId,
    lane,
    pr: String(p.number),
    cliBins: deps.cliBins ?? []
  })
  const libDir = join(layout.prDir, 'lib')
  mkdirSync(layout.prTestDir, { recursive: true })
  if (!existsSync(libDir)) installTestlib(libDir)
  const profile = renderProfile({
    lane,
    kind: 'cli',
    layout,
    outDir: join(cfg.runDir, 'profiles', `pr-${p.number}`)
  })
  const cliHome = join(layout.cliHome, `pr-${p.number}`)
  const port = DEFAULT_PORTS.lanes[lane]
  let e = readQueueEntry(cfg.qaHome, p.number)
  log({ phase: 'P3', pr: p.number, lane, event: 'write start' })
  const outcome = await deps.runAgent({
    role: 'write',
    lane,
    key: p.key,
    runId,
    procsPath,
    agentsLog,
    prompt: writePrompt({
      lane,
      prKey: p.key,
      cases: plan.cases,
      testDir: layout.prTestDir,
      origin: cfg.origin,
      gate: cfg.gateUrl,
      cdp: `http://127.0.0.1:${port.cdp}`,
      testlib: libDir,
      sites: cfg.fixedSites,
      src: layout.src,
      laneKeyFile: layout.laneKey
    }),
    cwd: layout.prTestDir,
    cliHome,
    deadline: Date.now() + 12 * 60_000,
    claudeTokenFile: join(cfg.qaHome, 'claude-token'),
    codexAuthFile: join(cfg.qaHome, 'codex-auth', 'auth.json'),
    // The owner's default Codex effort, read from their own config each night (it can change).
    effort: lane === 'sol' ? solEffort() : undefined,
    pluginDir: layout.skills,
    addDirs: [layout.prDir, layout.src],
    proxy: `http://127.0.0.1:${port.proxy}`,
    sandboxProfile: profile.file,
    bins: deps.bins,
    extraEnv: {
      QA_LANE: lane,
      QA_PR: String(p.number),
      QA_LANE_KEY_FILE: layout.laneKey,
      QA_GATE_URL: cfg.gateUrl,
      QA_CDP_PORT: String(port.cdp),
      QA_RESULTS: layout.results,
      NODE_OPTIONS: `--import=${layout.resolvePreload}`
    }
  })
  log({
    phase: 'P3',
    pr: p.number,
    lane,
    event: 'write end',
    status: outcome.status,
    usd: outcome.usd,
    minutes: Math.round((outcome.durationMs ?? 0) / 6000) / 10
  })
  if (outcome.status === 'timeout' || outcome.status === 'over-budget') {
    if (e) writeQueueEntry(cfg.qaHome, (await import('./lib/run-agent.mjs')).applyOutcome(e, lane, outcome))
  }
  // result.json, written by the lane
  const resultFile = join(layout.prTestDir, 'result.json')
  let result = null
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'))
      const errs = validate(SCHEMAS.result, result)
      if (errs.length) {
        log({ phase: 'P3', pr: p.number, lane, event: 'result.json invalid', errors: errs.slice(0, 3) })
        result = null
      }
    } catch {
      result = null
    }
  }
  // intake from a read-only snapshot
  const needles = [
    ...secretsFor(cfg),
    ...cookieValues([join(cfg.runDir, 'cookies.jsonl')]),
    readFileSync(layout.laneKey, 'utf8').trim()
  ]
  const snapshotDir = join(cfg.runDir, 'intake', lane, `pr-${p.number}`)
  let accepted = []
  try {
    if (existsSync(snapshotDir)) removeTree(snapshotDir)
    const r = intake({ staging: layout.prTestDir, snapshotDir, needles })
    accepted = r.accepted
    if (r.rejected.length)
      log({
        phase: 'P3',
        pr: p.number,
        lane,
        event: 'intake refused',
        files: r.rejected.map((x) => `${x.path}: ${x.reason}`)
      })
  } catch (err) {
    log({ phase: 'P3', pr: p.number, lane, event: 'intake failed', error: err.message })
  }
  const acceptedNames = new Set(accepted.map((a) => a.path))
  // Only tests that passed intake are rerun: drop the rest from the lane folder.
  const files = existsSync(layout.prTestDir)
    ? readdirSync(layout.prTestDir).filter((f) => f.endsWith('.test.mjs'))
    : []
  for (const f of files) if (!acceptedNames.has(f)) rmSync(join(layout.prTestDir, f), { force: true })
  const kept = files.filter((f) => acceptedNames.has(f))
  const before = new Map((result?.cases ?? []).map((c) => [c.caseId, c.before?.outcome]))
  e = readQueueEntry(cfg.qaHome, p.number)
  if (e && e.lanes[lane]?.state === 'planned') {
    e = advance(e, lane, 'written')
    writeQueueEntry(cfg.qaHome, e)
  }
  return {
    status: outcome.status,
    files: kept,
    testsDir: layout.prTestDir,
    before,
    snapshotDir: kept.length ? snapshotDir : null,
    accepted: kept.length > 0,
    libSha256: libDigest(libDir)
  }
}

/** P6 for one PR: one astra run over every red case of both lanes. */
async function verifyOne({ cfg, deps, runId, procsPath, agentsLog, p, list, lanes, log }) {
  const lane = 'verify'
  const layout = laneLayout({
    qaHome: cfg.qaHome,
    worktrees: cfg.worktrees,
    runId,
    lane,
    pr: String(p.number),
    cliBins: deps.cliBins ?? []
  })
  const libDir = join(layout.prDir, 'lib')
  mkdirSync(layout.prTestDir, { recursive: true })
  if (!existsSync(libDir)) installTestlib(libDir)
  const diffFile = join(layout.prDir, 'diff.patch')
  writeFileSync(diffFile, deps.prDiff(p) ?? '')
  const profile = renderProfile({
    lane,
    kind: 'cli',
    layout,
    outDir: join(cfg.runDir, 'profiles', `pr-${p.number}`)
  })
  const port = DEFAULT_PORTS.lanes[lane]
  const redCases = []
  for (const c of list)
    for (const l of lanes)
      if (c.lanes[l].status === 'red')
        redCases.push({
          id: c.id,
          quote: c.quote,
          expected: c.expected,
          lane: l,
          testFile: c.lanes[l].testPath,
          testText: c.lanes[l].testText,
          output: c.lanes[l].output
        })
  log({ phase: 'P6', pr: p.number, lane, event: 'verify start', cases: redCases.length })
  const outcome = await deps.runAgent({
    role: 'verify',
    lane,
    key: p.key,
    runId,
    procsPath,
    agentsLog,
    prompt: verifyPrompt({
      prKey: p.key,
      cases: redCases,
      diffFile,
      testDir: layout.prTestDir,
      origin: cfg.origin,
      gate: cfg.gateUrl,
      cdp: `http://127.0.0.1:${port.cdp}`,
      testlib: libDir,
      laneKeyFile: layout.laneKey
    }),
    cwd: layout.prTestDir,
    cliHome: join(layout.cliHome, `pr-${p.number}`),
    deadline: Date.now() + 10 * 60_000,
    codexAuthFile: join(cfg.qaHome, 'codex-auth', 'auth.json'),
    effort: 'high',
    proxy: `http://127.0.0.1:${port.proxy}`,
    sandboxProfile: profile.file,
    bins: deps.bins,
    extraEnv: {
      QA_LANE: lane,
      QA_PR: String(p.number),
      QA_LANE_KEY_FILE: layout.laneKey,
      QA_GATE_URL: cfg.gateUrl,
      QA_CDP_PORT: String(port.cdp),
      QA_RESULTS: layout.results,
      NODE_OPTIONS: `--import=${layout.resolvePreload}`
    }
  })
  const vf = join(layout.prTestDir, 'verdict.json')
  let verdict = null
  try {
    verdict = JSON.parse(readFileSync(vf, 'utf8'))
    const errs = validate(SCHEMAS.verdict, verdict)
    if (errs.length) {
      log({ phase: 'P6', pr: p.number, event: 'verdict.json invalid', errors: errs.slice(0, 3) })
      verdict = null
    }
  } catch {}
  log({
    phase: 'P6',
    pr: p.number,
    lane,
    event: 'verify end',
    status: outcome.status,
    verdicts: verdict?.cases?.length ?? 0
  })
  if (!verdict) return null
  return new Map(verdict.cases.map((c) => [c.caseId, c]))
}

// ---------------------------------------------------------------------------------------------
// CLI

async function main(argv) {
  let cfg
  try {
    cfg = parseArgs(argv)
  } catch (err) {
    console.error(`nightly: ${err.message}`)
    return 2
  }
  if (cfg.lock && !process.env.QA_NIGHTLY_LOCKED) {
    const lockFile = join(stateDir(cfg.qaHome), 'run.lock')
    mkdirSync(dirname(lockFile), { recursive: true })
    const args = argv.filter((a) => a !== '--lock')
    const [cmd, ...rest] = lockArgv(lockFile, [process.execPath, fileURLToPath(import.meta.url), ...args])
    const r = spawnSync(cmd, rest, { stdio: 'inherit', env: { ...process.env, QA_NIGHTLY_LOCKED: '1' } })
    if (r.status === LOCK_BUSY) console.error('nightly: another run holds the lock (75)')
    return r.status ?? 1
  }
  process.env.PATH = `${join(TOOL_DIR, 'scripts', 'qa', 'bin')}:${process.env.PATH}`
  const runId = cfg.resumeRunId ?? nextRunId(cfg.qaHome)
  const deps = defaultDeps({ ...cfg, runId, runDir: join(cfg.qaHome, 'r', runId) })
  const r = await runNight({ ...cfg, runId }, deps)
  console.log(
    JSON.stringify({
      runId: r.runId,
      report: r.reportFile,
      exitCode: r.exitCode,
      log: join(r.runDir, 'nightly.log')
    })
  )
  return r.exitCode
}

export { LOCKF }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err?.stack ?? String(err))
      process.exit(1)
    }
  )
}
