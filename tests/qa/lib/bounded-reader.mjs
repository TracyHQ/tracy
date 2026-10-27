// The one bounded reader for every file the QA suite treats as a contract input (denominators, case
// files, manifests, proof artifacts). Policy, in one place:
//   - open with O_NOFOLLOW | O_NONBLOCK, so a symlink is refused and a FIFO cannot block the open;
//   - only a regular file is read, judged by fstat on the descriptor we hold (not by a path);
//   - the size is checked before any byte is read, and at most maxBytes + 1 bytes are ever read;
//   - with `root` (a trusted anchor), every directory between root and the file must be a real directory:
//     a symlink, a file or a missing component anywhere on the way is refused, never read through;
//   - only the file itself being absent (ENOENT on a valid parent) is MISSING, and only `allowMissing`
//     turns that into null. A broken ancestor, ENOTDIR, a permission error, or a file that vanishes after
//     it was inspected is always an error;
//   - fstat again after the read: the size, the inode and the mtime must be what they were before, and
//     the bytes read must equal that size, so a file that grew, shrank or was rewritten is refused.
// Callers keep their own error class and message: they catch BoundedReadError and translate it by `code`,
// passing the original on as `cause`. Every refusal made from a failed system call carries that error as `cause`.
//   - without `root`, the file and its parent directory must not be symlinks; ancestors above the parent
//     are followed, because checkouts and CI work directories legitimately sit under symlinked paths
//     (/tmp on macOS).
// Out of scope, by decision: a tree that another process changes WHILE it is read (an ancestor swapped for
// a symlink between two system calls, a file replaced after open, a same-size overwrite with the mtime put
// back, a parent deleted between check and read). The suite reads files its own run wrote, nothing in its
// threat model writes into that tree concurrently, and no Node API closes those windows portably. So the
// before/after size, inode and mtime comparison below is all there is: no ctime, no extra re-lstat passes.
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync
} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHUNK_BYTES = 1024 * 1024
/** Ceiling for a contract file (denominator, case file, manifest) read by a layer. */
export const MAX_LAYER_FILE_BYTES = 32 * 1024 * 1024
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK

export class BoundedReadError extends Error {
  /** code: MISSING | ANCESTOR | VANISHED | ESCAPE | UNREADABLE | SYMLINK | NOT_REGULAR | TOO_LARGE | REPLACED | UNSTABLE | MALFORMED | BAD_LIMIT */
  constructor(message, code, fsCode, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'BoundedReadError'
    this.code = code
    /** The operating system's own code (ENOENT, EACCES...) when the refusal came from a failed system call. */
    this.fsCode = fsCode
  }
}

/** A path given as a file: URL (import.meta.url style) is the file it names; anything else is checked as a string. */
const asPath = (file) => (file instanceof URL ? fileURLToPath(file) : file)

function checkLimit(file, maxBytes) {
  if (typeof file !== 'string' || file === '' || file.includes('\0'))
    throw new BoundedReadError(`bad path ${JSON.stringify(file)}`, 'BAD_LIMIT')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new BoundedReadError(
      `${file}: maxBytes must be a finite non-negative integer, got ${String(maxBytes)}`,
      'BAD_LIMIT'
    )
}

const tooLarge = (file, maxBytes) =>
  new BoundedReadError(`${file}: larger than ${maxBytes} bytes`, 'TOO_LARGE')
const notRegular = (file, code = 'NOT_REGULAR') =>
  new BoundedReadError(`${file}: not a regular file (symlink, FIFO, directory or device refused)`, code)

/**
 * Maps an fs error from lstat/open to a BoundedReadError. Only ENOENT on the file itself is MISSING;
 * `inspected` says the file was already seen, so a later ENOENT means it vanished.
 */
function fromFs(file, error, inspected = false) {
  if (error?.code === 'ELOOP' || error?.code === 'EMLINK') {
    const refusal = notRegular(file, 'SYMLINK')
    refusal.cause = error
    return refusal
  }
  if (error?.code === 'ENOENT' && !inspected)
    return new BoundedReadError(`${file}: no such file (ENOENT)`, 'MISSING', 'ENOENT', error)
  if (error?.code === 'ENOENT')
    return new BoundedReadError(`${file}: vanished after it was inspected`, 'VANISHED', 'ENOENT', error)
  if (error?.code === 'ENOTDIR')
    return new BoundedReadError(
      `${file}: a path component is not a directory (ENOTDIR)`,
      'ANCESTOR',
      'ENOTDIR',
      error
    )
  return new BoundedReadError(
    `${file}: cannot be read (${error?.code ?? error?.message})`,
    'UNREADABLE',
    error?.code,
    error
  )
}

const ancestorError = (file, dir, why, fsCode, cause) =>
  new BoundedReadError(
    `${file}: ${dir} ${why}`,
    why.startsWith('is a symlink') ? 'SYMLINK' : 'ANCESTOR',
    fsCode,
    cause
  )

/** The directories that must be real directories for `file`: root's children down to its parent. */
function ancestorChain(file, root) {
  if (root === undefined) return { anchor: null, dirs: [path.dirname(file)] }
  if (typeof root !== 'string' || root === '' || root.includes('\0'))
    throw new BoundedReadError(`${file}: bad root ${JSON.stringify(root)}`, 'BAD_LIMIT')
  const anchor = path.resolve(root)
  const rel = path.relative(anchor, path.resolve(file))
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    throw new BoundedReadError(`${file}: outside ${anchor}`, 'ESCAPE')
  const parts = rel.split(path.sep)
  const dirs = [anchor]
  for (const part of parts.slice(0, -1)) dirs.push(path.join(dirs.at(-1), part))
  return { anchor, dirs }
}

function judgeDir(file, dir, info, followed) {
  if (!followed && info.isSymbolicLink()) throw ancestorError(file, dir, 'is a symlink', undefined)
  if (!info.isDirectory()) throw ancestorError(file, dir, 'is not a directory', 'ENOTDIR')
}

const judgeDirError = (file, dir, error) =>
  error instanceof BoundedReadError
    ? error
    : ancestorError(file, dir, `cannot be inspected (${error?.code ?? error?.message})`, error?.code, error)

/** Refuses a file whose path has a symlink, a non-directory or a missing component above it. */
export function assertPlainAncestorsSync(file, root) {
  const { anchor, dirs } = ancestorChain(file, root)
  for (const dir of dirs) {
    try {
      // The trusted anchor itself may be an alias (/var → /private/var): it is followed, below it nothing is.
      judgeDir(file, dir, dir === anchor ? statSync(dir) : lstatSync(dir), dir === anchor)
    } catch (error) {
      throw judgeDirError(file, dir, error)
    }
  }
}

export async function assertPlainAncestorsAsync(file, root) {
  const { anchor, dirs } = ancestorChain(file, root)
  for (const dir of dirs) {
    try {
      const followed = dir === anchor
      judgeDir(file, dir, followed ? await fs.stat(dir) : await fs.lstat(dir), followed)
    } catch (error) {
      throw judgeDirError(file, dir, error)
    }
  }
}

/**
 * Lists a directory under the same rules (plain ancestors, the directory itself not a symlink). Every
 * entry is returned as { name, full, kind } where kind is 'file' | 'dir' | 'other': the caller decides
 * what to do with 'other', but a FIFO, symlink or device is never silently dropped here.
 */
export function listBoundedDirSync(dir, { root } = {}) {
  assertPlainAncestorsSync(path.join(dir, '.listed'), root)
  return listEntries(dir, () => readdirSync(dir, { withFileTypes: true }))
}

export async function listBoundedDirAsync(dir, { root } = {}) {
  await assertPlainAncestorsAsync(path.join(dir, '.listed'), root)
  try {
    return mapEntries(dir, await fs.readdir(dir, { withFileTypes: true }))
  } catch (error) {
    throw new BoundedReadError(
      `${dir}: cannot be listed (${error?.code ?? error?.message})`,
      'UNREADABLE',
      error?.code,
      error
    )
  }
}

function listEntries(dir, read) {
  try {
    return mapEntries(dir, read())
  } catch (error) {
    throw new BoundedReadError(
      `${dir}: cannot be listed (${error?.code ?? error?.message})`,
      'UNREADABLE',
      error?.code,
      error
    )
  }
}

const mapEntries = (dir, entries) =>
  entries.map((entry) => ({
    name: entry.name,
    full: path.join(dir, entry.name),
    kind: entry.isSymbolicLink() ? 'other' : entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'
  }))

function checkInspected(file, info, maxBytes) {
  if (info.isSymbolicLink()) throw notRegular(file, 'SYMLINK')
  if (!info.isFile()) throw notRegular(file)
  if (info.size > maxBytes) throw tooLarge(file, maxBytes)
}

function checkOpened(file, opened, inspected, maxBytes) {
  if (!opened.isFile()) throw notRegular(file)
  if (inspected && (opened.dev !== inspected.dev || opened.ino !== inspected.ino))
    throw new BoundedReadError(`${file}: replaced between inspection and open`, 'REPLACED')
  if (opened.size > maxBytes) throw tooLarge(file, maxBytes)
}

function checkStable(file, opened, after, total) {
  if (
    after.size !== total ||
    after.size !== opened.size ||
    after.ino !== opened.ino ||
    after.dev !== opened.dev ||
    after.mtimeMs !== opened.mtimeMs
  )
    throw new BoundedReadError(`${file}: changed while being read`, 'UNSTABLE')
}

const nextChunk = (maxBytes, total) => Buffer.allocUnsafe(Math.min(CHUNK_BYTES, maxBytes + 1 - total))

/**
 * Reads a regular file of at most maxBytes. Returns a Buffer, or null when the path does not exist and
 * `allowMissing` is set. Anything else that is wrong throws BoundedReadError. `hooks` are a test seam
 * (afterLstat, afterHandleStat, afterChunk) that let a selftest change the file at each step.
 */
export function readBoundedSync(input, { maxBytes, allowMissing = false, root, hooks = {} } = {}) {
  const file = asPath(input)
  checkLimit(file, maxBytes)
  assertPlainAncestorsSync(file, root)
  let inspected
  try {
    inspected = lstatSync(file)
  } catch (error) {
    const refusal = fromFs(file, error)
    if (allowMissing && refusal.code === 'MISSING') return null
    throw refusal
  }
  checkInspected(file, inspected, maxBytes)
  hooks.afterLstat?.()
  let fd
  try {
    fd = openSync(file, OPEN_FLAGS)
  } catch (error) {
    throw fromFs(file, error, true)
  }
  try {
    const opened = fstatSync(fd)
    checkOpened(file, opened, inspected, maxBytes)
    hooks.afterHandleStat?.()
    const chunks = []
    let total = 0
    for (;;) {
      const chunk = nextChunk(maxBytes, total)
      const bytesRead = readSync(fd, chunk, 0, chunk.length, total)
      if (bytesRead === 0) break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
      if (total > maxBytes) throw tooLarge(file, maxBytes)
      hooks.afterChunk?.()
    }
    checkStable(file, opened, fstatSync(fd), total)
    return Buffer.concat(chunks, total)
  } catch (error) {
    if (error instanceof BoundedReadError) throw error
    throw new BoundedReadError(
      `${file}: cannot be read (${error?.code ?? error?.message})`,
      'UNREADABLE',
      error?.code,
      error
    )
  } finally {
    closeSync(fd)
  }
}

/** Same policy as readBoundedSync, without blocking the event loop; hooks may be async. */
export async function readBoundedAsync(input, { maxBytes, allowMissing = false, root, hooks = {} } = {}) {
  const file = asPath(input)
  checkLimit(file, maxBytes)
  await assertPlainAncestorsAsync(file, root)
  let inspected
  try {
    inspected = await fs.lstat(file)
  } catch (error) {
    const refusal = fromFs(file, error)
    if (allowMissing && refusal.code === 'MISSING') return null
    throw refusal
  }
  checkInspected(file, inspected, maxBytes)
  await hooks.afterLstat?.()
  let handle
  try {
    handle = await fs.open(file, OPEN_FLAGS)
  } catch (error) {
    throw fromFs(file, error, true)
  }
  try {
    const opened = await handle.stat()
    checkOpened(file, opened, inspected, maxBytes)
    await hooks.afterHandleStat?.()
    const chunks = []
    let total = 0
    for (;;) {
      const chunk = nextChunk(maxBytes, total)
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total)
      if (bytesRead === 0) break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
      if (total > maxBytes) throw tooLarge(file, maxBytes)
      await hooks.afterChunk?.()
    }
    checkStable(file, opened, await handle.stat(), total)
    return Buffer.concat(chunks, total)
  } catch (error) {
    if (error instanceof BoundedReadError) throw error
    throw new BoundedReadError(
      `${file}: cannot be read (${error?.code ?? error?.message})`,
      'UNREADABLE',
      error?.code,
      error
    )
  } finally {
    await handle.close()
  }
}

function parseJson(file, buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch (error) {
    throw new BoundedReadError(`${file}: invalid JSON (${error.message})`, 'MALFORMED', undefined, error)
  }
}

/** readBoundedSync, parsed as JSON; null when absent and `allowMissing`. */
export function readBoundedJsonSync(file, options) {
  const buffer = readBoundedSync(file, options)
  return buffer === null ? null : parseJson(file, buffer)
}

/** readBoundedAsync, parsed as JSON; null when absent and `allowMissing`. */
export async function readBoundedJsonAsync(file, options) {
  const buffer = await readBoundedAsync(file, options)
  return buffer === null ? null : parseJson(file, buffer)
}

// Convenience wrappers for the common shapes; the ceiling defaults to MAX_LAYER_FILE_BYTES. They never
// return null: a file that is absent is an error here (use readBounded* with allowMissing for optional ones).
const strict = (options) => ({ maxBytes: MAX_LAYER_FILE_BYTES, ...options, allowMissing: false })
export const readBytesSync = (file, options) => readBoundedSync(file, strict(options))
export const readTextSync = (file, options) => readBytesSync(file, options).toString('utf8')
export const readBytesAsync = (file, options) => readBoundedAsync(file, strict(options))
export const readTextAsync = async (file, options) => (await readBytesAsync(file, options)).toString('utf8')
