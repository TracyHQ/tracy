#!/usr/bin/env node
/**
 * New-test proof: do the tests a change adds or edits go red when the rest of the change is taken
 * out? (12/10/2026)
 *
 * WHY. The suite grows by hundreds of cases a week and nothing checks that a new test can fail. A
 * test added with a fix is the cheapest place to ask: the fix is the defect in reverse, so the
 * tests of a `fix` pull request must not stay green without it.
 *
 * WHAT IT DOES, for a base and a head commit:
 *   1. lists the test files the change adds or edits, and everything else it changes ("the fix");
 *   2. checks the head out into ONE scratch copy outside the repository and runs each of those test
 *      files there, by the command its suite uses in CI (read from the `package.json` of the tree
 *      being run), minus `--test-force-exit`, which loses results (`suiteCommand`);
 *   3. puts every non-test file of the change back to its base version IN THAT COPY (added files
 *      removed, deleted files restored; test files, their helpers and fixtures stay at the head)
 *      and runs the same files again;
 *   4. reports one row per test file, a machine-readable result and a short summary.
 *
 * VERDICTS, per test file:
 *   proved        green at the head, red without the fix. `evidence` says what went red: an
 *                 `assertion`, `import-only` (the file or a case could only not load a symbol or a
 *                 module — WEAKER evidence, no assertion ran), or `other` (a throw, a crash);
 *   unproved      green both ways: the file does not depend on the change it came with;
 *   broken        red at the head, in the scratch copy — a test that cannot load because of its
 *                 own import included;
 *   not-runnable  with the reason: time, a browser, a database, a build or dependency SHOWN to be
 *                 missing from the scratch copy, a case skipped or marked todo in either run (the
 *                 file did not run whole, so neither `proved` nor `unproved` is said about it), a
 *                 path no CI suite runs, an incomplete run.
 * and for the change as a whole `no-tests` when it adds or edits no executable test file.
 *
 * ONE SCRATCH COPY, NOT TWO. Measured on this repository (12/10/2026, 75 051 files): one copy of the
 * tree is 2.5 GB and takes 35 s to write on an APFS disk. Two copies would spend 70 s of the 180 s
 * budget before a test starts. So the head runs first, then the copy is turned into the
 * "without the fix" tree in place — only the changed files are rewritten.
 *
 * 🔒 ONE COPY, BUT EVERY RUN STARTS CLEAN. Before the copy is run again or rewritten it is put back
 * to exactly what git describes for that phase (`resetTree`): its `.git` as saved, every tracked
 * file that differs checked out again, everything untracked removed — ignored files and any
 * `node_modules` a test made included. The `node_modules` this tool built are the one thing kept,
 * and each is held to the exact list of links it was built with (`restoreMirrors`): an entry a test
 * added, repointed or removed there rebuilds it. A file one test generates, edits or commits is
 * therefore never read by the next test nor by the runs without the fix. Not covered: what a test
 * writes OUTSIDE the tree, through a link into the checkout's installed packages or into the
 * system's temporary directory — the copy is not a sandbox. Measured on this repository: about 1.1 s per reset on a loaded machine
 * (`git diff-files` + `git clean` over 75 051 files); the result counts them in `treeResets`.
 *
 * 🔒 NEVER IN THE CHECKOUT. The altered tree exists only in the scratch copy; `--scratch-root` and
 * `--out` are refused when they resolve inside the repository. The copy is removed on success, on a
 * tool error, at the deadline and on SIGINT/SIGTERM, after the test processes' whole group is
 * killed; failing to remove it is a tool error. SIGKILL cannot be caught: the CI job runs
 * `--cleanup` with the same `--scratch-root` in an `always()` step for that case.
 *
 * 🔒 WHAT THE COPY MAY READ. `node_modules` is rebuilt as links: a registry package links to the
 * checkout's installed copy, a workspace package links to ITS DIRECTORY INSIDE THE SCRATCH COPY, so
 * a test never imports the checkout's product code. A submodule is linked only when the checkout
 * holds it at the commit the measured tree pins; otherwise it is absent and a test that needs it is
 * `not-runnable`, never `proved` by the missing import. Build output that is not in git is absent
 * the same way. `TEST_DATABASE_URL` is removed from the test processes' environment: the altered
 * tree is never pointed at a database this tool did not start, and it starts none.
 * The copy is a Git repository of its own (objects borrowed read-only through `alternates`, HEAD at
 * the head commit, the index following the files), because tests ask git for the tracked files:
 * without it `scripts/test/ci-template-data-lane.test.mjs` was red at the head for no fault of its
 * own. What a test commits or stages there never reaches the checkout's repository.
 *
 * THE TIME LIMIT is per pair of commits: 180 s by default (`--budget-seconds`), preparation and
 * both runs included. It is enough for the copy plus dozens of ordinary `node --test` files, and it
 * keeps the cost of the row from growing with the size of a pull request. Past it every unfinished
 * row is `not-runnable: time`, never a pass. Cleanup happens after the deadline and is not counted.
 *
 * REPORT-ONLY BY DEFAULT. Exit 0 whatever the verdicts; 1 when the tool itself fails (git, the
 * evidence directory, cleanup); 2 for a bad command line. With `--enforce` (off by default, and not
 * set in any workflow) exit 3 unless at least one file is `proved` by more than a missing import and
 * no file is `unproved` or `broken`.
 *
 * GROWTH (`--growth-only`, and part of every proof result): test files added, removed, renamed and
 * edited, and case registrations added and removed, counted from the two versions of each file
 * without running anything. See `countCases` for what is and is not counted.
 *
 *   node scripts/ci/new-test-proof.mjs --base HEAD^1 --head HEAD --out <dir outside the repo>
 *   node scripts/ci/new-test-proof.mjs --growth-only --base HEAD^1 --head HEAD
 *   node scripts/ci/new-test-proof.mjs --pilot 30 --ref origin/develop --out <dir>
 *   node scripts/ci/new-test-proof.mjs --cleanup --scratch-root <dir>
 *
 * Witnesses: `scripts/test/new-test-proof.test.mjs`, `scripts/test/ci-new-test-proof.test.mjs`,
 * and the opt-in replay `scripts/test/new-test-proof-pilot.test.mjs`.
 */
import { execFile, execFileSync, spawn } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prKind } from '../check-regression.mjs'

export const SCHEMA = 'tch-new-test-proof/v1'
export const DEFAULT_BUDGET_SECONDS = 180
export const VERDICTS = ['proved', 'unproved', 'broken', 'not-runnable', 'no-tests']
/** Prefix of every scratch directory this tool creates; `--cleanup` removes nothing else. */
export const SCRATCH_PREFIX = 'tch-new-test-proof-'
const OWNER_FILE = 'owner.json'
const REPORTER = join(dirname(fileURLToPath(import.meta.url)), 'new-test-proof-reporter.mjs')
const MAX_LOG_BYTES = 256 * 1024

/** A fault of the tool or its command line, as opposed to a verdict on the change. */
export class ToolError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.exitCode = code
  }
}

// ── which changed file is what ────────────────────────────────────────────────────────────────

/**
 * The suites of `scripts/check-tests.ts` (`GROUPS`), with where each one's command is read from.
 * A suite without `script` cannot run in the scratch copy; `needs` is the reason given.
 */
export const SUITES = [
  {
    id: 'workers',
    files: /^(apps\/[^/]+|scripts|packages\/[^/]+\/[^/]+)\/test\/[^/]+\.test\.mjs$/,
    dir: () => '.',
    script: 'test:workers'
  },
  { id: 'interop', files: /^scripts\/test\/[^/]+\.test\.ts$/, dir: () => '.', script: 'test:interop' },
  {
    id: 'e2e',
    files: /^(apps\/[^/]+|packages\/[^/]+\/[^/]+)\/test\/e2e\/[^/]+\.test\.mjs$/,
    needs: 'a browser (the e2e suite opens one; this tool starts none)'
  },
  {
    id: 'dsh-passwords',
    files: /^vendor\/tracy\/dsh-passwords\/test\/.+\.test\.ts$/,
    needs: "a build (the fork's suite runs against its own npm install and `dist/`)"
  },
  {
    id: 'standalone',
    files: /^packages\/cms\/tracy-emdash-theme-(base|business|saas)\/tests\/[^/]+\.test\.mjs$/,
    dir: (file) => file.split('/').slice(0, 3).join('/'),
    script: 'test',
    ownInstall: true
  }
]

const TEST_NAME = /\.(test|spec)\.[cm]?[jt]sx?$/
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'fixtures', '__fixtures__', 'e2e'])

/**
 * What one changed path is to this tool.
 *
 * @param {string} path - repo-relative, forward slashes.
 * @returns {{ role: 'test', suite: string } | { role: 'unsupported-test' | 'support' | 'catalogue' | 'fix' }}
 *   `test`: a file a CI suite runs. `unsupported-test`: named like a test, in no suite this tool
 *   knows. `support`: a helper or fixture under a test directory. `catalogue`: a regression or QA
 *   case file, which is data for another runner and not a `node --test` file. `fix`: everything
 *   else. Only `fix` paths are put back to the base.
 */
export function classifyPath(path) {
  const suite = SUITES.find((s) => s.files.test(path))
  if (suite) return { role: 'test', suite: suite.id }
  const segments = path.split('/')
  const name = segments.at(-1) ?? ''
  if (TEST_NAME.test(name)) return { role: 'unsupported-test' }
  if (/^tests\/(regression|qa)\//.test(path) && /\.(json|md|ya?ml)$/.test(name)) return { role: 'catalogue' }
  if (segments[0] === 'tests' || segments.slice(0, -1).some((s) => TEST_DIRS.has(s)))
    return { role: 'support' }
  return { role: 'fix' }
}

// ── git ───────────────────────────────────────────────────────────────────────────────────────

function git(repo, args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    })
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim()
    throw new ToolError(
      `git ${args.slice(0, 2).join(' ')} failed: ${stderr || String(error?.message ?? error)}`
    )
  }
}

/** A ref named on the command line, as one commit id; never interpolated into a shell. */
export function resolveCommit(repo, ref) {
  if (typeof ref !== 'string' || ref === '' || ref.startsWith('-') || /[\0\n]/.test(ref))
    throw new ToolError(`not a usable ref: ${JSON.stringify(ref)}`, 2)
  const sha = git(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).trim()
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new ToolError(`${ref} does not name a commit`)
  return sha
}

/**
 * The change between two commits, one record per path side. A rename is two records (the old path
 * deleted, the new one added) that carry each other's path in `renamedTo` / `renamedFrom`.
 *
 * @returns {{ path: string, status: 'A'|'M'|'D'|'T', baseMode: string, headMode: string,
 *   baseSha: string, headSha: string, renamedFrom?: string, renamedTo?: string }[]} sorted by path.
 */
export function listChanges(repo, base, head) {
  const fields = git(repo, ['diff', '--raw', '-z', '--no-abbrev', '-M', base, head]).split('\0')
  const out = []
  for (let i = 0; i < fields.length; ) {
    const meta = fields[i]
    if (meta === '') break
    const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/.exec(meta)
    if (!m) throw new ToolError(`git diff --raw printed a record this tool does not know: ${meta}`)
    const [, baseMode, headMode, baseSha, headSha, status] = m
    if (status === 'R' || status === 'C') {
      const from = fields[i + 1]
      const to = fields[i + 2]
      i += 3
      if (status === 'R')
        out.push({
          path: from,
          status: 'D',
          baseMode,
          headMode: '000000',
          baseSha,
          headSha: '',
          renamedTo: to
        })
      out.push({
        path: to,
        status: 'A',
        baseMode: '000000',
        headMode,
        baseSha: '',
        headSha,
        ...(status === 'R' ? { renamedFrom: from, renamedSha: baseSha } : {})
      })
    } else if (['A', 'M', 'D', 'T'].includes(status)) {
      out.push({ path: fields[i + 1], status, baseMode, headMode, baseSha, headSha })
      i += 2
    } else {
      throw new ToolError(`git diff --raw status ${status} on ${fields[i + 1]} is not handled`)
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

const GITLINK = '160000'

/**
 * What stays at the head and what goes back to the base, from the change list alone.
 *
 * @param {ReturnType<typeof listChanges>} changes
 */
export function buildManifest(changes) {
  const tests = []
  const unsupportedTests = []
  const keptAtHead = []
  const revertedToBase = []
  const catalogue = []
  const submodules = []
  for (const c of changes) {
    const kind = classifyPath(c.path)
    if (c.baseMode === GITLINK || c.headMode === GITLINK) {
      submodules.push(c.path)
      revertedToBase.push({ path: c.path, action: 'submodule-pointer' })
      continue
    }
    if (kind.role === 'fix') {
      revertedToBase.push({ path: c.path, action: c.status === 'A' ? 'remove' : 'restore-base' })
      continue
    }
    // A test-side path deleted by the change is simply absent in both runs.
    keptAtHead.push({ path: c.path, role: kind.role, state: c.status === 'D' ? 'absent' : 'head' })
    if (c.status === 'D') continue
    if (kind.role === 'test') tests.push({ file: c.path, suite: kind.suite, status: c.status })
    else if (kind.role === 'unsupported-test') unsupportedTests.push({ file: c.path, status: c.status })
    else if (kind.role === 'catalogue') catalogue.push(c.path)
  }
  return { tests, unsupportedTests, keptAtHead, revertedToBase, catalogue, submodules }
}

// ── the suite's own command ───────────────────────────────────────────────────────────────────

const globRe = (glob) =>
  new RegExp(
    `^${glob
      .split(/(\*\*\/|\*)/)
      .map((part) =>
        part === '**/' ? '(?:.*/)?' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('')}$`
  )

/**
 * The argv that runs ONE file the way its suite's package script would, read from the tree being
 * run. The script must have the one shape `check-tests.ts` knows (`node [--import x]… --test
 * [--test-… flags] <globs>`) and one of its globs must select the file; anything else is a reason,
 * never another command. The one flag not carried over is `--test-force-exit` (reason at the filter).
 *
 * @param {string} tree - root of the tree being run.
 * @param {string} file - repo-relative test file.
 * @returns {{ argv: string[], cwd: string, suite: string } | { notRunnable: string, suite?: string }}
 *   `argv` follows `node`; `cwd` is repo-relative.
 */
export function suiteCommand(tree, file) {
  const suite = SUITES.find((s) => s.files.test(file))
  if (!suite) return { notRunnable: 'no CI suite this tool knows runs this path' }
  if (!suite.script) return { notRunnable: `needs ${suite.needs}`, suite: suite.id }
  const dir = suite.dir(file)
  let scripts
  try {
    scripts = JSON.parse(readFileSync(join(tree, dir, 'package.json'), 'utf8')).scripts ?? {}
  } catch {
    return {
      notRunnable: `${dir === '.' ? '' : `${dir}/`}package.json is absent or unreadable in this tree`,
      suite: suite.id
    }
  }
  const script = scripts[suite.script]
  const m =
    typeof script === 'string'
      ? /^node((?: --import [\w@./-]+)*) --test((?: --test-[a-z-]+(?:=[^\s"'`$;&|<>]+)?)*)((?: "?(?!-)[\w@.*/-]+"?)+)$/.exec(
          script.trim()
        )
      : null
  if (m === null)
    return {
      notRunnable: `script "${suite.script}" is ${JSON.stringify(script ?? null)}, not \`node [--import …] --test [flags] <globs>\``,
      suite: suite.id
    }
  const imports = m[1].trim() === '' ? [] : m[1].trim().split(' ')
  // 🔒 EVERY FLAG OF THE SUITE BUT ONE. `--test-force-exit` ends the test process as soon as its
  // cases are done, without waiting for their results to reach the runner. Measured 12/10/2026,
  // node 24.15 on macOS, ten runs each: a file of 200 passing cases reported 181 and 190 of them
  // in two runs (exit 0, no warning), a file of 200 failing cases left the runner spinning at
  // 100 % CPU in seven; without the flag both reported 200 in every run. A verdict here needs to
  // know that every case ran and none was skipped, so the proof runs the file without the flag.
  // A file that then stays open is ended by this tool (`runProcess`, lingering) — and that run is
  // NOT judged: the file is run once more with the suite's flag, and only a run the runner itself
  // finished, reporting as many cases as were seen to complete, gives a verdict (`runOne`).
  const suiteFlags = m[2].trim() === '' ? [] : m[2].trim().split(' ')
  const flags = suiteFlags.filter((f) => f !== '--test-force-exit')
  if (flags.some((f) => f.startsWith('--test-reporter')))
    return { notRunnable: `script "${suite.script}" names a reporter of its own`, suite: suite.id }
  const local = dir === '.' ? file : file.slice(dir.length + 1)
  const globs = m[3]
    .trim()
    .split(' ')
    .map((g) => g.replaceAll('"', ''))
  if (!globs.some((g) => globRe(g).test(local)))
    return { notRunnable: `script "${suite.script}" of this tree does not select this file`, suite: suite.id }
  if (suite.ownInstall && !existsSync(join(tree, dir, 'node_modules')))
    return {
      notRunnable: `needs dependencies (${dir} has its own install, absent in the checkout)`,
      suite: suite.id
    }
  return {
    argv: [...imports, '--test', ...flags, local],
    cwd: dir,
    suite: suite.id,
    forceExit: suiteFlags.includes('--test-force-exit')
  }
}

// ── reading one run ───────────────────────────────────────────────────────────────────────────

/** Error codes node gives a module that cannot be resolved, loaded or compiled. */
const IMPORT_CODES = new Set([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_PACKAGE_IMPORT_NOT_DEFINED',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_REQUIRE_ESM',
  'ERR_INVALID_TYPESCRIPT_SYNTAX',
  'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX',
  'ERR_IMPORT_ATTRIBUTE_MISSING'
])
/** Error classes a module that does not compile is rejected with (node, and esbuild under tsx). */
const COMPILE_NAMES = new Set(['SyntaxError', 'TransformError'])
const IMPORT_TEXT =
  /Cannot find (?:module|package)|does not provide an export named|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|Named export '[^']*' not found/
const COMPILE_TEXT = /SyntaxError|TransformError|ERR_UNKNOWN_FILE_EXTENSION|ERR_INVALID_TYPESCRIPT_SYNTAX/
const BROWSER_TEXT =
  /browserType\.launch|Executable doesn't exist|playwright install|chrom(e|ium)[^\n]*not found/i

const oneLine = (value, limit = 240) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)

/**
 * `assertion`, `import` (import or compile) or `other`, for one failed case — read from the error's
 * own fields first: its code, then its class. A dynamic `import()` of a module that no longer
 * compiles rejects with a `SyntaxError`, which is compile evidence and never `other`.
 *
 * Two places where only the message can tell, both erring towards the WEAKER label:
 *   - a `SyntaxError` that `JSON.parse` threw is about data, not about a module: `other`;
 *   - an assertion whose message is a spawned program's "Cannot find module" (a new script, removed
 *     with the fix) says no more than a failed import does: `import`.
 */
export function failureKind(error) {
  const cause = error?.cause
  if (IMPORT_CODES.has(cause?.code)) return 'import'
  if (COMPILE_NAMES.has(cause?.name)) return /\bJSON\b/.test(cause?.message ?? '') ? 'other' : 'import'
  const asserted = cause?.code === 'ERR_ASSERTION' || cause?.name === 'AssertionError'
  if (IMPORT_TEXT.test(cause?.message ?? '')) return 'import'
  return asserted ? 'assertion' : 'other'
}

/** The error code or class a crashed file printed, from node's own report on stderr. */
function crashKind(stderr) {
  const code = /\bcode: '([A-Z_]+)'/.exec(stderr)?.[1] ?? /\[(ERR_[A-Z_]+)\]/.exec(stderr)?.[1]
  if (code !== undefined) return IMPORT_CODES.has(code) ? 'import' : 'other'
  const thrown = /^(?:Uncaught )?([A-Za-z]*Error)\b/m.exec(stderr)?.[1]
  if (thrown !== undefined && COMPILE_NAMES.has(thrown)) return 'import'
  return IMPORT_TEXT.test(stderr) ? 'import' : 'other'
}

/**
 * 🔒 THE ONE DEFINITION OF A WHOLE RUN. A verdict is read only from a run for which ALL of this
 * holds; anything missing or contradictory is a reason, never a pass and never a fail:
 *   - the reporter wrote its last line (the runner's event stream closed);
 *   - the runner wrote exactly one summary, with a verdict and counts;
 *   - the summary's counts are the records': as many tests, suites, passed, skipped and todo, and
 *     as many failed-or-cancelled, as the pass/fail records on file (checked on node 24.15 against
 *     suites, nested tests, skips, todos, a timeout and a failed hook: they agree exactly) — so a
 *     result the runner counted and the reporter never received, or the reverse, is caught;
 *   - the summary's verdict is the process's: success with exit 0, failure with any other exit —
 *     never one saying green and the other red;
 *   - a successful summary comes with no failed record.
 * Three earlier rules each trusted one of these signs alone (the last line; then the exit code;
 * then a case count) and each let an unfinished run through. They are all required together here,
 * and every caller — the ordinary run and the `--test-force-exit` rerun — goes through this.
 *
 * @param {object[]} records - parsed reporter lines.
 * @param {{ exit: number|null }} end - how the runner process ended.
 * @returns {string|null} what is missing or contradictory, or `null` for a whole run.
 */
export function wholenessProblem(records, { exit }) {
  if (!records.some((r) => r.type === 'end')) return 'the reporter never wrote its last line'
  const summaries = records.filter((r) => r.type === 'summary')
  if (summaries.length !== 1) return `the runner wrote ${String(summaries.length)} summaries, not one`
  const [{ counts, success }] = summaries
  if (typeof success !== 'boolean' || counts === null || typeof counts !== 'object')
    return 'the runner’s summary carries no verdict or no counts'
  const tally = { tests: 0, suites: 0, passed: 0, skipped: 0, todo: 0, failed: 0 }
  for (const r of records) {
    if (r.type !== 'pass' && r.type !== 'fail') continue
    if (r.kind === 'suite') tally.suites += 1
    else {
      tally.tests += 1
      if (r.skip !== undefined && r.skip !== false) tally.skipped += 1
      else if (r.todo !== undefined && r.todo !== false) tally.todo += 1
      else if (r.type === 'pass') tally.passed += 1
      else tally.failed += 1
    }
  }
  const said = { ...counts, failed: Number(counts.failed) + Number(counts.cancelled ?? 0) }
  for (const key of Object.keys(tally))
    if (said[key] !== tally[key])
      return `the summary counts ${String(said[key])} ${key} and the records hold ${String(tally[key])}`
  if (exit === null) return 'the runner was killed'
  if (success !== (exit === 0))
    return `the summary says ${success ? 'success' : 'failure'} and the runner exited ${String(exit)}`
  if (success && tally.failed > 0) return 'the summary says success and a record failed'
  return null
}

/**
 * One run of one test file, from the reporter's records and how the process ended.
 *
 * `state`: `timeout` (killed at the deadline), `incomplete` (not a whole run by `wholenessProblem`,
 * or ended by this tool), `red`, `not-executed` (exit 0 and not one case ran:
 * all skipped, or none registered) or `green`.
 *
 * @param {object[]} rawRecords - parsed reporter lines.
 * @param {{ exit: number|null, signal: string|null, timedOut: boolean, file: string, cwd: string, seconds: number }} end
 */
export function classifyRun(
  rawRecords,
  { exit, signal, timedOut, stalled = false, lingered = false, file, cwd, seconds, tree }
) {
  // The scratch copy's own path is random per run: a reason that quoted it would differ between
  // two runs of the same pair of commits. Paths are given relative to the tree instead.
  const scrub = (value) =>
    typeof value === 'string' && tree ? value.replaceAll(`${tree}${sep}`, '').replaceAll(tree, '.') : value
  const records = rawRecords.map((r) =>
    r.type === 'stderr'
      ? { ...r, text: scrub(r.text) }
      : r.error
        ? {
            ...r,
            error: {
              ...r.error,
              message: scrub(r.error.message),
              cause: r.error.cause
                ? { ...r.error.cause, message: scrub(r.error.cause.message) }
                : r.error.cause
            }
          }
        : r
  )
  // A run this tool ended — at the deadline, as stalled, or as lingering — is never read as whole,
  // and neither is one whose own account does not add up (`wholenessProblem`).
  const unwhole = wholenessProblem(records, { exit })
  const absolute = resolve(cwd, file)
  const isFileRecord = (r) =>
    r.nesting === 0 &&
    r.line === 1 &&
    r.column === 1 &&
    typeof r.name === 'string' &&
    resolve(cwd, r.name) === absolute
  const stderr = records
    .filter((r) => r.type === 'stderr')
    .map((r) => r.text)
    .join('')
  const counts = { cases: 0, passed: 0, failed: 0, skipped: 0, todo: 0 }
  const failures = []
  const skipReasons = new Set()
  let fileFailure = null
  for (const r of records) {
    if (r.type !== 'pass' && r.type !== 'fail') continue
    if (isFileRecord(r)) {
      if (r.type === 'fail' && r.error?.failureType !== 'subtestsFailed') {
        const kind = crashKind(stderr)
        const lines = stderr.split('\n')
        const line =
          lines.find((l) => /Cannot find|does not provide an export|not found/.test(l)) ??
          lines.find((l) => COMPILE_TEXT.test(l)) ??
          lines.find((l) => /^\s*(?:Uncaught )?[\w.]*Error(?: \[\w+\])?: /.test(l)) ??
          lines.find((l) => /\b\w*Error\b/.test(l))
        fileFailure = {
          kind,
          message: oneLine(line ?? r.error?.message ?? 'the file failed before any case ran')
        }
      }
      continue
    }
    const skipped = r.skip !== undefined && r.skip !== false
    const todo = r.todo !== undefined && r.todo !== false
    if (r.kind === 'suite') {
      // A skipped suite reports none of its cases: it stands for all of them. Found on the replay,
      // 12/10/2026: `describe('site activity V2', { skip }, …)` holds every database case of its
      // file, and with a few plain cases beside it the file read `unproved` instead of skipped.
      if (skipped) {
        counts.skipped += 1
        skipReasons.add(
          typeof r.skip === 'string' && r.skip.trim() !== '' ? oneLine(r.skip, 120) : '(no reason given)'
        )
        continue
      }
      if (todo) {
        counts.todo += 1
        continue
      }
      // A suite that failed on its own (a hook, its body), not because a case inside it did.
      if (r.type === 'fail' && r.error?.failureType !== 'subtestsFailed' && !todo)
        failures.push({
          name: oneLine(r.name, 160),
          line: r.line,
          kind: failureKind(r.error),
          message: oneLine(r.error?.cause?.message ?? r.error?.message)
        })
      continue
    }
    counts.cases += 1
    if (skipped) {
      counts.skipped += 1
      skipReasons.add(
        typeof r.skip === 'string' && r.skip.trim() !== '' ? oneLine(r.skip, 120) : '(no reason given)'
      )
    } else if (todo) counts.todo += 1
    else if (r.type === 'pass') counts.passed += 1
    else {
      counts.failed += 1
      failures.push({
        name: oneLine(r.name, 160),
        line: r.line,
        kind: failureKind(r.error),
        message: oneLine(r.error?.cause?.message ?? r.error?.message)
      })
    }
  }
  const red = failures.length > 0 || fileFailure !== null || exit !== 0
  const kinds = new Set([...failures.map((f) => f.kind), ...(fileFailure ? [fileFailure.kind] : [])])
  const evidence = !red
    ? null
    : kinds.has('assertion')
      ? 'assertion'
      : kinds.size === 1 && kinds.has('import')
        ? 'import-only'
        : 'other'
  const state = timedOut
    ? 'timeout'
    : unwhole !== null || stalled
      ? 'incomplete'
      : red
        ? 'red'
        : counts.passed === 0
          ? 'not-executed'
          : 'green'
  return {
    state,
    unwhole: state === 'incomplete' ? unwhole : null,
    exit,
    signal,
    stalled,
    lingered,
    seconds,
    counts,
    evidence: state === 'red' ? evidence : null,
    fileFailure,
    failures: failures.slice(0, 20),
    failuresTotal: failures.length,
    skipReasons: [...skipReasons].sort(),
    browser: BROWSER_TEXT.test(stderr) || failures.some((f) => BROWSER_TEXT.test(f.message)),
    text: `${stderr}\n${failures.map((f) => f.message).join('\n')}\n${fileFailure?.message ?? ''}`
  }
}

function skipReason(run) {
  const reasons = run.skipReasons.join('; ')
  if (/TEST_DATABASE_URL|database|postgres/i.test(reasons)) return `needs a database (${reasons})`
  if (/browser|playwright|chromium/i.test(reasons)) return `needs a browser (${reasons})`
  return reasons === '' ? null : `skipped: ${reasons}`
}

const incompleteWhy = (run) =>
  run.dropped
    ? 'the file does not exit on its own, and with --test-force-exit node did not report every case:'
    : run.lingered
      ? 'the file does not exit on its own once its cases are done, and its suite has no --test-force-exit to end it:'
      : run.stalled
        ? 'the test runner did not exit after the test process ended, twice,'
        : `the runner's result is not whole (${run.unwhole ?? 'no complete result'})`

const firstFailure = (run) =>
  run.fileFailure?.message ??
  (run.failures[0]
    ? `${run.failures[0].name}: ${run.failures[0].message}`
    : `the runner exited ${String(run.exit ?? run.signal)}`)

/**
 * The verdict of one test file from its two runs. Pure, so every rule has a unit test.
 *
 * @param {ReturnType<typeof classifyRun>|null} head - the run at the head, `null` when it never started.
 * @param {ReturnType<typeof classifyRun>|null} withoutFix - the run without the fix, `null` when it never started.
 * @param {{ unavailable?: readonly string[], unavailableAtHead?: readonly string[] }} [context] -
 *   names and paths the scratch copy lacks (a submodule at another commit, a workspace package
 *   without its tree): without the fix, and at the head (the same list when only one is given).
 *   A run may carry `scratchLack`: a module its failure names that the checkout has outside git.
 * @returns {{ verdict: string, evidence?: string, weak?: boolean, reason?: string }}
 */
export function verdictOf(head, withoutFix, { unavailable = [], unavailableAtHead = unavailable } = {}) {
  const no = (reason) => ({ verdict: 'not-runnable', reason })
  if (head === null || head.state === 'timeout') return no('time')
  if (head.state === 'incomplete') return no(`${incompleteWhy(head)} at the head`)
  if (head.state === 'red') {
    // `not-runnable` at the head only for something SHOWN to be missing from the scratch copy: a
    // package or submodule it could not link, or a file the checkout has outside git (`scratchLack`).
    // Any other failure to load is the test's own, and the row is `broken`.
    const lacking = unavailableAtHead.find((name) => head.text.includes(name)) ?? head.scratchLack
    if (lacking) return no(`needs a build or a dependency the scratch copy lacks at the head (${lacking})`)
    if (head.browser) return no('needs a browser')
    return {
      verdict: 'broken',
      evidence: head.evidence,
      reason: `${head.evidence === 'import-only' ? 'cannot load at the head: ' : ''}${firstFailure(head)}`
    }
  }
  if (head.state === 'not-executed')
    return no(skipReason(head) ?? 'no case ran at the head (the file registered none)')
  if (withoutFix === null || withoutFix.state === 'timeout') return no('time')
  if (withoutFix.state === 'incomplete') return no(`${incompleteWhy(withoutFix)} without the fix`)
  if (withoutFix.state === 'red') {
    const missing = unavailable.find((name) => withoutFix.text.includes(name)) ?? withoutFix.scratchLack
    if (missing)
      return no(`needs a build or a dependency the scratch copy lacks without the fix (${missing})`)
    if (withoutFix.browser) return no('needs a browser')
  }
  if (withoutFix.state === 'not-executed')
    return no(skipReason(withoutFix) ?? 'no case ran without the fix (the file registered none)')
  // Neither `proved` nor `unproved` is said about a file that did not run whole: the case that was
  // skipped or is still `todo` may be the one written for the fix, whatever the others did.
  const partial = partialWhy(head, withoutFix)
  if (partial !== null) return no(partial)
  if (withoutFix.state === 'red') {
    const weak = withoutFix.evidence === 'import-only'
    return {
      verdict: 'proved',
      evidence: withoutFix.evidence,
      weak,
      reason: `${weak ? 'weaker evidence — it only fails to load without the fix, no assertion ran: ' : ''}${firstFailure(withoutFix)}`
    }
  }
  return { verdict: 'unproved', reason: 'green at the head and green without the fix' }
}

/** Why the two runs are not a whole execution of the file, or `null` when every case ran in both. */
function partialWhy(head, withoutFix) {
  const skipped = Math.max(head.counts.skipped, withoutFix.counts.skipped)
  const todo = Math.max(head.counts.todo, withoutFix.counts.todo)
  if (skipped + todo === 0) return null
  const parts = [
    ...(skipped > 0 ? [`${String(skipped)} case(s) or suite(s) skipped`] : []),
    ...(todo > 0 ? [`${String(todo)} marked todo`] : [])
  ]
  const why = skipReason(head) ?? skipReason(withoutFix)
  return `not every case ran: ${parts.join(', ')} — one of them may be the test of the fix${why ? ` (${why})` : ''}`
}

// ── growth ────────────────────────────────────────────────────────────────────────────────────

const CASE_RE =
  /(?<![\w.$])(?:test|it)(?:\.(?:skip|todo|only))?\s*\(\s*(?:(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\.|[^\\`])*)`|([^\s)]))/g

/**
 * Case registrations in one test file, read from its text without running it.
 *
 * COUNTED: each `test(` / `it(` call (with `.skip`, `.todo`, `.only`) whose first argument is a
 * string literal or a template without `${}` — by title. NOT COUNTED AS A CASE, counted as
 * `dynamic`: a call whose title is computed (a variable, a template with `${}`), because how many
 * cases it registers is only known by running it; a literal call inside a loop is still one.
 * Lines that are wholly a comment are ignored; a call inside a string is not told apart.
 *
 * @param {string} source
 * @returns {{ titles: string[], dynamic: number }}
 */
export function countCases(source) {
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
  const titles = []
  let dynamic = 0
  for (const m of code.matchAll(CASE_RE)) {
    if (m[1] !== undefined) titles.push(m[2])
    else if (m[3] !== undefined) {
      if (m[3].includes('${')) dynamic += 1
      else titles.push(m[3])
    } else dynamic += 1
  }
  return { titles, dynamic }
}

/** Multiset difference: the titles of `a` that `b` does not have, counting repeats. */
function titlesMinus(a, b) {
  const left = new Map()
  for (const t of b) left.set(t, (left.get(t) ?? 0) + 1)
  let n = 0
  for (const t of a) {
    const have = left.get(t) ?? 0
    if (have > 0) left.set(t, have - 1)
    else n += 1
  }
  return n
}

const MAX_SOURCE_BYTES = 2 * 1024 * 1024

/**
 * What a change does to the size of the suite: test files and case registrations added and
 * removed, kept apart (never a net number). Runs nothing.
 *
 * @param {string} repo
 * @param {ReturnType<typeof listChanges>} changes
 */
export function measureGrowth(repo, changes) {
  const isTest = (path) => ['test', 'unsupported-test'].includes(classifyPath(path).role)
  const blob = (sha) => {
    if (!sha) return ''
    const size = Number(git(repo, ['cat-file', '-s', sha]).trim())
    if (size > MAX_SOURCE_BYTES) return null
    return git(repo, ['cat-file', 'blob', sha])
  }
  const files = { added: [], removed: [], renamed: [], edited: [] }
  const perFile = []
  const notCounted = []
  const cases = { added: 0, removed: 0, dynamicAtBase: 0, dynamicAtHead: 0 }
  const catalogue = { added: 0, removed: 0, edited: 0 }
  for (const c of changes) {
    if (c.baseMode === GITLINK || c.headMode === GITLINK) continue
    const role = classifyPath(c.path).role
    if (role === 'catalogue') {
      catalogue[c.status === 'A' ? 'added' : c.status === 'D' ? 'removed' : 'edited'] += 1
      continue
    }
    if (!isTest(c.path)) continue
    // The old side of a rename is reported with its new side, below.
    if (c.status === 'D' && c.renamedTo !== undefined && isTest(c.renamedTo)) continue
    const renamed = c.status === 'A' && c.renamedFrom !== undefined && isTest(c.renamedFrom)
    const baseSource = c.status === 'A' ? (renamed ? blob(c.renamedSha) : '') : blob(c.baseSha)
    const headSource = c.status === 'D' ? '' : blob(c.headSha)
    const status = renamed ? 'renamed' : c.status === 'A' ? 'added' : c.status === 'D' ? 'removed' : 'edited'
    if (status === 'renamed') files.renamed.push({ from: c.renamedFrom, to: c.path })
    else files[status].push(c.path)
    if (baseSource === null || headSource === null) {
      notCounted.push({ file: c.path, why: `larger than ${String(MAX_SOURCE_BYTES)} bytes` })
      continue
    }
    const before = countCases(baseSource)
    const after = countCases(headSource)
    const row = {
      file: c.path,
      status,
      casesAdded: titlesMinus(after.titles, before.titles),
      casesRemoved: titlesMinus(before.titles, after.titles),
      dynamicAtBase: before.dynamic,
      dynamicAtHead: after.dynamic
    }
    perFile.push(row)
    cases.added += row.casesAdded
    cases.removed += row.casesRemoved
    cases.dynamicAtBase += before.dynamic
    cases.dynamicAtHead += after.dynamic
  }
  return {
    files,
    cases,
    perFile,
    catalogue,
    notCounted,
    seconds: { measured: false, source: 'not measured: this run executed no test' }
  }
}

/** The growth of a change as one line, for a job summary. */
export function growthLine(growth) {
  const f = growth.files
  const n = (list) => String(list.length)
  const dynamic =
    growth.cases.dynamicAtBase + growth.cases.dynamicAtHead > 0
      ? `; ${String(growth.cases.dynamicAtHead)} computed registration(s) at the head, ${String(growth.cases.dynamicAtBase)} at the base, not counted as cases`
      : ''
  const seconds = growth.seconds.measured
    ? `; added files ran ${growth.seconds.addedFiles.toFixed(1)} s, edited files ${growth.seconds.editedFiles.toFixed(1)} s (${growth.seconds.source})`
    : `; seconds ${growth.seconds.source}`
  return (
    `Test growth: files +${n(f.added)} −${n(f.removed)} (renamed ${n(f.renamed)}, edited ${n(f.edited)}); ` +
    `cases +${String(growth.cases.added)} −${String(growth.cases.removed)}${dynamic}; ` +
    `regression/QA catalogue files +${String(growth.catalogue.added)} −${String(growth.catalogue.removed)}${seconds}.`
  )
}

// ── the scratch copy ──────────────────────────────────────────────────────────────────────────

function inside(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Real path of a path that may not exist yet: its nearest existing ancestor, then the rest. */
function realTarget(path) {
  let at = resolve(path)
  const rest = []
  while (!existsSync(at)) {
    rest.unshift(at.slice(dirname(at).length + 1))
    if (dirname(at) === at) break
    at = dirname(at)
  }
  return join(realpathSync(at), ...rest)
}

function refuseInsideRepo(repoReal, path, flag) {
  if (inside(repoReal, realTarget(path)))
    throw new ToolError(
      `${flag} must be outside the repository: the altered tree and its evidence never live in the checkout`,
      2
    )
}

/** `git ls-tree -r` of a commit: package directories and submodule pointers. */
function readTree(repo, commit) {
  const packageDirs = []
  const gitlinks = []
  for (const record of git(repo, ['ls-tree', '-r', '-z', commit]).split('\0')) {
    if (record === '') continue
    const tab = record.indexOf('\t')
    const [mode, , sha] = record.slice(0, tab).split(' ')
    const path = record.slice(tab + 1)
    if (mode === GITLINK) gitlinks.push({ path, sha })
    else if ((path === 'package.json' || path.endsWith('/package.json')) && !path.includes('node_modules/'))
      packageDirs.push(path === 'package.json' ? '.' : path.slice(0, -'/package.json'.length))
  }
  return { packageDirs, gitlinks }
}

/** The commit a submodule's working tree is at in the checkout, or `null`. */
function submoduleHead(repo, path) {
  if (!existsSync(join(repo, path, '.git'))) return null
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: join(repo, path),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return null
  }
}

/**
 * Give the scratch tree a submodule: a link to the checkout's copy when that copy is at exactly
 * `sha`, an empty directory otherwise.
 *
 * @returns {boolean} whether it was linked.
 */
function placeSubmodule(repo, tree, path, sha) {
  const at = join(tree, path)
  rmSync(at, { recursive: true, force: true })
  if (sha !== '' && submoduleHead(repo, path) === sha) {
    mkdirSync(dirname(at), { recursive: true })
    symlinkSync(realpathSync(join(repo, path)), at)
    return true
  }
  mkdirSync(at, { recursive: true })
  return false
}

/**
 * Rebuild `node_modules` in the scratch tree as links (see the header, "what the copy may read"),
 * and keep the exact list of what was made: `restoreMirrors` holds every later run to that list.
 *
 * @param {string} repo - the checkout, whose installed dependencies are borrowed.
 * @param {string} tree - the scratch tree.
 * @param {readonly string[]} packageDirs - directories of the tree that hold a `package.json`.
 * @returns {{ workspace: { name: string, target: string }[],
 *   mirrors: { dir: string, dirs: string[], links: { at: string, target: string }[] }[] }}
 *   `workspace`: the links to workspace packages, each pointing inside `tree`. `mirrors`: one per
 *   `node_modules` made — its path in the tree, the directories inside it, and every link.
 */
export function mirrorNodeModules(repo, tree, packageDirs) {
  const repoReal = realpathSync(repo)
  const workspace = []
  const mirrors = []
  for (const dir of packageDirs) {
    const source = join(repo, dir, 'node_modules')
    if (
      !existsSync(join(tree, dir, 'package.json')) ||
      !lstatSync(source, { throwIfNoEntry: false })?.isDirectory()
    )
      continue
    const mirror = { dir: dir === '.' ? 'node_modules' : `${dir}/node_modules`, dirs: [], links: [] }
    if (existsSync(join(tree, mirror.dir))) continue
    const link = (from, at, name) => {
      let real
      try {
        real = realpathSync(from)
      } catch {
        return
      }
      const rel = relative(repoReal, real)
      const isWorkspace = inside(repoReal, real) && !rel.split(sep).includes('node_modules')
      const target = isWorkspace ? join(tree, rel) : real
      if (isWorkspace) workspace.push({ name, target })
      mirror.links.push({ at, target })
    }
    for (const entry of readdirSync(source)) {
      const from = join(source, entry)
      if (entry === '.bin' || (entry.startsWith('@') && lstatSync(from).isDirectory())) {
        mirror.dirs.push(entry)
        for (const sub of readdirSync(from))
          link(join(from, sub), `${entry}/${sub}`, entry === '.bin' ? sub : `${entry}/${sub}`)
      } else if (!entry.startsWith('.')) link(from, entry, entry)
    }
    buildMirror(tree, mirror)
    mirrors.push(mirror)
  }
  return { workspace, mirrors }
}

function buildMirror(tree, mirror) {
  const root = join(tree, mirror.dir)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root)
  for (const sub of mirror.dirs) mkdirSync(join(root, sub))
  for (const { at, target } of mirror.links) symlinkSync(target, join(root, at))
}

/**
 * Hold every `node_modules` this tool made to exactly what it made: the recorded directories and
 * links, each link with its recorded target, and nothing else. A mirror that differs in any way —
 * a cache a test dropped beside the links, a link repointed or removed — is deleted and built
 * again from the record. What a test wrote THROUGH a link (into a workspace package of the tree) is
 * an untracked or modified file of the tree and is `resetTree`'s to remove.
 *
 * @returns {number} how many entries were foreign, changed or missing.
 */
export function restoreMirrors(tree, mirrors) {
  let wrong = 0
  for (const mirror of mirrors) {
    const root = join(tree, mirror.dir)
    const want = new Map(mirror.links.map((l) => [l.at, l.target]))
    const subdirs = new Set(mirror.dirs)
    let bad = 0
    let found = 0
    const plainDir = (at) => {
      const stat = lstatSync(at, { throwIfNoEntry: false })
      return stat !== undefined && stat.isDirectory()
    }
    const walk = (rel) => {
      if (!plainDir(join(root, rel))) {
        bad += 1
        return
      }
      for (const name of readdirSync(join(root, rel))) {
        const at = rel === '' ? name : `${rel}/${name}`
        if (rel === '' && subdirs.has(at)) {
          walk(at)
          continue
        }
        let have = null
        try {
          have = readlinkSync(join(root, at))
        } catch {
          // Not a link: a file or directory nobody recorded.
        }
        if (have !== null && want.get(at) === have) found += 1
        else bad += 1
      }
    }
    walk('')
    for (const sub of subdirs) if (!plainDir(join(root, sub))) bad += 1
    bad += want.size - found
    if (bad > 0) buildMirror(tree, mirror)
    wrong += bad
  }
  return wrong
}

/**
 * A module a failure names that is SHOWN to be missing from the scratch copy and not from the
 * change: a file the checkout has but git does not track there (build output), or a package that
 * resolves from the importing file in the checkout and not in the copy. Anything else a test fails
 * to load is the test's own failure, and `null` is returned.
 *
 * @param {string} text - a run's failure text, the copy's path already made relative.
 * @param {{ repo: string, tree: string }} where - the checkout and the scratch tree.
 * @returns {string|null} what is missing, named for the row.
 */
export function scratchLack(text, { repo, tree }) {
  const untracked = (rel) => {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: repo, stdio: 'ignore' })
      return false
    } catch {
      return true
    }
  }
  const relOf = (raw) => {
    const path = raw.replace(/^file:\/\//, '')
    return path.startsWith('/') || path.startsWith('.') ? null : path
  }
  for (const m of text.matchAll(/Cannot find module '([^']+)'/g)) {
    const rel = relOf(m[1])
    if (rel === null) continue
    if (existsSync(join(repo, rel)) && !existsSync(join(tree, rel)) && untracked(rel))
      return `${rel} is in the checkout but not in git: build output`
  }
  for (const m of text.matchAll(/Cannot find package '([^']+)' imported from (\S+)/g)) {
    const importer = relOf(m[2])
    if (importer === null) continue
    const found = (root) => {
      for (let dir = dirname(join(root, importer)); inside(root, dir); dir = dirname(dir)) {
        if (existsSync(join(dir, 'node_modules', m[1]))) return true
        if (dir === root) break
      }
      return false
    }
    if (found(repo) && !found(tree))
      return `package '${m[1]}' is installed in the checkout but not linked in the copy`
  }
  return null
}

/** Scratch directories under `root` that carry this tool's owner file. */
function ownedScratch(root) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => name.startsWith(SCRATCH_PREFIX) && existsSync(join(root, name, OWNER_FILE)))
    .map((name) => join(root, name))
}

/**
 * Remove every scratch copy a killed run left under `root`. Only directories this tool created
 * (prefix + owner file) are touched.
 *
 * @returns {string[]} names of the directories removed.
 */
export function cleanupScratch(root) {
  const removed = []
  for (const dir of ownedScratch(root)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    if (existsSync(dir))
      throw new ToolError(`could not remove the scratch copy ${dir.slice(root.length + 1)}`)
    removed.push(dir.slice(root.length + 1))
  }
  return removed
}

// ── running ───────────────────────────────────────────────────────────────────────────────────

/** Kill a detached child's whole process group; a group that is already gone is fine. */
function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // ESRCH: nothing left to kill.
  }
}

/** How many live processes have `pid` as their parent, or `null` when `ps` cannot say. */
function childCount(pid) {
  return new Promise((done) => {
    execFile(
      'ps',
      ['-A', '-o', 'pid=,ppid='],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (error, out) => {
        if (error) return done(null)
        done(out.split('\n').filter((line) => line.trim().split(/\s+/)[1] === String(pid)).length)
      }
    )
  })
}

/** Seconds a `node --test` runner may stay alive with no test process under it before it is stopped. */
export const STALL_SECONDS = 8
/** Seconds a test file may stay open with every registered case completed before it is ended. */
export const LINGER_SECONDS = 5

/** Completed cases and suites on record in a reporter file. */
const completedCases = (file) => progressCounts(file).completed

/** How many cases the reporter has seen registered and seen end so far (the file itself counts once). */
function progressCounts(file) {
  if (file === undefined || !existsSync(file)) return { enqueued: 0, completed: 0 }
  const text = readFileSync(file, 'utf8')
  return {
    enqueued: text.split('{"type":"enqueue"}').length - 1,
    completed: text.split('{"type":"complete"}').length - 1
  }
}

/**
 * Run one program to its end or to the deadline, in its own process group.
 *
 * `watchStall` is for a `node --test` runner. Measured 12/10/2026 on node 24.15, twice in six runs
 * of one file on a loaded machine: the test process had exited and written every result, and the
 * runner above it span at 90 % CPU without writing its summary until the deadline killed it 130 s
 * later. So a runner that had a child (or wrote records), has none for `STALL_SECONDS`, and is still alive is stopped
 * and reported as `stalled`; the caller runs the file once more instead of spending the budget.
 */
export function runProcess(
  command,
  args,
  {
    cwd,
    env,
    deadline,
    stdout,
    stderr,
    session,
    input,
    watchStall = false,
    stallSeconds = STALL_SECONDS,
    lingerSeconds = LINGER_SECONDS,
    progressFile
  }
) {
  return new Promise((resolveRun, rejectRun) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return resolveRun({ exit: null, signal: null, timedOut: true, seconds: 0 })
    const started = process.hrtime.bigint()
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', stdout, stderr]
    })
    session.children.add(child.pid)
    let timedOut = false
    let stalled = false
    let lingered = false
    let quiet = 0
    let lastProgress = ''
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child.pid)
    }, remaining)
    let seenChild = false
    // A test file that finishes within one poll is never seen as a child; the records it left are
    // the other sign that the runner got as far as running it.
    const wroteProgress = () =>
      progressFile !== undefined && (statSync(progressFile, { throwIfNoEntry: false })?.size ?? 0) > 0
    let idle = 0
    let polling = false
    const watch = !watchStall
      ? null
      : setInterval(() => {
          if (polling) return
          polling = true
          childCount(child.pid).then((count) => {
            polling = false
            // LINGERING: every registered case has completed, at least one did, nothing changed
            // for `lingerSeconds`, and the test process is still there (an open server, a timer).
            // Ending it here only saves the budget: the caller never reads a verdict from this run.
            const progress = progressCounts(progressFile)
            const key = `${String(progress.enqueued)}/${String(progress.completed)}`
            const idleFile = progress.completed >= 1 && progress.enqueued - progress.completed === 1
            quiet = idleFile && key === lastProgress ? quiet + 1 : 0
            lastProgress = key
            if (quiet >= lingerSeconds && !timedOut && !stalled) {
              lingered = true
              killGroup(child.pid)
              return
            }
            if (count === null) return
            if (count > 0) {
              seenChild = true
              idle = 0
            } else if (seenChild || wroteProgress()) idle += 1
            if (idle >= stallSeconds && !timedOut) {
              stalled = true
              killGroup(child.pid)
            }
          })
        }, 1000)
    child.on('error', (error) => {
      clearTimeout(timer)
      clearInterval(watch)
      session.children.delete(child.pid)
      rejectRun(new ToolError(`could not start ${command}: ${error.message}`))
    })
    child.on('close', (exit, signal) => {
      clearTimeout(timer)
      clearInterval(watch)
      // Whatever the test left running goes with it, before the tree under it is rewritten.
      killGroup(child.pid)
      session.children.delete(child.pid)
      resolveRun({
        exit,
        signal,
        timedOut,
        lingered,
        stalled,
        seconds: Number(process.hrtime.bigint() - started) / 1e9
      })
    })
    if (input !== undefined) child.stdin.end(input)
  })
}

function readRecords(path) {
  if (!existsSync(path)) return []
  const out = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line === '') continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // A line cut short by a kill: the missing `end` record already says the run is incomplete.
    }
  }
  return out
}

function tail(path) {
  if (!existsSync(path)) return ''
  const text = readFileSync(path, 'utf8')
  return text.length > MAX_LOG_BYTES
    ? `[first ${String(text.length - MAX_LOG_BYTES)} characters dropped]\n${text.slice(-MAX_LOG_BYTES)}`
    : text
}

/** The public shape of a run: what the result file keeps (the raw text stays in the log). */
function publicRun(run, command) {
  if (run === null) return null
  const { text: _text, browser: _browser, ...rest } = run
  return { ...rest, seconds: Math.round(run.seconds * 1000) / 1000, command }
}

/**
 * Prove one pair of commits. Returns the result object; throws `ToolError` when the tool fails.
 *
 * @param {object} options
 * @param {string} options.repo - the checkout (its `node_modules` are borrowed, nothing in it is written).
 * @param {string} options.base - ref of the tree without the change.
 * @param {string} options.head - ref of the tree with it.
 * @param {number} [options.budgetSeconds]
 * @param {string} [options.scratchRoot] - where the scratch copy is made; outside the repository.
 * @param {string} [options.out] - evidence directory; outside the repository. Nothing is kept without it.
 * @param {boolean} [options.enforce]
 */
export async function prove({
  repo,
  base,
  head,
  budgetSeconds = DEFAULT_BUDGET_SECONDS,
  scratchRoot = tmpdir(),
  out,
  enforce = false
}) {
  const started = Date.now()
  const deadline = started + budgetSeconds * 1000
  const top = git(repo, ['rev-parse', '--show-toplevel']).trim()
  const repoReal = realpathSync(top)
  refuseInsideRepo(repoReal, scratchRoot, '--scratch-root')
  if (out !== undefined) refuseInsideRepo(repoReal, out, '--out')
  const baseSha = resolveCommit(top, base)
  const headSha = resolveCommit(top, head)
  const changes = listChanges(top, baseSha, headSha)
  const manifest = buildManifest(changes)
  const growth = measureGrowth(top, changes)
  const caveats = []
  if (changes.some((c) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/.test(c.path)))
    caveats.push(
      'a lockfile changed: both runs use the dependencies installed in the checkout, so a fix that is a dependency version cannot show here'
    )
  if (manifest.submodules.length > 0)
    caveats.push(
      `a submodule pointer changed (${manifest.submodules.join(', ')}): its tree is linked only where the checkout holds that exact commit`
    )

  /** @type {Map<string, { head: any, withoutFix: any, headCommand: any, withoutFixCommand: any }>} */
  const runs = new Map(
    manifest.tests.map((t) => [
      t.file,
      { head: null, withoutFix: null, headCommand: null, withoutFixCommand: null }
    ])
  )
  const session = { children: new Set(), scratch: null }
  const logs = []
  let unavailableAtHead = []
  let unavailableWithoutFix = []
  let submoduleState = []
  let scratchLeft = false
  const treeResets = { count: 0, restoredFiles: 0, removedPaths: 0, dependencyLinksRebuilt: 0, seconds: 0 }

  const runnable = manifest.tests.filter((t) => SUITES.find((s) => s.id === t.suite)?.script)
  const onSignal = (signal) => {
    for (const pid of session.children) killGroup(pid)
    if (session.scratch) rmSync(session.scratch, { recursive: true, force: true, maxRetries: 3 })
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
  const onInt = () => onSignal('SIGINT')
  const onTerm = () => onSignal('SIGTERM')

  if (runnable.length > 0) {
    process.on('SIGINT', onInt)
    process.on('SIGTERM', onTerm)
    try {
      mkdirSync(scratchRoot, { recursive: true })
      const scratch = mkdtempSync(join(realpathSync(scratchRoot), SCRATCH_PREFIX))
      session.scratch = scratch
      writeFileSync(
        join(scratch, OWNER_FILE),
        `${JSON.stringify({ tool: SCHEMA, pid: process.pid, base: baseSha, head: headSha })}\n`
      )
      const tree = join(scratch, 'tree')
      const runsDir = join(scratch, 'runs')
      mkdirSync(runsDir)
      const quiet = { stdout: 'ignore', stderr: 'ignore', session }

      const env = { ...process.env }
      // Not ours to use (header): the altered tree runs against no database it did not start.
      delete env.TEST_DATABASE_URL
      // Inside `node --test` (this tool's own tests) the variable would make the child a sub-runner.
      delete env.NODE_TEST_CONTEXT
      // A git variable inherited from a hook would point the copy's git at the checkout.
      for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'])
        delete env[name]

      // 1. the head, whole, from git's own object store (never from the working tree). The copy
      // is a repository of its own, as a CI checkout is: tests that ask git for the tracked files
      // get the tree being run. Its objects are borrowed read-only (alternates); nothing a test
      // commits or stages can reach the checkout's repository. `-u` leaves each file's stat in the
      // index, which is what lets `resetTree` find what a test changed without reading 75 000 files.
      git(top, ['init', '-q', tree])
      const objects = git(top, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim()
      writeFileSync(join(tree, '.git', 'objects', 'info', 'alternates'), `${join(objects, 'objects')}\n`)
      git(tree, ['read-tree', headSha], { env })
      git(tree, ['update-ref', '--no-deref', 'HEAD', headSha], { env })
      const copied = await runProcess('git', ['checkout-index', '-a', '-u'], {
        cwd: tree,
        env,
        deadline,
        ...quiet
      })
      if (!copied.timedOut && copied.exit !== 0)
        throw new ToolError(`git checkout-index of ${headSha} exited ${String(copied.exit)}`)

      if (!copied.timedOut) {
        const headTree = readTree(top, headSha)
        submoduleState = headTree.gitlinks.map((g) => ({
          path: g.path,
          linkedAtHead: placeSubmodule(top, tree, g.path, g.sha)
        }))
        const { workspace: workspaceLinks, mirrors } = mirrorNodeModules(top, tree, [
          '.',
          ...headTree.packageDirs.filter((d) => d !== '.')
        ])
        // The commit each submodule path must be at in the current phase (`null`: no such path).
        const submoduleWant = new Map(headTree.gitlinks.map((g) => [g.path, g.sha]))
        // Named as a failure names them once the copy's own path is scrubbed: a package by its
        // quoted name, a directory by its path inside the tree.
        const unavailable = (phase) => [
          ...new Set([
            ...workspaceLinks
              .filter((l) => !existsSync(l.target))
              .flatMap((l) => [`'${l.name}'`, `${relative(tree, l.target).split(sep).join('/')}/`]),
            ...submoduleState
              .filter((m) => !(phase === 'head' ? m.linkedAtHead : (m.linkedWithoutFix ?? m.linkedAtHead)))
              .map((m) => `${m.path}/`)
          ])
        ]
        unavailableAtHead = unavailable('head')

        const runOne = async (file, phase) => {
          const command = suiteCommand(tree, file)
          if ('notRunnable' in command) return { command, run: null }
          const cwd = join(tree, command.cwd)
          // A stalled runner (see `runProcess`) gets the file one more time, never more.
          let attempt
          for (let tries = 1; tries <= 2; tries += 1) {
            attempt = await once(command, cwd, file, phase)
            if (!attempt.end.stalled) break
          }
          const classify = (a) =>
            classifyRun(readRecords(a.events), { ...a.end, file: command.argv.at(-1), cwd, tree })
          let run = classify(attempt)
          let ran = command
          if (attempt.end.lingered && command.forceExit) {
            // 🔒 A LINGERING RUN IS NEVER A VERDICT. The file had completed every registered case
            // and stayed open, so this tool ended it — but a run the runner did not finish says
            // nothing about what came after (a teardown, a late timer). The file is run again as
            // its suite runs it, with `--test-force-exit`, and THAT run is the one judged: the
            // runner finishes it and gives its own exit code. Because the flag can drop results,
            // it is accepted only when it reports exactly as many completed cases as the lingering
            // run saw; otherwise the row has no verdict.
            const seen = completedCases(attempt.events)
            ran = {
              ...command,
              argv: [...command.argv.slice(0, -1), '--test-force-exit', command.argv.at(-1)]
            }
            let again
            for (let tries = 1; tries <= 2; tries += 1) {
              again = await once(ran, cwd, file, phase)
              if (!again.end.stalled) break
            }
            run = classify(again)
            run.lingered = true
            run.forceExit = true
            // Whole by `wholenessProblem` like any run (inside `classify`), AND as many completed
            // cases as were seen: the runner's record of the file itself is one more completion.
            if (
              run.state !== 'timeout' &&
              run.state !== 'incomplete' &&
              completedCases(again.events) - 1 !== seen
            ) {
              run.state = 'incomplete'
              run.evidence = null
              run.dropped = true
            }
          }
          if (run.state === 'red') run.scratchLack = scratchLack(run.text, { repo: top, tree })
          return { command: ran, run }
        }
        /**
         * 🔒 EVERY RUN STARTS FROM THE TREE GIT DESCRIBES. One copy serves every run, so what a test
         * writes into it — a generated file, an edited fixture, a commit — would be read by the
         * next test and by the runs without the fix (a cache left by the head run can keep a test
         * green with the fix taken out). Before a used tree is run again or rewritten: the copy's
         * `.git` is put back as it was saved, every tracked file that differs from the index is
         * checked out again, and everything untracked is removed, ignored files and test-made
         * `node_modules` included. Only the `node_modules` this tool built and the submodule paths
         * stay, each put back to exactly what was recorded for it.
         */
        const pristine = join(scratch, 'git-pristine')
        const gitlinkPaths = new Set([...headTree.gitlinks.map((g) => g.path), ...manifest.submodules])
        const savePristine = () => {
          rmSync(pristine, { recursive: true, force: true })
          cpSync(join(tree, '.git'), pristine, { recursive: true })
          treeUsed = false
        }
        /** Put back a submodule path a test replaced, wrote into, or unlinked. */
        const restoreSubmodules = () => {
          let wrong = 0
          for (const [path, sha] of submoduleWant) {
            const at = join(tree, path)
            const stat = lstatSync(at, { throwIfNoEntry: false })
            if (sha === null) {
              if (stat === undefined) continue
              rmSync(at, { recursive: true, force: true })
            } else {
              const ok =
                submoduleHead(top, path) === sha
                  ? stat?.isSymbolicLink() && readlinkSync(at) === realpathSync(join(top, path))
                  : stat?.isDirectory() && readdirSync(at).length === 0
              if (ok) continue
              placeSubmodule(top, tree, path, sha)
            }
            wrong += 1
          }
          return wrong
        }
        const resetTree = () => {
          if (!treeUsed) return
          const resetStarted = process.hrtime.bigint()
          rmSync(join(tree, '.git'), { recursive: true, force: true })
          cpSync(pristine, join(tree, '.git'), { recursive: true })
          const changed = git(tree, ['diff-files', '--name-only', '-z'], { env })
            .split('\0')
            .filter((path) => path !== '' && !gitlinkPaths.has(path))
          for (const path of changed) rmSync(join(tree, path), { recursive: true, force: true })
          if (changed.length > 0) {
            git(tree, ['checkout-index', '-f', '-u', '-z', '--stdin'], {
              env,
              input: `${changed.join('\0')}\0`
            })
            copyFileSync(join(tree, '.git', 'index'), join(pristine, 'index'))
          }
          // Everything untracked goes, ignored files and any `node_modules` a test made included.
          // The only untracked things kept are the mirrors this tool built, named one by one, and
          // those are then held to their record entry by entry; the submodule paths likewise.
          const removed = git(tree, ['clean', '-ffdx', ...mirrors.flatMap((m) => ['-e', `/${m.dir}`])], {
            env
          })
            .split('\n')
            .filter((line) => line.startsWith('Removing ')).length
          const relinked = restoreMirrors(tree, mirrors) + restoreSubmodules()
          treeResets.count += 1
          treeResets.seconds =
            Math.round((treeResets.seconds + Number(process.hrtime.bigint() - resetStarted) / 1e9) * 1000) /
            1000
          treeResets.restoredFiles += changed.length
          treeResets.removedPaths += removed
          treeResets.dependencyLinksRebuilt += relinked
          treeUsed = false
        }
        let treeUsed = false
        savePristine()

        const once = async (command, cwd, file, phase) => {
          resetTree()
          treeUsed = true
          const events = join(runsDir, `${String(logs.length)}.jsonl`)
          const log = join(runsDir, `${String(logs.length)}.log`)
          const fd = openSync(log, 'w')
          const args = [
            ...command.argv.slice(0, -1),
            `--test-reporter=${REPORTER}`,
            `--test-reporter-destination=${events}`,
            command.argv.at(-1)
          ]
          let end
          try {
            end = await runProcess(process.execPath, args, {
              cwd,
              env: {
                ...env,
                PATH: `${join(cwd, 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${env.PATH ?? ''}`
              },
              deadline,
              stdout: fd,
              stderr: fd,
              session,
              watchStall: true,
              progressFile: events
            })
          } finally {
            closeSync(fd)
          }
          // The runner prints nothing with a file reporter; what the test wrote to stderr is in the
          // records, and belongs in the log a reader opens.
          const errors = readRecords(events)
            .filter((r) => r.type === 'stderr')
            .map((r) => r.text)
            .join('')
          if (errors !== '') appendFileSync(log, errors.replaceAll(`${tree}${sep}`, ''))
          logs.push({ file, phase, events, log })
          return { end, events }
        }

        // 2. every file at the head.
        for (const t of runnable) {
          const slot = runs.get(t.file)
          const { command, run } = await runOne(t.file, 'head')
          slot.headCommand = command
          slot.head = run
        }

        // 3. take the fix out, in place.
        const again = runnable.filter((t) => runs.get(t.file).head?.state === 'green')
        if (again.length > 0 && Date.now() < deadline) {
          // What the head runs left behind goes first; then the copy's index follows its files, so
          // what git lists there — and what `resetTree` restores — is the tree without the fix.
          resetTree()
          const byPath = new Map(changes.map((c) => [c.path, c]))
          const restore = []
          const indexInfo = []
          for (const entry of manifest.revertedToBase) {
            const change = byPath.get(entry.path)
            const inBase = change.status !== 'A'
            indexInfo.push(
              inBase
                ? `${change.baseMode} ${change.baseSha}\t${entry.path}`
                : `0 ${'0'.repeat(headSha.length)}\t${entry.path}`
            )
            if (entry.action === 'submodule-pointer') continue
            rmSync(join(tree, entry.path), { recursive: true, force: true })
            if (inBase) restore.push(entry.path)
          }
          if (indexInfo.length > 0)
            git(tree, ['update-index', '-z', '--index-info'], { env, input: `${indexInfo.join('\0')}\0` })
          if (restore.length > 0)
            git(tree, ['checkout-index', '-f', '-u', '-z', '--stdin'], {
              env,
              input: `${restore.join('\0')}\0`
            })
          const basePointers = new Map(readTree(top, baseSha).gitlinks.map((g) => [g.path, g.sha]))
          for (const path of manifest.submodules) {
            const linked = placeSubmodule(top, tree, path, basePointers.get(path) ?? '')
            submoduleWant.set(path, basePointers.get(path) ?? null)
            if (!basePointers.has(path)) rmSync(join(tree, path), { recursive: true, force: true })
            const state =
              submoduleState.find((s) => s.path === path) ??
              submoduleState[submoduleState.push({ path, linkedAtHead: false }) - 1]
            state.linkedWithoutFix = linked
          }
          unavailableWithoutFix = unavailable('without-fix')
          savePristine()

          // 4. the same files, without the fix.
          for (const t of again) {
            const slot = runs.get(t.file)
            const { command, run } = await runOne(t.file, 'without-fix')
            slot.withoutFixCommand = command
            slot.withoutFix = run
          }
        }
      }

      if (out !== undefined) {
        mkdirSync(join(out, 'logs'), { recursive: true })
        logs.forEach((entry, i) => {
          const name = `${String(i).padStart(3, '0')}-${entry.phase}-${entry.file.replace(/[^\w.-]+/g, '_')}.log`
          writeFileSync(join(out, 'logs', name), tail(entry.log))
        })
      }
    } finally {
      for (const pid of session.children) killGroup(pid)
      if (session.scratch) {
        try {
          rmSync(session.scratch, { recursive: true, force: true, maxRetries: 3 })
        } catch {
          // Reported below: a copy that is still there is a tool error whatever else happened.
        }
        scratchLeft = existsSync(session.scratch)
        session.scratch = null
      }
      process.off('SIGINT', onInt)
      process.off('SIGTERM', onTerm)
    }
    if (scratchLeft) throw new ToolError('could not remove the scratch copy')
  }

  const rows = []
  for (const t of manifest.tests) {
    const slot = runs.get(t.file)
    const fixed = suiteCommand('/nonexistent', t.file)
    const suiteHasScript = Boolean(SUITES.find((s) => s.id === t.suite)?.script)
    let verdict
    if (!suiteHasScript) verdict = { verdict: 'not-runnable', reason: fixed.notRunnable }
    else if (slot.headCommand && 'notRunnable' in slot.headCommand)
      verdict = { verdict: 'not-runnable', reason: slot.headCommand.notRunnable }
    else if (
      slot.head?.state === 'green' &&
      slot.withoutFixCommand &&
      'notRunnable' in slot.withoutFixCommand
    )
      verdict = { verdict: 'not-runnable', reason: `without the fix: ${slot.withoutFixCommand.notRunnable}` }
    else
      verdict = verdictOf(slot.head, slot.withoutFix, {
        unavailable: unavailableWithoutFix,
        unavailableAtHead
      })
    const command = (c) => (c && 'argv' in c ? { argv: ['node', ...c.argv], cwd: c.cwd } : null)
    rows.push({
      file: t.file,
      suite: t.suite,
      change: t.status === 'A' ? 'added' : 'edited',
      ...verdict,
      head: publicRun(slot.head, command(slot.headCommand)),
      withoutFix: publicRun(slot.withoutFix, command(slot.withoutFixCommand))
    })
  }
  for (const t of manifest.unsupportedTests)
    rows.push({
      file: t.file,
      suite: null,
      change: t.status === 'A' ? 'added' : 'edited',
      verdict: 'not-runnable',
      reason: 'no CI suite this tool knows runs this path',
      head: null,
      withoutFix: null
    })
  rows.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))

  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const row of rows) counts[row.verdict] += 1
  const overall =
    rows.length === 0
      ? 'no-tests'
      : (['proved', 'broken', 'unproved', 'not-runnable'].find((v) => counts[v] > 0) ?? 'no-tests')
  if (rows.length === 0) counts['no-tests'] = 1

  const secondsOf = (change) =>
    rows
      .filter((r) => r.change === change && r.head && ['green', 'red', 'not-executed'].includes(r.head.state))
      .reduce((sum, r) => sum + r.head.seconds, 0)
  if (rows.some((r) => r.head))
    growth.seconds = {
      measured: true,
      addedFiles: Math.round(secondsOf('added') * 1000) / 1000,
      editedFiles: Math.round(secondsOf('edited') * 1000) / 1000,
      filesWithoutANumber: rows
        .filter((r) => !r.head || r.head.state === 'timeout' || r.head.state === 'incomplete')
        .map((r) => r.file),
      source:
        'head runs of this proof, one file per process on this machine; not a prediction of what CI gains'
    }

  const result = {
    schema: SCHEMA,
    base: baseSha,
    head: headSha,
    budgetSeconds,
    enforce,
    overall,
    counts,
    rows,
    manifest: {
      keptAtHead: manifest.keptAtHead,
      revertedToBase: manifest.revertedToBase,
      catalogue: manifest.catalogue,
      treeResets,
      submodules: submoduleState.length > 0 ? submoduleState : manifest.submodules.map((path) => ({ path })),
      caveats
    },
    growth,
    wallSeconds: Math.round((Date.now() - started) / 100) / 10
  }
  result.enforceProblem = enforceProblem(result)
  if (out !== undefined) writeEvidence(out, 'result.json', 'summary.md', result, renderSummary(result))
  return result
}

function writeEvidence(out, jsonName, mdName, value, markdown) {
  try {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, jsonName), `${JSON.stringify(value, null, 2)}\n`)
    writeFileSync(join(out, mdName), markdown)
  } catch (error) {
    throw new ToolError(`could not write the evidence to ${out}: ${String(error?.message ?? error)}`)
  }
}

/**
 * Why `--enforce` would refuse this result, or `null`. Missing evidence is never a pass: a change
 * with no test, with only unrunnable tests, or proved only by a missing import is refused.
 */
export function enforceProblem(result) {
  if (result.rows.length === 0) return 'the change adds or edits no executable test file'
  const bad = result.rows.filter((r) => r.verdict === 'unproved' || r.verdict === 'broken')
  if (bad.length > 0) return `${bad.map((r) => `${r.file} is ${r.verdict}`).join('; ')}`
  if (!result.rows.some((r) => r.verdict === 'proved' && !r.weak))
    return 'no test file is proved by more than a missing import (the rest could not run)'
  return null
}

const cell = (text) =>
  String(text ?? '')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ')
const short = (sha) => sha.slice(0, 10)

/** The human summary of one result, generated from the same object as `result.json`. */
export function renderSummary(result) {
  const lines = [`### New-test proof: ${result.overall}`, '']
  lines.push(
    `\`${short(result.base)}\` → \`${short(result.head)}\` · ${String(result.rows.length)} test file(s) · ${result.wallSeconds.toFixed(1)} s of a ${String(result.budgetSeconds)} s budget · report-only${result.enforce ? ' + `--enforce`' : ''}`,
    ''
  )
  if (result.rows.length === 0) {
    lines.push(
      'This change adds or edits no executable test file (`no-tests`).' +
        (result.manifest.catalogue.length > 0
          ? ` It touches ${String(result.manifest.catalogue.length)} regression/QA catalogue file(s), which this tool does not run.`
          : ''),
      ''
    )
  } else {
    lines.push('| Test file | Verdict | What the two runs showed |', '|---|---|---|')
    for (const r of result.rows) {
      const verdict = r.verdict === 'proved' ? `proved (${r.evidence}${r.weak ? ', weaker' : ''})` : r.verdict
      lines.push(`| \`${cell(r.file)}\` | ${verdict} | ${cell(r.reason)} |`)
    }
    lines.push('')
  }
  for (const caveat of result.manifest.caveats) lines.push(`- ⚠ ${caveat}`)
  const resets = result.manifest.treeResets
  if (resets.restoredFiles + resets.removedPaths > 0)
    lines.push(
      `- Tests wrote into the scratch tree: ${String(resets.restoredFiles)} tracked file(s) restored and ${String(resets.removedPaths)} untracked path(s) removed before the next run.`,
      ''
    )
  if (result.manifest.caveats.length > 0) lines.push('')
  lines.push(growthLine(result.growth), '')
  lines.push(
    '`proved` says the file depends on the change it came with. It does not say each new case catches the defect, that the tests are not flaky, or that the fix is right.',
    ''
  )
  if (result.enforce)
    lines.push(
      result.enforceProblem ? `\`--enforce\`: REFUSED — ${result.enforceProblem}` : '`--enforce`: accepted',
      ''
    )
  return `${lines.join('\n')}\n`
}

// ── the replay over merged fixes ──────────────────────────────────────────────────────────────

/**
 * The most recent merged `fix` pull requests on a branch, from Git history alone: first-parent
 * merge commits `Merge pull request #N from <owner>/<branch>` whose body starts with the title,
 * judged by the same `prKind` as the Regression gate. A squash merge leaves no such commit and is
 * not seen.
 *
 * @returns {{ pr: number, merge: string, base: string, branch: string, title: string }[]} newest first.
 */
export function selectFixMerges(repo, ref, count) {
  const tip = resolveCommit(repo, ref)
  const log = git(repo, ['log', '--first-parent', '--merges', '--format=%H%x00%P%x00%s%x00%b%x1e', tip])
  const out = []
  for (const record of log.split('\x1e')) {
    const [sha, parents, subject, body] = record.replace(/^\n/, '').split('\0')
    const m = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(subject ?? '')
    if (!m) continue
    const title = (body ?? '').split('\n').find((line) => line.trim() !== '') ?? ''
    if (prKind(title, m[2]) !== 'fix') continue
    out.push({ pr: Number(m[1]), merge: sha, base: parents.split(' ')[0], branch: m[2], title: title.trim() })
    if (out.length === count) break
  }
  return out
}

const median = (values) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Run the proof over the last `count` merged fixes of `ref` and write `pilot.json` + `pilot.md`.
 * Every selected pull request is in the table, the unrunnable ones included.
 */
export async function runPilot({
  repo,
  ref,
  count,
  out,
  budgetSeconds = DEFAULT_BUDGET_SECONDS,
  scratchRoot,
  log = () => {}
}) {
  const top = git(repo, ['rev-parse', '--show-toplevel']).trim()
  refuseInsideRepo(realpathSync(top), out, '--out')
  const merges = selectFixMerges(top, ref, count)
  const prs = []
  for (const merge of merges) {
    log(`#${String(merge.pr)} ${merge.title}`)
    const result = await prove({
      repo: top,
      base: merge.base,
      head: merge.merge,
      budgetSeconds,
      scratchRoot,
      out: join(out, `pr-${String(merge.pr)}`)
    })
    prs.push({
      ...merge,
      overall: result.overall,
      wallSeconds: result.wallSeconds,
      rows: result.rows.map(({ head: _h, withoutFix: _w, ...row }) => row),
      growth: result.growth
    })
    log(`  ${result.overall} in ${result.wallSeconds.toFixed(1)} s`)
  }
  const fileCounts = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  const prCounts = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const pr of prs) {
    prCounts[pr.overall] += 1
    if (pr.rows.length === 0) fileCounts['no-tests'] += 1
    for (const row of pr.rows) fileCounts[row.verdict] += 1
  }
  const walls = prs.map((p) => p.wallSeconds)
  const pilot = {
    schema: `${SCHEMA}/pilot`,
    ref: resolveCommit(top, ref),
    asked: count,
    selected: prs.length,
    budgetSeconds,
    perPullRequest: prCounts,
    perTestFile: fileCounts,
    testFiles: prs.reduce((n, p) => n + p.rows.length, 0),
    wallSeconds: { median: median(walls), worst: walls.length > 0 ? Math.max(...walls) : null },
    prs
  }
  writeEvidence(out, 'pilot.json', 'pilot.md', pilot, renderPilot(pilot))
  return pilot
}

/** The pilot as a table: totals with their denominators, then every row. */
export function renderPilot(pilot) {
  const lines = [
    `### New-test proof over the last ${String(pilot.selected)} merged fix pull requests (asked for ${String(pilot.asked)})`,
    ''
  ]
  lines.push(
    `Tip \`${short(pilot.ref)}\`, each merge against its first parent, budget ${String(pilot.budgetSeconds)} s per pull request.`,
    ''
  )
  lines.push(
    '| Verdict | Pull requests (of ' +
      String(pilot.selected) +
      ') | Rows (' +
      String(pilot.testFiles) +
      ' test files + the pull requests without one) |',
    '|---|---|---|'
  )
  for (const v of VERDICTS)
    lines.push(`| ${v} | ${String(pilot.perPullRequest[v])} | ${String(pilot.perTestFile[v])} |`)
  lines.push(
    '',
    `Wall time per pull request: median ${pilot.wallSeconds.median?.toFixed(1) ?? '—'} s, worst ${pilot.wallSeconds.worst?.toFixed(1) ?? '—'} s.`,
    ''
  )
  lines.push('| PR | Overall | Wall s | Test file | Verdict | Detail |', '|---|---|---|---|---|---|')
  for (const pr of pilot.prs) {
    if (pr.rows.length === 0)
      lines.push(
        `| #${String(pr.pr)} | no-tests | ${pr.wallSeconds.toFixed(1)} | — | no-tests | ${cell(pr.title)} |`
      )
    for (const r of pr.rows)
      lines.push(
        `| #${String(pr.pr)} | ${pr.overall} | ${pr.wallSeconds.toFixed(1)} | \`${cell(r.file)}\` | ${r.verdict}${r.evidence ? ` (${r.evidence})` : ''} | ${cell(r.reason)} |`
      )
  }
  return `${lines.join('\n')}\n`
}

// ── command line ──────────────────────────────────────────────────────────────────────────────

const VALUE_FLAGS = [
  '--base',
  '--head',
  '--out',
  '--budget-seconds',
  '--scratch-root',
  '--repo',
  '--pilot',
  '--ref'
]
const BOOLEAN_FLAGS = ['--growth-only', '--enforce', '--cleanup']

/**
 * @param {readonly string[]} argv
 * @returns {Record<string, string|boolean> | { error: string }} a misspelt or repeated flag is refused.
 */
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag in out) return { error: `repeated argument: ${flag}` }
    if (BOOLEAN_FLAGS.includes(flag)) out[flag] = true
    else if (VALUE_FLAGS.includes(flag)) {
      const value = argv[i + 1]
      if (value === undefined || value === '') return { error: `${flag} needs a value` }
      out[flag] = value
      i += 1
    } else return { error: `unknown argument: ${flag}` }
  }
  const modes = ['--growth-only', '--cleanup', '--pilot'].filter((m) => m in out)
  if (modes.length > 1) return { error: `${modes.join(' and ')} cannot be combined` }
  if (out['--cleanup']) return out['--scratch-root'] ? out : { error: '--cleanup needs --scratch-root' }
  if ('--pilot' in out) {
    if (!/^[1-9]\d{0,3}$/.test(out['--pilot'])) return { error: '--pilot takes a count' }
    if (!out['--ref'] || !out['--out']) return { error: '--pilot needs --ref and --out' }
  } else if (!out['--base'] || !out['--head']) return { error: '--base and --head are required' }
  if ('--budget-seconds' in out && !/^[1-9]\d{0,4}$/.test(out['--budget-seconds']))
    return { error: '--budget-seconds takes whole seconds' }
  if (out['--growth-only'] && out['--enforce'])
    return { error: '--enforce judges a proof; --growth-only runs none' }
  return out
}

function say(markdown) {
  process.stdout.write(markdown)
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
    } catch (error) {
      throw new ToolError(`could not write the job summary: ${String(error?.message ?? error)}`)
    }
  }
}

async function main(argv) {
  const args = parseArgs(argv)
  if ('error' in args)
    throw new ToolError(`${args.error} (see the header of scripts/ci/new-test-proof.mjs)`, 2)
  const repo = resolve(args['--repo'] ?? process.cwd())
  const budgetSeconds = Number(args['--budget-seconds'] ?? DEFAULT_BUDGET_SECONDS)
  if (args['--cleanup']) {
    const removed = cleanupScratch(resolve(args['--scratch-root']))
    process.stdout.write(`new-test-proof: removed ${String(removed.length)} scratch copy(ies) left behind\n`)
    return 0
  }
  if ('--pilot' in args) {
    const pilot = await runPilot({
      repo,
      ref: args['--ref'],
      count: Number(args['--pilot']),
      out: resolve(args['--out']),
      budgetSeconds,
      scratchRoot: args['--scratch-root'] ? resolve(args['--scratch-root']) : undefined,
      log: (line) => process.stderr.write(`new-test-proof: ${line}\n`)
    })
    say(renderPilot(pilot))
    return 0
  }
  if (args['--growth-only']) {
    const top = git(repo, ['rev-parse', '--show-toplevel']).trim()
    const base = resolveCommit(top, args['--base'])
    const head = resolveCommit(top, args['--head'])
    const growth = measureGrowth(top, listChanges(top, base, head))
    const markdown = `### Test growth\n\n${growthLine(growth)}\n`
    if (args['--out']) {
      refuseInsideRepo(realpathSync(top), resolve(args['--out']), '--out')
      writeEvidence(
        resolve(args['--out']),
        'growth.json',
        'growth.md',
        { schema: `${SCHEMA}/growth`, base, head, growth },
        markdown
      )
    }
    say(markdown)
    return 0
  }
  const result = await prove({
    repo,
    base: args['--base'],
    head: args['--head'],
    budgetSeconds,
    scratchRoot: args['--scratch-root'] ? resolve(args['--scratch-root']) : undefined,
    out: args['--out'] ? resolve(args['--out']) : undefined,
    enforce: Boolean(args['--enforce'])
  })
  say(renderSummary(result))
  return result.enforce && result.enforceProblem ? 3 : 0
}

// realpath on both sides: a temp path on macOS is reached through a symlink (/var -> /private/var).
if (
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      const tool = error instanceof ToolError
      process.stderr.write(
        `new-test-proof: TOOL ERROR — ${tool ? error.message : String(error?.stack ?? error)}\n`
      )
      process.exit(tool ? error.exitCode : 1)
    }
  )
}
