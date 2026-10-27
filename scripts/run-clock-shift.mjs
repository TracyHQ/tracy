/**
 * Runs `node --test` files with the clock moved forward (`scripts/clock-shift.mjs`); names each red file.
 * WHY A MACHINE. A test that mints a credential at a fixed time and has it verified on the wall
 * clock is green on the day it is written and red for good once the TTL passes that date: the
 * 01/10/2026 cookie of `beta-operation-signal.test.mjs` cost four red runs from 04/10 (#838).
 * Reading the test does not show it; running it past the TTL does, however the test is written.
 * THE VERDICT IS THE CHILD'S EXIT CODE, NOTHING ELSE: 0 = the file holds on the moved clock; any
 * other exit, a signal or the time limit = it fails there. No report is read; the output goes
 * verbatim to one log per file. So a file that registers no test, or whose tests all skip
 * themselves (no PostgreSQL), exits 0 and was NOT checked.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { envWithoutGitLocation } from './check-push.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRELOAD = pathToFileURL(join(ROOT, 'scripts/clock-shift.mjs')).href
const FILE_TIMEOUT_MS = 600_000 // 50 × the slowest `test:workers` file alone (12.1 s, `test-timings.json`)
const USAGE = `usage: pnpm test:clock-shift <file> [<file> …]      the files named
       pnpm test:clock-shift --changed-since <ref>  test:workers files added or changed since <ref>
       pnpm test:clock-shift --all-workers          every test:workers file
       pnpm test:clock-shift --check-excluded       is every EXCLUDED file still red on the moved clock?
TRACY_TEST_CLOCK_OFFSET_DAYS sets the shift (default 400; 0 = control run on the real clock).
Exit 0 = no file failed · 1 = one did or could not start, or the run could not be prepared · 2 = usage.`
export const ADVICE =
  'a credential minted at a fixed time is being verified against real time — mint it with the verifier’s clock or inject the same clock into both.'

/**
 * `{ file, reason }`: files green on the real clock and red under the shift for a reason that is NOT
 * a credential clock mismatch, each with its measured reason. AN ENTRY EXCLUDES THE WHOLE FILE: it
 * is not run on the moved clock (printed as `EXCLUDED`), so a fixed-time credential added to it is
 * not seen here. `--check-excluded` (nightly) runs each one and is red for an entry whose file
 * exits 0: it must go. Measured 05/10/2026 without PostgreSQL: 14 of 804 `test:workers` files.
 */
const FILE_TIME = 'which the file system stamps on the real clock, with the moved Date.now()'
export const EXCLUDED = Object.freeze(
  Object.entries({
    'apps/tracy-host/test/app.test.mjs': `draining() in src/jobs.js compares the marker file's modification time, ${FILE_TIME}`,
    'apps/tracy-host/test/cms-log.test.mjs':
      'the EmDash log adapter runs as a child process without the preload: entries dated from the moved Date.now() are in its future',
    'apps/tracy-host/test/jobs.test.mjs': `draining() in src/jobs.js compares the marker file's modification time, ${FILE_TIME}`,
    'apps/tracy-web/test/brief-emdash.test.mjs': `createEmdashEngine() clears run folders by comparing their modification time, ${FILE_TIME}`,
    'apps/tracy-web/test/brief-guard.test.mjs':
      'NOT a clock the preload cannot move: guard.js accepts the current year ±1 and the test hard-codes 2025 and 2026, so this test goes red for real on 01/01/2027. Listed until it is repaired in its own change',
    'apps/tracy-web/test/site-comment-attachments.test.mjs':
      'PostgreSQL stamps created_at with its own now() on the real clock, and the sweep after each upload compares it with the moved Date.now(): the file just uploaded is swept as a day-old stray, so attaching it answers 404',
    'apps/tracy-web/test/website-opportunities-demo-runner.test.mjs':
      'PostgreSQL timestamps remain on the database clock while the preload shifts only JavaScript time. The runner compares shifted JS deadlines with fresh DB rows, so this file is a clock-domain fixture mismatch, not an expiry check.',
    'packages/cms/tracy-wordpress-theme/test/wp-contact-mail.test.mjs':
      'the rate-limit hour is computed by a PHP process on the real clock and compared with the hour of the moved Date.now()',
    'packages/core/tracy-core/test/lease.test.mjs': `draining() in src/lease compares the marker file's modification time, ${FILE_TIME}`,
    'packages/design/tracy-brand-engine/test/routes.test.mjs': `the writer lock is judged stale by comparing its modification time, ${FILE_TIME}`,
    'packages/fleet/tracy-fleet-operation/test/deploy-host-dsh-drain.test.mjs':
      'deploy-host-dsh.sh reads the real clock in a shell: lease heartbeats written from the moved Date.now() never go stale for it',
    'packages/fleet/tracy-fleet-operation/test/deploy-stack-drain.test.mjs':
      'deploy-tracy-stack.sh writes the marker end from the shell `date`, and the test compares it with the moved Date.now()',
    'packages/fleet/tracy-fleet-operation/test/webroot-git.test.mjs':
      'the test ages index.lock with utimes(moved Date.now() - n minutes) and webroot-git.sh judges it with `find -mmin` on the real clock',
    'packages/site/tracy-site-build-core/test/deploy-drain.test.mjs': `the build runner asks @tracy/core draining(), which compares the marker file's modification time, ${FILE_TIME}`,
    'packages/tools/tracy-site-tools/test/deploy-hold-restart.test.mjs': `the hold asks @tracy/core draining(), which compares the marker file's modification time, ${FILE_TIME}`,
    'packages/tools/tracy-site-tools/test/deploy-hold.test.mjs': `the hold asks @tracy/core draining(), which compares the marker file's modification time, ${FILE_TIME}`,
    'scripts/test/tracy-updater.test.mjs':
      'tracy-updater.sh judges the update slot, a stale answer and the backoff with the shell `date` on the real clock, and the test writes those times from the moved Date.now()'
  }).map(([file, reason]) => ({ file, reason }))
)

class UsageError extends Error {}

/** `{ mode: 'files', files }`, `{ mode: 'changed', ref }`, `{ mode: 'all' }` or `{ mode: 'excluded' }`. */
export function parseArgs(argv) {
  const plain = (arg) => arg !== '' && !arg.startsWith('-')
  const [flag, ref] = argv
  if (argv.length === 1 && flag === '--all-workers') return { mode: 'all' }
  if (argv.length === 1 && flag === '--check-excluded') return { mode: 'excluded' }
  if (argv.length === 2 && flag === '--changed-since' && plain(ref)) return { mode: 'changed', ref }
  // Never an empty file list: `node --test` with no file discovers the whole tree by itself.
  if (argv.length === 0 || !argv.every(plain)) throw new UsageError('one mode per run, spelled as below')
  return { mode: 'files', files: argv }
}

/** Throws unless the list is distinct `{ file, reason }` entries, each one exact test file. */
export function validateExclusions(list) {
  if (!Array.isArray(list)) throw new Error('EXCLUDED must be an array')
  // Segments of plain characters only: no pattern, no `.` or `..`, no leading or doubled slash.
  const exact = /^((?!\.\.?\/)[^*?[\]{}!\\/]+\/)*[^*?[\]{}!\\/]+\.test\.mjs$/
  for (const [index, entry] of list.entries()) {
    const { file, reason, ...more } = entry ?? {}
    const first = list.findIndex((other) => other?.file === file) === index
    const said = typeof reason === 'string' && reason.trim().length >= 20
    if (typeof file !== 'string' || !exact.test(file) || !said || !first || Object.keys(more).length > 0)
      throw new Error(`not one { file, reason } per exact *.test.mjs path: ${JSON.stringify(entry)}`)
  }
}

/**
 * The repository-relative path of a file that may be run, or throws why not. `lstat` first: a symlink
 * is refused, a FIFO never opened. Then real paths: a file behind a symlinked directory is where it is.
 */
export function validateFile(root, file) {
  const abs = resolve(root, file)
  const stat = fs.lstatSync(abs, { throwIfNoEntry: false })
  if (!stat) throw new Error('does not exist')
  if (!stat.isFile()) throw new Error(stat.isSymbolicLink() ? 'is a symbolic link' : 'is not a regular file')
  fs.accessSync(abs, fs.constants.R_OK)
  const rel = relative(fs.realpathSync(root), fs.realpathSync(abs))
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('is outside the repository')
  return rel.split(sep).join('/')
}

/**
 * `test:workers` files added or modified since the merge base of `ref` and HEAD: committed, staged,
 * unstaged and (the second list) written but not yet `git add`ed. A rename is a delete plus an
 * add; every status but a deletion is listed (`d`), a type change (link to file) too. Throws when
 * git cannot say: never an empty list instead.
 */
export function changedFiles({ root, ref, workers, git }) {
  // In `root`, whatever repository a calling hook pointed `GIT_DIR` at.
  const options = { cwd: root, env: envWithoutGitLocation(process.env), encoding: 'utf8' }
  git ??= (args) => execFileSync('git', args, { ...options, maxBuffer: 64 * 1024 * 1024 })
  const base = git(['merge-base', ref, 'HEAD']).trim()
  if (!/^[0-9a-f]{40,64}$/.test(base)) throw new Error(`git merge-base ${ref} HEAD did not name a commit`)
  const changed = new Set()
  const lists = [['diff', '--name-only', '-z', '--no-renames', '--diff-filter=d', base, '--']]
  for (const args of [...lists, ['ls-files', '--others', '--exclude-standard', '-z']]) {
    const out = git(args)
    if (typeof out !== 'string' || (out !== '' && !out.endsWith('\0')))
      throw new Error(`git ${args[0]} ended mid-name: the list of changed files is incomplete`)
    for (const name of out.split('\0')) if (name !== '') changed.add(name)
  }
  return workers.filter((file) => changed.has(file)).sort()
}

const running = new Set()
/** Stops children with their own test processes: each child is a process-group leader (`detached`). */
export function killRunning(children = running) {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

/**
 * One file, one `node --test` child under the preload, with the flags `test:workers` passes; its
 * output goes straight to `log` (throws when that cannot be opened or closed). `null` = exit 0, a
 * string = what ended it, an Error = it never started (no verdict). Settles once: late events are ignored.
 */
export async function runFile({ root, file, log, env, spawnChild = spawn, timeoutMs = FILE_TIMEOUT_MS }) {
  const fd = fs.openSync(log, 'w')
  const late = `still running after ${timeoutMs / 1000} s: stopped`
  let child, timer
  const why = await new Promise((settle) => {
    // Without this a runner started from inside `node --test` gets a child that runs NO file and
    // exits 0: node takes the inherited variable for a recursive run and skips it.
    const { NODE_TEST_CONTEXT: _, ...childEnv } = env
    const args = ['--import', PRELOAD, '--test', '--test-timeout=120000', '--test-force-exit', file]
    const options = { cwd: root, env: childEnv, stdio: ['ignore', fd, fd], detached: true }
    child = spawnChild(process.execPath, args, options)
    running.add(child)
    timer = setTimeout(settle, timeoutMs, late)
    child.on('error', settle)
    child.on('close', (code, sig) => settle(code === 0 ? null : sig ? `killed by ${sig}` : `exit ${code}`))
  }).catch((error) => error) // a spawn that throws is the same as one that emits `error`
  clearTimeout(timer)
  if (why === late) killRunning([child])
  running.delete(child)
  fs.closeSync(fd)
  return why
}

// The list `check-tests.ts` shards. Strict: an unlistable directory throws, never a shorter list.
const defaultWorkers = async () => (await import('./check-tests.ts')).workersFiles({ strict: true })

/** The CLI, with its edges injectable so the suite can run it on a scratch tree. Returns the exit code. */
export async function main(argv, deps = {}) {
  const { root = ROOT, env = process.env, workers = defaultWorkers, excluded = EXCLUDED } = deps
  const { out = (text) => process.stdout.write(text), git, spawnChild, timeoutMs, probe = spawnSync } = deps
  const say = (text) => out(`clock-shift: ${text}\n`)
  const [files, skipped, red] = [new Set(), new Set(), []]
  const check = argv[0] === '--check-excluded'
  try {
    const args = parseArgs(argv)
    // The preload loaded once with nothing to run: a refused offset is said once, not once per file.
    // A probe that never ran or was killed says nothing about the offset: red, but no usage error.
    const probed = probe(process.execPath, ['--import', PRELOAD, '-e', ''], { env, encoding: 'utf8' })
    const died = probed.error?.message ?? probed.signal
    if (died) throw new Error(`the preload could not be tried: ${died}`)
    if (probed.status !== 0)
      throw new UsageError(/^Error: (.*)$/m.exec(probed.stderr ?? '')?.[1] ?? 'the preload did not load')
    validateExclusions(excluded)
    const reasons = new Map(excluded.map((entry) => [entry.file, entry.reason]))
    const listed = args.mode === 'all' || args.mode === 'changed'
    const found = listed ? await workers() : [...reasons.keys()]
    if (!Array.isArray(found) || (listed && found.length === 0))
      throw new Error('the test:workers file list is empty: discovery is broken, nothing can be selected')
    const changed = args.mode === 'changed' && changedFiles({ root, ref: args.ref, workers: found, git })
    for (const name of args.files ?? (changed || found)) {
      try {
        const file = validateFile(root, name)
        ;(!check && reasons.has(file) ? skipped : files).add(file)
      } catch (error) {
        red.push(`${name} — refused before running: ${error.message}`)
      }
    }
    for (const file of skipped) say(`EXCLUDED ${file} — ${reasons.get(file)}`)
    for (const line of red) say(`FAIL ${line}`)
    const base = resolve(env.TRACY_CLOCK_SHIFT_LOG_DIR || tmpdir())
    fs.mkdirSync(base, { recursive: true })
    const logs = fs.mkdtempSync(join(base, 'clock-shift-'))
    const days = env.TRACY_TEST_CLOCK_OFFSET_DAYS ?? '400'
    say(`${files.size} file(s) to run with the clock moved ${days} day(s) forward; logs in ${logs}`)
    const queue = files.values() // one iterator for every lane: each file is taken once
    const lane = async () => {
      for (const file of queue) {
        const log = join(logs, `${encodeURIComponent(file)}.log`)
        const started = performance.now()
        const why = await runFile({ root, file, log, env, spawnChild, timeoutMs })
        const seconds = ((performance.now() - started) / 1000).toFixed(1)
        const unrun = why instanceof Error && `could not start: ${why.message}`
        const line = `${file} — ${unrun || (why ?? 'exit 0')}, ${seconds} s, log ${log}`
        // Red: a file that fails; for `--check-excluded` one that does not; always, a child that never started.
        if (unrun || (why === null) === check) red.push(line)
        // A failing file's whole log, verbatim: on a CI runner the file is out of the reader's reach.
        if (why !== null && !check) out(`${fs.readFileSync(log, 'utf8')}\n`)
        const verdict = check ? ['NO LONGER NEEDED', 'STILL NEEDED'] : ['HOLDS', 'FAIL']
        say(`${unrun ? 'NOT RUN' : verdict[why === null ? 0 : 1]} ${line}`)
      }
    }
    // As `test:workers`, one file per core but one (05/10/2026: in turn, 424 of 804 files took 480 s).
    const jobs = deps.jobs ?? (args.mode === 'all' ? Math.max(1, availableParallelism() - 1) : 1)
    await Promise.all(Array.from({ length: jobs }, lane))
  } catch (error) {
    files.clear() // ends every lane: a log that cannot be written stops the whole run, red
    killRunning()
    const usage = error instanceof UsageError
    say(usage ? `${error.message}\n${USAGE}` : `the run stopped: ${error.message.trim()}`)
    return usage ? 2 : 1
  }
  say(`${files.size} run, ${skipped.size} excluded, ${red.length} red; a self-skipped test was NOT checked`)
  if (red.length === 0) return 0
  const advice = check ? 'remove from EXCLUDED every file that exits 0 here.' : `the usual cause: ${ADVICE}`
  say(`RED:\n${red.map((line) => `  ${line}\n`).join('')}Each file's log decides; ${advice}`)
  return 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1))
  process.on('exit', () => killRunning())
  process.exitCode = await main(process.argv.slice(2))
}
