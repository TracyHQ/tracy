/**
 * Plans the `build-check` matrix of `.github/workflows/tracy-ci.yml` (29/09/2026).
 *
 * WHY A SCRIPT AND NOT YAML. The matrix used to be nine rows and every row that could be skipped
 * still took a runner to run its own "should I skip" step. Deciding in one tiny `plan` job means a
 * skipped row never occupies a runner, and the decision is a function with a unit test
 * (`scripts/test/ci-plan.test.mjs`) instead of shell inside a workflow.
 *
 * Three rows always run: `checks` (lint + every gate but the tests), `tests 1/2`, `tests 2/2`
 * (+ the small suites). Four more run only when needed: the three EmDash suites and `e2e`.
 * A routine PR into `develop` replaces `tests 1/2` and `tests 2/2` by one `tests related` row (or
 * none), see `related-tests.mjs`; `checks` always runs.
 *
 * TEMPLATE-DATA LANE (12/10/2026). When every changed file of a PR into `develop` is template data
 * (`TEMPLATE_DATA` in `related-tests.mjs`: contracts, template profiles, quickstart pins, journal,
 * regression cases — never a code file), `checks` keeps its name but runs only the gates that read
 * that data (`--only …`), `tests related` runs only the tests that read it, and the e2e row runs only
 * when one of those readers is an e2e test. Any other file keeps every row below as it was; a lane
 * that cannot read the tree runs every row.
 *
 * 🔒 FAILS CLOSED, EXACTLY AS THE OLD PER-ROW STEP DID. A conditional row is skipped only when ALL
 * hold: the event is a pull request, its base is not `main`, the changed-file list was read and is
 * not empty, and no changed file matches the row's `paths`. Anything else (release PR into `main`,
 * manual run, nightly `schedule`, git error, empty list) runs EVERY row. A skip is announced as a
 * notice and in the job summary, never silently green.
 *
 * ⚠ `paths` = the only inputs a suite reads. A new file a suite reads outside these paths MUST be
 * added here, or a change to it goes untested until the release PR into `main` (or the nightly).
 *
 * 🔒 TWO OPT-IN SUITES ON A PULL REQUEST INTO `develop` (16/10/2026, anh David / SRE; rule and reasons in
 * `test-scope.mjs`). The `tests e2e` row exists only when the pull request carries the label `ci:e2e`,
 * and the workers test files that read `TEST_DATABASE_URL` are left out of its workers tests unless it
 * carries `ci:integration` (the rows get `TRACY_TESTS_SKIP_DB=1`, see `check-tests.ts`). The three
 * EmDash rows are browser rows too (18/10/2026): their `visual`, `audit` and `qa` test files open
 * Chromium and no list or flag separates them from the rest of each suite, so without `ci:e2e` the
 * rows are left out whole; with it they follow their own paths, exactly as before the rule. The labels
 * arrive in `labels` (read from the API at run time, never from the event); `null` — unreadable — opts
 * nothing out. Release pull requests, the nightly and manual runs are not touched by any of it. The
 * decision is `testScope`; this file applies it to the rows and says, in notices and in the job summary,
 * what it left out.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { prKind } from '../check-regression.mjs'
import {
  DATABASE_MARK,
  E2E_LABEL,
  INTEGRATION_LABEL,
  relatedTests,
  repoReader,
  splitDatabaseGated,
  workspaceDependencies
} from './related-tests.mjs'
import { parseLabels, testScope } from './test-scope.mjs'

/** Files whose change can alter what any test suite does. */
const SHARED = String.raw`scripts/check-tests\.ts$|scripts/check-all\.ts$|scripts/ci/plan-ci\.mjs$|scripts/test-timings\.json$|\.github/workflows/tracy-ci\.yml$|\.node-version$|package\.json$|pnpm-workspace\.yaml$`

/**
 * Inputs only the e2e suites read, outside their owner packages (30/09/2026). The dsh fork: two
 * e2e tests read its source (tracy-my-sites `table-fits-panel` reads the `ui-layout` columns width
 * rule, tracy-tab-link `strip-fill-reset` reads the AppFrame / dockkit strip). A pointer bump shows
 * in `git diff --name-only` as the bare path `vendor/tracy/deepseek-harness`, a file inside it as
 * `vendor/tracy/deepseek-harness/...`; both match. Not in SHARED, which also plans the EmDash rows.
 */
const E2E_EXTRA = String.raw`vendor/tracy/deepseek-harness(/|$)`

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * `vendor/emdash/` minus the skill tree: no EmDash suite reads `tracy-emdash-skill` (audited
 * 09/10/2026, see REVIEWED_SKILLS in related-tests.mjs). Every other tree there stays an input.
 */
const EMDASH_INPUTS = String.raw`vendor/emdash/(?!tracy-emdash-skill/)`

/** The three EmDash suites: each reads inside its own directory (checked 29/09/2026). */
const EMDASH = [
  {
    group: 'tests emdash-business',
    args: '--only tests --tests-part standalone:business',
    own: String.raw`packages/cms/tracy-emdash-theme-business/|packages/site/tracy-site-build-core/`
  },
  {
    group: 'tests emdash-saas',
    args: '--only tests --tests-part standalone:saas',
    own: String.raw`packages/cms/tracy-emdash-theme-saas/`
  },
  {
    group: 'tests emdash-base',
    args: '--only tests --tests-part standalone:base',
    own: String.raw`packages/cms/tracy-emdash-theme-base/`
  }
]

/** Whether a matrix group is one of the three EmDash suites. */
const isEmdashRow = (group) => EMDASH.some((r) => r.group === group)

/**
 * Package directories that own an e2e file, derived from the file paths (no hand-kept list):
 * `packages/site/tracy-add-site/test/e2e/x.test.mjs` -> `packages/site/tracy-add-site`.
 *
 * @param {readonly string[]} files - repo-relative paths, any kind.
 * @returns {string[]} sorted unique directories.
 */
export function e2eOwners(files) {
  const dirs = new Set()
  for (const f of files) {
    const m = /^((?:apps\/[^/]+|packages\/[^/]+\/[^/]+))\/test\/e2e\/[^/]+\.test\.mjs$/.exec(f)
    if (m) dirs.add(m[1])
  }
  return [...dirs].sort()
}

/**
 * @param {readonly string[]} e2eFiles - every tracked file (or just the e2e ones).
 * @returns {string} regex for the e2e row's inputs; matches nothing useful when no e2e file exists,
 *   in which case the shared inputs still match, so a broken suite discovery cannot skip silently.
 */
export function e2ePaths(e2eFiles) {
  const owners = e2eOwners(e2eFiles).map((d) => `${escapeRe(d)}/`)
  return `^(${[...owners, E2E_EXTRA, SHARED].join('|')})`
}

/**
 * @param {object} input
 * @param {string} input.event - `github.event_name`.
 * @param {string} [input.baseRef] - `github.base_ref` (empty outside pull requests).
 * @param {readonly string[]|null} input.changed - changed files, or `null` when git could not say.
 * @param {readonly string[]} input.allFiles - tracked files, to derive the e2e owners.
 * @param {(file: string) => string} [input.readText] - reads a tracked file; without it there is no
 *   template-data lane (the planner's own run passes one).
 * @returns {{matrix: {include: object[]}, skipped: {group: string, paths: string}[], runsAll: boolean, why: string}}
 */
/**
 * The Turbo rows of a pull request into `develop` (12/10/2026): each row runs a fixed set of Turbo
 * test tasks, and a row whose tasks the remote cache already holds is not started at all.
 *
 * `dry` is `turbo run … --dry=json` from the plan job: every test task with its cache status. Every
 * task must land in exactly one row, or the whole answer is refused (`null`) and the planner falls
 * back to the rows it ran before Turbo — a task no row runs would be a test that silently stops.
 *
 * FORCED (17/10/2026): a release pull request, the nightly and a manual run take the same rows with
 * `force` — every row runs whatever the cache holds, and each row's Turbo run gets `--force`, so no
 * task is served from the cache: those runs stay the net for an input `inputs` misses. They still
 * run each task once under the read tracer (`turbo-setup.mjs --check --task-part`), which is what
 * lets `checks` skip running every suite a second time to audit the same inputs.
 *
 * @param {unknown} dry
 * @param {{ force?: boolean }} [options]
 * @returns {{ rows: object[], cached: string[] } | null}
 */
export function turboRows(dry, { force = false } = {}) {
  const tasks = /** @type {any} */ (dry)?.tasks
  if (!Array.isArray(tasks) || tasks.length === 0) return null
  const rows = [
    ...[1, 2, 3].map((n) => ({
      group: `tests web ${String(n)}/3`,
      match: (t) => t.package === '@tracy/web' && t.task === `test:ci:${String(n)}`
    })),
    {
      group: 'tests packages',
      match: (t) => t.package !== '//' && t.package !== '@tracy/web' && t.task === 'test:ci'
    },
    { group: 'tests scripts', match: (t) => t.package === '//' && /^test:ci:[a-z0-9-]+$/.test(t.task) }
  ]
  const byRow = rows.map(() => /** @type {any[]} */ ([]))
  // Turbo lists the task for every workspace package, the ~1500 that have no such script included,
  // with the command `<NONEXISTENT>`: those run nothing and are never cached, so they decide nothing.
  for (const t of tasks.filter((x) => x?.command !== '<NONEXISTENT>')) {
    if (typeof t?.package !== 'string' || typeof t?.task !== 'string') return null
    const at = rows.findIndex((r) => r.match(t))
    if (at === -1) return null
    byRow[at].push(t)
  }
  const out = []
  const cached = []
  rows.forEach((r, i) => {
    const mine = byRow[i]
    if (mine.length === 0) return
    if (!force && mine.every((t) => t.cache?.status === 'HIT')) {
      cached.push(r.group)
      return
    }
    const names = [...new Set(mine.map((t) => t.task))].sort()
    const filter = r.group.startsWith('tests web') ? ' --filter=@tracy/web' : ''
    out.push({
      group: r.group,
      label: 'tracy-check',
      args: '',
      turbo: `${names.join(' ')}${filter}`,
      ...(force ? { force: true } : {})
    })
  })
  return { rows: out, cached }
}

/** The title of the notice `plan` prints when a full run's tests are forced Turbo rows. */
export const FULL_RUN_TITLE = 'full run'

/**
 * A dry run naming one task per Turbo row: what `fullRowSets` hands the planner to learn the row
 * names of a forced full run without a checkout. Rows come from `turboRows`, never a second list.
 */
const ONE_TASK_PER_ROW = {
  tasks: [
    ...[1, 2, 3].map((n) => ({ package: '@tracy/web', task: `test:ci:${String(n)}`, command: 'x' })),
    { package: '@tracy/core', task: 'test:ci', command: 'x' },
    { package: '//', task: 'test:ci:scripts', command: 'x' }
  ]
}

/**
 * The `build check` row names a full run may have (17/10/2026): `legacy`, the two workers shards
 * (`plan` could not ask Turbo, or a run from before forced rows), and `turbo`, the forced Turbo
 * rows. Both carry `checks` and every conditional row. `green-tree.mjs` and `check-pr-merge.mjs`
 * judge a full run by these; a `turbo` set counts only with `plan`'s `full run` notice, because a
 * pull request into develop has rows of the same names whose tasks the cache may have served.
 * @returns {{ legacy: string[], turbo: string[] }}
 */
export function fullRowSets() {
  const groups = (turboDry) =>
    planMatrix({ event: 'workflow_dispatch', changed: null, allFiles: [], turboDry }).matrix.include.map(
      (row) => row.group
    )
  return { legacy: groups(null), turbo: groups(ONE_TASK_PER_ROW) }
}

export function planMatrix({
  event,
  baseRef = '',
  changed,
  allFiles,
  dependencies = {},
  readText,
  turboDry = null,
  labels = null
}) {
  const conditional = [
    ...EMDASH.map((r) => ({
      group: r.group,
      label: 'tracy-check',
      args: r.args,
      paths: `^(${r.own}|${EMDASH_INPUTS}|${SHARED})`
    })),
    {
      group: 'tests e2e',
      label: 'tracy-check',
      args: '--only tests --tests-part e2e',
      paths: e2ePaths(allFiles)
    }
  ]
  const fullRows = [
    { group: 'tests 1/2', label: 'tracy-check', args: '--only tests --tests-part workers:1/2' },
    { group: 'tests 2/2', label: 'tracy-check', args: '--only tests --tests-part workers:2/2,rest' }
  ]
  let checks = { group: 'checks', label: 'tracy-check', args: '--skip tests' }

  let runsAll = true
  let why = ''
  if (event !== 'pull_request') why = `${event} runs every row`
  else if (baseRef === 'main' || baseRef === 'staging')
    why = `release pull request into ${baseRef} runs every row`
  else if (changed === null) why = 'could not list the changed files — running every row'
  else if (changed.length === 0) why = 'empty changed-file list — running every row'
  else runsAll = false

  // 🔒 THE OPT-IN RULE (see the header): decided from the labels, the diff and the tree, never from
  // the event. `labels` stays null in every caller that does not know them, which opts nothing out.
  const scope = testScope({ event, baseRef, labels, changed, allFiles, readText })
  const related = !runsAll ? relatedTests({ changed, allFiles, dependencies, readText }) : null
  // 🔒 TURBO DECIDES THE WORKERS TESTS OF A PULL REQUEST INTO DEVELOP when the plan job could ask it.
  // An uncertain related-test scope then no longer means "run everything": Turbo hashes what each
  // suite was measured to read, the lockfile included, so it does not need the planner's guess.
  const turbo = event === 'pull_request' && baseRef === 'develop' && !runsAll ? turboRows(turboDry) : null
  if (related?.full && !turbo) {
    runsAll = true
    why = `related-test scope is uncertain (${related.why}) — running every row`
  } else if (turbo) {
    why = `Turbo: ${String(turbo.rows.length)} test row(s) to run, ${String(turbo.cached.length)} served from the cache`
  }
  // A FULL RUN'S TESTS ARE FORCED TURBO ROWS when `plan` could ask Turbo (17/10/2026): every task
  // runs, none is read from the cache, and each audits its own inputs as it runs — so `checks` does
  // not run every suite a second time under the tracer (~19 min of a release's `checks` measured
  // 16/10/2026, run 38930622899). Without a dry run: the two workers shards, as before.
  const fullTurbo = !turbo && (!related || related.full) ? turboRows(turboDry, { force: true }) : null
  if (fullTurbo) why = `${why} — every Turbo task forced, none served from the cache`
  if (turbo || fullTurbo) checks = { ...checks, taskAudits: true }
  const lane = related && !related.full && related.lane === 'template-data'
  if (lane) {
    // Same row name, so the merge checks that require `build check (checks)` still find it.
    checks = { ...checks, args: related.gates.map((gate) => `--only ${gate}`).join(' ') }
    why = `template-data lane: ${related.why}`
  }
  const affectedE2e =
    related &&
    !related.full &&
    (lane ? related.e2e : e2eOwners(allFiles).some((owner) => related.owners?.includes(owner)))
  const include = []
  const skipped = []
  /** Rows the opt-in rule leaves out, with whether the paths alone would have run them. */
  const leftOut = []
  for (const row of conditional) {
    const { paths, ...rest } = row
    // A unit-test-only edit in an e2e owner's package does not change the browser suite's inputs.
    const affects =
      (row.group === 'tests e2e' && affectedE2e) ||
      changed?.some(
        (f) =>
          !lane &&
          new RegExp(paths).test(f) &&
          !related?.covered?.includes(f) &&
          !(row.group === 'tests e2e' && /\/(?:test)\/[^/]+\.test\.mjs$/.test(f))
      )
    if (row.group === 'tests e2e' && scope.e2eLeftOut) {
      leftOut.push({ group: row.group, label: E2E_LABEL, wouldRun: runsAll || Boolean(affects) })
      continue
    }
    // The three EmDash suites are browser rows too: their visual/audit/qa tests open Chromium and
    // nothing separates them from the suite's other files. Without `ci:e2e` a row the paths would have
    // run does not exist; a row the paths would not run stays an ordinary path skip.
    if (isEmdashRow(row.group) && scope.e2eLeftOut && (runsAll || affects)) {
      leftOut.push({ group: row.group, label: E2E_LABEL, wouldRun: true })
      continue
    }
    // The label means "run it": no path filter second-guesses a person who asked for the e2e row. The
    // EmDash rows keep their own paths even with the label (three suites of 5-10 minutes each are not
    // worth running for a change that no theme reads).
    if (row.group === 'tests e2e' && scope.e2eForced) include.push(rest)
    else if (!runsAll && !affects) skipped.push({ group: row.group, paths })
    else include.push(rest)
  }
  // With the skip on, the related selection loses the files it would not run; a selection that is
  // empty then is a row that does not exist, as for a documentation-only change.
  const relatedRun =
    related && !related.full && scope.skipDb && typeof readText === 'function'
      ? splitDatabaseGated(related.workers, true, readText).run
      : (related?.workers ?? [])
  const tests = turbo
    ? turbo.rows
    : !related || related.full
      ? (fullTurbo?.rows ?? fullRows)
      : relatedRun.length > 0 || related.interop
        ? [{ group: 'tests related', label: 'tracy-check', args: '--only tests --tests-part related' }]
        : []
  // The tests with the clock moved forward run on exactly one row: the last full shard, the related
  // row, or — when Turbo plans the tests and may start none — `checks`, which always runs.
  const clockRow =
    turbo || fullTurbo ? 'checks' : tests.some((r) => r.group === 'tests 2/2') ? 'tests 2/2' : 'tests related'
  const rows = [...include, ...tests, checks].map((r) => (r.group === clockRow ? { ...r, clock: true } : r))
  // A docs-only PR has no test job. The full nightly and release rows are unchanged.
  return {
    matrix: { include: rows },
    skipped,
    runsAll,
    why,
    related,
    turbo,
    fullTurbo: Boolean(fullTurbo),
    scope,
    leftOut,
    relatedRun
  }
}

/**
 * Whether this run gets the `new-test-proof` job (12/10/2026): only a pull request whose kind is
 * `fix`, by the same `prKind` the Regression gate uses (title `fix(...)`, or branch `fix/…`). Every
 * other kind and every other event gets no such job, so the proof costs them nothing. The job is
 * report-only and is not a `build-check` row: nothing in the matrix above changes with it.
 *
 * @param {object} input
 * @param {string} input.event - `github.event_name`.
 * @param {string} [input.title] - the pull request's title.
 * @param {string} [input.branch] - `github.head_ref`.
 * @returns {boolean}
 */
export function planProof({ event, title = '', branch = '' }) {
  return event === 'pull_request' && prKind(title, branch) === 'fix'
}

function sh(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** The changed files of a pull request (null when git cannot say) and every tracked file. */
function gitInputs(event) {
  let changed = null
  if (event === 'pull_request') {
    try {
      changed = sh(['diff', '--name-only', '-z', '--no-renames', 'HEAD^1', 'HEAD'])
        .split('\0')
        .filter(Boolean)
    } catch {
      changed = null
    }
  }
  const allFiles = sh(['ls-files', '-z']).split('\0').filter(Boolean)
  return { changed, allFiles }
}

function writeOutput(lines) {
  const text = `${lines.join('\n')}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text)
  else process.stdout.write(text)
}

/**
 * `--scope`: only the opt-in decision, as step outputs, BEFORE Turbo is asked for its hashes. The
 * hash of a database-holding test task includes `TRACY_TESTS_SKIP_DB`, so the dry run must know whether
 * the rows will skip; the labels are read once (step `labels`) and both this step and the planner read
 * that one answer, which is why the planner can check it agrees (see `main`).
 */
function scopeMain() {
  const event = process.env.EVENT ?? ''
  const baseRef = process.env.BASE_REF ?? ''
  const { changed, allFiles } = gitInputs(event)
  const scope = testScope({
    event,
    baseRef,
    labels: parseLabels(process.env.PR_LABELS),
    changed,
    allFiles,
    readText: repoReader()
  })
  console.log(`plan: opt-in scope — skip database tests: ${String(scope.skipDb)}, record: ${scope.record}`)
  writeOutput([`skip_db=${String(scope.skipDb)}`, `scope_record=${scope.record}`])
}

/**
 * How many database test files the workers rows of this plan leave out, or null when none is in play.
 * A plan with no workers row (a documentation-only change) selects no test at all, so it skips none; a
 * `tests related` row skips exactly the files its selection loses; the rows that take whole owners or
 * shards (Turbo, the full set) can lose any of the tree's, so that count is an upper bound.
 *
 * @returns {{ count: number, upTo: boolean } | null}
 */
export function databaseTestsLeftOut(plan) {
  if (!plan.scope.skipDb) return null
  // Not the browser row and not an EmDash suite: those read no workers file.
  const workersRows = plan.matrix.include.filter((r) => /^tests (?!e2e$|emdash-)/.test(r.group))
  if (workersRows.length === 0) return null
  if (plan.turbo || !plan.related || plan.related.full) return { count: plan.scope.dbFiles ?? 0, upTo: true }
  const lost = plan.related.workers.length - plan.relatedRun.length
  return lost > 0 ? { count: lost, upTo: false } : null
}

/**
 * What the opt-in rule left out, as lines for the log (`notices`, `warnings`) and the job summary.
 * Nothing is announced as skipped when nothing was selected to run: a documentation-only change has no
 * browser row and no workers row to skip, and a "SKIPPED" line there would be noise that trains people
 * to stop reading the real ones.
 */
export function scopeNotes(plan) {
  const { scope, leftOut } = plan
  const notes = {
    notices: /** @type {string[]} */ ([]),
    warnings: /** @type {string[]} */ ([]),
    summary: /** @type {string[]} */ ([])
  }
  if (scope.applies && !scope.labelsKnown) {
    notes.warnings.push(`plan: ${scope.why[0]}`)
    return notes
  }
  // The decision is told when it touches something this plan runs or would have run; for a change that
  // selects no test (documentation) there is nothing to explain.
  const touches =
    plan.matrix.include.some((r) => /^tests (?!emdash-)/.test(r.group)) || leftOut.some((r) => r.wouldRun)
  if (touches) for (const line of scope.why) notes.notices.push(`plan: ${line}`)
  for (const row of leftOut) {
    // The paths would not have run this row either: nothing was left out.
    if (!row.wouldRun) continue
    notes.notices.push(
      `SKIPPED ${row.group}: opt-in on a pull request into develop — add the label ${row.label} to run it (this pull request touches its inputs)`
    )
    notes.summary.push(
      `### ⏭ ${row.group} not run (opt-in)\n\nA pull request into \`develop\` runs the browser suites (the e2e row and the three EmDash rows) only when it carries the label \`${row.label}\` — **this one changes files that suite reads**. Adding the label re-runs Tracy CI by itself. ` +
        'Release pull requests into `staging` and `main`, the nightly and manual runs always run it.\n'
    )
  }
  const db = databaseTestsLeftOut(plan)
  if (db) {
    const files = `${db.upTo ? 'up to ' : ''}${String(db.count)} workers test file(s) that read ${DATABASE_MARK}`
    notes.notices.push(
      `SKIPPED database tests: ${files} are left out of the workers tests of this pull request — add the label ${INTEGRATION_LABEL} to run them`
    )
    notes.summary.push(
      `### ⏭ Database tests not run (opt-in)\n\n${files} are left out of the workers tests of this pull request; the unit tests beside them run. ` +
        `Add the label \`${INTEGRATION_LABEL}\` to run them — Tracy CI re-runs by itself — or add it while the pull request is still a draft. ` +
        'Release pull requests into `staging` and `main`, the nightly and manual runs always run them. Each row that leaves files out lists them in its own log.\n'
    )
  }
  return notes
}

/** Print what `scopeNotes` says, and add its summary blocks to `summary`. */
function announceScope(plan, summary) {
  const notes = scopeNotes(plan)
  for (const line of notes.warnings) console.log(`::warning::${line}`)
  for (const line of notes.notices) console.log(`::notice::${line}`)
  summary.push(...notes.summary)
}

function main() {
  const event = process.env.EVENT ?? ''
  const baseRef = process.env.BASE_REF ?? ''
  const { changed, allFiles } = gitInputs(event)
  const dependencies = workspaceDependencies(process.cwd(), allFiles)
  let turboDry = null
  if (process.env.TURBO_DRY) {
    try {
      turboDry = JSON.parse(readFileSync(process.env.TURBO_DRY, 'utf8'))
    } catch {
      console.log('::warning::plan: the Turbo dry run could not be read — planning the rows as before Turbo')
    }
  }
  const plan = planMatrix({
    event,
    baseRef,
    changed,
    allFiles,
    dependencies,
    readText: repoReader(),
    turboDry,
    labels: parseLabels(process.env.PR_LABELS)
  })
  // 🔒 THE DRY RUN AND THE ROWS MUST AGREE ON THE SKIP. Turbo hashed the tests under the decision the
  // `--scope` step made; if this plan decides otherwise, the cache answer it holds describes a run
  // nobody will start — a green HIT for tests that would run now, or a miss for ones that would not.
  // The step publishes `skip_db` only on a pull request into develop; elsewhere it is empty.
  const decided = process.env.SCOPE_SKIP_DB
  if (decided !== undefined && decided !== '' && decided !== String(plan.scope.skipDb)) {
    console.log(
      `::error::plan: the scope step decided skip_db=${decided} but the plan decides ${String(plan.scope.skipDb)} — the Turbo hashes were asked under another scope`
    )
    process.exit(1)
  }
  for (const group of plan.turbo?.cached ?? []) {
    console.log(
      `::notice::CACHED ${group}: every Turbo task of this row is already green in the remote cache`
    )
  }
  if (plan.why) console.log(`::notice::plan: ${plan.why}`)
  // The mark `green-tree.mjs` and `check-pr-merge.mjs` read: these rows ran every task, none from the cache.
  if (plan.fullTurbo) console.log(`::notice title=${FULL_RUN_TITLE}::turbo`)
  if (plan.related && !plan.related.full) {
    console.log(
      `::notice::related tests: ${String(plan.related.workers.length)} workers files` +
        (plan.relatedRun.length === plan.related.workers.length
          ? ''
          : ` (${String(plan.relatedRun.length)} after leaving out the database tests)`) +
        `, interop=${String(plan.related.interop)}`
    )
    // Declared readers of the changed skill that no CI row runs: the author runs them by hand.
    if (plan.related.outsideCi?.length)
      console.log(
        `::notice::skill readers no CI row runs (regression runner by hand, or at image build): ${plan.related.outsideCi.join(', ')}`
      )
  }
  if (changed === null && event === 'pull_request') {
    console.log("::warning::could not list this pull request's changed files — running every row")
  }
  const summary = []
  if (plan.related?.lane === 'template-data') {
    summary.push(
      `### Template-data lane\n\nEvery changed file is template data, so \`checks\` runs only ${plan.related.gates.map((g) => `\`${g}\``).join(', ')} and \`tests related\` only the ${String(plan.related.workers.length)} workers file(s) that read it (interop=${String(plan.related.interop)}, e2e=${String(plan.related.e2e)}). Release pull requests and the nightly run every row.\n`
    )
  }
  for (const s of plan.skipped) {
    console.log(`::notice::SKIPPED ${s.group}: this pull request changes nothing matching ${s.paths}`)
    summary.push(
      `### ⏭ ${s.group} skipped\n\nNo changed file matches \`${s.paths}\`. The release PRs into \`staging\` and \`main\` and the nightly run it.\n`
    )
  }
  announceScope(plan, summary)
  if (summary.length > 0 && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`)
  }
  const proof = planProof({ event, title: process.env.PR_TITLE, branch: process.env.HEAD_REF })
  if (proof)
    console.log('::notice::new-test proof: this pull request is a fix, the report-only proof job runs')
  // `tested_scope` is what this run tests, in one word: `green-tree.mjs` records it, and only a `full`
  // run can ever be the proof that lets a later run skip the suite.
  writeOutput([
    `matrix=${JSON.stringify(plan.matrix)}`,
    `new_test_proof=${String(proof)}`,
    `skip_db=${String(plan.scope.skipDb)}`,
    `tested_scope=${plan.scope.record}`
  ])
}

/**
 * What follows the script name: nothing (plan the rows), exactly `--check-test-balance` or exactly
 * `--scope` (only the opt-in decision, before Turbo is asked). Anything else is refused, so a
 * misspelt flag cannot quietly plan the rows instead.
 *
 * @param {readonly string[]} argv
 * @returns {{ mode: 'plan'|'balance'|'scope' } | { error: string }}
 */
export function parsePlanArgs(argv) {
  if (argv.length === 0) return { mode: 'plan' }
  if (argv.length === 1 && argv[0] === '--check-test-balance') return { mode: 'balance' }
  if (argv.length === 1 && argv[0] === '--scope') return { mode: 'scope' }
  return {
    error: `unknown or repeated argument(s): ${argv.join(' ')} (the flags are --check-test-balance and --scope)`
  }
}

/**
 * `--check-test-balance`: with the committed timing table, are the two `tests` jobs predicted
 * within 30 s of each other, and is every workers file in the table?
 *
 * It asks the gate itself (`workersFiles`, `shardOf` of `scripts/check-tests.ts`) and the table's
 * own rules (`scripts/update-test-timings.mjs`), imported HERE and not at the top: planning the
 * rows runs before `pnpm install`, on bare node, and must keep doing so. This mode needs the
 * installed workspace: `node --import tsx scripts/ci/plan-ci.mjs --check-test-balance`.
 *
 * Exit 0 only for a complete, CI-derived, balanced table. A table that is not CI-derived, misses a
 * file or names a deleted one is exit 1: an unmeasured split is not a balanced one.
 */
async function checkTestBalance() {
  const { workersFiles, shardOf } = await import('../check-tests.ts')
  const { plannedShardCount, predictBalance, readTable } = await import('../update-test-timings.mjs')
  const read = readTable()
  if ('error' in read) {
    console.error(`plan-ci: ${read.error}`)
    return 1
  }
  const shardCount = plannedShardCount(planMatrix)
  const files = workersFiles({ strict: true })
  const verdict = predictBalance({ files, table: read.table, shardOf, shardCount })
  verdict.seconds.forEach((seconds, i) => {
    const last = i === shardCount - 1
    console.log(
      `plan-ci: tests ${String(i + 1)}/${String(shardCount)} predicted ${String(seconds)} s` +
        (last ? ` (workers share + ${String(read.table.restWallSeconds)} s of rest)` : '')
    )
  })
  if (!verdict.ok) {
    for (const problem of verdict.problems) console.error(`plan-ci: NOT BALANCED — ${problem}`)
    return 1
  }
  console.log(
    `plan-ci: ${String(files.length)} workers files, all in the table; the tests jobs are predicted ${String(verdict.spread)} s apart.`
  )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parsePlanArgs(process.argv.slice(2))
  if ('error' in args) {
    console.error(`plan-ci: ${args.error}`)
    process.exit(2)
  }
  // No top-level await: tsx loads this file as CommonJS when a `.ts` test imports it.
  if (args.mode === 'balance') {
    checkTestBalance().then(
      (code) => process.exit(code),
      (error) => {
        console.error(`plan-ci: ${String(error?.stack ?? error)}`)
        process.exit(1)
      }
    )
  } else if (args.mode === 'scope') scopeMain()
  else main()
}
