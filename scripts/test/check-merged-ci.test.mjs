#!/usr/bin/env node
/**
 * The after-merge check: the verdict on a list of Tracy CI runs — the NEWEST run decides, whatever
 * order the list comes in — and the script end to end on a saved payload with no network (the
 * second argument replaces the API call).
 *
 *   node --test scripts/test/check-merged-ci.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mergedCiVerdict, readRuns } from '../check-merged-ci.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../check-merged-ci.mjs')
// Each call is a NEWER run than the one before it: a higher run number, created and started later.
let serial = 0
const at = (second) => new Date(Date.UTC(2026, 9, 5, 8, 0, second)).toISOString().replace('.000Z', 'Z')
const run = (status, conclusion) => {
  serial += 1
  return {
    id: 9000 + serial,
    run_number: serial,
    run_attempt: 1,
    created_at: at(serial),
    run_started_at: at(serial),
    status,
    conclusion,
    html_url: `https://x/${serial}-${status}-${conclusion}`
  }
}
/** Both list orders: the verdict must not depend on which one the API happened to return. */
const bothOrders = (older, newer) => [
  [older, newer],
  [newer, older]
]

test('a green newest run passes, even beside an older cancelled one', () => {
  for (const runs of bothOrders(run('completed', 'cancelled'), run('completed', 'success'))) {
    const v = mergedCiVerdict(runs)
    assert.equal(v.ok, true, v.reason)
  }
})

test('an older green run does not cover a newer failed, cancelled, timed-out or skipped one', () => {
  for (const conclusion of [
    'failure',
    'cancelled',
    'timed_out',
    'skipped',
    'action_required',
    'neutral',
    null
  ]) {
    for (const runs of bothOrders(run('completed', 'success'), run('completed', conclusion))) {
      const v = mergedCiVerdict(runs)
      assert.equal(v.ok, false, `${conclusion}: ${v.reason}`)
      assert.match(v.reason, new RegExp(`\`${conclusion}\``))
      assert.match(v.reason, new RegExp(runs.find((r) => r.conclusion === conclusion).html_url))
    }
  }
})

test('an older green run does not cover a newer run that has not finished', () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'requested', 'pending']) {
    for (const runs of bothOrders(run('completed', 'success'), run(status, null))) {
      const v = mergedCiVerdict(runs)
      assert.equal(v.ok, false, `${status}: ${v.reason}`)
      assert.match(v.reason, /still running/)
    }
  }
})

test('a re-run attempt of the newest run decides: the list carries only its latest attempt', () => {
  const green = run('completed', 'success')
  assert.equal(
    mergedCiVerdict([{ ...green, run_attempt: 2, status: 'in_progress', conclusion: null }]).ok,
    false
  )
  assert.equal(mergedCiVerdict([{ ...green, run_attempt: 2, conclusion: 'failure' }]).ok, false)
  assert.equal(mergedCiVerdict([{ ...green, run_attempt: 2 }]).ok, true)
})

test('an older run that was run again after a newer green one decides, by when its attempt started', () => {
  for (const [status, conclusion, reason] of [
    ['completed', 'failure', /`failure`/],
    ['completed', 'cancelled', /`cancelled`/],
    ['in_progress', null, /still running/],
    ['queued', null, /still running/]
  ]) {
    const old = run('completed', 'success')
    const green = run('completed', 'success')
    const again = {
      ...old,
      run_attempt: 2,
      run_started_at: at(serial + 30),
      status,
      conclusion,
      html_url: 'https://x/again'
    }
    assert.ok(again.run_number < green.run_number)
    for (const runs of bothOrders(again, green)) {
      const v = mergedCiVerdict(runs)
      assert.equal(v.ok, false, `${status}/${conclusion}: ${v.reason}`)
      assert.match(v.reason, reason)
      assert.match(v.reason, /https:\/\/x\/again/)
    }
    // Green again: that attempt is the verdict. Re-run red BEFORE the newer run: the newer one is.
    for (const runs of bothOrders({ ...again, status: 'completed', conclusion: 'success' }, green))
      assert.equal(mergedCiVerdict(runs).ok, true)
    const early = { ...old, run_attempt: 2, conclusion: 'failure', run_started_at: old.created_at }
    for (const runs of bothOrders(early, green)) assert.equal(mergedCiVerdict(runs).ok, true)
  }
})

test('runs that cannot be put in order are red, never guessed at', () => {
  const older = run('completed', 'success')
  const newer = run('completed', 'failure')
  const cases = {
    'no run number': [older, { ...newer, run_number: undefined }],
    'run number as text': [older, { ...newer, run_number: '7' }],
    'attempt zero': [older, { ...newer, run_attempt: 0 }],
    'no creation time': [older, { ...newer, created_at: 'yesterday' }],
    'created on 31 February': [older, { ...newer, created_at: '2026-02-31T08:00:00Z' }],
    'no start time': [older, { ...newer, run_started_at: undefined }],
    'started on 31 February': [older, { ...newer, run_started_at: '2027-02-31T08:00:00Z' }],
    'started at hour 24': [older, { ...newer, run_started_at: '2026-10-05T24:00:00Z' }],
    'started before it was created': [older, { ...newer, run_started_at: older.created_at }],
    'a re-run started in the same second as the newer run': [
      { ...older, run_attempt: 2, run_started_at: newer.run_started_at },
      newer
    ],
    'same id twice': [older, { ...newer, id: older.id }],
    'same run number twice': [older, { ...newer, run_number: older.run_number }],
    'number and time disagree': [older, { ...newer, created_at: '2026-10-05T07:00:00Z' }],
    'not a list': { workflow_runs: [older] }
  }
  for (const [name, runs] of Object.entries(cases)) {
    const v = mergedCiVerdict(runs)
    assert.equal(v.ok, false, name)
    assert.match(v.reason, /Could not tell which Tracy CI run/, name)
  }
})

test('a contradiction between ANY two runs refuses the list, not only one at its top', () => {
  // Numbers 10/11/12 created 08:20/08:10/08:30: the highest number is also the latest creation, so
  // only comparing neighbours sees it. Run 10 was then re-run green at 09:00 and would decide.
  const r = (n, created, over = {}) => ({
    id: 100 + n,
    run_number: n,
    run_attempt: 1,
    created_at: created,
    run_started_at: created,
    status: 'completed',
    conclusion: 'failure',
    ...over
  })
  const rerun = { run_attempt: 2, run_started_at: '2026-10-05T09:00:00Z', conclusion: 'success' }
  const cases = {
    'created out of number order below the top': [
      r(10, '2026-10-05T08:20:00Z', rerun),
      r(11, '2026-10-05T08:10:00Z'),
      r(12, '2026-10-05T08:30:00Z')
    ],
    'the same, with no re-run': [
      r(10, '2026-10-05T08:20:00Z', { conclusion: 'success' }),
      r(11, '2026-10-05T08:10:00Z'),
      r(12, '2026-10-05T08:30:00Z', { conclusion: 'success' })
    ],
    'first attempts started out of number order': [
      r(10, '2026-10-05T08:10:00Z', { run_started_at: '2026-10-05T08:40:00Z', conclusion: 'success' }),
      r(11, '2026-10-05T08:20:00Z'),
      r(12, '2026-10-05T08:30:00Z')
    ]
  }
  for (const [name, runs] of Object.entries(cases))
    for (const list of [runs, [...runs].reverse(), [runs[1], runs[2], runs[0]]]) {
      const v = mergedCiVerdict(list)
      assert.equal(v.ok, false, name)
      assert.match(v.reason, /Could not tell which Tracy CI run.*the two orders disagree/, name)
    }
  // The consistent shape of the first case still decides by the re-run: created in number order.
  const fine = [
    r(10, '2026-10-05T08:10:00Z', rerun),
    r(11, '2026-10-05T08:20:00Z'),
    r(12, '2026-10-05T08:30:00Z')
  ]
  assert.equal(mergedCiVerdict(fine).ok, true)
})

// ── the whole history of the commit, not its first page ─────────────────────────────────────────

/** A stub GET over pages of runs, newest first as the API lists them; `calls` records the paths. */
function pages(runs, { total = runs.length, size = 100 } = {}) {
  const calls = []
  const get = async (path) => {
    calls.push(path)
    const page = Number(new URL(path, 'https://x/').searchParams.get('page'))
    return { total_count: total, workflow_runs: runs.slice((page - 1) * size, page * size) }
  }
  return { get, calls }
}
const SHA = 'a'.repeat(40)

test('every page is read: an old run re-run late, at the far end of the list, decides', async () => {
  const old = run('completed', 'success')
  const middle = Array.from({ length: 119 }, () => run('completed', 'cancelled'))
  const green = run('completed', 'success')
  for (const [conclusion, ok] of [
    ['failure', false],
    ['success', true]
  ]) {
    const again = { ...old, run_attempt: 2, run_started_at: at(serial + 60), conclusion }
    // Newest first: the re-run old run is row 121, on page 2 — beyond the 20 rows once read.
    const { get, calls } = pages([green, ...middle.toReversed(), again])
    const read = await readRuns(get, 'o/r', SHA)
    assert.equal(read.runs.length, 121)
    assert.deepEqual(calls, [
      `repos/o/r/actions/workflows/tracy-ci.yml/runs?head_sha=${SHA}&per_page=100&page=1`,
      `repos/o/r/actions/workflows/tracy-ci.yml/runs?head_sha=${SHA}&per_page=100&page=2`
    ])
    assert.equal(mergedCiVerdict(read.runs).ok, ok)
    assert.equal(mergedCiVerdict(read.runs.slice(0, 20)).ok, true, 'the first 20 rows alone look green')
  }
})

test('a history that is cut short, too long or not a list is a problem, never a shorter history', async () => {
  const rows = Array.from({ length: 20 }, () => run('completed', 'success'))
  const cases = {
    'fewer rows than the count promises': [pages(rows, { total: 45 }), /truncated/],
    'a page repeated': [
      { get: async () => ({ total_count: 200, workflow_runs: rows.concat(rows, rows, rows, rows) }) },
      /listed twice/
    ],
    'more runs than this check reads': [pages(rows, { total: 1001 }), /beyond the 1000/],
    'no total_count': [{ get: async () => ({ workflow_runs: rows }) }, /not a list with a total_count/],
    'a bare array': [{ get: async () => rows }, /not a list with a total_count/],
    'a row without an id': [
      { get: async () => ({ total_count: 1, workflow_runs: [{ ...rows[0], id: null }] }) },
      /no positive integer id/
    ]
  }
  for (const [name, [{ get }, reason]] of Object.entries(cases)) {
    const read = await readRuns(get, 'o/r', SHA)
    assert.equal(read.runs, undefined, name)
    assert.match(read.problem, reason, name)
  }
  // A request that fails is not turned into a list either: it is thrown, and the job is red.
  await assert.rejects(
    readRuns(
      async () => {
        throw new Error('HTTP 502')
      },
      'o/r',
      SHA
    ),
    /HTTP 502/
  )
  assert.deepEqual(await readRuns(pages([]).get, 'o/r', SHA), { runs: [] })
})

test('no run at all (merged as a draft, or cancelled before it started) fails', () => {
  const v = mergedCiVerdict([])
  assert.equal(v.ok, false)
  assert.match(v.reason, /never ran/)
})

test('a run still in progress at merge time fails and says so', () => {
  const v = mergedCiVerdict([run('in_progress', null)])
  assert.equal(v.ok, false)
  assert.match(v.reason, /still running/)
})

test('a red or cancelled last run fails and names its conclusion', () => {
  assert.match(mergedCiVerdict([run('completed', 'failure')]).reason, /`failure`/)
  assert.match(mergedCiVerdict([run('completed', 'cancelled')]).reason, /`cancelled`/)
})

const dirs = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function script(pr, runs) {
  const dir = mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'merged-ci-'))
  dirs.push(dir)
  const payload = join(dir, 'event.json')
  const runsFile = join(dir, 'runs.json')
  writeFileSync(payload, JSON.stringify({ pull_request: pr, repository: { full_name: 'o/r' } }))
  writeFileSync(runsFile, JSON.stringify(runs))
  const env = { ...process.env }
  delete env.GITHUB_STEP_SUMMARY
  return spawnSync(process.execPath, [SCRIPT, payload, runsFile], { encoding: 'utf8', env })
}

const merged = { merged: true, number: 7, head: { sha: 'a'.repeat(40) }, base: { ref: 'develop' } }

test('end to end: a merge without a green run exits 1 with an ::error:: line', () => {
  const r = script(merged, [run('completed', 'failure')])
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /::error::/)
})

test('end to end: a merge with a green run exits 0', () => {
  const r = script(merged, [run('completed', 'success')])
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('end to end: a green run beside a NEWER red one exits 1 and names the red run', () => {
  const green = run('completed', 'success')
  const red = run('completed', 'failure')
  for (const runs of bothOrders(green, red)) {
    const r = script(merged, runs)
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /::error::.*`failure`/)
    assert.ok(r.stdout.includes(red.html_url), r.stdout)
  }
})

test('end to end: a pull request closed without merging is not checked', () => {
  const r = script({ ...merged, merged: false }, [])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /not a merge/)
})
