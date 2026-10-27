/**
 * Are the hashes the plan job asked the cache about the hashes the rows compute? (12/10/2026)
 *
 * WHY. From 12/10/2026 `plan` skips a test row when the remote cache holds every Turbo task of it.
 * That is only true if `plan` computes the SAME hash a row computes for the same commit. It did not:
 * `plan` hashed a checkout without the dsh submodule (so without the workspace packages the root
 * package.json depends on) and without build output, and all 47 hashes differed from the rows' — 12
 * runs in a row logged "0 of 47 test tasks are in the remote cache" while the rows themselves were
 * served from it. Nothing compared the two sides, so nothing went red. This file is that comparison.
 *
 * MODES (all on bare node, no install needed).
 *   --plan <marked dry run> --out <file>
 *       In `plan`, after `turbo-cached.mjs`. Refuses a dry run that cannot be trusted (a task of the
 *       inventory missing or without a hash, no internal-dependency hash, the submodule not at the
 *       commit the tree pins) and otherwise writes the MANIFEST: commit, Turbo version, and per
 *       task its hash and whether the cache held it. A refusal exits 1, and the workflow then plans
 *       the rows as before Turbo.
 *   --compare [--dry <file>]
 *       In the `checks` row, after the bootstrap. Runs the same dry run there (or reads one) and
 *       compares EVERY task with the manifest, the tasks of rows `plan` did not start included: a
 *       skipped row whose hash was wrong is a test that silently did not run.
 *   --row --group <row name> --tasks <the row's Turbo words> [--summary <file or directory>]
 *       In a Turbo row, after `turbo run --summarize`. The row's record is evidence only when it is
 *       whole: exactly the tasks the row was scheduled (derived from the manifest and the words),
 *       each once, each with the plan's hash and with HIT or MISS from Turbo. Prints, per task, what
 *       the cache did against what `plan` predicted.
 *   --github [--pr <number>] [--artifacts <dir>]
 *       On a laptop, with `gh`. Takes the pull request of this branch, refuses unless this checkout
 *       is at the revision GitHub holds for it, reads the Tracy CI run of that revision and judges
 *       the records above from its job logs: plan's manifest, the checks row's comparison of every
 *       task, one whole record per Turbo row that ran, no task plan saw missing left unrun, and the
 *       commit plan hashed being the merge of this revision. Anything missing: exit 1, by name.
 * The manifest comes from `--manifest <file>` or the environment variable TRACY_TURBO_MANIFEST (the
 * `plan` job's output). An empty manifest means `plan` fell back to the rows before Turbo: `--compare`
 * and `--row` then say so and exit 0 — there is no prediction to check.
 *
 * VERDICTS. A different hash, a task one side lacks, or a different commit is RED. A different cache
 * answer is NOT: between `plan` and a row another run may store a task (predicted MISS, found HIT) or
 * the entry may be unreachable (predicted HIT, found MISS, and the task simply runs). Both are
 * printed with that explanation, never counted as a hash failure.
 *
 * Every mode prints one machine-readable line (`TRACY_TURBO_PLAN|CHECK|ROW <json>`); `--github`
 * reads exactly those lines back.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDry } from './turbo-cached.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DSH = 'vendor/tracy/deepseek-harness'
const HASH = /^[0-9a-f]{8,64}$/
const MARK = { plan: 'TRACY_TURBO_PLAN', check: 'TRACY_TURBO_CHECK', row: 'TRACY_TURBO_ROW' }

const real = (tasks) => (Array.isArray(tasks) ? tasks.filter((t) => t?.command !== '<NONEXISTENT>') : [])

/**
 * The Turbo test tasks the tree declares: every `test:ci…` script of the root package.json and of
 * each package.json handed in. The count is the tree's, never a number written down.
 * @param {{ dir: string, pkg: { name?: string, scripts?: Record<string, string> } }[]} packages -
 *   `dir` is `''` for the root.
 * @returns {string[]} task ids (`//#test:ci:scripts`, `@tracy/web#test:ci:1`), sorted.
 */
export function inventory(packages) {
  const ids = []
  for (const { dir, pkg } of packages) {
    for (const script of Object.keys(pkg?.scripts ?? {})) {
      if (!/^test:ci(?::[a-z0-9-]+)?$/.test(script)) continue
      ids.push(`${dir === '' ? '//' : String(pkg.name)}#${script}`)
    }
  }
  return ids.sort()
}

/**
 * The manifest of a marked dry run, or the reason it cannot be trusted.
 * @param {object} input
 * @param {any} input.dry - `turbo run … --dry=json`, each real task marked HIT or MISS.
 * @param {readonly string[]} input.expected - `inventory()` of the tree.
 * @param {string} input.commit - the commit `plan` checked out.
 * @param {string} input.dshPinned - the submodule commit the tree pins.
 * @param {string} input.dshCheckedOut - the commit the submodule directory is at ('' when absent).
 * @returns {{ manifest: object } | { error: string }}
 */
export function buildManifest({ dry, expected, commit, dshPinned, dshCheckedOut }) {
  if (!/^[0-9a-f]{40}$/.test(commit)) return { error: 'no commit id for this checkout' }
  if (!/^[0-9a-f]{40}$/.test(dshPinned)) return { error: 'the tree pins no dsh submodule commit' }
  if (dshCheckedOut !== dshPinned)
    return {
      error: `the dsh submodule is at ${dshCheckedOut || '(not checked out)'}, the tree pins ${dshPinned}: its workspace packages are part of every task hash`
    }
  // The mark of a tree without the workspace packages the root depends on: every hash would differ.
  if (!dry?.globalCacheInputs?.hashOfInternalDependencies)
    return { error: 'the dry run has no hash of the internal dependencies (workspace packages missing)' }
  const tasks = {}
  for (const t of real(dry?.tasks)) {
    if (typeof t?.taskId !== 'string' || !HASH.test(String(t?.hash)))
      return { error: `task ${String(t?.taskId)} has no usable hash` }
    if (t.cache?.status !== 'HIT' && t.cache?.status !== 'MISS')
      return { error: `task ${t.taskId} was not asked for in the cache` }
    if (tasks[t.taskId]) return { error: `task ${t.taskId} is listed twice` }
    tasks[t.taskId] = [t.hash, t.cache.status]
  }
  const have = Object.keys(tasks).sort()
  const missing = expected.filter((id) => !tasks[id])
  if (missing.length)
    return { error: `the dry run lacks ${String(missing.length)} task(s): ${missing.join(' ')}` }
  const extra = have.filter((id) => !expected.includes(id))
  if (extra.length) return { error: `the dry run has task(s) the tree does not declare: ${extra.join(' ')}` }
  if (have.length === 0) return { error: 'the tree declares no Turbo test task' }
  return { manifest: { v: 1, commit, dsh: dshPinned, turbo: String(dry.turboVersion ?? ''), tasks } }
}

/**
 * A manifest from its text, or why it is unusable. `''` is not an error: `plan` published none.
 * @param {string} text
 * @returns {{ manifest: any } | { none: true } | { error: string }}
 */
export function readManifest(text) {
  if (text.trim() === '') return { none: true }
  let m
  try {
    m = JSON.parse(text)
  } catch {
    return { error: 'the manifest is not JSON' }
  }
  const ok =
    m?.v === 1 &&
    /^[0-9a-f]{40}$/.test(String(m.commit)) &&
    m.tasks !== null &&
    typeof m.tasks === 'object' &&
    Object.keys(m.tasks).length > 0 &&
    Object.values(m.tasks).every(
      (t) => Array.isArray(t) && HASH.test(String(t[0])) && (t[1] === 'HIT' || t[1] === 'MISS')
    )
  return ok ? { manifest: m } : { error: 'the manifest is not one this script wrote' }
}

/**
 * Compares tasks computed here with the manifest.
 * @param {object} input
 * @param {any} input.manifest
 * @param {{ taskId: string, hash: string, cache?: string | null }[]} input.tasks - computed here;
 *   `cache` is what the cache really did (a row), or null when nothing was asked (`--compare`).
 * @param {string} input.commit - the commit checked out here.
 * @param {boolean} input.all - whether every task of the manifest must be here (`--compare`).
 * @param {readonly string[] | null} [input.expected] - the exact tasks this row was scheduled to run
 *   (`rowTasks`): one missing, or one more, is a failure.
 * @param {boolean} [input.needCache] - whether every task must carry HIT or MISS (a row).
 * @param {string | null} [input.group] - the row's name, kept in the record.
 * @returns {{ ok: boolean, commit: string, compared: number, equal: number, different: object[],
 *   missing: string[], unknown: string[], cache: { predictedHit: number, actualHit: number,
 *   storedSincePlan: string[], lostSincePlan: string[] } }}
 */
export function compare({ manifest, tasks, commit, all, expected = null, needCache = false, group = null }) {
  const different = []
  const noStatus = []
  const duplicate = []
  const unknown = []
  const stored = []
  const lost = []
  let equal = 0
  let predictedHit = 0
  let actualHit = 0
  const seen = new Set()
  for (const t of tasks) {
    if (seen.has(t.taskId)) {
      duplicate.push(t.taskId)
      continue
    }
    seen.add(t.taskId)
    // A row's record is evidence of what the cache did: a task without HIT or MISS is no evidence.
    if (needCache && t.cache !== 'HIT' && t.cache !== 'MISS') noStatus.push(t.taskId)
    const planned = manifest.tasks[t.taskId]
    if (!planned) {
      unknown.push(t.taskId)
      continue
    }
    if (planned[0] !== t.hash) {
      different.push({ task: t.taskId, plan: planned[0], here: t.hash })
      continue
    }
    equal += 1
    if (t.cache === 'HIT' || t.cache === 'MISS') {
      if (planned[1] === 'HIT') predictedHit += 1
      if (t.cache === 'HIT') actualHit += 1
      if (planned[1] === 'MISS' && t.cache === 'HIT') stored.push(t.taskId)
      if (planned[1] === 'HIT' && t.cache === 'MISS') lost.push(t.taskId)
    }
  }
  // The tasks that must be here: all of the manifest's (`--compare`), or the row's own (`--row`).
  const must = expected ?? (all ? Object.keys(manifest.tasks) : [])
  const missing = must.filter((id) => !seen.has(id))
  const extra = expected ? [...seen].filter((id) => manifest.tasks[id] && !expected.includes(id)) : []
  const sameCommit = commit === manifest.commit
  return {
    ok:
      sameCommit &&
      different.length === 0 &&
      missing.length === 0 &&
      unknown.length === 0 &&
      extra.length === 0 &&
      noStatus.length === 0 &&
      duplicate.length === 0 &&
      equal > 0,
    ...(group === null ? {} : { group }),
    ...(expected === null ? {} : { expected: [...expected].sort() }),
    commit: sameCommit ? commit : `${commit} (plan: ${String(manifest.commit)})`,
    compared: tasks.length,
    equal,
    different,
    missing: missing.sort(),
    unknown: [...unknown, ...extra].sort(),
    noStatus: noStatus.sort(),
    duplicate: duplicate.sort(),
    cache: { predictedHit, actualHit, storedSincePlan: stored.sort(), lostSincePlan: lost.sort() }
  }
}

/**
 * The tasks a Turbo row was scheduled to run, from the manifest and the row's `matrix.turbo`
 * (`test:ci:1 --filter=@tracy/web`, `test:ci`, `test:ci:interop test:ci:scripts`): what `turbo run`
 * with those words selects among the manifest's tasks.
 * @param {any} manifest
 * @param {string} spec
 * @returns {string[] | { error: string }} sorted task ids.
 */
export function rowTasks(manifest, spec) {
  const words = spec.trim().split(/\s+/).filter(Boolean)
  const filters = words.filter((w) => w.startsWith('--filter=')).map((w) => w.slice('--filter='.length))
  const names = words.filter((w) => !w.startsWith('--'))
  if (names.length === 0 || words.some((w) => w.startsWith('--') && !w.startsWith('--filter=')))
    return { error: `the row's task words are not understood: ${JSON.stringify(spec)}` }
  const ids = Object.keys(manifest.tasks).filter((id) => {
    const at = id.indexOf('#')
    return names.includes(id.slice(at + 1)) && (filters.length === 0 || filters.includes(id.slice(0, at)))
  })
  return ids.length
    ? ids.sort()
    : { error: `no task of the manifest belongs to the row ${JSON.stringify(spec)}` }
}

/** The tasks of a `turbo run --summarize` file (or of a dry run) that ran a command. */
export function summaryTasks(summary) {
  return real(summary?.tasks).map((t) => ({
    taskId: String(t.taskId),
    hash: String(t.hash),
    cache: t.cache?.status === 'HIT' || t.cache?.status === 'MISS' ? t.cache.status : null
  }))
}

/** The lines a result is announced with: the verdict for people, then cache differences. */
export function describe(kind, result) {
  const lines = []
  const head = `turbo-verify (${kind}): ${String(result.equal)} of ${String(result.compared)} task hashes equal the plan job's`
  if (result.ok) lines.push(`${head}.`)
  else {
    lines.push(
      `::error::${head} — ${String(result.different.length)} differ, ${String(result.missing.length)} missing here, ${String(result.unknown.length)} unknown to plan (commit ${result.commit})`
    )
    for (const d of result.different) lines.push(`  DIFFERENT ${d.task}: plan ${d.plan}, here ${d.here}`)
    for (const id of result.missing) lines.push(`  MISSING HERE ${id}`)
    for (const id of result.unknown) lines.push(`  NOT IN THE PLAN, OR NOT THIS ROW'S ${id}`)
    for (const id of result.noStatus ?? []) lines.push(`  NO CACHE STATUS (neither HIT nor MISS) ${id}`)
    for (const id of result.duplicate ?? []) lines.push(`  LISTED TWICE ${id}`)
    lines.push(
      '  The plan job and this job hash different trees for one commit: a file that exists only after the install or a build is an input, or the plan job lacks a workspace package. See docs/references/gates-ci-runners.md, "Turborepo".'
    )
  }
  const { storedSincePlan, lostSincePlan, predictedHit, actualHit } = result.cache
  if (kind === 'row')
    lines.push(
      `turbo-verify (row): cache — plan predicted ${String(predictedHit)} of these tasks held, this row found ${String(actualHit)}.`
    )
  if (storedSincePlan.length)
    lines.push(
      `  ${String(storedSincePlan.length)} task(s) were stored by another run after plan asked (same hash, so the same result): ${storedSincePlan.join(' ')}`
    )
  if (lostSincePlan.length)
    lines.push(
      `::warning::turbo-verify: ${String(lostSincePlan.length)} task(s) plan saw in the cache were not served here (cache unreachable or entry gone); they ran instead: ${lostSincePlan.join(' ')}`
    )
  return lines
}

/**
 * Judges the three kinds of record of one Tracy CI run.
 * @param {object} input
 * @param {string[]} input.lines - every log line of every job.
 * @param {string[]} input.turboRows - names of the Turbo rows that ran (from the jobs list).
 * @returns {{ ok: boolean, problems: string[], summary: object }}
 */
export function judgeRun({ lines, turboRows }) {
  const records = { plan: [], check: [], row: [] }
  for (const line of lines) {
    for (const [kind, mark] of Object.entries(MARK)) {
      const at = line.indexOf(`${mark} `)
      if (at === -1) continue
      try {
        records[kind].push(JSON.parse(line.slice(at + mark.length + 1)))
      } catch {
        records[kind].push({ broken: true })
      }
    }
  }
  const problems = []
  const plan = records.plan.at(-1)
  if (!plan || plan.broken || !plan.tasks)
    return {
      ok: false,
      problems: [
        'the plan job published no manifest (it fell back to the rows before Turbo, or its log is not readable)'
      ],
      summary: {}
    }
  const total = Object.keys(plan.tasks).length
  const plannedHit = Object.values(plan.tasks).filter((t) => t[1] === 'HIT').length
  const check = records.check.at(-1)
  if (!check || check.broken) problems.push('the checks row left no comparison of every task hash')
  else if (!check.ok)
    problems.push(
      `checks: ${String(check.different?.length ?? '?')} task hash(es) differ from the plan job's, ${String(check.missing?.length ?? '?')} missing`
    )
  else if (check.equal !== total)
    problems.push(`checks compared ${String(check.equal)} task(s), the manifest has ${String(total)}`)
  // One whole record per row that ran, by name: its scheduled tasks all there, each with HIT or MISS.
  const rows = []
  for (const name of turboRows) {
    const mine = records.row.filter((r) => r.group === name)
    const row = mine.at(-1)
    if (!row) {
      problems.push(`the Turbo row "${name}" ran but left no comparison`)
      continue
    }
    rows.push(row)
    if (row.broken || !row.ok) {
      problems.push(
        `the Turbo row "${name}" is not evidence: ${String(row.different?.length ?? '?')} hash(es) differ, ${String(row.missing?.length ?? '?')} scheduled task(s) missing, ${String(row.noStatus?.length ?? '?')} without a cache status, ${String(row.duplicate?.length ?? '?')} listed twice`
      )
      continue
    }
    const expected = Array.isArray(row.expected) ? row.expected : []
    if (expected.length === 0 || row.equal !== expected.length)
      problems.push(
        `the Turbo row "${name}" compared ${String(row.equal)} task(s), it was scheduled ${String(expected.length)}`
      )
    const known = (row.cache?.predictedHit ?? -1) >= 0 && (row.cache?.actualHit ?? -1) >= 0
    if (!known) problems.push(`the Turbo row "${name}" carries no cache counts`)
  }
  const strangers = records.row.filter((r) => !turboRows.includes(r.group))
  if (strangers.length)
    problems.push(`${String(strangers.length)} row record(s) belong to no Turbo row that ran`)
  // A task no row ran must be one plan saw in the cache; otherwise a test was dropped.
  const ran = new Set(rows.flatMap((r) => (Array.isArray(r.expected) ? r.expected : [])))
  const dropped = Object.entries(plan.tasks)
    .filter(([id, t]) => t[1] === 'MISS' && !ran.has(id))
    .map(([id]) => id)
  if (dropped.length)
    problems.push(
      `plan saw ${String(dropped.length)} task(s) missing from the cache that no row ran: ${dropped.join(' ')}`
    )
  let rowTasks = 0
  let rowPredicted = 0
  let rowActual = 0
  const stored = []
  const lost = []
  for (const row of rows) {
    rowTasks += row.equal ?? 0
    rowPredicted += row.cache?.predictedHit ?? 0
    rowActual += row.cache?.actualHit ?? 0
    stored.push(...(row.cache?.storedSincePlan ?? []))
    lost.push(...(row.cache?.lostSincePlan ?? []))
  }
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      commit: plan.commit,
      tasks: total,
      plannedHit,
      checksEqual: check?.equal ?? null,
      rows: rows.length,
      rowTasks,
      rowPredictedHit: rowPredicted,
      rowActualHit: rowActual,
      storedSincePlan: stored,
      lostSincePlan: lost
    }
  }
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
const tryGit = (...args) => {
  try {
    return git(...args)
  } catch {
    return ''
  }
}

function treeInventory() {
  const files = git(
    'ls-files',
    '-z',
    '--',
    'package.json',
    'apps/*/package.json',
    'packages/*/*/package.json'
  )
    .split('\0')
    .filter((f) => f === 'package.json' || /^(?:apps\/[^/]+|packages\/[^/]+\/[^/]+)\/package\.json$/.test(f))
  return inventory(
    files.map((f) => ({
      dir: f === 'package.json' ? '' : path.dirname(f),
      pkg: JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'))
    }))
  )
}

function flag(argv, name) {
  const at = argv.indexOf(name)
  if (at === -1) return null
  const value = argv[at + 1]
  return value === undefined || value.startsWith('--') ? '' : value
}

function loadManifest(argv) {
  const file = flag(argv, '--manifest')
  if (file === '') return { error: '--manifest needs a file' }
  try {
    return readManifest(file === null ? (process.env.TRACY_TURBO_MANIFEST ?? '') : readFileSync(file, 'utf8'))
  } catch (error) {
    return { error: `the manifest could not be read (${String(error?.message ?? error)})` }
  }
}

function planMode(argv) {
  const input = flag(argv, '--plan')
  const out = flag(argv, '--out')
  if (!input || !out) return usage()
  let dry
  try {
    dry = JSON.parse(readFileSync(input, 'utf8'))
  } catch {
    console.log('::warning::turbo-verify (plan): the marked dry run could not be read')
    return 1
  }
  const built = buildManifest({
    dry,
    expected: treeInventory(),
    commit: tryGit('rev-parse', '--verify', 'HEAD^{commit}'),
    dshPinned: tryGit('rev-parse', '--verify', `HEAD:${DSH}`),
    dshCheckedOut: existsSync(path.join(ROOT, DSH, '.git'))
      ? tryGit('-C', DSH, 'rev-parse', '--verify', 'HEAD^{commit}')
      : ''
  })
  if ('error' in built) {
    console.log(`::warning::turbo-verify (plan): ${built.error} — planning the rows as before Turbo`)
    return 1
  }
  const text = JSON.stringify(built.manifest)
  writeFileSync(out, text)
  const tasks = Object.entries(built.manifest.tasks)
  const hits = tasks.filter(([, t]) => t[1] === 'HIT').length
  console.log(
    `turbo-verify (plan): ${String(tasks.length)} tasks at ${built.manifest.commit}, ${String(hits)} held by the cache. Hash per task:`
  )
  for (const [id, [hash, status]] of tasks.sort(([a], [b]) => a.localeCompare(b)))
    console.log(`  ${status.padEnd(4)} ${hash}  ${id}`)
  console.log(`${MARK.plan} ${text}`)
  return 0
}

function finish(kind, result) {
  for (const line of describe(kind, result)) console.log(line)
  console.log(`${MARK[kind === 'row' ? 'row' : 'check']} ${JSON.stringify(result)}`)
  return result.ok ? 0 : 1
}

function noManifest(kind, loaded) {
  if ('none' in loaded) {
    console.log(
      `::notice::turbo-verify (${kind}): the plan job published no Turbo manifest (it planned the rows as before Turbo), so there is no hash to compare.`
    )
    return 0
  }
  console.log(`::error::turbo-verify (${kind}): ${loaded.error}`)
  return 1
}

function compareMode(argv) {
  const loaded = loadManifest(argv)
  if (!('manifest' in loaded)) return noManifest('checks', loaded)
  const file = flag(argv, '--dry')
  let text
  if (file) text = readFileSync(file, 'utf8')
  else {
    const names = [...new Set(Object.keys(loaded.manifest.tasks).map((id) => id.slice(id.indexOf('#') + 1)))]
    const env = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' }
    // What `.github/actions/turbo-cache` exports in `plan` and in the Turbo rows; this row does not
    // start the cache, and the tasks that read dsh carry the variable in their hash.
    env.TRACY_DSH_COMMIT ??= tryGit('rev-parse', '--verify', `HEAD:${DSH}`)
    // Hashes only: asking the remote cache for 1500 entries one at a time took 105 s (turbo-cached.mjs).
    for (const key of ['TURBO_API', 'TURBO_TOKEN', 'TURBO_TEAM']) delete env[key]
    const run = spawnSync(path.join(ROOT, 'node_modules/.bin/turbo'), ['run', ...names, '--dry=json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
      env
    })
    if (run.status !== 0) {
      console.log(
        `::error::turbo-verify (checks): the dry run failed: ${String(run.stderr || run.error).slice(0, 1500)}`
      )
      return 1
    }
    text = run.stdout
  }
  const tasks = summaryTasks(parseDry(text)).map((t) => ({ ...t, cache: null }))
  return finish(
    'checks',
    compare({ manifest: loaded.manifest, tasks, commit: tryGit('rev-parse', 'HEAD'), all: true })
  )
}

function newestSummary(target) {
  if (!existsSync(target)) return null
  if (!statSync(target).isDirectory()) return target
  const files = readdirSync(target)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(target, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return files[0] ?? null
}

function rowMode(argv) {
  const loaded = loadManifest(argv)
  if (!('manifest' in loaded)) return noManifest('row', loaded)
  const file = newestSummary(flag(argv, '--summary') || path.join(ROOT, '.turbo/runs'))
  if (!file) {
    console.log('::error::turbo-verify (row): Turbo left no run summary (was `--summarize` passed?)')
    return 1
  }
  const group = flag(argv, '--group')
  const spec = flag(argv, '--tasks')
  if (!group || !spec) {
    console.log(
      "::error::turbo-verify (row): --group <row name> and --tasks <the row's Turbo words> are required"
    )
    return 1
  }
  const expected = rowTasks(loaded.manifest, spec)
  if ('error' in expected) {
    console.log(`::error::turbo-verify (row): ${expected.error}`)
    return 1
  }
  const tasks = summaryTasks(JSON.parse(readFileSync(file, 'utf8')))
  const result = compare({
    manifest: loaded.manifest,
    tasks,
    commit: tryGit('rev-parse', 'HEAD'),
    all: false,
    expected,
    needCache: true,
    group
  })
  for (const t of tasks) {
    const planned = loaded.manifest.tasks[t.taskId]
    console.log(
      `  ${t.taskId}: ${t.hash} cache ${String(t.cache)} (plan: ${planned ? `${planned[0]} ${planned[1]}` : 'unknown task'})`
    )
  }
  return finish('row', result)
}

function gh(args) {
  return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 })
}

function githubMode(argv) {
  const artifacts = flag(argv, '--artifacts')
  const say = (line) => console.log(`turbo-verify (github): ${line}`)
  const local = tryGit('rev-parse', 'HEAD')
  const asked = flag(argv, '--pr')
  let repo
  let pr
  let runs
  try {
    repo = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner
    // The pull request of this branch (or the one named), and the revision GitHub holds for it.
    pr = JSON.parse(
      gh(['pr', 'view', ...(asked ? [asked] : []), '--json', 'number,headRefOid,isDraft,state'])
    )
  } catch (error) {
    say(
      `NO EVIDENCE — the pull request could not be read with gh (${String(error?.message ?? error).split('\n')[0]})`
    )
    return 1
  }
  const head = String(pr.headRefOid)
  // What is judged is the pull request's current revision. A checkout that is not at it would be
  // read as proof of code GitHub never ran.
  if (local !== head) {
    say(
      `NO EVIDENCE — pull request #${String(pr.number)} is at ${head}, this checkout at ${local || '(unknown)'}: publish this revision first, or check out the pull request's`
    )
    return 1
  }
  try {
    // A pull-request run is filed under the head commit of the branch; what it checks out and tests
    // is the merge commit, which the plan record names and which is checked against this head below.
    runs = JSON.parse(
      gh([
        'api',
        `repos/${repo}/actions/workflows/tracy-ci.yml/runs?head_sha=${head}&event=pull_request&per_page=50`
      ])
    ).workflow_runs
  } catch (error) {
    say(`NO EVIDENCE — GitHub could not be read with gh (${String(error?.message ?? error).split('\n')[0]})`)
    return 1
  }
  const mine = (runs ?? []).filter(
    (r) =>
      !Array.isArray(r.pull_requests) ||
      r.pull_requests.length === 0 ||
      r.pull_requests.some((p) => p.number === pr.number)
  )
  const run = mine.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  if (!run) {
    say(
      `NO EVIDENCE — no Tracy CI run exists for revision ${head} of pull request #${String(pr.number)}${pr.isDraft ? ' (it is a draft: a draft runs no Tracy CI)' : ''}`
    )
    return 1
  }
  if (run.status !== 'completed') {
    say(`NO EVIDENCE YET — run ${String(run.id)} for ${head} is ${String(run.status)}`)
    return 1
  }
  const jobs = JSON.parse(
    gh([
      'api',
      `repos/${repo}/actions/runs/${String(run.id)}/attempts/${String(run.run_attempt)}/jobs?per_page=100`
    ])
  ).jobs
  const wanted = jobs.filter(
    (j) => j.conclusion !== 'skipped' && /^(plan the build-check rows|build check \()/.test(j.name)
  )
  const lines = []
  for (const job of wanted) {
    try {
      lines.push(...gh(['api', `repos/${repo}/actions/jobs/${String(job.id)}/logs`]).split('\n'))
    } catch {
      say(`the log of job "${job.name}" could not be read`)
    }
  }
  const turboRows = wanted
    .map((j) => /^build check \((tests (?:web \d\/\d|packages|scripts))\)$/.exec(j.name)?.[1])
    .filter(Boolean)
  const verdict = judgeRun({ lines, turboRows })
  const s = verdict.summary
  // The commit plan hashed must be the merge of THIS revision into the base, not an older one.
  if (s.commit) {
    try {
      const parents = JSON.parse(gh(['api', `repos/${repo}/commits/${String(s.commit)}`])).parents.map(
        (c) => c.sha
      )
      if (!parents.includes(head))
        verdict.problems.push(
          `plan hashed commit ${String(s.commit)}, which is not a merge of revision ${head}`
        )
    } catch {
      verdict.problems.push(
        `the commit plan hashed (${String(s.commit)}) could not be read, so it is not known to be this revision's merge`
      )
    }
    verdict.ok = verdict.problems.length === 0
  }
  if (run.conclusion !== 'success') {
    verdict.problems.push(`the run concluded ${String(run.conclusion)}, not success`)
    verdict.ok = false
  }
  say(
    `pull request #${String(pr.number)}, revision ${head}: run ${String(run.id)} attempt ${String(run.run_attempt)} (${String(run.conclusion)})`
  )
  if (s.tasks !== undefined) {
    say(
      `plan: ${String(s.plannedHit)} of ${String(s.tasks)} tasks held by the cache, at merge commit ${String(s.commit)}`
    )
    say(`checks: ${String(s.checksEqual)} of ${String(s.tasks)} task hashes equal the plan job's`)
    say(
      `rows: ${String(s.rows)} Turbo row(s) ran ${String(s.rowTasks)} task(s) with equal hashes; plan predicted ${String(s.rowPredictedHit)} of them held, the rows found ${String(s.rowActualHit)}`
    )
    if (s.storedSincePlan.length)
      say(`stored by another run after plan asked: ${s.storedSincePlan.join(' ')}`)
    if (s.lostSincePlan.length)
      say(`in the cache for plan, not served to the row: ${s.lostSincePlan.join(' ')}`)
  }
  for (const p of verdict.problems) say(`PROBLEM — ${p}`)
  if (artifacts) {
    mkdirSync(artifacts, { recursive: true })
    writeFileSync(
      path.join(artifacts, 'turbo-verify-github.json'),
      `${JSON.stringify({ run: run.id, attempt: run.run_attempt, head, ...verdict }, null, 2)}\n`
    )
  }
  say(verdict.ok ? 'PASS' : 'FAIL')
  return verdict.ok ? 0 : 1
}

function usage() {
  console.error(
    'usage: node scripts/ci/turbo-verify.mjs --plan <marked dry run> --out <file> | --compare [--manifest <file>] [--dry <file>] | --row --group <row name> --tasks <words> [--manifest <file>] [--summary <file|dir>] | --github [--pr <number>] [--artifacts <dir>]'
  )
  return 2
}

function main() {
  const argv = process.argv.slice(2)
  const modes = ['--plan', '--compare', '--row', '--github'].filter((m) => argv.includes(m))
  if (modes.length !== 1) return usage()
  if (modes[0] === '--plan') return planMode(argv)
  if (modes[0] === '--compare') return compareMode(argv)
  if (modes[0] === '--row') return rowMode(argv)
  return githubMode(argv)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main()
