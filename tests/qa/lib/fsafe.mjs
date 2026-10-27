// Filesystem helpers that refuse symlinks, FIFOs, directories-as-files and path escapes.
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdtempSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { readTextSync } from './bounded-reader.mjs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BoundedReadError, readBoundedAsync } from './bounded-reader.mjs'

export const MAX_JSON_BYTES = 32 * 1024 * 1024

export class UnsafePathError extends Error {}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

// null only when the leaf itself is absent AND its parent is a directory that exists; a missing or
// non-directory parent (ENOTDIR, a broken link, a file) is a refusal with its own reason, never "absent".
export async function lstatOrNull(file) {
  try {
    return await fs.lstat(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const parent = path.dirname(file)
    let info
    try {
      info = await fs.lstat(parent)
    } catch (parentError) {
      throw new UnsafePathError(
        `${file}: parent directory ${parent} cannot be inspected (${parentError.code ?? parentError.message})`,
        {
          cause: parentError
        }
      )
    }
    if (info.isSymbolicLink())
      throw new UnsafePathError(`${file}: parent ${parent} is a symlink`, { cause: error })
    if (!info.isDirectory())
      throw new UnsafePathError(`${file}: parent ${parent} is not a directory`, { cause: error })
    return null
  }
}

// Reads a regular file; null when absent. Symlinks, FIFOs, devices and directories throw. The policy
// (O_NOFOLLOW | O_NONBLOCK, fstat before and after, at most maxBytes + 1 bytes read) is the shared
// bounded reader's; `hooks` is its test seam that lets a selftest change the file at each step.
export async function readRegularFile(file, { maxBytes = MAX_JSON_BYTES, hooks = {} } = {}) {
  try {
    return await readBoundedAsync(file, { maxBytes, allowMissing: true, hooks })
  } catch (error) {
    if (error instanceof BoundedReadError) throw new UnsafePathError(error.message, { cause: error })
    throw error
  }
}

export async function readJsonFile(file, options) {
  const buffer = await readRegularFile(file, options)
  if (buffer === null) return null
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch (error) {
    throw new UnsafePathError(`${file}: invalid JSON (${error.message})`, { cause: error })
  }
}

// Names of the regular files directly in `dir` that end with `suffix`, sorted. Absent dir → [].
export async function listRegularFiles(dir, suffix) {
  const info = await lstatOrNull(dir)
  if (!info) return []
  if (!info.isDirectory()) throw new UnsafePathError(`${dir}: not a directory`)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.name.endsWith(suffix))
    .map((e) => ({ name: e.name, regular: e.isFile() }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
}

// Resolve `relative` under `root`; absolute paths, `..` segments, NUL bytes and symlinked
// components that leave the root are refused. The target itself need not exist, but its parent must.
export async function containedPath(root, relative) {
  if (typeof relative !== 'string' || relative === '' || relative.includes('\0')) {
    throw new UnsafePathError(`bad path ${JSON.stringify(relative)}`)
  }
  if (path.isAbsolute(relative)) throw new UnsafePathError(`${relative}: absolute path not allowed`)
  const segments = relative.split(/[\\/]+/)
  if (segments.includes('..')) throw new UnsafePathError(`${relative}: traversal not allowed`)
  const realRoot = await fs.realpath(root)
  let current = realRoot
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    const next = path.join(current, segment)
    const info = await lstatOrNull(next)
    if (!info) {
      current = next
      continue
    }
    if (info.isSymbolicLink()) throw new UnsafePathError(`${relative}: symlink component refused`)
    current = next
  }
  if (current !== realRoot && !current.startsWith(realRoot + path.sep)) {
    throw new UnsafePathError(`${relative}: escapes ${root}`)
  }
  return current
}

export async function atomicWrite(file, data) {
  const temp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  const handle = await fs.open(temp, 'wx', 0o644)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(temp, file)
  } catch (error) {
    await fs.rm(temp, { force: true })
    throw error
  }
}

export const writeJson = (file, value) => atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`)

// Canonical JSON (sorted keys) so a hash does not depend on key order.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export const hashJson = (value) => sha256(canonicalJson(value))

// Creates a fresh run directory `<root>/<stamp>-<name>[-n]`; never reuses an existing one.
export async function createUniqueDir(root, base) {
  await fs.mkdir(root, { recursive: true })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const dir = path.join(root, attempt === 0 ? base : `${base}-${attempt + 1}`)
    try {
      await fs.mkdir(dir)
      return dir
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  throw new Error(`could not create a unique directory for ${base} under ${root}`)
}

export const utcStamp = (date) =>
  date
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(/[-:]/g, '')

export const RESERVATION_FILE = '.qa-reserved'

// Claims a run directory for one run: the exclusive create fails (EEXIST) for any second claimant.
// The record says which layer, target and area the run is for, so a run that never finished can
// still be recognised (and shadow older complete runs) when coverage looks for the latest one.
export async function reserveDir(dir, info) {
  const handle = await fs.open(path.join(dir, RESERVATION_FILE), 'wx', 0o644)
  try {
    await handle.writeFile(`${JSON.stringify({ ...info, pid: process.pid })}\n`)
  } finally {
    await handle.close()
  }
}

// Refuses a path with a symlink component. The only symlinks allowed are the ones sitting
// directly under `/` (macOS maps /var, /tmp and /etc that way); components that do not exist yet
// are fine. This is what keeps an output root from being redirected outside the tree.
export async function assertNoSymlinkPath(absolute) {
  const parts = path.resolve(absolute).split(path.sep).filter(Boolean)
  let current = path.sep
  for (const part of parts) {
    const next = path.join(current, part)
    const info = await lstatOrNull(next)
    if (!info) return
    if (info.isSymbolicLink() && current !== path.sep)
      throw new UnsafePathError(`${next}: symlink in the path of ${absolute} refused`)
    if (info.isSymbolicLink()) current = await fs.realpath(next)
    else current = next
  }
}

/** Bytes a unix socket path may hold: `sun_path` is 104 on macOS and 108 on Linux, the NUL included. */
export const SOCKET_PATH_BYTES = 103
/** Room a socket scratch keeps under its directory for the socket's own name (`/` included). */
export const SOCKET_NAME_ROOM = 41
/** The file holding a scratch directory's ownership token; nothing else may remove the directory. */
export const SCRATCH_OWNER_FILE = '.qa-scratch-owner'
const SCRATCH_PURPOSES = new Set(['socket', 'workspace'])

/** A scratch directory this run created could not be removed: the run is TEST_INVALID, not finished. */
export class ScratchCleanupError extends Error {
  constructor(message, { callbackError = null } = {}) {
    super(message)
    this.code = 'TEST_INVALID'
    this.callbackError = callbackError
  }
}

// `/tmp` keeps socket paths short (macOS' per-user temp dir alone is ~50 bytes); a task's artifact path
// never holds scratch, so TMPDIR inherited from a long run directory is not used either.
const shortScratchRoot = () => (process.platform !== 'win32' && existsSync('/tmp') ? '/tmp' : tmpdir())

/**
 * Remove `dir` only when it is still the directory `created` describes. It is first renamed into a fresh
 * private directory with an unpredictable name (`mkdtemp`, mode 0700), and only that moved entry is checked
 * (same device and inode, then `check`) and removed; an entry that fails the check is put back. A process that
 * knows `dir` (a child of the run, a later run reusing the name) can swap what sits there, but never what is
 * removed. Node has no remove-by-handle, so a same-user process that finds the private directory and swaps the
 * moved entry between check and removal is outside what this guards.
 * @param {string} dir - the directory to remove.
 * @param {import('node:fs').Stats} created - its `lstat` when it was created.
 * @param {(held: string) => string|null} check - a further check on the moved entry; a string says why not.
 * @returns {string|null} null when removed (or already gone), else why it was not.
 */
function removeIfCreated(dir, created, check) {
  let hold
  try {
    hold = mkdtempSync(path.join(path.dirname(dir), `qa-hold-${randomBytes(6).toString('hex')}-`))
  } catch (e) {
    return `${dir}: no private place to move it before removal (${e.message})`
  }
  const held = path.join(hold, 'entry')
  let error = null
  let moved = false
  try {
    renameSync(dir, held)
    moved = true
    const st = lstatSync(held)
    if (!st.isDirectory() || st.isSymbolicLink()) error = `${dir} is no longer a directory; not removed`
    else if (st.dev !== created.dev || st.ino !== created.ino)
      error = `${dir} is not the directory this run created; not removed`
    else error = check(held)
    if (error === null) {
      rmSync(held, { recursive: true })
      moved = false
    }
  } catch (e) {
    if (moved || e.code !== 'ENOENT' || existsSync(dir)) error = `${dir}: ${e.message}`
  }
  if (moved && error !== null) {
    try {
      renameSync(held, dir)
    } catch (e) {
      error = `${error}; it was left at ${held} (${e.message})`
      return error
    }
  }
  try {
    rmdirSync(hold)
  } catch (e) {
    error = `${error ?? `${dir} was removed`}; ${hold} was left behind (${e.message})`
  }
  return error
}

/**
 * Create a scratch directory owned by one run: a fresh `mkdtemp` under a short system root with an ownership
 * token inside. A `socket` scratch must leave room for a socket name under the unix path limit.
 * @param {string} run - the run's identity (recorded in the token file, not in the path).
 * @param {'socket'|'workspace'} purpose - what the directory is for.
 * @param {{writeOwner?: typeof writeFileSync}} [io] - the token writer (a test injects a failing one).
 * @returns {{path: string, env: {TMPDIR: string}, dispose: () => {ok: boolean, error: string|null}}} the
 *   directory, the environment that points a child at it, and the one call that removes it. `dispose` never
 *   throws, and removes the directory only when it is the very one created here still carrying this token
 *   (`removeIfCreated`); otherwise it reports why.
 * @throws {Error} when the token cannot be written; the directory is rolled back the same way (identity
 *   checked, so a directory swapped in meanwhile is put back) and the error names it.
 */
export function createOwnedScratch(run, purpose, { writeOwner = writeFileSync } = {}) {
  if (!SCRATCH_PURPOSES.has(purpose)) throw new TypeError(`unknown scratch purpose ${purpose}`)
  const dir = mkdtempSync(path.join(shortScratchRoot(), `qa-${purpose === 'socket' ? 's' : 'w'}-`))
  const created = lstatSync(dir)
  const token = randomBytes(16).toString('hex')
  const ownerFile = path.join(dir, SCRATCH_OWNER_FILE)
  let outcome = null
  const dispose = () => {
    if (outcome !== null) return outcome
    const error = removeIfCreated(dir, created, (held) =>
      JSON.parse(readTextSync(path.join(held, SCRATCH_OWNER_FILE), { maxBytes: 4096 })).token === token
        ? null
        : `${dir} carries another owner's token; not removed`
    )
    outcome = { ok: error === null, error }
    return outcome
  }
  try {
    writeOwner(ownerFile, `${JSON.stringify({ run: String(run), purpose, token, pid: process.pid })}\n`, {
      flag: 'wx',
      mode: 0o600
    })
  } catch (e) {
    const left = removeIfCreated(dir, created, () => null)
    throw new Error(
      `scratch owner token could not be written in ${dir}: ${e.message}${left === null ? '' : `; ${left}`}`,
      { cause: e }
    )
  }
  if (purpose === 'socket' && Buffer.byteLength(dir) + SOCKET_NAME_ROOM > SOCKET_PATH_BYTES) {
    const removed = dispose()
    throw new Error(
      `a socket scratch under ${shortScratchRoot()} is too long for a unix socket path (${dir})` +
        (removed.ok ? '' : `; ${removed.error}`)
    )
  }
  return { path: dir, env: { TMPDIR: dir }, dispose }
}

/**
 * Run `callback(scratch)` with an owned scratch directory and remove it afterwards, whatever happened.
 * The callback's error and a cleanup failure are kept together: a scratch that could not be removed throws
 * `ScratchCleanupError` (TEST_INVALID) carrying the callback's own error, so neither hides the other.
 * @template T
 * @param {string} run - the run's identity.
 * @param {'socket'|'workspace'} purpose - what the directory is for.
 * @param {(scratch: ReturnType<typeof createOwnedScratch>) => Promise<T>|T} callback - the work.
 * @returns {Promise<T>} what the callback returned.
 */
export async function withOwnedScratch(run, purpose, callback) {
  const scratch = createOwnedScratch(run, purpose)
  let failure = null
  let result
  try {
    result = await callback(scratch)
  } catch (error) {
    failure = error
  }
  const cleanup = scratch.dispose()
  if (!cleanup.ok)
    throw new ScratchCleanupError(`scratch was not removed: ${cleanup.error}`, { callbackError: failure })
  if (failure !== null) throw failure
  return result
}
