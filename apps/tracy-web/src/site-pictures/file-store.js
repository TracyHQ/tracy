// The picture bench's file store (#340): a folder on the container's disk where every file is named by the sha256 of
// its bytes, so a file is written once however many runs or frames use it, and a resumed run finds what it already
// wrote. Picture files a run made sit at the top (`<sha256>.<ext>`); owner photos copied in by the bench CLI for a run
// on a brief file sit under `photos/<sha256>`. Every read checks the hash again: a file changed on disk is never used.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HEX64 = /^[0-9a-f]{64}$/
const EXT = /^[a-z0-9]{1,5}$/

/** The store's folder: TRACY_PICTURE_BENCH_DIR, else a folder in the system's temporary directory. */
export const defaultStoreDir = (env = process.env) =>
  env.TRACY_PICTURE_BENCH_DIR || path.join(tmpdir(), 'tracy-picture-bench')

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** A file store over `dir`. */
export function fileStore(dir = defaultStoreDir()) {
  const at = (name) => path.join(dir, name)

  // Write once: a file already there under its hash holds these bytes; a half written one is never seen (rename).
  async function putAt(name, bytes) {
    try {
      const held = await readFile(at(name))
      if (sha256Hex(held) === sha256Hex(bytes)) return
    } catch {
      // not there yet
    }
    await mkdir(path.dirname(at(name)), { recursive: true })
    const temp = at(`${name}.${process.pid}.${Date.now()}.part`)
    await writeFile(temp, bytes)
    await rename(temp, at(name))
  }

  // The bytes under `name` when their hash is `sha256`, else null.
  async function readChecked(name, sha256) {
    try {
      const bytes = await readFile(at(name))
      return sha256Hex(bytes) === sha256 ? bytes : null
    } catch {
      return null
    }
  }

  return {
    dir,
    /** Store a picture file; returns its name in the store, `<sha256>.<ext>`. */
    async putPicture(bytes, ext) {
      if (!EXT.test(String(ext))) throw new Error(`not a file extension: ${ext}`)
      const name = `${sha256Hex(bytes)}.${ext}`
      await putAt(name, bytes)
      return name
    },
    /** A stored picture file by its name, checked against the hash in its name; null when missing or changed. */
    readPicture(name) {
      const sha = String(name).split('.')[0]
      if (!HEX64.test(sha) || !EXT.test(String(name).slice(sha.length + 1))) return Promise.resolve(null)
      return readChecked(name, sha)
    },
    /** Store an owner photo under its hash; returns the hash. */
    async putPhoto(bytes) {
      const sha = sha256Hex(bytes)
      await putAt(`photos/${sha}`, bytes)
      return sha
    },
    /** An owner photo by its hash, checked; null when missing or changed. */
    readPhoto(sha256) {
      return HEX64.test(String(sha256)) ? readChecked(`photos/${sha256}`, sha256) : Promise.resolve(null)
    }
  }
}
