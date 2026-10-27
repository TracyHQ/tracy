#!/usr/bin/env node
/**
 * The pre-merge check, on saved GitHub responses — no network, no merge.
 *
 * `fixtures/pr-merge-api.json` is one real ready pull request with every required check green
 * (saved 05/10/2026, trimmed). Each case below changes one thing in a copy of it and asserts the
 * verdict. The transport is exercised with a stand-in `gh` put first on PATH, which also records
 * every argv — that is how "only GET" and "no merge after a refusal" are shown.
 *
 *   node --test scripts/test/check-pr-merge.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import {
  EXIT,
  emit,
  expectedHeadOf,
  fixtureTransport,
  ghTransport,
  LANES,
  newestRun,
  parseArgs,
  preflight,
  requiredJobs,
  SCHEMA,
  VERDICT_MAX_AGE_MS,
  WORKFLOWS
} from '../check-pr-merge.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const SCRIPT = resolve(HERE, '../check-pr-merge.mjs')
const FIXTURE = resolve(HERE, 'fixtures/pr-merge-api.json')
const SAVED = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const { repo: REPO, pr: PR, base: BASE } = SAVED
const PULL = `repos/${REPO}/pulls/${PR}`
const TARGET = `repos/${REPO}/git/ref/heads/${BASE}`
const HEAD = SAVED.responses[PULL][0].head.sha
const OTHER_SHA = 'b'.repeat(40)
const FILES = WORKFLOWS.map((w) => w.file)

const TMP = mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'pr-merge-'))
after(() => rmSync(TMP, { recursive: true, force: true }))
let dirs = 0
const scratch = () => {
  const d = join(TMP, String(++dirs))
  mkdirSync(d)
  return d
}

// ── a copy of the saved responses, and ways to change one thing in it ───────────────────────────

const world = () => structuredClone(SAVED)
const runsPath = (file, page = 1, head = HEAD) =>
  `repos/${REPO}/actions/workflows/${file}/runs?head_sha=${head}&per_page=100&page=${page}`
const jobsPath = (id, attempt = 1, page = 1) =>
  `repos/${REPO}/actions/runs/${id}/attempts/${attempt}/jobs?per_page=100&page=${page}`
const runsOf = (w, file) => w.responses[runsPath(file)][0]
const greenRun = (w, file) => runsOf(w, file).workflow_runs.find((r) => r.conclusion === 'success')
const jobsOf = (w, file) => w.responses[jobsPath(greenRun(w, file).id)][0]
const pull = (w) => w.responses[PULL][0]

/** A run of the same workflow, pull request and head, newer than every saved one. */
function newer(w, file, over = {}) {
  const list = runsOf(w, file)
  const green = greenRun(w, file)
  const run = {
    ...structuredClone(green),
    id: green.id + 1_000_000,
    run_number: Math.max(...list.workflow_runs.map((r) => r.run_number)) + 1,
    created_at: '2026-10-05T09:00:00Z',
    run_started_at: '2026-10-05T09:00:00Z',
    html_url: `https://github.com/${REPO}/actions/runs/newer`,
    ...over
  }
  list.workflow_runs.push(run)
  list.total_count += 1
  return run
}

/** An in-memory transport over a world; `calls` records every path asked for. */
function transport(w) {
  const calls = []
  const served = new Map()
  const get = async (path) => {
    calls.push(path)
    const list = w.responses[path]
    if (!Array.isArray(list)) throw new Error(`no saved response for ${path}`)
    const n = served.get(path) ?? 0
    served.set(path, n + 1)
    const body = list[Math.min(n, list.length - 1)]
    if (body instanceof Error) throw body
    return structuredClone(body)
  }
  return { get, calls }
}

async function verdictOf(w, over = {}) {
  const { get, calls } = transport(w)
  const v = await preflight({ repo: REPO, pr: PR, base: BASE, get, ...over })
  return { v, calls }
}

/** A refusal: the verdict, a reason that says why, and nothing a merge could be made from. */
async function refuses(w, verdict, reason, over) {
  const { v } = await verdictOf(w, over)
  assert.equal(v.verdict, verdict, `${v.verdict}: ${v.reason}`)
  assert.match(v.reason, reason)
  assert.deepEqual(
    Object.keys(v).sort(),
    ['reason', 'verdict'],
    'a refusal carries no head, target or checks'
  )
}

// ── the policy against the workflow files it describes ──────────────────────────────────────────

test('policy: the five workflows exist, run on pull requests, and still carry these job names and lanes', () => {
  assert.deepEqual(FILES, [
    'tracy-ci.yml',
    'changelog-check.yml',
    'pr-description-check.yml',
    'regression-check.yml',
    'branch-fresh-check.yml'
  ])
  for (const w of WORKFLOWS) {
    const yml = readFileSync(join(ROOT, '.github/workflows', w.file), 'utf8')
    assert.match(yml, new RegExp(`^name: ${w.name}$`, 'm'), w.file)
    assert.match(yml, /^ {2}pull_request:\n {4}branches: \[main, staging, develop\]$/m, w.file)
    for (const job of w.jobs) assert.ok(yml.includes(`    name: ${job}\n`), `${w.file}: job "${job}"`)
    // Pull-request jobs never ask for the production lane (docs/references/public-repo-ci.md).
    for (const job of Object.values(load(yml).jobs)) {
      const labels = [job['runs-on']].flat().map(String)
      if (!labels.includes('self-hosted')) continue
      const lane = labels.at(-1)
      assert.ok(
        lane === LANES.develop ||
          lane.includes("github.event_name == 'push'") ||
          lane.includes("github.event_name == 'workflow_dispatch'"),
        `${w.file}: lane ${lane}`
      )
    }
  }
  const ci = readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8')
  assert.ok(ci.includes('    name: build check (${{ matrix.group }})\n'), 'the matrix job name')
})

test('policy: into develop checks are always required, into staging and main every row', () => {
  const fixed = ['build dsh once for this run', 'plan the build-check rows']
  assert.deepEqual(requiredJobs('tracy-ci.yml', 'develop'), [...fixed, 'build check (checks)'])
  assert.deepEqual(
    requiredJobs('tracy-ci.yml', 'main').sort(),
    [
      ...fixed,
      'build check (tests emdash-business)',
      'build check (tests emdash-saas)',
      'build check (tests emdash-base)',
      'build check (tests e2e)',
      'build check (tests 1/2)',
      'build check (tests 2/2)',
      'build check (checks)'
    ].sort()
  )
  assert.deepEqual(requiredJobs('tracy-ci.yml', 'staging'), requiredJobs('tracy-ci.yml', 'main'))
  for (const base of ['develop', 'staging', 'main']) assert.equal(LANES[base], 'tracy-lane-dev', base)
  assert.deepEqual(requiredJobs('branch-fresh-check.yml', 'main'), ['branch-fresh'])
  assert.throws(() => requiredJobs('ci-before-merge.yml', 'main'))
})

// ── PASS ────────────────────────────────────────────────────────────────────────────────────────

test('the saved pull request passes: newest run of each workflow, head and target named, read twice', async () => {
  const { v, calls } = await verdictOf(world(), { now: () => Date.parse('2026-10-05T10:00:00Z') })
  assert.equal(v.verdict, 'PASS', v.reason)
  assert.equal(v.schema, SCHEMA)
  assert.equal(v.source, 'github')
  assert.equal(v.expectedHead, HEAD)
  assert.equal(v.targetSha, SAVED.responses[TARGET][0].object.sha)
  assert.equal(v.checkedAt, '2026-10-05T10:00:00.000Z')
  assert.match(v.enforcement, /^none/)
  assert.deepEqual(
    v.checks.map((c) => [c.file, c.runNumber, c.runAttempt]),
    FILES.map((f) => [f, Math.max(...runsOf(SAVED, f).workflow_runs.map((r) => r.run_number)), 1])
  )
  // The saved lists hold the draft-time `skipped` runs too: they are older and must not decide.
  assert.ok(FILES.every((f) => runsOf(SAVED, f).workflow_runs.some((r) => r.conclusion === 'skipped')))
  assert.deepEqual(calls.slice(0, 2), [PULL, TARGET])
  assert.deepEqual(calls.slice(-2), [PULL, TARGET], 'the pull request and the target are read again last')
  assert.deepEqual(
    calls.slice(-7, -2).sort(),
    FILES.map((f) => runsPath(f)).sort(),
    'every run list is read again after the jobs, before the pull request'
  )
  assert.deepEqual(
    v.checks.map((c) => c.runStartedAt),
    FILES.map((f) => greenRun(SAVED, f).run_started_at)
  )
  assert.equal(calls.length, 19)
})

test('the order of the list does not matter', async () => {
  for (const order of ['reverse', 'sort']) {
    const w = world()
    for (const f of FILES) {
      const list = runsOf(w, f).workflow_runs
      if (order === 'reverse') list.reverse()
      else list.sort((a, b) => a.run_number - b.run_number)
    }
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'PASS', v.reason)
    assert.deepEqual(
      v.checks.map((c) => c.runId),
      FILES.map((f) => greenRun(SAVED, f).id)
    )
  }
})

// ── the newest run decides ──────────────────────────────────────────────────────────────────────

test('an older green run does not cover a newer run that ended any other way — every workflow', async () => {
  for (const file of FILES) {
    for (const conclusion of [
      'failure',
      'cancelled',
      'timed_out',
      'skipped',
      'action_required',
      'neutral',
      'stale',
      'startup_failure',
      'made_up',
      null
    ]) {
      for (const first of [true, false]) {
        const w = world()
        const run = newer(w, file, { conclusion })
        if (first) runsOf(w, file).workflow_runs.unshift(runsOf(w, file).workflow_runs.pop())
        await refuses(w, 'FAIL', new RegExp(`run ${run.run_number} attempt 1 .*ended \`${conclusion}\``))
      }
    }
  }
})

test('an older green run does not cover a newer run that has not finished — every workflow', async () => {
  for (const file of FILES) {
    for (const status of ['queued', 'in_progress', 'waiting', 'requested', 'pending', 'made_up']) {
      const w = world()
      newer(w, file, { status, conclusion: null })
      await refuses(w, 'FAIL', new RegExp(`is \`${status}\`, not finished`))
    }
  }
})

test('a re-run decides through its latest attempt', async () => {
  for (const file of FILES) {
    const pending = world()
    Object.assign(greenRun(pending, file), { run_attempt: 2, status: 'in_progress', conclusion: null })
    await refuses(pending, 'FAIL', /attempt 2 .*not finished/)

    const red = world()
    Object.assign(greenRun(red, file), { run_attempt: 2, conclusion: 'failure' })
    await refuses(red, 'FAIL', /attempt 2 .*ended `failure`/)

    const green = world()
    const run = greenRun(green, file)
    const jobs = green.responses[jobsPath(run.id)]
    delete green.responses[jobsPath(run.id)]
    run.run_attempt = 2
    for (const j of jobs[0].jobs) j.run_attempt = 2
    green.responses[jobsPath(run.id, 2)] = jobs
    const { v, calls } = await verdictOf(green)
    assert.equal(v.verdict, 'PASS', v.reason)
    assert.equal(v.checks.find((c) => c.file === file).runAttempt, 2)
    assert.ok(calls.includes(jobsPath(run.id, 2)), 'the jobs of attempt 2 are the ones read')
  }
})

test('no run of a required workflow on this head fails: never ran, or only while a draft', async () => {
  for (const file of FILES) {
    const none = world()
    none.responses[runsPath(file)] = [{ total_count: 0, workflow_runs: [] }]
    await refuses(none, 'FAIL', /no pull_request run for #893/)

    const draftOnly = world()
    const list = runsOf(draftOnly, file)
    list.workflow_runs = list.workflow_runs.filter((r) => r.conclusion !== 'success')
    list.total_count = list.workflow_runs.length
    await refuses(draftOnly, 'FAIL', /ended `skipped`/)
  }
})

// ── what is not evidence ────────────────────────────────────────────────────────────────────────

const NOT_OURS = {
  'another pull request': (r) => {
    r.pull_requests[0].number = PR + 1
  },
  'another head in the pull request entry': (r) => {
    r.pull_requests[0].head.sha = OTHER_SHA
  },
  'another target': (r) => {
    r.pull_requests[0].base.ref = 'main'
  },
  'another commit': (r) => {
    r.head_sha = OTHER_SHA
  },
  'a manual run': (r) => {
    r.event = 'workflow_dispatch'
  },
  'the nightly': (r) => {
    r.event = 'schedule'
  },
  'a push': (r) => {
    r.event = 'push'
  },
  'another workflow file': (r) => {
    r.path = '.github/workflows/something-else.yml'
  }
}

test('a green run that is not this pull request, head, target and workflow is not evidence', async () => {
  for (const file of FILES) {
    for (const [name, change] of Object.entries(NOT_OURS)) {
      const w = world()
      change(greenRun(w, file))
      const { v } = await verdictOf(w)
      assert.equal(v.verdict, 'FAIL', `${file}, ${name}: ${v.verdict} ${v.reason}`)
      assert.equal(v.expectedHead, undefined)
    }
  }
})

test("somebody else's newer red run does not turn this pull request red", async () => {
  for (const [name, change] of Object.entries(NOT_OURS)) {
    const w = world()
    change(newer(w, 'tracy-ci.yml', { conclusion: 'failure' }))
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'PASS', `${name}: ${v.reason}`)
    assert.equal(v.checks[0].runId, greenRun(SAVED, 'tracy-ci.yml').id)
  }
})

test('a run that cannot be tied to a pull request is UNKNOWN, not somebody else', async () => {
  const cases = {
    'no pull request named': (r) => {
      r.pull_requests = []
    },
    'no list': (r) => {
      delete r.pull_requests
    },
    'entry without a head': (r) => {
      delete r.pull_requests[0].head
    },
    'entry with a short sha': (r) => {
      r.pull_requests[0].head.sha = 'abc'
    },
    'entry without a base': (r) => {
      r.pull_requests[0].base = null
    },
    'entry with a text number': (r) => {
      r.pull_requests[0].number = String(PR)
    },
    'this pull request twice': (r) => {
      r.pull_requests.push(structuredClone(r.pull_requests[0]))
    }
  }
  for (const [name, change] of Object.entries(cases)) {
    for (const which of ['the green run', 'a newer run']) {
      const w = world()
      change(
        which === 'the green run' ? greenRun(w, 'regression-check.yml') : newer(w, 'regression-check.yml')
      )
      const { v } = await verdictOf(w)
      assert.equal(v.verdict, 'UNKNOWN', `${name}, ${which}: ${v.verdict} ${v.reason}`)
    }
  }
})

// ── metadata that cannot say which run is newest ────────────────────────────────────────────────

test('run metadata that cannot be ordered is UNKNOWN', async () => {
  const cases = {
    'id as text': (r) => {
      r.id = String(r.id)
    },
    'id zero': (r) => {
      r.id = 0
    },
    'run number missing': (r) => {
      delete r.run_number
    },
    'run number a fraction': (r) => {
      r.run_number += 0.5
    },
    'attempt zero': (r) => {
      r.run_attempt = 0
    },
    'attempt as text': (r) => {
      r.run_attempt = '1'
    },
    'attempt negative': (r) => {
      r.run_attempt = -1
    },
    'creation time unreadable': (r) => {
      r.created_at = 'yesterday'
    },
    'creation time impossible': (r) => {
      r.created_at = '2026-13-45T99:99:99Z'
    },
    'creation time missing': (r) => {
      delete r.created_at
    },
    // `Date.parse` accepts these and rolls them into the next month or day.
    'creation time on 31 February': (r) => {
      r.created_at = '2026-02-31T09:00:00Z'
    },
    'creation time on 31 September': (r) => {
      r.created_at = '2026-09-31T09:00:00Z'
    },
    'creation time at hour 24': (r) => {
      r.created_at = '2026-10-04T24:00:00Z'
    },
    'creation time on 29 February of a common year': (r) => {
      r.created_at = '2026-02-29T09:00:00.000Z'
    },
    'start time missing': (r) => {
      delete r.run_started_at
    },
    'start time null': (r) => {
      r.run_started_at = null
    },
    'start time unreadable': (r) => {
      r.run_started_at = 'just now'
    },
    'start time without a zone': (r) => {
      r.run_started_at = '2026-10-05T09:00:00'
    },
    'start time on 31 February': (r) => {
      r.run_started_at = '2027-02-31T09:00:00Z'
    },
    'start time at hour 24': (r) => {
      r.run_started_at = '2026-10-05T24:00:00Z'
    },
    'started before it was created': (r) => {
      r.run_started_at = '2026-10-05T08:59:59Z'
    },
    'status missing': (r) => {
      delete r.status
    },
    'conclusion a number': (r) => {
      r.conclusion = 1
    },
    'event missing': (r) => {
      delete r.event
    },
    'head missing': (r) => {
      delete r.head_sha
    },
    'path missing': (r) => {
      delete r.path
    },
    'same id as an older run': (r, w) => {
      r.id = greenRun(w, 'changelog-check.yml').id
    },
    'same run number as an older run': (r, w) => {
      r.run_number = greenRun(w, 'changelog-check.yml').run_number
    },
    'newer by number, older by time': (r) => {
      r.created_at = '2026-10-05T01:00:00Z'
    }
  }
  for (const [name, change] of Object.entries(cases)) {
    const w = world()
    const run = newer(w, 'changelog-check.yml', { conclusion: 'failure' })
    change(run, w)
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'UNKNOWN', `${name}: ${v.verdict} ${v.reason}`)
  }
  const notARun = world()
  runsOf(notARun, 'changelog-check.yml').workflow_runs.push('run')
  runsOf(notARun, 'changelog-check.yml').total_count += 1
  await refuses(notARun, 'UNKNOWN', /no positive integer id/)
})

test('newestRun: the latest start decides; first attempts in one second go by number; an empty list is no run', () => {
  const r = (id, n, created, started = created, attempt = 1) => ({
    id,
    run_number: n,
    run_attempt: attempt,
    created_at: created,
    run_started_at: started,
    status: 'completed',
    conclusion: 'success'
  })
  const T = '2026-10-05T08:00:00Z'
  const a = r(1, 10, T)
  const b = r(2, 12, T)
  const c = r(3, 11, T)
  assert.equal(newestRun([a, b, c]).run, b)
  assert.equal(newestRun([c, a, b]).run, b)
  // Run 10 was re-run after run 12 started: its attempt 2 is the latest word.
  const again = r(1, 10, T, '2026-10-05T08:05:00Z', 2)
  assert.equal(newestRun([again, b, c]).run, again)
  assert.equal(newestRun([b, c, again]).run, again)
  // A re-run that started in the same second as another run cannot be placed.
  const tie = r(1, 10, '2026-10-05T07:00:00Z', T, 2)
  assert.match(newestRun([tie, b]).problem, /same second/)
  assert.match(newestRun([b, tie]).problem, /same second/)
  // …but a tie among older runs does not matter when a later start exists.
  const late = r(4, 13, '2026-10-05T08:10:00Z')
  assert.equal(newestRun([tie, b, late]).run, late)
  assert.match(newestRun([r(5, 14, T, '2026-10-05T07:59:59Z')]).problem, /before the run was created/)
  assert.match(newestRun([{ ...a, run_started_at: undefined }]).problem, /run_started_at/)
  assert.match(newestRun([r(6, 15, '2026-02-31T08:00:00Z')]).problem, /created_at is not a timestamp/)
  assert.match(newestRun([r(6, 15, T, '2026-02-31T08:00:00Z')]).problem, /run_started_at/)
  assert.equal(newestRun([r(7, 16, '2028-02-29T08:00:00.5Z')]).run.id, 7, 'a real leap day, with a fraction')
  // Numbers and times are compared pair by pair, not only against the highest number: 10/11/12
  // created 08:20/08:10/08:30, and run 10 re-run green at 09:00, is not an order to pick from.
  const x = r(1, 10, '2026-10-05T08:20:00Z', '2026-10-05T09:00:00Z', 2)
  const y = r(2, 11, '2026-10-05T08:10:00Z')
  const z = r(3, 12, '2026-10-05T08:30:00Z')
  for (const list of [
    [x, y, z],
    [z, y, x],
    [y, z, x],
    [r(1, 10, '2026-10-05T08:20:00Z'), y, z]
  ])
    assert.match(newestRun(list).problem, /run 2 \(number 11\) was created before run 1 \(number 10\)/)
  // First attempts must also START in number order; only a re-run may start late.
  const slow = r(1, 10, '2026-10-05T08:05:00Z', '2026-10-05T08:40:00Z')
  assert.match(newestRun([slow, z]).problem, /first started before run 1/)
  assert.match(newestRun([z, slow]).problem, /first started before run 1/)
  assert.equal(newestRun([{ ...slow, run_attempt: 2 }, z]).run.id, 1)
  assert.deepEqual(newestRun([]), { run: null })
  assert.match(newestRun(null).problem, /not a list/)
  assert.match(newestRun([a, null]).problem, /not an object/)
})

// ── an older run, run again ─────────────────────────────────────────────────────────────────────

/** An OLDER run (lower number, created earlier) whose attempt 2 started after everything else. */
function olderRerun(w, file, over = {}) {
  const list = runsOf(w, file)
  const green = greenRun(w, file)
  const run = {
    ...structuredClone(green),
    id: green.id - 1_000_000,
    run_number: Math.min(...list.workflow_runs.map((r) => r.run_number)) - 1,
    run_attempt: 2,
    created_at: '2026-10-05T08:30:00Z',
    run_started_at: '2026-10-05T09:30:00Z',
    html_url: `https://github.com/${REPO}/actions/runs/older-rerun`,
    ...over
  }
  list.workflow_runs.push(run)
  list.total_count += 1
  return run
}

test('an older run that was run again after the green one decides — every workflow, either list order', async () => {
  const shapes = {
    failure: [{ conclusion: 'failure' }, /attempt 2 .*ended `failure`/],
    cancelled: [{ conclusion: 'cancelled' }, /attempt 2 .*ended `cancelled`/],
    timed_out: [{ conclusion: 'timed_out' }, /attempt 2 .*ended `timed_out`/],
    in_progress: [{ status: 'in_progress', conclusion: null }, /attempt 2 .*is `in_progress`, not finished/],
    queued: [{ status: 'queued', conclusion: null }, /attempt 2 .*is `queued`, not finished/]
  }
  for (const file of FILES) {
    for (const [name, [over, reason]] of Object.entries(shapes)) {
      for (const first of [true, false]) {
        const w = world()
        const run = olderRerun(w, file, over)
        assert.ok(run.run_number < greenRun(w, file).run_number, 'the re-run has the LOWER run number')
        if (first) runsOf(w, file).workflow_runs.unshift(runsOf(w, file).workflow_runs.pop())
        const { v } = await verdictOf(w)
        assert.equal(v.verdict, 'FAIL', `${file} ${name}: ${v.verdict} ${v.reason}`)
        assert.match(v.reason, reason, `${file} ${name}`)
        assert.match(v.reason, new RegExp(`run ${run.run_number} attempt 2`), `${file} ${name}`)
      }
    }
  }
})

test('an older run whose re-run is green is the evidence; one re-run BEFORE the green run is not', async () => {
  for (const file of FILES) {
    const w = world()
    const run = olderRerun(w, file)
    w.responses[jobsPath(run.id, 2)] = [
      {
        ...structuredClone(jobsOf(w, file)),
        jobs: jobsOf(w, file).jobs.map((j) => ({ ...j, run_id: run.id, run_attempt: 2 }))
      }
    ]
    const { v, calls } = await verdictOf(w)
    assert.equal(v.verdict, 'PASS', v.reason)
    const check = v.checks.find((c) => c.file === file)
    assert.deepEqual([check.runId, check.runAttempt], [run.id, 2])
    assert.ok(!calls.includes(jobsPath(greenRun(w, file).id)), 'the jobs of the superseded run are not read')

    // Re-run red, but before the newer run started: the newer green run is the latest word.
    const before = world()
    olderRerun(before, file, { conclusion: 'failure', run_started_at: '2026-10-05T08:36:00Z' })
    const kept = await verdictOf(before)
    assert.equal(kept.v.verdict, 'PASS', kept.v.reason)
    assert.equal(kept.v.checks.find((c) => c.file === file).runId, greenRun(before, file).id)
  }
})

test('a re-run that started in the same second as the newest run cannot be ordered: UNKNOWN', async () => {
  for (const file of FILES) {
    for (const conclusion of ['failure', 'success']) {
      const w = world()
      olderRerun(w, file, { conclusion, run_started_at: greenRun(w, file).run_started_at })
      await refuses(w, 'UNKNOWN', /started in the same second/)
    }
  }
})

test('a re-run among runs whose numbers and times disagree below the newest is UNKNOWN — every workflow', async () => {
  for (const file of FILES) {
    for (const conclusion of ['success', 'failure']) {
      for (const first of [true, false]) {
        // The re-run older run was created AFTER a run with a higher number, yet the highest
        // number is still the latest creation: only comparing every neighbouring pair sees it.
        const w = world()
        const lowest = Math.min(...runsOf(w, file).workflow_runs.map((r) => r.run_number))
        const neighbour = runsOf(w, file).workflow_runs.find((r) => r.run_number === lowest)
        assert.ok(neighbour.created_at < greenRun(w, file).created_at, 'the saved runs leave room')
        const run = olderRerun(w, file, { conclusion, created_at: '2026-10-05T08:36:40Z' })
        assert.ok(run.created_at > neighbour.created_at && run.created_at < greenRun(w, file).created_at)
        if (first) runsOf(w, file).workflow_runs.unshift(runsOf(w, file).workflow_runs.pop())
        await refuses(w, 'UNKNOWN', /was created before run .*the two orders disagree/)
      }
    }
  }
  // A first attempt that started after a higher-numbered first attempt did: not a re-run, no order.
  for (const file of FILES) {
    const w = world()
    olderRerun(w, file, { run_attempt: 1, conclusion: 'failure' })
    await refuses(w, 'UNKNOWN', /first started before run .*the two orders disagree/)
  }
})

// ── the runs moved while they were read ─────────────────────────────────────────────────────────

test('a run or attempt that starts while the jobs are read refuses the verdict — every workflow', async () => {
  const later = '2026-10-05T09:40:00Z'
  const cases = {
    'the checked run was re-run and is running': [
      (list, green) =>
        Object.assign(green, {
          run_attempt: 2,
          run_started_at: later,
          status: 'in_progress',
          conclusion: null
        }),
      'FAIL',
      /attempt 2 .*is `in_progress`, not finished/
    ],
    'the checked run was re-run and went red': [
      (list, green) => Object.assign(green, { run_attempt: 2, run_started_at: later, conclusion: 'failure' }),
      'FAIL',
      /attempt 2 .*ended `failure`/
    ],
    'the checked run was re-run and is green again': [
      (list, green) => Object.assign(green, { run_attempt: 2, run_started_at: later }),
      'FAIL',
      /attempt 1 was checked, but the newest is now .* attempt 2 .*during the preflight/
    ],
    'only the start time moved': [
      (list, green) => Object.assign(green, { run_started_at: later }),
      'FAIL',
      /during the preflight/
    ],
    'a new run appeared, still queued': [
      (list, green) => {
        list.workflow_runs.push({
          ...structuredClone(green),
          id: green.id + 1,
          run_number: green.run_number + 1,
          created_at: later,
          run_started_at: later,
          status: 'queued',
          conclusion: null
        })
        list.total_count += 1
      },
      'FAIL',
      /is `queued`, not finished/
    ],
    'a new run appeared, already green': [
      (list, green) => {
        list.workflow_runs.push({
          ...structuredClone(green),
          id: green.id + 1,
          run_number: green.run_number + 1,
          created_at: later,
          run_started_at: later
        })
        list.total_count += 1
      },
      'FAIL',
      /was checked, but the newest is now/
    ],
    'an older run was re-run and is running': [
      (list, green) => {
        list.workflow_runs.push({
          ...structuredClone(green),
          id: green.id - 1_000_000,
          run_number: Math.min(...list.workflow_runs.map((r) => r.run_number)) - 1,
          run_attempt: 2,
          created_at: '2026-10-05T08:00:00Z',
          run_started_at: later,
          status: 'in_progress',
          conclusion: null
        })
        list.total_count += 1
      },
      'FAIL',
      /attempt 2 .*is `in_progress`, not finished/
    ],
    'every run is gone': [
      (list) => Object.assign(list, { total_count: 0, workflow_runs: [] }),
      'FAIL',
      /no pull_request run/
    ],
    'the second list cannot be ordered': [
      (list, green) => delete green.run_started_at,
      'UNKNOWN',
      /run_started_at is not a timestamp/
    ],
    'the second list is cut short': [(list) => (list.total_count += 1), 'UNKNOWN', /truncated/],
    'the second list is not a list': [(list) => delete list.workflow_runs, 'UNKNOWN', /not a list/]
  }
  for (const file of FILES) {
    for (const [name, [change, verdict, reason]] of Object.entries(cases)) {
      const w = world()
      const second = structuredClone(runsOf(w, file))
      change(
        second,
        second.workflow_runs.find((r) => r.conclusion === 'success')
      )
      w.responses[runsPath(file)].push(second)
      const { get, calls } = transport(w)
      const v = await preflight({ repo: REPO, pr: PR, base: BASE, get })
      assert.equal(v.verdict, verdict, `${file}, ${name}: ${v.verdict} ${v.reason}`)
      assert.match(v.reason, reason, `${file}, ${name}`)
      assert.deepEqual(Object.keys(v).sort(), ['reason', 'verdict'], `${file}, ${name}`)
      assert.equal(calls.filter((c) => c === runsPath(file)).length, 2, `${file}, ${name}: read twice`)
      assert.ok(
        calls.lastIndexOf(runsPath(file)) > calls.indexOf(jobsPath(greenRun(w, file).id)),
        `${file}, ${name}: the second read comes after the jobs`
      )
    }
    const lost = world()
    lost.responses[runsPath(file)].push(new Error('gh api: no answer within 20000 ms'))
    await refuses(lost, 'UNKNOWN', /could not read GitHub: gh api: no answer/)
  }
})

// ── pagination ──────────────────────────────────────────────────────────────────────────────────

/** Replaces a workflow's listing by `n` older green runs plus `last`, served in pages of 100. */
function paged(w, file, n, last) {
  const green = greenRun(w, file)
  const rows = []
  for (let i = 0; i < n; i++)
    rows.push({
      ...structuredClone(green),
      id: 5_000_000 + i,
      run_number: 1000 + i,
      created_at: '2026-10-05T07:00:00Z',
      run_started_at: '2026-10-05T07:00:00Z'
    })
  rows.push(last)
  for (const key of Object.keys(w.responses))
    if (key.includes(`/workflows/${file}/runs?`)) delete w.responses[key]
  for (let page = 1; (page - 1) * 100 < rows.length; page++)
    w.responses[runsPath(file, page)] = [
      { total_count: rows.length, workflow_runs: rows.slice((page - 1) * 100, page * 100) }
    ]
  return rows
}

test('every page is read: the newest run on page 2 decides, green or red', async () => {
  const ok = world()
  paged(ok, 'tracy-ci.yml', 100, greenRun(ok, 'tracy-ci.yml'))
  const pass = await verdictOf(ok)
  assert.equal(pass.v.verdict, 'PASS', pass.v.reason)
  assert.ok(pass.calls.includes(runsPath('tracy-ci.yml', 2)))

  const red = world()
  paged(red, 'tracy-ci.yml', 100, { ...greenRun(red, 'tracy-ci.yml'), conclusion: 'failure' })
  await refuses(red, 'FAIL', /ended `failure`/)
})

test('a listing that is cut short, repeats, shrinks or lies about its size is UNKNOWN', async () => {
  const cases = {
    'page 2 cannot be read': (w) => {
      delete w.responses[runsPath('tracy-ci.yml', 2)]
    },
    'page 2 repeats page 1': (w) => {
      const p1 = w.responses[runsPath('tracy-ci.yml', 1)][0]
      w.responses[runsPath('tracy-ci.yml', 2)] = [
        { total_count: p1.total_count, workflow_runs: p1.workflow_runs.slice(0, 1) }
      ]
    },
    'page 2 is empty': (w) => {
      w.responses[runsPath('tracy-ci.yml', 2)][0].workflow_runs = []
    },
    'page 1 is short': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)][0].workflow_runs.pop()
    },
    'total_count changes between pages': (w) => {
      w.responses[runsPath('tracy-ci.yml', 2)][0].total_count += 1
    },
    'more rows than total_count': (w) => {
      for (const page of [1, 2]) w.responses[runsPath('tracy-ci.yml', page)][0].total_count = 50
    },
    'total_count beyond what is read': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)][0].total_count = 1001
    },
    'total_count negative': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)][0].total_count = -1
    },
    'total_count as text': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)][0].total_count = '101'
    },
    'total_count missing': (w) => {
      delete w.responses[runsPath('tracy-ci.yml', 1)][0].total_count
    },
    'rows are not a list': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)][0].workflow_runs = {}
    },
    'the page is a bare list': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)] = [[]]
    },
    'the page is null': (w) => {
      w.responses[runsPath('tracy-ci.yml', 1)] = [null]
    },
    'a page holds more than 100 rows': (w) => {
      const p1 = w.responses[runsPath('tracy-ci.yml', 1)][0]
      p1.workflow_runs.push(...w.responses[runsPath('tracy-ci.yml', 2)][0].workflow_runs)
    }
  }
  for (const [name, change] of Object.entries(cases)) {
    const w = world()
    paged(w, 'tracy-ci.yml', 100, greenRun(w, 'tracy-ci.yml'))
    change(w)
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'UNKNOWN', `${name}: ${v.verdict} ${v.reason}`)
  }
})

test('a listing that never ends stops at ten pages, UNKNOWN', async () => {
  const w = world()
  const green = greenRun(w, 'tracy-ci.yml')
  let asked = 0
  const { get } = transport(w)
  const endless = async (path) => {
    const m = /workflows\/tracy-ci\.yml\/runs\?.*&page=(\d+)$/.exec(path)
    if (!m) return get(path)
    asked += 1
    const page = Number(m[1])
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ...green,
      id: page * 1000 + i,
      run_number: page * 1000 + i
    }))
    return { total_count: 1000, workflow_runs: page === 10 ? rows.slice(0, 99) : rows }
  }
  const v = await preflight({ repo: REPO, pr: PR, base: BASE, get: endless })
  assert.equal(v.verdict, 'UNKNOWN', v.reason)
  assert.ok(asked <= 10, `${asked} pages asked for`)
})

test('the job list is paged and checked the same way', async () => {
  const cut = world()
  jobsOf(cut, 'tracy-ci.yml').total_count += 1
  await refuses(cut, 'UNKNOWN', /Tracy CI jobs: .*truncated/)

  const twice = world()
  const list = jobsOf(twice, 'tracy-ci.yml')
  list.jobs.push(structuredClone(list.jobs[0]))
  list.total_count += 1
  await refuses(twice, 'UNKNOWN', /listed twice/)

  const gone = world()
  delete gone.responses[jobsPath(greenRun(gone, 'tracy-ci.yml').id)]
  await refuses(gone, 'UNKNOWN', /could not read GitHub/)
})

// ── the pull request itself ─────────────────────────────────────────────────────────────────────

test('a pull request that is a draft, closed, merged or aimed elsewhere fails before any check is read', async () => {
  const cases = {
    draft: [(p) => (p.draft = true), /is a draft/],
    closed: [(p) => (p.state = 'closed'), /is closed, not open/],
    merged: [(p) => Object.assign(p, { state: 'closed', merged: true }), /already merged/],
    retargeted: [(p) => (p.base.ref = 'main'), /targets `main`, not `develop`/]
  }
  for (const [name, [change, reason]] of Object.entries(cases)) {
    const w = world()
    change(pull(w))
    const { get, calls } = transport(w)
    const v = await preflight({ repo: REPO, pr: PR, base: BASE, get })
    assert.equal(v.verdict, 'FAIL', `${name}: ${v.reason}`)
    assert.match(v.reason, reason)
    assert.deepEqual(Object.keys(v).sort(), ['reason', 'verdict'])
    assert.deepEqual(calls, [PULL], name)
  }
})

test('a pull request response that is not this pull request, or not whole, is UNKNOWN', async () => {
  const cases = {
    'another number': (p) => (p.number = PR + 1),
    'number as text': (p) => (p.number = String(PR)),
    'another repository': (p) => (p.base.repo.full_name = 'TracyHQ/other'),
    'no base repository': (p) => delete p.base.repo,
    'head in a fork': (p) => (p.head.repo.full_name = 'someone/tch'),
    'head repository deleted': (p) => (p.head.repo = null),
    'short head sha': (p) => (p.head.sha = HEAD.slice(0, 7)),
    'upper-case head sha': (p) => (p.head.sha = HEAD.toUpperCase()),
    'draft as text': (p) => (p.draft = 'false'),
    'draft missing': (p) => delete p.draft,
    'merged missing': (p) => delete p.merged,
    'state missing': (p) => delete p.state,
    'no head': (p) => delete p.head,
    'no base branch': (p) => delete p.base.ref,
    'no update time': (p) => delete p.updated_at,
    'update time unreadable': (p) => (p.updated_at = 'today'),
    'update time on 31 February': (p) => (p.updated_at = '2026-02-31T08:37:06Z'),
    'update time on 31 June': (p) => (p.updated_at = '2026-06-31T08:37:06Z'),
    'update time at hour 24': (p) => (p.updated_at = '2026-10-04T24:00:00Z')
  }
  for (const [name, change] of Object.entries(cases)) {
    const w = world()
    change(pull(w))
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'UNKNOWN', `${name}: ${v.verdict} ${v.reason}`)
  }
  for (const body of [null, [], 'pull request', 7]) {
    const w = world()
    w.responses[PULL] = [body]
    await refuses(w, 'UNKNOWN', /not a pull request/)
  }
})

test('a target that is not this branch at a commit is UNKNOWN', async () => {
  const cases = {
    'another ref': (t) => (t.ref = 'refs/heads/develop-old'),
    'a tag object': (t) => (t.object.type = 'tag'),
    'short sha': (t) => (t.object.sha = 'abc'),
    'no object': (t) => delete t.object
  }
  for (const [name, change] of Object.entries(cases)) {
    const w = world()
    change(w.responses[TARGET][0])
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'UNKNOWN', `${name}: ${v.verdict} ${v.reason}`)
  }
  const list = world()
  list.responses[TARGET] = [[list.responses[TARGET][0]]]
  await refuses(list, 'UNKNOWN', /not that branch/)
})

test('main and develop are separate verdicts: asking about the other base fails', async () => {
  await refuses(world(), 'FAIL', /targets `develop`, not `main`/, { base: 'main' })
})

// ── jobs ────────────────────────────────────────────────────────────────────────────────────────

test('every required job must be there and green', async () => {
  for (const file of FILES) {
    for (const name of requiredJobs(file, BASE)) {
      const missing = world()
      const list = jobsOf(missing, file)
      list.jobs = list.jobs.filter((j) => j.name !== name)
      list.total_count = list.jobs.length
      await refuses(missing, 'FAIL', /required job ".*" is missing/)

      for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', null]) {
        const w = world()
        jobsOf(w, file).jobs.find((j) => j.name === name).conclusion = conclusion
        await refuses(w, 'FAIL', new RegExp(`ended \`${conclusion}\``))
      }
      for (const status of ['queued', 'in_progress', 'waiting']) {
        const w = world()
        Object.assign(
          jobsOf(w, file).jobs.find((j) => j.name === name),
          { status, conclusion: null }
        )
        await refuses(w, 'FAIL', /not finished/)
      }
    }
  }
})

test('a planned conditional row must be green; an unplanned one is not asked for on develop', async () => {
  const row = 'build check (tests emdash-business)'
  assert.ok(
    jobsOf(SAVED, 'tracy-ci.yml').jobs.some((j) => j.name === row),
    'the saved run planned this row'
  )
  for (const conclusion of ['failure', 'cancelled', 'skipped']) {
    const w = world()
    jobsOf(w, 'tracy-ci.yml').jobs.find((j) => j.name === row).conclusion = conclusion
    await refuses(w, 'FAIL', new RegExp(`"build check \\(tests emdash-business\\)" ended \`${conclusion}\``))
  }
  const unplanned = world()
  const list = jobsOf(unplanned, 'tracy-ci.yml')
  list.jobs = list.jobs.filter((j) => j.name !== row)
  list.total_count = list.jobs.length
  const { v } = await verdictOf(unplanned)
  assert.equal(v.verdict, 'PASS', v.reason)

  // The unexpanded matrix job of a run whose `plan` did not produce rows is a row, not an extra.
  const unexpanded = world()
  jobsOf(unexpanded, 'tracy-ci.yml').jobs.push({
    ...structuredClone(jobsOf(unexpanded, 'tracy-ci.yml').jobs[0]),
    id: 1,
    name: 'build check (${{ matrix.group }})',
    conclusion: 'skipped',
    labels: []
  })
  jobsOf(unexpanded, 'tracy-ci.yml').total_count += 1
  await refuses(unexpanded, 'FAIL', /ended `skipped`/)
})

test('a job outside the required set may be skipped by its own `if`, but may not fail', async () => {
  const saved = jobsOf(SAVED, 'tracy-ci.yml').jobs
  assert.deepEqual(
    saved
      .filter((j) => j.conclusion === 'skipped')
      .map((j) => j.name)
      .sort(),
    ["build dsh once for the nightly's commit", 'nightly verdict']
  )
  for (const conclusion of ['failure', 'cancelled']) {
    const w = world()
    jobsOf(w, 'tracy-ci.yml').jobs.find((j) => j.name === 'nightly verdict').conclusion = conclusion
    await refuses(w, 'FAIL', new RegExp(`"nightly verdict" ended \`${conclusion}\``))
  }
})

/**
 * The saved pull request as a release pull request into `main`, every row planned and green.
 * `forced`: its tests are the forced Turbo rows, and its plan job printed the `full run` notice.
 */
function intoMain({ forced = false } = {}) {
  const w = structuredClone(SAVED)
  const text = JSON.stringify(w.responses).replaceAll(LANES.develop, LANES.main)
  w.responses = JSON.parse(text)
  pull(w).base.ref = 'main'
  w.responses[`repos/${REPO}/git/ref/heads/main`] = [
    { ref: 'refs/heads/main', object: w.responses[TARGET][0].object }
  ]
  for (const f of FILES)
    for (const r of runsOf(w, f).workflow_runs) for (const p of r.pull_requests) p.base.ref = 'main'
  const list = jobsOf(w, 'tracy-ci.yml')
  const row = list.jobs.find((j) => j.name === 'build check (checks)')
  // A forced run has no workers shards at all: its tests ran in the Turbo rows.
  if (forced) list.jobs = list.jobs.filter((j) => !/^build check \(tests [12]\/2\)$/.test(j.name))
  for (const name of requiredJobs('tracy-ci.yml', 'main', { forced }))
    if (!list.jobs.some((j) => j.name === name))
      list.jobs.push({ ...structuredClone(row), id: row.id + list.jobs.length, name })
  list.total_count = list.jobs.length
  const plan = list.jobs.find((j) => j.name === 'plan the build-check rows')
  w.responses[`repos/${REPO}/check-runs/${plan.id}/annotations?per_page=100`] = [
    forced ? [{ title: 'full run', message: 'turbo' }] : []
  ]
  return w
}

test('into main, a run whose plan forced the Turbo rows requires those rows instead of the shards', async () => {
  const shards = ['build check (tests 1/2)', 'build check (tests 2/2)']
  const turbo = requiredJobs('tracy-ci.yml', 'main', { forced: true })
  for (const name of shards) assert.ok(!turbo.includes(name), name)
  for (const g of ['tests web 1/3', 'tests web 2/3', 'tests web 3/3', 'tests packages', 'tests scripts'])
    assert.ok(turbo.includes(`build check (${g})`), g)
  // Into develop the mark changes nothing: only `checks` is always there.
  assert.deepEqual(
    requiredJobs('tracy-ci.yml', 'develop', { forced: true }),
    requiredJobs('tracy-ci.yml', 'develop')
  )
  const ok = await verdictOf(intoMain({ forced: true }), { base: 'main' })
  assert.equal(ok.v.verdict, 'PASS', ok.v.reason)
  // A missing forced row is missing, whichever set the run claims.
  const w = intoMain({ forced: true })
  const list = jobsOf(w, 'tracy-ci.yml')
  list.jobs = list.jobs.filter((j) => j.name !== 'build check (tests packages)')
  list.total_count = list.jobs.length
  await refuses(w, 'FAIL', /required job "build check \(tests packages\)" is missing/, { base: 'main' })
  // Turbo rows WITHOUT the mark are not a full run: the shards stay required.
  const unmarked = intoMain({ forced: true })
  const planId = jobsOf(unmarked, 'tracy-ci.yml').jobs.find((j) => j.name === 'plan the build-check rows').id
  unmarked.responses[`repos/${REPO}/check-runs/${planId}/annotations?per_page=100`] = [[]]
  await refuses(unmarked, 'FAIL', /required job "build check \(tests [12]\/2\)" is missing/, { base: 'main' })
})

test('into main every row is required', async () => {
  const ok = await verdictOf(intoMain(), { base: 'main' })
  assert.equal(ok.v.verdict, 'PASS', ok.v.reason)
  assert.equal(ok.v.base, 'main')

  for (const group of ['tests emdash-base', 'tests emdash-saas', 'tests e2e']) {
    const w = intoMain()
    const list = jobsOf(w, 'tracy-ci.yml')
    list.jobs = list.jobs.filter((j) => j.name !== `build check (${group})`)
    list.total_count = list.jobs.length
    await refuses(w, 'FAIL', /required job "build check \(tests .*\)" is missing/, { base: 'main' })
  }
})

test('a pull-request job that ran on the production lane is refused, whatever the target', async () => {
  // Since 26/10/2026 every pull-request job asks for the dev lane (docs/references/public-repo-ci.md).
  for (const file of FILES) {
    const w = intoMain()
    for (const j of jobsOf(w, file).jobs)
      j.labels = j.labels.map((l) => (l === LANES.develop ? 'tracy-lane-prod' : l))
    await refuses(w, 'FAIL', /ran on lane \["tracy-lane-prod"\], not `tracy-lane-dev`/, { base: 'main' })
  }
  const lanes = {
    none: (l) => l.filter((x) => x !== LANES.develop),
    both: (l) => [...l, 'tracy-lane-prod']
  }
  for (const [name, change] of Object.entries(lanes)) {
    const w = world()
    const job = jobsOf(w, 'branch-fresh-check.yml').jobs[0]
    job.labels = change(job.labels)
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'FAIL', `${name}: ${v.reason}`)
    assert.match(v.reason, /ran on lane/)
  }
})

test('job rows that contradict the run they were asked for are UNKNOWN', async () => {
  const cases = {
    'another run': (j) => (j.run_id += 1),
    'another attempt': (j) => (j.run_attempt = 2),
    'another commit': (j) => (j.head_sha = OTHER_SHA),
    'no name': (j) => delete j.name,
    'no status': (j) => delete j.status,
    'conclusion a number': (j) => (j.conclusion = 0),
    'labels missing': (j) => delete j.labels,
    'labels as text': (j) => (j.labels = 'tracy-lane-dev'),
    'a label that is not text': (j) => j.labels.push(7),
    'id missing': (j) => delete j.id,
    'same name as another job': (j, all) => (j.name = all[1].name)
  }
  for (const [name, change] of Object.entries(cases)) {
    const w = world()
    const all = jobsOf(w, 'tracy-ci.yml').jobs
    change(all[0], all)
    const { v } = await verdictOf(w)
    assert.equal(v.verdict, 'UNKNOWN', `${name}: ${v.verdict} ${v.reason}`)
  }
})

// ── the second read ─────────────────────────────────────────────────────────────────────────────

test('anything that moved between the first read and the last refuses the verdict', async () => {
  const cases = {
    'the head moved': [(p) => (p.head.sha = OTHER_SHA), 'FAIL', /head moved from 5645e1435 to bbbbbbbbb/],
    'converted to draft': [(p) => (p.draft = true), 'FAIL', /is a draft/],
    closed: [(p) => (p.state = 'closed'), 'FAIL', /is closed/],
    merged: [(p) => Object.assign(p, { state: 'closed', merged: true }), 'FAIL', /already merged/],
    retargeted: [(p) => (p.base.ref = 'main'), 'FAIL', /targets `main`/],
    'edited (new check runs start)': [
      (p) => (p.updated_at = '2026-10-05T09:59:59Z'),
      'FAIL',
      /edited during the preflight/
    ],
    'a different pull request answers': [(p) => (p.number = PR + 1), 'UNKNOWN', /is for pull request/],
    'the answer is not a pull request': [(p) => delete p.head, 'UNKNOWN', /not a pull request/]
  }
  for (const [name, [change, verdict, reason]] of Object.entries(cases)) {
    const w = world()
    const second = structuredClone(pull(w))
    change(second)
    w.responses[PULL].push(second)
    const { get, calls } = transport(w)
    const v = await preflight({ repo: REPO, pr: PR, base: BASE, get })
    assert.equal(v.verdict, verdict, `${name}: ${v.verdict} ${v.reason}`)
    assert.match(v.reason, reason, name)
    assert.deepEqual(Object.keys(v).sort(), ['reason', 'verdict'], name)
    assert.equal(calls.length, 18, `${name}: refused at the second read of the pull request, not before`)
  }

  const moved = world()
  moved.responses[TARGET].push({ ref: `refs/heads/${BASE}`, object: { type: 'commit', sha: OTHER_SHA } })
  await refuses(moved, 'FAIL', /`develop` moved from eaa7e8c73 to bbbbbbbbb during the preflight/)

  const lost = world()
  lost.responses[PULL].push(new Error('gh api: no answer within 20000 ms'))
  await refuses(lost, 'UNKNOWN', /could not read GitHub: gh api: no answer/)

  const lostTarget = world()
  lostTarget.responses[TARGET].push(new Error('gh api: exit 1 — HTTP 502'))
  await refuses(lostTarget, 'UNKNOWN', /HTTP 502/)
})

// ── the transport cannot answer ─────────────────────────────────────────────────────────────────

test('any request that cannot be answered is UNKNOWN, whichever one it is', async () => {
  for (const path of Object.keys(SAVED.responses)) {
    const w = world()
    w.responses[path] = [new Error('gh api: exit 1 — HTTP 403: API rate limit exceeded')]
    await refuses(w, 'UNKNOWN', /could not read GitHub: .*rate limit/)
  }
})

test('an unknown part outranks a known red: the verdict is "not verified", not half a story', async () => {
  const w = world()
  newer(w, 'tracy-ci.yml', { conclusion: 'failure' })
  w.responses[runsPath('branch-fresh-check.yml')] = [new Error('gh api: no answer within 20000 ms')]
  await refuses(w, 'UNKNOWN', /could not read GitHub/)
})

test('preflight refuses arguments the command line would have refused', async () => {
  for (const over of [
    { repo: 'no-slash' },
    { repo: 'a/b/c' },
    { repo: 'a/..' },
    { pr: 0 },
    { pr: '893' },
    { pr: 1.5 },
    { base: 'release' },
    { base: 'constructor' }
  ]) {
    const { v, calls } = await verdictOf(world(), over)
    assert.equal(v.verdict, 'UNKNOWN', JSON.stringify(over))
    assert.deepEqual(calls, [])
  }
})

// ── the command line ────────────────────────────────────────────────────────────────────────────

const ARGS = ['--repo', REPO, '--pr', String(PR), '--base', BASE]

/**
 * A stand-in `gh`: answers `api` from a saved-responses file and records every argv. Its modes
 * are the ways the real one fails. `pr merge` is only recorded — nothing here can merge.
 */
const GH_STUB = `#!/usr/bin/env node
const fs = require('node:fs')
const argv = process.argv.slice(2)
fs.appendFileSync(process.env.GH_STUB_LOG, JSON.stringify(argv) + '\\n')
const mode = process.env.GH_STUB_MODE || 'serve'
if (argv[0] !== 'api') process.exit(0)
if (mode === 'exit1') { process.stderr.write('gh: API rate limit exceeded (HTTP 403)\\n'); process.exit(1) }
if (mode === 'garbage') { process.stdout.write('<html>502 Bad Gateway</html>'); process.exit(0) }
if (mode === 'cut') { process.stdout.write('{"number": 893, "state": "op'); process.exit(0) }
if (mode === 'empty') process.exit(0)
if (mode === 'hang') setInterval(() => {}, 1000)
else if (mode === 'huge') process.stdout.write('"' + 'x'.repeat(Number(process.env.GH_STUB_BYTES)) + '"')
else {
  const path = argv[argv.length - 1]
  const list = JSON.parse(fs.readFileSync(process.env.GH_STUB_FIXTURE, 'utf8')).responses[path]
  if (!list) { process.stderr.write('gh: Not Found (HTTP 404)\\n'); process.exit(1) }
  // One counter file per path: the five workflows are read at the same time, one path never is.
  const countFile = process.env.GH_STUB_LOG + '.' + require('node:crypto').createHash('sha1').update(path).digest('hex')
  const n = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0
  fs.writeFileSync(countFile, String(n + 1))
  process.stdout.write(JSON.stringify(list[Math.min(n, list.length - 1)]))
}
`

/** A directory holding the stand-in `gh`, the environment that puts it first, and its call log. */
function stubGh(w, mode = 'serve', { withGh = true } = {}) {
  const dir = scratch()
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  if (withGh) {
    writeFileSync(join(bin, 'gh'), GH_STUB)
    chmodSync(join(bin, 'gh'), 0o755)
  }
  const fixture = join(dir, 'responses.json')
  writeFileSync(fixture, JSON.stringify(w))
  const log = join(dir, 'gh.log')
  writeFileSync(log, '')
  const env = {
    ...process.env,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    GH_STUB_LOG: log,
    GH_STUB_MODE: mode,
    GH_STUB_FIXTURE: fixture
  }
  const calls = () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  return { env, calls, bin: join(bin, 'gh'), dir }
}

const cli = (args, opts = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 20_000, ...opts })

test('cli: bad arguments exit 2 before any request', () => {
  const stub = stubGh(world())
  const bad = [
    [],
    ['--repo', REPO, '--pr', String(PR)],
    ['--repo', REPO, '--base', BASE],
    ['--pr', String(PR), '--base', BASE],
    [...ARGS, '--repo', REPO],
    [...ARGS, '--pr', '1'],
    [...ARGS, '--base', 'main'],
    [...ARGS, '--merge'],
    [...ARGS, 'extra'],
    ['extra', ...ARGS],
    [...ARGS, '--fixture'],
    ['--repo', '--pr', String(PR), '--base', BASE],
    ['--repo', REPO, '--pr', '--base', BASE],
    ['--repo', '', '--pr', String(PR), '--base', BASE],
    ['--repo', 'tch', '--pr', String(PR), '--base', BASE],
    ['--repo', 'TracyHQ/tch/x', '--pr', String(PR), '--base', BASE],
    ['--repo', '../tch', '--pr', String(PR), '--base', BASE],
    ['--repo', 'TracyHQ/..', '--pr', String(PR), '--base', BASE],
    ['--repo', 'TracyHQ/.', '--pr', String(PR), '--base', BASE],
    ['--repo', 'TracyHQ/tch?x=1', '--pr', String(PR), '--base', BASE],
    ['--repo', '-o/tch', '--pr', String(PR), '--base', BASE],
    ['--repo', REPO, '--pr', '0', '--base', BASE],
    ['--repo', REPO, '--pr', '-3', '--base', BASE],
    ['--repo', REPO, '--pr', '08', '--base', BASE],
    ['--repo', REPO, '--pr', '8.5', '--base', BASE],
    ['--repo', REPO, '--pr', '893abc', '--base', BASE],
    ['--repo', REPO, '--pr', '#893', '--base', BASE],
    ['--repo', REPO, '--pr', '1e3', '--base', BASE],
    ['--repo', REPO, '--pr', '9999999999', '--base', BASE],
    ['--repo', REPO, '--pr', String(PR), '--base', 'Develop'],
    ['--repo', REPO, '--pr', String(PR), '--base', 'feature/x'],
    ['--repo', REPO, '--pr', String(PR), '--base', 'refs/heads/main'],
    [...ARGS, '--fixture', FIXTURE, '--expected-head', '{}'],
    [...ARGS, '--fixture', FIXTURE, '--fixture', FIXTURE],
    ['--repo=TracyHQ/tch', '--pr', String(PR), '--base', BASE]
  ]
  for (const args of bad) {
    const r = cli(args, { env: stub.env })
    assert.equal(r.status, EXIT.USAGE, `${JSON.stringify(args)}: ${r.stderr}`)
    assert.equal(r.stdout, '')
    assert.match(r.stderr, /usage: /)
  }
  assert.deepEqual(stub.calls(), [], 'no request was made')
  assert.ok('error' in parseArgs(['--pr']))
  assert.deepEqual(parseArgs(ARGS), { opts: { repo: REPO, pr: PR, base: BASE } })
})

test('cli --fixture: PASS prints one JSON line marked as a fixture run; FAIL prints nothing on stdout', () => {
  const pass = cli([...ARGS, '--fixture', FIXTURE])
  assert.equal(pass.status, EXIT.PASS, pass.stderr)
  assert.equal(pass.stdout.trimEnd().split('\n').length, 1)
  const v = JSON.parse(pass.stdout)
  assert.equal(v.verdict, 'PASS')
  assert.equal(v.source, 'fixture')
  assert.equal(v.expectedHead, HEAD)
  assert.match(pass.stderr, /PASS/)
  assert.match(pass.stderr, /read from a fixture, not from GitHub/)
  assert.match(pass.stderr, /A check, not a lock/)
  assert.doesNotMatch(pass.stderr, /Merge now with/)

  const w = world()
  newer(w, 'tracy-ci.yml', { conclusion: 'cancelled' })
  const file = join(scratch(), 'red.json')
  writeFileSync(file, JSON.stringify(w))
  const red = cli([...ARGS, '--fixture', file])
  assert.equal(red.status, EXIT.FAIL, red.stderr)
  assert.equal(red.stdout, '')
  assert.match(red.stderr, /check-pr-merge: FAIL — Tracy CI run .* ended `cancelled`/)
  assert.match(red.stderr, /Do not merge/)
})

test('cli --fixture: a file that cannot be read as saved responses is UNKNOWN and never hangs', () => {
  const dir = scratch()
  const write = (name, text) => {
    writeFileSync(join(dir, name), text)
    return join(dir, name)
  }
  symlinkSync(FIXTURE, join(dir, 'link.json'))
  execFileSync('mkfifo', [join(dir, 'fifo.json')])
  mkdirSync(join(dir, 'directory.json'))
  const cases = {
    missing: join(dir, 'nope.json'),
    empty: write('empty.json', ''),
    'cut short': write('cut.json', readFileSync(FIXTURE, 'utf8').slice(0, 5000)),
    'not JSON': write('text.json', 'PASS'),
    'a list': write('list.json', '[]'),
    'no responses map': write('norsp.json', '{"verdict":"PASS"}'),
    'responses is a list': write('rsplist.json', '{"responses":[]}'),
    'responses is empty': write('rspempty.json', '{"responses":{}}'),
    'a response that is not a list': write(
      'rspobj.json',
      JSON.stringify({ responses: { [PULL]: SAVED.responses[PULL][0] } })
    ),
    'a link to the real fixture': join(dir, 'link.json'),
    'a FIFO nobody writes to': join(dir, 'fifo.json'),
    'a directory': join(dir, 'directory.json'),
    'too large': write('large.json', `{"responses":{},"pad":"${'x'.repeat(4 * 1024 * 1024)}"}`)
  }
  for (const [name, file] of Object.entries(cases)) {
    const r = cli([...ARGS, '--fixture', file], { timeout: 10_000 })
    assert.equal(r.error, undefined, `${name}: ${r.error}`)
    assert.equal(r.status, EXIT.UNKNOWN, `${name}: ${r.status} ${r.stderr}`)
    assert.equal(r.stdout, '', name)
    assert.match(r.stderr, /check-pr-merge: UNKNOWN — /, name)
    assert.match(r.stderr, /Nothing was verified/, name)
  }
  assert.throws(() => fixtureTransport(join(dir, 'fifo.json')), /not a regular file/)
  assert.throws(() => fixtureTransport(join(dir, 'link.json')), /not a regular file/)
})

test('cli through `gh`: PASS is read from GitHub with GET requests only', () => {
  const stub = stubGh(world())
  const r = cli(ARGS, { env: stub.env })
  assert.equal(r.status, EXIT.PASS, r.stderr)
  const v = JSON.parse(r.stdout)
  assert.equal(v.source, 'github')
  assert.equal(v.expectedHead, HEAD)
  assert.match(
    r.stderr,
    new RegExp(`Merge now with: gh pr merge ${PR} --repo ${REPO} --merge --match-head-commit ${HEAD}`)
  )
  const calls = stub.calls()
  assert.equal(calls.length, 19)
  for (const argv of calls) {
    assert.deepEqual(argv.slice(0, 7), [
      'api',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2022-11-28'
    ])
    assert.equal(argv.length, 8)
    assert.match(argv[7], new RegExp(`^repos/${REPO}/`))
  }
  assert.deepEqual(
    calls.map((a) => a[7]).sort(),
    [...Object.keys(SAVED.responses), PULL, TARGET, ...FILES.map((f) => runsPath(f))].sort()
  )
})

test('cli through `gh`: a `gh` that is missing, refuses, or answers rubbish is UNKNOWN — one try each, no retry', () => {
  for (const mode of ['exit1', 'garbage', 'cut', 'empty']) {
    const stub = stubGh(world(), mode)
    const r = cli(ARGS, { env: stub.env })
    assert.equal(r.status, EXIT.UNKNOWN, `${mode}: ${r.status} ${r.stderr}`)
    assert.equal(r.stdout, '', mode)
    assert.match(r.stderr, /UNKNOWN — could not read GitHub: gh api /, mode)
    assert.equal(stub.calls().length, 1, `${mode}: asked once, then stopped`)
  }
  const rate = cli(ARGS, { env: stubGh(world(), 'exit1').env })
  assert.match(rate.stderr, /exit 1 — gh: API rate limit exceeded \(HTTP 403\)/)

  const none = stubGh(world(), 'serve', { withGh: false })
  // PATH is the empty stub directory alone, so no real \`gh\` installed beside node can answer.
  const r = cli(ARGS, { env: { ...none.env, PATH: dirname(none.bin) } })
  assert.equal(r.status, EXIT.UNKNOWN, r.stderr)
  assert.equal(r.stdout, '')
  assert.match(r.stderr, /`gh` is not installed or not on PATH/)

  // A response that names another pull request's state is never turned into a pass by the CLI.
  const red = world()
  pull(red).draft = true
  const draft = cli(ARGS, { env: stubGh(red).env })
  assert.equal(draft.status, EXIT.FAIL, draft.stderr)
  assert.equal(draft.stdout, '')
})

test('transport: a `gh` that hangs is cut off, one that floods is refused, an odd path is never sent', async () => {
  const hang = stubGh(world(), 'hang')
  process.env.GH_STUB_LOG = hang.env.GH_STUB_LOG
  process.env.GH_STUB_MODE = 'hang'
  const started = Date.now()
  await assert.rejects(ghTransport({ bin: hang.bin, timeoutMs: 400 })(PULL), /no answer within 400 ms/)
  assert.ok(Date.now() - started < 10_000)

  const huge = stubGh(world(), 'huge')
  process.env.GH_STUB_LOG = huge.env.GH_STUB_LOG
  process.env.GH_STUB_MODE = 'huge'
  process.env.GH_STUB_BYTES = '200000'
  await assert.rejects(ghTransport({ bin: huge.bin, maxBytes: 100_000 })(PULL), /larger than 100000 bytes/)

  const odd = stubGh(world())
  process.env.GH_STUB_LOG = odd.env.GH_STUB_LOG
  process.env.GH_STUB_MODE = 'serve'
  process.env.GH_STUB_FIXTURE = odd.env.GH_STUB_FIXTURE
  const get = ghTransport({ bin: odd.bin })
  for (const path of [
    '--method',
    '-X',
    `repos/${REPO}/pulls/7 --method POST`,
    `/repos/${REPO}/pulls/7`,
    `repos/${REPO}/pulls/7\n`,
    'graphql',
    `repos/${REPO}/../../user`,
    `repos/${REPO}//pulls/7`,
    `repos/${REPO}/pulls/7?a=b#c`,
    ''
  ])
    await assert.rejects(get(path), /refusing to request/, JSON.stringify(path))
  assert.deepEqual(odd.calls(), [])
  assert.equal((await get(PULL)).number, PR)
  delete process.env.GH_STUB_LOG
  delete process.env.GH_STUB_MODE
  delete process.env.GH_STUB_BYTES
  delete process.env.GH_STUB_FIXTURE
})

test('emit: only a PASS writes to stdout, and a PASS that cannot be written is not a PASS', async () => {
  const { v: pass } = await verdictOf(world())
  const io = () => {
    const seen = { out: '', err: '' }
    return { seen, out: (s) => (seen.out += s), err: (s) => (seen.err += s) }
  }
  const a = io()
  assert.equal(emit(pass, a), EXIT.PASS)
  assert.deepEqual(JSON.parse(a.seen.out), pass)

  for (const [verdict, code] of [
    ['FAIL', EXIT.FAIL],
    ['UNKNOWN', EXIT.UNKNOWN]
  ]) {
    const b = io()
    assert.equal(emit({ verdict, reason: 'because' }, b), code)
    assert.equal(b.seen.out, '')
    assert.match(b.seen.err, new RegExp(`check-pr-merge: ${verdict} — because`))
  }

  const c = io()
  c.out = () => {
    throw new Error('EPIPE')
  }
  assert.equal(emit(pass, c), EXIT.UNKNOWN)
  assert.match(c.seen.err, /could not be written/)
  assert.doesNotMatch(c.seen.err, /PASS/)
  assert.deepEqual([EXIT.PASS, EXIT.FAIL, EXIT.USAGE, EXIT.UNKNOWN], [0, 1, 2, 3])
})

// ── the coordinator's side: from a PASS line to the head to merge ───────────────────────────────

test('expected head: only a whole, live, fresh PASS for this pull request yields a commit id', async () => {
  const at = Date.parse('2026-10-05T10:00:00Z')
  const { v: pass } = await verdictOf(world(), { now: () => at })
  const want = { repo: REPO, pr: PR, base: BASE }
  const line = JSON.stringify(pass)
  assert.deepEqual(expectedHeadOf(line, want, at + 1000), { ok: true, sha: HEAD })
  assert.deepEqual(expectedHeadOf(`${line}\n`, want, at + VERDICT_MAX_AGE_MS), { ok: true, sha: HEAD })

  const changed = (change) => {
    const copy = structuredClone(pass)
    change(copy)
    return JSON.stringify(copy)
  }
  const refused = {
    empty: '',
    'cut short': line.slice(0, line.length - 40),
    'cut right after the head': line.slice(0, line.indexOf(HEAD) + 41),
    'two lines': `${line}\n${line}`,
    'not an object': '[]',
    'a bare sha': JSON.stringify(HEAD),
    FAIL: JSON.stringify({ verdict: 'FAIL', reason: 'x' }),
    'FAIL dressed with a head': changed((c) => (c.verdict = 'FAIL')),
    UNKNOWN: changed((c) => (c.verdict = 'UNKNOWN')),
    'a fixture run': changed((c) => (c.source = 'fixture')),
    'no source': changed((c) => delete c.source),
    'another schema': changed((c) => (c.schema = 'v0')),
    'another repository': changed((c) => (c.repo = 'TracyHQ/other')),
    'another pull request': changed((c) => (c.pr = PR + 1)),
    'pull request as text': changed((c) => (c.pr = String(PR))),
    'another base': changed((c) => (c.base = 'main')),
    'short head': changed((c) => (c.expectedHead = HEAD.slice(0, 9))),
    'no head': changed((c) => delete c.expectedHead),
    'no target': changed((c) => delete c.targetSha),
    'no time': changed((c) => delete c.checkedAt),
    'unreadable time': changed((c) => (c.checkedAt = 'now')),
    // `Date.parse` rolls these into 3 March and 1 October: a verdict dated on a day that is not.
    'a time on 31 February': changed((c) => (c.checkedAt = '2026-02-31T10:00:00.000Z')),
    'a time on 31 September': changed((c) => (c.checkedAt = '2026-09-31T10:00:00.000Z')),
    'a time at hour 24': changed((c) => (c.checkedAt = '2026-10-04T24:00:00.000Z')),
    'no checks': changed((c) => delete c.checks),
    'a check missing': changed((c) => c.checks.pop()),
    'a check twice': changed((c) => (c.checks[4] = c.checks[0])),
    'an extra check': changed((c) => c.checks.push({ ...c.checks[0], file: 'ci-before-merge.yml' })),
    'a check without its attempt': changed((c) => delete c.checks[2].runAttempt),
    'a check with attempt zero': changed((c) => (c.checks[2].runAttempt = 0)),
    'a check without the start of its attempt': changed((c) => delete c.checks[2].runStartedAt),
    'a check whose attempt started on 31 February': changed(
      (c) => (c.checks[2].runStartedAt = '2026-02-31T08:37:09Z')
    )
  }
  for (const [name, text] of Object.entries(refused)) {
    const r = expectedHeadOf(text, want, at + 1000)
    assert.equal(r.ok, false, name)
    assert.equal(r.sha, undefined, name)
    assert.ok(r.reason.length > 10, name)
  }
  // The same impossible dates, read one second after the instant `Date.parse` rolls them into:
  // only the calendar can refuse them, not their age.
  for (const [written, rolled] of [
    ['2026-09-31T10:00:00.000Z', '2026-10-01T10:00:00Z'],
    ['2026-02-31T10:00:00.000Z', '2026-03-03T10:00:00Z'],
    ['2026-10-04T24:00:00.000Z', '2026-10-05T00:00:00Z']
  ]) {
    assert.equal(Date.parse(written), Date.parse(rolled), `${written}: Date.parse accepts it`)
    const text = changed((c) => (c.checkedAt = written))
    assert.match(expectedHeadOf(text, want, Date.parse(rolled) + 1000).reason, /carries no time/, written)
    const real = changed((c) => (c.checkedAt = new Date(Date.parse(rolled)).toISOString()))
    assert.equal(expectedHeadOf(real, want, Date.parse(rolled) + 1000).ok, true, rolled)
  }
  assert.match(expectedHeadOf(line, want, at + VERDICT_MAX_AGE_MS + 1).reason, /120 s old/)
  assert.match(expectedHeadOf(line, want, at + 3_600_000).reason, /run the preflight again/)
  assert.match(expectedHeadOf(line, want, at - 60_000).reason, /future/)
  assert.equal(expectedHeadOf(line, { ...want, base: 'main' }, at).ok, false)
})

test('cli --expected-head: prints the head of a live PASS, nothing for anything else', () => {
  const stub = stubGh(world())
  const live = cli(ARGS, { env: stub.env })
  assert.equal(live.status, 0, live.stderr)
  const ok = cli([...ARGS, '--expected-head', live.stdout], { env: stub.env })
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.stdout, `${HEAD}\n`)

  const fromFixture = cli([...ARGS, '--fixture', FIXTURE])
  const cut = live.stdout.slice(0, 300)
  const wrongPr = ['--repo', REPO, '--pr', String(PR + 1), '--base', BASE]
  for (const [name, args] of Object.entries({
    'a fixture run': [...ARGS, '--expected-head', fromFixture.stdout],
    'cut short': [...ARGS, '--expected-head', cut],
    'another pull request': [...wrongPr, '--expected-head', live.stdout],
    'another base': ['--repo', REPO, '--pr', String(PR), '--base', 'main', '--expected-head', live.stdout]
  })) {
    const r = cli(args, { env: stub.env })
    assert.equal(r.status, 1, `${name}: ${r.stderr}`)
    assert.equal(r.stdout, '', name)
    assert.match(r.stderr, /no head to merge — /, name)
  }
  assert.equal(stub.calls().length, 19, '--expected-head makes no request')
})

/** The merge sequence the pr-merge skill tells the coordinator to run, exactly as written there. */
function mergeSequence() {
  const skill = readFileSync(join(ROOT, '.agents/skills/pr-merge/SKILL.md'), 'utf8')
  const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)]
    .map((m) => m[1])
    .filter((b) => b.includes('gh pr merge'))
  assert.equal(blocks.length, 1, 'the skill holds exactly one block that merges')
  return blocks[0]
}

function coordinator(w, mode) {
  const stub = stubGh(w, mode)
  const r = spawnSync('/bin/bash', ['-c', mergeSequence()], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...stub.env, REPO, PR: String(PR), BASE }
  })
  return { r, merges: stub.calls().filter((argv) => argv[0] !== 'api'), calls: stub.calls() }
}

test('coordinator: after a PASS the skill merges exactly the checked head, with --match-head-commit', () => {
  const block = mergeSequence()
  assert.match(block, /check-pr-merge\.mjs .*--expected-head "\$verdict"/)
  assert.match(block, /gh pr merge "\$PR" --repo "\$REPO" --merge --match-head-commit "\$sha"/)
  assert.equal(block.match(/gh pr merge/g).length, 1)

  const { r, merges, calls } = coordinator(world())
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(merges, [
    ['pr', 'merge', String(PR), '--repo', REPO, '--merge', '--match-head-commit', HEAD]
  ])
  assert.deepEqual(calls.at(-1), merges[0], 'the merge is the last thing called, after every read')
  assert.equal(calls.length, 20)
})

test('coordinator: after FAIL or UNKNOWN the skill never calls merge', () => {
  const refusals = {
    draft: [(w) => (pull(w).draft = true), 'serve', EXIT.FAIL],
    'newer red run beside an older green': [
      (w) => newer(w, 'tracy-ci.yml', { conclusion: 'failure' }),
      'serve',
      EXIT.FAIL
    ],
    'newer run still going': [
      (w) => newer(w, 'pr-description-check.yml', { status: 'in_progress', conclusion: null }),
      'serve',
      EXIT.FAIL
    ],
    'head moved during the preflight': [
      (w) =>
        w.responses[PULL].push({ ...structuredClone(pull(w)), head: { ...pull(w).head, sha: OTHER_SHA } }),
      'serve',
      EXIT.FAIL
    ],
    'no runs known for a workflow': [
      (w) => delete w.responses[runsPath('regression-check.yml')],
      'serve',
      EXIT.UNKNOWN
    ],
    'GitHub refuses': [() => {}, 'exit1', EXIT.UNKNOWN],
    'GitHub answers rubbish': [() => {}, 'garbage', EXIT.UNKNOWN]
  }
  for (const [name, [change, mode, code]] of Object.entries(refusals)) {
    const w = world()
    change(w)
    const { r, merges } = coordinator(w, mode)
    assert.equal(r.status, code, `${name}: ${r.status} ${r.stderr}`)
    assert.deepEqual(merges, [], `${name}: merge was called`)
    assert.equal(r.stdout, '', name)
  }
})

test('the fixture file is what the test thinks it is', () => {
  assert.ok(existsSync(FIXTURE))
  assert.equal(pull(SAVED).draft, false)
  assert.equal(pull(SAVED).state, 'open')
  assert.equal(Object.keys(SAVED.responses).length, 12)
})

// ── a run that skipped the suite because its tree already passed a full run (10/10/2026) ────────

const SKIP_TREE = 'c24f1e478a8d979f1f39d9827bcf4d7261cd8252'
const PROOF_ID = 38069623159
const PROOF_URL = `https://github.com/${REPO}/actions/runs/${PROOF_ID}`
const ROWS = [
  'tests emdash-business',
  'tests emdash-saas',
  'tests emdash-base',
  'tests e2e',
  'tests 1/2',
  'tests 2/2',
  'checks'
]

/**
 * The saved world, but Tracy CI found a full green run of its tree: no build-check row ran, the
 * `full suite skipped` job did, the plan job recorded both lines, and the proof run is readable.
 * `proof` changes the proof run's jobs, recorded tree or recorded scope (`null` = a run from before
 * the scope was recorded); `notes` changes this run's plan records.
 */
function skippedWorld({ proofJobs, proofTree = SKIP_TREE, proofScope = 'full', notes } = {}) {
  const w = world()
  const run = greenRun(w, 'tracy-ci.yml')
  const jobs = jobsOf(w, 'tracy-ci.yml')
  const plan = jobs.jobs.find((j) => j.name === 'plan the build-check rows')
  const template = jobs.jobs.find((j) => j.name.startsWith('build check ('))
  jobs.jobs = jobs.jobs.filter((j) => !j.name.startsWith('build check ('))
  jobs.jobs.push({
    ...structuredClone(template),
    id: template.id + 500,
    name: 'build check (${{ matrix.group }})',
    conclusion: 'skipped'
  })
  jobs.jobs.push({
    ...structuredClone(plan),
    id: plan.id + 900,
    name: `full suite skipped: tree ${SKIP_TREE} already green in run ${PROOF_URL}`
  })
  jobs.total_count = jobs.jobs.length
  w.responses[`repos/${REPO}/check-runs/${plan.id}/annotations?per_page=100`] = [
    notes ?? [
      { title: 'tested tree', message: SKIP_TREE },
      { title: 'full suite skipped', message: `tree ${SKIP_TREE} already green in run ${PROOF_URL}` }
    ]
  ]
  const proof = {
    ...structuredClone(run),
    id: PROOF_ID,
    run_attempt: 1,
    html_url: PROOF_URL,
    repository: { full_name: REPO },
    head_repository: { full_name: REPO },
    head_commit: { tree_id: SKIP_TREE }
  }
  w.responses[`repos/${REPO}/actions/runs/${PROOF_ID}`] = [proof]
  const proofPlanId = 114264194093
  w.responses[`repos/${REPO}/actions/runs/${PROOF_ID}/attempts/1/jobs?per_page=100`] = [
    {
      total_count: 9,
      jobs: proofJobs ?? [
        { id: proofPlanId, name: 'plan the build-check rows', conclusion: 'success' },
        { id: 2, name: 'build dsh once for this run', conclusion: 'success' },
        ...ROWS.map((g, i) => ({ id: 10 + i, name: `build check (${g})`, conclusion: 'success' }))
      ]
    }
  ]
  w.responses[`repos/${REPO}/check-runs/${proofPlanId}/annotations?per_page=100`] = [
    [
      { title: 'tested tree', message: proofTree },
      ...(proofScope === null ? [] : [{ title: 'tested scope', message: proofScope }])
    ]
  ]
  return w
}

test('skip: a run whose tree a full green run already tested passes without build-check rows', async () => {
  const { v } = await verdictOf(skippedWorld())
  assert.equal(v.verdict, 'PASS', v.reason)
})

test('skip: the proof is re-checked here — a proof run missing a row is refused', async () => {
  const proofJobs = [
    { id: 114264194093, name: 'plan the build-check rows', conclusion: 'success' },
    { id: 10, name: 'build check (checks)', conclusion: 'success' },
    { id: 11, name: 'build check (tests related)', conclusion: 'success' }
  ]
  await refuses(skippedWorld({ proofJobs }), 'FAIL', /not a full run/)
})

test('skip: a proof run that recorded another tested tree is refused', async () => {
  await refuses(skippedWorld({ proofTree: 'b'.repeat(40) }), 'FAIL', /recorded tested tree b{40}/)
})

test('skip: a proof run that left tests out (an opt-in run) or recorded no scope is refused', async () => {
  for (const proofScope of ['partial:db', 'partial:e2e', 'partial:db+e2e', null])
    await refuses(skippedWorld({ proofScope }), 'FAIL', /tested scope .*not full/)
})

test('skip: the skip must name the tree this run recorded as tested', async () => {
  const notes = [
    { title: 'tested tree', message: 'b'.repeat(40) },
    { title: 'full suite skipped', message: `tree ${SKIP_TREE} already green in run ${PROOF_URL}` }
  ]
  await refuses(skippedWorld({ notes }), 'FAIL', /tested tree/)
})

test('skip: a skip job with no skip record in the plan job is refused', async () => {
  await refuses(
    skippedWorld({ notes: [{ title: 'tested tree', message: SKIP_TREE }] }),
    'FAIL',
    /skip record/
  )
})

test('skip: rows missing WITHOUT the skip job still fail as before', async () => {
  const w = skippedWorld()
  const jobs = jobsOf(w, 'tracy-ci.yml')
  jobs.jobs = jobs.jobs.filter((j) => !j.name.startsWith('full suite skipped'))
  jobs.total_count = jobs.jobs.length
  await refuses(w, 'FAIL', /required job "build check \(checks\)" is missing/)
})

test('skip: a normal run lists the skip job as skipped (raw template name) and still passes', async () => {
  const w = world()
  const jobs = jobsOf(w, 'tracy-ci.yml')
  const plan = jobs.jobs.find((j) => j.name === 'plan the build-check rows')
  jobs.jobs.push({
    ...structuredClone(plan),
    id: plan.id + 901,
    name: 'full suite skipped: tree ${{ needs.plan.outputs.tree }} already green in run ${{ needs.plan.outputs.green_run }}',
    conclusion: 'skipped'
  })
  jobs.total_count = jobs.jobs.length
  const { v } = await verdictOf(w)
  assert.equal(v.verdict, 'PASS', v.reason)
})

// ── labels that ask for a suite (16/10/2026) ────────────────────────────────────────────────────

const PLAN_JOB_NAME = 'plan the build-check rows'
/** The pull request carries these labels, and its newest Tracy CI run recorded this `tested scope`. */
function labelled(w, names, scope) {
  pull(w).labels = names.map((name) => ({ name }))
  const plan = jobsOf(w, 'tracy-ci.yml').jobs.find((j) => j.name === PLAN_JOB_NAME)
  w.responses[`repos/${REPO}/check-runs/${plan.id}/annotations?per_page=100`] = [
    scope === null ? [] : [{ title: 'tested scope', message: scope }]
  ]
  return w
}

test('labels: a pull request that asks for the database tests is not merged on a run that left them out', async () => {
  for (const scope of ['partial:db', 'partial:db+e2e']) {
    await refuses(
      labelled(world(), ['ci:integration'], scope),
      'FAIL',
      /label ci:integration asks for the database tests but the latest run skipped it .*wait for the re-run/
    )
  }
})

test('labels: a pull request that asks for the e2e row is not merged on a run that left it out', async () => {
  for (const scope of ['partial:e2e', 'partial:db+e2e']) {
    await refuses(
      labelled(world(), ['ci:e2e'], scope),
      'FAIL',
      /label ci:e2e asks for the e2e row but the latest run skipped it .*wait for the re-run/
    )
  }
})

test('labels: a run that honoured them, or that was never asked, passes', async () => {
  const passes = [
    [['ci:integration'], 'full'],
    [['ci:e2e'], 'full'],
    [['ci:e2e', 'ci:integration'], 'full'],
    // Only what a label asks for must have run: `ci:e2e` does not ask for the database tests.
    [['ci:e2e'], 'partial:db'],
    [['ci:integration'], 'partial:e2e'],
    // No watched label: the run's scope is nobody's business here.
    [[], 'partial:db+e2e'],
    [['bug', 'area:ci'], 'partial:db+e2e'],
    [[], null]
  ]
  for (const [names, scope] of passes) {
    const { v } = await verdictOf(labelled(world(), names, scope))
    assert.equal(v.verdict, 'PASS', `${names.join(',')} / ${scope}: ${v.reason}`)
  }
})

test('labels: a watched label with no recorded scope cannot be shown honoured — FAIL', async () => {
  await refuses(
    labelled(world(), ['ci:integration'], null),
    'FAIL',
    /recorded no tested scope.*wait for the re-run/
  )
  await refuses(labelled(world(), ['ci:e2e'], 'unknown'), 'FAIL', /recorded no tested scope/)
})

test('labels: every watched label that is not honoured is named', async () => {
  const { v } = await verdictOf(labelled(world(), ['ci:e2e', 'ci:integration'], 'partial:db+e2e'))
  assert.equal(v.verdict, 'FAIL')
  assert.match(v.reason, /label ci:integration asks for the database tests/)
})

test('labels: a pull request into develop whose answer lists no labels is unknown, never "no label"', async () => {
  const w = world()
  delete pull(w).labels
  const { v } = await verdictOf(w)
  assert.equal(v.verdict, 'UNKNOWN', v.reason)
  assert.match(v.reason, /lists no labels/)
  const nameless = world()
  pull(nameless).labels = [{}]
  assert.equal((await verdictOf(nameless)).v.verdict, 'UNKNOWN')
})

test('labels: adding a label while the preflight runs is seen (the pull request was edited)', async () => {
  const w = world()
  const edited = structuredClone(pull(w))
  edited.labels = [{ name: 'ci:integration' }]
  edited.updated_at = '2026-10-05T08:37:07Z'
  w.responses[PULL].push(edited)
  const { v } = await verdictOf(w)
  assert.equal(v.verdict, 'FAIL', v.reason)
})

test('labels: a run that skipped the suite on a full proof is not asked what its own scope was', async () => {
  const w = skippedWorld()
  pull(w).labels = [{ name: 'ci:integration' }, { name: 'ci:e2e' }]
  const { v } = await verdictOf(w)
  assert.equal(v.verdict, 'PASS', v.reason)
})
