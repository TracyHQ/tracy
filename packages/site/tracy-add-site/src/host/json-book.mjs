/**
 * The one way this plugin writes its JSON books on disk (`uploads.json`, `site-tokens.json`,
 * `handovers.json`, the operation-result queue).
 *
 * Several imports run at once in the one dsh process. Until 20/10/2026 each book was written to
 * `<file>.<pid>.tmp` and renamed over: two runs shared that temp name, so one run's `rename`
 * moved the file away and the other's threw ENOENT, and a read-modify-write that started before
 * another run's write put the book back without that run's entry. So:
 *
 * - every write gets its own temp name (pid + random suffix, as in `apps/tracy-host/src/jobs.js`)
 *   and is still renamed over the book, so a crash leaves the old book whole;
 * - every read-modify-write of one file runs after the previous one on that file has finished
 *   (a per-file promise chain), so no caller's entry is lost. Within one process only: that
 *   process is the only writer of these books.
 *
 * Plain JavaScript, like `doors.mjs`, so `node --test` loads the host modules without a loader.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** @type {Map<string, Promise<unknown>>} */
const chains = new Map()

/**
 * Run `task` after every earlier task queued for `file`; a failed task does not block the next.
 * @template T
 * @param {string} file
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function serialised(file, task) {
  const previous = chains.get(file) ?? Promise.resolve()
  const run = previous.then(task, task)
  const settled = run.catch(() => undefined)
  chains.set(file, settled)
  void settled.then(() => {
    if (chains.get(file) === settled) chains.delete(file)
  })
  return run
}

/**
 * Write `text` to `file` through a temp file of its own, then rename it over `file`.
 * @param {string} file
 * @param {string} text
 * @param {number} [mode]
 */
export async function writeAtomic(file, text, mode) {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(temp, text, mode === undefined ? 'utf8' : { encoding: 'utf8', mode })
    await rename(temp, file)
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

/**
 * The book as an object; a missing or unreadable file reads as empty.
 * @template {object} Book
 * @param {string} file
 * @returns {Promise<Book>}
 */
export async function readBook(file) {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return /** @type {Book} */ (typeof parsed === 'object' && parsed !== null ? parsed : {})
  } catch {
    return /** @type {Book} */ ({})
  }
}

/**
 * Read the book, let `change` edit it, write it back — serialised per file. `change` returns
 * `false` to leave the file untouched (nothing to forget).
 * @template {object} Book
 * @param {string} file
 * @param {(book: Book) => boolean | void | Promise<boolean | void>} change
 * @returns {Promise<void>}
 */
export function updateBook(file, change) {
  return serialised(file, async () => {
    /** @type {Book} */
    const book = await readBook(file)
    if ((await change(book)) === false) return
    await writeAtomic(file, JSON.stringify(book, null, 2))
  })
}
