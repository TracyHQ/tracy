// Safe file access and artifact writing for the ui layer.
//
// Every read of a source file goes through `readRegular` (the shared bounded reader, confined to a root, so a symlink
// or a FIFO planted in a tree cannot redirect or hang the run) and every write goes through
// `writeAtomic` (temp file + rename inside the output directory, so an interrupted run never leaves
// a half-written artifact that a later run could mistake for a finished one).

import { createHash } from 'node:crypto'
import { constants, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { lstat, mkdir, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoundedReadError, readBoundedAsync } from '../../lib/bounded-reader.mjs'

export const LAYER_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(LAYER_DIR, '../../../..')

export class UnsafePathError extends Error {
  constructor(message, code, fsCode, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'UnsafePathError'
    this.code = code
    /** The operating system's own code (ENOENT, EACCES...) when the refusal came from a failed system call. */
    this.fsCode = fsCode
    /** True only when the file itself is absent under a verified parent (the one case readIfExists accepts). */
    this.absent = false
  }
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** Stable JSON: object keys sorted, so a regenerated file is byte-identical. */
export function stableStringify(value, space = 2) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])])
      )
    }
    return v
  }
  return `${JSON.stringify(sort(value), null, space)}\n`
}

/**
 * Read a regular file confined to `root`. Rejects symlinks anywhere in the final path, anything that
 * is not a regular file (FIFO, directory, device) and anything whose real path leaves `root`.
 */
export async function readRegular(
  file,
  { root = REPO_ROOT, encoding = 'utf8', maxBytes = 8 * 1024 * 1024 } = {}
) {
  const abs = path.resolve(file)
  // The shared bounded reader walks every directory between `root` and the file (none may be a symlink,
  // a file or missing), opens with O_NOFOLLOW | O_NONBLOCK and refuses a file that changes while read.
  let buffer
  try {
    buffer = await readBoundedAsync(abs, { maxBytes, root })
  } catch (error) {
    if (!(error instanceof BoundedReadError)) throw error
    const code = {
      SYMLINK: 'SYMLINK',
      NOT_REGULAR: 'NOT_REGULAR',
      REPLACED: 'NOT_REGULAR',
      TOO_LARGE: 'TOO_LARGE',
      UNSTABLE: 'UNSTABLE',
      ESCAPE: 'ESCAPE'
    }[error.code]
    const refusal = new UnsafePathError(error.message, code ?? 'UNREADABLE', error.fsCode, error)
    refusal.absent = error.code === 'MISSING'
    throw refusal
  }
  return encoding ? buffer.toString(encoding) : buffer
}

export async function readJson(file, options) {
  const text = await readRegular(file, options)
  if (!text.trim()) throw new UnsafePathError(`${file} is empty`, 'EMPTY')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new UnsafePathError(`${file} is not valid JSON: ${error.message}`, 'MALFORMED')
  }
}

const isInside = (parent, child) => {
  const rel = path.relative(parent, child)
  return rel === '' || !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
}

/** realpath of the deepest existing ancestor of `abs`, with the not-yet-created tail appended. */
function realpathOfFuture(abs) {
  let head = abs
  const tail = []
  while (!existsSync(head)) {
    const parent = path.dirname(head)
    if (parent === head) break
    tail.unshift(path.basename(head))
    head = parent
  }
  return path.join(realpathSync(head), ...tail)
}

/**
 * Every output of a run (artifact root, --out, --scratch-out, caches, screenshots, logs) must live
 * OUTSIDE the repository: a check or the pilot that writes into the tree it checks changes the thing
 * it measures. Judges both the lexical path and the real path of the deepest existing ancestor, so a
 * sibling that shares the repository's name prefix is fine and a symlink alias into the repo is not.
 * Throws before any directory is created.
 */
export function assertOutsideRepo(abs, what = 'output') {
  if (typeof abs !== 'string' || !abs.trim() || abs.includes('\0'))
    throw new UnsafePathError(`${what} is missing or malformed`, 'BAD_OUT')
  const resolved = path.resolve(abs)
  if (isInside(REPO_ROOT, resolved))
    throw new UnsafePathError(`${what} ${resolved} is inside the repository`, 'IN_REPO')
  if (isInside(realpathSync(REPO_ROOT), realpathOfFuture(resolved)))
    throw new UnsafePathError(`${what} ${resolved} resolves into the repository`, 'IN_REPO')
  return resolved
}

/** The artifact root: QA_UI_ARTIFACT_ROOT, else <tmpdir>/qa-ui. Validated outside the repository. */
export function artifactRootDir() {
  const raw = process.env.QA_UI_ARTIFACT_ROOT || path.join(tmpdir(), 'qa-ui')
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0'))
    throw new UnsafePathError('QA_UI_ARTIFACT_ROOT is empty or malformed', 'BAD_OUT')
  return assertOutsideRepo(path.resolve(raw), 'QA_UI_ARTIFACT_ROOT')
}

/**
 * Resolve an output directory: absolute, well-formed, outside the repository AND inside the artifact
 * root (lexically and by the real path of its deepest existing ancestor). Throws before any directory
 * is created; the artifact root itself is also a valid output.
 */
export function confineOutput(outDir, base = process.cwd(), what = 'output directory') {
  if (typeof outDir !== 'string' || !outDir.trim() || outDir.includes('\0')) {
    throw new UnsafePathError('output directory is empty or malformed', 'BAD_OUT')
  }
  const abs = assertOutsideRepo(path.resolve(base, outDir), what)
  const root = artifactRootDir()
  if (!isInside(root, abs) || !isInside(realpathOfFuture(root), realpathOfFuture(abs)))
    throw new UnsafePathError(`${what} ${abs} is not inside the artifact root ${root}`, 'OUTSIDE_ROOT')
  return abs
}

/** Join a relative evidence path under `dir`; throws when it would leave `dir`. */
export function insideDir(dir, relative) {
  const abs = path.resolve(dir, relative)
  const rel = path.relative(path.resolve(dir), abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new UnsafePathError(`${relative} escapes ${dir}`, 'TRAVERSAL')
  }
  return abs
}

/** Make `dir` (and parents), refusing a symlink or non-directory at the leaf. */
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
  const info = await lstat(dir)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new UnsafePathError(`${dir} is not a plain directory`, 'NOT_DIR')
  }
  return dir
}

let tmpCounter = 0

/** Write `data` to `file` atomically (temp + rename in the same directory). */
export async function writeAtomic(file, data) {
  const dir = path.dirname(file)
  await ensureDir(dir)
  try {
    const existing = await lstat(file)
    if (existing.isSymbolicLink() || existing.isDirectory()) {
      throw new UnsafePathError(`${file} is a symlink or directory; refusing to overwrite`, 'NOT_REGULAR')
    }
  } catch (error) {
    if (error instanceof UnsafePathError) throw error
    if (error.code !== 'ENOENT') throw error
  }
  const tmp = `${file}.${process.pid}.${tmpCounter++}.tmp`
  const handle = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
  return file
}

export const writeJson = (file, value) => writeAtomic(file, stableStringify(value))

export async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export async function hashFile(file) {
  return sha256(await readRegular(file, { encoding: null, root: path.dirname(path.resolve(file)) }))
}

export async function readIfExists(file, options) {
  try {
    return await readRegular(file, options)
  } catch (error) {
    // Only an absent file is "not there"; a permission error or any refusal stays an error.
    if (error instanceof UnsafePathError && error.absent) return null
    throw error
  }
}
