#!/usr/bin/env node
/**
 * A stand of its own for the site-own-domain line: starts a PostgreSQL that belongs to this run,
 * hands its address to ONE command, and removes everything it started when that command has ended —
 * however it ended.
 *
 *   node tests/regression/scripts/site-own-domain-stand.mjs --project <name> --artifacts <dir> -- <command…>
 *   node tests/regression/scripts/site-own-domain-stand.mjs --project <name> --artifacts <dir> --pilot -- <command…>
 *   node tests/regression/scripts/site-own-domain-stand.mjs --project <name> --artifacts <dir> \
 *        --compare-base <ref> --regression <case id>
 *
 * WHAT IT PROMISES, AND REFUSES RATHER THAN BREAKS:
 *
 *   - `TEST_DATABASE_URL` for the command is the instance this run started, and only that one. A
 *     `TEST_DATABASE_URL` already in the environment is never passed on.
 *   - The compose project must be one of this line's own (`tchdomain…`) and must have NOTHING yet —
 *     no container, volume or network. Something there already belongs to another run: this script
 *     neither joins nor removes it, and ends `CANNOT RUN` (exit 3).
 *   - No docker, an instance that does not come up, a dependency the tree lacks, a test that was
 *     skipped, a cleanup that left something behind: each ends non-zero. None of them is a pass.
 *   - Everything it writes goes under `--artifacts` (logs, the base tree of `--compare-base`,
 *     whatever the command writes through `TRACY_TEST_ARTIFACT_DIR`). Nothing is written in the
 *     checkout, and `TMPDIR` is left as it is.
 *   - It calls no model and reaches no service outside this machine.
 *
 * `--pilot` also tells the command where it may keep screenshots (`TRACY_PILOT_ARTIFACT_DIR`) and
 * that the DNS resolver and the tunnel provider it uses must be stand-ins it starts itself
 * (`TRACY_PILOT=1`): the pilot test refuses to run without it, so it can never reach a real zone.
 *
 * `--compare-base <ref>`: the case's own script (`run.cmd` of `tests/regression/cases/<id>.json`)
 * is run twice — on the sources of `git merge-base HEAD <ref>` with THIS tree's tests laid over
 * them, where it must be red by its own checks, and on this tree, where it must be green. "Red
 * because a file would not load" is not red: an import that fails on the base tree ends the
 * comparison as a failure of the comparison, not as proof.
 *
 * Exit codes: 0 passed · 1 failed · 2 usage · 3 this machine cannot run it (`CANNOT RUN: …`).
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const COMPOSE_FILE = join(ROOT, 'tests/regression/fixtures/site-own-domain/compose.yml')
const CANNOT_RUN = 3
/** The compose projects this line may create. Never a prefix another session's stand uses. */
const PROJECT = /^tchdomain[a-z0-9]{1,24}$/
const USAGE = `usage: site-own-domain-stand.mjs --project <tchdomain…> --artifacts <dir> [--pilot] -- <command…>
       site-own-domain-stand.mjs --project <tchdomain…> --artifacts <dir> --compare-base <ref> --regression <case id>`

class Stop extends Error {
  constructor(code, message) {
    super(message)
    this.exitCode = code
  }
}
const usage = (why) => new Stop(2, `${why}\n${USAGE}`)
const cannotRun = (why) => new Stop(CANNOT_RUN, `CANNOT RUN: ${why}`)

/** `{ project, artifacts, pilot, base, regression, command }` — or throws a usage `Stop`. */
export function parseArgs(argv) {
  const out = { project: null, artifacts: null, pilot: false, base: null, regression: null, command: [] }
  const split = argv.indexOf('--')
  const flags = split === -1 ? argv : argv.slice(0, split)
  out.command = split === -1 ? [] : argv.slice(split + 1)
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    const value = () => {
      const next = flags[++i]
      if (next === undefined || next === '' || next.startsWith('-')) throw usage(`${flag} needs a value`)
      return next
    }
    if (flag === '--project') out.project = value()
    else if (flag === '--artifacts') out.artifacts = value()
    else if (flag === '--pilot') out.pilot = true
    else if (flag === '--compare-base') out.base = value()
    else if (flag === '--regression') out.regression = value()
    else throw usage(`unknown argument: ${flag}`)
  }
  if (!out.project || !PROJECT.test(out.project))
    throw usage('--project must be a compose project of this line (tchdomain…)')
  if (!out.artifacts || !isAbsolute(out.artifacts)) throw usage('--artifacts must be an absolute path')
  const inside = relative(ROOT, out.artifacts)
  if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside)))
    throw usage('--artifacts must be outside the checkout: a check writes nothing inside it')
  const comparing = out.base !== null || out.regression !== null
  if (comparing && (out.base === null || out.regression === null))
    throw usage('--compare-base and --regression go together')
  if (comparing && (out.command.length > 0 || out.pilot))
    throw usage('--compare-base runs the case itself: no command, no --pilot')
  if (!comparing && out.command.length === 0) throw usage('no command after --')
  if (out.regression !== null && !/^REG-[A-Za-z0-9-]{1,120}$/.test(out.regression))
    throw usage('--regression must be a case id')
  return out
}

function sh(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...options })
  return {
    status: r.status,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    stdout: r.stdout ?? '',
    error: r.error
  }
}

/** What docker has under a compose project's label: `{ containers, volumes, networks }` of ids. */
function owned(project) {
  const label = `label=com.docker.compose.project=${project}`
  const list = (args) => {
    const r = sh('docker', args)
    if (r.status !== 0) throw cannotRun(`docker could not be asked (${args.slice(0, 2).join(' ')}): ${r.out}`)
    return r.stdout.split('\n').filter(Boolean)
  }
  return {
    containers: list(['ps', '-aq', '--filter', label]),
    volumes: list(['volume', 'ls', '-q', '--filter', label]),
    networks: list(['network', 'ls', '-q', '--filter', label])
  }
}
const count = (things) => things.containers.length + things.volumes.length + things.networks.length

/** Start the run's PostgreSQL; `{ url, down }`. Throws `CANNOT RUN` when it cannot be had. */
function startPostgres(project, log) {
  const version = sh('docker', ['version', '--format', '{{.Server.Version}}'])
  if (version.error || version.status !== 0)
    throw cannotRun(`docker is not available: ${version.error?.message ?? version.out}`)
  const before = owned(project)
  if (count(before) > 0)
    throw cannotRun(
      `compose project ${project} already has resources (${before.containers.length} container(s), ${before.volumes.length} volume(s), ${before.networks.length} network(s)) — they are another run's; this run neither uses nor removes them`
    )
  const password = randomBytes(18).toString('hex')
  const env = { ...process.env, STAND_POSTGRES_PASSWORD: password }
  const compose = (args) => sh('docker', ['compose', '-p', project, '-f', COMPOSE_FILE, ...args], { env })
  const down = () => {
    const r = compose(['down', '--volumes', '--remove-orphans', '--timeout', '5'])
    log(`[stand] down: exit ${r.status}${r.out ? `\n${r.out}` : ''}`)
    const left = owned(project)
    if (r.status !== 0 || count(left) > 0)
      throw new Stop(
        1,
        `cleanup of compose project ${project} left something behind: ${JSON.stringify(left)}`
      )
  }
  const up = compose(['up', '--detach', '--wait', '--quiet-pull'])
  log(`[stand] up: exit ${up.status}${up.out ? `\n${up.out}` : ''}`)
  if (up.status !== 0) {
    try {
      down()
    } catch (error) {
      log(`[stand] ${error.message}`)
    }
    throw cannotRun(
      `the PostgreSQL of ${project} did not come up: ${up.out.split('\n').slice(-3).join(' | ')}`
    )
  }
  const port = compose(['port', 'postgres', '5432'])
  const found = /:(\d+)\s*$/.exec(port.stdout.trim())
  if (port.status !== 0 || !found) {
    down()
    throw cannotRun(`the port of the PostgreSQL of ${project} could not be read: ${port.out}`)
  }
  return { url: `postgres://tracy:${password}@127.0.0.1:${found[1]}/tracy`, down }
}

/**
 * Run a command, its output going to this process and to `logFile`; resolves
 * `{ code, signal, output }`. Never rejects.
 */
function runLogged(command, { env, cwd = ROOT, logFile }) {
  return new Promise((done) => {
    let output = ''
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const take = (stream) => (chunk) => {
      const text = chunk.toString()
      output += text
      stream.write(text)
      appendFileSync(logFile, text)
    }
    child.stdout.on('data', take(process.stdout))
    child.stderr.on('data', take(process.stderr))
    child.on('error', (error) =>
      done({ code: null, signal: null, output: `${output}\n${error.message}`, error })
    )
    child.on('close', (code, signal) => done({ code, signal, output }))
  })
}

/** How many tests a `node --test` run says it skipped (spec or TAP summary), summed; 0 when none. */
export function skippedIn(output) {
  let skipped = 0
  for (const line of output.split('\n')) {
    const found = /^(?:ℹ|#) skipped (\d+)\s*$/.exec(line.trim())
    if (found) skipped += Number(found[1])
  }
  return skipped
}

/** Lines that say a file did not load, as against a test in it failing on what the code does. */
const NOT_LOADED =
  /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|does not provide an export named|SyntaxError:|test file not found|ERR_UNSUPPORTED_DIR_IMPORT/

/** The env a wrapped command gets: this process's, with the run's own database and artifact dir. */
function commandEnv(url, artifacts, extra = {}) {
  const env = { ...process.env, ...extra }
  // Only ever the instance this run started.
  env.TEST_DATABASE_URL = url
  env.TRACY_TEST_ARTIFACT_DIR = artifacts
  // Set by a surrounding `node --test`, it makes a child `node --test` report to its parent.
  delete env.NODE_TEST_CONTEXT
  return env
}

/**
 * The sources of `base` with this tree's tests over them, under `dir` — only the folders the case's
 * suites read, and no dependency tree: each `node_modules` is a link to this checkout's own.
 */
function baseTree(base, dir, log) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const AREAS = [
    'apps/tracy-host',
    'apps/tracy-web',
    'packages/core/tracy-core',
    'packages/site/tracy-my-sites',
    'packages/site/tracy-site-tabs',
    'packages/fleet/tracy-fleet-operation/scripts',
    'packages/fleet/tracy-fleet-operation/test',
    'packages/ui/tracy-ui',
    'tests/regression',
    'scripts',
    'package.json'
  ]
  const present = AREAS.filter((area) => sh('git', ['cat-file', '-e', `${base}:${area}`]).status === 0)
  const archive = spawnSync(
    'bash',
    ['-c', 'set -o pipefail; git archive "$1" -- "${@:3}" | tar -x -C "$2"', '_', base, dir, ...present],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  )
  if (archive.status !== 0) throw cannotRun(`the sources of ${base} could not be laid out: ${archive.stderr}`)
  // This tree's tests and regression scripts over the base sources: the same assertions, old code.
  const changed = sh('git', ['diff', '--name-only', '--diff-filter=AM', base, '--'])
  const untracked = sh('git', ['ls-files', '--others', '--exclude-standard'])
  if (changed.status !== 0 || untracked.status !== 0)
    throw cannotRun('git could not list what this tree changed')
  const isTest = (file) =>
    /(^|\/)test\/.*\.(mjs|js|json|sh|py|txt|html)$/.test(file) ||
    file.startsWith('tests/regression/scripts/') ||
    file.startsWith('tests/regression/cases/') ||
    file.startsWith('tests/regression/fixtures/')
  const laid = []
  for (const file of new Set([...changed.stdout.split('\n'), ...untracked.stdout.split('\n')])) {
    if (!file || !isTest(file) || !existsSync(join(ROOT, file))) continue
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    cpSync(join(ROOT, file), join(dir, file))
    laid.push(file)
  }
  log(
    `[stand] base ${base}: ${present.length} area(s), ${laid.length} test file(s) of this tree laid over them`
  )
  // Dependencies: links to this checkout's, never a copy. A package this tree has no install for
  // is a missing dependency, said as such.
  const link = (at) => {
    const from = join(ROOT, at, 'node_modules')
    if (!existsSync(from)) return false
    const to = join(dir, at, 'node_modules')
    if (existsSync(dirname(to)) && !existsSync(to)) symlinkSync(from, to, 'dir')
    return true
  }
  if (!link('.')) throw cannotRun('this checkout has no node_modules: run `pnpm install` first')
  for (const area of present) if (lstatSync(join(dir, area)).isDirectory()) link(area)
  for (const area of ['packages/fleet/tracy-fleet-operation']) link(area)
  return { laid }
}

async function compare({ project, artifacts, base: ref, regression }, log) {
  const merge = sh('git', ['merge-base', 'HEAD', ref])
  if (merge.status !== 0 || !/^[0-9a-f]{40}$/.test(merge.stdout.trim()))
    throw cannotRun(`no merge base of HEAD and ${ref}: ${merge.out}`)
  const base = merge.stdout.trim()
  const casePath = join(ROOT, 'tests/regression/cases', `${regression}.json`)
  if (!existsSync(casePath)) throw new Stop(1, `no such case: tests/regression/cases/${regression}.json`)
  const spec = JSON.parse(readFileSync(casePath, 'utf8'))
  const cmd = spec?.run?.cmd
  if (!Array.isArray(cmd) || cmd.length === 0 || !cmd.every((part) => typeof part === 'string'))
    throw new Stop(1, `case ${regression} has no run block to run`)
  const treeDir = join(artifacts, 'regression-base-tree')
  const tree = baseTree(base, treeDir, log)
  const db = startPostgres(project, log)
  let verdict
  try {
    const runCase = (name, cwd, extra) =>
      runLogged(cmd, {
        cwd,
        env: commandEnv(db.url, artifacts, extra),
        logFile: join(artifacts, `regression-${name}.log`)
      })
    log(`[stand] ── the case on the merge base ${base.slice(0, 9)} (must be red by its own checks)`)
    // The base tree has this checkout's dependencies by link; the suites that bundle a screen
    // (esbuild, jsdom) are told where the install is — the SOURCES they bundle are the base's.
    const before = await runCase('base', treeDir, { REPO_ROOT: treeDir, TRACY_TEST_DEPS_ROOT: ROOT })
    log(`[stand] ── the case on this tree (must be green)`)
    const after = await runCase('branch', ROOT, {})
    const failedChecks = before.output.split('\n').filter((line) => line.startsWith('not ok - '))
    const notLoaded = before.output.split('\n').filter((line) => NOT_LOADED.test(line))
    const problems = []
    if (before.code === CANNOT_RUN || after.code === CANNOT_RUN)
      throw cannotRun(
        'the case said this machine cannot run it (see regression-base.log / regression-branch.log)'
      )
    if (before.code !== 1) problems.push(`on the merge base the case exited ${before.code}, not 1`)
    if (failedChecks.length === 0) problems.push('on the merge base no check of the case failed')
    if (notLoaded.length > 0)
      problems.push(
        `on the merge base a file did not load — red for want of an import, not by behaviour: ${notLoaded[0].trim().slice(0, 200)}`
      )
    if (after.code !== 0) problems.push(`on this tree the case exited ${after.code}`)
    if (skippedIn(after.output) > 0) problems.push('on this tree tests were skipped')
    verdict = {
      id: regression,
      verdict: problems.length === 0 ? 'PASS' : 'FAIL',
      base,
      head: sh('git', ['rev-parse', 'HEAD']).stdout.trim(),
      ranAt: new Date().toISOString(),
      baseExit: before.code,
      baseFailedChecks: failedChecks.length,
      branchExit: after.code,
      testsLaidOverBase: tree.laid.length,
      problems
    }
    writeFileSync(join(artifacts, 'regression-compare.json'), `${JSON.stringify(verdict, null, 2)}\n`)
    log(`[stand] ${verdict.verdict}: base red by ${failedChecks.length} check(s), branch exit ${after.code}`)
    for (const problem of problems) log(`[stand] !! ${problem}`)
  } finally {
    db.down()
    // The base tree holds links into this checkout's node_modules: removed, never followed.
    rmSync(treeDir, { recursive: true, force: true })
  }
  return verdict.verdict === 'PASS' ? 0 : 1
}

async function wrap({ project, artifacts, pilot, command }, log) {
  const name = pilot ? 'pilot' : 'command'
  const db = startPostgres(project, log)
  let code = 1
  try {
    const shots = join(artifacts, 'pilot')
    if (pilot) mkdirSync(shots, { recursive: true })
    const result = await runLogged(command, {
      env: commandEnv(db.url, artifacts, pilot ? { TRACY_PILOT: '1', TRACY_PILOT_ARTIFACT_DIR: shots } : {}),
      logFile: join(artifacts, `stand-${project}-${name}.log`)
    })
    if (result.error) throw cannotRun(`the command could not be started: ${result.error.message}`)
    const skipped = skippedIn(result.output)
    if (result.signal) log(`[stand] !! the command was ended by ${result.signal}`)
    if (skipped > 0)
      log(`[stand] !! ${skipped} test(s) were skipped: a skipped test proves nothing — not a pass`)
    code = result.code === 0 && !result.signal && skipped === 0 ? 0 : result.code || 1
  } finally {
    db.down()
  }
  return code
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  mkdirSync(args.artifacts, { recursive: true })
  const logFile = join(args.artifacts, `stand-${args.project}.log`)
  const log = (line) => {
    process.stderr.write(`${line}\n`)
    appendFileSync(logFile, `${line}\n`)
  }
  // A signal still ends through `finally`: the stand is taken down before this process goes.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, () => {
      log(`[stand] ${signal}: the run was stopped`)
      process.exitCode = 1
    })
  return args.base !== null ? compare(args, log) : wrap(args, log)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Stop ? error.message : (error?.stack ?? error)}\n`)
      process.exit(error instanceof Stop ? error.exitCode : 1)
    }
  )
}
// Named for the tests of this script.
export { NOT_LOADED, readdirSync as _readdirSync }
