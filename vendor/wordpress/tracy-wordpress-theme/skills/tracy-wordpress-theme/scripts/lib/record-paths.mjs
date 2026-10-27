// How a path is written into a record that is kept (a dossier file, a spec-pack, a release's
// VERIFICATION.json, a run record) — and how it is read back.
//
// A kept record is shared: it must not say how one contributor's machine is laid out. So at the
// moment a record is serialized, and only there:
//   - a path inside the repository the record belongs to is written relative to that repository's
//     root, with `/` separators (`tasks/<site>/design-contract.json`);
//   - a path outside it, under the home directory, is written with the home directory as `~`
//     (`~/tracy-data/<site>/j6`);
//   - a path under a NAMED ROOT is written from that root, as `<name>/…` — for a directory that is neither the
//     repository nor a place worth naming: a task's artifact or scratch directory, a runner's state directory.
//     Such a directory names a machine AND a run; `<artifacts>/round-1/report.json` keeps what the record needs.
//     A tool passes the roots it knows (`roots: [{ name, dir }]`); `TRACY_RECORD_ROOTS` adds more for every tool
//     (`name=/abs/dir` entries joined by the path delimiter). A named root wins over the repository and home;
//   - any other path is written as it is.
// Tools keep absolute paths for every file system operation and every child process; this module
// only changes the representation at the write boundary. `resolveRecordPath` reads all three
// forms, and an absolute path written by an older tool (or on another branch) is returned as it is.
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const HOME_MARK = '~'
const ROOT_NAME = /^[a-z][a-z0-9-]*$/

/** The named roots in force: those the caller gives, then those of TRACY_RECORD_ROOTS; the deepest directory first. */
export function namedRoots(roots = [], env = process.env.TRACY_RECORD_ROOTS) {
  const fromEnv = String(env ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((e) => ({ name: e.slice(0, Math.max(0, e.indexOf('='))), dir: e.slice(e.indexOf('=') + 1) }))
  const out = []
  for (const r of [...(roots ?? []), ...fromEnv]) {
    if (!r || r.dir === null || r.dir === undefined || r.dir === '') continue
    if (typeof r.name !== 'string' || !ROOT_NAME.test(r.name)) throw new Error(`a named root is called by a lower-case word, got ${JSON.stringify(r.name)}`)
    if (typeof r.dir !== 'string' || !path.isAbsolute(r.dir)) throw new Error(`the named root ${r.name} is not an absolute directory: ${JSON.stringify(r.dir)}`)
    const dir = path.resolve(r.dir)
    if (dir !== path.parse(dir).root && !out.some((x) => x.name === r.name)) out.push({ name: r.name, dir })
  }
  return out.sort((a, b) => b.dir.length - a.dir.length)
}

/** The root of the Git repository (or worktree) that holds `start`: the nearest directory with a `.git`, or null. */
export function repoRootOf(start) {
  if (typeof start !== 'string' || !start) return null
  let dir = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/**
 * The ways a root directory is named: as given, and — when it exists and a component of it is a link (a temporary
 * directory such as /var → /private/var, a linked home) — by its real path, which is what the working directory and
 * every path resolved against it carry.
 */
function aliases(root) {
  if (!root) return []
  const given = path.resolve(root)
  try {
    const real = realpathSync(given)
    return real === given ? [given] : [given, real]
  } catch {
    return [given]
  }
}

/** `p` relative to `root` (under any of its names) when it is `root` or lies under it, by path components (`/a/bc` is not under `/a/b`); else null. */
function under(root, p) {
  for (const dir of aliases(root)) {
    const rel = path.relative(dir, p)
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue
    return rel.split(path.sep).join('/')
  }
  return null
}

/**
 * One path as a record holds it. The repository wins over the home directory, so a checkout that
 * lives under the home directory is still written repository-relative. Not an absolute path → unchanged.
 */
export function recordPath(p, { repoRoot = null, home = homedir(), roots = [] } = {}) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return p
  const abs = path.resolve(p)
  for (const r of namedRoots(roots)) {
    const inRoot = under(r.dir, abs)
    if (inRoot !== null) return inRoot === '' ? `<${r.name}>` : `<${r.name}>/${inRoot}`
  }
  const inRepo = under(repoRoot, abs)
  if (inRepo !== null) return inRepo === '' ? '.' : inRepo
  const inHome = under(home, abs)
  if (inHome !== null) return inHome === '' ? HOME_MARK : `${HOME_MARK}/${inHome}`
  return p
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A root counts only as whole components: not after a path character, and followed by `/` or by the end of the path.
const rootRe = (root) => new RegExp(`(?<![\\w.~/-])${escapeRe(root)}(/+|(?![\\w.~-]))`, 'g')

/** Free text (a reason, a command line, a note) with every path in it written as `recordPath` writes one. */
export function recordText(text, { repoRoot = null, home = homedir(), roots = [] } = {}) {
  if (typeof text !== 'string') return text
  let out = text
  // every name of a root (see aliases), the file system root never
  const each = (root, to) => {
    for (const dir of aliases(root)) if (dir !== path.parse(dir).root) out = out.replace(rootRe(dir.split(path.sep).join('/')), (_m, slash) => to(slash))
  }
  for (const r of namedRoots(roots)) each(r.dir, (slash) => (slash ? `<${r.name}>/` : `<${r.name}>`))
  each(repoRoot, (slash) => (slash ? '' : '.'))
  each(home, (slash) => (slash ? `${HOME_MARK}/` : HOME_MARK))
  return out
}

/** A JSON value with every string in it (at any depth; keys are left alone) passed through `recordText`. */
export function recordData(value, opts = {}) {
  if (typeof value === 'string') return recordText(value, opts)
  if (Array.isArray(value)) return value.map((v) => recordData(v, opts))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, recordData(v, opts)]))
  return value
}

/**
 * The absolute path a recorded one names: `<name>/…` under that named root (which must be given: a record does not
 * say where a run's directory was), `~/…` under the home directory, a relative one under `repoRoot` (required for
 * that form), an absolute one — what older tools wrote — as it is.
 */
export function resolveRecordPath(recorded, { repoRoot = null, home = homedir(), roots = [] } = {}) {
  if (typeof recorded !== 'string' || !recorded) throw new Error(`a recorded path is a non-empty string, got ${JSON.stringify(recorded)}`)
  const named = /^<([a-z][a-z0-9-]*)>(?:\/(.*))?$/.exec(recorded)
  if (named) {
    const root = namedRoots(roots).find((r) => r.name === named[1])
    if (!root) throw new Error(`${recorded} is relative to the named root <${named[1]}> and none was given`)
    return path.resolve(root.dir, named[2] ?? '')
  }
  if (recorded === HOME_MARK) return path.resolve(home)
  if (recorded.startsWith(`${HOME_MARK}/`)) return path.resolve(home, recorded.slice(2))
  if (path.isAbsolute(recorded)) return path.resolve(recorded)
  if (!repoRoot) throw new Error(`${recorded} is relative to a repository root and none was given`)
  return path.resolve(repoRoot, recorded)
}
