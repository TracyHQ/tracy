/**
 * Lint gate: oxlint + typecheck + a format check, in a form that DOES NOT MODIFY FILES.
 *
 * WHY THE STRICT VERSION. `pnpm lint` runs `--fix` and `--write`; that is for the person
 * writing. A gate that fixes the tree it is judging reports on something nobody wrote —
 * so the gate uses exactly the three commands below, all read-only.
 *
 * WHY THERE IS NO eslint, and this is a decision, not an omission.
 *
 * `tracy-infra` and `tracy-desk` both carry eslint, and there it does what oxlint cannot: two
 * hand-written AST rules enforcing the Worker boundary (`tracy/server-only-in-ui` forbids `mintSession`
 * and `FLEET_ACTOR_SECRET` leaking into the UI; `tracy/no-redefined-shared` forbids redefining functions
 * that `fleet-bar/src` owns) plus `import-x/no-restricted-paths`.
 *
 * 🔒 THIS ARGUMENT JUST CHANGED, AND IT IS RECORDED INSTEAD OF SILENTLY EDITED. The first version of
 * this header (written the morning of 30/08) said "TCH **has no Worker**" and dropped eslint on that
 * basis. That afternoon, `ab2b53e` moved six Workers here and the sentence became false. When the
 * premise changes, the conclusion must be argued again, not inherited.
 *
 * Argued again: those two rules protect the **UI ↔ Worker boundary within one build tree**, and in
 * `tracy-infra` that tree is a pnpm workspace where `apps/` can import straight from the Worker folder.
 * In TCH, `packages/` (dsh plugins, to the registry) and `workers/` (Cloudflare) **have no import path
 * between them**. Measured 2026-08-30: 0 results in both directions, and the more decisive fact is
 * that `pnpm-workspace.yaml` declares only two levels under `packages` — **`workers/` is not a workspace
 * member**, so no package on one side can resolve the other even with the right name. On top of that,
 * `check-self-contained` forbids any `link:`/path leaving the package. What those AST rules block
 * cannot be built here in the first place.
 *
 * So eslint still stays out, but for a different reason than before. The condition for bringing it
 * back changed too: the day `packages/` and `workers/` have a real dependency path — or the day an AST
 * rule is needed that a dedicated gate cannot express — eslint comes back **with that rule**, not to
 * match the set of the other two repos.
 *
 * 🔒 typecheck LIVES HERE rather than as its own gate: it is the same kind of check as lint (reads
 * source, runs nothing) and gets forgotten just as easily. Before 2026-08-30 this repo had 12 TypeScript
 * packages and NO typecheck command — the very first run caught two real errors.
 */
import { spawn, spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * TYPECHECK RUNS ITS PROJECTS IN PARALLEL HERE — added 2026-09-15.
 *
 * `pnpm typecheck` is thirteen `tsc --noEmit -p …` joined by `&&`: one after another, each on one
 * core. Measured 15/09 on PR #94 under load: the whole `lint` gate took 6 min 16 s, almost all of
 * it typecheck. The projects do not depend on each other's output (`--noEmit`), so the order was
 * never load-bearing.
 *
 * 🔒 THE PROJECT LIST IS STILL READ FROM `package.json`. A second list here would drift from the one
 * people run by hand. If the script stops having the exact shape `tsc --noEmit -p <dir>` joined by
 * `&&`, this gate does NOT guess: it runs `pnpm typecheck` sequentially as before and says so.
 *
 * ⚠ CONCURRENCY IS CAPPED, NOT "ALL AT ONCE". One `tsc` on the larger projects holds several hundred
 * MB, and runners 02/03 have a 6 GB ceiling shared with everything else in the job. The cap is
 * `TRACY_TYPECHECK_JOBS` when set, else min(4, available cores). Each project's output is buffered
 * and printed whole when it ends, so logs do not interleave.
 */
const TSC_PROJECT = /^tsc --noEmit -p (\S+)$/

function typecheckProjects(): string[] | null {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>
  }
  const script = pkg.scripts?.typecheck
  if (!script) return null
  const projects: string[] = []
  for (const part of script.split('&&').map((p) => p.trim())) {
    const match = TSC_PROJECT.exec(part)
    if (!match?.[1]) return null
    projects.push(match[1])
  }
  return projects.length > 0 ? projects : null
}

/**
 * `--incremental` with one build-info file per project under `TRACY_TSC_CACHE_DIR`, when CI sets it.
 * tsc records a hash of every file it read, so a restored build-info re-checks only what changed and
 * what depends on it — the verdict is the same as a cold run. Measured cold on CI (run 36596428799):
 * 107 s for the thirteen projects, `tracy-design` alone 64 s. Unset (a laptop): exactly as before.
 */
function incremental(project: string, dir = process.env.TRACY_TSC_CACHE_DIR): string[] {
  if (!dir) return []
  const name = project.replace(/[^\w.-]+/g, '_')
  return ['--incremental', '--tsBuildInfoFile', resolve(ROOT, dir, `${name}.tsbuildinfo`)]
}

/**
 * THE GATE REPORTS WHERE ITS TIME GOES AND WHAT THE CACHE LOOKED LIKE — added 2026-10-04.
 *
 * Until now the only figure for `lint` was the whole gate (median 61.3 s, maximum 93 s in the CI
 * sample of early October), plus one line per tsc project. Whether oxlint, typecheck or biome is the
 * part worth splitting or caching was a guess. So each of the three components now prints its wall
 * time — also when it fails — and the typecheck stage prints what it knew about the build-info cache.
 *
 * 🔒 THIS IS A REPORT, NOT A DECISION. Nothing below is read back: no command, flag, order,
 * concurrency or exit code depends on a time or on a cache state. A report that could skip a project
 * because "the cache hit" would be a second, unreviewed gate.
 *
 * ⚠ WHAT THE TWO CACHE LINES DO NOT SAY.
 *  - `restore` repeats what `actions/cache/restore` wrote to its outputs (exact key, an older key by
 *    prefix, nothing). It says a directory was unpacked, not that tsc could use what was in it.
 *  - `build-info before start` is one `lstat` per project, taken just before that project's tsc is
 *    started: a regular non-empty file is `present`. The file is never opened (it can be megabytes,
 *    and a FIFO there would block), so `present` is labelled `unvalidated` — tsc alone decides whether
 *    it reuses, re-checks part, or throws the file away. It is a snapshot from BEFORE the run because
 *    tsc rewrites the file: after a cold run every file is there too.
 * Anything that is not clearly one of the named states is `unknown`, never rounded to the nearer one.
 */
type BuildInfo = 'present' | 'missing' | 'unknown' | 'disabled'

function observeBuildInfo(args: readonly string[]): { state: BuildInfo; label: string } {
  const at = args.indexOf('--tsBuildInfoFile')
  const file = at === -1 ? undefined : args[at + 1]
  if (!file) return { state: 'disabled', label: 'disabled' }
  try {
    const stat = lstatSync(file)
    if (!stat.isFile()) return { state: 'unknown', label: 'unknown, not a regular file' }
    if (stat.size === 0) return { state: 'unknown', label: 'unknown, empty file' }
    return { state: 'present', label: 'present, unvalidated' }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { state: 'missing', label: 'missing' }
    return { state: 'unknown', label: `unknown, ${typeof code === 'string' ? code : 'lstat failed'}` }
  }
}

/**
 * The only key shape `tracy-ci.yml` saves or asks for: `tsc-${{ github.sha }}`, restored by the prefix
 * `tsc-`. A value of any other shape did not come from that step, so it is neither trusted nor echoed.
 * Line terminators are refused by their own test as well as by the pattern, so a value can never
 * continue on a second log line, whatever the pattern later becomes.
 */
const CACHE_KEY = /^tsc-[0-9a-f]{40}$/
const LINE_TERMINATOR = /[\r\n\u2028\u2029]/

function isCacheKey(value: string): boolean {
  return !LINE_TERMINATOR.test(value) && CACHE_KEY.test(value)
}

/**
 * What the restore step reported, from the three outputs the workflow passes in. `actions/cache` v6
 * (`src/restoreImpl.ts`) always writes `cache-primary-key`; when nothing was restored it returns
 * before writing the other two, so a miss is BOTH empty — `cache-hit=false` never comes without a
 * matched key. When something was restored it writes `cache-matched-key` and `cache-hit`, `true` only
 * if that key is the primary one. Exactly three combinations exist; any other — and a laptop, where
 * none is set — is `unknown`.
 */
function restoreReport(env: NodeJS.ProcessEnv = process.env): string {
  const hit = env.TRACY_TSC_CACHE_HIT ?? ''
  const matched = env.TRACY_TSC_CACHE_MATCHED_KEY ?? ''
  const primary = env.TRACY_TSC_CACHE_PRIMARY_KEY ?? ''
  if (!hit && !matched && !primary) return 'unknown (no restore outputs were passed to this run)'
  const inconsistent = 'unknown (the restore outputs are malformed or contradict each other)'
  if (!isCacheKey(primary) || (matched !== '' && !isCacheKey(matched))) return inconsistent
  if (hit === 'true' && matched === primary) return `exact (${matched})`
  if (hit === 'false' && matched !== '' && matched !== primary)
    return `prefix (${matched}, wanted ${primary})`
  if (hit === '' && matched === '') return `miss (wanted ${primary})`
  return inconsistent
}

/** Whole milliseconds since `started` on the monotonic clock — a wall-clock step cannot make it negative. */
function elapsed(started: number): number {
  return Math.max(0, Math.round(performance.now() - started))
}

function reportTime(label: string, ms: number, ok: boolean): void {
  process.stdout.write(`check-lint: time — ${label}: ${String(ms)} ms (${ok ? 'ok' : 'FAILED'})\n`)
}

/** How many projects were started from each build-info state — counted as they start, never afterwards. */
const seen: Record<BuildInfo, number> = { present: 0, missing: 0, unknown: 0, disabled: 0 }

function runTsc(
  project: string
): Promise<{ project: string; code: number; output: string; ms: number; buildInfo: string }> {
  const args = incremental(project)
  // Observed here, immediately before the spawn: this is the state THIS project's tsc starts from.
  const buildInfo = observeBuildInfo(args)
  seen[buildInfo.state] += 1
  const started = Date.now()
  return new Promise((done) => {
    const child = spawn('pnpm', ['exec', 'tsc', '--noEmit', '-p', project, ...args], {
      cwd: ROOT
    })
    let output = ''
    let settled = false
    const settle = (code: number): void => {
      if (settled) return
      settled = true
      done({ project, code, output, ms: Date.now() - started, buildInfo: buildInfo.label })
    }
    child.stdout.on('data', (c: Buffer) => (output += c.toString()))
    child.stderr.on('data', (c: Buffer) => (output += c.toString()))
    child.on('close', (code) => settle(code ?? 1))
    // A project that could not be started is a failed project. Without this listener the `error`
    // event is an uncaught exception: still red, but the gate died mid-stage with the other
    // projects' output and the stage time unprinted.
    child.on('error', (error) => {
      output += `check-lint: could not start tsc for ${project}: ${error.message}\n`
      settle(1)
    })
  })
}

function reportBuildInfo(): void {
  process.stdout.write(
    seen.disabled > 0 || seen.present + seen.missing + seen.unknown === 0
      ? 'check-lint: cache — build-info: disabled (no TRACY_TSC_CACHE_DIR, or the sequential fallback: no --incremental was passed)\n'
      : `check-lint: cache — build-info before start: ${String(seen.present)} present (unvalidated), ${String(seen.missing)} missing, ${String(seen.unknown)} unknown\n`
  )
}

async function parallelTypecheck(projects: readonly string[]): Promise<boolean> {
  const fromEnv = Number(process.env.TRACY_TYPECHECK_JOBS)
  const jobs = Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : Math.min(4, availableParallelism())
  process.stdout.write(`check-lint: cache — restore: ${restoreReport()}\n`)
  process.stdout.write(
    `check-lint: typecheck — ${String(projects.length)} project(s), ${String(jobs)} at a time\n`
  )
  const queue = [...projects]
  let ok = true
  const worker = async (): Promise<void> => {
    for (let project = queue.shift(); project !== undefined; project = queue.shift()) {
      const r = await runTsc(project)
      process.stdout.write(
        `check-lint: tsc -p ${r.project} ${r.code === 0 ? 'ok' : 'FAILED'} (${String(r.ms)} ms) [build-info before start: ${r.buildInfo}]\n`
      )
      if (r.output.trim()) process.stdout.write(r.output.endsWith('\n') ? r.output : `${r.output}\n`)
      if (r.code !== 0) ok = false
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, projects.length) }, worker))
  return ok
}

/** One gate step: the command run through `pnpm`, and the name shown in the log. */
type Step = { readonly name: string; readonly args: readonly string[]; readonly timed: string }
const STEPS: readonly Step[] = [
  // `--disable-nested-config`: oxlint READS every nested `.oxlintrc.json` below it, even in
  // ignored folders — and `vendor/tracy/deepseek-harness` carries upstream's config with
  // `options.typeAware`, which oxlint only accepts at the root. Without this flag the gate dies while
  // parsing SOMEONE ELSE'S config, before looking at a single line of TCH code (measured 30/08). TCH
  // has no nested config of its own, so the flag does not change the rule scope.
  {
    name: 'oxlint',
    args: ['exec', 'oxlint', '--deny-warnings', '--disable-nested-config'],
    timed: 'oxlint'
  },
  { name: 'typecheck', args: ['typecheck'], timed: 'typecheck (whole stage)' },
  // `biome format` (no `--write`) and `biome lint` (no `--write`) only report.
  // One figure for the two biome commands: `format:check` is a single script, and timing them apart
  // would mean running them apart — a change to the gate, which this report must not make.
  { name: 'format', args: ['format:check'], timed: 'format:check (biome format + biome lint, one figure)' }
]

/** One step, exactly as before the report existed: parallel tsc when the script allows it, else `pnpm`. */
async function runStep(step: Step): Promise<boolean> {
  if (step.name === 'typecheck') {
    const projects = typecheckProjects()
    if (projects) {
      const ok = await parallelTypecheck(projects)
      reportBuildInfo()
      return ok
    }
    process.stdout.write(
      'check-lint: the `typecheck` script is not a plain chain of `tsc --noEmit -p <dir>` — running it sequentially.\n'
    )
    process.stdout.write(`check-lint: cache — restore: ${restoreReport()}\n`)
    reportBuildInfo()
  }
  return spawnSync('pnpm', [...step.args], { cwd: ROOT, stdio: 'inherit' }).status === 0
}

async function main(): Promise<void> {
  const gateStarted = performance.now()
  for (const step of STEPS) {
    const started = performance.now()
    let ok: boolean
    try {
      ok = await runStep(step)
    } catch (error) {
      // A step that threw (an unreadable or malformed `package.json`, say) was attempted too: its
      // time is printed, then the error goes on to the handler below, which exits non-zero.
      reportTime(step.timed, elapsed(started), false)
      throw error
    }
    // Printed for a failed step too: a red run is still a measurement of the step that was attempted.
    reportTime(step.timed, elapsed(started), ok)
    if (!ok) {
      process.stderr.write(
        `check-lint: step "${step.name}" is red. Run \`pnpm lint\` to fix automatically.\n`
      )
      process.exit(1)
    }
  }
  reportTime('total', elapsed(gateStarted), true)
  process.stdout.write(`check-lint: ${String(STEPS.length)} steps green.\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
