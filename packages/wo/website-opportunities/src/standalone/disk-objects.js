/**
 * The standalone server's object store: files under one folder, at the key the open layer chose
 * (`places/<uuid>/<sha256>.<ext>`, `media/<origin>/<ab>/<sha256>.<ext>`, `opportunities/…`). Keys name their
 * content, so writing the same key twice writes the same bytes and needs no lock.
 *
 * The shape is the one `place-media-store.js` routes over: `{get, put, head, delete, publicUrl}`.
 */
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/
const MAX_KEY_LENGTH = 512

/** The file of `key` under `root`, or null when the key could leave the folder or is not a plain path. */
function fileOf(root, key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) return null
  const parts = key.split('/')
  if (!parts.every((p) => SEGMENT.test(p) && p !== '.' && p !== '..')) return null
  const file = join(root, ...parts)
  return file.startsWith(root + sep) ? file : null
}

/**
 * @param {{ dir: string }} options  The folder; created on the first write.
 * @returns {{
 *   get: (key: string) => Promise<Response | null>,
 *   put: (key: string, bytes: Uint8Array, type?: string) => Promise<boolean>,
 *   head: (key: string) => Promise<{ size: number } | null>,
 *   delete: (key: string) => Promise<void>,
 *   publicUrl: (key: string) => Promise<null>
 * }}
 */
export function createDiskObjects({ dir }) {
  if (typeof dir !== 'string' || dir === '') throw new Error('createDiskObjects: dir is required')
  const root = resolve(dir)

  async function head(key) {
    const file = fileOf(root, key)
    if (!file) return null
    try {
      const s = await stat(file)
      return s.isFile() ? { size: s.size } : null
    } catch {
      return null
    }
  }

  return {
    async get(key) {
      const found = await head(key)
      if (!found) return null
      const body = Readable.toWeb(createReadStream(fileOf(root, key)))
      return new Response(body, { status: 200, headers: { 'content-length': String(found.size) } })
    },
    async put(key, bytes) {
      const file = fileOf(root, key)
      if (!file) return false
      await mkdir(dirname(file), { recursive: true })
      // Written aside then renamed, so a reader never sees half a file.
      const temp = `${file}.${randomBytes(6).toString('hex')}.part`
      try {
        await writeFile(temp, bytes)
        await rename(temp, file)
        return true
      } catch {
        await rm(temp, { force: true }).catch(() => {})
        return false
      }
    },
    head,
    async delete(key) {
      const file = fileOf(root, key)
      if (file) await rm(file, { force: true })
    },
    // Served through the media door, never by a direct address.
    async publicUrl() {
      return null
    }
  }
}
