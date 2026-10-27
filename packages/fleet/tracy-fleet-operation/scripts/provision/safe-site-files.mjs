/**
 * Reads and writes inside a folder an AI agent can write, from a process that is root.
 *
 * The site folder is bind-mounted read-write into the agent's container, so anything in it can be planted
 * by the agent: a symlink named `README.md`, a `docs` that points at another site, a hard link to a file it
 * cannot write. A root process that follows them reads and writes with root's power. The rules here are the
 * ones the import collector keeps:
 *
 *   - every path component from the trusted root down is `lstat`ed, and one that is a symlink, or not the
 *     type expected, REFUSES the operation (`Unsafe path in the site folder`) before anything is written;
 *   - a file is read through `O_NOFOLLOW`, and never past a size the caller can bear;
 *   - a file is written to a temporary file made EXCLUSIVELY next to its target and moved over it by
 *     `rename`, which replaces whatever stands there (a link, a hard link) instead of writing through it.
 *
 * ⚠ WHAT THIS DOES NOT CLOSE: an agent that swaps a directory for a link in the microseconds between a check
 * and the call it guards. Node has no `openat`, so the checks are repeated right before the steps that
 * matter, and the names of temporary files and directories are random; a complete answer is a collector that
 * does not run as root over this folder.
 */
import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'

/** The message of every refusal; `error.code` is `UNSAFE_PATH`. */
export const UNSAFE_PATH = 'Unsafe path in the site folder'

/** `O_NOFOLLOW` is POSIX; where it does not exist the lstat checks still stand. */
const NOFOLLOW = constants.O_NOFOLLOW ?? 0
/**
 * A read opens with `O_NONBLOCK`: opening a FIFO for reading waits for a writer, and a file the agent swapped
 * for one between the `lstat` and the `open` would hold this process forever. Regular files ignore the flag;
 * the type is checked on the open handle right after.
 */
const NONBLOCK = constants.O_NONBLOCK ?? 0
/** What `open` answers on a symlink when it was told not to follow one (Linux and macOS, then the BSDs). */
const IS_A_LINK = ['ELOOP', 'EMLINK']

const unsafe = () => Object.assign(new Error(UNSAFE_PATH), { code: 'UNSAFE_PATH' })
const tooLarge = () =>
  Object.assign(new Error('A file in the site folder is too large to read'), { code: 'TOO_LARGE' })

/** Whether an error is the refusal of an unsafe path. */
export const isUnsafe = (error) => error?.code === 'UNSAFE_PATH'

/** `lstat`, with an absent entry answered as null. */
export async function look(file) {
  try {
    return await lstat(file)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

/** The names of a `/`-separated path below a root. Nothing may climb out of it. */
function namesOf(relative) {
  if (path.isAbsolute(relative)) throw unsafe()
  const names = relative.split('/').filter((name) => name !== '' && name !== '.')
  if (names.includes('..')) throw unsafe()
  return names
}

/**
 * Check every component of `relative` below `root`. Each one that exists must be a plain directory; the last
 * must be a plain directory or a plain file, as `type` says. A symlink is neither. Reads and writes nothing.
 * @param {string} root the trusted folder the path starts from; it is not itself checked
 * @param {string} relative `/`-separated, below the root
 * @param {'directory' | 'file'} [type] what the last component must be, when it exists
 * @returns {Promise<import('node:fs').Stats | null>} the last component, or null when it (or a parent) is absent
 */
export async function checkPath(root, relative, type = 'directory') {
  const names = namesOf(relative)
  let at = root
  let found = null
  for (const [index, name] of names.entries()) {
    at = path.join(at, name)
    found = await look(at)
    if (found === null) return null
    const wanted = index === names.length - 1 ? type : 'directory'
    if (!(wanted === 'directory' ? found.isDirectory() : found.isFile())) throw unsafe()
  }
  return found
}

/**
 * Create what is missing of `relative` below `root`, one directory at a time, and refuse anything already
 * there that is not a plain directory.
 */
export async function ensureDirectory(root, relative) {
  let at = root
  for (const name of namesOf(relative)) {
    at = path.join(at, name)
    let found = await look(at)
    if (found === null) {
      try {
        await mkdir(at, { mode: 0o755 })
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
      }
      found = await lstat(at)
    }
    if (!found.isDirectory()) throw unsafe()
  }
}

/** Read a file the checks have already seen: never through a link, never more than `limit` bytes. */
async function readBounded(file, limit) {
  let handle
  try {
    handle = await open(file, constants.O_RDONLY | NOFOLLOW | NONBLOCK)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    if (IS_A_LINK.includes(error?.code)) throw unsafe()
    throw error
  }
  try {
    const found = await handle.stat()
    if (!found.isFile()) throw unsafe()
    if (found.size > limit) throw tooLarge()
    // One byte more than the size, so a file that grew while it was read is noticed, not truncated.
    const buffer = Buffer.alloc(found.size + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > found.size) throw tooLarge()
    return buffer.toString('utf8', 0, length)
  } finally {
    await handle.close()
  }
}

/**
 * Read a plain file below `root` as text. Refuses a link or any other type; null when it does not exist.
 * @param {{ limit?: number }} [options] the most bytes it may hold (default 8 MiB), else a `TOO_LARGE` error
 */
export async function readPlainFile(root, relative, { limit = 8 * 1024 * 1024 } = {}) {
  const found = await checkPath(root, relative, 'file')
  if (found === null) return null
  return readBounded(path.join(root, ...namesOf(relative)), limit)
}

/**
 * Whether the plain file at `relative` holds exactly `expected`. Anything else is false: absent, a link,
 * another type, other bytes. The size is compared first, so a file the agent made huge is never read.
 */
export async function sameContent(root, relative, expected) {
  try {
    const wanted = Buffer.byteLength(expected)
    const found = await checkPath(root, relative, 'file')
    if (found === null || found.size !== wanted) return false
    return (await readBounded(path.join(root, ...namesOf(relative)), wanted)) === expected
  } catch (error) {
    if (isUnsafe(error) || error?.code === 'TOO_LARGE') return false
    throw error
  }
}

/**
 * Write `data` to a temporary file next to `relative` (created exclusively, never through a link), and hand
 * back the two ways to end it: `commit` moves it over the target, `discard` throws it away. The target keeps
 * the owner and mode it had (the team's `AGENTS.md` stays the team's); a new file gets `mode`.
 * Refuses when something that is not a plain file stands at the target.
 * @returns {Promise<{ commit: () => Promise<void>, discard: () => Promise<void> }>}
 */
export async function stageFile(root, relative, data, { mode = 0o644 } = {}) {
  const names = namesOf(relative)
  const name = names.pop()
  if (name === undefined) throw unsafe()
  await ensureDirectory(root, names.join('/'))
  const directory = path.join(root, ...names)
  const target = path.join(directory, name)
  const existing = await look(target)
  if (existing !== null && !existing.isFile()) throw unsafe()
  const temporary = path.join(directory, `.${name}.${randomBytes(6).toString('hex')}.tmp`)
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW,
    mode
  )
  try {
    await handle.writeFile(data)
    await handle.chmod(existing === null ? mode : existing.mode & 0o7777)
    // As root this keeps the owner; as anyone else it is refused for a file that is not theirs, and ignored.
    if (existing !== null) await handle.chown(existing.uid, existing.gid).catch(() => {})
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(temporary, { force: true })
    throw error
  }
  await handle.close()
  const discard = () => rm(temporary, { force: true })
  return {
    commit: async () => {
      try {
        await rename(temporary, target)
      } catch (error) {
        await discard()
        throw error
      }
    },
    discard
  }
}

/** `stageFile`, then `commit`: the file is either what it was or all of `data`, never half written. */
export async function writeFileAtomic(root, relative, data, options) {
  const staged = await stageFile(root, relative, data, options)
  await staged.commit()
}
