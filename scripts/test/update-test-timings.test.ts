/**
 * `update-test-timings.mjs` — the shard table is filled from the CI runners' own lines or not at all.
 *
 * WHY THESE ARE PINNED. A wrong table fails nowhere: the shards still run every file, one job is
 * just slower, and a table measured on the wrong machine looks exactly like a right one (the macOS
 * table reverted in `7cdbcfb46`). So every way a number could enter the table without being a
 * runner's measurement is refused here by name: a log cut short, a record printed twice, a run that
 * is not a green Linux pull-request run into `develop`, fewer than three samples, GitHub not
 * answering. And every refusal must leave the table on disk byte for byte.
 *
 *   node --import tsx --test scripts/test/update-test-timings.test.ts
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { shardOf } from '../check-tests.ts'
import { CI_REPOSITORY } from '../ci/ci-repository.mjs'
import { parsePlanArgs, planMatrix } from '../ci/plan-ci.mjs'
import * as timings from '../update-test-timings.mjs'
import {
  BALANCE_LIMIT_SECONDS,
  MIN_SAMPLES,
  plannedShardCount,
  UnknownError
} from '../update-test-timings.mjs'

// The module is JavaScript whose JSDoc returns unions (`{ table } | { refused }`, `{ table } |
// { error }`); these tests read both arms of each, so its functions are taken loosely typed here.
type Loose = (...args: any[]) => any
const {
  notARegularFile,
  parseArgs,
  parseTimingLog,
  predictBalance,
  pullOf,
  readTable,
  refusal,
  run,
  sampleOf,
  tableFromSamples,
  tableProblems,
  writeTableAtomic
} = timings as unknown as Record<string, Loose>

const MARK = 'tracy-test-timing v1'
const REPORTER_FAULT = 'check-tests: reporter error (the test verdict is unaffected)'
const NO_REPORT = 'check-tests: this run left NO skip/timing report'
const STAMP = '2026-10-08T00:26:15.2285319Z'
const line = (job: string, message: string): string => `${job}\tBuild check\t${STAMP} ${message}`

/** The lines one green shard prints, as `gh run view --log` shows them. */
function shardLines(index: number, of: number, files: Record<string, number>, wall: number): string[] {
  const job = `build check (tests ${String(index)}/${String(of)})`
  const names = Object.keys(files).sort()
  const summed = names.reduce((sum, f) => sum + files[f], 0)
  return [
    line(job, `check-tests: workers + scripts + packages — shard ${String(index)}/${String(of)}`),
    line(
      job,
      `${MARK} begin part=workers shard=${String(index)}/${String(of)} files=${String(names.length)}`
    ),
    line(job, '✔ some test (1.5ms)'),
    ...names.map((f) => line(job, `${MARK} file=${f} seconds=${files[f].toFixed(3)} ok=1`)),
    line(job, `${MARK} files=${String(names.length)} summed=${summed.toFixed(3)}`),
    line(job, `${MARK} end part=workers shard=${String(index)}/${String(of)} wall=${wall.toFixed(3)}`)
  ]
}

const A = { 'apps/a/test/one.test.mjs': 10, 'apps/a/test/two.test.mjs': 30 }
const B = { 'scripts/test/three.test.mjs': 20, 'scripts/test/four.test.mjs': 20 }
const FILES = [...Object.keys(A), ...Object.keys(B)]

/** A whole green run's log: two shards, `rest` on the last. */
function runLog(scale = 1, rest = 150): string {
  const a = Object.fromEntries(Object.entries(A).map(([f, s]) => [f, s * scale]))
  const b = Object.fromEntries(Object.entries(B).map(([f, s]) => [f, s * scale]))
  return [
    ...shardLines(1, 2, a, 20 * scale),
    ...shardLines(2, 2, b, 20 * scale),
    line('build check (tests 2/2)', `${MARK} part=rest wall=${rest.toFixed(3)}`),
    ''
  ].join('\n')
}

test('arguments: an unknown, repeated, valueless or contradictory flag is refused before anything runs', () => {
  assert.deepEqual(parseArgs([]), { mode: 'refresh', runs: 5, repo: CI_REPOSITORY })
  assert.deepEqual(parseArgs(['--check-ci']), { mode: 'check', runs: 5, repo: CI_REPOSITORY })
  assert.deepEqual(parseArgs(['--runs', '7', '--repo', 'a/b']), { mode: 'refresh', runs: 7, repo: 'a/b' })
  for (const bad of [
    ['--allow-red'],
    ['--jobs', '4'],
    ['--check-ci', '--check-ci'],
    ['--runs'],
    ['--runs', '2'],
    ['--runs', '0'],
    ['--runs', '3.5'],
    ['--runs', '-3'],
    ['--runs', '5', '--runs', '6'],
    ['--repo'],
    ['--repo', 'no-slash'],
    ['--check-ci', '--runs', '5'],
    ['extra']
  ]) {
    assert.ok('error' in parseArgs(bad), `${bad.join(' ')} should be refused`)
  }
  let asked = 0
  const code = run({
    argv: ['--nope'],
    gh: () => {
      asked += 1
      return '{}'
    },
    files: FILES,
    shardCount: 2,
    tablePath: '/nonexistent/table.json',
    out: () => {},
    err: () => {}
  })
  assert.equal(code, 2)
  assert.equal(asked, 0, 'GitHub is not asked on a usage error')
})

test('planner arguments: only --check-test-balance, once', () => {
  assert.deepEqual(parsePlanArgs([]), { mode: 'plan' })
  assert.deepEqual(parsePlanArgs(['--check-test-balance']), { mode: 'balance' })
  for (const bad of [
    ['--check-balance'],
    ['--check-test-balance', '--check-test-balance'],
    ['--check-test-balance', 'x'],
    ['']
  ]) {
    assert.ok('error' in parsePlanArgs(bad), `${bad.join(' ')} should be refused`)
  }
})

test('a green run gives one sample per file, a factor per shard and the rest wall', () => {
  const parsed = parseTimingLog(runLog())
  assert.deepEqual(parsed.problems, [])
  assert.equal(parsed.shards.length, 2)
  const sample = sampleOf(parsed, 2)
  assert.ok(!('refused' in sample), JSON.stringify(sample))
  assert.equal(sample.files.get('apps/a/test/two.test.mjs'), 30)
  assert.deepEqual(sample.factors, [0.5, 0.5])
  assert.equal(sample.rest, 150)
})

test('one strict form: a marker anywhere but at the head of a whole log line refuses the run', () => {
  const job = 'build check (tests 1/2)'
  // A test's own duration, printed by the usual reporter, carries no marker and is never a record.
  const quiet = [line(job, '✔ apps/a/test/one.test.mjs (999000.5ms)'), runLog()].join('\n')
  assert.equal(sampleOf(parseTimingLog(quiet), 2).files.get('apps/a/test/one.test.mjs'), 10)

  const record = `${MARK} file=apps/a/test/one.test.mjs seconds=999.000 ok=1`
  const cases: [string, string, RegExp][] = [
    ['quoted inside a test name', line(job, `✔ prints "${record}" (3.2ms)`), /inside another line/],
    ['after leading text', line(job, `  ${record}`), /inside another line/],
    ['no job and step columns', `${STAMP} ${record}`, /not a log line/],
    ['no timestamp', `${job}\tBuild check\t${record}`, /not a log line/],
    ['a cut timestamp', `${job}\tBuild check\t2026-10-08T00:26 ${record}`, /not a log line/],
    ['one tab short', `${job}\t${STAMP} ${record}`, /not a log line/],
    ['a bare record', record, /not a log line/],
    ['an unknown payload', line(job, `${MARK} speed=fast`), /unreadable line/],
    ['a newer version of the marker', line(job, `${MARK}.1 file=x seconds=1.000 ok=1`), /inside another line/]
  ]
  for (const [name, extra, reason] of cases) {
    for (const log of [[extra, runLog()].join('\n'), [runLog(), extra].join('\n')]) {
      const got = sampleOf(parseTimingLog(log), 2)
      assert.ok('refused' in got, `${name}: should be refused`)
      assert.match(got.refused, reason, name)
    }
  }
  // A step's first line carries a byte-order mark before its timestamp, and Windows line ends exist.
  const bom = runLog().replace(`\t${STAMP} ${MARK} begin`, `\t﻿${STAMP} ${MARK} begin`)
  assert.ok(!('refused' in sampleOf(parseTimingLog(bom.split('\n').join('\r\n')), 2)))
})

test('a run in which the reporter said it failed, or left nothing, is not a sample', () => {
  const job = 'build check (tests 2/2)'
  const faults = [
    `${REPORTER_FAULT}: boom from an event`,
    `${REPORTER_FAULT}: could not write /tmp/x/report.txt: ENOSPC`,
    `${NO_REPORT} (it ended before its closing line, or never started): its skipped tests are not listed.`
  ]
  for (const fault of faults) {
    for (const where of [line(job, fault), line('build check (e2e)', fault), fault]) {
      const got = sampleOf(parseTimingLog([runLog(), where].join('\n')), 2)
      assert.match(got.refused, /the reporter said it failed/, where)
      // Even with no timing line at all it is a fault, not "an old run".
      assert.match(sampleOf(parseTimingLog(where), 2).refused, /the reporter said it failed/)
    }
  }
})

test('a duration of 0.000 is no measurement: file, shard wall and rest are each refused', () => {
  const cases: [string, string, RegExp][] = [
    ['a file', runLog().replace('seconds=10.000 ok=1', 'seconds=0.000 ok=1'), /has no measured time/],
    ['a shard wall', runLog().replace('shard=1/2 wall=20.000', 'shard=1/2 wall=0.000'), /no wall time/],
    ['rest', runLog(1, 0), /rest gives no wall time/]
  ]
  for (const [name, log, reason] of cases) {
    const got = sampleOf(parseTimingLog(log), 2)
    assert.ok('refused' in got, `${name}: should be refused`)
    assert.match(got.refused, reason, name)
  }
})

test('a log with no timing line says so, and is not read as "the files were fast"', () => {
  const got = sampleOf(parseTimingLog(line('build check (tests 1/2)', '✔ a test (1ms)')), 2)
  assert.match(got.refused, /no tracy-test-timing line/)
  assert.match(sampleOf(parseTimingLog(''), 2).refused, /no tracy-test-timing line/)
})

test('every damaged shard is refused whole, with the reason', () => {
  const good = runLog().split('\n')
  const without = (pattern: RegExp): string => good.filter((l) => !pattern.test(l)).join('\n')
  const cases: [string, string, RegExp][] = [
    ['cut short before the end line', good.slice(0, 5).join('\n'), /no end line|shard\(s\) reported/],
    ['the end line is gone', without(/ end part=workers shard=1/), /no end line/],
    [
      'one file record lost',
      without(/file=apps\/a\/test\/one/),
      /summary counts other files|files were started/
    ],
    ['the summary line lost', without(/files=2 summed=40.000/), /no summary line|shard/],
    ['a file reported twice', [...good.slice(0, 4), good[3], ...good.slice(4)].join('\n'), /two records for/],
    ['a red file', runLog().replace('seconds=10.000 ok=1', 'seconds=10.000 ok=0'), /was red/],
    ['a duration that is not a number', runLog().replace('seconds=10.000', 'seconds=NaN'), /unreadable line/],
    ['a negative duration', runLog().replace('seconds=10.000', 'seconds=-10.000'), /unreadable line/],
    ['a summed figure that disagrees', runLog().replace('summed=40.000', 'summed=41.000'), /do not match/],
    [
      'a reporter conflict',
      runLog().replace(
        `${MARK} file=apps/a/test/one.test.mjs seconds=10.000 ok=1`,
        `${MARK} conflict file=apps/a/test/one.test.mjs reason=2-file-records`
      ),
      /reporter refused a file/
    ],
    [
      'a shard printed by another job',
      runLog().replace(/build check \(tests 1\/2\)/g, 'build check (checks)'),
      /printed by job/
    ],
    [
      'a shard printed by a job whose name only ENDS like the real one',
      runLog().replace(/build check \(tests 1\/2\)/g, 'fork / not the build check (tests 1/2)'),
      /printed by job "fork \/ not the build check \(tests 1\/2\)", not "build check \(tests 1\/2\)"/
    ],
    [
      'a shard printed by a job whose name only STARTS like the real one',
      runLog().replace(/build check \(tests 1\/2\)/g, 'build check (tests 1/2) (retry)'),
      /printed by job/
    ],
    [
      'a record outside any shard',
      [line('build check (tests 1/2)', `${MARK} file=x.test.mjs seconds=1.000 ok=1`), runLog()].join('\n'),
      /outside a shard/
    ],
    ['one shard missing', good.slice(7).join('\n'), /1 shard\(s\) reported/],
    [
      'a third shard count',
      runLog()
        .replace(/shard=(\d)\/2/g, 'shard=$1/3')
        .replace(/tests (\d)\/2\)/g, 'tests $1/3)'),
      /3 shards|rest was timed/
    ],
    ['no rest figure', without(/part=rest/), /0 rest timing line/],
    [
      'two rest figures',
      `${runLog()}${line('build check (tests 2/2)', `${MARK} part=rest wall=1.000`)}\n`,
      /2 rest timing line/
    ],
    [
      'rest timed on the first shard',
      runLog().replace(/build check \(tests 2\/2\)(\t[^\n]*part=rest)/, 'build check (tests 1/2)$1'),
      /not the last shard/
    ],
    [
      'rest timed by a job whose name only ends like the last shard',
      runLog().replace(/build check \(tests 2\/2\)(\t[^\n]*part=rest)/, 'other (tests 2/2)$1'),
      /rest was timed by "other \(tests 2\/2\)", not the last shard's job "build check \(tests 2\/2\)"/
    ],
    [
      'the whole last shard and rest printed by a look-alike job',
      runLog().replace(/build check \(tests 2\/2\)/g, 'x build check (tests 2/2)'),
      /printed by job "x build check \(tests 2\/2\)"/
    ]
  ]
  for (const [name, log, reason] of cases) {
    const got = sampleOf(parseTimingLog(log), 2)
    assert.ok('refused' in got, `${name}: should be refused`)
    assert.match(got.refused, reason, name)
  }
})

test('interleaved jobs are kept apart; a file in two shards is refused', () => {
  const one = shardLines(1, 2, A, 20)
  const two = shardLines(2, 2, B, 20)
  const mixed: string[] = []
  for (let i = 0; i < Math.max(one.length, two.length); i++) {
    if (one[i]) mixed.push(one[i])
    if (two[i]) mixed.push(two[i])
  }
  mixed.push(line('build check (tests 2/2)', `${MARK} part=rest wall=150.000`))
  const sample = sampleOf(parseTimingLog(mixed.join('\n')), 2)
  assert.ok(!('refused' in sample), JSON.stringify(sample))
  assert.equal(sample.files.size, 4)

  const twice = [...shardLines(1, 2, A, 20), ...shardLines(2, 2, { ...B, 'apps/a/test/one.test.mjs': 5 }, 20)]
  twice.push(line('build check (tests 2/2)', `${MARK} part=rest wall=150.000`))
  assert.match(sampleOf(parseTimingLog(twice.join('\n')), 2).refused, /ran in two shards/)
})

const SHA = 'a'.repeat(40)
// The repository `run` reads by default: the runner's own (`GITHUB_REPOSITORY`) in Actions, TracyHQ/tch elsewhere.
const REPO = CI_REPOSITORY
const swapCase = (s: string): string =>
  [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')
interface RunLike {
  id: number
  run_attempt: number
  head_branch: string
  head_sha: string
}
const goodRun = (id: number, extra: object = {}) => ({
  id,
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  head_branch: 'fix/x',
  head_sha: SHA,
  path: '.github/workflows/tracy-ci.yml',
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  pull_requests: [],
  ...extra
})
const pull = (r: RunLike, extra: object = {}) => ({
  number: 7,
  head: { ref: r.head_branch, sha: r.head_sha, repo: { full_name: REPO } },
  base: { ref: 'develop', repo: { full_name: REPO } },
  ...extra
})
const pullsOf = (r: RunLike) => [pull(r)]
const jobsOf = (r: RunLike, extra: object = {}) =>
  [1, 2].map((i) => ({
    name: `build check (tests ${String(i)}/2)`,
    conclusion: 'success',
    labels: ['self-hosted', 'linux', 'x64', 'tracy-check', 'tracy-lane-dev'],
    run_id: r.id,
    run_attempt: r.run_attempt,
    head_sha: r.head_sha,
    ...extra
  }))
const RUN = goodRun(1)
const PULLS = pullsOf(RUN)
const goodJobs = (extra: object = {}) => jobsOf(RUN, extra)

test('only a green Linux pull-request run into develop, or a green Linux nightly, is eligible', () => {
  assert.equal(refusal(RUN, { pulls: PULLS, jobs: goodJobs() }, 2, REPO), null)
  // The nightly (30/10/2026): no pull request to tie it to, so none is asked for; its jobs still are.
  const nightly = goodRun(1, { event: 'schedule', head_branch: 'main' })
  assert.equal(refusal(nightly, { pulls: null, jobs: null }, 2, REPO), null)
  assert.equal(refusal(nightly, { pulls: [], jobs: jobsOf(nightly) }, 2, REPO), null)
  // A nightly that ran GitHub-hosted, red or on forced Turbo rows teaches nothing.
  assert.match(
    String(refusal(nightly, { pulls: [], jobs: jobsOf(nightly, { labels: ['ubuntu-latest'] }) }, 2, REPO)),
    /linux runner/
  )
  assert.match(
    String(refusal(nightly, { pulls: [], jobs: jobsOf(nightly, { conclusion: 'failure' }) }, 2, REPO)),
    /is failure/
  )
  assert.match(String(refusal(nightly, { pulls: [], jobs: [] }, 2, REPO)), /lists no job/)
  assert.match(
    String(
      refusal(goodRun(1, { event: 'schedule', conclusion: 'failure' }), { pulls: null, jobs: null }, 2, REPO)
    ),
    /not a green run/
  )
  // Repository names compare without case, as GitHub does.
  assert.equal(refusal(RUN, { pulls: PULLS, jobs: goodJobs() }, 2, swapCase(REPO)), null)
  const cases: [string, unknown, unknown, unknown, RegExp][] = [
    ['a push', goodRun(1, { event: 'push' }), PULLS, goodJobs(), /event is push/],
    [
      'a manual run',
      goodRun(1, { event: 'workflow_dispatch' }),
      PULLS,
      goodJobs(),
      /event is workflow_dispatch/
    ],
    ['a red run', goodRun(1, { conclusion: 'failure' }), PULLS, goodJobs(), /not a green run/],
    ['a cancelled run', goodRun(1, { conclusion: 'cancelled' }), PULLS, goodJobs(), /not a green run/],
    [
      'a run still going',
      goodRun(1, { status: 'in_progress', conclusion: null }),
      PULLS,
      goodJobs(),
      /not a green run/
    ],
    ['no run id', goodRun(1, { id: undefined }), PULLS, goodJobs(), /run id/],
    ['no attempt number', goodRun(1, { run_attempt: undefined }), PULLS, goodJobs(), /attempt/],
    ['attempt zero', goodRun(1, { run_attempt: 0 }), PULLS, goodJobs(), /attempt/],
    ['no head commit', goodRun(1, { head_sha: 'abc' }), PULLS, goodJobs(), /head branch and commit/],
    ['no pull request at all', RUN, [], goodJobs(), /base is unknown/],
    [
      'only another branch’s pull request',
      RUN,
      [pull({ ...RUN, head_branch: 'other' })],
      goodJobs(),
      /base is unknown/
    ],
    [
      'a release pull request into main',
      RUN,
      [pull(RUN, { base: { ref: 'main', repo: { full_name: REPO } } })],
      goodJobs(),
      /#7 base is main, not develop/
    ],
    ['a macOS runner', RUN, PULLS, goodJobs({ labels: ['self-hosted', 'macOS'] }), /linux runner/],
    ['a job with no labels', RUN, PULLS, goodJobs({ labels: undefined }), /linux runner/],
    ['a red tests job', RUN, PULLS, goodJobs({ conclusion: 'failure' }), /is failure/],
    ['a missing tests job', RUN, PULLS, goodJobs().slice(0, 1), /0 job\(s\) named/],
    ['a duplicated tests job', RUN, PULLS, [...goodJobs(), goodJobs()[0]], /2 job\(s\) named/],
    ['no job at all', RUN, PULLS, [], /lists no job/],
    ['nothing', null, PULLS, goodJobs(), /no run data/]
  ]
  for (const [name, runData, pulls, jobs, reason] of cases) {
    const got = refusal(runData, { pulls: pulls as never, jobs: jobs as never }, 2, REPO)
    assert.match(String(got), reason, name)
  }
})

test('a sample is tied to one repository, workflow, pull request, commit, run and attempt', () => {
  const other = 'b'.repeat(40)
  const fork = { full_name: 'someone/tch' }
  const cases: [string, unknown, unknown, unknown, RegExp][] = [
    [
      'the same branch name in a fork’s pull request',
      RUN,
      [pull(RUN, { head: { ref: 'fix/x', sha: SHA, repo: fork } })],
      goodJobs(),
      /base is unknown/
    ],
    [
      'a pull request whose head repository is gone',
      RUN,
      [pull(RUN, { head: { ref: 'fix/x', sha: SHA, repo: null } })],
      goodJobs(),
      /base is unknown/
    ],
    [
      'a pull request into another repository',
      RUN,
      [pull(RUN, { base: { ref: 'develop', repo: fork } })],
      goodJobs(),
      /base is unknown/
    ],
    [
      'a pull request of that name that ends at another commit',
      RUN,
      [pull(RUN, { head: { ref: 'fix/x', sha: other, repo: { full_name: REPO } } })],
      goodJobs(),
      /ends at another commit/
    ],
    [
      'two pull requests of the branch, into develop and staging',
      RUN,
      [...PULLS, pull(RUN, { number: 8, base: { ref: 'staging', repo: { full_name: REPO } } })],
      goodJobs(),
      /2 pull requests .*#7 into develop, #8 into staging.*cannot be told/
    ],
    [
      'two pull requests of the branch, both into develop',
      RUN,
      [...PULLS, pull(RUN, { number: 8 })],
      goodJobs(),
      /cannot be told/
    ],
    ['a pull request with no number', RUN, [pull(RUN, { number: undefined })], goodJobs(), /number and base/],
    [
      'the run itself names another pull request',
      goodRun(1, { pull_requests: [{ number: 9, head: { sha: SHA } }] }),
      PULLS,
      goodJobs(),
      /names other pull request/
    ],
    [
      'the run names its pull request at another commit',
      goodRun(1, { pull_requests: [{ number: 7, head: { sha: other } }] }),
      PULLS,
      goodJobs(),
      /names other pull request/
    ],
    ['a run of another repository', goodRun(1, { repository: fork }), PULLS, goodJobs(), /belongs to/],
    ['a run with no repository', goodRun(1, { repository: undefined }), PULLS, goodJobs(), /belongs to/],
    ['a run from a fork', goodRun(1, { head_repository: fork }), PULLS, goodJobs(), /a fork/],
    [
      'a run of another workflow file',
      goodRun(1, { path: '.github/workflows/build-app-images.yml' }),
      PULLS,
      goodJobs(),
      /not of \.github\/workflows\/tracy-ci\.yml/
    ],
    ['jobs of another run', RUN, PULLS, goodJobs({ run_id: 2 }), /another run, attempt or commit/],
    ['jobs of another attempt', RUN, PULLS, goodJobs({ run_attempt: 2 }), /another run, attempt or commit/],
    ['jobs of another commit', RUN, PULLS, goodJobs({ head_sha: other }), /another run, attempt or commit/],
    ['jobs that do not say', RUN, PULLS, goodJobs({ run_id: undefined }), /another run, attempt or commit/],
    [
      'one stray job of another run among good ones',
      RUN,
      PULLS,
      [...goodJobs(), { name: 'build check (lint)', run_id: 2, run_attempt: 1, head_sha: SHA }],
      /"build check \(lint\)" belongs to another run/
    ]
  ]
  for (const [name, runData, pulls, jobs, reason] of cases) {
    const got = refusal(runData, { pulls: pulls as never, jobs: jobs as never }, 2, REPO)
    assert.match(String(got), reason, name)
  }
  assert.deepEqual(pullOf(RUN, PULLS, REPO), { number: 7, base: 'develop' })
  // GitHub still lists the pull request on a young run: the same one is accepted.
  const young = goodRun(1, { pull_requests: [{ number: 7, head: { sha: SHA } }] })
  assert.equal(refusal(young, { pulls: PULLS, jobs: goodJobs() }, 2, REPO), null)
})

const sampleRun = (id: number, scale: number, rest: number) => {
  const sample = sampleOf(parseTimingLog(runLog(scale, rest)), 2)
  assert.ok(!('refused' in sample))
  return { ...sample, id, attempt: 1, headSha: SHA, pr: 7 }
}

test('the table is the median over at least three runs; fewer is refused, never padded', () => {
  const runs = [sampleRun(1, 1, 140), sampleRun(2, 2, 150), sampleRun(3, 4, 400)]
  const made = tableFromSamples({ files: FILES, runs, repo: 'o/r' })
  assert.ok('table' in made, JSON.stringify(made))
  assert.equal(made.table.files['apps/a/test/two.test.mjs'], 60, 'median of 30, 60, 120')
  assert.equal(made.table.wallPerSummedSecond, 0.5)
  assert.equal(made.table.restWallSeconds, 150)
  assert.equal(made.table.preloadLastShardSeconds, 300, 'rest wall ÷ factor: the unit shardOf balances in')
  assert.deepEqual(
    made.table.source.runs.map((r: { id: number }) => r.id),
    [1, 2, 3]
  )
  assert.deepEqual(tableProblems(made.table), [])

  assert.equal(MIN_SAMPLES, 3)
  assert.match(
    tableFromSamples({ files: FILES, runs: runs.slice(0, 2), repo: 'o/r' }).refused,
    /2 eligible run/
  )
  assert.match(
    tableFromSamples({ files: FILES, runs: [runs[0], runs[0], runs[1]], repo: 'o/r' }).refused,
    /counted twice/
  )

  const newFile = tableFromSamples({ files: [...FILES, 'apps/a/test/new.test.mjs'], runs, repo: 'o/r' })
  assert.match(newFile.refused, /fewer than 3 samples/)
  assert.deepEqual(newFile.short, [{ file: 'apps/a/test/new.test.mjs', samples: 0 }])

  assert.deepEqual(made.table.source.runs[0], { id: 1, attempt: 1, headSha: SHA, pr: 7 })

  // A measured median is kept as measured: no floor, and no rounding of a small figure to nothing.
  const tiny = [0.02, 0.03, 0.041].map((seconds, i) => {
    const log = [
      ...shardLines(1, 2, { 'apps/a/test/one.test.mjs': seconds }, 0.012),
      ...shardLines(2, 2, { 'scripts/test/three.test.mjs': 0.004 }, 0.002),
      line('build check (tests 2/2)', `${MARK} part=rest wall=0.04${String(i)}`),
      ''
    ].join('\n')
    const sample = sampleOf(parseTimingLog(log), 2)
    assert.ok(!('refused' in sample), JSON.stringify(sample))
    return { ...sample, id: i + 1, attempt: 1, headSha: SHA, pr: 7 }
  })
  const small = tableFromSamples({
    files: ['apps/a/test/one.test.mjs', 'scripts/test/three.test.mjs'],
    runs: tiny,
    repo: 'o/r'
  })
  assert.ok('table' in small, JSON.stringify(small))
  assert.equal(small.table.files['apps/a/test/one.test.mjs'], 0.03, 'not lifted to 0.1')
  assert.equal(small.table.files['scripts/test/three.test.mjs'], 0.004)
  assert.equal(small.table.restWallSeconds, 0.041, 'not rounded to 0')

  const gone = tableFromSamples({ files: FILES.slice(1), runs, repo: 'o/r' })
  assert.ok('table' in gone)
  assert.ok(!('apps/a/test/one.test.mjs' in gone.table.files), 'a file that left the tree leaves the table')
})

test('a table with an impossible number, or rest in the wrong unit, is not a table', () => {
  const made = tableFromSamples({
    files: FILES,
    runs: [sampleRun(1, 1, 150), sampleRun(2, 1, 150), sampleRun(3, 1, 150)],
    repo: 'o/r'
  })
  assert.ok('table' in made)
  const t = made.table
  const broken: [string, object, RegExp][] = [
    ['a negative weight', { ...t, files: { ...t.files, 'x.test.mjs': -1 } }, /not a positive number/],
    ['a zero weight', { ...t, files: { ...t.files, 'x.test.mjs': 0 } }, /not a positive number/],
    [
      'a null weight (NaN in JSON)',
      { ...t, files: { ...t.files, 'x.test.mjs': null } },
      /not a positive number/
    ],
    ['a string weight', { ...t, files: { ...t.files, 'x.test.mjs': '3' } }, /not a positive number/],
    ['no files', { ...t, files: undefined }, /no files object/],
    ['rest added as wall seconds', { ...t, preloadLastShardSeconds: t.restWallSeconds }, /wrong unit/],
    ['no factor', { ...t, wallPerSummedSecond: 0 }, /factor/],
    ['a rest of nothing', { ...t, restWallSeconds: 0, preloadLastShardSeconds: 0 }, /restWallSeconds/],
    [
      'a run with no pull request',
      { ...t, source: { ...t.source, runs: t.source.runs.map(({ pr: _pr, ...r }: { pr: number }) => r) } },
      /without id, attempt, headSha and pr/
    ],
    [
      'two runs',
      { ...t, source: { ...t.source, runs: t.source.runs.slice(0, 2) } },
      /at least 3 different runs/
    ],
    [
      'one run three times',
      { ...t, source: { ...t.source, runs: [t.source.runs[0], t.source.runs[0], t.source.runs[0]] } },
      /different runs/
    ],
    ['a lower bar', { ...t, source: { ...t.source, minSamples: 1 } }, /minSamples/],
    ['another kind of source', { ...t, source: { kind: 'mac' } }, /not \{ kind: "ci"/],
    ['an array', [], /not an object/]
  ]
  for (const [name, table, reason] of broken) assert.match(tableProblems(table).join(' | '), reason, name)
})

function sandbox(): { dir: string; table: string; done: () => void } {
  // A named artifacts directory is used or the test fails: realpathSync throws on a missing one.
  const dir = mkdtempSync(join(realpathSync(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()), 'tch-timings-'))
  const table = join(dir, 'test-timings.json')
  return { dir, table, done: () => rmSync(dir, { recursive: true, force: true }) }
}
const OLD = `${JSON.stringify({ _about: 'old', preloadLastShardSeconds: 110, files: { 'apps/a/test/one.test.mjs': 1.5 } }, null, 2)}\n`

test('a symlink, directory, FIFO, empty or cut-short table is refused, judged on what was opened', (t) => {
  const box = sandbox()
  t.after(box.done)
  assert.match(readTable(box.table).error, /cannot open .*ENOENT/)
  writeFileSync(box.table, OLD)
  const real = readTable(box.table)
  assert.ok('table' in real)
  assert.equal(real.bytes, OLD)

  const link = join(box.dir, 'link.json')
  symlinkSync(box.table, link)
  assert.match(readTable(link).error, /symbolic link/)
  assert.match(String(notARegularFile(link)), /symbolic link/)
  assert.match(String(writeTableAtomic(link, JSON.parse(OLD), real)), /symbolic link/)
  const dangling = join(box.dir, 'dangling.json')
  symlinkSync(join(box.dir, 'nowhere.json'), dangling)
  assert.match(readTable(dangling).error, /symbolic link/)

  const folder = join(box.dir, 'folder.json')
  mkdirSync(folder)
  assert.match(readTable(folder).error, /is a directory/)

  const empty = join(box.dir, 'empty.json')
  writeFileSync(empty, '')
  assert.match(readTable(empty).error, /is empty/)

  const cut = join(box.dir, 'cut.json')
  writeFileSync(cut, OLD.slice(0, 40))
  assert.match(readTable(cut).error, /not JSON/)

  if (process.platform !== 'win32') {
    const fifo = join(box.dir, 'fifo.json')
    execFileSync('mkfifo', [fifo])
    // Nobody writes to it: an open that could block would hang this test until its timeout.
    assert.match(String(notARegularFile(fifo)), /not a regular file/)
    assert.match(readTable(fifo).error, /not a regular file/)
    assert.match(String(writeTableAtomic(fifo, JSON.parse(OLD), real)), /not a regular file/)
  }
  assert.equal(readFileSync(box.table, 'utf8'), OLD, 'the real table was never touched')
  assert.deepEqual(
    readdirSync(box.dir).filter((f) => f.includes('.lock') || f.includes('.tmp-')),
    []
  )
})

test('the table is replaced in one step, or left exactly as it was', (t) => {
  const box = sandbox()
  t.after(box.done)
  writeFileSync(box.table, OLD)
  const read = readTable(box.table)
  assert.ok('table' in read)
  const next = { _about: 'new', preloadLastShardSeconds: 0, files: { 'apps/a/test/one.test.mjs': 2 } }
  const leftovers = (): string[] => readdirSync(box.dir).filter((f) => f !== 'test-timings.json')

  // Another refresh is running: its lock is left alone and nothing is written.
  writeFileSync(`${box.table}.lock`, '')
  assert.match(String(writeTableAtomic(box.table, next, read)), /another refresh is running/)
  assert.equal(readFileSync(box.table, 'utf8'), OLD)
  assert.ok(existsSync(`${box.table}.lock`), 'a lock this call did not take is not removed')
  rmSync(`${box.table}.lock`)

  // Somebody replaced the table after this refresh read it: other bytes, or no word of what was read.
  for (const stale of [
    { ...read, bytes: 'what this refresh read earlier' },
    { bytes: OLD },
    OLD,
    undefined
  ]) {
    assert.match(
      String(writeTableAtomic(box.table, next, stale)),
      /changed while this refresh ran|nothing says which table/
    )
    assert.equal(readFileSync(box.table, 'utf8'), OLD)
    assert.deepEqual(leftovers(), [], 'no temp file and no lock are left behind')
  }

  // An invalid table never reaches the disk.
  assert.match(
    String(writeTableAtomic(box.table, { files: { x: -1 }, preloadLastShardSeconds: 0 }, read)),
    /invalid table/
  )
  assert.equal(readFileSync(box.table, 'utf8'), OLD)
  assert.deepEqual(leftovers(), [])

  assert.equal(writeTableAtomic(box.table, next, read), null)
  assert.deepEqual(JSON.parse(readFileSync(box.table, 'utf8')), next)
  assert.deepEqual(leftovers(), [])
  // What was read before that write no longer names the file on disk.
  assert.match(String(writeTableAtomic(box.table, next, read)), /changed while this refresh ran/)
})

test('the replace is tied to the file that was read: a name that changed under it is refused', (t) => {
  const next = { _about: 'new', preloadLastShardSeconds: 0, files: { 'apps/a/test/one.test.mjs': 2 } }
  const OTHER = OLD.replace('"old"', '"someone else"')
  const swaps: [string, (box: { dir: string; table: string }) => void, (box: { table: string }) => void][] = [
    [
      'another file renamed onto the name, same bytes',
      (box) => {
        writeFileSync(join(box.dir, 'other'), OLD)
        renameSync(join(box.dir, 'other'), box.table)
      },
      (box) => assert.equal(readFileSync(box.table, 'utf8'), OLD)
    ],
    [
      'another table renamed onto the name',
      (box) => {
        writeFileSync(join(box.dir, 'other'), OTHER)
        renameSync(join(box.dir, 'other'), box.table)
      },
      (box) => assert.equal(readFileSync(box.table, 'utf8'), OTHER)
    ],
    [
      'written in place',
      (box) => writeFileSync(box.table, OTHER),
      (box) => assert.equal(readFileSync(box.table, 'utf8'), OTHER)
    ],
    [
      'the name became a symbolic link',
      (box) => {
        renameSync(box.table, join(box.dir, 'moved.json'))
        symlinkSync(join(box.dir, 'moved.json'), box.table)
      },
      (box) => assert.equal(readFileSync(join(box.table, '..', 'moved.json'), 'utf8'), OLD)
    ],
    [
      'the name is gone',
      (box) => rmSync(box.table),
      (box) => assert.equal(existsSync(box.table), false, 'not recreated')
    ]
  ]
  for (const when of ['before the refresh takes its lock', 'between its last read and the rename']) {
    for (const [name, swap, after] of swaps) {
      const box = sandbox()
      t.after(box.done)
      writeFileSync(box.table, OLD)
      const read = readTable(box.table)
      assert.ok('table' in read)
      let said
      if (when.startsWith('before')) {
        swap(box)
        said = writeTableAtomic(box.table, next, read)
      } else said = writeTableAtomic(box.table, next, read, { beforeRename: () => swap(box) })
      assert.match(
        String(said),
        /changed while this refresh ran|symbolic link|cannot open|could not write/,
        `${name}, ${when}`
      )
      after(box)
      assert.deepEqual(
        readdirSync(box.dir).filter((f) => f.includes('.lock') || f.includes('.tmp-')),
        [],
        `${name}, ${when}: no temp file and no lock are left behind`
      )
    }
  }
})

/** A `gh` that answers from fixtures and records what it was asked. */
function fakeGh(
  runs: Record<number, { run: object; pulls?: object[]; jobs?: object[]; log?: string }>,
  calls: string[][] = []
) {
  return (args: string[]): string => {
    calls.push(args)
    const path = args[0] === 'api' ? args[3] : ''
    if (path.includes('/workflows/'))
      return JSON.stringify({ workflow_runs: Object.values(runs).map((r) => r.run) })
    if (path.includes('/commits/')) {
      const hit = Object.values(runs).find((r) => path.includes((r.run as { head_sha: string }).head_sha))
      return JSON.stringify(hit?.pulls ?? (hit ? pullsOf(hit.run as RunLike) : []))
    }
    const id = Number(args[0] === 'run' ? args[2] : /runs\/(\d+)/.exec(path)?.[1])
    const hit = runs[id]
    if (!hit) throw new UnknownError(`no fixture for ${args.join(' ')}`)
    if (args[0] === 'run') return hit.log ?? runLog()
    if (path.endsWith('/jobs?per_page=100'))
      return JSON.stringify({ jobs: hit.jobs ?? jobsOf(hit.run as RunLike) })
    return JSON.stringify(hit.run)
  }
}
const sha = (n: number): string => String(n).repeat(40).slice(0, 40)
/** The develop commit a fixture nightly pinned, and the lines its plan job and two shards print with it. */
const DEVELOP = 'd'.repeat(40)
const pins = (commit: string): string =>
  ['plan the build-check rows', 'build check (tests 1/2)', 'build check (tests 2/2)']
    .map((job) => line(job, `nightly tree: plan selected ${commit}`))
    .join('\n')
const fixtureRuns = () => {
  const r = (id: number, extra: object = {}) => goodRun(id, { head_sha: sha(id - 10), ...extra })
  return {
    11: { run: r(11), log: runLog(1, 140) },
    // A nightly: no pull request, our runners, two shards — a sample like any pull-request run,
    // recorded against the develop commit its plan pinned (DEVELOP), not the run's `main` head.
    12: {
      run: r(12, { event: 'schedule', head_branch: 'main' }),
      log: `${pins(DEVELOP)}\n${runLog(2, 150)}`
    },
    // Nightlies whose tested commit cannot be told: one shard never printed it, or two commits.
    22: {
      run: r(22, { event: 'schedule', head_branch: 'main' }),
      log: `${pins(DEVELOP).split('\n').slice(0, 2).join('\n')}\n${runLog(2, 150)}`
    },
    23: {
      run: r(23, { event: 'schedule', head_branch: 'main' }),
      log: `${pins(DEVELOP)}\n${line('build check (tests 1/2)', `nightly tree: plan selected ${'e'.repeat(40)}`)}\n${runLog(2, 150)}`
    },
    // A nightly that ran GitHub-hosted is not one.
    21: {
      run: r(21, { event: 'schedule', head_branch: 'main' }),
      jobs: jobsOf(r(21), { labels: ['ubuntu-latest'] }),
      log: runLog(8, 800)
    },
    13: { run: r(13), log: runLog(2, 150) },
    14: { run: r(14), pulls: [pull(r(14), { base: { ref: 'main', repo: { full_name: REPO } } })] },
    15: { run: r(15), log: line('build check (tests 1/2)', '✔ ran before the reporter (1ms)') },
    16: { run: r(16), jobs: jobsOf(r(16), { labels: ['self-hosted', 'macOS'] }) },
    17: { run: r(17), log: runLog(4, 400) },
    // The same branch name in a fork: its commit's pull request is not one of this repository.
    18: {
      run: r(18),
      pulls: [pull(r(18), { head: { ref: 'fix/x', sha: sha(8), repo: { full_name: 'someone/tch' } } })],
      log: runLog(8, 800)
    },
    // Jobs that say they belong to another attempt.
    19: { run: r(19), jobs: jobsOf(r(19), { run_attempt: 2 }), log: runLog(8, 800) },
    // A log whose reporter said it failed.
    20: {
      run: r(20),
      log: `${runLog(8, 800)}${line('build check (tests 1/2)', `${REPORTER_FAULT}: boom`)}\n`
    }
  }
}

test('refresh: eligible runs only, a written table that then verifies; --check-ci notices a re-run', (t) => {
  const box = sandbox()
  t.after(box.done)
  writeFileSync(box.table, OLD)
  const said: string[] = []
  const io = { out: (l: string) => said.push(l), err: (l: string) => said.push(l) }
  const runs = fixtureRuns()
  const calls: string[][] = []
  const code = run({
    argv: [],
    gh: fakeGh(runs, calls),
    files: FILES,
    shardCount: 2,
    tablePath: box.table,
    ...io
  })
  assert.equal(code, 0, said.join('\n'))
  const table = JSON.parse(readFileSync(box.table, 'utf8'))
  assert.deepEqual(
    table.source.runs.map((r: { id: number }) => r.id),
    [11, 12, 13, 17]
  )
  assert.equal(table.source.runs[1].pr, null, 'the nightly names no pull request')
  // …and names the develop commit it tested, never the scheduled run's `main` head.
  assert.equal(table.source.runs[1].headSha, DEVELOP)
  assert.notEqual(DEVELOP, runs[12].run.head_sha)
  assert.deepEqual(table.source.events, ['pull_request', 'schedule'])
  assert.equal(table.files['apps/a/test/two.test.mjs'], 60)
  assert.ok(!('preloadLastShardSeconds' in table) || table.preloadLastShardSeconds === 300)
  for (const reason of [
    /21: .*linux runner/,
    /22: nightly: "build check \(tests 2\/2\)" printed the pinned develop commit 0 time\(s\)/,
    /23: nightly: "build check \(tests 1\/2\)" printed the pinned develop commit 2 time\(s\)/,
    /14: pull request #7 base is main/,
    /15: its log has no tracy-test-timing line/,
    /16: .*linux runner/,
    new RegExp(`18: no pull request of its branch in ${REPO} holds its commit`),
    /19: job .* belongs to another run, attempt or commit/,
    /20: the reporter said it failed/
  ]) {
    assert.match(said.join('\n'), reason)
  }
  assert.ok(
    calls.every(
      (c) => (c[0] === 'api' && c[1] === '--method' && c[2] === 'GET') || (c[0] === 'run' && c[1] === 'view')
    ),
    'read-only calls'
  )

  said.length = 0
  assert.equal(
    run({ argv: ['--check-ci'], gh: fakeGh(runs), files: FILES, shardCount: 2, tablePath: box.table, ...io }),
    0,
    said.join('\n')
  )

  // The tree gained a file the runs never measured: the committed table no longer describes it.
  said.length = 0
  assert.equal(
    run({
      argv: ['--check-ci'],
      gh: fakeGh(runs),
      files: [...FILES, 'apps/a/test/new.test.mjs'],
      shardCount: 2,
      tablePath: box.table,
      ...io
    }),
    1
  )
  assert.match(said.join('\n'), /fewer than 3 samples/)

  // A named run was re-run: its attempt is no longer the one the numbers came from.
  const rerun = { ...runs, 13: { ...runs[13], run: goodRun(13, { head_sha: sha(3), run_attempt: 2 }) } }
  // A named run now answers for another pull request than the table recorded.
  const moved = { ...runs, 13: { ...runs[13], pulls: [pull(runs[13].run, { number: 99 })] } }
  said.length = 0
  assert.equal(
    run({
      argv: ['--check-ci'],
      gh: fakeGh(moved),
      files: FILES,
      shardCount: 2,
      tablePath: box.table,
      ...io
    }),
    1
  )
  assert.match(said.join('\n'), /ran for pull request #99, not #7/)
  said.length = 0
  assert.equal(
    run({
      argv: ['--check-ci'],
      gh: fakeGh(rerun),
      files: FILES,
      shardCount: 2,
      tablePath: box.table,
      ...io
    }),
    1
  )
  assert.match(said.join('\n'), /no longer the attempt/)

  // A hand-edited weight is not what the runs give.
  writeFileSync(
    box.table,
    `${JSON.stringify({ ...table, files: { ...table.files, 'apps/a/test/two.test.mjs': 1 } }, null, 2)}\n`
  )
  said.length = 0
  assert.equal(
    run({ argv: ['--check-ci'], gh: fakeGh(runs), files: FILES, shardCount: 2, tablePath: box.table, ...io }),
    1
  )
  assert.match(said.join('\n'), /not what its runs give/)
})

test('every refusal and every GitHub failure leaves the table byte for byte', (t) => {
  const box = sandbox()
  t.after(box.done)
  const said: string[] = []
  const io = { out: (l: string) => said.push(l), err: (l: string) => said.push(l) }
  const attempt = (gh: (args: string[]) => string, argv: string[] = [], files: string[] = FILES): number => {
    writeFileSync(box.table, OLD)
    said.length = 0
    const code = run({ argv, gh, files, shardCount: 2, tablePath: box.table, ...io })
    assert.equal(readFileSync(box.table, 'utf8'), OLD, `table changed: ${said.join(' ')}`)
    assert.deepEqual(readdirSync(box.dir), ['test-timings.json'])
    return code
  }
  const runs = fixtureRuns()

  // Network, authentication, timeout: nothing was learnt. It is not "the logs have no durations".
  assert.equal(
    attempt(() => {
      throw new UnknownError('gh api failed: error connecting to api.github.com')
    }),
    3
  )
  assert.match(said.join('\n'), /UNKNOWN/)
  assert.doesNotMatch(said.join('\n'), /no tracy-test-timing line/)
  assert.equal(
    attempt(() => 'not json'),
    3
  )
  assert.equal(
    attempt(() => '{}'),
    3,
    'a list with no workflow_runs is unknown, not empty'
  )
  const emptyLog = (args: string[]): string => (args[0] === 'run' ? '' : fakeGh(runs)(args))
  assert.equal(attempt(emptyLog), 3, 'an empty log is a failed download')
  const dies = (args: string[]): string => {
    if (args[0] === 'run' && args[2] === '17') throw new UnknownError('gh run view failed: timeout')
    return fakeGh(runs)(args)
  }
  assert.equal(attempt(dies), 3)

  // Two eligible runs are not three.
  const two = { 11: runs[11], 13: runs[13], 15: runs[15] }
  assert.equal(attempt(fakeGh(two)), 1)
  assert.match(said.join('\n'), /2 eligible run\(s\) with telemetry; 3 are needed/)
  assert.match(said.join('\n'), /NOT changed/)

  // A file with no sample.
  assert.equal(attempt(fakeGh(runs), [], [...FILES, 'apps/a/test/new.test.mjs']), 1)
  assert.match(said.join('\n'), /apps\/a\/test\/new\.test\.mjs \(0\)/)

  // No file list, and a table that is not CI-derived under --check-ci (no network at all).
  assert.equal(attempt(fakeGh(runs), [], []), 1)
  let asked = 0
  assert.equal(
    attempt(() => {
      asked += 1
      return '{}'
    }, ['--check-ci']),
    1
  )
  assert.match(said.join('\n'), /NOT CI-derived/)
  assert.equal(asked, 0)
})

test('the prediction uses the gate’s own split, counts rest once in wall seconds, and has a 30 s limit', () => {
  assert.equal(plannedShardCount(planMatrix), 2)
  assert.equal(BALANCE_LIMIT_SECONDS, 30)
  const runs = [sampleRun(1, 1, 10), sampleRun(2, 1, 10), sampleRun(3, 1, 10)]
  const made = tableFromSamples({ files: FILES, runs, repo: 'o/r' })
  assert.ok('table' in made)
  const table = made.table
  // Summed: 10, 30, 20, 20; factor 0.5; rest 10 s wall = 20 summed, preloaded on shard 2.
  const good = predictBalance({ files: FILES, table, shardOf, shardCount: 2 })
  assert.deepEqual(good.problems, [])
  assert.deepEqual(good.seconds, [25, 25], '(30+20)×0.5 and (20+10)×0.5 + 10 of rest')
  assert.equal(good.ok, true)

  const missing = predictBalance({
    files: [...FILES, 'apps/a/test/new.test.mjs'],
    table,
    shardOf,
    shardCount: 2
  })
  assert.equal(missing.ok, false)
  assert.match(missing.problems.join(' | '), /1 of 5 workers files are not in the table/)

  const stale = predictBalance({ files: FILES.slice(1), table, shardOf, shardCount: 2 })
  assert.match(stale.problems.join(' | '), /1 table entries name files that are gone/)

  const typed = predictBalance({
    files: FILES,
    table: { files: table.files, preloadLastShardSeconds: 20 },
    shardOf,
    shardCount: 2
  })
  assert.equal(typed.ok, false)
  assert.match(typed.problems.join(' | '), /not CI-derived/)

  const heavy = { ...table, files: { ...table.files, 'apps/a/test/two.test.mjs': 400 } }
  const lopsided = predictBalance({ files: FILES, table: heavy, shardOf, shardCount: 2 })
  assert.equal(lopsided.ok, false)
  assert.match(lopsided.problems.join(' | '), /over the 30 s limit/)

  const none = predictBalance({
    files: FILES.slice(0, 1),
    table: { ...table, files: { [FILES[0]]: 10 } },
    shardOf,
    shardCount: 2
  })
  assert.match(none.problems.join(' | '), /gets no file/)
  assert.equal(predictBalance({ files: FILES, table, shardOf, shardCount: 1 }).ok, false)
})

test('a nightly is tied to the develop commit its own log says it tested, or not used at all', () => {
  const { nightlyCommitOf: read } = timings
  /** Its answer, read as either shape. */
  const nightlyCommitOf = (text: string, n: number): { sha?: string; refused?: string } => read(text, n)
  const D = 'd'.repeat(40)
  const say = (job: string, commit: string) => line(job, `nightly tree: plan selected ${commit}`)
  const jobs = ['plan the build-check rows', 'build check (tests 1/2)', 'build check (tests 2/2)']
  assert.deepEqual(read(jobs.map((j) => say(j, D)).join('\n'), 2), { sha: D })
  // Every job names one commit, but not the same one.
  const two = [say(jobs[0], D), say(jobs[1], D), say(jobs[2], 'e'.repeat(40))].join('\n')
  assert.match(String(nightlyCommitOf(two, 2).refused), /2 different pinned commits/)
  // The plan job never said it: nothing ties the rows to a commit.
  assert.match(
    String(nightlyCommitOf([say(jobs[1], D), say(jobs[2], D)].join('\n'), 2).refused),
    /"plan the build-check rows" printed the pinned develop commit 0 time/
  )
  // Not a whole log line, a short commit, or the line inside other text: not the pin.
  for (const bad of [
    `nightly tree: plan selected ${D}`,
    jobs.map((j) => say(j, D.slice(0, 39))).join('\n'),
    jobs.map((j) => line(j, `echo nightly tree: plan selected ${D}`)).join('\n')
  ])
    assert.ok('refused' in nightlyCommitOf(bad, 2), bad.slice(0, 60))
  // The workflow prints exactly that line: in `plan`, and in each row before its checkout.
  const yml = readFileSync(join(import.meta.dirname, '../../.github/workflows/tracy-ci.yml'), 'utf8')
  assert.match(yml, /echo "nightly tree: plan selected \$SHA"/)
  assert.match(yml, /echo "nightly tree: plan selected \$NIGHTLY_SHA"/)
})
