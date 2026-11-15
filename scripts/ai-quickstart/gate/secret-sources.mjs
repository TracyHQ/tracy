// What the secret scan reads (ticket #586): every file that gets published, opened down to its text. A folder is
// read recursively; a zip archive entry by entry (`<archive>!<entry>`, an archive inside it opened the same way), its
// entries inflated in memory and checked against their CRC. A file is text unless its name is a picture, a font or a
// media file, or its first bytes hold a NUL byte: binary files are counted, not read.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { crc32, inflateRawSync } from 'node:zlib'
import { listEntries } from '../../../packages/cms/tracy-joomla-quickstart/scripts/zip-replace-entry.mjs'

const MEDIA =
  /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|tiff?|svgz|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|mov|pdf|psd)$/i
const ARCHIVE = /\.zip$/i

const isBinary = (bytes) => bytes.subarray(0, 8000).includes(0)

/** The bytes of one listed entry, checked against its recorded CRC-32 and size. */
function entryBytes(zip, entry) {
  const data = zip.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
  const bytes = entry.method === 0 ? Buffer.from(data) : entry.method === 8 ? inflateRawSync(data) : null
  if (!bytes) throw new Error('entry ' + entry.name + ' uses compression method ' + entry.method)
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc)
    throw new Error('entry ' + entry.name + ' does not match its recorded CRC-32 or size')
  return bytes
}

/**
 * Every readable text under one published name, as `{file, text}`; `counts` gets the files read and skipped.
 * @param {string} name the name the file is published as (findings are named by it)
 * @param {Buffer} bytes
 * @param {{texts: number, binary: number, archives: number}} counts
 */
export function* textsOf(name, bytes, counts) {
  if (ARCHIVE.test(name)) {
    counts.archives += 1
    for (const entry of listEntries(bytes)) {
      if (entry.name.endsWith('/')) continue
      yield* textsOf(name + '!' + entry.name, entryBytes(bytes, entry), counts)
    }
    return
  }
  if (MEDIA.test(name) || isBinary(bytes)) {
    counts.binary += 1
    return
  }
  counts.texts += 1
  yield { file: name, text: bytes.toString('utf8') }
}

/**
 * The files to publish, as `{name, path}`: a folder becomes each of its files, named relative to the folder's own
 * name (`1.0.11/mapping.json`); a file is named by its base name, unless `as` names it.
 */
export function publishedFiles(paths) {
  const out = []
  for (const p of paths) {
    const at = typeof p === 'string' ? p : p.path
    if (statSync(at).isDirectory()) {
      const base = path.basename(path.resolve(at))
      for (const rel of readdirSync(at, { recursive: true }).sort()) {
        const file = path.join(at, rel)
        if (statSync(file).isFile())
          out.push({ name: base + '/' + rel.split(path.sep).join('/'), path: file })
      }
    } else out.push({ name: (typeof p === 'string' ? null : p.as) ?? path.basename(at), path: at })
  }
  return out
}

/** Every text of the files to publish, read from disk. */
export function* textsOfFiles(files, counts) {
  for (const f of files) yield* textsOf(f.name, readFileSync(f.path), counts)
}
