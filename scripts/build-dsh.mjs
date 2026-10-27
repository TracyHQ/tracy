/**
 * Build the vendored dsh. RUN THIS BEFORE `pnpm install`, not after.
 *
 * SINCE 06/09 `@deepseek-ai` DOES NOT COME FROM A REGISTRY. The packages under
 * `vendor/tracy/deepseek-harness` are workspace members of this repository, so `pnpm install` links
 * straight at their SOURCE -- and the source has no `lib/` yet: the submodule's `.gitignore`
 * excludes it, and the fleet image builds it with `pnpm build:official` rather than downloading it.
 * Without this step `pnpm install` is green, `node_modules/.bin/dsh` is NOT created (`lib/bin.js`
 * does not exist yet when pnpm links bins), and the only symptom is `run.sh` telling you to run
 * `pnpm install` right after you ran exactly that.
 *
 * ⚠ TWO COMMANDS, NOT ONE. `build:lib` builds the host and client halves of 410 packages;
 * `build:web` builds the SPA dsh serves itself. Without the second one dsh boots, prints its URL,
 * and the home page answers 404 -- `check-boot-graph` catches it there, measured 06/09.
 *
 * ⚠ ORDER: `pnpm dsh:build` COMES BEFORE `pnpm install`, and that is not a preference.
 *
 * This step runs pnpm inside the submodule, and that install claims the submodule's 410 member
 * packages: it rewrites each one's `node_modules` to point at the submodule's OWN store.
 * Run it after the root install and it silently replaces links the root install had made -- most
 * visibly `fs-ext`, whose compiled binding only exists in the root store (this install uses
 * `--ignore-scripts`), so dsh dies at boot with `Cannot find module './build/Release/fs_ext.node'`
 * on a tree where that binding was compiled correctly one directory up. Measured on a clean
 * checkout 06/09, and neither `pnpm install` nor `pnpm install --force` at the root undoes it.
 *
 * Run it first and everything falls out right: the root install relinks the members afterwards,
 * compiles `fs-ext` where they now point, creates `node_modules/.bin/dsh` (which it can only do
 * once `lib/bin.js` exists), and lets `vendor/tracy/dsh-passwords`'s `prepare` compile against dsh types
 * that are finally there.
 *
 * `pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false` for the same reason: otherwise pnpm runs
 * a root install of its own before this script, which is exactly the order this note forbids.
 *
 * ⚠ `--ignore-scripts` IS NOT CONVENIENCE. The submodule's `postinstall` installs git hooks through
 * lefthook, and it refuses to run when the repository is a SUBMODULE: git keeps `core.worktree` in
 * the module's common config while the installer wants `extensions.worktreeConfig` enabled, and the
 * two are mutually exclusive. That is also why `vendor/tracy/deepseek-harness` (the top-level directory)
 * is NOT a member of the root workspace: as a member it would make every root `pnpm install` fail
 * at the last step, on every machine. Its build toolchain is therefore installed in place, from its
 * own lockfile, and only here.
 *
 * ⚠ NO `*.tsbuildinfo` SURVIVES A BUILD — added 26/09. `build:lib` runs `tsc -b`, which trusts its
 * incremental state, and on a CI runner that state is a gitignored file in a checkout that persists
 * between jobs at DIFFERENT submodule commits. A job at 0.1.6 inherited what a job at 0.1.7 wrote
 * and reported 20 type errors that were not in its tree (measured twice on 26/09, the second time
 * on j-newsletter-01 right after a manual cleanup). So every `*.tsbuildinfo` in the submodule
 * (`scripts/lib/dsh-build-state.mjs`) is deleted at the START of every run (every mode below),
 * AFTER a build succeeds, and when a build step fails — the last two because a checkout this
 * script leaves behind is read by the next job, including jobs on branches that do not carry this
 * rule yet. `--pack` keeps them out of the CI cache as well. The cost is that
 * `pnpm dsh:build` on a laptop never builds incrementally; the CI cache below makes that cheap
 * where it matters.
 *
 * ⚡ CI BUILDS dsh ONCE, NOT ONCE PER JOB — added 26/09. Three more modes serve that, and only that:
 *   --print-key        print the stamp this build would write (the cache key; ONE implementation)
 *   --pack <tar>       tar the finished build of THIS key (refuses anything else)
 *   --restore <tar>    clear the build output here, unpack <tar>, and refuse unless it holds THIS key
 * `.github/actions/dsh-lib` wires them to `actions/cache`; why, and the runner sizes that forced it,
 * are in `.github/workflows/tracy-ci.yml` (job `dsh-lib`).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { removeBuildInfo } from './lib/build-info.mjs'

import {
  STAMP_PATH,
  buildKey,
  buildOutputs,
  incrementalState,
  readStamp as readStampIn
} from './lib/dsh-build-state.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const HARNESS = join(ROOT, 'vendor', 'tracy', 'deepseek-harness')

/**
 * `--skip-if-built` — SKIP THE BUILD WHEN THIS CHECKOUT ALREADY HOLDS THE OUTPUT OF THIS EXACT dsh.
 *
 * WHY. The CI runners keep their checkout between jobs, and almost no pull request moves the
 * submodule — yet every `Tracy CI` run rebuilt 410 packages from scratch. Measured 15/09 on PR #94:
 * `Build the vendored dsh` took 9 min of a 25 min run while four other CI runs shared the machine
 * (50 s when the machine is idle). The output (`lib/`, `apps/web/dist`, the flock binding) is
 * gitignored inside the submodule and survives checkout, so rebuilding it is pure repetition.
 *
 * WHAT MUST MATCH, or the build runs as before:
 *   - the submodule's HEAD commit, and a working tree with no tracked edits (a laptop mid-change);
 *   - the Node version (the flock binding and tsdown's output depend on it);
 *   - this script's own bytes (a change to HOW dsh is built invalidates what was built).
 * Plus the three outputs must still exist — a stamp without them is a stamp that lies.
 *
 * 🔒 THE STAMP IS WRITTEN AND REMOVED ONLY HERE. `build-dsh-image.yml` and `build-app-images.yml`
 * run this script in the same runner checkout; if a flag in one workflow wrote the stamp and the
 * others built without touching it, a rebuild at another commit would leave a stamp naming the old
 * one. So every run of this script removes the stamp BEFORE building and writes it only after the
 * last step succeeded: an interrupted build leaves no stamp, never a wrong one. It lives inside
 * `apps/cli/lib/` so that wiping the build output wipes the stamp with it.
 *
 * Without the flag nothing changes — a person typing `pnpm dsh:build` gets a full build.
 */
const SKIP_IF_BUILT = process.argv.includes('--skip-if-built')
const STAMP = join(HARNESS, STAMP_PATH)

/**
 * The value after a flag, resolved against the caller's directory; null when the flag is absent.
 * @param {string} flag
 */
function flagPath(flag) {
  const at = process.argv.indexOf(flag)
  if (at === -1) return null
  const value = process.argv[at + 1]
  if (!value || value.startsWith('--')) {
    process.stderr.write(`build-dsh: ${flag} needs a file path.\n`)
    process.exit(2)
  }
  return resolve(value)
}
const PRINT_KEY = process.argv.includes('--print-key')
const PACK = flagPath('--pack')
const RESTORE = flagPath('--restore')

// 🔒 THE FALLBACK BELONGS IN THIS MESSAGE, NOT IN A DOCUMENT SOMEONE READ YESTERDAY. This is
// where a fresh machine actually stops, and the stop is total: `@deepseek-ai/*` are workspace
// members sourced from this submodule, so an empty one is a workspace missing 300 members and
// every later step fails for a reason that never names the submodule.
//
// ⚠ AND THE SSH URL IS LOAD-BEARING — do NOT "fix" `.gitmodules` to https. The submodule is a
// SECOND private repository that `GITHUB_TOKEN` cannot read, so CI checks out with
// `submodules: false` and fetches it with a read-only deploy key over SSH instead
// (`.github/workflows/tracy-ci.yml`, "Fetch the vendored dsh submodule"). Rewriting the URL
// turns every workflow red at a step whose message is about the presets gate.
//
// A laptop with no SSH key rewrites the PROTOCOL for this clone instead. Rewriting the protocol
// rather than pinning `submodule.<path>.url` is the difference between a fix that survives and
// one that rots: the path moved once already (`vendor/` -> `vendor/tracy/`), and a pinned url
// keyed by the old path stays in `.git/config` pointing at nothing.
if (!existsSync(join(HARNESS, 'package.json'))) {
  process.stderr.write(
    'build-dsh: vendor/tracy/deepseek-harness is empty — run `git submodule update --init` first.\n' +
      '  Permission denied (publickey)? That submodule is a second private repo pinned to SSH\n' +
      '  because CI fetches it with a deploy key — leave `.gitmodules` alone and rewrite the\n' +
      '  protocol for this clone only, then retry the command above:\n' +
      '    git config --local url."https://github.com/".insteadOf "git@github.com:"\n'
  )
  process.exit(2)
}

// Workspace slots left behind by OLDER checkouts of the submodule: a directory with no
// package.json, only ignored build output. pnpm skips them, but tsdown's `workspace:
// ['packages/*/*']` glob does not — it matches the empty slot, falls back to the ROOT package
// name, and `build:lib` fails looking for the root's entries inside it. The fleet Dockerfile
// prunes them for the same reason; a machine that has followed the submodule for weeks hits
// this on the first `pnpm dsh:build`, a fresh clone never does.
const packagesDir = join(HARNESS, 'packages')
for (const group of readdirSync(packagesDir)) {
  const groupDir = join(packagesDir, group)
  if (!statSync(groupDir).isDirectory()) continue
  for (const slot of readdirSync(groupDir)) {
    const slotDir = join(groupDir, slot)
    if (!statSync(slotDir).isDirectory()) continue
    if (existsSync(join(slotDir, 'package.json'))) continue
    process.stderr.write(`build-dsh: removing empty workspace slot packages/${group}/${slot}\n`)
    rmSync(slotDir, { recursive: true, force: true })
  }
}

/**
 * Delete every `*.tsbuildinfo` in the submodule (header: none may outlive a build). Logged on
 * stderr, because `--print-key`'s stdout is the key and nothing else.
 * @param {string} when - for the log line.
 */
function dropIncrementalState(when) {
  const stale = incrementalState(HARNESS)
  for (const file of stale) rmSync(file, { force: true })
  if (stale.length > 0) process.stderr.write(`build-dsh: removed ${stale.length} *.tsbuildinfo ${when}.\n`)
}
// EVERY mode starts here, not only a real build: whichever job this is — the cache lookup, a
// restore, a skipped build — it leaves the runner's checkout without incremental state, including
// state an older version of this script (or another branch) left behind.
dropIncrementalState('left in this checkout by an earlier build')

/**
 * The three outputs a finished build leaves; any one missing means the stamp cannot be trusted.
 *
 * ⚠ THE FLOCK BINDING IS NOT AT ONE PATH. macOS builds `bin/system.node`; Linux builds one per libc,
 * `bin/glibc/system.node` or `bin/musl/system.node` (native/system/packages/entry/README.md). The
 * first version of this check looked only at the macOS path, so on the Linux runners it never saw
 * the binding, never wrote a stamp, and every run rebuilt — green, and exactly as slow as before.
 * Measured 15/09 on tracy-build-03 after PR #94's run: `bin/glibc/system.node` present, no stamp.
 */
function outputsPresent() {
  const bin = join(HARNESS, 'native', 'system', 'packages', `${process.platform}-${process.arch}`, 'bin')
  const addon = [
    join(bin, 'system.node'),
    join(bin, 'glibc', 'system.node'),
    join(bin, 'musl', 'system.node')
  ]
  return (
    existsSync(join(HARNESS, 'apps', 'cli', 'lib', 'bin.js')) &&
    existsSync(join(HARNESS, 'apps', 'web', 'dist', 'index.html')) &&
    addon.some((file) => existsSync(file))
  )
}

// A tree that is not a git checkout has no key, as before: the build runs and writes no stamp.
const key = (() => {
  try {
    return buildKey(HARNESS, import.meta.filename)
  } catch {
    return null
  }
})()
/** The stamp on disk right now, '' when there is none. */
const readStamp = () => readStampIn(HARNESS)

/**
 * Run tar, failing the script when it fails. The member list goes on stdin (`-T -`), which GNU tar
 * on the runners and bsdtar on a Mac both read.
 * @param {string[]} args
 * @param {string} [input]
 */
function tar(args, input) {
  const result = spawnSync('tar', args, {
    cwd: HARNESS,
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit']
  })
  if (result.status !== 0) {
    process.stderr.write(`build-dsh: \`tar ${args.join(' ')}\` failed\n`)
    process.exit(result.status ?? 1)
  }
}

if (PRINT_KEY) {
  if (key === null) {
    process.stderr.write('build-dsh: no key — the submodule has tracked edits or is not a git checkout.\n')
    process.exit(1)
  }
  process.stdout.write(`${key}\n`)
  process.exit(0)
}

if (PACK) {
  // Only a finished build of exactly this key goes into a cache named after this key.
  if (key === null || readStamp() !== key || !outputsPresent()) {
    process.stderr.write(
      'build-dsh: --pack refused — this checkout does not hold a finished build of the current key.\n' +
        '  Run `node scripts/build-dsh.mjs --skip-if-built` first.\n'
    )
    process.exit(1)
  }
  const outputs = buildOutputs(HARNESS)
  // `*.tsbuildinfo` stays out: incremental state is exactly what must not travel between checkouts.
  tar(['-cf', PACK, '--exclude=*.tsbuildinfo', '-T', '-'], `${outputs.join('\n')}\n`)
  process.stdout.write(
    `build-dsh: packed ${outputs.length} build outputs of ${key.slice(0, 12)} into ${PACK}\n`
  )
  process.exit(0)
}

if (RESTORE) {
  // Clear first: unpacking over an older build leaves that build's extra files behind, and a
  // leftover `*.tsbuildinfo` is the very thing that poisoned a later build (header).
  for (const entry of buildOutputs(HARNESS)) rmSync(join(HARNESS, entry), { recursive: true, force: true })
  tar(['-xf', RESTORE])
  if (key === null || readStamp() !== key || !outputsPresent()) {
    process.stderr.write(
      `build-dsh: --restore refused — ${RESTORE} does not hold a complete build of this key ` +
        `(${key === null ? 'no key: the submodule has tracked edits' : `want ${key.slice(0, 12)}, stamp ${readStamp().slice(0, 12) || 'absent'}`}).\n`
    )
    process.exit(1)
  }
  process.stdout.write(`build-dsh: restored the build of ${key.slice(0, 12)} from ${RESTORE}\n`)
  process.exit(0)
}

if (SKIP_IF_BUILT) {
  const stamped = readStamp()
  if (key !== null && stamped === key && outputsPresent()) {
    process.stdout.write(
      `build-dsh: SKIPPED — this checkout already holds the build of this dsh (stamp ${key.slice(0, 12)}: ` +
        'submodule commit, Node version and this script all unchanged; lib/, web dist and the flock binding present).\n' +
        'build-dsh: delete apps/cli/lib/.tracy-build-stamp in the submodule, or run without --skip-if-built, to force a build.\n'
    )
    process.exit(0)
  }
  const why =
    key === null
      ? 'the submodule has tracked edits or is not a git checkout'
      : stamped === ''
        ? 'no stamp from an earlier build'
        : stamped !== key
          ? 'the stamp names a different submodule commit, Node version or build script'
          : 'an output of the earlier build is missing'
  process.stdout.write(`build-dsh: building (--skip-if-built did not apply: ${why}).\n`)
}
rmSync(STAMP, { force: true })
// A build of another dsh in this checkout left its incremental records; `tsc -b` would trust them
// and check this dsh's sources against that one's declarations (`lib/build-info.mjs` says when).
const stale = removeBuildInfo(HARNESS)
if (stale.length > 0)
  process.stdout.write(
    `build-dsh: removed ${stale.length} incremental build record(s) (*.tsbuildinfo) before building.\n`
  )

/**
 * Run one command in the vendored harness, failing the script when it fails.
 * @param {string[]} args - argv for pnpm.
 */
function run(args) {
  const result = spawnSync('pnpm', args, {
    cwd: HARNESS,
    stdio: 'inherit',
    // npm_config_ignore_scripts also covers the install pnpm runs on its own before `pnpm run`
    // when it decides the tree is out of date -- that install trips over the same postinstall.
    env: {
      ...process.env,
      npm_config_ignore_scripts: 'true',
      npm_config_registry: 'https://registry.npmjs.org'
    }
  })
  if (result.status !== 0) {
    process.stderr.write(`build-dsh: \`pnpm ${args.join(' ')}\` failed\n`)
    // A killed `tsc -b` (exit 137 on a small runner) leaves half-written state for the next job.
    dropIncrementalState('after the failure, so the next job on this checkout does not inherit them')
    process.exit(result.status ?? 1)
  }
}

// The submodule pins `packageManager: pnpm@11.7.0` while this repository is on 11.18.0, so the
// first run here downloads that exact pnpm through corepack. It needs the network, like the
// install below -- `pnpm dsh:build` is an online step, and the only one in the bootstrap.
//
// NOT filtered to `@deepseek-ai/dsh-root`. That was tried on 06/09 to stop this install claiming the
// member packages, and `build:lib` then failed: `tsconfig.host.json` typechecks `website/` and
// `python/sdk-runtime` too, which a filtered install leaves without dependencies. The clobbering is
// answered by ORDER instead -- see the header.
//
// ⚠ ORDER IS NOT ENOUGH ON A TREE THAT WAS ALREADY BUILT AND INSTALLED. pnpm 11 skips an install
// whose `node_modules/.pnpm-workspace-state-v1.json` still matches the lockfile ("Already up to
// date", 0.2 s), and the root install that relinked the members into the ROOT store does not touch
// that file. So the second `pnpm dsh:build && pnpm install` cycle on one checkout claims nothing and
// `build:lib` typechecks against the root's versions: measured 07/10, 15 TS2345/TS2379 errors
// (zod 4.5.4 vs 4.4.3, playwright-core 1.63.0 vs 1.61.1). Dropping the state file makes this install
// relink the members every time (about a second when nothing else changed).
rmSync(join(HARNESS, 'node_modules', '.pnpm-workspace-state-v1.json'), { force: true })
run(['install', '--ignore-scripts', '--frozen-lockfile'])
// dsh 0.1.5 keeps its session write lock in `@deepseek-ai/node-addon-system` — a flock(2) binding
// compiled from `native/system/packages/entry/src/flock.c` into the per-platform package's `bin/`,
// which is gitignored (upstream ships it inside npm tarballs). Upstream's `build:official` runs this
// step itself; `build:lib` does not. Without it dsh boots and serves, and the first session write
// dies resolving `@deepseek-ai/node-addon-system-<platform>-<arch>/bin/system.node`.
run(['run', 'build:native-system'])
run(['run', 'build:lib'])
run(['run', 'build:web'])

if (!existsSync(join(HARNESS, 'apps', 'cli', 'lib', 'bin.js'))) {
  process.stderr.write('build-dsh: the build finished but apps/cli/lib/bin.js is still missing.\n')
  process.exit(1)
}

dropIncrementalState('after building, so no later job on this checkout inherits them')
if (key !== null && outputsPresent()) writeFileSync(STAMP, `${key}\n`)

process.stdout.write(
  'build-dsh: done — apps/cli/lib/bin.js and apps/web/dist are in place.\n' +
    'build-dsh: now run `pnpm install`. It relinks this submodule against the root store, compiles\n' +
    'build-dsh: fs-ext there, creates node_modules/.bin/dsh, and builds vendor/tracy/dsh-passwords.\n'
)
