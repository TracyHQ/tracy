/**
 * Folds the files a test run was MEASURED to read into Turbo `inputs` (12/10/2026).
 *
 * Input: the lines `scripts/ci/trace-reads.mjs` wrote for one owner's `node --test` run.
 * Output: globs relative to the repository root (`$TURBO_ROOT$/…`), widened so a file added next to
 * one the suite already reads is covered too:
 *   - inside `apps/<app>`, `packages/<group>/<name>` or `vendor/<group>/<tree>` → that whole tree,
 *     package.json or not (`tracy-joomla-quickstart` has none, and a suite that read two of its
 *     contracts listed the directory to find them);
 *   - a file at the root or directly under a top directory (`pnpm-lock.yaml`, `scripts/x.ts`,
 *     `config/mode-matrix.json`) → that file alone, or the directory's own entries when the suite
 *     listed the directory — widening those to the whole directory would make every task depend on
 *     every script;
 *   - anything deeper → its parent directory.
 * A run that read the dsh submodule gets `TRACY_DSH_COMMIT` in `env`: Turbo hashes files through the
 * parent repository's git index, which holds the submodule as one commit id, not its files.
 * A file git ignores cannot be an input: the plan job's checkout never has it. A read of one is
 * accounted for only through a DECLARED entry (`GENERATED` in `turbo-setup.mjs`): a build output
 * brings in the sources it is declared to be built from; anything undeclared brings in nothing,
 * and the gate is red on it. Git's own directory is never an input either.
 *
 * `classifyReads` is the other direction, for the `turbo-config` gate: given what a task was just
 * measured to read and the inputs it is configured with, which reads does its hash not cover?
 *
 * ⚠ A trace only sees what that run read. A suite that later reads a new outside file must be traced
 * again (`scripts/ci/turbo-setup.mjs`), or Turbo may serve its old green result after that file
 * changes; the release pull requests and the nightly run every suite without the cache.
 */
import path from 'node:path'

/** The tracer itself; never an input. */
const IGNORED = /^scripts\/ci\/trace-reads\.mjs$/

export const DSH = 'vendor/tracy/deepseek-harness'

/** The package, app or vendor tree a path lies in, or null (`packages/cms/tracy-seeder/src/a.mjs`). */
export function treeOf(file) {
  const parts = file.split('/')
  if ((parts[0] === 'vendor' || parts[0] === 'packages') && parts.length >= 3)
    return parts.slice(0, 3).join('/')
  if (parts[0] === 'apps' && parts.length >= 2) return parts.slice(0, 2).join('/')
  return null
}

const isGit = (file) => file === '.git' || file.startsWith('.git/')

/**
 * The declared entry that vouches for an ignored path, or null. Only a path `GENERATED` names, or one
 * inside a directory it names: no kind of directory (`node_modules`, `__pycache__`, `.turbo`) is
 * approved by its name alone — an ignored configuration file can sit in any of them.
 * @param {string} file
 * @param {readonly { path: string, sources?: readonly string[], localOnly?: boolean, file?: boolean }[]} generated
 * @returns {{ path: string, sources: readonly string[], localOnly: boolean } | null}
 */
export function generatedEntry(file, generated) {
  const hit = generated.find((g) => file === g.path || (!g.file && file.startsWith(`${g.path}/`)))
  return hit ? { path: hit.path, sources: hit.sources ?? [], localOnly: hit.localOnly === true } : null
}

/** One traced line → `{ file, recursive }`; a directory listed recursively arrives as `<dir>/**`. */
function parseRead(raw) {
  const line = raw.trim().replaceAll(path.sep, '/')
  return line.endsWith('/**')
    ? { file: line.slice(0, -3), recursive: true }
    : { file: line, recursive: false }
}

/**
 * @param {string} owner - repo-relative owner directory (`apps/tracy-web`, `scripts`).
 * @param {readonly string[]} reads - repo-relative paths the run read.
 * @param {(rel: string) => boolean} isDir - whether a repo-relative path is a directory.
 * @param {(rel: string) => boolean} [isIgnored] - whether git ignores a repo-relative path.
 * @param {readonly { path: string, sources?: readonly string[], localOnly?: boolean }[]} [generated] -
 *   the declared ignored paths (`GENERATED`).
 * @returns {{ inputs: string[], env: string[] }} inputs WITHOUT the owner's own tree (the caller
 *   adds `$TURBO_DEFAULT$` for a package, or the owner's glob for a root task).
 */
export function inputsFor(owner, reads, isDir, isIgnored = () => false, generated = []) {
  const globs = new Set()
  let dsh = false
  // An ignored read stands for the sources it is declared to be made from; they are queued as reads.
  const queue = [...reads]
  for (let i = 0; i < queue.length; i++) {
    const { file, recursive } = parseRead(queue[i])
    if (!file || IGNORED.test(file) || isGit(file)) continue
    if (file === DSH || file.startsWith(`${DSH}/`)) {
      dsh = true
      continue
    }
    if (isIgnored(file)) {
      const entry = generatedEntry(file, generated)
      // Undeclared, or a machine's own file: nothing can be hashed for it. The gate judges it.
      if (entry && !entry.localOnly)
        for (const src of entry.sources) queue.push(src.endsWith('/') ? src.slice(0, -1) : src)
      continue
    }
    if (file === owner || file.startsWith(`${owner}/`)) continue
    const parts = file.split('/')
    const tree = treeOf(file)
    if (tree) globs.add(`${tree}/**`)
    else if (recursive) globs.add(`${file}/**`)
    else if (parts.length <= 2) globs.add(isDir(file) ? `${file}/*` : file)
    else globs.add(`${parts.slice(0, -1).join('/')}/**`)
  }
  // A glob already covered by a wider tree adds nothing.
  const trees = [...globs].filter((g) => g.endsWith('/**')).map((g) => g.slice(0, -3))
  const kept = [...globs]
    .filter((g) => !trees.some((t) => g !== `${t}/**` && (g === t || g.startsWith(`${t}/`))))
    .sort()
  return { inputs: kept.map((g) => `$TURBO_ROOT$/${g}`), env: dsh ? ['TRACY_DSH_COMMIT'] : [] }
}

const globCache = new Map()
/** A Turbo glob as a regular expression: `**` any depth, `*` and `?` within one path segment. */
function globRegExp(glob) {
  let re = globCache.get(glob)
  if (re) return re
  let src = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        src += '(?:.*/)?'
        i += 2
      } else {
        src += '.*'
        i += 1
      }
    } else if (c === '*') src += '[^/]*'
    else if (c === '?') src += '[^/]'
    else src += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  re = new RegExp(`^${src}$`)
  globCache.set(glob, re)
  return re
}

/**
 * Whether a list of root-relative globs (negations start with `!`) selects a path.
 * @param {readonly string[]} globs
 * @param {string} file
 */
export function covers(globs, file) {
  let hit = false
  for (const g of globs) {
    if (g.startsWith('!')) {
      if (globRegExp(g.slice(1)).test(file)) return false
    } else if (!hit && globRegExp(g).test(file)) hit = true
  }
  return hit
}

/**
 * A task's configured `inputs` as root-relative globs.
 * @param {readonly string[]} inputs - as written in a turbo.json (`$TURBO_DEFAULT$`, `$TURBO_ROOT$/…`).
 * @param {string} directory - the task's package directory, `''` for a root task.
 */
export function rootGlobs(inputs, directory) {
  return inputs.map((raw) => {
    const neg = raw.startsWith('!') ? '!' : ''
    const glob = neg ? raw.slice(1) : raw
    if (glob === '$TURBO_DEFAULT$') return `${neg}${directory ? `${directory}/` : ''}**`
    if (glob.startsWith('$TURBO_ROOT$/')) return `${neg}${glob.slice('$TURBO_ROOT$/'.length)}`
    return `${neg}${directory ? `${directory}/` : ''}${glob}`
  })
}

/**
 * Sorts what a task read by how its hash accounts for it.
 *
 * @param {object} input
 * @param {readonly string[]} input.reads - traced lines (repo-relative; `<dir>/**` = listed recursively).
 * @param {readonly string[]} input.globs - the task's inputs, root-relative (`rootGlobs`).
 * @param {readonly string[]} input.env - the task's `env`.
 * @param {ReadonlySet<string> | null} input.hashed - the files Turbo says it hashes for the task
 *   (its dry run), or null to judge files by the globs alone.
 * @param {(rel: string) => 'file' | 'dir' | 'absent'} input.kind
 * @param {(rel: string) => boolean} input.isIgnored - whether git ignores the path.
 * @param {readonly { path: string, sources?: readonly string[], localOnly?: boolean }[]} [input.generated] -
 *   the declared ignored paths (`GENERATED`).
 * @returns {{ hashed: string[], submodule: string[], outputs: string[], local: string[], absent: string[], uncovered: string[] }}
 *   `hashed` = an input (a file Turbo hashes, a directory whose entries it hashes, or a path that
 *   does not exist yet and would be hashed once it did); `submodule` = inside dsh, stood for by
 *   TRACY_DSH_COMMIT; `outputs` = ignored by git, DECLARED as generated, and every declared source
 *   of it is an input of this task; `local` = ignored by git, DECLARED as a machine's own file, and
 *   absent from this tree (so the result measured here did not depend on it); `absent` = not
 *   ignored, does not exist, and no input would cover it if it did (reported only); `uncovered` = the
 *   task's hash does not change when this path does — every other ignored read and git's own
 *   directory included. Only `uncovered` is a failure.
 */
export function classifyReads({ reads, globs, env, hashed, kind, isIgnored, generated = [] }) {
  const result = { hashed: [], submodule: [], outputs: [], local: [], absent: [], uncovered: [] }
  const isInput = (src) =>
    src.endsWith('/') ? covers(globs, `${src}a`) : hashed ? hashed.has(src) : covers(globs, src)
  const seen = new Set()
  for (const raw of reads) {
    const { file, recursive } = parseRead(raw)
    const key = recursive ? `${file}/**` : file
    if (!file || IGNORED.test(file) || seen.has(key)) continue
    seen.add(key)
    if (file === DSH || file.startsWith(`${DSH}/`)) {
      ;(env.includes('TRACY_DSH_COMMIT') ? result.submodule : result.uncovered).push(key)
    } else if (isGit(file)) result.uncovered.push(key)
    else if (isIgnored(file)) {
      const entry = generatedEntry(file, generated)
      if (!entry) result.uncovered.push(key)
      else if (entry.localOnly) (kind(file) === 'absent' ? result.local : result.uncovered).push(key)
      else
        (entry.sources.length > 0 && entry.sources.every(isInput) ? result.outputs : result.uncovered).push(
          key
        )
    } else {
      const what = recursive ? 'dir' : kind(file)
      // A path that does not exist is covered when it would be hashed once it did, as a file or as
      // a directory with something in it (`apps/.webroot` under the input `apps/.webroot/**`).
      const ok =
        what === 'dir'
          ? covers(globs, recursive ? `${file}/a/b` : `${file}/a`)
          : what === 'file'
            ? hashed
              ? hashed.has(file)
              : covers(globs, file)
            : covers(globs, file) || covers(globs, `${file}/a`)
      // A path that does not exist and is not an input is REPORTED, not failed: nothing on it could
      // have decided this run. Measured 12/10/2026: a background sweep in the tracy-host suite looks
      // for `<entry>/.webroot` under whatever directory it is handed, and three runs probed three
      // different sets of such paths — a gate that failed on them would be red at random.
      ;(ok ? result.hashed : what === 'absent' ? result.absent : result.uncovered).push(key)
    }
  }
  for (const list of Object.values(result)) list.sort()
  return result
}
