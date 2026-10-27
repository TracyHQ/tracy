// Shared helpers of the mail QA layer: paths, hashing, atomic writes, strict argument parsing and
// the product loader. File reads go through the shared bounded reader in tests/qa/lib.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BoundedReadError, MAX_LAYER_FILE_BYTES, readBoundedSync } from '../../lib/bounded-reader.mjs'

export const LAYER = 'mail'
export const LAYER_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(LAYER_DIR, '../../../..')
export const ORACLE_DIR = path.join(REPO_ROOT, 'tests/qa/oracles/mail')
export const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/qa/fixtures/mail')
export const CASES_DIR = path.join(LAYER_DIR, 'cases')
export const SRC_REL = 'apps/tracy-web/src'
export const TEST_REL = 'apps/tracy-web/test'

export const VERDICTS = Object.freeze(['PASS', 'FAIL', 'ENV', 'PENDING'])

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')
export const hashFile = (file) => sha256(readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES }))
export const readJson = (file) => {
  const text = readRegularFile(file, 'JSON file')
  if (text === null) throw new UsageError(`JSON file ${file} does not exist`)
  return JSON.parse(text)
}
export const stable = (value) => `${JSON.stringify(value, null, 2)}\n`

export class UsageError extends Error {
  constructor(message, cause = undefined) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'UsageError'
  }
}

/**
 * Write through a randomly named temp file created exclusively next to the target, then rename it
 * into place. A failed write or rename removes the temp file and throws: a half-written artifact is
 * never published under its final name.
 */
export function writeAtomic(file, content) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(8).toString('hex')}.tmp`
  let fd
  try {
    fd = openSync(tmp, 'wx', 0o600)
    writeFileSync(fd, content)
    closeSync(fd)
    fd = undefined
    renameSync(tmp, file)
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {}
    }
    try {
      unlinkSync(tmp)
    } catch {}
    throw error
  }
}

/**
 * Claim a brand-new output directory exclusively. An existing path of any kind (directory, file,
 * symlink, leftover of an earlier run) is refused; nothing is read, reused, revoked or overwritten.
 * Only the parent may be created on the way.
 */
export function claimOutputDir(dir) {
  mkdirSync(path.dirname(dir), { recursive: true })
  try {
    mkdirSync(dir)
  } catch (error) {
    if (error?.code === 'EEXIST')
      throw new UsageError(`output ${dir} already exists; a run writes only into a directory it creates`)
    throw new UsageError(`cannot create output ${dir}: ${error.message}`)
  }
}

/** A new file for an export (the --ledger path): created exclusively, never over an existing one. */
export function claimNewFile(file, what = 'file') {
  mkdirSync(path.dirname(file), { recursive: true })
  try {
    closeSync(openSync(file, 'wx', 0o600))
  } catch (error) {
    if (error?.code === 'EEXIST')
      throw new UsageError(`${what} ${file} already exists; it would not be overwritten or read back`)
    throw new UsageError(`cannot create ${what} ${file}: ${error.message}`)
  }
}

/**
 * Read a regular file through one descriptor opened without following symlinks and without blocking
 * on a FIFO; the type is checked with fstat on that same descriptor, so nothing can be swapped
 * between the check and the read.
 * @returns {Buffer|null} the bytes, or null when the path does not exist
 */
export function readRegularBytes(file, what = 'file') {
  try {
    return readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES, allowMissing: true })
  } catch (error) {
    if (!(error instanceof BoundedReadError)) throw error
    if (error.code === 'NOT_REGULAR' || error.code === 'REPLACED')
      throw new UsageError(`${what} ${file} must be a regular file (not a FIFO, device or directory)`, error)
    throw new UsageError(
      `${what} ${file} cannot be opened as a regular file (${error.message}; symlinks are refused)`,
      error
    )
  }
}

/** Same as readRegularBytes, decoded as UTF-8. */
export function readRegularFile(file, what = 'file') {
  return readRegularBytes(file, what)?.toString('utf8') ?? null
}

/**
 * Strict flag parser: every flag known, none repeated, values present. `spec` maps a flag to
 * `'bool'` or `'value'`.
 */
export function parseFlags(argv, spec) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new UsageError(`unexpected argument: ${arg}`)
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2)
    const kind = spec[name]
    if (!kind) throw new UsageError(`unknown flag: --${name}`)
    if (Object.hasOwn(out, name)) throw new UsageError(`flag repeated: --${name}`)
    if (kind === 'bool') {
      if (inline !== undefined) throw new UsageError(`--${name} takes no value`)
      out[name] = true
    } else {
      const value = inline ?? argv[++i]
      if (value === undefined || value === '' || value.startsWith('--'))
        throw new UsageError(`--${name} needs a value`)
      out[name] = value
    }
  }
  return out
}

/** Import one product module from `root` (the real tree, or a scratch copy). */
export function loadProduct(root, rel) {
  return import(pathToFileURL(path.join(root, SRC_REL, rel)).href)
}

export const utcStamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')

/** The commit the tree under test is on. */
export function productRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
