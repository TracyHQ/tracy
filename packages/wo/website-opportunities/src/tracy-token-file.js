/**
 * Where this server keeps its Tracy connection (`./tracy-connection.js`): one JSON record in one file, never in the
 * database and never sent to a browser.
 *
 * With `seal`/`open` (a host that seals secrets) the file holds the sealed record. Without them it holds the record in
 * plain text, readable only by the server's own user (mode 0600): restricted permissions, not encryption.
 *
 * Every write goes to a temporary file in the same folder and is renamed over the old one, so a crash leaves either
 * the old pair or the new pair, never half of each. A rotated refresh token that was lost would look like a replay to
 * Tracy and end the connection.
 */
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, open as openFile, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * @param {{ path: string, seal?: (plain: string) => Promise<string>, open?: (cipher: string) => Promise<string | null> }} options
 * @returns {{ read: () => Promise<object | null>, write: (record: object) => Promise<void>, clear: () => Promise<void>,
 *   sealed: boolean }}
 */
export function createTokenFile({ path, seal, open }) {
  const sealed = typeof seal === 'function' && typeof open === 'function'

  async function read() {
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
    const plain = sealed ? await open(text) : text
    if (!plain) return null
    try {
      return JSON.parse(plain)
    } catch {
      return null
    }
  }

  async function write(record) {
    const text = JSON.stringify(record)
    const body = sealed ? await seal(text) : text
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    const handle = await openFile(tmp, 'wx', 0o600)
    try {
      await handle.writeFile(body)
      await handle.sync()
    } finally {
      await handle.close()
    }
    // The umask cannot widen it, but an old file renamed over keeps nothing of its own.
    await chmod(tmp, 0o600)
    await rename(tmp, path)
  }

  async function clear() {
    await unlink(path).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
  }

  return { read, write, clear, sealed }
}
