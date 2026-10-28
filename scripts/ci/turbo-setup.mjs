/**
 * One Turbo task per test owner, with `inputs` measured from what its suite reads (12/10/2026).
 *
 * WHAT IT WRITES. Every directory that owns workers test files (`check-tests.ts` `workersFiles()`,
 * the same list the coverage check counts) becomes Turbo tasks:
 *   - a workspace package (`apps/<app>`, `packages/<group>/<name>`) gets the script `test:ci` (or
 *     `test:ci:1` … `test:ci:n` when SHARDS splits it) in its package.json and a `turbo.json`;
 *   - an owner that is not a workspace package (`scripts`, the two quickstart trees) becomes a root
 *     task `//#test:ci:<name>` with a script in the root package.json;
 *   - the interop suite and the dsh-passwords fork become root tasks `test:ci:interop` and
 *     `test:ci:vendor`, run by `check-tests.ts` exactly as the full run does.
 * Every script runs `check-tests.ts --part owner=<dir>[:i/n]`, so the database, the skip list, the
 * flags and the reporters are the full run's.
 *
 * HOW A TASK IS MEASURED. The task's own `node --test` command — the argv `check-tests.ts` builds,
 * taken from its exports, never a second spelling — runs under `trace-reads.mjs`. The wrapper is NOT
 * traced: it walks the whole repository to count test files, and every task would "read" everything;
 * what the wrapper itself runs on is `MACHINERY`. Each task is traced on its own (the three
 * tracy-web shards, the interop suite and the fork's build + two test commands included); the
 * shards of one owner are then given the union of what they read, so a refreshed timing table that
 * moves a file to another shard does not leave that shard without an input.
 *
 * 🔒 A MEASUREMENT THAT CANNOT BE TRUSTED WRITES NOTHING AND PASSES NOTHING. A command that does not
 * start, exits non-zero, outlives its time limit, leaves no trace, or leaves a trace without the test
 * files it was given is a failure of the whole run: a red or skipped test read less than a green one.
 * (A red test FILE gets two more runs on its own first — `runTraced` — so one test losing a race on a
 * busy machine does not void forty minutes of measuring.) Hence the database too — the suites that
 * need PostgreSQL skip themselves without it.
 *
 * CACHEABLE TASKS. --check --task-part runs exactly one suite under the tracer and audits its
 * reads before exiting successfully. No retries: a red test remains red and is never cached.
 * --check --structure-only checks configuration and ignored inputs, without running suites;
 * CI uses it only when the planner selected these audited Turbo tasks (cache hits included).
 * Release, nightly and fallback checks retain the full measurement.
 *
 * THE DATABASE SKIP IS PART OF THE HASH (16/10/2026). A routine pull request into `develop` runs the
 * workers tests without the files that need a database (`TRACY_TESTS_SKIP_DB=1`, `check-tests.ts`).
 * Turbo would otherwise serve that run's green to a run that must test those files, and the other way
 * round, because the files are the same and only the environment differs. So every owner task that
 * holds such a file lists `TRACY_TESTS_SKIP_DB` in its `env` (generated here, judged by `--check`:
 * `configProblems`). The owners without one are untouched, so labelling a pull request
 * `ci:integration` re-runs only the tasks that can change. Generation traces every file and refuses to
 * run with the skip on; `--check` with it on traces the files the task runs, which leaves the
 * database files unmeasured until a run without the skip (the nightly, a release pull request).
 *
 * MODES.
 *   node --import tsx scripts/ci/turbo-setup.mjs            trace every task, write every file,
 *                                                           then check as below
 *   node --import tsx scripts/ci/turbo-setup.mjs --check    the `turbo-config` gate; writes nothing:
 *     1. structure — every owner has its tasks, scripts and turbo.json, and nothing else has;
 *     2. coverage  — trace every task NOW and ask Turbo (a dry run) which files each task hashes:
 *                    a path a suite read that its hash does not cover is red;
 *     3. ignored   — a file git ignores among a task's hashed files is red: the plan job hashes a
 *                    checkout that has no build output, so its hash would differ from the rows'.
 * `--check --changed-since <ref>` (what the gate runs on a pull request, `HEAD^1` = the base tip of
 * the merge commit) measures only the tasks whose inputs the diff touches; steps 1 and 3 still cover
 * every task. WHY THAT IS ENOUGH: a suite starts reading a new path only when something it runs or
 * reads changes, and everything it runs or reads is among its inputs — that is what step 2 proved
 * when those inputs last changed, on the pull request that changed them. A task whose inputs this
 * diff leaves alone therefore reads what it read on the base, where it was covered. Any change to a
 * file at the repository root (package.json, lockfile, the root turbo.json) or to the measuring code
 * itself measures every task; so does a diff git cannot produce. The nightly and every run outside
 * a pull request measure every task, which also catches two pull requests that were each covered
 * alone and are not once both are merged.
 * `--accept-red <task id>` (generation only, repeatable): use the trace of a task whose suite is red
 * on THIS machine and say so. It exists because the dsh-passwords suite cannot be green on macOS
 * (it binds 127.0.0.2 and deletes under the system's temporary directory; 22 tests fail there with or without the
 * tracer), and a generator no Mac can finish is a generator nobody runs. The gate never takes it:
 * on the runners, where that suite is green, `--check` is what judges the inputs written this way.
 * Options for both: `--database owned` (this run's own PostgreSQL container, as in `check-tests.ts`;
 * default: TEST_DATABASE_URL, then the dev cluster, then a container) and `--artifacts <dir>` (keep
 * each task's log and trace there, plus `turbo-coverage.json`; default: a temporary directory that
 * is removed).
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDatabaseGated, SKIP_DB_ENV } from './related-tests.mjs'
import { classifyReads, covers, DSH, inputsFor, rootGlobs } from './turbo-inputs.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const TRACER = path.join(ROOT, 'scripts/ci/trace-reads.mjs')

/** Owners split into several tasks, so no single runner carries them alone (seconds, serial, 12/10). */
export const SHARDS = { 'apps/tracy-web': 3 }

/**
 * Files `check-tests.ts` itself runs on (itself and everything it imports); every test task depends
 * on them. `ci-turbo-setup.test.mjs` pins the list against the wrapper's imports.
 */
export const MACHINERY = [
  '$TURBO_ROOT$/scripts/check-tests.ts',
  '$TURBO_ROOT$/scripts/test-timing-reporter.mjs',
  '$TURBO_ROOT$/scripts/test-database.ts',
  '$TURBO_ROOT$/scripts/ci/related-tests.mjs'
]

/**
 * Every path git ignores that a suite may read, by name — the ONLY ignored paths a suite may read.
 * A file git ignores cannot be hashed the same by the plan job (a bare checkout) and by a row, so:
 *   - every entry is kept out of every hash (`EXCLUDE`): a written glob (`$TURBO_ROOT$/vendor/x/**`)
 *     does not honour .gitignore the way `$TURBO_DEFAULT$` does, and with
 *     `dsh-passwords/dist/client.js` in the hash the plan's hash of `//#test:ci:scripts` and
 *     `//#test:ci:vendor` never equalled the rows' (12/10/2026);
 *   - a generated file (`file: true`) or directory names the `sources` it is built from — files that
 *     exist in git; a directory ends with `/`. A task that reads the output gets those sources as
 *     inputs, and the gate is red when one of them is not;
 *   - `localOnly: true` is a file or directory only a developer's machine may have (a secrets file,
 *     a data directory the code looks in first). Every path of it must be ABSENT when the suite is
 *     measured, so the result did not depend on it; one that exists is red.
 * There is no rule by kind of directory: a `__pycache__` or anything else is here by its own path or
 * it is not approved. An ignored read that no entry names is red in `--check` (step 2), and an
 * ignored file among a task's hashed files is red (step 3). NOT every `dist/` or `lib/` belongs
 * here: many are committed (RULE #3) and are hashed like any source. `ci-turbo-setup.test.mjs`
 * refuses an entry git does not ignore or a source git does not track, and `ci-turbo-hashes.test.mjs`
 * hashes a tree with and without each entry.
 */
export const GENERATED = [
  {
    // `scripts/build.mjs` of the seeder: its own bundle plus data copied from five other trees.
    path: 'packages/cms/tracy-seeder/dist',
    sources: [
      'packages/cms/tracy-seeder/package.json',
      'packages/cms/tracy-seeder/scripts/build.mjs',
      'packages/cms/tracy-cms-sections/regions.json',
      'packages/cms/tracy-joomla-quickstart/contracts/',
      'packages/cms/tracy-wordpress-quickstart/contracts/',
      'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json',
      'vendor/tracy/od-design-system/catalog.json'
    ]
  },
  {
    path: 'vendor/tracy/dsh-better-sidebar/lib',
    sources: ['vendor/tracy/dsh-better-sidebar/package.json', 'vendor/tracy/dsh-better-sidebar/src/']
  },
  {
    // `tsc` + `scripts/build-client.mjs`, run by the vendor part of `check-tests.ts` itself.
    path: 'vendor/tracy/dsh-passwords/dist',
    sources: [
      'vendor/tracy/dsh-passwords/package.json',
      'vendor/tracy/dsh-passwords/tsconfig.json',
      'vendor/tracy/dsh-passwords/scripts/build-client.mjs',
      'vendor/tracy/dsh-passwords/src/'
    ]
  },
  // `apps/tracy-docs/scripts/generate.mjs` writes these three from the API reference tables.
  {
    path: 'apps/tracy-docs/src/content/docs/changelog.md',
    file: true,
    sources: ['apps/tracy-docs/scripts/generate.mjs', 'docs/references/api-changelog.md']
  },
  {
    path: 'apps/tracy-docs/src/content/docs/reference/compatibility.md',
    file: true,
    sources: ['apps/tracy-docs/scripts/generate.mjs', 'apps/tracy-web/src/api-reference/actions.js']
  },
  {
    path: 'apps/tracy-docs/src/content/docs/reference/errors.md',
    file: true,
    sources: ['apps/tracy-docs/scripts/generate.mjs', 'apps/tracy-web/src/api-reference/errors.js']
  },
  // Python's bytecode beside the scripts a suite starts: made from the `.py` files of that directory,
  // so the directory's own entries are its sources.
  {
    path: 'packages/fleet/tracy-fleet-operation/scripts/lib/__pycache__',
    sources: ['packages/fleet/tracy-fleet-operation/scripts/lib/']
  },
  {
    path: 'packages/fleet/tracy-fleet-operation/scripts/provision/__pycache__',
    sources: ['packages/fleet/tracy-fleet-operation/scripts/provision/']
  },
  {
    path: 'packages/fleet/tracy-fleet-operation/scripts/webroot/__pycache__',
    sources: ['packages/fleet/tracy-fleet-operation/scripts/webroot/']
  },
  // The fork loads a `.env` beside its package.json when a developer has put one there.
  { path: 'vendor/tracy/dsh-passwords/.env', file: true, localOnly: true },
  // The seeder run from source looks for its data in `src/data` before `dist/data`
  // (`src/cli.mjs`: "beside the bundle"); nothing writes `src/data`. Found 13/10/2026 on the first
  // Linux run of the gate: with no `dist/data` built, the seeder suite probed six contract and
  // translation files under it. Declared so that any of it EXISTING when measured is red.
  { path: 'packages/cms/tracy-seeder/src/data', localOnly: true }
]

/** The glob that keeps one declared entry out of a hash: the file itself, or all of the directory. */
export const excludeGlob = (g) => `!$TURBO_ROOT$/${g.path}${g.file ? '' : '/**'}`

/**
 * Never inputs, though the trees above contain them. Measured 12/10/2026: every run rewrote
 * `apps/tracy-web/.turbo/turbo-test:ci:1.log`, which changed the hash of the ten tasks that read
 * tracy-web, so the second run served 14 of 47 tasks from the cache instead of all of them. These
 * five patterns only keep files OUT of a hash; they approve no read (see `GENERATED`).
 */
export const EXCLUDE = [
  '!$TURBO_ROOT$/**/.turbo/**',
  '!$TURBO_ROOT$/**/node_modules/**',
  '!$TURBO_ROOT$/**/__pycache__/**',
  '!$TURBO_ROOT$/**/.DS_Store',
  // The logs of the regression runner (`tests/regression/run.mjs`), ignored by git: found in the hash
  // of the two tasks that took `tests/regression/**`, on the first tree where the runner had run.
  '!$TURBO_ROOT$/tests/regression/.runs/**',
  ...GENERATED.map(excludeGlob)
]

/** A shard's files are chosen by measured weight, so the table decides what each shard tests. */
const SHARD_TABLE = '$TURBO_ROOT$/scripts/test-timings.json'

/** The interop suite and the vendored fork's suite: run by their own `check-tests.ts` parts. */
export const EXTRA_ROOT_TASKS = [
  { task: 'test:ci:interop', part: 'interop', owner: 'scripts' },
  { task: 'test:ci:vendor', part: 'vendor', owner: 'vendor/tracy/dsh-passwords' }
]

/** One command may run this long under the tracer before the whole measurement is refused. */
const TRACE_TIMEOUT_MS = 40 * 60 * 1000

/**
 * Tasks traced at once. Two, as a Turbo row runs (`--concurrency=2`): with three, the tracy-web
 * shards shared one PostgreSQL on a busy machine and twelve tests ran into their 120 s limit
 * (12/10/2026). TRACY_TURBO_TRACE_JOBS overrides it (1 on a slow machine).
 */
function traceJobs() {
  const asked = Number(process.env.TRACY_TURBO_TRACE_JOBS ?? '')
  return Number.isInteger(asked) && asked >= 1 && asked <= 8 ? asked : 2
}

const workspacePackage = (owner) =>
  /^(?:apps\/[^/]+|packages\/[^/]+\/[^/]+)$/.test(owner) && existsSync(path.join(ROOT, owner, 'package.json'))

/** The directory owning a workers file: a workspace package or `scripts`. */
const OWNER = /^(apps\/[^/]+|packages\/[^/]+\/[^/]+|scripts)\//

/** The task name of a root owner: `scripts` → `test:ci:scripts`, a quickstart tree → its short name. */
const rootTaskName = (owner) => `test:ci:${path.basename(owner).replace(/^tracy-/, '')}`

/**
 * The tasks for every owner, without inputs.
 * @param {readonly string[]} files - every workers file.
 * @returns {{ owner: string, root: boolean, tasks: { name: string, part: string, shard?: { index: number, of: number } }[] }[]}
 */
export function plannedOwners(files) {
  const owners = [...new Set(files.map((f) => OWNER.exec(f)?.[1]))]
  if (owners.includes(undefined)) {
    const stray = files.find((f) => !OWNER.test(f))
    throw new Error(`a workers file belongs to no owner Turbo can run: ${stray}`)
  }
  return owners.sort().map((owner) => {
    const root = !workspacePackage(owner)
    const n = SHARDS[owner] ?? 1
    const base = root ? rootTaskName(owner) : 'test:ci'
    const tasks =
      n === 1
        ? [{ name: base, part: `owner=${owner}` }]
        : Array.from({ length: n }, (_, i) => ({
            name: `${base}:${String(i + 1)}`,
            part: `owner=${owner}:${String(i + 1)}/${String(n)}`,
            shard: { index: i + 1, of: n }
          }))
    return { owner, root, tasks }
  })
}

/** The command a task runs, from its own directory. */
export function command(owner, root, part) {
  const up = root ? '' : `${path.relative(path.join(ROOT, owner), ROOT)}/`
  return `node --import tsx ${up}scripts/ci/turbo-setup.mjs --check --task-part ${part}`
}

/** Writes JSON the way the file already was: two spaces, newline, `\uXXXX` kept where it was used. */
function writeJson(file, value, original = '') {
  let text = `${JSON.stringify(value, null, 2)}\n`
  if (/\\u[0-9a-fA-F]{4}/.test(original))
    text = text.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  writeFileSync(file, text)
}

/** The traced commands still running; whatever ends this process takes their process groups along. */
const running = new Set()
function stopGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}
process.on('exit', () => {
  for (const child of running) stopGroup(child)
})

/** A red test file is run again this many times in all before its task is refused. */
const ATTEMPTS = 3

/** The test files `node --test` (spec reporter) names as failed: `test at <file>:<line>:<column>`. */
export function failedTestFiles(output, files) {
  const named = new Set(
    [...output.matchAll(/^test at (.+?):\d+:\d+$/gm)].map((m) => m[1].replaceAll(path.sep, '/'))
  )
  return files.filter((f) => named.has(f))
}

/**
 * Runs commands one after another under the tracer and returns the paths they read.
 *
 * A command that carries `files` and `again` (a `node --test` run) and exits non-zero is given two
 * more goes at the files that failed, and only those: the measurement wants a green run of every
 * file, not a verdict on the tests — a test that loses a race on a busy machine is the test rows'
 * to report. Everything the red attempts read stays in the trace.
 *
 * @param {object} input
 * @param {{ bin: string, args: string[], cwd: string, files?: string[], again?: (files: string[]) => string[] }[]} input.commands
 * @param {string} input.reads - file the tracer appends to (emptied first).
 * @param {string} input.log - file that receives every command's stdout and stderr (no pipe to fill).
 * @param {readonly string[]} [input.expect] - repo-relative paths a whole trace must contain (the
 *   test files that were run).
 * @param {number} [input.timeoutMs] - per command.
 * @param {NodeJS.ProcessEnv} [input.env]
 * @param {boolean} [input.retryFailures] - audit-only retries; false for a cacheable test verdict.
 * @param {boolean} [input.acceptRed] - keep going past a command that exits non-zero and report it
 *   in `red` (`--accept-red`, generation only). A command that cannot start or is stopped at its
 *   time limit is still a refusal.
 * @returns {Promise<{ ok: true, reads: string[], red: string[] } | { ok: false, why: string }>}
 */
export async function runTraced({
  commands,
  reads,
  log,
  expect = [],
  timeoutMs = TRACE_TIMEOUT_MS,
  env = process.env,
  acceptRed = false,
  retryFailures = true
}) {
  rmSync(reads, { force: true })
  const red = []
  const fd = openSync(log, 'w')
  const once = (c, args) =>
    new Promise((resolve) => {
      let child
      try {
        child = spawn(c.bin, args, {
          cwd: c.cwd,
          // Its own process group, so a stop reaches the test processes it started too.
          detached: true,
          stdio: ['ignore', fd, fd],
          env: {
            ...env,
            TRACY_TRACE_READS_OUT: reads,
            NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(TRACER).href}`.trim()
          }
        })
      } catch (error) {
        resolve(`could not start (${String(error?.message ?? error)})`)
        return
      }
      let late = false
      running.add(child)
      const timer = setTimeout(() => {
        late = true
        stopGroup(child)
      }, timeoutMs)
      child.on('error', (error) => {
        clearTimeout(timer)
        running.delete(child)
        resolve(`could not start (${String(error?.message ?? error)})`)
      })
      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        running.delete(child)
        if (late) resolve(`ran past ${String(Math.round(timeoutMs / 1000))} s and was stopped`)
        else if (code !== 0) resolve(`exited ${code === null ? String(signal) : String(code)}`)
        else resolve(null)
      })
    })
  try {
    for (const c of commands) {
      const shown = `${path.basename(c.bin)} ${c.args.slice(0, 6).join(' ')}${c.args.length > 6 ? ' …' : ''}`
      let args = c.args
      let outcome = null
      for (let attempt = 1; attempt <= (retryFailures ? ATTEMPTS : 1); attempt++) {
        const from = statSync(log).size
        outcome = await once(c, args)
        if (outcome === null || !outcome.startsWith('exited') || !c.again || !c.files) break
        const red = failedTestFiles(readFileSync(log, 'utf8').slice(from), c.files)
        // A failure no test file is named for (a crash, a reporter error) is not a flaky test.
        if (!retryFailures || red.length === 0 || attempt === ATTEMPTS) break
        writeSync(
          fd,
          `\nturbo-setup: attempt ${String(attempt)} had ${String(red.length)} red test file(s); running them again: ${red.join(' ')}\n`
        )
        args = c.again(red)
      }
      if (outcome !== null && acceptRed && outcome.startsWith('exited')) red.push(`\`${shown}\` ${outcome}`)
      else if (outcome !== null) return { ok: false, why: `\`${shown}\` ${outcome}` }
    }
  } finally {
    closeSync(fd)
  }
  let lines
  try {
    lines = [...new Set(readFileSync(reads, 'utf8').split('\n').filter(Boolean))]
  } catch {
    return { ok: false, why: 'left no trace (the tracer did not load)' }
  }
  if (lines.length === 0) return { ok: false, why: 'left an empty trace' }
  const have = new Set(lines)
  const lost = expect.filter((f) => !have.has(f))
  if (lost.length)
    return {
      ok: false,
      why: `left a trace without ${String(lost.length)} of the ${String(expect.length)} test files it ran (first: ${lost[0]})`
    }
  return { ok: true, reads: lines, red }
}

/** Run `jobs` with at most `n` at once. */
async function pool(jobs, n) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < jobs.length) {
        const i = next++
        results[i] = await jobs[i]()
      }
    })
  )
  return results
}

const isDir = (rel) => {
  try {
    return statSync(path.join(ROOT, rel)).isDirectory()
  } catch {
    return false
  }
}
const kind = (rel) => {
  try {
    return statSync(path.join(ROOT, rel)).isDirectory() ? 'dir' : 'file'
  } catch {
    return 'absent'
  }
}

/** Which of these repo-relative paths git ignores (one `git check-ignore` for all of them). */
function gitIgnored(paths) {
  // Not the submodule's own files: git refuses a path inside a submodule outright, and they are
  // accounted for by TRACY_DSH_COMMIT before the question of ignoring comes up.
  const list = [...new Set(paths)].filter((p) => p && p !== DSH && !p.startsWith(`${DSH}/`))
  if (list.length === 0) return new Set()
  const run = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: ROOT,
    input: list.join('\0'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
  // 0 = some are ignored, 1 = none is; anything else is git failing, which must not read as "none".
  if (run.status !== 0 && run.status !== 1)
    throw new Error(`git check-ignore failed: ${String(run.stderr || run.error)}`)
  return new Set(run.stdout.split('\0').filter(Boolean))
}

/** Does this repo-relative workers file read the database variable (the skip would leave it out)? */
const gatedFile = (rel) => isDatabaseGated(readFileSync(path.join(ROOT, rel), 'utf8'))

const packageName = (owner) => JSON.parse(readFileSync(path.join(ROOT, owner, 'package.json'), 'utf8')).name

/**
 * Every Turbo test task with the commands its suite runs (the wrapper's own argv, without the
 * wrapper). `group` joins the tasks that share one set of inputs: the shards of one owner.
 */
async function tracedTasks(part = null) {
  const tests = await import('../check-tests.ts')
  const files = tests.workersFiles()
  const node = process.execPath
  const tasks = []
  for (const o of plannedOwners(files)) {
    for (const t of o.tasks) {
      if (part !== null && t.part !== part) continue
      const { run: mine, dropped } = tests.ownerTaskSplit(files, o.owner, t.shard)
      if (mine.length === 0)
        throw new Error(
          `task ${t.name} of ${o.owner} has no test file to run` +
            (dropped.length > 0
              ? ` (its ${String(dropped.length)} file(s) all read the database and ${SKIP_DB_ENV} leaves them out)`
              : '')
        )
      tasks.push({
        workers: true,
        id: `${o.root ? '//' : packageName(o.owner)}#${t.name}`,
        name: t.name,
        part: t.part,
        owner: o.owner,
        directory: o.root ? '' : o.owner,
        group: o.owner,
        commands: [
          {
            bin: node,
            args: tests.workersShardArgs(mine),
            cwd: ROOT,
            files: mine,
            again: (red) => tests.workersShardArgs(red)
          }
        ],
        expect: mine
      })
    }
  }
  for (const extra of EXTRA_ROOT_TASKS) {
    if (part !== null && extra.part !== part) continue
    const base = {
      id: `//#${extra.task}`,
      name: extra.task,
      part: extra.part,
      owner: extra.owner,
      directory: ''
    }
    if (extra.part === 'interop') {
      const mine = tests.interopFiles()
      if (mine.length === 0) throw new Error('the interop suite has no test file to run')
      tasks.push({
        ...base,
        group: 'interop',
        commands: [
          {
            bin: node,
            args: tests.interopArgs(mine),
            cwd: ROOT,
            files: mine,
            again: (red) => tests.interopArgs(red)
          }
        ],
        expect: mine
      })
    } else {
      tests.ensureDeps()
      const plan = tests.vendorPlan()
      if ('error' in plan) throw new Error(plan.error)
      tasks.push({
        ...base,
        group: 'vendor',
        commands: [
          ...plan.build.map((step) => ({
            bin: step.bin === 'node' ? node : path.join(plan.cwd, 'node_modules', '.bin', step.bin),
            args: step.args,
            cwd: plan.cwd
          })),
          ...plan.runs.map((run) => ({ bin: node, args: tests.vendorArgs(run), cwd: plan.cwd }))
        ],
        expect: []
      })
    }
  }
  return { tests, tasks }
}

/**
 * Traces every task. Returns the reads per task id, or the failures.
 * @returns {Promise<{ tasks: any[], reads: Map<string, string[]>, failures: string[] }>}
 */
async function traceAll(options) {
  const { tests, tasks: all } = await tracedTasks(options.taskPart ?? null)
  const chosen = options.select ? options.select(all) : null
  const tasks = chosen ? all.filter((t) => chosen.has(t.id)) : all
  const failures = []
  const accepted = []
  const reads = new Map()
  const unknown = (options.acceptRed ?? []).filter((id) => !all.some((t) => t.id === id))
  if (unknown.length) throw new Error(`--accept-red names no current task: ${unknown.join(' ')}`)
  if (tasks.length === 0) return { all, tasks, reads, failures, accepted }
  // 🔒 BEFORE ANY SUITE RUNS, as in `check-tests.ts`: a suite without its database or its browser
  // skips itself, exits 0 and reads nothing.
  // A run that skips the database files has none left to need one (interop and the fork's suite never
  // did), so it provisions nothing.
  if (!tests.databaseSkipOn()) tests.ensureDatabase(options.database)
  tests.ensureWorkersBrowser()
  const dir = path.join(options.artifacts, 'turbo-trace')
  mkdirSync(dir, { recursive: true })
  console.log(`turbo-setup: tracing ${String(tasks.length)} of ${String(all.length)} tasks`)
  await pool(
    tasks.map((t) => async () => {
      const slug = t.id.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
      const t0 = Date.now()
      const result = await runTraced({
        commands: t.commands,
        reads: path.join(dir, `${slug}.reads.txt`),
        log: path.join(dir, `${slug}.log`),
        expect: t.expect,
        acceptRed: options.acceptRed?.includes(t.id) ?? false,
        retryFailures: options.taskPart == null
      })
      if (options.taskPart != null) process.stdout.write(readFileSync(path.join(dir, `${slug}.log`), 'utf8'))
      const seconds = String(Math.round((Date.now() - t0) / 1000))
      if (result.ok) {
        reads.set(t.id, result.reads)
        console.log(`  ${t.id}: ${String(result.reads.length)} paths, ${seconds} s`)
        for (const why of result.red) {
          accepted.push(t.id)
          console.log(`  ${t.id}: RED AND ACCEPTED (--accept-red) — ${why} — log: turbo-trace/${slug}.log`)
        }
      } else {
        failures.push(`${t.id}: ${result.why} — log: turbo-trace/${slug}.log`)
        console.log(`  ${t.id}: FAILED after ${seconds} s — ${result.why}`)
      }
    }),
    traceJobs()
  )
  return { all, tasks, reads, failures, accepted: [...new Set(accepted)] }
}

/** The inputs and env of every group, from its tasks' reads. */
function groupDefinitions(tasks, reads) {
  const allReads = [...reads.values()].flat().map((r) => (r.endsWith('/**') ? r.slice(0, -3) : r))
  const ignored = gitIgnored(allReads)
  const groups = new Map()
  for (const t of tasks) {
    const g = groups.get(t.group) ?? { owner: t.owner, reads: [], count: 0, gated: false }
    g.reads.push(...(reads.get(t.id) ?? []))
    g.count += 1
    // Only the owners' workers tasks can hold a file the database skip leaves out.
    g.gated ||= t.workers === true && t.expect.some(gatedFile)
    groups.set(t.group, g)
  }
  const defs = new Map()
  for (const [group, g] of groups) {
    const { inputs, env: read } = inputsFor(g.owner, g.reads, isDir, (rel) => ignored.has(rel), GENERATED)
    const env = g.gated ? [...read, SKIP_DB_ENV] : read
    const shared = [...MACHINERY, ...(g.count > 1 ? [SHARD_TABLE] : []), ...inputs]
    defs.set(group, (own) => ({
      inputs: [...new Set([...own, ...shared]), ...EXCLUDE],
      ...(env.length ? { env } : {})
    }))
  }
  return defs
}

function writeConfig(tasks, reads) {
  const defs = groupDefinitions(tasks, reads)
  const rootPkgFile = path.join(ROOT, 'package.json')
  const rootPkgText = readFileSync(rootPkgFile, 'utf8')
  const rootPkg = JSON.parse(rootPkgText)
  for (const key of Object.keys(rootPkg.scripts)) if (key.startsWith('test:ci')) delete rootPkg.scripts[key]
  const turboFile = path.join(ROOT, 'turbo.json')
  const turbo = JSON.parse(readFileSync(turboFile, 'utf8'))
  turbo.globalDependencies = [...new Set([...(turbo.globalDependencies ?? []), ...GATE_FILES])]
  turbo.tasks = Object.fromEntries(Object.entries(turbo.tasks).filter(([k]) => !k.startsWith('//#test:ci')))

  const owners = plannedOwners(tasks.filter((t) => t.group === t.owner).flatMap((t) => t.expect))
  for (const o of owners) {
    const def = defs.get(o.owner)
    if (o.root) {
      for (const t of o.tasks) {
        rootPkg.scripts[t.name] = command(o.owner, true, t.part)
        turbo.tasks[`//#${t.name}`] = def([`$TURBO_ROOT$/${o.owner}/**`])
      }
      continue
    }
    const pkgFile = path.join(ROOT, o.owner, 'package.json')
    const pkgText = readFileSync(pkgFile, 'utf8')
    const pkg = JSON.parse(pkgText)
    pkg.scripts = Object.fromEntries(
      Object.entries(pkg.scripts ?? {}).filter(([k]) => !k.startsWith('test:ci'))
    )
    for (const t of o.tasks) pkg.scripts[t.name] = command(o.owner, false, t.part)
    writeJson(pkgFile, pkg, pkgText)
    writeJson(path.join(ROOT, o.owner, 'turbo.json'), {
      $schema: 'https://turborepo.com/schema.json',
      extends: ['//'],
      tasks: Object.fromEntries(o.tasks.map((t) => [t.name, def(['$TURBO_DEFAULT$'])]))
    })
  }
  for (const extra of EXTRA_ROOT_TASKS) {
    rootPkg.scripts[extra.task] =
      `node --import tsx scripts/ci/turbo-setup.mjs --check --task-part ${extra.part}`
    turbo.tasks[`//#${extra.task}`] = defs.get(extra.part)([`$TURBO_ROOT$/${extra.owner}/**`])
  }
  writeJson(rootPkgFile, rootPkg, rootPkgText)
  writeJson(turboFile, turbo)
  // The repo's formatter decides the final layout, so a regenerated file is not a `lint` failure.
  const written = [
    'package.json',
    'turbo.json',
    ...owners.filter((o) => !o.root).flatMap((o) => [`${o.owner}/package.json`, `${o.owner}/turbo.json`])
  ]
  spawnSync(
    process.execPath,
    [path.join(ROOT, 'node_modules/@biomejs/biome/bin/biome'), 'format', '--write', ...written],
    { cwd: ROOT, stdio: 'ignore' }
  )
  console.log(
    `turbo-setup: wrote ${String(owners.length)} owners and ${String(EXTRA_ROOT_TASKS.length)} extra root tasks`
  )
}

/** The JSON of a dry run whose output may start with Turbo's warnings. */
function parseDryText(text) {
  const at = text.indexOf('\n{')
  return JSON.parse(text.slice(at === -1 ? text.indexOf('{') : at + 1))
}

/** Every Turbo test task name: the generic ones plus the root scripts. */
export function turboTaskNames(rootScripts) {
  return [
    ...new Set([
      'test:ci',
      ...Object.values(SHARDS).flatMap((n) =>
        Array.from({ length: n }, (_, i) => `test:ci:${String(i + 1)}`)
      ),
      ...Object.keys(rootScripts).filter((k) => /^test:ci:[a-z]/.test(k))
    ])
  ]
}

/** Turbo's own account of every test task: the files it hashes, the configured inputs, the env. */
function turboDryRun(task = null) {
  const rootPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' }
  for (const key of ['TURBO_API', 'TURBO_TOKEN', 'TURBO_TEAM']) delete env[key]
  const run = spawnSync(
    path.join(ROOT, 'node_modules/.bin/turbo'),
    [
      'run',
      ...(task ? [task.name, `--filter=${task.id.split('#')[0]}`] : turboTaskNames(rootPkg.scripts ?? {})),
      '--dry=json'
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, env }
  )
  if (run.status !== 0)
    throw new Error(`turbo run --dry=json failed: ${String(run.stderr || run.error).slice(0, 2000)}`)
  return parseDryText(run.stdout).tasks.filter((t) => t.command !== '<NONEXISTENT>')
}

/** A task's `inputs` and `env` as its turbo.json states them (root-relative globs). */
function configuredTask(task) {
  const file = path.join(ROOT, task.directory, 'turbo.json')
  const conf = JSON.parse(readFileSync(file, 'utf8'))
  const def = conf.tasks?.[task.directory ? task.name : `//#${task.name}`]
  return { globs: rootGlobs(def?.inputs ?? [], task.directory), env: def?.env ?? [] }
}

/**
 * Steps 2 and 3 of `--check`: per task, what its hash does not cover and which hashed files git
 * ignores. Pure but for the three probes it is handed.
 *
 * @param {object} input
 * @param {{ id: string, globs: string[], env: string[] }[]} input.tasks
 * @param {ReadonlyMap<string, readonly string[]>} input.reads - traced lines per task id; a task
 *   without an entry was not measured and is only checked for ignored inputs.
 * @param {ReadonlyMap<string, ReadonlySet<string>>} input.hashed - files Turbo hashes per task id.
 * @param {(rel: string) => 'file' | 'dir' | 'absent'} input.kind
 * @param {ReadonlySet<string>} input.ignored - every path above that git ignores.
 * @param {(file: string) => string} [input.ignoredEntry] - the ignored directory (or the file itself)
 *   an ignored file is reported under, so that one build output is one problem, not thousands.
 * @returns {{ problems: string[], report: Record<string, object> }}
 */
export function coverageProblems({ tasks, reads, hashed, kind: kindOf, ignored, ignoredEntry = (f) => f }) {
  const problems = []
  const report = {}
  for (const t of tasks) {
    const mine = hashed.get(t.id)
    if (!mine) {
      problems.push(`${t.id}: Turbo lists no such task — run scripts/ci/turbo-setup.mjs`)
      continue
    }
    // A task that was not measured this time (`--changed-since`) is still checked for ignored inputs.
    const measured = reads.has(t.id)
    const sorted = classifyReads({
      reads: reads.get(t.id) ?? [],
      globs: t.globs,
      env: t.env,
      hashed: mine,
      kind: kindOf,
      isIgnored: (rel) => ignored.has(rel),
      generated: GENERATED
    })
    const ignoredInputs = [...mine].filter((f) => ignored.has(f)).sort()
    report[t.id] = {
      measured,
      read: (reads.get(t.id) ?? []).length,
      hashed: sorted.hashed.length,
      submodule: sorted.submodule.length,
      outputs: sorted.outputs,
      local: sorted.local,
      absent: sorted.absent,
      uncovered: sorted.uncovered,
      ignoredInputs
    }
    for (const f of sorted.uncovered) {
      const bare = f.endsWith('/**') ? f.slice(0, -3) : f
      problems.push(
        ignored.has(bare)
          ? `${t.id}: its suite reads ${f}, which git ignores, so no hash can cover it — either GENERATED (scripts/ci/turbo-setup.mjs) declares it with the sources it is built from and those sources are inputs of this task, or the suite must not read it`
          : bare === '.git' || bare.startsWith('.git/')
            ? `${t.id}: its suite reads ${f}; git's own directory is in no hash`
            : `${t.id}: its suite reads ${f}, which is not among the task's inputs`
      )
    }
    const byEntry = new Map()
    for (const f of ignoredInputs) {
      const entry = ignoredEntry(f)
      byEntry.set(entry, [...(byEntry.get(entry) ?? []), f])
    }
    for (const [entry, files] of byEntry)
      problems.push(
        `${t.id}: ${entry} is hashed (${String(files.length)} file(s), e.g. ${files[0]}) but git ignores it — the plan job's checkout has no such file (declare it in GENERATED in scripts/ci/turbo-setup.mjs with the sources it is built from)`
      )
  }
  return { problems, report }
}

/** Runs the coverage audit over fresh traces and prints the per-task account. */
function audit(tasks, reads, options) {
  const dry = turboDryRun(options.task ?? null)
  const hashed = new Map(
    dry.map((t) => [
      t.taskId,
      new Set(
        Object.keys(t.inputs ?? {}).map((k) => path.posix.normalize(path.posix.join(t.directory || '.', k)))
      )
    ])
  )
  const everything = [
    ...[...reads.values()].flat().map((r) => (r.endsWith('/**') ? r.slice(0, -3) : r)),
    ...[...hashed.values()].flatMap((s) => [...s])
  ]
  const configured = tasks.map((t) => ({ id: t.id, ...configuredTask(t) }))
  // The ignored directories as git names them (`dist/` once, not its 1 500 files).
  const entries = spawnSync('git', ['ls-files', '-o', '-i', '--exclude-standard', '--directory', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
    .stdout.split('\0')
    .filter((e) => e.endsWith('/'))
  const { problems, report } = coverageProblems({
    tasks: configured,
    reads,
    hashed,
    kind,
    ignored: gitIgnored(everything),
    ignoredEntry: (file) => entries.find((e) => file.startsWith(e)) ?? file
  })
  for (const t of dry)
    if (!tasks.some((x) => x.id === t.taskId))
      problems.push(`${t.taskId}: a Turbo test task that no current owner or suite stands behind`)
  writeFileSync(path.join(options.artifacts, 'turbo-coverage.json'), `${JSON.stringify(report, null, 2)}\n`)
  for (const [id, r] of Object.entries(report)) {
    if (!r.measured) continue
    const notes = [
      `${String(r.read)} read`,
      `${String(r.hashed)} hashed`,
      r.submodule ? `${String(r.submodule)} in dsh (TRACY_DSH_COMMIT)` : '',
      r.outputs.length ? `${String(r.outputs.length)} declared generated (sources hashed)` : '',
      r.absent.length
        ? `${String(r.absent.length)} probe(s) of paths that do not exist and are no input`
        : '',
      r.local.length
        ? `${String(r.local.length)} declared machine-only and absent: ${r.local.join(' ')}`
        : '',
      r.uncovered.length ? `${String(r.uncovered.length)} NOT COVERED` : ''
    ].filter(Boolean)
    console.log(`  ${id}: ${notes.join(', ')}`)
  }
  return problems
}

/**
 * What a task definition lacks: its own tree, the wrapper's files or an exclusion. Null when whole.
 * @param {string} where - how the problem names the task.
 * @param {{ inputs?: string[] } | undefined} def
 * @param {string} own - the glob of the task's own tree.
 */
export function definitionProblem(where, def, own, needsEnv = []) {
  if (!def?.inputs?.includes(own)) return `${where} missing — run scripts/ci/turbo-setup.mjs`
  const lacks = [...MACHINERY, ...EXCLUDE].filter((x) => !def.inputs.includes(x))
  if (lacks.length) return `${where} lacks ${lacks.join(' ')}`
  const noEnv = needsEnv.filter((name) => !def.env?.includes(name))
  return noEnv.length
    ? `${where} lacks env ${noEnv.join(' ')}: it runs files that read the database, and without ${noEnv.join(' ')} in its hash a run that skipped them is served as one that ran them (run scripts/ci/turbo-setup.mjs)`
    : null
}

/**
 * Is the configuration complete? Every owner has its tasks, scripts and turbo.json; no package keeps
 * a `test:ci` script for files it no longer owns; every root task exists. Returns the problems.
 * @param {readonly string[]} files - every workers file.
 * @param {(file: string) => boolean} [gated] - does this workers file read the database variable.
 * @returns {string[]}
 */
export function configProblems(files, gated = gatedFile) {
  const problems = []
  const owners = plannedOwners(files)
  /** The env an owner's tasks must hash: the skip switch when one of its files reads the database. */
  const envOf = (owner) => (files.some((f) => f.startsWith(`${owner}/`) && gated(f)) ? [SKIP_DB_ENV] : [])
  const rootPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const turbo = JSON.parse(readFileSync(path.join(ROOT, 'turbo.json'), 'utf8'))
  for (const file of GATE_FILES) {
    if (!turbo.globalDependencies?.includes(file))
      problems.push(
        `turbo.json: globalDependencies must include ${file} so cached verdicts include the auditor`
      )
  }
  const complete = definitionProblem
  for (const o of owners) {
    for (const t of o.tasks) {
      if (o.root) {
        if (rootPkg.scripts?.[t.name] !== command(o.owner, true, t.part))
          problems.push(`package.json: script ${t.name} must run ${o.owner}`)
        const bad = complete(
          `turbo.json: task //#${t.name} for ${o.owner}`,
          turbo.tasks?.[`//#${t.name}`],
          `$TURBO_ROOT$/${o.owner}/**`,
          envOf(o.owner)
        )
        if (bad) problems.push(bad)
        continue
      }
      const pkg = JSON.parse(readFileSync(path.join(ROOT, o.owner, 'package.json'), 'utf8'))
      if (pkg.scripts?.[t.name] !== command(o.owner, false, t.part))
        problems.push(`${o.owner}/package.json: script ${t.name} missing or not the generated one`)
      const own = path.join(ROOT, o.owner, 'turbo.json')
      const conf = existsSync(own) ? JSON.parse(readFileSync(own, 'utf8')) : null
      const bad = complete(
        `${o.owner}/turbo.json: task ${t.name}`,
        conf?.tasks?.[t.name],
        '$TURBO_DEFAULT$',
        envOf(o.owner)
      )
      if (bad) problems.push(bad)
    }
  }
  for (const extra of EXTRA_ROOT_TASKS) {
    if (
      rootPkg.scripts?.[extra.task] !==
      `node --import tsx scripts/ci/turbo-setup.mjs --check --task-part ${extra.part}`
    )
      problems.push(`package.json: script ${extra.task} must run the ${extra.part} part`)
    const bad = complete(
      `turbo.json: task //#${extra.task}`,
      turbo.tasks?.[`//#${extra.task}`],
      `$TURBO_ROOT$/${extra.owner}/**`
    )
    if (bad) problems.push(bad)
  }
  const planned = new Set(owners.filter((o) => !o.root).map((o) => o.owner))
  for (const key of Object.keys(rootPkg.scripts ?? {}).filter((k) => k.startsWith('test:ci'))) {
    const expected =
      owners.some((o) => o.root && o.tasks.some((t) => t.name === key)) ||
      EXTRA_ROOT_TASKS.some((e) => e.task === key)
    if (!expected) problems.push(`package.json: script ${key} runs no current owner`)
  }
  for (const dir of readdirSync(path.join(ROOT, 'apps'))
    .map((d) => `apps/${d}`)
    .concat(
      readdirSync(path.join(ROOT, 'packages')).flatMap((g) =>
        isDir(`packages/${g}`)
          ? readdirSync(path.join(ROOT, 'packages', g)).map((n) => `packages/${g}/${n}`)
          : []
      )
    )) {
    if (planned.has(dir) || !existsSync(path.join(ROOT, dir, 'package.json'))) continue
    const pkg = JSON.parse(readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'))
    if (Object.keys(pkg.scripts ?? {}).some((k) => k.startsWith('test:ci')))
      problems.push(`${dir}/package.json: a test:ci script, but ${dir} owns no workers test file`)
  }
  return problems
}

/** The measuring code: a change to it can change what any task is found to read. */
const GATE_FILES = ['scripts/ci/turbo-setup.mjs', 'scripts/ci/turbo-inputs.mjs', 'scripts/ci/trace-reads.mjs']

/**
 * The tasks a diff obliges the gate to measure again (`--changed-since`): those with an input among
 * the changed files, or every task when the diff is unknown, touches a file at the repository root
 * or touches the measuring code.
 *
 * @param {object} input
 * @param {{ id: string, globs: string[], env: string[] }[]} input.tasks
 * @param {readonly string[] | null} input.changed - repo-relative changed paths, or null when unknown.
 * @returns {{ ids: Set<string>, why: string }}
 */
export function tasksToAudit({ tasks, changed }) {
  const everything = (why) => ({ ids: new Set(tasks.map((t) => t.id)), why })
  if (changed === null) return everything('the changed files could not be listed')
  const wide = changed.find((f) => !f.includes('/') || GATE_FILES.includes(f))
  if (wide) return everything(`${wide} changed, which can change any task`)
  const ids = new Set(
    tasks
      .filter((t) =>
        changed.some(
          (f) =>
            covers(t.globs, f) ||
            ((f === DSH || f.startsWith(`${DSH}/`)) && t.env.includes('TRACY_DSH_COMMIT'))
        )
      )
      .map((t) => t.id)
  )
  return {
    ids,
    why: `${String(changed.length)} changed file(s) touch the inputs of ${String(ids.size)} task(s)`
  }
}

/** Select one exact task; a typo must not become an empty successful run. */
export function taskSelection(all, part) {
  const tasks = all.filter((t) => t.part === part)
  if (tasks.length !== 1) throw new Error(`--task-part matches ${String(tasks.length)} tasks: ${part}`)
  return new Set(tasks.map((t) => t.id))
}

const USAGE =
  'usage: node --import tsx scripts/ci/turbo-setup.mjs [--check [--changed-since <ref> | --task-part <part> | --structure-only]] [--accept-red <task id>]… [--database owned] [--artifacts <dir>]'

/**
 * @param {readonly string[]} argv
 * @returns {{ check: boolean, structureOnly: boolean, taskPart: string | null, database: 'auto' | 'owned', artifacts: string | null, since: string | null, acceptRed: string[] } | { error: string }}
 */
export function parseSetupArgs(argv) {
  const out = {
    check: false,
    structureOnly: false,
    taskPart: /** @type {string | null} */ (null),
    database: /** @type {'auto' | 'owned'} */ ('auto'),
    artifacts: /** @type {string | null} */ (null),
    since: /** @type {string | null} */ (null),
    acceptRed: /** @type {string[]} */ ([])
  }
  const seen = new Set()
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--accept-red') {
      const id = argv[++i]
      if (!id || id.startsWith('--') || !id.includes('#'))
        return { error: '--accept-red needs a task id (//#test:ci:vendor)' }
      out.acceptRed.push(id)
      continue
    }
    if (seen.has(flag)) return { error: `${flag} given more than once` }
    seen.add(flag)
    if (flag === '--check') out.check = true
    else if (flag === '--structure-only') out.structureOnly = true
    else if (flag === '--task-part') {
      const part = argv[++i]
      if (!part || part.startsWith('-')) return { error: '--task-part needs an exact test part' }
      out.taskPart = part
    } else if (flag === '--database') {
      // A misspelt mode must not quietly become the borrowed database (`parseDatabaseMode`).
      if (argv[++i] !== 'owned') return { error: '--database takes exactly one mode: owned' }
      out.database = 'owned'
    } else if (flag === '--artifacts') {
      const dir = argv[++i]
      if (!dir || dir.startsWith('--')) return { error: '--artifacts needs a directory' }
      out.artifacts = dir
    } else if (flag === '--changed-since') {
      const ref = argv[++i]
      if (!ref || ref.startsWith('-')) return { error: '--changed-since needs a git revision' }
      out.since = ref
    } else return { error: `unknown argument ${JSON.stringify(flag)}` }
  }
  if ((out.structureOnly || out.taskPart !== null) && !out.check)
    return { error: '--structure-only and --task-part require --check' }
  if (Number(out.structureOnly) + Number(out.taskPart !== null) + Number(out.since !== null) > 1)
    return { error: '--structure-only, --task-part and --changed-since cannot be combined' }
  // Writing from a part of the tasks would drop the inputs of the others.
  if (out.since !== null && !out.check) return { error: '--changed-since narrows --check only' }
  // The gate never passes a suite it could not see green.
  if (out.acceptRed.length > 0 && out.check)
    return { error: '--accept-red is for generating, never for --check' }
  return out
}

/** The files changed since a revision, or null when git cannot say (then every task is measured). */
function changedSince(ref) {
  const run = spawnSync('git', ['diff', '--name-only', '-z', '--no-renames', ref, 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
  return run.status === 0 ? run.stdout.split('\0').filter(Boolean) : null
}

async function main() {
  const args = parseSetupArgs(process.argv.slice(2))
  if ('error' in args) {
    console.error(`turbo-setup: ${args.error}\n${USAGE}`)
    return 2
  }
  const say = args.check ? 'turbo-config' : 'turbo-setup'
  const { workersFiles, checkCoverage, takeDatabaseSkip } = await import('../check-tests.ts')
  // The switch is read once and removed from the environment here (see `takeDatabaseSkip`), so the
  // traced test processes never inherit it. Turbo has hashed it already, before this started.
  let skipDb
  try {
    skipDb = takeDatabaseSkip(false)
  } catch (error) {
    console.error(`${say}: ${String(error?.message ?? error)}`)
    return 2
  }
  if (skipDb && !args.check) {
    console.error(
      `${say}: ${SKIP_DB_ENV} is on, and generation must trace the database files too — their reads are inputs. Run it without the variable.`
    )
    return 2
  }
  if (args.taskPart !== null) checkCoverage()
  if (args.check) {
    const structure = configProblems(workersFiles())
    for (const p of structure) console.error(`turbo-config: ${p}`)
    if (structure.length) {
      console.error('turbo-config: regenerate with node --import tsx scripts/ci/turbo-setup.mjs')
      return 1
    }
  }
  const kept = args.artifacts !== null
  const artifacts = kept ? path.resolve(args.artifacts) : mkdtempSync(path.join(tmpdir(), 'tracy-turbo-'))
  mkdirSync(artifacts, { recursive: true })
  try {
    const select = args.structureOnly
      ? () => new Set()
      : args.taskPart !== null
        ? (all) => taskSelection(all, args.taskPart)
        : args.since === null
          ? null
          : (all) => {
              const picked = tasksToAudit({
                tasks: all.map((t) => ({ id: t.id, ...configuredTask(t) })),
                changed: changedSince(args.since)
              })
              console.log(`turbo-config: since ${args.since} — ${picked.why}`)
              return picked.ids
            }
    const { all, tasks, reads, failures, accepted } = await traceAll({
      database: args.database,
      artifacts,
      select,
      acceptRed: args.acceptRed,
      taskPart: args.taskPart
    })
    if (failures.length) {
      for (const f of failures) console.error(`${say}: NOT MEASURED — ${f}`)
      if (!kept) {
        // The log is the only account of why; print its end before the directory goes.
        for (const f of failures) {
          const log = path.join(artifacts, /log: (.*)$/.exec(f)?.[1] ?? '')
          const tail = spawnSync('tail', ['-n', '40', log], { encoding: 'utf8' }).stdout
          console.error(`${say}: last lines of ${path.basename(log)}:\n${tail}`)
        }
      }
      // Generating from a part of the suites would write inputs that are short by what the rest
      // read. The gate still judges the tasks it could measure, and is red for the others.
      if (!args.check) {
        console.error(
          `${say}: ${String(failures.length)} task(s) could not be measured, so nothing was written.`
        )
        return 1
      }
    }
    if (!args.check) writeConfig(tasks, reads)
    const problems = audit(args.taskPart !== null ? tasks : all, reads, {
      artifacts,
      task: args.taskPart !== null ? tasks[0] : null
    })
    for (const p of problems) console.error(`${say}: ${p}`)
    if (problems.length)
      console.error(
        `${say}: ${String(problems.length)} problem(s). A read outside the inputs: regenerate with node --import tsx scripts/ci/turbo-setup.mjs`
      )
    if (failures.length)
      console.error(
        `${say}: ${String(failures.length)} task(s) could not be measured (a red suite reads less than a green one), so their inputs are NOT checked: ${failures.map((f) => f.split(': ')[0]).join(' ')}`
      )
    if (problems.length || failures.length) return 1
    for (const id of accepted)
      console.log(
        `::warning::turbo-setup: ${id} was measured from a RED run (--accept-red): its inputs may be incomplete until the turbo-config gate has seen its suite green on a runner.`
      )
    console.log(
      `${say}: ${String(all.length)} tasks, ${String(tasks.length)} measured now — every path their suites read is covered by the task's hash, and no hashed file of any task is ignored by git.`
    )
    return 0
  } finally {
    if (!kept) rmSync(artifacts, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // `process.exit`, not `exitCode`: the database container's cleanup hangs on the exit event, and a
  // child a suite left behind must not keep this gate alive.
  const code = await main()
  // Linux pipes are asynchronous: an immediate exit truncates large suite reports and the audit
  // verdict queued behind them. Drain both streams before triggering database cleanup on exit.
  await Promise.all(
    [process.stdout, process.stderr].map((stream) => new Promise((resolve) => stream.write('', resolve)))
  )
  process.exit(code)
}
