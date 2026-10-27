// joomla-generation.mjs — a dump directory is one generation (issue #73).
//
// joomla-dump.mjs puts several files in place (inventory.json, render-routes.json, site-config.json, dump.json and
// capture/). A directory cannot be swapped in one rename over files that consumers read by fixed name, so the
// completeness is recorded instead: dump.json (put in place last) carries a `generation` — a fresh id, the sha256
// of each JSON file and a digest of the capture/ tree. A reader compares the directory with it, so a dump
// interrupted between two renames, or written by two runs that interleaved, is refused by name and never read
// as one dump. A dump.json without `generation` is a dump made before this record: it is read as before.
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, openSync, closeSync, fstatSync, readSync, readdirSync, readFileSync, writeFileSync, renameSync, constants } from 'node:fs'
import { join } from 'node:path'

/** Created before the first file of a dump is replaced and removed after the last: a directory that has it was being published, or the writer died there. */
export const PUBLISHING_MARKER = '.joomla-dump.publishing'

/** Replaced by a fresh value before the first file of every publication attempt and never removed: a reader that saw two values around its reads lived through an attempt, even one that rolled back. */
export const EPOCH_FILE = '.joomla-dump.epoch'

/** The epoch of a dump directory; null when it has none (a dump made before it, or never published). */
export function readEpoch(dir) {
  const file = join(dir, EPOCH_FILE)
  if (!lstatSync(file, { throwIfNoEntry: false })) return null
  if (!lstatSync(file).isFile()) throw new Error(`${file}: not a regular file`)
  return readFileSync(file, 'utf8')
}

/** Put a fresh epoch in place (written beside it, then renamed: a reader sees the old value or the new one). */
export function bumpEpoch(dir) {
  const file = join(dir, EPOCH_FILE)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${randomUUID()}\n`, { flag: 'wx' })
  renameSync(tmp, file)
}

/** The JSON files a generation covers, in the order they are recorded. */
export const GENERATION_FILES = ['inventory.json', 'render-routes.json', 'site-config.json']
const MAX_TREE_ENTRIES = 200000
const sha = (data) => createHash('sha256').update(data).digest('hex')

/** The sha256 of a regular file read through a descriptor opened without following a link; null when absent. */
function hashFile(file) {
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw new Error(`${file}: ${e.code === 'ELOOP' ? 'not a regular file' : e.message}`)
  }
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`${file}: not a regular file`)
    const h = createHash('sha256')
    const buf = Buffer.alloc(1 << 20)
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n))
    return h.digest('hex')
  } finally {
    closeSync(fd)
  }
}

/** A digest of a directory tree: every path, and the sha256 of every regular file, in sorted order. A link or another kind of entry throws. */
export function treeDigest(root) {
  const lines = []
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      if (lines.length > MAX_TREE_ENTRIES) throw new Error(`${root}: more than ${MAX_TREE_ENTRIES} entries`)
      const path = join(dir, name)
      const at = lstatSync(path)
      const r = rel ? `${rel}/${name}` : name
      if (at.isDirectory()) {
        lines.push(`d ${r}`)
        walk(path, r)
      } else if (at.isFile()) lines.push(`f ${r} ${hashFile(path)}`)
      else throw new Error(`${path}: neither a regular file nor a directory`)
    }
  }
  walk(root, '')
  return sha(lines.join('\n'))
}

/** The record dump.json carries: `{ id, files: { name: sha256 }, capture: digest | null }` for the JSON texts about to be published and the staged capture/ tree. */
export function generationRecord(texts, id, { captureDir = null } = {}) {
  const files = {}
  for (const f of GENERATION_FILES) if (Object.hasOwn(texts, f)) files[f] = sha(texts[f])
  return { id, files, capture: captureDir ? treeDigest(captureDir) : null }
}

/**
 * Compare a dump directory with the `generation` of its dump.json: `{ checked: false }` when there is no
 * dump.json or it predates the record, `{ checked: true }` when the directory is that generation, else throws naming
 * the first difference (a file changed, missing or added; capture/ present or absent, or changed).
 */
export function verifyGeneration(dir, dumpJson) {
  // Published files are moved aside one by one; a dump.json that is gone while they move is indistinguishable from an old dump without a record, so the marker decides first.
  if (lstatSync(join(dir, PUBLISHING_MARKER), { throwIfNoEntry: false })) throw new Error(`${join(dir, PUBLISHING_MARKER)} exists: a dump is being written into ${dir}, or its writer died half way — wait for it or run joomla-dump.mjs again`)
  const gen = dumpJson?.generation
  if (!gen) return { checked: false }
  if (typeof gen !== 'object' || typeof gen.id !== 'string' || typeof gen.files !== 'object' || gen.files === null) throw new Error(`${join(dir, 'dump.json')}: generation is not { id, files, capture }`)
  const stale = 'is not the dump.json of this directory — a dump was interrupted or two dumps interleaved; run joomla-dump.mjs again'
  for (const f of GENERATION_FILES) {
    const h = hashFile(join(dir, f))
    if (h !== (gen.files[f] ?? null)) throw new Error(`${join(dir, f)} ${h === null ? 'is missing' : gen.files[f] ? 'differs from' : 'is not in'} generation ${gen.id}: dump.json ${stale}`)
  }
  let capture = null
  try {
    capture = treeDigest(join(dir, 'capture'))
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`${join(dir, 'capture')}: ${e.message}`)
  }
  if (!gen.capture && capture !== null) throw new Error(`${join(dir, 'capture')} is present but generation ${gen.id} recorded no capture: dump.json ${stale}`)
  if (gen.capture && capture !== gen.capture) throw new Error(`${join(dir, 'capture')} ${capture === null ? 'is missing from' : 'differs from'} generation ${gen.id}: dump.json ${stale}`)
  return { checked: true }
}

/**
 * The same check after a reader has consumed the directory: `first` is the dump.json it verified before reading and
 * `current` the dump.json now. A writer that published in between (another generation id, a marker, a file or capture/
 * that no longer matches) is refused — the reader never turns a mix of two generations into one spec-pack.
 */
export function recheckGeneration(dir, first, current, epoch) {
  if (epoch !== undefined && readEpoch(dir) !== epoch) throw new Error(`${join(dir, EPOCH_FILE)} changed while ${dir} was read: a dump publication started during the ingest (it may have been rolled back, the files read may still be a mix); run it again`)
  if (!first?.generation) return { checked: false }
  if (current?.generation?.id !== first.generation.id) throw new Error(`${join(dir, 'dump.json')} changed while it was read (generation ${first.generation.id} → ${current?.generation?.id ?? 'none'}): a dump was published during the ingest; run it again`)
  verifyGeneration(dir, current)
  return { checked: true }
}
