#!/usr/bin/env node
/**
 * Before a pull request is merged into `develop`, `staging` or `main`: are the checks that are supposed to be
 * green actually green on the commit about to be merged — the NEWEST run of each, not any run?
 *
 * WHY A MACHINE. The question takes about nineteen API reads and has four ways to be answered
 * wrongly by eye: an older green run sits beside a newer red, cancelled or still-running one (the
 * Checks tab shows both); an older run is re-run and its new attempt is the latest word; a run
 * belongs to another pull request that shares the commit; the head moves between looking and
 * merging. The after-merge job (`check-merged-ci.mjs`) recorded two
 * merges without a green run in 25 — it reports after the fact, on `develop`, where the only fix
 * is another commit.
 *
 * 🔒 THIS IS A COMMAND, NOT A LOCK. The repository is private on the Free plan: branch protection
 * and rulesets return 403, so nothing on GitHub refuses a merge. Whoever merges runs this and
 * obeys the exit code; a merge from the web UI, or by anyone who skips it, is seen only by
 * `CI Before Merge` afterwards. It reads; it never merges, pushes, comments or edits.
 *
 * WHAT A PASS MEANS. For the pull request's head commit at the moment of the read:
 *   - the pull request is open, not a draft, and targets the branch named in `--base`;
 *   - each of the five pull-request workflows (WORKFLOWS below) has a `pull_request` run for this
 *     pull request, this head and this target; the newest one — the run whose latest attempt
 *     STARTED last (`run_started_at`, which a re-run resets), never list order and never the run
 *     number alone — is `completed`/`success` in that attempt;
 *   - in that attempt the required jobs exist and every job succeeded (a job outside the required
 *     set may be skipped by its own `if`, e.g. the nightly-only ones; a `build check` row may not);
 *     the one exception: a run that skipped its rows because its tree already passed a full run
 *     (job `full suite skipped: …`), and only once that proof is re-checked here (`verifiedSkip`);
 *   - into `develop`, a label the pull request carries (`ci:e2e`, `ci:integration`) was honoured by that
 *     run: its recorded `tested scope` did not leave out the suite the label asks for (`labelsHonoured`);
 *   - every job that ran asked for the dev runner lane, or ran on a fresh GitHub-hosted `ubuntu-latest`
 *     (label AND runner group `GitHub Actions`; the light gates since 30/10/2026): since 26/10/2026 pull-request code never runs on the
 *     production lane, whatever the base (`docs/references/public-repo-ci.md`). The lane is
 *     therefore no record of the target any more; a retargeted pull request is caught by its rows
 *     (into `staging`/`main` every row, and the forced Turbo rows only with the plan's `full run`
 *     mark) and by `branch-fresh`, which re-runs on `edited`;
 *   - a second read of every run list, after the jobs, still names the same run, attempt and
 *     result (a re-run started while the jobs were read would otherwise pass on its old attempt);
 *   - a second read of the pull request and of the target branch, after all of that, is unchanged.
 *
 * THREE VERDICTS. PASS (exit 0) prints one line of JSON on stdout naming the head to merge.
 * FAIL (exit 1): the facts are known and one disqualifies. UNKNOWN (exit 3): GitHub could not be
 * read, or what came back is incomplete or contradicts itself — nothing was verified. Neither
 * prints anything on stdout. Bad arguments exit 2 before any request.
 *
 * ⚠ WHAT IT CANNOT SEE. The target branch can move after the last read: there is no merge queue,
 * so the merge result itself is never tested here — `branch-fresh` and the "merge the target and
 * re-run the tests" step stay. A run that starts after the last read is not seen either. The head
 * is covered only when the merge is made with `gh pr merge --match-head-commit <expectedHead>`.
 * On `develop` an absent conditional row (EmDash, e2e) is taken on the word of the `plan` job that
 * succeeded in the same run; on `staging` and `main` every row is required.
 *
 *   node scripts/check-pr-merge.mjs --repo OWNER/REPO --pr N --base develop|staging|main
 *   node scripts/check-pr-merge.mjs --repo … --pr … --base … --expected-head "$verdict"
 *       # re-reads a PASS line: prints its head only when it is complete, live, for this pull
 *       # request and under two minutes old
 *   node scripts/check-pr-merge.mjs --repo … --pr … --base … --fixture saved.json
 *       # no network: saved responses instead of GitHub; its PASS says `"source":"fixture"` and
 *       # `--expected-head` refuses it
 */
import { githubReader, githubJson } from './ci/github-read.mjs'
import { execFile } from 'node:child_process'
import { closeSync, constants, fstatSync, openSync, readFileSync, writeSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  forcedFullRunOf,
  inspectRun,
  planAnnotations,
  PLAN_JOB,
  proofProblem,
  recordedBy,
  SKIP_JOB_PREFIX,
  skipNoticeOf,
  testedTreeOf
} from './ci/green-tree.mjs'
import { fullRowSets, planMatrix } from './ci/plan-ci.mjs'
import { E2E_LABEL, INTEGRATION_LABEL } from './ci/related-tests.mjs'

export const SCHEMA = 'tracy-pr-merge-preflight/v1'
export const EXIT = { PASS: 0, FAIL: 1, USAGE: 2, UNKNOWN: 3 }

/** The three shared branches and the runner lane every job of a pull request into each asks for. */
export const LANES = { develop: 'tracy-lane-dev', staging: 'tracy-lane-dev', main: 'tracy-lane-dev' }
/** Every runner lane label, so a job on the wrong one is seen, not ignored. */
export const ALL_LANES = ['tracy-lane-dev', 'tracy-lane-prod']
/** The one label of a GitHub-hosted job: a fresh machine on no lane, so it needs none. */
export const HOSTED = 'ubuntu-latest'
/** The runner group the jobs API names for GitHub's own machines; a self-hosted runner can carry `HOSTED` too. */
export const HOSTED_GROUP = 'GitHub Actions'

/**
 * The workflows a ready pull request runs, and the jobs each must show. `tracy-ci.yml` adds its
 * `build check` rows in `requiredJobs()`. `scripts/test/check-pr-merge.test.mjs` reads the
 * workflow files and goes red when a name here no longer exists there.
 */
export const WORKFLOWS = [
  {
    file: 'tracy-ci.yml',
    name: 'Tracy CI',
    jobs: ['build dsh once for this run', 'plan the build-check rows']
  },
  { file: 'changelog-check.yml', name: 'Changelog Check', jobs: ['changelog'] },
  { file: 'pr-description-check.yml', name: 'PR Description Check', jobs: ['description'] },
  { file: 'regression-check.yml', name: 'Regression Check', jobs: ['Regression'] },
  { file: 'branch-fresh-check.yml', name: 'Branch Fresh Check', jobs: ['branch-fresh'] }
]

/** `name:` of the matrix job in tracy-ci.yml, with the row's group filled in. */
const ROW_PREFIX = 'build check ('
const rowJob = (group) => `${ROW_PREFIX}${group})`

// 100 is the API's largest page. Ten pages = 1000 runs of one workflow on one commit; the largest
// seen on this repository is 3, so reaching the cap means the answer is not what was asked for.
const PER_PAGE = 100
const MAX_PAGES = 10
// One `gh api` read answers in well under a second; 20 s is a dead connection, not a slow one.
const GH_TIMEOUT_MS = 20_000
// The largest response read here (100 runs) is about 1 MB untrimmed.
const GH_MAX_BYTES = 8 * 1024 * 1024
const FIXTURE_MAX_BYTES = 4 * 1024 * 1024
// The merge is the command right after the preflight. Two minutes covers a slow terminal and is
// far shorter than a CI run, so a verdict cannot be kept for "later".
export const VERDICT_MAX_AGE_MS = 120_000
const CLOCK_SKEW_MS = 5_000

const SHA = /^[0-9a-f]{40}$/
// The repository part may hold dots, never be made of them: `..` would climb out of the path.
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.+$)[A-Za-z0-9._-]{1,100}$/
const PR = /^[1-9][0-9]{0,8}$/
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const API_PATH = /^repos\/[A-Za-z0-9._/-]+(\?[A-Za-z0-9_=&.-]+)?$/

/** A relative REST path made of plain segments: no flag, no host, no `.`/`..`/empty segment. */
const isApiPath = (v) =>
  typeof v === 'string' &&
  API_PATH.test(v) &&
  v
    .split('?')[0]
    .split('/')
    .every((part) => !/^\.*$/.test(part))
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v) => Number.isSafeInteger(v) && v > 0
const isSha = (v) => typeof v === 'string' && SHA.test(v)
/**
 * A real instant, written the way GitHub writes it. `Date.parse` alone is not the test: it rolls
 * `2026-02-31` into March and `T24:00:00` into the next day, so the text must also be the one the
 * parsed instant prints back (to the second; a fraction cannot roll over).
 */
const isTime = (v) => {
  if (typeof v !== 'string' || !TIME.test(v)) return false
  const ms = Date.parse(v)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === v.slice(0, 19)
}
const isText = (v) => typeof v === 'string' && v.length > 0
const short = (sha) => sha.slice(0, 9)

export class Refusal extends Error {
  constructor(verdict, reason) {
    super(reason)
    this.verdict = verdict
  }
}
const fail = (reason) => {
  throw new Refusal('FAIL', reason)
}
const unknown = (reason) => {
  throw new Refusal('UNKNOWN', reason)
}

/**
 * The jobs a workflow's run must show as succeeded, for a pull request into `base`.
 * The `build check` rows come from the planner itself, so there is one definition of "always on":
 * into `develop` only `checks` exists for a documentation-only change, while `staging` and `main`
 * require every row (the planner runs them all for a release pull request). Every additional job
 * returned by the run is still checked for success below.
 *
 * A release run whose `plan` marked its tests forced Turbo rows (`full run` notice, 17/10/2026)
 * requires that set instead of the two workers shards (`fullRowSets()` in `plan-ci.mjs`); without
 * the mark, the shards — so a run missing both is never complete.
 * @param {string} file
 * @param {'develop' | 'staging' | 'main'} base
 * @param {{ forced?: boolean }} [options] - whether the run's plan printed the `full run` notice.
 * @returns {string[]}
 */
export function requiredJobs(file, base, { forced = false } = {}) {
  const workflow = WORKFLOWS.find((w) => w.file === file)
  if (!workflow) throw new Error(`not a required workflow: ${file}`)
  if (file !== 'tracy-ci.yml') return [...workflow.jobs]
  const plan = planMatrix({
    event: 'pull_request',
    baseRef: base,
    changed: ['docs/references/example.md'],
    allFiles: []
  })
  const rows =
    base !== 'develop' && forced ? fullRowSets().turbo : plan.matrix.include.map((row) => row.group)
  return [...workflow.jobs, ...rows.map((group) => rowJob(group))]
}

/**
 * Which run is the newest, from metadata — never from the order of the list.
 * Shared with the after-merge check, so both have one definition of "the latest run".
 *
 * A run listed by the API carries its LATEST attempt: `status` and `conclusion` are that attempt's
 * and `run_started_at` is when it started (a re-run resets it; `created_at` and `run_number` stay
 * those of the first attempt — read on this repository 05/10/2026: run 2553 attempt 2, created
 * 08:19:46, started 08:30:44). So "newest" is the latest `run_started_at`, not the highest run
 * number: an older run re-run after a newer one went green is the latest word on the commit.
 * What cannot be ordered is a `problem`, never a guess: a missing or impossible time, two latest
 * starts in the same second when one of them is a re-run, and ANY two runs whose numbers disagree
 * with their creation times (or, for first attempts, with their starts) — every neighbouring pair
 * is compared, so a contradiction among older runs refuses the list as much as one at its top.
 * The list must be the complete one (`listAll`): a re-run of an old run is found only by reading it.
 * @param {unknown[]} runs
 * @returns {{ run: object | null, problem?: string }} `run: null` with no `problem` = empty list.
 */
export function newestRun(runs) {
  if (!Array.isArray(runs)) return { run: null, problem: 'the run list is not a list' }
  const ids = new Set()
  const numbers = new Set()
  for (const r of runs) {
    if (!isObj(r)) return { run: null, problem: 'a run is not an object' }
    if (!isId(r.id) || !isId(r.run_number) || !isId(r.run_attempt))
      return {
        run: null,
        problem: `run ${JSON.stringify(r.id)}: id, run_number or run_attempt is not a positive integer`
      }
    if (!isTime(r.created_at)) return { run: null, problem: `run ${r.id}: created_at is not a timestamp` }
    if (!isTime(r.run_started_at))
      return {
        run: null,
        problem: `run ${r.id}: run_started_at is not a timestamp, so its latest attempt cannot be placed in time`
      }
    if (Date.parse(r.run_started_at) < Date.parse(r.created_at))
      return { run: null, problem: `run ${r.id}: its latest attempt started before the run was created` }
    if (!isText(r.status)) return { run: null, problem: `run ${r.id}: status is missing` }
    if (r.conclusion !== null && !isText(r.conclusion))
      return { run: null, problem: `run ${r.id}: conclusion is neither null nor a word` }
    if (ids.has(r.id)) return { run: null, problem: `run ${r.id} is listed twice` }
    if (numbers.has(r.run_number)) return { run: null, problem: `two runs carry run number ${r.run_number}` }
    ids.add(r.id)
    numbers.add(r.run_number)
  }
  if (runs.length === 0) return { run: null }
  // Every neighbouring pair by run number, not only the highest against the rest: run numbers are
  // handed out when a run is created, so a later number with an earlier creation time anywhere in
  // the list means one of the two clocks is not what it claims, and the starts are not trusted.
  const byNumber = [...runs].sort((a, b) => a.run_number - b.run_number)
  for (let i = 1; i < byNumber.length; i++) {
    const [prev, next] = [byNumber[i - 1], byNumber[i]]
    if (Date.parse(next.created_at) < Date.parse(prev.created_at))
      return {
        run: null,
        problem: `run ${next.id} (number ${next.run_number}) was created before run ${prev.id} (number ${prev.run_number}): the two orders disagree`
      }
  }
  // The same for first attempts and their starts: only a re-run may start out of number order.
  const firsts = byNumber.filter((r) => r.run_attempt === 1)
  for (let i = 1; i < firsts.length; i++) {
    const [prev, next] = [firsts[i - 1], firsts[i]]
    if (Date.parse(next.run_started_at) < Date.parse(prev.run_started_at))
      return {
        run: null,
        problem: `run ${next.id} (number ${next.run_number}) first started before run ${prev.id} (number ${prev.run_number}) did, and neither is a re-run: the two orders disagree`
      }
  }
  const started = (r) => Date.parse(r.run_started_at)
  const last = Math.max(...runs.map(started))
  const tied = runs.filter((r) => started(r) === last)
  // First attempts that started in the same second are still ordered by their run numbers. A
  // re-run among them is not: its number says when the run was created, not when this attempt began.
  const rerun = tied.length > 1 && tied.find((r) => r.run_attempt !== 1)
  if (rerun)
    return {
      run: null,
      problem: `run ${rerun.id} attempt ${rerun.run_attempt} and ${tied.length - 1} other run(s) started in the same second (${rerun.run_started_at}): which is the latest cannot be told`
    }
  return { run: tied.reduce((a, b) => (b.run_number > a.run_number ? b : a)) }
}

/** Reads every page of a list, or refuses: a first page is never taken for the whole answer. */
export async function listAll(get, path, key, what) {
  const rows = []
  let total = null
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) unknown(`${what}: more than ${MAX_PAGES} pages`)
    const body = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=${PER_PAGE}&page=${page}`)
    if (
      !isObj(body) ||
      !Number.isSafeInteger(body.total_count) ||
      body.total_count < 0 ||
      !Array.isArray(body[key])
    )
      unknown(`${what}: page ${page} is not a list with a total_count`)
    if (body.total_count > PER_PAGE * MAX_PAGES)
      unknown(
        `${what}: total_count ${body.total_count} is beyond the ${PER_PAGE * MAX_PAGES} this check reads`
      )
    if (total === null) total = body.total_count
    else if (body.total_count !== total)
      unknown(
        `${what}: total_count changed from ${total} to ${body.total_count} between pages — the list moved while it was read`
      )
    if (body[key].length > PER_PAGE) unknown(`${what}: page ${page} holds more than ${PER_PAGE} rows`)
    rows.push(...body[key])
    if (rows.length >= total) break
    if (body[key].length < PER_PAGE)
      unknown(
        `${what}: page ${page} holds ${body[key].length} rows but total_count ${total} promises more — truncated`
      )
  }
  if (rows.length !== total) unknown(`${what}: ${rows.length} rows for a total_count of ${total}`)
  const ids = new Set()
  for (const row of rows) {
    if (!isObj(row) || !isId(row.id)) unknown(`${what}: a row has no positive integer id`)
    if (ids.has(row.id)) unknown(`${what}: id ${row.id} is listed twice — a page was repeated`)
    ids.add(row.id)
  }
  return rows
}

function readPull(body, { repo, pr, base }) {
  const where = `pull request #${pr}`
  if (!isObj(body) || !isObj(body.head) || !isObj(body.base))
    unknown(`${where}: the response is not a pull request`)
  if (body.number !== pr) unknown(`${where}: the response is for pull request ${JSON.stringify(body.number)}`)
  if (!isObj(body.base.repo) || !isText(body.base.repo.full_name)) unknown(`${where}: no base repository`)
  if (body.base.repo.full_name.toLowerCase() !== repo.toLowerCase())
    unknown(`${where}: it belongs to ${body.base.repo.full_name}, not ${repo}`)
  if (!isText(body.state) || typeof body.draft !== 'boolean' || typeof body.merged !== 'boolean')
    unknown(`${where}: state, draft or merged is missing`)
  if (!isSha(body.head.sha)) unknown(`${where}: the head is not a commit id`)
  if (!isText(body.base.ref)) unknown(`${where}: no base branch`)
  if (!isTime(body.updated_at)) unknown(`${where}: updated_at is not a timestamp`)
  if (body.merged) fail(`${where} is already merged`)
  if (body.state !== 'open') fail(`${where} is ${body.state}, not open`)
  if (body.draft) fail(`${where} is a draft — drafts run no checks; mark it ready and wait for them`)
  if (body.base.ref !== base) fail(`${where} targets \`${body.base.ref}\`, not \`${base}\``)
  if (!isObj(body.head.repo) || !isText(body.head.repo.full_name)) unknown(`${where}: no head repository`)
  if (body.head.repo.full_name.toLowerCase() !== repo.toLowerCase())
    unknown(
      `${where}: its head lives in ${body.head.repo.full_name} — runs of a fork cannot be tied to a pull request`
    )
  // The labels decide what a run on `develop` was asked to test (`ci:e2e`, `ci:integration`); GitHub
  // always lists them, so an answer without them is incomplete, not "no label".
  if (base === 'develop' && (!Array.isArray(body.labels) || body.labels.some((l) => !isText(l?.name))))
    unknown(`${where}: the response lists no labels`)
  const labels = Array.isArray(body.labels) ? body.labels.map((l) => l?.name).filter(isText) : []
  return { head: body.head.sha, updatedAt: body.updated_at, labels }
}

function readTarget(body, base) {
  if (!isObj(body) || body.ref !== `refs/heads/${base}` || !isObj(body.object))
    unknown(`target \`${base}\`: the response is not that branch`)
  if (body.object.type !== 'commit' || !isSha(body.object.sha)) unknown(`target \`${base}\`: not a commit id`)
  return body.object.sha
}

/** `ours` = evidence for this pull request, head and target; `other` = somebody else's run. */
function association(run, { pr, base, head }) {
  const list = run.pull_requests
  if (!Array.isArray(list)) unknown(`run ${run.id}: no pull_requests list`)
  for (const p of list)
    if (
      !isObj(p) ||
      !isId(p.number) ||
      !isObj(p.head) ||
      !isSha(p.head.sha) ||
      !isObj(p.base) ||
      !isText(p.base.ref)
    )
      unknown(`run ${run.id}: a pull_requests entry is malformed`)
  if (list.length === 0)
    unknown(`run ${run.id}: GitHub names no pull request for it, so it cannot be tied to #${pr}`)
  const mine = list.filter((p) => p.number === pr)
  if (mine.length > 1) unknown(`run ${run.id}: pull request #${pr} is listed twice`)
  if (mine.length === 0) return 'other'
  return mine[0].head.sha === head && mine[0].base.ref === base ? 'ours' : 'other'
}

const nameOf = (workflow, run) =>
  `${workflow.name} run ${run.run_number} attempt ${run.run_attempt} (${run.html_url ?? `id ${run.id}`})`

/** The newest run of a workflow for this pull request, head and target — green, or a refusal. */
async function selectRun(get, workflow, ctx) {
  const { repo, base, head } = ctx
  const what = workflow.name
  const rows = await listAll(
    get,
    `repos/${repo}/actions/workflows/${workflow.file}/runs?head_sha=${head}`,
    'workflow_runs',
    `${what} runs`
  )
  const { problem } = newestRun(rows)
  if (problem) unknown(`${what}: ${problem}`)
  for (const r of rows)
    if (!isText(r.event) || !isSha(r.head_sha) || !isText(r.path))
      unknown(`${what}: run ${r.id} lacks event, head_sha or path`)
  // Not evidence: another event (manual, nightly, push), another commit, another workflow file.
  const candidates = rows.filter(
    (r) =>
      r.event === 'pull_request' && r.head_sha === head && r.path === `.github/workflows/${workflow.file}`
  )
  const ours = candidates.filter((r) => association(r, ctx) === 'ours')
  const { run } = newestRun(ours)
  if (!run)
    fail(
      `${what}: no pull_request run for #${ctx.pr} at ${short(head)} into \`${base}\` — it never ran on this commit (merged-as-draft shape), or only for another pull request or target`
    )
  const at = nameOf(workflow, run)
  if (run.status !== 'completed')
    fail(`${at} is \`${run.status}\`, not finished — the newest run decides, an older green one does not`)
  if (run.conclusion !== 'success')
    fail(`${at} ended \`${run.conclusion}\` — the newest run decides, an older green one does not`)
  return run
}

async function checkWorkflow(get, workflow, ctx) {
  const { repo, base, head } = ctx
  const what = workflow.name
  const run = await selectRun(get, workflow, ctx)
  const at = nameOf(workflow, run)
  const jobs = await listAll(
    get,
    `repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
    'jobs',
    `${what} jobs`
  )
  const byName = new Map()
  for (const j of jobs) {
    if (!isText(j.name) || !isText(j.status) || (j.conclusion !== null && !isText(j.conclusion)))
      unknown(`${at}: job ${j.id} lacks name, status or conclusion`)
    if (j.run_id !== run.id || j.run_attempt !== run.run_attempt || j.head_sha !== head)
      unknown(`${at}: job "${j.name}" belongs to another run, attempt or commit`)
    if (!Array.isArray(j.labels) || j.labels.some((l) => typeof l !== 'string'))
      unknown(`${at}: job "${j.name}" has no label list`)
    if (byName.has(j.name)) unknown(`${at}: two jobs are named "${j.name}"`)
    byName.set(j.name, j)
  }
  // A Tracy CI run that skipped the suite because its tree already passed a full run: the rows are
  // waived only after the proof is checked again HERE, from the API, by the same rule the run used.
  const skipped = workflow.file === 'tracy-ci.yml' && (await verifiedSkip(get, ctx, at, jobs))
  // A pull request that asked for a suite by label must not be merged on a run that left it out.
  if (workflow.file === 'tracy-ci.yml' && base === 'develop' && !skipped)
    await labelsHonoured(get, ctx, at, run, jobs)
  const forced =
    workflow.file === 'tracy-ci.yml' &&
    base !== 'develop' &&
    !skipped &&
    (await forcedRun(get, ctx, run, jobs))
  const required = requiredJobs(workflow.file, base, { forced }).filter(
    (name) => !(skipped && name.startsWith(ROW_PREFIX))
  )
  for (const name of required) if (!byName.has(name)) fail(`${at}: required job "${name}" is missing`)
  const lane = LANES[base]
  for (const j of jobs) {
    const mayBeSkipped = !required.includes(j.name) && (skipped || !j.name.startsWith(ROW_PREFIX))
    if (j.status !== 'completed') fail(`${at}: job "${j.name}" is \`${j.status}\`, not finished`)
    if (j.conclusion === 'skipped' && mayBeSkipped) continue
    if (j.conclusion !== 'success') fail(`${at}: job "${j.name}" ended \`${j.conclusion}\``)
    if (j.labels.length === 1 && j.labels[0] === HOSTED && j.runner_group_name === HOSTED_GROUP) continue
    const lanes = j.labels.filter((l) => ALL_LANES.includes(l))
    if (lanes.length !== 1 || lanes[0] !== lane)
      fail(
        `${at}: job "${j.name}" ran on lane ${JSON.stringify(lanes)}, not \`${lane}\` — pull-request jobs run only on the dev lane`
      )
  }
  return {
    workflow: workflow.name,
    file: workflow.file,
    runId: run.id,
    runNumber: run.run_number,
    runAttempt: run.run_attempt,
    runStartedAt: run.run_started_at,
    url: typeof run.html_url === 'string' ? run.html_url : null,
    jobs: jobs.length
  }
}

/**
 * Did the newest Tracy CI run test what the pull request's labels ask for? On `develop`, `ci:e2e` asks
 * for the browser row and `ci:integration` for the database tests; a run that recorded `tested scope`
 * `partial:…` left them out (`scripts/ci/test-scope.mjs`). Adding the label starts a re-run
 * (`ci-label-rerun.yml`), but between the label and the re-run's first job the old green run is still
 * the newest, and if the re-run is refused it stays so. A run that skipped the suite on a full proof
 * is not asked here (its proof is `full`). A label with no recorded scope is a FAIL too: a run from
 * before the rule, or an unreadable record, cannot be shown to have honoured it.
 */
async function labelsHonoured(get, ctx, at, run, jobs) {
  const asked = [E2E_LABEL, INTEGRATION_LABEL].filter((label) => ctx.labels.includes(label))
  if (asked.length === 0) return
  const { testedScope } = await recordedBy(get, ctx.repo, run, jobs)
  const wait = 'wait for the re-run that adding the label starts'
  if (testedScope === null)
    fail(
      `${at}: label ${asked.join(', ')} is on the pull request but the run recorded no tested scope — it cannot be shown to have honoured it; ${wait}`
    )
  const left = testedScope === 'full' ? [] : testedScope.replace('partial:', '').split('+')
  const wants = [
    [INTEGRATION_LABEL, 'db', 'the database tests'],
    [E2E_LABEL, 'e2e', 'the e2e row']
  ]
  for (const [label, part, what] of wants)
    if (asked.includes(label) && left.includes(part))
      fail(
        `${at}: label ${label} asks for ${what} but the latest run skipped it (tested scope ${testedScope}) — ${wait}`
      )
}

/**
 * Did this Tracy CI run skip its build-check rows on a proof that holds? False when it did not try
 * (no `full suite skipped` job); a FAIL when it tried and the proof does not hold. The run's plan
 * job must record both the tree it tested and the skip naming that tree and a proof run; the proof
 * run must pass `proofProblem` for that tree (`scripts/ci/green-tree.mjs`).
 */
async function verifiedSkip(get, ctx, at, jobs) {
  // On every run that did NOT skip, the job is listed as `skipped` under its raw template name.
  const skipJob = jobs.find((j) => j.name.startsWith(SKIP_JOB_PREFIX) && j.conclusion !== 'skipped')
  if (!skipJob) return false
  if (skipJob.conclusion !== 'success') fail(`${at}: job "${skipJob.name}" ended \`${skipJob.conclusion}\``)
  const plan = jobs.find((j) => j.name === PLAN_JOB)
  if (!plan) fail(`${at}: the suite was skipped but there is no "${PLAN_JOB}" job`)
  const notes = await get(`repos/${ctx.repo}/check-runs/${plan.id}/annotations?per_page=100`)
  const skip = skipNoticeOf(notes)
  if (!skip) fail(`${at}: the suite was skipped but the plan job holds no single skip record`)
  const tested = testedTreeOf(notes)
  if (tested !== skip.tree)
    fail(`${at}: the skip names tree ${skip.tree} but the run recorded tested tree ${tested ?? '(none)'}`)
  const proof = await get(`repos/${ctx.repo}/actions/runs/${skip.runId}`)
  const { jobs: proofJobs, testedTree, testedScope, forced } = await inspectRun(get, ctx.repo, proof)
  const problem = proofProblem({
    run: proof,
    jobs: proofJobs,
    testedTree,
    testedScope,
    tree: skip.tree,
    repo: ctx.repo,
    forced
  })
  if (problem) fail(`${at}: the suite was skipped on run ${skip.runId}, which proves nothing: ${problem}`)
  return true
}

/**
 * Whether the plan job that planned this attempt printed the `full run` notice of forced Turbo rows
 * (read from an earlier attempt when a re-run of failed jobs only copied it); false without one.
 */
async function forcedRun(get, ctx, run, jobs) {
  return forcedFullRunOf(await planAnnotations(get, ctx.repo, run, jobs))
}

/**
 * The run list again, after the jobs were read: the evidence must still be the newest run in the
 * attempt that was checked. A re-run started in between leaves the pull request, its head and the
 * target untouched, so only this read can see it.
 */
async function recheckWorkflow(get, workflow, ctx, checked) {
  const run = await selectRun(get, workflow, ctx)
  if (
    run.id !== checked.runId ||
    run.run_number !== checked.runNumber ||
    run.run_attempt !== checked.runAttempt ||
    run.run_started_at !== checked.runStartedAt
  )
    fail(
      `${workflow.name}: run ${checked.runNumber} attempt ${checked.runAttempt} was checked, but the newest is now ${nameOf(workflow, run)} — a run or attempt started during the preflight; run it again`
    )
}

/** Runs one step for every workflow at once; of several refusals, an UNKNOWN is the one thrown. */
async function eachWorkflow(step) {
  const settled = await Promise.allSettled(WORKFLOWS.map(step))
  // UNKNOWN first: when part of the picture is missing, a known red elsewhere is still reported
  // as "not verified" rather than as the whole story.
  const refused = settled.filter((s) => s.status === 'rejected').map((s) => s.reason)
  const worst = refused.find((e) => !(e instanceof Refusal) || e.verdict === 'UNKNOWN') ?? refused[0]
  if (worst) throw worst
  return settled.map((s) => s.value)
}

/**
 * The whole preflight, away from the transport so saved responses can drive it.
 * @param {object} input
 * @param {string} input.repo - `OWNER/REPO`.
 * @param {number} input.pr
 * @param {'develop' | 'staging' | 'main'} input.base
 * @param {(path: string) => Promise<unknown>} input.get - one GET; throws when it cannot answer.
 * @param {'github' | 'fixture'} [input.source]
 * @param {() => number} [input.now]
 * @returns {Promise<{ verdict: 'PASS' | 'FAIL' | 'UNKNOWN', reason?: string }>} only a PASS carries
 *   `expectedHead` and the rest of the verdict.
 */
export async function preflight({ repo, pr, base, get, source = 'github', now = Date.now }) {
  try {
    if (!REPO.test(repo) || !isId(pr) || !Object.hasOwn(LANES, base)) unknown('bad repo, pr or base')
    const ctx = { repo, pr, base }
    const pullPath = `repos/${repo}/pulls/${pr}`
    const targetPath = `repos/${repo}/git/ref/heads/${base}`
    const first = readPull(await get(pullPath), ctx)
    const target = readTarget(await get(targetPath), base)
    ctx.head = first.head
    ctx.labels = first.labels

    const checks = await eachWorkflow((w) => checkWorkflow(get, w, ctx))

    // Last, and in this order: the runs, the pull request, then the target. Anything that moved
    // while the checks were read makes them a description of something else.
    await eachWorkflow((w, i) => recheckWorkflow(get, w, ctx, checks[i]))
    const again = readPull(await get(pullPath), ctx)
    if (again.head !== first.head)
      fail(`the head moved from ${short(first.head)} to ${short(again.head)} during the preflight`)
    if (again.updatedAt !== first.updatedAt)
      fail('the pull request was edited during the preflight (an edit starts new check runs) — run it again')
    const targetAgain = readTarget(await get(targetPath), base)
    if (targetAgain !== target)
      fail(
        `\`${base}\` moved from ${short(target)} to ${short(targetAgain)} during the preflight — merge it into the branch, re-run the tests, run this again`
      )

    return {
      schema: SCHEMA,
      verdict: 'PASS',
      source,
      enforcement: 'none — a check to obey, not a merge lock; the target can still move before the merge',
      repo,
      pr,
      base,
      expectedHead: first.head,
      targetSha: target,
      checkedAt: new Date(now()).toISOString(),
      checks
    }
  } catch (e) {
    if (e instanceof Refusal) return { verdict: e.verdict, reason: e.message }
    return {
      verdict: 'UNKNOWN',
      reason: `could not read GitHub: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

/**
 * The head a PASS line allows to be merged — or a refusal. This is the coordinator's side of the
 * contract: a line that is cut short, a FAIL, a fixture run, another pull request's verdict or an
 * old one yields no commit id, so there is nothing to hand to `--match-head-commit`.
 * @param {string} text - stdout of a preflight run.
 * @param {{ repo: string, pr: number, base: string }} want
 * @param {number} [nowMs]
 * @returns {{ ok: true, sha: string } | { ok: false, reason: string }}
 */
export function expectedHeadOf(text, want, nowMs = Date.now()) {
  const no = (reason) => ({ ok: false, reason })
  let v
  try {
    v = JSON.parse(text)
  } catch {
    return no('the verdict is not complete JSON (empty or cut short)')
  }
  if (!isObj(v) || v.schema !== SCHEMA) return no(`not a ${SCHEMA} verdict`)
  if (v.verdict !== 'PASS') return no(`the verdict is ${JSON.stringify(v.verdict)}, not PASS`)
  if (v.source !== 'github')
    return no(`the verdict was not read from GitHub (source ${JSON.stringify(v.source)})`)
  if (v.repo !== want.repo || v.pr !== want.pr || v.base !== want.base)
    return no(
      `the verdict is for ${v.repo}#${v.pr} into ${v.base}, not ${want.repo}#${want.pr} into ${want.base}`
    )
  if (!isSha(v.expectedHead) || !isSha(v.targetSha))
    return no('the verdict carries no head or target commit id')
  if (!isTime(v.checkedAt)) return no('the verdict carries no time')
  const age = nowMs - Date.parse(v.checkedAt)
  if (age > VERDICT_MAX_AGE_MS)
    return no(`the verdict is ${Math.round(age / 1000)} s old — run the preflight again right before merging`)
  if (age < -CLOCK_SKEW_MS) return no('the verdict is dated in the future')
  if (!Array.isArray(v.checks)) return no('the verdict lists no checks')
  for (const w of WORKFLOWS) {
    const rows = v.checks.filter((c) => isObj(c) && c.file === w.file)
    if (
      rows.length !== 1 ||
      !isId(rows[0].runId) ||
      !isId(rows[0].runNumber) ||
      !isId(rows[0].runAttempt) ||
      !isTime(rows[0].runStartedAt)
    )
      return no(`the verdict does not name one run and attempt of ${w.name}`)
  }
  if (v.checks.length !== WORKFLOWS.length)
    return no('the verdict lists a check this preflight does not make')
  return { ok: true, sha: v.expectedHead }
}

/**
 * GET only: CI uses the App reader with quota fallback; local callers use fixed `gh api` argv.
 * @param {{ bin?: string, timeoutMs?: number, maxBytes?: number }} [opts]
 */
export function ghTransport({ bin = 'gh', timeoutMs = GH_TIMEOUT_MS, maxBytes = GH_MAX_BYTES } = {}) {
  const read = githubReader({ timeoutMs })
  return (path) =>
    new Promise((done, refuse) => {
      if (!isApiPath(path)) return refuse(new Error(`refusing to request ${JSON.stringify(path)}`))
      if (bin === 'gh' && process.env.TRACY_CI_READ_APP_TOKEN && /^repos\/TracyHQ\/tch(?:\/|$)/.test(path)) {
        githubJson(read, path, maxBytes).then(done, refuse)
        return
      }
      const argv = [
        'api',
        '--method',
        'GET',
        '-H',
        'Accept: application/vnd.github+json',
        '-H',
        'X-GitHub-Api-Version: 2022-11-28',
        path
      ]
      const env = { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }
      execFile(
        bin,
        argv,
        { timeout: timeoutMs, maxBuffer: maxBytes, killSignal: 'SIGKILL', encoding: 'utf8', env },
        (err, stdout, stderr) => {
          if (err) {
            const firstLine = String(stderr ?? '')
              .trim()
              .split('\n')[0]
              .slice(0, 200)
            let why = `exit ${err.code}${firstLine ? ` — ${firstLine}` : ''}`
            if (err.code === 'ENOENT') why = '`gh` is not installed or not on PATH'
            else if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
              why = `the response is larger than ${maxBytes} bytes`
            else if (err.killed) why = `no answer within ${timeoutMs} ms`
            return refuse(new Error(`gh api ${path}: ${why}`))
          }
          try {
            done(JSON.parse(stdout))
          } catch {
            refuse(new Error(`gh api ${path}: the response is not JSON`))
          }
        }
      )
    })
}

/**
 * Saved responses instead of GitHub. The file is opened without following a link and without
 * waiting (a FIFO would otherwise hang the read), and must be a regular file.
 * @param {string} file - `{ "responses": { "<GET path>": [body, …] } }`; the nth read of a path
 *   gets the nth body, the last one repeats.
 */
export function fixtureTransport(file) {
  let fd
  let text
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const st = fstatSync(fd)
    if (!st.isFile()) throw new Error('not a regular file')
    if (st.size === 0) throw new Error('empty')
    if (st.size > FIXTURE_MAX_BYTES) throw new Error(`larger than ${FIXTURE_MAX_BYTES} bytes`)
    text = readFileSync(fd, 'utf8')
  } catch (e) {
    throw new Error(`fixture ${file}: ${e.code === 'ELOOP' ? 'not a regular file (a link)' : e.message}`)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  let saved
  try {
    saved = JSON.parse(text)
  } catch {
    throw new Error(`fixture ${file}: not JSON`)
  }
  if (!isObj(saved) || !isObj(saved.responses)) throw new Error(`fixture ${file}: no "responses" map`)
  const served = new Map()
  return async (path) => {
    const list = Object.hasOwn(saved.responses, path) ? saved.responses[path] : null
    if (!Array.isArray(list) || list.length === 0)
      throw new Error(`the fixture holds no response for ${path}`)
    const n = served.get(path) ?? 0
    served.set(path, n + 1)
    return structuredClone(list[Math.min(n, list.length - 1)])
  }
}

const USAGE = `usage: node scripts/check-pr-merge.mjs --repo OWNER/REPO --pr NUMBER --base develop|staging|main [--fixture FILE | --expected-head VERDICT_JSON]`

/**
 * @param {string[]} argv
 * @returns {{ opts: { repo: string, pr: number, base: string, fixture?: string, expectedHead?: string } } | { error: string }}
 */
export function parseArgs(argv) {
  const known = {
    '--repo': 'repo',
    '--pr': 'pr',
    '--base': 'base',
    '--fixture': 'fixture',
    '--expected-head': 'expectedHead'
  }
  const got = {}
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    if (!Object.hasOwn(known, flag)) return { error: `unknown argument ${JSON.stringify(flag)}` }
    const key = known[flag]
    if (Object.hasOwn(got, key)) return { error: `${flag} given twice` }
    const value = argv[i + 1]
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--'))
      return { error: `${flag} needs a value` }
    got[key] = value
  }
  for (const flag of ['--repo', '--pr', '--base'])
    if (!Object.hasOwn(got, known[flag])) return { error: `${flag} is required` }
  if (!REPO.test(got.repo)) return { error: `--repo must be OWNER/REPO, got ${JSON.stringify(got.repo)}` }
  if (!PR.test(got.pr)) return { error: `--pr must be a pull request number, got ${JSON.stringify(got.pr)}` }
  if (!Object.hasOwn(LANES, got.base))
    return { error: `--base must be develop, staging or main, got ${JSON.stringify(got.base)}` }
  if (Object.hasOwn(got, 'fixture') && Object.hasOwn(got, 'expectedHead'))
    return { error: '--fixture and --expected-head cannot be combined' }
  return { opts: { ...got, pr: Number(got.pr) } }
}

/**
 * Prints a verdict and returns the exit code. stdout gets the JSON line of a PASS and nothing
 * else, ever; a PASS that cannot be written whole is not a PASS.
 * @param {{ verdict: string, reason?: string }} v
 * @param {{ out: (s: string) => void, err: (s: string) => void }} io
 * @returns {number}
 */
export function emit(v, { out, err }) {
  if (v.verdict !== 'PASS') {
    err(`check-pr-merge: ${v.verdict} — ${v.reason}\n`)
    err(
      v.verdict === 'UNKNOWN'
        ? 'Nothing was verified. Do not merge on this; run it again.\n'
        : 'Do not merge. Fix what is named above, wait for the checks, run it again.\n'
    )
    return v.verdict === 'FAIL' ? EXIT.FAIL : EXIT.UNKNOWN
  }
  try {
    out(`${JSON.stringify(v)}\n`)
  } catch (e) {
    err(
      `check-pr-merge: UNKNOWN — the verdict could not be written (${e.message}). Do not merge on this; run it again.\n`
    )
    return EXIT.UNKNOWN
  }
  err(
    `check-pr-merge: PASS — ${v.repo}#${v.pr} into \`${v.base}\` at ${short(v.expectedHead)} (\`${v.base}\` at ${short(v.targetSha)})\n`
  )
  for (const c of v.checks)
    err(
      `  ${c.workflow}: run ${c.runNumber} attempt ${c.runAttempt}, ${c.jobs} job(s) — ${c.url ?? c.runId}\n`
    )
  if (v.source === 'github')
    err(
      `  Merge now with: gh pr merge ${v.pr} --repo ${v.repo} --merge --match-head-commit ${v.expectedHead}\n`
    )
  else err('  ⚠ read from a fixture, not from GitHub: this says nothing about a real pull request.\n')
  err(
    '  A check, not a lock: the target can still move before the merge, and nothing on GitHub enforces this.\n'
  )
  return EXIT.PASS
}

async function main(argv) {
  const io = { out: (s) => writeSync(1, s), err: (s) => process.stderr.write(s) }
  const parsed = parseArgs(argv)
  if (parsed.error) {
    io.err(`check-pr-merge: ${parsed.error}\n${USAGE}\n`)
    return EXIT.USAGE
  }
  const { repo, pr, base, fixture, expectedHead } = parsed.opts
  if (expectedHead !== undefined) {
    const r = expectedHeadOf(expectedHead, { repo, pr, base })
    if (!r.ok) {
      io.err(`check-pr-merge: no head to merge — ${r.reason}\n`)
      return EXIT.FAIL
    }
    io.out(`${r.sha}\n`)
    return EXIT.PASS
  }
  let get
  try {
    get = fixture === undefined ? ghTransport() : fixtureTransport(fixture)
  } catch (e) {
    return emit({ verdict: 'UNKNOWN', reason: e.message }, io)
  }
  const verdict = await preflight({
    repo,
    pr,
    base,
    get,
    source: fixture === undefined ? 'github' : 'fixture'
  })
  return emit(verdict, io)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main(process.argv.slice(2))
