/**
 * The sha256 of files inside a release archive, computed on their BYTES (`archives.js` hands text,
 * which changes a binary file): what a presentation lock's `files` map holds. Read for STAB-6.
 * Node built-ins only; the zip half reads the central directory the way `setting-proposal.js` does.
 */
import { createHash } from 'node:crypto'
import { gunzipSync, inflateRawSync } from 'node:zlib'

const sha256 = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex')

/** A NUL-terminated field of a tar header. */
const field = (/** @type {Buffer} */ b, /** @type {number} */ at, /** @type {number} */ length) => {
  const raw = b.subarray(at, at + length)
  const end = raw.indexOf(0)
  return raw.toString('utf8', 0, end < 0 ? length : end)
}

/**
 * sha256 of every regular file of a tar.gz whose path passes `test` (ustar, GNU long names, pax).
 * @param {Buffer} gzipped
 * @param {(name: string) => boolean} test
 * @returns {Map<string, string>}
 */
export function tarGzHashes(gzipped, test) {
  const bytes = gunzipSync(gzipped)
  const out = new Map()
  let at = 0
  let longName = null
  while (at + 512 <= bytes.length) {
    const header = bytes.subarray(at, at + 512)
    if (header.every((b) => b === 0)) break
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 48)
    const prefix = field(header, 345, 155)
    const body = bytes.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'L' || type === 'x') {
      const text = body.toString('utf8')
      longName =
        type === 'L' ? text.replace(/\0+$/, '') : (/(?:^|\n)\d+ path=([^\n]*)\n/.exec(text)?.[1] ?? longName)
      continue
    }
    const name = (
      longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100))
    ).replace(/^\.\//, '')
    longName = null
    if ((type === '0' || type === '\0') && test(name)) out.set(name, sha256(body))
  }
  return out
}

/**
 * sha256 of every file of a zip whose path passes `test` (stored and deflate entries).
 * @param {Buffer} bytes
 * @param {(name: string) => boolean} test
 * @returns {Map<string, string>}
 */
export function zipHashes(bytes, test) {
  const out = new Map()
  let eocd = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 0xffff - 22); at -= 1)
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      eocd = at
      break
    }
  if (eocd < 0) return out
  const count = bytes.readUInt16LE(eocd + 10)
  let at = bytes.readUInt32LE(eocd + 16)
  for (let i = 0; i < count && at + 46 <= bytes.length && bytes.readUInt32LE(at) === 0x02014b50; i += 1) {
    const nameLength = bytes.readUInt16LE(at + 28)
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength)
    const method = bytes.readUInt16LE(at + 10)
    const compressed = bytes.readUInt32LE(at + 20)
    const local = bytes.readUInt32LE(at + 42)
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
    if (name.endsWith('/') || !test(name)) continue
    const from = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const raw = bytes.subarray(from, from + compressed)
    if (method === 0) out.set(name, sha256(raw))
    else if (method === 8) out.set(name, sha256(inflateRawSync(raw)))
  }
  return out
}
