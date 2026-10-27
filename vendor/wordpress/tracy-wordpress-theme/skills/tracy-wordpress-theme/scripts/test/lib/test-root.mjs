// Scratch directories for the fixture tests: under $THEME_PORT_TEST_ROOT (or $TRACY_TEST_ROOT, $P4_TEST_ROOT) when set, so a
// task keeps every fixture, lock and log in one directory; else a temporary one. Removed after the run.
// TMPDIR is left as it is: sockets and tools that need a short path keep theirs.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { after } from 'node:test'
/** The directory scratch is made in: the task's own when one is named (created if missing), else the OS temporary directory. */
export function testBase() {
  const base = process.env.THEME_PORT_TEST_ROOT || process.env.TRACY_TEST_ROOT || process.env.P4_TEST_ROOT
  if (!base) return tmpdir()
  mkdirSync(base, { recursive: true })
  return path.resolve(base)
}
export function testDir(prefix) {
  const dir = mkdtempSync(path.join(testBase(), `${prefix}-`))
  after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/**
 * A scratch machine for the tests of paths in kept records (lib/record-paths.mjs): `home/` (the home directory of the
 * test), in it a repository `home/work/repo` (a `.git` marks it) holding a dossier `tasks/site`, and a data directory
 * `home/data/site` outside the repository. `opts` is what the helpers take.
 */
export function machine() {
  const root = testDir('machine')
  const home = path.join(root, 'home')
  const repo = path.join(home, 'work', 'repo')
  mkdirSync(path.join(repo, '.git'), { recursive: true })
  mkdirSync(path.join(repo, 'tasks', 'site'), { recursive: true })
  mkdirSync(path.join(home, 'data', 'site'), { recursive: true })
  return { root, home, repo, dossier: path.join(repo, 'tasks', 'site'), data: path.join(home, 'data', 'site'), opts: { repoRoot: repo, home } }
}
/** Run `fn` with the process's home directory set to `home` (os.homedir() reads HOME), restored afterwards. */
export function withHome(home, fn) {
  const before = process.env.HOME
  process.env.HOME = home
  try {
    if (homedir() !== home) throw new Error('the test needs os.homedir() to follow HOME')
    return fn()
  } finally {
    if (before === undefined) delete process.env.HOME
    else process.env.HOME = before
  }
}
