/**
 * Test gate: the repo's test suites must be green.
 *
 * TWO SUITES, TWO TOOLCHAINS, ONE GATE:
 *   1. `workers/` + `scripts/` — `node --test`, run through `pnpm test:workers`.
 *   2. `vendor/tracy/dsh-passwords` — `node --test` under `tsx`, installed with **npm** (see below).
 *
 * 🔒 THE FIRST SUITE ONCE HAD NO GATE AT ALL. Six Workers moved here on 2026-08-30 (`ab2b53e`)
 * bringing 553 tests and a `test:workers` script — but no row in `check-all.ts` called it, so
 * `pnpm build:check` was green while no Worker test had run. A command that only runs when someone
 * remembers to run it is not a gate.
 *
 * WHY A GATE. 230 tests sat in this repo and **nobody ran them** until
 * 2026-08-30. `dsh-passwords` is not a read-only vendor package: Tracy changed it (the seat door in
 * `src/seat.ts`, `src/gateway.ts`, `src/auth.ts`); the fork IS the source, built into the fleet
 * image, and since 06/09 there is no publish step at all (ADR 0014 §6).
 * It guards **dsh's seat door on every fleet host, and the password door of every profile** — the blast
 * map in `CLAUDE.md` ranks it with `tokens.css`. A change there without a witness is the most
 * expensive thing to leave without a witness.
 *
 * WHY IT IS OUTSIDE THE pnpm WORKSPACE. The workspace declares only two levels under `packages`; `vendor/`
 * stays out on purpose (BOUNDARY RULE #5). That package carries its own `package-lock.json` and installs
 * with **npm**, not pnpm — running `pnpm install` inside it climbs to the root workspace and installs the wrong thing.
 *
 * THREE TESTS ARE SKIPPED, AND THEY ARE NOT TRACY REGRESSIONS.
 *
 * Measured, not assumed: running this exact suite at `cde8beb` — the commit **before** the seat door
 * landed — gives **the same three failures**, 200/203 green. The seat-door commit `e0a1c09` added 27 tests,
 * all 27 green (203 → 230). So these three failures are **debt inherited from the fork**, not something
 * Tracy broke. Stable across many runs, not flaky.
 *
 * Skipping them is NOT fail-open: each has its full name and a reason below, the same pattern as
 * `KEPT_VERBATIM` in `check-dsh-locale` and `ALLOWED_ABSOLUTE` in `check-self-contained`.
 * What must be avoided is a gate that stays red forever — an always-red gate is an ignored gate, and
 * then the other 227 tests lose their witness too.
 *
 * 🔒 THIS LIST MAY ONLY GET SHORTER. Adding an entry declares one more broken thing we chose not
 * to look at — if you do, you must be able to write why, at the level of the three entries below.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { printNow, reporterArgs, spawnReported, TIMING_MARK } from './test-timing-reporter.mjs'
import {
  DATABASE_MARK,
  INTEGRATION_LABEL,
  isDatabaseGated,
  relatedTests,
  repoReader,
  SKIP_DB_ENV,
  SKIP_DB_FLAG,
  skipDatabaseRequested,
  splitDatabaseGated,
  workspaceDependencies
} from './ci/related-tests.mjs'
import {
  startThrowaway as beginThrowaway,
  type DatabaseMode,
  parseDatabaseMode,
  prepareDatabase,
  THROWAWAY_PORT,
  type Throwaway,
  type ThrowawayIO,
  throwawayName
} from './test-database.ts'

// The container-shape lives in a testable module; re-exported so the existing throwawayArgs tests
// keep importing it from here.
export { throwawayArgs } from './test-database.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = join(ROOT, 'vendor/tracy/dsh-passwords')

/**
 * THE THIRD SUITE: the EmDash templates, each an INDEPENDENT pnpm project.
 *
 * `pnpm-workspace.yaml` excludes them on purpose — they carry their own lockfile (emdash + astro +
 * ~300 packages), and pulling that into the root lockfile is what `vendor/emdash/emdash/IMPORT-NOTE.md`
 * forbids. As a result `pnpm -r test` does NOT reach them, and the `test:workers` glob targets `test/`
 * (SINGULAR) under each package, while the templates keep their tests in `tests/` (plural). Measured
 * 16/09/2026: 31 files, about 270 tests, never run by any CI run. That time `pnpm build:check` printed
 * **39/39 gates green** while 7 tests of `tracy-emdash-theme-business` were red.
 *
 * This is the THIRD time the same failure shape appears in this very file: the Worker suite had no gate
 * calling it (top of file), then `seat-door-interop.test.ts` slipped through because the glob only
 * caught `.mjs` (note at `test:interop`). So the gate does not just add two run lines: it RECOUNTS
 * (`checkCoverage`), and a new test suite placed where nobody declared it turns the gate red instead
 * of silently disappearing.
 */
const STANDALONE = [
  'packages/cms/tracy-emdash-theme-base',
  'packages/cms/tracy-emdash-theme-business',
  // Tracy SaaS (JA Kinetic), in the repo since 29/09/2026; its suite measured 179/179 that day.
  'packages/cms/tracy-emdash-theme-saas'
] as const

/** One run group: the command that runs it, and the test files that command picks up. */
export interface CoverageGroup {
  readonly run: string
  readonly files: RegExp
}

/**
 * Every Tracy test file must belong to ONE run group. Each group's glob is declared here exactly as
 * the command it runs spells it — change the command and forget this row, and the gate goes red, on purpose.
 */
const GROUPS: readonly CoverageGroup[] = [
  { run: 'test:workers', files: /^(apps\/[^/]+|scripts|packages\/[^/]+\/[^/]+)\/test\/[^/]+\.test\.mjs$/ },
  { run: 'test:interop', files: /^scripts\/test\/[^/]+\.test\.ts$/ },
  // Real-browser smoke tests, kept out of `test:workers` so the unit suite never opens a browser.
  { run: 'e2e', files: /^(apps\/[^/]+|packages\/[^/]+\/[^/]+)\/test\/e2e\/[^/]+\.test\.mjs$/ },
  { run: 'dsh-passwords', files: /^vendor\/tracy\/dsh-passwords\/test\/.+\.test\.ts$/ },
  {
    run: 'standalone',
    files: /^packages\/cms\/tracy-emdash-theme-(base|business|saas)\/tests\/[^/]+\.test\.mjs$/
  }
]

/**
 * THE FOUR SUITES ARE INDEPENDENT PROCESSES, SO CI MAY RUN THEM ON DIFFERENT MACHINES — 20/09/2026.
 *
 * WHY, AS A NUMBER. Measured on run 35487509134 (`tracy-ci-02`), the one `tests` job took 36m30s
 * and split like this: `test:workers` 18m54, `tracy-emdash-theme-base` 8m08,
 * `tracy-emdash-theme-business` 8m27, everything else (interop, dsh-passwords, the coverage count)
 * under a minute. Nothing in that list needs anything another entry produced, so the wall clock was
 * a sum for no reason. Split across runners it becomes the slowest part, not the total.
 *
 * 🔒 `--part` NARROWS, IT NEVER REDEFINES. Every part below runs the SAME command this file already
 * ran for it; `checkCoverage()` still runs in every part, so a test file nobody declared is still a
 * red gate no matter which part happens to run. With no `--part` the gate behaves exactly as before
 * — that is the shape a laptop and `pnpm build:check` keep.
 *
 * ⚠ A MISSPELT PART IS RED, NOT AN EMPTY RUN. The same rule `check-all.ts` applies to `--only`, for
 * the same reason: a part that silently matches nothing reports green having tested nothing.
 */
const PARTS = [
  'workers',
  'related',
  'interop',
  'e2e',
  'standalone:base',
  'standalone:business',
  'standalone:saas',
  'vendor',
  'rest',
  'owner'
] as const
type Part = (typeof PARTS)[number]

/** `--part <name>`, optionally `workers:i/n`. Absent = run everything, as before. */
interface PartSpec {
  readonly part: Part
  /** 1-based shard index and shard count, for the parts that carry enough files to split. */
  readonly shard?: { readonly index: number; readonly of: number }
  /** `owner=<dir>`: the one owner (app, package or `scripts`) whose workers files this part runs. */
  readonly owner?: string
}

/**
 * `owner=<dir>` or `owner=<dir>:i/n` — the workers files of ONE owner, optionally one shard of them
 * (12/10/2026, Turbo). Turbo runs one task per owner and caches its result by the hash of the files
 * that owner's suite reads, so a task must test exactly its owner's files and nothing else. The
 * owner is a directory the files sit under (`apps/<app>`, `packages/<group>/<name>`, `scripts`);
 * one that owns no workers file is refused, never a green run of nothing.
 */
const OWNER_PART = /^owner=((?:apps|packages\/[a-z0-9-]+)\/[a-z0-9._-]+|scripts)(?::(\d+)\/(\d+))?$/

function parseOwnerPart(raw: string): PartSpec | string {
  const m = OWNER_PART.exec(raw)
  if (!m)
    return `bad owner part: ${raw} (owner=apps/<app>, owner=packages/<group>/<name> or owner=scripts, optionally :i/n)`
  if (m[2] === undefined) return { part: 'owner', owner: m[1] }
  const index = Number(m[2])
  const of = Number(m[3])
  if (of < 1 || index < 1 || index > of) return `bad shard ${index}/${of} on owner ${m[1]}`
  return { part: 'owner', owner: m[1], shard: { index, of } }
}

/** One `name` or `workers:i/n`, or the reason it is unusable. */
function parseOnePart(raw: string): PartSpec | string {
  if (raw === 'owner' || raw.startsWith('owner=') || raw.startsWith('owner:')) return parseOwnerPart(raw)
  const shardMatch = /^(.*):(\d+)\/(\d+)$/.exec(raw)
  const name = shardMatch ? shardMatch[1] : raw
  if (!(PARTS as readonly string[]).includes(name)) {
    return `no such part: ${name} (have: ${PARTS.join(', ')})`
  }
  if (!shardMatch) return { part: name as Part }
  const index = Number(shardMatch[2])
  const of = Number(shardMatch[3])
  if (of < 1 || index < 1 || index > of) return `bad shard ${index}/${of} on ${name}`
  if (name !== 'workers') return `part ${name} is one process; it cannot be sharded`
  return { part: name as Part, shard: { index, of } }
}

/**
 * Parse `--part` out of an argv. Exported for `scripts/test/check-tests-parts.test.ts`, which is
 * the only witness that a typo is refused rather than quietly matching nothing.
 *
 * @param argv - arguments after the script name.
 * @returns the parsed spec, `null` when no `--part` was given, or a string with the reason it is
 *   not usable — the caller decides how loudly to fail.
 */
export function parsePart(argv: readonly string[]): PartSpec | null | string {
  const at = argv.indexOf('--part')
  if (at === -1) return null
  const raw = argv[at + 1]
  if (raw === undefined || raw.startsWith('--')) return '--part needs a name'
  return parseOnePart(raw)
}

/**
 * `--part a,b,c`: one CI job runs several parts in turn (`workers:2/2,rest`). Every element goes
 * through the same check as a lone `--part`, so ONE misspelt element makes the whole run red.
 *
 * 🔒 THE SMALL SUITES LIVE ON THE LAST SHARD. `shardOf` reserves `preloadLastShardSeconds` on shard
 * `n/n` so the other shards can take more files; a job that carried `rest` on any other shard would
 * make every job disagree about who owns which file, so it is refused.
 *
 * @returns the specs in the order given, `null` when no `--part`, or the reason it is unusable.
 */
export function parseParts(argv: readonly string[]): PartSpec[] | null | string {
  const at = argv.indexOf('--part')
  if (at === -1) return null
  const raw = argv[at + 1]
  if (raw === undefined || raw.startsWith('--')) return '--part needs a name'
  const specs: PartSpec[] = []
  for (const piece of raw.split(',')) {
    const one = parseOnePart(piece)
    if (typeof one === 'string') return one
    if (specs.some((s) => s.part === one.part)) return `part ${one.part} listed twice`
    specs.push(one)
  }
  if (specs.some((s) => s.part === 'owner') && specs.length !== 1) {
    return 'an owner part runs alone; it is one Turbo task'
  }
  if (specs.some((s) => s.part === 'related') && specs.length !== 1) {
    return 'related must run alone; combining it with a full part would repeat tests'
  }
  const workers = specs.find((s) => s.part === 'workers')
  if (workers?.shard && specs.some((s) => s.part === 'rest') && workers.shard.index !== workers.shard.of) {
    return `rest must ride with the LAST workers shard (${workers.shard.of}/${workers.shard.of}), not ${workers.shard.index}/${workers.shard.of}`
  }
  return specs
}

/** Measured seconds per workers test file (`scripts/test-timings.json`), plus the `rest` preload. */
export interface Timings {
  /** Repo-relative file to seconds. */
  readonly files: Readonly<Record<string, number>>
  /** Seconds of small suites (`rest`) that always ride on the LAST shard. */
  readonly preloadLastShardSeconds: number
}

const NO_TIMINGS: Timings = { files: {}, preloadLastShardSeconds: 0 }

/**
 * The files of one shard: greedy longest-processing-time over MEASURED weights.
 *
 * 🔒 THE LIST COMES FROM THE SAME REGEX `checkCoverage()` JUDGES BY, never from a second glob. Two
 * spellings of "which files are the workers suite" is exactly how a test file stops being run while
 * both spellings still look right — the failure this file was written three times to stop.
 *
 * LPT: files sorted heaviest first (ties by path) each go to the currently lightest shard (ties by
 * lowest index). The last shard starts with `preloadLastShardSeconds` because the small suites
 * (`rest`) ride there. A file absent from the table weighs the median of the table, so a new test
 * file still lands in exactly one shard. Every job recomputes the same assignment from the same
 * inputs, which is why nothing here may depend on timing, order of `files`, or the machine.
 *
 * With no table every file weighs the same and the split is balanced by count, as round-robin was.
 *
 * @param files - every file of the group, repo-relative.
 * @param shard - 1-based index and count.
 * @param timings - measured weights; omitted = equal weights.
 * @returns the subset this shard owns; the union over all indices is `files`, with no overlap.
 */
export function shardOf(
  files: readonly string[],
  shard: { index: number; of: number },
  timings: Timings = NO_TIMINGS
): string[] {
  const known = Object.values(timings.files).sort((x, y) => x - y)
  const median =
    known.length === 0
      ? 1
      : (known[Math.floor((known.length - 1) / 2)] + known[Math.floor(known.length / 2)]) / 2
  const weight = (f: string): number => timings.files[f] ?? median
  const load = Array.from({ length: shard.of }, (_, i) =>
    i === shard.of - 1 ? timings.preloadLastShardSeconds : 0
  )
  const owned: string[][] = Array.from({ length: shard.of }, () => [])
  const order = [...new Set(files)].sort((x, y) => weight(y) - weight(x) || (x < y ? -1 : x > y ? 1 : 0))
  for (const f of order) {
    let best = 0
    for (let i = 1; i < shard.of; i++) if (load[i] < load[best]) best = i
    owned[best].push(f)
    load[best] += weight(f)
  }
  return owned[shard.index - 1].sort()
}

/** Read the committed table; a missing or unreadable file means equal weights, never a failure. */
function loadTimings(): Timings {
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, 'scripts/test-timings.json'), 'utf8')) as Partial<Timings>
    return { files: raw.files ?? {}, preloadLastShardSeconds: raw.preloadLastShardSeconds ?? 0 }
  } catch {
    return NO_TIMINGS
  }
}

/** Directories where Tracy owns tests. `vendor/` is out, except the fork we changed (BOUNDARY RULE #5). */
const OWNED = ['apps', 'scripts', 'packages', 'vendor/tracy/dsh-passwords']

/**
 * Trees that hold test files and that this gate deliberately does NOT run (read 08/10/2026, #1028).
 *
 * WHY THEY ARE NAMED. `OWNED` says what the gate walks; it cannot say what it leaves out, and a
 * reader of the list above had no way to tell these four from "tested somewhere else". `where` is
 * what each tree's own notes say today, and it says "nowhere" when that is the truth. The gate
 * prints the list on every run; `scripts/test/check-tests-environment.test.ts` keeps it honest (a
 * tree that is gone, holds no test, or moved under `OWNED` is red there).
 *
 * Adding a tree here is admitting one more suite nobody's CI runs: say where it runs instead.
 */
export const NOT_RUN_HERE: readonly { readonly tree: string; readonly where: string }[] = [
  {
    tree: 'tests/e2e-dev',
    where:
      'by hand against a deployed machine: `node tests/e2e-dev/run.mjs --env dev|staging` (skill ' +
      '`staging-check`); it needs a live deployment and spends model turns, so no CI job runs it'
  },
  {
    tree: 'vendor/tracy/dsh-better-sidebar',
    where:
      'nowhere in this repo. The tree carries upstream’s `.github/workflows/ci.yml` (`pnpm test`, ' +
      'vitest), which GitHub only runs in a repository whose root holds it; the `-tracy.N` edits made ' +
      'here are tested by hand, `pnpm test` in that folder'
  },
  {
    tree: 'vendor/wordpress/tracy-wordpress-theme',
    where:
      'nowhere in this repo. Its home is JoomlArt-Products/tracy-wordpress-theme, with its own ' +
      '`npm install` and `npm test` run by hand there (`IMPORT-NOTE.md`); this tree is a pinned copy'
  },
  {
    tree: 'vendor/tracy/dsh-subscriptions',
    where:
      'nowhere. No CI is declared for it here or in its `IMPORT-NOTE.md`; the recorded runs are by ' +
      'hand, `node --test test/*.test.mjs` in that folder, after each `-tracy.N` patch'
  }
]
const IGNORED_DIR = new Set(['node_modules', '.git', '.astro', 'dist', 'lib', '.claude'])

/**
 * `strict`: a directory that cannot be listed throws instead of being skipped. A caller that
 * turns "no file found" into "nothing to run" (`run-clock-shift.mjs`) must not get a short list.
 */
export function walk(dir: string, out: string[] = [], strict = false): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (strict) throw new Error(`cannot list ${dir}: ${(error as Error).message}`)
    return out
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORED_DIR.has(e.name)) walk(join(dir, e.name), out, strict)
    } else if (/\.test\.(mjs|ts)$/.test(e.name)) out.push(join(dir, e.name))
  }
  return out
}

/** What `coverageProblems` found: files no group runs, and files more than one group claims. */
export interface CoverageProblems {
  readonly orphans: string[]
  readonly ambiguous: { readonly file: string; readonly owners: string[] }[]
}

/**
 * Count the groups that claim each test file. Exactly one is the only good answer.
 *
 * 🔒 IT COUNTS, IT DOES NOT ASK "IS THERE ONE" — changed 05/10/2026. Until then this was
 * `GROUPS.some(...)`, which catches a file nobody runs and is blind to a file two groups claim,
 * while the gate printed "each file belongs to exactly one declared group" either way. Two owners
 * is not harmless duplication: `shardOf` and the `--part` rows are built from these same regexes,
 * so a file two groups match runs under two commands with two toolchains, and the day one of them
 * is narrowed everyone believes the other still has it. No such file existed when this was written;
 * the claim was simply wider than the check.
 *
 * @param files - repo-relative test files.
 * @param groups - the run groups to judge by; `GROUPS` unless a test passes its own.
 * @returns the files with no owner, and the files with several (each with every owner's `run`).
 */
export function coverageProblems(
  files: readonly string[],
  groups: readonly CoverageGroup[] = GROUPS
): CoverageProblems {
  const orphans: string[] = []
  const ambiguous: { file: string; owners: string[] }[] = []
  for (const file of files) {
    const owners = groups.filter((g) => g.files.test(file)).map((g) => g.run)
    if (owners.length === 0) orphans.push(file)
    else if (owners.length > 1) ambiguous.push({ file, owners })
  }
  return { orphans, ambiguous }
}

/**
 * A test file that belongs to no group is a suite nobody runs — the same failure, the fourth time.
 *
 * Exported so the count can be run over the real tree with no database and no suite
 * (`import { checkCoverage } from './scripts/check-tests.ts'`); `main()` still calls it in every part.
 */
export function checkCoverage(): void {
  const found = OWNED.flatMap((d) => walk(join(ROOT, d))).map((f) => f.slice(ROOT.length + 1))
  const { orphans, ambiguous } = coverageProblems(found)
  if (orphans.length) {
    process.stderr.write(
      `check-tests: ${String(orphans.length)} test file(s) run by NO group. Add each to GROUPS ` +
        `AND to the matching command — a suite nobody calls is exactly what this gate exists to stop:\n` +
        orphans.map((o) => `  ${o}\n`).join('')
    )
  }
  if (ambiguous.length) {
    process.stderr.write(
      `check-tests: ${String(ambiguous.length)} test file(s) are claimed by MORE THAN ONE group. Narrow the ` +
        `regexes in GROUPS until each file has exactly one owner — two owners means two commands run ` +
        `it, and nobody notices when one of them stops:\n` +
        ambiguous.map((a) => `  ${a.file} — ${a.owners.join(', ')}\n`).join('')
    )
  }
  if (orphans.length || ambiguous.length) process.exit(1)
  process.stdout.write(
    `check-tests: ${String(found.length)} test files, each owned by exactly one declared group.\n` +
      `check-tests: ${String(NOT_RUN_HERE.length)} trees hold tests this gate does NOT run ` +
      `(NOT_RUN_HERE in scripts/check-tests.ts says where each runs): ` +
      `${NOT_RUN_HERE.map((t) => t.tree).join(', ')}\n`
  )
}

/** A skipped test, with its reason. Matched by test name, not by file. */
interface Skipped {
  /** A name fragment enough to identify it, used as a regex for `--test-skip-pattern`. */
  readonly pattern: string
  /** Why it is skipped. */
  readonly why: string
}

const SKIPPED: readonly Skipped[] = [
  {
    pattern: 'targets the current package version from a 2\\.6\\.4 baseline',
    why:
      'The upstream test asserts the version matches /^2\\.6\\.\\d+$/. the Tracy build is ' +
      '`2.6.6-tracy.2` — the `-tracy.N` suffix is our release convention (`.npmrc` explains why ' +
      'this package had to live in a private registry). The test is right for upstream and wrong for the fork; ' +
      'fixing it means editing the code of someone else, and we have not decided whether to send that change upstream.'
  },
  {
    pattern: 'subuser download requires both the download grant',
    why:
      'gateway-download.test.ts:159 — expects 200, gets 403. Inherited debt: red exactly the same at `cde8beb`. ' +
      'It sits right in the file-download permission area the seat door will touch, so it must be understood ' +
      'before the three permission axes of ADR 0001 go live — not deleted.'
  },
  {
    pattern: '并行 SSE 连接互不影响对方工作区快照',
    why:
      'Two parallel SSE connections must not affect the workspace snapshot of the other. Inherited debt, ' +
      'red exactly the same at `cde8beb`. The eleven other `Issue #20` tests in the same file are green, so ' +
      'the mux filter works in general — the breakage is narrower than that.'
  }
]

/**
 * Tests that only fail because the process itself runs inside a container, skipped ONLY there.
 *
 * WHY THIS LIST IS SEPARATE FROM `SKIPPED`. That list is a standing admission that something is
 * broken and we choose not to look; it is allowed to get shorter and nothing else. This one
 * admits something different — the test is fine, the machine is wrong for it — and it must not
 * cost the test its witness on every other machine. On a laptop, or on a runner installed on the
 * host rather than in Docker, everything below still runs.
 *
 * MEASURED 2026-09-08, the first green-ish run on `tracy-build-01`: 25 of 26 gates passed and
 * `tests` failed on one assertion, `'docker' !== 'git'`. `detectRuntime()` in
 * `vendor/tracy/dsh-passwords/src/update.ts` probes `/.dockerenv` before it looks at the directory it
 * was handed, and the CI runner IS a container (`tracy-runner` on contabo2) — so the answer is
 * 'docker' no matter what the test builds in a temp directory. The test reads the real `/`; that
 * is a hermeticity bug in someone else's test, and fixing it means editing `vendor/` and
 * republishing under `-tracy.N` (RULE #5). That is a decision, not a chore, so it is not made
 * here in passing.
 */
const SKIPPED_IN_CONTAINER: readonly Skipped[] = [
  {
    pattern: 'source archives without \\.git still use the npm update runtime',
    why:
      'update.test.ts:168 — asserts detectRuntime() answers `git` for a source tree with no ' +
      '.git. Inside a container `/.dockerenv` exists, that probe runs first, and the answer is ' +
      '`docker`. Nothing about the fork is broken; the test simply cannot be run from inside ' +
      'the thing it is trying to rule out.'
  },
  {
    pattern: 'detectRuntime 把调用方 env 传入 npm 探测子进程',
    why:
      'update.test.ts:208 — asserts detectRuntime() answers `npm-global` for an install root its ' +
      'fake npm reports. Same probe, same order: inside a container `/.dockerenv` answers first ' +
      'and the result is `docker` before npm is ever asked.'
  }
]

/** Inside a container? The same probe `detectRuntime()` uses, asked for the same reason. */
const inContainer = existsSync('/.dockerenv')

/** Install the vendor package's dependencies if missing. */
export function ensureDeps(): void {
  if (existsSync(join(PKG, 'node_modules'))) return
  process.stdout.write('check-tests: vendor/tracy/dsh-passwords has no node_modules — npm ci\n')
  const install = spawnSync('npm', ['ci'], { cwd: PKG, stdio: 'inherit' })
  if (install.status !== 0) {
    process.stderr.write('check-tests: npm ci failed\n')
    process.exit(1)
  }
}

/**
 * Try to open a browser the same way the suite opens it: the machine's `chrome` channel first, Playwright's
 * Chromium second (`tools/qa-browser.mjs`). `createRequire` from the package's own directory, not a bare
 * `import('playwright')`: a bare specifier inside `node -e` resolves against the process's working
 * directory, and a probe must never depend on who called it.
 */
function browserOpens(dir: string): { ok: boolean; why: string } {
  const probe = spawnSync(
    'node',
    [
      '-e',
      `const { createRequire } = require('node:module');` +
        `const pw = createRequire(${JSON.stringify(join(dir, 'probe.cjs'))})('playwright');` +
        `pw.chromium.launch({ channel: 'chrome' }).catch(() => pw.chromium.launch())` +
        `.then((b) => b.close()).then(() => process.exit(0))` +
        `.catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });`
    ],
    // 🔒 KEEP WHAT PLAYWRIGHT SAYS. This was `stdio: 'ignore'`, which threw away the one line that
    // names the cause — `libglib-2.0.so.0: cannot open shared object file` — and left the refusal
    // DESCRIBING a typical error instead of QUOTING this machine's. Measured on run 35257951982:
    // the diagnosis was right, and it was right by guessing well rather than by reading.
    { cwd: dir, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  )
  return { ok: probe.status === 0, why: `${probe.stderr ?? ''}` }
}

/** The lines a reader needs out of a launch failure; the full trace is two 4 KB argv dumps. */
const DECISIVE = /error while loading shared libraries|exitCode=|executable doesn't exist|ENOENT|timed out/i
function decisive(why: string): string[] {
  const hits = why
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && DECISIVE.test(line))
    .slice(0, 3)
  // Never claim silence the gate cannot know: an unrecognised failure is the one where the last
  // lines matter most, and "(said nothing)" tells the reader to stop looking at exactly that moment.
  if (hits.length > 0) return hits
  const all = why
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  return all.length === 0 ? ['(playwright printed nothing to stderr)'] : all.slice(-3)
}

/**
 * Can system libraries be installed WITHOUT asking anyone anything?
 *
 * 🔒 WHY ASK FIRST, NOT A BLIND `--with-deps`. On Linux, `playwright install --with-deps`
 * runs `apt-get update && apt-get install …`; if the process is not root, Playwright wraps that
 * command in `sudo --` (`transformCommandsForRoot`, playwright-core 1.63). On a CI runner with no
 * tty, sudo fails at once and the whole run is lost to a message that says nothing about the code. On
 * someone's machine with a tty it is worse: the test gate suddenly asks for the root password mid-run.
 * `sudo -n true` answers exactly the question that matters — "can it install without asking anyone" —
 * before we agree to install.
 *
 * Outside Linux, `registry.installDeps` is a no-op (it only has branches for linux and win32), so
 * `--with-deps` on macOS costs nothing and breaks nothing: return true so the path has one branch.
 */
function canInstallSystemDeps(): boolean {
  if (process.platform !== 'linux') return true
  if (process.getuid?.() === 0) return true
  return spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' }).status === 0
}

/**
 * A browser for a suite that measures one, installed only when the machine has none.
 *
 * WHY THE GATE HANDLES IT, NOT A LINE IN THE WORKFLOW. The package's `pnpm install` fetches the npm
 * package `playwright`, NOT the browsers — those live in the machine's cache (`~/.cache/ms-playwright`),
 * and the CI runner runs in a container without that cache. Measured on run 35215586580 (17/09):
 * `build check (tests)` red with `browserType.launch: Executable doesn't exist at
 * …/chromium_headless_shell-1243/…`, right after the line `tracy-emdash-theme-base has no node_modules`.
 * The suite was not broken, the machine running it lacked something — and this gate already installs
 * `node_modules` for exactly that reason, so leaving the browser to a YAML line splits one condition
 * across two places, of which only one is right.
 *
 * 🔒 PROBE FIRST, INSTALL SECOND — and the probe is the same path the suite opens a browser by
 * (`tools/qa-browser.mjs`: the machine's `chrome` channel first, Playwright's Chromium second). A machine
 * that can open one downloads nothing: a laptop with Chrome runs this gate without swallowing 150 MB,
 * and a blank runner downloads exactly once per run. A blind install would make everyone pay that price
 * to fix one machine.
 *
 * ⚠ DOWNLOADING THE BINARY IS NOT HAVING A BROWSER — fixed 2026-09-18, after the patch above fixed
 * only half. Measured on run 35252657157 (job 105308506613, PR #151, a PR that touched not one line of
 * `packages/cms/`): `playwright install chromium` finished, the log clearly says
 * `chromium_headless_shell-1243 downloaded`, then that very binary died on launch:
 *   `chrome-headless-shell: error while loading shared libraries: libglib-2.0.so.0: cannot open
 *    shared object file` → `exitCode=127`
 * `playwright install` downloads the binary; the system libraries (`libglib2.0`, `libnss3`, `libnspr4`, …)
 * are the job of `install-deps`, and the `tracy-build-01` container does not ship them. So the old loop
 * could never get out by itself: probe fails → install → still fails, each run re-downloading 94 MB to
 * die the same way. `--with-deps` installs the libraries FIRST and then downloads the binary
 * (`installBrowsers` in playwright-core 1.63), so one pass is enough.
 *
 * 🔒 AND PROBE AGAIN AFTER INSTALLING. The costliest mistake of the previous version was not the
 * missing `--with-deps` — it was the gate trusting an install that exited 0 to mean the machine was
 * ready, then handing a still-broken machine to the suite. The failure then showed up as `1 !== 3` in
 * `visual.test.mjs` plus a wall of Playwright log: it read exactly like a red test, while no test was
 * red at all. The second probe turns it into one line naming exactly what is missing and the exact
 * command to run on that machine.
 */
function ensureBrowser(dir: string, rel: string): void {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const declared = { ...manifest.dependencies, ...manifest.devDependencies }
  if (!declared.playwright) return

  if (browserOpens(dir).ok) return

  const withDeps = canInstallSystemDeps()
  process.stdout.write(
    `check-tests: ${rel} — playwright has no browser that opens, installing chromium` +
      `${withDeps ? ' with system libraries (--with-deps)' : ' (WITHOUT --with-deps: system libraries cannot be installed without asking for a password)'}\n`
  )
  const install = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'install', ...(withDeps ? ['--with-deps'] : []), 'chromium'],
    { cwd: dir, stdio: 'inherit' }
  )
  if (install.status !== 0) {
    process.stderr.write(`check-tests: installing a browser for ${rel} failed\n`)
    process.exit(1)
  }

  const after = browserOpens(dir)
  if (after.ok) return
  const lines = decisive(after.why)
  // 🔒 SAY IT WHERE CI IS READ. On the Actions page a job that ran no test and a job whose tests
  // failed are the same red tick, and the log body is exactly what nobody scrolls to. One `::error`
  // surfaces at the top of the run and travels into the notification.
  if (process.env.GITHUB_ACTIONS) {
    process.stdout.write(
      `::error title=CI runner cannot open a browser — the suite did not run::${rel}: ${lines[0].replace(/[\r\n]+/g, ' ').slice(0, 300)}\n`
    )
  }
  process.stderr.write(
    `check-tests: ${rel} — installed, but the browser still does not open. The binary is there; it is the ` +
      `MACHINE that lacks libraries, not a broken suite — not one test has run.\n` +
      `${lines.map((line) => `check-tests:   ${line}`).join('\n')}\n` +
      `check-tests: fix it on that machine, as root: npx playwright install-deps chromium\n` +
      `check-tests: (runners tracy-ci-01..04 do NOT run as root — measured 18/09 on run 35257951982, ` +
      `the gate's install-deps branch cannot be reached. The image is built from /opt/tracy-runner/compose.yml on ` +
      `the runner host; no commit in this repo can fix it.)\n`
  )
  process.exit(1)
}

/**
 * A DATABASE FOR THE 28 TEST FILES THAT NEED ONE — and the reason is a number, not a preference.
 *
 * 🔒 28 FILES UNDER `apps/tracy-web/test/` OPEN WITH `{ skip: url ? false : 'set TEST_DATABASE_URL' }`,
 * AND NOTHING SET IT. Not CI — `TEST_DATABASE_URL` appears in no file under `.github/workflows/` —
 * and not a local run either: `deploy/.env` has carried the right URL since the compose stand was
 * written, and no gate ever read it. node prints `# SKIP`, exits 0, and the tick is green. Measured
 * on this machine at 955ce0e2f: 2218 pass / **340 skipped** as the gate ran it, against 2556 pass /
 * 2 FAIL with the variable supplied. Those two reds had been on `develop` since 16/09, invisible,
 * on the create-from-inspiration surface a customer uses.
 *
 * THIS IS THE SAME SHAPE THIS FILE WAS WRITTEN TO REFUSE, FOR THE FOURTH TIME — after the Worker
 * suite nothing called, `seat-door-interop.test.ts` missed by a glob, and 31 EmDash files no run
 * group owned. `checkCoverage()` closed three of them by asking "does some group claim this file";
 * it cannot ask "did the tests inside it RUN". A gate that reports the same green for *ran* and
 * *did not run* is not a gate.
 *
 * 🔒 WHY THE GATE SUPPLIES IT RATHER THAN A LINE OF YAML — the argument is already written above
 * `ensureBrowser`, and it is the same one: splitting a condition across two places gets one of them
 * right. A YAML `services:` block fixes CI and leaves every laptop skipping 340 tests, which is the
 * state that let two reds live on `develop` for two days. Here, both run the same way.
 *
 * Three sources, in order of how little they cost: the variable if someone already exported it, the
 * dev cluster in `deploy/.env` (`pnpm -w compose up -d postgres`, and the URL it prints is already
 * in that file), then a throwaway container removed on exit. Only if all three are unavailable does
 * this fail — and it FAILS, loudly, because "no database" must not read as "nothing to run".
 *
 * The first two are BORROWED: someone else owns them, so we read them and never remove them. Only
 * the throwaway is ours, and it is removed by the id we captured, never by name — see `./test-database`.
 *
 * `--database owned` SKIPS THE BORROWED TWO (05/10/2026). It is what the `pre-push` hook passes when
 * asked for a database-backed run (`TRACY_PRE_PUSH_POSTGRES=1`, `scripts/check-push.mjs`): a hook
 * runs in whatever shell pushed, and the `TEST_DATABASE_URL` exported there may be another session's
 * stand or a customer's. In that mode the inherited variable and `deploy/.env` are neither read nor
 * probed, and the suites get the url of the container this invocation created or the gate fails.
 */
const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Does a real connection open and a real statement return? Not "is something listening on that
 * port" — a TCP probe says yes to the MySQL of a customer site on a neighbouring port, and the
 * suite then fails on its first query with a message about authentication.
 *
 * Runs from `apps/tracy-web` because that is where `pg` is declared; `scripts/` has no such
 * dependency and resolving it from the root would depend on how pnpm chose to hoist today.
 */
function databaseAnswers(url: string): boolean {
  const probe =
    "const pg=require('pg');" +
    'const c=new pg.Client({connectionString:process.env.PROBE_URL,connectionTimeoutMillis:3000});' +
    "c.connect().then(()=>c.query('select 1')).then(()=>c.end())" +
    '.then(()=>process.exit(0)).catch(()=>process.exit(1))'
  return (
    spawnSync(process.execPath, ['--input-type=commonjs', '-e', probe], {
      cwd: join(ROOT, 'apps/tracy-web'),
      env: { ...process.env, PROBE_URL: url },
      stdio: 'ignore'
    }).status === 0
  )
}

/** The URL the local compose stand prints — already correct in `deploy/.env`, never read until now. */
function urlFromDeployEnv(): string | undefined {
  try {
    const line = /^TEST_DATABASE_URL=(.+)$/m.exec(readFileSync(join(ROOT, 'deploy/.env'), 'utf8'))
    return line?.[1].trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Our own container id, or null when this process is running on the host.
 *
 * `/.dockerenv` is the marker every docker container carries; the hostname is the short id unless
 * somebody overrode it, and `docker inspect` is what settles that — a guess that does not inspect
 * is how this would quietly take the wrong branch on a compose service with a friendly hostname.
 */
function ownContainer(): string | null {
  if (!existsSync('/.dockerenv')) return null
  const name = hostname()
  if (!/^[0-9a-f]{12,64}$/.test(name)) return null
  return spawnSync('docker', ['inspect', '--format', '{{.Id}}', name], { stdio: 'ignore' }).status === 0
    ? name
    : null
}

/** The docker IO the lifecycle borrows in production: `spawnSync`, capturing output for diagnosis. */
const dockerIO: ThrowawayIO = {
  run: (args) => {
    const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  },
  probe: databaseAnswers,
  sleep
}

/**
 * The one throwaway THIS invocation owns, held so the exit hook can remove exactly it. Never a
 * shared name: on a daemon shared by many CI runners, removing a fixed name deletes whichever
 * invocation's live database happens to hold it right now.
 */
let owned: Throwaway | null = null

/** Last resort: our own postgres, on a port nothing in `deploy/.env` claims, gone when we exit. */
function startThrowaway(): string | undefined {
  if (spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
    process.stderr.write(
      'check-tests: `docker version` failed — no docker here, or no access to its daemon.\n'
    )
    return undefined
  }
  const us = ownContainer()
  const name = throwawayName()
  const url = `postgres://tracy:tracy@127.0.0.1:${String(THROWAWAY_PORT)}/tracy`
  process.stdout.write(
    `check-tests: no database answers — starting a throwaway ${name} ` +
      `(${us === null ? 'port published on 127.0.0.1' : `sharing the network of container ${us}`})\n`
  )

  // create → start → wait. Ownership is published via `onAcquire` the instant a valid id is captured
  // — before `start`, so the exit/signal hooks below can remove OUR id even if startup throws. We
  // never `rm` by name and never remove a container we did not make, so a concurrent invocation's
  // database is untouched.
  const handle = beginThrowaway(dockerIO, us, name, url, {
    onAcquire: (h) => {
      owned = h
    }
  })
  if (handle.url !== undefined) return handle.url

  if (handle.outcome === 'create-failed') {
    // Nothing was created under our name; there is nothing of ours to remove.
    process.stderr.write(
      `check-tests: could not create the throwaway container ${name}.\n` +
        `${handle.detail.trim() || '(docker printed nothing)'}\n`
    )
    return undefined
  }

  // 🔒 SILENT SECONDS ARE WORTH NOTHING TO WHOEVER READS THIS NEXT. `start-failed` and `timeout` are
  // different failures — the port already bound and the image never answering — and the container's
  // own last words separate a broken image from an unreachable address. We own it, so read it, then
  // remove OUR id (the exit hook would back this up).
  if (handle.id !== null) {
    const logs = spawnSync('docker', ['logs', '--tail', '15', handle.id], { encoding: 'utf8' })
    const said = (logs.stdout ?? '') + (logs.stderr ?? '') || handle.detail.trim() || '(no logs at all)'
    process.stderr.write(
      handle.outcome === 'start-failed'
        ? `check-tests: ${name} failed to start (port ${String(THROWAWAY_PORT)} may be held by another ` +
            `invocation — that is NOT a reason to remove its container). Last lines:\n${said}\n`
        : `check-tests: ${name} did not answer within 60 seconds. Its own last lines:\n${said}\n`
    )
    handle.remove()
  }
  return undefined
}

process.on('exit', () => {
  // Remove ONLY the container this invocation created, by the id it captured, idempotently. This is
  // the whole fix: the old `rm -f <fixed-name>` here would delete another invocation's live database.
  owned?.remove()
})

/**
 * Best-effort cleanup on Ctrl-C / termination for OUR container only, then exit with the conventional signal status so the exit code
 * is honest. `remove()` targets the captured id (never a name), so this cannot touch another runner.
 *
 * ⚠ CANCELLATION LIMITATION, STATED HONESTLY. The orchestration is synchronous `spawnSync`, which
 * blocks the event loop, so a signal that arrives mid-child is only delivered to this handler once
 * that child returns — the child in the foreground group receives it directly meanwhile. And SIGKILL
 * cannot be caught at all: a `kill -9` (or an OOM kill) leaves the throwaway behind, removable only
 * by its recorded container id. Within those limits, an owned container is still cleaned up.
 */
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    owned?.remove()
    process.exit(sig === 'SIGINT' ? 130 : 143)
  })
}

/** Exported for `scripts/ci/turbo-setup.mjs`, which traces the same suites against the same database. */
export function ensureDatabase(mode: DatabaseMode): void {
  const gated = OWNED.flatMap((d) => walk(join(ROOT, d))).filter((f) =>
    isDatabaseGated(readFileSync(f, 'utf8'))
  )
  // Nobody needs one: say so rather than dragging a container along for nothing. `owned` does not
  // take this exit: it was asked for by name, and returning here would leave the inherited url in
  // the environment of whatever runs next.
  if (mode === 'auto' && gated.length === 0) return

  // Borrowed sources first, decided before any container is touched: an exported variable, then the
  // dev cluster in `deploy/.env`. Only when none is available do we build one of our own. `owned`
  // goes straight to our own and never calls the first three functions.
  const outcome = prepareDatabase(
    mode,
    {
      exported: () => process.env.TEST_DATABASE_URL,
      deployEnv: urlFromDeployEnv,
      answers: databaseAnswers,
      throwaway: startThrowaway
    },
    process.env
  )
  if (outcome.ok && outcome.source === 'exported') {
    process.stdout.write(
      `check-tests: ${String(gated.length)} test files need a database — using the exported TEST_DATABASE_URL.\n`
    )
    return
  }
  if (!outcome.ok && outcome.reason === 'exported-unreachable') {
    process.stderr.write(
      `check-tests: TEST_DATABASE_URL is set but the connection CANNOT be opened — ${outcome.url.replace(/:[^:@/]*@/, ':***@')}\n` +
        `check-tests: this is a wrong address, not a machine without a database; fix the variable rather than skipping.\n`
    )
    process.exit(1)
  }
  if (outcome.ok && outcome.source === 'deploy') {
    process.stdout.write(
      `check-tests: ${String(gated.length)} test files need a database — using the dev stack in deploy/.env.\n`
    )
    return
  }
  if (outcome.ok) {
    process.stdout.write(
      mode === 'owned'
        ? `check-tests: ${String(gated.length)} test files need a database — using this run's own container (--database owned).\n`
        : `check-tests: ${String(gated.length)} test files need a database — using a throwaway container.\n`
    )
    return
  }

  if (mode === 'owned') {
    process.stderr.write(
      `check-tests: --database owned could not start a database of its own, so no test ran.\n` +
        `check-tests:   it needs a working docker, and port ${String(THROWAWAY_PORT)} on 127.0.0.1 free — another run's\n` +
        `check-tests:   container holding that port is left alone, never removed; wait for it and run again.\n` +
        `check-tests:   TEST_DATABASE_URL and deploy/.env are NOT used in this mode, on purpose: drop the flag\n` +
        `check-tests:   to borrow one of them.\n`
    )
    process.exit(1)
  }

  // 🔒 SAY IT WHERE CI IS READ. Same reason as `ensureBrowser`: on the Actions page a job that ran
  // no test and a job whose tests failed are one red tick, and nobody scrolls the body.
  if (process.env.GITHUB_ACTIONS) {
    process.stdout.write(
      `::error title=No database — ${String(gated.length)} test files would SKIP THEMSELVES::` +
        `check-tests stops instead of printing green for a suite that did not run\n`
    )
  }
  process.stderr.write(
    `check-tests: ${String(gated.length)} test files start with \`skip: set TEST_DATABASE_URL\`, and none ` +
      `of the three sources could provide a database.\n` +
      `check-tests:   1. export TEST_DATABASE_URL=…\n` +
      `check-tests:   2. start the dev stack: docker compose -f deploy/compose.yml up -d postgres (the URL is already in deploy/.env)\n` +
      `check-tests:   3. let the gate start a throwaway container — needs a working docker\n` +
      `check-tests: running INSIDE a container, source 3 shares that container's own network namespace\n` +
      `check-tests: (\`--network container:<id>\`) — publishing a port on 127.0.0.1 would land on the HOST's loopback,\n` +
      `check-tests: not this container's, and nothing would say so: it would just never connect.\n` +
      `check-tests: the gate is RED here on purpose. Skipping would print "# SKIP" for 340 tests, node would exit 0, and the tick would stay green.\n`
  )
  process.exit(1)
}

/**
 * THE DATABASE SKIP — an explicit mode, off unless asked for (16/10/2026, anh David / SRE).
 *
 * WHY. A routine pull request into `develop` no longer pays for the ~150 workers test files that
 * need a PostgreSQL unless it carries the label `ci:integration`. The release pull requests, the
 * nightly and manual runs never turn this on. `plan-ci.mjs` decides per pull request (it reads the
 * labels) and passes the decision to the rows as `TRACY_TESTS_SKIP_DB=1`; at a desk the same thing
 * is `--skip-db-gated`.
 *
 * WHAT IT LEAVES OUT: the files of the `test:workers` group that mention `TEST_DATABASE_URL`, by the
 * very predicate `ensureDatabase` counts them with (`isDatabaseGated`). Nothing else: the unit tests of
 * the same shard still run, and so do interop, the fork's suite, the EmDash themes and e2e.
 *
 * 🔒 NEVER SILENT. Every run that drops files prints how many, names them, says how to get them back
 * and, on Actions, repeats it as a `::notice::` and in the job summary.
 *
 * 🔒 THE SWITCH IS CONSUMED HERE AND NOT PASSED ON. `takeDatabaseSkip` reads the variable once and
 * deletes it from this process, so no test process inherits it: `check-tests-environment.test.ts`
 * and its neighbours spawn this very gate, and a skip they did not ask for would change what they
 * assert. Turbo hashes the variable BEFORE this runs (`env` of the owner tasks that hold a gated
 * file), which is what keeps a run that skipped from being served as one that did not.
 *
 * 🔒 NO DATABASE IS PROVISIONED FOR A SKIPPING RUN, except for the one part that still needs it: e2e
 * (the own-domain pilot asks for `TEST_DATABASE_URL` and is red without it). A whole run with no
 * `--part` includes e2e, so it provisions as before.
 */
let taken: boolean | null = null

/**
 * Read the switch once, remember it, and remove the variable from this process's environment.
 *
 * @param flag - whether `--skip-db-gated` was given on the command line.
 * @throws when the variable is neither `1`, `0` nor unset: a value we cannot read is not a guess.
 */
export function takeDatabaseSkip(flag = false): boolean {
  if (taken !== null) return taken
  const asked = skipDatabaseRequested(flag ? [SKIP_DB_FLAG] : [], process.env)
  if ('error' in asked) throw new Error(asked.error)
  taken = asked.on
  delete process.env[SKIP_DB_ENV]
  return taken
}

/** Is the skip on for this process? Reads (and takes) the variable on first use. */
export function databaseSkipOn(): boolean {
  return takeDatabaseSkip()
}

/** Test seam: forget what was taken, so a test can take the switch again. */
export function forgetDatabaseSkip(): void {
  taken = null
}

const readRepoFile = (file: string): string => readFileSync(join(ROOT, file), 'utf8')

/**
 * Does this run need a database provisioned? Always, unless the skip is on; with the skip on, only
 * when a part that still reads one runs — e2e, or the whole gate (no `--part`), which contains it.
 */
export function databaseWanted(skip: boolean, specs: readonly { readonly part: string }[] | null): boolean {
  return !skip || specs === null || specs.some((spec) => spec.part === 'e2e')
}

/** The files that run and the ones the skip leaves out, for workers files given by repo-relative path. */
export function splitWorkers(
  files: readonly string[],
  skip = databaseSkipOn(),
  read: (file: string) => string = readRepoFile
): { run: string[]; dropped: string[] } {
  return splitDatabaseGated(files, skip, read)
}

/** Say, where a person and Actions will both read it, which files this run left out and why. */
function announceDatabaseSkip(where: string, dropped: readonly string[]): void {
  if (dropped.length === 0) return
  const how =
    `unset ${SKIP_DB_ENV} / drop ${SKIP_DB_FLAG} to run them; on a pull request into develop add the ` +
    `label ${INTEGRATION_LABEL}`
  const text = `${String(dropped.length)} workers test file(s) that read ${DATABASE_MARK} were left out of ${where}: ${how}`
  process.stdout.write(`check-tests: ${text}\n`)
  process.stdout.write(`check-tests: left out (${String(dropped.length)}):\n`)
  for (const file of dropped) process.stdout.write(`check-tests:   - ${file}\n`)
  if (process.env.GITHUB_ACTIONS) process.stdout.write(`::notice title=database tests skipped::${text}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Database tests skipped (${where})\n\n${text}.\n\nThe release pull requests, the nightly and manual runs always run them.\n\n`
    )
  }
}

/**
 * The workers suite, whole or one shard of it.
 *
 * 🔒 THE WHOLE-SUITE PATH STILL RUNS THE `test:workers` SCRIPT — the command `GROUPS` names and the
 * one a laptop runs, read out of `package.json` (`reportedScript`) with only the second reporter
 * added. Only a shard builds its own argv, and it builds it from the group's regex, so the two
 * spellings cannot drift into "this file is in the glob but in no shard".
 */
/**
 * A browser for the gated suites that open one — and `test:workers` is one of them.
 *
 * 🔒 THIS WAS A FAIL-OPEN, AND ONLY A FRESH MACHINE COULD SHOW IT. `ensureBrowser` was called for
 * the two standalone EmDash suites and for nothing else, yet `test:workers` contains browser tests
 * too: `apps/tracy-host/test/capture.test.mjs` and
 * `packages/site/tracy-add-site/test/e2e/add-site-wizard.test.mjs`. On the CI runners those passed
 * for a reason that is not a reason — the same container had run the EmDash suites earlier, and
 * `playwright install` had left chromium in `~/.cache/ms-playwright`, which every package on that
 * machine then shares. The gate was green off another suite's leftovers.
 *
 * Measured 21/09/2026 on `j-static-01`, a runner container minutes old:
 *   browserType.launch: Executable doesn't exist at
 *   …/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/…
 * Four tests red, in a shard whose own code was fine.
 *
 * ⚠ THE LIST IS SCANNED, NOT TYPED. A hand-kept list of "packages that need a browser" is the
 * thing that goes stale silently — the failure above IS that shape. Every gated package is asked
 * whether it declares `playwright`; `ensureBrowser` then no-ops for the ones that do not, and for
 * the ones whose browser already opens. The download is once per machine, not once per package:
 * the cache is the user's, not the package's.
 */
export function ensureWorkersBrowser(): void {
  const roots = [join(ROOT, 'apps'), join(ROOT, 'packages')]
  const dirs: string[] = []
  for (const root of roots) {
    let level1
    try {
      level1 = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const a of level1) {
      if (!a.isDirectory()) continue
      const first = join(root, a.name)
      if (existsSync(join(first, 'package.json'))) dirs.push(first)
      let level2
      try {
        level2 = readdirSync(first, { withFileTypes: true })
      } catch {
        continue
      }
      for (const b of level2) {
        if (!b.isDirectory()) continue
        const second = join(first, b.name)
        if (existsSync(join(second, 'package.json'))) dirs.push(second)
      }
    }
  }
  for (const dir of dirs) ensureBrowser(dir, dir.slice(ROOT.length + 1))
}

/** Every file of the `test:workers` group, from the same regex `checkCoverage()` uses. */
export function workersFiles({ strict = false } = {}): string[] {
  const group = GROUPS.find((g) => g.run === 'test:workers')
  if (!group) throw new Error('GROUPS no longer declares test:workers')
  return OWNED.flatMap((d) => walk(join(ROOT, d), [], strict))
    .map((f) => f.slice(ROOT.length + 1))
    .filter((f) => group.files.test(f))
    .sort()
}

/** Seconds since `started`, three decimals, for the `tracy-test-timing` lines. */
function wallSeconds(started: bigint): string {
  return (Number(process.hrtime.bigint() - started) / 1e9).toFixed(3)
}

/**
 * The argv of one workers shard: the flags of `test:workers`, the usual reporter, and beside it the
 * reporter that lists what was not run and how long each file took. Exported so a test can pin that
 * the three flags of `test:workers` are still there.
 */
export function workersShardArgs(files: readonly string[]): string[] {
  return ['--test', '--test-timeout=120000', '--test-force-exit', ...reporterArgs(), ...files]
}

/**
 * A `node --test …` package script as an argv with the second reporter in it, so the gate can run
 * the script's own flags and globs and still list what was not run.
 *
 * WHY NOT `pnpm run <script>`. node reads no option after the first file, so a reporter cannot be
 * appended to a script, and `NODE_OPTIONS` would hand it to every node process the tests themselves
 * start. The script is parsed against the one shape this gate knows (`node --test`, `--test-*`
 * flags, then file globs, which node expands itself); a script that changed shape is refused by
 * name rather than run unlisted. Same rule as `vendorRuns`.
 */
export function reportedScript(
  where: string,
  name: string,
  scripts: Readonly<Record<string, unknown>>
): string[] | { error: string } {
  const script = scripts[name]
  const m =
    typeof script === 'string'
      ? /^node --test((?: --test-[a-z-]+(?:=[^\s"'`$;&|<>]+)?)*)((?: (?!-)[\w@.*/-]+)+)$/.exec(script.trim())
      : null
  if (m === null) {
    return {
      error:
        `${where}: script "${name}" is ${JSON.stringify(script ?? null)}, not ` +
        `\`node --test [--test-… flags] <globs>\` — update reportedScript in scripts/check-tests.ts to run it.`
    }
  }
  const flags = m[1].trim() === '' ? [] : m[1].trim().split(' ')
  const globs = m[2].trim().split(' ')
  if (flags.some((f) => f.startsWith('--test-reporter'))) {
    return { error: `${where}: script "${name}" names a reporter of its own; the gate adds its two` }
  }
  return ['--test', ...flags, ...reporterArgs(), ...globs]
}

/** What `pnpm run` adds that a script may lean on: the package's own `node_modules/.bin` first on PATH. */
function scriptEnv(dir: string): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${join(dir, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}` }
}

/** `reportedScript` over a package.json on disk; a refusal is red before anything runs. */
function scriptArgs(dir: string, name: string): string[] {
  const where = dir === ROOT ? 'package.json' : `${dir.slice(ROOT.length + 1)}/package.json`
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, unknown>
  }
  const args = reportedScript(where, name, pkg.scripts ?? {})
  if ('error' in args) {
    process.stderr.write(`check-tests: ${args.error}\n`)
    process.exit(1)
  }
  return args
}

function runWorkers(shard?: { index: number; of: number }, selected?: readonly string[]): void {
  // Before any of it: the suite opens browsers, and a machine that has none must say so here
  // rather than inside a test whose message reads like the test is broken.
  ensureWorkersBrowser()
  const skip = databaseSkipOn()

  if (selected) {
    if (selected.length === 0) throw new Error('related workers selection is empty')
    const { run: files, dropped } = splitWorkers(selected, skip)
    announceDatabaseSkip('the related workers files', dropped)
    // The selection was not empty, so nothing left means the skip took all of it, and it was said.
    if (files.length === 0) {
      process.stdout.write(
        'check-tests: related workers — every selected file reads the database, nothing to run\n'
      )
      return
    }
    process.stdout.write(`check-tests: related workers — ${String(files.length)} file\n`)
    const run = spawnReported(process.execPath, workersShardArgs(files), { cwd: ROOT })
    if (run.status !== 0) {
      process.stderr.write('check-tests: related workers failed.\n')
      process.exit(1)
    }
    return
  }

  if (!shard && !skip) {
    process.stdout.write('check-tests: workers + scripts + packages\n')
    const whole = spawnReported(process.execPath, scriptArgs(ROOT, 'test:workers'), {
      cwd: ROOT,
      env: scriptEnv(ROOT)
    })
    if (whole.status !== 0) {
      process.stderr.write('check-tests: the workers suite is red.\n')
      process.exit(1)
    }
    return
  }

  const all = workersFiles()
  if (!shard) {
    // The whole suite with the skip on: the files are listed (the `test:workers` script is a glob, which
    // cannot leave a file out), with the three flags the script carries and the same reporters.
    // 🔒 AN EMPTY LIST IS RED, here as for a shard, an owner and e2e: `node --test` with no file exits 0.
    if (all.length === 0) {
      process.stderr.write('check-tests: the workers suite lists no test file — it has gone missing.\n')
      process.exit(1)
    }
    const { run: files, dropped } = splitWorkers(all, skip)
    announceDatabaseSkip('the workers suite', dropped)
    if (files.length === 0) {
      process.stderr.write(
        `check-tests: every workers file reads ${DATABASE_MARK} and ${SKIP_DB_ENV} left them all out — nothing would run.\n`
      )
      process.exit(1)
    }
    process.stdout.write(
      `check-tests: workers + scripts + packages — ${String(files.length)}/${String(all.length)} file\n`
    )
    const whole = spawnReported(process.execPath, workersShardArgs(files), { cwd: ROOT })
    if (whole.status !== 0) {
      process.stderr.write('check-tests: the workers suite is red.\n')
      process.exit(1)
    }
    return
  }

  const assigned = shardOf(all, shard, loadTimings())
  // 🔒 AN EMPTY SHARD IS RED. `node --test` with no files exits 0, which on the Actions page is a
  // green tick for a shard that tested nothing — the same fail-open shape this gate exists to
  // refuse. It can only happen when the shard count exceeds the file count, i.e. a workflow typo.
  // Judged BEFORE the skip: a shard the skip empties is a different thing, and is red just below.
  if (assigned.length === 0) {
    process.stderr.write(
      `check-tests: shard ${String(shard.index)}/${String(shard.of)} has no file — ` +
        `the shard count (${String(shard.of)}) is larger than the file count (${String(all.length)}).\n`
    )
    process.exit(1)
  }
  // The skip is applied to the shard the table assigned, never before the split: the same file lands
  // in the same shard with or without it, so a run that skipped and one that did not agree on who owns what.
  const { run: mine, dropped } = splitWorkers(assigned, skip)
  announceDatabaseSkip(`workers shard ${String(shard.index)}/${String(shard.of)}`, dropped)
  process.stdout.write(
    `check-tests: workers + scripts + packages — shard ${String(shard.index)}/${String(shard.of)}, ` +
      `${String(mine.length)}/${String(all.length)} file\n`
  )
  if (mine.length === 0) {
    process.stderr.write(
      `check-tests: shard ${String(shard.index)}/${String(shard.of)} holds only files that read ${DATABASE_MARK}, ` +
        `and ${SKIP_DB_ENV} left them all out — nothing would run, and a shard that tested nothing is red.\n`
    )
    process.exit(1)
  }
  // The two `tracy-test-timing` lines bracket this shard's file records in the log; the table is
  // refreshed from them (`scripts/update-test-timings.mjs`). `end` is printed for a green shard only.
  const tag = `part=workers shard=${String(shard.index)}/${String(shard.of)}`
  // `printNow`, like the report itself: the three lines must stay in order around the records.
  printNow(`${TIMING_MARK} begin ${tag} files=${String(mine.length)}\n`)
  const started = process.hrtime.bigint()
  const run = spawnReported(process.execPath, workersShardArgs(mine), {
    cwd: ROOT,
    env: { ...process.env, TRACY_TEST_TIMING: '1' }
  })
  if (run.status !== 0) {
    process.stderr.write(
      `check-tests: the workers suite is red (shard ${String(shard.index)}/${String(shard.of)}).\n`
    )
    process.exit(1)
  }
  printNow(`${TIMING_MARK} end ${tag} wall=${wallSeconds(started)}\n`)
}

/**
 * The workers files of one owner, from the same `workersFiles()` the coverage check and the shards
 * use (never a second glob). Exported for the Turbo setup and its test.
 */
export function ownerFiles(all: readonly string[], owner: string): string[] {
  return all.filter((f) => f.startsWith(`${owner}/`))
}

/**
 * The files one owner task runs and the ones the database skip leaves out of it: all of the owner's
 * (or one shard of them by the committed timing table), then the skip. The shard is chosen BEFORE the
 * skip, so a file belongs to the same shard with and without it.
 */
export function ownerTaskSplit(
  all: readonly string[],
  owner: string,
  shard?: { index: number; of: number },
  skip = databaseSkipOn(),
  read: (file: string) => string = readRepoFile
): { run: string[]; dropped: string[] } {
  const mine = ownerFiles(all, owner)
  const assigned = shard ? shardOf(mine, shard, { ...loadTimings(), preloadLastShardSeconds: 0 }) : mine
  return splitDatabaseGated(assigned, skip, read)
}

/**
 * The files one owner task runs. Exported so the Turbo setup traces exactly the files the task runs,
 * the skip included: `skip` is the switch `takeDatabaseSkip` read, never a second reading.
 */
export function ownerTaskFiles(
  all: readonly string[],
  owner: string,
  shard?: { index: number; of: number },
  skip = databaseSkipOn(),
  read: (file: string) => string = readRepoFile
): string[] {
  return ownerTaskSplit(all, owner, shard, skip, read).run
}

/** One owner's workers files (or one shard of them), with the flags and reporters of `test:workers`. */
function runOwner(owner: string, shard?: { index: number; of: number }): void {
  ensureWorkersBrowser()
  const files = workersFiles()
  const all = ownerFiles(files, owner)
  const { run: mine, dropped } = ownerTaskSplit(files, owner, shard)
  const label = shard ? `${owner} ${String(shard.index)}/${String(shard.of)}` : owner
  announceDatabaseSkip(`owner ${label}`, dropped)
  // 🔒 EMPTY IS RED, as for a workers shard: a task that tested nothing must not be cached as green.
  if (mine.length === 0) {
    process.stderr.write(
      `check-tests: owner ${label} has no workers test file to run` +
        (dropped.length > 0
          ? ` (its ${String(dropped.length)} file(s) all read ${DATABASE_MARK}, which ${SKIP_DB_ENV} leaves out)`
          : '') +
        '.\n'
    )
    process.exit(1)
  }
  process.stdout.write(`check-tests: owner ${label} — ${String(mine.length)}/${String(all.length)} file\n`)
  const run = spawnReported(process.execPath, workersShardArgs(mine), { cwd: ROOT })
  if (run.status !== 0) {
    process.stderr.write(`check-tests: owner ${label} failed.\n`)
    process.exit(1)
  }
}

/** The e2e argv: the flags it always ran with, plus the reporter that lists what was not run. */
export function e2eArgs(files: readonly string[]): string[] {
  return ['--test', '--test-timeout=120000', '--test-force-exit', ...reporterArgs(), ...files]
}

/**
 * The real-browser smoke tests (`test/e2e/`), outside `test:workers` so unit runs never open a
 * browser. An empty list is RED: `node --test` with no files exits 0, a green tick that ran nothing.
 */
function runE2e(): void {
  ensureWorkersBrowser()
  const group = GROUPS.find((g) => g.run === 'e2e')
  if (!group) throw new Error('GROUPS no longer declares e2e')
  const files = OWNED.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => f.slice(ROOT.length + 1))
    .filter((f) => group.files.test(f))
    .sort()
  process.stdout.write(`check-tests: e2e — ${String(files.length)} file\n`)
  if (files.length === 0) {
    process.stderr.write('check-tests: e2e has no files — the browser smoke suite has disappeared.\n')
    process.exit(1)
  }
  const run = spawnReported(process.execPath, e2eArgs(files), { cwd: ROOT })
  if (run.status !== 0) {
    process.stderr.write('check-tests: the e2e suite is red.\n')
    process.exit(1)
  }
}

/** One standalone EmDash template: its own lockfile, its own browser, its own `pnpm test`. */
function runStandalone(rel: string): void {
  const dir = join(ROOT, rel)
  process.stdout.write(`check-tests: ${rel}\n`)
  if (!existsSync(join(dir, 'node_modules'))) {
    // Its own lockfile, its own ~300 packages: install INSIDE the directory. A missing install is
    // not a reason to skip -- a suite that only runs where someone happened to install it is the
    // fail-open this gate exists to refuse.
    process.stdout.write(`check-tests: ${rel} has no node_modules — pnpm install\n`)
    const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: dir, stdio: 'inherit' })
    if (install.status !== 0) {
      process.stderr.write(`check-tests: installing ${rel} failed\n`)
      process.exit(1)
    }
  }
  ensureBrowser(dir, rel)
  const run = spawnReported(process.execPath, scriptArgs(dir, 'test'), { cwd: dir, env: scriptEnv(dir) })
  if (run.status !== 0) {
    process.stderr.write(`check-tests: the suite of ${rel} is red.\n`)
    process.exit(1)
  }
}

/** One command of the fork's suite: node arguments, run from the package folder. */
export interface VendorRun {
  name: string
  args: string[]
}

/**
 * The fork's suite exactly as its `package.json` runs it. Since 2.7.7 that is two commands, and the
 * second loads a preload that swaps in upstream's pass-through policy. One glob over `test/**`
 * without it runs upstream's tests against the Tracy policy: on 05/10/2026 that turned the row red
 * and then hung it until the job timeout. Each script is parsed against the one shape this gate
 * knows; a script that changed shape is refused by name rather than run some other way.
 */
export function vendorRuns(
  scripts: Readonly<Record<string, string>>,
  skip: string
): VendorRun[] | { error: string } {
  const runs: VendorRun[] = []
  for (const name of ['test:tracy', 'test:upstream']) {
    const script = scripts[name]
    const m =
      typeof script === 'string' ? /^node((?: --import \S+)+) --test "([^"]+)"$/.exec(script.trim()) : null
    if (m === null) {
      return {
        error:
          `vendor/tracy/dsh-passwords: script "${name}" is ${JSON.stringify(script ?? null)}, not ` +
          `\`node --import … --test "<glob>"\` — update vendorRuns in scripts/check-tests.ts to run it.`
      }
    }
    const imports = m[1].trim().split(' ')
    runs.push({ name, args: [...imports, '--test', `--test-skip-pattern=${skip}`, m[2]] })
  }
  return runs
}

/** One of the fork's commands with the second reporter placed first: every element is an option. */
export function vendorArgs(run: VendorRun): string[] {
  return [...reporterArgs(), ...run.args]
}

/** One step of the fork's build: a program from its own `node_modules/.bin` (or `node`) and arguments. */
export interface VendorBuildStep {
  bin: 'tsc' | 'node'
  args: string[]
}

/**
 * The build the fork's suite needs first. Its `npm test` runs `pretest` (`npm run build`), and the
 * startup tests spawn `dist/cli.js`, which only that build writes (`dist/` is not in git, and since
 * 2.7.7 `prepare` no longer compiles). This gate runs the two test scripts directly, so it runs the
 * build itself: the same two steps as the package's `build` script, with `tsc` told to emit without
 * type-checking. `src/plugin.ts` imports the type `@deepseek-ai/dsh-host-webserver`, which the
 * package does not declare; npm's flat tree happens to provide it, this workspace's pnpm tree does
 * not, and a type-checked build stops there with TS2307 before anything the tests need is wrong.
 * A `pretest` or `build` that changed shape is refused by name rather than built some other way.
 */
export function vendorBuild(
  scripts: Readonly<Record<string, string>>
): VendorBuildStep[] | { error: string } {
  const refuse = (name: string, want: string): { error: string } => ({
    error:
      `vendor/tracy/dsh-passwords: script "${name}" is ${JSON.stringify(scripts[name] ?? null)}, not ` +
      `${JSON.stringify(want)} — update vendorBuild in scripts/check-tests.ts to build it.`
  })
  if (scripts.pretest !== 'npm run build') return refuse('pretest', 'npm run build')
  const want = 'tsc -p tsconfig.json && node scripts/build-client.mjs'
  if (scripts.build !== want) return refuse('build', want)
  return [
    { bin: 'tsc', args: ['-p', 'tsconfig.json', '--noCheck'] },
    { bin: 'node', args: ['scripts/build-client.mjs'] }
  ]
}

/** The tests of the fork this gate leaves out, here and inside a container (reasons at `SKIPPED`). */
function vendorSkipped(): readonly Skipped[] {
  return inContainer ? [...SKIPPED, ...SKIPPED_IN_CONTAINER] : SKIPPED
}

/**
 * The fork's suite as this gate runs it: the build steps, then the two test commands with the skip
 * list, each from the package folder. Exported so the Turbo setup traces the same commands; an
 * unknown script shape is the same named refusal as in `runVendor`.
 */
export function vendorPlan():
  | { cwd: string; build: VendorBuildStep[]; runs: VendorRun[] }
  | { error: string } {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>
  }
  const runs = vendorRuns(
    pkg.scripts ?? {},
    vendorSkipped()
      .map((s) => s.pattern)
      .join('|')
  )
  if ('error' in runs) return runs
  const build = vendorBuild(pkg.scripts ?? {})
  if ('error' in build) return build
  return { cwd: PKG, build, runs }
}

/** The vendored fork's own suite, with the two skip lists this file documents. */
function runVendor(): void {
  process.stdout.write('check-tests: vendor/tracy/dsh-passwords\n')
  ensureDeps()

  const skipped = vendorSkipped()
  if (inContainer) {
    process.stdout.write(
      `check-tests: running inside a container — also skipping ${String(SKIPPED_IN_CONTAINER.length)} ` +
        `tests that the container itself makes meaningless (see SKIPPED_IN_CONTAINER).\n`
    )
  }
  const skip = skipped.map((s) => s.pattern).join('|')
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>
  }
  const runs = vendorRuns(pkg.scripts ?? {}, skip)
  if ('error' in runs) {
    process.stderr.write(`check-tests: ${runs.error}\n`)
    process.exit(1)
  }
  const build = vendorBuild(pkg.scripts ?? {})
  if ('error' in build) {
    process.stderr.write(`check-tests: ${build.error}\n`)
    process.exit(1)
  }
  process.stdout.write('check-tests: dsh-passwords build\n')
  for (const step of build) {
    const bin = step.bin === 'node' ? process.execPath : join(PKG, 'node_modules', '.bin', step.bin)
    const built = spawnSync(bin, step.args, { cwd: PKG, stdio: 'inherit' })
    if (built.status !== 0) {
      process.stderr.write(
        `check-tests: vendor/tracy/dsh-passwords did not build (${step.bin} ${step.args.join(' ')}) — its tests were not run.\n`
      )
      process.exit(1)
    }
  }
  let red = false
  for (const r of runs) {
    process.stdout.write(`check-tests: dsh-passwords ${r.name}\n`)
    // The second reporter lists the tests this run selected and did not run (the seven CDP
    // measurements, the Windows-only ones); the ones `SKIPPED` filters out are never selected.
    const run = spawnReported(process.execPath, vendorArgs(r), { cwd: PKG })
    if (run.status !== 0) red = true
  }

  if (red) {
    process.stderr.write(
      `\ncheck-tests: the suite is red.\n` +
        `check-tests: ${String(skipped.length)} tests are skipped on purpose — if the failure is one ` +
        `of them, it slipped past the filter; see SKIPPED in this file.\n`
    )
    process.exit(1)
  }

  process.stdout.write(
    `check-tests: green (${String(skipped.length)} tests skipped on purpose — see SKIPPED in this file).\n`
  )
}

function main(): void {
  // The skip flag is taken out first: `parseDatabaseMode` walks the rest in pairs and would refuse a
  // flag that has no value. The variable is read here once and removed from the environment (see
  // `takeDatabaseSkip`), so no test process below inherits it.
  const asked = skipDatabaseRequested(process.argv.slice(2), process.env)
  if ('error' in asked) {
    process.stderr.write(`check-tests: ${asked.error}\n`)
    process.exit(1)
  }
  const skip = takeDatabaseSkip(asked.on)
  const argv = asked.rest
  const specs = parseParts(argv)
  if (typeof specs === 'string') {
    process.stderr.write(`check-tests: ${specs}\n`)
    process.exit(1)
  }
  // Refused here, before any database is read, probed or started. This is also where an argument
  // nobody knows stops the run — `--databas owned` must not become `auto`: see `parseDatabaseMode`.
  const database = parseDatabaseMode(argv)
  if ('error' in database) {
    process.stderr.write(`check-tests: ${database.error}\n`)
    process.exit(1)
  }
  if (skip && database.mode === 'owned') {
    process.stderr.write(
      `check-tests: --database owned asks for a database of this run's own and the skip (${SKIP_DB_FLAG} / ${SKIP_DB_ENV}=1) ` +
        `asks for none; pick one.\n`
    )
    process.exit(1)
  }

  // BEFORE any run: 28 files under `apps/tracy-web/test/` skip themselves when the variable is
  // missing, and skipping looks exactly like having run (see the top of `ensureDatabase`). A run that
  // asked for the skip needs no database, except for the e2e part, which is red without one; a run
  // with no `--part` includes e2e.
  if (databaseWanted(skip, specs)) ensureDatabase(database.mode)
  else
    process.stdout.write(
      `check-tests: ${SKIP_DB_ENV}=1 — no database is provisioned: the files that need one are left out of this run.\n`
    )

  // 🔒 EVERY PART COUNTS THE FILES, not just the one that used to. The count is what catches a test
  // file nobody declared, and a part that skipped it would be a hole that opens only in CI.
  checkCoverage()

  if (specs !== null) {
    for (const spec of specs) {
      if (spec.part === 'workers') runWorkers(spec.shard)
      else if (spec.part === 'related') runRelated()
      else if (spec.part === 'interop') runInterop()
      else if (spec.part === 'e2e') runE2e()
      else if (spec.part === 'standalone:base') runStandalone(STANDALONE[0])
      else if (spec.part === 'standalone:business') runStandalone(STANDALONE[1])
      else if (spec.part === 'standalone:saas') runStandalone(STANDALONE[2])
      else if (spec.part === 'vendor') runVendor()
      else if (spec.part === 'owner') runOwner(spec.owner ?? '', spec.shard)
      else {
        // `rest`: the suites too small to be worth a machine of their own (interop 6 s, dsh-passwords
        // 51 s measured 29/09). It rides with the last workers shard. e2e is NOT here: it is its own
        // part because it only runs when a PR touches the package that owns an e2e file.
        // Timed as one figure: it is what the last shard carries besides its files, and the shard
        // table needs it from the runners (`restWallSeconds` in `scripts/test-timings.json`).
        const started = process.hrtime.bigint()
        runInterop()
        runVendor()
        printNow(`${TIMING_MARK} part=rest wall=${wallSeconds(started)}\n`)
      }
      process.stdout.write(`check-tests: part ${spec.part} done.\n`)
    }
    return
  }

  runWorkers()
  runInterop()
  runE2e()
  for (const rel of STANDALONE) runStandalone(rel)
  runVendor()
}

/** The planner and this gate use the same selection; missing git history is a red job. */
function runRelated(): void {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  let changed: string[], allFiles: string[]
  try {
    changed = git(['diff', '--name-only', '-z', '--no-renames', 'HEAD^1', 'HEAD']).split('\0').filter(Boolean)
    allFiles = git(['ls-files', '-z']).split('\0').filter(Boolean)
  } catch (error) {
    process.stderr.write(`check-tests: cannot select related tests: ${String(error)}\n`)
    process.exit(1)
  }
  const selected = relatedTests({
    changed,
    allFiles,
    dependencies: workspaceDependencies(ROOT, allFiles),
    // The planner reads the same tree, so both pick the same template-data readers.
    readText: repoReader(ROOT)
  })
  if (selected.full) {
    process.stderr.write(
      `check-tests: planner requested related tests for a full-suite change: ${selected.why}\n`
    )
    process.exit(1)
  }
  process.stdout.write(
    `check-tests: ${selected.why}; ${String(selected.workers.length)} workers files; interop=${String(selected.interop)}\n`
  )
  if (selected.workers.length > 0) runWorkers(undefined, selected.workers)
  if (selected.interop) runInterop()
}

/**
 * The interop argv: `test:interop` (`node --import tsx --test scripts/test/*.test.ts`) with the
 * files listed from the group's own regex, so the second reporter can be placed before them (node
 * reads no option after the first file, which rules out `pnpm run test:interop -- …`).
 */
export function interopArgs(files: readonly string[]): string[] {
  return ['--import', 'tsx', '--test', ...reporterArgs(), ...files]
}

/** Every file of the `test:interop` group, from the group's own regex. Exported for the Turbo setup. */
export function interopFiles(): string[] {
  const group = GROUPS.find((g) => g.run === 'test:interop')
  if (!group) throw new Error('GROUPS no longer declares test:interop')
  return OWNED.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => f.slice(ROOT.length + 1))
    .filter((f) => group.files.test(f))
    .sort()
}

/**
 * The second suite, run UNDER `tsx` and therefore a separate command.
 *
 * 🔒 DO NOT merge it into `test:workers`. Tried 31/08: adding `--import tsx` to the shared command turned
 * 4 `fleet-bar` tests red with `worker.fetch is not a function` — tsx changes how Worker modules load.
 * Two runtimes, two commands.
 *
 * ⚠ THIS WAS MISSED FROM THE START. `scripts/test/seat-door-interop.test.ts` — 6 tests guarding the
 * seat-door signature contract between TypeScript-on-Node and JavaScript-on-Workers — was in the repo and
 * **no command ran it**: the old glob only caught `*.test.mjs`. All 6 were green when run by hand on 31/08,
 * so it is not debt; it is exactly the fail-open this file exists to stop, happening inside it.
 */
function runInterop(): void {
  const files = interopFiles()
  process.stdout.write(`check-tests: interop (tsx) — ${String(files.length)} file\n`)
  // Same rule as a shard and e2e: `node --test` with no files exits 0 having tested nothing.
  if (files.length === 0) {
    process.stderr.write('check-tests: interop has no files — the interop suite has disappeared.\n')
    process.exit(1)
  }
  const interop = spawnReported(process.execPath, interopArgs(files), { cwd: ROOT })
  if (interop.status !== 0) {
    process.stderr.write('check-tests: the interop suite is red.\n')
    process.exit(1)
  }
}

/**
 * 🔒 ONLY WHEN THIS FILE IS THE COMMAND, NEVER WHEN IT IS IMPORTED. `check-all.ts` spawns it as
 * `node --import tsx scripts/check-tests.ts`, so `process.argv[1]` is this file and the gate runs
 * exactly as before. A bare `main()` at top level also runs the whole gate — every test group, the
 * database, the standalone suites — the moment anything so much as reads a function out of this
 * module, which is why `throwawayArgs` had no test until now.
 */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
