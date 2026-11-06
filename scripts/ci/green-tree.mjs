/**
 * Skip the full Tracy CI suite for a pull request whose TREE already passed a full run
 * (10/10/2026).
 *
 * WHY. A `staging` → `main` release pull request carries the exact tree that went green on the
 * `develop` → `staging` one minutes earlier (PR #1136 vs #1130: tree c24f1e478a… both times), and the
 * suite took ~25 minutes to say the same thing again. Same tree = same bytes = same verdict.
 *
 * 🔒 THE TREE, NEVER THE COMMIT. Decided by `git rev-parse HEAD^{tree}` of what this run checked out
 * (for a pull request: GitHub's merge commit, i.e. exactly what the suite would test). A tree that
 * differs in one byte — a hotfix on `staging`, a moved base — finds no proof and runs everything.
 *
 * 🔒 WHAT COUNTS AS PROOF — all of it, checked in `proofProblem`:
 *   - a `tracy-ci.yml` run of THIS repository, head repository included (never a fork's run);
 *   - `completed` / `success` (a cancelled, failed or still-running run is nothing);
 *   - its latest attempt has EVERY full `build check` row (the release set, `fullRowJobs()`) and each
 *     one `success` — a routine PR's `tests related` run, a run with a skipped row, or a skip run like
 *     this one (no rows at all) never qualifies, so skips cannot chain. Since 17/10/2026 a full run's
 *     tests may be the forced Turbo rows instead of the two workers shards (`fullRowSets()`); that
 *     set counts ONLY when the run's `plan` also printed the `full run` notice, because a pull
 *     request into develop has rows of the same names whose tasks the cache may have served. Since
 *     30/10/2026 the three workers shards of a GitHub-hosted run count as the two do;
 *   - its `plan` job RECORDED the tree it tested (a `tested tree` notice, written by every run since
 *     this change) and that tree is ours. The run's head-commit tree only nominates candidates: a
 *     pull-request run tests a merge with its base, which is not its head when the base had moved.
 *     A run from before this change recorded nothing, so it proves nothing;
 *   - and RECORDED that it tested everything (`tested scope` = `full`, 16/10/2026). A pull request into
 *     `develop` without the label `ci:integration` leaves the database-backed workers tests out
 *     (`test-scope.mjs`), and one without `ci:e2e` leaves out the browser row; such a run can still
 *     carry every release row by name, so rows alone no longer say "full". A run that recorded any
 *     other scope, or none (every run before this rule), proves nothing: its benefit starts with the
 *     next run, the same price the `tested tree` record asked.
 *
 * FAILS CLOSED. Any API error, a malformed answer, a non-pull-request event: the full suite runs.
 * The light gates (description, changelog, branch-fresh, Regression) are other workflows and are
 * untouched. `check-pr-merge.mjs` re-checks a skip with this same `proofProblem` before a merge.
 *
 *   node scripts/ci/green-tree.mjs                      # in the `plan` job (env below)
 *   GH_TOKEN=$(gh auth token) node scripts/ci/green-tree.mjs --dry-run --repo TracyHQ/tch --tree <40hex>
 *
 * Witness: `scripts/test/ci-green-tree.test.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { FULL_RUN_TITLE, fullRowSets, planMatrix } from './plan-ci.mjs'
import { githubRead } from './github-read.mjs'

export const WORKFLOW_PATH = '.github/workflows/tracy-ci.yml'
export const PLAN_JOB = 'plan the build-check rows'
const TESTED_TITLE = 'tested tree'
const SCOPE_TITLE = 'tested scope'
const SKIP_TITLE = 'full suite skipped'
/** The job that runs only on a skip; its name says why (`tracy-ci.yml`, job `suite-skipped`). */
export const SKIP_JOB_PREFIX = `${SKIP_TITLE}: `
/** How far back a proof is looked for, and how many nominated runs are inspected at most. */
const LOOKBACK_DAYS = 14
const MAX_PAGES = 3
const MAX_INSPECT = 5

const isTree = (s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s)

/** Every `build check` row a full run has — the planner's own release set, not a hand list. */
export function fullRowJobs() {
  const plan = planMatrix({ event: 'workflow_dispatch', changed: null, allFiles: [] })
  return plan.matrix.include.map((row) => `build check (${row.group})`)
}

/** Whether the run's `plan` marked its rows a forced full Turbo run (`plan-ci.mjs`), from its annotations. */
export function forcedFullRunOf(annotations) {
  if (!Array.isArray(annotations)) return false
  return annotations.some((a) => a?.title === FULL_RUN_TITLE && String(a.message ?? '').trim() === 'turbo')
}

/** The one label of a GitHub-hosted job, and the runner group the jobs API names for GitHub's machines. */
export const HOSTED_LABEL = 'ubuntu-latest'
export const HOSTED_GROUP = 'GitHub Actions'
/** A job GitHub ran on its own `ubuntu-latest`: its one label AND GitHub's runner group (a self-hosted runner can carry the label). */
export const ranHosted = (j) =>
  Array.isArray(j?.labels) &&
  j.labels.length === 1 &&
  j.labels[0] === HOSTED_LABEL &&
  j.runner_group_name === HOSTED_GROUP

/**
 * The runner kind the planned rows of a Tracy CI run ran on (30/10/2026): the plan job and every
 * `build check` row that ran must agree, GitHub-hosted or ours. `plan` sizes the workers rows for its
 * own runner (three shards hosted, two ours) and the rows ask for theirs by the same condition, so a
 * mix means rows that were not the ones planned — refused, never read as either kind. A skipped row
 * ran nowhere and is not counted.
 * @param {any[]} jobs
 * @returns {{ hosted: boolean } | { problem: string }}
 */
export function runnerKindOf(jobs) {
  const ran = jobs.filter(
    (j) =>
      j?.name === PLAN_JOB || (String(j?.name).startsWith('build check (') && j?.conclusion !== 'skipped')
  )
  const hosted = ran.filter(ranHosted).map((j) => j.name)
  const ours = ran.filter((j) => !ranHosted(j)).map((j) => j.name)
  if (hosted.length > 0 && ours.length > 0)
    return {
      problem: `the plan job and the build-check rows ran on different runner kinds (GitHub-hosted: ${hosted.join(', ')}; self-hosted: ${ours.join(', ')}), so the rows are not the ones planned`
    }
  return { hosted: hosted.length > 0 }
}

/**
 * Which full row set a run's jobs prove, or null: the legacy set alone (two workers shards on our
 * runners, three on GitHub-hosted — each only on the runner kind the rows ran on), or the forced
 * Turbo set with `plan`'s mark. Every row of the set must be there and `success`. Shared with the
 * pre-merge check.
 * @param {any[]} jobs @param {boolean} forced
 * @returns {{ set: 'legacy' | 'hosted' | 'turbo', rows: string[] } | { problem: string }}
 */
export function fullSetOf(jobs, forced) {
  const kind = runnerKindOf(jobs)
  if ('problem' in kind) return kind
  const byName = new Map(jobs.map((j) => [j?.name, j]))
  const sets = fullRowSets()
  const tried = []
  for (const set of /** @type {const} */ (['legacy', 'hosted', 'turbo'])) {
    const rows = sets[set].map((group) => `build check (${group})`)
    const missing = rows.find((name) => !byName.has(name))
    if (missing) {
      tried.push(`no "${missing}"`)
      continue
    }
    // The workers shards are sized for a runner kind: two on ours, three on GitHub-hosted.
    if (set !== 'turbo' && (set === 'hosted') !== kind.hosted) {
      tried.push(
        `the ${set === 'hosted' ? 'three' : 'two'} workers shards ran ${kind.hosted ? 'GitHub-hosted' : 'self-hosted'}, where ${kind.hosted ? 'three' : 'two'} are planned`
      )
      continue
    }
    if (set === 'turbo' && !forced) {
      tried.push('Turbo rows without the `full run` notice of its plan job (a cache may have served them)')
      continue
    }
    const red = rows.find((name) => byName.get(name)?.conclusion !== 'success')
    if (red) return { problem: `"${red}" ended ${byName.get(red)?.conclusion} — not a full green run` }
    return { set, rows }
  }
  return { problem: `not a full run (${tried.join('; ')})` }
}

/** The workflow command the `plan` job prints so later runs can read what it tested. */
export const testedTreeNotice = (tree) => `::notice title=${TESTED_TITLE}::${tree}`

/** The scopes a run may record: everything, or what an opt-in rule left out (`test-scope.mjs`). */
const SCOPE = /^(?:full|partial:(?:db|e2e|db\+e2e))$/

/** The workflow command the `plan` job prints so later runs can tell whether this one tested everything. */
export const testedScopeNotice = (scope) => `::notice title=${SCOPE_TITLE}::${scope}`

/**
 * What a job recorded it tested, from its annotations: `full` or `partial:…`; null when absent,
 * malformed or ambiguous. Anything unreadable stays null, which is never `full`.
 */
export function testedScopeOf(annotations) {
  if (!Array.isArray(annotations)) return null
  const scopes = new Set(
    annotations.filter((a) => a?.title === SCOPE_TITLE).map((a) => String(a.message ?? '').trim())
  )
  if (scopes.size !== 1) return null
  const [scope] = scopes
  return SCOPE.test(scope) ? scope : null
}

/** The tree a job recorded, from its annotations; null when absent, malformed or ambiguous. */
export function testedTreeOf(annotations) {
  if (!Array.isArray(annotations)) return null
  const trees = new Set(
    annotations.filter((a) => a?.title === TESTED_TITLE).map((a) => String(a.message ?? '').trim())
  )
  if (trees.size !== 1) return null
  const [tree] = trees
  return isTree(tree) ? tree : null
}

/** The line a skip prints — the words reviewers and /ops/ci see. */
export const skipNotice = (tree, url) =>
  `::notice title=${SKIP_TITLE}::tree ${tree} already green in run ${url}`

/** Reads a skip record back: `{ tree, runId }`, or null. */
export function skipNoticeOf(annotations) {
  if (!Array.isArray(annotations)) return null
  const found = annotations
    .filter((a) => a?.title === SKIP_TITLE)
    .map((a) =>
      /^tree ([0-9a-f]{40}) already green in run \S*\/actions\/runs\/(\d+)\s*$/.exec(String(a.message ?? ''))
    )
  if (found.length !== 1 || !found[0]) return null
  return { tree: found[0][1], runId: Number(found[0][2]) }
}

/**
 * Why `run` is not proof that `tree` passed the full suite; null when it is.
 * @param {{ run: object, jobs: {name: string, conclusion: string|null}[], testedTree: string|null, testedScope?: string|null, tree: string, repo: string }} input
 */
export function proofProblem({ run, jobs, testedTree, testedScope = null, tree, repo, forced = false }) {
  if (run?.path !== WORKFLOW_PATH) return `run ${run?.id} is not a Tracy CI run`
  if (run.repository?.full_name !== repo || run.head_repository?.full_name !== repo)
    return `run ${run.id} is not from ${repo} itself`
  if (run.status !== 'completed' || run.conclusion !== 'success')
    return `run ${run.id} is ${run.status}/${run.conclusion}, not completed/success`
  if (!Array.isArray(jobs)) return `run ${run.id}: its jobs could not be read`
  const full = fullSetOf(jobs, forced)
  if ('problem' in full) return `run ${run.id}: ${full.problem}`
  if (testedTree !== tree) return `run ${run.id} recorded tested tree ${testedTree ?? '(none)'}, not ${tree}`
  // Rows alone do not say a run tested everything: an opt-in run keeps them all by name and drops tests.
  if (testedScope !== 'full')
    return `run ${run.id} recorded tested scope ${testedScope ?? '(none)'}, not full — some tests were opted out of that run`
  return null
}

/**
 * The decision. `runs` = Tracy CI runs (any order, any conclusion); `inspect(run)` reads that run's
 * latest-attempt jobs and its plan job's recorded tested tree.
 * @returns {Promise<{ skip: true, tree: string, run: { id: number, url: string } } | { skip: false, why: string }>}
 */
export async function findProof({ tree, repo, runs, currentRunId = null, inspect }) {
  if (!isTree(tree)) return { skip: false, why: `"${tree}" is not a tree id` }
  const nominated = (Array.isArray(runs) ? runs : [])
    .filter(
      (r) =>
        r?.head_commit?.tree_id === tree &&
        r.id !== currentRunId &&
        r.status === 'completed' &&
        r.conclusion === 'success' &&
        r.path === WORKFLOW_PATH
    )
    .sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at))
    .slice(0, MAX_INSPECT)
  const problems = []
  for (const run of nominated) {
    const { jobs, testedTree, testedScope, forced } = await inspect(run)
    const problem = proofProblem({ run, jobs, testedTree, testedScope, tree, repo, forced })
    if (!problem) return { skip: true, tree, run: { id: run.id, url: run.html_url } }
    problems.push(problem)
  }
  if (problems.length === 0) return { skip: false, why: `no green Tracy CI run has tree ${tree}` }
  return { skip: false, why: `no run proves tree ${tree}: ${problems.join('; ')}` }
}

// ── transport ────────────────────────────────────────────────────────────────────────────────────

async function api(path) {
  const res = await githubRead(path)
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`)
  return res.json()
}

/**
/**
 * The annotations of the `plan` job that planned this attempt's rows.
 *
 * ⚠ A RE-RUN OF FAILED JOBS DOES NOT RE-RUN `plan` (measured 17/10/2026, run 39009080773): attempt 2
 * lists a COPY of attempt 1's plan job under a new id, same `started_at`, and with no annotations —
 * its rows still run what attempt 1's plan decided. So when this attempt's plan job is such a copy,
 * the notes are read from the attempt that ran it. A plan job that really ran again (a re-run of
 * all jobs) has a `started_at` of its own and is read as it is, notes or none.
 * @param {(path: string) => Promise<any>} get @param {string} repo
 * @param {{ id: number, run_attempt: number }} run @param {any[]} jobs - this attempt's jobs
 * @returns {Promise<any[]>}
 */
export async function planAnnotations(get, repo, run, jobs) {
  let plan = jobs.find((j) => j?.name === PLAN_JOB)
  if (!plan) return []
  for (let attempt = run.run_attempt - 1; attempt >= 1; attempt--) {
    const earlier = (await get(`repos/${repo}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`))
      ?.jobs
    const before = Array.isArray(earlier) ? earlier.find((j) => j?.name === PLAN_JOB) : null
    if (!before || !plan.started_at || before.started_at !== plan.started_at) break
    plan = before
  }
  const notes = await get(`repos/${repo}/check-runs/${plan.id}/annotations?per_page=100`)
  return Array.isArray(notes) ? notes : []
}

/**
 * What the plan job of an attempt recorded: the tree it tested, what it tested of it, and whether it
 * marked its rows a forced full Turbo run. A run without a plan job recorded nothing.
 */
export async function recordedBy(get, repo, run, jobs) {
  const annotations = await planAnnotations(get, repo, run, jobs)
  return {
    testedTree: testedTreeOf(annotations),
    testedScope: testedScopeOf(annotations),
    forced: forcedFullRunOf(annotations)
  }
}

/** Latest-attempt jobs of a run, and the tree its plan job recorded. Shared with the pre-merge check. */
export async function inspectRun(get, repo, run) {
  const body = await get(`repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  const jobs = body?.jobs
  if (!Array.isArray(jobs)) throw new Error(`run ${run.id}: no job list`)
  return { jobs, ...(await recordedBy(get, repo, run, jobs)) }
}

async function greenRuns(get, repo) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const runs = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await get(
      `repos/${repo}/actions/workflows/tracy-ci.yml/runs?status=success&exclude_pull_requests=true&created=%3E%3D${since}&per_page=100&page=${page}`
    )
    if (!Array.isArray(body?.workflow_runs)) throw new Error('run list is not a list')
    runs.push(...body.workflow_runs)
    if (body.workflow_runs.length < 100) break
  }
  return runs
}

function out(line) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
}
function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
}

async function main(argv) {
  const dry = argv.includes('--dry-run')
  const arg = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const repo = arg('--repo') ?? process.env.GITHUB_REPOSITORY
  const tree = arg('--tree') ?? execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim()
  if (!dry) {
    // Every run records what it tested, whatever the event: this line is what makes it a proof later.
    console.log(testedTreeNotice(tree))
    // What this run tests, from the planner: anything that is not exactly a known scope is recorded as
    // `unknown`, which no later run will accept as proof.
    const scope = SCOPE.test(process.env.TRACY_CI_TESTED_SCOPE ?? '')
      ? process.env.TRACY_CI_TESTED_SCOPE
      : 'unknown'
    console.log(testedScopeNotice(scope))
    out(`tree=${tree}`)
    if (process.env.EVENT !== 'pull_request') {
      console.log(`green-tree: ${process.env.EVENT} runs the full suite`)
      return
    }
  }
  let decision
  try {
    const runs = await greenRuns(api, repo)
    decision = await findProof({
      tree,
      repo,
      runs,
      currentRunId: Number(process.env.GITHUB_RUN_ID) || null,
      inspect: (run) => inspectRun(api, repo, run)
    })
  } catch (error) {
    decision = { skip: false, why: `could not look for a proof (${error.message}) — running the full suite` }
  }
  if (dry) {
    console.log(JSON.stringify(decision))
    return
  }
  if (!decision.skip) {
    console.log(`green-tree: full suite runs — ${decision.why}`)
    return
  }
  console.log(skipNotice(tree, decision.run.url))
  summary(
    `### ⏭ full suite skipped: tree \`${tree}\` already green in run ${decision.run.url}\n\n` +
      'That run is a completed, successful Tracy CI run of this repository with every `build check` row green, and it recorded this exact tree as the one it tested. Same tree, same bytes, same verdict (`scripts/ci/green-tree.mjs`).\n'
  )
  out(`green_run=${decision.run.url}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    // Never let the lookup break the plan: a missing output means the full suite runs.
    console.log(`::warning::green-tree: ${String(error?.message ?? error)} — running the full suite`)
  })
}
