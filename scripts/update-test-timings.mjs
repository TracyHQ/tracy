/**
 * Fill `scripts/test-timings.json` from the CI runners' own numbers, and check that it still is them.
 *
 * WHERE THE NUMBERS COME FROM. Each workers shard of `Tracy CI` prints, through
 * `scripts/test-timing-reporter.mjs`, one `tracy-test-timing v1 file=… seconds=…` line per test
 * file (the child process from start to exit: process start, imports, `before()` hooks and tests),
 * bracketed by `begin`/`end` lines that carry the shard and its wall seconds; the last shard also
 * prints what `rest` (interop + dsh-passwords) took. This script reads those lines out of
 * `gh run view --log` for green pull-request runs into `develop` and writes, per file, the MEDIAN
 * over at least three runs.
 *
 * 🔒 NEVER FROM A LAPTOP. This script used to time each file on the machine it ran on. A table
 * measured that way on macOS was reverted (`7cdbcfb46`): it split the runners' shards 225 s / 457 s
 * where the hand-typed one gave 358 s / 352 s. There is no local mode any more, on purpose.
 *
 * 🔒 NO NUMBER IS EVER MADE UP. A file with fewer than three eligible samples, a run that is not a
 * green Linux pull-request run into `develop`, a shard whose records are cut short, duplicated or
 * contradict each other: each is refused with its reason, the table on disk stays as it was, and
 * the exit code is not 0. "GitHub could not be read" is exit 3 (nothing was learnt), never "the
 * logs carry no durations".
 *
 * Two units. A file's seconds are measured while several files run at once, so a shard's wall clock
 * is `wallPerSummedSecond` × the sum of its files (the median of wall ÷ sum over the same runs).
 * `rest` is wall seconds; `shardOf` balances in summed seconds, so the last shard is preloaded with
 * `restWallSeconds ÷ wallPerSummedSecond`.
 *
 * Usage (needs `gh`, signed in, and the workspace installed):
 *   node --import tsx scripts/update-test-timings.mjs [--runs N] [--repo owner/name]   # refresh
 *   node --import tsx scripts/update-test-timings.mjs --check-ci                       # verify, writes nothing
 * Exit: 0 done · 1 refused (reason on stderr) · 2 bad arguments · 3 GitHub could not be read.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CI_REPOSITORY } from './ci/ci-repository.mjs'
import { NO_REPORT, REPORTER_FAULT, TIMING_MARK } from './test-timing-reporter.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = fileURLToPath(import.meta.url)
export const TABLE_PATH = join(ROOT, 'scripts/test-timings.json')

/** A file's weight needs this many independent green runs. Lowering it is loosening the table. */
export const MIN_SAMPLES = 3
/** The two `tests` jobs may be predicted this far apart, in seconds, and no further. */
export const BALANCE_LIMIT_SECONDS = 30
const MAX_TABLE_BYTES = 5 * 1024 * 1024
const WORKFLOW = 'tracy-ci.yml'

/** GitHub could not be read: nothing was learnt, which is a different answer from "refused". */
export class UnknownError extends Error {}

const USAGE =
  'usage: node --import tsx scripts/update-test-timings.mjs [--check-ci] [--runs N] [--repo owner/name]'

/**
 * @param {readonly string[]} argv - arguments after the script name.
 * @returns {{ mode: 'refresh'|'check', runs: number, repo: string } | { error: string }}
 */
export function parseArgs(argv) {
  const out = { mode: 'refresh', runs: 5, repo: CI_REPOSITORY }
  const seen = new Set()
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (seen.has(flag)) return { error: `${flag} given twice` }
    seen.add(flag)
    if (flag === '--check-ci') out.mode = 'check'
    else if (flag === '--runs') {
      const raw = argv[++i]
      if (raw === undefined || !/^[1-9]\d{0,2}$/.test(raw)) return { error: '--runs needs a whole number' }
      out.runs = Number(raw)
      if (out.runs < MIN_SAMPLES) return { error: `--runs must be at least ${String(MIN_SAMPLES)}` }
    } else if (flag === '--repo') {
      const raw = argv[++i]
      if (raw === undefined || !/^[\w.-]+\/[\w.-]+$/.test(raw)) return { error: '--repo needs owner/name' }
      out.repo = raw
    } else return { error: `unknown argument: ${flag}` }
  }
  if (out.mode === 'check' && seen.has('--runs'))
    return { error: '--check-ci reads the runs the table names; --runs does not apply' }
  return out
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
}
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

/**
 * The name of the job that runs workers shard `index` of `of` (and, for the last one, `rest`).
 *
 * 🔒 ONE SPELLING, COMPARED WHOLE. `refusal` finds exactly one green Linux job of this name in the
 * run's own job list, and the log reader takes shard and `rest` lines from a job of exactly this
 * name. A suffix match would let any other job whose name ends in `(tests i/n)` supply the sample.
 */
export const shardJobName = (index, of) => `build check (tests ${String(index)}/${String(of)})`

/** One line of `gh run view --log`: job, step, timestamp, message. Nothing else is a log line. */
const LOG_LINE = /^([^\t]+)\t([^\t]*)\t\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z (.*)$/

/** Seconds as the gate prints them: three decimals, and more than nothing. */
const positive = (text) => (Number(text) > 0 ? Number(text) : null)

/**
 * Read the timing lines out of one run's log (`gh run view --log`: `job<TAB>step<TAB>timestamp text`).
 *
 * 🔒 ONE STRICT FORM. Every line that carries the marker ANYWHERE must be a whole log line whose
 * message is one of the six records below; any other such line (a cut prefix, a marker quoted in
 * another line's text, a payload this reader does not know) refuses the run by name. A damaged
 * record that was merely skipped would look like a record that was never printed. The same goes for
 * the reporter's own fault lines: a run in which it said it failed is not a sample.
 *
 * Every shard is judged whole: any duplicated, stray or missing record refuses that shard with the
 * reason, because a shard that lost lines would otherwise look like a shard whose files were fast.
 * A duration of 0.000 is not a measurement (no process starts and exits in under half a
 * millisecond) and is refused like a missing one.
 *
 * @param {string} text
 * @returns {{ marked: number, shards: { job: string, index: number, of: number, wall: number|null,
 *   files: Map<string, number>, summed: number|null, problems: string[] }[], rest: { job: string, wall: number }[],
 *   problems: string[] }}
 */
export function parseTimingLog(text) {
  const shards = []
  const rest = []
  const problems = []
  /** @type {Map<string, any>} the shard each job has open */
  const open = new Map()
  let marked = 0
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '')
    const fault = line.includes(REPORTER_FAULT) || line.includes(NO_REPORT)
    const carries = line.includes(TIMING_MARK)
    if (!fault && !carries) continue
    const shown = line.slice(0, 120)
    if (fault) {
      problems.push(`the reporter said it failed, so its lines are not a measurement: ${shown}`)
      continue
    }
    marked += 1
    const whole = LOG_LINE.exec(line)
    if (!whole) {
      problems.push(
        `a line carries the timing marker but is not a log line (job, step, time, text): ${shown}`
      )
      continue
    }
    const job = whole[1]
    const message = whole[3]
    if (!message.startsWith(`${TIMING_MARK} `)) {
      problems.push(
        `${job}: the timing marker is inside another line, which cannot be told from a damaged record: ${shown}`
      )
      continue
    }
    const payload = message.slice(TIMING_MARK.length + 1)
    const shard = open.get(job)
    let m
    if ((m = /^begin part=workers shard=(\d+)\/(\d+) files=(\d+)$/.exec(payload))) {
      if (shard) shard.problems.push('a second begin before its end')
      const next = {
        job,
        index: Number(m[1]),
        of: Number(m[2]),
        declared: Number(m[3]),
        wall: null,
        files: new Map(),
        summed: null,
        counted: null,
        problems: shard ? ['began inside another shard'] : []
      }
      shards.push(next)
      open.set(job, next)
    } else if ((m = /^end part=workers shard=(\d+)\/(\d+) wall=(\d+\.\d{3})$/.exec(payload))) {
      if (!shard) problems.push(`${job}: an end line with no begin`)
      else {
        if (shard.index !== Number(m[1]) || shard.of !== Number(m[2]))
          shard.problems.push('end names another shard')
        shard.wall = positive(m[3])
        if (shard.wall === null) shard.problems.push('the end line gives no wall time (0.000 s)')
        open.delete(job)
      }
    } else if ((m = /^file=(\S+) seconds=(\d+\.\d{3}) ok=([01])$/.exec(payload))) {
      if (!shard) problems.push(`${job}: a file record outside a shard (${m[1]})`)
      else if (shard.files.has(m[1])) shard.problems.push(`two records for ${m[1]}`)
      else if (m[3] !== '1') shard.problems.push(`${m[1]} was red`)
      else if (positive(m[2]) === null) shard.problems.push(`${m[1]} has no measured time (0.000 s)`)
      else shard.files.set(m[1], Number(m[2]))
    } else if ((m = /^files=(\d+) summed=(\d+\.\d{3})$/.exec(payload))) {
      if (!shard) problems.push(`${job}: a summary line outside a shard`)
      else if (shard.counted !== null) shard.problems.push('two summary lines')
      else {
        shard.counted = Number(m[1])
        shard.summed = Number(m[2])
      }
    } else if ((m = /^part=rest wall=(\d+\.\d{3})$/.exec(payload))) {
      if (positive(m[1]) === null) problems.push(`${job}: rest gives no wall time (0.000 s)`)
      else rest.push({ job, wall: Number(m[1]) })
    } else if (payload.startsWith('conflict ')) {
      if (shard) shard.problems.push(`the reporter refused a file: ${payload.slice(9)}`)
      else problems.push(`${job}: a conflict line outside a shard`)
    } else {
      if (shard) shard.problems.push(`unreadable line: ${payload.slice(0, 80)}`)
      else problems.push(`${job}: unreadable line: ${payload.slice(0, 80)}`)
    }
  }
  for (const shard of shards) {
    if (shard.wall === null) shard.problems.push('no end line: the shard was red or the log is cut short')
    if (shard.counted === null) shard.problems.push('no summary line')
    else if (shard.counted !== shard.files.size)
      shard.problems.push('the summary counts other files than were listed')
    if (shard.declared !== shard.files.size)
      shard.problems.push(
        `${String(shard.declared)} files were started, ${String(shard.files.size)} reported`
      )
    if (shard.of < 1 || shard.index < 1 || shard.index > shard.of)
      shard.problems.push('impossible shard number')
    const sum = [...shard.files.values()].reduce((a, b) => a + b, 0)
    if (shard.summed !== null && Math.abs(sum - shard.summed) > 0.001 * (shard.files.size + 1))
      shard.problems.push('the summed seconds do not match the file records')
    if (!(sum > 0)) shard.problems.push('no measured time')
    const expected = shardJobName(shard.index, shard.of)
    if (shard.job !== expected) shard.problems.push(`printed by job "${shard.job}", not "${expected}"`)
  }
  return { marked, shards, rest, problems }
}

const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)
const isId = (v) => Number.isInteger(v) && v > 0
const sameRepo = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()

/**
 * The ONE pull request a run ran for, or the reason it cannot be named.
 *
 * A branch name alone ties nothing: another pull request (a fork's, a later one reusing the name)
 * can carry the same `head.ref`. So the pull request must live in this repository on both ends,
 * its head must be the very commit the run built, and there must be exactly one such; the run's
 * own `pull_requests`, when GitHub still lists them, must name the same one.
 *
 * @param {any} run
 * @param {any[]} pulls - `GET /repos/{repo}/commits/{head_sha}/pulls`.
 * @param {string} repo
 * @returns {{ number: number, base: string } | { refused: string }}
 */
export function pullOf(run, pulls, repo) {
  const mine = pulls.filter(
    (p) =>
      p?.head?.ref === run.head_branch &&
      sameRepo(p?.head?.repo?.full_name, repo) &&
      sameRepo(p?.base?.repo?.full_name, repo)
  )
  if (mine.length === 0)
    return { refused: `no pull request of its branch in ${repo} holds its commit, so its base is unknown` }
  if (mine.length !== 1)
    return {
      refused: `${String(mine.length)} pull requests of its branch hold its commit (${mine.map((p) => `#${String(p?.number)} into ${String(p?.base?.ref)}`).join(', ')}): which one it ran for cannot be told`
    }
  const pr = mine[0]
  if (!isId(pr.number) || typeof pr.base?.ref !== 'string')
    return { refused: 'its pull request has no usable number and base' }
  if (pr.head.sha !== run.head_sha)
    return {
      refused: `pull request #${String(pr.number)} now ends at another commit than the run built, so the two cannot be tied`
    }
  const own = Array.isArray(run.pull_requests) ? run.pull_requests : []
  if (
    own.length > 0 &&
    !(own.length === 1 && own[0]?.number === pr.number && own[0]?.head?.sha === run.head_sha)
  )
    return { refused: `the run names other pull request(s) than #${String(pr.number)}` }
  return { number: pr.number, base: pr.base.ref }
}

/**
 * Is this run one whose numbers may enter the table? Reads the REST API's run, pulls and jobs objects.
 *
 * The base comes from the pull requests of the run's head commit (`pullOf`), not from the run's own
 * `pull_requests`: GitHub empties that list once the pull request is closed (read on run
 * 37707424087 an hour after its PR merged), which is every run old enough to be a sample.
 *
 * 🔒 EVERY SAMPLE IS TIED TO ONE REPOSITORY, WORKFLOW FILE, PULL REQUEST, COMMIT, RUN AND ATTEMPT.
 * The run and its head live in `repo`; every job in the list says it belongs to this run id, this
 * attempt and this commit (the checks `scripts/check-pr-merge.mjs` makes before a merge).
 *
 * @param {any} run - `GET /repos/{repo}/actions/runs/{id}`.
 * @param {{ pulls: any[]|null, jobs: any[]|null }} more - `GET /commits/{head_sha}/pulls` and the
 *   jobs of the run's attempt; null for a part not read yet (the run's own fields are judged first).
 * @param {number} shardCount
 * @param {string} repo - owner/name the samples must come from.
 * @returns {string|null} the reason it is refused, or null.
 */
export function refusal(run, { pulls, jobs }, shardCount, repo) {
  if (!run || typeof run !== 'object') return 'no run data'
  if (!isId(run.id)) return 'no usable run id'
  if (run.event !== 'pull_request') return `event is ${String(run.event)}, not pull_request`
  if (run.status !== 'completed' || run.conclusion !== 'success')
    return `not a green run (${String(run.status)}/${String(run.conclusion)})`
  if (!isId(run.run_attempt)) return 'no usable attempt number'
  if (typeof run.head_branch !== 'string' || !isSha(run.head_sha)) return 'no usable head branch and commit'
  if (run.path !== `.github/workflows/${WORKFLOW}`)
    return `it is a run of ${String(run.path)}, not of .github/workflows/${WORKFLOW}`
  if (!sameRepo(run.repository?.full_name, repo))
    return `it belongs to ${String(run.repository?.full_name)}, not ${repo}`
  if (!sameRepo(run.head_repository?.full_name, repo))
    return `its head lives in ${String(run.head_repository?.full_name)}: a fork's run cannot be tied to a pull request here`
  if (pulls === null) return null
  const pr = pullOf(run, pulls, repo)
  if ('refused' in pr) return pr.refused
  if (pr.base !== 'develop') return `pull request #${String(pr.number)} base is ${pr.base}, not develop`
  if (jobs === null) return null
  if (jobs.length === 0) return 'its attempt lists no job'
  for (const job of jobs) {
    if (job?.run_id !== run.id || job?.run_attempt !== run.run_attempt || job?.head_sha !== run.head_sha)
      return `job "${String(job?.name)}" belongs to another run, attempt or commit than run ${String(run.id)} attempt ${String(run.run_attempt)}`
  }
  for (let i = 1; i <= shardCount; i++) {
    const name = shardJobName(i, shardCount)
    const found = jobs.filter((j) => j?.name === name)
    if (found.length !== 1) return `${String(found.length)} job(s) named "${name}"`
    if (found[0].conclusion !== 'success') return `"${name}" is ${String(found[0].conclusion)}`
    const labels = Array.isArray(found[0].labels) ? found[0].labels : []
    if (!labels.includes('linux'))
      return `"${name}" did not run on a linux runner (${labels.join(', ') || 'no labels'})`
  }
  return null
}

/**
 * One run's sample out of its parsed log, or the reason it has none.
 *
 * @returns {{ files: Map<string, number>, factors: number[], rest: number } | { refused: string }}
 */
export function sampleOf(parsed, shardCount) {
  if (parsed.problems.length > 0) return { refused: parsed.problems[0] }
  if (parsed.marked === 0)
    return { refused: 'its log has no tracy-test-timing line (it ran before the reporter was wired in)' }
  if (parsed.shards.length !== shardCount)
    return { refused: `${String(parsed.shards.length)} shard(s) reported, ${String(shardCount)} expected` }
  const files = new Map()
  const factors = []
  const seen = new Set()
  for (const shard of parsed.shards) {
    if (shard.problems.length > 0)
      return { refused: `shard ${String(shard.index)}/${String(shard.of)}: ${shard.problems[0]}` }
    if (shard.of !== shardCount)
      return { refused: `it ran ${String(shard.of)} shards, not ${String(shardCount)}` }
    if (seen.has(shard.index)) return { refused: `shard ${String(shard.index)} reported twice` }
    seen.add(shard.index)
    let sum = 0
    for (const [file, seconds] of shard.files) {
      if (files.has(file)) return { refused: `${file} ran in two shards` }
      files.set(file, seconds)
      sum += seconds
    }
    factors.push(shard.wall / sum)
  }
  if (parsed.rest.length !== 1)
    return { refused: `${String(parsed.rest.length)} rest timing line(s), 1 expected` }
  const last = shardJobName(shardCount, shardCount)
  if (parsed.rest[0].job !== last)
    return { refused: `rest was timed by "${parsed.rest[0].job}", not the last shard's job "${last}"` }
  for (const value of [...factors, parsed.rest[0].wall])
    if (!Number.isFinite(value) || !(value > 0)) return { refused: 'a duration is not a usable number' }
  return { files, factors, rest: parsed.rest[0].wall }
}

/**
 * The table from run samples: per current workers file, the median over the runs that measured it.
 *
 * @param {object} input
 * @param {readonly string[]} input.files - the workers files of the tree being planned.
 * @param {{ id: number, attempt: number, headSha: string, pr: number, files: Map<string, number>, factors: number[], rest: number }[]} input.runs
 * @param {string} input.repo
 * @returns {{ table: object } | { refused: string, short: { file: string, samples: number }[] }}
 */
export function tableFromSamples({ files, runs, repo }) {
  const ids = new Set(runs.map((r) => r.id))
  if (ids.size !== runs.length) return { refused: 'the same run is counted twice', short: [] }
  if (runs.length < MIN_SAMPLES)
    return {
      refused: `${String(runs.length)} eligible run(s) with telemetry; ${String(MIN_SAMPLES)} are needed`,
      short: []
    }
  const out = {}
  const short = []
  for (const file of [...new Set(files)].sort()) {
    const samples = runs.filter((r) => r.files.has(file)).map((r) => r.files.get(file))
    if (samples.length < MIN_SAMPLES) short.push({ file, samples: samples.length })
    // The measured median, at the precision it was measured in: never a floor of this script's own.
    else out[file] = round(median(samples), 3)
  }
  if (short.length > 0)
    return {
      refused: `${String(short.length)} workers file(s) have fewer than ${String(MIN_SAMPLES)} samples, e.g. ${short
        .slice(0, 3)
        .map((s) => `${s.file} (${String(s.samples)})`)
        .join(', ')}`,
      short
    }
  const wallPerSummedSecond = round(median(runs.flatMap((r) => r.factors)), 4)
  const restWallSeconds = round(median(runs.map((r) => r.rest)), 3)
  if (!(wallPerSummedSecond > 0)) return { refused: 'the wall/summed factor is not positive', short: [] }
  const table = {
    _about:
      'Seconds of each test:workers file as the CI runners measured it (the child process from start to exit, several files at once), the median over the runs listed in source (each a run id, its attempt, its commit and the pull request into develop it ran for). GENERATED by scripts/update-test-timings.mjs from the tracy-test-timing lines of green Tracy CI pull-request runs into develop; never typed, never measured on a laptop. shardOf balances shards by it. wallPerSummedSecond = median of (a shard wall seconds / the sum of its files). restWallSeconds = median wall of rest (interop + dsh-passwords) on the last shard; preloadLastShardSeconds = restWallSeconds / wallPerSummedSecond, the same figure in the unit shardOf balances in. Verify: node --import tsx scripts/update-test-timings.mjs --check-ci',
    source: {
      kind: 'ci',
      repo,
      workflow: WORKFLOW,
      event: 'pull_request',
      base: 'develop',
      minSamples: MIN_SAMPLES,
      runs: runs
        .map((r) => ({ id: r.id, attempt: r.attempt, headSha: r.headSha, pr: r.pr }))
        .sort((a, b) => a.id - b.id)
    },
    wallPerSummedSecond,
    restWallSeconds,
    preloadLastShardSeconds: round(restWallSeconds / wallPerSummedSecond, 3),
    files: out
  }
  const bad = tableProblems(table)
  return bad.length > 0 ? { refused: bad[0], short: [] } : { table }
}

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)

/** Every reason a parsed table cannot be used. An empty list is the only good answer. */
export function tableProblems(table) {
  const problems = []
  if (!table || typeof table !== 'object' || Array.isArray(table)) return ['the table is not an object']
  const files = table.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) return ['the table has no files object']
  for (const [file, seconds] of Object.entries(files)) {
    if (!isNumber(seconds) || seconds <= 0)
      problems.push(`${file}: ${JSON.stringify(seconds)} is not a positive number of seconds`)
    if (problems.length >= 5) break
  }
  if (!isNumber(table.preloadLastShardSeconds) || table.preloadLastShardSeconds < 0)
    problems.push('preloadLastShardSeconds is not a number of seconds')
  if (table.source !== undefined) {
    const s = table.source
    if (!s || typeof s !== 'object' || s.kind !== 'ci')
      problems.push('source is present but is not { kind: "ci", … }')
    else {
      if (
        !isNumber(table.wallPerSummedSecond) ||
        table.wallPerSummedSecond <= 0 ||
        table.wallPerSummedSecond > 10
      )
        problems.push('wallPerSummedSecond is not a usable factor')
      if (!isNumber(table.restWallSeconds) || table.restWallSeconds <= 0)
        problems.push('restWallSeconds is not a positive number of seconds')
      if (s.minSamples !== MIN_SAMPLES) problems.push(`source.minSamples is not ${String(MIN_SAMPLES)}`)
      const runs = Array.isArray(s.runs) ? s.runs : []
      const ids = new Set(runs.map((r) => r?.id))
      if (runs.length < MIN_SAMPLES || ids.size !== runs.length)
        problems.push(`source.runs must name at least ${String(MIN_SAMPLES)} different runs`)
      if (runs.some((r) => !isId(r?.id) || !isId(r?.attempt) || !isSha(r?.headSha) || !isId(r?.pr)))
        problems.push('source.runs has an entry without id, attempt, headSha and pr')
      if (typeof s.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(s.repo))
        problems.push('source.repo is not owner/name')
      if (problems.length === 0) {
        const want = table.restWallSeconds / table.wallPerSummedSecond
        if (Math.abs(want - table.preloadLastShardSeconds) > 0.001)
          problems.push(
            'preloadLastShardSeconds is not restWallSeconds / wallPerSummedSecond: the rest overhead is in the wrong unit'
          )
      }
    }
  }
  return problems
}

/**
 * Open `path` as the plain file this script may read or replace, and judge the thing that was
 * OPENED, never the name.
 *
 * 🔒 NO CHECK-THEN-OPEN. A name judged with `lstat` and opened afterwards can be swapped in between
 * for a symbolic link or a FIFO. So the open itself refuses a link (`O_NOFOLLOW`), cannot block on
 * a FIFO (`O_NONBLOCK`), and the type and size are read from the descriptor (`fstat`).
 *
 * @returns {{ fd: number, stat: import('node:fs').BigIntStats } | { error: string }} the caller closes `fd`.
 */
function openRegular(path) {
  let fd
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  } catch (error) {
    if (error.code === 'ELOOP' || error.code === 'EMLINK') return { error: `${path} is a symbolic link` }
    return { error: `cannot open ${path}: ${error.code ?? error.message}` }
  }
  let reason = null
  try {
    const stat = fstatSync(fd, { bigint: true })
    if (stat.isDirectory()) reason = `${path} is a directory`
    else if (!stat.isFile()) reason = `${path} is not a regular file`
    else if (stat.size === 0n) reason = `${path} is empty`
    else if (stat.size > BigInt(MAX_TABLE_BYTES)) reason = `${path} is larger than a timing table can be`
    else return { fd, stat }
  } catch (error) {
    reason = `cannot stat ${path}: ${error.code ?? error.message}`
  }
  closeSync(fd)
  return { error: reason }
}

/** Why `path` is not a plain file this script may read or replace, or null. */
export function notARegularFile(path) {
  const opened = openRegular(path)
  if ('error' in opened) return opened.error
  closeSync(opened.fd)
  return null
}

/** Which file a descriptor or a name is, and whether it was written since: what a replace is tied to. */
const identityOf = (stat) => ({
  dev: stat.dev,
  ino: stat.ino,
  size: stat.size,
  mtimeNs: stat.mtimeNs,
  ctimeNs: stat.ctimeNs
})
const sameIdentity = (a, b) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeNs === b.mtimeNs &&
  a.ctimeNs === b.ctimeNs

/**
 * @param {string} path
 * @returns {{ table: any, bytes: string, id: ReturnType<typeof identityOf> } | { error: string }}
 */
export function readTable(path = TABLE_PATH) {
  const opened = openRegular(path)
  if ('error' in opened) return opened
  let bytes
  try {
    bytes = readFileSync(opened.fd, 'utf8')
  } catch (error) {
    return { error: `cannot read ${path}: ${error.code ?? error.message}` }
  } finally {
    closeSync(opened.fd)
  }
  let table
  try {
    table = JSON.parse(bytes)
  } catch {
    return { error: `${path} is not JSON (cut short or malformed)` }
  }
  const problems = tableProblems(table)
  return problems.length > 0
    ? { error: `${path}: ${problems[0]}` }
    : { table, bytes, id: identityOf(opened.stat) }
}

/**
 * Replace the table in one step, or leave it exactly as it was.
 *
 * The new bytes go to a fresh file beside it (created exclusively, flushed, read back and
 * validated), and only a `rename` puts them in place, so a reader never sees half a table. A lock
 * file refuses a second refresh running at once.
 *
 * 🔒 THE REPLACE IS TIED TO THE FILE THAT WAS READ. `expect` is what `readTable` returned: its bytes
 * and the identity (device, inode, size, write and change times) of the file they came from. Under
 * the lock the table is opened once more (same rules as a read) and must be that very file with
 * those bytes; the descriptor stays open so the inode cannot be reused, and right before the
 * rename the NAME must still be that file, unwritten. A name that became a link, another file or a
 * file written in place is refused and stays as its writer left it. Refreshes are serialised by the
 * lock; a writer that ignores the lock and lands between that last look and the rename is the one
 * window POSIX `rename` leaves open.
 *
 * @param {string} path
 * @param {object} table
 * @param {{ bytes: string, id: ReturnType<typeof identityOf> }} expect - from `readTable(path)`.
 * @param {{ beforeRename?: () => void }} [hooks] - for tests: runs after the last read, before the last look.
 * @returns {string|null} the reason nothing was written, or null.
 */
export function writeTableAtomic(path, table, expect, hooks = {}) {
  const not = notARegularFile(path)
  if (not) return not
  const bad = tableProblems(table)
  if (bad.length > 0) return `refusing to write an invalid table: ${bad[0]}`
  if (typeof expect?.bytes !== 'string' || !expect.id)
    return 'nothing says which table this update was computed from'
  const changed = `${path} changed while this refresh ran: nothing written, run it again`
  const lock = `${path}.lock`
  let lockFd
  try {
    lockFd = openSync(lock, 'wx')
  } catch (error) {
    return error.code === 'EEXIST'
      ? `${lock} exists: another refresh is running (remove it only if that run is gone)`
      : `cannot create ${lock}: ${error.code ?? error.message}`
  }
  const temp = `${path}.tmp-${String(process.pid)}-${randomBytes(6).toString('hex')}`
  let tempMade = false
  let held = null
  try {
    const opened = openRegular(path)
    if ('error' in opened) return opened.error
    held = opened.fd
    if (!sameIdentity(identityOf(opened.stat), expect.id)) return changed
    if (readFileSync(held, 'utf8') !== expect.bytes) return changed
    const fd = openSync(temp, 'wx')
    tempMade = true
    try {
      writeSync(fd, `${JSON.stringify(table, null, 2)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    const back = readTable(temp)
    if ('error' in back) return `the new table did not read back: ${back.error}`
    hooks.beforeRename?.()
    const now = lstatSync(path, { bigint: true })
    if (now.isSymbolicLink() || !now.isFile() || !sameIdentity(identityOf(now), expect.id)) return changed
    renameSync(temp, path)
    tempMade = false
    return null
  } catch (error) {
    return `could not write the table: ${error.code ?? error.message}`
  } finally {
    if (held !== null) closeSync(held)
    if (tempMade) {
      try {
        unlinkSync(temp)
      } catch {
        // Nothing to remove.
      }
    }
    closeSync(lockFd)
    try {
      unlinkSync(lock)
    } catch {
      // Already gone.
    }
  }
}

/**
 * What the table predicts for the `tests` jobs of one tree, and every reason it may not be trusted.
 *
 * @param {object} input
 * @param {readonly string[]} input.files - the workers files, from `workersFiles()`.
 * @param {any} input.table - a table that passed `tableProblems`.
 * @param {(files: readonly string[], shard: { index: number, of: number }, timings: any) => string[]} input.shardOf
 *   the gate's own split, so the prediction and the run cannot disagree about who owns a file.
 * @param {number} input.shardCount
 * @returns {{ ok: boolean, problems: string[], seconds: number[], spread: number|null }}
 */
export function predictBalance({ files, table, shardOf, shardCount }) {
  const problems = []
  if (!Number.isInteger(shardCount) || shardCount < 2)
    return { ok: false, problems: ['fewer than two shards to compare'], seconds: [], spread: null }
  const known = table.files
  const missing = files.filter((f) => !(f in known))
  const stale = Object.keys(known).filter((f) => !files.includes(f))
  if (missing.length > 0)
    problems.push(
      `${String(missing.length)} of ${String(files.length)} workers files are not in the table, e.g. ${missing.slice(0, 3).join(', ')}`
    )
  if (stale.length > 0)
    problems.push(
      `${String(stale.length)} table entries name files that are gone, e.g. ${stale.slice(0, 3).join(', ')}`
    )
  if (table.source?.kind !== 'ci')
    problems.push(
      'the table is not CI-derived (no source.kind "ci"): its numbers predict nothing about the runners'
    )
  if (problems.length > 0) return { ok: false, problems, seconds: [], spread: null }
  const timings = { files: known, preloadLastShardSeconds: table.preloadLastShardSeconds }
  const seconds = []
  let assigned = 0
  for (let index = 1; index <= shardCount; index++) {
    const mine = shardOf(files, { index, of: shardCount }, timings)
    if (mine.length === 0) problems.push(`shard ${String(index)}/${String(shardCount)} gets no file`)
    assigned += mine.length
    const summed = mine.reduce((sum, f) => sum + known[f], 0)
    seconds.push(
      round(summed * table.wallPerSummedSecond + (index === shardCount ? table.restWallSeconds : 0), 1)
    )
  }
  if (assigned !== new Set(files).size) problems.push('the shards do not add up to the file list')
  const spread = round(Math.max(...seconds) - Math.min(...seconds), 1)
  if (!Number.isFinite(spread)) problems.push('the prediction is not a number')
  else if (spread > BALANCE_LIMIT_SECONDS)
    problems.push(
      `the jobs are predicted ${String(spread)} s apart, over the ${String(BALANCE_LIMIT_SECONDS)} s limit`
    )
  return { ok: problems.length === 0, problems, seconds, spread }
}

/** `gh` as this script uses it: read-only, bounded, and a failure is `UnknownError`, never data. */
export function realGh(args) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      timeout: 180_000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    const said = String(error.stderr ?? error.message ?? error)
      .trim()
      .split('\n')
      .slice(-2)
      .join(' ')
    throw new UnknownError(`gh ${args.slice(0, 3).join(' ')} failed: ${said || 'no output'}`)
  }
}

function ghJson(gh, args) {
  const text = gh(args)
  try {
    return JSON.parse(text)
  } catch {
    throw new UnknownError(`gh ${args.slice(0, 3).join(' ')} answered something that is not JSON`)
  }
}

/** One run, read whole: eligible → its sample; anything else → the reason. Throws `UnknownError`. */
function readRun(gh, repo, run, shardCount) {
  const early = refusal(run, { pulls: null, jobs: null }, shardCount, repo)
  if (early) return { refused: early }
  const listed = ghJson(gh, [
    'api',
    '--method',
    'GET',
    `repos/${repo}/commits/${run.head_sha}/pulls?per_page=100`
  ])
  if (!Array.isArray(listed))
    throw new UnknownError(`run ${String(run.id)}: the pull request list is not a list`)
  const based = refusal(run, { pulls: listed, jobs: null }, shardCount, repo)
  if (based) return { refused: based }
  const jobs = ghJson(gh, [
    'api',
    '--method',
    'GET',
    `repos/${repo}/actions/runs/${String(run.id)}/attempts/${String(run.run_attempt)}/jobs?per_page=100`
  ])
  if (!Array.isArray(jobs?.jobs)) throw new UnknownError(`run ${String(run.id)}: the job list is not a list`)
  const late = refusal(run, { pulls: listed, jobs: jobs.jobs }, shardCount, repo)
  if (late) return { refused: late }
  const pr = pullOf(run, listed, repo)
  if ('refused' in pr) return pr
  const log = gh([
    'run',
    'view',
    String(run.id),
    '--repo',
    repo,
    '--attempt',
    String(run.run_attempt),
    '--log'
  ])
  if (typeof log !== 'string' || log.trim() === '')
    throw new UnknownError(`run ${String(run.id)}: the log came back empty`)
  const sample = sampleOf(parseTimingLog(log), shardCount)
  if ('refused' in sample) return sample
  return { ...sample, id: run.id, attempt: run.run_attempt, headSha: run.head_sha, pr: pr.number }
}

/**
 * The whole command, with everything it touches passed in so it can be run on fixtures.
 *
 * @param {object} deps
 * @param {readonly string[]} deps.argv
 * @param {(args: string[]) => string} deps.gh
 * @param {readonly string[]} deps.files - current workers files.
 * @param {number} deps.shardCount
 * @param {string} [deps.tablePath]
 * @param {(line: string) => void} deps.out
 * @param {(line: string) => void} deps.err
 * @returns {number} the exit code.
 */
export function run({ argv, gh, files, shardCount, tablePath = TABLE_PATH, out, err }) {
  const args = parseArgs(argv)
  if ('error' in args) {
    err(`update-test-timings: ${args.error}\n${USAGE}`)
    return 2
  }
  if (!Array.isArray(files) || files.length === 0) {
    err('update-test-timings: the workers file list is empty; nothing can be weighed')
    return 1
  }
  const current = readTable(tablePath)
  if ('error' in current) {
    err(`update-test-timings: ${current.error}`)
    return 1
  }
  try {
    if (args.mode === 'check') {
      const source = current.table.source
      if (source?.kind !== 'ci') {
        err(
          'update-test-timings: the committed table is NOT CI-derived (no source.kind "ci"). Nothing to verify: ' +
            `it needs ${String(MIN_SAMPLES)} green pull-request runs into develop that carry tracy-test-timing lines, then a refresh.`
        )
        return 1
      }
      const runs = []
      for (const named of source.runs) {
        const meta = ghJson(gh, [
          'api',
          '--method',
          'GET',
          `repos/${source.repo}/actions/runs/${String(named.id)}`
        ])
        if (
          meta?.id !== named.id ||
          meta?.run_attempt !== named.attempt ||
          meta?.head_sha !== named.headSha
        ) {
          err(
            `update-test-timings: run ${String(named.id)} is no longer the attempt and commit the table names (it was re-run, or the id is wrong)`
          )
          return 1
        }
        const got = readRun(gh, source.repo, meta, shardCount)
        if ('refused' in got) {
          err(
            `update-test-timings: run ${String(named.id)} named by the table is not eligible: ${got.refused}`
          )
          return 1
        }
        if (got.pr !== named.pr) {
          err(
            `update-test-timings: run ${String(named.id)} ran for pull request #${String(got.pr)}, not #${String(named.pr)} as the table says`
          )
          return 1
        }
        runs.push(got)
      }
      const made = tableFromSamples({ files, runs, repo: source.repo })
      if ('refused' in made) {
        err(`update-test-timings: ${made.refused}`)
        return 1
      }
      const want = JSON.stringify(made.table)
      if (want !== JSON.stringify(current.table)) {
        const diff = Object.keys({ ...made.table.files, ...current.table.files }).filter(
          (f) => made.table.files[f] !== current.table.files[f]
        )
        err(
          `update-test-timings: the committed table is not what its runs give for this tree` +
            `${diff.length > 0 ? ` (${String(diff.length)} file(s) differ, e.g. ${diff.slice(0, 3).join(', ')})` : ' (factor, rest or source differ)'}. Refresh it.`
        )
        return 1
      }
      out(
        `update-test-timings: ${String(Object.keys(made.table.files).length)} files match the median of ${String(runs.length)} CI runs (${runs.map((r) => String(r.id)).join(', ')}).`
      )
      return 0
    }

    const listed = ghJson(gh, [
      'api',
      '--method',
      'GET',
      `repos/${args.repo}/actions/workflows/${WORKFLOW}/runs?event=pull_request&status=success&per_page=30`
    ])
    const candidates = Array.isArray(listed?.workflow_runs) ? listed.workflow_runs : null
    if (candidates === null) throw new UnknownError('the run list has no workflow_runs')
    const runs = []
    const refused = []
    const seen = new Set()
    for (const candidate of candidates) {
      if (runs.length >= args.runs) break
      if (seen.has(candidate?.id)) continue
      seen.add(candidate?.id)
      const got = readRun(gh, args.repo, candidate, shardCount)
      if ('refused' in got) refused.push(`${String(candidate?.id)}: ${got.refused}`)
      else runs.push(got)
    }
    for (const line of refused.slice(0, 12)) err(`update-test-timings: refused run ${line}`)
    if (refused.length > 12) err(`update-test-timings: … and ${String(refused.length - 12)} more refused`)
    const made = tableFromSamples({ files, runs, repo: args.repo })
    if ('refused' in made) {
      err(`update-test-timings: ${made.refused}. The table was NOT changed.`)
      return 1
    }
    const wrote = writeTableAtomic(tablePath, made.table, current)
    if (wrote !== null) {
      err(`update-test-timings: ${wrote}`)
      return 1
    }
    out(
      `update-test-timings: ${String(Object.keys(made.table.files).length)} files, median of ${String(runs.length)} runs ` +
        `(${runs.map((r) => String(r.id)).join(', ')}), factor ${String(made.table.wallPerSummedSecond)}, rest ${String(made.table.restWallSeconds)} s -> ${relative(ROOT, tablePath)}`
    )
    return 0
  } catch (error) {
    if (!(error instanceof UnknownError)) throw error
    err(
      `update-test-timings: UNKNOWN — ${error.message}. GitHub could not be read, so nothing was learnt and nothing was changed.`
    )
    return 3
  }
}

/** The number of workers shards CI runs, read from the planner's own rows (no second copy). */
export function plannedShardCount(planMatrix) {
  const rows = planMatrix({ event: 'workflow_dispatch', changed: null, allFiles: [] }).matrix.include
  const counts = new Set()
  for (const row of rows)
    for (const m of String(row.args).matchAll(/workers:\d+\/(\d+)/g)) counts.add(Number(m[1]))
  if (counts.size !== 1) throw new Error(`the planner names ${String(counts.size)} different shard counts`)
  return [...counts][0]
}

async function main() {
  const early = parseArgs(process.argv.slice(2))
  if ('error' in early) {
    process.stderr.write(`update-test-timings: ${early.error}\n${USAGE}\n`)
    process.exit(2)
  }
  const { workersFiles } = await import('./check-tests.ts')
  const { planMatrix } = await import('./ci/plan-ci.mjs')
  process.exit(
    run({
      argv: process.argv.slice(2),
      gh: realGh,
      files: workersFiles({ strict: true }),
      shardCount: plannedShardCount(planMatrix),
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`)
    })
  )
}

// No top-level await: tsx loads this file as CommonJS when a `.ts` test imports it.
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  main().catch((error) => {
    process.stderr.write(`update-test-timings: ${String(error?.stack ?? error)}\n`)
    process.exit(1)
  })
}
