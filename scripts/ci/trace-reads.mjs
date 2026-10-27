/**
 * Records every repository file a test run reads or imports (12/10/2026, Turbo pilot).
 *
 * WHY. Turborepo reuses a test result only while the hash of the task's `inputs` is unchanged, so
 * a test that reads a file nobody declared can come back green from the cache after that file
 * changed. Many suites here read other packages by PATH (apps/tracy-web loads tracy-seeder and the
 * quickstart contracts without a package.json dependency), so `inputs` cannot be guessed from the
 * workspace graph or from grep. This preload measures them instead.
 *
 * USE. `TRACY_TRACE_READS_OUT=<file> NODE_OPTIONS="--import=<abs path to this file>" node --test …`
 * NODE_OPTIONS reaches the child processes a suite spawns, so their reads are recorded too. Each
 * process appends repo-relative paths, one per line, to the output file AS IT READS THEM (a child a
 * test kills with a signal never reaches an `exit` handler). A directory listed with
 * `recursive: true` is written as `<dir>/**`. `scripts/ci/turbo-inputs.mjs` folds the lines into
 * per-task `inputs`.
 *
 * 🔒 `syncBuiltinESMExports()` AFTER THE WRAPPING IS THE WHOLE POINT (12/10/2026). Assigning
 * `fs.readFileSync = traced` changes the default export only; `import { readFileSync } from
 * 'node:fs'` binds the ORIGINAL function until the builtin's named exports are synchronised. Almost
 * every test file here uses the named form, so before this line the trace held the modules a suite
 * imported and next to none of the files it read: 14 files under `scripts/test/` read
 * `.github/workflows` or `deploy/.env.example` and neither path was ever an input.
 *
 * WHAT IT CANNOT SEE. A file opened by a program that is not node (`php`, `git`, `bash`, `docker`),
 * or by a node child a test starts with an `env` of its own that drops NODE_OPTIONS: only the
 * program, its working directory and the repository paths on its command line are recorded. Reads inside `node_modules` are recorded only when the path is a link into the
 * repository (a workspace package); third-party packages are hashed through the lockfile.
 */
import childProcess from 'node:child_process'
import fs from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const out = process.env.TRACY_TRACE_READS_OUT
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

if (out) {
  // The originals, taken before anything is wrapped: the tracer's own IO is never traced.
  const { openSync, writeSync, realpathSync, existsSync } = fs
  const seen = new Set()
  let fd = null
  const emit = (rel) => {
    if (seen.has(rel)) return
    seen.add(rel)
    try {
      fd ??= openSync(out, 'a')
      // One short O_APPEND write per path: whole lines even with many processes on one file.
      writeSync(fd, `${rel}\n`)
    } catch {}
  }

  /** `<…>/node_modules/[@scope/]name` → where that link really points, once per package directory. */
  const linked = new Map()
  const throughNodeModules = (abs) => {
    const parts = abs.split(path.sep)
    const at = parts.lastIndexOf('node_modules')
    const end = at + (parts[at + 1]?.startsWith('@') ? 3 : 2)
    if (parts.length < end) return null
    const dir = parts.slice(0, end).join(path.sep)
    let real = linked.get(dir)
    if (real === undefined) {
      try {
        real = realpathSync(dir)
      } catch {
        real = null
      }
      linked.set(dir, real)
    }
    if (real === null) return null
    return path.join(real, ...parts.slice(end))
  }

  const note = (target, suffix = '') => {
    try {
      const raw =
        typeof target === 'string'
          ? target
          : target instanceof URL
            ? fileURLToPath(target)
            : Buffer.isBuffer(target)
              ? target.toString()
              : null
      if (!raw) return
      let abs = path.resolve(raw)
      if (abs.split(path.sep).includes('node_modules')) {
        abs = throughNodeModules(abs)
        if (abs === null || abs.split(path.sep).includes('node_modules')) return
      }
      if (!abs.startsWith(`${root}${path.sep}`)) return
      emit(`${path.relative(root, abs).split(path.sep).join('/')}${suffix}`)
    } catch {}
  }

  const recursive = (options) =>
    options !== null && typeof options === 'object' && options.recursive === true ? '/**' : ''

  const wrap = (obj, name, { listing = false } = {}) => {
    const original = obj[name]
    if (typeof original !== 'function') return
    const traced = function traced(target, ...rest) {
      note(target, listing ? recursive(rest[listing === 'cp' ? 1 : 0]) : '')
      return original.call(this, target, ...rest)
    }
    // `fs.realpathSync.native`, `fs.exists[util.promisify.custom]` and the like stay reachable.
    Object.defineProperties(traced, Object.getOwnPropertyDescriptors(original))
    traced.tracyTraced = true
    obj[name] = traced
  }
  for (const name of [
    'readFileSync',
    'readFile',
    'existsSync',
    'exists',
    'accessSync',
    'access',
    'statSync',
    'stat',
    'lstatSync',
    'lstat',
    'realpathSync',
    'realpath',
    'readlinkSync',
    'readlink',
    'createReadStream',
    'openSync',
    'open',
    'copyFileSync',
    'copyFile',
    'openAsBlob'
  ])
    wrap(fs, name)
  for (const name of ['readdirSync', 'readdir', 'opendirSync', 'opendir']) wrap(fs, name, { listing: true })
  for (const name of ['cpSync', 'cp']) wrap(fs, name, { listing: 'cp' })
  for (const name of ['readFile', 'stat', 'lstat', 'realpath', 'readlink', 'open', 'access', 'copyFile'])
    wrap(fs.promises, name)
  for (const name of ['readdir', 'opendir']) wrap(fs.promises, name, { listing: true })
  wrap(fs.promises, 'cp', { listing: 'cp' })

  // A child that is not node reads without us, and so does a node child that is handed an `env`
  // of its own without NODE_OPTIONS. What can be known is recorded: the program, the directory it
  // runs in and every argument that names something in the repository. The child's environment is
  // NOT touched: a suite that checks what a child process may see (`qa-run-agent.test.mjs`) went
  // red the one time the tracer put its two variables back, and a measurement must not change the
  // tests it measures.
  const noteCommand = (command, args, options) => {
    try {
      const cwd = typeof options?.cwd === 'string' || options?.cwd instanceof URL ? options.cwd : null
      const base = cwd === null ? process.cwd() : path.resolve(cwd instanceof URL ? fileURLToPath(cwd) : cwd)
      if (cwd !== null) note(base)
      for (const word of [command, ...args]) {
        if (typeof word !== 'string' || word.length === 0 || word.length > 1024 || word.startsWith('-'))
          continue
        const abs = path.resolve(base, word)
        if (abs.startsWith(`${root}${path.sep}`) && existsSync(abs)) note(abs)
      }
    } catch {}
  }
  const wrapSpawn = (name, shell) => {
    const original = childProcess[name]
    if (typeof original !== 'function') return
    const traced = function traced(command, ...rest) {
      const args = Array.isArray(rest[0]) ? rest[0] : []
      const options = rest.find((r) => r !== null && typeof r === 'object' && !Array.isArray(r))
      // A shell line is split on blanks: enough to find the paths it names, and nothing is run from it.
      if (shell && typeof command === 'string') noteCommand('', command.split(/\s+/), options)
      else noteCommand(command, args, options)
      return original.call(this, command, ...rest)
    }
    Object.defineProperties(traced, Object.getOwnPropertyDescriptors(original))
    childProcess[name] = traced
  }
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) wrapSpawn(name, false)
  for (const name of ['exec', 'execSync']) wrapSpawn(name, true)

  syncBuiltinESMExports()

  registerHooks({
    resolve(specifier, context, next) {
      const result = next(specifier, context)
      if (result.url?.startsWith('file:')) note(new URL(result.url))
      return result
    }
  })
}
