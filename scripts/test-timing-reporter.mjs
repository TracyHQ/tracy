/**
 * A second `node --test` reporter, run BESIDE the usual one, that says two things the usual one
 * leaves out (08/10/2026, #1028):
 *
 *   1. which tests the runner selected and then did not run (`skip`, `todo`), with the file and the
 *      reason each one gave, so a test that silently skips on this machine is in the log by name;
 *   2. with `TRACY_TEST_TIMING=1`, how long each test FILE took, one line per file, so the shard
 *      table (`scripts/test-timings.json`) can be filled from the CI runners' own numbers.
 *
 * WHY A REPORTER. Measured on run 37707424087: the `spec` reporter prints a duration per TEST and
 * no file name, so the logs of past runs cannot say what a file cost. A sum of test durations is
 * not that number either: it leaves out process start, imports and `before()` hooks, which is
 * exactly what makes the heavy files heavy (run 36596428799: a table built from such sums put 123 s
 * of work on the shard it thought was light).
 *
 * WHAT COUNTS AS A FILE. With process isolation the runner reports each file as a test of its own:
 * `test:complete` at nesting 0, at line 1 column 1, whose name is the file's path as it was given
 * on the command line (measured on node 24.15: `apps/x/test/a.test.mjs` for that argument, not the
 * base name). Its duration is the child process from start to exit. Nothing else is ever counted
 * as a file: a test's duration is never a file's. Two such records for one file contradict each
 * other, so that file gets a `conflict` line and no number.
 *
 * 🔒 IT ADDS LINES, IT DECIDES NOTHING. The usual reporter still prints what it printed, and the
 * exit code is the runner's. Everything here is inside a `try`: a fault in this file becomes one
 * `reporter error` line, never a different verdict. The one refusal is made BEFORE a suite starts:
 * `TCH_TEST_ARTIFACTS_DIR` naming a place the report cannot be kept (`scratchRoot`).
 *
 * Wire it with `spawnReported()` (or `reporterArgs()` for the bare arguments); the lines are read
 * back by `parseTimingLog()` in `scripts/update-test-timings.mjs`.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SELF), '..')

/** The marker every timing line starts with; the version is part of it on purpose. */
export const TIMING_MARK = 'tracy-test-timing v1'
/**
 * How the two lines start that say this reporter failed or left nothing. The table reader refuses
 * any run whose log carries either, so they are spelt once, here.
 */
export const REPORTER_FAULT = 'check-tests: reporter error (the test verdict is unaffected)'
export const NO_REPORT = 'check-tests: this run left NO skip/timing report'
/**
 * The last line of every block the reporter hands over. A report file that does not end with it was
 * cut short (or never written to), and `spawnReported` says so instead of printing it as whole.
 */
export const REPORT_END = 'check-tests: end of the skip/timing report'

/**
 * The `node --test` arguments that keep the usual output and add this reporter beside it.
 *
 * @returns {string[]} four arguments, to place before the test files.
 */
export function reporterArgs() {
  return [
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    `--test-reporter=${SELF}`,
    '--test-reporter-destination=stdout'
  ]
}

/** Repo-relative with forward slashes; a file outside the repo keeps its absolute path. */
function nameOf(file) {
  if (typeof file !== 'string' || file === '') return '(unknown file)'
  const rel = relative(ROOT, file)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return file
  return rel.split(sep).join('/')
}

/** One line, whatever a test name or a reason contains. */
const oneLine = (text) =>
  String(text)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()

/**
 * Collects the runner's events and renders the report. Exported so the rules can be tested on
 * hand-made events, late, duplicated and interleaved ones included.
 */
export function createCollector({ timing = false, cwd = process.cwd() } = {}) {
  /** @type {Map<string, { seconds: number, ok: boolean }[]>} */
  const files = new Map()
  /** @type {{ kind: 'SKIP'|'TODO', file: string, line: unknown, name: string, why: string }[]} */
  const notRun = []
  const faults = []

  function isFileRecord(data) {
    return (
      data.nesting === 0 &&
      data.line === 1 &&
      data.column === 1 &&
      typeof data.file === 'string' &&
      typeof data.name === 'string' &&
      data.name !== '' &&
      resolve(cwd, data.name) === data.file
    )
  }

  return {
    /** @param {{ type: string, data?: any }} event */
    add(event) {
      try {
        const data = event?.data
        if (!data || typeof data !== 'object') return
        if (event.type === 'test:complete' && isFileRecord(data)) {
          const ms = data.details?.duration_ms
          const list = files.get(data.file) ?? []
          list.push({
            seconds: typeof ms === 'number' ? ms / 1000 : Number.NaN,
            ok: data.details?.passed === true
          })
          files.set(data.file, list)
          return
        }
        if (event.type !== 'test:pass' && event.type !== 'test:fail') return
        // A file's own record carries neither flag, so it never lands in this list.
        const skipped = data.skip !== undefined && data.skip !== false
        const todo = data.todo !== undefined && data.todo !== false
        if (!skipped && !todo) return
        const reason = skipped ? data.skip : data.todo
        notRun.push({
          kind: skipped ? 'SKIP' : 'TODO',
          file: nameOf(data.file),
          line: data.line,
          name: oneLine(data.name),
          why: typeof reason === 'string' && reason.trim() !== '' ? oneLine(reason) : '(no reason given)'
        })
      } catch (error) {
        faults.push(String(error instanceof Error ? error.message : error))
      }
    },

    /** @returns {string} the whole report, ending in a newline; empty when there is nothing to say. */
    render() {
      const out = []
      try {
        if (notRun.length > 0) {
          out.push(
            `check-tests: ${String(notRun.length)} test(s) were selected and NOT run (skip/todo) — file:line › name — reason:`
          )
          const rows = notRun
            .map((s) => `check-tests:   ${s.kind} ${s.file}:${String(s.line ?? '?')} › ${s.name} — ${s.why}`)
            .sort()
          out.push(...rows)
        } else {
          out.push('check-tests: 0 tests were selected and not run (no skip, no todo) in this run.')
        }
        if (timing) {
          let counted = 0
          let summed = 0
          const lines = []
          for (const file of [...files.keys()].sort()) {
            const records = files.get(file)
            const name = nameOf(file)
            if (/\s/.test(name)) {
              lines.push(`${TIMING_MARK} conflict file=${JSON.stringify(name)} reason=whitespace-in-path`)
              continue
            }
            if (records.length !== 1) {
              lines.push(`${TIMING_MARK} conflict file=${name} reason=${String(records.length)}-file-records`)
              continue
            }
            const { seconds, ok } = records[0]
            // Under half a millisecond prints as 0.000, which is no measurement of a process.
            if (!Number.isFinite(seconds) || seconds < 0.0005) {
              lines.push(`${TIMING_MARK} conflict file=${name} reason=no-usable-duration`)
              continue
            }
            counted += 1
            summed += seconds
            lines.push(`${TIMING_MARK} file=${name} seconds=${seconds.toFixed(3)} ok=${ok ? '1' : '0'}`)
          }
          out.push(...lines)
          out.push(`${TIMING_MARK} files=${String(counted)} summed=${summed.toFixed(3)}`)
        }
      } catch (error) {
        faults.push(String(error instanceof Error ? error.message : error))
      }
      for (const fault of faults.slice(0, 3)) {
        out.push(`${REPORTER_FAULT}: ${oneLine(fault)}`)
      }
      return out.length === 0 ? '' : `${out.join('\n')}\n`
    }
  }
}

/**
 * Is this the run's closing line? The runner ends every run with eight run-level diagnostics
 * (`tests`, `suites`, … `duration_ms`); the last one is the last event a forced run delivers.
 */
function closesTheRun(event) {
  const data = event?.data
  return (
    event?.type === 'test:diagnostic' &&
    data?.nesting === 0 &&
    data.file === undefined &&
    typeof data.message === 'string' &&
    data.message.startsWith('duration_ms ')
  )
}

/** Where a parent asked for the report to be left (`spawnReported`), instead of the output stream. */
const SINK = 'TRACY_TEST_REPORT_FILE'

/**
 * Hand the block over, closed by `REPORT_END`: appended to the parent's file in one synchronous
 * call when there is one, otherwise returned to be written to the reporter's own destination.
 */
function deliver(text) {
  if (text === '') return text
  const block = `${text}${REPORT_END}\n`
  const sink = process.env[SINK]
  if (!sink) return block
  try {
    appendFileSync(sink, block)
    return ''
  } catch (error) {
    return `${block}${REPORTER_FAULT}: could not write ${sink}: ${oneLine(error?.code ?? error)}\n`
  }
}

/**
 * Is this the text of a report file that was written whole? Every block ends with `REPORT_END` on
 * a line of its own, so a whole file ends with that line; an empty file, or one whose last block
 * was cut anywhere before it, does not.
 *
 * @param {string|null} text
 * @returns {boolean}
 */
export function isWholeReport(text) {
  return typeof text === 'string' && (text === `${REPORT_END}\n` || text.endsWith(`\n${REPORT_END}\n`))
}

/**
 * The reporter `node --test` loads: silent while the run lasts, one block when it ends.
 *
 * 🔒 THE BLOCK IS HANDED OVER ON THE RUN'S CLOSING DIAGNOSTIC, SYNCHRONOUSLY. The gate runs with
 * `--test-force-exit`, which ends the process as soon as the last test is done. Measured on node
 * 24.15: the cumulative `test:summary` event is never delivered to a forced run, nothing written
 * after the event stream closes is printed, and a block written to a PIPE through the reporter's
 * stream was lost whole at 600 files (0 of 600 lines; to a file, 600 of 600). The run-level
 * `duration_ms` diagnostic is the line the usual reporter prints last and it does arrive, so the
 * block is appended there, in one synchronous call, to the file `spawnReported` named.
 */
export default async function* timingReporter(source) {
  const collector = createCollector({ timing: process.env.TRACY_TEST_TIMING === '1' })
  let written = false
  try {
    for await (const event of source) {
      collector.add(event)
      if (!written && closesTheRun(event)) {
        written = true
        // One write for the whole block, so the usual reporter's lines cannot land inside it.
        yield deliver(collector.render())
      }
    }
  } catch (error) {
    yield deliver(`${REPORTER_FAULT}: ${oneLine(error instanceof Error ? error.message : error)}\n`)
  }
  // A runner that sends no closing diagnostic still gets the report, when the process lives that long.
  if (!written) yield deliver(collector.render())
}

/**
 * Write all of `text` to stdout before returning. `process.stdout.write` to a pipe is queued on
 * some platforms, and the gate calls `process.exit` right after a red part: a queued report would
 * be cut at the pipe's buffer (measured on macOS: 435 of 1 200 lines). A full pipe answers
 * `EAGAIN`; wait for the reader and go on.
 */
export function printNow(text) {
  const bytes = Buffer.from(text, 'utf8')
  let at = 0
  let waits = 0
  while (at < bytes.length) {
    try {
      at += writeSync(1, bytes, at, bytes.length - at)
      waits = 0
    } catch (error) {
      if (error?.code !== 'EAGAIN' || ++waits > 2000) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
}

/** Names the directory a run was told to keep its scratch files in; unset means the system's. */
export const ARTIFACTS_DIR = 'TCH_TEST_ARTIFACTS_DIR'

/**
 * Where the report file of one run is kept while the run lasts.
 *
 * 🔒 A NAMED PLACE IS USED OR REFUSED, NEVER REPLACED. With `TCH_TEST_ARTIFACTS_DIR` set, the
 * scratch goes there; a value that is not a directory this process can write to throws, so the
 * report is not quietly left in the system's temporary directory or in the worktree. `TMPDIR` is
 * never changed: the suites under test keep their own.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} an existing directory.
 */
export function scratchRoot(env = process.env) {
  const named = env[ARTIFACTS_DIR]
  if (named === undefined || named === '') return tmpdir()
  const refuse = (why) =>
    new Error(
      `${ARTIFACTS_DIR}=${named} cannot hold the test report (${why}); nothing was run and no other place is used`
    )
  if (!isAbsolute(named)) throw refuse('not an absolute path')
  let stat
  try {
    stat = statSync(named)
  } catch (error) {
    throw refuse(oneLine(error?.code ?? error))
  }
  if (!stat.isDirectory()) throw refuse('not a directory')
  try {
    rmSync(mkdtempSync(join(named, 'tracy-test-probe-')), { recursive: true, force: true })
  } catch (error) {
    throw refuse(oneLine(error?.code ?? error))
  }
  return named
}

/**
 * Run one `node --test` command (its argv already carrying `reporterArgs()`) and print the report
 * it left, after the command's own output. The verdict is the command's: `status`, `signal` and
 * `error` are returned untouched.
 *
 * A run that leaves no report is SAID, not hidden: its skips were not listed and, for a shard, the
 * table reader refuses it. The same goes for a report that is there but empty or cut short (no
 * `REPORT_END` as its last line): what it holds is printed, followed by the `NO_REPORT` line, and
 * `report` is null, so half a list of skips is never taken for the list.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [options] - `stdio` defaults to `inherit`.
 * @param {(text: string) => void} [print] - where the report goes; stdout unless a test captures it.
 * @returns {import('node:child_process').SpawnSyncReturns<any> & { report: string|null }}
 */
export function spawnReported(command, args, options = {}, print = printNow) {
  const dir = mkdtempSync(join(scratchRoot(), 'tracy-test-report-'))
  const file = join(dir, 'report.txt')
  try {
    const run = spawnSync(command, args, {
      stdio: 'inherit',
      ...options,
      env: { ...(options.env ?? process.env), [SINK]: file }
    })
    let found = null
    try {
      found = readFileSync(file, 'utf8')
    } catch {
      found = null
    }
    if (isWholeReport(found)) {
      print(found)
      return { ...run, report: found }
    }
    if (found === null) {
      print(
        `${NO_REPORT} (it ended before its closing line, or never started): its skipped tests are not listed.\n`
      )
    } else {
      const kept = found === '' || found.endsWith('\n') ? found : `${found}\n`
      print(
        `${kept}${NO_REPORT} that is whole (the report file is ${found === '' ? 'empty' : 'cut short: the lines above are all it holds'}): its skipped tests are not all listed.\n`
      )
    }
    return { ...run, report: null }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
