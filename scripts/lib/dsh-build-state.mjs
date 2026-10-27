/**
 * What a build of the vendored dsh leaves on disk, and which part of it must never outlive a
 * change of submodule commit. The pure half of `scripts/build-dsh.mjs` (no pnpm, no network), so
 * `scripts/test/dsh-build-state.test.mjs` pins every rule on a throwaway tree.
 *
 * TWO JOBS, ONE DEFINITION OF "BUILD OUTPUT":
 *   · `buildOutputs()` names what `--pack` puts in the CI cache and what `--restore` clears before
 *     unpacking it. Listing it twice (a YAML glob here, a walk there) is how a cache silently starts
 *     carrying one directory less than the build produced.
 *   · `incrementalState()` names the `*.tsbuildinfo` files a build deletes before and after itself.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A path segment that is never build output: another package manager's tree, or git's own. */
const NOT_OUTPUT = new Set(['node_modules', '.git'])

/**
 * The build output inside `harness`, as paths relative to it: everything git IGNORES there, except
 * dependency trees. A directory that is ignored as a whole is one entry (`packages/a/b/lib/`), so
 * the list stays a few hundred lines rather than the files inside them.
 *
 * WHY "IGNORED BY GIT" AND NOT A GLOB OF `lib/`. dsh's build writes more than `lib/`: the SPA to
 * `apps/web/dist/`, the flock binding to `native/system/packages/<platform>/bin/`, and a top-level
 * `lib/` of test types. The submodule's `.gitignore` is the one list upstream keeps in step with
 * its own build; a hand-written glob here would be a second list that drifts.
 *
 * @param {string} harness - the submodule checkout.
 * @returns {string[]}
 */
export function buildOutputs(harness) {
  const listed = spawnSync(
    'git',
    ['-C', harness, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (listed.status !== 0) throw new Error(`git ls-files failed in ${harness}: ${listed.stderr}`)
  const entries = listed.stdout
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => !line.split('/').some((segment) => NOT_OUTPUT.has(segment)))
  // A directory with no tracked file is listed together with every ancestor up to the first
  // tracked one (`apps/`, `apps/web/`, `apps/web/dist/`). Keep the deepest: an ancestor may also
  // hold a skipped `node_modules/`, and removing or packing it whole would take that along.
  return entries
    .filter(
      (entry) => !entries.some((other) => other !== entry && entry.endsWith('/') && other.startsWith(entry))
    )
    .sort()
}

/**
 * Every `*.tsbuildinfo` under `harness`, outside dependency trees, as absolute paths.
 *
 * WHY NONE MAY OUTLIVE A BUILD. `build:lib` runs `tsc -b`, which trusts a `.tsbuildinfo`
 * as the record of what it already checked. On a CI runner the checkout persists between jobs
 * (`_work/<repo>/<repo>` is a volume), and so do these gitignored files — so a job at submodule
 * commit B inherits the incremental state a job at commit A wrote. Measured 26/09: after PR #413
 * built dsh 0.1.7 on seven runners, a PR still at 0.1.6 reported 20 type errors in
 * `apps/desktop/tests` that did not exist in its own tree.
 *
 * @param {string} harness - the submodule checkout.
 * @returns {string[]}
 */
export function incrementalState(harness) {
  /** @type {string[]} */
  const found = []
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (NOT_OUTPUT.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) found.push(path)
    }
  }
  walk(harness)
  return found.sort()
}

/** Where `scripts/build-dsh.mjs` writes its stamp, relative to the submodule. */
export const STAMP_PATH = 'apps/cli/lib/.tracy-build-stamp'

/**
 * What the stamp records: everything that decides what the build produces, as one hash — the
 * submodule's HEAD, the Node version, the platform, and the bytes of the script that builds it.
 * One implementation, read by `scripts/build-dsh.mjs` (writes and checks the stamp, keys the CI
 * cache) and by `scripts/check-dsh-build.mjs` (run.sh's boot check), so the two cannot disagree.
 *
 * @param {string} harness - the submodule checkout.
 * @param {string} buildScript - the file whose bytes are part of the key (`scripts/build-dsh.mjs`).
 * @returns {string | null} null when the submodule has tracked edits — nothing honest to compare.
 * @throws {Error} when `harness` is not a git checkout: that is a broken tree, not "no key".
 */
export function buildKey(harness, buildScript) {
  const git = (args) => spawnSync('git', ['-C', harness, ...args], { encoding: 'utf8' })
  const head = git(['rev-parse', 'HEAD'])
  if (head.status !== 0) throw new Error(`${harness} is not a git checkout: ${head.stderr.trim()}`)
  const dirty = git(['status', '--porcelain', '--untracked-files=no'])
  if (dirty.status !== 0) throw new Error(`git status failed in ${harness}: ${dirty.stderr.trim()}`)
  if (dirty.stdout.trim() !== '') return null
  return (
    createHash('sha256')
      .update(head.stdout.trim())
      .update('\0')
      .update(process.version)
      .update('\0')
      // The flock binding is native code: a cache shared across machines must not hand one
      // platform's build to another.
      .update(`${process.platform}-${process.arch}`)
      .update('\0')
      .update(readFileSync(buildScript))
      .digest('hex')
  )
}

/**
 * The stamp on disk in `harness`, '' when there is none.
 * @param {string} harness - the submodule checkout.
 * @returns {string}
 */
export function readStamp(harness) {
  const file = join(harness, STAMP_PATH)
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
}

/**
 * Why the dsh build in this checkout does not belong to the dsh it is pinned to; null when it does.
 *
 * WHY run.sh ASKS. The submodule's `lib/` is gitignored and survives every checkout, merge and
 * `git submodule update`, so a moved pin leaves a build of the OLD commit in place. dsh boots from
 * it without a word, and a Tracy plugin that needs what the new commit added waits for it forever:
 * measured 07/10, `@tracy/dsh-assistant: pending (waiting for service: chatLocal)` and a blank
 * page in the desktop app, after the pin moved to the fork commit that adds `ctx.chatLocal`.
 *
 * @param {{ key: string, stamp: string }} build - `buildKey` of the checkout and `readStamp`
 *   ('' when absent).
 * @returns {string | null}
 */
export function staleBuild({ key, stamp }) {
  if (stamp === '') return 'no build stamp: this checkout has no finished `pnpm dsh:build` of its own'
  if (stamp !== key) {
    return 'the build was made for another submodule commit, Node version or build script'
  }
  return null
}
